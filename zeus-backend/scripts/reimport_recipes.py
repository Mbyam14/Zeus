"""
Full recipe database reimport from AllRecipes ZIP.

Wipes all system-user recipes and reimports ~40k quality recipes
with correct meal_type classification from the AllRecipes category hierarchy.

After running this script, run tag_dietary_recipes.py to apply dietary tags:
    python scripts/tag_dietary_recipes.py

Usage:
    cd zeus-backend
    python scripts/reimport_recipes.py [--dry-run] [--limit N]
"""

import sys, os, zipfile, json, re, html, argparse, time, uuid
from collections import Counter

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from app.database import get_database

# ─── Config ───────────────────────────────────────────────────────────────────

SYSTEM_USER_ID   = "00000000-0000-0000-0000-000000000001"
ZIP_PATH         = os.path.join(os.path.dirname(__file__), "allrecipes_import", "recipes.zip")
IMAGE_BASE_URL   = "https://images.allrecipes.com/userphotos/{}.jpg"
BATCH_SIZE       = 100
MIN_RATING       = 4.0          # base cutoff
MIN_RATING_ROUND = 4.5          # stricter cutoff for round-number ratings (few reviewers)

# ─── Category → meal_type mapping ─────────────────────────────────────────────
# Key = AllRecipes top-level category (lowercase). Value = meal_type list.

CATEGORY_MAP = {
    # Practical meals
    "main dish":                    ["Dinner"],
    "meat and poultry":             ["Dinner"],
    "seafood":                      ["Dinner"],
    "pasta and noodles":            ["Dinner"],
    "world cuisine":                ["Dinner"],
    "bbq & grilling":               ["Dinner"],
    "bbq and grilling":             ["Dinner"],
    "everyday cooking":             ["Dinner"],
    "fruits and vegetables":        ["Dinner"],
    "soups, stews and chili":       ["Lunch", "Dinner"],
    "soups stews and chili":        ["Lunch", "Dinner"],
    "salad":                        ["Lunch", "Dinner"],
    "breakfast and brunch":         ["Breakfast"],
    "bread":                        ["Sides", "Snack"],
    "appetizers and snacks":        ["Snack"],
    "side dish":                    ["Sides"],
    "desserts":                     ["Dessert"],
    "holidays and events":          ["Dinner"],   # mostly main dishes
    "cuisine":                      ["Dinner"],
    "healthy":                      ["Dinner"],
}

# Categories to skip entirely
SKIP_CATEGORIES = {
    "trusted brands: recipes and tips",
    "trusted brands",
    "drinks",
    "beverages",
    "non-food",
}

# Non-edible / craft recipe signals in description
NON_EDIBLE_SIGNALS = ["non-edible", "non edible", "ornament", "play dough", "playdough",
                       "craft", "bird feeder", "soap", "candle"]

# Religious/ceremonial title signals — not practical meal-planning recipes
CEREMONIAL_TITLE_SIGNALS = ["communion", "eucharist", "eucharistic", "sacrament"]

# Spice-mix / seasoning-blend title pattern — recipe IS the seasoning, not a dish
# Excludes "with [seasoning]" dishes and Indian masala dishes (tikka, chana, paneer…)
SPICE_MIX_TITLE = re.compile(
    r"^(?!.*\bwith\b)(?!.*tikka\b)(?!.*\bchana\b)(?!.*\bpaneer\b)"
    r"(?!.*farro\b)(?!.*chickpea\b)(?!.*vegetable\b)(?!.*lentil\b)"
    r".*(\bseasoning\b|\bseasoning mix\b|\bseasoning blend\b"
    r"|\bspice mix\b|\bspice blend\b|\bdry rub\b|\bjerk rub\b"
    r"|\bherb blend\b|\bseasoning substitute\b|\brub no\b"
    r"|\bgaram masala\b|\bseasoning i{1,3}\b)[\s\W\d]*$",
    re.IGNORECASE
)

# ─── Helpers ──────────────────────────────────────────────────────────────────

