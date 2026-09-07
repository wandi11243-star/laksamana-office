/* uji-performa-event-modul.js — Performa Omset & Bonus di modul Event
 *
 *   node tools/uji-performa-event-modul.js
 *   JSDOM_PATH=/jalur/ke/jsdom node tools/uji-performa-event-modul.js
 *
 * Kembaran tools/uji-performa-marketing-modul.js untuk modul Event, dan
 * SENGAJA berkas terpisah: tuan rumahnya berbeda (router hash, EMS_ROSTER,
 * peranSaya) dan menggabungkannya berarti satu berkas uji yang separuh
 * asersinya harus dijaga tidak menyentuh modul sebelah.
 *
 * Yang dijaga:
 *
 *  1. HAK LIHAT. Yang tercatat Head di Tim/Keterangan Office boleh membuka
 *     tiap anggota tim; yang bukan hanya boleh melihat dirinya sendiri dan
 *     rekapan gabungan. GERBANGNYA DIUJI DENGAN CARA MENGAKALINYA — data-pic
 *     tombol yang SUDAH ADA diubah lalu ditekan, persis yang dilakukan orang
 *     di devtools. Menyuntik tombol BARU tidak menguji apa pun: tombol
 *     suntikan tidak punya penangan klik, dan versi pertama uji Marketing
 *     memang meloloskan mutasi "gerbang cuma di tombol" karena itu.
 *
 *  2. ANGKANYA DARI ASET, bukan salinan. Realisasi & bonus dihitung
 *     deploy/assets/performa-bonus.js — berkas yang sama dengan panel Finance
 *     dan modul Marketing — jadi uji ini membandingkan angka di layar dengan
 *     pbAgregasi() langsung. Kalau suatu hari ada yang menyalin rumusnya ke
 *     modul ini, perbandingan itu yang berbunyi.
 *
 *  3. MEMUAT SENDIRI tanpa tombol, tanpa perputaran render→muat→render.
 *
 *  4. TAMPILANNYA DIKURUNG #pev-wrap. Ditulis global, .stat/th/td/.seg di 16
 *     halaman lain modul ini ikut bergeser.
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
const cek = (n, s, k) => { if (s) { ok++; console.log('  OK   ' + n); } else { gagal++; console.log('  GAGAL ' + n + (k ? '  — ' + k : '')); } };
const sama = (n, d, h) => cek(n, d === h, 'dapat ' + JSON.stringify(d) + ', harusnya ' + JSON.stringify(h));

/* ---- data uji ----
   Ayu = Head, Budi & Citra bukan. Tiap PIC diberi nominal berbeda supaya angka
   tiap segmen punya sidik jarinya sendiri: kalau gerbangnya bocor, angka orang
   lain akan muncul di layar dan langsung ketahuan.

   `openBill` sengaja diisi di sebagian baris: porsiPic event = amount/2 +
   Open Bill, jadi baris yang cuma memakai amount/2 punya tempat untuk muncul
   sebagai selisih. */
const PIC = [
  { id: 'p1', name: 'Ayu',   officeUserId: 'u1' },
  { id: 'p2', name: 'Budi',  officeUserId: 'u2' },
  { id: 'p3', name: 'Citra', officeUserId: 'u3' },
];
const ev = (pic, nama, amount, ob) => ({ picId: pic, eventName: nama, amount: amount,
  tax: Math.round(amount * 0.1), service: Math.round(amount * 0.05),
  ob: ob ? 1 : 0, obAmount: ob || 0, obTax: 0, obService: 0 });
const DAYS = [];
for (let i = 0; i < 8; i++) {
  DAYS.push({ date: '2026-09-' + String(i + 1).padStart(2, '0'),
    bd: { event: [ ev('p1', 'Ayu-' + i, 40000000 + i, i === 2 ? 750000 : 0),
                   ev('p2', 'Budi-' + i, 21000000 + i) ] } });
}
DAYS[0].bd.event.push(ev('p3', 'Citra-0', 9000000));
const DATA = { pic: PIC, days: DAYS, comps: [] };

