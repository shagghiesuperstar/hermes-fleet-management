---
name: hermes-remote-host-ops-safety
description: >-
  Use for rare, operator-approved host surgery on a Hermes machine (config, plugins, cron, services) when the HTTP API is proven insufficient. Research first, back up, act minimally.
---
# hermes-remote-host-ops-safety

**Step 0 (Golden Rule, [golden-rule-read-docs-first](../golden-rule-read-docs-first/SKILL.md)):** before any command, answer, or config change below, call `hermes_docs` for the topic (pages listed under *Docs*). If the docs don't cover it, say **"not in official docs"** and mark the step UNVERIFIED. Commands marked *(verified)* were checked against the official docs on 2026-10-14. Flags still change between releases, so re-check.

## Operating law
1. **Don't guess, know.** Read the docs (step 0) and the host's live state (`hermes status`, `hermes config check`, logs) before any mutation.
2. **Back up first:** `hermes backup --quick --label <reason>` *(verified)*, or copy the file to a timestamped `.bak`.
3. **Announce** the live remote work in the operator's channel.
4. **No gateway or Desktop restart** unless the operator asked (use `gateway_restart`, which dry-runs).
5. **Remote scripts:** write the script locally, copy it over, and run it with a login shell. Don't nest large inline programs inside `ssh … bash -c`.
6. **YAML:** make surgical edits or use a comment-preserving round-trip. Never dump the whole file.
7. **Interactive CLIs** can hang over non-interactive shells. Look up the non-interactive flag in the docs (`-y/--yes`, etc.) and use it only if the operator already approved that change.
8. Paths: resolve from `$HERMES_HOME` (default `~/.hermes`). Never hardcode home directories.

## Exec adapter
- This plugin runs only allowlisted commands and needs `confirm=true` for mutations. Anything else is done by hand by the operator, and that's intentional.
- Asks never travel over SSH. SSH is for surgery only, and only if the operator chose the ssh adapter.

## Docs
https://hermes-agent.nousresearch.com/docs/reference/cli-commands · https://hermes-agent.nousresearch.com/docs/user-guide/security · https://hermes-agent.nousresearch.com/docs/user-guide/configuration
