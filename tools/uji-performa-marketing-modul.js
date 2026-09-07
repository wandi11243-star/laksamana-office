/* uji-performa-marketing-modul.js — Performa Omset & Bonus di modul Marketing
 *
 *   node tools/uji-performa-marketing-modul.js
 *   JSDOM_PATH=/jalur/ke/jsdom node tools/uji-performa-marketing-modul.js
 *
 * Halaman ini memajang OMSET PER ORANG. Yang dijaga di sini terutama HAK
 * LIHATNYA (permintaan user 7 September 2026): yang tercatat Head di
 * Tim/Keterangan Office boleh membuka tiap anggota tim; yang bukan hanya boleh
 * melihat dirinya sendiri dan rekapan gabungan.
 *
 * GERBANGNYA DIUJI DENGAN CARA MENGAKALINYA. Tombol PIC lain memang tidak
 * digambar, tapi `data-pic` bisa diubah dari devtools dalam sepuluh detik —
 * halaman yang menjaga aksesnya hanya dengan tidak menggambar tombol tidak
 * menjaga apa pun. Uji ini menyuntik tombol palsu lalu mengkliknya, pola yang
 * sama dengan tools/uji-performa-kasir-akses.js.
 *
 * Yang juga dijaga: ANGKANYA SAMA dengan panel Finance. Realisasi di halaman
 * ini dihitung deploy/assets/performa-bonus.js — berkas yang sama — jadi uji
 * ini membandingkan hasil di layar dengan pbAgregasi() langsung. Kalau suatu
 * hari ada yang menyalin rumusnya ke modul ini, perbandingan itu yang berbunyi.
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
   Ayu = Head, Budi & Citra bukan. Tiap PIC diberi nominal berbeda supaya
   angka tiap segmen punya sidik jarinya sendiri: kalau gerbangnya bocor,
   angka orang lain akan muncul dan langsung ketahuan. */
const PIC = [
  { id: 'p1', name: 'Ayu',   officeUserId: 'u1' },
  { id: 'p2', name: 'Budi',  officeUserId: 'u2' },
  { id: 'p3', name: 'Citra', officeUserId: 'u3' },
];
const ev = (pic, nama, amount) => ({ picId: pic, eventName: nama, amount: amount,
  tax: Math.round(amount * 0.1), service: Math.round(amount * 0.05), srcJenis: 'Corporate Event' });
const DAYS = [];
for (let i = 0; i < 8; i++) {
  DAYS.push({ date: '2026-09-' + String(i + 1).padStart(2, '0'),
    bd: { marketing: [ ev('p1', 'Ayu-' + i, 40000000 + i), ev('p2', 'Budi-' + i, 21000000 + i) ] } });
}
DAYS[0].bd.marketing.push(ev('p3', 'Citra-0', 9000000));
const DATA = { pic: PIC, days: DAYS, comps: [] };

/* opsi: { adminModules, role } — dipakai menguji pengecualian admin modul.
   Keduanya dipisah karena sumbernya memang dua: adminModules jawaban Office,
   role turunannya di dalam modul. Yang memeriksa cuma salah satu akan
   mengunci admin yang membuka halaman ini saat Office sedang tidak menjawab. */
function buka(namaAku, jabatanAku, opsi) {
  opsi = opsi || {};
  const html = fs.readFileSync(path.join(ROOT, 'deploy/marketing/index.html'), 'utf8')
    /* Aset lokal disisipkan inline menggantikan tagnya — jsdom tidak mengambil
       skrip eksternal. Kalau ikut dibuang seperti skrip CDN, halamannya
       melempar di pbAgregasi() dan ujinya gagal karena sebab yang tidak ada
       hubungannya dengan hak akses. */
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
  const dom = new JSDOM(html, { virtualConsole: vc, runScripts: 'dangerously',
    url: 'https://dev.laksamanamuda.id/marketing/',
    beforeParse(w) {
      w.localStorage.setItem('lm_session', JSON.stringify({
        id: 'u1', name: namaAku, modules: ['marketing'], adminModules: opsi.adminModules || [],
        token: 't', expiry: Date.now() + 86400000 }));
      w.fetch = () => new Promise(() => {});      // boot tidak boleh menembak jaringan
      w.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
      w.print = () => {}; w.confirm = () => true;
      w.Chart = class { destroy() {} update() {} };
      w.HTMLCanvasElement.prototype.getContext = () => ({});
    } });
  const w = dom.window;
  /* S/ME/PFO deklarasi `let` di lingkup leksikal global — BUKAN properti
     window, jadi harus lewat eval. Jebakan ini tercatat di CLAUDE.md dan sudah
     pernah memakan satu siklus penuh. */
  /* State disiapkan langsung, seperti tools/smoke-modul.js: boot sungguhan
     menariknya dari server dan yang diuji di sini bukan boot-nya. */
  w.eval('S = normalizeState(seed());');
  w.eval(`
    S.users = ${JSON.stringify([
      { id: 'u1', name: 'Ayu',   jabatan: '', div: 'Marketing', role: 'marketing' },
      { id: 'u2', name: 'Budi',  jabatan: 'Marketing', div: 'Marketing', role: 'marketing' },
      { id: 'u3', name: 'Citra', jabatan: 'Marketing', div: 'Marketing', role: 'marketing' },
    ])};
    S.users[0].jabatan = ${JSON.stringify(jabatanAku)};
    ME = S.users.find(u=>u.name===${JSON.stringify(namaAku)});
    PFO.st='ok'; PFO.bulan='2026-09'; PFO.dimuat='2026-09'; PFO.data=${JSON.stringify(DATA)}; PFO.pic='';
  `);
  if (opsi.role) w.eval('ME.role=' + JSON.stringify(opsi.role) + ';');
  return w;
}

