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
  carb_target_grams?: number;
  fat_target_grams?: number;
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

export type Sex = 'male' | 'female';
export type ActivityLevel = 'sedentary' | 'lightly_active' | 'moderately_active' | 'very_active' | 'extra_active';
export type Units = 'imperial' | 'metric';

export interface BodyStats {
  sex: Sex | null;
  age: number | null;
  height_cm: number | null;
  weight_kg: number | null;
  goal_weight_kg: number | null;
  activity_level: ActivityLevel | null;
  units: Units;
}

export interface NotificationPreferences {
  meal_reminders: boolean;
  prep_reminders: boolean;
  grocery_reminders: boolean;
  expiring_items: boolean;
  new_recipes: boolean;
  weekly_summary: boolean;
}
