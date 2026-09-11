"use client";

import {
  useCallback,
  useEffect,
  useId,
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

// Anything a caller renders inside the panel that can take focus. Used instead
// of requiring `role="menuitem"` so keyboard navigation keeps working even if a
// caller forgets the role (the roles are still set for screen readers).
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Click-to-open dropdown whose panel is portaled to <body> with fixed
// positioning. This is what lets it escape an `overflow-hidden` ancestor
// (e.g. the rounded table wrapper) that would otherwise clip it — the bug
// where the row "…" menu got cut off at the container edge. The panel
// right-aligns to the trigger and flips above it when there isn't room below.
// Closes on outside-click, Escape, ancestor scroll, or resize (scrolling
// inside the panel itself is ignored). No deps.
//
// Keyboard behaviour follows the APG menu-button pattern: the trigger opens on
// Enter/Space (native button click) and on ArrowDown/ArrowUp, focus moves into
// the panel on open, Arrow/Home/End roam the items, and Escape or Tab closes
// and hands focus back to the trigger. That last part matters because the panel
// is portaled to the END of <body>: without it, Tab from the trigger skipped the
// open menu entirely and landed somewhere far down the page behind it.
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
  // Which end of the list gets focus when the panel mounts — ArrowUp on the
  // trigger is expected to land on the LAST item.
  const [focusEnd, setFocusEnd] = useState<"first" | "last">("first");
  // The trigger is kept in STATE, not a ref: `close` is handed to the render
  // prop during render, and a render-time closure must not reach into a ref.
  const [btnEl, setBtnEl] = useState<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  // Dismiss without touching focus — for the cases where the user's focus is
  // already elsewhere (outside click, ancestor scroll, viewport resize).
  const dismiss = useCallback(() => setOpen(false), []);

  // The `close` handed to the render-prop: an item was activated, so focus goes
  // back to the trigger the user opened the menu from. Declared as () => void
  // so callers can pass it straight to onClick without the event leaking in.
  const close = useCallback(() => {
    setOpen(false);
    btnEl?.focus({ preventScroll: true });
  }, [btnEl]);

  const items = useCallback(
    () =>
      Array.from(
        menuRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [],
      ).filter((el) => el.getAttribute("aria-disabled") !== "true"),
    [],
  );

  // Compute viewport (fixed) coords from the trigger rect + measured panel
  // size, so the panel never depends on a positioned/clipping ancestor.
  const reposition = useCallback(() => {
    const menu = menuRef.current;
    if (!btnEl || !menu) return;
    const r = btnEl.getBoundingClientRect();
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
  }, [btnEl]);

  // Measure + place after the portal mounts, then move focus inside. The panel
  // stays opacity-0 until `pos` is set, so it never flashes at the wrong spot
  // despite running post-paint. preventScroll matters: a focus-driven scroll
  // would fire the ancestor-scroll listener below and close the menu instantly.
  useEffect(() => {
    if (!open) return;
    reposition();
    const list = items();
    const target = focusEnd === "last" ? list[list.length - 1] : list[0];
    target?.focus({ preventScroll: true });
  }, [open, reposition, items, focusEnd]);

  useEffect(() => {
    if (!open) return;
    const onResize = () => dismiss();
    // Close on scroll of an ANCESTOR (the panel is fixed-positioned, so it
    // would visually detach), but ignore scrolling INSIDE the panel itself —
    // a capture-phase listener otherwise sees the menu's own overflow scroll
    // and closes it mid-interaction.
    const onScroll = (e: Event) => {
      const t = e.target as Node | null;
      if (t && menuRef.current && menuRef.current.contains(t)) return;
      dismiss();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        // Escape belongs to the menu while it is open: stop it from also
        // light-dismissing a native <dialog> this menu might sit inside.
        e.preventDefault();
        e.stopPropagation();
        close();
        return;
      }
      // Tab leaves the menu: close first and put focus on the trigger, then let
      // the browser's default Tab continue from there. Without preventDefault
      // the next stop is whatever follows the trigger in the document — which
      // is what a sighted keyboard user expects, and keeps focus from jumping
      // into the page behind the open panel.
      if (e.key === "Tab") {
        close();
        return;
      }
      // Roving focus only applies while focus is actually in the menu — the
      // listener is on `document`, and we must not hijack arrow keys from a
      // field elsewhere on the page.
      const active = document.activeElement as HTMLElement | null;
      if (!menuRef.current?.contains(active) && active !== btnEl) return;
      const list = items();
      if (list.length === 0) return;
      const current = list.indexOf(active as HTMLElement);
      let next = -1;
      if (e.key === "ArrowDown") next = current < 0 ? 0 : (current + 1) % list.length;
      else if (e.key === "ArrowUp")
        next = current < 0 ? list.length - 1 : (current - 1 + list.length) % list.length;
      else if (e.key === "Home") next = 0;
      else if (e.key === "End") next = list.length - 1;
      if (next < 0) return;
      e.preventDefault(); // stop Arrow/Home/End from scrolling the page
      list[next]?.focus({ preventScroll: true });
    };
    const onPointer = (e: MouseEvent) => {
      const t = e.target as Node;
      if (menuRef.current?.contains(t) || btnEl?.contains(t)) return;
      dismiss();
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
  }, [open, close, dismiss, items, btnEl]);

  return (
    <>
      <button
        ref={setBtnEl}
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => {
          setFocusEnd("first");
          setOpen((o) => !o);
        }}
        onKeyDown={(e) => {
          if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
          e.preventDefault();
          setFocusEnd(e.key === "ArrowUp" ? "last" : "first");
          setOpen(true);
        }}
        className={buttonClassName}
      >
        {icon}
      </button>
      {open &&
        createPortal(
          <div
            ref={menuRef}
            id={menuId}
            role="menu"
            aria-label={ariaLabel}
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
