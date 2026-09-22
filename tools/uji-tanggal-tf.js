/* ============================================================
   UJI — TANGGAL TRANSFER DI BUKTI TF  (22 September 2026)
   ------------------------------------------------------------
   node tools/uji-tanggal-tf.js

   Dilaporkan user: bukti bertanggal 11 September tercatat 1 September.
   Teks OCR yang TERSIMPAN membuktikan sebabnya, jadi tidak ada yang perlu
   ditebak:

       1/09/2026 - 20:44:23 WIB          <- Tesseract menjatuhkan satu "1"
       Ref 950312026091120442141 7...
              ^^^^^^^^ ^^^^
              20260911  2044             <- tanggal & jam YANG BENAR

   Pengurainya membaca "1/09/2026" dengan benar. Yang salah pembacaan
   gambarnya — jadi MEN-SCAN ULANG DENGAN MESIN YANG SAMA memberi hasil yang
   sama persis, dan itulah kenapa jalan keluarnya bukan scan ulang melainkan
   stempel waktu yang sudah ikut tercetak di nomor Ref.

   Ditemukan sekalian saat menelusurinya, dan ini cacat KEDUA yang berdiri
   sendiri: dateIn() menuntut SPASI antara tanggal dan nama bulan, jadi struk
   BRImo yang menulis "01Agu 2026" tidak pernah punya tanggal sama sekali.
   Di sana OCR-nya benar; polanya yang tidak mengenalnya.

   Diukur atas 494 baris DP produksi: 411 punya teks OCR tersimpan, 61 bisa
   diperiksa silang lewat stempel Ref, 58 cocok, 3 berbeda — dan ketiganya
   memang salah bacanya. Nol positif palsu.

   FUNGSINYA DIPOTONG DARI SUMBER lalu dijalankan, bukan ditulis ulang di
   sini: uji yang memegang salinan aturannya sendiri tetap hijau kalau yang
   asli diubah. Yang tidak bisa dijalankan dijaga sebagai kontrak atas
   sumbernya.
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

/* KATA `async` IKUT DIPOTONG — tanpa itu badannya terpotong mulai dari
   `function` dan `await` di dalamnya jadi SyntaxError, sehingga potongannya
   tidak bisa dijalankan sama sekali dan asersinya terbaca seperti bug produk. */
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

/* ---------- STRUK TIRUAN ----------
   Nomor kartu & merchant SENGAJA dikarang; yang dipertahankan apa adanya
   BENTUK nomor Ref-nya, karena itulah yang diuji. */
const STRUK_ARI = [
  'Pembayaran QRIS Berhasil',
  'Rp200.000,00',
  '1/09/2026 - 20:44:23 WIB',              // <- OCR menjatuhkan satu angka
  'Pembayaran ke LAKSAMANA MUDA COFFEE',
  'Pengakuisisi BRI',
  'Merchant PAN 9360000111111111111',
  'Customer PAN 9360000222222222222',
  'RRN 330322999',
  'Ref 950312026091120442141 7AB'
].join('\n');

const STRUK_BRIMO = [
  'Pembayaran QRIS berhasil',
  'Rp100.000',
  '01Agu 2026 + 10:41:26 WIB +',           // <- TANPA spasi sesudah tanggal
  'Ref ID: 20260801104113000998',
  'Nama acquirer BRI'
].join('\n');

const STRUK_HANCUR = [
  'Of 126 - 18:02 24 Wik',                 // <- barisan tanggalnya memang tidak terbaca
  'Pembayaran QRIS Berhasil',
  'Rp200.000,00',
  '0503120260816180224461AD5F3'
].join('\n');