/* Tab terpisah yang datanya BELUM disiapkan: dipakai menguji pemuatan otomatis.
   Fetch-nya dihitung, jadi perputaran render→muat→render punya tempat untuk
   ketahuan sebagai ANGKA, bukan sebagai halaman yang berkedip. */
function bukaKosong(namaAku, jabatanAku) {
  const w = buka(namaAku, jabatanAku);
  const jejak = { n: 0 };
  w.eval("PFO.st='idle'; PFO.data=null; PFO.dimuat='';");
  w.fetch = (url, opts) => {
    let b = {}; try { b = JSON.parse((opts && opts.body) || '{}'); } catch (e) {}
    if (b.action !== 'performaDivisi') return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true, data: {} }), text: () => Promise.resolve('{"ok":true}') });
    jejak.n++;
    const jawab = JSON.stringify({ ok: true, data: DATA });
    return Promise.resolve({ ok: true, json: () => Promise.resolve(JSON.parse(jawab)), text: () => Promise.resolve(jawab) });
  };
  return { w, jejak };
}
const tunggu = ms => new Promise(r => setTimeout(r, ms));
const seg = w => Array.from(w.document.querySelectorAll('#pfo_seg button'));
const namaSeg = w => seg(w).map(b => b.textContent.trim());
const body = w => (w.document.getElementById('pfo_body') || { innerHTML: '' }).innerHTML;

/* Angka acuan, dihitung dari aset yang SAMA dengan yang dipakai halamannya. */
const acuan = (() => {
  const win = {};
  new Function('window', fs.readFileSync(path.join(ROOT, 'deploy/assets/performa-bonus.js'), 'utf8'))(win);
  const h = win.pbAgregasi(DAYS, 'marketing', PIC, []);
  return { rp: win.pbRp, agg: h.agg };
})();

/* ---------- 1. BUKAN Head ---------- */
console.log('-- Budi (bukan Head) --');
let w = buka('Budi', 'Marketing');
w.eval("go('perfomset')");
const segBudi = namaSeg(w);
cek('ada tab Semua', segBudi.some(t => /Semua/.test(t)), segBudi.join(' | '));
cek('ada namanya sendiri', segBudi.some(t => /Budi/.test(t)), segBudi.join(' | '));
cek('TIDAK ada rekan (Ayu)', !segBudi.some(t => /Ayu/.test(t)), segBudi.join(' | '));
cek('TIDAK ada rekan (Citra)', !segBudi.some(t => /Citra/.test(t)), segBudi.join(' | '));
cek('layarnya menjelaskan batasnya', /hanya yang tercatat <b>Head<\/b>|tercatat <b>Head<\/b>/.test(w.document.getElementById('view').innerHTML));

/* Segmen awalnya dirinya sendiri, dan angkanya angka DIRINYA. */
cek('terbuka di capaian sendiri', body(w).indexOf(acuan.rp(acuan.agg.p2.real)) > -1,
    'mencari ' + acuan.rp(acuan.agg.p2.real));
cek('...dan BUKAN angka Ayu', body(w).indexOf(acuan.rp(acuan.agg.p1.real)) < 0);

console.log('\n-- gerbangnya diakali lewat devtools --');
/* SERANGAN YANG SESUNGGUHNYA: bukan menyuntik tombol baru — tombol suntikan
   tidak punya penangan klik, jadi mengkliknya tidak memanggil apa pun dan
   ujinya lulus untuk gerbang yang sebenarnya bocor (versi pertama uji ini
   memang meloloskannya). Yang dilakukan orang di devtools jauh lebih sederhana:
   MENGUBAH data-pic tombol yang SUDAH ADA, lalu menekannya. Tombol itu membawa
   penangannya sendiri, dan penangannya membaca b.dataset.pic. */
