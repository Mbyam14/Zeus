import api from './api';
import {
  MealPlan,
  Recipe,
  MealPlanGenerateResponse,
  DayOfWeek,
  MealType
} from '../types/mealplan';

export const mealPlanService = {
  /**
   * Generate a new AI-powered meal plan for the week
   */
  async generateMealPlan(startDate: string): Promise<MealPlanGenerateResponse> {
    const response = await api.post<MealPlanGenerateResponse>(
      '/api/meal-plans/generate/',
      null,
      { params: { start_date: startDate } }
    );
    return response.data;
  },

  /**
   * Get the current week's meal plan
   */
  async getCurrentWeekMealPlan(): Promise<MealPlan | null> {
    const response = await api.get<MealPlan | null>('/api/meal-plans/current/');
    return response.data;
  },

  /**
   * Get a specific meal plan by ID
   */
  async getMealPlan(mealPlanId: string): Promise<MealPlan> {
    const response = await api.get<MealPlan>(`/api/meal-plans/${mealPlanId}/`);
    return response.data;
  },

  /**
   * Regenerate a single meal in an existing meal plan
   */
  async regenerateMeal(
    mealPlanId: string,
    day: DayOfWeek,
    mealType: MealType
  ): Promise<Recipe> {
    const response = await api.post<Recipe>(
      `/api/meal-plans/${mealPlanId}/regenerate-meal/`,
      null,
      {
        params: {
          day,
          meal_type: mealType
        }
      }
    );
    return response.data;
  },

  /**
   * Get a specific recipe by ID
   */
  async getRecipe(recipeId: string): Promise<Recipe> {
    const response = await api.get<Recipe>(`/api/recipes/${recipeId}/`);
    return response.data;
  },

  /**
   * Get multiple recipes by IDs (batch fetch)
   */
  async getRecipes(recipeIds: string[]): Promise<Recipe[]> {
    const promises = recipeIds.map(id => this.getRecipe(id));
    return Promise.all(promises);
  }
};

export default mealPlanService;
