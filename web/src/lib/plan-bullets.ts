import type { PublicPlan } from "@/lib/types";

// quotaBullets renders a plan's configured limits as user-facing bullet
// strings. -1 collapses to "tanpa batas", positive numbers prefix with
// "Sampai N …". Shared between the landing-page pricing card and the
// dashboard berlangganan plan-comparison so the two surfaces stay
// consistent when admin tweaks limits in /platform/plans.
export function quotaBullets(plan: PublicPlan): string[] {
  const out: string[] = [];
  out.push(formatLimit(plan.product_limit, "produk", "Produk tanpa batas"));
  out.push(
    formatLimit(
      plan.order_monthly_limit,
      "pesanan / bulan",
      "Pesanan tanpa batas",
    ),
  );
  if (plan.staff_limit === 1) {
    out.push("1 staf admin (owner saja)");
  } else {
    out.push(
      formatLimit(plan.staff_limit, "staf admin", "Staf admin tanpa batas"),
    );
  }
  if (plan.promo_limit >= 0) {
    out.push(formatLimit(plan.promo_limit, "kode promo", ""));
  }
  return out.filter(Boolean);
}

function formatLimit(
  n: number,
  unitLabel: string,
  unlimitedLabel: string,
): string {
  if (n < 0) return unlimitedLabel;
  return `Sampai ${n.toLocaleString("id-ID")} ${unitLabel}`;
}
