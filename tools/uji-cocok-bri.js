/* ============================================================
   UJI — PENCOCOKAN DANA QRIS BRI  (19 September 2026)
   ------------------------------------------------------------
   node tools/uji-cocok-bri.js

   TIGA LAPIS, dan ketiganya perlu:

     1. MESIN BERDIRI SENDIRI (tanpa jsdom). deploy/assets/cocok-bri.js
        dijalankan lewat new Function('window','document', …) dengan document
        tiruan — kalau ia butuh satu pun nama global tuan rumah, blok pertama
        yang berbunyi. Pola yang sama dengan uji-performa-konten.js.

     2. JALUR BERKAS SUNGGUHAN. Berkas "Qris BRI 2026.xlsx" di root repo
        dibaca lewat bacaBerkasLembar() yang sungguhan — bukan fixture yang
        bentuknya bisa menyimpang dari berkas aslinya. Kalau berkasnya tidak
        ada, bagian ini MELEWAT DENGAN JELAS.

        Asersi terkuat di seluruh berkas ini ada di sana: total nominal hasil
        urai dibandingkan dengan BARIS TOTAL di kaki lembarnya sendiri
        (Rp45.894.350 untuk Sept26). Baris itu ditulis orang yang menyusun
        berkasnya, bukan oleh kode yang diuji, jadi ia satu-satunya
        pemeriksaan di sini yang tidak bisa basi sendiri.

     3. KONTRAK SISI PHP. Tidak ada php di mesin pengembangan, jadi
        kompas-mysql diperiksa dua cara: sintaksnya lewat php-parser (satu
        parse error mematikan SELURUH endpoint folder itu) dan aturannya
        sebagai kontrak atas SUMBERNYA. Keduanya BUKAN pengganti menjalankan
        PHP-nya, dan itu dikatakan di sini supaya yang membaca hasil hijau
        tahu persis apa yang sudah diuji. Pola uji-simpan-basi.js.

   Berkas Excel-nya JANGAN di-commit — ia memuat nama tamu berikut nominal
   DP-nya sebulan penuh.
   ============================================================ */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const AKAR = path.resolve(__dirname, '..');
let ok = 0, gagal = 0, lewat = 0;
function T(nama, syarat, ket) {
  if (syarat) { ok++; return; }
  gagal++;
  console.log('  GAGAL  ' + nama + (ket ? '  (' + ket + ')' : ''));
}
function L(nama, sebab) { lewat++; console.log('  LEWAT  ' + nama + '  (' + sebab + ')'); }
/* Blok yang bisa melempar DIBUNGKUS: asersi yang melempar membunuh seluruh
   suite, dan mutasinya lalu terbaca "uji tidak selesai" — bukan
   "tertangkap". Bentuk yang sudah empat kali menggigit di repo ini. */
function aman(nama, fn) {
  try { fn(); } catch (e) { gagal++; console.log('  GAGAL  ' + nama + '  (melempar: ' + e.message + ')'); }
}
async function amanAsync(nama, fn) {
  try { await fn(); } catch (e) { gagal++; console.log('  GAGAL  ' + nama + '  (melempar: ' + e.message + ')'); }
}

/* ============ 1. MESIN BERDIRI SENDIRI ============ */
console.log('\n[1] Mesin dijalankan tanpa tuan rumah');
const G = {};
const docPalsu = { head: null, activeElement: null,
  querySelector: () => null, querySelectorAll: () => [], getElementById: () => null,
  createElement: () => ({ style: {}, appendChild() {} }) };
aman('cocok-bri.js jalan berdiri sendiri', () => {
  new Function('window', 'document', fs.readFileSync(path.join(AKAR, 'deploy/assets/cocok-bri.js'), 'utf8'))(G, docPalsu);
});
new Function('window', fs.readFileSync(path.join(AKAR, 'deploy/assets/xlsx-baca.js'), 'utf8'))(G);

T('cbTgl / cbJam / cbUsulan diekspor',
  typeof G.cbTgl === 'function' && typeof G.cbJam === 'function' && typeof G.cbUsulan === 'function');
T('bacaBerkasLembar diekspor xlsx-baca', typeof G.bacaBerkasLembar === 'function');

/* ---- tanggal ---- */
console.log('\n[2] Membaca tanggal & jam');
T('serial Excel 46266 -> 2026-09-01', G.cbTgl(46266) === '2026-09-01', G.cbTgl(46266));
T('serial Excel 46295 -> 2026-09-30', G.cbTgl(46295) === '2026-09-30', G.cbTgl(46295));
/* SERIAL DIHITUNG UTC. Dibaca lokal, zona di timur menggeser tanggalnya satu
   hari — dan mutasi yang bergeser sehari jatuh ke bulan yang salah di ujung
   bulan. Di mesin berzona WIB kedua cara memberi hasil yang SAMA untuk
   sebagian besar tanggal, jadi yang menjaganya asersi SUMBER: pola yang sama
   dengan penjaga zona isoDari() di modul Analytics. */
const srcCb = fs.readFileSync(path.join(AKAR, 'deploy/assets/cocok-bri.js'), 'utf8');
T('serial dihitung UTC, bukan zona peramban', /toISOString\(\)\.slice\(0, 10\)/.test(srcCb));
T('"02 Sept 2026" -> 2026-09-02', G.cbTgl('02 Sept 2026') === '2026-09-02', G.cbTgl('02 Sept 2026'));
T('"29 Agust 2026" -> 2026-08-29', G.cbTgl('29 Agust 2026') === '2026-08-29', G.cbTgl('29 Agust 2026'));
T('ISO diteruskan apa adanya', G.cbTgl('2026-09-05') === '2026-09-05');
T('"5/9/2026" dibaca hari-bulan-tahun', G.cbTgl('5/9/2026') === '2026-09-05', G.cbTgl('5/9/2026'));
/* Nomor meja / nominal yang nyasar ke kolom tanggal TIDAK boleh diam-diam
   jadi tanggal tahun 1900-an. */
T('angka di luar rentang serial ditolak', G.cbTgl(12) === '' && G.cbTgl(200000) === '');
T('teks bukan tanggal ditolak', G.cbTgl('Reservasi') === '' && G.cbTgl('') === '');

T('jam "15.46" -> 15:46', G.cbJam('15.46') === '15:46', G.cbJam('15.46'));
T('jam "9:05" -> 09:05', G.cbJam('9:05') === '09:05', G.cbJam('9:05'));
T('serial pecahan hari jadi jam', G.cbJam('0.5') === '12:00', G.cbJam('0.5'));
/* Serial >= 1 adalah serial TANGGAL. Dibaca sebagai jam ia memberi jam
   karangan yang tetap terlihat wajar. */
T('serial >= 1 BUKAN jam', G.cbJam('46207') === '', G.cbJam('46207'));
T('jam di luar 0..23 ditolak', G.cbJam('25.10') === '' && G.cbJam('12.99') === '');

/* ---- nama ---- */
console.log('\n[3] Membaca & mencocokkan nama');
T('"Reservasi : Arlanda" -> Arlanda', G.cbNamaDari('Reservasi : Arlanda') === 'Arlanda');
T('"Reservasi: Laura" -> Laura', G.cbNamaDari('Reservasi: Laura') === 'Laura');
T('tanpa titik dua dipakai utuh', G.cbNamaDari('PT. Ibra Harisindo') === 'PT. Ibra Harisindo');
T('keterangan kosong -> nama kosong', G.cbNamaDari('') === '' && G.cbNamaDari('   ') === '');
T('beda huruf besar-kecil tetap cocok', G.cbNamaCocok('Arlanda', 'arlanda'));
T('sebagian nama panjang cocok', G.cbNamaCocok('Sri Rahmadani', 'Sri Rahmadani Putri'));
/* NAMA PENDEK WAJIB SAMA PERSIS. Dibiarkan sebagai substring, "Ika" cocok ke
   Rika / Ikang / Marika — dan pencocokan yang salah di sini memindahkan uang
   orang ke reservasi orang lain. */
T('nama pendek TIDAK cocok sebagai potongan', !G.cbNamaCocok('Ika', 'Rika'));
T('nama pendek cocok kalau sama persis', G.cbNamaCocok('Ika', 'ika'));
T('nama kosong tidak pernah cocok', !G.cbNamaCocok('', 'Arlanda') && !G.cbNamaCocok('Arlanda', ''));

/* ---- pengurai lembar ---- */
console.log('\n[4] Mengurai lembar (fixture)');
const KEPALA = { A: 'Tanggal Bayar', B: 'Jam', C: 'Keterangan', D: 'Tanggal booking',
                 E: 'BRI', F: 'Setlement Bank', G: 'BCA', H: 'PENDING BULAN LALU' };
