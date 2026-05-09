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
  // 1-5; halves allowed (e.g., 4.5). We render integer fills + a half star
  // when needed so ratings don't all feel like a uniform 5/5.
  rating: number;
};

const testimonials: Testimonial[] = [
  {
    quote:
      "Saya tuh awalnya gaptek banget, takut ribet. Eh ternyata daftarnya cuma login Google, langsung jadi. Sekarang kalau ada pesanan masuk, WA langsung bunyi—gak perlu nyatat di buku lagi kayak dulu.",
    name: "Bu Sari",
    role: "Jualan keripik & sambel rumahan",
    city: "Yogyakarta",
    stat: "Pesanan jadi rapi",
    category: "Makanan rumahan",
    rating: 5,
  },
  {
    quote:
      "Dulu saya cape banget jawab “ada size M nggak?” tiap hari. Sekarang pembeli liat sendiri stok di link toko, tinggal pilih sendiri. Saya tinggal nyiapin paket. Lebih tenang.",
    name: "Andre",
    role: "Bikin kaos lokal",
    city: "Bandung",
    stat: "Lebih hemat waktu",
    category: "Fashion",
    rating: 4,
  },
  {
    quote:
      "Alasan saya pindah dari marketplace ya soal potongan, jujur. Di sini pembeli bayar QRIS, duitnya langsung masuk ke rekening saya hari itu juga. Buat usaha kecil, cashflow yang lancar itu segalanya.",
    name: "Mbak Devi",
    role: "Skincare batch kecil",
    city: "Surabaya",
    stat: "Tanpa potongan transaksi",
    category: "Kecantikan",
    rating: 5,
  },
  {
    quote:
      "Saya punya 200-an varian. Awalnya udah pasrah harus input satu-satu, eh ternyata bisa upload pakai Excel. Sambil nungguin anak tidur saya selesain. Beneran cepet.",
    name: "Pak Bayu",
    role: "Toko aksesoris HP",
    city: "Jakarta",
    stat: "200 produk, 1 sore",
    category: "Aksesoris",
    rating: 4.5,
  },
  {
    quote:
      "Customer saya kebanyakan dari Instagram, jadi link toko penting banget. Tampilannya bersih di HP, ibu saya yang udah 60 tahun aja bisa scroll & order sendiri. Itu udah cukup buat saya.",
    name: "Citra",
    role: "Crafter rajut & macrame",
    city: "Denpasar",
    stat: "Mudah buat semua umur",
    category: "Kerajinan tangan",
    rating: 5,
  },
  {
    quote:
      "Tim saya kecil, cuma 4 orang. Tadinya takut ribet adopsi tools baru. Tapi malah istri saya yang ngajarin temennya pakai—sekarang ada 3 teman saya yang ikut pindah ke sini.",
    name: "Mas Rizky",
    role: "Pengelola 2 brand",
    city: "Semarang",
    stat: "Setup-nya gampang",
    category: "Multi-brand",
    rating: 4,
  },
];

function StarRating({ value }: { value: number }) {
  // Render 5 star "slots" — each is an empty outline overlaid by a clipped
  // filled star whose width matches the rating. Half stars work via the
  // 0.5 fractional fill on the relevant slot.
  const clamped = Math.max(0, Math.min(5, value));
  return (
    <div
      className="inline-flex items-center gap-0.5"
      aria-label={`Rating ${clamped} dari 5`}
    >
      {Array.from({ length: 5 }).map((_, i) => {
        const slotFill = Math.max(0, Math.min(1, clamped - i));
        return (
          <span key={i} className="relative inline-block size-4">
            <Star
              className="absolute inset-0 size-4 text-neutral-300"
              aria-hidden
            />
            {slotFill > 0 && (
              <span
                className="absolute inset-y-0 left-0 overflow-hidden"
                style={{ width: `${slotFill * 100}%` }}
                aria-hidden
              >
                <Star className="size-4 fill-warning text-warning" aria-hidden />
              </span>
            )}
          </span>
        );
      })}
    </div>
  );
}

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
                  <StarRating value={t.rating} />
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
