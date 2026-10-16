import Image from "next/image";

/**
 * Illustrations for the home page, generated with Gemini (nanobanana) and
 * stored in web/public/home/.
 *
 * They carry no text at all — the page supplies every word, so nothing here
 * ever needs translating or correcting — and their white backgrounds were
 * flood filled to transparency so each sits on whichever tint its panel uses.
 * Full-resolution sources live in marketing/nanobanana/; these are the
 * cut-out, palette-quantised copies (~27 KB each).
 */

// Intrinsic size per file. Next/Image reserves the box from these, so a wrong
// ratio here is a visible jump when the image lands — they are read from the
// actual files, not guessed.
const ART: Record<string, { w: number; h: number }> = {
  "toko-online": { w: 739, h: 396 },
  "kasir-pos": { w: 689, h: 512 },
  "pesan-di-meja": { w: 760, h: 427 },
  "program-reseller": { w: 710, h: 711 },
  "kelas-online": { w: 760, h: 360 },
  "stok-bahan-baku": { w: 640, h: 480 },
  "mobile-app": { w: 448, h: 684 },
};

type Props = {
  /** A HOME_FEATURES key, or "mobile-app". */
  name: keyof typeof ART | string;
  className?: string;
  /** The one illustration above the fold should not wait for lazy loading. */
  priority?: boolean;
};

export function FeatureArt({ name, className, priority }: Props) {
  const size = ART[name];
  if (!size) return null;

  return (
    <Image
      src={`/home/${name}.png`}
      // Decorative: each illustration restates the heading beside it, so a
      // screen reader announcing it again is noise, not help.
      alt=""
      aria-hidden
      width={size.w}
      height={size.h}
      priority={priority}
      loading={priority ? undefined : "lazy"}
      className={className}
      sizes="(min-width: 1024px) 380px, 70vw"
    />
  );
}
