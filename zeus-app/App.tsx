import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppNavigator } from './src/navigation/AppNavigator';
import { useThemeStore } from './src/store/themeStore';
import { useDataStore } from './src/store/dataStore';
import { useNetworkStatus } from './src/hooks/useNetworkStatus';
import { NetworkBanner } from './src/components/NetworkBanner';
import { API_BASE_URL } from './config';

function AppContent() {
  const { isDark, loadTheme } = useThemeStore();
  const { isOffline, lastSyncedAt } = useNetworkStatus(API_BASE_URL);

  useEffect(() => {
    loadTheme();
    // Manually hydrate the persisted data store after mount
    // This avoids the React 19 useSyncExternalStore infinite loop
    useDataStore.persist.rehydrate();
  }, []);

  return (
    <>
      {isOffline && (
        <NetworkBanner isOffline={isOffline} lastSynced={lastSyncedAt ? new Date(lastSyncedAt) : null} />
      )}
      <AppNavigator />
      <StatusBar style={isDark ? 'light' : 'dark'} />
    </>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AppContent />
    </SafeAreaProvider>
  );
}
