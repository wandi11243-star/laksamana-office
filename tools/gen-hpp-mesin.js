/* gen-hpp-mesin.js — bangkitkan deploy/assets/hpp-mesin.js dari modul HPP
 *
 *   node tools/gen-hpp-mesin.js          # tulis ulang asetnya
 *   node tools/gen-hpp-mesin.js --cek    # keluar 1 kalau asetnya BASI
 *
 * Kenapa DIBANGKITKAN, bukan ditulis tangan (27 September 2026): Menu
 * Kalkulator di modul Marketing perlu modal per porsi prasmanan — angka yang
 * hanya dihitung modul HPP (resep bertingkat, konversi satuan lewat basis
 * Purchasing, spare modal). Menyalinnya tangan berarti DUA rumus untuk satu
 * angka, bentuk kesalahan yang di repo ini sudah berkali-kali muncul sebagai
 * uang yang tertulis beda di dua layar. Di sini fungsinya DIIRIS apa adanya
 * dari deploy/stock/hpp/index.html, dibungkus pabrik yang keadaannya
 * (S, SET, PB, PR, MEMO, PRODUK) milik sendiri — jadi tidak bentrok dengan
 * `S` milik modul tuan rumahnya.
 *
 * SESUDAH MENGUBAH RUMUS MODAL DI MODUL HPP, JALANKAN ALAT INI LAGI.
 * tools/uji-kalkulator-hpp.js menjalankan --cek dan merah kalau lupa.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'deploy/stock/hpp/index.html'), 'utf8').replace(/\r\n/g, '\n');
const TUJUAN = path.join(ROOT, 'deploy/assets/hpp-mesin.js');

/* Satu deklarasi utuh — `function nama(`, `const nama=`, atau `const nama=b=>{`
   — sampai kurung/titik-koma penutupnya. */
function iris(nama) {
  const pola = [new RegExp('^function ' + nama + '\\(', 'm'), new RegExp('^const ' + nama + '\\s*=', 'm')];
  let m = null; for (const p of pola) { m = p.exec(SRC); if (m) break; }
  if (!m) throw new Error('tidak ketemu di modul HPP: ' + nama);
  const i = m.index;
  let d = 0, mulai = false;
  for (let j = i; j < SRC.length; j++) {
    const c = SRC[j];
    if (c === '{') { d++; mulai = true; }
    else if (c === '}') { d--; if (mulai && d === 0) { let k = j + 1; if (SRC[k] === ';') k++; return SRC.slice(i, k); } }
    else if (c === ';' && !mulai && d === 0) return SRC.slice(i, j + 1);
    else if (c === '\n' && !mulai && d === 0 && /^const /.test(SRC.slice(i, i + 6))) {
      /* const satu baris tanpa kurung kurawal (mis. `const low=s=>…;`) sudah
         ditangani cabang ';' di atas; baris ini cuma jaring pengaman. */
    }
  }
  throw new Error('penutup tidak ketemu: ' + nama);
}

const NAMA = ['num', 'low', 'SATUAN_FAM', 'satFam', 'konvFam', 'infoPur', 'purDasar', 'purIsi',
  'keDasarPur', 'dariDasarPur', 'konvSatuan', 'qtySesuai', 'petakan', 'cariResep', 'per1',
  'sisiTersimpan', 'sisiHarga', 'lewatResep', 'modalResep', 'tanpaBahan', 'modalDasar',
  'spareModal', 'kenaSpare', 'modalMenu', 'hargaJual', 'porsiYield', 'modalPorsi', 'cogsOf',
  'prasmananKah'];

function bangkitkan() {
  const isi = NAMA.map(iris).join('\n');
  return '/* hpp-mesin.js — DIBANGKITKAN oleh tools/gen-hpp-mesin.js. JANGAN DISUNTING.\n'
    + ' *\n'
    + ' * Rumus modal modul HPP & Resep, diiris APA ADANYA dari deploy/stock/hpp/index.html\n'
    + ' * dan dibungkus pabrik supaya bisa dipakai modul lain (Menu Kalkulator Marketing)\n'
    + ' * tanpa menyalin rumusnya. Ubah rumusnya di modul HPP, lalu jalankan ulang\n'
    + ' * `node tools/gen-hpp-mesin.js` — tools/uji-kalkulator-hpp.js merah kalau basi.\n'
    + ' *\n'
    + ' *   var m = window.LMHppMesin({bahan, resep, setting, produk});\n'
    + ' *   m.modalPorsi(r), m.hargaJual(r), m.cogsOf(r), m.prasmananKah(r), m.resep\n'
    + ' */\n'
    + '(function(){\n'
    + 'window.LMHppMesin = function(data){\n'
    + '  data = data || {};\n'
    + '  var S = { bahan: data.bahan || [], resep: data.resep || [] };\n'
    + "  var SET = { targetFood:0.33, targetDrink:0.33, buffer:0.05 };\n"
    + '  var PRODUK = data.produk || {}, PB = {}, PR = {}, MEMO = {};\n'
    + '\n' + isi + '\n\n'
    + '  if (data.setting) SET = Object.assign(SET, data.setting);\n'
    + '  /* Migrasi harga jual lama — SAMA dengan muat() di modul HPP. */\n'
    + '  S.resep.forEach(function(r){ if(!num(r.harga_baru)&&num(r.harga_lama)) r.harga_baru=num(r.harga_lama); });\n'
    + '  petakan();\n'
    + '  return { resep:S.resep, setting:SET, modalMenu:modalMenu, modalPorsi:modalPorsi, hargaJual:hargaJual,\n'
    + '           cogsOf:cogsOf, porsiYield:porsiYield, prasmananKah:prasmananKah };\n'
    + '};\n'
    + '})();\n';
}

if (require.main === module) {
  const baru = bangkitkan();
  if (process.argv.includes('--cek')) {
    const lama = fs.existsSync(TUJUAN) ? fs.readFileSync(TUJUAN, 'utf8').replace(/\r\n/g, '\n') : '';
    if (lama !== baru) { console.error('BASI: deploy/assets/hpp-mesin.js tidak sama dengan rumus di modul HPP. Jalankan: node tools/gen-hpp-mesin.js'); process.exit(1); }
    console.log('hpp-mesin.js sesuai dengan modul HPP.'); process.exit(0);
  }
  fs.writeFileSync(TUJUAN, baru);
  console.log('✓ ' + path.relative(ROOT, TUJUAN) + ' (' + NAMA.length + ' deklarasi)');
}
module.exports = { bangkitkan, NAMA, iris };
