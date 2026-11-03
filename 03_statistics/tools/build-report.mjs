// Builds the run report(s). Node 20+, no dependencies. MASTER COPY: Run_Comparison_Report/analysis; the project template holds an
// identical copy in 03_statistics/tools/ (sync-to-template.mjs).
//
//   node build-report.mjs [runs.config.json] [output.html]
//       compare many runs: reads each run's run-log.json, transcripts and git history. The config lists runs by hand (`runs`)
//       and/or finds them (`scan`: folders searched up to 3 levels deep for <run>/03_statistics/run-log.json; `exclude`: folder names to skip).
//       Runs without an `end` (still running) or without a run id are skipped with a note. Default output: ./output/run-comparison.html
//
//   node build-report.mjs --run <03_statistics folder> [--no-write] [--no-md] [--no-backup] [--out file.html]
//       one run, at the end of a run (the project template, post-run session). It
//         1. measures the run (transcripts, sub-agents, git) and stores time, usage, environment and commits in run-log.json,
//         2. backs up the transcripts to <03_statistics>/data/ (committed with the run),
//         3. writes everything it generated to <03_statistics>/results/:
//            run-report.html, measurements.json, usage-summary.md, commits.csv, transcript.md (needs Python 3),
//         (every number comes from the session transcript and the run-log: nothing is typed or copied by hand)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { analyse, findTranscriptFiles } from "./transcript-analysis.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flag = (name) => { const i = args.indexOf(name); return i < 0 ? null : args[i + 1]; };
const runDir = flag("--run");
const valueFlags = new Set(["--run", "--out"]);
const positional = args.filter((a, i) => !a.startsWith("--") && !valueFlags.has(args[i - 1]));
const readJson = (f) => JSON.parse(fs.readFileSync(f, "utf8").replace(/^﻿/, ""));
const r1 = (x) => (x == null ? null : Math.round(x * 10) / 10);
const r2 = (x) => (x == null ? null : Math.round(x * 100) / 100);
const num = (x) => (typeof x === "number" && Number.isFinite(x) ? x : null);
const fmtMin = (m) => (m == null ? "–" : m >= 120 ? `${Math.floor(m / 60)} h ${String(Math.round(m % 60)).padStart(2, "0")} min` : `${Math.round(m)} min`);

// ---------------------------------------------------------------- post-run helpers (--run mode)
function exportTranscriptMd(transcript, outFile) {
  const script = path.join(here, "claude_chat_to_md.py");
  if (!fs.existsSync(script)) return "claude_chat_to_md.py not found next to build-report.mjs";
  if (!transcript || !fs.existsSync(transcript)) return "transcript .jsonl not found";
  const id = path.basename(transcript).replace(/\.jsonl$/i, "");
  for (const py of [["py"], ["python3"], ["python"]]) {
    const probe = spawnSync(py[0], ["--version"], { encoding: "utf8" });
    if (probe.error || probe.status !== 0) continue;
    const r = spawnSync(py[0], [script, id, "-o", outFile], { encoding: "utf8" });
    if (r.status === 0 && fs.existsSync(outFile)) return null;
    return "claude_chat_to_md.py failed: " + String(r.stderr || r.error || "").trim().split("\n").pop();
  }
  return "Python 3 not found (tried py, python3, python)";
}

// Copies the session files and their sub-agent files into <03_statistics>/data/. Everything the measuring needs is then in the repository.
function backupTranscripts(dataDir, files) {
  const done = [];
  let bytes = 0;
  fs.mkdirSync(dataDir, { recursive: true });
  const copy = (src, dest) => {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    if (!fs.existsSync(dest) || fs.statSync(dest).size !== fs.statSync(src).size) fs.copyFileSync(src, dest);
    bytes += fs.statSync(dest).size;
    done.push(path.relative(path.dirname(dataDir), dest).split(path.sep).join("/"));
  };
  for (const f of files.main) copy(f, path.join(dataDir, path.basename(f)));
  for (const f of files.sub) copy(f, path.join(dataDir, path.basename(path.dirname(path.dirname(f))), "subagents", path.basename(f)));
  return { files: done, megabytes: r1(bytes / 1048576) };
}

const modelRow = (m, u) => `${m}: input ${u.inputTokens.toLocaleString("en-US")}, output ${u.outputTokens.toLocaleString("en-US")}, cache read ${u.cacheReadTokens.toLocaleString("en-US")}, cache write ${u.cacheWriteTokens.toLocaleString("en-US")}${u.costUsd != null ? ` ($${u.costUsd.toFixed(2)})` : ""}`;

