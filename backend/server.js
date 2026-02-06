const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const http = require("http");

// initialise the express application
const app = express();

// enable cors so the frontend can talk to the backend on a different port
app.use(cors());

// enable parsing of json request bodies
app.use(express.json());

// global request logger middleware
// prints the timestamp, method, and url of every incoming request
app.use((req, res, next) => {
	try {
		console.log(new Date().toISOString(), req.method, req.originalUrl);
	} catch (e) {
		// handle logging errors silently to avoid crashing the request
	}
	next();
});

// detect if we should serve the built frontend static files directly
const distDir = path.join(__dirname, "..", "frontend", "dist");
const serveFrontendFromBackend = process.env.SERVE_FRONTEND === '1' && fs.existsSync(distDir);

// verify backend is working
app.get("/api/hello", (_req, res) => {
	res.json({ message: "Backend is working!" });
});

// logic modules
const { calculateLapTimes } = require("./models/calculateLapTimes");
const { generateStrategies } = require("./models/strategyGenerator");
const { 
	saveConfig: dbSaveConfig, 
	listConfigs: dbListConfigs, 
	getConfig: dbGetConfig,
	deleteConfig: dbDeleteConfig 
} = require("./models/configStore");

// endpoint to validate and normalize a race configuration
// basically used to just confirm the data format before doing heavy calculations
app.post("/api/race-config", (req, res) => {
	const cfg = req.body || {};
	
	// list of fields that must be present
	const required = [
		"totalLaps",
		"trackLength",
		"fuelLoad",
		"degradation",
		"temperature",
		"baseLapTime",
		"pitStopLoss",
	];
	
	// check for missing fields
	const missing = required.filter((k) => !(k in cfg));
	
	// normalise weather/rainfall if needed
	if (!('totalRainfall' in cfg) && 'weather' in cfg) {
		if (cfg.weather === 'Wet') cfg.totalRainfall = 50;
		else cfg.totalRainfall = 0;
	}
	
	// reject request if data is incomplete
	if (missing.length) {
		return res.status(400).json({ error: "Missing fields", missing });
	}
	res.status(201).json({ ok: true, saved: cfg });
});

// endpoint to perform the basic lap time calculation (no pit stops)
app.post("/api/calculate-laps", (req, res) => {
	const cfg = req.body;
	if (!cfg || Object.keys(cfg).length === 0) return res.status(400).json({ error: "No race config available" });
	try {
		const laps = calculateLapTimes(cfg, req.query || {});
		return res.json({ ok: true, laps });
	} catch (err) {
		console.error("calculate-laps error", err);
		return res.status(500).json({ error: "Failed to calculate laps" });
	}
});

// endpoint to generate optimal race strategies (pit stop planning)
app.post("/api/generate-strategies", (req, res) => {
	const cfg = req.body;
	if (!cfg || Object.keys(cfg).length === 0) return res.status(400).json({ error: "No race config available" });
	try {
		const { best, overallBest } = generateStrategies(cfg, {});
		return res.json({ ok: true, best, overallBest });
	} catch (err) {
		console.error("generate-strategies error", err);
		return res.status(500).json({ error: "Failed to generate strategies" });
	}
});

// save a new configuration to the database
app.post("/api/configs", (req, res) => {
	const { name, config } = req.body || {};
	
	// validation
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
		// handle name collisions
		if (e && e.code === 'EEXIST') {
			return res.status(409).json({ error: 'A config with that name already exists' });
		}
		console.error('Failed to save config', e);
		return res.status(500).json({ error: 'Failed to save config' });
	}
});

// retrieve the list of all saved configurations (names and dates)
app.get("/api/configs", (_req, res) => {
	try {
		const items = dbListConfigs();
		return res.json({ ok: true, items });
	} catch (e) {
		console.error('Failed to list configs', e);
		return res.status(500).json({ error: 'Failed to list configs' });
	}
});

// retrieve the full details of a specific configuration by name
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

// delete a saved configuration by name
app.delete("/api/configs/:name", (req, res) => {
	const name = req.params.name;
	if (!name) return res.status(400).json({ error: 'Name required' });
	try {
		const deleted = dbDeleteConfig(name);
		if (!deleted) return res.status(404).json({ error: 'Not found' });
		return res.json({ ok: true, deleted: true });
	} catch (e) {
		console.error('Failed to delete config', e);
		return res.status(500).json({ error: 'Failed to delete config' });
	}
});

// verify if it needs to serve frontend assets for SPA routing
if (serveFrontendFromBackend) {
	app.use(express.static(distDir));
	app.get("*", (_req, res) => {
		res.sendFile(path.join(distDir, "index.html"));
	});
} else {
	app.use((req, res, next) => {
		if (req.path && req.path.startsWith('/api')) return next();
		if (req.method && req.method.toUpperCase() === 'GET') {
			return res.status(204).end();
		}
		return res.status(404).end();
	});
}

// default to 5500
const requestedPort = process.env.PORT ? Number(process.env.PORT) : null;
const BASE_PORT = Number.isFinite(requestedPort) && requestedPort > 0 ? requestedPort : 5500;
// allow override
const explicitFallbackFlag = process.env.PORT_FALLBACK && process.env.PORT_FALLBACK !== '0';
const fallbackAttempts = explicitFallbackFlag ? 20 : 0;

// auto-fallback startup
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
