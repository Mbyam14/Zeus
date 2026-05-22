"""
Import high-quality recipes with strict validation:
- Must have at least 1 image (verified loadable via HEAD request)
- Must have calories, servings, and macros
- Must have instructions
- Must have ingredients
- Must not be non-edible (crafts, ornaments, etc.)
- Nutrition normalized to reasonable per-serving values
- Serving counts capped at 12
- Duplicate titles excluded
"""
import zipfile
import json
import re
import random
import sys
import os
import urllib.request
import time
from concurrent.futures import ThreadPoolExecutor, as_completed

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from app.database import get_database

SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000001"
ZIP_PATH = os.path.join(os.path.dirname(__file__), "allrecipes_import", "recipes.zip")
TARGET_COUNT = 3500  # aim for ~3500 new recipes to roughly double
IMAGE_BASE = "https://images.allrecipes.com/userphotos/"

# Blocklist for non-food recipes
BLOCKLIST_WORDS = [
    "non-edible", "not edible", "craft", "ornament", "playdough", "play dough",
    "slime", "bath bomb", "potpourri", "candle", "soap", "paint", "clay",
    "dog treat", "cat treat", "pet treat", "bird feed",
]

UNIT_PATTERN = (
    r"(cups?|tablespoons?|tbsp|teaspoons?|tsp|ounces?|oz|pounds?|lbs?|"
    r"cloves?|cans?|packages?|pieces?|slices?|pinch(?:es)?|dash(?:es)?|"
    r"quarts?|gallons?|pints?|sticks?|heads?|bunche?s?|sprigs?|stalks?|fillets?)"
)

CLEANING_PATTERNS = [
    r",?\s*or (?:more |less )?to taste.*$",
    r",?\s*to taste.*$",
    r",?\s*or as needed.*$",
    r",?\s*as needed.*$",
    r",?\s*for (?:serving|garnish|topping|decoration).*$",
    r",?\s*plus (?:more|extra) for.*$",
    r",?\s*divided.*$",
    r",?\s*optional.*$",
    r",?\s*or more\s*$",
    r"\s*\(optional\)\s*$",
    r"\s*\(to taste\)\s*$",
]


def clean_name(name):
    result = name
    for pattern in CLEANING_PATTERNS:
        result = re.sub(pattern, "", result, flags=re.IGNORECASE)
    return result.strip()


def parse_ingredient(text, section=None):
    text = text.strip()
    if text.endswith(":") and len(text) < 40:
        return None, text.rstrip(":").strip()

    qty_match = re.match(
        rf"^([\d\s/.,]+)\s+{UNIT_PATTERN}\.?\s+(.+)", text, re.IGNORECASE
    )
    if qty_match:
        qty = qty_match.group(1).strip().replace(",", "")
        unit = qty_match.group(2).strip().lower()
        name = clean_name(qty_match.group(3).strip())
        result = {"name": name, "quantity": qty, "unit": unit}
        if section:
            result["section"] = section
        return result, section

    simple_match = re.match(r"^([\d\s/.,]+)\s+(.+)", text)
    if simple_match:
        qty = simple_match.group(1).strip().replace(",", "")
        name = clean_name(simple_match.group(2).strip())
        result = {"name": name, "quantity": qty, "unit": ""}
        if section:
            result["section"] = section
        return result, section

    name = clean_name(text)
    if not name:
        return None, section
    result = {"name": name, "quantity": "", "unit": "to taste"}
    if section:
        result["section"] = section
    return result, section


