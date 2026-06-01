import { describe, expect, test } from "bun:test";
import { analyze, helpHasFlag } from "../src/analyze.ts";
import { introspect } from "../src/introspect.ts";
import type { Invocation, Runner } from "../src/types.ts";

// Fake CLI `fake` with subcommand `do` (flags --keep, -n). No --gone, no `ghost`.
// Injecting the runner means this test never depends on a real installed tool,
// so the test itself can't rot. Handles the progressive --help probing.
const fakeRunner: Runner = (command, args) => {
	if (command !== "fake") return { stdout: "", stderr: "", code: null }; // not installed
	if (args[0] === "--version") return { stdout: "fake 2.0.0", stderr: "", code: 0 };
	if (args[args.length - 1] === "--help") {
		const path = args.slice(0, -1);
		if (path.length === 0) return { stdout: "Usage: fake <command>\n  do   run it", stderr: "", code: 0 };
		if (path.length === 1 && path[0] === "do") {
			return { stdout: "Usage: fake do [options]\n  --keep    keep\n  -n, --number <n>", stderr: "", code: 0 };
		}
		return { stdout: "", stderr: `error: unknown command '${path[0]}'`, code: 1 };
	}
	return { stdout: "", stderr: "", code: 0 };
};

function inv(partial: Partial<Invocation>): Invocation {
	return {
		skill: "demo",
		file: "SKILL.md",
		line: 1,
		command: "fake",
		subPath: ["do"],
		flags: [],
		raw: "fake do ...",
		...partial,
	};
}

describe("helpHasFlag", () => {
	const help = "Usage: fake do [options]\n  --keep    keep\n  -n, --number <n>  count";
	test("finds a present long flag", () => expect(helpHasFlag(help, "--keep")).toBe(true));
	test("finds a present short flag", () => expect(helpHasFlag(help, "-n")).toBe(true));
	test("does not match a substring of another flag", () => {
		expect(helpHasFlag(help, "-k")).toBe(false); // -k is inside --keep but not a real token
	});
	test("reports an absent flag", () => expect(helpHasFlag(help, "--gone")).toBe(false));
});

describe("analyze", () => {
	test("flags a removed long flag as error", () => {
		const invs = [inv({ subPath: ["do"], flags: ["--keep", "--gone"], raw: "fake do --keep --gone" })];
		const findings = analyze(invs, introspect(invs, fakeRunner));
		expect(findings).toHaveLength(1);
		expect(findings[0]?.level).toBe("error");
		expect(findings[0]?.reason).toContain("--gone");
	});

	test("passes a fully valid invocation", () => {
		const invs = [inv({ subPath: ["do"], flags: ["--keep", "-n"], raw: "fake do --keep -n 3" })];
		expect(analyze(invs, introspect(invs, fakeRunner))).toHaveLength(0);
	});

	test("flags an unknown subcommand", () => {
		const invs = [inv({ subPath: ["ghost"], flags: [], raw: "fake ghost" })];
		const findings = analyze(invs, introspect(invs, fakeRunner));
		expect(findings[0]?.level).toBe("error");
		expect(findings[0]?.reason).toContain("ghost");
	});

	test("warns (not errors) when the tool isn't installed", () => {
		const invs = [inv({ command: "missingcli", subPath: ["x"], flags: ["--foo"], raw: "missingcli x --foo" })];
		const findings = analyze(invs, introspect(invs, fakeRunner));
		expect(findings[0]?.level).toBe("warn");
	});

	test("warns (not errors) for an absent SHORT flag", () => {
		const invs = [inv({ subPath: ["do"], flags: ["-z"], raw: "fake do -z" })];
		const findings = analyze(invs, introspect(invs, fakeRunner));
		expect(findings[0]?.level).toBe("warn");
	});
});
