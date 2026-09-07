/* UJI: Open Bill ikut diakui untuk PIC, di KEDUA layar
 *
 *   node tools/uji-openbill-performa.js
 *
 * Keluhan user 5 September 2026: "yang diakui PIC include Open Bill, tapi di
 * Performa tidak include".
 *
 * porsiPic() adalah BERKAS KEMBAR — ada di deploy/finance/omset/ (kolom
 * "Diakui PIC" di Breakdown) dan di deploy/finance/kas/ (Realisasi di
 * Performa). Open Bill lahir 11 Agustus 2026 dan salinan di omset ikut
 * diperbarui; salinan di kas tidak. Sejak itu satu baris yang sama punya dua
 * angka:
 *
 *   Breakdown : 6.977.200 + 697.720 + 348.860 + 433.550 = 8.457.330
 *   Performa  : 6.977.200 + 697.720 + 348.860           = 8.023.780
 *
 * Selisih Rp433.550 tidak muncul sebagai galat di layar mana pun — cuma
 * sebagai realisasi yang lebih kecil daripada yang dijanjikan halaman
 * sebelah, dengan dua angka yang sama-sama kelihatan wajar.
 *
 * Uji ini MEMBANDINGKAN KEDUA BERKAS, bukan menyalin rumusnya: keduanya
 * dipotong dari sumbernya lalu diberi baris yang sama, dan hasilnya wajib
 * sama persis. Itu satu-satunya pemeriksaan yang tidak bisa basi sendiri.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OMSET = path.join(ROOT, 'deploy', 'finance', 'omset', 'index.html');
const KAS = path.join(ROOT, 'deploy', 'finance', 'kas', 'index.html');
/* BERKAS KEMBAR KETIGA (7 September 2026). Sampai tanggal ini uji ini cuma
   membandingkan omset vs kas, dan modul Cashier — yang memajang Performa
   Kasir dari rumus yang sama — tidak pernah ikut diperiksa. Akibatnya ia
   tertinggal DUA perbaikan berturut-turut tanpa satu pun galat:

     7 Agustus 2026  : section event berhenti memotong kasir (potonganHari)
     5 September 2026: baris yang memang tidak memotong disaring
                       (potongKasirAktif di barisTanpaShift)

   Dilaporkan user 7 September 2026: Performa Kasir di Cashier memajang
   "13 hari punya baris event yang belum ditentukan kasir shift-nya" untuk
   baris yang justru berbunyi "Tidak ada potongan kasir", sementara panel
   Finance untuk bulan yang sama menyebut SATU hari.

   Dua berkas yang dibandingkan tidak menangkap berkas ketiga yang tertinggal.
   Itu pelajarannya, dan itulah kenapa yang dibandingkan sekarang KETIGANYA. */
const CASHIER = path.join(ROOT, 'deploy', 'cashier', 'index.html');

let ok = 0, gagal = 0;
function cek(nama, syarat, ket) {
  if (syarat) { ok++; console.log('  OK   ' + nama); }
  else { gagal++; console.log('  GAGAL ' + nama + (ket ? '\n         -> ' + ket : '')); }
}

/* Ketiga fungsinya dipotong dari sumbernya, bukan disalin — supaya ujinya
   ikut basi kalau rumusnya berubah. Batasnya kurung tutup di kolom nol,
   bentuk yang dipakai kedua berkas untuk fungsi tingkat atas. */
function potong(src, tanda) {
  const i = src.indexOf(tanda);
  if (i < 0) throw new Error(tanda + ' tidak ketemu');
  const j = src.indexOf('\n}', i);
  if (j < 0) throw new Error(tanda + ' tidak punya penutup');
  return src.slice(i, j + 2);
}
/* num() ikut dipotong: kedua berkas punya versinya sendiri, dan yang
   membedakan hasil bisa saja justru di sana (mis. cara membuang pemisah
   ribuan), bukan di porsiPic(). Ia ditulis sebagai arrow SATU BARIS di
   kedua berkas, jadi batasnya akhir baris — bukan kurung tutup di kolom
   nol seperti fungsi lain. */
