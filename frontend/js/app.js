import { $ } from './dom.js';
import { apiFetch } from './api.js';
import { validateAll as validateAllFields, validateField as validateOneField } from './validation.js';
import { renderStrategyCharts } from './charts.js';
import { renderStrategyCards, setStrategyStatus } from './strategies.js';
import { initConfigModalBindings } from './modal.js';
import { setRaceSetupTitle, currentLoadedConfigName, isPopulatingForm, setCurrentLoadedConfigName } from './state.js';

// Helper to control the visibility of the loading spinner
function showLoadingSpinner(messageText){
  const overlayElement = document.getElementById('loadingOverlay');
  const messageElement = document.getElementById('loadingText');
  
  if (messageElement && messageText) {
      messageElement.textContent = messageText;
  }
  
  if (overlayElement) {
      overlayElement.classList.remove('hidden');
  }
}

function hideLoadingSpinner(){
  const overlayElement = document.getElementById('loadingOverlay');
  if (overlayElement) {
      overlayElement.classList.add('hidden');
  }
}

// Check backend connectivity when the test button is clicked
const connectionTestButton = $("testBtn");
if (connectionTestButton) {
  connectionTestButton.addEventListener("click", async () => {
    const outputElement = $("output");
    if (outputElement) outputElement.textContent = "Testing…";
    
    try {
      const response = await apiFetch("/api/hello");
      if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
      }
      
      const responseData = await response.json();
      if (outputElement) {
          outputElement.textContent = responseData?.message || "OK";
      }
    } catch (err) {
      console.error(err);
      if (outputElement) {
          outputElement.textContent = "Error connecting to backend.";
      }
    }
  });
}

// Main application logic initialization
const raceConfigForm = $("raceForm");
if (raceConfigForm) {
  const validateFieldWrapper = (fieldId) => validateOneField(fieldId);
  const validateAllWrapper = () => validateAllFields();

  // Listen for real-time input changes to validate fields immediately
  raceConfigForm.addEventListener("input", (event) => {
    const targetElement = event.target;
    if (targetElement && targetElement.id) {
        validateFieldWrapper(targetElement.id);
    }
    
    // Reset the configuration title if the user modifies a loaded preset
    // This indicates it's now a custom, unsaved setup
    if (!isPopulatingForm && currentLoadedConfigName) {
      setCurrentLoadedConfigName(null);
      setRaceSetupTitle();
    }
  });
  
  // Also perform validation on 'change' events (e.g. for dropdowns)
  raceConfigForm.addEventListener("change", (event) => {
    const targetElement = event.target;
    if (targetElement && targetElement.id) {
        validateFieldWrapper(targetElement.id);
    }
    
    if (!isPopulatingForm && currentLoadedConfigName) {
      setCurrentLoadedConfigName(null);
      setRaceSetupTitle();
    }
  });

  // Display the raw lap time calculation results in the debug output area
  const renderResultsOutput = (laps) => {
    const resultsArea = $("resultsOutput");
    if (!resultsArea) return;
    if (!Array.isArray(laps) || laps.length === 0) {
      resultsArea.textContent = "No laps returned.";
      return;
    }
    const n = laps.length;
    const min = Math.min(...laps);
    const max = Math.max(...laps);
    const avg = laps.reduce((a, b) => a + b, 0) / n;
    const previewCount = Math.min(10, n);
    const preview = laps.slice(0, previewCount)
      .map((t, i) => `Lap ${i + 1}: ${t.toFixed(3)}s`).join("\n");

    resultsArea.textContent = [
      `Total laps: ${n}`,
      `Min: ${min.toFixed(3)}s  Max: ${max.toFixed(3)}s  Avg: ${avg.toFixed(3)}s`,
      "",
      `First ${previewCount} laps:`,
      preview,
      "",
      "All laps:",
      JSON.stringify(laps)
    ].join("\n");
  };

  // state variables for the strategy selection UI
  let strategiesByStops = {};
  let recommendedStops = null; 
  let currentStops = null; 
  let overallBestRef = null;

  // handle user clicking on a strategy card
  function onSelectStops(stops, strategy, card) {
    currentStops = stops;
    
    // update the main chart
    renderStrategyCharts(strategy);
    
    // re-render cards to update the selected highlight state
    renderStrategyCards(strategiesByStops, overallBestRef, currentStops, onSelectStops);
    
    // add a click animation effect
    if (card) { card.style.transform = 'scale(0.99)'; setTimeout(() => (card.style.transform = ''), 120); }
  }

  // fetch optimised strategies from the backend and display them
  async function fetchAndRenderStrategies(config) {
    setStrategyStatus('Optimising strategies…');
    showLoadingSpinner('Optimising strategies…');
    try {
      const res = await apiFetch('/api/generate-strategies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config || {})
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      
      strategiesByStops = data.best || {};
      recommendedStops = data.overallBest?.stops ?? null;
      overallBestRef = data.overallBest || null;
      currentStops = recommendedStops;
      
      // render the summary cards
      renderStrategyCards(strategiesByStops, overallBestRef, currentStops, onSelectStops);

      // determine which strategy to show on the chart by default
      // priority, Overall Best, Current Selection, 3 Stopper, 2 Stopper, 1 Stopper
      const strat = overallBestRef || strategiesByStops[currentStops] || strategiesByStops[3] || strategiesByStops[2] || strategiesByStops[1];
      
      renderStrategyCharts(strat);
      
      if (!strat) setStrategyStatus('No valid strategies found for these inputs.');
    } catch (err) {
      console.error('Failed to fetch strategies', err);
      setStrategyStatus('Failed to fetch strategies. Is the backend running?');
    } finally {
      hideLoadingSpinner();
    }
  }


  // main form submission handler, run simulation
  raceConfigForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    
    // run full validation
    const errors = validateAllWrapper();
    const hasErrors = Object.keys(errors).length > 0;
    const results = $("resultsOutput");
    
    if (hasErrors) {
      alert('Cannot run simulation: The race configuration has invalid fields. Please correct them and try again.');
      if (results) results.textContent = "Please correct the highlighted fields.";
      return;
    }
    
    // construct the configuration object from form inputs
    const raceConfig = {
      totalLaps: $("totalLaps").value,
      trackLength: $("trackLength").value,
      fuelLoad: $("fuelLoad").value,
      degradation: $("degradation").value,
      totalRainfall: $("totalRainfall").value,
      temperature: $("temperature").value,
      baseLapTime: $("baseLapTime").value,
      pitStopLoss: $("pitStopLoss").value,
    };

    try {
      showLoadingSpinner('Saving and calculating…');
      
      // validate and normalise the config via the backend
      const res = await apiFetch("/api/race-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(raceConfig),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      
      // update global state
      window.raceConfig = data.saved || raceConfig;
      console.log("Saved raceConfig:", window.raceConfig);
      
      if (results) results.textContent = "Calculating lap times…";

      // run the basic simulation
      const calcRes = await apiFetch("/api/calculate-laps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(window.raceConfig),
      });
      if (!calcRes.ok) throw new Error(`HTTP ${calcRes.status}`);
      const calcData = await calcRes.json();
      if (!calcData?.ok) throw new Error("Calculation failed");
      renderResultsOutput(calcData.laps || []);

      // generate optimised strategies
      await fetchAndRenderStrategies(window.raceConfig);
    } catch (err) {
      console.error("Failed to save raceConfig", err);
      if (results) results.textContent = "Failed to save race configuration.";
    } finally {
      hideLoadingSpinner();
    }
  });
}

// initialise the modal system once the DOM is ready
const init = () => {
  initConfigModalBindings();
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
