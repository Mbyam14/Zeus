/**
 * Grocery List Service
 *
 * API client for grocery list operations.
 */

import api from './api';
import {
  GroceryList,
  GroceryListItem,
  GroceryListSummary,
  UpdateItemPurchasedRequest,
} from '../types/grocerylist';

class GroceryListService {
  /**
   * Generate grocery list from meal plan
   *
   * Creates a new grocery list by extracting ingredients from all recipes
   * in the meal plan, aggregating quantities, and matching against pantry.
   *
   * @param mealPlanId - Meal plan ID to generate list from
   * @returns Complete grocery list with items grouped by category
   */
  async generateGroceryList(mealPlanId: string): Promise<GroceryList> {
    const response = await api.post<GroceryList>(
      `/api/grocery-lists/${mealPlanId}/generate`,
      null,
      { timeout: 30000 }
    );
    return response.data;
  }

  /**
   * Get grocery list by ID
   *
   * @param groceryListId - Grocery list ID
   * @returns Complete grocery list with items and statistics
   */
  async getGroceryList(groceryListId: string): Promise<GroceryList> {
    const response = await api.get<GroceryList>(
      `/api/grocery-lists/${groceryListId}`
    );
    return response.data;
  }

  /**
   * Get grocery list for a specific meal plan
   *
   * Useful for checking if a list already exists before generating.
   *
   * @param mealPlanId - Meal plan ID
   * @returns Grocery list if found, null otherwise
   */
  async getGroceryListByMealPlan(
    mealPlanId: string
  ): Promise<GroceryList | null> {
    const response = await api.get<GroceryList | null>(
      `/api/grocery-lists/meal-plan/${mealPlanId}`
    );
    return response.data;
  }

  /**
   * Update purchased status of a grocery list item
   *
   * @param itemId - Item ID
   * @param isPurchased - New purchased status
   * @returns Updated item
   */
  async toggleItemPurchased(
    itemId: string,
    isPurchased: boolean
  ): Promise<GroceryListItem> {
    const requestBody: UpdateItemPurchasedRequest = { is_purchased: isPurchased };
    const response = await api.put<GroceryListItem>(
      `/api/grocery-lists/items/${itemId}/purchased`,
      requestBody
    );
    return response.data;
  }

  /**
   * Mark entire grocery list as purchased
   *
   * Sets all items to purchased and records purchase timestamp.
   *
   * @param groceryListId - Grocery list ID
   * @returns Updated grocery list
   */
  async markAllPurchased(groceryListId: string): Promise<GroceryList> {
    const response = await api.post<GroceryList>(
      `/api/grocery-lists/${groceryListId}/mark-purchased`
    );
    return response.data;
  }

  /**
   * Delete a grocery list
   *
   * Permanently removes the grocery list and all its items.
   *
   * @param groceryListId - Grocery list ID
   * @returns Success message
   */
  async deleteGroceryList(groceryListId: string): Promise<{ message: string }> {
    const response = await api.delete<{ message: string }>(
      `/api/grocery-lists/${groceryListId}`
    );
    return response.data;
  }
}

// Export singleton instance
export const groceryListService = new GroceryListService();
