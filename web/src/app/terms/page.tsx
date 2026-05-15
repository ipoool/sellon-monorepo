import Link from "next/link";

import { Container } from "@/components/layout/container";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { Badge } from "@/components/ui/badge";
import { getMe } from "@/lib/server-auth";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Syarat & Ketentuan",
  description:
    "Syarat dan Ketentuan penggunaan platform SellOn untuk seller UMKM Indonesia.",
  path: "/terms",
});

const lastUpdated = "10 Mei 2026";

const sections = [
  { id: "bagian-1", number: "1", title: "Definisi" },
  { id: "bagian-2", number: "2", title: "Penerimaan Syarat" },
  { id: "bagian-3", number: "3", title: "Layanan SellOn" },
  { id: "bagian-4", number: "4", title: "Akun & Pendaftaran" },
  { id: "bagian-5", number: "5", title: "Pemrosesan Pembayaran" },
  { id: "bagian-6", number: "6", title: "Biaya Berlangganan" },
  { id: "bagian-7", number: "7", title: "Kewajiban Penjual" },
  { id: "bagian-8", number: "8", title: "Akses Admin SellOn untuk Support" },
  { id: "bagian-9", number: "9", title: "Larangan" },
  { id: "bagian-10", number: "10", title: "Pembatasan Tanggung Jawab" },
  { id: "bagian-11", number: "11", title: "Penghentian" },
  { id: "bagian-12", number: "12", title: "Perubahan S&K" },
  { id: "bagian-13", number: "13", title: "Hukum yang Berlaku" },
  { id: "bagian-14", number: "14", title: "Kontak" },
];

