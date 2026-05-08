"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export function LogoutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

  // Close the dialog with the backdrop click as well as the Cancel button.
  // Native <dialog> already handles ESC and focus trapping for us.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const onClick = (e: MouseEvent) => {
      if (e.target === dialog) dialog.close();
    };
    dialog.addEventListener("click", onClick);
    return () => dialog.removeEventListener("click", onClick);
  }, []);

  const openDialog = () => dialogRef.current?.showModal();
  const closeDialog = () => dialogRef.current?.close();

  const handleConfirm = async () => {
    setPending(true);
    try {
      await fetch(`${apiBase}/api/v1/auth/logout`, {
        method: "POST",
        credentials: "include",
      });
    } finally {
      closeDialog();
      router.push("/");
      router.refresh();
    }
  };

  return (
    <>
      <Button
        size="icon"
        variant="outline"
        aria-label="Keluar"
        title="Keluar"
        onClick={openDialog}
      >
        <LogOut className="size-4" aria-hidden />
      </Button>

      <dialog
        ref={dialogRef}
        aria-labelledby="logout-title"
        aria-describedby="logout-description"
        className="rounded-xl border border-neutral-200 bg-white p-0 shadow-elevated backdrop:bg-neutral-900/40 backdrop:backdrop-blur-sm"
      >
        <div className="w-[min(92vw,400px)] p-6">
          <div className="flex size-10 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
            <LogOut className="size-5" aria-hidden />
          </div>
          <h2
            id="logout-title"
            className="mt-4 font-display text-lg font-semibold text-neutral-900"
          >
            Keluar dari SellOn?
          </h2>
          <p id="logout-description" className="mt-2 text-sm text-neutral-600">
            Sesi-mu akan diakhiri dan kamu perlu login lagi untuk masuk ke
            dasbor.
          </p>

          <div className="mt-6 flex justify-end gap-2">
            <Button
              variant="ghost"
              size="md"
              onClick={closeDialog}
              disabled={pending}
            >
              Batal
            </Button>
            <Button
              variant="destructive"
              size="md"
              onClick={handleConfirm}
              disabled={pending}
            >
              {pending ? (
                <>
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                  Keluar…
                </>
              ) : (
                <>
                  <LogOut className="size-4" aria-hidden />
                  Keluar
                </>
              )}
            </Button>
          </div>
        </div>
      </dialog>
    </>
  );
}
