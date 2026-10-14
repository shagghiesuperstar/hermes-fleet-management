---
name: hermes-secrets-and-token-isolation
description: >-
  Use when wiring secrets for a Hermes fleet: a secrets manager (Bitwarden Secrets Manager, 1Password, command helper, or env), per-host and per-profile credentials, and verifying keys without ever printing them.
---
# hermes-secrets-and-token-isolation

**Step 0 (Golden Rule, [golden-rule-read-docs-first](../golden-rule-read-docs-first/SKILL.md)):** before any command, answer, or config change below, call `hermes_docs` for the topic (pages listed under *Docs*). If the docs don't cover it, say **"not in official docs"** and mark the step UNVERIFIED. Commands marked *(verified)* were checked against the official docs on 2026-10-14. Flags still change between releases, so re-check.

## Sources (all documented)
- Bitwarden Secrets Manager: `hermes secrets bitwarden setup|status|token` *(verified)*. On start, Hermes runs `bws secret list <project_id>` after `.env` loads and sets the keys in the environment *(verified)*.
- 1Password and a command-helper source: `user-guide/secrets/onepassword`, `user-guide/secrets/command`.
- Plain env / `.env` for single hosts.

## Per-host and per-profile isolation (the classic fleet failure)
- Never put one shared messaging bot token (Telegram, Discord, Slack) in a fleet-wide vault project that every host pulls. Every gateway becomes the same bot, polling conflicts follow, and messages cross-wire.
- Store per-profile names (for example `FOO_TOKEN_<PROFILE>`) and let Hermes alias them for the active profile. **Read the Secrets doc for the exact aliasing rules before relying on them.** If the doc doesn't show this, the field note is: an alias only applies to credential-shaped names, and it never shadows a variable supplied under its real name, so delete any generic `FOO_TOKEN` from the vault. *(Field note; UNVERIFIED unless the doc confirms it.)*
- Give each host its own memory-backend and API keys where the vendor supports it, so one leak doesn't expose the whole fleet.
- Only one process may poll a given bot token.

## Verify without printing
1. `host_command action=secrets_bitwarden_status`: binary, version, and token presence *(verified)*.
2. Compare **fingerprints** (for example the first 12 hex characters of sha256) between the vault, the host's `.env`, and the controller's `HERMES_API_KEY`. A mismatch shows up as 401 on `/v1/models`.
3. Never dump vault caches, `.env` files or secret values into chat, logs or tool output. Never grep recursively through profile trees.

## Docs
https://hermes-agent.nousresearch.com/docs/user-guide/secrets · https://hermes-agent.nousresearch.com/docs/user-guide/secrets/bitwarden · https://hermes-agent.nousresearch.com/docs/user-guide/secrets/onepassword · https://hermes-agent.nousresearch.com/docs/user-guide/secrets/command · https://hermes-agent.nousresearch.com/docs/reference/environment-variables
