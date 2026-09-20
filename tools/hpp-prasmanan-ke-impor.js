/* hpp-prasmanan-ke-impor.js — berkas HPP Food dapur → berkas impor Daftar Resep
 *
 *   node tools/hpp-prasmanan-ke-impor.js
 *   node tools/hpp-prasmanan-ke-impor.js "HPP Food Laksamana Updated March 2026.xlsx"
 *
 * Permintaan user 20 September 2026: memindahkan tab *Prasmanan* dan *Hasil
 * Prasmanan* dari berkas HPP milik dapur ke modul HPP & Resep, sebagai
 * kelompok resep yang berdiri sendiri — "khusus untuk prasmanan".
 *
 * YANG DIHASILKAN dua berkas di root repo (keduanya di .gitignore):
 *   resep-prasmanan-untuk-impor-hpp.xlsx   lembar 1 siap diimpor, lembar 2 laporan
 *   resep-prasmanan-untuk-impor-hpp.csv    isi yang sama, untuk jalur impor CSV
 *
 * ALATNYA TIDAK MENULIS APA PUN KE DATABASE. Yang mengimpor tetap orang,
 * lewat HPP & Resep → Daftar Resep → Impor — di sana ada pratinjau yang
 * menyebut berapa baru, berapa diperbarui, dan bahan apa yang belum dikenal
 * SEBELUM satu baris pun ditulis.
 *
 * DUA KEPUTUSAN YANG MENENTUKAN ANGKANYA, dan keduanya dilaporkan di lembar
 * kedua supaya bisa diperiksa mata:
 *
 *   1. DAFTAR INDUKNYA "Hasil Prasmanan", bukan lembar rincian. Di sanalah
 *      kategori, jumlah produksi, dan harga jual berdiri — tiga hal yang
 *      tidak ada di lembar rincian sama sekali.
 *
 *   2. Menu dicocokkan ke rinciannya lewat NAMA dulu, lalu MODAL TOTAL.
 *      Lapis kedua perlu karena namanya memang berbeda di dua lembar: "Sop
 *      Buntut" vs "Soup Buntut", "Teh" vs "Es Teh", "Coklat" vs "Pudding
 *      Coklat", "Nasi Goreng" vs "Nasi Goreng Kampoeng". Modalnya angka
 *      panjang berdesimal (2.627.000 · 26.079,88772 · 437.385,6884), jadi
 *      kecocokan angka jauh lebih kuat daripada menebak dari kemiripan kata
 *      — dan hanya dipakai kalau kecocokannya TUNGGAL.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const ROOT = path.resolve(__dirname, '..');

/* Pembacanya ASET REPO, bukan pustaka lain: yang dibaca di sini jadi sama
   persis dengan yang dibaca modul Analytics & Jadwal saat mereka membaca
   Excel. Dua pembaca .xlsx berarti dua hasil untuk satu berkas. */
const W = {};
new Function('window', fs.readFileSync(path.join(ROOT, 'deploy/assets/xlsx-baca.js'), 'utf8'))(W);

const SUMBER = process.argv[2] || 'HPP Food Laksamana Updated March 2026.xlsx';
const KELUAR = 'resep-prasmanan-untuk-impor-hpp';

/* Kolomnya SAMA PERSIS dengan KOL_RESEP di deploy/stock/hpp — itu yang dicari
   petaKolom() saat berkasnya diimpor. Satu nama yang meleset membuat seluruh
   kolomnya terbaca kosong tanpa satu pun galat. */
const KOL = ['Nama Resep', 'Jenis', 'Tipe', 'Seksi', 'Yield Qty', 'Yield Unit',
             'Harga Jual', 'Modal Manual', 'Aktif', 'Kode POS', 'Bahan', 'Qty', 'Satuan', 'Ref',
             'Modal (otomatis)'];

