/**
 * TypeScript types for Instacart integration
 */

/**
 * Retailer available on Instacart
 */
export interface InstacartRetailer {
  id: string;
  name: string;
  logo_url?: string;
  delivery_fee?: number;
  min_order?: number;
  estimated_delivery?: string;
}

/**
 * Status of an Instacart cart
 */
export type InstacartCartStatus =
  | 'draft'
  | 'created'
  | 'redirected'
  | 'ordered'
  | 'completed'
  | 'failed';

/**
 * Product match status
 */
export type ProductMatchStatus =
  | 'pending'
  | 'matched'
  | 'low_confidence'
  | 'not_found'
  | 'error'
  | 'manual';

/**
 * Product search result from Instacart
 */
export interface InstacartProduct {
  product_id: string;
  name: string;
  image_url?: string;
  unit_price?: number;
  unit_size?: string;
  availability: string;
}

/**
 * Result of matching a grocery item to Instacart products
 */
export interface ProductMatchResult {
  id: string;
  grocery_item_id: string;
  original_name: string;
  matched_product_name?: string;
  matched_product_id?: string;
  matched_unit_price?: number;
  quantity: number;
  match_status: ProductMatchStatus;
  match_confidence: number;
  alternatives: InstacartProduct[];
}

/**
 * Summary of product matching
 */
export interface ProductMatchSummary {
  total_items: number;
  matched: number;
  not_found: number;
  match_rate: number;
}

/**
 * Instacart cart
 */
export interface InstacartCart {
  id: string;
  instacart_cart_id?: string;
  checkout_url?: string;
  retailer_id: string;
  retailer_name?: string;
  total_items: number;
  items_matched: number;
  items_not_found: number;
  status: InstacartCartStatus;
  order_status?: string;
  order_total?: number;
  created_at?: string;
  completed_at?: string;
}

/**
 * Detailed cart with items
 */
export interface InstacartCartDetail extends InstacartCart {
  items: ProductMatchResult[];
}

/**
 * Request to create cart
 */
export interface InstacartCartCreateRequest {
  grocery_list_id: string;
  retailer_id: string;
  zip_code: string;
}

/**
 * User's Instacart preferences
 */
export interface InstacartPreferences {
  default_retailer_id?: string;
  zip_code?: string;
  preferred_retailers?: string[];
  auto_select_products?: boolean;
  prefer_organic?: boolean;
  prefer_store_brand?: boolean;
}
