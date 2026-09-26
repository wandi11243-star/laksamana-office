/* uji-vip-kwitansi-filter.js — tiga revisi modul Marketing (26 September 2026)
 *
 *   node tools/uji-vip-kwitansi-filter.js
 *   JSDOM_PATH=/jalur/ke/jsdom node tools/uji-vip-kwitansi-filter.js
 *
 * 1. Request Kwitansi di detail Reservasi VIP DITAHAN sampai SEMUA transfer DP
 *    terverifikasi di modul Reservasi — konsep yang sama dengan kwiTertahan()
 *    di sana. Yang diukur JUMLAH kiriman invMinta, bukan pesan di layar.
 * 2. Daftar Reservasi VIP punya saringan periode (hari/minggu/bulan/tanggal)
 *    dan jenis; bawaannya Regular & Assisted TANPA yang dibatalkan.
 * 3. Invoice & Payment hanya memuat Deal / Event Done; Lost, Quotation, dan
 *    yang invoice-nya masih Draft tidak tampil — jumlah Draft DISEBUT.
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
const sama = (n, d, h) => cek(n, d === h, 'dapat ' + JSON.stringify(d) + ', harusnya ' + JSON.stringify(h));
const aman = async (n, fn) => { try { await fn(); } catch (e) { gagal++; console.log('  GAGAL ' + n + '  — melempar: ' + e.message); } };
const tunggu = ms => new Promise(r => setTimeout(r, ms));

function tglPlus(n) {
  const d = new Date(); d.setDate(d.getDate() + n);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
const HARI = tglPlus(0), JAUH = tglPlus(-400);

function resBaris(status) {
  return { id: 'vip-V_DP', name: 'Wulan', date: HARI, time: '21:00', pax: 7, table: 'R3', vip: true,
    status: 'Confirmed', dps: [
      { id: 'd1', vipBuktiId: 'b1', amount: 500000, tfStatus: status[0] },
      { id: 'd2', vipBuktiId: 'b2', amount: 300000, tfStatus: status[1] } ] };
}

function buka(opsi) {
  opsi = opsi || {};
  const html = fs.readFileSync(path.join(ROOT, 'deploy/marketing/index.html'), 'utf8')
    .replace(/<script[^>]*\ssrc="[^"]*performa-bonus\.js"[^>]*><\/script>/i,
      '<script>' + fs.readFileSync(path.join(ROOT, 'deploy/assets/performa-bonus.js'), 'utf8') + '</script>')
    .replace(/<script[^>]*\ssrc="[^"]*venue-layouts\.js"[^>]*><\/script>/i,
      '<script>' + fs.readFileSync(path.join(ROOT, 'deploy/assets/venue-layouts.js'), 'utf8') + '</script>')
    .replace(/<script[^>]*\ssrc=[^>]*><\/script>/gi, '');
  const vc = new VirtualConsole();
  vc.on('jsdomError', e => {
    const t = String((e && e.detail && e.detail.stack) || (e && e.message) || e);
    if (!/Not implemented|Could not parse CSS/.test(t)) console.log('  !! ' + t.split('\n')[0]);
  });
  const jejak = { minta: 0 };
  const dom = new JSDOM(html, { virtualConsole: vc, runScripts: 'dangerously',
    url: 'https://dev.laksamanamuda.id/marketing/',
    beforeParse(w) {
      w.localStorage.setItem('lm_session', JSON.stringify({
        id: 'u-a', name: 'Aurel', modules: ['marketing'], adminModules: ['marketing'],
        token: 't', expiry: Date.now() + 86400000 }));
      w.fetch = () => new Promise(() => {});
      w.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
      w.print = () => {}; w.confirm = () => true;
      w.Chart = class { destroy() {} update() {} };
      w.HTMLCanvasElement.prototype.getContext = () => ({});
    } });
  const w = dom.window;
  const balas = o => { const t = JSON.stringify(o); return Promise.resolve({ ok: true, status: 200,
    json: () => Promise.resolve(JSON.parse(t)), text: () => Promise.resolve(t) }); };
  w.fetch = (url, opts) => {
    const u = String(url || '');
    let b = {}; try { b = JSON.parse((opts && opts.body) || '{}'); } catch (e) {}
    if (u.indexOf('reservasi-api-mysql') > -1)
      return balas({ ok: true, data: { reservations: [resBaris(opsi.status || ['verified', 'verified'])], master: {}, _ver: 1 } });
    if (u.indexOf('finance-api-mysql') > -1) {
      if (/invMinta/.test(u)) { jejak.minta++; return balas({ ok: true, data: { status: 'MENUNGGU', mintaOleh: 'Aurel' } }); }
      return balas({ ok: true, data: {} });                      // invStatus: belum ada
    }
    return balas({ ok: true, data: { saved: true, bentrok: [], versi: {} } });
  };
  w.eval('S = normalizeState(seed());');
  w.eval(`
    S.users = [{ id:'u-a', name:'Aurel', div:'Marketing', role:'super_admin' }];
    ME = S.users[0];
    S.vip = [
      { id:'V_DP', jenis:'Assisted', nama:'Wulan', tanggal:${JSON.stringify(HARI)}, jamMulai:'21:00', paxMin:7,
        meja:['R3'], mktPIC:'u-a', nominal:0, resId:'vip-V_DP',
        bukti:[{id:'b1', key:'k1', nominal:500000, metode:'Transfer UOB'},{id:'b2', key:'k2', nominal:300000, metode:'Transfer UOB'}] },
      { id:'V_REG', jenis:'Regular', nama:'Reguler Lama', tanggal:${JSON.stringify(JAUH)}, jamMulai:'19:00', paxMin:4, meja:[], mktPIC:'u-a' },
      { id:'V_BATAL', jenis:'Assisted', nama:'Sudah Batal', tanggal:${JSON.stringify(HARI)}, jamMulai:'19:00', paxMin:4, meja:[], mktPIC:'u-a',
        batalAt:'2026-09-01T00:00:00Z' }
    ];
  `);
  return { w, jejak };
}
/* body.innerHTML jsdom IKUT memuat isi <script> — dan komentar di kodenya
   menyebut frasa yang sama dengan layar. Dibuang dulu sebelum dicari. */
