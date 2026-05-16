"use client";

import { useState } from "react";
import NextImage from "next/image";
import { Package } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  photoUrls: string[];
  productName: string;
};

export function ProductPhotoGallery({ photoUrls, productName }: Props) {
  const [activeIdx, setActiveIdx] = useState(0);
  const activeUrl = photoUrls[activeIdx] ?? null;

  return (
    <div>
      {/* Main image */}
      <div className="relative aspect-square overflow-hidden rounded-xl border border-neutral-200 bg-neutral-100">
        {activeUrl ? (
          <NextImage
            key={activeUrl}
            src={activeUrl}
            alt={productName}
            fill
            className="object-cover"
            priority={activeIdx === 0}
          />
        ) : (
          <div className="flex size-full items-center justify-center text-neutral-400">
            <Package className="size-16" aria-hidden />
          </div>
        )}
      </div>

      {/* Thumbnails — hanya muncul jika ada lebih dari 1 foto */}
      {photoUrls.length > 1 && (
        <div className="mt-3 grid grid-cols-5 gap-2">
          {photoUrls.map((url, i) => (
            <button
              key={url}
              type="button"
              onClick={() => setActiveIdx(i)}
              aria-label={`Foto ${i + 1}`}
              className={cn(
                "relative aspect-square overflow-hidden rounded-lg border-2 transition-all",
                activeIdx === i
                  ? "border-brand-500 ring-2 ring-brand-500/30"
                  : "border-neutral-200 hover:border-brand-300",
              )}
            >
              <NextImage
                src={url}
                alt={`${productName} foto ${i + 1}`}
                fill
                sizes="(max-width: 768px) 20vw, 10vw"
                className="object-cover"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
