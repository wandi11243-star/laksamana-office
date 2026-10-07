/* uji-hilang-marketing.js — data Marketing yang hilang sendiri, dan VIP di Radar
 *
 *   node tools/uji-hilang-marketing.js
 *   JSDOM_PATH=… PHP_PARSER_PATH=… node tools/uji-hilang-marketing.js
 *
 * LATAR — tiga keluhan user 8 September 2026, dan dua di antaranya satu sebab:
 *
 *   1. "Request Design & Video yang di-request kok hilang semua?"
 *   3. "Reservasi VIP yang Aurel input tgl 7 Sept untuk tgl 10 Sept hilang."
 *
 * `designreqs` dan `vip` ADA di MKT_COLS (klien) tapi TIDAK ADA di
 * collections() (server) maupun scalar_keys(). Keduanya karena itu jatuh ke
 * cabang TERAKHIR save_all() dan disimpan sebagai satu gumpalan JSON lewat
 * put_setting() — `ON DUPLICATE KEY UPDATE v = VALUES(v)`, timpa buta.
 * Siapa pun yang tabnya terbuka sejak pagi lalu menyimpan apa pun sore hari
 * mengganti SELURUH daftar dengan salinan lamanya. Tidak ada satu pun galat.
 *
 * Yang dijaga di sini adalah INVARIANNYA, bukan nama `designreqs`/`vip`:
 * setiap koleksi yang dikirim klien sebagai daftar baris ber-id wajib punya
 * penjaga — entah sebagai tabel (collections) atau sebagai koleksi settings
 * (kol_settings). Itu yang akan menangkap koleksi BERIKUTNYA yang ditambahkan
 * ke MKT_COLS tanpa pasangan di server.
 *
 * PHP TIDAK BISA DIJALANKAN DI MESIN PENGEMBANGAN INI. Yang dilakukan:
 *   - sintaksnya diperiksa SUNGGUHAN dengan pengurai PHP murni-JS
 *     (php-parser). Satu parse error di berkas ini mematikan SELURUH endpoint
 *     modul Marketing, dan itu kegagalan termahal yang bisa lahir dari sini.
 *   - logikanya diperiksa sebagai KONTRAK atas sumbernya (penjaga mana yang
 *     wajib ada), pola yang sama dengan tools/uji-simpan-basi.js.
 * Keduanya bukan pengganti menjalankan PHP-nya; itu dikatakan apa adanya.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');

let ok = 0, gagal = 0, lewat = 0;
const cek = (n, s, k) => { if (s) { ok++; console.log('  OK   ' + n); } else { gagal++; console.log('  GAGAL ' + n + (k ? '  — ' + k : '')); } };
const sama = (n, d, h) => cek(n, d === h, 'dapat ' + JSON.stringify(d) + ', harusnya ' + JSON.stringify(h));
const skip = n => { lewat++; console.log('  LEWAT ' + n); };

const muat = (kandidat) => {
  for (const p of kandidat) { if (!p) continue; try { return require(p); } catch (e) {} }
  return null;
};
const JSDOM_MOD = muat([process.env.JSDOM_PATH, path.join(ROOT, 'node_modules', 'jsdom'), 'jsdom']);
const PHP_MOD   = muat([process.env.PHP_PARSER_PATH, path.join(ROOT, 'node_modules', 'php-parser'), 'php-parser']);

const LIB = fs.readFileSync(path.join(ROOT, 'marketing-mysql/lib_marketing_mysql.php'), 'utf8');
/* Komentar dibuang sebelum mencari PEMAKAIAN. Penjelasan di berkas itu
   menyebut `put_setting`, `VALUES(v)`, dan nama koleksinya apa adanya —
   sejarah kenapa sesuatu diperbaiki memang harus boleh menyebut namanya.
   Aturan yang sama dengan tools/uji-tanpa-target.js. */
const LIB_KODE = LIB.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/* ---------- 1. SINTAKS PHP (pemeriksaan sungguhan) ---------- */
console.log('-- sintaks PHP --');
if (!PHP_MOD) {
  skip('parse-check PHP (pasang `npm i php-parser`, atau setel PHP_PARSER_PATH)');
} else {
  const parser = new PHP_MOD({ parser: { suppressErrors: false } });
  ['marketing-mysql/lib_marketing_mysql.php', 'marketing-mysql/api.php'].forEach(f => {
    let err = '';
    try { parser.parseCode(fs.readFileSync(path.join(ROOT, f), 'utf8'), f); }
    catch (e) { err = String(e.message).split('\n')[0]; }
    cek(f + ' terurai tanpa galat', !err, err);
  });
  /* Pemeriksa yang tidak pernah menolak apa pun adalah hiasan. */
  let tertangkap = false;
  try { parser.parseCode(LIB.replace('function kol_settings() {', 'function kol_settings( {'), 'rusak'); }
  catch (e) { tertangkap = true; }
  cek('...dan pemeriksanya benar-benar menolak berkas yang rusak', tertangkap,
      'parse-check ini tidak membuktikan apa pun');
}

