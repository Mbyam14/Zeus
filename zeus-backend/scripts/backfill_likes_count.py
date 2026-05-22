"""
Backfill recipes.likes_count to match actual entries in recipe_likes.

The counter was never incremented in the existing like_recipe() flow, so the
column drifted away from reality. Run this once after deploying the fix in
recipe_service.like_recipe / unlike_recipe.

Usage:
  cd zeus-backend
  python scripts/backfill_likes_count.py
  python scripts/backfill_likes_count.py --dry-run
"""

import argparse
import os
import sys
from collections import Counter

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from app.database import get_database


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    db = get_database()

    # Tally likes per recipe (paginate to handle large tables)
    print("Counting recipe_likes rows...", flush=True)
    counts: Counter = Counter()
    offset = 0
    while True:
        rows = (db.table("recipe_likes").select("recipe_id")
                .range(offset, offset + 999).execute())
        if not rows.data:
            break
        for r in rows.data:
            counts[r["recipe_id"]] += 1
        if len(rows.data) < 1000:
            break
        offset += 1000

    print(f"Found likes for {len(counts):,} unique recipes\n")

    # Fetch all recipes' current likes_count
    print("Loading current likes_count values...", flush=True)
    current_counts: dict[str, int] = {}
    offset = 0
    while True:
        rows = (db.table("recipes").select("id, likes_count")
                .range(offset, offset + 999).execute())
        if not rows.data:
            break
        for r in rows.data:
            current_counts[r["id"]] = int(r.get("likes_count") or 0)
        if len(rows.data) < 1000:
            break
        offset += 1000

    print(f"Found {len(current_counts):,} recipes total")

    # Compute diffs
    needs_update: list[tuple[str, int, int]] = []
    for rid, current in current_counts.items():
        actual = counts.get(rid, 0)
        if current != actual:
            needs_update.append((rid, current, actual))

    print(f"Need to update {len(needs_update):,} recipes\n")

    if args.dry_run:
        print("[DRY RUN] Sample diffs:")
        for rid, current, actual in needs_update[:10]:
            print(f"  {rid[:8]}  {current} -> {actual}")
        return

    # Group by target count so we can batch-update efficiently.
    by_count: dict[int, list[str]] = {}
    for rid, _current, actual in needs_update:
        by_count.setdefault(actual, []).append(rid)

    print(f"Applying updates across {len(by_count)} unique counts...", flush=True)
    written = 0
    for target_count, ids in by_count.items():
        for i in range(0, len(ids), 500):
            chunk = ids[i:i + 500]
            db.table("recipes").update({"likes_count": target_count}).in_("id", chunk).execute()
            written += len(chunk)

    print(f"Updated {written:,} recipes.")


if __name__ == "__main__":
    main()
