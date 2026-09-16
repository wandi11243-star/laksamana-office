/* Uji Catatan Void Menu — 16 September 2026, permintaan user:
   "setiap orang wajib melakukan input menu yang harus di-Void-kan", dengan
   tab barunya di modul Cashier DAN di panel Finance > Kas Kecil.

   YANG DIJAGA, dan kenapa tiap-tiapnya ada:

   1. MENUNYA BENAR-BENAR ADA DI LAYAR. Sidebar kedua modul itu HTML STATIS —
      menambah TITLES tidak melahirkan menunya. Sudah menggigit di modul
      Analytics 16 September 2026: halaman Void di sana punya judul, punya
      router, bisa dibuka lewat go(), dan tetap tidak punya baris di sidebar.
      Yang dijaga di sini INVARIAN DUA ARAH (tiap TITLES punya <a data-view>,
      dan sebaliknya) plus satu klik SUNGGUHAN — tautan yang tergambar tapi
      tidak tersambung ke apa pun terlihat persis sama di layar.

   2. WAJIB berarti DITAHAN, bukan diperingatkan. Yang dihitung ujinya JUMLAH
      POST voidSimpan, bukan ada-tidaknya pita merah di layar: pita yang
      muncul sementara barisnya tetap berangkat adalah kebalikan dari yang
      diminta, dan dari layar keduanya terlihat sama persis.

   3. NAMA PENCATAT TIDAK DIKIRIM PERAMBAN. Seluruh guna catatan ini
      bergantung pada "siapa yang menginput"; nama yang datang dari layar bisa
      diketik siapa saja. Yang diuji: payload-nya memang TIDAK memuat nama,
      dan servernya memang mengambilnya dari sesi.

   4. PEMBATALAN BUKAN PENGHAPUSAN. Baris yang dibatalkan tetap tergambar dan
      tidak ikut dijumlahkan. Catatan pertanggungjawaban yang barisnya bisa
      lenyap bukan catatan, cuma draf.

   5. PANEL KAS KECIL BACA SAJA. Angka yang bisa diketik di dua tempat akan
      berbeda suatu hari — aturan yang sama dengan Piutang di panel Brankas.

   PHP TIDAK BISA DIJALANKAN di mesin pengembangan, jadi sisi servernya dijaga
   dua lapis: sintaksnya lewat php-parser, dan logikanya sebagai KONTRAK atas
   sumbernya. Keduanya bukan pengganti menjalankan PHP-nya, dan itu dikatakan
   di sini supaya yang membaca hasil hijau tahu persis apa yang sudah diuji.

   Jalankan:  node tools/uji-void-catatan.js
   (butuh jsdom — setel JSDOM_PATH kalau tidak ada di node_modules) */
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

const HTML_CASHIER = fs.readFileSync(path.join(ROOT, 'deploy', 'cashier', 'index.html'), 'utf8');
const HTML_KAS = fs.readFileSync(path.join(ROOT, 'deploy', 'finance', 'kas', 'index.html'), 'utf8');
const PHP_LIB = fs.readFileSync(path.join(ROOT, 'kompas-mysql', 'lib_kompas_mysql.php'), 'utf8');
const PHP_API = fs.readFileSync(path.join(ROOT, 'kompas-mysql', 'api.php'), 'utf8');

let lulus = 0, gagal = 0, lewat = 0;
const cek = (nama, syarat, ket) => {
  if (syarat) { lulus++; console.log('  OK    ' + nama); }
  else { gagal++; console.log('  GAGAL ' + nama + (ket ? '  -> ' + String(ket).slice(0, 220) : '')); }
};
const sama = (nama, dapat, harus) =>
  cek(nama, dapat === harus, 'dapat ' + JSON.stringify(dapat) + ', harus ' + JSON.stringify(harus));
const tunggu = ms => new Promise(r => setTimeout(r, ms));
/* ASERSI YANG MELEMPAR MEMBUNUH SELURUH SUITE, dan mutasinya lalu terbaca
   "uji tidak selesai" — bukan "tertangkap". Begitu sebuah mutasi mencabut
   menunya, halaman yang tergambar bukan halaman Void lagi, seluruh
   getElementById memulangkan null, dan node mati sebelum ringkasan tercetak
   sehingga hasil mutasinya tidak bisa dibaca sama sekali. Sudah dibayar tiga
   kali di berkas uji lain (uji-analytics, uji-catatan-wajib-dw,
   uji-kuota-cache); ini kali keempat.

   Blok yang jatuh jadi SATU asersi merah tersendiri — yang sekaligus menjaga
   perilaku yang benar: halaman yang gagal digambar tidak boleh diam. */
async function aman(nama, fn) {
  try { await fn(); }
  catch (e) { gagal++; console.log('  GAGAL ' + nama + '  -> ' + String((e && e.message) || e).slice(0, 180)); }
}

