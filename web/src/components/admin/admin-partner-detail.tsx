"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Banknote,
  Check,
  Copy,
  Loader2,
  UserPlus,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Stat } from "@/components/ui/stat";
import { showError, showSuccess } from "@/lib/toast";
import { formatRupiah, formatDateTimeID } from "@/lib/format";
import {
  Dialog,
  Field,
  formatRate,
  partnerLink,
} from "@/components/admin/admin-partners-manager";
import type {
  Partner,
  PartnerCommission,
  PartnerPayout,
  PartnerReferral,
} from "@/lib/types";

const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

export function AdminPartnerDetail({
  partner,
  referrals,
  referralsTotal,
  commissions,
  payouts,
}: {
  partner: Partner;
  referrals: PartnerReferral[];
  referralsTotal: number;
  commissions: PartnerCommission[];
  payouts: PartnerPayout[];
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [copied, setCopied] = useState(false);
  const [payoutOpen, setPayoutOpen] = useState(false);
  const [attachOpen, setAttachOpen] = useState(false);
  const [voiding, setVoiding] = useState<PartnerCommission | null>(null);
  const [busy, setBusy] = useState(false);

  const owed = commissions
    .filter((c) => c.status === "earned")
    .reduce((sum, c) => sum + c.commission_cents, 0);
  const paid = commissions
    .filter((c) => c.status === "paid")
    .reduce((sum, c) => sum + c.commission_cents, 0);
  const converted = commissions.filter((c) => c.status !== "void").length;
  const rate =
    referralsTotal > 0 ? Math.round((converted / referralsTotal) * 100) : 0;

  async function voidCommission(reason: string) {
    if (!voiding) return;
    setBusy(true);
    try {
      const res = await fetch(
        `${apiBase}/api/v1/admin/partners/commissions/${voiding.id}/void`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason }),
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Gagal membatalkan");
      showSuccess("Komisi dibatalkan");
      setVoiding(null);
      startTransition(() => router.refresh());
    } catch (e) {
      showError(e instanceof Error ? e.message : "Gagal membatalkan");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Komisi belum dibayar" value={formatRupiah(owed)} />
        <Stat label="Sudah dibayar" value={formatRupiah(paid)} />
        <Stat
          label="Pendaftar"
          value={referralsTotal.toLocaleString("id-ID")}
        />
        <Stat
          label="Berlangganan"
          value={`${converted.toLocaleString("id-ID")} (${rate}%)`}
        />
      </div>

      <Card className="p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-medium text-neutral-900">
              Link partner
            </p>
            <p className="mt-0.5 text-xs text-neutral-500">
              Komisi {formatRate(partner.commission_bps)} dari langganan
              pertama tiap pendaftar
              {partner.contact_email
                ? ` · notifikasi ke ${partner.contact_email}`
                : " · notifikasi mati (email kontak kosong)"}
            </p>
          </div>
          <Badge
            variant={
              partner.status === "active"
                ? "success"
                : partner.status === "paused"
                  ? "warning"
                  : "default"
            }
          >
            {partner.status === "active"
              ? "Aktif"
              : partner.status === "paused"
                ? "Dijeda"
                : "Selesai"}
          </Badge>
        </div>
        <div className="mt-3 flex items-center gap-2 rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2">
          <code className="min-w-0 flex-1 truncate font-mono text-xs text-neutral-700">
            {partnerLink(partner.code)}
          </code>
          <button
            type="button"
            onClick={async () => {
              await navigator.clipboard.writeText(partnerLink(partner.code));
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
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            size="sm"
            onClick={() => setPayoutOpen(true)}
            disabled={owed <= 0}
          >
            <Banknote className="size-3.5" aria-hidden />
            Tandai sudah dibayar
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setAttachOpen(true)}
          >
            <UserPlus className="size-3.5" aria-hidden />
            Hubungkan user manual
          </Button>
        </div>
      </Card>

      {/* Pendaftar — the literal answer to "who did they bring, and did
          they pay". */}
      <section>
        <h2 className="mb-2 font-display text-base font-bold text-neutral-900">
          Pendaftar
        </h2>
        {referrals.length === 0 ? (
          <Card className="py-10 text-center text-sm text-neutral-500">
            Belum ada yang daftar lewat link ini.
          </Card>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white shadow-card">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="border-b border-neutral-200 bg-neutral-50 text-xs uppercase tracking-wide text-neutral-500">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold">User</th>
                  <th className="px-4 py-3 text-left font-semibold">Daftar</th>
                  <th className="px-4 py-3 text-left font-semibold">Toko</th>
                  <th className="px-4 py-3 text-left font-semibold">Status</th>
                  <th className="px-4 py-3 text-right font-semibold">Komisi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {referrals.map((r) => (
                  <tr key={r.user_id}>
                    <td className="px-4 py-3">
                      <p className="font-medium text-neutral-900">
                        {r.name || "—"}
                      </p>
                      <p className="text-xs text-neutral-500">{r.email}</p>
                    </td>
                    <td className="px-4 py-3 text-neutral-600">
                      <p>{formatDateTimeID(r.created_at)}</p>
                      <p className="text-xs text-neutral-400">
                        {r.signup_method === "google"
                          ? "Google"
                          : r.signup_method === "admin"
                            ? "Manual"
                            : "Email"}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-neutral-600">
                      {r.store_name || (
                        <span className="text-neutral-400">belum ada</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {r.subscribed ? (
                        <Badge variant="success">
                          {r.plan ? r.plan.toUpperCase() : "Berlangganan"}
                        </Badge>
                      ) : (
                        <span className="text-xs text-neutral-400">
                          Belum bayar
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-neutral-900">
                      {r.commission_cents > 0
                        ? formatRupiah(r.commission_cents)
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-2 font-display text-base font-bold text-neutral-900">
          Komisi
        </h2>
        {commissions.length === 0 ? (
          <Card className="py-10 text-center text-sm text-neutral-500">
            Belum ada komisi. Komisi tercatat otomatis saat pendaftar
            berlangganan pertama kali.
          </Card>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white shadow-card">
            <table className="w-full min-w-[820px] text-sm">
              <thead className="border-b border-neutral-200 bg-neutral-50 text-xs uppercase tracking-wide text-neutral-500">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold">Tanggal</th>
                  <th className="px-4 py-3 text-left font-semibold">Toko</th>
                  <th className="px-4 py-3 text-left font-semibold">Paket</th>
                  <th className="px-4 py-3 text-right font-semibold">Nilai</th>
                  <th className="px-4 py-3 text-right font-semibold">Komisi</th>
                  <th className="px-4 py-3 text-left font-semibold">Status</th>
                  <th className="px-4 py-3 text-right font-semibold">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {commissions.map((c) => (
                  <tr key={c.id}>
                    <td className="px-4 py-3 text-neutral-600">
                      {formatDateTimeID(c.created_at)}
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-neutral-900">{c.store_name || "—"}</p>
                      <p className="text-xs text-neutral-500">
                        {c.referred_user_email}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-neutral-600">
                      {c.plan.toUpperCase()}
                      <span className="text-xs text-neutral-400">
                        {" "}
                        · {c.months} bln
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-neutral-600">
                      {formatRupiah(c.base_amount_cents)}
                      <span className="block text-xs text-neutral-400">
                        {formatRate(c.commission_bps)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-neutral-900">
                      {formatRupiah(c.commission_cents)}
                    </td>
                    <td className="px-4 py-3">
                      {c.status === "earned" && (
                        <Badge variant="warning">Akan dibayar</Badge>
                      )}
                      {c.status === "paid" && (
                        <>
                          <Badge variant="success">Sudah dibayar</Badge>
                          {c.payout_ref && (
                            <span className="mt-0.5 block text-xs text-neutral-400">
                              {c.payout_ref}
                            </span>
                          )}
                        </>
                      )}
                      {c.status === "void" && (
                        <>
                          <Badge variant="default">Dibatalkan</Badge>
                          {c.void_reason && (
                            <span className="mt-0.5 block text-xs text-neutral-400">
                              {c.void_reason}
                            </span>
                          )}
                        </>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {c.status === "earned" && (
                        <button
                          type="button"
                          onClick={() => setVoiding(c)}
                          className="rounded-md px-2 py-1 text-xs font-medium text-danger hover:bg-danger/10"
                        >
                          Batalkan
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {payouts.length > 0 && (
        <section>
          <h2 className="mb-2 font-display text-base font-bold text-neutral-900">
            Riwayat pembayaran
          </h2>
          <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white shadow-card">
            <table className="w-full min-w-[600px] text-sm">
              <thead className="border-b border-neutral-200 bg-neutral-50 text-xs uppercase tracking-wide text-neutral-500">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold">Tanggal</th>
                  <th className="px-4 py-3 text-right font-semibold">Jumlah</th>
                  <th className="px-4 py-3 text-left font-semibold">Metode</th>
                  <th className="px-4 py-3 text-left font-semibold">
                    Referensi
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {payouts.map((p) => (
                  <tr key={p.id}>
                    <td className="px-4 py-3 text-neutral-600">
                      {formatDateTimeID(p.paid_at)}
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-neutral-900">
                      {formatRupiah(p.amount_cents)}
                      <span className="block text-xs font-normal text-neutral-400">
                        {p.commission_count} komisi
                      </span>
                    </td>
                    <td className="px-4 py-3 text-neutral-600">
                      {p.method || "—"}
                    </td>
                    <td className="px-4 py-3 text-neutral-600">
                      {p.reference || "—"}
                      {p.notes && (
                        <span className="block text-xs text-neutral-400">
                          {p.notes}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {payoutOpen && (
        <PayoutDialog
          partnerId={partner.id}
          owed={owed}
          onClose={() => setPayoutOpen(false)}
          onSaved={() => {
            setPayoutOpen(false);
            startTransition(() => router.refresh());
          }}
        />
      )}

      {attachOpen && (
        <AttachDialog
          partnerId={partner.id}
          onClose={() => setAttachOpen(false)}
          onSaved={() => {
            setAttachOpen(false);
            startTransition(() => router.refresh());
          }}
        />
      )}

      <ConfirmDialog
        open={voiding !== null}
        onClose={() => setVoiding(null)}
        title="Batalkan komisi?"
        description={
          `Komisi ${formatRupiah(voiding?.commission_cents ?? 0)} untuk ` +
          `${voiding?.store_name ?? ""} tidak akan ikut dibayarkan. ` +
          `Kalau nanti toko itu bayar lagi, komisinya dihitung ulang.`
        }
        confirmLabel="Batalkan komisi"
        kind="danger"
        busy={busy}
        onConfirm={() => void voidCommission("dibatalkan admin")}
      />
    </div>
  );
}

function PayoutDialog({
  partnerId,
  owed,
  onClose,
  onSaved,
}: {
  partnerId: string;
  owed: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [method, setMethod] = useState("Transfer bank");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      const res = await fetch(
        `${apiBase}/api/v1/admin/partners/${partnerId}/payouts`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ method, reference, notes }),
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Gagal mencatat");
      showSuccess(`Pembayaran ${formatRupiah(owed)} dicatat`);
      onSaved();
    } catch (e) {
      showError(e instanceof Error ? e.message : "Gagal mencatat");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog onClose={onClose} title="Tandai komisi sudah dibayar">
      <p className="text-sm leading-relaxed text-neutral-600">
        Semua komisi yang menunggu akan ditandai lunas dalam satu batch.
        Catat referensi transfernya supaya nanti bisa ditelusuri.
      </p>
      <div className="my-4 rounded-lg bg-brand-50 px-4 py-3">
        <p className="text-xs text-brand-700">Jumlah dibayarkan</p>
        <p className="font-display text-2xl font-bold text-brand-800">
          {formatRupiah(owed)}
        </p>
      </div>
      <div className="flex flex-col gap-3">
        <Field label="Metode">
          <Input value={method} onChange={(e) => setMethod(e.target.value)} />
        </Field>
        <Field label="Referensi" hint="Nomor transfer, atau catatan bukti">
          <Input
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder="TRX-20261017-001"
          />
        </Field>
        <Field label="Catatan">
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
      </div>
      <div className="mt-5 flex items-center justify-end gap-2">
        <Button variant="ghost" onClick={onClose} disabled={busy}>
          Batal
        </Button>
        <Button onClick={save} disabled={busy}>
          {busy && <Loader2 className="size-4 animate-spin" aria-hidden />}
          Tandai lunas
        </Button>
      </div>
    </Dialog>
  );
}

function AttachDialog({
  partnerId,
  onClose,
  onSaved,
}: {
  partnerId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      const res = await fetch(
        `${apiBase}/api/v1/admin/partners/${partnerId}/referrals`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Gagal menghubungkan");
      showSuccess("User dihubungkan ke partner ini");
      onSaved();
    } catch (e) {
      showError(e instanceof Error ? e.message : "Gagal menghubungkan");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog onClose={onClose} title="Hubungkan user ke partner">
      <p className="text-sm leading-relaxed text-neutral-600">
        Untuk user yang sudah punya akun sebelum acara, jadi tidak terhubung
        otomatis. User yang sudah terhubung ke partner lain tidak bisa
        dipindahkan.
      </p>
      <div className="mt-4">
        <Field label="Email user">
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="pemilik@toko.id"
            autoFocus
          />
        </Field>
      </div>
      <div className="mt-5 flex items-center justify-end gap-2">
        <Button variant="ghost" onClick={onClose} disabled={busy}>
          Batal
        </Button>
        <Button onClick={save} disabled={busy || !email.trim()}>
          {busy && <Loader2 className="size-4 animate-spin" aria-hidden />}
          Hubungkan
        </Button>
      </div>
    </Dialog>
  );
}