const LEMBAR = [
  { H: 'PEND' },                                   // baris judul di atas kepala
  KEPALA,                                          // kepala di baris ke-2
  {},                                              // baris kosong
  { A: 'Total', E: '450000' },                     // baris TOTAL: tanpa tanggal
  { A: '02 Sept 2026', B: '11.44', C: 'Reservasi : Arlanda', D: '02 Sept 2026', E: '200000', F: '46267' },
  { A: '03 Sept 2026', B: '13.46', C: 'Reservasi : Farel',   D: '03 Sept 2026', E: '150000' },
  { A: '04 Sept 2026', B: '15.00', C: '',                    D: '',             E: '100000' },
  { A: '', B: '', C: 'baris tanpa tanggal', E: '999999' }    // dilewati
];
let U = null;
aman('cbUraiLembar tidak melempar', () => { U = G.cbUraiLembar(LEMBAR); });
T('lembar terbaca', !!(U && U.ok), U && U.error);
if (U && U.ok) {
  /* KEPALA DICARI, bukan dianggap baris pertama: lembar ini punya baris judul
     di atasnya, dan pembaca yang memakai baris pertama akan membaca "PEND"
     sebagai nama kolom lalu tidak menemukan satu pun. */
  T('baris kepala ditemukan di baris 2', U.barisKepala === 2, 'dapat ' + U.barisKepala);
  T('kolom dipetakan menurut NAMA', U.peta.tgl === 'A' && U.peta.nominal === 'E'
    && U.peta.ket === 'C' && U.peta.booking === 'D' && U.peta.jam === 'B',
    JSON.stringify(U.peta));
  /* 'bri' cocok PERSIS ke kolom E. Kalau pencocokannya awalan-saja, 'BCA'
     atau 'PENDING BULAN LALU' bisa merebutnya — dan salahnya muncul sebagai
     UANG, bukan sebagai galat. */
  T('kolom nominal BUKAN BCA', U.peta.nominal !== 'G');
  T('kolom tanggal BUKAN tanggal booking', U.peta.tgl !== 'D');
  T('3 baris mutasi terbaca', U.baris.length === 3, 'dapat ' + U.baris.length);
  /* BARIS TOTAL ikut terbuang lewat aturan "tanpa tanggal" yang sama dengan
     baris kosong. Ikut terbaca, ia masuk sebagai mutasi raksasa dan seluruh
     rekonsiliasi bulan itu berlipat. */
  T('baris TOTAL tidak ikut jadi mutasi', !U.baris.some(b => b.nominal === 450000));
  /* DUA, bukan satu: baris TOTAL dan baris tanpa tanggal sama-sama terhitung.
     Baris kosong murni TIDAK ikut dihitung — kalau ikut, angka "N baris
     dilewati" di pratinjau akan berbunyi ratusan untuk lembar yang isinya
     baik-baik saja, dan yang membacanya berhenti mempercayainya. */
  T('baris TOTAL & baris tanpa tanggal dihitung sebagai dilewati', U.lewat === 2, 'dapat ' + U.lewat);
  T('baris kosong murni TIDAK ikut dihitung dilewati', U.lewat < 3, 'dapat ' + U.lewat);
  T('jam dibakukan HH:MM', U.baris[0].jam === '11:44', U.baris[0].jam);
  T('tanggal booking ikut terbaca', U.baris[0].booking === '2026-09-02');
  T('settlement ikut terbaca', U.baris[0].settle === '2026-09-02', U.baris[0].settle);
  T('baris tanpa keterangan tetap masuk', U.baris[2].ket === '' && U.baris[2].nominal === 100000);
}
aman('lembar tanpa kolom yang dikenal ditolak dengan sebab', () => {
  const r = G.cbUraiLembar([{ A: 'satu', B: 'dua' }, { A: 'x', B: 'y' }]);
  T('lembar asing ditolak', r && r.ok === false && /kolom/i.test(r.error || ''));
});

/* KOLOM DICOCOKKAN PERSIS DULU, BARU AWALAN — dan lembar di bawah ini yang
   membedakan keduanya. Kolom A bernama "Tanggal booking" berdiri SEBELUM
   kolom B bernama "Tanggal"; dicocokkan awalan-saja, kandidat 'tanggal'
   akan merebut A karena "tanggal booking" memang berawalan "tanggal" — dan
   sejak itu tanggal uang masuk terbaca dari kolom tanggal booking. Seluruh
   mutasi lalu jatuh ke hari yang salah, tanpa satu pun galat.

   Bentuk ini bukan mengada-ada: kolom di lembar ini disusun tangan dan
   urutannya rutin berbeda antar bulan. */
aman('kolom dicocokkan PERSIS dulu, baru awalan', () => {
  const r = G.cbUraiLembar([
    { A: 'Tanggal booking', B: 'Tanggal', C: 'BRI Pending', D: 'BRI' },
    { A: '05 Sept 2026', B: '02 Sept 2026', C: '900000', D: '200000' }
  ]);
  T('lembar berkolom mirip terbaca', !!(r && r.ok), r && r.error);
  if (r && r.ok) {
    T('kolom tanggal jatuh ke "Tanggal", bukan "Tanggal booking"',
      r.peta.tgl === 'B', 'dapat ' + r.peta.tgl);
    T('kolom booking jatuh ke "Tanggal booking"', r.peta.booking === 'A', 'dapat ' + r.peta.booking);
    T('kolom nominal jatuh ke "BRI", bukan "BRI Pending"',
      r.peta.nominal === 'D', 'dapat ' + r.peta.nominal);
    T('nilainya ikut benar', r.baris.length === 1 && r.baris[0].tgl === '2026-09-02'
      && r.baris[0].nominal === 200000, JSON.stringify(r.baris[0]));
  }
});

/* ---- usulan pencocokan ---- */
console.log('\n[5] Usulan pencocokan');
/* FIXTURE DIRANCANG SUPAYA PENCOCOKAN SERAKAH GAGAL. m1 (Sri Agus) tidak
   punya DP bernama sama, dan DP milik Fenty punya tanggal + nominal yang
   SAMA PERSIS dengannya. Cara serakah — tiap baris mengambil kandidat
   pertama yang cocok dengan aturan apa pun — akan memberikan DP Fenty ke
   Sri Agus, lalu Fenty berakhir tanpa pasangan. Itu bug sungguhan: diuji
   atas data produksi September 2026, cara serakah meleset pada Fenty,
   Linda, Caca, dan Winanto. */
const MUT = [
  { id: 'm1', tgl: '2026-09-03', nominal: 300000, ket: 'Reservasi : Sri Agus', booking: '2026-09-05' },
  { id: 'm2', tgl: '2026-09-03', nominal: 300000, ket: 'Reservasi : Fenty',    booking: '2026-09-05' },
  { id: 'm3', tgl: '2026-09-07', nominal: 250000, ket: 'Reservasi : Bagas',    booking: '2026-09-09' },
  { id: 'm4', tgl: '2026-09-08', nominal: 175000, ket: '',                     booking: '' },
  { id: 'm5', tgl: '2026-09-09', nominal: 999000, ket: 'Reservasi : Hantu',    booking: '' }
];
const DPS = [
  { resId: 'r1', dpId: 'd1', nama: 'Fenty', resTgl: '2026-09-05', tfTgl: '2026-09-03', nominal: 300000, dipakai: false },
  /* tfTgl KOSONG — 197 dari 478 DP di produksi begitu, karena OCR struknya
     gagal membaca tanggal. Yang menolongnya babak "nama + tanggal booking". */
  { resId: 'r2', dpId: 'd2', nama: 'Bagas', resTgl: '2026-09-09', tfTgl: '',           nominal: 250000, dipakai: false },
  { resId: 'r3', dpId: 'd3', nama: 'Nadia', resTgl: '2026-09-08', tfTgl: '2026-09-08', nominal: 175000, dipakai: false },
  { resId: 'r4', dpId: 'd4', nama: 'Dipakai', resTgl: '2026-09-09', tfTgl: '2026-09-09', nominal: 999000, dipakai: true }
];
let US = null;
aman('cbUsulan tidak melempar', () => { US = G.cbUsulan(MUT, DPS); });
if (US) {
  T('Fenty dapat DP-nya sendiri (serakah gagal di sini)',
    US.m2 && US.m2.dp.dpId === 'd1', US.m2 ? US.m2.dp.nama : 'tidak ada usulan');
  T('Sri Agus TIDAK merebut DP Fenty', !US.m1 || US.m1.dp.dpId !== 'd1');
  T('babak nama+tgl ditandai PASTI', US.m2 && US.m2.babak.pasti === true);
  T('Bagas cocok lewat tanggal booking', US.m3 && US.m3.dp.dpId === 'd2'
    && US.m3.babak.kode === 'nama-book', US.m3 && US.m3.babak.kode);
  T('cocok lewat booking ditandai PASTI', US.m3 && US.m3.babak.pasti === true);
  /* Mutasi TANPA keterangan boleh dicocokkan lewat tanggal+nominal, TAPI
     hasilnya bukan "pasti": tidak ada nama yang menguatkannya. Diterapkan
     sekaligus, ia memindahkan uang tanpa ada yang pernah melihatnya. */
  T('mutasi tanpa keterangan dapat usulan', US.m4 && US.m4.dp.dpId === 'd3');
  T('usulan tanpa nama TIDAK pasti', US.m4 && US.m4.babak.pasti === false,
    US.m4 && String(US.m4.babak.pasti));
  /* DP yang sudah dipegang baris mutasi lain TIDAK ditawarkan lagi. Kalau
     ditawarkan, satu DP diakui dua kali dan total dana tercocokkan jadi
     lebih besar daripada uang yang benar-benar masuk. */
  T('DP yang sudah dipakai tidak diusulkan lagi', !US.m5);
  /* Satu DP tidak boleh diusulkan ke DUA baris sekaligus. */
  const dipakai = Object.keys(US).map(k => US[k].dp.dpId);
  T('tidak ada DP yang diusulkan dua kali', new Set(dipakai).size === dipakai.length);
}
/* ===== YANG MEMBEDAKAN SERAKAH DARI BERTINGKAT =====
   Dua baris memperebutkan SATU DP, dan yang satu cocok lewat babak PALING
   KETAT sementara yang lain cuma lewat babak PALING LONGGAR — dan yang
   longgar berdiri LEBIH DULU di daftarnya.

     s1  tanpa keterangan          -> cuma bisa lewat babak 4 (tgl+nominal)
     s2  "Reservasi : Wulan"       -> lewat babak 1 (nama+tgl+nominal)

   Serakah (tiap baris menghabiskan seluruh babak sebelum pindah baris):
   s1 diproses duluan, gagal di babak 1-3, lolos di babak 4, MENGAMBIL DP
   milik Wulan. s2 lalu tidak dapat apa-apa.

   Bertingkat: babak 1 menyapu seluruh baris lebih dulu, jadi s2 yang dapat.

   Fixture sebelumnya TIDAK bisa membedakan keduanya — mutasi "jadi serakah"
   LOLOS di putaran pertama, dan itu cacat fixture, bukan cacat produk. */
