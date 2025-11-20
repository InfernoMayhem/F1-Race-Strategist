const $ = (id) => document.getElementById(id);

// Global title handling state (accessible to save/load modal code)
const DEFAULT_RACE_SETUP_TITLE = 'Race Setup';
let currentLoadedConfigName = null; // name of currently loaded saved config (null if none)
let isPopulatingForm = false; // guard flag while programmatically filling form
function setRaceSetupTitle(name) {
  const h = document.getElementById('raceSetupTitle');
  if (!h) return;
  if (name && String(name).trim()) {
    h.textContent = String(name).trim();
  } else {
    h.textContent = DEFAULT_RACE_SETUP_TITLE;
  }
}

const DEV_FRONTEND_PORTS = new Set(['5173','5174','4173','4174']);
const shouldRetryRelativeApi = (() => {
  if (typeof window === 'undefined' || !window.location) return false;
  if (window.location.protocol === 'file:') return true;
  return DEV_FRONTEND_PORTS.has(window.location.port);
})();

const API_BASE_CANDIDATES = (() => {
  const bases = [];
  if (typeof window !== 'undefined' && window.location) {
    const proto = window.location.protocol;
    if (proto === 'http:' || proto === 'https:') bases.push('');
  }
  for (let port = 5000; port <= 5010; port += 1) {
    bases.push(`http://localhost:${port}`);
    bases.push(`http://127.0.0.1:${port}`);
  }
  return Array.from(new Set(bases));
})();

let cachedApiBase = null;

async function apiFetch(path, options = {}) {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const attemptOrder = [];
  if (cachedApiBase !== null) attemptOrder.push(cachedApiBase);
  API_BASE_CANDIDATES.forEach((base) => {
    if (base !== cachedApiBase) attemptOrder.push(base);
  });
  let lastError;
  for (const base of attemptOrder) {
    const url = base ? `${base}${normalizedPath}` : normalizedPath;
    try {
      const res = await fetch(url, options);
      if (res.ok) {
        cachedApiBase = base;
        return res;
      }
      if (base === '' && shouldRetryRelativeApi) {
        lastError = new Error(`HTTP ${res.status}`);
        continue;
      }
      cachedApiBase = base;
      return res;
    } catch (err) {
      lastError = err;
    }
  }
  if (lastError) throw lastError;
  throw new Error('Unable to reach backend');
}

