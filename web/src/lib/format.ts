const rupiahFormatter = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

export function formatRupiah(cents: number): string {
  // cents = subunit. We use cents as the base unit (Rp 1 = 100 cents).
  return rupiahFormatter.format(Math.round(cents / 100));
}

export function formatDateID(iso: string): string {
  return new Date(iso).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function formatDateTimeID(iso: string): string {
  return new Date(iso).toLocaleString("id-ID", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// formatRupiahShort renders a cents value with the colloquial "rb / jt"
// suffix used on marketing pages — e.g. 79_000_00 → "Rp 79rb",
// 1_500_000_00 → "Rp 1,5jt". Use formatRupiah() instead for receipts /
// invoices where users expect full precision.
export function formatRupiahShort(cents: number): string {
  const r = Math.round(cents / 100);
  if (r === 0) return "Rp 0";
  if (r < 1000) return `Rp ${r}`;
  if (r < 1_000_000) {
    // 1.000–999.999 → "Xrb" (drop trailing .0)
    const k = r / 1000;
    return `Rp ${trimDecimal(k)}rb`;
  }
  // ≥ 1.000.000 → "X,Yjt"
  const m = r / 1_000_000;
  return `Rp ${trimDecimal(m)}jt`;
}

function trimDecimal(n: number): string {
  // 79.0 → "79", 79.5 → "79,5", 1.25 → "1,25"
  const fixed = Math.round(n * 100) / 100;
  if (Number.isInteger(fixed)) return String(fixed);
  return fixed.toString().replace(".", ",");
}
