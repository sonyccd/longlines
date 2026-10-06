// Sign in with a callsign or an email. Supabase Auth only knows emails, so the
// callsign is resolved server side with the service role; nothing here reveals
// whether an identifier exists.

import type { SupabaseClient } from "@supabase/supabase-js";
import { json, preflightResponse } from "../cors.ts";
import {
  GENERIC_SIGN_IN_ERROR,
  MAX_ATTEMPTS_PER_WINDOW,
  normalizeIdentifier,
  parseSignInBody,
  type SignInBody,
  signInErrorMessage,
} from "../signin.ts";

export const EMAIL_NOT_CONFIRMED = "Check your email to confirm your account first.";
export const SIGN_IN_UNAVAILABLE = "Sign-in is unavailable right now.";

export interface SignInDeps {
  /** Service-role client for the attempt log and the identifier lookup. */
  admin: () => SupabaseClient;
  /** Anon-key client that checks the password. */
  anon: () => SupabaseClient;
}

export async function handleSignIn(req: Request, deps: SignInDeps): Promise<Response> {
  const preflight = preflightResponse(req);
  if (preflight) return preflight;
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);

  let body: SignInBody;
  try {
    body = parseSignInBody(await req.json());
  } catch {
    return json({ error: "Send an identifier and a password." }, 400);
  }
  const identifier = normalizeIdentifier(body.identifier);

  const admin = deps.admin();
  const attempts = await admin.rpc("record_sign_in_attempt", { p_identifier: identifier });
  if (attempts.error) {
    console.error(`sign-in: attempt log failed: ${attempts.error.message}`);
    return json({ error: SIGN_IN_UNAVAILABLE }, 500);
  }
  if (typeof attempts.data === "number" && attempts.data > MAX_ATTEMPTS_PER_WINDOW) {
    return json({ error: signInErrorMessage(attempts.data) }, 429);
  }

  const lookup = await admin.rpc("email_for_identifier", { p_identifier: identifier });
  if (lookup.error) {
    console.error(`sign-in: lookup failed: ${lookup.error.message}`);
    return json({ error: SIGN_IN_UNAVAILABLE }, 500);
  }
  // Unknown identifiers still go through a password check so the response
  // time does not reveal whether the account exists.
  const email = typeof lookup.data === "string"
    ? lookup.data
    : `unknown-${crypto.randomUUID()}@invalid`;

  const { data, error } = await deps.anon().auth.signInWithPassword({
    email,
    password: body.password,
  });
  if (error?.code === "email_not_confirmed") return json({ error: EMAIL_NOT_CONFIRMED }, 403);
  if (error || !data.session) return json({ error: GENERIC_SIGN_IN_ERROR }, 401);

  return json({
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
    expires_in: data.session.expires_in,
  });
}
