---
name: hermes-os-reboot-survival
description: >-
  Use before and after OS updates or reboots on Hermes hosts. Make the network overlay and Hermes gateway auto-start, and know the full-disk-encryption and auto-login caveats that keep a headless host offline.
---
# hermes-os-reboot-survival

**Step 0 (Golden Rule, [golden-rule-read-docs-first](../golden-rule-read-docs-first/SKILL.md)):** before any command, answer, or config change below, call `hermes_docs` for the topic (pages listed under *Docs*). If the docs don't cover it, say **"not in official docs"** and mark the step UNVERIFIED. Commands marked *(verified)* were checked against the official docs on 2026-10-14. Flags still change between releases, so re-check.

## Make it survive (once per host)
1. **Gateway as a service:** `hermes gateway install` installs a systemd (Linux) or launchd (macOS) service *(verified)*. On Windows, the gateway runs as a Scheduled Task (see the Windows native guide). On WSL, the docs recommend `hermes gateway run` under tmux *(verified)*. Skip this on Desktop-primary hosts (see hermes-desktop-primary-hosts).
2. **Network overlay** (VPN or mesh such as Tailscale, WireGuard or ZeroTier): enable its system service so it starts at boot, before login. Use a non-expiring, least-privilege machine identity. *Overlay specifics are not in the Hermes docs; follow the vendor docs and mark it UNVERIFIED here.*
3. **Full-disk encryption / FileVault caveat:** after a reboot, an encrypted Mac waits at the unlock screen and nothing runs, not even launchd user agents. Headless hosts need an operator-approved unlock strategy, and user-level LaunchAgents only start after login. Decide deliberately between auto-login (weaker security) and a system-level daemon. *(Not in Hermes docs: OS vendor documentation applies.)*
4. Drill it: reboot during a quiet window, then `fleet_health host=<host>` with no human touching the box.

## After any OS update
1. `fleet_status`. If a host is RED with timeouts, the overlay is down. If it shows `ECONNREFUSED`, the gateway or API is down.
2. `host_command action=gateway_status` and `action=doctor`.
3. Log a lesson via compound-learnings if anything needed a manual step.

## Docs
https://hermes-agent.nousresearch.com/docs/reference/cli-commands · https://hermes-agent.nousresearch.com/docs/user-guide/windows-native · https://hermes-agent.nousresearch.com/docs/user-guide/windows-wsl-quickstart · https://hermes-agent.nousresearch.com/docs/getting-started/platform-support
