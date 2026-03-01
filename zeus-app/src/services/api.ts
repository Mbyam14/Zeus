import axios from 'axios';
import * as SecureStore from 'expo-secure-store';
import { config } from '../../config';

// Base URL for your Zeus backend (configured in config.ts)
const BASE_URL = config.API_BASE_URL;

const api = axios.create({
  baseURL: BASE_URL,
  timeout: 15000, // 15 second default timeout
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

// Response interceptor to handle auth errors and retry on failures
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const config = error.config;

    // Handle 401 - token expired
    if (error.response?.status === 401) {
      await SecureStore.deleteItemAsync('auth_token');
      return Promise.reject(error);
    }

    // Retry logic: retry up to 2x on network errors and 5xx responses
    if (!config._retryCount) config._retryCount = 0;
    const isRetryable =
      error.code === 'ECONNABORTED' ||
      error.code === 'ERR_NETWORK' ||
      (!error.response && error.message === 'Network Error') ||
      (error.response?.status >= 500 && error.response?.status < 600);

    if (config._retryCount < 2 && isRetryable) {
      config._retryCount++;
      const delay = 1000 * Math.pow(2, config._retryCount - 1); // 1s, 2s
      await new Promise((resolve) => setTimeout(resolve, delay));
      return api(config);
    }

    return Promise.reject(error);
  }
);

export default api;
