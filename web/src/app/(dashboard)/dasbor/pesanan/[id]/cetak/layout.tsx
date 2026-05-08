import type { ReactNode } from "react";

// Stripped layout for the printable nota — overrides the (dashboard) shell so
// no sidebar/topbar appears in the printed PDF.
export default function NotaPrintLayout({ children }: { children: ReactNode }) {
  return <div className="min-h-svh bg-white">{children}</div>;
}
