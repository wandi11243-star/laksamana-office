/* Uji penjaga tulis-basi blob Analytics (1 Oktober 2026).

   Blob `an_state` memuat SELURUH laporan POS yang pernah diunggah berikut
   setelannya, dan dulu ditimpa buta. Dua orang yang mengunggah bulan berbeda
   — atau satu tab yang terbuka sejak pagi — membuat yang menyimpan belakangan
   MENGHAPUS unggahan yang lain, tanpa satu pun galat.

   Sekarang server menolak simpan dari salinan basi (baseTs), dan klien
   menarik yang terbaru lalu menggabungkan per bulan (anGabung). Yang diukur
   di sini ISI KIRIMAN KEDUA — itulah yang akhirnya tertulis di server.

     node tools/uji-simpan-analytics.js
*/
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const { JSDOM, VirtualConsole } = (() => {
  for (const p of [process.env.JSDOM_PATH, path.join(ROOT, 'node_modules', 'jsdom'), 'jsdom']) {
    if (!p) continue;
    try { return require(p); } catch (e) { /* coba berikutnya */ }
  }
  console.error('jsdom tidak ketemu. Pasang `npm i jsdom`, atau setel JSDOM_PATH ke foldernya.');
  process.exit(2);
})();

let ok = 0, gagal = 0;
const cek = (n, s, k) => { if (s) { ok++; console.log('  OK   ' + n); } else { gagal++; console.log('  GAGAL ' + n + (k ? '  -> ' + k : '')); } };
const tunggu = ms => new Promise(r => setTimeout(r, ms));

let HTML = fs.readFileSync(path.join(ROOT, 'deploy/analytics/index.html'), 'utf8');
/* Aset lokal disisipkan inline — jsdom tidak mengambil skrip eksternal. */
for (const a of ['xlsx-baca.js', 'performa-bonus.js', 'venue-layouts.js', 'performa-konten.js']) {
  const tag = '<script src="../assets/' + a + '"></script>';
  const f = path.join(ROOT, 'deploy/assets', a);
  if (HTML.indexOf(tag) > -1 && fs.existsSync(f))
    HTML = HTML.replace(tag, () => '<script>' + fs.readFileSync(f, 'utf8') + '</script>');
}
const LIB = fs.readFileSync(path.join(ROOT, 'kompas-mysql/lib_kompas_mysql.php'), 'utf8');
const API = fs.readFileSync(path.join(ROOT, 'kompas-mysql/api.php'), 'utf8');

/* Server tiruan yang HIDUP: yang ditulis analyticsSave dipulangkan analyticsGet
   berikutnya, dan baseTs yang basi DITOLAK — persis aturan an_simpan(). */
function bukaModul(awal) {
  const srv = { data: JSON.parse(JSON.stringify(awal.data)), ts: awal.ts, simpan: [] };
  const d = new JSDOM(HTML, {
    url: 'https://team.laksamanamuda.id/analytics/',
    runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: new VirtualConsole(),
    beforeParse(w) {
      w.alert = () => {}; w.confirm = () => true; w.print = () => {}; w.scrollTo = () => {};
      try {
        w.localStorage.setItem('lm_session', JSON.stringify({
          expiry: Date.now() + 3600000, userId: 'u-uji', name: 'Penguji',
          modules: ['analytics'], adminModules: ['analytics'] }));
      } catch (e) {}
      w.fetch = async (url, init) => {
        const u = String(url);
        let body = {}; try { body = init && init.body ? JSON.parse(init.body) : {}; } catch (e) {}
        const balas = o => ({ ok: true, status: 200, text: async () => JSON.stringify(o), json: async () => o });
        if (body.action === 'analyticsGet')
          return balas({ ok: true, data: { data: JSON.parse(JSON.stringify(srv.data)), akses: {}, peran: {}, ts: srv.ts } });
        if (body.action === 'analyticsSave') {
          srv.simpan.push(JSON.parse(JSON.stringify(body)));
          if (body.baseTs && body.baseTs !== srv.ts)
            return balas({ ok: false, error: 'conflict', conflict: true, oleh: 'Cindy', ts: srv.ts });
          srv.data = JSON.parse(JSON.stringify(body.data)); srv.ts += 100;
          return balas({ ok: true, data: { saved: true, ts: srv.ts } });
        }
        if (u.indexOf('hpp.php') > -1) return balas({ bahan: [], resep: [], setting: {} });
        if (u.indexOf('account-api') > -1) return balas({ ok: true, members: [] });
        return balas({ ok: true, data: {} });
      };
    }
  });
  return { w: d.window, srv, dom: d };
}
async function siap(w) {
  for (let i = 0; i < 240; i++) {
    try { if (w.eval('typeof AN !== "undefined" && AN && AN.data && typeof anGabung === "function"')) return; }
    catch (e) {}
    await tunggu(50);
  }
  throw new Error('modul Analytics tidak pernah siap');
}

