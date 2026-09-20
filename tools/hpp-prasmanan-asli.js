/* hpp-prasmanan-asli.js — MENGEMBALIKAN takaran resep PRASMANAN ke aslinya
 *
 *   curl -s "https://dev.laksamanamuda.id/stock-api-mysql/hpp.php" -o tools/hpp-master.json
 *   node tools/hpp-prasmanan-asli.js
 *   node tools/uji-hpp-prasmanan.js
 *
 * Permintaan user 20 September 2026, dan ia MEMBALIK hpp-prasmanan-per-porsi.js
 * yang dijalankan beberapa jam sebelumnya:
 *
 *   "semua takaran tetap sesuai aja yang di recipe aku, jangan di buat per
 *    porsi — tapi untuk hasil (yield-nya) disesuaikan dengan Excel saya
 *    sebelumnya, dari sana saja perhitungan per porsinya."
 *
 * Jadi lembar resepnya kembali terbaca seperti berkas dapurnya: Ayam Prasmanan
 * 24.000 Gr, bukan 120 Gr. Yang menjadikannya per porsi YIELD-nya.
 *
 * ITU BARU MUNGKIN SESUDAH cogsOf() DIBETULKAN di hari yang sama. Sebelumnya
 * modul ini membandingkan modal SATU BATCH dengan harga SATU PORSI, jadi
 * yield selain 1 memajang COGS berlipat sebesar yield-nya — dan itulah yang
 * melahirkan alat per-porsi. Sekarang `cogsOf()` membaginya dengan yield, dan
 * takaran asli tidak lagi merusak satu kolom pun.
 *
 * YANG DIKEMBALIKAN HANYA YANG PERNAH DIBAGI. Penandanya baris catatan yang
 * ditulis alat sebelumnya ("… takaran di bawah sudah dibagi N."), dan N itulah
 * pengalinya. Resep yang tidak punya catatan itu TIDAK DISENTUH: takarannya
 * memang tidak pernah digeser, dan mengalikannya akan melipatgandakan modal
 * barang yang dibeli jadi seperti Bakwan dan Batagor.
 *
 * YIELD-nya DARI EXCEL, BUKAN DARI PENGALINYA — dan keduanya memang tidak
 * selalu sama (13 dari 41 berbeda). Pengali adalah angka yang dipakai alat
 * sebelumnya; yield adalah angka yang tertulis di berkas dapur, dan itu yang
 * diminta user. Dibaca dua tempat, berurutan:
 *
 *   1. label "N Porsi" di baris "Nama Menu" lembar Prasmanan
 *   2. kolom JUMLAH PROD. di lembar Hasil Prasmanan
 *
 * Keduanya SELAMAT dari kerusakan #REF!, yang cuma mengenai kolom harga.
 * Satuannya ikut apa adanya — "10 L", "1Kg", "170 Porsi" — karena mengubahnya
 * jadi Porsi berarti menebak berapa porsi yang keluar dari sepuluh liter.
 *
 * SELISIH YANG WAJIB DIBACA SEBELUM MENGIMPOR: di lembar dapur, Ayam Bakar
 * Padang bertuliskan "100 Porsi" sementara sel harga per porsinya sendiri
 * (Rp9.425 dari total Rp1.884.964) dihitung dengan pembagi 200. Dua sel di
 * berkas yang sama tidak sepakat, dan alat ini menuruti LABELNYA — jadi modal
 * per porsinya Rp18.850, bukan Rp9.425. Kalau yang benar 200, yang perlu
 * dibetulkan angka yield-nya di berkas dapur, bukan alat ini.
 *
 * SUMBER ANGKANYA SISTEM, BUKAN EXCEL. Kolom harga di berkas dapur sudah jadi
 * #REF! sejak sheet-sheet lain dihapus; harga jual, nama bahan yang sudah
 * dicocokkan, dan kode POS semuanya ada di sistem.
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
const KELUAR = 'resep-prasmanan-asli';
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


/* ANGKANYA DIBULATKAN 4 DESIMAL, sama dengan alat pembaginya. Pengali dan
   pembagi yang sama seharusnya memulangkan angka semula persis; pembulatan
   ini yang menahan 119,9999999 muncul di lembar yang orang baca. */
const kali = (v, n) => Math.round(num(v) * n * 10000) / 10000;

/* Angka di depan label yield: "100 Porsi" -> 100, "1Kg" -> 1, "10 L" -> 10. */
const angkaLabel = v => {
  const m = /(\d+(?:[.,]\d+)?)/.exec(teks(v));
  return m ? Number(m[1].replace(',', '.')) : 0;
};
/* Satuannya: apa yang tersisa sesudah angkanya dibuang. Dibiarkan apa adanya —
   menormalkan "Kg" jadi "Porsi" berarti menebak berapa porsi sekilo sambal. */
