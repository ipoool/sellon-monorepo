import type { Metadata } from "next";
import Link from "next/link";

import { Container } from "@/components/layout/container";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { Badge } from "@/components/ui/badge";
import { getMe } from "@/lib/server-auth";

export const metadata: Metadata = {
  title: "Kebijakan Privasi — SellOn",
  description:
    "Bagaimana SellOn mengumpulkan, menggunakan, dan melindungi data pribadi Anda.",
};

const lastUpdated = "8 Mei 2026";

const sections = [
  { id: "p-1", number: "1", title: "Pendahuluan" },
  { id: "p-2", number: "2", title: "Data yang Kami Kumpulkan" },
  { id: "p-3", number: "3", title: "Cara Kami Menggunakan Data" },
  { id: "p-4", number: "4", title: "Berbagi Data dengan Pihak Ketiga" },
  { id: "p-5", number: "5", title: "Penyimpanan & Keamanan" },
  { id: "p-6", number: "6", title: "Hak Anda atas Data" },
  { id: "p-7", number: "7", title: "Cookie & Tracking" },
  { id: "p-8", number: "8", title: "Anak di Bawah Umur" },
  { id: "p-9", number: "9", title: "Perubahan Kebijakan" },
  { id: "p-10", number: "10", title: "Kontak Privasi" },
];

