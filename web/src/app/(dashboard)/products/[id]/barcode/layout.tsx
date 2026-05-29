import type { ReactNode } from "react";

// Stripped layout for printable barcode sheet — overrides the dashboard
// shell so only the sheet shows on print.
export default function BarcodeLayout({ children }: { children: ReactNode }) {
  return <div className="min-h-svh bg-neutral-100">{children}</div>;
}
