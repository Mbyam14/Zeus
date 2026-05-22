"""
Run the uniform tagging pipeline on every system recipe.

Recomputes:
  - dietary_tags       (existing detector)
  - cooking_method     (new)
  - time_tags          (new)
  - style_tags         (new)
  - cuisine_type       (only refines when NULL or "American")

Tags are written grouped by unique tag-combination to minimize DB roundtrips
(same approach as the existing tag_dietary_recipes.py script).

Usage:
  cd zeus-backend
  python scripts/retag_all_recipes.py
  python scripts/retag_all_recipes.py --dry-run
  python scripts/retag_all_recipes.py --limit 500
"""

import argparse
import json
import os
import sys
import time
from collections import Counter
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from app.database import get_database
from app.utils.dietary_detection import detect_dietary_tags
from app.utils.cooking_method_detection import detect_all_tags
from app.utils.cuisine_detection import detect_cuisine

SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000001"
BATCH_SIZE = 500
PROGRESS_FILE = Path(__file__).parent / "retag_progress.json"
SAVE_EVERY = 100
MAX_RETRIES = 5


def load_progress() -> set:
    if PROGRESS_FILE.exists():
        return set(json.loads(PROGRESS_FILE.read_text()))
    return set()


def save_progress(processed: set) -> None:
    PROGRESS_FILE.write_text(json.dumps(list(processed)))


