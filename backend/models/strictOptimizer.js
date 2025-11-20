"use strict";

// Strict F1 strategy optimiser per user specification.
// Pure JavaScript, deterministic, and browser-compatible (no Node APIs inside core functions).

// 1) Tyres (exact values, do not change unless user changes them)
const tyreData = {
  soft:   { baseOffset: -0.35, wearBase: 0.035, wearGrowth: 0.020, maxLaps: 22 },
  medium: { baseOffset:  0.00, wearBase: 0.020, wearGrowth: 0.010, maxLaps: 28 },
  hard:   { baseOffset:  0.25, wearBase: 0.015, wearGrowth: 0.005, maxLaps: 38 },
};

const MIN_STINT = 8; // laps

// Utility: clamp and helpers (no external deps)
const toNumber = (v, fb) => { const n = Number(v); return Number.isFinite(n) ? n : fb; };

// 2) Lap Time Model (exact formula)
// lap_time = baseLapTime
//          + tyre.baseOffset
//          + (tyre.wearBase * stintLap)
//          + (tyre.wearGrowth * Math.pow(stintLap, 1.7))
//          - (fuelPerKgBenefit * (initialFuel - lapNumber))
function calculateLapTime(lapIndex, stintLap, compound, params) {
  const compKey = String(compound || '').toLowerCase();
  const tyre = tyreData[compKey];
  if (!tyre) throw new Error(`Unknown compound: ${compound}`);
  const baseLapTime = toNumber(params.baseLapTime, 0);
  const fuelPerKgBenefit = toNumber(params.fuelPerKgBenefit, 0.005);
  const initialFuel = toNumber(params.initialFuel, 0);
  const lapNumber = lapIndex; // lapIndex is 1-based when called below
  const wearTerm = (tyre.wearBase * stintLap) + (tyre.wearGrowth * Math.pow(stintLap, 1.7));
  const fuelBenefit = fuelPerKgBenefit * (initialFuel - lapNumber);
  return baseLapTime + tyre.baseOffset + wearTerm - fuelBenefit;
}

// Build list of pit stop lap arrays for a given stop count.
// Rules: each stint >= 8 laps, and no pit on lap 1 or last lap (naturally enforced by lengths).
function generatePitCombos(totalLaps, stopCount) {
  const results = [];
  if (stopCount === 1) {
    const iMin = MIN_STINT;
    const iMax = totalLaps - MIN_STINT;
    for (let i = iMin; i <= iMax; i++) {
      results.push([i]);
    }
    return results;
  }
  if (stopCount === 2) {
    const iMin = MIN_STINT;
    const iMax = totalLaps - 2 * MIN_STINT;
    for (let i = iMin; i <= iMax; i++) {
      const jMin = i + MIN_STINT;
      const jMax = totalLaps - MIN_STINT;
      for (let j = jMin; j <= jMax; j++) {
        results.push([i, j]);
      }
    }
    return results;
  }
  if (stopCount === 3) {
    const iMin = MIN_STINT;
    const iMax = totalLaps - 3 * MIN_STINT;
    for (let i = iMin; i <= iMax; i++) {
      const jMin = i + MIN_STINT;
      const jMax = totalLaps - 2 * MIN_STINT;
      for (let j = jMin; j <= jMax; j++) {
        const kMin = j + MIN_STINT;
        const kMax = totalLaps - MIN_STINT;
        for (let k = kMin; k <= kMax; k++) {
          results.push([i, j, k]);
        }
      }
    }
    return results;
  }
  return results;
}

// All stints for totalLaps with given pit laps: returns { from, to } for each stint.
function stintsFromPits(totalLaps, pitLaps) {
  const stints = [];
  let start = 1;
  for (let i = 0; i < pitLaps.length; i++) {
    const pit = pitLaps[i];
    stints.push({ from: start, to: pit });
    start = pit + 1;
  }
  stints.push({ from: start, to: totalLaps });
  return stints;
}

// Generate all tyre assignments for N stints requiring at least two distinct compounds.
function generateTyreAssignments(stintCount) {
  const keys = Object.keys(tyreData); // ['soft','medium','hard']
  const out = [];
  function backtrack(idx, acc) {
    if (idx === stintCount) {
      const s = new Set(acc);
      if (s.size >= 2) out.push(acc.slice());
      return;
    }
    for (let k = 0; k < keys.length; k++) {
      acc.push(keys[k]);
      backtrack(idx + 1, acc);
      acc.pop();
    }
  }
  backtrack(0, []);
  return out;
}

