"use client";

import { createContext, useContext, type ReactNode } from "react";

// Whether the seller runs a Kitchen Display — surfaced from the dashboard
// layout (which already fetches /api/v1/store/dinein) so the sidebar can hide
// the "Kitchen Display" link without prop-drilling or a client re-fetch. When
// off, dine-in orders skip the kitchen pipeline entirely, so the board has
// nothing to show. Defaults to false when no provider wraps the tree.
const KdsContext = createContext<boolean>(false);

export function KdsProvider({
  value,
  children,
}: {
  value: boolean;
  children: ReactNode;
}) {
  return <KdsContext.Provider value={value}>{children}</KdsContext.Provider>;
}

export function useKdsEnabled(): boolean {
  return useContext(KdsContext);
}
