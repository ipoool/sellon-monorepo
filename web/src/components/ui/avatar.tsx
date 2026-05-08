import * as React from "react";
import { cn } from "@/lib/utils";

type Size = "sm" | "md" | "lg";

const sizeClasses: Record<Size, string> = {
  sm: "size-7 text-xs",
  md: "size-8 text-sm",
  lg: "size-10 text-base",
};

export interface AvatarProps {
  src?: string | null;
  name: string;
  size?: Size;
  className?: string;
}

export function Avatar({ src, name, size = "md", className }: AvatarProps) {
  const initial = (name || "?").trim().charAt(0).toUpperCase() || "?";

  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={name}
        width={40}
        height={40}
        className={cn(
          "rounded-full border border-neutral-200 object-cover",
          sizeClasses[size],
          className,
        )}
        referrerPolicy="no-referrer"
      />
    );
  }

  return (
    <div
      className={cn(
        "flex items-center justify-center rounded-full bg-brand-50 font-medium text-brand-700",
        sizeClasses[size],
        className,
      )}
      aria-label={name}
    >
      {initial}
    </div>
  );
}
