"use client";

import { useEffect, useRef, useState } from "react";
import { Quote } from "lucide-react";

import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

type Item = {
  quote: string;
  name: string;
  role: string;
  city: string;
};

const items: Item[] = [
  {
    quote:
      "Jualan online sekarang sesimpel kirim chat. SellOn bikin saya fokus produksi, bukan bales pesan satu-satu.",
    name: "Bu Sari",
    role: "Warung Bu Sari",
    city: "Yogyakarta",
  },
  {
    quote:
      "Dulu saya capek banget jawab “ada size M nggak?” tiap hari. Sekarang pembeli liat sendiri stok di link toko.",
    name: "Andre",
    role: "Brand kaos lokal",
    city: "Bandung",
  },
  {
    quote:
      "Yang bikin saya pindah dari marketplace itu ya soal potongan. Di sini, dana langsung masuk ke rekening saya hari yang sama.",
    name: "Mbak Devi",
    role: "Skincare batch kecil",
    city: "Surabaya",
  },
  {
    quote:
      "Saya punya 200-an varian. Sambil nungguin anak tidur, semuanya selesai upload pakai Excel. Beneran cepet.",
    name: "Pak Bayu",
    role: "Toko aksesoris HP",
    city: "Jakarta",
  },
  {
    quote:
      "Customer saya kebanyakan dari Instagram. Tampilannya bersih di HP, ibu saya yang udah 60 tahun aja bisa scroll & order sendiri.",
    name: "Citra",
    role: "Crafter rajut & macrame",
    city: "Denpasar",
  },
];

export function MasukTestimonial() {
  const [i, setI] = useState(0);
  const pausedRef = useRef(false);

  useEffect(() => {
    const t = setInterval(() => {
      if (pausedRef.current) return;
      setI((prev) => (prev + 1) % items.length);
    }, 5500);
    return () => clearInterval(t);
  }, []);

  return (
    <div
      className="relative"
      onMouseEnter={() => {
        pausedRef.current = true;
      }}
      onMouseLeave={() => {
        pausedRef.current = false;
      }}
    >
      {/* Stack the cards in the same place; cross-fade between them. */}
      <div className="relative">
        {items.map((item, idx) => (
          <div
            key={item.name}
            className={cn(
              "rounded-2xl border border-white/60 bg-white/80 p-8 shadow-popout backdrop-blur transition-opacity duration-500",
              idx === i
                ? "relative opacity-100"
                : "pointer-events-none absolute inset-0 opacity-0",
            )}
            aria-hidden={idx === i ? undefined : true}
          >
            <Quote className="size-8 text-brand-300" aria-hidden />
            <p className="mt-4 font-display text-xl font-medium leading-relaxed text-neutral-900">
              &ldquo;{item.quote}&rdquo;
            </p>
            <div className="mt-6 flex items-center gap-3">
              <Avatar name={item.name} size="md" />
              <div>
                <p className="text-sm font-semibold text-neutral-900">
                  {item.name}
                </p>
                <p className="text-xs text-neutral-600">
                  {item.role} · {item.city}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Pagination dots */}
      <div
        className="mt-4 flex items-center justify-center gap-0"
        role="tablist"
        aria-label="Testimoni"
      >
        {items.map((it, idx) => (
          <button
            key={it.name}
            type="button"
            role="tab"
            aria-selected={idx === i}
            aria-label={`Testimoni ${idx + 1}`}
            onClick={() => setI(idx)}
            className="p-3"
          >
            <span
              className={cn(
                "block h-1.5 rounded-full transition-all",
                idx === i
                  ? "w-6 bg-brand-500"
                  : "w-1.5 bg-white/70 hover:bg-white",
              )}
            />
          </button>
        ))}
      </div>
    </div>
  );
}
