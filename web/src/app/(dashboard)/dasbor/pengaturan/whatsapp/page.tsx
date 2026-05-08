import { serverApi } from "@/lib/server-api";
import { WhatsAppTemplatesForm } from "@/components/dashboard/wa-templates-form";

export const metadata = { title: "Template WhatsApp — SellOn" };

export default async function PengaturanWhatsAppPage() {
  const data = await serverApi<{ templates: Record<string, string> }>(
    "/api/v1/whatsapp-templates",
  );
  return <WhatsAppTemplatesForm initial={data?.templates ?? {}} />;
}
