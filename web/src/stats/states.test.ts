import { describe, expect, it } from "vitest";
import { FIPS_TO_POSTAL } from "./states";

const POSTAL = [
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "DC", "FL", "GA", "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME",
  "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ", "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI",
  "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY",
];

describe("FIPS_TO_POSTAL", () => {
  it("covers the 50 states and DC exactly once", () => {
    const codes = Object.values(FIPS_TO_POSTAL);
    expect(codes).toHaveLength(51);
    expect(new Set(codes).size).toBe(51);
    expect([...codes].sort()).toEqual([...POSTAL].sort());
  });
  it("uses two-digit FIPS keys", () => {
    for (const key of Object.keys(FIPS_TO_POSTAL)) expect(key).toMatch(/^\d{2}$/);
    expect(FIPS_TO_POSTAL["37"]).toBe("NC");
    expect(FIPS_TO_POSTAL["11"]).toBe("DC");
  });
});
