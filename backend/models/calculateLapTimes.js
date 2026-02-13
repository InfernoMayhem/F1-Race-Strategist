// this file calculates the lap times if the driver never pits, acting as a baseline for actual strategies to be compared to

function calculateLapTimes(raceConfiguration, modelParameters = {}) {
  // converts the frontends config strings back into numbers which can be used for the calculations
  const numberOfLaps = parseInt(raceConfiguration.totalLaps, 10);
  const baseLapTimeSeconds = Number(raceConfiguration.baseLapTime);
  const initialFuelLoadKg = Number(raceConfiguration.fuelLoad);

  // If the data is invalid, return empty or zeroed arrays
  if (isNaN(numberOfLaps) || numberOfLaps <= 0) {
    return [];
  }
  if (isNaN(baseLapTimeSeconds) || baseLapTimeSeconds <= 0) {
    // Return an array of zeros if we can't calculate real times
    const zeroedLaps = [];
    for (let i = 0; i < numberOfLaps; i++) {
        zeroedLaps.push(0);
    }
    return zeroedLaps;
  }

  // Extract tyre wear parameters, or use defaults if they aren't provided
  let degradationBase = 0.05;
  if (modelParameters.tyreWearBaseSec !== undefined) {
      degradationBase = Number(modelParameters.tyreWearBaseSec);
  }

  let degradationGrowthFactor = 0.03;
  if (modelParameters.tyreWearGrowth !== undefined) {
      degradationGrowthFactor = Number(modelParameters.tyreWearGrowth);
  }
  
  // Calculate the time benefit per kg of fuel burned
  let timeGainPerKgOfFuel = 0.005;
  if (modelParameters.fuelPerKgBenefit !== undefined) {
      timeGainPerKgOfFuel = Number(modelParameters.fuelPerKgBenefit);
  } else if (modelParameters.fuelPerKgPenalty !== undefined) {
      timeGainPerKgOfFuel = Number(modelParameters.fuelPerKgPenalty);
  }

  // Calculate how much fuel we use per lap
  let fuelBurnPerLapInKg = 0;
  if (numberOfLaps > 0) {
      fuelBurnPerLapInKg = initialFuelLoadKg / numberOfLaps;
  }

  const calculatedLapTimes = [];
  
  // Iterate through every lap of the race
  for (let currentLapNumber = 1; currentLapNumber <= numberOfLaps; currentLapNumber++) {
    
    // 1. Calculate the time lost due to old tyres
    let timeLostToTyreWear = 0;
    
    if (degradationGrowthFactor === 0) {
        // If there is no compounding growth, it's just linear
        timeLostToTyreWear = degradationBase * currentLapNumber;
    } else {
        // Otherwise, use the standard geometric series sum formula
        // to find the cumulative wear effect for this specific lap
        const growthMultiplier = 1 + degradationGrowthFactor;
        const exponentialFactor = Math.pow(growthMultiplier, currentLapNumber);
        timeLostToTyreWear = degradationBase * (exponentialFactor - 1) / degradationGrowthFactor;
    }

    // 2. Calculate the time gained due to lower fuel weight
    // Note: On lap 1, we have burned 0 fuel at the start line (roughly)
    const lapsCompletedPreviously = currentLapNumber - 1;
    const totalFuelBurnedSoFar = fuelBurnPerLapInKg * lapsCompletedPreviously;
    const timeGainedFromFuel = timeGainPerKgOfFuel * totalFuelBurnedSoFar;

    // 3. Combine everything
    const finalLapTime = baseLapTimeSeconds + timeLostToTyreWear - timeGainedFromFuel;
    
    // Round to 3 decimal places for cleaner output
    const fixedString = finalLapTime.toFixed(3);
    calculatedLapTimes.push(Number(fixedString));
  }

  return calculatedLapTimes;
}

module.exports = { calculateLapTimes };