(async () => {
  /* ================= [1] dateIn(): pembacaan barisan tanggal ================= */
  console.log('\n[1] dateIn() — barisan tanggal yang dibaca orang');
  const kodeUrai = [
    barisKonst('const OCR_MONTHS ='),
    potong('pad2'), potong('isoDate'), potong('dateIn'),
    barisKonst('const STEMPEL_TAHUN_MIN'),
    potong('tglStempel'), potong('ocrDate'), potong('tglSeharusnya'),
    'return { dateIn, isoDate, tglStempel, ocrDate, tglSeharusnya };'
  ].join('\n');
  let U = null;
  try { U = new Function(kodeUrai)(); }
  catch (e) { gagal++; console.log('  GAGAL  potongan pengurai tidak bisa dijalankan  (' + e.message + ')'); }

  if (U) {
    // yang sudah jalan sebelum hari ini WAJIB tidak berubah
    T('ISO 2026-07-14 tetap terbaca', U.dateIn('Tanggal 2026-07-14') === '2026-07-14', U.dateIn('Tanggal 2026-07-14'));
    T('"09 Jul 2026" tetap terbaca', U.dateIn('09 Jul 2026') === '2026-07-09', U.dateIn('09 Jul 2026'));
    T('"14 Agustus 2026" tetap terbaca', U.dateIn('14 Agustus 2026') === '2026-08-14', U.dateIn('14 Agustus 2026'));
    T('"11/09/2026" tetap terbaca', U.dateIn('11/09/2026 - 20:44 WIB') === '2026-09-11', U.dateIn('11/09/2026 - 20:44 WIB'));

    /* YANG BARU: nama bulan MENEMPEL di tanggalnya (BRImo). Sebelum 22 Sep
       2026 struk ini tidak punya tanggal sama sekali. */
    T('"01Agu 2026" (tanpa spasi) terbaca', U.dateIn(STRUK_BRIMO) === '2026-08-01', U.dateIn(STRUK_BRIMO));
    T('"7Sep 2026" (tanpa spasi, satu digit) terbaca', U.dateIn('7Sep 2026') === '2026-09-07', U.dateIn('7Sep 2026'));

    /* Kata yang BUKAN nama bulan tidak boleh lolos jadi tanggal — itu satu-
       satunya yang menahan pola tanpa-spasi menelan teks sembarangan. */
    T('kata yang bukan bulan TIDAK jadi tanggal', U.dateIn('Detail 12 Nomor 2026') === '', U.dateIn('Detail 12 Nomor 2026'));

    /* Disapu SELURUH kemunculan: yang pertama bukan bulan, yang kedua iya.
       Dengan `match` tanpa /g, yang kedua tidak pernah sempat diperiksa. */
    T('kemunculan KEDUA tetap diperiksa',
      U.dateIn('Detail 12 Nomor 2026\nTanggal 05 Sep 2026') === '2026-09-05',
      U.dateIn('Detail 12 Nomor 2026\nTanggal 05 Sep 2026'));
  } else L('dateIn()', 'potongan tidak bisa dijalankan');

  /* ================= [2] tglStempel(): stempel di nomor Ref ================= */
  console.log('\n[2] tglStempel() — stempel waktu di dalam nomor Ref');
  if (U) {
    T('struk Ari: stempel memulangkan 11 September',
      U.tglStempel(STRUK_ARI, '20:44:23') === '2026-09-11', U.tglStempel(STRUK_ARI, '20:44:23'));
    T('struk BRImo: stempel memulangkan 1 Agustus',
      U.tglStempel(STRUK_BRIMO, '10:41:26') === '2026-08-01', U.tglStempel(STRUK_BRIMO, '10:41:26'));
    T('struk hancur: stempel tetap memulangkan 16 Agustus',
      U.tglStempel(STRUK_HANCUR, '18:02') === '2026-08-16', U.tglStempel(STRUK_HANCUR, '18:02'));

    /* JANGKARNYA JAM. Tanpa jam yang cocok, deretan angka panjang mana pun
       bisa kebetulan memuat tanggal yang sah — dan menebak tanggal uang
       masuk dari nomor kartu lebih buruk daripada kolom yang belum terisi. */
    T('jam TIDAK cocok -> tidak memulangkan apa pun',
      U.tglStempel(STRUK_ARI, '21:00:00') === '', U.tglStempel(STRUK_ARI, '21:00:00'));
    T('jam KOSONG -> tidak memulangkan apa pun', U.tglStempel(STRUK_ARI, '') === '');
    T('jam cuma dua angka -> tidak memulangkan apa pun', U.tglStempel(STRUK_ARI, '20') === '');

    /* Dua stempel berbeda pada jam yang sama = tidak ada yang bisa
       dipastikan. Menebak salah satunya persis yang sedang dihindari. */
    T('dua stempel berbeda -> tidak memulangkan apa pun',
      U.tglStempel('Ref A 950312026091120442141\nRef B 950312026091220442141', '20:44') === '',
      U.tglStempel('Ref A 950312026091120442141\nRef B 950312026091220442141', '20:44'));

    /* Tanggal yang tidak ada di kalender ditolak — isoDate() sendiri
       meloloskan 31 Februari. */
    T('31 Februari di stempel ditolak',
      U.tglStempel('Ref 20260231204400000000', '20:44') === '', U.tglStempel('Ref 20260231204400000000', '20:44'));
    T('tahun di luar 2024-2035 ditolak',
      U.tglStempel('Ref 19990911204400000000', '20:44') === '', U.tglStempel('Ref 19990911204400000000', '20:44'));

    /* Deretan 12 angka sudah cukup jadi stempel (yyyymmdd + hhmm); yang lebih
       pendek dari itu tidak punya jamnya, jadi jangkarnya tidak ada. */
    T('deretan 12 angka diterima sebagai stempel',
      U.tglStempel('Kode 202609112044', '20:44') === '2026-09-11', U.tglStempel('Kode 202609112044', '20:44'));
    T('deretan 11 angka TIDAK diterima',
      U.tglStempel('Kode 20260911204', '20:44') === '', U.tglStempel('Kode 20260911204', '20:44'));
  } else L('tglStempel()', 'potongan tidak bisa dijalankan');

  /* ================= [3] ocrDate(): stempel menang atas bacaan ================= */
  console.log('\n[3] ocrDate() — penyilangannya');
  if (U) {
    T('tanggal yang salah terbaca DIBETULKAN stempel',
      U.ocrDate(STRUK_ARI, '20:44:23') === '2026-09-11', U.ocrDate(STRUK_ARI, '20:44:23'));
    T('tanpa jam, hasilnya tetap bacaan barisan tanggalnya',
      U.ocrDate(STRUK_ARI) === '2026-09-01', U.ocrDate(STRUK_ARI));
    T('barisan tanggal hancur pun dapat tanggal dari stempel',
      U.ocrDate(STRUK_HANCUR, '18:02') === '2026-08-16', U.ocrDate(STRUK_HANCUR, '18:02'));
    T('struk tanpa stempel tetap memakai bacaan biasa',
      U.ocrDate('Transfer berhasil 11/09/2026 20:44 WIB', '20:44') === '2026-09-11',
      U.ocrDate('Transfer berhasil 11/09/2026 20:44 WIB', '20:44'));
  } else L('ocrDate()', 'potongan tidak bisa dijalankan');

  /* ================= [4] tglSeharusnya(): penanda baris lama ================= */
  console.log('\n[4] tglSeharusnya() — penanda untuk baris yang SUDAH tersimpan');
  if (U) {
    T('tanggal meleset -> disebut tanggal yang benar',
      U.tglSeharusnya({ tfDate: '2026-09-01', tfTime: '20:44:23', tfOcrText: STRUK_ARI }) === '2026-09-11');
    T('tanggal KOSONG -> ikut ditawari isinya',
      U.tglSeharusnya({ tfDate: '', tfTime: '18:02', tfOcrText: STRUK_HANCUR }) === '2026-08-16');
    T('tanggal sudah benar -> tidak menandai apa pun',
      U.tglSeharusnya({ tfDate: '2026-09-11', tfTime: '20:44:23', tfOcrText: STRUK_ARI }) === '');
    T('tanpa jam -> tidak menandai apa pun',
      U.tglSeharusnya({ tfDate: '2026-09-01', tfTime: '', tfOcrText: STRUK_ARI }) === '');
    T('tanpa teks OCR -> tidak menandai apa pun',
      U.tglSeharusnya({ tfDate: '2026-09-01', tfTime: '20:44:23', tfOcrText: '' }) === '');
    T('baris kosong -> tidak melempar', U.tglSeharusnya(null) === '');
  } else L('tglSeharusnya()', 'potongan tidak bisa dijalankan');

  /* ================= [5] betulkanTanggal() DIJALANKAN ================= */
  console.log('\n[5] betulkanTanggal() dijalankan');
  if (U) {
    const buat = (tfDate) => {
      const jejak = { audit: [], commit: 0, toast: [], nav: 0 };
      const r = { id: 'r1', name: 'Ari', updatedAt: 1000 };
      const p = { id: 'p1', tfDate, tfTime: '20:44:23', tfOcrText: STRUK_ARI };
      let jawab = true;
      const fn = new Function('findDp', 'tglSeharusnya', 'toast', 'confirm', 'logAudit',
        'commit', 'CURRENT_PAGE', 'navigate', 'fmtDateShort', 'fmtJamTf',
        potong('betulkanTanggal') + '\nreturn betulkanTanggal;')(
        () => ({ r, p }),
        U.tglSeharusnya,
        (m, k) => jejak.toast.push(String(m) + '|' + (k || '')),
        () => jawab,
        (a, d) => jejak.audit.push(a + '|' + d),
        async () => { jejak.commit++; return true; },
        'finance',
        () => { jejak.nav++; },
        v => String(v),
        v => String(v));
      return { fn, r, p, jejak, setJawab: v => { jawab = v; } };
    };

    /* KONFIRMASI MENAHAN, bukan sekadar memberitahu. Yang diukur ADA-TIDAKNYA
       PERUBAHAN & KIRIMAN — dari layar, "ditahan" dan "diperingatkan lalu
       tetap ditulis" terlihat sama persis. */
    {
      const u = buat('2026-09-01');
      u.setJawab(false);
      await u.fn('r1', 'p1');
      T('ditolak: tanggalnya TIDAK diubah', u.p.tfDate === '2026-09-01', u.p.tfDate);
      T('ditolak: tidak ada yang dikirim ke server', u.jejak.commit === 0);
      T('ditolak: tidak ada jejak yang ditulis', u.jejak.audit.length === 0);
      T('ditolak: updatedAt tidak ikut naik', u.r.updatedAt === 1000);
    }
    {
      const u = buat('2026-09-01');
      await u.fn('r1', 'p1');
      T('disetujui: tanggalnya jadi 2026-09-11', u.p.tfDate === '2026-09-11', u.p.tfDate);
      T('disetujui: updatedAt dinaikkan', u.r.updatedAt > 1000, String(u.r.updatedAt));
      T('disetujui: dikirim ke server sekali', u.jejak.commit === 1, String(u.jejak.commit));
      T('disetujui: jejaknya menyebut tanggal lama DAN barunya',
        u.jejak.audit.length === 1 && /2026-09-01/.test(u.jejak.audit[0]) && /2026-09-11/.test(u.jejak.audit[0]),
        JSON.stringify(u.jejak.audit));
      T('disetujui: jejaknya menyebut dari mana angkanya',
        /stempel Ref/.test(u.jejak.audit[0] || ''), JSON.stringify(u.jejak.audit));
    }
    /* Tanggal yang KOSONG ikut bisa diisi, dan jejaknya mengatakan begitu —
       "(kosong) -> 2026-09-11" dibaca berbeda dari pembetulan. */
    {
      const u = buat('');
      await u.fn('r1', 'p1');
      T('kosong: tanggalnya terisi', u.p.tfDate === '2026-09-11', u.p.tfDate);
      T('kosong: jejaknya menyebut sebelumnya kosong',
        /\(kosong\)/.test(u.jejak.audit[0] || ''), JSON.stringify(u.jejak.audit));
    }
    /* Baris yang SUDAH benar tidak boleh menulis apa pun — tombolnya memang
       tidak digambar, tapi fungsinya global dan bisa dipanggil dari console. */
    {
      const u = buat('2026-09-11');
      await u.fn('r1', 'p1');
      T('sudah benar: tidak ada yang dikirim', u.jejak.commit === 0);
      T('sudah benar: updatedAt tidak naik', u.r.updatedAt === 1000);
      T('sudah benar: dikatakan, bukan diam', u.jejak.toast.length === 1, JSON.stringify(u.jejak.toast));
    }
  } else L('betulkanTanggal()', 'potongan pengurai tidak bisa dijalankan');

  /* ================= [6] Kontrak atas sumbernya ================= */
  console.log('\n[6] Kontrak atas sumber modul Reservasi');
  const bersih = SRC.replace(/\/\*[\s\S]*?\*\//g, '');   // komentar tidak boleh ikut dihitung

  T('parseTransferText membaca jam DULU lalu mengopernya ke ocrDate',
    /const\s+time\s*=\s*ocrTime\(t\)[\s\S]{0,200}?ocrDate\(t\s*,\s*time\)/.test(bersih));
  T('ocrDate mendahulukan stempel atas bacaan barisan tanggal',
    /return\s+tglStempel\(s,\s*jam\)\s*\|\|\s*dateIn\(s\)/.test(bersih));
  T('tglStempel menolak jam yang bukan 4 angka',
    /hhmm\.length\s*!==\s*4/.test(bersih));
  T('tglStempel menjangkarkan diri ke JAM, bukan cuma tanggal',
    /run\.slice\(i\s*\+\s*8\s*,\s*i\s*\+\s*12\)\s*!==\s*hhmm/.test(bersih));
  T('tglStempel memeriksa tanggalnya ke kalender sungguhan',
    /getUTCFullYear\(\)\s*!==\s*y/.test(bersih) && /getUTCDate\(\)\s*!==\s*d/.test(bersih));
  T('lebih dari satu kandidat TIDAK dipulangkan',
    /hasil\.size\s*===\s*1/.test(bersih));
  T('pola nama bulan tidak lagi mewajibkan spasi',
    /\(\\d\{1,2\}\)\\s\*\(\[A-Za-z\]\{3,10\}\)/.test(bersih));
  T('nama bulan disapu SELURUH kemunculannya',
    /matchAll\(\/\\b\(\\d\{1,2\}\)\\s\*/.test(bersih));

  /* Penandanya harus benar-benar DIGAMBAR di kolom Tanggal TF, bukan cuma
     fungsinya ada — rujukan yang benar di berkas tidak membuktikan ada
     apa pun yang muncul di layar. */
  const sel = bersih.slice(bersih.indexOf('<th>Tanggal TF</th>'));
  T('kolom Tanggal TF memanggil tglSeharusnya(p)', /\$\{tglSeharusnya\(p\)\?/.test(sel));
  T('penandanya membawa tombol Betulkan', /betulkanTanggal\('\$\{r\.id\}','\$\{p\.id\}'\)/.test(sel));
  T('penandanya memakai warna bahaya', /tglSeharusnya\(p\)\?[\s\S]{0,120}var\(--danger\)/.test(sel));

  /* SCAN ULANG TIDAK MENULIS APA PUN SENDIRI ke baris yang sudah benar:
     applyOcr tetap menghormati `force`, jadi halaman yang menggambar ulang
     tidak diam-diam menimpa tanggal yang sudah dibetulkan orang. */
  T('applyOcr tetap menghormati force untuk tfDate',
    /if\(parsed\.date\s*&&\s*\(force\s*\|\|\s*!p\.tfDate\)\)/.test(bersih));

  console.log('\n' + '='.repeat(52));
  console.log('  OK: ' + ok + '   GAGAL: ' + gagal + '   LEWAT: ' + lewat);
  console.log('='.repeat(52));
  if (gagal) process.exit(1);
})();
