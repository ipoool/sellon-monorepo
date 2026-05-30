export type DayOfWeek = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
type DayHours = { open: string; close: string; closed?: boolean };
export type OpenHours = Partial<Record<DayOfWeek, DayHours>>;

export type KioskLayoutConfig = {
  banner_enabled: boolean;
  banner_slides: { image_url: string }[];
  slide_duration_ms?: number; // autoplay interval; default 3000
  cta_label?: string; // "Order Now" button label; default "Order Now"
};

export type LayoutConfig = {
  kiosk?: KioskLayoutConfig;
};

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
    | "feed"
    | "kiosk"
    | "katalog"
    | "poster";
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
  layout_config?: LayoutConfig;
  checkout_config?: CheckoutConfig;
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
  gtin: string;
  takeaway_enabled: boolean;
  takeaway_charge_cents: number;
  takeaway_material_id: string;
  takeaway_material_name: string;
  variants?: Variant[];
  // Aggregates surfaced by the list endpoint when has_variants=true so the
  // dashboard "Stok" column reflects per-variant edits. Zero otherwise.
  variants_count?: number;
  variants_stock?: number;
  discounts?: ProductDiscount[];
  base_recipe?: ProductRecipeItem[];
  modifiers?: ModifierGroup[];
  created_at: string;
};

export type ProductRecipeItem = {
  material_id: string;
  material_name: string;
  base_unit: string;
  quantity: number;
};

export type ModifierOption = {
  id?: string;
  name: string;
  price_delta_cents: number;
  recipe?: ProductRecipeItem[];
};

export type ModifierGroup = {
  id?: string;
  name: string;
  selection: "single" | "multi";
  is_required: boolean;
  options: ModifierOption[];
};

// SelectedOption is a chosen modifier carried on a cart line / order.
export type SelectedOption = {
  option_id: string;
  group_name: string;
  option_name: string;
  price_delta_cents: number;
};

export type LoyaltyTransaction = {
  id: string;
  order_id: string | null;
  type: "earn" | "redeem" | "adjust" | "expire";
  points: number; // signed: + earn, − redeem
  balance_after: number;
  reason: string;
  created_at: string;
};

export type Supplier = {
  id: string;
  name: string;
  phone: string;
  note: string;
};

export type PurchaseOrder = {
  id: string;
  supplier_id: string;
  supplier_name: string;
  status: "draft" | "ordered" | "received" | "cancelled";
  note: string;
  total_cents: number;
  item_count: number;
  ordered_at: string | null;
  received_at: string | null;
  created_at: string;
};

export type POItem = {
  id?: string;
  material_id: string;
  material_name?: string;
  base_unit?: string;
  quantity: number;
  unit_cost_cents: number;
};

export type KitchenOrder = {
  order_id: string;
  order_number: string;
  queue_number: number | null;
  kitchen_status: "queued" | "preparing" | "ready" | "served";
  serving_type: string;
  table_label: string;
  customer_name: string;
  created_at: string;
  items: { name: string; quantity: number }[];
};

// Seller-configurable checkout fields.
export type CheckoutFieldType =
  | "text"
  | "textarea"
  | "select"
  | "number"
  | "date"
  | "checkbox";

export type CheckoutField = {
  key: string;
  label: string;
  type: CheckoutFieldType;
  step: "identity" | "shipping";
  required: boolean;
  placeholder: string;
  options: string[];
};

export type CheckoutConfig = {
  email_mode: "optional" | "required" | "hidden";
  fields: CheckoutField[];
};

// Platform-managed promo/info banner shown as a slider on the seller dashboard.
export type PlatformBanner = {
  id: string;
  image_url: string;
  title: string;
  link_url: string;
  is_active: boolean;
  sort_order: number;
  created_at: string;
};

export type RestaurantTable = {
  id: string;
  label: string;
  area: string;
  qr_token: string;
};

export type DineInSettings = {
  enabled: boolean;
  payment_mode: "cashier" | "online";
  kds_enabled: boolean;
  // Custom QR card layout/appearance (table QR print/display).
  qr_layout: "classic" | "tent" | "poster";
  qr_fg_color: string; // card text color
  qr_bg_color: string; // card background color
  qr_headline: string;
  qr_caption: string;
};

