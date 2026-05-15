import { ShieldCheck, Wallet, Zap } from "lucide-react";
import { Container } from "@/components/layout/container";

// Replaced fake user-count + brand logos with factual product claims.
// Real social proof goes in <Testimonials />; this row is for fast
// "why trust us" signals that are true on day one.
const trustPoints = [
  {
    icon: Wallet,
    title: "Uang langsung ke rekening kamu",
    description: "Bukan ditahan platform - kamu pegang penuh kendalinya.",
  },
  {
    icon: Zap,
    title: "Setup kurang dari 5 menit",
    description: "Login Google, foto produk, link toko langsung jadi.",
  },
  {
    icon: ShieldCheck,
    title: "Tanpa kontrak, bisa stop kapan saja",
    description: "Bulanan & tahunan - tidak ada penalti kalau berhenti.",
  },
];

export function TrustBar() {
  return (
    <div className="border-y border-neutral-200 bg-neutral-50 py-10">
      <Container>
        <ul className="grid gap-6 sm:grid-cols-3">
          {trustPoints.map(({ icon: Icon, title, description }) => (
            <li
              key={title}
              className="flex items-start gap-3 text-left"
            >
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                <Icon className="size-5" aria-hidden />
              </span>
              <div>
                <p className="text-sm font-semibold text-neutral-900">
                  {title}
                </p>
                <p className="mt-0.5 text-xs leading-relaxed text-neutral-600">
                  {description}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </Container>
    </div>
  );
}
