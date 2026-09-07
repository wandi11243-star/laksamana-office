/* uji-performa-kas-boot.js — Performa Marketing & Event di panel Kas Kecil
 *
 *   node tools/uji-performa-kas-boot.js
 *   JSDOM_PATH=/jalur/ke/jsdom node tools/uji-performa-kas-boot.js
 *
 * LUBANG YANG DITUTUP UJI INI, dan sebabnya layak diingat.
 *
 * `smoke-modul.js` TIDAK PERNAH menyentuh deploy/finance/kas/ — daftarnya cuma
 * memuat `finance`, yaitu halaman PEMILIH panel yang tidak berisi aplikasi apa
 * pun. Uji bonus (uji-bonus-marketing / uji-bonus-event) menjalankan
 * deploy/assets/performa-bonus.js BERDIRI SENDIRI. Jadi sampai 8 September 2026
 * tidak ada satu pun uji yang mem-boot halaman ini lalu memanggil
 * viewPerforma() — dan di celah itulah bug produksi ini hidup:
 *
 *   viewPerforma() -> kartuApprovalCompliment() -> compListPemberi()
 *                  -> compIsPemberi() -> compCocok() -> pbCompCocok   TIDAK ADA
 *
 * `pbCompCocok` hidup di dalam IIFE aset dan tidak pernah diekspor ke window,
 * sementara finance/kas mendelegasikan ke sana. Akibatnya Performa Marketing
 * DAN Performa Event mati total — tapi HANYA pada periode yang punya minimal
 * satu baris compliment, karena compListPemberi() menyaring daftar kosong tanpa
 * memanggil apa pun. Data uji tanpa compliment lolos; produksi dengan ratusan
 * baris compliment langsung mati.
 *
 * GEJALANYA BUKAN PESAN GALAT. el.innerHTML ada di UJUNG viewPerforma(), jadi
 * yang tertinggal di layar adalah HALAMAN SEBELUMNYA: judul sudah berbunyi
 * "Performa Event" sementara badannya masih Performa Kasir lengkap dengan
 * kartu bonus kasir dan Riwayat OFF/Masuk. Yang melaporkannya menyebut
 * "halamannya tidak bisa dibuka", dan tidak ada satu pun tanda yang menunjuk ke
 * baris yang salah.
 *
 * Karena itu yang dijaga di sini BUKAN nama pbCompCocok, melainkan
 * INVARIANNYA: tiap nama berawalan pb / PB_ yang dipanggil salah satu tuan
 * rumah WAJIB ada di daftar ekspor aset. Itu yang akan menangkap delegasi
 * BERIKUTNYA yang lupa diekspor, bukan daftar nama yang harus diingat orang.
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

const ASET = fs.readFileSync(path.join(ROOT, 'deploy/assets/performa-bonus.js'), 'utf8');
const TUAN_RUMAH = [
  'deploy/finance/kas/index.html',
  'deploy/marketing/index.html',
  'deploy/event/index.html',
];

/* ---------- 1. INVARIAN EKSPOR ----------
   Komentar dibuang dulu: penjelasan di atas sebuah delegasi menyebut nama
   fungsinya apa adanya, dan pemindai yang merah untuk komentar akan dimatikan
   orang berikutnya — bersamanya hilang pemeriksaan yang sungguhan. Aturan yang
   sama dengan tools/uji-tanpa-target.js. */
