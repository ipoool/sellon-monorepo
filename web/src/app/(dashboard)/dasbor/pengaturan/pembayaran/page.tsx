import { serverApi } from "@/lib/server-api";
import type { GatewayInfo } from "@/lib/types";
import { PaymentForm } from "@/components/dashboard/payment-form";
import { BankAccountsManager } from "@/components/dashboard/bank-accounts-manager";

export const metadata = { title: "Pembayaran — SellOn" };

export default async function PengaturanPembayaranPage() {
  const data = await serverApi<GatewayInfo>("/api/v1/payments/midtrans");

  return (
    <div className="flex flex-col gap-5">
      <PaymentForm initial={data} />
      <BankAccountsManager />
    </div>
  );
}
