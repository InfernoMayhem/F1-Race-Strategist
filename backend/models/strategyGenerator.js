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

const MIN_STINT = 3;

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

  // calculate overall fastest lap
  let fastestLap = null;
  lapSeries.forEach(lap => {
    if (!fastestLap || lap.time < fastestLap.time) {
      fastestLap = {
        time: lap.time,
        lapNumber: lap.lap,
        compound: lap.compound,
        stintLap: lap.stintLap
      };
    }
  });

  return {
    valid: true,
    totalTime: strictResult.totalTime,
    lapTimes: strictResult.lapTimes,
    stints,
    lapSeries,
    fastestStint: fastest,
    fastestLap: fastestLap,
    stops: strictResult.pitLaps ? strictResult.pitLaps.length : 0,
    pitLaps: strictResult.pitLaps || []
  };
}

// optimise using dp
function optimiseForStopCount(params, stopCount, allowedCompounds) {
  const totalLaps = toNumber(params.totalLaps, 0);
  if (!Number.isFinite(totalLaps) || totalLaps < 1) throw new Error('totalLaps must be > 0');
  
  const numStints = stopCount + 1;
  const initialFuel = toNumber(params.initialFuel, 0);
  const fuelBurnPerLap = totalLaps > 0 ? initialFuel / totalLaps : 0;
  const pitStopLoss = toNumber(params.pitStopLoss, 0);  

  // stint cost cache
  const stintCostCache = new Map();

  function getStintCost(startLap, length, compound) {
    const key = `${startLap}-${length}-${compound}`;
    if (stintCostCache.has(key)) return stintCostCache.get(key);
    
    const info = getTyreInfo(compound);
    if (!info || length < MIN_STINT || length > info.maxUsefulLaps) {
       stintCostCache.set(key, Infinity);
       return Infinity;
    }

    let time = 0;
    // calculate driving time
    for (let i = 1; i <= length; i++) {
        const lapGlobal = startLap + i - 1;
        if (lapGlobal > totalLaps) { time = Infinity; break; }

        const currentFuelKg = Math.max(0, initialFuel - fuelBurnPerLap * (lapGlobal - 1));
        const t = calculateLapTime(lapGlobal, i, compound, params, currentFuelKg);
        time += t;
    }
    
    stintCostCache.set(key, time);
    return time;
  }

  // dp state
  // dp[stintIndex][endLap][compound]
  // { diverse: { cost, prevEnd, prevComp }, uniform: { cost, prevEnd, prevComp } }
  const dp = new Array(numStints + 1).fill(0).map(() => new Array(totalLaps + 1).fill(null));

  // init stint 1
  for (let lap = 1; lap <= totalLaps; lap++) {
      if (lap < MIN_STINT) continue;
      
      for (const comp of allowedCompounds) {
          const cost = getStintCost(1, lap, comp);
          if (cost === Infinity) continue;
          
          if (!dp[1][lap]) dp[1][lap] = {};
          dp[1][lap][comp] = {
              uniform: { cost: cost, prevEnd: 0, prevComp: null },
              diverse: null // 1 stint cannot have 2 compounds yet
          };
      }
  }

  // iterate stints
  for (let k = 2; k <= numStints; k++) {
      // min end lap
      const minEnd = k * MIN_STINT;
      
      for (let lap = minEnd; lap <= totalLaps; lap++) {
          
          // prev stint constraints
          const maxPrev = lap - MIN_STINT;
          const minPrev = (k - 1) * MIN_STINT;
          
          for (let prev = maxPrev; prev >= minPrev; prev--) {
              // check previous state
              if (!dp[k-1][prev]) continue;
              
              // try compounds
              for (const currComp of allowedCompounds) {
                  const segCost = getStintCost(prev + 1, lap - prev, currComp);
                  if (segCost === Infinity) continue;

                  const transitionCost = segCost + pitStopLoss;
                  
                  const prevDataVars = dp[k-1][prev];
                  
                  // iterate previous compounds
                  for (const prevComp in prevDataVars) {
                      const entry = prevDataVars[prevComp];
                      if (!entry) continue;

                      // 1. from prev uniform
                      if (entry.uniform) {
                          const newCost = entry.uniform.cost + transitionCost;
                          const isNowDiverse = (currComp !== prevComp);
                          const type = isNowDiverse ? 'diverse' : 'uniform';
                          
                          if (!dp[k][lap]) dp[k][lap] = {};
                          if (!dp[k][lap][currComp]) dp[k][lap][currComp] = { uniform: null, diverse: null };
                          
                          const bestSoFar = dp[k][lap][currComp][type];
                          if (!bestSoFar || newCost < bestSoFar.cost) {
                              dp[k][lap][currComp][type] = {
                                  cost: newCost,
                                  prevEnd: prev,
                                  prevComp: prevComp
                              };
                          }
                      }
                      
                      // 2. from prev diverse
                      if (entry.diverse) {
                          const newCost = entry.diverse.cost + transitionCost;
                          if (!dp[k][lap]) dp[k][lap] = {};
                          if (!dp[k][lap][currComp]) dp[k][lap][currComp] = { uniform: null, diverse: null };

                          const bestSoFar = dp[k][lap][currComp].diverse;
                          if (!bestSoFar || newCost < bestSoFar.cost) {
                              dp[k][lap][currComp].diverse = {
                                  cost: newCost,
                                  prevEnd: prev,
                                  prevComp: prevComp
                              };
                          }
                      }
                  }
              }
          }
      }
  }

  // find best diverse result
  let bestTime = Infinity;
  let bestEndState = null;
  let bestFinalComp = null;
  
  const finalStates = dp[numStints][totalLaps];
  
  // Find best result at dp[numStints][totalLaps] that is diverse
  if (finalStates) {
      for (const comp in finalStates) {
          const entry = finalStates[comp];
          if (entry && entry.diverse) {
              if (entry.diverse.cost < bestTime) {
                  bestTime = entry.diverse.cost;
                  bestEndState = entry.diverse;
                  bestFinalComp = comp;
              }
          }
      }
  }

  if (bestTime === Infinity || !bestEndState) return null;

  // reconstruct path
  const compounds = [];
  const pitLaps = [];
  
  let currStep = { ...bestEndState };
  let currComp = bestFinalComp;
  let currType = 'diverse'; // must be diverse
  let currEnd = totalLaps;
  
  // backtrack
  for (let k = numStints; k >= 1; k--) {
      compounds.unshift(currComp);
      
      const prevEnd = currStep.prevEnd;
      const prevComp = currStep.prevComp;

      if (k > 1) { 
          pitLaps.unshift(prevEnd);
      }
      
      // determine source type
      if (k > 1) {
          const prevEntry = dp[k-1][prevEnd][prevComp];
          
          const costTransition = getStintCost(prevEnd + 1, currEnd - prevEnd, currComp) + pitStopLoss;
          const expectedPrevCost = currStep.cost - costTransition;
          
          // check uniform match
          if (prevEntry.uniform && Math.abs(prevEntry.uniform.cost - expectedPrevCost) < 1e-6) {
             currType = 'uniform';
             currStep = prevEntry.uniform;
          } else if (prevEntry.diverse && Math.abs(prevEntry.diverse.cost - expectedPrevCost) < 1e-6) {
             currType = 'diverse';
             currStep = prevEntry.diverse;
          } else {
             // fallback
             const isDiff = (currComp !== prevComp);
             if (isDiff && prevEntry.uniform && Math.abs(prevEntry.uniform.cost - expectedPrevCost) < 1e-6) {
                 currType = 'uniform';
                 currStep = prevEntry.uniform;
             } else {
                 currType = 'diverse';
                 currStep = prevEntry.diverse;
             }
          }
      }
      
      currEnd = prevEnd;
      currComp = prevComp;
  }
  
  return evaluateStrictStrategy(params, pitLaps, compounds);
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
