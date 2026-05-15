"use client";

import { useState, type FormEvent } from "react";
import { showError, showSuccess } from "@/lib/toast";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Save, Crown, Lock } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import type { Store } from "@/lib/types";

const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

type Plan = "free" | "pro" | "bisnis";

type Props = {
  // Full store row. We PUT the whole thing back because /api/v1/store
  // is a single Update endpoint — sending only the notification field
  // would blank out the rest. The other Pengaturan tabs use the same
  // round-trip-the-whole-record pattern.
  store: Store | null;
  // Active subscription tier. Free tier gets a locked / upgrade-CTA
  // state — the actual server gate also blocks free sellers, but the
  // UI hides the controls so they don't think they just configured
  // something that silently fails.
  plan: Plan;
};

export function WhatsAppNotificationForm({ store, plan }: Props) {
  const { refresh } = useRouter();
  // Switch is the user-facing "enabled" knob. We keep the typed number
  // around even when the switch is off so flipping it back doesn't
  // force the seller to retype — empty string is sent only on save.
  const [enabled, setEnabled] = useState(
    () => (store?.notification_whatsapp_number ?? "").trim().length > 0,
  );
  const [value, setValue] = useState(
    () => store?.notification_whatsapp_number ?? "",
  );
  const [pending, setPending] = useState(false);

  if (!store) {
    return (
      <Card>
        <p className="text-sm text-neutral-600">
          Buat profil toko dulu di{" "}
          <Link
            href="/settings/store"
            className="font-medium text-brand-700 underline-offset-4 hover:underline"
          >
            Pengaturan → Toko
          </Link>
          , baru notifikasi WhatsApp bisa diaktifkan.
        </p>
      </Card>
    );
  }

  const isPaidTier = plan === "pro" || plan === "bisnis";

  // Free tier sees a locked card with an upgrade CTA. The form below
  // is not rendered at all so they can't fill in a number that the
  // server would silently ignore.
  if (!isPaidTier) {
    return (
      <Card className="border-warning/40 bg-warning/5">
        <header className="flex items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-warning/15 text-warning">
            <Lock className="size-5" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-semibold text-neutral-900">
                Notifikasi Pesanan Baru
              </h2>
              <Badge variant="warning" className="gap-1">
                <Crown className="size-3" aria-hidden />
                Khusus Pro & Bisnis
              </Badge>
            </div>
            <p className="mt-1 text-sm text-neutral-700">
              Otomatis kirim WhatsApp ke owner setiap ada pesanan baru.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link href="/settings/subscription">
                <Button size="sm">
                  <Crown className="size-3.5" aria-hidden />
                  Upgrade ke Pro
                </Button>
              </Link>
            </div>
          </div>
        </header>
      </Card>
    );
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();

    const trimmed = value.trim();
    if (enabled && trimmed === "") {
      showError("Nomor wajib diisi kalau notifikasi diaktifkan");
      return;
    }

    setPending(true);
    try {
      const body = {
        // Round-trip every other field unchanged. Anything missing
        // here would be saved as empty by the backend Update.
        name: store!.name,
        description: store!.description,
        logo_url: store!.logo_url,
        banner_url: store!.banner_url,
        tagline: store!.tagline,
        category: store!.category,
        city: store!.city,
        whatsapp_number: store!.whatsapp_number,
        // Switch off → persist empty (server treats empty as "disabled").
        notification_whatsapp_number: enabled ? trimmed : "",
        instagram: store!.instagram,
        tiktok: store!.tiktok,
        open_hours: store!.open_hours,
        is_open: store!.is_open,
      };
      const res = await fetch(`${apiBase}/api/v1/store`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      showSuccess("Nomor notifikasi tersimpan");
      refresh();
    } catch (err) {
      showError(err);
    } finally {
      setPending(false);
    }
  }

  return (
    <Card>
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <header className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold text-neutral-900">
              Notifikasi Pesanan Baru
            </h2>
            <p className="mt-1 text-sm text-neutral-600">
              Setiap kali ada pesanan masuk dari storefront, SellOn kirim
              WhatsApp ke nomor ini. Nomor pribadi owner — tidak pernah
              ditampilkan ke pembeli. Pesannya pakai template Alert Pesanan
              Baru di bawah
            </p>
          </div>
          <label className="flex shrink-0 items-center gap-2 text-sm font-medium text-neutral-700">
            <Switch
              checked={enabled}
              onChange={(e) => setEnabled(e.currentTarget.checked)}
              aria-label="Aktifkan notifikasi WhatsApp"
            />
            <span>{enabled ? "Aktif" : "Mati"}</span>
          </label>
        </header>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="notification_whatsapp_number">
            Nomor WhatsApp tujuan
          </Label>
          <Input
            id="notification_whatsapp_number"
            name="notification_whatsapp_number"
            type="tel"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            disabled={!enabled}
            placeholder="62812-3456-7890"
          />
          <p className="text-xs text-neutral-500">
            Format bebas: <code>0812…</code>, <code>62812…</code>, atau{" "}
            <code>+62812…</code> — sistem normalisasi sendiri ke E.164.
          </p>
        </div>

        <div className="flex items-center justify-end border-t border-neutral-200 pt-4">
          <Button type="submit" size="md" disabled={pending}>
            <Save className="size-4" aria-hidden />
            {pending ? "Menyimpan…" : "Simpan"}
          </Button>
        </div>
      </form>
    </Card>
  );
}
