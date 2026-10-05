// Delete the calling user. Every user-owned row cascades from auth.users.

import { userFromRequest } from "../_shared/auth.ts";
import { json, preflightResponse } from "../_shared/cors.ts";
import { createServiceClient } from "../_shared/db.ts";

Deno.serve(async (req: Request): Promise<Response> => {
  const preflight = preflightResponse(req);
  if (preflight) return preflight;
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);

  const admin = createServiceClient();
  const user = await userFromRequest(req, admin);
  if (!user) return json({ error: "Sign in again to delete your account." }, 401);

  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) {
    console.error(`delete-account: ${error.message}`);
    return json({ error: "Couldn't delete your account. Try again." }, 500);
  }
  return json({ ok: true });
});
