---
name: compound-learnings
description: >-
  Use after any Hermes incident, surprise, or fix. Turn the lesson into a skill or rule plus a regression check, cite the official doc it was checked against (or mark it unverified), and log it in CHANGELOG and docs/LESSONS.md.
---
# compound-learnings

**Step 0 (Golden Rule, [golden-rule-read-docs-first](../golden-rule-read-docs-first/SKILL.md)):** before any command, answer, or config change below, call `hermes_docs` for the topic (pages listed under *Docs*). If the docs don't cover it, say **"not in official docs"** and mark the step UNVERIFIED. Commands marked *(verified)* were checked against the official docs on 2026-10-14. Flags still change between releases, so re-check.

## Loop (run every time something breaks or surprises you)
1. **Name the lesson** in one sentence: symptom → root cause → fix.
2. **Check it against the docs** (Golden Rule). Record the doc URL that confirms the fix, or mark the lesson `UNVERIFIED (not in official docs)`. A lesson without a citation or that mark is not accepted.
3. **Encode it in the smallest durable form:**
   - a rule line in the most relevant existing skill (preferred), or
   - a new skill only if no existing one fits.
   - Do not add a tool unless the model cannot do the job with existing tools plus a skill (bitter lesson).
4. **Add a regression check** in `test/smoke.mjs` named `LESSON <short name>`, if the behaviour is testable against the mock. Otherwise add a manual check to the relevant skill's *Verify* section.
5. **Log it:** add an entry to `docs/LESSONS.md` (date, lesson, doc citation or UNVERIFIED, where encoded, test name) and a line under *Unreleased* in `CHANGELOG.md`.
6. **Scrub it:** no hostnames, IPs, usernames, emails or keys in lessons. Write generic placeholders such as `<host>`.
7. Run `node test/smoke.mjs` (with the mock running) and the secret scan before committing.

## Template (docs/LESSONS.md)
```
### YYYY-MM-DD: <lesson title>
- Symptom:
- Root cause:
- Fix / rule:
- Checked against: <official doc URL> | UNVERIFIED (not in official docs)
- Encoded in: skills/<skill>/SKILL.md
- Regression: test/smoke.mjs "LESSON ..." | manual
```
