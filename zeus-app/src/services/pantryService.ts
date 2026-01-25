import api from './api';
import {
  PantryItem,
  PantryItemCreate,
  PantryItemUpdate,
  PantryFilter,
  IngredientLibraryItem,
  ImageAnalysisRequest,
  ImageAnalysisResponse
} from '../types/pantry';

class PantryService {
  // Get all pantry items with optional filters
  async getPantryItems(filters?: PantryFilter): Promise<PantryItem[]> {
    const params = new URLSearchParams();

    if (filters) {
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          params.append(key, value.toString());
        }
      });
    }

    const response = await api.get<PantryItem[]>(`/api/pantry/?${params.toString()}`);
    return response.data;
  }

  // Get a single pantry item by ID
  async getPantryItemById(id: string): Promise<PantryItem> {
    const response = await api.get<PantryItem>(`/api/pantry/${id}`);
    return response.data;
  }

  // Create a new pantry item
  async createPantryItem(item: PantryItemCreate): Promise<PantryItem> {
    const response = await api.post<PantryItem>('/api/pantry/', item);
    return response.data;
  }

  // Update an existing pantry item
  async updatePantryItem(id: string, item: PantryItemUpdate): Promise<PantryItem> {
    const response = await api.put<PantryItem>(`/api/pantry/${id}`, item);
    return response.data;
  }

  // Delete a pantry item
  async deletePantryItem(id: string): Promise<void> {
    await api.delete(`/api/pantry/${id}`);
  }

  // Bulk add pantry items
  async bulkAddPantryItems(items: PantryItemCreate[]): Promise<PantryItem[]> {
    const response = await api.post<PantryItem[]>('/api/pantry/bulk', { items });
    return response.data;
  }

  // Search ingredient library for autocomplete
  async searchIngredients(
    query: string,
    category?: string,
    limit: number = 20
  ): Promise<IngredientLibraryItem[]> {
    const params = new URLSearchParams({ query, limit: limit.toString() });
    if (category) {
      params.append('category', category);
    }

    const response = await api.get<IngredientLibraryItem[]>(
      `/api/pantry/ingredients/search?${params.toString()}`
    );
    return response.data;
  }

  // Get expiring items
  async getExpiringItems(days: number = 7): Promise<PantryItem[]> {
    const response = await api.get<PantryItem[]>(`/api/pantry/expiring/alerts?days=${days}`);
    return response.data;
  }

  // Analyze pantry image using AI vision
  async analyzeImage(imageBase64: string, imageType: string = 'image/jpeg'): Promise<ImageAnalysisResponse> {
    const request: ImageAnalysisRequest = {
      image_base64: imageBase64,
      image_type: imageType
    };

    const response = await api.post<ImageAnalysisResponse>('/api/pantry/analyze-image', request, {
      timeout: 60000 // 60 second timeout for image analysis
    });
    return response.data;
  }
}

export const pantryService = new PantryService();
