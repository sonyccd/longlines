import { describe, expect, it } from "vitest";
import { MODES, modeLabel } from "./sources";

describe("modeLabel", () => {
  it("labels the digital family as Any digital", () => {
    expect(modeLabel("digital")).toBe("Any digital");
  });

  it("uppercases a specific mode", () => {
    expect(modeLabel("ft8")).toBe("FT8");
  });
});

describe("MODES", () => {
  it("offers the digital family first", () => {
    expect(MODES[0]).toBe("digital");
  });
});
