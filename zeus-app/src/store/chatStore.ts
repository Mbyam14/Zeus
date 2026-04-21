import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { chatService, ChatMessage, ScreenContext } from '../services/chatService';

interface ChatState {
  messages: ChatMessage[];
  hasMore: boolean;
  isLoading: boolean;
  isSending: boolean;
  isOpen: boolean;
  unreadCount: number;
  screenContext: ScreenContext;
  _hasHydrated: boolean;

  // Actions
  sendMessage: (text: string) => Promise<void>;
  loadHistory: (beforeId?: string) => Promise<void>;
  setScreenContext: (ctx: ScreenContext) => void;
  toggleChat: () => void;
  openChat: () => void;
  closeChat: () => void;
  markRead: () => void;
  clearHistory: () => Promise<void>;
}

export const useChatStore = create<ChatState>()(
  persist(
    (set, get) => ({
      messages: [],
      hasMore: false,
      isLoading: false,
      isSending: false,
      isOpen: false,
      unreadCount: 0,
      screenContext: { screen: 'Home' },
      _hasHydrated: false,

      sendMessage: async (text: string) => {
        const { screenContext, messages } = get();

        // Optimistic: add user message immediately
        const tempUserMsg: ChatMessage = {
          id: `temp-${Date.now()}`,
          role: 'user',
          content: text,
          created_at: new Date().toISOString(),
        };

        set({ isSending: true, messages: [tempUserMsg, ...messages] });

        try {
          const response = await chatService.sendMessage(text, screenContext);

          set((state) => ({
            messages: [
              response,                             // assistant response at top
              ...state.messages.filter((m) => m.id !== tempUserMsg.id),  // remove temp
              // re-add the real user message comes from history next load
            ],
            isSending: false,
            unreadCount: state.isOpen ? 0 : state.unreadCount + 1,
          }));

          // Reload history to get the real user message with server ID
          // Only reload the latest 2 messages to replace the temp one
          try {
            const history = await chatService.getHistory(2);
            set((state) => {
              const existingIds = new Set(state.messages.map((m) => m.id));
              const newMsgs = history.messages.filter((m) => !existingIds.has(m.id));
              // Replace temp and add any missing
              const cleaned = state.messages.filter(
                (m) => !m.id.startsWith('temp-') && m.id !== history.messages[0]?.id
              );
              // Merge — newest first
              const merged = [...history.messages, ...cleaned.filter(
                (m) => !history.messages.find((h) => h.id === m.id)
              )];
              return { messages: merged };
            });
          } catch {
            // Non-critical — the optimistic message is still visible
          }
        } catch (error: any) {
          // Remove temp message on failure
          console.error('Chat send error:', error?.response?.data || error?.message || error);
          set((state) => ({
            messages: state.messages.filter((m) => m.id !== tempUserMsg.id),
            isSending: false,
          }));
          throw error;
        }
      },

      loadHistory: async (beforeId?: string) => {
        const { isLoading } = get();
        if (isLoading) return;

        set({ isLoading: true });
        try {
          const result = await chatService.getHistory(50, beforeId);
          set((state) => {
            if (beforeId) {
              // Appending older messages
              const existingIds = new Set(state.messages.map((m) => m.id));
              const newMsgs = result.messages.filter((m) => !existingIds.has(m.id));
              return {
                messages: [...state.messages, ...newMsgs],
                hasMore: result.has_more,
                isLoading: false,
              };
            }
            // Initial load
            return {
              messages: result.messages,
              hasMore: result.has_more,
              isLoading: false,
            };
          });
        } catch {
          set({ isLoading: false });
        }
      },

      setScreenContext: (ctx: ScreenContext) => set({ screenContext: ctx }),

      toggleChat: () =>
        set((state) => ({
          isOpen: !state.isOpen,
          unreadCount: !state.isOpen ? 0 : state.unreadCount,
        })),

      openChat: () => set({ isOpen: true, unreadCount: 0 }),
      closeChat: () => set({ isOpen: false }),
      markRead: () => set({ unreadCount: 0 }),

      clearHistory: async () => {
        await chatService.clearHistory();
        set({ messages: [], hasMore: false });
      },
    }),
    {
      name: 'zeus-chat-store',
      storage: createJSONStorage(() => AsyncStorage),
      skipHydration: true,
      partialize: (state) => ({
        messages: state.messages.slice(0, 50), // Only persist last 50
        unreadCount: state.unreadCount,
      }),
      onRehydrateStorage: () => {
        return () => {
          useChatStore.setState({ _hasHydrated: true });
        };
      },
    },
  ),
);