export default async function PrivasiPage() {
  const me = await getMe();

  return (
    <>
      <Header me={me} />
      <main className="py-12 lg:py-16">
        <Container>
          <header className="mx-auto max-w-3xl">
            <p className="text-sm font-medium text-brand-600">Dokumen Hukum</p>
            <h1 className="mt-2 font-display text-4xl font-semibold tracking-tight text-neutral-900 sm:text-5xl">
              Kebijakan Privasi
            </h1>
            <div className="mt-4 flex items-center gap-2">
              <Badge variant="outline">Terakhir diperbarui · {lastUpdated}</Badge>
            </div>

            <div className="mt-6 rounded-xl border border-warning/40 bg-warning/10 p-4 text-sm text-neutral-800">
              <p className="font-medium">Dokumen ini adalah draft awal.</p>
              <p className="mt-1 text-neutral-700">
                Sebelum dipublikasikan untuk umum, mohon ditinjau oleh kuasa
                hukum yang memahami UU PDP (Pelindungan Data Pribadi) Republik
                Indonesia.
              </p>
            </div>
          </header>

          <div className="mt-12 grid gap-10 lg:grid-cols-12 lg:gap-12">
            <details className="rounded-xl border border-neutral-200 bg-white p-4 lg:hidden">
              <summary className="flex cursor-pointer list-none items-center justify-between font-medium text-neutral-900 [&::-webkit-details-marker]:hidden">
                <span>Daftar Isi</span>
                <span className="text-sm text-neutral-500">
                  {sections.length} bagian
                </span>
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

            <aside className="hidden lg:col-span-3 lg:block">
              <nav aria-label="Daftar Isi" className="sticky top-24">
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

            <article className="lg:col-span-9">
              <div className="space-y-12 text-neutral-800">
                <Article id="p-1" number="1" title="Pendahuluan">
                  <p>
                    SellOn (&ldquo;kami&rdquo;) menghormati privasi pengguna
                    (&ldquo;Anda&rdquo;). Dokumen ini menjelaskan data apa yang
                    kami kumpulkan, kenapa, bagaimana kami menyimpannya, dan
                    hak Anda atas data tersebut.
                  </p>
                  <p className="mt-3">
                    Kebijakan ini berlaku bagi semua pengguna SellOn — Penjual
                    yang mendaftar akun, maupun Pembeli yang mengakses katalog
                    Penjual yang dihosting di SellOn.
                  </p>
                </Article>

                <Article
                  id="p-2"
                  number="2"
                  title="Data yang Kami Kumpulkan"
                >
                  <p>Data yang kami kumpulkan dari Penjual:</p>
                  <ul className="mt-3 list-disc space-y-1 pl-6">
                    <li>
                      <strong>Profil Google:</strong> alamat email, nama, foto
                      profil — saat Anda login dengan Google OAuth.
                    </li>
                    <li>
                      <strong>Data toko:</strong> nama toko, deskripsi, foto
                      produk, harga, stok — yang Anda input sendiri.
                    </li>
                    <li>
                      <strong>Data pesanan:</strong> nama dan kontak Pembeli
                      yang Anda layani — Anda yang menjadi data controller-nya.
                    </li>
                    <li>
                      <strong>Log teknis:</strong> alamat IP, user agent,
                      timestamp request — untuk keperluan keamanan dan
                      debugging.
                    </li>
                  </ul>
                  <p className="mt-3">Data dari Pembeli (jika ada katalog publik):</p>
                  <ul className="mt-3 list-disc space-y-1 pl-6">
                    <li>Cookie sesi (lihat Kebijakan Cookie);</li>
                    <li>Halaman katalog yang dilihat (anonim, agregat).</li>
                  </ul>
                </Article>

                <Article
                  id="p-3"
                  number="3"
                  title="Cara Kami Menggunakan Data"
                >
                  <p>Data hanya kami gunakan untuk tujuan berikut:</p>
                  <ul className="mt-3 list-disc space-y-1 pl-6">
                    <li>Mengoperasikan layanan SellOn (autentikasi, dasbor, katalog);</li>
                    <li>Mengirim email transaksional (konfirmasi, struk, notifikasi);</li>
                    <li>Mendeteksi dan mencegah penyalahgunaan / fraud;</li>
                    <li>Memenuhi kewajiban hukum (pajak, audit, perintah pengadilan).</li>
                  </ul>
                  <p className="mt-3">
                    Kami <strong>tidak</strong> menjual data Anda atau Pembeli
                    Anda ke pengiklan, broker data, atau pihak mana pun.
                  </p>
                </Article>

                <Article
                  id="p-4"
                  number="4"
                  title="Berbagi Data dengan Pihak Ketiga"
                >
                  <p>
                    Kami hanya berbagi data dengan vendor pihak ketiga yang
                    membantu menjalankan layanan SellOn, semua terikat
                    perjanjian kerahasiaan:
                  </p>
                  <ul className="mt-3 list-disc space-y-1 pl-6">
                    <li>
                      <strong>Google:</strong> autentikasi OAuth (login).
                    </li>
                    <li>
                      <strong>Penyedia hosting (mis. AWS, GCP):</strong>{" "}
                      menjalankan server dan database.
                    </li>
                    <li>
                      <strong>PJP yang Anda pilih:</strong> Midtrans/Xendit
                      memproses pembayaran. Mereka adalah data controller untuk
                      data pembayaran, bukan kami.
                    </li>
                    <li>
                      <strong>Email provider:</strong> mengirim email
                      transaksional.
                    </li>
                  </ul>
                </Article>

                <Article
                  id="p-5"
                  number="5"
                  title="Penyimpanan & Keamanan"
                >
                  <p>
                    Data kami simpan di server yang berlokasi di Indonesia
                    (Singapore datacenter sebagai disaster recovery).
                    Database di-encrypt at rest (AES-256). Lalu lintas
                    di-encrypt in transit (TLS 1.3).
                  </p>
                  <p className="mt-3">
                    Akses internal ke data produksi dibatasi pada engineer yang
                    perlu, dengan audit log untuk setiap query. Kami melakukan
                    backup harian dengan retensi 30 hari.
                  </p>
                </Article>

                <Article id="p-6" number="6" title="Hak Anda atas Data">
                  <p>Sesuai UU PDP No. 27/2022, Anda berhak untuk:</p>
                  <ul className="mt-3 list-disc space-y-1 pl-6">
                    <li>Mengakses data yang kami simpan tentang Anda;</li>
                    <li>Memperbaiki data yang tidak akurat;</li>
                    <li>
                      Meminta penghapusan data (kecuali yang wajib disimpan
                      untuk kewajiban hukum);
                    </li>
                    <li>Meminta export data dalam format CSV;</li>
                    <li>Mencabut persetujuan kapan saja.</li>
                  </ul>
                  <p className="mt-3">
                    Permintaan dapat dikirim ke{" "}
                    <a
                      href="mailto:privasi@sellon.id"
                      className="font-medium text-brand-600 hover:text-brand-700"
                    >
                      privasi@sellon.id
                    </a>{" "}
                    dan akan diproses dalam waktu maksimal 30 hari kerja.
                  </p>
                </Article>

                <Article id="p-7" number="7" title="Cookie & Tracking">
                  <p>
                    Detail cookie yang kami pakai dijelaskan di{" "}
                    <Link
                      href="/kebijakan-cookie"
                      className="font-medium text-brand-600 hover:text-brand-700"
                    >
                      Kebijakan Cookie
                    </Link>
                    . Kami tidak menggunakan cookie iklan pihak ketiga.
                  </p>
                </Article>

                <Article id="p-8" number="8" title="Anak di Bawah Umur">
                  <p>
                    SellOn ditujukan untuk pengguna berusia 17 tahun ke atas.
                    Kami tidak secara sengaja mengumpulkan data dari anak di
                    bawah umur. Kalau Anda tahu ada akun yang dibuat oleh anak
                    di bawah umur, mohon laporkan ke privasi@sellon.id supaya
                    kami bisa hapus.
                  </p>
                </Article>

                <Article id="p-9" number="9" title="Perubahan Kebijakan">
                  <p>
                    Kami dapat memperbarui kebijakan ini. Perubahan material
                    akan diberitahukan via email dan banner notifikasi di
                    dasbor minimal 14 hari sebelum berlaku.
                  </p>
                </Article>

                <Article id="p-10" number="10" title="Kontak Privasi">
                  <p>
                    Pertanyaan, permintaan akses data, atau keberatan terkait
                    privasi dapat dikirim ke:
                  </p>
                  <div className="mt-3 rounded-lg border border-neutral-200 bg-neutral-50 p-4 text-sm">
                    <p>
                      <strong>Data Protection Officer</strong>
                    </p>
                    <p className="mt-1 text-neutral-600">
                      Email:{" "}
                      <a
                        href="mailto:privasi@sellon.id"
                        className="font-medium text-brand-600"
                      >
                        privasi@sellon.id
                      </a>
                    </p>
                  </div>
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
