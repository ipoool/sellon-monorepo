"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Check,
  Copy,
  Handshake,
  Loader2,
  Plus,
  QrCode,
  X,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { showError, showSuccess } from "@/lib/toast";
import { formatRupiah } from "@/lib/format";
import { PartnerQrDialog } from "@/components/admin/partner-qr-dialog";
import type { Partner } from "@/lib/types";

const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

/** 2000 -> "20%", 1750 -> "17,5%". Indonesian decimal comma. */
export function formatRate(bps: number): string {
  const whole = Math.floor(bps / 100);
  const frac = bps % 100;
  if (frac === 0) return `${whole}%`;
  if (frac % 10 === 0) return `${whole},${frac / 10}%`;
  return `${whole},${String(frac).padStart(2, "0")}%`;
}

export function partnerLink(code: string): string {
  const origin =
    typeof window !== "undefined"
      ? window.location.origin
      : "https://sellon.id";
  return `${origin}/?ref=${code}`;
}

export function AdminPartnersManager({ partners }: { partners: Partner[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Partner | null>(null);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-neutral-600">
          {partners.length} partner terdaftar
        </p>
        <Button size="md" onClick={() => setCreating(true)}>
          <Plus className="size-4" aria-hidden />
          Tambah partner
        </Button>
      </div>

      {partners.length === 0 ? (
        <Card className="py-16 text-center">
          <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-neutral-100 text-neutral-500">
            <Handshake className="size-7" aria-hidden />
          </div>
          <h2 className="mt-4 font-display text-xl font-semibold text-neutral-900">
            Belum ada partner
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-neutral-600">
            Daftarkan partner pertama, lalu bagikan link-nya. Setiap pendaftar
            lewat link itu tercatat, dan komisinya dihitung otomatis saat
            mereka berlangganan.
          </p>
        </Card>
      ) : (
        <ul className="grid gap-3 lg:grid-cols-2">
          {partners.map((p) => (
            <PartnerCard key={p.id} partner={p} onEdit={() => setEditing(p)} />
          ))}
        </ul>
      )}

      {(creating || editing) && (
        <PartnerFormDialog
          partner={editing}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSaved={() => {
            setCreating(false);
            setEditing(null);
            startTransition(() => router.refresh());
          }}
        />
      )}

      {pending && <p className="text-xs text-neutral-400">Menyegarkan…</p>}
    </div>
  );
}

function PartnerCard({
  partner: p,
  onEdit,
}: {
  partner: Partner;
  onEdit: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const referrals = p.referrals ?? 0;
  const converted = p.converted ?? 0;
  // Conversion rate earns its place next to the raw count: four hundred
  // signups and two subscriptions is a different conversation from twenty
  // and fifteen, and that is the conversation before renewing a deal.
  const rate = referrals > 0 ? Math.round((converted / referrals) * 100) : 0;

  return (
    <li className="rounded-xl border border-neutral-200 bg-white p-4 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="rounded-md bg-neutral-900 px-2 py-0.5 font-mono text-xs font-bold text-white">
              {p.code}
            </span>
            <Link
              href={`/platform/partners/${p.id}`}
              className="truncate font-medium text-neutral-900 hover:text-brand-700"
            >
              {p.name}
            </Link>
          </div>
          <p className="mt-0.5 text-xs text-neutral-500">
            Komisi {formatRate(p.commission_bps)}
            {p.contact_email ? ` · ${p.contact_email}` : " · belum ada email"}
          </p>
        </div>
        <Badge
          variant={
            p.status === "active"
              ? "success"
              : p.status === "paused"
                ? "warning"
                : "default"
          }
        >
          {p.status === "active"
            ? "Aktif"
            : p.status === "paused"
              ? "Dijeda"
              : "Selesai"}
        </Badge>
      </div>

      {/* The link is the product here — it goes on a flyer, so it has to be
          one click away from the clipboard. */}
      <div className="mt-3 flex items-center gap-2 rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2">
        <code className="min-w-0 flex-1 truncate font-mono text-xs text-neutral-700">
          {partnerLink(p.code)}
        </code>
        <button
          type="button"
          onClick={async () => {
            await navigator.clipboard.writeText(partnerLink(p.code));
            setCopied(true);
            setTimeout(() => setCopied(false), 1800);
          }}
          className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-brand-700 hover:bg-white"
        >
          {copied ? (
            <Check className="size-3.5" aria-hidden />
          ) : (
            <Copy className="size-3.5" aria-hidden />
          )}
          {copied ? "Tersalin" : "Salin"}
        </button>
        <button
          type="button"
          onClick={() => setQrOpen(true)}
          className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-brand-700 hover:bg-white"
        >
          <QrCode className="size-3.5" aria-hidden />
          QR
        </button>
      </div>

      {qrOpen && (
        <PartnerQrDialog
          partnerName={p.name}
          code={p.code}
          url={partnerLink(p.code)}
          onClose={() => setQrOpen(false)}
        />
      )}

      <dl className="mt-3 grid grid-cols-3 gap-2 border-t border-neutral-100 pt-3 text-sm">
        <div>
          <dt className="text-xs text-neutral-500">Pendaftar</dt>
          <dd className="font-medium text-neutral-900">
            {referrals.toLocaleString("id-ID")}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-neutral-500">Berlangganan</dt>
          <dd className="text-neutral-700">
            {converted.toLocaleString("id-ID")}
            {referrals > 0 && (
              <span className="ml-1 text-xs text-neutral-400">({rate}%)</span>
            )}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-neutral-500">Belum dibayar</dt>
          <dd
            className={
              (p.owed_cents ?? 0) > 0
                ? "font-bold text-brand-700"
                : "text-neutral-400"
            }
          >
            {formatRupiah(p.owed_cents ?? 0)}
          </dd>
        </div>
      </dl>

      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-neutral-100 pt-3">
        <Button size="sm" asChild>
          <Link href={`/platform/partners/${p.id}`}>
            Lihat detail
            <ArrowRight className="size-3.5" aria-hidden />
          </Link>
        </Button>
        <Button size="sm" variant="outline" onClick={onEdit}>
          Edit
        </Button>
      </div>
    </li>
  );
}

function PartnerFormDialog({
  partner,
  onClose,
  onSaved,
}: {
  partner: Partner | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const editing = partner !== null;
  const [code, setCode] = useState(partner?.code ?? "");
  const [name, setName] = useState(partner?.name ?? "");
  const [contactName, setContactName] = useState(partner?.contact_name ?? "");
  const [contactEmail, setContactEmail] = useState(
    partner?.contact_email ?? "",
  );
  const [contactPhone, setContactPhone] = useState(
    partner?.contact_phone ?? "",
  );
  const [ratePct, setRatePct] = useState(
    partner ? String(partner.commission_bps / 100) : "20",
  );
  const [status, setStatus] = useState(partner?.status ?? "active");
  const [notes, setNotes] = useState(partner?.notes ?? "");
  const [busy, setBusy] = useState(false);

  async function save() {
    const pct = Number(ratePct.replace(",", "."));
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
      showError("Komisi harus antara 0 dan 100 persen");
      return;
    }
    setBusy(true);
    try {
      const body = {
        code,
        name,
        contact_name: contactName,
        contact_email: contactEmail,
        contact_phone: contactPhone,
        commission_bps: Math.round(pct * 100),
        status,
        notes,
      };
      const res = await fetch(
        editing
          ? `${apiBase}/api/v1/admin/partners/${partner.id}`
          : `${apiBase}/api/v1/admin/partners`,
        {
          method: editing ? "PUT" : "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Gagal menyimpan");
      showSuccess(editing ? "Partner diperbarui" : "Partner didaftarkan");
      onSaved();
    } catch (e) {
      showError(e instanceof Error ? e.message : "Gagal menyimpan");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      onClose={onClose}
      title={editing ? `Edit ${partner.name}` : "Tambah partner"}
    >
      <div className="flex flex-col gap-3">
        {!editing && (
          <Field label="Kode partner" hint="2–24 huruf/angka, mis. EVENTJKT">
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="EVENTJKT"
              autoFocus
            />
          </Field>
        )}
        {editing && (
          <p className="rounded-lg bg-neutral-50 px-3 py-2 text-xs text-neutral-500">
            Kode{" "}
            <code className="font-mono font-bold text-neutral-700">
              {partner.code}
            </code>{" "}
            tidak bisa diubah — link-nya sudah beredar.
          </p>
        )}
        <Field label="Nama partner">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Acara UMKM Jakarta 2026"
          />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Nama kontak">
            <Input
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
              placeholder="Budi"
            />
          </Field>
          <Field label="Komisi (%)" hint="Dari nilai langganan pertama">
            <Input
              value={ratePct}
              onChange={(e) => setRatePct(e.target.value)}
              placeholder="20"
              inputMode="decimal"
            />
          </Field>
        </div>
        <Field
          label="Email kontak"
          hint="Tujuan notifikasi tiap ada langganan baru. Kosongkan untuk mematikan notifikasi."
        >
          <Input
            type="email"
            value={contactEmail}
            onChange={(e) => setContactEmail(e.target.value)}
            placeholder="budi@acara.id"
          />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="No. WhatsApp">
            <Input
              value={contactPhone}
              onChange={(e) => setContactPhone(e.target.value)}
              placeholder="08123456789"
            />
          </Field>
          {editing && (
            <Field label="Status">
              <select
                value={status}
                onChange={(e) =>
                  setStatus(e.target.value as Partner["status"])
                }
                className="h-11 w-full rounded-lg border border-neutral-200 bg-white px-3 text-sm text-neutral-900"
              >
                <option value="active">Aktif</option>
                <option value="paused">Dijeda</option>
                <option value="ended">Selesai</option>
              </select>
            </Field>
          )}
        </div>
        <Field label="Catatan">
          <Input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Kesepakatan, periode, dll."
          />
        </Field>
      </div>

      <div className="mt-5 flex items-center justify-end gap-2">
        <Button variant="ghost" onClick={onClose} disabled={busy}>
          Batal
        </Button>
        <Button onClick={save} disabled={busy}>
          {busy && <Loader2 className="size-4 animate-spin" aria-hidden />}
          Simpan
        </Button>
      </div>
    </Dialog>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-neutral-700">
        {label}
      </span>
      {children}
      {hint && <span className="mt-1 block text-xs text-neutral-500">{hint}</span>}
    </label>
  );
}

export function Dialog({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-900/40 p-4">
      <div className="max-h-[90svh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 shadow-popout">
        <div className="flex items-start justify-between gap-3">
          <h2 className="font-display text-lg font-semibold text-neutral-900">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
            aria-label="Tutup"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}
