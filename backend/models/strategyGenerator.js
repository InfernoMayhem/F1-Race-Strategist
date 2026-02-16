const { BASE_COMPOUNDS, WEAR_PARAMS, getTrackDegFactor, calcLapTimeWithWear } = require('./tyreModel');

// use the base compounds as default if none provided
const DEFAULT_COMPOUNDS = BASE_COMPOUNDS;

// retrieve performance data for a given tyre compound name
function getTyreInfo(compound) {
  // normalise the input string
  const c = String(compound || 'Medium');
  const key = c.charAt(0).toUpperCase() + c.slice(1).toLowerCase();
  
  // lookup base speed and wear parameters
  const base = BASE_COMPOUNDS[key] || BASE_COMPOUNDS.Medium;
  const wear = WEAR_PARAMS[key] || WEAR_PARAMS.Medium;

  // calculate the maximum laps before the tyre hits the cliff performance drop-off
  // Increased buffer to allow slightly longer stints if needed
  const maxUsefulLaps = wear.cliffStart + 5; 

  return {
    key,
    baseOffset: base.baseOffset,
    maxUsefulLaps
  };
}

const fuelPerKgBenefit = 0.014;

// minimum laps a stint must last to be considered valid
const MIN_STINT = 3;

// wrapper function to calculate a single lap time using the tyre model
function calculateLapTime(lapNumber, stintLap, compound, params, currentFuelKg) {
  const info = getTyreInfo(compound);
  
  if (!info) return Infinity; // Safety check

  const { time, invalid } = calcLapTimeWithWear({
    compound: info.key,
    age: stintLap,
    baseLapTime: Number(params.baseLapTime) || 0,
    baseOffset: info.baseOffset,
    totalLaps: Number(params.totalLaps) || 0,
    lapGlobal: lapNumber,
    fuelLoadKg: currentFuelKg,
    fuelPerKgBenefit: fuelPerKgBenefit,
    trackDegFactor: Number(params.trackDegFactor) || 1.0,
    maxStintLap: Number(info.maxUsefulLaps) || 40, // Ensure strictly number
    rejectThresholdSec: 999, // invalid laps higher up
    outLapPenalty: Number(params.outLapPenalty) || 0,
  });

  return time;
}

