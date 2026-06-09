import type { Metadata } from "next";

import { CourseViewer } from "@/components/storefront/course-viewer";

export const metadata: Metadata = {
  title: "Akses Kelas — SellOn",
  // Private buyer page — never index.
  robots: { index: false, follow: false },
};

// Focused "learning mode" layout — no marketing Header/Footer, just the course
// viewer on a clean full-height canvas.
export default async function CoursePage({
  params,
}: {
  params: Promise<{ slug: string; token: string }>;
}) {
  const { slug, token } = await params;
  return (
    <main className="min-h-svh bg-neutral-50">
      <CourseViewer slug={slug} token={token} />
    </main>
  );
}
