---
name: hermes-gateway-restart-and-crash-triage
description: >-
  Use when a Hermes gateway or Desktop is down, crash-looping, or unstable on one host, or when a restart is requested. Covers read-only triage, attribution, and a safe restart through the dry-run and confirm flow.
---
# hermes-gateway-restart-and-crash-triage

**Step 0 (Golden Rule, [golden-rule-read-docs-first](../golden-rule-read-docs-first/SKILL.md)):** before any command, answer, or config change below, call `hermes_docs` for the topic (pages listed under *Docs*). If the docs don't cover it, say **"not in official docs"** and mark the step UNVERIFIED. Commands marked *(verified)* were checked against the official docs on 2026-10-14. Flags still change between releases, so re-check.

## Triage (read-only first)
1. `fleet_health host=<host>` and `inference_status host=<host>`. `/health/detailed` reports readiness: config, state DB, model, disk, gateway/platform state, and active runs *(verified: api-server doc)*.
2. `host_command host=<host> action=gateway_status` → `hermes gateway status` *(verified)*.
3. `host_command action=logs_errors` → `hermes logs errors --since 1h` and `action=logs_gateway` → `hermes logs gateway -n 100` *(verified)*.
4. `host_command action=doctor` → `hermes doctor`. Exit code 1 means unresolved problems *(verified)*.

## Attribute before you mutate
- **One host of many crashing usually means local divergence.** Compare that host with its healthy siblings: local patches, shims, watchdogs, extra LaunchAgents/systemd units, its role (Desktop-primary vs gateway), and its tool load.
- **Reverse scar tissue instead of stacking more mitigations.** A shim or watchdog that keeps "reapplying" a fix is often the cause.
- **Don't rely on a crashing agent to heal itself.** Use an external read-only control plane (this plugin, logs, `ps`) or a separate executor.
- Back up before any file change: `hermes backup --quick --label pre-fix` *(verified)*.

## Restart (only when the operator asked)
1. `gateway_restart host=<host>` → a dry run that shows the exact command, pre-health, and the doc excerpt.
2. Check the dry run: in-flight runs will end `interrupted` *(verified: api-server doc)*. Never install or restart a supervised gateway on a Desktop-primary host (see hermes-desktop-primary-hosts).
3. `gateway_restart host=<host> confirm=true`. This needs an enabled exec adapter. Otherwise run `hermes gateway restart` on the host yourself *(verified)*.
4. Verify: `fleet_health host=<host>` is OK, and one tiny `ask` succeeds.
- Multi-profile hosts: `--all` restarts every profile's gateway *(verified)*.
- Supervised by launchd/systemd: `hermes gateway stop` alone may be respawned by the supervisor. Read the cli-commands *gateway* section before uninstalling a service.

## Docs
https://hermes-agent.nousresearch.com/docs/reference/cli-commands · https://hermes-agent.nousresearch.com/docs/user-guide/features/api-server · https://hermes-agent.nousresearch.com/docs/reference/faq
