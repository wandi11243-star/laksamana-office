/* Uji posting Instagram dari Kalender (Konten Analytics, 8 Nov 2026).
 *
 *   JSDOM_PATH=/jalur/ke/jsdom node tools/uji-posting-ig.js
 *
 * Dua lapis:
 *  1. halamannya DIJALANKAN di jsdom dengan server tiruan; yang diukur
 *     KIRIMAN ke server (jumlah & isi POST), bukan pesan di layar.
 *  2. sisi PHP: sintaks lewat php-parser + kontrak atas sumbernya (tidak ada
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
const LIB = fs.readFileSync(path.join(ROOT, 'konten-mysql/lib_campaign.php'), 'utf8');
const API = fs.readFileSync(path.join(ROOT, 'konten-mysql/api.php'), 'utf8');
const PEMICU = fs.readFileSync(path.join(ROOT, 'konten-mysql/campaign-posting.php'), 'utf8');

function wib(dMenit) { return new Date(Date.now() + 7 * 3600e3 + (dMenit || 0) * 60e3).toISOString(); }
const KUNCI = 'cgm_' + 'a'.repeat(32) + '.jpg';
const KUNCI2 = 'cgm_' + 'b'.repeat(32) + '.jpg';

/* Dua postingan: P1 punya komentar yang SUDAH dibalas akun kita, komentar
   yang BELUM, dan satu yang disembunyikan; P2 kolom komentarnya ditutup. */
function komentarTiruan(satu) {
  const P1 = { id: '1790001', judul: 'Reel kopi', url: 'https://www.instagram.com/p/K1/', cover: '', tayang_at: Date.now(), aktif: true, jumlah: 3, galat: '',
    komentar: [
      { id: '1800001', teks: 'Jam buka berapa kak?', waktu: Date.now(), user: 'tamu_a', suka: 1, sembunyi: false, balasan: [] },
      { id: '1800002', teks: 'Mantap!', waktu: Date.now() - 6e4, user: 'tamu_b', suka: 0, sembunyi: false,
        balasan: [{ id: '1800099', teks: 'Terima kasih!', waktu: Date.now(), user: 'laksamanamuda.id', suka: 0, sembunyi: false }] },
      { id: '1800003', teks: 'spam spam', waktu: Date.now() - 12e4, user: 'spammer', suka: 0, sembunyi: true, balasan: [] }
    ] };
  const P2 = { id: '1790002', judul: 'Foto menu', url: '', cover: '', tayang_at: Date.now(), aktif: false, jumlah: 1, galat: '',
    komentar: [{ id: '1800004', teks: 'Harga?', waktu: Date.now(), user: 'tamu_c', suka: 0, sembunyi: false, balasan: [] }] };
  const posts = satu ? [P1, P2].filter(p => p.id === satu) : [P1, P2];
  return { posts, saya: 'laksamanamuda.id', at: Date.now() };
}

