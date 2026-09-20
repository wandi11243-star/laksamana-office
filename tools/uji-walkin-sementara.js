/* ============================================================
   UJI — MEJA TIDAK LAGI TERKUNCI OTOMATIS H-3 JAM (19 September 2026)
   ------------------------------------------------------------
   node tools/uji-walkin-sementara.js

   Permintaan user: *"jangan auto lock 3 jam sebelumnya, tapi misalnya tamu
   yang ingin mau duduk sebentar saja masih bisa diklik, untuk duduk walk-in
   sementara."*

   YANG DIUJI DI SINI ADALAH PENJAGA TABRAKAN MEJA, dan itu satu-satunya
   bagian modul Reservasi yang kegagalannya tidak terlihat dari layar: dua
   tamu yang memegang meja yang sama tidak menimbulkan satu pun galat, dan
   baru ketahuan waktu keduanya berdiri di depan meja itu.

   Yang dijaga karena itu BUKAN "tombolnya bisa diklik" melainkan ATURANNYA:

     1. reservasi yang BELUM DATANG tidak lagi menutup mejanya  (yang diminta)
     2. tamu yang SEDANG DUDUK tetap menutup mejanya            (yang dijaga)
     3. FORM reservasi baru tetap ketat H-3 jam                 (yang dijaga)
     4. layar & PENGGABUNG memakai aturan yang SAMA             (yang dijaga)

   Nomor 4 yang paling mudah lepas dan paling mahal: kalau layar memakai
   aturan longgar sementara penggabung memakai yang ketat, walk-in yang sudah
   diterima di layar akan DITOLAK diam-diam saat datanya naik — tamunya sudah
   duduk, kursinya sudah dipakai, dan barisnya lenyap.

   Modul Reservasi cuma "hanya boot yang diuji" di smoke-modul.js, jadi
   fungsi-fungsinya DIPOTONG dari sumbernya lalu dijalankan — bukan disalin,
   supaya ujinya ikut basi kalau aturannya berubah. Pola yang sama dengan
   uji-openbill-performa.js dan uji-reward-se.js.
   ============================================================ */
'use strict';
const fs = require('fs');
const path = require('path');

const AKAR = path.resolve(__dirname, '..');
const SRC = fs.readFileSync(path.join(AKAR, 'deploy/reservasi/index.html'), 'utf8');

let ok = 0, gagal = 0;
function T(nama, syarat, ket) {
  if (syarat) { ok++; return; }
  gagal++;
  console.log('  GAGAL  ' + nama + (ket ? '  (' + ket + ')' : ''));
}
function aman(nama, fn) {
  try { fn(); } catch (e) { gagal++; console.log('  GAGAL  ' + nama + '  (melempar: ' + e.message + ')'); }
}

/* ---- POTONG FUNGSINYA DARI SUMBER ----
   Diambil apa adanya dari berkas yang di-deploy. Disalin ke sini, uji ini
   akan tetap hijau untuk aturan yang sudah lama berubah di sana. */
function potong(nama) {
  const tanda = 'function ' + nama + '(';
  const i = SRC.indexOf(tanda);
  if (i < 0) throw new Error('fungsi tidak ketemu di sumber: ' + nama);
  /* Dihitung kurung kurawalnya, bukan dicari "\n}" — beberapa fungsi di
     berkas ini memuat objek & template literal berisi kurawal. */
  let j = SRC.indexOf('{', i), d = 0, k = j;
  for (; k < SRC.length; k++) {
    const c = SRC[k];
    if (c === '{') d++;
    else if (c === '}') { d--; if (!d) break; }
  }
  return SRC.slice(i, k + 1);
}

/* Konstanta yang dipakai fungsi-fungsi itu DIPOTONG JUGA, bukan disalin
   nilainya ke sini: LOCK_LEAD_MIN menentukan lebar jendela kuncian, dan uji
   yang memegang salinannya sendiri akan tetap hijau kalau angkanya diubah
   di sana. */
function potongConst(nama) {
  const re = new RegExp('const ' + nama + '\\s*=\\s*[^;]+;');
  const m = SRC.match(re);
  if (!m) throw new Error('konstanta tidak ketemu di sumber: ' + nama);
  return m[0];
}

