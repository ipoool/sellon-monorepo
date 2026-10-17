"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Camera,
  Copy,
  KeyRound,
  Loader2,
  Pause,
  Play,
  Plus,
  Printer,
  Settings2,
  Wifi,
  WifiOff,
  X,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { showError, showSuccess } from "@/lib/toast";
import { formatRupiah } from "@/lib/format";
import type {
  PhotoBoothBooth,
  PhotoBoothConfig,
  PhotoBoothDeviceToken,
} from "@/lib/types";

const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

type Props = {
  booths: PhotoBoothBooth[];
  settings: PhotoBoothConfig;
};

/// "2 menit lalu" — for a fleet you are scanning, elapsed time reads faster
/// than a timestamp you have to subtract in your head.
function sinceLabel(iso: string | null): string {
  if (!iso) return "belum pernah";
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "baru saja";
  if (mins < 60) return `${mins} menit lalu`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} jam lalu`;
  return `${Math.floor(hours / 24)} hari lalu`;
}

const OFFLINE_AFTER_MINUTES = 15;

function isOffline(b: PhotoBoothBooth): boolean {
  if (b.status !== "active") return false;
  if (!b.last_seen_at) return true;
  return Date.now() - new Date(b.last_seen_at).getTime() >
    OFFLINE_AFTER_MINUTES * 60_000;
}

export function AdminPhotoBoothManager({ booths, settings }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<PhotoBoothBooth | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [retire, setRetire] = useState<PhotoBoothBooth | null>(null);
  // The raw token lives here and nowhere else — once this clears, it is gone.
  const [issued, setIssued] = useState<{ booth: string; token: string } | null>(
    null,
  );

  async function call(path: string, init: RequestInit) {
    const res = await fetch(`${apiBase}/api/v1/admin/photobooth${path}`, {
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      ...init,
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body?.error || "Gagal memproses permintaan");
    return body;
  }

  async function setStatus(b: PhotoBoothBooth, status: string) {
    setBusyId(b.id);
    try {
      await call(`/booths/${b.id}`, {
        method: "PUT",
        body: JSON.stringify({
          name: b.name,
          location: b.location,
          notes: b.notes,
          status,
          price_cents: b.price_cents,
          shots_count: b.shots_count,
          print_copies: b.print_copies,
          session_timeout_seconds: b.session_timeout_seconds,
          qris_expiry_minutes: b.qris_expiry_minutes,
          frames: b.frames,
        }),
      });
      showSuccess(
        status === "active"
          ? `Booth ${b.code} diaktifkan`
          : status === "paused"
            ? `Booth ${b.code} dijeda`
            : `Booth ${b.code} dipensiunkan`,
      );
      startTransition(() => router.refresh());
    } catch (e) {
      showError(e instanceof Error ? e.message : "Gagal menyimpan");
    } finally {
      setBusyId(null);
      setRetire(null);
    }
  }

  async function issueToken(b: PhotoBoothBooth) {
    setBusyId(b.id);
    try {
      const out = await call(`/booths/${b.id}/tokens`, {
        method: "POST",
        body: JSON.stringify({ label: "tablet" }),
      });
      setIssued({ booth: b.code, token: out.token as string });
      startTransition(() => router.refresh());
    } catch (e) {
      showError(e instanceof Error ? e.message : "Gagal menerbitkan token");
    } finally {
      setBusyId(null);
    }
  }

  async function revokeToken(t: PhotoBoothDeviceToken) {
    setBusyId(t.id);
    try {
      await call(`/tokens/${t.id}/revoke`, { method: "POST" });
      showSuccess("Token dicabut");
      startTransition(() => router.refresh());
    } catch (e) {
      showError(e instanceof Error ? e.message : "Gagal mencabut token");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-neutral-600">
          {booths.length} booth terdaftar · harga default{" "}
          <span className="font-medium text-neutral-900">
            {formatRupiah(settings.price_cents)}
          </span>{" "}
          untuk {settings.shots_count} foto
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            size="md"
            variant="outline"
            onClick={() => setShowSettings(true)}
          >
            <Settings2 className="size-4" aria-hidden />
            Pengaturan default
          </Button>
          <Button size="md" onClick={() => setCreating(true)}>
            <Plus className="size-4" aria-hidden />
            Daftarkan booth
          </Button>
        </div>
      </div>

      {booths.length === 0 ? (
        <Card className="py-16 text-center">
          <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-neutral-100 text-neutral-500">
            <Camera className="size-7" aria-hidden />
          </div>
          <h2 className="mt-4 font-display text-xl font-semibold text-neutral-900">
            Belum ada booth
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-neutral-600">
            Daftarkan unit pertama, lalu terbitkan token perangkat dan pasang
            di tabletnya.
          </p>
        </Card>
      ) : (
        <ul className="grid gap-3 lg:grid-cols-2">
          {booths.map((b) => {
            const offline = isOffline(b);
            const busy = busyId === b.id;
            const liveTokens = (b.tokens ?? []).filter((t) => !t.revoked_at);
            return (
              <li
                key={b.id}
                className="rounded-xl border border-neutral-200 bg-white p-4 shadow-card"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="rounded-md bg-neutral-900 px-2 py-0.5 font-mono text-xs font-bold text-white">
                        {b.code}
                      </span>
                      <p className="truncate font-medium text-neutral-900">
                        {b.name}
                      </p>
                    </div>
                    {b.location && (
                      <p className="mt-0.5 truncate text-xs text-neutral-500">
                        {b.location}
                      </p>
                    )}
                  </div>
                  <Badge
                    variant={
                      b.status === "active"
                        ? offline
                          ? "warning"
                          : "success"
                        : "default"
                    }
                  >
                    {b.status === "active"
                      ? offline
                        ? "Offline"
                        : "Aktif"
                      : b.status === "paused"
                        ? "Dijeda"
                        : "Pensiun"}
                  </Badge>
                </div>

                {/* Health: what an unattended fleet is actually asked about. */}
                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-neutral-100 pt-3 text-xs text-neutral-600">
                  <span className="inline-flex items-center gap-1.5">
                    {offline ? (
                      <WifiOff className="size-3.5 text-warning" aria-hidden />
                    ) : (
                      <Wifi className="size-3.5 text-success" aria-hidden />
                    )}
                    {sinceLabel(b.last_seen_at)}
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <Printer
                      className={
                        b.printer_ok
                          ? "size-3.5 text-success"
                          : "size-3.5 text-danger"
                      }
                      aria-hidden
                    />
                    {b.printer_ok ? "Printer siap" : "Printer bermasalah"}
                  </span>
                  {b.paper_low && (
                    <span className="font-medium text-warning">
                      Kertas menipis
                    </span>
                  )}
                  {b.app_version && (
                    <span className="text-neutral-400">v{b.app_version}</span>
                  )}
                </div>

                {/* Effective config, with inherited values shown as such so an
                    admin can tell an override from a default at a glance. */}
                {b.effective && (
                  <dl className="mt-3 grid grid-cols-3 gap-2 text-sm">
                    <div>
                      <dt className="text-xs text-neutral-500">Harga</dt>
                      <dd className="font-medium text-neutral-900">
                        {formatRupiah(b.effective.price_cents)}
                        {b.price_cents === null && (
                          <span className="ml-1 text-xs font-normal text-neutral-400">
                            default
                          </span>
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-neutral-500">Foto</dt>
                      <dd className="text-neutral-700">
                        {b.effective.shots_count}
                        {b.shots_count === null && (
                          <span className="ml-1 text-xs text-neutral-400">
                            default
                          </span>
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-neutral-500">Token aktif</dt>
                      <dd className="text-neutral-700">{liveTokens.length}</dd>
                    </div>
                  </dl>
                )}

                <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-neutral-100 pt-3">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setEditing(b)}
                    disabled={busy}
                  >
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => issueToken(b)}
                    disabled={busy || b.status === "retired"}
                  >
                    {busy ? (
                      <Loader2 className="size-3.5 animate-spin" aria-hidden />
                    ) : (
                      <KeyRound className="size-3.5" aria-hidden />
                    )}
                    Terbitkan token
                  </Button>
                  {b.status === "active" ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setStatus(b, "paused")}
                      disabled={busy}
                    >
                      <Pause className="size-3.5" aria-hidden />
                      Jeda
                    </Button>
                  ) : b.status === "paused" ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setStatus(b, "active")}
                      disabled={busy}
                    >
                      <Play className="size-3.5" aria-hidden />
                      Aktifkan
                    </Button>
                  ) : null}
                  {b.status !== "retired" && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-danger hover:bg-danger/10"
                      onClick={() => setRetire(b)}
                      disabled={busy}
                    >
                      Pensiunkan
                    </Button>
                  )}
                </div>

                {liveTokens.length > 0 && (
                  <ul className="mt-3 flex flex-col gap-1.5 border-t border-neutral-100 pt-3">
                    {liveTokens.map((t) => (
                      <li
                        key={t.id}
                        className="flex items-center justify-between gap-2 text-xs"
                      >
                        <span className="font-mono text-neutral-600">
                          {t.prefix}…
                        </span>
                        <span className="text-neutral-400">
                          dipakai {sinceLabel(t.last_used_at)}
                        </span>
                        <button
                          type="button"
                          onClick={() => revokeToken(t)}
                          disabled={busyId === t.id}
                          className="inline-flex items-center gap-1 rounded-md px-2 py-1 font-medium text-danger hover:bg-danger/10 disabled:opacity-50"
                        >
                          <X className="size-3" aria-hidden />
                          Cabut
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {issued && (
        <TokenRevealDialog
          boothCode={issued.booth}
          token={issued.token}
          onClose={() => setIssued(null)}
        />
      )}

      {(creating || editing) && (
        <BoothFormDialog
          booth={editing}
          settings={settings}
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

      {showSettings && (
        <SettingsDialog
          settings={settings}
          onClose={() => setShowSettings(false)}
          onSaved={() => {
            setShowSettings(false);
            startTransition(() => router.refresh());
          }}
        />
      )}

      <ConfirmDialog
        open={retire !== null}
        onClose={() => setRetire(null)}
        title="Pensiunkan booth?"
        description={
          `Booth ${retire?.code ?? ""} berhenti melayani dan tokennya tidak ` +
          `berlaku lagi. Riwayat transaksinya tetap tersimpan — booth tidak ` +
          `pernah dihapus supaya baris uangnya tidak ikut hilang.`
        }
        confirmLabel="Pensiunkan"
        kind="danger"
        busy={busyId === retire?.id}
        onConfirm={() => {
          if (retire) void setStatus(retire, "retired");
        }}
      />

      {pending && (
        <p className="text-xs text-neutral-400">Menyegarkan…</p>
      )}
    </div>
  );
}

/// The raw token appears exactly once. This dialog is that once.
function TokenRevealDialog({
  boothCode,
  token,
  onClose,
}: {
  boothCode: string;
  token: string;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <Dialog onClose={onClose} title={`Token untuk booth ${boothCode}`}>
      <p className="text-sm leading-relaxed text-neutral-600">
        Salin sekarang dan pasang di tabletnya. Token ini{" "}
        <strong className="text-neutral-900">tidak bisa dilihat lagi</strong>{" "}
        setelah dialog ini ditutup — kami hanya menyimpan sidik digitalnya.
      </p>
      <div className="mt-3 flex items-center gap-2 rounded-lg border border-neutral-200 bg-neutral-50 p-3">
        <code className="min-w-0 flex-1 break-all font-mono text-xs text-neutral-800">
          {token}
        </code>
        <Button
          size="sm"
          variant="outline"
          onClick={async () => {
            await navigator.clipboard.writeText(token);
            setCopied(true);
            showSuccess("Token disalin");
          }}
        >
          <Copy className="size-3.5" aria-hidden />
          {copied ? "Tersalin" : "Salin"}
        </Button>
      </div>
      <div className="mt-4 flex justify-end">
        <Button size="md" onClick={onClose}>
          Sudah saya simpan
        </Button>
      </div>
    </Dialog>
  );
}

function BoothFormDialog({
  booth,
  settings,
  onClose,
  onSaved,
}: {
  booth: PhotoBoothBooth | null;
  settings: PhotoBoothConfig;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [code, setCode] = useState(booth?.code ?? "");
  const [name, setName] = useState(booth?.name ?? "");
  const [location, setLocation] = useState(booth?.location ?? "");
  const [price, setPrice] = useState(
    booth?.price_cents != null ? String(booth.price_cents / 100) : "",
  );
  const [shots, setShots] = useState(
    booth?.shots_count != null ? String(booth.shots_count) : "",
  );
  const [saving, setSaving] = useState(false);

  async function submit() {
    setSaving(true);
    try {
      // Empty means inherit, so it is sent as null rather than 0.
      const body = {
        code: code.trim().toUpperCase(),
        name: name.trim(),
        location: location.trim(),
        notes: booth?.notes ?? "",
        status: booth?.status ?? "active",
        price_cents: price.trim() === "" ? null : Math.round(Number(price) * 100),
        shots_count: shots.trim() === "" ? null : Number(shots),
        print_copies: booth?.print_copies ?? null,
        session_timeout_seconds: booth?.session_timeout_seconds ?? null,
        qris_expiry_minutes: booth?.qris_expiry_minutes ?? null,
        frames: booth?.frames ?? null,
      };
      const res = await fetch(
        `${apiBase}/api/v1/admin/photobooth/booths${booth ? `/${booth.id}` : ""}`,
        {
          method: booth ? "PUT" : "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      const out = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(out?.error || "Gagal menyimpan booth");
      showSuccess(booth ? "Booth diperbarui" : `Booth ${body.code} dibuat`);
      onSaved();
    } catch (e) {
      showError(e instanceof Error ? e.message : "Gagal menyimpan booth");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      onClose={onClose}
      title={booth ? `Edit booth ${booth.code}` : "Daftarkan booth"}
    >
      <div className="flex flex-col gap-3">
        {!booth && (
          <Field label="Kode booth" hint="2–8 huruf/angka kapital, mis. JKT01">
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="JKT01"
              maxLength={8}
            />
          </Field>
        )}
        <Field label="Nama">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Grand Indonesia L3"
          />
        </Field>
        <Field label="Lokasi">
          <Input
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="Jakarta Pusat"
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field
            label="Harga (Rp)"
            hint={`Kosongkan = ikut default (${formatRupiah(settings.price_cents)})`}
          >
            <Input
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              inputMode="numeric"
              placeholder={String(settings.price_cents / 100)}
            />
          </Field>
          <Field
            label="Jumlah foto"
            hint={`Kosongkan = ikut default (${settings.shots_count})`}
          >
            <Input
              value={shots}
              onChange={(e) => setShots(e.target.value)}
              inputMode="numeric"
              placeholder={String(settings.shots_count)}
            />
          </Field>
        </div>
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <Button size="md" variant="ghost" onClick={onClose}>
          Batal
        </Button>
        <Button size="md" onClick={submit} disabled={saving || !name.trim()}>
          {saving && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
          Simpan
        </Button>
      </div>
    </Dialog>
  );
}

function SettingsDialog({
  settings,
  onClose,
  onSaved,
}: {
  settings: PhotoBoothConfig;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [price, setPrice] = useState(String(settings.price_cents / 100));
  const [shots, setShots] = useState(String(settings.shots_count));
  const [copies, setCopies] = useState(String(settings.print_copies));
  const [qris, setQris] = useState(String(settings.qris_expiry_minutes));
  const [saving, setSaving] = useState(false);

  async function submit() {
    setSaving(true);
    try {
      const res = await fetch(
        `${apiBase}/api/v1/admin/photobooth/settings`,
        {
          method: "PUT",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            price_cents: Math.round(Number(price) * 100),
            shots_count: Number(shots),
            print_copies: Number(copies),
            session_timeout_seconds: settings.session_timeout_seconds,
            qris_expiry_minutes: Number(qris),
            frames: settings.frames,
          }),
        },
      );
      const out = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(out?.error || "Gagal menyimpan pengaturan");
      showSuccess("Pengaturan disimpan");
      onSaved();
    } catch (e) {
      showError(e instanceof Error ? e.message : "Gagal menyimpan");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog onClose={onClose} title="Pengaturan default PhotoBoost">
      <p className="text-sm leading-relaxed text-neutral-600">
        Berlaku untuk semua booth yang tidak menetapkan nilainya sendiri.
        Sesi yang sedang berjalan tidak terpengaruh — harganya sudah dikunci
        saat sesi dibuat.
      </p>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <Field label="Harga (Rp)">
          <Input
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            inputMode="numeric"
          />
        </Field>
        <Field label="Jumlah foto">
          <Input
            value={shots}
            onChange={(e) => setShots(e.target.value)}
            inputMode="numeric"
          />
        </Field>
        <Field label="Jumlah cetakan">
          <Input
            value={copies}
            onChange={(e) => setCopies(e.target.value)}
            inputMode="numeric"
          />
        </Field>
        <Field label="Masa berlaku QRIS (menit)">
          <Input
            value={qris}
            onChange={(e) => setQris(e.target.value)}
            inputMode="numeric"
          />
        </Field>
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <Button size="md" variant="ghost" onClick={onClose}>
          Batal
        </Button>
        <Button size="md" onClick={submit} disabled={saving}>
          {saving && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
          Simpan
        </Button>
      </div>
    </Dialog>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-neutral-700">{label}</span>
      {children}
      {hint && <span className="text-xs text-neutral-500">{hint}</span>}
    </label>
  );
}

/// Native <dialog>, the primitive this repo already prefers over a dialog
/// library.
function Dialog({
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
      <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-popout">
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
