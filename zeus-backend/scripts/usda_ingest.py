"""
Ingest USDA FoodData Central CSV data into the `usda_foods` table.

This is a one-time script. Run after migration 007 has been applied.

Setup:
  1. Download from https://fdc.nal.usda.gov/download-datasets
     - "SR Legacy" CSV (~7,800 foods)
     - "Foundation Foods" CSV (~200 foods, highest quality)
  2. Extract both ZIPs into zeus-backend/data/usda/
     Expected layout:
       data/usda/sr_legacy/food.csv
       data/usda/sr_legacy/food_nutrient.csv
       data/usda/sr_legacy/nutrient.csv         (shared, either folder works)
       data/usda/foundation/food.csv
       data/usda/foundation/food_nutrient.csv
       data/usda/foundation/nutrient.csv
  3. Run:
       cd zeus-backend
       python scripts/usda_ingest.py            (loads both datasets)
       python scripts/usda_ingest.py --dataset sr_legacy
       python scripts/usda_ingest.py --reset    (truncate usda_foods first)

USDA nutrient IDs we care about:
  1008 - Energy (kcal)            -> calories
  1003 - Protein (g)              -> protein
  1005 - Carbohydrate, by diff(g) -> carbs
  1004 - Total lipid (fat) (g)    -> fat
  1079 - Fiber (g)                -> fiber (optional)
  2000 - Sugars, total (g)        -> sugar (optional)
"""

import argparse
import csv
import os
import sys
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from app.database import get_database

# ─── Config ───────────────────────────────────────────────────────────────────

DATA_DIR = Path(__file__).parent.parent / "data" / "usda"
BATCH_SIZE = 500

NUTRIENT_IDS = {
    "calories": 1008,
    "protein":  1003,
    "carbs":    1005,
    "fat":      1004,
    "fiber":    1079,
    "sugar":    2000,
}

DATASET_DIRS = {
    "sr_legacy":  ("SR Legacy",     "sr_legacy"),
    "foundation": ("Foundation",    "foundation"),
}

# ─── Parsing ──────────────────────────────────────────────────────────────────

def find_csv(folder: Path, basename: str) -> Path | None:
    """Locate a CSV file, allowing for case differences or extra path nesting."""
    if not folder.exists():
        return None
    # Direct path
    direct = folder / basename
    if direct.exists():
        return direct
    # Recurse one level (USDA zips sometimes nest)
    for child in folder.iterdir():
        if child.is_dir():
            inner = child / basename
            if inner.exists():
                return inner
    return None


