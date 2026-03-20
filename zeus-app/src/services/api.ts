import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import * as SecureStore from 'expo-secure-store';
import { config } from '../../config';

const BASE_URL = config.API_BASE_URL;

const api = axios.create({
  baseURL: BASE_URL,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
  },
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

// Track refresh state to prevent concurrent refresh attempts
let isRefreshing = false;
let refreshSubscribers: Array<(token: string) => void> = [];

function onRefreshed(token: string) {
  refreshSubscribers.forEach((cb) => cb(token));
  refreshSubscribers = [];
}

function addRefreshSubscriber(cb: (token: string) => void) {
  refreshSubscribers.push(cb);
}

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

// Response interceptor with token refresh
api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retryCount?: number; _isRetry?: boolean };
    if (!originalRequest) return Promise.reject(error);

    // Handle 401 - try refresh token
    if (error.response?.status === 401 && !originalRequest._isRetry) {
      // Don't try to refresh if this IS the refresh request
      if (originalRequest.url?.includes('/auth/refresh')) {
        await SecureStore.deleteItemAsync('auth_token');
        await SecureStore.deleteItemAsync('refresh_token');
        return Promise.reject(error);
      }

      if (isRefreshing) {
        // Wait for the ongoing refresh to complete
        return new Promise((resolve) => {
          addRefreshSubscriber((newToken: string) => {
            originalRequest.headers.Authorization = `Bearer ${newToken}`;
            originalRequest._isRetry = true;
            resolve(api(originalRequest));
          });
        });
      }

      isRefreshing = true;
      originalRequest._isRetry = true;

      try {
        const refreshToken = await SecureStore.getItemAsync('refresh_token');
        if (!refreshToken) {
          throw new Error('No refresh token');
        }

        const response = await axios.post(`${BASE_URL}/api/auth/refresh`, {
          refresh_token: refreshToken,
        });

        const { access_token, refresh_token: newRefreshToken } = response.data;

        await SecureStore.setItemAsync('auth_token', access_token);
        if (newRefreshToken) {
          await SecureStore.setItemAsync('refresh_token', newRefreshToken);
        }

        isRefreshing = false;
        onRefreshed(access_token);

        // Retry original request with new token
        originalRequest.headers.Authorization = `Bearer ${access_token}`;
        return api(originalRequest);
      } catch (refreshError) {
        isRefreshing = false;
        refreshSubscribers = [];
        // Refresh failed — clear tokens and force re-login
        await SecureStore.deleteItemAsync('auth_token');
        await SecureStore.deleteItemAsync('refresh_token');
        return Promise.reject(error);
      }
    }

    // Retry logic: retry up to 2x on network errors and 5xx responses
    if (!originalRequest._retryCount) originalRequest._retryCount = 0;
    const isRetryable =
      error.code === 'ECONNABORTED' ||
      error.code === 'ERR_NETWORK' ||
      (!error.response && error.message === 'Network Error') ||
      (error.response && error.response.status >= 500 && error.response.status < 600);

    if (originalRequest._retryCount < 2 && isRetryable) {
      originalRequest._retryCount++;
      const delay = 1000 * Math.pow(2, originalRequest._retryCount - 1);
      await new Promise((resolve) => setTimeout(resolve, delay));
      return api(originalRequest);
    }

    return Promise.reject(error);
  }
);

export default api;
