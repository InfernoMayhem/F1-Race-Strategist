const DEFAULT_COMPOUNDS = {
  Soft: { baseOffset: -0.8, wearBaseSec: 0.07, wearGrowth: 0.035 },
  Medium: { baseOffset: 0.0, wearBaseSec: 0.05, wearGrowth: 0.03 },
  Hard: { baseOffset: 0.6, wearBaseSec: 0.04, wearGrowth: 0.02 },
  Intermediate: { baseOffset: 2.0, wearBaseSec: 0.06, wearGrowth: 0.03 },
  Wet: { baseOffset: 5.0, wearBaseSec: 0.02, wearGrowth: 0.01 },
};

function toNumber(v, fb) { const n = Number(v); return Number.isFinite(n) ? n : fb; }
function toInt(v, fb) { const n = parseInt(v, 10); return Number.isFinite(n) ? n : fb; }

// Compute lap time and degradation factor given lap number in race and stint lap index.
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
  const time = baseLapTime + baseOffset + tyrePenalty - fuelBenefit;
  return { time, tyrePenalty };
}

function simulateStrategy(config, strategy, compoundModels) {
  const totalLaps = toInt(config.totalLaps, 0);
  const baseLapTime = toNumber(config.baseLapTime, 0);
  const fuelLoadKg = toNumber(config.fuelLoad, 0);
  const fuelPerKgBenefit = 0.005;
  const fuelBurnPerLap = totalLaps > 0 ? fuelLoadKg / totalLaps : 0;

  let currentLap = 1;
  let totalTime = 0;
  let fastest = null;
  const stints = [];
  const overallLapSeries = [];
  for (let s = 0; s < strategy.stints.length; s++) {
    const stint = strategy.stints[s];
    const lapsInStint = stint.laps;
    const compoundModel = compoundModels[stint.compound];
    const lapTimes = [];
    const tyrePenalties = [];
    const fuelLoads = [];
    let lastTyrePenalty = 0;
    for (let i = 1; i <= lapsInStint; i++) {
      const currentFuelLoad = Math.max(0, fuelLoadKg - fuelBurnPerLap * (currentLap - 1));
      const { time: rawTime, tyrePenalty } = lapTime({ baseLapTime, fuelPerKgBenefit, fuelBurnPerLap, lapNumber: currentLap, stintLapIndex: i, compoundModel });
      const t = Number(rawTime.toFixed(3));
      lapTimes.push(t);
      tyrePenalties.push(Number(tyrePenalty.toFixed(3)));
      fuelLoads.push(Number(currentFuelLoad.toFixed(3)));
      overallLapSeries.push({
        lap: currentLap,
        time: t,
        tyrePenalty: Number(tyrePenalty.toFixed(3)),
        fuelLoad: Number(currentFuelLoad.toFixed(3)),
        compound: stint.compound,
        stintIndex: s,
      });
      totalTime += t;
      lastTyrePenalty = tyrePenalty;
      if (!fastest || t < fastest.time) {
        fastest = { time: t, globalLap: currentLap, stintIndex: s, lapInStint: i, compound: stint.compound };
      }
      currentLap++;
    }
    const nominalLife = compoundModel.nominalLife ||
      (stint.compound === 'Soft' ? 20 :
       stint.compound === 'Medium' ? 30 :
       stint.compound === 'Hard' ? 40 :
       stint.compound === 'Intermediate' ? 35 : 50);
    const remainingLaps = Math.max(0, nominalLife - lapsInStint);
    const remainingPct = Number(((remainingLaps / nominalLife) * 100).toFixed(1));
    stints.push({ ...stint, lapTimes, tyrePenalties, fuelLoads, tyreLifeRemainingPct: remainingPct, nominalLife });
    if (s < strategy.stints.length - 1) {
      totalTime += toNumber(config.pitStopLoss, 0);
    }
  }
  return { ...strategy, stints, totalTime: Number(totalTime.toFixed(3)), fastestLap: fastest, lapSeries: overallLapSeries };
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
  if (totalLaps <= 0) return { best: {} };
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
  if (!compoundKeys.length) return { best: {} };

  const minStint = Math.min(5, Math.max(1, Math.floor(totalLaps / 10)));

  const targetStops = [1, 2, 3];
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
        if (candidateStrategies.length > 1000) break;
      }
      if (candidateStrategies.length > 1000) break;
    }
    // simulate each
    let best = null;
    for (const candidate of candidateStrategies) {
      const sim = simulateStrategy(config, candidate, compoundModels);
      if (!best || sim.totalTime < best.totalTime) best = sim;
    }
    if (best) {
      // compute pit laps for this best strategy
      const pitLaps = [];
      let cumulative = 0;
      best.stints.forEach((st, idx) => {
        cumulative += st.laps;
        if (idx < best.stints.length - 1) pitLaps.push(cumulative);
      });
      best.pitLaps = pitLaps;
      bestByStops[stops] = best;
    }
  }

  // choose overall best among available stop counts
  let overallBest = null;
  Object.values(bestByStops).forEach(strat => {
    if (strat && (!overallBest || strat.totalTime < overallBest.totalTime)) overallBest = strat;
  });
  // overallBest already has pitLaps via the loop above
  return { best: bestByStops, overallBest };
}

module.exports = { generateStrategies };