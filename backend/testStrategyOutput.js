const { generateStrategies } = require('./models/strategyGenerator');

// Configuration matching the user's request
const config = {
  totalLaps: "57",
  baseLapTime: "92",
  fuelLoad: "110",
  pitStopLoss: "20",
  trackLength: "5.412",
  degradation: "Medium",
  temperature: "25",
  totalRainfall: "0"
};

console.log("Running strategy generation with config:", config);

const result = generateStrategies(config);

if (!result || !result.best) {
  console.error("No strategies generated!");
  process.exit(1);
}

// Pick the best overall strategy, or specifically the 2-stop if available
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
