import { $ } from './dom.js';
import { apiFetch } from './api.js';
import { validateAll as validateAllFields, validateField as validateOneField } from './validation.js';
import { renderStrategyCharts } from './charts.js';
import { renderStrategyCards, setStrategyStatus } from './strategies.js';
import { initConfigModalBindings } from './modal.js';
import { setRaceSetupTitle, currentLoadedConfigName, isPopulatingForm, setCurrentLoadedConfigName } from './state.js';

// test api
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

// validation and submission
const form = $("raceForm");
if (form) {
  const validateField = (id) => validateOneField(id);
  const validateAll = () => validateAllFields();

  // validation listeners
  form.addEventListener("input", (e) => {
    const t = e.target;
    if (t && t.id) validateField(t.id);
    if (!isPopulatingForm && currentLoadedConfigName) {
      setCurrentLoadedConfigName(null);
      setRaceSetupTitle();
    }
  });
  form.addEventListener("change", (e) => {
    const t = e.target;
    if (t && t.id) validateField(t.id);
    if (!isPopulatingForm && currentLoadedConfigName) {
      setCurrentLoadedConfigName(null);
      setRaceSetupTitle();
    }
  });

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

  let strategiesByStops = {};
  let recommendedStops = null; // used for initial selection
  let currentStops = null; // currently viewed strategy
  let overallBestRef = null;

  function onSelectStops(stops, strategy, card) {
    currentStops = stops;
    renderStrategyCharts(strategy);
    // re-render to update selection highlight
    renderStrategyCards(strategiesByStops, overallBestRef, currentStops, onSelectStops);
    if (card) { card.style.transform = 'scale(0.99)'; setTimeout(() => (card.style.transform = ''), 120); }
  }

  

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
      renderStrategyCards(strategiesByStops, overallBestRef, currentStops, onSelectStops);

  // default view
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


  // submit handler
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const errors = validateAll();
    const hasErrors = Object.keys(errors).length > 0;
    const results = $("resultsOutput");
    if (hasErrors) {
      alert('Cannot run simulation: The race configuration has invalid fields. Please correct them and try again.');
      if (results) results.textContent = "Please correct the highlighted fields.";
      return;
    }
    // build raceConfig
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
      const res = await apiFetch("/api/race-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(raceConfig),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      window.raceConfig = data.saved || raceConfig;
      console.log("Saved raceConfig:", window.raceConfig);
      if (results) results.textContent = "Calculating lap times…";

      const calcRes = await apiFetch("/api/calculate-laps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(window.raceConfig),
      });
      if (!calcRes.ok) throw new Error(`HTTP ${calcRes.status}`);
      const calcData = await calcRes.json();
      if (!calcData?.ok) throw new Error("Calculation failed");
      renderResults(calcData.laps || []);

      // strategies
      await fetchAndRenderStrategies(window.raceConfig);
    } catch (err) {
      console.error("Failed to save raceConfig", err);
      if (results) results.textContent = "Failed to save race configuration.";
    } finally {
      hideLoading();
    }
  });
}

// save and load UI logic is handled in modal.js

document.addEventListener('DOMContentLoaded', () => {
  initConfigModalBindings();
});
