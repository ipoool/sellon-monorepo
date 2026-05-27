import { Plus, HelpCircle } from "lucide-react";
import { Section } from "@/components/layout/section";
import { Container } from "@/components/layout/container";

const faqs = [
  {
    q: "Apakah SellOn benar-benar tanpa potongan transaksi?",
    a: "Ya. SellOn pakai model langganan bulanan tetap. Kami tidak ambil komisi dari penjualan kamu. Biaya jaringan QRIS (sekitar 0,7%) tetap ada karena itu biaya dari Bank Indonesia, bukan dari kami - dipotong langsung di sisi penyedia pembayaran, bukan masuk ke SellOn.",
  },
  {
    q: "Saya belum punya akun Midtrans. Bisa pakai SellOn?",
    a: "Bisa. Daftar SellOn dulu, kelola katalog dan pesanan. Saat siap terima pembayaran QRIS online, kami pandu kamu setup Midtrans (gratis, langsung disetujui untuk UMKM). Belum mau setup gateway? Kamu tetap bisa terima pembayaran lewat transfer bank manual atau QRIS statis - tinggal upload nomor rekening atau foto QRIS-mu.",
  },
  {
    q: "Bedanya sama jualan di Tokopedia atau Shopee?",
    a: "Di marketplace, mereka potong 5-12% setiap pesanan, ditambah biaya iklan. Di SellOn, biaya bulanan tetap (mulai Rp 0). Kamu juga punya brand toko sendiri, bukan numpang di etalase pihak lain.",
  },
  {
    q: "Bisa buat toko offline dan online sekaligus?",
    a: "Bisa. SellOn cocok untuk toko fisik yang ingin terima pesanan WhatsApp dari pelanggan luar kota - tanpa harus standby balas WA seharian. Pesanan masuk pas kamu sempat, kamu balas pas kamu siap.",
  },
  {
    q: "Bisa jual produk digital (ebook, kursus, voucher)?",
    a: "Bisa. Saat tambah produk, pilih tipe \"Digital\". Checkout otomatis melewati ongkir & alamat. Begitu pembeli bayar, link akses otomatis dikirim ke email mereka dan tampil di halaman unduhan yang aman (token unik, tidak bisa dibagi-bagi). Cocok untuk ebook, kursus online, template, kode redeem, dan sejenisnya.",
  },
  {
    q: "Data saya aman?",
    a: "Login pakai Google OAuth (standar yang dipakai aplikasi besar). Database disimpan dalam bentuk terenkripsi - kami cuma simpan email, nama, dan foto profil dari Google. Data pesanan & pembeli sepenuhnya milik kamu. Kami tidak menjualnya, tidak memakainya untuk iklan.",
  },
  {
    q: "Kalau saya berhenti langganan Pro/Bisnis, data saya hilang?",
    a: "Tidak. Akun otomatis turun ke tier Gratis dengan kuota terbatas (30 produk, 50 pesanan per bulan). Semua data pesanan, pelanggan, dan produk tetap aman - kamu bisa unduh ke file CSV kapan pun dari halaman Pesanan & Pelanggan.",
  },
];

export function Faq() {
  return (
    <Section id="faq">
      <Container>
        <div className="mx-auto max-w-3xl">
          <div className="text-center">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-brand-200 bg-brand-50 px-3 py-1 text-xs font-medium text-brand-700">
              <HelpCircle className="size-3.5" aria-hidden />
              FAQ
            </span>
            <h2 className="mt-2 font-display text-3xl font-semibold tracking-tight text-neutral-900 sm:text-4xl">
              Pertanyaan yang sering ditanyakan
            </h2>
            <p className="mt-4 text-lg text-neutral-600">
              Belum nemu jawabannya? Kirim email ke{" "}
              <a
                href="mailto:halo@sellon.id"
                className="font-medium text-brand-700 hover:text-brand-800"
              >
                halo@sellon.id
              </a>
              , dijawab dalam 1 hari kerja.
            </p>
          </div>

          <ul className="mt-12 flex flex-col gap-3">
            {faqs.map(({ q, a }) => (
              <li key={q}>
                <details className="group rounded-xl border border-neutral-200 bg-white p-5 shadow-soft transition-shadow open:shadow-card">
                  <summary className="flex cursor-pointer list-none items-start justify-between gap-4 text-left font-medium text-neutral-900 [&::-webkit-details-marker]:hidden">
                    <span>{q}</span>
                    <Plus
                      className="mt-1 size-5 shrink-0 text-neutral-500 transition-transform group-open:rotate-45"
                      aria-hidden
                    />
                  </summary>
                  <p className="mt-3 text-sm leading-relaxed text-neutral-600">
                    {a}
                  </p>
                </details>
              </li>
            ))}
          </ul>
        </div>
      </Container>
    </Section>
  );
}
