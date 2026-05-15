import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { ProdukForm } from "@/components/dashboard/produk-form";
import { getMe } from "@/lib/server-auth";
import { serverApi } from "@/lib/server-api";
import type { Subscription } from "@/lib/types";

export const metadata = { title: "Tambah Produk — SellOn" };

export default async function ProdukBaruPage() {
  const me = await getMe();
  if (!me) redirect("/login");

  // Gate at the page boundary so users who type the URL directly can't
  // bypass the list-page disabled state (BUG-032). Backend already
  // rejects with 402, but two layers should agree — bouncing to the
  // list page surfaces the existing quota banner with Upgrade CTA.
  const subRes = await serverApi<{ subscription: Subscription }>(
    "/api/v1/subscription",
  );
  const productQuota = subRes?.subscription?.quotas?.products;
  const quotaFull =
    !!productQuota &&
    productQuota.limit > 0 &&
    productQuota.used >= productQuota.limit;
  if (quotaFull) redirect("/products");

  return (
    <DashboardShell
      me={me}
      pageTitle="Tambah Produk"
      pageSubtitle="Isi info produk dan harga, sisanya bisa di-edit kapan saja"
    >
      <ProdukForm />
    </DashboardShell>
  );
}
