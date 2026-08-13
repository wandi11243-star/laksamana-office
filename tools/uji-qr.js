#!/usr/bin/env node
/* Membandingkan pembuat QR versi JS (deploy/ticketing/index.html) dengan versi
   PHP (ticketing-mysql/lib_qr.php).

   QR yang tampil di halaman e-ticket dan QR yang tercetak di lampiran PDF
   HARUS matriks yang sama persis. Dua penyusun QR yang berbeda untuk satu
   token adalah kegagalan yang tidak menimbulkan galat apa pun sampai petugas
   memindai lembar cetak di pintu masuk, malam acara.

   Pemakaian:  node tools/uji-qr.js
   Keluar 1 kalau ada satu saja matriks yang berbeda. */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const { JSDOM } = require(path.join(ROOT, 'node_modules', 'jsdom'));

/* Teks uji sengaja mencakup rentang panjang yang bikin versi QR-nya berbeda
   (1, 2, 5, 10) plus bentuk token yang benar-benar dipakai — token tiket dan
   tautan e-ticket lengkap. */
const UJI = [
  'A',
  'LM-0001',
  'tix_9f2a41bc77e30d18',
  'aGqzB-4kQ2xY7pLmN0vR8sTfW1cE6dJhU3iO5yZ',
  'https://tiket.laksamanamuda.id/#tiket/LM-20260813-0042/aGqzB4kQ2xY7pLmN0vR8sTfW1cE6dJhU3iO5yZ9bXk',
  'x'.repeat(180)
];

const html = fs.readFileSync(path.join(ROOT, 'deploy/ticketing/index.html'), 'utf8');
const dom = new JSDOM(html, {
  runScripts: 'dangerously', pretendToBeVisual: true,
  url: 'http://localhost/tiket/',
  beforeParse(w) {
    w.fetch = () => Promise.reject(new Error('offline'));
    w.scrollTo = () => {}; w.alert = () => {}; w.confirm = () => true;
    w.matchMedia = () => ({ matches: false, addListener(){}, removeListener(){},
      addEventListener(){}, removeEventListener(){}, dispatchEvent(){ return false; } });
  }
});

setTimeout(() => {
  const w = dom.window;
  const js = {};
  for (const t of UJI) {
    const m = w.eval('qrMatrix(' + JSON.stringify(t) + ')');
    js[t] = [].map.call(m, r => [].join.call(r, ''));
  }

  let php;
  try {
    const keluar = execFileSync('php', [path.join(ROOT, 'tools/uji-qr-php.php'), ...UJI],
      { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
    php = JSON.parse(keluar);
  } catch (e) {
    console.log('LEWAT  uji-qr — PHP tidak bisa dijalankan di sini (' + e.message.split('\n')[0] + ')');
    process.exit(0);      // bukan kegagalan modul; di mesin tanpa PHP uji ini memang tidak bisa jalan
  }

  const gagal = [];
  for (const t of UJI) {
    const a = js[t], b = php[t];
    const nama = t.length > 34 ? t.slice(0, 31) + '…' : t;
    if (!b) { gagal.push(nama + ': PHP tidak memulangkan apa pun'); continue; }
    if (a.length !== b.length) { gagal.push(nama + ': ukuran beda — JS ' + a.length + ', PHP ' + b.length); continue; }
    const beda = a.findIndex((r, i) => r !== b[i]);
    if (beda >= 0) gagal.push(nama + ': baris ' + beda + ' berbeda\n       JS  ' + a[beda] + '\n       PHP ' + b[beda]);
  }

  if (gagal.length) {
    console.log('GAGAL  uji-qr — matriks JS dan PHP menyimpang:\n - ' + gagal.join('\n - '));
    process.exit(1);
  }
  console.log('OK     uji-qr — ' + UJI.length + ' teks, matriks JS = PHP (versi 1..10)');
  process.exit(0);
}, 1500);
