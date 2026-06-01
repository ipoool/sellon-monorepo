// Shared types for the kiosk fast-checkout. Mirror the public storefront API
// shapes (GetStore product list + payment DTO).

export type KioskVariant = {
  id: string;
  name: string;
  price_cents: number;
  stock: number;
};

export type KioskModifierOption = {
  id: string;
  name: string;
  price_delta_cents: number;
};

export type KioskModifierGroup = {
  id: string;
  name: string;
  selection: "single" | "multi";
  is_required: boolean;
  options: KioskModifierOption[];
};

export type KioskProduct = {
  id: string;
  name: string;
  slug: string;
  price_cents: number;
  stock: number;
  photo_urls: string[];
  product_type?: "physical" | "digital";
  has_variants?: boolean;
  variants?: KioskVariant[];
  modifiers?: KioskModifierGroup[];
};

// Subset of the public payment DTO the kiosk needs to decide how to collect
// payment on-screen.
export type PublicPayment = {
  has_midtrans: boolean;
  midtrans_methods?: string[];
  has_manual_bank: boolean;
  has_qris_static: boolean;
  bank_count: number;
};
