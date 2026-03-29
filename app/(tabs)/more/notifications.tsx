import React from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import Toast from 'react-native-toast-message';
import { getNotifications, markAllNotificationsRead, markNotificationRead } from '../../../src/api/notifications';
import { useAuthStore, selectIsAuthenticated } from '../../../src/store/authStore';
import { getCacheConfig } from '../../../src/hooks/useCacheConfig';
import { LoadingSpinner } from '../../../src/components/ui/LoadingSpinner';
import { EmptyState } from '../../../src/components/ui/EmptyState';
import { Card } from '../../../src/components/ui/Card';
import { Colors, FontSize, Spacing, BorderRadius } from '../../../src/constants/colors';

function getNotifIcon(type: string): string {
  const map: Record<string, string> = {
    feedback_new: 'chatbox-outline', message_new: 'chatbubbles-outline',
    order_created: 'cart-outline', order_updated: 'pencil-outline',
    order_deleted: 'trash-outline', beat_visit: 'location-outline',
    beat_plan_new: 'calendar-outline', stock_change: 'layers-outline',
    payment_new: 'cash-outline', login_new: 'lock-closed-outline',
  };
  return map[type] ?? 'notifications-outline';
}

function getNotifColor(type: string): string {
  const map: Record<string, string> = {
    feedback_new: Colors.secondary, message_new: Colors.primary,
    order_created: Colors.info, order_updated: Colors.info,
    order_deleted: Colors.error, beat_visit: Colors.primary,
    beat_plan_new: Colors.primary, stock_change: Colors.warning,
    payment_new: Colors.success, login_new: Colors.gray600,
  };
  return map[type] ?? Colors.gray500;
}

export default function NotificationsScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const isAuthenticated = useAuthStore(selectIsAuthenticated);

  const { data: notificationsData, isLoading } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => getNotifications(),
    enabled: isAuthenticated,
    ...getCacheConfig('notifications'),
  });
  const notifications = notificationsData?.results ?? [];
  const hasUnread = notifications.some((n) => !n.is_read);

  const { mutate: markAllRead, isPending: markingAll } = useMutation({
    mutationFn: markAllNotificationsRead,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['notifications', 'unread'] });
      Toast.show({ type: 'success', text1: 'All notifications marked as read' });
    },
  });

  const { mutate: markSingleRead } = useMutation({
    mutationFn: markNotificationRead,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['notifications', 'unread'] });
    },
  });

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} accessibilityLabel="Go back">
          <Ionicons name="arrow-back" size={22} color={Colors.white} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Notifications</Text>
        <View style={styles.headerRight}>
          {hasUnread && (
            <TouchableOpacity
              onPress={() => markAllRead()}
              disabled={markingAll}
              accessibilityLabel="Mark all as read"
            >
              <Text style={styles.markAllText}>{markingAll ? 'Marking…' : 'Mark all read'}</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {isLoading ? (
        <LoadingSpinner message="Loading notifications..." />
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={[styles.list, notifications.length === 0 && { flex: 1 }]}
          ListEmptyComponent={
            <EmptyState icon="notifications-outline" title="All caught up!" description="No notifications yet." />
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              activeOpacity={item.is_read ? 1 : 0.7}
              onPress={() => { if (!item.is_read) markSingleRead(item.id); }}
              accessibilityRole="button"
              accessibilityLabel={`${item.title}${!item.is_read ? ', unread' : ''}`}
            >
              <Card style={[styles.card, !item.is_read && styles.cardUnread]}>
                <View style={styles.row}>
                  <View style={[styles.iconWrap, { backgroundColor: getNotifColor(item.event_type) + '20' }]}>
                    <Ionicons name={getNotifIcon(item.event_type) as any} size={18} color={getNotifColor(item.event_type)} />
                  </View>
                  <View style={styles.body}>
                    <Text style={[styles.title, !item.is_read && styles.titleUnread]}>{item.title}</Text>
                    <Text style={[styles.msg, !item.is_read && styles.msgUnread]}>{item.body}</Text>
                    <Text style={styles.time}>{format(new Date(item.created_at), 'dd MMM, HH:mm')}</Text>
                  </View>
                  {!item.is_read && <View style={styles.unreadDot} />}
                </View>
              </Card>
            </TouchableOpacity>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  header: {
    backgroundColor: Colors.primary, flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.md, paddingTop: Spacing.lg, paddingBottom: Spacing.md, gap: Spacing.sm,
  },
  headerTitle: { flex: 1, fontSize: FontSize.lg, fontWeight: '700', color: Colors.white, textAlign: 'center' },
  backBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerRight: { width: 80, alignItems: 'flex-end' },
  markAllText: { fontSize: FontSize.sm, color: Colors.white, fontWeight: '600' },
  list: { padding: Spacing.md, paddingBottom: 40 },

  card: { marginBottom: Spacing.sm },
  cardUnread: { backgroundColor: Colors.primarySurface },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md },
  iconWrap: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1 },
  title: { fontSize: FontSize.md, fontWeight: '600', color: Colors.textPrimary, marginBottom: 2 },
  titleUnread: { fontWeight: '700' },
  msg: { fontSize: FontSize.sm, color: Colors.textSecondary, lineHeight: 20 },
  msgUnread: { fontWeight: '500', color: Colors.textPrimary },
  time: { fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: 4 },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.primary, marginTop: 4 },
});
