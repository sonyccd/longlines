import { describe, expect, it } from "vitest";
import statesTopology from "us-atlas/states-albers-10m.json";
import { FIPS_TO_POSTAL } from "./states";

// The atlas is the source of truth for which shapes exist. The SQL `states`
// CTE in refresh_stats_snapshot() and FIPS_TO_POSTAL must both cover exactly
// those, so the map never gets a key without a shape or a shape without a key.
const atlasIds = statesTopology.objects.states.geometries.map((g) => String(g.id)).sort();

// Migration sources, read at transform time by Vite so no Node APIs are needed.
const MIGRATIONS: Record<string, string> = import.meta.glob("../../../supabase/migrations/*.sql", {
  query: "?raw",
  import: "default",
  eager: true,
});

/** Postal codes listed in the `states` CTE of the newest migration that defines refresh_stats_snapshot(). */
function sqlStateCodes(): string[] {
  const file = Object.keys(MIGRATIONS)
    .sort()
    .filter((f) => MIGRATIONS[f]?.includes("function public.refresh_stats_snapshot()"))
    .at(-1);
  if (!file) throw new Error("no migration defines refresh_stats_snapshot()");
  const cte = /states as \(\s*select unnest\(array\[([^\]]*)\]\)/.exec(MIGRATIONS[file] ?? "");
  if (!cte?.[1]) throw new Error(`${file}: states CTE not found`);
  return [...cte[1].matchAll(/'([A-Z]{2})'/g)].map((m) => m[1] as string);
}

describe("FIPS_TO_POSTAL", () => {
  it("maps every atlas feature id exactly once, and nothing else", () => {
    expect(Object.keys(FIPS_TO_POSTAL).sort()).toEqual(atlasIds);
    const codes = Object.values(FIPS_TO_POSTAL);
    expect(new Set(codes).size).toBe(codes.length);
    expect(FIPS_TO_POSTAL["37"]).toBe("NC");
    expect(FIPS_TO_POSTAL["11"]).toBe("DC");
  });
  it("lists the same postal codes as the SQL states CTE", () => {
    expect(sqlStateCodes().sort()).toEqual(Object.values(FIPS_TO_POSTAL).sort());
  });
});
