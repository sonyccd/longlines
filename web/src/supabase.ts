import { createClient } from "@supabase/supabase-js";
import type { Database } from "./lib/database.types";

export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error("Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (see .env.example).");
}

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY);
