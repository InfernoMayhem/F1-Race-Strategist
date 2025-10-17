const express = require("express");
const cors = require("cors");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json());

// define path to frontend static files
const frontendDir = path.join(__dirname, "..", "frontend");
app.use(express.static(frontendDir));

// test API button functionality
app.get("/api/hello", (_req, res) => {
	res.json({ message: "Backend is working!" });
});

// race config storage
const { addConfig, getLatest } = require("./models/raceConfigStore");
const { calculateLapTimes } = require("./models/calculateLapTimes");
const { generateStrategies } = require("./models/strategyGenerator");

app.post("/api/race-config", (req, res) => {
	const cfg = req.body || {};
	const required = [
		"totalLaps",
		"trackLength",
		"fuelLoad",
		"trackType",
		"temperature",
		"baseLapTime",
		"pitStopLoss",
	];
	const missing = required.filter((k) => !(k in cfg));
	if (!('totalRainfall' in cfg) && 'weather' in cfg) {
		if (cfg.weather === 'Wet') cfg.totalRainfall = 50;
		else cfg.totalRainfall = 0;
	}
	if (missing.length) {
		return res.status(400).json({ error: "Missing fields", missing });
	}
	const saved = addConfig(cfg);
	res.status(201).json({ ok: true, saved });
});

app.get("/api/race-config/latest", (_req, res) => {
	const latest = getLatest();
	if (!latest) return res.status(404).json({ error: "No race config found" });
	res.json({ ok: true, config: latest });
});

// Calculate lap times using the latest saved config, or a config supplied in the body
app.post("/api/calculate-laps", (req, res) => {
	const cfg = Object.keys(req.body || {}).length ? req.body : getLatest();
	if (!cfg) return res.status(400).json({ error: "No race config available" });
	try {
		const laps = calculateLapTimes(cfg, req.query || {});
		return res.json({ ok: true, laps });
	} catch (err) {
		console.error("calculate-laps error", err);
		return res.status(500).json({ error: "Failed to calculate laps" });
	}
});

// Generate strategies (1/2/3 stop best + sample sets)
app.post("/api/generate-strategies", (req, res) => {
	const cfg = Object.keys(req.body || {}).length ? req.body : getLatest();
	if (!cfg) return res.status(400).json({ error: "No race config available" });
	try {
		const { best, overallBest } = generateStrategies(cfg, {});
		return res.json({ ok: true, best, overallBest });
	} catch (err) {
		console.error("generate-strategies error", err);
		return res.status(500).json({ error: "Failed to generate strategies" });
	}
});

const PORT = 5000;
app.listen(PORT, () => console.log(`Backend running on port ${PORT}`));
