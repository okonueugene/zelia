import React, { useState, useMemo, useRef } from 'react';
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
import { useInfiniteQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { getCustomers } from '../../../src/api/customers';
import { CustomerCard } from '../../../src/components/CustomerCard';
import { LoadingSpinner } from '../../../src/components/ui/LoadingSpinner';
import { EmptyState } from '../../../src/components/ui/EmptyState';
import { Colors, FontSize, Spacing, BorderRadius } from '../../../src/constants/colors';
import { useDebouncedValue } from '../../../src/hooks/useDebouncedValue';
import { normalizeSearchQuery, fuzzyMatch, customerSearchableText } from '../../../src/utils/search';

const CATEGORY_FILTERS = [
  { label: 'All', value: '' },
  { label: 'Factory', value: 'factory' },
  { label: 'Distributor', value: 'distributor' },
  { label: 'Wholesale', value: 'wholesale' },
  { label: 'Towns', value: 'Towns' },
  { label: 'Retail', value: 'Retail customer' },
];

export default function CustomersScreen() {
  const router = useRouter();
  const flatListRef = useRef<FlatList>(null);

  const [search, setSearch, debouncedSearch] = useDebouncedValue('', 300);
  const [categoryFilter, setCategoryFilter] = useState('');

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
    queryKey: ['customers', categoryFilter, searchParam],
    queryFn: async ({ pageParam = 1 }) => {
      const res = await getCustomers({
        category: categoryFilter || undefined,
        search: searchParam || undefined,
        page: pageParam,
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

  // All loaded customers across all pages
  const allLoadedCustomers = useMemo(
    () => data?.pages.flatMap((page) => page.results) ?? [],
    [data],
  );

  // Apply client-side category + search filtering
  const displayedCustomers = useMemo(() => {
    let filtered = [...allLoadedCustomers];

    if (categoryFilter) {
      filtered = filtered.filter((c) => c.default_category === categoryFilter);
    }

    if (searchParam) {
      filtered = filtered.filter((c) => fuzzyMatch(searchParam, customerSearchableText(c)));
    }

    return filtered;
  }, [allLoadedCustomers, categoryFilter, searchParam]);

  // Scroll to top when filters/search change
  React.useEffect(() => {
    if (displayedCustomers.length > 0 && !isLoading) {
      flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
    }
  }, [displayedCustomers.length, isLoading, categoryFilter, searchParam]);

  useFocusEffect(
    React.useCallback(() => {
      refetch();
    }, [refetch]),
  );

  const isFiltering = !!categoryFilter || !!searchParam;

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
        <Text style={styles.headerTitle}>Customers</Text>
        <TouchableOpacity
          onPress={() => router.push('/(tabs)/customers/add' as any)}
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
          placeholder="Search customers..."
          placeholderTextColor={Colors.gray400}
          value={search}
          onChangeText={setSearch}
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')}>
            <Ionicons name="close-circle" size={18} color={Colors.gray400} />
          </TouchableOpacity>
        )}
      </View>

      {/* Category Filter Pills */}
      <View style={styles.filterSection}>
        <Text style={styles.filterLabel}>Filter by Category</Text>
        <FlatList
          data={CATEGORY_FILTERS}
          keyExtractor={(item) => item.value}
          renderItem={({ item }) => (
            <TouchableOpacity
              onPress={() => setCategoryFilter(item.value)}
              style={[styles.filterPill, categoryFilter === item.value && styles.filterPillActive]}
              activeOpacity={0.7}
            >
              <Text style={[styles.filterText, categoryFilter === item.value && styles.filterTextActive]}>
                {item.label}
              </Text>
            </TouchableOpacity>
          )}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filters}
          scrollEventThrottle={16}
        />
      </View>

      {/* Count */}
      {!isLoading && (
        <Text style={styles.count}>
          {displayedCustomers.length} customer{displayedCustomers.length !== 1 ? 's' : ''}
          {totalCount > 0 ? ` of ${totalCount} total` : ''}
        </Text>
      )}

      {/* List */}
      {isLoading ? (
        <LoadingSpinner message="Loading customers..." />
      ) : (
        <FlatList
          ref={flatListRef}
          data={displayedCustomers}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item }) => (
            <CustomerCard
              customer={item}
              onPress={() => router.push(`/(tabs)/customers/${item.id}` as any)}
            />
          )}
          contentContainerStyle={[styles.list, displayedCustomers.length === 0 && { flex: 1 }]}
          ListEmptyComponent={
            <EmptyState
              icon="people-outline"
              title="No Customers Found"
              description={
                searchParam || categoryFilter
                  ? 'No customers match your current filters or search.'
                  : 'Add your first customer.'
              }
              actionLabel="Add Customer"
              onAction={() => router.push('/(tabs)/customers/add' as any)}
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
  safe: { flex: 1, backgroundColor: Colors.background },
  header: {
    backgroundColor: Colors.primary,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    paddingTop: Spacing.lg,
  },
  headerTitle: { fontSize: FontSize.xl, fontWeight: '700', color: Colors.white },
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
  search: { flex: 1, fontSize: FontSize.md, color: Colors.textPrimary },
  filterSection: {
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray100,
    paddingTop: Spacing.md,
  },
  filterLabel: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    color: Colors.textSecondary,
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  filters: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    gap: Spacing.md,
  },
  filterPill: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.white,
    borderWidth: 1.5,
    borderColor: Colors.gray200,
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 36,
  },
  filterPillActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  filterText: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    fontWeight: '600',
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
  list: { padding: Spacing.md, paddingBottom: Spacing.xxl },
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
