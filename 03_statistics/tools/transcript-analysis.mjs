// Measures one run from its session transcripts (.jsonl), its run-log.json and its git history. Node 20+, no dependencies.
//
//   node transcript-analysis.mjs [path/to/run-log.json] [--write]      prints a summary; --write stores time and usage
//
// Normally this module is used through build-report.mjs (see there). MASTER COPY: Run_Comparison_Report/analysis. The project
// template holds identical copies in 03_statistics/tools/; run sync-to-template.mjs after every change.
//
// What it measures, and why (targets in 03_statistics/metrics.md):
//   time      wall clock split into agent time (what the workflow costs) and human wait (what it does not), phase checks
//   usage     tokens and dollars per model and phase, sub-agents, the cache rebuilds that waits cause, a cross-check against
//   context   how large the context was on each call (every call re-reads all of it)
//   commits   size, concern, message and the work and cost between commits
//   environment  harness version, models, effort, machine
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

export const DEFAULTS = {
  idleGapMin: 10,           // a gap between two transcript events above this is a wait, not work
  cacheLifetimeMin: 55,     // a gap above this lets the 1-hour cache expire (5 min of margin)
  rebuildMinTokens: 150000, // a cache write above this right after such a gap is a rebuild of the whole context
  bigContextTokens: 150000, // "long context" threshold
  commit: { maxFiles: 15, maxLines: 400, tinyLines: 5 }, // size guide of working-rules.md, "Commits"
  // used only when usage.md has no parsable row for a model; per MTok
  prices: { "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2, cacheWrite5m: 5, cacheWrite1h: 8 } },
};

const readJson = (f) => JSON.parse(fs.readFileSync(f, "utf8").replace(/^﻿/, ""));
const ms = (s) => Date.parse(s);
const min = (msec) => msec / 60000;
const r1 = (x) => Math.round(x * 10) / 10;
const r2 = (x) => Math.round(x * 100) / 100;
const median = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const pct = (a, b) => (b ? r1((100 * a) / b) : null);
const stripAnsi = (s) => String(s).replace(/\u001b\[[0-9;]*[A-Za-z]/g, "");

// Command classes for tool time. A command that chains several tools counts under its first match.
const CATEGORIES = [
  ["Dependency scan (CVE)", /dependency-check|owasp|npm audit|trivy/],
  ["Mutation testing", /stryker|pitest|pit:|mutation/],
  ["End-to-end tests", /playwright|e2e/],
  ["Docker build/run", /docker (compose|build|run|buildx)|docker-compose|compose (up|build)/],
  ["Backend build and test", /mvnw|mvn |gradle/],
  ["Frontend build and test", /vitest|npm |npx |pnpm|jest/],
  ["Other analysis tools", /gitleaks|semgrep|hadolint|cloc|cpd|jscpd|pmd/],
  ["git", /\bgit /],
  ["curl/sleep", /curl|wget|sleep/],
];
export const categoryOf = (command) => {
  const c = String(command || "").toLowerCase();
  for (const [name, re] of CATEGORIES) if (re.test(c)) return name;
  return "Shell and file inspection";
};

// Prices from the model rows of usage.md: | model | input | output | cache read | cache write 5 min | cache write 1 h |
export function parsePrices(usageMdPath) {
  const prices = {};
  if (!usageMdPath || !fs.existsSync(usageMdPath)) return prices;
  for (const line of fs.readFileSync(usageMdPath, "utf8").split(/\r?\n/)) { // a Windows clone has CRLF line endings
    const m = line.match(/^\|\s*`?(claude-[a-z0-9.\-]+)`?\s*\|(.*)\|\s*$/i);
    if (!m) continue;
    // prices carry a "$"; fall back to bare numbers. Text such as "(5 min)" has no "$" and is ignored.
    let nums = [...m[2].matchAll(/\$\s*([0-9]+(?:\.[0-9]+)?)/g)].map((x) => Number(x[1]));
    if (nums.length < 4) nums = [...m[2].matchAll(/([0-9]+(?:\.[0-9]+)?)/g)].map((x) => Number(x[1]));
    if (nums.length >= 5) prices[m[1]] = { input: nums[0], output: nums[1], cacheRead: nums[2], cacheWrite5m: nums[3], cacheWrite1h: nums[4] };
    else if (nums.length === 4) prices[m[1]] = { input: nums[0], output: nums[1], cacheRead: nums[2], cacheWrite5m: nums[3], cacheWrite1h: nums[3] };
  }
  return prices;
}

function mergeWindows(w) {
  const s = w.filter((x) => x[1] > x[0]).sort((a, b) => a[0] - b[0]);
  const out = [];
  for (const x of s) {
    const last = out[out.length - 1];
    if (last && x[0] <= last[1]) last[1] = Math.max(last[1], x[1]);
    else out.push([x[0], x[1]]);
  }
  return out;
}
const overlap = (wins, a, b) => wins.reduce((s, w) => s + Math.max(0, Math.min(b, w[1]) - Math.max(a, w[0])), 0);

// ---- transcripts: the recorded session files of the run plus the sub-agent transcripts that sit next to each of them
// A recorded path that no longer exists (another machine) falls back to the backup in <03_statistics>/data/.
export function findTranscriptFiles(log, override, dataDir) {
  const listed = override?.length ? override : [...(Array.isArray(log.transcripts) ? log.transcripts : []), ...(log.transcript ? [log.transcript] : [])];
  const resolved = [...new Set(listed.map((f) => String(f).replace(/^~/, os.homedir())))];
  const main = [];
  for (const f of resolved) {
    const backup = dataDir ? path.join(dataDir, path.basename(f)) : null;
    if (fs.existsSync(f)) main.push(f);
    else if (backup && fs.existsSync(backup)) main.push(backup);
  }
  const sub = [];
  for (const f of main) {
    const dir = path.join(path.dirname(f), path.basename(f, ".jsonl"), "subagents");
    if (fs.existsSync(dir)) for (const n of fs.readdirSync(dir)) if (n.endsWith(".jsonl")) sub.push(path.join(dir, n));
  }
  return { main, sub };
}

function readRows(files, endMs) {
  const rows = [], costStates = [], late = [];
  for (const [file, isSub] of files) {
    for (const line of fs.readFileSync(file, "utf8").split("\n")) {
      if (!line) continue;
      let x;
      try { x = JSON.parse(line); } catch { continue; }
      if (x.type === "cost-state") { if (!isSub) costStates.push({ file, x }); continue; }
      if (!x.timestamp || (x.type !== "assistant" && x.type !== "user" && x.type !== "system")) continue;
      const t = ms(x.timestamp);
      x.t = t; x.srcFile = file; x.sub = isSub;
      if (endMs && t > endMs) { if (x.type === "assistant") late.push(x); continue; }
      rows.push(x);
    }
  }
  return { rows, costStates, late };
}

// ---- git: size, concern, message and the work between commits
const IGNORED_FOR_SIZE = [/(^|\/)03_statistics\//i, /(^|\/)(logs?|node_modules|target|dist|build|coverage|reports?|\.git)\//i, /(package-lock\.json|pnpm-lock\.yaml|yarn\.lock|\.lock|gradle\.lockfile)$/i, /\.(log|min\.js|min\.css|map)$/i];
function categoryOfFile(p) {
  if (IGNORED_FOR_SIZE.some((re) => re.test(p))) return "ignored";
  if (/(^|\/)(src\/test|tests?|__tests__|e2e|acceptance)(\/|$)|\.(test|spec)\.[a-z]+$/i.test(p)) return "test";
  if (/(^|\/)docs\/|\.md$|\.sha256$/i.test(p)) return "docs";
  if (/src\/main\/resources\//i.test(p)) return "code";
  if (/(^|\/)(pom\.xml|package\.json|Dockerfile[^/]*|docker-compose[^/]*|nginx[^/]*|\.github\/|\.mvn\/|mvnw(\.cmd)?|vite\.config\.[a-z]+|tsconfig[^/]*|\.gitignore|\.gitattributes|\.npmrc|\.env\.example|secrets\.env\.example)$|\.(ya?ml|toml|gradle|properties)$/i.test(p)) return "build";
  return "code";
}
export function analyseCommits({ repoDir, from, to, calls, waitWins, phaseOf, startMs, limits }) {
  const top = spawnSync("git", ["-C", repoDir, "rev-parse", "--show-toplevel"], { encoding: "utf8" });
  if (top.error || top.status !== 0) return { commits: null, summary: null, note: "commits not read: not a git repository (" + repoDir + ")" };
  const root = top.stdout.trim();
  const range = from ? `${from}..${to || "HEAD"}` : (to || "HEAD");
  const r = spawnSync("git", ["-C", root, "log", "--reverse", "--no-merges", "--numstat", "--format=@@@%H%x1f%cI%x1f%s", range], { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
  if (r.status !== 0) return { commits: null, summary: null, note: "commits not read: git log failed for " + range + ": " + String(r.stderr).trim().split("\n").pop() };
  const out = [];
  let cur = null;
  for (const line of r.stdout.split("\n")) {
    if (line.startsWith("@@@")) { const [hash, iso, subject] = line.slice(3).split("\x1f"); cur = { hash, time: iso, subject, files: [] }; out.push(cur); }
    else if (cur && line.trim()) { const [a, d, ...rest] = line.split("\t"); cur.files.push({ path: rest.join("\t").replace(/.*=> /, "").replace(/[{}]/g, ""), add: a === "-" ? 0 : Number(a), del: d === "-" ? 0 : Number(d) }); }
  }
  const statsOnly = out.filter((c) => c.files.length && c.files.every((f) => IGNORED_FOR_SIZE[0].test(f.path))).length;
  const sortedCalls = [...(calls || [])].sort((a, b) => a.t - b.t);
  let prevT = startMs;
  const commits = out.filter((c) => !(c.files.length && c.files.every((f) => IGNORED_FOR_SIZE[0].test(f.path)))).map((c) => {
    const t = ms(c.time);
    const cats = {};
    let lines = 0, linesAll = 0, files = 0;
    for (const f of c.files) {
      const k = categoryOfFile(f.path), n = f.add + f.del;
      linesAll += n;
      if (k !== "ignored") { cats[k] = (cats[k] || 0) + n; lines += n; files++; }
    }
    const kinds = Object.keys(cats);
    const inWindow = sortedCalls.filter((x) => x.t > prevT && x.t <= t);
    const wall = Math.max(0, t - prevT), wait = Math.min(wall, overlap(waitWins, prevT, t));
    const typeM = c.subject.match(/^(feat|test|fix|refactor|docs|build|chore)\b/);
    const ids = [...new Set(c.subject.match(/\b(?:US|AC|BR|NFR|SB|SR|ES|AR|DoD|F|D)-[A-Za-z0-9-]+\b/g) || [])];
    const msgOk = /^(feat|test|fix|refactor|docs|build|chore): .+/.test(c.subject) && c.subject.length <= 72;
    const row = { hash: c.hash.slice(0, 7), time: c.time, phase: phaseOf ? phaseOf(t) : null, subject: c.subject, type: typeM ? typeM[1] : null,
      files, lines, linesAll, categories: cats, mixed: kinds.length > 1, oversize: files > limits.maxFiles || lines > limits.maxLines, tiny: lines <= limits.tinyLines,
      messageOk: msgOk, ids, idsExpected: ["feat", "test", "fix"].includes(typeM?.[1]), burst: wall < 60000, minutesSincePrev: r1(min(wall)), activeMinutesSincePrev: r1(min(wall - wait)),
      modelCalls: inWindow.length, outputTokens: inWindow.reduce((s, x) => s + x.out, 0), costUsdSincePrev: r2(inWindow.reduce((s, x) => s + x.cost, 0)) };
    prevT = t;
    return row;
  });
  const n = commits.length, withIds = commits.filter((c) => c.idsExpected);
  const totalLines = commits.reduce((s, c) => s + c.lines, 0), totalCost = commits.reduce((s, c) => s + c.costUsdSincePrev, 0);
  const byPhase = {}, byType = {};
  for (const c of commits) { byPhase[c.phase] = (byPhase[c.phase] || 0) + 1; byType[c.type || "other"] = (byType[c.type || "other"] || 0) + 1; }
  const tailCost = sortedCalls.filter((x) => x.t > prevT).reduce((s, x) => s + x.cost, 0);
  const sortedLines = commits.map((c) => c.lines).sort((a, b) => a - b);
  const summary = n ? { count: n, byPhase, byType, linesMedian: median(sortedLines), linesP90: sortedLines[Math.min(n - 1, Math.ceil(n * 0.9) - 1)], linesMax: sortedLines[n - 1],
    filesMedian: median(commits.map((c) => c.files)), pctOversize: pct(commits.filter((c) => c.oversize).length, n), pctMixed: pct(commits.filter((c) => c.mixed).length, n), pctTiny: pct(commits.filter((c) => c.tiny).length, n), pctBurst: pct(commits.filter((c) => c.burst).length, n),
    pctMessageOk: pct(commits.filter((c) => c.messageOk).length, n), pctWithIds: withIds.length ? pct(withIds.filter((c) => c.ids.length).length, withIds.length) : null,
    costPerCommitMedian: r2(median(commits.map((c) => c.costUsdSincePrev))), costPerCommitMean: r2(totalCost / n), activeMinPerCommitMedian: r1(median(commits.map((c) => c.activeMinutesSincePrev))),
    activeMinPerCommitMean: r1(commits.reduce((s, c) => s + c.activeMinutesSincePrev, 0) / n), longestActiveGapMin: Math.max(...commits.map((c) => c.activeMinutesSincePrev)), costPer100Lines: totalLines ? r2((100 * totalCost) / totalLines) : null,
    costAfterLastCommitUsd: r2(tailCost), statsOnlyCommitsLeftOut: statsOnly, range } : { count: 0, range };
  return { commits, summary, note: null };
}

/**
 * @param {object} opts { logPath, usageMdPath?, transcriptPaths?, repo?: {dir, from, to}, options?, detail? }
 */
export function analyse({ logPath, usageMdPath, transcriptPaths, transcriptPath, repo, readCommits = true, options = {}, detail = false }) {
  const o = { ...DEFAULTS, ...options, commit: { ...DEFAULTS.commit, ...(options.commit || {}) } };
  const log = readJson(logPath);
  const notes = [];
  const startMs = ms(log.start), endMs = ms(log.end);
  const phases = (log.phases || []).filter((p) => p.start && p.end).map((p) => ({ n: p.phase, name: p.name, s: ms(p.start), e: ms(p.end) }));
  const phaseOf = (t) => {
    for (const p of phases) if (t >= p.s && t < p.e) return p.n;
    return phases.length && t < phases[0].s ? phases[0].n : (phases.length ? phases[phases.length - 1].n : 0);
  };

  const files = findTranscriptFiles(log, transcriptPaths || (transcriptPath ? [transcriptPath] : null), path.join(path.dirname(logPath), "data"));
  const have = files.main.length > 0;
  let rows = [], costStates = [], lateRows = [];
  if (have) ({ rows, costStates, late: lateRows } = readRows([...files.main.map((f) => [f, false]), ...files.sub.map((f) => [f, true])], endMs + 60000));
  else notes.push("transcript not found: usage and the transcript-based time split stay null");
  if (have && files.main.length > 1) notes.push(`${files.main.length} session files counted (the run was resumed)`);
  if (have && files.sub.length) notes.push(`${files.sub.length} sub-agent transcript(s) counted`);

  // ---- waits: recorded interventions plus idle gaps found in the transcript
  const recorded = (log.humanInterventions || []).filter((h) => h.start && h.end).map((h) => ({ s: ms(h.start), e: ms(h.end), cause: h.cause || null, phase: h.phase ?? null, reason: h.reason }));
  const idleGaps = [];
  const events = rows.filter((x) => x.type === "assistant" || x.type === "user").map((x) => ({ t: x.t, type: x.type, res: Array.isArray(x.message?.content) && x.message.content.some((b) => b.type === "tool_result"), tools: Array.isArray(x.message?.content) ? x.message.content.filter((b) => b.type === "tool_result").map((b) => b.tool_use_id) : [] })).sort((a, b) => a.t - b.t);
  let modelMs = 0, toolMs = 0, humanMs = 0;
  const perPhaseClock = {};
  const pc = (n) => perPhaseClock[n] || (perPhaseClock[n] = { modelMs: 0, toolMs: 0 });
  const toolName = {};
  for (const x of rows) if (x.type === "assistant") for (const b of x.message?.content || []) if (b.type === "tool_use") toolName[b.id] = b.name;
  for (let i = 1; i < events.length; i++) {
    const a = events[i - 1], b = events[i], d = b.t - a.t;
    if (d > o.idleGapMin * 60000) { idleGaps.push({ start: new Date(a.t).toISOString(), end: new Date(b.t).toISOString(), min: r1(min(d)), phase: phaseOf(a.t) }); continue; }
    const ph = pc(phaseOf(b.t));
    if (b.type === "assistant") { modelMs += d; ph.modelMs += d; }
    else if (b.res) {
      if (b.tools.some((id) => toolName[id] === "AskUserQuestion")) humanMs += d;
      else { toolMs += d; ph.toolMs += d; }
    } else humanMs += d;
  }
  const waitWins = mergeWindows([...recorded.map((w) => [w.s, w.e]), ...idleGaps.map((g) => [ms(g.start), ms(g.end)])]);

  // ---- time block
  const byPhaseTime = phases.map((p) => {
    const wall = p.e - p.s, wait = Math.min(wall, overlap(waitWins, p.s, p.e));
    const c = perPhaseClock[p.n] || { modelMs: 0, toolMs: 0 };
    return { phase: p.n, name: p.name, wallMin: r1(min(wall)), waitMin: r1(min(wait)), agentMin: r1(min(wall - wait)), modelMin: have ? r1(min(c.modelMs)) : null, toolMin: have ? r1(min(c.toolMs)) : null };
  });
  const wallMin = min(endMs - startMs);
  const phaseWall = phases.reduce((s, p) => s + (p.e - p.s), 0);
  const waitInPhases = byPhaseTime.reduce((s, p) => s + p.waitMin, 0);
  const covered = (g) => recorded.some((w) => w.s <= ms(g.start) + 1000 && w.e >= ms(g.end) - 1000);
  const longWaits = [
    ...recorded.filter((w) => w.e - w.s > 3600000).map((w) => ({ start: new Date(w.s).toISOString(), min: r1(min(w.e - w.s)), source: "run-log", cause: w.cause, reason: w.reason })),
    ...idleGaps.filter((g) => g.min > 60 && !covered(g)).map((g) => ({ start: g.start, min: g.min, source: "transcript", cause: null, reason: "idle gap not recorded in humanInterventions" })),
  ];
  for (let i = 1; i < phases.length; i++) {
    const g = phases[i].s - phases[i - 1].e;
    if (g > 3600000) longWaits.push({ start: new Date(phases[i - 1].e).toISOString(), min: r1(min(g)), source: "between phases", cause: null, reason: `gap between phase ${phases[i - 1].n} and ${phases[i].n}` });
  }

  // ---- phase timestamps: written by tools/stat.mjs (real clock) or typed by hand? plausible against the transcript?
  const helperCalls = [];
  for (const x of rows) if (x.type === "assistant") for (const b of x.message?.content || []) if (b.type === "tool_use" && b.name === "Bash") {
    const m = String(b.input?.command || "").match(/stat\.mjs\s+phase\s+(\d)\s+(start|end)/);
    if (m) helperCalls.push({ phase: Number(m[1]), which: m[2], t: x.t });
  }
  const boundaries = [];
  for (const p of log.phases || []) for (const which of ["start", "end"]) if (p[which]) {
    const t = ms(p[which]);
    const h = helperCalls.find((c) => Math.abs(c.t - t) < 120000 && (c.phase === p.phase || (which === "end" && c.phase === p.phase + 1 && c.which === "start")));
    boundaries.push({ phase: p.phase, which, time: p[which], via: h ? "stat.mjs" : "manual" });
  }
  const issues = [];
  const done = (log.phases || []).filter((p) => p.start && p.end);
  for (const p of done) if (ms(p.end) < ms(p.start)) issues.push(`phase ${p.phase} ends before it starts`);
  for (let i = 1; i < done.length; i++) if (ms(done[i].start) < ms(done[i - 1].end) - 1000) issues.push(`phase ${done[i].phase} starts before phase ${done[i - 1].phase} ends`);
  if ((log.phases || []).some((p) => !p.start || !p.end)) issues.push("some phases have no start or end");
  if (events.length) {
    const first = events[0].t, last = events[events.length - 1].t;
    if (startMs < first - 30 * 60000) issues.push("run start is more than 30 minutes before the first transcript event");
    if (endMs > last + 10 * 60000) issues.push("run end is more than 10 minutes after the last transcript event");
  }
  const phaseChecks = { viaHelper: boundaries.filter((b) => b.via === "stat.mjs").length, manual: boundaries.filter((b) => b.via === "manual").length, issues, boundaries };

  const time = {
    wallMin: r1(wallMin),
    agentMin: r1(byPhaseTime.reduce((s, p) => s + p.agentMin, 0)),
    humanWaitMin: r1(waitInPhases),
    betweenPhasesMin: r1(wallMin - min(phaseWall)),
    modelMin: have ? r1(min(modelMs)) : null,
    toolMin: have ? r1(min(toolMs)) : null,
    humanReplyMin: have ? r1(min(humanMs)) : null,
    waitsOver60Min: longWaits.length,
    byPhase: byPhaseTime,
    idleGaps,
    longWaits,
    unrecordedIdleMin: r1(min(idleGaps.filter((g) => !covered(g)).reduce((s, g) => s + g.min * 60000, 0))),
    phaseChecks,
  };

  const repoDir = repo?.dir || path.resolve(path.dirname(logPath), "..");
  const calls = [];

  if (!have) {
    const cm = !readCommits ? { commits: null, summary: null, note: null } : analyseCommits({ repoDir, from: repo?.from || log.startCommit, to: repo?.to || log.finalCommit, calls: [], waitWins, phaseOf, startMs, limits: o.commit });
    if (cm.note) notes.push(cm.note);
    return { time, usage: null, environment: null, commits: cm.commits, commitSummary: cm.summary, notes, files, ...(detail ? { _calls: [] } : {}) };
  }

  // ---- usage block
  const parsed = parsePrices(usageMdPath);
  const prices = { ...DEFAULTS.prices, ...parsed };
  if (!Object.keys(parsed).length) notes.push("usage.md has no parsable price row; default prices used");
  const msgs = new Map();
  for (const x of rows) {
    if (x.type !== "assistant") continue;
    const m = x.message, id = m?.id;
    if (!id) continue;
    const g = msgs.get(id) || { first: x.t, model: m.model, usage: null, sub: x.sub };
    if (m.usage && (!g.usage || (m.usage.output_tokens || 0) >= (g.usage.output_tokens || 0))) g.usage = m.usage;
    msgs.set(id, g);
  }
  const callList = [...msgs.values()].filter((g) => g.usage && g.model !== "<synthetic>").sort((a, b) => a.first - b.first);
  const zero = () => ({ calls: 0, inputTokens: 0, outputTokens: 0, thinkingTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, costUsd: 0 });
  const total = zero(), perModel = {}, perPhase = {}, sub = zero();
  const unpriced = new Set();
  const priceOf = (model) => prices[model] || null;
  const callCost = (g) => {
    const p = priceOf(g.model);
    if (!p) { unpriced.add(g.model); return 0; }
    const u = g.usage, cc = u.cache_creation || {};
    const w1 = cc.ephemeral_1h_input_tokens ?? (cc.ephemeral_5m_input_tokens != null ? 0 : (u.cache_creation_input_tokens || 0));
    const w5 = cc.ephemeral_5m_input_tokens ?? 0;
    return ((u.input_tokens || 0) * p.input + (u.output_tokens || 0) * p.output + (u.cache_read_input_tokens || 0) * p.cacheRead + w1 * p.cacheWrite1h + w5 * p.cacheWrite5m) / 1e6;
  };
  const ctx = [];
  const rebuilds = [];
  for (const g of callList) {
    const u = g.usage, c = callCost(g), ph = phaseOf(g.first);
    const th = u.output_tokens_details?.thinking_tokens || 0;
    const add = (t) => { t.calls++; t.inputTokens += u.input_tokens || 0; t.outputTokens += u.output_tokens || 0; t.thinkingTokens += th; t.cacheReadTokens += u.cache_read_input_tokens || 0; t.cacheWriteTokens += u.cache_creation_input_tokens || 0; t.costUsd += c; };
    add(total); add(perModel[g.model] ||= zero()); add(perPhase[ph] ||= zero());
    if (g.sub) add(sub);
    calls.push({ t: g.first, cost: c, out: u.output_tokens || 0, sub: !!g.sub });
    const context = (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0);
    if (!g.sub) ctx.push({ t: g.first, ph, context, cost: c }); // sub-agents have their own small contexts
    const w = u.cache_creation_input_tokens || 0;
    if (w > o.rebuildMinTokens && !g.sub) {
      // the wait that caused it ends just before the call: a human reply, then the call a few seconds later
      const gapRec = idleGaps.filter((q) => ms(q.end) <= g.first && g.first - ms(q.end) < 5 * 60000).sort((a, b) => b.min - a.min)[0];
      const gap = gapRec ? gapRec.min : 0;
      const p = priceOf(g.model);
      const extra = p ? (w * (p.cacheWrite1h - p.cacheRead)) / 1e6 : 0;
      rebuilds.push({ time: new Date(g.first).toISOString(), phase: ph, tokens: w, gapMinBefore: r1(gap), causedByWait: gap > o.cacheLifetimeMin, extraCostUsd: r2(extra) });
    }
  }
  // calls after the run's end (the session went on): not part of the run, but part of the harness's session total
  const after = { calls: 0, costUsd: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };
  {
    const lm = new Map();
    for (const x of lateRows) {
      const m = x.message, id = m?.id;
      if (!id || msgs.has(id)) continue;
      const g = lm.get(id) || { first: x.t, model: m.model, usage: null, sub: x.sub };
      if (m.usage && (!g.usage || (m.usage.output_tokens || 0) >= (g.usage.output_tokens || 0))) g.usage = m.usage;
      lm.set(id, g);
    }
    for (const g of lm.values()) {
      if (!g.usage || g.model === "<synthetic>") continue;
      after.calls++; after.costUsd += callCost(g); after.outputTokens += g.usage.output_tokens || 0;
      after.cacheReadTokens += g.usage.cache_read_input_tokens || 0; after.cacheWriteTokens += g.usage.cache_creation_input_tokens || 0;
    }
  }
  const exclWaits = total.costUsd - rebuilds.filter((r) => r.causedByWait).reduce((s, r) => s + r.extraCostUsd, 0);
  const tools = {}, cats = {};
  let errs = 0;
  const results = {};
  for (const x of rows) if (x.type === "user" && Array.isArray(x.message?.content)) for (const b of x.message.content) if (b.type === "tool_result") results[b.tool_use_id] = { t: x.t, err: !!b.is_error };
  for (const x of rows) if (x.type === "assistant") for (const b of x.message?.content || []) if (b.type === "tool_use") {
    tools[b.name] = (tools[b.name] || 0) + 1;
    const r = results[b.id];
    if (r?.err) errs++;
    if (b.name === "Bash" && !x.sub) {
      const k = categoryOf(b.input?.command), d = r ? r.t - x.t : 0;
      const c = (cats[k] ||= { calls: 0, minutes: 0 });
      c.calls++; c.minutes += min(d);
    }
  }
  for (const k in cats) cats[k].minutes = r1(cats[k].minutes);
  const cvals = ctx.map((c) => c.context);
  const byPhaseUsage = Object.keys(perPhase).map(Number).sort((a, b) => a - b).map((n) => {
    const p = perPhase[n], cs = ctx.filter((c) => c.ph === n);
    return { phase: n, calls: p.calls, outputTokens: p.outputTokens, cacheReadTokens: p.cacheReadTokens, cacheWriteTokens: p.cacheWriteTokens, costUsd: r2(p.costUsd), avgContextTokens: cs.length ? Math.round(cs.reduce((s, c) => s + c.context, 0) / cs.length) : null, startContextTokens: cs.length ? cs[0].context : null };
  });
  const round = (t) => ({ ...t, costUsd: r2(t.costUsd) });
  const subagentsUsed = Object.entries(tools).filter(([k]) => /^(Agent|Task)$/.test(k)).reduce((s, [, n]) => s + n, 0);
  const usage = {
    inputTokens: total.inputTokens, outputTokens: total.outputTokens, thinkingTokens: total.thinkingTokens,
    cacheReadTokens: total.cacheReadTokens, cacheWriteTokens: total.cacheWriteTokens,
    modelCalls: total.calls,
    toolCalls: { total: Object.values(tools).reduce((s, n) => s + n, 0), errors: errs, byTool: tools },
    costUsd: r2(total.costUsd),
    costUsdExclWaits: r2(exclWaits),
    priceTableDate: null,
    unpricedModels: [...unpriced],
    models: Object.fromEntries(Object.entries(perModel).map(([k, v]) => [k, round(v)])),
    subagents: { used: subagentsUsed, transcripts: files.sub.length, modelCalls: sub.calls, costUsd: r2(sub.costUsd), outputTokens: sub.outputTokens },
    cacheRebuilds: rebuilds,
    byPhase: byPhaseUsage,
    context: { peakTokens: Math.max(...cvals), avgTokens: Math.round(cvals.reduce((s, c) => s + c, 0) / cvals.length), pctCallsOver150k: r1((100 * cvals.filter((c) => c > o.bigContextTokens).length) / cvals.length), costPctOver150k: (() => { const tot = ctx.reduce((s, c) => s + c.cost, 0); return tot ? r1((100 * ctx.filter((c) => c.context > o.bigContextTokens).reduce((s, c) => s + c.cost, 0)) / tot) : null; })() },
    toolTimeByCategory: cats,
  };
  if (rebuilds.some((r) => !r.causedByWait)) notes.push("large cache writes without a preceding wait were kept in the cost (compaction or context change)");
  if (subagentsUsed && !files.sub.length) notes.push(`${subagentsUsed} Agent/Task tool call(s) but no sub-agent transcript found: their cost may be missing from the total`);

  if (after.calls) notes.push(`${after.calls} model call(s) after the run's end (the session went on) cost $${r2(after.costUsd)}: not part of the run`);

  // ---- environment: what the harness knows about itself
  const asst = rows.filter((x) => x.type === "assistant");
  const uniq = (xs) => [...new Set(xs.filter((v) => v != null && v !== ""))];
  const environment = {
    harness: { name: "claude-code", versions: uniq(rows.map((x) => x.version)), entrypoints: uniq(rows.map((x) => x.entrypoint)) },
    models: uniq(callList.map((g) => g.model)), effort: uniq(asst.map((x) => x.effort)), perTurnEffort: uniq(asst.map((x) => x.perTurnEffort)), advisorModels: uniq(asst.map((x) => x.advisorModel)),
    permissionModes: uniq(rows.map((x) => x.permissionMode)), gitBranches: uniq(rows.map((x) => x.gitBranch)), workingDirs: uniq(rows.map((x) => x.cwd)).slice(0, 5), userTypes: uniq(rows.map((x) => x.userType)),
    // permission decisions recorded in the session: those whose source is not the configuration (mode or classifier) needed a human
    permissionDecisions: (() => { const d = { total: 0, byHuman: 0, rejected: 0 }; for (const x of rows) { const p = x.permissionDecision; if (!p || typeof p !== "object") continue; d.total++; if (p.source && p.source !== "config") d.byHuman++; if (p.decision === "reject") d.rejected++; } return d; })(),
    postRunHost: { platform: os.platform(), release: os.release(), arch: os.arch(), cpus: os.cpus().length, memoryGb: Math.round(os.totalmem() / 2 ** 30), nodeVersion: process.version, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone },
    capturedAt: new Date().toISOString(),
  };

  // ---- commits with cost between them
  const cm = !readCommits ? { commits: null, summary: null, note: null } : analyseCommits({ repoDir, from: repo?.from || log.startCommit, to: repo?.to || log.finalCommit, calls, waitWins, phaseOf, startMs, limits: o.commit });
  if (cm.note) notes.push(cm.note);

  return { time, usage, environment, commits: cm.commits, commitSummary: cm.summary, notes, files, ...(detail ? { _calls: calls } : {}) };
}

// ---- command line
const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
  const args = process.argv.slice(2);
  const write = args.includes("--write");
  const logPath = path.resolve(args.find((a) => !a.startsWith("--")) || "run-log.json");
  const r = analyse({ logPath, usageMdPath: path.join(path.dirname(logPath), "usage.md") });
  if (write) {
    const log = readJson(logPath);
    log.time = r.time;
    if (r.usage) log.usage = { ...(log.usage || {}), ...r.usage };
    fs.writeFileSync(logPath, JSON.stringify(log, null, 2) + "\n");
  }
  console.log(JSON.stringify({ summary: { wallMin: r.time.wallMin, agentMin: r.time.agentMin, humanWaitMin: r.time.humanWaitMin, costUsd: r.usage?.costUsd, costUsdExclWaits: r.usage?.costUsdExclWaits, panelCheck: r.usage?.check?.verdict, commits: r.commitSummary?.count }, notes: r.notes, written: write }, null, 2));
}
