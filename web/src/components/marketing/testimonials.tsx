"use client";

import { useEffect, useRef, useState } from "react";
import { Quote, Star, ChevronLeft, ChevronRight } from "lucide-react";
import { Section } from "@/components/layout/section";
import { Container } from "@/components/layout/container";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type Testimonial = {
  quote: string;
  name: string;
  role: string;
  city: string;
  stat: string;
  category: string;
};

const testimonials: Testimonial[] = [
  {
    quote:
      "Sebelum pakai SellOn, saya kewalahan ngurus pesanan WhatsApp satu-satu. Sekarang katalog auto, pembayaran QRIS langsung masuk, dan saya bisa fokus produksi.",
    name: "Sari Wulandari",
    role: "Pemilik Warung Bu Sari",
    city: "Yogyakarta",
    stat: "Penjualan +40%",
    category: "Makanan & Minuman",
  },
  {
    quote:
      "Bisnis kaos saya naik kelas. Pembeli bisa lihat varian, ukuran, dan stok real-time tanpa nanya berkali-kali. Order processing time turun drastis.",
    name: "Andre Pratama",
    role: "Founder",
    city: "Bandung",
    stat: "Order +3× lipat",
    category: "Fashion",
  },
  {
    quote:
      "Yang saya suka: dana langsung masuk ke rekening Mandiri saya. Tidak ada potongan tersembunyi, tidak nunggu settlement marketplace berhari-hari.",
    name: "Devi Kurniasih",
    role: "Owner Skincare Lokal",
    city: "Surabaya",
    stat: "Cashflow lebih lancar",
    category: "Kecantikan",
  },
  {
    quote:
      "Bulk upload produk via Excel itu game-changer. 200 SKU hanya 10 menit. Promo code juga gampang dipakai untuk launch produk baru.",
    name: "Bayu Setiawan",
    role: "Pengelola Toko Online",
    city: "Jakarta",
    stat: "200 produk, 10 menit",
    category: "Aksesoris",
  },
  {
    quote:
      "Halaman tokonya cantik, mobile-friendly, dan link-nya pendek. Pelanggan dari Instagram tinggal klik bio, scroll, checkout. Selesai.",
    name: "Citra Maharani",
    role: "Crafter",
    city: "Bali",
    stat: "Rate konversi 2× naik",
    category: "Kerajinan Tangan",
  },
  {
    quote:
      "Awalnya ragu karena kami tim kecil. Ternyata setup-nya 5 menit, dan customer support responsif. Sekarang dipakai untuk 2 brand sekaligus.",
    name: "Rizky Hermawan",
    role: "Co-Founder",
    city: "Semarang",
    stat: "Setup 5 menit",
    category: "Multi-brand",
  },
];

export function Testimonials() {
  const trackRef = useRef<HTMLUListElement>(null);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  // Auto-advance — pauses on hover/focus so users can read at their pace.
  useEffect(() => {
    if (paused) return;
    const t = setInterval(() => {
      setIndex((i) => (i + 1) % testimonials.length);
    }, 5500);
    return () => clearInterval(t);
  }, [paused]);

  // Whenever index changes, scroll the corresponding card into view. Native
  // scroll-snap on the parent keeps the card pinned to the start, so this
  // works at any breakpoint without per-card width math.
  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const card = track.children[index] as HTMLElement | undefined;
    if (!card) return;
    track.scrollTo({
      left: card.offsetLeft - track.offsetLeft,
      behavior: "smooth",
    });
  }, [index]);

  function go(delta: number) {
    setIndex((i) => (i + delta + testimonials.length) % testimonials.length);
  }

  return (
    <Section>
      <Container>
        <div className="mx-auto mb-10 max-w-2xl text-center">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-brand-200 bg-brand-50 px-3 py-1 text-xs font-medium text-brand-700">
            <Star className="size-3.5 fill-current" aria-hidden />
            Testimoni Pengguna
          </span>
          <h2 className="mt-3 font-display text-3xl font-semibold tracking-tight text-neutral-900 sm:text-4xl">
            Cerita dari UMKM yang sudah pakai{" "}
            <span className="text-gradient-brand">SellOn</span>
          </h2>
          <p className="mt-4 text-lg text-neutral-600">
            Ratusan seller, dari kuliner sampai craft, sudah jualan tanpa
            potongan transaksi.
          </p>
        </div>

        <div
          className="relative"
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
          onFocus={() => setPaused(true)}
          onBlur={() => setPaused(false)}
        >
          <ul
            ref={trackRef}
            className="flex snap-x snap-mandatory gap-5 overflow-x-auto scroll-smooth pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            aria-label="Testimoni pengguna SellOn"
          >
            {testimonials.map((t) => (
              <li
                key={t.name}
                className="flex w-full shrink-0 snap-start flex-col gap-5 rounded-2xl border border-neutral-200 bg-white p-7 shadow-card sm:w-[calc(50%-0.625rem)] lg:w-[calc(33.333%-0.834rem)]"
              >
                <div className="flex items-center justify-between gap-3">
                  <div
                    className="flex items-center gap-0.5 text-warning"
                    aria-label="Rating 5 dari 5"
                  >
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star
                        key={i}
                        className="size-4 fill-current"
                        aria-hidden
                      />
                    ))}
                  </div>
                  <Quote
                    className="size-7 shrink-0 text-brand-100"
                    aria-hidden
                  />
                </div>

                <p className="font-display text-base leading-relaxed text-neutral-800 sm:text-lg">
                  &ldquo;{t.quote}&rdquo;
                </p>

                <div className="mt-auto">
                  <Badge variant="brand" className="mb-3">
                    {t.stat}
                  </Badge>
                  <div className="flex items-center gap-3 border-t border-neutral-200 pt-4">
                    <Avatar name={t.name} size="md" />
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-neutral-900">
                        {t.name}
                      </p>
                      <p className="truncate text-xs text-neutral-600">
                        {t.role} · {t.city} · {t.category}
                      </p>
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>

          {/* Prev / Next buttons (overlay on lg+) */}
          <button
            type="button"
            aria-label="Testimoni sebelumnya"
            onClick={() => go(-1)}
            className="absolute -left-3 top-1/2 hidden size-10 -translate-y-1/2 items-center justify-center rounded-full border border-neutral-200 bg-white text-neutral-700 shadow-card transition-colors hover:border-brand-300 hover:text-brand-700 lg:flex"
          >
            <ChevronLeft className="size-5" aria-hidden />
          </button>
          <button
            type="button"
            aria-label="Testimoni selanjutnya"
            onClick={() => go(1)}
            className="absolute -right-3 top-1/2 hidden size-10 -translate-y-1/2 items-center justify-center rounded-full border border-neutral-200 bg-white text-neutral-700 shadow-card transition-colors hover:border-brand-300 hover:text-brand-700 lg:flex"
          >
            <ChevronRight className="size-5" aria-hidden />
          </button>
        </div>

        {/* Dot indicators */}
        <div
          className="mt-6 flex items-center justify-center gap-2"
          aria-label="Navigasi testimoni"
        >
          {testimonials.map((t, i) => (
            <button
              key={t.name}
              type="button"
              onClick={() => setIndex(i)}
              aria-label={`Lompat ke testimoni ${i + 1}`}
              className={cn(
                "h-1.5 rounded-full transition-all",
                i === index
                  ? "w-6 bg-brand-500"
                  : "w-1.5 bg-neutral-300 hover:bg-neutral-400",
              )}
            />
          ))}
        </div>
      </Container>
    </Section>
  );
}
