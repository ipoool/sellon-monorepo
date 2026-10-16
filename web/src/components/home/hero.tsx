import { ArrowRight, Check } from "lucide-react";

import { Container } from "@/components/layout/container";
import { HOME_FEATURES } from "@/lib/home-features";

const PROMISES = [
  "Gratis selamanya",
  "Tanpa potongan per pesanan",
  "Siap jualan 5 menit",
];

/**
 * Home hero.
 *
 * The slug field is the hero's primary action, not decoration: typing a name
 * and pressing the button is the first real step of signup, so the "siap 5
 * menit" claim is something the visitor touches instead of reads. It posts to
 * /login, where the value is picked up after sign-in.
 */
export function Hero() {
  return (
    <section className="relative overflow-hidden">
      {/* Brand-hue wash. Sits behind content and never intercepts a click. */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-[-320px] h-[700px] w-[1500px] -translate-x-1/2"
        style={{
          background:
            "radial-gradient(ellipse at center, oklch(0.94 0.06 145 / 0.55) 0%, oklch(0.97 0.025 145 / 0.45) 45%, oklch(1 0 0 / 0) 72%)",
        }}
      />
      <Container>
        <div className="relative pb-10 pt-12 text-center lg:pt-14">
          <h1 className="mx-auto font-display text-[34px] font-bold leading-[1.1] tracking-[-0.02em] text-neutral-900 sm:text-5xl lg:text-[56px] lg:tracking-[-0.022em]">
            Bukan Sekadar Jualan di Chat.
            <br />
            <span className="text-brand-600">Ini Toko Milikmu Sendiri.</span>
          </h1>

          <p className="mx-auto mt-4 max-w-[62ch] text-[15px] leading-relaxed text-neutral-600 sm:text-base">
            Toko online, kasir POS, stok, sampai pembayaran QRIS — semua dalam
            satu aplikasi.
            <br />
            Dana masuk ke rekeningmu sendiri, tanpa potongan per transaksi.
          </p>

          <form
            action="/login"
            className="mx-auto mt-7 flex max-w-[560px] items-center gap-2 rounded-2xl border border-neutral-200 bg-white p-2 pl-4 shadow-elevated sm:rounded-full sm:pl-5"
          >
            <label htmlFor="slug" className="sr-only">
              Alamat toko yang kamu inginkan
            </label>
            <span
              aria-hidden
              className="hidden shrink-0 text-[15px] font-medium text-neutral-400 sm:inline"
            >
              sellon.id/
            </span>
            <input
              id="slug"
              name="slug"
              type="text"
              autoComplete="off"
              placeholder="namatokomu"
              className="min-w-0 flex-1 bg-transparent text-[15px] font-semibold text-neutral-900 outline-none placeholder:font-normal placeholder:text-neutral-400"
            />
            <button
              type="submit"
              className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-brand-600 px-4 py-3 text-sm font-bold text-white transition-colors hover:bg-brand-700 sm:px-5"
            >
              Buka Toko Gratis
              <ArrowRight className="size-4" aria-hidden />
            </button>
          </form>

          <ul className="mt-4 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-[13px] text-neutral-600">
            {PROMISES.map((p) => (
              <li key={p} className="inline-flex items-center gap-1.5">
                <Check className="size-3.5 text-brand-600" aria-hidden />
                {p}
              </li>
            ))}
          </ul>

          {/* Entry points. Each one scrolls to the explorer below and opens
              the panel that explains exactly the area the chip named — the
              icon is the whole target, so the chip stays readable at 2-up on
              a phone. */}
          <nav
            aria-label="Area produk"
            className="mx-auto mt-10 grid max-w-[760px] grid-cols-3 gap-x-2 gap-y-5 sm:grid-cols-6"
          >
            {HOME_FEATURES.map(({ icon: Icon, label, key, chip }) => (
              // Plain anchor, not next/link: a Link to a hash does a
              // client-side route update, which does NOT fire `hashchange`,
              // so the explorer would scroll into view on the wrong panel.
              <a
                key={key}
                href={`#fitur-${key}`}
                className="group flex flex-col items-center gap-2 text-center"
              >
                <span
                  className={`grid size-14 place-items-center rounded-2xl text-white shadow-soft transition-transform duration-200 ease-out group-hover:-translate-y-1.5 group-hover:scale-105 group-focus-visible:-translate-y-1.5 motion-reduce:transition-none motion-reduce:group-hover:translate-y-0 motion-reduce:group-hover:scale-100 ${chip}`}
                >
                  <Icon className="size-6" aria-hidden />
                </span>
                <span className="text-[12.5px] font-semibold leading-tight text-neutral-700 transition-colors group-hover:text-brand-700">
                  {label}
                </span>
              </a>
            ))}
          </nav>
        </div>
      </Container>
    </section>
  );
}
