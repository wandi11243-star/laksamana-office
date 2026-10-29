/* Uji modul Campaign (deploy/campaign/ + konten-mysql/lib_campaign.php).
 *
 *   JSDOM_PATH=/jalur/ke/jsdom node tools/uji-campaign.js
 *
 * Tiga lapis:
 *  1. halamannya DIJALANKAN di jsdom dengan server tiruan yang HIDUP (apa yang
 *     ditulis dipulangkan campaignGet berikutnya);
 *  2. aturan layar yang menahan kiriman diukur lewat JUMLAH POST, bukan pesan;
 *  3. sisi PHP: sintaks lewat php-parser + kontrak atas sumbernya (tidak ada
 *     php di mesin pengembangan).
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const { JSDOM } = require(process.env.JSDOM_PATH || 'jsdom');

let ok = 0, gagal = 0, lewat = 0;
function cek(nama, syarat, info) {
  if (syarat) { ok++; console.log('  OK   ' + nama); }
  else { gagal++; console.log('  GAGAL ' + nama + (info ? '  [' + info + ']' : '')); }
}
const tunggu = ms => new Promise(r => setTimeout(r, ms));

const HTML = fs.readFileSync(path.join(ROOT, 'deploy/konten/analytics/index.html'), 'utf8');
const PHP_LIB = fs.readFileSync(path.join(ROOT, 'konten-mysql/lib_campaign.php'), 'utf8');
const PHP_API = fs.readFileSync(path.join(ROOT, 'konten-mysql/api.php'), 'utf8');
const PHP_CB = fs.readFileSync(path.join(ROOT, 'konten-mysql/campaign-tiktok.php'), 'utf8');

function hariIni() { return new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10); }
function geser(h) { return new Date(Date.now() + 7 * 3600e3 + h * 864e5).toISOString().slice(0, 10); }

/* Iklan uji: 4 iklan "Chat dimulai" (median biaya/chat = Rp15.000),
   satu berbiaya kecil, satu tanpa hasil. */
const IKLAN_UJI = [
  { ad_id: 'a1', nama: 'Iklan murah', kampanye: 'K1', status: 'ACTIVE', spend: 100000, impresi: 20000, reach: 15000, ctr: 1.5, hasil_label: 'Chat dimulai', hasil_n: 20, ig_media: 'm1', post: { judul: 'Reel Night of King', url: 'https://www.instagram.com/reel/KODE1/', views: 272000, tanggal: '2026-07-21' } },  // 5.000/chat -> works
  { ad_id: 'a2', nama: 'Iklan median A', kampanye: 'K1', status: 'ACTIVE', spend: 150000, impresi: 20000, reach: 15000, ctr: 1, hasil_label: 'Chat dimulai', hasil_n: 10, ig_media: 'm1', post: { judul: 'Reel Night of King', url: 'https://www.instagram.com/reel/KODE1/', views: 272000, tanggal: '2026-07-21' } }, // 15.000
  { ad_id: 'a3', nama: 'Iklan median B', kampanye: 'K1', status: 'PAUSED', spend: 160000, impresi: 20000, reach: 15000, ctr: 1, hasil_label: 'Chat dimulai', hasil_n: 10 }, // 16.000
  { ad_id: 'a4', nama: 'Iklan mahal', kampanye: 'K2', status: 'ACTIVE', spend: 300000, impresi: 20000, reach: 15000, ctr: 0.5, hasil_label: 'Chat dimulai', hasil_n: 10 }, // 30.000 -> tidak
  { ad_id: 'a5', nama: 'Iklan kecil', kampanye: 'K2', status: 'ACTIVE', spend: 20000, impresi: 2000, reach: 1500, ctr: 1, hasil_label: 'Chat dimulai', hasil_n: 1 },
  { ad_id: 'a6', nama: 'Iklan nol hasil', kampanye: 'K2', status: 'ACTIVE', spend: 90000, impresi: 9000, reach: 8000, ctr: 0.2, hasil_label: 'Chat dimulai', hasil_n: 0 }
];

/* Data harian tiruan: 60 hari Instagram. Hari ganjil (dari hari ini) beriklan
   Rp50.000 dan views-nya 2.000; hari genap tanpa iklan, views 1.000.
   Periode 30 hari terakhir views dobel dari 30 hari sebelumnya (+100%). */
function tumbuhUji(hari) {
  const kini = hariIni(), h = [], ik = [];
  for (let i = 1; i <= 60; i++) {
    const t = geser(-i), lama = i > 30, beriklan = i % 2 === 1;
    const v = (beriklan ? 2000 : 1000) / (lama ? 2 : 1);
    h.push({ platform: 'instagram', tgl: t, views: v, reach: v / 2, likes: 10, comments: 2, shares: 1, saves: 1, interaksi: 14, follower_baru: beriklan ? 6 : 2, follower: null });
    if (beriklan) ik.push({ tgl: t, spend: 50000, impresi: 4000, reach: 3000, klik: 20, video_view: 500, interaksi: 40, chat: 3 });
  }
  h.push({ platform: 'tiktok', tgl: geser(-2), follower: 1000, likes_total: 5000, jml_post: 300 });
  h.push({ platform: 'tiktok', tgl: geser(-1), follower: 1010, likes_total: 5100, jml_post: 301 });
  return { hari, kini, harian: h, iklan: ik, iklanAda: true };
}

