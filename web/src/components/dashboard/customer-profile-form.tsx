"use client";

import { useState } from "react";
import { showError, showSuccess } from "@/lib/toast";
import { Save, ShieldOff, ShieldAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

type Props = {
  customerId: string;
  initialNotes: string;
  initialBlacklisted: boolean;
};

export function CustomerProfileForm({
  customerId,
  initialNotes,
  initialBlacklisted,
}: Props) {
  const { refresh } = useRouter();
  const [notes, setNotes] = useState(() => initialNotes);
  const [isBlacklisted, setIsBlacklisted] = useState(() => initialBlacklisted);
  const [pending, setPending] = useState(false);
  async function save(nextBlacklisted = isBlacklisted) {
    setPending(true);    try {
      const res = await fetch(`${apiBase}/api/v1/customers/${customerId}`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes, is_blacklisted: nextBlacklisted }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      showSuccess("Tersimpan");      refresh();
    } catch (err) {
      showError(err);
    } finally {
      setPending(false);
    }
  }

  async function toggleBlacklist() {
    const next = !isBlacklisted;
    if (next) {
      const ok = window.confirm(
        "Tandai pelanggan ini sebagai blacklist? Kamu masih bisa lihat history-nya, tapi ini jadi pengingat untuk hati-hati di order berikutnya.",
      );
      if (!ok) return;
    }
    setIsBlacklisted(next);
    await save(next);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <label
          htmlFor="customer_notes"
          className="text-sm font-medium text-neutral-800"
        >
          Catatan internal
        </label>
        <textarea
          id="customer_notes"
          rows={4}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Mis: prefer COD, alergi pengantaran malam, dll. Hanya kamu yang lihat."
          className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm placeholder:text-neutral-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
        />
        <div className="flex items-center justify-between">
          <span className="text-xs">
                                  </span>
          <Button size="sm" onClick={() => save()} disabled={pending}>
            <Save className="size-4" aria-hidden />
            {pending ? "Menyimpan…" : "Simpan"}
          </Button>
        </div>
      </div>

      <div className="flex items-center justify-between rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2.5">
        <div>
          <p className="text-sm font-medium text-neutral-900">
            {isBlacklisted ? "Pelanggan di-blacklist" : "Status: aman"}
          </p>
          <p className="text-xs text-neutral-600">
            Tag blacklist hanya peringatan internal - tidak otomatis menolak order.
          </p>
        </div>
        <Button
          size="sm"
          variant={isBlacklisted ? "outline" : "ghost"}
          onClick={toggleBlacklist}
          disabled={pending}
        >
          {isBlacklisted ? (
            <>
              <ShieldOff className="size-4" aria-hidden />
              Lepas blacklist
            </>
          ) : (
            <>
              <ShieldAlert className="size-4" aria-hidden />
              Blacklist
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