function potongBaris(src, tanda) {
  const i = src.indexOf(tanda);
  if (i < 0) throw new Error(tanda + ' tidak ketemu');
  const j = src.indexOf('\n', i);
  return src.slice(i, j);
}
/* obAktif/obTotal/porsiPic di deploy/finance/kas/ SUDAH TIDAK punya badan
   sendiri sejak 7 September 2026 — ketiganya mendelegasikan ke
   deploy/assets/performa-bonus.js supaya modul Marketing & Event menghitung
   realisasi dengan rumus yang sama. Jadi yang disuntikkan di sini adalah
   IMPLEMENTASI ASETNYA, dan uji ini tetap membandingkan dua rumus yang
   sungguhan berbeda letaknya: aset vs deploy/finance/omset/.

   Berkas yang masih punya badannya sendiri (omset, cashier) tetap dipakai apa
   adanya — kalau delegasinya suatu hari dilepas lagi, potong() akan menemukan
   badan aslinya dan perbandingannya tetap sah. */
const ASET_PB = fs.readFileSync(path.join(ROOT, 'deploy', 'assets', 'performa-bonus.js'), 'utf8');
function rumusOb(src) {
  if (src.indexOf('function obTotal(r){ return pbObTotal(r); }') < 0) {
    return potong(src, 'function obAktif(') + '\n' + potong(src, 'function obTotal(')
         + '\n' + potong(src, 'function porsiPic(');
  }
  return potongBaris(ASET_PB, 'function pbObAktif(')
       + '\n' + potongBaris(ASET_PB, 'function pbObTotal(')
       + '\n' + potong(ASET_PB, 'function pbPorsiPic(')
       + '\nconst PB_NUM=num;'
       + '\nfunction obAktif(r){ return pbObAktif(r); }'
       + '\nfunction obTotal(r){ return pbObTotal(r); }'
       + '\nfunction porsiPic(r,d){ return pbPorsiPic(r,d); }';
}
function rumus(src) {
  const kode = potongBaris(src, 'const num=')
             + '\n' + rumusOb(src)
             /* Ketiganya ditulis SATU BARIS di kedua berkas — potong() yang
                mencari kurung tutup di kolom nol akan menelan tetangganya. */
             + '\n' + potongBaris(src, 'function menuFixRow(')
             + '\n' + potongBaris(src, 'function payGroupRow(')
             + '\n' + potong(src, 'function potongKasirAktif(')
             + '\n' + potong(src, 'function potonganBaris(')
             + '\n' + potong(src, 'function potonganHari(')
             + '\n' + potong(src, 'function barisTanpaShift(')
             /* potongKasir() ada di omset & kas, TIDAK di cashier — modul itu
                menghitung potongan lewat potonganHari(). Dibuat opsional
                supaya ketiadaannya tidak menghentikan perbandingan yang
                justru jadi inti uji ini. */
             + (src.indexOf('function potongKasir(') > -1
                 ? '\n' + potongBaris(src, 'function potongKasir(')
                 : '\nfunction potongKasir(r){ return potongKasirAktif(r) ? num(r.amount) : 0; }')
             + '\nreturn { porsiPic: porsiPic, obTotal: obTotal, potongKasir: potongKasir,'
             + '\n  potongKasirAktif: potongKasirAktif, potonganBaris: potonganBaris,'
             + '\n  potonganHari: potonganHari, barisTanpaShift: barisTanpaShift };';
  return new Function(kode)();
}

console.log('=== UJI OPEN BILL -> PERFORMA ===\n');

const srcOmset = fs.readFileSync(OMSET, 'utf8');
const srcKas = fs.readFileSync(KAS, 'utf8');
const srcCashier = fs.readFileSync(CASHIER, 'utf8');

console.log('== Ketiga rumus harus memulangkan angka yang sama ==');
let a, b, c;
try {
  a = rumus(srcOmset);
  b = rumus(srcKas);
  c = rumus(srcCashier);
  cek('rumusnya ada di KETIGA berkas', true);
} catch (e) {
  cek('rumusnya ada di KETIGA berkas', false, e.message);
  console.log('\n---------------------------------------');
  console.log('  OK: ' + ok + '   GAGAL: ' + gagal);
  process.exit(1);
}

/* Baris persis dari layar user 5 September 2026 — HIROLYMPICS, Gathering
   Internal Tim Indosat, 5 Agustus 2026. Angkanya ditulis apa adanya supaya
   yang membaca uji ini bisa mencocokkannya dengan tangkapan layarnya. */