/* ---------- Server tiruan HIDUP ---------- */
function buatServer(opsi) {
  opsi = opsi || {};
  const S = {
    insight: opsi.insightLama ? [{ id: 'il', platform: 'TikTok', kategori: 'Waktu Tayang', temuan: 'Temuan lama', url: 'https://www.tiktok.com/@x/video/9', tgl_tayang: '2026-09-01', metrik: '', aksi: '', sumber: 'manual', arsip: 0 }] : [], jadwal: [
      { id: 'j1', platform: 'TikTok', judul: 'Teaser DJ', caption: 'Malam minggu!', tanggal: geser(-1), jam: '19:00', status: 'TERJADWAL', insight_id: '', pic: '', tautan: '', catatan: '' },
      { id: 'j2', platform: 'Instagram', judul: 'Menu baru', caption: '', tanggal: geser(3), jam: '18:30', status: 'TERJADWAL', insight_id: '', pic: '', tautan: '', catatan: '' }
    ],
    riset: [{ id: 'r1', jenis: 'tren', topik: 'Live music', platform: 'TikTok', catatan: '', model: 'claude-opus-5-5', oleh: 'Uji', at: Date.now(),
      hasil: { ringkasan: 'Ringkasan uji', pola: [{ temuan: 'Pola A', bukti: 'Goyang', aksi: 'Aksi A' }], tren: [{ judul: 'Tren B', penjelasan: 'x', platform: 'TikTok', keyakinan: 'sedang' }],
        ide: [{ judul: 'Ide C', platform: 'TikTok', format: 'Video', hook: 'Hook C', caption: 'Caption C', hari: 'Sabtu 18.30', alasan: 'karena' }],
        waktuTayang: ['Sabtu 18.30'], hashtag: ['#laksamanamuda'], peringatan: ['cek'] } }],
    post: [
      /* Sengaja TIDAK terurut views: kalau pengurutannya dicabut, urutan server ini yang tampil. */
      { platform: 'tiktok', post_id: '2', judul: 'Beli special combo', url: 'https://www.tiktok.com/@x/video/2', tayang_at: Date.parse('2026-09-03T05:00:00Z'), views: 98300, likes: 1000, comments: 13, shares: 422 },
      { platform: 'tiktok', post_id: '1', judul: 'Goyang terus babe', url: 'https://www.tiktok.com/@x/video/1', tayang_at: Date.parse('2026-09-26T05:00:00Z'), views: 109700, likes: 1900, comments: 38, shares: 343 }
    ],
    postInfo: { total: 2, riwayatSelesai: false },
    bank: [
      { id: 'b1', judul: 'Ide bank satu', platform: 'TikTok', format: 'Video', pilar: 'Topik Lokal', hook: 'Hook B1', caption: 'Caption B1', tanggal: geser(2), jam: '19:00', alasan: 'dari insight', sumber: 'ai', status: 'IDE', jadwal_id: '', dibuat_oleh: 'Uji' },
      { id: 'b2', judul: 'Ide terjadwal', platform: 'Instagram', format: 'Reels', pilar: '', hook: '', caption: '', tanggal: geser(4), jam: '', alasan: '', sumber: 'manual', status: 'TERJADWAL', jadwal_id: 'j2', dibuat_oleh: 'Uji' },
      { id: 'b3', judul: 'Ide arsip', platform: 'TikTok', format: '', pilar: '', hook: '', caption: '', tanggal: null, jam: '', alasan: '', sumber: 'riset', status: 'ARSIP', jadwal_id: '', dibuat_oleh: 'Uji' }
    ],
    akun: (opsi && opsi.akun) || [{ platform: 'tiktok', nama: 'Laksamana Muda Pekanbaru', terhubung: true, sync_at: Date.now(), sync_galat: '',
      scope: 'user.info.basic,user.info.profile,user.info.stats,video.list', stats_ada: 1, follower: 12345, following: 8, likes_total: 456789, jml_video: 321,
      terverifikasi: 1, bio: 'Coffee & live music Pekanbaru', profil_url: 'https://www.tiktok.com/@laksamanamuda.id', avatar: 'https://p16.tiktokcdn.com/a.jpg' }],
    konten: [
      { platform: 'instagram', judul: 'Reels kopi', url: 'https://instagram.com/p/a', tanggal: '2026-09-10', views: 5000, likes: 400, comments: 10, shares: 5,
        m: { reach: 4200, impr: 6100, views: 5000, likes: 400, comments: 10, shares: 5, saves: 33, cta: 12, follow: 7 } },
      /* Tautan SAMA dengan postingan TikTok 1 — tidak boleh muncul dua kali. */
      { platform: 'tiktok', judul: 'Goyang (dari Konten)', url: 'https://www.tiktok.com/@x/video/1', tanggal: '2026-09-26', views: 1, likes: 0, comments: 0, shares: 0,
        /* views 1 di sini TIDAK boleh mengalahkan 109.700 dari API. */
        m: { views: 1, reach: 88000, saves: 512, cta: 40, follow: 150 } }
    ],
    setting: { aiSiap: true, aiModel: 'muse-spark-1.3-contributor', kategori: ['Hook 3 Detik & Retensi', 'Topik Lokal'],
      ai: [{ id: 'meta', label: 'Meta (Muse Spark)', model: ['muse-spark-1.3-contributor', 'muse-spark-1.3'], modelPakai: 'muse-spark-1.3-contributor', siap: true, dariConfig: false },
           { id: 'anthropic', label: 'Anthropic (Claude)', model: ['claude-opus-5-5', 'claude-sonnet-5-5'], modelPakai: 'claude-opus-5-5', siap: false, dariConfig: false }],
      profil: 'Profil', tiktokSiap: true, redirectUri: 'https://dev.laksamanamuda.id/konten-api-mysql/campaign-tiktok.php', tiktokScope: 'user.info.basic,user.info.profile,user.info.stats,video.list' },
    boleh: { admin: !!opsi.admin }
  };
  const log = [];
  function fetchTiruan(url, init) {
    const b = JSON.parse(init.body);
    log.push(b);
    let data;
    if (b.action === 'campaignGet') data = JSON.parse(JSON.stringify(S));
    else if (b.action === 'campaignInsightSimpan') {
      const d = b.data;
      if (d.id) Object.assign(S.insight.find(x => x.id === d.id), { temuan: d.temuan });
      else S.insight.push({ id: 'i' + (S.insight.length + 1), platform: d.platform, kategori: d.kategori, temuan: d.temuan, url: d.url, tgl_tayang: d.tglTayang, metrik: d.metrik, aksi: d.aksi, sumber: d.sumber, arsip: 0 });
      data = { id: 'x' };
    } else if (b.action === 'campaignJadwalSimpan') {
      const d = b.data;
      const j = { id: d.id || 'j' + (S.jadwal.length + 1), platform: d.platform, judul: d.judul, caption: d.caption, tanggal: d.tanggal, jam: d.jam, status: d.status, insight_id: d.insightId, pic: d.pic, tautan: d.tautan, catatan: d.catatan };
      const lama = S.jadwal.findIndex(x => x.id === j.id);
      if (lama > -1) S.jadwal[lama] = j; else S.jadwal.push(j);
      data = { id: j.id };
      if (d.bankId) { const bb = S.bank.find(x => x.id === d.bankId); if (bb) { bb.status = 'TERJADWAL'; bb.jadwal_id = j.id; } }
    } else if (b.action === 'campaignBankGenerate') {
      S.bank.push({ id: 'bg1', judul: 'Ide dari AI', platform: 'TikTok', format: 'Video', pilar: '', hook: 'H', caption: 'C', tanggal: b.data.dari, jam: '18:00', alasan: '', sumber: 'ai', status: 'IDE', jadwal_id: '', dibuat_oleh: 'Uji' });
      data = { jumlah: 1, ringkasan: 'Strategi uji', model: 'm' };
    } else if (b.action === 'campaignBankSimpan') {
      const d = b.data;
      if (d.id) Object.assign(S.bank.find(x => x.id === d.id), { judul: d.judul });
      else S.bank.push({ id: 'bn' + S.bank.length, judul: d.judul, platform: d.platform, format: d.format || '', pilar: d.pilar || '', hook: d.hook || '', caption: d.caption || '', tanggal: d.tanggal || null, jam: d.jam || '', alasan: d.alasan || '', sumber: d.sumber || 'manual', status: 'IDE', jadwal_id: '', dibuat_oleh: 'Uji' });
      data = { id: 'x' };
    } else if (b.action === 'campaignBankHapus') {
      const ix = S.bank.findIndex(x => x.id === b.data.id && x.status === 'ARSIP');
      if (ix < 0) return Promise.resolve({ text: () => Promise.resolve(JSON.stringify({ ok: false, error: 'Hanya ide yang sudah diarsipkan yang bisa dihapus.' })) });
      S.bank.splice(ix, 1); data = { id: b.data.id };
    } else if (b.action === 'campaignBankArsip') {
      const bb = S.bank.find(x => x.id === b.data.id); bb.status = b.data.arsip ? 'ARSIP' : (bb.jadwal_id ? 'TERJADWAL' : 'IDE'); data = { id: bb.id };
    } else if (b.action === 'campaignInsightArsip') {
      S.insight.find(x => x.id === b.data.id).arsip = b.data.arsip ? 1 : 0; data = { ok: true };
    } else if (b.action === 'campaignInsightAI') data = { usulan: [{ platform: 'TikTok', kategori: 'Hook 3 Detik & Retensi', temuan: 'Usulan AI', url: 'https://www.tiktok.com/@x/video/1', tglTayang: '2026-09-26', metrik: '109 rb', aksi: 'Pakai' }] };
    else if (b.action === 'campaignTiktokSync') data = { jumlah: 2, total: 2, riwayatSelesai: false };
    else if (b.action === 'campaignTop') data = topTiruan(S, b.data);
    else if (b.action === 'campaignAds') data = { periode: b.data.periode, syncAt: Date.now(), baris: IKLAN_UJI };
    else if (b.action === 'campaignTumbuh') data = tumbuhUji(b.data.hari);
    else if (b.action === 'campaignAdsAI') data = { ringkasan: 'Ringkasan iklan uji', model: 'm', lanjutkan: [{ ad_id: 'a1', nama: 'Iklan murah', alasan: 'Biaya per chat Rp5.000', saran: 'Naikkan budget 20%' }],
      perbaiki: [], hentikan: [{ ad_id: 'a4', nama: 'Iklan mahal', alasan: 'Rp30.000 per chat', saran: '' }], saranUmum: ['Uji hook baru'] };
    else if (b.action === 'campaignAdsJalan') data = { at: Date.now(),
      akun: [{ id: '123', nama: 'Akun Laksamana', mataUang: 'IDR', status: 1, totalBelanja: 9000000, tagihan: 0, batas: 10000000, sisaBatas: 1000000, bulanIni: 2500000, hariIni: 45000 }],
      kampanye: [
        { id: 'c1', akun: '123', nama: 'Kampanye Buat Acara', objective: 'OUTCOME_ENGAGEMENT', budgetHarian: 30000, budgetTotal: 0, budgetDi: 'kampanye', mulai: geser(-9), selesai: '', hariIni: 25000, bulanIni: 300000, sejakMulai: 270000, iklanAktif: 1, adId: 'a1' },
        { id: 'c2', akun: '123', nama: 'Kampanye Live Music', objective: 'MESSAGES', budgetHarian: 50000, budgetTotal: 0, budgetDi: 'set iklan', mulai: geser(-3), selesai: geser(7), hariIni: 20000, bulanIni: 150000, sejakMulai: 150000, iklanAktif: 2, adId: 'a2' }] };
    else if (b.action === 'campaignAdsInfo') data = { mataUang: 'IDR',
      iklan: { tingkat: 'iklan', id: b.data.adId, nama: 'Iklan murah', status: S._adStatus || 'ACTIVE', efektif: 'ACTIVE', budgetJenis: '', budget: 0 },
      adset: { tingkat: 'adset', id: '9001', nama: 'Set A', status: 'ACTIVE', efektif: 'ACTIVE', budgetJenis: 'harian', budget: S._budget || 100000 },
      kampanye: { tingkat: 'kampanye', id: '9002', nama: 'Kampanye A', status: 'ACTIVE', efektif: 'ACTIVE', budgetJenis: '', budget: 0 }, log: S._adsLog || [] };
    else if (b.action === 'campaignAdsUbah') {
      if (!opsi || !opsi.admin) return Promise.resolve({ text: () => Promise.resolve(JSON.stringify({ ok: false, error: 'Mengubah iklan hanya untuk admin modul Campaign.' })) });
      if (b.data.status) S._adStatus = b.data.status;
      if (b.data.budget) S._budget = b.data.budget;
      S._adsLog = (S._adsLog || []).concat([{ at: Date.now(), oleh: 'Uji', tingkat: b.data.tingkat, nama: 'x', aksi: b.data.status ? 'jeda' : 'budget harian', sebelum: '100000', sesudah: String(b.data.budget || '') }]);
      data = { ok: true };
    }
    else data = { ok: true };
    return Promise.resolve({ text: () => Promise.resolve(JSON.stringify({ ok: true, data })) });
  }
  /* Tiruan cg_top(): gabung TikTok + Input Performa (tautan sama tidak dua
     kali), saring platform & tanggal tayang WIB, urut, potong per halaman. */
  function topTiruan(S, q) {
    const norm = p => { const k = String(p || '').toLowerCase(); return k.includes('tiktok') ? 'TikTok' : (k.includes('insta') ? 'Instagram' : (k.includes('you') ? 'YouTube' : p)); };
    const semua = [], url = {};
    const KOL = ['reach', 'impr', 'views', 'likes', 'comments', 'shares', 'saves', 'cta', 'follow'];
    const rinci = (api, man) => { const o = {}; KOL.forEach(k => { o[k] = api && k in api ? { v: api[k], s: 'api' } : (man && man[k] != null && man[k] !== '' ? { v: +man[k], s: 'manual' } : { v: null, s: '' }); }); return o; };
    const kpUrl = {}; S.konten.forEach(k => { if (k.url && norm(k.platform) === 'TikTok') kpUrl[k.url] = k; });
    S.post.forEach(p => { const man = kpUrl[p.url]; semua.push({ rinci: rinci({ views: p.views, likes: p.likes, comments: p.comments, shares: p.shares }, man && man.m), tercatat: !!man, platform: norm(p.platform), judul: p.judul, url: p.url, tanggal: new Date(p.tayang_at + 7 * 3600e3).toISOString().slice(0, 10), views: p.views, likes: p.likes, comments: p.comments, shares: p.shares, sumber: 'tiktok' }); url[p.url] = 1; });
    S.konten.forEach(k => { if (k.url && url[k.url]) return; semua.push({ rinci: rinci(null, k.m), tercatat: true, platform: norm(k.platform), judul: k.judul, url: k.url, tanggal: k.tanggal, views: k.views, likes: k.likes, comments: k.comments, shares: k.shares, sumber: 'konten' }); });
    let l = semua.filter(e => (!q.q || e.judul.toLowerCase().includes(String(q.q).toLowerCase())) && (!q.platform || e.platform === q.platform) && (!q.dari || (e.tanggal && e.tanggal >= q.dari)) && (!q.sampai || (e.tanggal && e.tanggal <= q.sampai)));
    l.forEach(e => { e.er = e.views > 0 ? (e.likes + e.comments + e.shares) / e.views : null; });
    l.sort((a, b) => q.urut === 'er' ? ((a.er == null) - (b.er == null) || (b.er - a.er)) : b.views - a.views);
    const per = q.per || 10, halMaks = Math.max(1, Math.ceil(l.length / per)), hal = Math.min(Math.max(1, q.hal || 1), halMaks);
    return { baris: l.slice((hal - 1) * per, hal * per), total: l.length, hal, per, halMaks };
  }
  return { S, log, fetchTiruan };
}

async function buka(opsi) {
  const srv = buatServer(opsi);
  const dom = new JSDOM(HTML, {
    url: 'https://dev.laksamanamuda.id/konten/analytics/' + ((opsi && opsi.hash) || ''),
    runScripts: 'dangerously', pretendToBeVisual: true,
    beforeParse(w) {
      w.localStorage.setItem('lm_session', JSON.stringify({ name: 'Uji Coba', token: 'tok-uji', expiry: Date.now() + 3600e3, modules: ['campaign'] }));
      w.fetch = srv.fetchTiruan;
      w.confirm = () => true;
    }
  });
  await tunggu(60);
  return { dom, w: dom.window, d: dom.window.document, srv };
}
function klik(d, sel) { const el = d.querySelector(sel); if (!el) throw new Error('tidak ada ' + sel); el.dispatchEvent(new d.defaultView.MouseEvent('click', { bubbles: true })); }

