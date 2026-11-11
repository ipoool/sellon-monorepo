import Link from "next/link";
import { Truck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

/**
 * Shown in place of the rate editor on Free.
 *
 * Says what the feature does rather than what tier it belongs to: a seller
 * who delivers by motorbike recognises their own problem in "antar sendiri",
 * not in the word "Pro".
 */
export function ShippingRatesUpsell() {
  return (
    <Card>
      <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-600">
            <Truck className="size-5" aria-hidden />
          </div>
          <div>
            <h2 className="font-semibold text-neutral-900">
              Mau pakai ongkir sendiri?
            </h2>
            <p className="mt-1 max-w-xl text-sm text-neutral-600">
              Antar sendiri dalam kota Rp 10.000, luar kota Rp 25.000, ambil di
              toko gratis — tentukan tarif kamu sendiri per area, tanpa kurir.
              Tersedia mulai paket Pro.
            </p>
          </div>
        </div>
        <Button asChild size="sm" className="shrink-0">
          <Link href="/settings/subscription">Lihat paket</Link>
        </Button>
      </div>
    </Card>
  );
}
