"""
Cooking method + time + style detection.

Scans a recipe's title and instructions (and optionally prep/cook time)
to derive three orthogonal tag sets:

  cooking_method : how the recipe is physically cooked (one_pot, sheet_pan, ...)
  time_tags      : derived from prep_time + cook_time (quick, weeknight, ...)
  style_tags     : occasion / pattern (make_ahead, meal_prep, comfort_food)

Design principle: conservative bias. False negatives (untagged recipe that
COULD be tagged) are fine — the recipe still surfaces through other
dimensions. False positives (wrongly-tagged recipe) pollute named
collections and erode user trust. So every cooking_method tag requires a
strong signal in the title or in the FIRST instruction.

Word-boundary regex matching (same approach as dietary_detection.py) prevents
spurious matches like "baked" inside "baked into the cake" not affecting a
no-bake dessert recipe.
"""

import re
from typing import Optional

# ─── Cooking method signal phrases ────────────────────────────────────────────
# Each tag maps to a list of phrases that MUST appear in title or first
# instruction to qualify. Sorted longest-first inside each list so multi-word
# phrases match before sub-words.

METHOD_SIGNALS: dict[str, list[str]] = {
    "one_pot": [
        "one-pot", "one pot", "single pot",
        "one-skillet", "one skillet", "single skillet",
        "one-pan",   # one-pan often is sheet pan, but title context decides
        "all in one pan",
    ],
    "sheet_pan": [
        "sheet-pan", "sheet pan", "sheetpan",
        "baking sheet", "rimmed baking sheet",
    ],
    "slow_cooker": [
        "slow cooker", "slow-cooker", "slow cook",
        "crock pot", "crockpot", "crock-pot",
    ],
    "instant_pot": [
        "instant pot", "instant-pot", "instapot",
        "pressure cooker", "pressure-cooker",
    ],
    "air_fryer": [
        "air fryer", "air-fryer", "air-fried", "air fried",
    ],
    "grilled": [
        "grilled", "barbecued", "bbq",
        "on the grill", "over the grill",
    ],
    "no_cook": [
        "no-cook", "no cook", "no-bake", "no bake",
        "raw recipe",
    ],
    "baked": [
        "baked",  # caught from title only - "bake at 350" in step 7 doesn't count
        "oven-baked", "oven baked",
    ],
    "stir_fry": [
        "stir-fry", "stir fry", "stir-fried", "stir fried",
        "wok",
    ],
}

# Compile word-boundary patterns once.
def _compile_signals(signals: list[str]) -> re.Pattern:
    sorted_signals = sorted(set(signals), key=len, reverse=True)
    return re.compile(
        r"\b(?:" + "|".join(re.escape(s) for s in sorted_signals) + r")\b",
        re.IGNORECASE,
    )

_METHOD_PATTERNS: dict[str, re.Pattern] = {
    method: _compile_signals(signals) for method, signals in METHOD_SIGNALS.items()
}


# ─── Style / occasion signal phrases ─────────────────────────────────────────

STYLE_SIGNALS: dict[str, list[str]] = {
    "make_ahead": [
        "make ahead", "make-ahead",
        "the night before", "day before",
        "prepare in advance", "prepare ahead",
        "refrigerate overnight",
    ],
    "meal_prep": [
        "meal prep", "meal-prep",
        "batch cook", "batch cooking", "batch-cook",
        "freezer friendly", "freezer-friendly",
        "freeze well", "freezes well",
    ],
    "comfort_food": [
        # Title-only signals — these are evocative words that wouldn't appear
        # as instruction terms.
        "creamy", "cheesy", "hearty",
        "ultimate comfort", "comfort food",
        "indulgent", "decadent", "rich and creamy",
    ],
}

_STYLE_PATTERNS: dict[str, re.Pattern] = {
    style: _compile_signals(signals) for style, signals in STYLE_SIGNALS.items()
}

# Methods that can match either title OR the first ~3 instructions
_METHODS_INSTRUCTION_ELIGIBLE = {
    "one_pot", "sheet_pan", "slow_cooker", "instant_pot", "air_fryer",
    "grilled", "stir_fry",
}

