import Link from "next/link";
import {
  Heart,
  Compass,
  Users,
  Sparkles,
  ArrowRight,
  Mail,
  type LucideIcon,
} from "lucide-react";

import { Container } from "@/components/layout/container";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { getMe } from "@/lib/server-auth";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Tentang Kami",
  description:
    "Cerita di balik SellOn: kenapa kami bangun platform ini untuk UMKM Indonesia, dan bagaimana model facilitator-only menjaga uang seller tetap di rekening sendiri.",
  path: "/about",
});

type Principle = {
  icon: LucideIcon;
  title: string;
  description: string;
};

const principles: Principle[] = [
  {
    icon: Heart,
    title: "UMKM dulu, untung belakangan",
    description:
      "Setiap fitur kami uji dari sudut pandang warung dan toko kecil. Kalau bikin pemilik toko tambah ribet, kami tolak - sekeren apa pun idenya.",
  },
  {
    icon: Compass,
    title: "Transparan tentang uang",
    description:
      "Tidak ada potongan tersembunyi dari setiap pesanan. Tidak ada upsell agresif. Harga di halaman Harga adalah harga yang kamu bayar - selesai.",
  },
  {
    icon: Users,
    title: "Penjual yang punya datanya",
    description:
      "Kontak pelanggan, riwayat pesanan, foto produk - semua milik kamu. Kapan pun mau pindah, export CSV tinggal klik.",
  },
  {
    icon: Sparkles,
    title: "Sederhana dulu, canggih kemudian",
    description:
      "Kirim nomor resi tidak harus ribet. Bikin katalog tidak harus pasang 5 aplikasi. Kami obsesi bikin tampilan yang bisa dipakai sambil ngurus toko.",
  },
];

type Milestone = {
  date: string;
  title: string;
  description: string;
};

const milestones: Milestone[] = [
  {
    date: "Q1 2026",
    title: "Ide pertama",
    description:
      "Berawal dari kegelisahan terhadap biaya marketplace yang terus naik. Pendiri ngobrol langsung dengan 30+ pemilik UMKM di Yogyakarta, Bandung, dan Solo.",
  },
  {
    date: "Q2 2026",
    title: "Tim kecil dibentuk",
    description:
      "Empat engineer dan satu desainer. Semua pernah bantu keluarga ngurus toko fisik atau warung kecil.",
  },
  {
    date: "Mei 2026",
    title: "Uji coba tertutup",
    description:
      "20 toko pilot dari 5 kota. Kami kembangkan setiap minggu berdasarkan masukan langsung dari mereka.",
  },
  {
    date: "Akhir 2026",
    title: "Peluncuran publik",
    description:
      "Target: 1.000 UMKM aktif, gratis selamanya buat yang baru mulai.",
  },
];

