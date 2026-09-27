/* hpp-prasmanan-dari-marketing.js — menu prasmanan dari Database Menu modul
 * Marketing yang BELUM ada di HPP & Resep → berkas impor Daftar Resep
 *
 *   curl -s "https://team.laksamanamuda.id/marketing-api-mysql/api.php?action=getAll" -o tools/mkt-getall.json
 *   curl -s "https://team.laksamanamuda.id/stock-api-mysql/hpp.php" -o tools/hpp-master.json
 *   node tools/hpp-prasmanan-dari-marketing.js
 *
 * Permintaan user 27 September 2026: "ambil data menu prasmanan yang belum
 * ada di modul HPP & Resep, ambil dari database menu yang di modul marketing;
 * kalau ketemu nama yang sama jangan ditimpa, tapi dibuat kode kalau yang
 * ditambahkan itu dari database menu modul marketing (masukin ke kategori
 * Prasmanan)".
 *
 * ALATNYA TIDAK MENULIS APA PUN KE DATABASE — aturan 0 repo ini. Yang
 * dihasilkan berkas `resep-prasmanan-dari-marketing.xlsx` di root repo
 * (sudah di .gitignore lewat pola resep-prasmanan*); yang mengimpor tetap
 * orang, lewat HPP & Resep → Daftar Resep → Impor, dan pratinjaunya menyebut
 * berapa resep BARU dan berapa DIPERBARUI sebelum satu baris pun ditulis.
 * Untuk berkas ini angka "diperbarui" WAJIB NOL — kalau tidak nol, jangan
 * diimpor: berarti HPP sudah berubah sejak berkas ini dibuat.
 *
 * ATURANNYA:
 *   - Yang diambil seluruh jenis di Database Menu KECUALI "Ala Carte" —
 *     itu menu à la carte, bukan prasmanan.
 *   - NAMA YANG SUDAH ADA DI HPP (seksi mana pun, huruf besar/kecil & tanda
 *     baca diabaikan) TIDAK diikutkan sama sekali: impor mencocokkan nama +
 *     jenis dan MENGGANTI isi resep yang cocok, jadi mengikutkannya berarti
 *     menimpa. Daftarnya dilaporkan di lembar kedua.
 *   - Yang ditambahkan diberi KODE `MKT-###` di kolom Kode POS — penanda
 *     bahwa resep itu lahir dari Database Menu Marketing, bukan dari berkas
 *     HPP dapur. Awalannya tidak pernah dipakai POS, jadi tidak bisa
 *     tertukar dengan kode paket di laporan penjualan.
 *   - Seksi `PRASMANAN - <JENIS>`, sama dengan resep prasmanan yang sudah ada.
 *   - Harga Jual dari kolom harga Database Menu; bahan & modal KOSONG — belum
 *     ada resepnya, dan mengarang takaran lebih buruk daripada kolom kosong.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const ROOT = path.resolve(__dirname, '..');

/* Penulis .xlsx DIPINJAM dari hpp-prasmanan-ke-impor.js (diiris dari
   sumbernya), bukan disalin — dua penulis xlsx akan menyimpang. */
const SRC_ALAT = fs.readFileSync(path.join(__dirname, 'hpp-prasmanan-ke-impor.js'), 'utf8');
const awal = SRC_ALAT.indexOf('const escX = s =>');
const akhir = SRC_ALAT.indexOf('/* ==================== PENGURAI LEMBAR HPP');
if (awal < 0 || akhir < 0) { console.error('Penulis xlsx tidak ketemu di hpp-prasmanan-ke-impor.js'); process.exit(2); }
const huruf = i => { let s = ''; i++; while (i > 0) { const r = (i - 1) % 26; s = String.fromCharCode(65 + r) + s; i = (i - 1 - r) / 26; } return s; };
const buatXlsx = new Function('zlib', 'Buffer', 'huruf', SRC_ALAT.slice(awal, akhir) + '\nreturn buatXlsx;')(zlib, Buffer, huruf);

