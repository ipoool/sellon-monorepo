import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Globe,
  Server,
  Database,
  Info,
} from "lucide-react";

import { Container } from "@/components/layout/container";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { Section } from "@/components/layout/section";
import { Badge } from "@/components/ui/badge";
import { getMe } from "@/lib/server-auth";
import { pageMetadata } from "@/lib/seo";

// Status page is realtime — we don't want Google to cache stale "all
// systems operational" snapshots, so it's noindex.
export const metadata = pageMetadata({
  title: "Status Layanan",
  description:
    "Status real-time layanan SellOn - diperbarui setiap kali halaman diakses.",
  path: "/status",
  noindex: true,
});

// Status checks are intentionally simple. We probe two endpoints
// server-side at request time:
//   - GET /api/v1/info → liveness; reads config only, always fast.
//   - GET /api/v1/plans → DB health; queries the plans table so it fails
//     if Postgres is down or migrations haven't run.
// We don't store history - there's no monitoring backend yet. Honesty
// over fake 99.99% bars.

type ServiceStatus = "operational" | "degraded" | "down";
type ServiceCheck = {
  name: string;
  description: string;
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  status: ServiceStatus;
  detail?: string;
};

const apiInternal =
  process.env.API_INTERNAL_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://localhost:8080";

async function probe(path: string, timeoutMs = 4000): Promise<{ ok: boolean; status: number; ms: number }> {
  const t0 = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${apiInternal}${path}`, {
      cache: "no-store",
      signal: ctrl.signal,
    });
    return { ok: res.ok, status: res.status, ms: Date.now() - t0 };
  } catch {
    return { ok: false, status: 0, ms: Date.now() - t0 };
  } finally {
    clearTimeout(timer);
  }
}

export default async function StatusPage() {
  // Run me + probes in parallel.
  const [me, info, plans] = await Promise.all([
    getMe(),
    probe("/api/v1/info"),
    probe("/api/v1/plans"),
  ]);

  const apiStatus: ServiceStatus = info.ok ? "operational" : "down";
  const apiDetail = info.ok
    ? `OK · ${info.ms}ms`
    : `Tidak merespon (HTTP ${info.status || "-"})`;

  const dbStatus: ServiceStatus = plans.ok ? "operational" : "down";
  const dbDetail = plans.ok
    ? `OK · ${plans.ms}ms`
    : `Tidak merespon (HTTP ${plans.status || "-"})`;

  const services: ServiceCheck[] = [
    {
      name: "Aplikasi Web",
      description: "Halaman ini sedang ter-render - berarti web app aktif.",
      icon: Globe,
      status: "operational",
      detail: "OK",
    },
    {
      name: "API",
      description: "Endpoint utama untuk auth, produk, dan pesanan.",
      icon: Server,
      status: apiStatus,
      detail: apiDetail,
    },
    {
      name: "Database & layanan internal",
      description: "Probe via /api/v1/plans - gagal kalau DB / migrasi bermasalah.",
      icon: Database,
      status: dbStatus,
      detail: dbDetail,
    },
  ];

  const overall: ServiceStatus = services.some((s) => s.status === "down")
    ? "down"
    : services.some((s) => s.status === "degraded")
      ? "degraded"
      : "operational";

  const lastChecked = new Date().toLocaleString("id-ID", {
    timeZone: "Asia/Jakarta",
    dateStyle: "long",
    timeStyle: "short",
  });

  return (
    <>
      <Header me={me} />
      <main>
        {/* Overall banner */}
        <section
          className={
            overall === "operational"
              ? "border-b border-success/20 bg-success/5 py-12"
              : overall === "degraded"
                ? "border-b border-warning/30 bg-warning/10 py-12"
                : "border-b border-danger/30 bg-danger/5 py-12"
          }
        >
          <Container>
            <div className="mx-auto max-w-3xl text-center">
              <OverallPill status={overall} />
              <h1 className="mt-6 font-display text-4xl font-semibold tracking-tight text-neutral-900 sm:text-5xl">
                Status SellOn
              </h1>
              <p className="mt-4 text-lg text-neutral-600">
                Hasil probe langsung saat halaman ini diakses - tidak ada
                cache, tidak ada riwayat palsu.
              </p>
              <p className="mt-2 text-sm text-neutral-500">
                Dicek pada {lastChecked} WIB
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
                    className="flex flex-col gap-3 rounded-xl border border-neutral-200 bg-white p-5 shadow-card sm:flex-row sm:items-center sm:gap-4"
                  >
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-neutral-100 text-neutral-600">
                      <s.icon className="size-5" aria-hidden />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-neutral-900">{s.name}</p>
                      <p className="text-sm text-neutral-600">
                        {s.description}
                      </p>
                      {s.detail && (
                        <p className="mt-1 font-mono text-xs text-neutral-500">
                          {s.detail}
                        </p>
                      )}
                    </div>
                    <StatusBadge status={s.status} />
                  </li>
                ))}
              </ul>

              <div className="mt-6 flex items-start gap-3 rounded-xl border border-neutral-200 bg-neutral-50 p-4 text-sm text-neutral-700">
                <Info className="mt-0.5 size-4 shrink-0 text-neutral-500" aria-hidden />
                <p className="leading-relaxed">
                  Halaman ini self-reported. SellOn belum punya monitoring
                  pihak ketiga (StatusPage, BetterStack, dsb.). Kami tampilkan
                  hasil probe yang baru saja dijalankan dari server web - bukan
                  uptime historis.
                </p>
              </div>
            </div>
          </Container>
        </Section>

        {/* Got an issue? */}
        <Section bg="alt" tight>
          <Container>
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="font-display text-2xl font-semibold tracking-tight text-neutral-900 sm:text-3xl">
                Kalau halaman ini bilang &ldquo;normal&rdquo; tapi kamu tetap
                bermasalah
              </h2>
              <p className="mt-3 text-neutral-700">
                Probe kami bisa pass meski ada bug spesifik di fitur tertentu.
                Hubungi support untuk laporkan masalah:
              </p>
              <div className="mt-6 flex flex-col items-center gap-2 sm:flex-row sm:justify-center">
                <a
                  href="mailto:halo@sellon.id"
                  className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-4 text-sm font-medium text-neutral-800 transition-colors hover:border-neutral-300"
                >
                  halo@sellon.id
                </a>
                <a
                  href="https://wa.me/6281291006534"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-success px-4 text-sm font-semibold text-white transition-colors hover:bg-success/90"
                >
                  WhatsApp 0812-9100-6534
                </a>
              </div>
            </div>
          </Container>
        </Section>
      </main>
      <Footer />
    </>
  );
}

function OverallPill({ status }: { status: ServiceStatus }) {
  if (status === "operational") {
    return (
      <div className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-1.5 text-sm font-medium text-success shadow-soft">
        <CheckCircle2 className="size-4" aria-hidden />
        Semua sistem normal
      </div>
    );
  }
  if (status === "degraded") {
    return (
      <div className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-1.5 text-sm font-medium text-neutral-800 shadow-soft">
        <AlertTriangle className="size-4 text-warning" aria-hidden />
        Kinerja menurun
      </div>
    );
  }
  return (
    <div className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-1.5 text-sm font-medium text-danger shadow-soft">
      <XCircle className="size-4" aria-hidden />
      Ada layanan yang turun
    </div>
  );
}

function StatusBadge({ status }: { status: ServiceStatus }) {
  if (status === "operational") return <Badge variant="success">● Normal</Badge>;
  if (status === "degraded") return <Badge variant="warning">● Menurun</Badge>;
  return <Badge variant="danger">● Down</Badge>;
}