def parse_iso_duration(s: str) -> int | None:
    """Convert PT1H30M / PT45M / PT0M to minutes. Returns None if unparseable."""
    if not s or s in ("0", "PT0S", "PT0M"):
        return None
    m = re.match(r"PT(?:(\d+)H)?(?:(\d+)M)?", str(s))
    if not m:
        return None
    hours   = int(m.group(1) or 0)
    minutes = int(m.group(2) or 0)
    total   = hours * 60 + minutes
    return total if total > 0 else None


def clean_title(s: str) -> str:
    return html.unescape(s or "").strip()


def is_round_rating(r: float) -> bool:
    """True if rating is a round number that suggests very few reviewers."""
    return abs(r - round(r * 2) / 2) < 0.01   # integer or x.5


def parse_nutrition(data: dict) -> dict:
    ni = data.get("nutritional_information") or {}
    def safe_float(key):
        try:
            raw = str(ni.get(key) or "0")
            v = float(re.sub(r"[^\d.]", "", raw) or "0")
            return v if v > 0 else None
        except (ValueError, TypeError):
            return None

    cal = safe_float("calories")
    return {
        "calories":      int(cal) if cal is not None else None,
        "protein_grams": safe_float("protein"),
        "carbs_grams":   safe_float("total_carbohydrate"),
        "fat_grams":     safe_float("total_fat"),
    }


def parse_ingredient(raw: str) -> dict:
    """Best-effort split of '2 cups flour' into {quantity, unit, name}."""
    raw = raw.strip()
    # Fraction / number at start
    m = re.match(
        r"^([\d\s/¼-¾⅐-⅞]+)"   # quantity
        r"\s*([a-zA-Z]+(?:\s+[a-zA-Z]+)?)??"         # unit (1-2 words, optional)
        r"\s+(.*)",                                    # name (rest)
        raw
    )
    if m:
        qty  = m.group(1).strip()
        unit = m.group(2) or ""
        name = m.group(3).strip() or raw
        # Sanity check: if "unit" looks like part of the name, fold it in
        KNOWN_UNITS = {
            "cup","cups","tablespoon","tablespoons","tbsp","teaspoon","teaspoons","tsp",
            "pound","pounds","lb","lbs","ounce","ounces","oz","gram","grams","g","kg",
            "ml","liter","liters","litre","litres","quart","quarts","pint","pints",
            "gallon","gallons","can","cans","package","packages","pkg","slice","slices",
            "clove","cloves","bunch","head","piece","pieces","sprig","sprigs",
            "pinch","dash","drop","stick","sticks",
        }
        if unit.lower() not in KNOWN_UNITS:
            name = ((unit + " " + name).strip()) if unit else name
            unit = ""
        return {"quantity": qty, "unit": unit, "name": name}
    return {"quantity": "", "unit": "", "name": raw}


