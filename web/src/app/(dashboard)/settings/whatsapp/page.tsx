import { MessageCircle } from "lucide-react";

import { serverApi } from "@/lib/server-api";
import type { Store, Subscription } from "@/lib/types";
import { WhatsAppNotificationForm } from "@/components/dashboard/wa-notification-form";
import { Card } from "@/components/ui/card";

export const metadata = { title: "WhatsApp — SellOn" };

export default async function PengaturanWhatsAppPage() {
  // Subscription gates the notification form (Free tier doesn't get
  // outbound WA alerts).
  const [storeRes, subRes] = await Promise.all([
    serverApi<{ store: Store | null }>("/api/v1/store"),
    serverApi<{ subscription: Subscription }>("/api/v1/subscription"),
  ]);

  const plan = subRes?.subscription?.plan ?? "free";

  return (
    <div className="flex flex-col gap-6">
      <WhatsAppNotificationForm store={storeRes?.store ?? null} plan={plan} />

      {/* Template editing is temporarily disabled — messages use the platform
          default format. Will return once official WhatsApp (Meta-approved
          templates) integration is ready. */}
      <Card>
        <div className="flex items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
            <MessageCircle className="size-5" aria-hidden />
          </div>
          <div>
            <h2 className="font-semibold text-neutral-900">
              Template Pesan WhatsApp
            </h2>
            <p className="mt-1 text-sm text-neutral-500">
              Untuk sementara, template pesan WhatsApp memakai format default
              platform dan belum bisa diubah. Kustomisasi template akan tersedia
              kembali setelah integrasi WhatsApp resmi (template approved Meta)
              siap.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
