---
name: hermes-safe-fleet-update
description: >-
  Use when updating Hermes Agent on one or many hosts. Pre-checks, canary one host then roll, verify versions, and know the rollback path. Never update the whole fleet at once.
---
# hermes-safe-fleet-update

**Step 0 (Golden Rule, [golden-rule-read-docs-first](../golden-rule-read-docs-first/SKILL.md)):** before any command, answer, or config change below, call `hermes_docs` for the topic (pages listed under *Docs*). If the docs don't cover it, say **"not in official docs"** and mark the step UNVERIFIED. Commands marked *(verified)* were checked against the official docs on 2026-10-14. Flags still change between releases, so re-check.

## Plan
1. `update_plan canary=<host>` gives a read-only plan with health and the updating-doc excerpt.
2. Pre-checks on the canary:
   - `host_command action=update_plan` → `hermes update --plan`, read-only and safe on a live fleet *(verified)*
   - `host_command action=update_check` → `hermes update --check`, a preview *(verified)*
3. Backups: `hermes update --backup` takes a full pre-pull HERMES_HOME snapshot. A quick state snapshot is the default *(verified)*.

## Execute (one host at a time)
1. `update_plan host=<canary> confirm=true` runs `hermes update --backup` through the exec adapter, or run it on the host yourself.
2. Verify:
   - `fleet_version` (drift is expected mid-roll)
   - `fleet_health host=<canary>`
   - `host_command action=doctor`
   - one tiny `ask`
   - check the receipt `~/.hermes/logs/update_receipts/latest.json` for a `gateway_restart` follow-up *(verified)*
3. Soak, then roll the remaining hosts one at a time. Stop at the first failure.
4. Finish with `fleet_version` drift = false.

## Rollback
- Hermes auto-rolls back if critical files fail to parse after the pull *(verified)*.
- Pins and channels: `hermes update --channel …`, `--set-channel stable|main`, and an explicit commit pin *(verified: channel flags; read the doc for the exact commit-pin syntax on your install kind)*.
- Restore from the pre-update backup with `hermes backup` / `hermes import`. Read the doc before running `import` *(verified commands exist; procedure UNVERIFIED for your layout)*.
- Updates triggered from inside the gateway (cron) should use `hermes update --no-gateway-restart` plus a separate restart step *(verified)*.

## Docs
https://hermes-agent.nousresearch.com/docs/getting-started/updating · https://hermes-agent.nousresearch.com/docs/reference/cli-commands
