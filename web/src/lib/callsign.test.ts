import { describe, expect, it } from "vitest";
import { isValidCallsign, normalizeCallsign } from "./callsign";

describe("normalizeCallsign", () => {
  it("uppercases and trims", () => {
    expect(normalizeCallsign("  kk4pwj ")).toBe("KK4PWJ");
  });
});

describe("isValidCallsign", () => {
  it("accepts common amateur formats", () => {
    for (const c of ["KK4PWJ", "W1AW", "G0VOF", "VE3KTB", "DL1XYZ", "JA1QRP", "2E0ABC", "KK4PWJ/P", "W1AW/M"]) {
      expect(isValidCallsign(c)).toBe(true);
    }
  });
  it("rejects strings that are not callsigns", () => {
    for (const c of ["", "NOTACALL", "123", "KK4", "kk4pwj!", "W1AW/", "ABCD1EFGHIJ"]) {
      expect(isValidCallsign(c)).toBe(false);
    }
  });
  it("validates the normalized form", () => {
    expect(isValidCallsign(" kk4pwj ")).toBe(true);
  });
});
