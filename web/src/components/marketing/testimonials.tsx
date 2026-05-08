import { Quote } from "lucide-react";
import { Section } from "@/components/layout/section";
import { Container } from "@/components/layout/container";
import { Avatar } from "@/components/ui/avatar";

export function Testimonials() {
  return (
    <Section>
      <Container>
        <div className="mx-auto max-w-3xl">
          <div className="relative rounded-2xl border border-neutral-200 bg-white p-8 shadow-card sm:p-12">
            <Quote
              className="absolute right-8 top-8 size-12 text-brand-100"
              aria-hidden
            />

            <p className="font-display text-2xl font-medium leading-relaxed text-neutral-900 sm:text-3xl">
              &ldquo;Sebelum pakai SellOn, saya kewalahan ngurus pesanan WhatsApp
              satu-satu. Sekarang katalog auto, pembayaran QRIS langsung masuk,
              dan saya bisa fokus produksi. Penjualan naik 40% dalam 2 bulan.&rdquo;
            </p>

            <div className="mt-8 flex items-center gap-4">
              <Avatar name="Sari Wulandari" size="lg" />
              <div>
                <p className="font-semibold text-neutral-900">Sari Wulandari</p>
                <p className="text-sm text-neutral-600">
                  Pemilik Warung Bu Sari · Yogyakarta
                </p>
              </div>
            </div>
          </div>
        </div>
      </Container>
    </Section>
  );
}
