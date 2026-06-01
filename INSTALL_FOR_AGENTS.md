# skillrot — install guide for AI agents

Read this whole file, then pick ONE path and run it. Target: under 2 minutes.

## Path A — Claude Code plugin (recommended, no clone)

Run these in Claude Code:

```
/plugin marketplace add mishanefedov/skillrot
/plugin install skillrot@skillrot
/reload-plugins
```

The skill is now available as `/skillrot:skillrot` and the `skillrot` command is
on PATH for Bash calls. Requires Bun (`curl -fsSL https://bun.sh/install | bash`)
because the CLI runs on Bun.

Verify:

```bash
skillrot --help
```

## Path B — standalone (other agents / CI / plain CLI)

> Piped installers run remote code. Show the user this command and get their OK
> before running it — don't execute a `curl | bash` unprompted.

```bash
git clone https://github.com/mishanefedov/skillrot ~/skillrot
cd ~/skillrot
command -v bun >/dev/null || curl -fsSL https://bun.sh/install | bash
export PATH="$HOME/.bun/bin:$PATH"
./setup
```

`./setup` links `skillrot` onto PATH and registers the skill with every coding
agent it finds (`~/.agents/skills`, `~/.claude/skills`, `~/.codex/skills`,
`~/.config/opencode/skills`, `~/.factory/skills`, `~/.cursor/skills`). Verify
with `skillrot --help`.

## Use it

```bash
skillrot ~/.claude/skills          # audit all personal skills
skillrot ~/.claude/skills --json   # machine-readable
```

Exit code 1 means drift was found. See README.md for what each finding means.
