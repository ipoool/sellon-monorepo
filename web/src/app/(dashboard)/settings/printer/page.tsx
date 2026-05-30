import { serverApi } from "@/lib/server-api";
import { getPlan } from "@/lib/server-auth";
import { PrinterSettingsForm } from "@/components/dashboard/printer-settings-form";
import { UpgradePrompt } from "@/components/ui/upgrade-prompt";

export const metadata = { title: "Pengaturan Printer — SellOn" };

type PrinterConfig = {
  method: "browser" | "bluetooth" | string;
  paper_width: "58" | "80" | string;
  auto_print: boolean;
  copies: number;
  header: string;
  footer: string;
};

export default async function PrinterSettingsPage() {
  if ((await getPlan()) !== "bisnis") {
    return <UpgradePrompt feature="Pengaturan Printer" />;
  }
  const res = await serverApi<{ config: PrinterConfig }>(
    "/api/v1/pos/printer/config",
  );
  const config: PrinterConfig = res?.config ?? {
    method: "browser",
    paper_width: "58",
    auto_print: false,
    copies: 1,
    header: "",
    footer: "",
  };

  return <PrinterSettingsForm initial={config} />;
}