def recipe_from_data(data: dict, meal_type: list) -> dict | None:
    title = clean_title(data.get("title") or data.get("name") or "")
    if not title:
        return None

    images = data.get("images") or []
    image_url = IMAGE_BASE_URL.format(images[0].replace(".jpg", "")) if images else None

    ingredients_raw = data.get("ingredients") or []
    ingredients = [parse_ingredient(i) for i in ingredients_raw if i and i.strip()]

    steps_raw = data.get("steps") or []
    instructions = []
    for s in steps_raw:
        if isinstance(s, dict):
            instructions.append({"step": s.get("step", len(instructions)+1),
                                  "instruction": s.get("instruction", "")})
        elif isinstance(s, str) and s.strip():
            instructions.append({"step": len(instructions)+1, "instruction": s.strip()})

    if not ingredients or not instructions:
        return None

    nutrition = parse_nutrition(data)
    prep_time = parse_iso_duration(data.get("prep_time"))
    cook_time = parse_iso_duration(data.get("cook_time"))

    # AllRecipes stores real servings at nutritional_information.servings as a
    # string. Parse the first integer (handles "8", "8-10", "Serves 8"). Default
    # 4 if missing/invalid — but most entries have it.
    ni = data.get("nutritional_information") or {}
    serv_raw = ni.get("servings")
    try:
        serv_m = re.search(r"\d+", str(serv_raw or ""))
        servings = int(serv_m.group(0)) if serv_m else 4
        if servings <= 0 or servings > 200:
            servings = 4
    except Exception:
        servings = 4

    # Difficulty heuristic based on ingredient count + total time
    total_min = (prep_time or 0) + (cook_time or 0)
    n_ing     = len(ingredients)
    if total_min > 120 or n_ing > 15:
        difficulty = "Hard"
    elif total_min > 45 or n_ing > 8:
        difficulty = "Medium"
    else:
        difficulty = "Easy"

    return {
        "id":             str(uuid.uuid4()),
        "user_id":        SYSTEM_USER_ID,
        "title":          title,
        "description":    clean_title(data.get("description") or ""),
        "ingredients":    ingredients,
        "instructions":   instructions,
        "servings":       servings,
        "prep_time":      prep_time,
        "cook_time":      cook_time,
        "meal_type":      meal_type,
        "dietary_tags":   [],
        "is_ai_generated": False,
        "likes_count":    0,
        "difficulty":     difficulty,
        "image_url":      image_url,
        **nutrition,
    }


