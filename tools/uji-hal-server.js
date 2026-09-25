/* uji-hal-server.js — Daftar Reservasi, Dana Masuk, Audit Log dimuat PER HALAMAN dari server
 *
 *   JSDOM_PATH=/jalur/ke/jsdom node tools/uji-hal-server.js
 *   (bagian kontrak PHP butuh php-parser: npm i php-parser, atau PHP_PARSER_PATH)
 *
 * Permintaan user 25 September 2026: pindah halaman harus benar-benar menembak
 * API (?action=halRecap / halDana / halAudit), 10 baris per permintaan.
 *
 * Yang dijaga JUMLAH & ISI PERMINTAAN, dan bahwa baris yang digambar memang
 * baris dari SERVER — tiruannya sengaja memulangkan urutan TERBALIK dari urutan
 * lokal, jadi layar yang diam-diam masih memotong STATE langsung ketahuan.
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

function fixture() {
  const reservations = [], audit = [];
  for (let i = 1; i <= 23; i++) {
    const id = 'r' + String(i).padStart(2, '0');
    reservations.push({ id, name: 'Tamu ' + i, phone: '0812' + (1000 + i), date: HARI, time: String(10 + Math.floor(i / 2)).padStart(2, '0') + ':' + (i % 2 ? '00' : '30'),
      pax: 2, table: '', status: 'Confirmed', dpStatus: 'Sudah', dpAmount: 100000, dpMethod: 'QRIS',
      dps: [{ id: 'p' + i, amount: 100000, method: 'QRIS', proofData: 'data:image/png;base64,AA', tfTime: String(10 + i).padStart(2, '0') + ':00', at: Date.now() }],
      updatedAt: 1, createdAt: i });
    audit.push({ id: 'a' + i, ts: Date.now() - i * 60000, user: 'Kru ' + i, role: 'admin', action: 'Uji', detail: 'baris audit ' + i });
  }
  return { reservations, master: {}, audit };
}
/* Tiruan server: memotong halaman dari daftar yang diurut TERBALIK. */
function halTiruan(daftar, q) {
  const hal = Math.max(1, Number(q.get('hal')) || 1), per = Number(q.get('per')) || 10;
  const maxHal = Math.max(1, Math.ceil(daftar.length / per));
  const h = Math.min(hal, maxHal);
  return { rows: daftar.slice((h - 1) * per, h * per), total: daftar.length, hal: h, per, maxHal, batal: 0 };
}
function buka(opsi) {
  opsi = opsi || {};
  const srv = { ver: 5, simpanan: fixture(), panggil: [], mode: opsi.mode || 'ok' };
  const d = new JSDOM(HTML, {
    url: 'https://dev.laksamanamuda.id/reservasi/', runScripts: 'dangerously', pretendToBeVisual: true,
    virtualConsole: new VirtualConsole(),
    beforeParse(w) {
      w.alert = () => {}; w.confirm = () => true; w.scrollTo = () => {};
      w.HTMLElement.prototype.scrollIntoView = function () {};
      w.localStorage.setItem('lm_session', JSON.stringify({ expiry: Date.now() + 3600000, userId: 'u-uji', name: 'Penguji', modules: ['reservasi'], adminModules: ['reservasi'] }));
      w.fetch = async (url, init) => {
        const u = new URL(String(url), 'https://x/'), body = init && init.body ? JSON.parse(init.body) : {};
        const aksi = body.action || u.searchParams.get('action') || '?';
        const balas = o => ({ ok: true, status: 200, text: async () => JSON.stringify(o), json: async () => o });
        if (String(url).indexOf('account-api') > -1) return balas({ ok: true, members: [{ id: 'u-uji', name: 'Penguji', keterangan: 'Office', isModuleAdmin: true }] });
        if (aksi === 'getAll') return balas({ ok: true, data: Object.assign(JSON.parse(JSON.stringify(srv.simpanan)), { _ver: srv.ver }) });
        if (aksi === 'saveAll') { srv.simpanan = body.data; srv.ver++; return balas({ ok: true, data: { saved: true, ver: srv.ver } }); }
        if (aksi === 'ver') return balas({ ok: true, data: { ver: srv.ver } });
        if (/^hal(Recap|Dana|Audit)$/.test(aksi)) {
          srv.panggil.push({ aksi, hal: u.searchParams.get('hal'), per: u.searchParams.get('per'), q: u.searchParams.get('q'), hq: u.searchParams.get('hq') });
          if (srv.mode === 'lama') return balas({ ok: false, error: 'Aksi tidak dikenal: ' + aksi });
          if (srv.mode === 'gagal') return balas({ ok: false, error: 'database sibuk' });
          const res = srv.simpanan.reservations.slice().reverse();
          if (aksi === 'halRecap') return balas({ ok: true, data: halTiruan(res, u.searchParams) });
          if (aksi === 'halDana') return balas({ ok: true, data: halTiruan(res.map(r => ({ res: r.id, ke: 1 })), u.searchParams) });
          return balas({ ok: true, data: halTiruan(srv.simpanan.audit.slice().reverse(), u.searchParams) });
        }
        return balas({ ok: false, error: 'Aksi tidak dikenal: ' + aksi });
      };
    }
  });
  return { w: d.window, srv };
}
async function siap(w) {
  for (let i = 0; i < 220; i++) { try { if (w.eval('typeof STATE!=="undefined" && STATE && DATA_LOADED')) return; } catch (e) {} await tunggu(50); }
  throw new Error('modul Reservasi tidak pernah siap');
}
const TABEL = [
  ['Daftar Reservasi', 'recap', 'halRecap', 'dashboard', w => { w.eval('navigate("dashboard")'); w.eval('dashTab("list")'); }, 'Tamu 23'],
  ['Dana Masuk', 'finance', 'halDana', 'finance', w => { w.eval('navigate("finance")'); w.eval('FIN_TAB="perlu"; renderFinance()'); }, 'Tamu 23'],
  ['Audit Log', 'audit', 'halAudit', 'audit', w => { w.eval('navigate("audit")'); }, 'Kru 23'],
];
const baris = (w, hal) => [...w.document.querySelectorAll('#page-' + hal + ' tbody tr')];
const n = (srv, aksi) => srv.panggil.filter(p => p.aksi === aksi).length;

