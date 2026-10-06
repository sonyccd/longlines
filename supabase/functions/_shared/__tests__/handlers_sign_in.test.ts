import { assert, assertEquals, assertMatch } from "@std/assert";
import { EMAIL_NOT_CONFIRMED, handleSignIn, SIGN_IN_UNAVAILABLE } from "../handlers/sign_in.ts";
import { GENERIC_SIGN_IN_ERROR, MAX_ATTEMPTS_PER_WINDOW, signInErrorMessage } from "../signin.ts";
import { fakeSupabase, type FakeSupabaseOptions } from "./fake_supabase.ts";

function post(body: unknown): Request {
  return new Request("http://x/", {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const GOOD = { identifier: " kk4pwj ", password: "hunter22" };

async function run(
  req: Request,
  admin: FakeSupabaseOptions = {},
  anon: FakeSupabaseOptions = {},
) {
  const a = fakeSupabase({
    rpc: {
      record_sign_in_attempt: { data: 1 },
      email_for_identifier: { data: "kk4pwj@example.com" },
      ...admin.rpc,
    },
  });
  const b = fakeSupabase(anon);
  const res = await handleSignIn(req, { admin: () => a.client, anon: () => b.client });
  return { res, body: res.status === 204 ? null : await res.json(), admin: a.calls, anon: b.calls };
}

Deno.test("handleSignIn answers preflight and rejects other methods", async () => {
  const pre = await run(new Request("http://x/", { method: "OPTIONS" }));
  assertEquals(pre.res.status, 204);
  const get = await run(new Request("http://x/"));
  assertEquals(get.res.status, 405);
  assertEquals(get.admin.rpc, []);
});

Deno.test("handleSignIn rejects malformed bodies", async () => {
  assertEquals((await run(post("not json"))).res.status, 400);
  const missing = await run(post({ identifier: "x" }));
  assertEquals(missing.res.status, 400);
  assertEquals(missing.body, { error: "Send an identifier and a password." });
});

Deno.test("handleSignIn returns tokens for a valid callsign and password", async () => {
  const { res, body, admin, anon } = await run(post(GOOD), {}, {
    signInWithPassword: {
      data: { session: { access_token: "at", refresh_token: "rt", expires_in: 3600 } },
    },
  });
  assertEquals(res.status, 200);
  assertEquals(body, { access_token: "at", refresh_token: "rt", expires_in: 3600 });
  assertEquals(admin.rpc.map((c) => c.args), [{ p_identifier: "KK4PWJ" }, {
    p_identifier: "KK4PWJ",
  }]);
  assertEquals(anon.signInWithPassword, [{ email: "kk4pwj@example.com", password: "hunter22" }]);
});

Deno.test("handleSignIn still checks a password for unknown identifiers", async () => {
  const { res, body, anon } = await run(post(GOOD), {
    rpc: { email_for_identifier: { data: null } },
  }, { signInWithPassword: { error: { message: "Invalid login credentials" } } });
  assertEquals(res.status, 401);
  assertEquals(body, { error: GENERIC_SIGN_IN_ERROR });
  assertMatch(anon.signInWithPassword[0]!.email, /^unknown-.+@invalid$/);
});

Deno.test("handleSignIn returns 401 when auth gives no session", async () => {
  const { res } = await run(post(GOOD), {}, { signInWithPassword: { data: { session: null } } });
  assertEquals(res.status, 401);
});

Deno.test("handleSignIn explains unconfirmed emails", async () => {
  const { res, body } = await run(post(GOOD), {}, {
    signInWithPassword: { error: { message: "x", code: "email_not_confirmed" } },
  });
  assertEquals(res.status, 403);
  assertEquals(body, { error: EMAIL_NOT_CONFIRMED });
});

Deno.test("handleSignIn rate limits after too many attempts without checking the password", async () => {
  const attempts = MAX_ATTEMPTS_PER_WINDOW + 1;
  const { res, body, anon } = await run(post(GOOD), {
    rpc: { record_sign_in_attempt: { data: attempts } },
  });
  assertEquals(res.status, 429);
  assertEquals(body, { error: signInErrorMessage(attempts) });
  assertEquals(anon.signInWithPassword, []);
});

Deno.test("handleSignIn returns 500 when the attempt log or lookup fails", async () => {
  const log = await run(post(GOOD), {
    rpc: { record_sign_in_attempt: { error: { message: "down" } } },
  });
  assertEquals(log.res.status, 500);
  assertEquals(log.body, { error: SIGN_IN_UNAVAILABLE });

  const lookup = await run(post(GOOD), {
    rpc: { email_for_identifier: { error: { message: "down" } } },
  });
  assertEquals(lookup.res.status, 500);
  assert(lookup.anon.signInWithPassword.length === 0);
});
