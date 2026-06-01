import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import { analyze } from "../src/analyze.ts";
import { extractFromDir } from "../src/extract.ts";
import { introspect } from "../src/introspect.ts";
import type { Runner } from "../src/types.ts";

// End-to-end through real spawnSync, against an on-PATH fake CLI so the result
// is deterministic and version-independent. We inject PATH via the spawn env
// (rather than mutating process.env) so resolution is explicit and portable.
const FIX = join(import.meta.dir, "fixtures");
const PATH = `${join(FIX, "bin")}:${process.env.PATH ?? ""}`;

const runner: Runner = (command, args) => {
	const r = spawnSync(command, args, {
		encoding: "utf8",
		input: "",
		timeout: 8000,
		env: { ...process.env, PATH },
	});
	if (r.error && (r.error as NodeJS.ErrnoException).code === "ENOENT") {
		return { stdout: "", stderr: "", code: null };
	}
	return { stdout: r.stdout ?? "", stderr: r.stderr ?? "", code: r.status };
};

describe("e2e against an on-PATH fake CLI (real spawnSync)", () => {
	const invs = extractFromDir(join(FIX, "skills"), ["fakecli"]);
	const findings = analyze(invs, introspect(invs, runner));

	test("scans both fixture skills", () => {
		expect(invs.map((i) => i.skill).sort()).toEqual(["bad", "good"]);
	});

	test("flags the removed --gone flag in the bad skill", () => {
		const errs = findings.filter((f) => f.level === "error");
		expect(errs).toHaveLength(1);
		expect(errs[0]?.invocation.skill).toBe("bad");
		expect(errs[0]?.reason).toContain("--gone");
	});

	test("does not flag the good skill", () => {
		expect(findings.some((f) => f.invocation.skill === "good")).toBe(false);
	});
});