def db_call_with_retry(fn, *, what: str):
    """Retry transient HTTP/network errors with exponential backoff.

    Supabase's HTTP/2 connection naturally terminates after ~20k streams; we
    catch the resulting ConnectionTerminated and let httpx open a new one
    on the next try.
    """
    last_exc = None
    for attempt in range(MAX_RETRIES):
        try:
            return fn()
        except Exception as e:
            last_exc = e
            wait = 2 ** attempt
            print(f"    [retry {attempt+1}/{MAX_RETRIES}] {what} failed: {type(e).__name__}: {e} — sleeping {wait}s",
                  flush=True)
            time.sleep(wait)
    raise last_exc


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--limit", type=int, default=0)
    parser.add_argument("--resume", action="store_true",
                        help="Skip recipes already in retag_progress.json")
    parser.add_argument(
        "--refine-cuisine-only-american",
        action="store_true",
        help="Only overwrite cuisine_type when current value is NULL or 'American' (default ON)",
    )
    args = parser.parse_args()

    processed = load_progress() if args.resume else set()
    if processed:
        print(f"Resuming: skipping {len(processed):,} already-processed recipes")

    db = get_database()

    # order("id") gives stable pagination — without it concurrent writes can
    # shift rows between pages, causing skipped/duplicated rows.
    print("Loading system recipes...", flush=True)
    all_recipes: list[dict] = []
    offset = 0
    while True:
        rows = (db.table("recipes")
                .select("id, title, description, ingredients, instructions, "
                        "servings, prep_time, cook_time, difficulty, meal_type, "
                        "cuisine_type")
                .eq("user_id", SYSTEM_USER_ID)
                .order("id")
                .range(offset, offset + 999).execute())
        if not rows.data:
            break
        all_recipes.extend(rows.data)
        if len(rows.data) < 1000:
            break
        offset += 1000

    # Defensive dedup in case pagination still hiccups.
    seen = set()
    deduped = []
    for r in all_recipes:
        if r["id"] not in seen:
            seen.add(r["id"])
            deduped.append(r)
    if len(deduped) != len(all_recipes):
        print(f"  (deduped {len(all_recipes) - len(deduped):,} duplicates)")
    all_recipes = deduped

    print(f"Found {len(all_recipes):,} system recipes\n")
    if args.limit:
        all_recipes = all_recipes[:args.limit]

    # ── Compute new tag values for each recipe ──────────────────────────────
    stats = Counter()
    method_dist = Counter()
    time_dist = Counter()
    style_dist = Counter()
    cuisine_changes: list[tuple[str, str | None, str]] = []
    updates: list[dict] = []

    for r in all_recipes:
        ingredients = r.get("ingredients") or []
        instructions = r.get("instructions") or []

        dietary = detect_dietary_tags(ingredients)
        method_time_style = detect_all_tags(
            title=r.get("title") or "",
            instructions=instructions,
            prep_time=r.get("prep_time"),
            cook_time=r.get("cook_time"),
            difficulty=r.get("difficulty"),
            meal_type=r.get("meal_type") or [],
            description=r.get("description"),
        )

        # Cuisine refinement: only when NULL or "American"
        current_cuisine = r.get("cuisine_type")
        new_cuisine = current_cuisine
        if not current_cuisine or current_cuisine.lower() == "american":
            detected = detect_cuisine(r.get("title") or "", ingredients)
            if detected:
                new_cuisine = detected
                if detected != current_cuisine:
                    cuisine_changes.append((r["id"], current_cuisine, detected))

        for t in method_time_style["cooking_method"]:
            method_dist[t] += 1
        for t in method_time_style["time_tags"]:
            time_dist[t] += 1
        for t in method_time_style["style_tags"]:
            style_dist[t] += 1

        updates.append({
            "id": r["id"],
            "dietary_tags":   dietary,
            "cooking_method": method_time_style["cooking_method"],
            "time_tags":      method_time_style["time_tags"],
            "style_tags":     method_time_style["style_tags"],
            "cuisine_type":   new_cuisine,
        })
        stats["processed"] += 1

    # ── Print distribution ──────────────────────────────────────────────────
    print(f"Distribution:")
    print(f"  Cooking methods:")
    for k, v in method_dist.most_common():
        print(f"    {k}: {v:,} ({v/len(updates)*100:.1f}%)")
    print(f"  Time tags:")
    for k, v in time_dist.most_common():
        print(f"    {k}: {v:,} ({v/len(updates)*100:.1f}%)")
    print(f"  Style tags:")
    for k, v in style_dist.most_common():
        print(f"    {k}: {v:,} ({v/len(updates)*100:.1f}%)")
    print(f"  Cuisine changes: {len(cuisine_changes):,}")

    if args.dry_run:
        print("\n[DRY RUN] No DB writes.")
        if cuisine_changes[:10]:
            print("Sample cuisine refinements:")
            for rid, old, new in cuisine_changes[:10]:
                print(f"  {old!r:15s} -> {new!r}  ({rid[:8]})")
        return

    # Filter out anything already in the progress file (--resume support).
    updates_to_apply = [u for u in updates if u["id"] not in processed]
    print(f"\nApplying updates to {len(updates_to_apply):,} recipes "
          f"({len(updates) - len(updates_to_apply):,} skipped via resume)...", flush=True)

    written = 0
    failed = 0
    start = time.time()
    for i, u in enumerate(updates_to_apply, start=1):
        payload = {
            "dietary_tags":   u["dietary_tags"],
            "cooking_method": u["cooking_method"],
            "time_tags":      u["time_tags"],
            "style_tags":     u["style_tags"],
            "cuisine_type":   u["cuisine_type"],
        }
        try:
            db_call_with_retry(
                lambda: db.table("recipes").update(payload).eq("id", u["id"]).execute(),
                what=f"update {u['id'][:8]}",
            )
            written += 1
            processed.add(u["id"])
        except Exception as e:
            failed += 1
            print(f"  [skip] {u['id'][:8]} after retries: {type(e).__name__}: {e}", flush=True)

        if i % SAVE_EVERY == 0:
            save_progress(processed)
        if i % 500 == 0:
            elapsed = time.time() - start
            rate = i / elapsed if elapsed > 0 else 0
            print(f"  {written:,} / {len(updates_to_apply):,} updated "
                  f"({failed:,} failed) @ {rate:.1f}/sec", flush=True)

    save_progress(processed)
    print(f"\nDone. Tagged {written:,} recipes ({failed:,} failed).")


if __name__ == "__main__":
    main()