const ROSTER = (jabatanAku) => ([
  { id: 'u1', name: 'Ayu',   username: 'ayu',   keterangan: jabatanAku, active: true, isModuleAdmin: false },
  { id: 'u2', name: 'Budi',  username: 'budi',  keterangan: 'Event',    active: true, isModuleAdmin: false },
  { id: 'u3', name: 'Citra', username: 'citra', keterangan: 'Event',    active: true, isModuleAdmin: false },
]);

/* opsi: { adminModules, isModuleAdmin } — dipakai menguji pengecualian
   manajemen. Keduanya dipisah karena sumbernya memang dua: isModuleAdmin
   jawaban Office (lewat roster), adminModules jalan mundur waktu Office tidak
   menjawab. Yang memeriksa cuma salah satu akan mengunci manajemen yang
   membuka halaman ini saat account-api sedang diam. */
function buka(namaAku, jabatanAku, opsi) {
  opsi = opsi || {};
  const html = fs.readFileSync(path.join(ROOT, 'deploy/event/index.html'), 'utf8')
    /* Aset lokal disisipkan inline menggantikan tagnya — jsdom tidak mengambil
       skrip eksternal. Kalau ikut dibuang seperti skrip CDN, halamannya jatuh
       ke cabang "mesin tidak termuat" dan ujinya lulus/gagal karena sebab yang
       tidak ada hubungannya dengan hak akses. */
    .replace(/<script[^>]*\ssrc="[^"]*performa-bonus\.js"[^>]*><\/script>/i,
      '<script>' + fs.readFileSync(path.join(ROOT, 'deploy/assets/performa-bonus.js'), 'utf8') + '</script>')
    .replace(/<script[^>]*\ssrc=[^>]*><\/script>/gi, '');
  const vc = new VirtualConsole();
  vc.on('jsdomError', e => {
    const t = String((e && e.detail && e.detail.stack) || (e && e.message) || e);
    if (!/Not implemented|Could not parse CSS/.test(t)) console.log('  !! ' + t.split('\n')[0]);
  });
  const dom = new JSDOM(html, { virtualConsole: vc, runScripts: 'dangerously',
    url: 'https://dev.laksamanamuda.id/event/',
    beforeParse(w) {
      w.localStorage.setItem('lm_session', JSON.stringify({
        userId: opsi.userId || ({ Ayu: 'u1', Budi: 'u2', Citra: 'u3' })[namaAku],
        name: namaAku, username: namaAku.toLowerCase(),
        modules: ['event'], adminModules: opsi.adminModules || [],
        token: 't', expiry: Date.now() + 86400000 }));
      w.fetch = () => new Promise(() => {});      // boot tidak boleh menembak jaringan
      w.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
      w.print = () => {}; w.confirm = () => true;
      w.Chart = class { destroy() {} update() {} };
      w.HTMLCanvasElement.prototype.getContext = () => ({});
    } });
  const w = dom.window;
  /* DB/EMS_ROSTER/PEV deklarasi `let` di lingkup leksikal global — BUKAN
     properti window, jadi harus lewat eval. Jebakan ini tercatat di CLAUDE.md
     dan sudah pernah memakan satu siklus penuh. */
  w.eval('if (typeof DB !== "undefined" && !DB && typeof normalize === "function") DB = normalize({});');
  const roster = ROSTER(jabatanAku);
  if (opsi.isModuleAdmin) roster.find(r => r.name === namaAku).isModuleAdmin = true;
  w.eval(`
    EMS_ROSTER = ${JSON.stringify(roster)};
    PEV.st='ok'; PEV.bulan='2026-09'; PEV.dimuat='2026-09'; PEV.data=${JSON.stringify(DATA)}; PEV.pic='';
  `);
  return w;
}

/* Tab terpisah yang datanya BELUM disiapkan: dipakai menguji pemuatan
   otomatis. Fetch-nya DIHITUNG, jadi perputaran render→muat→render punya
   tempat untuk ketahuan sebagai ANGKA, bukan sebagai halaman yang berkedip. */
