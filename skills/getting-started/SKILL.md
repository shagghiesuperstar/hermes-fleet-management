---
name: hermes-fleet-getting-started
description: Use on first install of Hermes Fleet Management, or when the user asks how to connect Grok Bot to their Hermes agents. Walks through enabling the Hermes API server, configuring hosts and keys, and a first smoke test.
---
# Getting started with Hermes Fleet Management

## 1. On each Hermes host
1. Enable the native API server in the Hermes gateway env: `API_SERVER_ENABLED=true`, a strong `API_SERVER_KEY`, and bind it to a **private** interface only (VPN / mesh / LAN). Never expose `:8642` to the public internet or a public tunnel.
2. Restart the Hermes gateway so the API server picks up the change.
3. From the machine that will run this plugin, confirm `GET http://<private-host>:8642/health` answers.

## 2. Configure the plugin (setup fields / env)
| Field | Required | Example |
|---|---|---|
| `HERMES_HOSTS` | yes | `[{"name":"alpha","url":"http://hermes-alpha:8642"},{"name":"beta","url":"http://hermes-beta:8642","api_key_env":"HERMES_API_KEY_BETA"}]` |
| `HERMES_API_KEY` | yes | default Bearer key (stored in a secret store, never pasted in chat) |
| `HERMES_MAILBOX_DIR` or `HERMES_MAILBOX_SSH` | optional | shared folder, or `user@host:/abs/path` for the fallback mailbox |
| `HERMES_MAILBOX_SELF` | optional | this bot's mailbox name (default `grok-bot`) |
| `HERMES_MODEL` | optional | model id sent to `/v1/chat/completions` (default `hermes-agent`) |

## 3. Smoke test
1. `fleet_status` → expect `GREEN`.
2. `fleet_health` → every host `OK`, note `mode` / `version` / `latency_ms`.
3. `ask` with prompt `reply with the word pong` → returns `run_id`; `get_result` until `state: done`.

## Never
- Paste API keys into chat, skills, or git.
- Write Grok-originated content into Hermes memory unless the operator has a memory plan.
