/* uji-revisi-konten.js — empat revisi menu modul Konten (18 September 2026)
 *
 *   node tools/uji-revisi-konten.js
 *   JSDOM_PATH=/jalur/ke/jsdom node tools/uji-revisi-konten.js
 *
 * Permintaan user: (1) Kru & Rangkap Kerja jadi tabel seperti Kelola Kru di
 * modul Finance, (2) Workload dicabut, (3) Content Bank dicabut, (4) Report
 * Percakapan jadi analisa — Ads mana yang paling top dari sisi jumlah chat DAN
 * dari sisi biaya per chat, plus videonya yang mana; link videonya diisi di
 * Ads Management.
 *
 * Yang dijaga di sini, dan tiap-tiapnya gagal DIAM kalau lepas:
 *
 *  1. PENCABUTAN YANG LENGKAP. Satu rujukan yang tertinggal untuk fungsi yang
 *     sudah dibuang adalah ReferenceError, dan gejalanya LAYAR PUTIH tanpa
 *     satu kata pun yang menyebut sebabnya. Ujinya membuang komentar dulu
 *     sebelum mencari — sejarah kenapa sesuatu dicabut justru harus tetap
 *     boleh menyebut namanya; yang dilarang PEMAKAIANNYA.
 *
 *  2. DATANYA TIDAK IKUT DICABUT. DB.bank tetap dikirim ke server pada
 *     penyimpanan berikutnya. Kalau tidak, ide yang terlanjur tersimpan hilang
 *     dari database pada simpan pertama sesudah halamannya dicabut — dan tidak
 *     ada satu pun galat yang menyebutkannya.
 *
 *  3. BIAYA PER CHAT DITAHAN, bukan nol. Iklan yang dana keluarnya belum diisi
 *     akan SELALU menang sebagai "termurah" dengan Rp0 per chat — angka
 *     terkecil yang tidak akan dipertanyakan siapa pun.
 *
 *  4. LINK VIDEO TANPA PROTOKOL. Disimpan apa adanya, href-nya dibaca peramban
 *     sebagai jalur RELATIF: tombolnya membuka halaman modul ini sendiri, dan
 *     yang mengkliknya mengira videonya sudah dihapus.
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
const cek = (n, s, k) => { if (s) { ok++; console.log('  OK   ' + n); } else { gagal++; console.log('  GAGAL ' + n + (k ? '  -> ' + k : '')); } };
const sama = (n, d, h) => cek(n, d === h, 'dapat ' + JSON.stringify(d) + ', harusnya ' + JSON.stringify(h));
const aman = (n, fn) => { try { fn(); } catch (e) { gagal++; console.log('  GAGAL ' + n + '  -> melempar: ' + e.message); } };
const tunggu = ms => new Promise(r => setTimeout(r, ms));

const SRC = fs.readFileSync(path.join(ROOT, 'deploy/konten/index.html'), 'utf8');
const ASET = fs.readFileSync(path.join(ROOT, 'deploy/assets/performa-konten.js'), 'utf8');
/* Komentar dibuang sebelum mencari pemakaian — JS maupun HTML. Sejarahnya
   harus tetap boleh menyebut nama yang dicabut. Pola yang sama dengan
   tools/uji-tanpa-target.js. */
const KODE = SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/<!--[\s\S]*?-->/g, '');

const POST = [];
function buka() {
  let h = SRC.replace('<script src="../assets/performa-konten.js"><' + '/script>',
    () => '<script>' + ASET + '<' + '/script>');
  const k = 'return API;';
  if (h.split(k).length - 1 !== 1) { console.error('jangkar IIFE tidak ketemu'); process.exit(2); }
  h = h.replace(k, 'window.__uji = function(src){ return eval(src); };' + k);
  return new JSDOM(h, {
    url: 'https://dev.laksamanamuda.id/konten/', runScripts: 'dangerously',
    pretendToBeVisual: true, virtualConsole: new VirtualConsole(),
    beforeParse(w) {
      w.alert = () => {}; w.confirm = () => true; w.scrollTo = () => {};
      try {
        w.localStorage.setItem('lm_session', JSON.stringify({
          expiry: Date.now() + 3600000, userId:'u1', name:'Uji Kru',
          modules:['*'], adminModules:['*'] }));
      } catch (e) {}
      w.fetch = async (url, init) => {
        if (init && init.method === 'POST') { try { POST.push(JSON.parse(init.body)); } catch (e) {} }
        return { ok:true, status:200,
          text: async () => JSON.stringify({ ok:true, data:{ bentrok:[] } }),
          json: async () => ({ ok:true, data:{ bentrok:[] } }) };
      };
    }
  });
}