const NAMA = ['dayNo', 'absMin', 'toMin', 'hhmm', 'ymdOf', 'absOfTs', 'absNow',
              'isSeated', 'seatStart', 'lockStart', 'lockEnd', 'locksRange', 'locksAt',
              'locksTable', 'conflictCheck', 'opsiCekOf', 'izinTumpangBerlaku',
              'bedaMenitRes', 'mepetTerhadap', 'mepetKah',
              'tablesOf', 'menitMenuju',
              'bookingBerikut', 'dineEst'];
let sumberFn = '';
aman('semua fungsi yang diuji ada di sumber', () => {
  /* MEPET_MIN ikut DIPOTONG, bukan disalin nilainya: sejak 20 September 2026
     ia menentukan KUNCIAN (H-1 jam), bukan cuma warna — uji yang memegang
     salinan angkanya sendiri akan tetap hijau kalau ambangnya diubah di
     sana. Alasan yang sama dengan LOCK_LEAD_MIN. */
  sumberFn = potongConst('LOCK_LEAD_MIN') + '\n' + potongConst('MEPET_MIN') + '\n'
           + NAMA.map(potong).join('\n');
});
T('potongan sumber terbaca', sumberFn.length > 0);
T('LOCK_LEAD_MIN ikut dipotong dari sumber', sumberFn.indexOf('LOCK_LEAD_MIN =') >= 0);
T('MEPET_MIN ikut dipotong dari sumber', sumberFn.indexOf('MEPET_MIN =') >= 0);

/* STATE & master tiruan seperlunya — yang dipotong memakai keduanya. */
const KODE = 'const STATE = { reservations: [], master: {} };\n'
  + sumberFn + '\n'
  + 'return { STATE, conflictCheck, locksTable, lockStart, lockEnd, isSeated, absMin,'
  + ' absNow, bookingBerikut, opsiCekOf, menitMenuju };';
let M = null;
aman('potongan sumber bisa dijalankan', () => { M = new Function(KODE)(); });
if (!M) { console.log('\n  Tidak bisa lanjut.'); process.exit(1); }

/* ---- WAKTU DIPATOK, bukan mengikuti jam mesin ----
   lockStart/lockEnd dihitung dari absNow(), jadi uji yang bergantung jam
   sungguhan akan hijau di pagi hari dan merah di malam hari — uji yang
   membusuk sendiri lebih buruk daripada tidak ada uji. */
const HARI = '2026-09-19';
function patokJam(jam) {
  const [h, m] = jam.split(':').map(Number);
  const d = new Date(2026, 8, 19, h, m, 0, 0);
  M.absNow = () => M.absOfTs ? M.absOfTs(d.getTime()) : 0;
}
/* absOfTs tidak diekspor; absNow ditimpa langsung lewat nilai absMin. */
function setJam(jam) { NOW_ABS = M.absMin(HARI, jam); }
let NOW_ABS = 0;

/* Fungsi yang dipotong memanggil absNow() dari lingkupnya sendiri, jadi
   jamnya dipatok dengan menjalankan ulang potongannya berikut absNow
   tiruan — cara yang paling jujur: yang diuji tetap kode aslinya. */
function mesin(jamSekarang) {
  const kode = 'const STATE = { reservations: RES, master: {} };\n'
    + 'function absNow(){ return NOW; }\n'
    + sumberFn.replace(/function absNow\(\)\{[^}]*\}/, '')
    + '\nreturn { STATE, conflictCheck, locksTable, lockStart, lockEnd, isSeated,'
    + ' absMin, bookingBerikut, opsiCekOf, menitMenuju };';
  const f = new Function('RES', 'NOW', kode);
  return res => f(res, M.absMin(HARI, jamSekarang));
}

/* ============ SKENARIO ============
   Reservasi jam 19:00 di meja 14, tamunya BELUM datang. Sekarang jam 17:00 —
   yaitu DI DALAM jendela H-3 jam lamanya (kuncian mulai 16:00). */
const RES_BELUM = [{ id: 'r1', name: 'Budi', date: HARI, time: '19:00', pax: 4,
                     table: '14', status: 'Confirmed', sharing: false, source: '' }];
/* Reservasi yang sama, tapi tamunya SUDAH DUDUK sejak 18:00. */
const RES_DUDUK = [{ id: 'r1', name: 'Budi', date: HARI, time: '19:00', pax: 4,
                     table: '14', status: 'Datang', sharing: false, source: '',
                     checkinAt: new Date(2026, 8, 19, 18, 0).getTime() }];

