import type { Metadata } from "next";
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
import { Section } from "@/components/layout/section";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { getMe } from "@/lib/server-auth";

export const metadata: Metadata = {
  title: "Tentang Kami — SellOn",
  description:
    "Cerita di balik SellOn: kenapa kami bangun platform ini untuk UMKM Indonesia.",
};

type Principle = {
  icon: LucideIcon;
  title: string;
  description: string;
};

const principles: Principle[] = [
  {
    icon: Heart,
    title: "UMKM dulu, profit belakangan",
    description:
      "Setiap fitur kami evaluasi dari sudut pandang warung dan toko kecil. Kalau bikin mereka tambah ribet, kami tolak — sekeren apa pun ide-nya.",
  },
  {
    icon: Compass,
    title: "Transparan tentang uang",
    description:
      "Tidak ada take-rate sembunyi. Tidak ada upsell agresif. Harga di halaman pricing adalah harga yang Anda bayar — selesai.",
  },
  {
    icon: Users,
    title: "Penjual yang punya datanya",
    description:
      "Kontak pelanggan, riwayat pesanan, foto produk — semua milik Anda. Kapan pun mau pindah, export tinggal klik.",
  },
  {
    icon: Sparkles,
    title: "Sederhana sebelum canggih",
    description:
      "Mengirim resi tidak harus ribet. Bikin katalog tidak harus install 5 aplikasi. Kami obsesi sama UX yang bisa dipakai sambil ngurus toko.",
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
      "Frustrasi dengan biaya marketplace yang naik terus. Founder ngobrol bareng 30+ pemilik UMKM di Yogya, Bandung, dan Solo.",
  },
  {
    date: "Q2 2026",
    title: "Tim kecil dibentuk",
    description:
      "Empat engineer dan satu desainer. Semua pernah bantuin keluarga punya toko fisik atau warung.",
  },
  {
    date: "Mei 2026",
    title: "Beta tertutup",
    description:
      "20 toko pilot dari 5 kota. Iterasi setiap minggu berdasarkan feedback langsung.",
  },
  {
    date: "Akhir 2026",
    title: "Public launch",
    description:
      "Target: 1.000 UMKM aktif, gratis selamanya untuk yang baru mulai.",
  },
];

const team = [
  {
    name: "Andi Pratama",
    role: "Co-founder & CEO",
    bio: "10 tahun di product. Anak dari pemilik warung kelontong di Solo.",
  },
  {
    name: "Citra Lestari",
    role: "Co-founder & CTO",
    bio: "Mantan engineer fintech. Bangun infra payment yang dipakai jutaan transaksi.",
  },
  {
    name: "Bayu Nugroho",
    role: "Head of Design",
    bio: "Obsesi sama UMKM-friendly UX. Dulu freelancer untuk brand lokal.",
  },
  {
    name: "Dewi Anggraini",
    role: "Head of Customer Success",
    bio: "Kontak utama untuk merchant kami. Selalu angkat WhatsApp dalam 5 menit.",
  },
];

