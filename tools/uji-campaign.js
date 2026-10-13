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

/* ---------- Server tiruan HIDUP ---------- */
function buatServer(opsi) {
  opsi = opsi || {};
  const S = {
    insight: [], jadwal: [
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
    akun: (opsi && opsi.akun) || [{ platform: 'tiktok', nama: 'Laksamana Muda Pekanbaru', terhubung: true, sync_at: Date.now(), sync_galat: '',
      scope: 'user.info.basic,user.info.profile,user.info.stats,video.list', stats_ada: 1, follower: 12345, following: 8, likes_total: 456789, jml_video: 321,
      terverifikasi: 1, bio: 'Coffee & live music Pekanbaru', profil_url: 'https://www.tiktok.com/@laksamanamuda.id', avatar: 'https://p16.tiktokcdn.com/a.jpg' }],
    konten: [
      { platform: 'instagram', judul: 'Reels kopi', url: 'https://instagram.com/p/a', tanggal: '2026-09-10', views: 5000, likes: 400, comments: 10, shares: 5 },
      /* Tautan SAMA dengan postingan TikTok 1 — tidak boleh muncul dua kali. */
      { platform: 'tiktok', judul: 'Goyang (dari Konten)', url: 'https://www.tiktok.com/@x/video/1', tanggal: '2026-09-26', views: 1, likes: 0, comments: 0, shares: 0 }
    ],
    setting: { aiSiap: true, aiModel: 'claude-opus-5-5', profil: 'Profil', tiktokSiap: true, redirectUri: 'https://dev.laksamanamuda.id/konten-api-mysql/campaign-tiktok.php', tiktokScope: 'user.info.basic,user.info.profile,user.info.stats,video.list' },
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
    } else if (b.action === 'campaignInsightArsip') {
      S.insight.find(x => x.id === b.data.id).arsip = b.data.arsip ? 1 : 0; data = { ok: true };
    } else if (b.action === 'campaignInsightAI') data = { usulan: [{ platform: 'TikTok', kategori: 'Hook 3 Detik & Retensi', temuan: 'Usulan AI', url: 'https://www.tiktok.com/@x/video/1', tglTayang: '2026-09-26', metrik: '109 rb', aksi: 'Pakai' }] };
    else if (b.action === 'campaignTiktokSync') data = { jumlah: 2, total: 2, riwayatSelesai: false };
    else if (b.action === 'campaignTop') data = topTiruan(S, b.data);
    else data = { ok: true };
    return Promise.resolve({ text: () => Promise.resolve(JSON.stringify({ ok: true, data })) });
  }
  /* Tiruan cg_top(): gabung TikTok + Input Performa (tautan sama tidak dua
     kali), saring platform & tanggal tayang WIB, urut, potong per halaman. */
  function topTiruan(S, q) {
    const norm = p => { const k = String(p || '').toLowerCase(); return k.includes('tiktok') ? 'TikTok' : (k.includes('insta') ? 'Instagram' : (k.includes('you') ? 'YouTube' : p)); };
    const semua = [], url = {};
    S.post.forEach(p => { semua.push({ platform: norm(p.platform), judul: p.judul, url: p.url, tanggal: new Date(p.tayang_at + 7 * 3600e3).toISOString().slice(0, 10), views: p.views, likes: p.likes, comments: p.comments, shares: p.shares, sumber: 'tiktok' }); url[p.url] = 1; });
    S.konten.forEach(k => { if (k.url && url[k.url]) return; semua.push({ platform: norm(k.platform), judul: k.judul, url: k.url, tanggal: k.tanggal, views: k.views, likes: k.likes, comments: k.comments, shares: k.shares, sumber: 'konten' }); });
    let l = semua.filter(e => (!q.platform || e.platform === q.platform) && (!q.dari || (e.tanggal && e.tanggal >= q.dari)) && (!q.sampai || (e.tanggal && e.tanggal <= q.sampai)));
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

  console.log('\n== Riset ==');
  {
    const { d } = await buka({ hash: '#riset' });
    const app = d.getElementById('app').innerHTML;
    cek('hasil riset tergambar', /Hasil riset: Live music/.test(app) && /Ide C/.test(app));
    cek('label Estimasi AI tampil', /Estimasi AI, bukan data pasar/.test(app));
    klik(d, '[data-a="ide-jadwal"]');
    cek('Jadwalkan ide membuka form berisi hook + caption', /Hook C/.test(d.getElementById('j-cap').value) && d.getElementById('j-judul').value === 'Ide C');
  }

  console.log('\n== Pengaturan ==');
  {
    const bukan = await buka({ hash: '#pengaturan' });
    cek('bukan admin yang membuka #pengaturan dipulangkan ke Insight', /Konten terpopuler/.test(bukan.d.getElementById('app').innerHTML));
    const adm = await buka({ hash: '#pengaturan', admin: true });
    const app = adm.d.getElementById('app').innerHTML;
    cek('admin melihat Pengaturan', /Profil brand/.test(app));
    cek('redirect URI disebut', /campaign-tiktok\.php/.test(app));
    cek('kotak rahasia bertipe password', adm.d.getElementById('s-aikey').type === 'password');
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
    cek('tidak ada DELETE di lib_campaign', !/\bDELETE\b/i.test(tanpaKomentar));
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
    cek('usulan AI membuang tautan karangan', /if \(!isset\(\$sah\[\$url\]\)\) \$url = ''/.test(PHP_LIB));
  }

  console.log('\n====================================================');
  console.log('  OK: ' + ok + '   GAGAL: ' + gagal + (lewat ? '   LEWAT: ' + lewat : ''));
  console.log('====================================================');
  process.exit(gagal ? 1 : 0);
})().catch(e => { console.error('UJI TIDAK SELESAI:', e); process.exit(1); });
