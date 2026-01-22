const { BASE_COMPOUNDS, WEAR_PARAMS, getTrackDegFactor, calcLapTimeWithWear } = require('./tyreModel');
const DEFAULT_COMPOUNDS = BASE_COMPOUNDS;

function getTyreInfo(compound) {
  const c = String(compound || 'Medium');
  const key = c.charAt(0).toUpperCase() + c.slice(1).toLowerCase();
  
  const base = BASE_COMPOUNDS[key] || BASE_COMPOUNDS.Medium;
  const wear = WEAR_PARAMS[key] || WEAR_PARAMS.Medium;

  const maxUsefulLaps = wear.cliffStart + 2; 

  return {
    key,
    baseOffset: base.baseOffset,
    maxUsefulLaps
  };
}

const fuelPerKgBenefit = 0.014;

const MIN_STINT = 8;

function calculateLapTime(lapNumber, stintLap, compound, params, currentFuelKg) {
  const info = getTyreInfo(compound);
  
  const { time, invalid } = calcLapTimeWithWear({
    compound: info.key,
    age: stintLap,
    baseLapTime: toNumber(params.baseLapTime, 0),
    baseOffset: info.baseOffset,
    totalLaps: toNumber(params.totalLaps, 0),
    lapGlobal: lapNumber,
    fuelLoadKg: currentFuelKg,
    fuelPerKgBenefit: fuelPerKgBenefit,
    trackDegFactor: toNumber(params.trackDegFactor, 1.0),
    maxStintLap: info.maxUsefulLaps + 10,
    rejectThresholdSec: 999,
  });

  return time;
}

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

