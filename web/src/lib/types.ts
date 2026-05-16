export type DayOfWeek = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
type DayHours = { open: string; close: string; closed?: boolean };
export type OpenHours = Partial<Record<DayOfWeek, DayHours>>;

export type Store = {
  id: string;
  slug: string;
  name: string;
  description: string;
  logo_url: string;
  banner_url: string;
  tagline: string;
  category: string;
  city: string;
  whatsapp_number: string;
  notification_whatsapp_number?: string;
  instagram: string;
  tiktok: string;
  open_hours: OpenHours;
  is_open: boolean;
  shipping_origin_city?: string;
  shipping_origin_city_id?: string;
  shipping_origin_city_name?: string;
  enabled_couriers?: string[];
  free_shipping_threshold_cents?: number;
  theme_hue?: number;
  product_layout?:
    | "grid"
    | "list"
    | "showcase"
    | "compact"
    | "magazine"
    | "feed";
  show_hours_public?: boolean;
  show_social_public?: boolean;
  footer_text?: string;
  segment_vip_threshold?: number;
  segment_loyal_threshold?: number;
  segment_baru_name?: string;
  segment_reguler_name?: string;
  segment_loyal_name?: string;
  segment_vip_name?: string;
  custom_domain?: string | null;
  domain_status?: "none" | "pending" | "active" | "failed";
  domain_verified_at?: string | null;
};

export type BankAccount = {
  id: string;
  bank_name: string;
  holder_name: string;
  account_no: string;
  is_primary: boolean;
  qris_url: string;
};

export type Category = {
  id: string;
  name: string;
  sort_order: number;
  product_count: number;
};

export type Variant = {
  id: string;
  name: string;
  sku: string;
  price_cents: number;
  stock: number;
  sort_order: number;
};

export type Product = {
  id: string;
  category_id: string;
  name: string;
  slug: string;
  description: string;
  price_cents: number;
  stock: number;
  low_stock_threshold: number;
  weight_g: number;
  length_cm: number;
  width_cm: number;
  height_cm: number;
  status: "active" | "inactive" | "sold_out";
  photo_urls: string[];
  has_variants: boolean;
  is_featured: boolean;
  product_type: "physical" | "digital";
  digital_delivery_url: string;
  digital_file_url: string;
  digital_instructions: string;
  variants?: Variant[];
  // Aggregates surfaced by the list endpoint when has_variants=true so the
  // dashboard "Stok" column reflects per-variant edits. Zero otherwise.
  variants_count?: number;
  variants_stock?: number;
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

type OrderItem = {
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
  discount_cents: number;
  promo_code: string;
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
  refund_amount_cents: number;
  refund_reason: string;
  refunded_at: string | null;
  payment_proof_url?: string;
  payment_proof_note?: string;
  payment_proof_at?: string | null;
  created_at: string;
  updated_at: string;
  items: OrderItem[];
};

export type PaymentGatewayStatus = {
  is_configured: boolean;
  is_sandbox: boolean;
  has_sandbox_server_key: boolean;
  has_prod_server_key: boolean;
};

export type AdminSubscriptionInvoice = {
  id: string;
  store_id: string;
  store_name: string;
  store_slug: string;
  owner_name: string;
  owner_email: string;
  owner_picture: string;
  plan: string; // "pro" | "bisnis" | "free"
  months: number;
  amount_cents: number;
  status: "pending" | "paid" | "failed";
  provider: string; // "manual_transfer" | "midtrans" | ""
  provider_order_id: string;
  notes: string;
  paid_at: string | null;
  period_start: string | null;
  period_end: string | null;
  created_at: string;
};

export type Customer = {
  id: string;
  name: string;
  whatsapp_number: string;
  email: string;
  city: string;
  province: string;
  address?: string;
  postal_code?: string;
  notes?: string;
  is_blacklisted?: boolean;
  total_orders: number;
  total_spent_cents: number;
  last_order_at: string | null;
  created_at?: string;
};

export type CustomerOrderSummary = {
  id: string;
  order_number: string;
  status: OrderStatus;
  payment_status: PaymentStatus;
  total_cents: number;
  created_at: string;
};

type StaffRole = "owner" | "admin" | "staff";

export type StaffMember = {
  user_id: string;
  email: string;
  name: string;
  picture_url: string;
  role: StaffRole;
  joined_at: string;
  is_current: boolean;
};

export type StaffInvite = {
  id: string;
  email: string;
  role: "admin" | "staff";
  created_at: string;
};

export type StaffData = {
  members: StaffMember[];
  invites: StaffInvite[];
  staff_limit: number;
  members_used: number;
};

export type PromoType = "percent" | "fixed" | "free_shipping";

export type Promo = {
  id: string;
  code: string;
  type: PromoType;
  value: number;
  min_purchase_cents: number;
  max_usage: number;
  used_count: number;
  starts_at: string | null;
  expires_at: string | null;
  is_active: boolean;
  created_at: string;
};

export type QuotaUsage = { used: number; limit: number };

export type Subscription = {
  plan: "free" | "pro" | "bisnis";
  status: "active" | "cancelled" | "expired";
  current_period_start: string | null;
  current_period_end: string | null;
  cancelled_at: string | null;
  days_remaining: number;
  pro_price_cents: number;
  bisnis_price_cents: number;
  quotas?: Record<string, QuotaUsage>;
};

export type SubscriptionInvoice = {
  id: string;
  amount_cents: number;
  status: "pending" | "paid" | "failed";
  provider: string; // "manual_transfer" | "midtrans" | ""
  period_start: string | null;
  period_end: string | null;
  paid_at: string | null;
  notes: string;
  created_at: string;
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

export type AuditEntry = {
  id: string;
  actor_user_id: string;
  actor_email: string;
  actor_name: string;
  impersonator_user_id?: string;
  impersonator_email?: string;
  impersonator_name?: string;
  action: string;
  entity_type: string;
  entity_id: string;
  summary: string;
  metadata: Record<string, unknown>;
  created_at: string;
};

export type AdminUser = {
  id: string;
  email: string;
  name: string;
  picture_url: string;
  role: "user" | "admin";
  banned_at?: string;
  created_at: string;
};

export type AdminStoreSummary = {
  id: string;
  slug: string;
  name: string;
  owner_user_id: string;
  owner_email: string;
  owner_name: string;
  is_open: boolean;
  plan: string;
  sub_status: string;
  products_count: number;
  orders_count: number;
  revenue_cents: number;
  created_at: string;
};

export type PublicPlan = {
  tier: "free" | "pro" | "bisnis";
  name: string;
  monthly_price_cents: number;
  yearly_price_cents: number;
  currency: string;
  sort_order: number;
  // Enforcement caps. -1 means unlimited.
  product_limit: number;
  staff_limit: number;
  order_monthly_limit: number;
  promo_limit: number;
  // Marketing copy editable by admin without redeploy.
  description: string;
  features: string[];
  cta_label: string;
  period_monthly_label: string;
  period_yearly_label: string;
  highlighted: boolean;
  updated_at: string;
};

export type PlatformAuditEntry = {
  id: string;
  actor_user_id: string;
  actor_email: string;
  actor_name: string;
  impersonator_user_id?: string;
  action: string;
  target_user_id: string;
  target_store_id: string;
  summary: string;
  metadata: Record<string, unknown>;
  created_at: string;
};