# Methods that only count if found in the title (avoid passing mentions)
_METHODS_TITLE_ONLY = {
    "baked", "no_cook",
}


# ─── Detection ────────────────────────────────────────────────────────────────

def _first_n_instructions(instructions: list, n: int = 3) -> str:
    """Concat first N instruction texts so signals near the start carry weight."""
    if not instructions:
        return ""
    pieces = []
    for inst in instructions[:n]:
        if isinstance(inst, dict):
            pieces.append(inst.get("instruction") or "")
        elif isinstance(inst, str):
            pieces.append(inst)
    return " ".join(pieces)


def detect_cooking_methods(title: str, instructions: list) -> list[str]:
    """
    Return list of cooking_method tags that apply.
    Conservative: only fires when title or early instructions explicitly say so.
    """
    title_lc = (title or "").lower()
    head_inst = _first_n_instructions(instructions, n=3).lower()

    out: list[str] = []
    for method, pat in _METHOD_PATTERNS.items():
        title_hit = bool(pat.search(title_lc))
        if method in _METHODS_TITLE_ONLY:
            if title_hit:
                out.append(method)
            continue
        if method in _METHODS_INSTRUCTION_ELIGIBLE:
            if title_hit or pat.search(head_inst):
                out.append(method)

    # Disambiguate: a sheet_pan recipe shouldn't also be marked one_pot.
    if "sheet_pan" in out and "one_pot" in out:
        out.remove("one_pot")

    return out


def detect_time_tags(
    prep_time: Optional[int],
    cook_time: Optional[int],
    difficulty: Optional[str],
    meal_type: Optional[list[str]],
) -> list[str]:
    """
    Derive time-based tags from numeric prep/cook fields.
    Skips silently when prep/cook are None (data quality issue, don't guess).
    """
    if prep_time is None and cook_time is None:
        return []
    total = (prep_time or 0) + (cook_time or 0)
    if total <= 0:
        return []

    tags: list[str] = []
    practical_types = {"breakfast", "lunch", "dinner", "snack"}
    has_practical = bool(meal_type) and any((t or "").lower() in practical_types for t in meal_type)
    diff_ok = (difficulty or "").lower() in {"easy", "medium", ""}

    if total <= 30:
        tags.append("quick")
    if total <= 45 and diff_ok and has_practical:
        tags.append("weeknight")
    if total > 90 or (difficulty or "").lower() == "hard":
        tags.append("weekend_project")
    return tags


def detect_style_tags(
    title: str,
    description: Optional[str],
    instructions: list,
) -> list[str]:
    """
    Detect occasion / style tags by scanning title + description + instructions.
    Comfort-food signals are title-only (to avoid 'rich' showing up in step text).
    """
    title_lc = (title or "").lower()
    desc_lc = (description or "").lower()
    full_inst = " ".join(
        (i.get("instruction") if isinstance(i, dict) else i) or ""
        for i in (instructions or [])
    ).lower()

    out: list[str] = []
    for style, pat in _STYLE_PATTERNS.items():
        if style == "comfort_food":
            if pat.search(title_lc):
                out.append(style)
            continue
        # Other styles can hit title, description, or instructions
        if pat.search(title_lc) or pat.search(desc_lc) or pat.search(full_inst):
            out.append(style)
    return out


def detect_all_tags(
    title: str,
    instructions: list,
    prep_time: Optional[int],
    cook_time: Optional[int],
    difficulty: Optional[str],
    meal_type: Optional[list[str]],
    description: Optional[str] = None,
) -> dict[str, list[str]]:
    """
    Convenience wrapper: returns {cooking_method, time_tags, style_tags} in one call.
    """
    return {
        "cooking_method": detect_cooking_methods(title, instructions),
        "time_tags":      detect_time_tags(prep_time, cook_time, difficulty, meal_type),
        "style_tags":     detect_style_tags(title, description, instructions),
    }
