import { cookies } from "next/headers";
import type { Me } from "@/lib/auth-types";

const SESSION_COOKIE = "sellon_session";

function apiBase() {
  return (
    process.env.API_INTERNAL_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    "http://localhost:8080"
  );
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
