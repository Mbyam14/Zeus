import { create } from 'zustand';
import { User, AuthToken, LoginRequest, RegisterRequest } from '../types/user';
import { authService } from '../services/authService';

// Helper to check if preferences exist in profile_data
const hasPreferencesSet = (user: User | null): boolean => {
  if (!user?.profile_data?.preferences) return false;
  const prefs = user.profile_data.preferences;
  // Consider setup complete if at least one meaningful preference is set
  return (
    (prefs.dietary_restrictions && prefs.dietary_restrictions.length > 0) ||
    (prefs.cuisine_preferences && prefs.cuisine_preferences.length > 0) ||
    prefs.cooking_skill !== undefined
  );
};

interface AuthState {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  hasCompletedSetup: boolean;

  // Actions
  login: (data: LoginRequest) => Promise<void>;
  register: (data: RegisterRequest) => Promise<void>;
  logout: () => Promise<void>;
  loadUser: () => Promise<void>;
  checkAuthStatus: () => Promise<void>;
  setSetupCompleted: () => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  isLoading: false,
  isAuthenticated: false,
  hasCompletedSetup: false,

  login: async (data: LoginRequest) => {
    try {
      set({ isLoading: true });
      const authToken = await authService.login(data);
      set({
        user: authToken.user,
        isAuthenticated: true,
        isLoading: false,
        hasCompletedSetup: hasPreferencesSet(authToken.user)
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
        isLoading: false,
        hasCompletedSetup: false  // New users always need to complete setup
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
        isAuthenticated: false,
        hasCompletedSetup: false
      });
    } catch (error) {
      console.error('Logout error:', error);
      // Still clear state even if logout API fails
      set({
        user: null,
        isAuthenticated: false,
        hasCompletedSetup: false
      });
    }
  },

  loadUser: async () => {
    try {
      set({ isLoading: true });
      const user = await authService.getCurrentUser();
      set({
        user,
        isAuthenticated: true,
        isLoading: false,
        hasCompletedSetup: hasPreferencesSet(user)
      });
    } catch (error) {
      set({
        user: null,
        isAuthenticated: false,
        isLoading: false,
        hasCompletedSetup: false
      });
    }
  },

  checkAuthStatus: async () => {
    try {
      set({ isLoading: true });
      const isAuthenticated = await authService.isAuthenticated();
      if (isAuthenticated) {
        await get().loadUser();
      } else {
        set({ isAuthenticated: false, user: null, isLoading: false, hasCompletedSetup: false });
      }
    } catch (error) {
      set({ isAuthenticated: false, user: null, isLoading: false, hasCompletedSetup: false });
    }
  },

  setSetupCompleted: () => {
    set({ hasCompletedSetup: true });
  },
}));