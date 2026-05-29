import { redirect, notFound } from "next/navigation";

import { getMe } from "@/lib/server-auth";
import { serverApi } from "@/lib/server-api";
import { ReceiptView } from "@/components/pos/receipt-view";
import type { OrderDetail, Store } from "@/lib/types";

type PrinterConfig = {
  paper_width: string;
  auto_print: boolean;
  header: string;
  footer: string;
};

export const metadata = {
  title: "Struk Kasir — SellOn",
  robots: { index: false, follow: false },
};

export default async function ReceiptPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ autoprint?: string }>;
}) {
  const me = await getMe();
  if (!me) redirect("/login");

  const { id } = await params;
  const { autoprint } = await searchParams;
  const [orderRes, storeRes, printerRes] = await Promise.all([
    serverApi<{ order: OrderDetail }>(`/api/v1/orders/${id}`),
    serverApi<{ store: Store | null }>("/api/v1/store"),
    serverApi<{ config: PrinterConfig }>("/api/v1/pos/printer/config"),
  ]);

  if (!orderRes?.order) notFound();
  const printer = printerRes?.config;

  return (
    <ReceiptView
      order={orderRes.order}
      store={storeRes?.store ?? null}
      cashierName={me.name || me.email}
      paperWidth={printer?.paper_width ?? "58"}
      headerText={printer?.header || undefined}
      footerText={printer?.footer || undefined}
      autoPrint={autoprint === "1"}
    />
  );
}
