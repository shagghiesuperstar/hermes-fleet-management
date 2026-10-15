# Hermes Fleet Ops — Grok Bot template

This is the companion Grok Bot template for the Hermes Fleet Management plugin (v2.0.1+).

A one-click Grok Bot Share link is pending (Cursor ticket T-H44914 blocks publishing). Until then, create a new Grok Bot and tell it:

> Set yourself up from grokbot-template/hermes-fleet-ops.template.json in https://github.com/shagghiesuperstar/hermes-fleet-management

Or paste the skills and routines from that file manually.

## Contents

- Docs-first persona
- 7 skills: getting-started, hermes-fleet-daily-health, hermes-bitwarden-fleet-ssot, hermes-weekly-update, hermes-gateway-graceful-restart, tailscale-fleet-macos, break-glass-host-troubleshooting
- 2 routines: daily fleet health, weekly update
- 4 memories

## Rules

- Talk to agents over HTTP :8642 only.
- SSH is break-glass host repair only.
- Mutations are dry-run unless confirm=true.
- Keys go in plugin secrets, never chat.

## Credits

@pixelrainbownft · pixelrainbow.ai
