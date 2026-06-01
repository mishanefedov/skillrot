# AGENTS.md — guide for coding agents working in this repo

skillrot audits agent skills for external-CLI drift. This file is the tool-agnostic
guide (Claude Code, Codex, Cursor, etc. all read it).

## Layout

- `src/` — the engine. `extract.ts` (parse skill bash → invocations),
  `introspect.ts` (probe installed CLIs via `--help`/`--version`),
  `analyze.ts` (compare used flags vs. accepted), `report.ts`, `cli.ts`.
- `skills/skillrot/SKILL.md` — the skill definition (plugin layout).
- `.claude-plugin/` — Claude Code plugin + marketplace manifests.
- `bin/skillrot` — launcher (on PATH under the plugin and via `bun link`).
- `scripts/gen-logo.ts` — regenerates `assets/skillrot.svg`.
- `test/` — `bun test`; deterministic fixtures (a fake CLI) so tests don't rot.

## Conventions

- Runtime: **Bun**. No build step — Bun runs the TypeScript directly.
- Zero runtime dependencies. Keep it that way; the engine only uses `node:*`.
- Before pushing: `bun test` and `bun run typecheck` must pass.
- The engine must **never** run a skill's real subcommand — only append
  `--help` / `--version`. This is the core safety property.
- Be conservative: a missing long flag is an error; anything uncertain
  (short flags, unreadable help, unparseable lines) is a warning. Don't cry wolf.

## Dogfood

```bash
bun run src/cli.ts skills       # skillrot audits its own skill (CI does this too)
```
