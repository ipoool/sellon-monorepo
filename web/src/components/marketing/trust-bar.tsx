import { Star } from "lucide-react";
import { Container } from "@/components/layout/container";

const placeholderBrands = [
  "Warung Bu Sari",
  "Toko Pakaian Aria",
  "Kopi Senja",
  "Hijab Lestari",
  "Snack Mama Eka",
];

export function TrustBar() {
  return (
    <div className="border-y border-neutral-200 bg-neutral-50 py-10">
      <Container>
        <div className="flex flex-col items-center gap-8 lg:flex-row lg:items-center lg:justify-between lg:gap-6">
          <div className="flex flex-col items-center gap-3 text-center lg:flex-row lg:gap-6 lg:text-left">
            <div>
              <p className="font-display text-2xl font-semibold tracking-tight text-neutral-900">
                1.000+ UMKM
              </p>
              <p className="text-sm text-neutral-600">jualan di SellOn</p>
            </div>
            <div className="hidden h-10 w-px bg-neutral-200 lg:block" />
            <div className="flex items-center gap-1.5">
              {[0, 1, 2, 3, 4].map((i) => (
                <Star
                  key={i}
                  className="size-5 fill-warning text-warning"
                  aria-hidden
                />
              ))}
              <span className="ml-2 text-sm font-medium text-neutral-700">
                4.9 dari 200+ ulasan
              </span>
            </div>
          </div>

          <ul className="flex flex-wrap items-center justify-center gap-x-8 gap-y-2 text-sm font-medium text-neutral-400">
            {placeholderBrands.map((b) => (
              <li key={b} className="whitespace-nowrap">
                {b}
              </li>
            ))}
          </ul>
        </div>
      </Container>
    </div>
  );
}
