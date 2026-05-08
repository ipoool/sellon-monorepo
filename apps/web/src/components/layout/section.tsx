import * as React from "react";
import { cn } from "@/lib/utils";

type SectionProps = {
  id?: string;
  bg?: "default" | "alt" | "brand-soft";
  tight?: boolean;
  className?: string;
  children: React.ReactNode;
};

const bgClasses = {
  default: "",
  alt: "bg-neutral-50",
  "brand-soft": "bg-gradient-brand-soft",
};

export function Section({
  id,
  bg = "default",
  tight = false,
  className,
  children,
}: SectionProps) {
  return (
    <section
      id={id}
      className={cn(
        "scroll-mt-20",
        tight ? "py-14 lg:py-20" : "py-20 lg:py-28",
        bgClasses[bg],
        className,
      )}
    >
      {children}
    </section>
  );
}
