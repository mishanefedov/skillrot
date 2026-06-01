---
name: stale-skill
description: >
  A deliberately out-of-date example skill, for the skillrot README/demo. Each
  bash command below uses a flag the installed CLI does NOT accept (a renamed or
  removed flag) — exactly the silent drift skillrot catches. Run:
  `skillrot examples/stale-skill`.
---

# stale-skill (demo)

```bash
gh pr create --reviewers alice --title "Ship it"
bun install --frozen
gh pr view --web-browser 42
```
