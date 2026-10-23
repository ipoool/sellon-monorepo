"use client";

import { createContext, useContext, type ReactNode } from "react";

import type {
  AddonCatalogEntry,
  AddonCode,
  GatedFeature,
} from "@/lib/types";

// What the store may use, surfaced from the dashboard layout (which already
// fetches /api/v1/subscription) so deep descendants like the sidebar don't
// re-fetch.
//
// This used to be the plan string alone. That was the whole answer only
// while a tier decided everything; now Bisnis features are sold one package
// at a time, so what matters is the resolved feature set.
type Plan = "free" | "pro" | "bisnis";

export type Entitlements = {
  plan: Plan;
  /** Gated features this store unlocks right now. */
  features: GatedFeature[];
  /** Add-on codes it holds. */
  addons: AddonCode[];
  /** The sellable packages, so a lock can name what to buy. */
  catalog: AddonCatalogEntry[];
};

const EMPTY: Entitlements = {
  plan: "free",
  features: [],
  addons: [],
  catalog: [],
};

const PlanContext = createContext<Entitlements>(EMPTY);

export function PlanProvider({
  value,
  children,
}: {
  value: Entitlements;
  children: ReactNode;
}) {
  return <PlanContext.Provider value={value}>{children}</PlanContext.Provider>;
}

/** The active tier. Kept for the sidebar badge, which shows the plan name. */
export function usePlan(): Plan {
  return useContext(PlanContext).plan;
}

export function useEntitlements(): Entitlements {
  return useContext(PlanContext);
}

/** Whether the store can use a feature right now. */
export function useHasFeature(f: GatedFeature): boolean {
  return useContext(PlanContext).features.includes(f);
}