function generateTyreAssignments(stintCount, allowedCompounds) {
  const keys = allowedCompounds || Object.keys(BASE_COMPOUNDS);
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

function validateStintLength(stintLength, compound) {
  const info = getTyreInfo(compound);
  if (!info) return false;
  return stintLength <= info.maxUsefulLaps;
}

function validateStintsWithCompounds(stints, compounds) {
  if (stints.length !== compounds.length) return false;
  for (let i = 0; i < stints.length; i++) {
    const len = stints[i].to - stints[i].from + 1;
    if (len < MIN_STINT) return false;
    const info = getTyreInfo(compounds[i]);
    if (!info) return false;
    if (!validateStintLength(len, compounds[i])) return false;
  }
  return true;
}

function evaluateStrictStrategy(params, pitLaps, compounds) {
  const totalLaps = toNumber(params.totalLaps, 0);
  const pitStopLoss = toNumber(params.pitStopLoss, 0);
  const outLapPenalty = toNumber(params.outLapPenalty, 0);
  if (!Number.isFinite(totalLaps) || totalLaps <= 0) return null;
  if (!Array.isArray(pitLaps)) return null;

  const stintRanges = stintsFromPits(totalLaps, pitLaps);
  if (!validateStintsWithCompounds(stintRanges, compounds)) return null;

  const lapTimes = [];
  let totalTime = 0;
  let stintIndex = 0;
  let currentStint = stintRanges[0];
  let currentStintLap = 0;
  const initialFuel = toNumber(params.initialFuel, 0);
  const fuelBurnPerLap = totalLaps > 0 ? initialFuel / totalLaps : 0;
  for (let lap = 1; lap <= totalLaps; lap++) {
    if (lap === currentStint.from) currentStintLap = 1; else currentStintLap += 1;
    const compKey = compounds[stintIndex];
    if (lap === currentStint.from && lap > 1) { 
    }
    const currentFuelKg = Math.max(0, initialFuel - fuelBurnPerLap * (lap - 1));
    const t = calculateLapTime(lap, currentStintLap, compKey, { ...params, outLapPenalty }, currentFuelKg);
    lapTimes.push(t);
    totalTime += t;
    if (lap === currentStint.to) {
      if (stintIndex < stintRanges.length - 1) totalTime += pitStopLoss;
      stintIndex += 1;
      currentStint = stintRanges[stintIndex] || currentStint;
      currentStintLap = 0;
    }
  }

  const stintsOut = stintRanges.map((r, i) => ({
    from: r.from,
    to: r.to,
    compound: compounds[i],
    laps: r.to - r.from + 1,
    lapTime: lapTimes.slice(r.from - 1, r.to).reduce((a, b) => a + b, 0) / (r.to - r.from + 1) || 0,
  }));

  return {
    valid: true,
    totalTime,
    lapTimes,
    stints: stintsOut,
  };
}

function toNumber(value, def) {
  const num = Number(value);
  return Number.isFinite(num) ? num : def;
}

function buildStrictStrategy(strictResult, config) {
  if (!strictResult) return null;
  const totalLaps = toInt(config.totalLaps, 0);
  const baseLapTime = toNumber(config.baseLapTime, 0);
  const fuelLoadKg = toNumber(config.fuelLoad, 0);
  const fuelBurnPerLap = totalLaps > 0 ? fuelLoadKg / totalLaps : 0;
  const trackDegFactor = getTrackDegFactor(config);
  const outLapPenalty = toNumber(config.outLapPenalty, 0);

  const lapSeries = [];
  const stints = [];
  let fastest = null;
  strictResult.stints.forEach((st, sIdx) => {
    const compName = st.compound;
    const info = getTyreInfo(compName);
    const laps = st.to - st.from + 1;
    const stintLapTimes = [];
    const stintTyrePenalties = [];
    const stintFuelLoads = [];
    
    for (let i = 1; i <= laps; i++) {
      const lapNumber = st.from + i - 1;
      const currentFuel = Math.max(0, fuelLoadKg - fuelBurnPerLap * (lapNumber - 1));
      
      const { time, wearPenalty } = calcLapTimeWithWear({
        compound: info.key,
        age: i,
        baseLapTime,
        baseOffset: info.baseOffset,
        totalLaps,
        lapGlobal: lapNumber,
        fuelLoadKg: currentFuel,
        fuelPerKgBenefit,
        trackDegFactor,
        maxStintLap: Number.MAX_SAFE_INTEGER,
        rejectThresholdSec: 999,
        outLapPenalty: i === 1 ? outLapPenalty : 0
      });

      const timeRounded = Number(time.toFixed(3));
      const wearRounded = Number(wearPenalty.toFixed(3));
      const fuelRounded = Number(currentFuel.toFixed(3));
      
      stintLapTimes.push(timeRounded);
      if (wearPenalty) {
        stintTyrePenalties.push(wearPenalty);
      } else {
        stintTyrePenalties.push(0);
      }
      stintFuelLoads.push(currentFuel);

      lapSeries.push({
        lap: lapNumber,
        time: timeRounded,
        tyrePenalty: wearRounded,
        fuelLoad: fuelRounded,
        compound: compName,
        stintIndex: sIdx,
        stintLap: i,
      });
    }

    const stintTime = stintLapTimes.reduce((a, b) => a + b, 0);
    const avgStintLapTime = stintTime / laps;
    if (fastest === null || avgStintLapTime < fastest.avg) {
      fastest = {
        avg: avgStintLapTime,
        compound: compName,
        laps,
        sIdx,
      };
    }

    stints.push({
      compound: compName,
      laps,
      from: st.from,
      to: st.to,
      lapTimes: stintLapTimes,
      tyrePenalties: stintTyrePenalties,
      fuelLoads: stintFuelLoads,
      totalTime: stintTime,
      avgLapTime: avgStintLapTime,
    });
  });

  return {
    valid: true,
    totalTime: strictResult.totalTime,
    lapTimes: strictResult.lapTimes,
    stints,
    lapSeries,
    fastestStint: fastest,
    stops: strictResult.pitLaps ? strictResult.pitLaps.length : 0,
    pitLaps: strictResult.pitLaps || []
  };
}

// optimise for Stop Count with allowedCompounds
function optimiseForStopCount(params, stopCount, allowedCompounds) {
  const totalLaps = toNumber(params.totalLaps, 0);
  if (!Number.isFinite(totalLaps) || totalLaps < 1) throw new Error('totalLaps must be > 0');
  const pitCombos = generatePitCombos(totalLaps, stopCount);
  if (!pitCombos.length) return null;
  const stintCount = stopCount + 1;
  const tyreCombos = generateTyreAssignments(stintCount, allowedCompounds);
  let best = null;
  for (let p = 0; p < pitCombos.length; p++) {
    const pits = pitCombos[p];
    const stintRanges = stintsFromPits(totalLaps, pits);
    for (let c = 0; c < tyreCombos.length; c++) {
      const combo = tyreCombos[c];
      if (!validateStintsWithCompounds(stintRanges, combo)) continue;
      const sim = evaluateStrictStrategy(params, pits, combo);
      if (!sim) continue;
      if (!best || sim.totalTime < best.totalTime - 1e-9) best = sim;
    }
  }
  return best;
}

// generate strict strategy object
function generateStrictStrategies(config) {
  const totalLaps = toNumber(config.totalLaps, 0);
  const totalRain = toNumber(config.totalRainfall, 0) || 0;
  const avgRainPerLap = totalRain / Math.max(1, totalLaps);

  let allowedCompounds;
  if (avgRainPerLap < 0.5) { allowedCompounds = ['Soft','Medium','Hard']; }
  else if (avgRainPerLap < 0.8) { allowedCompounds = ['Intermediate']; }
  else if (avgRainPerLap < 3.5) { allowedCompounds = ['Intermediate','Wet']; }
  else { allowedCompounds = ['Wet']; }

  const params = {
    totalLaps: totalLaps,
    baseLapTime: toNumber(config.baseLapTime, 0),
    pitStopLoss: toNumber(config.pitStopLoss, 0),
    initialFuel: toNumber(config.fuelLoad, 0),
    fuelPerKgBenefit,
    trackDegFactor: getTrackDegFactor(config),
    outLapPenalty: toNumber(config.outLapPenalty, 0),
  };
  const bestByStops = {};
  for (const stopCount of [1, 2, 3]) {
    let strictResult = null;
    try {
      strictResult = optimiseForStopCount(params, stopCount, allowedCompounds);
    } catch (err) {
      strictResult = null;
    }
    if (!strictResult) continue;
    
    strictResult.pitLaps = strictResult.stints.slice(0, -1).map(s => s.to);
  
    
    const decorated = buildStrictStrategy({ 
        pitLaps: strictResult.pitLaps || [], 
        stints: strictResult.stints, 
        totalTime: strictResult.totalTime,
        lapTimes: strictResult.lapTimes 
    }, config);
    
    if (!decorated) continue;
    decorated.actualStops = stopCount; 
    decorated.targetStops = stopCount;
    
    bestByStops[stopCount] = decorated;
  }
  let overallBest = null;
  Object.values(bestByStops).forEach((st) => { if (!overallBest || st.totalTime < overallBest.totalTime) overallBest = st; });
  return { best: bestByStops, overallBest, meta: { algorithm: 'strict-exhaustive', variants: Object.keys(bestByStops).length } };
}

function toInt(v, fb) { const n = parseInt(v, 10); return Number.isFinite(n) ? n : fb; }

function generateStrategies(config, options = {}) {
    return generateStrictStrategies(config);
}

module.exports = {
  getTyreInfo,
  calculateLapTime,
  generatePitCombos,
  stintsFromPits,
  generateTyreAssignments,
  validateStintLength,
  validateStintsWithCompounds,
  evaluateStrictStrategy,
  DEFAULT_COMPOUNDS,
  buildStrictStrategy,
  generateStrategies,
  generatePitCombos,
  generateTyreAssignments,
  evaluateStrictStrategy,
  generateStrictStrategies
};
