const path = require("path");
const fs = require("fs");
const Database = require("better-sqlite3");

const DATA_DIR = path.join(__dirname, "..", "..", "data");
const DB_FILE = path.join(DATA_DIR, "savedConfigs.db");

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

let db;
function getDb() {
  if (db) return db;
  ensureDir();
  db = new Database(DB_FILE);
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS saved_configs (
      name TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
  `);
  return db;
}

function saveConfig(name, config) {
  if (!name || typeof name !== "string" || !name.trim()) {
    const err = new Error("Invalid name");
    err.code = "EINVAL";
    throw err;
  }
  const payload = JSON.stringify(config || {});
  const createdAt = Date.now();
  const d = getDb();
  try {
    const stmt = d.prepare("INSERT INTO saved_configs (name, data, created_at) VALUES (?, ?, ?)");
    stmt.run(name.trim(), payload, createdAt);
    return { name: name.trim(), createdAt };
  } catch (e) {
    if (e && String(e.message || "").includes("UNIQUE")) {
      const err = new Error("Name already exists");
      err.code = "EEXIST";
      throw err;
    }
    throw e;
  }
}

function listConfigs() {
  const d = getDb();
  const rows = d.prepare("SELECT name, created_at FROM saved_configs ORDER BY created_at DESC").all();
  return rows.map(r => ({ name: r.name, createdAt: r.created_at }));
}

function getConfig(name) {
  const d = getDb();
  const row = d.prepare("SELECT name, data, created_at FROM saved_configs WHERE name = ?").get(name);
  if (!row) return null;
  let parsed = {};
  try { parsed = JSON.parse(row.data); } catch (_) {}
  return { name: row.name, createdAt: row.created_at, config: parsed };
}

function deleteConfig(name) {
  const d = getDb();
  const info = d.prepare("DELETE FROM saved_configs WHERE name = ?").run(name);
  return info.changes > 0;
}

module.exports = { saveConfig, listConfigs, getConfig, deleteConfig };