(async () => {
  console.log('\n== Boot & Insight ==');
  {
    const { w, d, srv } = await buka();
    const app = d.getElementById('app').innerHTML;
    cek('campaignGet dipanggil dengan token sesi Office', srv.log.some(b => b.action === 'campaignGet' && b.sesi === 'tok-uji'));
    cek('halaman Insight tergambar', /Konten terpopuler/.test(app));
    cek('kartu TikTok menyebut akun terhubung', /Laksamana Muda Pekanbaru/.test(app));
    cek('Konten terpopuler diminta PER HALAMAN dari server (campaignTop)', srv.log.some(b => b.action === 'campaignTop' && b.data.per === 10 && b.data.hal === 1));
    cek('campaignGet TIDAK lagi dipakai untuk daftar postingan (kartu dibaca dari campaignTop)', /Menampilkan 1–3 dari 3 konten/.test(app), (app.match(/Menampilkan[^<]*/) || [''])[0]);
    cek('urutan bawaan: views terbanyak di atas', /Goyang terus babe[\s\S]*Beli special combo[\s\S]*Reels kopi/.test(app));
    cek('ER dihitung (likes+komentar+share)/views', /ER 2,1%/.test(app));
    cek('menu Pengaturan TIDAK tampil untuk bukan admin', !/data-v="pengaturan"/.test(d.getElementById('nav').innerHTML));
    cek('nav Kalender menandai 1 jadwal yang terlewat', /<span class="badge"[^>]*>1<\/span>/.test(d.getElementById('nav').innerHTML));

    /* Urut menurut engagement: Reels kopi ER 8,3% harus naik ke atas. */
    klik(d, '[data-a="top-urut"][data-v="er"]'); await tunggu(40);
    cek('urut engagement menaikkan konten ER tertinggi', /Reels kopi[\s\S]*Goyang terus babe/.test(d.getElementById('app').innerHTML));
    klik(d, '[data-a="top-plat"][data-v="Instagram"]'); await tunggu(40);
    cek('saring platform Instagram', !/Goyang terus babe/.test(d.getElementById('app').innerHTML.split('Insight otomatis')[0]));
    klik(d, '[data-a="top-plat"][data-v=""]'); await tunggu(40);
    klik(d, '[data-a="top-urut"][data-v="views"]'); await tunggu(40);

    /* Rentang 7 hari: dikirim sebagai dari/sampai tanggal tayang (dari = 6
       hari sebelum hari ini WIB), dan postingan September tersaring habis. */
    klik(d, '[data-a="top-rentang"][data-v="7"]'); await tunggu(40);
    const rq = srv.log.filter(b => b.action === 'campaignTop').pop();
    cek('rentang 7 hari mengirim dari (hari ini - 6) & sampai (hari ini)', rq && rq.data.dari === new Date(Date.now() + 7 * 3600e3 - 6 * 864e5).toISOString().slice(0, 10) && rq.data.sampai === new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10), rq && JSON.stringify(rq.data));
    cek('rentang yang kosong mengatakannya', /pada rentang ini/.test(d.getElementById('app').innerHTML));
    klik(d, '[data-a="top-rentang"][data-v="semua"]'); await tunggu(40);
    /* Detail 9 angka per baris (13 Okt 2026). Baris pertama = Goyang (TikTok
       API + tercatat di Konten Planning). */
    cek('kartu Contoh pola konten sudah dicabut (14 Okt 2026)', !/Contoh pola konten/.test(app) && !d.querySelector('[data-a="contoh"]'));
    cek('detail tertutup sebelum ditekan', !d.querySelector('.rinci'));
    klik(d, '[data-a="top-rinci"]'); await tunggu(30);
    let rc = d.querySelector('.rinci');
    const kotakR = lbl => { const x = [...(rc ? rc.querySelectorAll('.rinci-grid div') : [])].find(n => n.querySelector('span').textContent === lbl); return x ? x.textContent : ''; };
    cek('detail terbuka dengan 9 kotak berurutan', rc && [...rc.querySelectorAll('.rinci-grid span')].map(n => n.textContent).join('|') === 'Reach|Impression|Views|Likes|Comment|Share|Saves|Klik CTA|Follower Baru');
    cek('views dari TikTok API menang atas ketikan (109,7 rb, bukan 1)', /109,7 rb/.test(kotakR('Views')) && /TikTok API/.test(kotakR('Views')), kotakR('Views'));
    cek('reach & saves dilengkapi dari Input Performa', /88/.test(kotakR('Reach')) && /Input Performa/.test(kotakR('Reach')) && /512/.test(kotakR('Saves')), kotakR('Reach') + ' / ' + kotakR('Saves'));
    cek('yang tidak ada ditulis tanda hubung, bukan 0', /—belum ada/.test(kotakR('Impression')), kotakR('Impression'));
    cek('yang kosong disebut cara melengkapinya', /Impression belum diisi/.test(rc.textContent) && /Input Performa/.test(rc.textContent));
    klik(d, '[data-a="top-rinci"]'); await tunggu(30);
    cek('menekan lagi menutup detail', !d.querySelector('.rinci'));
    const tombolR = d.querySelectorAll('[data-a="top-rinci"]');
    tombolR[1].dispatchEvent(new w.MouseEvent('click', { bubbles: true })); await tunggu(30);
    rc = d.querySelector('.rinci');
    cek('postingan TikTok yang tidak tercatat: sebabnya TikTok API', rc && /tidak disediakan TikTok API/.test(rc.textContent) && /Konten Planning/.test(rc.textContent), rc && rc.textContent);
    cek('cuma satu detail terbuka sekaligus', d.querySelectorAll('.rinci').length === 1);
    const rinciPhp = PHP_LIB.slice(PHP_LIB.indexOf('function cg_rinci('), PHP_LIB.indexOf('function cg_top('));
    cek('php: angka API menang atas ketikan', rinciPhp.indexOf("'s' => 'api'") > -1 && rinciPhp.indexOf("'s' => 'api'") < rinciPhp.indexOf("'s' => 'manual'"));
    cek('php: yang tidak ada dipulangkan null, bukan 0', /'v' => null/.test(rinciPhp));
    cek('php: kesembilan kunci sama dengan PK_KOLOM', /'reach', 'impr', 'views', 'likes', 'comments', 'shares', 'saves', 'cta', 'follow'/.test(rinciPhp));
    cek('php: catatan Input Performa dicocokkan per PLATFORM + tautan', PHP_LIB.includes("$kpUrl[cg_plat_norm($k['platform']) . '|' . $k['url']] = $k;") && PHP_LIB.includes("$kunciKp = cg_plat_norm($p['platform']) . '|' . (string)$p['url'];"));
    cek('pita riwayat TikTok belum lengkap disebut', /Riwayat video TikTok masih ditarik bertahap/.test(d.getElementById('app').innerHTML));

    /* Jadikan insight: form terisi tautan, tanggal, metrik. */
    /* Tombol PERTAMA di layar (sesudah diurut), bukan data-i=0: indeksnya
       menunjuk daftar yang belum diurut, dan itulah yang sedang diuji. */
    klik(d, '[data-a="jadikan"]');
    cek('Jadikan insight mengisi tautan', d.getElementById('f-url').value === 'https://www.tiktok.com/@x/video/1');
    cek('Jadikan insight mengisi tanggal tayang (WIB)', d.getElementById('f-tgl').value === '2026-09-26', d.getElementById('f-tgl').value);
    cek('Jadikan insight mengisi metrik', /109,7 rb views/.test(d.getElementById('f-met').value), d.getElementById('f-met').value);

    /* Temuan kosong -> ditahan, TIDAK ada POST. */
    const n0 = srv.log.filter(b => b.action === 'campaignInsightSimpan').length;
    klik(d, '[data-a="ins-simpan"]');
    await tunggu(30);
    cek('temuan kosong DITAHAN (tidak ada kiriman)', srv.log.filter(b => b.action === 'campaignInsightSimpan').length === n0);
    cek('sebabnya disebut di form', /Temuan/.test(d.getElementById('f-galat').textContent));
    d.getElementById('f-temuan').value = 'Hook joget di detik pertama';
    klik(d, '[data-a="ins-simpan"]');
    await tunggu(80);
    const kiriman = srv.log.filter(b => b.action === 'campaignInsightSimpan').pop();
    cek('insight terkirim sekali dengan sumber tiktok', kiriman && kiriman.data.sumber === 'tiktok');
    cek('modal tertutup & insight tampil sesudah server menjawab', !d.querySelector('#modal .modal') && /Hook joget di detik pertama/.test(d.getElementById('app').innerHTML));

    /* Tautan bukan https -> ditahan. */
    klik(d, '[data-a="ins-baru"]');
    d.getElementById('f-temuan').value = 'x'; d.getElementById('f-url').value = 'http://a.b'; d.getElementById('f-tgl').value = '2026-09-01';
    const n1 = srv.log.filter(b => b.action === 'campaignInsightSimpan').length;
    klik(d, '[data-a="ins-simpan"]'); await tunggu(30);
    cek('tautan bukan https ditahan', srv.log.filter(b => b.action === 'campaignInsightSimpan').length === n1);
    klik(d, '[data-a="tutup"]');

    /* Arsipkan */
    klik(d, '[data-a="ins-arsipkan"][data-i="0"]'); await tunggu(80);
    cek('arsipkan mengirim arsip:true (bukan hapus)', srv.log.some(b => b.action === 'campaignInsightArsip' && b.data.arsip === true));
    cek('insight terarsip hilang dari daftar aktif', !/Hook joget di detik pertama/.test(d.getElementById('app').innerHTML));

    /* Usulan AI: tidak tersimpan sendiri. */
    const nS = srv.log.filter(b => b.action === 'campaignInsightSimpan').length;
    klik(d, '[data-a="usulan"]'); await tunggu(80);
    cek('usulan AI tergambar', /Usulan AI/.test(d.getElementById('app').innerHTML));
    cek('usulan AI TIDAK tersimpan sendiri', srv.log.filter(b => b.action === 'campaignInsightSimpan').length === nS);
    klik(d, '[data-a="usulan-pakai"][data-i="0"]');
    cek('Simpan usulan membuka form terisi', d.getElementById('f-temuan').value === 'Usulan AI');
    const fk = d.getElementById('f-kat');
    cek('kategori form dari Pengaturan (server)', fk && fk.options.length === 2 && fk.options[1].value === 'Topik Lokal' && fk.value === 'Hook 3 Detik & Retensi', fk && fk.innerHTML);
    klik(d, '[data-a="tutup"]');
  }
  {
    /* Insight lama berkategori yang sudah dicabut: tetap terpilih, ditandai (lama). */
    const { d } = await buka({ hash: '#insight', insightLama: true });
    const saring = d.querySelector('[data-a="ins-kat"]');
    cek('penyaring memuat kategori lama yang masih dipakai, ditandai', saring && saring.innerHTML.includes('Waktu Tayang (lama)'));
    klik(d, '[data-a="ins-ubah"][data-i="0"]');
    const fk2 = d.getElementById('f-kat');
    cek('kategori lama tidak diganti diam-diam', fk2.value === 'Waktu Tayang' && /Waktu Tayang \(lama\)/.test(fk2.innerHTML));
    klik(d, '[data-a="tutup"]');
  }

  console.log('\n== Kalender ==');
  {
    const { w, d, srv } = await buka({ hash: '#kalender' });
    const app = d.getElementById('app').innerHTML;
    cek('halaman Kalender tergambar', /Kalender konten/.test(app));
    cek('posting otomatis belum aktif DIKATAKAN', /Posting otomatis belum aktif/.test(app));
    cek('jadwal kemarin masuk "Sudah waktunya diposting"', /Sudah waktunya diposting \(1\)/.test(app));
    const sel = d.querySelectorAll('.kal .sel').length;
    cek('kalender 5 atau 6 minggu penuh', sel === 35 || sel === 42, sel);

    /* Tayang tanpa tautan ditahan */
    klik(d, '[data-a="jdw-baru"]');
    d.getElementById('j-judul').value = 'Konten uji';
    d.getElementById('j-st').value = 'TAYANG';
    const n0 = srv.log.filter(b => b.action === 'campaignJadwalSimpan').length;
    klik(d, '[data-a="jdw-simpan"]'); await tunggu(30);
    cek('status Tayang tanpa tautan DITAHAN', srv.log.filter(b => b.action === 'campaignJadwalSimpan').length === n0);
    d.getElementById('j-st').value = 'TERJADWAL';
    d.getElementById('j-jam').value = '20:00';
    klik(d, '[data-a="jdw-simpan"]'); await tunggu(80);
    const k = srv.log.filter(b => b.action === 'campaignJadwalSimpan').pop();
    cek('jadwal terkirim dengan tanggal bawaan hari ini', k && k.data.tanggal === hariIni(), k && k.data.tanggal);
    cek('jadwal baru tampil di daftar hari ini', /Konten uji/.test(d.getElementById('app').innerHTML));

    /* Geser bulan */
    const BLN = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
    const kini = new Date(Date.now() + 7*3600e3), dpn = new Date(Date.UTC(kini.getUTCFullYear(), kini.getUTCMonth() + 1, 1));
    klik(d, '[data-a="kal-geser"][data-v="1"]');
    cek('geser bulan menggambar bulan berikutnya', d.getElementById('app').innerHTML.indexOf(BLN[dpn.getUTCMonth()] + ' ' + dpn.getUTCFullYear()) > -1);
  }

  console.log('\n== Periode & fokus analisa AI (29 Okt 2026) ==');
  {
    const kini = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
    const mundur = n => new Date(Date.now() + 7 * 3600e3 - (n - 1) * 864e5).toISOString().slice(0, 10);
    const { w, d, srv } = await buka({ hash: '#riset' });
    const asli = w.fetch;
    w.fetch = (u, i) => JSON.parse(i.body).action === 'campaignRiset'
      ? Promise.resolve({ text: () => Promise.resolve(JSON.stringify({ ok: true, data: { id: 'rx', hasil: {}, model: 'm' } })) })
      : asli(u, i);
    cek('riset: bawaan periode 30 hari menyala', !!d.querySelector('[data-a="pf-r"][data-k="riset"][data-v="30"].on'));
    cek('riset: pilihan fokus = pilar Content Planning (F&B, Entertainment, Promosi)',
      !!d.querySelector('[data-a="pf-fokus"][data-k="riset"][data-v="Product & Menu"]') && !!d.querySelector('[data-a="pf-fokus"][data-v="Entertainment"]') && /Promosi/.test(d.getElementById('app').innerHTML));
    d.getElementById('r-topik').value = 'Weekend';
    klik(d, '[data-a="pf-r"][data-k="riset"][data-v="7"]'); await tunggu(20);
    cek('riset: menekan periode tidak membuang topik yang diketik', d.getElementById('r-topik').value === 'Weekend');
    klik(d, '[data-a="pf-fokus"][data-k="riset"][data-v="Entertainment"]'); await tunggu(20);
    klik(d, '[data-a="pf-fokus"][data-k="riset"][data-v="Promotion"]'); await tunggu(20);
    klik(d, '[data-a="pf-fokus"][data-k="riset"][data-v="Promotion"]'); await tunggu(20);
    cek('riset: fokus bisa dilepas lagi', !d.querySelector('[data-a="pf-fokus"][data-v="Promotion"].on') && !!d.querySelector('[data-a="pf-fokus"][data-v="Entertainment"].on'));
    const sebelum = srv.log.length;
    let kirim = null;
    w.fetch = (u, i) => { const b = JSON.parse(i.body); if (b.action === 'campaignRiset') kirim = b.data; return asli(u, i); };
    klik(d, '[data-a="riset-jalan"]'); await tunggu(40);
    cek('riset: dikirim dari (hari ini-6) s/d hari ini + fokus', kirim && kirim.dari === mundur(7) && kirim.sampai === kini && JSON.stringify(kirim.fokus) === '["Entertainment"]', JSON.stringify(kirim));
    void sebelum;
    /* Rentang khusus tanpa tanggal DITAHAN, bukan dikirim sebagai semua waktu. */
    kirim = null;
    klik(d, '[data-a="pf-r"][data-k="riset"][data-v="khusus"]'); await tunggu(20);
    d.getElementById('r-topik').value = 'Weekend';
    klik(d, '[data-a="riset-jalan"]'); await tunggu(20);
    cek('riset: rentang khusus kosong ditahan', kirim === null);

    const b2 = await buka();
    let kirim2 = null; const asli2 = b2.w.fetch;
    b2.w.fetch = (u, i) => { const b = JSON.parse(i.body); if (b.action === 'campaignInsightAI') kirim2 = b.data; return asli2(u, i); };
    klik(b2.d, '[data-a="pf-r"][data-k="usulan"][data-v="90"]'); await tunggu(20);
    klik(b2.d, '[data-a="pf-fokus"][data-k="usulan"][data-v="Product & Menu"]'); await tunggu(20);
    klik(b2.d, '[data-a="usulan"]'); await tunggu(40);
    cek('insight otomatis: periode 90 hari + fokus F&B ikut terkirim', kirim2 && kirim2.dari === mundur(90) && kirim2.sampai === kini && kirim2.fokus[0] === 'Product & Menu', JSON.stringify(kirim2));

    const HTMLK = fs.readFileSync(path.join(__dirname, '../deploy/konten/analytics/index.html'), 'utf8');
    const HTMLP = fs.readFileSync(path.join(__dirname, '../deploy/konten/planning/index.html'), 'utf8');
    const ambil = (src, re) => { const m = src.match(re); return m ? m[1].replace(/\s/g, '') : ''; };
    const pPlan = ambil(HTMLP, /const PILLARS=\[([^\]]*)\]/), pAn = ambil(HTMLK, /var KONTEN_PILAR = \[([^\]]*)\]/), pPhp = ambil(PHP_LIB, /function cg_pilar_daftar\(\) \{\s*return array\(([^)]*)\)/);
    cek('pilar: berkas kembar planning = analytics = php', pPlan && pPlan === pAn && pAn === pPhp, [pPlan, pAn, pPhp].join(' | '));
    const bp = PHP_LIB.slice(PHP_LIB.indexOf('function cg_bukti_post('), PHP_LIB.indexOf('function cg_prompt_fokus('));
    cek('php: bukti disaring tayang_at hari WIB', bp.includes('tayang_at >= :a AND tayang_at < :b') && bp.includes('- 7 * 3600) * 1000'));
    cek('php: riset & insight memakai rentang + fokus', /cg_riset_jalankan[\s\S]*?cg_rentang_bukti\(\$d\)[\s\S]*?cg_prompt_fokus/.test(PHP_LIB) && /function cg_insight_ai\(\$pdo, \$d = array\(\)\)[\s\S]*?cg_rentang_bukti/.test(PHP_LIB) && PHP_LIB.includes("return cg_insight_ai($pdo, $d);"));
    cek('php: fokus di luar daftar dibuang', PHP_LIB.includes('in_array($x, $sah, true)'));
  }

  console.log('\n== Kelola iklan Meta (29 Okt 2026) ==');
  {
    const b = await buka({ hash: '#iklan', admin: true });
    await tunggu(60);
    b.srv.S.setting.adsSiap = true; b.srv.S.setting.adsAkun = '123'; b.srv.S.setting.adsSyncAt = Date.now();
    await b.w.__cg.muat(); b.w.__cg.render(); await tunggu(60);
    cek('tabel iklan punya tombol Kelola', !!b.d.querySelector('[data-a="ads-kelola"][data-v="a1"]'));
    const jl = b.d.getElementById('app').innerHTML;
    const potJ = jl.slice(jl.indexOf('Iklan yang sedang jalan'), jl.indexOf('Daftar iklan'));
    const kartuK = nm => { const i = potJ.indexOf(nm); return i < 0 ? '' : potJ.slice(i, potJ.indexOf('<div class="ins">', i + 1) < 0 ? undefined : potJ.indexOf('<div class="ins">', i + 1)); };
    cek('kartu iklan jalan: diminta langsung ke Meta (campaignAdsJalan)', b.srv.log.some(x => x.action === 'campaignAdsJalan') && potJ.length > 0);
    cek('kartu iklan jalan: jumlah kampanye aktif', /Iklan yang jalan sekarang<\/div><div class="v">2</.test(potJ));
    cek('kartu iklan jalan: uang keluar hari ini & bulan ini dari akun', potJ.includes('Rp45.000') && potJ.includes('Rp2.500.000'));
    cek('kartu iklan jalan: sisa batas belanja akun disebut', potJ.includes('tinggal <b>Rp1.000.000</b>'));
    cek('per kampanye: sudah jalan N hari + tanggal mulai', /Sudah jalan[\s\S]*?<b>10 hari<\/b>/.test(kartuK('Kampanye Buat Acara')), kartuK('Kampanye Buat Acara').slice(0, 300));
    cek('per kampanye: tanpa tanggal selesai dikatakan jalan terus', kartuK('Kampanye Buat Acara').includes('Tidak ada tanggal berhenti'));
    cek('per kampanye: tanggal berhenti + sisa hari', kartuK('Kampanye Live Music').includes('7 hari lagi'));
    cek('per kampanye: budget per hari + perkiraan total sampai selesai', kartuK('Kampanye Live Music').includes('Rp50.000 per hari') && kartuK('Kampanye Live Music').includes('±Rp550.000 untuk 11 hari'));
    cek('per kampanye: sudah terpakai sejak mulai + persen + sisa', kartuK('Kampanye Live Music').includes('Rp150.000</b> <span') && kartuK('Kampanye Live Music').includes('27% dari perkiraan total') && kartuK('Kampanye Live Music').includes('sisa ±Rp400.000'));
    cek('per kampanye: tombol Atur iklan (iklan pertamanya)', potJ.includes('data-a="ads-kelola" data-v="a2"'));
    const nJ = b.srv.log.filter(x => x.action === 'campaignAdsJalan').length;
    klik(b.d, '[data-a="iklan-jalan-muat"]'); await tunggu(40);
    cek('Muat ulang menarik lagi dari Meta', b.srv.log.filter(x => x.action === 'campaignAdsJalan').length === nJ + 1);
    cek('php: aksi campaignAdsJalan terdaftar & membaca kampanye ACTIVE', PHP_LIB.includes("case 'campaignAdsJalan':") && PHP_LIB.includes("'effective_status' => json_encode(array('ACTIVE'))") && PHP_LIB.includes("'maximum' => array()") && PHP_LIB.includes('start_time,end_time'));
    klik(b.d, '[data-a="ads-kelola"][data-v="a1"]'); await tunggu(40);
    const m = () => b.d.getElementById('modal').innerHTML;
    cek('panel membaca keadaan langsung dari Meta (campaignAdsInfo)', b.srv.log.some(x => x.action === 'campaignAdsInfo' && x.data.adId === 'a1') && /Set A/.test(m()) && /Kampanye A/.test(m()));
    cek('budget harian set iklan tampil + kotak ubah', /Budget per hari/.test(m()) && !!b.d.getElementById('ads-bud-adset'));
    let tanya = '';
    b.w.confirm = q => { tanya = q; return false; };
    klik(b.d, '[data-a="ads-status"][data-t="iklan"]'); await tunggu(30);
    cek('jeda ditanya dulu, dan batal = tidak terkirim', /Jeda iklan "Iklan murah"/.test(tanya) && !b.srv.log.some(x => x.action === 'campaignAdsUbah'));
    b.w.confirm = q => { tanya = q; return true; };
    klik(b.d, '[data-a="ads-status"][data-t="iklan"]'); await tunggu(60);
    const u1 = b.srv.log.filter(x => x.action === 'campaignAdsUbah').pop();
    cek('jeda mengirim status PAUSED ke tingkat iklan', u1 && u1.data.tingkat === 'iklan' && u1.data.status === 'PAUSED' && u1.data.id === 'a1', JSON.stringify(u1 && u1.data));
    cek('sesudah jeda panel dimuat ulang & tombol jadi Lanjutkan', !!b.d.querySelector('[data-a="ads-status"][data-t="iklan"][data-v="ACTIVE"]'));
    klik(b.d, '[data-a="ads-bud-geser"][data-t="adset"][data-v="1.2"]');
    cek('+20% mengisi kotak budget', b.d.getElementById('ads-bud-adset').value === '120000');
    klik(b.d, '[data-a="ads-budget"][data-t="adset"]'); await tunggu(60);
    const u2 = b.srv.log.filter(x => x.action === 'campaignAdsUbah').pop();
    cek('budget dikirim ke set iklan, konfirmasi menyebut sebelum → sesudah', u2 && u2.data.budget === 120000 && u2.data.tingkat === 'adset' && /Rp100\.000\s+→\s+Rp120\.000/.test(tanya), tanya);
    cek('riwayat perubahan tampil di panel', /Riwayat perubahan dari Office/.test(m()));

    const nb = await buka({ hash: '#iklan' });
    await tunggu(60);
    nb.srv.S.setting.adsSiap = true; nb.srv.S.setting.adsAkun = '123'; nb.srv.S.setting.adsSyncAt = Date.now();
    await nb.w.__cg.muat(); nb.w.__cg.render(); await tunggu(60);
    klik(nb.d, '[data-a="ads-kelola"][data-v="a1"]'); await tunggu(40);
    cek('bukan admin: tombol jeda & budget tidak digambar', !nb.d.querySelector('[data-a="ads-status"]') && !nb.d.getElementById('ads-bud-adset') && /Hanya admin modul/.test(nb.d.getElementById('modal').innerHTML));

    const kel = PHP_LIB.slice(PHP_LIB.indexOf('function cg_ads_info('), PHP_LIB.indexOf('function cg_ig_kode('));
    cek('php: ubah iklan khusus admin modul', /case 'campaignAdsUbah':\s*if \(!sesi_admin_modul\(\$u, 'campaign'\)\)/.test(PHP_LIB));
    cek('php: akun iklan diperiksa dari Meta, bukan dari kiriman', (kel.match(/cg_ads_cek_akun\(/g) || []).length === 2);
    cek('php: status hanya ACTIVE/PAUSED, budget dibatasi 5x', kel.includes("array('ACTIVE', 'PAUSED')") && kel.includes('$lama * 5'));
    cek('php: IDR tanpa sen (faktor 1)', PHP_LIB.includes("'IDR'") && PHP_LIB.includes('return in_array(strtoupper((string)$cur), $tanpaSen, true) ? 1 : 100;'));
    cek('php: tiap perubahan dicatat di cg_ads_log', kel.includes('INSERT INTO cg_ads_log'));
    cek('php: id yang diubah wajib angka (bukan act_)', kel.includes("if (!ctype_digit($id)) throw new Exception('ID iklan tidak sah.');"));
  }

  console.log('\n== Riset ==');
  {
    const { d } = await buka({ hash: '#riset' });
    const app = d.getElementById('app').innerHTML;
    cek('hasil riset tergambar', /Hasil riset: Live music/.test(app) && /Ide C/.test(app));
    cek('label Estimasi AI tampil', /Estimasi AI, bukan data pasar/.test(app));
    klik(d, '[data-a="ide-jadwal"]');
    cek('Jadwalkan ide membuka form berisi hook + caption', /Hook C/.test(d.getElementById('j-cap').value) && d.getElementById('j-judul').value === 'Ide C');
    /* Riset yang GAGAL: galatnya menetap di layar, isian tidak hilang (14 Okt 2026). */
    const { w: w2, d: d2 } = await buka({ hash: '#riset' });
    const asli = w2.fetch;
    w2.fetch = (u, i) => JSON.parse(i.body).action === 'campaignRiset'
      ? Promise.resolve({ text: () => Promise.resolve(JSON.stringify({ ok: false, error: 'Jawaban AI terpotong karena terlalu panjang (batas token).' })) })
      : asli(u, i);
    d2.getElementById('r-topik').value = 'Malam minggu';
    d2.getElementById('r-cat').value = 'anak muda';
    klik(d2, '[data-a="riset-jalan"]'); await tunggu(60);
    const app2 = d2.getElementById('app').innerHTML;
    cek('riset gagal: galatnya MENETAP di layar (bukan cuma toast)', app2.includes("Riset gagal:</b> Jawaban AI terpotong"));
    cek('riset gagal: topik & catatan tidak hilang', d2.getElementById('r-topik').value === 'Malam minggu' && d2.getElementById('r-cat').value === 'anak muda');
    const tanyaP = PHP_LIB.slice(PHP_LIB.indexOf('function cg_ai_tanya('), PHP_LIB.indexOf('function cg_bukti_post('));
    cek('php: jatah token Muse Spark ditambah (token penalaran ikut dihitung)', tanyaP.includes('$maks = $maks + 8000;'));
    cek('php: terpotong batas token dikatakan apa adanya', tanyaP.includes("$henti === 'max_tokens'"));
    cek('php: content berupa string juga dibaca', tanyaP.includes('if (is_string($isi)) $teks = $isi;'));
    cek('php: galat "bukan JSON" menyebut potongan jawabannya', tanyaP.includes("Jawaban AI bukan JSON (' . $model . '): ") && tanyaP.includes('cg_potong(preg_replace('));
  }

  console.log('\n== Bank Konten ==');
  {
    const { w, d, srv } = await buka({ hash: '#bank' });
    const nav = d.getElementById('nav').innerHTML;
    cek('menu Bank Konten ada di sidebar', /data-v="bank"/.test(nav) && /Bank Konten/.test(nav));
    cek('tombol Refresh di kanan atas DICABUT', d.getElementById('topAksi').innerHTML === '' && !d.querySelector('[data-a="refresh"]'));
    let app = d.getElementById('app').innerHTML;
    cek('halaman Bank Konten tergambar dengan form generate', /Buat content planning dengan AI/.test(app) && d.getElementById('b-dari') && d.getElementById('b-sampai'));
    cek('bawaan tab Ide: hanya ide yang belum terjadwal', /Ide bank satu/.test(app) && !/Ide terjadwal/.test(app) && !/Ide arsip/.test(app));
    cek('hitungan tiap status', /Ide \(1\)/.test(app) && /Terjadwal \(1\)/.test(app) && /Arsip \(1\)/.test(app) && /Semua \(3\)/.test(app));

    /* Jadwalkan: form jadwal terisi, dan bankId ikut terkirim */
    klik(d, '[data-a="bank-jadwal"]');
    cek('Jadwalkan membuka form jadwal terisi (judul, tanggal, jam, hook)', d.getElementById('j-judul').value === 'Ide bank satu'
      && d.getElementById('j-tgl').value === geser(2) && d.getElementById('j-jam').value === '19:00' && /Hook B1/.test(d.getElementById('j-cap').value));
    klik(d, '[data-a="jdw-simpan"]'); await tunggu(80);
    const kj = srv.log.filter(b => b.action === 'campaignJadwalSimpan').pop();
    cek('jadwal dari bank mengirim bankId', kj && kj.data.bankId === 'b1', kj && JSON.stringify(kj.data));
    app = d.getElementById('app').innerHTML;
    cek('ide yang dijadwalkan pindah dari tab Ide', !/Ide bank satu/.test(app) && /Terjadwal \(2\)/.test(app));

    /* Generate: tanggal terbalik ditahan, yang sah terkirim */
    d.getElementById('b-dari').value = geser(10); d.getElementById('b-sampai').value = geser(5);
    const n0 = srv.log.filter(b => b.action === 'campaignBankGenerate').length;
    klik(d, '[data-a="bank-jalan"]'); await tunggu(30);
    cek('rentang terbalik DITAHAN, tidak terkirim', srv.log.filter(b => b.action === 'campaignBankGenerate').length === n0 && /tidak boleh sebelum/.test(d.getElementById('app').innerHTML));
    d.getElementById('b-dari').value = geser(1); d.getElementById('b-sampai').value = geser(14);
    d.getElementById('b-jml').value = '5'; d.getElementById('b-fokus').value = 'promo weekend';
    klik(d, '[data-a="bank-jalan"]'); await tunggu(80);
    const kg = srv.log.filter(b => b.action === 'campaignBankGenerate').pop();
    cek('generate mengirim rentang, jumlah & fokus', kg && kg.data.dari === geser(1) && kg.data.sampai === geser(14) && kg.data.jumlah === '5' && kg.data.fokus === 'promo weekend', kg && JSON.stringify(kg.data));
    app = d.getElementById('app').innerHTML;
    cek('hasil generate tampil di Bank & disebut jumlahnya', /Ide dari AI/.test(app) && /1 ide masuk ke Bank Konten/.test(app));

    /* Manual + arsip */
    klik(d, '[data-a="bank-tambah"]');
    const nS = srv.log.filter(b => b.action === 'campaignBankSimpan').length;
    klik(d, '[data-a="bank-simpan"]'); await tunggu(30);
    cek('ide manual tanpa judul DITAHAN', srv.log.filter(b => b.action === 'campaignBankSimpan').length === nS);
    d.getElementById('b-judul').value = 'Ide manual uji';
    klik(d, '[data-a="bank-simpan"]'); await tunggu(80);
    cek('ide manual tersimpan & tampil', /Ide manual uji/.test(d.getElementById('app').innerHTML));
    klik(d, '[data-a="bank-arsip"]'); await tunggu(80);
    const ka = srv.log.filter(b => b.action === 'campaignBankArsip').pop();
    cek('arsipkan mengirim arsip:true (bukan hapus)', ka && ka.data.arsip === true);

    /* Hapus permanen: hanya di tab Arsip, ditanya dulu */
    cek('tombol Hapus TIDAK ada di tab Ide', !d.querySelector('[data-a="bank-hapus"]'));
    klik(d, '[data-a="bank-st"][data-v="ARSIP"]');
    let tanya = '';
    w.confirm = (m) => { tanya = m; return false; };
    const nH = srv.log.filter(b => b.action === 'campaignBankHapus').length;
    klik(d, '[data-a="bank-hapus"]'); await tunggu(30);
    cek('hapus ditanya dulu & menyebut judulnya; Batal = tidak terkirim', /Hapus permanen ide "/.test(tanya) && srv.log.filter(b => b.action === 'campaignBankHapus').length === nH);
    w.confirm = () => true;
    const jmlArsip = d.querySelectorAll('[data-a="bank-hapus"]').length;
    klik(d, '[data-a="bank-hapus"]'); await tunggu(80);
    cek('hapus permanen terkirim & idenya hilang', srv.log.some(b => b.action === 'campaignBankHapus') && d.querySelectorAll('[data-a="bank-hapus"]').length === jmlArsip - 1);

    /* Riset: Simpan ke Bank */
    const r = await buka({ hash: '#riset' });
    klik(r.d, '[data-a="ide-bank"]'); await tunggu(80);
    const kr = r.srv.log.filter(b => b.action === 'campaignBankSimpan').pop();
    cek('ide riset bisa disimpan ke Bank (sumber riset)', kr && kr.data.sumber === 'riset' && kr.data.judul === 'Ide C' && kr.data.hook === 'Hook C');

    /* Server */
    const lib = fs.readFileSync(path.join(ROOT, 'konten-mysql/lib_konten_mysql.php'), 'utf8');
    cek('db(true) membuka sambungan baru', /function db\(\$baru = false\)/.test(lib) && lib.includes('if ($pdo !== null && !$baru) return $pdo;'));
    const riset = PHP_LIB.slice(PHP_LIB.indexOf('function cg_riset_jalankan('), PHP_LIB.indexOf('function cg_insight_ai('));
    cek('riset: sambungan BARU sesudah AI, sebelum INSERT (MySQL gone away)', riset.indexOf('$pdo = db(true);') > riset.indexOf('cg_ai_tanya(') && riset.indexOf('$pdo = db(true);') < riset.indexOf('INSERT INTO cg_riset'));
    const gen = PHP_LIB.slice(PHP_LIB.indexOf('function cg_bank_generate('));
    cek('generate: sambungan BARU sesudah AI, sebelum menulis', gen.indexOf('$pdo = db(true);') > gen.indexOf('cg_ai_tanya(') && gen.indexOf('$pdo = db(true);') < gen.indexOf('cg_bank_tambah('));
    cek('generate memakai insight aktif & bukti post', gen.includes('FROM cg_insight WHERE arsip=0') && gen.includes('cg_bukti_post('));
    cek('generate: tanggal di luar rentang dikosongkan', gen.includes("$tg >= $dari && $tg <= $sampai"));
    cek('tabel cg_bank lahir lewat CREATE TABLE IF NOT EXISTS', /CREATE TABLE IF NOT EXISTS cg_bank/.test(PHP_LIB));
    cek('campaignGet memulangkan bank', PHP_LIB.includes("'bank'    => $bank"));
    cek('jadwal dari bank menandai ide TERJADWAL', PHP_LIB.includes("UPDATE cg_bank SET status='TERJADWAL', jadwal_id=:j"));
    cek('aksi bank terdaftar', ['campaignBankGenerate', 'campaignBankSimpan', 'campaignBankArsip', 'campaignBankHapus'].every(x => PHP_LIB.includes("case '" + x + "'")));
  }

  console.log('\n== Cari di Konten terpopuler ==');
  {
    const { w, d, srv } = await buka({ hash: '#insight' });
    const kotak = d.getElementById('top-cari');
    cek('kotak cari ada di Konten terpopuler', !!kotak);
    kotak.focus(); kotak.value = 'combo';
    kotak.dispatchEvent(new w.Event('input', { bubbles: true }));
    await tunggu(500);
    const rq = srv.log.filter(b => b.action === 'campaignTop').pop();
    cek('kata kunci dikirim ke server (halaman 1)', rq && rq.data.q === 'combo' && rq.data.hal === 1, rq && JSON.stringify(rq.data));
    const daftar = d.getElementById('top-daftar').innerHTML;
    cek('hasil cari hanya yang cocok', /Beli special combo/.test(daftar) && !/Goyang terus babe/.test(daftar));
    cek('kotak cari TIDAK dibuat ulang (fokus tetap)', d.getElementById('top-cari') === kotak && d.activeElement === kotak);
    kotak.value = 'zzzz'; kotak.dispatchEvent(new w.Event('input', { bubbles: true })); await tunggu(500);
    cek('tanpa hasil disebut kata kuncinya', /cocok dengan "zzzz"/.test(d.getElementById('top-daftar').innerHTML));
    cek('php: cg_top menyaring kata kunci di judul', PHP_LIB.includes("strpos(strtolower($e['judul']), $cari) === false"));
    const igs = PHP_LIB.slice(PHP_LIB.indexOf('function cg_ig_sync('));
    cek('php: insight IG diekspansi di daftar media (seluruh postingan dapat views)', igs.includes("insights.metric(views,reach,saved,shares)") && igs.includes('$pakaiIns = false;'));
    cek('php: riwayat IG ditarik ulang SEKALI supaya postingan lama dapat views', igs.includes("cg_set_baca($pdo, 'ig_bf_v') !== '2'"));
  }

  console.log('\n== Iklan (Meta Ads) ==');
  {
    const a = await buka({ hash: '#iklan' });
    cek('menu Iklan ada di sidebar', /data-v="iklan"/.test(a.d.getElementById('nav').innerHTML));
    cek('belum disetel: halaman menyuruh mengisi Pengaturan', /Hubungkan Meta Ads/.test(a.d.getElementById('app').innerHTML));
    const b = await buka({ hash: '#iklan' });
    b.srv.S.setting.adsSiap = true; b.srv.S.setting.adsAkun = '123'; b.srv.S.setting.adsSyncAt = Date.now();
    await b.w.__cg.muat(); b.w.__cg.render(); await tunggu(60);
    const h = b.d.getElementById('app').innerHTML;
    const baris = nm => { const i = h.indexOf('>' + nm + '<'); return i < 0 ? '' : h.slice(i, h.indexOf('</tr>', i)); };
    cek('daftar iklan tampil, diminta periode 30 hari', /Iklan murah/.test(h) && b.srv.log.some(x => x.action === 'campaignAds' && x.data.periode === '30'));
    cek('biaya per chat 5.000 = Works (median sejenis)', /nilai works/.test(baris('Iklan murah')));
    cek('biaya per chat 2x median = Tidak works', /nilai tidak/.test(baris('Iklan mahal')));
    cek('sekitar median = Wajar', /nilai wajar/.test(baris('Iklan median A')));
    cek('biaya di bawah ambang = Data belum cukup', /nilai kecil/.test(baris('Iklan kecil')));
    cek('sudah berbiaya tapi tanpa hasil = Tidak works', /nilai tidak/.test(baris('Iklan nol hasil')) && /belum menghasilkan/.test(baris('Iklan nol hasil')));
    cek('cara menilai dijelaskan di layar', /median biaya per hasil/.test(h));
    /* Top iklan: juara per jenis hasil = biaya per hasil termurah */
    const top = h.slice(h.indexOf('<h2>Top iklan</h2>'), h.indexOf('<h2>Saran AI</h2>'));
    cek('Top iklan menampilkan biaya per hasil termurah (Iklan murah)', /Iklan murah/.test(top) && !/Iklan mahal/.test(top));
    /* Cari: hanya tabel yang digambar ulang, kotak tetap fokus */
    const kotak = b.d.getElementById('iklan-cari');
    kotak.focus(); kotak.value = 'mahal'; kotak.dispatchEvent(new b.w.Event('input', { bubbles: true })); await tunggu(350);
    const tb = b.d.getElementById('iklan-daftar').innerHTML;
    cek('cari iklan menyaring tabel', /Iklan mahal/.test(tb) && !/Iklan murah/.test(tb) && /1 dari 6 iklan/.test(tb));
    cek('kotak cari iklan tetap fokus (tidak dibuat ulang)', b.d.getElementById('iklan-cari') === kotak && b.d.activeElement === kotak);
    kotak.value = ''; kotak.dispatchEvent(new b.w.Event('input', { bubbles: true })); await tunggu(350);
    /* Saring status & urut */
    klik(b.d, '[data-a="iklan-status"][data-v="mati"]');
    const ts = b.d.getElementById('iklan-daftar').innerHTML;
    cek('saring status "Tidak aktif" hanya iklan dijeda', /Iklan median B/.test(ts) && !/Iklan murah/.test(ts));
    klik(b.d, '[data-a="iklan-status"][data-v=""]');
    const sel = b.d.querySelector('[data-a="iklan-urut"]'); sel.value = 'cpr'; sel.dispatchEvent(new b.w.Event('change', { bubbles: true }));
    const tu = b.d.getElementById('iklan-daftar').innerHTML;
    cek('urut biaya/hasil termurah: Iklan murah di atas, tanpa hasil di bawah', tu.indexOf('Iklan murah') < tu.indexOf('Iklan mahal') && tu.indexOf('Iklan mahal') < tu.indexOf('Iklan nol hasil'));
    /* Saran AI */
    b.srv.S.setting.aiSiap = true; await b.w.__cg.muat(); b.w.__cg.render();
    klik(b.d, '[data-a="iklan-ai"]'); await tunggu(80);
    const ha = b.d.getElementById('app').innerHTML;
    cek('Saran AI memanggil campaignAdsAI untuk periode yang dibuka', b.srv.log.some(x => x.action === 'campaignAdsAI' && x.data.periode === '30'));
    cek('Saran AI tampil: Teruskan / Hentikan + saran umum', /Ringkasan iklan uji/.test(ha) && /Teruskan/.test(ha) && /Naikkan budget 20%/.test(ha) && /Hentikan/.test(ha) && /Uji hook baru/.test(ha));
    const aiP = PHP_LIB.slice(PHP_LIB.indexOf('function cg_ads_ai('), PHP_LIB.indexOf('/* Daftar iklan satu periode'));
    cek('php: saran AI membuang ad_id yang tidak ada di data', aiP.includes("!isset($ada[(string)$x['ad_id']])"));
    cek('php: saran AI tidak menulis apa pun', !/INSERT|UPDATE|DELETE/.test(aiP));
    /* Per postingan: a1 + a2 memakai postingan yang sama -> satu baris, 2x */
    klik(b.d, '[data-a="iklan-tampil"][data-v="post"]');
    const tp = b.d.getElementById('iklan-daftar').innerHTML;
    const bp = tp.slice(tp.indexOf('Reel Night of King'), tp.indexOf('</tr>', tp.indexOf('Reel Night of King')));
    cek('per postingan: dua iklan pada postingan yang sama jadi satu baris "2x"', (tp.match(/Reel Night of King/g) || []).length === 1 && /<b>2x<\/b>/.test(bp), '');
    cek('per postingan: biaya dijumlah & views organik ikut', /Rp250\.000/.test(bp) && /272 rb/.test(bp) && /views organik/.test(bp));
    cek('per postingan: penilaian dari biaya per hasil gabungan (8.333 < median) = Works', /nilai works/.test(bp));
    cek('per postingan: materi bukan postingan IG berdiri sendiri', /materi khusus iklan/.test(tp));
    klik(b.d, '[data-a="iklan-buka-post"][data-v="id:m1"]');
    const tb2 = b.d.getElementById('iklan-daftar').innerHTML;
    cek('per postingan: dibuka menampilkan daftar iklannya', /Iklan murah/.test(tb2) && /Iklan median A/.test(tb2));
    cek('php: iklan dicocokkan ke postingan IG lewat ID media & kode', PHP_LIB.includes("$r['post'] = ((string)$r['ig_media'] !== ''"));
    klik(b.d, '[data-a="iklan-tampil"][data-v="iklan"]');
    klik(b.d, '[data-a="iklan-nilai"][data-v="works"]');
    const h2 = b.d.getElementById('iklan-daftar').innerHTML;
    cek('saring "Works" hanya iklan works', /Iklan murah/.test(h2) && !/Iklan mahal/.test(h2));
    klik(b.d, '[data-a="iklan-pe"][data-v="max"]'); await tunggu(60);
    cek('ganti periode memuat ulang dari server', b.srv.log.some(x => x.action === 'campaignAds' && x.data.periode === 'max'));
    const c = await buka({ hash: '#pengaturan', admin: true });
    cek('Pengaturan: token iklan (password) & ID akun iklan', c.d.getElementById('s-adstoken').type === 'password' && !!c.d.getElementById('s-adsakun'));
    c.d.getElementById('s-adstoken').value = 'tok-uji'; c.d.getElementById('s-adsakun').value = 'act_999';
    klik(c.d, '[data-a="set-simpan"]'); await tunggu(60);
    const ks = c.srv.log.filter(x => x.action === 'campaignSetting').pop();
    cek('Simpan mengirim adsToken & adsAkun', ks && ks.data.adsToken === 'tok-uji' && ks.data.adsAkun === 'act_999');
    const ads = PHP_LIB.slice(PHP_LIB.indexOf('/* ==================== IKLAN META'), PHP_LIB.indexOf('/* ==================== SETELAN (admin'));
    cek('php: insight level iklan, tiga periode', ads.includes("'level' => 'ad'") && ads.includes("'7' => 'last_7d', '30' => 'last_30d', 'max' => 'maximum'"));
    cek('php: hasil dipilih menurut tujuan kampanye', ads.includes('function cg_ads_hasil(') && ads.includes("onsite_conversion.messaging_conversation_started_7d"));
    cek('php: baca hanya sinkron terakhir, tanpa DELETE', ads.includes('sync_at = :s') && !/DELETE/.test(ads));
    cek('php: token iklan tidak dipulangkan campaignGet', !/'ads_token'\s*\)\s*[,)]/.test(PHP_LIB.slice(PHP_LIB.indexOf('function cg_baca('), PHP_LIB.indexOf('function cg_konten_perf('))) && PHP_LIB.includes("'adsTokenAda' => cg_ads_token($pdo) !== ''"));
    cek('php: ID akun iklan bukan angka ditolak', PHP_LIB.includes("ID akun iklan harus angka"));
    cek('php: postingan IG yang dipromosikan dicocokkan lewat ID media & kode tautan', PHP_LIB.includes("$iklanIg['id:' . $r['ig_media']]") && PHP_LIB.includes('function cg_ig_kode('));
    cek('detail postingan Instagram menyebut angka API = organik, dan data iklannya kalau dipromosikan', HTML.includes('Angka dari Instagram API adalah <b>organik</b>') && HTML.includes('pernah dipromosikan'));
    cek('aksi iklan terdaftar', PHP_LIB.includes("case 'campaignAdsSync'") && PHP_LIB.includes("case 'campaignAds'") && PHP_LIB.includes("case 'campaignAdsAI'"));
  }

  console.log('\n== Pertumbuhan ==');
  {
    const p = await buka({ hash: '#tumbuh' });
    await tunggu(60);
    let h = p.d.getElementById('app').innerHTML;
    cek('menu Pertumbuhan ada', /data-v="tumbuh"/.test(p.d.getElementById('nav').innerHTML));
    cek('campaignTumbuh diminta 30 hari', p.srv.log.some(x => x.action === 'campaignTumbuh' && x.data.hari === 30));
    /* 30 hari: 15 hari x 2.000 + 15 x 1.000 = 45.000 views; periode lalu 22.500 -> +100% */
    cek('kartu Views = jumlah 30 hari + naik 100% vs periode sebelumnya', /Views<\/div><div class="v"[^>]*>45 rb/.test(h) && /▲ 100%/.test(h), '');
    cek('grafik views menandai hari beriklan', (h.match(/class="ik"/g) || []).length === 15);
    const dampak = h.slice(h.indexOf('<h2>Pengaruh iklan</h2>'), h.indexOf('<h2>Rincian per hari</h2>'));
    cek('pengaruh iklan: views rata-rata hari beriklan 2 rb vs 1 rb (+100%)', /Hari beriklan \(15\)/.test(dampak) && /Hari tanpa iklan \(15\)/.test(dampak) && /2 rb/.test(dampak) && /▲ 100%/.test(dampak));
    cek('pengaruh iklan menyebut bukan sebab-akibat', /bukan bukti sebab-akibat/.test(dampak));
    cek('total dari iklan disebut', /biaya <b>Rp750\.000<\/b>/.test(dampak));
    klik(p.d, '[data-a="tumbuh-plat"][data-v="tiktok"]');
    h = p.d.getElementById('app').innerHTML;
    cek('TikTok: kenaikan follower & likes dari potret', /\+10/.test(h) && /\+100/.test(h) && /tidak menyediakan insight harian/.test(h));
    klik(p.d, '[data-a="tumbuh-hari"][data-v="7"]'); await tunggu(60);
    cek('ganti rentang memuat ulang (7 hari)', p.srv.log.some(x => x.action === 'campaignTumbuh' && x.data.hari === 7));
    const tb = PHP_LIB.slice(PHP_LIB.indexOf('/* ==================== PERTUMBUHAN HARIAN'), PHP_LIB.indexOf('/* ==================== IKLAN META'));
    cek('php: insight akun IG per hari (total_value), dicicil 15 hari per sinkron', tb.includes("'metric_type' => 'total_value'") && tb.includes('if (count($daftar) >= 15) break;'));
    cek('php: kolom NULL tidak menimpa angka yang ada (COALESCE)', tb.includes('COALESCE(VALUES('));
    cek('php: follower baru dari follower_count', tb.includes("'metric' => 'follower_count'"));
    cek('php: potret TikTok hanya kalau izin statistik ada', PHP_LIB.includes("if ($adaStats) cg_harian_simpan($pdo, 'tiktok'"));
    cek('php: iklan per hari (time_increment=1)', PHP_LIB.includes("'time_increment' => 1"));
    cek('php: galat insight harian tidak menggagalkan sinkron IG', /function cg_ig_harian[\s\S]*?catch \(Throwable \$e\) \{\}/.test(tb));
    cek('aksi campaignTumbuh terdaftar', PHP_LIB.includes("case 'campaignTumbuh'"));
  }

  console.log('\n== Instagram ==');
  {
    /* Belum terhubung, kunci app terisi: tombol Hubungkan aktif & memanggil campaignIgMulai. */
    const a = await buka({ hash: '#insight' });
    a.srv.S.setting.igSiap = true;
    await a.w.__cg.muat(); a.w.__cg.render();
    const k0 = a.d.getElementById('app').innerHTML;
    cek('kartu Instagram bukan lagi "Segera hadir"', !/Segera hadir<\/div><div class="ket">Sementara ini angka Instagram/.test(k0) && /data-a="ig-hubung"/.test(k0));
    const loc = a.w.location.href;
    a.w.fetch = ((asli) => (u, i) => JSON.parse(i.body).action === 'campaignIgMulai'
      ? Promise.resolve({ text: () => Promise.resolve(JSON.stringify({ ok: true, data: { url: '#ig-auth' } })) }) : asli(u, i))(a.w.fetch);
    klik(a.d, '[data-a="ig-hubung"]'); await tunggu(40);
    cek('Hubungkan Instagram meminta URL otorisasi dari server', a.srv.log.some(b => b.action === 'campaignIgMulai') || /ig-auth/.test(a.w.location.href), loc);

    /* Terhubung: profil + sinkron + putus */
    const b = await buka({ hash: '#insight', akun: [
      { platform: 'tiktok', nama: 'TT', terhubung: true, sync_at: Date.now(), sync_galat: '', scope: 'user.info.basic,user.info.profile,user.info.stats,video.list', stats_ada: 0 },
      { platform: 'instagram', nama: 'Laksamana Muda', terhubung: true, sync_at: Date.now(), sync_galat: '', stats_ada: 1, follower: 5432, following: 10, jml_video: 210,
        bio: 'Coffee Pekanbaru', profil_url: 'https://www.instagram.com/laksamanamuda.id/', avatar: '', token_exp: Date.now() + 50 * 864e5 }] });
    const k1 = b.d.getElementById('app').innerHTML;
    cek('kartu Instagram terhubung: nama, follower & tautan profil', /Laksamana Muda/.test(k1) && /5\.432|5,4|5\.4/.test(k1) && /Buka profil di Instagram/.test(k1), '');
    /* Pita riwayat Instagram muncul selama belum lengkap. */
    b.srv.S.postInfo.igTotal = 120; b.srv.S.postInfo.igInsight = 30; b.srv.S.postInfo.igRiwayatSelesai = false;
    await b.w.__cg.muat(); b.w.__cg.render(); await tunggu(40);
    const kp = b.d.getElementById('app').innerHTML;
    cek('pita riwayat Instagram menyebut jumlah tersimpan & ber-insight', /Postingan Instagram masih ditarik bertahap: 120 dari 210/.test(kp) && /untuk 30 postingan/.test(kp));
    klik(b.d, '[data-a="ig-sync"]'); await tunggu(60);
    cek('Sinkronkan memanggil campaignIgSync', b.srv.log.some(x => x.action === 'campaignIgSync'));
    klik(b.d, '[data-a="ig-putus"]'); await tunggu(60);
    cek('Putuskan memanggil campaignIgPutus', b.srv.log.some(x => x.action === 'campaignIgPutus'));

    /* Pengaturan: kotak App ID & Secret, terkirim */
    const c = await buka({ hash: '#pengaturan', admin: true });
    cek('Pengaturan punya kotak ID & Rahasia aplikasi Instagram (password)', c.d.getElementById('s-igid').type === 'password' && c.d.getElementById('s-igsecret').type === 'password');
    c.d.getElementById('s-igid').value = 'id-uji'; c.d.getElementById('s-igsecret').value = 'rahasia-uji';
    klik(c.d, '[data-a="set-simpan"]'); await tunggu(60);
    const ks = c.srv.log.filter(x => x.action === 'campaignSetting').pop();
    cek('Simpan mengirim igId & igSecret', ks && ks.data.igId === 'id-uji' && ks.data.igSecret === 'rahasia-uji');

    /* Server */
    const cb = fs.readFileSync(path.join(ROOT, 'konten-mysql/campaign-instagram.php'), 'utf8');
    cek('alamat balik campaign-instagram.php memakai cg_ig_callback', cb.includes('cg_ig_callback(db(), $code, $state)'));
    const ig = PHP_LIB.slice(PHP_LIB.indexOf('/* ==================== INSTAGRAM'), PHP_LIB.indexOf('/* ==================== SETELAN (admin'));
    cek('OAuth Instagram: state sekali pakai', ig.includes("hash_equals((string)$st['s'], (string)$state)") && ig.includes("cg_set_tulis($pdo, 'ig_state', '')"));
    cek('token pendek ditukar jadi token 60 hari', ig.includes("'grant_type' => 'ig_exchange_token'"));
    cek('token diperbarui sebelum habis (ig_refresh_token)', ig.includes("'grant_type' => 'ig_refresh_token'"));
    cek('scope = izin yang ditambahkan di app', /define\('CG_IG_SCOPE', 'instagram_business_basic,instagram_business_manage_insights'\)/.test(PHP_LIB));
    cek('insight per postingan bergilir 30 per sinkron', ig.includes('ORDER BY insight_at ASC, tayang_at DESC LIMIT 30') && ig.includes('/insights?'));
    cek('riwayat SELURUH postingan dari cursor tersimpan (4 halaman per sinkron)', ig.includes('for ($h = 0; !$selesai && $h < 4; $h++)') && ig.includes("cg_set_tulis($pdo, 'ig_bf_after', $c)"));
    cek('postingan lama disegarkan likes & komentarnya', ig.includes("UPDATE cg_post SET likes=:li, comments=:cm"));
    cek('postingan yang hilang ditandai, tidak dihapus (hanya galat kode 100)', ig.includes("SET hilang=1") && ig.includes("=== 100") && !/DELETE/.test(ig));
    cek('campaignGet memulangkan jumlah yang sudah ber-insight', PHP_LIB.includes("'igInsight' =>"));
    cek('reach & saves lahir lewat ALTER, NULL bawaan', PHP_LIB.includes("ADD COLUMN reach BIGINT NULL") && PHP_LIB.includes("ADD COLUMN saves BIGINT NULL"));
    cek('campaignGet TIDAK memulangkan App Secret Instagram', !/'ig_secret'\s*\)?\s*[,)]/.test(PHP_LIB.slice(PHP_LIB.indexOf('function cg_baca('), PHP_LIB.indexOf('function cg_konten_perf('))));
    cek('aksi Instagram terdaftar', ['campaignIgMulai', 'campaignIgSync', 'campaignIgPutus'].every(x => PHP_LIB.includes("case '" + x + "'")));
    cek('App ID/Secret disimpan sebagai rahasia (kosong = tidak diubah)', PHP_LIB.includes("'igId' => 'ig_id', 'igSecret' => 'ig_secret'"));
  }

  console.log('\n== Pengaturan ==');
  {
    const bukan = await buka({ hash: '#pengaturan' });
    cek('bukan admin yang membuka #pengaturan dipulangkan ke Insight', /Konten terpopuler/.test(bukan.d.getElementById('app').innerHTML));
    const adm = await buka({ hash: '#pengaturan', admin: true });
    const app = adm.d.getElementById('app').innerHTML;
    cek('admin melihat Pengaturan', /Profil brand/.test(app));
    cek('redirect URI disebut', /campaign-tiktok\.php/.test(app));
    cek('kotak key Meta bertipe password', adm.d.getElementById('s-aikey-meta').type === 'password');
    cek('Anthropic dicabut: tanpa pemilih penyedia & kotak key-nya (walau server lama memulangkannya)',
      !adm.d.getElementById('s-penyedia') && !adm.d.getElementById('s-aikey') && !adm.d.getElementById('s-model') && !/Anthropic/.test(app));
    cek('model Meta dari daftar, contributor terpilih', adm.d.getElementById('s-model-meta').value === 'muse-spark-1.3-contributor');
    cek('arti -contributor (data boleh dipakai melatih) disebut di layar', /boleh memakai data yang dikirim/.test(app));
    const ka = adm.d.getElementById('s-kategori');
    cek('kategori pola tampil satu baris satu kategori', ka && ka.value === 'Hook 3 Detik & Retensi\nTopik Lokal', ka && JSON.stringify(ka.value));
    /* kosong ditahan, tidak terkirim */
    const n0 = adm.srv.log.filter(b => b.action === 'campaignSetting').length;
    ka.value = '  \n ';
    klik(adm.d, '[data-a="set-simpan"]'); await tunggu(40);
    cek('kategori kosong DITAHAN, tidak terkirim', adm.srv.log.filter(b => b.action === 'campaignSetting').length === n0 && /minimal satu/.test(adm.d.getElementById('s-galat').innerHTML));
    adm.d.getElementById('s-kategori').value = 'Hook 3 Detik & Retensi\n  Promo Malam  \n\nTopik Lokal';
    adm.d.getElementById('s-aikey-meta').value = 'kunci-uji';
    klik(adm.d, '[data-a="set-simpan"]'); await tunggu(60);
    const kirim = adm.srv.log.filter(b => b.action === 'campaignSetting').pop();
    cek('Simpan mengirim kategori (dipangkas, baris kosong dibuang) + model & key Meta saja', kirim
      && JSON.stringify(kirim.data.kategori) === JSON.stringify(['Hook 3 Detik & Retensi', 'Promo Malam', 'Topik Lokal'])
      && kirim.data.aiModelMeta === 'muse-spark-1.3-contributor' && kirim.data.aiKeyMeta === 'kunci-uji'
      && !('aiKey' in kirim.data) && !('aiPenyedia' in kirim.data) && !('aiModel' in kirim.data), kirim && JSON.stringify(kirim.data));
  }

  console.log('\n== Invarian ==');
  {
    const { w } = await buka();
    const halaman = ['insight', 'kalender', 'riset', 'pengaturan'];
    cek('tiap halaman menu punya judul di TITLES', halaman.every(h => w.__cg.TITLES[h]));
    const porto = fs.readFileSync(path.join(ROOT, 'deploy/index.html'), 'utf8');
    cek('kunci campaign terdaftar di portal (kartu Konten)', /key:'konten'[\s\S]{0,120}access:\['konten','campaign'\]/.test(porto));
    cek('kartu Campaign mandiri sudah dicabut', !/key:'campaign'/.test(porto));
    cek('ada panduan Help', fs.existsSync(path.join(ROOT, 'deploy/help/panduan/campaign.js')));
  }

  console.log('\n== Profil & statistik akun TikTok ==');
  {
    const { d } = await buka();
    const kartu = d.querySelector('.akun').innerHTML;
    const b0 = d.querySelectorAll('.akun-stat b')[0];
    cek('follower tampil', /follower/.test(kartu) && b0 && b0.textContent !== '0', b0 && b0.textContent);
    cek('statistik 4 angka (follower/following/likes/video)', d.querySelectorAll('.akun-stat > div').length === 4);
    cek('bio tampil', /Coffee &amp; live music Pekanbaru/.test(kartu));
    cek('centang terverifikasi tampil', !!d.querySelector('.akun-cek'));
    cek('tautan profil tampil', !!d.querySelector('.akun a[href="https://www.tiktok.com/@laksamanamuda.id"]'));
    cek('izin lengkap -> tidak ada tombol Hubungkan ulang', !d.querySelector('.akun [data-a="tt-hubung"]'));
  }
  {
    const { d, srv } = await buka({ akun: [{ platform: 'tiktok', nama: 'Akun Lama', terhubung: true, sync_at: Date.now(), sync_galat: '', scope: 'user.info.basic,video.list', stats_ada: 0, follower: 0 }] });
    const kartu = d.querySelector('.akun').innerHTML;
    cek('akun lama: statistik TIDAK digambar sebagai 0', !d.querySelector('.akun-stat'));
    cek('akun lama: izin yang kurang disebut', /user\.info\.profile, user\.info\.stats/.test(kartu));
    cek('akun lama: tombol Hubungkan ulang ada', !!d.querySelector('.akun [data-a="tt-hubung"]'));
    klik(d, '.akun [data-a="tt-hubung"]');
    await tunggu(30);
    cek('Hubungkan ulang memanggil campaignTiktokMulai', srv.log.some(b => b.action === 'campaignTiktokMulai'));
  }

  console.log('\n== Sisi server ==');
  {
    let P = null;
    try { P = require(process.env.PHP_PARSER_PATH || 'php-parser'); } catch (e) { P = null; }
    if (!P) { lewat++; console.log('  LEWAT php-parser tidak terpasang'); }
    else {
      for (const [nama, src] of [['lib_campaign.php', PHP_LIB], ['api.php', PHP_API], ['campaign-tiktok.php', PHP_CB]]) {
        let e2 = null; try { new P({}).parseCode(src, nama); } catch (e) { e2 = e.message; }
        cek('sintaks ' + nama, e2 === null, e2);
      }
    }
    const aksi = PHP_LIB.slice(PHP_LIB.indexOf('function cg_aksi('));
    cek('cg_aksi memeriksa sesi SEBELUM aksi apa pun', aksi.indexOf('sesi_tolak_tak_dikenal') > -1 && aksi.indexOf('sesi_tolak_tak_dikenal') < aksi.indexOf('switch'));
    cek('cg_aksi memeriksa kunci modul campaign', /sesi_punya_modul\(\$u, 'campaign'\)/.test(aksi));
    cek('pengaturan hanya admin modul', /case 'campaignSetting':\s*\n\s*if \(!sesi_admin_modul\(\$u, 'campaign'\)\)/.test(aksi));
    const baca = PHP_LIB.slice(PHP_LIB.indexOf('function cg_baca('), PHP_LIB.indexOf('function cg_konten_perf('));
    cek('campaignGet TIDAK memulangkan token', !/access_token|refresh_token/.test(baca.replace(/\/\*[\s\S]*?\*\//g, '')));
    cek('campaignGet TIDAK memulangkan API key', !/'ai_key'|cg_ai_key\(\$pdo\)\s*[,)]/.test(baca.replace(/cg_ai_key\(\$pdo\) !== ''/g, '')));
    const tanpaKomentar = PHP_LIB.replace(/\/\*[\s\S]*?\*\//g, '');
    /* Satu-satunya DELETE: hapus permanen ide Bank Konten, dan HANYA yang ARSIP. */
    const del = tanpaKomentar.match(/\bDELETE\b[^"']*/gi) || [];
    cek('DELETE hanya satu: ide Bank Konten berstatus ARSIP', del.length === 1 && tanpaKomentar.includes("DELETE FROM cg_bank WHERE id=:id AND status='ARSIP'"), del.join(' | '));
    cek('tabel lahir lewat CREATE TABLE IF NOT EXISTS', /CREATE TABLE IF NOT EXISTS cg_insight/.test(PHP_LIB) && /CREATE TABLE IF NOT EXISTS cg_jadwal/.test(PHP_LIB));
    cek('api.php meneruskan aksi campaign ke cg_aksi', /strpos\(\$action, 'campaign'\) === 0[\s\S]{0,400}cg_aksi\(\$action, \$body\)/.test(PHP_API));
    cek('OAuth memakai state sekali pakai', /hash_equals\(\(string\)\$st\['s'\]/.test(PHP_LIB) && /cg_set_tulis\(\$pdo, 'tiktok_state', ''\)/.test(PHP_LIB));
    cek('Tayang wajib tautan juga di server', /\$status === 'TAYANG' && \$tautan === ''/.test(PHP_LIB));
    cek('scope OAuth = keempat scope app', /define\('CG_TIKTOK_SCOPE', 'user\.info\.basic,user\.info\.profile,user\.info\.stats,video\.list'\)/.test(PHP_LIB) && /'scope' => CG_TIKTOK_SCOPE/.test(PHP_LIB));
    const sync = PHP_LIB.slice(PHP_LIB.indexOf('function cg_tiktok_sync('), PHP_LIB.indexOf('function cg_tiktok_putus('));
    cek('field profil HANYA diminta kalau izinnya ada', /if \(\$adaProfil\) \$fu \.= ',bio_description/.test(sync));
    cek('field statistik HANYA diminta kalau izinnya ada', /if \(\$adaStats\)  \$fu \.= ',follower_count/.test(sync));
    cek('kolom baru lahir lewat ALTER', /ALTER TABLE cg_akun ADD COLUMN/.test(PHP_LIB) && /'stats_ada'/.test(PHP_LIB));
    const priv = fs.readFileSync(path.join(ROOT, 'deploy/legal/privacy.html'), 'utf8');
    cek('kebijakan privasi menyebut keempat scope', ['user.info.basic','user.info.profile','user.info.stats','video.list'].every(x => priv.includes(x)));
    const sync2 = PHP_LIB.slice(PHP_LIB.indexOf('function cg_tiktok_sync('), PHP_LIB.indexOf('function cg_tiktok_putus('));
    cek('sinkron: 2 halaman terbaru', /for \(\$h = 0; \$h < 2; \$h\+\+\)/.test(sync2));
    cek('sinkron: riwayat 5 halaman per sinkron dari cursor tersimpan', /for \(\$h = 0; !\$selesai && \$h < 5; \$h\+\+\)/.test(sync2) && /cg_set_tulis\(\$pdo, 'tiktok_bf_cursor', \$c\)/.test(sync2));
    cek('sinkron: video lama disegarkan lewat video/query (40)', /video\/query/.test(sync2) && /LIMIT 40/.test(sync2));
    cek('video yang tak dipulangkan ditandai hilang, bukan dihapus', /SET hilang=1/.test(sync2) && !/DELETE/i.test(sync2));
    const top = PHP_LIB.slice(PHP_LIB.indexOf('function cg_top('), PHP_LIB.indexOf('/* ==================== INSIGHT'));
    cek('cg_top memotong per halaman (per dijepit 5..50)', /max\(5, min\(50/.test(top) && /array_slice\(\$lolos/.test(top));
    cek('cg_top tanggal tayang WIB', /\+ 7 \* 3600/.test(top));
    cek('cg_top tidak menampilkan video hilang', /WHERE hilang=0/.test(top));
    cek('campaignGet tidak lagi membawa daftar postingan', !/'post'\s*=>/.test(PHP_LIB) && /'postInfo' => \$postInfo/.test(PHP_LIB));
    cek('ganti akun mereset riwayat', /\$lama !== \$baru/.test(PHP_LIB));
    const tanya = PHP_LIB.slice(PHP_LIB.indexOf('function cg_ai_tanya('), PHP_LIB.indexOf('function cg_bukti_post('));
    cek('Meta: Authorization Bearer', tanya.includes("array('content-type: application/json', 'Authorization: Bearer ' . $key)"));
    cek('Anthropic dicabut dari pemanggil AI', !/x-api-key|anthropic-version|api\.anthropic\.com/.test(PHP_LIB));
    const daftarAi = PHP_LIB.slice(PHP_LIB.indexOf('function cg_ai_daftar('), PHP_LIB.indexOf('function cg_ai_penyedia('));
    cek('daftar penyedia cuma meta', /'meta' =>/.test(daftarAi) && !/'anthropic' =>/.test(daftarAi));
    cek('penyedia selalu meta', /function cg_ai_penyedia\(\$pdo\) \{ return 'meta'; \}/.test(PHP_LIB));
    const simpanSet = PHP_LIB.slice(PHP_LIB.indexOf('function cg_setting_simpan('), PHP_LIB.indexOf('/* ==================== PINTU API'));
    cek('setelan tidak lagi menulis key/model/penyedia Anthropic (dan tidak menghapusnya)', !/'aiKey' =>|ai_penyedia|'aiModel'/.test(simpanSet) && !/DELETE/.test(simpanSet));
    cek('kategori kosong ditolak server', simpanSet.includes("throw new Exception('Kategori pola minimal satu.')"));
    cek('kategori dirapikan (kembar, panjang, jumlah) di satu tempat', /function cg_kategori_rapikan/.test(PHP_LIB) && /strtolower\(\$k\)/.test(PHP_LIB) && /CG_KATEGORI_MAKS/.test(PHP_LIB));
    cek('campaignGet memulangkan kategori', PHP_LIB.includes("'kategori'   => cg_kategori($pdo)"));
    const insAi = PHP_LIB.slice(PHP_LIB.indexOf('function cg_insight_ai('));
    cek('prompt Temukan insight memakai kategori dari setelan', insAi.includes("implode('|', $kategori)") && !insAi.includes('Hook 3 Detik & Retensi|Format'));
    cek('kategori usulan di luar daftar dikosongkan', insAi.includes("in_array((string)$i['kategori'], $kategori, true)"));
    cek('alamat Meta = api.meta.ai/v1/messages', /'https:\/\/api\.meta\.ai\/v1\/messages'/.test(PHP_LIB));
    cek('model disimpan HANYA dari daftar penyedia', PHP_LIB.includes("in_array((string)$d['aiModelMeta'], $daftar['meta']['model'], true)"));
    cek('key Meta disimpan terpisah', /'aiKeyMeta' => 'ai_key_meta'/.test(PHP_LIB));
    const priv2 = fs.readFileSync(path.join(ROOT, 'deploy/legal/privacy.html'), 'utf8');
    cek('kebijakan privasi menyebut Meta & tier Contributor, tanpa Anthropic', /Meta<\/b> \(Muse Spark/.test(priv2) && /Contributor/.test(priv2) && !/Anthropic/.test(priv2));
    cek('usulan AI membuang tautan karangan', /if \(!isset\(\$sah\[\$url\]\)\) \$url = ''/.test(PHP_LIB));
  }

  console.log('\n====================================================');
  console.log('  OK: ' + ok + '   GAGAL: ' + gagal + (lewat ? '   LEWAT: ' + lewat : ''));
  console.log('====================================================');
  process.exit(gagal ? 1 : 0);
})().catch(e => { console.error('UJI TIDAK SELESAI:', e); process.exit(1); });
