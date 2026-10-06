import { createServiceClient } from "../_shared/db.ts";
import { handleDeleteAccount } from "../_shared/handlers/delete_account.ts";

Deno.serve((req) => handleDeleteAccount(req, { admin: createServiceClient }));