// generate all possible pit stop lap combinations for a given number of stops
function generatePitCombos(totalLaps, stopCount) {
  const results = [];
  
  // single stop strategies, iterate through all valid laps for the stop
  if (stopCount === 1) {
    const iMin = MIN_STINT;
    const iMax = totalLaps - MIN_STINT;
    for (let i = iMin; i <= iMax; i++) {
      results.push([i]);
    }
    return results;
  }
  
  // two stop strategies, nested loop for first and second stop
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
  
  // three stop strategies, triple nested loop
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

// Takes a list of lap numbers where pit stops happen, and converts them
// into "stints" (ranges of laps) that the car drives between stops.
function stintsFromPits(totalRaceLaps, pitStopLapNumbers) {
  const stintRanges = [];
  let currentStartLap = 1;

  for (let i = 0; i < pitStopLapNumbers.length; i++) {
    const pitLap = pitStopLapNumbers[i];
    
    // Create a stint from the last start point to this pit stop
    stintRanges.push({ 
        from: currentStartLap, 
        to: pitLap 
    });
    
    // The next stint starts on the lap immediately following the pit stop
    currentStartLap = pitLap + 1;
  }
  
  // Don't forget the final stint that goes all the way to the checkered flag
  stintRanges.push({ 
      from: currentStartLap, 
      to: totalRaceLaps 
  });
  
  return stintRanges;
}

// Generates every possible combination of tyre compounds we could assign to these stints.
function generateTyreAssignments(numberOfStints, allowedCompoundsList) {
  // If no specific compounds allowed, assume we can use any of the base ones
  const availableCompounds = allowedCompoundsList || Object.keys(BASE_COMPOUNDS);
  const validAssignments = [];
  
  // Use a recursive helper function to build the tree of possibilities
  function buildAssignmentRecursive(currentStintIndex, currentAssignmentList) {
    // Base case: we have assigned a tyre to every single stint
    if (currentStintIndex === numberOfStints) {
      
      // We must check the regulations: drivers must use at least 2 different compounds in a race
      const uniqueCompoundsUsed = new Set(currentAssignmentList);
      if (uniqueCompoundsUsed.size >= 2) {
        // This is a valid strategy, save a copy of it
        validAssignments.push(currentAssignmentList.slice());
      }
      return;
    }
    
    // Loop through every available tyre type and try adding it to the current stint
    for (let compoundIndex = 0; compoundIndex < availableCompounds.length; compoundIndex++) {
      const compoundName = availableCompounds[compoundIndex];
      
      currentAssignmentList.push(compoundName);
      
      // Move on to the next stint
      buildAssignmentRecursive(currentStintIndex + 1, currentAssignmentList);
      
      // Backtrack: remove the last added tyre so we can try the next one
      currentAssignmentList.pop();
    }
  }

  // Start the recursion from the first stint (index 0) with an empty list
  buildAssignmentRecursive(0, []);
  
  return validAssignments;
}

// Check if a specific stint length is realistic for a given tyre compound
function validateStintLength(stintLengthLaps, compoundName) {
  const tyreInfo = getTyreInfo(compoundName);
  
  // If the tyre doesn't exist, it's definitely not valid
  if (!tyreInfo) {
      return false;
  }
  
  // Return true only if the stint is shorter than the tyre's maximum life
  return stintLengthLaps <= tyreInfo.maxUsefulLaps;
}

// Validate the entire strategy to ensure every stint is physically possible
function validateStintsWithCompounds(stintRanges, compoundAssignments) {
  if (stintRanges.length !== compoundAssignments.length) {
      return false;
  }
  
  for (let i = 0; i < stintRanges.length; i++) {
    const stintDuration = stintRanges[i].to - stintRanges[i].from + 1;
    
    // Check global minimum stint length (e.g. can't do a 0 lap stint)
    if (stintDuration < MIN_STINT) {
        return false;
    }
    
    // Check if the assigned compound can actually last this long
    const assignedCompound = compoundAssignments[i];
    if (!validateStintLength(stintDuration, assignedCompound)) {
        return false;
    }
  }
  
  // If we made it here, the strategy is valid
  return true;
}

// Run a full simulation of the race for a specific strategy (pit laps + compounds)
function evaluateStrictStrategy(raceParams, pitStops, compoundChoices) {
  // Parse inputs with defaults to avoid NaN
  const totalLaps = Number(raceParams.totalLaps) || 0;
  const timeLostInPit = Number(raceParams.pitStopLoss) || 0;
  const timeLostOutLap = Number(raceParams.outLapPenalty) || 0;
  const trackDegFactor = getTrackDegFactor(raceParams);
  
  // Basic sanity checks
  if (!totalLaps || totalLaps <= 0) return null;
  if (!Array.isArray(pitStops)) return null;

  // Convert the pit stop laps into actual driving stints
  const stintRanges = stintsFromPits(totalLaps, pitStops);
  
  // Ensure the physics allow this strategy
  if (!validateStintsWithCompounds(stintRanges, compoundChoices)) {
      return null;
  }

  const raceLapTimes = [];
  let totalRaceTime = 0;
  let currentStintIndex = 0;
  let currentStintObject = stintRanges[0];
  let lapsDrivenInStint = 0;
  
  // Calculate fuel burn
  const startFuel = Number(raceParams.initialFuel) || 0;
  const fuelBurnPerLap = totalLaps > 0 ? startFuel / totalLaps : 0;

  // Iterate through every lap of the race
  for (let currentLap = 1; currentLap <= totalLaps; currentLap++) {
    // Check if we are still in the same stint or if we crossed a boundary
    if (currentLap === currentStintObject.from) {
      lapsDrivenInStint = 1; 
    } else {
      lapsDrivenInStint += 1;
    }
    
    const compKey = compoundChoices[currentStintIndex];
    const currentFuelKg = Math.max(0, startFuel - fuelBurnPerLap * (currentLap - 1));
    
    // calculate time for this specific lap
    const t = calculateLapTime(currentLap, lapsDrivenInStint, compKey, { ...raceParams, outLapPenalty: timeLostOutLap, trackDegFactor }, currentFuelKg);
    
    raceLapTimes.push(t);
    totalRaceTime += t;
    
    // handle pit stop at the end of the stint
    if (currentLap === currentStintObject.to) {
      if (currentStintIndex < stintRanges.length - 1) {
        totalRaceTime += timeLostInPit;
      }
      currentStintIndex += 1;
      currentStintObject = stintRanges[currentStintIndex] || currentStintObject;
      lapsDrivenInStint = 0;
    }
  }

  // summarize the stint data for the output
  const stintsOut = stintRanges.map((r, i) => ({
    from: r.from,
    to: r.to,
    compound: compoundChoices[i],
    laps: r.to - r.from + 1,
    lapTime: raceLapTimes.slice(r.from - 1, r.to).reduce((a, b) => a + b, 0) / (r.to - r.from + 1) || 0,
  }));

  return {
    valid: true,
    totalTime: totalRaceTime,
    lapTimes: raceLapTimes,
    stints: stintsOut,
  };
}



// enrich a raw strategy result with detailed lap-by-lap statistics for the UI
function buildStrictStrategy(strictResult, config) {
  if (!strictResult) return null;
  const totalLaps = parseInt(config.totalLaps, 10) || 0;
  const baseLapTime = Number(config.baseLapTime) || 0;
  const fuelLoadKg = Number(config.fuelLoad) || 0;
  const fuelBurnPerLap = totalLaps > 0 ? fuelLoadKg / totalLaps : 0;
  const trackDegFactor = getTrackDegFactor(config);
  const outLapPenalty = Number(config.outLapPenalty) || 0;

  const lapSeries = [];
  const stints = [];
  let fastest = null;
  
  // iterate through each stint to generate data
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
        maxStintLap: Number.MAX_SAFE_INTEGER, // already validated
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
    
    // track the fastest stint
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

  // find the absolute fastest single lap in the race
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

// use dynamic programming to find the optimal pit strategy for a fixed number of stops
function optimiseForStopCount(params, stopCount, allowedCompounds) {
  const totalLaps = parseInt(params.totalLaps, 10);
  if (!Number.isFinite(totalLaps) || totalLaps < 1) throw new Error('totalLaps must be > 0');
  
  const numStints = stopCount + 1;
  const initialFuel = Number(params.initialFuel);
  const fuelBurnPerLap = totalLaps > 0 ? initialFuel / totalLaps : 0;
  const pitStopLoss = Number(params.pitStopLoss);  

  // cache to store the calculated time for any [startLap, length, compound] combination
  const stintCostCache = new Map();

  function getStintCost(startLap, length, compound) {
    const key = `${startLap}-${length}-${compound}`;
    if (stintCostCache.has(key)) return stintCostCache.get(key);
    
    const info = getTyreInfo(compound);
    // if the stint is too long or too short, mark it as impossible
    if (!info || length < MIN_STINT || length > info.maxUsefulLaps) {
       stintCostCache.set(key, Infinity);
       return Infinity;
    }

    let time = 0;
    // calculate driving time for the stint
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

  // initialize dynamic programming table
  // dp[stintIndex][endLap][compound]
  // stores the best time to reach 'endLap' completing 'stintIndex' stints ending with 'compound'
  const dp = new Array(numStints + 1).fill(0).map(() => new Array(totalLaps + 1).fill(null));

  // initialize the first stint (base cases)
  for (let lap = 1; lap <= totalLaps; lap++) {
      if (lap < MIN_STINT) continue;
      
      for (const comp of allowedCompounds) {
          const cost = getStintCost(1, lap, comp);
          if (cost === Infinity) continue;
          
          if (!dp[1][lap]) dp[1][lap] = {};
          dp[1][lap][comp] = {
              uniform: { cost: cost, prevEnd: 0, prevComp: null },
              diverse: null // impossible to have 2 compounds in 1 stint
          };
      }
  }

  // iterate through subsequent stints (2 to N)
  for (let k = 2; k <= numStints; k++) {
      const minEnd = k * MIN_STINT;
      
      for (let lap = minEnd; lap <= totalLaps; lap++) {
          
          // determine possible end laps for the previous stint
          const maxPrev = lap - MIN_STINT;
          const minPrev = (k - 1) * MIN_STINT;
          
          for (let prev = maxPrev; prev >= minPrev; prev--) {
              // skip if previous state doesn't exist
              if (!dp[k-1][prev]) continue;
              
              // try all possible current compounds
              for (const currComp of allowedCompounds) {
                  const segCost = getStintCost(prev + 1, lap - prev, currComp);
                  if (segCost === Infinity) continue;

                  const transitionCost = segCost + pitStopLoss;
                  const prevDataVars = dp[k-1][prev];
                  
                  // check allowed transitions from previous compounds
                  for (const prevComp in prevDataVars) {
                      const entry = prevDataVars[prevComp];
                      if (!entry) continue;

                      // path 1, coming from a 'uniform' history (only 1 compound used so far)
                      if (entry.uniform) {
                          const newCost = entry.uniform.cost + transitionCost;
                          // if a compound is changed, it becomes 'diverse', else stay 'uniform'
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
                      
                      // path 2, coming from a 'diverse' history (already met the 2 compound rule)
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

  // find the best overall time that satisfies the diverse compound rule (or uniform if wet/inter)
  let bestTime = Infinity;
  let bestEndState = null;
  let bestFinalComp = null;
  let bestType = null;
  
  const finalStates = dp[numStints][totalLaps];
  
  if (finalStates) {
      for (const comp in finalStates) {
          const entry = finalStates[comp];
          if (!entry) continue;

          // Check if this compound is a wet/inter compound, which allows uniform strategies
          const isWet = comp === 'Intermediate' || comp === 'Wet';
          
          // Strategies to consider: diverse is always valid. Uniform is valid only if wet.
          const candidates = [];
          if (entry.diverse) candidates.push({ ...entry.diverse, type: 'diverse' });
          if (entry.uniform && isWet) candidates.push({ ...entry.uniform, type: 'uniform' });

          for (const cand of candidates) {
              if (cand.cost < bestTime) {
                  bestTime = cand.cost;
                  bestEndState = cand;
                  bestFinalComp = comp;
                  bestType = cand.type;
              }
          }
      }
  }

  if (bestTime === Infinity || !bestEndState) return null;

  // reconstruct the path of stints by backtracking
  const compounds = [];
  const pitLaps = [];
  
  let currStep = { ...bestEndState };
  let currComp = bestFinalComp;
  let currType = bestType; 
  let currEnd = totalLaps;
  
  for (let k = numStints; k >= 1; k--) {
      compounds.unshift(currComp);
      
      const prevEnd = currStep.prevEnd;
      const prevComp = currStep.prevComp;

      if (k > 1) { 
          // a pit stop happened at the end of the previous stint
          pitLaps.unshift(prevEnd);
      }
      
      // figure out which path was taken (uniform or diverse)
      if (k > 1) {
          const prevEntry = dp[k-1][prevEnd][prevComp];
          const costTransition = getStintCost(prevEnd + 1, currEnd - prevEnd, currComp) + pitStopLoss;
          const expectedPrevCost = currStep.cost - costTransition;
          
          if (prevEntry.uniform && Math.abs(prevEntry.uniform.cost - expectedPrevCost) < 1e-6) {
             currType = 'uniform';
             currStep = prevEntry.uniform;
          } else if (prevEntry.diverse && Math.abs(prevEntry.diverse.cost - expectedPrevCost) < 1e-6) {
             currType = 'diverse';
             currStep = prevEntry.diverse;
          } else {
             // fallback logic for float precision issues
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

// main entry point, calculate best strategies for 1, 2, and 3 stops
function generateStrictStrategies(config) {
  const totalLaps = parseInt(config.totalLaps, 10);
  if (!Number.isFinite(totalLaps) || totalLaps <= 0) {
      // If totalLaps is invalid, we can't generate strategies.
      // Return empty result rather than crashing or weird behaviour.
      return { best: {}, overallBest: null, meta: { error: "Invalid totalLaps" } };
  }

  const totalRain = Number(config.totalRainfall) || 0;
  const avgRainPerLap = totalRain / Math.max(1, totalLaps);

  // automatically restrict compounds based on weather/rainfall
  let allowedCompounds;
  if (avgRainPerLap < 0.5) { allowedCompounds = ['Soft','Medium','Hard']; }
  else if (avgRainPerLap < 0.8) { allowedCompounds = ['Intermediate']; }
  else if (avgRainPerLap < 3.5) { allowedCompounds = ['Intermediate','Wet']; }
  else { allowedCompounds = ['Wet']; }

  const params = {
    totalLaps: totalLaps,
    baseLapTime: Number(config.baseLapTime) || 0,
    pitStopLoss: Number(config.pitStopLoss) || 0,
    initialFuel: Number(config.fuelLoad) || 0,
    fuelPerKgBenefit,
    trackDegFactor: getTrackDegFactor(config),
    outLapPenalty: Number(config.outLapPenalty) || 0,
  };
  
  const bestByStops = {};
  
  // try to find the best strategy for each stop count
  for (const stopCount of [1, 2, 3]) {
    let strictResult = null;
    try {
      const dpParams = {
        totalLaps: totalLaps,
        baseLapTime: Number(config.baseLapTime) || 0,
        pitStopLoss: Number(config.pitStopLoss) || 0,
        initialFuel: Number(config.fuelLoad) || 0,
        fuelPerKgBenefit,
        trackDegFactor: getTrackDegFactor(config),
        outLapPenalty: Number(config.outLapPenalty) || 0,
      };
      
      strictResult = optimiseForStopCount(dpParams, stopCount, allowedCompounds);
    } catch (err) {
      // Just continue if optimal strategy not found for specific stop count
    }
    if (!strictResult) continue;

    strictResult.pitLaps = strictResult.stints.slice(0, -1).map(s => s.to);
  
    // fill the result with full details
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
  
  // identify the single best strategy across all stop counts
  let overallBest = null;
  Object.values(bestByStops).forEach((st) => { if (!overallBest || st.totalTime < overallBest.totalTime) overallBest = st; });
  return { best: bestByStops, overallBest, meta: { algorithm: 'strict-exhaustive', variants: Object.keys(bestByStops).length } };
}



function generateStrategies(config, options = {}) {
    const strictResult = generateStrictStrategies(config);
    return strictResult;
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
