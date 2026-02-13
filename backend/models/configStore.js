// this file manages the database and storage of saved configs, allowing them to be saved, loaded and deleted (essentially the database API)

const path = require("path");
const fs = require("fs");
const Database = require("better-sqlite3");

// define the database location
const DATA_DIR = path.join(__dirname, "..", "..", "data");
const DB_FILE = path.join(DATA_DIR, "savedConfigs.db");

// checks if the folder exists and creates one if not
function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

// storing the database coonection to prevent multiple opens and recreating tables
let db;
function getDb() {
  if (db) return db;
  ensureDir();
  
  // open the sqlite database
  db = new Database(DB_FILE);
  // use write-ahead logging so data can be read and written to concurrently without locking the database file
  db.pragma("journal_mode = WAL");
  
  // create the table if it is missing
  // structure: name (primary key, text), data (json config, text), created_at (timestamp, integer)
  db.exec(`
    CREATE TABLE IF NOT EXISTS saved_configs (
      name TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
  `);
  return db;
}

// saves a user race config to the database
function saveConfig(name, config) {
  if (!name || typeof name !== "string" || !name.trim()) { // ensures the name is valid
    const err = new Error("Invalid name"); // otherwise throws an error
    err.code = "EINVAL";
    throw err;
  }
  
  // converts the config object to a json string for a flexible strucure without the table needing to change each time
  let safeConfig = config;

  if (!safeConfig) {
    safeConfig = {};
  }

  const configJSON = JSON.stringify(safeConfig);
  const timestamp = Date.now();
  const database = getDb();
  
  try {
    // adds the config to the database
    const stmt = database.prepare("INSERT INTO saved_configs (name, data, created_at) VALUES (?, ?, ?)");
    stmt.run(name.trim(), configJSON, timestamp);
    return { name: name.trim(), timestamp }; // returns the name and timestamp of the config
  } catch (e) {
    // checks for duplicate names and throws an error if found
    if (e.message.includes("UNIQUE")) {
      const err = new Error("Name already exists");
      err.code = "EEXIST";
      throw err;
    }
    throw e;
  }
}

// retrieves metadata for all saved configurations, not data, with the most recently saved first
function listConfigs() {
  const database = getDb();
  // gets the selected row by name
  const results = database.prepare("SELECT name, created_at FROM saved_configs ORDER BY created_at DESC").all();
  return results.map(r => ({ 
    name: r.name, 
    timestamp: (r.created_at && !isNaN(Number(r.created_at))) ? Number(r.created_at) : 0 
  }));
}

// fetches the full configuration data for a specific saved item
function getConfig(name) {
  const database = getDb();
  const row = database.prepare("SELECT name, data, created_at FROM saved_configs WHERE name = ?").get(name);
  if (!row) return null;
  
  // convert the json string back into a javascript object
  let parsed = {};
  try {
    parsed = JSON.parse(row.data);
  } catch (err) {
    console.error("Failed to parse config JSON:", err);
    parsed = {};
  }
  
  
  return { name: row.name, timestamp: row.timestamp, config: parsed }; // returns the name, timestamp and cofnig data
}

// removes a config from the database
function deleteConfig(name) {
  const database = getDb();
  const info = database.prepare("DELETE FROM saved_configs WHERE name = ?").run(name);
  // return true if something was actually deleted
  return info.changes > 0;
}

module.exports = { saveConfig, listConfigs, getConfig, deleteConfig };
