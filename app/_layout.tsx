import { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Toast from 'react-native-toast-message';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useAuthStore, selectAuthReady, selectIsAuthenticated } from '../src/store/authStore';
import { useAppStore } from '../src/store/appStore';
import { useNetworkStatus } from '../src/hooks/useNetworkStatus';
import { useIdleLogout } from '../src/hooks/useIdleLogout';
import { useNotifications } from '../src/hooks/useNotifications';
import { usePrefetchCommonQueries } from '../src/hooks/usePrefetch';
import { ErrorBoundary } from '../src/components/ErrorBoundary';
import { SplashScreen } from '../src/components/SplashScreen';
import { Colors } from '../src/constants/colors';

// ─── Query client ─────────────────────────────────────────────────────────────

// Don't retry on auth/not-found errors — only on transient server/network issues
function shouldRetry(failureCount: number, error: unknown): boolean {
  const status = (error as { status?: number })?.status;
  if (status === 401 || status === 403 || status === 404) return false;
  if (failureCount >= 2) return false;
  return true;
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: shouldRetry,
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
      staleTime: 1000 * 60 * 5,       // data fresh for 5 minutes
      gcTime: 1000 * 60 * 30,         // keep unused data for 30 minutes
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
      refetchOnMount: true,
    },
    mutations: {
      retry: false,
    },
  },
});

// ─── Offline banner ───────────────────────────────────────────────────────────

function OfflineBanner() {
  const isOffline = useAppStore((s) => s.isOffline);
  if (!isOffline) return null;
  return (
    <View style={styles.offlineBanner}>
      <Text style={styles.offlineText}>⚠ No internet — data may be outdated</Text>
    </View>
  );
}

// ─── App root ─────────────────────────────────────────────────────────────────

function AppRoot() {
  const loadStoredAuth = useAuthStore((s) => s.loadStoredAuth);
  const authReady = useAuthStore(selectAuthReady);
  const isAuthenticated = useAuthStore(selectIsAuthenticated);
  const setUnreadNotifications = useAppStore((s) => s.setUnreadNotifications);
  const setUnreadCount = useAppStore((s) => s.setUnreadCount);

  useNetworkStatus();
  const { resetActivity } = useIdleLogout();
  usePrefetchCommonQueries();

  const { unreadNotifications, unreadCount } = useNotifications();

  // Sync notification counts to global store when authenticated
  useEffect(() => {
    if (isAuthenticated) {
      setUnreadNotifications(unreadNotifications);
      setUnreadCount(unreadCount);
    }
  }, [unreadNotifications, unreadCount, isAuthenticated]);

  // Load stored auth once on mount
  useEffect(() => {
    loadStoredAuth();
  }, [loadStoredAuth]);

  // When session expires or user logs out, clear all cached query data
  // so the next login doesn't see stale data from a previous session
  useEffect(() => {
    if (!isAuthenticated) {
      queryClient.clear();
    }
  }, [isAuthenticated]);

  // Keep splash until auth check completes + brief fade delay
  const [splashVisible, setSplashVisible] = useState(true);

  useEffect(() => {
    if (authReady) {
      const timer = setTimeout(() => setSplashVisible(false), 800);
      return () => clearTimeout(timer);
    }
  }, [authReady]);

  // Stable touch handler — any touch anywhere resets the idle logout timer
  const handleTouch = useCallback(() => {
    resetActivity();
  }, [resetActivity]);

  if (!authReady || splashVisible) {
    return <SplashScreen message="Restoring session..." duration={Infinity} />;
  }

  return (
    <View style={styles.root} onTouchStart={handleTouch}>
      <OfflineBanner />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="login" />
        <Stack.Screen name="(tabs)" />
      </Stack>
      <StatusBar style="light" backgroundColor={Colors.primary} />
      <Toast position="top" topOffset={60} />
    </View>
  );
}

// ─── Root layout ──────────────────────────────────────────────────────────────

export default function RootLayout() {
  return (
    <ErrorBoundary>
      <GestureHandlerRootView style={styles.root}>
        <QueryClientProvider client={queryClient}>
          <AppRoot />
        </QueryClientProvider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  offlineBanner: {
    backgroundColor: '#D32F2F',
    paddingVertical: 7,
    paddingHorizontal: 16,
    alignItems: 'center',
    zIndex: 9999,
  },
  offlineText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
});
