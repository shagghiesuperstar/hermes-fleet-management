---
name: hermes-desktop-primary-hosts
description: >-
  Use when a Hermes host is Desktop-primary (a workstation running Hermes Desktop with no supervised messaging gateway), so fleet tools don't break it by installing or respawning a gateway.
---
# hermes-desktop-primary-hosts

**Step 0 (Golden Rule, [golden-rule-read-docs-first](../golden-rule-read-docs-first/SKILL.md)):** before any command, answer, or config change below, call `hermes_docs` for the topic (pages listed under *Docs*). If the docs don't cover it, say **"not in official docs"** and mark the step UNVERIFIED. Commands marked *(verified)* were checked against the official docs on 2026-10-14. Flags still change between releases, so re-check.

## Policy
- A Desktop-primary host runs Hermes Desktop for interactive work. It must not get a supervised messaging gateway service unless the operator explicitly wants messaging there.
- An API-only sidecar for `:8642` is fine if the operator approves it: for example `hermes gateway run --external-supervisor` under the operator's own supervisor, bound to loopback or the private interface *(flag verified: cli-commands)*.

## Why
Supervised gateway services auto-restart (launchd `KeepAlive`, systemd `Restart=`). `hermes gateway stop` stops the process, and the supervisor may bring it back. Respawns that kill worker trees can destabilise Desktop.

## Do
- Remove an unwanted service with `hermes gateway uninstall` *(verified)*, then confirm the service file is gone.
- Mark the host as Desktop-primary in your fleet notes. In `fleet-health-fail-loud`, add a check that FAILS if a gateway service reappears there.
- Updates on Desktop hosts: Desktop updates never auto-restore stashed local edits *(verified: updating doc)*.

## Docs
https://hermes-agent.nousresearch.com/docs/user-guide/desktop · https://hermes-agent.nousresearch.com/docs/reference/cli-commands · https://hermes-agent.nousresearch.com/docs/getting-started/updating
