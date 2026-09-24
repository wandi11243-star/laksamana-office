/* uji-poll-versi.js — polling Reservasi menanyakan VERSI dulu, baru getAll
 *
 *   JSDOM_PATH=/jalur/ke/jsdom node tools/uji-poll-versi.js
 *
 * Keluhan user 24 September 2026: API Reservasi berat. Diukur: getAll produksi
 * memuat SELURUH riwayat (2.479 reservasi, 2,6 MB / 346 KB gzip), dan polling
 * menariknya tiap 15 detik selama denah terlihat walau tidak ada yang berubah.
 *
 * Sekarang polling bertanya `?action=ver` dulu dan hanya menarik getAll kalau
 * nomornya berbeda dari VER_TAMPIL. Yang diukur JUMLAH & JENIS PANGGILAN, bukan
 * milidetik. Server lama (tanpa aksi `ver`) wajib jatuh ke getAll, bukan mati.
 */
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..');
const { JSDOM, VirtualConsole } = (() => {
  for (const p of [process.env.JSDOM_PATH, path.join(ROOT, 'node_modules', 'jsdom'), 'C:/Users/LENOVO LEGION/node_modules/jsdom', 'jsdom']) {
    if (!p) continue; try { return require(p); } catch (e) {}
  }
  console.error('jsdom tidak ketemu'); process.exit(2);
})();

let ok = 0, gagal = 0;
const cek = (n, s, k) => { if (s) { ok++; console.log('  OK   ' + n); } else { gagal++; console.log('  GAGAL ' + n + (k ? '  — ' + k : '')); } };
const sama = (n, d, h) => cek(n, d === h, 'dapat ' + JSON.stringify(d) + ', harusnya ' + JSON.stringify(h));
const aman = async (n, fn) => { try { await fn(); } catch (e) { gagal++; console.log('  GAGAL ' + n + '  — melempar: ' + e.message); } };
const tunggu = ms => new Promise(r => setTimeout(r, ms));

const ASSET = fs.readFileSync(path.join(ROOT, 'deploy/assets/venue-layouts.js'), 'utf8');
const SUMBER = fs.readFileSync(path.join(ROOT, 'deploy/reservasi/index.html'), 'utf8');
const HTML = SUMBER.replace('<script src="../assets/venue-layouts.js"><' + '/script>', () => '<script>' + ASSET + '<' + '/script>');

function buka(opsi) {
  opsi = opsi || {};
  const jejak = [];
  const srv = { ver: 7, simpanan: { reservations: [], master: {}, audit: [] } };
  const d = new JSDOM(HTML, {
    url: 'https://dev.laksamanamuda.id/reservasi/', runScripts: 'dangerously', pretendToBeVisual: true,
    virtualConsole: new VirtualConsole(),
    beforeParse(w) {
      w.alert = () => {}; w.confirm = () => true; w.scrollTo = () => {};
      w.HTMLElement.prototype.scrollIntoView = function () {};
      w.localStorage.setItem('lm_session', JSON.stringify({ expiry: Date.now() + 3600000, userId: 'u-uji', name: 'Penguji', modules: ['reservasi'], adminModules: ['reservasi'] }));
      w.fetch = async (url, init) => {
        const u = String(url), body = init && init.body ? JSON.parse(init.body) : {};
        const aksi = body.action || (u.match(/action=([a-zA-Z]+)/) || [])[1] || '?';
        if (u.indexOf('account-api') < 0) jejak.push(aksi);
        const balas = o => ({ ok: true, status: 200, text: async () => JSON.stringify(o), json: async () => o });
        if (u.indexOf('account-api') > -1) return balas({ ok: true, members: [{ id: 'u-uji', name: 'Penguji', keterangan: 'Office', isModuleAdmin: true }] });
        if (aksi === 'ver') return opsi.serverLama ? balas({ ok: false, error: 'Aksi tidak dikenal: ver' }) : balas({ ok: true, data: { ver: srv.ver } });
        if (aksi === 'getAll') return balas({ ok: true, data: Object.assign(JSON.parse(JSON.stringify(srv.simpanan)), { _ver: srv.ver }) });
        if (aksi === 'saveAll') { srv.simpanan = body.data; srv.ver++; return balas({ ok: true, data: { saved: true, ver: srv.ver } }); }
        return balas({ ok: true, data: {} });
      };
    }
  });
  return { w: d.window, jejak, srv };
}
async function siap(w) {
  for (let i = 0; i < 220; i++) { try { if (w.eval('typeof STATE!=="undefined" && STATE && DATA_LOADED')) return; } catch (e) {} await tunggu(50); }
  throw new Error('modul Reservasi tidak pernah siap');
}
async function keDenah(w) {
  await siap(w);
  w.eval('SESSION={id:"u-uji",name:"Penguji",role:"admin"}; SELECTED_CREW="u-uji";');
  try { w.eval('navigate("dashboard")'); } catch (e) {}
  w.eval('HARIH_VIEW="map"; CURRENT_PAGE="dashboard";');
  /* Di aplikasi sungguhan login MENYIMPAN (audit + master yang dinormalisasi),
     jadi layar dan server sudah sejajar sebelum polling pertama. Tanpa ini
     hasLocalChanges() menyala dan polling mengalah — ujinya menguji penjaga
     yang salah. */
  await w.eval('flushSave()'); await tunggu(80);
}
const poll = async w => { await w.eval('pollRemote(true)'); await tunggu(60); };

