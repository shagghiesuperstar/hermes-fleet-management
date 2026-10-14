import http from "node:http";
const KEY = process.env.MOCK_KEY || "test-key";
const port = Number(process.env.MOCK_PORT || 18642);
http.createServer(async (req, res) => {
  const j = (s, b) => res.writeHead(s, { "Content-Type": "application/json" }).end(JSON.stringify(b));
  if (req.url === "/health") return j(200, { status: "ok", mode: "http", version: "mock-0.0.1" });
  if (req.headers.authorization !== `Bearer ${KEY}`) return j(401, { error: "unauthorized" });
  if (req.url === "/v1/chat/completions" && req.method === "POST") {
    let d = ""; for await (const c of req) d += c;
    const p = JSON.parse(d); await new Promise((r) => setTimeout(r, 1500));
    return j(200, { choices: [{ message: { role: "assistant", content: `mock-hermes echo: ${p.messages.at(-1).content}` } }] });
  }
  j(404, {});
}).listen(port, "127.0.0.1", () => console.error(`mock hermes on ${port}`));
