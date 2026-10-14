---
name: hermes-logs-disk-process-hygiene
description: >-
  Use for routine Hermes host hygiene and after any sprint. Inspect logs, disk and checkpoints, clean orphan processes, and confirm the talk path is clean before declaring DONE.
---
# hermes-logs-disk-process-hygiene

**Step 0 (Golden Rule, [golden-rule-read-docs-first](../golden-rule-read-docs-first/SKILL.md)):** before any command, answer, or config change below, call `hermes_docs` for the topic (pages listed under *Docs*). If the docs don't cover it, say **"not in official docs"** and mark the step UNVERIFIED. Commands marked *(verified)* were checked against the official docs on 2026-10-14. Flags still change between releases, so re-check.

## Logs
- `hermes logs` and `hermes logs -f`, `hermes logs gateway -n 100`, `hermes logs --level WARNING --since 1h`, `hermes logs errors --since 30m`, `hermes logs list` *(verified)*. Logs rotate (`agent.log.1`…) *(verified)*.
- Update failures: the `update` log and `~/.hermes/logs/update_receipts/latest.json` *(verified: updating doc)*.

## Disk
- `/health/detailed` includes a disk readiness check *(verified)*. Read it with `inference_status host=<host>`.
- Checkpoint store: `hermes checkpoints` (status), `hermes checkpoints prune` *(verified)*.
- The built-in `disk-cleanup` plugin exists. Read `user-guide/features/built-in-plugins` before you change it.

## Post-sprint checklist (run before declaring DONE)
1. `fleet_status` is GREEN. `get_result` has no runs stuck in `running`.
2. Kill orphan browser or computer-use sessions and stuck CLI harnesses (coding-agent CLIs, tmux/screen jobs) that the sprint started. Kill only the processes you can attribute; never kill every process named python or hermes *(the updating doc warns about this on Windows)*.
3. Close idle remote shells you opened for host surgery.
4. Confirm no ask path was moved onto SSH during the sprint (see hermes-bridge-method-chooser).
5. Secrets: nothing was pasted into chat or logs, and keys live only in the secrets manager.
6. Feed anything surprising into compound-learnings.

## Docs
https://hermes-agent.nousresearch.com/docs/reference/cli-commands · https://hermes-agent.nousresearch.com/docs/getting-started/updating · https://hermes-agent.nousresearch.com/docs/user-guide/checkpoints-and-rollback
