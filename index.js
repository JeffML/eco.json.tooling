import fs from 'fs';
import { getLatestEcoJson } from './getLatestEcoJson.js';
import { keyLen, prompt } from './utils.js';
import { filterIncoming, getIncomingOpenings } from './incoming.js';
import { updateInterpolated, lineOfDescent } from './interpolations.js';
import { findRoots } from './findRoots.js';
import { findOrphans } from './findOrphans.js';
import { addedContinuations, canonicalFromTos, moreFromTos } from './addedContinuations.js';
import { applyData, writeNew } from './createEcoJsonFiles.js';

const writeln = (str) => process.stdout.write(str + '\n');

// TEMP TEMP!
const alwaysYes = false;

// Helper function to handle prompts and exit if the user declines
const confirmStep = async (message) => {
    let answer;
    do {
        answer = await prompt(`${message} (y/N)? `)
        answer = answer.trim().toLowerCase();
    } while (!['y', 'n', ''].includes(answer));

    if (answer !== 'y' && !alwaysYes) {
        writeln('Operation canceled. Exiting.');
        process.exit(-1);
    } else {
        writeln('\n');
    }
};

// Step 1: Parse and validate the opening data
writeln(
    'Step 1: Parse and validate the opening data provided in the directory ./input/opening.json'
);
await confirmStep('Ready');

const incomingOpenings = getIncomingOpenings(); // performs validation of input
writeln('Validation passed.\n');

// Step 2: Filter out redundant openings
writeln('Step 2: Filter out any redundantant openings.');

await confirmStep('Ready');

const existingOpenings = await getLatestEcoJson(); // requests eco.json data from github
const { added, modified, excluded, toRemove: formerInterpolated } = filterIncoming(
    incomingOpenings,
    existingOpenings
);

writeln(`Of the ${incomingOpenings.length - 1} in opening.json, there were:
    ${keyLen(added)} new openings
    ${excluded} redundant openings
    ${keyLen(modified)} modifications to existing eco.json openings
    ${formerInterpolated.length} formerly interpolated openings\n`);

// Step 3: Create intermediate data files for review
writeln(
    'Step 3: Create intermediate data files for review. These will be put in the ./output folder of the project.'
);
await confirmStep('Ready');

const updated = updateInterpolated(formerInterpolated, added, modified, existingOpenings);

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
const newFromTos = canonicalFromTos(newContinuations)

// Now look for orphan addeds; they may not be true orphans, but merely continuations not attached
// to an existing root variation
const newOrphans = findOrphans(added, [...existingOpenings.FT.json, ...newFromTos]);

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

writeln(`Of the ${newOrphans.length} orphans found, ${unattached.length??0} will be attached to a known root variation,
and ${keyLen(noRoots)} had no known root and will need to be interpolated.\n`);


// Step 6: Determine line of descent for each orphan
writeln('Step 6: Determine line of descent for each orphan.');
await confirmStep('Continue');

// attach new openings to root variations, adding interpolations if necessary
const linesOfDescent = []

for (const orphanFen of noRoots) {
    linesOfDescent.push(lineOfDescent(orphanFen, added))
};

fs.writeFileSync('./output/linesOfDescent.json', JSON.stringify(linesOfDescent, null, 2))

writeln('Orphans have been parented; results can be seen in .output/linesOfDescent.json')

// Step 7: Link lines of descent with fromTo records
writeln('Step 7: link lines of descent with fromTo records.');
await confirmStep('Continue');

const mft = moreFromTos(linesOfDescent)

fs.writeFileSync('./output/moreFromTos.json', JSON.stringify(mft, null, 2))


// Step 8: Write out new JSON files to ./output/toMerge folder
writeln(
    `Final Step: write out new json files to ./output/toMerge folder. The new opening data is contained in these files.`
);
await confirmStep('Ready');

// Concatenate the new data to existing structures and output to eco?.json, eco_interpolated.json and fromTo.json files
const newExisting = applyData(existingOpenings, added, newFromTos, mft, formerInterpolated, modified);
writeNew(newExisting);

writeln(`
Done! The files in the ./output/toMerge folder mirror those in your cloned eco.json project. 
These will be the files that are to be submitted
in your pull request to the original eco.json github repository.`);
