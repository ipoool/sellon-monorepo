"use client";

import { useState } from "react";
import { Switch } from "@/components/ui/switch";
import type { OpenHours, DayOfWeek } from "@/lib/types";

const days: { key: DayOfWeek; label: string }[] = [
  { key: "mon", label: "Senin" },
  { key: "tue", label: "Selasa" },
  { key: "wed", label: "Rabu" },
  { key: "thu", label: "Kamis" },
  { key: "fri", label: "Jumat" },
  { key: "sat", label: "Sabtu" },
  { key: "sun", label: "Minggu" },
];

const DEFAULT: OpenHours = {
  mon: { open: "08:00", close: "20:00" },
  tue: { open: "08:00", close: "20:00" },
  wed: { open: "08:00", close: "20:00" },
  thu: { open: "08:00", close: "20:00" },
  fri: { open: "08:00", close: "20:00" },
  sat: { open: "09:00", close: "20:00" },
  sun: { open: "09:00", close: "18:00" },
};

type Props = {
  initial: OpenHours;
  // Hidden input name - its value is the JSON to submit with the form.
  name: string;
};

export function JamBukaEditor({ initial, name }: Props) {
  // Merge with default so all 7 days show; fall back to default values
  const [hours, setHours] = useState<OpenHours>(() => {
    const merged: OpenHours = { ...DEFAULT };
    for (const k of Object.keys(initial) as DayOfWeek[]) {
      const v = initial[k];
      if (v) merged[k] = v;
    }
    return merged;
  });

  function update(day: DayOfWeek, patch: Partial<OpenHours[DayOfWeek] & object>) {
    setHours((h) => ({
      ...h,
      [day]: { ...(h[day] || { open: "08:00", close: "20:00" }), ...patch },
    }));
  }

  return (
    <div className="flex flex-col gap-2">
      <input type="hidden" name={name} value={JSON.stringify(hours)} />
      <ul className="flex flex-col divide-y divide-neutral-200 rounded-lg border border-neutral-200">
        {days.map((d) => {
          const v = hours[d.key];
          const closed = v?.closed === true;
          return (
            <li
              key={d.key}
              className="flex flex-col gap-3 px-3 py-2.5 sm:flex-row sm:items-center"
            >
              <span className="w-20 shrink-0 text-sm font-medium text-neutral-700">
                {d.label}
              </span>
              <label className="flex cursor-pointer items-center gap-2.5 text-sm sm:w-24">
                <Switch
                  size="sm"
                  checked={!closed}
                  onChange={(e) =>
                    update(d.key, { closed: !e.target.checked })
                  }
                />
                <span className="text-neutral-700">
                  {closed ? "Tutup" : "Buka"}
                </span>
              </label>
              <div className={"flex flex-1 items-center gap-2 " + (closed ? "opacity-40" : "")}>
                <input
                  type="time"
                  disabled={closed}
                  value={v?.open ?? "08:00"}
                  onChange={(e) => update(d.key, { open: e.target.value })}
                  className="h-9 w-28 rounded-lg border border-neutral-200 bg-white px-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30 disabled:cursor-not-allowed"
                />
                <span className="text-neutral-400">-</span>
                <input
                  type="time"
                  disabled={closed}
                  value={v?.close ?? "20:00"}
                  onChange={(e) => update(d.key, { close: e.target.value })}
                  className="h-9 w-28 rounded-lg border border-neutral-200 bg-white px-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30 disabled:cursor-not-allowed"
                />
              </div>
            </li>
          );
        })}
      </ul>
      <p className="text-xs text-neutral-500">
        Jam buka akan ditampilkan di halaman toko. Toggle &ldquo;Tutup&rdquo;
        kalau hari itu libur permanen.
      </p>
    </div>
  );
}
