// Sign in with a callsign or an email. Supabase Auth only knows emails, so the
// callsign is resolved server side with the service role; nothing here reveals
// whether an identifier exists.

import { createClient } from "@supabase/supabase-js";
import { json, preflightResponse } from "../_shared/cors.ts";
import { createServiceClient } from "../_shared/db.ts";
import {
  GENERIC_SIGN_IN_ERROR,
  MAX_ATTEMPTS_PER_WINDOW,
  normalizeIdentifier,
  parseSignInBody,
  signInErrorMessage,
} from "../_shared/signin.ts";

const EMAIL_NOT_CONFIRMED = "Check your email to confirm your account first.";

Deno.serve(async (req: Request): Promise<Response> => {
  const preflight = preflightResponse(req);
  if (preflight) return preflight;
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);

  let body;
  try {
    body = parseSignInBody(await req.json());
  } catch {
    return json({ error: "Send an identifier and a password." }, 400);
  }
  const identifier = normalizeIdentifier(body.identifier);

  const admin = createServiceClient();
  const attempts = await admin.rpc("record_sign_in_attempt", { p_identifier: identifier });
  if (attempts.error) {
    console.error(`sign-in: attempt log failed: ${attempts.error.message}`);
    return json({ error: "Sign-in is unavailable right now." }, 500);
  }
  if (typeof attempts.data === "number" && attempts.data > MAX_ATTEMPTS_PER_WINDOW) {
    return json({ error: signInErrorMessage(attempts.data) }, 429);
  }

  const lookup = await admin.rpc("email_for_identifier", { p_identifier: identifier });
  if (lookup.error) {
    console.error(`sign-in: lookup failed: ${lookup.error.message}`);
    return json({ error: "Sign-in is unavailable right now." }, 500);
  }
  // Unknown identifiers still go through a password check so the response
  // time does not reveal whether the account exists.
  const email = typeof lookup.data === "string"
    ? lookup.data
    : `unknown-${crypto.randomUUID()}@invalid`;

  const anon = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const { data, error } = await anon.auth.signInWithPassword({ email, password: body.password });
  if (error?.code === "email_not_confirmed") return json({ error: EMAIL_NOT_CONFIRMED }, 403);
  if (error || !data.session) return json({ error: GENERIC_SIGN_IN_ERROR }, 401);

  return json({
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
    expires_in: data.session.expires_in,
  });
});
