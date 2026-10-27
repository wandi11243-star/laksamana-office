// Menyusun deploy/pos/menu-data.js dari daftar resep HPP & Resep.
//
//   curl -s "https://team.laksamanamuda.id/stock-api-mysql/hpp.php" -o tools/hpp-master.json
//   node tools/pos-menu-dari-hpp.js [jalur-json]
//
// Yang diambil: resep MENU JADI (tipe 'dish') yang AKTIF dan punya harga jual.
// Prasmanan (seksi berawalan PRASMANAN) tidak ikut — ia dijual per pax, bukan
// per porsi di kasir. Menu tanpa harga juga tidak ikut: tombol Rp0 di kasir
// berarti menjual barang gratis tanpa satu pun tanda, dan jumlahnya disebut
// di keluaran supaya bisa dilengkapi di HPP.
//
// tools/hpp-master.json TIDAK masuk repo — isinya harga beli seluruh bahan.
// Yang masuk repo cuma nama menu, kategori, dan harga jualnya.
const fs = require('fs');
const path = require('path');

const sumber = process.argv[2] || path.join(__dirname, 'hpp-master.json');
const d = JSON.parse(fs.readFileSync(sumber, 'utf8'));
const harga = r => +r.harga_baru || +r.harga_lama || 0;

// Seksi kosong / "TANPA RESEP" bukan kategori yang berarti di layar kasir.
function kategori(r) {
  const s = String(r.seksi || '').trim();
  const lain = r.jenis === 'drink' ? 'Minuman Lainnya' : 'Makanan Lainnya';
  if (!s || /^TANPA RESEP$/i.test(s)) return lain;
  if (/^BASE \(PRODUCTION BASE\)$/i.test(s)) return 'Tea & Signature Base';
  return s.replace(/^DISH \((.*)\)$/i, (_, x) => x.toLowerCase().replace(/\b\w/g, c => c.toUpperCase()))
          .replace(/^Rtc$/, 'Ready To Cook').replace(/^Ct$/, 'Compliment');
}

const aktif = (d.resep || []).filter(r =>
  r.tipe === 'dish' && +r.aktif === 1 && !/^PRASMANAN/i.test(r.seksi || ''));
const tanpaHarga = aktif.filter(r => !harga(r));
const menu = aktif.filter(r => harga(r) > 0).map(r => ({
  id: String(r.id), nama: String(r.nama).trim(), kat: kategori(r),
  jenis: r.jenis === 'drink' ? 'drink' : 'food', harga: harga(r),
  kode: String(r.kode || '').trim()
})).sort((a, b) => a.kat.localeCompare(b.kat) || a.nama.localeCompare(b.nama));

const tujuan = path.join(__dirname, '..', 'deploy', 'pos', 'menu-data.js');
fs.writeFileSync(tujuan,
  '// DIHASILKAN tools/pos-menu-dari-hpp.js dari HPP & Resep PRODUKSI — jangan disunting tangan.\n' +
  '// Diambil: ' + new Date().toISOString().slice(0, 10) + ' · ' + menu.length + ' menu aktif berharga.\n' +
  'window.POS_MENU = ' + JSON.stringify(menu, null, 0).replace(/},{/g, '},\n{') + ';\n');
console.log(menu.length + ' menu ditulis ke ' + tujuan);
console.log(tanpaHarga.length + ' menu aktif TANPA harga jual dilewati: ' +
  tanpaHarga.map(r => r.nama).join(', '));
