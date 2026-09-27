/* uji-radar-uang.js — Radar untuk semua orang, angka uang hanya untuk Head (27 Sep 2026)
 *
 *   node tools/uji-radar-uang.js
 *
 * Permintaan user: (1) Radar bisa dibuka SEMUA orang, tapi yang bukan Head
 * tidak melihat nominal harga, DP, dan pelunasan; (2) Kesiapan divisi dihapus.
 *
 * Diuji atas TIGA sesi — bukan Head, Head (kata utuh "Head" di Tim/Keterangan
 * Office), admin modul Radar — dan dibaca dari DOM yang benar-benar digambar,
 * bukan dari sumber. Sisi server (Radar modul bawaan semua akun) dijaga
 * sebagai kontrak atas sumber PHP account-mysql + diurai php-parser kalau ada.
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
  console.error('jsdom tidak ketemu. Setel JSDOM_PATH.');
  process.exit(2);
})();

let ok = 0, gagal = 0;
const cek = (n, s, k) => { if (s) { ok++; console.log('  OK   ' + n); } else { gagal++; console.log('  GAGAL ' + n + (k ? '  — ' + k : '')); } };
const tunggu = ms => new Promise(r => setTimeout(r, ms));
const HARI = n => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const TGL = HARI(1);

const EVENT = { id: 'e1', nama: 'Reuni SMP 10', tanggal: TGL, status: 'Deal', clientId: 'c1', mktPIC: 'u1',
  payments: [{ id: 'p1', amount: 5000000 }],
  detail: { tamuDatang: '10:00', selesai: '18:00', pax: 50, area: 'Seluruh Area',
    depositNominal: 7654321, dealPax: 123456, sewaVenue: 2222222,
    itemTambah: [{ nama: 'Open Bill', nominal: 504500 }],
    rundown: 'Pembukaan jam 10', menuFinal: 'Nasi liwet' } };
const DATA_MKT = { events: [EVENT], vip: [], users: [{ id: 'u1', name: 'Aurel' }],
  clients: [{ id: 'c1', nama: 'BU ILA', hp: '0853' }], designreqs: [], activities: [] };
const RES = [{ id: 'r1', name: 'Tamu DP', date: TGL, time: '19:00', pax: 4, table: '21',
  status: 'Confirmed', dpStatus: 'Sudah', dpAmount: 432100, category: 'Tamu Umum' }];

const JEMBATAN = 'window.APP=APP; window.__EV__=function(s){return eval(s);};';
function buka(sesi) {
  const asli = fs.readFileSync(path.join(ROOT, 'deploy/radar/index.html'), 'utf8');
  const html = asli.replace('window.APP=APP;', () => JEMBATAN);
  const vc = new VirtualConsole();
  vc.on('jsdomError', e => { const t = String((e && e.detail && e.detail.stack) || (e && e.message) || e); if (!/Not implemented|Could not parse CSS/.test(t)) console.log('  !! ' + t.split('\n')[0]); });
  return new JSDOM(html, { virtualConsole: vc, runScripts: 'dangerously', url: 'https://dev.laksamanamuda.id/radar/',
    beforeParse(w) {
      w.localStorage.setItem('lm_session', JSON.stringify(Object.assign({ userId: 'u9', name: 'Kru', modules: ['radar'],
        adminModules: [], token: 't', expiry: Date.now() + 86400000 }, sesi)));
      w.fetch = (url) => {
        const u = String(url);
        const isi = u.indexOf('marketing-api') > -1 ? DATA_MKT
                  : u.indexOf('event-api') > -1 ? { events: [], talents: [], schedules: [] }
                  : u.indexOf('reservasi-api') > -1 ? { reservations: RES } : {};
        const j = JSON.stringify({ ok: true, data: isi });
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(JSON.parse(j)), text: () => Promise.resolve(j) });
      };
      w.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
      w.print = () => {}; w.confirm = () => true;
      w.HTMLCanvasElement.prototype.getContext = () => ({});
    } }).window;
}
const layar = w => (w.document.getElementById('view') || { innerHTML: '' }).innerHTML;
const laci = w => (w.document.getElementById('drwBody') || w.document.querySelector('.drawer') || w.document.body).innerHTML
  .replace(/<script[\s\S]*?<\/script>/gi, '');

async function periksa(judul, sesi, bolehUang) {
  console.log('\n== ' + judul + ' ==');
  const w = buka(sesi);
  for (let i = 0; i < 150 && !(typeof w.__EV__ === 'function' && w.__EV__('typeof AGENDA') === 'object' && w.__EV__('AGENDA.length')); i++) await tunggu(20);
  cek('event Marketing masuk agenda', w.__EV__('AGENDA.filter(function(a){return a.sumber==="mkt";}).length') === 1);
  cek('penentu uang = ' + bolehUang, w.__EV__('radarBolehUang()') === bolehUang);

  w.APP.detailPenuh('mkt', 'e1'); await tunggu(40);
  const v = layar(w);
  cek('halaman Detail Lengkap tergambar', /Reuni SMP 10/.test(v) && /Detail lengkap/.test(v));
  cek('Kesiapan divisi DIHAPUS', !/Kesiapan divisi/i.test(v) && !/ksp-pct/.test(v));
  cek('isian non-uang tetap tampil (rundown, menu)', /Pembukaan jam 10/.test(v) && /Nasi liwet/.test(v));
  const ada = s => v.indexOf(s) > -1;
  cek((bolehUang ? 'MELIHAT' : 'TIDAK melihat') + ' deposit/harga deal/sewa venue',
      bolehUang === (ada('7654321') && ada('123456') && ada('2222222')) && (bolehUang || (!ada('7654321') && !ada('123456') && !ada('2222222'))));
  cek((bolehUang ? 'MELIHAT' : 'TIDAK melihat') + ' nominal Open Bill (tapi namanya tetap tampil)',
      ada('Open Bill') && (bolehUang ? ada('504.500') : !ada('504.500')));
  cek((bolehUang ? 'MELIHAT' : 'TIDAK melihat') + ' Pembayaran tercatat', bolehUang === ada('Pembayaran tercatat'));

  w.APP.go('agenda'); await tunggu(30);
  cek('bar kesiapan di kartu agenda dicabut', !/class="bars"/.test(layar(w)));

  // tabel daftar reservasi — periodenya dipatok ke tanggal fixture supaya tidak membusuk
  w.__EV__('fRs.view="tabel"; fRs.mode="hari"; fRs.tgl=' + JSON.stringify(TGL));
  w.APP.go('reservasi'); await tunggu(30);
  const tb = layar(w);
  cek('tabel reservasi memuat barisnya', tb.indexOf('Tamu DP') > -1);
  cek((bolehUang ? 'ADA' : 'TIDAK ada') + ' kolom DP di tabel reservasi', bolehUang === /<th>DP<\/th>/.test(tb) && bolehUang === (tb.indexOf('432.100') > -1));

  const kartu = w.__EV__('resCard(D.rsv.reservations[0])');
  cek((bolehUang ? 'MELIHAT' : 'TIDAK melihat') + ' DP di kartu reservasi', bolehUang === (kartu.indexOf('432.100') > -1));
  w.__EV__('drawerRes(D.rsv.reservations[0])');
  const dr = laci(w);
  cek((bolehUang ? 'MELIHAT' : 'TIDAK melihat') + ' DP di panel reservasi', bolehUang === (dr.indexOf('432.100') > -1 && dr.indexOf('Status DP') > -1));
}

(async () => {
  await periksa('bukan Head', { keterangan: 'Marketing' }, false);
  await periksa('bukan Head — kata mirip "Overhead"', { keterangan: 'Overhead Kitchen' }, false);
  await periksa('Head', { keterangan: 'Marketing, Head' }, true);
  await periksa('admin modul Radar', { keterangan: '', adminModules: ['radar'] }, true);

  console.log('\n== server: Radar modul bawaan semua akun ==');
  const lib = fs.readFileSync(path.join(ROOT, 'account-mysql/lib_account_mysql.php'), 'utf8');
  const i = lib.indexOf('function modul_bawaan_untuk(');
  const badan = lib.slice(i, lib.indexOf('function semua_modul_aktif(', i));
  cek('dimulai dengan radar untuk semua', /\$out = array\('radar'\);\s*\n\s*try \{/.test(badan));
  cek('galat di dalam try TIDAK mencabut radar', /catch \(Exception \$e\) \{[\s\S]*?\$out = array\('radar'\);/.test(badan));
  let parser = null;
  for (const p of [process.env.PHP_PARSER_PATH, path.join(ROOT, 'node_modules', 'php-parser'), 'php-parser']) { if (!p) continue; try { parser = require(p); break; } catch (e) {} }
  if (parser) {
    let okSintaks = true;
    try { new (parser.Engine || parser)({ parser: { php8: true, suppressErrors: false } }).parseCode(lib, 'lib.php'); } catch (e) { okSintaks = e.message; }
    cek('sintaks PHP account-mysql utuh (php-parser)', okSintaks === true, okSintaks);
  } else console.log('  LEWAT sintaks PHP — php-parser tidak terpasang');

  console.log('\nLULUS ' + ok + '   GAGAL ' + gagal);
  process.exit(gagal ? 1 : 0);
})();
