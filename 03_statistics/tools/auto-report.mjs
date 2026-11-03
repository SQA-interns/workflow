// Hook command (Stop and SessionEnd): builds the post-run report by itself once the run has ended, so no second session and no human step
// are needed. Does nothing until run-log.json has an "end" (written by `stat.mjs phase 7 end`).
//   Stop        fires after every response: starts the measuring once (when `measuredAt` is still empty), in the background, after a short
//               wait so the transcript file is complete
//   SessionEnd  fires when the session closes: measures again, in the foreground, so the final transcript is what the report uses
// Output: 03_statistics/results/auto-report.log. Never fails the session and never blocks it for long.
// Configured in .claude/settings.json ("hooks"). MASTER COPY: 00_Analysis_Tool; the template holds an identical copy (sync-to-template.mjs).
import fs from "node:fs";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..", ".."), statsDir = path.join(root, "03_statistics");
const logFile = path.join(statsDir, "run-log.json"), resultsDir = path.join(statsDir, "results"), lock = path.join(statsDir, ".auto-report.lock");
const tool = path.join(here, "build-report.mjs");
const argEvent = process.argv.find((a) => a === "--worker" || a === "--sync");

function readLog() { try { return JSON.parse(fs.readFileSync(logFile, "utf8")); } catch { return null; } }
function measure(why) {
  fs.mkdirSync(resultsDir, { recursive: true });
  try { if (fs.existsSync(lock) && Date.now() - fs.statSync(lock).mtimeMs < 10 * 60 * 1000) return; fs.writeFileSync(lock, String(process.pid)); } catch { /* go on */ }
  const r = spawnSync(process.execPath, [tool, "--run", statsDir], { cwd: root, encoding: "utf8", timeout: 4 * 60 * 1000, windowsHide: true });
  fs.appendFileSync(path.join(resultsDir, "auto-report.log"), `\n=== ${new Date().toISOString()} ${why} exit ${r.status}\n${r.stdout || ""}${r.stderr || ""}`);
  try { fs.rmSync(lock, { force: true }); } catch { /* ignore */ }
}

if (argEvent === "--worker") {               // background child of the Stop hook; skips the work when SessionEnd measured in the meantime
  const started = Date.now();
  setTimeout(() => { try { const m = Date.parse((readLog() || {}).measuredAt || ""); if (!(m > started - 10000)) measure("Stop hook"); } catch { /* ignore */ } process.exit(0); }, 8000);
} else {
  let input = {};
  try { input = JSON.parse(fs.readFileSync(0, "utf8")); } catch { /* run by hand */ }
  const log = readLog(), event = input.hook_event_name || (argEvent === "--sync" ? "SessionEnd" : "Stop");
  if (!log || !log.end) process.exit(0);        // the run is not finished: nothing to measure
  if (event === "SessionEnd") { try { measure("SessionEnd hook"); } catch { /* ignore */ } process.exit(0); }
  if (log.measuredAt) process.exit(0);          // Stop after the first measuring: wait for SessionEnd
  const child = spawn(process.execPath, [fileURLToPath(import.meta.url), "--worker"], { cwd: root, detached: true, stdio: "ignore", windowsHide: true });
  child.unref();
  process.exit(0);
}
