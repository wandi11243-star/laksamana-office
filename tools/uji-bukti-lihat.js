/* ============================================================
   UJI — PENAMPIL BUKTI & JAM TRANSFER DI HALAMAN DANA MASUK
   (21 September 2026)
   ------------------------------------------------------------
   node tools/uji-bukti-lihat.js

   Dua cacat yang dilaporkan user, dan keduanya tidak pernah punya satu
   asersi pun sebelum berkas ini:

     1. TOMBOL "LIHAT" TIDAK MEMUNCULKAN APA PUN. Bentuk lamanya
        withFile(...) -> await unduh -> window.open(""), dan izin pop-up
        Chrome (transient user activation) hanya bertahan sekitar lima detik
        sesudah klik. Foto bukti disimpan terpisah di server, jadi tiap
        "Lihat" menempuh satu getFile yang diserialkan apiQueue — lewat dari
        lima detik, window.open memulangkan null dan baris berikutnya
        melempar. Yang dijaga di sini: panelnya dibuka SEKETIKA (sebelum satu
        pun await), dan tidak ada window.open di jalur itu sama sekali.

     2. JAM BER-AM/PM TERSIMPAN SALAH DUA BELAS JAM. timeIn() tidak pernah
        melihat meridiemnya, jadi "1:50:02 PM" jadi "01:50:02". Yang sudah
        terlanjur tersimpan tidak bisa ditebak dari angkanya — tapi teks OCR
        aslinya MASIH tersimpan di p.tfOcrText, dan di sana meridiemnya utuh.

   FUNGSINYA DIPOTONG DARI SUMBER lalu dijalankan, bukan ditulis ulang di
   sini: uji yang memegang salinan aturannya sendiri tetap hijau kalau yang
   asli diubah. Modul Reservasi tidak bisa di-boot utuh di jsdom untuk ini —
   ia menuntut SESSION, venue-layouts, dan sederet pemuat — jadi yang
   dijalankan potongannya, dan yang tidak bisa dijalankan dijaga sebagai
   kontrak atas sumbernya.
   ============================================================ */
'use strict';
const fs = require('fs');
const path = require('path');

const AKAR = path.resolve(__dirname, '..');
const SRC = fs.readFileSync(path.join(AKAR, 'deploy/reservasi/index.html'), 'utf8');
let ok = 0, gagal = 0, lewat = 0;
function T(nama, syarat, ket) {
  if (syarat) { ok++; return; }
  gagal++; console.log('  GAGAL  ' + nama + (ket ? '  (' + ket + ')' : ''));
}
function L(nama, sebab) { lewat++; console.log('  LEWAT  ' + nama + '  (' + sebab + ')'); }
function aman(nama, fn) {
  try { return fn(); } catch (e) { gagal++; console.log('  GAGAL  ' + nama + '  (melempar: ' + e.message + ')'); }
}

/* KATA `async` IKUT DIPOTONG. Tanpa itu badan fungsinya terpotong mulai dari
   `function`, dan `await` di dalamnya jadi SyntaxError — potongannya tidak
   bisa dijalankan sama sekali, dan asersinya terbaca sebagai bug produk. */
const potong = n => {
  let i = SRC.indexOf('async function ' + n + '(');
  if (i < 0) i = SRC.indexOf('function ' + n + '(');
  if (i < 0) return '';
  const akhir = ['\nfunction ', '\nasync function ', '\nconst ', '\nlet ']
    .map(k => SRC.indexOf(k, i + 1)).filter(x => x > 0);
  const j = akhir.length ? Math.min(...akhir) : -1;
  return SRC.slice(i, j < 0 ? SRC.length : j);
};
const barisKonst = a => { const i = SRC.indexOf(a); return i < 0 ? '' : SRC.slice(i, SRC.indexOf('\n', i)); };

