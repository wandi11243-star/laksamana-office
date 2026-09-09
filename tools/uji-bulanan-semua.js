/* uji-bulanan-semua.js — Jadwal Bulanan selalu terbuka di tab "Semua"
 * (permintaan user 9 September 2026).
 *
 *   node tools/uji-bulanan-semua.js
 *   JSDOM_PATH=/jalur/ke/jsdom node tools/uji-bulanan-semua.js
 *
 * BERKAS UJI KEDUA untuk modul Jadwal (yang pertama uji-impor-jadwal.js, yang
 * berjalan tanpa jsdom). `smoke-modul.js jadwal` merender delapan halamannya
 * tapi tidak pernah menekan satu pun menu, jadi ia tidak bisa melihat divisi
 * mana yang terpilih saat halaman itu dibuka.
 *
 * YANG DIJAGA BUKAN "DIV pernah bernilai ALL", MELAINKAN KAPAN ia disetel:
 *
 *   - saat MASUK halaman  -> Semua, supaya pertanyaan "malam ini siapa saja
 *                            yang masuk, di semua pos" terjawab tanpa satu
 *                            klik yang jawabannya selalu sama;
 *   - saat menekan TAB    -> TIDAK dipulihkan. Dipasang di viewBulanan(),
 *                            tab divisi yang barusan ditekan orangnya kembali
 *                            ke Semua pada render berikutnya — dan tab yang
 *                            menolak dipilih terbaca sebagai halaman rusak,
 *                            bukan sebagai aturan.
 *
 * Kedua sisi itu diuji, karena mencabut salah satunya tidak menimbulkan galat
 * apa pun: yang satu memulangkan divisi sendiri, yang satu memulangkan tab
 * yang tidak bisa ditekan.
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

const SRC = fs.readFileSync(path.join(ROOT, 'deploy/jadwal/index.html'), 'utf8');
/* Komentar dibuang sebelum mencari PEMAKAIAN: penjelasan di atas barisnya
   menyebut nama fungsinya apa adanya, dan pemindai yang merah untuk komentar
   akan dimatikan orang berikutnya. */
const KODE = SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');

function buka() {
  const vc = new VirtualConsole();
  vc.on('jsdomError', e => {
    const t = String((e && e.detail && e.detail.stack) || (e && e.message) || e);
    if (!/Not implemented|Could not parse CSS/.test(t)) console.log('  !! ' + t.split('\n')[0]);
  });
  /* Skrip CDN dibuang; modul ini tidak memuat aset lokal lewat <script src>. */
  const html = SRC.replace(/<script[^>]*\ssrc=[^>]*><\/script>/gi, '');
  const dom = new JSDOM(html, { virtualConsole: vc, runScripts: 'dangerously',
    url: 'https://dev.laksamanamuda.id/jadwal/',
    beforeParse(w) {
      w.localStorage.setItem('lm_session', JSON.stringify({
        id: 'u1', name: 'Ayu', modules: ['jadwal'], adminModules: [],
        token: 't', expiry: Date.now() + 86400000 }));
      /* boot() menembak jaringan di ujung berkas. Digantung, bukan ditolak:
         yang diuji di sini pemilihan divisinya, bukan pemuatannya. */
      w.fetch = () => new Promise(() => {});
      w.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {},
        addEventListener() {}, removeEventListener() {} });
      w.print = () => {}; w.confirm = () => true; w.alert = () => {};
    } });
  const w = dom.window;
  /* S/ME/DIV/VIEW deklarasi `let` di lingkup leksikal global — BUKAN properti
     window, jadi harus lewat eval. Jebakan ini tercatat di CLAUDE.md. */
  w.eval('S = normalizeState(seed()); ME = { id:"u1", name:"Ayu" };');
  return w;
}
const DIV = w => w.eval('DIV');

