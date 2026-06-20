const express = require('express');
const path = require('path');
const { initDb, runQuery, allQuery, getQuery } = require('./database');

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── BAŞLANGIÇTA: Askı kontrol fonksiyonu ──
async function kontrolOdemeAskilari() {
  const bugun = new Date().toISOString().split('T')[0];
  await runQuery(`
    UPDATE uyeler
    SET durum = 'Askıda'
    WHERE durum = 'Aktif'
      AND odeme_tarihi IS NOT NULL
      AND odeme_tarihi < ?
      AND toplam_borc > 0
  `, [bugun]);
}

// ══════════════════════════════════════════
//  GRUPLAR
// ══════════════════════════════════════════

app.get('/api/gruplar', async (req, res) => {
  try {
    const gruplar = await allQuery(`
      SELECT g.*, COUNT(u.id) as uye_sayisi
      FROM gruplar g
      LEFT JOIN uyeler u ON u.grup_id = g.id
      GROUP BY g.id
      ORDER BY g.saat
    `);
    res.json(gruplar);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/gruplar', async (req, res) => {
  const { grup_adi, saat } = req.body;
  if (!grup_adi || !saat) return res.status(400).json({ error: 'Eksik alan' });
  try {
    const r = await runQuery('INSERT INTO gruplar (grup_adi, saat) VALUES (?, ?)', [grup_adi, saat]);
    res.json({ id: r.lastID, grup_adi, saat });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/gruplar/:id', async (req, res) => {
  const { grup_adi, saat } = req.body;
  try {
    await runQuery('UPDATE gruplar SET grup_adi=?, saat=? WHERE id=?', [grup_adi, saat, req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/gruplar/:id', async (req, res) => {
  try {
    await runQuery('UPDATE uyeler SET grup_id = NULL WHERE grup_id = ?', [req.params.id]);
    await runQuery('DELETE FROM gruplar WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ══════════════════════════════════════════
//  ÜYELER
// ══════════════════════════════════════════

app.get('/api/uyeler', async (req, res) => {
  try {
    const uyeler = await allQuery(`
      SELECT u.*, g.grup_adi, g.saat as grup_saati
      FROM uyeler u
      LEFT JOIN gruplar g ON u.grup_id = g.id
      ORDER BY u.ad_soyad
    `);
    res.json(uyeler);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/uyeler/grup/:grupId', async (req, res) => {
  try {
    const uyeler = await allQuery(`
      SELECT * FROM uyeler WHERE grup_id = ? ORDER BY ad_soyad
    `, [req.params.grupId]);
    res.json(uyeler);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/uyeler/:id', async (req, res) => {
  try {
    const uye = await getQuery(`
      SELECT u.*, g.grup_adi, g.saat as grup_saati
      FROM uyeler u
      LEFT JOIN gruplar g ON u.grup_id = g.id
      WHERE u.id = ?
    `, [req.params.id]);
    if (!uye) return res.status(404).json({ error: 'Üye bulunamadı' });

    const notlar = await allQuery(`
      SELECT sn.*, d.tarih, d.durum as ders_durum, g.grup_adi
      FROM seans_notlari sn
      LEFT JOIN dersler d ON sn.ders_id = d.id
      LEFT JOIN gruplar g ON d.grup_id = g.id
      WHERE sn.uye_id = ?
      ORDER BY d.tarih DESC
    `, [req.params.id]);

    const tahsilatlar = await allQuery(`
      SELECT * FROM tahsilatlar WHERE uye_id = ? ORDER BY tarih DESC
    `, [req.params.id]);

    res.json({ ...uye, notlar, tahsilatlar });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/uyeler', async (req, res) => {
  const { grup_id, ad_soyad, telefon, odeme_tarihi, toplam_borc } = req.body;
  if (!ad_soyad) return res.status(400).json({ error: 'Ad soyad zorunlu' });
  const kayit_tarihi = new Date().toISOString().split('T')[0];
  try {
    const r = await runQuery(`
      INSERT INTO uyeler (grup_id, ad_soyad, telefon, durum, kayit_tarihi, odeme_tarihi, toplam_borc)
      VALUES (?, ?, ?, 'Aktif', ?, ?, ?)
    `, [grup_id || null, ad_soyad, telefon || null, kayit_tarihi, odeme_tarihi || null, toplam_borc || 0]);
    res.json({ id: r.lastID });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/uyeler/:id', async (req, res) => {
  const { grup_id, ad_soyad, telefon, durum, odeme_tarihi, toplam_borc } = req.body;
  try {
    await runQuery(`
      UPDATE uyeler SET grup_id=?, ad_soyad=?, telefon=?, durum=?, odeme_tarihi=?, toplam_borc=?
      WHERE id=?
    `, [grup_id || null, ad_soyad, telefon || null, durum, odeme_tarihi || null, toplam_borc || 0, req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/uyeler/:id', async (req, res) => {
  try {
    await runQuery('DELETE FROM uyeler WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── TAHSİLAT ──
app.post('/api/uyeler/:id/tahsilat', async (req, res) => {
  const { miktar, odeme_turu } = req.body;
  if (!miktar || !odeme_turu) return res.status(400).json({ error: 'Eksik alan' });
  const tarih = new Date().toISOString().split('T')[0];
  try {
    const uye = await getQuery('SELECT * FROM uyeler WHERE id = ?', [req.params.id]);
    if (!uye) return res.status(404).json({ error: 'Üye bulunamadı' });

    const yeniBorc = Math.max(0, (uye.toplam_borc || 0) - parseFloat(miktar));
    const yeniDurum = yeniBorc <= 0 ? 'Aktif' : uye.durum;

    await runQuery(`
      INSERT INTO tahsilatlar (uye_id, tarih, miktar, odeme_turu) VALUES (?, ?, ?, ?)
    `, [req.params.id, tarih, miktar, odeme_turu]);

    await runQuery(`
      UPDATE uyeler SET toplam_borc = ?, durum = ? WHERE id = ?
    `, [yeniBorc, yeniDurum, req.params.id]);

    res.json({ success: true, yeniBorc, yeniDurum });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ══════════════════════════════════════════
//  DERSLER
// ══════════════════════════════════════════

app.get('/api/dersler', async (req, res) => {
  const { tarih, grup_id } = req.query;
  try {
    let sql = `
      SELECT d.*, g.grup_adi, g.saat
      FROM dersler d
      LEFT JOIN gruplar g ON d.grup_id = g.id
      WHERE 1=1
    `;
    const params = [];
    if (tarih) { sql += ' AND d.tarih = ?'; params.push(tarih); }
    if (grup_id) { sql += ' AND d.grup_id = ?'; params.push(grup_id); }
    sql += ' ORDER BY g.saat';
    const dersler = await allQuery(sql, params);
    res.json(dersler);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/dersler/:id', async (req, res) => {
  try {
    const ders = await getQuery(`
      SELECT d.*, g.grup_adi, g.saat
      FROM dersler d
      LEFT JOIN gruplar g ON d.grup_id = g.id
      WHERE d.id = ?
    `, [req.params.id]);
    if (!ders) return res.status(404).json({ error: 'Ders bulunamadı' });

    const notlar = await allQuery(`
      SELECT sn.*, u.ad_soyad, u.durum as uye_durum
      FROM seans_notlari sn
      JOIN uyeler u ON sn.uye_id = u.id
      WHERE sn.ders_id = ?
    `, [req.params.id]);

    res.json({ ...ders, notlar });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Ders İptal Et
app.post('/api/dersler/iptal', async (req, res) => {
  const { grup_id, tarih, iptal_gerekcesi } = req.body;
  if (!grup_id || !tarih) return res.status(400).json({ error: 'Eksik alan' });
  try {
    // Varsa güncelle, yoksa ekle
    let ders = await getQuery('SELECT * FROM dersler WHERE grup_id = ? AND tarih = ?', [grup_id, tarih]);
    let dersId;
    if (ders) {
      await runQuery('UPDATE dersler SET durum=?, iptal_gerekcesi=? WHERE id=?',
        ['İptal Edildi', iptal_gerekcesi, ders.id]);
      dersId = ders.id;
      // Eski seans notlarını temizle
      await runQuery('DELETE FROM seans_notlari WHERE ders_id = ?', [dersId]);
    } else {
      const r = await runQuery(
        'INSERT INTO dersler (grup_id, tarih, durum, iptal_gerekcesi) VALUES (?, ?, ?, ?)',
        [grup_id, tarih, 'İptal Edildi', iptal_gerekcesi]
      );
      dersId = r.lastID;
    }

    // Gruptaki tüm üyelere otomatik not
    const uyeler = await allQuery('SELECT id FROM uyeler WHERE grup_id = ?', [grup_id]);
    for (const uye of uyeler) {
      await runQuery(`
        INSERT INTO seans_notlari (ders_id, uye_id, katilim_durumu, not_metni)
        VALUES (?, ?, '-', ?)
      `, [dersId, uye.id, `Ders iptal edildi. Gerekçe: ${iptal_gerekcesi}`]);
    }

    res.json({ success: true, dersId });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Ders İşle (toplu seans notları kaydet)
app.post('/api/dersler/isle', async (req, res) => {
  const { grup_id, tarih, notlar } = req.body;
  // notlar: [{uye_id, katilim_durumu, not_metni}]
  if (!grup_id || !tarih || !notlar) return res.status(400).json({ error: 'Eksik alan' });
  try {
    let ders = await getQuery('SELECT * FROM dersler WHERE grup_id = ? AND tarih = ?', [grup_id, tarih]);
    let dersId;
    if (ders) {
      await runQuery('UPDATE dersler SET durum=?, iptal_gerekcesi=NULL WHERE id=?', ['İşlendi', ders.id]);
      dersId = ders.id;
      await runQuery('DELETE FROM seans_notlari WHERE ders_id = ?', [dersId]);
    } else {
      const r = await runQuery(
        'INSERT INTO dersler (grup_id, tarih, durum) VALUES (?, ?, ?)',
        [grup_id, tarih, 'İşlendi']
      );
      dersId = r.lastID;
    }

    for (const n of notlar) {
      await runQuery(`
        INSERT INTO seans_notlari (ders_id, uye_id, katilim_durumu, not_metni)
        VALUES (?, ?, ?, ?)
      `, [dersId, n.uye_id, n.katilim_durumu, n.not_metni || null]);
    }

    res.json({ success: true, dersId });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ══════════════════════════════════════════
//  DASHBOARD / RAPOR
// ══════════════════════════════════════════

app.get('/api/dashboard', async (req, res) => {
  const bugun = new Date().toISOString().split('T')[0];
  try {
    // Bugünkü dersler
    const dersler = await allQuery(`
      SELECT d.*, g.grup_adi, g.saat
      FROM dersler d
      LEFT JOIN gruplar g ON d.grup_id = g.id
      WHERE d.tarih = ?
      ORDER BY g.saat
    `, [bugun]);

    // Bugünkü seans istatistikleri
    const seansStats = await getQuery(`
      SELECT
        COUNT(CASE WHEN sn.katilim_durumu = '+' THEN 1 END) as toplam_katilan,
        COUNT(CASE WHEN sn.katilim_durumu = 'İkame' THEN 1 END) as toplam_ikame,
        COUNT(CASE WHEN sn.katilim_durumu = '-' THEN 1 END) as toplam_katilmayan
      FROM seans_notlari sn
      JOIN dersler d ON sn.ders_id = d.id
      WHERE d.tarih = ? AND d.durum = 'İşlendi'
    `, [bugun]);

    // Bugünkü finans
    const finans = await allQuery(`
      SELECT odeme_turu, SUM(miktar) as toplam
      FROM tahsilatlar
      WHERE tarih = ?
      GROUP BY odeme_turu
    `, [bugun]);

    // Genel üye durumu
    const uyeDurum = await getQuery(`
      SELECT
        COUNT(CASE WHEN durum = 'Aktif' THEN 1 END) as aktif,
        COUNT(CASE WHEN durum = 'Askıda' THEN 1 END) as askida
      FROM uyeler
    `);

    const askidakiUyeler = await allQuery(`
      SELECT u.id, u.ad_soyad, u.toplam_borc, u.odeme_tarihi, g.grup_adi
      FROM uyeler u
      LEFT JOIN gruplar g ON u.grup_id = g.id
      WHERE u.durum = 'Askıda'
      ORDER BY u.ad_soyad
    `);

    // Ders detayları
    const dersDetay = [];
    for (const ders of dersler) {
      if (ders.durum === 'İşlendi') {
        const stats = await getQuery(`
          SELECT
            COUNT(CASE WHEN katilim_durumu = '+' THEN 1 END) as katilan,
            COUNT(CASE WHEN katilim_durumu = 'İkame' THEN 1 END) as ikame,
            COUNT(CASE WHEN katilim_durumu = '-' THEN 1 END) as katilmayan
          FROM seans_notlari WHERE ders_id = ?
        `, [ders.id]);
        dersDetay.push({ ...ders, stats });
      } else {
        dersDetay.push({ ...ders, stats: null });
      }
    }

    const toplamCiro = finans.reduce((s, f) => s + f.toplam, 0);

    res.json({
      tarih: bugun,
      dersler: dersDetay,
      islenmisDers: dersler.filter(d => d.durum === 'İşlendi').length,
      iptalDers: dersler.filter(d => d.durum === 'İptal Edildi').length,
      seansStats,
      finans,
      toplamCiro,
      uyeDurum,
      askidakiUyeler
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ══════════════════════════════════════════
//  SUNUCU BAŞLAT
// ══════════════════════════════════════════

initDb().then(async () => {
  await kontrolOdemeAskilari();
  app.listen(PORT, () => {
    console.log(`✅ Stüdyo Yönetim Sistemi çalışıyor: http://localhost:${PORT}`);
  });
}).catch(err => {
  console.error('Başlatma hatası:', err);
  process.exit(1);
});