/* ================= FIXTURE =================
   Dirancang supaya TIAP KESALAHAN MEMBERI HASIL YANG BERBEDA:

     2 Agu  Ice Kopi     Rp100.000  Sari  "Ganti Produk"
     2 Agu  Nasi Goreng  Rp150.000  Sari  "ganti produk"   <- huruf beda
     5 Agu  Lychee Tea   Rp 50.000  Budi  "Salah input"    <- DIBATALKAN

   yang benar                  : 2 catatan · Rp250.000 · 1 pencatat · 2 alasan?
                                 TIDAK — alasannya digabung jadi 1
   pembatalan ikut dijumlahkan : Rp300.000 · 3 catatan · 2 pencatat
   alasan tidak digabung       : 2 baris alasan, bukan 1
   Angka-angkanya sengaja tidak ada yang bertabrakan. */
const ROWS = [
  { id:'v1', tgl:'2026-08-02', bill:'SLMCL001', item:'Ice Kopi Laksamana',
    pemesan:'Meja 12', alasan:'Ganti Produk', nominal:100000, oleh:'Sari', olehId:'u-sari',
    dibuat:1000, diubah:1000, diubahOleh:'', batalAt:0, batalOleh:'', batalAlasan:'' },
  { id:'v2', tgl:'2026-08-02', bill:'SLMCL002', item:'Nasi Goreng',
    pemesan:'Meja 7', alasan:'ganti produk', nominal:150000, oleh:'Sari', olehId:'u-sari',
    dibuat:2000, diubah:2000, diubahOleh:'', batalAt:0, batalOleh:'', batalAlasan:'' },
  { id:'v3', tgl:'2026-08-05', bill:'SLMCL003', item:'Lychee Tea',
    pemesan:'Meja 3', alasan:'Salah input', nominal:50000, oleh:'Budi', olehId:'u-budi',
    dibuat:3000, diubah:3000, diubahOleh:'', batalAt:9000, batalOleh:'Sari',
    batalAlasan:'dobel dengan v1' }
];
/* Ekspor POS menyebut 9 baris item; catatan manual yang hidup cuma 2. Selisih
   7 itulah yang membuat kata "wajib" bisa diperiksa — tanpa angka pembanding,
   laporan berisi tiga baris terbaca sama meyakinkannya dengan yang lengkap. */
const POS_RINGKAS = { nBaris:9, nBill:4, qty:11, total:2696600 };

const DB_UJI = {
  daily: [{ date:'2026-08-02', food:10000000, bev:5000000, lainnya:0, discount:0,
            service_charge:750000, tax:1500000, traffic:100, bill:60,
            qty_food:50, qty_bev:40, qty_others:0,
            bd:{ marketing:[], event:[], kasir:[], self:{amount:0,disc:0} }, bdValid:true }],
  reports: {}, compliments: [], piutang: [], settings: {},
  employees: { kasir: [], marketing: [], event: [] }
};

/* POST yang benar-benar berangkat ke server. INI yang dihitung — bukan pita di
   layar. Lihat alasan nomor 2 di kepala berkas. */
let KIRIM = [];

function balas(o) {
  return { ok:true, status:200, text: async () => JSON.stringify(o), json: async () => o };
}
function stubFetch(w, opt) {
  opt = opt || {};
  w.fetch = async (url, init) => {
    const u = String(url);
    let b = {};
    try { b = init && init.body ? JSON.parse(init.body) : {}; } catch (e) {}

    if (u.indexOf('action=voidList') > -1) {
      if (opt.listGagal) return balas({ ok:false, error:'server sedang bermasalah' });
      return balas({ ok:true, data:{ baris: opt.rows || ROWS, total: opt.total || (opt.rows || ROWS).length, maks:1500 } });
    }
    if (b && (b.action === 'voidSimpan' || b.action === 'voidBatal')) {
      KIRIM.push({ url:u, body:b });
      if (opt.tolakSimpan) return balas({ ok:false, error:'ditolak', kurang:['Alasan / Kronologi'] });
      return balas({ ok:true, data:{ ok:true, saved:true, id:'v-baru', baru:true } });
    }
    if (b && b.action === 'analyticsGet') {
      if (opt.posGagal) return balas({ ok:false, error:'analytics mati' });
      return balas({ ok:true, data:{ data:{ voidb: opt.tanpaPos ? {} : { '2026-08': { ringkas: POS_RINGKAS } } } } });
    }
    if (u.indexOf('account-api') > -1) return balas({ ok:true, members:[] });
    /* finance-api (Kas Kecil) — bentuknya {ok,data}. */
    if (u.indexOf('finance-api') > -1) return balas({ ok:true, data:{ pos:[], kategori:[], trx:[], akses:{}, peran:{}, total:0 } });
    if (u.indexOf('stock-api') > -1) return balas({ vendors:{} });
    return balas({ ok:true, data: DB_UJI, ts: 111 });
  };
}
function buatDom(html, url, opt) {
  opt = opt || {};
  return new JSDOM(html, {
    url, runScripts:'dangerously', pretendToBeVisual:true, virtualConsole:new VirtualConsole(),
    beforeParse(w) {
      w.Chart = function () {}; w.Chart.prototype.destroy = function () {};
      w.HTMLCanvasElement.prototype.getContext = () => ({});
      w.alert = () => {}; w.print = () => {}; w.scrollTo = () => {};
      w.confirm = () => true;
      w.prompt = () => (opt.prompt === undefined ? 'salah ketik nominal' : opt.prompt);
      w.HTMLElement.prototype.scrollIntoView = function () {};
      try {
        w.localStorage.setItem('lm_session', JSON.stringify({
          expiry: Date.now() + 3600000, userId:'u-sari', name:'Sari',
          token: opt.tanpaToken ? '' : 'TOKEN-UJI',
          modules: opt.modules || ['cashier','finance'], adminModules: []
        }));
      } catch (e) {}
      stubFetch(w, opt);
    }
  });
}
async function siap(w, syarat) {
  for (let i = 0; i < 260; i++) {
    try { if (w.eval(syarat)) return true; } catch (e) {}
    await tunggu(50);
  }
  return false;
}
/* Menu diklik SUNGGUHAN, bukan lewat go(). Tautan yang tergambar tapi tidak
   tersambung ke penangan apa pun terlihat persis sama di layar sampai ada
   yang menekannya. */
