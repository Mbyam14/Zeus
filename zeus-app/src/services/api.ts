import axios from 'axios';
import * as SecureStore from 'expo-secure-store';

// Base URL for your Zeus backend
// Using localhost for emulator (use 10.0.2.2 for Android emulator or localhost for iOS)
const BASE_URL = 'http://localhost:8000';

const api = axios.create({
  baseURL: BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to add auth token
api.interceptors.request.use(
  async (config) => {
    const token = await SecureStore.getItemAsync('auth_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor to handle auth errors
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      // Token expired or invalid, clear it
      await SecureStore.deleteItemAsync('auth_token');
      // You might want to redirect to login here
    }
    return Promise.reject(error);
  }
);

export default api;