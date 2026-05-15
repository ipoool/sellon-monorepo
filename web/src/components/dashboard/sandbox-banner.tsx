import Link from "next/link";
import { FlaskConical, ArrowRight } from "lucide-react";

type Props = {
  // Visible kalau seller punya gateway Midtrans yang dikonfigurasi
  // dengan kunci sandbox (bukan production). Parent menentukan; banner
  // tidak fetch ulang.
  visible: boolean;
};

// Persistent kuning banner di seluruh dasbor saat seller pakai Midtrans
// mode Sandbox. Pesannya: ini bukan untuk live, hanya testing — supaya
// seller gak sadar-sadar live-kan order tapi pembayaran nyangkut di
// sandbox. Style sama persis dengan ImpersonationBanner (sticky top,
// z-tinggi, ada CTA di kanan), beda hanya warna.
export function SandboxBanner({ visible }: Props) {
  if (!visible) return null;

  return (
    <div
      role="alert"
      // Soft warning: kuning krem solid (opaque, bukan transparent
      // tint) supaya banner tetap kontras di atas konten apapun. OKLCH
      // L=0.97 + chroma rendah = cream pastel mendekati #fef6e2.
      // Stack di bawah impersonation (z-60) dan expiry (z-55) → z-50.
      className="sticky top-[calc(var(--imp-h,0px)+var(--exp-h,0px))] z-[50] flex flex-col gap-1 border-b border-[oklch(0.86_0.10_75)] bg-[oklch(0.97_0.04_75)] px-4 py-2 text-neutral-800 sm:flex-row sm:items-center sm:gap-3"
    >
      <div className="flex items-center gap-2 text-neutral-900">
        <FlaskConical className="size-4 shrink-0 text-warning" aria-hidden />
        <p className="text-sm font-semibold">Midtrans Mode Sandbox</p>
      </div>
      <p className="flex-1 text-sm">
        Pembayaran saat ini pakai{" "}
        <span className="font-semibold">kunci Sandbox</span> — hanya untuk
        testing, <strong>bukan</strong> untuk transaksi live. Order yang
        masuk lewat checkout tidak akan men-charge pembeli sungguhan.
      </p>
      <Link
        href="/settings/payment"
        className="inline-flex h-8 items-center gap-1.5 self-start rounded-md border border-[oklch(0.86_0.10_75)] bg-white px-3 text-sm font-semibold text-neutral-900 transition-colors hover:border-warning hover:bg-[oklch(0.95_0.06_75)] sm:self-auto"
      >
        Atur ke Production
        <ArrowRight className="size-3.5" aria-hidden />
      </Link>
    </div>
  );
}
