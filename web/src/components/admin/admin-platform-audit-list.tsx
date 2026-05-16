import { ShieldAlert, UserCog, Ban, RotateCcw, Activity } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { PlatformAuditEntry } from "@/lib/types";

function iconFor(action: string) {
  if (action.startsWith("user.impersonate")) return UserCog;
  if (action === "user.banned") return Ban;
  if (action === "user.unbanned") return RotateCcw;
  return ShieldAlert;
}

function formatExact(iso: string) {
  return new Date(iso).toLocaleString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Jakarta",
  });
}

type Props = { entries: PlatformAuditEntry[] };

export function AdminPlatformAuditList({ entries }: Props) {
  if (entries.length === 0) {
    return (
      <Card>
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          <div className="flex size-10 items-center justify-center rounded-full bg-neutral-100 text-neutral-500">
            <Activity className="size-4" aria-hidden />
          </div>
          <p className="text-sm text-neutral-600">
            Belum ada tindakan admin yang tercatat untuk pengguna ini.
          </p>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-0">
      <ol className="divide-y divide-neutral-100">
        {entries.map((e) => {
          const Icon = iconFor(e.action);
          const actor = e.actor_name || e.actor_email || "Sistem";
          return (
            <li key={e.id} className="flex items-start gap-3 px-4 py-3 sm:px-5">
              <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-neutral-700">
                <Icon className="size-4" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <p className="text-sm font-medium text-neutral-900">
                    {e.summary || e.action}
                  </p>
                  <Badge variant="outline" className="font-mono text-[10px]">
                    {e.action}
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-neutral-600">
                  oleh{" "}
                  <span className="font-medium text-neutral-800">{actor}</span>
                  {e.actor_email && actor !== e.actor_email && (
                    <span className="text-neutral-500"> ({e.actor_email})</span>
                  )}
                  <span className="mx-1.5 text-neutral-300">•</span>
                  <time dateTime={e.created_at}>{formatExact(e.created_at)}</time>
                </p>
              </div>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}
