"use client";

import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { MoreHorizontal, ExternalLink, UserCog } from "lucide-react";

type Props = {
  slug: string;
  ownerUserId: string;
};

export function StoreRowActions({ slug, ownerUserId }: Props) {
  // top OR bottom is set: `top` opens below the trigger, `bottom` opens above
  // it (when there isn't room below, so the menu isn't cut off by the viewport).
  const [pos, setPos] = useState<{ top?: number; bottom?: number; right: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!pos) return;
    function onMouseDown(e: MouseEvent) {
      if (
        menuRef.current && !menuRef.current.contains(e.target as Node) &&
        btnRef.current && !btnRef.current.contains(e.target as Node)
      ) {
        setPos(null);
      }
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [pos]);

  function toggle() {
    if (pos) { setPos(null); return; }
    const rect = btnRef.current?.getBoundingClientRect();
    if (!rect) return;
    const right = window.innerWidth - rect.right;
    // 2-item menu (~110px); flip above the trigger if it wouldn't fit below.
    const estHeight = 110;
    if (rect.bottom + estHeight > window.innerHeight - 8) {
      setPos({ bottom: window.innerHeight - rect.top + 4, right });
    } else {
      setPos({ top: rect.bottom + 4, right });
    }
  }

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={toggle}
        className="inline-flex size-8 items-center justify-center rounded-md border border-neutral-200 text-neutral-600 transition-colors hover:border-brand-500 hover:bg-brand-50 hover:text-brand-700"
        aria-label="Aksi"
      >
        <MoreHorizontal className="size-4" aria-hidden />
      </button>

      {pos && createPortal(
        <div
          ref={menuRef}
          style={{ position: "fixed", top: pos.top, bottom: pos.bottom, right: pos.right }}
          className="z-50 w-40 rounded-lg border border-neutral-200 bg-white py-1 shadow-card"
        >
          <a
            href={`/${slug}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setPos(null)}
            className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-50"
          >
            <ExternalLink className="size-4 shrink-0 text-neutral-400" aria-hidden />
            Buka Toko
          </a>
          <Link
            href={`/platform/users/${ownerUserId}`}
            onClick={() => setPos(null)}
            className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-50"
          >
            <UserCog className="size-4 shrink-0 text-neutral-400" aria-hidden />
            Pemilik
          </Link>
        </div>,
        document.body,
      )}
    </>
  );
}