/* ---------- 2. INVARIAN: tiap koleksi klien punya penjaga di server ---------- */
console.log('\n-- tiap koleksi yang dikirim klien punya penjaga --');
const MKT = fs.readFileSync(path.join(ROOT, 'deploy/marketing/index.html'), 'utf8');
const mCols = MKT.match(/const MKT_COLS\s*=\s*\[([\s\S]*?)\]/);
cek('MKT_COLS terbaca dari modul Marketing', !!mCols);
const kolKlien = (mCols ? mCols[1].match(/'[^']+'/g) || [] : []).map(x => x.slice(1, -1));

const kolServer = (LIB_KODE.match(/^\s*'([A-Za-z]+)'\s*=>\s*array\('table'/gm) || [])
  .map(x => (x.match(/'([A-Za-z]+)'/) || [])[1]).filter(Boolean);
const mSet = LIB_KODE.match(/function kol_settings\(\)\s*\{\s*return array\(([^)]*)\)/);
const kolSet = (mSet ? mSet[1].match(/'[^']+'/g) || [] : []).map(x => x.slice(1, -1));
cek('kol_settings() terbaca', kolSet.length > 0, JSON.stringify(kolSet));

/* `activities` punya jalurnya sendiri (append-only, INSERT IGNORE) dan memang
   tidak lewat penjaga baris — dikecualikan dengan sebut nama, bukan dengan
   melonggarkan aturannya. */
const KECUALI = { activities: 1 };
const tanpaPenjaga = kolKlien.filter(k => !KECUALI[k] && kolServer.indexOf(k) < 0 && kolSet.indexOf(k) < 0);
cek('tidak ada koleksi klien yang tanpa penjaga di server',
    tanpaPenjaga.length === 0,
    'ditimpa buta sebagai gumpalan `extra:` -> ' + tanpaPenjaga.join(', '));
/* Regresi 8 September 2026, disebut namanya supaya yang membaca log tahu
   pemeriksaan di atas pernah menangkap apa. */
cek('designreqs berpenjaga (regresi 8 Sep 2026)',
    kolSet.indexOf('designreqs') > -1 || kolServer.indexOf('designreqs') > -1);
cek('vip berpenjaga (regresi 8 Sep 2026)',
    kolSet.indexOf('vip') > -1 || kolServer.indexOf('vip') > -1);

/* Regresi 8 Sep 2026 (babak kelima): `baseUpdatedAt` yang BOCOR ke data
   tersimpan (baris vip/designreqs bercap Agustus di server dev) membuat klien
   memantulkannya untuk baris yang tidak disentuh siapa pun, dan server
   melaporkan bentrok palsu tiap simpan — modal yang tidak bisa disembuhkan
   muat ulang. normalizeState() WAJIB membuangnya dari tiap baris tiap
   MKT_COLS, di satu tempat yang dilewati semua jalur muat. */
const iNorm = MKT.indexOf('function normalizeState(');
const badanNorm = iNorm > -1 ? MKT.slice(iNorm, iNorm + 3000) : '';
cek('normalizeState membuang baseUpdatedAt yang bocor ke data (regresi 8 Sep 2026)',
    /delete r\.baseUpdatedAt/.test(badanNorm) && /MKT_COLS\.forEach/.test(badanNorm),
    'tanpa ini baris vip/designreqs lama memicu bentrok palsu tak berujung');

/* ---------- 3. KONTRAK save_all ---------- */
console.log('\n-- penjaga di save_all --');
const iKolSet = LIB_KODE.indexOf('foreach (kol_settings() as $nama)');
const iExtra  = LIB_KODE.indexOf("put_setting($pdo, 'extra:' . $k, $v)");
cek('koleksi settings digabung SEBELUM cabang `extra:`',
    iKolSet > -1 && iExtra > -1 && iKolSet < iExtra,
    'kalau sesudah, put_setting menimpa balik hasil penggabungannya');
cek('...dan namanya masuk $known',
    /foreach \(kol_settings\(\) as \$nama\) \{\s*\$known\[\] = \$nama;/.test(LIB_KODE),
    'tanpa ini cabang `extra:` tetap menimpanya dengan salinan mentah kiriman');
const BADAN_SET_AWAL = LIB_KODE.slice(LIB_KODE.indexOf('function upsert_settings_collection('),
  LIB_KODE.indexOf('\nfunction ', LIB_KODE.indexOf('function upsert_settings_collection(') + 40));
cek('penggabungnya memakai penjaga bentrok baseUpdatedAt',
    BADAN_SET_AWAL.indexOf("array_key_exists('baseUpdatedAt', $r)") > -1);
cek('...dan penghapusannya dibatasi $sejak',
    BADAN_SET_AWAL.indexOf('$bolehHapus = ($sejak > 0') > -1 &&
    BADAN_SET_AWAL.indexOf('$v > $sejak') > -1,
    'baris yang lahir sesudah klien memuat tidak boleh ikut terhapus');
cek('...dan kiriman kosong tidak mengosongkan daftar',
    /\$bolehHapus = \(\$sejak > 0 && count\(\$kirimId\) > 0\)/.test(LIB_KODE));
cek('_versi ikut menghitung koleksi settings',
    /foreach \(kol_settings\(\) as \$nama\) \{[\s\S]{0,200}versi_baris\(/.test(LIB_KODE),
    'tanpa ini baris VIP/Request baru tidak menaikkan versi, dan tab lain tidak pernah menariknya');

/* Kecepatan simpan (8 Sep 2026): keluhan user "kenapa setiap save lambat".
   Tiap saveAll jalan di dalam db_lock, jadi beban tetap apa pun menahan
   penyimpanan berikutnya juga. Dua sumber beban tetap dipangkas. */
const iSaveAll = LIB_KODE.indexOf('function save_all(');
const BADAN_SAVE = iSaveAll > -1
  ? LIB_KODE.slice(iSaveAll, LIB_KODE.indexOf('\nfunction ', iSaveAll + 40)) : '';
cek('gc_receipts TIDAK dipanggil tiap simpan',
    /(mt_rand|random_int)\([^)]*\)[^;]*\)?\s*\{?\s*(try\s*\{\s*)?\$buang\s*=\s*gc_receipts/.test(BADAN_SAVE) ||
    /if \([^)]*mt_rand[\s\S]{0,120}gc_receipts\(/.test(BADAN_SAVE),
    'gc_receipts memindai folder bukti transfer (puluhan MB) — jangan di setiap save');
cek('activities: id yang SUDAH ada tidak di-INSERT ulang',
    /SELECT id FROM activities WHERE id IN \(/.test(BADAN_SAVE) &&
    /isset\(\$adaDb\[\$id\]\)\)\s*continue/.test(BADAN_SAVE),
    'klien mengirim ~1000 activities tiap simpan; tanpa ini semuanya lewat INSERT IGNORE di dalam db_lock');
cek('activities: pangkas hanya kalau ada baris baru',
    /if \(\$baru > 0\) \{[\s\S]{0,120}DELETE FROM activities WHERE id NOT IN/.test(BADAN_SAVE),
    'DELETE ... NOT IN (SELECT ...) memaksa temp table tiap kali — sia-sia kalau tabel tak tumbuh');

/* ---------- 4. cap tulis dari JAM SERVER ---------- */
console.log('\n-- cap urutan datang dari KLIEN, dan pergeserannya dikabarkan --');
/* CAP SERVER SUDAH DICABUT (keputusan user 8 September 2026). Ia lahir untuk
   menutup bahaya jam perangkat yang TIDAK PERNAH DIBUKTIKAN, dan akibatnya
   pasti: klien mencatat acuan bentrok dari cap yang ia pegang, jadi begitu
   server mencapnya dengan jam LAIN, kedua sisi membandingkan angka dari dua
   jam berbeda dan modal bentrok muncul untuk baris yang tidak seorang pun
   sentuh. Yang dijaga sekarang: capnya TETAP milik klien. */
cek('cap tulis TIDAK memakai jam server',
    /function cap_tulis\(\$ua, \$lolosBentrok, \$verServer\)/.test(LIB_KODE) &&
    LIB_KODE.indexOf('sekarang_ms') < 0 && LIB_KODE.indexOf('$nowMs') < 0,
    'cap dari jam server membuat acuan klien dan acuan server tidak pernah sama');
cek('...melainkan cap yang dikirim klien, digeser HANYA kalau terhalang',
    /return \$verServer \+ 1;/.test(LIB_KODE) && /return \$ua;/.test(LIB_KODE));
/* Potong badan satu fungsi PHP: dari tanda tangannya sampai deklarasi
   fungsi BERIKUTNYA. Tanpa ini tiap pencarian di bawah bisa menemukan
   jawabannya di fungsi lain, dan asersinya lulus untuk fungsi yang justru
   sudah kehilangan penjaganya. */
function badanFungsi(src, tandaTangan) {
  const a = src.indexOf(tandaTangan);
  if (a < 0) return '';
  const b = src.indexOf('\nfunction ', a + tandaTangan.length);
  return src.slice(a, b < 0 ? src.length : b);
}
const BADAN_UPSERT = badanFungsi(LIB_KODE, 'function upsert_collection(');
const BADAN_SETTINGS = badanFungsi(LIB_KODE, 'function upsert_settings_collection(');
cek('kedua badan fungsinya bisa dipotong', BADAN_UPSERT.length > 200 && BADAN_SETTINGS.length > 200,
    BADAN_UPSERT.length + ' / ' + BADAN_SETTINGS.length);
cek('...dipakai upsert_collection', BADAN_UPSERT.indexOf('cap_tulis(') > -1);
cek('...dan upsert_settings_collection', BADAN_SETTINGS.indexOf('cap_tulis(') > -1);
cek('cap klien dipungut apa adanya lebih dulu',
    /\$uaKirim = ms_valid\(isset\(\$simpan\['updatedAt'\]\)/.test(BADAN_UPSERT),
    'cap yang dipakai harus berasal dari yang dikirim klien');
/* Pergeseran cap (bump) tetap ada dan tetap harus dikabarkan — itulah yang
   dijaga jalur `versi` di bawah. Yang hilang cuma sumber jamnya. */
/* Cap yang dipakai WAJIB ikut tersimpan di `data`: klien membaca versinya dari
   sana lalu mengirimkannya balik sebagai baseUpdatedAt, sementara penjaga
   bentrok membandingkannya dengan KOLOM updated_at. Kalau keduanya berbeda,
   setiap suntingan berikutnya dilaporkan bentrok padahal tidak ada yang
   menyalip. */
cek('server mengembalikan cap yang ia pakai lewat `versi`',
    /'versi'\s*=>\s*\$versi,/.test(LIB_KODE) && /\$versi = array\(\);/.test(LIB_KODE),
    'tanpa ini klien tidak pernah tahu cap sebenarnya, dan bentrok palsu kembali');
cek('...berkunci <koleksi>:<id>, bentuk yang sama dengan _eachRow di klien',
    /\$versi\[\$namaKoleksi \. ':' \. \$id\] = \$ua;/.test(LIB_KODE) &&
    /\$versi\[\$nama \. ':' \. \$id\] = \$ua;/.test(LIB_KODE));
cek('...hanya baris yang capnya BERGESER yang dikirim balik',
    (LIB_KODE.match(/if \(\$ua !== \$uaKirim\)/g) || []).length === 2,
    'kiriman berisi ribuan baris client tidak perlu memantulkan angka yang tidak berubah');
/* KETIGA jalur wajib memasangnya, bukan cuma yang sukses. Satu jalur yang
   terlewat sudah cukup membuat capnya tidak pernah menyatu lagi. */
cek('cap server dipasang di KETIGA jalur (sukses, bentrok, pemulihan)',
    (MKT.match(/terapkanVersiServer\(j\.data\.versi\)/g) || []).length === 3,
    'ditemukan ' + ((MKT.match(/terapkanVersiServer\(j\.data\.versi\)/g) || []).length) + ' dari 3');
cek('...dan acuan bentrok ikut dibetulkan tanpa menunggu refreshSnapshot',
    /_serverVer\[key\]=v;/.test(MKT),
    'jalur bentrok & pemulihan tidak boleh memanggil refreshSnapshot apa adanya');
cek('jalur bentrok TIDAK memanggil refreshSnapshot',
    !/showSaveConflict\(bentrok\);[\s\S]{0,80}refreshSnapshot\(\)/.test(MKT),
    'itu akan menghapus tanda berubah pada baris yang barusan DITOLAK');
/* Jalur sukses kini memakai refreshSnapshotSebagian(). Jangkar yang hilang
   membuat indexOf memulangkan -1, dan -1 lebih kecil daripada apa pun —
   asersinya jadi selalu HIJAU untuk urutan apa pun. Karena itu keberadaan
   kedua jangkarnya diperiksa lebih dulu, terpisah. */
const iCap = MKT.indexOf('terapkanVersiServer(j.data.versi);   // cap server dulu…');
const iAcuan = MKT.indexOf('refreshSnapshotSebagian(capBaru.kotor);');
cek('kedua jangkar urutan ada di sumber', iCap > -1 && iAcuan > -1,
    'urutan tidak bisa diperiksa kalau salah satunya hilang');
cek('klien memasang cap server SEBELUM mencatat acuan', iCap > -1 && iAcuan > iCap,
    'kalau sesudah, yang dicatat tetap cap klien');
cek("cap yang dipakai ikut tersimpan di data (updatedAt = ua)",
    (LIB_KODE.match(/\$simpan\['updatedAt'\] = \$ua;/g) || []).length >= 2,
    'kalau tidak, suntingan berikutnya dilaporkan bentrok palsu');

/* ---------- 5. KLIEN: kirimannya memang membawa yang dibutuhkan ---------- */
console.log('\n-- kiriman klien Marketing --');
if (!JSDOM_MOD) { skip('kiriman klien (jsdom tidak ketemu)'); }
else {
  const { JSDOM, VirtualConsole } = JSDOM_MOD;
  const html = MKT
    .replace(/<script[^>]*\ssrc="[^"]*performa-bonus\.js"[^>]*><\/script>/i,
      '<script>' + fs.readFileSync(path.join(ROOT, 'deploy/assets/performa-bonus.js'), 'utf8') + '</script>')
    .replace(/<script[^>]*\ssrc="[^"]*venue-layouts\.js"[^>]*><\/script>/i,
      '<script>' + fs.readFileSync(path.join(ROOT, 'deploy/assets/venue-layouts.js'), 'utf8') + '</script>')
    .replace(/<script[^>]*\ssrc=[^>]*><\/script>/gi, '');
  const vc = new VirtualConsole();
  vc.on('jsdomError', () => {});
  const dom = new JSDOM(html, { virtualConsole: vc, runScripts: 'dangerously',
    url: 'https://dev.laksamanamuda.id/marketing/',
    beforeParse(w) {
      w.localStorage.setItem('lm_session', JSON.stringify({ id: 'u1', name: 'Uji',
        modules: ['marketing'], adminModules: ['marketing'], token: 't', expiry: Date.now() + 86400000 }));
      w.fetch = () => new Promise(() => {});
      w.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
      w.print = () => {}; w.confirm = () => true;
      w.Chart = class { destroy() {} update() {} };
      w.HTMLCanvasElement.prototype.getContext = () => ({});
    } });
  const w = dom.window;
  w.eval('S = normalizeState(seed());');
  /* Baris BARU: belum pernah ada di _snap, jadi stampChanges() wajib
     mencapnya. Itulah bentuk yang persis hilang di produksi. */
  w.eval(`
    S.designreqs = [{id:'d1', judul:'frame videotron', jenis:'desain'}];
    S.vip        = [{id:'v1', nama:'Reservasi Aurel', tanggal:'2026-09-10', pax:8, jenis:'Assisted'}];
    _sejakVersi = 1700000000000;
    stampChanges();
  `);
  const P = JSON.parse(w.eval('JSON.stringify(buildPayload())'));
  cek('designreqs ikut dikirim', Array.isArray(P.designreqs) && P.designreqs.length === 1);
  cek('vip ikut dikirim', Array.isArray(P.vip) && P.vip.length === 1);
  cek('baris designreqs dicap updatedAt', !!(P.designreqs && P.designreqs[0].updatedAt));
  cek('baris vip dicap updatedAt', !!(P.vip && P.vip[0].updatedAt));
  cek('baris designreqs membawa baseUpdatedAt', P.designreqs && 'baseUpdatedAt' in P.designreqs[0],
      'tanpa ini server tidak bisa membedakan yang diubah dari yang dipantulkan');
  cek('baris vip membawa baseUpdatedAt', P.vip && 'baseUpdatedAt' in P.vip[0]);
  sama('kiriman membawa _sejak', P._sejak, 1700000000000);
  cek('_sejak > 0, jadi penjaga penghapusan di server benar-benar hidup', P._sejak > 0);
}

/* ---------- 6. RADAR: Reservasi VIP ikut muncul ---------- */
console.log('\n-- Reservasi VIP di Radar (permintaan user 8 Sep 2026) --');
if (!JSDOM_MOD) { skip('Radar (jsdom tidak ketemu)'); }
else {
  const { JSDOM, VirtualConsole } = JSDOM_MOD;
  const vc = new VirtualConsole(); vc.on('jsdomError', () => {});
  const SRC_RADAR = fs.readFileSync(path.join(ROOT, 'deploy/radar/index.html'), 'utf8');
  const JANGKAR = "if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',init); else init();";
  cek('jangkar jembatan uji masih ada di Radar', SRC_RADAR.split(JANGKAR).length - 1 === 1,
      'IIFE-nya berubah; jembatan uji harus disesuaikan');
  const dom = new JSDOM(
    SRC_RADAR
      .replace(/<script[^>]*\ssrc=[^>]*><\/script>/gi, '')
      .replace(JANGKAR,
        "window.__UJI__={satukan:satukan, agendaTampil:agendaTampil, labelSumber:labelSumber," +
        " badgeSumber:badgeSumber, setD:function(d){D=d;}, agenda:function(){return AGENDA;}," +
        " fCal:function(){return fCal;}};"),
    { virtualConsole: vc, runScripts: 'dangerously',
      url: 'https://dev.laksamanamuda.id/radar/',
      beforeParse(w) {
        w.localStorage.setItem('lm_session', JSON.stringify({ id: 'u1', name: 'Uji',
          modules: ['radar'], adminModules: [], token: 't', expiry: Date.now() + 86400000 }));
        w.fetch = () => new Promise(() => {});
        w.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
        w.print = () => {}; w.confirm = () => true;
      } });
  const w = dom.window;
  const R = w.__UJI__;
  cek('Radar boot & jembatan uji terpasang', !!(R && typeof R.satukan === 'function'));
  if (R && typeof R.satukan === 'function') {
    const D = {};
    D.mkt = { events: [
        { id: 'e1', nama: 'Event Klien', tanggal: '2026-10-05', status: 'Deal', pax: 100, detail: {} } ],
      vip: [
        /* paxMin/paxMax — BENTUK YANG SESUNGGUHNYA. Baris VIP produksi tidak
           punya `pax` sama sekali; fixture lama mengarangnya, dan karena itu
           ia hijau untuk kode yang membaca v.pax sementara pax VIP di Radar
           terhitung nol untuk SELURUH reservasi. */
        { id: 'v1', nama: 'VIP Aurel',  tanggal: '2026-09-10', status: 'Confirmed',
          paxMin: '6', paxMax: '8',
          jenis: 'Assisted', meja: ['A1', 'A2'], jamMulai: '19:00', jamSelesai: '22:00' },
        { id: 'v2', nama: 'VIP Batal',  tanggal: '2026-09-11', status: 'Confirmed', paxMin: '4',
          jenis: 'Assisted', batalAt: '2026-09-08T02:00:00Z' },
        { id: 'v3', nama: 'VIP Cancel', tanggal: '2026-09-12', status: 'Cancelled', paxMin: '6', jenis: 'Assisted' },
        { id: 'v4', nama: 'VIP Tanpa Tanggal', status: 'Confirmed', paxMin: '2' } ] };
    D.evt = { events: [] };
    D.rsv = { reservations: [] };
    D.bd = null;
    R.setD(D);
    R.satukan();
    const vip = R.agenda().filter(a => a.sumber === 'vip');
    /* v1 (sah) + v3 (Cancelled) = 2. v3 TETAP masuk AGENDA — satukan() cuma
       menyaring batalAt, dan status disaring belakangan oleh agPasti(). Dua
       lapis itu memang dipisah: AGENDA adalah gabungan mentah yang masih
       dipakai mencari agenda per id, agendaTampil() yang menyaringnya. */
    sama('reservasi VIP masuk agenda mentah', vip.length, 2);
    cek('yang dibatalkan lewat batalAt TIDAK masuk', !vip.some(a => a.id === 'v2'),
        'penanda yang sama dipakai vip_hari() di marketing-mysql');
    cek('yang tanpa tanggal TIDAK masuk', !vip.some(a => a.id === 'v4'));
    const tampil = R.agendaTampil().filter(a => a.sumber === 'vip');
    cek('yang berstatus Cancelled disaring agPasti', !tampil.some(a => a.id === 'v3'),
        'kosakata Cancelled dipakai modul Reservasi, bukan kata "batal"');
    const a1 = vip.find(a => a.id === 'v1');
    cek('barisnya terbaca utuh', !!a1 && a1.tgl === '2026-09-10' && a1.pax === 8 && a1.jam === '19:00');
    cek('meja (array) dirangkai jadi tempat', !!a1 && a1.tempat === 'A1, A2',
        a1 && JSON.stringify(a1.tempat));
    cek('mentahnya dibawa untuk panel detail', !!a1 && !!a1.mentah && a1.mentah.id === 'v1');
    /* Labelnya WAJIB bukan "Event". Sebelum ada labelSumber(), tiap layar
       menuliskan `sumber==='mkt' ? 'Marketing' : 'Event'` — bentuk yang diam-
       diam salah begitu ada sumber ketiga. */
    sama('labelnya sendiri, bukan jatuh ke Event', R.labelSumber('vip'), 'Marketing · Reservasi VIP');
    cek('event Marketing tidak ikut berubah label', R.labelSumber('mkt').indexOf('Marketing') === 0);
    cek('badge-nya sendiri', /Reservasi VIP/.test(R.badgeSumber('vip')));
    cek('penyaring kalender punya saklar vip', R.fCal().vip === true);
  }
  const SRC = SRC_RADAR;
  cek('tidak ada sumber baru di SUMBER[] (datanya sudah ikut getAll Marketing)',
      (SRC.match(/\{id:'/g) || []).length === 4, 'permintaan HTTP tambahan tidak diperlukan');
  cek('penyaring kalender tidak lagi ternary dua cabang',
      SRC.indexOf("a.sumber==='mkt'?fCal.mkt:fCal.evt") < 0,
      'ternary itu menjatuhkan sumber ketiga ke penyaring Event');
  cek('kelas warna .cev.vip disediakan', /\.cev\.vip\{/.test(SRC));
  cek('chip penyaring .c-vip disediakan', /\.c-vip\{/.test(SRC));
  /* Pax VIP sengaja TIDAK ikut Total pax: reservasi VIP juga mengunci meja di
     database Reservasi, jadi tamunya bisa terhitung dua kali. */
  const mTotal = SRC.match(/stat\('Total pax',([^,]*),/);
  cek('kartu Total pax terbaca', !!mTotal, 'ungkapan totalnya berubah bentuk');
  cek('pax VIP TIDAK dijumlahkan ke Total pax',
      !!mTotal && mTotal[1].indexOf('paxVip') < 0,
      'reservasi VIP juga mengunci meja di database Reservasi — tamunya bisa terhitung dua kali');
  cek('...tapi tetap DIHITUNG dan ditampilkan terpisah', /paxVip\+' pax[^']*tidak ikut Total'/.test(SRC),
      'menyembunyikannya sama saja tidak menjawab permintaannya');
  cek('...dan pemisahannya dikatakan di layar', /tidak ikut Total/.test(SRC));
}

/* ---------- 7. BENTROK PALSU: cap server vs cap klien ----------
   Regresi produksi 8 September 2026, beberapa jam setelah cap server dipasang:
   modal "Sebagian Perubahan Tidak Tersimpan" muncul TERUS, menyebut baris yang
   tidak seorang pun sedang menyentuh.

   Sebabnya dua penjaga yang membandingkan angka dari DUA JAM yang berbeda.
   Server menyimpan cap dari jamnya sendiri (cap_tulis); klien mencatat acuan
   bentroknya dari `r.updatedAt` di salinan layarnya, yaitu cap KLIEN. Waktu
   selalu maju antara klien mencap dan server menulis, jadi cap server hampir
   selalu lebih besar — dan setiap suntingan KEDUA pada baris yang sama
   dilaporkan bentrok.

   Ujinya menjalankan DUA SIKLUS SIMPAN sungguhan lewat save() milik modul,
   dengan server tiruan yang jamnya sengaja dimajukan. Satu siklus tidak cukup:
   bentroknya baru lahir pada siklus kedua, dan uji yang berhenti di siklus
   pertama akan hijau untuk kode yang rusak. */
console.log('\n-- bentrok palsu sesudah cap server (regresi 8 Sep 2026) --');
if (!JSDOM_MOD) { skip('siklus simpan (jsdom tidak ketemu)'); }
else {
  const { JSDOM, VirtualConsole } = JSDOM_MOD;
  const vc = new VirtualConsole(); vc.on('jsdomError', () => {});
  /* Server tiruan yang MENIRU KONTRAK PHP-nya: cap ditentukan jam server,
     baris yang capnya bergeser dikembalikan lewat `versi`, dan penjaga
     bentrok membandingkan baseUpdatedAt dengan cap TERSIMPAN. Kontraknya
     sendiri dibandingkan dengan sumber PHP di bagian 3 & 4 di atas — tiruan
     yang bentuknya beda dari yang ditiru tidak menguji apa pun. */
  const simpanan = {};            // 'koleksi:id' -> cap tersimpan
  let jamServer = Date.now() + 60000;   // server 1 menit di depan klien
  const jejak = { simpan: 0, bentrok: [] };
  function layaniSaveAll(data) {
    jamServer += 1000;
    const bentrok = [], versi = {};
    ['designreqs', 'vip', 'events', 'clients'].forEach(nama => {
      (data[nama] || []).forEach(r => {
        if (!r || !r.id) return;
        const key = nama + ':' + r.id;
        const tersimpan = simpanan[key];
        if ('baseUpdatedAt' in r) {
          if (tersimpan != null && tersimpan > (+r.baseUpdatedAt || 0)) {
            bentrok.push({ koleksi: nama, id: r.id, nama: r.nama || r.judul || r.id });
            return;
          }
          const ua = jamServer;                    // CAP DARI JAM SERVER
          simpanan[key] = ua;
          if (ua !== (+r.updatedAt || 0)) versi[key] = ua;
        } else if (tersimpan == null) {
          simpanan[key] = +r.updatedAt || 0;
        }
      });
    });
    jejak.simpan++; jejak.bentrok = bentrok;
    return { ok: true, data: { bentrok: bentrok, versi: versi } };
  }
  const dom = new JSDOM(
    MKT.replace(/<script[^>]*\ssrc="[^"]*performa-bonus\.js"[^>]*><\/script>/i,
        '<script>' + fs.readFileSync(path.join(ROOT, 'deploy/assets/performa-bonus.js'), 'utf8') + '</script>')
       .replace(/<script[^>]*\ssrc="[^"]*venue-layouts\.js"[^>]*><\/script>/i,
        '<script>' + fs.readFileSync(path.join(ROOT, 'deploy/assets/venue-layouts.js'), 'utf8') + '</script>')
       .replace(/<script[^>]*\ssrc=[^>]*><\/script>/gi, ''),
    { virtualConsole: vc, runScripts: 'dangerously',
      url: 'https://dev.laksamanamuda.id/marketing/',
      beforeParse(w) {
        w.localStorage.setItem('lm_session', JSON.stringify({ id: 'u1', name: 'Uji',
          modules: ['marketing'], adminModules: ['marketing'], token: 't', expiry: Date.now() + 86400000 }));
        w.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
        w.print = () => {}; w.confirm = () => true;
        w.Chart = class { destroy() {} update() {} };
        w.HTMLCanvasElement.prototype.getContext = () => ({});
        w.fetch = (url, opt) => {
          let b = {}; try { b = JSON.parse((opt && opt.body) || '{}'); } catch (e) {}
          if (b.action !== 'saveAll') return new Promise(() => {});
          const jwb = JSON.stringify(layaniSaveAll(b.data || {}));
          return Promise.resolve({ ok: true, json: () => Promise.resolve(JSON.parse(jwb)),
                                   text: () => Promise.resolve(jwb) });
        };
      } });
  const w = dom.window;
  const tunggu = ms => new Promise(r => setTimeout(r, ms));

  (async function () {
    w.eval("S = normalizeState(seed());");
    w.eval("S.vip = [{id:'v1', nama:'Liya', tanggal:'2026-09-10', pax:6, jenis:'Assisted'}];");
    w.eval("S.designreqs = [{id:'d1', judul:'frame videotron', jenis:'desain'}];");
    /* Acuan awal = keadaan yang dianggap sudah sama dengan server. */
    w.eval("refreshSnapshot();");
    w.eval("simpanan_awal = 1;");
    let lihatBentrok = [];
    w.eval("showSaveConflict = function(b){ window.__BENTROK__ = b; };");

    // ---- siklus 1: ubah lalu simpan ----
    w.eval("S.vip[0].pax = 7; save();");
    await tunggu(60);
    lihatBentrok = w.__BENTROK__ || [];
    cek('simpan pertama tidak bentrok', lihatBentrok.length === 0,
        JSON.stringify(lihatBentrok));
    const cap1 = w.eval("S.vip[0].updatedAt");
    cek('klien memasang cap yang dipakai server', cap1 > Date.now() + 1000,
        'cap klien tetap dipakai; acuan bentrok akan meleset — dapat ' + cap1);

    // ---- siklus 2: ubah lagi, baris YANG SAMA ----
    w.eval("window.__BENTROK__ = null;");
    w.eval("S.vip[0].pax = 8; save();");
    await tunggu(60);
    lihatBentrok = w.__BENTROK__ || [];
    cek('simpan KEDUA pada baris yang sama juga tidak bentrok',
        lihatBentrok.length === 0,
        'inilah gejala yang dilaporkan user: ' + JSON.stringify(lihatBentrok));

    // ---- siklus 3: designreqs, jalur koleksi settings ----
    w.eval("window.__BENTROK__ = null;");
    w.eval("S.designreqs[0].judul = 'frame videotron rev'; save();");
    await tunggu(60);
    w.eval("window.__BENTROK__ = null;");
    w.eval("S.designreqs[0].judul = 'frame videotron rev2'; save();");
    await tunggu(60);
    lihatBentrok = w.__BENTROK__ || [];
    cek('Request Design juga tidak bentrok pada suntingan kedua',
        lihatBentrok.length === 0, JSON.stringify(lihatBentrok));

    /* Yang TIDAK boleh ikut dilonggarkan: bentrok SUNGGUHAN harus tetap
       dilaporkan. Kalau tidak, perbaikan ini cuma mematikan alarmnya. */
    w.eval("window.__BENTROK__ = null;");
    simpanan['vip:v1'] = jamServer + 999999;      // orang lain menyimpan duluan
    w.eval("S.vip[0].pax = 9; save();");
    await tunggu(60);
    lihatBentrok = w.__BENTROK__ || [];
    cek('bentrok SUNGGUHAN tetap dilaporkan', lihatBentrok.length === 1,
        'alarmnya ikut mati — itu lebih buruk daripada bentrok palsu');

    /* ---- PUTARANNYA: sesudah satu bentrok, apakah berhenti? ----
       Gejala produksi 8 September 2026 SESUDAH perbaikan pertama: modalnya
       muncul terus. Sebabnya cap server cuma dipasang di cabang SUKSES, jadi
       begitu ada satu bentrok, cap klien dan cap server tidak pernah menyatu
       lagi — dan tiap penyimpanan berikutnya bentrok lagi.

       Baris yang bentrok tadi disamakan dulu (seperti orang menekan Muat
       ulang untuk baris itu saja); yang diuji baris LAIN, yang tidak pernah
       bertabrakan dengan siapa pun. */
    w.eval("window.__BENTROK__ = null;");
    w.eval("S.vip[0].updatedAt = " + (simpanan['vip:v1'] || 0) + ";");   // baris itu diselaraskan
    w.eval("S.clients = S.clients || []; S.clients.push({id:'c1', nama:'Klien Baru', hp:'08'});");
    w.eval("save();");
    await tunggu(60);
    lihatBentrok = w.__BENTROK__ || [];
    /* Baris yang benar-benar disalip SENGAJA tetap dilaporkan sampai dimuat
       ulang — itu yang diinstruksikan modalnya, dan mendiamkannya berarti
       perubahan yang ditolak hilang tanpa ada yang tahu. Yang dijaga di sini:
       bentroknya TIDAK MELEBAR ke baris lain. */
    cek('bentrok tidak melebar ke baris lain',
        lihatBentrok.length === 1 && lihatBentrok[0].id === 'v1',
        'baris yang tidak disalip ikut dilaporkan: ' + JSON.stringify(lihatBentrok));
    cek('...dan baris barunya benar-benar sampai ke server',
        simpanan['clients:c1'] != null, 'input Database Client hilang');

    /* MUAT ULANG, seperti yang disuruh modalnya: acuan disegarkan dari versi
       server. Sesudah itu SEMUANYA harus bersih — inilah yang dulu tidak
       pernah terjadi, karena kirimPemulihan() mencatat cap KLIEN sebagai
       acuan tiap kali halaman dimuat, jadi putarannya dimulai lagi. */
    w.eval("window.__BENTROK__ = null;");
    w.eval("S.vip[0].updatedAt = " + simpanan['vip:v1'] + "; refreshSnapshot();");
    w.eval("S.clients[0].hp = '0812'; save();");
    await tunggu(60);
    lihatBentrok = w.__BENTROK__ || [];
    cek('sesudah muat ulang, putarannya berhenti sepenuhnya',
        lihatBentrok.length === 0, JSON.stringify(lihatBentrok));

    /* ---------- 8. SIMPAN YANG DIAM (keputusan user 9 September 2026) ----------
       "buat sistem modul marketing jangan auto save, karena jadinya muncul popup
       menyimpan ke server."

       Bagian ini dulu menjaga KEBALIKANNYA: blokir klik seluruh layar sejak
       milidetik pertama, kartu "Menyimpan ke server..." yang tertunda, dan kartu
       "Tersimpan di server". Ketiganya lahir dari permintaan 8 September 2026
       yang menyebut "tiap submit" -- tapi save() dipanggil di lebih dari seratus
       tempat yang BUKAN submit (centang job, geser kolom pipeline, hapus baris),
       jadi yang sampai ke layar bukan satu konfirmasi per formulir melainkan
       kuncian per klik.

       Yang dijaga sekarang:
         1. simpan yang BERHASIL tidak menggambar apa pun, dari awal sampai akhir
         2. tidak ada satu pun keadaan yang memblokir klik
         3. KEGAGALAN tetap terlihat, ditahan, dan tetap tidak memblokir

       Yang pertama diperiksa SEGERA sesudah save() dan sekali lagi sesudah
       server menjawab: uji yang cuma melihat salah satunya akan hijau untuk
       kode yang memblokir sekejap lalu melepasnya, dan celah itu persis yang
       dikeluhkan. Server tiruannya diberi jeda buatan supaya keadaan
       SEDANG-MENGIRIM sempat diamati -- tanpa jeda itu jawabannya datang di
       microtask berikutnya dan tidak ada satu pun keadaan yang bisa dilihat. */
    console.log('\n-- simpan yang diam --');
    const el = () => w.document.getElementById('simpan-tunggu');
    cek('panel status simpan ada di halaman', !!el());
    cek('...dan tertutup saat menganggur', el().className.indexOf('on') < 0, el().className);

    /* Server dibuat lambat supaya keadaan menunggu bisa dilihat. */
    let tahan = null;
    const fetchCepat = w.fetch;
    w.fetch = (url, opt) => new Promise(res => { tahan = () => res(fetchCepat(url, opt)); });

    /* Tombol yang sedang fokus TIDAK boleh kehilangan fokusnya. Dulu ia sengaja
       dilepas supaya Enter tidak menekan ulang tombol di balik lapisan blokir;
       tanpa lapisan itu, melepas fokus cuma membuang tempat kursor orang yang
       sedang mengetik -- dan save() berjalan di tiap centang. */
    w.eval("document.body.insertAdjacentHTML('beforeend','<button id=uji_tbl>Simpan</button>');" +
           "document.getElementById('uji_tbl').focus();");
    w.eval("S.clients[0].hp='0899'; save();");
    cek('menyimpan TIDAK menggambar apa pun',
        el().className.indexOf('on') < 0, el().className);
    cek('...dan tidak merebut fokus dari yang sedang dipakai',
        w.document.activeElement && w.document.activeElement.id === 'uji_tbl',
        'kursor orang yang sedang mengetik ikut terbuang tiap save()');

    /* beforeunload sekarang SATU-SATUNYA yang menahan tab ditutup di tengah
       kiriman -- dulu lapisan blokir ikut menahannya secara tidak langsung.
       Penangannya DIBANGKITKAN sungguhan, bukan diperiksa lewat saveInFlight:
       yang terakhir cuma menyatakan kiriman sedang jalan, bukan bahwa tab
       benar-benar ditahan.

       Penanda `belum naik` sengaja DICABUT dulu supaya klausa saveInFlight yang
       diuji. Ini bukan keadaan mengada-ada: tandaiBelumNaik() menelan galatnya
       sendiri, jadi di peramban yang localStorage-nya ditolak (mode penyamaran)
       penandanya memang tidak pernah terpasang. */
    w.eval('tandaiSudahNaik();');
    const ev = new w.Event('beforeunload', { cancelable: true });
    w.dispatchEvent(ev);
    cek('beforeunload menahan tab selama kiriman masih berjalan',
        ev.defaultPrevented === true,
        'tab bisa ditutup di tengah kiriman tanpa satu pun peringatan');
    w.eval('tandaiBelumNaik();');

    await tunggu(400);                       // jauh lewat ambang lama (250 ms)
    cek('...dan tetap diam walau penyimpanannya lambat',
        el().className.indexOf('on') < 0,
        'kartu "Menyimpan ke server" kembali: ' + el().className);
    tahan();                                  // server akhirnya menjawab
    await tunggu(80);
    cek('sesudah server menjawab pun tidak mengumumkan apa-apa',
        el().className.indexOf('on') < 0 && w.eval('_stKeadaan') === 'diam',
        'keberhasilan diumumkan di tiap klik: ' + w.document.getElementById('st-judul').textContent);

    /* Tidak boleh ada satu pun jalur yang memblokir klik. Diperiksa di SUMBER
       CSS-nya, bukan cuma lewat keadaan yang kebetulan sedang berjalan: yang
       menghidupkannya lagi akan menulis aturannya di sana. */
    cek('panelnya tidak menutup layar',
        !/#simpan-tunggu\{position:fixed;inset:0/.test(MKT),
        'overlay penuh layar kembali -- itu yang dikeluhkan');
    cek('...dan tembus untuk klik',
        /#simpan-tunggu\{[^}]*pointer-events:none/.test(MKT),
        'panel status tidak boleh menghentikan pekerjaan siapa pun');
    cek('...sementara kartunya sendiri tetap bisa ditekan',
        /#simpan-tunggu \.st-kartu\{pointer-events:auto/.test(MKT),
        'tombol Coba lagi ikut mati');

    /* ---- KEGAGALAN: tetap terlihat, ditahan, tetap tidak memblokir ---- */
    w.eval('stSembunyi(); saveInFlight=false; savePending=false; _savePendingRamai=false;');
    w.fetch = () => Promise.reject(new Error('jaringan mati'));
    w.eval("S.clients[0].hp='0777'; save();");
    await tunggu(120);
    cek('kegagalan tetap ditampilkan, bukan ikut didiamkan',
        /Belum tersimpan/.test(w.document.getElementById('st-judul').textContent),
        w.document.getElementById('st-judul').textContent);
    cek('...dan mengatakan datanya masih aman di perangkat',
        /masih tersimpan di perangkat/.test(w.document.getElementById('st-sub').textContent));
    cek('...serta memberi tombol coba lagi', /Coba lagi/.test(w.document.getElementById('st-aksi').innerHTML));
    await tunggu(1400);
    cek('kegagalan TIDAK hilang sendiri sesudah beberapa detik',
        el().className.indexOf('gagal') > -1,
        'kegagalan yang lenyap sendiri sama saja tidak pernah diberitahukan');

    /* ---- JALAN KELUAR: server yang DIAM tetap harus punya suara ----
       fetch di save() tidak punya batas waktu sendiri, jadi server yang tidak
       pernah menjawab tidak memanggil .then maupun .catch. Tanpa ST_BATAS,
       kegagalan semacam itu tidak punya satu pun tanda di layar -- dan sejak
       kartu sukses dicabut, tidak ada lagi ketiadaan kartu yang bisa dibaca
       sebagai gejala. */
    cek('ada batas waktu jalan keluar', w.eval('typeof ST_BATAS') === 'number' && w.eval('ST_BATAS') > 0,
        'server yang diam selamanya tidak akan pernah dilaporkan');
    w.eval('stSembunyi(); saveInFlight=false; savePending=false; _savePendingRamai=false;');
    w.fetch = () => new Promise(() => {});          // server diam selamanya
    w.eval("S.clients[0].hp='0897'; save(); tungguSimpanSelesai('gagal', true);");
    cek('sesudah batas waktu, kegagalannya dilaporkan',
        /Server belum menjawab/.test(w.document.getElementById('st-judul').textContent),
        w.document.getElementById('st-judul').textContent);
    cek('...dan mengatakan kirimannya masih berjalan di latar',
        /masih berjalan di latar/.test(w.document.getElementById('st-sub').textContent));
    /* Kiriman yang digantung tadi dibereskan: tanpa ini `saveInFlight` tetap
       true dan seluruh save() berikutnya cuma mengantre. */
    w.eval('stSembunyi(); saveInFlight=false; savePending=false; _savePendingRamai=false;');

    const SRCM = fs.readFileSync(path.join(ROOT, 'deploy/marketing/index.html'), 'utf8');
    /* SIMPAN OTOMATISNYA TETAP ADA. Yang diminta user hilang tampilannya, bukan
       penyimpanannya -- mencabut auto-save berarti data cuma naik saat ada yang
       menekan tombol, dan tab yang ditutup lebih dulu kehilangan pekerjaannya
       tanpa satu pun tanda. Angkanya dijaga longgar: yang dijaga bukan jumlah
       persisnya melainkan bahwa jalur otomatisnya tidak dicabut diam-diam. */
    const titikSave = (SRCM.match(/[^a-zA-Z_.$]save\(/g) || []).length;
    cek('simpan otomatis TIDAK ikut dicabut', titikSave > 50,
        'data cuma naik saat tombol ditekan -- dapat ' + titikSave + ' titik save()');
    cek('sinkronisasi roster tetap memakai jalur diam',
        /save\(\{diam:true\}\); buildNav\(\);/.test(SRCM),
        'kalau tidak, ia ikut menggambar kegagalan untuk sesuatu yang tidak ditekan siapa pun');
    /* Dihitung PEMANGGILANNYA saja -- definisi fungsinya sendiri ikut cocok
       dengan pola polos, jadi asersi yang menghitungnya selalu >= 2 dan tidak
       pernah bisa gagal. Pola yang sama dengan slice boundary di bagian 4. */
    const panggilTunggu = (SRCM.match(/tungguSimpanMulai\(\)/g) || []).length
                        - (SRCM.match(/function tungguSimpanMulai\(\)/g) || []).length;
    cek('jalan keluarnya dipasang di save(), bukan per tombol', panggilTunggu === 1,
        'dipasang per tombol, yang terlewat justru yang paling sering dipakai -- dapat ' + panggilTunggu);
    /* Timernya diperiksa DI SUMBER, bukan lewat keadaan: asersi di atas
       memanggil tungguSimpanSelesai('gagal', true) langsung, jadi ia tetap hijau
       walau timernya sendiri dicabut. Sejak kartu sukses hilang, tidak ada lagi
       ketiadaan kartu yang bisa dibaca sebagai gejala server yang menggantung. */
    cek('...dan timernya benar-benar dipasang saat penyimpanan mulai',
        /_stBatasTimer=setTimeout\(function\(\)\{ tungguSimpanSelesai\('gagal', true\); \}, ST_BATAS\);/.test(SRCM),
        'server yang menggantung tidak akan pernah punya satu pun suara');
    cek('lapisan blokir benar-benar dicabut dari sumbernya',
        !/_stKeadaan='sunyi'/.test(SRCM) && !/className='on sunyi'/.test(SRCM),
        'blokir klik seluruh layar kembali');
    cek('...begitu juga kartu keberhasilannya',
        !/'Tersimpan di server'/.test(SRCM),
        'kartu sukses muncul lagi di tiap klik');
    cek('ketiga hasil server tetap ditangani',
        (SRCM.match(/tungguSimpanSelesai\('(ok|gagal|bentrok)'\)/g) || []).length === 4,
        'sukses, gagal (dua jalur), dan bentrok');

    /* ---------- 9. PEMULIHAN: yang belum sempat naik harus DISELAMATKAN ----------
       Pertanyaan user 8 September 2026: "apakah kamu sudah pastikan halaman ini
       tidak pernah muncul lagi?" — dan jawabannya waktu itu belum, karena jalur
       PEMULIHAN masih membandingkan dua jam yang berbeda:

         tLok  = cap di salinan lokal   -> jam KLIEN (stampChanges)
         tSrv  = cap di salinan server  -> jam SERVER (cap_tulis)

       Sejak cap ditentukan server, tSrv SELALU lebih besar. Cabang `kita lebih
       baru` karena itu tidak pernah menyala, dan suntingan yang benar-benar
       belum terkirim jatuh ke cabang `kalah` — DIBUANG, sambil memunculkan
       modal. Itu bukan modal yang mengganggu; itu pekerjaan yang hilang.

       Sekarang yang dibandingkan BASIS yang kita pegang vs versi server
       sekarang — dua-duanya angka server. */
    console.log('\n-- pemulihan perubahan yang belum sempat naik --');
    w.eval('stSembunyi(); saveInFlight=false; savePending=false;');

    /* Keadaan awal: satu baris sudah tersimpan di server dengan cap server. */
    const capServerAwal = jamServer + 5000;
    simpanan['clients:c9'] = capServerAwal;
    const srvPalsu = () => ({ clients: [{ id:'c9', nama:'Klien Server', hp:'0800', updatedAt: capServerAwal }],
                              events:[], vip:[], designreqs:[] });

    /* Kru menyunting baris itu; kirimannya GAGAL, jadi cuma ada di localStorage
       dengan cap KLIEN (jauh lebih kecil daripada cap server). */
    w.eval("S.clients=[{id:'c9', nama:'Klien Server', hp:'0800', updatedAt:" + capServerAwal + "}];");
    w.eval('refreshSnapshot();');
    w.eval("S.clients[0].hp='0899-DIUBAH'; stampChanges(); tandaiBelumNaik();");
    w.eval('localStorage.setItem(KEY, JSON.stringify(S));');
    cek('cap lokal memang LEBIH KECIL daripada cap server',
        w.eval('S.clients[0].updatedAt') < capServerAwal,
        'data ujinya tidak mewakili keadaan yang dilaporkan');
    cek('basis baris kotor ikut dicatat',
        !!(w.eval('basisBelumNaik()') && w.eval("basisBelumNaik()['clients:c9']") === capServerAwal),
        'tanpa catatan basis, pemulihan harus menebak dari cap waktu');

    /* Muat ulang: server BELUM berubah sejak basis kita.
       fetch-nya WAJIB menjawab: pulihkanBelumNaik() memanggil kirimPemulihan()
       untuk baris yang diselamatkan, dan fetch yang menggantung membuat
       await-nya tidak pernah selesai — ujinya berhenti diam-diam di tengah,
       tanpa satu pun baris GAGAL. */
    w.fetch = fetchCepat;
    /* Seperti apiLoad(): salinan SERVER dipasang lebih dulu. Tanpa ini S masih
       memegang suntingan lokal dan asersinya benar tanpa fungsinya berbuat
       apa-apa — mutasi `pemulihan membandingkan dua jam` memang lolos karena
       itu. */
    w.eval('S = normalizeState(' + JSON.stringify(srvPalsu()) + ');');
    await w.eval('pulihkanBelumNaik(' + JSON.stringify(srvPalsu()) + ')');
    cek('suntingan yang belum naik DISELAMATKAN, bukan dibuang',
        w.eval("S.clients[0].hp") === '0899-DIUBAH',
        'pekerjaan kru hilang tanpa satu pun tanda — dapat ' + w.eval('S.clients[0].hp'));

    /* Sekarang orang lain BENAR-BENAR menyimpan baris itu sesudah basis kita. */
    w.eval('stSembunyi(); saveInFlight=false; savePending=false;');
    w.eval('window.__BENTROK__=null;');
    w.eval("S.clients=[{id:'c9', nama:'Klien Server', hp:'0800', updatedAt:" + capServerAwal + "}];");
    w.eval('refreshSnapshot();');
    w.eval("S.clients[0].hp='0899-DIUBAH'; stampChanges(); tandaiBelumNaik();");
    w.eval('localStorage.setItem(KEY, JSON.stringify(S));');
    const srvDisalip = { clients: [{ id:'c9', nama:'Klien Server', hp:'0777-ORANG-LAIN',
                                     updatedAt: capServerAwal + 9999 }],
                         events:[], vip:[], designreqs:[] };
    w.eval('S = normalizeState(' + JSON.stringify(srvDisalip) + ');');
    await w.eval('pulihkanBelumNaik(' + JSON.stringify(srvDisalip) + ')');
    cek('yang BENAR-BENAR disalip tetap dilaporkan',
        (w.__BENTROK__ || []).length === 1,
        'alarm yang sungguhan ikut mati: ' + JSON.stringify(w.__BENTROK__));

    /* Baris yang TIDAK kotor tidak boleh ikut dilaporkan apa pun — inilah yang
       memenuhi modal user dengan 9 nama yang tidak ia sentuh. */
    w.eval('stSembunyi(); saveInFlight=false; savePending=false;');
    w.eval('window.__BENTROK__=null;');
    w.eval("S.clients=[{id:'c9', nama:'Klien Server', hp:'0800', updatedAt:" + capServerAwal + "}];");
    w.eval('refreshSnapshot(); tandaiBelumNaik();');   // penanda ada, TAPI tidak ada yang kotor
    w.eval('localStorage.setItem(KEY, JSON.stringify(S));');
    w.eval('S = normalizeState(' + JSON.stringify(srvDisalip) + ');');
    await w.eval('pulihkanBelumNaik(' + JSON.stringify(srvDisalip) + ')');
    cek('baris yang TIDAK disunting tidak ikut dilaporkan bentrok',
        (w.__BENTROK__ || []).length === 0,
        'inilah yang memenuhi modal dengan nama yang tidak seorang pun sentuh: ' +
        JSON.stringify(w.__BENTROK__));

    /* BARIS BARU yang server belum punya — inilah bentuk keluhan `input
       Database Client tidak tersimpan`. Ia WAJIB diselamatkan tanpa syarat:
       baris yang tidak ada di server tidak mungkin milik orang lain, jadi
       tidak ada yang bisa tertimpa. Ini juga jaring untuk penanda lama yang
       belum punya catatan basis. */
    w.eval('stSembunyi(); saveInFlight=false; savePending=false;');
    w.eval('window.__BENTROK__=null;');
    w.eval("S.clients=[{id:'c9', nama:'Klien Server', hp:'0800', updatedAt:" + capServerAwal + "}];");
    w.eval('refreshSnapshot();');
    w.eval("S.clients.push({id:'cBARU', nama:'Klien Baru Diketik', hp:'0813'});");
    w.eval('stampChanges(); tandaiBelumNaik();');
    w.eval('localStorage.setItem(KEY, JSON.stringify(S));');
    w.eval('S = normalizeState(' + JSON.stringify(srvPalsu()) + ');');   // server belum punya
    cek('server memang belum punya baris itu',
        w.eval("S.clients.filter(c=>c.id==='cBARU').length") === 0);
    await w.eval('pulihkanBelumNaik(' + JSON.stringify(srvPalsu()) + ')');
    cek('baris BARU yang belum sempat naik diselamatkan',
        w.eval("S.clients.filter(c=>c.id==='cBARU').length") === 1,
        'inilah bentuk keluhan input Database Client yang hilang');
    cek('...dan benar-benar dikirim ke server',
        simpanan['clients:cBARU'] != null,
        'diselamatkan di layar tapi tidak pernah sampai ke database');

    const SRC9 = fs.readFileSync(path.join(ROOT, 'deploy/marketing/index.html'), 'utf8');
    cek('pemulihan tidak lagi membandingkan cap lokal dengan cap server',
        SRC9.indexOf('tLok>tSrv') < 0 && SRC9.indexOf('tLok<tSrv') < 0,
        'dua jam yang berbeda tidak pernah bisa dibandingkan dengan benar');
    cek('...melainkan basis server vs versi server',
        /tSrv>tBasis/.test(SRC9));

    /* Catatan basis WAJIB ikut dibersihkan begitu kiriman berhasil. Kalau
       tertinggal, muat ulang berikutnya mencoba `memulihkan` baris yang
       sebenarnya sudah lama tersimpan — dan menimpanya dengan salinan lama. */
    w.eval('stSembunyi(); saveInFlight=false; savePending=false;');
    w.fetch = fetchCepat;
    w.eval("S.clients[0].hp='0855'; save();");
    cek('catatan basis dipasang saat menyimpan',
        w.eval('localStorage.getItem(KEY_PENDING_BASE)') !== null);
    await tunggu(80);
    cek('...dan dibersihkan begitu server menerima',
        w.eval('localStorage.getItem(KEY_PENDING_BASE)') === null,
        'muat ulang berikutnya akan menimpa data tersimpan dengan salinan lama');

    /* ---------- 10. BIAYA MENYIMPAN ----------
       Keluhan user 8 September 2026: "Menyimpan ke server ini juga lama banget
       untuk eksekusi."

       Yang mahal BUKAN kloning state-nya (dugaan pertama, dan pengukuran
       menolaknya: kloning penuh ~34 ms, satu sapuan _dirty ~51 ms pada 20.000
       clients). Yang mahal `_sig()` = JSON.stringify PER BARIS, dan jalur
       simpan dulu menyapunya TIGA kali: stampChanges, petaBasisKotor, lalu
       buildPayload.

       Yang dijaga di sini JUMLAH SAPUAN, bukan waktunya — waktu berbeda di
       tiap mesin dan uji yang mematok milidetik akan merah di laptop yang
       sibuk. Sapuan dihitung dengan membungkus _sig(). */
    console.log('\n-- biaya menyimpan --');
    w.eval('stSembunyi(); saveInFlight=false; savePending=false;');
    w.eval("S.clients=[]; for(let i=0;i<400;i++) S.clients.push({id:'k'+i,nama:'K'+i,hp:'08'+i});");
    w.eval('refreshSnapshot();');
    w.eval("S.clients[0].hp='0899-ubah';");
    w.eval('window.__SIG__=0; _sigAsli=_sig; _sig=function(o){ window.__SIG__++; return _sigAsli(o); };');
    w.fetch = fetchCepat;
    w.eval('save();');
    await tunggu(80);
    const sapuan = w.__SIG__ / 400;
    cek('baris hanya disapu SEKALI per penyimpanan',
        sapuan <= 1.2,
        'tiap sapuan JSON.stringify seluruh baris — dapat ' + sapuan.toFixed(2) + ' sapuan/baris');
    w.eval('_sig=_sigAsli;');

    const SRC10 = fs.readFileSync(path.join(ROOT, 'deploy/marketing/index.html'), 'utf8');
    cek('daftar baris kotor dioper, tidak dihitung ulang',
        /buildPayload\(capBaru\.kotor, true\)/.test(SRC10) && /const kotorTahu = \(kotor instanceof Set\)/.test(SRC10));
    cek('payload tidak lagi mengkloning seluruh state',
        SRC10.indexOf('const p = JSON.parse(JSON.stringify(S));') < 0,
        'kloning penuh untuk menempelkan satu field pada segelintir baris');
    cek('baseUpdatedAt TIDAK bocor ke S',
        w.eval("S.clients.filter(c=>'baseUpdatedAt' in c).length") === 0,
        'kalau bocor, penyimpanan berikutnya mengirim base basi -> bentrok palsu');

    const LIB10 = fs.readFileSync(path.join(ROOT, 'marketing-mysql/lib_marketing_mysql.php'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '');
    cek('server melewati baris yang tidak berubah',
        /if \(!\$lolosBentrok && isset\(\$verServer\[\$id\]\) && \$ua === \$verServer\[\$id\]\) continue;/.test(LIB10),
        'puluhan ribu execute() ke MySQL untuk satu event yang disunting');
    /* Melewatinya TIDAK boleh ikut melewati pencatatan id: itu yang menentukan
       baris tidak ikut terhapus hapus_yang_hilang(). */
    const iIds = LIB10.indexOf('$ids[] = $id;');
    const iLewat = LIB10.indexOf('$ua === $verServer[$id]) continue;');
    cek('...tapi id-nya tetap dicatat lebih dulu', iIds > -1 && iLewat > iIds,
        'melewatkan pencatatan id berarti MENGOSONGKAN tabel');

    /* Modal bentrok menjelaskan sebab yang paling sering. */
    cek('modal bentrok menyebut sebab tersering (tab ganda)',
        /terbuka di lebih dari satu tab/.test(SRC10),
        'yang membacanya bertanya "siapa? kapan?" tanpa satu pun jalan mencarinya');
    cek('...dan menunjukkan angka versinya',
        /versimu '\+jam\(vk\)\+', di server '\+jam\(vs\)/.test(SRC10),
        'tanpa angka, bentrok sungguhan dan bentrok palsu terlihat sama persis');

    /* ---------- 11. MUAT ULANG HARUS MENYEMBUHKAN ----------
       Ditemukan dari data dev 8 September 2026: empat baris VIP & Request
       Design dari BULAN AGUSTUS tersangkut selamanya. Basis yang dipegang tab
       itu lebih tua daripada versi server, jadi kirimannya tidak akan pernah
       bisa menang — berapa kali pun `Muat ulang` ditekan, karena baris yang
       kalah tetap tinggal di catatan `belum naik` dan dipulihkan lagi sesudah
       halaman dimuat.

       Tombol yang menjanjikan penyembuhan tapi memutar ulang masalahnya adalah
       yang paling merusak kepercayaan: yang menekannya berkali-kali akhirnya
       berhenti membaca isinya. */
    console.log('\n-- muat ulang benar-benar menyembuhkan --');
    w.eval('stSembunyi(); saveInFlight=false; savePending=false;');
    w.eval("localStorage.setItem(KEY_PENDING,'1');");
    w.eval("localStorage.setItem(KEY_PENDING_BASE, JSON.stringify({" +
           "'vip:vLAMA': 111, 'clients:cMENUNGGU': 222 }));");
    w.eval("lupakanBentrok([{koleksi:'vip', id:'vLAMA', nama:'ssss'}]);");
    const sisa = JSON.parse(w.eval('localStorage.getItem(KEY_PENDING_BASE)') || 'null');
    cek('baris yang KALAH dibuang dari catatan belum-naik',
        !!sisa && !('vip:vLAMA' in sisa),
        'kalau tetap ada, muat ulang memulihkannya lagi dan modalnya kembali');
    cek('...tapi baris lain yang masih menunggu TIDAK ikut dibuang',
        !!sisa && ('clients:cMENUNGGU' in sisa),
        'yang belum pernah sampai ke server tetap harus diselamatkan');

    /* Kalau yang kalah adalah SATU-SATUNYA yang menunggu, penandanya ikut
       dicabut — kalau tidak, tiap muat ulang menjalankan pemulihan untuk
       daftar yang sudah kosong. */
    w.eval("localStorage.setItem(KEY_PENDING,'1');");
    w.eval("localStorage.setItem(KEY_PENDING_BASE, JSON.stringify({'vip:vLAMA':111}));");
    w.eval("lupakanBentrok([{koleksi:'vip', id:'vLAMA', nama:'ssss'}]);");
    cek('penanda belum-naik ikut dicabut kalau tidak ada sisa',
        w.eval('localStorage.getItem(KEY_PENDING)') === null);

    const SRC11 = fs.readFileSync(path.join(ROOT, 'deploy/marketing/index.html'), 'utf8');
    cek('tombol Muat ulang mengoper daftar bentroknya',
        /reloadFromServer\(_bentrokTerakhir\)/.test(SRC11),
        'tanpa daftarnya, tombol itu tidak tahu baris mana yang harus dilupakan');
    /* DIJALANKAN SUNGGUHAN, bukan cuma dibaca dari sumber. Uji sebelumnya
       memanggil lupakanBentrok() langsung, jadi ia tidak pernah membuktikan
       reloadFromServer() memakainya — dan mutasi yang mencabut pemanggilannya
       LOLOS. location.reload() tidak ada di jsdom, jadi diganti pencatat. */
    w.eval("localStorage.setItem(KEY_PENDING,'1');");
    w.eval("localStorage.setItem(KEY_PENDING_BASE, JSON.stringify({'vip:vKALAH':111,'clients:cSISA':222}));");
    w.eval('window.__RELOAD__=0;');
    /* jsdom menolak menimpa `location.reload` lewat defineProperty pada
       sebagian versi; kalau begitu seluruh objek `location`-nya yang diganti.
       Kalau dua-duanya gagal, penandanya -1 dan pemeriksaannya MELEWAT. */
    w.eval('try{ Object.defineProperty(window.location, "reload",' +
           '{configurable:true, writable:true, value:function(){ window.__RELOAD__++; }});' +
           'if(typeof window.location.reload !== "function") throw 0;' +
           '} catch(e){ try{ Object.defineProperty(window, "location", {configurable:true,' +
           'value:{ reload:function(){ window.__RELOAD__++; }, href:"", replace:function(){} }});' +
           '}catch(e2){ window.__RELOAD__=-1; } }');
    w.eval("reloadFromServer([{koleksi:'vip', id:'vKALAH', nama:'ssss'}]);");
    const sisa2 = JSON.parse(w.eval('localStorage.getItem(KEY_PENDING_BASE)') || 'null');
    cek('menekan Muat ulang benar-benar melupakan baris yang kalah',
        !!sisa2 && !('vip:vKALAH' in sisa2) && ('clients:cSISA' in sisa2),
        'tombolnya memutar ulang masalahnya: ' + JSON.stringify(sisa2));
    const nReload = w.eval('window.__RELOAD__');
    if (nReload === -1) skip('...dan tetap memuat ulang halamannya (stub location.reload tidak bisa dipasang)');
    else cek('...dan tetap memuat ulang halamannya', nReload > 0,
        'melupakan saja tanpa memuat ulang meninggalkan layar dengan data basi');
    /* Angka di modal WAJIB memuat tanggal: baris 13 Agustus tampil sebagai
       `12.27.59` di sebelah basis 12 Agustus `12.39.21` — terbaca seolah versi
       server lebih TUA, padahal syarat bentroknya justru sebaliknya. */
    /* Perilakunya MELEWAT di jsdom (location.reload tidak bisa distub), jadi
       kontraknya yang dijaga di sumber — kalau tidak, mutasi yang mencabut
       location.reload() lolos tanpa satu pun asersi yang berbunyi. */
    cek('reloadFromServer tetap memuat ulang halamannya',
        /function reloadFromServer\([^)]*\)\{[^}]*location\.reload\(\);/.test(SRC11),
        'melupakan saja tanpa memuat ulang meninggalkan layar dengan data basi');
    cek('...dan melupakan yang kalah SEBELUM memuat ulang',
        /function reloadFromServer\([^)]*\)\{ lupakanBentrok\(bentrok\);/.test(SRC11),
        'sesudah reload, kodenya tidak pernah sampai dijalankan');
    cek('angka versi di modal memuat TANGGAL, bukan cuma jam',
        /toLocaleString\('id-ID',\{day:'2-digit',month:'short'/.test(SRC11),
        'angka yang dipajang untuk menjelaskan tidak boleh bisa dibaca terbalik');

    /* ---------- 12. BARIS YANG KALAH TIDAK BOLEH KEMBALI SENDIRI ----------
       Dilaporkan user 8 September 2026: modal muncul lagi dan lagi di dev,
       untuk empat baris VIP & Request Design bercap BULAN AGUSTUS yang tidak
       seorang pun sentuh.

       Baris yang basisnya lebih tua daripada versi server TIDAK AKAN PERNAH
       bisa menang. Selama ia tetap tinggal di catatan `belum naik`, tiap
       pemuatan halaman memulihkannya lagi dan modalnya muncul lagi — tanpa kru
       menyentuh apa pun.

       Penanda itu hidup di localStorage yang DIBAGI ANTAR TAB, jadi
       pembersihan yang bergantung pada seseorang menekan tombol tidak cukup:
       tab yang tidak pernah dilihat orang akan terus meracuninya. */
    console.log('\n-- baris yang kalah tidak kembali sendiri --');
    w.eval('stSembunyi(); saveInFlight=false; savePending=false;');
    w.eval('window.__BENTROK__=null;');

    const capAgu = Date.UTC(2026, 7, 13, 5, 27, 0);       // 13 Agu 12:27 WIB
    const basisTua = Date.UTC(2026, 7, 3, 5, 39, 0);      // 3 Agu 12:39 WIB
    const srvAgu = { clients: [], events: [], designreqs: [],
      vip: [{ id:'vAGU', nama:'ssss', tanggal:'2026-08-13', updatedAt: capAgu }] };

    /* DUA baris sengaja, dan pemilihannya menentukan:
         vAGU  -> KALAH  (isinya beda, basisnya lebih tua daripada server)
         cBARU -> MENUNGGU (server belum punya, wajib diselamatkan)
       Tanpa baris kedua, `dipulihkan` kosong dan tandaiSudahNaik() membersihkan
       SELURUH catatan — asersinya lalu hijau walau lupakanBentrok() dicabut.
       Versi pertama uji ini memang meloloskan mutasinya karena itu.

       kirimPemulihan() juga dibuat GAGAL: kalau ia berhasil, ia memanggil
       tandaiSudahNaik() sendiri dan sekali lagi menghapus jejak yang sedang
       diperiksa. Kegagalan itu pula keadaan yang sesungguhnya berbahaya —
       tanpa lupakanBentrok(), yang kalah tertinggal di catatan. */
    w.eval('S = normalizeState(' + JSON.stringify(srvAgu) + ');');
    w.eval('refreshSnapshot();');
    w.eval("S.vip[0].nama='ssss-DIUBAH';");
    w.eval("S.clients.push({id:'cBARU', nama:'Klien Baru', updatedAt:" + (capAgu + 1) + "});");
    w.eval('localStorage.setItem(KEY, JSON.stringify(S));');
    w.eval("localStorage.setItem(KEY_PENDING,'1');");
    w.eval("localStorage.setItem(KEY_PENDING_BASE, JSON.stringify({'vip:vAGU':" + basisTua +
           ", 'clients:cBARU':0}));");

    /* Seperti apiLoad(): salinan server dipasang lebih dulu. */
    w.eval('S = normalizeState(' + JSON.stringify(srvAgu) + ');');
    w.fetch = () => Promise.reject(new Error('jaringan mati'));
    await w.eval('pulihkanBelumNaik(' + JSON.stringify(srvAgu) + ')');
    /* Modalnya TIDAK digambar di sini: begitu ada baris yang dipulihkan,
       jalurnya lewat kirimPemulihan() — dan di skenario ini kirimannya sengaja
       gagal. Yang diperiksa catatannya, bukan modalnya. */
    const basisSisa = JSON.parse(w.eval('localStorage.getItem(KEY_PENDING_BASE)') || 'null');
    cek('...dan LANGSUNG dilupakan, tanpa menunggu tombol ditekan',
        !!basisSisa && !('vip:vAGU' in basisSisa),
        'pemuatan berikutnya akan memunculkan modal yang sama lagi: ' + JSON.stringify(basisSisa));
    cek('...sementara baris yang masih MENUNGGU tetap dijaga',
        !!basisSisa && ('clients:cBARU' in basisSisa),
        'yang belum pernah sampai ke server ikut terbuang: ' + JSON.stringify(basisSisa));

    /* Pemuatan KEDUA: tidak boleh ada modal lagi untuk baris yang sudah kalah. */
    w.eval('window.__BENTROK__=null;');
    w.eval('S = normalizeState(' + JSON.stringify(srvAgu) + ');');
    w.eval("S.clients.push({id:'cBARU', nama:'Klien Baru'});");   // masih menunggu
    w.eval('localStorage.setItem(KEY, JSON.stringify(S));');
    w.eval('S = normalizeState(' + JSON.stringify(srvAgu) + ');');
    await w.eval('pulihkanBelumNaik(' + JSON.stringify(srvAgu) + ')');
    cek('pemuatan berikutnya sudah bersih', (w.__BENTROK__ || []).length === 0,
        'inilah bentuk keluhan `muncul terus`: ' + JSON.stringify(w.__BENTROK__));


    /* ---------- DUA TAB, SATU OTOMASI (11 September 2026) ----------

       Dilaporkan user: modal "Sebagian Perubahan Tidak Tersimpan" muncul untuk
       event yang ia input SENDIRI, tanpa ada rekan kerja yang menyentuhnya.

       Sebabnya otomasi, bukan orang. boot() menjalankan autoCloseEvents() lalu
       save(), jadi SETIAP tab yang dibuka menulis baris event yang tanggalnya
       sudah lewat. Dua tab yang dibuka berdekatan sama-sama membaca versi
       lama; tab pertama menulis, dan tab kedua dilaporkan bentrok — untuk
       baris yang isinya PERSIS SAMA dengan yang barusan ditulis tab pertama.

       Yang diuji di sini JUMLAH BENTROK dari server tiruan, bukan ada-tidaknya
       modal di layar: teks modal itu juga hidup sebagai string di dalam
       <script> halaman, jadi memeriksa body.textContent cocok dengan KODENYA
       dan hijau apa pun yang terjadi. Jebakan yang sudah dibayar di
       uji-vip-radar.js. */
    {
      const V0 = 1700000000000;
      const lalu = new Date(Date.now() - 10 * 86400000).toISOString().slice(0, 10);
      const DB = {
        events: { e_ab: { id:'e_ab', nama:'Birthday 5 Tahun Abraham', tanggal:lalu,
                          status:'Confirmed', pipeCol:'Confirmed', updatedAt:V0, createdAt:V0 } },
        ver: { e_ab: V0 }
      };
      let nBentrok = 0, nPost = 0;

      /* Cerminan sidik_baris() di lib_marketing_mysql.php. Bentuknya dijaga
         terpisah lewat asersi SUMBER di bagian PHP — tiruan yang bentuknya
         beda dari yang ditiru tidak menguji apa pun. */
      const sidik = r => {
        if (!r || typeof r !== 'object') return '';
        const c = JSON.parse(JSON.stringify(r));
        delete c.updatedAt; delete c.baseUpdatedAt;
        const urut = v => Array.isArray(v) ? v.map(urut)
          : (v && typeof v === 'object'
              ? Object.keys(v).sort().reduce((o, k) => { o[k] = urut(v[k]); return o; }, {})
              : v);
        return JSON.stringify(urut(c));
      };
      const simpanServer = body => {
        const bentrok = [], versi = {};
        nPost++;
        ((body.data && body.data.events) || []).forEach(r => {
          if (!r || !r.id) return;
          if (Object.prototype.hasOwnProperty.call(r, 'baseUpdatedAt')) {
            const base = +r.baseUpdatedAt || 0;
            if (DB.ver[r.id] && DB.ver[r.id] > base) {
              /* ISI SAMA = BUKAN BENTROK, dan versinya dipulangkan. */
              if (sidik(DB.events[r.id]) === sidik(r)) { versi['events:' + r.id] = DB.ver[r.id]; return; }
              bentrok.push({ koleksi:'events', id:r.id, nama:r.nama || r.id,
                             versiKamu:base, versiServer:DB.ver[r.id] });
              return;
            }
          }
          const simpan = Object.assign({}, r); delete simpan.baseUpdatedAt;
          DB.events[r.id] = simpan; DB.ver[r.id] = +simpan.updatedAt || 0;
        });
        nBentrok += bentrok.length;
        return { ok:true, data:{ bentrok, versi } };
      };

      const htmlTab = MKT
        .replace(/<script[^>]*\ssrc="[^"]*performa-bonus\.js"[^>]*><\/script>/i,
          '<script>' + fs.readFileSync(path.join(ROOT, 'deploy/assets/performa-bonus.js'), 'utf8') + '</script>')
        .replace(/<script[^>]*\ssrc="[^"]*venue-layouts\.js"[^>]*><\/script>/i,
          '<script>' + fs.readFileSync(path.join(ROOT, 'deploy/assets/venue-layouts.js'), 'utf8') + '</script>')
        .replace(/<script[^>]*\ssrc=[^>]*><\/script>/gi, '');
      const buatTab = () => {
        const vc2 = new VirtualConsole(); vc2.on('jsdomError', () => {});
        return new JSDOM(htmlTab, { virtualConsole: vc2, runScripts: 'dangerously',
          url: 'https://dev.laksamanamuda.id/marketing/',
          beforeParse(w) {
            w.localStorage.setItem('lm_session', JSON.stringify({ id:'u1', name:'Uji',
              modules:['marketing'], adminModules:['marketing'], token:'t', expiry: Date.now() + 86400000 }));
            w.matchMedia = () => ({ matches:false, addListener(){}, removeListener(){}, addEventListener(){}, removeEventListener(){} });
            w.print = () => {}; w.confirm = () => true; w.alert = () => {};
            w.Chart = class { destroy(){} update(){} };
            w.HTMLCanvasElement.prototype.getContext = () => ({});
            w.fetch = async (url, init) => {
              const u = String(url);
              const b = init && init.body ? JSON.parse(init.body) : {};
              const bal = o => ({ ok:true, status:200, text: async () => JSON.stringify(o), json: async () => o });
              if (u.indexOf('account-api') > -1) return bal({ ok:true, members: [] });
              if (b.action === 'saveAll') return bal(simpanServer(b));
              return bal({ ok:true, data:{ events:[Object.assign({}, DB.events.e_ab)],
                                           clients:[], users:[], _versi: DB.ver.e_ab } });
            };
          } });
      };
      const tunggu2 = ms => new Promise(r => setTimeout(r, ms));
      const siap2 = async w => { for (let i = 0; i < 200; i++) {
        try { if (w.eval('typeof S !== "undefined" && S && Array.isArray(S.events) && S.events.length')) return; } catch (e) {}
        await tunggu2(50); } };

      const tA = buatTab(), tB = buatTab();
      await Promise.all([siap2(tA.window), siap2(tB.window)]);
      await tunggu2(900);

      /* Otomasi itu memang MENULIS — kalau suatu hari ia berhenti menulis,
         ujinya harus berbunyi, bukan diam-diam jadi hijau karena tidak ada
         penyimpanan sama sekali. */
      cek('otomasi boot benar-benar menulis ke server', nPost > 0,
          'tanpa penyimpanan, nol bentrok tidak membuktikan apa pun');
      cek('status event ditutup otomatis oleh boot', DB.events.e_ab.status === 'Event Done',
          DB.events.e_ab.status);
      cek('dua tab yang menulis kesimpulan yang SAMA tidak dilaporkan bentrok',
          nBentrok === 0, nBentrok + ' baris dilaporkan bentrok — inilah keluhan aslinya');
      /* Acuan bentrok di tab kedua WAJIB menyusul ke versi server. Tanpa itu ia
         tetap memegang capnya sendiri, dan penyimpanan berikutnya bentrok lagi
         karena sebab yang sama — persis bentuk "nyangkut lagi". */
      sama('acuan bentrok tab kedua menyusul ke versi server',
           tB.window.eval("_serverVer['events:e_ab']"), DB.ver.e_ab);

      /* JARING: bentrok SUNGGUHAN tidak boleh ikut dilonggarkan. Isi yang
         BERBEDA harus tetap dilaporkan — melonggarkannya lebih berbahaya
         daripada bentrok palsu. */
      {
        const r = simpanServer({ data:{ events:[{ id:'e_ab', nama:'Judul lain sama sekali',
          tanggal:lalu, status:'Confirmed', pipeCol:'Confirmed',
          baseUpdatedAt: V0, updatedAt: Date.now() }] } });
        cek('bentrok SUNGGUHAN tetap dilaporkan', (r.data.bentrok || []).length === 1,
            JSON.stringify(r.data.bentrok));
      }
      tA.window.close(); tB.window.close();
    }


    /* ---------- KONTRAK "ISI SAMA BUKAN BENTROK" DI SUMBER PHP ----------

       Server tiruan di blok dua-tab di atas MENIRU aturan ini. Tiruan yang
       bentuknya beda dari yang ditiru tidak menguji apa pun — pelajaran yang
       sudah dibayar di stub hpp.php pada uji-analytics dan di kontrak
       omsetHari. Jadi yang dijaga di sini SUMBERNYA, bukan tiruannya. */
    {
      const LIB = fs.readFileSync(path.join(ROOT, 'marketing-mysql/lib_marketing_mysql.php'), 'utf8');
      cek('sidik_baris() ada', /function\s+sidik_baris\s*\(/.test(LIB));
      /* Cap waktu WAJIB dibuang sebelum dibandingkan — kalau tidak, dua baris
         yang isinya identik selalu terbaca berbeda (capnya memang selalu
         beda), dan penjaganya berhenti menolong persis pada kasus yang ia
         diadakan untuk menolongnya. */
      cek('...membuang updatedAt & baseUpdatedAt sebelum membandingkan',
          /unset\(\$r\['updatedAt'\],\s*\$r\['baseUpdatedAt'\]\)/.test(LIB));
      /* Kunci DIURUTKAN bertingkat: urutan kunci JSON tersimpan (lewat
         json_decode/encode PHP) tidak dijamin sama dengan urutan properti dari
         JavaScript. */
      cek('...dan mengurutkan kuncinya bertingkat',
          /function\s+urut_dalam\s*\(/.test(LIB) && /ksort\(\$out\)/.test(LIB));
      /* Daftar berindeks angka TIDAK boleh ikut diurutkan — urutan isinya
         berarti (mis. daftar pembayaran, daftar tamu). */
      cek('...tanpa mengurutkan daftar berindeks angka', /is_int\(\$k\)/.test(LIB));

      /* Isi tersimpan memang diambil dari database — tanpa kolom data,
         perbandingannya tidak punya bahan dan penjaganya mati diam-diam. */
      cek('isi tersimpan ikut diambil di query yang sudah ada',
          /SELECT id, updated_at, data FROM/.test(LIB));

      /* KEDUA penjaga bentrok harus memakainya. Yang dilonggarkan cuma di
         salah satunya membuat designreqs & vip tetap melaporkan bentrok palsu
         sementara events berhenti, dan bedanya mustahil dijelaskan. */
      const pakai = LIB.split('sidik_baris(').length - 1;
      cek('kedua penjaga bentrok memakainya (4 pemanggilan + 1 definisi)',
          pakai >= 5, 'ditemukan ' + pakai + ' penyebutan');
      cek('dipakai di upsert_collection',
          /\$dataServer\[\$id\]\)\s*&&\s*sidik_baris\(\$dataServer\[\$id\]\)\s*===\s*sidik_baris\(\$r\)/.test(LIB));
      cek('dipakai di upsert_settings_collection',
          /\$adaId\[\$id\]\)\s*&&\s*sidik_baris\(\$adaId\[\$id\]\)\s*===\s*sidik_baris\(\$r\)/.test(LIB));

      /* PEMERIKSAANNYA HARUS MENDAHULUI pendorongan $bentrok. Ditaruh
         sesudahnya, barisnya tetap dilaporkan bentrok dan seluruh perbaikan
         ini tidak mengubah apa pun di layar. */
      const potongUpsert = LIB.slice(LIB.indexOf('function upsert_collection'),
                                     LIB.indexOf('function hapus_yang_hilang'));
      cek('diperiksa SEBELUM baris didorong ke daftar bentrok',
          potongUpsert.indexOf('sidik_baris(') < potongUpsert.indexOf("'versiServer' => $verServer[$id]"),
          'ditaruh sesudahnya, barisnya tetap dilaporkan bentrok');

      /* Versi server DIPULANGKAN supaya acuan bentrok di klien menyusul.
         Tanpa itu klien tetap memegang capnya sendiri, dan penyimpanan
         berikutnya bentrok lagi karena sebab yang sama — bentuk "nyangkut
         lagi" yang dikeluhkan user. */
      cek('versi server dipulangkan pada jalur isi-sama',
          /\$versi\[\$namaKoleksi \. ':' \. \$id\] = \$verServer\[\$id\];/.test(LIB)
          && /\$versi\[\$nama \. ':' \. \$id\] = \$verServer;/.test(LIB));

      /* JARING: penjaga bentroknya sendiri tidak boleh ikut dicabut. */
      cek('penjaga bentrok untuk isi yang BERBEDA tetap ada',
          (LIB.split('JANGAN timpa kerja orang lain').length - 1) === 2);
    }

    const SRC12 = fs.readFileSync(path.join(ROOT, 'deploy/marketing/index.html'), 'utf8');
    cek('dilupakan SEBELUM kirimPemulihan berangkat',
        SRC12.indexOf('if(kalah.length) lupakanBentrok(kalah);') <
        SRC12.indexOf('await kirimPemulihan(dipulihkan.length, kalah);'),
        'kirimPemulihan yang gagal akan meninggalkan mereka di catatan');

    console.log('\n' + ok + ' OK, ' + gagal + ' GAGAL' + (lewat ? ', ' + lewat + ' LEWAT' : ''));
    process.exit(gagal ? 1 : 0);
  })();
}