export type AnalyticsDayPoint = {
  date: string;
  in_cents: number;
  out_cents: number;
  revenue_cents: number;
};

export type AnalyticsPaySlice = { method: string; amount_cents: number };

export type AnalyticsOverview = {
  revenue_cents: number;
  orders: number;
  aov_cents: number;
  cogs_cents: number;
  gross_profit_cents: number;
  margin_pct: number;
  cash_in_cents: number;
  cash_out_cents: number;
  net_cash_cents: number;
  series: AnalyticsDayPoint[];
  payments: AnalyticsPaySlice[];
};

export type CashEntry = {
  id: string;
  direction: "in" | "out";
  category: string;
  amount_cents: number;
  occurred_on: string;
  note: string;
};

export type StockTake = {
  id: string;
  status: "draft" | "posted";
  note: string;
  item_count?: number;
  posted_at: string | null;
  created_at: string;
};

export type StockTakeItem = {
  id: string;
  material_id: string;
  material_name: string;
  base_unit: string;
  system_qty: number;
  counted_qty: number;
};

export type MembershipTier = {
  id?: string;
  name: string;
  min_spent_cents: number;
  point_multiplier: number;
  discount_percent: number;
  is_active: boolean;
};

export type ProductDiscount = {
  id?: string;
  min_quantity: number;
  discount_type: "percent" | "fixed";
  discount_value: number; // percent (0-100) or cents
  starts_at: string | null;
  ends_at: string | null;
  is_active: boolean;
};

export type Material = {
  id: string;
  name: string;
  kind: "ingredient" | "packaging";
  base_unit: string; // "gram" | "ml" | "pcs" | custom
  cost_cents: number; // modal per 1 base_unit
  stock: number; // may be negative (soft tracking)
  low_stock_threshold: number;
  low_stock: boolean;
  is_active: boolean;
  created_at: string;
};

export type MaterialMovement = {
  id: string;
  movement_type: "restock" | "consume" | "adjust";
  quantity: number; // signed: + restock, - consume
  unit_cost_cents: number;
  order_id: string | null;
  note: string;
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
  serving_type?: "dine_in" | "takeaway" | "";
  modifiers?: {
    group_name: string;
    option_name: string;
    price_delta_cents: number;
  }[];
};

