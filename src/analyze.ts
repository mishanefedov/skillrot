// Compare what each skill USES against what the installed CLI ACCEPTS.
//
// Conservative on purpose: a missing long flag is an error (high confidence),
// a missing short flag or an unverifiable case is only a warning. Crying wolf
// is the fastest way for a linter to get uninstalled.

import { probeKey } from "./introspect.ts";
import type { Finding, Invocation, ToolProbe } from "./types.ts";

// CLIs whose `--help`/`-h` is incomplete (they document flags via man pages, not
// a machine-readable listing). For these, a flag we can't find is NOT evidence
// of drift — `git clone --depth` is valid but absent from `git clone -h`. We
// downgrade their unconfirmable flags to warnings so they never false-error.
const INCOMPLETE_HELP = new Set(["git"]);

function escapeRegExp(s: string): string {
	return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** True when `flag` appears as a real token in the help text. */
export function helpHasFlag(helpText: string, flag: string): boolean {
	// Preceded by start/space/pipe/paren/bracket; followed by a word boundary,
	// `=`, `,`, space, or end. This stops `-c` matching inside `--config`.
	const re = new RegExp(`(^|[\\s|(\\[])${escapeRegExp(flag)}([=,\\s\\])]|$)`, "m");
	return re.test(helpText);
}

/** Every long flag (`--foo-bar`) the help text advertises. */
export function helpFlags(helpText: string): string[] {
	const set = new Set<string>();
	for (const m of helpText.matchAll(/--[a-z0-9][a-z0-9-]*/gi)) set.add(m[0].toLowerCase());
	return [...set];
}

function levenshtein(a: string, b: string): number {
	const m = a.length;
	const n = b.length;
	const d = Array.from({ length: m + 1 }, (_, i) => [i, ...new Array(n).fill(0)]);
	for (let j = 0; j <= n; j++) (d[0] as number[])[j] = j;
	for (let i = 1; i <= m; i++) {
		for (let j = 1; j <= n; j++) {
			const cost = a[i - 1] === b[j - 1] ? 0 : 1;
			(d[i] as number[])[j] = Math.min(
				(d[i - 1] as number[])[j]! + 1,
				(d[i] as number[])[j - 1]! + 1,
				(d[i - 1] as number[])[j - 1]! + cost,
			);
		}
	}
	return (d[m] as number[])[n]!;
}

/** Closest valid flag to a dead one — only when it's confidently near, so we
 *  never suggest an unrelated flag (a wrong auto-fix is worse than none). A
 *  match counts when one is a prefix of the other (rename/extension, e.g.
 *  --frozen → --frozen-lockfile) or the edit distance is tiny (typo/plural). */
export function suggestFlag(dead: string, valid: string[]): string | undefined {
	const d = dead.toLowerCase();
	let best: string | undefined;
	let bestScore = Infinity;
	for (const v of valid) {
		if (v === d) continue;
		const prefix = v.startsWith(d) || d.startsWith(v);
		const dist = levenshtein(d, v);
		const limit = Math.max(2, Math.floor(Math.max(d.length, v.length) / 4));
		const score = prefix ? 0 : dist;
		if ((prefix || dist <= limit) && score < bestScore) {
			best = v;
			bestScore = score;
		}
	}
	return best;
}

export function analyze(invocations: Invocation[], probes: Map<string, ToolProbe>): Finding[] {
	const findings: Finding[] = [];
	for (const inv of invocations) {
		const sub = inv.subPath.join(" ");
		const probe = probes.get(probeKey(inv.command, inv.subPath));
		if (!probe || !probe.installed) {
			findings.push({
				invocation: inv,
				level: "warn",
				reason: `${inv.command} is not installed — can't verify this invocation`,
			});
			continue;
		}
		if (probe.subcommandUnknown) {
			findings.push({
				invocation: inv,
				level: "error",
				reason: `subcommand '${probe.unknownToken ?? sub}' not found in ${probe.version ?? inv.command}`,
				version: probe.version,
			});
			continue;
		}
		if (!probe.helpOk) {
			findings.push({
				invocation: inv,
				level: "warn",
				reason: `couldn't read --help for ${inv.command}${sub ? ` ${sub}` : ""} — can't verify flags`,
				version: probe.version,
			});
			continue;
		}

		const validFlags = helpFlags(probe.helpText);
		for (const flag of inv.flags) {
			if (helpHasFlag(probe.helpText, flag)) continue;
			if (INCOMPLETE_HELP.has(inv.command)) {
				findings.push({
					invocation: inv,
					level: "warn",
					reason: `'${flag}'${sub ? ` on '${sub}'` : ""} not listed in ${inv.command}'s help (${inv.command} documents flags via man pages — can't fully verify)`,
					version: probe.version,
					flag,
				});
				continue;
			}
			const isLong = flag.startsWith("--");
			const suggestion = isLong ? suggestFlag(flag, validFlags) : undefined;
			findings.push({
				invocation: inv,
				level: isLong ? "error" : "warn",
				reason: `'${flag}'${sub ? ` on '${sub}'` : ""} not found in ${probe.version ?? inv.command} --help`,
				version: probe.version,
				flag,
				suggestion,
			});
		}
	}
	return findings;
}
