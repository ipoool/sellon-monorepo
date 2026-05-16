"use client";

import { useEffect, useState } from "react";
import { Link2, Check, Send } from "lucide-react";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type Props = {
  storeSlug: string;
  productSlug: string;
  productName: string;
  className?: string;
  asMenu?: boolean;
  onAction?: () => void;
};

export function ShareProductButton({
  storeSlug,
  productSlug,
  productName,
  className,
  asMenu = false,
  onAction,
}: Props) {
  const [copied, setCopied] = useState(false);

  // Render the absolute URL only after mount so server-side HTML matches
  // the first client render (avoids hydration mismatch). Default to the
  // relative path which both server and client agree on.
  const relative = `/${storeSlug}/product/${productSlug}`;
  const [url, setUrl] = useState(relative);

  useEffect(() => {
    setUrl(`${window.location.origin}${relative}`);
  }, [relative]);

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

  if (asMenu) {
    return (
      <>
        <button
          type="button"
          onClick={() => { copy(); onAction?.(); }}
          className="flex w-full items-center gap-2.5 px-4 py-2 text-sm text-neutral-700 hover:bg-neutral-50"
        >
          {copied ? <Check className="size-4 text-success" aria-hidden /> : <Link2 className="size-4" aria-hidden />}
          {copied ? "Tersalin!" : "Salin link produk"}
        </button>
        <a
          href={`https://wa.me/?text=${waMessage}`}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => onAction?.()}
          className="flex w-full items-center gap-2.5 px-4 py-2 text-sm text-neutral-700 hover:bg-neutral-50"
        >
          <Send className="size-4" aria-hidden />
          Bagikan via WhatsApp
        </a>
      </>
    );
  }

  return (
    <div className={cn("inline-flex items-center gap-1", className)}>
      <Tooltip label={copied ? "Tersalin!" : "Salin link produk"}>
        <button
          type="button"
          onClick={copy}
          aria-label="Salin link produk"
          className="inline-flex size-7 items-center justify-center rounded-md text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-900"
        >
          {copied ? (
            <Check className="size-3.5 text-success" aria-hidden />
          ) : (
            <Link2 className="size-3.5" aria-hidden />
          )}
        </button>
      </Tooltip>
      <Tooltip label="Bagikan via WhatsApp">
        <a
          href={`https://wa.me/?text=${waMessage}`}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Bagikan via WhatsApp"
          className="inline-flex size-7 items-center justify-center rounded-md text-neutral-500 transition-colors hover:bg-success/10 hover:text-success"
        >
          <Send className="size-3.5" aria-hidden />
        </a>
      </Tooltip>
    </div>
  );
}
