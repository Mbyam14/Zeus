import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import { Appearance, ColorSchemeName } from 'react-native';

export type ThemeMode = 'light' | 'dark' | 'system';

export interface ThemeColors {
  // Backgrounds
  background: string;
  backgroundSecondary: string;
  card: string;

  // Text
  text: string;
  textSecondary: string;
  textMuted: string;

  // Brand
  primary: string;
  primaryDark: string;
  secondary: string;

  // UI Elements
  border: string;
  borderLight: string;
  inputBackground: string;

  // Status
  success: string;
  error: string;
  warning: string;

  // Special
  overlay: string;
  shadow: string;
}

export const lightTheme: ThemeColors = {
  // Backgrounds
  background: '#F8F9FA',
  backgroundSecondary: '#FFFFFF',
  card: '#FFFFFF',

  // Text
  text: '#2C3E50',
  textSecondary: '#5D6D7E',
  textMuted: '#7F8C8D',

  // Brand
  primary: '#FF6B35',
  primaryDark: '#E55A2B',
  secondary: '#004E89',

  // UI Elements
  border: '#E1E8ED',
  borderLight: '#F0F3F5',
  inputBackground: '#FFFFFF',

  // Status
  success: '#27AE60',
  error: '#E74C3C',
  warning: '#F39C12',

  // Special
  overlay: 'rgba(0, 0, 0, 0.5)',
  shadow: '#000000',
};

export const darkTheme: ThemeColors = {
  // Backgrounds
  background: '#121212',
  backgroundSecondary: '#1E1E1E',
  card: '#252525',

  // Text
  text: '#FFFFFF',
  textSecondary: '#B0B0B0',
  textMuted: '#808080',

  // Brand
  primary: '#FF6B35',
  primaryDark: '#FF8A5C',
  secondary: '#4A9FD4',

  // UI Elements
  border: '#333333',
  borderLight: '#2A2A2A',
  inputBackground: '#2A2A2A',

  // Status
  success: '#2ECC71',
  error: '#E74C3C',
  warning: '#F1C40F',

  // Special
  overlay: 'rgba(0, 0, 0, 0.7)',
  shadow: '#000000',
};

const THEME_STORAGE_KEY = 'zeus_theme_mode';

interface ThemeState {
  mode: ThemeMode;
  colors: ThemeColors;
  isDark: boolean;

  // Actions
  setMode: (mode: ThemeMode) => Promise<void>;
  loadTheme: () => Promise<void>;
}

const getEffectiveTheme = (mode: ThemeMode): { colors: ThemeColors; isDark: boolean } => {
  if (mode === 'system') {
    const systemTheme = Appearance.getColorScheme();
    const isDark = systemTheme === 'dark';
    return { colors: isDark ? darkTheme : lightTheme, isDark };
  }
  const isDark = mode === 'dark';
  return { colors: isDark ? darkTheme : lightTheme, isDark };
};

export const useThemeStore = create<ThemeState>((set, get) => ({
  mode: 'system',
  colors: lightTheme,
  isDark: false,

  setMode: async (mode: ThemeMode) => {
    try {
      await SecureStore.setItemAsync(THEME_STORAGE_KEY, mode);
      const { colors, isDark } = getEffectiveTheme(mode);
      set({ mode, colors, isDark });
    } catch (error) {
      console.error('Failed to save theme preference:', error);
    }
  },

  loadTheme: async () => {
    try {
      const savedMode = await SecureStore.getItemAsync(THEME_STORAGE_KEY);
      const mode = (savedMode as ThemeMode) || 'system';
      const { colors, isDark } = getEffectiveTheme(mode);
      set({ mode, colors, isDark });
    } catch (error) {
      console.error('Failed to load theme preference:', error);
      // Default to system theme
      const { colors, isDark } = getEffectiveTheme('system');
      set({ mode: 'system', colors, isDark });
    }
  },
}));

// Subscribe to system theme changes
Appearance.addChangeListener(({ colorScheme }) => {
  const state = useThemeStore.getState();
  if (state.mode === 'system') {
    const isDark = colorScheme === 'dark';
    useThemeStore.setState({
      colors: isDark ? darkTheme : lightTheme,
      isDark,
    });
  }
});
