"use client";

import { useState } from "react";
import { Link2, Check, Send } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  storeSlug: string;
  productSlug: string;
  productName: string;
  className?: string;
};

export function ShareProductButton({
  storeSlug,
  productSlug,
  productName,
  className,
}: Props) {
  const [copied, setCopied] = useState(false);

  const url =
    typeof window !== "undefined"
      ? `${window.location.origin}/${storeSlug}/produk/${productSlug}`
      : `/${storeSlug}/produk/${productSlug}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore — fallback below
    }
  }

  const waMessage = encodeURIComponent(
    `Halo, lihat produk ini di toko saya:\n\n${productName}\n${url}`,
  );

  return (
    <div className={cn("inline-flex items-center gap-1", className)}>
      <button
        type="button"
        onClick={copy}
        title={copied ? "Tersalin!" : "Salin link produk"}
        aria-label="Salin link produk"
        className="inline-flex size-7 items-center justify-center rounded-md text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-900"
      >
        {copied ? (
          <Check className="size-3.5 text-success" aria-hidden />
        ) : (
          <Link2 className="size-3.5" aria-hidden />
        )}
      </button>
      <a
        href={`https://wa.me/?text=${waMessage}`}
        target="_blank"
        rel="noopener noreferrer"
        title="Bagikan via WhatsApp"
        aria-label="Bagikan via WhatsApp"
        className="inline-flex size-7 items-center justify-center rounded-md text-neutral-500 transition-colors hover:bg-success/10 hover:text-success"
      >
        <Send className="size-3.5" aria-hidden />
      </a>
    </div>
  );
}
