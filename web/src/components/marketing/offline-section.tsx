import Link from "next/link";
import {
  WifiOff,
  RefreshCw,
  ShieldCheck,
  CloudOff,
  CheckCircle2,
  ArrowRight,
} from "lucide-react";
import { Section } from "@/components/layout/section";
import { Container } from "@/components/layout/container";
import { Button } from "@/components/ui/button";

const benefits = [
  {
    icon: WifiOff,
    title: "Jualan tanpa internet",
    description:
      "Sinyal hilang atau wifi mati? Catat transaksi, hitung kembalian, semua tetap jalan. Pelanggan gak nunggu, antrian gak macet.",
  },
  {
    icon: RefreshCw,
    title: "Auto-sinkron pas online",
    description:
      "Begitu internet balik, transaksi offline otomatis dikirim ke server di background. Kamu bisa pindah menu atau tutup laptop — sync jalan sendiri.",
  },
  {
    icon: ShieldCheck,
    title: "Anti dobel & aman",
    description:
      "Tiap transaksi punya kode unik, jadi gak akan kecatat dua kali walau sync diulang. Data tersimpan aman di perangkat sampai benar-benar masuk server.",
  },
];

export function OfflineSection() {
  return (
    <Section bg="default">
      <Container>
        <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
          {/* Visual: offline → sync mock (left on desktop, below copy on mobile) */}
          <div className="relative order-2 lg:order-1">
            {/* Floating "tetap aman" tag */}
            <div className="pointer-events-none absolute -right-3 top-8 z-20 hidden rotate-[4deg] items-center gap-1.5 rounded-full border border-warning/40 bg-white px-3 py-1.5 text-xs font-semibold text-warning shadow-elevated sm:inline-flex">
              <CloudOff className="size-3" aria-hidden />
              Tersimpan di perangkat
            </div>

            <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-popout">
              {/* Mock header — offline state */}
              <div className="flex items-center justify-between border-b border-neutral-200 bg-neutral-50 px-4 py-3">
                <span className="text-sm font-semibold text-neutral-900">
                  Kasir
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-warning/15 px-2.5 py-1 text-[11px] font-semibold text-warning">
                  <WifiOff className="size-3" aria-hidden />
                  Offline
                </span>
              </div>

              {/* Saved-offline receipt card */}
              <div className="flex flex-col items-center gap-2 px-6 pt-6 pb-4 text-center">
                <div className="flex size-12 items-center justify-center rounded-full bg-brand-50 text-brand-700">
                  <CheckCircle2 className="size-6" aria-hidden />
                </div>
                <p className="font-display text-lg font-bold text-neutral-900">
                  Transaksi Berhasil
                </p>
                <p className="text-xs text-neutral-500">Struk #LOKAL-4A2C0B</p>
                <p className="font-display text-2xl font-bold text-neutral-900">
                  Rp 47.000
                </p>
                <div className="mt-1 rounded-md border border-warning/40 bg-warning/10 px-3 py-1.5 text-[11px] leading-relaxed text-neutral-600">
                  Tersimpan offline — otomatis tersinkron saat internet kembali.
                </div>
              </div>

              {/* Sync status strip */}
              <div className="flex items-center gap-2 border-t border-neutral-100 bg-neutral-50/60 px-4 py-3">
                <RefreshCw className="size-4 text-brand-600" aria-hidden />
                <p className="flex-1 text-xs text-neutral-600">
                  <strong className="text-neutral-900">3 transaksi</strong>{" "}
                  nunggu sync
                </p>
                <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-[10px] font-semibold text-success">
                  <span className="size-1.5 rounded-full bg-success" />
                  Auto
                </span>
              </div>
            </div>
          </div>

          {/* Copy + benefits (right on desktop, first on mobile) */}
          <div className="order-1 flex flex-col lg:order-2">
            <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-brand-300 bg-white px-3 py-1 text-xs font-semibold text-brand-700 shadow-soft">
              <WifiOff className="size-3.5" aria-hidden />
              BARU · Mode Offline
            </span>
            <h2 className="mt-4 font-display text-3xl font-semibold tracking-tight text-neutral-900 sm:text-4xl">
              Internet ngadat?{" "}
              <span className="text-gradient-brand">Kasir tetap jalan.</span>
            </h2>
            <p className="mt-4 text-lg text-neutral-700">
              Listrik nyala, internet mati — bukan alasan berhenti jualan. SellOn
              POS menyimpan transaksi di perangkat dan otomatis menyinkronkannya
              begitu kamu online lagi. Local-first, tanpa drama.
            </p>

            <ul className="mt-8 flex flex-col gap-5">
              {benefits.map(({ icon: Icon, title, description }) => (
                <li key={title} className="flex items-start gap-4">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white text-brand-700 shadow-soft ring-1 ring-brand-200">
                    <Icon className="size-5" strokeWidth={2} aria-hidden />
                  </div>
                  <div>
                    <p className="font-semibold text-neutral-900">{title}</p>
                    <p className="mt-1 text-sm leading-relaxed text-neutral-600">
                      {description}
                    </p>
                  </div>
                </li>
              ))}
            </ul>

            <div className="mt-8 flex flex-col items-center gap-3 text-center">
              <Link href="/login">
                <Button size="lg" className="whitespace-nowrap">
                  Aktifkan Mode Offline
                  <ArrowRight className="size-4" aria-hidden />
                </Button>
              </Link>
              <p className="text-xs leading-relaxed text-neutral-500">
                Saat offline pembayaran tunai · Tersedia di plan Bisnis
              </p>
            </div>
          </div>
        </div>
      </Container>
    </Section>
  );
}