/* ============ 1. JAM DIBACA DARI STRUK ============ */
console.log('\n[1] OCR jam: meridiem tidak boleh dibuang');
const INTI = [barisKonst('const OCR_MONTHS ='), barisKonst('const RE_MERIDIEM='),
  barisKonst('const RE_ZONA='), potong('pad2'), potong('isoDate'), potong('dateIn'),
  potong('timeIn'), potong('ocrTimeMentah'), potong('jamPasti'), potong('ocrTime')].join('\n');
const F = aman('potongan OCR dijalankan', () => new Function(
  INTI + '\n' + potong('jam24')
  + '\nreturn {dateIn, timeIn, ocrTime, ocrTimeMentah, jamPasti, jam24};')());

if (!F) { console.log('  potongan tidak bisa dijalankan — sisanya dilewati'); }
else {
  const ti = (a, b) => T('timeIn ' + JSON.stringify(a) + ' -> ' + JSON.stringify(b),
    F.timeIn(a) === b, JSON.stringify(F.timeIn(a)));
  /* BARIS INI PERSIS YANG TERCETAK DI STRUK YANG DILAPORKAN USER
     (BCA, Pembayaran QRIS Berhasil, 03 Sep 2026 1:50:02 PM). Sebelum
     21 September 2026 ia tersimpan "01:50:02" — setengah delapan MALAM
     tercatat setengah delapan PAGI. */
  ti('03 Sep 2026 1:50:02 PM', '13:50:02');
  ti('1:50:02 PM', '13:50:02');
  ti('1.50.02 PM', '13:50:02');
  ti('1:50:02pm', '13:50:02');
  ti('03 Sep 2026 1:50 PM', '13:50');
  /* Tengah malam & tengah hari: 12 AM = 00, 12 PM = 12. */
  ti('12:00:00 AM', '00:00:00');
  ti('12:30 PM', '12:30');
  /* Yang SUDAH 24 jam tidak boleh ikut bergeser. */
  ti('16:55:03 WIB', '16:55:03');
  ti('15:21 WIB', '15:21');
  ti('10:31', '10:31');
  /* Kata berawalan P/A sesudah jam BUKAN meridiem. */
  ti('10:31 Pembayaran', '10:31');
  /* Jam dijepit 1..12 — tanpa jepitan "15:00 AM" jadi 03:00, jam yang tidak
     pernah tertulis di struk mana pun. Ini satu-satunya bentuk yang
     membedakan jepitan dari %12 telanjang. */
  ti('15:00 AM', '15:00');

  /* ocrTime memilih jam pada baris yang MEMUAT TANGGAL — bukti sering
     difoto dari layar HP, dan jam di status bar ikut terbaca di baris
     paling atas. */
  const struk = ['9:41', 'BCA', 'Pembayaran QRIS Berhasil', '03 Sep 2026 1:50:02 PM',
                 'IDR 1,000,000.00', 'Pengakuisisi BRI'].join('\n');
  T('ocrTime memilih jam di baris bertanggal, bukan jam status bar HP',
    F.ocrTime(struk) === '13:50:02', JSON.stringify(F.ocrTime(struk)));

  /* ===== KALAU RAGU, JAMNYA TIDAK DIISI (permintaan user 21 Sep 2026) =====
     Jam 12 jam SELALU menulis AM/PM — tidak ada jam dinding 12 jam tanpa
     meridiem. Jadi jam 1..12 yang buktinya tidak menyebut AM/PM sebenarnya
     24 jam, KECUALI kalau OCR-nya yang gagal membaca meridiemnya; di situ
     selisihnya dua belas jam dan tidak ada cara membedakannya dari angkanya
     sendiri. */
  const pasti = (teks, hasil, ket) => T('ocrTime ' + ket, F.ocrTime(teks) === hasil,
    JSON.stringify(F.ocrTime(teks)));
  pasti('21 Jul 2026 - 10:25:48', '', 'jam 1..12 tanpa AM/PM & tanpa WIB -> KOSONG');
  pasti('25 Jul 2026 - 09:08', '', 'jam pagi tanpa penanda apa pun -> KOSONG');
  /* Yang PASTI tetap diisi — aturan ini tidak boleh membuang jam yang tidak
     mungkin salah. */
  pasti('31 Jul 2026 - 16:55:03', '16:55:03', 'jam >= 13 tetap diisi');
  pasti('31 Jul 2026 - 00:12', '00:12', 'jam 00 tetap diisi');
  pasti('25 Jul 2026 - 09:08 WIB', '09:08', 'ada WIB -> konvensi 24 jam, tetap diisi');
  pasti('03 Sep 2026 1:50:02 PM', '13:50:02', 'ada meridiem -> tetap diisi');
  pasti('03 Sep 2026 9:08 AM', '09:08', 'meridiem AM -> tetap diisi');
  /* ANGKANYA TETAP TERBACA walau tidak dipakai — itu yang dipajang
     jamRagu() supaya kolom kosongnya bisa dijelaskan. */
  T('angka yang ditahan tetap terbaca ocrTimeMentah',
    F.ocrTimeMentah('21 Jul 2026 - 10:25:48') === '10:25:48',
    JSON.stringify(F.ocrTimeMentah('21 Jul 2026 - 10:25:48')));

  console.log('\n[2] Jam dibakukan lagi saat digambar');
  const j2 = (a, b) => T('jam24 ' + JSON.stringify(a) + ' -> ' + JSON.stringify(b),
    F.jam24(a) === b, JSON.stringify(F.jam24(a)));
  j2('1:50:02 PM', '13:50:02');
  j2('01:50:02', '01:50:02');
  j2('12:00 AM', '00:00');
  j2('15:00 AM', '15:00');
  j2('', '');
  /* Yang tidak terbaca dipulangkan APA ADANYA: bentuk yang belum pernah kita
     lihat lebih baik tampil aneh daripada lenyap dari layar tanpa tanda. */
  j2('7:5 PM', '7:5 PM');
}

