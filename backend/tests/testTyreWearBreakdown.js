const { WEAR_PARAMS, tyreWearPenalty, getTrackDegFactor } = require('../models/tyreModel');

const TEST_CONFIG = {
    degradation: 'Low',
    temperature: 20
};

const COMPOUND = 'Soft';
const MAX_LAPS = 57;
const MAX_STINT_LAP = 35;

// Calculate deg factor once
const degFactor = getTrackDegFactor(TEST_CONFIG);
console.log(`\n--- Tyre Model Breakdown Test ---`);
console.log(`Compound: ${COMPOUND}`);
console.log(`Configuration: Degradation='${TEST_CONFIG.degradation}', Temp=${TEST_CONFIG.temperature}`);
console.log(`Calculated Track Deg Factor: ${degFactor}`);
console.log(`Params for ${COMPOUND}:`, WEAR_PARAMS[COMPOUND]);
console.log(`Note: wearStart=${WEAR_PARAMS[COMPOUND].wearStart}, cliffStart=${WEAR_PARAMS[COMPOUND].cliffStart}`);
console.log('---------------------------------------------------\n');

function getWearComponents(compound, lapAge, factor) {
    const p = WEAR_PARAMS[compound];
    const age = Math.max(1, lapAge);

    // term 1: linear base (contributes from lap 1)
    // "baseOrPreWearTerm" per user request
    const linearBase = p.linear * age;

    // term 2: curve / exponential (contributes after wearStart)
    let curveTerm = 0;
    if (age > p.wearStart) {
        curveTerm = p.beta * (Math.exp(p.gamma * (age - p.wearStart)) - 1);
    }

    // term 3: cliff (contributes after cliffStart)
    let cliffTerm = 0;
    if (age > p.cliffStart) {
        cliffTerm = p.cliffBeta * (Math.exp(p.cliffGamma * (age - p.cliffStart)) - 1);
    }
    
    // term 4: max stint
    let maxStintTerm = 0;
    if (age > MAX_STINT_LAP) {
        maxStintTerm = Math.pow(1.25, age - MAX_STINT_LAP) * 5;
    }

    const rawSum = linearBase + curveTerm + cliffTerm + maxStintTerm;
    const totalWear = rawSum * factor;

    return {
        lap: lapAge,
        totalWear,
        baseOrPreWearTerm: linearBase,
        curveTerm,
        cliffTerm,
        degFactorUsed: factor
    };
}

const tableData = [];
const p = WEAR_PARAMS[COMPOUND];
const keyLaps = [1, 5, p.wearStart, p.wearStart + 1, 10, p.cliffStart, p.cliffStart + 1];

for (let lap = 1; lap <= MAX_LAPS; lap++) {
    // get components
    const components = getWearComponents(COMPOUND, lap, degFactor);

    // get production value
    const productionVal = tyreWearPenalty(COMPOUND, lap, degFactor, MAX_STINT_LAP);

    // assert equality
    const diff = Math.abs(components.totalWear - productionVal);
    if (diff > 1e-6) {
        console.warn(`WARNING: Mismatch at lap ${lap}. Test=${components.totalWear}, Prod=${productionVal}, Diff=${diff}`);
    }

    // store for table
    tableData.push({
        lap: components.lap,
        totalWear: components.totalWear.toFixed(6),
        'Linear(Base)': components.baseOrPreWearTerm.toFixed(6),
        'Curve(Exp)': components.curveTerm.toFixed(6),
        'Cliff': components.cliffTerm.toFixed(6),
        'DegFactor': components.degFactorUsed
    });

    // detailed breakdown for key laps
    if (keyLaps.includes(lap)) {
        console.log(`\n[Lap ${lap} Analysis]`);
        console.log(`Total Wear: ${components.totalWear.toFixed(6)}s`);
        
        console.log(` - Linear Base: ${components.baseOrPreWearTerm.toFixed(6)} (param linear=${p.linear} * age ${lap})`);
        
        if (lap > p.wearStart) {
            console.log(` - Curve Part:  ${components.curveTerm.toFixed(6)} (ACTIVE: Age ${lap} > wearStart ${p.wearStart})`);
        } else {
            console.log(` - Curve Part:  0.000000 (INACTIVE: Age ${lap} <= wearStart ${p.wearStart})`);
        }

        if (lap > p.cliffStart) {
            console.log(` - Cliff Part:  ${components.cliffTerm.toFixed(6)} (ACTIVE: Age ${lap} > cliffStart ${p.cliffStart})`);
        } else {
            console.log(` - Cliff Part:  0.000000 (INACTIVE: Age ${lap} <= cliffStart ${p.cliffStart})`);
        }
    }
}

console.log(`\n\n=== LAP-BY-LAP BREAKDOWN (${COMPOUND}) ===`);
console.table(tableData);
