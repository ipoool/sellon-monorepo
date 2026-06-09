import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { Eye, Pencil } from "lucide-react";

import { CoursePlayer, type CourseVideoView } from "@/components/storefront/course-player";
import { getMe } from "@/lib/server-auth";
import { serverApi } from "@/lib/server-api";
import type { Product } from "@/lib/types";

export const metadata = {
  title: "Preview Kursus — SellOn",
  robots: { index: false, follow: false },
};

// Seller-only preview of a course product: the real buyer course layout (playlist
// + player + description) WITHOUT the OTP gate. Store-scoped (GET /products/{id}
// only returns the seller's own product).
export default async function CoursePreviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const me = await getMe();
  if (!me) redirect("/login");

  const { id } = await params;
  const data = await serverApi<{ product: Product }>(`/api/v1/products/${id}`);
  const product = data?.product;
  if (!product || product.product_type !== "course") notFound();

  const videos: CourseVideoView[] = (product.course_videos ?? []).map((v) => ({
    title: v.title,
    youtube_id: v.youtube_id ?? "",
    description_md: v.description_md,
  }));

  // Buyers will see "berlaku sampai <date>"; in preview there's no purchase
  // date yet, so show the configured masa aktif as a duration.
  const unitLabel: Record<string, string> = { week: "minggu", month: "bulan", year: "tahun" };
  const av = product.access_validity_value ?? 0;
  const au = product.access_validity_unit ?? "lifetime";
  const accessNote =
    au !== "lifetime" && av > 0
      ? `Masa aktif: ${av} ${unitLabel[au] ?? au} sejak pembelian`
      : "Akses seumur hidup";

  return (
    <div className="min-h-svh bg-neutral-50">
      <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-amber-200 bg-amber-50 px-4 py-2.5">
        <span className="flex items-center gap-2 text-sm font-medium text-amber-800">
          <Eye className="size-4 shrink-0" aria-hidden />
          <span>Mode Preview — tampilan kelas seperti yang dilihat pembeli (tanpa login OTP).</span>
        </span>
        <Link
          href={`/products/${id}`}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-amber-300 bg-white px-2.5 py-1 text-xs font-medium text-amber-800 hover:bg-amber-100"
        >
          <Pencil className="size-3.5" aria-hidden />
          Edit kursus
        </Link>
      </div>
      <CoursePlayer productName={product.name} videos={videos} accessNote={accessNote} />
    </div>
  );
}
