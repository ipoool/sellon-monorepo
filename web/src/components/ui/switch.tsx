import * as React from "react";
import { cn } from "@/lib/utils";

// Switch is a checkbox styled as a toggle. The native input stays in the
// DOM (as `peer`) so FormData / required / name still work, and assistive
// tech treats it as a normal checkbox.
export const Switch = React.forwardRef<
  HTMLInputElement,
  Omit<React.InputHTMLAttributes<HTMLInputElement>, "type" | "size"> & {
    size?: "sm" | "md";
  }
>(({ className, size = "md", disabled, ...props }, ref) => {
  const dims =
    size === "sm"
      ? { track: "h-5 w-9", thumb: "size-4 peer-checked:translate-x-4" }
      : { track: "h-6 w-11", thumb: "size-5 peer-checked:translate-x-5" };
  return (
    <span
      className={cn(
        "relative inline-flex shrink-0 cursor-pointer select-none items-center",
        disabled && "cursor-not-allowed opacity-50",
        className,
      )}
    >
      <input
        ref={ref}
        type="checkbox"
        disabled={disabled}
        className="peer sr-only"
        {...props}
      />
      <span
        aria-hidden
        className={cn(
          "rounded-full bg-neutral-300 transition-colors peer-checked:bg-brand-500 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand-500",
          dims.track,
        )}
      />
      <span
        aria-hidden
        className={cn(
          "absolute left-0.5 rounded-full bg-white shadow-sm transition-transform",
          dims.thumb,
        )}
      />
    </span>
  );
});
Switch.displayName = "Switch";
