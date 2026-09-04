import { redirect } from "next/navigation";

import { serverApi } from "@/lib/server-api";
import type { Store, Subscription } from "@/lib/types";
import { CustomDomainForm } from "@/components/dashboard/custom-domain-form";

export const metadata = { title: "Custom Domain — SellOn" };

export default async function DomainSettingsPage() {
  const [storeData, subData] = await Promise.all([
    serverApi<{ store: Store | null }>("/api/v1/store"),
    serverApi<{ subscription: Subscription }>("/api/v1/subscription"),
  ]);

  const store = storeData?.store;
  if (!store) redirect("/settings/store");

  const plan = subData?.subscription?.plan ?? "free";
  const isBisnis = plan === "bisnis";

  // NEXT_PUBLIC_CNAME_TARGET is exposed to the client bundle so the DNS
  // instructions card renders the correct CNAME value without a round-trip.
  const cnameTarget =
    process.env.NEXT_PUBLIC_CNAME_TARGET ?? "cname.sellon.id";

  // Per-store ownership proof (TXT at _sellon-verify.<domain>). The API
  // derives it from the store id, so it only exists once a domain is set.
  // Read via a local shape instead of widening the shared `Store` type,
  // which is owned elsewhere.
  const domainProof = store as Store & {
    domain_verify_txt_name?: string;
    domain_verify_txt_value?: string;
  };

  return (
    <CustomDomainForm
      initial={store}
      isBisnis={isBisnis}
      cnameTarget={cnameTarget}
      verifyTxtName={domainProof.domain_verify_txt_name ?? ""}
      verifyTxtValue={domainProof.domain_verify_txt_value ?? ""}
    />
  );
}
