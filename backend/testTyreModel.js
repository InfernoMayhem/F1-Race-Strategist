const { calcLapTimeWithWear, getTrackDegFactor, BASE_COMPOUNDS } = require('./models/tyreModel');

const TEST_CONFIG = {
  degradation: 'High',
  temperature: 25,
  baseLapTime: 90.0,
  fuelLoad: 0,
  totalLaps: 40
};

console.log(`\n=== TYRE MODEL TEST REPORT ===`);
console.log(`Config: Deg=${TEST_CONFIG.degradation}, Temp=${TEST_CONFIG.temperature}C`);

const degFactor = getTrackDegFactor(TEST_CONFIG);
console.log(`Calculated Deg Factor: ${degFactor.toFixed(3)}x`);
console.log(`(This multiplier is applied to the base wear curve)\n`);

const compounds = ['Soft', 'Medium', 'Hard'];


console.log('Lap | ' + compounds.map(c => `${c.padEnd(18)}`).join(' | '));
console.log('-'.repeat(70));

for (let lap = 1; lap <= TEST_CONFIG.totalLaps; lap++) {
  const row = [String(lap).padStart(3)];

  compounds.forEach(comp => {
    const result = calcLapTimeWithWear({
      compound: comp,
      age: lap,
      baseLapTime: TEST_CONFIG.baseLapTime,
      baseOffset: BASE_COMPOUNDS[comp].baseOffset,
      totalLaps: 100,
      lapGlobal: lap,
      fuelLoadKg: 0,
      fuelPerKgBenefit: 0,
      trackDegFactor: degFactor,
      maxStintLap: 50, 
      rejectThresholdSec: 999
    });

    const wearOnly = result.time - TEST_CONFIG.baseLapTime - BASE_COMPOUNDS[comp].baseOffset;
    
    row.push(`${wearOnly.toFixed(3)}s`.padEnd(18));
  });

  console.log(row.join(' | '));
}