console.log('-- tiap delegasi ke aset benar-benar diekspor --');
const EKSPOR = new Set([...ASET.matchAll(/^window\.([A-Za-z_0-9]+)\s*=/gm)].map(m => m[1]));
cek('daftar ekspor asetnya terbaca', EKSPOR.size > 5, EKSPOR.size + ' nama');
TUAN_RUMAH.forEach(f => {
  const src = fs.readFileSync(path.join(ROOT, f), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const dipakai = [...new Set([...src.matchAll(/\b(pb[A-Z][A-Za-z0-9_]*|PB_[A-Z_0-9]+)\s*\(/g)].map(m => m[1]))];
  const hilang = dipakai.filter(n => !EKSPOR.has(n));
  cek(f + ' — ' + dipakai.length + ' delegasi, semuanya diekspor',
      hilang.length === 0, 'TIDAK diekspor: ' + hilang.join(', '));
});
/* Regresi 8 September 2026, disebut namanya supaya yang membaca log tahu
   pemeriksaan di atas pernah menangkap apa. */
cek('pbCompCocok diekspor (regresi 8 Sep 2026)', EKSPOR.has('pbCompCocok'),
    'Performa Marketing & Event mati pada periode yang ada compliment-nya');

/* ---------- 2. HALAMANNYA BENAR-BENAR DIGAMBAR ---------- */
function buka() {
  const html = fs.readFileSync(path.join(ROOT, 'deploy/finance/kas/index.html'), 'utf8')
    /* Aset disisipkan inline menggantikan tagnya — jsdom tidak mengambil skrip
       eksternal. Kalau ikut dibuang seperti skrip CDN, viewPerforma() melempar
       di pbAgregasi() dan ujinya gagal karena sebab yang bukan yang diuji. */
    .replace(/<script[^>]*\ssrc="[^"]*performa-bonus\.js"[^>]*><\/script>/i,
      '<script>' + ASET + '</script>')
    .replace(/<script[^>]*\ssrc=[^>]*><\/script>/gi, '');
  const vc = new VirtualConsole();
  vc.on('jsdomError', e => {
    const t = String((e && e.detail && e.detail.stack) || (e && e.message) || e);
    if (!/Not implemented|Could not parse CSS/.test(t)) console.log('  !! ' + t.split('\n')[0]);
  });
  const dom = new JSDOM(html, { virtualConsole: vc, runScripts: 'dangerously',
    url: 'https://team.laksamanamuda.id/finance/kas/',
    beforeParse(w) {
      w.localStorage.setItem('lm_session', JSON.stringify({ id: 'u1', userId: 'u1',
        name: 'Uji', modules: ['finance'], adminModules: ['finance'],
        token: 't', expiry: Date.now() + 86400000 }));
      w.fetch = () => new Promise(() => {});
      w.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
      w.print = () => {}; w.confirm = () => true; w.alert = () => {};
      w.Chart = class { destroy() {} update() {} };
      w.HTMLCanvasElement.prototype.getContext = () => ({});
    } });
  return dom.window;
}

/* DATA UJINYA WAJIB PUNYA COMPLIMENT. Tanpa itu jalur yang rusak tidak pernah
   dijalankan — compListPemberi() menyaring daftar kosong tanpa memanggil
   apa pun, dan uji ini akan hijau untuk halaman yang mati di produksi. Itu
   persis kesalahan yang melahirkan bug-nya. */
const EMP = { marketing: [{ id: 'p1', name: 'Ayu', officeUserId: 'u1' }],
              event:     [{ id: 'p2', name: 'Budi', officeUserId: 'u2' }],
              kasir:     [{ id: 'k1', name: 'Cici', officeUserId: 'u3' }] };
const DAILY = [{ date: '2026-09-03', food: 10000000, bev: 0, lainnya: 0, discount: 0,
  tax: 1000000, service_charge: 500000,
  bd: { marketing: [{ picId: 'p1', eventName: 'Acara M', amount: 5000000, tax: 500000, service: 250000 }],
        event:     [{ picId: 'p2', eventName: 'Acara E', amount: 8000000 }] } }];
const COMPS = [
  { id: 'c1', date: '2026-09-03', nominal: 200000, subTotal: 200000,
    pemberiDiv: 'marketing', pemberiOfficeId: 'u1', pemberiNama: 'Ayu', pemberiName: 'Ayu' },
  { id: 'c2', date: '2026-09-03', nominal: 150000, subTotal: 150000,
    pemberiDiv: 'event', pemberiOfficeId: 'u2', pemberiNama: 'Budi', pemberiName: 'Budi',
    pemberiStatus: 'potong' },
];

console.log('\n-- viewPerforma digambar, dengan compliment di periodenya --');
const w = buka();
w.eval('DB=normalizeDB({});');
w.eval('DB.employees=' + JSON.stringify(EMP) + ';');
w.eval('DB.daily=' + JSON.stringify(DAILY) + ';');
w.eval('DB.compliments=' + JSON.stringify(COMPS) + ';');
w.eval("PERIOD='2026-09'; VIEWMODE='bulan';");
cek('data ujinya memang punya compliment di periode itu',
    w.eval('compsRentang().length') === COMPS.length,
    'jalur yang rusak tidak akan pernah dijalankan');

['marketing', 'event'].forEach(divi => {
  const el = w.document.getElementById('app-view');
  el.innerHTML = '<div id="jejak-halaman-sebelumnya">SISA</div>';
  let lempar = '';
  try { w.eval("viewPerforma('" + divi + "')"); }
  catch (e) { lempar = String((e && e.message) || e); }
  cek('viewPerforma(' + divi + ') tidak melempar', !lempar, lempar);
  /* Yang diperiksa BUKAN "tidak melempar" saja: kalau penggambarnya melempar,
     el.innerHTML di ujungnya tidak pernah jalan dan sisa halaman sebelumnya
     tetap di layar. Penanda ini yang membedakan "halaman digambar" dari
     "halaman gagal tapi layarnya kelihatan terisi" — persis gejala yang
     dilaporkan user. */
  const isi = w.document.getElementById('app-view').innerHTML;
  cek('...dan benar-benar MENGGANTI isi layar, bukan meninggalkan sisa',
      isi.indexOf('jejak-halaman-sebelumnya') < 0, 'layar masih memuat halaman sebelumnya');
  cek('...isinya halaman Performa yang benar',
      isi.indexOf('Report Achievement') > -1 && isi.indexOf('Daftar Event') > -1,
      isi.slice(0, 100));
  cek('...kartu persetujuan compliment ikut tergambar',
      isi.indexOf('Persetujuan Potongan Compliment') > -1,
      'kartu inilah yang memanggil jalur pbCompCocok');
});

/* Kasir tidak ikut rusak, tapi ia yang tergambar sebelum orang menekan Event —
   jadi ia yang tertinggal di layar. Diperiksa supaya perbaikan di sini tidak
   diam-diam menjatuhkannya. */
console.log('\n-- Performa Kasir tetap utuh --');
let lemparKasir = '';
try { w.eval('viewKasir()'); } catch (e) { lemparKasir = String((e && e.message) || e); }
cek('viewKasir() tidak melempar', !lemparKasir, lemparKasir);

console.log('\n' + ok + ' OK, ' + gagal + ' GAGAL');
process.exit(gagal ? 1 : 0);