const KOL = ['Nama Resep', 'Jenis', 'Tipe', 'Seksi', 'Yield Qty', 'Yield Unit',
             'Harga Jual', 'Modal Manual', 'Aktif', 'Kode POS', 'Bahan', 'Qty', 'Satuan', 'Ref',
             'Modal (otomatis)'];
const teks = v => String(v == null ? '' : v).trim();
const kunci = s => teks(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const JENIS_BUKAN = ['ala carte'];

function baca(nama) {
  const p = path.join(__dirname, nama);
  if (!fs.existsSync(p)) { console.error('Tidak ada tools/' + nama + ' — unduh dulu (lihat kepala berkas ini).'); process.exit(3); }
  const j = JSON.parse(fs.readFileSync(p, 'utf8'));
  return j.data || j;
}

function susun(mkt, hpp) {
  const db = mkt.menuDb || {};
  const ada = new Map();
  (hpp.resep || []).forEach(r => { const k = kunci(r.nama); if (k && !ada.has(k)) ada.set(k, r); });
  const tambah = [], lewat = [], sudahDiBerkas = new Set();
  Object.keys(db).forEach(jenis => {
    if (JENIS_BUKAN.includes(kunci(jenis))) return;
    (Array.isArray(db[jenis]) ? db[jenis] : []).forEach(it => {
      const nama = teks(it && it.n); if (!nama) return;
      const k = kunci(nama);
      if (ada.has(k)) { const r = ada.get(k); lewat.push({ nama, jenis, di: r.nama, seksi: r.seksi || '' }); return; }
      if (sudahDiBerkas.has(k)) { lewat.push({ nama, jenis, di: '(nama kembar di Database Menu)', seksi: '' }); return; }
      sudahDiBerkas.add(k);
      tambah.push({ nama, jenis, harga: (it.h == null || it.h === '') ? '' : Math.round(Number(it.h) || 0) });
    });
  });
  const baris = tambah.map((t, i) => [
    t.nama, /drink/i.test(t.jenis) ? 'Minuman' : 'Makanan', 'Menu Jadi',
    'PRASMANAN - ' + t.jenis.toUpperCase(), 1, 'Porsi', t.harga, '', 'Ya',
    'MKT-' + String(i + 1).padStart(3, '0'), '', '', '', '', '']);
  return { tambah, lewat, baris };
}

if (require.main === module) {
  const mkt = baca('mkt-getall.json'), hpp = baca('hpp-master.json');
  const h = susun(mkt, hpp);
  const lap = [['BAGIAN', 'NAMA', 'JENIS (Database Menu)', 'SUDAH ADA DI HPP SEBAGAI', 'SEKSI DI HPP']];
  lap.push(['RINGKASAN', 'Ditambahkan (baru)', h.tambah.length, '', '']);
  lap.push(['RINGKASAN', 'Tidak diikutkan — nama sudah ada', h.lewat.length, '', '']);
  lap.push(['RINGKASAN', 'Pratinjau impor harus berbunyi', h.tambah.length + ' baru · 0 diperbarui', '', '']);
  lap.push(['', '', '', '', '']);
  h.lewat.forEach(x => lap.push(['SUDAH ADA — TIDAK DITIMPA', x.nama, x.jenis, x.di, x.seksi]));
  const KELUAR = 'resep-prasmanan-dari-marketing.xlsx';
  fs.writeFileSync(path.join(ROOT, KELUAR), buatXlsx([
    { nama: 'Daftar Resep', aoa: [KOL, ...h.baris] },
    { nama: 'Laporan', aoa: lap },
  ]));
  console.log('✓ ' + KELUAR + ' — ' + h.tambah.length + ' resep baru, ' + h.lewat.length + ' dilewati (nama sudah ada)');
  h.tambah.forEach((t, i) => console.log('  + MKT-' + String(i + 1).padStart(3, '0') + '  ' + t.nama + '  [' + t.jenis + ']  ' + (t.harga === '' ? '(tanpa harga)' : t.harga)));
}
module.exports = { susun, kunci };
