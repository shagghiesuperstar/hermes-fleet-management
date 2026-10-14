# Changelog

## [Unreleased]
- (add compound-learnings entries here)

## [2.0.0] - 2026-10-14
### Added
- **Golden Rule (principle #1):** read the official Hermes docs before any action. New `hermes_docs` tool (search the official index, or fetch a page from official origins only). New `golden-rule-read-docs-first` skill, which every skill references as step 0. Mutating dry-runs attach the doc URL and excerpt, or show a DOCS NOT CONSULTED warning.
- Tools: `fleet_version`, `config_drift` (via `GET /v1/skills`), `inference_status`, `host_command` (allowlisted read-only CLI), `gateway_restart` (dry-run by default), `update_plan` (canary-then-roll; executes one host only with confirm=true).
- Pluggable exec adapter: `HERMES_EXEC_ADAPTER=none|ssh|hermes-run`, disabled by default.
- `ask` now uses the documented native Runs API (`POST /v1/runs` + `GET /v1/runs/{id}`, Idempotency-Key) and falls back to a server-held background chat-completions call. `host` is now required.
- Skills covering maintenance, updates, OS reboot survival, inference routing/fallback, provider re-login, profiles/SOUL/skills sync, config drift, secrets and token isolation, shared memory, delegation, remote-ops safety, Desktop-primary hosts, and compound-learnings.
- `docs/LESSONS.md`, `docs/COMMANDS.md` (verified vs unverified), `test/skills.test.mjs`, extended mock (two hosts with version and skill drift, Runs API, docs server) and smoke (24 checks, including dry-run vs confirm with a fake ssh).

## [0.1.0] - 2026-10-14
- First release: fleet_health, fleet_status, ask/get_result, mailbox_send/read, four skills.