aman('bertingkat global, bukan serakah per baris', () => {
  const r = G.cbUsulan(
    [{ id: 's1', tgl: '2026-09-11', nominal: 425000, ket: '',                    booking: '' },
     { id: 's2', tgl: '2026-09-11', nominal: 425000, ket: 'Reservasi : Wulan',   booking: '' }],
    [{ resId: 'rw', dpId: 'dw', nama: 'Wulan', resTgl: '2026-09-12', tfTgl: '2026-09-11', nominal: 425000, dipakai: false }]);
  T('DP jatuh ke baris yang namanya cocok, bukan ke baris yang diproses duluan',
    r.s2 && r.s2.dp.dpId === 'dw', r.s1 ? 'direbut baris tanpa keterangan' : 'tidak ada usulan sama sekali');
  T('baris tanpa keterangan TIDAK ikut merebutnya', !r.s1);
});

/* Nominal yang BEDA tidak pernah dicocokkan, seberapa pun namanya mirip. */
aman('nominal beda tidak pernah cocok', () => {
  const r = G.cbUsulan([{ id: 'x', tgl: '2026-09-03', nominal: 300001, ket: 'Reservasi : Fenty', booking: '' }],
                       [{ resId: 'r', dpId: 'd', nama: 'Fenty', resTgl: '', tfTgl: '2026-09-03', nominal: 300000, dipakai: false }]);
  T('beda Rp1 pun tidak dicocokkan', !r.x);
});

/* ============ 5. HALAMANNYA DIJALANKAN (jsdom) ============
   Lapis terakhir, dan yang paling penting sejak model barisnya berubah
   19 September 2026 sore: seluruh perubahan hari itu ada di PENGGAMBAR, dan
   asersi atas fungsi murni maupun atas sumber tidak menyentuhnya sama
   sekali. Yang dijaga di sini APA YANG BENAR-BENAR TERGAMBAR. */
function cariJsdom() {
  const kandidat = [];
  if (process.env.JSDOM_PATH) kandidat.push(process.env.JSDOM_PATH);
  kandidat.push('jsdom', path.join(AKAR, 'node_modules/jsdom'));
  const home = process.env.USERPROFILE || process.env.HOME || '';
  if (home) kandidat.push(path.join(home, 'node_modules/jsdom'));
  for (const k of kandidat) { try { return require(k); } catch (e) {} }
  return null;
}

/* DP tiruan yang tiap barisnya menjawab satu pertanyaan, dan angkanya
   dipilih supaya tiap kesalahan memberi hasil yang BERBEDA. */
const DP_UJI = [
  // urut waktu: yang ini KEDUA walau berdiri pertama di daftar
  { id: 'p2', amount: 250000, method: 'QRIS',           tfDate: '2026-09-05', tfTime: '19:30:00', tfBank: 'DANA'    },
  { id: 'p1', amount: 300000, method: 'QRIS',           tfDate: '2026-09-05', tfTime: '08:15:00', tfBank: 'Mandiri' },
  // tanpa tanggal transfer -> harus di PALING BAWAH, bukan di atas
  { id: 'p3', amount: 175000, method: 'QRIS',           tfDate: '',           tfTime: '',         tfBank: ''        },
  // masuk rekening LAIN -> tidak boleh ikut di daftar dana masuk BRI
  { id: 'p4', amount: 900000, method: 'Transfer UOB',   tfDate: '2026-09-06', tfTime: '10:00:00', tfBank: 'BRI'     },
  // struknya berkop BRI tapi metodenya BCA -> uangnya masuk BCA
  { id: 'p5', amount: 800000, method: 'Transfer BCA',   tfDate: '2026-09-07', tfTime: '11:00:00', tfBank: 'BRI'     }
];
const RSV_UJI = [
  { id: 'r1', name: 'Arlanda', date: '2026-09-06', dps: [DP_UJI[0], DP_UJI[1]] },
  { id: 'r2', name: 'Bagas',   date: '2026-09-09', dps: [DP_UJI[2]] },
  { id: 'r3', name: 'Citra',   date: '2026-09-08', dps: [DP_UJI[3]] },
  { id: 'r4', name: 'Dewi',    date: '2026-09-10', dps: [DP_UJI[4]] }
];
/* Baris mutasi bank yang SUDAH tersimpan: satu belum dicocokkan (waktunya
   di antara kedua DP di atas, jadi urutannya bisa salah kalau digabung
   sembarangan), satu manual. */
const MUT_UJI = [
  { id: 'b1', tgl: '2026-09-05', jam: '12:00', nominal: 425000, ket: '', settle: '', booking: '',
    resId: '', dpId: '', resNama: '', resTgl: '', cara: '', catatan: '', sumber: 'unggah',
    cocokOleh: '', cocokAt: 0, oleh: 'Rani', olehId: 'u1', dibuat: 1, diubah: 1, diubahOleh: '',
    batalAt: 0, batalOleh: '', batalAlasan: '' },
  { id: 'b2', tgl: '2026-09-04', jam: '09:00', nominal: 5000000, ket: 'Event corporate PT Ibra',
    settle: '', booking: '', resId: '', dpId: '', resNama: '', resTgl: '', cara: 'bukan',
    catatan: 'Event corporate PT Ibra', sumber: 'manual', cocokOleh: 'Rani', cocokAt: 2,
    oleh: 'Rani', olehId: 'u1', dibuat: 2, diubah: 2, diubahOleh: '',
    batalAt: 0, batalOleh: '', batalAlasan: '' },
  /* SUDAH dicocokkan ke p1 (DP Arlanda Rp300.000). Tanpa baris seperti ini,
     dua aturan tidak punya tempat untuk gagal: DP yang sudah diwakili baris
     mutasi TIDAK boleh digambar dua kali, dan baris mutasi yang sudah cocok
     WAJIB ikut dihitung sebagai "dari reservasi". Kedua mutasinya LOLOS di
     putaran pertama karena fixture-nya belum punya satu pun baris cocok.

     Angkanya dipilih supaya ekspektasi lain TIDAK bergeser: ia menggantikan
     p1 yang tadinya berdiri sendiri, dengan tanggal, jam, dan nominal yang
     sama persis. */
  { id: 'b3', tgl: '2026-09-05', jam: '08:15', nominal: 300000, ket: 'Reservasi : Arlanda',
    settle: '', booking: '', resId: 'r1', dpId: 'p1', resNama: 'Arlanda', resTgl: '2026-09-06',
    cara: 'cocok', catatan: '', sumber: 'unggah', cocokOleh: 'Rani', cocokAt: 3,
    oleh: 'Rani', olehId: 'u1', dibuat: 3, diubah: 3, diubahOleh: '',
    batalAt: 0, batalOleh: '', batalAlasan: '' }
];