const tanpaSkrip = w => w.document.body.innerHTML.replace(/<script[\s\S]*?<\/script>/gi, '');

(async () => {

console.log('\n== 1. Request Kwitansi VIP ditahan sampai dana terverifikasi ==');
await aman('belum terverifikasi', async () => {
  const { w, jejak } = buka({ status: ['verified', 'pending'] });
  cek('DP VIP terbaca oleh fixture', w.eval("vipDpTotal(S.vip.find(v=>v.id==='V_DP'))") === 800000,
      'dp=' + w.eval("vipDpTotal(S.vip.find(v=>v.id==='V_DP'))"));
  w.eval("vipDetail('V_DP')");
  await tunggu(150);
  const h = tanpaSkrip(w);
  cek('slot menyebut dana belum diverifikasi', /Dana masuk belum diverifikasi/.test(h));
  cek('menyebut jumlah transfer & nominalnya', /1 transfer belum terverifikasi/.test(h) && /300\.000/.test(h));
  cek('TIDAK ada tombol Request Kwitansi', !/vipMintaKwitansi\('V_DP'\)/.test(h));
  cek('slot ikut di kaki modal', w.document.querySelectorAll('.modal-foot .vipKwiSlot').length === 1);
  await w.eval("vipMintaKwitansi('V_DP')");
  await tunggu(50);
  sama('dipanggil dari console pun TIDAK ada kiriman invMinta', jejak.minta, 0);
});
await aman('sudah terverifikasi', async () => {
  const { w, jejak } = buka({ status: ['verified', 'verified'] });
  w.eval("vipDetail('V_DP')");
  await tunggu(150);
  const h = tanpaSkrip(w);
  cek('tombol Request Kwitansi muncul', /vipMintaKwitansi\('V_DP'\)/.test(h));
  cek('tidak ada penanda tertahan', !/Dana masuk belum diverifikasi/.test(h));
  cek('ringkasan membawa angka terverifikasi dari Reservasi',
      w.eval("vipRingkasKwi(S.vip.find(v=>v.id==='V_DP')).dpVerified") === 800000);
  await w.eval("vipMintaKwitansi('V_DP')");
  await tunggu(50);
  sama('permintaan terkirim', jejak.minta, 1);
});

console.log('\n== 2. Saringan daftar Reservasi VIP ==');
await aman('saringan', async () => {
  const { w } = buka();
  w.eval("go('vip')");
  await tunggu(50);
  const v = () => w.document.getElementById('view').innerHTML;
  cek('bawaan: yang aktif tampil', /Wulan/.test(v()) && /Reguler Lama/.test(v()));
  cek('bawaan: yang dibatalkan TIDAK tampil', !/Sudah Batal/.test(v()));
  cek('saringannya disebut dengan kata', /Regular &amp; Assisted \(tanpa yang dibatalkan\)/.test(v()));
  w.eval("vipSaring('jenis','batal')");
  cek('tab Dibatalkan menampilkan yang batal', /Sudah Batal/.test(v()) && !/Reguler Lama/.test(v()));
  w.eval("vipSaring('jenis','aktif')");
  w.eval("vipSaring('per','hari')");
  cek('Hari ini: acara hari ini tampil', /Wulan/.test(v()));
  cek('Hari ini: acara 400 hari lalu tidak', !/Reguler Lama/.test(v()));
  w.eval("vipSaring('per','bulan')");
  cek('Bulan ini: yang lama tidak', !/Reguler Lama/.test(v()));
  w.eval("vipSaring('tgl'," + JSON.stringify(JAUH) + ")");
  cek('Per tanggal: hanya tanggal itu', /Reguler Lama/.test(v()) && !/Wulan/.test(v()));
  w.eval("vipSaring('tgl','')");
  cek('mengosongkan tanggal kembali ke Semua', /Wulan/.test(v()) && /Reguler Lama/.test(v()));
  w.eval("vipSaring('jenis','Regular')");
  cek('tab Regular', /Reguler Lama/.test(v()) && !/Wulan/.test(v()));
  const r = JSON.parse(w.eval("JSON.stringify(vipRentangPeriode('minggu'))"));
  const a = new Date(r[0] + 'T00:00:00');
  cek('minggu ini mulai Senin dan panjangnya 7 hari', a.getDay() === 1
      && (new Date(r[1] + 'T00:00:00') - a) / 86400000 === 6, JSON.stringify(r));
});

console.log('\n== 3. Invoice & Payment hanya Deal / Event Done ==');
await aman('invoice', async () => {
  const { w } = buka();
  w.eval(`
    const c = S.clients[0] || { id:'c1', nama:'Klien' };
    if(!S.clients.length) S.clients.push(c);
    const rinci = [{ nama:'Paket', qty:1, harga:1000000 }];
    function ev(id, nama, status, extra){ return Object.assign({ id, nama, status, tanggal:${JSON.stringify(HARI)},
      clientId:c.id, payments:[], detail:{ biayaFB:1000000 }, invoiceSent:true }, extra||{}); }
    S.events = [
      ev('e1','EV DEAL','Deal'),
      ev('e2','EV DONE','Event Done'),
      ev('e3','EV LOST','Lost'),
      ev('e4','EV QUOT','Quotation Terkirim'),
      ev('e5','EV DRAFT','Deal', { detail:{}, invoiceSent:false }),
    ];
  `);
  const st = w.eval("S.events.map(e=>e.nama+':'+invStatus(e)).join(',')");
  cek('fixture: EV DRAFT memang Draft, EV DEAL bukan', /EV DRAFT:Draft/.test(st) && !/EV DEAL:Draft/.test(st), st);
  w.eval("go('invoices')");
  await tunggu(30);
  const v = w.document.getElementById('view').innerHTML;
  const tabel = v.slice(v.indexOf('<table'));
  cek('Deal tampil', /EV DEAL/.test(tabel));
  cek('Event Done tampil', /EV DONE/.test(tabel));
  cek('Lost TIDAK tampil', !/EV LOST/.test(v));
  cek('Quotation Terkirim TIDAK tampil', !/EV QUOT/.test(v));
  cek('Draft TIDAK di tabel', !/EV DRAFT/.test(tabel));
  cek('...tapi jumlahnya disebut', /1 event Deal \/ Event Done tidak ditampilkan/.test(v) && /EV DRAFT/.test(v));
});

console.log('\n---------------------------------------');
console.log('LULUS ' + ok + '   GAGAL ' + gagal);
process.exit(gagal ? 1 : 0);
})();
