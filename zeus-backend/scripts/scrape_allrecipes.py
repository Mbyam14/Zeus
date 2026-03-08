#!/usr/bin/env python3
"""
Scraper to fetch recipes from AllRecipes.com and output them as a Python data file.
Uses JSON-LD schema.org markup for reliable structured data extraction.

Usage: python scripts/scrape_allrecipes.py
Output: app/data/default_recipes.py
"""
import json
import re
import sys
import time
import random
from pathlib import Path
from typing import Optional

import requests
from bs4 import BeautifulSoup

# Add parent directory to path
sys.path.append(str(Path(__file__).parent.parent))

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.5",
}

# Category URLs and their meal_type mapping
CATEGORY_URLS = [
    {
        "url": "https://www.allrecipes.com/recipes/78/breakfast-and-brunch/",
        "meal_type": "Breakfast",
        "target_count": 30,
    },
    {
        "url": "https://www.allrecipes.com/recipes/17561/lunch/",
        "meal_type": "Lunch",
        "target_count": 40,
    },
    {
        "url": "https://www.allrecipes.com/recipes/17562/dinner/",
        "meal_type": "Dinner",
        "target_count": 50,
    },
    {
        "url": "https://www.allrecipes.com/recipes/76/appetizers-and-snacks/",
        "meal_type": "Snack",
        "target_count": 15,
    },
    {
        "url": "https://www.allrecipes.com/recipes/79/desserts/",
        "meal_type": "Dessert",
        "target_count": 15,
    },
]


def fetch_page(url: str, retries: int = 3) -> Optional[str]:
    """Fetch a page with retries and polite delays."""
    for attempt in range(retries):
        try:
            time.sleep(random.uniform(1.0, 2.5))  # Polite crawling
            resp = requests.get(url, headers=HEADERS, timeout=15)
            if resp.status_code == 200:
                return resp.text
            print(f"  HTTP {resp.status_code} for {url}")
        except requests.RequestException as e:
            print(f"  Request error (attempt {attempt + 1}): {e}")
    return None


def get_recipe_links_from_category(category_url: str, target_count: int) -> list[str]:
    """Extract individual recipe URLs from a category page."""
    html = fetch_page(category_url)
    if not html:
        print(f"  Failed to fetch category page: {category_url}")
        return []

    soup = BeautifulSoup(html, "lxml")
    links = []

    # AllRecipes recipe URLs follow pattern: /recipe/NNNNNN/recipe-name/
    for a_tag in soup.find_all("a", href=True):
        href = a_tag["href"]
        if re.match(r"https://www\.allrecipes\.com/recipe/\d+/", href):
            if href not in links:
                links.append(href)
            if len(links) >= target_count * 2:  # Get extras in case some fail
                break

    print(f"  Found {len(links)} recipe links from {category_url}")
    return links[:target_count * 2]


def parse_iso_duration(duration_str: str) -> Optional[int]:
    """Parse ISO 8601 duration (PT1H30M) to minutes."""
    if not duration_str:
        return None
    match = re.match(r"PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?", duration_str)
    if not match:
        return None
    hours = int(match.group(1) or 0)
    minutes = int(match.group(2) or 0)
    return hours * 60 + minutes if (hours or minutes) else None


def parse_ingredient(text: str) -> dict:
    """Parse an ingredient string into {name, quantity, unit}."""
    text = text.strip()

    # Common unit patterns
    unit_pattern = r"(cups?|tablespoons?|tbsp|teaspoons?|tsp|ounces?|oz|pounds?|lbs?|cloves?|cans?|packages?|pieces?|slices?|pinch(?:es)?|dash(?:es)?|quarts?|gallons?|pints?|sticks?|heads?|bunche?s?|sprigs?|stalks?|fillets?)"

    # Try to extract quantity and unit
    # Pattern: "1 1/2 cups flour" or "2 tablespoons oil" or "1 (14 oz) can tomatoes"
    quantity_match = re.match(
        rf"^([\d\s/½¼¾⅓⅔⅛]+)\s+{unit_pattern}\.?\s+(.+)", text, re.IGNORECASE
    )

    if quantity_match:
        qty = quantity_match.group(1).strip()
        unit = quantity_match.group(2).strip().lower()
        name = quantity_match.group(3).strip()
        # Normalize fractions
        qty = qty.replace("½", "0.5").replace("¼", "0.25").replace("¾", "0.75")
        qty = qty.replace("⅓", "0.33").replace("⅔", "0.67").replace("⅛", "0.125")
        return {"name": name, "quantity": qty, "unit": unit}

    # Try simpler pattern: "2 eggs" or "Salt and pepper"
    simple_match = re.match(r"^([\d\s/½¼¾⅓⅔⅛]+)\s+(.+)", text)
    if simple_match:
        qty = simple_match.group(1).strip()
        name = simple_match.group(2).strip()
        qty = qty.replace("½", "0.5").replace("¼", "0.25").replace("¾", "0.75")
        return {"name": name, "quantity": qty, "unit": "pieces"}

    # Fallback: whole ingredient as name
    return {"name": text, "quantity": "1", "unit": "pieces"}


