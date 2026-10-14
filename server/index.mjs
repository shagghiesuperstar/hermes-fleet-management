#!/usr/bin/env node
// Hermes Fleet Management MCP server. Zero dependencies (Node >= 18).
// Transports: stdio (default) or Streamable HTTP JSON (MCP_TRANSPORT=http, MCP_PORT, MCP_AUTH_TOKEN).
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import http from "node:http";
import readline from "node:readline";

const VERSION = "2.0.0";
const env = process.env;

function loadHosts() {
  // HERMES_HOSTS: JSON array [{"name":"alpha","url":"http://hermes-alpha:8642","api_key_env":"HERMES_API_KEY_ALPHA"}]
  // or object {"alpha":"http://hermes-alpha:8642"}
  const raw = env.HERMES_HOSTS || "[]";
  let parsed;
  try { parsed = JSON.parse(raw); } catch { throw new Error("HERMES_HOSTS is not valid JSON"); }
  const list = Array.isArray(parsed) ? parsed : Object.entries(parsed).map(([name, url]) => ({ name, url }));
  return list.map((h) => ({
    name: String(h.name),
    url: String(h.url).replace(/\/+$/, ""),
    apiKey: (h.api_key_env && env[h.api_key_env]) || env.HERMES_API_KEY || "",
    ssh: h.ssh ? String(h.ssh) : "",
    profile: h.profile ? String(h.profile) : "",
  }));
}
function getHost(name) {
  const hosts = loadHosts();
  const h = name ? hosts.find((x) => x.name === name) : hosts[0];
  if (!h) throw new Error(`Unknown host '${name}'. Configured: ${hosts.map((x) => x.name).join(", ") || "(none)"}`);
  return h;
}
const HEALTH_TIMEOUT = Number(env.HERMES_HEALTH_TIMEOUT_MS || 5000);
const ASK_TIMEOUT = Number(env.HERMES_ASK_TIMEOUT_MS || 30 * 60 * 1000);
const RUN_DIR = env.HERMES_RUN_DIR || path.join(os.homedir(), ".hermes-fleet-mcp", "runs");

async function timedFetch(url, opts = {}, timeoutMs = HEALTH_TIMEOUT) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  const t0 = performance.now();
  try {
    const res = await fetch(url, { ...opts, signal: ac.signal });
    const text = await res.text();
    let body; try { body = JSON.parse(text); } catch { body = text.slice(0, 500); }
    return { status: res.status, ok: res.ok, body, latency_ms: Math.round(performance.now() - t0) };
  } finally { clearTimeout(t); }
}
const auth = (h) => (h.apiKey ? { Authorization: `Bearer ${h.apiKey}` } : {});

async function healthOne(h) {
  try {
    const r = await timedFetch(`${h.url}/health`, { headers: auth(h) });
    const b = typeof r.body === "object" && r.body ? r.body : {};
    return {
      host: h.name, ok: r.ok, http_status: r.status, latency_ms: r.latency_ms,
      mode: b.mode ?? b.platform ?? null, version: b.version ?? null, status: b.status ?? null,
      verdict: r.ok ? "OK" : "FAIL",
    };
  } catch (e) {
    return { host: h.name, ok: false, verdict: "FAIL", error: e.name === "AbortError" ? `timeout after ${HEALTH_TIMEOUT}ms` : String(e.cause?.code || e.message) };
  }
}