w.eval(`(function(){
  const b=document.querySelector('#pfo_seg button[data-pic="p2"]');
  b.dataset.pic='p1';       // ubah dari devtools
  b.click();
})()`);
cek('capaian Ayu TIDAK ikut terbuka', body(w).indexOf(acuan.rp(acuan.agg.p1.real)) < 0,
    'angka Ayu bocor ke layar Budi');
cek('PFO.pic tidak berpindah ke PIC terlarang', w.eval('PFO.pic') !== 'p1', w.eval('PFO.pic'));
cek('...dan yang tergambar rekapan gabungan, bukan layar kosong',
    body(w).length > 500, 'gerbangnya menjatuhkan halaman alih-alih mengalihkannya');

console.log('\n-- tab Semua tetap terbuka, tapi tanpa nama rekan --');
w.eval("(function(){ const b=document.querySelector('#pfo_seg button[data-pic=\"__all__\"]'); b.click(); })()");
const totalSemua = PIC.reduce((s, p) => s + acuan.agg[p.id].real, 0);
cek('rekapan gabungan tergambar', body(w).indexOf(acuan.rp(totalSemua)) > -1,
    'mencari ' + acuan.rp(totalSemua));
cek('Daftar Event TIDAK menyebut nama PIC', !/· Ayu|· Citra/.test(body(w)),
    'nama rekan bocor lewat kolom Nama Event');

/* ---------- 2. Head ---------- */
console.log('\n-- Ayu (Head) --');
w = buka('Ayu', 'Marketing, Head');
w.eval("go('perfomset')");
const segAyu = namaSeg(w);
cek('Head melihat SELURUH anggota tim',
    ['Ayu', 'Budi', 'Citra'].every(n => segAyu.some(t => t.indexOf(n) > -1)), segAyu.join(' | '));
cek('layarnya menyebut statusnya', /tercatat <b>Head<\/b>/.test(w.document.getElementById('view').innerHTML));
w.eval("(function(){ const b=document.querySelector('#pfo_seg button[data-pic=\"p2\"]'); b.click(); })()");
cek('Head boleh membuka capaian rekan', body(w).indexOf(acuan.rp(acuan.agg.p2.real)) > -1,
    'mencari ' + acuan.rp(acuan.agg.p2.real));
w.eval("(function(){ const b=document.querySelector('#pfo_seg button[data-pic=\"__all__\"]'); b.click(); })()");
cek('...dan Daftar Event menyebut nama PIC untuknya', /· Budi|· Ayu|· Citra/.test(body(w)));

/* "Head" harus KATA UTUH dan tidak boleh tertukar dengan "Leader". */
console.log('\n-- kata penandanya --');
let w2 = buka('Ayu', 'Marketing, Leader');
w2.eval("go('perfomset')");
cek('"Leader" TIDAK memberi hak lihat tim',
    !namaSeg(w2).some(t => /Budi/.test(t)), namaSeg(w2).join(' | '));
w2 = buka('Ayu', 'Marketing Overhead');
w2.eval("go('perfomset')");
cek('"Overhead" bukan Head', !namaSeg(w2).some(t => /Budi/.test(t)), namaSeg(w2).join(' | '));

/* ---------- 2b. admin modul: melihat seluruh tim tanpa harus Head ----------
   Permintaan user 7 September 2026: "untuk super admin tetap bisa lihat full
   team marketing punya". Alasannya sama dengan pengecualian adminModules di
   Performa Kasir: yang mengelola modul ini memang tugasnya memeriksa siapa
   dapat berapa. */
console.log('\n-- admin modul (bukan Head) --');
let wA = buka('Budi', 'Marketing', { adminModules: ['marketing'] });
wA.eval("go('perfomset')");
cek('admin modul melihat SELURUH anggota tim',
    ['Ayu', 'Budi', 'Citra'].every(n => namaSeg(wA).some(t => t.indexOf(n) > -1)), namaSeg(wA).join(' | '));
cek('layarnya menyebut SEBABNYA — admin modul, bukan Head',
    /admin modul Marketing<\/b>, jadi bisa membuka/.test(wA.document.getElementById('view').innerHTML));
wA.eval("(function(){ const b=document.querySelector('#pfo_seg button[data-pic=\"p1\"]'); b.click(); })()");
cek('...dan boleh membuka capaian rekan', body(wA).indexOf(acuan.rp(acuan.agg.p1.real)) > -1);

