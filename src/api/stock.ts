import apiClient from './client';
import type {
  StockMovement,
  StockTransfer,
  StockAdjustment,
  StoreLocation,
  PaginatedResponse,
} from '../types';

// ─── LOW STOCK ALERTS ────────────────────────────────────────────────────────
// Maps to: GET api/products/low_stock/ [name='product-low-stock']
// Returns products whose stock is below threshold — used as "stock alerts"
export interface LowStockProduct {
  id: number;
  name: string;
  barcode: string;
  category_name: string;
  status: string;
  mcdave_stock: number;
  kisii_stock: number;
  offshore_stock: number;
  total_stock: number;
  image_url?: string;
}

export async function getStockAlerts(): Promise<LowStockProduct[]> {
  const { data } = await apiClient.get<LowStockProduct[]>('products/low_stock/');
  return Array.isArray(data) ? data : (data as any).results ?? [];
}

// ─── STOCK TRANSFERS ─────────────────────────────────────────────────────────
// The Django REST router does NOT have api/stock/transfers/ endpoints.
// The only registered transfer routes are legacy template views (no api/ prefix).
// These stubs are kept so more.tsx compiles, but they will 404 until the
// backend exposes REST endpoints for stock transfers.

export async function getStockTransfers(): Promise<PaginatedResponse<StockTransfer>> {
  const { data } = await apiClient.get<PaginatedResponse<StockTransfer>>(
    'api/orders/', // placeholder — swap when backend adds REST stock transfer endpoint
    { params: { page: 1 } },
  );
  return data;
}

export async function getPendingTransfers(): Promise<StockTransfer[]> {
  // No REST endpoint exists yet — return empty array to prevent crash
  // TODO: replace with real endpoint when backend exposes api/stock/transfers/?status=pending
  return [];
}

export async function createStockTransfer(payload: {
  from_store: StoreLocation;
  to_store: StoreLocation;
  items: { product: number; quantity: number }[];
}): Promise<StockTransfer> {
  // TODO: replace URL when backend exposes REST endpoint
  const { data } = await apiClient.post<StockTransfer>('api/stock/transfers/', payload);
  return data;
}

export async function confirmStockTransfer(id: number): Promise<StockTransfer> {
  // TODO: replace URL when backend exposes REST endpoint
  const { data } = await apiClient.post<StockTransfer>(
    `api/stock/transfers/${id}/confirm_receipt/`,
  );
  return data;
}

// ─── STOCK ADJUSTMENTS ───────────────────────────────────────────────────────
// No REST endpoint exists yet either — stock/adjustment/ is a legacy template view.
// TODO: replace URL when backend exposes REST endpoint

export async function createStockAdjustment(payload: {
  product: number;
  store: StoreLocation;
  /** Signed quantity — positive adds stock, negative removes it */
  adjustment_quantity: number;
  reason: string;
}): Promise<StockAdjustment> {
  const { data } = await apiClient.post<StockAdjustment>('api/stock/adjustments/', payload);
  return data;
}

// ─── STOCK MOVEMENTS ─────────────────────────────────────────────────────────
// No REST endpoint exists — stock/movements/ is a legacy template view.
// TODO: replace URL when backend exposes REST endpoint

export async function getStockMovements(params?: {
  product?: number;
  store?: StoreLocation;
  page?: number;
}): Promise<PaginatedResponse<StockMovement>> {
  const { data } = await apiClient.get<PaginatedResponse<StockMovement>>(
    'api/stock/movements/',
    { params },
  );
  return data;
}
