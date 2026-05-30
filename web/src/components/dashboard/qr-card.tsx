import { QRCodeSVG } from "qrcode.react";

// QR card layout templates for the printable table-QR card. Everything is
// styled with INLINE styles (not Tailwind) on purpose: the exact same
// component renders the live preview in-app AND is serialized via
// renderToStaticMarkup() into the print window — where Tailwind classes
// wouldn't apply. The QR modules always stay dark-on-white for reliable
// scanning regardless of the card theme.

export type QrLayout = "classic" | "tent" | "poster";

export type QrCardConfig = {
  layout: QrLayout;
  bg: string; // card background color
  fg: string; // card text color
  headline: string;
  caption: string;
  storeName: string;
};

const QR_DARK = "#0F172A";
const FONT = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";

// Decorative zigzag strip along the bottom edge (drawn in the text color).
function Zigzag({ color, width }: { color: string; width: number }) {
  return (
    <svg
      width={width}
      height={16}
      viewBox="0 0 80 6"
      preserveAspectRatio="none"
      style={{ position: "absolute", left: 0, bottom: 0, opacity: 0.3 }}
    >
      <path
        d="M0 6 L5 1 L10 6 L15 1 L20 6 L25 1 L30 6 L35 1 L40 6 L45 1 L50 6 L55 1 L60 6 L65 1 L70 6 L75 1 L80 6"
        fill="none"
        stroke={color}
        strokeWidth={1.2}
      />
    </svg>
  );
}

export function QrCard({
  config,
  url,
  label,
}: {
  config: QrCardConfig;
  url: string;
  label: string;
}) {
  const { layout, bg, fg } = config;
  const headline =
    config.headline.trim() ||
    (layout === "classic" ? "" : "Scan di Sini");
  const caption = config.caption.trim();
  const store = config.storeName.trim();

  const qr = (size: number) => (
    <div
      style={{
        background: "#ffffff",
        padding: 10,
        borderRadius: 12,
        lineHeight: 0,
        flexShrink: 0,
        boxShadow: "0 1px 4px rgba(0,0,0,0.12)",
      }}
    >
      <QRCodeSVG value={url} size={size} fgColor={QR_DARK} bgColor="#ffffff" />
    </div>
  );

  // ── Tent: landscape table-tent (QR left, big headline right) ──────────
  if (layout === "tent") {
    return (
      <div
        style={{
          width: 440,
          height: 248,
          borderRadius: 18,
          background: bg,
          color: fg,
          fontFamily: FONT,
          display: "flex",
          alignItems: "center",
          gap: 20,
          padding: 22,
          position: "relative",
          overflow: "hidden",
          boxSizing: "border-box",
        }}
      >
        {qr(150)}
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", minWidth: 0 }}>
          {store && (
            <div style={{ fontSize: 13, fontWeight: 700, opacity: 0.85, marginBottom: 6 }}>
              {store}
            </div>
          )}
          <div style={{ fontSize: 27, fontWeight: 800, lineHeight: 1.05, textTransform: "uppercase", letterSpacing: 0.4 }}>
            {headline}
          </div>
          {caption && (
            <div style={{ marginTop: 8, fontSize: 15, opacity: 0.92, whiteSpace: "pre-line", lineHeight: 1.35 }}>
              {caption}
            </div>
          )}
          <div style={{ marginTop: 12, fontSize: 11, fontWeight: 700, opacity: 0.8, textTransform: "uppercase", letterSpacing: 0.5 }}>
            Meja {label}
          </div>
        </div>
        <Zigzag color={fg} width={440} />
      </div>
    );
  }

  // ── Poster: portrait, big QR centered ─────────────────────────────────
  if (layout === "poster") {
    return (
      <div
        style={{
          width: 300,
          height: 430,
          borderRadius: 18,
          background: bg,
          color: fg,
          fontFamily: FONT,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          textAlign: "center",
          padding: 26,
          position: "relative",
          overflow: "hidden",
          boxSizing: "border-box",
        }}
      >
        {store && <div style={{ fontSize: 14, fontWeight: 700, opacity: 0.85 }}>{store}</div>}
        <div style={{ marginTop: 8, fontSize: 24, fontWeight: 800, textTransform: "uppercase", lineHeight: 1.1 }}>
          {headline}
        </div>
        <div style={{ marginTop: 20 }}>{qr(184)}</div>
        {caption && (
          <div style={{ marginTop: 16, fontSize: 15, opacity: 0.92, whiteSpace: "pre-line", lineHeight: 1.35 }}>
            {caption}
          </div>
        )}
        <div style={{ marginTop: "auto", fontSize: 12, fontWeight: 700, opacity: 0.8, textTransform: "uppercase", letterSpacing: 0.5 }}>
          Meja {label}
        </div>
        <Zigzag color={fg} width={300} />
      </div>
    );
  }

  // ── Classic: clean white card (neutral, theme-independent) ────────────
  return (
    <div
      style={{
        width: 280,
        height: 360,
        borderRadius: 18,
        background: "#ffffff",
        color: "#0F172A",
        border: "1px solid #e5e7eb",
        fontFamily: FONT,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        textAlign: "center",
        padding: 24,
        boxSizing: "border-box",
      }}
    >
      {store && <div style={{ fontSize: 13, fontWeight: 600, color: "#64748b" }}>{store}</div>}
      <div style={{ marginTop: 4, fontSize: 20, fontWeight: 700 }}>Meja {label}</div>
      <div style={{ marginTop: 18 }}>
        <div
          style={{
            background: "#ffffff",
            padding: 10,
            border: "1px solid #e5e7eb",
            borderRadius: 12,
            lineHeight: 0,
          }}
        >
          <QRCodeSVG value={url} size={160} fgColor={QR_DARK} bgColor="#ffffff" />
        </div>
      </div>
      {headline && <div style={{ marginTop: 16, fontSize: 16, fontWeight: 700 }}>{headline}</div>}
      {caption && (
        <div style={{ marginTop: 6, fontSize: 14, color: "#64748b", whiteSpace: "pre-line" }}>
          {caption}
        </div>
      )}
    </div>
  );
}
