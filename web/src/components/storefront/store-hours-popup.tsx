"use client";

import { useEffect, useRef, useState } from "react";
import { Clock, X } from "lucide-react";

import type { DayOfWeek, OpenHours } from "@/lib/types";

const dayLabels: Record<DayOfWeek, string> = {
  mon: "Senin",
  tue: "Selasa",
  wed: "Rabu",
  thu: "Kamis",
  fri: "Jumat",
  sat: "Sabtu",
  sun: "Minggu",
};
const dayOrder: DayOfWeek[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

function todayKeyWIB(): DayOfWeek {
  const now = new Date();
  const wibHour = (now.getUTCHours() + 7) % 24;
  const baseDay = now.getUTCDay();
  const wibDay =
    wibHour < now.getUTCHours() ? (baseDay + 1) % 7 : baseDay;
  const map: DayOfWeek[] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
  return map[wibDay];
}

type Props = {
  openHours: OpenHours;
  storeName: string;
};

export function StoreHoursPopup({ openHours, storeName }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const today = todayKeyWIB();

  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    const onCancel = (e: Event) => {
      e.preventDefault();
      setOpen(false);
    };
    const onClick = (e: MouseEvent) => {
      if (e.target === d) setOpen(false);
    };
    d.addEventListener("cancel", onCancel);
    d.addEventListener("click", onClick);
    return () => {
      d.removeEventListener("cancel", onCancel);
      d.removeEventListener("click", onClick);
    };
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-neutral-700 hover:text-neutral-900"
      >
        <Clock className="size-3.5" aria-hidden />
        Lihat jadwal lengkap
      </button>

      <dialog
        ref={dialogRef}
        aria-labelledby="store-hours-title"
        className="fixed left-1/2 top-1/2 m-0 w-[min(420px,95vw)] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-neutral-200 bg-white p-0 shadow-popout backdrop:bg-neutral-900/40 backdrop:backdrop-blur-sm"
      >
        <div className="flex items-start justify-between gap-3 border-b border-neutral-200 px-5 py-3.5">
          <div className="min-w-0">
            <h2
              id="store-hours-title"
              className="font-display text-base font-semibold text-neutral-900"
            >
              Jadwal Buka
            </h2>
            <p className="mt-0.5 truncate text-xs text-neutral-500">
              {storeName}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Tutup"
            className="-mr-1 -mt-1 inline-flex size-8 shrink-0 items-center justify-center rounded-md text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-900"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>
        <ul className="divide-y divide-neutral-100 px-5 py-3">
          {dayOrder.map((d) => {
            const h = openHours[d];
            const isToday = d === today;
            const closed = !h || h.closed;
            return (
              <li
                key={d}
                className={
                  "flex items-center justify-between py-2 text-sm" +
                  (isToday ? " font-semibold text-brand-700" : " text-neutral-700")
                }
              >
                <span className="inline-flex items-center gap-2">
                  {dayLabels[d]}
                  {isToday && (
                    <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-brand-700">
                      Hari ini
                    </span>
                  )}
                </span>
                <span
                  className={
                    "font-mono text-sm" +
                    (closed ? " text-neutral-400" : "")
                  }
                >
                  {closed ? "Tutup" : `${h.open}–${h.close}`}
                </span>
              </li>
            );
          })}
        </ul>
        <p className="border-t border-neutral-200 bg-neutral-50 px-5 py-2.5 text-center text-xs text-neutral-500">
          Waktu mengikuti zona WIB (UTC+7)
        </p>
      </dialog>
    </>
  );
}
