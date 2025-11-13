import api from './api';
import * as SecureStore from 'expo-secure-store';
import { AuthToken, LoginRequest, RegisterRequest, User } from '../types/user';

class AuthService {
  async register(data: RegisterRequest): Promise<AuthToken> {
    const response = await api.post<AuthToken>('/api/auth/register', data);
    const authToken = response.data;
    
    // Store token securely
    await SecureStore.setItemAsync('auth_token', authToken.access_token);
    
    return authToken;
  }

  async login(data: LoginRequest): Promise<AuthToken> {
    const response = await api.post<AuthToken>('/api/auth/login', data);
    const authToken = response.data;
    
    // Store token securely
    await SecureStore.setItemAsync('auth_token', authToken.access_token);
    
    return authToken;
  }

  async logout(): Promise<void> {
    await SecureStore.deleteItemAsync('auth_token');
  }

  async getCurrentUser(): Promise<User> {
    const response = await api.get<User>('/api/auth/me');
    return response.data;
  }

  async updateProfile(data: any): Promise<User> {
    const response = await api.put<User>('/api/auth/profile', data);
    return response.data;
  }

  async getStoredToken(): Promise<string | null> {
    return await SecureStore.getItemAsync('auth_token');
  }

  async isAuthenticated(): Promise<boolean> {
    const token = await this.getStoredToken();
    return !!token;
  }
}

export const authService = new AuthService();