const BARIS = {
  amount: 6977200, tax: 697720, service: 348860,
  ob: true, obAmount: 377000, obTax: 18850, obService: 37700
};
const TANPA_OB = { amount: 6977200, tax: 697720, service: 348860 };

cek('Open Bill terhitung 433.550', a.obTotal(BARIS) === 433550, String(a.obTotal(BARIS)));
cek('...dan kas menghitungnya sama', b.obTotal(BARIS) === 433550, String(b.obTotal(BARIS)));

const mkA = a.porsiPic(BARIS, 'marketing'), mkB = b.porsiPic(BARIS, 'marketing');
cek('Breakdown mengakui 8.457.330 untuk baris marketing', mkA === 8457330, String(mkA));
/* INTI: inilah angka yang dulu 8.023.780 — Rp433.550 lebih kecil, tanpa satu
   pun tanda di layar. */
cek('Performa mengakui angka yang SAMA', mkB === mkA,
    'omset=' + mkA + ' vs kas=' + mkB + ' — dua rumus untuk satu angka');

const evA = a.porsiPic(BARIS, 'event'), evB = b.porsiPic(BARIS, 'event');
cek('baris event: Open Bill ikut PENUH di atas separuh omsetnya',
    evA === Math.round(6977200 / 2) + 433550, String(evA));
cek('...dan kedua berkas sepakat', evB === evA, evA + ' vs ' + evB);

/* Baris tanpa Open Bill tidak boleh berubah angkanya. Kalau berubah, seluruh
   realisasi lama bergeser diam-diam gara-gara perbaikan ini. */
cek('baris TANPA Open Bill tetap omset+tax+service',
    a.porsiPic(TANPA_OB, 'marketing') === 8023780 &&
    b.porsiPic(TANPA_OB, 'marketing') === 8023780,
    a.porsiPic(TANPA_OB, 'marketing') + ' / ' + b.porsiPic(TANPA_OB, 'marketing'));
/* Centang Open Bill yang dimatikan harus benar-benar mematikannya — nilainya
   masih tersimpan di baris itu, dan membacanya tetap berarti mengakui uang
   yang sudah dibatalkan. */
cek('Open Bill yang dicabut centangnya tidak ikut diakui',
    a.porsiPic(Object.assign({}, BARIS, { ob: false }), 'marketing') === 8023780 &&
    b.porsiPic(Object.assign({}, BARIS, { ob: false }), 'marketing') === 8023780);
cek('baris kosong tidak melempar',
    a.porsiPic({}, 'marketing') === 0 && b.porsiPic({}, 'event') === 0);

console.log('\n== Baris yang TIDAK memotong kasir ==');
/* Dua jalan sebuah baris jadi tidak memotong: marketing menandainya "menu
   dipilih di tempat", atau finance mematikan Payment Group. Sampai
   5 September 2026 penjaganya cuma ada di omset — kas memotong terus, jadi
   baris yang di Breakdown berbunyi "Tidak ada potongan kasir" tetap
   mengurangi realisasi kasir di Performa. */
const DITEMPAT = { amount: 5000000, menuFix: 'ditempat', shift: ['k1', 'k2'] };
const BUKAN_PG = { amount: 5000000, payGroup: false, shift: ['k1', 'k2'] };
const NORMAL = { amount: 5000000, menuFix: 'tetap', shift: ['k1', 'k2'] };

cek('menu dipilih di tempat: tidak memotong, di KEDUA berkas',
    a.potonganBaris(DITEMPAT).total === 0 && b.potonganBaris(DITEMPAT).total === 0,
    'omset=' + a.potonganBaris(DITEMPAT).total + ' kas=' + b.potonganBaris(DITEMPAT).total);
cek('Payment Group dimatikan: juga tidak memotong',
    a.potonganBaris(BUKAN_PG).total === 0 && b.potonganBaris(BUKAN_PG).total === 0,
    'omset=' + a.potonganBaris(BUKAN_PG).total + ' kas=' + b.potonganBaris(BUKAN_PG).total);
/* Daftar shift yang terlanjur tersimpan SEBELUM penandanya disetel tidak
   boleh menghidupkan potongannya lagi — itu bentuk data yang paling sering
   ada di produksi, dan justru itu yang dulu lolos. */
