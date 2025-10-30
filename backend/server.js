const express = require("express");
const cors = require("cors");
const path = require("path");
const http = require("http");

const app = express();
app.use(cors());
app.use(express.json());

// simple request logger to help debug connectivity/timeouts
app.use((req, res, next) => {
	try {
		console.log(new Date().toISOString(), req.method, req.originalUrl);
	} catch (e) {
		// ignore logging errors
	}
	next();
});

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

// calculate lap times using the latest saved config, or a config supplied in the body
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

// generate strategies
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

// default to 5000
const BASE_PORT = Number(process.env.PORT) || 5000;

// startup that auto-falls back to the next available port(s) if in use
function startWithFallback(startPort, maxTries = 20) {
	let port = startPort;
	const server = http.createServer(app);

	function listen() {
		server.listen(port);
	}

	server.on("listening", () => {
		const addr = server.address();
		console.log(`Backend running on port ${addr.port}`);
	});

	server.on("error", (err) => {
		if (err && err.code === "EADDRINUSE" && maxTries > 0) {
			console.warn(`Port ${port} in use, trying ${port + 1}...`);
			port += 1;
			maxTries -= 1;
			setTimeout(listen, 50);
			return;
		}
		if (err && err.code === "EACCES") {
			console.error(`\nERROR: Permission denied for port ${port}. Try a port > 1024 or run without privileged ports.`);
			process.exit(1);
		}
		throw err;
	});

	listen();
}

startWithFallback(BASE_PORT);
