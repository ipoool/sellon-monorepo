"use client";

import { useState } from "react";
import { showError, showSuccess } from "@/lib/toast";
import { useRouter } from "next/navigation";
import { Ban, RotateCcw, UserCog, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import type { AdminUser } from "@/lib/types";

const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

type Props = { user: AdminUser };

type DialogState = null | "ban" | "impersonate";

export function AdminUserActions({ user }: Props) {
  const { refresh } = useRouter();
  const [busy, setBusy] = useState<"ban" | "impersonate" | null>(null);
  const [dialog, setDialog] = useState<DialogState>(null);

  const banned = !!user.banned_at;
  const isAdmin = user.role === "admin";

  async function runToggleBan() {
    const action = banned ? "unban" : "ban";
    setBusy("ban");
    try {
      const res = await fetch(
        `${apiBase}/api/v1/admin/users/${user.id}/${action}`,
        { method: "POST", credentials: "include" },
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      setDialog(null);
      refresh();
    } catch (err) {
      showError(err);
    } finally {
      setBusy(null);
    }
  }

  async function runImpersonate() {
    setBusy("impersonate");
    try {
      const res = await fetch(
        `${apiBase}/api/v1/admin/users/${user.id}/impersonate`,
        { method: "POST", credentials: "include" },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      window.location.href = "/dashboard";
    } catch (err) {
      showError(err);
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col items-stretch gap-2 sm:items-end">
            <div className="flex flex-wrap gap-2">
        {!isAdmin && !banned && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setDialog("impersonate")}
            disabled={busy !== null}
          >
            {busy === "impersonate" ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <UserCog className="size-4" aria-hidden />
            )}
            Impersonate
          </Button>
        )}
        {!isAdmin && (
          <Button
            variant={banned ? "outline" : "destructive"}
            size="sm"
            onClick={() => setDialog("ban")}
            disabled={busy !== null}
          >
            {busy === "ban" ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : banned ? (
              <RotateCcw className="size-4" aria-hidden />
            ) : (
              <Ban className="size-4" aria-hidden />
            )}
            {banned ? "Buka blokir" : "Blokir akun"}
          </Button>
        )}
      </div>

      {/* Ban / unban confirmation */}
      <ConfirmDialog
        open={dialog === "ban"}
        onClose={() => (busy ? null : setDialog(null))}
        onConfirm={runToggleBan}
        title={banned ? `Buka blokir ${user.email}?` : `Blokir ${user.email}?`}
        description={
          banned
            ? "User dapat login kembali dan toko-nya kembali menerima pesanan."
            : "User tidak akan bisa login dan toko-nya berhenti menerima pesanan sampai dibuka."
        }
        confirmLabel={banned ? "Ya, buka blokir" : "Ya, blokir"}
        kind={banned ? "default" : "danger"}
        busy={busy === "ban"}
      />

      {/* Impersonate confirmation */}
      <ConfirmDialog
        open={dialog === "impersonate"}
        onClose={() => (busy ? null : setDialog(null))}
        onConfirm={runImpersonate}
        title={`Mulai impersonate ${user.email}?`}
        description={
          <>
            Setiap aksi tercatat di audit log dan banner merah akan muncul di
            seluruh dasbor. Klik &ldquo;Keluar dari mode&rdquo; di banner saat
            kamu selesai.
          </>
        }
        confirmLabel="Ya, mulai"
        kind="warning"
        busy={busy === "impersonate"}
      />
    </div>
  );
}
