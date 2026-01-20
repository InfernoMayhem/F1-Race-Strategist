const {
  generatePitCombos,
  generateTyreAssignments,
  evaluateStrictStrategy,
  tyreData
} = require('./models/strategyGenerator');

const { getTrackDegFactor } = require('./models/tyreModel');

//
const CONFIG = {
  totalLaps: 57,
  baseLapTime: 90,
  pitStopLoss: 20,
  fuelLoad: 110,
  degradation: 'Medium',
  temperature: 25
};

console.log(`\n=== STRATEGY GENERATOR TEST REPORT ===`);
console.log(`Config: ${CONFIG.totalLaps} Laps, Deg=${CONFIG.degradation}, Temp=${CONFIG.temperature}C\n`);

const strategies = [];
let strategyId = 0;

// generate all strategies
[1, 2, 3].forEach(stops => {
  const pitCombos = generatePitCombos(CONFIG.totalLaps, stops);
  const tyreCombos = generateTyreAssignments(stops + 1);

  
  pitCombos.forEach(pits => {
    tyreCombos.forEach(compounds => {
      
      // prepare parameters for evaluation
      const params = {
        totalLaps: CONFIG.totalLaps,
        baseLapTime: CONFIG.baseLapTime,
        pitStopLoss: CONFIG.pitStopLoss,
        initialFuel: CONFIG.fuelLoad,
        fuelPerKgBenefit: 0.005,
        trackDegFactor: getTrackDegFactor(CONFIG)
      };

      // evaluate
      const result = evaluateStrictStrategy(params, pits, compounds);
      
      const stints = [];
      let start = 1;
      for (let i = 0; i < pits.length; i++) {
        stints.push({ from: start, to: pits[i], compound: compounds[i] });
        start = pits[i] + 1;
      }
      stints.push({ from: start, to: CONFIG.totalLaps, compound: compounds[compounds.length - 1] });

      // validation checks
      const distinctCompounds = new Set(compounds).size;
      const compoundsOk = distinctCompounds >= 2;

      let stintOk = true;
      let lapsOk = true;
      let totalLapsCovered = 0;

      stints.forEach(s => {
        const len = s.to - s.from + 1;
        totalLapsCovered += len;
        const compData = tyreData[s.compound.toLowerCase()];
        if (compData && len > compData.maxUsefulLaps) stintOk = false;
        if (len < 8) stintOk = false;
      });

      if (totalLapsCovered !== CONFIG.totalLaps) lapsOk = false;

      strategies.push({
        id: strategyId++,
        stops,
        stints,
        compounds,
        lapsOk,
        stintOk,
        compoundsOk,
        valid: result !== null && compoundsOk
      });
    });
  });
});

console.log(`Total strategies generated: ${strategies.length}\n`);

// table
const headers = ['ID', 'Stops', 'Stints', 'Compounds', 'Laps OK', 'Stint OK', 'Comp OK'];
const colWidths = [4, 6, 40, 20, 8, 9, 8];

function pad(str, width) {
  return String(str).padEnd(width).slice(0, width);
}

console.log(headers.map((h, i) => pad(h, colWidths[i])).join(' '));
console.log(colWidths.map(w => '-'.repeat(w)).join(' '));

// show first 20 and last 5 to avoid overloading console
const toShow = [...strategies.slice(0, 20), ...strategies.slice(-5)];
if (strategies.length > 25) {
}

strategies.slice(0, 50).forEach(s => {
  const stintStr = s.stints.map(st => `${st.from}-${st.to} ${st.compound[0]}`).join(', ');
  const compStr = s.compounds.join(', ');
  
  console.log(
    pad(s.id, colWidths[0]) + ' ' +
    pad(s.stops, colWidths[1]) + ' ' +
    pad(stintStr, colWidths[2]) + ' ' +
    pad(compStr, colWidths[3]) + ' ' +
    pad(s.lapsOk, colWidths[4]) + ' ' +
    pad(s.stintOk, colWidths[5]) + ' ' +
    pad(s.compoundsOk, colWidths[6])
  );
});

if (strategies.length > 50) {
    console.log('... (more strategies hidden) ...');
}

// summary stats
const invalidSingle = strategies.filter(s => !s.compoundsOk).length;
const invalidStint = strategies.filter(s => !s.stintOk).length;
const invalidLaps = strategies.filter(s => !s.lapsOk).length;
const validCount = strategies.filter(s => s.valid).length;

console.log('\nSummary:');
console.log(`Valid Strategies:          ${validCount}`);
console.log(`Invalid (Single Compound): ${invalidSingle}`);
console.log(`Invalid (Stint Length):    ${invalidStint}`);
console.log(`Invalid (Lap Coverage):    ${invalidLaps}`);
console.log('------------------------------------------------');
