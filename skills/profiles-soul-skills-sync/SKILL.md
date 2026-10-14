---
name: hermes-profiles-soul-skills-sync
description: >-
  Use when managing Hermes harness identity across hosts: profiles, SOUL.md and context files, and keeping skills in sync fleet-wide.
---
# hermes-profiles-soul-skills-sync

**Step 0 (Golden Rule, [golden-rule-read-docs-first](../golden-rule-read-docs-first/SKILL.md)):** before any command, answer, or config change below, call `hermes_docs` for the topic (pages listed under *Docs*). If the docs don't cover it, say **"not in official docs"** and mark the step UNVERIFIED. Commands marked *(verified)* were checked against the official docs on 2026-10-14. Flags still change between releases, so re-check.

## Profiles
- `hermes profile list|create|use|export|import` *(verified)*. `-p/--profile <name>` targets one invocation *(verified)*. Per-host default profile: the `profile` field in `HERMES_HOSTS`.
- Each profile on a shared API server needs its own `API_SERVER_KEY`. Reused default keys on named profile prefixes return 401 *(verified: api-server doc)*.
- Many gateways on one host: read `user-guide/multi-profile-gateways`. `hermes gateway migrate --dry-run` folds per-profile gateways *(verified)*.

## SOUL.md and context files
- Read `user-guide/which-file-does-what` first: SOUL.md vs USER.md vs MEMORY.md vs AGENTS.md, who writes each one, and when the agent sees it.
- Keep identity in SOUL.md (persona) and project rules in AGENTS.md. Version them in git and push the same file to every host that shares the identity.

## Skills sync
1. Declare the fleet's skills in a manifest JSON (`{"skills":["name", ...]}`) and point `HERMES_FLEET_MANIFEST` at it.
2. `config_drift` compares each host's `GET /v1/skills` *(verified endpoint)* with the manifest and lists missing and extra skills per host.
3. Fix drift on the host: `hermes skills install <name>`, `hermes skills update`, `hermes skills check`; snapshot or export with `hermes skills snapshot` *(verified subcommands)*. Hand-written skills live under the profile's skills directory as `<name>/SKILL.md`. See `developer-guide/creating-skills`.
4. Re-run `config_drift` until `drift=false`.
- Converting messy notes into a skill: draft in agentskills format (frontmatter `name` and `description`), then review it. Never paste secrets into third-party compositors.

## Native API enablement
See hermes-fleet-getting-started. Env: `API_SERVER_ENABLED`, `API_SERVER_KEY`, `API_SERVER_HOST`, `API_SERVER_PORT` (default 8642) *(verified)*.

## Docs
https://hermes-agent.nousresearch.com/docs/user-guide/profiles · https://hermes-agent.nousresearch.com/docs/reference/profile-commands · https://hermes-agent.nousresearch.com/docs/user-guide/which-file-does-what · https://hermes-agent.nousresearch.com/docs/user-guide/features/skills · https://hermes-agent.nousresearch.com/docs/reference/cli-commands