// test API and display result
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

  const integer = (v) => {
    const n = parseInt(String(v).trim(), 10);
    return Number.isFinite(n) ? n : NaN;
  };
  const decimal = (v) => {
    const n = parseFloat(String(v).trim());
    return Number.isFinite(n) ? n : NaN;
  };
  // adding error styling to the input
    const showError = (el, msg) => {
      el.classList.add("input-error");
      // adding or updating error message
      let span = el.nextElementSibling;
      if (!(span && span.classList && span.classList.contains("error-text"))) {
        span = document.createElement("div");
        span.className = "error-text";
        el.insertAdjacentElement("afterend", span);
      }
      // removing any duplicate error messages
      let dup = span.nextElementSibling;
      while (dup && dup.classList && dup.classList.contains("error-text")) {
        const toRemove = dup;
        dup = dup.nextElementSibling;
        toRemove.remove();
      }
      span.textContent = msg || "";
  };
  // removing error styling from the input
    const clearError = (el) => {
      el.classList.remove("input-error");
      // removing all errors once field is valid
      let span = el.nextElementSibling;
      while (span && span.classList && span.classList.contains("error-text")) {
        const toRemove = span;
        span = span.nextElementSibling;
        toRemove.remove();
      }
  };

  // validation functions for each field
  const fields = {
    totalLaps: (el) => {
      const raw = el.value;
      if (!raw.trim()) return "Total Laps is required";
      const n = integer(raw);
      if (Number.isNaN(n)) return "Total Laps must be an integer";
      if (n < 1 || n > 100) return "Total Laps must be 1-100";
      return "";
    },
    trackLength: (el) => {
      const raw = el.value;
      if (!raw.trim()) return "Track Length is required";
      const n = decimal(raw);
      if (Number.isNaN(n)) return "Track Length must be a number";
      if (n < 0.1 || n > 99.9) return "Track Length must be 0.1-99.9";
      return "";
    },
    fuelLoad: (el) => {
      const raw = el.value;
      if (!raw.trim()) return "Fuel Load is required";
      const n = integer(raw);
      if (Number.isNaN(n)) return "Fuel Load must be an integer";
      if (n < 1 || n > 150) return "Fuel Load must be 1-150";
      return "";
    },
    trackType: (el) => {
      const v = el.value;
      if (!v) return "Track Type is required";
      if (!["Permanent", "Hybrid", "Street"].includes(v)) return "Invalid Track Type";
      return "";
    },
    totalRainfall: (el) => {
      const raw = el.value.trim();
      if (!raw) return ""; // blank means 0 (dry)
      const n = decimal(raw);
      if (Number.isNaN(n)) return "Total Rainfall must be a number";
      if (n < 0) return "Total Rainfall cannot be negative";
      if (n > 1000) return "Total Rainfall is unrealistically high";
      return "";
    },
    temperature: (el) => {
      const raw = el.value;
      if (!raw.trim()) return "Temperature is required";
      const n = integer(raw);
      if (Number.isNaN(n)) return "Temperature must be an integer";
      if (n < -10 || n > 50) return "Temperature must be -10 to 50";
      return "";
    },
    baseLapTime: (el) => {
      const raw = el.value;
      if (!raw.trim()) return "Base Lap Time is required";
      const n = integer(raw);
      if (Number.isNaN(n)) return "Base Lap Time must be an integer";
      if (n < 1 || n > 300) return "Base Lap Time must be 1-300";
      return "";
    },
    pitStopLoss: (el) => {
      const raw = el.value;
      if (!raw.trim()) return "Pit Stop Loss is required";
      const n = integer(raw);
      if (Number.isNaN(n)) return "Pit Stop Loss must be an integer";
      if (n < 1 || n > 60) return "Pit Stop Loss must be 1-60";
      return "";
    },
  };

  const validateField = (id) => {
    const el = $(id);
    if (!el || !fields[id]) return "";
    const msg = fields[id](el);
    if (msg) showError(el, msg); else clearError(el);
    return msg;
  };

  const validateAll = () => {
    const ids = Object.keys(fields);
    const errors = {};
    ids.forEach((id) => {
      const msg = validateField(id);
      if (msg) errors[id] = msg;
    });
    return errors;
  };

  // live validation
  form.addEventListener("input", (e) => {
    const t = e.target;
    if (t && t.id && fields[t.id]) validateField(t.id);
    // if user edits while a saved config is loaded, revert title
    if (!isPopulatingForm && currentLoadedConfigName) {
      currentLoadedConfigName = null;
      setRaceSetupTitle();
    }
  });
  form.addEventListener("change", (e) => {
    const t = e.target;
    if (t && t.id && fields[t.id]) validateField(t.id);
    if (!isPopulatingForm && currentLoadedConfigName) {
      currentLoadedConfigName = null;
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
    // show first 10 laps for quick glance
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

  // chart rendering
  let chartLap, chartFuel, chartTyre;
  let strategiesByStops = {};
  let recommendedStops = null; // used for initial selection
  let currentStops = null; // currently selected/viewed strategy

  function registerAnnotation() {
    try {
      if (window.ChartAnnotation) Chart.register(window.ChartAnnotation);
      else if (window['chartjs-plugin-annotation']) Chart.register(window['chartjs-plugin-annotation']);
    } catch (e) {}
  }

  function baseOptions(yTitle) {
    return {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        title: { display: false },
        tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: ${ctx.formattedValue}` } },
        annotation: { annotations: {} }
      },
      scales: {
        x: { title: { display: true, text: 'Lap' } },
        y: { title: { display: true, text: yTitle } }
      }
    };
  }

  function ensureCharts() {
    registerAnnotation();
    if (!chartLap) {
      const c1 = document.getElementById('lapChart');
      if (c1) chartLap = new Chart(c1, { type: 'line', data: { labels: [], datasets: [] }, options: baseOptions('Lap Time (s)') });
    }
    if (!chartFuel) {
      const c2 = document.getElementById('fuelChart');
      if (c2) chartFuel = new Chart(c2, { type: 'line', data: { labels: [], datasets: [] }, options: baseOptions('Fuel Load (kg)') });
    }
    if (!chartTyre) {
      const c3 = document.getElementById('tyreChart');
      if (c3) chartTyre = new Chart(c3, { type: 'line', data: { labels: [], datasets: [] }, options: baseOptions('Tyre Wear (s penalty)') });
    }
  }

  function renderStrategyCharts(strategy) {
    ensureCharts();
    if (!strategy || !chartLap || !chartFuel || !chartTyre) return;

    const series = strategy.lapSeries || [];
    const labels = series.map(p => p.lap);
    const lapTimes = series.map(p => p.time);
    const fuelLoads = series.map(p => p.fuelLoad);
    const tyreWear = series.map(p => p.tyrePenalty);
    const pitSet = new Set((strategy.pitLaps || []).map(Number));

    const buildAnnotations = () => {
      const anns = {};
      (strategy.pitLaps || []).forEach((lap, i) => {
        const key = `pit_${i}_${lap}`;
        anns[key] = {
          type: 'line',
          xMin: lap,
          xMax: lap,
          borderColor: 'rgba(255,154,60,0.9)',
          borderWidth: 2,
          label: { enabled: true, content: 'Pit', position: 'start', backgroundColor: 'rgba(255,154,60,0.15)', color: '#111' },
          scaleID: 'x'
        };
      });
      return anns;
    };

    // lap time
    chartLap.data.labels = labels;
    chartLap.data.datasets = [{
      label: 'Lap Time (s)',
      data: lapTimes,
      borderColor: '#1976d2',
      backgroundColor: 'rgba(25,118,210,0.2)',
      tension: 0.3,
      fill: false,
      pointRadius: (ctx) => pitSet.has(labels[ctx.dataIndex]) ? 3 : 0,
      pointBackgroundColor: '#ff9a3c',
      pointBorderColor: '#ff9a3c'
    }];
    chartLap.options.plugins.annotation.annotations = buildAnnotations();
    chartLap.update();

    // fuel load
    chartFuel.data.labels = labels;
    chartFuel.data.datasets = [{
      label: 'Fuel Load (kg)',
      data: fuelLoads,
      borderColor: '#2e7d32',
      backgroundColor: 'rgba(46,125,50,0.2)',
      tension: 0.3,
      fill: false,
      pointRadius: (ctx) => pitSet.has(labels[ctx.dataIndex]) ? 2 : 0,
      pointBackgroundColor: '#ff9a3c',
      pointBorderColor: '#ff9a3c'
    }];
    chartFuel.options.plugins.annotation.annotations = buildAnnotations();
    chartFuel.update();

    // tyre wear
    chartTyre.data.labels = labels;
    chartTyre.data.datasets = [{
      label: 'Tyre Wear (s penalty)',
      data: tyreWear,
      borderColor: '#c62828',
      backgroundColor: 'rgba(198,40,40,0.2)',
      tension: 0.3,
      fill: false,
      pointRadius: (ctx) => pitSet.has(labels[ctx.dataIndex]) ? 2 : 0,
      pointBackgroundColor: '#ff9a3c',
      pointBorderColor: '#ff9a3c'
    }];
    chartTyre.options.plugins.annotation.annotations = buildAnnotations();
    chartTyre.update();
  }

  function updateViewingLabel(stops) {
    const el = document.getElementById('recommendedLabel');
    if (!el) return;
    if (stops == null) {
      el.textContent = '(none)';
    } else if (stops === 1) {
      el.textContent = '1 stop';
    } else {
      el.textContent = `${stops} stops`;
    }
  }

  function formatTime(totalSeconds) {
    if (totalSeconds == null || !isFinite(totalSeconds)) return '—';
    const ms = Math.round((totalSeconds - Math.floor(totalSeconds)) * 1000);
    const secs = Math.floor(totalSeconds) % 60;
    const mins = Math.floor(totalSeconds / 60) % 60;
    const hrs = Math.floor(totalSeconds / 3600);
    const pad = (n, z = 2) => String(n).padStart(z, '0');
    return `${hrs > 0 ? pad(hrs) + ':' : ''}${pad(mins)}:${pad(secs)}.${pad(ms, 3)}`;
  }

  function buildStintSchedule(strategy) {
    if (!strategy || !Array.isArray(strategy.stints)) return [];
    const schedule = [];
    let lapStart = 1;
    strategy.stints.forEach((st) => {
      const len = st.laps || (Array.isArray(st.lapTimes) ? st.lapTimes.length : 0);
      if (!len) return;
      const lapEnd = lapStart + len - 1;
      const compound = st.compound || st.tyre || 'Tyre';
      schedule.push(`Lap ${lapStart}–${lapEnd}: ${compound}`);
      lapStart = lapEnd + 1;
    });
    return schedule;
  }

  function setStrategyStatus(msg) {
    const el = document.getElementById('strategyStatus');
    if (el) el.textContent = msg || '';
  }

  function renderStrategyCards(bestByStops, overallBest) {
    const container = document.getElementById('strategyCards');
    if (!container) return;
    container.innerHTML = '';
    const order = [1, 2, 3].filter((n) => bestByStops && bestByStops[n]);
    if (!order.length) {
      setStrategyStatus('No strategies found. Try adjusting inputs.');
      return;
    }
    setStrategyStatus('');
    order.forEach((stops) => {
  const s = bestByStops[stops];
  const isSelected = currentStops === stops;
  const isOptimal = overallBest && (overallBest.targetStops === stops || overallBest.actualStops === stops);
      const pitLaps = s.pitLaps || [];
      const totalTime = s.totalTime;
      const schedule = buildStintSchedule(s);
      const actualStopsInfo = (s.actualStops != null && s.actualStops !== stops) ? `<span class="pill">Actual: ${s.actualStops} stop${s.actualStops===1?'':'s'}</span>` : '';

      const card = document.createElement('div');
      card.className = `strategy-card${isSelected ? ' selected' : ''}`;
      card.innerHTML = `
        <div class="title">
          <div>${stops} stop${stops === 1 ? '' : 's'}</div>
          <div>
            <span class="pill">Pit laps: ${pitLaps.length ? pitLaps.join(', ') : '—'}</span>
            ${actualStopsInfo}
            ${isSelected ? '<span class="pill viewing">Viewing</span>' : ''}
            ${isOptimal ? '<span class="pill opt">Optimal</span>' : ''}
          </div>
        </div>
        <div class="meta"><div>Total time: <strong>${formatTime(totalTime)}</strong></div></div>
        <div class="schedule">${schedule.map((seg) => `<span class=\"seg\">${seg}</span>`).join('')}</div>
      `;
      card.addEventListener('click', () => {
        currentStops = stops;
        renderStrategyCharts(s);
        updateViewingLabel(currentStops);
        // re-render to update selection highlight
        renderStrategyCards(strategiesByStops, overallBest);
        // subtle feedback
        card.style.transform = 'scale(0.99)';
        setTimeout(() => (card.style.transform = ''), 120);
      });
      container.appendChild(card);
    });
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
      currentStops = recommendedStops;
      renderStrategyCards(strategiesByStops, data.overallBest);

  // default render
  const strat = data.overallBest || strategiesByStops[currentStops] || strategiesByStops[3] || strategiesByStops[2] || strategiesByStops[1];
  renderStrategyCharts(strat);
  updateViewingLabel(currentStops);
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
      trackType: $("trackType").value,
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
    trackType: document.getElementById('trackType')?.value,
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
  set('trackType', cfg.trackType);
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
  const saveBtn = document.getElementById('saveConfigBtn');
  const loadBtn = document.getElementById('loadConfigBtn');
  const { modal, modalClose } = getModalEls();
  if (modalClose) modalClose.addEventListener('click', closeModal);
  if (modal) modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
  if (saveBtn) saveBtn.addEventListener('click', showSaveModal);
  if (loadBtn) loadBtn.addEventListener('click', showLoadModal);
});
