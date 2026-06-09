import type { Metadata } from "next";

import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { DigitalDownloadViewer } from "@/components/storefront/digital-download-viewer";

import { getMe } from "@/lib/server-auth";

type Params = Promise<{ token: string }>;

export const metadata: Metadata = {
  title: "Download Pesanan - SellOn",
  description: "Halaman akses produk digital kamu.",
};

// Digital downloads are now email-OTP gated (like courses): the delivery info
// lives behind the buyer's verified session, so this page is a thin shell —
// the client viewer handles OTP gate → fetch → delivery card. Header needs the
// seller session for its nav, so we still resolve `me` server-side.
export default async function DownloadPage({ params }: { params: Params }) {
  const { token } = await params;
  const me = await getMe();

  return (
    <>
      <Header me={me} />
      <main>
        <DigitalDownloadViewer token={token} />
      </main>
      <Footer />
    </>
  );
}
