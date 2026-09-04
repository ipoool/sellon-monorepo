import * as React from "react";
import { cn } from "@/lib/utils";

type Variant = "default" | "secondary" | "ghost" | "outline" | "destructive";
type Size = "sm" | "md" | "lg" | "icon";

// Plain object pattern (no class-variance-authority — keeps deps minimal).
const variantClasses: Record<Variant, string> = {
  default:
    "bg-brand-700 text-white hover:bg-brand-800 active:bg-brand-900 shadow-soft",
  secondary:
    "bg-neutral-100 text-neutral-900 hover:bg-neutral-200 active:bg-neutral-300",
  ghost:
    "bg-transparent text-neutral-700 hover:bg-neutral-100 active:bg-neutral-200",
  outline:
    "bg-transparent text-neutral-900 border border-neutral-300 hover:bg-neutral-50 active:bg-neutral-100",
  destructive:
    "bg-danger text-white hover:opacity-90 active:opacity-80 shadow-soft",
};

const sizeClasses: Record<Size, string> = {
  sm: "h-8 px-3 text-sm",
  md: "h-10 px-4 text-sm",
  lg: "h-12 px-6 text-base",
  icon: "h-10 w-10",
};

const baseClasses =
  "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:ring-offset-2 focus-visible:ring-offset-white disabled:pointer-events-none disabled:opacity-50";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  ref?: React.Ref<HTMLButtonElement>;
  /**
   * Render the single child element instead of a <button>, merging the
   * button classes into it. Use it for link CTAs —
   * `<Button asChild><Link href="…">…</Link></Button>` — so the markup stays
   * a single interactive element. Wrapping a <Button> in a <Link> nests two
   * interactive elements and produces two tab stops per CTA.
   */
  asChild?: boolean;
}

export function Button({
  className,
  variant = "default",
  size = "md",
  ref,
  asChild = false,
  children,
  ...props
}: ButtonProps) {
  const classes = cn(
    baseClasses,
    variantClasses[variant],
    sizeClasses[size],
    className,
  );

  if (asChild) {
    // Minimal local Slot (no Radix dependency): clone the one child and merge
    // className + the remaining props. The child's own props win, so an
    // explicit href/onClick on the child is never clobbered.
    const child = React.Children.only(children) as React.ReactElement<{
      className?: string;
    }>;
    return React.cloneElement(child, {
      ...props,
      ...child.props,
      className: cn(classes, child.props.className),
    } as React.HTMLAttributes<HTMLElement>);
  }

  return (
    <button ref={ref} className={classes} {...props}>
      {children}
    </button>
  );
}
