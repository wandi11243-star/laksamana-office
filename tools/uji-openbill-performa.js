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
function rumus(src) {
  const kode = potongBaris(src, 'const num=')
             + '\n' + potong(src, 'function obAktif(')
             + '\n' + potong(src, 'function obTotal(')
             + '\n' + potong(src, 'function porsiPic(')
             /* Ketiganya ditulis SATU BARIS di kedua berkas — potong() yang
                mencari kurung tutup di kolom nol akan menelan tetangganya. */
             + '\n' + potongBaris(src, 'function menuFixRow(')
             + '\n' + potongBaris(src, 'function payGroupRow(')
             + '\n' + potongBaris(src, 'function potongKasir(')
             + '\n' + potong(src, 'function potongKasirAktif(')
             + '\n' + potong(src, 'function potonganBaris(')
             + '\n' + potong(src, 'function barisTanpaShift(')
             + '\nreturn { porsiPic: porsiPic, obTotal: obTotal,'
             + '\n  potongKasirAktif: potongKasirAktif, potonganBaris: potonganBaris,'
             + '\n  barisTanpaShift: barisTanpaShift };';
  return new Function(kode)();
}

console.log('=== UJI OPEN BILL -> PERFORMA ===\n');

const srcOmset = fs.readFileSync(OMSET, 'utf8');
const srcKas = fs.readFileSync(KAS, 'utf8');

console.log('== Kedua rumus harus memulangkan angka yang sama ==');
let a, b;
try {
  a = rumus(srcOmset);
  b = rumus(srcKas);
  cek('porsiPic & obTotal ada di KEDUA berkas', true);
} catch (e) {
  cek('porsiPic & obTotal ada di KEDUA berkas', false, e.message);
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
cek('barisnya membawa nilai Open Bill-nya sendiri',
    srcKas.indexOf('ob:obTotal(r)') > -1);
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

console.log('\n---------------------------------------');
console.log('  OK: ' + ok + '   GAGAL: ' + gagal);
process.exit(gagal ? 1 : 0);
