import React, { useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { getDashboardStats } from '../../src/api/orders';
import { useAuthStore, selectIsAuthenticated } from '../../src/store/authStore';
import { useAppStore } from '../../src/store/appStore';
import { StatsCard } from '../../src/components/StatsCard';
import { OrderCard } from '../../src/components/OrderCard';
import { DashboardStatsComponent } from '../../src/components/DashboardStats';
import { LoadingSpinner } from '../../src/components/ui/LoadingSpinner';
import { Colors, FontSize, Spacing, BorderRadius, Shadow } from '../../src/constants/colors';

export default function DashboardScreen() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const isAuthenticated = useAuthStore(selectIsAuthenticated);
  const unreadCount = useAppStore((s) => s.unreadCount ?? 0);
  const unreadNotifications = useAppStore((s) => s.unreadNotifications ?? 0);

  const { data: stats, isLoading, refetch, isRefetching, isError } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: getDashboardStats,
    enabled: isAuthenticated,
  });

  const greeting = useCallback(() => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  }, []);

  const firstName = user?.user?.first_name ?? user?.user?.username ?? 'User';
  const avatarLetter = firstName[0]?.toUpperCase() ?? 'U';

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.greeting}>{greeting()},</Text>
          <View style={styles.nameRow}>
            <Text style={styles.name} numberOfLines={1}>{firstName}</Text>
            {user?.is_admin && (
              <View style={styles.roleBadge}>
                <Ionicons name="shield-checkmark" size={11} color={Colors.gold} />
                <Text style={styles.roleBadgeText}>Admin</Text>
              </View>
            )}
            {user?.is_salesperson && !user?.is_admin && (
              <View style={[styles.roleBadge, styles.salesBadge]}>
                <Ionicons name="briefcase-outline" size={11} color={Colors.white} />
                <Text style={styles.roleBadgeText}>Sales</Text>
              </View>
            )}
          </View>
          {user?.department && (
            <Text style={styles.department}>{user.department}</Text>
          )}
        </View>

        <View style={styles.headerActions}>
          {/* Notifications button with live badge */}
          <TouchableOpacity
            onPress={() => router.push('/(tabs)/more')}
            style={styles.headerBtn}
            accessibilityLabel={`Notifications${unreadNotifications > 0 ? `, ${unreadNotifications} unread` : ''}`}
          >
            <Ionicons name="notifications-outline" size={22} color={Colors.white} />
            {unreadNotifications > 0 && (
              <View style={styles.notifBadge}>
                <Text style={styles.notifBadgeText}>
                  {unreadNotifications > 99 ? '99+' : unreadNotifications}
                </Text>
              </View>
            )}
          </TouchableOpacity>

          {/* Avatar */}
          <TouchableOpacity
            onPress={() => router.push('/(tabs)/more')}
            style={styles.headerBtn}
            accessibilityLabel="My profile"
          >
            <View style={styles.avatarCircle}>
              <Text style={styles.avatarText}>{avatarLetter}</Text>
            </View>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={refetch}
            colors={[Colors.primary]}
            tintColor={Colors.primary}
          />
        }
      >
        <Text style={styles.date}>{format(new Date(), 'EEEE, dd MMMM yyyy')}</Text>

        {/* Error state */}
        {isError && !isLoading && (
          <TouchableOpacity style={styles.errorBanner} onPress={() => refetch()}>
            <Ionicons name="alert-circle-outline" size={18} color={Colors.error} />
            <Text style={styles.errorBannerText}>Failed to load stats — tap to retry</Text>
          </TouchableOpacity>
        )}

        {isLoading ? (
          <LoadingSpinner 
          fullScreen
          size="large"
          message="Loading dashboard..." />
        ) : (
          <>
            {/* Overview stats */}
            <Text style={styles.sectionTitle}>Overview</Text>
            <View style={styles.statsGrid}>
              <StatsCard
                label="Total Orders"
                value={stats?.total_orders ?? 0}
                icon="receipt-outline"
                iconColor={Colors.primary}
                iconBg={Colors.primarySurface}
                onPress={() => router.push('/(tabs)/orders')}
              />
              <StatsCard
                label="Customers"
                value={stats?.total_customers ?? 0}
                icon="people-outline"
                iconColor={Colors.secondary}
                iconBg={Colors.secondarySurface}
                onPress={() => router.push('/(tabs)/customers')}
              />
            </View>
            <View style={styles.statsGrid}>
              <StatsCard
                label="Revenue"
                value={`KSh ${parseFloat(stats?.total_revenue ?? '0').toLocaleString()}`}
                icon="cash-outline"
                iconColor={Colors.success}
                iconBg={Colors.successSurface}
              />
              <StatsCard
                label="Pending Orders"
                value={stats?.pending_orders ?? 0}
                icon="time-outline"
                iconColor={Colors.warning}
                iconBg={Colors.warningSurface}
                onPress={() => router.push('/(tabs)/orders')}
              />
            </View>
            <View style={styles.statsGrid}>
              <StatsCard
                label="Products"
                value={stats?.total_products ?? 0}
                icon="cube-outline"
                iconColor={Colors.info}
                iconBg={Colors.infoSurface}
                onPress={() => router.push('/(tabs)/products')}
              />
              <StatsCard
                label="Low Stock"
                value={stats?.low_stock_alerts ?? 0}
                icon="alert-circle-outline"
                iconColor={(stats?.low_stock_alerts ?? 0) > 0 ? Colors.error : Colors.success}
                iconBg={(stats?.low_stock_alerts ?? 0) > 0 ? Colors.errorSurface : Colors.successSurface}
                onPress={() => router.push('/(tabs)/more')}
              />
            </View>

            {/* Quick Actions */}
            <Text style={styles.sectionTitle}>Quick Actions</Text>
            <View style={styles.quickActions}>
              {[
                { label: 'New Order', icon: 'add-circle-outline', route: '/(tabs)/orders/create', color: Colors.accent },
                { label: 'Add Customer', icon: 'person-add-outline', route: '/(tabs)/customers/add', color: Colors.primary },
                { label: 'Products', icon: 'cube-outline', route: '/(tabs)/products', color: Colors.info },
                { label: 'More', icon: 'grid-outline', route: '/(tabs)/more', color: Colors.secondary },
              ].map((action) => (
                <TouchableOpacity
                  key={action.label}
                  style={styles.quickActionBtn}
                  onPress={() => router.push(action.route as any)}
                  activeOpacity={0.75}
                  accessibilityLabel={action.label}
                  accessibilityRole="button"
                >
                  <View style={[styles.quickActionIcon, { backgroundColor: action.color + '18' }]}>
                    <Ionicons name={action.icon as any} size={24} color={action.color} />
                  </View>
                  <Text style={styles.quickActionLabel}>{action.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Detailed analytics */}
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Detailed Analytics</Text>
            </View>
            <DashboardStatsComponent stats={stats ?? null} loading={isLoading} />

            {/* Admin-only section */}
            {user?.is_admin && (
              <>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>Admin Overview</Text>
                  <View style={styles.adminPill}>
                    <Ionicons name="shield-checkmark" size={12} color={Colors.gold} />
                    <Text style={styles.adminPillText}>Admin only</Text>
                  </View>
                </View>
                <View style={styles.statsGrid}>
                  <TouchableOpacity
                    style={styles.adminStatCard}
                    onPress={() => router.push('/(tabs)/more' as any)}
                    activeOpacity={0.8}
                    accessibilityLabel="Stock Transfers"
                  >
                    <Ionicons name="swap-horizontal-outline" size={22} color={Colors.primary} />
                    <Text style={styles.adminStatLabel}>Stock Transfers</Text>
                    <Text style={styles.adminStatSub}>Manage inter-store stock</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.adminStatCard,
                      (stats?.low_stock_alerts ?? 0) > 0 && styles.adminStatCardAlert,
                    ]}
                    onPress={() => router.push('/(tabs)/more' as any)}
                    activeOpacity={0.8}
                    accessibilityLabel="Low Stock alerts"
                  >
                    <Ionicons
                      name="alert-circle-outline"
                      size={22}
                      color={(stats?.low_stock_alerts ?? 0) > 0 ? Colors.error : Colors.success}
                    />
                    <Text style={styles.adminStatLabel}>Low Stock</Text>
                    <Text style={styles.adminStatSub}>
                      {stats?.low_stock_alerts ?? 0} alert{(stats?.low_stock_alerts ?? 0) !== 1 ? 's' : ''}
                    </Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  header: {
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.lg,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  greeting: { fontSize: FontSize.sm, color: 'rgba(255,255,255,0.75)' },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, flexWrap: 'wrap' },
  name: { fontSize: FontSize.xl, fontWeight: '700', color: Colors.white, flexShrink: 1 },
  roleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(247,184,1,0.2)',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: 'rgba(247,184,1,0.4)',
  },
  salesBadge: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderColor: 'rgba(255,255,255,0.3)',
  },
  roleBadgeText: { fontSize: 10, fontWeight: '700', color: Colors.gold },
  department: { fontSize: FontSize.xs, color: 'rgba(255,255,255,0.6)', marginTop: 2 },
  headerActions: { flexDirection: 'row', gap: Spacing.sm, alignItems: 'center' },
  headerBtn: { padding: Spacing.xs, position: 'relative' },
  // Live notification badge on bell icon
  notifBadge: {
    position: 'absolute',
    top: 2,
    right: 2,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: Colors.error,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
    borderWidth: 1.5,
    borderColor: Colors.primary,
  },
  notifBadgeText: { fontSize: 9, fontWeight: '800', color: Colors.white },
  avatarCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  avatarText: { fontSize: FontSize.md, fontWeight: '800', color: Colors.white },
  scroll: { flex: 1 },
  content: { padding: Spacing.md, paddingBottom: Spacing.xxl },
  date: { fontSize: FontSize.sm, color: Colors.textSecondary, marginBottom: Spacing.md },
  // Error retry banner
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.errorSurface,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.error + '40',
  },
  errorBannerText: { flex: 1, fontSize: FontSize.sm, color: Colors.error, fontWeight: '500' },
  sectionTitle: {
    fontSize: FontSize.lg,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: Spacing.md,
    marginTop: Spacing.md,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: Spacing.md,
    marginBottom: Spacing.md,
  },
  seeAll: { fontSize: FontSize.sm, color: Colors.primary, fontWeight: '600' },
  statsGrid: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.sm },
  quickActions: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: Spacing.md },
  quickActionBtn: { flex: 1, alignItems: 'center', gap: Spacing.xs, padding: Spacing.sm },
  quickActionIcon: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickActionLabel: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    fontWeight: '500',
    textAlign: 'center',
  },
  adminPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: Colors.goldSurface,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: BorderRadius.full,
  },
  adminPillText: { fontSize: FontSize.xs, fontWeight: '700', color: Colors.warning },
  adminStatCard: {
    flex: 1,
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    gap: Spacing.xs,
    ...Shadow.sm,
  },
  adminStatCardAlert: {
    borderWidth: 1,
    borderColor: Colors.error + '40',
    backgroundColor: Colors.errorSurface,
  },
  adminStatLabel: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.textPrimary, marginTop: Spacing.xs },
  adminStatSub: { fontSize: FontSize.xs, color: Colors.textSecondary },
});
