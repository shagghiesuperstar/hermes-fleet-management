---
name: hermes-provider-relogin
description: >-
  Use when a Hermes inference provider's credentials expired or were revoked. A tiered runbook: status and refresh first, a browser account-chooser click only if one is already showing, otherwise hand off to the human.
---
# hermes-provider-relogin

**Step 0 (Golden Rule, [golden-rule-read-docs-first](../golden-rule-read-docs-first/SKILL.md)):** before any command, answer, or config change below, call `hermes_docs` for the topic (pages listed under *Docs*). If the docs don't cover it, say **"not in official docs"** and mark the step UNVERIFIED. Commands marked *(verified)* were checked against the official docs on 2026-10-14. Flags still change between releases, so re-check.

## Tier A (unattended)
1. `host_command action=auth_status` → `hermes auth status` *(verified)*. If the provider is healthy, stop.
2. Refresh OAuth: `hermes auth refresh <provider> [label]` *(verified)*. API-key providers: rotate the key in the secrets manager and restart the gateway (see hermes-secrets-and-token-isolation).
3. Clear cooldowns: `hermes auth reset <provider>` *(verified)*. Check the order: `hermes auth list`, `hermes auth priority …` *(verified)*.

## Tier B (only if an account chooser is already on screen)
- With an operator-approved computer-use agent, pick the mapped account on an already-open chooser. Never type passwords, TOTP codes or device codes.
- If the next screen is a challenge (captcha, passkey, phone push, OS permission prompt), stop and go to Tier C.

## Tier C (human)
- A fresh login (`hermes auth add <provider> --type oauth`) *(verified)*, device codes, passkeys or captchas: report `need_human` with the provider name only. Leave the existing session intact.

## Never
Print tokens, refresh tokens, passwords, device codes or full account maps. You may report: provider name, ok/need_human, and secret length or fingerprint.

## Docs
https://hermes-agent.nousresearch.com/docs/reference/cli-commands (hermes auth) · https://hermes-agent.nousresearch.com/docs/user-guide/configuring-models
