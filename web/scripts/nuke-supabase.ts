// Removes every Docker container, volume and network of this project's local Supabase stack.
// Use it when the stack is stuck or corrupted and `supabase stop` / `db reset` do not help.
// Only objects labelled with this project are touched; other projects' stacks keep running.
// All local data is lost. Run `npm run supabase:start` afterwards to rebuild from migrations.
import { spawnSync } from "node:child_process";
import { repoRoot } from "./local-stack.ts";

const LABEL = "label=com.supabase.cli.project=longlines";

function docker(args: string[]): string[] {
  const result = spawnSync("docker", args, { encoding: "utf8" });
  if (result.error) {
    console.error(`✗ could not run docker: ${result.error.message}`);
    process.exit(1);
  }
  return result.stdout.split("\n").filter(Boolean);
}

function removeAll(kind: string, list: string[], remove: string[]): void {
  const ids = docker([...list, "--filter", LABEL]);
  console.log(`\nRemoving ${kind}: ${ids.length === 0 ? "none found" : ids.length}`);
  for (const id of ids) {
    docker([...remove, id]);
    console.log(`  removed ${id}`);
  }
}

console.log("Stopping the local stack without a backup...");
spawnSync("supabase", ["stop", "--no-backup", "--workdir", repoRoot], { stdio: "inherit" });

removeAll("containers", ["ps", "-aq"], ["rm", "-f"]);
removeAll("volumes", ["volume", "ls", "-q"], ["volume", "rm", "-f"]);
removeAll("networks", ["network", "ls", "-q"], ["network", "rm"]);

console.log("\n✓ Local Supabase stack removed. Start fresh with `npm run supabase:start`.");
