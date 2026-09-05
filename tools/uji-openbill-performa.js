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
             + '\nreturn { porsiPic: porsiPic, obTotal: obTotal };';
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
   bruto kasir hari itu. Menambahkannya berarti memotong kasir dua kali. */
cek('potongKasir tetap TIDAK menyentuh Open Bill',
    srcKas.indexOf('function potongKasir(r){ return num(r.amount); }') > -1,
    'kasir dipotong untuk uang yang sudah masuk omset brutonya');

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
