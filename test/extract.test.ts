import { describe, expect, test } from "bun:test";
import { extractFromText, parseLine, splitSegments, tokenize } from "../src/extract.ts";

const ALLOW = ["codex", "gh", "docker"];

describe("tokenize", () => {
	test("respects quotes", () => {
		expect(tokenize(`codex review --base origin/main "a prompt"`)).toEqual([
			"codex",
			"review",
			"--base",
			"origin/main",
			"a prompt",
		]);
	});
});

describe("splitSegments", () => {
	test("splits on pipes but not inside quotes", () => {
		expect(splitSegments(`gh pr list | grep "a|b"`)).toEqual(["gh pr list", `grep "a|b"`]);
	});
});

describe("parseLine", () => {
	const allow = new Set(ALLOW);

	test("extracts command, subPath, flags", () => {
		const [inv] = parseLine("codex review --base origin/main --json", allow);
		expect(inv?.command).toBe("codex");
		expect(inv?.subPath).toEqual(["review"]);
		expect(inv?.flags).toEqual(["--base", "--json"]);
	});

	test("captures a nested subcommand path (gh pr view)", () => {
		const [inv] = parseLine("gh pr view --json state", allow);
		expect(inv?.command).toBe("gh");
		expect(inv?.subPath).toEqual(["pr", "view"]);
		expect(inv?.flags).toEqual(["--json"]);
	});

	test("stops the subPath at the first flag (no positional args)", () => {
		const [inv] = parseLine("gh pr view 123 --json", allow);
		expect(inv?.subPath).toEqual(["pr", "view"]); // '123' is a positional arg, not a subcommand
	});

	test("unwraps sudo / env / timeout wrappers", () => {
		const [inv] = parseLine("sudo timeout 30 docker compose up --build", allow);
		expect(inv?.command).toBe("docker");
		expect(inv?.subPath).toEqual(["compose", "up"]);
		expect(inv?.flags).toEqual(["--build"]);
	});

	test("ignores non-allowlisted commands", () => {
		expect(parseLine("echo hello && cd /tmp", allow)).toHaveLength(0);
	});

	test("strips =value off flags", () => {
		const [inv] = parseLine("gh pr view --json=state", allow);
		expect(inv?.flags).toEqual(["--json"]);
	});
});

describe("extractFromText", () => {
	test("only reads bash fences in markdown, with correct line numbers", () => {
		const md = [
			"# Skill", // 1
			"", // 2
			"Some prose with `gh pr merge` inline (ignored).", // 3
			"", // 4
			"```bash", // 5
			"codex review --base origin/main", // 6
			"```", // 7
			"```python", // 8
			"gh = 'not a shell call'", // 9
			"```", // 10
		].join("\n");
		const invs = extractFromText(md, { skill: "demo", file: "SKILL.md", allowlist: ALLOW });
		expect(invs).toHaveLength(1);
		expect(invs[0]?.command).toBe("codex");
		expect(invs[0]?.line).toBe(6);
	});

	test("joins backslash continuations", () => {
		const md = ["```sh", "gh pr create \\", "  --base main \\", "  --fill", "```"].join("\n");
		const [inv] = extractFromText(md, { skill: "demo", file: "x.sh", allowlist: ALLOW });
		expect(inv?.command).toBe("gh");
		expect(inv?.flags).toEqual(["--base", "--fill"]);
	});

	test("does NOT treat prose after a non-shell fence as shell (fence-close bug)", () => {
		// Regression: closing a ```python block must not open a phantom shell fence.
		const md = [
			"```python", // 1 open python
			"x = 'codex review --base x'", // 2 (must be ignored)
			"```", // 3 close python
			"Now run gh pr merge --admin in your terminal.", // 4 prose — must NOT be parsed
			"```bash", // 5 open shell
			"gh pr view --json state", // 6 real
			"```", // 7
		].join("\n");
		const invs = extractFromText(md, { skill: "demo", file: "SKILL.md", allowlist: ALLOW });
		expect(invs).toHaveLength(1);
		expect(invs[0]?.command).toBe("gh");
		expect(invs[0]?.subPath).toEqual(["pr", "view"]);
	});
});
