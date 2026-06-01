// Extract external-CLI invocations from a skill's text.
//
// This is deliberately a lightweight, quote-aware tokenizer — NOT a full shell
// parser. It finds `command [subcommand] --flags` patterns for a known set of
// external CLIs and ignores everything else (cd, echo, grep, pipes, env vars).

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { Invocation } from "./types.ts";

/** CLIs worth checking by default. Override with --tools or a config. */
export const DEFAULT_ALLOWLIST = [
	"codex",
	"gh",
	"glab",
	"docker",
	"bun",
	"npm",
	"pnpm",
	"yarn",
	"biome",
	"eslint",
	"prettier",
	"ruff",
	"supabase",
	"vercel",
	"gcloud",
	"kubectl",
	"aws",
	"git",
];

// Command prefixes that wrap the real command; we step past them.
const WRAPPERS = new Set([
	"sudo",
	"env",
	"time",
	"nohup",
	"setsid",
	"command",
	"exec",
	"builtin",
	"bunx",
	"npx",
	"watch",
	"xargs",
	"nice",
]);

// How many leading non-flag tokens after the command we treat as the subcommand
// path (e.g. `gh pr view` → ["pr","view"]). Capping at 2 captures real nested
// subcommands while dropping most positional args (`gh pr view 123`).
const MAX_SUBPATH = 2;
// Wrappers that consume one following argument (a duration / niceness / class).
const WRAPPERS_WITH_ARG = new Set(["timeout", "gtimeout", "ionice"]);

/** Split a line into top-level segments on `|`, `;`, `&` (quote-aware). */
export function splitSegments(line: string): string[] {
	const out: string[] = [];
	let cur = "";
	let quote: string | null = null;
	for (let i = 0; i < line.length; i++) {
		const c = line[i] as string;
		if (quote) {
			cur += c;
			if (c === quote) quote = null;
			continue;
		}
		if (c === '"' || c === "'" || c === "`") {
			quote = c;
			cur += c;
			continue;
		}
		if (c === "|" || c === ";" || c === "&") {
			out.push(cur);
			cur = "";
			continue;
		}
		cur += c;
	}
	out.push(cur);
	return out.map((s) => s.trim()).filter(Boolean);
}

/** Quote-aware tokenizer. Strips surrounding quotes, keeps the rest verbatim. */
export function tokenize(segment: string): string[] {
	const tokens: string[] = [];
	let cur = "";
	let quote: string | null = null;
	let started = false;
	const push = () => {
		if (started) tokens.push(cur);
		cur = "";
		started = false;
	};
	for (let i = 0; i < segment.length; i++) {
		const c = segment[i] as string;
		if (quote) {
			if (c === quote) quote = null;
			else cur += c;
			started = true;
			continue;
		}
		if (c === '"' || c === "'") {
			quote = c;
			started = true;
			continue;
		}
		if (c === "\\" && i + 1 < segment.length) {
			cur += segment[++i];
			started = true;
			continue;
		}
		if (c === " " || c === "\t") {
			push();
			continue;
		}
		cur += c;
		started = true;
	}
	push();
	return tokens;
}

/** Step past wrappers and leading VAR=value assignments. */
function unwrap(tokens: string[]): string[] {
	let i = 0;
	while (i < tokens.length) {
		const t = tokens[i] as string;
		if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(t)) {
			i++; // VAR=value assignment
			continue;
		}
		if (WRAPPERS.has(t)) {
			i++;
			continue;
		}
		if (WRAPPERS_WITH_ARG.has(t)) {
			i++;
			if (i < tokens.length && !(tokens[i] as string).startsWith("-")) i++;
			continue;
		}
		break;
	}
	return tokens.slice(i);
}

/** Turn one logical shell line into invocations for allowlisted CLIs. */
export function parseLine(
	raw: string,
	allowlist: Set<string>,
): Array<Pick<Invocation, "command" | "subPath" | "flags" | "raw">> {
	const found: Array<Pick<Invocation, "command" | "subPath" | "flags" | "raw">> = [];
	for (const segment of splitSegments(raw)) {
		const tokens = unwrap(tokenize(segment));
		if (tokens.length === 0) continue;
		const command = tokens[0] as string;
		if (!allowlist.has(command)) continue;
		// `bun run x`, `npm run x`, `bun ./script.ts` execute a user target — any
		// flags after it belong to that script, not the runner, so they aren't
		// auditable against the runner's --help. Skip those invocations.
		const RUNNERS = new Set(["bun", "npm", "pnpm", "yarn"]);
		if (RUNNERS.has(command)) {
			const next = tokens[1] ?? "";
			if (next === "run" || next === "x" || next.includes("/") || /\.(ts|tsx|js|mjs|cjs|sh)$/.test(next)) {
				continue;
			}
		}
		const subPath: string[] = [];
		const flags: string[] = [];
		// Subcommand tokens are the LEADING run of non-flag tokens only — once a
		// flag appears, later bare tokens are positional args, not subcommands.
		let inSubPath = true;
		for (const t of tokens.slice(1)) {
			if (t.startsWith("-")) {
				inSubPath = false;
				const flag = t.split("=")[0] as string;
				// Skip `-` / `--` and numeric shorthands like `-20` (git's `-<n>`),
				// which aren't named flags and would only ever be false positives.
				if (flag !== "-" && flag !== "--" && !/^-\d+$/.test(flag)) flags.push(flag);
			} else if (inSubPath && subPath.length < MAX_SUBPATH && !t.includes("=") && !t.startsWith("$")) {
				subPath.push(t);
			}
		}
		found.push({ command, subPath, flags, raw: segment });
	}
	return found;
}