/* ============ 3. JAM LAMA DIPULIHKAN DARI TEKS SCAN TERSIMPAN ============ */
console.log('\n[3] Jam yang terlanjur salah dipulihkan dari teks bukti');
const G = aman('potongan jamSeharusnya dijalankan', () => new Function(
  INTI + '\n' + potong('jamSeharusnya') + '\nreturn jamSeharusnya;')());
const RAGU = aman('potongan jamRagu dijalankan', () => new Function(
  INTI + '\n' + potong('jamRagu') + '\nreturn jamRagu;')());

if (G) {
  const teksPM = '03 Sep 2026 1:50:02 PM\nIDR 1,000,000.00';
  T('jam yang meleset dilaporkan berikut angka yang benar',
    G({ tfTime: '01:50:02', tfOcrText: teksPM }) === '13:50:02',
    JSON.stringify(G({ tfTime: '01:50:02', tfOcrText: teksPM })));
  /* Yang SUDAH benar tidak boleh ditandai — peringatan yang muncul untuk
     baris yang tidak salah apa-apa persis yang membuat peringatan berikutnya
     berhenti dibaca. */
  T('jam yang sudah benar TIDAK ditandai',
    G({ tfTime: '13:50:02', tfOcrText: teksPM }) === '');
  /* TANPA MERIDIEM DI TEKSNYA, JANGAN SENTUH. ocrTime bisa memulangkan jam
     lain yang kebetulan ada di struk (jam status bar, jam cetak), dan
     "perbaikan" seperti itu justru merusak jam yang benar. */
  T('teks tanpa AM/PM tidak pernah ditandai',
    G({ tfTime: '01:50:02', tfOcrText: '03 Sep 2026 16:55:03 WIB' }) === '');
  T('tanpa teks OCR tersimpan tidak pernah ditandai',
    G({ tfTime: '01:50:02', tfOcrText: '' }) === '');
  T('tanpa jam tersimpan tidak pernah ditandai',
    G({ tfTime: '', tfOcrText: teksPM }) === '');
}

