const { BASE_COMPOUNDS, getTrackDegFactor, calcLapTimeWithWear } = require('./tyreModel');
const strictOpt = require('./strictOptimizer');
const DEFAULT_COMPOUNDS = BASE_COMPOUNDS;

function toNumber(v, fb) { const n = Number(v); return Number.isFinite(n) ? n : fb; }
function toInt(v, fb) { const n = parseInt(v, 10); return Number.isFinite(n) ? n : fb; }

function buildStrictStrategy(strictResult, config) {
  if (!strictResult) return null;
  const totalLaps = toInt(config.totalLaps, 0);
  const fuelLoadKg = toNumber(config.fuelLoad, 0);
  const fuelBurnPerLap = totalLaps > 0 ? fuelLoadKg / totalLaps : 0;
  const lapSeries = [];
  const stints = [];
  let lapIdx = 0;
  let fastest = null;
  strictResult.stints.forEach((st, sIdx) => {
    const compName = st.compound;
    const compKey = String(compName || '').toLowerCase();
    const tyre = strictOpt.tyreData[compKey];
    const laps = st.to - st.from + 1;
    const stintLapTimes = [];
    const stintTyrePenalties = [];
    const stintFuelLoads = [];
    for (let i = 1; i <= laps; i++) {
      const lapTime = strictResult.lapTimes[lapIdx] ?? 0;
      const lapNumber = st.from + i - 1;
      const wearPenalty = tyre ? (tyre.wearBase * i) + (tyre.wearGrowth * Math.pow(i, 1.7)) : 0;
      const fuelLoad = Math.max(0, fuelLoadKg - fuelBurnPerLap * (lapNumber - 1));
      const timeRounded = Number(Number(lapTime).toFixed(3));
      const wearRounded = Number(wearPenalty.toFixed(3));
      const fuelRounded = Number(fuelLoad.toFixed(3));
      stintLapTimes.push(timeRounded);
      stintTyrePenalties.push(wearRounded);
      stintFuelLoads.push(fuelRounded);
      lapSeries.push({
        lap: lapNumber,
        time: timeRounded,
        tyrePenalty: wearRounded,
        fuelLoad: fuelRounded,
        compound: compName,
        stintIndex: sIdx,
        stintLap: i,
      });
      if (!fastest || timeRounded < fastest.time) {
        fastest = { time: timeRounded, globalLap: lapNumber, stintIndex: sIdx, lapInStint: i, compound: compName };
      }
      lapIdx += 1;
    }
    stints.push({ stint: sIdx + 1, compound: compName, laps, lapTimes: stintLapTimes, tyrePenalties: stintTyrePenalties, fuelLoads: stintFuelLoads });
  });
  return {
    stints,
    pitLaps: strictResult.pitLaps.slice(),
    totalTime: strictResult.totalTime,
    lapSeries,
    fastestLap: fastest,
    stops: strictResult.pitLaps.length,
  };
}

function generateStrictStrategies(config) {
  const params = {
    totalLaps: toNumber(config.totalLaps, 0),
    baseLapTime: toNumber(config.baseLapTime, 0),
    pitStopLoss: toNumber(config.pitStopLoss, 0),
    initialFuel: toNumber(config.fuelLoad, 0),
    fuelPerKgBenefit: 0.005,
  };
  const bestByStops = {};
  for (const stopCount of [1, 2, 3]) {
    let strictResult = null;
    try {
      strictResult = strictOpt.optimiseForStopCount(params, stopCount);
    } catch (err) {
      strictResult = null;
    }
    if (!strictResult) continue;
    const decorated = buildStrictStrategy(strictResult, config);
    if (!decorated) continue;
    decorated.actualStops = decorated.pitLaps.length;
    decorated.targetStops = stopCount;
    bestByStops[stopCount] = decorated;
  }
  let overallBest = null;
  Object.values(bestByStops).forEach((st) => { if (!overallBest || st.totalTime < overallBest.totalTime) overallBest = st; });
  return { best: bestByStops, overallBest, meta: { algorithm: 'strict-exhaustive', variants: Object.keys(bestByStops).length } };
}

// compute lap time and degradation factor given lap number in race and stint lap index
function lapTime({ baseLapTime, fuelPerKgBenefit, fuelBurnPerLap, lapNumber, stintLapIndex, compoundModel, trackDegFactor, maxStintLap, rejectThresholdSec }) {
  const { baseOffset } = compoundModel;
  const totalLaps = 1000000; // fuelBurnPerLap already computed from real total
  const fuelLoadKg = fuelBurnPerLap * totalLaps; // makes burnedKg = fuelBurnPerLap*(lap-1) below
  const { time, wearPenalty, invalid } = calcLapTimeWithWear({
    compound: compoundModel.name || 'Medium',
    age: stintLapIndex,
    baseLapTime,
    baseOffset,
    totalLaps: Math.max(1, Math.round(1 + (fuelLoadKg / Math.max(1e-9, fuelBurnPerLap)))),
    lapGlobal: lapNumber,
    fuelLoadKg,
    fuelPerKgBenefit,
    trackDegFactor,
    maxStintLap,
    rejectThresholdSec,
  });
  return { time, tyrePenalty: wearPenalty, invalid };
}

