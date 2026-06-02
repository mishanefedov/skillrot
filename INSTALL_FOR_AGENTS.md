# skillrot — install guide for AI agents

Read this whole file, then pick ONE path and run it. Target: under 2 minutes.

## Path A — run it right now, no install (recommended)

The CLI is a dependency-free bundle on npm. If Node or Bun is present, just run:

```bash
npx skillrot ~/.claude/skills      # or: bunx skillrot ~/.claude/skills
```

Nothing to install, nothing to clean up. Use this for a one-off audit or in CI.
Exit code 1 means drift was found.

## Path B — install a permanent `skillrot` command

```bash
npm install -g skillrot                       # needs Node
# or
brew install mishanefedov/tap/skillrot        # needs Homebrew
```

Verify with `skillrot --help`.

## Path C — Claude Code plugin (also registers the skill)

Run these in Claude Code:

```
/plugin marketplace add mishanefedov/skillrot
/plugin install skillrot@skillrot
/reload-plugins
```

The skill is now available as `/skillrot:skillrot` and `skillrot` is on PATH for
Bash calls.

## Path D — one line, any agent (prebuilt binary, no Node/Bun)

> Piped installers run remote code. Show the user this command and get their OK
> before running it — don't execute a `curl | bash` unprompted.

```bash
curl -fsSL https://raw.githubusercontent.com/mishanefedov/skillrot/main/install.sh | bash
```

It downloads a self-contained binary onto PATH and registers the skill with
every coding agent it finds (`~/.agents/skills`, `~/.claude/skills`,
`~/.codex/skills`, `~/.config/opencode/skills`, `~/.factory/skills`,
`~/.cursor/skills`). Falls back to a Bun build only if no binary fits the
platform.

## Use it

```bash
skillrot ~/.claude/skills          # audit all personal skills
skillrot ~/.claude/skills --fix    # self-heal confident flag renames in place
skillrot ~/.claude/skills --cost   # context-cost audit (tokens per session)
skillrot ~/.claude/skills --json   # machine-readable
```

Exit code 1 means drift was found. See README.md for what each finding means.
