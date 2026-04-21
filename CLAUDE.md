# CLAUDE.md

Project-specific guide for Claude Code sessions in this repo. **Read `AGENTS.md` first** for the baseline pi-mono conventions (command rules, git rules, coding rules, PR workflow) — those inherit here. This file layers fork-specific context on top.

## What this is

kit is a fork of [badlogic/pi-mono](https://github.com/badlogic/pi-mono) shaped into a **generic profiled coding-agent engine**. The core (this repo) is domain-agnostic. All domain behavior — system prompt, tools, hooks, slash commands, memory seed — comes from an externally-loaded *profile* directory. Swap the profile, swap the agent's personality.

- Public core, MIT, generic
- Private profile repos per domain, owned separately (not tracked here)
- No profile code is ever dynamically imported by core. Profiles are data (YAML + Markdown) plus any MCP subprocesses they declare

## Status

Planning complete. First code milestone (M0: fork boot baseline) not started.

## Primary planning docs (local vault, not tracked here)

`C:/Users/pedro/Desktop/Code/note-vault/kit/`

Start with `index.md`. Key files:
- `00-context.md` — goals, non-goals, success criteria
- `01-architecture.md` — core vs profile, package layout, flows
- `02-tool-surface.md` — core tools + profile-contributed tools
- `05-milestones.md` — M0 through M10
- `10-profile-spec.md` — profile directory format v1
- `11-ip-boundary.md` — what must not land in this repo
- `ADR-001-fork-pi-mono.md`, `ADR-002-profile-as-data.md`

A Claude Code session starting in this repo: open the vault index first, then come back.

## IP boundary (hard rule)

This repo is intended to be public. It must not contain:
- Names of specific products, companies, internal tools, or proprietary platforms that profiles serve
- Internal system-registry keys, deploy paths, chipset identifiers, bundle names
- Content of any profile's system prompt, memory, or config

Enforced by `ci/ip-guard.sh` (to be added in M0). See `11-ip-boundary.md` in the vault for the full forbidden-term list.

## Upstream

- `upstream` remote → `https://github.com/badlogic/pi-mono`
- Rebase opportunistically, not reflexively
- `AGENTS.md` from upstream is authoritative for all conventions it already covers. This `CLAUDE.md` does not override it; it supplements with fork-specific context.

## Key design decisions (short form)

- **Runtime:** TypeScript + Node.js (pi-mono native)
- **Profile model:** data-only. YAML + Markdown + MCP server declarations. Core never dynamic-imports profile code.
- **Discovery:** registry at `~/.kit/config.yaml` maps profile names to directories. `kit --profile <name>` selects.
- **Memory:** explicit `remember` / `recall` tools the model calls deliberately. `~/.kit/memory/MEMORY.md` injected into system prompt. No auto-compaction magic.
- **Hooks:** data-driven. Profile's `hooks.yaml` declares rules like `on write *.xml → run <tool>`.
- **Slash commands:** data-driven. Profile's `slash/*.yaml` declares name + action (prompt template or direct tool call).
- **Target model:** Opus 4.7 1M context via the Anthropic provider. First-day verification: `packages/ai/src/providers/anthropic.ts` passes beta headers.

## Package layout (pi-mono inherited)

```
packages/
├── agent           # runtime: tool loop, state
├── ai              # provider abstraction (Anthropic / OpenAI / Gemini / …)
├── coding-agent    # interactive CLI (to be cloned/replaced by kit package in M1)
├── mom             # Slack bot — OUT OF SCOPE, delete in M0
├── pods            # vLLM deployment — OUT OF SCOPE, delete in M0
├── tui             # terminal UI
└── web-ui          # chat web components — OUT OF SCOPE, delete in M0
```

## M0 first tasks

After cloning (done):

1. `npm install`
2. `./test.sh` — confirm baseline tests pass
3. `./pi-test.sh` — confirm coding-agent runs
4. Read `packages/ai/src/providers/anthropic.ts` — confirm 1M-context beta header handling
5. Add `ci/ip-guard.sh` (spec in vault `11-ip-boundary.md`) and wire into `.github/workflows/`
6. Plan the removal of `mom`, `pods`, `web-ui` packages (do not delete yet; confirm nothing in the remaining packages imports from them first)

Then M1: create the `kit` engine package by cloning `coding-agent` structurally, add profile loader. See vault `05-milestones.md`.

## What not to do

- Do not add profile-specific code, config, or content to this repo
- Do not reference specific domains (product names, internal tools, chipset codes) in source, tests, docs, or examples. Use generic fixtures like `example-profile`, `test-tool`.
- Do not merge upstream pi-mono changes blindly; review for anything that conflicts with the profile-engine direction
- Do not commit with AI attribution (no `Co-Authored-By`, no "Generated with Claude Code")
- Do not run `npm run build`, `npm run dev`, or `npm test` directly — use `./test.sh` / `./pi-test.sh` per `AGENTS.md`
- Do not touch `packages/coding-agent` before M1 work starts