function bukaKosong(namaAku, jabatanAku) {
  const w = buka(namaAku, jabatanAku);
  const jejak = { n: 0 };
  w.eval("PEV.st='idle'; PEV.data=null; PEV.dimuat='';");
  w.fetch = (url, opts) => {
    let b = {}; try { b = JSON.parse((opts && opts.body) || '{}'); } catch (e) {}
    if (b.action !== 'performaDivisi') return new Promise(() => {});
    jejak.n++; jejak.divi = b.divi; jejak.dari = b.dari; jejak.sampai = b.sampai; jejak.sesi = b.sesi;
    const jawab = JSON.stringify({ ok: true, data: DATA });
    return Promise.resolve({ ok: true, json: () => Promise.resolve(JSON.parse(jawab)), text: () => Promise.resolve(jawab) });
  };
  return { w, jejak };
}
const tunggu = ms => new Promise(r => setTimeout(r, ms));
/* Modul ini memakai router() + location.hash, bukan go(). Hash-nya disetel
   dulu supaya buildNav() menandai menu yang benar — router() dipanggil
   langsung karena hashchange di jsdom tidak selalu berbunyi di dalam eval. */
const bukaHal = w => w.eval("location.hash='#/perfomset'; router();");
const seg = w => Array.from(w.document.querySelectorAll('#pev_seg button'));
const namaSeg = w => seg(w).map(b => b.textContent.trim());
const body = w => (w.document.getElementById('pev_body') || { innerHTML: '' }).innerHTML;

/* Angka acuan, dihitung dari aset yang SAMA dengan yang dipakai halamannya. */
const acuan = (() => {
  const win = {};
  new Function('window', fs.readFileSync(path.join(ROOT, 'deploy/assets/performa-bonus.js'), 'utf8'))(win);
  const h = win.pbAgregasi(DAYS, 'event', PIC, []);
  return { rp: win.pbRp, agg: h.agg, bonus: win.bonusEvent(PIC, h.agg) };
})();

