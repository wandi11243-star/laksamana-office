/* uji-pager-reservasi.js — pager Daftar Reservasi, Dana Masuk, dan Audit Log
 *
 *   JSDOM_PATH=/jalur/ke/jsdom node tools/uji-pager-reservasi.js
 *
 * Permintaan user 25 September 2026: ketiga tabel itu "per 10 per 10". Pager-nya
 * SEBENARNYA sudah ada, tapi cuma digambar kalau isinya lebih dari satu halaman
 * (Audit Log bahkan 50 per halaman) — jadi di layar ketiganya terbaca tidak
 * punya halaman sama sekali. Sekarang 10 per halaman, pager selalu terlihat
 * berikut pemilih ukuran 10/25/50.
 *
 * Yang dijaga JUMLAH BARIS YANG DIGAMBAR, bukan adanya teks pager.
 */
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..');
const muat = ps => { for (const p of ps) { if (!p) continue; try { return require(p); } catch (e) {} } return null; };
const JSD = muat([process.env.JSDOM_PATH, path.join(ROOT, 'node_modules', 'jsdom'), 'C:/Users/LENOVO LEGION/node_modules/jsdom', 'jsdom']);
if (!JSD) { console.error('jsdom tidak ketemu'); process.exit(2); }
const { JSDOM, VirtualConsole } = JSD;

let ok = 0, gagal = 0;
const cek = (n, s, k) => { if (s) { ok++; console.log('  OK   ' + n); } else { gagal++; console.log('  GAGAL ' + n + (k ? '  — ' + k : '')); } };
const sama = (n, d, h) => cek(n, JSON.stringify(d) === JSON.stringify(h), 'dapat ' + JSON.stringify(d) + ', harusnya ' + JSON.stringify(h));
const aman = async (n, fn) => { try { await fn(); } catch (e) { gagal++; console.log('  GAGAL ' + n + '  — melempar: ' + e.message); } };
const tunggu = ms => new Promise(r => setTimeout(r, ms));

const ASSET = fs.readFileSync(path.join(ROOT, 'deploy/assets/venue-layouts.js'), 'utf8');
const SUMBER = fs.readFileSync(path.join(ROOT, 'deploy/reservasi/index.html'), 'utf8');
const HTML = SUMBER.replace('<script src="../assets/venue-layouts.js"><' + '/script>', () => '<script>' + ASSET + '<' + '/script>');
const HARI = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);

/* 23 reservasi HARI INI ber-DP, 23 baris audit — angka yang tidak habis dibagi
   10 maupun 25, supaya halaman terakhir punya sisa yang bisa dihitung. */
