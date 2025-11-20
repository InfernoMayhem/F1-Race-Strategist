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
const { saveConfig: dbSaveConfig, listConfigs: dbListConfigs, getConfig: dbGetConfig } = require("./models/configStore");
const bruteForce = require("./models/bruteForceOptimizer");
const strictOpt = require("./models/strictOptimizer");

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
		// Optional mode switch: if query ?mode=brute, use brute-force 2-stop optimiser
		if ((req.query && req.query.mode === 'brute') || (req.body && req.body.mode === 'brute')) {
			const best = bruteForce.findOptimal(cfg);
			// Map to existing shape minimally: put under 2-stops key
			const bestMap = { 2: {
				stints: best.stints.map((s, i) => ({ stint: i+1, compound: s.compound, laps: s.length })),
				pitLaps: best.pit_laps,
				totalTime: best.total_time,
				lapSeries: best.lapSeries,
				actualStops: 2,
				targetStops: 2,
			}};
			return res.json({ ok: true, best: bestMap, overallBest: bestMap[2] });
		}
			const { best, overallBest } = generateStrategies(cfg, {});
			if (!overallBest || !best || Object.keys(best).length === 0) {
				// Fallback: run brute-force 2-stop optimiser to ensure we always return a valid strategy
				try {
					const bf = bruteForce.findOptimal(cfg);
					const map = { 2: {
						stints: bf.stints.map((s, i) => ({ stint: i+1, compound: s.compound, laps: s.length })),
						pitLaps: bf.pit_laps,
						totalTime: bf.total_time,
						lapSeries: bf.lapSeries,
						actualStops: 2,
						targetStops: 2,
					}};
					return res.json({ ok: true, best: map, overallBest: map[2], meta: { fallback: 'bruteforce' } });
				} catch (e) {
					console.warn('Brute-force fallback failed:', e?.message || e);
				}
			}
			return res.json({ ok: true, best, overallBest });
	} catch (err) {
		console.error("generate-strategies error", err);
		return res.status(500).json({ error: "Failed to generate strategies" });
	}
});

// Dedicated brute-force endpoint returning the optimal 2-stop (3-stint) strategy
app.post("/api/optimise-bruteforce", (req, res) => {
	const cfg = Object.keys(req.body || {}).length ? req.body : getLatest();
	if (!cfg) return res.status(400).json({ error: "No race config available" });
	try {
		const best = bruteForce.findOptimal(cfg);
		return res.json({ ok: true, best });
	} catch (err) {
		console.error('optimise-bruteforce error', err);
		return res.status(500).json({ error: 'Failed to optimise strategy' });
	}
});

// Strict optimiser endpoint returning the exact requested JSON format
app.post("/api/optimise-strict", (req, res) => {
	const cfg = Object.keys(req.body || {}).length ? req.body : getLatest();
	if (!cfg) return res.status(400).json({ error: "No race config available" });
	try {
		const params = {
			totalLaps: cfg.totalLaps,
			baseLapTime: cfg.baseLapTime,
			pitStopLoss: cfg.pitStopLoss,
			// Strict model expects initialFuel and fuelPerKgBenefit; derive from inputs
			initialFuel: cfg.fuelLoad, // interpreted per spec as initial fuel value
			fuelPerKgBenefit: 0.005,
		};
		const best = strictOpt.optimiseStrict(params);
		return res.json({ ok: true, best });
	} catch (err) {
		console.error('optimise-strict error', err);
		return res.status(500).json({ error: 'Failed to optimise (strict)', details: err?.message || String(err) });
	}
});

// Saved Configs API (SQLite)
// Save a config by name
app.post("/api/configs", (req, res) => {
	const { name, config } = req.body || {};
	if (!name || typeof name !== 'string' || !name.trim()) {
		return res.status(400).json({ error: 'Name is required' });
	}
	if (!config || typeof config !== 'object') {
		return res.status(400).json({ error: 'Config object is required' });
	}
	try {
		const saved = dbSaveConfig(name.trim(), config);
		return res.status(201).json({ ok: true, saved });
	} catch (e) {
		if (e && e.code === 'EEXIST') {
			return res.status(409).json({ error: 'A config with that name already exists' });
		}
		console.error('Failed to save config', e);
		return res.status(500).json({ error: 'Failed to save config' });
	}
});

// List saved config names
app.get("/api/configs", (_req, res) => {
	try {
		const items = dbListConfigs();
		return res.json({ ok: true, items });
	} catch (e) {
		console.error('Failed to list configs', e);
		return res.status(500).json({ error: 'Failed to list configs' });
	}
});

// Get a specific config by name
app.get("/api/configs/:name", (req, res) => {
	const name = req.params.name;
	if (!name) return res.status(400).json({ error: 'Name required' });
	try {
		const item = dbGetConfig(name);
		if (!item) return res.status(404).json({ error: 'Not found' });
		return res.json({ ok: true, item });
	} catch (e) {
		console.error('Failed to get config', e);
		return res.status(500).json({ error: 'Failed to get config' });
	}
});

// default to 5500 (avoid macOS ControlCenter on 5000) unless PORT explicitly provided
const requestedPort = process.env.PORT ? Number(process.env.PORT) : null;
const BASE_PORT = Number.isFinite(requestedPort) && requestedPort > 0 ? requestedPort : 5500;
// Allow explicit override: if PORT_FALLBACK=1 then still attempt incremental ports even with PORT set.
const explicitFallbackFlag = process.env.PORT_FALLBACK && process.env.PORT_FALLBACK !== '0';
const fallbackAttempts = process.env.PORT && !explicitFallbackFlag ? 0 : 20;

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
		if (err && err.code === "EADDRINUSE") {
			console.error(`Port ${port} is already in use and automatic fallback is disabled. Set PORT_FALLBACK=1 to auto-select a free port or choose a different PORT.`);
			process.exit(1);
		}
		if (err && err.code === "EACCES") {
			console.error(`\nERROR: Permission denied for port ${port}. Try a port > 1024 or run without privileged ports.`);
			process.exit(1);
		}
		throw err;
	});

	listen();
}

startWithFallback(BASE_PORT, fallbackAttempts);
