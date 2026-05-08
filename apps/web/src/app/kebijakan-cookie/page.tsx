import type { Metadata } from "next";
import Link from "next/link";

import { Container } from "@/components/layout/container";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { Badge } from "@/components/ui/badge";
import { getMe } from "@/lib/server-auth";

export const metadata: Metadata = {
  title: "Kebijakan Cookie — SellOn",
  description: "Cookie apa yang dipakai SellOn dan cara mengelolanya.",
};

const lastUpdated = "8 Mei 2026";

type Cookie = {
  name: string;
  type: "Wajib" | "Fungsional" | "Analitik";
  purpose: string;
  duration: string;
};

const cookies: Cookie[] = [
  {
    name: "sellon_session",
    type: "Wajib",
    purpose:
      "Menyimpan token sesi login (HttpOnly, SameSite=Lax). Tanpa cookie ini, Anda tidak bisa tetap login di antara request.",
    duration: "7 hari",
  },
  {
    name: "next-auth.csrf-token",
    type: "Wajib",
    purpose: "Mencegah CSRF attack saat form login disubmit.",
    duration: "Sesi",
  },
];

export default async function CookiePage() {
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
                Kebijakan Cookie
              </h1>
              <div className="mt-4 flex items-center gap-2">
                <Badge variant="outline">
                  Terakhir diperbarui · {lastUpdated}
                </Badge>
              </div>
            </header>

            <div className="space-y-12 text-neutral-800">
              <Section title="Apa itu Cookie?">
                <p>
                  Cookie adalah file kecil yang disimpan browser saat Anda
                  mengakses website. Cookie membantu website &ldquo;mengingat&rdquo;
                  Anda — misalnya, supaya Anda tidak perlu login ulang setiap
                  pindah halaman.
                </p>
                <p className="mt-3">
                  SellOn hanya menggunakan cookie yang strictly-necessary
                  untuk operasional. Kami{" "}
                  <strong>tidak</strong> menggunakan cookie iklan, pelacakan
                  perilaku lintas situs, atau third-party analytics yang
                  invasif.
                </p>
              </Section>

              <Section title="Cookie yang Kami Pakai">
                <div className="overflow-hidden rounded-xl border border-neutral-200">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-neutral-50 text-xs uppercase tracking-wider text-neutral-500">
                      <tr>
                        <th className="px-4 py-3 font-medium">Nama</th>
                        <th className="px-4 py-3 font-medium">Tipe</th>
                        <th className="px-4 py-3 font-medium">Tujuan</th>
                        <th className="px-4 py-3 font-medium">Durasi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-200">
                      {cookies.map((c) => (
                        <tr key={c.name}>
                          <td className="px-4 py-3 font-mono text-xs text-neutral-900">
                            {c.name}
                          </td>
                          <td className="px-4 py-3">
                            <Badge variant="default">{c.type}</Badge>
                          </td>
                          <td className="px-4 py-3 text-neutral-600">
                            {c.purpose}
                          </td>
                          <td className="px-4 py-3 text-neutral-600">
                            {c.duration}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="mt-4 text-sm text-neutral-600">
                  Saat ini SellOn belum menggunakan cookie analitik atau iklan.
                  Jika di masa depan kami menambahkannya, kami akan minta
                  persetujuan eksplisit Anda terlebih dahulu (opt-in).
                </p>
              </Section>

              <Section title="Cara Mengelola Cookie">
                <p>
                  Anda dapat memblokir atau menghapus cookie melalui pengaturan
                  browser. Catatan: memblokir cookie wajib (
                  <code className="rounded bg-neutral-100 px-1 py-0.5 text-xs">
                    sellon_session
                  </code>
                  ) akan membuat Anda tidak bisa tetap login.
                </p>
                <ul className="mt-4 list-disc space-y-1 pl-6 text-sm">
                  <li>
                    <a
                      href="https://support.google.com/chrome/answer/95647"
                      className="font-medium text-brand-600 hover:text-brand-700"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Chrome
                    </a>
                  </li>
                  <li>
                    <a
                      href="https://support.mozilla.org/en-US/kb/clear-cookies-and-site-data-firefox"
                      className="font-medium text-brand-600 hover:text-brand-700"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Firefox
                    </a>
                  </li>
                  <li>
                    <a
                      href="https://support.apple.com/guide/safari/manage-cookies-sfri11471/mac"
                      className="font-medium text-brand-600 hover:text-brand-700"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Safari
                    </a>
                  </li>
                </ul>
              </Section>

              <Section title="Perubahan">
                <p>
                  Kalau kami tambah cookie baru (mis. analytics), kebijakan ini
                  akan di-update dan Anda akan dapat banner consent di dasbor
                  sebelum cookie tersebut diaktifkan.
                </p>
              </Section>

              <Section title="Kontak">
                <p>
                  Pertanyaan tentang cookie? Email{" "}
                  <a
                    href="mailto:privasi@sellon.id"
                    className="font-medium text-brand-600 hover:text-brand-700"
                  >
                    privasi@sellon.id
                  </a>
                  . Untuk konteks lebih luas tentang data, lihat{" "}
                  <Link
                    href="/kebijakan-privasi"
                    className="font-medium text-brand-600 hover:text-brand-700"
                  >
                    Kebijakan Privasi
                  </Link>
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
      <Footer />
    </>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="font-display text-xl font-semibold tracking-tight text-neutral-900 sm:text-2xl">
        {title}
      </h2>
      <div className="mt-3 leading-relaxed text-neutral-700">{children}</div>
    </section>
  );
}