async function ujiHalaman() {
  console.log('\n[5b] Halamannya dijalankan (jsdom)');
  const jsdom = cariJsdom();
  if (!jsdom) { L('halaman dijalankan di jsdom', 'jsdom tidak ketemu — setel JSDOM_PATH'); return; }
  const { JSDOM } = jsdom;
  const dom = new JSDOM('<!doctype html><html><head></head><body><div id="app-view"></div></body></html>',
                        { runScripts: 'outside-only' });
  const W = dom.window;
  new Function('window', fs.readFileSync(path.join(AKAR, 'deploy/assets/xlsx-baca.js'), 'utf8'))(W);

  /* fetch / alert / confirm DIOPER SEBAGAI PARAMETER, bukan ditempel ke
     window sesudahnya. Di peramban  telanjang di dalam aset memang
     window.fetch, tapi di Node ia mengikat ke fetch GLOBAL milik Node —
     jadi stub yang cuma ditempel ke W tidak pernah dipanggil, seluruh
     pemuatnya gagal diam-diam, dan halamannya tergambar KOSONG. Asersi
     apa pun di atasnya lalu menguji layar yang tidak pernah terisi. */
  const POST = [];
  const fetchUji = (url, opt) => {
    const u = String(url);
    if (opt && opt.method === 'POST') {
      POST.push(JSON.parse(opt.body));
      return Promise.resolve({ json: () => Promise.resolve({ ok: true, data: { saved: true, n: 1, baru: 1, lama: 0, lewat: 0 } }) });
    }
    if (u.indexOf('briList') >= 0)
      return Promise.resolve({ json: () => Promise.resolve({ ok: true, data: { baris: MUT_UJI, total: MUT_UJI.length, maks: 2000 } }) });
    if (u.indexOf('getAll') >= 0)
      return Promise.resolve({ json: () => Promise.resolve({ ok: true, data: { reservations: RSV_UJI } }) });
    return Promise.resolve({ json: () => Promise.resolve({ ok: false, error: 'url tak dikenal: ' + u }) });
  };
  const alertUji = () => {}, confirmUji = () => true;
  W.alert = alertUji; W.confirm = confirmUji;
  new Function('window', 'document', 'fetch', 'alert', 'confirm',
    fs.readFileSync(path.join(AKAR, 'deploy/assets/cocok-bri.js'), 'utf8'))(W, W.document, fetchUji, alertUji, confirmUji);

  const el = W.document.getElementById('app-view');
  let bolehUbah = true;
  W.cbPasang({ apiUrl: '/api', rsvUrl: '/rsv', sesi: () => ({ name: 'Rani', token: 't' }),
               bolehUbah: () => bolehUbah, gambarUlang: () => W.cbGambar(el, '2026-09') });
  W.cbGambar(el, '2026-09');
  /* DITUNGGU LEWAT STATE-NYA, BUKAN LEWAT TEKS DI LAYAR.
     Penunggu yang mencari nama tamu di innerHTML LANGSUNG KELUAR pada render
     pertama: formulir tempel di kartu atas memasang CONTOH isian yang
     kebetulan memakai nama yang sama ("Reservasi : Arlanda"). Seluruh asersi
     di bawahnya lalu menguji layar yang datanya belum mendarat, dan hasilnya
     terbaca sebagai dua belas bug produk yang tidak ada satu pun.

     Ini kali keempat bentuk itu menggigit di repo ini — penunggu yang cocok
     dengan layar SEBELUMNYA. Yang ditunggu di sini kedua pemuatnya sampai
     mendarat, dan itu tidak bisa dipalsukan teks apa pun. */
  const S = W.__cbState;
  for (let i = 0; i < 80 && (!S.rows.length || !S.dps); i++) await new Promise(r => setTimeout(r, 10));
  T('daftar mutasi termuat', S.rows.length === MUT_UJI.length, 'rows=' + S.rows.length + ' err=' + S.err);
  T('bukti bayar dari modul Reservasi termuat', !!S.dps && S.dps.length === DP_UJI.length,
    'dps=' + (S.dps ? S.dps.length : 'null') + ' dpErr=' + S.dpErr);

  const html = () => el.innerHTML;
  /* Irisan per KARTU menurut <h3>-nya. Asersi yang menyapu seluruh halaman
     cocok dengan kartu lain — bentuk yang sudah lima kali menggigit di repo
     ini (kolom Kontribusi, kartu kelompok Kategori, Rekap Kanal, Void). */
  function kartu(judul) {
    const h = html();
    const i = h.indexOf('<h3>' + judul);
    if (i < 0) return '';
    const j = h.indexOf('<h3>', i + 4);
    return h.slice(i, j < 0 ? h.length : j);
  }
  const barisTabel = () => {
    const k = kartu('Dana Masuk BRI');
    const m = k.match(/<tbody>([\s\S]*?)<\/tbody>/);
    return m ? m[1].split('<tr').slice(1).map(x => '<tr' + x) : [];
  };

  T('halaman tergambar', html().indexOf('Dana Masuk BRI') >= 0);

  /* ===== POIN 1: BARIS LAHIR SENDIRI DARI BUKTI BAYAR =====
     Tidak ada satu unggahan pun di uji ini, dan tidak ada yang mengetik
     apa pun — ketiga DP BRI tetap wajib berdiri sebagai baris. */
  const b = barisTabel();
  T('baris DP muncul tanpa ada yang mengunggah/mengetik',
    kartu('Dana Masuk BRI').indexOf('Arlanda') >= 0 && kartu('Dana Masuk BRI').indexOf('Bagas') >= 0);
  T('barisnya ditandai terisi sendiri dari bukti bayar',
    kartu('Dana Masuk BRI').indexOf('bukti bayar') >= 0);
  /* 3 DP BRI + 2 baris mutasi = 5 transaksi. */
  T('5 baris transaksi tergambar', b.length === 5, 'dapat ' + b.length);
  /* SATU TRANSAKSI = SATU BARIS. DP p1 sudah diwakili baris mutasi b3, jadi
     ia TIDAK boleh berdiri sendiri lagi — digambar dua kali, uang yang sama
     terhitung dua kali dan total dana masuk jadi lebih besar daripada yang
     benar-benar masuk rekening. */
  T('DP yang sudah diwakili baris mutasi tidak digambar dua kali',
    b.filter(x => x.indexOf('Arlanda') >= 0).length === 2,
    'baris ber-Arlanda: ' + b.filter(x => x.indexOf('Arlanda') >= 0).length);
  T('baris mutasi yang sudah cocok membawa nama tamunya',
    (b.find(x => x.indexOf('Rp300.000') >= 0) || '').indexOf('Arlanda') >= 0);

  /* ===== POIN 1: URUT WAKTU TRANSAKSI MASUK ===== */
  const urutNama = b.map(x => {
    if (x.indexOf('Arlanda') >= 0) return x.indexOf('Rp300.000') >= 0 ? 'Arlanda-300' : 'Arlanda-250';
    if (x.indexOf('Bagas') >= 0) return 'Bagas';
    if (x.indexOf('PT Ibra') >= 0) return 'manual';
    return 'bank';
  });
  T('diurut menurut waktu transaksi masuk',
    urutNama.join('|') === 'manual|Arlanda-300|bank|Arlanda-250|Bagas', urutNama.join('|'));
  /* DP tanpa tanggal transfer WAJIB di paling bawah. Diurut sebagai string
     kosong ia menumpuk di ATAS — persis di tempat orang mencari transaksi
     paling awal. */
  T('DP tanpa tanggal transfer ada di paling bawah', urutNama[urutNama.length - 1] === 'Bagas');
  T('sebab tanggalnya kosong DIKATAKAN, bukan didiamkan',
    html().indexOf('tidak punya tanggal transfer') >= 0);

  /* ===== METODE yang menentukan, BUKAN bank di struk ===== */
  T('DP Transfer UOB tidak ikut di daftar dana masuk BRI',
    kartu('Dana Masuk BRI').indexOf('Citra') < 0);
  /* Struknya berkop BRI tapi metodenya Transfer BCA — uangnya masuk BCA.
     Aturan yang membaca gabungan bank+metode akan meloloskannya. */
  T('DP berstruk BRI tapi metodenya Transfer BCA juga tidak ikut',
    kartu('Dana Masuk BRI').indexOf('Dewi') < 0);
  T('yang tidak masuk BRI tetap DISEBUT di kartunya sendiri',
    kartu('DP Bulan Ini yang Tidak Masuk BRI').indexOf('Rp1.700.000') >= 0,
    'kartu: ' + kartu('DP Bulan Ini yang Tidak Masuk BRI').slice(0, 120));

  /* ===== BARIS DP READ-ONLY ===== */
  const barisBagas = b.find(x => x.indexOf('Bagas') >= 0) || '';
  T('baris dari bukti bayar TIDAK punya tombol aksi', barisBagas.indexOf('cbBuka(') < 0);
  const barisBank = b.find(x => x.indexOf("cbBuka('b1')") >= 0) || '';
  T('baris mutasi bank punya tombol Cocokkan', !!barisBank);

  /* ===== KARTU RINGKAS BERDIRI DI ATAS DAFTAR YANG SAMA ===== */
  const kr = html().slice(0, html().indexOf('<h3>'));
  T('kartu Dari Reservasi menghitung 3 transaksi', /Dari Reservasi[\s\S]{0,300}?3 transaksi/.test(kr),
    kr.slice(0, 200));
  T('kartu Di Luar Reservasi menghitung baris manual', /Di Luar Reservasi[\s\S]{0,300}?1 transaksi/.test(kr));
  /* 300.000 + 250.000 + 175.000 + 425.000 + 5.000.000 */
  T('total dana masuk = Rp6.150.000', kr.indexOf('Rp6.150.000') >= 0, kr.slice(0, 260));

  /* ===== POIN 2: TAMBAH DANA MASUK DI LUAR RESERVASI ===== */
  T('tombol tambah dana masuk ada', html().indexOf('cbBukaTambah()') >= 0);
  aman('formulir tambah terbuka', () => { W.cbBukaTambah(); });
  T('formulir tergambar', html().indexOf('Dana masuk di luar reservasi') >= 0);
  T('keterangan ditandai wajib di formulirnya', /Keterangan[\s\S]{0,200}?cb-wajib/.test(html()));

  /* YANG DIHITUNG JUMLAH POST, bukan ada-tidaknya pita di layar. Itu
     satu-satunya asersi yang bisa membedakan "ditahan" dari "diperingatkan
     lalu tetap dikirim" — dan dari layar keduanya terlihat sama persis. */
  /* DIISI LEWAT KOTAKNYA, bukan lewat state. cbSimpanTambah() sengaja
     membaca ULANG dari DOM sebelum mengirim — penangan  tidak jalan
     untuk isian yang diisi autofill atau pemilih tanggal peramban — jadi uji
     yang cuma menyetel state menguji jalur yang tidak pernah dipakai orang,
     dan nilai lama di DOM justru menimpanya balik. */
  const isiForm = (nilai) => {
    const w = W.document.getElementById('cb-wrap');
    const kotak = w.querySelectorAll('.cb-pra .cb-in');
    const urut = ['tgl', 'jam', 'nominal', 'ket'];
    kotak.forEach((el, i) => {
      if (!urut[i]) return;
      el.value = nilai[urut[i]] === undefined ? '' : nilai[urut[i]];
      W.cbKetikTambah(el, urut[i]);
    });
    return kotak.length;
  };
  T('formulirnya punya empat kotak isian', isiForm({ tgl: '2026-09-08', jam: '13:00', nominal: '750000', ket: '' }) === 4);

  const n0 = POST.length;
  await amanAsync('simpan tanpa keterangan tidak melempar', async () => { await W.cbSimpanTambah(); });
  T('kiriman DITAHAN saat keterangan kosong', POST.length === n0, 'POST bertambah ' + (POST.length - n0));
  T('kotak keterangannya ditandai merah', /cb-in err/.test(html()));
  T('yang kurang disebut namanya', html().indexOf('Belum lengkap') >= 0);

  isiForm({ tgl: '2026-09-08', jam: '13:00', nominal: '750000', ket: 'Sewa videotron' });
  await amanAsync('simpan lengkap tidak melempar', async () => { await W.cbSimpanTambah(); });
  /* AUTOFILL / PEMILIH TANGGAL PERAMBAN tidak memicu penangan  di
     sebagian platform, jadi nilainya cuma ada di DOM dan tidak pernah sampai
     ke state. cbSimpanTambah() karena itu WAJIB membaca ulang dari kotaknya
     sebelum mengirim; kalau tidak, yang terkirim kosong padahal di layar
     jelas terisi. Ditiru di sini dengan menyetel .value TANPA memanggil
     penangan ketiknya. */
  /* Formulirnya sudah tertutup sesudah simpan yang berhasil — dibuka lagi,
     lalu keterangannya diisi LANGSUNG ke .value tanpa penangan ketiknya. */
  W.cbBukaTambah();
  isiForm({ tgl: '2026-09-09', jam: '', nominal: '120000', ket: '' });
  {
    const w = W.document.getElementById('cb-wrap');
    const kotak = w.querySelectorAll('.cb-pra .cb-in');
    T('formulir terbuka lagi untuk uji autofill', kotak.length === 4, 'kotak=' + kotak.length);
    if (kotak.length === 4) kotak[3].value = 'Setoran tamu BRI';
  }
  await amanAsync('simpan sesudah autofill tidak melempar', async () => { await W.cbSimpanTambah(); });
  const kirimTambah = POST.filter(p => p.action === 'briTambah');
  T('kiriman BERANGKAT saat lengkap', kirimTambah.length >= 1, 'dapat ' + kirimTambah.length);
  if (kirimTambah.length) {
    const d = kirimTambah[0].data || {};
    T('nominal dikirim sebagai angka, bukan teks berpemisah',
      d.nominal === 750000, 'dapat ' + JSON.stringify(d.nominal));
    T('keterangan ikut terkirim', d.ket === 'Sewa videotron');
  }
  const kirimAuto = POST.filter(p => p.action === 'briTambah');
  T('isian autofill ikut terbaca dari kotaknya', kirimAuto.length === 2
    && kirimAuto[1].data && kirimAuto[1].data.ket === 'Setoran tamu BRI',
    'kiriman: ' + JSON.stringify(kirimAuto.map(x => x.data && x.data.ket)));
  if (kirimTambah.length) {
    T('token sesi ikut terkirim', kirimTambah[0].sesi === 't');
  }

  /* ===== KEADAAN KOSONG WAJIB MENYEBUT SEBAB YANG SEBENARNYA =====
     Dilaporkan user 19 September 2026: reservasi yang JELAS ada di modul
     Reservasi tidak muncul di sini, dan keadaan kosongnya menyuruh mengunggah
     bukti bayar yang sudah lama ada. Sebabnya metode DP-nya (Transfer BCA) —
     uangnya memang masuk rekening lain, jadi barisnya BENAR tidak ikut.

     Sebabnya SUDAH disebut di kartu paling bawah, dan itu TIDAK CUKUP: kartu
     itu berdiri di luar layar, dan yang mencari satu reservasi tidak pernah
     sampai ke sana. Keterangan yang benar di tempat yang salah sama saja
     tidak ada. */
  {
    const domK = new JSDOM('<!doctype html><html><head></head><body><div id="app-view"></div></body></html>',
                           { runScripts: 'outside-only' });
    const WK = domK.window;
    new Function('window', fs.readFileSync(path.join(AKAR, 'deploy/assets/xlsx-baca.js'), 'utf8'))(WK);
    /* DP yang metodenya BUKAN BRI, dan TIDAK ada satu baris mutasi pun —
       persis keadaan yang dilaporkan. */
    const RSV_BCA = [{ id: 'rx', name: 'AAAAA', date: '2026-09-19',
      dps: [{ id: 'px', amount: 168800, method: 'Transfer BCA', tfDate: '', tfTime: '', tfBank: '' }] }];
    const fK = (url, opt) => {
      if (String(url).indexOf('briList') >= 0)
        return Promise.resolve({ json: () => Promise.resolve({ ok: true, data: { baris: [], total: 0, maks: 2000 } }) });
      return Promise.resolve({ json: () => Promise.resolve({ ok: true, data: { reservations: RSV_BCA } }) });
    };
    new Function('window', 'document', 'fetch', 'alert', 'confirm',
      fs.readFileSync(path.join(AKAR, 'deploy/assets/cocok-bri.js'), 'utf8'))(WK, WK.document, fK, () => {}, () => true);
    const elK = WK.document.getElementById('app-view');
    WK.cbPasang({ apiUrl: '/api', rsvUrl: '/rsv', sesi: () => ({ token: 't' }),
                  bolehUbah: () => true, gambarUlang: () => WK.cbGambar(elK, '2026-09') });
    WK.cbGambar(elK, '2026-09');
    const SK = WK.__cbState;
    for (let i = 0; i < 80 && !SK.dps; i++) await new Promise(r => setTimeout(r, 10));
    const hk = elK.innerHTML;
    T('bukti bayar termuat di skenario ini', !!SK.dps && SK.dps.length === 1);
    T('DP bermetode Transfer BCA memang TIDAK jadi baris dana masuk BRI',
      hk.indexOf('Belum ada satu transaksi') >= 0);
    /* Yang dijaga: sebabnya disebut DI KEADAAN KOSONGNYA, bukan cuma di kartu
       bawah. Irisannya berhenti sebelum <h3> berikutnya — asersi yang menyapu
       seluruh halaman akan cocok dengan kartu itu tanpa pernah menyentuh
       keadaan kosongnya, dan mutasi yang mengembalikan kalimat lama LOLOS. */
    const iK = hk.indexOf('Belum ada satu transaksi');
    const jK = hk.indexOf('<h3>', iK);
    const kosong = hk.slice(iK, jK < 0 ? hk.length : jK);
    T('keadaan kosong menyebut metodenya', kosong.indexOf('Transfer BCA') >= 0, kosong.slice(0, 160));
    T('keadaan kosong menyebut nama tamunya', kosong.indexOf('AAAAA') >= 0);
    T('keadaan kosong menyebut nominalnya', kosong.indexOf('Rp168.800') >= 0);
    T('keadaan kosong menunjuk tempat membetulkannya', kosong.indexOf('modul Reservasi') >= 0);
    /* TIDAK BOLEH menyuruh mengunggah bukti bayar: buktinya sudah ada, dan
       yang menurutinya akan mengunggah ulang berkali-kali tanpa hasil. */
    T('keadaan kosong TIDAK menyuruh mengunggah bukti bayar',
      kosong.indexOf('bukti bayarnya diunggah') < 0, kosong.slice(0, 200));
    T('kartu di bawah tetap ada sebagai keterangan lengkapnya',
      hk.indexOf('Tidak Masuk BRI') >= 0);
    T('kartu di bawah ikut menyebut nama tamunya',
      hk.slice(hk.indexOf('Tidak Masuk BRI')).indexOf('AAAAA') >= 0);
  }

  /* ===== HAK LIHAT ===== */
  bolehUbah = false;
  W.cbGambar(el, '2026-09');
  T('yang cuma boleh Lihat tidak diberi tombol tambah', html().indexOf('cbBukaTambah()') < 0);
  T('yang cuma boleh Lihat tetap melihat daftarnya', kartu('Dana Masuk BRI').indexOf('Arlanda') >= 0);
  bolehUbah = true;
}