def load_dataset(folder: Path, data_type: str) -> list[dict]:
    """Parse food.csv + food_nutrient.csv from one USDA dataset folder."""
    food_csv      = find_csv(folder, "food.csv")
    food_nut_csv  = find_csv(folder, "food_nutrient.csv")

    if not food_csv or not food_nut_csv:
        print(f"  [skip] missing food.csv or food_nutrient.csv in {folder}")
        return []

    print(f"  Reading {food_csv}")

    # Step 1: load food.csv into a {fdc_id: {name, category}} dict
    foods: dict[int, dict] = {}
    with open(food_csv, "r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            try:
                fdc_id = int(row["fdc_id"])
            except (ValueError, KeyError):
                continue
            name = (row.get("description") or "").strip()
            if not name:
                continue
            foods[fdc_id] = {
                "fdc_id":    fdc_id,
                "name":      name,
                "category":  (row.get("food_category_id") or "").strip() or None,
                "data_type": data_type,
            }

    print(f"  Loaded {len(foods):,} food entries from food.csv")

    # Step 2: stream food_nutrient.csv, accumulating macros per fdc_id
    print(f"  Reading {food_nut_csv}")
    target_ids = set(NUTRIENT_IDS.values())
    nut_by_food: dict[int, dict[int, float]] = defaultdict(dict)

    with open(food_nut_csv, "r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            try:
                fdc_id = int(row["fdc_id"])
                nut_id = int(row["nutrient_id"])
            except (ValueError, KeyError):
                continue
            if nut_id not in target_ids:
                continue
            if fdc_id not in foods:
                continue
            try:
                amount = float(row.get("amount") or 0)
            except ValueError:
                continue
            nut_by_food[fdc_id][nut_id] = amount

    print(f"  Joined nutrients for {len(nut_by_food):,} foods")

    # Step 3: build final records, requiring all 4 core macros to be present
    records: list[dict] = []
    skipped_incomplete = 0
    for fdc_id, food in foods.items():
        nuts = nut_by_food.get(fdc_id) or {}
        cal  = nuts.get(NUTRIENT_IDS["calories"])
        prot = nuts.get(NUTRIENT_IDS["protein"])
        carb = nuts.get(NUTRIENT_IDS["carbs"])
        fat  = nuts.get(NUTRIENT_IDS["fat"])
        # USDA uses NULLs liberally; require non-None to consider the row usable.
        if cal is None or prot is None or carb is None or fat is None:
            skipped_incomplete += 1
            continue
        records.append({
            **food,
            "calories_per_100g": round(cal, 2),
            "protein_per_100g":  round(prot, 2),
            "carbs_per_100g":    round(carb, 2),
            "fat_per_100g":      round(fat, 2),
            "fiber_per_100g":    round(nuts[NUTRIENT_IDS["fiber"]], 2) if NUTRIENT_IDS["fiber"] in nuts else None,
            "sugar_per_100g":    round(nuts[NUTRIENT_IDS["sugar"]], 2) if NUTRIENT_IDS["sugar"] in nuts else None,
        })

    print(f"  Skipped {skipped_incomplete:,} foods missing one or more macros")
    print(f"  -> {len(records):,} complete entries to ingest")
    return records


# ─── Database ─────────────────────────────────────────────────────────────────

def upsert_batch(db, batch: list[dict]) -> None:
    """Insert a batch of records, ignoring duplicates by fdc_id."""
    if not batch:
        return
    db.table("usda_foods").upsert(batch, on_conflict="fdc_id").execute()


def reset_table(db) -> None:
    """Wipe all rows from usda_foods (used with --reset)."""
    print("Resetting usda_foods table...", flush=True)
    # Supabase doesn't support raw TRUNCATE through PostgREST, so delete in batches.
    while True:
        rows = db.table("usda_foods").select("id").limit(1000).execute()
        if not rows.data:
            break
        ids = [r["id"] for r in rows.data]
        db.table("usda_foods").delete().in_("id", ids).execute()
    print("Reset complete.")


# ─── Main ─────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Ingest USDA FoodData Central into usda_foods")
    parser.add_argument(
        "--dataset",
        choices=["all", "sr_legacy", "foundation"],
        default="all",
        help="Which dataset(s) to ingest",
    )
    parser.add_argument(
        "--reset",
        action="store_true",
        help="Truncate usda_foods before ingesting",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Parse files but don't write to DB",
    )
    args = parser.parse_args()

    if not DATA_DIR.exists():
        print(f"ERROR: {DATA_DIR} does not exist.")
        print("Download USDA FoodData Central CSVs from")
        print("  https://fdc.nal.usda.gov/download-datasets")
        print(f"and extract into {DATA_DIR}/sr_legacy/ and {DATA_DIR}/foundation/")
        sys.exit(1)

    db = get_database()

    if args.reset and not args.dry_run:
        reset_table(db)

    datasets = ["sr_legacy", "foundation"] if args.dataset == "all" else [args.dataset]

    total = 0
    for key in datasets:
        label, subdir = DATASET_DIRS[key]
        folder = DATA_DIR / subdir
        print(f"\n=== {label} ===")
        records = load_dataset(folder, key)

        if args.dry_run:
            print(f"  [DRY RUN] would insert {len(records):,} records")
            total += len(records)
            continue

        for i in range(0, len(records), BATCH_SIZE):
            chunk = records[i:i + BATCH_SIZE]
            upsert_batch(db, chunk)
            total += len(chunk)
            if (i // BATCH_SIZE) % 10 == 0:
                print(f"  Inserted {total:,} so far...", flush=True)

    print(f"\nDone. {total:,} USDA food entries {'parsed' if args.dry_run else 'in usda_foods'}.")


if __name__ == "__main__":
    main()
