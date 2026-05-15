import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { formatRupiah, formatDateTimeID } from "@/lib/format";
import {
  TABLE_PAGE_SIZE,
  TablePagination,
} from "@/components/dashboard/table-pagination";
import type { Order } from "@/lib/types";

const statusBadge: Record<
  Order["status"],
  { variant: "success" | "default" | "warning" | "brand"; label: string }
> = {
  pending: { variant: "warning", label: "Menunggu" },
  confirmed: { variant: "brand", label: "Dikonfirmasi" },
  processing: { variant: "brand", label: "Diproses" },
  shipped: { variant: "brand", label: "Dikirim" },
  completed: { variant: "success", label: "Selesai" },
  cancelled: { variant: "default", label: "Dibatalkan" },
};

const paymentBadge: Record<
  Order["payment_status"],
  { variant: "success" | "default" | "warning"; label: string }
> = {
  unpaid: { variant: "default", label: "Belum bayar" },
  pending: { variant: "warning", label: "Menunggu" },
  paid: { variant: "success", label: "Lunas" },
  failed: { variant: "default", label: "Gagal" },
  refunded: { variant: "default", label: "Refund" },
};

type Props = {
  orders: Order[];
  page: number;
  total: number;
};

// Server component: data + pagination state come from the page (URL
// searchParams). TablePagination handles navigation by emitting
// `?page=N`-style links the page re-renders against.
export function OrdersTable({ orders, page, total }: Props) {
  return (
    <div className="flex flex-col gap-4">
      <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-card">
        <table className="w-full text-left text-sm">
          <thead className="bg-neutral-50 text-xs font-semibold uppercase tracking-wider text-neutral-500">
            <tr>
              <th className="px-5 py-3">No. Order</th>
              <th className="px-5 py-3">Pembeli</th>
              <th className="px-5 py-3">Total</th>
              <th className="px-5 py-3">Status</th>
              <th className="px-5 py-3">Pembayaran</th>
              <th className="px-5 py-3">Tanggal</th>
              <th className="px-5 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-200">
            {orders.map((o) => (
              <tr key={o.id} className="hover:bg-neutral-50">
                <td className="px-5 py-3 font-mono text-xs text-neutral-700">
                  <Link
                    href={`/orders/${o.id}`}
                    className="hover:text-brand-700"
                  >
                    {o.order_number}
                  </Link>
                </td>
                <td className="px-5 py-3">
                  <div>
                    <p className="font-medium text-neutral-900">
                      {o.customer_name}
                    </p>
                    <p className="text-xs text-neutral-500">
                      {o.customer_city}
                    </p>
                  </div>
                </td>
                <td className="px-5 py-3 font-medium text-neutral-900">
                  {formatRupiah(o.total_cents)}
                </td>
                <td className="px-5 py-3">
                  <Badge variant={statusBadge[o.status].variant}>
                    {statusBadge[o.status].label}
                  </Badge>
                </td>
                <td className="px-5 py-3">
                  <Badge variant={paymentBadge[o.payment_status].variant}>
                    {paymentBadge[o.payment_status].label}
                  </Badge>
                </td>
                <td className="px-5 py-3 text-neutral-600">
                  {formatDateTimeID(o.created_at)}
                </td>
                <td className="px-5 py-3 text-right">
                  <Link
                    href={`/orders/${o.id}`}
                    className="inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:text-brand-700"
                  >
                    Detail
                    <ArrowRight className="size-3.5" aria-hidden />
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <TablePagination
        page={page}
        pageSize={TABLE_PAGE_SIZE}
        total={total}
        paramName="page"
      />
    </div>
  );
}
