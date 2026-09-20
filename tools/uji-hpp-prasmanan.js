/* uji-hpp-prasmanan.js — berkas hasil tools/hpp-prasmanan-ke-impor.js benar-benar bisa diimpor
 *
 *   node tools/hpp-prasmanan-ke-impor.js && node tools/uji-hpp-prasmanan.js
 *
 * YANG MEMBACANYA DI SINI PEMBACA IMPOR SUNGGUHAN milik modul HPP —
 * bacaResepRows() DIPOTONG dari deploy/stock/hpp/index.html, bukan ditulis
 * ulang. Uji yang memakai pembaca tiruan cuma mengulang asumsi yang sama
 * dengan pembuat berkasnya; yang membuktikan berkasnya bisa diimpor adalah
 * kode yang nanti benar-benar membacanya.
 *
 * MELEWAT dengan jelas kalau berkasnya belum dibuat — berkas hasil tidak
 * masuk repo (lihat .gitignore), jadi di mesin yang belum menjalankan
 * alatnya uji ini tidak punya apa-apa untuk diperiksa.
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');

const SRC = fs.readFileSync(path.join(ROOT, 'deploy/stock/hpp/index.html'), 'utf8');
function potong(nama) {
  const i = SRC.indexOf('function ' + nama + '(');
  if (i < 0) throw new Error('fungsi ' + nama + ' tidak ketemu di sumber');
  let d = 0, mulai = -1;
  for (let j = i; j < SRC.length; j++) {
    const c = SRC[j];
    if (c === '{') { if (d === 0) mulai = j; d++; }
    else if (c === '}') { d--; if (d === 0) return SRC.slice(i, j + 1); }
  }
  throw new Error('kurung ' + nama + ' tidak tertutup');
}
const kode = ['petaKolom', 'angkaImpor', 'bacaResepRows'].map(potong).join('\n');
const sandbox = { low: s => String(s == null ? '' : s).trim().toLowerCase() };
new Function('low', kode + '\n; this.bacaResepRows = bacaResepRows;').call(sandbox, sandbox.low);

const W = {};
new Function('window', fs.readFileSync(path.join(ROOT, 'deploy/assets/xlsx-baca.js'), 'utf8'))(W);

let ok = 0, gagal = 0;
const cek = (n, s, k) => { if (s) { ok++; console.log('  OK   ' + n); } else { gagal++; console.log('  GAGAL ' + n + (k ? '  — ' + k : '')); } };

const BERKAS = path.join(ROOT, 'resep-prasmanan-untuk-impor-hpp.xlsx');
(async () => {
  if (!fs.existsSync(BERKAS)) {
    console.log('LEWAT — ' + BERKAS + ' belum dibuat.');
    console.log('Jalankan dulu: node tools/hpp-prasmanan-ke-impor.js');
    process.exit(0);
  }
  const lembar = await W.bacaBerkasLembar(new Blob([fs.readFileSync(BERKAS)]));
  cek('lembar pertama bernama Daftar Resep', lembar[0].nama === 'Daftar Resep', lembar[0].nama);

  /* Baris berkunci huruf -> array, bentuk yang diberikan SheetJS ke
     bacaResepRows saat modul HPP membacanya. */
  const idx = h => { let v = 0; for (const c of h) v = v * 26 + (c.charCodeAt(0) - 64); return v - 1; };
  const rows = lembar[0].baris.map(b => {
    const a = []; let maks = 0;
    Object.keys(b).forEach(k => { maks = Math.max(maks, idx(k) + 1); });
    for (let i = 0; i < maks; i++) a.push('');
    Object.keys(b).forEach(k => { a[idx(k)] = String(b[k]); });
    return a;
  });

  const h = sandbox.bacaResepRows(rows);
  cek('tidak ditolak pembacanya', !h.galat, h.galat);
  if (h.galat) { console.log('\nLULUS ' + ok + '  GAGAL ' + gagal); process.exit(1); }

  cek('tidak ada baris yatim (sebelum nama resep mana pun)', !h.bolong.length, (h.bolong || []).join(', '));
  cek('jumlah resep terbaca 77', h.resep.length === 77, String(h.resep.length));

  const p = h.resep;
  cek('semuanya Menu Jadi', p.every(r => r.tipe === 'dish'));
  cek('semuanya aktif', p.every(r => r.aktif === 1));
  cek('seksinya berawalan PRASMANAN', p.every(r => /^PRASMANAN - /.test(r.seksi)));
  /* Jenis disimpan sebagai food/drink, bukan kata Indonesianya — kalau tidak,
     resepnya tidak pernah cocok dengan tapis mana pun tanpa satu pun galat. */
  cek('jenisnya food/drink', p.every(r => r.jenis === 'food' || r.jenis === 'drink'));
  cek('ada yang drink', p.some(r => r.jenis === 'drink'));

  const bahanTotal = p.reduce((a, r) => a + r.bahan.length, 0);
  cek('bahannya ikut terbaca', bahanTotal > 200, String(bahanTotal));
  cek('tiap bahan punya nama', p.every(r => r.bahan.every(b => b.nama)));
  /* SATUAN BOLEH KOSONG, tapi HANYA kalau takarannya juga nol — itu bentuk
     baris yang di berkas HPP aslinya memang belum diisi takarannya (nama
     bahannya sudah ditulis, angkanya belum). Dibuang, resepnya kehilangan
     daftar bahan yang sudah disusun orang; yang tidak boleh adalah satuan
     kosong dengan qty berisi, karena itu takaran tanpa satuan. */
  cek('satuan kosong hanya pada baris yang qty-nya juga 0',
      p.every(r => r.bahan.every(b => b.satuan || !(Number(b.qty) > 0))),
      JSON.stringify((p.flatMap(r => r.bahan).find(b => !b.satuan && Number(b.qty) > 0)) || {}));
  /* MODAL MANUAL dan bahan TIDAK BOLEH berdiri bersama: modalnya akan
     terhitung dua kali — sekali dari bahannya, sekali dari angka manualnya. */
  cek('modal manual hanya untuk yang tanpa bahan',
      p.every(r => !(r.bahan.length && r.modal_manual > 0)),
      (p.find(r => r.bahan.length && r.modal_manual > 0) || {}).nama);
  cek('yang tanpa bahan punya modal manual',
      p.filter(r => !r.bahan.length).every(r => r.modal_manual >= 0));
  /* Yield jadi PEMBAGI modal per porsi — nol membuat pembagiannya tak
     terhingga, dan angkanya tetap terlihat seperti angka. */
  cek('yield qty selalu > 0', p.every(r => r.yield_qty > 0),
      (p.find(r => !(r.yield_qty > 0)) || {}).nama);
  cek('yield unit selalu terisi', p.every(r => r.yield_unit));
  cek('harga jual terbaca', p.filter(r => r.harga_baru > 0).length > 50,
      String(p.filter(r => r.harga_baru > 0).length));

  /* Beberapa angka dicocokkan dengan berkas HPP aslinya — kalau salah satu
     meleset, yang salah konverternya, bukan pembacanya. */
  const cari = n => p.find(r => r.nama === n);
  const igaB = cari('Iga Bakar');
  cek('Iga Bakar: yield 100 (JUMLAH PROD. aslinya salah isi)', igaB && igaB.yield_qty === 100,
      igaB && (igaB.yield_qty + ' ' + igaB.yield_unit));
  cek('Iga Bakar: 16 bahan', igaB && igaB.bahan.length === 16, igaB && String(igaB.bahan.length));
  const sop = cari('Soup Buntut');
  cek('Soup Buntut dapat rincian dari "Sop Buntut"', sop && sop.bahan.length > 0,
      sop && String(sop.bahan.length));
  const sambal = cari('Sambal Merah');
  cek('Sambal Merah: satuannya Porsi, bukan Kg', sambal && sambal.yield_unit === 'Porsi',
      sambal && (sambal.yield_qty + ' ' + sambal.yield_unit));
  const snack = cari('Bakwan');
  cek('Bakwan (tanpa rincian): modal manual terisi', snack && snack.modal_manual === 2000,
      snack && String(snack.modal_manual));

  console.log('\nLULUS ' + ok + '   GAGAL ' + gagal);
  process.exit(gagal ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
