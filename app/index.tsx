import { useEffect, useRef } from 'react';
import { router } from 'expo-router';
import { useAuthStore } from '../src/store/authStore';
import { LoadingSpinner } from '../src/components/ui/LoadingSpinner';

/**
 * Entry-point redirect screen.
 *
 * Why useEffect + ref instead of <Redirect>:
 * <Redirect> calls router.replace() on EVERY render.  If authStore.isLoading
 * toggles (e.g. during a login attempt) index.tsx re-renders and <Redirect>
 * fires again, remounting the login screen and wiping the user's typed values.
 *
 * The ref ensures we navigate exactly once — when authReady first becomes true.
 * All subsequent auth transitions (session expiry, idle logout) are handled by
 * client.ts / useIdleLogout which call router.replace('/login') directly.
 */
export default function Index() {
  const authReady = useAuthStore((s) => s.authReady);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const hasNavigated = useRef(false);

  useEffect(() => {
    if (!authReady || hasNavigated.current) return;
    hasNavigated.current = true;
    router.replace(isAuthenticated ? '/(tabs)' : '/login');
  }, [authReady, isAuthenticated]);

  return <LoadingSpinner fullScreen message="Loading ZeliaOMS..." />;
}
