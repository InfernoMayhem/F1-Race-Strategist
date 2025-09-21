const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "..", "..", "data");
const FILE = path.join(DATA_DIR, "raceConfigs.json");

function ensureStore() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(FILE)) fs.writeFileSync(FILE, JSON.stringify({ configs: [] }, null, 2));
}

function addConfig(cfg) {
  ensureStore();
  const raw = fs.readFileSync(FILE, "utf8");
  const json = JSON.parse(raw || "{\"configs\":[]}");
  json.configs.push(cfg);
  fs.writeFileSync(FILE, JSON.stringify(json, null, 2));
  return cfg;
}

function getLatest() {
  ensureStore();
  const raw = fs.readFileSync(FILE, "utf8");
  const json = JSON.parse(raw || "{\"configs\":[]}");
  if (!json.configs.length) return null;
  return json.configs[json.configs.length - 1];
}

module.exports = { addConfig, getLatest };