// Validate stint lengths: >= MIN_STINT and <= compound max for assigned compound.
function validateStintsWithCompounds(stints, compounds) {
  if (stints.length !== compounds.length) return false;
  for (let i = 0; i < stints.length; i++) {
    const len = stints[i].to - stints[i].from + 1;
    if (len < MIN_STINT) return false;
    const comp = tyreData[compounds[i]];
    if (!comp) return false;
    if (len > comp.maxLaps) return false;
  }
  return true;
}

// Evaluate a candidate strategy: returns { totalTime, lapTimes, pitLaps, stints } or null if invalid.
function evaluateStrategy(params, pitLaps, compounds) {
  const totalLaps = toNumber(params.totalLaps, 0);
  const baseLapTime = toNumber(params.baseLapTime, 0); // used in calculateLapTime via params
  const pitStopLoss = toNumber(params.pitStopLoss, 0);
  if (!Number.isFinite(totalLaps) || totalLaps <= 0) return null;
  if (!Array.isArray(pitLaps)) return null;

  const stintRanges = stintsFromPits(totalLaps, pitLaps);
  if (!validateStintsWithCompounds(stintRanges, compounds)) return null;

  // Simulate lap by lap
  const lapTimes = [];
  let totalTime = 0;
  let stintIndex = 0;
  let currentStint = stintRanges[0];
  let currentStintLap = 0;
  for (let lap = 1; lap <= totalLaps; lap++) {
    if (lap === currentStint.from) currentStintLap = 1; else currentStintLap += 1;
    const compKey = compounds[stintIndex];
    const t = calculateLapTime(lap, currentStintLap, compKey, params);
    lapTimes.push(t);
    totalTime += t;
    if (lap === currentStint.to) {
      // pit stop after this lap, except after final stint
      if (stintIndex < stintRanges.length - 1) totalTime += pitStopLoss;
      stintIndex += 1;
      currentStint = stintRanges[stintIndex] || currentStint;
      currentStintLap = 0;
    }
  }

  // Build stints output with capitalized names
  const stintsOut = stintRanges.map((r, i) => ({
    from: r.from,
    to: r.to,
    compound: (String(compounds[i]).charAt(0).toUpperCase() + String(compounds[i]).slice(1).toLowerCase()),
  }));

  return {
    totalTime: Number(totalTime.toFixed(3)),
    pitLaps: pitLaps.slice(),
    stints: stintsOut,
    lapTimes: lapTimes.map(v => Number(v.toFixed(3))),
  };
}

function optimiseForStopCount(params, stopCount) {
  const totalLaps = toNumber(params.totalLaps, 0);
  if (!Number.isFinite(totalLaps) || totalLaps < 1) throw new Error('totalLaps must be > 0');
  const pitCombos = generatePitCombos(totalLaps, stopCount);
  if (!pitCombos.length) return null;
  const stintCount = stopCount + 1;
  const tyreCombos = generateTyreAssignments(stintCount);
  let best = null;
  for (let p = 0; p < pitCombos.length; p++) {
    const pits = pitCombos[p];
    const stintRanges = stintsFromPits(totalLaps, pits);
    for (let c = 0; c < tyreCombos.length; c++) {
      const combo = tyreCombos[c];
      if (!validateStintsWithCompounds(stintRanges, combo)) continue;
      const sim = evaluateStrategy(params, pits, combo);
      if (!sim) continue;
      if (!best || sim.totalTime < best.totalTime - 1e-9) best = sim;
    }
  }
  return best;
}

// Main optimiser: tries 1, 2, 3 stops; returns overall best valid strategy or throws if none.
function optimiseStrict(params) {
  let best = null;
  for (let stopCount = 1; stopCount <= 3; stopCount++) {
    const candidate = optimiseForStopCount(params, stopCount);
    if (!candidate) continue;
    if (!best || candidate.totalTime < best.totalTime - 1e-9) best = candidate;
  }
  if (!best) throw new Error('No valid strategy found');
  return best;
}

// Export for Node; functions themselves are browser-friendly.
module.exports = {
  tyreData,
  calculateLapTime,
  generatePitCombos,
  evaluateStrategy,
  optimiseForStopCount,
  optimiseStrict,
};
