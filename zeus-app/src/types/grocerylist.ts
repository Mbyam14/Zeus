/**
 * TypeScript types for Grocery List feature
 *
 * Matches backend schemas for grocery lists and items.
 */

/**
 * Category for organizing grocery items
 */
export type GroceryCategory =
  | 'Produce'
  | 'Dairy'
  | 'Protein'
  | 'Grains'
  | 'Spices'
  | 'Condiments'
  | 'Beverages'
  | 'Frozen'
  | 'Canned & Jarred'
  | 'Baking'
  | 'Oils & Vinegars'
  | 'Snacks'
  | 'Other';

/**
 * Category emoji mapping for UI display
 */
export const CATEGORY_EMOJIS: Record<string, string> = {
  Produce: '🥬',
  Dairy: '🥛',
  Protein: '🍗',
  Grains: '🌾',
  Spices: '🌶️',
  Condiments: '🍯',
  Beverages: '🥤',
  Frozen: '❄️',
  'Canned & Jarred': '🥫',
  Baking: '🧁',
  'Oils & Vinegars': '🫒',
  Snacks: '🍿',
  Other: '📦',
  // Keep old value as fallback for existing data
  Pantry: '🥫',
};

/**
 * Category color mapping for UI display
 */
export const CATEGORY_COLORS: Record<string, string> = {
  Produce: '#4CAF50',
  Dairy: '#2196F3',
  Protein: '#FF5722',
  Grains: '#FF9800',
  Spices: '#E91E63',
  Condiments: '#FFC107',
  Beverages: '#00BCD4',
  Frozen: '#3F51B5',
  'Canned & Jarred': '#795548',
  Baking: '#8D6E63',
  'Oils & Vinegars': '#689F38',
  Snacks: '#FF7043',
  Other: '#9E9E9E',
  // Keep old value as fallback for existing data
  Pantry: '#795548',
};

/**
 * Individual item in a grocery list
 */
export interface GroceryListItem {
  id: string;
  item_name: string;
  quantity?: number;
  unit?: string;
  category: GroceryCategory;

  // Pantry tracking
  have_in_pantry: boolean;
  pantry_quantity?: number;
  pantry_unit?: string;
  needed_quantity?: number;

  // Purchase tracking
  is_purchased: boolean;
  estimated_price?: number;

  // Source tracking
  recipe_ids: string[];

  // Timestamps
  created_at: string;
  updated_at: string;
}

/**
 * Warning about a recipe that couldn't be processed
 */
export interface RecipeWarning {
  recipe_id: string;
  recipe_title: string;
  reason: string;
}

/**
 * Complete grocery list with items and statistics
 */
export interface GroceryList {
  id: string;
  user_id: string;
  meal_plan_id: string;
  name: string;
  week_start_date: string;

  // Items
  items: GroceryListItem[];
  items_by_category: Record<GroceryCategory, GroceryListItem[]>;

  // Summary statistics
  total_items: number;
  purchased_items_count: number;
  items_in_pantry_count: number;

  // Warnings about recipes that couldn't be processed
  warnings: RecipeWarning[];

  // Status
  is_purchased: boolean;
  purchased_at?: string;

  // Timestamps
  created_at: string;
  updated_at: string;
}

/**
 * Lightweight summary of a grocery list
 */
export interface GroceryListSummary {
  id: string;
  meal_plan_id: string;
  name: string;
  week_start_date: string;
  total_items: number;
  purchased_items_count: number;
  is_purchased: boolean;
  created_at: string;
}

/**
 * Request body for updating item purchased status
 */
export interface UpdateItemPurchasedRequest {
  is_purchased: boolean;
}

/**
 * Filter options for grocery list display
 */
export type GroceryListFilter = 'all' | 'needed' | 'purchased' | 'in-pantry';

/**
 * Sort options for grocery list items
 */
export type GroceryListSort = 'category' | 'name' | 'needed-first' | 'pantry-first';
