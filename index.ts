// Public API surface (used by tests and as a library).
export * from "./src/types.ts";
export { extractFromDir, extractFromText, parseLine, tokenize, splitSegments } from "./src/extract.ts";
export { introspect, defaultRunner, probeKey } from "./src/introspect.ts";
export { analyze, helpHasFlag, helpFlags, suggestFlag } from "./src/analyze.ts";
export { applyFixes } from "./src/fix.ts";
export { buildReport } from "./src/report.ts";
