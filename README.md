# kit

A coding agent with a swappable personality. Fork of [badlogic/pi-mono](https://github.com/badlogic/pi-mono) shaped into an engine that loads its behavior from an external directory.

Each "profile" is a directory of YAML and Markdown. It tells the agent what system prompt to run, which hooks to install, what slash commands to expose, what MCP servers to spawn, and what memory to seed. Point kit at a different profile, get a different agent. Same binary.

## What this fork adds on top of pi-mono

pi-mono ships a generic coding agent. Behavior is baked into one user config per install. kit keeps the runtime intact and adds a profile layer on top.

A profile declares:

- `system-prompt.md` — persona and rules for this domain.
- `hooks.yaml` — pre-tool-use rules that can block a call or run a subprocess validator first.
- `slash/*.yaml` — slash commands as data. Prompt templates or structured tool-call templates.
- `mcp-servers.yaml` — MCP subprocesses to spawn. Their advertised tools land in the agent's tool list automatically.
- `memory/*.md` — persistent memory seeds. Copied into `~/.kit/memory/` on first run.
- `config.yaml` — domain config read by templates via `${profile.config.<key>}`.

Profile authors write YAML and Markdown. No TypeScript. A coworker can build a profile without touching kit's source.

The architecture separates concerns by directory. The kit core stays public and generic. Profiles that contain private or domain-specific information live in separate directories outside this repo. A CI grep blocks domain terms from ever landing in the public tree.

## Status

Personal project, public for transparency. New issues and PRs from new contributors are auto-closed (inherited from pi-mono). Package is private by design and not intended for npm distribution.

## Getting started

```bash
git clone https://github.com/pvydro/kit
cd kit
npm install

# Add the launcher to your PATH
export PATH="$PWD/bin:$PATH"

# Point at a profile (example: see packages/kit/test-fixtures/empty-profile)
export KIT_PROFILE="$PWD/packages/kit/test-fixtures/empty-profile"

# Provider key (any pi-ai-supported provider works; Anthropic shown)
export ANTHROPIC_API_KEY="sk-ant-..."

kit -p "hello"
```

`~/.kit/logs/kit.log` records stderr for each invocation. Tail from a second terminal to watch factory events, hook firings, and subprocess diagnostics:

```bash
tail -f ~/.kit/logs/kit.log
```

See `CLAUDE.md` at the repo root for contributor context and fork-specific conventions.

## License

MIT, matching upstream. Upstream license file is preserved in [LICENSE](LICENSE).

## Credits

Upstream: [badlogic/pi-mono](https://github.com/badlogic/pi-mono). All the heavy lifting is theirs. This fork is a thin data-driven profile layer on top.
