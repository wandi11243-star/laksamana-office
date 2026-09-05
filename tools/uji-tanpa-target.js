/* UJI: konsep TARGET benar-benar dicabut dari Finance & Cashier
 *
 *   node tools/uji-tanpa-target.js
 *
 * Permintaan user 5 September 2026: "Target bulanan dan pengaturan target di
 * modul finance, dan cashier tidak perlu ada". Yang dicabut DUA-DUANYA —
 * target perusahaan (settings.companyMonthlyTarget) dan target per PIC
 * (employees[].target).
 *
 * Pencabutan seperti ini gagal dengan cara yang khas: satu rujukan tertinggal,
 * fungsinya sudah tidak ada, dan halamannya jatuh dengan ReferenceError yang
 * gejalanya LAYAR PUTIH — tanpa satu kata pun yang menyebut target. Karena itu
 * yang dijaga di sini bukan "sudah hilang dari layar", tapi hilang di SEMUA
 * tempat: menu, matriks hak akses, judul halaman, peta router, rumusnya, dan
 * kedua laporan (WhatsApp & PDF).
 *
 * Yang TIDAK boleh ikut hilang, dan itu sama pentingnya: Bonus Kasir. Tangga
 * bonusnya dihitung dari omset yang DIAKUI, bukan dari pencapaian target.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const KAS = path.join(ROOT, 'deploy', 'finance', 'kas', 'index.html');
const CASHIER = path.join(ROOT, 'deploy', 'cashier', 'index.html');
const OMSET = path.join(ROOT, 'deploy', 'finance', 'omset', 'index.html');

let ok = 0, gagal = 0;
function cek(nama, syarat, ket) {
  if (syarat) { ok++; console.log('  OK   ' + nama); }
  else { gagal++; console.log('  GAGAL ' + nama + (ket ? '\n         -> ' + ket : '')); }
}
const kas = fs.readFileSync(KAS, 'utf8');
const cashier = fs.readFileSync(CASHIER, 'utf8');
const omset = fs.readFileSync(OMSET, 'utf8');

/* Komentar yang MENJELASKAN pencabutan justru menyebut nama fungsinya dan nama
   halamannya, dan itu memang harus boleh — sejarah kenapa sesuatu dicabut
   adalah hal yang paling mahal kalau hilang. Yang dicari di sini PEMAKAIAN,
   bukan penyebutan: komentar JS, komentar HTML, dan komentar satu baris
   dibuang dulu. */
