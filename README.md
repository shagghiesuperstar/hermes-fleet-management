# Hermes Fleet Management

A Grok Bot plugin for running **any** fleet of [Nous Research Hermes Agent](https://hermes-agent.nousresearch.com/docs/) hosts: any OS Hermes runs on, any inference provider, one host or many. Created by [@pixelrainbownft](https://x.com/pixelrainbownft).

## Golden Rule: read the official Hermes docs first
**Before any Hermes action, answer, command, config change or troubleshooting step, the agent reads the official Hermes Agent docs for that topic. It does not guess or assume.**

- Sources: the docs index at https://hermes-agent.nousresearch.com/docs/llms.txt and the [hermes-agent repository](https://github.com/NousResearch/hermes-agent). On a host, `hermes <cmd> --help` is authoritative for the installed version.
- Tool: `hermes_docs` searches the official index or fetches a page. It only reads from official origins.
- Skill: `golden-rule-read-docs-first` is **step 0 of every skill** (a test enforces this).
- Mutating tools attach the relevant doc URL and excerpt to their dry-run output, or show **DOCS NOT CONSULTED** if the docs couldn't be fetched.
- If the docs don't cover something, the agent says **"not in official docs"** and marks it **UNVERIFIED**. It never invents commands, flags, endpoints or config keys. See [docs/COMMANDS.md](docs/COMMANDS.md) for what is verified and what isn't.

## Principles
1. **Golden Rule: official docs first.** Hermes changes quickly, and stale lore breaks production. Every skill starts by reading the docs. Every lesson cites a doc or is marked UNVERIFIED.
2. **Bitter-lesson engineering.** Thin, general tools; rich skills; let the model reason. The server has 13 small tools and no dependencies. It doesn't hard-code workflows or heuristics. For example, routing by cost and task is guidance in a skill, not a rules engine. A tool exists only when the model can't simply run a command itself, or when safety needs a gate (dry-run/confirm).
3. **Compound engineering.** Every incident becomes a skill or rule plus a regression check, logged in [docs/LESSONS.md](docs/LESSONS.md) and the [CHANGELOG](CHANGELOG.md). The loop is in `skills/compound-learnings`. `test/skills.test.mjs` fails any lesson that has no doc citation or UNVERIFIED mark.
4. **Safe by default.** Every host-specific action names its host explicitly. Mutations are dry-run unless `confirm=true`. The remote exec channel is off by default and limited to an allowlist.

## What's inside
| Component | Path |
|---|---|
| MCP server (zero-dependency Node ≥ 18; stdio or HTTP) | `server/index.mjs` |
| MCP config (stdio) / remote example | `mcp.json`, `mcp.remote.example.json` |
| Skills (19) | `skills/` |
| Manifests | `.cursor-plugin/plugin.json`, `plugin.json` |
| Lessons, verification ledger, changelog | `docs/LESSONS.md`, `docs/COMMANDS.md`, `CHANGELOG.md` |
| Tests (mock Hermes and docs servers, smoke, skills lint) | `test/` |

### Tools
| Tool | Kind | What it does |
|---|---|---|
| `hermes_docs` | read | Golden Rule: search or fetch the official Hermes docs |
| `fleet_health` | read | `GET /health` on every host: ok, mode, latency. Unreachable is FAIL. |
| `fleet_status` | read | GREEN/YELLOW/RED rollup plus asks in flight |
| `fleet_version` | read | Version per host (from `/health`, `/health/detailed`, `/v1/capabilities`) and drift |
| `config_drift` | read | Skill-set hash per host from `GET /v1/skills`, compared with a manifest or the fleet majority |
| `inference_status` | read | `/health/detailed`, `/v1/models`, `/api/model/options` for one host |
| `ask` / `get_result` | comms | Async ask through the native Runs API (`POST /v1/runs`, poll `GET /v1/runs/{id}`), falling back to a background chat-completions call |
| `mailbox_send` / `mailbox_read` | comms | File-mailbox fallback (local/shared folder or SSH file drop) |
| `host_command` | read via adapter | One allowlisted read-only `hermes` command (version, status, doctor, logs, usage, update --plan/--check, …) |
| `gateway_restart` | **mutating** | Dry-run by default (command, pre-health, doc excerpt). `confirm=true` executes on one host. |
| `update_plan` | **mutating** | Canary-then-roll plan (read-only). `confirm=true` with `host` runs `hermes update --backup` on that host only. |

## Coverage matrix
| Area | Skills | Tools |
|---|---|---|
| Docs-first | golden-rule-read-docs-first | hermes_docs |
| Maintenance | gateway-restart-and-crash-triage, logs-disk-process-hygiene, remote-host-ops-safety, desktop-primary-hosts | gateway_restart, host_command, inference_status |
| Updates | safe-fleet-update, os-reboot-survival, survive-box-update | update_plan, fleet_version, host_command |
| Inference | inference-routing-and-fallback, provider-relogin | inference_status, host_command (usage, fallback_list, auth_status), get_result (runtime) |
| Harness | getting-started, profiles-soul-skills-sync, config-drift, secrets-and-token-isolation | config_drift, fleet_version, host_command (config_check, dump, profile_list, skills_list, secrets_bitwarden_status) |
| Memory | shared-memory-backend | host_command (memory_status) |
| Comms | bridge-method-chooser, delegate-troubleshooting, fleet-health-fail-loud | ask, get_result, mailbox_send/read, fleet_health, fleet_status |
| Learning loop | compound-learnings | tests |

## Safety model
- **Private network only.** Keep Hermes `:8642` and the HTTP MCP endpoint off the public internet (see [Recommended architecture](#recommended-architecture)). The API server gives full access to Hermes' toolset, including the terminal, so `API_SERVER_KEY` is required on every deployment ([official API server docs](https://hermes-agent.nousresearch.com/docs/user-guide/features/api-server)).
- **Bearer auth everywhere.** Keys come from env or a secrets manager. They are never hardcoded, logged or returned (a test checks that no key appears in tool output).
- **Explicit host.** `ask`, `inference_status`, `host_command`, `gateway_restart` and `update_plan confirm=true` all require a host.
- **Dry-run by default.** Mutating tools return the exact command, pre-health and doc evidence. They execute only with `confirm=true`.
- **Exec adapter, off by default** (`HERMES_EXEC_ADAPTER`):
  - `none` (default): nothing runs remotely. Tools hand you the command to run yourself.
  - `ssh`: runs allowlisted commands over BatchMode SSH, using the `ssh` target set per host in `HERMES_HOSTS`. This is the operator's choice, and SSH is never used for asks.
  - `hermes-run`: asks the host's Hermes agent, through the Runs API, to run the exact command. Agent-mediated, so less deterministic.
- **Allowlist.** Only the read-only commands listed in `host_command` plus two mutations (`hermes gateway restart`, `hermes update --backup`). Everything else is the operator's job, on purpose.
- **Canary gate.** `update_plan` refuses to roll a non-canary host while the canary is unhealthy.
- **Official docs only.** `hermes_docs` refuses pages outside the configured official origins.

## Recommended architecture
**Preferred network: [Tailscale](https://tailscale.com).** Each Hermes host runs the official Hermes HTTP API server on port `8642`, bound to that host's tailnet address or MagicDNS name so it is never exposed on the public internet. This plugin talks to each host over HTTP/HTTPS on the tailnet, with a per-host bearer key (`API_SERVER_KEY` / `HERMES_API_KEY`). SSH relays are **not** recommended for talking to agents (asks use the HTTP API only). Use Tailscale ACLs/tags to limit who can reach `:8642`.

Other private networks work too (WireGuard, a LAN, a VPN): the plugin only needs a reachable base URL per host.

Example `HERMES_HOSTS` entries (placeholders only):

```json
[
  {"name":"hermes-a","url":"http://hermes-a.tailnet-name.ts.net:8642","api_key_env":"HERMES_A_API_KEY"},
  {"name":"hermes-b","url":"http://hermes-b.tailnet-name.ts.net:8642","api_key_env":"HERMES_B_API_KEY"}
]
```

**Golden Rule — official Hermes docs for bind/host settings.** Before changing API server bind or auth, read [user-guide/features/api-server](https://hermes-agent.nousresearch.com/docs/user-guide/features/api-server) (also [environment variables](https://hermes-agent.nousresearch.com/docs/reference/environment-variables)):

| Setting | Official default / notes |
|---|---|
| `API_SERVER_ENABLED` | `false` — must be `true` to serve the HTTP API |
| `API_SERVER_PORT` | `8642` |
| `API_SERVER_HOST` | `127.0.0.1` (localhost only by default). Set to the private/tailnet interface (or `0.0.0.0` only inside a trusted network) so fleet peers can reach it |
| `API_SERVER_KEY` | required bearer token on every deployment, including loopback |

Tailscale MagicDNS names, ACLs/tags, and “prefer Tailscale over SSH relays for agent talk” are **not in official Hermes docs** (UNVERIFIED / operator policy). Hermes documents the API server bind and auth; how you overlay the private network is yours.

## Install
1. Install from the marketplace, or clone this repo.
2. Set these fields (setup fields or env):

| Field | Required | Description |
|---|---|---|
| `HERMES_HOSTS` | yes | JSON array `[{"name":"alpha","url":"http://hermes-alpha:8642","api_key_env":"OPTIONAL_KEY_VAR","profile":"optional","ssh":"optional user@host for the ssh adapter"}]` or map `{"alpha":"http://hermes-alpha:8642"}` |
| `HERMES_API_KEY` | yes | Default Bearer key (matches the host's `API_SERVER_KEY`). Use one key per profile. |
| `HERMES_EXEC_ADAPTER` | optional | `none` (default) / `ssh` / `hermes-run` |
| `HERMES_FLEET_MANIFEST` | optional | Path to `{"skills":[...]}`, the declared baseline for `config_drift` |
| `HERMES_DOCS_URLS` / `HERMES_DOCS_BASE` | optional | Official docs sources (defaults: the docs `llms.txt` and the GitHub README / the docs base URL) |
| `HERMES_MAILBOX_DIR` / `HERMES_MAILBOX_SSH` / `HERMES_MAILBOX_SELF` | optional | Fallback mailbox |
| `HERMES_MODEL`, `HERMES_HEALTH_TIMEOUT_MS`, `HERMES_ASK_TIMEOUT_MS`, `HERMES_RUN_DIR` | optional | Tuning |

3. On each Hermes host, read the official [API server](https://hermes-agent.nousresearch.com/docs/user-guide/features/api-server) docs, then set `API_SERVER_ENABLED=true`, a strong `API_SERVER_KEY`, and `API_SERVER_HOST` to the host's private/tailnet address (default is `127.0.0.1` — localhost only). Restart the gateway. See [Recommended architecture](#recommended-architecture).
4. Smoke test: `fleet_status` → `ask host=<h> prompt="reply pong"` → `get_result` → `fleet_version` → `config_drift`.

### Remote (HTTP) mode
```
MCP_TRANSPORT=http MCP_BIND=<private-ip> MCP_PORT=8787 MCP_AUTH_TOKEN=<secret> HERMES_HOSTS=... HERMES_API_KEY=... node server/index.mjs
```
Point the connector at `http://<private-host>:8787/mcp` with `Authorization: Bearer <secret>` (see `mcp.remote.example.json`). Never expose it publicly.

## Develop / test
```
node test/mock-hermes.mjs &      # two mock Hermes hosts (version + skill drift, Runs API) and a mock docs server
node test/smoke.mjs              # 24 end-to-end checks incl. dry-run vs confirm (fake ssh, nothing leaves the machine)
node test/skills.test.mjs        # every skill has step 0 Golden Rule; every lesson cites a doc or UNVERIFIED
```

## Companion Grok Bot template: Hermes Fleet Ops
A docs-first ops desk for any Nous Research Hermes Agent fleet. It pairs with this plugin: fail-loud health, version and skill drift, and safe (dry-run first) restarts and updates.

**Template link:** coming soon (not published yet). By [@pixelrainbownft](https://x.com/pixelrainbownft) · [pixelrainbow.ai](https://pixelrainbow.ai).

### First-run getting-started
Asks one question at a time, then wires the plugin:

1. Is the Hermes Fleet Management plugin installed yet?
2. Short names for each Hermes host (e.g. `hermes-a`, `hermes-b`).
3. Base URL per host (Hermes HTTP API on `:8642` over the tailnet, e.g. `http://hermes-a.tailnet-name.ts.net:8642`).
4. One plugin secret per host key (matches that host's `API_SERVER_KEY`; never asked or stored in chat).
5. Remote exec opt-in (`HERMES_EXEC_ADAPTER` stays `none` unless you ask).
6. What to call you, and where to send failure alerts.

Then it builds `HERMES_HOSTS` (names and URLs only), runs `fleet_health` and `fleet_status`, and offers the daily and weekly routines.

### Daily health and weekly update
- **Daily:** `fleet_health` → `fleet_status` → `fleet_version` → `config_drift`. Read-only. FAIL LOUD on unreachable hosts, auth errors, RED/YELLOW, version mismatch, or skill drift (including UNKNOWN). One short all-clear when everything is GREEN.
- **Weekly:** update dry-run with a canary host first (`update_plan`), then roll only after a healthy soak — mutations stay dry-run unless `confirm=true` on one named host.

### Behavior
- **Golden Rule:** read official Hermes docs (`hermes_docs`) before acting; label gaps "not in official docs" / UNVERIFIED.
- **HTTP `:8642` over Tailscale** (or another private network) with per-host bearer keys. Never expose the API on the public internet.
- **Exec off by default**; mutating tools dry-run unless `confirm=true`.
- **Fail loud** — unreachable or 401 is FAIL, not skipped green.
- **SSH is break-glass only:** host repair over Tailscale after HTTP proves a host unreachable. Never used to talk to agents.

## Credit
The bridge design and fleet lessons come from [@pixelrainbownft](https://x.com/pixelrainbownft). MIT licensed.

## More from pixelrainbow
Built by [@pixelrainbownft](https://x.com/pixelrainbownft). Visit https://pixelrainbow.ai for 180+ Hermes skills and 9 complementary Grok Bot templates.
