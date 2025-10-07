// returns an array of lap time values for the number of laps

function toNumber(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function toInt(v, fallback) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
}

// calculate lap times using a model:
function calculateLapTimes(config, params = {}) {
  const totalLaps = toInt(config.totalLaps, 0);
  const baseLapTime = toNumber(config.baseLapTime, 0);
  const fuelLoadKg = toNumber(config.fuelLoad, 0);

  if (!Number.isFinite(totalLaps) || totalLaps <= 0) return [];
  if (!Number.isFinite(baseLapTime) || baseLapTime <= 0) return Array(totalLaps).fill(0);

  // coefficients for the model
  const wearBaseSec = toNumber(params.tyreWearBaseSec, 0.05);
  const wearGrowth = toNumber(params.tyreWearGrowth, 0.03);
  const fuelPerKgBenefit = toNumber(
    params.fuelPerKgBenefit ?? params.fuelPerKgPenalty,
    0.005
  ); 

  const burnPerLapKg = totalLaps > 0 ? fuelLoadKg / totalLaps : 0;

  const laps = [];
  for (let i = 1; i <= totalLaps; i++) {
    // tyre cumulative penalty up to lap i
    let tyrePenalty = 0;
    if (wearGrowth === 0) {
      tyrePenalty = wearBaseSec * i;
    } else {
      tyrePenalty = wearBaseSec * ((1 + wearGrowth) ** i - 1) / wearGrowth;
    }

  // fuel benefit increases as more fuel is burned
    const fuelBurnedKg = burnPerLapKg * (i - 1);
  const fuelBenefit = fuelPerKgBenefit * fuelBurnedKg;

  const lapTime = baseLapTime + tyrePenalty - fuelBenefit;
    laps.push(Number(lapTime.toFixed(3)));
  }

  return laps;
}

module.exports = { calculateLapTimes };
