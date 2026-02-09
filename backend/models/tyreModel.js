"use strict";

// define base offset values for each tyre compound
const BASE_COMPOUNDS = {
  Soft:   { baseOffset: -0.75 },
  Medium: { baseOffset:  0.0 },
  Hard:   { baseOffset:  0.25 },
  Intermediate: { baseOffset: 2.0 },
  Wet: { baseOffset: 5.0 },
};

// define wear parameters for each compound to control how they degrade over laps
const WEAR_PARAMS = {
  Soft:   { linear: 0.08, wearStart: 6,  beta: 0.10, gamma: 0.20, cliffStart: 16, cliffBeta: 0.20, cliffGamma: 0.25 },
  Medium: { linear: 0.05, wearStart: 10, beta: 0.08, gamma: 0.18, cliffStart: 24, cliffBeta: 0.14, cliffGamma: 0.22 },
  Hard:   { linear: 0.025, wearStart: 16, beta: 0.05, gamma: 0.15, cliffStart: 38, cliffBeta: 0.08, cliffGamma: 0.18 },
  Intermediate: { linear: 0.06, wearStart: 8,  beta: 0.08, gamma: 0.18, cliffStart: 20, cliffBeta: 0.14, cliffGamma: 0.22 },
  Wet: { linear: 0.03, wearStart: 12, beta: 0.05, gamma: 0.14, cliffStart: 28, cliffBeta: 0.10, cliffGamma: 0.18 },
};

// calculate a multiplier for tyre wear based on track degradation setting and temperature
function getTrackDegFactor(config) {
  // normalise the degradation level string
  const degLevel = (config.degradation || "Medium").toString().toLowerCase();
  
  // get the temperature, defaulting to 25 degrees if missing
  const temperature = config.temperature !== undefined ? Number(config.temperature) : 25;
  
  // set the initial factor based on the degradation category
  let factor = 1.0;
  if (degLevel === 'high') {
    factor = 1.5;
  } else if (degLevel === 'low') {
    factor = 0.7;
  } else {
    factor = 1.0; // medium
  }

  // increase the degradation factor if the temperature is high
  if (temperature >= 30) {
    factor *= 1.1;
  }
  if (temperature >= 35) {
    factor *= 1.15;
  }
  if (temperature >= 40) {
    factor *= 1.2;
  }

  // ensure the factor stays within reasonable bounds (between 0.5 and 2.5)
  return Math.max(0.5, Math.min(2.5, factor));
}

// calculate the time penalty added to a lap time due to tyre wear
function tyreWearPenalty(compound, stintLapAge, trackDegFactor = 1.0, maxStintLap = 35) {
  // get the specific wear parameters for this compound, defaulting to medium if not found
  const params = WEAR_PARAMS[compound] || WEAR_PARAMS.Medium;
  const age = Math.max(1, stintLapAge);
  
  // linear calculation
  let penalty = params.linear * age; 
  
  // exponential calculation
  if (age > params.wearStart) {
    penalty += params.beta * (Math.exp(params.gamma * (age - params.wearStart)) - 1);
  }

  // cliff calculation
  if (age > params.cliffStart) {
    penalty += params.cliffBeta * (Math.exp(params.cliffGamma * (age - params.cliffStart)) - 1);
  }

  // overlimit calculation
  if (age > maxStintLap) {
    penalty += Math.pow(1.25, age - maxStintLap) * 5;
  }

  // apply the track degradation multiplier to the total penalty
  return penalty * trackDegFactor;
}

// calculate how much faster the car is due to burning off fuel weight
function fuelAdvantageSecondsLinear(fuelBurnedKg, fuelPerKgBenefit) {
  // ensure negative fuel isn't calculated
  return fuelPerKgBenefit * Math.max(0, fuelBurnedKg);
}

// calculate the final estimated lap time considering all factors (base time, tyre wear, fuel load)
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
  // calculate how much fuel is burned per lap on average
  const burnPerLap = totalLaps > 0 ? fuelLoadKg / totalLaps : 0;
  
  // calculate total fuel burned up to the start of this lap
  const burnedKg = burnPerLap * (lapGlobal - 1);
  
  // calculate time gained from being lighter
  const fuelGain = fuelAdvantageSecondsLinear(burnedKg, fuelPerKgBenefit);
  
  // calculate time lost due to tyre wear
  const wearPenalty = tyreWearPenalty(compound, age, trackDegFactor, maxStintLap);
  
  // mark lap as invalid if the wear is too high
  const isTooSlow = wearPenalty > rejectThresholdSec;
  
  // add extra time if this is the first lap on these tyres (out-lap)
  const warmupPenalty = (age === 1) ? outLapPenalty : 0;

  // sum all components, base time +/- compound diff + wear + warmup - fuel gain
  const time = isTooSlow 
    ? Number.POSITIVE_INFINITY
    : baseLapTime + baseOffset + wearPenalty + warmupPenalty - fuelGain;
    
  return { 
    time: time, 
    wearPenalty: wearPenalty, 
    invalid: isTooSlow 
  };
}

module.exports = {
  BASE_COMPOUNDS,
  WEAR_PARAMS,
  getTrackDegFactor,
  tyreWearPenalty,
  calcLapTimeWithWear,
};
