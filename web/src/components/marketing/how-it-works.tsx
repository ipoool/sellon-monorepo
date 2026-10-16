import { UserPlus, ImagePlus, Send, ArrowRight } from "lucide-react";
import Link from "next/link";
import { Container } from "@/components/layout/container";

// Same visual language as the feature explorer and the "yang bikin beda"
// band: left-aligned heading, soft tinted panel, solid icon chip. The old
// version was a centred eyebrow pill over bordered white cards with an
// oversized ghost number, which read as a different page.
const steps = [
  {
    icon: UserPlus,
    tint: "bg-brand-50",
    chip: "bg-brand-500",
    accent: "text-brand-700",
    title: "Daftar dalam 1 menit",
    description:
      "Daftar pakai email & password, verifikasi lewat kode di email. Tanpa ribet, langsung punya akun.",
    duration: "~1 menit",
    highlight: "Daftar → verifikasi → jadi.",
  },
  {
    icon: ImagePlus,
    tint: "bg-info/10",
    chip: "bg-info",
    accent: "text-info",
    title: "Bikin katalog",
    description:
      "Tambah foto produk, atur harga, dapat link katalog yang siap kamu bagikan ke mana saja — WA, Instagram, atau bio.",
    duration: "~3 menit",
    highlight: "sellon.id/toko-mu",
  },
  {
    icon: Send,
    tint: "bg-warning/10",
    chip: "bg-warning",
    accent: "text-warning",
    title: "Terima pesanan",
    description:
      "Pembeli klik link, pilih produk, bayar lewat QRIS — dana langsung masuk ke rekening kamu. Selesai.",
    duration: "Langsung",
    highlight: "Bayar → notifikasi masuk.",
  },
];

export function HowItWorks() {
  return (
    <section id="cara-kerja" className="scroll-mt-20 py-12 lg:py-16">
      <Container>
        <h2 className="font-display text-2xl font-bold tracking-[-0.015em] text-neutral-900 sm:text-3xl">
          Dari nol ke jualan online cuma{" "}
          <span className="text-brand-600">5 menit</span>
        </h2>
        <p className="mt-2 max-w-[56ch] text-[15px] leading-relaxed text-neutral-600">
          Tiga langkah singkat, tanpa istilah teknis yang bikin pusing.
        </p>

        <ol className="mt-6 grid gap-3.5 lg:grid-cols-3">
          {steps.map(
            (
              { icon: Icon, tint, chip, accent, title, description, duration, highlight },
              i,
            ) => (
              <li
                key={title}
                className={`relative overflow-hidden rounded-3xl p-6 sm:p-7 ${tint}`}
              >
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-0 bg-soft-dots opacity-60"
                  style={
                    { "--pattern-color": "oklch(0.45 0 0 / 0.07)" } as React.CSSProperties
                  }
                />
                <div className="relative">
                  <div className="flex items-center justify-between gap-3">
                    <span
                      className={`grid size-11 place-items-center rounded-2xl ${chip}`}
                    >
                      <Icon className="size-[22px] text-white" aria-hidden />
                    </span>
                    <span
                      className={`font-display text-2xl font-bold tabular-nums ${accent} opacity-40`}
                    >
                      {String(i + 1).padStart(2, "0")}
                    </span>
                  </div>

                  <p className="mt-5 text-[11px] font-bold uppercase tracking-[0.1em] text-neutral-500">
                    Langkah {i + 1} · {duration}
                  </p>
                  <h3 className="mt-1.5 font-display text-xl font-bold leading-snug tracking-[-0.01em] text-neutral-900">
                    {title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-neutral-600">
                    {description}
                  </p>
                  <p className="mt-4 inline-flex items-center gap-2 rounded-full bg-white/80 px-3 py-1.5 text-xs font-semibold text-neutral-700">
                    <span className={`size-1.5 shrink-0 rounded-full ${chip}`} />
                    {highlight}
                  </p>
                </div>
              </li>
            ),
          )}
        </ol>

        <div className="mt-7 flex flex-wrap items-center gap-x-4 gap-y-2">
          <Link
            href="/login"
            className="inline-flex items-center gap-1.5 rounded-full bg-brand-600 px-5 py-3 text-sm font-bold text-white transition-colors hover:bg-brand-700"
          >
            Mulai Gratis Sekarang
            <ArrowRight className="size-4" aria-hidden />
          </Link>
          <p className="text-xs text-neutral-500">
            Tanpa kartu kredit · Akun siap dalam 60 detik
          </p>
        </div>
      </Container>
    </section>
  );
}
