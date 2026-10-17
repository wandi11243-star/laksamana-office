/* Uji menu Google Review di panel Konten Analytics (17 Okt 2026).
 *   JSDOM_PATH=/jalur/ke/jsdom node tools/uji-google-review.js
 *
 * Server tiruan HIDUP: balasan & penanda "ditangani" yang ditulis dipulangkan
 * campaignGoogle berikutnya. Yang diukur ISI KIRIMAN ke server (bukan cuma
 * layar) — balasan yang cuma muncul di layar tapi tidak pernah terkirim
 * adalah kegagalan yang paling mahal di halaman ini.
 * Sisi PHP dijaga sebagai KONTRAK atas sumbernya (tidak ada php di mesin ini).
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const { JSDOM } = require(process.env.JSDOM_PATH || 'jsdom');

let ok = 0, gagal = 0;
function cek(nama, syarat, info) {
  if (syarat) { ok++; console.log('  OK   ' + nama); }
  else { gagal++; console.log('  GAGAL ' + nama + (info ? '  [' + info + ']' : '')); }
}
const tunggu = ms => new Promise(r => setTimeout(r, ms));
const HTML = fs.readFileSync(path.join(ROOT, 'deploy/konten/analytics/index.html'), 'utf8');
const LIB = fs.readFileSync(path.join(ROOT, 'konten-mysql/lib_greview.php'), 'utf8');
const LIBC = fs.readFileSync(path.join(ROOT, 'konten-mysql/lib_campaign.php'), 'utf8');
const JAM = 3600e3, HARI = 864e5;

function buatServer(opsi) {
  opsi = opsi || {};
  const now = Date.now();
  const G = {
    tempat: [
      { id: 'accounts/1/locations/9', sumber: 'gbp', place_id: 'ChIJgbp000000', nama: 'Laksamana Muda', alamat: 'Pekanbaru', rating: 4.6, total: 812, url: 'https://maps.google.com/?cid=1', aktif: 1, sync_at: now - JAM, galat: '' },
      { id: 'ChIJplaces0001', sumber: 'places', place_id: 'ChIJplaces0001', nama: 'Cabang Dua', alamat: 'Panam', rating: 4.1, total: 90, url: 'https://maps.google.com/?cid=2', aktif: 1, sync_at: now - JAM, galat: '' }
    ],
    harian: [{ tempat_id: 'accounts/1/locations/9', tgl: '2026-09-01', rating: 4.5, total: 780 }, { tempat_id: 'accounts/1/locations/9', tgl: '2026-10-16', rating: 4.6, total: 812 }],
    review: [
      { id: 'r5', sumber: 'gbp', tempat_id: 'accounts/1/locations/9', penulis: 'Puas Sekali', rating: 5, teks: 'Kopinya enak', waktu_ms: now - 2 * HARI, url: '', balasan: null, ditangani: 0 },
      { id: 'r3lama', sumber: 'gbp', tempat_id: 'accounts/1/locations/9', penulis: 'Biasa Saja', rating: 3, teks: 'Lumayan', waktu_ms: now - 60 * HARI, url: '', balasan: null, ditangani: 0 },
      { id: 'r1', sumber: 'gbp', tempat_id: 'accounts/1/locations/9', penulis: 'Kecewa Berat', rating: 1, teks: 'Pelayan kasar, makanan dingin, menunggu satu jam. '.repeat(6), waktu_ms: now - 1 * HARI, url: '', balasan: null, ditangani: 0 },
      { id: 'r2p', sumber: 'places', tempat_id: 'ChIJplaces0001', penulis: 'Tamu Places', rating: 2, teks: 'Toilet kotor', waktu_ms: now - 5 * HARI, url: 'https://maps.google.com/review/2', balasan: null, ditangani: 0 },
      { id: 'r4', sumber: 'gbp', tempat_id: 'accounts/1/locations/9', penulis: 'Ok Aja', rating: 4, teks: 'Agak lama', waktu_ms: now - 3 * HARI, url: '', balasan: null, ditangani: 0 }
    ],
    totalTersimpan: 5, akun: { nama: 'pemilik@contoh.com', terhubung: true, sync_at: now - JAM, sync_galat: '' }, ai: null, syncAt: now - JAM, galat: ''
  };
  const akunGoogle = opsi.tanpaSumber ? [] : [{ platform: 'google', nama: 'pemilik@contoh.com', terhubung: true, sync_at: now - JAM }];
  const S = { insight: [], jadwal: [], riset: [], bank: [], postInfo: {}, akun: akunGoogle,
    setting: { aiSiap: true, kategori: ['A'], ai: [], profil: 'P', googleOauthSiap: true, googleRedirectUri: 'https://dev.laksamanamuda.id/konten-api-mysql/campaign-google.php',
      placesKeyAda: !opsi.tanpaSumber, placesIds: opsi.tanpaSumber ? '' : 'ChIJplaces0001' },
    boleh: { admin: opsi.admin !== false } };
  const log = [];
  function fetchTiruan(url, init) {
    const b = JSON.parse(init.body); log.push(b);
    let data = { ok: true };
    if (b.action === 'campaignGet') data = JSON.parse(JSON.stringify(S));
    else if (b.action === 'campaignGoogle') data = JSON.parse(JSON.stringify(G));
    else if (b.action === 'campaignGoogleBalas') {
      const r = G.review.find(x => x.id === b.data.id);
      if (r.sumber !== 'gbp') return Promise.resolve({ text: () => Promise.resolve(JSON.stringify({ ok: false, error: 'tidak bisa dibalas' })) });
      r.balasan = b.data.teks; r.balasan_at = Date.now(); data = { ok: true, at: r.balasan_at };
    } else if (b.action === 'campaignGoogleTangani') {
      const r = G.review.find(x => x.id === b.data.id); r.ditangani = b.data.ditangani ? 1 : 0; r.tangani_catatan = b.data.catatan;
    } else if (b.action === 'campaignGoogleAI') {
      G.ai = { ringkasan: 'Ringkasan review uji', sentimen: { positif: 2, netral: 1, negatif: 2 }, kekuatan: [{ tema: 'Kopi enak', penjelasan: 'x', bukti: ['r5'] }],
        perbaikan: [{ masalah: 'Pelayanan lambat & kasar', area: 'Pelayanan', jumlah: 2, prioritas: 'tinggi', saran: 'Briefing kru', bukti: ['r1', 'r4'] }],
        tangani: [{ id: 'r3lama', urgensi: 'segera', alasan: 'Keluhan diam-diam', tindakan: 'Hubungi', usulanBalasan: 'Terima kasih Kak, kami perbaiki.' }],
        meta: { at: Date.now(), oleh: 'Uji', model: 'm', hari: b.data.hari, jumlah: 5, tempat: '' } };
      data = G.ai;
    } else if (b.action === 'campaignGoogleSync') data = { jumlah: 5, galat: [] };
    else if (b.action === 'campaignGoogleCari') data = { hasil: [{ id: 'ChIJbaru000001', nama: 'Laksamana Baru', alamat: 'Jl X', rating: 4.8, total: 20 }] };
    return Promise.resolve({ text: () => Promise.resolve(JSON.stringify({ ok: true, data })) });
  }
  return { G, S, log, fetchTiruan };
}

async function buka(opsi) {
  const srv = buatServer(opsi);
  const dom = new JSDOM(HTML, {
    url: 'https://dev.laksamanamuda.id/konten/analytics/' + ((opsi && opsi.hash) || '#greview'),
    runScripts: 'dangerously', pretendToBeVisual: true,
    beforeParse(w) {
      w.localStorage.setItem('lm_session', JSON.stringify({ name: 'Uji Coba', token: 'tok-uji', expiry: Date.now() + JAM, modules: ['campaign'] }));
      w.fetch = srv.fetchTiruan; w.confirm = () => true; w.prompt = () => 'tamu dihubungi';
      w.HTMLElement.prototype.scrollIntoView = function(){};
    }
  });
  await tunggu(120);
  return { w: dom.window, d: dom.window.document, srv };
}
function klik(d, sel) { const el = d.querySelector(sel); if (!el) throw new Error('tidak ada ' + sel); el.dispatchEvent(new d.defaultView.MouseEvent('click', { bubbles: true })); }
const urutanNama = d => [...d.querySelectorAll('#gr-daftar .gr-item .nm')].map(x => x.textContent);

(async () => {
  console.log('\n== Menu & keadaan tanpa sumber ==');
  {
    const a = await buka({ tanpaSumber: true });
    const menu = a.d.querySelector('#nav [data-v="greview"]');
    cek('menu Google Review ada di sidebar', !!menu && /Google Review/.test(menu.textContent));
    cek('TITLES memuat greview (halaman tidak memantul)', a.w.__cg.TITLES.greview === 'Google Review');
    cek('tanpa sumber: kartu Hubungkan + tombol Hubungkan (admin)', /Hubungkan Google Review/.test(a.d.getElementById('app').textContent) && !!a.d.querySelector('[data-a="gr-hubung"]'));
    cek('tanpa sumber: campaignGoogle tidak dipanggil', !a.srv.log.some(b => b.action === 'campaignGoogle'));
  }

  console.log('\n== Daftar & prioritas ==');
  const a = await buka();
  {
    const app = a.d.getElementById('app').textContent;
    cek('kartu sumber menyebut akun Business Profile', /pemilik@contoh\.com/.test(app));
    cek('kartu tempat memuat rating & jumlah ulasan', /Laksamana Muda/.test(app) && /812 ulasan|812/.test(app));
    const nama = urutanNama(a.d);
    cek('bawaan "Perlu ditangani": bintang 5 TIDAK ikut', !nama.includes('Puas Sekali'), nama.join(','));
    cek('paling mendesak di atas (bintang 1, keluhan panjang, kemarin)', nama[0] === 'Kecewa Berat', nama.join(','));
    cek('review Places ikut di daftar prioritas', nama.includes('Tamu Places'));
    const segera = a.d.querySelector('#gr-r1 .prio.segera');
    cek('review bintang 1 baru ditandai "Segera"', !!segera);
    const badge = a.d.querySelector('#nav [data-v="greview"] .badge');
    cek('lencana sidebar menghitung yang segera', badge && +badge.textContent >= 1, badge && badge.textContent);
    cek('review Places: tidak ada tombol Balas, ada "Balas di Google"', !a.d.querySelector('#gr-r2p [data-a="gr-buka"]') && /Balas di Google/.test(a.d.getElementById('gr-r2p').textContent));
    cek('ringkasan "Perlu segera" & sebaran bintang', /Perlu segera/.test(app) && /Sebaran bintang/.test(app));
  }

  console.log('\n== Cari tanpa membuat ulang kotak ==');
  {
    const kotak = a.d.getElementById('gr-cari');
    kotak.value = 'toilet'; kotak.dispatchEvent(new a.w.Event('input', { bubbles: true }));
    await tunggu(260);
    cek('cari menyaring daftar', urutanNama(a.d).join(',') === 'Tamu Places', urutanNama(a.d).join(','));
    cek('kotak cari elemen yang SAMA (fokus tidak hilang)', a.d.getElementById('gr-cari') === kotak);
    kotak.value = ''; kotak.dispatchEvent(new a.w.Event('input', { bubbles: true })); await tunggu(260);
  }

  console.log('\n== Balas langsung ke Google ==');
  {
    klik(a.d, '#gr-r1 [data-a="gr-buka"]');
    const tx = a.d.getElementById('gr-teks');
    cek('kotak balas terbuka', !!tx);
    tx.value = 'Mohon maaf Kak, kami tindak lanjuti.'; tx.dispatchEvent(new a.w.Event('input', { bubbles: true }));
    /* Render ulang total tidak boleh membuang draf. */
    a.w.__cg.render();
    cek('draf balasan bertahan sesudah render ulang', a.d.getElementById('gr-teks') && a.d.getElementById('gr-teks').value === 'Mohon maaf Kak, kami tindak lanjuti.');
    const cb = a.d.querySelector('#gr-r1 [data-a="gr-tandai"]');
    cek('bintang 1: "sekalian tandai ditangani" tercentang bawaan', cb && cb.checked);
    klik(a.d, '#gr-r1 [data-a="gr-kirim"]');
    await tunggu(80);
    const kirim = a.srv.log.filter(b => b.action === 'campaignGoogleBalas');
    cek('balasan TERKIRIM ke server dengan teksnya', kirim.length === 1 && kirim[0].data.teks === 'Mohon maaf Kak, kami tindak lanjuti.' && kirim[0].data.id === 'r1');
    cek('sekalian ditandai ditangani di server', a.srv.G.review.find(x => x.id === 'r1').ditangani === 1);
    cek('sesudahnya hilang dari "Perlu ditangani"', !urutanNama(a.d).includes('Kecewa Berat'), urutanNama(a.d).join(','));
    klik(a.d, '[data-a="gr-saring"][data-v="dibalas"]');
    cek('muncul di "Sudah dibalas" berikut balasannya', /Mohon maaf Kak/.test(a.d.getElementById('gr-daftar').textContent));
    klik(a.d, '[data-a="gr-saring"][data-v="tangani"]');
  }

  console.log('\n== Tandai ditangani tanpa membalas ==');
  {
    klik(a.d, '#gr-r2p [data-a="gr-tangani"]');
    await tunggu(60);
    const t = a.srv.log.filter(b => b.action === 'campaignGoogleTangani' && b.data.id === 'r2p');
    cek('penanda ditangani terkirim dengan catatan', t.length === 1 && t[0].data.ditangani === true && t[0].data.catatan === 'tamu dihubungi');
    cek('review Places hilang dari "Perlu ditangani"', !urutanNama(a.d).includes('Tamu Places'));
  }

  console.log('\n== Analisa AI ==');
  {
    klik(a.d, '[data-a="gr-ai-hari"][data-v="30"]');
    klik(a.d, '[data-a="gr-ai"]');
    await tunggu(80);
    const q = a.srv.log.filter(b => b.action === 'campaignGoogleAI');
    cek('campaignGoogleAI dipanggil dengan rentang terpilih', q.length === 1 && q[0].data.hari === 30);
    const app = a.d.getElementById('app').textContent;
    cek('hasil menampilkan yang harus ditingkatkan', /Yang harus ditingkatkan/.test(app) && /Pelayanan lambat & kasar/.test(app));
    cek('hasil menampilkan kekuatan', /Kopi enak/.test(app));
    const nama = urutanNama(a.d);
    cek('review yang ditandai AI "segera" naik ke daftar prioritas', nama[0] === 'Biasa Saja', nama.join(','));
    cek('alasan & tindakan AI tampil di reviewnya', /Keluhan diam-diam/.test(a.d.getElementById('gr-r3lama').textContent));
    klik(a.d, '#gr-r3lama [data-a="gr-buka"]');
    klik(a.d, '#gr-r3lama [data-a="gr-pakai-usulan"]');
    cek('"Pakai draf dari analisa AI" mengisi kotak balas', a.d.getElementById('gr-teks').value === 'Terima kasih Kak, kami perbaiki.');
    cek('memakai draf TIDAK mengirim apa pun', a.srv.log.filter(b => b.action === 'campaignGoogleBalas').length === 1);
    klik(a.d, '[data-a="gr-fokus"]');
    const n2 = urutanNama(a.d);
    cek('"lihat review" menyaring ke bukti', n2.length === 2 && n2.includes('Ok Aja'), n2.join(','));
    klik(a.d, '[data-a="gr-fokus-lepas"]');
    cek('lepas fokus kembali ke saringan & hash tetap #greview', a.w.location.hash === '#greview' && !/review bukti/.test(a.d.getElementById('gr-daftar').textContent));
  }

  console.log('\n== Pengaturan ==');
  {
    const p = await buka({ hash: '#pengaturan' });
    const app = p.d.getElementById('app').textContent;
    cek('kartu Google Review di Pengaturan', /Google Business Profile \(bisa membalas\)/.test(app) && /Places API \(baca saja\)/.test(app));
    cek('alamat balik OAuth disebut', /campaign-google\.php/.test(app));
    p.d.getElementById('s-gcari').value = 'Laksamana';
    klik(p.d, '[data-a="gr-cari-tempat"]'); await tunggu(60);
    klik(p.d, '[data-a="gr-tempat-tambah"]');
    cek('hasil cari menambah Place ID ke kotak', /ChIJbaru000001/.test(p.d.getElementById('s-gplaces').value));
    klik(p.d, '[data-a="set-simpan"]'); await tunggu(60);
    const s = p.srv.log.filter(b => b.action === 'campaignSetting')[0];
    cek('simpan mengirim placesIds & kotak rahasia', s && /ChIJbaru000001/.test(s.data.placesIds) && 'googleClientId' in s.data && 'placesKey' in s.data);
  }

  console.log('\n== Kontrak PHP ==');
  {
    const tanpaKom = LIB.replace(/\/\*[\s\S]*?\*\//g, '');
    cek('tidak ada DELETE FROM di lib_greview', !/DELETE\s+FROM/i.test(tanpaKom));
    cek('gr_ai membuka sambungan baru sesudah AI (db(true))', /cg_ai_tanya\([\s\S]*?\$pdo = db\(true\);/.test(LIB.slice(LIB.indexOf('function gr_ai('))));
    cek('id review karangan AI dibuang (peta r1..rn)', LIB.includes("isset($x['review'], $peta[(string)$x['review']])"));
    cek('balas ditolak untuk review Places', /if \(\$r\['sumber'\] !== 'gbp'\) throw/.test(LIB.slice(LIB.indexOf('function gr_balas('))));
    const ringkas = LIB.slice(LIB.indexOf('function gr_setting_ringkas('), LIB.indexOf('function gr_setting_simpan('));
    cek('rahasia tidak dipulangkan (hanya "terisi")', !/=> gr_client_secret\(\$pdo\)\s*[,)]|=> gr_places_key\(\$pdo\)\s*[,)]/.test(ringkas));
    cek('baca tidak memilih kolom token', !/access_token|refresh_token/.test(LIB.slice(LIB.indexOf('function gr_baca('), LIB.indexOf('function gr_review_by_id(')).replace(/\/\*[\s\S]*?\*\//g, '')));
    cek('sinkron tidak menimpa balasan dari sistem untuk sumber places', /balasan=IF\(VALUES\(sumber\)=\\'gbp\\'/.test(LIB));
    ['campaignGoogle', 'campaignGoogleSync', 'campaignGoogleBalas', 'campaignGoogleTangani', 'campaignGoogleAI', 'campaignGoogleCari', 'campaignGooglePutus']
      .forEach(x => cek('cg_aksi melayani ' + x, LIBC.includes("case '" + x + "'")));
    cek('lib_greview dimuat lib_campaign', LIBC.includes("require_once __DIR__ . '/lib_greview.php';"));
    cek('setelan Google ikut disimpan & diringkas', LIBC.includes('gr_setting_simpan($pdo, $d);') && LIBC.includes('+ gr_setting_ringkas($pdo)'));
    cek('alamat balik OAuth ada', fs.existsSync(path.join(ROOT, 'konten-mysql/campaign-google.php')));
  }

  console.log('\n' + ok + ' OK, ' + gagal + ' GAGAL');
  process.exit(gagal ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
