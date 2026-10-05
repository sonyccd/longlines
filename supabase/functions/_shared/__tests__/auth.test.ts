import { assertEquals } from "@std/assert";
import { bearerToken } from "../auth.ts";

Deno.test("bearerToken extracts the token from the Authorization header", () => {
  const req = new Request("http://x/", { headers: { Authorization: "Bearer abc.def.ghi" } });
  assertEquals(bearerToken(req), "abc.def.ghi");
});

Deno.test("bearerToken returns null when the header is missing or malformed", () => {
  assertEquals(bearerToken(new Request("http://x/")), null);
  assertEquals(
    bearerToken(new Request("http://x/", { headers: { Authorization: "Basic xyz" } })),
    null,
  );
  assertEquals(
    bearerToken(new Request("http://x/", { headers: { Authorization: "Bearer " } })),
    null,
  );
});
