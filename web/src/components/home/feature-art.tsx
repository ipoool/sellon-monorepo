/**
 * Flat line illustrations, one per home feature.
 *
 * Hand-drawn SVG rather than image files on purpose: they carry no text (so
 * nothing to translate), they take their accent from `currentColor` and their
 * structure from the `--color-neutral-*` theme variables, so a brand-hue
 * change re-skins them with everything else. Keep each one simple — a few
 * shapes that read at a glance, never a scene.
 */

const INK = "var(--color-neutral-300)";
const PAPER = "var(--color-neutral-50)";
const MUTE = "var(--color-neutral-200)";

type ArtProps = { className?: string };

function Frame({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 320 220"
      fill="none"
      role="presentation"
      aria-hidden
      className={className}
    >
      {children}
    </svg>
  );
}

/** Storefront with its own awning — the shop is yours, not a stall in someone else's mall. */
export function ArtTokoOnline({ className }: ArtProps) {
  return (
    <Frame className={className}>
      <rect x="54" y="74" width="212" height="118" rx="14" fill={PAPER} stroke={INK} strokeWidth="2" />
      <path d="M54 88a14 14 0 0 1 14-14h184a14 14 0 0 1 14 14v10H54V88Z" fill="currentColor" />
      {[88, 122, 156, 190, 224].map((x) => (
        <rect key={x} x={x} y="74" width="17" height="24" fill="#fff" opacity="0.22" />
      ))}
      <rect x="76" y="118" width="74" height="54" rx="8" fill={MUTE} />
      <rect x="170" y="118" width="74" height="54" rx="8" fill="#fff" stroke={INK} strokeWidth="2" />
      <path d="M186 140h42M186 152h28" stroke={INK} strokeWidth="2" strokeLinecap="round" />
      <circle cx="244" cy="54" r="26" fill="currentColor" opacity="0.14" />
      <path
        d="M233 50h22l-2.5 20a3 3 0 0 1-3 2.6h-11a3 3 0 0 1-3-2.6L233 50Zm5-3a6 6 0 0 1 12 0v3"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Frame>
  );
}

/** Till with a receipt running out of it. */
export function ArtKasirPos({ className }: ArtProps) {
  return (
    <Frame className={className}>
      <rect x="46" y="104" width="150" height="86" rx="14" fill={PAPER} stroke={INK} strokeWidth="2" />
      <rect x="64" y="124" width="114" height="30" rx="7" fill="currentColor" opacity="0.16" />
      {[0, 1, 2, 3].map((i) => (
        <circle key={i} cx={78 + i * 30} cy="172" r="7" fill={MUTE} />
      ))}
      <path
        d="M196 42h78v132l-13-9-13 9-13-9-13 9-13-9-13 9V42Z"
        fill="#fff"
        stroke={INK}
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path d="M212 68h46M212 86h46M212 104h30" stroke={MUTE} strokeWidth="3" strokeLinecap="round" />
      <path d="M212 128h46" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
    </Frame>
  );
}

/** QR card standing on a table. */
export function ArtPesanDiMeja({ className }: ArtProps) {
  return (
    <Frame className={className}>
      <ellipse cx="160" cy="176" rx="96" ry="18" fill={MUTE} />
      <rect x="152" y="176" width="16" height="2" fill={INK} />
      <rect x="96" y="34" width="128" height="128" rx="18" fill="#fff" stroke={INK} strokeWidth="2" />
      {[
        [116, 54],
        [174, 54],
        [116, 112],
      ].map(([x, y]) => (
        <rect
          key={`${x}-${y}`}
          x={x}
          y={y}
          width="30"
          height="30"
          rx="8"
          stroke="currentColor"
          strokeWidth="6"
        />
      ))}
      {[
        [176, 114],
        [196, 114],
        [176, 134],
        [206, 134],
        [186, 124],
      ].map(([x, y]) => (
        <rect key={`${x}-${y}-d`} x={x} y={y} width="10" height="10" rx="2.5" fill="currentColor" />
      ))}
      <circle cx="246" cy="48" r="22" fill="currentColor" opacity="0.14" />
      <path
        d="M238 52a8 8 0 0 1 16 0c0 5 2 6 2 8h-20c0-2 2-3 2-8Zm5 12a3 3 0 0 0 6 0"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Frame>
  );
}

