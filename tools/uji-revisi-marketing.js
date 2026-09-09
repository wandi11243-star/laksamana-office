/* uji-revisi-marketing.js — tiga revisi modul Marketing (7 September 2026)
 *
 *   node tools/uji-revisi-marketing.js
 *   JSDOM_PATH=/jalur/ke/jsdom node tools/uji-revisi-marketing.js
 *
 * 1. Request Design & Video dibagi kategori selesai/belum, bawaannya YANG BELUM.
 * 2. Reporting jadi per bulan, barisnya PER KATEGORI (bukan per tanggal —
 *    permintaan user 7 September 2026), plus total sebulan.
 * 3. Halaman Marketing Performance DICABUT.
 *
 * Yang ketiga diuji dengan cara yang sudah dibayar di Ranking PIC (lihat
 * CLAUDE.md): rujukan sebuah halaman tersebar di ENAM tempat — menu, matriks
 * hak akses, daftar nav role, TITLES, peta router, dan penggambarnya. Satu
 * rujukan yang tertinggal untuk fungsi yang sudah dibuang adalah ReferenceError,
 * dan gejalanya LAYAR PUTIH tanpa satu kata pun yang menyebut sebabnya.
 * Komentar dibuang sebelum mencari: sejarah kenapa sesuatu dicabut justru harus
 * tetap boleh menyebut namanya; yang dilarang PEMAKAIANNYA.
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

const SRC = fs.readFileSync(path.join(ROOT, 'deploy/marketing/index.html'), 'utf8');
const KODE = SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');

function buka() {
  const html = SRC
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
        id: 'u1', name: 'Ayu', modules: ['marketing'], adminModules: ['marketing'],
        token: 't', expiry: Date.now() + 86400000 }));
      w.fetch = () => new Promise(() => {});
      w.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
      w.print = () => {}; w.confirm = () => true;
      w.Chart = class { destroy() {} update() {} };
      w.HTMLCanvasElement.prototype.getContext = () => ({});
    } });
  const w = dom.window;
  w.eval('S = normalizeState(seed());');
  w.eval(`
    S.users = [{ id:'u1', name:'Ayu', jabatan:'Marketing', div:'Marketing', role:'super_admin' }];
    ME = S.users[0];
  `);
  return w;
}
const view = w => w.document.getElementById('view').innerHTML;

/* ---------- 1. Request Design & Video ---------- */
console.log('-- Request Design & Video: kategori selesai/belum --');
let w = buka();
/* Dua request BELUM selesai, satu SELESAI, satu DIBATALKAN. drSelesai() membaca
   drProg() (kabar dari modul Konten), jadi progresnya yang disetel — bukan
   field di requestnya, supaya yang diuji jalur yang sungguhan. */
w.eval(`
  S.designreqs = [
    { id:'d1', jenis:'design', judul:'Belum A', brief:'', acara:'', deadline:'2026-09-10' },
    { id:'d2', jenis:'edit',   judul:'Belum B', brief:'', acara:'', deadline:'2026-09-11' },
    { id:'d3', jenis:'design', judul:'Sudah C', brief:'', acara:'', deadline:'2026-09-01' },
    { id:'d4', jenis:'design', judul:'Batal D', brief:'', acara:'', deadline:'2026-09-02', batalAt: Date.now() }
  ];
  S.designreqprog = { d3: { status:'done' } };
`);
/* drSelesai() membaca drProg(), yang membaca S.designreqprog — kabar kemajuan
   yang ditarik dari modul Konten. Diperiksa DULU bahwa wadahnya memang itu:
   kalau namanya berbeda, seluruh request terbaca "belum selesai" dan tab Belum
   Selesai akan lulus karena sebab yang salah. */
cek('progres dari modul Konten bisa disetel di uji',
    w.eval("!!(S.designreqprog && S.designreqprog.d3) && drSelesai({id:'d3'})===true"),
    'wadah S.designreqprog tidak dikenali drSelesai()');