# ─── Main ─────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run",      action="store_true", help="Parse without inserting")
    parser.add_argument("--limit",        type=int,  default=0,    help="Max recipes to import (0=all)")
    parser.add_argument("--skip-delete",  action="store_true", help="Skip deleting existing recipes")
    parser.add_argument("--category-only", type=str, default="",   help="Only import this top-level category (lowercase)")
    parser.add_argument("--min-rating",   type=float, default=0.0, help="Override MIN_RATING for this run")
    args = parser.parse_args()

    if args.min_rating:
        global MIN_RATING, MIN_RATING_ROUND
        MIN_RATING = args.min_rating
        MIN_RATING_ROUND = max(args.min_rating, MIN_RATING_ROUND)

    db = get_database()

    # ── 1. Delete existing system recipes ────────────────────────────────────
    if not args.dry_run and not args.skip_delete:
        if args.category_only:
            # Only delete recipes for the specific meal_type being re-imported
            meal_types_for_cat = CATEGORY_MAP.get(args.category_only.lower(), [])
            print(f"Deleting system recipes with meal_type overlapping {meal_types_for_cat}...", flush=True)
            deleted = 0
            while True:
                batch = (db.table("recipes").select("id")
                         .eq("user_id", SYSTEM_USER_ID)
                         .contains("meal_type", meal_types_for_cat[:1])
                         .limit(500).execute())
                if not batch.data:
                    break
                ids = [r["id"] for r in batch.data]
                db.table("recipes").delete().in_("id", ids).execute()
                deleted += len(ids)
                print(f"  Deleted {deleted} so far...", flush=True)
            print(f"Deleted {deleted} system recipes.\n")
        else:
            print("Deleting existing system recipes...", flush=True)
            deleted = 0
            while True:
                batch = db.table("recipes").select("id").eq("user_id", SYSTEM_USER_ID).limit(500).execute()
                if not batch.data:
                    break
                ids = [r["id"] for r in batch.data]
                db.table("recipes").delete().in_("id", ids).execute()
                deleted += len(ids)
                print(f"  Deleted {deleted} so far...", flush=True)
            print(f"Deleted {deleted} system recipes.\n")

    # ── 2. Read & filter ZIPped recipes ──────────────────────────────────────
    print(f"Opening {ZIP_PATH} ...", flush=True)
    cat_stats    = Counter()
    skip_stats   = Counter()
    imported     = 0
    batch_buf    = []
    total_seen   = 0

    with zipfile.ZipFile(ZIP_PATH) as zf:
        names = [n for n in zf.namelist() if n.endswith(".json") and n.startswith("recipes/")]
        print(f"Found {len(names):,} recipe JSONs\n")

        for name in names:
            if args.limit and imported >= args.limit:
                break

            try:
                with zf.open(name) as f:
                    data = json.load(f)
            except Exception:
                skip_stats["bad_json"] += 1
                continue

            total_seen += 1

            # ── Category check ────────────────────────────────────────────
            cats_raw  = data.get("categories") or []
            cats_lower = [c.lower() for c in cats_raw]

            if any(c in SKIP_CATEGORIES for c in cats_lower):
                skip_stats["skip_category"] += 1
                continue

            top_cat = cats_lower[0] if cats_lower else ""

            # If running category-only mode, skip everything else
            if args.category_only and top_cat != args.category_only.lower():
                continue

            meal_type = CATEGORY_MAP.get(top_cat)

            if meal_type is None:
                # Try second-level category
                meal_type = next(
                    (CATEGORY_MAP[c] for c in cats_lower if c in CATEGORY_MAP), None
                )

            if meal_type is None:
                skip_stats["unknown_category"] += 1
                continue

            # ── Image check ───────────────────────────────────────────────
            if not (data.get("images") or []):
                skip_stats["no_image"] += 1
                continue

            # ── Rating check ──────────────────────────────────────────────
            try:
                rating = float(data.get("rating") or 0)
            except (ValueError, TypeError):
                rating = 0.0

            threshold = MIN_RATING_ROUND if is_round_rating(rating) else MIN_RATING
            if rating < threshold:
                skip_stats["low_rating"] += 1
                continue

            # ── Non-edible check ──────────────────────────────────────────
            desc_lower = (data.get("description") or "").lower()
            if any(sig in desc_lower for sig in NON_EDIBLE_SIGNALS):
                skip_stats["non_edible"] += 1
                continue

            # ── Ceremonial / religious recipe check ───────────────────────
            title_lower = (data.get("title") or data.get("name") or "").lower()
            if any(sig in title_lower for sig in CEREMONIAL_TITLE_SIGNALS):
                skip_stats["ceremonial"] += 1
                continue

            # ── Spice mix / seasoning blend check ─────────────────────────
            title_check = clean_title(data.get("title") or data.get("name") or "")
            if SPICE_MIX_TITLE.match(title_check):
                skip_stats["spice_mix"] += 1
                continue

            # ── Nutrition zero-check (non-food recipes have all zeros) ────
            ni = data.get("nutritional_information") or {}
            try:
                raw_cal = str(ni.get("calories") or "0")
                cal = float(re.sub(r"[^\d.]", "", raw_cal) or "0")
            except (ValueError, TypeError):
                cal = 0.0
            if cal == 0:
                skip_stats["zero_nutrition"] += 1
                continue

            # ── Build record ──────────────────────────────────────────────
            record = recipe_from_data(data, meal_type)
            if record is None:
                skip_stats["bad_record"] += 1
                continue

            cat_stats[top_cat] += 1
            batch_buf.append(record)
            imported += 1

            # ── Batch insert ──────────────────────────────────────────────
            if not args.dry_run and len(batch_buf) >= BATCH_SIZE:
                db.table("recipes").insert(batch_buf).execute()
                batch_buf.clear()
                if imported % 1000 == 0:
                    print(f"  Imported {imported:,} recipes...", flush=True)

        # Flush remainder
        if not args.dry_run and batch_buf:
            db.table("recipes").insert(batch_buf).execute()
            batch_buf.clear()

    # ── 3. Summary ────────────────────────────────────────────────────────────
    print(f"\n{'[DRY RUN] ' if args.dry_run else ''}Import complete.")
    print(f"  Total JSONs seen : {total_seen:,}")
    print(f"  Imported         : {imported:,}")
    print(f"\nImported by top-level category:")
    for cat, count in cat_stats.most_common():
        print(f"  {cat!r}: {count:,}")
    print(f"\nSkipped:")
    for reason, count in skip_stats.most_common():
        print(f"  {reason}: {count:,}")


if __name__ == "__main__":
    main()
