import api from './api';

export interface SubstitutionResult {
  recipe_title: string;
  original_ingredient: string;
  substitutions: Array<{
    substitute: string;
    quantity: string;
    impact: string;
    adjustments: string;
  }>;
}

export interface CookTonightResult {
  suggestion: {
    recipe_title: string;
    why: string;
    pantry_items_used: string[];
    items_to_buy: string[];
    prep_time_minutes: number;
    calories_estimate: number;
    quick_instructions: string[];
    expiring_items_count: number;
  } | null;
  message: string | null;
}

export interface CookingTipResult {
  recipe_title: string;
  step_number: number;
  tip: string;
}

class SmartAIService {
  /**
   * Get ingredient substitution suggestions for a recipe.
   */
  async getSubstitution(
    recipeId: string,
    ingredientName: string,
    reason?: string,
  ): Promise<SubstitutionResult> {
    const response = await api.post<SubstitutionResult>('/api/ai/substitutions', {
      recipe_id: recipeId,
      ingredient_name: ingredientName,
      reason: reason || '',
    }, { timeout: 20000 });
    return response.data;
  }

  /**
   * Get a personalized "what to cook tonight" suggestion based on pantry.
   */
  async getCookTonightSuggestion(
    maxPrepTime?: number,
    mealType: string = 'Dinner',
  ): Promise<CookTonightResult> {
    const response = await api.post<CookTonightResult>('/api/ai/cook-tonight', {
      max_prep_time: maxPrepTime,
      meal_type: mealType,
    }, { timeout: 35000 });
    return response.data;
  }

  /**
   * Get cooking guidance for a specific recipe step.
   */
  async getCookingTip(
    recipeTitle: string,
    stepNumber: number,
    stepText: string,
    question?: string,
  ): Promise<CookingTipResult> {
    const response = await api.post<CookingTipResult>('/api/ai/cooking-tips', {
      recipe_title: recipeTitle,
      step_number: stepNumber,
      step_text: stepText,
      question,
    }, { timeout: 15000 });
    return response.data;
  }
}

export const smartAIService = new SmartAIService();
