"use client";

import { useCallback, useState, type FormEvent } from "react";
import { showError, showSuccess } from "@/lib/toast";
import { useRouter } from "next/navigation";
import {
  ShieldCheck,
  ShoppingBag,
  Users as UsersIcon,
  Crown,
  CreditCard,
  Activity,
  RefreshCw,
  Calendar,
  X as XIcon,
  MessageCircle,
} from "lucide-react";

import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { maskEmail, maskPhone, maskPII } from "@/lib/pii";
import type { AuditEntry } from "@/lib/types";

const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

type Filter = {
  since?: string;
  until?: string;
};

type Props = {
  initial: AuditEntry[];
  filter?: Filter;
};

// Group icon by the action's prefix (the part before the dot). Keeps
// the visual taxonomy stable as we add more actions later.
function iconFor(action: string) {
  if (action.startsWith("order.wa_sent.")) return MessageCircle;
  const head = action.split(".")[0];
  switch (head) {
    case "order":
      return ShoppingBag;
    case "staff":
      return UsersIcon;
    case "subscription":
      return action === "subscription.settled" ? CreditCard : Crown;
    case "store":
      return ShieldCheck;
    default:
      return Activity;
  }
}

function tintFor(action: string) {
  if (action.startsWith("order.wa_sent.")) return "bg-success/15 text-success";
  const head = action.split(".")[0];
  switch (head) {
    case "order":
      return "bg-brand-50 text-brand-700";
    case "staff":
      return "bg-warning/15 text-neutral-800";
    case "subscription":
      return "bg-success/15 text-success";
    default:
      return "bg-neutral-100 text-neutral-700";
  }
}

