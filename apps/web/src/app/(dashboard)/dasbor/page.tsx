import { redirect } from "next/navigation";

import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Container } from "@/components/layout/container";
import { Header } from "@/components/layout/header";
import { getMe } from "@/lib/server-auth";

const metrics = [
  { title: "Pesanan Hari Ini", value: "12", description: "+3 dari kemarin" },
  { title: "Total Pendapatan", value: "Rp 4,8 jt", description: "Bulan berjalan" },
  { title: "Produk Aktif", value: "37", description: "2 stok rendah" },
];

export default async function DasborPage() {
  const me = await getMe();
  if (!me) redirect("/masuk");

  const firstName = me.name.split(" ")[0] || "Juragan";

  return (
    <>
      <Header me={me} variant="app" />
      <main className="py-10 lg:py-14">
        <Container>
          <div className="mb-8">
            <h1 className="font-display text-3xl font-semibold tracking-tight text-neutral-900">
              Selamat Datang, {firstName}
            </h1>
            <p className="mt-1 text-neutral-600">
              Ringkasan toko-mu hari ini.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {metrics.map((m) => (
              <Card key={m.title}>
                <CardHeader>
                  <CardDescription>{m.title}</CardDescription>
                  <CardTitle className="text-3xl font-semibold tracking-tight">
                    {m.value}
                  </CardTitle>
                </CardHeader>
                <p className="text-sm text-neutral-500">{m.description}</p>
              </Card>
            ))}
          </div>
        </Container>
      </main>
    </>
  );
}
