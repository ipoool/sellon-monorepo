import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Container } from "@/components/layout/container";

export function Hero() {
  return (
    <section className="py-20 lg:py-28">
      <Container>
        <div className="mx-auto max-w-3xl text-center">
          <span className="inline-flex items-center rounded-full border border-brand-200 bg-brand-50 px-3 py-1 text-xs font-medium text-brand-700">
            Untuk UMKM Indonesia
          </span>
          <h1 className="mt-6 font-display text-4xl font-semibold leading-tight tracking-tight text-neutral-900 sm:text-5xl lg:text-6xl">
            Jualan via WhatsApp tanpa potongan marketplace
          </h1>
          <p className="mt-5 text-lg leading-relaxed text-neutral-600 sm:text-xl">
            Buat katalog, terima pembayaran QRIS, dan kelola pesanan UMKM-mu — semua dari satu tempat.
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link href="/dasbor">
              <Button size="lg">Mulai Gratis</Button>
            </Link>
            <Link href="#demo">
              <Button size="lg" variant="outline">
                Lihat Demo
              </Button>
            </Link>
          </div>
          <p className="mt-6 text-sm text-neutral-500">
            Gratis selamanya untuk toko kecil. Tidak butuh kartu kredit.
          </p>
        </div>
      </Container>
    </section>
  );
}
