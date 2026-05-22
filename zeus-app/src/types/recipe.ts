export interface Ingredient {
  name: string;
  quantity: string;
  unit: string;
  section?: string;
}

export interface Instruction {
  step: number;
  instruction: string;
}

export type DifficultyLevel = 'Easy' | 'Medium' | 'Hard';
export type MealType = 'Breakfast' | 'Lunch' | 'Dinner' | 'Snack' | 'Dessert' | 'Sides';

// Named scenario collection keys understood by the /api/recipes/collections/{key} endpoint.
export type RecipeCollectionKey =
  | 'quick_weeknight'
  | 'quick'
  | 'one_pot'
  | 'sheet_pan'
  | 'slow_cooker'
  | 'instant_pot'
  | 'air_fryer'
  | 'no_cook'
  | 'healthy_light'
  | 'make_ahead'
  | 'meal_prep'
  | 'comfort_food'
  | 'family_favorites';

export interface Recipe {
  id: string;
  user_id: string;
  title: string;
  description?: string;
  image_url?: string;
  ingredients: Ingredient[];
  instructions: Instruction[];
  servings: number;
  prep_time?: number;
  cook_time?: number;
  cuisine_type?: string;
  difficulty: DifficultyLevel;
  meal_type: string[];
  dietary_tags: string[];
  // New uniform tagging dimensions (populated by detection pipeline)
  cooking_method?: string[];   // e.g. ['one_pot'], ['sheet_pan']
  time_tags?: string[];        // e.g. ['quick', 'weeknight']
  style_tags?: string[];       // e.g. ['make_ahead', 'comfort_food']
  is_ai_generated: boolean;
  likes_count: number;
  created_at: string;
  creator_username?: string;
  is_liked?: boolean;
  is_saved?: boolean;
  // Nutrition fields
  calories?: number;
  protein_grams?: number;
  carbs_grams?: number;
  fat_grams?: number;
  serving_size?: string;
}

export interface RecipeCreate {
  title: string;
  description?: string;
  ingredients: Ingredient[];
  instructions: Instruction[];
  servings: number;
  prep_time?: number;
  cook_time?: number;
  cuisine_type?: string;
  difficulty: DifficultyLevel;
  meal_type: MealType[];
  dietary_tags: string[];
  image_url?: string;
}

export interface RecipeFeedFilter {
  cuisine_type?: string;
  cuisine_preferences?: string[];
  difficulty?: DifficultyLevel;
  max_difficulty?: DifficultyLevel;
  max_prep_time?: number;
  meal_type?: MealType;
  dietary_tags?: string[];
  use_pantry_items?: boolean;
  limit?: number;
  offset?: number;
}

