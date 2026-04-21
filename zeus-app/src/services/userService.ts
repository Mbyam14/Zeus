import api from './api';
import { UserPreferences, UserProfileUpdate, BodyStats, NotificationPreferences } from '../types/user';

export const userService = {
  // ─── Preferences ────────────────────────────────────────
  async getPreferences(): Promise<UserPreferences> {
    const response = await api.get<UserPreferences>('/api/users/me/preferences/');
    return response.data;
  },

  async updatePreferences(preferences: UserPreferences): Promise<void> {
    await api.put('/api/users/me/preferences/', preferences);
  },

  async updateProfile(profile: UserProfileUpdate): Promise<void> {
    await api.put('/api/users/me/profile/', profile);
  },

  // ─── Body Stats ─────────────────────────────────────────
  async getBodyStats(): Promise<BodyStats> {
    const response = await api.get<BodyStats>('/api/users/me/body-stats/');
    return response.data;
  },

  async updateBodyStats(stats: BodyStats): Promise<void> {
    await api.put('/api/users/me/body-stats/', stats);
  },

  // ─── Notification Preferences ───────────────────────────
  async getNotificationPreferences(): Promise<NotificationPreferences> {
    const response = await api.get<NotificationPreferences>('/api/users/me/notifications/');
    return response.data;
  },

  async updateNotificationPreferences(prefs: NotificationPreferences): Promise<void> {
    await api.put('/api/users/me/notifications/', prefs);
  },

  // ─── Avatar ─────────────────────────────────────────────
  async uploadAvatar(imageBase64: string): Promise<string> {
    const response = await api.post<{ avatar_url: string }>('/api/users/me/avatar', {
      image_base64: imageBase64,
    }, { timeout: 30000 });
    return response.data.avatar_url;
  },
};

export default userService;