cek('...walau daftar shift-nya masih tersimpan di barisnya',
    a.potonganBaris(DITEMPAT).per === 0 && b.potonganBaris(DITEMPAT).per === 0);
cek('baris normal TETAP memotong seperti sebelumnya',
    a.potonganBaris(NORMAL).per === 2500000 && b.potonganBaris(NORMAL).per === 2500000,
    'omset=' + a.potonganBaris(NORMAL).per + ' kas=' + b.potonganBaris(NORMAL).per);

/* Peringatan "belum ditentukan kasir shift-nya" tidak boleh menghitung baris
   yang memang tidak punya potongan — peringatan yang menuntut orang mengatur
   sesuatu yang tidak ada berhenti dibaca, dan ketika suatu hari ada yang
   benar-benar terlewat ia sudah tidak dipercaya siapa pun. */
const HARI = { bd: { marketing: [
  { amount: 5000000, menuFix: 'ditempat' },      // tidak memotong — jangan dihitung
  { amount: 5000000, payGroup: false },          // tidak memotong — jangan dihitung
  { amount: 5000000, menuFix: 'tetap' }          // MEMOTONG dan shift-nya kosong
] } };
cek('peringatan shift hanya menghitung baris yang benar-benar memotong',
    a.barisTanpaShift(HARI).length === 1 && b.barisTanpaShift(HARI).length === 1,
    'omset=' + a.barisTanpaShift(HARI).length + ' kas=' + b.barisTanpaShift(HARI).length);
cek('...dan hari yang semuanya sudah diatur tidak diperingatkan',
    a.barisTanpaShift({ bd: { marketing: [NORMAL] } }).length === 0 &&
    b.barisTanpaShift({ bd: { marketing: [NORMAL] } }).length === 0);

console.log('\n== Yang dijaga di layar Performa ==');
/* Tanpa kolomnya, Omset + Tax + Service tidak berjumlah sama dengan kolom
   Diakui, dan selisih yang tidak bisa dijelaskan dari layar akan dilaporkan
   sebagai salah hitung. */
cek('tabel Daftar Event punya kolom Open Bill',
    srcKas.indexOf("<th class=\"num\">Open Bill</th>") > -1);
/* ...tapi hanya kalau memang ada. Kolom penuh "Rp0" adalah kesalahan yang
   sudah tercatat untuk Tax & Service di section event. */
cek('...hanya digambar kalau ada yang punya', srcKas.indexOf('const adaOb=totOb>0;') > -1);
cek('...dan colspan keadaan kosong ikut menyesuaikan',
    srcKas.indexOf('(mk?6:4)+(adaOb?1:0)') > -1,
    'baris "Belum ada event" akan melenceng satu kolom');
/* Baris event dirakit di pbAgregasi() milik deploy/assets/performa-bonus.js
   sejak 7 September 2026, bukan lagi inline di viewPerforma — modul Marketing &
   Event memakai perakit yang sama. Yang diperiksa tetap hal yang sama: tiap
   baris membawa nilai Open Bill-nya sendiri, kalau tidak kolomnya di layar
   selalu kosong sementara totalnya tetap memperhitungkannya. */
cek('barisnya membawa nilai Open Bill-nya sendiri',
    ASET_PB.indexOf('ob:pbObTotal(r)') > -1 || srcKas.indexOf('ob:obTotal(r)') > -1);
cek('...dan yang merakitnya cuma SATU tempat',
    (ASET_PB.indexOf('ob:pbObTotal(r)') > -1) !== (srcKas.indexOf('ob:obTotal(r)') > -1),
    'dirakit di dua tempat sekaligus — salah satunya akan tertinggal');
cek('keterangan tabel menyebut Open Bill tidak dipotong dari kasir',
    srcKas.indexOf('tidak dipotong dari kasir mana pun') > -1);

/* Open Bill TIDAK boleh masuk potongan kasir — uangnya sudah ada di omset
   bruto kasir hari itu. Menambahkannya berarti memotong kasir dua kali.
   Diperiksa dari HASILNYA, bukan dari bunyi kodenya: yang tidak boleh berubah
   adalah angkanya. */