/* Turunan role di dalam modul juga berlaku — dan HARUS, karena role hanya
   diperbarui saat pembacaan roster Office berhasil. Kalau cuma role yang
   diperiksa, admin yang membukanya saat Office diam ikut terkunci; kalau cuma
   adminModules, yang rolenya sudah super_admin tapi sesinya lama ikut terkunci. */
wA = buka('Budi', 'Marketing', { role: 'super_admin' });
wA.eval("go('perfomset')");
cek('role super_admin juga melihat seluruh tim',
    ['Ayu', 'Citra'].every(n => namaSeg(wA).some(t => t.indexOf(n) > -1)), namaSeg(wA).join(' | '));

/* Yang bukan keduanya tetap terkunci — pengecualiannya tidak boleh melebar. */
wA = buka('Budi', 'Marketing', { adminModules: ['event'] });
wA.eval("go('perfomset')");
cek('admin modul LAIN tidak ikut terbuka',
    !namaSeg(wA).some(t => /Ayu|Citra/.test(t)), namaSeg(wA).join(' | '));

/* ---------- 3. tidak menyalin rumus ---------- */
console.log('\n-- angkanya dari aset, bukan salinan --');
const src = fs.readFileSync(path.join(ROOT, 'deploy/marketing/index.html'), 'utf8');
cek('modul Marketing memuat asetnya', /src="\.\.\/assets\/performa-bonus\.js"/.test(src));
cek('...dan tidak menyalin satu rumus pun',
    src.indexOf('function bonusMarketing(') < 0 && src.indexOf('function pbAgregasi(') < 0
    && src.indexOf('const MK_S2=') < 0);
