import * as React from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";

type Size = "xs" | "sm" | "md" | "lg";

const sizeClasses: Record<Size, string> = {
  xs: "size-5 text-[10px]",
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
      <Image
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