const huruf = i => { let s = ''; i++; while (i > 0) { const r = (i - 1) % 26; s = String.fromCharCode(65 + r) + s; i = (i - 1 - r) / 26; } return s; };
const idx = h => { let v = 0; for (const c of h) v = v * 26 + (c.charCodeAt(0) - 64); return v - 1; };
const teks = v => String(v == null ? '' : v).trim();
const angka = v => { const n = Number(String(v == null ? '' : v).replace(/[^0-9.\-]/g, '')); return isFinite(n) ? n : 0; };
const bulat2 = n => Math.round(n * 100) / 100;
/* Nama dibandingkan setelah dirapikan: huruf kecil, tanpa tanda baca, spasi
   tunggal. Tanpa itu "Bawang  Merah" dan "Bawang Merah" jadi dua bahan
   berbeda, dan yang kedua tidak pernah ketemu di master. */
const kunci = s => teks(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/* ==================== PENULIS .xlsx ====================
   Ditulis sendiri karena repo ini tidak punya penulis xlsx sama sekali:
   deploy/assets/xlsx-baca.js cuma MEMBACA, dan modul yang mengekspor Excel
   memakai SheetJS dari CDN — tidak ada di Node. */
const escX = s => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  /* Karakter kendali ilegal di XML 1.0: Excel menolak SELURUH berkas kalau
     ada satu saja, dengan pesan yang tidak menyebut selnya. */
  .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');

function sheetXml(aoa) {
  const baris = aoa.map((row, r) => {
    const sel = row.map((v, c) => {
      const ref = huruf(c) + (r + 1);
      if (v === null || v === undefined || v === '') return '';
      if (typeof v === 'number' && isFinite(v)) return '<c r="' + ref + '"><v>' + v + '</v></c>';
      return '<c r="' + ref + '" t="inlineStr"><is><t xml:space="preserve">' + escX(v) + '</t></is></c>';
    }).join('');
    return '<row r="' + (r + 1) + '">' + sel + '</row>';
  }).join('');
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
    + '<sheetData>' + baris + '</sheetData></worksheet>';
}
function crc32(buf) {
  let c, tabel = crc32.t;
  if (!tabel) {
    tabel = crc32.t = [];
    for (let n = 0; n < 256; n++) { c = n; for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1); tabel[n] = c >>> 0; }
  }
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ tabel[(crc ^ buf[i]) & 0xFF];
  return (crc ^ 0xFFFFFFFF) >>> 0;
}
/* Cap waktu DOS. Dibiarkan nol, arsipnya terbaca bertanggal "1980-00-00" —
   bulan 0 tidak sah, dan sebagian pembaca ZIP menolaknya karena itu walau
   isinya baik-baik saja. */
