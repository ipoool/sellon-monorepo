"use client";

import { useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Download, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { showError } from "@/lib/toast";
import { Dialog } from "@/components/admin/admin-partners-manager";

// Inline styles, system fonts, and literal colours throughout this card —
// not Tailwind tokens. The card is serialised into a standalone SVG and
// rasterised inside an isolated image context, where no stylesheet and no
// web font is available. Same reason qr-card.tsx does it for table QRs.
const FONT = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
const INK = "#0F172A";
const BRAND = "#15803D";
const MUTED = "#64748B";

// Rendered big on purpose. A partner prints this on a roll-up banner or a
// backdrop, and a 256px QR blown up to A1 is a blurry rectangle nobody can
// scan — which would be discovered at the event, by which point it is too
// late to fix.
const CARD_W = 1080;
const CARD_H = 1420;
const QR_SIZE = 720;
const QR_ONLY_SIZE = 1024;

/**
 * Turns a serialised SVG string into a PNG the browser downloads.
 *
 * Canvas rather than a library: the repo already ships qrcode.react and
 * nothing else here needs a rasteriser. The object URL is revoked once the
 * click has been dispatched, so a few of these in a session cost nothing.
 */
async function downloadSvgAsPng(
  svg: string,
  width: number,
  height: number,
  filename: string,
) {
  const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("Gagal memuat gambar"));
      img.src = url;
    });

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas tidak tersedia");
    // The QR needs a solid quiet zone. A transparent PNG dropped onto a dark
    // slide inverts the modules and stops scanning.
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);

    const pngBlob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/png"),
    );
    if (!pngBlob) throw new Error("Gagal membuat PNG");

    const pngUrl = URL.createObjectURL(pngBlob);
    const a = document.createElement("a");
    a.href = pngUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(pngUrl), 1000);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function serialize(node: SVGSVGElement): string {
  const clone = node.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  return new XMLSerializer().serializeToString(clone);
}

export function PartnerQrDialog({
  partnerName,
  code,
  url,
  onClose,
}: {
  partnerName: string;
  code: string;
  url: string;
  onClose: () => void;
}) {
  const cardRef = useRef<SVGSVGElement>(null);
  const plainRef = useRef<SVGSVGElement>(null);
  const [busy, setBusy] = useState<"card" | "plain" | null>(null);

  async function download(kind: "card" | "plain") {
    const node = kind === "card" ? cardRef.current : plainRef.current;
    if (!node) return;
    setBusy(kind);
    try {
      await downloadSvgAsPng(
        serialize(node),
        kind === "card" ? CARD_W : QR_ONLY_SIZE,
        kind === "card" ? CARD_H : QR_ONLY_SIZE,
        kind === "card"
          ? `sellon-partner-${code}-kartu.png`
          : `sellon-partner-${code}-qr.png`,
      );
    } catch (e) {
      showError(e instanceof Error ? e.message : "Gagal mengunduh");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Dialog onClose={onClose} title={`QR untuk ${partnerName}`}>
      <p className="text-sm leading-relaxed text-neutral-600">
        Scan QR ini membuka link partner, jadi pendaftarnya tetap tercatat —
        sama persis seperti kalau link-nya diklik.
      </p>

      {/* Preview. The card is drawn once at full size and scaled down by CSS,
          so what is previewed is literally what downloads. */}
      <div className="mt-4 flex justify-center rounded-xl border border-neutral-200 bg-neutral-50 p-4">
        <svg
          ref={cardRef}
          viewBox={`0 0 ${CARD_W} ${CARD_H}`}
          width={252}
          height={(252 * CARD_H) / CARD_W}
          xmlns="http://www.w3.org/2000/svg"
        >
          <rect width={CARD_W} height={CARD_H} fill="#FFFFFF" />
          <rect
            x={24}
            y={24}
            width={CARD_W - 48}
            height={CARD_H - 48}
            rx={48}
            fill="#F6FAF7"
            stroke="#D7E8DC"
            strokeWidth={4}
          />

          <text
            x={CARD_W / 2}
            y={168}
            textAnchor="middle"
            fontFamily={FONT}
            fontSize={52}
            fontWeight={800}
            fill={BRAND}
          >
            SellOn
          </text>
          <text
            x={CARD_W / 2}
            y={246}
            textAnchor="middle"
            fontFamily={FONT}
            fontSize={38}
            fill={MUTED}
          >
            Scan untuk daftar gratis
          </text>

          {/* White plate behind the modules: the quiet zone is what makes a
              code scannable off a patterned backdrop. */}
          <rect
            x={(CARD_W - QR_SIZE - 72) / 2}
            y={320}
            width={QR_SIZE + 72}
            height={QR_SIZE + 72}
            rx={36}
            fill="#FFFFFF"
            stroke="#E2E8F0"
            strokeWidth={3}
          />
          <g transform={`translate(${(CARD_W - QR_SIZE) / 2}, 356)`}>
            <QRCodeSVG
              value={url}
              size={QR_SIZE}
              fgColor={INK}
              bgColor="#FFFFFF"
              level="M"
            />
          </g>

          <text
            x={CARD_W / 2}
            y={1192}
            textAnchor="middle"
            fontFamily={FONT}
            fontSize={46}
            fontWeight={700}
            fill={INK}
          >
            {partnerName}
          </text>
          <text
            x={CARD_W / 2}
            y={1268}
            textAnchor="middle"
            fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
            fontSize={34}
            fill={MUTED}
          >
            {url.replace(/^https?:\/\//, "")}
          </text>
        </svg>
      </div>

      {/* Rendered off-screen at full size so the plain download is crisp. The
          preview above is a separate, scaled copy. */}
      <div aria-hidden className="pointer-events-none absolute -left-[9999px] top-0">
        <svg
          ref={plainRef}
          viewBox={`0 0 ${QR_ONLY_SIZE} ${QR_ONLY_SIZE}`}
          width={QR_ONLY_SIZE}
          height={QR_ONLY_SIZE}
          xmlns="http://www.w3.org/2000/svg"
        >
          <rect width={QR_ONLY_SIZE} height={QR_ONLY_SIZE} fill="#FFFFFF" />
          <g transform="translate(64, 64)">
            <QRCodeSVG
              value={url}
              size={QR_ONLY_SIZE - 128}
              fgColor={INK}
              bgColor="#FFFFFF"
              level="M"
            />
          </g>
        </svg>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
        <Button
          variant="outline"
          onClick={() => void download("plain")}
          disabled={busy !== null}
        >
          {busy === "plain" ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <Download className="size-4" aria-hidden />
          )}
          QR saja
        </Button>
        <Button onClick={() => void download("card")} disabled={busy !== null}>
          {busy === "card" ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <Download className="size-4" aria-hidden />
          )}
          Kartu siap cetak
        </Button>
      </div>

      <p className="mt-3 text-xs leading-relaxed text-neutral-500">
        Ukuran {CARD_W}×{CARD_H} px — cukup besar untuk dicetak jadi banner
        atau backdrop tanpa pecah.
      </p>
    </Dialog>
  );
}