/* ===================== DATA UJI =====================

   Angkanya dipilih supaya tiap kesalahan memberi hasil yang BERBEDA:

     a1 Promo Kopi Reel      120 chat   Rp1.000.000 +11% = 1.110.000  -> Rp 9.250/chat
     a2 Menu Baru TikTok      40 chat   Rp  180.000 +11% =   199.800  -> Rp 4.995/chat  <- TERMURAH
     a3 Tanpa Dana            90 chat   dana BELUM diisi              -> DITAHAN
     a4 Reel Sama Dipakai     30 chat   Rp  500.000 +11% =   555.000  -> Rp18.500/chat

   a1 dan a4 memakai tautan video yang SAMA tapi DITULIS BEDA (a4 tanpa
   protokol) -> wajib digabung jadi 150 chat / 2 iklan. Ditulis sama persis,
   penggabungannya tidak menuntut perapian tautan sama sekali dan mutasi yang
   mencabutnya lolos tanpa satu angka pun bergerak.
   a2 tautannya TANPA PROTOKOL -> wajib dirapikan jadi https://, kalau tidak ia
   berdiri sebagai baris video yang berbeda DAN tombolnya membuka halaman ini.

     total chat            = 280
     dana (yang berchat)   = 1.864.800
     biaya per chat gabung = 6.660                                          */
const ADS = [
  { id:'a1', name:'Promo Kopi Reel', brand:'b1', platform:'Meta Ads', objective:'Leads', status:'active',
    target:'Lokal', chats:120, startDate:'2026-09-02',
    expenses:[{ date:'2026-09-02', purpose:'Boosting', amount:1000000 }],
    videoUrl:'https://www.instagram.com/reel/AAA/' },
  { id:'a2', name:'Menu Baru TikTok', brand:'b1', platform:'TikTok Ads', objective:'Traffic', status:'active',
    target:'Umum', chats:40, startDate:'2026-09-04',
    expenses:[{ date:'2026-09-04', purpose:'Ads', amount:180000 }],
    videoUrl:'tiktok.com/@lm/video/123' },
  { id:'a3', name:'Tanpa Dana', brand:'b1', platform:'Meta Ads', objective:'Leads', status:'active',
    target:'Retarget', chats:90, startDate:'2026-09-06', expenses:[], videoUrl:'' },
  { id:'a4', name:'Reel Sama Dipakai Lagi', brand:'b1', platform:'Meta Ads', objective:'Leads', status:'active',
    target:'Lookalike', chats:30, startDate:'2026-09-08',
    expenses:[{ date:'2026-09-08', purpose:'Boosting', amount:500000 }],
    videoUrl:'www.instagram.com/reel/AAA/' },
  /* IKLAN AWARENESS YANG TIDAK MENGHASILKAN CHAT. Tanpa satu pun baris
     seperti ini, 'iklan yang berchat' dan 'seluruh iklan bulan itu' adalah
     daftar yang SAMA — dan mutasi yang menjumlahkan dana keluar dari daftar
     yang salah tidak menggeser satu angka pun. Dananya Rp300.000 +11% =
     Rp333.000, jadi kalau ia ikut, biaya per chat gabungan langsung meleset. */
  { id:'a6', name:'Awareness Tanpa Chat', brand:'b1', platform:'Meta Ads', objective:'Awareness',
    status:'active', target:'Umum', chats:0, startDate:'2026-09-10',
    expenses:[{ date:'2026-09-10', purpose:'Awareness', amount:300000 }], videoUrl:'' },
  /* BULAN SEBELAH — tapis bulannya wajib membuangnya. Chatnya sengaja jauh
     lebih besar daripada baris mana pun: kalau ia ikut, tidak ada satu angka
     pun di halaman ini yang masih cocok. */
  { id:'a5', name:'Bulan Lalu', brand:'b1', platform:'Meta Ads', objective:'Leads', status:'ended',
    target:'Umum', chats:9999, startDate:'2026-08-10',
    expenses:[{ date:'2026-08-10', purpose:'Boosting', amount:100 }], videoUrl:'' }
];
const USERS = [
  { id:'u1', name:'Uji Kru', roles:['content_director','designer'], division:'Konten', email:'a@b.c',
    capacity:10, skills:['Reel','Copy'], avail:'available', workHours:'09-18' },
  { id:'u2', name:'Budi Desain', roles:['designer'], division:'Desain', email:'b@b.c',
    capacity:5, skills:[], avail:'busy', workHours:'10-19' }
];
/* Budi memegang 6 tugas aktif dengan kapasitas 5 -> 120%, di atas ambang
   overload. Uji Kru 0 dari 10 -> 0%. Dua angka yang tidak mungkin tertukar. */
