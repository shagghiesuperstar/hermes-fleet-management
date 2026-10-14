---
name: hermes-config-drift
description: >-
  Use when hosts that should be identical behave differently. Detect version, skill and config drift across the fleet and converge it without blind overwrites.
---
# hermes-config-drift

**Step 0 (Golden Rule, [golden-rule-read-docs-first](../golden-rule-read-docs-first/SKILL.md)):** before any command, answer, or config change below, call `hermes_docs` for the topic (pages listed under *Docs*). If the docs don't cover it, say **"not in official docs"** and mark the step UNVERIFIED. Commands marked *(verified)* were checked against the official docs on 2026-10-14. Flags still change between releases, so re-check.

## Detect
1. `fleet_version`: one version everywhere? *(Version comes from HTTP if exposed; otherwise `host_command action=version` → `hermes --version` (verified).)*
2. `config_drift`: skill-set hash per host against the manifest or the fleet majority.
3. Per host: `host_command action=config_check` → `hermes config check` (missing options after updates) *(verified)*. `action=dump` → `hermes dump`, a shareable summary with credentials redacted *(verified)*. Compare dumps between hosts.
4. Secrets drift: see hermes-secrets-and-token-isolation (compare fingerprints, never values).

## Converge
- Prefer documented commands (`hermes config set`, `hermes skills install/update`) over hand edits.
- If you must edit `config.yaml`, back it up first (`hermes backup --quick`) and make surgical edits. Never round-trip the whole YAML through a dumper that drops comments and ordering.
- Change one host, verify it, then do the rest (same canary rule as updates).
- Record the root cause through compound-learnings so the drift can't recur silently.

## Docs
https://hermes-agent.nousresearch.com/docs/reference/cli-commands · https://hermes-agent.nousresearch.com/docs/user-guide/configuration
