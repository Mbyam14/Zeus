export type PantryCategory =
  | 'Produce'
  | 'Dairy'
  | 'Protein'
  | 'Grains'
  | 'Spices'
  | 'Condiments'
  | 'Beverages'
  | 'Frozen'
  | 'Pantry'
  | 'Other';

export type PantryUnit =
  | 'cups'
  | 'tbsp'
  | 'tsp'
  | 'fl oz'
  | 'pieces'
  | 'items'
  | 'cans'
  | 'boxes'
  | 'lbs'
  | 'oz'
  | 'g'
  | 'kg';

export interface PantryItem {
  id: string;
  user_id: string;
  item_name: string;
  quantity?: number;
  unit?: string;
  category: PantryCategory;
  expires_at?: string; // ISO date string
  created_at: string;
  is_expiring_soon?: boolean;
  is_expired?: boolean;
}

export interface PantryItemCreate {
  item_name: string;
  quantity?: number;
  unit?: string;
  category: PantryCategory;
  expires_at?: string;
}

export interface PantryItemUpdate {
  item_name?: string;
  quantity?: number;
  unit?: string;
  category?: PantryCategory;
  expires_at?: string;
}

export interface PantryFilter {
  category?: PantryCategory;
  search?: string;
  expiring_soon?: boolean;
  expired?: boolean;
}

export interface IngredientLibraryItem {
  id: string;
  name: string;
  category: PantryCategory;
  common_units: string[];
}

// Image Analysis Types
export interface DetectedPantryItem {
  item_name: string;
  quantity?: number;
  unit?: string;
  category: PantryCategory;
  confidence: number;
  already_in_pantry: boolean;
  existing_pantry_id?: string;
}

export interface ImageAnalysisRequest {
  image_base64: string;
  image_type: string;
}

export interface ImageAnalysisResponse {
  detected_items: DetectedPantryItem[];
  total_detected: number;
  new_items_count: number;
  existing_items_count: number;
  analysis_notes?: string;
}
