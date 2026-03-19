import React, { useState, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { getProducts } from '../../../src/api/products';
import { ProductCard } from '../../../src/components/ProductCard';
import { LoadingSpinner } from '../../../src/components/ui/LoadingSpinner';
import { EmptyState } from '../../../src/components/ui/EmptyState';
import { Colors, FontSize, Spacing, BorderRadius } from '../../../src/constants/colors';
import { useDebouncedValue } from '../../../src/hooks/useDebouncedValue';
import { normalizeSearchQuery, fuzzyMatch, productSearchableText } from '../../../src/utils/search';

const STATUS_FILTERS = [
  { label: 'All', value: '' },
  { label: 'Available', value: 'available' },
  { label: 'Unavailable', value: 'unavailable' },
];

export default function ProductsScreen() {
  const router = useRouter();
  const flatListRef = useRef<FlatList>(null);

  const [search, setSearch, debouncedSearch] = useDebouncedValue('', 300);
  const [statusFilter, setStatusFilter] = useState('');

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
    queryKey: ['products', statusFilter, searchParam],
    queryFn: async ({ pageParam = 1 }) => {
      const res = await getProducts({
        status: statusFilter || undefined,
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
        // Fallback: extract page param manually
        const match = lastPage.next.match(/[?&]page=(\d+)/);
        return match ? Number(match[1]) : undefined;
      }
    },
    staleTime: 0,
  });

  // All loaded products across all pages
  const allLoadedProducts = useMemo(
    () => data?.pages.flatMap((page) => page.results) ?? [],
    [data],
  );

  // Apply client-side status + search filtering
  const displayedProducts = useMemo(() => {
    let filtered = [...allLoadedProducts];

    if (statusFilter) {
      filtered = filtered.filter((p) => p.status === statusFilter);
    }

    if (searchParam) {
      filtered = filtered.filter((p) => fuzzyMatch(searchParam, productSearchableText(p)));
    }

    return filtered;
  }, [allLoadedProducts, statusFilter, searchParam]);

  // Scroll to top when filters/search change
  React.useEffect(() => {
    if (displayedProducts.length > 0 && !isLoading) {
      flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
    }
  }, [displayedProducts.length, isLoading, statusFilter, searchParam]);

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
        <Text style={styles.headerTitle}>Products</Text>
        <Ionicons name="cube-outline" size={24} color={Colors.white} />
      </View>

      {/* Search */}
      <View style={styles.searchWrap}>
        <Ionicons name="search-outline" size={18} color={Colors.gray400} />
        <TextInput
          style={styles.search}
          placeholder="Search by name or barcode..."
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

      {/* Status Filter Pills */}
      <View style={styles.filters}>
        {STATUS_FILTERS.map((f) => (
          <TouchableOpacity
            key={f.value}
            onPress={() => setStatusFilter(f.value)}
            style={[styles.filterPill, statusFilter === f.value && styles.filterPillActive]}
          >
            <Text style={[styles.filterText, statusFilter === f.value && styles.filterTextActive]}>
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Count */}
      {!isLoading && (
        <Text style={styles.count}>
          {displayedProducts.length} product{displayedProducts.length !== 1 ? 's' : ''}
          {totalCount > 0 ? ` of ${totalCount} total` : ''}
        </Text>
      )}

      {/* List */}
      {isLoading ? (
        <LoadingSpinner message="Loading products..." />
      ) : (
        <FlatList
          ref={flatListRef}
          data={displayedProducts}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item }) => (
            <ProductCard
              product={item}
              onPress={() => router.push(`/(tabs)/products/${item.id}` as any)}
            />
          )}
          contentContainerStyle={[styles.list, displayedProducts.length === 0 && { flex: 1 }]}
          ListEmptyComponent={
            <EmptyState
              icon="cube-outline"
              title="No Products Found"
              description={
                searchParam || statusFilter
                  ? 'No products match your current filters or search.'
                  : 'No products available.'
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
  filterPillActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  filterText: { fontSize: FontSize.sm, color: Colors.textSecondary, fontWeight: '500' },
  filterTextActive: { color: Colors.white, fontWeight: '700' },
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
