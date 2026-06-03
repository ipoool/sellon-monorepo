"use client";

import { useEffect, useRef } from "react";
import { trackViewContent } from "@/lib/meta-pixel";

// Fires a Meta Pixel ViewContent once when a product detail page mounts.
// No-op unless the store enabled Meta (the Pixel base script isn't loaded).
export function MetaViewContent({
  productId,
  valueRupiah,
}: {
  productId: string;
  valueRupiah: number;
}) {
  const fired = useRef(false);
  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    trackViewContent(productId, valueRupiah);
  }, [productId, valueRupiah]);
  return null;
}
