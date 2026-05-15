import { serverApi } from "@/lib/server-api";
import type { Store, Subscription } from "@/lib/types";
import { WhatsAppNotificationForm } from "@/components/dashboard/wa-notification-form";
import { WhatsAppTemplatesForm } from "@/components/dashboard/wa-templates-form";

export const metadata = { title: "WhatsApp — SellOn" };

export default async function PengaturanWhatsAppPage() {
  // Parallel fetch — three independent endpoints. Subscription is
  // needed to gate the notification form (Free tier doesn't get
  // outbound WA alerts).
  const [storeRes, templatesRes, subRes] = await Promise.all([
    serverApi<{ store: Store | null }>("/api/v1/store"),
    serverApi<{ templates: Record<string, string> }>(
      "/api/v1/whatsapp-templates",
    ),
    serverApi<{ subscription: Subscription }>("/api/v1/subscription"),
  ]);

  const plan = subRes?.subscription?.plan ?? "free";

  return (
    <div className="flex flex-col gap-6">
      <WhatsAppNotificationForm
        store={storeRes?.store ?? null}
        plan={plan}
      />
      <WhatsAppTemplatesForm
        initial={templatesRes?.templates ?? {}}
        plan={plan}
      />
    </div>
  );
}
