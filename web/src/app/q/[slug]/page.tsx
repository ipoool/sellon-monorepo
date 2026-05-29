import { QueueDisplay } from "@/components/storefront/queue-display";

export const metadata = { title: "Antrian Pesanan" };

export default async function QueuePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <QueueDisplay slug={slug} />;
}
