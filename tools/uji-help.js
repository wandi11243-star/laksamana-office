/* uji-help.js — modul Help Center (19 September 2026)
 *
 *   node tools/uji-help.js
 *   JSDOM_PATH=/jalur/ke/jsdom node tools/uji-help.js
 *
 * BERKAS UJI PERTAMA untuk modul Help. `smoke-modul.js` tidak memuatnya sama
 * sekali, dan kalaupun dimuat ia cuma akan melaporkan halamannya tidak
 * melempar — sementara SELURUH guna modul ini ada di penyaring hak aksesnya,
 * yang kegagalannya justru TIDAK terlihat dari layar: bab yang bocor tampil
 * rapi persis seperti bab yang memang boleh dibaca.
 *
 * TIGA HAL YANG DIJAGA, dan ketiganya gagal diam-diam kalau lepas:
 *
 *   1. INVARIAN REGISTRI. Tiap kunci izin di BRANCHES (deploy/index.html)
 *      wajib punya babnya di daftar.js, dan sebaliknya. Yang dijaga BUKAN
 *      daftar nama di berkas ini melainkan kecocokan kedua sumbernya — itu
 *      yang akan menangkap modul BERIKUTNYA yang ditambahkan ke portal tanpa
 *      babnya di Help, bukan daftar yang harus diingat orang.
 *
 *   2. PENYARING HAK AKSES. Bab modul yang kuncinya tidak dipegang tidak boleh
 *      digambar, DAN tidak boleh bisa dibuka lewat alamatnya langsung. Yang
 *      kedua yang mudah terlewat: tidak menggambar tautan bukan penjagaan,
 *      karena hash bisa diketik sendiri di bilah alamat.
 *
 *   3. HELP TIDAK BOLEH JADI APLIKASI KEDUA. Berkas panduan tidak boleh memuat
 *      markup interaktif. Begitu satu panduan menyalin potongan UI modul,
 *      tampilannya akan menyimpang dari yang asli dalam sebulan dan orang
 *      mengikuti layar yang salah.
 *
 * ASERSI DIJEPIT KE WADAHNYA (#nav / #isi), TIDAK MENYAPU document.body.
 * Skrip mesin Help hidup di dalam <body>, jadi asersi yang membaca seluruh
 * badan halaman akan cocok dengan KODE dan KOMENTARNYA sendiri — bentuk asersi
 * hampa yang di repo ini sudah berkali-kali meloloskan mutasi.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const HELP = path.join(ROOT, 'deploy', 'help');

const JSDOM_MOD = (() => {
  for (const p of [process.env.JSDOM_PATH, path.join(ROOT, 'node_modules', 'jsdom'), 'jsdom']) {
    if (!p) continue;
    try { return require(p); } catch (e) { /* coba berikutnya */ }
  }
  console.error('jsdom tidak ketemu. Pasang `npm i jsdom`, atau setel JSDOM_PATH ke foldernya.');
  process.exit(2);
})();
const { JSDOM, VirtualConsole } = JSDOM_MOD;

let ok = 0, gagal = 0;
const cek  = (n, s, k) => { if (s) { ok++; console.log('  OK   ' + n); } else { gagal++; console.log('  GAGAL ' + n + (k ? '  — ' + k : '')); } };
const sama = (n, d, h) => cek(n, d === h, 'dapat ' + JSON.stringify(d) + ', harusnya ' + JSON.stringify(h));

/* Blok yang gampang melempar dibungkus supaya jatuhnya jadi SATU asersi merah,
   bukan mematikan seluruh berkas uji. Runner mutasi yang berhenti sebelum
   ringkasannya tercetak terbaca "uji tidak selesai", bukan "tertangkap" — dan
   bedanya menentukan apakah sebuah mutasi benar-benar terjaga. */
function aman(nama, fn) {
  try { return fn(); }
  catch (e) { gagal++; console.log('  GAGAL ' + nama + '  — melempar: ' + (e && e.message)); return null; }
}
/* Pasangan `aman` untuk yang memulangkan janji. WAJIB dipakai untuk setiap
   penunggu: `aman` yang sinkron memulangkan janjinya apa adanya, jadi
   penolakannya lolos sebagai unhandled rejection dan Node MENGHENTIKAN
   prosesnya — ringkasan OK/GAGAL tidak pernah tercetak.

   Bedanya menentukan saat menjalankan uji mutasi: mutasi yang membuat sebuah
   penunggu tidak pernah selesai lalu terbaca "ujinya tidak selesai", bukan
   "tertangkap", padahal asersi sebelumnya sudah merah. Empat mutasi pertama
   yang dicoba di berkas ini persis begitu. */
async function amanTunggu(nama, fn) {
  try { return await fn(); }
  catch (e) { gagal++; console.log('  GAGAL ' + nama + '  — ' + (e && e.message)); return null; }
}

/* ===================================================================
   1. INVARIAN REGISTRI: portal vs daftar.js
   =================================================================== */
console.log('\n== Registri modul: portal vs Help ==');

const PORTAL_SRC = fs.readFileSync(path.join(ROOT, 'deploy', 'index.html'), 'utf8');

/* BRANCHES dipotong DARI SUMBERNYA lalu dijalankan, bukan disalin ke sini.
   Salinan akan basi begitu portal berubah, dan uji yang basi menjaga keadaan
   yang sudah tidak ada. Pola yang sama dengan uji-openbill-performa.js. */
function potongArray(nama) {
  const re = new RegExp('const ' + nama + '\\s*=\\s*\\[([\\s\\S]*?)\\n    \\];');
  const m = re.exec(PORTAL_SRC);
  if (!m) throw new Error(nama + ' tidak ketemu di deploy/index.html');
  return new Function('return [' + m[1] + '\n]')();
}