/* ============ 2. JALUR BERKAS SUNGGUHAN ============ */
console.log('\n[6] Berkas Qris BRI asli (penguat)');
const XLSX = path.join(AKAR, 'Qris BRI 2026.xlsx');

/* Nilai-nilai ini DIBACA DARI BERKASNYA SENDIRI, bukan disalin ke sini:
   TOTAL_SEPT diambil dari baris Total di kaki lembarnya (kolom E baris 4),
   yang ditulis orang yang menyusun berkasnya — bukan oleh kode yang diuji.
   Itu sebabnya perbandingan ini tidak bisa basi sendiri. */
async function ujiBerkasAsli() {
  if (!fs.existsSync(XLSX)) {
    L('jalur berkas .xlsx sungguhan', 'Qris BRI 2026.xlsx tidak ada di root repo — berkasnya memang tidak di-commit');
    return;
  }
  const buf = fs.readFileSync(XLSX);
  const file = { name: 'Qris BRI 2026.xlsx',
                 arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) };
  let lembar = null;
  await amanAsync('bacaBerkasLembar membaca berkas asli', async () => { lembar = await G.bacaBerkasLembar(file); });
  if (!lembar) return;
  T('seluruh lembar terbaca (14)', lembar.length === 14, 'dapat ' + lembar.length);
  /* NAMA LEMBAR DARI workbook.xml, URUTAN dari r:id -> rels. Ditebak dari
     nomor berkas (sheet1.xml = lembar pertama), Juni26 akan terbaca sebagai
     lembar ke-7 padahal ia tab ke-7 yang tersimpan sebagai sheet7.xml
     sementara Juli26 — tab PERTAMA — juga sheet1.xml. Yang menebak memberi
     nama bulan yang keliru ke isi yang benar, tanpa satu pun galat. */
  T('lembar pertama bernama Juli26 (bukan Jan26)', lembar[0] && lembar[0].nama === 'Juli26',
    lembar[0] && lembar[0].nama);
  T('nama lembar terbaca dari workbook.xml', lembar.some(s => s.nama === 'Sept26'));

  const sep = lembar.find(s => s.nama === 'Sept26');
  if (!sep) { T('lembar Sept26 ada', false); return; }

  /* BARIS TOTAL DIBACA DARI LEMBARNYA — pembanding yang tidak ditulis kode
     ini. Kolom E pada baris yang kolom A-nya berbunyi "Total". */
  let totalLembar = 0;
  for (const b of sep.baris.slice(0, 12)) {
    if (String(b.A || '').trim().toLowerCase() === 'total') { totalLembar = Math.round(parseFloat(b.E) || 0); break; }
  }
  T('baris Total ketemu di lembarnya', totalLembar > 0, 'dapat ' + totalLembar);

  const u = G.cbUraiLembar(sep.baris);
  T('Sept26 terurai', !!(u && u.ok), u && u.error);
  if (!u || !u.ok) return;
  const totalUrai = u.baris.reduce((a, b) => a + b.nominal, 0);
  /* ===== ASERSI TERKUAT DI BERKAS INI =====
     Jumlah hasil urai WAJIB sama persis dengan baris Total yang ditulis di
     kaki lembarnya. Ia menangkap kesalahan APA PUN di pengurainya: kolom
     yang salah dipilih, baris yang terlewat, baris total yang ikut terhitung,
     atau angka berpemisah ribuan yang salah dibaca. */
  T('jumlah hasil urai = baris Total di lembarnya (Rp' + totalLembar.toLocaleString('id') + ')',
    totalUrai === totalLembar, 'hasil urai ' + totalUrai.toLocaleString('id'));
  T('165 baris mutasi terbaca dari Sept26', u.baris.length === 165, 'dapat ' + u.baris.length);
  T('kolom nominal jatuh ke BRI (E), bukan BCA', u.peta.nominal === 'E', u.peta.nominal);
  T('seluruh baris punya tanggal ISO yang sah',
    u.baris.every(b => /^\d{4}-\d{2}-\d{2}$/.test(b.tgl)));
  T('seluruh baris bernominal positif', u.baris.every(b => b.nominal > 0));
  T('seluruh baris jatuh di bulan September 2026',
    u.baris.every(b => b.tgl.slice(0, 7) === '2026-09'),
    [...new Set(u.baris.map(b => b.tgl.slice(0, 7)))].join(','));
}

