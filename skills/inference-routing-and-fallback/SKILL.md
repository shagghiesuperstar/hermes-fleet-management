---
name: hermes-inference-routing-and-fallback
description: >-
  Use when choosing providers or models by cost and task, checking quota or headroom before long runs, or when a provider is exhausted and you need a fallback chain.
---
# hermes-inference-routing-and-fallback

**Step 0 (Golden Rule, [golden-rule-read-docs-first](../golden-rule-read-docs-first/SKILL.md)):** before any command, answer, or config change below, call `hermes_docs` for the topic (pages listed under *Docs*). If the docs don't cover it, say **"not in official docs"** and mark the step UNVERIFIED. Commands marked *(verified)* were checked against the official docs on 2026-10-14. Flags still change between releases, so re-check.

## See what's configured
- `inference_status host=<host>`: model and readiness (`/health/detailed`), `/v1/models`, `/api/model/options` *(verified endpoints)*.
- `host_command action=usage` → `hermes usage --json`, the account's rate-limit windows *(verified)*.
- `host_command action=fallback_list` → `hermes fallback list` *(verified)*. Fallbacks are tried in order on rate-limit, overload or connection errors *(verified)*.
- A completed run's `runtime` field names the provider/model that actually served it, including after a fallback *(verified: api-server Runs API)*. `get_result` returns it.

## Route by task and cost (let the model reason; these are not hard-coded rules)
- Cheap or fast models for triage, summaries and polling. Frontier models for debugging, architecture and long autonomous runs.
- Before an overnight or parallel sprint, check headroom on every provider in the chain. Don't start long runs on a provider near its window limit.
- Keep the chain diverse: different vendors in the chain, so one outage or quota reset doesn't take everything down.
- Provider-level preferences (OpenRouter): read `user-guide/features/provider-routing`.
- Quota watchers (for example, a usage-tracker CLI with JSON output) are optional. Treat them as headroom radars, not auto-spenders. Only trust the numbers once one real fetch per provider is proven.

## When a provider is exhausted
1. Confirm with `hermes usage --json` or the provider dashboard. Don't trust a single stale reading.
2. Make sure the fallback chain contains a healthy alternative: `hermes fallback add` (interactive) *(verified)*.
3. Clear cooldowns after a reset: `hermes auth reset <provider>` *(verified)*.
4. Re-login if auth expired: see hermes-provider-relogin.

## Docs
https://hermes-agent.nousresearch.com/docs/reference/cli-commands · https://hermes-agent.nousresearch.com/docs/user-guide/features/api-server · https://hermes-agent.nousresearch.com/docs/user-guide/features/provider-routing · https://hermes-agent.nousresearch.com/docs/user-guide/configuring-models
