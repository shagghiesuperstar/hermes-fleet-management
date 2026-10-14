---
name: hermes-fleet-survive-box-update
description: Use after a Grok Bot computer update or reset, or when every Hermes host suddenly fails health with timeouts - restores the private-network path from a recipe kept in persistent storage.
---
# Survive a box update (generic restore pattern)

Grok Bot computer updates can wipe installed software and running processes outside the persistent home directory. If your Hermes hosts are reached over a mesh VPN, the VPN client disappears and **every** `:8642` call times out at once.

## Prepare once (while healthy)
1. Keep a restore recipe under persistent storage (e.g. `/home/box/agent-data/infra/`): install script, VPN state directory, config, and a `detect` script that prints `OK:*` / `MISSING:*` tags.
2. Store the VPN auth key as a **secure secret** (reusable, tagged, least-privilege), never in the recipe or chat.
3. Schedule an hourly routine: run detect → if anything is `MISSING`, run restore → run `fleet_status`.
4. Drill it: uninstall the VPN client, run the routine, confirm `GREEN`.

## When it fires
1. `detect` → collect tags. All `OK` and fleet still red → the problem is on the Hermes side; use the fail-loud health skill.
2. Back up current state, then run restore.
3. Outcomes: restored → `fleet_status`; needs a new auth key → ask the operator via secure secret entry (never chat); needs a network-admin approval/signature → one-line ask to the operator.
4. Report one line: `RESTORED` / `BLOCKED_ON secret` / `BLOCKED_ON approval`.

## Never
- Log or echo auth keys.
- Keep network-admin signing keys on the Grok Bot computer.
- Switch asks to another transport while the network is down.
