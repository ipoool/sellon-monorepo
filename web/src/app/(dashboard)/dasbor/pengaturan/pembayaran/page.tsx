import { serverApi } from "@/lib/server-api";
import type { GatewayInfo } from "@/lib/types";
import { PaymentForm } from "@/components/dashboard/payment-form";

export const metadata = { title: "Pembayaran — SellOn" };

export default async function PengaturanPembayaranPage() {
  const data = await serverApi<GatewayInfo>("/api/v1/payments/midtrans");
  return <PaymentForm initial={data} />;
}
