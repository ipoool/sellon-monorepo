import { redirect } from "next/navigation";

// Laporan and Analytics 360 were merged into a single page at /analytics
// ("Laporan & Analytics"). This route is kept as a permanent redirect so old
// links/bookmarks still work. The sub-route /reports/materials is unaffected.
export default function LaporanRedirect() {
  redirect("/analytics");
}
