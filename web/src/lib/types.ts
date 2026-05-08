export type Store = {
  id: string;
  slug: string;
  name: string;
  description: string;
  logo_url: string;
  category: string;
  city: string;
  whatsapp_number: string;
  instagram: string;
  tiktok: string;
  is_open: boolean;
};

export type Product = {
  id: string;
  name: string;
  slug: string;
  description: string;
  price_cents: number;
  stock: number;
  weight_g: number;
  length_cm: number;
  width_cm: number;
  height_cm: number;
  status: "active" | "inactive" | "sold_out";
  photo_urls: string[];
  has_variants: boolean;
  created_at: string;
};

export type OrderStatus =
  | "pending"
  | "confirmed"
  | "processing"
  | "shipped"
  | "completed"
  | "cancelled";

export type PaymentStatus =
  | "unpaid"
  | "pending"
  | "paid"
  | "failed"
  | "refunded";

export type Order = {
  id: string;
  order_number: string;
  status: OrderStatus;
  payment_status: PaymentStatus;
  payment_method: string;
  subtotal_cents: number;
  shipping_cents: number;
  total_cents: number;
  courier: string;
  customer_name: string;
  customer_whatsapp: string;
  customer_city: string;
  created_at: string;
};

export type OrderItem = {
  id: string;
  product_name: string;
  variant_name: string;
  unit_price_cents: number;
  quantity: number;
  subtotal_cents: number;
};

export type OrderDetail = {
  id: string;
  order_number: string;
  status: OrderStatus;
  payment_status: PaymentStatus;
  payment_method: string;
  subtotal_cents: number;
  shipping_cents: number;
  total_cents: number;
  courier: string;
  courier_service: string;
  tracking_number: string;
  customer_name: string;
  customer_whatsapp: string;
  customer_address: string;
  customer_city: string;
  notes: string;
  seller_notes: string;
  payment_url: string;
  paid_at: string | null;
  shipped_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  cancellation_reason: string;
  created_at: string;
  updated_at: string;
  items: OrderItem[];
};

export type Customer = {
  id: string;
  name: string;
  whatsapp_number: string;
  email: string;
  city: string;
  province: string;
  total_orders: number;
  total_spent_cents: number;
  last_order_at: string | null;
};

export type DashboardStats = {
  has_store: boolean;
  orders_today_count: number;
  revenue_month_cents: number;
  products_active: number;
  products_low_stock: number;
  customers_total: number;
};

export type GatewayInfo = {
  provider: string;
  is_configured: boolean;
  is_sandbox: boolean;
  has_sandbox_server_key: boolean;
  has_prod_server_key: boolean;
  sandbox_server_key_masked: string;
  prod_server_key_masked: string;
  client_key_sandbox: string;
  client_key_prod: string;
  enabled_methods: string[];
  last_verify_status?: string;
  webhook_url: string;
};
