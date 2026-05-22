"""
Recalculate recipe nutrition using USDA FoodData Central API.

Strategy:
1. Build a local cache of common ingredient nutrition (per 100g)
2. For each recipe, parse ingredients and look up nutrition
3. Sum up macros and update the database

Uses USDA SR Legacy data which has standardized nutrition per 100g.
"""

import asyncio
import json
import os
import re
import sys
import time
from pathlib import Path

import httpx

# Add parent to path
sys.path.insert(0, str(Path(__file__).parent.parent))
from app.database import get_database

USDA_API_KEY = os.environ.get("USDA_API_KEY", "DEMO_KEY")
USDA_BASE = "https://api.nal.usda.gov/fdc/v1"
CACHE_FILE = Path(__file__).parent / "nutrition_cache.json"

# ── Unit conversions to grams ──
UNIT_TO_GRAMS = {
    # Weight
    'pound': 453.6, 'pounds': 453.6, 'lb': 453.6, 'lbs': 453.6,
    'ounce': 28.35, 'ounces': 28.35, 'oz': 28.35,
    'gram': 1, 'grams': 1, 'g': 1,
    'kilogram': 1000, 'kg': 1000,
    # Volume (approximate for common foods)
    'cup': 240, 'cups': 240,
    'tablespoon': 15, 'tablespoons': 15, 'tbsp': 15,
    'teaspoon': 5, 'teaspoons': 5, 'tsp': 5,
    'quart': 960, 'quarts': 960,
    'pint': 480, 'pints': 480,
    'gallon': 3840, 'gallons': 3840,
    'liter': 1000, 'liters': 1000,
    'milliliter': 1, 'ml': 1,
    'fluid ounce': 30, 'fl oz': 30,
    # Count-based (estimated average weight in grams)
    'clove': 5, 'cloves': 5,
    'slice': 30, 'slices': 30,
    'piece': 100, 'pieces': 100,
    'stalk': 60, 'stalks': 60,
    'sprig': 2, 'sprigs': 2,
    'bunch': 150,
    'head': 500,
    'leaf': 5, 'leaves': 5,
    'can': 400,
    'jar': 400,
    'package': 400, 'pkg': 400,
    'bag': 300,
    'box': 400,
    'stick': 113,  # stick of butter
    'breast': 175, 'breasts': 175,
    'thigh': 125, 'thighs': 125,
    'drumstick': 100, 'drumsticks': 100,
    'fillet': 170, 'fillets': 170,
    'strip': 30, 'strips': 30,
    'patty': 115, 'patties': 115,
    'link': 70, 'links': 70,
    'egg': 50,
    'large': 50,  # large egg default
    'medium': 40,
    'small': 30,
    'pinch': 0.5,
    'dash': 0.5,
    'splash': 5,
    'to taste': 1,
}