export default async function SyaratKetentuanPage() {
  const me = await getMe();

  return (
    <>
      <Header me={me} />
      <main className="py-12 lg:py-16">
        <Container>
          <header className="mx-auto max-w-3xl">
            <p className="text-sm font-medium text-brand-600">Dokumen Hukum</p>
            <h1 className="mt-2 font-display text-4xl font-semibold tracking-tight text-neutral-900 sm:text-5xl">
              Syarat &amp; Ketentuan
            </h1>
            <div className="mt-4 flex items-center gap-2">
              <Badge variant="outline">Terakhir diperbarui · {lastUpdated}</Badge>
            </div>
          </header>

          <div className="mt-12 grid gap-10 lg:grid-cols-12 lg:gap-12">
            {/* Mobile TOC (collapsible) */}
            <details className="rounded-xl border border-neutral-200 bg-white p-4 lg:hidden">
              <summary className="flex cursor-pointer list-none items-center justify-between font-medium text-neutral-900 [&::-webkit-details-marker]:hidden">
                <span>Daftar Isi</span>
                <span className="text-sm text-neutral-500">{sections.length} bagian</span>
              </summary>
              <ol className="mt-4 flex flex-col gap-2 text-sm">
                {sections.map((s) => (
                  <li key={s.id}>
                    <a
                      href={`#${s.id}`}
                      className="text-neutral-600 hover:text-brand-600"
                    >
                      {s.number}. {s.title}
                    </a>
                  </li>
                ))}
              </ol>
            </details>

            {/* Desktop TOC sidebar (sticky) */}
            <aside className="hidden lg:col-span-3 lg:block">
              <nav
                aria-label="Daftar Isi"
                className="sticky top-24"
              >
                <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
                  Daftar Isi
                </p>
                <ol className="mt-4 flex flex-col gap-1.5 border-l border-neutral-200 text-sm">
                  {sections.map((s) => (
                    <li key={s.id}>
                      <a
                        href={`#${s.id}`}
                        className="-ml-px block border-l-2 border-transparent py-1 pl-4 text-neutral-600 transition-colors hover:border-brand-500 hover:text-brand-700"
                      >
                        {s.number}. {s.title}
                      </a>
                    </li>
                  ))}
                </ol>
              </nav>
            </aside>

            {/* Article content */}
            <article className="lg:col-span-9">
              <div className="space-y-12 text-neutral-800">
                <Article id="bagian-1" number="1" title="Definisi">
                  <p>Dalam Syarat &amp; Ketentuan ini:</p>
                  <ul className="mt-3 list-disc space-y-1 pl-6">
                    <li>
                      <strong>&ldquo;SellOn&rdquo;</strong>,{" "}
                      <strong>&ldquo;kami&rdquo;</strong>, atau{" "}
                      <strong>&ldquo;Platform&rdquo;</strong> adalah layanan
                      perangkat lunak yang dioperasikan oleh PT SellOn Indonesia
                      (atau entitas hukum yang menjadi penerusnya).
                    </li>
                    <li>
                      <strong>&ldquo;Penjual&rdquo;</strong> atau{" "}
                      <strong>&ldquo;Anda&rdquo;</strong> adalah pemilik usaha
                      (individu atau badan usaha) yang menggunakan SellOn untuk
                      menerima pesanan.
                    </li>
                    <li>
                      <strong>&ldquo;Pembeli&rdquo;</strong> adalah pihak yang
                      melakukan pembelian dari Penjual melalui katalog yang
                      dibuat di SellOn.
                    </li>
                    <li>
                      <strong>&ldquo;PJP&rdquo;</strong> adalah Penyedia Jasa
                      Pembayaran yang berlisensi dari Bank Indonesia (mis.
                      Midtrans, Xendit) yang akun-nya didaftarkan oleh Penjual
                      sendiri.
                    </li>
                  </ul>
                </Article>

                <Article id="bagian-2" number="2" title="Penerimaan Syarat">
                  <p>
                    Dengan mendaftar, mengakses, atau menggunakan SellOn, Anda
                    menyatakan telah membaca, memahami, dan menyetujui untuk
                    terikat pada Syarat &amp; Ketentuan ini, termasuk
                    pembaruan-nya. Jika Anda tidak menyetujui, mohon untuk tidak
                    menggunakan layanan kami.
                  </p>
                </Article>

                <Article id="bagian-3" number="3" title="Layanan SellOn">
                  <p>SellOn adalah perangkat lunak yang membantu Penjual untuk:</p>
                  <ul className="mt-3 list-disc space-y-1 pl-6">
                    <li>Membuat dan membagikan katalog produk via WhatsApp;</li>
                    <li>Menerima pesanan dan mengelola status pengiriman;</li>
                    <li>
                      Menghubungkan akun PJP milik Penjual untuk menerima
                      pembayaran QRIS;
                    </li>
                    <li>Mengirim notifikasi otomatis ke Pembeli via WhatsApp.</li>
                  </ul>
                  <p className="mt-3">
                    SellOn adalah{" "}
                    <strong>fasilitator perangkat lunak</strong>, bukan
                    marketplace dan bukan PJP. Kami tidak pernah memegang dana
                    Pembeli.
                  </p>
                </Article>

                <Article id="bagian-4" number="4" title="Akun & Pendaftaran">
                  <p>
                    Untuk menggunakan SellOn, Anda harus membuat akun dengan
                    informasi yang akurat dan terkini. Anda bertanggung jawab
                    penuh atas keamanan kredensial akun Anda dan semua aktivitas
                    yang terjadi di dalamnya.
                  </p>
                  <p className="mt-3">
                    Akun SellOn saat ini dapat dibuat melalui sign-in dengan
                    akun Google Anda. Dengan masuk, Anda mengizinkan kami untuk
                    membaca alamat email, nama, dan foto profil Anda dari
                    Google.
                  </p>
                </Article>

                <Article
                  id="bagian-5"
                  number="5"
                  title="Pemrosesan Pembayaran (Model Fasilitator)"
                >
                  <p>
                    SellOn tidak menerima, menyimpan, atau menyalurkan dana
                    Pembeli. Pembayaran QRIS, virtual account, atau metode
                    lainnya diproses oleh PJP yang akun-nya didaftarkan oleh
                    Penjual sendiri (mis. Midtrans atau Xendit milik Penjual).
                  </p>
                  <p className="mt-3">Konsekuensinya:</p>
                  <ul className="mt-3 list-disc space-y-1 pl-6">
                    <li>
                      Dana hasil penjualan masuk langsung ke rekening Penjual
                      yang terdaftar di PJP, sesuai jadwal settlement PJP
                      tersebut;
                    </li>
                    <li>
                      Sengketa pembayaran (refund, chargeback, dispute) ditangani
                      sesuai prosedur PJP, dan Penjual bertanggung jawab atas
                      resolusinya;
                    </li>
                    <li>
                      SellOn tidak berwenang menahan, membekukan, atau
                      mengembalikan dana Pembeli.
                    </li>
                  </ul>
                </Article>

                <Article id="bagian-6" number="6" title="Biaya Berlangganan">
                  <p>
                    SellOn menerapkan biaya berlangganan bulanan tetap sesuai
                    paket yang Anda pilih (Gratis, Pro, atau Bisnis). SellOn{" "}
                    <strong>tidak</strong> mengambil komisi atau take-rate dari
                    nilai transaksi Anda.
                  </p>
                  <p className="mt-3">
                    Biaya jaringan PJP (mis. fee QRIS) tetap berlaku dan
                    dipotong langsung oleh PJP. Biaya tersebut bukan pendapatan
                    SellOn.
                  </p>
                </Article>

                <Article id="bagian-7" number="7" title="Kewajiban Penjual">
                  <p>Anda menjamin bahwa:</p>
                  <ul className="mt-3 list-disc space-y-1 pl-6">
                    <li>
                      Produk yang Anda jual adalah legal sesuai hukum Republik
                      Indonesia;
                    </li>
                    <li>Deskripsi produk akurat dan tidak menyesatkan;</li>
                    <li>
                      Anda memenuhi pesanan Pembeli sesuai janji yang tertera di
                      katalog;
                    </li>
                    <li>
                      Anda menjaga kerahasiaan data Pembeli dan tidak
                      menggunakannya untuk tujuan di luar pemenuhan pesanan.
                    </li>
                  </ul>
                </Article>

                <Article
                  id="bagian-8"
                  number="8"
                  title="Akses Admin SellOn untuk Support"
                >
                  <p>
                    Tim admin SellOn dapat masuk sementara ke akun Anda
                    (&ldquo;impersonation&rdquo;) untuk membantu troubleshooting
                    bug atau permintaan support. Akses ini bersifat:
                  </p>
                  <ul className="mt-3 list-disc space-y-1 pl-6">
                    <li>
                      <strong>Tercatat:</strong> setiap sesi impersonation
                      direkam di audit log toko Anda - Anda dapat melihat siapa
                      admin yang masuk, kapan, dan tindakan apa yang dilakukan;
                    </li>
                    <li>
                      <strong>Eksplisit:</strong> admin harus klik
                      &ldquo;Keluar dari mode&rdquo; untuk mengakhiri sesi -
                      tidak bisa &ldquo;tertinggal&rdquo; tanpa disadari karena
                      banner merah selalu tampil di setiap halaman;
                    </li>
                    <li>
                      <strong>Terlihat:</strong> banner merah selalu tampil di
                      seluruh dasbor saat admin sedang impersonate, sehingga
                      tindakan tidak bisa &ldquo;diam-diam&rdquo;.
                    </li>
                  </ul>
                  <p className="mt-3">
                    Akses ini dipakai hanya bila Anda mengajukan tiket support
                    atau saat investigasi keamanan/penyalahgunaan akun. Admin
                    tidak menggunakan akses ini untuk membaca data Pembeli Anda
                    di luar konteks support yang Anda inisiasi.
                  </p>
                </Article>

                <Article id="bagian-9" number="9" title="Larangan">
                  <p>
                    Anda dilarang menggunakan SellOn untuk menjual atau
                    mempromosikan:
                  </p>
                  <ul className="mt-3 list-disc space-y-1 pl-6">
                    <li>
                      Barang ilegal (narkotika, senjata tanpa izin, satwa
                      dilindungi, dll.);
                    </li>
                    <li>
                      Skema piramida, judi, atau aktivitas penipuan lainnya;
                    </li>
                    <li>
                      Konten yang melanggar hak kekayaan intelektual pihak lain;
                    </li>
                    <li>
                      Konten yang melanggar SARA atau melanggar hukum yang
                      berlaku.
                    </li>
                  </ul>
                  <p className="mt-3">
                    Pelanggaran dapat berakibat penangguhan atau penghentian
                    akun tanpa pengembalian biaya berlangganan.
                  </p>
                </Article>

                <Article
                  id="bagian-10"
                  number="10"
                  title="Pembatasan Tanggung Jawab"
                >
                  <p>
                    SellOn disediakan &ldquo;sebagaimana adanya&rdquo;. Sejauh
                    diizinkan oleh hukum yang berlaku, kami tidak bertanggung
                    jawab atas kerugian tidak langsung, kehilangan keuntungan,
                    atau kerusakan reputasi yang timbul dari penggunaan
                    Platform.
                  </p>
                  <p className="mt-3">
                    Tanggung jawab kami terbatas pada biaya berlangganan yang
                    telah Anda bayarkan dalam 12 bulan terakhir.
                  </p>
                </Article>

                <Article id="bagian-11" number="11" title="Penghentian">
                  <p>
                    Anda dapat menghentikan akun kapan saja melalui pengaturan
                    dasbor. Kami dapat menangguhkan atau menghentikan akun Anda
                    jika terjadi pelanggaran terhadap Syarat &amp; Ketentuan
                    ini, dengan pemberitahuan terlebih dahulu kecuali dalam
                    keadaan darurat.
                  </p>
                </Article>

                <Article
                  id="bagian-12"
                  number="12"
                  title="Perubahan Syarat & Ketentuan"
                >
                  <p>
                    Kami dapat memperbarui Syarat &amp; Ketentuan ini dari waktu
                    ke waktu. Perubahan material akan diberitahukan melalui
                    email dan notifikasi di dasbor minimal 14 hari sebelum
                    berlaku.
                  </p>
                </Article>

                <Article id="bagian-13" number="13" title="Hukum yang Berlaku">
                  <p>
                    Syarat &amp; Ketentuan ini tunduk pada hukum Republik
                    Indonesia. Sengketa yang tidak dapat diselesaikan secara
                    musyawarah akan diselesaikan melalui Pengadilan Negeri
                    Jakarta Selatan.
                  </p>
                </Article>

                <Article id="bagian-14" number="14" title="Kontak">
                  <p>
                    Pertanyaan terkait Syarat &amp; Ketentuan ini dapat dikirim
                    ke{" "}
                    <a
                      href="mailto:legal@sellon.id"
                      className="font-medium text-brand-600 hover:text-brand-700"
                    >
                      legal@sellon.id
                    </a>
                    .
                  </p>
                </Article>
              </div>

              <div className="mt-12 border-t border-neutral-200 pt-6 text-sm text-neutral-500">
                <Link href="/" className="text-brand-600 hover:text-brand-700">
                  ← Kembali ke beranda
                </Link>
              </div>
            </article>
          </div>
        </Container>
      </main>
      <Footer />
    </>
  );
}

function Article({
  id,
  number,
  title,
  children,
}: {
  id: string;
  number: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24">
      <h2 className="font-display text-xl font-semibold tracking-tight text-neutral-900 sm:text-2xl">
        <span className="mr-2 text-brand-600">{number}.</span>
        {title}
      </h2>
      <div className="mt-3 leading-relaxed text-neutral-700">{children}</div>
    </section>
  );
}