// ---- async ask (submit and poll) ----
fs.mkdirSync(RUN_DIR, { recursive: true });
const runs = new Map();
function saveRun(r) { runs.set(r.run_id, r); try { fs.writeFileSync(path.join(RUN_DIR, `${r.run_id}.json`), JSON.stringify(r)); } catch {} }
function loadRun(id) {
  if (!/^[a-f0-9-]{36}$/.test(id)) return null;
  if (runs.has(id)) return runs.get(id);
  try { return JSON.parse(fs.readFileSync(path.join(RUN_DIR, `${id}.json`), "utf8")); } catch { return null; }
}
async function submitAsk({ host, prompt, model, system, session_id }) {
  if (!host) throw new Error("host is required (explicit host on every call)");
  const h = getHost(host);
  if (!prompt) throw new Error("prompt is required");
  const run = { run_id: randomUUID(), host: h.name, state: "running", submitted_at: new Date().toISOString() };
  // Preferred: Hermes native Runs API (POST /v1/runs, poll GET /v1/runs/{id}) - documented in user-guide/features/api-server
  try {
    const r = await timedFetch(`${h.url}/v1/runs`, {
      method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": run.run_id, ...auth(h) },
      body: JSON.stringify({ input: prompt, ...(system ? { instructions: system } : {}), ...(session_id ? { session_id } : {}), ...(model ? { model } : {}) }),
    }, 15000);
    if (r.ok && r.body?.run_id) {
      saveRun({ ...run, mode: "native-runs", remote_run_id: r.body.run_id });
      return { run_id: run.run_id, host: h.name, state: "running", mode: "native-runs", next: "Call get_result with this run_id; poll every 10-30s." };
    }
    if (r.status === 401) throw new Error("401 from Hermes: wrong or rotated Bearer key");
  } catch (e) { if (String(e.message).startsWith("401")) throw e; }
  // Fallback: background /v1/chat/completions held by this server
  saveRun({ ...run, mode: "local-background" });
  const messages = [...(system ? [{ role: "system", content: system }] : []), { role: "user", content: prompt }];
  timedFetch(`${h.url}/v1/chat/completions`, {
    method: "POST", headers: { "Content-Type": "application/json", ...auth(h) },
    body: JSON.stringify({ model: model || env.HERMES_MODEL || "hermes-agent", messages, stream: false }),
  }, ASK_TIMEOUT).then((r) => {
    if (!r.ok) return saveRun({ ...run, mode: "local-background", state: "failed", http_status: r.status, error: typeof r.body === "string" ? r.body : JSON.stringify(r.body).slice(0, 500), finished_at: new Date().toISOString() });
    const text = r.body?.choices?.[0]?.message?.content ?? (typeof r.body === "string" ? r.body : JSON.stringify(r.body));
    saveRun({ ...run, mode: "local-background", state: "done", latency_ms: r.latency_ms, result: text, finished_at: new Date().toISOString() });
  }).catch((e) => saveRun({ ...run, mode: "local-background", state: "failed", error: e.name === "AbortError" ? "ask timeout" : String(e.cause?.code || e.message), finished_at: new Date().toISOString() }));
  return { run_id: run.run_id, host: h.name, state: "running", mode: "local-background", next: "Call get_result with this run_id; poll every 10-30s." };
}
async function getResult(run_id) {
  const r = loadRun(run_id);
  if (!r) return { run_id, state: "unknown", error: "No such run" };
  if (r.mode !== "native-runs" || r.state !== "running") return r;
  const h = getHost(r.host);
  try {
    const x = await timedFetch(`${h.url}/v1/runs/${encodeURIComponent(r.remote_run_id)}`, { headers: auth(h) });
    const st = x.body?.status;
    if (!x.ok) return { ...r, poll_error: `HTTP ${x.status}` };
    if (st === "completed") { const d = { ...r, state: "done", result: x.body.output, usage: x.body.usage, runtime: x.body.runtime, finished_at: new Date().toISOString() }; saveRun(d); return d; }
    if (["failed", "cancelled", "interrupted"].includes(st)) { const d = { ...r, state: "failed", remote_status: st, error: x.body.error || st, finished_at: new Date().toISOString() }; saveRun(d); return d; }
    return { ...r, remote_status: st, ...(x.body.shutdown_requested_at ? { warning: "gateway is draining; run will end interrupted" } : {}) };
  } catch (e) { return { ...r, poll_error: String(e.cause?.code || e.message) }; }
}