function klikMenu(w, view) {
  const a = w.document.querySelector('.nav a[data-view="' + view + '"]');
  if (!a) return false;
  a.dispatchEvent(new w.MouseEvent('click', { bubbles:true }));
  return true;
}
/* Mengiris SATU kartu menurut <h3>-nya. Irisan berjendela tetap (slice N huruf)
   memakan kartu sebelahnya, dan asersinya lalu cocok dengan sel yang BUKAN yang
   diuji — tabel Rincian di bawah memang memuat kedua ejaan alasan, jadi asersi
   "digabung jadi satu baris" MERAH untuk kode yang benar. Bentuk yang sama sudah
   menggigit di kolom Kontribusi, di kartu kelompok halaman Kategori, dan di
   Rekap Kanal modul Analytics. */
function kartuJudul(html, judul) {
  const i = html.indexOf('>' + judul + '<');
  if (i < 0) return '';
  const j = html.indexOf('<h3', i + 1);
  return j > i ? html.slice(i, j) : html.slice(i);
}
/* Invarian DUA ARAH: tiap kunci TITLES punya barisnya di sidebar, dan tiap
   baris sidebar punya judulnya. Ini yang akan menangkap halaman BERIKUTNYA —
   bukan nama 'voidb'. */
function invarianMenu(w, label) {
  const judul = Object.keys(w.eval('TITLES'));
  const menu = [...w.document.querySelectorAll('.nav a[data-view]')].map(a => a.dataset.view);
  const tanpaMenu = judul.filter(k => menu.indexOf(k) < 0);
  const tanpaJudul = menu.filter(k => judul.indexOf(k) < 0);
  cek(label + ': tiap halaman di TITLES punya menunya', tanpaMenu.length === 0, tanpaMenu.join(','));
  cek(label + ': tiap menu punya judulnya di TITLES', tanpaJudul.length === 0, tanpaJudul.join(','));
}

