const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const DB_PATH = path.join(__dirname, '..', 'fuel_qr.db');
let db = null;

async function getDB() {
  if (db) return db;
  const SQL = await initSqlJs();

  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }
  return db;
}

function saveDB() {
  if (!db) return;
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(DB_PATH, buffer);
}

// Helper: run a write statement, auto-save
function run(sql, params = []) {
  db.run(sql, params);
  saveDB();
}

// Helper: get single row
function get(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  let result = null;
  if (stmt.step()) {
    result = stmt.getAsObject();
  }
  stmt.free();
  return result;
}

// Helper: get all rows
function all(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const results = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
}

// Helper: insert and return lastInsertRowid
function insert(sql, params = []) {
  db.run(sql, params);
  const id = db.exec("SELECT last_insert_rowid() as id")[0].values[0][0];
  saveDB();
  return id;
}

async function initDB() {
  await getDB();

  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      full_name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT DEFAULT 'user',
      status TEXT DEFAULT 'active',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS vehicles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      vehicle_number TEXT UNIQUE NOT NULL,
      vehicle_type TEXT NOT NULL,
      fuel_type TEXT NOT NULL,
      weekly_quota REAL NOT NULL,
      remaining_quota REAL NOT NULL,
      last_quota_reset DATETIME DEFAULT CURRENT_TIMESTAMP,
      qr_code TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS fuel_transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      vehicle_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      operator_id INTEGER,
      fuel_amount REAL NOT NULL,
      fuel_type TEXT NOT NULL,
      fuel_station TEXT,
      station_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (vehicle_id) REFERENCES vehicles(id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS fuel_stations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      location TEXT,
      status TEXT DEFAULT 'active',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Seed admin
  const admin = get('SELECT id FROM users WHERE email = ?', ['admin@admin.com']);
  if (!admin) {
    const hash = bcrypt.hashSync('admin123', 10);
    insert('INSERT INTO users (full_name, email, password, role) VALUES (?, ?, ?, ?)',
      ['Administrator', 'admin@admin.com', hash, 'admin']);
  }

  // Seed operator
  const operator = get('SELECT id FROM users WHERE email = ?', ['operator@fuel.com']);
  if (!operator) {
    const hash = bcrypt.hashSync('operator123', 10);
    insert('INSERT INTO users (full_name, email, password, role) VALUES (?, ?, ?, ?)',
      ['Fuel Operator', 'operator@fuel.com', hash, 'operator']);
  }

  // Seed stations
  const stationCount = get('SELECT COUNT(*) as count FROM fuel_stations');
  if (stationCount && stationCount.count === 0) {
    insert('INSERT INTO fuel_stations (name, location) VALUES (?, ?)', ['Main Fuel Station', 'City Center']);
    insert('INSERT INTO fuel_stations (name, location) VALUES (?, ?)', ['Highway Station', 'Highway Junction']);
  }

  console.log('✅ Database initialized');
}

module.exports = { getDB, initDB, run, get, all, insert, saveDB };
