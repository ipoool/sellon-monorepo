import { Truck, ExternalLink } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const metadata = { title: "Pengiriman — SellOn" };

export default function PengaturanPengirimanPage() {
  return (
    <Card className="py-12 text-center">
      <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-brand-50 text-brand-600">
        <Truck className="size-7" aria-hidden />
      </div>
      <div className="mt-4 flex items-center justify-center gap-2">
        <h2 className="font-display text-xl font-semibold text-neutral-900">
          Pengaturan Pengiriman
        </h2>
        <Badge variant="warning">Coming Soon</Badge>
      </div>
      <p className="mx-auto mt-2 max-w-md text-sm text-neutral-600">
        Konfigurasi kurir, ongkir berdasarkan zona, dan gratis ongkir akan
        tersedia setelah integrasi dengan{" "}
        <a
          href="https://rajaongkir.com"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 font-medium text-brand-700 hover:text-brand-800 hover:underline"
        >
          RajaOngkir.com
          <ExternalLink className="size-3" aria-hidden />
        </a>{" "}
        selesai.
      </p>
      <p className="mx-auto mt-4 max-w-md text-xs text-neutral-500">
        Untuk sementara, ongkir di checkout dihitung otomatis pakai tabel
        bawaan SellOn (JNE, J&T, SiCepat, AnterAja, GoSend, GrabExpress)
        berdasarkan kota toko-mu.
      </p>
    </Card>
  );
}
