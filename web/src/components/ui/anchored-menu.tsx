"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

type Props = {
  ariaLabel: string;
  icon: ReactNode;
  buttonClassName?: string;
  menuClassName?: string;
  // Render-prop so the menu content can close the menu after an action.
  children: (close: () => void) => ReactNode;
};

// Click-to-open dropdown whose panel is portaled to <body> with fixed
// positioning. This is what lets it escape an `overflow-hidden` ancestor
// (e.g. the rounded table wrapper) that would otherwise clip it — the bug
// where the row "…" menu got cut off at the container edge. The panel
// right-aligns to the trigger and flips above it when there isn't room below.
// Closes on outside-click, Escape, ancestor scroll, or resize (scrolling
// inside the panel itself is ignored). No deps.
//
// NOTE: children are unmounted when the menu closes, so NEVER render a dialog
// or any other state-owning UI inside the render-prop — hoist it to the parent
// (see ProductRowMenu).
export function AnchoredMenu({
  ariaLabel,
  icon,
  buttonClassName,
  menuClassName,
  children,
}: Props) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => setOpen(false), []);

  // Compute viewport (fixed) coords from the trigger rect + measured panel
  // size, so the panel never depends on a positioned/clipping ancestor.
  const reposition = useCallback(() => {
    const btn = btnRef.current;
    const menu = menuRef.current;
    if (!btn || !menu) return;
    const r = btn.getBoundingClientRect();
    const mw = menu.offsetWidth;
    const mh = menu.offsetHeight;
    const gap = 6;
    const margin = 8;

    let left = r.right - mw; // right-align to the trigger
    if (left + mw > window.innerWidth - margin) left = window.innerWidth - margin - mw;
    if (left < margin) left = margin;

    let top = r.bottom + gap; // open downward by default
    // Flip above the trigger if it would overflow the viewport bottom and
    // there's room above.
    if (top + mh > window.innerHeight - margin && r.top - gap - mh > margin) {
      top = r.top - gap - mh;
    }
    setPos({ top, left });
  }, []);

  // Measure + place after the portal mounts. The panel stays opacity-0 until
  // `pos` is set, so it never flashes at the wrong spot despite running post-paint.
  useEffect(() => {
    if (!open) return;
    reposition();
  }, [open, reposition]);

  useEffect(() => {
    if (!open) return;
    const onResize = () => setOpen(false);
    // Close on scroll of an ANCESTOR (the panel is fixed-positioned, so it
    // would visually detach), but ignore scrolling INSIDE the panel itself —
    // a capture-phase listener otherwise sees the menu's own overflow scroll
    // and closes it mid-interaction.
    const onScroll = (e: Event) => {
      const t = e.target as Node | null;
      if (t && menuRef.current && menuRef.current.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onPointer = (e: MouseEvent) => {
      const t = e.target as Node;
      if (menuRef.current?.contains(t) || btnRef.current?.contains(t)) return;
      setOpen(false);
    };
    // Capture so we also catch scrolls on any scrollable ancestor.
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onPointer);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onPointer);
    };
  }, [open]);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        aria-label={ariaLabel}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={buttonClassName}
      >
        {icon}
      </button>
      {open &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            style={{
              position: "fixed",
              top: pos?.top ?? -9999,
              left: pos?.left ?? -9999,
            }}
            className={cn(
              "z-50 min-w-[11rem] rounded-xl border border-neutral-200 bg-white py-1 shadow-popout",
              pos ? "opacity-100" : "opacity-0", // hide until measured
              menuClassName,
            )}
          >
            {children(close)}
          </div>,
          document.body,
        )}
    </>
  );
}