const BRANCHES = aman('BRANCHES terbaca dari portal', () => potongArray('BRANCHES')) || [];
const SUPER    = aman('SUPER_BRANCHES terbaca dari portal', () => potongArray('SUPER_BRANCHES')) || [];
cek('BRANCHES terbaca dari portal', BRANCHES.length > 0, 'kosong');
cek('SUPER_BRANCHES terbaca dari portal', SUPER.length > 0, 'kosong');

/* Kunci izin dihitung dengan aturan yang SAMA dengan appModuleList() di
   portal: `access` kalau ada, kalau tidak `key`-nya sendiri. */
const kunciPortal = [];
BRANCHES.forEach(b => (b.access && b.access.length ? b.access : [b.key]).forEach(k => kunciPortal.push(k)));
SUPER.forEach(b => kunciPortal.push(b.key));

/* daftar.js dijalankan apa adanya, bukan diurai teksnya. */
const jendelaPalsu = {};
new Function('window', fs.readFileSync(path.join(HELP, 'panduan', 'daftar.js'), 'utf8'))(jendelaPalsu);
const MODUL = jendelaPalsu.LM_HELP_MODUL || [];
const GRUP  = jendelaPalsu.LM_HELP_GRUP  || [];
cek('daftar.js mendaftarkan LM_HELP_MODUL', MODUL.length > 0, 'kosong');
cek('daftar.js mendaftarkan LM_HELP_GRUP', GRUP.length > 0, 'kosong');

const izinHelp = MODUL.filter(m => m.izin).map(m => m.izin);

/* `help` sendiri TIDAK punya bab: membaca panduan Help di dalam Help adalah
   satu tingkat yang tidak menjawab apa pun. Bab 'portal' menggantikannya. */
const kurang = kunciPortal.filter(k => k !== 'help' && izinHelp.indexOf(k) < 0);
cek('setiap kunci modul di portal punya babnya di Help', kurang.length === 0,
    'belum ada babnya: ' + kurang.join(', '));

const asing = izinHelp.filter(k => kunciPortal.indexOf(k) < 0);
cek('Help tidak mendaftarkan kunci yang tidak ada di portal', asing.length === 0,
    'tidak dikenal portal: ' + asing.join(', '));

cek('portal mendaftarkan modul help', kunciPortal.indexOf('help') > -1, 'kunci `help` tidak ada di BRANCHES');
const kartuHelp = BRANCHES.filter(b => b.key === 'help')[0];
cek('kartu Help punya href ke ./help/', !!kartuHelp && kartuHelp.href === './help/',
    'href = ' + (kartuHelp && kartuHelp.href));
cek('kartu Help dijaga kunci `help` saja', !!kartuHelp && String(kartuHelp.access) === 'help',
    'access = ' + (kartuHelp && String(kartuHelp.access)));

/* Ikon kartunya wajib ADA di peta ICONS. Ikon yang tidak terdaftar tidak
   melempar apa pun — kartunya cuma berdiri tanpa gambar, dan itu terbaca
   sebagai kartu yang gagal dimuat. */
cek('ikon kartu Help terdaftar di ICONS',
    !!kartuHelp && new RegExp('\\n\\s*' + kartuHelp.icon + ':').test(PORTAL_SRC),
    'ikon `' + (kartuHelp && kartuHelp.icon) + '` tidak ada di ICONS');

/* Tiap bab wajib jatuh ke grup yang memang ada, kalau tidak ia tidak pernah
   digambar: penggambar sidebar menyusuri GRUP, bukan MODUL. */
const kunciGrup = GRUP.map(g => g.key);
const grupSalah = MODUL.filter(m => kunciGrup.indexOf(m.grup) < 0).map(m => m.izin || m.key);
cek('setiap bab memakai grup yang terdaftar', grupSalah.length === 0, 'grupnya tak dikenal: ' + grupSalah.join(', '));

/* Cuma bab bergrup 'panduan' yang boleh tanpa kunci izin. Sebuah bab MODUL
   tanpa izin berarti isinya terbuka untuk siapa pun yang bisa membuka Help —
   bocor yang tidak menimbulkan satu pun galat. */
const tanpaIzin = MODUL.filter(m => !m.izin && m.grup !== 'panduan').map(m => m.key);
cek('hanya bab pengantar yang boleh tanpa kunci izin', tanpaIzin.length === 0,
    'bab modul tanpa izin: ' + tanpaIzin.join(', '));

/* ===================================================================
   2. BERKAS PANDUAN
   =================================================================== */
console.log('\n== Berkas panduan ==');

const DIR_PANDUAN = path.join(HELP, 'panduan');
const berkasPanduan = fs.readdirSync(DIR_PANDUAN).filter(f => f.endsWith('.js') && f !== 'daftar.js');
cek('ada berkas panduan', berkasPanduan.length > 0, 'folder panduan/ kosong');

/* Jenis blok yang dikenal mesin, DIPOTONG dari index.html — bukan ditulis
   ulang di sini. Ditulis ulang, uji ini akan meloloskan panduan yang memakai
   blok yang sudah dicabut dari mesinnya. */
const MESIN = fs.readFileSync(path.join(HELP, 'index.html'), 'utf8');
const blokMesin = (() => {
  const m = /var BLOK = \{([\s\S]*?)\n\};/.exec(MESIN);
  if (!m) return [];
  return (m[1].match(/^\s{2}([a-z]+): function/gm) || []).map(s => s.trim().split(':')[0]);
})();
cek('jenis blok terbaca dari mesin', blokMesin.length >= 5, 'dapat: ' + blokMesin.join(', '));

