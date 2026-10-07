/* Uji penghapusan `dikenal` di modul Marketing (1 Oktober 2026).

   Batas penghapusan lama (`_sejak`) memakai cap dari JAM PERANGKAT. Perangkat
   yang jamnya TERLAMBAT melahirkan baris bercap di bawah `_sejak` tab lain yang
   sedang terbuka — dan baris itu sah dihapus tab itu pada simpan berikutnya,
   tanpa satu pun galat. Sekarang klien mengirim `dikenal` dan server hanya
   menghapus dikenal − kiriman.

   Server tiruannya menerapkan KEDUA aturan persis seperti lib_marketing_mysql:
   `dikenal` kalau dikirim, `_sejak` kalau tidak. Jadi uji ini juga membuktikan
   bahwa bug lamanya MEMANG terjadi pada bentuk data ini — mutasi "dikenal tidak
   dikirim" harus membuat event & Request Design buatan Tab B lenyap.

     node tools/uji-dikenal-marketing.js
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
const salin = o => JSON.parse(JSON.stringify(o));

const MKT = fs.readFileSync(path.join(ROOT, 'deploy/marketing/index.html'), 'utf8');
const LIB = fs.readFileSync(path.join(ROOT, 'marketing-mysql/lib_marketing_mysql.php'), 'utf8');
const API = fs.readFileSync(path.join(ROOT, 'marketing-mysql/api.php'), 'utf8');
const HTML = MKT
  .replace(/<script[^>]*\ssrc="[^"]*performa-bonus\.js"[^>]*><\/script>/i,
    () => '<script>' + fs.readFileSync(path.join(ROOT, 'deploy/assets/performa-bonus.js'), 'utf8') + '</script>')
  .replace(/<script[^>]*\ssrc="[^"]*venue-layouts\.js"[^>]*><\/script>/i,
    () => '<script>' + fs.readFileSync(path.join(ROOT, 'deploy/assets/venue-layouts.js'), 'utf8') + '</script>')
  .replace(/<script[^>]*\ssrc=[^>]*><\/script>/gi, '');

const SEKARANG = Date.now();
/* Server tiruan bersama. events = tabel (upsert_collection), designreqs =
   koleksi di settings (upsert_settings_collection) — keduanya dijaga. */
const SRV = {
  events: { e1: { id:'e1', nama:'Event Lama', tanggal:'2026-12-01', status:'Confirmed', pipeCol:'Confirmed', updatedAt: SEKARANG - 60000 } },
  designreqs: { d1: { id:'d1', judul:'Request Lama', status:'open', updatedAt: SEKARANG - 3600000 } },
  simpan: []
};
const versiServer = () => Math.max(0, ...['events', 'designreqs'].flatMap(k => Object.values(SRV[k]).map(r => r.updatedAt || 0)));
function saveAll(body) {
  SRV.simpan.push(salin(body));
  const st = body.data || {}, kenal = body.dikenal || null, sejak = +st._sejak || 0;
  ['events', 'designreqs'].forEach(k => {
    if (!Array.isArray(st[k])) return;
    const ids = [];
    st[k].forEach(r => {
      if (!r || !r.id) return; ids.push(r.id);
      const lama = SRV[k][r.id];
      if ('baseUpdatedAt' in r && lama && (lama.updatedAt || 0) > (r.baseUpdatedAt || 0)) return;   // bentrok
      if (lama && !('baseUpdatedAt' in r) && (r.updatedAt || 0) < (lama.updatedAt || 0)) return;   // urutan
      const s = salin(r); delete s.baseUpdatedAt; SRV[k][r.id] = s;
    });
    Object.keys(SRV[k]).forEach(id => {
      if (ids.indexOf(id) > -1) return;
      if (Array.isArray(kenal && kenal[k])) { if (kenal[k].indexOf(id) > -1) delete SRV[k][id]; }
      else if (sejak > 0 && ids.length && (SRV[k][id].updatedAt || 0) <= sejak) delete SRV[k][id];   // aturan LAMA
    });
  });
  return { ok:true, data:{ bentrok:[], versi:{} } };
}
function getAll() {
  return { ok:true, data:{ events: Object.values(SRV.events).map(salin), designreqs: Object.values(SRV.designreqs).map(salin),
                           clients:[], users:[], _versi: versiServer() } };
}
function buatTab(geserJam) {
  const vc = new VirtualConsole(); vc.on('jsdomError', () => {});
  return new JSDOM(HTML, { virtualConsole: vc, runScripts: 'dangerously',
    url: 'https://dev.laksamanamuda.id/marketing/',
    beforeParse(w) {
      if (geserJam) { const asli = w.Date.now.bind(w.Date); w.Date.now = () => asli() + geserJam; }
      w.localStorage.setItem('lm_session', JSON.stringify({ id:'u1', name:'Uji',
        modules:['marketing'], adminModules:['marketing'], token:'t', expiry: Date.now() + 86400000 }));
      w.matchMedia = () => ({ matches:false, addListener(){}, removeListener(){}, addEventListener(){}, removeEventListener(){} });
      w.print = () => {}; w.confirm = () => true; w.alert = () => {}; w.scrollTo = () => {};
      w.Chart = class { destroy(){} update(){} };
      w.HTMLCanvasElement.prototype.getContext = () => ({});
      w.fetch = async (url, init) => {
        const u = String(url);
        const b = init && init.body ? JSON.parse(init.body) : {};
        const bal = o => ({ ok:true, status:200, text: async () => JSON.stringify(o), json: async () => o });
        if (u.indexOf('account-api') > -1) return bal({ ok:true, members: [] });
        if (b.action === 'saveAll') return bal(saveAll(b));
        if (u.indexOf('marketing-api') > -1 && u.indexOf('getAll') > -1) return bal(getAll());
        return bal({ ok:true, data:{} });
      };
    } });
}
async function siap(w) {
  for (let i = 0; i < 200; i++) {
    try { if (w.eval('typeof S !== "undefined" && S && Array.isArray(S.events) && S.events.length && _sejakVersi > 0')) return; } catch (e) {}
    await tunggu(50);
  }
  throw new Error('modul Marketing tidak pernah siap');
}
async function simpanTab(w) {
  w.eval('save()');
  for (let i = 0; i < 100; i++) { await tunggu(50); try { if (!w.eval('saveInFlight')) break; } catch (e) {} }
  await tunggu(100);
}