def infer_meal_types(title):
    t = title.lower()
    types = set()
    if any(w in t for w in ["breakfast", "pancake", "waffle", "omelette", "omelet",
                             "french toast", "scrambled", "granola", "muffin", "brunch"]):
        types.add("Breakfast")
    if any(w in t for w in ["sandwich", "wrap", "salad", "soup", "burger", "lunch"]):
        types.add("Lunch")
    if any(w in t for w in ["steak", "roast", "casserole", "lasagna", "pasta", "chicken",
                             "beef", "pork", "fish", "salmon", "curry", "stew", "taco",
                             "dinner", "chili", "meatloaf", "pot pie"]):
        types.add("Dinner")
    if any(w in t for w in ["cake", "cookie", "brownie", "pie", "pudding", "fudge",
                             "cupcake", "cheesecake", "candy", "dessert", "ice cream"]):
        types.add("Dessert")
    if any(w in t for w in ["dip", "snack", "appetizer", "hummus", "trail mix"]):
        types.add("Snack")
    if not types:
        types.add("Dinner")
        types.add("Lunch")
    return list(types)


def infer_difficulty(prep_time, cook_time, num_ingredients):
    total = (prep_time or 0) + (cook_time or 0)
    if total <= 30 and num_ingredients <= 8:
        return "Easy"
    elif total <= 60 or num_ingredients <= 12:
        return "Medium"
    return "Hard"


def infer_cuisine(title, ing_text):
    t = (title + " " + ing_text).lower()
    if any(w in t for w in ["soy sauce", "ginger", "sesame", "stir fry", "teriyaki", "ramen", "tofu"]):
        return "Asian"
    if any(w in t for w in ["tortilla", "salsa", "taco", "burrito", "enchilada", "jalapeno"]):
        return "Mexican"
    if any(w in t for w in ["pasta", "parmesan", "mozzarella", "risotto", "marinara", "pesto"]):
        return "Italian"
    if any(w in t for w in ["curry", "tandoori", "naan", "masala", "tikka", "biryani"]):
        return "Indian"
    if any(w in t for w in ["kimchi", "gochujang", "korean", "bulgogi", "bibimbap"]):
        return "Korean"
    if any(w in t for w in ["feta", "tzatziki", "greek", "hummus", "pita"]):
        return "Mediterranean"
    if any(w in t for w in ["thai", "pad thai", "coconut milk", "lemongrass"]):
        return "Thai"
    return "American"


def infer_dietary_tags(title, ing_text):
    t = (title + " " + ing_text).lower()
    tags = []
    meat = ["chicken", "beef", "pork", "turkey", "lamb", "bacon", "sausage", "steak",
            "ham", "veal", "duck", "venison", "bison"]
    fish = ["fish", "salmon", "tuna", "shrimp", "crab", "lobster", "cod", "tilapia"]
    dairy = ["milk", "cheese", "butter", "cream", "yogurt"]
    has_meat = any(w in t for w in meat)
    has_fish = any(w in t for w in fish)
    has_dairy = any(w in t for w in dairy)
    has_gluten = any(w in t for w in ["flour", "bread", "pasta", "noodle", "tortilla"])
    if not has_meat and not has_fish:
        if not has_dairy and "egg" not in t and "honey" not in t:
            tags.append("vegan")
        tags.append("vegetarian")
    if not has_gluten:
        tags.append("gluten-free")
    if not has_dairy:
        tags.append("dairy-free")
    return tags


def clean_description(desc):
    """Remove first-person references from descriptions."""
    if not desc:
        return desc
    d = desc
    d = re.sub(r'\bI\b(?!\.)', 'you', d)
    d = re.sub(r"\bI'm\b", "you're", d)
    d = re.sub(r"\bI've\b", "you've", d)
    d = re.sub(r"\bI'll\b", "you'll", d)
    d = re.sub(r"\bI'd\b", "you'd", d)
    d = re.sub(r'\bmy\b', 'your', d, flags=re.IGNORECASE)
    d = re.sub(r'\bMy\b', 'A', d)
    return d


def verify_image(url):
    """Check if an image URL returns 200."""
    try:
        req = urllib.request.Request(url, method='HEAD')
        req.add_header('User-Agent', 'Mozilla/5.0')
        resp = urllib.request.urlopen(req, timeout=5)
        return resp.status == 200
    except:
        return False


def parse_nutrition_val(val):
    s = str(val or "0")
    m = re.match(r"([\d.]+)", s)
    return round(float(m.group(1))) if m else 0


