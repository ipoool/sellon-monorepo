"use client";

import { createContext, useContext, type ReactNode } from "react";

// Which optional sidebar menu groups the seller chose during profiling. Surfaced
// from the dashboard layout (which already fetches /api/v1/store) so the sidebar
// can show/hide groups without prop-drilling or a client re-fetch. These control
// VISIBILITY only — plan tier still gates ACCESS via the Bisnis-gate. Defaults to
// all-true so a tree without a provider (e.g. admin without a store) shows
// everything.
export type MenuCapabilities = {
  pos: boolean;
  reseller: boolean;
  digital: boolean;
  materials: boolean;
};

const MenuCapabilitiesContext = createContext<MenuCapabilities>({
  pos: true,
  reseller: true,
  digital: true,
  materials: true,
});

export function MenuCapabilitiesProvider({
  value,
  children,
}: {
  value: MenuCapabilities;
  children: ReactNode;
}) {
  return (
    <MenuCapabilitiesContext.Provider value={value}>
      {children}
    </MenuCapabilitiesContext.Provider>
  );
}

export function useMenuCapabilities(): MenuCapabilities {
  return useContext(MenuCapabilitiesContext);
}
