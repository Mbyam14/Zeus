export interface RecipeIngredient {
  name: string;
  quantity: string;
  unit: string;
}

export interface RecipeInstruction {
  step: number;
  instruction: string;
}

export interface RecipeNutrition {
  calories?: number;
  protein_grams?: number;
  carbs_grams?: number;
  fat_grams?: number;
  serving_size?: string;
}

export interface Recipe {
  id: string;
  user_id: string;
  title: string;
  description?: string;
  ingredients: RecipeIngredient[];
  instructions: RecipeInstruction[];
  servings: number;
  prep_time?: number;
  cook_time?: number;
  cuisine_type?: string;
  difficulty: string;
  meal_type: string[];
  dietary_tags: string[];
  is_ai_generated: boolean;
  likes_count: number;
  created_at: string;

  // Nutrition fields
  calories?: number;
  protein_grams?: number;
  carbs_grams?: number;
  fat_grams?: number;
  serving_size?: string;

  // Optional fields
  image_url?: string;
  creator_username?: string;
  is_liked?: boolean;
  is_saved?: boolean;
}

export interface DayMeals {
  breakfast?: string; // recipe_id
  lunch?: string;
  dinner?: string;
}

export interface MealPlan {
  id: string;
  user_id: string;
  plan_name: string;
  week_start_date: string;
  meals: {
    monday?: DayMeals;
    tuesday?: DayMeals;
    wednesday?: DayMeals;
    thursday?: DayMeals;
    friday?: DayMeals;
    saturday?: DayMeals;
    sunday?: DayMeals;
  };
  created_at: string;
}

export interface GroceryItem {
  ingredient: string;
  quantity: string;
  unit: string;
  already_have: boolean;
}

export interface MealPlanGenerateResponse {
  meal_plan_id: string;
  meals: {
    [day: string]: {
      [mealType: string]: string; // recipe_id
    };
  };
  summary: {
    total_unique_recipes?: number;
    estimated_weekly_calories?: number;
    variety_score?: string;
  };
  grocery_list: GroceryItem[];
}

export interface UserPreferences {
  dietary_restrictions: string[];
  cuisine_preferences: string[];
  cooking_skill: 'beginner' | 'intermediate' | 'advanced';
  household_size: number;
  calorie_target?: number;
  protein_target_grams?: number;
  allergies: string[];
  disliked_ingredients: string[];
}

export type DayOfWeek = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';
export type MealType = 'breakfast' | 'lunch' | 'dinner';

// Macro Summary Types
export interface MacroTotals {
  calories: number;
  protein_grams: number;
  carbs_grams: number;
  fat_grams: number;
}

export interface MacroPercentages {
  protein_pct: number;
  carbs_pct: number;
  fat_pct: number;
}

export interface WeeklySummary {
  recipe_count: number;
  weekly_totals: MacroTotals;
  daily_averages: MacroTotals;
  macro_percentages: MacroPercentages;
}

export interface DailySummary {
  totals: MacroTotals;
  macro_percentages: MacroPercentages;
  meal_count: number;
}

export interface TargetComparison {
  calorie_target?: number;
  calorie_daily_avg?: number;
  calorie_difference?: number;
  calorie_on_target?: boolean;
  protein_target_grams?: number;
  protein_daily_avg?: number;
  protein_difference?: number;
  protein_on_target?: boolean;
}

export interface MacroSummaryResponse {
  meal_plan_id: string;
  weekly_summary: WeeklySummary;
  daily_breakdown: {
    [day: string]: DailySummary;
  };
  target_comparison?: TargetComparison;
  validation_warnings: string[];
}
