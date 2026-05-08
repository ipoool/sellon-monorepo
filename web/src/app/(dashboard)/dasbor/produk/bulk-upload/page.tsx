import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { BulkUploadForm } from "@/components/dashboard/bulk-upload-form";
import { getMe } from "@/lib/server-auth";

export const metadata = { title: "Upload Massal Produk — SellOn" };

export default async function BulkUploadPage() {
  const me = await getMe();
  if (!me) redirect("/masuk");

  return (
    <DashboardShell
      me={me}
      pageTitle="Upload Massal Produk"
      pageSubtitle="Tambah hingga 100 produk sekaligus dari file Excel"
    >
      <BulkUploadForm />
    </DashboardShell>
  );
}
