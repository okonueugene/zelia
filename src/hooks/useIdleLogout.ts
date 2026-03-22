import { useEffect, useRef, useCallback } from 'react';
import { AppState, AppStateStatus, PanResponder } from 'react-native';
import { router } from 'expo-router';
import Toast from 'react-native-toast-message';
import { useAuthStore } from '../store/authStore';

// ─── Configuration ────────────────────────────────────────────────────────────
// 30 minutes of in-app inactivity before logout
const INACTIVITY_TIMEOUT = 30 * 60 * 1000;

// If the app is backgrounded for more than 8 hours, require re-login
// (covers overnight / leaving the phone)
const BACKGROUND_TIMEOUT = 8 * 60 * 60 * 1000;

// Warn the user 2 minutes before auto-logout
const WARN_BEFORE = 2 * 60 * 1000;

export function useIdleLogout() {
  const { logout, isAuthenticated } = useAuthStore();
  const appState = useRef<AppStateStatus>(AppState.currentState);
  const inactivityTimer = useRef<NodeJS.Timeout | null>(null);
  const warnTimer = useRef<NodeJS.Timeout | null>(null);
  const backgroundTime = useRef<number | null>(null);

  const clearTimers = useCallback(() => {
    if (inactivityTimer.current) {
      clearTimeout(inactivityTimer.current);
      inactivityTimer.current = null;
    }
    if (warnTimer.current) {
      clearTimeout(warnTimer.current);
      warnTimer.current = null;
    }
  }, []);

  const doLogout = useCallback(async () => {
    clearTimers();
    Toast.show({
      type: 'info',
      text1: 'Logged out',
      text2: 'You were logged out due to inactivity.',
      visibilityTime: 4000,
    });
    await logout();
    router.replace('/login');
  }, [logout, clearTimers]);

  const resetInactivityTimer = useCallback(() => {
    if (!isAuthenticated) return;

    clearTimers();

    // Warn 2 minutes before logout
    warnTimer.current = setTimeout(() => {
      Toast.show({
        type: 'info',
        text1: 'Still there?',
        text2: 'You will be logged out in 2 minutes due to inactivity.',
        visibilityTime: 6000,
      });
    }, INACTIVITY_TIMEOUT - WARN_BEFORE);

    // Auto-logout after full timeout
    inactivityTimer.current = setTimeout(() => {
      doLogout();
    }, INACTIVITY_TIMEOUT);
  }, [isAuthenticated, clearTimers, doLogout]);

  // ─── App state (background / foreground) ───────────────────────────────────
  useEffect(() => {
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      const wasBackground = appState.current.match(/inactive|background/);
      const isNowActive = nextAppState === 'active';
      const isNowBackground = nextAppState.match(/inactive|background/);

      if (wasBackground && isNowActive) {
        // Coming back to foreground
        const backgroundDuration = backgroundTime.current
          ? Date.now() - backgroundTime.current
          : 0;

        if (backgroundDuration > BACKGROUND_TIMEOUT && isAuthenticated) {
          doLogout();
          return;
        }

        backgroundTime.current = null;
        resetInactivityTimer();
      } else if (isNowBackground) {
        // Going to background — record time, pause timer
        backgroundTime.current = Date.now();
        clearTimers();
      }

      appState.current = nextAppState;
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => subscription.remove();
  }, [isAuthenticated, resetInactivityTimer, doLogout, clearTimers]);

  // ─── Start / stop timer when auth changes ──────────────────────────────────
  useEffect(() => {
    if (isAuthenticated) {
      resetInactivityTimer();
    } else {
      clearTimers();
    }
    return clearTimers;
  }, [isAuthenticated, resetInactivityTimer, clearTimers]);

  // ─── Return a reset function for screens to call on user interaction ───────
  // Usage: in a root ScrollView/View, attach onTouchStart={resetActivity}
  return { resetActivity: resetInactivityTimer };
}
