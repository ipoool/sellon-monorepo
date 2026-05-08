import {
  CircleDot,
  CheckCircle2,
  Clock,
  PackageCheck,
  Truck,
  Award,
  XCircle,
} from "lucide-react";

import { formatDateTimeID } from "@/lib/format";
import type { OrderDetail } from "@/lib/types";
import { cn } from "@/lib/utils";

type Step = {
  key: string;
  label: string;
  icon: typeof CheckCircle2;
  reached: boolean;
  at?: string | null;
};

export function OrderTimeline({ order }: { order: OrderDetail }) {
  const isCancelled = order.status === "cancelled";
  const reached = (s: OrderDetail["status"]): boolean => {
    if (isCancelled) return false;
    const order_ = ["pending", "confirmed", "processing", "shipped", "completed"];
    return order_.indexOf(order.status) >= order_.indexOf(s);
  };

  const steps: Step[] = [
    {
      key: "pending",
      label: "Pesanan masuk",
      icon: Clock,
      reached: true,
      at: order.created_at,
    },
    {
      key: "confirmed",
      label: "Dikonfirmasi",
      icon: CheckCircle2,
      reached: reached("confirmed"),
    },
    {
      key: "processing",
      label: "Diproses",
      icon: PackageCheck,
      reached: reached("processing"),
    },
    {
      key: "shipped",
      label: "Dikirim",
      icon: Truck,
      reached: reached("shipped"),
      at: order.shipped_at,
    },
    {
      key: "completed",
      label: "Selesai",
      icon: Award,
      reached: reached("completed"),
      at: order.completed_at,
    },
  ];

  if (isCancelled) {
    steps.push({
      key: "cancelled",
      label: "Dibatalkan",
      icon: XCircle,
      reached: true,
      at: order.cancelled_at,
    });
  }

  return (
    <ol className="flex flex-col">
      {steps.map((step, i) => (
        <li
          key={step.key}
          className="relative flex gap-3 pb-4 last:pb-0"
        >
          {i < steps.length - 1 && (
            <span
              aria-hidden
              className={cn(
                "absolute left-3 top-7 h-[calc(100%-1.75rem)] w-px",
                step.reached ? "bg-brand-300" : "bg-neutral-200",
              )}
            />
          )}
          <span
            aria-hidden
            className={cn(
              "relative z-10 flex size-6 shrink-0 items-center justify-center rounded-full",
              step.key === "cancelled"
                ? "bg-danger/15 text-danger"
                : step.reached
                  ? "bg-brand-500 text-white"
                  : "bg-neutral-100 text-neutral-400",
            )}
          >
            {step.reached ? (
              <step.icon className="size-3.5" />
            ) : (
              <CircleDot className="size-3" />
            )}
          </span>
          <div className="flex flex-1 flex-col">
            <span
              className={cn(
                "text-sm font-medium",
                step.reached ? "text-neutral-900" : "text-neutral-500",
              )}
            >
              {step.label}
            </span>
            {step.reached && step.at && (
              <span className="text-xs text-neutral-500">
                {formatDateTimeID(step.at)} WIB
              </span>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}
