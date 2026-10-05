import type { SupabaseClient, User } from "@supabase/supabase-js";

/** The bearer token from the Authorization header, or null. */
export function bearerToken(req: Request): string | null {
  const header = req.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(\S+)$/i.exec(header);
  return match?.[1] ?? null;
}

/** The user behind the request's bearer token, verified with the Auth server, or null. */
export async function userFromRequest(req: Request, admin: SupabaseClient): Promise<User | null> {
  const token = bearerToken(req);
  if (!token) return null;
  const { data, error } = await admin.auth.getUser(token);
  return error ? null : data.user;
}