(async () => {
  console.log('\n== Perangkat berjam TERLAMBAT tidak kehilangan barisnya ==');
  {
    const A = buatTab(0); await siap(A.window);              // Tab A dibuka, _sejak ~ sekarang-1 menit
    const B = buatTab(-10 * 60000); await siap(B.window);    // HP Tab B: jamnya terlambat 10 menit
    B.window.eval("S.events.push({ id:'e2', nama:'Event dari HP jam lambat', tanggal:'2026-12-05', status:'Confirmed', pipeCol:'Confirmed' });" +
                  "S.designreqs.push({ id:'d2', judul:'Request dari HP jam lambat', status:'open' });");
    await simpanTab(B.window);
    cek('baris Tab B sampai di server', !!SRV.events.e2 && !!SRV.designreqs.d2,
        JSON.stringify({ e: Object.keys(SRV.events), d: Object.keys(SRV.designreqs) }));
    cek('capnya memang DI BAWAH _sejak Tab A (bentuk pemicunya ada)',
        SRV.events.e2 && SRV.events.e2.updatedAt <= A.window.eval('_sejakVersi'),
        SRV.events.e2 && (SRV.events.e2.updatedAt + ' vs ' + A.window.eval('_sejakVersi')));

    /* Tab A (tidak pernah melihat e2/d2) menyunting event lama lalu menyimpan. */
    A.window.eval("S.events.find(e => e.id==='e1').nama = 'Event Lama (revisi A)';");
    await simpanTab(A.window);
    const kirim = SRV.simpan[SRV.simpan.length - 1];
    cek('Tab A mengirim dikenal', !!(kirim && kirim.dikenal && Array.isArray(kirim.dikenal.events)));
    cek('dikenal Tab A tidak memuat baris Tab B',
        kirim && kirim.dikenal && kirim.dikenal.events.indexOf('e2') < 0 && kirim.dikenal.designreqs.indexOf('d2') < 0);
    cek('event Tab B TIDAK terhapus', !!SRV.events.e2, JSON.stringify(Object.keys(SRV.events)));
    cek('Request Design Tab B TIDAK terhapus', !!SRV.designreqs.d2, JSON.stringify(Object.keys(SRV.designreqs)));
    cek('suntingan Tab A tetap masuk', SRV.events.e1.nama === 'Event Lama (revisi A)');

    /* Yang memang dihapus Tab A (dan pernah dilihatnya) tetap terhapus. */
    A.window.eval("S.designreqs = S.designreqs.filter(d => d.id !== 'd1');");
    await simpanTab(A.window);
    cek('baris yang dihapus Tab A (dan pernah dilihatnya) terhapus', !SRV.designreqs.d1, JSON.stringify(Object.keys(SRV.designreqs)));
    cek('baris Tab B tetap ada sesudahnya', !!SRV.designreqs.d2);

    /* Baris yang DIBUAT Tab A sendiri lalu dihapusnya harus bisa terhapus —
       ia baru dikenal saat dikirim, bukan saat halaman dimuat. */
    A.window.eval("S.designreqs.push({ id:'d3', judul:'Dibuat lalu dihapus Tab A', status:'open' });");
    await simpanTab(A.window);
    cek('baris buatan Tab A sampai di server', !!SRV.designreqs.d3);
    A.window.eval("S.designreqs = S.designreqs.filter(d => d.id !== 'd3');");
    await simpanTab(A.window);
    cek('dan bisa dihapus lagi oleh Tab A', !SRV.designreqs.d3, JSON.stringify(Object.keys(SRV.designreqs)));
    A.window.close(); B.window.close();
  }

  console.log('\n== Kontrak PHP ==');
  {
    const up = LIB.slice(LIB.indexOf('function upsert_collection('), LIB.indexOf('function mkt_hapus_dikenal'));
    const us = LIB.slice(LIB.indexOf('function upsert_settings_collection('), LIB.indexOf('function save_all('));
    const sa = LIB.slice(LIB.indexOf('function save_all('));
    cek('tabel: jalur dikenal tidak jatuh ke aturan _sejak',
        /if \(is_array\(\$kenal\)\) \{ mkt_hapus_dikenal\([^;]*;\s*return count\(\$ids\); \}/.test(up));
    cek('yang dihapus cuma dikenal − kiriman', /array_diff\(array_map\('strval', \$kenal\), \$ids\)/.test(LIB));
    cek('guard state-utuh (dikenal) tetap: kiriman kosong >3 ditahan (tabel)',
        /count\(\$ids\) === 0 && count\(\$hapus\) > 3/.test(LIB));
    cek('koleksi settings: hanya baris dikenal yang boleh dibuang',
        /isset\(\$kirimId\[\$id\]\) \|\| !isset\(\$kenalPeta\[\(string\)\$id\]\) \|\| \$tahan/.test(us));
    cek('koleksi settings: guard state-utuh (dikenal) >3 ditahan', /count\(\$kirimId\) === 0 && \$calon > 3/.test(us));
    /* Mode parsial: hapus berantai yang sah TIDAK ditahan; hanya yang akan
       mengosongkan tabel/daftar. */
    cek('tabel: hapus eksplisit hanya ditahan kalau MENGOSONGKAN tabel',
        /function mkt_hapus_eksplisit[\s\S]*?if \(count\(\$hapus\) > 3\) \{[\s\S]*?SELECT COUNT\(\*\)[\s\S]*?fetchColumn\(\) === 0\) return 0;/.test(LIB));
    cek('settings: hapus eksplisit hanya ditahan kalau MENGOSONGKAN daftar',
        /\$calon > 3 && count\(\$adaId\) - \$calon === 0/.test(us));
    cek('save_all meneruskan dikenal + hapus ke KEDUA jenis koleksi',
        /upsert_collection\([^;]*\$kenal, \$h\)/.test(sa) && /upsert_settings_collection\([^;]*\$kenal, \$h\)/.test(sa));
    cek('api.php meneruskan dikenal DAN hapus',
        /save_all\([\s\S]{0,140}\$body\['dikenal'\][\s\S]{0,140}\$body\['hapus'\]/.test(API));
    /* --- mode parsial (A) --- */
    cek('tabel: ada penghapusan eksplisit',
        /function mkt_hapus_eksplisit\(/.test(LIB) &&
        /if \(is_array\(\$hapus\)\) \{ mkt_hapus_eksplisit/.test(up));
    cek('settings: hapus eksplisit mendahului jalur dikenal & _sejak', /if \(is_array\(\$hapus\)\) \{[\s\S]*?array_values\(\$adaId\)/.test(us));
    cek('save_all menandai mode parsial', /\$modeParsial = is_array\(\$hapus\)/.test(sa));
    cek('api.php mengiklankan delta, digerbangi fungsi lib',
        /\$data\['_fitur'\] = array\('delta'\)/.test(API) && /function_exists\('mkt_hapus_eksplisit'\)/.test(API));
    cek('baca_state TIDAK mengiklankan sendiri', !/\$out\['_fitur'\]/.test(LIB));
  }

  console.log('\n---------------------------------------');
  console.log('LULUS ' + ok + '   GAGAL ' + gagal);
  process.exit(gagal ? 1 : 0);
})().catch(e => { console.log('  GAGAL uji tidak selesai -> ' + e.message); console.log('LULUS ' + ok + '   GAGAL ' + (gagal + 1)); process.exit(1); });
