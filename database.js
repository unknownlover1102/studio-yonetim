const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = path.join(__dirname, 'studio.db');

let db;

function getDb() {
  if (!db) {
    db = new sqlite3.Database(DB_PATH, (err) => {
      if (err) console.error('DB bağlantı hatası:', err);
    });
    db.run('PRAGMA foreign_keys = ON');
    db.run('PRAGMA journal_mode = WAL');
  }
  return db;
}

function initDb() {
  return new Promise((resolve, reject) => {
    const database = getDb();
    database.serialize(() => {
      database.run(`CREATE TABLE IF NOT EXISTS gruplar (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        grup_adi TEXT NOT NULL,
        saat TEXT NOT NULL
      )`);

      database.run(`CREATE TABLE IF NOT EXISTS uyeler (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        grup_id INTEGER,
        ad_soyad TEXT NOT NULL,
        telefon TEXT,
        durum TEXT NOT NULL DEFAULT 'Aktif',
        kayit_tarihi TEXT NOT NULL,
        odeme_tarihi TEXT,
        toplam_borc REAL NOT NULL DEFAULT 0,
        FOREIGN KEY (grup_id) REFERENCES gruplar(id) ON DELETE SET NULL
      )`);

      database.run(`CREATE TABLE IF NOT EXISTS dersler (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        grup_id INTEGER,
        tarih TEXT NOT NULL,
        durum TEXT NOT NULL DEFAULT 'İşlendi',
        iptal_gerekcesi TEXT,
        FOREIGN KEY (grup_id) REFERENCES gruplar(id) ON DELETE SET NULL
      )`);

      database.run(`CREATE TABLE IF NOT EXISTS seans_notlari (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ders_id INTEGER,
        uye_id INTEGER NOT NULL,
        katilim_durumu TEXT NOT NULL,
        not_metni TEXT,
        FOREIGN KEY (ders_id) REFERENCES dersler(id) ON DELETE CASCADE,
        FOREIGN KEY (uye_id) REFERENCES uyeler(id) ON DELETE CASCADE
      )`);

      database.run(`CREATE TABLE IF NOT EXISTS tahsilatlar (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        uye_id INTEGER NOT NULL,
        tarih TEXT NOT NULL,
        miktar REAL NOT NULL,
        odeme_turu TEXT NOT NULL,
        FOREIGN KEY (uye_id) REFERENCES uyeler(id) ON DELETE CASCADE
      )`, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  });
}

function runQuery(sql, params = []) {
  return new Promise((resolve, reject) => {
    getDb().run(sql, params, function (err) {
      if (err) reject(err);
      else resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

function allQuery(sql, params = []) {
  return new Promise((resolve, reject) => {
    getDb().all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

function getQuery(sql, params = []) {
  return new Promise((resolve, reject) => {
    getDb().get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

module.exports = { initDb, runQuery, allQuery, getQuery };
