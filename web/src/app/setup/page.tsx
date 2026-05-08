import { redirect } from "next/navigation";
import type { Metadata } from "next";

import { getMe } from "@/lib/server-auth";
import { serverApi } from "@/lib/server-api";
import type { Store } from "@/lib/types";
import { SetupWizard } from "@/components/onboarding/setup-wizard";

export const metadata: Metadata = { title: "Setup Toko — SellOn" };

export default async function SetupPage() {
  const me = await getMe();
  if (!me) redirect("/masuk");

  // If they already have a store, no need to be here.
  const data = await serverApi<{ store: Store | null }>("/api/v1/store");
  if (data?.store) redirect("/dasbor");

  const firstName = me.name.split(" ")[0] || "Juragan";

  return <SetupWizard firstName={firstName} email={me.email} />;
}
