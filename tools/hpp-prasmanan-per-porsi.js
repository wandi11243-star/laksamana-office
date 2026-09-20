/* hpp-prasmanan-per-porsi.js — membetulkan yield resep PRASMANAN jadi 1 porsi
 *
 *   curl -s "https://dev.laksamanamuda.id/stock-api-mysql/hpp.php" -o tools/hpp-master.json
 *   node tools/hpp-prasmanan-per-porsi.js
 *   node tools/uji-hpp-prasmanan.js
 *
 * SEBABNYA TERLIHAT DI LAYAR, dan angkanya mustahil: COGS% 2403%, 2609%,
 * 2507%. Dilaporkan user 20 September 2026, beberapa menit sesudah impor
 * pertamanya masuk.
 *
 *     cogsOf(r) = modalMenu(r).total / hargaJual(r)      <- MODAL TOTAL
 *
 * Jadi di modul ini `Harga Jual` berarti harga untuk SATU YIELD, bukan per
 * porsi — dan itu benar untuk 365 resep lama, yang semuanya ber-yield 1.
 * Impor prasmanan memasang yield 100 Porsi sambil mengisi harga jual per
 * porsi, jadi pembilang dan penyebutnya berbeda seratus kali lipat.
 *
 * YANG DIBETULKAN YIELD-nya, BUKAN HARGA JUALNYA. Mengalikan harga jual jadi
 * Rp2.600.000 untuk satu Ikan Asam Manis memang membuat COGS%-nya benar, tapi
 * kolom Harga Jual lalu memajang angka yang tidak pernah ditagihkan ke siapa
 * pun — dan kolom itu dibaca juga oleh Kalkulator HPP & Dashboard. Aturan
 * repo sudah menyebutnya: *Yield menu jadi = 1 Porsi, KECUALI resep sebatch*,
 * dan yang sebatch adalah yang dipakai SEBAGAI BAHAN resep lain. Prasmanan
 * dijual langsung.
 *
 * Jadi: takaran tiap bahan DIBAGI jumlah porsinya, modal manual dibagi juga,
 * yield jadi 1. Seluruh kolom lalu terbaca benar sekaligus — Modal Rp6.248,
 * Per Unit Rp6.248, Harga Jual Rp26.000, COGS 24%.
 *
 * SUMBER ANGKANYA SISTEM, BUKAN BERKAS EXCEL. Berkas HPP dapur kehilangan
 * seluruh kolom harganya (#REF!) sesudah sheet-sheet lain dihapus 20
 * September 2026 — yang selamat cuma nama bahan, takaran, satuan, dan jumlah
 * produksinya. Modal & harga jual sudah ada di sistem sejak impor pertama,
 * jadi dari sanalah keduanya dibaca.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const W = {};
new Function('window', fs.readFileSync(path.join(ROOT, 'deploy/assets/xlsx-baca.js'), 'utf8'))(W);

const KOL = ['Nama Resep', 'Jenis', 'Tipe', 'Seksi', 'Yield Qty', 'Yield Unit',
             'Harga Jual', 'Modal Manual', 'Aktif', 'Kode POS', 'Bahan', 'Qty', 'Satuan', 'Ref',
             'Modal (otomatis)'];
const KELUAR = 'resep-prasmanan-per-porsi';
const SUMBER_XLSX = process.argv[2] || 'HPP Food Laksamana Updated March 2026.xlsx';

const teks = v => String(v == null ? '' : v).trim();
const num = v => { const n = Number(v); return isFinite(n) ? n : 0; };
const kunci = s => teks(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
/* Dibulatkan 4 angka di belakang koma. Takaran 7500 Gr untuk 100 porsi jadi
   75 Gr; yang tidak bulat (250/100 = 2,5) memang wajar di resep, dan
   membulatkannya ke satuan penuh menggeser modalnya. */
const bagi = (v, n) => Math.round((num(v) / n) * 10000) / 10000;