(async () => {
  /* ============ 0. KONTRAK SISI SERVER ============ */
  console.log('\n== Sisi server (php-parser + kontrak sumber) ==');
  {
    let P = null;
    try { P = require('php-parser'); } catch (e) { P = null; }
    if (!P) { lewat++; console.log('  LEWAT php-parser tidak terpasang — sintaks PHP tidak diperiksa'); }
    else {
      for (const [nama, src] of [['lib_kompas_mysql.php', PHP_LIB], ['api.php', PHP_API]]) {
        let e2 = null;
        try { new P({}).parseCode(src, nama); } catch (e) { e2 = e.message; }
        cek('sintaks ' + nama, e2 === null, e2);
      }
    }

    /* Tabelnya lahir sendiri. Berkas migrasi di repo ini rutin tertinggal di
       produksi, dan tabel yang cuma ada di dev berarti endpoint yang 500 di
       satu server dan 200 di server sebelahnya. */
    cek('tabel void_log lahir lewat CREATE TABLE IF NOT EXISTS, bukan migrasi',
        /function void_pastikan[\s\S]{0,400}CREATE TABLE IF NOT EXISTS `void_log`/.test(PHP_LIB));
    cek('tidak ada berkas migrasi baru untuk void',
        !fs.readdirSync(path.join(ROOT, 'kompas-mysql')).some(f => /migrasi.*void/i.test(f)));

    /* PEMBATALAN, BUKAN PENGHAPUSAN. Ini asersi yang paling penting di blok
       ini: begitu ada DELETE, seluruh gunanya sebagai catatan
       pertanggungjawaban hilang dan tidak ada satu pun layar yang bisa
       mengatakannya. */
    cek('TIDAK ADA DELETE terhadap void_log di mana pun',
        !/DELETE\s+FROM\s+`?void_log`?/i.test(PHP_LIB + PHP_API));
    cek('pembatalan menulis batal_at, bukan menghapus barisnya',
        /function void_batal[\s\S]{0,900}UPDATE `void_log` SET `batal_at`/.test(PHP_LIB));
    cek('alasan pembatalan wajib di server',
        /function void_batal[\s\S]{0,600}\$alasan === ''[\s\S]{0,120}wajib/i.test(PHP_LIB));

    /* Nama pencatat dari SESI, bukan dari badan permintaan. */
    const blokApi = (PHP_API.match(/voidSimpan' \|\| \$action === 'voidBatal'[\s\S]{0,1400}/) || [''])[0];
    cek('aksi tulis memanggil sesi_user()', /\$u = sesi_user\(\$body\);/.test(blokApi));
    cek('aksi tulis menolak sesi tak dikenal', /if \(!\$u\) sesi_tolak_tak_dikenal\(\);/.test(blokApi));
    cek('aksi tulis menuntut modul cashier atau finance',
        /sesi_punya_modul\(\$u, 'cashier'\)[\s\S]{0,80}sesi_punya_modul\(\$u, 'finance'\)/.test(blokApi));
    cek('nama pencatat diambil dari SESI, bukan dari body',
        /\$nama = isset\(\$u\['name'\]\)/.test(blokApi) && !/\$body\['oleh'\]|\$body\['by'\]/.test(blokApi),
        blokApi.slice(0, 160));
    /* Kalau ini lolos, "siapa yang input" bisa diketik siapa saja dan seluruh
       laporan di Kas Kecil berhenti berarti. */
    cek('void_simpan menerima nama sebagai ARGUMEN, bukan membacanya dari data',
        /function void_simpan\(\$d, \$oleh, \$olehId\)/.test(PHP_LIB) &&
        !/function void_simpan[\s\S]{0,2500}\$d\['oleh'\]/.test(PHP_LIB));

    /* Dihitung dari baris yang sudah terpotong, angka "N tidak ditampilkan"
       selalu nol dan pemotongannya tidak pernah bisa diketahui siapa pun. */
    cek('jumlah baris dihitung SEBELUM LIMIT',
        PHP_LIB.indexOf("str_replace('SELECT *', 'SELECT COUNT(*)'") <
        PHP_LIB.indexOf("' ORDER BY `tgl` DESC, `dibuat` DESC LIMIT '"));

    /* `2026-02-31` lolos regex tapi MySQL menyimpannya jadi 0000-00-00 tanpa
       satu pun galat, dan barisnya lalu hilang dari setiap penyaring bulan. */
    cek('tanggal diperiksa checkdate, bukan cuma pola', /function void_tgl_sah[\s\S]{0,320}checkdate\(/.test(PHP_LIB));

    /* Nominal minus MENAMBAH omset. DIJEPIT ke badan void_simpan(): berkas
       ini juga memuat penjaga setoran yang memang menolak nol, dan asersi
       yang menyapu seluruh berkas cocok dengan penjaga ITU — merah untuk kode
       yang benar. */
    const blokSimpan = (PHP_LIB.match(/function void_simpan\([\s\S]*?\r?\n\}/) || [''])[0];
    cek('badan void_simpan terbaca', blokSimpan.length > 400, blokSimpan.length);
    cek('nominal minus ditolak server', /\$nominal < 0\)[\s\S]{0,140}tidak boleh minus/i.test(blokSimpan));
    /* Void yang terjadi sebelum barangnya dibuat memang tidak bernilai rupiah;
       menolak nol cuma memaksa orang mengetik angka karangan supaya formnya
       mau lewat. */
    cek('nominal NOL tetap diterima', !/\$nominal <= 0/.test(blokSimpan));

    /* PDO::ATTR_EMULATE_PREPARES=false mengikat penanda MENURUT POSISI: satu
       nama yang dipakai dua kali gagal dengan SQLSTATE[HY093] yang tidak
       menyebut kolom apa pun. Sudah kejadian di simpan_pekerja modul DW. */
    /* HANYA klausa VALUES-nya. Jendela huruf yang lebih lebar ikut menelan
       array ->execute() di bawahnya, tempat tiap penanda memang muncul untuk
       KEDUA kalinya — asersinya lalu merah untuk kode yang benar. */
    const ins = (PHP_LIB.match(/INSERT INTO `void_log`[\s\S]*?VALUES \(([^)]*)\)/) || ['', ''])[1];
    const penanda = ins.match(/:[a-z0-9_]+/gi) || [];
    cek('klausa VALUES INSERT terbaca', penanda.length >= 10, penanda.join(','));
    const kembar = penanda.filter((x, i) => penanda.indexOf(x) !== i);
    cek('tiap penanda bernama di INSERT dipakai sekali', kembar.length === 0, kembar.join(','));
  }

  /* ============ 1. MODUL CASHIER ============ */
  console.log('\n== Modul Cashier: menu & bentuk halaman ==');
  let W = null;
  {
    const dom = buatDom(HTML_CASHIER, 'https://team.laksamanamuda.id/cashier/');
    W = dom.window;
    const ok = await siap(W, 'typeof DB !== "undefined" && DB && typeof viewVoid === "function"');
    cek('modul Cashier boot', ok);
    if (!ok) { console.log('  (boot gagal — sisa uji Cashier dilewati)'); }
    else {
      invarianMenu(W, 'Cashier');
      const a = W.document.querySelector('.nav a[data-view="voidb"]');
      cek('menu Void Menu ada di sidebar', !!a);
      /* Menu yang ada tapi tersembunyi sama saja tidak ada bagi yang
         mencarinya — dan dari sumber berkas keduanya terlihat identik. */
      cek('menunya tidak disembunyikan', !!a && a.style.display !== 'none', a && a.style.display);
      /* Menu tanpa tulisan tidak bisa ditemukan mata siapa pun, dan dari
         querySelector ia terlihat persis sama dengan menu yang sehat. */
      cek('menunya punya label yang terbaca', !!a && a.textContent.trim().length > 2,
          a && JSON.stringify(a.textContent));
      cek('menunya benar-benar tersambung (diklik sungguhan)', klikMenu(W, 'voidb'));
      await tunggu(250);
      sama('halaman aktifnya voidb', W.eval('CURRENT'), 'voidb');
      sama('judul halaman terpasang', W.document.getElementById('pageTitle').textContent, 'Void Menu');

      const d = W.document;
      /* Keenam isian yang diminta user, satu per satu. */
      [['vd_item','Nama Item'], ['vd_bill','Nomor Bill'], ['vd_pemesan','Siapa yang Memesan'],
       ['vd_alasan','Alasan / Kronologi'], ['vd_nominal','Nominal']].forEach(([id, label]) => {
        cek('isian ' + label + ' digambar', !!d.getElementById(id));
      });
      cek('Tanggal terisi hari ini dan bisa diubah', !!d.getElementById('vd_cal'));
      sama('tanggal bawaannya hari ini', W.eval('voidDate'), W.eval('todayISO()'));

      /* Daftar hari itu — bukan sebulan. Kasir yang menutup shift bertanya
         "malam ini apa saja", bukan "sebulan ini siapa". */
      W.eval('voidDate="2026-08-02"; VD_MUAT="";');
      W.eval('render()');
      await tunggu(300);
      const v = d.getElementById('app-view').innerHTML;
      cek('baris 2 Agustus tergambar', v.indexOf('Ice Kopi Laksamana') > -1 && v.indexOf('Nasi Goreng') > -1);
      cek('baris tanggal LAIN tidak ikut', v.indexOf('Lychee Tea') < 0,
          'halaman ini sengaja cuma memajang tanggal yang sedang dipilih');
      cek('total hari itu Rp250.000', v.indexOf('Rp250.000') > -1,
          v.slice(v.indexOf('Void '), v.indexOf('Void ') + 260));
    }
  }

  console.log('\n== Modul Cashier: "wajib" berarti DITAHAN ==');
  if (W) await aman('blok "wajib berarti ditahan" tidak sampai selesai', async () => {
    const d = W.document;
    KIRIM = [];
    /* Alasan & pemesan sengaja dibiarkan kosong. */
    d.getElementById('vd_item').value = 'Es Teh';
    d.getElementById('vd_bill').value = 'SLMCL999';
    d.getElementById('vd_alasan').value = '';
    d.getElementById('vd_pemesan').value = '';
    await W.eval('vdSimpan()');
    await tunggu(150);

    /* INI ASERSI YANG MEMBEDAKAN "ditahan" dari "diperingatkan lalu tetap
       dikirim". Keduanya terlihat sama persis di layar. */
    sama('TIDAK ada kiriman ke server saat isian wajib kosong', KIRIM.length, 0);
    cek('kotak Alasan ditandai merah', d.getElementById('vd_alasan').classList.contains('err'));
    cek('kotak Siapa yang Memesan ditandai merah', d.getElementById('vd_pemesan').classList.contains('err'));
    cek('kotak yang SUDAH diisi tidak ikut ditandai',
        !d.getElementById('vd_item').classList.contains('err'));
    const pita = d.getElementById('vd_err').innerHTML;
    cek('sebabnya disebut berikut nama kotaknya', /Alasan \/ Kronologi/.test(pita) && /Siapa yang Memesan/.test(pita), pita.slice(0, 200));
    /* Form yang ditahan harus TETAP terbuka berikut isinya — orang yang
       mengira ketikannya hilang akan mengetik ulang dari awal. */
    sama('isian yang sudah diketik tidak hilang', d.getElementById('vd_item').value, 'Es Teh');

    /* Mengetik mencabut penandanya, TANPA menggambar ulang halaman: kotak
       yang dibuat ulang kehilangan fokus dan hanya huruf pertama yang masuk. */
    const el = d.getElementById('vd_alasan');
    el.value = 'Tamu batal pesan, sudah dikonfirmasi SPV';
    el.dispatchEvent(new W.Event('input', { bubbles:true }));
    cek('mengetik mencabut tanda merah', !el.classList.contains('err'));
    cek('kotaknya elemen yang SAMA (halaman tidak digambar ulang)',
        d.getElementById('vd_alasan') === el);

    /* Isian hidup di luar DOM, jadi memilih tanggal atau menyegarkan daftar
       tidak membuang kronologi yang baru separuh diketik. */
    d.getElementById('vd_pemesan').value = 'Meja 5';
    d.getElementById('vd_pemesan').dispatchEvent(new W.Event('input', { bubbles:true }));
    d.getElementById('vd_item').dispatchEvent(new W.Event('input', { bubbles:true }));
    W.eval('render()');
    await tunggu(120);
    sama('isian bertahan melintasi penggambaran ulang', W.document.getElementById('vd_item').value, 'Es Teh');
    sama('...termasuk kronologinya', W.document.getElementById('vd_alasan').value,
         'Tamu batal pesan, sudah dikonfirmasi SPV');
  });

  console.log('\n== Modul Cashier: simpan & batalkan ==');
  if (W) await aman('blok "simpan & batalkan" tidak sampai selesai', async () => {
    const d = W.document;
    KIRIM = [];
    d.getElementById('vd_item').value = 'Es Teh';
    d.getElementById('vd_bill').value = 'SLMCL999';
    d.getElementById('vd_pemesan').value = 'Meja 5';
    d.getElementById('vd_alasan').value = 'Tamu batal pesan';
    d.getElementById('vd_nominal').value = '25000';
    await W.eval('vdSimpan()');
    await tunggu(250);

    sama('isian lengkap DIKIRIM, sekali', KIRIM.filter(k => k.body.action === 'voidSimpan').length, 1);
    const p = (KIRIM.find(k => k.body.action === 'voidSimpan') || { body:{} }).body;
    const dt = p.data || {};
    sama('tanggalnya dari tanggal yang sedang dipilih', dt.tgl, '2026-08-02');
    sama('nama item terkirim', dt.item, 'Es Teh');
    sama('nomor bill terkirim', dt.bill, 'SLMCL999');
    sama('siapa yang memesan terkirim', dt.pemesan, 'Meja 5');
    sama('alasan terkirim', dt.alasan, 'Tamu batal pesan');
    sama('nominal terkirim sebagai angka', dt.nominal, 25000);
    /* Token sesi WAJIB ikut — endpoint tulisnya berpagar, dan tanpa ini
       kirimannya ditolak "sesi tidak dikenal" walau orangnya jelas login. */
    sama('token sesi ikut terkirim', p.sesi, 'TOKEN-UJI');
    /* Nama pencatat TIDAK boleh datang dari layar. */
    cek('nama pencatat TIDAK dikirim peramban',
        !('oleh' in dt) && !('by' in p) && !('olehId' in dt), JSON.stringify(p).slice(0, 200));
    /* Form dikosongkan hanya kalau servernya menjawab ok — kalau tidak, orang
       kehilangan ketikannya untuk kiriman yang tidak pernah sampai. */
    await tunggu(150);
    sama('form dikosongkan sesudah tersimpan', W.document.getElementById('vd_item').value, '');

    /* PEMBATALAN. Barisnya tidak hilang. */
    KIRIM = [];
    await W.eval('vdBatal("v1")');
    await tunggu(200);
    const kb = KIRIM.find(k => k.body.action === 'voidBatal');
    cek('pembatalan memanggil voidBatal, bukan penghapusan', !!kb);
    sama('alasan pembatalan ikut terkirim', kb && kb.body.alasan, 'salah ketik nominal');
    sama('id barisnya ikut', kb && kb.body.id, 'v1');
  });

  console.log('\n== Modul Cashier: baris yang dibatalkan ==');
  if (W) await aman('blok "baris dibatalkan" tidak sampai selesai', async () => {
    W.eval('voidDate="2026-08-05"; VD_MUAT="";');
    W.eval('render()');
    await tunggu(300);
    const v = W.document.getElementById('app-view').innerHTML;
    cek('baris yang dibatalkan TETAP tergambar', v.indexOf('Lychee Tea') > -1);
    cek('...dicoret', /line-through[\s\S]{0,120}Lychee Tea|Lychee Tea[\s\S]{0,40}<\/b>/.test(v));
    cek('...menyebut siapa yang membatalkan & sebabnya',
        v.indexOf('dobel dengan v1') > -1 && v.indexOf('Dibatalkan') > -1);
    /* Nominal yang sudah dinyatakan salah tidak boleh ikut menambah total. */
    const kartu = v.slice(v.indexOf('Void '), v.indexOf('Void ') + 320);
    cek('nominalnya TIDAK ikut dijumlahkan', kartu.indexOf('Rp50.000') < 0, kartu);
    cek('...dan jumlah yang dibatalkan disebut', v.indexOf('1 dibatalkan') > -1);
  });

  /* ============ 2. PANEL FINANCE > KAS KECIL ============ */
  console.log('\n== Panel Kas Kecil: menu & laporan ==');
  {
    const dom = buatDom(HTML_KAS, 'https://team.laksamanamuda.id/finance/kas/');
    const w = dom.window;
    const ok = await siap(w, 'typeof DB !== "undefined" && DB && typeof viewVoidLap === "function"');
    cek('panel Kas Kecil boot', ok);
    if (!ok) { console.log('  (boot gagal — sisa uji Kas Kecil dilewati)'); }
    else {
      invarianMenu(w, 'Kas Kecil');
      const a = w.document.querySelector('.nav a[data-view="voidb"]');
      cek('menu Laporan Void ada di sidebar', !!a);
      cek('menunya tidak disembunyikan oleh pasangMenu()', !!a && a.style.display !== 'none',
          a && a.style.display);
      cek('menunya punya label yang terbaca', !!a && a.textContent.trim().length > 2,
          a && JSON.stringify(a.textContent));
      cek('menunya benar-benar tersambung (diklik sungguhan)', klikMenu(w, 'voidb'));
      await tunggu(200);
      sama('halaman aktifnya voidb', w.eval('CURRENT'), 'voidb');

      w.eval('PERIOD="2026-08"; VL_MUAT=""; VL_POS_MUAT="";');
      w.eval('render()');
      await tunggu(400);
      const v = w.document.getElementById('app-view').innerHTML;

      /* BACA SAJA. Angka yang bisa diketik di dua tempat akan berbeda suatu
         hari, dan yang mencocokkannya tidak punya cara tahu mana yang benar. */
      const isian = [...w.document.querySelectorAll('#app-view input, #app-view textarea, #app-view select')]
        .map(e => e.id).filter(id => id !== 'vl_q');
      cek('tidak ada satu pun isian selain kotak cari', isian.length === 0, isian.join(','));
      cek('tidak ada tombol simpan void', !/vdSimpan\(|voidSimpan/.test(v), 'panel ini baca saja');
      cek('dikatakan di layar bahwa halaman ini baca saja', /baca saja/i.test(v));
      cek('...berikut di mana mengetiknya', /modul Cashier/.test(v));

      /* Rekap dihitung dari baris HIDUP saja. */
      cek('total nominal Rp250.000', v.indexOf('Rp250.000') > -1,
          v.slice(v.indexOf('Total Nominal Void'), v.indexOf('Total Nominal Void') + 200));
      cek('yang dibatalkan TIDAK ikut (Rp300.000 tidak muncul)', v.indexOf('Rp300.000') < 0);
      cek('jumlah yang dibatalkan disebut terpisah',
          /Dibatalkan[\s\S]{0,180}>1</.test(v), v.slice(v.indexOf('Dibatalkan'), v.indexOf('Dibatalkan') + 180));

      /* Alasan beda huruf besar-kecil DIGABUNG, ejaan pertama yang tampil.
         Tidak digabung, baris teratasnya terbelah dua. */
      const kAlasan = kartuJudul(v, 'Alasan Void');
      cek('alasan beda huruf besar-kecil digabung jadi SATU baris',
          (kAlasan.match(/>Ganti Produk</g) || []).length === 1 && kAlasan.indexOf('>ganti produk<') < 0,
          kAlasan.slice(0, 320));
      cek('...dan jumlahnya 2 catatan', /Ganti Produk<\/b><\/td><td class="num mono">2</.test(kAlasan),
          kAlasan.slice(kAlasan.indexOf('Ganti Produk'), kAlasan.indexOf('Ganti Produk') + 160));
      cek('alasan milik baris yang dibatalkan tidak ikut', kAlasan.indexOf('Salah input') < 0);

      /* Siapa yang mencatat. Budi hanya punya baris yang dibatalkan, jadi ia
         memang tidak boleh muncul — kalau muncul, rekapnya menghitung baris
         yang sudah dinyatakan salah. */
      const kOrang = kartuJudul(v, 'Siapa yang Mencatat');
      cek('pencatatnya Sari', kOrang.indexOf('Sari') > -1);
      cek('Budi tidak muncul (barisnya dibatalkan)', kOrang.indexOf('Budi') < 0, kOrang.slice(0, 300));

      /* PEMBANDING POS — ini yang membuat kata "wajib" bisa diperiksa. */
      cek('pembanding POS menyebut 9 item', /Pembanding POS[\s\S]{0,260}>9</.test(v),
          v.slice(v.indexOf('Pembanding POS'), v.indexOf('Pembanding POS') + 260));
      cek('...dan menyebut 7 yang belum ada keterangannya',
          /<b>7<\/b> belum ada keterangannya/.test(v),
          v.slice(v.indexOf('Pembanding POS'), v.indexOf('Pembanding POS') + 300));

      /* Rincian memuat SELURUH baris termasuk yang dibatalkan — itu gunanya
         pembatalan yang tidak menghapus. */
      const kRinci = kartuJudul(v, 'Rincian Catatan');
      cek('rincian memuat baris yang dibatalkan', kRinci.indexOf('Lychee Tea') > -1);
      cek('rincian memuat seluruh tanggal', kRinci.indexOf('2026-08-02') > -1 && kRinci.indexOf('2026-08-05') > -1);

      /* Kotak cari menggambar ulang WADAHNYA saja. */
      const kotak = w.document.getElementById('vl_q');
      cek('kotak cari digambar', !!kotak);
      if (kotak) {
      kotak.value = 'nasi';
      kotak.dispatchEvent(new w.Event('input', { bubbles:true }));
      await tunggu(60);
      const isi = w.document.getElementById('vl_isi').innerHTML;
      cek('mencari menyaring daftarnya', isi.indexOf('Nasi Goreng') > -1 && isi.indexOf('Lychee Tea') < 0,
          isi.slice(0, 200));
      cek('kotaknya elemen yang SAMA (halaman tidak digambar ulang)',
          w.document.getElementById('vl_q') === kotak);
      kotak.value = 'zzz';
      kotak.dispatchEvent(new w.Event('input', { bubbles:true }));
      await tunggu(60);
      cek('kata kunci tanpa hasil DIKATAKAN, bukan tabel kosong',
          /Tidak ada catatan yang cocok/.test(w.document.getElementById('vl_isi').innerHTML));
      }
      dom.window.close();
    }
  }

  /* Pembanding yang belum ada DIBEDAKAN dari yang gagal dibaca: yang satu
     menyuruh mengunggah berkas, yang satu menyuruh memeriksa modul lain. */
  console.log('\n== Panel Kas Kecil: pembanding POS yang belum ada ==');
  {
    const dom = buatDom(HTML_KAS, 'https://team.laksamanamuda.id/finance/kas/', { tanpaPos:true });
    const w = dom.window;
    if (await siap(w, 'typeof viewVoidLap === "function" && DB')) {
      w.eval('CURRENT="voidb"; PERIOD="2026-08"; VL_MUAT=""; VL_POS_MUAT=""; render();');
      await tunggu(400);
      const v = w.document.getElementById('app-view').innerHTML;
      cek('bulan tanpa ekspor POS dikatakan sebabnya', /belum ada[\s\S]{0,220}Cancel Menu Detail/.test(v),
          v.slice(v.indexOf('Pembanding POS'), v.indexOf('Pembanding POS') + 300));
      cek('...dan TIDAK ditulis sebagai nol', !/Pembanding POS[\s\S]{0,200}>0</.test(v));
    } else { gagal++; console.log('  GAGAL boot (tanpa pos)'); }
    dom.window.close();
  }

  console.log('\n== Panel Kas Kecil: daftar gagal dibaca ==');
  {
    const dom = buatDom(HTML_KAS, 'https://team.laksamanamuda.id/finance/kas/', { listGagal:true });
    const w = dom.window;
    if (await siap(w, 'typeof viewVoidLap === "function" && DB')) {
      w.eval('CURRENT="voidb"; PERIOD="2026-08"; VL_MUAT=""; VL_POS_MUAT=""; render();');
      await tunggu(400);
      const v = w.document.getElementById('app-view').innerHTML;
      /* Halaman kosong tanpa sebab terbaca sebagai "bulan ini memang tidak ada
         void", dan itu kesimpulan yang tidak ditanggung datanya. */
      cek('kegagalan baca DIKATAKAN', /tidak terbaca dari server/i.test(v));
      cek('...berikut penegasan datanya tidak hilang', /tidak hilang/.test(v));
    } else { gagal++; console.log('  GAGAL boot (list gagal)'); }
    dom.window.close();
  }

  /* ============ 3. BERKAS KEMBAR ============ */
  console.log('\n== Daftar isian wajib: layar vs server ==');
  {
    /* Beda satu huruf tidak melempar: layar cuma berhenti menandai kotak yang
       salah, lalu kirimannya ditolak server dengan pesan yang menyebut field
       yang tidak ada di form mana pun. */
    const phpBlok = (PHP_LIB.match(/function void_wajib\(\)[\s\S]{0,420}?\}/) || [''])[0];
    const phpKunci = [...phpBlok.matchAll(/'([a-z]+)'\s*=>/g)].map(m => m[1]);
    const jsKunci = W ? W.eval('VOID_WAJIB.map(function(x){return x[0];})') : [];
    const jsArr = Array.isArray(jsKunci) ? Array.from(jsKunci) : [];
    /* `tgl` ada di server tapi tidak di daftar layar — di layar ia kendali
       kalender yang selalu terisi, jadi tidak pernah bisa kosong. Yang
       dibandingkan sisanya. */
    const phpTanpaTgl = phpKunci.filter(k => k !== 'tgl').sort();
    cek('server mewajibkan tgl juga', phpKunci.indexOf('tgl') > -1);
    cek('daftar wajib layar = daftar wajib server (di luar tgl)',
        phpTanpaTgl.join(',') === jsArr.slice().sort().join(','),
        'php=' + phpTanpaTgl.join(',') + '  js=' + jsArr.slice().sort().join(','));
    /* Label yang dipakai server untuk menandai kotak di layar harus persis
       sama dengan label di daftar layar — itu yang dicocokkan vdSimpan(). */
    const phpLabel = (phpBlok.match(/=> '([^']+)'/g) || []).map(s => s.slice(4, -1)).filter(x => x !== 'Tanggal');
    const jsLabel = W ? Array.from(W.eval('VOID_WAJIB.map(function(x){return x[1];})')) : [];
    cek('label wajibnya juga sama persis',
        phpLabel.slice().sort().join('|') === jsLabel.slice().sort().join('|'),
        'php=' + phpLabel.join('|') + '  js=' + jsLabel.join('|'));
  }
  if (W) W.close();

  console.log('\nLULUS ' + lulus + '  GAGAL ' + gagal + (lewat ? '  LEWAT ' + lewat : ''));
  process.exit(gagal ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
