---
name: hermes-bridge-method-chooser
description: Use when deciding how Grok Bot should talk to a Hermes agent - HTTP API primary, file mailbox fallback - or when an ask fails and a fallback is tempting.
---
# Bridge method chooser: HTTP primary, mailbox fallback

**Step 0 (Golden Rule, [golden-rule-read-docs-first](../golden-rule-read-docs-first/SKILL.md)):** before any command, answer, or config change below, call `hermes_docs` for the topic (pages listed under *Docs*). If the docs don't cover it, say **"not in official docs"** and mark the step UNVERIFIED. Commands marked *(verified)* were checked against the official docs on 2026-10-14. Flags still change between releases, so re-check.

| Direction | Primary | Fallback |
|---|---|---|
| Grok Bot → Hermes (ask) | `ask` / `get_result` over Hermes native HTTP API `:8642`, Bearer auth, private network | `mailbox_send` a note for the agent to pick up later (async, no answer guaranteed) |
| Hermes → Grok Bot | Hermes writes into the mailbox; Grok Bot reads with `mailbox_read` | operator-defined webhook into a Grok Bot routine (private network + Bearer) |

## Decide
1. Run `fleet_health` for the target host.
2. **OK**: use `ask` (native Runs API `/v1/runs` with polling, *verified in the api-server doc*). Always poll `get_result`; never block on a single long call (client timeouts are ~2 min; Hermes runs can take much longer).
3. **FAIL** → report `BLOCKED on HTTP path`. If the message can wait, `mailbox_send` it and say so explicitly. Do not open an SSH shell to run Hermes commands as an "ask" fallback - it bypasses auth policy and causes flaky, hard-to-audit behaviour.
4. When the host comes back, check `mailbox_read` for replies and archive them (`archive: true`).

## Why this order
HTTP is authenticated, observable (health, latency, versions) and parallel across the fleet. The mailbox is dumb, durable and transport-agnostic, which is exactly what a fallback should be. Soft rules like "prefer HTTP, else SSH" leave a back door that bots wander into; keep the ask path single.
