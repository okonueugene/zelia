// ==================== Auth ====================
export interface UserProfile {
  id: number;
  user: {
    id: number;
    username: string;
    email: string;
    first_name: string;
    last_name: string;
  };
  phone: string;
  department: string;
  national_id: string;
  gender: string;
  join_date: string;
  is_admin: boolean;
  is_salesperson: boolean;
}

export interface AuthState {
  token: string | null;
  user: UserProfile | null;
  isAuthenticated: boolean;
}

export interface LoginCredentials {
  username: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  user: UserProfile;
  message: string;
}

// ==================== Category ====================
export interface Category {
  id: number;
  name: string;
  description: string;
  created_at: string;
}

// ==================== Product ====================
export type CustomerCategory = 'factory' | 'distributor' | 'wholesale' | 'Towns' | 'Retail customer';
/** Store keys as used by the backend (kisii = Mombasa store) */
export type StoreLocation = 'mcdave' | 'kisii' | 'offshore';

export interface Product {
  id: number;
  name: string;
  description: string | null;
  barcode: string | null;
  category: number;
  category_name?: string;
  status: 'available' | 'not_available' | 'limited' | 'offer' | string;
  image: string | null;
  image_url?: string;
  factory_price: string;
  distributor_price: string;
  wholesale_price: string;
  offshore_price: string;
  retail_price: string;
  /** Per-category price map returned by the detail serializer */
  category_prices?: Record<string, number>;
  mcdave_stock: number;
  kisii_stock: number;
  offshore_stock: number;
  total_stock?: number;
  created_at: string;
  updated_at: string;
}

export interface ProductStats {
  total_orders: number;
  total_units_sold: number;
  total_revenue: number;
}

export interface ProductListItem {
  id: number;
  name: string;
  barcode: string;
  category_name: string;
  status: 'available' | 'not_available' | 'limited' | 'offer' | string;
  // pricing tiers (returned by ProductListSerializer)
  factory_price?: number | string;
  distributor_price?: number | string;
  wholesale_price?: number | string;
  offshore_price?: number | string;
  retail_price?: number | string;
  // stock levels per store
  mcdave_stock: number;
  kisii_stock: number;
  offshore_stock: number;
  total_stock?: number; // Sum of all stocks
  // images
  image: string | null;
  image_url?: string; // Full URL from API
}

// ==================== Customer ====================
export interface Customer {
  id: number;
  first_name: string;
  last_name: string | null;
  phone_number: string | null;
  formatted_phone?: string | null;
  email: string | null;
  address: string | null;
  default_category: CustomerCategory;
  customer_category_fk?: number | null;
  category_name?: string;
  sales_person: number | null;
  sales_person_name?: string | null;
  created_at: string;
  updated_at: string;
}

// ==================== Order ====================
export type OrderPaidStatus = 'pending' | 'completed' | 'partially_paid' | 'cancelled';
export type OrderDeliveryStatus = 'pending' | 'completed' | 'returned' | 'cancelled';
export type VatVariation = 'with_vat' | 'without_vat';

export interface OrderItem {
  id: number;
  order: number;
  product: number;
  product_name?: string;
  product_image?: string;
  quantity: number;
  unit_price: string;
  variance: string;
  line_total: string;
  original_quantity: number;
}

export interface Order {
  id: number;
  customer: number;
  customer_name?: string;
  customer_phone?: string;
  sales_person: number;
  sales_person_name?: string;
  store: StoreLocation;
  customer_category: CustomerCategory;
  address: string | null;
  phone: string | null;
  vat_variation: VatVariation;
  paid_status: OrderPaidStatus;
  delivery_status: OrderDeliveryStatus;
  order_date: string;
  total_amount: string;
  amount_paid: string;
  delivery_fee: string;
  balance?: number;
  latitude: string | null;
  longitude: string | null;
  location_address: string | null;
  notes?: string | null;
  quote?: number | null;
  created_at: string;
  updated_at: string;
  /** Nested items returned by the API (key is order_items, not items) */
  order_items?: OrderItem[];
}

