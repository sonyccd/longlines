import { describe, expect, it } from "vitest";
import { FIPS_TO_POSTAL } from "./states";
import { STATE_SHAPES, stateName } from "./stateShapes";

describe("STATE_SHAPES", () => {
  it("has one path per state in the table", () => {
    expect(STATE_SHAPES).toHaveLength(51);
    expect(new Set(STATE_SHAPES.map((s) => s.code))).toEqual(new Set(Object.values(FIPS_TO_POSTAL)));
  });
  it("has a non-empty SVG path and a name for every state", () => {
    for (const s of STATE_SHAPES) {
      expect(s.d.length).toBeGreaterThan(10);
      expect(s.d.startsWith("M")).toBe(true);
      expect(s.name.length).toBeGreaterThan(0);
    }
  });
});

describe("stateName", () => {
  it("resolves known codes and falls back to the code", () => {
    expect(stateName("NC")).toBe("North Carolina");
    expect(stateName("DC")).toBe("District of Columbia");
    expect(stateName("ZZ")).toBe("ZZ");
  });
});
