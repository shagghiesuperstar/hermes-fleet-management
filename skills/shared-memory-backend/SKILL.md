---
name: hermes-shared-memory-backend
description: >-
  Use when wiring or checking a shared external memory backend for a Hermes fleet (Hindsight, Honcho, Mem0 and others), and for recall/retain health checks.
---
# hermes-shared-memory-backend

**Step 0 (Golden Rule, [golden-rule-read-docs-first](../golden-rule-read-docs-first/SKILL.md)):** before any command, answer, or config change below, call `hermes_docs` for the topic (pages listed under *Docs*). If the docs don't cover it, say **"not in official docs"** and mark the step UNVERIFIED. Commands marked *(verified)* were checked against the official docs on 2026-10-14. Flags still change between releases, so re-check.

## Wire
- `hermes memory setup` (interactive picker), `hermes memory status`, `hermes memory off` *(verified)*. Providers include Honcho, OpenViking, Mem0, Hindsight, Holographic, RetainDB, ByteRover and Supermemory *(verified: memory-providers doc)*.
- Decide the topology deliberately: one shared bank or space for the fleet (shared context), or per-host banks (isolation). Use per-host API keys where the vendor supports them.
- Keys come from the secrets manager (see hermes-secrets-and-token-isolation).

## Health check (recall/retain round-trip)
1. `host_command action=memory_status` shows the active provider *(verified)*.
2. Retain a harmless canary fact tagged `healthcheck` through the vendor API or the agent, then recall it. Both must succeed. *(The exact API calls are vendor-specific: read the vendor docs, for example the Hindsight docs.)*
3. If retain fails, report BLOCKED. **Never** quietly fall back to writing "memories" in a local file. That splits the source of truth.

## Rules
- Don't write controller-originated content into a host's memory without an explicit memory plan.
- Living summaries ("mental models") in vendors that support them: list and read freely, but create or refresh only when the operator assigns it, because refreshes cost tokens.

## Docs
https://hermes-agent.nousresearch.com/docs/user-guide/features/memory-providers · https://hermes-agent.nousresearch.com/docs/user-guide/features/memory · vendor docs (for example https://docs.hindsight.vectorize.io/)
