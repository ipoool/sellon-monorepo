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

export type Order = {
  id: string;
  order_number: string;
  status:
    | "pending"
    | "confirmed"
    | "processing"
    | "shipped"
    | "completed"
    | "cancelled";
  payment_status: "unpaid" | "pending" | "paid" | "failed" | "refunded";
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
  client_key: string;
  server_key_masked: string;
  enabled_methods: string[];
  last_verify_status?: string;
};