function usageTable(u, t, pd) {
  return [
    "| Item | Value |", "|---|---|",
    "| Cost (calculated from tokens and the prices in usage.md) | $" + u.costUsd.toFixed(2) + " ($" + u.costUsdExclWaits.toFixed(2) + " without the cache rebuilds caused by waits) |",
    "| Model calls / tool calls | " + u.modelCalls + " / " + (u.toolCalls?.total ?? "–") + " |",
    "| Model time / tool time / agent time | " + fmtMin(t.modelMin) + " / " + fmtMin(t.toolMin) + " / " + fmtMin(t.agentMin) + " |",
    "| Session wall time | " + fmtMin(t.wallMin) + " |",
    "| Share of the cost at over 150k context | " + (u.context?.costPctOver150k ?? "–") + " % |",
    "| Context per call (average / peak) | " + Math.round((u.context?.avgTokens || 0) / 1000) + "k / " + Math.round((u.context?.peakTokens || 0) / 1000) + "k |",
    "| Approval prompts that needed a human | " + (pd && pd.total ? pd.byHuman + " (of " + pd.total + " permission decisions; " + pd.rejected + " rejected)" : "not recorded") + " |",
  ];
}

function usageSummaryMd(r, log) {
  const u = r.usage, t = r.time || {}, pd = r.environment?.permissionDecisions;
  const L = ["# Usage summary (generated)", "", "> Written by `tools/build-report.mjs` from the session transcript · Run: " + log.runId, ""];
  if (!u) return L.concat(["No transcript was found, so there is no usage to summarise. Put the path of the session file in `run-log.json` → `transcript` and run the report again."]).join("\n");
  L.push(...usageTable(u, t, pd), "", "## Tokens per model", "", ...Object.entries(u.models || {}).map(([m, x]) => "- " + modelRow(m, x)), "");
  return L.join("\n");
}

// run-summary.md: the sections between <!-- auto:NAME --> markers are written here, after the run, so the agent never has to guess
// them (its own last commit comes before this report). Anything outside the markers stays as the agent wrote it.
function fillSummary(file, r, log) {
  if (!fs.existsSync(file)) return { filled: [], missing: [] };
  let text = fs.readFileSync(file, "utf8");
  const t = r.time || {}, cs = r.commitSummary, filled = [], missing = [];
  const sha = (s) => (s ? String(s).slice(0, 7) : "not set");
  const blocks = {};
  blocks.run = ["| Item | Value |", "|---|---|",
    "| Run id | " + log.runId + " |", "| Model, effort | " + [log.model, log.effort].filter(Boolean).join(", ") + " |", "| Template version | " + (log.templateVersion ?? "–") + " |", "| Run type, feature, base run | " + [log.experiment?.runType || "normal", log.experiment?.feature || "none", log.experiment?.baseRun || "–"].join(", ") + " |",
    "| Start commit | " + sha(log.startCommit) + " |", "| End commit | " + sha(log.finalCommit) + " |", "| Start, end | " + (log.start ?? "–") + ", " + (log.end ?? "–") + " |"];
  const rows = (t.byPhase || []).map((p) => "| " + p.phase + " " + (p.name || "") + " | " + fmtMin(p.wallMin) + " | " + fmtMin(p.waitMin) + " | " + fmtMin(p.agentMin) + " |");
  blocks.time = ["| Phase | Wall | Waiting for the human | Agent time |", "|---|---|---|---|", ...rows,
    "| **Total** | **" + fmtMin(t.wallMin) + "** | **" + fmtMin(t.humanWaitMin) + "** | **" + fmtMin(t.agentMin) + "** |", "",
    "Waits over one hour: " + (t.waitsOver60Min ? t.waitsOver60Min + " (see the report)" : "none") + "."];
  blocks.commits = cs && cs.count ? ["| Measure | Value |", "|---|---|",
    "| Commits | " + cs.count + " (" + Object.entries(cs.byType || {}).map(([k, v]) => k + " " + v).join(", ") + ") |",
    "| Changed lines per commit: median / 90th percentile / largest | " + cs.linesMedian + " / " + cs.linesP90 + " / " + cs.linesMax + " |",
    "| Files per commit (median) | " + cs.filesMedian + " |",
    "| Over the size guide / mixing concerns / in a burst | " + cs.pctOversize + " % / " + cs.pctMixed + " % / " + cs.pctBurst + " % |",
    "| Subject follows the format and the 72-character limit | " + cs.pctMessageOk + " % |",
    "| Active minutes between commits (median / longest gap) | " + cs.activeMinPerCommitMedian + " / " + cs.longestActiveGapMin + " |",
    "| Cost per commit (median) / per 100 changed lines | " + (cs.costPerCommitMedian != null ? "$" + cs.costPerCommitMedian : "–") + " / " + (cs.costPer100Lines != null ? "$" + cs.costPer100Lines : "–") + " |"]
    : ["The commits could not be read (no git history between the start and the end commit)."];
  blocks.usage = r.usage ? usageTable(r.usage, t, r.environment?.permissionDecisions) : ["No transcript was found, so there is no usage to report."];
  for (const [name, lines] of Object.entries(blocks)) {
    const re = new RegExp("<!-- auto:" + name + " -->[\\s\\S]*?<!-- /auto:" + name + " -->");
    if (!re.test(text)) { missing.push(name); continue; }
    text = text.replace(re, () => "<!-- auto:" + name + " -->\n" + lines.join("\n") + "\n<!-- /auto:" + name + " -->");
    filled.push(name);
  }
  if (filled.length) fs.writeFileSync(file, text);
  return { filled, missing };
}

