/// <reference types="vitest/config" />
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  // Vite only exposes VITE_* variables to the browser. The Supabase/Vercel
  // integration provides SUPABASE_URL and SUPABASE_ANON_KEY (and NEXT_PUBLIC_
  // copies) instead, so map exactly those two public values onto the names the
  // app reads. Nothing else is read here; the service-role key in particular
  // must never reach the bundle.
  const env = { ...loadEnv(mode, process.cwd(), ""), ...process.env };
  const url = env.VITE_SUPABASE_URL ?? env.SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const anonKey = env.VITE_SUPABASE_ANON_KEY ?? env.SUPABASE_ANON_KEY ?? env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    env.SUPABASE_PUBLISHABLE_KEY ?? env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";
  if (!url || !anonKey) {
    console.warn("vite: SUPABASE_URL / SUPABASE_ANON_KEY (or VITE_ equivalents) are not set; the app will fail at startup.");
  }
  return {
    plugins: [react()],
    define: {
      "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(url),
      "import.meta.env.VITE_SUPABASE_ANON_KEY": JSON.stringify(anonKey),
    },
    test: {
      include: ["src/**/*.test.ts"],
    },
  };
});