/* ---- jam yang sengaja dikosongkan DIKATAKAN di barisnya ---- */
if (RAGU) {
  console.log('\n[3b] Kolom jam yang kosong menyebut sebabnya');
  T('jam yang ditahan disebut angkanya',
    RAGU({ tfTime: '', tfOcrText: '21 Jul 2026 - 10:25:48' }) === '10:25:48',
    JSON.stringify(RAGU({ tfTime: '', tfOcrText: '21 Jul 2026 - 10:25:48' })));
  /* Yang jamnya SUDAH terisi tidak perlu dijelaskan apa-apa. */
  T('baris yang jamnya terisi tidak diberi keterangan',
    RAGU({ tfTime: '16:55:03', tfOcrText: '21 Jul 2026 - 10:25:48' }) === '');
  /* Yang buktinya memang tidak punya jam sama sekali BUKAN "ragu" — ia
     memang tidak ada, dan menyebutnya ragu menyuruh orang mencari angka
     yang tidak pernah tertulis. */
  T('bukti tanpa jam sama sekali tidak disebut ragu',
    RAGU({ tfTime: '', tfOcrText: 'Transaksi Berhasil Rp200.000' }) === '');
  T('tanpa teks OCR tersimpan tidak disebut ragu',
    RAGU({ tfTime: '', tfOcrText: '' }) === '');
  /* Jam yang PASTI tapi kosong tfTime-nya (mis. dihapus kru) juga bukan
     ragu — kalau disebut, kru diberi angka yang sebenarnya sudah ia buang. */
  T('jam yang pasti tidak disebut ragu',
    RAGU({ tfTime: '', tfOcrText: '21 Jul 2026 - 16:55:03' }) === '');
}

/* ============ 4. KONTRAK ATAS SUMBERNYA ============ */
console.log('\n[4] Kontrak atas sumber modul Reservasi');