function commitsCsv(commits) {
  const esc = (s) => `"${String(s).replace(/"/g, '""')}"`;
  const head = ["hash", "time", "phase", "type", "files", "lines", "categories", "mixed", "oversize", "burst", "messageOk", "ids", "activeMinutesSincePrev", "modelCalls", "costUsdSincePrev", "subject"];
  return [head.join(","), ...commits.map((c) => [c.hash, c.time, c.phase, c.type || "", c.files, c.lines, esc(Object.entries(c.categories).map(([k, v]) => `${k}:${v}`).join(" ")), c.mixed, c.oversize, c.burst, c.messageOk, esc(c.ids.join(" ")), c.activeMinutesSincePrev, c.modelCalls, c.costUsdSincePrev, esc(c.subject)].join(","))].join("\n") + "\n";
}

let config, outPath;
if (runDir) {
  const statsDir = path.resolve(runDir), logPath = path.join(statsDir, "run-log.json");
  if (!fs.existsSync(logPath)) { console.error(`no run-log.json in ${statsDir}`); process.exit(1); }
  const log = readJson(logPath);
  const usageMd = path.join(statsDir, "usage.md"), resultsDir = path.join(statsDir, "results"), dataDir = path.join(statsDir, "data");
  fs.mkdirSync(resultsDir, { recursive: true });
  const r = analyse({ logPath, usageMdPath: usageMd, detail: false });
  for (const n of r.notes) console.log("note:", n);
  // 1. backup: the .jsonl files stay in the repository, so the measuring can be repeated on any machine
  let backup = null;
  if (!args.includes("--no-backup") && r.files.main.length) {
    backup = backupTranscripts(dataDir, r.files);
    console.log(`backup: ${backup.files.length} transcript file(s), ${backup.megabytes} MB in ${path.relative(process.cwd(), dataDir) || dataDir}`);
  }
  // 2. run-log.json
  if (!args.includes("--no-write")) {
    log.time = r.time;
    if (r.usage) log.usage = { ...(log.usage || {}), ...r.usage };
    if (r.environment) log.environment = { ...(log.environment || {}), ...r.environment };
    if (r.commits) { log.commits = r.commits; log.commitSummary = r.commitSummary; }
    if (backup) log.transcriptBackup = backup.files;
    log.measuredAt = new Date().toISOString();
    fs.writeFileSync(logPath, JSON.stringify(log, null, 2) + "\n");
    console.log(`run-log.json updated: agent ${r.time.agentMin} min, wait ${r.time.humanWaitMin} min` + (r.usage ? `, cost ${r.usage.costUsd} (${r.usage.costUsdExclWaits} excl. waits)` : ", no usage (no transcript)"));
    if (r.commitSummary?.count != null) console.log(`commits: ${r.commitSummary.count} between ${r.commitSummary.range}`);
  }
  // 3. results
  fs.writeFileSync(path.join(resultsDir, "measurements.json"), JSON.stringify({ generatedAt: new Date().toISOString(), runId: log.runId, time: r.time, usage: r.usage, environment: { ...(log.environment || {}), ...(r.environment || {}) }, commits: r.commits, commitSummary: r.commitSummary, notes: r.notes, transcripts: { main: r.files.main, subagents: r.files.sub, backup: backup?.files || null } }, null, 2) + "\n");
  fs.writeFileSync(path.join(resultsDir, "usage-summary.md"), usageSummaryMd(r, log));
  const sum = fillSummary(path.join(statsDir, "run-summary.md"), r, log);
  if (sum.filled.length) console.log("run-summary.md filled: " + sum.filled.join(", "));
  if (sum.missing.length) console.log("note: run-summary.md has no marker for: " + sum.missing.join(", ") + " (older template or markers removed)");
  if (r.commits) fs.writeFileSync(path.join(resultsDir, "commits.csv"), commitsCsv(r.commits));
  if (!args.includes("--no-md")) {
    const why = exportTranscriptMd(r.files.main[0], path.join(resultsDir, "transcript.md"));
    console.log(why ? "note: transcript.md not written: " + why : "transcript.md written");
  }
  outPath = path.resolve(flag("--out") || path.join(resultsDir, "run-report.html"));
  config = { title: "Run report: " + (log.runLabel || log.runId || "run"), subtitle: `Run ID ${log.runId || "?"} · Template ${log.templateVersion || "?"}, ${log.model || "model ?"}, effort ${log.effort || "?"}. Human waiting and everything it caused is excluded from every figure that is compared.`,
    rebuildBaselineCacheWriteTokens: 550000, runs: [{ label: log.runLabel || log.runId || "this run", series: seriesOf(log), template: String(log.templateVersion || ""), statsDir }], excluded: [], single: true };
} else {
  const configPath = path.resolve(positional[0] || path.join(here, "runs.config.json"));
  config = readJson(configPath);
  outPath = path.resolve(positional[1] || path.join(here, "output", "run-comparison.html"));
  config.runs = [...(config.runs || []), ...scanRuns(config, path.dirname(configPath))];
}
if (!config.runs.length) { console.log("no finished runs found (scan: " + JSON.stringify(config.scan || []) + "); nothing written"); process.exit(0); }
const catalog = readJson(path.join(here, "metrics-catalog.json"));

