/* uji-hpp-dari-marketing.js — berkas impor prasmanan dari Database Menu Marketing
 *
 *   node tools/hpp-prasmanan-dari-marketing.js   (buat berkasnya dulu)
 *   node tools/uji-hpp-dari-marketing.js
 *
 * 1. ATURANNYA diuji atas fixture (tidak butuh data sungguhan): nama yang sudah
 *    ada di HPP TIDAK ikut (tidak menimpa), Ala Carte tidak ikut, yang baru
 *    diberi kode MKT-###, seksi PRASMANAN - <JENIS>.
 * 2. BERKASNYA dibaca dengan bacaResepRows() yang DIPOTONG dari
 *    deploy/stock/hpp — pembaca yang sama yang dipakai tombol Impor. Blok ini
 *    MELEWAT dengan jelas kalau berkasnya belum dibuat.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
let ok = 0, gagal = 0;
const cek = (n, s, k) => { if (s) { ok++; console.log('  OK   ' + n); } else { gagal++; console.log('  GAGAL ' + n + (k ? '  — ' + k : '')); } };

const { susun, kunci } = require('./hpp-prasmanan-dari-marketing.js');

console.log('\n== aturan (fixture) ==');
{
  const mkt = { menuDb: {
    'Snack': [{ n:'Bakwan', h:8000 }, { n:'Pisang  Goreng', h:20000 }, { n:'bakwan', h:9000 }],
    'Drink': [{ n:'Es Teh', h:2000 }, { n:'Coca Cola', h:0 }],
    'Ala Carte': [{ n:'Chicken Curry Mee', h:51750 }],
  } };
  const hpp = { resep: [{ nama:'Pisang Goreng', seksi:'PRASMANAN - SNACK' }, { nama:'ES TEH', seksi:'PRASMANAN - DRINK' }] };
  const h = susun(mkt, hpp);
  const nama = h.tambah.map(t => t.nama);
  cek('nama yang sudah ada di HPP TIDAK ikut (spasi & huruf besar diabaikan)',
      nama.indexOf('Pisang  Goreng') < 0 && nama.indexOf('Es Teh') < 0, JSON.stringify(nama));
  cek('...dan dilaporkan', h.lewat.some(x => x.di === 'Pisang Goreng') && h.lewat.some(x => x.di === 'ES TEH'));
  cek('Ala Carte tidak ikut', nama.indexOf('Chicken Curry Mee') < 0);
  cek('nama kembar di Database Menu cuma sekali', nama.filter(n => kunci(n) === 'bakwan').length === 1);
  cek('yang baru: Bakwan & Coca Cola', nama.length === 2 && nama.indexOf('Bakwan') > -1 && nama.indexOf('Coca Cola') > -1, JSON.stringify(nama));
  const b = h.baris.find(r => r[0] === 'Coca Cola');
  cek('diberi kode MKT-###', h.baris.every(r => /^MKT-\d{3}$/.test(r[9])), h.baris.map(r => r[9]).join(','));
  cek('seksi PRASMANAN - <JENIS>', b && b[3] === 'PRASMANAN - DRINK', b && b[3]);
  cek('Drink jadi Minuman, lainnya Makanan', b && b[1] === 'Minuman' && h.baris.find(r => r[0] === 'Bakwan')[1] === 'Makanan');
  cek('tanpa bahan & tanpa modal karangan', h.baris.every(r => r[10] === '' && r[7] === ''));
}

console.log('\n== berkas hasil, lewat pembaca impor HPP ==');
(async () => {
  const BERKAS = path.join(ROOT, 'resep-prasmanan-dari-marketing.xlsx');
  if (!fs.existsSync(BERKAS)) { console.log('LEWAT — berkas belum dibuat.'); }
  else {
    const SRC = fs.readFileSync(path.join(ROOT, 'deploy/stock/hpp/index.html'), 'utf8');
    const potong = nama => {
      const i = SRC.indexOf('function ' + nama + '('); let d = 0;
      for (let j = i; j < SRC.length; j++) { const c = SRC[j]; if (c === '{') d++; else if (c === '}') { d--; if (!d) return SRC.slice(i, j + 1); } }
    };
    const sb = { low: s => String(s == null ? '' : s).trim().toLowerCase() };
    new Function('low', ['petaKolom', 'angkaImpor', 'bacaResepRows'].map(potong).join('\n')
      + '\n; this.bacaResepRows = bacaResepRows;').call(sb, sb.low);
    const W = {};
    new Function('window', fs.readFileSync(path.join(ROOT, 'deploy/assets/xlsx-baca.js'), 'utf8'))(W);
    const idx = h => { let v = 0; for (const c of h) v = v * 26 + (c.charCodeAt(0) - 64); return v - 1; };
    const lembar = await W.bacaBerkasLembar(new Blob([fs.readFileSync(BERKAS)]));
    const rows = lembar[0].baris.map(b => { const a = []; Object.keys(b).forEach(k => { a[idx(k)] = String(b[k]); }); return Array.from(a, x => x == null ? '' : x); });
    const h = sb.bacaResepRows(rows);
    cek('tidak ditolak pembacanya', !h.galat, h.galat);
    const list = h.list || h.resep || [];
    cek('resepnya terbaca', list.length > 0, Object.keys(h).join(','));
    cek('seluruhnya berkode MKT-', list.every(r => /^MKT-\d{3}$/.test(String(r.kode || '').toUpperCase())));
    cek('seluruhnya di seksi PRASMANAN', list.every(r => /^PRASMANAN - /.test(r.seksi || '')));
    const hppP = path.join(__dirname, 'hpp-master.json');
    if (fs.existsSync(hppP)) {
      const j = JSON.parse(fs.readFileSync(hppP, 'utf8')); const hp = j.data || j;
      const ada = new Set((hp.resep || []).map(r => kunci(r.nama)));
      const tabrak = list.filter(r => ada.has(kunci(r.nama))).map(r => r.nama);
      cek('TIDAK ADA satu pun nama yang sudah ada di HPP (impor akan menimpanya)', !tabrak.length, tabrak.join(', '));
    }
  }
  console.log('\n---------------------------------------');
  console.log('LULUS ' + ok + '   GAGAL ' + gagal);
  process.exit(gagal ? 1 : 0);
})();