function formatRelative(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return iso;
  const diff = (Date.now() - t) / 1000;
  if (diff < 60) return "baru saja";
  if (diff < 3600) return `${Math.floor(diff / 60)} menit lalu`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} jam lalu`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)} hari lalu`;
  return new Date(iso).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatExact(iso: string): string {
  return new Date(iso).toLocaleString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ActivityLog({ initial, filter }: Props) {
  const { push } = useRouter();
  const [entries, setEntries] = useState(() => initial);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(() => initial.length < 50);

  // Local state for the filter form. Submitting it pushes the route
  // with new searchParams so the server re-fetches; we don't fetch
  // client-side here to avoid divergence from the SSR'd initial list.
  const [since, setSince] = useState(filter?.since ?? "");
  const [until, setUntil] = useState(filter?.until ?? "");
  const hasFilter = Boolean(filter?.since || filter?.until);

  function applyFilter(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const sp = new URLSearchParams();
    if (since) sp.set("since", since);
    if (until) sp.set("until", until);
    const qs = sp.toString();
    push(`/settings/activity${qs ? `?${qs}` : ""}`);
  }

  function clearFilter() {
    setSince("");
    setUntil("");
    push("/settings/activity");
  }

  const loadMore = useCallback(async () => {
    if (loading || done) return;
    const last = entries[entries.length - 1];
    if (!last) return;
    setLoading(true);
    try {
      const url = new URL(`${apiBase}/api/v1/audit-log`);
      url.searchParams.set("limit", "50");
      url.searchParams.set("before", last.created_at);
      if (filter?.since) url.searchParams.set("since", filter.since);
      if (filter?.until) url.searchParams.set("until", filter.until);
      const res = await fetch(url.toString(), { credentials: "include" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      const next: AuditEntry[] = data.entries ?? [];
      setEntries((prev) => [...prev, ...next]);
      if (next.length < 50) setDone(true);
    } catch (err) {
      showError(err);
    } finally {
      setLoading(false);
    }
  }, [loading, done, entries, filter?.since, filter?.until]);

  // Filter form lives outside the empty-state branch so it stays
  // visible even when the current filter returns nothing - that way
  // the user has a single place to clear / re-tune.
  const filterForm = (
    <Card className="mb-4">
      <form
        onSubmit={applyFilter}
        className="flex flex-col gap-3 sm:flex-row sm:items-end sm:gap-3"
      >
        <div className="flex flex-1 flex-col gap-1.5 sm:max-w-[180px]">
          <Label htmlFor="filter-since" className="flex items-center gap-1.5 text-xs">
            <Calendar className="size-3.5 text-neutral-500" aria-hidden />
            Dari tanggal
          </Label>
          <Input
            id="filter-since"
            type="date"
            value={since}
            onChange={(e) => setSince(e.target.value)}
            max={until || undefined}
          />
        </div>
        <div className="flex flex-1 flex-col gap-1.5 sm:max-w-[180px]">
          <Label htmlFor="filter-until" className="text-xs">
            Sampai tanggal
          </Label>
          <Input
            id="filter-until"
            type="date"
            value={until}
            onChange={(e) => setUntil(e.target.value)}
            min={since || undefined}
          />
        </div>
        <div className="flex gap-2">
          <Button type="submit" size="sm" variant="outline">
            Terapkan
          </Button>
          {hasFilter && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={clearFilter}
              aria-label="Reset filter"
            >
              <XIcon className="size-3.5" aria-hidden />
              Reset
            </Button>
          )}
        </div>
      </form>
    </Card>
  );

  if (entries.length === 0) {
    return (
      <>
        {filterForm}
        <Card>
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <div className="flex size-12 items-center justify-center rounded-full bg-neutral-100 text-neutral-500">
              <Activity className="size-6" aria-hidden />
            </div>
            <div>
              <p className="font-medium text-neutral-900">
                {hasFilter
                  ? "Tidak ada aktivitas pada rentang tanggal ini"
                  : "Belum ada aktivitas"}
              </p>
              <p className="mt-1 max-w-sm text-sm text-neutral-600">
                {hasFilter
                  ? "Coba lebarkan rentang tanggal atau reset filter."
                  : "Aksi yang mengubah pesanan, staf, atau langganan akan tercatat otomatis di sini."}
              </p>
            </div>
          </div>
        </Card>
      </>
    );
  }

  return (
    <>
    {filterForm}
    <Card>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-neutral-900">Riwayat Aktivitas</h2>
          <p className="mt-0.5 text-sm text-neutral-500">
            {hasFilter
              ? `Difilter dari ${filter?.since || "-"} sampai ${filter?.until || "-"}.`
              : "Catatan perubahan yang dilakukan kamu dan staf di toko ini."}
          </p>
        </div>
      </div>

      <ol className="flex flex-col">
        {entries.map((e, idx) => {
          const Icon = iconFor(e.action);
          const tint = tintFor(e.action);
          const isLast = idx === entries.length - 1;
          // When actor_name is missing we fall back to email — mask that
          // too so the activity log never leaks raw PII to staff who
          // only need "who acted".
          const actorName = e.actor_name
            ? e.actor_name
            : e.actor_email
              ? maskEmail(e.actor_email)
              : e.actor_user_id
                ? "Anggota tim"
                : "Sistem";
          const maskedActorEmail = e.actor_email ? maskEmail(e.actor_email) : "";
          const maskedImpersonatorEmail = e.impersonator_email
            ? maskEmail(e.impersonator_email)
            : "";
          return (
            <li
              key={e.id}
              className={cn(
                "relative flex gap-3 pb-5",
                !isLast && "border-l border-neutral-200 pl-8 ml-4",
                isLast && "pl-0",
              )}
            >
              <span
                className={cn(
                  "flex size-8 shrink-0 items-center justify-center rounded-full ring-4 ring-white",
                  tint,
                  !isLast && "absolute -left-4 top-0",
                  isLast && "relative",
                )}
              >
                <Icon className="size-4" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <p className="text-sm font-medium text-neutral-900">
                    {e.summary ? maskPII(e.summary) : e.action}
                  </p>
                  <Badge variant="outline" className="font-mono text-[10px]">
                    {e.action}
                  </Badge>
                  {e.impersonator_user_id && (
                    <Badge
                      variant="danger"
                      className="gap-1 text-[10px] uppercase tracking-wider"
                      title={
                        maskedImpersonatorEmail
                          ? `Dilakukan oleh admin ${maskedImpersonatorEmail}`
                          : "Dilakukan oleh admin platform"
                      }
                    >
                      Via Admin
                    </Badge>
                  )}
                </div>
                {e.action.startsWith("order.wa_sent.") &&
                  typeof e.metadata?.message === "string" && (
                    <details className="mt-2 rounded-md border border-neutral-200 bg-neutral-50 text-xs">
                      <summary className="cursor-pointer select-none px-2.5 py-1.5 text-neutral-600 hover:text-neutral-900">
                        Lihat isi pesan
                        {typeof e.metadata?.recipient === "string" &&
                        e.metadata.recipient
                          ? ` (ke ${maskPhone(e.metadata.recipient)})`
                          : ""}
                      </summary>
                      <pre className="whitespace-pre-wrap break-words border-t border-neutral-200 bg-white px-2.5 py-2 font-sans text-neutral-800">
                        {maskPII(e.metadata.message as string)}
                      </pre>
                    </details>
                  )}
                {e.action === "payment_gateway.webhook_rotated" &&
                  (typeof e.metadata?.old_webhook_url === "string" ||
                    typeof e.metadata?.new_webhook_url === "string") && (
                    <details className="mt-2 rounded-md border border-neutral-200 bg-neutral-50 text-xs">
                      <summary className="cursor-pointer select-none px-2.5 py-1.5 text-neutral-600 hover:text-neutral-900">
                        Lihat URL lama &amp; baru
                      </summary>
                      <div className="flex flex-col gap-2 border-t border-neutral-200 bg-white px-2.5 py-2">
                        {typeof e.metadata.old_webhook_url === "string" && (
                          <div>
                            <p className="text-[10px] font-semibold uppercase tracking-wider text-danger">
                              URL lama (non-aktif)
                            </p>
                            <p className="mt-0.5 break-all font-mono text-[11px] text-neutral-700 line-through">
                              {e.metadata.old_webhook_url}
                            </p>
                          </div>
                        )}
                        {typeof e.metadata.new_webhook_url === "string" && (
                          <div>
                            <p className="text-[10px] font-semibold uppercase tracking-wider text-success">
                              URL baru (aktif)
                            </p>
                            <p className="mt-0.5 break-all font-mono text-[11px] text-neutral-900">
                              {e.metadata.new_webhook_url}
                            </p>
                          </div>
                        )}
                        {e.metadata.store_set_offline === true && (
                          <p className="rounded bg-warning/10 px-2 py-1 text-[11px] text-neutral-700">
                            Toko otomatis di-set offline. Buka kembali setelah
                            URL baru ter-update di dashboard Midtrans.
                          </p>
                        )}
                      </div>
                    </details>
                  )}
                <div className="mt-1.5 flex items-center gap-2 text-xs text-neutral-600">
                  <Avatar name={actorName} size="xs" />
                  <span className="truncate">
                    <span className="font-medium text-neutral-800">
                      {actorName}
                    </span>
                    {maskedActorEmail && maskedActorEmail !== actorName && (
                      <span className="text-neutral-500">
                        {" "}({maskedActorEmail})
                      </span>
                    )}
                    {e.impersonator_user_id && (
                      <span className="text-danger">
                        {" "}- sedang di-impersonate oleh{" "}
                        <span className="font-medium">
                          {e.impersonator_name ||
                            maskedImpersonatorEmail ||
                            "admin platform"}
                        </span>
                      </span>
                    )}
                  </span>
                  <span className="text-neutral-300">•</span>
                  <time
                    dateTime={e.created_at}
                    title={formatExact(e.created_at)}
                  >
                    {formatRelative(e.created_at)}
                  </time>
                </div>
              </div>
            </li>
          );
        })}
      </ol>

      <div className="mt-2 flex items-center justify-center gap-2">
                {!done && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={loadMore}
            disabled={loading}
          >
            <RefreshCw
              className={cn("size-3.5", loading && "animate-spin")}
              aria-hidden
            />
            {loading ? "Memuat…" : "Muat lebih banyak"}
          </Button>
        )}
        {done && entries.length > 0 && (
          <p className="text-xs text-neutral-500">Sudah sampai paling awal.</p>
        )}
      </div>
    </Card>
    </>
  );
}