function simulateStrategy(config, strategy, compoundModels, opts) {
  const totalLaps = toInt(config.totalLaps, 0);
  const baseLapTime = toNumber(config.baseLapTime, 0);
  const fuelLoadKg = toNumber(config.fuelLoad, 0);
  const fuelPerKgBenefit = 0.005;
  const fuelBurnPerLap = totalLaps > 0 ? fuelLoadKg / totalLaps : 0;
  const trackDegFactor = getTrackDegFactor(config);
  const maxStintLap = toInt(config.maxStintLap, 35) || 35;
  const rejectThresholdSec = toNumber(config.degThreshold, 8);

  let currentLap = 1;
  let totalTime = 0;
  let fastest = null;
  const stints = [];
  const overallLapSeries = [];
  let invalid = false;
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
      const { time: rawTime, tyrePenalty, invalid: lapInvalid } = lapTime({ baseLapTime, fuelPerKgBenefit, fuelBurnPerLap, lapNumber: currentLap, stintLapIndex: i, compoundModel: { ...compoundModel, name: stint.compound }, trackDegFactor, maxStintLap, rejectThresholdSec });
      if (lapInvalid || !Number.isFinite(rawTime)) { invalid = true; break; }
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
    if (invalid) break;
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
  if (invalid) return null;
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

/*
  Multi-variant dynamic pit optimisation.
  Produces up to three distinct strategies keyed by pit count using a DP with a maxStops constraint.
  If fewer than three distinct stop counts are naturally produced, a relaxed MIN_STINT variant fills gaps.
 */

function generateStrategies(config, options = {}) {
  const allCompounds = { ...DEFAULT_COMPOUNDS, ...(options.compounds || {}) };
  const totalLaps = toInt(config.totalLaps, 0);
  if (totalLaps <= 0) return { best: {}, overallBest: null };
  const totalRain = toNumber(config.totalRainfall, 0) || 0;
  const avgRainPerLap = totalRain / Math.max(1, totalLaps);

  let allowedKeys; let requireTwoCompounds = false;
  if (avgRainPerLap < 0.5) { allowedKeys = ['Soft','Medium','Hard']; requireTwoCompounds = true; }
  else if (avgRainPerLap < 0.8) { allowedKeys = ['Intermediate']; }
  else if (avgRainPerLap < 3.5) { allowedKeys = ['Intermediate','Wet']; }
  else { allowedKeys = ['Wet']; }
  const compoundModels = Object.fromEntries(allowedKeys.map(k => [k, allCompounds[k]]).filter(([,v]) => v));
  const compoundKeys = Object.keys(compoundModels);
  if (!compoundKeys.length) return { best: {}, overallBest: null };

  const slickAvailable = ['Soft','Medium','Hard'].some((key) => compoundKeys.includes(key));
  if (slickAvailable) {
    const strictResult = generateStrictStrategies(config);
    if (strictResult && strictResult.overallBest) {
      return strictResult;
    }
  }

  const baseLapTime = toNumber(config.baseLapTime, 0);
  const fuelLoadKg = toNumber(config.fuelLoad, 0);
  const fuelPerKgBenefit = 0.005;
  const fuelBurnPerLap = totalLaps > 0 ? fuelLoadKg / totalLaps : 0;
  const pitStopLoss = toNumber(config.pitStopLoss, 0);
  const trackDegFactor = getTrackDegFactor(config);
  const maxStintLap = toInt(config.maxStintLap, 35) || 35;
  const rejectThresholdSec = toNumber(config.degThreshold, 8);

  const nominalLife = Object.fromEntries(compoundKeys.map(k => [k,
    (k==='Soft'?20:k==='Medium'?30:k==='Hard'?40:k==='Intermediate'?35:50)
  ]));

  // memo lap times to avoid recalculating exponent & fuel terms.
  const maxLifeAll = Math.max(...Object.values(nominalLife));
  const memo = {}; for (const c of compoundKeys){ memo[c] = Array.from({length: totalLaps+2}, () => new Array(maxLifeAll+2).fill(undefined)); }
  function lapTimeFast(comp, lap, age){
    if (lap>totalLaps) return 0;
    const life = nominalLife[comp]; if (age>life) age=life;
    if (!memo[comp][lap]) memo[comp][lap] = new Array(maxLifeAll+2).fill(undefined);
    const cached = memo[comp][lap][age]; if (cached!==undefined) return cached;
    const { baseOffset } = compoundModels[comp];
    const { time, invalid } = calcLapTimeWithWear({
      compound: comp,
      age,
      baseLapTime,
      baseOffset,
      totalLaps,
      lapGlobal: lap,
      fuelLoadKg,
      fuelPerKgBenefit,
      trackDegFactor,
      maxStintLap,
      rejectThresholdSec,
    });
    const raw = invalid ? Number.POSITIVE_INFINITY : time;
    memo[comp][lap][age] = raw; return raw;
  }

  function runDPVariant(maxStops, minStintAdjust=0){
    const MIN_STINT = Math.max(2, Math.min(10, Math.floor(totalLaps/12))) + minStintAdjust;
    const dp = new Map();
    const key = (lap, comp, age, stops) => lap+'|'+comp+'|'+age+'|'+stops;
    function solve(lap, comp, age, stopsUsed){
      if (lap>totalLaps) return 0;
      const k=key(lap, comp, age, stopsUsed); const hit=dp.get(k); if(hit) return hit.time;
      const currentLapTime = lapTimeFast(comp, lap, age);
      let best = currentLapTime + solve(lap+1, comp, age+1, stopsUsed);
      let action='continue', nextComp=comp;
      const remaining = totalLaps - lap + 1;
      if (stopsUsed < maxStops && age >= MIN_STINT && remaining > MIN_STINT){
        for (const cand of compoundKeys){
          const alt = currentLapTime + pitStopLoss + lapTimeFast(cand, lap+1, 1) + solve(lap+1, cand, 1, stopsUsed+1);
          if (alt + 1e-9 < best){ best=alt; action='pit'; nextComp=cand; }
        }
      }
      dp.set(k,{time:best,action,nextComp});
      return best;
    }
    function reconstruct(startComp){
      const stints=[]; const pitLaps=[]; let lap=1; let comp=startComp; let age=1; let stopsUsed=0;
      let current={stint:1, compound:comp, laps:0};
      while(lap<=totalLaps){
        solve(lap, comp, age, stopsUsed);
        const state=dp.get(key(lap, comp, age, stopsUsed));
        current.laps +=1;
        if(state.action==='pit' && lap<totalLaps){
          stints.push(current); pitLaps.push(lap); comp=state.nextComp; age=1; stopsUsed+=1;
          current={stint:stints.length+1, compound:comp, laps:0};
        } else { age+=1; }
        lap+=1;
      }
      stints.push(current);
      return { stints, pitLaps, stops: pitLaps.length, dpStates: dp.size, minStint: MIN_STINT };
    }
    let bestStrategy=null;
    for(const start of compoundKeys){
      const totalTime = solve(1, start, 1, 0);
      const recon = reconstruct(start);
      // enforce two-compound rule when applicable
      if (requireTwoCompounds) {
        const used = new Set(recon.stints.map(s => s.compound));
        if (used.size < 2) {
          // construct best two-compound 1-stop replacement by enumerating pit lap & second compound.
          const firstComp = recon.stints[0].compound;
          let bestEnum = null;
          for (const alt of compoundKeys) {
            if (alt === firstComp) continue;
            for (let pitLap = MIN_STINT; pitLap <= totalLaps - MIN_STINT; pitLap++) {
              // compute total time splitting at pitLap
              let t1 = 0; for (let L=1; L<=pitLap; L++) t1 += lapTimeFast(firstComp, L, L);
              let t2 = 0; for (let L=pitLap+1; L<=totalLaps; L++) { const age = L - pitLap; t2 += lapTimeFast(alt, L, age); }
              const total = t1 + pitStopLoss + t2;
              if (!bestEnum || total < bestEnum.total) {
                bestEnum = { pitLap, alt, total, firstComp };
              }
            }
          }
          if (bestEnum) {
            recon.stints = [
              { stint:1, compound: bestEnum.firstComp, laps: bestEnum.pitLap },
              { stint:2, compound: bestEnum.alt, laps: totalLaps - bestEnum.pitLap }
            ];
            recon.pitLaps = [bestEnum.pitLap];
          } else {
            continue; // could not build valid two-compound split
          }
        }
      }
      const strat = simulateStrategy(config, { stints: recon.stints, stops: recon.stops }, compoundModels);
      if (!strat) continue; // invalid due to tyre penalty threshold exceeded
      strat.pitLaps = recon.pitLaps; strat.totalTime = Number(totalTime.toFixed(3));
      strat.meta = { variantMaxStops:maxStops, dpStates: recon.dpStates, minStint: recon.minStint };
      if(!bestStrategy || strat.totalTime < bestStrategy.totalTime) bestStrategy = strat;
    }
    return bestStrategy;
  }

  const targetStops = [1,2,3];
  // helper to capitalise compound name
  const cap = (s) => s ? (String(s).charAt(0).toUpperCase() + String(s).slice(1).toLowerCase()) : s;
  // build a DP strategy object (with lapSeries) from strict best result
  function buildFromStrict(strictBest){
    if (!strictBest) return null;
    const totalLaps = toInt(config.totalLaps, 0);
    const fuelLoadKg = toNumber(config.fuelLoad, 0);
    const fuelPerKgBenefit = 0.005;
    const baseLapTime = toNumber(config.baseLapTime, 0);
    const burnPerLap = totalLaps > 0 ? fuelLoadKg / totalLaps : 0;
    const lapSeries = [];
    let globalLap = 1;
    for (let s=0; s<strictBest.stints.length; s++){
      const stint = strictBest.stints[s];
      const compKey = String(stint.compound || '').toLowerCase();
      const tyre = strictOpt.tyreData[compKey];
      const len = (stint.to - stint.from + 1);
      for (let i=1; i<=len; i++){
        const wearPenalty = (tyre.wearBase * i) + (tyre.wearGrowth * Math.pow(i, 1.7));
        const currentFuel = Math.max(0, fuelLoadKg - burnPerLap * (globalLap - 1));
        const fuelBenefit = fuelPerKgBenefit * (fuelLoadKg - globalLap);
        const time = baseLapTime + tyre.baseOffset + wearPenalty - fuelBenefit;
        lapSeries.push({
          lap: globalLap,
          time: Number(time.toFixed(3)),
          tyrePenalty: Number(wearPenalty.toFixed(3)),
          fuelLoad: Number(currentFuel.toFixed(3)),
          compound: cap(stint.compound),
          stintIndex: s,
          stintLap: i,
        });
        globalLap += 1;
      }
    }
    const stintsDp = strictBest.stints.map((st, i) => ({ stint: i+1, compound: cap(st.compound), laps: (st.to - st.from + 1) }));
    return {
      stints: stintsDp,
      pitLaps: strictBest.pitLaps.slice(),
      totalTime: strictBest.totalTime,
      lapSeries,
      stops: strictBest.pitLaps.length,
    };
  }

  // compute best per stop count (1,2,3) using DP, fill any missing with strict fallback.
  const bestByStops = {};
  for (const s of targetStops) {
    let strat = runDPVariant(s);
    if (!strat) {
      // strict fallback for this specific stop count
      try {
        const totalLaps = toInt(config.totalLaps, 0);
        const pitCombos = strictOpt.generatePitCombos(totalLaps, s);
        const stintCount = s + 1;
        // generate tyre assignments with at least two compounds
        const keys = Object.keys(strictOpt.tyreData);
        const tyreAssignments = [];
        (function backtrack(idx, acc){
          if (idx === stintCount){ const distinct = new Set(acc); if (distinct.size >= 2) tyreAssignments.push(acc.slice()); return; }
          for (let k=0;k<keys.length;k++){ acc.push(keys[k]); backtrack(idx+1, acc); acc.pop(); }
        })(0, []);
        const params = {
          totalLaps: totalLaps,
          baseLapTime: toNumber(config.baseLapTime, 0),
          pitStopLoss: toNumber(config.pitStopLoss, 0),
          initialFuel: toNumber(config.fuelLoad, 0),
          fuelPerKgBenefit: 0.005,
        };
        let bestStrict = null;
        // evaluate across all pit windows and tyre assignments
        for (let pi=0; pi<pitCombos.length; pi++){
          const pits = pitCombos[pi];
          for (let ci=0; ci<tyreAssignments.length; ci++){
            const combo = tyreAssignments[ci];
            const sim = strictOpt.evaluateStrategy(params, pits, combo);
            if (!sim) continue;
            if (!bestStrict || sim.totalTime < bestStrict.totalTime - 1e-9) bestStrict = sim;
          }
        }
        if (bestStrict) {
          strat = buildFromStrict(bestStrict);
        }
      } catch (_) {}
    }
    if (strat){
      strat.actualStops = strat.pitLaps.length;
      strat.targetStops = s;
      bestByStops[s] = strat;
    }
  }
  // determine overall best among the available ones
  let overallBest = null;
  Object.values(bestByStops).forEach((st) => { if (!overallBest || st.totalTime < overallBest.totalTime) overallBest = st; });
  return { best: bestByStops, overallBest, meta: { algorithm:'multi-dp-constrained-wear+strict-fallback', variants: Object.keys(bestByStops).length } };
}

module.exports = { generateStrategies };