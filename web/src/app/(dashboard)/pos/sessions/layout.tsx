import type { ReactNode } from "react";

// Wrap nested /pos/sessions/* routes back into a regular shell-able layout —
// the parent /pos layout strips the dashboard shell for fullscreen kasir, but
// the riwayat shift pages should still feel like dashboard pages.
export default function POSSessionsLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