const satuanLabel = v => teks(teks(v).replace(/^\s*[\d.,]+\s*/, '')) || 'Porsi';

/* DIPAKAI BERSAMA tools/hpp-excel-baru.js. Pemulihannya berdiri sebagai fungsi
   supaya alat itu tidak menyusun ulang aturannya sendiri: dua tempat yang
   memulihkan takaran akan menyimpang, dan yang menyimpang di sini angka uang.
   Berkasnya ditulis di blok main di bawah, bukan di sini. */
async function pulihkan() {
  const jalurMaster = path.join(ROOT, 'tools', 'hpp-master.json');
  if (!fs.existsSync(jalurMaster)) {
    console.error('tools/hpp-master.json tidak ada. Ambil dulu:');
    console.error('  curl -s "https://dev.laksamanamuda.id/stock-api-mysql/hpp.php" -o tools/hpp-master.json');
    process.exit(2);
  }
  const sys = JSON.parse(fs.readFileSync(jalurMaster, 'utf8'));
  const PRAS = (sys.resep || []).filter(r => /^PRASMANAN/i.test(teks(r.seksi)));
  if (!PRAS.length) { console.error('Tidak ada resep berseksi PRASMANAN di master.'); process.exit(2); }

  /* ---- label yield dari berkas dapur ---- */
  const labelRinci = new Map();   // lembar Prasmanan, baris "Nama Menu"
  const labelHasil = new Map();   // lembar Hasil Prasmanan, kolom JUMLAH PROD.
  const jalurX = path.isAbsolute(SUMBER_XLSX) ? SUMBER_XLSX : path.join(ROOT, SUMBER_XLSX);
  if (!fs.existsSync(jalurX)) {
    console.error('BERHENTI — ' + SUMBER_XLSX + ' tidak ada.');
    console.error('Yield-nya dibaca dari berkas itu; tanpa berkasnya tidak ada yang bisa dipakai,');
    console.error('dan menebaknya dari pengali berarti mengabaikan justru yang diminta user.');
    process.exit(3);
  }
  {
    const lembar = await W.bacaBerkasLembar(new Blob([fs.readFileSync(jalurX)]));
    const idx = h => { let v = 0; for (const c of h) v = v * 26 + (c.charCodeAt(0) - 64); return v - 1; };
    const R = lembar.find(x => teks(x.nama).toLowerCase() === 'prasmanan');
    if (R) R.baris.forEach(b => Object.keys(b).forEach(k => {
      if (teks(b[k]).toLowerCase() !== 'nama menu') return;
      const c = idx(k), nama = teks(b[huruf(c + 1)]);
      /* Labelnya berdiri DUA SEL di kanan nama menu, dan sel di antaranya
         memang kosong di berkas ini. Dicari dalam jendela kecil, bukan
         dipatok, supaya satu kolom yang digeser tidak menghilangkannya. */
      let lbl = '';
      for (let d = 2; d <= 4 && !lbl; d++) {
        const v = teks(b[huruf(c + d)]);
        if (/\d/.test(v) && /porsi|pcs|pax|kg|ml|gr/i.test(v)) lbl = v;
      }
      if (nama && lbl) labelRinci.set(kunci(nama), lbl);
    }));
    const H = lembar.find(x => /hasil prasmanan/i.test(x.nama));
    if (H) H.baris.forEach(b => {
      const nama = teks(b && b.C), prod = teks(b && b.D);
      if (nama && /\d/.test(prod)) labelHasil.set(kunci(nama), prod);
    });
  }

  const baris = [], dipulihkan = [], tanpaLabel = [], dilewati = [], satuanAneh = [], resepBaru = [];
  PRAS.forEach(r => {
    /* PENANDANYA CATATAN, bukan yield: resep yang yield-nya kebetulan 1 tapi
       tidak pernah dibagi tidak punya takaran asli untuk dikembalikan, dan
       mengalikannya akan melipatgandakan modal barang yang dibeli jadi
       seperti Bakwan dan Batagor. */
    const cat = (r.bahan || []).find(b => b && b.nama === undefined && b.catatan);
    const m = cat && /dibagi\s+([\d.,]+)/i.exec(cat.catatan);
    if (!m) { dilewati.push(r.nama); return; }
    const pengali = Number(String(m[1]).replace(/,/g, '')) || 0;
    if (pengali <= 1) { dilewati.push(r.nama); return; }

    const lbl = labelRinci.get(kunci(r.nama)) || labelHasil.get(kunci(r.nama)) || '';
    if (!lbl) {
      /* TIDAK DITEBAK dari pengalinya. Pengali adalah angka yang dipakai alat
         sebelumnya — sudah terbukti berbeda dari berkas dapur di 13 resep —
         dan memakainya di sini berarti diam-diam mengabaikan yang diminta. */
      tanpaLabel.push({ nama: r.nama, pengali });
      return;
    }
    const yq = angkaLabel(lbl) || pengali;
    const yu = satuanLabel(lbl);

    /* SATUAN YIELD YANG BUKAN PORSI membuat COGS-nya tidak bisa dibaca, dan
       itu WAJIB dikatakan — bukan didiamkan dan bukan pula ditebak. Sambal
       Merah bertuliskan "1Kg" di berkas dapur sementara harga jualnya Rp2.000
       PER PORSI; modul membandingkan modal per yield dengan harga jual, jadi
       yang keluar modal SEKILO dibagi harga SEPORSI. Menebak berapa porsi
       sekilo sambal adalah keputusan tentang uang yang tidak pernah diambil
       siapa pun; yang benar mengisi jumlah porsinya di berkas dapur. */
    const bukanPorsi = !/^(porsi|pcs|pax)$/i.test(yu) && num(r.harga_baru) > 0;
    if (bukanPorsi) satuanAneh.push({ nama: r.nama, yield: yq + ' ' + yu, jual: num(r.harga_baru) });

    dipulihkan.push({ nama: r.nama, pengali, yield: yq + ' ' + yu,
                      beda: yq !== pengali, jual: num(r.harga_baru), bukanPorsi });

    const kepala = [r.nama, r.jenis === 'drink' ? 'Minuman' : 'Makanan',
                    r.tipe === 'base' ? 'Base' : 'Menu Jadi', r.seksi || '',
                    yq, yu,
                    Math.round(num(r.harga_baru)), kali(r.modal_manual, pengali),
                    r.aktif === 0 ? 'Tidak' : 'Ya', teks(r.kode)];
    const kosong = ['', '', '', '', '', '', '', '', '', ''];

    /* CATATAN PEMBAGI DIBUANG, diganti yang menyebut keadaan sekarang.
       Dibiarkan, lembar resepnya berbunyi "sudah dibagi 200" di atas takaran
       yang justru tidak dibagi apa pun — dan juru masak yang membacanya akan
       membaginya sendiri sekali lagi. */
    const isi = [{ catatan: 'Takaran di bawah apa adanya dari berkas HPP dapur, untuk '
                            + yq + ' ' + yu + '. Modal per satuan dihitung sistem dari yield ini.' }]
      .concat((r.bahan || []).filter(b => b && b.nama));

    /* Bentuk resep yang SUDAH dipulihkan, untuk dijalankan modulnya oleh
       hpp-excel-baru.js. Baris catatannya ikut apa adanya — ia memang bagian
       dari resepnya, dan modul HPP sudah mengerti baris tanpa nama. */
    resepBaru.push(Object.assign({}, r, {
      yield_qty: yq, yield_unit: yu,
      modal_manual: kali(r.modal_manual, pengali),
      bahan: isi.map(b => (b.nama ? Object.assign({}, b, { qty: kali(b.qty, pengali) }) : b))
    }));

    isi.forEach((b, i) => {
      const c = !b.nama && b.catatan;
      baris.push((i === 0 ? kepala : kosong).concat([
        c ? b.catatan : b.nama,
        c ? '' : kali(b.qty, pengali),
        c ? '' : teks(b.satuan),
        c ? 'Catatan' : (b.ref === 'resep' ? 'Resep' : 'Bahan'),
        '']));
    });
  });

  return { sys, PRAS, baris, dipulihkan, tanpaLabel, dilewati, satuanAneh, resepBaru };
}
module.exports = { pulihkan, KOL, buatXlsx, teks, num, kunci, huruf };

