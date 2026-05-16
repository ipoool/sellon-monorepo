"use client";

import { useState, useTransition, useEffect, useRef, type FormEvent } from "react";
import { showError, showSuccess } from "@/lib/toast";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Search,
  ShieldCheck,
  Ban,
  RotateCcw,
  Eye,
  UserCog,
  Loader2,
  Trash2,
  Crown,
  AlertTriangle,
  MoreHorizontal,
} from "lucide-react";

import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { AdminGrantSubscriptionDialog } from "@/components/admin/admin-grant-subscription-dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { AdminUser } from "@/lib/types";

const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

type Props = {
  initial: AdminUser[];
  initialQuery: string;
};

function formatDate(iso: string) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Jakarta",
  });
}

function PlanCell({ plan, subStatus, periodEnd }: {
  plan: string;
  subStatus: string;
  periodEnd?: string | null;
}) {
  const isPaid = plan === "pro" || plan === "bisnis";

  const planBadge = isPaid ? (
    <Badge variant="warning" className="gap-1">
      <Crown className="size-3" aria-hidden />
      {plan === "pro" ? "Pro" : "Bisnis"}
    </Badge>
  ) : (
    <Badge variant="outline">Gratis</Badge>
  );

  if (!isPaid || !periodEnd) return planBadge;

  const date = new Date(periodEnd);
  const now = new Date();
  const diffDays = Math.ceil((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  const label = formatDate(periodEnd);

  let expiryNode: React.ReactNode;
  if (subStatus === "expired" || diffDays < 0) {
    expiryNode = (
      <span className="inline-flex items-center gap-1 rounded-full bg-danger/10 px-2 py-0.5 text-xs font-medium text-danger">
        Expired
      </span>
    );
  } else if (diffDays <= 3) {
    expiryNode = (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
        <AlertTriangle className="size-3" aria-hidden />
        {label}
      </span>
    );
  } else {
    expiryNode = <span className="text-xs text-neutral-500">{label}</span>;
  }

  return (
    <div className="flex flex-col items-start gap-1">
      {planBadge}
      {expiryNode}
    </div>
  );
}

type DialogKind = "ban" | "impersonate" | "delete";
type DialogState = { kind: DialogKind; user: AdminUser } | null;

export function AdminUsersTable({ initial, initialQuery }: Props) {
  const { push } = useRouter();
  const [users, setUsers] = useState(() => initial);
  const [query, setQuery] = useState(() => initialQuery);
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [menuPos, setMenuPos] = useState<{ id: string; top: number; right: number } | null>(null);
  const [grantSubUser, setGrantSubUser] = useState<AdminUser | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

  useEffect(() => {
    if (!menuPos) return;
    const currentId = menuPos.id;
    function onMouseDown(e: MouseEvent) {
      const trigger = triggerRefs.current.get(currentId);
      if (
        menuRef.current && !menuRef.current.contains(e.target as Node) &&
        trigger && !trigger.contains(e.target as Node)
      ) {
        setMenuPos(null);
      }
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [menuPos]);

  function toggleMenu(id: string) {
    if (menuPos?.id === id) { setMenuPos(null); return; }
    const btn = triggerRefs.current.get(id);
    const rect = btn?.getBoundingClientRect();
    if (!rect) return;
    setMenuPos({ id, top: rect.bottom + 4, right: window.innerWidth - rect.right });
  }

  function onSearch(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const url = query
      ? `/platform/users?q=${encodeURIComponent(query)}`
      : "/platform/users";
    startTransition(() => push(url));
  }

  async function runToggleBan(user: AdminUser) {
    const isBanned = !!user.banned_at;
    const action = isBanned ? "unban" : "ban";
    setBusyId(user.id);
    try {
      const res = await fetch(
        `${apiBase}/api/v1/admin/users/${user.id}/${action}`,
        { method: "POST", credentials: "include" },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setUsers((prev) =>
        prev.map((u) => (u.id === user.id ? data.user : u)),
      );
      setDialog(null);
    } catch (err) {
      showError(err);
    } finally {
      setBusyId(null);
    }
  }

  async function runImpersonate(user: AdminUser) {
    setBusyId(user.id);
    try {
      const res = await fetch(
        `${apiBase}/api/v1/admin/users/${user.id}/impersonate`,
        { method: "POST", credentials: "include" },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      // Hard nav so server components re-fetch with the new session cookie.
      window.location.href = "/dashboard";
    } catch (err) {
      showError(err);
      setBusyId(null);
    }
  }

  async function runDelete(user: AdminUser) {
    setBusyId(user.id);
    try {
      const res = await fetch(
        `${apiBase}/api/v1/admin/users/${user.id}`,
        { method: "DELETE", credentials: "include" },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      const cleaned = typeof data.storage_cleanup === "number"
        ? ` (${data.storage_cleanup} file storage dibersihkan)`
        : "";
      showSuccess(`User ${user.email} dihapus permanen${cleaned}.`);
      setUsers((prev) => prev.filter((u) => u.id !== user.id));
      setDialog(null);
    } catch (err) {
      showError(err);
    } finally {
      setBusyId(null);
    }
  }

  function closeDialog() {
    if (busyId) return; // don't dismiss mid-flight
    setDialog(null);
  }

  return (
    <Card className="overflow-hidden p-0">
      <div className="border-b border-neutral-200 px-4 py-3 sm:px-5">
        <form onSubmit={onSearch} className="flex items-center gap-2">
          <div className="relative flex-1">
            <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-neutral-400">
              <Search className="size-4" />
            </span>
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Cari email atau nama…"
              className="pl-9"
            />
          </div>
          <Button type="submit" variant="outline" size="md" disabled={pending}>
            {pending && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
            Cari
          </Button>
        </form>
      </div>

      
      {users.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-12 text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-neutral-100 text-neutral-500">
            <UserCog className="size-6" aria-hidden />
          </div>
          <p className="font-medium text-neutral-900">Tidak ada pengguna</p>
          <p className="max-w-sm text-sm text-neutral-600">
            {initialQuery
              ? `Tidak ada hasil untuk "${initialQuery}". Coba kata kunci lain.`
              : "Belum ada pengguna terdaftar."}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wider text-neutral-500">
              <tr>
                <th className="px-4 py-3 sm:px-5">Pengguna</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Langganan</th>
                <th className="px-4 py-3">Bergabung</th>
                <th className="px-4 py-3 text-right sm:px-5">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {users.map((u) => {
                const banned = !!u.banned_at;
                const isAdmin = u.role === "admin";
                const busy = busyId === u.id;
                return (
                  <tr
                    key={u.id}
                    className={cn(banned && "bg-danger/5")}
                  >
                    <td className="px-4 py-3 sm:px-5">
                      <div className="flex items-center gap-3">
                        <Avatar
                          src={u.picture_url}
                          name={u.name || u.email}
                          size="sm"
                        />
                        <div className="min-w-0">
                          <p className="truncate font-medium text-neutral-900">
                            {u.name || "(belum isi nama)"}
                          </p>
                          <p className="truncate text-xs text-neutral-500">
                            {u.email}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {isAdmin ? (
                        <Badge variant="brand" className="gap-1">
                          <ShieldCheck className="size-3" aria-hidden />
                          Admin
                        </Badge>
                      ) : (
                        <Badge variant="outline">User</Badge>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {banned ? (
                        <Badge variant="danger" className="gap-1">
                          <Ban className="size-3" aria-hidden />
                          Diblokir
                        </Badge>
                      ) : (
                        <Badge variant="success">Aktif</Badge>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <PlanCell
                        plan={u.plan}
                        subStatus={u.sub_status}
                        periodEnd={u.period_end}
                      />
                    </td>
                    <td className="px-4 py-3 text-neutral-600">
                      {formatDate(u.created_at)}
                    </td>
                    <td className="px-4 py-3 sm:px-5">
                      <div className="flex items-center justify-end">
                        {busy ? (
                          <Loader2 className="size-4 animate-spin text-neutral-400" aria-hidden />
                        ) : (
                          <>
                            <button
                              type="button"
                              ref={(el) => { if (el) triggerRefs.current.set(u.id, el); else triggerRefs.current.delete(u.id); }}
                              onClick={() => toggleMenu(u.id)}
                              className="inline-flex size-8 items-center justify-center rounded-md border border-neutral-200 text-neutral-600 transition-colors hover:border-brand-500 hover:bg-brand-50 hover:text-brand-700"
                              aria-label="Aksi"
                            >
                              <MoreHorizontal className="size-4" aria-hidden />
                            </button>

                            {menuPos?.id === u.id && (
                              <div
                                ref={menuRef}
                                style={{ position: "fixed", top: menuPos.top, right: menuPos.right }}
                                className="z-50 w-44 rounded-lg border border-neutral-200 bg-white py-1 shadow-card">
                                <Link
                                  href={`/platform/users/${u.id}`}
                                  onClick={() => setMenuPos(null)}
                                  className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-50"
                                >
                                  <Eye className="size-4 shrink-0 text-neutral-400" aria-hidden />
                                  Detail
                                </Link>
                                {!isAdmin && u.store_id && (
                                  <button
                                    type="button"
                                    onClick={() => { setMenuPos(null); setGrantSubUser(u); }}
                                    className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-50"
                                  >
                                    <Crown className="size-4 shrink-0 text-neutral-400" aria-hidden />
                                    Atur Langganan
                                  </button>
                                )}
                                {!isAdmin && !banned && (
                                  <button
                                    type="button"
                                    onClick={() => { setMenuPos(null); setDialog({ kind: "impersonate", user: u }); }}
                                    className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-50"
                                  >
                                    <UserCog className="size-4 shrink-0 text-neutral-400" aria-hidden />
                                    Impersonate
                                  </button>
                                )}
                                {!isAdmin && (
                                  <button
                                    type="button"
                                    onClick={() => { setMenuPos(null); setDialog({ kind: "ban", user: u }); }}
                                    className={cn(
                                      "flex w-full items-center gap-2.5 px-3 py-2 text-sm hover:bg-neutral-50",
                                      banned ? "text-success" : "text-danger",
                                    )}
                                  >
                                    {banned ? (
                                      <RotateCcw className="size-4 shrink-0" aria-hidden />
                                    ) : (
                                      <Ban className="size-4 shrink-0" aria-hidden />
                                    )}
                                    {banned ? "Buka blokir" : "Blokir"}
                                  </button>
                                )}
                                {!isAdmin && (
                                  <button
                                    type="button"
                                    onClick={() => { setMenuPos(null); setDialog({ kind: "delete", user: u }); }}
                                    className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-danger hover:bg-neutral-50"
                                  >
                                    <Trash2 className="size-4 shrink-0" aria-hidden />
                                    Hapus
                                  </button>
                                )}
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {grantSubUser?.store_id && (
        <AdminGrantSubscriptionDialog
          storeId={grantSubUser.store_id}
          storeName={grantSubUser.name || grantSubUser.email}
          currentPlan={grantSubUser.plan}
          triggerVariant="none"
          externalOpen={true}
          onExternalClose={() => setGrantSubUser(null)}
        />
      )}

      <ConfirmDialog
        open={dialog?.kind === "ban"}
        onClose={closeDialog}
        onConfirm={() => dialog?.user && runToggleBan(dialog.user)}
        title={
          dialog?.user
            ? !!dialog.user.banned_at
              ? `Buka blokir ${dialog.user.email}?`
              : `Blokir ${dialog.user.email}?`
            : ""
        }
        description={
          dialog?.user && !!dialog.user.banned_at
            ? "User dapat login kembali dan toko-nya kembali menerima pesanan."
            : "User tidak akan bisa login dan toko-nya berhenti menerima pesanan sampai dibuka."
        }
        confirmLabel={
          dialog?.user && !!dialog.user.banned_at ? "Ya, buka blokir" : "Ya, blokir"
        }
        kind={dialog?.user && !!dialog.user.banned_at ? "default" : "danger"}
        busy={!!(dialog?.user && busyId === dialog.user.id)}
      />

      <ConfirmDialog
        open={dialog?.kind === "impersonate"}
        onClose={closeDialog}
        onConfirm={() => dialog?.user && runImpersonate(dialog.user)}
        title={
          dialog?.user ? `Mulai impersonate ${dialog.user.email}?` : ""
        }
        description={
          <>
            Setiap aksi tercatat di audit log dan banner merah akan muncul di
            seluruh dasbor. Klik &ldquo;Keluar dari mode&rdquo; di banner saat
            kamu selesai.
          </>
        }
        confirmLabel="Ya, mulai"
        kind="warning"
        busy={!!(dialog?.user && busyId === dialog.user.id)}
      />

      <ConfirmDialog
        open={dialog?.kind === "delete"}
        onClose={closeDialog}
        onConfirm={() => dialog?.user && runDelete(dialog.user)}
        title={
          dialog?.user
            ? `Hapus permanen ${dialog.user.email}?`
            : ""
        }
        kind="danger"
        confirmLabel="Hapus permanen"
        cancelLabel="Batal"
        confirmIcon={<Trash2 className="size-4" aria-hidden />}
        requireTypedPhrase="DELETE NOW"
        busy={!!(dialog?.user && busyId === dialog.user.id)}
        description={
          <div className="space-y-2">
            <p>
              Aksi ini akan menghapus user beserta{" "}
              <strong className="text-neutral-900">
                semua data terkait
              </strong>{" "}
              secara permanen:
            </p>
            <ul className="list-disc space-y-0.5 pl-5 text-neutral-700">
              <li>Toko dan profil branding (logo, banner)</li>
              <li>Semua produk + gambar produk di storage</li>
              <li>Riwayat pesanan, bukti transfer, QRIS, rekening</li>
              <li>Promo, kategori, staff, audit log toko</li>
              <li>Subscription + invoice</li>
            </ul>
            <p className="text-danger">
              Tindakan ini <strong>tidak bisa dibatalkan</strong>. Pertimbangkan
              pakai &ldquo;Blokir&rdquo; kalau hanya mau nonaktifkan sementara.
            </p>
          </div>
        }
      />
    </Card>
  );
}