(async () => {
  console.log('\n== Server baru: versi sama → TIDAK ada getAll ==');
  await aman('blok versi sama', async () => {
    const { w, jejak } = buka();
    await keDenah(w);
    sama('VER_TAMPIL dicatat', w.eval('VER_TAMPIL'), '8');
    cek('tidak ada perubahan lokal', !w.eval('hasLocalChanges()'));
    cek('denah terlihat (polling boleh jalan)', w.eval('denahTampak()'));
    jejak.length = 0; await poll(w);
    sama('yang ditanya cuma ver', JSON.stringify(jejak), '["ver"]');
  });

  console.log('\n== Server baru: versi berubah → ver lalu getAll ==');
  await aman('blok versi berubah', async () => {
    const { w, jejak, srv } = buka();
    await keDenah(w);
    srv.ver = 20; srv.simpanan.reservations = [{ id: 'rX', name: 'Kru lain', date: '2026-09-25', time: '19:00', pax: 2, status: 'Confirmed', updatedAt: Date.now(), createdAt: Date.now() }];
    jejak.length = 0; await poll(w);
    sama('ver lalu getAll', JSON.stringify(jejak), '["ver","getAll"]');
    sama('baris kru lain masuk layar', w.eval('STATE.reservations.length'), 1);
    sama('VER_TAMPIL ikut maju', w.eval('VER_TAMPIL'), '20');
    jejak.length = 0; await poll(w);
    sama('tik berikutnya kembali cuma ver', JSON.stringify(jejak), '["ver"]');
  });

  console.log('\n== Sesudah simpan: versi hasil saveAll dipakai ==');
  await aman('blok sesudah simpan', async () => {
    const { w, jejak, srv } = buka();
    await keDenah(w);
    w.eval('STATE.master.catatanUji="x"');
    await w.eval('flushSave()'); await tunggu(80);
    sama('VER_TAMPIL = ver dari saveAll', w.eval('VER_TAMPIL'), String(srv.ver));
    jejak.length = 0; await poll(w);
    sama('simpanan sendiri tidak memicu getAll', JSON.stringify(jejak), '["ver"]');
  });

  console.log('\n== Server lama (tanpa aksi ver) → jatuh ke getAll, tidak mati ==');
  await aman('blok server lama', async () => {
    const { w, jejak } = buka({ serverLama: true });
    await keDenah(w);
    jejak.length = 0; await poll(w);
    sama('ver ditolak lalu getAll', JSON.stringify(jejak), '["ver","getAll"]');
    cek('VER_TAK_ADA menyala', w.eval('VER_TAK_ADA') === true);
    jejak.length = 0; await poll(w);
    sama('berikutnya langsung getAll, tanpa ver', JSON.stringify(jejak), '["getAll"]');
  });

  console.log('\n== Aset & head ==');
  cek('favicon WebP', /rel="icon" type="image\/webp" href="\.\.\/assets\/LaksamanaMudaLogo\.webp"/.test(SUMBER));
  cek('tidak memuat Google Fonts', SUMBER.indexOf('fonts.googleapis.com/css2') < 0);
  cek('font lokal dimuat', SUMBER.indexOf('../assets/fonts/fonts.css') > -1);
  cek('tidak ada tautan manifest', !/<link rel="manifest"/.test(SUMBER));
  cek('tidak mendaftarkan sw.js', SUMBER.indexOf('register("sw.js")') < 0);
  for (const f of ['LaksamanaMudaLogo.webp', 'fonts/inter-latin.woff2', 'fonts/plus-jakarta-sans-latin.woff2', 'fonts/fonts.css'])
    cek('berkas ada: assets/' + f, fs.existsSync(path.join(ROOT, 'deploy/assets', f)));
  const api = fs.readFileSync(path.join(ROOT, 'reservasi-mysql/api.php'), 'utf8');
  cek("backend punya aksi 'ver' yang memanggil read_ver()", /\$action === 'ver'[\s\S]{0,400}read_ver\(\)/.test(api));

  console.log(`\nLULUS ${ok}   GAGAL ${gagal}`);
  process.exit(gagal ? 1 : 0);
})();
