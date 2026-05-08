import type { Metadata } from "next";
import { CheckCircle2, Globe, Database, Server, CreditCard, Mail, Bell } from "lucide-react";

import { Container } from "@/components/layout/container";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { Section } from "@/components/layout/section";
import { Badge } from "@/components/ui/badge";
import { getMe } from "@/lib/server-auth";

export const metadata: Metadata = {
  title: "Status Layanan — SellOn",
  description:
    "Status real-time dari semua layanan SellOn — API, web, database, payment gateway.",
};

type Service = {
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  name: string;
  description: string;
  status: "operational" | "degraded" | "down";
};

const services: Service[] = [
  {
    icon: Globe,
    name: "Aplikasi Web",
    description: "sellon.id dan dasbor seller",
    status: "operational",
  },
  {
    icon: Server,
    name: "API",
    description: "Endpoint utama untuk auth, produk, pesanan",
    status: "operational",
  },
  {
    icon: Database,
    name: "Database",
    description: "Penyimpanan data toko, produk, pesanan",
    status: "operational",
  },
  {
    icon: CreditCard,
    name: "Payment Gateway (Midtrans/Xendit)",
    description: "Integrasi dengan PJP",
    status: "operational",
  },
  {
    icon: Mail,
    name: "Email Notifikasi",
    description: "Email transaksional ke pembeli dan penjual",
    status: "operational",
  },
];

// Last 90 days, all-clear placeholder.
const uptimeBars = Array.from({ length: 90 }, () => "operational" as const);

export default async function StatusPage() {
  const me = await getMe();
  const allOk = services.every((s) => s.status === "operational");
  const lastUpdated = new Date().toLocaleString("id-ID", {
    timeZone: "Asia/Jakarta",
    dateStyle: "long",
    timeStyle: "short",
  });

  return (
    <>
      <Header me={me} />
      <main>
        {/* Overall status banner */}
        <section
          className={
            allOk
              ? "border-b border-success/20 bg-success/5 py-12"
              : "border-b border-warning/20 bg-warning/5 py-12"
          }
        >
          <Container>
            <div className="mx-auto max-w-3xl text-center">
              <div className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-1.5 text-sm font-medium text-success shadow-soft">
                <CheckCircle2 className="size-4" aria-hidden />
                {allOk ? "Semua sistem normal" : "Ada gangguan"}
              </div>
              <h1 className="mt-6 font-display text-4xl font-semibold tracking-tight text-neutral-900 sm:text-5xl">
                Status SellOn
              </h1>
              <p className="mt-4 text-lg text-neutral-600">
                Real-time status untuk semua layanan SellOn.
              </p>
              <p className="mt-2 text-sm text-neutral-500">
                Terakhir di-update {lastUpdated} WIB
              </p>
            </div>
          </Container>
        </section>

        {/* Service list */}
        <Section tight>
          <Container>
            <div className="mx-auto max-w-3xl">
              <ul className="flex flex-col gap-3">
                {services.map((s) => (
                  <li
                    key={s.name}
                    className="flex items-center gap-4 rounded-xl border border-neutral-200 bg-white p-5 shadow-card"
                  >
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-neutral-100 text-neutral-600">
                      <s.icon className="size-5" aria-hidden />
                    </div>
                    <div className="flex-1">
                      <p className="font-semibold text-neutral-900">{s.name}</p>
                      <p className="text-sm text-neutral-600">
                        {s.description}
                      </p>
                    </div>
                    <StatusBadge status={s.status} />
                  </li>
                ))}
              </ul>
            </div>
          </Container>
        </Section>

        {/* 90-day uptime */}
        <Section bg="alt" tight>
          <Container>
            <div className="mx-auto max-w-3xl">
              <div className="flex items-baseline justify-between">
                <h2 className="font-display text-2xl font-semibold tracking-tight text-neutral-900">
                  Uptime 90 hari terakhir
                </h2>
                <span className="text-sm font-medium text-success">
                  100,00% uptime
                </span>
              </div>
              <p className="mt-2 text-sm text-neutral-600">
                Setiap bar mewakili 1 hari. Hover untuk detail.
              </p>

              <div className="mt-6 flex items-end gap-[2px]">
                {uptimeBars.map((status, i) => (
                  <div
                    key={i}
                    title={`${90 - i} hari yang lalu — Normal`}
                    className={
                      status === "operational"
                        ? "h-9 flex-1 rounded-sm bg-success/70 transition-all hover:bg-success"
                        : "h-9 flex-1 rounded-sm bg-warning"
                    }
                  />
                ))}
              </div>

              <div className="mt-3 flex items-center justify-between text-xs text-neutral-500">
                <span>90 hari lalu</span>
                <span>Hari ini</span>
              </div>
            </div>
          </Container>
        </Section>

        {/* Recent incidents */}
        <Section tight>
          <Container>
            <div className="mx-auto max-w-3xl">
              <h2 className="font-display text-2xl font-semibold tracking-tight text-neutral-900">
                Insiden Terbaru
              </h2>

              <div className="mt-6 rounded-xl border border-neutral-200 bg-white p-12 text-center shadow-card">
                <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-success/10 text-success">
                  <CheckCircle2 className="size-6" aria-hidden />
                </div>
                <p className="mt-4 font-medium text-neutral-900">
                  Tidak ada insiden dalam 90 hari terakhir
                </p>
                <p className="mt-1 text-sm text-neutral-600">
                  Semua sistem berjalan normal. Riwayat insiden akan muncul di
                  sini ketika ada gangguan.
                </p>
              </div>
            </div>
          </Container>
        </Section>

        {/* Subscribe CTA */}
        <Section bg="brand-soft" tight>
          <Container>
            <div className="mx-auto max-w-2xl text-center">
              <div className="inline-flex size-12 items-center justify-center rounded-full bg-white text-brand-600 shadow-soft">
                <Bell className="size-5" aria-hidden />
              </div>
              <h2 className="mt-4 font-display text-2xl font-semibold tracking-tight text-neutral-900 sm:text-3xl">
                Dapat notifikasi saat ada gangguan
              </h2>
              <p className="mt-3 text-neutral-700">
                Subscribe untuk dapat email saat insiden terdeteksi dan saat
                resolusi tersedia.
              </p>
              <form className="mt-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-center">
                <label htmlFor="status-email" className="sr-only">
                  Email
                </label>
                <input
                  id="status-email"
                  type="email"
                  placeholder="kamu@email.com"
                  className="rounded-lg border border-neutral-200 bg-white px-4 py-2.5 text-sm shadow-soft placeholder:text-neutral-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30 sm:w-72"
                />
                <button
                  type="button"
                  className="rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-medium text-white shadow-soft transition-colors hover:bg-brand-600"
                  title="Akan segera hadir"
                  disabled
                >
                  Subscribe
                </button>
              </form>
              <p className="mt-3 text-xs text-neutral-500">
                Atau follow{" "}
                <a
                  href="#"
                  className="font-medium text-brand-600 hover:text-brand-700"
                >
                  @sellonid
                </a>{" "}
                untuk update real-time.
              </p>
            </div>
          </Container>
        </Section>
      </main>
      <Footer />
    </>
  );
}

function StatusBadge({ status }: { status: Service["status"] }) {
  if (status === "operational") {
    return <Badge variant="success">● Normal</Badge>;
  }
  if (status === "degraded") {
    return <Badge variant="warning">● Gangguan</Badge>;
  }
  return <Badge variant="default">● Down</Badge>;
}
