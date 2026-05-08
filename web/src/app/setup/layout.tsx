import type { ReactNode } from "react";

// Standalone layout — no header, sidebar, footer. Just a clean canvas
// for the first-time setup wizard.
export default function SetupLayout({ children }: { children: ReactNode }) {
  return <div className="min-h-svh bg-neutral-50">{children}</div>;
}