/* ---- (1) tombol Lihat ---- */
const bViewProof = potong('viewProof');
T('viewProof lewat penampil di halaman ini', /tampilkanBukti\(/.test(bViewProof), bViewProof.trim().slice(0, 120));
/* INI INTI PERBAIKANNYA. window.open di jalur ini dipanggil SESUDAH await,
   dan izin pop-up Chrome sudah kedaluwarsa waktu berkasnya mendarat —
   hasilnya null, lalu TypeError, lalu tidak ada apa-apa di layar. */
T('tidak ada lagi window.open di jalur "Lihat"',
  !/window\.open/.test(bViewProof) && !/window\.open/.test(potong('tampilkanBukti')),
  'masih memanggil window.open');
T('showFileData yang memakai pop-up sudah dicabut', SRC.indexOf('function showFileData') < 0);
/* PANELNYA DIBUKA SEBELUM SATU PUN AWAIT. Dibuka sesudah, tombolnya diam
   beberapa detik dan ditekan berkali-kali orang — dan kalau unduhannya
   gagal, tidak ada apa pun yang pernah muncul. */
const bTampil = potong('tampilkanBukti');
T('penampilnya dibuka SEBELUM berkasnya diunduh',
  bTampil.indexOf('bukaPenampilBukti(') >= 0
  && bTampil.indexOf('bukaPenampilBukti(') < bTampil.indexOf('loadFile('),
  bTampil.trim().slice(0, 160));
T('kegagalan unduhnya dikatakan di panelnya, bukan didiamkan',
  /\.catch\(/.test(bTampil) && /Gagal memuat bukti/.test(bTampil));
/* WADAH SENDIRI, bukan modalRoot: "Buka PDF" dipanggil dari DALAM modal
   Cek/Edit, dan openModal() mengganti seluruh isi modalRoot. */
T('penampilnya punya wadah sendiri (buktiRoot)', SRC.indexOf('<div id="buktiRoot"></div>') >= 0);
T('penampilnya TIDAK memakai modalRoot',
  potong('bukaPenampilBukti').indexOf('modalRoot') < 0);
T('z-index penampilnya di atas .modal-back',
  /\.bukti-back\{[^}]*z-index:200/.test(SRC) && /\.modal-back\{[^}]*z-index:100/.test(SRC));

/* ---- "buka di tab baru" lewat blob: ---- */
const bTab = potong('buktiTabBaru');
T('tab baru dibuka lewat blob:, bukan data:', bTab.indexOf('blobDariData(') >= 0);
/* URL-nya TIDAK segera di-revoke: tab yang baru terbuka masih memuatnya, dan
   mencabutnya seketika membuat tab itu blank. */
T('blob URL tidak segera dicabut', /setTimeout\([\s\S]*?revokeObjectURL/.test(bTab));
T('pop-up yang ditahan peramban DIKATAKAN', /Peramban menahan tab barunya/.test(bTab));
/* PDF juga lewat blob: — Chrome memblokir data: di frame tingkat atas, dan
   PDF viewer-nya kerap menolak data: URI yang panjang. */
T('PDF dipasang lewat blob:, bukan data:',
  /startsWith\("data:application\/pdf"\)[\s\S]{0,200}blobDariData\(/.test(potong('isiPenampilBukti')));

/* ---- (2) jam ---- */
T('fmtJamTf membakukan dulu ke 24 jam', /function fmtJamTf\(v\)\{ return v \? esc\(jam24\(v\)\)/.test(SRC));
/* Pola meridiem WAJIB paling depan di timeIn(): ditaruh di belakang, pola
   "jam tanpa meridiem" sudah mencocokkan "01:50" lebih dulu. */
const bTimeIn = potong('timeIn');
T('pola meridiem berdiri PALING DEPAN di timeIn',
  bTimeIn.indexOf('[AaPp]') > 0 && bTimeIn.indexOf('[AaPp]') < bTimeIn.indexOf('16:55:03'),
  'urutan polanya terbalik');
/* YANG MEMULIHKAN TETAP ORANG, satu baris satu tombol. Disapu sendiri waktu
   halamannya dibuka, ia menulis ulang jam transaksi atas nama orang yang
   belum melihatnya. */
const bBetul = potong('betulkanJam');
T('pemulihan jam menyebut angka lama DAN angka barunya',
  /\+p\.tfTime\+/.test(bBetul) && /\+benar\+/.test(bBetul));
/* updatedAt WAJIB naik: penjaga UPSERT di server membuang perubahan yang
   capnya tidak lebih baru, tanpa satu pun galat. */
T('updatedAt reservasinya dinaikkan', /r\.updatedAt=Date\.now\(\)/.test(bBetul));
/* TIDAK ADA YANG MENYAPUNYA SENDIRI. renderFinance() memanggil
   autoScanFinance() saat halaman dibuka — kalau betulkanJam ikut dipanggil
   dari sana, jam transaksi berubah tanpa ada yang menekan apa pun. */
/* ===== betulkanJam() BENAR-BENAR DIJALANKAN =====
   Asersi yang cuma mencari kata "confirm(" atau "logAudit(" di sumbernya
   tetap hijau untuk `if(false && confirm(…))` dan `if(false) logAudit(…)`:
   teksnya masih di sana, cabangnya yang mati. Dua mutasi persis begitu LOLOS
   sebelum blok ini ada.

   Fungsinya DIPOTONG dari sumber lalu dijalankan dengan tetangganya dioper
   sebagai parameter — di dalam new Function, nama bebas seperti findDp dan
   commit mengikat ke parameter itu. */
async function ujiBetulkanJam() {
  console.log('\n[5] betulkanJam() dijalankan');
  const buat = () => {
    const jejak = { audit: [], commit: 0, toast: [], nav: 0 };
    const r = { id: 'r1', name: 'PT.ibra harisindo', updatedAt: 1000 };
    const p = { id: 'p1', tfTime: '01:50:02', tfOcrText: '03 Sep 2026 1:50:02 PM\nIDR 1.000.000' };
    let jawab = true;
    const fn = new Function('findDp', 'jamSeharusnya', 'toast', 'confirm', 'logAudit',
      'commit', 'CURRENT_PAGE', 'navigate',
      potong('betulkanJam') + '\nreturn betulkanJam;')(
      () => ({ r, p }),
      G,
      (m, k) => jejak.toast.push(String(m) + '|' + (k || '')),
      () => jawab,
      (a, d) => jejak.audit.push(a + '|' + d),
      async () => { jejak.commit++; return true; },
      'finance',
      () => { jejak.nav++; });
    return { fn, r, p, jejak, setJawab: v => { jawab = v; } };
  };

  /* KONFIRMASI MENAHAN, bukan sekadar memberitahu. Yang diukur ADA-TIDAKNYA
     PERUBAHAN & KIRIMAN — dari layar, "ditahan" dan "diperingatkan lalu tetap
     ditulis" terlihat sama persis. */
  {
    const u = buat();
    u.setJawab(false);
    await u.fn('r1', 'p1');
    T('konfirmasi ditolak: jamnya TIDAK diubah', u.p.tfTime === '01:50:02', u.p.tfTime);
    T('konfirmasi ditolak: tidak ada yang dikirim ke server', u.jejak.commit === 0);
    T('konfirmasi ditolak: tidak ada jejak yang ditulis', u.jejak.audit.length === 0);
    T('konfirmasi ditolak: updatedAt tidak ikut naik', u.r.updatedAt === 1000);
  }
  /* Disetujui: jamnya dibetulkan, dicap, dijejaki, dan dikirim. */
  {
    const u = buat();
    await u.fn('r1', 'p1');
    T('disetujui: jamnya jadi 13:50:02', u.p.tfTime === '13:50:02', u.p.tfTime);
    T('disetujui: updatedAt dinaikkan', u.r.updatedAt > 1000, String(u.r.updatedAt));
    T('disetujui: dikirim ke server sekali', u.jejak.commit === 1, String(u.jejak.commit));
    T('disetujui: jejaknya menyebut angka lama DAN barunya',
      u.jejak.audit.length === 1 && /01:50:02/.test(u.jejak.audit[0]) && /13:50:02/.test(u.jejak.audit[0]),
      JSON.stringify(u.jejak.audit));
    T('disetujui: jejaknya menyebut dari mana angkanya',
      /teks bukti tersimpan/.test(u.jejak.audit[0] || ''), JSON.stringify(u.jejak.audit));
  }
  /* Baris yang jamnya SUDAH benar tidak boleh menulis apa pun — tombolnya
     memang tidak digambar untuknya, tapi ia bisa dipanggil dari console. */
  {
    const u = buat();
    u.p.tfTime = '13:50:02';
    await u.fn('r1', 'p1');
    T('baris yang sudah benar tidak menulis apa pun',
      u.jejak.commit === 0 && u.jejak.audit.length === 0 && u.r.updatedAt === 1000);
    T('dan sebabnya dikatakan', /sudah sesuai/.test((u.jejak.toast[0] || '')), JSON.stringify(u.jejak.toast));
  }
}

const nPanggil = (SRC.match(/betulkanJam\(/g) || []).length;
T('tidak dipanggil otomatis dari mana pun', nPanggil === 2,
  'dipanggil ' + nPanggil + ' kali (harusnya 2: definisi + tombolnya)');
T('kolom jam yang kosong menyebut angka yang terbaca',
  /jamRagu\(p\)\?/.test(SRC) && /bukti menulis \$\{esc\(jamRagu\(p\)\)\}/.test(SRC));
T('baris yang jamnya meleset ditandai di tabelnya',
  /jamSeharusnya\(p\)\?/.test(SRC) && /seharusnya \$\{esc\(jamSeharusnya\(p\)\)\}/.test(SRC));

(async () => {
  if (G) await ujiBetulkanJam();
  else L('betulkanJam() dijalankan', 'potongan jamSeharusnya tidak bisa dijalankan');
  console.log('\n' + '='.repeat(52));
  console.log('  OK: ' + ok + '   GAGAL: ' + gagal + '   LEWAT: ' + lewat);
  console.log('='.repeat(52));
  if (gagal) process.exit(1);
})();
