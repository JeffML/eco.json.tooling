import fs from "fs";
import path from "path";

/**
 * Consolidate pipeline intermediates into a single diff report.
 *
 * Inputs are the in-memory structures produced by steps/incoming.js and
 * later steps (added, modified, formerInterpolated, interpolations,
 * fromToChanges). Reads whatever is provided; missing inputs are treated as
 * empty so the report can be generated early (right after filterIncoming).
 *
 * Per Open Question 3 (PLAN-1.md): the report itself is written to a tracked
 * `diff-report/` directory so it survives across runs and can be referenced in
 * PRs. Intermediate files in output/ remain gitignored.
 */

/**
 * @typedef {Object} DiffInput
 * @property {Record<string, object>} [added] - FEN → new opening
 * @property {Record<string, object>} [modified] - FEN → modified opening (existing, with changes)
 * @property {string[]} [formerInterpolated] - FENs removed from eco_interpolated.json
 * @property {Array} [interpolations] - newly generated interpolations
 * @property {Array} [fromToChanges] - new from/to transition records
 * @property {number} [excluded] - count of redundant openings dropped
 * @property {string} [source] - source tag from incoming[0].src
 */

/**
 * Build a structured diff report object.
 * @param {DiffInput} input
 * @returns {object} report
 */
export function buildDiffReport(input = {}) {
  const {
    added = {},
    modified = {},
    formerInterpolated = [],
    interpolations = [],
    fromToChanges = [],
    excluded = 0,
    source = "unknown",
  } = input;

  const additions = Object.entries(added).map(([fen, o]) => ({
    fen,
    name: o.name,
    eco: o.eco,
    src: o.src,
    moves: o.moves,
  }));

  const modifications = Object.entries(modified).map(([fen, o]) => {
    const fieldsChanged = [];
    if (o.name !== undefined) fieldsChanged.push("name");
    if (o.moves !== undefined) fieldsChanged.push("moves");
    if (o.eco !== undefined) fieldsChanged.push("eco");
    if (o.aliases !== undefined) fieldsChanged.push("aliases");
    return {
      fen,
      after: { name: o.name, eco: o.eco, src: o.src, aliases: o.aliases },
      fieldsChanged,
    };
  });

  const deletions = formerInterpolated.map((fen) => ({
    fen,
    wasInterpolated: true,
    // If the FEN also appears in `added`, it was promoted to a named opening
    replacedBy: added[fen] ? added[fen].src : null,
  }));

  return {
    source,
    generatedAt: new Date().toISOString(),
    summary: {
      additions: additions.length,
      modifications: modifications.length,
      deletions: deletions.length,
      interpolations: interpolations.length,
      fromToChanges: fromToChanges.length,
      excluded,
    },
    additions,
    modifications,
    deletions,
    interpolations,
    fromToChanges,
  };
}

/**
 * Render a diff report as PR-ready markdown, grouped by ECO category.
 * @param {object} report - output of buildDiffReport
 * @returns {string} markdown
 */
export function renderMarkdown(report) {
  const lines = [];
  const s = report.summary;
  lines.push(`# Diff report — \`${report.source}\``);
  lines.push("");
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push(`| Category | Count |`);
  lines.push(`|---|---|`);
  lines.push(`| Additions | ${s.additions} |`);
  lines.push(`| Modifications | ${s.modifications} |`);
  lines.push(`| Deletions (formerly interpolated) | ${s.deletions} |`);
  lines.push(`| Interpolations added | ${s.interpolations} |`);
  lines.push(`| From/To changes | ${s.fromToChanges} |`);
  lines.push(`| Excluded (redundant) | ${s.excluded} |`);
  lines.push("");

  const byEco = (arr) => {
    const groups = {};
    for (const item of arr) {
      const eco = item.eco || (item.after && item.after.eco) || "?";
      const cat = eco[0] || "?";
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(item);
    }
    return groups;
  };

  if (report.additions.length) {
    lines.push("## Additions");
    lines.push("");
    const groups = byEco(report.additions);
    for (const cat of Object.keys(groups).sort()) {
      lines.push(`### ECO ${cat}`);
      lines.push("");
      lines.push(`| ECO | Name | FEN | Moves |`);
      lines.push(`|---|---|---|---|`);
      for (const a of groups[cat]) {
        lines.push(`| ${a.eco} | ${a.name} | \`${a.fen}\` | ${a.moves} |`);
      }
      lines.push("");
    }
  }

  if (report.modifications.length) {
    lines.push("## Modifications");
    lines.push("");
    lines.push(`| FEN | Fields changed | New name |`);
    lines.push(`|---|---|---|`);
    for (const m of report.modifications) {
      lines.push(`| \`${m.fen}\` | ${m.fieldsChanged.join(", ")} | ${m.after.name ?? ""} |`);
    }
    lines.push("");
  }

  if (report.deletions.length) {
    lines.push("## Deletions (removed from eco_interpolated.json)");
    lines.push("");
    for (const d of report.deletions) {
      lines.push(`- \`${d.fen}\`${d.replacedBy ? ` (→ ${d.replacedBy})` : ""}`);
    }
    lines.push("");
  }

  if (report.interpolations.length) {
    lines.push(`## Interpolations added (${report.interpolations.length})`);
    lines.push("");
    lines.push("_See output/linesOfDescent.json for full detail._");
    lines.push("");
  }

  if (report.fromToChanges.length) {
    lines.push(`## From/To changes (${report.fromToChanges.length})`);
    lines.push("");
    lines.push("_See output/moreFromTos.json for full detail._");
    lines.push("");
  }

  if (!report.additions.length && !report.modifications.length && !report.deletions.length) {
    lines.push("_No additions, modifications, or deletions. Source is in sync with eco.json._");
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * Build and write both JSON + markdown reports.
 * @param {DiffInput} input
 * @param {string} [dir] - output directory (default: <cwd>/diff-report)
 * @returns {{jsonPath: string, mdPath: string, report: object}}
 */
export function writeDiffReport(input, dir) {
  const outDir = dir || path.resolve(process.cwd(), "diff-report");
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }
  const report = buildDiffReport(input);
  const jsonPath = path.join(outDir, "diff-report.json");
  const mdPath = path.join(outDir, "diff-report.md");
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));
  fs.writeFileSync(mdPath, renderMarkdown(report));
  return { jsonPath, mdPath, report };
}
