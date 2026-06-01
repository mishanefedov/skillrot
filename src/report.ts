import type { CostReport } from "./cost.ts";
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
				if (f.suggestion) lines.push(`    ${green(`→ did you mean '${f.suggestion}'? (skillrot --fix)`)}`);
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
				flag: f.flag ?? null,
				suggestion: f.suggestion ?? null,
			})),
		},
		exitCode: errors.length > 0 ? 1 : 0,
	};
}

export function buildCostReport(cost: CostReport): Report {
	const lines: string[] = [];
	const k = (n: number) =>
		n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${n}`;

	lines.push(
		`${cost.skills.length} skills · ${yellow(`≈${k(cost.alwaysOnTokens)} tokens`)} injected into ${yellow("every session")} before you type anything`,
	);
	lines.push(dim(`(every skill's name + description is always loaded; bodies ≈${k(cost.bodyTokens)} tok load only when a skill fires)`));

	if (cost.skills.length > 0) {
		lines.push(`\nHeaviest always-on descriptions:`);
		for (const s of cost.skills.slice(0, 12)) {
			const heavy = s.descTokens > cost.heavyThreshold;
			const tag = heavy ? red(`≈${s.descTokens} tok`) : `≈${s.descTokens} tok`;
			lines.push(`  ${tag.padEnd(heavy ? 22 : 13)} ${s.name}  ${dim(s.file)}`);
		}
	}
	if (cost.heavy.length > 0) {
		lines.push(
			`\n${red(`${cost.heavy.length} skill(s)`)} have descriptions over ~${cost.heavyThreshold} tok — trim or disable to win context back.`,
		);
	} else {
		lines.push(`\n${green("✓ no oversized descriptions")} — your always-on footprint is lean.`);
	}

	return {
		text: lines.join("\n"),
		json: {
			skills: cost.skills.length,
			alwaysOnTokens: cost.alwaysOnTokens,
			bodyTokens: cost.bodyTokens,
			heavyThreshold: cost.heavyThreshold,
			breakdown: cost.skills.map((s) => ({
				name: s.name,
				file: s.file,
				descTokens: s.descTokens,
				bodyTokens: s.bodyTokens,
			})),
		},
		exitCode: 0,
	};
}
