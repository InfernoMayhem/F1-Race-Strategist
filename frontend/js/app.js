import { $ } from './dom.js';
import { apiFetch } from './api.js';
import { validateAll as validateAllFields, validateField as validateOneField } from './validation.js';
import { renderStrategyCharts } from './charts.js';
import { renderStrategyCards, setStrategyStatus } from './strategies.js';
import { initConfigModalBindings } from './modal.js';
import { setRaceSetupTitle, currentLoadedConfigName, isPopulatingForm, setCurrentLoadedConfigName } from './state.js';

// test api and display result
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

// form validation and submission
const form = $("raceForm");
if (form) {
  const validateField = (id) => validateOneField(id);
  const validateAll = () => validateAllFields();

  // live validation
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

  // default render
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


  // submit validation
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const errors = validateAll();
    const hasErrors = Object.keys(errors).length > 0;
    const results = $("resultsOutput");
    if (hasErrors) {
      if (results) results.textContent = "Please correct the highlighted fields.";
      return;
    }
    // build raceConfig from inputs
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

      // get strategies and draw charts
      await fetchAndRenderStrategies(window.raceConfig);
    } catch (err) {
      console.error("Failed to save raceConfig", err);
      if (results) results.textContent = "Failed to save race configuration.";
    } finally {
      hideLoading();
    }
  });
}

// save and load UI
function getModalEls(){
  return {
    modal: document.getElementById('configModal'),
    modalTitle: document.getElementById('configModalTitle'),
    modalBody: document.getElementById('configModalBody'),
    modalClose: document.getElementById('closeConfigModal'),
  };
}

function openModal() { const { modal } = getModalEls(); if (modal) modal.classList.remove('hidden'); }
function closeModal() { const { modal } = getModalEls(); if (modal) modal.classList.add('hidden'); }

function buildCurrentConfigFromForm() {
  const f = document.getElementById('raceForm');
  if (!f) return null;
  return {
    totalLaps: document.getElementById('totalLaps')?.value,
    trackLength: document.getElementById('trackLength')?.value,
    fuelLoad: document.getElementById('fuelLoad')?.value,
    degradation: document.getElementById('degradation')?.value,
    totalRainfall: document.getElementById('totalRainfall')?.value,
    temperature: document.getElementById('temperature')?.value,
    baseLapTime: document.getElementById('baseLapTime')?.value,
    pitStopLoss: document.getElementById('pitStopLoss')?.value,
  };
}

function populateFormFromConfig(cfg = {}) {
  isPopulatingForm = true;
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v ?? ''; };
  set('totalLaps', cfg.totalLaps);
  set('trackLength', cfg.trackLength);
  set('fuelLoad', cfg.fuelLoad);
  set('degradation', cfg.degradation);
  set('totalRainfall', cfg.totalRainfall);
  set('temperature', cfg.temperature);
  set('baseLapTime', cfg.baseLapTime);
  set('pitStopLoss', cfg.pitStopLoss);
  // allow a tick for any bound listeners to finish before enabling edits to clear title
  setTimeout(() => { isPopulatingForm = false; }, 0);
}

async function showSaveModal() {
  const { modalBody, modalTitle } = getModalEls();
  if (!modalBody || !modalTitle) return;
  modalTitle.textContent = 'Save Configuration';
  modalBody.innerHTML = '';
  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = 'Enter a name for this config (e.g. Monza Dry)';
  input.id = 'saveNameInput';
  const actions = document.createElement('div');
  actions.className = 'modal-actions';
  const cancel = document.createElement('button'); cancel.className = 'btn-basic btn-alt'; cancel.textContent = 'Cancel';
  const save = document.createElement('button'); save.className = 'btn-basic'; save.textContent = 'Save';
  actions.append(cancel, save);
  modalBody.append(input, actions);

  cancel.addEventListener('click', closeModal);
  save.addEventListener('click', async () => {
    const name = (document.getElementById('saveNameInput')?.value || '').trim();
    if (!name) { input.focus(); input.classList.add('input-error'); return; }
    const cfg = buildCurrentConfigFromForm();
    try {
  const res = await apiFetch('/api/configs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, config: cfg }) });
      if (res.status === 409) { alert('A config with that name already exists. Choose a different name.'); return; }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      modalBody.innerHTML = '<div class="feedback-text">Saved! You can load it anytime via "Load Config".</div>';
      setTimeout(closeModal, 800);
    } catch (e) {
      console.error('Save failed', e);
      alert('Failed to save config.');
    }
  });

  openModal();
  setTimeout(() => input.focus(), 50);
}

function fmtTime(t) { try { const d = new Date(t); return d.toLocaleString(); } catch (_) { return String(t); } }

async function showLoadModal() {
  const { modalBody, modalTitle } = getModalEls();
  if (!modalBody || !modalTitle) return;
  modalTitle.textContent = 'Load Configuration';
  modalBody.innerHTML = '';
  const list = document.createElement('div'); list.className = 'config-list';
  modalBody.append(list);
  const actions = document.createElement('div'); actions.className = 'modal-actions';
  const close = document.createElement('button'); close.className = 'btn-basic btn-alt'; close.textContent = 'Close';
  actions.append(close); modalBody.append(actions);
  close.addEventListener('click', closeModal);
  try {
  const res = await apiFetch('/api/configs');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const items = data.items || [];
    if (!items.length) {
      const empty = document.createElement('div'); empty.className = 'empty-note'; empty.textContent = 'No saved configurations yet. Save one to see it here.';
      list.append(empty);
      return;
    }
    items.forEach(item => {
      const row = document.createElement('div'); row.className = 'config-item';
      row.innerHTML = `<div class="name">${item.name}</div><div class="time">${fmtTime(item.createdAt)}</div>`;
      row.addEventListener('click', async () => {
        try {
          const r = await apiFetch(`/api/configs/${encodeURIComponent(item.name)}`);
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          const payload = await r.json();
          const cfg = payload?.item?.config || {};
          populateFormFromConfig(cfg);
          // set the title to the loaded config name and mark as loaded
          setRaceSetupTitle(item.name);
          currentLoadedConfigName = item.name;
          closeModal();
        } catch (e) {
          console.error('Load failed', e);
          alert('Failed to load config.');
        }
      });
      list.append(row);
    });
  } catch (e) {
    console.error('List failed', e);
    modalBody.append(Object.assign(document.createElement('div'), { className: 'empty-note', textContent: 'Failed to fetch saved configs.' }));
  }
  openModal();
}

document.addEventListener('DOMContentLoaded', () => {
  initConfigModalBindings();
});
