// Maps internal payment-method codes (midtrans / qris / cashier / …) to human
// Indonesian copy for seller-facing displays. Legacy orders that stored a
// human label (e.g. "Pembayaran Otomatis" from the checkout wizard) pass
// through unchanged. Mirrors paymentMethodLabel() in the Go storefront handler.
export function paymentMethodLabel(code: string): string {
  switch (code) {
    case "midtrans":
      return "Midtrans (otomatis)";
    case "qris":
      return "QRIS";
    case "manual_transfer":
    case "bank_transfer":
      return "Transfer manual";
    case "cashier":
    case "on_cashier":
      return "Bayar di kasir";
    case "cod":
      return "Bayar di tempat (COD)";
    case "":
      return "—";
    default:
      return code;
  }
}
