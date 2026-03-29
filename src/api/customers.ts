import apiClient from './client';
import type { Customer, CustomerCategory, Order, PaginatedResponse } from '../types';

// GET /api/customers/?search=&category=
export async function getCustomers(params?: {
  search?: string;
  category?: string;
  page?: number;
}): Promise<PaginatedResponse<Customer>> {
  const { data } = await apiClient.get<PaginatedResponse<Customer>>('customers/', { params });
  return data;
}

// GET /api/customers/{id}/
export async function getCustomer(id: number): Promise<Customer> {
  const { data } = await apiClient.get<Customer>(`customers/${id}/`);
  return data;
}

// GET /api/customers/{id}/orders/
export async function getCustomerOrders(id: number): Promise<Order[]> {
  const { data } = await apiClient.get<Order[]>(`customers/${id}/orders/`);
  return data;
}

export interface CreateCustomerPayload {
  first_name: string;
  last_name?: string | null;
  phone_number?: string | null;
  email?: string | null;
  address?: string | null;
  default_category?: CustomerCategory;
  sales_person?: number | null;
}

// POST /api/customers/
export async function createCustomer(payload: CreateCustomerPayload): Promise<Customer> {
  const { data } = await apiClient.post<Customer>('customers/', payload);
  return data;
}

// PATCH /api/customers/{id}/
export async function updateCustomer(id: number, payload: Partial<CreateCustomerPayload>): Promise<Customer> {
  const { data } = await apiClient.patch<Customer>(`customers/${id}/`, payload);
  return data;
}

// DELETE /api/customers/{id}/
export async function deleteCustomer(id: number): Promise<void> {
  await apiClient.delete(`customers/${id}/`);
}
