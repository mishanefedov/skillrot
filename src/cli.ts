#!/usr/bin/env bun
// skillrot — audit agent skills for CLI drift.

import { existsSync } from "node:fs";
import { analyze } from "./analyze.ts";
import { DEFAULT_ALLOWLIST, extractFromDir } from "./extract.ts";
import { introspect } from "./introspect.ts";
import { buildReport } from "./report.ts";

const HELP = `skillrot — find skills that call CLIs with flags/subcommands the installed version no longer accepts.

Usage:
  skillrot [path] [options]

Arguments:
  path                 Skills root to scan (default: current directory).
                       Each subdirectory is treated as one skill; a directory
                       containing SKILL.md is scanned as a single skill.

Options:
  --tools a,b,c        Only check these CLIs (default: a built-in allowlist).
  --json               Emit machine-readable JSON instead of the text report.
  -h, --help           Show this help.

Exit code: 1 when any drift (error-level) is found, else 0.

What it checks (v1): removed/renamed flags, dead subcommands, uninstalled tools.
It only ever runs '<tool> --help' / '--version' — never your real commands.
Semantic constraints (e.g. "flag A can't combine with flag B") are the v2
sandboxed-replay roadmap; see the README.`;

function main(argv: string[]): number {
	const args = argv.slice(2);
	if (args.includes("-h") || args.includes("--help")) {
		console.log(HELP);
		return 0;
	}

	let path = ".";
	let json = false;
	let tools: string[] | undefined;
	for (let i = 0; i < args.length; i++) {
		const a = args[i] as string;
		if (a === "--json") {
			json = true;
		} else if (a === "--tools") {
			const v = args[++i];
			if (!v || v.startsWith("-")) {
				console.error("skillrot: --tools needs a comma-separated value, e.g. --tools codex,gh");
				return 2;
			}
			tools = v.split(",").map((s) => s.trim()).filter(Boolean);
		} else if (a.startsWith("-")) {
			console.error(`skillrot: unknown option '${a}' (try --help)`);
			return 2;
		} else {
			path = a;
		}
	}

	if (!existsSync(path)) {
		console.error(`skillrot: path not found: ${path}`);
		return 2;
	}

	const invocations = extractFromDir(path, tools ?? DEFAULT_ALLOWLIST);
	const probes = introspect(invocations);
	const findings = analyze(invocations, probes);
	const report = buildReport(findings, invocations.length);

	console.log(json ? JSON.stringify(report.json, null, 2) : report.text);
	return report.exitCode;
}

process.exit(main(process.argv));
