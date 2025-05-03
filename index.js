import fs from 'fs';
import { getLatestEcoJson } from './getLatestEcoJson.js';
import { keyLen, prompt } from './utils.js';
import { filterIncoming, getIncomingOpenings } from './incoming.js';
import { updateInterpolated } from './updateInterpolated.js';
import { findRoots, newFromTos } from './findRoots.js';
import { findOrphans } from './findOrphans.js';
import { addedContinuations } from './addedContinuations.js';
import { concatData, writeNew } from './createEcoJsonFiles.js';

const writeln = (str) => process.stdout.write(str + '\n');

// Helper function to handle prompts and exit if the user declines
const confirmStep = async (message) => {
    const answer = await prompt(`${message} (y/N)? `);
    if (!/[Yy]/.test(answer)) {
        writeln('Operation canceled. Exiting.');
        process.exit(-1);
    } else {
        writeln('\n')
    }
};

/***********/
/*  STEP 1 */
/********* */
writeln(
    'Step 1: Parse and validate the opening data provided in the directory ./input/openings.json'
);
await confirmStep('Ready');

const incomingOpenings = getIncomingOpenings(); // performs validation of input
writeln('Validation passed.\n');

/******** */
/* STEP 2 */
/******** */
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

/******** */
/* STEP 3 */
/******** */
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

/******** */
/* STEP 4 */
/******** */
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
    `${newContinuations.length} continuations have been recorded among the added openings.\n`
);

/******** */
/* STEP 5 */
/******** */
writeln(
    'Step 5: look for orphan variations in the added openings; these will require interpolations.'
);
await confirmStep('Ready');

// Now look for orphan addeds; they may not be true orphans, but merely unconnected in fromTo.json
const newOrphans = findOrphans(added, existingOpenings.FT.json);

/*
For each orphan, determine:
    if it has any roots in the existing openings (allRoots)
    if it is truly an orphan (noRoots)
*/
const { allRoots, noRoots } = findRoots(newOrphans);
fs.writeFileSync(
    './output/orphanRoots.json',
    JSON.stringify({ allRoots, noRoots }, null, 2)
);

writeln(`There were ${newOrphans.length} orphans found. 
Some of these are true orphans (no parent could be found),
and some were merely lost children (unattached continuations of existing parents).
True orphans will need to have interpolations generated.`);


/******** */
/* STEP 6 */
/******** */
writeln('Step 6: A new fromTo.json file + new interpolated openings are ready to be generated.');
await confirmStep('Continue');

// For orphans that are merely missng connections to their parent, add a fromTo from parent -> orphan
const newFromTos = newFromTos(allRoots, added);

// for true orphans, need to create new interpolated openings, and connect them in newFromTo
const interpolations = noRoots.map((orphan) =>
    addInterpolations(orphan, newFromTos, added)
);

fs.writeFileSync(
    './output/newlyRooted.json',
    JSON.stringify({ interpolations, newFromTos }, null, 2)
);

writeln(`${
    newFromTos.length
} parents have been found for lost children; ${keyLen(
    interpolations
)} interpolations have been 
created for the true orphans.`);


/******** */
/* STEP 7 */
/******** */
writeln(
    `Final Step: write out new json files to ./output/toMerge folder. The new opening data is contained in these files.`
);
await confirmStep('Ready');

// Concatenate the new data to existing structures and output to eco?.json, eco_interpolated.json and fromTo.json files
const newExisting = concatData(existingOpenings, added, newFromTos);
writeNew(newExisting);

writeln(`
Done! The files in the ./output/toMerge folder mirror those in your cloned eco.json project. 
These will be the files that are to be submitted
in your pull request to the original eco.json github repository.`);
