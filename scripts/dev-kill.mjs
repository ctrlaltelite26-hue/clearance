#!/usr/bin/env node
/**
 * Free local dev resources before `pnpm dev`.
 *
 * Two cleanup passes:
 *  1) Kill whatever is LISTENING on the dev ports (3000 web, 3001 api, 4001-4003 mocks).
 *  2) Kill orphaned clearance dev runtimes that bind NO port — most importantly the
 *     worker (apps/worker) and mocks watchers. These keep polling the database and
 *     holding Supabase pooler connections after a terminal is closed, which is the
 *     usual cause of "request timed out" / statement-timeout errors on restart.
 */
import { execSync } from "node:child_process";

const PORTS = [3000, 3001, 4001, 4002, 4003];

/** Command-line fragments that identify *our* dev processes (not unrelated node apps). */
const PROCESS_PATTERNS = [
  "clearance\\apps\\worker",
  "clearance/apps/worker",
  "clearance\\apps\\api",
  "clearance/apps/api",
  "clearance\\mocks",
  "clearance/mocks",
  "clearance\\apps\\web",
  "clearance/apps/web",
];

const isWin = process.platform === "win32";

function run(cmd) {
  try {
    return execSync(cmd, { encoding: "utf8" });
  } catch {
    return "";
  }
}

function kill(pid) {
  try {
    if (isWin) execSync(`taskkill /F /PID ${pid}`, { stdio: "ignore" });
    else process.kill(pid, "SIGKILL");
    console.log(`killed PID ${pid}`);
    return true;
  } catch {
    console.warn(`could not kill PID ${pid}`);
    return false;
  }
}

function pidsOnPort(port) {
  const pids = new Set();
  if (isWin) {
    const out = run(`netstat -ano | findstr ":${port} "`);
    for (const line of out.split(/\r?\n/)) {
      if (!line.includes("LISTENING")) continue;
      const parts = line.trim().split(/\s+/);
      const pid = Number(parts[parts.length - 1]);
      if (pid > 0) pids.add(pid);
    }
  } else {
    const out = run(`lsof -ti tcp:${port}`);
    for (const v of out.split(/\s+/)) {
      const pid = Number(v);
      if (pid > 0) pids.add(pid);
    }
  }
  return [...pids];
}

/** Find clearance dev runtimes by command line (catches port-less worker/mocks). */
function pidsByCommandLine() {
  const matches = new Set();
  const self = process.pid;
  if (isWin) {
    // CSV: "node.exe","<pid>",... ,"<commandline>"
    const out = run(
      `powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \\"name='node.exe'\\" | ForEach-Object { $_.ProcessId.ToString() + '|' + $_.CommandLine }"`,
    );
    for (const line of out.split(/\r?\n/)) {
      const sep = line.indexOf("|");
      if (sep < 0) continue;
      const pid = Number(line.slice(0, sep));
      const cmd = line.slice(sep + 1);
      if (!pid || pid === self) continue;
      if (PROCESS_PATTERNS.some((p) => cmd.includes(p))) matches.add(pid);
    }
  } else {
    const out = run("ps -axo pid=,command=");
    for (const line of out.split(/\r?\n/)) {
      const trimmed = line.trim();
      const sp = trimmed.indexOf(" ");
      if (sp < 0) continue;
      const pid = Number(trimmed.slice(0, sp));
      const cmd = trimmed.slice(sp + 1);
      if (!pid || pid === self) continue;
      if (PROCESS_PATTERNS.some((p) => cmd.includes(p))) matches.add(pid);
    }
  }
  return [...matches];
}

const killed = new Set();

console.log("Pass 1: ports");
for (const port of PORTS) {
  const fresh = pidsOnPort(port).filter((pid) => !killed.has(pid));
  if (fresh.length === 0) {
    console.log(`  port ${port}: free`);
    continue;
  }
  console.log(`  port ${port}: killing ${fresh.join(", ")}`);
  fresh.forEach((pid) => kill(pid) && killed.add(pid));
}

console.log("Pass 2: orphaned clearance runtimes (worker/mocks/api/web)");
const orphans = pidsByCommandLine().filter((pid) => !killed.has(pid));
if (orphans.length === 0) {
  console.log("  none found");
} else {
  console.log(`  killing ${orphans.join(", ")}`);
  orphans.forEach((pid) => kill(pid) && killed.add(pid));
}

console.log(`done — killed ${killed.size} process(es). Run pnpm dev`);
