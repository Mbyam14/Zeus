export interface User {
  id: string;
  email: string;
  username: string;
  profile_data: Record<string, any>;
  created_at: string;
}

export interface AuthToken {
  access_token: string;
  refresh_token: string;
  token_type: string;
  user: User;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  username: string;
  password: string;
}

export interface UserProfile {
  username: string;
  profile_data?: Record<string, any>;
}

export interface MealCalorieDistribution {
  breakfast: number;
  lunch: number;
  dinner: number;
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
  // Meal planning preferences
  meal_calorie_distribution?: MealCalorieDistribution;
  cooking_sessions_per_week?: number;
  recipe_source_preference?: 'vetted_only' | 'ai_only' | 'mixed';
  leftover_tolerance?: 'low' | 'moderate' | 'high';
  budget_friendly?: boolean;
}

export interface UserProfileUpdate {
  name?: string;
  preferences?: UserPreferences;
}