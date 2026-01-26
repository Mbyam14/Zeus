import anthropic
from typing import List, Optional, Dict, Any
from fastapi import HTTPException, status
from app.config import settings
from app.schemas.recipe import AIRecipeRequest, RecipeResponse, Ingredient, Instruction, DifficultyLevel
from app.schemas.meal_plan import AIMealPlanRequest, MealPlanResponse
from app.services.recipe_service import recipe_service
from app.services.nutrition_service import nutrition_service
import json
import logging
import asyncio
from concurrent.futures import ThreadPoolExecutor

logger = logging.getLogger(__name__)

# Timeout settings (in seconds)
RECIPE_GENERATION_TIMEOUT = 60  # 60 seconds for single recipe
MEAL_PLAN_GENERATION_TIMEOUT = 120  # 120 seconds for full meal plan (21 recipes)


class AIService:
    def __init__(self):
        try:
            self.client = anthropic.Anthropic(api_key=settings.anthropic_api_key)
            self.executor = ThreadPoolExecutor(max_workers=2)
        except Exception as e:
            logger.warning(f"Claude API not configured: {e}")
            self.client = None
            self.executor = None

    def _call_claude_sync(self, model: str, max_tokens: int, temperature: float, messages: list) -> str:
        """Synchronous Claude API call for use in executor"""
        response = self.client.messages.create(
            model=model,
            max_tokens=max_tokens,
            temperature=temperature,
            messages=messages
        )
        return response.content[0].text

    async def _call_claude_with_timeout(
        self,
        model: str,
        max_tokens: int,
        temperature: float,
        messages: list,
        timeout: int
    ) -> str:
        """Call Claude API with timeout handling"""
        loop = asyncio.get_event_loop()

        try:
            # Run the synchronous API call in a thread pool with timeout
            result = await asyncio.wait_for(
                loop.run_in_executor(
                    self.executor,
                    self._call_claude_sync,
                    model,
                    max_tokens,
                    temperature,
                    messages
                ),
                timeout=timeout
            )
            return result
        except asyncio.TimeoutError:
            logger.error(f"Claude API call timed out after {timeout} seconds")
            raise HTTPException(
                status_code=status.HTTP_504_GATEWAY_TIMEOUT,
                detail=f"AI generation timed out after {timeout} seconds. Please try again."
            )
    
    async def generate_recipe(self, request: AIRecipeRequest, user_id: str) -> RecipeResponse:
        """Generate a recipe using Claude AI based on user preferences"""
        if not self.client:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="AI recipe generation service not configured"
            )
        
        # Build the prompt
        prompt = self._build_recipe_prompt(request)
        
        try:
            # Call Claude API with timeout
            logger.info(f"Calling Claude API for recipe generation (timeout: {RECIPE_GENERATION_TIMEOUT}s)")
            response_text = await self._call_claude_with_timeout(
                model="claude-3-7-sonnet-20250219",
                max_tokens=2000,
                temperature=0.7,
                messages=[
                    {
                        "role": "user",
                        "content": prompt
                    }
                ],
                timeout=RECIPE_GENERATION_TIMEOUT
            )

            # Parse the response
            recipe_data = self._parse_recipe_response(response_text)
            
            # Create recipe using the recipe service
            from app.schemas.recipe import RecipeCreate
            recipe_create = RecipeCreate(
                title=recipe_data["title"],
                description=recipe_data["description"],
                ingredients=[Ingredient(**ing) for ing in recipe_data["ingredients"]],
                instructions=[Instruction(**inst) for inst in recipe_data["instructions"]],
                servings=recipe_data.get("servings", request.servings),
                prep_time=recipe_data.get("prep_time"),
                cook_time=recipe_data.get("cook_time"),
                cuisine_type=recipe_data.get("cuisine_type"),
                difficulty=DifficultyLevel(recipe_data.get("difficulty", "Medium")),
                meal_type=recipe_data.get("meal_type", []),
                dietary_tags=recipe_data.get("dietary_tags", [])
            )

            # Save as AI-generated recipe
            recipe_response = await recipe_service.create_recipe(recipe_create, user_id)

            # Update with nutrition data
            from app.database import get_database
            db = get_database()
            nutrition_data = {
                "is_ai_generated": True,
                "calories": recipe_data.get("calories"),
                "protein_grams": recipe_data.get("protein_grams"),
                "carbs_grams": recipe_data.get("carbs_grams"),
                "fat_grams": recipe_data.get("fat_grams"),
                "serving_size": recipe_data.get("serving_size")
            }
            db.table("recipes").update(nutrition_data).eq("id", recipe_response.id).execute()

            # Update response object with nutrition data
            recipe_response.is_ai_generated = True
            recipe_response.calories = recipe_data.get("calories")
            recipe_response.protein_grams = recipe_data.get("protein_grams")
            recipe_response.carbs_grams = recipe_data.get("carbs_grams")
            recipe_response.fat_grams = recipe_data.get("fat_grams")
            recipe_response.serving_size = recipe_data.get("serving_size")

            return recipe_response
            
        except Exception as e:
            logger.error(f"Failed to generate recipe with Claude: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to generate recipe. Please try again."
            )
    
    async def generate_meal_plan(self, request: AIMealPlanRequest, user_id: str, user_preferences: dict = None) -> Dict[str, Any]:
        """Generate a weekly meal plan using Claude AI with macro-aware targets"""
        if not self.client:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="AI meal plan generation service not configured"
            )

        # Build the prompt with user's nutrition targets
        prompt = self._build_meal_plan_prompt(request, user_preferences)

        # Add variety note to encourage different results each time
        import random
        variety_note = f"\n\nIMPORTANT: This is meal plan request #{random.randint(1000, 9999)}. Generate completely unique and creative recipes different from any previous requests."
        prompt += variety_note

        try:
            # Call Claude API for simplified meal plan with timeout
            logger.info(f"Calling Claude API for meal plan generation (timeout: {MEAL_PLAN_GENERATION_TIMEOUT}s)")
            raw_text = await self._call_claude_with_timeout(
                model="claude-3-7-sonnet-20250219",
                max_tokens=4000,
                temperature=0.7,
                messages=[
                    {
                        "role": "user",
                        "content": prompt
                    }
                ],
                timeout=MEAL_PLAN_GENERATION_TIMEOUT
            )

            # Parse the response
            meal_plan_data = self._parse_meal_plan_response(raw_text)

            return {
                "meal_plan": meal_plan_data,
                "suggested_recipes": meal_plan_data.get("recipes", []),
                "grocery_list": meal_plan_data.get("grocery_list", []),
                "tips": meal_plan_data.get("tips", [])
            }
            
        except Exception as e:
            logger.error(f"Failed to generate meal plan with Claude: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to generate meal plan. Please try again."
            )
    
    def _build_recipe_prompt(self, request: AIRecipeRequest) -> str:
        """Build a detailed prompt for recipe generation"""
        prompt = f"""
        Please generate a detailed recipe based on the following preferences:

        Available ingredients (pantry items): {', '.join(request.pantry_items) if request.pantry_items else 'None specified'}
        Cuisine preference: {request.cuisine_preference or 'Any'}
        Dietary restrictions: {', '.join(request.dietary_restrictions) if request.dietary_restrictions else 'None'}
        Cooking skill level: {request.cooking_skill or 'intermediate'}
        Maximum prep time: {request.max_prep_time or 'No limit'} minutes
        Servings: {request.servings}
        Meal type: {request.meal_type.value if request.meal_type else 'Any'}
        Additional preferences: {request.additional_preferences or 'None'}

        Please respond with a JSON object in this exact format:
        {{
            "title": "Recipe Name",
            "description": "Brief description of the dish",
            "ingredients": [
                {{"name": "ingredient name", "quantity": "amount", "unit": "measurement unit"}},
                ...
            ],
            "instructions": [
                {{"step": 1, "instruction": "detailed instruction"}},
                {{"step": 2, "instruction": "detailed instruction"}},
                ...
            ],
            "servings": {request.servings},
            "prep_time": 15,
            "cook_time": 30,
            "cuisine_type": "cuisine name",
            "difficulty": "Easy/Medium/Hard",
            "meal_type": ["Breakfast/Lunch/Dinner/Snack"],
            "dietary_tags": ["Vegetarian", "Gluten-Free", etc.],
            "calories": 450,
            "protein_grams": 35.0,
            "carbs_grams": 40.0,
            "fat_grams": 15.0,
            "serving_size": "1 plate"
        }}

        Guidelines:
        1. Use the pantry items when possible
        2. Respect dietary restrictions completely
        3. Match the cooking skill level - simpler for beginners
        4. Stay within the prep time limit if specified
        5. Make instructions clear and detailed
        6. Include realistic cooking times
        7. Suggest appropriate cuisine type and meal type
        8. Add relevant dietary tags
        9. IMPORTANT: Estimate nutrition values (calories, protein, carbs, fat) per serving based on ingredients and portions
        10. Provide a clear serving size description (e.g., "1 plate", "2 cups", "4 pieces")
        """

        return prompt
    
    def _build_meal_plan_prompt(self, request: AIMealPlanRequest, user_preferences: dict = None) -> str:
        """Build a detailed prompt for meal plan generation with macro targets and batch cooking support"""
        meals_per_day = ', '.join([meal.value for meal in request.meals_per_day])

        # Get user's macro targets with sensible defaults
        if user_preferences is None:
            user_preferences = {}

        calorie_target = user_preferences.get("calorie_target", 2000)
        protein_target = user_preferences.get("protein_target_grams", 150)

        # Get batch cooking preferences
        cooking_sessions = user_preferences.get("cooking_sessions_per_week", 6)
        leftover_tolerance = user_preferences.get("leftover_tolerance", "moderate")
        budget_friendly = user_preferences.get("budget_friendly", False)

        # Handle dynamic day selection
        all_days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
        selected_days = request.selected_days if request.selected_days else all_days
        num_days = len(selected_days)

        # Build days string for prompt
        days_str = ', '.join([d.capitalize() for d in selected_days])

        # Calculate unique recipe counts based on cooking sessions and number of days
        # Scale the recipe counts based on the number of days
        day_ratio = num_days / 7.0
        scaled_cooking_sessions = max(2, int(cooking_sessions * day_ratio))

        # Breakfasts: 2-3 unique (people often repeat breakfasts)
        # Dinners: cooking_sessions - breakfast count (these become lunch leftovers)
        # Lunches: 0-1 unique (rest are dinner leftovers)
        unique_breakfasts = min(3, max(1, int(scaled_cooking_sessions / 3)))
        unique_dinners = max(2, scaled_cooking_sessions - unique_breakfasts)
        unique_lunches = 1 if num_days > 2 else 0  # One unique lunch if more than 2 days
        total_unique = unique_breakfasts + unique_dinners + unique_lunches

        # Get user's custom distribution OR use defaults
        distribution = user_preferences.get("meal_calorie_distribution", {
            "breakfast": 25, "lunch": 35, "dinner": 40
        })

        # Calculate per-meal targets based on user's distribution
        breakfast_cals = int(calorie_target * distribution.get("breakfast", 25) / 100)
        lunch_cals = int(calorie_target * distribution.get("lunch", 35) / 100)
        dinner_cals = int(calorie_target * distribution.get("dinner", 40) / 100)

        # Calculate per-meal protein targets (same distribution)
        breakfast_protein = int(protein_target * distribution.get("breakfast", 25) / 100)
        lunch_protein = int(protein_target * distribution.get("lunch", 35) / 100)
        dinner_protein = int(protein_target * distribution.get("dinner", 40) / 100)

        # Calculate estimated weekly calories (based on selected days)
        weekly_calories = calorie_target * num_days
        total_meals = num_days * 3  # 3 meals per day

        prompt = f"""
        Generate a BATCH COOKING meal plan where recipes repeat throughout the selected days.

        ========== SELECTED DAYS ==========
        Generate meals for these {num_days} days ONLY: {days_str}
        DO NOT include any days outside this list.
        ===================================

        ========== BATCH COOKING REQUIREMENTS ==========
        The user wants to cook only {scaled_cooking_sessions} times for this {num_days}-day plan.
        This means you must CREATE FEWER UNIQUE RECIPES and REPEAT them across meals.

        EXACT RECIPE COUNTS TO CREATE:
        - Create exactly {unique_breakfasts} BREAKFAST recipes (these will repeat across {num_days} days)
        - Create exactly {unique_dinners} DINNER recipes (each dinner becomes the next day's lunch)
        - Create exactly {unique_lunches} standalone LUNCH recipe (for days without dinner leftovers)

        TOTAL UNIQUE RECIPES TO CREATE: {total_unique}
        DO NOT create {total_meals} different recipes. Create exactly {total_unique} recipes and repeat them.

        REPEAT PATTERN EXAMPLE (adapt to your selected days):
        - Breakfast A appears on multiple days
        - One day's dinner becomes the next day's lunch (same recipe, same title)
        =================================================

        ========== NUTRITION TARGETS (NON-NEGOTIABLE) ==========
        DAILY CALORIE TARGET: {calorie_target} calories
        DAILY PROTEIN TARGET: {protein_target}g protein

        PER-MEAL CALORIE TARGETS (User-configured distribution):
        - Breakfast: {breakfast_cals} calories ({distribution.get("breakfast", 25)}% of daily)
        - Lunch: {lunch_cals} calories ({distribution.get("lunch", 35)}% of daily)
        - Dinner: {dinner_cals} calories ({distribution.get("dinner", 40)}% of daily)

        PER-MEAL PROTEIN TARGETS:
        - Breakfast: ~{breakfast_protein}g protein
        - Lunch: ~{lunch_protein}g protein
        - Dinner: ~{dinner_protein}g protein

        CRITICAL: Each meal MUST hit these calorie targets within 10%.
        ==========================================================

        User Context:
        - Week starting: {request.week_start_date}
        - Dietary preferences: {', '.join(request.dietary_preferences) if request.dietary_preferences else 'None'}
        - Cuisine preferences: {', '.join(request.cuisine_preferences) if request.cuisine_preferences else 'Any'}
        - Cooking skill: {request.cooking_skill or 'intermediate'}
        - Pantry items available: {', '.join(request.pantry_items) if request.pantry_items else 'None'}
        - Servings per meal: {request.servings_per_meal}
        - Budget mode: {'ENABLED - prioritize cheap ingredients!' if budget_friendly else 'Standard'}

        {"=" * 50 if budget_friendly else ""}
        {"BUDGET-FRIENDLY MODE ACTIVE" if budget_friendly else ""}
        {"=" * 50 if budget_friendly else ""}
        {'''
        IMPORTANT COST-SAVING REQUIREMENTS:
        1. MAXIMIZE pantry item usage - use as many items from the pantry list above as possible
        2. Use CHEAP protein sources: eggs, canned beans, lentils, chicken thighs, ground turkey, tofu, canned tuna
        3. Use CHEAP staples: rice, pasta, potatoes, oats, bread, frozen vegetables
        4. AVOID expensive ingredients: salmon, steak, shrimp, fresh berries out of season, specialty cheeses
        5. Prefer BULK-FRIENDLY recipes: soups, stews, casseroles, rice bowls, pasta dishes
        6. Recipes should use overlapping ingredients to minimize grocery shopping
        7. Choose ingredients that are typically on sale or budget-friendly
        ''' if budget_friendly else ''}

        RESPONSE FORMAT:
        1. Respond with ONLY valid JSON - no markdown, no explanations.
        2. DO NOT include ingredients lists or step-by-step instructions.
        3. DO NOT use emojis or special unicode characters.
        4. REUSE recipes as specified above - do NOT generate 21 unique meals!

        JSON STRUCTURE:
        {{
            "week_summary": {{
                "total_unique_recipes": {total_unique},
                "estimated_total_calories": {weekly_calories},
                "daily_calorie_target": {calorie_target},
                "cooking_sessions": {scaled_cooking_sessions},
                "num_days": {num_days}
            }},
            "meals": {{
                "{selected_days[0]}": {{
                    "breakfast": {{ "title": "Protein Oatmeal Bowl", "description": "...", "prep_time": 5, "cook_time": 10, "servings": {request.servings_per_meal}, "calories": {breakfast_cals}, "protein_grams": {breakfast_protein}, "carbs_grams": 45, "fat_grams": 12, "cuisine_type": "American", "difficulty": "Easy", "meal_type": ["Breakfast"] }},
                    "lunch": {{ "title": "Chicken Caesar Salad", "description": "...", "prep_time": 10, "cook_time": 0, "servings": {request.servings_per_meal}, "calories": {lunch_cals}, "protein_grams": {lunch_protein}, "carbs_grams": 20, "fat_grams": 25, "cuisine_type": "American", "difficulty": "Easy", "meal_type": ["Lunch"] }},
                    "dinner": {{ "title": "Beef Stir Fry with Rice", "description": "Makes enough for tomorrow's lunch too", "prep_time": 15, "cook_time": 20, "servings": {request.servings_per_meal}, "calories": {dinner_cals}, "protein_grams": {dinner_protein}, "carbs_grams": 50, "fat_grams": 20, "cuisine_type": "Asian", "difficulty": "Medium", "meal_type": ["Dinner", "Lunch"] }}
                }},
                ... include ONLY the selected days: {days_str}
            }},
            "grocery_list": []
        }}

        CRITICAL RULES FOR RECIPE REUSE:
        1. Create exactly {unique_breakfasts} breakfast recipes - REPEAT them to fill all {num_days} days
        2. Create exactly {unique_dinners} dinner recipes - each dinner REPEATS as the next day's lunch
        3. For lunch: use the EXACT SAME title as the previous day's dinner (it's a leftover)
        4. When repeating a recipe, use IDENTICAL title, calories, protein values
        5. Each meal MUST hit calorie targets within 10%
        6. difficulty must be EXACTLY "Easy", "Medium", or "Hard"
        7. Dinners should be "leftover-friendly" foods (stews, stir-fries, casseroles, grain bowls)
        8. ONLY include meals for the selected days: {days_str}
        """

        return prompt
    
    def _parse_recipe_response(self, response_text: str) -> Dict[str, Any]:
        """Parse Claude's recipe response into structured data"""
        try:
            # Extract JSON from response
            start_idx = response_text.find('{')
            end_idx = response_text.rfind('}') + 1

            if start_idx == -1 or end_idx == 0:
                raise ValueError("No JSON found in response")

            json_str = response_text[start_idx:end_idx]
            recipe_data = json.loads(json_str)

            # Validate required fields
            required_fields = ['title', 'ingredients', 'instructions']
            for field in required_fields:
                if field not in recipe_data:
                    raise ValueError(f"Missing required field: {field}")

            # Ensure instructions have proper step numbers
            for i, instruction in enumerate(recipe_data['instructions']):
                if 'step' not in instruction:
                    instruction['step'] = i + 1

            # Validate nutrition data
            nutrition_validation = nutrition_service.validate_nutrition(
                recipe_data.get("calories"),
                recipe_data.get("protein_grams"),
                recipe_data.get("carbs_grams"),
                recipe_data.get("fat_grams")
            )

            # Log validation warnings
            if nutrition_validation.warnings:
                for warning in nutrition_validation.warnings:
                    logger.warning(f"Nutrition warning for {recipe_data.get('title')}: {warning}")

            # Apply corrected values if there were severe calculation errors
            if "calories" in nutrition_validation.corrected_values:
                logger.info(f"Correcting calories for {recipe_data.get('title')}: "
                           f"{recipe_data.get('calories')} -> {nutrition_validation.corrected_values['calories']}")
                recipe_data["calories"] = nutrition_validation.corrected_values["calories"]

            # Store validation metadata
            recipe_data["_nutrition_validated"] = nutrition_validation.valid
            recipe_data["_nutrition_warnings"] = nutrition_validation.warnings

            return recipe_data

        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse recipe JSON: {e}")
            raise ValueError("Invalid JSON in recipe response")
        except Exception as e:
            logger.error(f"Failed to parse recipe response: {e}")
            raise ValueError("Failed to parse recipe response")
    
    def _parse_meal_plan_response(self, response_text: str) -> Dict[str, Any]:
        """Parse Claude's meal plan response into structured data"""
        try:
            # Extract JSON from response
            start_idx = response_text.find('{')
            end_idx = response_text.rfind('}') + 1
            
            if start_idx == -1 or end_idx == 0:
                raise ValueError("No JSON found in response")
            
            json_str = response_text[start_idx:end_idx]
            meal_plan_data = json.loads(json_str)
            
            return meal_plan_data
            
        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse meal plan JSON: {e}")
            raise ValueError("Invalid JSON in meal plan response")
        except Exception as e:
            logger.error(f"Failed to parse meal plan response: {e}")
            raise ValueError("Failed to parse meal plan response")


# Global AI service instance
ai_service = AIService()