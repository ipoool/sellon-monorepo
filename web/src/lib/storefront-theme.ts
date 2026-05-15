import type { CSSProperties } from "react";

// Map an OKLCH hue (0-360) into the 11-shade brand palette as inline CSS
// custom properties. Used by every public toko page so each store can have
// its own brand color without a global theme rebuild. Falls back to the
// default sellon hue (145) on missing/out-of-range input.
export function themeStyleForHue(
  hue: number | undefined,
): CSSProperties {
  const h = typeof hue === "number" && hue >= 0 && hue <= 360 ? hue : 145;
  return {
    "--color-brand-50": `oklch(0.97 0.025 ${h})`,
    "--color-brand-100": `oklch(0.94 0.06 ${h})`,
    "--color-brand-200": `oklch(0.88 0.11 ${h})`,
    "--color-brand-300": `oklch(0.81 0.15 ${h})`,
    "--color-brand-400": `oklch(0.76 0.17 ${h})`,
    "--color-brand-500": `oklch(0.71 0.18 ${h})`,
    "--color-brand-600": `oklch(0.61 0.17 ${h})`,
    "--color-brand-700": `oklch(0.51 0.15 ${h})`,
    "--color-brand-800": `oklch(0.41 0.12 ${h})`,
    "--color-brand-900": `oklch(0.31 0.09 ${h})`,
    "--color-brand-950": `oklch(0.21 0.06 ${h})`,
  } as CSSProperties;
}