def infer_dietary_tags(title: str, ingredients: list[dict]) -> list[str]:
    """Infer dietary tags from recipe title and ingredients."""
    tags = []
    title_lower = title.lower()
    all_ingredients = " ".join(i["name"].lower() for i in ingredients)

    meat_keywords = ["chicken", "beef", "pork", "turkey", "bacon", "sausage", "ham",
                     "steak", "lamb", "ground meat", "prosciutto", "pepperoni", "salami"]
    fish_keywords = ["salmon", "tuna", "shrimp", "fish", "cod", "tilapia", "crab",
                     "lobster", "scallop", "anchov"]
    dairy_keywords = ["milk", "cheese", "cream", "butter", "yogurt", "sour cream"]
    gluten_keywords = ["flour", "bread", "pasta", "noodle", "tortilla", "cracker",
                       "breadcrumb", "panko", "biscuit"]

    has_meat = any(k in all_ingredients for k in meat_keywords)
    has_fish = any(k in all_ingredients for k in fish_keywords)
    has_dairy = any(k in all_ingredients for k in dairy_keywords)
    has_gluten = any(k in all_ingredients for k in gluten_keywords)

    if not has_meat and not has_fish:
        tags.append("Vegetarian")
        if not has_dairy and "egg" not in all_ingredients and "honey" not in all_ingredients:
            tags.append("Vegan")

    if not has_gluten:
        tags.append("Gluten-Free")

    if not has_dairy:
        tags.append("Dairy-Free")

    if "vegan" in title_lower:
        if "Vegan" not in tags:
            tags.append("Vegan")
    if "keto" in title_lower or "low-carb" in title_lower:
        tags.append("Keto")
    if "paleo" in title_lower:
        tags.append("Paleo")

    return tags


def infer_difficulty(prep_time: Optional[int], cook_time: Optional[int], num_steps: int) -> str:
    """Infer difficulty from times and steps."""
    total_time = (prep_time or 0) + (cook_time or 0)
    if total_time <= 30 and num_steps <= 5:
        return "Easy"
    elif total_time > 90 or num_steps > 12:
        return "Hard"
    return "Medium"


def infer_cuisine(title: str, ingredients: list[dict]) -> Optional[str]:
    """Infer cuisine type from title and ingredients."""
    title_lower = title.lower()
    all_text = title_lower + " " + " ".join(i["name"].lower() for i in ingredients)

    cuisine_map = {
        "Italian": ["pasta", "parmesan", "marinara", "pesto", "risotto", "bruschetta", "lasagna", "spaghetti", "fettuccine", "carbonara"],
        "Mexican": ["tortilla", "taco", "salsa", "cilantro", "jalape", "enchilada", "burrito", "quesadilla", "chipotle", "cumin"],
        "Asian": ["soy sauce", "ginger", "sesame", "teriyaki", "stir fry", "wok", "rice vinegar", "hoisin"],
        "Chinese": ["soy sauce", "wonton", "chow mein", "kung pao", "sweet and sour", "fried rice"],
        "Japanese": ["miso", "wasabi", "sushi", "teriyaki", "ramen", "tempura", "edamame"],
        "Indian": ["curry", "turmeric", "garam masala", "naan", "tikka", "tandoori", "chutney", "cardamom"],
        "Thai": ["thai", "coconut milk", "lemongrass", "fish sauce", "pad thai", "basil"],
        "Mediterranean": ["olive oil", "feta", "hummus", "tzatziki", "tahini", "mediterranean"],
        "Greek": ["greek", "feta", "gyro", "souvlaki", "tzatziki", "kalamata"],
        "French": ["french", "beurre", "crepe", "croissant", "gratin", "ratatouille"],
        "American": ["burger", "bbq", "barbecue", "mac and cheese", "cornbread", "meatloaf"],
        "Southern": ["southern", "fried chicken", "cornbread", "collard", "grits", "jambalaya", "gumbo"],
    }

    for cuisine, keywords in cuisine_map.items():
        if any(kw in all_text for kw in keywords):
            return cuisine

    return "American"  # Default


