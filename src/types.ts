// Core data shapes shared across the pipeline.

/** A single external-CLI invocation found inside a skill's text. */
export interface Invocation {
	/** Skill name (directory name under the scanned root). */
	skill: string;
	/** File the invocation was found in. */
	file: string;
	/** 1-based line number of the invocation's first line. */
	line: number;
	/** The resolved CLI (after unwrapping sudo/env/timeout/bunx/...). */
	command: string;
	/** Leading non-flag tokens after the command (e.g. ["pr","view"]), capped. */
	subPath: string[];
	/** Long and short flags used on this invocation (e.g. "--base", "-c"). */
	flags: string[];
	/** The raw logical line, for the report. */
	raw: string;
}

export type DriftLevel = "error" | "warn" | "ok";

/** One verdict about one invocation. */
export interface Finding {
	invocation: Invocation;
	level: DriftLevel;
	reason: string;
	/** Installed version of the CLI, when known. */
	version?: string;
}

/** Result of running a command (defaultRunner or an injected fake). */
export interface RunResult {
	stdout: string;
	stderr: string;
	/** Exit code, or null when the binary was not found / could not spawn. */
	code: number | null;
}

/** Pluggable command runner — injected in tests so they never touch a real CLI. */
export type Runner = (command: string, args: string[]) => RunResult;

/** What introspection learned about one (command + subPath) pair. */
export interface ToolProbe {
	command: string;
	subPath: string[];
	installed: boolean;
	/** Help text of the DEEPEST subcommand path that resolved successfully. */
	helpText: string;
	/** True when a --help call returned successfully. */
	helpOk: boolean;
	/** True when even the first subcommand looks unknown to the CLI. */
	subcommandUnknown: boolean;
	/** The subcommand token reported unknown, when subcommandUnknown is true. */
	unknownToken?: string;
	version?: string;
}
