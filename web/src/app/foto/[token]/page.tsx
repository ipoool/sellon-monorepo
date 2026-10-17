import { Download, ImageOff, Clock } from "lucide-react";

import { Container } from "@/components/layout/container";
import { publicServerApi } from "@/lib/server-api";
import { pageMetadata } from "@/lib/seo";

// Not indexable: these are photographs of members of the public, reachable
// only by the token printed in a QR on the booth screen.
export const metadata = {
  ...pageMetadata({
    title: "Foto kamu",
    description: "Simpan hasil foto dari PhotoBoost.",
    path: "/foto",
  }),
  robots: { index: false, follow: false },
};

type PhotoResponse = {
  image_url: string;
  taken_at: string;
  expires_at: string;
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function FotoPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const data = await publicServerApi<PhotoResponse>(
    `/api/v1/photobooth/photo/${encodeURIComponent(token)}`,
  );

  if (!data?.image_url) {
    return (
      <main className="flex min-h-svh items-center justify-center bg-neutral-50">
        <Container>
          <div className="mx-auto max-w-[44ch] text-center">
            <span className="mx-auto grid size-16 place-items-center rounded-2xl bg-neutral-100">
              <ImageOff className="size-7 text-neutral-400" aria-hidden />
            </span>
            <h1 className="mt-5 font-display text-2xl font-bold tracking-[-0.02em] text-neutral-900">
              Foto tidak ditemukan
            </h1>
            <p className="mt-2 text-[15px] leading-relaxed text-neutral-600">
              Link-nya mungkin salah ketik, atau fotonya sudah lewat masa
              simpan. Coba scan ulang QR di layar booth.
            </p>
          </div>
        </Container>
      </main>
    );
  }

  return (
    <main className="min-h-svh bg-neutral-50 py-10">
      <Container>
        <div className="mx-auto max-w-[520px]">
          <div className="text-center">
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-brand-700">
              PhotoBoost
            </p>
            <h1 className="mt-2 font-display text-3xl font-bold tracking-[-0.02em] text-neutral-900">
              Foto kamu sudah siap
            </h1>
            <p className="mt-2 text-[15px] leading-relaxed text-neutral-600">
              Diambil {formatDate(data.taken_at)}
            </p>
          </div>

          <div className="mt-6 overflow-hidden rounded-3xl border border-neutral-200 bg-white p-3 shadow-elevated">
            {/* A plain img, not next/image: the file lives behind the API's
                file proxy on a host Next cannot be told about at build time. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={data.image_url}
              alt="Hasil foto"
              className="w-full rounded-2xl"
            />
          </div>

          {/* A plain anchor with download: the file is same-origin through
              the API proxy, so the browser saves it rather than navigating. */}
          <a
            href={data.image_url}
            download="photoboost.png"
            className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-full bg-brand-600 px-5 py-4 text-sm font-bold text-white transition-colors hover:bg-brand-700"
          >
            <Download className="size-4" aria-hidden />
            Simpan foto
          </a>

          <p className="mt-4 flex items-center justify-center gap-1.5 text-xs text-neutral-500">
            <Clock className="size-3.5" aria-hidden />
            Link berlaku sampai {formatDate(data.expires_at)}
          </p>
        </div>
      </Container>
    </main>
  );
}