const isiPanduan = {};
berkasPanduan.forEach(f => {
  const kunciBerkas = f.replace(/\.js$/, '');
  const src = fs.readFileSync(path.join(DIR_PANDUAN, f), 'utf8');

  let terdaftar = null, obj = null;
  aman('panduan ' + f + ' bisa dijalankan', () => {
    new Function('LM_HELP_ISI', src)((k, o) => { terdaftar = k; obj = o; });
  });

  /* Kunci yang didaftarkan HARUS sama dengan nama berkasnya: mesin memuat
     berkasnya menurut nama, lalu mencari isinya menurut kunci. Beda satu
     huruf tidak melempar — babnya cuma berbunyi "gagal dimuat" selamanya. */
  sama('panduan ' + f + ' mendaftar dengan kunci nama berkasnya', terdaftar, kunciBerkas);

  /* Kuncinya juga harus dikenal registri, kalau tidak berkasnya tidak akan
     pernah dimuat siapa pun. */
  const dikenal = MODUL.some(m => (m.key || m.izin) === kunciBerkas);
  cek('panduan ' + f + ' kuncinya ada di daftar.js', dikenal, kunciBerkas + ' tidak terdaftar');

  if (!obj) return;
  isiPanduan[kunciBerkas] = obj;

  cek('panduan ' + f + ' punya ringkas', typeof obj.ringkas === 'string' && obj.ringkas.length > 10);
  cek('panduan ' + f + ' punya bagian', Array.isArray(obj.bagian) && obj.bagian.length > 0);

  const idBagian = (obj.bagian || []).map(b => b.id);
  cek('panduan ' + f + ' id bagiannya tidak kembar',
      new Set(idBagian).size === idBagian.length, 'id: ' + idBagian.join(', '));
  cek('panduan ' + f + ' tiap bagian punya id dan judul',
      (obj.bagian || []).every(b => b.id && b.judul));

  /* Blok yang jenisnya tidak dikenal mesin digambar sebagai kotak merah di
     layar. Lebih baik merah di sini daripada merah di depan pemakainya. */
  const blokSalah = [];
  (obj.bagian || []).forEach(b => (b.isi || []).forEach(x => {
    if (blokMesin.indexOf(x && x.t) < 0) blokSalah.push(String(x && x.t));
  }));
  cek('panduan ' + f + ' hanya memakai jenis blok yang dikenal mesin',
      blokSalah.length === 0, 'tak dikenal: ' + blokSalah.join(', '));

  /* HELP BUKAN APLIKASI KEDUA. Markup interaktif di dalam panduan berarti
     seseorang mulai menyalin UI modul ke sini. Diperiksa atas isi DATANYA,
     bukan atas berkasnya: komentar penjelas di kepala berkas memang boleh
     menyebut kata-kata itu, dan pemindai yang merah untuk komentar akan
     dimatikan orang berikutnya. */
  const teksData = JSON.stringify(obj);
  const terlarang = ['<script', '<button', '<form', '<input', '<iframe', 'onclick', 'onerror', 'javascript:'];
  const kena = terlarang.filter(t => teksData.toLowerCase().indexOf(t) > -1);
  cek('panduan ' + f + ' tidak memuat markup interaktif', kena.length === 0, 'memuat: ' + kena.join(', '));

  /* Jalur gambar wajib diawali nama foldernya, supaya berkas tidak menumpuk
     di akar gambar/ dan supaya kepemilikannya jelas saat modulnya berubah. */
  const gambarSalah = [];
  (obj.bagian || []).forEach(b => (b.isi || []).forEach(x => {
    if (x && x.t === 'gambar' && !/^[a-z0-9_]+\/[^/]+\.(png|jpg|webp)$/i.test(String(x.berkas || '')))
      gambarSalah.push(String(x.berkas));
  }));
  cek('panduan ' + f + ' jalur gambarnya berbentuk <folder>/<berkas>.png',
      gambarSalah.length === 0, 'salah: ' + gambarSalah.join(', '));
});

/* ===================================================================
   3. HALAMANNYA, DIJALANKAN
   =================================================================== */

/* Sumber daya dilayani DARI DISK, tidak pernah dari jaringan. Ini yang membuat
   pemuatan panduan lewat <script src> benar-benar dijalankan — termasuk cabang
   404-nya, yang justru menentukan bab mana yang ditandai "Segera". Uji yang
   menyuntikkan panduannya langsung ke dalam mesin akan melewati kedua cabang
   itu sekaligus.

   DUA BENTUK API, karena jsdom 30 mencabut ResourceLoader dan menggantinya
   dengan requestInterceptor. Dipatok salah satu, berkas uji ini mati di mesin
   yang versi jsdom-nya berbeda — dan matinya terbaca sebagai "ujinya rusak",
   bukan sebagai "jsdom-nya beda". */
function berkasUntuk(url) {
  let p;
  try { p = new URL(String(url)).pathname; } catch (e) { return null; }
  const f = path.join(ROOT, 'deploy', decodeURIComponent(p).replace(/^\/+/, ''));
  return fs.existsSync(f) && fs.statSync(f).isFile() ? f : null;
}

/* Alamat yang BENAR-BENAR diminta halaman, dikosongkan tiap kali dom baru
   dibuka. Ini satu-satunya cara menguji bahwa panduan modul yang tidak
   dipegang tidak pernah DIUNDUH — bukan cuma tidak digambar. Berkasnya tidak
   tampil di layar, jadi kebocoran di tingkat ini tidak punya gejala apa pun
   selain baris di tab Network. */
let DIMINTA = [];

