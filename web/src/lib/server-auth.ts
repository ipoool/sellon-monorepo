import { cookies } from "next/headers";
import type { Me } from "@/lib/auth-types";
import type { GatedFeature } from "@/lib/types";

const SESSION_COOKIE = "sellon_session";

function apiBase() {
  return (
    process.env.API_INTERNAL_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    "http://localhost:8080"
  );
}

// Server-side plan lookup for gating server-component pages. Returns the
// active subscription tier ("free" | "pro" | "bisnis"), defaulting to "free"
// when there's no session/store or the API is unreachable.
export async function getPlan(): Promise<"free" | "pro" | "bisnis"> {
  const c = await cookies();
  const token = c.get(SESSION_COOKIE)?.value;
  if (!token) return "free";
  try {
    const res = await fetch(`${apiBase()}/api/v1/subscription`, {
      headers: { Cookie: `${SESSION_COOKIE}=${token}` },
      cache: "no-store",
    });
    if (!res.ok) return "free";
    const data = (await res.json()) as { subscription?: { plan?: string } };
    const plan = data?.subscription?.plan;
    return plan === "pro" || plan === "bisnis" ? plan : "free";
  } catch {
    return "free";
  }
}

/**
 * Server-side feature check for gating server-component pages.
 *
 * Pages used to ask `getPlan() !== "bisnis"`, which was right while a tier
 * decided everything. Since features are sold as add-ons on top of Pro,
 * that check locked a store OUT of the very package it was being billed
 * for — the API granted `pos`, the page rendered "upgrade to Bisnis".
 *
 * The API is the single source of truth here: `subscription.features` is
 * computed from the plan AND the live add-ons, by the same code that
 * returns 402 on the endpoints.
 */
export async function hasFeature(feature: GatedFeature): Promise<boolean> {
  return (await getFeatures()).includes(feature);
}

/** Every feature the current store can use right now. */
export async function getFeatures(): Promise<GatedFeature[]> {
  const c = await cookies();
  const token = c.get(SESSION_COOKIE)?.value;
  if (!token) return [];
  try {
    const res = await fetch(`${apiBase()}/api/v1/subscription`, {
      headers: { Cookie: `${SESSION_COOKIE}=${token}` },
      cache: "no-store",
    });
    if (!res.ok) return [];
    const data = (await res.json()) as {
      subscription?: { features?: GatedFeature[] };
    };
    return data?.subscription?.features ?? [];
  } catch {
    // Unreachable API locks the page rather than opening it. A seller
    // seeing an upsell for a moment is recoverable; the reverse is not.
    return [];
  }
}

// Server-side: read the session cookie and ask the API who we are.
// Returns null if no session, expired, or API unreachable.
export async function getMe(): Promise<Me | null> {
  const c = await cookies();
  const token = c.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  try {
    const res = await fetch(`${apiBase()}/api/v1/auth/me`, {
      headers: { Cookie: `${SESSION_COOKIE}=${token}` },
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as Me;
  } catch {
    return null;
  }
}
