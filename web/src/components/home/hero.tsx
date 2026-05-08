import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Container } from "@/components/layout/container";
import { BrowserMockup } from "@/components/marketing/browser-mockup";

const heroPoints = [
  "Gratis selamanya untuk toko kecil",
  "Pembayaran QRIS langsung ke rekeningmu",
  "Tidak butuh kartu kredit",
];

export function Hero() {
  return (
    <section className="relative overflow-hidden pb-16 pt-14 lg:pb-24 lg:pt-20">
      <div
        aria-hidden
        className="bg-dot-grid pointer-events-none absolute inset-x-0 bottom-0 top-0 -z-10 opacity-50 [mask-image:radial-gradient(ellipse_60%_50%_at_50%_30%,black,transparent_80%)]"
      />

      <Container>
        <div className="grid items-center gap-12 lg:grid-cols-12 lg:gap-16">
          <div className="lg:col-span-6">
            <Badge variant="brand">Untuk UMKM Indonesia</Badge>
            <h1 className="mt-5 font-display text-4xl font-semibold tracking-tight text-neutral-900 sm:text-5xl lg:text-6xl">
              Jualan via WhatsApp{" "}
              <span className="text-gradient-brand">tanpa potongan</span>{" "}
              marketplace.
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-neutral-600">
              Buat katalog produk, terima pembayaran QRIS, dan kelola pesanan
              UMKM-mu — semua dari satu tempat. Bayar bulanan tetap, tidak ada
              take-rate per pesanan.
            </p>

            <div className="mt-8 flex flex-col items-start gap-3 sm:flex-row sm:items-center">
              <Link href="/masuk">
                <Button size="lg">
                  Mulai Gratis
                  <ArrowRight className="size-4" aria-hidden />
                </Button>
              </Link>
              <Link href="/#cara-kerja">
                <Button size="lg" variant="ghost">
                  Lihat cara kerja →
                </Button>
              </Link>
            </div>

            <ul className="mt-8 flex flex-col gap-2 text-sm text-neutral-600 sm:flex-row sm:flex-wrap sm:gap-x-5 sm:gap-y-2">
              {heroPoints.map((p) => (
                <li key={p} className="flex items-center gap-2">
                  <Check className="size-4 text-brand-600" aria-hidden />
                  <span>{p}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="lg:col-span-6">
            <BrowserMockup url="sellon.id/dasbor" className="lg:ml-auto">
              <DasborPreview />
            </BrowserMockup>
          </div>
        </div>
      </Container>
    </section>
  );
}

// Stylized miniature of the dashboard for the hero mockup.
// Pure HTML/CSS, no images. Looks polished by mirroring real component shapes.
function DasborPreview() {
  return (
    <div className="flex flex-col gap-4 p-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-neutral-500">Selamat pagi,</p>
          <p className="font-display text-base font-semibold text-neutral-900">
            Dasbor Toko-mu
          </p>
        </div>
        <div className="size-7 rounded-full bg-brand-100" />
      </div>

      <div className="grid grid-cols-3 gap-2.5">
        {[
          { label: "Pesanan", value: "12" },
          { label: "Pendapatan", value: "Rp 4,8jt" },
          { label: "Produk", value: "37" },
        ].map((s) => (
          <div
            key={s.label}
            className="rounded-lg border border-neutral-200 bg-white p-2.5"
          >
            <p className="text-[10px] text-neutral-500">{s.label}</p>
            <p className="mt-0.5 font-display text-sm font-semibold text-neutral-900">
              {s.value}
            </p>
          </div>
        ))}
      </div>

      <div className="rounded-lg border border-neutral-200 p-3">
        <p className="text-xs font-medium text-neutral-700">Pesanan Terbaru</p>
        <div className="mt-2 flex flex-col gap-1.5">
          {[
            { name: "Bu Ani", item: "Keripik Singkong 500g", price: "Rp 35rb" },
            { name: "Pak Joko", item: "Sambal Bawang Pedas", price: "Rp 28rb" },
            { name: "Mbak Rina", item: "Keripik Singkong 1kg", price: "Rp 65rb" },
          ].map((row) => (
            <div
              key={row.name}
              className="flex items-center justify-between text-[11px]"
            >
              <div>
                <p className="font-medium text-neutral-800">{row.name}</p>
                <p className="text-neutral-500">{row.item}</p>
              </div>
              <p className="font-medium text-neutral-900">{row.price}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between rounded-lg bg-brand-50 px-3 py-2">
        <p className="text-[11px] font-medium text-brand-700">
          Bagikan link katalog ke WhatsApp
        </p>
        <span className="rounded-md bg-white px-2 py-0.5 text-[10px] font-medium text-brand-700 shadow-soft">
          Salin
        </span>
      </div>
    </div>
  );
}
