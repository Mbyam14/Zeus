"""
USDA food matcher.

Takes a normalized ingredient name (from ingredient_normalizer.py) and finds
the best-matching row in `usda_foods`. The whole usda_foods table (~8k rows)
is loaded into memory once at first call so matching is in-process and fast.

Match result includes per-100g macros so the nutrition calculator can scale
them by gram weight.
"""

import re
from difflib import SequenceMatcher
from typing import Optional

from app.database import get_database

# Minimum similarity to accept a match. Below this, return None.
# Loosened from 0.55 -> 0.45 after observing ~40% match rate on real data;
# USDA names like "Beef, ground, lean..." don't share enough word overlap
# with parsed ingredient names like "lean ground beef" at the strict cutoff.
MATCH_THRESHOLD = 0.45

# Bonus added to scores for higher-quality USDA data types.
DATA_TYPE_BONUS = {
    "foundation": 0.10,
    "sr_legacy":  0.05,
    "fndds":      0.00,
}

# ─── In-memory cache ──────────────────────────────────────────────────────────

_foods_cache: Optional[list[dict]] = None
_match_cache: dict[str, Optional[dict]] = {}


def _load_foods() -> list[dict]:
    """Load every usda_foods row into memory (one-shot, then reused)."""
    global _foods_cache
    if _foods_cache is not None:
        return _foods_cache

    db = get_database()
    foods: list[dict] = []
    offset = 0
    while True:
        rows = (db.table("usda_foods")
                .select("fdc_id, name, data_type, "
                        "calories_per_100g, protein_per_100g, "
                        "carbs_per_100g, fat_per_100g")
                .range(offset, offset + 999).execute())
        if not rows.data:
            break
        for r in rows.data:
            r["_name_lower"] = r["name"].lower()
            r["_tokens"] = set(re.findall(r"[a-z]+", r["_name_lower"]))
            foods.append(r)
        if len(rows.data) < 1000:
            break
        offset += 1000

    _foods_cache = foods
    return foods


# ─── Scoring ──────────────────────────────────────────────────────────────────

def _tokens_overlap_score(q_tokens: set[str], cand_tokens: set[str]) -> float:
    """
    Fraction of query tokens that have a match in the candidate's tokens.
    Tolerant to plural/singular: "shallot" matches "shallots" because they
    share a 4+ character prefix.
    """
    if not q_tokens:
        return 0.0
    matched = 0
    for q in q_tokens:
        if q in cand_tokens:
            matched += 1
            continue
        if len(q) < 4:
            continue
        # Prefix-tolerant: shallot ↔ shallots, tomato ↔ tomatoes, leek ↔ leeks
        for c in cand_tokens:
            if abs(len(c) - len(q)) <= 3 and (c.startswith(q) or q.startswith(c)):
                matched += 1
                break
    return matched / len(q_tokens)


def _score(query: str, food: dict) -> float:
    """
    Combined similarity score for a query against one USDA food.
    Higher is better. Range roughly 0.0 - 1.1 (with data_type bonus).
    """
    cand = food["_name_lower"]

    # Token overlap with plural/singular tolerance
    q_tokens = set(re.findall(r"[a-z]+", query))
    token_overlap = _tokens_overlap_score(q_tokens, food["_tokens"])

    # SequenceMatcher catches subword/character similarity
    seq_score = SequenceMatcher(None, query, cand).ratio()

    # Heavier weight on token overlap (recipe ingredients are short noun phrases)
    base = 0.7 * token_overlap + 0.3 * seq_score

    # Prefer shorter USDA names when both score similarly — "Beef" beats
    # "Beef, brisket, separable lean and fat, all grades, raw"
    length_penalty = min(len(cand) / 200, 0.2)
    base -= length_penalty * 0.3

    base += DATA_TYPE_BONUS.get(food["data_type"], 0)
    return base


# ─── Public API ───────────────────────────────────────────────────────────────

def match_to_usda(normalized_name: str) -> Optional[dict]:
    """
    Find the best-matching USDA food entry for a normalized ingredient name.

    Returns dict with fields:
      fdc_id, name, data_type,
      calories_per_100g, protein_per_100g, carbs_per_100g, fat_per_100g,
      score        (the matching score)
    or None if no candidate clears MATCH_THRESHOLD.
    """
    if not normalized_name:
        return None

    key = normalized_name.lower().strip()
    if key in _match_cache:
        return _match_cache[key]

    foods = _load_foods()
    if not foods:
        _match_cache[key] = None
        return None

    # Optimization: narrow to foods that have at least one prefix-tolerant
    # token match (handles plural USDA names like "Shallots, raw" vs query "shallot").
    q_tokens = set(re.findall(r"[a-z]+", key))
    if q_tokens:
        def has_overlap(f: dict) -> bool:
            if f["_tokens"] & q_tokens:
                return True
            for q in q_tokens:
                if len(q) < 4:
                    continue
                for c in f["_tokens"]:
                    if abs(len(c) - len(q)) <= 3 and (c.startswith(q) or q.startswith(c)):
                        return True
            return False
        candidates = [f for f in foods if has_overlap(f)]
        if not candidates:
            candidates = foods
    else:
        candidates = foods

    best: Optional[dict] = None
    best_score = -1.0
    for f in candidates:
        s = _score(key, f)
        if s > best_score:
            best_score = s
            best = f

    if best is None or best_score < MATCH_THRESHOLD:
        _match_cache[key] = None
        return None

    result = {
        "fdc_id":           best["fdc_id"],
        "name":             best["name"],
        "data_type":        best["data_type"],
        "calories_per_100g": float(best["calories_per_100g"]),
        "protein_per_100g":  float(best["protein_per_100g"]),
        "carbs_per_100g":    float(best["carbs_per_100g"]),
        "fat_per_100g":      float(best["fat_per_100g"]),
        "score":             round(best_score, 3),
    }
    _match_cache[key] = result
    return result


def log_unmatched(normalized_name: str, original_name: str = "", recipe_id: Optional[str] = None) -> None:
    """
    Record a failed match in unmatched_ingredient_log for later manual mapping.
    Idempotent: increments occurrence_count if the normalized name already exists.
    """
    if not normalized_name:
        return
    db = get_database()
    # Try to find existing entry
    existing = (db.table("unmatched_ingredient_log")
                .select("id, occurrence_count")
                .eq("normalized_name", normalized_name)
                .limit(1).execute())
    if existing.data:
        row = existing.data[0]
        db.table("unmatched_ingredient_log").update({
            "occurrence_count": int(row["occurrence_count"]) + 1,
        }).eq("id", row["id"]).execute()
    else:
        db.table("unmatched_ingredient_log").insert({
            "normalized_name": normalized_name,
            "original_name":   original_name[:500] if original_name else None,
            "recipe_id":       recipe_id,
            "occurrence_count": 1,
        }).execute()


def clear_caches() -> None:
    """Reset both the foods cache and the match cache. For tests or hot-reload."""
    global _foods_cache, _match_cache
    _foods_cache = None
    _match_cache = {}