def scrape_recipe(url: str, default_meal_type: str) -> Optional[dict]:
    """Scrape a single recipe page and return structured data."""
    html = fetch_page(url)
    if not html:
        return None

    soup = BeautifulSoup(html, "lxml")

    # Find JSON-LD data
    recipe_data = None
    for script in soup.find_all("script", type="application/ld+json"):
        try:
            data = json.loads(script.string)
            # Handle both direct Recipe and @graph containing Recipe
            if isinstance(data, list):
                for item in data:
                    if isinstance(item, dict) and item.get("@type") == "Recipe":
                        recipe_data = item
                        break
            elif isinstance(data, dict):
                if data.get("@type") == "Recipe":
                    recipe_data = data
                elif "@graph" in data:
                    for item in data["@graph"]:
                        if isinstance(item, dict) and item.get("@type") == "Recipe":
                            recipe_data = item
                            break
        except (json.JSONDecodeError, TypeError):
            continue

    if not recipe_data:
        print(f"  No JSON-LD Recipe data found: {url}")
        return None

    title = recipe_data.get("name", "").strip()
    if not title:
        return None

    description = recipe_data.get("description", "").strip()

    # Image
    image = recipe_data.get("image")
    image_url = None
    if isinstance(image, dict):
        image_url = image.get("url")
    elif isinstance(image, list):
        image_url = image[0] if image else None
        if isinstance(image_url, dict):
            image_url = image_url.get("url")
    elif isinstance(image, str):
        image_url = image

    # Ingredients
    raw_ingredients = recipe_data.get("recipeIngredient", [])
    ingredients = [parse_ingredient(ing) for ing in raw_ingredients if isinstance(ing, str)]

    if not ingredients:
        return None

    # Instructions
    raw_instructions = recipe_data.get("recipeInstructions", [])
    instructions = []
    step_num = 1
    for inst in raw_instructions:
        if isinstance(inst, dict):
            # Could be HowToStep or HowToSection
            if inst.get("@type") == "HowToStep":
                text = inst.get("text", "").strip()
                if text:
                    instructions.append({"step_number": step_num, "text": text})
                    step_num += 1
            elif inst.get("@type") == "HowToSection":
                for sub_step in inst.get("itemListElement", []):
                    text = sub_step.get("text", "").strip() if isinstance(sub_step, dict) else str(sub_step).strip()
                    if text:
                        instructions.append({"step_number": step_num, "text": text})
                        step_num += 1
        elif isinstance(inst, str):
            text = inst.strip()
            if text:
                instructions.append({"step_number": step_num, "text": text})
                step_num += 1

    if not instructions:
        return None

    # Times
    prep_time = parse_iso_duration(recipe_data.get("prepTime", ""))
    cook_time = parse_iso_duration(recipe_data.get("cookTime", ""))
    total_time = parse_iso_duration(recipe_data.get("totalTime", ""))

    # If only total time, split roughly
    if total_time and not prep_time and not cook_time:
        prep_time = max(5, total_time // 3)
        cook_time = total_time - prep_time

    # Servings
    recipe_yield = recipe_data.get("recipeYield")
    servings = 4  # default
    if recipe_yield:
        if isinstance(recipe_yield, list):
            recipe_yield = recipe_yield[0]
        yield_match = re.search(r"(\d+)", str(recipe_yield))
        if yield_match:
            servings = int(yield_match.group(1))

    # Nutrition
    nutrition = recipe_data.get("nutrition", {})
    calories = None
    protein_grams = None
    carbs_grams = None
    fat_grams = None

    if nutrition:
        cal_str = nutrition.get("calories", "")
        cal_match = re.search(r"(\d+)", str(cal_str))
        if cal_match:
            calories = int(cal_match.group(1))

        prot_str = nutrition.get("proteinContent", "")
        prot_match = re.search(r"([\d.]+)", str(prot_str))
        if prot_match:
            protein_grams = round(float(prot_match.group(1)))

        carb_str = nutrition.get("carbohydrateContent", "")
        carb_match = re.search(r"([\d.]+)", str(carb_str))
        if carb_match:
            carbs_grams = round(float(carb_match.group(1)))

        fat_str = nutrition.get("fatContent", "")
        fat_match = re.search(r"([\d.]+)", str(fat_str))
        if fat_match:
            fat_grams = round(float(fat_match.group(1)))

    # Inferred fields
    difficulty = infer_difficulty(prep_time, cook_time, len(instructions))
    dietary_tags = infer_dietary_tags(title, ingredients)
    cuisine_type = infer_cuisine(title, ingredients)

    # Category from AllRecipes data
    category = recipe_data.get("recipeCategory", [])
    if isinstance(category, str):
        category = [category]

    # Determine meal_type
    meal_types = [default_meal_type]
    for cat in category:
        cat_lower = cat.lower()
        if "breakfast" in cat_lower or "brunch" in cat_lower:
            if "Breakfast" not in meal_types:
                meal_types = ["Breakfast"]
        elif "dessert" in cat_lower:
            if "Dessert" not in meal_types:
                meal_types = ["Dessert"]

    return {
        "title": title,
        "description": description[:500] if description else f"A delicious {cuisine_type or ''} {default_meal_type.lower()} recipe.",
        "image_url": image_url,
        "ingredients": ingredients,
        "instructions": instructions,
        "servings": servings,
        "prep_time": prep_time,
        "cook_time": cook_time,
        "cuisine_type": cuisine_type,
        "difficulty": difficulty,
        "meal_type": meal_types,
        "dietary_tags": dietary_tags,
        "is_ai_generated": False,
        "calories": calories,
        "protein_grams": protein_grams,
        "carbs_grams": carbs_grams,
        "fat_grams": fat_grams,
        "serving_size": f"1 serving (serves {servings})" if servings else None,
        "source_url": url,
    }


def main():
    print("\n" + "=" * 60)
    print("  AllRecipes Scraper for Zeus")
    print("=" * 60 + "\n")

    all_recipes = []
    seen_titles = set()

    for cat in CATEGORY_URLS:
        meal_type = cat["meal_type"]
        target = cat["target_count"]
        print(f"\n--- Scraping {meal_type} (target: {target}) ---")

        links = get_recipe_links_from_category(cat["url"], target)
        count = 0

        for link in links:
            if count >= target:
                break

            recipe = scrape_recipe(link, meal_type)
            if recipe and recipe["title"] not in seen_titles:
                seen_titles.add(recipe["title"])
                all_recipes.append(recipe)
                count += 1
                print(f"  [{count}/{target}] {recipe['title']}")

        print(f"  Got {count}/{target} {meal_type} recipes")

    print(f"\n{'=' * 60}")
    print(f"Total recipes scraped: {len(all_recipes)}")
    print(f"{'=' * 60}\n")

    # Write output file
    output_path = Path(__file__).parent.parent / "app" / "data" / "default_recipes.py"
    output_path.parent.mkdir(parents=True, exist_ok=True)

    with open(output_path, "w", encoding="utf-8") as f:
        f.write('"""Default recipes scraped from AllRecipes.com."""\n\n\n')
        f.write("def get_default_recipes() -> list[dict]:\n")
        f.write('    """Return list of default recipes for seeding the database."""\n')
        f.write("    return ")
        # Use json.dumps for clean formatting, then convert to Python syntax
        json_str = json.dumps(all_recipes, indent=8, ensure_ascii=False)
        # JSON uses null/true/false, Python uses None/True/False
        json_str = json_str.replace(": null", ": None")
        json_str = json_str.replace(": true", ": True")
        json_str = json_str.replace(": false", ": False")
        f.write(json_str)
        f.write("\n")

    print(f"Output written to: {output_path}")
    print("Done!")


if __name__ == "__main__":
    main()
