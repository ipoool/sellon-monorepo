"use client";

import { useEffect, useRef, useState } from "react";
import { showError, showSuccess } from "@/lib/toast";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  CopyPlus,
  Edit2,
  Eye,
  Trash2,
  Loader2,
  AlertTriangle,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import { ProductPreviewDialog } from "@/components/dashboard/product-preview-dialog";

const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

type Props = {
  productId: string;
  productName: string;
  storeSlug?: string;
  // When true the seller's tier-quota for products is exhausted, so any
  // action that would create a new row (currently: Duplikat) is hidden
  // behind a disabled state + tooltip. Mirrors the top-level
  // "Tambah Produk" disable on the same page (BUG-016).
  quotaFull?: boolean;
};

export function ProductRowActions({
  productId,
  productName,
  storeSlug,
  quotaFull,
}: Props) {
  const { push, refresh } = useRouter();
  const [pendingDelete, setPendingDelete] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [duplicating, setDuplicating] = useState(false);
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
        push(`/products/${newId}`);
        return;
      }
      refresh();
    } catch (err) {
      showError(err);
    } finally {
      setDuplicating(false);
    }
  }

  async function confirmDelete() {
    setBusy(true);
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
      refresh();
    } catch (err) {
      showError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="inline-flex items-center gap-1">
        <Tooltip label="Preview seperti customer">
          <button
            type="button"
            onClick={() => setShowPreview(true)}
            aria-label="Preview produk"
            className="inline-flex size-8 items-center justify-center rounded-md text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-900"
          >
            <Eye className="size-4" aria-hidden />
          </button>
        </Tooltip>
        <Tooltip
          label={
            quotaFull
              ? "Limit produk tercapai — upgrade untuk duplikat"
              : "Duplikat produk"
          }
        >
          <button
            type="button"
            onClick={onDuplicate}
            disabled={duplicating || quotaFull}
            aria-label="Duplikat produk"
            className="inline-flex size-8 items-center justify-center rounded-md text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-900 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-neutral-500"
          >
            {duplicating ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <CopyPlus className="size-4" aria-hidden />
            )}
          </button>
        </Tooltip>
        <Tooltip label="Edit produk">
          <Link
            href={`/products/${productId}`}
            aria-label="Edit produk"
            className="inline-flex size-8 items-center justify-center rounded-md text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-900"
          >
            <Edit2 className="size-4" aria-hidden />
          </Link>
        </Tooltip>
        <Tooltip label="Hapus produk" align="end">
          <button
            type="button"
            onClick={() => {
              setPendingDelete(true);
            }}
            aria-label="Hapus produk"
            className="inline-flex size-8 items-center justify-center rounded-md text-neutral-500 transition-colors hover:bg-danger/10 hover:text-danger"
          >
            <Trash2 className="size-4" aria-hidden />
          </button>
        </Tooltip>
      </div>

      
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

      <ProductPreviewDialog
        open={showPreview}
        productId={productId}
        storeSlug={storeSlug}
        onClose={() => setShowPreview(false)}
      />
    </>
  );
}