// ---------------------------------------------------------------- finding runs (config.scan)
// Feature experiment: runs are grouped by run type and feature; runs without `experiment` keep the template version as series.
function seriesOf(log) {
  const e = log.experiment;
  if (!e || !e.runType) return String(log.templateVersion || "run");
  return e.feature && e.feature !== "none" ? `${e.runType} ${e.feature}` : e.runType;
}

// Oracle results (hidden oracle of the feature experiment), copied by the operator to results/oracle/ after the run.
function readOracle(statsDir) {
  const f = path.join(statsDir, "results", "oracle", "oracle-summary.json");
  if (!fs.existsSync(f)) return null;
  try { return readJson(f); } catch { return null; }
}

function scanRuns(cfg, base) {
  const out = [], seen = new Set((cfg.runs || []).map((r) => r.label));
  const skip = new Set(["node_modules", ".git", ...(cfg.exclude || [])]);
  const found = [];
  const walk = (dir, depth) => {
    if (depth > 3) return;
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (!e.isDirectory() || skip.has(e.name)) continue;
      const p = path.join(dir, e.name), stats = path.join(p, "03_statistics");
      if (fs.existsSync(path.join(stats, "run-log.json"))) found.push({ repoDir: p, statsDir: stats, folder: e.name });
      else walk(p, depth + 1);
    }
  };
  for (const root of cfg.scan || []) walk(path.resolve(base, root), 0);
  for (const f of found) {
    let log;
    try { log = readJson(path.join(f.statsDir, "run-log.json")); } catch { console.log("skipped (unreadable run-log.json):", f.folder); continue; }
    if (!log.runId) { console.log("skipped (no run id yet):", f.folder); continue; }
    if (!log.end) { console.log("skipped (not finished, no end):", f.folder); continue; }
    let label = log.runLabel || f.folder, n = 2;
    while (seen.has(label)) label = `${log.runLabel || f.folder} (${n++})`;
    seen.add(label);
    out.push({ label, series: seriesOf(log), template: String(log.templateVersion || ""), statsDir: f.statsDir, repo: { dir: f.repoDir } });
  }
  return out;
}

// ---------------------------------------------------------------- the quality gate
// The gate is the same in every run of a setup: line coverage and adjusted mutation score per component, a green final run and no open Critical or High finding.
// Thresholds come from the run-log (written by the agent), else from the project's quality-requirements.md, else from `gate` in the config (history: applied afterwards).
function readThresholds(run, log) {
  const t = log.codeMetrics?.gate?.thresholds;
  if (t && num(t.lineCoverage) != null && num(t.mutationScore) != null) return { lineCoverage: Number(t.lineCoverage), mutationScore: Number(t.mutationScore), source: "run-log" };
  const here2 = [path.join(run.statsDir, "..", "01_input", "01_project", "02_design", "quality-requirements.md"), run.repo?.dir ? path.join(run.repo.dir, "01_input", "01_project", "02_design", "quality-requirements.md") : null].filter(Boolean);
  for (const f of here2) {
    if (!fs.existsSync(f)) continue;
    const text = fs.readFileSync(f, "utf8");
    const line = /^\|\s*Line coverage[^|]*\|\s*>=\s*([0-9.]+)\s*%/im.exec(text), mut = /^\|\s*Mutation score[^|]*\|\s*>=\s*([0-9.]+)\s*%/im.exec(text);
    if (line && mut) return { lineCoverage: Number(line[1]), mutationScore: Number(mut[1]), source: "quality-requirements.md" };
  }
  if (config.gate && num(config.gate.lineCoverage) != null && num(config.gate.mutationScore) != null) return { lineCoverage: config.gate.lineCoverage, mutationScore: config.gate.mutationScore, source: "config" };
  return null;
}
function evalGate(m, th) {
  if (!th) return null;
  const items = [];
  const add = (id, label, value, min, unit) => items.push({ id, label, value: value ?? null, threshold: min, unit, pass: value == null ? null : value >= min, shortfall: value == null ? null : value >= min ? 0 : r1(min - value) });
  add("covBackend", "Backend line coverage", m.covBackend?.v, th.lineCoverage, "%");
  add("covFrontend", "Frontend line coverage", m.covFrontend?.v, th.lineCoverage, "%");
  add("mutAdjBackend", "Backend mutation score (adjusted)", m.mutAdjBackend?.v, th.mutationScore, "%");
  add("mutAdjFrontend", "Frontend mutation score (adjusted)", m.mutAdjFrontend?.v, th.mutationScore, "%");
  const failed = m.finalFailed?.v;
  items.push({ id: "allGreen", label: "Final run all green", value: failed ?? null, threshold: 0, unit: "failing", pass: failed == null ? null : failed === 0 && (m.finalTests?.v || 0) > 0, shortfall: null });
  const open = m.openCritHigh?.v;
  items.push({ id: "openCritHigh", label: "No open Critical or High finding", value: open ?? null, threshold: 0, unit: "open", pass: open == null ? null : open === 0, shortfall: null });
  // a criterion that cannot be assessed (a component the run does not have, an older log without the field) does not fail the gate; it is counted in `unknown`
  const known = items.filter((i) => i.pass != null), unknown = items.length - known.length;
  const met = known.some((i) => i.pass === false) ? false : known.filter((i) => i.unit === "%").length ? true : null;
  const over = items.filter((i) => i.unit === "%" && i.pass).map((i) => i.value - i.threshold);
  return { thresholds: { lineCoverage: th.lineCoverage, mutationScore: th.mutationScore }, source: th.source, appliedLater: th.source === "config", items, met, unknown,
    shortfall: r1(items.filter((i) => i.shortfall).reduce((s, i) => s + i.shortfall, 0)), overshoot: over.length ? r1(over.reduce((s, v) => s + v, 0) / over.length) : null };
}

