import { assertEquals } from "@std/assert";
import { canonicalMode, modeFamily, modeHintFromComment, resolveMode } from "../modes.ts";

Deno.test("canonicalMode lowercases, trims and removes spaces and hyphens", () => {
  assertEquals(canonicalMode(" CW "), "cw");
  assertEquals(canonicalMode("FT-8"), "ft8");
  assertEquals(canonicalMode("PSK 31"), "psk31");
});

Deno.test("canonicalMode keeps generic labels as-is", () => {
  assertEquals(canonicalMode("DATA"), "data");
});

Deno.test("canonicalMode returns null for missing or blank input", () => {
  assertEquals(canonicalMode(""), null);
  assertEquals(canonicalMode("  "), null);
  assertEquals(canonicalMode(null), null);
  assertEquals(canonicalMode(undefined), null);
});

Deno.test("modeHintFromComment finds a specific digital mode named in the comment", () => {
  assertEquals(modeHintFromComment("FT8 QRP"), "ft8");
  assertEquals(modeHintFromComment("[SOTA Activator] ft-8 now"), "ft8");
  assertEquals(modeHintFromComment("trying PSK31 then RTTY"), "psk31");
  assertEquals(modeHintFromComment("JS8Call tonight"), null);
});

Deno.test("modeHintFromComment returns null when nothing is named", () => {
  assertEquals(modeHintFromComment("cq POTA"), null);
  assertEquals(modeHintFromComment(""), null);
});

Deno.test("resolveMode replaces a generic digital label with the comment hint", () => {
  assertEquals(resolveMode("DATA", "FT8 QRP"), "ft8");
  assertEquals(resolveMode("DIGI", "ft4 on 14.080"), "ft4");
});

Deno.test("resolveMode keeps a generic label when the comment has no hint", () => {
  assertEquals(resolveMode("DATA", "[SOTA Activator] QRP"), "data");
});

Deno.test("resolveMode fills a blank mode from the comment hint", () => {
  assertEquals(resolveMode("", "FT8"), "ft8");
  assertEquals(resolveMode(null, "cq POTA"), null);
});

Deno.test("resolveMode never overrides an explicit specific mode", () => {
  assertEquals(resolveMode("SSB", "FT8 later"), "ssb");
  assertEquals(resolveMode("FT4", "was on FT8"), "ft4");
});

Deno.test("modeFamily classifies cw, phone and digital modes", () => {
  assertEquals(modeFamily("cw"), "cw");
  assertEquals(modeFamily("ssb"), "phone");
  assertEquals(modeFamily("fm"), "phone");
  assertEquals(modeFamily("am"), "phone");
  assertEquals(modeFamily("ft8"), "digital");
  assertEquals(modeFamily("ft4"), "digital");
  assertEquals(modeFamily("data"), "digital");
  assertEquals(modeFamily("rtty"), "digital");
  assertEquals(modeFamily("psk31"), "digital");
});

Deno.test("modeFamily returns null for unknown or missing modes", () => {
  assertEquals(modeFamily("other"), null);
  assertEquals(modeFamily(null), null);
});
