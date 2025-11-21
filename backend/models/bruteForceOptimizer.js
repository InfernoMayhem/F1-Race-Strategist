"use strict";

// brute-force f1 strategy optimiser
// calculates lap times with exponential tyre degradation and non-linear fuel advantage

const { BASE_COMPOUNDS, getTrackDegFactor, tyreWearPenalty } = require('./tyreModel');
const DEFAULT_SLICK_COMPOUNDS = {
  Soft:   { ...BASE_COMPOUNDS.Soft,   minLife: 5,  maxLife: 20 },
  Medium: { ...BASE_COMPOUNDS.Medium, minLife: 8,  maxLife: 30 },
  Hard:   { ...BASE_COMPOUNDS.Hard,   minLife: 10, maxLife: 40 },
};

function toNumber(v, fb) { const n = Number(v); return Number.isFinite(n) ? n : fb; }
function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }

// strategy search //

function generatePitWindows(totalLaps, minStint, maxStint) {
  // infer min/max from global slick compound bounds if omitted
  if (minStint == null || maxStint == null) {
    const mins = Object.values(DEFAULT_SLICK_COMPOUNDS).map(t => t.minLife);
    const maxs = Object.values(DEFAULT_SLICK_COMPOUNDS).map(t => t.maxLife);
    minStint = Math.min(...mins);
    maxStint = Math.max(...maxs);
  }
  // constraints: no pit on lap 1 or last lap, each stint length in [minStint, maxStint]
  const windows = [];
  const firstMin = minStint;
  const firstMax = Math.min(maxStint, totalLaps - minStint - minStint);
  for (let p1 = firstMin; p1 <= firstMax; p1++) {
    if (p1 <= 0 || p1 >= totalLaps) continue;
    const stint1 = p1;
    if (stint1 < minStint || stint1 > maxStint) continue;
    // p2 range such that stint2 and stint3 respect [min,max]
    const p2Min = p1 + minStint;
    const p2Max = Math.min(p1 + maxStint, totalLaps - minStint);
    for (let p2 = p2Min; p2 <= p2Max; p2++) {
      if (p2 <= 0 || p2 >= totalLaps) continue;
      const stint2 = p2 - p1;
      const stint3 = totalLaps - p2;
      if (stint2 < minStint || stint2 > maxStint) continue;
      if (stint3 < minStint || stint3 > maxStint) continue;
      windows.push([p1, p2]);
    }
  }
  return windows;
}

function generateTyreCombos() {
  // all 3-stint assignments from {soft, medium, hard} with at least 2 distinct compounds
  const keys = Object.keys(DEFAULT_SLICK_COMPOUNDS);
  const combos = [];
  for (const a of keys) for (const b of keys) for (const c of keys) {
    const s = new Set([a,b,c]);
    if (s.size >= 2) combos.push([a,b,c]);
  }
  return combos;
}

// lap time model //

function fuelAdvantageSeconds(fuelBurnedKg, fuelPerKgBenefit) {
  // diminishing returns as more fuel is burned
  const concavity = 0.85;
  const effKg = Math.pow(Math.max(0, fuelBurnedKg), concavity);
  return fuelPerKgBenefit * effKg;
}

function calcLapTime({ baseLapTime, tyreModel, lapGlobal, lapInStint, totalLaps, fuelLoadKg, fuelPerKgBenefit, trackDegFactor, maxStintLap, rejectThresholdSec }) {
  const burnPerLap = totalLaps > 0 ? fuelLoadKg / totalLaps : 0;
  const burnedKg = burnPerLap * (lapGlobal - 1);
  const fuelGain = fuelAdvantageSeconds(burnedKg, fuelPerKgBenefit);
  const wearPenalty = tyreWearPenalty(tyreModel.name, lapInStint, trackDegFactor, maxStintLap);
  if (wearPenalty > rejectThresholdSec) return Number.POSITIVE_INFINITY;
  const raw = baseLapTime + tyreModel.baseOffset + wearPenalty - fuelGain;
  return raw;
}

