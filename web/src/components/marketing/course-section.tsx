import Link from "next/link";
import {
  GraduationCap,
  MailCheck,
  Clock,
  Zap,
  ListVideo,
  PlayCircle,
  CheckCircle2,
  Lock,
  ArrowRight,
} from "lucide-react";
import { Section } from "@/components/layout/section";
import { Container } from "@/components/layout/container";
import { Button } from "@/components/ui/button";

const benefits = [
  {
    icon: MailCheck,
    title: "Akses dikunci OTP email",
    description:
      "Tiap pembeli verifikasi email pesanannya lewat kode sekali pakai sebelum bisa nonton. Link kelas nggak bisa asal disebar — yang bayar, yang nonton.",
  },
  {
    icon: Clock,
    title: "Atur masa aktif kelas",
    description:
      "Seumur hidup atau batasi — per minggu, bulan, atau tahun. Pas buat kelas batch atau materi yang harus diperbarui tiap musim.",
  },
  {
    icon: Zap,
    title: "Akses terkirim otomatis",
    description:
      "Begitu pembayaran lunas, link kelas langsung dikirim ke email pembeli. Nggak perlu kirim materi manual satu-satu.",
  },
  {
    icon: ListVideo,
    title: "Susun materi jadi playlist",
    description:
      "Tempel link video YouTube, tambah catatan per pelajaran, atur urutannya. Pembeli nonton di halaman kelas yang rapi dan fokus.",
  },
];

// Mock playlist for the course-player preview.
const lessons = [
  { title: "Pengenalan & alat yang dibutuhkan", duration: "08:24", done: true },
  { title: "Dasar resep adonan", duration: "14:10", done: true },
  { title: "Teknik isian & topping", duration: "11:35", done: false, active: true },
  { title: "Packaging & strategi harga", duration: "09:48", done: false },
];

export function CourseSection() {
  return (
    <Section bg="alt">
      <Container>
        <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
          {/* Left: copy + benefits */}
          <div className="flex flex-col">
            <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-brand-300 bg-white px-3 py-1 text-xs font-semibold text-brand-700 shadow-soft">
              <GraduationCap className="size-3.5" aria-hidden />
              BARU · Produk Kursus
            </span>
            <h2 className="mt-4 font-display text-3xl font-semibold tracking-tight text-neutral-900 sm:text-4xl">
              Punya ilmu?{" "}
              <span className="text-gradient-brand">Jual jadi kelas online.</span>
            </h2>
            <p className="mt-4 text-lg text-neutral-700">
              Bikin kelas video tanpa platform terpisah. Pembeli bayar, dapat
              akses kelas otomatis lewat email — terlindungi OTP, dengan masa
              aktif yang kamu atur sendiri.
            </p>

            <ul className="mt-8 flex flex-col gap-5">
              {benefits.map(({ icon: Icon, title, description }) => (
                <li key={title} className="flex items-start gap-4">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white text-brand-700 shadow-soft ring-1 ring-brand-200">
                    <Icon className="size-5" strokeWidth={2} aria-hidden />
                  </div>
                  <div>
                    <p className="font-semibold text-neutral-900">{title}</p>
                    <p className="mt-1 text-sm leading-relaxed text-neutral-600">
                      {description}
                    </p>
                  </div>
                </li>
              ))}
            </ul>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Link href="/login">
                <Button size="lg">
                  Mulai Jual Kelas
                  <ArrowRight className="size-4" aria-hidden />
                </Button>
              </Link>
              <p className="text-xs text-neutral-500">
                Tersedia di semua plan · Video via YouTube
              </p>
            </div>
          </div>

          {/* Right: course-player mockup */}
          <div className="relative">
            {/* Floating "akses terverifikasi" tag */}
            <div className="pointer-events-none absolute -left-4 top-6 z-20 hidden rotate-[-4deg] items-center gap-1.5 rounded-full border border-brand-300 bg-white px-3 py-1.5 text-xs font-semibold text-brand-700 shadow-elevated sm:inline-flex">
              <MailCheck className="size-3" aria-hidden />
              Akses terverifikasi OTP
            </div>
            {/* Floating "masa aktif" tag */}
            <div className="pointer-events-none absolute -right-3 bottom-16 z-20 hidden rotate-[3deg] items-center gap-1.5 rounded-full border border-brand-300 bg-white px-3 py-1.5 text-xs font-semibold text-brand-700 shadow-elevated sm:inline-flex">
              <Clock className="size-3" aria-hidden />
              Berlaku 1 tahun
            </div>

            <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-popout">
              {/* Mock course header */}
              <div className="flex items-center justify-between border-b border-neutral-200 bg-neutral-50 px-4 py-3">
                <div className="flex items-center gap-2">
                  <GraduationCap
                    className="size-4 text-brand-700"
                    aria-hidden
                  />
                  <span className="text-sm font-semibold text-neutral-900">
                    Kelas Donat Premium
                  </span>
                </div>
                <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-[10px] font-semibold text-success">
                  <Lock className="size-2.5" aria-hidden />
                  Akses Aktif
                </span>
              </div>

              {/* Video player area */}
              <div className="relative aspect-video bg-gradient-to-br from-neutral-900 to-neutral-700">
                <div className="absolute inset-0 flex items-center justify-center">
                  <PlayCircle
                    className="size-14 text-white/90 drop-shadow-lg"
                    strokeWidth={1.5}
                    aria-hidden
                  />
                </div>
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent px-4 pb-3 pt-8">
                  <p className="text-sm font-semibold text-white">
                    Teknik isian & topping
                  </p>
                  <p className="text-xs text-white/70">Pelajaran 3 dari 4</p>
                </div>
              </div>

              {/* Playlist */}
              <ul className="flex flex-col gap-1 p-3">
                {lessons.map((l, i) => (
                  <li
                    key={l.title}
                    className={
                      "flex items-center gap-3 rounded-lg px-2.5 py-2 " +
                      (l.active ? "bg-brand-50 ring-1 ring-brand-200" : "")
                    }
                  >
                    {l.done ? (
                      <CheckCircle2
                        className="size-4 shrink-0 text-success"
                        aria-hidden
                      />
                    ) : (
                      <span
                        className={
                          "flex size-4 shrink-0 items-center justify-center rounded-full text-[9px] font-bold " +
                          (l.active
                            ? "bg-brand-600 text-white"
                            : "border border-neutral-300 text-neutral-400")
                        }
                      >
                        {i + 1}
                      </span>
                    )}
                    <p
                      className={
                        "min-w-0 flex-1 truncate text-sm " +
                        (l.active
                          ? "font-semibold text-brand-800"
                          : "text-neutral-700")
                      }
                    >
                      {l.title}
                    </p>
                    <span className="shrink-0 text-xs tabular-nums text-neutral-400">
                      {l.duration}
                    </span>
                  </li>
                ))}
              </ul>

              {/* Masa aktif footer */}
              <div className="flex items-center gap-2 border-t border-neutral-100 bg-neutral-50/60 px-4 py-3">
                <Clock className="size-4 text-brand-600" aria-hidden />
                <p className="flex-1 text-xs text-neutral-600">
                  Akses berlaku sampai{" "}
                  <strong className="text-neutral-900">14 Jun 2027</strong>
                </p>
                <span className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-semibold text-brand-700">
                  2/4 selesai
                </span>
              </div>
            </div>
          </div>
        </div>
      </Container>
    </Section>
  );
}
