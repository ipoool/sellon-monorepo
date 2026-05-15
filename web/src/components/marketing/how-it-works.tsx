import { UserPlus, ImagePlus, Send, ArrowRight, Sparkles } from "lucide-react";
import Link from "next/link";
import { Section } from "@/components/layout/section";
import { Container } from "@/components/layout/container";
import { Button } from "@/components/ui/button";

const steps = [
  {
    icon: UserPlus,
    title: "Daftar dalam 1 menit",
    description:
      "Login pakai akun Google. Tidak perlu isi formulir panjang, langsung punya akun.",
    duration: "~1 menit",
    highlight: "Login → langsung jadi.",
  },
  {
    icon: ImagePlus,
    title: "Bikin katalog",
    description:
      "Tambah foto produk, atur harga, dapat link katalog yang siap kamu bagi di WhatsApp.",
    duration: "~3 menit",
    highlight: "sellon.id/toko-mu",
  },
  {
    icon: Send,
    title: "Terima pesanan",
    description:
      "Pembeli klik link, pilih produk, bayar lewat QRIS - dana langsung masuk ke rekening kamu. Selesai.",
    duration: "Langsung",
    highlight: "Bayar → notifikasi masuk.",
  },
];

export function HowItWorks() {
  return (
    <Section id="cara-kerja" bg="alt">
      <Container>
        <div className="mx-auto max-w-4xl text-center">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-brand-200 bg-brand-50 px-3 py-1 text-xs font-medium text-brand-700">
            <Sparkles className="size-3.5" aria-hidden />
            Cara Kerja
          </span>
          <h2 className="mt-3 font-display text-3xl font-semibold tracking-tight text-neutral-900 sm:text-4xl">
            Dari nol ke jualan online cuma{" "}
            <span className="text-gradient-brand">5 menit</span>
          </h2>
          <p className="mt-4 text-lg text-neutral-600 lg:whitespace-nowrap">
            Tiga langkah singkat, tanpa istilah teknis yang bikin pusing.
          </p>
        </div>

        <div className="relative mt-14">
          {/* Connecting line behind the cards on desktop */}
          <div
            aria-hidden
            className="pointer-events-none absolute left-[16.66%] right-[16.66%] top-12 hidden h-px bg-gradient-to-r from-brand-200 via-brand-300 to-brand-200 lg:block"
          />

          <ol className="relative grid gap-6 lg:grid-cols-3 lg:gap-8">
            {steps.map(({ icon: Icon, title, description, duration, highlight }, i) => (
              <li
                key={title}
                className="group relative flex flex-col gap-5 rounded-2xl border border-neutral-200 bg-white p-7 shadow-card transition-all duration-200 hover:-translate-y-1 hover:border-brand-300 hover:shadow-elevated"
              >
                {/* Oversized step number watermark */}
                <span
                  aria-hidden
                  className="pointer-events-none absolute right-5 top-3 select-none font-display text-[5rem] font-bold leading-none text-brand-50 transition-colors group-hover:text-brand-100"
                >
                  {String(i + 1).padStart(2, "0")}
                </span>

                {/* Icon badge with gradient brand background */}
                <div className="relative flex size-14 items-center justify-center rounded-2xl bg-gradient-brand text-white shadow-soft ring-1 ring-brand-300/40">
                  <Icon className="size-6" strokeWidth={2} aria-hidden />
                </div>

                <div className="relative flex flex-col gap-2">
                  <span className="inline-flex w-fit items-center gap-1 rounded-full bg-neutral-100 px-2.5 py-0.5 text-[11px] font-medium uppercase tracking-wider text-neutral-600">
                    Langkah {i + 1} · {duration}
                  </span>
                  <h3 className="font-display text-xl font-semibold text-neutral-900">
                    {title}
                  </h3>
                  <p className="text-sm leading-relaxed text-neutral-600">
                    {description}
                  </p>
                  <p className="mt-1 inline-flex items-center gap-1.5 rounded-lg border border-dashed border-brand-200 bg-brand-50/50 px-2.5 py-1.5 text-xs font-medium text-brand-700">
                    <span className="size-1.5 shrink-0 rounded-full bg-brand-500" />
                    {highlight}
                  </p>
                </div>

                {/* Arrow connector to next card (desktop only, last card hidden) */}
                {i < steps.length - 1 && (
                  <div
                    aria-hidden
                    className="absolute -right-4 top-12 z-10 hidden size-8 items-center justify-center rounded-full border border-brand-200 bg-white text-brand-600 shadow-sm lg:flex"
                  >
                    <ArrowRight className="size-4" aria-hidden />
                  </div>
                )}
              </li>
            ))}
          </ol>
        </div>

        <div className="mt-12 flex flex-col items-center gap-3">
          <Link href="/login">
            <Button size="lg">
              Mulai Gratis Sekarang
              <ArrowRight className="size-4" aria-hidden />
            </Button>
          </Link>
          <p className="text-xs text-neutral-500">
            Tanpa kartu kredit · Akun siap dalam 60 detik
          </p>
        </div>
      </Container>
    </Section>
  );
}
