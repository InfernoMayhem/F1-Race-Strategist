const { WEAR_PARAMS, tyreWearPenalty, getTrackDegFactor } = require('../models/tyreModel');

// Configuration as requested
const TEST_CONFIG = {
    degradation: 'Low',
    temperature: 20
};

const COMPOUND = 'Soft';
const MAX_LAPS = 57;
const MAX_STINT_LAP = 35; // default

// Calculate deg factor once
const degFactor = getTrackDegFactor(TEST_CONFIG);
console.log(`\n--- Tyre Model Breakdown Test ---`);
console.log(`Compound: ${COMPOUND}`);
console.log(`Configuration: Degradation='${TEST_CONFIG.degradation}', Temp=${TEST_CONFIG.temperature}`);
console.log(`Calculated Track Deg Factor: ${degFactor}`);
console.log(`Params for ${COMPOUND}:`, WEAR_PARAMS[COMPOUND]);
console.log(`Note: wearStart=${WEAR_PARAMS[COMPOUND].wearStart}, cliffStart=${WEAR_PARAMS[COMPOUND].cliffStart}`);
console.log('---------------------------------------------------\n');

// ---------------------------------------------------------
// Re-implementation for breakdown (must match tyreModel.js)
// ---------------------------------------------------------
function getWearComponents(compound, lapAge, factor) {
    const p = WEAR_PARAMS[compound];
    const age = Math.max(1, lapAge);

    // Term 1: Linear Base (Contributes from Lap 1)
    // "baseOrPreWearTerm" per user request
    const linearBase = p.linear * age;

    // Term 2: Curve / Exponential (Contributes after wearStart)
    let curveTerm = 0;
    if (age > p.wearStart) {
        curveTerm = p.beta * (Math.exp(p.gamma * (age - p.wearStart)) - 1);
    }

    // Term 3: Cliff (Contributes after cliffStart)
    let cliffTerm = 0;
    if (age > p.cliffStart) {
        cliffTerm = p.cliffBeta * (Math.exp(p.cliffGamma * (age - p.cliffStart)) - 1);
    }
    
    // Term 4: Max Stint (Unlikely in this test range but part of model)
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

// ---------------------------------------------------------
// Execution Loop
// ---------------------------------------------------------
const tableData = [];
const p = WEAR_PARAMS[COMPOUND];
const keyLaps = [1, 5, p.wearStart, p.wearStart + 1, 10, p.cliffStart, p.cliffStart + 1];

for (let lap = 1; lap <= MAX_LAPS; lap++) {
    // 1. Get components
    const components = getWearComponents(COMPOUND, lap, degFactor);

    // 2. Get production value
    const productionVal = tyreWearPenalty(COMPOUND, lap, degFactor, MAX_STINT_LAP);

    // 3. Assert equality
    const diff = Math.abs(components.totalWear - productionVal);
    if (diff > 1e-6) {
        console.warn(`WARNING: Mismatch at lap ${lap}. Test=${components.totalWear}, Prod=${productionVal}, Diff=${diff}`);
    }

    // 4. Store for table
    tableData.push({
        lap: components.lap,
        totalWear: components.totalWear.toFixed(6),
        'Linear(Base)': components.baseOrPreWearTerm.toFixed(6),
        'Curve(Exp)': components.curveTerm.toFixed(6),
        'Cliff': components.cliffTerm.toFixed(6),
        'DegFactor': components.degFactorUsed
    });

    // 5. Detailed Breakdown for Key Laps
    if (keyLaps.includes(lap)) {
        console.log(`\n[Lap ${lap} Analysis]`);
        console.log(`Total Wear: ${components.totalWear.toFixed(6)}s`);
        
        // Explain Linear
        console.log(` - Linear Base: ${components.baseOrPreWearTerm.toFixed(6)} (param linear=${p.linear} * age ${lap})`);
        
        // Explain Curve
        if (lap > p.wearStart) {
            console.log(` - Curve Part:  ${components.curveTerm.toFixed(6)} (ACTIVE: Age ${lap} > wearStart ${p.wearStart})`);
        } else {
            console.log(` - Curve Part:  0.000000 (INACTIVE: Age ${lap} <= wearStart ${p.wearStart})`);
        }

        // Explain Cliff
        if (lap > p.cliffStart) {
            console.log(` - Cliff Part:  ${components.cliffTerm.toFixed(6)} (ACTIVE: Age ${lap} > cliffStart ${p.cliffStart})`);
        } else {
            console.log(` - Cliff Part:  0.000000 (INACTIVE: Age ${lap} <= cliffStart ${p.cliffStart})`);
        }
    }
}

console.log(`\n\n=== LAP-BY-LAP BREAKDOWN (${COMPOUND}) ===`);
console.table(tableData);
