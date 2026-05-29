import type { ReactNode } from "react";

// Stripped layout for thermal receipt — overrides the (dashboard) shell so
// only the receipt body is visible (relevant for print).
export default function ReceiptLayout({ children }: { children: ReactNode }) {
  return <div className="min-h-svh bg-neutral-100">{children}</div>;
}
