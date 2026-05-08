import { Plus } from "lucide-react";
import { Section } from "@/components/layout/section";
import { Container } from "@/components/layout/container";

const faqs = [
  {
    q: "Apakah SellOn benar-benar tanpa potongan transaksi?",
    a: "Ya. SellOn pakai model langganan bulanan tetap. Kami tidak mengambil komisi dari penjualan-mu. Biaya jaringan QRIS (sekitar 0.7%) tetap ada karena itu fee dari Bank Indonesia, bukan dari kami — dan langsung dipotong di sisi PJP, bukan masuk ke kami.",
  },
  {
    q: "Saya belum punya akun Midtrans/Xendit. Bisa pakai SellOn?",
    a: "Bisa. Kamu daftar SellOn dulu, kelola katalog dan pesanan. Saat siap menerima pembayaran QRIS, kami akan pandu setup Midtrans/Xendit (gratis, langsung verified untuk UMKM).",
  },
  {
    q: "Bedanya dengan jualan di Tokopedia atau Shopee?",
    a: "Di marketplace, mereka potong 5–12% dari setiap pesanan + biaya iklan. Di SellOn, biaya bulanan tetap (mulai Rp 0). Plus, kamu punya brand toko sendiri, bukan numpang di etalase orang lain.",
  },
  {
    q: "Bisa buat toko offline dan online sekaligus?",
    a: "Bisa banget. SellOn cocok untuk toko fisik yang ingin terima pesanan WhatsApp dari pelanggan luar kota tanpa harus on-call setiap saat.",
  },
  {
    q: "Data saya aman?",
    a: "Login pakai Google OAuth (standar enterprise). Database di-encrypt at rest, kami hanya menyimpan email, nama, dan foto profil dari Google. Data pesanan dan pembeli sepenuhnya milik kamu — kami tidak menjualnya, tidak menggunakannya untuk iklan.",
  },
  {
    q: "Kalau saya berhenti langganan, data saya hilang?",
    a: "Tidak. Akun masuk mode read-only selama 90 hari, kamu bisa export semua data (CSV) sebelum dihapus. Setelah 90 hari, data dihapus permanen sesuai standar privasi.",
  },
];

export function Faq() {
  return (
    <Section id="faq">
      <Container>
        <div className="mx-auto max-w-3xl">
          <div className="text-center">
            <p className="text-sm font-medium text-brand-600">FAQ</p>
            <h2 className="mt-2 font-display text-3xl font-semibold tracking-tight text-neutral-900 sm:text-4xl">
              Pertanyaan yang sering ditanyakan
            </h2>
            <p className="mt-4 text-lg text-neutral-600">
              Tidak nemu jawaban-mu? Kirim email ke{" "}
              <a
                href="mailto:halo@sellon.id"
                className="font-medium text-brand-600 hover:text-brand-700"
              >
                halo@sellon.id
              </a>
              .
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
