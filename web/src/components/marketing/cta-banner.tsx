import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Container } from "@/components/layout/container";
import { Button } from "@/components/ui/button";

export function CtaBanner() {
  return (
    <div className="py-16 lg:py-20">
      <Container>
        <div className="relative overflow-hidden rounded-2xl bg-gradient-brand px-8 py-14 text-center shadow-popout sm:px-14 sm:py-16">
          <div
            className="absolute inset-0 opacity-20"
            aria-hidden
            style={{
              backgroundImage:
                "radial-gradient(circle, rgba(255,255,255,0.4) 1px, transparent 1px)",
              backgroundSize: "20px 20px",
            }}
          />
          <div className="relative mx-auto max-w-3xl">
            <h2 className="font-display text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              Kelola seluruh tokomu dari satu aplikasi.
            </h2>
            <p className="mt-4 text-lg text-white/90">
              Toko online, kasir, dapur, &amp; stok — mulai gratis, naik kelas
              saat tokomu tumbuh. Tanpa potongan per transaksi.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link href="/login">
                <Button
                  size="lg"
                  variant="secondary"
                  className="bg-white text-brand-700 hover:bg-neutral-100"
                >
                  Mulai Gratis
                  <ArrowRight className="size-4" aria-hidden />
                </Button>
              </Link>
              <Link href="/#harga">
                <Button
                  size="lg"
                  variant="ghost"
                  className="text-white hover:bg-white/10"
                >
                  Lihat Paket Harga
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </Container>
    </div>
  );
}
