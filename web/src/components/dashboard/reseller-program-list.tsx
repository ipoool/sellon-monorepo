"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Copy, Check, Share2, Users, Package, RefreshCw, ChevronDown, ChevronRight, Pause, Play } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { showSuccess, showError } from "@/lib/toast";
import type { ResellerProgram } from "@/lib/types";

const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

function ShareDialog({
  code,
  open,
  onClose,
}: {
  code: string;
  open: boolean;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  if (!open) return null;

  const inviteLink = `${window.location.origin}/login?invite=${code}`;
  const message = [
    `Halo! Kamu diundang jadi *Reseller* di toko kami 🎉`,
    ``,
    `Cara daftar (mudah banget):`,
    `1️⃣ Buka link ini: ${inviteLink}`,
    `2️⃣ Login pakai akun Google`,
    `3️⃣ Kamu otomatis terdaftar sebagai reseller kami!`,
    ``,
    `Setelah itu kamu bisa langsung pilih produk kami dan jual di toko kamu sendiri — tanpa perlu stok.`,
    ``,
    `Ada pertanyaan? Balas pesan ini ya 😊`,
  ].join("\n");

  const handleCopyMessage = () => {
    navigator.clipboard.writeText(message).then(() => {
      setCopied(true);
      showSuccess("Pesan disalin — tinggal paste di WhatsApp");
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-popout">
        <h2 className="font-display text-lg font-semibold text-neutral-900">
          Undang Reseller via WhatsApp
        </h2>
        <p className="mt-1 text-sm text-neutral-500">
          Salin pesan di bawah, lalu paste di WhatsApp untuk calon reseller kamu.
        </p>

        <div className="mt-4 rounded-lg border border-neutral-200 bg-neutral-50 p-4">
          <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-neutral-700">
            {message}
          </pre>
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Tutup
          </Button>
          <Button type="button" onClick={handleCopyMessage}>
            {copied ? (
              <>
                <Check className="size-4" aria-hidden />
                Tersalin
              </>
            ) : (
              <>
                <Copy className="size-4" aria-hidden />
                Salin Pesan
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

function InviteCodeBox({ program }: { program: ResellerProgram }) {
  const [copied, setCopied] = useState(false);
  const [code, setCode] = useState(program.invite_code);
  const [regenerating, setRegenerating] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [showShare, setShowShare] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleRegenerate = async () => {
    setRegenerating(true);
    try {
      const res = await fetch(`${apiBase}/api/v1/reseller/programs/${program.id}/regenerate-code`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setCode(data.invite_code);
      showSuccess("Kode undangan berhasil diperbarui");
    } catch {
      showError("Gagal memperbarui kode");
    } finally {
      setRegenerating(false);
      setShowConfirm(false);
    }
  };

  return (
    <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-4">
      <p className="mb-2 text-xs font-medium uppercase tracking-wider text-neutral-500">Kode Undangan</p>
      <div className="flex items-center gap-2">
        <span className="flex-1 rounded-md border border-neutral-200 bg-white px-4 py-2 font-mono text-2xl font-bold tracking-widest text-neutral-900">
          {code}
        </span>
        <button
          onClick={handleCopy}
          className="flex size-10 items-center justify-center rounded-md border border-neutral-200 bg-white text-neutral-600 transition-colors hover:bg-neutral-50"
          title="Salin kode"
        >
          {copied ? <Check className="size-4 text-brand-600" /> : <Copy className="size-4" />}
        </button>
        <button
          onClick={() => setShowShare(true)}
          className="flex size-10 items-center justify-center rounded-md border border-neutral-200 bg-white text-neutral-600 transition-colors hover:bg-neutral-50"
          title="Share via WhatsApp"
        >
          <Share2 className="size-4" />
        </button>
      </div>
      <button
        onClick={() => setShowConfirm(true)}
        disabled={regenerating}
        className="mt-2 flex items-center gap-1.5 text-xs text-neutral-400 hover:text-neutral-600 transition-colors disabled:opacity-50"
      >
        <RefreshCw className={`size-3 ${regenerating ? "animate-spin" : ""}`} aria-hidden />
        Ganti kode
      </button>

      <ConfirmDialog
        open={showConfirm}
        onClose={() => setShowConfirm(false)}
        onConfirm={handleRegenerate}
        title="Ganti Kode Undangan?"
        description="Kode lama akan langsung tidak bisa dipakai. Reseller yang sudah bergabung tidak terpengaruh — hanya reseller baru yang perlu kode baru."
        confirmLabel="Ganti Kode"
        requireTypedPhrase="GANTI KODE"
      />

      <ShareDialog code={code} open={showShare} onClose={() => setShowShare(false)} />
    </div>
  );
}

function ToggleActiveButton({ program }: { program: ResellerProgram }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const handleToggle = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${apiBase}/api/v1/reseller/programs/${program.id}`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: program.name,
          description: program.description,
          is_active: !program.is_active,
        }),
      });
      if (!res.ok) throw new Error();
      showSuccess(program.is_active ? "Program dinonaktifkan" : "Program diaktifkan kembali");
      router.refresh();
    } catch {
      showError("Gagal mengubah status program");
    } finally {
      setLoading(false);
      setShowConfirm(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => (program.is_active ? setShowConfirm(true) : handleToggle())}
        disabled={loading}
        className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors disabled:opacity-50 ${
          program.is_active
            ? "border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50"
            : "border-brand-200 bg-brand-50 text-brand-700 hover:bg-brand-100"
        }`}
      >
        {program.is_active ? (
          <>
            <Pause className="size-3.5" aria-hidden />
            Nonaktifkan
          </>
        ) : (
          <>
            <Play className="size-3.5" aria-hidden />
            Aktifkan
          </>
        )}
      </button>

      <ConfirmDialog
        open={showConfirm}
        onClose={() => setShowConfirm(false)}
        onConfirm={handleToggle}
        title="Nonaktifkan Program?"
        description="Reseller yang sudah bergabung tidak bisa lagi menjual produk dari program ini. Reseller baru juga tidak bisa join pakai kode lama. Kamu bisa aktifkan kembali kapan saja."
        confirmLabel="Nonaktifkan"
      />
    </>
  );
}

export function ResellerProgramList({ programs }: { programs: ResellerProgram[] }) {
  const [expanded, setExpanded] = useState<string | null>(programs[0]?.id ?? null);

  return (
    <div className="flex flex-col gap-4">
      {programs.map((prog) => (
        <div key={prog.id} className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-card">
          {/* Header */}
          <button
            type="button"
            onClick={() => setExpanded(expanded === prog.id ? null : prog.id)}
            className="flex w-full items-center gap-4 p-5 text-left transition-colors hover:bg-neutral-50"
          >
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-semibold text-neutral-900">{prog.name}</h3>
                <Badge variant={prog.is_active ? "success" : "outline"}>
                  {prog.is_active ? "Aktif" : "Nonaktif"}
                </Badge>
              </div>
              {prog.description && (
                <p className="mt-0.5 text-sm text-neutral-500 line-clamp-1">{prog.description}</p>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-4 text-sm text-neutral-500">
              <span className="flex items-center gap-1">
                <Users className="size-3.5" aria-hidden /> {prog.member_count}
              </span>
              <span className="flex items-center gap-1">
                <Package className="size-3.5" aria-hidden /> {prog.product_count}
              </span>
              {expanded === prog.id
                ? <ChevronDown className="size-4 text-neutral-400" />
                : <ChevronRight className="size-4 text-neutral-400" />}
            </div>
          </button>

          {/* Detail panel */}
          {expanded === prog.id && (
            <div className="border-t border-neutral-100 p-5 pt-4">
              <InviteCodeBox program={prog} />

              <div className="mt-4 flex flex-wrap gap-2">
                <Link
                  href={`/reseller/program/${prog.id}/products`}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50"
                >
                  <Package className="size-3.5" aria-hidden />
                  Kelola Produk
                </Link>
                <Link
                  href={`/reseller/program/${prog.id}/members`}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50"
                >
                  <Users className="size-3.5" aria-hidden />
                  Lihat Reseller ({prog.member_count})
                </Link>
                <div className="ml-auto">
                  <ToggleActiveButton program={prog} />
                </div>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
