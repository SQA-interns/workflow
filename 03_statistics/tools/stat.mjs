// Writes the facts of a run into 03_statistics/run-log.json with the real clock, so no timestamp is typed or estimated.
// Run from anywhere; the repository root is two folders above this file (03_statistics/tools/stat.mjs).
//
//   node 03_statistics/tools/stat.mjs init                       phase 0, first action: creates run-log.json, the unique run id,
//                                                                 start time and commit, transcript path, environment
//   node 03_statistics/tools/stat.mjs phase <0-7> start          phase boundary; a start also closes the previous phase
//   node 03_statistics/tools/stat.mjs phase <0-7> end            phase 7 end also sets the run end and the final commit
//   node 03_statistics/tools/stat.mjs wait start <cause> "<reason>" [decisionId]
//   node 03_statistics/tools/stat.mjs wait end [decisionId]      cause: decision | environment | approval | session | other
//   node 03_statistics/tools/stat.mjs status                     current phase and open waits
//
// Options: --force (overwrite a value that is already set), --transcript <file.jsonl> (init: use this session file).
// MASTER COPY: Run_Comparison_Report/analysis/stat.mjs; the template holds an identical copy (sync-to-template.mjs).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..", "..");
const statsDir = path.join(root, "03_statistics");
const logPath = path.join(statsDir, "run-log.json");
const templatePath = path.join(statsDir, "run-log.template.json");
const configPath = path.join(root, "01_input", "01_project", "00_setup", "run-config.md");
const args = process.argv.slice(2);
const force = args.includes("--force");
const pos = args.filter((a, i) => !a.startsWith("--") && args[i - 1] !== "--transcript");
const flagValue = (n) => { const i = args.indexOf(n); return i < 0 ? null : args[i + 1]; };
const CAUSES = ["decision", "environment", "approval", "session", "other"];
const now = () => new Date().toISOString().replace(/\.\d+Z$/, "Z");
const die = (m) => { console.error("stat.mjs: " + m); process.exit(1); };
const readLog = () => { if (!fs.existsSync(logPath)) die("run-log.json not found; run `stat.mjs init` first"); return JSON.parse(fs.readFileSync(logPath, "utf8").replace(/^﻿/, "")); };
const writeLog = (log) => { const tmp = logPath + ".tmp"; fs.writeFileSync(tmp, JSON.stringify(log, null, 2) + "\n"); fs.renameSync(tmp, logPath); };
const run = (cmd, a, opt = {}) => { const r = spawnSync(cmd, a, { encoding: "utf8", timeout: 8000, cwd: root, ...opt }); return r.error || r.status !== 0 ? null : (r.stdout || "").trim() || (r.stderr || "").trim(); };
const head = () => run("git", ["rev-parse", "HEAD"]);

function parseConfig() {
  const cfg = {};
  if (!fs.existsSync(configPath)) return cfg;
  for (const line of fs.readFileSync(configPath, "utf8").split(/\r?\n/)) { // a Windows clone has CRLF line endings
    const m = line.match(/^-\s*([^:]+):\s*(.*)$/);
    if (m) cfg[m[1].trim()] = m[2].trim().replace(/^\(.*\)$/, "").trim(); // "(hint text)" left in a line counts as empty
  }
  return cfg;
}
const slug = (s) => String(s || "").toLowerCase().replace(/^claude-/, "").replace(/[^a-z0-9.]+/g, "-").replace(/^-+|-+$/g, "");

function findTranscript() {
  const escaped = root.replace(/[^A-Za-z0-9]/g, "-").toLowerCase();
  const projects = path.join(os.homedir(), ".claude", "projects");
  if (!fs.existsSync(projects)) return null;
  const dirs = fs.readdirSync(projects).filter((d) => d.toLowerCase() === escaped);
  const files = dirs.flatMap((d) => fs.readdirSync(path.join(projects, d)).filter((f) => f.endsWith(".jsonl")).map((f) => path.join(projects, d, f)));
  files.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  return files[0] || null;
}

function toolVersions() {
  const probes = { node: ["node", ["--version"]], npm: ["npm", ["--version"]], git: ["git", ["--version"]], docker: ["docker", ["--version"]], java: ["java", ["-version"]], maven: ["mvn", ["--version"]], python: ["py", ["--version"]] };
  const out = {};
  for (const [k, [cmd, a]] of Object.entries(probes)) {
    let v = run(cmd, a, { shell: process.platform === "win32" });
    if (!v && k === "python") v = run("python3", ["--version"]) || run("python", ["--version"]);
    out[k] = v ? v.split("\n")[0].slice(0, 120) : null;
  }
  return out;
}

