"use client";

import { useState, useTransition, type FormEvent } from "react";
import { showError, showSuccess } from "@/lib/toast";
import { useRouter } from "next/navigation";
import {
  Search,
  CheckCircle2,
  XCircle,
  Crown,
  Clock,
  Loader2,
  Receipt,
} from "lucide-react";

import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  TABLE_PAGE_SIZE,
  TablePagination,
} from "@/components/dashboard/table-pagination";
import { formatRupiah } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { AdminSubscriptionInvoice } from "@/lib/types";

const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

type Status = AdminSubscriptionInvoice["status"];

const statusBadge: Record<
  Status,
  { variant: "warning" | "success" | "default"; label: string }
> = {
  pending: { variant: "warning", label: "Menunggu Aktivasi" },
  paid: { variant: "success", label: "Aktif" },
  failed: { variant: "default", label: "Ditolak" },
};

const planLabel: Record<string, string> = {
  pro: "Pro",
  bisnis: "Bisnis",
  free: "Gratis",
};

const providerLabel: Record<string, string> = {
  manual_transfer: "Transfer Bank",
  midtrans: "Midtrans",
  "": "—",
};

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

type Props = {
  initial: AdminSubscriptionInvoice[];
  total: number;
  page: number;
  initialQuery: string;
  initialStatus: string;
};

type DialogState =
  | { kind: "activate"; row: AdminSubscriptionInvoice }
  | { kind: "reject"; row: AdminSubscriptionInvoice }
  | null;

