---
name: skillrot
description: >
  Audit installed agent skills for CLI drift. Finds skills that call external
  tools (codex, gh, docker, bun, supabase, ...) with flags or subcommands the
  installed version no longer accepts — the silent failure where a skill keeps
  emitting a dead command and breaks mid-task. Use when the user says "check my
  skills", "skill drift", "skillrot", "are my skills out of date", "audit
  skills", or after upgrading a CLI a skill depends on.
allowed-tools: Bash(skillrot:*)
license: MIT
compatibility: Requires Bun and the skillrot CLI on PATH.
---

# skillrot — skill CLI drift audit

Skills that shell out to external CLIs rot silently: the tool ships a new
version, a flag is renamed or a subcommand removed, and the skill keeps
generating the old command. You only find out when an agent fails mid-task.

`skillrot` reads each skill's bash, extracts the `command subcommand --flags` it
uses, and checks them against the installed CLI's own `--help`. It only ever
appends `--help` / `--version` — never the skill's real subcommands — which is
low-risk (a binary could in principle act before parsing args, so it's not a
hard read-only guarantee).

## Run it

When installed as a plugin, `skillrot` is already on PATH:

```bash
skillrot ~/.claude/skills          # scan all personal skills
skillrot .                         # scan the current skill folder
skillrot ~/.claude/skills --json   # machine-readable
skillrot ~/.claude/skills --tools codex,gh,docker
```

If `skillrot: command not found`, Bun isn't installed — tell the user:
`curl -fsSL https://bun.sh/install | bash`. Nothing else to set up.

`<dir>` is a folder where each subdirectory is one skill, or a single skill
directory containing `SKILL.md`. It scans `SKILL.md` bash fences and `*.sh`
scripts.

## Interpreting output

- `✗ error` — a long flag or subcommand the installed CLI no longer accepts. Fix the skill.
- `! warning` — a missing short flag, an uninstalled tool, or a `--help` that couldn't be read. Eyeball it.
- `✓` — every checked invocation matches the installed CLIs.

Exit code is 1 when any error-level drift is found, so it can gate a commit hook.

## Scope (v1)

Catches removed/renamed flags, dead subcommands, and uninstalled tools. It does
NOT yet catch semantic constraints (e.g. "flag A can't be combined with flag
B") — that needs sandboxed replay of the real arg shape and is the v2 roadmap.
