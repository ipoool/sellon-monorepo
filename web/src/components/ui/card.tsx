import * as React from "react";
import { cn } from "@/lib/utils";

type Variant = "default" | "ghost" | "ringed" | "elevated";

const variantClasses: Record<Variant, string> = {
  default: "border border-neutral-200 bg-white shadow-card",
  ghost: "bg-white",
  ringed: "border border-brand-500 bg-white ring-2 ring-brand-500/15 shadow-popout",
  elevated: "border border-neutral-200 bg-white shadow-elevated",
};

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: Variant;
  ref?: React.Ref<HTMLDivElement>;
}

export function Card({
  className,
  variant = "default",
  ref,
  ...props
}: CardProps) {
  return (
    <div
      ref={ref}
      className={cn("rounded-xl p-6", variantClasses[variant], className)}
      {...props}
    />
  );
}

type CardContentProps = React.HTMLAttributes<HTMLDivElement> & {
  ref?: React.Ref<HTMLDivElement>;
};

export function CardContent({ className, ref, ...props }: CardContentProps) {
  return (
    <div
      ref={ref}
      className={cn("flex flex-col gap-3", className)}
      {...props}
    />
  );
}
