import { assertEquals, assertThrows } from "@std/assert";
import {
  GENERIC_SIGN_IN_ERROR,
  isEmailIdentifier,
  MAX_ATTEMPTS_PER_WINDOW,
  normalizeIdentifier,
  parseSignInBody,
  RATE_LIMIT_SUFFIX,
  signInErrorMessage,
} from "../signin.ts";

Deno.test("normalizeIdentifier uppercases callsigns and lowercases emails", () => {
  assertEquals(normalizeIdentifier("  kk4pwj "), "KK4PWJ");
  assertEquals(normalizeIdentifier(" Brad@Example.com "), "brad@example.com");
});

Deno.test("isEmailIdentifier keys on the @ sign", () => {
  assertEquals(isEmailIdentifier("a@b.c"), true);
  assertEquals(isEmailIdentifier("KK4PWJ"), false);
});

Deno.test("parseSignInBody requires non-empty identifier and password strings", () => {
  assertEquals(parseSignInBody({ identifier: "kk4pwj", password: "hunter22" }), {
    identifier: "kk4pwj",
    password: "hunter22",
  });
  assertThrows(() => parseSignInBody({ identifier: "", password: "x" }));
  assertThrows(() => parseSignInBody({ identifier: "x" }));
  assertThrows(() => parseSignInBody(null));
  assertThrows(() => parseSignInBody({ identifier: 5, password: "x" }));
});

Deno.test("signInErrorMessage is identical for unknown users and wrong passwords", () => {
  assertEquals(signInErrorMessage(1), GENERIC_SIGN_IN_ERROR);
  assertEquals(signInErrorMessage(MAX_ATTEMPTS_PER_WINDOW), GENERIC_SIGN_IN_ERROR);
});

Deno.test("signInErrorMessage adds the rate-limit suffix past the limit", () => {
  assertEquals(
    signInErrorMessage(MAX_ATTEMPTS_PER_WINDOW + 1),
    `${GENERIC_SIGN_IN_ERROR} ${RATE_LIMIT_SUFFIX}`,
  );
  assertEquals(MAX_ATTEMPTS_PER_WINDOW, 10);
});
