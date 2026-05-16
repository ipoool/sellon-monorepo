"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { MoreHorizontal, ExternalLink, UserCog } from "lucide-react";

type Props = {
  slug: string;
  ownerUserId: string;
};

export function StoreRowActions({ slug, ownerUserId }: Props) {
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
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
    setPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
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

      {pos && (
        <div
          ref={menuRef}
          style={{ position: "fixed", top: pos.top, right: pos.right }}
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
        </div>
      )}
    </>
  );
}