function init() {
  if (fs.existsSync(logPath) && !force) {
    const l = readLog();
    console.log(`already initialised: ${l.runId} (use --force to start over)`);
    return;
  }
  if (!fs.existsSync(templatePath)) die("run-log.template.json not found");
  const cfg = parseConfig();
  const log = JSON.parse(fs.readFileSync(templatePath, "utf8").replace(/^﻿/, ""));
  const t = new Date();
  const stamp = t.toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z").slice(0, 13) + "Z";
  const label = slug(cfg["Run label"]) || "run";
  const runId = [label, slug(cfg["Model"]) || "model", "t" + (cfg["Template version"] || "?"), stamp, crypto.randomBytes(2).toString("hex")].join("-").replace(/-+/g, "-");
  log.runId = runId;
  log.runLabel = cfg["Run label"] || null;
  log.model = cfg["Model"] || null;
  log.effort = cfg["Effort"] || null;
  log.templateVersion = cfg["Template version"] || null;
  // feature experiment: what kind of run this is (absent in older runs, which count as normal runs)
  log.experiment = { runType: cfg["Run type"] || "normal", feature: cfg["Feature"] || "none", baseRun: cfg["Base run"] || null };
  log.start = now();
  log.startCommit = head();
  if (cfg["Starting commit"] && log.startCommit && !log.startCommit.startsWith(cfg["Starting commit"])) log.startCommitNote = `run-config.md names ${cfg["Starting commit"]}, HEAD is ${log.startCommit.slice(0, 7)}`;
  const missing = ["Model", "Run label", "Operator", "Machine", "Plan", "Permission mode"].filter((k) => !cfg[k]);
  if (missing.length) console.log("warning: run-config.md has no value for: " + missing.join(", ") + " (fill them in and run `stat.mjs init --force`, or continue and record them by hand)");
  const tr = flagValue("--transcript") || findTranscript();
  log.transcript = tr || null;
  log.transcripts = tr ? [tr] : [];
  if (!tr) log.transcriptReason = "no session file found for this folder; set `transcript` by hand before the post-run step";
  log.environment = {
    operator: cfg["Operator"] || null, machine: cfg["Machine"] || null, plan: cfg["Plan"] || null, permissionMode: cfg["Permission mode"] || null,
    os: { platform: process.platform, release: os.release(), arch: os.arch() }, shell: process.env.SHELL || process.env.ComSpec || null,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, utcOffsetMin: -t.getTimezoneOffset(), tools: toolVersions(), capturedAt: now(),
    // read from the machine the run happens on (operator, machine, plan and permission mode above are only what run-config.md declares)
    host: { hostname: os.hostname(), account: os.userInfo().username, cpuModel: (os.cpus()[0] || {}).model || null, cpus: os.cpus().length, memoryGb: Math.round(os.totalmem() / 2 ** 30), workingDir: root },
  };
  writeLog(log);
  console.log(`run-log.json created\nrunId     ${runId}\nstart     ${log.start}\ncommit    ${log.startCommit || "(not a git repository yet)"}\ntranscript ${tr || "(none found)"}`);
  if (log.startCommitNote) console.log("note: " + log.startCommitNote);
  if (tr) console.log("note: the newest session file of this folder is assumed to be this session; correct `transcript` if you work in several sessions");
}

function phase() {
  const n = Number(pos[1]), which = pos[2];
  if (!Number.isInteger(n) || n < 0 || n > 7 || !["start", "end"].includes(which)) die("usage: phase <0-7> start|end");
  const log = readLog();
  const p = log.phases.find((x) => x.phase === n);
  if (!p) die("phase " + n + " not in run-log.json");
  const t = now();
  if (p[which] && !force) { console.log(`phase ${n} ${which} already set to ${p[which]} (use --force to overwrite)`); return; }
  p[which] = t;
  if (which === "start" && n > 0) {
    const prev = log.phases.find((x) => x.phase === n - 1);
    if (prev && prev.start && !prev.end) { prev.end = t; console.log(`phase ${n - 1} end ${t} (closed by phase ${n} start)`); }
  }
  if (which === "start" && n === 0 && !log.start) log.start = t;
  if (which === "end" && n === 7) { log.end = t; log.finalCommit = head(); console.log(`run end ${t}, final commit ${log.finalCommit || "-"}`); }
  writeLog(log);
  console.log(`phase ${n} ${which} ${t}`);
}

function wait() {
  const sub = pos[1];
  const log = readLog();
  log.humanInterventions ||= [];
  const t = now();
  if (sub === "start") {
    const cause = pos[2], reason = pos[3] || "", decisionId = pos[4] || null;
    if (!CAUSES.includes(cause)) die("cause must be one of: " + CAUSES.join(", "));
    if (log.humanInterventions.some((w) => !w.end)) die("a wait is already open; end it first with `wait end`");
    const open = [...log.phases].reverse().find((p) => p.start && !p.end);
    log.humanInterventions.push({ start: t, end: null, phase: open ? open.phase : null, cause, decisionId, reason });
    writeLog(log);
    console.log(`wait start ${t} (${cause}${decisionId ? ", " + decisionId : ""}, phase ${open ? open.phase : "?"})`);
  } else if (sub === "end") {
    const id = pos[2] || null;
    const w = [...log.humanInterventions].reverse().find((x) => !x.end && (!id || x.decisionId === id));
    if (!w) die("no open wait" + (id ? " for " + id : ""));
    w.end = t;
    writeLog(log);
    console.log(`wait end ${t} (${Math.round((Date.parse(t) - Date.parse(w.start)) / 6000) / 10} min)`);
  } else die('usage: wait start <cause> "<reason>" [decisionId] | wait end [decisionId]');
}

function status() {
  const log = readLog();
  const open = [...log.phases].reverse().find((p) => p.start && !p.end);
  console.log(`${log.runId}\nstart ${log.start}${log.end ? ", end " + log.end : ""}\ncurrent phase: ${open ? open.phase + " " + open.name : "none"}`);
  for (const p of log.phases) console.log(`  ${p.phase} ${p.name.padEnd(24)} ${p.start || "-"} ${p.end || "-"}`);
  const w = (log.humanInterventions || []).filter((x) => !x.end);
  console.log(w.length ? "open waits: " + w.map((x) => `${x.cause} since ${x.start}`).join("; ") : "no open waits");
}

const cmd = pos[0];
if (cmd === "init") init();
else if (cmd === "phase") phase();
else if (cmd === "wait") wait();
else if (cmd === "status") status();
else die("usage: init | phase <0-7> start|end | wait start|end ... | status");
