from typing import List, Optional, Dict, Any
from fastapi import HTTPException, status
from app.database import get_database
from app.schemas.meal_plan import (
    MealPlanCreate, MealPlanUpdate, MealPlanResponse, 
    GroceryListResponse, GroceryItem, DayMeals, MealPlanMeal
)
from datetime import datetime, date
import logging

logger = logging.getLogger(__name__)


class MealPlanService:
    def __init__(self):
        self.db = get_database()
    
    async def create_meal_plan(self, meal_plan_data: MealPlanCreate, user_id: str) -> MealPlanResponse:
        """Create a new meal plan"""
        meal_plan_record = {
            "user_id": user_id,
            "plan_name": meal_plan_data.plan_name,
            "week_start_date": meal_plan_data.week_start_date.isoformat(),
            "meals": self._serialize_meals(meal_plan_data.meals)
        }
        
        result = self.db.table("meal_plans").insert(meal_plan_record).execute()
        
        if not result.data:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to create meal plan"
            )
        
        created_meal_plan = result.data[0]
        return await self._format_meal_plan_response(created_meal_plan)
    
    async def get_meal_plan_by_id(self, meal_plan_id: str, user_id: str) -> MealPlanResponse:
        """Get a meal plan by ID (user must own it)"""
        result = self.db.table("meal_plans").select("*").eq("id", meal_plan_id).eq("user_id", user_id).execute()
        
        if not result.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Meal plan not found"
            )
        
        meal_plan = result.data[0]
        return await self._format_meal_plan_response(meal_plan)
    
    async def update_meal_plan(self, meal_plan_id: str, meal_plan_data: MealPlanUpdate, user_id: str) -> MealPlanResponse:
        """Update a meal plan (only by owner)"""
        # Check if meal plan exists and user owns it
        existing_plan = self.db.table("meal_plans").select("*").eq("id", meal_plan_id).eq("user_id", user_id).execute()
        
        if not existing_plan.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Meal plan not found or you don't have permission to edit it"
            )
        
        # Prepare update data
        update_data = {}
        if meal_plan_data.plan_name is not None:
            update_data["plan_name"] = meal_plan_data.plan_name
        if meal_plan_data.week_start_date is not None:
            update_data["week_start_date"] = meal_plan_data.week_start_date.isoformat()
        if meal_plan_data.meals is not None:
            update_data["meals"] = self._serialize_meals(meal_plan_data.meals)
        
        if not update_data:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No valid fields to update"
            )
        
        result = self.db.table("meal_plans").update(update_data).eq("id", meal_plan_id).execute()
        
        if not result.data:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to update meal plan"
            )
        
        updated_meal_plan = result.data[0]
        return await self._format_meal_plan_response(updated_meal_plan)
    
    async def delete_meal_plan(self, meal_plan_id: str, user_id: str) -> bool:
        """Delete a meal plan (only by owner)"""
        # Check if meal plan exists and user owns it
        existing_plan = self.db.table("meal_plans").select("*").eq("id", meal_plan_id).eq("user_id", user_id).execute()
        
        if not existing_plan.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Meal plan not found or you don't have permission to delete it"
            )
        
        result = self.db.table("meal_plans").delete().eq("id", meal_plan_id).execute()
        return True
    
    async def get_user_meal_plans(self, user_id: str, limit: int = 20, offset: int = 0) -> List[MealPlanResponse]:
        """Get meal plans created by a user"""
        query = self.db.table("meal_plans").select("*").eq("user_id", user_id).order("created_at", desc=True)
        query = query.range(offset, offset + limit - 1)
        
        result = query.execute()
        
        meal_plans = []
        for meal_plan_data in result.data:
            meal_plan_response = await self._format_meal_plan_response(meal_plan_data)
            meal_plans.append(meal_plan_response)
        
        return meal_plans
    
    async def generate_grocery_list(self, meal_plan_id: str, user_id: str) -> GroceryListResponse:
        """Generate a grocery list from a meal plan"""
        # Get the meal plan
        meal_plan = await self.get_meal_plan_by_id(meal_plan_id, user_id)
        
        # Get all recipe IDs from the meal plan
        recipe_ids = set()
        for day_meals in meal_plan.meals.values():
            if isinstance(day_meals, dict):
                day_meals = DayMeals(**day_meals)
            
            for meal_slot in ['breakfast', 'lunch', 'dinner', 'snack']:
                meal = getattr(day_meals, meal_slot, None)
                if meal and hasattr(meal, 'recipe_id'):
                    recipe_ids.add(meal.recipe_id)
        
        if not recipe_ids:
            return GroceryListResponse(
                meal_plan_id=meal_plan_id,
                meal_plan_name=meal_plan.plan_name,
                week_start_date=meal_plan.week_start_date,
                items=[],
                items_by_category={}
            )
        
        # Get all recipes
        recipes_result = self.db.table("recipes").select("*").in_("id", list(recipe_ids)).execute()
        
        # Aggregate ingredients
        ingredient_totals = {}
        for recipe_data in recipes_result.data:
            ingredients = recipe_data.get("ingredients", [])
            for ingredient in ingredients:
                name = ingredient.get("name", "").lower()
                quantity = ingredient.get("quantity", "")
                unit = ingredient.get("unit", "")
                
                key = f"{name}_{unit}"
                if key not in ingredient_totals:
                    ingredient_totals[key] = {
                        "name": ingredient.get("name", ""),
                        "quantity": quantity,
                        "unit": unit,
                        "category": self._categorize_ingredient(ingredient.get("name", ""))
                    }
                # Note: For simplicity, we're not aggregating quantities
                # In a real app, you'd want to parse and sum quantities properly
        
        # Check user's pantry for items they already have
        pantry_result = self.db.table("pantry_items").select("item_name").eq("user_id", user_id).execute()
        pantry_items = {item["item_name"].lower() for item in pantry_result.data}
        
        # Create grocery items
        grocery_items = []
        for ingredient_data in ingredient_totals.values():
            have_in_pantry = ingredient_data["name"].lower() in pantry_items
            
            grocery_item = GroceryItem(
                name=ingredient_data["name"],
                quantity=ingredient_data["quantity"],
                unit=ingredient_data["unit"],
                category=ingredient_data["category"],
                have_in_pantry=have_in_pantry
            )
            grocery_items.append(grocery_item)
        
        # Group by category
        items_by_category = {}
        for item in grocery_items:
            if item.category not in items_by_category:
                items_by_category[item.category] = []
            items_by_category[item.category].append(item)
        
        return GroceryListResponse(
            meal_plan_id=meal_plan_id,
            meal_plan_name=meal_plan.plan_name,
            week_start_date=meal_plan.week_start_date,
            items=grocery_items,
            items_by_category=items_by_category
        )
    
    async def add_recipe_to_meal_plan(self, meal_plan_id: str, day: str, meal_slot: str, recipe_id: str, servings: int, user_id: str) -> MealPlanResponse:
        """Add a recipe to a specific meal slot in a meal plan"""
        # Get the meal plan
        meal_plan = await self.get_meal_plan_by_id(meal_plan_id, user_id)
        
        # Get recipe details
        recipe_result = self.db.table("recipes").select("id, title").eq("id", recipe_id).execute()
        if not recipe_result.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Recipe not found"
            )
        
        recipe = recipe_result.data[0]
        
        # Update the meal plan
        meals = meal_plan.meals
        if day not in meals:
            meals[day] = {}
        
        meals[day][meal_slot] = {
            "recipe_id": recipe_id,
            "recipe_title": recipe["title"],
            "servings": servings
        }
        
        # Save the updated meal plan
        update_data = MealPlanUpdate(meals=meals)
        return await self.update_meal_plan(meal_plan_id, update_data, user_id)
    
    def _serialize_meals(self, meals: Dict[str, DayMeals]) -> Dict[str, Any]:
        """Convert DayMeals objects to JSON-serializable dict"""
        serialized = {}
        for day, day_meals in meals.items():
            if isinstance(day_meals, DayMeals):
                serialized[day] = day_meals.dict(exclude_none=True)
            else:
                serialized[day] = day_meals
        return serialized
    
    async def _format_meal_plan_response(self, meal_plan_data: dict) -> MealPlanResponse:
        """Format raw meal plan data into MealPlanResponse"""
        return MealPlanResponse(
            id=meal_plan_data["id"],
            user_id=meal_plan_data["user_id"],
            plan_name=meal_plan_data["plan_name"],
            week_start_date=date.fromisoformat(meal_plan_data["week_start_date"]),
            meals=meal_plan_data["meals"],
            created_at=datetime.fromisoformat(meal_plan_data["created_at"].replace("Z", "+00:00"))
        )
    
    def _categorize_ingredient(self, ingredient_name: str) -> str:
        """Categorize an ingredient for grocery list organization"""
        ingredient_lower = ingredient_name.lower()
        
        # Simple categorization - in a real app, you'd want a more comprehensive system
        if any(word in ingredient_lower for word in ['lettuce', 'tomato', 'onion', 'carrot', 'pepper', 'spinach', 'broccoli', 'apple', 'banana']):
            return "Produce"
        elif any(word in ingredient_lower for word in ['milk', 'cheese', 'butter', 'cream', 'yogurt']):
            return "Dairy"
        elif any(word in ingredient_lower for word in ['chicken', 'beef', 'pork', 'fish', 'salmon', 'turkey', 'eggs']):
            return "Protein"
        elif any(word in ingredient_lower for word in ['rice', 'pasta', 'bread', 'flour', 'quinoa', 'oats']):
            return "Grains"
        elif any(word in ingredient_lower for word in ['salt', 'pepper', 'garlic', 'oregano', 'basil', 'thyme']):
            return "Spices"
        elif any(word in ingredient_lower for word in ['oil', 'vinegar', 'soy sauce', 'ketchup', 'mustard']):
            return "Condiments"
        else:
            return "Other"


# Global meal plan service instance
meal_plan_service = MealPlanService()