/* Hanya saat dijalankan langsung; di-require alat lain, yang diambil cuma
   pulihkan() dan berkasnya tidak ikut ditulis ulang. */
if (require.main === module) (async () => {
  const { PRAS, baris, dipulihkan, tanpaLabel, dilewati, satuanAneh } = await pulihkan();

  /* ---- lembar 2 ---- */
  const lap = [['BAGIAN', 'KETERANGAN', 'DETAIL 1', 'DETAIL 2', 'DETAIL 3']];
  lap.push(['RINGKASAN', 'Resep PRASMANAN di sistem', PRAS.length, '', '']);
  lap.push(['RINGKASAN', 'Takarannya dikembalikan', dipulihkan.length, '', '']);
  lap.push(['RINGKASAN', 'Yield-nya BEDA dari pengali', dipulihkan.filter(x => x.beda).length, '', '']);
  lap.push(['RINGKASAN', 'Tidak disentuh (tidak pernah dibagi)', dilewati.length, '', '']);
  lap.push(['RINGKASAN', 'Tidak ada label yield di berkas dapur', tanpaLabel.length, '', '']);
  lap.push(['RINGKASAN', 'Satuan yield bukan porsi (COGS tak terbaca)', satuanAneh.length, '', '']);
  lap.push(['', '', '', '', '']);
  lap.push(['DIKEMBALIKAN', 'Takaran bahan & modal manual dikalikan lagi; yield diambil dari berkas dapur', '', '', '']);
  lap.push(['', 'Menu', 'Dikali', 'Yield dari Excel', 'Harga jual']);
  dipulihkan.forEach(x => lap.push(['', x.nama, x.pengali,
    x.yield + (x.beda ? '   <- beda dari pengali' : ''), x.jual]));
  lap.push(['', '', '', '', '']);
  lap.push(['SATUAN YIELD BUKAN PORSI', 'Berkas dapur menuliskan hasilnya dalam Kg/Liter sementara harga jualnya per porsi, jadi COGS% menu ini TIDAK BISA DIBACA. Isi jumlah porsinya di berkas dapur (mis. "100 Porsi"), lalu jalankan alat ini lagi.', '', '', '']);
  lap.push(['', 'Menu', 'Yield dari Excel', 'Harga jual/porsi', '']);
  satuanAneh.forEach(x => lap.push(['', x.nama, x.yield, x.jual, '']));
  lap.push(['', '', '', '', '']);
  lap.push(['TANPA LABEL YIELD', 'Namanya tidak ketemu di lembar Prasmanan maupun Hasil Prasmanan, jadi yield-nya tidak ditebak. Takarannya dibiarkan per porsi seperti sekarang.', '', '', '']);
  tanpaLabel.forEach(x => lap.push(['', x.nama, 'pengali ' + x.pengali, '', '']));

  fs.writeFileSync(path.join(ROOT, KELUAR + '.xlsx'), buatXlsx([
    { nama: 'Daftar Resep', aoa: [KOL, ...baris] },
    { nama: 'Perlu Dicocokkan', aoa: lap },
  ]));
  const csv = s => { const t = String(s == null ? '' : s); return /[",\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t; };
  fs.writeFileSync(path.join(ROOT, KELUAR + '.csv'),
    [KOL, ...baris].map(r => r.map(csv).join(',')).join('\n'), 'utf8');

  console.log('* ' + KELUAR + '.xlsx  (' + baris.length + ' baris)');
  console.log('* ' + KELUAR + '.csv');
  console.log('  resep PRASMANAN di sistem      : ' + PRAS.length);
  console.log('  takarannya dikembalikan        : ' + dipulihkan.length);
  console.log('  yield-nya beda dari pengali    : ' + dipulihkan.filter(x => x.beda).length);
  console.log('  tidak disentuh                 : ' + dilewati.length);
  console.log('  tanpa label yield di berkas    : ' + tanpaLabel.length);
  console.log('  satuan yield bukan porsi       : ' + satuanAneh.length);
  if (dipulihkan.some(x => x.beda)) {
    console.log('\n  -- yield dari Excel BERBEDA dari pengalinya --');
    dipulihkan.filter(x => x.beda).forEach(x =>
      console.log('     ' + x.nama.padEnd(22) + ' dikali ' + String(x.pengali).padStart(4) + '  ->  yield ' + x.yield));
  }
  if (satuanAneh.length) {
    console.log('');
    console.log('  -- SATUAN YIELD BUKAN PORSI, COGS%-nya tidak bisa dibaca --');
    satuanAneh.forEach(x => console.log('     ' + x.nama.padEnd(22) + ' yield ' + String(x.yield).padEnd(10) + ' harga jual/porsi ' + x.jual));
    console.log('     Isi jumlah porsinya di berkas dapur lalu jalankan alat ini lagi.');
  }
  if (tanpaLabel.length) {
    console.log('\n  -- tanpa label yield, dibiarkan --');
    tanpaLabel.forEach(x => console.log('     ' + x.nama));
  }
  console.log('\nImpor lewat: HPP & Resep -> Daftar Resep -> Impor.');
  console.log('Resepnya SUDAH ADA, jadi pratinjaunya berbunyi "Diperbarui", bukan "Baru".');
})().catch(e => { console.error(e); process.exit(1); });
