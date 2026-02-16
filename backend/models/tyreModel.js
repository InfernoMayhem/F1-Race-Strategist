// this file handles the physics and behaviour of the tyre compounds so they can formulate more accurate strategies

// base offset values for each tyre compound - the speed difference between the different tyre compounds when they are fresh
const BASE_COMPOUNDS = {
  Soft:   { baseOffset: -0.75 },
  Medium: { baseOffset:  0.0 },
  Hard:   { baseOffset:  0.25 },
  Intermediate: { baseOffset: 2.0 },
  Wet: { baseOffset: 5.0 },
};

// wear parameters for each compound to control how they degrade over laps
const WEAR_PARAMS = {
  Soft:   { linear: 0.08, wearStart: 6,  beta: 0.10, gamma: 0.20, cliffStart: 16, cliffBeta: 0.20, cliffGamma: 0.25 },
  Medium: { linear: 0.05, wearStart: 10, beta: 0.08, gamma: 0.18, cliffStart: 24, cliffBeta: 0.14, cliffGamma: 0.22 },
  Hard:   { linear: 0.025, wearStart: 16, beta: 0.05, gamma: 0.15, cliffStart: 38, cliffBeta: 0.08, cliffGamma: 0.18 },
  Intermediate: { linear: 0.06, wearStart: 8,  beta: 0.08, gamma: 0.18, cliffStart: 20, cliffBeta: 0.14, cliffGamma: 0.22 },
  Wet: { linear: 0.03, wearStart: 12, beta: 0.05, gamma: 0.14, cliffStart: 28, cliffBeta: 0.10, cliffGamma: 0.18 },
};

// calculate a multiplier from the eninvironment based on track conditions and temperature
function getEnvDegFactor(config) {
  if (!config) return 1.0;
  // standardise the degradation variable so it always is accepted
  let degLevel = (config.degradation || 'Medium').toLowerCase();
  
  // get the temperature
  let temperature = Number(config.temperature) || 20;
  
  // set the initial factor based on the degradation category
  let factor = 1.0;
  if (degLevel === 'high') { // if the degradation level is high then increase the tyre wear by a factor of 1.5
    factor = 1.5;
  } else if (degLevel === 'low') { // the same but for low deg, instead reducing it to 0.7
    factor = 0.7;
  } else {
    factor = 1.0; // default value of 1 for medium deg
  }

  // if the temperature exceeds 30 degrees, then a bonus multipler is added to the tyre wear calculations
  if (temperature >= 30) {
    factor *= 1.1;
  }
  if (temperature >= 35) { // larger multiplier for higher temps
    factor *= 1.15;
  }
  if (temperature >= 40) { // largest multiplier for the highest temps
    factor *= 1.2;
  }

  // ensure the factor stays within reasonable bounds as a sanity check (between 0.5 and 2.5)
  return Math.max(0.5, Math.min(2.5, factor));
}

// calculate the time penalty added to a lap time due to tyre wear
function tyreWearPenalty(compound, stintLapAge, trackDegFactor, maxStintLap) {
  // get the specific wear parameters for this compound
  const params = WEAR_PARAMS[compound]
  const age = Math.max(1, stintLapAge);
  
  // linear calculation
  let totalWearPenalty = params.linear * age; 
  
  // exponential calculation
  if (age > params.wearStart) {
    totalWearPenalty += params.beta * (Math.exp(params.gamma * (age - params.wearStart)) - 1);
  }

  // cliff calculation
  if (age > params.cliffStart) {
    totalWearPenalty += params.cliffBeta * (Math.exp(params.cliffGamma * (age - params.cliffStart)) - 1);
  }

  // overlimit calculation
  if (age > maxStintLap) {
    totalWearPenalty += Math.pow(1.25, age - maxStintLap) * 5;
  }

  // apply the track degradation multiplier to the total penalty
  return totalWearPenalty * trackDegFactor;
}

// calculate how much faster the car is due to burning off fuel weight
function fuelAdvantage(fuelBurnedKg, fuelPerKgBenefit) {
  // ensure negative fuel isn't calculated
  return fuelPerKgBenefit * Math.max(0, fuelBurnedKg);
}

// calculate the final estimated lap time considering all factors incl. base lap time, tyre wear, fuel load
function calcLapTimeWithWear({
  compound,
  age,
  baseLapTime,
  baseOffset = 0,
  totalLaps,
  lapGlobal,
  fuelLoadKg,
  fuelPerKgBenefit,
  trackDegFactor,
  maxStintLap,
  rejectThresholdSec,
  outLapPenalty,
}) {
  // calculate how much fuel is burned per lap on average
  const burnPerLap = totalLaps > 0 ? fuelLoadKg / totalLaps : 0;
  
  // calculate total fuel burned up to the start of this lap
  const burnedKg = burnPerLap * (lapGlobal - 1);
  
  // calculate time gained from being lighter
  const fuelGain = fuelAdvantage(burnedKg, fuelPerKgBenefit);
  
  // calculate time lost due to tyre wear
  const wearPenalty = tyreWearPenalty(compound, age, trackDegFactor, maxStintLap);
  
  // mark lap as invalid if the wear is too high
  const isTooSlow = wearPenalty > rejectThresholdSec;
  
  // add extra time if this is the first lap on these tyres (outlap)
  const warmupPenalty = (age === 1) ? outLapPenalty : 0;

  // add all components, the base time + compound offset + wear + outlap - fuel benefit
  let lapTime = baseLapTime + baseOffset + wearPenalty + warmupPenalty - fuelGain;

  if (isTooSlow) {
    lapTime = Number.POSITIVE_INFINITY; // makes the lap infinite to make it invalid and therefore won't be used
  }

  return { 
    time: lapTime, 
    wearPenalty: wearPenalty, 
    invalid: isTooSlow 
  };
}

module.exports = {
  BASE_COMPOUNDS,
  WEAR_PARAMS,
  getTrackDegFactor: getEnvDegFactor,
  tyreWearPenalty,
  calcLapTimeWithWear,
};
