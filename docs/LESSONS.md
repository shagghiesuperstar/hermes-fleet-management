# Lessons (compound engineering log)

Every lesson cites the official doc it was checked against, or is marked UNVERIFIED. Format: see `skills/compound-learnings/SKILL.md`. `test/skills.test.mjs` enforces the citation.

### 2026-10-14: Soft "prefer HTTP, else SSH" rules leave a back door
- Symptom: bots claimed HTTP but wandered into SSH asks. Health looked flaky, then "magically" recovered.
- Root cause: stale instructions still advertised an SSH ask path next to the live HTTP connector.
- Fix / rule: one ask path (HTTP API). SSH is never an ask fallback. Report BLOCKED on the HTTP path instead.
- Checked against: https://hermes-agent.nousresearch.com/docs/user-guide/features/api-server
- Encoded in: skills/bridge-method-chooser, skills/remote-host-ops-safety
- Regression: manual (policy); server has no SSH ask code path

### 2026-10-14: Long asks die at ~2 min client timeouts
- Symptom: MCP ask returned timeout errors while Hermes was still working.
- Root cause: synchronous request/response held open past client limits.
- Fix / rule: submit and poll. Use the native Runs API (POST /v1/runs, GET /v1/runs/{id}) with an Idempotency-Key, and fall back to a server-held background request.
- Checked against: https://hermes-agent.nousresearch.com/docs/user-guide/features/api-server
- Encoded in: server ask/get_result, skills/bridge-method-chooser
- Regression: test/smoke.mjs "LESSON async ask completes via polling"

### 2026-10-14: Silent skips hide dead hosts
- Symptom: daily health reported green while one host was unreachable.
- Root cause: unreachable hosts were skipped instead of failed.
- Fix / rule: fail loud. Every configured host gets a verdict, and unreachable means FAIL.
- Checked against: https://hermes-agent.nousresearch.com/docs/user-guide/features/api-server
- Encoded in: skills/fleet-health-fail-loud
- Regression: test/smoke.mjs "LESSON fail-loud: unreachable host is FAIL, not skipped"

### 2026-10-14: The bot computer loses its network overlay on platform updates
- Symptom: every :8642 call timed out at once after a computer update.
- Root cause: VPN client and state lived outside persistent storage.
- Fix / rule: keep the restore recipe and state in persistent storage, keep the auth key in a secret, run an hourly detect-and-restore, and drill it.
- Checked against: UNVERIFIED (not in official Hermes docs; platform/VPN vendor behaviour)
- Encoded in: skills/survive-box-update, skills/os-reboot-survival
- Regression: manual drill

### 2026-10-14: One shared messaging token across hosts cross-wires bots
- Symptom: polling conflicts, one host "wins", replies appear from the wrong bot.
- Root cause: a single bot token pulled fleet-wide from a vault.
- Fix / rule: per-profile credential names and one poller per token. Delete generic names from the vault.
- Checked against: https://hermes-agent.nousresearch.com/docs/user-guide/secrets
- Encoded in: skills/secrets-and-token-isolation
- Regression: manual (fingerprint compare)

### 2026-10-14: Stopping a supervised gateway is not removing it
- Symptom: gateway respawned on a Desktop-primary host after `stop` and destabilised Desktop.
- Root cause: the launchd/systemd supervisor restarts the service.
- Fix / rule: use `hermes gateway uninstall` on hosts that must not run a supervised gateway, and fail health if the service reappears.
- Checked against: https://hermes-agent.nousresearch.com/docs/reference/cli-commands
- Encoded in: skills/desktop-primary-hosts
- Regression: manual

### 2026-10-14: Local scar tissue kills one host
- Symptom: a crash on one host only, recurring despite shims and watchdogs.
- Root cause: local mitigations (shims, reapply crons) diverged that host from its healthy siblings.
- Fix / rule: compare with siblings, reverse local patches after backup, and prove the fix with the original failure path.
- Checked against: UNVERIFIED (field practice; no official doc covers host-local patches)
- Encoded in: skills/gateway-restart-and-crash-triage
- Regression: manual

### 2026-10-14: Invented CLI flags break production
- Symptom: agents ran commands from stale memory (for example the removed `hermes login`).
- Root cause: acting before reading the docs for the installed version.
- Fix / rule: Golden Rule. Read the official docs (hermes_docs) first. Mutating dry-runs carry the doc excerpt. Anything not in the docs is marked UNVERIFIED.
- Checked against: https://hermes-agent.nousresearch.com/docs/reference/cli-commands
- Encoded in: skills/golden-rule-read-docs-first, every skill step 0, server docEvidence
- Regression: test/smoke.mjs "GOLDEN RULE ..." and test/skills.test.mjs