console.log('\n[1] Reservasi yang BELUM datang tidak lagi menutup mejanya');
{
  const buat = mesin('17:00');
  const m = buat(RES_BELUM);
  /* Jendela kunci LAMANYA memang sudah mulai — itu yang membuat uji ini
     berarti. Kalau lockStart-nya belum lewat, aturan barunya tidak diuji
     sama sekali. */
  T('jam 17:00 memang sudah di dalam jendela kunci lama',
    m.lockStart(RES_BELUM[0]) <= m.absMin(HARI, '17:00'),
    'lockStart=' + m.lockStart(RES_BELUM[0]));

  const walkin = m.conflictCheck(HARI, '14', '17:00', null, false, null, { walkin: true });
  T('WALK-IN di meja yang dipesan nanti DITERIMA', walkin === null,
    walkin ? 'ditolak oleh ' + walkin.name : '');

  /* FORM tetap ketat: menjual meja itu untuk reservasi baru jam 17:00 adalah
     bentrok yang sesungguhnya, dan tetap ditolak. */
  const form = m.conflictCheck(HARI, '14', '17:00', null, false, null);
  T('RESERVASI BARU dari form tetap DITOLAK', form !== null && form.id === 'r1',
    form ? 'ditolak oleh ' + form.name : 'diterima — form jadi longgar');
}

/* ============================================================
   [1b] H-1 JAM: KELONGGARANNYA BERHENTI (20 September 2026)

   Permintaan user: *"kalau h-1 jam reservasi lsng auto lock saja"*.

   Kuncian H±3 jam dicabut 19 September karena terlalu lebar. Satu jam
   menjelang jamnya bukan lagi penyangga: tamunya bisa muncul kapan saja,
   dan rombongan yang baru duduk sepuluh menit lalu tidak akan berdiri tepat
   waktu. Jadi kelonggaran walk-in punya BATAS sekarang, dan batas itu
   ditegakkan di conflictCheck — bukan cuma di layar, karena inilah yang
   dipanggil penggabung saat datanya naik.

   Jam 18:30 terhadap booking 19:00 = 30 menit. Skenario [1] memakai 17:00
   (120 menit) dan tetap diterima — dua jarak itu yang membuat ambangnya
   punya tempat untuk gagal; kalau keduanya sama-sama jauh atau sama-sama
   dekat, mutasi yang menggeser ambangnya tidak mengubah apa pun.
   ============================================================ */
console.log('\n[1b] H-1 jam: kelonggarannya berhenti');
{
  const m = mesin('18:30')(RES_BELUM);
  const walkin = m.conflictCheck(HARI, '14', '18:30', null, false, null, { walkin: true });
  T('WALK-IN 30 menit menjelang jamnya DITOLAK', walkin !== null && walkin.id === 'r1',
    walkin ? '' : 'diterima — kuncian H-1 jam tidak berlaku');
  /* Izin manusia pun tidak menembusnya: yang ditanya kru adalah penyangga,
     bukan jam tamunya sendiri. */
  const izin = m.conflictCheck(HARI, '14', '18:30', null, false, null, { izin: true });
  T('IZIN pun tidak menembus kuncian H-1 jam', izin !== null && izin.id === 'r1',
    izin ? '' : 'diterima — izin melonggarkan yang mepet');
  /* Dan yang jamnya SUDAH LEWAT ikut terkunci: booking 19:00 yang tamunya
     belum muncul jam 19:15 justru yang paling mungkin datang sebentar lagi. */
  const lewat = mesin('19:15')(RES_BELUM)
    .conflictCheck(HARI, '14', '19:15', null, false, null, { walkin: true });
  T('yang jamnya SUDAH LEWAT ikut terkunci', lewat !== null && lewat.id === 'r1',
    lewat ? '' : 'diterima — jam yang lewat dianggap bebas');
}

console.log('\n[2] Tamu yang SEDANG DUDUK tetap menutup mejanya');
{
  const m = mesin('18:30')(RES_DUDUK);
  T('tamu yang sedang duduk memang terbaca sedang duduk', m.isSeated(RES_DUDUK[0]));
  const walkin = m.conflictCheck(HARI, '14', '18:30', null, false, null, { walkin: true });
  /* INI YANG MENJAGA KELONGGARANNYA TIDAK KEBABLASAN. Kalau ini lolos, dua
     tamu didudukkan di meja yang sama tanpa satu pun galat. */
  T('WALK-IN di meja yang tamunya sedang duduk DITOLAK',
    walkin !== null && walkin.id === 'r1', walkin ? '' : 'diterima — dua tamu satu meja');
}