export function AdminSubscriptionsTable({
  initial,
  total,
  page,
  initialQuery,
  initialStatus,
}: Props) {
  const { push, refresh } = useRouter();
  const [rows, setRows] = useState(initial);
  const [query, setQuery] = useState(initialQuery);
  const [status, setStatus] = useState(initialStatus);
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<DialogState>(null);

  function applyFilters(e?: FormEvent<HTMLFormElement>) {
    e?.preventDefault();
    const params = new URLSearchParams();
    if (query.trim()) params.set("q", query.trim());
    if (status) params.set("status", status);
    const qs = params.toString();
    startTransition(() =>
      push(
        `/platform/subscriptions${qs ? `?${qs}` : ""}`,
      ),
    );
  }

  async function activate(row: AdminSubscriptionInvoice) {
    setBusyId(row.id);
    try {
      const res = await fetch(
        `${apiBase}/api/v1/admin/subscriptions/invoices/${row.id}/activate`,
        { method: "POST", credentials: "include" },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setRows((prev) =>
        prev.map((r) =>
          r.id === row.id
            ? { ...r, status: "paid", paid_at: new Date().toISOString() }
            : r,
        ),
      );
      setDialog(null);
      refresh();
    } catch (err) {
      showError(err);
    } finally {
      setBusyId(null);
    }
  }

  async function reject(row: AdminSubscriptionInvoice) {
    setBusyId(row.id);
    try {
      const res = await fetch(
        `${apiBase}/api/v1/admin/subscriptions/invoices/${row.id}/reject`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ notes: "" }),
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setRows((prev) =>
        prev.map((r) => (r.id === row.id ? { ...r, status: "failed" } : r)),
      );
      setDialog(null);
      refresh();
    } catch (err) {
      showError(err);
    } finally {
      setBusyId(null);
    }
  }

  function closeDialog() {
    if (busyId) return;
    setDialog(null);
  }

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-end">
        <form
          onSubmit={applyFilters}
          className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-end"
        >
          <div className="relative flex-1">
            <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-neutral-400">
              <Search className="size-4" />
            </span>
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Cari toko, slug, atau email pemilik…"
              className="pl-9"
            />
          </div>
          <div className="sm:w-44">
            <Select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              aria-label="Filter status"
            >
              <option value="">Semua status</option>
              <option value="pending">Menunggu Aktivasi</option>
              <option value="paid">Aktif</option>
              <option value="failed">Ditolak</option>
            </Select>
          </div>
          <Button type="submit" size="md" variant="outline" disabled={pending}>
            {pending && (
              <Loader2 className="size-3.5 animate-spin" aria-hidden />
            )}
            Filter
          </Button>
        </form>
      </Card>

      
      {rows.length === 0 ? (
        <Card className="py-16 text-center">
          <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-neutral-100 text-neutral-500">
            <Receipt className="size-7" aria-hidden />
          </div>
          <h2 className="mt-4 font-display text-xl font-semibold text-neutral-900">
            Belum ada transaksi
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-neutral-600">
            Transaksi langganan akan muncul di sini saat seller request
            upgrade lewat dashboard mereka. Coba ubah filter atau kata kunci.
          </p>
        </Card>
      ) : (
        <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-card">
          <table className="w-full text-left text-sm">
            <thead className="bg-neutral-50 text-xs font-semibold uppercase tracking-wider text-neutral-500">
              <tr>
                <th className="px-5 py-3">Pemilik & Toko</th>
                <th className="px-5 py-3">Paket</th>
                <th className="px-5 py-3">Nominal</th>
                <th className="px-5 py-3">Metode</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">Diminta</th>
                <th className="px-5 py-3 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200">
              {rows.map((r) => {
                const sb = statusBadge[r.status];
                const busy = busyId === r.id;
                return (
                  <tr key={r.id} className={cn("hover:bg-neutral-50")}>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar
                          src={r.owner_picture || null}
                          name={r.owner_name || r.owner_email || r.store_name}
                          size="sm"
                        />
                        <div className="min-w-0">
                          <p className="truncate font-medium text-neutral-900">
                            {r.owner_name || "(belum isi nama)"}
                          </p>
                          <p className="truncate text-xs text-neutral-500">
                            {r.owner_email || "—"}
                          </p>
                          <p className="mt-0.5 truncate text-xs text-neutral-600">
                            <Crown
                              className="mr-1 inline size-3 text-warning"
                              aria-hidden
                            />
                            {r.store_name}{" "}
                            <span className="text-neutral-400">
                              /{r.store_slug}
                            </span>
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <Badge variant="brand">
                        {planLabel[r.plan] ?? r.plan}
                      </Badge>
                      <p className="mt-1 text-xs text-neutral-600">
                        {r.months} bulan
                      </p>
                    </td>
                    <td className="px-5 py-3 font-medium text-neutral-900">
                      {formatRupiah(r.amount_cents)}
                    </td>
                    <td className="px-5 py-3 text-neutral-700">
                      {providerLabel[r.provider] ?? (r.provider || "—")}
                    </td>
                    <td className="px-5 py-3">
                      <Badge variant={sb.variant}>{sb.label}</Badge>
                      {r.paid_at && (
                        <p className="mt-1 text-xs text-neutral-500">
                          {formatDateTime(r.paid_at)}
                        </p>
                      )}
                    </td>
                    <td className="px-5 py-3 text-xs text-neutral-600">
                      <span className="inline-flex items-center gap-1">
                        <Clock className="size-3" aria-hidden />
                        {formatDateTime(r.created_at)}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center justify-end gap-1.5">
                        {r.status === "pending" ? (
                          <>
                            <Button
                              size="sm"
                              onClick={() =>
                                setDialog({ kind: "activate", row: r })
                              }
                              disabled={busy}
                            >
                              {busy ? (
                                <Loader2
                                  className="size-3.5 animate-spin"
                                  aria-hidden
                                />
                              ) : (
                                <CheckCircle2
                                  className="size-3.5"
                                  aria-hidden
                                />
                              )}
                              Aktifkan
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() =>
                                setDialog({ kind: "reject", row: r })
                              }
                              disabled={busy}
                              className="text-danger hover:bg-danger/10"
                            >
                              <XCircle className="size-3.5" aria-hidden />
                              Tolak
                            </Button>
                          </>
                        ) : (
                          <span className="text-xs text-neutral-400">
                            {r.status === "paid"
                              ? "Sudah aktif"
                              : "Sudah ditolak"}
                          </span>
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

      <TablePagination
        page={page}
        pageSize={TABLE_PAGE_SIZE}
        total={total}
        paramName="page"
      />

      <ConfirmDialog
        open={dialog?.kind === "activate"}
        onClose={closeDialog}
        onConfirm={() => dialog?.row && activate(dialog.row)}
        title={
          dialog?.kind === "activate"
            ? `Aktifkan langganan ${planLabel[dialog.row.plan] ?? dialog.row.plan} untuk ${dialog.row.store_name}?`
            : ""
        }
        description={
          dialog?.kind === "activate" ? (
            <>
              Pastikan transfer sebesar{" "}
              <strong>{formatRupiah(dialog.row.amount_cents)}</strong> sudah
              masuk di rekening platform sebelum mengaktifkan.
              <br />
              <span className="mt-2 block text-xs text-neutral-600">
                Setelah konfirmasi: status invoice → <strong>aktif</strong>,
                masa langganan toko diperpanjang{" "}
                <strong>{dialog.row.months} bulan</strong> dari periode aktif
                saat ini, dan plan toko di-set ke{" "}
                <strong>{planLabel[dialog.row.plan] ?? dialog.row.plan}</strong>.
              </span>
            </>
          ) : (
            ""
          )
        }
        confirmLabel="Ya, aktifkan"
        kind="default"
        busy={!!busyId}
      />

      <ConfirmDialog
        open={dialog?.kind === "reject"}
        onClose={closeDialog}
        onConfirm={() => dialog?.row && reject(dialog.row)}
        title={
          dialog?.kind === "reject"
            ? `Tolak transaksi ${dialog.row.store_name}?`
            : ""
        }
        description={
          dialog?.kind === "reject" ? (
            <>
              Status invoice akan diubah jadi <strong>ditolak</strong> dan
              langganan toko tidak diperpanjang. Pakai kalau kamu sudah cek
              dan transfer ternyata tidak masuk.
            </>
          ) : (
            ""
          )
        }
        confirmLabel="Ya, tolak"
        kind="danger"
        busy={!!busyId}
      />
    </div>
  );
}
