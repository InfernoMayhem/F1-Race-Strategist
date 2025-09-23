// calculateLapTimes.js
// Computes lap times with exponential tyre degradation and a fuel-load effect.
// Returns an array of lap time values (seconds) of length totalLaps.

function toNumber(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function toInt(v, fallback) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Calculate lap times using a simple model:
 * - Tyre degradation: cumulative penalty grows exponentially with lap count
 *   tyrePenalty(i) = wearBaseSec * ((1 + wearGrowth) ** i - 1) / wearGrowth
 *   If wearGrowth is 0, it falls back to linear: wearBaseSec * i
 * - Fuel effect: as the race goes on, fuel burns off and the car gets lighter,
 *   which typically makes lap times faster (reduced time). We model this as a
 *   growing time benefit with laps (subtracted from the lap time):
 *   fuelBenefit(i) = fuelPerKgBenefit * (burnPerLapKg * (i - 1))
 *   lapTime(i) = base + tyrePenalty(i) - fuelBenefit(i)
 */
function calculateLapTimes(config, params = {}) {
  const totalLaps = toInt(config.totalLaps, 0);
  const baseLapTime = toNumber(config.baseLapTime, 0);
  const fuelLoadKg = toNumber(config.fuelLoad, 0);

  if (!Number.isFinite(totalLaps) || totalLaps <= 0) return [];
  if (!Number.isFinite(baseLapTime) || baseLapTime <= 0) return Array(totalLaps).fill(0);

  // coefficients
  const wearBaseSec = toNumber(params.tyreWearBaseSec, 0.05); // initial per-lap penalty (s)
  const wearGrowth = toNumber(params.tyreWearGrowth, 0.03);   // exponential growth per lap (%)
  const fuelPerKgBenefit = toNumber(
    params.fuelPerKgBenefit ?? params.fuelPerKgPenalty,
    0.005
  ); // seconds saved per kg burned so far

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

  // fuel benefit increases as more fuel is burned (lighter car => faster)
    const fuelBurnedKg = burnPerLapKg * (i - 1);
  const fuelBenefit = fuelPerKgBenefit * fuelBurnedKg;

  const lapTime = baseLapTime + tyrePenalty - fuelBenefit;
    laps.push(Number(lapTime.toFixed(3)));
  }

  return laps;
}

module.exports = { calculateLapTimes };
