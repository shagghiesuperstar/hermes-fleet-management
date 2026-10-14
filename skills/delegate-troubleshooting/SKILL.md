---
name: hermes-delegate-troubleshooting
description: >-
  Use when a deep troubleshooting dig would burn the controller's tokens. Delegate it to a Hermes session on a healthy host through ask/get_result, and keep the controller thin.
---
# hermes-delegate-troubleshooting

**Step 0 (Golden Rule, [golden-rule-read-docs-first](../golden-rule-read-docs-first/SKILL.md)):** before any command, answer, or config change below, call `hermes_docs` for the topic (pages listed under *Docs*). If the docs don't cover it, say **"not in official docs"** and mark the step UNVERIFIED. Commands marked *(verified)* were checked against the official docs on 2026-10-14. Flags still change between releases, so re-check.

## Steps
1. `fleet_health` and pick a healthy host. If the target host is down, report BLOCKED. Don't dig on the controller.
2. `ask host=<host>` with a crisp work order: goal, IDs and URLs, what was already tried, the deliverable, the preferred model, and "read the official Hermes docs first (Golden Rule)". Use a stable `session_id` to keep a long-running troubleshooting session for follow-ups (Runs API `session_id`, *verified*).
3. Poll `get_result`. If it times out, try one other healthy host once, then report BLOCKED with the error.
4. Return DONE/BLOCKED plus one next action. Report secrets as key names PRESENT/ABSENT only.

## Docs
https://hermes-agent.nousresearch.com/docs/user-guide/features/api-server · https://hermes-agent.nousresearch.com/docs/user-guide/features/delegation
