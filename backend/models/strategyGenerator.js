const DEFAULT_COMPOUNDS = {
  Soft: { baseOffset: -0.8, wearBaseSec: 0.07, wearGrowth: 0.035 },
  Medium: { baseOffset: 0.0, wearBaseSec: 0.05, wearGrowth: 0.03 },
  Hard: { baseOffset: 0.6, wearBaseSec: 0.04, wearGrowth: 0.02 },
  Intermediate: { baseOffset: 2.0, wearBaseSec: 0.06, wearGrowth: 0.03 },
  Wet: { baseOffset: 5.0, wearBaseSec: 0.02, wearGrowth: 0.01 },
};

function toNumber(v, fb) { const n = Number(v); return Number.isFinite(n) ? n : fb; }
function toInt(v, fb) { const n = parseInt(v, 10); return Number.isFinite(n) ? n : fb; }

// Compute lap time given lap number in race and stint lap index.
function lapTime({ baseLapTime, fuelPerKgBenefit, fuelBurnPerLap, lapNumber, stintLapIndex, compoundModel }) {
  // tyre penalty (cumulative) at this stint lap
  const { wearBaseSec, wearGrowth, baseOffset } = compoundModel;
  let tyrePenalty;
  if (wearGrowth === 0) {
    tyrePenalty = wearBaseSec * stintLapIndex;
  } else {
    tyrePenalty = wearBaseSec * ((1 + wearGrowth) ** stintLapIndex - 1) / wearGrowth;
  }
  const fuelBurnedKg = fuelBurnPerLap * (lapNumber - 1);
  const fuelBenefit = fuelPerKgBenefit * fuelBurnedKg;
  return baseLapTime + baseOffset + tyrePenalty - fuelBenefit;
}

function simulateStrategy(config, strategy, compoundModels) {
  const totalLaps = toInt(config.totalLaps, 0);
  const baseLapTime = toNumber(config.baseLapTime, 0);
  const fuelLoadKg = toNumber(config.fuelLoad, 0);
  const fuelPerKgBenefit = 0.005;
  const fuelBurnPerLap = totalLaps > 0 ? fuelLoadKg / totalLaps : 0;

  let currentLap = 1;
  let totalTime = 0;
  const stints = [];
  for (let s = 0; s < strategy.stints.length; s++) {
    const stint = strategy.stints[s];
    const lapsInStint = stint.laps;
    const compoundModel = compoundModels[stint.compound];
    const lapTimes = [];
    for (let i = 1; i <= lapsInStint; i++) {
      const t = lapTime({ baseLapTime, fuelPerKgBenefit, fuelBurnPerLap, lapNumber: currentLap, stintLapIndex: i, compoundModel });
      lapTimes.push(Number(t.toFixed(3)));
      totalTime += t;
      currentLap++;
    }
    stints.push({ ...stint, lapTimes });
    if (s < strategy.stints.length - 1) {
      totalTime += toNumber(config.pitStopLoss, 0);
    }
  }
  return { ...strategy, stints, totalTime: Number(totalTime.toFixed(3)) };
}

function generateStintDistributions(totalLaps, partsCount, minStint) {
  const results = [];
  function backtrack(partIdx, acc, remaining) {
    if (partIdx === partsCount) {
      if (remaining === 0) results.push(acc.slice());
      return;
    }
    const partsLeft = partsCount - partIdx - 1;
    const minPossible = partsLeft * minStint;
    const maxCurrent = remaining - minPossible;
    for (let v = minStint; v <= maxCurrent; v++) {
      acc.push(v);
      backtrack(partIdx + 1, acc, remaining - v);
      acc.pop();
      if (results.length > 300) return;
    }
  }
  backtrack(0, [], totalLaps);
  return results;
}

function distinctCompoundsUsed(compounds) {
  return new Set(compounds).size;
}

function enumerateCompoundAssignments(stintCount, compoundKeys, requireTwo) {
  const assignments = [];
  function backtrack(idx, acc) {
    if (idx === stintCount) {
      if (!requireTwo || distinctCompoundsUsed(acc) >= 2) assignments.push(acc.slice());
      return;
    }
    for (const c of compoundKeys) {
      acc.push(c);
      backtrack(idx + 1, acc);
      acc.pop();
      if (assignments.length > 400) return;
    }
  }
  backtrack(0, [], stintCount);
  return assignments;
}

function generateStrategies(config, options = {}) {
  const allCompounds = { ...DEFAULT_COMPOUNDS, ...(options.compounds || {}) };
  const totalLaps = toInt(config.totalLaps, 0);
  if (totalLaps <= 0) return { strategies: [], best: {} };
  const totalRain = toNumber(config.totalRainfall, 0) || 0;
  const avgRainPerLap = totalLaps > 0 ? totalRain / totalLaps : 0;

  // Determine which compound set to consider based on average rainfall.
  let allowedKeys;
  let requireTwoCompounds = false;
  if (avgRainPerLap < 0.5) {
    allowedKeys = ['Soft', 'Medium', 'Hard'];
    requireTwoCompounds = true;
  } else if (avgRainPerLap >= 0.5 && avgRainPerLap < 0.8) {
    allowedKeys = ['Intermediate'];
  } else if (avgRainPerLap >= 0.8 && avgRainPerLap < 3.5) {
    allowedKeys = ['Intermediate', 'Wet'];
  } else {
    allowedKeys = ['Wet'];
  }

  // Filter compound models to allowed keys only
  const compoundModels = Object.fromEntries(allowedKeys.map(k => [k, allCompounds[k]]).filter(([,v]) => v));
  const compoundKeys = Object.keys(compoundModels);
  if (!compoundKeys.length) return { strategies: [], best: {} };

  const minStint = Math.min(5, Math.max(1, Math.floor(totalLaps / 10)));

  const targetStops = [1, 2, 3];
  const allStrategies = [];
  const bestByStops = {};

  for (const stops of targetStops) {
    const stintCount = stops + 1;
    const dists = generateStintDistributions(totalLaps, stintCount, minStint);
  const compoundSeqs = enumerateCompoundAssignments(stintCount, compoundKeys, requireTwoCompounds);
    let candidateStrategies = [];
    for (const dist of dists) {
      for (const seq of compoundSeqs) {
        const stints = dist.map((laps, i) => ({ stint: i + 1, laps, compound: seq[i] }));
        candidateStrategies.push({ stops, stints });
        if (candidateStrategies.length > 1000) break; // guard
      }
      if (candidateStrategies.length > 1000) break;
    }
    // simulate each
    const simulated = candidateStrategies.map((s) => simulateStrategy(config, s, compoundModels));
    simulated.sort((a, b) => a.totalTime - b.totalTime);
    if (simulated.length) {
      bestByStops[stops] = simulated[0];
      allStrategies.push(...simulated.slice(0, 50));
    }
  }

  return { strategies: allStrategies, best: bestByStops, compounds: compoundModels };
}

module.exports = { generateStrategies };