"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  Lock,
  Save,
  PlugZap,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
  FlaskConical,
  Rocket,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { GatewayInfo } from "@/lib/types";

const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

const methodOptions = [
  { id: "qris", label: "QRIS" },
  { id: "bank_transfer", label: "Virtual Account / Bank Transfer" },
  { id: "gopay", label: "GoPay" },
  { id: "shopeepay", label: "ShopeePay" },
  { id: "credit_card", label: "Kartu Kredit/Debit" },
];

export function PaymentForm({ initial }: { initial: GatewayInfo | null }) {
  const router = useRouter();
  const [isSandbox, setIsSandbox] = useState(initial?.is_sandbox ?? true);
  const [pending, setPending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);
  const [verifyMsg, setVerifyMsg] = useState<string | null>(null);

  // Mode-switch confirmation dialog state.
  const [pendingMode, setPendingMode] = useState<"sandbox" | "production" | null>(null);
  const [confirmInput, setConfirmInput] = useState("");
  const switchDialogRef = useRef<HTMLDialogElement>(null);

  function requestModeSwitch(target: "sandbox" | "production") {
    const targetIsSandbox = target === "sandbox";
    if (targetIsSandbox === isSandbox) return; // already on this mode
    setPendingMode(target);
    setConfirmInput("");
  }

  // Open / close native dialog imperatively when pendingMode changes.
  useEffect(() => {
    const dialog = switchDialogRef.current;
    if (!dialog) return;
    if (pendingMode && !dialog.open) dialog.showModal();
    if (!pendingMode && dialog.open) dialog.close();
  }, [pendingMode]);

  // Sync ESC + backdrop click into pendingMode = null
  useEffect(() => {
    const dialog = switchDialogRef.current;
    if (!dialog) return;
    const onClick = (e: MouseEvent) => {
      if (e.target === dialog) setPendingMode(null);
    };
    const onCancel = () => setPendingMode(null);
    dialog.addEventListener("click", onClick);
    dialog.addEventListener("cancel", onCancel);
    return () => {
      dialog.removeEventListener("click", onClick);
      dialog.removeEventListener("cancel", onCancel);
    };
  }, []);

  const requiredPhrase = pendingMode === "production" ? "PRODUCTION" : "SANDBOX";
  const canConfirmSwitch = confirmInput === requiredPhrase;

  function confirmModeSwitch() {
    if (!pendingMode || !canConfirmSwitch) return;
    setIsSandbox(pendingMode === "sandbox");
    setPendingMode(null);
    setConfirmInput("");
  }

  const isConfigured = initial?.is_configured ?? false;
  const lastStatus = initial?.last_verify_status || "";
  const hasSandboxKey = initial?.has_sandbox_server_key ?? false;
  const hasProdKey = initial?.has_prod_server_key ?? false;

  // Active env's metadata used for several UI bits below.
  const activeMaskedKey = isSandbox
    ? initial?.sandbox_server_key_masked
    : initial?.prod_server_key_masked;
  const activeHasStoredKey = isSandbox ? hasSandboxKey : hasProdKey;
  const activePlaceholder = isSandbox
    ? "SB-Mid-server-..."
    : "Mid-server-...";
  const activeClientPlaceholder = isSandbox
    ? "SB-Mid-client-..."
    : "Mid-client-...";

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    setSavedFlash(false);

    const fd = new FormData(e.currentTarget);
    const enabledMethods = methodOptions
      .filter((m) => fd.get(`method_${m.id}`) === "on")
      .map((m) => m.id);

    const submittedServerKey = String(fd.get("server_key") ?? "").trim();
    const submittedClientKey = String(fd.get("client_key") ?? "").trim();

    // Build payload: only set the env's fields the user is currently editing.
    // Server keys: empty = preserve existing. Client keys: always sent (we
    // overwrite with what's in the field for the active env).
    const body: Record<string, unknown> = {
      is_sandbox: isSandbox,
      enabled_methods: enabledMethods,
      sandbox_server_key: isSandbox ? submittedServerKey : "",
      prod_server_key: !isSandbox ? submittedServerKey : "",
      // Preserve the inactive env's client key by sending its current value.
      sandbox_client_key: isSandbox
        ? submittedClientKey
        : initial?.client_key_sandbox ?? "",
      prod_client_key: !isSandbox
        ? submittedClientKey
        : initial?.client_key_prod ?? "",
    };

    try {
      const res = await fetch(`${apiBase}/api/v1/payments/midtrans`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setSavedFlash(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menyimpan");
    } finally {
      setPending(false);
    }
  }

  async function onVerify() {
    setVerifying(true);
    setVerifyMsg(null);
    try {
      const res = await fetch(`${apiBase}/api/v1/payments/midtrans/verify`, {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setVerifyMsg(data.message || "Koneksi OK");
      router.refresh();
    } catch (err) {
      setVerifyMsg(err instanceof Error ? err.message : "Gagal verify");
    } finally {
      setVerifying(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-semibold text-neutral-900">Midtrans</h2>
              {isConfigured && lastStatus === "ok" && (
                <Badge variant="success">
                  <CheckCircle2 className="size-3" aria-hidden />
                  Terkoneksi
                </Badge>
              )}
              {isConfigured && lastStatus !== "ok" && (
                <Badge variant="warning">
                  <AlertTriangle className="size-3" aria-hidden />
                  Belum diverifikasi
                </Badge>
              )}
              {!isConfigured && <Badge variant="default">Belum dikonfigurasi</Badge>}
            </div>
            <p className="mt-2 text-sm text-neutral-600">
              Pakai akun Midtrans-mu sendiri. Dana hasil penjualan langsung
              masuk ke rekeningmu sesuai jadwal settlement Midtrans —
              kami tidak pernah pegang uang pembeli.
            </p>
          </div>
          <a
            href={
              isSandbox
                ? "https://dashboard.sandbox.midtrans.com/settings/access_keys"
                : "https://dashboard.midtrans.com/settings/access_keys"
            }
            target="_blank"
            rel="noopener noreferrer"
            className="hidden text-sm font-medium text-brand-600 hover:text-brand-700 sm:inline-flex sm:items-center sm:gap-1"
          >
            Dapatkan API Key
            <ExternalLink className="size-3.5" aria-hidden />
          </a>
        </div>
      </Card>

      <form onSubmit={onSubmit} className="flex flex-col gap-5">
        {/* Mode switcher */}
        <Card>
          <h3 className="font-semibold text-neutral-900">Mode</h3>
          <p className="mt-0.5 text-sm text-neutral-500">
            Tiap mode punya pasangan API key sendiri. Pindah mode tidak akan
            menghapus key untuk mode lainnya.
          </p>

          <div
            role="tablist"
            aria-label="Mode pembayaran"
            className="mt-4 grid grid-cols-2 gap-2"
          >
            <ModeOption
              role="tab"
              icon={FlaskConical}
              label="Sandbox"
              description="Uji coba dengan akun sandbox Midtrans"
              active={isSandbox}
              hasKey={hasSandboxKey}
              onClick={() => requestModeSwitch("sandbox")}
            />
            <ModeOption
              role="tab"
              icon={Rocket}
              label="Production"
              description="Pembayaran asli dari pembeli"
              active={!isSandbox}
              hasKey={hasProdKey}
              onClick={() => requestModeSwitch("production")}
            />
          </div>
        </Card>

        {/* API Keys for the currently selected mode */}
        <Card>
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-neutral-900">
                  API Keys —{" "}
                  <span className="text-brand-700">
                    {isSandbox ? "Sandbox" : "Production"}
                  </span>
                </h3>
                <Badge variant={isSandbox ? "warning" : "brand"}>
                  Sedang aktif
                </Badge>
              </div>
              <p className="mt-0.5 text-sm text-neutral-500">
                Server Key disimpan terenkripsi (AES-GCM). Tidak ditampilkan
                ulang setelah disimpan — kamu bisa overwrite kapan saja.
                {!activeHasStoredKey && (
                  <>
                    {" "}
                    Wajib diisi sebelum mode {isSandbox ? "Sandbox" : "Production"} bisa dipakai.
                  </>
                )}
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="server_key">
                Server Key {isSandbox ? "Sandbox" : "Production"}
                {!activeHasStoredKey && <span className="ml-1 text-danger">*</span>}
              </Label>
              <div className="relative">
                <Lock
                  className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-neutral-400"
                  aria-hidden
                />
                <Input
                  id="server_key"
                  name="server_key"
                  type="password"
                  required={!activeHasStoredKey}
                  placeholder={
                    activeHasStoredKey
                      ? activeMaskedKey || "•••••••• tersimpan"
                      : activePlaceholder
                  }
                  className="pl-9 font-mono text-xs"
                />
              </div>
              {activeHasStoredKey && (
                <p className="text-xs text-neutral-500">
                  Sudah tersimpan — kosongkan field ini untuk pakai key yang
                  ada, atau isi nilai baru untuk overwrite.
                </p>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="client_key">
                Client Key {isSandbox ? "Sandbox" : "Production"} (opsional)
              </Label>
              <Input
                id="client_key"
                name="client_key"
                key={isSandbox ? "client-sandbox" : "client-prod"}
                defaultValue={
                  isSandbox
                    ? initial?.client_key_sandbox ?? ""
                    : initial?.client_key_prod ?? ""
                }
                placeholder={activeClientPlaceholder}
                className="font-mono text-xs"
              />
            </div>
          </div>
        </Card>

        <Card>
          <div className="mb-4">
            <h3 className="font-semibold text-neutral-900">Metode Pembayaran</h3>
            <p className="mt-0.5 text-sm text-neutral-500">
              Pilih metode yang ingin diaktifkan untuk pembeli. Pastikan sudah
              di-enable juga di dashboard Midtrans-mu.
            </p>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            {methodOptions.map((m) => (
              <label
                key={m.id}
                className="flex cursor-pointer items-center gap-3 rounded-lg border border-neutral-200 p-3 text-sm transition-colors hover:bg-neutral-50"
              >
                <input
                  type="checkbox"
                  name={`method_${m.id}`}
                  defaultChecked={
                    initial?.enabled_methods?.includes(m.id) ??
                    (m.id === "qris" || m.id === "bank_transfer")
                  }
                  className="size-4 rounded border-neutral-300 text-brand-500 focus:ring-brand-500/30"
                />
                <span className="font-medium text-neutral-900">{m.label}</span>
              </label>
            ))}
          </div>
        </Card>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 text-sm">
            {savedFlash && (
              <span className="font-medium text-success">
                ✓ Konfigurasi tersimpan
              </span>
            )}
            {error && <span className="font-medium text-danger">{error}</span>}
            {verifyMsg && (
              <span className="font-medium text-neutral-700">{verifyMsg}</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {isConfigured && activeHasStoredKey && (
              <Button
                type="button"
                variant="outline"
                size="md"
                onClick={onVerify}
                disabled={verifying}
              >
                <PlugZap className="size-4" aria-hidden />
                {verifying ? "Menguji…" : "Tes Koneksi"}
              </Button>
            )}
            <Button type="submit" size="md" disabled={pending}>
              <Save className="size-4" aria-hidden />
              {pending ? "Menyimpan…" : "Simpan"}
            </Button>
          </div>
        </div>
      </form>

      <Card variant="ghost">
        <div className="flex items-start gap-3 text-sm text-neutral-600">
          <AlertTriangle className="size-4 shrink-0 text-warning" aria-hidden />
          <p>
            <strong>Catatan keamanan:</strong> Server Key Anda disimpan
            terenkripsi di database (AES-GCM, key derivasi dari secret
            aplikasi). Tim SellOn tidak bisa membaca raw key Anda. Tetap
            rotate key secara berkala lewat Midtrans dashboard.
          </p>
        </div>
      </Card>

      {/* Mode-switch confirmation dialog */}
      <dialog
        ref={switchDialogRef}
        aria-labelledby="mode-switch-title"
        aria-describedby="mode-switch-description"
        className="rounded-xl border border-neutral-200 bg-white p-0 shadow-elevated backdrop:bg-neutral-900/40 backdrop:backdrop-blur-sm"
      >
        <div className="w-[min(94vw,460px)] p-6">
          <div
            className={cn(
              "flex size-10 items-center justify-center rounded-lg",
              pendingMode === "production"
                ? "bg-danger/10 text-danger"
                : "bg-warning/15 text-neutral-800",
            )}
          >
            {pendingMode === "production" ? (
              <Rocket className="size-5" aria-hidden />
            ) : (
              <FlaskConical className="size-5" aria-hidden />
            )}
          </div>

          <h2
            id="mode-switch-title"
            className="mt-4 font-display text-lg font-semibold text-neutral-900"
          >
            {pendingMode === "production"
              ? "Pindah ke mode Production?"
              : "Pindah ke mode Sandbox?"}
          </h2>
          <p
            id="mode-switch-description"
            className="mt-2 text-sm leading-relaxed text-neutral-600"
          >
            {pendingMode === "production" ? (
              <>
                Mode <strong>Production</strong> akan memproses pembayaran{" "}
                <strong>asli</strong> dari pembeli. Pastikan kamu sudah:
                <br />
                • setup akun Midtrans production yang aktif,
                <br />
                • verifikasi rekening tujuan settlement,
                <br />
                • tes flow checkout di sandbox terlebih dahulu.
              </>
            ) : (
              <>
                Mode <strong>Sandbox</strong> hanya untuk uji coba — pembayaran
                tidak akan diproses sungguhan. Pembeli yang sedang checkout
                bisa terdampak.
              </>
            )}
          </p>

          <div className="mt-5 rounded-lg border border-neutral-200 bg-neutral-50 p-4">
            <Label htmlFor="mode-confirm-input">
              Ketik <span className="font-mono text-brand-700">{requiredPhrase}</span>{" "}
              untuk konfirmasi
            </Label>
            <Input
              id="mode-confirm-input"
              autoFocus
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="characters"
              spellCheck={false}
              value={confirmInput}
              onChange={(e) => setConfirmInput(e.target.value)}
              placeholder={requiredPhrase}
              className="mt-2 font-mono"
              onKeyDown={(e) => {
                if (e.key === "Enter" && canConfirmSwitch) {
                  e.preventDefault();
                  confirmModeSwitch();
                }
              }}
            />
            <p className="mt-2 text-xs text-neutral-500">
              Case-sensitive. Harus persis &ldquo;{requiredPhrase}&rdquo;.
            </p>
          </div>

          <div className="mt-6 flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              size="md"
              onClick={() => setPendingMode(null)}
            >
              Batal
            </Button>
            <Button
              type="button"
              variant={pendingMode === "production" ? "destructive" : "default"}
              size="md"
              disabled={!canConfirmSwitch}
              onClick={confirmModeSwitch}
            >
              {pendingMode === "production" ? (
                <Rocket className="size-4" aria-hidden />
              ) : (
                <FlaskConical className="size-4" aria-hidden />
              )}
              Pindah ke {pendingMode === "production" ? "Production" : "Sandbox"}
            </Button>
          </div>
        </div>
      </dialog>
    </div>
  );
}

function ModeOption({
  icon: Icon,
  label,
  description,
  active,
  hasKey,
  onClick,
  role,
}: {
  icon: typeof FlaskConical;
  label: string;
  description: string;
  active: boolean;
  hasKey: boolean;
  onClick: () => void;
  role?: string;
}) {
  return (
    <button
      type="button"
      role={role}
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "flex items-start gap-3 rounded-xl border p-4 text-left transition-all",
        active
          ? "border-brand-500 bg-brand-50/50 ring-2 ring-brand-500/20"
          : "border-neutral-200 bg-white hover:bg-neutral-50",
      )}
    >
      <div
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-lg",
          active ? "bg-brand-500 text-white" : "bg-neutral-100 text-neutral-600",
        )}
      >
        <Icon className="size-4" aria-hidden />
      </div>
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <p className="font-semibold text-neutral-900">{label}</p>
          {hasKey ? (
            <Badge variant="success">Tersimpan</Badge>
          ) : (
            <Badge variant="default">Belum diisi</Badge>
          )}
        </div>
        <p className="mt-1 text-xs text-neutral-600">{description}</p>
      </div>
    </button>
  );
}
