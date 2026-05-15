"use client";

import { useState } from "react";
import { showError, showSuccess } from "@/lib/toast";
import { useRouter } from "next/navigation";
import { ShieldAlert, LogOut, Loader2 } from "lucide-react";

import type { Me } from "@/lib/auth-types";

const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

type Props = {
  me: Me;
};

// Persistent red banner shown on every authenticated page when an
// admin is currently logged in as another user. Click "Keluar" calls
// /api/v1/auth/exit-impersonation which re-issues the admin's own
// session cookie. Stays at the very top of the document above any
// sticky header so it's never obscured.
export function ImpersonationBanner({ me }: Props) {
  const { refresh } = useRouter();
  const [pending, setPending] = useState(false);

  if (!me.is_impersonated) return null;

  async function exit() {
    setPending(true);
    try {
      const res = await fetch(`${apiBase}/api/v1/auth/exit-impersonation`, {
        method: "POST",
        credentials: "include",
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        restored?: boolean;
        logged_out?: boolean;
        error?: string;
      };
      if (!res.ok) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      // Happy path: backend re-issued the admin's session cookie. Hard
      // navigate to the platform overview so Server Components re-fetch
      // with the new cookie (router.refresh alone is flaky for role
      // flips because layout-level guards run first).
      if (data.restored) {
        window.location.href = "/platform";
        return;
      }
      // Fallback (admin account revoked / banned mid-session): backend
      // cleared the cookie. Send to login.
      window.location.href = "/login";
    } catch (err) {
      showError(err);
      setPending(false);
      refresh();
    }
  }

  return (
    <div
      role="alert"
      className="sticky top-0 z-[60] flex flex-col gap-1 border-b border-danger/40 bg-danger px-4 py-2 text-white shadow-card sm:flex-row sm:items-center sm:gap-3"
    >
      <div className="flex items-center gap-2">
        <ShieldAlert className="size-4 shrink-0" aria-hidden />
        <p className="text-sm font-semibold">Mode Impersonation</p>
      </div>
      <p className="flex-1 text-sm">
        Kamu sedang melihat sebagai{" "}
        <span className="font-semibold">{me.name || me.email}</span>
        {me.impersonator_email && (
          <span className="opacity-80">
            {" "}- admin {me.impersonator_email}
          </span>
        )}
        . Setiap aksi tercatat di audit log.
      </p>
            <button
        type="button"
        onClick={exit}
        disabled={pending}
        className="inline-flex h-8 items-center gap-1.5 self-start rounded-md bg-white px-3 text-sm font-semibold text-danger transition-colors hover:bg-white/95 disabled:opacity-70 sm:self-auto"
      >
        {pending ? (
          <Loader2 className="size-4 animate-spin" aria-hidden />
        ) : (
          <LogOut className="size-4" aria-hidden />
        )}
        Keluar dari mode
      </button>
    </div>
  );
}
