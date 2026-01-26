"""
Nutrition Validation and Macro Tracking Service

Provides validation for AI-generated nutrition data and dietary compliance checking.
"""

from typing import List, Dict, Any, Optional
import logging

logger = logging.getLogger(__name__)


# Forbidden ingredients by dietary restriction
FORBIDDEN_INGREDIENTS = {
    'vegan': [
        'butter', 'milk', 'eggs', 'egg', 'chicken', 'beef', 'pork', 'fish',
        'honey', 'cheese', 'cream', 'yogurt', 'bacon', 'ham', 'turkey',
        'lamb', 'duck', 'shrimp', 'salmon', 'tuna', 'crab', 'lobster',
        'scallop', 'mussel', 'oyster', 'anchovy', 'gelatin', 'lard',
        'whey', 'casein', 'ghee', 'mayonnaise', 'mayo'
    ],
    'vegetarian': [
        'chicken', 'beef', 'pork', 'fish', 'bacon', 'ham', 'turkey',
        'lamb', 'duck', 'shrimp', 'salmon', 'tuna', 'crab', 'lobster',
        'scallop', 'mussel', 'oyster', 'anchovy', 'meat', 'seafood',
        'prosciutto', 'pepperoni', 'sausage', 'steak', 'ribs'
    ],
    'gluten-free': [
        'wheat', 'flour', 'bread', 'pasta', 'barley', 'rye', 'couscous',
        'semolina', 'spelt', 'farro', 'bulgur', 'seitan', 'breadcrumbs',
        'panko', 'croutons', 'noodles', 'tortilla', 'pita', 'naan',
        'soy sauce', 'teriyaki'
    ],
    'dairy-free': [
        'milk', 'butter', 'cheese', 'cream', 'yogurt', 'whey', 'casein',
        'ghee', 'parmesan', 'mozzarella', 'cheddar', 'feta', 'ricotta',
        'cottage cheese', 'sour cream', 'ice cream', 'half and half',
        'condensed milk', 'evaporated milk'
    ],
    'nut-free': [
        'peanut', 'almond', 'cashew', 'walnut', 'pecan', 'pistachio',
        'hazelnut', 'macadamia', 'brazil nut', 'pine nut', 'chestnut',
        'nut butter', 'peanut butter', 'almond butter', 'nutella',
        'marzipan', 'praline', 'nougat'
    ],
    'keto': [
        # Foods that are typically too high in carbs for keto
        'sugar', 'flour', 'bread', 'pasta', 'rice', 'potato', 'corn',
        'banana', 'grape', 'mango', 'apple', 'orange', 'honey',
        'maple syrup', 'agave', 'oatmeal', 'cereal', 'beans', 'lentils',
        'quinoa', 'couscous'
    ],
    'paleo': [
        'bread', 'pasta', 'rice', 'beans', 'lentils', 'peanut', 'tofu',
        'soy', 'dairy', 'milk', 'cheese', 'yogurt', 'sugar', 'corn',
        'potato', 'cereal', 'oatmeal', 'canola oil', 'vegetable oil'
    ],
    'pescatarian': [
        'chicken', 'beef', 'pork', 'bacon', 'ham', 'turkey', 'lamb',
        'duck', 'meat', 'prosciutto', 'pepperoni', 'sausage', 'steak',
        'ribs', 'veal', 'venison'
    ]
}


class NutritionValidationResult:
    """Result of nutrition validation"""
    def __init__(self):
        self.valid = True
        self.errors: List[str] = []
        self.warnings: List[str] = []
        self.corrected_values: Dict[str, Any] = {}


class DietaryComplianceResult:
    """Result of dietary compliance check"""
    def __init__(self):
        self.compliant = True
        self.violations: List[Dict[str, str]] = []


