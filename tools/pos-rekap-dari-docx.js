// Menyusun deploy/pos/rekap-2026.js dari "REKAPITULASI PB1 BULANAN LAKSAMANA MUDA.docx".
//
//   node tools/pos-rekap-dari-docx.js ["jalur.docx"]
//
// Yang diambil: blok BULAN tahun 2026, satu baris per tanggal (omset, pajak,
// Weekday/Weekend apa adanya dari dokumen). Jumlah tiap bulan DIBANDINGKAN
// dengan baris TOTAL di dokumennya sendiri — kalau beda, alat ini berhenti:
// angka yang terurai salah tidak boleh sampai ke layar.
//
// Tanpa pustaka: .docx = ZIP, dan zlib bawaan Node bisa membuka deflate-raw.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const sumber = process.argv[2] || path.join(__dirname, '..', 'REKAPITULASI PB1 BULANAN LAKSAMANA MUDA.docx');
const buf = fs.readFileSync(sumber);

function bacaZip(buf, nama) {
  // Cari End Of Central Directory lalu telusuri daftar isinya.
  let e = buf.length - 22;
  while (e >= 0 && buf.readUInt32LE(e) !== 0x06054b50) e--;
  if (e < 0) throw new Error('Bukan berkas ZIP/.docx');
  let p = buf.readUInt32LE(e + 16);
  const n = buf.readUInt16LE(e + 10);
  for (let i = 0; i < n; i++) {
    const metode = buf.readUInt16LE(p + 10), ukuran = buf.readUInt32LE(p + 20);
    const ln = buf.readUInt16LE(p + 28), lx = buf.readUInt16LE(p + 30), lk = buf.readUInt16LE(p + 32);
    const off = buf.readUInt32LE(p + 42);
    const nm = buf.toString('utf8', p + 46, p + 46 + ln);
    if (nm === nama) {
      const awal = off + 30 + buf.readUInt16LE(off + 26) + buf.readUInt16LE(off + 28);
      const data = buf.subarray(awal, awal + ukuran);
      return (metode === 8 ? zlib.inflateRawSync(data) : data).toString('utf8');
    }
    p += 46 + ln + lx + lk;
  }
  throw new Error(nama + ' tidak ada di berkas');
}

const xml = bacaZip(buf, 'word/document.xml');
const L = xml.replace(/<\/w:p>/g, '\n').replace(/<[^>]*>/g, '')
  .replace(/&amp;/g, '&').split('\n').map(s => s.replace(/\s+/g, ' ').trim()).filter(Boolean);
const BLN = ['januari','februari','maret','april','mei','juni','juli','agustus','september','oktober','november','desember'];
const angka = s => +String(s).replace(/[^\d]/g, '');

const hasil = {};
let gagal = false;
for (let i = 0; i < L.length; i++) {
  const m = L[i].match(/^BULAN\s*:\s*(\w+)\s+(\d{4})/i);
  if (!m || m[2] !== '2026') continue;
  const ym = '2026-' + String(BLN.indexOf(m[1].toLowerCase()) + 1).padStart(2, '0');
  const hari = {}; let total = null, totalPj = null;
  for (let j = i + 1; j < L.length && !/^BULAN\s*:/i.test(L[j]); j++) {
    if (L[j] === 'TOTAL') { total = angka(L[j + 1]); totalPj = angka(L[j + 2]); break; }
    // Baris tabel: nomor urut (= tanggal), tanggal, omset, pajak, keterangan.
    if (/^\d{1,2}$/.test(L[j]) && /Rp/.test(L[j + 2] || '')) {
      hari[+L[j]] = [+L[j], angka(L[j + 2]), angka(L[j + 3]), /weekend/i.test(L[j + 4] || '') ? 1 : 0];
    }
  }
  const baris = Object.values(hari).sort((a, b) => a[0] - b[0]);
  const sum = baris.reduce((s, x) => s + x[1], 0);
  const cocok = sum === total;
  if (!cocok) gagal = true;
  console.log(ym + ' · ' + baris.length + ' hari · omset ' + sum.toLocaleString('id-ID') +
    ' · TOTAL dokumen ' + (total == null ? '-' : total.toLocaleString('id-ID')) + (cocok ? ' · cocok' : ' · BEDA'));
  hasil[ym] = { hari: baris, total, totalPajak: totalPj };
}
if (gagal) { console.error('Ada bulan yang jumlahnya tidak sama dengan TOTAL dokumen — berkas tidak ditulis.'); process.exit(2); }

const tujuan = path.join(__dirname, '..', 'deploy', 'pos', 'rekap-2026.js');
fs.writeFileSync(tujuan,
  '// DIHASILKAN tools/pos-rekap-dari-docx.js dari Rekapitulasi PB1 Bulanan — jangan disunting tangan.\n' +
  '// Per bulan: hari = [[tanggal, omset, pajak, weekend(1/0)], ...], total & totalPajak = baris TOTAL dokumen.\n' +
  'window.POS_REKAP = ' + JSON.stringify(hasil) + ';\n');
console.log('ditulis: ' + tujuan);