# ── Common ingredient nutrition per 100g (pre-seeded to reduce API calls) ──
BUILTIN_NUTRITION = {
    # Proteins
    'chicken breast': {'calories': 165, 'protein': 31, 'carbs': 0, 'fat': 3.6},
    'chicken thigh': {'calories': 209, 'protein': 26, 'carbs': 0, 'fat': 10.9},
    'chicken': {'calories': 190, 'protein': 28, 'carbs': 0, 'fat': 7.4},
    'ground beef': {'calories': 250, 'protein': 26, 'carbs': 0, 'fat': 15},
    'beef': {'calories': 250, 'protein': 26, 'carbs': 0, 'fat': 15},
    'steak': {'calories': 271, 'protein': 26, 'carbs': 0, 'fat': 18},
    'pork': {'calories': 242, 'protein': 27, 'carbs': 0, 'fat': 14},
    'pork chop': {'calories': 231, 'protein': 26, 'carbs': 0, 'fat': 13},
    'bacon': {'calories': 541, 'protein': 37, 'carbs': 1.4, 'fat': 42},
    'sausage': {'calories': 301, 'protein': 18, 'carbs': 1, 'fat': 25},
    'ground turkey': {'calories': 170, 'protein': 21, 'carbs': 0, 'fat': 9.4},
    'turkey': {'calories': 170, 'protein': 29, 'carbs': 0, 'fat': 5},
    'lamb': {'calories': 294, 'protein': 25, 'carbs': 0, 'fat': 21},
    'shrimp': {'calories': 99, 'protein': 24, 'carbs': 0.2, 'fat': 0.3},
    'salmon': {'calories': 208, 'protein': 20, 'carbs': 0, 'fat': 13},
    'tuna': {'calories': 130, 'protein': 29, 'carbs': 0, 'fat': 0.6},
    'cod': {'calories': 82, 'protein': 18, 'carbs': 0, 'fat': 0.7},
    'tilapia': {'calories': 96, 'protein': 20, 'carbs': 0, 'fat': 1.7},
    'fish': {'calories': 130, 'protein': 22, 'carbs': 0, 'fat': 4},
    'crab': {'calories': 97, 'protein': 19, 'carbs': 0, 'fat': 1.5},
    'lobster': {'calories': 89, 'protein': 19, 'carbs': 0, 'fat': 0.9},
    'scallop': {'calories': 69, 'protein': 12, 'carbs': 3.2, 'fat': 0.5},
    'tofu': {'calories': 76, 'protein': 8, 'carbs': 1.9, 'fat': 4.8},
    'egg': {'calories': 155, 'protein': 13, 'carbs': 1.1, 'fat': 11},
    'eggs': {'calories': 155, 'protein': 13, 'carbs': 1.1, 'fat': 11},
    # Dairy
    'milk': {'calories': 61, 'protein': 3.2, 'carbs': 4.8, 'fat': 3.3},
    'whole milk': {'calories': 61, 'protein': 3.2, 'carbs': 4.8, 'fat': 3.3},
    'cream': {'calories': 340, 'protein': 2.1, 'carbs': 2.8, 'fat': 36},
    'heavy cream': {'calories': 340, 'protein': 2.1, 'carbs': 2.8, 'fat': 36},
    'sour cream': {'calories': 198, 'protein': 2.4, 'carbs': 4.6, 'fat': 19.4},
    'cream cheese': {'calories': 342, 'protein': 6, 'carbs': 5.5, 'fat': 34},
    'butter': {'calories': 717, 'protein': 0.9, 'carbs': 0.1, 'fat': 81},
    'cheese': {'calories': 402, 'protein': 25, 'carbs': 1.3, 'fat': 33},
    'cheddar': {'calories': 402, 'protein': 25, 'carbs': 1.3, 'fat': 33},
    'mozzarella': {'calories': 280, 'protein': 28, 'carbs': 3.1, 'fat': 17},
    'parmesan': {'calories': 431, 'protein': 38, 'carbs': 4.1, 'fat': 29},
    'yogurt': {'calories': 61, 'protein': 3.5, 'carbs': 4.7, 'fat': 3.3},
    'greek yogurt': {'calories': 73, 'protein': 10, 'carbs': 4, 'fat': 2},
    'cottage cheese': {'calories': 98, 'protein': 11, 'carbs': 3.4, 'fat': 4.3},
    # Grains & pasta
    'rice': {'calories': 130, 'protein': 2.7, 'carbs': 28, 'fat': 0.3},
    'brown rice': {'calories': 123, 'protein': 2.7, 'carbs': 26, 'fat': 1},
    'pasta': {'calories': 131, 'protein': 5, 'carbs': 25, 'fat': 1.1},
    'spaghetti': {'calories': 131, 'protein': 5, 'carbs': 25, 'fat': 1.1},
    'linguine': {'calories': 131, 'protein': 5, 'carbs': 25, 'fat': 1.1},
    'fettuccine': {'calories': 131, 'protein': 5, 'carbs': 25, 'fat': 1.1},
    'penne': {'calories': 131, 'protein': 5, 'carbs': 25, 'fat': 1.1},
    'noodle': {'calories': 138, 'protein': 4.5, 'carbs': 25, 'fat': 2},
    'noodles': {'calories': 138, 'protein': 4.5, 'carbs': 25, 'fat': 2},
    'bread': {'calories': 265, 'protein': 9, 'carbs': 49, 'fat': 3.2},
    'tortilla': {'calories': 312, 'protein': 8, 'carbs': 52, 'fat': 8},
    'flour': {'calories': 364, 'protein': 10, 'carbs': 76, 'fat': 1},
    'oats': {'calories': 389, 'protein': 17, 'carbs': 66, 'fat': 7},
    'quinoa': {'calories': 120, 'protein': 4.4, 'carbs': 21, 'fat': 1.9},
    'couscous': {'calories': 112, 'protein': 3.8, 'carbs': 23, 'fat': 0.2},
    # Vegetables
    'potato': {'calories': 77, 'protein': 2, 'carbs': 17, 'fat': 0.1},
    'potatoes': {'calories': 77, 'protein': 2, 'carbs': 17, 'fat': 0.1},
    'sweet potato': {'calories': 86, 'protein': 1.6, 'carbs': 20, 'fat': 0.1},
    'onion': {'calories': 40, 'protein': 1.1, 'carbs': 9.3, 'fat': 0.1},
    'garlic': {'calories': 149, 'protein': 6.4, 'carbs': 33, 'fat': 0.5},
    'tomato': {'calories': 18, 'protein': 0.9, 'carbs': 3.9, 'fat': 0.2},
    'tomatoes': {'calories': 18, 'protein': 0.9, 'carbs': 3.9, 'fat': 0.2},
    'carrot': {'calories': 41, 'protein': 0.9, 'carbs': 10, 'fat': 0.2},
    'carrots': {'calories': 41, 'protein': 0.9, 'carbs': 10, 'fat': 0.2},
    'broccoli': {'calories': 34, 'protein': 2.8, 'carbs': 7, 'fat': 0.4},
    'spinach': {'calories': 23, 'protein': 2.9, 'carbs': 3.6, 'fat': 0.4},
    'bell pepper': {'calories': 31, 'protein': 1, 'carbs': 6, 'fat': 0.3},
    'pepper': {'calories': 31, 'protein': 1, 'carbs': 6, 'fat': 0.3},
    'celery': {'calories': 16, 'protein': 0.7, 'carbs': 3, 'fat': 0.2},
    'mushroom': {'calories': 22, 'protein': 3.1, 'carbs': 3.3, 'fat': 0.3},
    'mushrooms': {'calories': 22, 'protein': 3.1, 'carbs': 3.3, 'fat': 0.3},
    'corn': {'calories': 86, 'protein': 3.2, 'carbs': 19, 'fat': 1.2},
    'peas': {'calories': 81, 'protein': 5.4, 'carbs': 14, 'fat': 0.4},
    'green beans': {'calories': 31, 'protein': 1.8, 'carbs': 7, 'fat': 0.1},
    'zucchini': {'calories': 17, 'protein': 1.2, 'carbs': 3.1, 'fat': 0.3},
    'squash': {'calories': 26, 'protein': 1, 'carbs': 7, 'fat': 0.1},
    'avocado': {'calories': 160, 'protein': 2, 'carbs': 9, 'fat': 15},
    'cabbage': {'calories': 25, 'protein': 1.3, 'carbs': 6, 'fat': 0.1},
    'lettuce': {'calories': 15, 'protein': 1.4, 'carbs': 2.9, 'fat': 0.2},
    'kale': {'calories': 49, 'protein': 4.3, 'carbs': 9, 'fat': 0.9},
    'cucumber': {'calories': 15, 'protein': 0.7, 'carbs': 3.6, 'fat': 0.1},
    'asparagus': {'calories': 20, 'protein': 2.2, 'carbs': 3.9, 'fat': 0.1},
    'eggplant': {'calories': 25, 'protein': 1, 'carbs': 6, 'fat': 0.2},
    'cauliflower': {'calories': 25, 'protein': 1.9, 'carbs': 5, 'fat': 0.3},
    # Legumes
    'black beans': {'calories': 132, 'protein': 8.9, 'carbs': 24, 'fat': 0.5},
    'kidney beans': {'calories': 127, 'protein': 8.7, 'carbs': 23, 'fat': 0.5},
    'chickpeas': {'calories': 164, 'protein': 8.9, 'carbs': 27, 'fat': 2.6},
    'lentils': {'calories': 116, 'protein': 9, 'carbs': 20, 'fat': 0.4},
    'beans': {'calories': 127, 'protein': 8.7, 'carbs': 23, 'fat': 0.5},
    # Fruits
    'apple': {'calories': 52, 'protein': 0.3, 'carbs': 14, 'fat': 0.2},
    'banana': {'calories': 89, 'protein': 1.1, 'carbs': 23, 'fat': 0.3},
    'lemon': {'calories': 29, 'protein': 1.1, 'carbs': 9, 'fat': 0.3},
    'lime': {'calories': 30, 'protein': 0.7, 'carbs': 11, 'fat': 0.2},
    'orange': {'calories': 47, 'protein': 0.9, 'carbs': 12, 'fat': 0.1},
    'strawberry': {'calories': 32, 'protein': 0.7, 'carbs': 7.7, 'fat': 0.3},
    'blueberry': {'calories': 57, 'protein': 0.7, 'carbs': 14, 'fat': 0.3},
    'raspberry': {'calories': 52, 'protein': 1.2, 'carbs': 12, 'fat': 0.7},
    'cranberry': {'calories': 46, 'protein': 0.4, 'carbs': 12, 'fat': 0.1},
    'pineapple': {'calories': 50, 'protein': 0.5, 'carbs': 13, 'fat': 0.1},
    'mango': {'calories': 60, 'protein': 0.8, 'carbs': 15, 'fat': 0.4},
    'peach': {'calories': 39, 'protein': 0.9, 'carbs': 10, 'fat': 0.3},
    # Nuts & seeds
    'almonds': {'calories': 579, 'protein': 21, 'carbs': 22, 'fat': 50},
    'walnuts': {'calories': 654, 'protein': 15, 'carbs': 14, 'fat': 65},
    'peanut': {'calories': 567, 'protein': 26, 'carbs': 16, 'fat': 49},
    'peanut butter': {'calories': 588, 'protein': 25, 'carbs': 20, 'fat': 50},
    'cashews': {'calories': 553, 'protein': 18, 'carbs': 30, 'fat': 44},
    'pecans': {'calories': 691, 'protein': 9, 'carbs': 14, 'fat': 72},
    'sunflower seeds': {'calories': 584, 'protein': 21, 'carbs': 20, 'fat': 51},
    'sesame': {'calories': 573, 'protein': 18, 'carbs': 23, 'fat': 50},
    'coconut': {'calories': 354, 'protein': 3.3, 'carbs': 15, 'fat': 33},
    'coconut milk': {'calories': 230, 'protein': 2.3, 'carbs': 6, 'fat': 24},
    # Oils & fats
    'olive oil': {'calories': 884, 'protein': 0, 'carbs': 0, 'fat': 100},
    'vegetable oil': {'calories': 884, 'protein': 0, 'carbs': 0, 'fat': 100},
    'canola oil': {'calories': 884, 'protein': 0, 'carbs': 0, 'fat': 100},
    'coconut oil': {'calories': 862, 'protein': 0, 'carbs': 0, 'fat': 100},
    'sesame oil': {'calories': 884, 'protein': 0, 'carbs': 0, 'fat': 100},
    # Condiments & sauces
    'soy sauce': {'calories': 53, 'protein': 8, 'carbs': 5, 'fat': 0},
    'tomato sauce': {'calories': 29, 'protein': 1.3, 'carbs': 5.4, 'fat': 0.5},
    'tomato paste': {'calories': 82, 'protein': 4.3, 'carbs': 19, 'fat': 0.5},
    'ketchup': {'calories': 112, 'protein': 1.7, 'carbs': 26, 'fat': 0.3},
    'mustard': {'calories': 66, 'protein': 4.4, 'carbs': 6, 'fat': 3.3},
    'mayonnaise': {'calories': 680, 'protein': 1, 'carbs': 0.6, 'fat': 75},
    'vinegar': {'calories': 21, 'protein': 0, 'carbs': 0.9, 'fat': 0},
    'honey': {'calories': 304, 'protein': 0.3, 'carbs': 82, 'fat': 0},
    'maple syrup': {'calories': 260, 'protein': 0, 'carbs': 67, 'fat': 0.1},
    'sugar': {'calories': 387, 'protein': 0, 'carbs': 100, 'fat': 0},
    'brown sugar': {'calories': 380, 'protein': 0, 'carbs': 98, 'fat': 0},
    'salt': {'calories': 0, 'protein': 0, 'carbs': 0, 'fat': 0},
    'pepper': {'calories': 0, 'protein': 0, 'carbs': 0, 'fat': 0},
    'salsa': {'calories': 36, 'protein': 1.5, 'carbs': 7, 'fat': 0.2},
    'hot sauce': {'calories': 11, 'protein': 0.5, 'carbs': 2, 'fat': 0.1},
    'worcestershire': {'calories': 78, 'protein': 0, 'carbs': 19, 'fat': 0},
    # Baking
    'baking powder': {'calories': 53, 'protein': 0, 'carbs': 28, 'fat': 0},
    'baking soda': {'calories': 0, 'protein': 0, 'carbs': 0, 'fat': 0},
    'vanilla': {'calories': 288, 'protein': 0.1, 'carbs': 13, 'fat': 0.1},
    'cocoa': {'calories': 228, 'protein': 20, 'carbs': 58, 'fat': 14},
    'chocolate': {'calories': 546, 'protein': 5, 'carbs': 60, 'fat': 31},
    'chocolate chips': {'calories': 500, 'protein': 5, 'carbs': 60, 'fat': 29},
    # Canned goods
    'diced tomatoes': {'calories': 18, 'protein': 0.9, 'carbs': 3.9, 'fat': 0.2},
    'crushed tomatoes': {'calories': 32, 'protein': 1.6, 'carbs': 6.9, 'fat': 0.3},
    'tomato soup': {'calories': 30, 'protein': 0.7, 'carbs': 6.7, 'fat': 0.2},
    'chicken broth': {'calories': 4, 'protein': 0.5, 'carbs': 0.3, 'fat': 0.1},
    'beef broth': {'calories': 7, 'protein': 1, 'carbs': 0.2, 'fat': 0.2},
    'vegetable broth': {'calories': 6, 'protein': 0.2, 'carbs': 1.1, 'fat': 0.1},
    'broth': {'calories': 5, 'protein': 0.5, 'carbs': 0.3, 'fat': 0.1},
    'stock': {'calories': 5, 'protein': 0.5, 'carbs': 0.3, 'fat': 0.1},
    # Spices (negligible nutrition at typical quantities)
    'cinnamon': {'calories': 0, 'protein': 0, 'carbs': 0, 'fat': 0},
    'paprika': {'calories': 0, 'protein': 0, 'carbs': 0, 'fat': 0},
    'cumin': {'calories': 0, 'protein': 0, 'carbs': 0, 'fat': 0},
    'oregano': {'calories': 0, 'protein': 0, 'carbs': 0, 'fat': 0},
    'basil': {'calories': 0, 'protein': 0, 'carbs': 0, 'fat': 0},
    'thyme': {'calories': 0, 'protein': 0, 'carbs': 0, 'fat': 0},
    'rosemary': {'calories': 0, 'protein': 0, 'carbs': 0, 'fat': 0},
    'parsley': {'calories': 0, 'protein': 0, 'carbs': 0, 'fat': 0},
    'cilantro': {'calories': 0, 'protein': 0, 'carbs': 0, 'fat': 0},
    'dill': {'calories': 0, 'protein': 0, 'carbs': 0, 'fat': 0},
    'bay leaf': {'calories': 0, 'protein': 0, 'carbs': 0, 'fat': 0},
    'chili powder': {'calories': 0, 'protein': 0, 'carbs': 0, 'fat': 0},
    'cayenne': {'calories': 0, 'protein': 0, 'carbs': 0, 'fat': 0},
    'turmeric': {'calories': 0, 'protein': 0, 'carbs': 0, 'fat': 0},
    'ginger': {'calories': 80, 'protein': 1.8, 'carbs': 18, 'fat': 0.8},
    'nutmeg': {'calories': 0, 'protein': 0, 'carbs': 0, 'fat': 0},
    'italian seasoning': {'calories': 0, 'protein': 0, 'carbs': 0, 'fat': 0},
    'seasoning': {'calories': 0, 'protein': 0, 'carbs': 0, 'fat': 0},
    # Misc
    'water': {'calories': 0, 'protein': 0, 'carbs': 0, 'fat': 0},
    'ice': {'calories': 0, 'protein': 0, 'carbs': 0, 'fat': 0},
    'wine': {'calories': 83, 'protein': 0.1, 'carbs': 2.6, 'fat': 0},
    'beer': {'calories': 43, 'protein': 0.5, 'carbs': 3.6, 'fat': 0},
}


