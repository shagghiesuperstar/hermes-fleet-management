// Mock Hermes API server(s) + mock official-docs server for tests. No real hosts are contacted.
import http from "node:http";
const KEY = process.env.MOCK_KEY || "test-key";
const runs = new Map();
function hermes(port, version, skills, opts = {}) {
  http.createServer(async (req, res) => {
    const j = (s, b) => res.writeHead(s, { "Content-Type": "application/json" }).end(JSON.stringify(b));
    if (req.url === "/health") return j(200, { status: "ok", platform: "hermes-agent" });
    if (req.headers.authorization !== `Bearer ${KEY}`) return j(401, { error: "unauthorized" });
    if (req.url === "/health/detailed") return j(200, opts.detailed || { status: "ok", version, readiness: { checks: { model: "ok", disk: "ok" } } });
    if (req.url === "/v1/models") return j(200, { object: "list", data: [{ id: "hermes-agent" }] });
    if (req.url === "/v1/skills" && opts.skills500) return j(500, { error: { message: "Failed to enumerate skills", type: "server_error" } });
    if (req.url === "/v1/skills") return j(200, { data: skills.map((name) => ({ name })) });
    if (req.url === "/v1/runs" && req.method === "POST") {
      let d = ""; for await (const c of req) d += c; const p = JSON.parse(d);
      const id = "run_" + Math.random().toString(36).slice(2); runs.set(id, { at: Date.now(), input: p.input });
      return j(202, { run_id: id, status: "started" });
    }
    const m = req.url.match(/^\/v1\/runs\/([\w-]+)$/);
    if (m) { const r = runs.get(m[1]); if (!r) return j(404, {}); const done = Date.now() - r.at > 1200;
      return j(200, { object: "hermes.run", run_id: m[1], status: done ? "completed" : "running", ...(done ? { output: `mock-hermes: ${r.input}`, runtime: { provider: "mock", model: "mock-1" } } : {}) }); }
    j(404, {});
  }).listen(port, "127.0.0.1");
}
hermes(18642, "9.9.1", ["alpha-skill", "beta-skill", "gamma-skill"]);
hermes(18643, "9.9.0", ["alpha-skill", "beta-skill"]);
// 0.22.0 shape: /health ok but gateway draining + readiness degraded; /v1/skills 500 (seen live on 0.22.0)
hermes(18644, "0.22.0", [], { skills500: true, detailed: { status: "ok", version: "0.22.0", gateway_state: "draining", readiness: { status: "degraded", checks: { model: { status: "ok" }, disk: { status: "degraded" }, gateway: { status: "ok", state: "draining" } } } } });
http.createServer((req, res) => {
  if (req.url === "/docs/llms.txt") return res.end("# Hermes Agent\n- [CLI Commands](http://127.0.0.1:18650/docs/reference/cli-commands): commands incl. gateway restart\n- [Updating](http://127.0.0.1:18650/docs/getting-started/updating): hermes update --plan --check --backup\n");
  if (req.url === "/docs/reference/cli-commands") return res.end("<html><article><h1>CLI</h1><p>restart</p><p>Restart the service.</p><p>status</p><p>Show service status.</p></article></html>");
  if (req.url === "/docs/getting-started/updating") return res.end("<html><article><p>hermes update --plan is read-only.</p><p>hermes update --check previews.</p><p>hermes update --backup takes a full backup.</p></article></html>");
  if (req.url === "/docs/entities") return res.end("<html><article><p>This build doesn&#x27;t get updates&#33;</p></article></html>");
  res.writeHead(404).end();
}).listen(18650, "127.0.0.1", () => console.error("mock hermes on 18642/18643, docs on 18650"));
