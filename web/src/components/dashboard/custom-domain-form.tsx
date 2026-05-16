"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Globe,
  Lock,
  Crown,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Loader2,
  ExternalLink,
  Trash2,
  Copy,
  Check,
  Info,
  X,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { showError, showSuccess } from "@/lib/toast";
import type { Store } from "@/lib/types";

const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

type DomainStatus = "none" | "pending" | "active" | "failed";

type Props = {
  initial: Store;
  isBisnis: boolean;
  cnameTarget: string;
};

export function CustomDomainForm({ initial, isBisnis, cnameTarget }: Props) {
  const { refresh } = useRouter();
  const [domain, setDomain] = useState(initial.custom_domain ?? "");
  const [status, setStatus] = useState<DomainStatus>(
    (initial.domain_status as DomainStatus) ?? "none",
  );
  const [saving, setSaving] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copiedCname, setCopiedCname] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);
  const [showDnsGuide, setShowDnsGuide] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const confirmRef = useRef<HTMLDialogElement>(null);
  const dnsGuideRef = useRef<HTMLDivElement>(null);

  const hasDomain = domain.trim() !== "" && status !== "none";

  // ── Dialog control ───────────────────────────────────────────────────────
  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    if (showGuide && !d.open) d.showModal();
    if (!showGuide && d.open) d.close();
  }, [showGuide]);

  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    const onCancel = (e: Event) => { e.preventDefault(); setShowGuide(false); };
    const onClick = (e: MouseEvent) => { if (e.target === d) setShowGuide(false); };
    d.addEventListener("cancel", onCancel);
    d.addEventListener("click", onClick);
    return () => {
      d.removeEventListener("cancel", onCancel);
      d.removeEventListener("click", onClick);
    };
  }, []);

  useEffect(() => {
    const d = confirmRef.current;
    if (!d) return;
    if (showConfirmDelete && !d.open) d.showModal();
    if (!showConfirmDelete && d.open) d.close();
  }, [showConfirmDelete]);

  useEffect(() => {
    const d = confirmRef.current;
    if (!d) return;
    const onCancel = (e: Event) => { e.preventDefault(); setShowConfirmDelete(false); };
    const onClick = (e: MouseEvent) => { if (e.target === d) setShowConfirmDelete(false); };
    d.addEventListener("cancel", onCancel);
    d.addEventListener("click", onClick);
    return () => {
      d.removeEventListener("cancel", onCancel);
      d.removeEventListener("click", onClick);
    };
  }, []);

  useEffect(() => {
    if (!showDnsGuide) return;
    function onClickOutside(e: MouseEvent) {
      if (dnsGuideRef.current && !dnsGuideRef.current.contains(e.target as Node)) {
        setShowDnsGuide(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [showDnsGuide]);

  // ── Handlers ────────────────────────────────────────────────────────────

  async function handleSave() {
    const trimmed = domain.trim().toLowerCase();
    if (!trimmed) { showError("Masukkan domain terlebih dahulu."); return; }
    setSaving(true);
    try {
      const res = await fetch(`${apiBase}/api/v1/store/custom-domain`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain: trimmed }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setDomain(data.store?.custom_domain ?? trimmed);
      setStatus(data.store?.domain_status ?? "pending");
      showSuccess("Domain disimpan. Sekarang arahkan DNS sesuai petunjuk di bawah.");
      refresh();
    } catch (err) { showError(err); }
    finally { setSaving(false); }
  }

  async function handleVerify() {
    setVerifying(true);
    try {
      const res = await fetch(`${apiBase}/api/v1/store/custom-domain/verify`, {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      const newStatus: DomainStatus = data.domain_status ?? "failed";
      setStatus(newStatus);
      if (newStatus === "active") {
        showSuccess("Domain berhasil diverifikasi dan sekarang aktif!");
      } else {
        showError("DNS belum terdeteksi. Pastikan CNAME sudah diatur dan tunggu propagasi (5–30 menit).");
      }
      refresh();
    } catch (err) { showError(err); }
    finally { setVerifying(false); }
  }

  async function doDelete() {
    setShowConfirmDelete(false);
    const res = await fetch(`${apiBase}/api/v1/store/custom-domain`, {
      method: "DELETE",
      credentials: "include",
    });
    if (!res.ok) { showError("Gagal menghapus domain."); return; }
    setDomain("");
    setStatus("none");
    showSuccess("Custom domain dihapus.");
    refresh();
  }

  function handleDelete() {
    if (status === "active") {
      setShowConfirmDelete(true);
    } else {
      doDelete();
    }
  }

  function copyCname() {
    navigator.clipboard.writeText(cnameTarget).catch(() => {});
    setCopiedCname(true);
    setTimeout(() => setCopiedCname(false), 2000);
  }

  function copyDomain() {
    navigator.clipboard.writeText(domain).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  // ── Plan gate ────────────────────────────────────────────────────────────

  if (!isBisnis) {
    return (
      <div className="space-y-6">
        <Card className="border-warning/40 bg-warning/5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-warning/15">
              <Lock className="size-5 text-warning" aria-hidden />
            </div>
            <div className="flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-display text-base font-semibold text-neutral-900">
                  Custom Domain
                </h2>
                <Badge variant="warning">
                  <Crown className="size-3" aria-hidden />
                  Bisnis
                </Badge>
              </div>
              <p className="mt-1.5 text-sm leading-relaxed text-neutral-600">
                Tampilkan storefrontmu di domain sendiri, misalnya{" "}
                <code className="rounded bg-neutral-100 px-1 py-0.5 text-xs font-medium">
                  toko.brandkamu.com
                </code>
                , dan tingkatkan kepercayaan pelanggan.
              </p>
              <ul className="mt-3 space-y-1">
                {[
                  "Gunakan domain atau subdomain milik sendiri",
                  "HTTPS otomatis setelah domain aktif",
                  "Storefront tampil di domain kustom, bukan sellon.id",
                ].map((f) => (
                  <li key={f} className="flex items-center gap-2 text-sm text-neutral-600">
                    <CheckCircle2 className="size-4 shrink-0 text-warning" aria-hidden />
                    {f}
                  </li>
                ))}
              </ul>
            </div>
            <Link href="/settings/subscription" className="shrink-0">
              <Button size="sm" className="gap-1.5">
                <Crown className="size-3.5" aria-hidden />
                Upgrade ke Bisnis
              </Button>
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  // ── Bisnis UI ────────────────────────────────────────────────────────────

  return (
    <>
      <div className="space-y-6">
        {/* Domain Input Card — only shown when no domain configured yet */}
        {status === "none" && <Card>
          {/* Header */}
          <div className="mb-5 flex items-center gap-2.5">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-50">
              <Globe className="size-5 text-brand-700" aria-hidden />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="font-display text-base font-semibold text-neutral-900">
                Custom Domain
              </h2>
              <p className="text-xs text-neutral-500">
                Subdomain yang kamu kontrol, mis.{" "}
                <code className="font-mono">toko.brandkamu.com</code>
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {status !== "none" && <DomainStatusBadge status={status} />}
              {/* Info button — opens Cara Kerja guide */}
              <button
                type="button"
                onClick={() => setShowGuide(true)}
                aria-label="Cara kerja custom domain"
                className="inline-flex size-8 items-center justify-center rounded-md text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700"
              >
                <Info className="size-4" aria-hidden />
              </button>
            </div>
          </div>

          {/* Input */}
          <div className="space-y-3">
            <Label htmlFor="domain-input">Domain atau Subdomain</Label>
            <div className="flex gap-2">
              <Input
                id="domain-input"
                type="text"
                value={domain}
                onChange={(e) => setDomain(e.target.value.toLowerCase())}
                placeholder="toko.brandkamu.com"
                className="font-mono"
                onKeyDown={(e) => { if (e.key === "Enter") handleSave(); }}
              />
              <Button onClick={handleSave} disabled={saving || !domain.trim()}>
                {saving && <Loader2 className="size-4 animate-spin" aria-hidden />}
                {saving ? "Menyimpan…" : "Simpan"}
              </Button>
            </div>
            <p className="text-xs text-neutral-400">
              Masukkan hanya nama domain, tanpa{" "}
              <code className="font-mono">https://</code> atau path.
            </p>
          </div>
        </Card>}

        {/* DNS Instructions */}
        {hasDomain && status !== "active" && (
          <Card className="border-brand-200 bg-brand-50/30">
            <div className="mb-1 flex items-center gap-2">
              <h3 className="font-semibold text-neutral-900">Konfigurasi DNS</h3>
              {/* Info button + popover guide */}
              <div className="relative" ref={dnsGuideRef}>
                <button
                  type="button"
                  onClick={() => setShowDnsGuide((v) => !v)}
                  aria-label="Panduan konfigurasi CNAME"
                  className="inline-flex size-7 items-center justify-center rounded-md text-neutral-400 transition-colors hover:bg-white/70 hover:text-neutral-700"
                >
                  <Info className="size-4" aria-hidden />
                </button>
                {showDnsGuide && (
                  <div className="absolute left-0 top-full z-50 mt-1.5 w-80 rounded-xl border border-neutral-200 bg-white p-4 shadow-elevated">
                    <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-neutral-500">
                      Cara menambahkan CNAME record
                    </p>
                    <ol className="space-y-2">
                      {[
                        "Login ke panel kontrol domain provider kamu.",
                        'Cari menu "DNS Management", "DNS Records", atau "Zone Editor".',
                        <>
                          Tambah record baru: Type=<strong>CNAME</strong>, Name=
                          <code className="rounded bg-neutral-100 px-1 font-mono text-xs">subdomain</code>
                          , Value=<code className="rounded bg-neutral-100 px-1 font-mono text-xs">{cnameTarget}</code>.
                        </>,
                        "Simpan dan tunggu propagasi 5–30 menit.",
                      ].map((step, i) => (
                        <li key={i} className="flex gap-2.5 text-xs text-neutral-600">
                          <span className="mt-px flex size-4 shrink-0 items-center justify-center rounded-full bg-brand-100 text-[10px] font-bold text-brand-700">
                            {i + 1}
                          </span>
                          <span>{step}</span>
                        </li>
                      ))}
                    </ol>
                    <div className="mt-4 border-t border-neutral-100 pt-3">
                      <p className="mb-2 text-xs font-medium text-neutral-600">Dokumentasi per provider:</p>
                      <div className="flex flex-wrap gap-1.5">
                        {[
                          { label: "Cloudflare", href: "https://developers.cloudflare.com/dns/manage-dns-records/how-to/create-dns-records/" },
                          { label: "Niagahoster", href: "https://www.niagahoster.co.id/kb/" },
                          { label: "Dewaweb", href: "https://www.dewaweb.com/kb/" },
                          { label: "Namecheap", href: "https://www.namecheap.com/support/knowledgebase/subcategory/2237/dns/" },
                        ].map(({ label, href }) => (
                          <a
                            key={label}
                            href={href}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 rounded-md border border-neutral-200 bg-neutral-50 px-2 py-1 text-xs font-medium text-neutral-700 transition-colors hover:border-brand-200 hover:bg-brand-50 hover:text-brand-700"
                          >
                            {label}
                            <ExternalLink className="size-2.5" aria-hidden />
                          </a>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
            <p className="text-sm text-neutral-600">
              Login ke panel DNS domain provider kamu (Niagahoster, Cloudflare, Dewaweb, dll)
              dan tambahkan record berikut:
            </p>

            <div className="mt-4 overflow-x-auto rounded-lg border border-neutral-200 bg-white">
              <table className="w-full text-sm">
                <thead className="border-b border-neutral-200 bg-neutral-50">
                  <tr>
                    {["Type", "Name", "Value", "TTL"].map((h) => (
                      <th
                        key={h}
                        className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-neutral-500"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="px-4 py-3 font-mono font-bold text-brand-700">CNAME</td>
                    <td className="px-4 py-3 font-mono text-neutral-700">
                      {getSubdomain(domain)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <code className="font-mono text-neutral-800">{cnameTarget}</code>
                        <button
                          type="button"
                          onClick={copyCname}
                          aria-label="Salin CNAME"
                          className="rounded p-0.5 text-neutral-400 transition-colors hover:text-brand-600"
                        >
                          {copiedCname ? (
                            <Check className="size-3.5 text-success" aria-hidden />
                          ) : (
                            <Copy className="size-3.5" aria-hidden />
                          )}
                        </button>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-neutral-500">Auto</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <p className="mt-3 text-xs text-neutral-500">
              Propagasi DNS bisa memakan <strong>5–30 menit</strong> (kadang hingga 24 jam
              untuk beberapa provider). Setelah selesai, klik Verifikasi di bawah.
            </p>

            {status === "failed" && (
              <div className="mt-3 flex items-start gap-2 rounded-lg border border-danger/30 bg-danger/5 px-4 py-3 text-sm">
                <AlertCircle className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden />
                <p className="text-neutral-700">
                  <strong className="text-danger">DNS belum terdeteksi.</strong> Pastikan record
                  CNAME sudah disimpan di panel DNS kamu dan tunggu propagasi sebelum mencoba lagi.
                </p>
              </div>
            )}

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Button onClick={handleVerify} disabled={verifying}>
                {verifying ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                ) : (
                  <RefreshCw className="size-4" aria-hidden />
                )}
                {verifying ? "Memverifikasi…" : "Verifikasi DNS"}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleDelete}
                className="text-neutral-500 hover:text-danger"
              >
                <Trash2 className="size-4" aria-hidden />
                Hapus Domain
              </Button>
            </div>
          </Card>
        )}

        {/* Active Domain Card */}
        {status === "active" && domain && (
          <Card className="border-success/30 bg-success/5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" aria-hidden />
                <div>
                  <p className="font-semibold text-neutral-900">Domain aktif</p>
                  <div className="mt-0.5 flex items-center gap-1.5">
                    <a
                      href={`https://${domain}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 font-mono text-sm text-brand-700 hover:underline"
                    >
                      {domain}
                      <ExternalLink className="size-3.5" aria-hidden />
                    </a>
                    <button
                      type="button"
                      onClick={copyDomain}
                      aria-label="Salin domain"
                      className="rounded p-0.5 text-neutral-400 transition-colors hover:text-brand-600"
                    >
                      {copied ? (
                        <Check className="size-3.5 text-success" aria-hidden />
                      ) : (
                        <Copy className="size-3.5" aria-hidden />
                      )}
                    </button>
                  </div>
                  <p className="mt-1 text-xs text-neutral-500">
                    Storefrontmu dapat diakses di domain ini. SSL ditangani otomatis.
                  </p>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleDelete}
                className="shrink-0 border-danger/30 text-danger hover:bg-danger/5"
              >
                <Trash2 className="size-4" aria-hidden />
                Hapus Domain
              </Button>
            </div>
          </Card>
        )}
      </div>

      {/* ── Confirm Delete Dialog ─────────────────────────────────────────── */}
      <dialog
        ref={confirmRef}
        aria-labelledby="confirm-delete-title"
        className="fixed left-1/2 top-1/2 m-0 w-[min(400px,95vw)] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-xl border border-neutral-200 bg-white p-0 shadow-popout backdrop:bg-neutral-900/50 backdrop:backdrop-blur-sm"
      >
        <div className="px-6 py-5">
          <h2
            id="confirm-delete-title"
            className="font-display text-base font-semibold text-neutral-900"
          >
            Hapus Custom Domain?
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-neutral-600">
            Domain{" "}
            <code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-xs font-medium text-neutral-800">
              {domain}
            </code>{" "}
            akan dilepas dari tokomu. Storefront tidak akan bisa diakses melalui domain ini.
            Kamu bisa menambahkan domain baru kapan saja.
          </p>
        </div>
        <div className="flex justify-end gap-2 border-t border-neutral-100 px-6 py-3">
          <Button size="sm" variant="ghost" onClick={() => setShowConfirmDelete(false)}>
            Batal
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={doDelete}
            className="border-danger/30 text-danger hover:bg-danger/5"
          >
            <Trash2 className="size-4" aria-hidden />
            Hapus Domain
          </Button>
        </div>
      </dialog>

      {/* ── Cara Kerja Dialog ──────────────────────────────────────────────── */}
      <dialog
        ref={dialogRef}
        aria-labelledby="guide-dialog-title"
        className="fixed left-1/2 top-1/2 m-0 w-[min(480px,95vw)] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-xl border border-neutral-200 bg-white p-0 shadow-popout backdrop:bg-neutral-900/50 backdrop:backdrop-blur-sm"
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-3 border-b border-neutral-200 px-6 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex size-8 items-center justify-center rounded-lg bg-brand-50">
              <Globe className="size-4 text-brand-700" aria-hidden />
            </div>
            <h2
              id="guide-dialog-title"
              className="font-display text-base font-semibold text-neutral-900"
            >
              Cara Kerja Custom Domain
            </h2>
          </div>
          <button
            type="button"
            onClick={() => setShowGuide(false)}
            aria-label="Tutup"
            className="inline-flex size-8 items-center justify-center rounded-md text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5">
          <ol className="space-y-5">
            {[
              {
                step: 1,
                title: "Masukkan domain",
                desc: "Ketik subdomain yang ingin kamu gunakan, misalnya toko.brandkamu.com, lalu klik Simpan.",
              },
              {
                step: 2,
                title: "Atur CNAME di provider",
                desc: (
                  <>
                    Di panel DNS provider domain kamu (Cloudflare, Niagahoster, dll),
                    tambahkan record CNAME yang mengarah ke{" "}
                    <code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-xs font-medium text-neutral-800">
                      {cnameTarget}
                    </code>
                    . Propagasi bisa memakan 5–30 menit.
                  </>
                ),
              },
              {
                step: 3,
                title: "Verifikasi",
                desc: "Klik tombol Verifikasi DNS setelah record sudah disimpan. Jika berhasil, storefrontmu langsung bisa diakses di domain tersebut.",
              },
            ].map(({ step, title, desc }) => (
              <li key={step} className="flex items-start gap-4">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-brand-100 text-sm font-bold text-brand-700">
                  {step}
                </span>
                <div>
                  <p className="font-semibold text-neutral-900">{title}</p>
                  <p className="mt-0.5 text-sm leading-relaxed text-neutral-500">{desc}</p>
                </div>
              </li>
            ))}
          </ol>

          {/* Note */}
          <div className="mt-5 rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-3 text-xs text-neutral-500">
            <strong className="text-neutral-700">Catatan SSL:</strong> HTTPS ditangani otomatis
            oleh platform setelah domain aktif. Tidak perlu install sertifikat manual.
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end border-t border-neutral-100 px-6 py-3">
          <Button size="sm" variant="ghost" onClick={() => setShowGuide(false)}>
            Tutup
          </Button>
        </div>
      </dialog>
    </>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function DomainStatusBadge({ status }: { status: DomainStatus }) {
  const map: Record<
    DomainStatus,
    { variant: "default" | "warning" | "success" | "danger"; label: string }
  > = {
    none:    { variant: "default", label: "Belum dikonfigurasi" },
    pending: { variant: "warning", label: "Menunggu verifikasi" },
    active:  { variant: "success", label: "Aktif" },
    failed:  { variant: "danger",  label: "Verifikasi gagal" },
  };
  const { variant, label } = map[status];
  return <Badge variant={variant}>{label}</Badge>;
}

function getSubdomain(domain: string): string {
  const parts = domain.split(".");
  if (parts.length >= 3) return parts.slice(0, parts.length - 2).join(".");
  return "@";
}
