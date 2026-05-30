"use client";

import { useState, type FormEvent } from "react";
import { showError, showSuccess } from "@/lib/toast";
import { useRouter } from "next/navigation";
import { Save, Info, Lock } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

type TemplateSpec = {
  key: string;
  title: string;
  description: string;
  defaultBody: string;
  placeholders: string[];
  // "paid" = Pro/Bisnis only (server auto-sends, billable on Twilio).
  // "free" = anyone can edit; consumer is a manual "buka WhatsApp" link
  // that the seller clicks from the order detail page.
  tier: "paid" | "free";
};

// Only templates with a real runtime consumer live here. Each entry
// must be wired to something that actually reads it from
// /api/v1/whatsapp-templates — don't add aspirational templates.
const templates: TemplateSpec[] = [
  {
    key: "new_order_alert",
    title: "Alert Pesanan Baru (Owner)",
    description:
      "Otomatis dikirim ke nomor notifikasi di atas setiap kali ada order masuk via storefront. Placeholder pakai {{kurawal_dobel}} karena sistem yang mengisi otomatis.",
    defaultBody: `🛒 *Pesanan baru!*

No: *{{order_number}}*
Dari: {{customer_name}} ({{customer_whatsapp}})
Total: *Rp {{total}}*
Metode bayar: {{payment_method}}

Lihat detail: {{order_link}}`,
    placeholders: [
      "order_number",
      "customer_name",
      "customer_whatsapp",
      "customer_email",
      "customer_city",
      "total",
      "subtotal",
      "shipping",
      "payment_method",
      "store_name",
      "order_link",
    ],
    tier: "paid",
  },
  {
    key: "order_confirmation",
    title: "Konfirmasi Pesanan (buyer)",
    description:
      "Dipakai saat seller klik \"Konfirmasi Pesanan\" di halaman detail pesanan. WhatsApp terbuka dengan pesan sudah terisi, tinggal kirim.",
    defaultBody: `Hai {nama_pembeli}! 👋

Pesananmu sudah masuk:

📦 Pesanan: {nomor_pesanan}
{ringkasan_produk}

💰 Total: {total}
🚚 Kurir: {kurir}

Terima kasih sudah pesan di {nama_toko}.`,
    placeholders: [
      "nama_pembeli",
      "nama_toko",
      "nomor_pesanan",
      "ringkasan_produk",
      "total",
      "kurir",
    ],
    tier: "free",
  },
  {
    key: "payment_link",
    title: "Kirim Link Pembayaran (buyer)",
    description:
      "Dipakai saat seller klik \"Kirim Link Pembayaran\" di halaman detail pesanan.",
    defaultBody: `Halo {nama_pembeli}, ini link pembayaran untuk pesanan {nomor_pesanan}:

{link_pembayaran}

Total: {total}`,
    placeholders: [
      "nama_pembeli",
      "nomor_pesanan",
      "link_pembayaran",
      "total",
    ],
    tier: "free",
  },
  {
    key: "shipping_update",
    title: "Update Resi (buyer)",
    description:
      "Dipakai saat seller klik \"Kirim Update Resi\" di halaman detail pesanan setelah input nomor resi.",
    defaultBody: `Halo {nama_pembeli}! Pesananmu {nomor_pesanan} sudah saya kirim. 📦

🚚 Kurir: {kurir}
📋 Nomor Resi: {nomor_resi}

Estimasi sampai 2-4 hari. Makasih! 🙏`,
    placeholders: [
      "nama_pembeli",
      "nomor_pesanan",
      "kurir",
      "nomor_resi",
    ],
    tier: "free",
  },
];

type Plan = "free" | "pro" | "bisnis";