interface CodeLine {
	line: number;
	text: string;
}

/** Pull shell lines out of a file: bash/sh fences for markdown, all lines for *.sh. */
export function shellLines(path: string, content: string): CodeLine[] {
	const lines = content.split("\n");
	const isScript = /\.(sh|bash|zsh)$/.test(path);
	const out: CodeLine[] = [];
	// `inFence` tracks whether we're physically inside ANY fenced block; only a
	// shell-language fence sets `collecting`. Tracking them separately stops the
	// closing ``` of a python block from being read as an opening shell fence.
	let inFence = false;
	let collecting = false;
	const SHELL = new Set(["", "bash", "sh", "shell", "zsh"]);
	for (let i = 0; i < lines.length; i++) {
		const text = lines[i] as string;
		if (isScript) {
			out.push({ line: i + 1, text });
			continue;
		}
		const fence = text.match(/^\s*```+\s*([A-Za-z0-9_-]*)/);
		if (fence) {
			if (!inFence) {
				inFence = true;
				collecting = SHELL.has((fence[1] || "").toLowerCase());
			} else {
				inFence = false;
				collecting = false;
			}
			continue;
		}
		if (inFence && collecting) out.push({ line: i + 1, text });
	}
	return out;
}

/** Join backslash-continued lines, keeping the first line's number. */
export function joinContinuations(lines: CodeLine[]): CodeLine[] {
	const out: CodeLine[] = [];
	let buf: CodeLine | null = null;
	for (const cl of lines) {
		const trimmed = cl.text.replace(/\s+$/, "");
		const cont = trimmed.endsWith("\\");
		const body = cont ? trimmed.slice(0, -1) : cl.text;
		if (buf) {
			buf.text += ` ${body.trim()}`;
		} else {
			buf = { line: cl.line, text: body };
		}
		if (!cont) {
			out.push(buf);
			buf = null;
		}
	}
	if (buf) out.push(buf);
	return out;
}

/** Extract invocations from a single file's text (used directly in tests). */
export function extractFromText(
	content: string,
	meta: { skill: string; file: string; allowlist?: string[] },
): Invocation[] {
	const allow = new Set(meta.allowlist ?? DEFAULT_ALLOWLIST);
	const out: Invocation[] = [];
	for (const cl of joinContinuations(shellLines(meta.file, content))) {
		if (/^\s*#/.test(cl.text)) continue; // whole-line comment
		for (const inv of parseLine(cl.text, allow)) {
			out.push({ skill: meta.skill, file: meta.file, line: cl.line, ...inv });
		}
	}
	return out;
}

// Shell scripts are scanned wholesale; among markdown we ONLY scan SKILL.md, so
// arbitrary doc examples (README, references/*.md) aren't audited as if real.
function scannable(entry: string): boolean {
	return entry === "SKILL.md" || /\.(sh|bash|zsh)$/.test(entry);
}

function walk(dir: string, acc: string[] = []): string[] {
	for (const entry of readdirSync(dir)) {
		if (entry === "node_modules" || entry.startsWith(".git")) continue;
		const full = join(dir, entry);
		let st: ReturnType<typeof statSync>;
		try {
			st = statSync(full);
		} catch {
			continue; // dangling symlink, etc.
		}
		if (st.isDirectory()) walk(full, acc);
		else if (scannable(entry)) acc.push(full);
	}
	return acc;
}

/**
 * Scan a skills root. Each immediate subdirectory is treated as one skill.
 * A root that is itself a single skill (has SKILL.md) is scanned as one skill.
 */
/** Discover skill directories under a root. A root that itself contains
 *  SKILL.md is one skill; otherwise each immediate subdirectory is a skill. */
export function findSkillDirs(root: string): Array<{ name: string; dir: string }> {
	const entries = readdirSync(root);
	if (entries.includes("SKILL.md")) {
		return [{ name: root.split("/").filter(Boolean).pop() ?? root, dir: root }];
	}
	return entries
		.filter((e) => {
			try {
				return statSync(join(root, e)).isDirectory();
			} catch {
				return false;
			}
		})
		.map((name) => ({ name, dir: join(root, name) }));
}

/** Every SKILL.md path under a root (one per loaded skill/sub-skill). */
export function findSkillMdFiles(root: string): Array<{ name: string; file: string }> {
	const out: Array<{ name: string; file: string }> = [];
	for (const { name, dir } of findSkillDirs(root)) {
		for (const file of walk(dir)) {
			if (file.endsWith("/SKILL.md") || file.endsWith("\\SKILL.md")) out.push({ name, file });
		}
	}
	return out;
}

export function extractFromDir(root: string, allowlist?: string[]): Invocation[] {
	const out: Invocation[] = [];
	const skillDirs = findSkillDirs(root);

	for (const { name, dir } of skillDirs) {
		for (const file of walk(dir)) {
			let content: string;
			try {
				content = readFileSync(file, "utf8");
			} catch {
				continue;
			}
			out.push(...extractFromText(content, { skill: name, file, allowlist }));
		}
	}
	return out;
}
