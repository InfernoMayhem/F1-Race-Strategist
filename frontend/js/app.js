import { $ } from './dom.js';
import { apiFetch } from './api.js';
import { validateAll as validateAllFields, validateField as validateOneField } from './validation.js';
import { renderStrategyCharts } from './charts.js';
import { renderStrategyCards, setStrategyStatus } from './strategies.js';
import { initConfigModalBindings } from './modal.js';
import { setRaceSetupTitle, currentLoadedConfigName, isPopulatingForm, setCurrentLoadedConfigName } from './state.js';

// helper function to manage the global loading spinner overlay
function showLoading(text){
  const overlay = document.getElementById('loadingOverlay');
  const label = document.getElementById('loadingText');
  if (label && text) label.textContent = text;
  if (overlay) overlay.classList.remove('hidden');
}

function hideLoading(){
  const overlay = document.getElementById('loadingOverlay');
  if (overlay) overlay.classList.add('hidden');
}

// simple diagnostics check to verify backend connectivity
const testBtn = $("testBtn");
if (testBtn) {
  testBtn.addEventListener("click", async () => {
    const out = $("output");
    if (out) out.textContent = "Testing…";
    try {
      const res = await apiFetch("/api/hello");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (out) out.textContent = data?.message || "OK";
    } catch (e) {
      console.error(e);
      if (out) out.textContent = "Error connecting to backend.";
    }
  });
}

// main application logic
const form = $("raceForm");
if (form) {
  const validateField = (id) => validateOneField(id);
  const validateAll = () => validateAllFields();

  // listen for real-time input changes to validate fields immediately
  form.addEventListener("input", (e) => {
    const t = e.target;
    if (t && t.id) validateField(t.id);
    
    // clear the title to indicate it's now a custom unsaved setup
    if (!isPopulatingForm && currentLoadedConfigName) {
      setCurrentLoadedConfigName(null);
      setRaceSetupTitle();
    }
  });
  
  // also check on change events
  form.addEventListener("change", (e) => {
    const t = e.target;
    if (t && t.id) validateField(t.id);
    if (!isPopulatingForm && currentLoadedConfigName) {
      setCurrentLoadedConfigName(null);
      setRaceSetupTitle();
    }
  });

  // display the raw lap time calculation results
  const renderResults = (laps) => {
    const results = $("resultsOutput");
    if (!results) return;
    if (!Array.isArray(laps) || laps.length === 0) {
      results.textContent = "No laps returned.";
      return;
    }
    const n = laps.length;
    const min = Math.min(...laps);
    const max = Math.max(...laps);
    const avg = laps.reduce((a, b) => a + b, 0) / n;
    const previewCount = Math.min(10, n);
    const preview = laps.slice(0, previewCount)
      .map((t, i) => `Lap ${i + 1}: ${t.toFixed(3)}s`).join("\n");

    results.textContent = [
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
    showLoading('Optimising strategies…');
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
      hideLoading();
    }
  }


  // main form submission handler, run simulation
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    
    // run full validation
    const errors = validateAll();
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
      showLoading('Saving and calculating…');
      
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
      renderResults(calcData.laps || []);

      // generate optimised strategies
      await fetchAndRenderStrategies(window.raceConfig);
    } catch (err) {
      console.error("Failed to save raceConfig", err);
      if (results) results.textContent = "Failed to save race configuration.";
    } finally {
      hideLoading();
    }
  });
}

// initialise the modal system once the DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  initConfigModalBindings();
});
