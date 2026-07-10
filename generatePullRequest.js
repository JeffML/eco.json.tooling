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
const confirmStep = async (message) => {
    if (FLAG_YES) {
        writeln(`${message} (--yes, continuing)\n`);
        return;
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

// Step 1: Parse and validate the opening data
writeln(
    'Step 1: Parse and validate the opening data provided in the directory ./input/opening.json'
);
await confirmStep('Ready');

const incomingOpenings = getIncomingOpenings({ collector }); // performs validation of input
const { valid: validCount, failed: failedCount } = (() => {
    // validate already ran inside getIncomingOpenings via the collector
    const v = incomingOpenings.length - 1 - collector.count('validate');
    return { valid: v, failed: collector.count('validate') };
})();
writeln(`Validation complete: ${validCount} valid, ${failedCount} failed.`);

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
} else if (collector.count('normalize') > 0) {
    writeln(`${collector.count('normalize')} auto-correction(s) applied (see errors/normalize.json).`);
}
writeln('');

// Step 2: Filter out redundant openings
writeln('Step 2: Filter out any redundantant openings.');

await confirmStep('Ready');

const {
    added,
    modified,
    excluded,
    toRemove: formerInterpolated,
} = filterIncoming(incomingOpenings);

writeln(`Of the ${incomingOpenings.length - 1} in opening.json, there were:
    ${keyLen(added)} new openings
    ${excluded} redundant openings
    ${keyLen(modified)} modifications to existing eco.json openings
    ${formerInterpolated.length} formerly interpolated openings\n`);

// Emit an early diff report so the diff is available even if the run is
// cancelled at the Step 3 review prompt.
const { jsonPath, mdPath } = writeDiffReport({
    added,
    modified,
    formerInterpolated,
    excluded,
    source: incomingOpenings[0]?.src ?? 'unknown',
});
writeln(`Diff report (early): ${jsonPath} / ${mdPath}\n`);

// Step 3: Create intermediate data files for review
writeln(
    'Step 3: Create intermediate data files for review. These will be put in the ./output folder of the project.'
);
await confirmStep('Ready');

updateInterpolated(
    formerInterpolated,
    added,
    modified,
    existingOpenings
);

// write intermediate data for review
fs.writeFileSync('./output/added.json', JSON.stringify(added, null, 2));
fs.writeFileSync('./output/modified.json', JSON.stringify(modified, null, 2));
fs.writeFileSync(
    './output/formerlyInterpolated.json',
    JSON.stringify(formerInterpolated, null, 4)
);

writeln(`Review #1: Look over the following files in the output folder for obvious errors:
    added.json -- formerly interpolated openings have now been added to this file
    modified.json -- some existing interpolated openings may be modified if they have a new root
    formerlyInterpolated.json -- these will be removed from the interpolated openings
`);

await confirmStep('Have you completed your review');

// Step 4: Look for continuations in added openings
writeln(
    'On to Step 4: For all added openings, look for continuations to existing or newly added openings\n'
);
await confirmStep('Ready');

const newContinuations = addedContinuations(added);
fs.writeFileSync(
    './output/continuations.json',
    JSON.stringify(newContinuations, null, 2)
);
writeln(
    `${newContinuations.length} continuations have been found among the added openings.\n`
);

// Step 5: Find orphan variations
writeln(
    'Step 5: look for orphan variations in the added openings; these will require interpolation or attachment to existing roots.'
);
await confirmStep('Ready');

// canonical format for fromTo recs
const newFromTos = canonicalFromTos(newContinuations);

// Now look for orphan addeds; they may not be true orphans, but merely continuations not attached
// to an existing root variation
const newOrphans = findOrphans(added, [
    ...existingOpenings.FT.json,
    ...newFromTos,
]);

/*
For each orphan, determine:
    if it has any roots in the existing openings (unattached)
    if it is truly an orphan (noRoots)
*/
const { unattached, noRoots } = findRoots(newOrphans);

fs.writeFileSync(
    './output/orphanRoots.json',
    JSON.stringify({ unattached, noRoots }, null, 2)
);

writeln(`Of the ${newOrphans.length} orphans found, ${
    unattached.length ?? 0
} will be attached to a known root variation,
and ${keyLen(noRoots)} had no known root and will need to be interpolated.\n`);

// Step 6: Determine line of descent for each orphan
writeln('Step 6: Determine line of descent for each orphan.');
await confirmStep('Continue');

// attach new openings to root variations, adding interpolations if necessary
const linesOfDescent = [];

for (const orphanFen of noRoots) {
    linesOfDescent.push(lineOfDescent(orphanFen, added));
}

fs.writeFileSync(
    './output/linesOfDescent.json',
    JSON.stringify(linesOfDescent, null, 2)
);

writeln(
    'Orphans have been parented; results can be seen in .output/linesOfDescent.json'
);

// Step 7: Link lines of descent with fromTo records
writeln('Step 7: link lines of descent with fromTo records.');
await confirmStep('Continue');

const mft = moreFromTos(linesOfDescent);

fs.writeFileSync('./output/moreFromTos.json', JSON.stringify(mft, null, 2));

// Step 8: Write out new JSON files to ./output/toMerge folder
writeln(
    `Final Step: write out new json files to ./output/toMerge folder. The new opening data is contained in these files.`
);
await confirmStep('Ready');

// Concatenate the new data to existing structures and output to eco?.json, eco_interpolated.json and fromTo.json files
const newExisting = applyData(
    existingOpenings,
    added,
    newFromTos,
    mft,
    formerInterpolated,
    modified
);

if (DRY_RUN) {
    writeln('\nDRY-RUN: skipping writeNew() (toMerge/ not written).');
    writeln('Re-run with --apply to write the merge files.');
} else {
    writeNew(newExisting);
}

// Final diff report (now complete with interpolations + fromTo changes)
writeDiffReport({
    added,
    modified,
    formerInterpolated,
    interpolations: linesOfDescent,
    fromToChanges: [...newFromTos, ...mft],
    excluded,
    source: incomingOpenings[0]?.src ?? 'unknown',
});

writeln(`
Done! Diff report written to ./diff-report/. The files in the ./output/toMerge folder mirror those in your cloned eco.json project. 
These will be the files that are to be submitted
in your pull request to the original eco.json github repository.`);
