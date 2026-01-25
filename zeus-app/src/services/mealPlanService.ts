import api from './api';
import {
  MealPlan,
  Recipe,
  MealPlanGenerateResponse,
  DayOfWeek,
  MealType,
  MacroSummaryResponse
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
   * Get multiple recipes by IDs (batch fetch with resilient error handling)
   * Uses Promise.allSettled to handle partial failures gracefully
   */
  async getRecipes(recipeIds: string[]): Promise<Recipe[]> {
    if (!recipeIds || recipeIds.length === 0) {
      return [];
    }

    // Filter out any invalid IDs
    const validIds = recipeIds.filter(id => typeof id === 'string' && id.trim().length > 0);

    if (validIds.length === 0) {
      return [];
    }

    const promises = validIds.map(id => this.getRecipe(id));
    const results = await Promise.allSettled(promises);

    const recipes: Recipe[] = [];
    const failures: string[] = [];

    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        recipes.push(result.value);
      } else {
        failures.push(validIds[index]);
        console.warn(`Failed to load recipe ${validIds[index]}:`, result.reason);
      }
    });

    // Retry failed recipes once
    if (failures.length > 0 && failures.length < validIds.length) {
      console.log(`Retrying ${failures.length} failed recipe(s)...`);

      const retryPromises = failures.map(id => this.getRecipe(id));
      const retryResults = await Promise.allSettled(retryPromises);

      retryResults.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          recipes.push(result.value);
          console.log(`Successfully loaded recipe ${failures[index]} on retry`);
        } else {
          console.error(`Failed to load recipe ${failures[index]} after retry:`, result.reason);
        }
      });
    }

    return recipes;
  },

  /**
   * Get macro nutrition summary for a meal plan
   */
  async getMacroSummary(mealPlanId: string): Promise<MacroSummaryResponse> {
    const response = await api.get<MacroSummaryResponse>(
      `/api/meal-plans/${mealPlanId}/macro-summary`
    );
    return response.data;
  }
};

export default mealPlanService;