export interface CreateOrderPayload {
  customer_id: number;
  store: StoreLocation;
  customer_category: CustomerCategory;
  address: string;
  phone: string;
  vat_variation: VatVariation;
  delivery_fee?: number;
  latitude?: number;
  longitude?: number;
  location_address?: string;
  items: {
    product_id: number;
    quantity: number;
    unit_price: number;
    variance?: number;
  }[];
  payment_method?: string;
  amount_paid?: number;
}

// ==================== Payment ====================
export type PaymentMethod = 'cash' | 'mpesa' | 'cheque' | 'bank_transfer' | 'buni';

export interface Payment {
  id: number;
  order: number;
  order_id?: number;
  order_number?: string;
  amount: string;
  payment_method: PaymentMethod;
  payment_date: string;
  reference_number: string | null;
  notes: string | null;
  recorded_by?: number | null;
  recorded_by_name?: string;
  created_at: string;
}

export interface AddPaymentPayload {
  order_id: number;
  amount: number;
  payment_method: PaymentMethod;
  payment_date: string;
  reference_number?: string;
  notes?: string;
}

// ==================== M-Pesa ====================
export interface MPesaTransaction {
  id: number;
  order: number;
  phone_number: string;
  amount: string;
  checkout_request_id: string;
  status: 'pending' | 'success' | 'failed' | 'cancelled' | 'timeout';
  result_code: string;
  result_description: string;
  mpesa_receipt_number: string;
  created_at: string;
}

// ==================== Buni (KCB) ====================
export interface BuniTransaction {
  id: number;
  order: number;
  phone_number: string;
  amount: string;
  transaction_id: string;
  payment_url: string;
  status: 'pending' | 'success' | 'failed' | 'cancelled' | 'timeout';
  result_code: string;
  result_description: string;
  created_at: string;
}

// ==================== Stock ====================
export interface StockMovement {
  id: number;
  product: number;
  product_name?: string;
  store: StoreLocation;
  /** Signed quantity change; positive = stock added */
  quantity: number;
  movement_type: 'in' | 'out' | 'adjustment' | 'transfer_in' | 'transfer_out' | 'return' | 'damage';
  reference_number: string | null;
  notes: string | null;
  previous_stock: number;
  new_stock: number;
  order?: number | null;
  recorded_by?: number | null;
  created_at: string;
}

export interface StockTransfer {
  id: number;
  from_store: StoreLocation;
  to_store: StoreLocation;
  transfer_date: string;
  status: 'pending' | 'completed' | 'cancelled';
  items?: StockTransferItem[];
  created_by?: number | null;
  created_by_name?: string;
}

export interface StockTransferItem {
  id: number;
  transfer: number;
  product: number;
  product_name?: string;
  quantity: number;
}

export interface StockAdjustment {
  id: number;
  product: number;
  product_name?: string;
  store: StoreLocation;
  /** Signed adjustment; positive = stock added */
  adjustment_quantity: number;
  reason: string | null;
  adjusted_by?: number | null;
  created_at: string;
}

export interface StockAlert {
  id: number;
  product: number;
  product_name?: string;
  store: StoreLocation;
  threshold: number;
  current_stock: number;
  alert_type: 'low_stock' | 'out_of_stock' | 'overstock';
  status: 'active' | 'acknowledged' | 'resolved';
  created_at: string;
}

// ==================== Feedback ====================
export type FeedbackType = 'quality' | 'pricing' | 'payments' | 'delivery_time';

export interface CustomerFeedback {
  id: number;
  /** Nullable — walk-in customers may not have a Customer record */
  customer: number | null;
  customer_name?: string | null;
  walkin_customer?: number | null;
  salesperson?: number | null;
  shop_name: string;
  contact_person: string;
  exact_location: string;
  phone_number: string;
  feedback_type: FeedbackType;
  rating: 1 | 2 | 3 | 4 | 5;
  comment: string;
  photo: string | null;
  photo_url?: string | null;
  latitude: string | null;
  longitude: string | null;
  created_by?: number | null;
  created_by_name?: string;
  created_at: string;
}

