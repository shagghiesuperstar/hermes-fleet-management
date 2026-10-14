# Hermes Fleet Management

A Grok Bot plugin for running a fleet of [Nous Research Hermes Agent](https://hermes-agent.nousresearch.com/docs/) hosts from your Bots. It packages a field-tested two-way fallback bridge: the Hermes native HTTP API is the primary path, and a file mailbox is the fallback.

Created by [@pixelrainbownft](https://x.com/pixelrainbownft).

## What's inside
| Component | Path |
|---|---|
| MCP server (zero-dependency Node ≥ 18) | `server/index.mjs` |
| MCP config (stdio) | `mcp.json` |
| Remote/HTTP MCP config example | `mcp.remote.example.json` |
| Skills | `skills/` |
| Manifest | `.cursor-plugin/plugin.json`, `plugin.json` |

### Tools
| Tool | What it does |
|---|---|
| `fleet_health` | `GET /health` on every configured Hermes host (or one). Returns ok, mode, version, latency. Unreachable means FAIL. |
| `fleet_status` | Rollup: GREEN / YELLOW / RED, the hosts that are down, and how many ask runs are in flight. |
| `ask` | Sends a prompt to `POST /v1/chat/completions` on `:8642` with a Bearer key. Returns a `run_id` right away so long Hermes runs don't hit ~2-minute client timeouts. |
| `get_result` | Polls a run: `running`, `done` (with the answer), or `failed` (with the error). Runs are saved to disk under `HERMES_RUN_DIR`. |
| `mailbox_send` | Fallback channel. Drops a JSON message atomically into `<mailbox>/<to>/inbox/` in a local or shared folder, or over SSH. |
| `mailbox_read` | Reads an inbox and can archive what it read. |

### Skills
- **hermes-fleet-getting-started**: enable the Hermes API, configure the plugin, run a smoke test.
- **hermes-fleet-health-fail-loud**: daily or on-demand health check that fails loud.
- **hermes-bridge-method-chooser**: HTTP first, mailbox as fallback, and no shell-based asks.
- **hermes-fleet-survive-box-update**: a general way to restore the private-network path after a Grok Bot computer update.

## Install
1. Install the plugin from the marketplace, or clone this repo.
2. Set these fields (setup fields or env):

| Field | Required | Description |
|---|---|---|
| `HERMES_HOSTS` | yes | A JSON array `[{"name":"alpha","url":"http://hermes-alpha:8642","api_key_env":"OPTIONAL_PER_HOST_KEY_VAR"}]` or a map `{"alpha":"http://hermes-alpha:8642"}` |
| `HERMES_API_KEY` | yes | The default Bearer key, which matches `API_SERVER_KEY` on the hosts. Per-host keys go in `api_key_env`. |
| `HERMES_MAILBOX_DIR` | optional | The shared folder for the fallback mailbox |
| `HERMES_MAILBOX_SSH` | optional | `user@host:/abs/path`, used for a mailbox on a remote host (BatchMode SSH, file drops only) |
| `HERMES_MAILBOX_SELF` | optional | This bot's mailbox name (default `grok-bot`) |
| `HERMES_MODEL` | optional | The model id sent to Hermes (default `hermes-agent`) |
| `HERMES_HEALTH_TIMEOUT_MS` / `HERMES_ASK_TIMEOUT_MS` | optional | Timeouts. Defaults are 5 s and 30 min. |
| `HERMES_RUN_DIR` | optional | Where run records are stored (default `~/.hermes-fleet-mcp/runs`) |

3. On each Hermes host, set `API_SERVER_ENABLED=true`, use a strong `API_SERVER_KEY`, bind the API to a private interface, then restart the gateway.
4. Smoke test: `fleet_status`, then `ask` "reply pong", then `get_result`.

### Remote (HTTP) mode
Grok Bot connectors may require a URL-based MCP server. You can run the same server as an HTTP endpoint on a machine inside your private network:
```
MCP_TRANSPORT=http MCP_BIND=<private-ip> MCP_PORT=8787 MCP_AUTH_TOKEN=<secret> HERMES_HOSTS=... HERMES_API_KEY=... node server/index.mjs
```
Then point the connector at `http://<private-host>:8787/mcp` with `Authorization: Bearer <secret>` (see `mcp.remote.example.json`). Don't expose this endpoint to the public internet.

## Security notes
- **Private network only.** Keep Hermes `:8642` and the HTTP MCP endpoint on a VPN, mesh network, or LAN. Never use a public bind or a public tunnel.
- **Bearer auth everywhere.** Keys come from env or a secret store. They are never hardcoded, logged, or returned by tools.
- **No SSH relay for asks.** The plugin never runs Hermes commands over SSH. The only use of SSH is the optional mailbox file drop.
- The mailbox sanitizes names and writes atomically (tmp then rename). Anyone with access to the mailbox folder can read and write messages, so treat it as trusted-operators-only.
- The plugin never writes into Hermes memory.

## Develop / test
```
node test/mock-hermes.mjs &        # fake Hermes on 127.0.0.1:18642
node test/smoke.mjs                # stdio MCP: initialize, tools/list, fleet_health, fleet_status, ask/get_result, mailbox
```

## Credit
The bridge design and fleet lessons come from [@pixelrainbownft](https://x.com/pixelrainbownft). MIT licensed.
