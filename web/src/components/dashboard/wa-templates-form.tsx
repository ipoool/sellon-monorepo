"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Save, Info } from "lucide-react";

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
};

const templates: TemplateSpec[] = [
  {
    key: "order_confirmation",
    title: "Konfirmasi Pesanan",
    description:
      "Dikirim ke pembeli setelah pesanan masuk. Konfirmasi detail + total + cara bayar.",
    defaultBody: `Hai {nama_pembeli}! 👋

Terima kasih sudah pesan di {nama_toko}. Pesananmu sudah masuk:

📦 Pesanan: {nomor_pesanan}
{ringkasan_produk}

💰 Total: {total}
🚚 Kurir: {kurir}

Silakan transfer/bayar ke link yang akan saya kirim selanjutnya. Kalau ada pertanyaan, balas chat ini ya.`,
    placeholders: [
      "nama_pembeli",
      "nama_toko",
      "nomor_pesanan",
      "ringkasan_produk",
      "total",
      "kurir",
    ],
  },
  {
    key: "payment_link",
    title: "Link Pembayaran",
    description:
      "Dikirim setelah seller generate payment link Midtrans / kasih nomor rekening.",
    defaultBody: `Halo {nama_pembeli}, ini link pembayaran untuk pesanan {nomor_pesanan}:

{link_pembayaran}

Total: {total}

Pembayaran berlaku sampai {batas_waktu}. Kalau sudah bayar, balas "OK" ya — saya akan langsung proses.`,
    placeholders: [
      "nama_pembeli",
      "nomor_pesanan",
      "link_pembayaran",
      "total",
      "batas_waktu",
    ],
  },
  {
    key: "shipping_update",
    title: "Update Resi & Pengiriman",
    description:
      "Dikirim saat seller input nomor resi. Kasih buyer info tracking.",
    defaultBody: `Halo {nama_pembeli}! Pesananmu {nomor_pesanan} sudah saya kirim. 📦

🚚 Kurir: {kurir}
📋 Nomor Resi: {nomor_resi}

Lacak: {link_tracking}

Estimasi sampai {estimasi_sampai}. Kalau sudah terima, jangan lupa balas "Sudah sampai" ya, biar saya tahu. Makasih! 🙏`,
    placeholders: [
      "nama_pembeli",
      "nomor_pesanan",
      "kurir",
      "nomor_resi",
      "link_tracking",
      "estimasi_sampai",
    ],
  },
  {
    key: "thank_you",
    title: "Terima Kasih (Pasca Selesai)",
    description:
      "Opsional. Dikirim setelah buyer konfirmasi pesanan diterima — bangun loyalitas + minta review.",
    defaultBody: `Halo {nama_pembeli}, terima kasih banyak sudah belanja di {nama_toko}! ❤️

Senang banget pesananmu sudah sampai dengan baik. Kalau ada feedback atau saran, langsung balas chat ini ya.

🎁 Sebagai apresiasi, ada kode diskon 10% untuk pesanan berikutnya: SELLON10

Sampai ketemu di pesanan berikutnya!`,
    placeholders: ["nama_pembeli", "nama_toko"],
  },
];

export function WhatsAppTemplatesForm({
  initial,
}: {
  initial: Record<string, string>;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    setSaved(false);

    const fd = new FormData(e.currentTarget);
    const body: Record<string, string> = {};
    for (const t of templates) {
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
      setSaved(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menyimpan");
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
              <strong>Cara kerja:</strong> Template ini akan diisi otomatis oleh
              SellOn dengan data pesanan saat seller klik &ldquo;Kirim WhatsApp&rdquo;
              dari halaman pesanan. Pakai variabel{" "}
              <code className="rounded bg-neutral-100 px-1 py-0.5 text-xs">
                &#123;nama_variable&#125;
              </code>{" "}
              — akan di-replace otomatis. Variabel yang tidak dikenal akan dibiarkan apa adanya.
            </p>
          </div>
        </div>
      </Card>

      {templates.map((t) => (
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
              <Badge key={p} variant="outline" className="font-mono text-xs">
                {`{${p}}`}
              </Badge>
            ))}
          </div>

          <textarea
            id={t.key}
            name={t.key}
            rows={9}
            defaultValue={initial[t.key] ?? t.defaultBody}
            aria-labelledby={`${t.key}-title`}
            className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 font-mono text-xs leading-relaxed text-neutral-900 placeholder:text-neutral-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
          />
        </Card>
      ))}

      <div className="flex items-center justify-between">
        <div className="text-sm">
          {saved && <span className="font-medium text-success">✓ Tersimpan</span>}
          {error && <span className="font-medium text-danger">{error}</span>}
        </div>
        <Button type="submit" size="md" disabled={pending}>
          <Save className="size-4" aria-hidden />
          {pending ? "Menyimpan…" : "Simpan Template"}
        </Button>
      </div>
    </form>
  );
}
