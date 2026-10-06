import { assertEquals } from "@std/assert";
import { handleDeleteAccount } from "../handlers/delete_account.ts";
import { fakeSupabase, type FakeSupabaseOptions } from "./fake_supabase.ts";

function post(token: string | null = "jwt"): Request {
  const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
  return new Request("http://x/", { method: "POST", headers });
}

async function run(req: Request, options: FakeSupabaseOptions = {}) {
  const { client, calls } = fakeSupabase({ getUser: { data: { user: { id: "u1" } } }, ...options });
  const res = await handleDeleteAccount(req, { admin: () => client });
  return { res, body: res.status === 204 ? null : await res.json(), calls };
}

Deno.test("handleDeleteAccount answers preflight and rejects other methods", async () => {
  assertEquals((await run(new Request("http://x/", { method: "OPTIONS" }))).res.status, 204);
  assertEquals((await run(new Request("http://x/"))).res.status, 405);
});

Deno.test("handleDeleteAccount requires a signed-in user", async () => {
  const { res, calls } = await run(post(null));
  assertEquals(res.status, 401);
  assertEquals(calls.deleteUser, []);
});

Deno.test("handleDeleteAccount deletes the caller", async () => {
  const { res, body, calls } = await run(post());
  assertEquals(res.status, 200);
  assertEquals(body, { ok: true });
  assertEquals(calls.deleteUser, ["u1"]);
});

Deno.test("handleDeleteAccount returns 500 when Auth refuses", async () => {
  const { res, body } = await run(post(), { deleteUser: { error: { message: "nope" } } });
  assertEquals(res.status, 500);
  assertEquals(body, { error: "Couldn't delete your account. Try again." });
});
