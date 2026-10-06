// Fails when Edge Function line coverage drops below the threshold.
//
// `deno coverage` only reports modules a test loaded, so a source file no test
// imports would silently vanish from the total. This also fails when any
// module under supabase/functions is missing from the report, except the
// Deno.serve entrypoint shells and type-only files.
//
// Usage: deno run --allow-read scripts/check-coverage.ts <lcov.info> <min line %>

const [lcovPath, minArg] = Deno.args;
if (!lcovPath || !minArg) {
  console.error("usage: check-coverage.ts <lcov.info> <min line %>");
  Deno.exit(2);
}
const min = Number(minArg);

const ROOT = new URL("../supabase/functions/", import.meta.url).pathname;
const SKIP = [/\/__tests__\//, /^[^/]+\/index\.ts$/, /(^|\/)types\.ts$/];

let found = 0;
let hit = 0;
const reported = new Set<string>();
let current = "";
for (const line of (await Deno.readTextFile(lcovPath)).split("\n")) {
  if (line.startsWith("SF:")) current = line.slice(3);
  else if (line.startsWith("LF:")) found += Number(line.slice(3));
  else if (line.startsWith("LH:")) hit += Number(line.slice(3));
  else if (line === "end_of_record" && current.startsWith(ROOT)) {
    reported.add(current.slice(ROOT.length));
  }
}

async function* sources(dir: string, prefix = ""): AsyncGenerator<string> {
  for await (const entry of Deno.readDir(dir)) {
    const rel = prefix + entry.name;
    if (entry.isDirectory) yield* sources(`${dir}${entry.name}/`, `${rel}/`);
    else if (rel.endsWith(".ts")) yield rel;
  }
}

const missing: string[] = [];
for await (const rel of sources(ROOT)) {
  if (!SKIP.some((re) => re.test(rel)) && !reported.has(rel)) missing.push(rel);
}

const pct = found === 0 ? 0 : (hit / found) * 100;
console.log(`Edge Function line coverage: ${pct.toFixed(1)}% (${hit}/${found}, minimum ${min}%)`);
if (missing.length > 0) {
  console.error(`No test loads these modules:\n  ${missing.sort().join("\n  ")}`);
}
if (pct < min || missing.length > 0) Deno.exit(1);
