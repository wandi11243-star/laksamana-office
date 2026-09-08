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

/* ---------- 4. cap tulis dari JAM SERVER ---------- */
console.log('\n-- cap urutan tidak lagi bergantung jam perangkat --');
cek('ada cap_tulis() yang memakai jam server', /function cap_tulis\(\$ua, \$lolosBentrok, \$verServer, \$nowMs\)/.test(LIB_KODE));
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
cek('upsert_collection TIDAK lagi memakai cap klien apa adanya',
    !/\$ua = ms_valid\(isset\(\$simpan\['updatedAt'\]\)/.test(BADAN_UPSERT),
    'cap dari jam perangkat kembali menentukan urutan');
cek('$nowMs diambil SEKALI per kiriman, bukan per baris',
    /\$nowMs = sekarang_ms\(\);/.test(LIB_KODE) &&
    (LIB_KODE.match(/sekarang_ms\(\)/g) || []).length === 2,
    'dua baris yang disimpan bersamaan tidak boleh dapat cap berbeda');
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
cek('klien memasang cap server SEBELUM mencatat acuan',
    MKT.indexOf('terapkanVersiServer(j.data.versi);') <
    MKT.indexOf('refreshSnapshot();     // …baru dicatat sebagai acuan bentrok berikutnya'),
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
        { id: 'v1', nama: 'VIP Aurel',  tanggal: '2026-09-10', status: 'Confirmed', pax: 8,
          jenis: 'Assisted', meja: ['A1', 'A2'], jamMulai: '19:00', jamSelesai: '22:00' },
        { id: 'v2', nama: 'VIP Batal',  tanggal: '2026-09-11', status: 'Confirmed', pax: 4,
          jenis: 'Assisted', batalAt: '2026-09-08T02:00:00Z' },
        { id: 'v3', nama: 'VIP Cancel', tanggal: '2026-09-12', status: 'Cancelled', pax: 6, jenis: 'Assisted' },
        { id: 'v4', nama: 'VIP Tanpa Tanggal', status: 'Confirmed', pax: 2 } ] };
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
  cek('...tapi tetap DIHITUNG dan ditampilkan terpisah', /paxVip\+' pax · tidak ikut Total'/.test(SRC),
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

    console.log('\n' + ok + ' OK, ' + gagal + ' GAGAL' + (lewat ? ', ' + lewat + ' LEWAT' : ''));
    process.exit(gagal ? 1 : 0);
  })();
}
