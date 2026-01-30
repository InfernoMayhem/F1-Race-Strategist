"use strict";

// base compound characteristics
const BASE_COMPOUNDS = {
  Soft:   { baseOffset: -0.75 },
  Medium: { baseOffset:  0.0 },
  Hard:   { baseOffset:  0.25 },
  Intermediate: { baseOffset: 2.0 },
  Wet: { baseOffset: 5.0 },
};

// wear params
const WEAR_PARAMS = {
  Soft:   { linear: 0.08, wearStart: 6,  beta: 0.10, gamma: 0.20, cliffStart: 16, cliffBeta: 0.20, cliffGamma: 0.25 },
  Medium: { linear: 0.05, wearStart: 10, beta: 0.08, gamma: 0.18, cliffStart: 24, cliffBeta: 0.14, cliffGamma: 0.22 },
  Hard:   { linear: 0.025, wearStart: 16, beta: 0.05, gamma: 0.15, cliffStart: 38, cliffBeta: 0.08, cliffGamma: 0.18 },
  Intermediate: { linear: 0.06, wearStart: 8,  beta: 0.08, gamma: 0.18, cliffStart: 20, cliffBeta: 0.14, cliffGamma: 0.22 },
  Wet: { linear: 0.03, wearStart: 12, beta: 0.05, gamma: 0.14, cliffStart: 28, cliffBeta: 0.10, cliffGamma: 0.18 },
};

function toNumber(v, fb) { const n = Number(v); return Number.isFinite(n) ? n : fb; }

function getTrackDegFactor(config) {
  const degLevel = (config.degradation || "Medium").toString().toLowerCase();
  const temp = toNumber(config.temperature, 25);
  let factor = 1.0;
  
  if (degLevel === 'high') factor = 1.5;
  else if (degLevel === 'low') factor = 0.7;
  else factor = 1.0; // Medium

  // temperature effect
  if (temp >= 30) factor *= 1.1;
  if (temp >= 35) factor *= 1.15;
  if (temp >= 40) factor *= 1.2;
  return Math.max(0.5, Math.min(2.5, factor));
}

// tyre wear calculator
function tyreWearPenalty(compound, stintLapAge, trackDegFactor = 1.0, maxStintLap = 35) {
  const p = WEAR_PARAMS[compound] || WEAR_PARAMS.Medium;
  const age = Math.max(1, stintLapAge);
  
  let penalty = p.linear * age; // base
  
  // exponential
  if (age > p.wearStart) {
    penalty += p.beta * (Math.exp(p.gamma * (age - p.wearStart)) - 1);
  }
  // cliff
  if (age > p.cliffStart) {
    penalty += p.cliffBeta * (Math.exp(p.cliffGamma * (age - p.cliffStart)) - 1);
  }
  // max stint penalty
  if (age > maxStintLap) {
    penalty += Math.pow(1.25, age - maxStintLap) * 5;
  }
  return penalty * trackDegFactor;
}

// fuel effect
function fuelAdvantageSecondsLinear(fuelBurnedKg, fuelPerKgBenefit) {
  return fuelPerKgBenefit * Math.max(0, fuelBurnedKg);
}

// lap calculator
function calcLapTimeWithWear({
  compound,
  age,
  baseLapTime,
  baseOffset = 0,
  totalLaps,
  lapGlobal,
  fuelLoadKg,
  fuelPerKgBenefit = 0.005,
  trackDegFactor = 1.0,
  maxStintLap = 35,
  rejectThresholdSec = 8,
  outLapPenalty = 0,
}) {
  const burnPerLap = totalLaps > 0 ? fuelLoadKg / totalLaps : 0;
  const burnedKg = burnPerLap * (lapGlobal - 1);
  const fuelGain = fuelAdvantageSecondsLinear(burnedKg, fuelPerKgBenefit);
  const wearPenalty = tyreWearPenalty(compound, age, trackDegFactor, maxStintLap);
  const invalid = wearPenalty > rejectThresholdSec;
  
  // out lap penalty
  const warmup = (age === 1) ? outLapPenalty : 0;

  const time = invalid ? Number.POSITIVE_INFINITY
                       : baseLapTime + baseOffset + wearPenalty + warmup - fuelGain;
  return { time, wearPenalty, invalid };
}

module.exports = {
  BASE_COMPOUNDS,
  WEAR_PARAMS,
  getTrackDegFactor,
  tyreWearPenalty,
  calcLapTimeWithWear,
};
