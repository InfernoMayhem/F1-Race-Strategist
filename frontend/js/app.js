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

const form = $("raceForm");
if (form) {
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const results = $("resultsOutput");
    if (results) results.textContent = "Results placeholder";
  });
}