/* Jalur yang SENGAJA dijawab 404 walau berkasnya ada di disk.
   ---------------------------------------------------------------------------
   Ini yang membuat keadaan "panduannya belum ditulis" tetap bisa diuji SESUDAH
   seluruh bab punya panduannya. Versi sebelumnya memakai `analytics` sebagai
   contoh bab kosong — dan asersinya langsung MERAH begitu panduan analytics
   ditulis, untuk kode yang tidak berubah sedikit pun.

   Uji yang membusuk begitu pekerjaannya selesai lebih buruk daripada tidak ada
   uji: yang membacanya belajar mengabaikan warna merah, termasuk waktu suatu
   hari ia benar. Yang dijaga di sini PERILAKU MESINNYA (404 -> 'kosong'),
   bukan kebetulan bahwa ada satu bab yang belum sempat ditulis. */
let BLOKIR = new Set();
const diblokir = u => { for (const p of BLOKIR) if (String(u).indexOf(p) > -1) return true; return false; };

const SUMBER_DAYA = (() => {
  if (typeof JSDOM_MOD.requestInterceptor === 'function') {       /* jsdom >= 30 */
    return { interceptors: [ JSDOM_MOD.requestInterceptor(async req => {
      DIMINTA.push(String(req.url));
      if (diblokir(req.url)) return new Response('', { status: 404 });
      const f = berkasUntuk(req.url);
      /* Yang tidak ada di disk dijawab 404 — BUKAN diteruskan ke jaringan.
         Diteruskan, uji ini jadi bergantung pada koneksi internet, dan
         merahnya tidak ada hubungannya dengan kode yang diuji. */
      if (!f) return new Response('', { status: 404 });
      const tipe = f.endsWith('.js')  ? 'application/javascript'
                 : f.endsWith('.css') ? 'text/css' : 'text/plain';
      return new Response(fs.readFileSync(f), { status: 200, headers: { 'Content-Type': tipe } });
    }) ] };
  }
  if (typeof JSDOM_MOD.ResourceLoader === 'function') {           /* jsdom < 30 */
    const Pemuat = class extends JSDOM_MOD.ResourceLoader {
      fetch(url) {
        DIMINTA.push(String(url));
        if (diblokir(url)) return Promise.reject(new Error('404 diblokir ' + url));
        const f = berkasUntuk(url);
        if (!f) return Promise.reject(new Error('404 ' + url));
        return Promise.resolve(fs.readFileSync(f));
      }
    };
    return new Pemuat();
  }
  console.error('Versi jsdom ini tidak punya requestInterceptor maupun ResourceLoader.');
  process.exit(2);
})();

function buka(modules) {
  DIMINTA = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', e => {
    const t = String((e && e.detail && e.detail.stack) || (e && e.message) || e);
    /* Yang DISARING cuma keramaian yang memang diharapkan:
         - huruf & CSS dari luar, yang sengaja dijawab 404 supaya uji ini tidak
           pernah menyentuh jaringan;
         - panduan/<kunci>.js yang belum ditulis — 404-nya BUKAN kerusakan,
           justru itu yang menandai babnya "Segera".
       Kegagalan memuat berkas lain TETAP dicetak: kalau panduan yang SUDAH
       ditulis gagal dimuat, itu yang paling perlu terlihat. */
    const diharapkan = /Could not parse CSS|fonts\.googleapis|\/panduan\/[a-z0-9_]+\.js/i.test(t);
    if (!diharapkan) console.log('  !! ' + t.split('\n')[0]);
  });
  const dom = new JSDOM(MESIN, {
    virtualConsole: vc, runScripts: 'dangerously', resources: SUMBER_DAYA,
    url: 'https://dev.laksamanamuda.id/help/',
    beforeParse(w) {
      /* Sesi dipasang SEBELUM parsing: guard SSO ada di <head> dan berjalan
         saat parsing, jadi yang dipasang sesudahnya tidak pernah terbaca. */
      w.localStorage.setItem('lm_session', JSON.stringify({
        v: 3, userId: 'u1', name: 'Uji Coba', username: 'uji',
        modules: modules, adminModules: [], expiry: Date.now() + 3600e3
      }));
      w.scrollTo = () => {};
      w.Element.prototype.scrollIntoView = function () {};
    }
  });
  return dom;
}

function tunggu(cond, batas = 3000) {
  return new Promise((res, rej) => {
    const t0 = Date.now();
    (function ulang() {
      let v = false;
      try { v = cond(); } catch (e) { /* belum siap */ }
      if (v) return res();
      if (Date.now() - t0 > batas) return rej(new Error('batas waktu habis'));
      setTimeout(ulang, 20);
    })();
  });
}

const nav = d => d.window.document.getElementById('nav').innerHTML;
const isi = d => d.window.document.getElementById('isi').innerHTML;

