const sqlite3 = require("sqlite3").verbose();
const db = new sqlite3.Database("./database.db");

// SAFE COLUMN ADD
function addColumn(table, column, type) {
    db.all(`PRAGMA table_info(${table})`, (err, rows) => {
        if (err) return;

        const exists = rows.some(r => r.name === column);

        if (!exists) {
            db.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
            console.log(`✅ Added ${column} to ${table}`);
        }
    });
}

db.serialize(() => {

    // USERS
    db.run(`CREATE TABLE IF NOT EXISTS users (
        telegram_id INTEGER PRIMARY KEY,
        full_name TEXT,
        country TEXT,
        location TEXT,
        id_photo TEXT,
        balance REAL DEFAULT 0,
        approved INTEGER DEFAULT 0
    )`);

    // PLANS
    db.run(`CREATE TABLE IF NOT EXISTS plans (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT,
        price REAL,
        target REAL,
        days INTEGER,
        status TEXT DEFAULT 'active'
    )`);

    // DEPOSITS
    db.run(`CREATE TABLE IF NOT EXISTS deposits (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        amount REAL,
        proof TEXT,
        status TEXT DEFAULT 'pending'
    )`);

    // WITHDRAWALS (✅ FIXED)
    db.run(`CREATE TABLE IF NOT EXISTS withdrawals (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        amount REAL,
        status TEXT DEFAULT 'pending'
    )`);

    // SETTINGS (wallet storage)
    db.run(`CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT
    )`);

    // ===== AUTO FIX =====
    addColumn("users", "balance", "REAL DEFAULT 0");
    addColumn("users", "approved", "INTEGER DEFAULT 0");

    addColumn("deposits", "status", "TEXT DEFAULT 'pending'");

    addColumn("withdrawals", "amount", "REAL"); // 🔥 YOUR FIX
    addColumn("withdrawals", "status", "TEXT DEFAULT 'pending'");
});

module.exports = db;
