/**
 * Instacart Service
 *
 * API client for Instacart integration operations.
 */

import { Linking } from 'react-native';
import api from './api';
import {
  InstacartRetailer,
  InstacartCart,
  InstacartCartDetail,
  ProductMatchResult,
  ProductMatchSummary,
  InstacartPreferences,
} from '../types/instacart';

class InstacartService {
  /**
   * Get available retailers for a zip code
   */
  async getRetailers(zipCode: string): Promise<InstacartRetailer[]> {
    const response = await api.get<InstacartRetailer[]>(
      '/api/instacart/retailers',
      { params: { zip_code: zipCode } }
    );
    return response.data;
  }

  /**
   * Get user's Instacart preferences
   */
  async getPreferences(): Promise<InstacartPreferences> {
    const response = await api.get<InstacartPreferences>(
      '/api/instacart/preferences'
    );
    return response.data;
  }

  /**
   * Save user's preferred retailer
   */
  async saveRetailerPreference(
    retailerId: string,
    zipCode: string
  ): Promise<void> {
    await api.post('/api/instacart/retailers/preference', {
      retailer_id: retailerId,
      zip_code: zipCode,
    });
  }

  /**
   * Match grocery list items to Instacart products
   *
   * Returns match results before cart creation so user can
   * review and adjust selections.
   */
  async matchProducts(
    groceryListId: string,
    retailerId: string
  ): Promise<{
    matches: ProductMatchResult[];
    summary: ProductMatchSummary;
  }> {
    const response = await api.post<{
      grocery_list_id: string;
      retailer_id: string;
      matches: ProductMatchResult[];
      summary: ProductMatchSummary;
    }>('/api/instacart/match-products', {
      grocery_list_id: groceryListId,
      retailer_id: retailerId,
    });
    return {
      matches: response.data.matches,
      summary: response.data.summary,
    };
  }

  /**
   * Create Instacart cart from grocery list
   *
   * Returns cart with checkout URL for redirect.
   */
  async createCart(
    groceryListId: string,
    retailerId: string,
    zipCode: string
  ): Promise<InstacartCart> {
    const response = await api.post<InstacartCart>('/api/instacart/carts', {
      grocery_list_id: groceryListId,
      retailer_id: retailerId,
      zip_code: zipCode,
    });
    return response.data;
  }

  /**
   * Get cart details and status
   */
  async getCart(cartId: string): Promise<InstacartCartDetail> {
    const response = await api.get<InstacartCartDetail>(
      `/api/instacart/carts/${cartId}`
    );
    return response.data;
  }

  /**
   * Open Instacart checkout in browser
   *
   * Uses Linking to open the checkout URL in the device browser.
   */
  async openCheckout(checkoutUrl: string): Promise<boolean> {
    const supported = await Linking.canOpenURL(checkoutUrl);

    if (supported) {
      await Linking.openURL(checkoutUrl);
      return true;
    } else {
      throw new Error('Cannot open Instacart checkout URL');
    }
  }
}

// Export singleton instance
export const instacartService = new InstacartService();