// ---- golden rule: official docs first ----
const DOCS_URLS = (env.HERMES_DOCS_URLS || "https://hermes-agent.nousresearch.com/docs/llms.txt,https://raw.githubusercontent.com/NousResearch/hermes-agent/main/README.md").split(",").map((x) => x.trim()).filter(Boolean);
const DOCS_BASE = env.HERMES_DOCS_BASE || "https://hermes-agent.nousresearch.com/docs/";
const docCache = new Map();
// timedFetch truncates non-JSON bodies; use a raw fetch for docs
async function fetchRaw(url) {
  const ac = new AbortController(); const t = setTimeout(() => ac.abort(), 15000);
  try { const res = await fetch(url, { signal: ac.signal }); if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`); return await res.text(); } finally { clearTimeout(t); }
}
async function docText(url) {
  if (docCache.has(url)) return docCache.get(url);
  let t = await fetchRaw(url);
  if (/<html/i.test(t)) {
    const m = t.match(/<article[\s\S]*?<\/article>/i); if (m) t = m[0];
    t = t.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, "").replace(/<(br|\/p|\/li|\/tr|\/h\d|\/pre|\/div)[^>]*>/gi, "\n").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\n\s*\n+/g, "\n");
  }
  docCache.set(url, t); return t;
}
function grepLines(text, terms, max = 12, ctx = 1) {
  const lines = text.split("\n"); const out = []; const seen = new Set();
  const score = (l) => terms.reduce((n, t) => n + (l.toLowerCase().includes(t) ? 1 : 0), 0);
  const ranked = lines.map((l, i) => [score(l), i]).filter(([s]) => s > 0).sort((a, b) => b[0] - a[0] || a[1] - b[1]).slice(0, max);
  for (const [, i] of ranked.sort((a, b) => a[1] - b[1])) for (let j = Math.max(0, i - ctx); j <= Math.min(lines.length - 1, i + ctx); j++) if (!seen.has(j)) { seen.add(j); out.push(lines[j].slice(0, 400)); }
  return out;
}
async function hermesDocs({ query, page, max_lines = 12 }) {
  const out = { golden_rule: "Official Hermes docs consulted before acting. If the answer is not below, say 'not in official docs' and mark the step UNVERIFIED.", sources: [], matches: [] };
  if (page) {
    const url = /^https?:/.test(page) ? page : DOCS_BASE + page.replace(/^\/+/, "");
    const allowed = [DOCS_BASE, ...DOCS_URLS].some((u) => url.startsWith(new URL(u).origin));
    if (!allowed) throw new Error("page must be on an official docs origin (HERMES_DOCS_BASE / HERMES_DOCS_URLS)");
    const t = await docText(url); out.sources.push(url);
    out.matches.push({ url, lines: query ? grepLines(t, query.toLowerCase().split(/\s+/).filter(Boolean), max_lines, 2) : t.slice(0, 6000).split("\n") });
    return out;
  }
  if (!query) throw new Error("query or page is required");
  const terms = query.toLowerCase().split(/\s+/).filter((w) => w.length > 1);
  for (const url of DOCS_URLS) {
    try { const t = await docText(url); out.sources.push(url); const l = grepLines(t, terms, max_lines); if (l.length) out.matches.push({ url, lines: l }); }
    catch (e) { out.matches.push({ url, error: e.message }); }
  }
  const pages = out.matches.flatMap((m) => (m.lines || []).join("\n").match(/https?:\/\/[^\s)]+/g) || []).filter((u) => u.startsWith(DOCS_BASE));
  out.suggested_pages = [...new Set(pages)].slice(0, 5);
  if (!out.matches.some((m) => m.lines?.length)) out.verdict = "NOT IN OFFICIAL DOCS (for this query). Mark any related step UNVERIFIED; do not invent.";
  out.next = "Fetch a suggested page with hermes_docs {page, query} for the exact command/flags before acting.";
  return out;
}
// Doc page each mutating/remote action must be checked against
const ACTION_DOCS = {
  gateway_restart: { page: "reference/cli-commands", query: "gateway restart status" },
  update: { page: "getting-started/updating", query: "update --plan --check --backup rollback" },
  host_command: { page: "reference/cli-commands", query: "" },
};
async function docEvidence(action, extra = "") {
  const a = ACTION_DOCS[action]; if (!a) return { warning: "No doc mapping for this action: consult hermes_docs before confirm=true." };
  try { const d = await hermesDocs({ page: a.page, query: `${a.query} ${extra}`.trim() || action, max_lines: 6 }); return { doc_url: d.sources[0], excerpt: d.matches[0]?.lines?.slice(0, 18) }; }
  catch (e) { return { doc_url: DOCS_BASE + a.page, warning: `DOCS NOT CONSULTED (${e.message}). Read the page yourself before confirm=true; otherwise mark UNVERIFIED.` }; }
}

// ---- exec adapter (disabled by default) ----
// HERMES_EXEC_ADAPTER = none | ssh | hermes-run
// Read-only commands are allowlisted; mutating commands need confirm=true and an explicit host.
const READONLY = {
  version: ["hermes", "--version"], status: ["hermes", "status"], doctor: ["hermes", "doctor"], dump: ["hermes", "dump"],
  gateway_status: ["hermes", "gateway", "status"], gateway_list: ["hermes", "gateway", "list"],
  update_check: ["hermes", "update", "--check"], update_plan: ["hermes", "update", "--plan"],
  logs_errors: ["hermes", "logs", "errors", "--since", "1h"], logs_gateway: ["hermes", "logs", "gateway", "-n", "100"],
  usage: ["hermes", "usage", "--json"], fallback_list: ["hermes", "fallback", "list"], auth_status: ["hermes", "auth", "status"],
  memory_status: ["hermes", "memory", "status"], profile_list: ["hermes", "profile", "list"], skills_list: ["hermes", "skills", "list"],
  secrets_bitwarden_status: ["hermes", "secrets", "bitwarden", "status"], config_check: ["hermes", "config", "check"],
};
const MUTATING = {
  gateway_restart: ["hermes", "gateway", "restart"],
  update_backup: ["hermes", "update", "--backup"],
};
async function execOnHost(h, argv) {
  const adapter = env.HERMES_EXEC_ADAPTER || "none";
  const cmd = argv.map((a) => (/^[A-Za-z0-9_./:=-]+$/.test(a) ? a : shq(a))).join(" ");
  if (adapter === "ssh") {
    if (!h.ssh) throw new Error(`host '${h.name}' has no "ssh" target configured in HERMES_HOSTS`);
    const out = await sshRun(h.ssh, `bash -lc ${shq(cmd)}`);
    return { adapter, command: cmd, output: out.slice(-8000) };
  }
  if (adapter === "hermes-run") {
    const s = await submitAsk({ host: h.name, prompt: `Run exactly this shell command on this machine and reply with only its raw stdout/stderr and exit code. Do not run anything else.\n\n${cmd}` });
    return { adapter, command: cmd, run_id: s.run_id, note: "Agent-mediated execution; poll get_result. Less deterministic than ssh." };
  }
  throw new Error("Exec adapter disabled (HERMES_EXEC_ADAPTER=none). Run the command yourself on the host, or enable 'ssh' / 'hermes-run'.");
}

// ---- mailbox fallback ----
function mailboxTarget() {
  if (env.HERMES_MAILBOX_SSH) return { kind: "ssh", spec: env.HERMES_MAILBOX_SSH }; // user@host:/abs/path
  if (env.HERMES_MAILBOX_DIR) return { kind: "dir", dir: env.HERMES_MAILBOX_DIR };
  throw new Error("No mailbox configured: set HERMES_MAILBOX_DIR or HERMES_MAILBOX_SSH");
}
const safe = (s) => String(s || "").replace(/[^A-Za-z0-9_.-]/g, "_").slice(0, 64);
function sshRun(target, cmd, input) {
  return new Promise((resolve, reject) => {
    const p = spawn("ssh", ["-o", "BatchMode=yes", "-o", "ConnectTimeout=10", target, cmd]);
    let out = "", err = "";
    p.stdout.on("data", (d) => (out += d)); p.stderr.on("data", (d) => (err += d));
    p.on("close", (c) => (c === 0 ? resolve(out) : reject(new Error(`ssh exit ${c}: ${err.slice(0, 300)}`))));
    if (input) p.stdin.end(input); else p.stdin.end();
  });
}
const shq = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;
async function mailboxSend({ to, from, subject, body }) {
  if (!to || !body) throw new Error("to and body are required");
  const msg = { id: randomUUID(), to, from: from || env.HERMES_MAILBOX_SELF || "grok-bot", subject: subject || "", body, sent_at: new Date().toISOString() };
  const file = `${Date.now()}-${msg.id}.json`;
  const t = mailboxTarget();
  if (t.kind === "dir") {
    const dir = path.join(t.dir, safe(to), "inbox"); fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, file + ".tmp"), JSON.stringify(msg, null, 2));
    fs.renameSync(path.join(dir, file + ".tmp"), path.join(dir, file)); // atomic drop
  } else {
    const [target, base] = t.spec.split(/:(.*)/s);
    const dir = `${base}/${safe(to)}/inbox`;
    await sshRun(target, `mkdir -p ${shq(dir)} && cat > ${shq(dir + "/" + file + ".tmp")} && mv ${shq(dir + "/" + file + ".tmp")} ${shq(dir + "/" + file)}`, JSON.stringify(msg));
  }
  return { delivered: true, id: msg.id, to: msg.to, via: t.kind };
}
async function mailboxRead({ box, limit = 20, archive = false }) {
  const me = safe(box || env.HERMES_MAILBOX_SELF || "grok-bot");
  const t = mailboxTarget();
  let msgs = [];
  if (t.kind === "dir") {
    const dir = path.join(t.dir, me, "inbox");
    const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith(".json")).sort().slice(0, limit) : [];
    for (const f of files) {
      msgs.push(JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")));
      if (archive) { const a = path.join(t.dir, me, "archive"); fs.mkdirSync(a, { recursive: true }); fs.renameSync(path.join(dir, f), path.join(a, f)); }
    }
  } else {
    const [target, base] = t.spec.split(/:(.*)/s);
    const dir = `${base}/${me}/inbox`;
    const out = await sshRun(target, `mkdir -p ${shq(dir)} && cd ${shq(dir)} && for f in $(ls -1 *.json 2>/dev/null | sort | head -n ${Number(limit) | 0}); do cat "$f"; echo; echo '\u001e'; ${archive ? `mkdir -p ../archive && mv "$f" ../archive/;` : ""} done`);
    msgs = out.split("\u001e").map((s) => s.trim()).filter(Boolean).map((s) => { try { return JSON.parse(s); } catch { return { raw: s.slice(0, 500) }; } });
  }
  return { box: me, count: msgs.length, messages: msgs };
}

// ---- tools ----
const tools = {
  fleet_health: {
    description: "GET /health on every configured Hermes host (or one). Reports ok, mode, version, latency. Fail-loud: any unreachable host is FAIL, never skipped.",
    inputSchema: { type: "object", properties: { host: { type: "string", description: "Optional single host name" } } },
    run: async ({ host }) => { const hs = host ? [getHost(host)] : loadHosts(); if (!hs.length) throw new Error("HERMES_HOSTS is empty"); return { checked_at: new Date().toISOString(), results: await Promise.all(hs.map(healthOne)) }; },
  },
  fleet_status: {
    description: "One-line rollup of fleet health: GREEN (all ok), YELLOW (some down), RED (all down), plus pending ask runs.",
    inputSchema: { type: "object", properties: {} },
    run: async () => {
      const hs = loadHosts(); const res = await Promise.all(hs.map(healthOne));
      const up = res.filter((r) => r.ok).length;
      const verdict = !hs.length ? "UNCONFIGURED" : up === hs.length ? "GREEN" : up === 0 ? "RED" : "YELLOW";
      const pending = [...runs.values()].filter((r) => r.state === "running").length;
      return { verdict, up, total: hs.length, down: res.filter((r) => !r.ok).map((r) => ({ host: r.host, error: r.error || `HTTP ${r.http_status}` })), pending_runs: pending,
        summary: `${verdict}: ${up}/${hs.length} Hermes hosts healthy; ${pending} ask run(s) in flight` };
    },
  },
  ask: {
    description: "Submit a prompt to an explicit Hermes host over its native HTTP API (:8642, Bearer). Uses the documented Runs API (POST /v1/runs) when available, else a server-held background /v1/chat/completions. Returns a run_id immediately; fetch the answer with get_result.",
    inputSchema: { type: "object", required: ["host", "prompt"], properties: { host: { type: "string" }, prompt: { type: "string" }, model: { type: "string" }, system: { type: "string" }, session_id: { type: "string" } } },
    run: async (a) => submitAsk(a),
  },
  get_result: {
    description: "Poll an ask run by run_id. state is running | done | failed.",
    inputSchema: { type: "object", required: ["run_id"], properties: { run_id: { type: "string" } } },
    run: async ({ run_id }) => getResult(run_id),
  },
  hermes_docs: {
    description: "GOLDEN RULE tool. Search or fetch the official Hermes Agent docs (Nous Research docs + hermes-agent GitHub README) BEFORE any Hermes action, answer, command, config change or troubleshooting step. query searches the docs index; page fetches one docs page (path under the docs base, e.g. 'reference/cli-commands') optionally filtered by query.",
    inputSchema: { type: "object", properties: { query: { type: "string" }, page: { type: "string" }, max_lines: { type: "number" } } },
    run: hermesDocs,
  },
  fleet_version: {
    description: "Version per host plus drift. Reads /health, /health/detailed and /v1/capabilities over HTTP (no exec). If Hermes does not expose a version there, reports null and tells you how to get it.",
    inputSchema: { type: "object", properties: { host: { type: "string" } } },
    run: async ({ host }) => {
      const hs = host ? [getHost(host)] : loadHosts();
      const rows = await Promise.all(hs.map(async (h) => {
        const row = { host: h.name };
        for (const p of ["/health", "/health/detailed", "/v1/capabilities"]) {
          try { const r = await timedFetch(h.url + p, { headers: auth(h) }); if (r.ok && typeof r.body === "object") { const v = r.body.version ?? r.body.hermes_version ?? r.body.server?.version ?? r.body.build?.version; if (v && !row.version) { row.version = String(v); row.source = p; } } }
          catch (e) { row.error = String(e.cause?.code || e.message); }
        }
        if (!row.version) row.version = null;
        return row;
      }));
      const versions = [...new Set(rows.map((r) => r.version).filter(Boolean))];
      return { drift: versions.length > 1, versions, hosts: rows,
        ...(rows.some((r) => !r.version) ? { note: "Version not exposed over HTTP for some hosts: run `hermes --version` there (host_command action=version) - see reference/cli-commands." } : {}) };
    },
  },
  config_drift: {
    description: "Compare installed skills across hosts via GET /v1/skills (documented, read-only). Hashes each host's skill set; compares against a declared manifest (HERMES_FLEET_MANIFEST JSON file: {\"skills\":[...]}) or, if none, against the fleet majority. Reports missing/extra per host.",
    inputSchema: { type: "object", properties: { host: { type: "string" } } },
    run: async ({ host }) => {
      const hs = host ? [getHost(host)] : loadHosts();
      const { createHash } = await import("node:crypto");
      const rows = await Promise.all(hs.map(async (h) => {
        try {
          const r = await timedFetch(`${h.url}/v1/skills`, { headers: auth(h) });
          if (!r.ok) return { host: h.name, error: `HTTP ${r.status}` };
          const list = Array.isArray(r.body) ? r.body : r.body?.data || r.body?.skills || [];
          const names = list.map((s) => (typeof s === "string" ? s : `${s.name}${s.version ? "@" + s.version : ""}`)).sort();
          return { host: h.name, count: names.length, hash: createHash("sha256").update(names.join("\n")).digest("hex").slice(0, 12), names };
        } catch (e) { return { host: h.name, error: String(e.cause?.code || e.message) }; }
      }));
      let declared = null;
      if (env.HERMES_FLEET_MANIFEST) { try { declared = JSON.parse(fs.readFileSync(env.HERMES_FLEET_MANIFEST, "utf8")).skills.slice().sort(); } catch (e) { return { error: `cannot read HERMES_FLEET_MANIFEST: ${e.message}` }; } }
      const ok = rows.filter((r) => r.names);
      if (!declared && ok.length) { const counts = {}; ok.forEach((r) => (counts[r.hash] = (counts[r.hash] || 0) + 1)); const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0]; declared = ok.find((r) => r.hash === top).names; }
      const base = declared ? declared.map((n) => n.split("@")[0]) : [];
      const report = rows.map((r) => r.names ? { host: r.host, hash: r.hash, count: r.count, missing: (declared || []).filter((n) => !r.names.includes(n)), extra: r.names.filter((n) => !(declared || []).includes(n)) } : r);
      return { baseline: env.HERMES_FLEET_MANIFEST ? "declared-manifest" : "fleet-majority", drift: report.some((r) => r.error || r.missing?.length || r.extra?.length), hosts: report };
    },
  },
  inference_status: {
    description: "Read provider/model/readiness info Hermes exposes over HTTP (/health/detailed, /v1/models, /api/model/options). Quota windows are not exposed over HTTP: use host_command action=usage (runs `hermes usage --json`) or run it on the host.",
    inputSchema: { type: "object", required: ["host"], properties: { host: { type: "string" } } },
    run: async ({ host }) => {
      const h = getHost(host); const out = { host: h.name };
      for (const [k, p] of [["detailed", "/health/detailed"], ["models", "/v1/models"], ["model_options", "/api/model/options"]]) {
        try { const r = await timedFetch(h.url + p, { headers: auth(h) }); out[k] = r.ok ? r.body : { http_status: r.status }; } catch (e) { out[k] = { error: String(e.cause?.code || e.message) }; }
      }
      out.quota = "Run `hermes usage --json` on the host (host_command action=usage) for rate-limit windows; `hermes fallback list` for the fallback chain. See reference/cli-commands.";
      return out;
    },
  },
  host_command: {
    description: "Run ONE allowlisted read-only Hermes CLI command on an explicit host through the operator's exec adapter (disabled by default). Actions: " + Object.keys(READONLY).join(", ") + ".",
    inputSchema: { type: "object", required: ["host", "action"], properties: { host: { type: "string" }, action: { type: "string", enum: Object.keys(READONLY) }, profile: { type: "string" } } },
    run: async ({ host, action, profile }) => {
      if (!host) throw new Error("host is required");
      const argv = READONLY[action]; if (!argv) throw new Error(`action not allowlisted: ${action}`);
      const h = getHost(host); const p = profile || h.profile;
      return execOnHost(h, p ? [argv[0], "-p", p, ...argv.slice(1)] : argv);
    },
  },
  gateway_restart: {
    description: "Restart the Hermes gateway on ONE explicit host (`hermes gateway restart`). DRY-RUN by default: returns the exact command, the official doc excerpt, and pre/post checks. Executes only with confirm=true and an enabled exec adapter.",
    inputSchema: { type: "object", required: ["host"], properties: { host: { type: "string" }, profile: { type: "string" }, all_profiles: { type: "boolean" }, confirm: { type: "boolean" } } },
    run: async ({ host, profile, all_profiles, confirm }) => {
      if (!host) throw new Error("host is required");
      const h = getHost(host); const p = profile || h.profile;
      const argv = [...MUTATING.gateway_restart.slice(0, 1), ...(p ? ["-p", p] : []), ...MUTATING.gateway_restart.slice(1), ...(all_profiles ? ["--all"] : [])];
      const pre = await healthOne(h);
      const docs = await docEvidence("gateway_restart");
      const plan = { host: h.name, command: argv.join(" "), pre_health: pre, docs,
        checks: ["Confirm the operator asked for a restart (in-flight runs end 'interrupted').", "Desktop-primary host with no supervised gateway? do NOT restart/install a gateway there.", "After: fleet_health host=<host> must be OK; host_command action=gateway_status."] };
      if (!confirm) return { dry_run: true, ...plan, to_execute: "re-call with confirm=true" };
      const res = await execOnHost(h, argv);
      await new Promise((r) => setTimeout(r, Number(env.HERMES_RESTART_SETTLE_MS || 5000)));
      return { dry_run: false, ...plan, result: res, post_health: await healthOne(h) };
    },
  },
  update_plan: {
    description: "Generate a canary-then-roll Hermes update plan (read-only): canary host first, pre-checks (`hermes update --plan`, `--check`, backup), verify version, rollback notes. With confirm=true AND an explicit host, executes ONLY that host's update step (`hermes update --backup`) via the exec adapter.",
    inputSchema: { type: "object", properties: { canary: { type: "string" }, host: { type: "string" }, confirm: { type: "boolean" } } },
    run: async ({ canary, host, confirm }) => {
      const hs = loadHosts(); if (!hs.length) throw new Error("HERMES_HOSTS is empty");
      const c = canary ? getHost(canary).name : hs[0].name;
      const health = await Promise.all(hs.map(healthOne));
      const docs = await docEvidence("update");
      const steps = [
        { step: 0, what: "Golden rule: read getting-started/updating (hermes_docs) - flags change between releases." },
        { step: 1, what: "fleet_status must be GREEN (or known-RED hosts excluded explicitly)." },
        { step: 2, what: `Canary ${c}: host_command action=update_plan (hermes update --plan) and action=update_check (hermes update --check).` },
        { step: 3, what: `Canary ${c}: update_plan host=${c} confirm=true (runs hermes update --backup; Hermes snapshots state and auto-rolls back on syntax failure).` },
        { step: 4, what: `Canary ${c}: fleet_version + fleet_health + host_command action=doctor; one tiny ask. Soak 15-60 min.` },
        { step: 5, what: "Roll remaining hosts one at a time, same checks after each; stop on first failure.", hosts: hs.filter((h) => h.name !== c).map((h) => h.name) },
        { step: 6, what: "fleet_version drift must be false at the end." },
        { step: "rollback", what: "Read the updating doc for pin/rollback options for your install kind (source checkout vs package vs desktop). Restore from the pre-update backup if needed. Anything not in the docs: UNVERIFIED - ask the operator." },
      ];
      const plan = { canary: c, health: health.map((x) => ({ host: x.host, verdict: x.verdict })), steps, docs };
      if (!confirm) return { dry_run: true, ...plan };
      if (!host) throw new Error("confirm=true requires an explicit host (one host per execution)");
      const h = getHost(host);
      if (h.name !== c && !(await healthOne(getHost(c))).ok) throw new Error(`canary ${c} is not healthy; refusing to roll ${h.name}`);
      return { dry_run: false, host: h.name, docs, result: await execOnHost(h, h.profile ? ["hermes", "-p", h.profile, "update", "--backup"] : MUTATING.update_backup) };
    },
  },
  mailbox_send: {
    description: "Fallback channel: drop a JSON message into a shared file mailbox (<dir>/<to>/inbox). Use only when HTTP is down; not a substitute for ask.",
    inputSchema: { type: "object", required: ["to", "body"], properties: { to: { type: "string" }, from: { type: "string" }, subject: { type: "string" }, body: { type: "string" } } },
    run: mailboxSend,
  },
  mailbox_read: {
    description: "Read messages from a mailbox inbox (default: HERMES_MAILBOX_SELF). archive=true moves them to archive after reading.",
    inputSchema: { type: "object", properties: { box: { type: "string" }, limit: { type: "number" }, archive: { type: "boolean" } } },
    run: mailboxRead,
  },
};

async function handle(msg) {
  const { id, method, params } = msg;
  const reply = (result) => ({ jsonrpc: "2.0", id, result });
  if (method === "initialize") return reply({ protocolVersion: params?.protocolVersion || "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "hermes-fleet", version: VERSION } });
  if (method === "ping") return reply({});
  if (method === "tools/list") return reply({ tools: Object.entries(tools).map(([name, t]) => ({ name, description: t.description, inputSchema: t.inputSchema })) });
  if (method === "tools/call") {
    const t = tools[params?.name];
    if (!t) return { jsonrpc: "2.0", id, error: { code: -32602, message: `Unknown tool ${params?.name}` } };
    try { const out = await t.run(params.arguments || {}); return reply({ content: [{ type: "text", text: JSON.stringify(out, null, 2) }] }); }
    catch (e) { return reply({ isError: true, content: [{ type: "text", text: `ERROR: ${e.message}` }] }); }
  }
  if (id === undefined) return null; // notification
  return { jsonrpc: "2.0", id, error: { code: -32601, message: `Method not found: ${method}` } };
}

if ((env.MCP_TRANSPORT || "stdio") === "http") {
  const port = Number(env.MCP_PORT || 8787), bind = env.MCP_BIND || "127.0.0.1";
  http.createServer(async (req, res) => {
    if (req.url !== "/mcp") { res.writeHead(404).end(); return; }
    if (env.MCP_AUTH_TOKEN && req.headers.authorization !== `Bearer ${env.MCP_AUTH_TOKEN}`) { res.writeHead(401).end(); return; }
    if (req.method !== "POST") { res.writeHead(405).end(); return; }
    let data = ""; for await (const c of req) data += c;
    try {
      const m = JSON.parse(data);
      const out = Array.isArray(m) ? (await Promise.all(m.map(handle))).filter(Boolean) : await handle(m);
      if (!out || (Array.isArray(out) && !out.length)) { res.writeHead(202).end(); return; }
      res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify(out));
    } catch { res.writeHead(400).end(); }
  }).listen(port, bind, () => console.error(`hermes-fleet MCP http on ${bind}:${port}/mcp`));
} else {
  const rl = readline.createInterface({ input: process.stdin });
  rl.on("line", async (line) => {
    if (!line.trim()) return;
    let m; try { m = JSON.parse(line); } catch { return; }
    const out = await handle(m); if (out) process.stdout.write(JSON.stringify(out) + "\n");
  });
}