export default async function TentangPage() {
  const me = await getMe();

  return (
    <>
      <Header me={me} />
      <main>
        {/* Hero — same brand-hue wash and type scale as the home hero, so the
            two pages read as one site rather than two templates. */}
        <section className="relative overflow-hidden">
          <div
            aria-hidden
            className="pointer-events-none absolute left-1/2 top-[-320px] h-[700px] w-[1500px] -translate-x-1/2"
            style={{
              background:
                "radial-gradient(ellipse at center, oklch(0.94 0.06 145 / 0.55) 0%, oklch(0.97 0.025 145 / 0.45) 45%, oklch(1 0 0 / 0) 72%)",
            }}
          />
          <Container>
            <div className="relative mx-auto max-w-[62ch] pb-10 pt-12 text-center lg:pt-14">
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-brand-700">
                Tentang Kami
              </p>
              <h1 className="mt-3 font-display text-[34px] font-bold leading-[1.1] tracking-[-0.02em] text-neutral-900 sm:text-5xl lg:text-[52px] lg:tracking-[-0.022em]">
                UMKM Indonesia berhak punya{" "}
                <span className="text-brand-600">tool jualan kelas dunia</span>
              </h1>
              <p className="mx-auto mt-4 text-[15px] leading-relaxed text-neutral-600 sm:text-base">
                SellOn dibangun oleh tim yang tumbuh di lingkungan toko keluarga
                — kami tahu rasanya kewalahan balas pesanan WhatsApp sambil
                masih ngitung modal. Misi kami: bikin jualan online sesimpel
                kirim pesan ke teman.
              </p>
            </div>
          </Container>
        </section>

        {/* Mission figures */}
        <section className="my-4 lg:my-6">
          <Container>
            <div className="relative overflow-hidden rounded-[28px] bg-gradient-brand-soft px-6 py-10 sm:px-10 sm:py-12">
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0 bg-soft-dots opacity-70"
              />
              <ul className="relative grid gap-3.5 sm:grid-cols-3">
                {[
                  {
                    value: "60 juta+",
                    label:
                      "UMKM di Indonesia — semua berhak punya tool jualan profesional",
                  },
                  {
                    value: "Rp 0",
                    label:
                      "Potongan dari setiap pesanan — kamu pegang 100% uangnya",
                  },
                  {
                    value: "100%",
                    label:
                      "Uang masuk langsung ke rekening / Midtrans-mu sendiri",
                  },
                ].map((s) => (
                  <li
                    key={s.label}
                    className="rounded-2xl bg-white/80 p-6 shadow-soft backdrop-blur-[2px]"
                  >
                    <p className="font-display text-[40px] font-bold leading-none tracking-[-0.03em] text-brand-700">
                      {s.value}
                    </p>
                    <p className="mt-3 text-sm leading-relaxed text-neutral-600">
                      {s.label}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          </Container>
        </section>

        {/* Principles */}
        <section className="py-12 lg:py-16">
          <Container>
            <h2 className="font-display text-2xl font-bold tracking-[-0.015em] text-neutral-900 sm:text-3xl">
              Yang tidak akan kami kompromikan
            </h2>
            <p className="mt-2 max-w-[56ch] text-[15px] leading-relaxed text-neutral-600">
              Kalau bertabrakan dengan target jangka pendek, prinsip yang menang.
            </p>

            <ul className="mt-6 grid gap-3.5 sm:grid-cols-2">
              {principles.map(({ icon: Icon, title, description }, i) => {
                const chip = ["bg-brand-500", "bg-info", "bg-warning", "bg-danger"][i % 4];
                const tint = ["bg-brand-50", "bg-info/10", "bg-warning/10", "bg-danger/10"][i % 4];
                return (
                  <li
                    key={title}
                    className={`relative overflow-hidden rounded-3xl p-6 sm:p-7 ${tint}`}
                  >
                    <div
                      aria-hidden
                      className="pointer-events-none absolute inset-0 bg-soft-dots opacity-60"
                      style={
                        {
                          "--pattern-color": "oklch(0.45 0 0 / 0.07)",
                        } as React.CSSProperties
                      }
                    />
                    <div className="relative">
                      <span
                        className={`grid size-11 place-items-center rounded-2xl ${chip}`}
                      >
                        <Icon className="size-[22px] text-white" aria-hidden />
                      </span>
                      <h3 className="mt-4 font-display text-lg font-bold leading-snug tracking-[-0.01em] text-neutral-900">
                        {title}
                      </h3>
                      <p className="mt-2 text-sm leading-relaxed text-neutral-600">
                        {description}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </Container>
        </section>

        {/* Timeline */}
        <section className="py-12 lg:py-16">
          <Container>
            <h2 className="font-display text-2xl font-bold tracking-[-0.015em] text-neutral-900 sm:text-3xl">
              Dari obrolan warung sampai jadi platform
            </h2>

            <ol className="mt-6 grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
              {milestones.map((m, i) => (
                <li
                  key={m.title}
                  className="rounded-3xl border border-neutral-200 bg-white p-6"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="grid size-9 place-items-center rounded-xl bg-brand-500 font-display text-sm font-bold text-white">
                      {i + 1}
                    </span>
                    <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-brand-700">
                      {m.date}
                    </span>
                  </div>
                  <h3 className="mt-4 font-display text-lg font-bold leading-snug text-neutral-900">
                    {m.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-neutral-600">
                    {m.description}
                  </p>
                </li>
              ))}
            </ol>
          </Container>
        </section>

        {/* CTA */}
        <section className="pb-16 pt-4 lg:pb-20">
          <Container>
            <div className="relative overflow-hidden rounded-[28px] bg-gradient-brand-soft px-6 py-10 sm:px-10 sm:py-12">
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0 bg-soft-dots opacity-70"
              />
              <div className="relative max-w-[52ch]">
                <h2 className="font-display text-2xl font-bold tracking-[-0.02em] text-neutral-900 sm:text-3xl">
                  Mau ngobrol langsung?
                </h2>
                <p className="mt-2.5 text-[15px] leading-relaxed text-neutral-600">
                  Pendiri kami selalu siap dengar keluhan, terima masukan, atau
                  sekadar ngobrol santai soal toko-mu.
                </p>
                <div className="mt-6 flex flex-wrap items-center gap-3">
                  <a
                    href="mailto:halo@sellon.id"
                    className="inline-flex items-center gap-1.5 rounded-full bg-brand-600 px-5 py-3 text-sm font-bold text-white transition-colors hover:bg-brand-700"
                  >
                    <Mail className="size-4" aria-hidden />
                    Email pendiri
                  </a>
                  <Link
                    href="/roadmap"
                    className="inline-flex items-center gap-1.5 rounded-full border border-brand-300 bg-white/70 px-5 py-3 text-sm font-bold text-brand-700 transition-colors hover:bg-white"
                  >
                    Lihat rencana fitur
                    <ArrowRight className="size-4" aria-hidden />
                  </Link>
                </div>
              </div>
            </div>
          </Container>
        </section>
      </main>
      <Footer />
    </>
  );
}