// ---------------------------------------------------------------- one run -> metrics for the page
// Source tags: t = transcript, l = run-log, e = estimate, o = override from a summary or other file
function gather(run) {
  const logPath = path.join(run.statsDir, "run-log.json");
  const log = readJson(logPath);
  const usageMd = path.join(run.statsDir, "usage.md");
  const a = analyse({ logPath, usageMdPath: usageMd, transcriptPaths: run.transcript ? [run.transcript] : undefined, repo: run.repo, readCommits: config.single || !!run.repo });
  const hasTranscript = a.files.main.length > 0;
  let T = a.time, U = a.usage, srcTime = hasTranscript ? "t" : "l", srcUsage = hasTranscript ? "t" : null;
  const notes = a.notes.filter((n) => !n.startsWith("transcript not found"));
  if (!hasTranscript) notes.push("no transcript on this machine: model and tool time, context and per-phase cost are not available");

  // waits that the run-summary documents but the log does not record
  for (const w of run.extraWaits || []) {
    const p = T.byPhase.find((x) => x.phase === w.phase);
    if (p) { p.waitMin = r1(p.waitMin + w.min); p.agentMin = r1(p.agentMin - w.min); }
    T.humanWaitMin = r1(T.humanWaitMin + w.min); T.agentMin = r1(T.agentMin - w.min);
    if (w.min > 60) T.longWaits.push({ min: w.min, source: "run-summary", reason: "same episode as above, documented in the run summary: " + w.note });
    notes.push(`${w.min} min of waiting taken from the run summary: ${w.note}`);
  }

  // usage: transcript, else the log (agent script), else the config override
  const logU = log.usage && log.usage.costUsd != null ? log.usage : null;
  if (!U && logU) { U = { ...logU, toolCalls: logU.toolCalls || { total: null, errors: null }, costUsdExclWaits: logU.costUsdExclWaits ?? null }; srcUsage = "l"; }
  if (!U && run.usage) {
    const o = run.usage;
    U = { inputTokens: o.inputTokens, outputTokens: o.outputTokens, cacheReadTokens: o.cacheReadTokens, cacheWriteTokens: o.cacheWriteTokens, modelCalls: o.modelCalls, toolCalls: o.toolCalls, costUsd: o.costUsd, costUsdExclWaits: null };
    srcUsage = "o"; notes.push("usage taken from " + o.source);
  }
  // cost without wait-caused rebuilds: measured with a transcript, otherwise estimated from excess cache-write tokens
  let costExcl = U ? U.costUsdExclWaits : null, srcCost = srcUsage;
  if (U && costExcl == null) {
    const long = T.waitsOver60Min > 0;
    const excess = long ? Math.max(0, (U.cacheWriteTokens || 0) - config.rebuildBaselineCacheWriteTokens) : 0;
    costExcl = U.costUsd - (excess * (8 - 0.2)) / 1e6;
    srcCost = long ? "e" : srcUsage;
    if (long) notes.push(`cache rebuild estimated from ${Math.round(excess / 1000)}k cache-write tokens above ${Math.round(config.rebuildBaselineCacheWriteTokens / 1000)}k`);
  }

  const m = {};
  const set = (id, v, src, note) => { m[id] = { v: v == null ? null : v, src: v == null ? null : src, note: note || null }; };
  const ph = (n) => T.byPhase.find((p) => p.phase === n);
  const sumPh = (ns) => { const xs = ns.map(ph); return xs.every(Boolean) ? r1(xs.reduce((s, p) => s + p.agentMin, 0)) : null; };
  set("agentMin", T.agentMin, srcTime);
  set("humanWaitMin", T.humanWaitMin, srcTime, T.unrecordedIdleMin ? `${T.unrecordedIdleMin} min of idle time was not recorded in the log` : null);
  set("waitsOver60", T.waitsOver60Min, srcTime);
  set("modelMin", T.modelMin, "t");
  set("toolMin", T.toolMin, "t");
  set("overheadMin", sumPh([0, 1, 2, 7]), srcTime);
  set("coreMin", sumPh([4, 5, 6]), srcTime);
  const finalTests = num(log.finalTestRun?.passed);
  set("agentMinPerTest", finalTests ? r2(T.agentMin / finalTests) : null, srcTime);

  if (U) {
    set("costExcl", r2(costExcl), srcCost);
    set("costLogged", r2(U.costUsd), srcUsage);
    set("rebuildCost", r2(U.costUsd - costExcl), srcCost);
    set("costPerTest", finalTests ? Math.round((costExcl / finalTests) * 1000) / 1000 : null, srcCost);
    set("modelCalls", num(U.modelCalls), srcUsage);
    set("toolCalls", num(U.toolCalls?.total), srcUsage);
    set("toolErrorPct", U.toolCalls?.errors != null && U.toolCalls.total ? r1((100 * U.toolCalls.errors) / U.toolCalls.total) : null, srcUsage);
    set("outputTokens", num(U.outputTokens) == null ? null : Math.round(U.outputTokens / 100) / 10, srcUsage);
    set("avgContext", U.context ? Math.round(U.context.avgTokens / 100) / 10 : null, "t");
    set("peakContext", U.context ? Math.round(U.context.peakTokens / 100) / 10 : null, "t");
    set("pctOver150k", U.context ? U.context.pctCallsOver150k : null, "t");
    set("subagentCost", U.subagents ? U.subagents.costUsd : null, "t", U.subagents?.used ? `${U.subagents.used} sub-agent call(s)` : "no sub-agents used");
  }
  set("unrecordedIdleMin", hasTranscript ? T.unrecordedIdleMin : null, "t");
  const apd = a.environment?.permissionDecisions;
  set("approvalPrompts", hasTranscript && apd && apd.total ? apd.byHuman : null, "t", apd && apd.total ? `${apd.total - apd.byHuman} of ${apd.total} permission decisions were made by the mode or classifier` : null);
  const pcx = T.phaseChecks;
  set("phaseHelperPct", hasTranscript && pcx && pcx.viaHelper + pcx.manual ? r1((100 * pcx.viaHelper) / (pcx.viaHelper + pcx.manual)) : null, "t", pcx?.issues?.length ? "issues: " + pcx.issues.join("; ") : null);

  const cs = a.commitSummary || (log.commitSummary && log.commitSummary.count ? log.commitSummary : null); // stored by the post-run step when no repository is configured
  if (cs && cs.count) {
    set("commitCount", cs.count, "l");
    set("commitLinesMedian", cs.linesMedian, "l");
    set("commitLinesMax", cs.linesMax, "l");
    set("commitPctOversize", cs.pctOversize, "l");
    set("commitPctMixed", cs.pctMixed, "l");
    set("commitPctMessageOk", cs.pctMessageOk, "l");
    set("commitPctBurst", cs.pctBurst, "l");
    set("commitCostMedian", hasTranscript ? cs.costPerCommitMedian : null, "t");
    set("commitActiveMinMedian", hasTranscript ? cs.activeMinPerCommitMedian : null, "t");
    set("commitCostPer100Lines", hasTranscript ? cs.costPer100Lines : null, "t");
  } else if (Array.isArray(log.commits) && log.commits.length) set("commitCount", log.commits.length, "l");

  const dec = log.decisions || [], fl = log.fixLoops || [], hi = log.humanInterventions || [];
  set("blocking", dec.filter((d) => d.type === "blocking").length, "l");
  const oracle = readOracle(run.statsDir);
  const pct = (g) => (g && g.total ? r1((100 * g.passed) / g.total) : null);
  set("oracleRegression", pct(oracle?.regression), "o", oracle?.regression ? `${oracle.regression.passed} of ${oracle.regression.total}` + (oracle.regression.failed?.length ? `; failed ${oracle.regression.failed.join(", ")}` : "") : null);
  set("oracleFeature", pct(oracle?.featureScenarios), "o", oracle?.featureScenarios ? `${oracle.feature}: ${oracle.featureScenarios.passed} of ${oracle.featureScenarios.total}` + (oracle.featureScenarios.failed?.length ? `; failed ${oracle.featureScenarios.failed.join(", ")}` : "") : null);
  set("interventions", hi.length, "l");
  set("decisions", dec.length, "l");
  set("fixLoops", fl.length, "l");
  // loop minutes exclude any human wait inside the loop
  const waitWins = hi.filter((h) => h.start && h.end).map((h) => [Date.parse(h.start), Date.parse(h.end)]);
  const loopMs = (f) => { const s0 = Date.parse(f.start), e0 = Date.parse(f.end); return e0 - s0 - waitWins.reduce((t, w) => t + Math.max(0, Math.min(e0, w[1]) - Math.max(s0, w[0])), 0); };
  const timed = fl.filter((f) => f.start && f.end);
  set("loopMin", !fl.length ? 0 : timed.length === fl.length ? r1(timed.reduce((s, f) => s + loopMs(f) / 60000, 0)) : null, "l",
    fl.length && timed.length !== fl.length ? "some loops lack start or end" : null);
  set("loopsNeedHuman", fl.length && fl.every((f) => typeof f.needsHuman === "boolean") ? fl.filter((f) => f.needsHuman).length : null, "l");
  const fc = log.acceptanceCriteria?.frozenTestChanges;
  set("frozenChanges", Array.isArray(fc) ? fc.length : null, "l");
  set("divergences", Array.isArray(log.divergences) ? log.divergences.length : null, "l");

  set("finalTests", finalTests, "l");
  set("finalFailed", num(log.finalTestRun?.failed), "l");
  set("firstFailed", num(log.firstTestRun?.failed), "l", log.firstTestRun?.failedReason ? "first run did not complete: " + log.firstTestRun.failedReason : null);
  const f = log.findings;
  set("findingsTotal", f ? f.critical + f.high + f.medium + f.low : null, "l");
  set("critHigh", f ? f.critical + f.high : null, "l");
  set("openCritHigh", log.openAtEnd ? log.openAtEnd.critical + log.openAtEnd.high : null, "l");

  const comps = log.codeMetrics?.components || [];
  const comp = (re) => comps.find((c) => re.test(c.name || ""));
  const lc = (c) => (c ? (typeof c.lineCoverage === "number" ? c.lineCoverage : num(c.lineCoverage?.all)) : null);
  const mu = (c) => (c ? (num(c.mutation?.score) ?? num(c.mutationScore)) : null);
  const be = comp(/back/i), fe = comp(/front/i);
  set("mutBackend", mu(be), "l", be?.mutation?.scope || null);
  set("mutFrontend", mu(fe), "l", fe?.mutation?.scope || null);
  set("covBackend", lc(be), "l");
  set("covFrontend", lc(fe), "l");
  set("ac", num(log.acceptanceCriteria?.total), "l");
  const prod = comps.reduce((s, c) => s + (num(c.productionLoc) || 0), 0), test = comps.reduce((s, c) => s + (num(c.testLoc) || 0), 0);
  set("prodLoc", comps.length ? prod : null, "l");
  set("testLoc", comps.length ? test : null, "l");
  set("testRatio", comps.length && prod ? r2(test / prod) : null, "l");
  set("testsPer1000Loc", comps.length && prod && finalTests ? r1((1000 * finalTests) / prod) : null, "l");
  set("unitTests", num(log.finalTestRun?.byLevel?.unit?.passed ?? log.finalTestRun?.byLevel?.unit), "l");
  set("e2eTests", num(log.finalTestRun?.byLevel?.e2e?.passed ?? log.finalTestRun?.byLevel?.e2e), "l");
  // adjusted mutation score: survivors justified as equivalent count as killed; older runs recorded only the raw score
  const muAdj = (c) => num(c?.mutation?.scoreAdjusted) ?? mu(c);
  set("mutAdjBackend", muAdj(be), "l", num(be?.mutation?.scoreAdjusted) == null && mu(be) != null ? "raw score: no adjusted score recorded" : null);
  set("mutAdjFrontend", muAdj(fe), "l", num(fe?.mutation?.scoreAdjusted) == null && mu(fe) != null ? "raw score: no adjusted score recorded" : null);
  const lg = log.codeMetrics?.gate || {}, sumObj = (o) => (o && typeof o === "object" ? Object.values(o).reduce((s, v) => s + (num(v) || 0), 0) : null);
  const roundsSum = sumObj(lg.mutationRounds), firstSum = sumObj(lg.testsAtFirstMutation);
  set("mutationRounds", roundsSum != null && Object.keys(lg.mutationRounds || {}).length ? roundsSum : null, "l");
  set("testsAfterFirstMutation", firstSum != null && Object.keys(lg.testsAtFirstMutation || {}).length && finalTests != null ? Math.max(0, finalTests - firstSum) : null, "l");

  // no .jsonl and no usage: the Markdown export still lets us count tool calls
  if (!m.toolCalls || m.toolCalls.v == null) {
    const md = [path.join(run.statsDir, "results", "transcript.md"), path.join(run.statsDir, "transcript.md")].find((x) => fs.existsSync(x));
    if (md) {
      const n = (fs.readFileSync(md, "utf8").match(/^\*\*Tool: /gm) || []).length;
      if (n) m.toolCalls = { v: n, src: "o", note: "counted in transcript.md" };
    }
  }
  // overrides win over the log only where the log has no value
  for (const [id, o] of Object.entries(run.metrics || {})) {
    if (!m[id] || m[id].v == null) m[id] = { v: o.v, src: "o", note: [o.note, o.source ? "source: " + o.source : null].filter(Boolean).join("; ") || null };
  }
  // the gate is evaluated last, so that values taken from a summary (overrides) count too
  for (const [adj, raw] of [["mutAdjBackend", "mutBackend"], ["mutAdjFrontend", "mutFrontend"]]) if (m[adj].v == null && m[raw]?.v != null) m[adj] = { ...m[raw], note: "raw score: no adjusted score recorded" };
  const gate = evalGate(m, readThresholds(run, log));
  set("gateMet", gate ? (gate.met === true ? 1 : gate.met === false ? 0 : null) : null, "l", gate?.appliedLater ? "gate applied afterwards: this run was not told the thresholds" : null);
  set("gateShortfall", gate ? gate.shortfall : null, "l");
  set("gateOvershoot", gate ? gate.overshoot : null, "l");
  set("costToGate", gate?.met === true && U ? r2(costExcl) : null, srcCost, gate?.appliedLater ? "gate applied afterwards" : null);
  const phases = T.byPhase.map((p) => ({ phase: p.phase, name: p.name, agentMin: p.agentMin, waitMin: p.waitMin, modelMin: p.modelMin, toolMin: p.toolMin,
    costUsd: U?.byPhase?.find((q) => q.phase === p.phase)?.costUsd ?? null, avgContextK: U?.byPhase?.find((q) => q.phase === p.phase)?.avgContextTokens != null ? Math.round(U.byPhase.find((q) => q.phase === p.phase).avgContextTokens / 1000) : null }));
  const sources = { time: srcTime === "t" ? "transcript and run-log" : "run-log phases minus recorded waits", usage: srcUsage === "t" ? "transcript" : srcUsage === "l" ? "run-log usage (agent script)" : srcUsage === "o" ? "override: " + run.usage.source : "none" };
  // postRunHost is the machine the post-run step ran on, stored in the run-log; rebuilding a report elsewhere must not replace it with the machine that builds the report
  const environment = { ...(log.environment || {}), ...(a.environment || {}) };
  if (log.environment?.postRunHost) environment.postRunHost = log.environment.postRunHost;
  return { label: run.label, series: run.series, template: run.template, start: log.start, end: log.end, wallMin: T.wallMin, metrics: m, phases, sources, flags: run.flags || [], notes,
    longWaits: T.longWaits.map((w) => ({ min: w.min, reason: w.reason || null, source: w.source, cause: w.cause || null })), rebuilds: U?.cacheRebuilds || [], toolTime: U?.toolTimeByCategory || null,
    tokens: U ? { out: U.outputTokens, cr: U.cacheReadTokens, cw: U.cacheWriteTokens, inp: U.inputTokens } : null,
    environment,
    phaseChecks: pcx ? { viaHelper: pcx.viaHelper, manual: pcx.manual, issues: pcx.issues } : null, subagents: U?.subagents || null,
    commitSummary: cs || null, commits: config.single ? (a.commits || null) : null, gate };
}

