import api from './api';
import { Recipe, RecipeCreate, RecipeFeedFilter, AIRecipeRequest } from '../types/recipe';

class RecipeService {
  // Get recipe feed with filters
  async getRecipeFeed(filters?: RecipeFeedFilter): Promise<Recipe[]> {
    const params = new URLSearchParams();

    if (filters) {
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          if (Array.isArray(value)) {
            params.append(key, value.join(','));
          } else {
            params.append(key, value.toString());
          }
        }
      });
    }

    const response = await api.get<Recipe[]>(`/api/recipes/feed?${params.toString()}`);
    return response.data;
  }

  // Get a single recipe by ID
  async getRecipeById(id: string): Promise<Recipe> {
    const response = await api.get<Recipe>(`/api/recipes/${id}`);
    return response.data;
  }

  // Create a new recipe
  async createRecipe(recipe: RecipeCreate): Promise<Recipe> {
    const response = await api.post<Recipe>('/api/recipes', recipe);
    return response.data;
  }

  // Update an existing recipe
  async updateRecipe(id: string, recipe: Partial<RecipeCreate>): Promise<Recipe> {
    const response = await api.put<Recipe>(`/api/recipes/${id}`, recipe);
    return response.data;
  }

  // Delete a recipe
  async deleteRecipe(id: string): Promise<void> {
    await api.delete(`/api/recipes/${id}`);
  }

  // Like a recipe
  async likeRecipe(id: string): Promise<void> {
    await api.post(`/api/recipes/${id}/like`);
  }

  // Unlike a recipe
  async unlikeRecipe(id: string): Promise<void> {
    await api.delete(`/api/recipes/${id}/like`);
  }

  // Save a recipe
  async saveRecipe(id: string): Promise<void> {
    await api.post(`/api/recipes/${id}/save`);
  }

  // Unsave a recipe
  async unsaveRecipe(id: string): Promise<void> {
    await api.delete(`/api/recipes/${id}/save`);
  }

  // Get user's created recipes
  async getMyRecipes(limit = 20, offset = 0): Promise<Recipe[]> {
    const response = await api.get<Recipe[]>(`/api/recipes/my-recipes?limit=${limit}&offset=${offset}`);
    return response.data;
  }

  // Get user's saved recipes
  async getSavedRecipes(limit = 20, offset = 0): Promise<Recipe[]> {
    const response = await api.get<Recipe[]>(`/api/recipes/saved?limit=${limit}&offset=${offset}`);
    return response.data;
  }

  // Get user's liked recipes
  async getLikedRecipes(limit = 20, offset = 0): Promise<Recipe[]> {
    const response = await api.get<Recipe[]>(`/api/recipes/liked?limit=${limit}&offset=${offset}`);
    return response.data;
  }

  // Generate AI recipe
  async generateAIRecipe(request: AIRecipeRequest): Promise<Recipe> {
    const response = await api.post<Recipe>('/api/ai/generate-recipe', request);
    return response.data;
  }

  // Get upload URL for recipe image
  async getUploadUrl(filename: string, contentType: string): Promise<{ upload_url: string; file_url: string }> {
    const response = await api.post<{ upload_url: string; file_url: string }>(
      '/api/recipes/upload-url',
      { filename, content_type: contentType }
    );
    return response.data;
  }

  // Upload image to S3 (using presigned URL)
  async uploadImage(uploadUrl: string, file: Blob): Promise<void> {
    await fetch(uploadUrl, {
      method: 'PUT',
      body: file,
      headers: {
        'Content-Type': file.type,
      },
    });
  }
}

export const recipeService = new RecipeService();
