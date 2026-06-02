// Bundle the CLI into a single dependency-free JS file that runs under plain
// Node (no Bun runtime needed). This is what `npm publish` ships and what
// `npx skillrot` executes — skillrot only uses node: builtins, so the bundle
// is portable. `--compile` binaries are built separately in the release CI.
import { chmodSync } from "node:fs";

const OUT = "dist/skillrot.mjs";

const result = await Bun.build({
	entrypoints: ["src/cli.ts"],
	target: "node",
	outdir: "dist",
	naming: "skillrot.mjs",
});

if (!result.success) {
	for (const log of result.logs) console.error(log);
	process.exit(1);
}

// cli.ts carries `#!/usr/bin/env bun`; rewrite it so the published bin runs
// under node. Prepend if the bundler dropped the shebang.
let code = await Bun.file(OUT).text();
code = code.replace(/^#!.*\n/, "");
await Bun.write(OUT, `#!/usr/bin/env node\n${code}`);
chmodSync(OUT, 0o755);

console.log(`built ${OUT} (${(code.length / 1024).toFixed(1)} KB)`);