def parse_quantity(q_str: str) -> float:
    """Parse fraction/mixed number strings to float."""
    if not q_str:
        return 1.0
    q_str = str(q_str).strip()

    # Handle ranges like "2-3" -> take average
    if '-' in q_str and not q_str.startswith('-'):
        parts = q_str.split('-')
        try:
            return (parse_quantity(parts[0]) + parse_quantity(parts[1])) / 2
        except:
            pass

    # Handle mixed numbers like "1 1/2"
    parts = q_str.split()
    total = 0
    for part in parts:
        part = part.strip(',').strip()
        if '/' in part:
            nums = part.split('/')
            try:
                total += float(nums[0]) / float(nums[1])
            except:
                pass
        else:
            try:
                total += float(part)
            except:
                pass
    return total if total > 0 else 1.0


def clean_ingredient_name(name: str) -> str:
    """Clean ingredient name for nutrition lookup."""
    name = name.lower().strip()

    # Remove preparation descriptions
    remove_patterns = [
        r'\(.*?\)',  # anything in parens
        r',.*$',     # everything after comma
        r'\bpeeled\b', r'\bdeveined\b', r'\bchopped\b', r'\bminced\b',
        r'\bdiced\b', r'\bsliced\b', r'\bcrushed\b', r'\bshredded\b',
        r'\bgrated\b', r'\bmelted\b', r'\bsoftened\b', r'\bcubed\b',
        r'\bfresh\b', r'\bfrozen\b', r'\bdried\b', r'\bcanned\b',
        r'\bcooked\b', r'\buncooked\b', r'\braw\b', r'\bboiled\b',
        r'\bbaked\b', r'\bfried\b', r'\bgrilled\b', r'\broasted\b',
        r'\bor more\b', r'\bto taste\b', r'\bas needed\b',
        r'\bfinely\b', r'\broughly\b', r'\bthinly\b', r'\bthickly\b',
        r'\bboneless\b', r'\bskinless\b', r'\bbone-in\b', r'\bskin-on\b',
        r'\blarge\b', r'\bmedium\b', r'\bsmall\b', r'\bjumbo\b',
        r'\bextra\b', r'\bvirgin\b',
        r'\bdrained\b', r'\brinsed\b', r'\bpacked\b',
        r'\btails? (?:removed|left intact|on|off)\b',
        r'\bcut into.*$', r'\bhalved\b', r'\bquartered\b',
    ]
    for pattern in remove_patterns:
        name = re.sub(pattern, '', name)

    # Clean up whitespace
    name = re.sub(r'\s+', ' ', name).strip()
    return name