// ---------------------------------------------------------------- setups: runs of the same template version, compared by median and range
const median = (xs) => { const s = xs.slice().sort((p, q) => p - q), n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : null; };
const SETUP_METRICS = ["agentMin", "costExcl", "costToGate", "toolCalls", "modelCalls", "avgContext", "blocking", "fixLoops", "loopMin", "finalTests", "unitTests", "e2eTests", "mutAdjBackend", "mutAdjFrontend", "covBackend", "covFrontend", "mutationRounds", "testsAfterFirstMutation", "gateOvershoot", "commitCount", "commitPctOversize"];
function setupsOf(rs) {
  const groups = new Map();
  for (const r of rs) { const k = r.template || "?"; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(r); }
  return [...groups].map(([template, g]) => {
    const stats = {};
    for (const id of SETUP_METRICS) {
      const vs = g.map((r) => r.metrics[id]?.v).filter((v) => typeof v === "number");
      if (vs.length) stats[id] = { n: vs.length, median: r2(median(vs)), min: Math.min(...vs), max: Math.max(...vs) };
    }
    // differences in the environment inside one setup: runs of a setup are meant to share it
    const envOf = (r) => ({ ...(r.environment?.tools || {}), os: r.environment?.os ? `${r.environment.os.platform} ${r.environment.os.release}` : null, model: (r.environment?.models || []).join(", "), harness: (r.environment?.harness?.versions || []).join(", "), permissionMode: r.environment?.permissionMode ?? null });
    const keys = [...new Set(g.flatMap((r) => Object.keys(envOf(r))))];
    const envDiffs = keys.map((k) => ({ key: k, values: g.map((r) => ({ label: r.label, value: envOf(r)[k] ?? null })) })).filter((d) => new Set(d.values.map((x) => x.value).filter((v) => v != null)).size > 1);
    return { template, n: g.length, labels: g.map((r) => r.label), operators: [...new Set(g.map((r) => r.environment?.operator).filter(Boolean))], gatePassing: g.filter((r) => r.metrics.gateMet?.v === 1).length, stats, envDiffs };
  });
}

const runs = config.runs.map(gather);
const data = { title: config.title, subtitle: config.subtitle, built: new Date().toISOString().slice(0, 10), single: !!config.single, catalog, runs, setups: setupsOf(runs), excluded: config.excluded || [] };

const css = fs.readFileSync(path.join(here, "report.css"), "utf8");
const html = fs.readFileSync(path.join(here, "report-template.html"), "utf8").replace("__STYLE__", () => css).replace("__DATA__", () => JSON.stringify(data));
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, html);
console.log(`written ${outPath} (${html.length} bytes, ${runs.length} run${runs.length === 1 ? "" : "s"})`);
if (!runDir) for (const r of runs) console.log(r.label.padEnd(12), "agent", String(r.metrics.agentMin.v).padStart(6), "cost", String(r.metrics.costExcl?.v ?? "-").padStart(6), "tests", r.metrics.finalTests.v, "| time:", r.sources.time, "| usage:", r.sources.usage, r.notes.length ? "| " + r.notes.join(" / ") : "");
