import apiClient from './client';
import type {
  Order,
  OrderItem,
  CreateOrderPayload,
  DashboardStats,
  PaginatedResponse,
  OrderPaidStatus,
  OrderDeliveryStatus,
} from '../types';

// GET /api/orders/dashboard_stats/
export async function getDashboardStats(): Promise<DashboardStats> {
  const { data } = await apiClient.get<DashboardStats>('orders/dashboard_stats/');
  return data;
}

// GET /api/orders/?paid_status=&delivery_status=&store=&search=
export async function getOrders(params?: {
  paid_status?: OrderPaidStatus;
  delivery_status?: OrderDeliveryStatus;
  store?: string;
  search?: string;
  page?: number;
}): Promise<PaginatedResponse<Order>> {
  const { data } = await apiClient.get<PaginatedResponse<Order>>('orders/', { params });
  return data;
}

// GET /api/orders/{id}/
export async function getOrder(id: number): Promise<Order> {
  const { data } = await apiClient.get<Order>(`orders/${id}/`);
  return data;
}

// GET /api/orders/{id}/items/
export async function getOrderItems(id: number): Promise<OrderItem[]> {
  const { data } = await apiClient.get<OrderItem[]>(`orders/${id}/items/`);
  return data;
}

// POST /api/orders/create_order/
export async function createOrder(payload: CreateOrderPayload): Promise<Order> {
  const { data } = await apiClient.post<Order>('orders/create_order/', payload);
  return data;
}

// POST /api/orders/{id}/update_status/
export async function updateOrderStatus(
  id: number,
  payload: { paid_status?: OrderPaidStatus; delivery_status?: OrderDeliveryStatus },
): Promise<Order> {
  const { data } = await apiClient.post<Order>(`orders/${id}/update_status/`, payload);
  return data;
}

// DELETE /api/orders/{id}/
export async function deleteOrder(id: number): Promise<void> {
  await apiClient.delete(`orders/${id}/`);
}
// GET /api/orders/{id}/download_receipt/ - Download receipt PDF to device and share
export async function downloadReceiptToDevice(id: number): Promise<void> {
  const FileSystem = require('expo-file-system/legacy');
  const SecureStore = require('expo-secure-store');
  const Sharing = require('expo-sharing');

  console.log(`[Receipt] Step 1: Starting download for order #${id}`);

  const token: string | null = await SecureStore.getItemAsync('auth_token');
  if (!token) throw new Error('Not authenticated');
  console.log('[Receipt] Step 2: Token retrieved ✓');

  const url = `${apiClient.defaults.baseURL}orders/${id}/download_receipt/`;
  const filePath = `${FileSystem.cacheDirectory}order-${id}-receipt.pdf`;
  console.log(`[Receipt] Step 3: URL = ${url}`);

  const result = await FileSystem.downloadAsync(url, filePath, {
    headers: {
      Authorization: `Token ${token}`,
      Accept: '*/*',
    },
  });
  console.log(`[Receipt] Step 4: status=${result.status}, headers=${JSON.stringify(result.headers)}`);

  if (result.status !== 200) {
    try {
      const body = await FileSystem.readAsStringAsync(result.uri, { length: 500 });
      console.error(`[Receipt] Step 4 FAIL: body preview = ${body}`);
    } catch {}
    throw new Error(`Receipt download failed (HTTP ${result.status})`);
  }

  const fileInfo = await FileSystem.getInfoAsync(result.uri);
  console.log(`[Receipt] Step 5: file size = ${(fileInfo as any).size} bytes`);
  if (!(fileInfo as any).exists || (fileInfo as any).size === 0) {
    throw new Error('Downloaded file is empty — server may have returned an error');
  }

  const canShare = await Sharing.isAvailableAsync();
  if (!canShare) throw new Error('Sharing is not available on this device');

  await Sharing.shareAsync(result.uri, {
    mimeType: 'application/pdf',
    dialogTitle: `Receipt – Order #${id}`,
    UTI: 'com.adobe.pdf',
  });
  console.log('[Receipt] Step 6: Share sheet opened ✓');
}