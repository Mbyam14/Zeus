import axios from 'axios';
import * as SecureStore from 'expo-secure-store';
import { config } from '../../config';

// Base URL for your Zeus backend (configured in config.ts)
const BASE_URL = config.API_BASE_URL;

const api = axios.create({
  baseURL: BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  // Custom params serializer to handle arrays in FastAPI-compatible format
  // Converts selected_days: ['monday', 'tuesday'] to selected_days=monday&selected_days=tuesday
  paramsSerializer: {
    serialize: (params) => {
      const parts: string[] = [];
      Object.entries(params).forEach(([key, value]) => {
        if (Array.isArray(value)) {
          value.forEach((v) => {
            parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(v)}`);
          });
        } else if (value !== null && value !== undefined) {
          parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(value)}`);
        }
      });
      return parts.join('&');
    },
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