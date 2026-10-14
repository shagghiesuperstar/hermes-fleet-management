import { spawn } from "node:child_process";
import fs from "node:fs"; import os from "node:os"; import path from "node:path";
const mb = fs.mkdtempSync(path.join(os.tmpdir(), "hf-mb-"));
const srv = spawn("node", [new URL("../server/index.mjs", import.meta.url).pathname], {
  env: { ...process.env, HERMES_API_KEY: "test-key", HERMES_MAILBOX_DIR: mb, HERMES_RUN_DIR: path.join(mb, "runs"),
    HERMES_HOSTS: JSON.stringify([{ name: "mock-up", url: "http://127.0.0.1:18642" }, { name: "mock-down", url: "http://127.0.0.1:18699" }]) },
  stdio: ["pipe", "pipe", "inherit"] });
let buf = ""; const waiters = new Map(); let n = 0;
srv.stdout.on("data", (d) => { buf += d; let i; while ((i = buf.indexOf("\n")) >= 0) { const m = JSON.parse(buf.slice(0, i)); buf = buf.slice(i + 1); waiters.get(m.id)?.(m); } });
const rpc = (method, params) => new Promise((r) => { const id = ++n; waiters.set(id, r); srv.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n"); });
const call = async (name, args = {}) => { const r = await rpc("tools/call", { name, arguments: args }); const t = r.result.content[0].text; console.log(`\n### ${name} ${JSON.stringify(args)}\n${t}`); try { return JSON.parse(t); } catch { return t; } };
const init = await rpc("initialize", { protocolVersion: "2025-06-18" }); console.log("initialize:", JSON.stringify(init.result.serverInfo));
const tl = await rpc("tools/list", {}); console.log("tools:", tl.result.tools.map((t) => t.name).join(", "));
await call("fleet_health"); await call("fleet_status");
const run = await call("ask", { host: "mock-up", prompt: "reply pong" });
let r; do { await new Promise((z) => setTimeout(z, 500)); r = await call("get_result", { run_id: run.run_id }); } while (r.state === "running");
await call("mailbox_send", { to: "hermes-alpha", subject: "test", body: "fallback hello" });
await call("mailbox_read", { box: "hermes-alpha", archive: true });
const ok = r.state === "done" && tl.result.tools.length === 6;
console.log(`\nSMOKE ${ok ? "PASS" : "FAIL"}`); srv.kill(); process.exit(ok ? 0 : 1);
