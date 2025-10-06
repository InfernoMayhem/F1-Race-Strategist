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
    weather: (el) => {
      const v = el.value;
      if (!v) return "Weather is required";
      if (!["Dry", "Wet"].includes(v)) return "Invalid Weather";
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

  // helper: simple results renderer
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
      weather: $("weather").value,
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
    } catch (err) {
      console.error("Failed to save raceConfig", err);
      if (results) results.textContent = "Failed to save race configuration.";
    }
  });
}
