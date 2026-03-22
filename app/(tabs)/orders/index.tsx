import React, { useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  RefreshControl,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { getOrders } from '../../../src/api/orders';
import { OrderCard } from '../../../src/components/OrderCard';
import { LoadingSpinner } from '../../../src/components/ui/LoadingSpinner';
import { EmptyState } from '../../../src/components/ui/EmptyState';
import { Colors, FontSize, Spacing, BorderRadius } from '../../../src/constants/colors';
import { useDebouncedValue } from '../../../src/hooks/useDebouncedValue';
import { normalizeSearchQuery } from '../../../src/utils/search';
import type { OrderPaidStatus, OrderDeliveryStatus } from '../../../src/types';

// ─── Filter definitions ───────────────────────────────────────────────────────

const PAID_FILTERS: { label: string; value: OrderPaidStatus | '' }[] = [
  { label: 'All', value: '' },
  { label: 'Unpaid', value: 'pending' },
  { label: 'Partial', value: 'partially_paid' },
  { label: 'Paid', value: 'completed' },
  { label: 'Cancelled', value: 'cancelled' },
];

const DELIVERY_FILTERS: { label: string; value: OrderDeliveryStatus | '' }[] = [
  { label: 'All', value: '' },
  { label: 'Pending', value: 'pending' },
  { label: 'Delivered', value: 'completed' },
  { label: 'Returned', value: 'returned' },
  { label: 'Cancelled', value: 'cancelled' },
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function OrdersScreen() {
  const router = useRouter();
  const flatListRef = useRef<FlatList>(null);

  const [search, setSearch, debouncedSearch] = useDebouncedValue('', 400);
  const [paidFilter, setPaidFilter] = useState<OrderPaidStatus | ''>('');
  const [deliveryFilter, setDeliveryFilter] = useState<OrderDeliveryStatus | ''>('');

  const searchParam = useMemo(
    () => (debouncedSearch ? normalizeSearchQuery(debouncedSearch) : ''),
    [debouncedSearch],
  );

  // ─── Data fetching ──────────────────────────────────────────────────────────

  const {
    data,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    refetch,
    isRefetching,
  } = useInfiniteQuery({
    queryKey: ['orders', paidFilter, deliveryFilter, searchParam],
    queryFn: async ({ pageParam = 1 }) => {
      const res = await getOrders({
        paid_status: paidFilter || undefined,
        delivery_status: deliveryFilter || undefined,
        search: searchParam || undefined,
        page: pageParam,
      });
      return res;
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage) => {
      if (!lastPage.next) return undefined;
      try {
        const url = new URL(lastPage.next);
        const pageStr = url.searchParams.get('page');
        return pageStr ? Number(pageStr) : undefined;
      } catch {
        const match = lastPage.next.match(/[?&]page=(\d+)/);
        return match ? Number(match[1]) : undefined;
      }
    },
    staleTime: 2 * 60 * 1000,
  });

  // ─── Derived state ──────────────────────────────────────────────────────────

  const allLoadedOrders = useMemo(
    () => data?.pages.flatMap((page) => page.results) ?? [],
    [data],
  );

  const displayedOrders = useMemo(() => {
    let filtered = [...allLoadedOrders];

    if (paidFilter) {
      filtered = filtered.filter((o) => o.paid_status === paidFilter);
    }

    if (deliveryFilter) {
      filtered = filtered.filter((o) => o.delivery_status === deliveryFilter);
    }

    if (searchParam) {
      const term = searchParam.toLowerCase();
      filtered = filtered.filter(
        (o) =>
          String(o.id).includes(term) ||
          (o.customer_name ?? '').toLowerCase().includes(term) ||
          (o.phone ?? '').toLowerCase().includes(term) ||
          (o.customer_phone ?? '').toLowerCase().includes(term),
      );
    }

    return filtered;
  }, [allLoadedOrders, paidFilter, deliveryFilter, searchParam]);

  const isFiltering = !!paidFilter || !!deliveryFilter || !!searchParam;
  const totalCount = data?.pages[0]?.count ?? 0;
  const hasActiveFilters = !!paidFilter || !!deliveryFilter || !!searchParam;

  // ─── Effects ────────────────────────────────────────────────────────────────

  React.useEffect(() => {
    if (!isLoading) {
      flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
    }
  }, [paidFilter, deliveryFilter, searchParam]);

  useFocusEffect(
    React.useCallback(() => {
      refetch();
    }, [refetch]),
  );

  // ─── Handlers ───────────────────────────────────────────────────────────────

  const loadMore = () => {
    if (hasNextPage && !isFetchingNextPage && !isFiltering) {
      fetchNextPage();
    }
  };

  const clearAllFilters = () => {
    setPaidFilter('');
    setDeliveryFilter('');
    setSearch('');
  };

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Orders</Text>
        <TouchableOpacity
          onPress={() => router.push('/(tabs)/orders/create' as any)}
          style={styles.addBtn}
        >
          <Ionicons name="add" size={22} color={Colors.white} />
        </TouchableOpacity>
      </View>

      {/* Search */}
      <View style={styles.searchWrap}>
        <Ionicons name="search-outline" size={18} color={Colors.gray400} />
        <TextInput
          style={styles.search}
          placeholder="Search by customer, ID, phone..."
          placeholderTextColor={Colors.gray400}
          value={search}
          onChangeText={setSearch}
          autoCapitalize="none"
          returnKeyType="search"
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close-circle" size={18} color={Colors.gray400} />
          </TouchableOpacity>
        )}
      </View>

      {/* Filters */}
      <View style={styles.filtersContainer}>
        {/* Row 1: Payment status */}
        <Text style={styles.filterRowLabel}>Payment</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterRow}
        >
          {PAID_FILTERS.map((f) => (
            <TouchableOpacity
              key={`paid-${f.value}`}
              onPress={() => setPaidFilter(f.value)}
              style={[styles.filterPill, paidFilter === f.value && styles.filterPillActive]}
              activeOpacity={0.7}
            >
              <Text style={[styles.filterText, paidFilter === f.value && styles.filterTextActive]}>
                {f.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Row 2: Delivery status */}
        <Text style={styles.filterRowLabel}>Delivery</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterRow}
        >
          {DELIVERY_FILTERS.map((f) => (
            <TouchableOpacity
              key={`delivery-${f.value}`}
              onPress={() => setDeliveryFilter(f.value)}
              style={[styles.filterPill, deliveryFilter === f.value && styles.filterPillActive]}
              activeOpacity={0.7}
            >
              <Text style={[styles.filterText, deliveryFilter === f.value && styles.filterTextActive]}>
                {f.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Count + Clear filters */}
      <View style={styles.countRow}>
        {!isLoading && (
          <Text style={styles.count}>
            {displayedOrders.length} order{displayedOrders.length !== 1 ? 's' : ''}
            {totalCount > 0 ? ` of ${totalCount} total` : ''}
          </Text>
        )}
        {hasActiveFilters && (
          <TouchableOpacity onPress={clearAllFilters} style={styles.clearBtn}>
            <Ionicons name="close-circle" size={13} color={Colors.primary} />
            <Text style={styles.clearBtnText}>Clear filters</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* List */}
      {isLoading ? (
        <LoadingSpinner message="Loading orders..." />
      ) : (
        <FlatList
          ref={flatListRef}
          data={displayedOrders}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item }) => (
            <OrderCard
              order={item}
              onPress={() => router.push(`/(tabs)/orders/${item.id}` as any)}
            />
          )}
          contentContainerStyle={[styles.list, displayedOrders.length === 0 && { flex: 1 }]}
          ListEmptyComponent={
            <EmptyState
              icon="receipt-outline"
              title="No Orders Found"
              description={
                hasActiveFilters
                  ? 'No orders match your current filters or search.'
                  : 'No orders yet. Create your first one!'
              }
              actionLabel={hasActiveFilters ? 'Clear Filters' : 'Create Order'}
              onAction={
                hasActiveFilters
                  ? clearAllFilters
                  : () => router.push('/(tabs)/orders/create' as any)
              }
            />
          }
          ListFooterComponent={
            isFetchingNextPage ? (
              <View style={styles.footerLoader}>
                <ActivityIndicator size="small" color={Colors.primary} />
                <Text style={styles.footerText}>Loading more...</Text>
              </View>
            ) : null
          }
          onEndReached={loadMore}
          onEndReachedThreshold={0.5}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={refetch}
              colors={[Colors.primary]}
              tintColor={Colors.primary}
            />
          }
          showsVerticalScrollIndicator={false}
        />
      )}
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    backgroundColor: Colors.primary,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    paddingTop: Spacing.lg,
  },
  headerTitle: {
    fontSize: FontSize.xl,
    fontWeight: '700',
    color: Colors.white,
  },
  addBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.white,
    marginHorizontal: Spacing.md,
    marginTop: Spacing.md,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.gray200,
    height: 44,
    gap: Spacing.sm,
  },
  search: {
    flex: 1,
    fontSize: FontSize.md,
    color: Colors.textPrimary,
  },
  filtersContainer: {
    backgroundColor: Colors.white,
    marginTop: Spacing.sm,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray100,
  },
  filterRowLabel: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: Spacing.md,
    marginBottom: 4,
  },
  filterRow: {
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.sm,
    gap: Spacing.sm,
  },
  filterPill: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.gray100,
    borderWidth: 1,
    borderColor: Colors.gray200,
  },
  filterPillActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  filterText: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    fontWeight: '500',
  },
  filterTextActive: {
    color: Colors.white,
    fontWeight: '700',
  },
  countRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    marginTop: Spacing.sm,
    marginBottom: Spacing.xs,
    minHeight: 24,
  },
  count: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
  },
  clearBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  clearBtnText: {
    fontSize: FontSize.sm,
    color: Colors.primary,
    fontWeight: '600',
  },
  list: {
    padding: Spacing.md,
    paddingBottom: Spacing.xxl,
  },
  footerLoader: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: Spacing.lg,
    gap: Spacing.sm,
  },
  footerText: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
  },
});
