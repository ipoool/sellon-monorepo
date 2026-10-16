import { Plus } from "lucide-react";
import { Container } from "@/components/layout/container";

/**
 * Exported because app/page.tsx feeds the same questions into FAQ JSON-LD.
 * One array, not two: an answer in structured data that differs from the one
 * on the page is exactly the mismatch Google penalises, and a second copy
 * drifts the first time either is edited.
 *
 * No competitor's fee percentage appears here on purpose: we have not
 * verified one, and the argument does not need it (see PRODUCT.md).
 */
export const FAQ_ITEMS = [
  {
    q: "Apakah SellOn benar-benar tanpa potongan transaksi?",
    a: "Ya. SellOn pakai langganan bulanan yang angkanya tetap, dan kami tidak mengambil komisi dari penjualanmu — berapa pun omzetmu, yang kamu bayar ke kami sama. Biaya yang tetap ada cuma milik penyedia pembayaran (misalnya tarif QRIS yang diatur Bank Indonesia), dipotong di sisi mereka dan tidak pernah masuk ke SellOn.",
  },
  {
    q: "Bedanya sama jualan di Tokopedia atau Shopee?",
    a: "Di marketplace kamu berjualan di etalase milik orang lain: ada komisi per pesanan, dan daftar pembelimu bukan milikmu. Di SellOn kamu punya alamat toko sendiri, pembelimu adalah kontakmu sendiri, dan uangnya masuk langsung ke rekening atau akun Midtrans-mu. Kami tidak pernah memegang dana pembeli.",
  },
  {
    q: "Bagaimana cara daftarnya?",
    a: "Paling cepat lewat akun Google — satu klik, tidak perlu bikin password baru, langsung bisa isi nama toko. Setelah itu kamu sudah punya link toko yang bisa langsung dibagikan, bahkan sebelum produk pertamamu diunggah.",
  },
  {
    q: "Saya belum punya akun Midtrans. Bisa pakai SellOn?",
    a: "Bisa. Daftar dulu, kelola katalog dan pesanan seperti biasa. Belum mau pasang payment gateway? Kamu tetap bisa terima transfer bank manual atau QRIS statis — tinggal pasang nomor rekening atau foto QRIS-mu, dan pembeli mengunggah bukti transfernya di halaman pesanan. Saat siap, kami pandu menghubungkan Midtrans.",
  },
  {
    q: "Bisa buat toko offline dan online sekaligus?",
    a: "Bisa, dan ini salah satu kekuatan SellOn. Toko online, kasir POS di konter, pesan lewat QR di meja, sampai layar dapur (KDS) berjalan di atas satu katalog dan satu angka stok. Terjual di konter, stok di toko online ikut berkurang detik itu juga — tidak ada dua pembukuan yang saling berbeda.",
  },
  {
    q: "Kalau internet di toko mati, kasirnya ikut mati?",
    a: "Tidak. Mode kasir bisa tetap melayani transaksi tanpa koneksi: pesanan tersimpan di perangkat dan tersinkron sendiri begitu sinyal kembali, dengan pengaman supaya satu pesanan tidak pernah tercatat dua kali. Saat offline, pembayaran dibatasi tunai karena metode lain memang butuh koneksi.",
  },
  {
    q: "Bisa jual produk digital atau kelas online?",
    a: "Bisa. Pilih tipe produk \"Digital\" atau \"Kelas\", dan checkout otomatis melewati ongkir & alamat. Begitu pembayaran lunas, pembeli dapat akses yang terkunci ke email mereka sendiri — bukan link yang bisa diteruskan ke orang lain. Masa aktifnya kamu yang tentukan: selamanya, atau hitungan minggu, bulan, dan tahun.",
  },
  {
    q: "Bisa pakai alamat domain toko sendiri?",
    a: "Bisa, di paket Bisnis. Arahkan domainmu ke SellOn dan tokomu tampil di alamat itu, lengkap dengan HTTPS yang dipasang otomatis. Kalau belum punya domain, kamu tetap dapat alamat sellon.id/namatokomu sejak hari pertama.",
  },
  {
    q: "Sudah ada aplikasi HP-nya?",
    a: "Belum — aplikasi Android dan iOS masih kami kerjakan. Untuk sekarang semuanya sudah bisa dijalankan lewat browser HP tanpa install apa pun, dan pembelimu juga tidak perlu install aplikasi untuk belanja di tokomu.",
  },
  {
    q: "Data saya aman?",
    a: "Data pesanan, pembeli, dan produk sepenuhnya milikmu: kami tidak menjualnya dan tidak memakainya untuk iklan. Pembayaran berjalan lewat akun payment gateway-mu sendiri, jadi data kartu dan dana pembeli tidak pernah lewat SellOn. Ada juga catatan aktivitas supaya kamu tahu siapa di timmu yang mengubah apa.",
  },
  {
    q: "Kalau saya berhenti langganan Pro/Bisnis, data saya hilang?",
    a: "Tidak. Akun turun ke paket Gratis dengan kuota terbatas, tapi semua data pesanan, pelanggan, dan produk tetap ada — dan bisa kamu unduh ke CSV kapan pun dari halaman Pesanan & Pelanggan.",
  },
];

export function Faq() {
  return (
    <section id="faq" className="scroll-mt-20 py-12 lg:py-16">
      <Container>
        <h2 className="font-display text-2xl font-bold tracking-[-0.015em] text-neutral-900 sm:text-3xl">
          Pertanyaan yang sering ditanyakan
        </h2>
        <p className="mt-2 max-w-[56ch] text-[15px] leading-relaxed text-neutral-600">
          Belum nemu jawabannya? Kirim email ke{" "}
          <a
            href="mailto:halo@sellon.id"
            className="font-semibold text-brand-700 underline-offset-2 hover:underline"
          >
            halo@sellon.id
          </a>
          , dijawab dalam 1 hari kerja.
        </p>

        {/* Two columns so eleven questions do not become another long scroll.
            `items-start` keeps an opened answer from stretching its neighbour. */}
        <ul className="mt-6 grid items-start gap-3 lg:grid-cols-2">
          {FAQ_ITEMS.map(({ q, a }) => (
            <li key={q}>
              <details className="group rounded-2xl border border-neutral-200 bg-white p-5 transition-colors hover:border-neutral-300 open:border-brand-200 open:bg-brand-50">
                <summary className="flex cursor-pointer list-none items-start justify-between gap-4 text-left text-[15px] font-bold text-neutral-900 [&::-webkit-details-marker]:hidden">
                  <span>{q}</span>
                  <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-neutral-100 text-neutral-500 transition-transform group-open:rotate-45 group-open:bg-white group-open:text-brand-700">
                    <Plus className="size-4" aria-hidden />
                  </span>
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-neutral-600">
                  {a}
                </p>
              </details>
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}
