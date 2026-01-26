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
   * Generate a new AI-powered meal plan for selected days
   * @param startDate - The start date of the meal plan (YYYY-MM-DD)
   * @param selectedDays - Optional array of days to include (e.g., ['monday', 'tuesday'])
   */
  async generateMealPlan(
    startDate: string,
    selectedDays?: string[]
  ): Promise<MealPlanGenerateResponse> {
    const params: Record<string, string | string[]> = { start_date: startDate };
    if (selectedDays && selectedDays.length > 0) {
      params.selected_days = selectedDays;
    }

    const response = await api.post<MealPlanGenerateResponse>(
      '/api/meal-plans/generate/',
      null,
      { params }
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
   * Get a meal plan by week offset relative to current week
   * @param weekOffset - 0 = current week, 1 = next week, -1 = last week
   */
  async getMealPlanByWeekOffset(weekOffset: number): Promise<MealPlan | null> {
    const response = await api.get<MealPlan | null>(`/api/meal-plans/week/${weekOffset}`);
    return response.data;
  },

  /**
   * Generate a meal plan for a specific week offset
   * @param weekOffset - 0 = current week, 1 = next week, etc.
   * @param selectedDays - Optional array of days to include
   */
  async generateMealPlanForWeek(
    weekOffset: number,
    selectedDays?: string[]
  ): Promise<MealPlanGenerateResponse> {
    const params: Record<string, string | string[]> = {};
    if (selectedDays && selectedDays.length > 0) {
      params.selected_days = selectedDays;
    }

    const response = await api.post<MealPlanGenerateResponse>(
      `/api/meal-plans/generate/week/${weekOffset}`,
      null,
      { params }
    );
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
  },

  /**
   * Delete a meal plan
   */
  async deleteMealPlan(mealPlanId: string): Promise<void> {
    await api.delete(`/api/meal-plans/${mealPlanId}/`);
  },

  /**
   * Update meals in a meal plan (for editing/swapping meals)
   */
  async updateMealPlanMeals(mealPlanId: string, meals: Record<string, any>): Promise<MealPlan> {
    const response = await api.patch<MealPlan>(
      `/api/meal-plans/${mealPlanId}/meals`,
      meals
    );
    return response.data;
  },

  /**
   * Fill all empty meal slots with AI-generated recipes
   * @param mealPlanId - The ID of the meal plan to fill
   */
  async fillRemainingWithAI(mealPlanId: string): Promise<{
    message: string;
    filled_count: number;
    total_empty?: number;
    meals: Record<string, any>;
  }> {
    const response = await api.post<{
      message: string;
      filled_count: number;
      total_empty?: number;
      meals: Record<string, any>;
    }>(`/api/meal-plans/${mealPlanId}/fill-remaining`);
    return response.data;
  },

  /**
   * Create a meal plan with manually selected recipes
   * @param startDate - The start date of the meal plan (YYYY-MM-DD)
   * @param selectedDays - Array of days to include
   * @param meals - Dictionary of meals with recipe_ids
   */
  async createManualMealPlan(
    startDate: string,
    selectedDays: string[],
    meals: Record<string, Record<string, { recipe_id: string; is_repeat?: boolean }>>
  ): Promise<MealPlan> {
    const response = await api.post<MealPlan>(
      '/api/meal-plans/create-manual/',
      meals, // Send meals directly as body
      {
        params: {
          start_date: startDate,
          selected_days: selectedDays
        }
      }
    );
    return response.data;
  }
};

export default mealPlanService;