sama('bawaannya kategori BELUM SELESAI', w.eval('drFilter.status'), 'open');
w.eval("go('designreq')");
let v = view(w);
cek('tab kategorinya digambar', /Belum Selesai \(/.test(v), v.slice(0, 120));
cek('...berikut angka tiap kategori', /Sudah Selesai \(\d+\)/.test(v) && /Dibatalkan \(\d+\)/.test(v));
cek('tab yang aktif Belum Selesai',
    /<button class="on"[^>]*onclick="drSetKat\('open'\)"/.test(v), 'tab aktifnya bukan yang belum selesai');
const baris = () => Array.from(w.document.querySelectorAll('#dr-table tbody tr')).map(r => r.textContent);
cek('yang tampil hanya yang BELUM selesai',
    baris().length === 2 && baris().every(t => /Belum/.test(t)), baris().join(' | '));
cek('yang sudah selesai TIDAK ikut', !baris().some(t => /Sudah C/.test(t)));
cek('yang dibatalkan juga tidak', !baris().some(t => /Batal D/.test(t)));

w.eval("drSetKat('done')");
cek('tab Sudah Selesai memajang yang selesai',
    baris().length === 1 && /Sudah C/.test(baris()[0]), baris().join(' | '));
w.eval("drSetKat('')");
sama('tab Semua memajang semuanya', baris().length, 4);

/* Angka di tab dihitung TANPA tapis status sendiri — kalau ikut, tab yang tidak
   dipilih selalu menulis (0), dan nol membaca sebagai "tidak ada apa-apa di
   sana" alih-alih "kamu sedang melihat kategori lain". */
w.eval("drSetKat('open')");
v = view(w);
cek('angka tab lain tidak nol saat kategori lain dipilih',
    /Sudah Selesai \(1\)/.test(v) && /Dibatalkan \(1\)/.test(v), 'angkanya ikut tersaring status');
/* Tapis LAIN tetap berlaku: angkanya harus menjanjikan apa yang benar-benar
   muncul kalau tabnya ditekan. */
w.eval("drFilter.jenis='edit'; go('designreq')");
v = view(w);
cek('tapis jenis IKUT mengecilkan angka tabnya',
    /Belum Selesai \(1\)/.test(v) && /Sudah Selesai \(0\)/.test(v), 'angka tab mengabaikan tapis jenis');

/* ---------- 2. Reporting per bulan, per KATEGORI ---------- */
/* Data ujinya dirancang supaya tiap kesalahan punya tempat untuk muncul:
   - dua event Corporate di TANGGAL YANG SAMA (kalau masih dikelompokkan per
     tanggal, barisnya tetap 1 dan jumlahnya tetap 2 — jadi jumlah baris saja
     tidak cukup membedakan; karena itu ada juga
   - satu Wedding di tanggal yang SAMA dengan salah satunya: per tanggal ia
     akan melebur ke baris yang sama, per kategori ia berdiri sendiri;
   - satu event ber-jenis 'Lainnya' berikut detail.jenisLain, yang WAJIB
     terbaca sebagai ketikannya lewat jenisEvent();
   - satu event tanpa jenis sama sekali, yang tidak boleh dibuang;
   - satu peluang yang belum closing dan satu event bulan lain. */
console.log('\n-- Reporting: per bulan, per kategori --');
w = buka();
w.eval(`
  S.events = [
    { id:'e1', nama:'A', status:'Deal',       tanggal:'2026-09-03', jenis:'Corporate Event', detail:{} },
    { id:'e2', nama:'B', status:'Event Done', tanggal:'2026-09-03', jenis:'Corporate Event', detail:{} },
    { id:'e3', nama:'C', status:'Confirmed',  tanggal:'2026-09-03', jenis:'Wedding',         detail:{} },
    { id:'e4', nama:'D', status:'Deal',       tanggal:'2026-09-20', jenis:'Lainnya',         detail:{jenisLain:'Arisan RT'} },
    { id:'e5', nama:'E', status:'Deal',       tanggal:'2026-09-21', jenis:'',                detail:{} },
    { id:'e6', nama:'F', status:'Lead',       tanggal:'2026-09-05', jenis:'Wedding',         detail:{} },
    { id:'e7', nama:'G', status:'Deal',       tanggal:'2026-08-15', jenis:'Birthday',        detail:{} }
  ];
  repBulan='2026-09';
`);
w.eval("go('reports')");
v = view(w);
cek('ada pemilih bulan', /type="month"/.test(v));
cek('bulannya dari tanggal ACARA, bukan tanggal input',
    /tanggal acaranya<\/b>, bukan tanggal input/.test(v));
cek('kolom pertamanya KATEGORI, bukan Tanggal',
    /<th>Kategori<\/th>/.test(v) && !/<th>Tanggal<\/th>/.test(v), 'masih dikelompokkan per tanggal');
const rows = () => Array.from(w.document.querySelectorAll('#view tbody tr'))
  .map(r => Array.from(r.querySelectorAll('td')).map(td => td.textContent.trim())).filter(x => x.length === 3);
const kolKat = () => rows().map(r => r[0]);
sama('satu baris per kategori', rows().length, 4);
cek('dua event sejenis digabung jadi satu baris',
    rows().filter(r => r[0] === 'Corporate Event').length === 1 &&
    rows().find(r => r[0] === 'Corporate Event')[1] === '2', kolKat().join(' | '));
cek('...dan event lain di TANGGAL YANG SAMA tidak ikut melebur ke sana',
    rows().find(r => r[0] === 'Wedding') && rows().find(r => r[0] === 'Wedding')[1] === '1',
    kolKat().join(' | '));
cek('"Lainnya" dibaca sebagai ketikannya (jenisEvent), bukan mentah',
    kolKat().indexOf('Arisan RT') > -1 && kolKat().indexOf('Lainnya') < 0, kolKat().join(' | '));
cek('event tanpa jenis TIDAK dibuang & tidak dijatuhkan ke kategori pertama',
    kolKat().indexOf('(tanpa jenis)') > -1, kolKat().join(' | '));
cek('peluang yang belum closing TIDAK dihitung',
    rows().find(r => r[0] === 'Wedding')[1] === '1', 'Lead ikut terhitung');
cek('bulan lain tidak ikut', kolKat().indexOf('Birthday') < 0, kolKat().join(' | '));
cek('ada baris TOTAL di dalam tabelnya', /TOTAL/.test(v), 'totalnya cuma di kartu atas');
cek('kartu ringkas menyebut jumlah event bulan itu', />5</.test(v), 'jumlah event bulan tidak 5');
cek('...dan jumlah KATEGORI, bukan jumlah hari', /4 kategori/.test(v), 'kartunya masih menghitung hari');

/* Urutannya dari omset TERBESAR — itu yang menjawab "dari kategori mana
   omsetnya datang". Nilainya dibuat berbeda supaya urutannya punya arti; kalau
   eventFinance() memulangkan nol untuk semuanya, pemeriksaan ini melewat
   dengan jelas alih-alih lulus karena kebetulan. */
w.eval(`
  S.events[0].detail.sewaVenue =  50000000;   // Corporate
  S.events[1].detail.sewaVenue =  50000000;   // Corporate
  S.events[2].detail.sewaVenue = 300000000;   // Wedding — harus naik ke atas
  S.events[3].detail.sewaVenue =   9000000;   // Arisan RT
  go('reports');
`);
const nilai = rows().map(r => Number(String(r[2]).replace(/[^0-9]/g,'')));
/* Tanpa ini, pemeriksaan urutan di bawah lulus untuk deret NOL — dan deret nol
   memang selalu tidak menaik. Angkanya harus benar-benar sampai ke layar. */
cek('angkanya benar-benar sampai ke tabel', nilai.some(x => x > 0), nilai.join(' , '));
cek('diurutkan dari omset terbesar',
    nilai.every((x,i) => i === 0 || nilai[i-1] >= x), nilai.join(' > '));
cek('...dan yang teratas memang kategori bernilai terbesar',
    kolKat()[0] === 'Wedding', kolKat().join(' | '));

w.eval("repSetBulan('2026-08')");
sama('ganti bulan mengganti isinya', rows().length, 1);
w.eval("repSetBulan('2026-01')");
cek('bulan tanpa event menjelaskan sebabnya, bukan tabel kosong',
    /Belum ada event closing/.test(view(w)), view(w).slice(0, 120));

/* ---------- 3. Marketing Performance dicabut ---------- */
console.log('\n-- Marketing Performance dicabut --');
[['renderPerformance(', 'penggambarnya'],
 ['function muatPerfBD(', 'pemuat data kompas-nya'],
 ['KOL_LEADERBOARD', 'tabel leaderboard-nya'],
 ['perfPeriode', 'variabel periodenya'],
 ['PERF_BD', 'wadah datanya'],
 ["KOMPAS_API", 'alamat kompas yang hanya dipakai olehnya']
].forEach(([n, apa]) => cek('tidak ada lagi PEMAKAIAN ' + apa, KODE.indexOf(n) < 0, n));
cek("entri menu 'performance' dicabut", KODE.indexOf("{k:'performance'") < 0);
cek('judul halamannya dicabut', KODE.indexOf("performance:['Marketing Performance'") < 0);
cek('peta router-nya dicabut', KODE.indexOf('performance:renderPerformance') < 0);
cek('keempat daftar nav role tidak menyebutnya lagi', KODE.indexOf("'performance',") < 0);
cek('VIEW_TERBUKA jadi kosong', /const VIEW_TERBUKA=\[\]/.test(KODE));
cek("...dan 'perfomset' TIDAK dimasukkan ke sana",
    KODE.indexOf("VIEW_TERBUKA=['perfomset']") < 0,
    'halaman omset per orang tidak boleh terbuka untuk siapa pun pemegang modul');
cek('sejarahnya tetap boleh disebut di komentar', SRC.indexOf('Marketing Performance') > -1);
/* Halaman penggantinya harus tetap ada — mencabut yang lama tanpa yang baru
   berarti tim marketing kehilangan papan performanya sama sekali. */
cek('penggantinya (Performa Omset & Bonus) masih terpasang',
    KODE.indexOf("{k:'perfomset'") > -1 && KODE.indexOf('perfomset:renderPerformaOmset') > -1);
w = buka();
w.eval("go('perfomset')");
cek('...dan halamannya masih bisa dibuka', !!w.document.getElementById('pfo-wrap'));
w.eval("go('performance')");
cek('alamat lama tidak menjatuhkan halaman', view(w).length > 200, 'layar kosong / ReferenceError');

/* ---------- PANEL "MULAI DINGIN" DICABUT (permintaan user 9 Sep 2026) ------
   Dicabut dari Dashboard berikut seluruh pembantunya. Yang diperiksa
   PEMAKAIANNYA, bukan namanya: sejarah kenapa sesuatu dicabut justru harus
   tetap boleh menyebutnya, dan pemindai yang merah untuk komentar akan
   dimatikan orang berikutnya.

   Satu rujukan yang tertinggal untuk fungsi yang sudah dibuang adalah
   ReferenceError, dan gejalanya LAYAR PUTIH tanpa satu kata pun yang menyebut
   sebabnya \u2014 di Dashboard, halaman pertama yang dibuka tiap pagi. */
console.log('\n-- panel Mulai Dingin dicabut --');
['panelPerluDigarap', 'isStale', 'daysSinceFU', 'lastFUDate'].forEach(function (n) {
  cek('tidak ada lagi yang memakai ' + n + '()', KODE.indexOf(n) < 0,
    'sisa rujukan: ' + KODE.split(n).length + 'x');
});
cek('judul panelnya hilang dari Dashboard', KODE.indexOf('>Mulai Dingin<') < 0);
/* Barisnya di Pengaturan ikut dicabut: setelan yang tidak dibaca satu pun
   perhitungan adalah setelan mati, dan keterangannya menjanjikan panel yang
   sudah tidak ada \u2014 janji yang tidak ditepati tiap kali dibaca. */
cek('kotak isian Ambang Mulai Dingin ikut dicabut', KODE.indexOf('set_stale') < 0);
/* Angkanya SENGAJA dibiarkan hidup di data: menghapus yang sudah tersimpan
   demi kerapian layar bukan pertukaran yang baik (aturan yang sama dengan
   companyMonthlyTarget saat Target dicabut). */
cek('settings.staleDays tetap ada di bentuk data', SRC.indexOf('staleDays:7') > -1,
  'menghapus angka tersimpan bukan bagian dari permintaannya');
/* Dashboard tetap tergambar utuh sesudahnya \u2014 "tidak melempar" saja tidak
   cukup, karena penggambar yang melempar meninggalkan halaman SEBELUMNYA di
   layar dan itu terbaca sebagai halaman yang baik-baik saja. */
{
  const w = buka();
  w.eval("go('dashboard')");
  cek('Dashboard tetap tergambar sesudah panelnya dicabut', view(w).length > 400);
  cek('...dan tidak lagi menyebut Mulai Dingin', view(w).indexOf('Mulai Dingin') < 0);
}

console.log('\n' + ok + ' OK, ' + gagal + ' GAGAL');
process.exit(gagal ? 1 : 0);