console.log('-- kontrak: satu tempat yang memutuskannya --');
cek('divMasukHalaman() ada', /function divMasukHalaman\(/.test(KODE));
/* TIGA pintu masuk halaman, dan ketiganya wajib melewatinya. Yang terlewat
   gagal DIAM: menekan menunya benar, tapi menekan Back atau membuka
   #/bulanan langsung dari alamat mendarat di divisi sendiri. */
cek('go() memanggilnya', /function go\(v\)\{\s*\n?\s*VIEW=v; divMasukHalaman\(v\);/.test(KODE),
  'menekan menu Jadwal Bulanan');
cek('terapkanHash() memanggilnya', /VIEW=tujuan; divMasukHalaman\(tujuan\);/.test(KODE),
  'menekan Back, atau hash yang diketik langsung');
cek('boot() memanggilnya', /if\(!halamanSah\(VIEW\)\) VIEW='dashboard';[\s\S]{0,400}?divMasukHalaman\(VIEW\);/.test(KODE),
  'membuka #/bulanan langsung dari alamat');
/* SESUDAH DIV dihitung dari kuasa orangnya. Dipasang sebelumnya, baris
   `DIV = kuasa[0]` menimpanya balik dan tab Semua tidak pernah terlihat. */
cek('...dan SESUDAH DIV disetel dari kuasa orangnya',
  KODE.indexOf('divMasukHalaman(VIEW);') > KODE.indexOf('DIV = kuasa.length ? kuasa[0]'),
  'dipasang lebih dulu, DIV = kuasa[0] menimpanya balik');
/* Kalau ia dipanggil dari penggambar, tab yang barusan ditekan dipulihkan ke
   Semua tiap render. */
cek('viewBulanan() TIDAK memanggilnya',
  KODE.slice(KODE.indexOf('function viewBulanan()'),
             KODE.indexOf('function viewBulanan()') + 3000).indexOf('divMasukHalaman') < 0,
  'dipanggil di penggambar, tab divisi tidak bisa dipilih sama sekali');

console.log('\n-- yang terjadi di layar --');
const w = buka();
w.eval("DIV='bar'; VIEW='dashboard';");
w.eval("go('bulanan')");
sama('menekan Jadwal Bulanan membuka tab Semua', DIV(w), 'ALL');
/* Yang dituntut TOMBOLNYA berkelas active, bukan sekadar adanya kata
   "Semua" di halaman — kata itu digambar segDivisi() untuk setiap keadaan,
   jadi asersi yang mencarinya hijau juga waktu tab yang menyala divisi lain. */
cek('...dan tab Semua-lah yang menyala',
  /<button class="active"[^>]*onclick="gantiDiv\('ALL'\)"/.test(
    w.document.getElementById('view').innerHTML),
  'tab yang menyala bukan Semua');

/* Tab yang ditekan orangnya HARUS bertahan. Render di modul ini total, jadi
   kalau pemulihannya ada di penggambar, satu klik divisi langsung dibatalkan
   render berikutnya — dan itu tidak menimbulkan galat apa pun. */
w.eval("gantiDiv('bar')");
sama('memilih satu divisi di halaman itu bertahan', DIV(w), 'bar');
w.eval("render()");
sama('...dan tidak dipulihkan ke Semua pada render berikutnya', DIV(w), 'bar');

/* Input Mingguan TIDAK ikut dipaksa: di sana satuan kerjanya memang satu
   divisi, dan memaksanya ke Semua membuat head mendarat di lembar yang
   sebagian selnya digambar mati. */
w.eval("go('minggu')");
cek('Input Mingguan tidak ikut dipaksa ke Semua', DIV(w) !== 'ALL',
  'dapat ' + JSON.stringify(DIV(w)));

/* Kembali lewat alamat — bukan lewat menu — juga harus mendarat di Semua. */
w.eval("DIV='bar'; VIEW='minggu'; location.hash='#/bulanan'; terapkanHash();");
sama('masuk lewat alamat #/bulanan juga membuka tab Semua', DIV(w), 'ALL');

console.log('\n' + ok + ' OK, ' + gagal + ' GAGAL');
process.exit(gagal ? 1 : 0);
