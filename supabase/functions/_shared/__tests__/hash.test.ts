import { assertEquals, assertMatch, assertNotEquals } from "@std/assert";
import { contentHash } from "../hash.ts";

const fields = ["2026-10-05T13:37:03", "DL/HB9JNH", "DE-0858", "10123.9", "CW", "RBN 22 dB"];

Deno.test("contentHash is a 64-char lowercase sha256 hex string", async () => {
  assertMatch(await contentHash(fields), /^[0-9a-f]{64}$/);
});

Deno.test("contentHash is deterministic", async () => {
  assertEquals(await contentHash(fields), await contentHash([...fields]));
});

Deno.test("contentHash changes when any field changes", async () => {
  const base = await contentHash(fields);
  for (let i = 0; i < fields.length; i++) {
    const changed = [...fields];
    changed[i] = `${changed[i]}x`;
    assertNotEquals(await contentHash(changed), base, `field ${i} change not detected`);
  }
});

Deno.test("contentHash treats null and undefined as empty strings", async () => {
  assertEquals(await contentHash(["a", null, "c"]), await contentHash(["a", "", "c"]));
  assertEquals(await contentHash(["a", undefined, "c"]), await contentHash(["a", "", "c"]));
});

Deno.test("contentHash stringifies numbers as upstream sent them", async () => {
  assertEquals(await contentHash([7.097]), await contentHash(["7.097"]));
});

Deno.test("contentHash is the sha256 of the fields joined by newline", async () => {
  // printf 'a\nb' | shasum -a 256
  assertEquals(
    await contentHash(["a", "b"]),
    "7e18f737311b2dc3b2f269dd78396b0351f14fb66efa879f768cb23181883c78",
  );
});