function buatServer(opsi) {
  opsi = opsi || {};
  const lalu = wib(-30), nanti = wib(240);
  const S = {
    insight: [], riset: [], bank: [], postInfo: { total: 0 },
    jadwal: [
      /* jatuh tempo 30 menit lalu, otomatis */
      { id: 'jt', platform: 'Instagram', judul: 'Promo jatuh tempo', caption: 'Halo', tanggal: lalu.slice(0, 10), jam: lalu.slice(11, 16), status: 'TERJADWAL',
        media: JSON.stringify([KUNCI]), otomatis: opsi.tanpaOtomatis ? '0' : '1', ig_media_id: '', posting_galat: '', insight_id: '', pic: '', tautan: '', catatan: '' },
      /* belum waktunya, punya 2 foto */
      { id: 'nn', platform: 'Instagram', judul: 'Carousel nanti', caption: 'Nanti', tanggal: nanti.slice(0, 10), jam: nanti.slice(11, 16), status: 'TERJADWAL',
        media: JSON.stringify([KUNCI, KUNCI2]), otomatis: '0', ig_media_id: '', posting_galat: '', insight_id: '', pic: '', tautan: '', catatan: '' },
      /* sudah diposting */
      { id: 'ss', platform: 'Instagram', judul: 'Sudah tayang', caption: '', tanggal: nanti.slice(0, 10), jam: '08:00', status: 'TAYANG',
        media: JSON.stringify([KUNCI]), otomatis: '0', ig_media_id: '999', diposting_oleh: 'Uji', diposting_at: Date.now(), posting_galat: '', insight_id: '', pic: '', tautan: 'https://www.instagram.com/p/X/', catatan: '' },
      /* TikTok: tidak boleh punya tombol posting */
      { id: 'tt', platform: 'TikTok', judul: 'Video TikTok', caption: '', tanggal: nanti.slice(0, 10), jam: '20:00', status: 'TERJADWAL',
        media: '[]', otomatis: '0', ig_media_id: '', posting_galat: '', insight_id: '', pic: '', tautan: '', catatan: '' }
    ],
    akun: [{ platform: 'instagram', nama: 'laksamanamuda.id', terhubung: true, sync_at: Date.now(), sync_galat: '',
      scope: opsi.tanpaIzin ? 'instagram_business_basic,instagram_business_manage_insights' : 'instagram_business_basic,instagram_business_manage_insights,instagram_business_content_publish' + (opsi.tanpaKomentar ? '' : ',instagram_business_manage_comments') }],
    setting: { kategori: [], ai: [], profil: '' },
    boleh: { admin: false }
  };
  const log = [];
  function fetchTiruan(url, init) {
    const b = JSON.parse(init.body); log.push(b);
    let data;
    if (b.action === 'campaignGet') data = JSON.parse(JSON.stringify(S));
    else if (b.action === 'campaignIgPostingJatuhTempo') {
      const j = S.jadwal.find(x => x.id === 'jt'); j.ig_media_id = '111'; j.status = 'TAYANG'; j.otomatis = '0';
      data = { diposting: [{ id: 'jt', mediaId: '111', tautan: 'https://www.instagram.com/p/A/' }], gagal: [], terlewat: 0 };
    } else if (b.action === 'campaignIgPosting') {
      const j = S.jadwal.find(x => x.id === b.data.id); j.ig_media_id = '222'; j.status = 'TAYANG';
      data = { id: j.id, mediaId: '222', tautan: 'https://www.instagram.com/p/B/' };
    } else if (b.action === 'campaignMediaUnggah') data = { key: KUNCI2 };
    else if (b.action === 'campaignJadwalSimpan') data = { id: b.data.id || 'baru' };
    else if (b.action === 'campaignIgKomentar') data = komentarTiruan(b.data.media);
    else if (/^campaignIgKomentar(Balas|Sembunyi|Hapus|Aktif)$/.test(b.action)) {
      if (opsi.tolakKomentar) return Promise.resolve({ text: () => Promise.resolve(JSON.stringify({ ok: false, error: 'Instagram menolak balasan' })) });
      data = { ok: true };
    }
    else data = {};
    return Promise.resolve({ text: () => Promise.resolve(JSON.stringify({ ok: true, data })) });
  }
  return { S, log, fetchTiruan };
}

async function buka(opsi) {
  const srv = buatServer(opsi);
  let ditanya = 0;
  const dom = new JSDOM(HTML, {
    url: 'https://dev.laksamanamuda.id/konten/analytics/#' + ((opsi && opsi.hash) || 'kalender'),
    runScripts: 'dangerously', pretendToBeVisual: true,
    beforeParse(w) {
      w.localStorage.setItem('lm_session', JSON.stringify({ name: 'Uji', token: 'tok', expiry: Date.now() + 3600e3, modules: ['campaign'] }));
      w.fetch = srv.fetchTiruan;
      w.confirm = () => { ditanya++; return !(opsi && opsi.tolak); };
    }
  });
  await tunggu(80);
  /* Kartu jadwal digambar per TANGGAL yang dipilih — semua fixture yang
     belum jatuh tempo ada di tanggal "nanti". */
  dom.window.__cg.ST.kalPilih = wib(240).slice(0, 10);
  dom.window.__cg.ST.kalBulan = wib(240).slice(0, 7);
  dom.window.__cg.render();
  return { w: dom.window, d: dom.window.document, srv, ditanya: () => ditanya };
}
function klik(d, el) { el.dispatchEvent(new d.defaultView.MouseEvent('click', { bubbles: true })); }
const kartuDari = (d, judul) => [...d.querySelectorAll('.jd')].find(k => k.textContent.indexOf(judul) > -1);

