// End-to-end smoke + regression checks (compound engineering: every lesson gets a check here).
import { spawn } from "node:child_process";
import fs from "node:fs"; import os from "node:os"; import path from "node:path";
const root = new URL("..", import.meta.url).pathname;
const mb = fs.mkdtempSync(path.join(os.tmpdir(), "hf-mb-"));
const HOSTS = [{ name: "mock-a", url: "http://127.0.0.1:18642", ssh: "operator@mock-a" }, { name: "mock-b", url: "http://127.0.0.1:18643", ssh: "operator@mock-b" }, { name: "mock-down", url: "http://127.0.0.1:18699" }];
function start(extra = {}) {
  const srv = spawn("node", [path.join(root, "server/index.mjs")], {
    env: { ...process.env, PATH: `${path.join(root, "test/fakebin")}:${process.env.PATH}`, HERMES_API_KEY: "test-key", HERMES_MAILBOX_DIR: mb, HERMES_RUN_DIR: path.join(mb, "runs"),
      HERMES_HOSTS: JSON.stringify(HOSTS), HERMES_DOCS_URLS: "http://127.0.0.1:18650/docs/llms.txt", HERMES_DOCS_BASE: "http://127.0.0.1:18650/docs/", HERMES_RESTART_SETTLE_MS: "100", ...extra },
    stdio: ["pipe", "pipe", "inherit"] });
  let buf = ""; const waiters = new Map(); let n = 0;
  srv.stdout.on("data", (d) => { buf += d; let i; while ((i = buf.indexOf("\n")) >= 0) { const m = JSON.parse(buf.slice(0, i)); buf = buf.slice(i + 1); waiters.get(m.id)?.(m); } });
  const rpc = (method, params) => new Promise((r) => { const id = ++n; waiters.set(id, r); srv.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n"); });
  const call = async (name, args = {}, quiet = false) => { const r = await rpc("tools/call", { name, arguments: args }); const t = r.result.content[0].text; if (!quiet) console.log(`\n### ${name} ${JSON.stringify(args)}\n${t.slice(0, 1500)}`); try { return JSON.parse(t); } catch { return t; } };
  return { srv, rpc, call };
}
const results = []; const check = (name, cond) => { results.push([name, !!cond]); };
const A = start();
const init = await A.rpc("initialize", { protocolVersion: "2025-06-18" });
check("server reports v2.0.0", init.result.serverInfo.version === "2.0.0");
const tl = await A.rpc("tools/list", {}); const names = tl.result.tools.map((t) => t.name); console.log("tools:", names.join(", "));
check("13 tools listed", names.length === 13);
const fh = await A.call("fleet_health");
check("LESSON fail-loud: unreachable host is FAIL, not skipped", fh.results.find((r) => r.host === "mock-down")?.verdict === "FAIL");
const fs1 = await A.call("fleet_status"); check("fleet_status YELLOW with one host down", fs1.verdict === "YELLOW");
const fv = await A.call("fleet_version"); check("fleet_version detects drift 9.9.1 vs 9.9.0", fv.drift === true && fv.versions.length === 2);
const cd = await A.call("config_drift"); check("config_drift flags host missing gamma-skill", cd.hosts.find((h) => h.host === "mock-b")?.missing?.includes("gamma-skill"));
const is = await A.call("inference_status", { host: "mock-a" }); check("inference_status reads /v1/models", is.models?.data?.[0]?.id === "hermes-agent");
const noHost = await A.call("ask", { prompt: "x" }, true); check("LESSON explicit host required for ask", String(noHost).includes("host is required"));
const run = await A.call("ask", { host: "mock-a", prompt: "reply pong" }); check("ask uses native /v1/runs", run.mode === "native-runs");
let r; do { await new Promise((z) => setTimeout(z, 400)); r = await A.call("get_result", { run_id: run.run_id }, true); } while (r.state === "running");
console.log("\n### get_result (final)\n" + JSON.stringify(r, null, 2)); check("LESSON async ask completes via polling", r.state === "done" && r.result.includes("pong"));
const docs = await A.call("hermes_docs", { query: "gateway restart" }); check("hermes_docs finds doc lines", docs.matches.some((m) => m.lines?.length));
const nodoc = await A.call("hermes_docs", { query: "zzqqxx-nonexistent" }, true); check("GOLDEN RULE: missing topic reported NOT IN OFFICIAL DOCS", String(nodoc.verdict).startsWith("NOT IN OFFICIAL DOCS"));
const bad = await A.call("hermes_docs", { page: "https://evil.example/x" }, true); check("hermes_docs refuses non-official origins", String(bad).includes("official docs origin"));
const dry = await A.call("gateway_restart", { host: "mock-a" }); check("SAFETY gateway_restart is dry-run by default", dry.dry_run === true && dry.command === "hermes gateway restart");
check("GOLDEN RULE dry-run carries doc link + excerpt", dry.docs?.doc_url?.includes("cli-commands") && dry.docs.excerpt?.length > 0);
const off = await A.call("gateway_restart", { host: "mock-a", confirm: true }, true); check("SAFETY confirm with exec adapter disabled refuses", String(off).includes("Exec adapter disabled"));
const up = await A.call("update_plan", { canary: "mock-a" }); check("update_plan dry-run puts canary first, docs attached", up.dry_run && up.canary === "mock-a" && up.docs?.doc_url?.includes("updating"));
const upNoHost = await A.call("update_plan", { confirm: true }, true); check("SAFETY update confirm requires explicit host", String(upNoHost).includes("explicit host"));
const hc = await A.call("host_command", { host: "mock-a", action: "rm -rf /" }, true); check("SAFETY host_command rejects non-allowlisted", String(hc).includes("not allowlisted"));
await A.call("mailbox_send", { to: "hermes-alpha", subject: "test", body: "fallback hello" });
const mr = await A.call("mailbox_read", { box: "hermes-alpha", archive: true }); check("mailbox round-trip", mr.count === 1);
const allText = JSON.stringify([fh, fv, cd, is, run, r, dry, up]); check("LESSON no secrets in tool output", !allText.includes("test-key"));
A.srv.kill();
// confirm path with the ssh adapter (fake ssh binary; nothing leaves the box)
const B = start({ HERMES_EXEC_ADAPTER: "ssh" });
const live = await B.call("gateway_restart", { host: "mock-a", confirm: true }); check("confirm=true executes via adapter (fake ssh)", live.dry_run === false && String(live.result?.output).includes("hermes gateway restart"));
const ver = await B.call("host_command", { host: "mock-b", action: "version" }); check("host_command read-only via adapter", String(ver.output).includes("hermes --version"));
const upLive = await B.call("update_plan", { host: "mock-a", confirm: true }); check("update confirm runs only that host", upLive.host === "mock-a" && String(upLive.result.output).includes("hermes update --backup"));
B.srv.kill();
// 0.22.0 regressions (live test 2026-10-14): draining/degraded must not read GREEN; /v1/skills 500 must not claim drift
const C = start({ HERMES_HOSTS: JSON.stringify([{ name: "mock-022", url: "http://127.0.0.1:18644" }]) });
const ch = await C.call("fleet_health"); const c0 = ch.results[0];
check("LESSON 0.22.0: draining gateway / degraded readiness is WARN, not OK", c0.verdict === "WARN" && c0.gateway_state === "draining" && c0.warnings.some((w) => w.includes("disk:degraded")));
const cs = await C.call("fleet_status"); check("fleet_status YELLOW when a host is WARN", cs.verdict === "YELLOW" && cs.warn.length === 1);
const cc = await C.call("config_drift"); check("config_drift: skills 500 -> drift unknown + server message", cc.drift === null && cc.hosts[0].error.includes("Failed to enumerate skills"));
C.srv.kill();
const docEnt = await (async () => { const D = start({ HERMES_DOCS_BASE: "http://127.0.0.1:18650/docs/" }); const x = await D.call("hermes_docs", { page: "entities", query: "" }, true); D.srv.kill(); return x; })();
check("hermes_docs decodes numeric HTML entities", JSON.stringify(docEnt).includes("doesn't") && !JSON.stringify(docEnt).includes("&#x27;"));
console.log("\n=== CHECKS"); for (const [n, ok] of results) console.log(`${ok ? "PASS" : "FAIL"}  ${n}`);
const failed = results.filter(([, ok]) => !ok).length; console.log(`\nSMOKE ${failed ? "FAIL" : "PASS"} (${results.length - failed}/${results.length})`); process.exit(failed ? 1 : 0);