def find_nutrition(name: str) -> dict | None:
    """Look up nutrition per 100g for an ingredient name."""
    cleaned = clean_ingredient_name(name)

    # Direct match
    if cleaned in BUILTIN_NUTRITION:
        return BUILTIN_NUTRITION[cleaned]

    # Try matching by checking if any key is IN the cleaned name
    # Sort by length (longest first) for most specific match
    for key in sorted(BUILTIN_NUTRITION.keys(), key=len, reverse=True):
        if key in cleaned:
            return BUILTIN_NUTRITION[key]

    # Try checking if cleaned name is IN any key
    for key in sorted(BUILTIN_NUTRITION.keys(), key=len, reverse=True):
        if cleaned in key:
            return BUILTIN_NUTRITION[key]

    return None


def get_weight_in_grams(quantity: float, unit: str, name: str) -> float:
    """Convert an ingredient quantity + unit to grams."""
    unit_lower = unit.lower().strip().rstrip('.')

    # Handle "(X ounce) can/package/bag" pattern in ingredient name
    can_match = re.search(r'\((\d+\.?\d*)\s*(?:ounce|oz)\)', name.lower())
    if can_match:
        can_oz = float(can_match.group(1))
        return quantity * can_oz * 28.35

    # Handle "(X pound)" pattern in ingredient name
    lb_match = re.search(r'\((\d+\.?\d*)\s*(?:pound|lb)\)', name.lower())
    if lb_match:
        lbs = float(lb_match.group(1))
        return quantity * lbs * 453.6

    # Handle empty unit - likely a count
    if not unit_lower or unit_lower in ['', 'whole', 'each']:
        # Try to infer from name
        name_lower = name.lower()
        if 'egg' in name_lower:
            return quantity * 50
        elif 'breast' in name_lower:
            return quantity * 175
        elif 'thigh' in name_lower:
            return quantity * 125
        elif 'fillet' in name_lower or 'filet' in name_lower:
            return quantity * 170
        elif 'clove' in name_lower:
            return quantity * 5
        elif 'stalk' in name_lower:
            return quantity * 60
        elif 'shrimp' in name_lower or 'prawn' in name_lower:
            # Individual shrimp ~15g each (medium), ~20g (large), ~8g (small)
            if 'large' in name_lower or 'jumbo' in name_lower:
                return quantity * 20
            elif 'small' in name_lower:
                return quantity * 8
            else:
                return quantity * 15
        elif 'scallop' in name_lower:
            return quantity * 20
        elif 'meatball' in name_lower:
            return quantity * 30
        elif 'strip' in name_lower or 'slice' in name_lower:
            return quantity * 30
        elif 'cookie' in name_lower or 'cracker' in name_lower:
            return quantity * 15
        elif quantity > 10:
            # High count with no unit = small items, assume ~15g each
            return quantity * 15
        else:
            # Default: assume medium item ~100g
            return quantity * 100

    if unit_lower in UNIT_TO_GRAMS:
        return quantity * UNIT_TO_GRAMS[unit_lower]

    # Fuzzy unit matching
    for known_unit, grams in UNIT_TO_GRAMS.items():
        if known_unit in unit_lower or unit_lower in known_unit:
            return quantity * grams

    # Default: assume it's a count-based item
    return quantity * 100


