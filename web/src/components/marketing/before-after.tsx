import Link from "next/link";
import {
  MessageSquareWarning,
  NotebookPen,
  Package2,
  Coins,
  MoonStar,
  CheckCircle2,
  Sparkles,
  ArrowRight,
  Frown,
  Smile,
} from "lucide-react";
import { Section } from "@/components/layout/section";
import { Container } from "@/components/layout/container";
import { Button } from "@/components/ui/button";

const pairs = [
  {
    icon: MessageSquareWarning,
    before: 'Balas chat "Ready kak?" 100x sehari, sampai jari pegal.',
    after: "Katalog yang jawab sendiri, 24 jam non-stop.",
  },
  {
    icon: NotebookPen,
    before: "Catat orderan di buku tulis. Hilang? Tamat riwayat.",
    after: "Pesanan otomatis masuk dashboard, rapi & aman.",
  },
  {
    icon: Package2,
    before: "Hitung stok manual, sering salah, sering rugi.",
    after: "Stok berkurang otomatis tiap ada pesanan masuk.",
  },
  {
    icon: Coins,
    before: "Marketplace potong 7%+ dari tiap transaksi.",
    after: "0% potongan. Uang langsung masuk rekeningmu.",
  },
  {
    icon: MoonStar,
    before: "Pesanan masuk pas kamu tidur? Sering ke-skip.",
    after: "Pembeli bayar sendiri. Bangun-bangun, dompet tebal.",
  },
];

export function BeforeAfter() {
  return (
    <Section bg="default">
      <Container>
        <div className="mx-auto max-w-3xl text-center">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-brand-200 bg-brand-50 px-3 py-1 text-xs font-medium text-brand-700">
            <Sparkles className="size-3.5" aria-hidden />
            Bayangkan Hidupmu
          </span>
          <h2 className="mt-3 font-display text-3xl font-semibold tracking-tight text-neutral-900 sm:text-4xl">
            Toko online{" "}
            <span className="text-gradient-brand">tanpa drama</span> ini lagi
          </h2>
          <p className="mt-4 text-lg text-neutral-600">
            Jualan online seharusnya bikin senang, bukan capek. Lihat bedanya
            kalau kamu pindah dari cara lama ke SellOn.
          </p>
        </div>

        <div className="relative mx-auto mt-14 max-w-5xl">
          {/* "VS" badge in the middle on desktop */}
          <div
            aria-hidden
            className="pointer-events-none absolute left-1/2 top-12 z-10 hidden -translate-x-1/2 lg:block"
          >
            <span className="inline-flex size-12 items-center justify-center rounded-full border-2 border-brand-200 bg-white font-display text-sm font-bold text-brand-700 shadow-card">
              VS
            </span>
          </div>

          <div className="grid gap-4 lg:grid-cols-2 lg:gap-8">
            {/* BEFORE column */}
            <div className="flex flex-col gap-3 rounded-2xl border border-neutral-200 bg-neutral-50/60 p-6">
              <div className="flex items-center gap-2">
                <div className="flex size-9 items-center justify-center rounded-full bg-neutral-200 text-neutral-600">
                  <Frown className="size-5" aria-hidden />
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wider text-neutral-500">
                    Hari ini
                  </p>
                  <h3 className="font-display text-lg font-semibold text-neutral-700">
                    Jualan ngandelin chat WA
                  </h3>
                </div>
              </div>

              <ul className="mt-2 flex flex-col gap-2.5">
                {pairs.map(({ icon: Icon, before }) => (
                  <li
                    key={before}
                    className="flex items-start gap-3 rounded-lg bg-white px-3 py-2.5 text-sm text-neutral-600"
                  >
                    <Icon
                      className="mt-0.5 size-4 shrink-0 text-neutral-400"
                      aria-hidden
                    />
                    <span className="leading-relaxed">{before}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* AFTER column */}
            <div className="relative flex flex-col gap-3 rounded-2xl border border-brand-200 bg-gradient-brand-soft p-6 shadow-soft">
              <div className="flex items-center gap-2">
                <div className="flex size-9 items-center justify-center rounded-full bg-gradient-brand text-white shadow-soft">
                  <Smile className="size-5" aria-hidden />
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wider text-brand-700">
                    30 hari lagi
                  </p>
                  <h3 className="font-display text-lg font-semibold text-neutral-900">
                    Tokomu jalan sendiri
                  </h3>
                </div>
              </div>

              <ul className="mt-2 flex flex-col gap-2.5">
                {pairs.map(({ after }) => (
                  <li
                    key={after}
                    className="flex items-start gap-3 rounded-lg bg-white px-3 py-2.5 text-sm text-neutral-800"
                  >
                    <CheckCircle2
                      className="mt-0.5 size-4 shrink-0 text-brand-600"
                      aria-hidden
                    />
                    <span className="font-medium leading-relaxed">{after}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        <div className="mt-14 flex flex-col items-center gap-3 text-center">
          <p className="font-display text-xl font-semibold text-neutral-900 sm:text-2xl lg:whitespace-nowrap">
            Yang lain udah pindah. Tinggal nunggu giliranmu{" "}
            <span className="text-gradient-brand">tidur tenang</span>.
          </p>
          <Link href="/login" className="mt-2">
            <Button size="lg">
              Coba Sekarang — Gratis Selamanya
              <ArrowRight className="size-4" aria-hidden />
            </Button>
          </Link>
          <p className="text-xs text-neutral-500">
            Setup &lt;60 detik · Tanpa kartu kredit · Bisa stop kapan saja
          </p>
        </div>
      </Container>
    </Section>
  );
}
