"use client";

import { useState } from "react";
import { Camera, Clock, Eye } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  TABLE_PAGE_SIZE,
  TablePagination,
} from "@/components/dashboard/table-pagination";
import { formatRupiah } from "@/lib/format";
import type { PhotoBoothSession } from "@/lib/types";

type Props = {
  sessions: PhotoBoothSession[];
  total: number;
  page: number;
};

const statusBadge: Record<
  PhotoBoothSession["status"],
  { variant: "warning" | "success" | "danger" | "default"; label: string }
> = {
  created: { variant: "default", label: "Dibuat" },
  awaiting_payment: { variant: "warning", label: "Menunggu bayar" },
  paid: { variant: "success", label: "Lunas" },
  capturing: { variant: "success", label: "Sedang foto" },
  printing: { variant: "success", label: "Mencetak" },
  completed: { variant: "success", label: "Selesai" },
  expired: { variant: "default", label: "Kedaluwarsa" },
  failed: { variant: "danger", label: "Gagal" },
  refunded: { variant: "default", label: "Dikembalikan" },
};

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function AdminPhotoBoothSessionsTable({ sessions, total, page }: Props) {
  const [detail, setDetail] = useState<PhotoBoothSession | null>(null);

  if (sessions.length === 0) {
    return (
      <Card className="py-16 text-center">
        <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-neutral-100 text-neutral-500">
          <Camera className="size-7" aria-hidden />
        </div>
        <h2 className="mt-4 font-display text-xl font-semibold text-neutral-900">
          Belum ada sesi foto
        </h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-neutral-600">
          Sesi akan muncul di sini begitu booth mulai melayani pelanggan.
        </p>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Mobile: cards, so the detail action stays reachable on a phone. */}
      <ul className="flex flex-col gap-3 lg:hidden">
        {sessions.map((s) => (
          <li
            key={s.id}
            className="rounded-xl border border-neutral-200 bg-white p-4 shadow-card"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-mono text-xs font-semibold text-neutral-700">
                  {s.session_number}
                </p>
                <p className="mt-0.5 truncate text-sm text-neutral-900">
                  {s.booth_name}{" "}
                  <span className="text-neutral-400">({s.booth_code})</span>
                </p>
              </div>
              <Badge variant={statusBadge[s.status].variant}>
                {statusBadge[s.status].label}
              </Badge>
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 border-t border-neutral-100 pt-3 text-sm">
              <div>
                <dt className="text-xs text-neutral-500">Nominal</dt>
                <dd className="font-medium text-neutral-900">
                  {formatRupiah(s.amount_cents)}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-neutral-500">Foto</dt>
                <dd className="text-neutral-700">
                  {s.shots_taken}/{s.shots_planned}
                </dd>
              </div>
              <div className="col-span-2">
                <dt className="text-xs text-neutral-500">Waktu</dt>
                <dd className="text-neutral-700">
                  {formatDateTime(s.created_at)}
                </dd>
              </div>
            </dl>
            {s.needs_review && (
              <p className="mt-2 rounded-md bg-warning/10 px-2 py-1 text-xs font-medium text-warning">
                Perlu dicek: {s.review_reason}
              </p>
            )}
            <button
              type="button"
              onClick={() => setDetail(s)}
              className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
            >
              <Eye className="size-3.5" aria-hidden />
              Detail
            </button>
          </li>
        ))}
      </ul>

      <div className="hidden overflow-x-auto rounded-xl border border-neutral-200 bg-white shadow-card lg:block">
        <table className="w-full min-w-[980px] text-left text-sm">
          <thead className="bg-neutral-50 text-xs font-semibold uppercase tracking-wider text-neutral-500">
            <tr>
              <th className="whitespace-nowrap px-5 py-3">Waktu</th>
              <th className="whitespace-nowrap px-5 py-3">Booth</th>
              <th className="whitespace-nowrap px-5 py-3">No. Sesi</th>
              <th className="whitespace-nowrap px-5 py-3">Nominal</th>
              <th className="whitespace-nowrap px-5 py-3">Foto</th>
              <th className="whitespace-nowrap px-5 py-3">Status</th>
              <th className="sticky right-0 z-10 whitespace-nowrap bg-neutral-50 px-5 py-3 text-right shadow-[-8px_0_12px_-8px_rgba(0,0,0,0.12)]">
                Aksi
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-200">
            {sessions.map((s) => (
              <tr key={s.id} className="group hover:bg-neutral-50">
                <td className="whitespace-nowrap px-5 py-3 text-xs text-neutral-600">
                  <span className="inline-flex items-center gap-1">
                    <Clock className="size-3 shrink-0" aria-hidden />
                    {formatDateTime(s.created_at)}
                  </span>
                </td>
                <td className="whitespace-nowrap px-5 py-3">
                  <p className="font-medium text-neutral-900">{s.booth_name}</p>
                  <p className="text-xs text-neutral-500">{s.booth_code}</p>
                </td>
                <td className="whitespace-nowrap px-5 py-3 font-mono text-xs text-neutral-700">
                  {s.session_number}
                </td>
                <td className="whitespace-nowrap px-5 py-3 font-medium text-neutral-900">
                  {formatRupiah(s.amount_cents)}
                </td>
                <td className="whitespace-nowrap px-5 py-3 text-neutral-700">
                  {s.shots_taken}/{s.shots_planned}
                </td>
                <td className="whitespace-nowrap px-5 py-3">
                  <Badge variant={statusBadge[s.status].variant}>
                    {statusBadge[s.status].label}
                  </Badge>
                  {s.needs_review && (
                    <p className="mt-1 text-xs font-medium text-warning">
                      Perlu dicek
                    </p>
                  )}
                </td>
                <td className="sticky right-0 z-10 bg-white px-5 py-3 text-right shadow-[-8px_0_12px_-8px_rgba(0,0,0,0.12)] group-hover:bg-neutral-50">
                  <button
                    type="button"
                    onClick={() => setDetail(s)}
                    className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm font-medium text-neutral-700 hover:bg-neutral-100"
                  >
                    <Eye className="size-3.5" aria-hidden />
                    Detail
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <TablePagination page={page} pageSize={TABLE_PAGE_SIZE} total={total} />

      {detail && (
        <SessionDetail session={detail} onClose={() => setDetail(null)} />
      )}
    </div>
  );
}

/// The timestamp ladder, which is what makes a stuck session diagnosable:
/// paid with no capture is a camera that died after taking money.
function SessionDetail({
  session,
  onClose,
}: {
  session: PhotoBoothSession;
  onClose: () => void;
}) {
  const steps: [string, string | null][] = [
    ["Dibuat", session.created_at],
    ["QR terbit", session.charged_at],
    ["Lunas", session.paid_at],
    ["Selesai foto", session.captured_at],
    ["Tercetak", session.printed_at],
    ["Ditutup", session.completed_at],
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-900/40 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-popout">
        <h2 className="font-display text-lg font-semibold text-neutral-900">
          {session.session_number}
        </h2>
        <p className="mt-0.5 text-sm text-neutral-600">
          {session.booth_name} · {formatRupiah(session.amount_cents)} ·{" "}
          {session.shots_taken}/{session.shots_planned} foto
        </p>

        {session.needs_review && (
          <p className="mt-3 rounded-lg bg-warning/10 px-3 py-2 text-sm text-warning">
            Perlu dicek: {session.review_reason}
          </p>
        )}
        {session.failure_reason && (
          <p className="mt-2 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
            {session.failure_reason}
          </p>
        )}

        <ol className="mt-4 flex flex-col gap-2">
          {steps.map(([label, at]) => (
            <li
              key={label}
              className="flex items-center justify-between gap-3 text-sm"
            >
              <span className={at ? "text-neutral-900" : "text-neutral-400"}>
                {label}
              </span>
              <span className={at ? "text-neutral-600" : "text-neutral-300"}>
                {formatDateTime(at)}
              </span>
            </li>
          ))}
        </ol>

        {session.provider_transaction_id && (
          <p className="mt-4 break-all text-xs text-neutral-500">
            Midtrans: {session.provider_transaction_id}
          </p>
        )}

        <div className="mt-5 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
}
