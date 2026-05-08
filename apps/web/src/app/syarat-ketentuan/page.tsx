import type { Metadata } from "next";
import Link from "next/link";

import { Container } from "@/components/layout/container";
import { Header } from "@/components/layout/header";
import { getMe } from "@/lib/server-auth";

export const metadata: Metadata = {
  title: "Syarat & Ketentuan — SellOn",
  description:
    "Syarat dan Ketentuan penggunaan platform SellOn untuk UMKM Indonesia.",
};

const lastUpdated = "8 Mei 2026";

export default async function SyaratKetentuanPage() {
  const me = await getMe();

  return (
    <>
      <Header me={me} />
      <main className="py-12 lg:py-16">
        <Container>
          <article className="mx-auto max-w-3xl">
            <header className="mb-10">
              <p className="text-sm font-medium text-brand-600">Dokumen Hukum</p>
              <h1 className="mt-2 font-display text-4xl font-semibold tracking-tight text-neutral-900 sm:text-5xl">
                Syarat &amp; Ketentuan
              </h1>
              <p className="mt-4 text-neutral-600">
                Terakhir diperbarui: {lastUpdated}
              </p>

              <div className="mt-6 rounded-lg border border-warning/40 bg-warning/10 p-4 text-sm text-neutral-800">
                <p className="font-medium">
                  Dokumen ini adalah draft awal.
                </p>
                <p className="mt-1 text-neutral-700">
                  Sebelum dipublikasikan untuk umum, mohon ditinjau oleh kuasa
                  hukum yang memahami regulasi e-commerce dan PJP (Penyedia
                  Jasa Pembayaran) di Indonesia.
                </p>
              </div>
            </header>

            <div className="space-y-10 text-neutral-800">
              <Section number="1" title="Definisi">
                <p>
                  Dalam Syarat &amp; Ketentuan ini:
                </p>
                <ul className="mt-3 list-disc space-y-1 pl-6">
                  <li>
                    <strong>&ldquo;SellOn&rdquo;</strong>, <strong>&ldquo;kami&rdquo;</strong>, atau <strong>&ldquo;Platform&rdquo;</strong> adalah layanan perangkat lunak yang dioperasikan oleh PT SellOn Indonesia (atau entitas hukum yang menjadi penerusnya).
                  </li>
                  <li>
                    <strong>&ldquo;Penjual&rdquo;</strong> atau <strong>&ldquo;Anda&rdquo;</strong> adalah pemilik usaha (individu atau badan usaha) yang menggunakan SellOn untuk menerima pesanan.
                  </li>
                  <li>
                    <strong>&ldquo;Pembeli&rdquo;</strong> adalah pihak yang melakukan pembelian dari Penjual melalui katalog yang dibuat di SellOn.
                  </li>
                  <li>
                    <strong>&ldquo;PJP&rdquo;</strong> adalah Penyedia Jasa Pembayaran yang berlisensi dari Bank Indonesia (mis. Midtrans, Xendit) yang akun-nya didaftarkan oleh Penjual sendiri.
                  </li>
                </ul>
              </Section>

              <Section number="2" title="Penerimaan Syarat">
                <p>
                  Dengan mendaftar, mengakses, atau menggunakan SellOn, Anda menyatakan telah membaca, memahami, dan menyetujui untuk terikat pada Syarat &amp; Ketentuan ini, termasuk pembaruan-nya. Jika Anda tidak menyetujui, mohon untuk tidak menggunakan layanan kami.
                </p>
              </Section>

              <Section number="3" title="Layanan SellOn">
                <p>
                  SellOn adalah perangkat lunak yang membantu Penjual untuk:
                </p>
                <ul className="mt-3 list-disc space-y-1 pl-6">
                  <li>Membuat dan membagikan katalog produk via WhatsApp;</li>
                  <li>Menerima pesanan dan mengelola status pengiriman;</li>
                  <li>Menghubungkan akun PJP milik Penjual untuk menerima pembayaran QRIS;</li>
                  <li>Mengirim notifikasi otomatis ke Pembeli via WhatsApp.</li>
                </ul>
                <p className="mt-3">
                  SellOn adalah <strong>fasilitator perangkat lunak</strong>, bukan marketplace dan bukan PJP. Kami tidak pernah memegang dana Pembeli.
                </p>
              </Section>

              <Section number="4" title="Akun & Pendaftaran">
                <p>
                  Untuk menggunakan SellOn, Anda harus membuat akun dengan informasi yang akurat dan terkini. Anda bertanggung jawab penuh atas keamanan kredensial akun Anda dan semua aktivitas yang terjadi di dalamnya.
                </p>
                <p className="mt-3">
                  Akun SellOn saat ini dapat dibuat melalui sign-in dengan akun Google Anda. Dengan masuk, Anda mengizinkan kami untuk membaca alamat email, nama, dan foto profil Anda dari Google.
                </p>
              </Section>

              <Section number="5" title="Pemrosesan Pembayaran (Model Fasilitator)">
                <p>
                  SellOn tidak menerima, menyimpan, atau menyalurkan dana Pembeli. Pembayaran QRIS, virtual account, atau metode lainnya diproses oleh PJP yang akun-nya didaftarkan oleh Penjual sendiri (mis. Midtrans atau Xendit milik Penjual).
                </p>
                <p className="mt-3">
                  Konsekuensinya:
                </p>
                <ul className="mt-3 list-disc space-y-1 pl-6">
                  <li>Dana hasil penjualan masuk langsung ke rekening Penjual yang terdaftar di PJP, sesuai jadwal settlement PJP tersebut;</li>
                  <li>Sengketa pembayaran (refund, chargeback, dispute) ditangani sesuai prosedur PJP, dan Penjual bertanggung jawab atas resolusinya;</li>
                  <li>SellOn tidak berwenang menahan, membekukan, atau mengembalikan dana Pembeli.</li>
                </ul>
              </Section>

              <Section number="6" title="Biaya Berlangganan">
                <p>
                  SellOn menerapkan biaya berlangganan bulanan tetap sesuai paket yang Anda pilih (Gratis, Pro, atau Bisnis). SellOn <strong>tidak</strong> mengambil komisi atau take-rate dari nilai transaksi Anda.
                </p>
                <p className="mt-3">
                  Biaya jaringan PJP (mis. fee QRIS) tetap berlaku dan dipotong langsung oleh PJP. Biaya tersebut bukan pendapatan SellOn.
                </p>
              </Section>

              <Section number="7" title="Kewajiban Penjual">
                <p>
                  Anda menjamin bahwa:
                </p>
                <ul className="mt-3 list-disc space-y-1 pl-6">
                  <li>Produk yang Anda jual adalah legal sesuai hukum Republik Indonesia;</li>
                  <li>Deskripsi produk akurat dan tidak menyesatkan;</li>
                  <li>Anda memenuhi pesanan Pembeli sesuai janji yang tertera di katalog;</li>
                  <li>Anda menjaga kerahasiaan data Pembeli dan tidak menggunakannya untuk tujuan di luar pemenuhan pesanan.</li>
                </ul>
              </Section>

              <Section number="8" title="Larangan">
                <p>
                  Anda dilarang menggunakan SellOn untuk menjual atau mempromosikan:
                </p>
                <ul className="mt-3 list-disc space-y-1 pl-6">
                  <li>Barang ilegal (narkotika, senjata tanpa izin, satwa dilindungi, dll.);</li>
                  <li>Skema piramida, judi, atau aktivitas penipuan lainnya;</li>
                  <li>Konten yang melanggar hak kekayaan intelektual pihak lain;</li>
                  <li>Konten yang melanggar SARA atau melanggar hukum yang berlaku.</li>
                </ul>
                <p className="mt-3">
                  Pelanggaran dapat berakibat penangguhan atau penghentian akun tanpa pengembalian biaya berlangganan.
                </p>
              </Section>

              <Section number="9" title="Pembatasan Tanggung Jawab">
                <p>
                  SellOn disediakan &ldquo;sebagaimana adanya&rdquo;. Sejauh diizinkan oleh hukum yang berlaku, kami tidak bertanggung jawab atas kerugian tidak langsung, kehilangan keuntungan, atau kerusakan reputasi yang timbul dari penggunaan Platform.
                </p>
                <p className="mt-3">
                  Tanggung jawab kami terbatas pada biaya berlangganan yang telah Anda bayarkan dalam 12 bulan terakhir.
                </p>
              </Section>

              <Section number="10" title="Penghentian">
                <p>
                  Anda dapat menghentikan akun kapan saja melalui pengaturan dasbor. Kami dapat menangguhkan atau menghentikan akun Anda jika terjadi pelanggaran terhadap Syarat &amp; Ketentuan ini, dengan pemberitahuan terlebih dahulu kecuali dalam keadaan darurat.
                </p>
              </Section>

              <Section number="11" title="Perubahan Syarat & Ketentuan">
                <p>
                  Kami dapat memperbarui Syarat &amp; Ketentuan ini dari waktu ke waktu. Perubahan material akan diberitahukan melalui email dan notifikasi di dasbor minimal 14 hari sebelum berlaku.
                </p>
              </Section>

              <Section number="12" title="Hukum yang Berlaku">
                <p>
                  Syarat &amp; Ketentuan ini tunduk pada hukum Republik Indonesia. Sengketa yang tidak dapat diselesaikan secara musyawarah akan diselesaikan melalui Pengadilan Negeri Jakarta Selatan.
                </p>
              </Section>

              <Section number="13" title="Kontak">
                <p>
                  Pertanyaan terkait Syarat &amp; Ketentuan ini dapat dikirim ke{" "}
                  <a
                    href="mailto:legal@sellon.id"
                    className="font-medium text-brand-600 hover:text-brand-700"
                  >
                    legal@sellon.id
                  </a>
                  .
                </p>
              </Section>
            </div>

            <div className="mt-12 border-t border-neutral-200 pt-6 text-sm text-neutral-500">
              <Link href="/" className="text-brand-600 hover:text-brand-700">
                ← Kembali ke beranda
              </Link>
            </div>
          </article>
        </Container>
      </main>
    </>
  );
}

function Section({
  number,
  title,
  children,
}: {
  number: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="scroll-mt-20">
      <h2 className="font-display text-xl font-semibold tracking-tight text-neutral-900 sm:text-2xl">
        <span className="mr-2 text-brand-600">{number}.</span>
        {title}
      </h2>
      <div className="mt-3 leading-relaxed text-neutral-700">{children}</div>
    </section>
  );
}
