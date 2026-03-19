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
} from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  useInfiniteQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { getOrders } from '../../../src/api/orders';
import { OrderCard } from '../../../src/components/OrderCard';
import { LoadingSpinner } from '../../../src/components/ui/LoadingSpinner';
import { EmptyState } from '../../../src/components/ui/EmptyState';
import { Colors, FontSize, Spacing, BorderRadius } from '../../../src/constants/colors';
import { useDebouncedValue } from '../../../src/hooks/useDebouncedValue';
import { normalizeSearchQuery } from '../../../src/utils/search';
import type { OrderPaidStatus, PaginatedResponse } from '../../../src/types';

const STATUS_FILTERS: { label: string; value: OrderPaidStatus | '' }[] = [
  { label: 'All', value: '' },
  { label: 'Pending', value: 'pending' },
  { label: 'Partial', value: 'partially_paid' },
  { label: 'Paid', value: 'completed' },
];

export default function OrdersScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const flatListRef = useRef<FlatList>(null);

  const [search, setSearch, debouncedSearch] = useDebouncedValue('', 400);
  const [statusFilter, setStatusFilter] = useState<OrderPaidStatus | ''>('');

  const searchParam = useMemo(
    () => (debouncedSearch ? normalizeSearchQuery(debouncedSearch) : ''),
    [debouncedSearch],
  );

  const {
    data,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    refetch,
    isRefetching,
  } = useInfiniteQuery({
    queryKey: ['orders', statusFilter, searchParam],
    queryFn: async ({ pageParam = 1 }) => {
      const paramsSent = {
        paid_status: statusFilter || undefined,
        search: searchParam || undefined,
        page: pageParam,
      };
      console.log('→ API params:', paramsSent);

      const res = await getOrders(paramsSent);

      console.log('← API response summary:', {
        count: res.count,
        next: !!res.next,
        resultsLength: res.results?.length ?? 0,
      });

      return res;
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage) => {
      if (!lastPage.next) return undefined;
      const url = new URL(lastPage.next);
      const pageStr = url.searchParams.get('page');
      return pageStr ? Number(pageStr) : undefined;
    },
    staleTime: 2 * 60 * 1000,
  });

  // All loaded orders (across all pages)
  const allLoadedOrders = useMemo(
    () => data?.pages.flatMap((page) => page.results) ?? [],
    [data],
  );

  // Apply client-side filtering + search on top of loaded data
  const displayedOrders = useMemo(() => {
    let filtered = [...allLoadedOrders];

    if (statusFilter) {
      filtered = filtered.filter((order) => order.paid_status === statusFilter);
    }

    if (searchParam) {
      const term = searchParam.toLowerCase();
      filtered = filtered.filter(
        (order) =>
          String(order.id).includes(term) ||
          (order.customer_name ?? '').toLowerCase().includes(term) ||
          (order.phone ?? '').toLowerCase().includes(term) ||
          (order.customer_phone ?? '').toLowerCase().includes(term),
      );
    }

    return filtered;
  }, [allLoadedOrders, statusFilter, searchParam]);

  // Scroll to top when filters/search change or list refreshes
  React.useEffect(() => {
    if (displayedOrders.length > 0 && !isLoading) {
      flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
    }
  }, [displayedOrders.length, isLoading, statusFilter, searchParam]);

  useFocusEffect(
    React.useCallback(() => {
      refetch();
    }, [refetch]),
  );

  const isFiltering = !!statusFilter || !!searchParam;

  const loadMore = () => {
    if (hasNextPage && !isFetchingNextPage && !isFiltering) {
      fetchNextPage();
    }
  };

  const totalCount = data?.pages[0]?.count ?? 0;

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
        <Ionicons name="search-outline" size={18} color={Colors.gray400} style={styles.searchIcon} />
        <TextInput
          style={styles.search}
          placeholder="Search by customer, ID, phone..."
          placeholderTextColor={Colors.gray400}
          value={search}
          onChangeText={setSearch}
          autoCapitalize="none"
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')}>
            <Ionicons name="close-circle" size={18} color={Colors.gray400} />
          </TouchableOpacity>
        )}
      </View>

      {/* Status Filter Pills */}
      <View style={styles.filters}>
        {STATUS_FILTERS.map((f) => (
          <TouchableOpacity
            key={f.value}
            onPress={() => setStatusFilter(f.value)}
            style={[styles.filterPill, statusFilter === f.value && styles.filterPillActive]}
          >
            <Text
              style={[styles.filterText, statusFilter === f.value && styles.filterTextActive]}
            >
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Count – shows filtered count vs total */}
      {!isLoading && (
        <Text style={styles.count}>
          {displayedOrders.length} order{displayedOrders.length !== 1 ? 's' : ''}
          {totalCount > 0 ? ` of ${totalCount} total` : ''}
        </Text>
      )}

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
                searchParam || statusFilter
                  ? 'No orders match your current filters or search.'
                  : 'No orders yet. Create your first one!'
              }
              actionLabel="Create Order"
              onAction={() => router.push('/(tabs)/orders/create' as any)}
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
  searchIcon: {},
  search: {
    flex: 1,
    fontSize: FontSize.md,
    color: Colors.textPrimary,
  },
  filters: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.md,
    marginTop: Spacing.md,
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
  count: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    paddingHorizontal: Spacing.lg,
    marginTop: Spacing.sm,
    marginBottom: Spacing.xs,
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
