import { describe, expect, it } from "vitest";

// vite.config.ts bakes the public URL and anon key in at build time. CI tests
// run without them; a developer's web/.env.local supplies them.
const configured = Boolean(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY);

describe("supabase client", () => {
  it.runIf(!configured)("refuses to start without the public Supabase settings", async () => {
    await expect(import("./supabase")).rejects.toThrow("Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY");
  });

  it.runIf(configured)("exports a client for the configured project", async () => {
    const mod = await import("./supabase");
    expect(mod.SUPABASE_URL).toBe(import.meta.env.VITE_SUPABASE_URL);
    expect(typeof mod.supabase.from).toBe("function");
  });
});
