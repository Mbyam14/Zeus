import anthropic
from typing import List, Optional, Dict, Any
from fastapi import HTTPException, status
from app.config import settings
from app.schemas.recipe import AIRecipeRequest, RecipeResponse, Ingredient, Instruction, DifficultyLevel
from app.schemas.meal_plan import AIMealPlanRequest, MealPlanResponse
from app.services.recipe_service import recipe_service
import json
import logging

logger = logging.getLogger(__name__)


class AIService:
    def __init__(self):
        try:
            self.client = anthropic.Anthropic(api_key=settings.anthropic_api_key)
        except Exception as e:
            logger.warning(f"Claude API not configured: {e}")
            self.client = None
    
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
            # Call Claude API
            response = self.client.messages.create(
                model="claude-3-sonnet-20240229",
                max_tokens=2000,
                temperature=0.7,
                messages=[
                    {
                        "role": "user",
                        "content": prompt
                    }
                ]
            )
            
            # Parse the response
            recipe_data = self._parse_recipe_response(response.content[0].text)
            
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
            
            # Mark as AI-generated
            from app.database import get_database
            db = get_database()
            db.table("recipes").update({"is_ai_generated": True}).eq("id", recipe_response.id).execute()
            recipe_response.is_ai_generated = True
            
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
        
        try:
            # Call Claude API
            response = self.client.messages.create(
                model="claude-3-sonnet-20240229",
                max_tokens=3000,
                temperature=0.7,
                messages=[
                    {
                        "role": "user", 
                        "content": prompt
                    }
                ]
            )
            
            # Parse the response
            meal_plan_data = self._parse_meal_plan_response(response.content[0].text)
            
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
            "dietary_tags": ["Vegetarian", "Gluten-Free", etc.]
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
        """
        
        return prompt
    
    def _build_meal_plan_prompt(self, request: AIMealPlanRequest) -> str:
        """Build a detailed prompt for meal plan generation"""
        meals_per_day = ', '.join([meal.value for meal in request.meals_per_day])
        
        prompt = f"""
        Please generate a weekly meal plan based on these preferences:

        Meals per day: {meals_per_day}
        Week starting: {request.week_start_date}
        Goals: {', '.join(request.goals) if request.goals else 'None'}
        Dietary preferences: {', '.join(request.dietary_preferences) if request.dietary_preferences else 'None'}
        Cuisine preferences: {', '.join(request.cuisine_preferences) if request.cuisine_preferences else 'Any'}
        Cooking skill: {request.cooking_skill or 'intermediate'}
        Available pantry items: {', '.join(request.pantry_items) if request.pantry_items else 'None'}
        Servings per meal: {request.servings_per_meal}

        Please respond with a JSON object in this exact format:
        {{
            "week_plan": {{
                "monday": {{
                    "breakfast": {{"recipe_name": "name", "description": "brief desc"}} or null,
                    "lunch": {{"recipe_name": "name", "description": "brief desc"}} or null,
                    "dinner": {{"recipe_name": "name", "description": "brief desc"}} or null,
                    "snack": {{"recipe_name": "name", "description": "brief desc"}} or null
                }},
                ... (continue for all 7 days)
            }},
            "grocery_list": [
                {{"item": "ingredient name", "quantity": "amount", "category": "Produce/Dairy/etc"}}
            ],
            "tips": [
                "Meal prep tip 1",
                "Meal prep tip 2"
            ]
        }}

        Guidelines:
        1. Create varied, balanced meals
        2. Consider meal prep opportunities (batch cooking)
        3. Use pantry items when possible
        4. Respect dietary preferences completely
        5. Match cooking skill level
        6. Include only requested meal types
        7. Generate a comprehensive grocery list
        8. Add helpful meal prep tips
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