class NutritionService:
    """Service for nutrition validation and macro tracking"""

    @staticmethod
    def validate_nutrition(
        calories: Optional[int],
        protein: Optional[float],
        carbs: Optional[float],
        fat: Optional[float]
    ) -> NutritionValidationResult:
        """
        Validate nutrition data and flag anomalies.

        Checks for:
        - Negative values
        - Unrealistic ranges
        - Macro math consistency (4 cal/g protein & carbs, 9 cal/g fat)
        """
        result = NutritionValidationResult()

        # Handle None values
        if calories is None and protein is None and carbs is None and fat is None:
            result.warnings.append("No nutrition data provided")
            return result

        # Default to 0 for None values in calculations
        cal = calories or 0
        prot = protein or 0
        carb = carbs or 0
        f = fat or 0

        # Check for negative values
        if cal < 0:
            result.errors.append("Calories cannot be negative")
            result.valid = False
        if prot < 0:
            result.errors.append("Protein cannot be negative")
            result.valid = False
        if carb < 0:
            result.errors.append("Carbs cannot be negative")
            result.valid = False
        if f < 0:
            result.errors.append("Fat cannot be negative")
            result.valid = False

        # Check for unrealistic ranges (per serving)
        if cal > 2000:
            result.warnings.append(f"Very high calorie count ({cal}) for a single serving")
        if prot > 100:
            result.warnings.append(f"Unusually high protein ({prot}g) for a single serving")
        if carb > 200:
            result.warnings.append(f"Unusually high carbs ({carb}g) for a single serving")
        if f > 100:
            result.warnings.append(f"Unusually high fat ({f}g) for a single serving")

        # Macro math check: 4 cal/g protein & carbs, 9 cal/g fat
        if cal > 0 and (prot > 0 or carb > 0 or f > 0):
            calculated_cals = (prot * 4) + (carb * 4) + (f * 9)
            margin = abs(calculated_cals - cal)
            margin_pct = (margin / cal * 100) if cal > 0 else 0

            if margin > 100 and margin_pct > 20:
                result.warnings.append(
                    f"Macro math inconsistency: calculated {int(calculated_cals)} cal vs stated {cal} cal "
                    f"(difference: {int(margin)} cal, {margin_pct:.1f}%)"
                )
                # Provide corrected value
                result.corrected_values["calculated_calories"] = int(calculated_cals)

            # Severe inconsistency - likely AI hallucination
            if margin > 500 or margin_pct > 50:
                result.errors.append(
                    f"Severe macro calculation mismatch - likely AI error. "
                    f"Stated: {cal} cal, Calculated from macros: {int(calculated_cals)} cal"
                )
                result.valid = False
                result.corrected_values["calories"] = int(calculated_cals)

        return result

    @staticmethod
    def validate_dietary_compliance(
        ingredients: List[Dict[str, Any]],
        dietary_restrictions: List[str]
    ) -> DietaryComplianceResult:
        """
        Check recipe ingredients against dietary restrictions.

        Args:
            ingredients: List of ingredient dicts with 'name' or 'item' field
            dietary_restrictions: List of dietary restrictions (e.g., ['vegan', 'gluten-free'])

        Returns:
            DietaryComplianceResult with compliance status and any violations
        """
        result = DietaryComplianceResult()

        if not ingredients or not dietary_restrictions:
            return result

        # Normalize dietary restrictions
        restrictions = [r.lower().strip() for r in dietary_restrictions]

        # Build ingredient text for searching
        ingredient_names = []
        for ing in ingredients:
            name = ing.get("name") or ing.get("item") or ""
            if name:
                ingredient_names.append(name.lower())

        ingredient_text = " ".join(ingredient_names)

        # Check each restriction
        for restriction in restrictions:
            forbidden = FORBIDDEN_INGREDIENTS.get(restriction, [])
            for forbidden_item in forbidden:
                # Check if forbidden item appears in any ingredient
                if forbidden_item.lower() in ingredient_text:
                    # Find which specific ingredient contains it
                    found_in = None
                    for ing_name in ingredient_names:
                        if forbidden_item.lower() in ing_name:
                            found_in = ing_name
                            break

                    result.violations.append({
                        "restriction": restriction,
                        "forbidden_ingredient": forbidden_item,
                        "found_in": found_in or "unknown ingredient"
                    })
                    result.compliant = False

        return result

    @staticmethod
    def calculate_weekly_summary(recipes: List[Dict[str, Any]], num_days: int = 7) -> Dict[str, Any]:
        """
        Calculate nutrition totals and daily averages for a meal plan.

        Args:
            recipes: List of recipe dicts with nutrition fields
            num_days: Number of days in the meal plan (default: 7)

        Returns:
            Summary dict with period totals, daily averages, and macro percentages
        """
        total_calories = 0
        total_protein = 0.0
        total_carbs = 0.0
        total_fat = 0.0
        recipe_count = 0

        for recipe in recipes:
            if not recipe:
                continue

            recipe_count += 1
            total_calories += recipe.get("calories") or 0
            total_protein += recipe.get("protein_grams") or 0
            total_carbs += recipe.get("carbs_grams") or 0
            total_fat += recipe.get("fat_grams") or 0

        # Calculate daily averages based on the number of days in the plan
        days = max(1, num_days)  # Prevent division by zero
        daily_calories = total_calories / days if total_calories > 0 else 0
        daily_protein = total_protein / days if total_protein > 0 else 0
        daily_carbs = total_carbs / days if total_carbs > 0 else 0
        daily_fat = total_fat / days if total_fat > 0 else 0

        # Calculate macro percentages
        protein_cals = total_protein * 4
        carbs_cals = total_carbs * 4
        fat_cals = total_fat * 9
        total_macro_cals = protein_cals + carbs_cals + fat_cals

        protein_pct = (protein_cals / total_macro_cals * 100) if total_macro_cals > 0 else 0
        carbs_pct = (carbs_cals / total_macro_cals * 100) if total_macro_cals > 0 else 0
        fat_pct = (fat_cals / total_macro_cals * 100) if total_macro_cals > 0 else 0

        return {
            "recipe_count": recipe_count,
            "weekly_totals": {
                "calories": total_calories,
                "protein_grams": round(total_protein, 1),
                "carbs_grams": round(total_carbs, 1),
                "fat_grams": round(total_fat, 1),
            },
            "daily_averages": {
                "calories": round(daily_calories),
                "protein_grams": round(daily_protein, 1),
                "carbs_grams": round(daily_carbs, 1),
                "fat_grams": round(daily_fat, 1),
            },
            "macro_percentages": {
                "protein_pct": round(protein_pct, 1),
                "carbs_pct": round(carbs_pct, 1),
                "fat_pct": round(fat_pct, 1),
            }
        }

    @staticmethod
    def calculate_daily_summary(recipes: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Calculate daily nutrition totals for a single day's meals.

        Args:
            recipes: List of recipe dicts for a single day

        Returns:
            Summary dict with daily totals and macro percentages
        """
        total_calories = 0
        total_protein = 0.0
        total_carbs = 0.0
        total_fat = 0.0

        for recipe in recipes:
            if not recipe:
                continue

            total_calories += recipe.get("calories") or 0
            total_protein += recipe.get("protein_grams") or 0
            total_carbs += recipe.get("carbs_grams") or 0
            total_fat += recipe.get("fat_grams") or 0

        # Calculate macro percentages
        protein_cals = total_protein * 4
        carbs_cals = total_carbs * 4
        fat_cals = total_fat * 9
        total_macro_cals = protein_cals + carbs_cals + fat_cals

        protein_pct = (protein_cals / total_macro_cals * 100) if total_macro_cals > 0 else 0
        carbs_pct = (carbs_cals / total_macro_cals * 100) if total_macro_cals > 0 else 0
        fat_pct = (fat_cals / total_macro_cals * 100) if total_macro_cals > 0 else 0

        return {
            "totals": {
                "calories": total_calories,
                "protein_grams": round(total_protein, 1),
                "carbs_grams": round(total_carbs, 1),
                "fat_grams": round(total_fat, 1),
            },
            "macro_percentages": {
                "protein_pct": round(protein_pct, 1),
                "carbs_pct": round(carbs_pct, 1),
                "fat_pct": round(fat_pct, 1),
            }
        }


# Global service instance
nutrition_service = NutritionService()
