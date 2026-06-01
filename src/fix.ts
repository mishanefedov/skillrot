// Self-heal: rewrite drifted flags to their suggested replacement in place.
// Only findings that carry a `suggestion` are touched — never a guess.

import { readFileSync, writeFileSync } from "node:fs";
import type { Finding } from "./types.ts";

export interface FixResult {
	file: string;
	line: number;
	from: string;
	to: string;
}

function escapeRegExp(s: string): string {
	return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Apply every fixable finding (one with a suggestion). Edits are grouped per
 * file and replace ONLY the dead flag token on its exact line, preserving any
 * `=value`. Returns what changed. Findings without a suggestion are skipped.
 */
export function applyFixes(findings: Finding[]): FixResult[] {
	const fixable = findings.filter((f) => f.flag && f.suggestion);
	const byFile = new Map<string, Finding[]>();
	for (const f of fixable) {
		const arr = byFile.get(f.invocation.file) ?? [];
		arr.push(f);
		byFile.set(f.invocation.file, arr);
	}

	const results: FixResult[] = [];
	for (const [file, fs] of byFile) {
		let lines: string[];
		try {
			lines = readFileSync(file, "utf8").split("\n");
		} catch {
			continue;
		}
		let touched = false;
		for (const f of fs) {
			const idx = f.invocation.line - 1;
			if (idx < 0 || idx >= lines.length) continue;
			const dead = f.flag as string;
			const sugg = f.suggestion as string;
			// Replace the flag token only (followed by space, `=`, or end of token),
			// so `--frozen` → `--frozen-lockfile` doesn't mangle `--frozen=x`.
			const re = new RegExp(`(^|\\s)${escapeRegExp(dead)}(?=$|[\\s=])`);
			const before = lines[idx] as string;
			const after = before.replace(re, `$1${sugg}`);
			if (after !== before) {
				lines[idx] = after;
				touched = true;
				results.push({ file, line: f.invocation.line, from: dead, to: sugg });
			}
		}
		if (touched) writeFileSync(file, lines.join("\n"));
	}
	return results;
}
