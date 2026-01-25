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
    
    async def generate_meal_plan(self, request: AIMealPlanRequest, user_id: str) -> Dict[str, Any]:
        """Generate a weekly meal plan using Claude AI"""
        if not self.client:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="AI meal plan generation service not configured"
            )

        # Build the prompt
        prompt = self._build_meal_plan_prompt(request)

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
    
    def _build_meal_plan_prompt(self, request: AIMealPlanRequest) -> str:
        """Build a detailed prompt for meal plan generation"""
        meals_per_day = ', '.join([meal.value for meal in request.meals_per_day])

        prompt = f"""
        Please generate a complete weekly meal plan with FULL recipe details for each meal.

        Meals per day: {meals_per_day}
        Week starting: {request.week_start_date}
        Goals: {', '.join(request.goals) if request.goals else 'None'}
        Dietary preferences: {', '.join(request.dietary_preferences) if request.dietary_preferences else 'None'}
        Cuisine preferences: {', '.join(request.cuisine_preferences) if request.cuisine_preferences else 'Any'}
        Cooking skill: {request.cooking_skill or 'intermediate'}
        Available pantry items: {', '.join(request.pantry_items) if request.pantry_items else 'None'}
        Servings per meal: {request.servings_per_meal}

        IMPORTANT:
        1. For each meal, provide ONLY basic information (title, description, macros, times).
        2. DO NOT include full ingredients lists or step-by-step instructions - we'll generate those separately.
        3. You MUST respond with ONLY valid JSON - no markdown, no explanations before or after.
        4. Ensure all JSON is properly formatted with correct commas, brackets, and quotes.
        5. Complete all 7 days with all 3 meals each.
        6. DO NOT use emojis or special unicode characters in any text fields - use plain ASCII text only.

        Please respond with a JSON object in this EXACT format:
        {{
            "week_summary": {{
                "total_unique_recipes": 21,
                "estimated_weekly_calories": 14000,
                "variety_score": "high"
            }},
            "meals": {{
                "monday": {{
                    "breakfast": {{
                        "title": "Scrambled Eggs with Toast",
                        "description": "Fluffy scrambled eggs with whole grain toast",
                        "prep_time": 5,
                        "cook_time": 10,
                        "servings": {request.servings_per_meal},
                        "calories": 350,
                        "protein_grams": 20.0,
                        "carbs_grams": 45.0,
                        "fat_grams": 12.0,
                        "cuisine_type": "American",
                        "difficulty": "Easy"  // Must be EXACTLY one of: "Easy", "Medium", or "Hard" - no other values allowed
                    }},
                    "lunch": {{
                        "title": "Chicken Caesar Salad",
                        "description": "Fresh romaine with grilled chicken",
                        "prep_time": 10,
                        "cook_time": 15,
                        "servings": {request.servings_per_meal},
                        "calories": 420,
                        "protein_grams": 35.0,
                        "carbs_grams": 20.0,
                        "fat_grams": 18.0,
                        "cuisine_type": "American",
                        "difficulty": "Medium"
                    }},
                    "dinner": {{ /* same simplified structure */ }}
                }},
                "tuesday": {{ /* same structure for all meals */ }},
                ... (continue for all 7 days: monday through sunday)
            }},
            "grocery_list": [
                {{"ingredient": "tomatoes", "quantity": "6", "unit": "pieces", "already_have": false}}
            ]
        }}

        Guidelines:
        1. Generate 21 SIMPLIFIED meal entries (breakfast, lunch, dinner for 7 days)
        2. REQUIRED: Follow dietary restrictions completely - this is non-negotiable
        3. DO NOT include ingredients or instructions in this response
        4. Create varied, balanced meals across the week
        5. Maximize use of pantry items to reduce grocery needs
        6. Respect dietary preferences completely
        7. Match cooking skill level
        8. Estimate realistic macros (calories, protein, carbs, fat) per serving
        9. CRITICAL: Ensure MAXIMUM variety - use diverse cuisines (Italian, Mexican, Asian, Mediterranean, Indian, Thai, etc.)
        10. CRITICAL: Never repeat the same recipe name or concept - make each meal unique and creative
        11. Mix up cooking methods (grilled, roasted, stir-fried, baked, etc.) for variety
        12. Keep the response concise to ensure valid JSON
        13. CRITICAL: difficulty must be EXACTLY "Easy", "Medium", or "Hard" - no other values like "Intermediate" are allowed
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