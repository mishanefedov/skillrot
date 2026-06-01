import type { Finding } from "./types.ts";

export interface Report {
	text: string;
	json: object;
	exitCode: number;
}

const COLOR = process.stdout.isTTY && !process.env.NO_COLOR;
const red = (s: string) => (COLOR ? `\x1b[31m${s}\x1b[0m` : s);
const yellow = (s: string) => (COLOR ? `\x1b[33m${s}\x1b[0m` : s);
const green = (s: string) => (COLOR ? `\x1b[32m${s}\x1b[0m` : s);
const dim = (s: string) => (COLOR ? `\x1b[2m${s}\x1b[0m` : s);

export function buildReport(findings: Finding[], scanned: number): Report {
	const errors = findings.filter((f) => f.level === "error");
	const warns = findings.filter((f) => f.level === "warn");

	const bySkill = new Map<string, Finding[]>();
	for (const f of [...errors, ...warns]) {
		const arr = bySkill.get(f.invocation.skill) ?? [];
		arr.push(f);
		bySkill.set(f.invocation.skill, arr);
	}

	const lines: string[] = [];
	if (bySkill.size === 0) {
		lines.push(green(`✓ no drift — ${scanned} invocation(s) checked, all current`));
	} else {
		for (const [skill, fs] of bySkill) {
			lines.push(`\n${skill}`);
			for (const f of fs) {
				const mark = f.level === "error" ? red("✗") : yellow("!");
				const loc = dim(`${f.invocation.file}:${f.invocation.line}`);
				lines.push(`  ${mark} ${f.reason}`);
				lines.push(`    ${dim(f.invocation.raw.trim())}`);
				lines.push(`    ${loc}`);
			}
		}
		lines.push(
			`\n${red(`${errors.length} drift`)}  ${yellow(`${warns.length} warning`)}  ${dim(`${scanned} checked`)}`,
		);
	}

	return {
		text: lines.join("\n"),
		json: {
			scanned,
			errors: errors.length,
			warnings: warns.length,
			findings: findings.map((f) => ({
				skill: f.invocation.skill,
				file: f.invocation.file,
				line: f.invocation.line,
				command: f.invocation.command,
				subPath: f.invocation.subPath,
				flags: f.invocation.flags,
				level: f.level,
				reason: f.reason,
				version: f.version ?? null,
			})),
		},
		exitCode: errors.length > 0 ? 1 : 0,
	};
}
