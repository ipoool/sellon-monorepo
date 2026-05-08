import { Header } from "@/components/layout/header";
import { Hero } from "@/components/home/hero";
import { Features } from "@/components/home/features";
import { Pricing } from "@/components/home/pricing";
import { getMe } from "@/lib/server-auth";

export default async function Home() {
  const me = await getMe();

  return (
    <>
      <Header me={me} />
      <main>
        <Hero />
        <Features />
        <Pricing />
      </main>
    </>
  );
}
