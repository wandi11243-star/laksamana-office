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
const KONTEN = ['c1','c2','c3','c4','c5','c6'].map((id, i) =>
  ({ id, pic:'u2', status:i < 2 ? 'Script' : 'Idea', deadline:'2026-09-20', platforms:['IG'], prod:{} }));

(async () => {

/* ============ 1. SUMBER: pencabutan yang lengkap ============ */
console.log('\n== Sumber: Content Bank & Workload dicabut ==');
aman('tidak ada lagi pemakaian fungsi yang dibuang', () => {
  ['VIEWS.bank', 'VIEWS.workload', 'openBankForm', 'saveBank', 'delBank', 'convertBank']
    .forEach(nm => cek('tidak ada pemakaian ' + nm, KODE.indexOf(nm) < 0,
      'masih ada di ' + JSON.stringify(KODE.slice(Math.max(0, KODE.indexOf(nm) - 40), KODE.indexOf(nm) + 40))));
  cek("NAV tidak punya item 'bank'", KODE.indexOf("{v:'bank'") < 0);
  cek("NAV tidak punya item 'workload'", KODE.indexOf("{v:'workload'") < 0);
  cek('VIEW_PERM tidak punya baris workload', KODE.indexOf("workload:'team'") < 0);
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
  cek('menu Kru & Rangkap Kerja masih ada', menu.indexOf('team') >= 0, menu.join(','));
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

/* ============ 3. KRU & RANGKAP KERJA — versi tabel ============ */
console.log('\n== Kru & Rangkap Kerja: tabel ==');
w.__uji('route("team")');
aman('bentuk tabel', () => {
  const h = layar();
  cek('digambar sebagai tabel', h.indexOf('<table>') >= 0 && h.indexOf('id="teamTable"') >= 0);
  ['Divisi / Email', 'Role', 'Skill', 'Beban', 'Ketersediaan']
    .forEach(k => cek('kolom ' + k, h.indexOf('<th>' + k + '</th>') >= 0));
  cek('kedua kru tergambar', h.indexOf('Budi Desain') >= 0 && h.indexOf('Uji Kru') >= 0);
  cek('rangkap role ditandai', h.indexOf('rangkap ×2') >= 0);
  /* Beban pindah dari halaman Workload yang dicabut — 6 tugas aktif dari
     kapasitas 5 = 120%, dan itu satu-satunya sinyal overload yang tersisa. */
  cek('beban terhitung 120% untuk yang kelebihan muatan', h.indexOf('120%') >= 0, '');
  cek('...dan 0% untuk yang belum dapat tugas', h.indexOf('0%') >= 0, '');
});
aman('angka role dihitung tanpa tapis role itu sendiri', () => {
  /* Kalau ikut, pilihan yang tidak sedang dipakai selalu menulis (0), dan nol
     membaca sebagai "tidak ada yang memegang role itu". */
  w.__uji("teamFilter.role='content_director'");
  w.__uji('route("team")');
  const h = layar();
  cek('Designer tetap menulis (2) walau tapisnya di Content Director',
      /Designer \(2\)/.test(h), (h.match(/Designer \([0-9]+\)/) || ['tidak ketemu'])[0]);
  const tabel = w.document.getElementById('teamTable').innerHTML;
  cek('tabelnya benar-benar tersaring', tabel.indexOf('Budi Desain') < 0 && tabel.indexOf('Uji Kru') >= 0, '');
  w.__uji("teamFilter.role=''"); w.__uji('route("team")');
});
aman('kotak cari tidak dibuat ulang tiap ketukan', () => {
  const sebelum = w.document.querySelector('#view .ctrl');
  cek('kotak carinya ada', !!sebelum);
  w.__uji("teamF('q','budi')");
  const sesudah = w.document.querySelector('#view .ctrl');
  /* Kotak yang dibuat ulang kehilangan fokus dan hanya huruf pertama yang
     masuk — jebakan yang sudah dibayar queueF() di modul yang sama. */
  cek('elemen kotaknya TETAP yang itu juga', sebelum === sesudah);
  const tabel = w.document.getElementById('teamTable').innerHTML;
  cek('tabelnya tersaring', tabel.indexOf('Budi Desain') >= 0 && tabel.indexOf('Uji Kru') < 0, '');
  w.__uji("teamF('q','')");
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
