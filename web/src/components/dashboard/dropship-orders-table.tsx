"use client";

import { useState } from "react";
import { Truck, Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { showSuccess, showError } from "@/lib/toast";
import { formatRupiah } from "@/lib/format";
import type { DropshipOrderItem } from "@/lib/types";

const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("id-ID", {
    day: "numeric", month: "short", year: "numeric",
  });
}

function ShipForm({ item, onShipped }: { item: DropshipOrderItem; onShipped: () => void }) {
  const [resi, setResi] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resi.trim()) return;
    setLoading(true);
    try {
      const res = await fetch(`${apiBase}/api/v1/reseller/supplier/orders/${item.order_item_id}/ship`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tracking_number: resi.trim() }),
      });
      if (!res.ok) throw new Error();
      showSuccess("Nomor resi berhasil disimpan");
      onShipped();
    } catch {
      showError("Gagal menyimpan resi");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex gap-2">
      <Input
        value={resi}
        onChange={(e) => setResi(e.target.value)}
        placeholder="Masukkan nomor resi..."
        className="h-8 text-sm"
      />
      <Button type="submit" size="sm" disabled={loading || !resi.trim()}>
        <Truck className="size-3.5" aria-hidden />
        Kirim
      </Button>
    </form>
  );
}

export function DropshipOrdersTable({ orders: initialOrders }: { orders: DropshipOrderItem[] }) {
  const [orders, setOrders] = useState(initialOrders);

  const markShipped = (itemId: string) => {
    setOrders((prev) =>
      prev.map((o) =>
        o.order_item_id === itemId ? { ...o, shipped_at: new Date().toISOString() } : o,
      ),
    );
  };

  const pending = orders.filter((o) => !o.shipped_at);
  const shipped = orders.filter((o) => o.shipped_at);

  return (
    <div className="flex flex-col gap-6">
      {/* Pending */}
      {pending.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-neutral-500">
            Perlu Dikirim ({pending.length})
          </h2>
          <div className="flex flex-col divide-y divide-neutral-100 overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-card">
            {pending.map((item) => (
              <div key={item.order_item_id} className="flex flex-col gap-3 p-5 sm:flex-row sm:items-start sm:gap-6">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-neutral-900">{item.product_name}</span>
                    {item.variant_name && (
                      <Badge variant="outline">{item.variant_name}</Badge>
                    )}
                    <span className="text-sm text-neutral-500">× {item.quantity}</span>
                  </div>
                  <p className="mt-0.5 text-xs text-neutral-400">
                    Order #{item.order_number} dari <strong>{item.reseller_store_name}</strong> · {formatDate(item.order_created_at)}
                  </p>

                  <div className="mt-3 rounded-lg border border-neutral-100 bg-neutral-50 px-3 py-2 text-sm">
                    <p className="font-medium text-neutral-900">{item.customer_name}</p>
                    <p className="text-neutral-600">{item.customer_address}</p>
                    <p className="text-neutral-600">{item.customer_city}</p>
                    <a
                      href={`https://wa.me/${item.customer_wa.replace(/\D/g, "")}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-brand-700 hover:underline"
                    >
                      {item.customer_wa}
                    </a>
                  </div>

                  <div className="mt-3">
                    <ShipForm item={item} onShipped={() => markShipped(item.order_item_id)} />
                  </div>
                </div>

                <div className="shrink-0 text-right">
                  <p className="text-xs text-neutral-500">Modal</p>
                  <p className="font-semibold text-neutral-900">{formatRupiah(item.reseller_cost_cents)}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Shipped */}
      {shipped.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-neutral-500">
            Sudah Dikirim ({shipped.length})
          </h2>
          <div className="flex flex-col divide-y divide-neutral-100 overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-card">
            {shipped.map((item) => (
              <div key={item.order_item_id} className="flex items-center gap-4 px-5 py-3">
                <Check className="size-4 shrink-0 text-brand-600" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-neutral-900">{item.product_name}</p>
                  <p className="text-xs text-neutral-400">
                    #{item.order_number} · Resi: {item.tracking_number || "—"} · {item.reseller_store_name}
                  </p>
                </div>
                <p className="shrink-0 text-sm text-neutral-500">
                  {item.shipped_at ? formatDate(item.shipped_at) : ""}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
