import fs from 'fs';
import { getLatestEcoJson, keyLen, prompt } from './utils.js';
import { filterIncoming, getIncomingOpenings } from './steps/incoming.js';
import { updateInterpolated, lineOfDescent } from './steps/interpolations.js';
import { findRoots } from './steps/findRoots.js';
import { findOrphans } from './steps/findOrphans.js';
import {
    addedContinuations,
    canonicalFromTos,
    moreFromTos,
} from './steps/addedContinuations.js';
import { applyData, writeNew } from './steps/createEcoJsonFiles.js';
import { ErrorCollector } from './utils/errors.js';
import { writeDiffReport } from './steps/diffReport.js';

const ERRORS_DIR = './errors';

// ── CLI flags ────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const FLAG_YES = args.includes('--yes');          // skip interactive prompts
const FLAG_LENIENT = args.includes('--lenient');  // continue past validation failures
const FLAG_APPLY = args.includes('--apply');      // write toMerge/ (default: dry-run)
const DRY_RUN = !FLAG_APPLY;

const writeln = (str) => process.stdout.write(str + '\n');

const collector = new ErrorCollector();

// Helper function to handle prompts and exit if the user declines.
// In --yes mode, prints the message and continues without prompting.
// Dry-run never prompts (Phase 3 write is skipped anyway).
const confirmStep = async (message) => {
    if (FLAG_YES || DRY_RUN) {
        return; // no prompt in --yes or dry-run mode
    }
    let answer;
    do {
        answer = await prompt(`${message} (y/N)? `);
        answer = answer.trim().toLowerCase();
    } while (!['y', 'n', ''].includes(answer));

    if (answer !== 'y') {
        writeln('Operation canceled. Exiting.');
        process.exit(-1);
    } else {
        writeln('\n');
    }
};

writeln(DRY_RUN
    ? 'Running in DRY-RUN mode (toMerge/ will NOT be written). Use --apply to write merge files.'
    : 'Running in APPLY mode (will write toMerge/).');

const existingOpenings = await getLatestEcoJson();  // organized by category

// ════════════════════════════════════════════════════════════════════════════
// PHASE 1: Validate + filter + diff
// Combines former steps 1–3. One summary print, no prompts.
// ────────────────────────────────────────────────────────────────────────────
writeln('Phase 1: Validate, classify, and generate diff report.');

const incomingOpenings = getIncomingOpenings({ collector });
const validCount = incomingOpenings.length - 1 - collector.count('validate');
const failedCount = collector.count('validate');
writeln(`Validation: ${validCount} valid, ${failedCount} failed.`);

// Always write + summarize corrections (normalize stage), but only abort
// on actual validate-stage failures (not corrections).
if (collector.total > 0) {
    collector.writeAll(ERRORS_DIR);
    collector.printSummary();
}
if (collector.count('validate') > 0 && !FLAG_LENIENT) {
    writeln('\nValidation failures found (fail-closed). See errors/validate.json.');
    writeln('Use --lenient to continue past validation failures.');
    process.exit(1);
} else if (collector.count('validate') > 0) {
    writeln('(continuing in --lenient mode)');
}

const {
    added,
    modified,
    excluded,
    toRemove: formerInterpolated,
} = filterIncoming(incomingOpenings);

// updateInterpolated mutates `modified` (adds entries for interpolated
// continuations whose root was promoted). Run BEFORE the diff report so
// the report reflects the final classification.
updateInterpolated(formerInterpolated, added, modified, existingOpenings);

// Write intermediate files (debugging artifacts, no longer gated by prompts)
if (!fs.existsSync('./output')) fs.mkdirSync('./output', { recursive: true });
fs.writeFileSync('./output/added.json', JSON.stringify(added, null, 2));
fs.writeFileSync('./output/modified.json', JSON.stringify(modified, null, 2));
fs.writeFileSync('./output/formerlyInterpolated.json', JSON.stringify(formerInterpolated, null, 4));

// Early diff report — now accurate (post-updateInterpolated)
const source = incomingOpenings[0]?.src ?? 'unknown';
const { jsonPath: earlyJson, mdPath: earlyMd } = writeDiffReport({
    added, modified, formerInterpolated, excluded, source,
});

writeln(`
Classification: ${keyLen(added)} added, ${keyLen(modified)} modified, ${excluded} excluded, ${formerInterpolated.length} formerly interpolated.
Diff report: ${earlyMd}
`);

// ════════════════════════════════════════════════════════════════════════════
// PHASE 2: Wire up graph
// Combines former steps 4–7. Sequential computations, no decision points.
// Intermediate files written for debugging. One summary print at the end.
// ────────────────────────────────────────────────────────────────────────────
writeln('Phase 2: Connect new openings to the fromTo graph (interpolations + links).');

const newContinuations = addedContinuations(added);
fs.writeFileSync('./output/continuations.json', JSON.stringify(newContinuations, null, 2));

const newFromTos = canonicalFromTos(newContinuations);

const newOrphans = findOrphans(added, [...existingOpenings.FT.json, ...newFromTos]);
const { unattached, noRoots } = findRoots(newOrphans);
fs.writeFileSync('./output/orphanRoots.json', JSON.stringify({ unattached, noRoots }, null, 2));

const linesOfDescent = noRoots.map((orphanFen) => lineOfDescent(orphanFen, added));
fs.writeFileSync('./output/linesOfDescent.json', JSON.stringify(linesOfDescent, null, 2));

const mft = moreFromTos(linesOfDescent);
fs.writeFileSync('./output/moreFromTos.json', JSON.stringify(mft, null, 2));

writeln(`${newContinuations.length} continuations, ${newOrphans.length} orphans (${unattached.length ?? 0} unattached, ${keyLen(noRoots)} interpolated), ${mft.length} fromTo links.\n`);

// ════════════════════════════════════════════════════════════════════════════
// PHASE 3: Write merge files
// Former step 8. One prompt (unless --yes or --apply or dry-run).
// ────────────────────────────────────────────────────────────────────────────
writeln('Phase 3: Generate merge files.');

if (DRY_RUN) {
    writeln('DRY-RUN: skipping merge file generation (toMerge/ not written).');
    writeln('Re-run with --apply to generate and write merge files.');
} else {
    await confirmStep('Write merge files to ./output/toMerge');

    // Concatenate the new data to existing structures and output to eco?.json,
    // eco_interpolated.json and fromTo.json files
    const newExisting = applyData(
        existingOpenings, added, newFromTos, mft, formerInterpolated, modified,
    );
    writeNew(newExisting);
}

// Final diff report (complete with interpolations + fromTo changes)
writeDiffReport({
    added, modified, formerInterpolated,
    interpolations: linesOfDescent,
    fromToChanges: [...newFromTos, ...mft],
    excluded, source,
});

writeln(`
Done! Diff report in ./diff-report/. Merge files in ./output/toMerge/
(submit these in your pull request to the eco.json repository).`);
