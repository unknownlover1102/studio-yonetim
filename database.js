const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// SQLite'ın ? işaretlerini PostgreSQL'in $1,$2,... formatına çevirir
function toPg(sql) {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

async function initDb() {
  await pool.query(`CREATE TABLE IF NOT EXISTS gruplar (
    id SERIAL PRIMARY KEY,
    grup_adi TEXT NOT NULL,
    saat TEXT NOT NULL
  )`);

  await pool.query(`CREATE TABLE IF NOT EXISTS uyeler (
    id SERIAL PRIMARY KEY,
    grup_id INTEGER REFERENCES gruplar(id) ON DELETE SET NULL,
    ad_soyad TEXT NOT NULL,
    telefon TEXT,
    durum TEXT NOT NULL DEFAULT 'Aktif',
    kayit_tarihi TEXT NOT NULL,
    odeme_tarihi TEXT,
    toplam_borc REAL NOT NULL DEFAULT 0
  )`);

  await pool.query(`CREATE TABLE IF NOT EXISTS dersler (
    id SERIAL PRIMARY KEY,
    grup_id INTEGER REFERENCES gruplar(id) ON DELETE SET NULL,
    tarih TEXT NOT NULL,
    durum TEXT NOT NULL DEFAULT 'İşlendi',
    iptal_gerekcesi TEXT
  )`);

  await pool.query(`CREATE TABLE IF NOT EXISTS seans_notlari (
    id SERIAL PRIMARY KEY,
    ders_id INTEGER REFERENCES dersler(id) ON DELETE CASCADE,
    uye_id INTEGER NOT NULL REFERENCES uyeler(id) ON DELETE CASCADE,
    katilim_durumu TEXT NOT NULL,
    not_metni TEXT
  )`);

  await pool.query(`CREATE TABLE IF NOT EXISTS tahsilatlar (
    id SERIAL PRIMARY KEY,
    uye_id INTEGER NOT NULL REFERENCES uyeler(id) ON DELETE CASCADE,
    tarih TEXT NOT NULL,
    miktar REAL NOT NULL,
    odeme_turu TEXT NOT NULL
  )`);
}

async function runQuery(sql, params = []) {
  const pgSql = toPg(sql);
  const isInsert = sql.trim().toUpperCase().startsWith('INSERT');
  const finalSql = isInsert && !pgSql.includes('RETURNING') ? pgSql + ' RETURNING id' : pgSql;
  const result = await pool.query(finalSql, params);
  return {
    lastID: isInsert ? result.rows[0]?.id : null,
    changes: result.rowCount
  };
}

async function allQuery(sql, params = []) {
  const result = await pool.query(toPg(sql), params);
  return result.rows;
}

async function getQuery(sql, params = []) {
  const result = await pool.query(toPg(sql), params);
  return result.rows[0] || null;
}

module.exports = { initDb, runQuery, allQuery, getQuery };