/* ============ 3. KONTRAK SISI PHP ============ */
function ujiPhp() {
  console.log('\n[7] Sisi PHP (sintaks + kontrak atas sumbernya)');
  const fLib = path.join(AKAR, 'kompas-mysql/lib_kompas_mysql.php');
  const fApi = path.join(AKAR, 'kompas-mysql/api.php');
  let parser = null;
  try { parser = require('php-parser'); } catch (e) { parser = null; }
  if (parser) {
    for (const f of [fLib, fApi]) {
      aman('php-parser: ' + path.basename(f), () => {
        new parser({ parser: { suppressErrors: false } }).parseCode(fs.readFileSync(f, 'utf8'));
      });
    }
  } else {
    L('sintaks PHP diperiksa php-parser', 'php-parser belum terpasang — npm i php-parser');
  }

  const lib = fs.readFileSync(fLib, 'utf8');
  const api = fs.readFileSync(fApi, 'utf8');
  const badan = nama => {
    const i = lib.indexOf('function ' + nama + '(');
    if (i < 0) return '';
    const j = lib.indexOf('\nfunction ', i + 1);
    return lib.slice(i, j < 0 ? lib.length : j);
  };

  T('tabel bri_mutasi lahir lewat CREATE TABLE IF NOT EXISTS, bukan migrasi',
    /CREATE TABLE IF NOT EXISTS `bri_mutasi`/.test(lib));
  /* Tanpa kunci unik ini, unggah ulang berkas yang sama melahirkan baris
     ganda — dan sebulan mutasi jadi terhitung dua kali. */
  T('sidik dikunci UNIQUE', /UNIQUE KEY `uniq_bri_sidik`/.test(lib));
  /* SIDIK WAJIB MEMUAT NOMOR URUT. Dua transfer yang tanggal, jam, dan
     nominalnya sama persis memang mungkin (dua tamu, nominal bulat yang
     sama) — tanpa `#k` yang kedua MENIMPA yang pertama lewat kunci unik di
     atas, dan satu baris mutasi hilang tanpa satu pun galat. Uangnya ikut
     hilang dari rekonsiliasi. */
  const bSidik = badan('bri_sidik');
  T('sidik memuat nomor urut kemunculan', /'\|#' \. \(int\)\$k/.test(bSidik), bSidik.trim().slice(0, 120));
  T('nomor urut dihitung per kombinasi tgl|jam|nominal',
    /isset\(\$hitungK\[\$kunci\]\) \? \$hitungK\[\$kunci\] \+ 1 : 0/.test(lib));

  const bUnggah = badan('bri_unggah');
  T('bri_unggah ada', !!bUnggah);
  /* KOLOM PENCOCOKAN TIDAK PERNAH DITIMPA UNGGAH. Berkasnya diunggah ulang
     berkali-kali sepanjang bulan sementara pencocokannya diputuskan di layar;
     unggah yang menimpa membuang keputusan yang baru diambil orang, tanpa
     satu pun galat. */
  for (const kol of ['res_id', 'dp_id', 'cara', 'catatan', 'cocok_oleh', 'cocok_at']) {
    T('unggah TIDAK menyentuh kolom ' + kol,
      bUnggah.indexOf('`' + kol + '`') < 0, 'kolom ' + kol + ' disebut di bri_unggah');
  }
  T('unggah cuma memperbarui ket/settle/booking di ON DUPLICATE KEY',
    /ON DUPLICATE KEY UPDATE[\s\S]*?`ket`[\s\S]*?`settle`[\s\S]*?`booking`/.test(bUnggah));
  /* Baris yang ADA di tabel tapi TIDAK ada di berkas harus dibiarkan. Satu
     DELETE di sini berarti unggah yang salah pilih lembar menghapus sebulan
     pencocokan, dan tidak ada cara mengembalikannya. */
  T('unggah TIDAK menghapus baris yang tidak ada di berkas',
    !/DELETE|TRUNCATE/i.test(bUnggah));
  T('unggah satu TRANSAKSI', /beginTransaction\(\)/.test(bUnggah) && /rollBack\(\)/.test(bUnggah));
  /* DIJEPIT KE SYARATNYA SENDIRI. Pola `$lewat++; continue;` yang telanjang
     juga cocok dengan penjaga `!is_array($b)` satu baris di atasnya, jadi
     mutasi yang mengganti baris ini dengan `return array(...)` LOLOS —
     memang begitu di putaran pertama. */
  T('baris tanpa tanggal/nominal dilewati, bukan menggagalkan seluruh unggah',
    /\$nom <= 0\) \{ \$lewat\+\+; continue; \}/.test(bUnggah));
  /* Dihitung SESUDAH menulis, seluruh sidik pasti sudah ada dan angka "N
     baris baru" jadi nol selamanya.

     KEDUANYA WAJIB ADA sebelum posisinya dibandingkan: indexOf memulangkan
     -1 untuk yang tidak ketemu, dan -1 selalu lebih kecil daripada apa pun
     — jadi mutasi yang MENGHAPUS blok hitungnya LOLOS. Memang begitu di
     putaran pertama. */
  const posHitung = bUnggah.indexOf('$adaSidik[$s[\'sidik\']] = true');
  const posTulis  = bUnggah.indexOf('beginTransaction');
  T('blok hitung baris baru masih ada', posHitung >= 0);
  T('blok transaksi masih ada', posTulis >= 0);
  T('jumlah baris baru dihitung SEBELUM menulis',
    posHitung >= 0 && posTulis >= 0 && posHitung < posTulis);

  const bCocokSatu = badan('bri_cocok_satu');
  T('bri_cocok_satu ada', !!bCocokSatu);
  /* SATU DP TIDAK BOLEH DIPEGANG DUA BARIS. Kalau boleh, satu DP diakui dua
     kali dan total dana tercocokkan lebih besar daripada uang yang masuk. */
  T('bentrok DP diperiksa sebelum menyimpan', /bri_dp_dipakai\(/.test(bCocokSatu));
  const bDp = badan('bri_dp_dipakai');
  T('pemeriksa bentrok melewati baris yang sudah dibatalkan', /`batal_at`=0/.test(bDp));
  T('pemeriksa bentrok mengecualikan baris itu sendiri', /`id`<>:x/.test(bDp));
  T('cara "bukan" menuntut catatan', /\$catatan === ''\) return 'Sebutkan dulu/.test(bCocokSatu));
  T('baris yang sudah dibatalkan tidak bisa dicocokkan lagi',
    /batal_at'\] > 0\) return 'Baris ini sudah dibatalkan/.test(bCocokSatu));

  const bCocok = badan('bri_cocok');
  /* BUKAN satu transaksi, dan itu disengaja: satu usulan yang ditolak karena
     DP-nya keburu dipakai orang lain tidak boleh membatalkan empat puluh
     sembilan keputusan yang sudah benar. */
  T('bri_cocok TIDAK membungkus semuanya jadi satu transaksi',
    !!bCocok && !/beginTransaction/.test(bCocok));
  T('kegagalan per baris dilaporkan satu per satu', /\$gagal\[\] = array\(/.test(bCocok));
  T('yang SELURUHNYA gagal dipulangkan sebagai gagal', /if \(!\$ok && count\(\$gagal\)\)/.test(bCocok));

  /* TIDAK ADA DELETE di seluruh jalur BRI. Aturan nomor 0 repo ini, dan di
     sini ia juga aturan produk: baris mutasi yang bisa dihapus membuat uang
     yang benar-benar masuk hilang dari rekonsiliasi. */
  const semuaBri = ['bri_pastikan', 'bri_unggah', 'bri_cocok_satu', 'bri_cocok', 'bri_batal', 'bri_list']
    .map(badan).join('\n');
  T('tidak ada DELETE/TRUNCATE di seluruh jalur BRI', !/\bDELETE\b|\bTRUNCATE\b/i.test(semuaBri));
  T('bri_batal menandai, bukan menghapus', /UPDATE `bri_mutasi` SET `batal_at`/.test(badan('bri_batal')));
  T('alasan pembatalan wajib', /Alasan pembatalan wajib diisi/.test(badan('bri_batal')));

  const bList = badan('bri_list');
  T('jumlah baris dihitung SEBELUM LIMIT',
    bList.indexOf('SELECT COUNT(*)') < bList.indexOf('LIMIT'));

  /* ---- DANA MASUK DI LUAR RESERVASI (19 Sep 2026 sore) ---- */
  const bTambah = badan('bri_tambah');
  T('bri_tambah ada', !!bTambah);
  /* Baris dana masuk tanpa sebab tidak bisa diperiksa siapa pun, dan ia jadi
     tempat paling mudah menyembunyikan uang yang sebenarnya belum
     dicocokkan. Ditegakkan di SERVER, bukan cuma di layar. */
  /* Diperiksa dengan indexOf, bukan regex: polanya penuh `$`, `[]`, dan `(`
     yang tiap-tiapnya berarti sesuatu di regex, dan pola yang escape-nya
     meleset diam-diam berhenti cocok — asersinya lalu merah untuk kode yang
     benar, atau (lebih buruk) hijau untuk kode yang rusak. */
  T('keterangan WAJIB di server, bukan cuma di layar',
    bTambah.indexOf("$ket === '')") >= 0 && bTambah.indexOf("$kurang[] = 'Keterangan'") >= 0,
    bTambah.slice(0, 40));
  T('tanggal & nominal juga wajib',
    bTambah.indexOf("$kurang[] = 'Tanggal'") >= 0 && bTambah.indexOf("$kurang[] = 'Nominal'") >= 0);
  /* Langsung bertanda bukan: yang menambahkannya melakukannya JUSTRU karena
     uang itu di luar reservasi. Tanpa ini barisnya menggantung di daftar
     "belum dicocokkan" dan menuntut tombol kedua untuk menyatakan hal yang
     sudah dinyatakan formulirnya sendiri. */
  T('baris manual ditandai sumber=manual & cara=bukan',
    /'manual','bukan'/.test(bTambah));
  /* SIDIKNYA DIBEDAKAN. Tanpa awalan, dana masuk manual yang kebetulan
     setanggal, sejam, dan senominal dengan satu baris di berkas Excel akan
     MENIMPA baris itu lewat kunci unik — mutasi banknya hilang tanpa satu
     pun galat. */
  T('sidik baris manual dibedakan dari sidik unggahan',
    bTambah.indexOf("'m|' . bri_sidik(") >= 0);
  /* CREATE TABLE IF NOT EXISTS tidak pernah menyentuh tabel yang sudah ada,
     jadi kolom baru cuma lahir di pemasangan baru sementara server yang
     sudah hidup tertinggal tanpa satu pun galat. */
  const BT = String.fromCharCode(96);   // backtick, supaya polanya tetap terbaca
  T('kolom sumber lahir lewat ALTER TABLE, bukan cuma CREATE TABLE',
    lib.indexOf('function bri_pastikan_kolom') >= 0
    && lib.indexOf('ALTER TABLE ' + BT + 'bri_mutasi' + BT + ' ADD COLUMN') >= 0);
  T('bri_pastikan memanggil pemastian kolomnya',
    badan('bri_pastikan').indexOf('bri_pastikan_kolom($pdo);') >= 0);
  /* Bawaannya unggah: itulah satu-satunya bentuk yang mungkin sebelum baris
     manual lahir. Dianggap manual, seluruh baris hasil unggah berpindah ke
     kelompok "di luar reservasi" tanpa satu pun galat. */
  T('bawaan kolom sumber = unggah',
    lib.indexOf("'sumber' => \"VARCHAR(12) NOT NULL DEFAULT 'unggah'\"") >= 0);
  T('bri_list memulangkan sumber', bList.indexOf("'sumber' => (string)") >= 0);

  /* ROUTING. briList terbuka (aksi baca), tiga aksi tulis berpagar sesi. */
  T('briList ada di router', /\$action === 'briList'/.test(api));
  T('aksi tulis BRI berpagar sesi',
    /\$action === 'briUnggah' \|\| \$action === 'briCocok' \|\| \$action === 'briBatal'/.test(api)
    && /sesi_user\(\$body\)/.test(api));
  /* briTambah WAJIB ikut di blok BERPAGAR itu, bukan berdiri sebagai cabang
     sendiri: nama yang tercatat sebagai penambah dana masuk diambil server
     dari sesi yang sudah diverifikasi, dan cabang terbuka membuat siapa pun
     bisa menambah baris dana masuk atas nama siapa pun. */
  T('briTambah ikut di blok berpagar sesi, bukan cabang terbuka sendiri',
    api.indexOf("|| $action === 'briTambah') {") >= 0);
  const blokTulis = api.slice(api.indexOf("\$action === 'briUnggah'"));
  T('kuncinya cashier ATAU finance',
    /sesi_punya_modul\(\$u, 'cashier'\) && !sesi_punya_modul\(\$u, 'finance'\)/.test(blokTulis));
  /* Nama yang tercatat diambil dari SESI, bukan dari badan permintaan — nama
     yang dikirim layar bisa diketik siapa saja. */
  T('nama pencatat diambil dari sesi, bukan dari body',
    /\$nama = isset\(\$u\['name'\]\)/.test(blokTulis) && !/\$body\['oleh'\]/.test(blokTulis));
}

/* ============ 4. TUAN RUMAH ============ */
function ujiTuanRumah() {
  console.log('\n[8] Pemasangan di dua tuan rumah');
  const cas = fs.readFileSync(path.join(AKAR, 'deploy/cashier/index.html'), 'utf8');
  const kas = fs.readFileSync(path.join(AKAR, 'deploy/finance/kas/index.html'), 'utf8');

  for (const [nama, h, pfx] of [['cashier', cas, '../'], ['finance/kas', kas, '../../']]) {
    T(nama + ': memuat xlsx-baca.js', h.indexOf('src="' + pfx + 'assets/xlsx-baca.js"') >= 0);
    T(nama + ': memuat cocok-bri.js', h.indexOf('src="' + pfx + 'assets/cocok-bri.js"') >= 0);
    /* URUTANNYA MENENTUKAN: cocok-bri.js memakai bacaBerkasLembar(). */
    T(nama + ': xlsx-baca dimuat SEBELUM cocok-bri',
      h.indexOf('assets/xlsx-baca.js') < h.indexOf('assets/cocok-bri.js'));
    /* TITLES adalah yang benar-benar mengunci halaman: render() menjatuhkan
       view yang tidak punya judul. Halaman yang punya menu tapi tidak punya
       judul MEMANTUL BALIK tanpa satu pun galat — pelajaran modul DW. */
    T(nama + ': bri punya baris di TITLES', /bri:\['Pencocokan QRIS BRI'/.test(h));
    /* SIDEBAR-NYA HTML STATIS di kedua modul. Menambah TITLES saja TIDAK
       melahirkan menunya — sudah menggigit di tab Void modul Analytics. */
    T(nama + ': bri punya <a data-view> di sidebar', h.indexOf('data-view="bri"') >= 0);
    T(nama + ': menunya punya tulisan yang terbaca', /data-view="bri"[\s\S]{0,400}?Pencocokan QRIS BRI/.test(h));
    T(nama + ': bri ada di peta router', /bri:viewBri/.test(h));
    /* Mesin yang tidak termuat WAJIB DIKATAKAN — kalau tidak ia
       ReferenceError yang menyebut nama fungsi, dan yang membacanya akan
       menyangka datanya yang hilang. */
    T(nama + ': ketiadaan mesin dikatakan', /Mesin pencocokan tidak termuat/.test(h));
    T(nama + ': tidak menyalin rumus pencocokan',
      !/function cbUsulan|function cbUraiLembar|const BABAK/.test(h));
  }
  /* JALUR RESERVASI: panel Kas dua tingkat di dalam deploy/, jadi `../../`.
     Yang kurang satu tingkat tidak melempar — ia memulangkan 404 server. */
  T('cashier memakai ../reservasi-api-mysql', cas.indexOf("rsvUrl:'../reservasi-api-mysql/api.php'") >= 0);
  T('finance/kas memakai ../../reservasi-api-mysql', kas.indexOf("rsvUrl:'../../reservasi-api-mysql/api.php'") >= 0);
  /* Token sesi WAJIB ikut dibaca: endpoint tulisnya berpagar. Tanpa ini
     kirimannya ditolak "sesi tidak dikenal" walau orangnya jelas login. */
  T('cashier bacaSesi membawa token', /token:s\.token/.test(cas));
  T('finance/kas bacaSesi membawa token', /token:s\.token/.test(kas));
  /* Halaman ini PUNYA isian, jadi "Ubah" berarti sesuatu — tanpa baris ini
     matriksnya menjepitnya ke Lihat dan tidak seorang pun bisa mengunggah. */
  T('finance/kas: bri ada di AKS_HAL_ISI', /'rekap','bri','invoice'/.test(kas));
  T('finance/kas: bri punya baris DEFAULT_PERMS', /bri\s+:\{staf:PERM_EDIT/.test(kas));
  T('finance/kas: mesin diberi bolehUbah yang sungguhan', /bolehUbah:\(\)=>bolehUbah\('bri'\)/.test(kas));

  /* GAYA DIKURUNG #cb-wrap. Ditulis global, .card/.stat/.seg/th/td di dua
     puluhan halaman lain kedua modul ikut bergeser. Komentar dibuang dulu:
     penjelasan di atas aturannya menyebut nama kelas apa adanya, dan
     pemindai yang merah untuk komentar akan dimatikan orang berikutnya. */
  const mGaya = srcCb.match(/const GAYA = `([\s\S]*?)`;/);
  T('blok GAYA ketemu', !!mGaya);
  if (mGaya) {
    const baris = mGaya[1].split('\n')
      .map(b => b.replace(/\/\*[\s\S]*?\*\//g, '').trim())
      .filter(b => b && !b.startsWith('/*') && !b.startsWith('*'))
      .filter(b => /\{/.test(b));
    const nakal = baris.filter(b => b.indexOf('#cb-wrap') !== 0);
    T('seluruh aturan CSS dikurung #cb-wrap', nakal.length === 0, nakal.slice(0, 3).join(' | '));
    /* Kurungan menaikkan kekhususan SELURUH aturannya di atas milik tuan
       rumah, jadi keadaan aktif saklar WAJIB ikut ditulis di dalamnya —
       kalau tidak, tombol yang sedang dipilih berhuruf putih di atas latar
       terang. Sudah kejadian di #pk-wrap, 18 September 2026. */
    T('keadaan aktif saklar ikut dikurung',
      /#cb-wrap \.cb-seg button\.on/.test(mGaya[1]) && /button\.active/.test(mGaya[1]));
  }
  /* Aset MANDIRI: pemformatnya sendiri, tidak menumpang nama tuan rumah.
     Yang menumpang akan memformat BERBEDA di tiap modul tanpa satu pun
     galat. */
  T('aset punya pemformat sendiri', /const CB_RP =/.test(srcCb) && /const CB_NUM =/.test(srcCb));
  T('seluruh isi aset di dalam SATU IIFE',
    /^\s*\(function \(G\) \{/m.test(srcCb) && /\}\)\(window\);\s*$/.test(srcCb));
}

/* ============ JALAN ============ */
(async () => {
  await ujiHalaman();
  await ujiBerkasAsli();
  ujiPhp();
  ujiTuanRumah();
  console.log('\n' + '='.repeat(56));
  console.log('  OK: ' + ok + '   GAGAL: ' + gagal + '   LEWAT: ' + lewat);
  console.log('='.repeat(56));
  if (gagal) process.exit(1);
})();
