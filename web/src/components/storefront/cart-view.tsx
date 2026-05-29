"use client";

import Link from "next/link";
import NextImage from "next/image";
import { useRouter } from "next/navigation";
import { ShoppingBag, Trash2, Image as ImageIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatRupiah } from "@/lib/format";
import { waLink } from "@/lib/whatsapp";
import { useCart, cartItemKey } from "./cart-context";

type Props = {
  storeSlug: string;
  storeName: string;
  storeWhatsApp: string;
  storeOpen: boolean;
  acceptingOrders: boolean;
  acceptingOrdersReason: "" | "store_closed" | "order_limit";
};

export function CartView({
  storeSlug,
  storeName,
  storeWhatsApp,
  storeOpen,
  acceptingOrders,
  acceptingOrdersReason,
}: Props) {
  const { push } = useRouter();
  const { items, count, subtotal, isAllDigital, setQty, removeItem, clear } =
    useCart();

  if (items.length === 0) {
    return (
      <Card>
        <div className="flex flex-col items-center gap-3 py-10 text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-neutral-100 text-neutral-500">
            <ShoppingBag className="size-6" aria-hidden />
          </div>
          <div>
            <p className="font-medium text-neutral-900">
              Keranjang masih kosong
            </p>
            <p className="mt-1 max-w-xs text-sm text-neutral-600">
              Cari produk yang kamu suka di toko, lalu klik &ldquo;Tambah ke
              Keranjang&rdquo;.
            </p>
          </div>
          <Link href={`/${storeSlug}`}>
            <Button size="sm" className="mt-2">
              Lihat produk
            </Button>
          </Link>
        </div>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Card className="p-0">
        <ul className="divide-y divide-neutral-100">
          {items.map((it) => {
            const key = cartItemKey(it);
            const lineTotal = it.unit_price_cents * it.qty;
            const reachedStock =
              it.product_type === "physical" &&
              it.available_stock > 0 &&
              it.qty >= it.available_stock;
            return (
              <li key={key} className="flex items-start gap-3 p-4 sm:p-5">
                <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-neutral-200 bg-neutral-50 sm:size-20">
                  {it.photo_url ? (
                    <NextImage
                      src={it.photo_url}
                      alt={it.product_name}
                      width={80}
                      height={80}
                      className="size-full object-cover"
                    />
                  ) : (
                    <ImageIcon className="size-6 text-neutral-300" aria-hidden />
                  )}
                </div>

                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <Link
                        href={`/${storeSlug}/product/${it.product_slug}`}
                        className="text-sm font-medium text-neutral-900 hover:text-brand-700 line-clamp-2"
                      >
                        {it.product_name}
                      </Link>
                      {it.variant_name && (
                        <p className="mt-0.5 text-xs text-neutral-500">
                          {it.variant_name}
                        </p>
                      )}
                      {it.selected_options && it.selected_options.length > 0 && (
                        <p className="mt-0.5 text-xs text-neutral-500">
                          {it.selected_options
                            .map((o) => o.option_name)
                            .join(" · ")}
                        </p>
                      )}
                      {it.product_type === "digital" && (
                        <Badge variant="brand" className="mt-1.5 text-[10px]">
                          Digital
                        </Badge>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => removeItem(key)}
                      aria-label={`Hapus ${it.product_name}`}
                      className="-mr-2 -mt-1 inline-flex size-8 shrink-0 items-center justify-center rounded-md text-neutral-400 transition-colors hover:bg-danger/10 hover:text-danger"
                    >
                      <Trash2 className="size-4" aria-hidden />
                    </button>
                  </div>

                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        aria-label="Kurangi"
                        onClick={() => setQty(key, it.qty - 1)}
                        disabled={it.qty <= 1}
                        className="flex size-7 items-center justify-center rounded-md border border-neutral-200 text-neutral-700 transition-colors hover:bg-neutral-100 disabled:opacity-40"
                      >
                        −
                      </button>
                      <span className="w-7 text-center font-mono text-sm font-semibold">
                        {it.qty}
                      </span>
                      <button
                        type="button"
                        aria-label="Tambah"
                        onClick={() => setQty(key, it.qty + 1)}
                        disabled={reachedStock}
                        className="flex size-7 items-center justify-center rounded-md border border-neutral-200 text-neutral-700 transition-colors hover:bg-neutral-100 disabled:opacity-40"
                      >
                        +
                      </button>
                    </div>
                    <div className="text-right">
                      <p className="font-mono text-sm font-semibold text-neutral-900">
                        {formatRupiah(lineTotal)}
                      </p>
                      {it.qty > 1 && (
                        <p className="text-[10px] text-neutral-500">
                          @ {formatRupiah(it.unit_price_cents)}
                        </p>
                      )}
                    </div>
                  </div>
                  {reachedStock && (
                    <p className="text-[11px] font-medium text-warning">
                      Sudah pas stok maksimal ({it.available_stock} pcs)
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </Card>

      <Card>
        <div className="flex items-center justify-between text-sm">
          <span className="text-neutral-600">{count} item</span>
          <button
            type="button"
            onClick={clear}
            className="text-xs font-medium text-neutral-500 hover:text-danger"
          >
            Kosongkan keranjang
          </button>
        </div>
        <div className="mt-3 flex items-baseline justify-between border-t border-neutral-200 pt-3">
          <span className="text-neutral-700">Subtotal</span>
          <span className="font-display text-xl font-semibold text-neutral-900">
            {formatRupiah(subtotal)}
          </span>
        </div>
        {!isAllDigital && (
          <p className="mt-1 text-xs text-neutral-500">
            Ongkir dihitung di langkah berikutnya berdasarkan kota tujuan.
          </p>
        )}
        {acceptingOrdersReason === "order_limit" ? (
          <div className="mt-3 rounded-md border border-warning/40 bg-warning/10 p-3 text-xs text-neutral-700">
            <p>
              <strong>
                Penjual sementara tidak menerima pesanan baru.
              </strong>{" "}
              Untuk pemesanan, silakan hubungi langsung admin toko.
            </p>
            {storeWhatsApp && (
              <a
                href={waLink(
                  storeWhatsApp,
                  `Halo ${storeName}, saya mau pesan beberapa item. Boleh dibantu?`,
                )}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-flex items-center justify-center gap-1.5 rounded-md bg-success px-3 py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-90"
              >
                Chat Admin Toko
              </a>
            )}
          </div>
        ) : !storeOpen ? (
          <p className="mt-3 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-neutral-700">
            Toko sedang tutup — pesanan kamu tetap masuk dan diproses saat
            toko buka kembali.
          </p>
        ) : null}
        <Button
          type="button"
          size="md"
          className="mt-4 w-full"
          disabled={!acceptingOrders}
          onClick={() => push(`/${storeSlug}/checkout`)}
        >
          Lanjut ke Checkout
        </Button>
        <Link
          href={`/${storeSlug}`}
          className="mt-2 block text-center text-sm text-neutral-500 hover:text-neutral-700"
        >
          Lanjut belanja
        </Link>
      </Card>
    </div>
  );
}
