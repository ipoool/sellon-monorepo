"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import JsBarcode from "jsbarcode";
import { ArrowLeft, Printer, Minus, Plus } from "lucide-react";
import { formatRupiah } from "@/lib/format";
import type { Product } from "@/lib/types";

type Props = {
  product: Product;
};

// Generate a short, scannable code from the product UUID.
// Use first 12 chars of UUID (without hyphens), uppercased. CODE128 supports
// alphanumeric + symbols up to ~80 chars. We keep it short for stickers.
function barcodeValue(productId: string): string {
  return productId.replace(/-/g, "").slice(0, 12).toUpperCase();
}

export function BarcodeSheet({ product }: Props) {
  const [copies, setCopies] = useState(8);
  const value = barcodeValue(product.id);

  return (
    <>
      <style jsx global>{`
        @media print {
          body { background: white !important; }
          .no-print { display: none !important; }
          @page { size: A4; margin: 10mm; }
        }
      `}</style>

      {/* Toolbar (hidden on print) */}
      <div className="no-print sticky top-0 z-10 flex items-center justify-between border-b border-neutral-200 bg-white px-4 py-3 shadow-soft">
        <Link
          href={`/products/${product.id}`}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-neutral-600 hover:text-neutral-900"
        >
          <ArrowLeft className="size-3.5" aria-hidden />
          Kembali ke produk
        </Link>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 rounded-lg border border-neutral-200 bg-white px-2 py-1">
            <span className="text-xs text-neutral-500">Jumlah:</span>
            <button
              onClick={() => setCopies((n) => Math.max(1, n - 1))}
              className="flex size-6 items-center justify-center rounded hover:bg-neutral-100"
            >
              <Minus className="size-3" aria-hidden />
            </button>
            <span className="w-8 text-center font-semibold text-neutral-900">{copies}</span>
            <button
              onClick={() => setCopies((n) => Math.min(100, n + 1))}
              className="flex size-6 items-center justify-center rounded hover:bg-neutral-100"
            >
              <Plus className="size-3" aria-hidden />
            </button>
          </div>
          <button
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-700 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-800"
          >
            <Printer className="size-4" aria-hidden />
            Cetak Sheet
          </button>
        </div>
      </div>

      {/* Sheet — grid of identical stickers */}
      <div className="mx-auto max-w-[210mm] p-6">
        <p className="no-print mb-3 text-sm text-neutral-500">
          Format A4. Cetak di sticker label (ukuran ~50×30mm). Cashier bisa scan
          stiker ini dengan USB barcode scanner di kasir.
        </p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
          {Array.from({ length: copies }).map((_, i) => (
            <BarcodeSticker key={i} product={product} value={value} />
          ))}
        </div>
      </div>
    </>
  );
}

function BarcodeSticker({ product, value }: { product: Product; value: string }) {
  const svgRef = useRef<SVGSVGElement>(null);
  useEffect(() => {
    if (!svgRef.current) return;
    try {
      JsBarcode(svgRef.current, value, {
        format: "CODE128",
        width: 1.6,
        height: 40,
        displayValue: true,
        fontSize: 11,
        margin: 2,
      });
    } catch (e) {
      console.error("barcode render failed", e);
    }
  }, [value]);

  return (
    <div className="flex flex-col items-center justify-center rounded border border-dashed border-neutral-300 bg-white p-2 text-center">
      <p className="line-clamp-1 text-[10px] font-semibold text-neutral-900">{product.name}</p>
      <p className="text-[9px] text-neutral-500">{formatRupiah(product.price_cents)}</p>
      <svg ref={svgRef} className="my-1" />
    </div>
  );
}
