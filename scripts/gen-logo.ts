// Pixel-art logo generator. Same approach as a hand-built pixel SVG: a grid of
// crisp <rect>s. Edit ART below; run `bun scripts/gen-logo.ts` to regenerate
// assets/skillrot.svg. Run with `--print` to eyeball the grid as text first.
//
// Motif: a toxic-green skull — "rot" — with one cracked tooth. Reads at avatar
// size; the terminal-green palette ties it to the CLI domain.

import { writeFileSync } from "node:fs";
import { join } from "node:path";

const CELL = 22;

// . transparent · O outline · B bone · v void (eyes/nose) · S shadow · H highlight
const ART = [
	"........................",
	"........................",
	".......OOOOOOOOOO.......",
	".....OOBBBBBBBBBBBBOO...",
	"....OBBBBBBBBBBBBBBBBO..",
	"...OBBBBBBBBBBBBBBBBBBO.",
	"..OBBBBBBBBBBBBBBBBBBBBO",
	"..OBBBBBBBBBBBBBBBBBBBBO",
	"..OBBvvvvBBBBBBBBvvvvBBO",
	"..OBBvvvvvvBBBBvvvvvvBBO",
	"..OBBvvvvvvBBBBvvvvvvBBO",
	"..OBBvvvvBBBBBBBBvvvvBBO",
	"..OBBBBBBBBBBBBBBBBBBBBO",
	"..OBBBBBBBBBvvBBBBBBBBBO",
	"..OBBBBBBBBvvvvBBBBBBBBO",
	"..OBBBBBBBBBBBBBBBBBBBBO",
	"...OBBBBBBBBBBBBBBBBBBO.",
	"...OBBBBBBBBBBBBBBBBBBO.",
	"...OBvBvBvBvBvBvBvBvBBO.",
	"...OBBvBvBvBBBvBvBvBBBO.",
	"...OBBBBBBBBBBBBBBBBBBO.",
	"....OOOOOOOOOOOOOOOOOO..",
	"........................",
	"........................",
];

const PALETTE: Record<string, string> = {
	O: "#0a2a1e", // outline
	B: "#4ade80", // bone (toxic green)
	v: "#0a2a1e", // void — eyes / nose
	S: "#166534", // shadow
	H: "#bbf7d0", // highlight
};

function build(): { svg: string; cols: number; rows: number } {
	const rows = ART.length;
	const cols = Math.max(...ART.map((r) => r.length));
	for (const [i, r] of ART.entries()) {
		if (r.length !== cols) throw new Error(`row ${i} has length ${r.length}, expected ${cols}`);
	}
	const rects: string[] = [];
	for (let y = 0; y < rows; y++) {
		const row = ART[y] as string;
		let x = 0;
		while (x < cols) {
			const ch = row[x] as string;
			const color = PALETTE[ch];
			if (!color) {
				x++;
				continue;
			}
			let run = 1;
			while (x + run < cols && row[x + run] === ch) run++; // merge horizontal run
			rects.push(
				`<rect x="${x * CELL}" y="${y * CELL}" width="${run * CELL}" height="${CELL}" fill="${color}"/>`,
			);
			x += run;
		}
	}
	const w = cols * CELL;
	const h = rows * CELL;
	const svg = `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges">${rects.join("")}</svg>\n`;
	return { svg, cols, rows };
}

if (process.argv.includes("--print")) {
	for (const r of ART) console.log(r.replace(/\./g, " "));
} else {
	const { svg } = build();
	const out = join(import.meta.dir, "..", "assets", "skillrot.svg");
	writeFileSync(out, svg);
	console.log(`wrote ${out} (${svg.length} bytes)`);
}
