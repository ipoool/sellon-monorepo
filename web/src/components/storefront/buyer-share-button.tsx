"use client";

import { useEffect, useState } from "react";
import { Share2, Copy, Check } from "lucide-react";

type Props = {
  productName: string;
  storeName: string;
  priceLabel: string;
};

export function BuyerShareButton({ productName, storeName, priceLabel }: Props) {
  const [copied, setCopied] = useState(false);
  // URL is empty during SSR + first client render so the markup matches;
  // we hydrate it from window.location.href post-mount. While empty, the
  // WA share link still works as a no-text link.
  const [url, setUrl] = useState("");

  useEffect(() => {
    setUrl(window.location.href);
  }, []);

  async function copy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Browsers without clipboard permission silently fail; the WA share
      // button still works.
    }
  }

  const waText = encodeURIComponent(
    `Lihat ${productName} di ${storeName} — ${priceLabel}\n\n`,
  );
  const waHref = `https://wa.me/?text=${waText}${url ? encodeURIComponent(url) : ""}`;

  return (
    <div className="inline-flex items-center gap-1.5">
      <a
        href={waHref}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-3 text-sm font-medium text-neutral-700 transition-colors hover:border-success/40 hover:bg-success/5 hover:text-success"
        aria-label="Bagikan ke WhatsApp"
      >
        <Share2 className="size-4" aria-hidden />
        Bagikan
      </a>
      <button
        type="button"
        onClick={copy}
        disabled={!url}
        className="inline-flex size-9 items-center justify-center rounded-lg border border-neutral-200 bg-white text-neutral-500 transition-colors hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700 disabled:opacity-50"
        title={copied ? "Tersalin!" : "Salin link produk"}
        aria-label="Salin link produk"
      >
        {copied ? (
          <Check className="size-4 text-success" aria-hidden />
        ) : (
          <Copy className="size-4" aria-hidden />
        )}
      </button>
    </div>
  );
}