function fixture() {
  const reservations = [], audit = [];
  for (let i = 1; i <= 23; i++) {
    const id = 'r' + String(i).padStart(2, '0');
    reservations.push({ id, name: 'Tamu ' + i, phone: '0812' + (1000 + i), date: HARI, time: String(10 + (i % 12)).padStart(2, '0') + ':00',
      pax: 2, table: '', status: 'Confirmed', dpStatus: 'Sudah', dpAmount: 100000, dpMethod: 'QRIS',
      dps: [{ id: 'p' + i, amount: 100000, method: 'QRIS', proofData: 'data:image/png;base64,AA', at: Date.now() }],
      updatedAt: 1, createdAt: i });
    audit.push({ id: 'a' + i, ts: Date.now() - i * 60000, user: 'Kru ' + i, role: 'admin', action: 'Uji', detail: 'baris audit ' + i });
  }
  return { reservations, master: {}, audit };
}
function buka() {
  const srv = { ver: 5, simpanan: fixture() };
  const d = new JSDOM(HTML, {
    url: 'https://dev.laksamanamuda.id/reservasi/', runScripts: 'dangerously', pretendToBeVisual: true,
    virtualConsole: new VirtualConsole(),
    beforeParse(w) {
      w.alert = () => {}; w.confirm = () => true; w.scrollTo = () => {};
      w.HTMLElement.prototype.scrollIntoView = function () {};
      w.localStorage.setItem('lm_session', JSON.stringify({ expiry: Date.now() + 3600000, userId: 'u-uji', name: 'Penguji', modules: ['reservasi'], adminModules: ['reservasi'] }));
      w.fetch = async (url, init) => {
        const u = String(url), body = init && init.body ? JSON.parse(init.body) : {};
        const aksi = body.action || (new URL(u, 'https://x/').searchParams.get('action')) || '?';
        const balas = o => ({ ok: true, status: 200, text: async () => JSON.stringify(o), json: async () => o });
        if (u.indexOf('account-api') > -1) return balas({ ok: true, members: [{ id: 'u-uji', name: 'Penguji', keterangan: 'Office', isModuleAdmin: true }] });
        if (aksi === 'getAll') return balas({ ok: true, data: Object.assign(JSON.parse(JSON.stringify(srv.simpanan)), { _ver: srv.ver }) });
        if (aksi === 'saveAll') { srv.simpanan = body.data; srv.ver++; return balas({ ok: true, data: { saved: true, ver: srv.ver } }); }
        if (aksi === 'ver') return balas({ ok: true, data: { ver: srv.ver } });
        return balas({ ok: false, error: 'Aksi tidak dikenal: ' + aksi });   // server lama: jalur cadangan lokal
      };
    }
  });
  return d.window;
}
async function siap(w) {
  for (let i = 0; i < 220; i++) { try { if (w.eval('typeof STATE!=="undefined" && STATE && DATA_LOADED')) return; } catch (e) {} await tunggu(50); }
  throw new Error('modul Reservasi tidak pernah siap');
}
const pager = el => el ? el.querySelector('.rv-pager') : null;
const pilih = el => el ? el.querySelector('.rv-pager select') : null;

(async () => {
  const w = buka();
  await siap(w);
  w.eval('SESSION={id:"u-uji",name:"Penguji",role:"admin"}; SELECTED_CREW="u-uji";');

  for (const [judul, kunci, buka_, baris] of [
    ['Daftar Reservasi', 'recap', () => { w.eval('navigate("dashboard")'); w.eval('dashTab("list")'); }, () => w.document.querySelectorAll('#page-dashboard tbody tr').length],
    ['Dana Masuk', 'finance', () => { w.eval('navigate("finance")'); w.eval('FIN_TAB="perlu"; renderFinance()'); }, () => w.document.querySelectorAll('#page-finance tbody tr').length],
    ['Audit Log', 'audit', () => { w.eval('navigate("audit")'); }, () => w.document.querySelectorAll('#page-audit tbody tr').length],
  ]) {
    console.log('\n== ' + judul + ' ==');
    await aman(judul, async () => {
      buka_(); await tunggu(60);
      const halEl = w.document.getElementById('page-' + (kunci === 'recap' ? 'dashboard' : kunci));
      sama('10 baris di halaman 1', baris(), 10);
      cek('pager terlihat', !!pager(halEl));
      cek('ada pemilih ukuran', !!pilih(halEl));
      cek('info 1–10 dari N', /1–10 dari \d+/.test(pager(halEl).textContent), pager(halEl).textContent.slice(0, 80));
      const total = Number((pager(halEl).textContent.match(/dari (\d+)/) || [])[1]);
      w.eval(`tblSetPage("${kunci}",2)`); await tunggu(40);
      sama('halaman 2 juga 10 baris', baris(), Math.min(10, total - 10));
      w.eval(`tblSetPer("${kunci}",25)`); await tunggu(40);
      sama('ukuran 25: semua muat', baris(), Math.min(25, total));
      sama('ganti ukuran kembali ke halaman 1', w.eval(`TBL_HAL["${kunci}"]`), 1);
      cek('pager TETAP terlihat walau cuma satu halaman', !!pilih(halEl));
      w.eval(`tblSetPer("${kunci}",10)`); await tunggu(40);
    });
  }

  console.log('\n== Tabel lain tidak ikut berubah ==');
  cek('pager tabel tanpa TBL_UKURAN tetap disembunyikan kalau satu halaman',
    w.eval('tblPagerHtml({hal:1,maxHal:1,mulai:0,akhir:3,total:3},"wlQueue")') === '');

  console.log(`\nLULUS ${ok}   GAGAL ${gagal}`);
  process.exit(gagal ? 1 : 0);
})();
