"""
Fix recipe servings: the original import hardcoded servings=4 for every
recipe, which means every per-serving macro is off by a factor of
(4 / real_servings). This script:

  1. Reads the AllRecipes ZIP and extracts the *real* servings count from
     each recipe's `nutritional_information.servings` field.
  2. Matches DB recipes by title (within the system user) against the
     ZIP entries.
  3. For each match: updates `servings` to the real value AND rescales
     `calories / protein_grams / carbs_grams / fat_grams` by
     (4 / real_servings) so the per-serving values are correct without
     re-running the USDA matcher.

Usage:
  cd zeus-backend
  python scripts/fix_servings.py --dry-run     (preview, no DB writes)
  python scripts/fix_servings.py
  python scripts/fix_servings.py --resume      (skip already-fixed recipes)
"""

import argparse
import html
import json
import os
import re
import sys
import time
import zipfile
from collections import Counter, defaultdict
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from app.database import get_database

SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000001"
ZIP_PATH = os.path.join(os.path.dirname(__file__), "allrecipes_import", "recipes.zip")
ORIGINAL_HARDCODED = 4   # what the import script set servings to
PROGRESS_FILE = Path(__file__).parent / "fix_servings_progress.json"
MAX_RETRIES = 4


def clean_title(s: str) -> str:
    return html.unescape((s or "").strip())


def db_call_with_retry(fn, *, what: str):
    last_exc = None
    for attempt in range(MAX_RETRIES):
        try:
            return fn()
        except Exception as e:
            last_exc = e
            wait = 2 ** attempt
            print(f"    [retry {attempt+1}/{MAX_RETRIES}] {what} failed: {e!r} — sleep {wait}s", flush=True)
            time.sleep(wait)
    raise last_exc


def load_progress() -> set:
    if PROGRESS_FILE.exists():
        return set(json.loads(PROGRESS_FILE.read_text()))
    return set()


def save_progress(processed: set) -> None:
    PROGRESS_FILE.write_text(json.dumps(list(processed)))


def parse_servings(value) -> int | None:
    """Parse '20' or 20 or '20-24' or 'serves 8' into an int. None if unusable."""
    if value is None:
        return None
    s = str(value).strip()
    if not s:
        return None
    # Pull the first integer out of the string
    m = re.search(r"\d+", s)
    if not m:
        return None
    n = int(m.group(0))
    if n <= 0 or n > 200:  # sanity bounds
        return None
    return n


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--resume", action="store_true",
                        help="Skip recipes recorded in fix_servings_progress.json")
    parser.add_argument("--limit", type=int, default=0)
    args = parser.parse_args()

    db = get_database()

    # ── Step 1: build title -> servings map from the ZIP ────────────────────
    print(f"Reading {ZIP_PATH}...", flush=True)
    title_servings: dict[str, int] = {}
    title_collisions: Counter = Counter()
    bad_servings = 0

    with zipfile.ZipFile(ZIP_PATH) as zf:
        names = [n for n in zf.namelist() if n.endswith(".json") and n.startswith("recipes/")]
        print(f"Scanning {len(names):,} JSON files for servings...", flush=True)
        for i, name in enumerate(names):
            try:
                with zf.open(name) as f:
                    data = json.load(f)
            except Exception:
                continue
            title = clean_title(data.get("title") or data.get("name") or "")
            if not title:
                continue
            ni = data.get("nutritional_information") or {}
            servings = parse_servings(ni.get("servings"))
            if servings is None:
                bad_servings += 1
                continue
            # If the same title appears multiple times in the ZIP, keep the
            # first one but track the collision count.
            if title in title_servings:
                title_collisions[title] += 1
                continue
            title_servings[title] = servings
            if (i + 1) % 10000 == 0:
                print(f"  scanned {i+1:,}...", flush=True)

    print(f"  {len(title_servings):,} unique titles with valid servings")
    print(f"  {sum(title_collisions.values()):,} duplicate titles in source (first kept)")
    print(f"  {bad_servings:,} entries skipped — no usable servings field")

    # ── Step 2: fetch all DB recipes ────────────────────────────────────────
    print("\nLoading DB recipes...", flush=True)
    all_recipes: list[dict] = []
    offset = 0
    while True:
        rows = (db.table("recipes")
                .select("id, title, servings, calories, protein_grams, carbs_grams, fat_grams")
                .eq("user_id", SYSTEM_USER_ID)
                .order("id")
                .range(offset, offset + 999).execute())
        if not rows.data:
            break
        all_recipes.extend(rows.data)
        if len(rows.data) < 1000:
            break
        offset += 1000

    print(f"Found {len(all_recipes):,} system recipes\n")
    processed = load_progress() if args.resume else set()
    if processed:
        print(f"Resuming: skipping {len(processed):,} already-processed recipes")
    if args.limit:
        all_recipes = all_recipes[:args.limit]

    # ── Step 3: rescale and update ──────────────────────────────────────────
    stats = Counter()
    sample_changes = []
    start = time.time()

    for i, r in enumerate(all_recipes):
        if r["id"] in processed:
            continue
        title = (r.get("title") or "").strip()
        real_serv = title_servings.get(title)
        if real_serv is None:
            stats["no_match"] += 1
            continue
        if real_serv == ORIGINAL_HARDCODED:
            stats["unchanged"] += 1
            processed.add(r["id"])
            continue

        # Rescale per-serving macros: stored_cal was total_cal / 4. We want
        # corrected_cal = total_cal / real_serv = stored_cal * 4 / real_serv.
        scale = ORIGINAL_HARDCODED / real_serv
        update = {"servings": real_serv}
        for col in ("calories", "protein_grams", "carbs_grams", "fat_grams"):
            v = r.get(col)
            if v is None:
                continue
            new_v = v * scale
            if col == "calories":
                update[col] = int(round(new_v))
            else:
                # NUMERIC(5,1) — clamp just in case
                update[col] = min(round(new_v, 1), 9999.9)

        if len(sample_changes) < 8 and r.get("calories"):
            sample_changes.append((title, r["servings"], real_serv,
                                   r.get("calories"), update.get("calories")))

        if not args.dry_run:
            try:
                db_call_with_retry(
                    lambda: db.table("recipes").update(update).eq("id", r["id"]).execute(),
                    what=f"update {r['id'][:8]}",
                )
                stats["updated"] += 1
                processed.add(r["id"])
            except Exception as e:
                stats["failed"] += 1
                print(f"  [skip] {r['id'][:8]} after retries: {e}", flush=True)
        else:
            stats["would_update"] += 1
            processed.add(r["id"])

        if (i + 1) % 500 == 0:
            elapsed = time.time() - start
            rate = (i + 1) / elapsed if elapsed > 0 else 0
            print(f"  {i+1:,} / {len(all_recipes):,} processed "
                  f"({stats.get('updated', 0):,} updated, {stats.get('unchanged', 0):,} unchanged, "
                  f"{stats.get('no_match', 0):,} no-match) @ {rate:.1f}/sec",
                  flush=True)
            save_progress(processed)

    save_progress(processed)

    # ── Step 4: report ──────────────────────────────────────────────────────
    print(f"\n{'[DRY RUN] ' if args.dry_run else ''}Done in {time.time() - start:.0f}s")
    for k, v in stats.most_common():
        print(f"  {k}: {v:,}")

    if sample_changes:
        print("\nSample changes (title | old_servings -> new_servings | old_cal -> new_cal):")
        for title, old_s, new_s, old_c, new_c in sample_changes:
            print(f"  {title[:50]:50s} | {old_s} -> {new_s} | {old_c} -> {new_c}")


if __name__ == "__main__":
    main()
