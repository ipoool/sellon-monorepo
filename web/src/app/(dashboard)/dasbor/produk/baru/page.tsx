import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { ProdukForm } from "@/components/dashboard/produk-form";
import { getMe } from "@/lib/server-auth";

export const metadata = { title: "Tambah Produk — SellOn" };

export default async function ProdukBaruPage() {
  const me = await getMe();
  if (!me) redirect("/masuk");

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
