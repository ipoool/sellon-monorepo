import { cookies } from "next/headers";

const SESSION_COOKIE = "sellon_session";

function apiBase() {
  return (
    process.env.API_INTERNAL_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    "http://localhost:8080"
  );
}

// Server-side fetch that forwards the session cookie to the API.
// Used by app pages (RSC) to call protected endpoints.
export async function serverApi<T>(
  path: string,
  init?: RequestInit & { tags?: string[] },
): Promise<T | null> {
  const c = await cookies();
  const token = c.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const res = await fetch(`${apiBase()}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Cookie: `${SESSION_COOKIE}=${token}`,
      ...(init?.headers || {}),
    },
    cache: "no-store",
  });
  if (!res.ok) return null;
  return (await res.json()) as T;
}

// Server-side fetch for public endpoints (no session required). Use this
// for SSR of marketing pages that need to call the API anonymously —
// e.g. landing page reading /api/v1/plans for pricing cards.
export async function publicServerApi<T>(
  path: string,
  init?: RequestInit,
): Promise<T | null> {
  const res = await fetch(`${apiBase()}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
    cache: "no-store",
  });
  if (!res.ok) return null;
  return (await res.json()) as T;
}
