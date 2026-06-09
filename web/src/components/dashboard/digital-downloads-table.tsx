"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight, Loader2, ShieldAlert, ShieldOff, ShieldCheck, AlertTriangle } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { showError, showSuccess } from "@/lib/toast";
import { formatDateTimeID } from "@/lib/format";
import { shortUA } from "@/lib/user-agent";
import type { DigitalDownloadLink, DownloadAccessLog } from "@/lib/types";

const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

export function DigitalDownloadsTable({ links }: { links: DigitalDownloadLink[] }) {
  // Local copy so revoke toggles reflect immediately.
  const [rows, setRows] = useState<DigitalDownloadLink[]>(links);

  const setRevoked = (tokenId: string, revoked: boolean) =>
    setRows((prev) => prev.map((r) => (r.token_id === tokenId ? { ...r, revoked } : r)));

  return (
    <Card className="overflow-hidden p-0">
      <div className="divide-y divide-neutral-100">
        {rows.map((link) => (
          <DownloadRow key={link.token_id} link={link} onRevokedChange={setRevoked} />
        ))}
      </div>
    </Card>
  );
}

function DownloadRow({
  link,
  onRevokedChange,
}: {
  link: DigitalDownloadLink;
  onRevokedChange: (tokenId: string, revoked: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const [logs, setLogs] = useState<DownloadAccessLog[] | null>(null);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [busy, setBusy] = useState(false);

  const shared = link.distinct_ips > 1; // opened from >1 IP → possible sharing
  const downloaded = link.download_count > 0;

  const toggle = async () => {
    const next = !open;
    setOpen(next);
    if (next && logs === null) {
      setLoadingLogs(true);
      try {
        const res = await fetch(`${apiBase}/api/v1/digital-downloads/${link.token_id}/logs`, {
          credentials: "include",
        });
        const data = await res.json().catch(() => ({}));
        setLogs(res.ok ? (data.logs ?? []) : []);
      } catch {
        setLogs([]);
      } finally {
        setLoadingLogs(false);
      }
    }
  };

  const revoke = async (revoke: boolean) => {
    setBusy(true);
    try {
      const res = await fetch(
        `${apiBase}/api/v1/digital-downloads/${link.token_id}/${revoke ? "revoke" : "unrevoke"}`,
        { method: "POST", credentials: "include" },
      );
      if (!res.ok) {
        showError("Gagal memperbarui status link");
        return;
      }
      onRevokedChange(link.token_id, revoke);
      showSuccess(
        revoke
          ? "Link diblokir. Halaman unduhan ditolak untuk link ini."
          : "Link diaktifkan kembali",
      );
    } catch {
      showError("Gagal memperbarui status link");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={link.revoked ? "bg-neutral-50/60" : ""}>
      <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-start gap-2 text-left"
        >
          <span className="mt-0.5 shrink-0 text-neutral-400">
            {open ? <ChevronDown className="size-4" aria-hidden /> : <ChevronRight className="size-4" aria-hidden />}
          </span>
          <span className="min-w-0">
            <span className="block truncate font-medium text-neutral-900">
              {link.product_type === "course" && (
                <Badge variant="brand" className="mr-1.5 align-middle">Kursus</Badge>
              )}
              {link.product_name}
              {link.variant_name ? <span className="text-neutral-500"> · {link.variant_name}</span> : null}
            </span>
            <span className="mt-0.5 block truncate text-xs text-neutral-500">
              {link.customer_name || "Pelanggan"} · #{link.order_number}
            </span>
          </span>
        </button>

        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          {!downloaded ? (
            <Badge variant="outline">Belum diunduh</Badge>
          ) : (
            <span className="text-xs text-neutral-600">
              <strong className="tabular-nums">{link.download_count}×</strong> unduh ·{" "}
              <span className="tabular-nums">{link.distinct_ips}</span> IP
            </span>
          )}
          {shared && (
            <Badge variant="warning" className="gap-1">
              <AlertTriangle className="size-3" aria-hidden />
              Terindikasi dibagikan
            </Badge>
          )}
          {link.revoked ? (
            <Badge variant="danger" className="gap-1">
              <ShieldOff className="size-3" aria-hidden />
              Diblokir
            </Badge>
          ) : null}
          {link.revoked ? (
            <Button size="sm" variant="ghost" onClick={() => revoke(false)} disabled={busy}>
              {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <ShieldCheck className="size-4" aria-hidden />}
              Aktifkan
            </Button>
          ) : (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => revoke(true)}
              disabled={busy}
              className="text-danger hover:bg-danger/10"
            >
              {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <ShieldAlert className="size-4" aria-hidden />}
              Blokir link
            </Button>
          )}
        </div>
      </div>

      {open && (
        <div className="border-t border-neutral-100 bg-neutral-50/60 px-4 py-3">
          {link.revoked && (
            <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
              Memblokir hanya menonaktifkan halaman unduhan SellOn. Jika file sempat
              dibagikan, ganti/upload ulang file produk agar link lama benar-benar
              tidak bisa dipakai.
            </p>
          )}
          {loadingLogs ? (
            <p className="flex items-center gap-2 text-sm text-neutral-500">
              <Loader2 className="size-4 animate-spin" aria-hidden /> Memuat riwayat…
            </p>
          ) : !logs || logs.length === 0 ? (
            <p className="text-sm text-neutral-500">Belum ada akses yang tercatat.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {logs.map((l, i) => (
                <li key={i} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs">
                  <span className="font-medium text-neutral-700">{formatDateTimeID(l.downloaded_at)}</span>
                  <span className="font-mono text-neutral-600">{l.ip_address || "—"}</span>
                  <span className="text-neutral-500">{shortUA(l.user_agent)}</span>
                  {l.blocked && (
                    <span className="rounded bg-danger/10 px-1.5 py-0.5 font-medium text-danger">
                      ditolak (link diblokir)
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
          <div className="mt-3">
            <Link
              href={`/orders/${link.order_id}`}
              className="text-xs font-medium text-brand-600 hover:text-brand-700"
            >
              Lihat pesanan #{link.order_number} →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
