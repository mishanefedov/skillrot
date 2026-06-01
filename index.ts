// Public API surface (used by tests and as a library).
export * from "./src/types.ts";
export { extractFromDir, extractFromText, parseLine, tokenize, splitSegments } from "./src/extract.ts";
export { introspect, defaultRunner, probeKey } from "./src/introspect.ts";
export { analyze, helpHasFlag, helpFlags, suggestFlag } from "./src/analyze.ts";
export { applyFixes } from "./src/fix.ts";
export { auditCost, parseFrontmatter, estTokens } from "./src/cost.ts";
export { findSkillDirs, findSkillMdFiles } from "./src/extract.ts";
export { buildReport, buildCostReport } from "./src/report.ts";