// simulation core //

function simulateRace(config, pitLaps, compounds) {
  // config requires: totalLaps, baseLapTime, fuelLoad, pitStopLoss
  const totalLaps = toNumber(config.totalLaps, 0);
  const baseLapTime = toNumber(config.baseLapTime, 0);
  const fuelLoadKg = toNumber(config.fuelLoad, 0);
  const pitStopLoss = toNumber(config.pitStopLoss, 0);
  const fuelPerKgBenefit = 0.005;
  const compoundModels = DEFAULT_SLICK_COMPOUNDS;
  const trackDegFactor = getTrackDegFactor(config);
  const maxStintLap = toNumber(config.maxStintLap, 35) || 35;
  const rejectThresholdSec = toNumber(config.degThreshold, 8);

  // derive stint boundaries
  const p1 = pitLaps[0];
  const p2 = pitLaps[1];
  const stintLengths = [p1, p2 - p1, totalLaps - p2];

  // per-tyre life validation (reject if any stint exceeds tyre max or under min)
  for (let i = 0; i < 3; i++) {
    const t = compoundModels[compounds[i]];
    const len = stintLengths[i];
    if (!t || len < t.minLife || len > t.maxLife) return null;
  }

  // at least two distinct compounds
  if (new Set(compounds).size < 2) return null;

  // run lap-by-lap
  let totalTime = 0;
  const lapSeries = [];
  let globalLap = 1;
  for (let s = 0; s < 3; s++) {
    const comp = compounds[s];
    const tyreModel = compoundModels[comp];
    const stintLen = stintLengths[s];
    for (let i = 1; i <= stintLen; i++) {
  const t = calcLapTime({ baseLapTime, tyreModel: { ...tyreModel, name: comp }, lapGlobal: globalLap, lapInStint: i, totalLaps, fuelLoadKg, fuelPerKgBenefit, trackDegFactor, maxStintLap, rejectThresholdSec });
  if (!Number.isFinite(t)) return null; // invalid due to wear threshold
      totalTime += t;
      lapSeries.push({ lap: globalLap, time: Number(t.toFixed(3)), compound: comp, stintIndex: s, stintLap: i });
      globalLap += 1;
    }
    if (s < 2) totalTime += pitStopLoss; // add between stints only
  }
  return { totalTime: Number(totalTime.toFixed(3)), lapSeries, stintLengths };
}

// orchestration //

function findOptimal(config) {
  const totalLaps = toNumber(config.totalLaps, 0);
  if (!Number.isFinite(totalLaps) || totalLaps < 10) {
    throw new Error("totalLaps must be >= 10 for 2-stop enumeration");
  }
  // use global min/max stint bounds from slick compounds to ensure feasibility space
  const minStint = Math.min(...Object.values(DEFAULT_SLICK_COMPOUNDS).map(t => t.minLife));
  const maxStint = Math.max(...Object.values(DEFAULT_SLICK_COMPOUNDS).map(t => t.maxLife));
  const pitWindows = generatePitWindows(totalLaps, minStint, maxStint);
  const tyreCombos = generateTyreCombos();

  let best = null;
  for (const pits of pitWindows) {
    for (const combo of tyreCombos) {
      const sim = simulateRace(config, pits, combo);
      if (!sim) continue; // invalid due to tyre life per stint
      if (!best || sim.totalTime < best.totalTime - 1e-9) {
        best = {
          pit_laps: pits,
          compounds: combo,
          total_time: sim.totalTime,
          stints: [
            { compound: combo[0], length: sim.stintLengths[0] },
            { compound: combo[1], length: sim.stintLengths[1] },
            { compound: combo[2], length: sim.stintLengths[2] },
          ],
          lapSeries: sim.lapSeries,
        };
      }
    }
  }
  if (!best) throw new Error("No valid strategy found");
  return best;
}

module.exports = {
  DEFAULT_SLICK_COMPOUNDS,
  generatePitWindows,
  generateTyreCombos,
  calcLapTime,
  simulateRace,
  findOptimal,
};