(async () => {
  console.log('== Tiap tabel: satu permintaan per halaman, barisnya dari server ==');
  const { w, srv } = buka();
  await siap(w);
  w.eval('SESSION={id:"u-uji",name:"Penguji",role:"admin"}; SELECTED_CREW="u-uji";');
  for (const [judul, kunci, aksi, hal, bukaTab, pertama] of TABEL) {
    console.log('\n-- ' + judul + ' --');
    await aman(judul, async () => {
      bukaTab(w); await tunggu(150);
      sama('halaman 1 = SATU permintaan ' + aksi, n(srv, aksi), 1);
      const p1 = srv.panggil.filter(p => p.aksi === aksi)[0];
      sama('meminta hal=1 per=10', [p1.hal, p1.per], ['1', '10']);
      const b = baris(w, hal);
      sama('10 baris digambar', b.length, 10);
      cek('baris pertama dari SERVER (urutan terbalik: ' + pertama + ')', b[0] && b[0].textContent.indexOf(pertama) > -1, b[0] && b[0].textContent.slice(0, 60));
      w.eval(`tblSetPage("${kunci}",2)`); await tunggu(150);
      sama('pindah ke halaman 2 = permintaan ke-2', n(srv, aksi), 2);
      sama('meminta hal=2', srv.panggil.filter(p => p.aksi === aksi)[1].hal, '2');
      w.eval(`tblSetPage("${kunci}",3)`); await tunggu(150);
      sama('halaman 3 berisi sisa 3 baris', baris(w, hal).length, 3);
      const sebelum = n(srv, aksi);
      w.eval(`(TBL_RENDER["${kunci}"])()`); await tunggu(150);
      sama('menggambar ulang halaman yang sama TIDAK menembak lagi', n(srv, aksi), sebelum);
      w.eval(`tblSetPer("${kunci}",25)`); await tunggu(150);
      const akhir = srv.panggil.filter(p => p.aksi === aksi).slice(-1)[0];
      sama('ganti ukuran: hal=1 per=25', [akhir.hal, akhir.per], ['1', '25']);
      sama('23 baris', baris(w, hal).length, 23);
      w.eval(`tblSetPer("${kunci}",10)`); await tunggu(150);
    });
  }

  console.log('\n-- Versi berubah = tarik ulang --');
  await aman('versi', async () => {
    const a = n(srv, 'halAudit');
    w.eval('VER_TAMPIL="99"; renderAudit()'); await tunggu(150);
    sama('VER_TAMPIL baru -> satu permintaan lagi', n(srv, 'halAudit'), a + 1);
    const b = n(srv, 'halAudit');
    w.eval('VER_TAMPIL=null; renderAudit()'); await tunggu(150);
    sama('VER_TAMPIL null (belum yakin isi server) -> tidak menembak, pakai lokal', n(srv, 'halAudit'), b);
    sama('...dan tetap 10 baris lokal', baris(w, 'audit').length, 10);
    w.eval('VER_TAMPIL="5"');
  });

  console.log('\n-- Mengetik di kotak cari ditunda --');
  await aman('cari', async () => {
    const a = n(srv, 'halAudit');
    for (const t of ['K', 'Kr', 'Kru', 'Kru 2']) { w.eval(`AUDIT_Q=${JSON.stringify(t)}; renderAudit()`); await tunggu(40); }
    await tunggu(500);
    sama('empat ketukan cepat = SATU permintaan', n(srv, 'halAudit'), a + 1);
    sama('yang dikirim kata kunci terakhir', srv.panggil.slice(-1)[0].q, 'kru 2');
    w.eval('AUDIT_Q=""; renderAudit()'); await tunggu(500);
  });

  console.log('\n-- Saringan khusus peramban tetap lokal --');
  await aman('lantai', async () => {
    w.eval('navigate("dashboard")'); w.eval('dashTab("list")'); await tunggu(150);
    const a = n(srv, 'halRecap');
    w.eval('DASH_FILTER.kursi="ada"; renderDashboard()'); await tunggu(400);
    sama('saringan sisa kursi -> tidak menembak halRecap', n(srv, 'halRecap'), a);
    w.eval('DASH_FILTER.kursi=""; renderDashboard()'); await tunggu(400);
  });

  console.log('\n== Server gagal: tidak berputar, ada Coba lagi ==');
  await aman('gagal', async () => {
    const g = buka({ mode: 'gagal' });
    await siap(g.w); g.w.eval('SESSION={id:"u-uji",name:"Penguji",role:"admin"}');
    g.w.eval('navigate("audit")'); await tunggu(600);
    sama('gagal -> SATU permintaan, tidak berulang', n(g.srv, 'halAudit'), 1);
    cek('ada tombol Coba lagi', g.w.document.getElementById('page-audit').innerHTML.indexOf("srvpgCobaLagi('audit')") > -1);
    sama('tabel tetap terisi salinan lokal', baris(g.w, 'audit').length, 10);
    g.w.eval('srvpgCobaLagi("audit")'); await tunggu(300);
    sama('Coba lagi -> satu permintaan lagi', n(g.srv, 'halAudit'), 2);
  });

  console.log('\n== Server lama (aksi tidak dikenal): cara lama, tidak menembak lagi ==');
  await aman('lama', async () => {
    const g = buka({ mode: 'lama' });
    await siap(g.w); g.w.eval('SESSION={id:"u-uji",name:"Penguji",role:"admin"}');
    g.w.eval('navigate("audit")'); await tunggu(300);
    g.w.eval('tblSetPage("audit",2)'); await tunggu(300);
    sama('cuma satu percobaan', n(g.srv, 'halAudit'), 1);
    cek('SRVPG_TAK_ADA.halAudit menyala', g.w.eval('!!SRVPG_TAK_ADA.halAudit'));
    sama('halaman 2 lokal tetap 10 baris', baris(g.w, 'audit').length, 10);
  });

  console.log('\n== Kontrak PHP ==');
  const LIB = fs.readFileSync(path.join(ROOT, 'reservasi-mysql/lib_reservasi_mysql.php'), 'utf8');
  const API = fs.readFileSync(path.join(ROOT, 'reservasi-mysql/api.php'), 'utf8');
  const PP = muat([process.env.PHP_PARSER_PATH, path.join(ROOT, 'node_modules', 'php-parser'), 'C:/Users/LENOVO LEGION/node_modules/php-parser', 'php-parser']);
  if (PP) {
    const eng = new PP.Engine({ parser: { php7: true }, ast: { withPositions: false } });
    for (const [nm, src] of [['lib', LIB], ['api', API]]) {
      let e = null; try { eng.parseCode(src, nm + '.php'); } catch (x) { e = x; }
      cek('php ' + nm + ' terurai tanpa galat', !e, e && e.message);
    }
  } else console.log('  LEWAT php-parser tidak terpasang');
  for (const a of ['halRecap', 'halDana', 'halAudit']) cek('api.php mengenal ' + a, API.indexOf("$action === '" + a + "'") > -1);
  for (const fn of ['rsv_hal_recap', 'rsv_hal_dana', 'rsv_hal_audit', 'rsv_potong', 'rsv_urut_stabil']) cek('fungsi ' + fn + ' ada', LIB.indexOf('function ' + fn + '(') > -1);
  cek('per dijepit 1..100', /if \(\$per > 100\) \$per = 100;/.test(LIB));
  cek('Cancelled dibuang kecuali status Cancelled (kembar recapList)', LIB.indexOf("if ($g('status') !== 'Cancelled')") > -1);
  cek('Dana Masuk diurut TURUN (kembar financeList)', LIB.indexOf("rsv_tx_date($x) . rsv_s($x['p'], 'tfTime'); }, true);") > -1);
  cek('Daftar Reservasi diurut NAIK (kembar applyFilter)', LIB.indexOf("rsv_s($r, 'date') . rsv_s($r, 'time'); }, false);") > -1);
  // ROLE_LABEL kembar lintas bahasa
  const js = (SUMBER.match(/const ROLE_LABEL\s*=\s*\{([^}]*)\}/) || [])[1] || '';
  const ph = (LIB.match(/\$label = array\(([\s\S]*?)\);/) || [])[1] || '';
  const pasJs = [...js.matchAll(/(\w+)\s*:\s*"([^"]*)"/g)].map(m => m[1] + '=' + m[2]).sort();
  const pasPh = [...ph.matchAll(/'(\w+)'\s*=>\s*'([^']*)'/g)].map(m => m[1] + '=' + m[2]).sort();
  sama('ROLE_LABEL di PHP sama dengan di layar', pasPh, pasJs);
  cek('tidak ada penulisan di blok halaman', !/rsv_hal_[\s\S]*?(INSERT|UPDATE|DELETE)[\s\S]*?DIAGNOSTIK/.test(LIB.slice(LIB.indexOf('TIGA TABEL PER HALAMAN'))));

  console.log(`\nLULUS ${ok}   GAGAL ${gagal}`);
  process.exit(gagal ? 1 : 0);
})();