export type OrderDetail = {
  id: string;
  order_number: string;
  status: OrderStatus;
  payment_status: PaymentStatus;
  payment_method: string;
  source?: "storefront" | "pos" | "whatsapp" | string;
  subtotal_cents: number;
  shipping_cents: number;
  discount_cents: number;
  promo_code: string;
  total_cents: number;
  loyalty_points_redeemed?: number;
  loyalty_discount_cents?: number;
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
  custom_fields?: { key: string; label: string; value: string }[];
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
  loyalty_points?: number;
  member_code?: string;
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
  store_id?: string | null;
  plan: string;
  sub_status: string;
  period_end?: string | null;
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
  period_end: string | null;
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

// ─── Reseller / Dropship types ────────────────────────────────────────────────

export type ResellerProgram = {
  id: string;
  supplier_store_id: string;
  supplier_store_name: string;
  name: string;
  description: string;
  invite_code: string;
  is_active: boolean;
  member_count: number;
  product_count: number;
  created_at: string;
  updated_at: string;
};

export type ResellerMembership = {
  id: string;
  program_id: string;
  reseller_store_id: string;
  is_active: boolean;
  joined_at: string;
  program_name: string;
  supplier_store_id: string;
  supplier_store_name: string;
  product_count: number;
};

export type ProgramProduct = {
  id: string;
  program_id: string;
  product_id: string;
  reseller_price_cents: number;
  is_active: boolean;
  product_name: string;
  product_slug: string;
  photo_urls: string[];
  stock: number;
  product_status: string;
  created_at: string;
  updated_at: string;
};

export type ResellerCatalogEntry = {
  id: string;
  membership_id: string;
  program_product_id: string;
  reseller_price_cents: number;
  modal_cents: number;
  is_active: boolean;
  product_id: string;
  product_name: string;
  product_slug: string;
  photo_urls: string[];
  stock: number;
  supplier_store_id: string;
  supplier_store_name: string;
  created_at: string;
  updated_at: string;
};

export type DropshipOrderItem = {
  order_item_id: string;
  order_id: string;
  order_number: string;
  order_created_at: string;
  product_name: string;
  variant_name: string;
  quantity: number;
  unit_price_cents: number;
  reseller_cost_cents: number;
  subtotal_cents: number;
  customer_name: string;
  customer_wa: string;
  customer_address: string;
  customer_city: string;
  tracking_number: string;
  shipped_at: string | null;
  reseller_store_name: string;
};

// ─── POS Kasir types ─────────────────────────────────────────────────────────

export type POSPaymentMethod =
  | "cash"
  | "qris"
  | "manual_transfer"
  | "midtrans"
  | "edc_debit"
  | "edc_kredit";

export type POSSession = {
  id: string;
  store_id: string;
  opened_by: string;
  opened_by_name: string;
  closed_by: string | null;
  closed_by_name: string;
  opening_cash_cents: number;
  closing_cash_cents: number | null;
  expected_cash_cents: number | null;
  notes: string;
  status: "open" | "closed";
  opened_at: string;
  closed_at: string | null;
};

export type POSSessionSummary = {
  session: POSSession;
  total_sales: number;
  total_cash: number;
  total_qris: number;
  total_transfer: number;
  total_midtrans: number;
  total_cash_in: number;
  total_cash_out: number;
  order_count: number;
  expected_cash: number;
};

export type POSCashMovement = {
  id: string;
  type: "in" | "out";
  amount_cents: number;
  reason: string;
  created_at: string;
};

export type POSHeldOrder = {
  id: string;
  label: string;
  cart_snapshot: unknown; // POSCartItem[] serialized
  created_at: string;
};

export type POSCartItem = {
  product_id: string;
  variant_id?: string | null;
  product_name: string;
  variant_name?: string;
  product_type: "physical" | "digital";
  unit_cents: number;
  quantity: number;
  photo_url?: string;
  stock?: number;
  // Active tier discounts at the time the product was added (frontend only).
  // POS recalculates line discount on every qty change based on min_quantity.
  discounts?: ProductDiscount[];
  // Chosen modifier options (frontend). unit_cents already includes their
  // price deltas. Sent as selected_option_ids when the order is created.
  selected_options?: SelectedOption[];
  // Serving choice for products with take-away enabled. When "takeaway", the
  // cart shows a separate packaging line (charge below) and the backend
  // recomputes + persists it. unit_cents stays the plain product price.
  serving_type?: "dine_in" | "takeaway";
  takeaway_charge_cents?: number;
  takeaway_label?: string;
};

export type POSPayment = {
  method: POSPaymentMethod;
  amount_cents: number;
  // EDC fields — only used when method is edc_debit/edc_kredit
  card_brand?: string;
  card_last4?: string;
  reference_number?: string;
  approval_code?: string;
};

export type POSOrderResult = {
  order_id: string;
  order_number: string;
  subtotal_cents: number;
  discount_cents: number;
  total_cents: number;
  payment_method: string;
  change_amount_cents: number;
  created_at: string;
};

export type POSSessionOrder = {
  order_id: string;
  order_number: string;
  status: "completed" | "cancelled" | string;
  payment_method: string;
  subtotal_cents: number;
  discount_cents: number;
  total_cents: number;
  change_amount_cents: number;
  customer_name: string;
  customer_wa: string;
  notes: string;
  created_at: string;
  item_count: number;
  payments: POSPayment[];
  refunded_at: string | null;
  refund_reason: string;
};

export type POSCashier = {
  user_id: string;
  name: string;
  email: string;
};

export type POSReportDailyPoint = {
  date: string;
  order_count: number;
  total_cents: number;
};

export type POSReportProduct = {
  product_id: string;
  product_name: string;
  quantity: number;
  total_cents: number;
};

export type POSReportCashier = {
  cashier_id: string;
  cashier_name: string;
  order_count: number;
  total_cents: number;
};

export type POSReport = {
  order_count: number;
  total_gross: number;
  total_refunded: number;
  avg_transaction: number;
  total_cash: number;
  total_qris: number;
  total_transfer: number;
  total_midtrans: number;
  total_edc_debit: number;
  total_edc_kredit: number;
  daily_series: POSReportDailyPoint[];
  top_products: POSReportProduct[];
  by_cashier: POSReportCashier[];
};

