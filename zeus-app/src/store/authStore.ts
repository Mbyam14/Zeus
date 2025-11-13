import { create } from 'zustand';
import { User, AuthToken, LoginRequest, RegisterRequest } from '../types/user';
import { authService } from '../services/authService';

interface AuthState {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  
  // Actions
  login: (data: LoginRequest) => Promise<void>;
  register: (data: RegisterRequest) => Promise<void>;
  logout: () => Promise<void>;
  loadUser: () => Promise<void>;
  checkAuthStatus: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  isLoading: false,
  isAuthenticated: false,

  login: async (data: LoginRequest) => {
    try {
      set({ isLoading: true });
      const authToken = await authService.login(data);
      set({ 
        user: authToken.user, 
        isAuthenticated: true, 
        isLoading: false 
      });
    } catch (error) {
      set({ isLoading: false });
      throw error;
    }
  },

  register: async (data: RegisterRequest) => {
    try {
      set({ isLoading: true });
      const authToken = await authService.register(data);
      set({ 
        user: authToken.user, 
        isAuthenticated: true, 
        isLoading: false 
      });
    } catch (error) {
      set({ isLoading: false });
      throw error;
    }
  },

  logout: async () => {
    try {
      await authService.logout();
      set({ 
        user: null, 
        isAuthenticated: false 
      });
    } catch (error) {
      console.error('Logout error:', error);
    }
  },

  loadUser: async () => {
    try {
      set({ isLoading: true });
      const user = await authService.getCurrentUser();
      set({ 
        user, 
        isAuthenticated: true, 
        isLoading: false 
      });
    } catch (error) {
      set({ 
        user: null, 
        isAuthenticated: false, 
        isLoading: false 
      });
    }
  },

  checkAuthStatus: async () => {
    try {
      const isAuthenticated = await authService.isAuthenticated();
      if (isAuthenticated) {
        await get().loadUser();
      } else {
        set({ isAuthenticated: false, user: null });
      }
    } catch (error) {
      set({ isAuthenticated: false, user: null });
    }
  },
}));