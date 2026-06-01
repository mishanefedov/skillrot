// Context-cost audit. Claude Code (and other agents) load every installed
// skill's name + description into the system prompt at session start so the
// model knows the skill exists — the body only loads when the skill fires. So
// the ALWAYS-ON context cost you pay on every single session, before you type
// anything, is the sum of every skill's name + description. This measures it.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { findSkillDirs } from "./extract.ts";

// Rough token estimate. Real tokenizers vary by model; ~4 chars/token is the
// widely-used approximation. Reported with "≈" so it's never sold as exact.
export function estTokens(text: string): number {
	return Math.ceil(text.trim().length / 4);
}

interface Frontmatter {
	name: string;
	description: string;
	body: string;
}

/** Pull name + description (the always-on metadata) and the body from a SKILL.md. */
export function parseFrontmatter(content: string): Frontmatter {
	const m = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
	if (!m) return { name: "", description: "", body: content };
	const fm = m[1] as string;
	const body = m[2] ?? "";
	const name = (fm.match(/^name:\s*(.+)$/m)?.[1] ?? "").trim();
	// description may be folded (`>`) and span indented continuation lines until
	// the next top-level `key:`.
	let description = "";
	const dm = fm.match(/^description:\s*(.*)$/m);
	if (dm) {
		const start = (dm.index ?? 0) + (dm[0] as string).length;
		const rest = fm.slice(start).split("\n");
		const head = (dm[1] ?? "").replace(/^[>|]\s*/, "").trim();
		const cont: string[] = [];
		for (const line of rest) {
			if (/^\S/.test(line) && /^[\w-]+:/.test(line)) break; // next top-level key
			cont.push(line.trim());
		}
		description = [head, ...cont].join(" ").trim();
	}
	return { name, description, body };
}

export interface SkillCost {
	name: string;
	file: string;
	descTokens: number; // always-on
	bodyTokens: number; // on-demand (only when the skill fires)
}

export interface CostReport {
	skills: SkillCost[];
	alwaysOnTokens: number;
	bodyTokens: number;
	heavy: SkillCost[]; // descriptions over the trim threshold
	heavyThreshold: number;
}

const HEAVY_DESC_TOKENS = 200;

export function auditCost(root: string): CostReport {
	// One SKILL.md per top-level skill dir — that's what an agent actually loads
	// into context. We deliberately do NOT recurse into a skill's own
	// subdirectories (e.g. mirror copies under .cursor/.opencode/...), which are
	// for other agents and would inflate the count.
	const skills: SkillCost[] = [];
	for (const { name, dir } of findSkillDirs(root)) {
		const file = join(dir, "SKILL.md");
		if (!existsSync(file)) continue;
		let content: string;
		try {
			content = readFileSync(file, "utf8");
		} catch {
			continue;
		}
		const { name: fmName, description, body } = parseFrontmatter(content);
		skills.push({
			name: fmName || name,
			file,
			descTokens: estTokens(`${fmName} ${description}`),
			bodyTokens: estTokens(body),
		});
	}
	skills.sort((a, b) => b.descTokens - a.descTokens);
	const alwaysOnTokens = skills.reduce((s, x) => s + x.descTokens, 0);
	const bodyTokens = skills.reduce((s, x) => s + x.bodyTokens, 0);
	const heavy = skills.filter((s) => s.descTokens > HEAVY_DESC_TOKENS);
	return { skills, alwaysOnTokens, bodyTokens, heavy, heavyThreshold: HEAVY_DESC_TOKENS };
}