console.log('\n[3] Sharing tetap berlaku, dan pulang membebaskan mejanya');
{
  const shareRes = [Object.assign({}, RES_DUDUK[0], { sharing: true })];
  const m = mesin('18:30')(shareRes);
  T('dua-duanya sharing → boleh gabung walau sedang duduk',
    m.conflictCheck(HARI, '14', '18:30', null, true, null, { walkin: true }) === null);
  T('sharing sepihak tetap ditolak',
    m.conflictCheck(HARI, '14', '18:30', null, false, null, { walkin: true }) !== null);

  const pulang = [Object.assign({}, RES_DUDUK[0], { leftAt: Date.now() })];
  const m2 = mesin('18:30')(pulang);
  T('tamu yang sudah pulang tidak menutup meja',
    m2.conflictCheck(HARI, '14', '18:30', null, false, null, { walkin: true }) === null);

  for (const st of ['Cancelled', 'No-show', 'Completed']) {
    const batal = [Object.assign({}, RES_DUDUK[0], { status: st, checkinAt: 0 })];
    const mb = mesin('18:30')(batal);
    T('status ' + st + ' tidak menutup meja',
      mb.conflictCheck(HARI, '14', '18:30', null, false, null, { walkin: true }) === null);
  }
}

console.log('\n[4] Layar & PENGGABUNG memakai aturan yang SAMA');
{
  const m = mesin('17:00')(RES_BELUM);
  /* opsiCekOf() yang menentukan aturan mana yang dipakai penggabung. Dikenali
     dari `source`, BUKAN dari status: reservasi biasa yang ditandai "Datang"
     juga berstatus sama, dan ia harus tetap ketat waktu dipindah mejanya. */
  T('walk-in dikenali dari source', m.opsiCekOf({ source: 'Walk-in' }).walkin === true);
  T('reservasi biasa TIDAK dikenali sebagai walk-in',
    m.opsiCekOf({ source: '' }).walkin === false
    && m.opsiCekOf({ source: 'Online' }).walkin === false);
  T('reservasi berstatus Datang tetap ketat',
    m.opsiCekOf({ source: '', status: 'Datang' }).walkin === false);
  T('record tanpa source tidak melempar', m.opsiCekOf(null).walkin === false);

  /* Yang dijaga: satu record walk-in yang diterima layar juga diterima
     penggabung, dan sebaliknya. Dijalankan lewat jalur yang sama persis. */
  const wi = { id: 'w1', name: 'Walkin', date: HARI, time: '17:00', pax: 2,
               table: '14', status: 'Datang', sharing: false, source: 'Walk-in',
               checkinAt: new Date(2026, 8, 19, 17, 0).getTime() };
  const layar = m.conflictCheck(HARI, '14', '17:00', null, false, null, { walkin: true });
  const merge = m.conflictCheck(wi.date, wi.table, wi.time, wi.id, !!wi.sharing,
                                RES_BELUM, m.opsiCekOf(wi));
  T('layar menerima walk-in itu', layar === null);
  T('penggabung menerima walk-in yang SAMA', merge === null,
    merge ? 'ditolak oleh ' + merge.name : '');
}

console.log('\n[5] Reservasi berikutnya disebut, berikut jaraknya');
{
  const m = mesin('17:00')(RES_BELUM);
  const nx = m.bookingBerikut('14');
  T('booking berikutnya ketemu', !!nx && nx.res.id === 'r1');
  T('jaraknya dihitung (2 jam)', nx && nx.menit === 120, nx ? 'dapat ' + nx.menit : '');
  T('meja lain tidak ikut terbawa', m.bookingBerikut('15') === null);

  /* JAMNYA SUDAH LEWAT TAPI ORANGNYA BELUM MUNCUL — justru yang paling perlu
     disebut. Dibuang karena jamnya terlewat, kru mendudukkan tamu di meja
     yang tamu aslinya baru saja terlambat lima belas menit. */
  const m2 = mesin('19:15')(RES_BELUM);
  const nx2 = m2.bookingBerikut('14');
  T('booking yang jamnya SUDAH LEWAT tetap disebut', !!nx2 && nx2.res.id === 'r1');
  T('jaraknya negatif (sudah lewat)', nx2 && nx2.menit === -15, nx2 ? 'dapat ' + nx2.menit : '');

  /* Lewat jendela kunciannya sendiri → tidak disebut lagi, kalau tidak
     booking kemarin ikut terbawa selamanya. */
  const m3 = mesin('23:00')(RES_BELUM);
  T('booking yang jendelanya sudah habis tidak disebut lagi', m3.bookingBerikut('14') === null);

  /* Tamu yang sedang duduk bukan "booking berikutnya" — mejanya memang tidak
     pernah sampai ke jalur walk-in. */
  const m4 = mesin('18:30')(RES_DUDUK);
  T('tamu yang sedang duduk tidak disebut sebagai booking berikutnya',
    m4.bookingBerikut('14') === null);

  /* Meja gabungan ("14, 15") harus ikut terbaca. */
  const multi = [Object.assign({}, RES_BELUM[0], { table: '14, 15' })];
  const m5 = mesin('17:00')(multi);
  T('meja gabungan ikut terbaca', !!m5.bookingBerikut('15'));
}

