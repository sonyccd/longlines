// Points web/.env.local at the local stack. Run automatically by `npm run supabase:start`.
//
// Only VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are written; every other line in the file
// (comments, SUPABASE_* values for a hosted project, anything else) is left as it was. Vite reads
// the VITE_ names first, so they win over any hosted values already in the file.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fail, localStatus, webRoot } from "./local-stack.ts";

const HEADER = `# Local development values. VITE_SUPABASE_* are rewritten by
# \`npm run supabase:setup-env\` from \`supabase status\`; other lines are kept.
`;

function upsert(content: string, values: Record<string, string>): string {
  const pending = new Map(Object.entries(values));
  const lines = content.split("\n").map((line) => {
    const key = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(line)?.[1];
    if (key === undefined || !pending.has(key)) return line;
    const value = pending.get(key);
    pending.delete(key);
    return `${key}=${value}`;
  });
  while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  for (const [key, value] of pending) lines.push(`${key}=${value}`);
  return `${lines.join("\n")}\n`;
}

let status;
try {
  status = localStatus();
} catch (error) {
  fail((error as Error).message);
}

const envPath = join(webRoot, ".env.local");
const before = existsSync(envPath) ? readFileSync(envPath, "utf8") : HEADER;
writeFileSync(
  envPath,
  upsert(before, {
    VITE_SUPABASE_URL: status.apiUrl,
    VITE_SUPABASE_ANON_KEY: status.anonKey,
  }),
);

console.log(`✓ web/.env.local now points at ${status.apiUrl}`);
console.log(`  Studio:       ${status.studioUrl}`);
console.log(`  Mail catcher: ${status.mailUrl}  (sign-up confirmations land here)`);
console.log("\nNext: `npm run dev:full` for the app plus Edge Functions.");