const OB_SHIFT = Object.assign({ menuFix: 'tetap', shift: ['k1'] }, BARIS);
cek('potongan kasir TIDAK menyentuh Open Bill',
    a.potonganBaris(OB_SHIFT).total === 6977200 &&
    b.potonganBaris(OB_SHIFT).total === 6977200,
    'omset=' + a.potonganBaris(OB_SHIFT).total + ' kas=' + b.potonganBaris(OB_SHIFT).total
      + ' — kasir dipotong untuk uang yang sudah masuk omset brutonya');
/* Tax & service juga di luar potongan: omset kasir di Section A itu angka NET,
   jadi memotong tax & service dari sana mengurangi realisasi kasir dengan uang
   yang tidak pernah jadi omsetnya. */
cek('...maupun tax & service',
    a.potonganBaris(OB_SHIFT).total === 6977200 &&
    b.potonganBaris(OB_SHIFT).total === 6977200);

/* Komentar yang salah lebih berbahaya daripada tidak ada komentar: yang
   membacanya berhenti memeriksa, dan itu yang membuat kas tertinggal. */
cek('komentar di omset tidak lagi menjanjikan Performa Kasir yang tidak ada',
    srcOmset.indexOf('muncul di kartu Efek ke Realisasi Kasir dan di\n   Performa Kasir') < 0 &&
    srcOmset.indexOf('muncul di kartu Efek ke Realisasi Kasir dan di\r\n   Performa Kasir') < 0);
cek('...dan menyebut kas sebagai berkas kembarnya',
    srcOmset.indexOf('BERKAS KEMBAR: porsiPic() di deploy/finance/kas/') > -1);

/* ================== KETIGA BERKAS KEMBAR HARUS SEPAKAT ==================

   Bagian ini yang akan menangkap berkas kembar berikutnya yang tertinggal.
   Datanya dipilih supaya tiap aturan punya tempat untuk gagal sendiri-
   sendiri, bukan satu kasus yang menutupi semuanya. */
console.log('\n== Ketiga berkas kembar sepakat ==');

/* Baris marketing yang menunya DIPILIH DI TEMPAT: omsetnya tetap milik kasir,
   jadi tidak ada potongan sama sekali — dan karena tidak ada potongan, ia
   TIDAK boleh dihitung sebagai "belum diatur kasir shift-nya". Persis baris
   yang ada di tangkapan layar user 7 September 2026. */
const K3_DITEMPAT = { menuFix:'ditempat', amount:4059060, tax:405907, service:202953, shift:[] };
/* Baris marketing biasa yang shift-nya memang belum diisi — ini yang MEMANG
   harus diperingatkan. Tanpa kasus ini, saringan yang terlalu rakus (mis.
   membuang semua baris) akan lolos tanpa ketahuan. */
const K3_PERLU_SHIFT = { amount: 5000000, tax: 500000, service: 250000, shift: [] };

[['omset', a], ['kas', b], ['cashier', c]].forEach(([nama, m]) => {
  cek(nama + ': baris "dipilih di tempat" tidak memotong kasir',
      m.potongKasirAktif(K3_DITEMPAT) === false);
  cek(nama + ': ...jadi tidak dihitung sebagai belum-diatur',
      m.barisTanpaShift({ bd:{ marketing:[K3_DITEMPAT], event:[] } }).length === 0,
      'inilah yang membuat Cashier memajang 13 hari sementara Finance 1 hari');
  cek(nama + ': baris biasa tanpa shift TETAP diperingatkan',
      m.barisTanpaShift({ bd:{ marketing:[K3_PERLU_SHIFT], event:[] } }).length === 1,
      'saringannya terlalu rakus — yang memang perlu diatur ikut hilang');
});

/* SECTION EVENT TIDAK MEMOTONG KASIR sejak 7 Agustus 2026. Barisnya sengaja
   diberi `shift` yang TERLANJUR TERSIMPAN — itulah bentuk data yang ada di
   produksi, dan satu-satunya yang bisa menghidupkan kembali potongan yang
   sudah dihapus. Modul Cashier melakukannya selama sebulan penuh. */
const K3_HARI_EVENT = { bd:{ marketing:[], event:[
  { amount: 8000000, tax: 800000, service: 400000, shift:['k1','k2'] } ] } };
