"use client";

import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { showError } from "@/lib/toast";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  CopyPlus,
  Edit2,
  Eye,
  Trash2,
  Loader2,
  MoreHorizontal,
  AlertTriangle,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import { AnchoredMenu } from "@/components/ui/anchored-menu";
import { ProductPreviewDialog } from "@/components/dashboard/product-preview-dialog";

const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

type RowTarget = {
  productId: string;
  productName: string;
  productType?: string;
  storeSlug?: string;
};

type Props = RowTarget & {
  quotaFull?: boolean;
};

// useRowActions owns every piece of state the row actions need plus the
// dialogs they open. It's split out from the presentation so the dialogs can be
// rendered OUTSIDE an AnchoredMenu: that component unmounts its children on
// close (and closes on scroll), which previously meant "Duplikat" never showed
// its dialog and Preview/Delete vanished as soon as the page scrolled.
function useRowActions({ productId, productName, productType, storeSlug }: RowTarget) {
  const { push, refresh } = useRouter();
  const [pendingDelete, setPendingDelete] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [duplicating, setDuplicating] = useState(false);
  const [showDuplicateDialog, setShowDuplicateDialog] = useState(false);
  const [duplicateName, setDuplicateName] = useState("");
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

  function openDuplicateDialog() {
    setDuplicateName(productName + " (Salinan)");
    setShowDuplicateDialog(true);
  }

  // Course products preview the actual course-viewer layout (videos +
  // playlist) on a dedicated page, no OTP — opened in a new tab. Other types
  // use the in-place storefront preview dialog.
  function handlePreview() {
    if (productType === "course") {
      window.open(`/products/${productId}/course-preview`, "_blank", "noopener");
      return;
    }
    setShowPreview(true);
  }

  async function onDuplicate(name: string) {
    setDuplicating(true);
    setShowDuplicateDialog(false);
    try {
      const res = await fetch(
        `${apiBase}/api/v1/products/${productId}/duplicate`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: name.trim() || productName + " (Salinan)" }),
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      const newId = data?.product?.id;
      if (newId) {
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

  const dialogs = (
    <>
      {/* Duplicate name dialog */}
      {showDuplicateDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm backdrop:bg-neutral-900/50">
          <div
            className="fixed inset-0 bg-neutral-900/40"
            onClick={() => setShowDuplicateDialog(false)}
          />
          <div className="relative z-10 w-[min(420px,95vw)] rounded-xl border border-neutral-200 bg-white p-6 shadow-popout">
            <h2 className="font-display text-base font-semibold text-neutral-900">
              Duplikat produk
            </h2>
            <p className="mt-1 text-sm text-neutral-600">
              Edit nama produk salinan sebelum disimpan.
            </p>
            <div className="mt-4">
              <input
                type="text"
                value={duplicateName}
                onChange={(e) => setDuplicateName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") onDuplicate(duplicateName);
                  if (e.key === "Escape") setShowDuplicateDialog(false);
                }}
                autoFocus
                className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm text-neutral-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30"
              />
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setShowDuplicateDialog(false)}
                disabled={duplicating}
              >
                Batal
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() => onDuplicate(duplicateName)}
                disabled={duplicating || !duplicateName.trim()}
              >
                {duplicating ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                ) : (
                  <CopyPlus className="size-4" aria-hidden />
                )}
                Duplikat
              </Button>
            </div>
          </div>
        </div>
      )}

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
            <h2 id={`del-${productId}-title`} className="font-display text-base font-semibold text-neutral-900">
              Hapus produk &ldquo;{productName}&rdquo;?
            </h2>
            <p className="mt-1.5 text-sm text-neutral-600">
              Foto, deskripsi, varian, dan stok akan ikut dihapus. Aksi ini tidak bisa di-undo.
            </p>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-neutral-200 bg-neutral-50 px-5 py-3">
          <Button type="button" size="sm" variant="ghost" onClick={() => setPendingDelete(false)} disabled={busy}>Batal</Button>
          <Button type="button" size="sm" variant="destructive" onClick={confirmDelete} disabled={busy}>
            <Trash2 className="size-4" aria-hidden />
            {busy ? "Menghapus…" : "Hapus"}
          </Button>
        </div>
      </dialog>
      <ProductPreviewDialog open={showPreview} productId={productId} storeSlug={storeSlug} onClose={() => setShowPreview(false)} />
    </>
  );

  return {
    dialogs,
    duplicating,
    handlePreview,
    openDuplicateDialog,
    requestDelete: () => setPendingDelete(true),
  };
}