function dipakai(src, nama) {
  const kode = src.replace(/<!--[\s\S]*?-->/g, '')
                  .replace(/\/\*[\s\S]*?\*\//g, '')
                  .replace(/^\s*\/\/.*$/gm, '');
  return kode.indexOf(nama) > -1;
}

console.log('=== UJI TANPA TARGET (Finance & Cashier) ===\n');

console.log('== Halaman Pengaturan Target (deploy/finance/kas) ==');
cek('menu sidebar sudah tidak punya Pengaturan Target',
    kas.indexOf('data-view="target"') < 0);
cek('viewTarget / divCardTarget / simpanTarget ikut dibuang',
    !dipakai(kas, 'function viewTarget(') &&
    !dipakai(kas, 'function divCardTarget(') &&
    !dipakai(kas, 'function simpanTarget('));
cek('peta router tidak lagi menunjuknya',
    kas.indexOf('target:viewTarget') < 0,
    'router memanggil fungsi yang sudah tidak ada — TypeError, layar putih');
/* TITLES-lah yang benar-benar mengunci halamannya: render() menjatuhkan view
   yang tidak punya judul. */
cek('judulnya dicabut, jadi halamannya tidak bisa dicapai lewat go()',
    kas.indexOf("target:['Pengaturan Target'") < 0);
cek('matriks hak akses tidak lagi menyebutnya',
    kas.indexOf('target   :{staf:') < 0);
cek('daftar halaman berisian ikut disesuaikan',
    kas.indexOf("'invoice','akses']") > -1,
    'AKS_HAL_ISI masih memuat halaman yang sudah tidak ada');

console.log('\n== Rumus target dibuang, bukan dibiarkan yatim ==');
/* Fungsi yang tidak dipanggil siapa pun akan dipanggil lagi suatu hari oleh
   orang yang mengira ia masih berarti sesuatu. */
['pembagiHari', 'dailyTarget', 'targetPic', 'targetRentang'].forEach(f => {
  cek(f + '() sudah tidak ada di Kas Kecil', !dipakai(kas, 'function ' + f + '('));
});
['pembagiHari', 'dailyTarget', 'targetPic'].forEach(f => {
  cek(f + '() sudah tidak ada di Cashier', !dipakai(cashier, 'function ' + f + '('));
});
/* Pemanggilan yang tertinggal untuk fungsi yang sudah dibuang adalah
   ReferenceError, dan gejalanya layar putih tanpa menyebut target. */
cek('tidak ada lagi yang MEMANGGIL targetPic()',
    !dipakai(kas, 'targetPic(') && !dipakai(cashier, 'targetPic('));
cek('tidak ada lagi yang MEMANGGIL dailyTarget()',
    !dipakai(kas, 'dailyTarget(') && !dipakai(cashier, 'dailyTarget('));

console.log('\n== Layar yang dulu memajang target ==');
cek('Dashboard Omset tidak lagi punya kartu Achievement',
    kas.indexOf('<div class="lab">Achievement</div>') < 0);
cek('...maupun Harus Dikejar / Surplus',
    kas.indexOf("'Harus Dikejar':'Surplus'") < 0);
cek('...maupun grafik Target vs Actual',
    kas.indexOf('Target vs Actual Harian') < 0 && kas.indexOf("label:'Target'") < 0);
cek('...dan tabel hariannya tinggal tanggal & omset',
    kas.indexOf('<th class="num">Omset (net)</th>') > -1 &&
    kas.indexOf('<th class="num">Ach %</th>') < 0);
cek('Performa Marketing/Event tidak lagi punya Target/Achievement',
    kas.indexOf("<div class=\"lab\">Target ${modeHarian()?'Harian':'Bulanan'}</div>") < 0);
cek('Performa Kasir juga tidak',
    kas.indexOf("<div class=\"lab\">Target ${harian?'Harian':'Bulanan'}</div>") < 0 &&
    cashier.indexOf("<div class=\"lab\">Target ${harian?'Harian':'Bulanan'}</div>") < 0);
/* Grid yang tetap g5 setelah dua kotaknya dicabut menyisakan dua kolom kosong
   di kanan — terbaca sebagai kartu yang gagal dimuat. */
cek('grid ringkas kasir menyusut dari g5 ke g3',
    kas.indexOf('return `<div class="grid g5">') < 0 &&
    cashier.indexOf('return `<div class="grid g5">') < 0);

console.log('\n== Laporan WhatsApp & PDF ==');
/* Laporan yang menyebut angka yang sudah tidak dihitung akan memajang
   "undefined" atau NaN — dan laporan itu dikirim ke luar. */
cek('ringkasan WA tidak lagi menyebut target',
    kas.indexOf('🎯 Target') < 0);
cek('...maupun achievement',
    kas.indexOf('Ach. Bulanan') < 0 && kas.indexOf('Ach. Harian') < 0);
cek('lembar PDF Dashboard tidak lagi memuat KPI target',
    kas.indexOf("['Achievement', r.ach") < 0 && kas.indexOf("fmtRp(r.target)") < 0);
cek('lembar PDF Performa tidak lagi memuat KPI target',
    kas.indexOf("['Achievement', ach.toFixed(1)") < 0 &&
    kas.indexOf('tgtDipakai') < 0);
/* Judul lembar yang menjanjikan achievement padahal isinya realisasi adalah
   janji yang tidak ditepati tiap kali dibuka. */
cek('judul lembarnya ikut berubah jadi Report Realisasi',
    kas.indexOf("lembarKop('Report Realisasi'") > -1);
cek('cetakAchievement tidak lagi menerima tgt & ach',
    kas.indexOf('function cetakAchievement(divi,e,a){') > -1,
    'tanda tangannya masih meminta angka yang tidak pernah dihitung lagi');

console.log('\n== Yang TIDAK boleh ikut hilang ==');
/* Bonus dihitung dari omset yang DIAKUI, bukan dari pencapaian target. */
cek('Bonus Kasir tetap ada di kedua modul',
    dipakai(kas, 'function bonusKasir(') && dipakai(cashier, 'function bonusKasir('));
cek('...dan tangganya masih digambar',
    dipakai(kas, 'function kartuBonusKasir(') && dipakai(cashier, 'function kartuBonusKasir('));
cek('Omset Diakui tetap jadi kotak pertama ringkas kasir',
    kas.indexOf('<div class="lab">Omset Diakui</div>') > -1 &&
    cashier.indexOf('<div class="lab">Omset Diakui</div>') > -1);
/* Data lama sengaja TIDAK dihapus: menghapus angka yang tidak bisa
   dikembalikan demi kerapian layar bukan pertukaran yang baik. */
cek('data target lama tidak ikut dihapus dari settings',
    kas.indexOf('companyMonthlyTarget:300000000') > -1 &&
    cashier.indexOf('companyMonthlyTarget:300000000') > -1,
    'angkanya hilang permanen dan tidak bisa dipulihkan');

console.log('\n== Penunjuk yang tidak boleh menggantung ==');
/* Kalimat yang menyuruh orang ke halaman yang sudah dicabut adalah petunjuk
   yang membuang waktu, dan tidak ada satu pun galat yang menyebutkannya. */
cek('Performa tidak lagi menyuruh ke Pengaturan Target',
    !dipakai(kas, 'Pengaturan Target'),
    'ada kalimat di layar yang menunjuk halaman yang sudah dicabut');
cek('Breakdown Sumber juga tidak',
    !dipakai(omset, 'Pengaturan Target'));
cek('...keduanya menunjuk ke Tim/Keterangan di Office',
    kas.indexOf('Tim/Keterangan') > -1 && omset.indexOf('Tim/Keterangan') > -1);

console.log('\n---------------------------------------');
console.log('  OK: ' + ok + '   GAGAL: ' + gagal);
process.exit(gagal ? 1 : 0);
