import type { ReactNode } from "react";

// Wrap nested /pos/transactions route back into a regular shell-able layout —
// the parent /pos layout strips the dashboard shell for fullscreen kasir, but
// the riwayat transaksi page should still feel like a dashboard page.
export default function POSTransactionsLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