(async () => {
  /* ================= 1. dua orang, dua bulan ================= */
  console.log('\n== Bentrok: unggahan orang lain tidak terhapus ==');
  {
    const { w, srv, dom } = bukaModul({ ts: 1000, data: {
      laporan: { '2026-07': { ringkas: { grand: 7 } } }, promo: {}, voidb: {},
      setting: { petaKode: { A1: 'Kopi A' } } } });
    await siap(w);
    cek('versi yang dimuat tercatat', w.eval('AN.ts') === 1000);

    /* Orang lain (Cindy) mengunggah Agustus & memasangkan kode B1 SESUDAH tab ini memuat. */
    srv.data.laporan['2026-08'] = { ringkas: { grand: 8 } };
    srv.data.setting.petaKode.B1 = 'Kopi B';
    srv.ts = 2000;

    /* Tab ini: mengunggah September dan menghapus pasangan A1. */
    w.eval("AN.data.laporan['2026-09'] = { ringkas: { grand: 9 } }; delete AN.data.setting.petaKode.A1;");
    const hasil = await w.eval('simpan()');
    cek('simpan akhirnya berhasil', hasil === true);
    cek('kiriman pertama membawa baseTs yang dimuat', srv.simpan[0] && srv.simpan[0].baseTs === 1000);
    cek('ditolak lalu dikirim ulang dengan versi terbaru', srv.simpan.length === 2 && srv.simpan[1].baseTs === 2000,
        JSON.stringify(srv.simpan.map(s => s.baseTs)));
    const bln = Object.keys(srv.data.laporan).sort();
    cek('KETIGA bulan tertulis di server — unggahan Cindy tidak hilang',
        JSON.stringify(bln) === JSON.stringify(['2026-07', '2026-08', '2026-09']), JSON.stringify(bln));
    cek('pasangan yang dibuat Cindy bertahan', srv.data.setting.petaKode.B1 === 'Kopi B');
    cek('pasangan yang kita hapus tetap terhapus', !('A1' in srv.data.setting.petaKode));
    cek('layar memegang versi yang baru', w.eval('AN.ts') === srv.ts);
    dom.window.close();
  }

  /* ================= 2. aturan gabung ================= */
  console.log('\n== anGabung ==');
  {
    const { w, dom } = bukaModul({ ts: 1, data: { laporan: {}, promo: {}, voidb: {}, setting: {} } });
    await siap(w);
    const g = (b, m, t) => JSON.stringify(w.eval('anGabung')(b, m, t));
    cek('kita menghapus, orang lain MENGUBAH bulan itu -> suntingannya bertahan',
        g({ laporan: { x: { v: 1 } } }, { laporan: {} }, { laporan: { x: { v: 2 } } }) === JSON.stringify({ laporan: { x: { v: 2 } } }));
    cek('kita menghapus, orang lain tidak menyentuh -> terhapus',
        g({ laporan: { x: { v: 1 } } }, { laporan: {} }, { laporan: { x: { v: 1 } } }) === JSON.stringify({ laporan: {} }));
    cek('orang lain menghapus, kita tidak menyentuh -> terhapus',
        g({ laporan: { x: { v: 1 } } }, { laporan: { x: { v: 1 } } }, { laporan: {} }) === JSON.stringify({ laporan: {} }));
    cek('sama-sama mengubah bulan yang sama -> milik kita (yang sedang disimpan)',
        g({ laporan: { x: { v: 1 } } }, { laporan: { x: { v: 3 } } }, { laporan: { x: { v: 2 } } }) === JSON.stringify({ laporan: { x: { v: 3 } } }));
    cek('isi satu bulan TIDAK dicampur dari dua unggahan',
        g({ laporan: { x: { a: 1, b: 1 } } }, { laporan: { x: { a: 2, b: 1 } } }, { laporan: { x: { a: 1, b: 2 } } })
          === JSON.stringify({ laporan: { x: { a: 2, b: 1 } } }));
    dom.window.close();
  }

  /* ================= 3. kontrak server ================= */
  console.log('\n== Kontrak PHP ==');
  {
    const fn = LIB.slice(LIB.indexOf('function an_simpan('), LIB.indexOf('function an_akses_simpan'));
    cek('an_simpan menerima baseTs', /function an_simpan\(\$data, \$oleh, \$baseTs = null\)/.test(fn));
    cek('versi dibaca berkunci (FOR UPDATE) di dalam transaksi', fn.indexOf('FOR UPDATE') > -1 && fn.indexOf('beginTransaction') > -1);
    cek('baseTs basi DITOLAK, bukan ditimpa', /\(int\)\$baseTs !== \$tsKini/.test(fn) && fn.indexOf("'conflict' => true") > -1);
    cek('versi selalu naik', /if \(\$ts <= \$tsKini\) \$ts = \$tsKini \+ 1;/.test(fn));
    cek('api.php meneruskan baseTs', /an_simpan\([\s\S]{0,200}\$body\['baseTs'\]/.test(API));
  }

  console.log('\n---------------------------------------');
  console.log('LULUS ' + ok + '   GAGAL ' + gagal);
  process.exit(gagal ? 1 : 0);
})().catch(e => { console.log('  GAGAL uji tidak selesai -> ' + e.message); console.log('LULUS ' + ok + '   GAGAL ' + (gagal + 1)); process.exit(1); });
