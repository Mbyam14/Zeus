"""
Recalculate macros for every system recipe using the USDA pipeline.

Wipes existing calories/protein/carbs/fat first, then runs the same
nutrition_calculator the live create/update endpoints use. Resumable: writes
progress to recalc_progress.json so a Ctrl+C is safe.

Usage:
  cd zeus-backend
  python scripts/recalculate_all_macros.py
  python scripts/recalculate_all_macros.py --dry-run
  python scripts/recalculate_all_macros.py --limit 100
  python scripts/recalculate_all_macros.py --resume     (skip already-processed)
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
from app.services.nutrition_calculator import calculate_recipe_nutrition

SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000001"
PROGRESS_FILE = Path(__file__).parent / "recalc_progress.json"
SAVE_EVERY = 100                          # persist progress every N recipes
MAX_RETRIES = 4                           # per-DB-call retry on transient errors


def db_call_with_retry(fn, *, what: str):
    """Run a DB call with exponential backoff on transient network errors."""
    last_exc = None
    for attempt in range(MAX_RETRIES):
        try:
            return fn()
        except Exception as e:
            last_exc = e
            wait = 2 ** attempt
            print(f"    [retry {attempt+1}/{MAX_RETRIES}] {what} failed: {e!r} — sleeping {wait}s", flush=True)
            time.sleep(wait)
    raise last_exc


def load_progress() -> set:
    if PROGRESS_FILE.exists():
        return set(json.loads(PROGRESS_FILE.read_text()))
    return set()


def save_progress(processed: set) -> None:
    PROGRESS_FILE.write_text(json.dumps(list(processed)))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true",
                        help="Calculate but don't write to DB")
    parser.add_argument("--limit", type=int, default=0,
                        help="Stop after N recipes (0 = all)")
    parser.add_argument("--resume", action="store_true",
                        help="Skip recipes already in progress file")
    parser.add_argument("--no-reset", action="store_true",
                        help="Skip the initial NULL-out of existing macros")
    parser.add_argument("--only-null", action="store_true",
                        help="Only process recipes whose calories is currently NULL")
    args = parser.parse_args()

    db = get_database()

    # ── Step 1: optional reset ──────────────────────────────────────────────
    if not args.dry_run and not args.no_reset and not args.resume:
        print("Clearing existing macros for all system recipes...", flush=True)
        # Batch-update everything to NULL. Supabase doesn't support a single
        # bulk UPDATE WHERE so we paginate.
        cleared = 0
        offset = 0
        while True:
            rows = (db.table("recipes").select("id")
                    .eq("user_id", SYSTEM_USER_ID)
                    .range(offset, offset + 499).execute())
            if not rows.data:
                break
            ids = [r["id"] for r in rows.data]
            db.table("recipes").update({
                "calories": None,
                "protein_grams": None,
                "carbs_grams": None,
                "fat_grams": None,
            }).in_("id", ids).execute()
            cleared += len(ids)
            if cleared % 5000 == 0:
                print(f"  Cleared {cleared:,} so far...", flush=True)
            if len(rows.data) < 500:
                break
            offset += 500
        print(f"Cleared macros for {cleared:,} recipes.\n")

    # ── Step 2: fetch all system recipes ────────────────────────────────────
    # Note: order("id") gives stable pagination — without it, ongoing writes
    # to the table can shift rows between pages and cause skipped/duplicated rows.
    print("Loading recipes...", flush=True)
    all_recipes: list[dict] = []
    offset = 0
    while True:
        query = (db.table("recipes")
                 .select("id, title, ingredients, servings, calories")
                 .eq("user_id", SYSTEM_USER_ID)
                 .order("id")
                 .range(offset, offset + 999))
        if args.only_null:
            query = query.is_("calories", "null")
        rows = query.execute()
        if not rows.data:
            break
        all_recipes.extend(rows.data)
        if len(rows.data) < 1000:
            break
        offset += 1000

    # Defensive: drop any duplicates by id just in case
    seen = set()
    deduped = []
    for r in all_recipes:
        if r["id"] not in seen:
            seen.add(r["id"])
            deduped.append(r)
    if len(deduped) != len(all_recipes):
        print(f"  (deduped {len(all_recipes) - len(deduped):,} duplicate rows from pagination)")
    all_recipes = deduped

    filter_desc = " (NULL macros only)" if args.only_null else ""
    print(f"Found {len(all_recipes):,} system recipes{filter_desc}\n")

    processed = load_progress() if args.resume else set()
    if processed:
        print(f"Resuming: skipping {len(processed):,} already processed")
    if args.limit:
        all_recipes = all_recipes[:args.limit]

    # ── Step 3: calculate ───────────────────────────────────────────────────
    stats = Counter()
    unmatched_global = Counter()
    start = time.time()

    for i, recipe in enumerate(all_recipes):
        if recipe["id"] in processed:
            continue

        ingredients = recipe.get("ingredients") or []
        servings = recipe.get("servings") or 4

        nutrition = calculate_recipe_nutrition(
            ingredients,
            servings=servings,
            recipe_id=recipe["id"],
            log_misses=False,  # we'll log in bulk below
        )

        if nutrition is None:
            stats["unmatched"] += 1
            # Track top unmatched ingredients across the whole run
            from app.utils.ingredient_normalizer import normalize_ingredient_name
            for ing in ingredients:
                n = normalize_ingredient_name(ing.get("name") or "")
                if not n:
                    continue
                from app.utils.usda_matcher import match_to_usda
                if match_to_usda(n) is None:
                    unmatched_global[n] += 1
        else:
            stats["matched"] += 1
            if not args.dry_run:
                rid = recipe["id"]
                update_payload = {
                    "calories":      nutrition["calories"],
                    "protein_grams": nutrition["protein_grams"],
                    "carbs_grams":   nutrition["carbs_grams"],
                    "fat_grams":     nutrition["fat_grams"],
                }
                try:
                    db_call_with_retry(
                        lambda: db.table("recipes").update(update_payload).eq("id", rid).execute(),
                        what=f"update {rid[:8]}",
                    )
                except Exception as e:
                    print(f"  [skip] {rid[:8]} after retries: {e}", flush=True)
                    stats["update_failed"] += 1
                    # Don't mark processed so a future --resume can retry it
                    continue

        processed.add(recipe["id"])

        if (i + 1) % SAVE_EVERY == 0:
            save_progress(processed)
        if (i + 1) % 500 == 0:
            elapsed = time.time() - start
            rate = (i + 1) / elapsed if elapsed > 0 else 0
            print(f"  {i+1:>5,} / {len(all_recipes):,} processed "
                  f"({stats['matched']:,} matched, {stats['unmatched']:,} unmatched, "
                  f"{stats.get('update_failed', 0):,} update-fails) "
                  f"@ {rate:.1f}/sec", flush=True)

    save_progress(processed)

    # ── Step 4: summary ─────────────────────────────────────────────────────
    elapsed = time.time() - start
    print(f"\n{'[DRY RUN] ' if args.dry_run else ''}Recalculation complete in {elapsed:.0f}s")
    print(f"  Matched (macros set):   {stats['matched']:,}")
    print(f"  Unmatched (NULL macros): {stats['unmatched']:,}")
    total = stats['matched'] + stats['unmatched']
    if total:
        pct = stats['matched'] / total * 100
        print(f"  Coverage: {pct:.1f}%")

    if unmatched_global:
        print(f"\nTop 30 unmatched ingredients (consider mapping these):")
        for name, count in unmatched_global.most_common(30):
            print(f"  {count:>5,}  {name}")


if __name__ == "__main__":
    main()