(async function () {

  /* ---------- Penyaring hak akses ---------- */
  console.log('\n== Hak akses: hanya modul yang dipegang ==');
  {
    const d = buka(['help', 'reservasi']);
    await amanTunggu('halaman terbuka dengan sesi terbatas', () =>
      tunggu(() => nav(d).indexOf('#/reservasi') > -1));

    cek('bab Reservasi digambar di sidebar', nav(d).indexOf('#/reservasi') > -1);
    cek('bab pengantar digambar untuk semua orang', nav(d).indexOf('#/portal') > -1);
    cek('bab Event TIDAK digambar', nav(d).indexOf('#/event') < 0, 'bocor di sidebar');
    cek('bab Finance TIDAK digambar', nav(d).indexOf('#/brankas') < 0, 'bocor di sidebar');

    cek('kartu Reservasi ada di beranda', isi(d).indexOf('#/reservasi') > -1);
    cek('kartu Event TIDAK ada di beranda', isi(d).indexOf('#/event') < 0, 'bocor di beranda');

    /* Grup yang tidak punya satu pun bab tidak digambar sama sekali. */
    cek('judul grup kosong tidak digambar', nav(d).indexOf('Bisnis &amp; Target') < 0
      && nav(d).indexOf('Bisnis & Target') < 0, 'grup tanpa isi ikut digambar');

    /* GERBANGNYA BUKAN SEKADAR TIDAK MENGGAMBAR TAUTAN. Hash bisa diketik
       sendiri di bilah alamat, jadi yang menjaga harus routernya. */
    d.window.location.hash = '#/event';
    await amanTunggu('alamat bab terlarang diproses', () =>
      tunggu(() => d.window.location.hash === '#/' || d.window.location.hash === ''));
    cek('membuka #/event langsung dipulangkan ke beranda',
        d.window.location.hash === '#/' || d.window.location.hash === '',
        'hash = ' + d.window.location.hash);
    cek('isi bab Event tidak pernah tergambar',
        isi(d).indexOf('Arti Status Event') < 0, 'isi panduan Event bocor');

    d.window.close();
  }

  /* ---------- Pemegang '*' ---------- */
  console.log('\n== Hak akses: pemegang bintang ==');
  {
    const d = buka(['*']);
    await amanTunggu('halaman terbuka dengan sesi bintang', () =>
      tunggu(() => nav(d).indexOf('#/event') > -1));
    cek('pemegang * melihat bab Event', nav(d).indexOf('#/event') > -1);
    cek('pemegang * melihat bab Brankas', nav(d).indexOf('#/brankas') > -1);
    cek('pemegang * tidak dapat daftar "Belum ada di Help"',
        nav(d).indexOf('Belum ada di Help') < 0);
    d.window.close();
  }

  /* ---------- Kunci yang belum punya bab ---------- */
  console.log('\n== Kunci modul yang belum dikenal Help ==');
  {
    const d = buka(['help', 'modul_baru_yang_belum_ada']);
    await amanTunggu('halaman terbuka', () => tunggu(() => nav(d).indexOf('#/portal') > -1));
    /* Disembunyikan, modul baru di portal akan terbaca sebagai modul yang
       tidak ada. Disebut, ia terbaca sebagai Help yang belum lengkap. */
    cek('kunci tak dikenal tetap disebut di sidebar',
        nav(d).indexOf('modul_baru_yang_belum_ada') > -1, 'dihilangkan diam-diam');
    d.window.close();
  }

  /* ---------- Isi artikel ---------- */
  console.log('\n== Menggambar artikel ==');
  {
    const d = buka(['help', 'reservasi']);
    await amanTunggu('beranda siap', () => tunggu(() => nav(d).indexOf('#/reservasi') > -1));
    d.window.location.hash = '#/reservasi';
    await amanTunggu('artikel Reservasi tergambar', () =>
      tunggu(() => isi(d).indexOf('Arti Setiap Status') > -1));

    const html = isi(d);
    cek('judul artikel tergambar', html.indexOf('<h1>Reservasi</h1>') > -1);
    cek('daftar isi tergambar', html.indexOf('hc-toc') > -1);
    cek('blok langkah jadi daftar bernomor', html.indexOf('hc-langkah') > -1);
    cek('blok tabel tergambar', html.indexOf('hc-tbl') > -1);
    cek('blok catatan tergambar', html.indexOf('hc-note') > -1);
    cek('blok FAQ tergambar', html.indexOf('hc-faq') > -1);
    cek('tidak ada blok yang gagal dikenali', html.indexOf('Blok panduan tidak dikenal') < 0);

    /* Penekanan *Simpan* jadi <b>, dan itu jalan SESUDAH esc() — jadi panduan
       tetap tidak bisa menyuntikkan markup. */
    cek('penekanan bintang jadi tebal', /<b>Simpan<\/b>/.test(html), 'tidak ada <b>Simpan</b>');

    /* Tangkapan layar: sebuah <img>, bukan potongan UI modul. */
    cek('gambar digambar sebagai <img>', /<img[^>]+src="gambar\/reservasi\//.test(html));
    cek('keadaan gambar kosong menyebut jalur berkasnya',
        html.indexOf('deploy/help/gambar/reservasi/') > -1,
        'jalur berkas tidak disebut, yang membacanya tidak tahu harus menaruh di mana');
    cek('artikel tidak memuat tombol', html.indexOf('<button') < 0, 'ada <button> di artikel');
    cek('artikel tidak memuat isian', html.indexOf('<input') < 0, 'ada <input> di artikel');

    /* Menuju bagian tertentu lewat alamat. */
    d.window.location.hash = '#/reservasi/dp';
    await amanTunggu('bagian DP tergambar', () => tunggu(() => isi(d).indexOf('bagian-dp') > -1));
    cek('bagian bisa dituju lewat alamat', isi(d).indexOf('id="bagian-dp"') > -1);

    d.window.close();
  }

  /* ---------- Bab yang panduannya belum ada ---------- */
  console.log('\n== Bab yang panduannya belum ditulis ==');
  {
    /* BERKASNYA DIBLOKIR, bukan memakai bab yang kebetulan belum ditulis.
       Sejak seluruh 25 bab punya panduannya, tidak ada lagi kunci yang bisa
       dipinjam untuk menguji keadaan ini — dan uji yang bergantung pada
       adanya pekerjaan yang belum selesai akan merah justru saat pekerjaan
       itu selesai. Yang diuji tetap jalur yang sama persis: 404 -> onerror
       -> STATUS 'kosong' -> pita "Sedang disusun". */
    BLOKIR.add('/panduan/analytics.js');
    const d = buka(['help', 'analytics']);
    await amanTunggu('beranda siap', () => tunggu(() => nav(d).indexOf('#/analytics') > -1));
    cek('bab tanpa panduan tetap digambar di sidebar', nav(d).indexOf('#/analytics') > -1,
        'babnya hilang, terbaca sebagai modul yang tidak ada');
    cek('bab tanpa panduan ditandai Segera', nav(d).indexOf('Segera') > -1);

    d.window.location.hash = '#/analytics';
    /* DITUNGGU JUDUL ARTIKELNYA, bukan kata "Sedang disusun". Kata itu SUDAH
       ada di beranda (penanda di kartunya), jadi penunggu yang mencarinya
       selesai seketika sementara artikelnya belum tergambar sama sekali — dan
       asersi berikutnya lalu menguji beranda. Versi pertama uji ini memang
       merah karenanya, untuk kode yang benar. */
    await amanTunggu('bab kosong tergambar', () => tunggu(() => isi(d).indexOf('<h1>Analytics</h1>') > -1));
    cek('bab kosong mengatakan modulnya tetap bisa dipakai',
        isi(d).indexOf('tetap bisa dipakai') > -1);
    cek('bab kosong TIDAK berbunyi gagal dimuat',
        isi(d).indexOf('Panduan gagal dimuat') < 0,
        'panduan yang belum ditulis disamakan dengan panduan yang rusak');
    d.window.close();
    BLOKIR.clear();
  }

  /* ---------- Cakupan: tiap bab benar-benar punya berkasnya ---------- */
  console.log('\n== Cakupan panduan ==');
  {
    /* Pasangan dari blok di atas. Yang itu menjaga MESINNYA sanggup
       menggambar bab kosong; yang ini menjaga tidak ada bab yang benar-benar
       kosong di repo. Tanpa yang kedua, seluruh panduan bisa terhapus dan
       ujinya tetap hijau — mesinnya memang menangani keadaan itu dengan baik. */
    const kurangBerkas = MODUL
      .map(m => m.key || m.izin)
      .filter(k => !fs.existsSync(path.join(DIR_PANDUAN, k + '.js')));
    cek('setiap bab di registri punya berkas panduannya', kurangBerkas.length === 0,
        'belum ada berkasnya: ' + kurangBerkas.join(', '));
  }

  /* ---------- Tangkapan layar ---------- */
  console.log('\n== Tangkapan layar ==');
  {
    /* YANG DIJAGA BERKAS YATIM, BUKAN BERKAS YANG BELUM ADA.
       Slot yang gambarnya belum dipasang adalah keadaan yang SAH — mesinnya
       menggambar kotak penanda berisi jalur yang ditunggunya, dan menuntut
       semuanya terisi membuat uji ini merah tiap kali ada slot baru ditulis
       sebelum fotonya diambil (pelajaran blok "Segera" di atas).

       Yang TIDAK pernah sah: berkas di gambar/ yang tidak disebut satu panduan
       pun. Itu hampir selalu salah nama — dan salah nama gagal DIAM: kotak
       bergarisnya tidak pernah hilang, berkasnya tidak pernah tampil, dan
       tidak ada satu pun galat. Sudah kejadian 19 September 2026
       (usage/catat.png vs usage/pemakaian.png). */
    const minta = new Set();
    berkasPanduan.forEach(f => {
      const src = fs.readFileSync(path.join(DIR_PANDUAN, f), 'utf8');
      for (const m of src.matchAll(/berkas:'([^']+)'/g)) minta.add(m[1]);
    });

    const DIR_GAMBAR = path.join(HELP, 'gambar');
    const ada = [];
    (function sapu(rel) {
      const abs = path.join(DIR_GAMBAR, rel);
      if (!fs.existsSync(abs)) return;
      for (const e of fs.readdirSync(abs)) {
        const r = rel ? rel + '/' + e : e;
        if (fs.statSync(path.join(DIR_GAMBAR, r)).isDirectory()) sapu(r);
        else if (/\.(png|jpg|jpeg|webp)$/i.test(r)) ada.push(r);
      }
    })('');

    const yatim = ada.filter(x => !minta.has(x));
    cek('tidak ada berkas gambar yang tidak dirujuk panduan mana pun',
        yatim.length === 0,
        'yatim (salah nama?): ' + yatim.join(', '));

    /* Batas di BACA-DULU.md. Cuma berlaku untuk berkas yang MEMANG sudah ada,
       jadi ia tidak ikut merah untuk slot yang masih menunggu. Lebar dibaca
       dari IHDR PNG langsung — tidak perlu pustaka gambar apa pun. */
    ada.filter(x => x.endsWith('.png')).forEach(rel => {
      const b = fs.readFileSync(path.join(DIR_GAMBAR, rel));
      const kb = Math.round(b.length / 1024);
      cek('gambar ' + rel + ' di bawah 300 KB', kb < 300, kb + ' KB');
      const lebar = b.length > 24 ? b.readUInt32BE(16) : 0;
      cek('gambar ' + rel + ' lebarnya 1200-1600px',
          lebar >= 1200 && lebar <= 1600, lebar + 'px');
    });

    const belum = [...minta].filter(x => !ada.includes(x));
    console.log('  ..   ' + (minta.size - belum.length) + '/' + minta.size +
                ' slot tangkapan layar terisi' +
                (belum.length ? ' — menunggu: ' + belum.join(', ') : ''));
  }

  /* ---------- Blok yang jenisnya tidak dikenal ---------- */
  console.log('\n== Blok yang tidak dikenal mesin ==');
  {
    const d = buka(['help', 'analytics']);
    await amanTunggu('beranda siap', () => tunggu(() => nav(d).indexOf('#/analytics') > -1));

    /* Panduan buatan didaftarkan lewat pintu yang SAMA dengan berkas panduan
       sungguhan (window.LM_HELP_ISI), jadi yang diuji penggambar yang
       sebenarnya. Tanpa ini, "blok tak dikenal disebutkan" tidak pernah bisa
       dibuktikan: seluruh panduan yang ada di repo memang memakai blok yang
       benar, dan mutasi yang membuat blok asing dilewati DIAM-DIAM lolos. */
    d.window.LM_HELP_ISI('analytics', {
      ringkas: 'buatan uji',
      bagian: [{ id:'x', judul:'Bagian Uji', isi:[{ t:'jenisYangTidakAda', isi:'apa pun' }] }]
    });
    d.window.location.hash = '#/analytics';
    await amanTunggu('artikel buatan tergambar', () =>
      tunggu(() => isi(d).indexOf('Bagian Uji') > -1));
    cek('blok yang jenisnya tidak dikenal DISEBUTKAN, bukan dilewati',
        isi(d).indexOf('Blok panduan tidak dikenal') > -1,
        'blok asing hilang diam-diam, satu salah ketik menghapus satu paragraf tanpa tanda');
    d.window.close();
  }

  /* ---------- Pencarian ---------- */
  console.log('\n== Pencarian ==');
  {
    /* SENGAJA TANPA kunci `event`. Kebocoran pencarian hanya bisa diuji kalau
       ada panduan yang BENAR-BENAR ADA di disk tapi TIDAK boleh dibaca orang
       ini. Mencari kata milik modul yang panduannya belum ditulis sama sekali
       adalah asersi hampa: hasilnya kosong apa pun keputusan kodenya. */
    const d = buka(['help', 'reservasi']);
    await amanTunggu('beranda siap', () => tunggu(() => nav(d).indexOf('#/reservasi') > -1));

    const kotak = d.window.document.getElementById('cari');

    /* MENUNGGU LAYAR YANG MENYEBUT KATA YANG BARU DICARI, bukan sekadar
       "sudah ada hasil" atau "sudah kosong". Kedua keadaan itu SUDAH ada dari
       pencarian sebelumnya, jadi penunggu yang menerimanya selesai seketika
       dan asersi berikutnya menguji layar yang lama — dan mutasi yang
       benar-benar membocorkan isi bab terlarang LOLOS karenanya. Sudah terjadi
       dua kali di berkas ini; keduanya kali pertama dikira kode yang benar.

       Kata yang dicari selalu disebut di kedua keadaan (di dalam <b> pada
       layar kosong, di dalam <mark> pada daftar hasil), jadi ia penanda yang
       sah untuk "render barunya sudah jalan". */
    async function cariLalu(kata) {
      kotak.value = kata;
      kotak.dispatchEvent(new d.window.Event('input', { bubbles: true }));
      return tunggu(() => isi(d).toLowerCase().indexOf(kata.toLowerCase()) > -1, 2000)
             .then(() => true, () => false);
    }

    await cariLalu('no-show');
    cek('pencarian menemukan istilah di dalam tabel',
        isi(d).indexOf('#/reservasi/status') > -1, 'bagian Status tidak ketemu');
    cek('kata yang dicari ditandai', isi(d).indexOf('<mark>') > -1);

    /* "Talent Schedule" hanya ada di panduan Event, dan berkasnya ADA di disk.
       Kalau pemuat pencarian menyisir seluruh modul (bukan cuma yang dipegang),
       kutipan isinya akan tampil di sini — bocor lewat pintu belakang, tanpa
       satu pun tautan yang pernah digambar di sidebar. */
    await cariLalu('talent schedule');
    cek('pencarian tidak menyentuh panduan modul yang tidak dipegang',
        isi(d).indexOf('Tidak ada panduan') > -1 && isi(d).indexOf('#/event') < 0,
        'isi panduan Event bocor lewat pencarian');

    /* DUA PENJAGA UNTUK SATU KEBOCORAN, dan keduanya perlu karena masing-
       masing sendirian TIDAK menghasilkan gejala:

         - pemuat yang menarik SELURUH panduan tidak terlihat di layar, karena
           penyisir pencarian toh cuma menyusuri bab yang boleh dibaca;
         - penyisir yang menyusuri seluruh registri juga tidak terlihat, karena
           panduan yang tidak dipegang memang tidak pernah termuat.

       Dirusak BERSAMAAN, isinya bocor. Jadi yang dijaga tiap sisinya sendiri:
       yang ini alamat yang benar-benar diminta. */
    cek('panduan modul yang tidak dipegang tidak pernah diunduh',
        !DIMINTA.some(u => /\/panduan\/event\.js$/.test(u)),
        'berkas panduan Event ikut diunduh: ' + DIMINTA.filter(u => /panduan/.test(u)).join(', '));

    /* Dan yang ini penyisirnya: panduan Event disuntikkan LANGSUNG ke dalam
       mesin, jadi seandainya pemuatnya suatu hari menariknya, penyisir tetap
       tidak boleh memulangkannya. */
    d.window.LM_HELP_ISI('event', {
      ringkas: 'buatan uji',
      bagian: [{ id:'z', judul:'Bagian Rahasia Event', isi:[{ t:'teks', isi:'kata kunci zebrakuning' }] }]
    });
    await cariLalu('zebrakuning');
    cek('penyisir pencarian hanya menyusuri bab yang boleh dibaca',
        isi(d).indexOf('Tidak ada panduan') > -1 && isi(d).indexOf('Bagian Rahasia Event') < 0,
        'bab yang tidak dipegang ikut tersisir');

    d.window.close();
  }

  /* ---------- Isi panduan tidak bisa menyuntikkan markup ---------- */
  console.log('\n== Penulisan teks panduan ==');
  {
    const d = buka(['help', 'analytics']);
    await amanTunggu('beranda siap', () => tunggu(() => nav(d).indexOf('#/analytics') > -1));

    /* Tidak satu pun panduan di repo memuat tanda kurung sudut, jadi tanpa
       contoh buatan ini mutasi "esc dicabut" tidak menggeser satu huruf pun
       dan LOLOS — cacat fixture, bukan cacat produk. */
    d.window.LM_HELP_ISI('analytics', {
      ringkas: 'buatan uji',
      bagian: [{ id:'x', judul:'Uji Escaping', isi:[
        { t:'teks', isi:'tulisan <b>ini</b> harus terbaca apa adanya & tidak jadi tag' },
        { t:'teks', isi:'tapi *ini* memang harus tebal' }
      ]}]
    });
    d.window.location.hash = '#/analytics';
    await amanTunggu('artikel buatan tergambar', () =>
      tunggu(() => isi(d).indexOf('Uji Escaping') > -1));

    const html = isi(d);
    cek('kurung sudut di dalam panduan tidak jadi tag',
        html.indexOf('&lt;b&gt;ini&lt;/b&gt;') > -1,
        'markup di dalam teks panduan ikut dijalankan peramban');
    cek('ampersand ikut di-escape', html.indexOf('apa adanya &amp; tidak') > -1);
    /* Pembanding: penekanan bintang TETAP harus bekerja. Tanpa baris ini,
       asersi di atas tetap hijau walau seluruh penekanan ikut dimatikan. */
    cek('penekanan bintang tetap bekerja', /<b>ini<\/b>/.test(html));

    d.window.close();
  }

  /* ---------- Guard SSO ---------- */
  console.log('\n== Guard SSO ==');
  {
    cek('guard menanyakan kunci help', /mods\.indexOf\('help'\)/.test(MESIN));
    cek('guard meloloskan pemegang bintang', /mods\.indexOf\('\*'\)/.test(MESIN));
    cek('guard memeriksa masa berlaku sesi', /s\.expiry&&Date\.now\(\)<s\.expiry/.test(MESIN));
    cek('guard memulangkan ke portal saat tidak berhak', /location\.replace\('\.\.\/'\)/.test(MESIN));

    /* Sesi yang sudah kedaluwarsa harus dipantulkan. Diuji SUNGGUHAN, bukan
       lewat sumbernya: guard yang salah baca tetap terlihat benar di teks.

       Yang dibaca BUKAN location.pathname — jsdom tidak pernah benar-benar
       berpindah halaman, jadi alamatnya tetap /help/ apa pun yang dilakukan
       guard-nya, dan asersi atas pathname merah untuk kode yang benar. Yang
       membuktikan guard-nya berjalan adalah jsdom mengeluh "navigation not
       implemented": keluhan itu HANYA muncul kalau location.replace benar-
       benar dipanggil. */
    async function pantulan(sesi) {
      const vc = new VirtualConsole();
      let pindah = false;
      vc.on('jsdomError', e => { if (/navigation/i.test(String(e && e.message))) pindah = true; });
      const d = new JSDOM(MESIN, {
        virtualConsole: vc, runScripts: 'dangerously', resources: SUMBER_DAYA,
        url: 'https://dev.laksamanamuda.id/help/',
        beforeParse(w) {
          if (sesi) w.localStorage.setItem('lm_session', JSON.stringify(sesi));
          w.scrollTo = () => {};
          w.Element.prototype.scrollIntoView = function () {};
        }
      });
      await new Promise(r => setTimeout(r, 150));
      d.window.close();
      return pindah;
    }

    cek('sesi kedaluwarsa dipulangkan ke portal',
        await pantulan({ v:3, modules:['help'], expiry: Date.now() - 1000 }), 'tetap dibiarkan masuk');
    cek('sesi tanpa kunci help dipulangkan ke portal',
        await pantulan({ v:3, modules:['reservasi'], expiry: Date.now() + 3600e3 }), 'tetap dibiarkan masuk');
    cek('tidak ada sesi sama sekali dipulangkan ke portal',
        await pantulan(null), 'tetap dibiarkan masuk');
    /* Pembanding. Tanpa baris ini ketiga asersi di atas tetap hijau walau
       guard-nya memantulkan SEMUA ORANG, termasuk yang berhak. */
    cek('sesi yang sah TIDAK dipantulkan',
        !(await pantulan({ v:3, modules:['help'], expiry: Date.now() + 3600e3 })), 'ikut dipantulkan');
  }

  /* ---------- Gaya ---------- */
  console.log('\n== Tema ==');
  {
    cek('memakai tema bersama, bukan palet sendiri',
        /assets\/laksamana\.css/.test(MESIN), 'tidak menautkan laksamana.css');
    /* Blok :root sendiri adalah persis yang membuat --gold berarti dua warna
       berbeda di repo ini (lihat catatan di assets/tema.css). */
    cek('tidak mendeklarasikan blok :root sendiri', !/:root\s*\{/.test(MESIN),
        'ada :root, palet jadi bercabang');
  }

  console.log('\n' + '='.repeat(52));
  console.log('  OK: ' + ok + '   GAGAL: ' + gagal);
  console.log('='.repeat(52) + '\n');
  process.exit(gagal ? 1 : 0);
})();
