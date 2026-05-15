"use client";

import { useState } from "react";
import { showError, showSuccess } from "@/lib/toast";
import { Save } from "lucide-react";
import { Button } from "@/components/ui/button";

const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

type Props = {
  orderId: string;
  initialNotes: string;
};

export function OrderSellerNotes({ orderId, initialNotes }: Props) {
  const [value, setValue] = useState(() => initialNotes);
  const [pending, setPending] = useState(false);
  async function save() {
    setPending(true);    try {
      const res = await fetch(`${apiBase}/api/v1/orders/${orderId}/notes`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seller_notes: value }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      showSuccess("Tersimpan");    } catch (err) {
      showError(err);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <textarea
        rows={4}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Catatan untuk diri-mu (mis. status komunikasi, perubahan pesanan, dll). Hanya kamu yang bisa lihat."
        className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm placeholder:text-neutral-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
      />
      <div className="flex items-center justify-between">
        <span className="text-xs">
                            </span>
        <Button size="sm" onClick={save} disabled={pending}>
          <Save className="size-4" aria-hidden />
          {pending ? "Menyimpan…" : "Simpan"}
        </Button>
      </div>
    </div>
  );
}
