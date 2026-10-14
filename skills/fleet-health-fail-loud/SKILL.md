---
name: hermes-fleet-health-fail-loud
description: Use for daily or on-demand Hermes fleet health checks. Fail loud - every configured host is reported, unreachable hosts are FAIL never silently skipped; stay quiet only when fully green.
---
# Fail-loud Hermes fleet health

**Step 0 (Golden Rule, [golden-rule-read-docs-first](../golden-rule-read-docs-first/SKILL.md)):** before any command, answer, or config change below, call `hermes_docs` for the topic (pages listed under *Docs*). If the docs don't cover it, say **"not in official docs"** and mark the step UNVERIFIED. Commands marked *(verified)* were checked against the official docs on 2026-10-14. Flags still change between releases, so re-check.

## Run
1. Call `fleet_status`. If `GREEN`, report one line (or nothing, for scheduled routines) and stop.
2. Otherwise call `fleet_health` and report a table: host, verdict, http_status/error, mode, version, latency_ms.

## Rules
- A host that times out or refuses is **FAIL**, not "skipped" or "unknown".
- Do not "fix" a down HTTP path by trying another transport for asks. Report `BLOCKED on HTTP path` with the error and the likely cause:
  - `ECONNREFUSED` → API server disabled or gateway down on the host.
  - timeout / `ENOTFOUND` → private network down on this computer or the host (see the survive-box-update skill).
  - `401` → wrong or rotated Bearer key.
- Note latency > 2000 ms as WARN.
- Report drift and failures only; no novels when green.
- Never print API keys or full config in the report.
