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

// Preferred dedicated actions (use these instead of generic item CRUD when possible)
export async function addItemToOrder(
  orderId: number,
  payload: { product_id: number; quantity: number; unit_price?: string; variance?: number },
): Promise<Order> {
  const { data } = await apiClient.post<Order>(`orders/${orderId}/add_item/`, payload);
  return data;
}

export async function removeItemFromOrder(orderId: number, itemId: number): Promise<Order> {
  const { data } = await apiClient.post<Order>(`orders/${orderId}/remove_item/`, { item_id: itemId });
  return data;
}

export async function recalculateOrder(orderId: number): Promise<unknown> {
  const { data } = await apiClient.post(`orders/${orderId}/recalculate/`);
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
// GET /api/orders/{id}/download_receipt/ - Download receipt PDF and share
export async function downloadReceiptToDevice(id: number): Promise<void> {
  const FileSystem = require('expo-file-system/legacy');
  const SecureStore = require('expo-secure-store');
  const Sharing = require('expo-sharing');

  const token: string | null = await SecureStore.getItemAsync('auth_token');
  if (!token) throw new Error('Not authenticated');

  const url = `${apiClient.defaults.baseURL}orders/${id}/download_receipt/`;
  const filePath = `${FileSystem.cacheDirectory}order-${id}-receipt.pdf`;

  const result = await FileSystem.downloadAsync(url, filePath, {
    headers: { Authorization: `Token ${token}`, Accept: '*/*' },
  });

  if (result.status !== 200) {
    try {
      const body = await FileSystem.readAsStringAsync(result.uri, { length: 500 });
      console.error(`[Receipt] HTTP ${result.status}: ${body}`);
    } catch {}
    throw new Error(`Receipt download failed (HTTP ${result.status})`);
  }

  const fileInfo = await FileSystem.getInfoAsync(result.uri);
  if (!(fileInfo as any).exists || (fileInfo as any).size === 0) {
    throw new Error('Downloaded file is empty');
  }

  const canShare = await Sharing.isAvailableAsync();
  if (!canShare) throw new Error('Sharing is not available on this device');
  await Sharing.shareAsync(result.uri, {
    mimeType: 'application/pdf',
    dialogTitle: `Receipt – Order #${id}`,
    UTI: 'com.adobe.pdf',
  });
}

// PATCH /api/orders/{id}/ - Edit order header fields
export interface UpdateOrderPayload {
  phone?: string;
  address?: string;
  delivery_fee?: string;
  vat_variation?: 'with_vat' | 'without_vat';
  notes?: string;
  store?: string;
}
export async function updateOrder(id: number, payload: UpdateOrderPayload): Promise<Order> {
  const { data } = await apiClient.patch<Order>(`orders/${id}/`, payload);
  return data;
}

// PATCH /api/order-items/{id}/
export interface UpdateOrderItemPayload {
  quantity?: number;
  unit_price?: string;
}
export async function updateOrderItem(
itemId: number, payload: UpdateOrderItemPayload,
): Promise<OrderItem> {
  const { data } = await apiClient.patch<OrderItem>(
    `order-items/${itemId}/`,   
    payload
  );
  return data;
}
// DELETE /api/order-items/{id}/
export async function deleteOrderItem(itemId: number): Promise<void> {
  await apiClient.delete(`order-items/${itemId}/`);
}

// POST /api/order-items/ - Add a new order item
export interface AddOrderItemPayload {
  product: number;
  quantity: number;
  unit_price: string;
}
export async function addOrderItem(
  orderId: number,
  payload: AddOrderItemPayload,
): Promise<OrderItem> {
  const { data } = await apiClient.post<OrderItem>('order-items/', {
    ...payload,
    order: orderId,          
  });
  return data;
}