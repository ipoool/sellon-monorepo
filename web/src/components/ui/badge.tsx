import * as React from "react";
import { cn } from "@/lib/utils";

type Variant =
  | "default"
  | "brand"
  | "success"
  | "warning"
  | "danger"
  | "outline";

const variantClasses: Record<Variant, string> = {
  default: "bg-neutral-100 text-neutral-700",
  brand: "bg-brand-50 text-brand-700",
  success: "bg-success/10 text-success",
  warning: "bg-warning/15 text-neutral-800",
  danger: "bg-danger/10 text-danger",
  outline: "border border-neutral-200 text-neutral-700",
};

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: Variant;
}

export function Badge({
  className,
  variant = "default",
  ...props
}: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium",
        variantClasses[variant],
        className,
      )}
      {...props}
    />
  );
}
