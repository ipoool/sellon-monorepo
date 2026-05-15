import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { BulkUploadForm } from "@/components/dashboard/bulk-upload-form";
import { getMe } from "@/lib/server-auth";
import { serverApi } from "@/lib/server-api";
import type { Subscription } from "@/lib/types";

export const metadata = { title: "Upload Massal Produk — SellOn" };

export default async function BulkUploadPage() {
  const me = await getMe();
  if (!me) redirect("/login");

  // Plan-gate ditampilkan inline supaya seller tetap bisa lihat
  // cara pakai + format kolom; tombol "Mulai Upload" yang di-kunci
  // untuk Free, bukan halamannya. Backend tetap reject 402 sebagai
  // defense-in-depth.
  const subRes = await serverApi<{ subscription: Subscription }>(
    "/api/v1/subscription",
  );
  const plan = subRes?.subscription?.plan ?? "free";
  const isPaid = plan === "pro" || plan === "bisnis";

  return (
    <DashboardShell
      me={me}
      pageTitle="Upload Massal Produk"
      pageSubtitle="Tambah hingga 100 produk sekaligus dari file Excel"
    >
      <BulkUploadForm isPaid={isPaid} />
    </DashboardShell>
  );
}
