const $ = (id) => document.getElementById(id);

// test API and display result
const testBtn = $("testBtn");
if (testBtn) {
  testBtn.addEventListener("click", async () => {
    const out = $("output");
    if (out) out.textContent = "Testing…";
    try {
      const res = await fetch("/api/hello");
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
  });
  form.addEventListener("change", (e) => {
    const t = e.target;
    if (t && t.id && fields[t.id]) validateField(t.id);
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
  let recommendedStops = null;

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
          borderColor: 'rgba(255,215,64,0.9)',
          borderWidth: 2,
          label: { enabled: true, content: 'Pit', position: 'start', backgroundColor: 'rgba(255,215,64,0.15)', color: '#111' },
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
      pointBackgroundColor: '#ffd740',
      pointBorderColor: '#ffd740'
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
      pointBackgroundColor: '#ffd740',
      pointBorderColor: '#ffd740'
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
      pointBackgroundColor: '#ffd740',
      pointBorderColor: '#ffd740'
    }];
    chartTyre.options.plugins.annotation.annotations = buildAnnotations();
    chartTyre.update();
  }

  function updateRecommendationLabel() {
    const el = document.getElementById('recommendedLabel');
    if (!el) return;
    if (recommendedStops == null) {
      el.textContent = '(none)';
    } else if (recommendedStops === 1) {
      el.textContent = '1 stop';
    } else {
      el.textContent = `${recommendedStops} stops`;
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

  function renderStrategyCards(bestByStops, overallBest) {
    const container = document.getElementById('strategyCards');
    if (!container) return;
    container.innerHTML = '';
    const order = [1, 2, 3].filter((n) => bestByStops && bestByStops[n]);
    order.forEach((stops) => {
      const s = bestByStops[stops];
      const isOptimal = overallBest && overallBest.stops === stops;
      const pitLaps = s.pitLaps || [];
      const totalTime = s.totalTime;
      const schedule = buildStintSchedule(s);

      const card = document.createElement('div');
      card.className = `strategy-card${isOptimal ? ' optimal' : ''}`;
      card.innerHTML = `
        <div class="title">
          <div>${stops} stop${stops === 1 ? '' : 's'}</div>
          <div>
            <span class="pill">Pit laps: ${pitLaps.length ? pitLaps.join(', ') : '—'}</span>
            ${isOptimal ? '<span class="pill opt">Optimal</span>' : ''}
          </div>
        </div>
        <div class="meta"><div>Total time: <strong>${formatTime(totalTime)}</strong></div></div>
        <div class="schedule">${schedule.map((seg) => `<span class=\"seg\">${seg}</span>`).join('')}</div>
      `;
      card.addEventListener('click', () => {
        renderStrategyCharts(s);
        // subtle feedback
        card.style.transform = 'scale(0.99)';
        setTimeout(() => (card.style.transform = ''), 120);
      });
      container.appendChild(card);
    });
  }

  async function fetchAndRenderStrategies(config) {
    try {
      const res = await fetch('/api/generate-strategies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config || {})
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      strategiesByStops = data.best || {};
      recommendedStops = data.overallBest?.stops ?? null;
      updateRecommendationLabel();
      renderStrategyCards(strategiesByStops, data.overallBest);

  // default render
  const strat = data.overallBest || strategiesByStops[3] || strategiesByStops[2] || strategiesByStops[1];
  renderStrategyCharts(strat);
    } catch (err) {
      console.error('Failed to fetch strategies', err);
    }
  }

  function wireStrategyButtons() {
    const b1 = document.getElementById('btnStrat1');
    const b2 = document.getElementById('btnStrat2');
    const b3 = document.getElementById('btnStrat3');
  if (b1) b1.addEventListener('click', () => renderStrategyCharts(strategiesByStops[1]));
  if (b2) b2.addEventListener('click', () => renderStrategyCharts(strategiesByStops[2]));
  if (b3) b3.addEventListener('click', () => renderStrategyCharts(strategiesByStops[3]));
  }

  wireStrategyButtons();

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
      const res = await fetch("/api/race-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(raceConfig),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      // Expose to window for algorithms to use immediately
      window.raceConfig = data.saved || raceConfig;
      console.log("Saved raceConfig:", window.raceConfig);
      if (results) results.textContent = "Calculating lap times…";

      // Now calculate laps using the saved config (or latest)
      const calcRes = await fetch("/api/calculate-laps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(window.raceConfig),
      });
      if (!calcRes.ok) throw new Error(`HTTP ${calcRes.status}`);
      const calcData = await calcRes.json();
      if (!calcData?.ok) throw new Error("Calculation failed");
      renderResults(calcData.laps || []);

      // Get strategies and draw charts
      await fetchAndRenderStrategies(window.raceConfig);
    } catch (err) {
      console.error("Failed to save raceConfig", err);
      if (results) results.textContent = "Failed to save race configuration.";
    }
  });
}
