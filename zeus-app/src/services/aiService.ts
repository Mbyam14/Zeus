import api from './api';

export interface AskAIResponse {
  response: string;
  context_used: {
    pantry_items_count: number;
    has_dietary_restrictions: boolean;
    has_liked_recipes: boolean;
  };
}

export const aiService = {
  /**
   * Ask Claude a free-form cooking/food question.
   * Automatically includes pantry, dietary, and preference context.
   */
  async ask(message: string): Promise<AskAIResponse> {
    const response = await api.post<AskAIResponse>(
      '/api/ai/ask',
      { message },
      { timeout: 35000 }
    );
    return response.data;
  },
};

export default aiService;