/** One seller at the centre, resellers branching off. */
export function ArtProgramReseller({ className }: ArtProps) {
  const nodes = [
    [68, 64],
    [252, 64],
    [68, 170],
    [252, 170],
  ];
  return (
    <Frame className={className}>
      {nodes.map(([x, y]) => (
        <path
          key={`l-${x}-${y}`}
          d={`M160 117 ${x} ${y}`}
          stroke={MUTE}
          strokeWidth="2.5"
          strokeDasharray="6 7"
          strokeLinecap="round"
        />
      ))}
      {nodes.map(([x, y]) => (
        <g key={`n-${x}-${y}`}>
          <circle cx={x} cy={y} r="28" fill="#fff" stroke={INK} strokeWidth="2" />
          <circle cx={x} cy={y - 6} r="7" fill={MUTE} />
          <path d={`M${x - 11} ${y + 14}a11 11 0 0 1 22 0`} fill={MUTE} />
        </g>
      ))}
      <circle cx="160" cy="117" r="40" fill="currentColor" />
      <circle cx="160" cy="107" r="11" fill="#fff" />
      <path d="M143 136a17 17 0 0 1 34 0" fill="#fff" />
    </Frame>
  );
}

/** A lesson playing, with its syllabus beside it. */
export function ArtKelasOnline({ className }: ArtProps) {
  return (
    <Frame className={className}>
      <rect x="40" y="46" width="168" height="112" rx="14" fill={PAPER} stroke={INK} strokeWidth="2" />
      <circle cx="124" cy="96" r="30" fill="currentColor" />
      <path d="M117 85l20 11-20 11V85Z" fill="#fff" />
      <rect x="60" y="136" width="128" height="6" rx="3" fill={MUTE} />
      <rect x="60" y="136" width="62" height="6" rx="3" fill="currentColor" />
      <rect x="224" y="58" width="60" height="88" rx="12" fill="#fff" stroke={INK} strokeWidth="2" />
      {[76, 100, 124].map((y, i) => (
        <g key={y}>
          <circle cx="242" cy={y} r="6" fill={i === 0 ? "currentColor" : MUTE} />
          <rect x="254" y={y - 3} width="18" height="6" rx="3" fill={MUTE} />
        </g>
      ))}
      <path d="M126 182h68" stroke={MUTE} strokeWidth="0" />
    </Frame>
  );
}

/** Crates on a shelf, with what they cost running underneath. */
export function ArtStokBahanBaku({ className }: ArtProps) {
  return (
    <Frame className={className}>
      <rect x="44" y="46" width="78" height="66" rx="12" fill="#fff" stroke={INK} strokeWidth="2" />
      <path d="M72 46v22l11-7 11 7V46" fill="currentColor" />
      <rect x="134" y="66" width="78" height="46" rx="12" fill="#fff" stroke={INK} strokeWidth="2" />
      <path d="M162 66v18l11-6 11 6V66" fill={MUTE} />
      <rect x="44" y="118" width="168" height="8" rx="4" fill={MUTE} />
      {[
        [238, 112, 36],
        [262, 92, 56],
        [286, 64, 84],
      ].map(([x, y, h]) => (
        <rect key={x} x={x} y={y} width="16" height={h} rx="6" fill="currentColor" opacity={x === 286 ? 1 : 0.4} />
      ))}
      <path d="M230 158h84" stroke={MUTE} strokeWidth="3" strokeLinecap="round" />
      <path d="M44 158h168" stroke={MUTE} strokeWidth="3" strokeLinecap="round" />
    </Frame>
  );
}

/** Phone with the things it would notify you about floating around it. */
export function ArtMobileApp({ className }: ArtProps) {
  return (
    <Frame className={className}>
      <circle cx="160" cy="112" r="92" fill="currentColor" opacity="0.08" />
      <rect x="112" y="24" width="96" height="176" rx="22" fill="#fff" stroke={INK} strokeWidth="2.5" />
      <rect x="146" y="36" width="28" height="5" rx="2.5" fill={MUTE} />
      <rect x="126" y="54" width="68" height="40" rx="10" fill="currentColor" />
      {[106, 128, 150].map((y) => (
        <g key={y}>
          <rect x="126" y={y} width="68" height="16" rx="6" fill={PAPER} stroke={MUTE} strokeWidth="1.5" />
          <rect x="132" y={y + 6} width="26" height="4" rx="2" fill={MUTE} />
        </g>
      ))}
      <circle cx="68" cy="68" r="26" fill="#fff" stroke={INK} strokeWidth="2" />
      <path
        d="M60 72a8 8 0 0 1 16 0c0 5 2 6 2 8H58c0-2 2-3 2-8Zm5 12a3 3 0 0 0 6 0"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="252" cy="150" r="30" fill="#fff" stroke={INK} strokeWidth="2" />
      <path d="M240 158l9-11 8 7 10-14" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="254" cy="58" r="14" fill="currentColor" opacity="0.3" />
      <circle cx="64" cy="156" r="9" fill="currentColor" opacity="0.2" />
    </Frame>
  );
}

export const FEATURE_ART: Record<string, (p: ArtProps) => React.ReactElement> = {
  "toko-online": ArtTokoOnline,
  "kasir-pos": ArtKasirPos,
  "pesan-di-meja": ArtPesanDiMeja,
  "program-reseller": ArtProgramReseller,
  "kelas-online": ArtKelasOnline,
  "stok-bahan-baku": ArtStokBahanBaku,
};
