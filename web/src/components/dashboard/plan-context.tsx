"use client";

import { createContext, useContext, type ReactNode } from "react";

// Active subscription tier — surfaced from the dashboard layout (which
// already fetches /api/v1/subscription) so deep descendants like the
// sidebar tier badge don't have to re-fetch. Defaults to "free" when no
// provider wraps the tree (e.g. an admin without a store).
type Plan = "free" | "pro" | "bisnis";

const PlanContext = createContext<Plan>("free");

export function PlanProvider({
  value,
  children,
}: {
  value: Plan;
  children: ReactNode;
}) {
  return <PlanContext.Provider value={value}>{children}</PlanContext.Provider>;
}

export function usePlan(): Plan {
  return useContext(PlanContext);
}
