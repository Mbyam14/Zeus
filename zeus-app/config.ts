/**
 * Configuration file for Zeus App
 *
 * Environment-aware configuration that automatically selects the correct API URL
 * based on the EAS build channel or development mode.
 *
 * For local development:
 * - Update the development API_BASE_URL with your computer's local IP address
 * - To find your IP: Windows 'ipconfig', Mac/Linux 'ifconfig'
 *
 * For production:
 * - Update preview/production URLs with your deployed backend URL (e.g., Railway)
 */

import Constants from 'expo-constants';

interface EnvConfig {
  API_BASE_URL: string;
  API_TIMEOUT: number;
}

const ENV: Record<string, EnvConfig> = {
  development: {
    // UPDATE THIS with your local IP address for development
    API_BASE_URL: 'http://192.168.0.16:8000',
    API_TIMEOUT: 20000,
  },
  preview: {
    // UPDATE THIS with your deployed backend URL (e.g., Railway)
    API_BASE_URL: 'https://your-backend-url.up.railway.app',
    API_TIMEOUT: 15000,
  },
  production: {
    // UPDATE THIS with your production backend URL
    API_BASE_URL: 'https://your-backend-url.up.railway.app',
    API_TIMEOUT: 15000,
  },
};

/**
 * Get environment-specific configuration
 *
 * Priority:
 * 1. EAS build channel (preview, production)
 * 2. Expo release channel (if using classic updates)
 * 3. Default to development
 */
const getEnvVars = (): EnvConfig => {
  // Check for EAS build channel
  const easChannel = Constants.expoConfig?.extra?.eas?.channel;
  if (easChannel && ENV[easChannel]) {
    return ENV[easChannel];
  }

  // Check for Expo updates channel
  const expoChannel = Constants.expoConfig?.updates?.url ? 'production' : undefined;
  if (expoChannel && ENV[expoChannel]) {
    return ENV[expoChannel];
  }

  // Check if running in Expo Go (development)
  const isExpoGo = Constants.appOwnership === 'expo';
  if (isExpoGo) {
    return ENV.development;
  }

  // Check release channel from manifest (legacy Expo)
  const releaseChannel = (Constants.manifest as any)?.releaseChannel;
  if (releaseChannel && ENV[releaseChannel]) {
    return ENV[releaseChannel];
  }

  // Default to development
  return ENV.development;
};

export const config = getEnvVars();

// Export individual values for convenience
export const API_BASE_URL = config.API_BASE_URL;
export const API_TIMEOUT = config.API_TIMEOUT;
