import { redirect } from "next/navigation";
import type { Metadata } from "next";

import { getMe } from "@/lib/server-auth";
import { serverApi } from "@/lib/server-api";
import type { Store } from "@/lib/types";
import { SetupWizard } from "@/components/onboarding/setup-wizard";
import { ImpersonationBanner } from "@/components/admin/impersonation-banner";

export const metadata: Metadata = { title: "Setup Toko — SellOn" };

export default async function SetupPage() {
  const me = await getMe();
  if (!me) redirect("/login");

  // Platform admins don't need a store. Send them to /platform
  // (unless they're currently impersonating a seller, in which case
  // treat them like a normal seller for the duration of that session).
  if (me.role === "admin" && !me.is_impersonated) redirect("/platform");

  // If they already have a store, no need to be here.
  const data = await serverApi<{ store: Store | null }>("/api/v1/store");
  if (data?.store) redirect("/dashboard");

  const firstName = me.name.split(" ")[0] || "Juragan";

  return (
    <>
      <ImpersonationBanner me={me} />
      <SetupWizard firstName={firstName} email={me.email} />
    </>
  );
}