def calculate_recipe_nutrition(ingredients: list, servings: int) -> dict | None:
    """Calculate per-serving nutrition from ingredient list."""
    total_cal = 0
    total_protein = 0
    total_carbs = 0
    total_fat = 0
    matched = 0
    total_ings = len(ingredients)

    for ing in ingredients:
        if isinstance(ing, str):
            # Old format - skip
            continue

        name = ing.get('name', '')
        unit = ing.get('unit', '')
        quantity_str = ing.get('quantity', '1')

        if not name:
            continue

        # Skip water, salt, pepper, seasonings
        name_lower = name.lower()
        if any(skip in name_lower for skip in ['water', 'salt', 'ice', 'spray', 'cooking spray', 'nonstick']):
            matched += 1  # Count as matched (zero nutrition)
            continue

        nutrition = find_nutrition(name)
        if not nutrition:
            continue

        matched += 1
        quantity = parse_quantity(quantity_str)
        weight_g = get_weight_in_grams(quantity, unit, name)

        # Nutrition is per 100g, scale to actual weight
        scale = weight_g / 100.0
        total_cal += nutrition['calories'] * scale
        total_protein += nutrition['protein'] * scale
        total_carbs += nutrition['carbs'] * scale
        total_fat += nutrition['fat'] * scale

    # Only return if we matched at least 50% of ingredients
    if total_ings == 0 or matched / total_ings < 0.5:
        return None

    # Per serving
    s = max(servings, 1)
    return {
        'calories': round(total_cal / s),
        'protein_grams': round(total_protein / s, 1),
        'carbs_grams': round(total_carbs / s, 1),
        'fat_grams': round(total_fat / s, 1),
        'matched_ratio': matched / total_ings,
    }


