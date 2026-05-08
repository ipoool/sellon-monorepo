import * as React from "react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";

type StatProps = {
  label: string;
  value: string;
  trend?: {
    direction: "up" | "down" | "flat";
    label: string;
  };
  sparkline?: number[];
  className?: string;
};

export function Stat({ label, value, trend, sparkline, className }: StatProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-xl border border-neutral-200 bg-white p-5 shadow-card",
        className,
      )}
    >
      <p className="text-sm font-medium text-neutral-600">{label}</p>
      <div className="flex items-end justify-between gap-3">
        <p className="font-display text-3xl font-semibold tracking-tight text-neutral-900">
          {value}
        </p>
        {sparkline && sparkline.length >= 2 && (
          <Sparkline data={sparkline} positive={trend?.direction !== "down"} />
        )}
      </div>
      {trend && (
        <div className="flex items-center gap-1 text-xs">
          {trend.direction === "up" && (
            <ArrowUpRight className="size-3.5 text-success" aria-hidden />
          )}
          {trend.direction === "down" && (
            <ArrowDownRight className="size-3.5 text-danger" aria-hidden />
          )}
          <span
            className={cn(
              "font-medium",
              trend.direction === "up" && "text-success",
              trend.direction === "down" && "text-danger",
              trend.direction === "flat" && "text-neutral-500",
            )}
          >
            {trend.label}
          </span>
        </div>
      )}
    </div>
  );
}

function Sparkline({ data, positive }: { data: number[]; positive: boolean }) {
  const w = 80;
  const h = 28;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const stepX = w / (data.length - 1);

  const points = data
    .map((v, i) => {
      const x = i * stepX;
      const y = h - ((v - min) / range) * h;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  const stroke = positive ? "var(--color-brand-500)" : "var(--color-danger)";

  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      className="shrink-0 text-brand-500"
      aria-hidden
    >
      <polyline
        fill="none"
        stroke={stroke}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
      />
    </svg>
  );
}
