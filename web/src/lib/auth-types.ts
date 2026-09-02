export type Me = {
  id: string;
  email: string;
  name: string;
  picture_url: string;
  role?: "user" | "admin";
  /** Store-level role for team members. "owner" for store owners, "admin"/"staff" for invited members. */
  store_role?: "owner" | "admin" | "staff";
  is_impersonated?: boolean;
  impersonator_id?: string;
  impersonator_email?: string;
};
