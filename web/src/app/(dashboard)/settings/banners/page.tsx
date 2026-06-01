import { serverApi } from "@/lib/server-api";
import type { SellerBanner } from "@/lib/types";
import { SellerBannersManager } from "@/components/dashboard/seller-banners-manager";

export const metadata = { title: "Banner Toko — SellOn" };

export default async function BannerSettingsPage() {
  const data = await serverApi<{ banners: SellerBanner[] }>("/api/v1/store/banners");
  return <SellerBannersManager initial={data?.banners ?? []} />;
}
