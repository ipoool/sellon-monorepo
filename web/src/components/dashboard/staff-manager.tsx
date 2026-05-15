"use client";

import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { showError, showSuccess } from "@/lib/toast";
import { useRouter } from "next/navigation";
import {
  UserPlus,
  Trash2,
  Crown,
  Shield,
  Mail,
  AlertTriangle,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Tooltip } from "@/components/ui/tooltip";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import type { StaffData, StaffInvite, StaffMember } from "@/lib/types";

const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

const roleLabel: Record<StaffMember["role"], string> = {
  owner: "Pemilik",
  admin: "Admin",
  staff: "Staf",
};

const roleVariant: Record<
  StaffMember["role"],
  "brand" | "success" | "default"
> = {
  owner: "brand",
  admin: "success",
  staff: "default",
};

type Props = { initial: StaffData };

export function StaffManager({ initial }: Props) {
  const { refresh } = useRouter();
  const [data, setData] = useState<StaffData>(() => initial);
  const [showInvite, setShowInvite] = useState(false);
  const [pendingRemove, setPendingRemove] = useState<StaffMember | null>(null);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const inviteDialogRef = useRef<HTMLDialogElement>(null);
  const removeDialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = inviteDialogRef.current;
    if (!d) return;
    if (showInvite && !d.open) d.showModal();
    if (!showInvite && d.open) d.close();
  }, [showInvite]);
  useEffect(() => {
    const d = removeDialogRef.current;
    if (!d) return;
    if (pendingRemove && !d.open) d.showModal();
    if (!pendingRemove && d.open) d.close();
  }, [pendingRemove]);

  useEffect(() => {
    const i = inviteDialogRef.current;
    const r = removeDialogRef.current;
    if (!i || !r) return;
    const closeI = () => setShowInvite(false);
    const closeR = () => setPendingRemove(null);
    const onIBackdrop = (e: MouseEvent) => {
      if (e.target === i) closeI();
    };
    const onRBackdrop = (e: MouseEvent) => {
      if (e.target === r) closeR();
    };
    i.addEventListener("click", onIBackdrop);
    i.addEventListener("cancel", closeI);
    r.addEventListener("click", onRBackdrop);
    r.addEventListener("cancel", closeR);
    return () => {
      i.removeEventListener("click", onIBackdrop);
      i.removeEventListener("cancel", closeI);
      r.removeEventListener("click", onRBackdrop);
      r.removeEventListener("cancel", closeR);
    };
  }, []);

  async function reloadData() {
    const res = await fetch(`${apiBase}/api/v1/staff`, {
      credentials: "include",
    });
    if (res.ok) {
      const next = (await res.json()) as StaffData;
      setData(next);
    }
    refresh();
  }

  async function onInvite(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setFlash(null);
    const fd = new FormData(e.currentTarget);
    const email = String(fd.get("email") ?? "").trim();
    const role = String(fd.get("role") ?? "staff");
    try {
      const res = await fetch(`${apiBase}/api/v1/staff/invite`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, role }),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(out.error || `HTTP ${res.status}`);
      setShowInvite(false);
      setFlash(
        out.direct
          ? `${email} sudah punya akun SellOn - langsung ditambahkan sebagai ${role}.`
          : `Undangan terkirim ke ${email}. Akan aktif saat dia login dengan Google.`,
      );
      setTimeout(() => setFlash(null), 5000);
      await reloadData();
    } catch (err) {
      showError(err);
    } finally {
      setBusy(false);
    }
  }

  async function confirmRemove() {
    if (!pendingRemove) return;
    setBusy(true);
    try {
      const res = await fetch(
        `${apiBase}/api/v1/staff/${pendingRemove.user_id}`,
        { method: "DELETE", credentials: "include" },
      );
      if (!res.ok) {
        const out = await res.json().catch(() => ({}));
        throw new Error(out.error || `HTTP ${res.status}`);
      }
      setPendingRemove(null);
      await reloadData();
    } catch (err) {
      showError(err);
    } finally {
      setBusy(false);
    }
  }

  async function deleteInvite(inv: StaffInvite) {
    setBusy(true);
    try {
      const res = await fetch(
        `${apiBase}/api/v1/staff/invites/${inv.id}`,
        { method: "DELETE", credentials: "include" },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await reloadData();
    } catch (err) {
      showError(err);
    } finally {
      setBusy(false);
    }
  }

  const limit = data.staff_limit;
  const used = data.members_used + data.invites.length;
  const isCapped = limit > 0;
  const quotaFull = isCapped && used >= limit;

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="font-semibold text-neutral-900">Staf & Anggota Tim</h2>
            <p className="mt-0.5 text-sm text-neutral-600">
              Undang anggota tim untuk akses dasbor toko-mu. Pemilik tetap kamu -
              mereka tidak bisa hapus toko atau ubah berlangganan.
            </p>
            {isCapped && (
              <p className="mt-2 text-xs font-medium text-neutral-700">
                {used} / {limit} seat terpakai
                {quotaFull && " - limit tier tercapai."}
              </p>
            )}
          </div>
          <Button
            size="sm"
            onClick={() => {
              setShowInvite(true);
            }}
            disabled={quotaFull}
            title={quotaFull ? "Limit tier tercapai" : undefined}
          >
            <UserPlus className="size-4" aria-hidden />
            Undang Staf
          </Button>
        </div>

        {flash && (
          <p className="mt-4 rounded-lg border border-success/40 bg-success/10 p-3 text-sm font-medium text-neutral-800">
            {flash}
          </p>
        )}
        
        <ul className="mt-5 flex flex-col divide-y divide-neutral-200 rounded-lg border border-neutral-200">
          {data.members.map((m) => (
            <li
              key={m.user_id}
              className="flex items-center gap-3 px-4 py-3"
            >
              <Avatar
                src={m.picture_url}
                name={m.name || m.email}
                size="sm"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-neutral-900">
                  {m.name || m.email}
                  {m.is_current && (
                    <span className="ml-1.5 text-xs text-neutral-500">
                      (Anda)
                    </span>
                  )}
                </p>
                <p className="truncate text-xs text-neutral-500">{m.email}</p>
              </div>
              <Badge variant={roleVariant[m.role]}>
                {m.role === "owner" && (
                  <Crown className="size-3" aria-hidden />
                )}
                {m.role === "admin" && (
                  <Shield className="size-3" aria-hidden />
                )}
                {roleLabel[m.role]}
              </Badge>
              {m.role !== "owner" && !m.is_current && (
                <Tooltip label="Hapus dari tim" align="end">
                  <button
                    type="button"
                    onClick={() => {
                      setPendingRemove(m);
                    }}
                    className="inline-flex size-8 items-center justify-center rounded-md text-neutral-500 transition-colors hover:bg-danger/10 hover:text-danger"
                    aria-label={`Hapus ${m.name || m.email}`}
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </button>
                </Tooltip>
              )}
            </li>
          ))}
        </ul>

        {data.invites.length > 0 && (
          <>
            <h3 className="mt-6 text-sm font-semibold text-neutral-900">
              Undangan Pending
            </h3>
            <ul className="mt-3 flex flex-col divide-y divide-neutral-200 rounded-lg border border-neutral-200">
              {data.invites.map((inv) => (
                <li
                  key={inv.id}
                  className="flex items-center gap-3 px-4 py-3"
                >
                  <div className="flex size-8 items-center justify-center rounded-full bg-warning/15 text-warning">
                    <Mail className="size-4" aria-hidden />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-neutral-900">
                      {inv.email}
                    </p>
                    <p className="text-xs text-neutral-500">
                      Sebagai {roleLabel[inv.role]} · menunggu login pertama
                    </p>
                  </div>
                  <Tooltip label="Batalkan undangan" align="end">
                    <button
                      type="button"
                      onClick={() => deleteInvite(inv)}
                      disabled={busy}
                      className="inline-flex size-8 items-center justify-center rounded-md text-neutral-500 transition-colors hover:bg-danger/10 hover:text-danger"
                      aria-label="Batalkan undangan"
                    >
                      <X className="size-4" aria-hidden />
                    </button>
                  </Tooltip>
                </li>
              ))}
            </ul>
          </>
        )}

        <div className="mt-5 rounded-lg border border-brand-200 bg-brand-50/50 p-3 text-xs text-neutral-700">
          <p className="font-semibold text-brand-700">Cara kerja undangan</p>
          <p className="mt-1">
            Saat kamu undang lewat email, kalau orang itu sudah punya akun
            SellOn, mereka langsung ditambahkan. Kalau belum, mereka jadi
            &ldquo;Pending&rdquo; - undangan otomatis aktif saat mereka login
            pertama kali pakai akun Google dengan email yang sama.
          </p>
        </div>
      </Card>

      {/* Invite dialog */}
      <dialog
        ref={inviteDialogRef}
        aria-labelledby="invite-title"
        className="fixed left-1/2 top-1/2 m-0 w-[min(440px,95vw)] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-neutral-200 bg-white p-0 shadow-popout backdrop:bg-neutral-900/40 backdrop:backdrop-blur-sm"
      >
        <form onSubmit={onInvite}>
          <div className="flex items-start justify-between gap-3 border-b border-neutral-200 px-5 py-3.5">
            <div className="flex items-center gap-2">
              <UserPlus className="size-5 text-brand-600" aria-hidden />
              <h2
                id="invite-title"
                className="font-display text-base font-semibold text-neutral-900"
              >
                Undang Staf Baru
              </h2>
            </div>
            <button
              type="button"
              onClick={() => setShowInvite(false)}
              aria-label="Tutup"
              className="inline-flex size-8 items-center justify-center rounded-md text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-900"
            >
              <X className="size-4" aria-hidden />
            </button>
          </div>
          <div className="flex flex-col gap-4 p-5">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="invite_email">Email Google staf *</Label>
              <Input
                id="invite_email"
                name="email"
                type="email"
                required

                placeholder="rekan@gmail.com"
              />
              <p className="text-xs text-neutral-500">
                Pakai email yang sama dengan akun Google mereka.
              </p>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="invite_role">Role</Label>
              <Select id="invite_role" name="role" defaultValue="staff">
                <option value="staff">Staf - operasional pesanan & produk</option>
                <option value="admin">Admin - akses penuh kecuali billing</option>
              </Select>
            </div>
                      </div>
          <div className="flex items-center justify-end gap-2 border-t border-neutral-200 bg-neutral-50 px-5 py-3">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setShowInvite(false)}
              disabled={busy}
            >
              Batal
            </Button>
            <Button type="submit" size="sm" disabled={busy}>
              <UserPlus className="size-4" aria-hidden />
              {busy ? "Mengundang…" : "Undang"}
            </Button>
          </div>
        </form>
      </dialog>

      {/* Remove dialog */}
      <dialog
        ref={removeDialogRef}
        aria-labelledby="remove-title"
        className="fixed left-1/2 top-1/2 m-0 w-[min(420px,95vw)] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-neutral-200 bg-white p-0 shadow-popout backdrop:bg-neutral-900/40 backdrop:backdrop-blur-sm"
      >
        <div className="flex items-start gap-3 p-5">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-danger/10 text-danger">
            <AlertTriangle className="size-5" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <h2
              id="remove-title"
              className="font-display text-base font-semibold text-neutral-900"
            >
              Hapus dari tim?
            </h2>
            <p className="mt-1.5 text-sm text-neutral-600">
              {pendingRemove?.name || pendingRemove?.email} akan langsung
              kehilangan akses ke dasbor toko ini. Kamu bisa undang mereka
              kembali kapan saja.
            </p>
                      </div>
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-neutral-200 bg-neutral-50 px-5 py-3">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => setPendingRemove(null)}
            disabled={busy}
          >
            Batal
          </Button>
          <Button
            type="button"
            size="sm"
            variant="destructive"
            onClick={confirmRemove}
            disabled={busy}
          >
            <Trash2 className="size-4" aria-hidden />
            {busy ? "Menghapus…" : "Hapus"}
          </Button>
        </div>
      </dialog>
    </div>
  );
}
