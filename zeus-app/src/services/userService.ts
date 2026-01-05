import api from './api';
import { UserPreferences, UserProfileUpdate } from '../types/user';

export const userService = {
  /**
   * Get current user's preferences
   */
  async getPreferences(): Promise<UserPreferences> {
    const response = await api.get<UserPreferences>('/api/users/me/preferences/');
    return response.data;
  },

  /**
   * Update user preferences
   */
  async updatePreferences(preferences: UserPreferences): Promise<void> {
    await api.put('/api/users/me/preferences/', preferences);
  },

  /**
   * Update full user profile (name + preferences)
   */
  async updateProfile(profile: UserProfileUpdate): Promise<void> {
    await api.put('/api/users/me/profile/', profile);
  }
};

export default userService;
