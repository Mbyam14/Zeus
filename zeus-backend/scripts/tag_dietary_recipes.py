"""
Scan all system recipes and set dietary_tags based on ingredient analysis.

Tags applied: Vegetarian, Vegan, Pescatarian, Gluten-Free, Dairy-Free

Usage:
    cd zeus-backend
    python scripts/tag_dietary_recipes.py [--dry-run] [--limit N]
"""

import sys, os, argparse
from collections import Counter

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from app.database import get_database
from app.utils.dietary_detection import detect_dietary_tags as compute_dietary_tags

SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000001"
BATCH_SIZE = 200

# ─── Main ─────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--limit",   type=int, default=0)
    args = parser.parse_args()

    db = get_database()

    # Fetch all system recipes
    print("Fetching system recipes...", flush=True)
    all_recipes = []
    offset = 0
    while True:
        batch = (db.table("recipes").select("id, ingredients")
                 .eq("user_id", SYSTEM_USER_ID)
                 .range(offset, offset + 999).execute())
        if not batch.data:
            break
        all_recipes.extend(batch.data)
        if len(batch.data) < 1000:
            break
        offset += 1000

    print(f"Found {len(all_recipes):,} system recipes\n")
    if args.limit:
        all_recipes = all_recipes[:args.limit]

    tag_counter = Counter()
    updates = []

    for recipe in all_recipes:
        ingredients = recipe.get("ingredients") or []
        tags = compute_dietary_tags(ingredients)
        tag_counter.update(tags)
        updates.append({"id": recipe["id"], "dietary_tags": tags})

    print("Tag distribution:")
    for tag, count in tag_counter.most_common():
        print(f"  {tag}: {count:,} ({count/len(all_recipes)*100:.1f}%)")

    if args.dry_run:
        print("\n[DRY RUN] No updates written.")
        return

    # Group recipes by tag-combo so we can do one UPDATE … WHERE id IN (…) per combo
    from collections import defaultdict
    groups: dict = defaultdict(list)
    for item in updates:
        key = tuple(sorted(item["dietary_tags"]))
        groups[key].append(item["id"])

    print(f"\nUpdating {len(updates):,} recipes across {len(groups)} tag combinations...", flush=True)
    updated = 0
    for tags_tuple, ids in groups.items():
        tags_list = list(tags_tuple)
        for i in range(0, len(ids), 500):
            chunk_ids = ids[i:i + 500]
            db.table("recipes").update({"dietary_tags": tags_list}).in_("id", chunk_ids).execute()
            updated += len(chunk_ids)
        print(f"  {tags_list or ['(none)']} -> {len(ids):,} recipes", flush=True)

    print(f"\nDone. Tagged {updated:,} recipes.")


if __name__ == "__main__":
    main()