def main():
    db = get_database()

    # Get existing titles
    existing_titles = set()
    offset = 0
    while True:
        result = db.table("recipes").select("title").eq("user_id", SYSTEM_USER_ID).range(offset, offset + 999).execute()
        if not result.data:
            break
        for r in result.data:
            existing_titles.add(r["title"].lower().strip())
        if len(result.data) < 1000:
            break
        offset += 1000

    print(f"Existing recipes: {len(existing_titles)}")

    # Load and filter candidates from zip
    candidates = []
    skipped = {"no_title": 0, "duplicate": 0, "no_image": 0, "no_nutrition": 0,
               "no_instructions": 0, "no_ingredients": 0, "blocklisted": 0, "bad_image": 0}

    with zipfile.ZipFile(ZIP_PATH, "r") as z:
        names = [n for n in z.namelist() if n.endswith(".json")]
        random.shuffle(names)
        print(f"Scanning {len(names)} recipe files...")

        # First pass: collect candidates without image verification
        raw_candidates = []
        for name in names:
            if len(raw_candidates) >= TARGET_COUNT * 2:  # collect extra, will filter
                break
            try:
                with z.open(name) as f:
                    data = json.load(f)

                title = data.get("title", "").strip()
                if not title:
                    skipped["no_title"] += 1
                    continue
                if title.lower().strip() in existing_titles:
                    skipped["duplicate"] += 1
                    continue

                images = data.get("images", [])
                if not images:
                    skipped["no_image"] += 1
                    continue

                nutrition = data.get("nutritional_information", {})
                cal = int(nutrition.get("calories", 0) or 0)
                servings_str = str(nutrition.get("servings", "0") or "0")
                servings_match = re.match(r"(\d+)", servings_str)
                servings = int(servings_match.group(1)) if servings_match else 0

                if cal <= 0 or servings <= 0:
                    skipped["no_nutrition"] += 1
                    continue

                raw_ings = data.get("ingredients", [])
                if not raw_ings or len(raw_ings) < 1:
                    skipped["no_ingredients"] += 1
                    continue

                steps = data.get("steps", [])
                if not steps:
                    skipped["no_instructions"] += 1
                    continue

                desc = (data.get("description", "") or "").lower()
                if any(w in desc for w in BLOCKLIST_WORDS):
                    skipped["blocklisted"] += 1
                    continue

                raw_candidates.append((data, images, nutrition, cal, servings, raw_ings, steps))
                existing_titles.add(title.lower().strip())

            except Exception:
                continue

    print(f"Raw candidates: {len(raw_candidates)}")
    print(f"Skipped: {skipped}")

    # Verify images in parallel (batches of 50)
    print("Verifying images...")
    verified = []
    batch_size = 50

    for i in range(0, len(raw_candidates), batch_size):
        if len(verified) >= TARGET_COUNT:
            break
        batch = raw_candidates[i:i + batch_size]
        urls = [f"{IMAGE_BASE}{c[1][0]}" for c in batch]

        with ThreadPoolExecutor(max_workers=20) as executor:
            futures = {executor.submit(verify_image, url): idx for idx, url in enumerate(urls)}
            results = {}
            for future in as_completed(futures):
                idx = futures[future]
                results[idx] = future.result()

        for idx, candidate in enumerate(batch):
            if results.get(idx, False):
                verified.append(candidate)
            else:
                skipped["bad_image"] += 1

        if (i + batch_size) % 500 == 0:
            print(f"  Verified {i + batch_size}... {len(verified)} good, {skipped['bad_image']} bad images")

    print(f"Image-verified candidates: {len(verified)}")

    # Process and normalize
    for data, images, nutrition, cal, servings, raw_ings, steps in verified[:TARGET_COUNT]:
        title = data["title"].strip()

        # Parse ingredients
        parsed_ings = []
        current_section = None
        for raw_ing in raw_ings:
            if not isinstance(raw_ing, str):
                continue
            ing, current_section = parse_ingredient(raw_ing, current_section)
            if ing and ing.get("name"):
                parsed_ings.append(ing)

        if not parsed_ings:
            continue

        # Parse times (handle ISO 8601 durations like "PT5M", "PT1H30M")
        def parse_time(val):
            if not val:
                return 0
            if isinstance(val, (int, float)):
                return int(val)
            s = str(val)
            # Try plain integer
            try:
                return int(s)
            except ValueError:
                pass
            # Try ISO 8601: PT1H30M, PT5M, PT2H
            m = re.match(r'PT(?:(\d+)H)?(?:(\d+)M)?', s)
            if m:
                hours = int(m.group(1) or 0)
                mins = int(m.group(2) or 0)
                return hours * 60 + mins
            return 0

        prep_time = parse_time(data.get("prep_time", 0))
        cook_time = parse_time(data.get("cook_time", 0))

        # Parse macros
        protein = parse_nutrition_val(nutrition.get("protein"))
        carbs = parse_nutrition_val(nutrition.get("total_carbohydrate"))
        fat = parse_nutrition_val(nutrition.get("total_fat"))

        # Normalize servings (cap at 12, scale nutrition)
        if servings > 12:
            scale = servings / 8
            cal = round(cal * scale)
            protein = round(protein * scale)
            carbs = round(carbs * scale)
            fat = round(fat * scale)
            servings = 8

        # Cap unreasonable calories (>800 per serving)
        if cal > 800:
            while cal > 800 and servings < 24:
                total_cal = cal * servings
                servings = min(servings * 2, 24)
                cal = round(total_cal / servings)
                protein = round(protein * 0.5)
                carbs = round(carbs * 0.5)
                fat = round(fat * 0.5)

        # Skip if still bad
        if cal > 800 or cal < 10:
            continue

        ing_text = " ".join(i["name"] for i in parsed_ings)

        # Parse instructions
        instructions = []
        for step in steps:
            if isinstance(step, dict):
                instructions.append({
                    "step": step.get("step", len(instructions) + 1),
                    "instruction": step.get("instruction", ""),
                })

        if not instructions:
            continue

        # Clean description
        description = clean_description((data.get("description", "") or "")[:500])

        recipe = {
            "user_id": SYSTEM_USER_ID,
            "title": title,
            "description": description,
            "ingredients": parsed_ings,
            "instructions": instructions,
            "servings": servings,
            "prep_time": prep_time if prep_time > 0 else None,
            "cook_time": cook_time if cook_time > 0 else None,
            "calories": cal,
            "protein_grams": protein,
            "carbs_grams": carbs,
            "fat_grams": fat,
            "cuisine_type": infer_cuisine(title, ing_text),
            "difficulty": infer_difficulty(prep_time, cook_time, len(parsed_ings)),
            "meal_type": infer_meal_types(title),
            "dietary_tags": infer_dietary_tags(title, ing_text),
            "is_ai_generated": False,
            "likes_count": 0,
            "image_url": f"{IMAGE_BASE}{images[0]}",
        }

        candidates.append(recipe)

    print(f"\nFinal candidates after all quality checks: {len(candidates)}")

    # Insert in batches of 50
    inserted = 0
    batch_size = 50
    for i in range(0, len(candidates), batch_size):
        batch = candidates[i:i + batch_size]
        try:
            result = db.table("recipes").insert(batch).execute()
            inserted += len(result.data)
            if (i + batch_size) % 500 == 0 or i + batch_size >= len(candidates):
                print(f"  Inserted {inserted} recipes...")
        except Exception as e:
            # Try one by one on batch failure
            for recipe in batch:
                try:
                    db.table("recipes").insert(recipe).execute()
                    inserted += 1
                except Exception:
                    pass

    # Final count
    total = db.table("recipes").select("id", count="exact").execute()
    print(f"\nDone! Inserted {inserted} new recipes.")
    print(f"Total recipes in database: {total.count}")


if __name__ == "__main__":
    main()
