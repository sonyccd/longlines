import { createClient } from "@supabase/supabase-js";
import { createServiceClient } from "../_shared/db.ts";
import { handleSignIn } from "../_shared/handlers/sign_in.ts";

Deno.serve((req) =>
  handleSignIn(req, {
    admin: createServiceClient,
    anon: () =>
      createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_ANON_KEY") ?? "", {
        auth: { persistSession: false, autoRefreshToken: false },
      }),
  })
);
