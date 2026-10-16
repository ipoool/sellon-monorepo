import { serverApi } from "@/lib/server-api";

/**
 * Shape of GET /api/v1/admin/stats.
 *
 * One definition shared by the platform overview and the users/stores lists,
 * which all read the same endpoint — three copies of this type drifted the
 * moment the backend grew a field.
 */
export type AdminStats = {
  total_users: number;
  banned_users: number;
  users_this_month: number;
  total_stores: number;
  open_stores: number;
  stores_this_month: number;
  stores_selling: number;
  total_products: number;
  total_orders: number;
  orders_this_month: number;
  revenue_all_cents: number;
  revenue_month_cents: number;
  paid_subs_count: number;
};

const EMPTY: AdminStats = {
  total_users: 0,
  banned_users: 0,
  users_this_month: 0,
  total_stores: 0,
  open_stores: 0,
  stores_this_month: 0,
  stores_selling: 0,
  total_products: 0,
  total_orders: 0,
  orders_this_month: 0,
  revenue_all_cents: 0,
  revenue_month_cents: 0,
  paid_subs_count: 0,
};

/**
 * Fails soft to zeroes: a stats strip is context around the table it sits
 * above, so an unreachable endpoint should never take the page down with it.
 */
export async function getAdminStats(): Promise<AdminStats> {
  const data = await serverApi<{ stats: AdminStats }>("/api/v1/admin/stats");
  return data?.stats ?? EMPTY;
}
