// calculates an array of simple lap times for a full race without pit stops
// primarily used for a basic no-pit baseline visualization

// helper to safely parse numbers
function toNumber(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

// helper to safely parse integers
function toInt(v, fallback) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
}

// main calculation function, generates lap times based on fuel burn and basic tyre wear
function calculateLapTimes(config, params = {}) {
  // extract and sanitise configuration inputs
  const totalLaps = toInt(config.totalLaps, 0);
  const baseLapTime = toNumber(config.baseLapTime, 0);
  const fuelLoadKg = toNumber(config.fuelLoad, 0);

  // validation checks
  if (!Number.isFinite(totalLaps) || totalLaps <= 0) return [];
  if (!Number.isFinite(baseLapTime) || baseLapTime <= 0) return Array(totalLaps).fill(0);

  // parameters deciding how tyre performance degrades over time
  // wearBaseSec, initial time loss per lap due to wear
  const wearBaseSec = toNumber(params.tyreWearBaseSec, 0.05);
  
  // wearGrowth, how much the wear accelerates lap-over-lap
  const wearGrowth = toNumber(params.tyreWearGrowth, 0.03);
  
  // fuelPerKgBenefit, how much time is gained per kg of fuel burned
  const fuelPerKgBenefit = toNumber(
    params.fuelPerKgBenefit ?? params.fuelPerKgPenalty,
    0.005
  ); 

  // assume fuel is burned linearly across the total distance
  const burnPerLapKg = totalLaps > 0 ? fuelLoadKg / totalLaps : 0;

  const laps = [];
  
  // simulate each lap sequentially
  for (let i = 1; i <= totalLaps; i++) {
    
    // calculate tyre wear penalty relative to fresh tyres
    let tyrePenalty = 0;
    if (wearGrowth === 0) {
      tyrePenalty = wearBaseSec * i;
    } else {
      // compounding growth for tyre degradation
      tyrePenalty = wearBaseSec * ((1 + wearGrowth) ** i - 1) / wearGrowth;
    }

    // calculate fuel effect, car gets faster as it gets lighter
    const fuelBurnedKg = burnPerLapKg * (i - 1);
    const fuelBenefit = fuelPerKgBenefit * fuelBurnedKg;

    // combine base time with penalties and benefits
    const lapTime = baseLapTime + tyrePenalty - fuelBenefit;
    
    // store the result, rounded to 3 decimal places
    laps.push(Number(lapTime.toFixed(3)));
  }

  return laps;
}

module.exports = { calculateLapTimes };
