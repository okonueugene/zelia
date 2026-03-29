import React, { useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { getMessages } from '../../../src/api/messages';
import { useAuthStore, selectIsAuthenticated } from '../../../src/store/authStore';
import { useAppStore } from '../../../src/store/appStore';
import { getCacheConfig } from '../../../src/hooks/useCacheConfig';
import { Card } from '../../../src/components/ui/Card';
import { Badge } from '../../../src/components/ui/Badge';
import { Colors, FontSize, Spacing, BorderRadius } from '../../../src/constants/colors';

export default function MoreMenuScreen() {
  const router = useRouter();
  const { user, logout } = useAuthStore();
  const isAuthenticated = useAuthStore(selectIsAuthenticated);
  const unreadNotifCount = useAppStore((s) => s.unreadCount ?? 0);

  // Derive message unread count from TanStack cache (stays fresh across tab switches)
  const { data: messagesData } = useQuery({
    queryKey: ['messages'],
    queryFn: getMessages,
    enabled: isAuthenticated,
    ...getCacheConfig('messages'),
    staleTime: 30_000,
  });
  const unreadMsgCount = (messagesData?.results ?? []).filter((m: any) => !m.is_read).length;

  const handleLogout = useCallback(() => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          await logout();
          router.replace('/login');
        },
      },
    ]);
  }, [logout, router]);

  const menuItems = [
    {
      icon: 'chatbubbles-outline',
      label: 'Internal Messages',
      route: '/(tabs)/more/messages',
      count: unreadMsgCount > 0 ? unreadMsgCount : null,
      color: Colors.primary,
    },
    {
      icon: 'notifications-outline',
      label: 'Notifications',
      route: '/(tabs)/more/notifications',
      count: unreadNotifCount > 0 ? unreadNotifCount : null,
      color: Colors.warning,
    },
    {
      icon: 'star-outline',
      label: 'Customer Feedback',
      route: '/(tabs)/more/feedback',
      count: null,
      color: Colors.secondary,
    },
    {
      icon: 'person-outline',
      label: 'My Profile',
      route: '/(tabs)/more/profile',
      count: null,
      color: Colors.gray600,
    },
  ];

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>More</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* User card */}
        <Card style={styles.userCard}>
          <View style={styles.userRow}>
            <View style={[styles.userAvatar, user?.is_admin && { backgroundColor: Colors.primaryDark }]}>
              <Text style={styles.userAvatarText}>
                {(user?.user?.first_name?.charAt(0) ?? user?.user?.username?.charAt(0) ?? 'U').toUpperCase()}
              </Text>
            </View>
            <View style={styles.userInfo}>
              <Text style={styles.userName} numberOfLines={1}>
                {user?.user?.first_name} {user?.user?.last_name}
              </Text>
              <View style={styles.userRoleRow}>
                <Ionicons
                  name={user?.is_admin ? 'shield-checkmark' : 'briefcase-outline'}
                  size={13}
                  color={user?.is_admin ? Colors.gold : Colors.primary}
                />
                <Text style={styles.userRole}>
                  {user?.is_admin ? 'Administrator' : 'Salesperson'}
                </Text>
              </View>
              {user?.department && <Text style={styles.userDept}>{user.department}</Text>}
              {user?.user?.email && <Text style={styles.userEmail}>{user.user.email}</Text>}
            </View>
            <TouchableOpacity
              onPress={() => router.push('/(tabs)/more/profile' as any)}
              style={styles.profileArrow}
              accessibilityLabel="View profile"
            >
              <Ionicons name="chevron-forward" size={18} color={Colors.gray400} />
            </TouchableOpacity>
          </View>
        </Card>

        {/* Menu items */}
        {menuItems.map((item) => (
          <TouchableOpacity
            key={item.label}
            style={styles.menuItem}
            onPress={() => router.push(item.route as any)}
            activeOpacity={0.75}
            accessibilityRole="button"
            accessibilityLabel={`${item.label}${item.count ? `, ${item.count} unread` : ''}`}
          >
            <View style={[styles.menuIcon, { backgroundColor: `${item.color}20` }]}>
              <Ionicons name={item.icon as any} size={22} color={item.color} />
            </View>
            <Text style={styles.menuLabel}>{item.label}</Text>
            <View style={styles.menuRight}>
              {item.count ? (
                <View style={styles.countBadge}>
                  <Text style={styles.countText}>{item.count > 99 ? '99+' : item.count}</Text>
                </View>
              ) : null}
              <Ionicons name="chevron-forward" size={18} color={Colors.gray400} />
            </View>
          </TouchableOpacity>
        ))}

        {/* Sign out */}
        <TouchableOpacity
          style={[styles.menuItem, styles.logoutItem]}
          onPress={handleLogout}
          activeOpacity={0.75}
          accessibilityRole="button"
          accessibilityLabel="Sign out"
        >
          <View style={[styles.menuIcon, { backgroundColor: Colors.errorSurface }]}>
            <Ionicons name="log-out-outline" size={22} color={Colors.error} />
          </View>
          <Text style={[styles.menuLabel, { color: Colors.error }]}>Sign Out</Text>
          <Ionicons name="chevron-forward" size={18} color={Colors.error} />
        </TouchableOpacity>

        <Text style={styles.versionText}>ZeliaOMS v1.0</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  header: {
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    paddingTop: Spacing.lg,
  },
  headerTitle: { fontSize: FontSize.xl, fontWeight: '700', color: Colors.white, textAlign: 'center' },
  content: { padding: Spacing.md, paddingBottom: 60 },

  userCard: { marginBottom: Spacing.md },
  userRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  userAvatar: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: Colors.primarySurface,
    alignItems: 'center', justifyContent: 'center',
  },
  userAvatarText: { fontSize: FontSize.lg, fontWeight: '700', color: Colors.primary },
  userInfo: { flex: 1, gap: 3 },
  userName: { fontSize: FontSize.lg, fontWeight: '700', color: Colors.textPrimary },
  userRoleRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  userRole: { fontSize: FontSize.sm, color: Colors.textSecondary, fontWeight: '600' },
  userDept: { fontSize: FontSize.xs, color: Colors.textSecondary },
  userEmail: { fontSize: FontSize.xs, color: Colors.textSecondary },
  profileArrow: { padding: Spacing.sm },

  menuItem: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    gap: Spacing.md,
    borderWidth: 1, borderColor: Colors.gray200,
  },
  logoutItem: { marginTop: Spacing.sm },
  menuIcon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  menuLabel: { flex: 1, fontSize: FontSize.md, fontWeight: '600', color: Colors.textPrimary },
  menuRight: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  countBadge: {
    minWidth: 22, height: 22, borderRadius: 11,
    backgroundColor: Colors.error,
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 6,
  },
  countText: { fontSize: 11, fontWeight: '700', color: Colors.white },
  versionText: { textAlign: 'center', fontSize: FontSize.xs, color: Colors.gray400, marginTop: Spacing.lg },
});
