"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Copy,
  Edit2,
  Trash2,
  Loader2,
  AlertTriangle,
} from "lucide-react";

import { Button } from "@/components/ui/button";

const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

type Props = {
  productId: string;
  productName: string;
};

export function ProductRowActions({ productId, productName }: Props) {
  const router = useRouter();
  const [pendingDelete, setPendingDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [duplicating, setDuplicating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (pendingDelete && !dialog.open) dialog.showModal();
    if (!pendingDelete && dialog.open) dialog.close();
  }, [pendingDelete]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const onClick = (e: MouseEvent) => {
      if (e.target === dialog) setPendingDelete(false);
    };
    const onCancel = () => setPendingDelete(false);
    dialog.addEventListener("click", onClick);
    dialog.addEventListener("cancel", onCancel);
    return () => {
      dialog.removeEventListener("click", onClick);
      dialog.removeEventListener("cancel", onCancel);
    };
  }, []);

  async function onDuplicate() {
    setDuplicating(true);
    setError(null);
    try {
      const res = await fetch(
        `${apiBase}/api/v1/products/${productId}/duplicate`,
        { method: "POST", credentials: "include" },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      const newId = data?.product?.id;
      if (newId) {
        // Land on the edit page of the duplicated product so the seller can
        // tweak before publishing (the copy is saved as inactive).
        router.push(`/dasbor/produk/${newId}`);
        return;
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal duplikat");
    } finally {
      setDuplicating(false);
    }
  }

  async function confirmDelete() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${apiBase}/api/v1/products/${productId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      setPendingDelete(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal hapus");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="inline-flex items-center gap-1">
        <button
          type="button"
          onClick={onDuplicate}
          disabled={duplicating}
          title="Duplikat produk"
          aria-label="Duplikat produk"
          className="inline-flex size-8 items-center justify-center rounded-md text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-900 disabled:cursor-wait disabled:opacity-60"
        >
          {duplicating ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <Copy className="size-4" aria-hidden />
          )}
        </button>
        <Link
          href={`/dasbor/produk/${productId}`}
          title="Edit produk"
          aria-label="Edit produk"
          className="inline-flex size-8 items-center justify-center rounded-md text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-900"
        >
          <Edit2 className="size-4" aria-hidden />
        </Link>
        <button
          type="button"
          onClick={() => {
            setError(null);
            setPendingDelete(true);
          }}
          title="Hapus produk"
          aria-label="Hapus produk"
          className="inline-flex size-8 items-center justify-center rounded-md text-neutral-500 transition-colors hover:bg-danger/10 hover:text-danger"
        >
          <Trash2 className="size-4" aria-hidden />
        </button>
      </div>

      {error && !pendingDelete && (
        <p className="mt-1 text-xs font-medium text-danger">{error}</p>
      )}

      {/* Delete confirmation dialog */}
      <dialog
        ref={dialogRef}
        aria-labelledby={`del-${productId}-title`}
        className="fixed left-1/2 top-1/2 m-0 w-[min(420px,95vw)] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-neutral-200 bg-white p-0 shadow-popout backdrop:bg-neutral-900/40 backdrop:backdrop-blur-sm"
      >
        <div className="flex items-start gap-3 p-5">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-danger/10 text-danger">
            <AlertTriangle className="size-5" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <h2
              id={`del-${productId}-title`}
              className="font-display text-base font-semibold text-neutral-900"
            >
              Hapus produk &ldquo;{productName}&rdquo;?
            </h2>
            <p className="mt-1.5 text-sm text-neutral-600">
              Foto, deskripsi, varian, dan stok akan ikut dihapus. Aksi ini
              tidak bisa di-undo.
            </p>
            {error && (
              <p className="mt-2 text-sm font-medium text-danger">{error}</p>
            )}
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-neutral-200 bg-neutral-50 px-5 py-3">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => setPendingDelete(false)}
            disabled={busy}
          >
            Batal
          </Button>
          <Button
            type="button"
            size="sm"
            variant="destructive"
            onClick={confirmDelete}
            disabled={busy}
          >
            <Trash2 className="size-4" aria-hidden />
            {busy ? "Menghapus…" : "Hapus"}
          </Button>
        </div>
      </dialog>
    </>
  );
}
