"""
Import ~1000 new recipes from AllRecipes data into the database.
Properly handles section headers, cleans ingredient names, and infers metadata.
"""

import zipfile
import json
import re
import random
import sys
import os

# Add parent dir to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.database import get_database

SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000001"
ZIP_PATH = os.path.join(os.path.dirname(__file__), "allrecipes_import", "recipes.zip")

# Unit pattern for parsing
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


def main():
    db = get_database()

    # Get existing titles
    existing = db.table("recipes").select("title").eq("user_id", SYSTEM_USER_ID).execute()
    existing_titles = set(r["title"].lower().strip() for r in existing.data)
    print(f"Existing recipes: {len(existing_titles)}")

    # Check existing image URL pattern
    img_sample = db.table("recipes").select("image_url").eq(
        "user_id", SYSTEM_USER_ID
    ).not_.is_("image_url", "null").limit(3).execute()
    print(f"Sample image URLs: {[r['image_url'][:60] for r in img_sample.data]}")

    # Load candidates from zip
    candidates = []
    with zipfile.ZipFile(ZIP_PATH, "r") as z:
        names = [n for n in z.namelist() if n.endswith(".json")]
        random.shuffle(names)

        for name in names:
            if len(candidates) >= 1100:
                break
            try:
                with z.open(name) as f:
                    data = json.load(f)

                title = data.get("title", "").strip()
                if not title or title.lower().strip() in existing_titles:
                    continue

                raw_ings = data.get("ingredients", [])
                images = data.get("images", [])
                nutrition = data.get("nutritional_information", {})
                calories = int(nutrition.get("calories", 0) or 0)
                servings_str = nutrition.get("servings", "0") or "0"
                # Handle servings like "12" or "1 dozen"
                servings_match = re.match(r"(\d+)", str(servings_str))
                servings = int(servings_match.group(1)) if servings_match else 0

                if len(raw_ings) < 3 or calories <= 0 or servings <= 0:
                    continue

                # Skip non-edible recipes
                desc = (data.get("description", "") or "").lower()
                if any(w in desc for w in ["non-edible", "not edible", "craft", "ornament", "playdough"]):
                    continue

                # Parse ingredients
                parsed_ings = []
                current_section = None
                for raw_ing in raw_ings:
                    if not isinstance(raw_ing, str):
                        continue
                    ing, current_section = parse_ingredient(raw_ing, current_section)
                    if ing and ing.get("name"):
                        parsed_ings.append(ing)

                if len(parsed_ings) < 3:
                    continue

                # Parse times
                prep_time = int(data.get("prep_time", 0) or 0)
                cook_time = int(data.get("cook_time", 0) or 0)

                # Parse nutrition (values may have units like "2.5g")
                def parse_nutrition_val(val):
                    s = str(val or "0")
                    m = re.match(r"([\d.]+)", s)
                    return round(float(m.group(1))) if m else 0

                protein = parse_nutrition_val(nutrition.get("protein"))
                carbs = parse_nutrition_val(nutrition.get("total_carbohydrate"))
                fat = parse_nutrition_val(nutrition.get("total_fat"))

                ing_text = " ".join(i["name"] for i in parsed_ings)

                # Parse instructions
                steps = data.get("steps", [])
                instructions = []
                for step in steps:
                    if isinstance(step, dict):
                        instructions.append({
                            "step": step.get("step", len(instructions) + 1),
                            "instruction": step.get("instruction", ""),
                        })

                if not instructions:
                    continue

                recipe = {
                    "user_id": SYSTEM_USER_ID,
                    "title": title,
                    "description": (data.get("description", "") or "")[:500],
                    "ingredients": parsed_ings,
                    "instructions": instructions,
                    "servings": servings,
                    "prep_time": prep_time if prep_time > 0 else None,
                    "cook_time": cook_time if cook_time > 0 else None,
                    "calories": calories,
                    "protein_grams": protein,
                    "carbs_grams": carbs,
                    "fat_grams": fat,
                    "cuisine_type": infer_cuisine(title, ing_text),
                    "difficulty": infer_difficulty(prep_time, cook_time, len(parsed_ings)),
                    "meal_type": infer_meal_types(title),
                    "dietary_tags": infer_dietary_tags(title, ing_text),
                    "is_ai_generated": False,
                    "likes_count": 0,
                    "image_url": f"https://images.allrecipes.com/userphotos/{images[0]}" if images else None,
                }

                candidates.append(recipe)
                existing_titles.add(title.lower().strip())

            except Exception:
                continue

    print(f"Prepared {len(candidates)} candidates")

    # Insert in batches of 50
    inserted = 0
    batch_size = 50
    for i in range(0, min(1000, len(candidates)), batch_size):
        batch = candidates[i : i + batch_size]
        try:
            result = db.table("recipes").insert(batch).execute()
            inserted += len(result.data)
            print(f"  Inserted batch {i // batch_size + 1}: {len(result.data)} recipes (total: {inserted})")
        except Exception as e:
            print(f"  Error inserting batch {i // batch_size + 1}: {e}")
            # Try one by one
            for recipe in batch:
                try:
                    db.table("recipes").insert(recipe).execute()
                    inserted += 1
                except Exception as e2:
                    print(f"    Failed: {recipe['title']}: {e2}")

    print(f"\nDone! Inserted {inserted} new recipes. Total should be ~{len(existing_titles)} now.")


if __name__ == "__main__":
    main()
