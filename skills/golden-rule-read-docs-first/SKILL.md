---
name: golden-rule-read-docs-first
description: >-
  Use before ANY Hermes Agent action, answer, command, config change, or troubleshooting step. Read the official Hermes docs for that topic first and never guess. Every other skill in this plugin runs this as step 0.
---
# golden-rule-read-docs-first

**Step 0 (Golden Rule, [golden-rule-read-docs-first](../golden-rule-read-docs-first/SKILL.md)):** before any command, answer, or config change below, call `hermes_docs` for the topic (pages listed under *Docs*). If the docs don't cover it, say **"not in official docs"** and mark the step UNVERIFIED. Commands marked *(verified)* were checked against the official docs on 2026-10-14. Flags still change between releases, so re-check.

## The rule
Before you act on a Hermes host or answer a Hermes question, read the official documentation for that topic. Doing this every time is cheaper than one invented flag on a production gateway.

## Official sources (defaults of `HERMES_DOCS_URLS`)
- Docs index: https://hermes-agent.nousresearch.com/docs/llms.txt (machine-readable index of every page; full text at `llms-full.txt`)
- Repository README: https://github.com/NousResearch/hermes-agent
- Key pages: `reference/cli-commands`, `getting-started/updating`, `user-guide/features/api-server`, `user-guide/profiles`, `user-guide/secrets`, `user-guide/features/memory-providers`, `reference/faq`
- On the host itself: `hermes <command> --help` is authoritative for the installed version.

## Procedure (deterministic)
1. `hermes_docs {query: "<topic words>"}` searches the index and returns matching lines and suggested pages.
2. `hermes_docs {page: "<path>", query: "<flag or term>"}` reads the exact page.
3. If the host's version may differ from the docs, run `host_command action=version` or `hermes --help` on the host.
4. Act only on what the docs (or `--help`) show. Quote the doc URL in your report.
5. If nothing matches, say **"not in official docs"**, label the step **UNVERIFIED**, and ask the operator before mutating anything. Never invent commands, flags, endpoints, or config keys.

## Why this is principle #1
Hermes ships fast. Commands, flags and defaults move between releases (for example, `hermes login` was replaced by `hermes auth`). Lore from old chats goes stale, and the docs are the contract. Mutating tools in this plugin attach the relevant doc excerpt to their dry-run output for this reason. If the docs could not be fetched, the dry-run says **DOCS NOT CONSULTED**.