// ProductRowActions renders the desktop icon row (preview / duplicate / edit /
// delete) with its dialogs mounted alongside — no portal involved.
export function ProductRowActions({
  productId,
  productName,
  productType,
  storeSlug,
  quotaFull,
}: Props) {
  const {
    dialogs,
    duplicating,
    handlePreview,
    openDuplicateDialog,
    requestDelete,
  } = useRowActions({ productId, productName, productType, storeSlug });

  return (
    <>
      <div className="inline-flex items-center gap-1">
        <Tooltip label="Preview seperti customer">
          <button
            type="button"
            onClick={handlePreview}
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
            onClick={openDuplicateDialog}
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
            onClick={requestDelete}
            aria-label="Hapus produk"
            className="inline-flex size-8 items-center justify-center rounded-md text-neutral-500 transition-colors hover:bg-danger/10 hover:text-danger"
          >
            <Trash2 className="size-4" aria-hidden />
          </button>
        </Tooltip>
      </div>

      {dialogs}
    </>
  );
}

// ProductRowMenu is the "…" dropdown variant used by the products table. The
// AnchoredMenu only renders MENU ITEMS (plain callbacks); every dialog lives
// outside it, so closing the menu — or scrolling, which closes it — can no
// longer unmount a dialog that was just opened.
export function ProductRowMenu({
  productId,
  productName,
  productType,
  storeSlug,
  quotaFull,
  extraItems,
}: Props & { extraItems?: (close: () => void) => ReactNode }) {
  const {
    dialogs,
    duplicating,
    handlePreview,
    openDuplicateDialog,
    requestDelete,
  } = useRowActions({ productId, productName, productType, storeSlug });

  const itemClass =
    "flex w-full items-center gap-2.5 px-4 py-2 text-sm text-neutral-700 hover:bg-neutral-50";

  return (
    <>
      <AnchoredMenu
        ariaLabel="Aksi produk"
        icon={<MoreHorizontal className="size-4" aria-hidden />}
        buttonClassName="inline-flex size-8 items-center justify-center rounded-md border border-neutral-200 text-neutral-600 transition-colors hover:border-brand-500 hover:bg-brand-50 hover:text-brand-700"
      >
        {(close) => (
          <>
            {extraItems?.(close)}
            <button
              type="button"
              onClick={() => {
                handlePreview();
                close();
              }}
              className={itemClass}
            >
              <Eye className="size-4" aria-hidden />
              Preview
            </button>
            <button
              type="button"
              onClick={() => {
                openDuplicateDialog();
                close();
              }}
              disabled={duplicating || quotaFull}
              className={`${itemClass} disabled:cursor-not-allowed disabled:opacity-40`}
            >
              {duplicating ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <CopyPlus className="size-4" aria-hidden />
              )}
              {quotaFull ? "Duplikat (limit tercapai)" : "Duplikat"}
            </button>
            <Link
              href={`/products/${productId}`}
              onClick={close}
              className={itemClass}
            >
              <Edit2 className="size-4" aria-hidden />
              Edit produk
            </Link>
            <div className="my-1 border-t border-neutral-100" />
            <button
              type="button"
              onClick={() => {
                requestDelete();
                close();
              }}
              className="flex w-full items-center gap-2.5 px-4 py-2 text-sm text-danger hover:bg-danger/5"
            >
              <Trash2 className="size-4" aria-hidden />
              Hapus produk
            </button>
          </>
        )}
      </AnchoredMenu>
      {dialogs}
    </>
  );
}
