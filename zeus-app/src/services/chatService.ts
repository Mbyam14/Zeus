import api from './api';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  metadata?: Record<string, any>;
  created_at: string;
}

export interface ScreenContext {
  screen: string;
  recipe_id?: string;
  recipe_title?: string;
  meal_plan_day?: string;
}

export interface MemoryFact {
  category: string;
  fact: string;
  confidence: number;
  source_count: number;
  first_observed: string;
  last_observed: string;
}

class ChatService {
  async sendMessage(
    message: string,
    screenContext?: ScreenContext,
  ): Promise<ChatMessage> {
    const response = await api.post<ChatMessage>(
      '/api/chat/message',
      { message, screen_context: screenContext },
      { timeout: 35000 },
    );
    return response.data;
  }

  async getHistory(
    limit: number = 50,
    beforeId?: string,
  ): Promise<{ messages: ChatMessage[]; has_more: boolean }> {
    const params: Record<string, any> = { limit };
    if (beforeId) params.before_id = beforeId;
    const response = await api.get('/api/chat/history', { params });
    return response.data;
  }

  async getMemory(): Promise<{ facts: MemoryFact[]; last_updated: string | null }> {
    const response = await api.get('/api/chat/memory');
    return response.data;
  }

  async clearMemory(): Promise<void> {
    await api.delete('/api/chat/memory');
  }

  async clearHistory(): Promise<void> {
    await api.delete('/api/chat/history');
  }
}

export const chatService = new ChatService();
