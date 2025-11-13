export interface Ingredient {
  name: string;
  quantity: string;
  unit: string;
}

export interface Instruction {
  step: number;
  instruction: string;
}

export type DifficultyLevel = 'Easy' | 'Medium' | 'Hard';
export type MealType = 'Breakfast' | 'Lunch' | 'Dinner' | 'Snack' | 'Dessert';

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
  is_ai_generated: boolean;
  likes_count: number;
  created_at: string;
  creator_username?: string;
  is_liked?: boolean;
  is_saved?: boolean;
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
  difficulty?: DifficultyLevel;
  max_prep_time?: number;
  meal_type?: MealType;
  dietary_tags?: string[];
  use_pantry_items?: boolean;
  limit?: number;
  offset?: number;
}

export interface AIRecipeRequest {
  pantry_items?: string[];
  cuisine_preference?: string;
  dietary_restrictions?: string[];
  cooking_skill?: 'beginner' | 'intermediate' | 'advanced';
  max_prep_time?: number;
  servings: number;
  meal_type?: MealType;
  additional_preferences?: string;
}