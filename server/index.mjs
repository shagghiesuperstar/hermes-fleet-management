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

const VERSION = "0.1.0";
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
function submitAsk({ host, prompt, model, system }) {
  const h = getHost(host);
  if (!prompt) throw new Error("prompt is required");
  const run = { run_id: randomUUID(), host: h.name, state: "running", submitted_at: new Date().toISOString() };
  saveRun(run);
  const messages = [...(system ? [{ role: "system", content: system }] : []), { role: "user", content: prompt }];
  timedFetch(`${h.url}/v1/chat/completions`, {
    method: "POST", headers: { "Content-Type": "application/json", ...auth(h) },
    body: JSON.stringify({ model: model || env.HERMES_MODEL || "hermes-agent", messages, stream: false }),
  }, ASK_TIMEOUT).then((r) => {
    if (!r.ok) return saveRun({ ...run, state: "failed", http_status: r.status, error: typeof r.body === "string" ? r.body : JSON.stringify(r.body).slice(0, 500), finished_at: new Date().toISOString() });
    const text = r.body?.choices?.[0]?.message?.content ?? (typeof r.body === "string" ? r.body : JSON.stringify(r.body));
    saveRun({ ...run, state: "done", latency_ms: r.latency_ms, result: text, finished_at: new Date().toISOString() });
  }).catch((e) => saveRun({ ...run, state: "failed", error: e.name === "AbortError" ? "ask timeout" : String(e.cause?.code || e.message), finished_at: new Date().toISOString() }));
  return { run_id: run.run_id, host: h.name, state: "running", next: "Call get_result with this run_id; poll every 10-30s." };
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
    description: "Submit a prompt to a Hermes host via its native HTTP API (:8642, OpenAI-compatible /v1/chat/completions, Bearer auth). Returns a run_id immediately so long runs survive client timeouts; fetch the answer with get_result.",
    inputSchema: { type: "object", required: ["prompt"], properties: { host: { type: "string" }, prompt: { type: "string" }, model: { type: "string" }, system: { type: "string" } } },
    run: async (a) => submitAsk(a),
  },
  get_result: {
    description: "Poll an ask run by run_id. state is running | done | failed.",
    inputSchema: { type: "object", required: ["run_id"], properties: { run_id: { type: "string" } } },
    run: async ({ run_id }) => loadRun(run_id) || { run_id, state: "unknown", error: "No such run (it may predate a server restart without HERMES_RUN_DIR persistence)" },
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
