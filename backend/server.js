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

app.post("/api/race-config", (req, res) => {
	const cfg = req.body || {};
	const required = [
		"totalLaps",
		"trackLength",
		"fuelLoad",
		"trackType",
		"weather",
		"temperature",
		"baseLapTime",
		"pitStopLoss",
	];
	const missing = required.filter((k) => !(k in cfg));
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

const PORT = 5000;
app.listen(PORT, () => console.log(`Backend running on port ${PORT}`));
