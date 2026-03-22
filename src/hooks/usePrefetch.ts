import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { getDashboardStats, getOrders, getOrder } from '../api/orders';
import { getProducts, getProductPriceByCategory } from '../api/products';
import { getCustomers } from '../api/customers';
import { getNotifications } from '../api/notifications';
import { getMessages } from '../api/messages';
import { getCacheConfig } from './useCacheConfig';
import { useAuthStore, selectIsAuthenticated } from '../store/authStore';

// ─── Common prefetch ──────────────────────────────────────────────────────────

/**
 * Prefetch the data most likely to be needed right after login.
 * Fires only once per authenticated session — re-runs if the user logs
 * out and back in again.
 */
export function usePrefetchCommonQueries() {
  const queryClient = useQueryClient();
  const isAuthenticated = useAuthStore(selectIsAuthenticated);

  useEffect(() => {
    // Do nothing if not authenticated — this is the key guard that was missing
    if (!isAuthenticated) return;

    // Dashboard stats
    queryClient.prefetchQuery({
      queryKey: ['dashboard-stats'],
      queryFn: getDashboardStats,
      staleTime: getCacheConfig('stats').staleTime,
    });

    // Products (first page)
    queryClient.prefetchInfiniteQuery({
      queryKey: ['products', '', ''],
      queryFn: ({ pageParam }: { pageParam: unknown }) =>
        getProducts({ search: undefined, status: undefined, page: pageParam as number }),
      initialPageParam: 1,
      staleTime: getCacheConfig('products').staleTime,
    } as any);

    // Customers (first page)
    queryClient.prefetchInfiniteQuery({
      queryKey: ['customers', '', ''],
      queryFn: ({ pageParam }: { pageParam: unknown }) =>
        getCustomers({ search: undefined, page: pageParam as number }),
      initialPageParam: 1,
      staleTime: getCacheConfig('customers').staleTime,
    } as any);

    // Orders (first page)
    queryClient.prefetchInfiniteQuery({
      queryKey: ['orders', '', '', ''],
      queryFn: ({ pageParam }: { pageParam: unknown }) =>
        getOrders({
          paid_status: undefined,
          delivery_status: undefined,
          store: undefined,
          search: undefined,
          page: pageParam as number,
        }),
      initialPageParam: 1,
      staleTime: getCacheConfig('orders').staleTime,
    } as any);

    // Notifications list
    queryClient.prefetchQuery({
      queryKey: ['notifications'],
      queryFn: () => getNotifications(),
      staleTime: getCacheConfig('notifications').staleTime,
    });

    // Messages
    queryClient.prefetchQuery({
      queryKey: ['messages'],
      queryFn: getMessages,
      staleTime: getCacheConfig('messages').staleTime,
    });
  }, [isAuthenticated, queryClient]); // re-runs when auth state changes
}

// ─── Item detail prefetch ─────────────────────────────────────────────────────

/**
 * Prefetch a specific item before navigating to its detail screen.
 * Skips silently when not authenticated or no ID provided.
 */
export function usePrefetchItemDetail(
  type: 'order' | 'customer' | 'product',
  id?: number | string,
) {
  const queryClient = useQueryClient();
  const isAuthenticated = useAuthStore(selectIsAuthenticated);

  useEffect(() => {
    if (!isAuthenticated || !id) return;

    if (type === 'order') {
      queryClient.prefetchQuery({
        queryKey: ['order', Number(id)],
        queryFn: () => getOrder(Number(id)),
        staleTime: getCacheConfig('orders').staleTime,
      });
    } else if (type === 'product' && typeof id === 'number') {
      queryClient.prefetchQuery({
        queryKey: ['product-price', id, 'wholesale', 'with_vat'],
        queryFn: () => getProductPriceByCategory(id, 'wholesale', 'with_vat'),
        staleTime: getCacheConfig('products').staleTime,
      });
    }
  }, [isAuthenticated, queryClient, type, id]);
}

// ─── Search prefetch ──────────────────────────────────────────────────────────

/**
 * Debounced prefetch for search queries — prevents excessive requests while typing.
 */
export function usePrefetchSearch(
  type: 'products' | 'customers',
  query: string,
  debounceMs = 300,
) {
  const queryClient = useQueryClient();
  const isAuthenticated = useAuthStore(selectIsAuthenticated);

  useEffect(() => {
    if (!isAuthenticated || query.length < 2) return;

    const timer = setTimeout(() => {
      if (type === 'products') {
        queryClient.prefetchQuery({
          queryKey: ['products', query, ''],
          queryFn: () => getProducts({ search: query }),
          staleTime: getCacheConfig('products').staleTime,
        });
      } else if (type === 'customers') {
        queryClient.prefetchQuery({
          queryKey: ['customers', query, ''],
          queryFn: () => getCustomers({ search: query }),
          staleTime: getCacheConfig('customers').staleTime,
        });
      }
    }, debounceMs);

    return () => clearTimeout(timer);
  }, [isAuthenticated, queryClient, type, query, debounceMs]);
}