// ==================== Messages ====================
export interface InternalMessage {
  id: number;
  sender: number;
  sender_name?: string;
  /** Nullable = broadcast message to all users */
  recipient: number | null;
  recipient_name?: string | null;
  message: string;
  message_type?: 'text' | 'image' | 'file' | 'location' | 'contact' | string;
  is_read: boolean;
  /** URL to the media attachment if message_type != 'text' */
  attachment?: string | null;
  attachment_name?: string | null;
  /** Location fields (when message_type == 'location') */
  latitude?: string | null;
  longitude?: string | null;
  location_label?: string | null;
  /** Contact fields (when message_type == 'contact') */
  contact_name?: string | null;
  contact_phone?: string | null;
  created_at: string;
}

// ==================== Notifications ====================
export type NotificationEventType = 'feedback_new' | 'message_new' | 'order_created' | 'order_updated' | 'order_deleted' | 'beat_visit' | 'beat_plan_new' | 'stock_change' | 'payment_new' | 'login_new' | 'general';

export interface Notification {
  id: number;
  user: number;
  event_type: NotificationEventType;
  title: string;
  body: string;
  url: string;
  is_read: boolean;
  icon: string;
  created_at: string;
}

// ==================== Beat Plan ====================
export interface BeatPlan {
  id: number;
  salesperson: number;
  salesperson_name?: string;
  /** e.g. "Monday" */
  day_of_week: string;
  customer: number;
  customer_name?: string;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  visits?: BeatVisit[];
}

export interface BeatVisit {
  id: number;
  /** References BeatPlan */
  plan: number;
  salesperson: number;
  salesperson_name?: string;
  customer: number;
  customer_name?: string;
  visit_date: string;
  outcome: string | null;
  notes: string | null;
  latitude: string | null;
  longitude: string | null;
  created_at: string;
}

// ==================== Dashboard ====================
export interface DashboardStats {
  // Customer metrics
  total_customers: number;
  customers_this_month: number;
  customer_percentage_change: number;
  
  // Revenue metrics
  total_revenue: string;
  revenue_this_month: string;
  revenue_percentage_change: number;
  pending_revenue: string;
  
  // Order metrics
  orders_today: number;
  orders_percentage_change: number;
  total_orders: number;
  pending_orders: number;
  completed_orders: number;
  
  // Deals
  total_deals: number;
  deals_percentage_change: number;
  
  // Products
  total_products: number;
  low_stock_alerts: number;
  
  // Recent orders
  recent_orders?: Order[];
  
  // Top products
  top_products?: Array<{
    product__name: string;
    total_units: number;
    percent: number;
  }>;
}

// ==================== Quote ====================
export type QuoteStatus = 'pending' | 'sent' | 'accepted' | 'rejected' | 'converted';

export interface Quote {
  id: number;
  customer: number;
  customer_name?: string;
  sales_person?: number | null;
  sales_person_name?: string;
  quote_date: string;
  expiry_date: string | null;
  status: QuoteStatus;
  total_amount: string;
  customer_category: CustomerCategory;
  vat_variation: VatVariation;
  notes: string | null;
  created_at: string;
  items?: QuoteItem[];
}

export interface QuoteItem {
  id: number;
  quote: number;
  product: number;
  product_name?: string;
  product_image?: string;
  quantity: number;
  unit_price: string;
  variance: string;
  line_total: string;
}

// ==================== Pagination ====================
export interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

// ==================== API Error ====================
export interface APIError {
  status: string;
  code: number;
  message: string;
  details?: unknown;
}

// ==================== API Response ====================
export interface APIResponse<T> {
  status: string;
  code: number;
  data: T;
}