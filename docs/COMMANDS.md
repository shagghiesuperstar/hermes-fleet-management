# Command & endpoint verification ledger

Checked against the official docs on 2026-10-14 (`https://hermes-agent.nousresearch.com/docs/llms.txt` index). Re-verify with `hermes_docs` before use, because flags change between releases.

## Verified in official docs
| Command / endpoint | Source page |
|---|---|
| `GET /health`, `GET /v1/health`, `GET /health/detailed` (auth) | user-guide/features/api-server |
| `POST /v1/runs` (+ `Idempotency-Key`), `GET /v1/runs/{id}`, `GET /v1/runs/{id}/events` | user-guide/features/api-server |
| `POST /v1/chat/completions`, `GET /v1/models`, `GET /v1/capabilities`, `GET /v1/skills`, `GET /v1/toolsets`, `GET /api/model/options` | user-guide/features/api-server |
| `API_SERVER_ENABLED`, `API_SERVER_KEY`, `API_SERVER_HOST`, `API_SERVER_PORT` (8642), `API_SERVER_CORS_ORIGINS`, `API_SERVER_MODEL_NAME` | user-guide/features/api-server |
| `hermes --version`, `hermes status`, `hermes doctor [--fix]`, `hermes dump`, `hermes backup [--quick --label]` | reference/cli-commands |
| `hermes gateway run/start/stop/restart/status/list/install/uninstall/migrate [--dry-run]`, `--all`, `--external-supervisor` | reference/cli-commands |
| `hermes logs [gateway|errors|list] -f -n --level --since --session` | reference/cli-commands |
| `hermes update`, `--check`, `--plan`, `--backup`, `--no-gateway-restart`, `--channel`, `--set-channel`, `--branch` | getting-started/updating, reference/cli-commands |
| `~/.hermes/logs/update_receipts/latest.json` | getting-started/updating |
| `hermes usage [--provider] [--json]` | reference/cli-commands |
| `hermes fallback list/add/remove/clear` | reference/cli-commands |
| `hermes auth list/add/remove/priority/reset/refresh/status/logout` | reference/cli-commands |
| `hermes profile list/create/use/export/import`, `-p/--profile` | reference/cli-commands, user-guide/profiles |
| `hermes skills list/install/update/check/snapshot/…` | reference/cli-commands |
| `hermes secrets bitwarden setup/status/token` | user-guide/secrets/bitwarden |
| `hermes memory setup/status/off` | user-guide/features/memory-providers |
| `hermes checkpoints [prune|clear]` | reference/cli-commands |
| `hermes config check`, `hermes config set` | getting-started/updating, reference/cli-commands |

## Unverified / not in official Hermes docs (marked in skills)
| Item | Status |
|---|---|
| Exact commit-pin rollback syntax for every install kind | Docs mention an explicit commit pin, but the syntax was not confirmed. Read updating before use. |
| Restore procedure via `hermes backup` + `hermes import` for in-place rollback | Commands exist; the procedure for your layout is UNVERIFIED |
| Profile-scoped secret aliasing rules (`FOO_<PROFILE>` → `FOO`) | Field note; confirm in user-guide/secrets |
| VPN/overlay auto-start, FileVault/auto-login behaviour | Not Hermes. Use OS/vendor docs. |
| Memory-vendor retain/recall APIs | Vendor docs, not Hermes |
| Version field in `/health/detailed` or `/v1/capabilities` | Not guaranteed. `fleet_version` falls back to `hermes --version`. |
| `hermes-run` exec adapter (agent-mediated command execution) | Plugin design. It relies on the agent following instructions, so it's non-deterministic. |