console.log('\n[6] Denah & layar (asersi atas sumber)');
{
  /* harihOccupancy() menyentuh STATE, filter, dan denah — dijalankan utuh ia
     menyeret separuh modul. Yang menentukan di sana SATU baris, dan itu yang
     dikunci di sini. */
  const i = SRC.indexOf('function harihOccupancy()');
  const blok = SRC.slice(i, SRC.indexOf('\n}', i));
  T('harihOccupancy TIDAK lagi mengunci karena lockStart',
    blok.indexOf('lockStart(r) <= now') < 0,
    'masih ada: kuncian otomatis H-3 jam belum dicabut');
  T('yang mengunci tinggal isSeated & tanggal lain',
    /if\(isSeated\(r\) \|\| !isToday\) locked\.push\(r\);/.test(blok));
  /* !isToday TETAP mengunci, dan itu bukan kelalaian: denah tanggal lain
     dibuka untuk MELIHAT booking, bukan untuk walk-in. */
  T('denah tanggal lain tetap mengunci', blok.indexOf('!isToday') >= 0);

  T('meja yang dipesan nanti tetap memanggil seatEmptyClick',
    SRC.indexOf('class="seat avail booking-soon') >= 0
    && /booking-soon[\s\S]{0,200}?onclick="seatEmptyClick/.test(SRC));
  /* TANDA BERTINGKAT — satu tanda untuk "5 jam lagi" dan "10 menit lagi"
     membuat keduanya berhenti dibedakan, dan yang mepet itulah yang
     menentukan boleh-tidaknya tamu didudukkan. */
  T('ada tanda khusus untuk yang jamnya sudah dekat', SRC.indexOf('booking-mepet') >= 0);
  T('tanda mepet punya gayanya sendiri', /\.seat\.avail\.booking-mepet\{/.test(SRC));
  /* AMBANGNYA SATU TEMPAT. Ditulis dua kali, denah bisa menandai sebuah meja
     merah sementara form yang terbuka dari meja itu berkata "masih bisa" —
     dua kalimat yang bertentangan di satu layar.

     Dijaga lewat FUNGSINYA, bukan lewat pola angkanya: pola `m <= 60` cocok
     di KEDUA tempat, jadi mutasi yang cuma merusak salah satunya LOLOS.
     Memang begitu di putaran pertama. */
  T('ambang mepet 1 jam, ditulis SEKALI', /const MEPET_MIN = 60;/.test(SRC));
  T('penentunya satu fungsi', /function mepetKah\(menit\)\{ return menit <= MEPET_MIN; \}/.test(SRC));
  const nMepet = (SRC.match(/const mepet = mepetKah\(m\);/g) || []).length;
  T('denah & form sama-sama memakai penentu itu', nMepet === 2, 'dapat ' + nMepet);
  T('tidak ada lagi ambang yang ditulis tangan', SRC.indexOf('mepet = m <= ') < 0);

  T('form walk-in memasang pita kalau mejanya dipesan',
    /\$\{nx\?pitaMejaDipesan\(nx\):""\}/.test(SRC));
  T('pita menyebut nama, jam, dan sisa waktunya',
    /sudah dipesan<\/b> \$\{esc\(r\.name\)\} jam <b>\$\{esc\(jam\)\}<\/b> \(\$\{esc\(sisa\)\}/.test(SRC));
  /* Sesudah modal ditutup, pitanya tidak ada lagi di mana pun. Yang membuka
     baris ini besok pagi tidak punya cara tahu tamu itu didudukkan di meja
     yang sudah dipesan — kecuali catatannya menyebutkannya. */
  T('catatan walk-in menyebut reservasi yang menunggu',
    SRC.indexOf('notes:catatanWalkIn(tableId)') >= 0);
  T('catatan menyebut nama & jamnya',
    /Walk-in sementara — meja dipesan \$\{nx\.res\.name\} jam \$\{seatTimeLabel\(nx\.res\)\}/.test(SRC));
  T('walk-in di meja kosong tetap bercatatan "Walk-in" apa adanya',
    /if\(!nx\) return "Walk-in";/.test(SRC));

  /* KEDUA jalur walk-in memakai aturan longgar. Yang terlewat akan ditolak
     server walau layarnya sudah menerimanya. */
  /* Dihitung dari penandanya sendiri, bukan dari pola yang memuat argumen
     lain: `normTime(nowTime)` punya kurung tutup di dalamnya, jadi pola
     `\([^)]*\{walkin:true\}\)` berhenti sebelum sampai ke sana dan melewatkan
     satu dari dua jalurnya — merah untuk kode yang benar. */
  const nWalkin = (SRC.match(/\{walkin:true\}/g) || []).length;
  T('kedua jalur walk-in memakai mode walkin', nWalkin === 2, 'dapat ' + nWalkin);
  T('penandanya memang dioper ke mejaMasihKosong',
    (SRC.match(/mejaMasihKosong\(HARIH_DATE[\s\S]{0,80}?\{walkin:true\}\)/g) || []).length === 2);
  const nMerge = (SRC.match(/conflictCheck\([^;]*opsiCekOf\(L\)\)/g) || []).length;
  T('kedua jalur penggabung meneruskan aturannya', nMerge === 2, 'dapat ' + nMerge);
  T('mejaMasihKosong meneruskan opsinya ke conflictCheck',
    /const bentrok = conflictCheck\(date, table, time, exceptId, sharing, srv, opsi\);/.test(SRC));

  /* Jalur PENJUALAN tidak boleh longgar DENGAN SENDIRINYA. Sejak 20
     September 2026 ia bisa longgar, tapi hanya untuk meja yang kru-nya
     sudah ditanya dan menjawab ya — dan pertanyaan itu tidak pernah
     diajukan untuk kursi yang sedang diduduki orang.

     Yang dijaga: opsinya DIHITUNG dari izin yang ada, bukan dipatok
     {walkin:true}; dan tanpa izin ia tetap null, yaitu aturan ketat. */
  T('simpan reservasi dari form tidak memakai mode walkin yang dipatok',
    /mejaMasihKosong\(g\("date"\), g\("table"\), normTime\(g\("time"\)\), EDIT_ID, sharingNow,\s*\n?\s*adaIzinSeat \? \{izin:true\} : null\);/.test(SRC)
    && !/mejaMasihKosong\(g\("date"\), g\("table"\), normTime\(g\("time"\)\), EDIT_ID, sharingNow, \{walkin/.test(SRC));
  T('tanpa izin, jalur simpan form tetap KETAT',
    /adaIzinSeat \? \{izin:true\} : null/.test(SRC));
  /* Dihitung dari kotak yang BENAR-BENAR dikirim, bukan dari SEAT_SELS:
     kotak meja itu hidden, dan yang diubah dari devtools adalah kotaknya.
     Dari SEAT_SELS, izin untuk meja A ikut melonggarkan meja B yang tidak
     pernah disetujui siapa pun. */
  T('izinnya dihitung dari meja yang benar-benar DIKIRIM',
    /const adaIzinSeat = tablesOf\(\{table:g\("table"\)\}\)\.some\(t=>SEAT_IZIN\.has\(t\)\);/.test(SRC));
  /* Pindah meja TIDAK boleh longgar dengan sendirinya. Sejak 20 September
     2026 ia bisa longgar, TAPI hanya lewat izin yang seseorang berikan dan
     yang tercatat atas namanya — bukan karena modenya walk-in. Yang dijaga
     sekarang jalannya kelonggaran itu, bukan ketiadaannya:

       - opsi yang dioper opsiCekOf(), bukan {walkin:true} yang dipatok;
       - opsiCekOf longgar HANYA kalau izinnya masih berlaku;
       - izinnya terikat meja+tanggal+jam, jadi begitu salah satunya berubah
         pemeriksaan ketat berlaku lagi tanpa ada yang perlu mencabutnya;
       - dan tanyaTumpang() TIDAK PERNAH memulangkan true untuk tamu yang
         sedang duduk, jadi kursi yang sedang dipakai orang tidak punya
         satu pun jalan masuk ke sini. */
  T('pindah meja tidak memakai mode walkin yang dipatok',
    /mejaMasihKosong\(r\.date, tujuan, r\.time, r\.id, !!r\.sharing, opsiCekOf\(/.test(SRC)
    && !/mejaMasihKosong\(r\.date, tujuan, r\.time, r\.id, !!r\.sharing, \{walkin/.test(SRC));
  T('kelonggaran hanya lewat izin yang masih berlaku',
    /opsi && \(opsi\.walkin \|\| opsi\.izin\)/.test(SRC)
    && /izin: izinTumpangBerlaku\(r\)/.test(SRC));
  T('izin terikat meja+tanggal+jam, jadi kedaluwarsa sendiri',
    /z\.meja===String\(r\.table\|\|""\) && z\.date===String\(r\.date\|\|""\) && z\.time===String\(r\.time\|\|""\)/.test(SRC));
  T('tamu yang SEDANG DUDUK tidak pernah bisa ditimpa lewat izin',
    /function tanyaTumpang\([\s\S]{0,600}?if\(isSeated\(lawan\)\)\{[\s\S]{0,300}?return false;/.test(SRC));

  /* Pita & legenda tidak boleh lagi menjanjikan kuncian otomatis — janji yang
     tidak ditepati tiap kali dibaca. */
  T('pita denah tidak lagi menjanjikan kuncian otomatis',
    SRC.indexOf('meja terkunci <b>otomatis 3 jam sebelum jam booking</b>') < 0);
  T('pita denah mengatakan mejanya tetap bisa diklik',
    SRC.indexOf('TETAP boleh diklik') >= 0);
  /* Teksnya berubah 20 September 2026: mejanya tetap bisa diklik, tapi
     sekarang ditanya dulu — dan legenda yang menjanjikan klik tanpa
     pertanyaan adalah janji yang tidak ditepati tiap kali dipakai. */
  /* Teksnya berubah lagi 20 September 2026 (sore): yang bisa dipakai dan
     yang terkunci dibedakan lewat GEMBOK, bukan cuma warna garisnya —
     keduanya dulu sama-sama 🔒 dan sama-sama berlatar terang. */
  T('legenda menyebut dua tingkat tandanya',
    SRC.indexOf('🔓 Dipesan nanti') >= 0
    && SRC.indexOf('🔒 Dipesan <b>≤1 jam lagi</b>') >= 0);
  T('yang terkunci dikatakan tidak bisa ditekan',
    SRC.indexOf('tidak bisa ditekan') >= 0);
  T('klik meja yang sudah dipesan menanyakan konfirmasi dulu',
    /function seatEmptyClick\([\s\S]{0,400}?if\(!tanyaDudukSementara\(tableId\)\) return;/.test(SRC));
  T('meja yang memang bebas TIDAK ditanya apa-apa',
    /function tanyaDudukSementara\([\s\S]{0,300}?if\(!nx\) return true;/.test(SRC));
  T('legenda lama yang menyebut terkunci sudah dicabut',
    SRC.indexOf('terkunci H-2 jam') < 0);
}

console.log('\n[7] Modul Marketing SENGAJA tidak ikut berubah');
{
  /* deploy/marketing/ memakai denah yang sama untuk memilih meja Reservasi
     VIP & event — itu PENJUALAN, bukan mendudukkan tamu yang sudah berdiri
     di depan host. Kuncian H-3 jam di sana tetap berlaku, dan uji ini yang
     menahan orang berikutnya "menyeragamkannya". */
  const MKT = fs.readFileSync(path.join(AKAR, 'deploy/marketing/index.html'), 'utf8');
  T('vipLockStart masih ada di modul Marketing', MKT.indexOf('function vipLockStart') >= 0);
  T('Marketing tidak ikut memakai mode walkin', MKT.indexOf('walkin:true') < 0);
}

console.log('\n' + '='.repeat(56));
console.log('  OK: ' + ok + '   GAGAL: ' + gagal);
console.log('='.repeat(56));
if (gagal) process.exit(1);
