const { generateStrategies } = require('../models/strategyGenerator');

// configuration matching the user's request
const config = {
  totalLaps: "57",
  baseLapTime: "95.2",
  fuelLoad: "110",
  pitStopLoss: "21.5",
  trackLength: "5.4",
  degradation: "Low",
  temperature: "20",
  totalRainfall: "0",
  outLapPenalty: "2.0" // default warm-up penalty for testing low deg logic
};

console.log("Running strategy generation with config:", config);

const result = generateStrategies(config);

if (!result || !result.best) {
  console.error("No strategies generated!");
  process.exit(1);
}

// pick the best overall strategy, or specifically the 2-stop if available
const strategy = result.best['2'] || result.overallBest;

if (!strategy) {
  console.error("No valid strategy found.");
  process.exit(1);
}

console.log('\n=== STRATEGY LAP DATA ===');
console.log(`Stops: ${strategy.stops}`);
console.log(`Stints: ${strategy.stints.map(s => `${s.compound} (${s.laps} laps)`).join(' -> ')}`);
console.log(`Total Time: ${strategy.totalTime.toFixed(3)}s`);

console.log('\nLap | Time (s) | Fuel (kg) | Wear (s)');
console.log('----|----------|-----------|---------');

strategy.lapSeries.forEach(lap => {
  console.log(
    String(lap.lap).padStart(3) + ' | ' + 
    String(lap.time.toFixed(3)).padStart(8) + ' | ' + 
    String(lap.fuelLoad.toFixed(2)).padStart(9) + ' | ' + 
    String(lap.tyrePenalty.toFixed(3)).padStart(8)
  );
});
