// Runs the Vite dev server and `supabase functions serve` side by side with labelled output.
// `npm run dev:full` starts the stack and writes web/.env.local before calling this.
// Ctrl+C stops both; if either one exits, the other is stopped too.
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { repoRoot, webRoot } from "./local-stack.ts";

interface Task {
  label: string;
  color: number;
  cmd: string;
  args: string[];
  cwd: string;
}

const tasks: Task[] = [
  { label: "vite", color: 36, cmd: "npm", args: ["run", "dev"], cwd: webRoot },
  {
    label: "functions",
    color: 35,
    cmd: "supabase",
    args: ["functions", "serve", "--workdir", repoRoot],
    cwd: repoRoot,
  },
];

const width = Math.max(...tasks.map((task) => task.label.length));
const stops: Array<() => void> = [];
let stopping = false;

function stopAll(code: number): void {
  if (stopping) return;
  stopping = true;
  process.exitCode = code;
  for (const stop of stops) stop();
}

for (const task of tasks) {
  const prefix = `\x1b[${task.color}m${task.label.padEnd(width)} │\x1b[0m `;
  const child = spawn(task.cmd, task.args, {
    cwd: task.cwd,
    env: { ...process.env, FORCE_COLOR: "1" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  stops.push(() => {
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGTERM");
  });
  for (const stream of [child.stdout, child.stderr]) {
    createInterface({ input: stream }).on("line", (line) => {
      process.stdout.write(`${prefix}${line}\n`);
    });
  }
  child.on("error", (error) => {
    process.stdout.write(`${prefix}could not start ${task.cmd}: ${error.message}\n`);
    stopAll(1);
  });
  child.on("exit", (code, signal) => {
    if (!stopping) {
      process.stdout.write(`${prefix}exited (${signal ?? code}); stopping the rest\n`);
    }
    stopAll(code ?? 0);
  });
}

process.on("SIGINT", () => stopAll(0));
process.on("SIGTERM", () => stopAll(0));
