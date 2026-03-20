import { useEffect, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { useDataStore } from '../store/dataStore';

/**
 * Monitors network connectivity by pinging the API.
 * Updates the dataStore's isOffline flag.
 */
export function useNetworkStatus(apiBaseUrl: string) {
  const setOffline = useDataStore((s) => s.setOffline);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const checkNetwork = async () => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      const response = await fetch(`${apiBaseUrl}/health`, {
        method: 'GET',
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      setOffline(!response.ok);
    } catch {
      setOffline(true);
    }
  };

  useEffect(() => {
    // Check on mount
    checkNetwork();

    // Check every 30 seconds
    intervalRef.current = setInterval(checkNetwork, 30000);

    // Check when app comes to foreground
    const subscription = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active') {
        checkNetwork();
      }
    });

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      subscription.remove();
    };
  }, [apiBaseUrl]);

  // Use separate selectors to avoid creating new object references
  const isOffline = useDataStore((s) => s.isOffline);
  const lastSyncedAt = useDataStore((s) => s.lastSyncedAt);

  return { isOffline, lastSyncedAt };
}