export default async function TentangPage() {
  const me = await getMe();

  return (
    <>
      <Header me={me} />
      <main>
        {/* Hero */}
        <section className="relative overflow-hidden py-16 lg:py-24">
          <div
            aria-hidden
            className="bg-dot-grid pointer-events-none absolute inset-x-0 top-0 -z-10 h-[400px] opacity-40 [mask-image:radial-gradient(ellipse_70%_60%_at_50%_30%,black,transparent_75%)]"
          />
          <Container>
            <div className="mx-auto max-w-3xl text-center">
              <Badge variant="brand">Tentang Kami</Badge>
              <h1 className="mt-4 font-display text-4xl font-semibold tracking-tight text-neutral-900 sm:text-5xl lg:text-6xl">
                Kami percaya UMKM Indonesia layak{" "}
                <span className="text-gradient-brand">tools sekelas Stripe</span>
              </h1>
              <p className="mt-6 text-lg leading-relaxed text-neutral-600">
                SellOn dibangun oleh tim yang besar di sekeliling toko keluarga
                — kami tahu rasanya kewalahan bales WhatsApp pesanan sambil
                masih harus ngitung HPP. Misi kami: bikin jualan online sesimpel
                kirim pesan ke teman.
              </p>
            </div>
          </Container>
        </section>

        {/* Mission stats */}
        <Section bg="alt" tight>
          <Container>
            <div className="mx-auto grid max-w-4xl gap-6 text-center sm:grid-cols-3">
              {[
                { value: "1.000+", label: "UMKM yang sudah pakai SellOn" },
                { value: "Rp 0", label: "Take-rate dari penjualan kamu" },
                { value: "27", label: "Provinsi tersebar di Indonesia" },
              ].map((s) => (
                <div
                  key={s.label}
                  className="rounded-xl border border-neutral-200 bg-white px-6 py-8 shadow-card"
                >
                  <p className="font-display text-4xl font-semibold tracking-tight text-neutral-900">
                    {s.value}
                  </p>
                  <p className="mt-2 text-sm text-neutral-600">{s.label}</p>
                </div>
              ))}
            </div>
          </Container>
        </Section>

        {/* Principles */}
        <Section>
          <Container>
            <div className="mx-auto max-w-2xl text-center">
              <p className="text-sm font-medium text-brand-600">Prinsip Kami</p>
              <h2 className="mt-2 font-display text-3xl font-semibold tracking-tight text-neutral-900 sm:text-4xl">
                Yang nggak akan kami kompromikan
              </h2>
              <p className="mt-4 text-lg text-neutral-600">
                Kalau salah satu prinsip ini berbenturan dengan growth metric
                jangka pendek, kami pilih prinsip-nya.
              </p>
            </div>

            <div className="mt-12 grid gap-4 sm:grid-cols-2">
              {principles.map(({ icon: Icon, title, description }) => (
                <div
                  key={title}
                  className="flex gap-4 rounded-xl border border-neutral-200 bg-white p-6 shadow-card"
                >
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                    <Icon className="size-5" strokeWidth={2} aria-hidden />
                  </div>
                  <div>
                    <h3 className="font-semibold text-neutral-900">{title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-neutral-600">
                      {description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </Container>
        </Section>

        {/* Timeline */}
        <Section bg="alt">
          <Container>
            <div className="mx-auto max-w-2xl text-center">
              <p className="text-sm font-medium text-brand-600">Perjalanan</p>
              <h2 className="mt-2 font-display text-3xl font-semibold tracking-tight text-neutral-900 sm:text-4xl">
                Dari obrolan warung ke platform
              </h2>
            </div>

            <ol className="mt-12 mx-auto max-w-3xl">
              {milestones.map((m, i) => (
                <li
                  key={m.title}
                  className="relative flex gap-6 pb-10 last:pb-0"
                >
                  {/* Connector line */}
                  {i < milestones.length - 1 && (
                    <span
                      aria-hidden
                      className="absolute left-[15px] top-8 h-[calc(100%-2rem)] w-px bg-neutral-200"
                    />
                  )}
                  <span
                    aria-hidden
                    className="relative z-10 mt-1 flex size-8 shrink-0 items-center justify-center rounded-full bg-white"
                  >
                    <span className="size-3 rounded-full bg-brand-500 ring-4 ring-brand-100" />
                  </span>
                  <div className="flex-1">
                    <p className="text-xs font-medium uppercase tracking-wider text-brand-600">
                      {m.date}
                    </p>
                    <h3 className="mt-1 font-display text-lg font-semibold text-neutral-900">
                      {m.title}
                    </h3>
                    <p className="mt-2 text-sm leading-relaxed text-neutral-600">
                      {m.description}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </Container>
        </Section>

        {/* Team — hidden until real team profiles are ready */}
        {/* <Section>
          <Container>
            <div className="mx-auto max-w-2xl text-center">
              <p className="text-sm font-medium text-brand-600">Tim</p>
              <h2 className="mt-2 font-display text-3xl font-semibold tracking-tight text-neutral-900 sm:text-4xl">
                Orang-orang di balik SellOn
              </h2>
              <p className="mt-4 text-lg text-neutral-600">
                Empat orang dengan satu obsesi: bikin UMKM Indonesia menang
                kompetisi tanpa harus jadi expert teknologi.
              </p>
            </div>

            <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {team.map((p) => (
                <div
                  key={p.name}
                  className="rounded-xl border border-neutral-200 bg-white p-6 text-center shadow-card"
                >
                  <Avatar name={p.name} size="lg" className="mx-auto" />
                  <p className="mt-4 font-semibold text-neutral-900">{p.name}</p>
                  <p className="text-sm text-brand-600">{p.role}</p>
                  <p className="mt-3 text-sm leading-relaxed text-neutral-600">
                    {p.bio}
                  </p>
                </div>
              ))}
            </div>
          </Container>
        </Section> */}

        {/* CTA */}
        <Section tight>
          <Container>
            <div className="mx-auto max-w-3xl rounded-2xl border border-neutral-200 bg-white p-10 text-center shadow-card sm:p-14">
              <h2 className="font-display text-3xl font-semibold tracking-tight text-neutral-900 sm:text-4xl">
                Mau ngobrol langsung?
              </h2>
              <p className="mt-4 text-lg text-neutral-600">
                Founder kami selalu available untuk dengerin keluhan, kasih
                masukan, atau sekedar ngopi-ngopi virtual.
              </p>
              <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <a href="mailto:halo@sellon.id">
                  <Button size="lg">
                    <Mail className="size-4" aria-hidden />
                    Email founder
                  </Button>
                </a>
                <Link href="/roadmap">
                  <Button size="lg" variant="outline">
                    Lihat roadmap
                    <ArrowRight className="size-4" aria-hidden />
                  </Button>
                </Link>
              </div>
            </div>
          </Container>
        </Section>
      </main>
      <Footer />
    </>
  );
}
