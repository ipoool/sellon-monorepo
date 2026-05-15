import type { ReactElement, ReactNode } from "react";
import { cn } from "@/lib/utils";

type Props = {
  label: ReactNode;
  // Child harus 1 element clickable (button / a / span). Tooltip
  // muncul saat parent di-hover atau anaknya di-focus.
  children: ReactElement;
  side?: "top" | "bottom";
  // Override posisi horizontal jika tooltip mau dipaksa center / start /
  // end. Default center.
  align?: "start" | "center" | "end";
};

// Lightweight CSS tooltip — tidak butuh JS / portal. Pakai group-hover
// + group-focus-within sehingga muncul instant tanpa delay default 1.5s
// browser native. Tetap include native `title` di anak lewat React.
// cloneElement-style (memanfaatkan props.children passthrough) — tapi
// kita biarkan caller set title sendiri kalau perlu fallback.
export function Tooltip({
  label,
  children,
  side = "top",
  align = "center",
}: Props) {
  const sideClass =
    side === "top"
      ? "bottom-full mb-1.5"
      : "top-full mt-1.5";

  const alignClass =
    align === "start"
      ? "left-0"
      : align === "end"
        ? "right-0"
        : "left-1/2 -translate-x-1/2";

  return (
    <span className="group relative inline-flex">
      {children}
      <span
        role="tooltip"
        className={cn(
          "pointer-events-none absolute z-20 whitespace-nowrap rounded-md bg-neutral-900 px-2 py-1 text-[11px] font-medium text-white opacity-0 shadow-soft transition-opacity duration-100 group-hover:opacity-100 group-focus-within:opacity-100",
          sideClass,
          alignClass,
        )}
      >
        {label}
      </span>
    </span>
  );
}