/* SATU konten TAYANG berikut angka performanya — tanpa itu halaman Performa
   Konten berhenti di pita 'belum ada angka performa' dan saklar urutannya
   (Reach / Engagement Rate / Virality Index / CTA) tidak pernah digambar,
   jadi asersi tombol aktifnya tidak menguji apa pun. Status Posted TIDAK
   dihitung sebagai tugas aktif, jadi angka beban u2 di bawah tidak bergeser. */
const KONTEN = [{ id:'cp1', pic:'u1', status:'Posted', platforms:['IG'], pillar:'Promotion',
    publishDate:'2026-09-02', prod:{}, perf:{ IG:{ reach:1000, likes:80, shares:6, saves:4, cta:20 } } }]
  .concat(['c1','c2','c3','c4','c5','c6'].map((id, i) =>
  ({ id, pic:'u2', status:i < 2 ? 'Script' : 'Idea', deadline:'2026-09-20', platforms:['IG'], prod:{} })));

(async () => {

/* ============ 1. SUMBER: pencabutan yang lengkap ============ */
console.log('\n== Sumber: Content Bank & Workload dicabut ==');
aman('tidak ada lagi pemakaian fungsi yang dibuang', () => {
  ['VIEWS.bank', 'VIEWS.workload', 'VIEWS.reports', 'VIEWS.team', 'openBankForm', 'saveBank', 'delBank', 'convertBank']
    .forEach(nm => cek('tidak ada pemakaian ' + nm, KODE.indexOf(nm) < 0,
      'masih ada di ' + JSON.stringify(KODE.slice(Math.max(0, KODE.indexOf(nm) - 40), KODE.indexOf(nm) + 40))));
  cek("NAV tidak punya item 'bank'", KODE.indexOf("{v:'bank'") < 0);
  cek("NAV tidak punya item 'workload'", KODE.indexOf("{v:'workload'") < 0);
  cek('VIEW_PERM tidak punya baris workload', KODE.indexOf("workload:'team'") < 0);
  cek("NAV tidak punya item 'reports'", KODE.indexOf("{v:'reports'") < 0);
  cek("NAV tidak punya item 'team'", KODE.indexOf("{v:'team'") < 0);
  cek('VIEW_PERM tidak punya baris reports', KODE.indexOf("reports:'reports'") < 0);
});
aman('sejarahnya TETAP boleh menyebutnya', () => {
  /* Yang dilarang pemakaiannya, bukan namanya. Komentar yang menjelaskan
     kenapa sesuatu dicabut justru harus tetap ada — tanpa itu, yang
     membacanya berikutnya akan mengira halamannya hilang karena kelalaian. */
  cek('komentar pencabutan Content Bank masih ada', SRC.indexOf('HALAMAN CONTENT BANK DICABUT') > 0);
  cek('komentar pencabutan Workload masih ada', SRC.indexOf('HALAMAN WORKLOAD DICABUT') > 0);
});
aman('datanya tidak ikut dicabut', () => {
  cek('DB.bank tetap dijaga bentuknya di initAPI', KODE.indexOf('DB.bank = DB.bank || []') > 0);
  cek("'bank' tetap di KT_COLS", /KT_COLS\s*=\s*\[[^\]]*'bank'/.test(KODE), 'tidak ketemu di KT_COLS');
  cek("'bank' tetap di seed()", KODE.indexOf('bank:[]') > 0);
});

/* ============ 2. MODUL DIJALANKAN ============ */
const d = buka();
await tunggu(700);
const w = d.window;
cek('modul Konten boot', typeof w.__uji === 'function');
w.__uji("DB.brands=[{id:'b1',name:'Laksamana Muda',color:'#A9791F'}];brandFilter='all';"
  + 'DB.ads=' + JSON.stringify(ADS) + ';DB.users=' + JSON.stringify(USERS) + ';'
  + 'DB.content=' + JSON.stringify(KONTEN) + ";DB.bank=[{id:'bk1',title:'Ide Lama',brand:'b1',status:'idea'}];");
const layar = () => (w.document.getElementById('view') || { innerHTML:'' }).innerHTML;

console.log('\n== Halaman yang dicabut tidak bisa dicapai ==');
aman('sidebar & router', () => {
  const menu = [...w.document.querySelectorAll('.nav-item')].map(e => e.dataset.v);
  cek('menu Content Bank tidak ada di sidebar', menu.indexOf('bank') < 0, menu.join(','));
  cek('menu Workload tidak ada di sidebar', menu.indexOf('workload') < 0, menu.join(','));
  cek('menu Kru & Rangkap Kerja tidak lagi berdiri sendiri', menu.indexOf('team') < 0, menu.join(','));
  cek('menu Reports tidak ada di sidebar', menu.indexOf('reports') < 0, menu.join(','));
  cek('menu Pengaturan tetap ada', menu.indexOf('settings') >= 0, menu.join(','));
  w.__uji('route("bank")');
  /* Halamannya tidak boleh digambar lagi. route() jatuh ke "Segera hadir"
     untuk view yang tidak punya penggambar — yang penting isinya BUKAN
     halaman Content Bank. */
  cek('route("bank") tidak menggambar Bank ide', layar().indexOf('Bank ide') < 0, layar().slice(0, 120));
  w.__uji('route("workload")');
  cek('route("workload") tidak menggambar Utilisasi Tim', layar().indexOf('Utilisasi Tim') < 0, layar().slice(0, 120));
});
aman('matriks hak akses tidak memajang halaman yang sudah dicabut', () => {
  /* DB.perms produksi MASIH menyimpan kunci 'bank'. Dibiarkan lewat, matriks
     memajang baris untuk halaman yang tidak ada lagi — setelan mati yang
     disetel orang lalu bertanya-tanya kenapa tidak berpengaruh apa pun. */
  w.__uji("DB.perms = DB.perms || {}; DB.perms.bank = {analyst:2};");
  const kunci = JSON.parse(w.__uji('JSON.stringify(permModuleKeys())'));
  cek("permModuleKeys() menyaring 'bank'", kunci.indexOf('bank') < 0, kunci.join(','));
  cek('...tapi datanya masih utuh di DB.perms', w.__uji('!!DB.perms.bank'), 'kuncinya ikut terhapus');
});

/* ============ 3. KRU & RANGKAP KERJA — di dalam Pengaturan ============ */
console.log('\n== Kru & Rangkap Kerja: satu kartu di halaman Pengaturan ==');
w.__uji('route("settings")');
aman('kartunya berdiri di Pengaturan', () => {
  const h = layar();
  cek('kartu Kru digambar', h.indexOf('Kru &amp; Rangkap Kerja') >= 0 || h.indexOf('Kru & Rangkap Kerja') >= 0);
  cek('tabelnya terisi', h.indexOf('id="teamTable"') >= 0 && h.indexOf('<table>') >= 0);
  cek('kedua kru tergambar', h.indexOf('Budi Desain') >= 0 && h.indexOf('Uji Kru') >= 0);
  cek('rangkap role ditandai', h.indexOf('rangkap ×2') >= 0);
  /* Kartu Pengaturan yang lain tetap berdiri — yang digabung tabelnya, bukan
     halamannya dicabut. */
  cek('kartu Organisasi tetap ada', h.indexOf('Nama Organisasi') >= 0);
  cek('kartu Manajemen Data tetap ada', h.indexOf('Manajemen Data') >= 0);
});
aman('kolom Skill, Beban, dan Ketersediaan dicabut', () => {
  const h = layar();
  ['Skill', 'Beban', 'Ketersediaan'].forEach(k =>
    cek('kolom ' + k + ' tidak ada lagi', h.indexOf('<th>' + k + '</th>') < 0, ''));
  ['Kru', 'Divisi / Email', 'Role'].forEach(k =>
    cek('kolom ' + k + ' masih ada', h.indexOf('<th>' + k + '</th>') >= 0));
  /* Budi memegang 6 tugas aktif dengan kapasitas 5 = 120%. Angka itu satu-
     satunya sisa utilisasi di modul ini sesudah Workload dicabut, dan
     permintaan yang sama membuangnya juga — jadi ia TIDAK BOLEH muncul di
     layar mana pun lagi. */
  cek('angka utilisasi tidak tergambar di mana pun', h.indexOf('120%') < 0, 'masih menyebut 120%');
  /* DATANYA tidak ikut dicabut: yang hilang kolomnya, bukan kolom datanya. */
  cek('capacity masih tersimpan', w.__uji('DB.users.find(u=>u.id==="u2").capacity') === 5);
  cek('skills masih tersimpan', w.__uji('JSON.stringify(DB.users.find(u=>u.id==="u1").skills)') === '["Reel","Copy"]');
  cek('...dan masih bisa disunting lewat Kelola',
      KODE.indexOf("id=\"us_capacity\"") > 0 && KODE.indexOf("id=\"us_skills\"") > 0, '');
  cek('...serta tetap ikut di Ekspor Tim (CSV)', KODE.indexOf('u.capacity,(u.skills||[]).join') > 0, '');
});
aman('angka role dihitung tanpa tapis role itu sendiri', () => {
  /* Kalau ikut, pilihan yang tidak sedang dipakai selalu menulis (0), dan nol
     membaca sebagai "tidak ada yang memegang role itu". */
  w.__uji("teamFilter.role='content_director'");
  w.__uji('route("settings")');
  const h = layar();
  cek('Designer tetap menulis (2) walau tapisnya di Content Director',
      /Designer \(2\)/.test(h), (h.match(/Designer \([0-9]+\)/) || ['tidak ketemu'])[0]);
  const tabel = w.document.getElementById('teamTable').innerHTML;
  cek('tabelnya benar-benar tersaring', tabel.indexOf('Budi Desain') < 0 && tabel.indexOf('Uji Kru') >= 0, '');
  w.__uji("teamFilter.role=''"); w.__uji('route("settings")');
});
aman('kotak cari tidak dibuat ulang tiap ketukan', () => {
  const sebelum = w.document.querySelector('#teamTable') && w.document.querySelector('#view input[placeholder^="Cari nama"]');
  cek('kotak carinya ada', !!sebelum);
  w.__uji("teamF('q','budi')");
  const sesudah = w.document.querySelector('#view input[placeholder^="Cari nama"]');
  /* Kotak yang dibuat ulang kehilangan fokus dan hanya huruf pertama yang
     masuk — jebakan yang sudah dibayar queueF() di modul yang sama. */
  cek('elemen kotaknya TETAP yang itu juga', sebelum === sesudah);
  const tabel = w.document.getElementById('teamTable').innerHTML;
  cek('tabelnya tersaring', tabel.indexOf('Budi Desain') >= 0 && tabel.indexOf('Uji Kru') < 0, '');
  /* Skill tidak lagi ikut dicari: kolomnya sudah tidak ada, dan kata kunci
     yang memulangkan baris tanpa memperlihatkan SEBAB cocoknya terbaca sebagai
     hasil pencarian yang salah. */
  w.__uji("teamF('q','Reel')");
  const t2 = w.document.getElementById('teamTable').innerHTML;
  cek('mencari skill tidak lagi memulangkan siapa pun', t2.indexOf('Uji Kru') < 0, '');
  w.__uji("teamF('q','')");
});
aman('yang berhak atas Tim tetap bisa membuka Pengaturan', () => {
  /* Pengaturan dijaga kunci 'settings' (Super Admin saja) sementara daftar kru
     dijaga 'team' (Super Admin + Content Director). Digabung begitu saja,
     Content Director KEHILANGAN daftar kru yang selama ini boleh ia buka —
     pencabutan hak yang tidak pernah diminta siapa pun. */
  w.__uji('OFFICE_IS_ADMIN=false; DB.users.find(u=>u.id==="u1").roles=["content_director"];');
  cek('Content Director boleh membuka Pengaturan', w.__uji("canView('settings')") === true);
  w.__uji('route("settings")');
  const h = layar();
  cek('...dan melihat kartu Kru', h.indexOf('id="teamTable"') >= 0);
  /* Tapi TIDAK kartu yang dijaga kunci settings. */
  cek('...tanpa kartu Organisasi', h.indexOf('Nama Organisasi') < 0, '');
  cek('...tanpa kartu Manajemen Data', h.indexOf('Manajemen Data') < 0, '');
  /* Yang tidak berhak atas keduanya tidak dibiarkan menatap layar kosong. */
  w.__uji('DB.users.find(u=>u.id==="u1").roles=["video_editor"];');
  cek('role tanpa kedua kunci tidak bisa membuka Pengaturan', w.__uji("canView('settings')") === false);
  w.__uji('OFFICE_IS_ADMIN=true; DB.users.find(u=>u.id==="u1").roles=["content_director","designer"];');
  w.__uji('route("settings")');
});

/* ============ 3b. REPORTS: layarnya dicabut, ekspornya tidak ============ */
console.log('\n== Reports dicabut, ekspornya pindah ke Pengaturan ==');
aman('tombol ekspor pindah, tidak ikut hilang', () => {
  w.__uji('route("settings")');
  const h = layar();
  /* exportCSV() satu-satunya jalan mengeluarkan rekap konten & performa dari
     modul ini. Dibuang bersama halamannya, ia jadi kode mati yang tidak bisa
     dicapai siapa pun. */
  ["exportCSV('content')", "exportCSV('performance')", "exportCSV('team')"]
    .forEach(f => cek('tombol ' + f + ' ada di Pengaturan', h.indexOf(f) >= 0));
  cek('Backup JSON tetap ada', h.indexOf('backupJSON()') >= 0);
  cek('Restore JSON tetap ada', h.indexOf('restoreJSON(') >= 0);
});
aman('halaman Reports tidak bisa dicapai lagi', () => {
  w.__uji('route("reports")');
  cek('route("reports") tidak menggambar Rekap per Brand', layar().indexOf('Rekap per Brand') < 0, '');
  /* DB.perms produksi MASIH menyimpan kunci 'reports'. DISUNTIKKAN lebih dulu
     — tanpa itu kuncinya memang tidak pernah ada di data uji, dan asersi di
     bawah hijau apa pun keputusan kodenya. Cacat fixture yang sama sudah
     ditutup untuk 'bank'. */
  w.__uji('DB.perms = DB.perms || {}; DB.perms.reports = {analyst:2};');
  const kunci = JSON.parse(w.__uji('JSON.stringify(permModuleKeys())'));
  cek("matriks hak akses tidak memajang baris 'reports'", kunci.indexOf('reports') < 0, kunci.join(','));
  cek('...tapi setelannya masih utuh di DB.perms', w.__uji('!!DB.perms.reports'), 'kuncinya ikut terhapus');
});

/* ============ 3c. SAKLAR YANG AKTIF HARUS TERBACA ============ */
console.log('\n== Tombol saklar aktif di Performa Konten ==');
aman('latar & warna hurufnya menang di cascade', () => {
  w.__uji('route("analytics")');
  const btn = [...w.document.querySelectorAll('#pk-wrap .seg button')];
  cek('saklarnya digambar', btn.length >= 4, 'jumlah=' + btn.length);
  const aktif = btn.filter(b => b.className.indexOf('on') >= 0);
  cek('ada yang ditandai aktif', aktif.length >= 1);
  /* INI BUG YANG DILAPORKAN USER 18 September 2026: aturan
     `#pk-wrap .seg button` menyetel background:transparent dengan kekhususan
     (1,1,1) — lebih tinggi daripada `.seg button.on` milik modul ini (0,2,1) —
     jadi latar emasnya kalah sementara color:var(--txt-inv) TETAP berlaku.
     Hasilnya tulisan putih di atas latar terang: tombol yang sedang dipilih
     tidak terbaca sama sekali.

     Yang diperiksa `background` (shorthand), BUKAN `backgroundColor`: jsdom
     tidak bisa menghitung var() dan menormalkan backgroundColor jadi
     transparan apa pun aturan yang menang — jadi asersi lewat backgroundColor
     hijau untuk kode yang rusak MAUPUN yang benar. */
  aktif.forEach(b => {
    const bg = w.getComputedStyle(b).background;
    cek('tombol aktif ' + JSON.stringify(b.textContent.trim()) + ' punya latar, bukan transparan',
        bg.indexOf('var(--gold)') >= 0, 'background=' + JSON.stringify(bg));
  });
  const mati = btn.filter(b => b.className.indexOf('on') < 0);
  cek('yang tidak aktif tetap tanpa latar', mati.every(b => {
    const bg = w.getComputedStyle(b).background;
    return bg.indexOf('var(--gold)') < 0;
  }), '');
});

/* ============ 4. ADS: link video yang dipromosikan ============ */
console.log('\n== Ads Management: link video ==');
aman('kolom & kotak isiannya ada', () => {
  w.__uji('route("ads")');
  const h = layar();
  cek('tabel iklan punya kolom Video', h.indexOf('<th>Video</th>') >= 0);
  cek('...dan tautannya tergambar', h.indexOf('▶ Instagram') >= 0, '');
  w.__uji('openAdForm("a3")');
  cek('form punya kotak Link Video', !!w.document.getElementById('a_videoUrl'));
});
const nPost = POST.length;
await (async () => { try {
  /* Ditolak = tidak tersimpan DAN tidak dikirim. Yang diperiksa jumlah POST,
     bukan pesan di layar: "ada toast merah" tidak membuktikan kirimannya
     benar-benar ditahan. */
  w.document.getElementById('a_videoUrl').value = 'bukan tautan sama sekali';
  w.__uji('saveAd("a3")');
  sama('iklan tidak berubah', w.__uji('DB.ads.find(a=>a.id==="a3").videoUrl'), '');
  sama('dan tidak ada kiriman yang berangkat', POST.length - nPost, 0);

  w.document.getElementById('a_videoUrl').value = 'instagram.com/reel/BBB/';
  w.__uji('saveAd("a3")');
  sama('tautan tanpa protokol diberi https://',
       w.__uji('DB.ads.find(a=>a.id==="a3").videoUrl'), 'https://instagram.com/reel/BBB/');
  /* DITUNGGU. save() di modul ini mengantre lewat _saveBusy: kalau masih ada
     kiriman lain di udara (autoUpdateStatuses memicunya saat halaman Ads
     dibuka), yang ini ditandai _saveLagi dan baru berangkat SESUDAH yang
     pertama selesai. Diperiksa seketika, asersinya merah untuk kode yang
     benar. */
  await tunggu(250);
  cek('kirimannya berangkat', POST.length - nPost >= 1, 'jumlah POST=' + (POST.length - nPost));
  /* Dikembalikan supaya blok berikutnya memakai data uji yang sama. */
  w.__uji('DB.ads.find(a=>a.id==="a3").videoUrl=""');
} catch (e) { gagal++; console.log('  GAGAL link video  -> melempar: ' + e.message); } })();
aman('platform video dibaca dari HOST-nya, bukan dari platform iklan', () => {
  /* Satu iklan Meta Ads bisa mendorong reel Instagram MAUPUN video Facebook;
     ditebak dari platform iklannya, labelnya salah di separuh barisnya. */
  const p = u => JSON.parse(w.__uji('JSON.stringify(videoPlat(' + JSON.stringify(u) + '))'));
  sama('instagram', p('https://www.instagram.com/reel/A/').nama, 'Instagram');
  sama('facebook', p('https://fb.watch/xyz/').nama, 'Facebook');
  sama('tiktok', p('https://www.tiktok.com/@lm/video/1').nama, 'TikTok');
  sama('youtube', p('https://youtu.be/abc').nama, 'YouTube');
  /* Yang tidak dikenal diberi NAMANYA SENDIRI, tidak dijatuhkan ke platform
     pertama — label yang salah lebih buruk daripada label yang umum. */
  sama('host lain memakai namanya sendiri', p('https://vt.tokopedia.com/x').nama, 'vt.tokopedia.com');
  sama('kosong tidak punya platform', w.__uji('videoPlat("")'), null);
});

/* ============ 5. REPORT PERCAKAPAN — analisa ============ */
console.log('\n== Report Percakapan: analisa iklan ==');
aman('biaya per chat', () => {
  const b = id => w.__uji('adBiayaChat(DB.ads.find(a=>a.id==="' + id + '"))');
  sama('a1 Rp9.250 per chat', Math.round(b('a1')), 9250);
  sama('a2 Rp4.995 per chat', Math.round(b('a2')), 4995);
  sama('a4 Rp18.500 per chat', Math.round(b('a4')), 18500);
  /* DITAHAN untuk dua keadaan yang sama-sama menyesatkan. */
  sama('a3 (dana belum diisi) DITAHAN, bukan Rp0', b('a3'), null);
  w.__uji('DB.ads.push({id:"a9",name:"Belum Berchat",brand:"b1",platform:"Meta Ads",chats:0,startDate:"2026-09-09",expenses:[{amount:50000}]})');
  sama('iklan tanpa chat DITAHAN, bukan tak terhingga', w.__uji('adBiayaChat(DB.ads.find(a=>a.id==="a9"))'), null);
  w.__uji('DB.ads=DB.ads.filter(a=>a.id!=="a9")');
});
w.__uji("chatsFilter={bulan:'2026-09',urut:'chats'}");
w.__uji('route("chats")');
aman('kartu pokok', () => {
  const h = layar();
  cek('total percakapan 280', h.indexOf('>280<') >= 0, '');
  cek('dana keluar Rp 1.864.800', h.indexOf('Rp 1.864.800') >= 0, '');
  cek('biaya per chat gabungan Rp 6.660', h.indexOf('Rp 6.660') >= 0, '');
  /* Dana keluar yang dijumlahkan HANYA milik iklan yang berchat. Iklan
     awareness yang memang tidak diukur dengan chat ikut, biaya per chatnya
     jadi jauh lebih mahal daripada kenyataannya — dan angkanya tetap wajar. */
  cek('iklan awareness tidak ikut di dana keluar', h.indexOf('Rp 2.197.800') < 0, 'danannya ikut terjumlah');
  cek('...tapi tetap dihitung sebagai iklan periode ini', /dari 5 iklan pada periode ini/.test(h), '');
  /* Bulan sebelah wajib dibuang — 9.999 chat akan menenggelamkan semuanya. */
  cek('bulan sebelah tidak ikut', h.indexOf('9.999') < 0 && h.indexOf('Bulan Lalu') < 0, '');
});
aman('yang paling top: dua sisi yang berbeda', () => {
  const h = layar();
  const kartu = h.slice(h.indexOf('Yang Paling Top'), h.indexOf('Peringkat Iklan'));
  cek('chat terbanyak = Promo Kopi Reel', kartu.indexOf('Promo Kopi Reel') >= 0, '');
  /* INI ASERSI PALING MENENTUKAN: yang paling banyak chat BUKAN yang paling
     murah. Kalau keduanya menunjuk iklan yang sama, kartunya tidak menjawab
     apa pun — dan data ujinya sengaja dibuat supaya berbeda. */
  cek('termurah = Menu Baru TikTok, BUKAN yang chatnya terbanyak',
      kartu.indexOf('Menu Baru TikTok') >= 0, kartu.replace(/<[^>]+>/g, ' ').slice(0, 200));
  cek('video paling banyak chat: 150 chat dari 2 iklan',
      /150<\/b> chat dari 2 iklan/.test(kartu), '');
});
aman('iklan berchat tanpa dana keluar', () => {
  const h = layar();
  cek('jumlahnya disebut', /1 iklan punya chat tapi dana keluarnya belum diisi/.test(h), '');
  /* Dikecualikan dari peringkat termurah — dihitung, ia selalu menang dengan
     Rp0 per chat. */
  w.__uji("chatsFilter.urut='murah'"); w.__uji('route("chats")');
  const t = layar();
  const tabel = t.slice(t.indexOf('Peringkat Iklan'), t.indexOf('Per Video'));
  cek('tidak ikut di peringkat termurah', tabel.indexOf('Tanpa Dana') < 0, '');
  cek('...dan yang termurah berdiri di baris pertama',
      tabel.indexOf('Menu Baru TikTok') > 0 && tabel.indexOf('Menu Baru TikTok') < tabel.indexOf('Promo Kopi Reel'), '');
  w.__uji("chatsFilter.urut='chats'"); w.__uji('route("chats")');
});
aman('per video: tautan yang sama digabung', () => {
  const h = layar();
  const tabel = h.slice(h.indexOf('Per Video yang Dipromosikan'), h.indexOf('Per Platform Iklan'));
  /* a1 + a4 memakai tautan yang SAMA -> satu baris, 150 chat, 2 iklan.
     Dua baris untuk satu video membelah angkanya, dan yang membacanya akan
     menyimpulkan videonya biasa saja. */
  cek('Instagram AAA digabung jadi 150 chat', tabel.indexOf('>150<') >= 0, '');
  /* a2 tautannya tanpa protokol — kalau tidak dirapikan, ia berdiri sebagai
     baris yang berbeda dari bentuk yang sudah berprotokol. */
  cek('tautan TikTok tanpa protokol tetap terbaca', tabel.indexOf('▶ TikTok') >= 0, '');
  cek('iklan tanpa link video punya barisnya sendiri', tabel.indexOf('(tanpa link video)') >= 0, '');
  cek('...dan tidak ditebak dari nama iklannya', tabel.indexOf('Tanpa Dana') < 0, '');
});
aman('per platform iklan', () => {
  const h = layar();
  const tabel = h.slice(h.indexOf('Per Platform Iklan'));
  cek('Meta Ads tergambar', tabel.indexOf('Meta Ads') >= 0);
  cek('TikTok Ads tergambar', tabel.indexOf('TikTok Ads') >= 0);
  /* Meta Ads: 120 + 90 + 30 = 240 chat. */
  cek('chat Meta Ads dijumlahkan', tabel.indexOf('>240<') >= 0, '');
});

/* ============ 6. DATA LAMA TIDAK IKUT TERBUANG ============ */
console.log('\n== DB.bank tetap dikirim ke server ==');
await (async () => {
  try {
    const n0 = POST.length;
    await w.__uji('save()');
    await tunggu(150);
    const kirim = POST.slice(n0).filter(p => p && p.action === 'saveAll');
    cek('kiriman saveAll berangkat', kirim.length >= 1, 'jumlah=' + kirim.length);
    const bank = kirim.length && kirim[kirim.length - 1].data.bank;
    /* Halamannya dicabut, datanya tidak. Kalau `bank` berhenti ikut di
       payload, hapus_yang_hilang() di server mengosongkan tabelnya pada
       penyimpanan pertama sesudah ini — tanpa satu pun galat. */
    cek('ide lama tetap ikut di payload', Array.isArray(bank) && bank.length === 1,
        JSON.stringify(bank));
  } catch (e) { gagal++; console.log('  GAGAL jalur simpan  -> melempar: ' + e.message); }
})();

d.window.close();
console.log('\n---------------------------------------');
console.log('LULUS ' + ok + '   GAGAL ' + gagal);
process.exit(gagal ? 1 : 0);
})();