def main():
    db = get_database()

    # Fetch all recipes
    all_recipes = []
    offset = 0
    while True:
        result = db.table('recipes').select(
            'id, title, calories, protein_grams, carbs_grams, fat_grams, servings, ingredients'
        ).range(offset, offset + 999).execute()
        if not result.data:
            break
        all_recipes.extend(result.data)
        if len(result.data) < 1000:
            break
        offset += 1000

    print(f"Total recipes: {len(all_recipes)}")

    updated = 0
    skipped = 0
    errors = 0

    for i, recipe in enumerate(all_recipes):
        ingredients = recipe.get('ingredients', [])
        servings = recipe.get('servings', 1) or 1

        if not ingredients or not isinstance(ingredients, list):
            skipped += 1
            continue

        nutrition = calculate_recipe_nutrition(ingredients, servings)

        if not nutrition:
            skipped += 1
            continue

        # Update the recipe
        try:
            db.table('recipes').update({
                'calories': nutrition['calories'],
                'protein_grams': nutrition['protein_grams'],
                'carbs_grams': nutrition['carbs_grams'],
                'fat_grams': nutrition['fat_grams'],
            }).eq('id', recipe['id']).execute()
            updated += 1
        except Exception as e:
            errors += 1
            if errors < 5:
                print(f"  Error updating {recipe['title']}: {e}")

        if (i + 1) % 500 == 0:
            print(f"  Processed {i+1}... updated {updated}, skipped {skipped}")

    print(f"\nDone!")
    print(f"  Updated: {updated}")
    print(f"  Skipped (low match rate): {skipped}")
    print(f"  Errors: {errors}")

    # Spot check
    print("\n--- Spot checks ---")
    checks = ['shrimp linguine', 'chicken breast', 'garlic shrimp', 'beef stew']
    for term in checks:
        result = db.table('recipes').select(
            'title, calories, protein_grams, carbs_grams, fat_grams, servings'
        ).ilike('title', f'%{term}%').limit(3).execute()
        for r in result.data:
            print(f"  {r['title'][:40]}: {r['calories']}cal {r['protein_grams']}P {r['carbs_grams']}C {r['fat_grams']}F (serves {r['servings']})")


if __name__ == "__main__":
    main()