export function WhatsAppTemplatesForm({
  initial,
  plan,
}: {
  initial: Record<string, string>;
  // Same plan gate as the notification form: Free tier can preview the
  // template body for transparency, but textarea + save are disabled
  // since nothing will fire until they upgrade.
  plan: Plan;
}) {
  const { refresh } = useRouter();
  const [pending, setPending] = useState(false);  // Whole feature is Pro/Bisnis. Free tier still sees the templates
  // (so they know what they'd get on upgrade), but textareas + Save
  // are locked. The notification card above this form already carries
  // the upgrade CTA, so we don't duplicate it here — just visual locks.
  const locked = plan !== "pro" && plan !== "bisnis";

  // new_order_alert is sent via the WhatsApp Business API (Twilio) — a
  // business-initiated message that, in production, requires a Meta-approved
  // template. So it's NOT editable here; it uses the platform default. The
  // rest (order confirmation / payment link / shipping update) fire via
  // manual wa.me links, which are freeform and stay fully customizable.
  const editable = templates.filter((t) => t.key !== "new_order_alert");

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    const fd = new FormData(e.currentTarget);
    const body: Record<string, string> = {};
    for (const t of editable) {
      // Disabled textareas don't appear in FormData; skipping them
      // entirely also means the locked-tier seller can't accidentally
      // clobber a stored value with empty string. (Save button itself
      // is disabled for Free, so this branch is belt + suspenders.)
      if (locked) continue;
      body[t.key] = String(fd.get(t.key) ?? "");
    }

    try {
      const res = await fetch(`${apiBase}/api/v1/whatsapp-templates`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templates: body }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      showSuccess("Tersimpan");
      refresh();
    } catch (err) {
      showError(err);
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5">
      <Card variant="ghost">
        <div className="flex items-start gap-3 text-sm text-neutral-700">
          <Info className="size-4 shrink-0 text-brand-600" aria-hidden />
          <div>
            <p>
              <strong>Cara kerja:</strong> Template di bawah dipakai untuk
              tombol &ldquo;Kirim WhatsApp&rdquo; di halaman detail pesanan
              (manual, seller klik). Placeholder seperti{" "}
              <code className="rounded bg-neutral-100 px-1 py-0.5 text-xs">
                &#123;nama_pembeli&#125;
              </code>{" "}
              akan diganti dengan data pesanan asli. Kosongkan body untuk pakai
              template default.
              <br />
              <span className="mt-1 inline-block text-neutral-500">
                Template <strong>Alert Pesanan Baru</strong> (notifikasi otomatis ke
                owner) sementara memakai format default platform &amp; belum bisa
                diubah — menunggu integrasi WhatsApp resmi (template approved Meta).
              </span>
            </p>
          </div>
        </div>
      </Card>

      {editable.map((t) => (
        <Card key={t.key}>
          <header className="mb-4">
            <h2
              id={`${t.key}-title`}
              className="font-semibold text-neutral-900 no-underline"
            >
              {t.title}
            </h2>
            <p className="mt-1 text-sm leading-relaxed text-neutral-600 no-underline">
              {t.description}
            </p>
          </header>

          <div className="mb-3 flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-medium text-neutral-500">
              Variabel:
            </span>
            {t.placeholders.map((p) => (
              <Badge
                key={p}
                variant="outline"
                className="font-mono text-xs"
              >
                {/* Placeholder syntax matches how the consumer reads
                    it: paid auto-templates use {{double}}, free buyer
                    templates use {single}. */}
                {t.tier === "paid" ? `{{${p}}}` : `{${p}}`}
              </Badge>
            ))}
          </div>

          <textarea
            id={t.key}
            name={t.key}
            rows={9}
            defaultValue={initial[t.key] ?? t.defaultBody}
            aria-labelledby={`${t.key}-title`}
            disabled={locked}
            className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 font-mono text-xs leading-relaxed text-neutral-900 placeholder:text-neutral-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30 disabled:cursor-not-allowed disabled:bg-neutral-50 disabled:text-neutral-500"
          />
        </Card>
      ))}

      {/* One global Save bar. Locked for Free — feature is Pro/Bisnis. */}
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm">
                            </div>
        <Button type="submit" size="md" disabled={pending || locked}>
          {locked ? (
            <Lock className="size-4" aria-hidden />
          ) : (
            <Save className="size-4" aria-hidden />
          )}
          {pending ? "Menyimpan…" : "Simpan"}
        </Button>
      </div>
    </form>
  );
}