(async () => {
  console.log('\n== Posting otomatis saat halaman dibuka ==');
  {
    const { w, d, srv } = await buka();
    w.__cg.ST.kalPilih = wib(-30).slice(0, 10); w.__cg.ST.kalBulan = wib(-30).slice(0, 7); w.__cg.render();
    cek('jadwal otomatis yang jatuh tempo memicu campaignIgPostingJatuhTempo', srv.log.filter(b => b.action === 'campaignIgPostingJatuhTempo').length === 1);
    cek('sesudah terposting, data dimuat ulang (campaignGet kedua)', srv.log.filter(b => b.action === 'campaignGet').length >= 2);
    const jt = kartuDari(d, 'Promo jatuh tempo');
    cek('kartu yang barusan terposting berbunyi "Diposting ke Instagram"', jt && /Diposting ke Instagram/.test(jt.textContent));
  }
  {
    const { srv } = await buka({ tanpaOtomatis: true });
    cek('tanpa jadwal otomatis jatuh tempo, server TIDAK ditembak', srv.log.filter(b => b.action === 'campaignIgPostingJatuhTempo').length === 0);
  }
  {
    const { d, srv } = await buka({ tanpaIzin: true });
    cek('tanpa izin publish, posting otomatis TIDAK dipicu', srv.log.filter(b => b.action === 'campaignIgPostingJatuhTempo').length === 0);
    cek('tanpa izin publish, tombol Posting sekarang TIDAK muncul', !d.querySelector('[data-a="jdw-posting"]'));
    cek('pita menyuruh menghubungkan ulang Instagram', /Izin posting Instagram belum diberikan/.test(d.getElementById('app').textContent));
  }

  console.log('\n== Tombol Posting sekarang ==');
  {
    const { d, srv, ditanya } = await buka({ tanpaOtomatis: true });
    const nn = kartuDari(d, 'Carousel nanti');
    const btn = nn && nn.querySelector('[data-a="jdw-posting"]');
    cek('jadwal Instagram berfoto punya tombol Posting sekarang', !!btn);
    cek('jadwal TikTok TIDAK punya tombol posting', !kartuDari(d, 'Video TikTok').querySelector('[data-a="jdw-posting"]'));
    cek('jadwal yang sudah diposting TIDAK punya tombol posting', !kartuDari(d, 'Sudah tayang').querySelector('[data-a="jdw-posting"]'));
    klik(d, btn); await tunggu(60);
    cek('ditanya dulu sebelum memposting', ditanya() === 1);
    const kirim = srv.log.filter(b => b.action === 'campaignIgPosting');
    cek('campaignIgPosting dikirim SEKALI dengan id jadwalnya', kirim.length === 1 && kirim[0].data.id === 'nn');
  }
  {
    const { d, srv } = await buka({ tanpaOtomatis: true, tolak: true });
    klik(d, kartuDari(d, 'Carousel nanti').querySelector('[data-a="jdw-posting"]')); await tunggu(40);
    cek('konfirmasi DITOLAK = tidak ada yang dikirim', srv.log.filter(b => b.action === 'campaignIgPosting').length === 0);
  }

  console.log('\n== Form jadwal ==');
  {
    const { w, d, srv } = await buka({ tanpaOtomatis: true });
    const idx = srv.S.jadwal.findIndex(j => j.id === 'nn');
    klik(d, d.querySelector('[data-a="jdw-ubah"][data-i="' + idx + '"]')); await tunggu(20);
    const ig = d.getElementById('j-ig');
    cek('blok foto Instagram tampil untuk jadwal Instagram', ig && ig.style.display !== 'none');
    cek('kedua foto yang tersimpan tergambar (carousel)', ig.querySelectorAll('.fo img').length === 2);
    /* buang foto pertama, centang otomatis, simpan */
    klik(d, ig.querySelector('[data-a="jdw-foto-hapus"][data-i="0"]')); await tunggu(10);
    const oto = d.querySelector('[data-a="jdw-oto"]'); oto.checked = true; oto.dispatchEvent(new w.Event('change', { bubbles: true }));
    klik(d, d.querySelector('[data-a="jdw-simpan"]')); await tunggu(40);
    const s = srv.log.filter(b => b.action === 'campaignJadwalSimpan').pop();
    cek('simpan membawa foto yang tersisa saja', s && JSON.stringify(s.data.media) === JSON.stringify([KUNCI2]), s && JSON.stringify(s.data.media));
    cek('simpan membawa otomatis=true', s && s.data.otomatis === true);

    /* ganti platform ke TikTok -> blok foto hilang, dan media tidak ikut */
    klik(d, d.querySelector('[data-a="jdw-ubah"][data-i="' + idx + '"]')); await tunggu(20);
    const pl = d.getElementById('j-plat'); pl.value = 'TikTok'; pl.dispatchEvent(new w.Event('change', { bubbles: true }));
    cek('platform TikTok menyembunyikan blok foto', d.getElementById('j-ig').style.display === 'none');
    klik(d, d.querySelector('[data-a="jdw-simpan"]')); await tunggu(40);
    const s2 = srv.log.filter(b => b.action === 'campaignJadwalSimpan').pop();
    cek('jadwal TikTok tidak membawa foto maupun otomatis', s2 && s2.data.media.length === 0 && s2.data.otomatis === false);
  }
  {
    /* otomatis tanpa jam -> DITAHAN, tidak ada kiriman */
    const { w, d, srv } = await buka({ tanpaOtomatis: true });
    const idx = srv.S.jadwal.findIndex(j => j.id === 'nn');
    klik(d, d.querySelector('[data-a="jdw-ubah"][data-i="' + idx + '"]')); await tunggu(20);
    const oto = d.querySelector('[data-a="jdw-oto"]'); oto.checked = true; oto.dispatchEvent(new w.Event('change', { bubbles: true }));
    d.getElementById('j-jam').value = '';
    const n0 = srv.log.filter(b => b.action === 'campaignJadwalSimpan').length;
    klik(d, d.querySelector('[data-a="jdw-simpan"]')); await tunggu(30);
    cek('posting otomatis tanpa jam DITAHAN (tidak dikirim)', srv.log.filter(b => b.action === 'campaignJadwalSimpan').length === n0);
    cek('sebabnya disebut', /jam tayang \(posting otomatis\)/.test(d.getElementById('j-galat').textContent));
  }
  {
    /* jadwal yang sudah diposting: foto tidak bisa diganti */
    const { d, srv } = await buka({ tanpaOtomatis: true });
    const idx = srv.S.jadwal.findIndex(j => j.id === 'ss');
    klik(d, d.querySelector('[data-a="jdw-ubah"][data-i="' + idx + '"]')); await tunggu(20);
    cek('jadwal yang sudah diposting: blok foto mengatakannya, tanpa tombol tambah', /sudah diposting ke Instagram/.test(d.getElementById('j-ig').textContent) && !d.querySelector('[data-a="jdw-foto"]'));
  }

  console.log('\n== Komentar Instagram ==');
  {
    const { d, srv } = await buka({ tanpaKomentar: true, hash: 'komentar' });
    cek('menu Komentar IG ada di sidebar', !!d.querySelector('#nav [data-v="komentar"]'));
    cek('tanpa izin komentar: menyuruh hubungkan ulang, TIDAK menembak server', /Izin kelola komentar belum diberikan/.test(d.getElementById('app').textContent)
      && srv.log.filter(b => b.action === 'campaignIgKomentar').length === 0);
  }
  {
    const { w, d, srv } = await buka({ tanpaOtomatis: true, hash: 'komentar' });
    await tunggu(40);
    const app = () => d.getElementById('app');
    cek('daftar komentar dimuat dari server (campaignIgKomentar)', srv.log.some(b => b.action === 'campaignIgKomentar'));
    cek('bawaan "Belum dibalas": komentar tanpa balasan kita tampil', /Jam buka berapa kak\?/.test(app().textContent) && /Harga\?/.test(app().textContent));
    cek('bawaan "Belum dibalas": yang sudah kita balas TIDAK tampil', !/Mantap!/.test(app().textContent));
    klik(d, d.querySelector('[data-a="km-filter"][data-v="semua"]')); await tunggu(10);
    cek('tab Semua memuat yang sudah dibalas + balasan kita bertanda "kita"', /Mantap!/.test(app().textContent) && /Terima kasih!/.test(app().textContent) && !!d.querySelector('.tag-saya'));
    cek('komentar tersembunyi ditandai', !!d.querySelector('.km.sbn .tag-sbn'));
    cek('postingan yang kolom komentarnya ditutup menawarkan "Buka kolom komentar"', !!d.querySelector('[data-a="km-aktif"][data-v="1790002"][data-s="1"]'));
    klik(d, d.querySelector('[data-a="km-filter"][data-v="sembunyi"]')); await tunggu(10);
    cek('tab Disembunyikan hanya memuat yang disembunyikan', /spam spam/.test(app().textContent) && !/Jam buka/.test(app().textContent));

    /* Balas: draf diketik, dikirim, lalu postingannya dimuat ulang */
    klik(d, d.querySelector('[data-a="km-filter"][data-v="belum"]')); await tunggu(10);
    klik(d, d.querySelector('[data-a="km-balas"][data-v="1800001"]')); await tunggu(10);
    const ta = d.querySelector('textarea[data-a="km-draf"]');
    cek('Balas membuka kotak balasan', !!ta);
    klik(d, d.querySelector('[data-a="km-kirim"]')); await tunggu(20);
    cek('balasan kosong DITAHAN', srv.log.filter(b => b.action === 'campaignIgKomentarBalas').length === 0);
    const ta2 = d.querySelector('textarea[data-a="km-draf"]');
    ta2.value = 'Buka jam 10 pagi kak'; ta2.dispatchEvent(new w.Event('input', { bubbles: true }));
    klik(d, d.querySelector('[data-a="km-kirim"]')); await tunggu(60);
    const bl = srv.log.filter(b => b.action === 'campaignIgKomentarBalas');
    cek('balasan dikirim sekali dengan id komentar & teksnya', bl.length === 1 && bl[0].data.id === '1800001' && bl[0].data.pesan === 'Buka jam 10 pagi kak');
    const muatUlang = srv.log.filter(b => b.action === 'campaignIgKomentar');
    cek('sesudah membalas, HANYA postingan itu yang dimuat ulang', muatUlang[muatUlang.length - 1].data.media === '1790001');
    cek('kotak balasan tertutup sesudah terkirim', !d.querySelector('textarea[data-a="km-draf"]'));

    /* Hapus: ditanya, dan kalau ditolak tidak dikirim */
    w.confirm = () => false;
    klik(d, d.querySelector('[data-a="km-hapus"][data-v="1800004"]')); await tunggu(20);
    cek('hapus yang DITOLAK di konfirmasi tidak dikirim', srv.log.filter(b => b.action === 'campaignIgKomentarHapus').length === 0);
    w.confirm = () => true;
    klik(d, d.querySelector('[data-a="km-hapus"][data-v="1800004"]')); await tunggu(40);
    cek('hapus yang disetujui dikirim dengan id-nya', srv.log.filter(b => b.action === 'campaignIgKomentarHapus' && b.data.id === '1800004').length === 1);
    klik(d, d.querySelector('[data-a="km-sembunyi"][data-v="1800001"]')); await tunggu(40);
    cek('sembunyikan mengirim sembunyi=true', srv.log.some(b => b.action === 'campaignIgKomentarSembunyi' && b.data.id === '1800001' && b.data.sembunyi === true));
  }
  {
    const { w, d, srv } = await buka({ tanpaOtomatis: true, hash: 'komentar', tolakKomentar: true });
    await tunggu(40);
    klik(d, d.querySelector('[data-a="km-balas"][data-v="1800001"]')); await tunggu(10);
    const ta = d.querySelector('textarea[data-a="km-draf"]');
    ta.value = 'Draf penting'; ta.dispatchEvent(new w.Event('input', { bubbles: true }));
    klik(d, d.querySelector('[data-a="km-kirim"]')); await tunggu(60);
    const ta2 = d.querySelector('textarea[data-a="km-draf"]');
    cek('balasan yang DITOLAK: kotak tetap terbuka dan drafnya utuh', ta2 && ta2.value === 'Draf penting');
  }

  console.log('\n== Kontrak PHP ==');
  {
    let P = null;
    try { P = require(process.env.PHP_PARSER_PATH || 'php-parser'); } catch (e) { P = null; }
    if (!P) { lewat++; console.log('  LEWAT php-parser tidak terpasang'); }
    else {
      const eng = new P.Engine({ parser: { php8: true, suppressErrors: false } });
      for (const [n, s] of [['lib_campaign.php', LIB], ['api.php', API], ['campaign-posting.php', PEMICU]]) {
        let e = null; try { eng.parseCode(s, n); } catch (x) { e = x.message; }
        cek('sintaks ' + n, !e, e);
      }
    }
    const badan = nama => { const i = LIB.indexOf('function ' + nama + '('); const j = LIB.indexOf('\nfunction ', i + 10); return i < 0 ? '' : LIB.slice(i, j < 0 ? undefined : j); };
    cek('scope Instagram meminta instagram_business_content_publish', /define\('CG_IG_SCOPE', '[^']*instagram_business_content_publish/.test(LIB));
    const md = badan('cg_media_dir');
    cek('foto disimpan di folder SENDIRI, bukan receipts (gc_receipts membuangnya)', /cg_media/.test(md) && !/receipt_files_dir/.test(md));
    const ung = badan('cg_media_unggah');
    cek('unggah hanya menerima JPEG', ung.indexOf('"\\xFF\\xD8\\xFF"') > -1);
    cek('unggah memeriksa rasio 4:5 - 1,91:1', /0\.8/.test(ung) && /1\.91/.test(ung));
    cek('key foto acak 128-bit', /bin2hex\(random_bytes\(16\)\)/.test(ung));
    cek('campaignMedia disajikan SEBELUM penjaga API_TOKEN', API.indexOf("'campaignMedia'") > -1 && API.indexOf("'campaignMedia'") < API.indexOf("defined('API_TOKEN')"));
    const po = badan('cg_ig_posting');
    cek('posting menolak jadwal yang sudah punya ig_media_id', /ig_media_id'\] !== ''/.test(po));
    cek('posting MENGKLAIM jadwal sebelum memanggil Instagram', po.indexOf('posting_mulai < :batas') > -1 && po.indexOf('posting_mulai < :batas') < po.indexOf('/media_publish'));
    cek('ig_media_id dicatat SEGERA sesudah publish, sebelum mengambil tautan', po.indexOf('SET ig_media_id=') > -1 && po.indexOf('SET ig_media_id=') < po.indexOf("'permalink'"));
    cek('gagal di tahap publish TIDAK melepas klaim', /\$tahap === 'publish' \? '' : ', posting_mulai=0'/.test(po));
    cek('sukses mematikan otomatis (tidak diposting dua kali)', /otomatis=0/.test(po));
    cek('posting memeriksa izin publish', /cg_ig_bisa_posting\(\$pdo\)/.test(po));
    const jt = badan('cg_ig_posting_jatuh_tempo');
    cek('jatuh tempo melewati jadwal bergalat', /posting_galat=''/.test(jt));
    cek('jatuh tempo menolak yang lewat > 24 jam', /86400/.test(jt) && /lebih dari 24 jam/.test(jt));
    cek('jatuh tempo dibatasi per panggilan', /count\(\$hasil\['diposting'\]\) \+ count\(\$hasil\['gagal'\]\) >= 3/.test(jt));
    const sj = badan('cg_jadwal_simpan');
    cek('simpan jadwal hanya menerima key foto yang sah', /cg_media_key_sah\(\$k\)/.test(sj));
    cek('simpan jadwal tidak memakai mb_strlen', sj.indexOf('mb_strlen(') < 0);
    cek('kolom jadwal lahir lewat ALTER (bukan migrasi)', /'ig_media_id'\s*=>/.test(LIB) && /ALTER TABLE cg_jadwal ADD COLUMN/.test(LIB));
    cek('pemicu luar TERTUTUP kalau kuncinya kosong/pendek', /strlen\(\$kunci\) < 24/.test(PEMICU) && /hash_equals/.test(PEMICU));
    cek('scope Instagram meminta instagram_business_manage_comments', /define\('CG_IG_SCOPE', '[^']*instagram_business_manage_comments/.test(LIB));
    const ko = badan('cg_ig_komentar');
    cek('komentar dibaca dari Instagram, TIDAK disalin ke tabel', !/INSERT|UPDATE cg_|DELETE FROM/.test(ko) && !/INSERT|DELETE FROM/.test(badan('cg_ig_komentar_ubah')));
    cek('komentar memeriksa izin manage_comments', /cg_ig_tok_komentar\(\$pdo\)/.test(ko) && /cg_ig_tok_komentar\(\$pdo\)/.test(badan('cg_ig_komentar_ubah')));
    cek('id komentar/postingan divalidasi angka sebelum menyusun alamat API', /cg_ig_id_sah\(\$id\)/.test(badan('cg_ig_komentar_ubah')) && /cg_ig_id_sah\(\$satu\)/.test(ko));
    cek('satu postingan yang gagal tidak mengosongkan seluruh daftar', /catch \(Exception \$e\) \{ \$x\['galat'\]/.test(ko));
    ['campaignIgKomentar', 'campaignIgKomentarBalas', 'campaignIgKomentarSembunyi', 'campaignIgKomentarHapus', 'campaignIgKomentarAktif',
     'campaignMediaUnggah', 'campaignIgPosting', 'campaignIgPostingJatuhTempo'].forEach(a => cek('aksi ' + a + ' terdaftar di cg_aksi', LIB.indexOf("case '" + a + "'") > -1));
  }

  console.log('\n====================================================');
  console.log('  OK: ' + ok + '   GAGAL: ' + gagal + (lewat ? '   LEWAT: ' + lewat : ''));
  console.log('====================================================');
  process.exit(gagal ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