/* ---------- 0. halamannya benar-benar ada ---------- */
console.log('-- halamannya terdaftar --');
const src = fs.readFileSync(path.join(ROOT, 'deploy/event/index.html'), 'utf8');
cek('ada di NAV', /\{h:'perfomset',ic:'money',t:'Performa Omset & Bonus'\}/.test(src));
cek('ada di TITLES', /TITLES=\{perfomset:'Performa Omset & Bonus'/.test(src));
cek('ada di EMS_HALAMAN (ikut matriks izin)', /perfomset:'Performa Omset & Bonus'\s*\n\};/.test(src));
cek('ada di peta router', /routes=\{perfomset:renderPerformaOmsetEvent/.test(src));
cek('"Event Performance" TIDAK ikut dicabut', /\{h:'performa',ic:'pipe',t:'Event Performance'\}/.test(src),
    'user tidak pernah meminta halaman itu dihapus');

/* ---------- 1. BUKAN Head ---------- */
console.log('\n-- Budi (bukan Head) --');
let w = buka('Budi', 'Event');
bukaHal(w);
const segBudi = namaSeg(w);
cek('ada tab Semua', segBudi.some(t => /Semua/.test(t)), segBudi.join(' | '));
cek('ada namanya sendiri', segBudi.some(t => /Budi/.test(t)), segBudi.join(' | '));
cek('TIDAK ada rekan (Ayu)', !segBudi.some(t => /Ayu/.test(t)), segBudi.join(' | '));
cek('TIDAK ada rekan (Citra)', !segBudi.some(t => /Citra/.test(t)), segBudi.join(' | '));
cek('layarnya menjelaskan batasnya', /tercatat <b>Head<\/b>/.test(w.document.getElementById('content').innerHTML));

cek('terbuka di capaian sendiri', body(w).indexOf(acuan.rp(acuan.agg.p2.real)) > -1,
    'mencari ' + acuan.rp(acuan.agg.p2.real));
cek('...dan BUKAN angka Ayu', body(w).indexOf(acuan.rp(acuan.agg.p1.real)) < 0);

console.log('\n-- gerbangnya diakali lewat devtools --');
/* SERANGAN YANG SESUNGGUHNYA: mengubah data-pic tombol yang SUDAH ADA lalu
   menekannya. Tombol itu membawa penangannya sendiri, dan penangannya membaca
   b.dataset.pic — jadi gerbang yang cuma "tidak menggambar tombol" bocor di
   sini, sementara tombol suntikan baru tidak akan pernah membuktikan apa pun. */
w.eval(`(function(){
  const b=document.querySelector('#pev_seg button[data-pic="p2"]');
  b.dataset.pic='p1';       // ubah dari devtools
  b.click();
})()`);
cek('capaian Ayu TIDAK ikut terbuka', body(w).indexOf(acuan.rp(acuan.agg.p1.real)) < 0,
    'angka Ayu bocor ke layar Budi');
cek('PEV.pic tidak berpindah ke PIC terlarang', w.eval('PEV.pic') !== 'p1', w.eval('PEV.pic'));
cek('...dan yang tergambar rekapan gabungan, bukan layar kosong',
    body(w).length > 500, 'gerbangnya menjatuhkan halaman alih-alih mengalihkannya');

console.log('\n-- tab Semua tetap terbuka, tapi tanpa nama rekan --');
w.eval("(function(){ const b=document.querySelector('#pev_seg button[data-pic=\"__all__\"]'); b.click(); })()");
const totalSemua = PIC.reduce((s, p) => s + acuan.agg[p.id].real, 0);
cek('rekapan gabungan tergambar', body(w).indexOf(acuan.rp(totalSemua)) > -1,
    'mencari ' + acuan.rp(totalSemua));
cek('Daftar Event TIDAK menyebut nama PIC', !/· Ayu|· Citra/.test(body(w)),
    'nama rekan bocor lewat kolom Nama Event');

/* ---------- 2. Head ---------- */
console.log('\n-- Ayu (Head) --');
w = buka('Ayu', 'Event, Head');
bukaHal(w);
const segAyu = namaSeg(w);
cek('Head melihat SELURUH anggota tim',
    ['Ayu', 'Budi', 'Citra'].every(n => segAyu.some(t => t.indexOf(n) > -1)), segAyu.join(' | '));
cek('layarnya menyebut statusnya', /tercatat <b>Head<\/b> di Tim\/Keterangan Office, jadi bisa membuka/.test(w.document.getElementById('content').innerHTML));
w.eval("(function(){ const b=document.querySelector('#pev_seg button[data-pic=\"p2\"]'); b.click(); })()");
cek('Head boleh membuka capaian rekan', body(w).indexOf(acuan.rp(acuan.agg.p2.real)) > -1,
    'mencari ' + acuan.rp(acuan.agg.p2.real));
w.eval("(function(){ const b=document.querySelector('#pev_seg button[data-pic=\"__all__\"]'); b.click(); })()");
cek('...dan Daftar Event menyebut nama PIC untuknya', /· Budi|· Ayu|· Citra/.test(body(w)));

/* "Head" harus KATA UTUH dan tidak boleh tertukar dengan "Leader" — satu kata
   untuk dua hal (hak lihat & Bonus Leader) adalah keputusan user 7 September
   2026; dua kata mengembalikan persis masalah yang baru ditutup. */
console.log('\n-- kata penandanya --');
let w2 = buka('Ayu', 'Event, Leader');
bukaHal(w2);
cek('"Leader" TIDAK memberi hak lihat tim',
    !namaSeg(w2).some(t => /Budi/.test(t)), namaSeg(w2).join(' | '));
w2 = buka('Ayu', 'Event Overhead');
bukaHal(w2);
cek('"Overhead" bukan Head', !namaSeg(w2).some(t => /Budi/.test(t)), namaSeg(w2).join(' | '));

/* ---------- 2b. manajemen: melihat seluruh tim tanpa harus Head ----------
   Alasannya sama dengan pengecualian adminModules di Performa Kasir dan super
   admin di modul Marketing: yang mengelola modul ini memang tugasnya memeriksa
   siapa dapat berapa. */
console.log('\n-- manajemen / admin modul (bukan Head) --');
let wA = buka('Budi', 'Event', { isModuleAdmin: true });
bukaHal(wA);
cek('admin modul melihat SELURUH anggota tim',
    ['Ayu', 'Budi', 'Citra'].every(n => namaSeg(wA).some(t => t.indexOf(n) > -1)), namaSeg(wA).join(' | '));
cek('layarnya menyebut SEBABNYA — manajemen, bukan Head',
    /manajemen \/ admin modul Event<\/b>, jadi bisa membuka/.test(wA.document.getElementById('content').innerHTML));
wA.eval("(function(){ const b=document.querySelector('#pev_seg button[data-pic=\"p1\"]'); b.click(); })()");
cek('...dan boleh membuka capaian rekan', body(wA).indexOf(acuan.rp(acuan.agg.p1.real)) > -1);

/* Jalan mundur lewat adminModules — WAJIB, karena roster hanya terisi kalau
   pembacaan Office berhasil. Kalau cuma roster yang diperiksa, manajemen yang
   membukanya saat account-api diam ikut terkunci. */
wA = buka('Budi', 'Event', { adminModules: ['event'] });
wA.eval('EMS_ROSTER = null;');       // Office tidak menjawab
bukaHal(wA);
cek('adminModules jadi jalan mundur waktu Office diam',
    ['Ayu', 'Citra'].every(n => namaSeg(wA).some(t => t.indexOf(n) > -1)), namaSeg(wA).join(' | '));

/* Yang bukan keduanya tetap terkunci — pengecualiannya tidak boleh melebar. */
wA = buka('Budi', 'Event', { adminModules: ['marketing'] });
bukaHal(wA);
cek('admin modul LAIN tidak ikut terbuka',
    !namaSeg(wA).some(t => /Ayu|Citra/.test(t)), namaSeg(wA).join(' | '));

/* Office yang diam TIDAK boleh membuka tim untuk staf biasa: rosterSaya()
   memulangkan null, jadi ia bukan Head dan bukan pula PIC yang dikenal. Yang
   tersisa cuma rekapan gabungan, dan sebabnya dikatakan. */
wA = buka('Budi', 'Event');
wA.eval('EMS_ROSTER = null;');
bukaHal(wA);
cek('Office diam TIDAK membuka tim untuk staf biasa',
    !namaSeg(wA).some(t => /Ayu|Citra/.test(t)), namaSeg(wA).join(' | '));
cek('...dan sebabnya dikatakan', /belum cocok dengan satu pun PIC event/.test(wA.document.getElementById('content').innerHTML));

/* ---------- 3. tidak menyalin rumus ---------- */
console.log('\n-- angkanya dari aset, bukan salinan --');
cek('modul Event memuat asetnya', /src="\.\.\/assets\/performa-bonus\.js"/.test(src));
cek('...dan tidak menyalin satu rumus pun',
    src.indexOf('function bonusEvent(') < 0 && src.indexOf('function pbAgregasi(') < 0
    && src.indexOf('const EV_S1=') < 0 && src.indexOf('function kartuBonusEv(') < 0);
cek('halamannya memanggil penghitung bersama',
    /pbAgregasi\(PEV\.data\.days/.test(src) && /bonusEvent\(list, agg\)/.test(src));
cek('penentu Head-nya juga bersama, bukan ditulis ulang',
    /pbHead\(\{ officeUserId:m\.id, name:m\.name \}\)/.test(src) && src.indexOf('function pbHead(') < 0);
cek('asetnya dimuat SEBELUM skrip halaman',
    src.indexOf('performa-bonus.js') < src.indexOf('window.__ICON__'),
    'pbSetKeterangan() dipanggil di badan skrip halaman');

/* Endpoint sempit, bukan getAll — getAll memulangkan seluruh blob omset.
   Diperiksa DI DALAM blok halaman ini saja: modul Event punya API-nya sendiri,
   dan itu urusan lain. Batas bawahnya penutup pevPasangKendali(), fungsi
   terakhir blok ini — jangkar yang hilang tidak menggagalkan slice(), ia cuma
   mengubah artinya, jadi keberadaan keduanya ikut diperiksa. */
const awalPEV = src.indexOf('const PEV_API');
const akhirPEV = src.indexOf('\n}', src.indexOf('function pevPasangKendali('));
cek('blok halaman ini bisa dipotong dari sumber', awalPEV > -1 && akhirPEV > awalPEV);
const blokPEV = src.slice(awalPEV, akhirPEV);
cek('datanya lewat endpoint sempit', /action:'performaDivisi'/.test(blokPEV));
cek('...dan halaman ini TIDAK memanggil getAll kompas',
    blokPEV.indexOf('getAll') < 0, 'getAll memulangkan seluruh blob omset');
cek('...lewat kompas-api, bukan api modul ini',
    /PEV_API = '\.\.\/kompas-api-mysql\/api\.php'/.test(blokPEV));

/* ---------- 4. memuat sendiri, tanpa tombol ---------- */
(async function () {
  console.log('\n-- memuat sendiri (tanpa tombol Tampilkan) --');
  cek('tombol Tampilkan tidak pernah digambar', blokPEV.indexOf('id="pev_muat"') < 0);
  cek('...dan tidak ada kalimat yang menyuruh menekannya',
      blokPEV.indexOf('tekan <b>Tampilkan</b>') < 0);

  const { w: w4, jejak } = bukaKosong('Budi', 'Event');
  bukaHal(w4);
  cek('halaman langsung memuat sendiri', jejak.n === 1, 'permintaan terkirim: ' + jejak.n);
  sama('...untuk divisi event', jejak.divi, 'event');
  sama('...rentangnya sebulan penuh (awal)', jejak.dari, '2026-09-01');
  sama('...rentangnya sebulan penuh (akhir)', jejak.sampai, '2026-09-30');
  cek('...dan membawa token sesi', jejak.sesi === 't', 'endpoint ini berpagar sesi');
  await tunggu(120);
  cek('datanya tergambar tanpa satu klik pun',
      body(w4).indexOf(acuan.rp(acuan.agg.p2.real)) > -1, body(w4).slice(0, 80));

  /* PERPUTARAN: pevMuat() memanggil router() di ujungnya, dan router() itulah
     yang memicu pemuatan. Tanpa penanda `dimuat`, keduanya saling memanggil
     tanpa henti — yang terlihat bukan galat, melainkan halaman berkedip sambil
     menghujani server. Yang diperiksa ANGKANYA, bukan tampilannya. */
  const n1 = jejak.n;
  bukaHal(w4); bukaHal(w4);
  await tunggu(120);
  sama('menggambar ulang TIDAK memicu permintaan baru', jejak.n, n1);

  w4.eval("(function(){ const m=document.getElementById('pev_bulan'); m.value='2026-08'; m.onchange(); })()");
  await tunggu(120);
  sama('ganti bulan memicu tepat SATU permintaan', jejak.n, n1 + 1);
  sama('...dan bulannya benar-benar berpindah', w4.eval('PEV.bulan'), '2026-08');
  sama('...rentangnya ikut bulan itu', jejak.sampai, '2026-08-31');

  /* Februari: hari terakhirnya dihitung, bukan dipatok 30. */
  w4.eval("(function(){ const m=document.getElementById('pev_bulan'); m.value='2026-02'; m.onchange(); })()");
  await tunggu(120);
  sama('Februari berhenti di tanggal 28', jejak.sampai, '2026-02-28');

  /* ---------- 5. dasar angkanya: NET + Open Bill, bukan Diakui ----------
     Bonus Event memakai `amount` (kolom Nilai Event), BEDA dari Bonus
     Marketing yang memakai omset+tax+service. Salah pakai membuat seluruh
     tangga praktis tidak pernah tercapai, dan angka yang kecil terbaca sebagai
     bulan yang sepi — bukan sebagai bug. */
  console.log('\n-- dasar angkanya --');
  const w5 = buka('Ayu', 'Event, Head');
  bukaHal(w5);
  w5.eval("(function(){ const b=document.querySelector('#pev_seg button[data-pic=\"p1\"]'); b.click(); })()");
  const nilaiAyu = acuan.agg.p1.events.reduce((s, x) => s + x.amount, 0);
  cek('Daftar Event menyebut nilai total (net)', body(w5).indexOf(acuan.rp(nilaiAyu)) > -1,
      'mencari ' + acuan.rp(nilaiAyu));
  cek('...dan mengatakan yang diakui 50%', /diakui <b>50%<\/b>/.test(body(w5)));
  cek('kolom Open Bill muncul karena ada yang punya', /<th class="num">Open Bill<\/th>/.test(body(w5)));
  const w5b = buka('Budi', 'Event');
  bukaHal(w5b);
  cek('...dan TIDAK muncul untuk yang tidak punya', !/Open Bill/.test(body(w5b)),
      'satu kolom penuh Rp0 di mayoritas periode');
  cek('kartu bonus dari aset ikut tergambar', /Bonus Tunai/.test(body(w5)),
      'kartuBonusEv() tidak dipanggil');
  cek('...dengan angka yang sama dengan aset',
      body(w5).indexOf(acuan.rp(acuan.bonus.per.p1.tunai)) > -1,
      'mencari ' + acuan.rp(acuan.bonus.per.p1.tunai));

  /* Yang dipotong HANYA tampilannya: bonus dihitung dari a.events yang utuh,
     bukan dari halaman yang kebetulan terbuka. Ayu punya 8 event = 2 halaman. */
  console.log('\n-- pager 5 baris --');
  cek('pagernya ada', !!w5.document.getElementById('pev_pager'));
  cek('...5 baris per halaman', (body(w5).match(/<tr><td>2026-09/g) || []).length === 5,
      (body(w5).match(/<tr><td>2026-09/g) || []).length + ' baris');
  cek('bonus tetap dihitung dari SELURUH event, bukan halaman yang terbuka',
      body(w5).indexOf(acuan.rp(acuan.bonus.per.p1.tunai)) > -1);
  w5.eval("(function(){ const b=document.querySelector('#pev_pager button[data-hal=\"2\"]'); b.click(); })()");
  cek('halaman 2 memajang sisanya', (body(w5).match(/<tr><td>2026-09/g) || []).length === 3,
      (body(w5).match(/<tr><td>2026-09/g) || []).length + ' baris');
  cek('...dan bonusnya TIDAK berubah', body(w5).indexOf(acuan.rp(acuan.bonus.per.p1.tunai)) > -1,
      'lembar bonus yang mengecil karena ganti halaman');

  /* ---------- 6. tampilannya, dan yang tidak boleh ikut bergeser ---------- */
  console.log('\n-- tampilan disamakan dengan modul Marketing / panel Finance --');
  cek('seluruh isinya dikurung #pev-wrap', !!w5.document.getElementById('pev-wrap'));
  cek('...termasuk keadaan memuat & galat', (src.match(/bungkus\(kepala/g) || []).length >= 4,
      'sebagian keadaan tidak dibungkus — layarnya berpindah gaya waktu datanya datang');
  ['.stat .lab', '.stat .val', '.stat .foot', '.stat.accent', 'th{', 'td{', '.seg button.active',
   '.notice.warn', '.tbl-wrap', '.num', '.card-sub']
    .forEach(k => cek('menyediakan ' + k, src.indexOf('#pev-wrap ' + k) > -1));
  /* Gradasi emas .stat .val milik modul ini memakai -webkit-text-fill-color:
     transparent. Kalau tidak dikembalikan, angka di kartu .accent (latarnya
     sudah emas) TIDAK TERLIHAT sama sekali — dan kartu kosong terbaca sebagai
     data yang gagal dimuat, bukan sebagai salah warna. */
  cek('gradasi .stat .val dikembalikan jadi warna biasa',
      /#pev-wrap \.stat \.val\{[^}]*-webkit-text-fill-color:currentColor/.test(src));
  cek('garis emas .stat::before dimatikan di dalam kurungan',
      src.indexOf('#pev-wrap .stat::before{display:none}') > -1);

  /* Tiap aturan yang ditambahkan untuk halaman ini WAJIB berawalan #pev-wrap.
     Ini yang akan menangkap aturan BERIKUTNYA yang ditulis global.
     KOMENTAR DIBUANG DULU: penjelasan di atas aturannya menyebut nama kelas
     apa adanya (".stat dengan anak .lab/.val/.foot"), dan baris komentar yang
     kebetulan diawali titik akan terbaca sebagai aturan global — pemindai yang
     merah untuk komentar akan dimatikan orang berikutnya, dan bersamanya
     hilang pemeriksaan yang sungguhan. Aturan yang sama dengan
     tools/uji-tanpa-target.js. */
  const blokCss = src.slice(src.indexOf('/* ===== Performa Omset & Bonus — tampilan panel Finance'),
                            src.indexOf('#pev-wrap .btn-sm'))
    .replace(/\/\*[\s\S]*?\*\//g, '');
  cek('blok CSS-nya bisa dipotong', blokCss.length > 500, blokCss.length + ' karakter');
  const bocor = blokCss.split('\n')
    .filter(b => /^[.#a-z@]/i.test(b.trim()) && b.indexOf('#pev-wrap') < 0);
  cek('tidak ada aturan yang lolos jadi global', bocor.length === 0, bocor.join(' | '));

  console.log('\n' + ok + ' OK, ' + gagal + ' GAGAL');
  process.exit(gagal ? 1 : 0);
})();
