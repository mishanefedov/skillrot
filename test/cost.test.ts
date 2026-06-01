import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import { auditCost, estTokens, parseFrontmatter } from "../src/cost.ts";

describe("estTokens", () => {
	test("≈ chars/4", () => expect(estTokens("a".repeat(40))).toBe(10));
});

describe("parseFrontmatter", () => {
	test("extracts name + folded multi-line description, separates body", () => {
		const md = [
			"---",
			"name: demo",
			"description: >",
			"  first line",
			"  second line",
			"allowed-tools: Bash",
			"---",
			"# Body",
			"some content",
		].join("\n");
		const fm = parseFrontmatter(md);
		expect(fm.name).toBe("demo");
		expect(fm.description).toContain("first line");
		expect(fm.description).toContain("second line");
		expect(fm.description).not.toContain("allowed-tools");
		expect(fm.body).toContain("# Body");
	});
});

describe("auditCost", () => {
	test("sums always-on description tokens and flags heavy ones", () => {
		const root = mkdtempSync(join(tmpdir(), "skillrot-cost-"));
		// lean skill
		mkdirSync(join(root, "lean"));
		writeFileSync(join(root, "lean/SKILL.md"), "---\nname: lean\ndescription: short\n---\nbody");
		// heavy skill: a description well over the 200-token threshold
		mkdirSync(join(root, "heavy"));
		const bigDesc = "word ".repeat(400); // ≈500 tokens
		writeFileSync(join(root, "heavy/SKILL.md"), `---\nname: heavy\ndescription: ${bigDesc}\n---\nbody`);

		const r = auditCost(root);
		expect(r.skills.length).toBe(2);
		// heaviest first
		expect(r.skills[0]?.name).toBe("heavy");
		expect(r.heavy.map((s) => s.name)).toContain("heavy");
		expect(r.heavy.map((s) => s.name)).not.toContain("lean");
		expect(r.alwaysOnTokens).toBeGreaterThan(r.heavy[0]?.descTokens ?? 0 - 1);
	});
});
