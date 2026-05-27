import Link from "next/link";
import {
  Store,
  Users,
  ShoppingBag,
  ArrowRight,
  TrendingUp,
  Package,
  Handshake,
} from "lucide-react";
import { Section } from "@/components/layout/section";
import { Container } from "@/components/layout/container";

const supplierSteps = [
  {
    icon: Store,
    title: "Buat program",
    description: "Pilih produk yang mau dijual lewat reseller, set harga modal, dan dapatkan kode undangan unik.",
  },
  {
    icon: Users,
    title: "Undang reseller",
    description: "Bagikan kode ke dropshipper. Mereka join, import produkmu, dan langsung bisa jual.",
  },
  {
    icon: TrendingUp,
    title: "Omzet naik",
    description: "Tiap reseller yang jual produkmu berarti lebih banyak penjualan tanpa tambah tim marketing.",
  },
];

const resellerSteps = [
  {
    icon: Handshake,
    title: "Gabung program",
    description: "Masukkan kode undangan dari supplier. Langsung aktif — tanpa approval, tanpa biaya.",
  },
  {
    icon: Package,
    title: "Import produk",
    description: "Pilih produk supplier, set harga jualmu sendiri di atas harga modal. Produk langsung muncul di katalog tokomu.",
  },
  {
    icon: ShoppingBag,
    title: "Terima order & margin",
    description: "Pembeli order di tokomu, kamu bayar modal ke supplier, selisihnya jadi keuntunganmu.",
  },
];

export function ResellerSection() {
  return (
    <Section id="reseller" bg="alt">
      <Container>
        {/* Header */}
        <div className="mx-auto max-w-3xl text-center">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-brand-200 bg-brand-50 px-3 py-1 text-xs font-medium text-brand-700">
            <Handshake className="size-3.5" aria-hidden />
            Program Reseller
          </span>
          <h2 className="mt-3 font-display text-3xl font-semibold tracking-tight text-neutral-900 sm:text-4xl">
            Jual lebih banyak lewat{" "}
            <span className="text-gradient-brand">jaringan reseller</span>
          </h2>
          <p className="mt-4 text-lg text-neutral-600">
            Satu platform, dua peran. Kamu bisa jadi supplier yang punya jaringan dropshipper — atau jadi reseller yang jual produk orang lain tanpa modal stok.
          </p>
        </div>

        {/* Two-column: Supplier & Reseller */}
        <div className="mt-14 grid gap-6 lg:grid-cols-2">
          {/* Supplier card */}
          <div className="rounded-2xl border border-neutral-200 bg-white p-7 shadow-card">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
                <Store className="size-5" strokeWidth={2} aria-hidden />
              </div>
              <div>
                <p className="font-semibold text-neutral-900">Sebagai Supplier</p>
                <p className="text-sm text-neutral-500">Punya produk? Bangun jaringan reseller.</p>
              </div>
            </div>

            <ul className="mt-6 flex flex-col gap-5">
              {supplierSteps.map(({ icon: Icon, title, description }, i) => (
                <li key={title} className="flex gap-4">
                  <div className="relative flex flex-col items-center">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-700 text-xs font-bold">
                      {i + 1}
                    </span>
                    {i < supplierSteps.length - 1 && (
                      <span className="mt-1 h-full w-px bg-neutral-100" aria-hidden />
                    )}
                  </div>
                  <div className="pb-5">
                    <p className="font-medium text-neutral-900">{title}</p>
                    <p className="mt-1 text-sm leading-relaxed text-neutral-500">{description}</p>
                  </div>
                </li>
              ))}
            </ul>

            <div className="mt-2 rounded-xl bg-brand-50 px-4 py-3 text-sm text-brand-700">
              💡 Reseller jual di toko mereka sendiri — pembeli tidak tahu produk dari kamu.
            </div>
          </div>

          {/* Reseller card */}
          <div className="rounded-2xl border border-neutral-200 bg-white p-7 shadow-card">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
                <Users className="size-5" strokeWidth={2} aria-hidden />
              </div>
              <div>
                <p className="font-semibold text-neutral-900">Sebagai Reseller</p>
                <p className="text-sm text-neutral-500">Tidak punya produk? Jual punya orang lain.</p>
              </div>
            </div>

            <ul className="mt-6 flex flex-col gap-5">
              {resellerSteps.map(({ icon: Icon, title, description }, i) => (
                <li key={title} className="flex gap-4">
                  <div className="relative flex flex-col items-center">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-700 text-xs font-bold">
                      {i + 1}
                    </span>
                    {i < resellerSteps.length - 1 && (
                      <span className="mt-1 h-full w-px bg-neutral-100" aria-hidden />
                    )}
                  </div>
                  <div className="pb-5">
                    <p className="font-medium text-neutral-900">{title}</p>
                    <p className="mt-1 text-sm leading-relaxed text-neutral-500">{description}</p>
                  </div>
                </li>
              ))}
            </ul>

            <div className="mt-2 rounded-xl bg-brand-50 px-4 py-3 text-sm text-brand-700">
              💡 Tidak perlu stok — supplier yang kemas dan kirim langsung ke pembelimu.
            </div>
          </div>
        </div>

        {/* CTA */}
        <div className="mt-10 flex flex-col items-center gap-4 text-center sm:flex-row sm:justify-center">
          <Link
            href="/login"
            className="inline-flex items-center gap-2 rounded-lg bg-brand-700 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-brand-800"
          >
            Mulai gratis sekarang
            <ArrowRight className="size-4" aria-hidden />
          </Link>
          <p className="text-sm text-neutral-500">
            Fitur reseller tersedia di plan Pro & Bisnis
          </p>
        </div>
      </Container>
    </Section>
  );
}
