const path = require("path");
const fs = require("fs");
const Database = require("better-sqlite3");

// define the database location
const DATA_DIR = path.join(__dirname, "..", "..", "data");
const DB_FILE = path.join(DATA_DIR, "savedConfigs.db");

// ensures the data directory exists before trying to write the db file
function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

// storing the database coonection to prevent multiple opens
let db;
function getDb() {
  if (db) return db;
  ensureDir();
  
  // open the sqlite database
  db = new Database(DB_FILE);
  // use write-ahead logging so data can be read and written to concurrently
  db.pragma("journal_mode = WAL");
  
  // create the table if it doesn't already exist
  db.exec(`
    CREATE TABLE IF NOT EXISTS saved_configs (
      name TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
  `);
  return db;
}

// persists a race configuration to the database
function saveConfig(name, config) {
  if (!name || typeof name !== "string" || !name.trim()) {
    const err = new Error("Invalid name");
    err.code = "EINVAL";
    throw err;
  }
  
  // converts the config object to a json string
  const payload = JSON.stringify(config || {});
  const createdAt = Date.now();
  const d = getDb();
  
  try {
    // perform the insert
    const stmt = d.prepare("INSERT INTO saved_configs (name, data, created_at) VALUES (?, ?, ?)");
    stmt.run(name.trim(), payload, createdAt);
    return { name: name.trim(), createdAt };
  } catch (e) {
    // handle duplicate names
    if (e && String(e.message || "").includes("UNIQUE")) {
      const err = new Error("Name already exists");
      err.code = "EEXIST";
      throw err;
    }
    throw e;
  }
}

// retrieves metadata for all saved configurations, ordered by most recent first
function listConfigs() {
  const d = getDb();
  // selecting only necessary columns for the list view
  const rows = d.prepare("SELECT name, created_at FROM saved_configs ORDER BY created_at DESC").all();
  return rows.map(r => ({ name: r.name, createdAt: r.created_at }));
}

// fetches the full configuration data for a specific saved item
function getConfig(name) {
  const d = getDb();
  const row = d.prepare("SELECT name, data, created_at FROM saved_configs WHERE name = ?").get(name);
  if (!row) return null;
  
  // convert the json string back into a javascript object
  let parsed = {};
  try { parsed = JSON.parse(row.data); } catch (_) {}
  
  return { name: row.name, createdAt: row.created_at, config: parsed };
}

// removes a configuration from the database
function deleteConfig(name) {
  const d = getDb();
  const info = d.prepare("DELETE FROM saved_configs WHERE name = ?").run(name);
  // return true if something was actually deleted
  return info.changes > 0;
}

module.exports = { saveConfig, listConfigs, getConfig, deleteConfig };
