import { redirect } from "next/navigation";

import { serverApi } from "@/lib/server-api";
import { hasFeature } from "@/lib/server-auth";
import type { ShippingRate, Store } from "@/lib/types";
import { PengirimanForm } from "@/components/dashboard/pengiriman-form";
import { ShippingRatesManager } from "@/components/dashboard/shipping-rates-manager";
import { ShippingRatesUpsell } from "@/components/dashboard/shipping-rates-upsell";

export const metadata = { title: "Pengiriman" };

export default async function PengaturanPengirimanPage() {
  const data = await serverApi<{ store: Store | null }>("/api/v1/store");
  const store = data?.store ?? null;
  if (!store) redirect("/settings/store");

  // Custom ongkir is Pro and up. Fetch the rates only when entitled: the
  // endpoint answers 402 otherwise, and a logged 402 on every page load is
  // noise that hides real ones.
  const canCustomShip = await hasFeature("custom_shipping");
  const rates = canCustomShip
    ? ((await serverApi<{ rates: ShippingRate[] }>("/api/v1/shipping-rates"))
        ?.rates ?? [])
    : [];

  // Ongkir Sendiri goes FIRST, above the courier settings it overrides.
  // It used to sit at the bottom, so the line explaining that it hides
  // the automatic couriers was read only after a seller had finished
  // toggling couriers that would never be used.
  const customRatesActive = rates.some((r) => r.is_active);

  return (
    <div className="flex flex-col gap-5">
      {canCustomShip ? (
        <ShippingRatesManager initial={rates} />
      ) : (
        <ShippingRatesUpsell />
      )}
      <PengirimanForm initial={store} customRatesActive={customRatesActive} />
    </div>
  );
}