cek('halamannya memanggil penghitung bersama', /pbAgregasi\(PFO\.data\.days/.test(src)
    && /bonusMarketing\(list, agg\)/.test(src));
cek('penentu Head-nya juga bersama, bukan ditulis ulang',
    /pbHead\(\{ officeUserId: ME\.id, name: ME\.name \}\)/.test(src)
    && src.indexOf('function pbHead(') < 0);
/* Yang diperiksa: modul ini tidak menulis pencocok keterangan-nya sendiri.
   Kata 'head' saja tidak bisa dipakai sebagai penanda — `fl.t==='head'` (tipe
   field formulir) sudah ada di berkas ini sejak lama dan tidak ada hubungannya.
   Asersi yang menabraknya akan dimatikan orang berikutnya karena dianggap
   rewel, dan bersamanya hilang pemeriksaan yang sungguhan. */
cek('...dan tidak memakai kata head sebagai penanda sendiri',
    !/keterangan|jabatan/.test(src.slice(Math.max(0, src.indexOf("t==='head'") - 200), src.indexOf("t==='head'") + 60)));
/* Endpoint sempit, bukan getAll — getAll memulangkan seluruh blob omset.
   Diperiksa DI DALAM blok halaman ini saja: modul Marketing punya getAll-nya
   sendiri ke api.php miliknya, dan itu urusan lain. */
/* Batas bawahnya penutup pfoPasangKendali(), fungsi terakhir blok ini. Dulu
   memakai `function renderPerformance(` — halaman itu DICABUT 7 September
   2026, jadi indexOf memulangkan -1 dan potongannya diam-diam membentang
   sampai akhir berkas: pemeriksaan "tidak memanggil getAll" lalu menuduh
   halaman ini atas getAll milik modul, yang tidak ada hubungannya. Jangkar
   yang hilang tidak menggagalkan slice(), ia cuma mengubah artinya. */
const awalPFO = src.indexOf('const PFO_API');
const akhirPFO = src.indexOf('\n}', src.indexOf('function pfoPasangKendali('));
cek('blok halaman ini bisa dipotong dari sumber', awalPFO > -1 && akhirPFO > awalPFO);
const blokPFO = src.slice(awalPFO, akhirPFO);
cek('datanya lewat endpoint sempit', /action:'performaDivisi'/.test(blokPFO));
cek('...dan halaman ini TIDAK memanggil getAll kompas',
    blokPFO.indexOf('getAll') < 0, 'getAll memulangkan seluruh blob omset');
cek('...lewat kompas-api, bukan api modul ini',
    /PFO_API = '\.\.\/kompas-api-mysql\/api\.php'/.test(blokPFO));

/* ---------- 4. memuat sendiri, tanpa tombol ---------- */
(async function () {
  console.log('\n-- memuat sendiri (tanpa tombol Tampilkan) --');
  const src4 = fs.readFileSync(path.join(ROOT, 'deploy/marketing/index.html'), 'utf8');
  const blok = src4.slice(src4.indexOf('const PFO_API'), src4.indexOf('function renderPerformance('));
  cek('tombol Tampilkan sudah tidak digambar', blok.indexOf("id=\"pfo_muat\"") < 0);
  cek('...dan tidak ada lagi kalimat yang menyuruh menekannya',
      blok.indexOf('tekan <b>Tampilkan</b>') < 0);

  const { w: w4, jejak } = bukaKosong('Budi', 'Marketing');
  w4.eval("go('perfomset')");
  cek('halaman langsung memuat sendiri', jejak.n === 1, 'permintaan terkirim: ' + jejak.n);
  await tunggu(120);
  cek('...dan datanya tergambar tanpa satu klik pun',
      body(w4).indexOf(acuan.rp(acuan.agg.p2.real)) > -1, body(w4).slice(0, 80));

  /* PERPUTARAN: pfoMuat() memanggil render() di ujungnya, dan render() itulah
     yang memicu pemuatan. Tanpa penanda `dimuat`, keduanya saling memanggil
     tanpa henti — yang terlihat bukan galat, melainkan halaman berkedip sambil
     menghujani server. Yang diperiksa ANGKANYA, bukan tampilannya. */
  const n1 = jejak.n;
  w4.eval("go('perfomset');"); w4.eval("go('perfomset');");
  await tunggu(120);
  sama('menggambar ulang TIDAK memicu permintaan baru', jejak.n, n1);

  w4.eval("(function(){ const m=document.getElementById('pfo_bulan'); m.value='2026-08'; m.onchange(); })()");
  await tunggu(120);
  sama('ganti bulan memicu tepat SATU permintaan', jejak.n, n1 + 1);
  sama('...dan bulannya benar-benar berpindah', w4.eval('PFO.bulan'), '2026-08');

  /* ---------- 5. tampilannya, dan yang tidak boleh ikut bergeser ----------
     Kartu halaman ini digambar aset yang lahir untuk panel Finance, jadi
     kelasnya (.stat .lab/.val/.foot, .stat.accent, tabel berkepala kapital)
     harus disediakan modul ini. Yang dijaga: DIKURUNG. Ditulis global, .stat,
     th, td, dan .seg di 20-an halaman lain modul ini ikut bergeser — halaman
     baru tidak boleh mengubah tampilan halaman yang sudah jalan. */
  console.log('\n-- tampilan disamakan dengan panel Finance --');
  const wrap = w4.document.getElementById('pfo-wrap');
  cek('seluruh isinya dikurung #pfo-wrap', !!wrap);
  cek('...termasuk keadaan memuat & galat', (src4.match(/bungkus\(kepala/g) || []).length >= 3,
      'sebagian keadaan tidak dibungkus — layarnya berpindah gaya waktu datanya datang');
  ['.stat .lab', '.stat .val', '.stat .foot', '.stat.accent', 'th{', 'td{', '.seg button.active']
    .forEach(k => cek('menyediakan ' + k, src4.indexOf('#pfo-wrap ' + k) > -1 || src4.indexOf('#pfo-wrap ' + k.replace('{', '')) > -1));
  /* Tiap aturan yang ditambahkan untuk halaman ini WAJIB berawalan #pfo-wrap.
     Ini yang akan menangkap aturan BERIKUTNYA yang ditulis global. */
  /* KOMENTAR DIBUANG DULU. Penjelasan di atas aturannya menyebut nama kelas
     apa adanya (".stat dengan anak .lab/.val/.foot"), dan baris komentar yang
     kebetulan diawali titik akan terbaca sebagai aturan global — pemindai yang
     merah untuk komentar akan dimatikan orang berikutnya, dan bersamanya
     hilang pemeriksaan yang sungguhan. Aturan yang sama dengan
     tools/uji-tanpa-target.js. */
  const blokCss = src4.slice(src4.indexOf('/* ---- Performa Omset & Bonus: tampilan disamakan'),
                             src4.indexOf('#pfo-wrap .btn-sm'))
    .replace(/\/\*[\s\S]*?\*\//g, '');
  const bocor = blokCss.split('\n')
    .filter(b => /^[.#a-z]/i.test(b.trim()) && b.indexOf('#pfo-wrap') < 0);
  cek('tidak ada aturan yang lolos jadi global', bocor.length === 0, bocor.join(' | '));
  cek('kartu aset benar-benar memakai kelas itu',
      /class="stat accent"|class="stat "/.test(body(w4)) || /class="stat/.test(body(w4)));

  console.log('\n' + ok + ' OK, ' + gagal + ' GAGAL');
  process.exit(gagal ? 1 : 0);
})();
