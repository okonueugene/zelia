import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getUnreadNotifications, markNotificationRead } from '../api/notifications';
import { useAuthStore, selectIsAuthenticated } from '../store/authStore';

const POLL_INTERVAL = 30_000; // 30 seconds

export function useNotifications() {
  const isAuthenticated = useAuthStore(selectIsAuthenticated);
  const queryClient = useQueryClient();

  // Only fetch and poll when the user is logged in.
  // refetchInterval is handled by React Query — no manual setInterval needed.
  const { data: unreadNotifications = [], refetch, isLoading } = useQuery({
    queryKey: ['notifications', 'unread'],
    queryFn: getUnreadNotifications,
    enabled: isAuthenticated,                          // never fires when logged out
    staleTime: 10_000,
    gcTime: 30_000,
    retry: 1,
    refetchInterval: isAuthenticated ? POLL_INTERVAL : false, // stop polling on logout
    refetchIntervalInBackground: false,                // don't poll while app is backgrounded
  });

  const markAsRead = async (notificationId: number) => {
    try {
      await markNotificationRead(notificationId);
      queryClient.invalidateQueries({ queryKey: ['notifications', 'unread'] });
    } catch (error) {
      console.error('[useNotifications] Failed to mark as read:', error);
    }
  };

  return {
    unreadNotifications: unreadNotifications ?? [],
    unreadCount: (unreadNotifications ?? []).length,
    isLoading,
    markAsRead,
    refetch,
  };
}
