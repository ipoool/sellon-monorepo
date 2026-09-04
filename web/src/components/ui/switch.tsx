import * as React from "react";
import { cn } from "@/lib/utils";

type SwitchProps = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "type" | "size"
> & {
  size?: "sm" | "md";
  ref?: React.Ref<HTMLInputElement>;
};

// Switch is a checkbox styled as a toggle. The native input stays in the
// DOM (as `peer`) so FormData / required / name still work, and assistive
// tech treats it as a normal checkbox.
//
// The wrapper is a <span>, NOT a <label>: most call sites already wrap the
// Switch in their own <label>, and label-inside-label is invalid HTML (the
// inner label swallows the click and the outer one loses its target). The
// input is therefore a transparent, full-size overlay instead of `sr-only`
// so the visual track stays clickable on its own. Pass `id` (paired with an
// external <label htmlFor>) or `aria-label` to give it an accessible name.
export function Switch({
  className,
  size = "md",
  disabled,
  ref,
  ...props
}: SwitchProps) {
  const dims =
    size === "sm"
      ? { track: "h-5 w-9", thumb: "size-4 peer-checked:translate-x-4" }
      : { track: "h-6 w-11", thumb: "size-5 peer-checked:translate-x-5" };
  return (
    <span
      className={cn(
        "relative inline-flex shrink-0 select-none items-center",
        disabled && "opacity-50",
        className,
      )}
    >
      <input
        ref={ref}
        type="checkbox"
        disabled={disabled}
        className="peer absolute inset-0 z-10 m-0 size-full cursor-pointer appearance-none opacity-0 disabled:cursor-not-allowed"
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
}
