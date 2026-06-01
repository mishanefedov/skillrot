import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import { helpFlags, suggestFlag } from "../src/analyze.ts";
import { applyFixes } from "../src/fix.ts";
import type { Finding, Invocation } from "../src/types.ts";

describe("helpFlags", () => {
	test("extracts long flags from help text", () => {
		const flags = helpFlags("Usage\n  --reviewer handle\n  --web open browser\n  -t, --title");
		expect(flags).toContain("--reviewer");
		expect(flags).toContain("--web");
		expect(flags).toContain("--title");
	});
});

describe("suggestFlag", () => {
	const valid = ["--reviewer", "--web", "--frozen-lockfile", "--title"];
	test("plural typo → singular", () => expect(suggestFlag("--reviewers", valid)).toBe("--reviewer"));
	test("prefix rename → extended flag", () => expect(suggestFlag("--frozen", valid)).toBe("--frozen-lockfile"));
	test("longer variant → base flag", () => expect(suggestFlag("--web-browser", valid)).toBe("--web"));
	test("no confident match → undefined", () => expect(suggestFlag("--xyzzy", valid)).toBeUndefined());
});

describe("applyFixes", () => {
	test("rewrites the dead flag on its exact line, preserving the rest", () => {
		const dir = mkdtempSync(join(tmpdir(), "skillrot-fix-"));
		const file = join(dir, "SKILL.md");
		writeFileSync(file, ["```bash", 'gh pr create --reviewers alice --title "x"', "```"].join("\n"));

		const inv: Invocation = {
			skill: "s",
			file,
			line: 2,
			command: "gh",
			subPath: ["pr", "create"],
			flags: ["--reviewers", "--title"],
			raw: 'gh pr create --reviewers alice --title "x"',
		};
		const findings: Finding[] = [
			{ invocation: inv, level: "error", reason: "x", flag: "--reviewers", suggestion: "--reviewer" },
		];

		const results = applyFixes(findings);
		expect(results).toHaveLength(1);
		expect(results[0]?.from).toBe("--reviewers");
		expect(results[0]?.to).toBe("--reviewer");
		const after = readFileSync(file, "utf8");
		expect(after).toContain('gh pr create --reviewer alice --title "x"');
		expect(after).not.toContain("--reviewers");
	});

	test("skips findings without a suggestion", () => {
		const dir = mkdtempSync(join(tmpdir(), "skillrot-fix-"));
		const file = join(dir, "SKILL.md");
		writeFileSync(file, "codex --full-auto x\n");
		const inv: Invocation = {
			skill: "s",
			file,
			line: 1,
			command: "codex",
			subPath: [],
			flags: ["--full-auto"],
			raw: "codex --full-auto x",
		};
		expect(applyFixes([{ invocation: inv, level: "error", reason: "x", flag: "--full-auto" }])).toHaveLength(0);
	});
});