[['omset', a], ['kas', b], ['cashier', c]].forEach(([nama, m]) => {
  cek(nama + ': baris di section EVENT tidak memotong kasir mana pun',
      m.potonganHari(K3_HARI_EVENT, 'k1') === 0,
      'nilainya ' + m.potonganHari(K3_HARI_EVENT, 'k1') + ' — potongan yang sudah dihapus hidup lagi');
  cek(nama + ': ...dan tidak ikut dihitung sebagai belum-diatur',
      m.barisTanpaShift(K3_HARI_EVENT).length === 0);
});

/* Baris marketing yang shift-nya SUDAH diisi memang membagi potongan. Tanpa
   kasus ini, potonganHari() yang selalu memulangkan nol akan lolos. */
const K3_HARI_MK = { bd:{ marketing:[
  { amount: 6000000, tax: 0, service: 0, shift:['k1','k2'] } ], event:[] } };
const k3Nilai = [['omset', a], ['kas', b], ['cashier', c]].map(([nama, m]) => {
  const v = m.potonganHari(K3_HARI_MK, 'k1');
  cek(nama + ': baris marketing ber-shift TETAP membagi potongan', v > 0, String(v));
  return v;
});
cek('ketiganya memulangkan potongan yang SAMA PERSIS',
    k3Nilai[0] === k3Nilai[1] && k3Nilai[1] === k3Nilai[2],
    'omset ' + k3Nilai[0] + ' · kas ' + k3Nilai[1] + ' · cashier ' + k3Nilai[2]);

/* ============ porsiPic: DUA SEPAKAT, SATU BERBEDA ============

   Omset & kas sepakat; cashier memulangkan angka lain, dan bedanya BUKAN
   kelalaian sesaat melainkan versi yang tertinggal jauh:

     omset & kas : amount + tax + service + obTotal
     cashier     : r.tiket ? amount × PORSI_PIC_TIKET : amount

   `PORSI_PIC_TIKET` dan cabang `r.tiket` sudah DIBUANG dari kedua berkas
   lain — di cashier keduanya masih hidup. Untuk baris di layar user 5
   September 2026 selisihnya Rp1.480.130 (tax 697.720 + service 348.860 +
   Open Bill 433.550).

   INI TIDAK DISAMAKAN BEGITU SAJA, dan itu disengaja. porsiPic() dipakai
   potonganBaris() sebagai besar POTONGAN ke kasir shift, jadi menyamakannya
   MENGUBAH ANGKA UANG yang sudah berjalan — dan komentar di kedua sisi
   saling bertentangan tentang boleh-tidaknya Open Bill masuk ke sana:

     cashier : "TIDAK BOLEH masuk ke porsiPic() — akan memotong kasir untuk
                uang yang justru sengaja tidak dipotong"
     omset   : potonganBaris() memakai porsiPic() yang SUDAH memuat obTotal

   Yang benar adalah keputusan tentang uang, bukan tentang kode, jadi ia
   dilaporkan ke user (7 September 2026) dan menunggu jawabannya.

   Sementara itu nilainya DIKUNCI di sini. Uji yang cuma melewat akan
   membiarkan perbedaan ini terlupakan; uji yang memaksa sama akan menuntut
   perubahan uang yang belum diputuskan siapa pun. Yang dikunci akan berbunyi
   begitu ada yang menyentuhnya — ke arah mana pun. */
const k3Pp = [a.porsiPic(BARIS), b.porsiPic(BARIS), c.porsiPic(BARIS)];
cek('porsiPic omset & kas tetap sepakat', k3Pp[0] === k3Pp[1],
    'omset ' + k3Pp[0] + ' · kas ' + k3Pp[1]);
cek('porsiPic cashier MASIH versi lama (menunggu keputusan user)',
    k3Pp[2] === 6977200 && k3Pp[0] === 8457330,
    'omset ' + k3Pp[0] + ' · cashier ' + k3Pp[2]
    + ' — kalau salah satunya sudah diputuskan & diubah, PERBARUI uji ini');
cek('PORSI_PIC_TIKET memang cuma tersisa di cashier',
    srcOmset.indexOf('PORSI_PIC_TIKET') < 0 && srcKas.indexOf('PORSI_PIC_TIKET') < 0
    && srcCashier.indexOf('PORSI_PIC_TIKET') > -1);

console.log('\n---------------------------------------');
console.log('  OK: ' + ok + '   GAGAL: ' + gagal);
process.exit(gagal ? 1 : 0);