/* ==================== penulis .xlsx ====================
   Salinan bentuk yang dipakai tools/hpp-prasmanan-ke-impor.js. Dipisah karena
   kedua alat memang berdiri sendiri; kalau suatu hari ada alat ketiga, inilah
   yang pantas dipindah ke berkas bersama. */
const zlib = require('zlib');
const huruf = i => { let s = ''; i++; while (i > 0) { const r = (i - 1) % 26; s = String.fromCharCode(65 + r) + s; i = (i - 1 - r) / 26; } return s; };
const escX = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
function sheetXml(aoa) {
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>'
    + aoa.map((row, r) => '<row r="' + (r + 1) + '">' + row.map((v, c) => {
        const ref = huruf(c) + (r + 1);
        if (v === null || v === undefined || v === '') return '';
        if (typeof v === 'number' && isFinite(v)) return '<c r="' + ref + '"><v>' + v + '</v></c>';
        return '<c r="' + ref + '" t="inlineStr"><is><t xml:space="preserve">' + escX(v) + '</t></is></c>';
      }).join('') + '</row>').join('')
    + '</sheetData></worksheet>';
}
function crc32(buf) {
  let c, t = crc32.t;
  if (!t) { t = crc32.t = []; for (let n = 0; n < 256; n++) { c = n; for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1); t[n] = c >>> 0; } }
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ t[(crc ^ buf[i]) & 0xFF];
  return (crc ^ 0xFFFFFFFF) >>> 0;
}
function buatXlsx(lembar) {
  const d = new Date();
  const cap = { tgl: (((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xFFFF,
                jam: ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)) & 0xFFFF };
  const f = [
    { nama: '[Content_Types].xml', isi: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' + lembar.map((l, i) => '<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>').join('') + '</Types>' },
    { nama: '_rels/.rels', isi: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>' },
    { nama: 'xl/workbook.xml', isi: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' + lembar.map((l, i) => '<sheet name="' + escX(l.nama) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>').join('') + '</sheets></workbook>' },
    { nama: 'xl/_rels/workbook.xml.rels', isi: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + lembar.map((l, i) => '<Relationship Id="rId' + (i + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>').join('') + '</Relationships>' },
  ];
  lembar.forEach((l, i) => f.push({ nama: 'xl/worksheets/sheet' + (i + 1) + '.xml', isi: sheetXml(l.aoa) }));
  const lokal = [], pusat = []; let off = 0;
  f.forEach(x => {
    const data = Buffer.from(x.isi, 'utf8'), comp = zlib.deflateRawSync(data), crc = crc32(data), nm = Buffer.from(x.nama, 'utf8');
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(8, 8);
    lh.writeUInt16LE(cap.jam, 10); lh.writeUInt16LE(cap.tgl, 12);
    lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(comp.length, 18); lh.writeUInt32LE(data.length, 22);
    lh.writeUInt16LE(nm.length, 26);
    lokal.push(lh, nm, comp);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(8, 10);
    ch.writeUInt16LE(cap.jam, 12); ch.writeUInt16LE(cap.tgl, 14);
    ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(comp.length, 20); ch.writeUInt32LE(data.length, 24);
    ch.writeUInt16LE(nm.length, 28); ch.writeUInt32LE(off, 42);
    pusat.push(ch, nm);
    off += lh.length + nm.length + comp.length;
  });
  const p = Buffer.concat(pusat), e = Buffer.alloc(22);
  e.writeUInt32LE(0x06054b50, 0); e.writeUInt16LE(f.length, 8); e.writeUInt16LE(f.length, 10);
  e.writeUInt32LE(p.length, 12); e.writeUInt32LE(off, 16);
  return Buffer.concat([Buffer.concat(lokal), p, e]);
}

(async () => {
  const jalurMaster = path.join(ROOT, 'tools', 'hpp-master.json');
  if (!fs.existsSync(jalurMaster)) {
    console.error('tools/hpp-master.json tidak ada. Ambil dulu:');
    console.error('  curl -s "https://dev.laksamanamuda.id/stock-api-mysql/hpp.php" -o tools/hpp-master.json');
    process.exit(2);
  }
  const sys = JSON.parse(fs.readFileSync(jalurMaster, 'utf8'));
  const PRAS = (sys.resep || []).filter(r => /^PRASMANAN/i.test(teks(r.seksi)));
  if (!PRAS.length) { console.error('Tidak ada resep berseksi PRASMANAN di master.'); process.exit(2); }

  /* JUMLAH PORSI untuk resep yang satuan yield-nya BUKAN porsi (L, Kg) tidak
     bisa diturunkan dari modal di sistem — yang ada modal untuk seluruh
     yield, bukan per porsi. Yang masih menyimpannya lembar "Prasmanan" di
     berkas dapur, kolom "N Porsi" di baris Nama Menu; kolom itu SELAMAT dari
     kerusakan #REF!, yang cuma mengenai kolom harga. */
  const porsiDariXlsx = new Map();
  const jalurX = path.isAbsolute(SUMBER_XLSX) ? SUMBER_XLSX : path.join(ROOT, SUMBER_XLSX);
  if (fs.existsSync(jalurX)) {
    const lembar = await W.bacaBerkasLembar(new Blob([fs.readFileSync(jalurX)]));
    const L = lembar.find(x => x.nama.trim().toLowerCase() === 'prasmanan');
    if (L) {
      const idx = h => { let v = 0; for (const c of h) v = v * 26 + (c.charCodeAt(0) - 64); return v - 1; };
      L.baris.forEach(b => Object.keys(b).forEach(k => {
        if (teks(b[k]).toLowerCase() !== 'nama menu') return;
        const c = idx(k);
        const nama = teks(b[huruf(c + 1)]);
        const m = teks(b[huruf(c + 3)]).match(/^\s*([\d.,]+)\s*porsi/i);
        if (nama && m) porsiDariXlsx.set(kunci(nama), Number(String(m[1]).replace(/,/g, '')) || 0);
      }));
    }
  } else {
    console.log('! ' + SUMBER_XLSX + ' tidak ada — jumlah porsi untuk resep bersatuan L/Kg tidak bisa dibaca.\n');
  }

  const baris = [], dibetulkan = [], menggantung = [], sudahBenar = [];
  PRAS.forEach(r => {
    const qty = num(r.yield_qty) || 1;
    const unit = teks(r.yield_unit) || 'Porsi';
    /* Satuan yield yang SUDAH porsi/pcs: angkanya memang jumlah porsi.
       Yang L/Kg: dicari di lembar dapur; yang tidak ketemu DIBIARKAN apa
       adanya dan dilaporkan — membaginya dengan angka liter berarti modal per
       LITER dibandingkan harga per PORSI, dan COGS%-nya tetap tidak bisa
       dibaca siapa pun. */
    let porsi = 0;
    if (/^(porsi|pcs|pax)$/i.test(unit)) porsi = qty;
    else porsi = porsiDariXlsx.get(kunci(r.nama)) || 0;

    if (porsi <= 1) {
      if (qty > 1) menggantung.push({ nama: r.nama, yield: qty + ' ' + unit, jual: num(r.harga_baru) });
      else sudahBenar.push(r.nama);
      return;   // tidak ikut di berkas: tidak ada yang perlu diubah
    }

    dibetulkan.push({ nama: r.nama, dari: qty + ' ' + unit, porsi,
                      modalLama: num(r.modal_manual), jual: num(r.harga_baru) });

    const kepala = [r.nama, r.jenis === 'drink' ? 'Minuman' : 'Makanan',
                    r.tipe === 'base' ? 'Base' : 'Menu Jadi', r.seksi || '',
                    1, /^pcs$/i.test(unit) ? 'Pcs' : 'Porsi',
                    Math.round(num(r.harga_baru)), bagi(r.modal_manual, porsi),
                    r.aktif === 0 ? 'Tidak' : 'Ya', teks(r.kode)];
    const kosong = ['', '', '', '', '', '', '', '', '', ''];

    /* CATATAN TAKARAN ASLINYA IKUT, sebagai baris Ref=Catatan — bentuk yang
       memang sudah dipakai modul ini untuk tahap memasak. Tanpa itu, juru
       masak yang membuka resep ini kehilangan satu-satunya keterangan bahwa
       angkanya sudah dibagi: "Iga 100 Gr" terbaca sebagai resep satu porsi
       yang disusun dari awal, padahal ia hasil bagi dari 10.000 Gr untuk 100
       porsi. */
    const isi = [{ catatan: 'Resep dapur aslinya untuk ' + porsi + ' ' + unit
                            + ' — takaran di bawah sudah dibagi ' + porsi + '.' }]
      .concat((r.bahan || []).filter(b => b && (b.nama || b.catatan)));

    isi.forEach((b, i) => {
      const cat = !b.nama && b.catatan;
      baris.push((i === 0 ? kepala : kosong).concat([
        cat ? b.catatan : b.nama,
        cat ? '' : bagi(b.qty, porsi),
        cat ? '' : teks(b.satuan),
        cat ? 'Catatan' : (b.ref === 'resep' ? 'Resep' : 'Bahan'),
        '']));
    });
  });

  /* ---- lembar 2 ---- */
  const lap = [['BAGIAN', 'KETERANGAN', 'DETAIL 1', 'DETAIL 2', 'DETAIL 3']];
  lap.push(['RINGKASAN', 'Resep PRASMANAN di sistem', PRAS.length, '', '']);
  lap.push(['RINGKASAN', 'Dibetulkan jadi 1 porsi', dibetulkan.length, '', '']);
  lap.push(['RINGKASAN', 'Sudah benar (yield 1)', sudahBenar.length, '', '']);
  lap.push(['RINGKASAN', 'Belum bisa dibetulkan', menggantung.length, '', '']);
  lap.push(['', '', '', '', '']);
  lap.push(['DIBETULKAN', 'Takaran bahan & modal manual dibagi jumlah porsinya; yield jadi 1', '', '', '']);
  lap.push(['', 'Menu', 'Yield lama', 'Dibagi', 'Harga jual/porsi']);
  dibetulkan.forEach(x => lap.push(['', x.nama, x.dari, x.porsi, x.jual]));
  lap.push(['', '', '', '', '']);
  lap.push(['BELUM BISA DIBETULKAN', 'Satuan yield-nya bukan porsi, dan jumlah porsinya tidak ada di lembar dapur — COGS%-nya masih belum bisa dibaca. Isi jumlah porsinya lewat Ubah.', '', '', '']);
  lap.push(['', 'Menu', 'Yield sekarang', 'Harga jual/porsi', '']);
  menggantung.forEach(x => lap.push(['', x.nama, x.yield, x.jual, '']));

  fs.writeFileSync(path.join(ROOT, KELUAR + '.xlsx'), buatXlsx([
    { nama: 'Daftar Resep', aoa: [KOL, ...baris] },
    { nama: 'Perlu Dicocokkan', aoa: lap },
  ]));
  const csv = s => { const t = String(s == null ? '' : s); return /[",\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t; };
  fs.writeFileSync(path.join(ROOT, KELUAR + '.csv'),
    [KOL, ...baris].map(r => r.map(csv).join(',')).join('\n'), 'utf8');

  console.log('✓ ' + KELUAR + '.xlsx  (' + baris.length + ' baris)');
  console.log('✓ ' + KELUAR + '.csv');
  console.log('  resep PRASMANAN di sistem : ' + PRAS.length);
  console.log('  dibetulkan jadi 1 porsi   : ' + dibetulkan.length);
  console.log('  sudah benar (yield 1)     : ' + sudahBenar.length);
  console.log('  belum bisa dibetulkan     : ' + menggantung.length);
  if (menggantung.length) {
    console.log('\n  -- belum bisa dibetulkan --');
    menggantung.forEach(x => console.log('     ' + x.nama.padEnd(24) + ' yield ' + x.yield));
  }
  console.log('\nImpor lewat: HPP & Resep → Daftar Resep → Impor.');
  console.log('Resepnya SUDAH ADA, jadi pratinjaunya akan berbunyi "Diperbarui", bukan "Baru".');
})().catch(e => { console.error(e); process.exit(1); });
