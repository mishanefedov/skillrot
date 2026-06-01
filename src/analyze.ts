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

		for (const flag of inv.flags) {
			if (helpHasFlag(probe.helpText, flag)) continue;
			if (INCOMPLETE_HELP.has(inv.command)) {
				findings.push({
					invocation: inv,
					level: "warn",
					reason: `'${flag}'${sub ? ` on '${sub}'` : ""} not listed in ${inv.command}'s help (${inv.command} documents flags via man pages — can't fully verify)`,
					version: probe.version,
				});
				continue;
			}
			const isLong = flag.startsWith("--");
			findings.push({
				invocation: inv,
				level: isLong ? "error" : "warn",
				reason: `'${flag}'${sub ? ` on '${sub}'` : ""} not found in ${probe.version ?? inv.command} --help`,
				version: probe.version,
			});
		}
	}
	return findings;
}
