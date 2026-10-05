import { assertEquals } from "@std/assert";
import { corsHeaders, preflightResponse } from "../cors.ts";

Deno.test("corsHeaders allow the browser to call functions with auth headers", () => {
  const h = corsHeaders();
  assertEquals(h["Access-Control-Allow-Origin"], "*");
  assertEquals(h["Access-Control-Allow-Headers"]?.includes("authorization"), true);
  assertEquals(h["Access-Control-Allow-Methods"]?.includes("POST"), true);
});

Deno.test("preflightResponse answers OPTIONS with 204 and the CORS headers", async () => {
  const res = preflightResponse(new Request("http://x/", { method: "OPTIONS" }));
  assertEquals(res?.status, 204);
  assertEquals(res?.headers.get("Access-Control-Allow-Origin"), "*");
  await res?.body?.cancel();
});

Deno.test("preflightResponse returns null for non-OPTIONS requests", () => {
  assertEquals(preflightResponse(new Request("http://x/", { method: "POST" })), null);
});