function capDos(d) {
  return { tgl: (((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xFFFF,
           jam: ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)) & 0xFFFF };
}
function zip(berkas) {
  const cap = capDos(new Date());
  const lokal = [], pusat = []; let off = 0;
  berkas.forEach(f => {
    const data = Buffer.from(f.isi, 'utf8');
    const comp = zlib.deflateRawSync(data);
    const crc = crc32(data);
    const nama = Buffer.from(f.nama, 'utf8');
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0, 6);
    lh.writeUInt16LE(8, 8); lh.writeUInt16LE(cap.jam, 10); lh.writeUInt16LE(cap.tgl, 12);
    lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(comp.length, 18); lh.writeUInt32LE(data.length, 22);
    lh.writeUInt16LE(nama.length, 26); lh.writeUInt16LE(0, 28);
    lokal.push(lh, nama, comp);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6);
    ch.writeUInt16LE(0, 8); ch.writeUInt16LE(8, 10); ch.writeUInt16LE(cap.jam, 12); ch.writeUInt16LE(cap.tgl, 14);
    ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(comp.length, 20); ch.writeUInt32LE(data.length, 24);
    ch.writeUInt16LE(nama.length, 28); ch.writeUInt32LE(off, 42);
    pusat.push(ch, nama);
    off += lh.length + nama.length + comp.length;
  });
  const isiPusat = Buffer.concat(pusat);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(berkas.length, 8); eocd.writeUInt16LE(berkas.length, 10);
  eocd.writeUInt32LE(isiPusat.length, 12); eocd.writeUInt32LE(off, 16);
  return Buffer.concat([Buffer.concat(lokal), isiPusat, eocd]);
}
function buatXlsx(lembar) {
  const f = [];
  f.push({ nama: '[Content_Types].xml', isi:
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
    + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
    + '<Default Extension="xml" ContentType="application/xml"/>'
    + '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
    + lembar.map((l, i) => '<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>').join('')
    + '</Types>' });
  f.push({ nama: '_rels/.rels', isi:
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
    + '</Relationships>' });
  f.push({ nama: 'xl/workbook.xml', isi:
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"'
    + ' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>'
    + lembar.map((l, i) => '<sheet name="' + escX(l.nama) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>').join('')
    + '</sheets></workbook>' });
  f.push({ nama: 'xl/_rels/workbook.xml.rels', isi:
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    + lembar.map((l, i) => '<Relationship Id="rId' + (i + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>').join('')
    + '</Relationships>' });
  lembar.forEach((l, i) => f.push({ nama: 'xl/worksheets/sheet' + (i + 1) + '.xml', isi: sheetXml(l.aoa) }));
  return zip(f);
}

/* ==================== PENGURAI LEMBAR HPP ====================

   Lembar "Prasmanan" berbentuk BLOK KOLOM PARALEL: enam kategori berjajar ke
   kanan (BEEF · UDANG · AYAM · IKAN · SOUP · PROTEIN RINGAN), masing-masing
   5 kolom + 1 pemisah, dan tiap blok berisi beberapa resep bertumpuk ke
   bawah.

   TITIK AWAL TIAP RESEP DICARI, BUKAN DITEBAK DARI JARAKNYA. Kolom bloknya
   memang berjarak tetap hari ini, tapi menebaknya dari satu blok yang
   kebetulan terlihat adalah cara tercepat kehilangan separuh resepnya tanpa
   satu pun galat — dan kategori blok itu TIDAK berlaku untuk resep di
   bagian bawah lembar, yang isinya minuman. */
function uraiPrasmanan(B) {
  const titik = [];
  B.forEach((b, r) => Object.keys(b).forEach(k => {
    if (teks(b[k]).toLowerCase() === 'nama menu') titik.push({ r, c: idx(k) });
  }));
  titik.sort((a, b) => a.c - b.c || a.r - b.r);

  return titik.map(t => {
    const K = i => huruf(t.c + i);
    const nama = teks(B[t.r][K(1)]);
    const prod = teks(B[t.r][K(3)]);
    const bahan = [];
    let total = 0;
    /* Dikumpulkan sampai "Total" atau "Nama Menu" BERIKUTNYA di kolom yang
       sama. TIDAK berhenti di baris kosong: sebagian resep punya baris kosong
       di tengahnya sebelum barisan Total, dan berhenti di situ memotong
       resepnya diam-diam — persis yang terjadi pada Sop Buntut di putaran
       pertama alat ini. */
    for (let r = t.r + 2; r < B.length; r++) {
      const a = teks(B[r][K(0)]);
      if (a.toLowerCase() === 'nama menu') break;
      if (/^total\b/i.test(a)) {
        /* "Total" dulu, baru "Total - 20%". Yang diambil yang PERTAMA: angka
           sesudah diskon bukan modal bahannya. */
        if (!total) total = angka(B[r][K(4)]);
        break;
      }
      if (a.toLowerCase() === 'nama bahan') continue;
      if (a) bahan.push({ nama: a, qty: angka(B[r][K(1)]), satuan: teks(B[r][K(2)]) });
    }
    return { nama, prod, bahan, total, letak: huruf(t.c) + (t.r + 1) };
  }).filter(x => x.nama);
}

function uraiHasil(B) {
  return B.filter(b => {
    const c = teks(b.C);
    return c && c.toLowerCase() !== 'nama menu';
  }).map(b => ({
    kategori: teks(b.B) || '(tanpa kategori)',
    nama: teks(b.C), prod: teks(b.D),
    modal: angka(b.E), modalPorsi: angka(b.F),
    satuan: teks(b.H) || 'Porsi', jual: angka(b.I),
  }));
}

/* "100 Pax" → 100 Porsi · "1Kg" → 1 Kg · "10 L" → 10 L.
   Yang tidak terbaca jatuh ke 1 Porsi — BUKAN ditebak dari modalnya di sini;
   pembetulan lewat angka dikerjakan di bawah, di tempat kedua angkanya ada,
   dan selalu dilaporkan. */
function uraiYield(s) {
  const m = teks(s).match(/^\s*([\d.,]+)\s*(.*)$/);
  if (!m) return { qty: 1, unit: 'Porsi' };
  const qty = Number(String(m[1]).replace(/,/g, '')) || 1;
  let unit = teks(m[2]) || 'Porsi';
  if (/^pax$/i.test(unit)) unit = 'Porsi';
  return { qty, unit };
}

/* ==================== SUSUN BERKAS ==================== */
(async () => {
  const jalurSumber = path.isAbsolute(SUMBER) ? SUMBER : path.join(ROOT, SUMBER);
  if (!fs.existsSync(jalurSumber)) {
    console.error('Berkas sumber tidak ada: ' + jalurSumber);
    console.error('Berkas HPP tidak masuk repo (lihat .gitignore) — taruh berkasnya di root repo dulu.');
    process.exit(2);
  }
  const lembar = await W.bacaBerkasLembar(new Blob([fs.readFileSync(jalurSumber)]));
  const cari = n => {
    const l = lembar.find(x => x.nama.trim().toLowerCase() === n.toLowerCase());
    if (!l) { console.error('Lembar "' + n + '" tidak ada di berkas itu. Yang ada: '
      + lembar.map(x => x.nama).join(', ')); process.exit(2); }
    return l.baris;
  };
  const R = uraiPrasmanan(cari('Prasmanan'));
  const H = uraiHasil(cari('Hasil Prasmanan'));

  /* ============ BERKAS SUMBER YANG RUSAK DITOLAK, BUKAN DIURAI ============
     Terjadi 20 September 2026: sheet-sheet harga dihapus dari berkas dapur,
     dan seluruh rumus yang menunjuk ke sana berubah jadi #REF! — termasuk
     kolom MODAL dan HARGA JUAL di "Hasil Prasmanan".

     Diurai apa adanya, alat ini tetap menghasilkan berkas yang kelihatan
     lengkap: 77 resep, nama & takaran bahannya benar, tapi harga jualnya NOL
     untuk 50 menu. Dan berkas itu diimpor akan MENIMPA harga jual yang sudah
     benar di sistem dengan nol — tanpa satu pun galat, karena dari sisi
     impor itu penyimpanan yang sah.

     Jadi berhenti di sini. Yang rusak berkas sumbernya, dan satu-satunya
     jalan keluarnya memulihkan berkas itu — bukan meneruskan dengan angka
     yang hilang. */
  const rusak = H.filter(h => !(h.jual > 0) && !(h.modal > 0)).length;
  if (rusak > H.length / 3) {
    console.error('BERHENTI — kolom MODAL & HARGA JUAL di lembar "Hasil Prasmanan" kosong');
    console.error('untuk ' + rusak + ' dari ' + H.length + ' menu.');
    console.error('');
    console.error('Sebabnya hampir pasti rumus #REF!: sheet yang dirujuknya sudah dihapus');
    console.error('dari berkas ini. Yang selamat cuma nama bahan, takaran, dan satuannya.');
    console.error('');
    console.error('Diteruskan, berkas hasilnya akan memuat harga jual NOL — dan mengimpornya');
    console.error('MENIMPA harga jual yang sudah benar di sistem.');
    console.error('');
    console.error('Yang perlu dikerjakan: pulihkan berkas HPP dapur yang sheet harganya masih');
    console.error('utuh. Kalau resepnya SUDAH ada di sistem dan yang perlu dibetulkan cuma');
    console.error('yield-nya, pakai tools/hpp-prasmanan-per-porsi.js — alat itu membaca');
    console.error('angkanya dari sistem, bukan dari berkas ini.');
    process.exit(3);
  }

  /* Master bahan & resep sistem: dipakai membedakan bahan yang SUDAH dikenal
     dari yang belum, dan mengambil EJAAN master untuk yang sudah ada —
     pencocokannya huruf kecil, jadi menemukan bukan berarti sekalian
     mengganti namanya.

     BERKASNYA TIDAK MASUK REPO (lihat .gitignore): isinya harga beli seluruh
     bahan perusahaan. Diambil sendiri saat perlu:

       curl -s "https://dev.laksamanamuda.id/stock-api-mysql/hpp.php" \
         -o tools/hpp-master.json

     Tanpa berkas itu alatnya TETAP JALAN — seluruh bahan cuma dianggap belum
     dikenal, dan itu DIKATAKAN di lembar laporan. Didiamkan, daftar "29 bahan
     belum dikenal" terbaca sebagai hasil pencocokan padahal tidak ada satu
     pun yang pernah dicocokkan. */
  let mBahan = new Map(), mResep = new Map(), adaMaster = false;
  const jalurMaster = path.join(ROOT, 'tools', 'hpp-master.json');
  if (fs.existsSync(jalurMaster)) {
    const sys = JSON.parse(fs.readFileSync(jalurMaster, 'utf8'));
    (sys.bahan || []).forEach(b => mBahan.set(kunci(b.nama), b.nama));
    (sys.resep || []).forEach(r => mResep.set(kunci(r.nama), r.nama));
    adaMaster = true;
  } else {
    console.log('! tools/hpp-master.json tidak ada — nama bahan TIDAK dicocokkan ke sistem.');
    console.log('  Ambil dulu:  curl -s "https://dev.laksamanamuda.id/stock-api-mysql/hpp.php" -o tools/hpp-master.json\n');
  }

  /* ---- menu ↔ rincian ---- */
  const byNama = new Map(), byModal = new Map();
  R.forEach(r => {
    const k = kunci(r.nama);
    if (!byNama.has(k)) byNama.set(k, []); byNama.get(k).push(r);
    if (r.total > 0) {
      const m = Math.round(r.total * 100);
      if (!byModal.has(m)) byModal.set(m, []); byModal.get(m).push(r);
    }
  });
  const terpakai = new Set(), lewatModal = [];
  H.forEach(h => {
    const kn = byNama.get(kunci(h.nama));
    if (kn && kn.length) { h._r = kn[0]; terpakai.add(kn[0]); return; }
    if (h.modal > 0) {
      const km = byModal.get(Math.round(h.modal * 100));
      /* HANYA kalau kecocokannya TUNGGAL. Dua resep bermodal sama tidak bisa
         dibedakan dari angkanya, dan menebak salah satunya memasang bahan
         menu lain ke menu ini — salah yang angkanya tetap terlihat wajar. */
      if (km && km.length === 1) {
        h._r = km[0]; terpakai.add(km[0]);
        lewatModal.push({ menu: h.nama, rincian: km[0].nama, modal: h.modal, letak: km[0].letak });
      }
    }
  });

  /* ---- baris berkas ---- */
  const baris = [], takKenal = new Map(), yieldBetul = [];
  H.forEach(h => {
    const r = h._r;
    /* YIELD DARI LEMBAR RINCIAN DULU: kolom JUMLAH PROD. di daftar resmi
       sesekali salah isi — "Iga Bakar" tertulis sebagai jumlah produksinya
       sendiri. Dan yield bukan sekadar label di sini: ia PEMBAGI modal per
       porsi. */
    let y = uraiYield((r && r.prod) || h.prod);
    const dariAngka = (h.modal > 0 && h.modalPorsi > 0) ? h.modal / h.modalPorsi : 0;
    if (dariAngka > 0 && Math.abs(dariAngka - y.qty) > 0.5) {
      const bulat = Math.round(dariAngka);
      /* Modal ÷ modal-per-porsi memberi jumlah porsi dari DUA angka yang
         dua-duanya tertulis di berkasnya — bukan tebakan.

         SATUANNYA IKUT BERGANTI ke satuan kolom "HARGA PER PORSI", yaitu
         Porsi: pembaginya modal-per-PORSI, jadi hasilnya jumlah porsi, bukan
         jumlah kilogram. "Sambal Merah 1Kg" yang dikoreksi jadi 100 sambil
         satuannya dibiarkan berbunyi "100 Kg" — seratus kali lipat dari yang
         benar-benar diproduksi. */
      yieldBetul.push({ menu: h.nama, tertulis: (r && r.prod) || h.prod,
                        dihitung: bulat2(dariAngka) + ' ' + (h.satuan || 'Porsi') });
      if (Math.abs(dariAngka - bulat) < 0.02) y = { qty: bulat, unit: h.satuan || 'Porsi' };
    }

    const jenis = /drink/i.test(h.kategori) ? 'Minuman' : 'Makanan';
    /* SEKSI diberi awalan PRASMANAN supaya kelompok ini berdiri sendiri di
       Daftar Resep dan tidak tercampur dengan resep à la carte yang sudah
       ada — permintaan user: "khusus untuk prasmanan". */
    const seksi = 'PRASMANAN - ' + h.kategori.toUpperCase();
    /* MODAL MANUAL hanya untuk menu yang TIDAK punya rincian bahan. Yang
       punya bahan dihitung sistem dari bahannya; mengisi keduanya membuat
       modalnya terhitung DUA KALI. */
    const modalManual = r ? 0 : Math.round(h.modal);
    const kepala = [h.nama, jenis, 'Menu Jadi', seksi, y.qty, y.unit,
                    Math.round(h.jual), modalManual, 'Ya', ''];
    const kosong = ['', '', '', '', '', '', '', '', '', ''];

    const isi = (r && r.bahan.length) ? r.bahan : [];
    if (!isi.length) { baris.push(kepala.concat(['', '', '', '', Math.round(h.modal)])); return; }
    isi.forEach((b, i) => {
      const k = kunci(b.nama);
      let ref = 'Bahan', nama = b.nama;
      if (mBahan.has(k)) nama = mBahan.get(k);
      else if (mResep.has(k)) { ref = 'Resep'; nama = mResep.get(k); }
      else {
        if (!takKenal.has(k)) takKenal.set(k, { nama: b.nama, satuan: b.satuan, n: 0 });
        takKenal.get(k).n++;
      }
      baris.push((i === 0 ? kepala : kosong).concat([
        nama, bulat2(b.qty), b.satuan, ref, i === 0 ? Math.round(h.modal) : '']));
    });
  });

  /* ---- lembar 2: yang masih perlu dicocokkan tangan ---- */
  const nganggur = R.filter(r => !terpakai.has(r));
  const lap = [['BAGIAN', 'KETERANGAN', 'DETAIL 1', 'DETAIL 2', 'DETAIL 3']];
  const tulisRingkas = (k, v) => lap.push(['RINGKASAN', k, v, '', '']);
  tulisRingkas('Menu di daftar resmi (Hasil Prasmanan)', H.length);
  tulisRingkas('Menu yang dapat rincian bahan', H.filter(h => h._r).length);
  tulisRingkas('Menu tanpa rincian (pakai Modal Manual)', H.filter(h => !h._r).length);
  tulisRingkas('Nama bahan belum dikenal sistem', takKenal.size);
  if (!adaMaster) tulisRingkas('CATATAN', 'tools/hpp-master.json tidak ada — tidak ada nama bahan yang bisa dicocokkan ke sistem');
  lap.push(['', '', '', '', '']);

  lap.push(['BAHAN BELUM DIKENAL', 'Barisnya TETAP tersimpan, tapi modalnya dihitung TANPA bahan ini sampai namanya ada di Bahan & Harga', '', '', '']);
  lap.push(['', 'Nama di berkas HPP', 'Satuan', 'Dipakai', '']);
  [...takKenal.values()].sort((a, b) => b.n - a.n).forEach(v => lap.push(['', v.nama, v.satuan, v.n + '×', '']));
  lap.push(['', '', '', '', '']);

  lap.push(['DICOCOKKAN LEWAT MODAL', 'Namanya BERBEDA di dua lembar, dipasangkan karena modal totalnya sama persis — periksa sekali', '', '', '']);
  lap.push(['', 'Menu (Hasil Prasmanan)', 'Rincian (Prasmanan)', 'Modal', 'Letak']);
  lewatModal.forEach(x => lap.push(['', x.menu, x.rincian, x.modal, x.letak]));
  lap.push(['', '', '', '', '']);

  lap.push(['RINCIAN TIDAK TERPAKAI', 'Ada di lembar Prasmanan tapi tidak ada di daftar resmi — TIDAK ikut diimpor', '', '', '']);
  lap.push(['', 'Nama', 'Jumlah bahan', 'Modal', 'Letak']);
  nganggur.forEach(r => lap.push(['', r.nama, r.bahan.length, r.total || '', r.letak]));
  lap.push(['', '', '', '', '']);

  lap.push(['YIELD DIBETULKAN', 'Jumlah produksi yang tertulis berbeda dari modal ÷ modal-per-porsi', '', '', '']);
  lap.push(['', 'Menu', 'Tertulis', 'Dipakai', '']);
  yieldBetul.forEach(x => lap.push(['', x.menu, x.tertulis, x.dihitung, '']));
  lap.push(['', '', '', '', '']);

  /* Bahan yang NAMANYA sudah ditulis tapi TAKARANNYA belum. Barisnya tetap
     ikut — dibuang, resepnya kehilangan daftar bahan yang sudah disusun
     orang — tapi modalnya dihitung tanpa bahan itu, dan itu harus terbaca. */
  lap.push(['TAKARAN BELUM DIISI', 'Nama bahannya ada di berkas HPP, angkanya belum — barisnya ikut, modalnya dihitung TANPA bahan ini', '', '', '']);
  lap.push(['', 'Menu', 'Bahan', '', '']);
  H.filter(h => h._r).forEach(h => h._r.bahan.filter(b => !(Number(b.qty) > 0))
    .forEach(b => lap.push(['', h.nama, b.nama, '', ''])));

  /* ---- tulis ---- */
  fs.writeFileSync(path.join(ROOT, KELUAR + '.xlsx'), buatXlsx([
    { nama: 'Daftar Resep', aoa: [KOL, ...baris] },
    { nama: 'Perlu Dicocokkan', aoa: lap },
  ]));
  const csv = s => { const t = String(s == null ? '' : s); return /[",\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t; };
  fs.writeFileSync(path.join(ROOT, KELUAR + '.csv'),
    [KOL, ...baris].map(r => r.map(csv).join(',')).join('\n'), 'utf8');

  console.log('✓ ' + KELUAR + '.xlsx  (' + baris.length + ' baris, ' + H.length + ' resep)');
  console.log('✓ ' + KELUAR + '.csv');
  console.log('  ' + H.filter(h => h._r).length + ' dapat rincian bahan, '
    + H.filter(h => !h._r).length + ' pakai Modal Manual');
  console.log('  dicocokkan lewat modal : ' + lewatModal.length);
  console.log('  bahan belum dikenal    : ' + takKenal.size + (adaMaster ? '' : '  (master tidak dibaca)'));
  console.log('  rincian tidak terpakai : ' + nganggur.length);
  console.log('  yield dibetulkan       : ' + yieldBetul.length);
  console.log('\nImpor lewat: HPP & Resep → Daftar Resep → Impor. Pratinjaunya menyebut');
  console.log('berapa baru & berapa diperbarui SEBELUM satu baris pun ditulis.');
})().catch(e => { console.error(e); process.exit(1); });
