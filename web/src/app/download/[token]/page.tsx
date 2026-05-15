import type { Metadata } from "next";
import Link from "next/link";
import { Download, ExternalLink, ShieldCheck, Info } from "lucide-react";

import { Container } from "@/components/layout/container";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getMe } from "@/lib/server-auth";
import { serverApi } from "@/lib/server-api";

type Params = Promise<{ token: string }>;

type DownloadDTO = {
  store_name: string;
  store_slug: string;
  order_number: string;
  customer_name: string;
  product_name: string;
  variant_name: string;
  digital_delivery_url: string;
  digital_file_url: string;
  digital_instructions: string;
  issued_at: string;
  expires_at?: string;
  consumed_count: number;
};

export const metadata: Metadata = {
  title: "Download Pesanan - SellOn",
  description: "Halaman akses produk digital kamu.",
};

function formatDate(iso: string): string {
  if (!iso) return "-";
  return new Date(iso).toLocaleString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function DownloadPage({ params }: { params: Params }) {
  const { token } = await params;
  const [me, data] = await Promise.all([
    getMe(),
    serverApi<{ download: DownloadDTO }>(
      `/api/v1/download/${encodeURIComponent(token)}`,
    ),
  ]);

  if (!data?.download) {
    return (
      <>
        <Header me={me} />
        <main className="py-16 lg:py-24">
          <Container>
            <div className="mx-auto max-w-md">
              <Card>
                <div className="flex flex-col items-center gap-3 py-6 text-center">
                  <div className="flex size-12 items-center justify-center rounded-full bg-danger/10 text-danger">
                    <Info className="size-6" aria-hidden />
                  </div>
                  <h1 className="font-display text-xl font-semibold text-neutral-900">
                    Link tidak valid
                  </h1>
                  <p className="max-w-sm text-sm text-neutral-600">
                    Link download ini tidak ditemukan atau sudah dicabut.
                    Pastikan kamu pakai URL terbaru dari email atau dari
                    halaman pesanan setelah pembayaran. Kalau tetap
                    bermasalah, hubungi penjual.
                  </p>
                  <Link
                    href="/"
                    className="mt-2 text-sm font-medium text-brand-600 hover:text-brand-700"
                  >
                    ← Kembali ke beranda
                  </Link>
                </div>
              </Card>
            </div>
          </Container>
        </main>
        <Footer />
      </>
    );
  }

  const d = data.download;
  const hasURL = d.digital_delivery_url.trim() !== "";
  const hasFile = d.digital_file_url.trim() !== "";
  const hasInstructions = d.digital_instructions.trim() !== "";

  return (
    <>
      <Header me={me} />
      <main className="py-12 lg:py-16">
        <Container>
          <div className="mx-auto max-w-2xl">
            <header className="mb-8 text-center">
              <Badge variant="success" className="gap-1">
                <ShieldCheck className="size-3" aria-hidden />
                Pembayaran lunas
              </Badge>
              <h1 className="mt-4 font-display text-3xl font-semibold tracking-tight text-neutral-900 sm:text-4xl">
                Pesanan kamu siap diakses 🎉
              </h1>
              <p className="mt-3 text-neutral-600">
                Halo <span className="font-medium">{d.customer_name}</span>,
                terima kasih sudah belanja di{" "}
                <Link
                  href={`/${d.store_slug}`}
                  className="font-medium text-brand-600 hover:text-brand-700"
                >
                  {d.store_name}
                </Link>
                .
              </p>
            </header>

            <Card>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
                    Produk
                  </p>
                  <p className="mt-1 font-semibold text-neutral-900">
                    {d.product_name}
                    {d.variant_name && (
                      <span className="ml-1 font-normal text-neutral-500">
                        - {d.variant_name}
                      </span>
                    )}
                  </p>
                </div>
                <Badge variant="outline" className="font-mono text-[10px]">
                  #{d.order_number}
                </Badge>
              </div>

              <div className="mt-6 flex flex-col gap-3">
                {hasURL && (
                  <a
                    href={d.digital_delivery_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group flex items-start justify-between gap-4 rounded-lg border border-brand-200 bg-brand-50/40 p-4 transition-colors hover:border-brand-300 hover:bg-brand-50/70"
                  >
                    <div className="min-w-0">
                      <p className="font-semibold text-neutral-900">
                        Buka link akses
                      </p>
                      <p className="mt-0.5 truncate text-xs text-neutral-600">
                        {d.digital_delivery_url}
                      </p>
                    </div>
                    <ExternalLink
                      className="mt-1 size-4 shrink-0 text-brand-700 transition-transform group-hover:translate-x-0.5"
                      aria-hidden
                    />
                  </a>
                )}

                {hasFile && (
                  <a
                    href={d.digital_file_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    download
                    className="group flex items-start justify-between gap-4 rounded-lg border border-neutral-200 bg-white p-4 transition-colors hover:border-brand-300 hover:bg-brand-50/30"
                  >
                    <div className="min-w-0">
                      <p className="font-semibold text-neutral-900">
                        Download file
                      </p>
                      <p className="mt-0.5 truncate text-xs text-neutral-600">
                        Klik untuk simpan ke device-mu
                      </p>
                    </div>
                    <Download
                      className="mt-1 size-4 shrink-0 text-neutral-700"
                      aria-hidden
                    />
                  </a>
                )}

                {hasInstructions && (
                  <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-4">
                    <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
                      Instruksi dari Penjual
                    </p>
                    <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-neutral-800">
                      {d.digital_instructions}
                    </p>
                  </div>
                )}

                {!hasURL && !hasFile && !hasInstructions && (
                  <div className="rounded-lg border border-warning/40 bg-warning/10 p-4 text-sm text-neutral-800">
                    Penjual belum mengisi info delivery. Hubungi penjual untuk
                    bantuan.
                  </div>
                )}
              </div>

              <dl className="mt-6 grid grid-cols-1 gap-2 border-t border-neutral-200 pt-4 text-xs text-neutral-500 sm:grid-cols-3">
                <div>
                  <dt className="font-semibold uppercase tracking-wider">
                    Diterbitkan
                  </dt>
                  <dd className="mt-0.5 text-neutral-700">
                    {formatDate(d.issued_at)}
                  </dd>
                </div>
                {d.expires_at && (
                  <div>
                    <dt className="font-semibold uppercase tracking-wider">
                      Berlaku sampai
                    </dt>
                    <dd className="mt-0.5 text-neutral-700">
                      {formatDate(d.expires_at)}
                    </dd>
                  </div>
                )}
                <div>
                  <dt className="font-semibold uppercase tracking-wider">
                    Akses
                  </dt>
                  <dd className="mt-0.5 text-neutral-700">
                    {d.consumed_count + 1}× dibuka
                  </dd>
                </div>
              </dl>
            </Card>

            <p className="mt-6 text-center text-xs text-neutral-500">
              Link ini bersifat pribadi - jangan disebar. Kalau ada masalah,
              hubungi <span className="font-medium">{d.store_name}</span>.
            </p>
          </div>
        </Container>
      </main>
      <Footer />
    </>
  );
}
