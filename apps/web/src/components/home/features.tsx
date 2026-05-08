import { Container } from "@/components/layout/container";
import { Card } from "@/components/ui/card";

const features = [
  {
    title: "Katalog WhatsApp",
    description:
      "Buat katalog produk yang langsung bisa dibagikan via WhatsApp lewat link toko-mu sendiri.",
  },
  {
    title: "Pembayaran QRIS",
    description:
      "Terima QRIS dari bank atau e-wallet apa pun. Dana mengalir langsung ke rekeningmu, bukan ke kami.",
  },
  {
    title: "Manajemen Pesanan",
    description:
      "Lihat semua pesanan masuk di satu tempat. Update status, kirim resi, semua dari dasbor.",
  },
  {
    title: "Otomasi WhatsApp",
    description:
      "Konfirmasi pesanan, status pengiriman, dan reminder pembayaran terkirim otomatis ke pembeli.",
  },
  {
    title: "Laporan Harian",
    description:
      "Tahu persis penjualan hari ini, produk terlaris, dan stok yang perlu di-restock — tanpa Excel.",
  },
  {
    title: "Tanpa Potongan Transaksi",
    description:
      "Biaya bulanan tetap. Tidak ada take-rate per pesanan. Semakin laris, semakin untung.",
  },
];

export function Features() {
  return (
    <section id="fitur" className="scroll-mt-20 py-20 lg:py-24">
      <Container>
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="font-display text-3xl font-semibold tracking-tight text-neutral-900 sm:text-4xl">
            Semua yang UMKM butuhkan untuk jualan online
          </h2>
          <p className="mt-4 text-lg text-neutral-600">
            Dirancang untuk toko kecil yang tumbuh, tanpa kerumitan marketplace.
          </p>
        </div>

        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => (
            <Card key={f.title}>
              <h3 className="font-semibold text-neutral-900">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-neutral-600">
                {f.description}
              </p>
            </Card>
          ))}
        </div>
      </Container>
    </section>
  );
}
