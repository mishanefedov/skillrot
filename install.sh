#!/usr/bin/env bash
# One-line cross-agent installer:
#   curl -fsSL https://raw.githubusercontent.com/mishanefedov/skillrot/main/install.sh | bash
#
# Clones skillrot, installs Bun if missing, and registers the skill with every
# coding agent on this machine (Claude Code, Codex, opencode, Factory, Cursor,
# Kiro). Re-run any time to update.
set -euo pipefail

REPO="https://github.com/mishanefedov/skillrot"
DEST="${SKILLROT_HOME:-$HOME/.skillrot}"

command -v git >/dev/null 2>&1 || { echo "git is required." >&2; exit 1; }

if [ -d "$DEST/.git" ]; then
	echo "→ updating $DEST"
	git -C "$DEST" pull --ff-only --quiet
else
	echo "→ cloning into $DEST"
	git clone --depth 1 --quiet "$REPO" "$DEST"
fi

if ! command -v bun >/dev/null 2>&1; then
	echo "→ installing Bun"
	curl -fsSL https://bun.sh/install | bash
	export PATH="$HOME/.bun/bin:$PATH"
fi

exec "$DEST/setup"
