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
  /* Baris berkunci huruf -> indeks kolom. DI LUAR blok pertama:
     blok kedua memakainya juga, dan blok pertama boleh MELEWAT. */
  const idx = h => { let v = 0; for (const c of h) v = v * 26 + (c.charCodeAt(0) - 64); return v - 1; };

  /* ============ BERKAS IMPOR AWAL — BOLEH MELEWAT ============
     Dibuat dari berkas HPP dapur, yang sheet harganya sudah dihapus
     20 September 2026 sehingga MODAL & HARGA JUAL-nya jadi #REF!.
     Konverternya sekarang BERHENTI untuk berkas seperti itu (lihat
     hpp-prasmanan-ke-impor.js), jadi berkas hasilnya memang tidak ada
     lagi — dan itu keadaan yang SAH, bukan kegagalan uji.

     Asersinya TIDAK dicabut: begitu berkas dapur yang utuh dipulihkan,
     ia yang menjaga hasil konversinya. Dicabut, jalur itu berhenti
     diuji sama sekali dan tidak ada yang menyadarinya. */
  await (async function blokImporAwal() {
  if (!fs.existsSync(BERKAS)) {
    console.log('LEWAT — ' + BERKAS + ' tidak ada.');
    console.log('Berkas HPP dapur yang sheet harganya utuh perlu dipulihkan dulu;');
    console.log('konverternya menolak berkas ber-#REF! supaya harga jual di sistem');
    console.log('tidak tertimpa nol. Blok berikutnya tetap diuji.');
    return;
  }
  const lembar = await W.bacaBerkasLembar(new Blob([fs.readFileSync(BERKAS)]));
  cek('lembar pertama bernama Daftar Resep', lembar[0].nama === 'Daftar Resep', lembar[0].nama);

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

  })();

  /* ============ BERKAS PEMBETULAN YIELD (per porsi) ============
     COGS% di modul ini = modal TOTAL ÷ harga jual, jadi `Harga Jual` berarti
     harga untuk SATU YIELD. Impor pertama memasang yield 100 Porsi sambil
     mengisi harga jual per porsi — dan layarnya memajang COGS 2403%.
     Dilaporkan user 20 September 2026. */
  const BPP = path.join(ROOT, 'resep-prasmanan-per-porsi.xlsx');
  if (!fs.existsSync(BPP)) {
    console.log('\n  LEWAT — resep-prasmanan-per-porsi.xlsx belum dibuat');
    console.log('  (node tools/hpp-prasmanan-per-porsi.js)');
  } else {
    console.log('\n== Berkas pembetulan yield ==');
    const lb = await W.bacaBerkasLembar(new Blob([fs.readFileSync(BPP)]));
    const rows2 = lb[0].baris.map(b => {
      const a = []; let maks = 0;
      Object.keys(b).forEach(k => { maks = Math.max(maks, idx(k) + 1); });
      for (let i = 0; i < maks; i++) a.push('');
      Object.keys(b).forEach(k => { a[idx(k)] = String(b[k]); });
      return a;
    });
    const h2 = sandbox.bacaResepRows(rows2);
    cek('tidak ditolak pembacanya', !h2.galat, h2.galat);
    const q = h2.resep || [];
    cek('ada isinya', q.length > 0, String(q.length));
    /* INILAH yang membetulkan COGS-nya. Yield 1 + harga jual per porsi =
       pembilang dan penyebut yang sebanding. */
    cek('SEMUA yield-nya 1', q.every(r => r.yield_qty === 1),
        (q.find(r => r.yield_qty !== 1) || {}).nama);
    cek('satuannya Porsi atau Pcs', q.every(r => /^(porsi|pcs)$/i.test(r.yield_unit)),
        (q.find(r => !/^(porsi|pcs)$/i.test(r.yield_unit)) || {}).yield_unit);
    cek('seksinya tetap PRASMANAN', q.every(r => /^PRASMANAN/i.test(r.seksi)));

    /* CATATAN TAKARAN ASLINYA IKUT. Tanpa itu juru masak yang membuka resep
       ini kehilangan satu-satunya keterangan bahwa angkanya sudah dibagi:
       "Iga 100 Gr" terbaca sebagai resep satu porsi yang disusun dari awal. */
    const berbahan = q.filter(r => r.bahan.some(b => b.nama));
    cek('ada resep yang berbahan', berbahan.length > 0, String(berbahan.length));
    cek('tiap resep berbahan punya baris catatan takaran aslinya',
        berbahan.every(r => r.bahan.some(b => b.catatan && /aslinya untuk \d+/.test(b.catatan))),
        (berbahan.find(r => !r.bahan.some(b => b.catatan)) || {}).nama);
    /* Baris catatan TIDAK boleh terbaca sebagai bahan — ia akan muncul sebagai
       bahan bernama "Resep dapur aslinya untuk 100 Porsi…" yang tidak ada di
       daftar mana pun, dan tidak akan pernah bisa dibereskan siapa pun. */
    cek('catatannya tidak punya nama bahan',
        q.every(r => r.bahan.every(b => !(b.catatan && b.nama))));

    /* COGS yang masuk akal untuk yang modalnya manual: modal ÷ harga jual
       harus di bawah 100%. Di atas itu, menunya dijual rugi — mungkin saja,
       tapi bukan untuk SELURUH daftar, dan 2400% mustahil. */
    const manual = q.filter(r => r.modal_manual > 0 && r.harga_baru > 0);
    cek('ada yang bermodal manual', manual.length > 0, String(manual.length));
    cek('COGS-nya masuk akal (< 100%)',
        manual.every(r => r.modal_manual / r.harga_baru < 1),
        (manual.find(r => r.modal_manual / r.harga_baru >= 1) || {}).nama);

    /* Angka yang dicocokkan dengan berkas dapurnya: Indomie modal 820.000
       untuk 100 porsi → 8.200 per porsi, harga jual 33.000 → COGS 24,8%. */
    const ind = q.find(r => r.nama === 'Indomie');
    cek('Indomie: modal manual dibagi 100', ind && Math.round(ind.modal_manual) === 8200,
        ind && String(ind.modal_manual));
    const ikan = q.find(r => r.nama === 'Ikan Asam Manis');
    cek('Ikan Asam Manis: takaran bahan dibagi 100',
        ikan && ikan.bahan.some(b => b.nama === 'Ikan Dori' && Math.round(b.qty) === 100),
        ikan && JSON.stringify((ikan.bahan.find(b => b.nama === 'Ikan Dori') || {})));
    cek('harga jual TIDAK ikut dibagi', ikan && ikan.harga_baru === 26000,
        ikan && String(ikan.harga_baru));
  }

  /* ============ TAB PRASMANAN di Daftar Resep ============ */
  console.log('\n== Tab Prasmanan ==');
  {
    const bersih = SRC.replace(/\/\*[\s\S]*?\*\//g, '');
    cek('tombol tabnya ada', /F\.tab='pras'/.test(bersih));
    cek('dikenali dari seksi, bukan kolom baru', /function prasmananKah\(/.test(bersih));
    /* KATA UTUH di awal: seksi salah ketik "PRASMANANAN" tidak boleh ikut
       diam-diam. */
    cek('kata utuh, bukan potongan', /\^PRASMANAN\\b/.test(bersih));
    cek('punya state pager sendiri', /FPR:\(\)=>FPR/.test(bersih));
    /* DIKELUARKAN dari tab Menu Jadi — kalau ikut, angka di tab itu memuat 76
       resep prasmanan dan yang mencari menu à la carte menyaringnya sendiri. */
    cek('dikeluarkan dari tab Menu Jadi',
        /tipe==='dish'\)\{ if\(r\.tipe!=='dish'\|\|prasmananKah\(r\)\) return false; \}/.test(bersih));
    /* Daftar yang menyusut tanpa keterangan dibaca sebagai data hilang. */
    cek('ketiadaannya DIKATAKAN di tab Menu Jadi',
        /menu prasmanan tidak ikut di sini/.test(SRC));
    /* Prasmanan dijual, jadi kolom Harga jual & COGS berlaku — dan spare
       modal ikut dikenakan. */
    cek('diperlakukan sebagai menu jadi di tabelnya',
        /const dish=\(tipe==='dish'\|\|tipe==='pras'\)/.test(bersih));
    /* PDF massal: tanpa baris ini 76 resep berhenti ikut tercetak tanpa satu
       pun tanda, dan yang mencetaknya baru tahu sesudah lembarnya di tangan. */
    cek('ikut di PDF massal',
        /resepTersaring\('dish'\)\.concat\(resepTersaring\('pras'\)\)/.test(bersih));
  }


  /* ============ KONVERTER MENOLAK BERKAS SUMBER YANG RUSAK ============
     Ini yang paling mahal kalau lepas, dan gagalnya DIAM: berkas HPP dapur
     yang sheet harganya dihapus tetap terurai dengan rapi — nama bahan,
     takaran, dan satuannya selamat — cuma MODAL & HARGA JUAL-nya nol.
     Berkas hasilnya kelihatan lengkap (77 resep), dan mengimpornya MENIMPA
     harga jual yang sudah benar di sistem dengan nol.

     Dijaga di SUMBER, bukan runtime: menjalankan konverternya di sini
     menuntut berkas dapur yang memang tidak boleh masuk repo. */
  {
    console.log('\n== Penjaga berkas sumber rusak ==');
    const K = fs.readFileSync(path.join(ROOT, 'tools/hpp-prasmanan-ke-impor.js'), 'utf8')
              .replace(/\/\*[\s\S]*?\*\//g, '');   // komentar boleh menyebut apa saja
    cek('menghitung menu yang modal & harga jualnya kosong',
        /const rusak\s*=\s*H\.filter\(/.test(K));
    cek('ambangnya sebagian besar, bukan satu baris',
        /rusak\s*>\s*H\.length\s*\/\s*3/.test(K));
    cek('BERHENTI, tidak diteruskan menulis berkas',
        /process\.exit\(3\)/.test(K));
    /* Pesannya menyuruh MEMULIHKAN berkasnya, dan menyebut alat penggantinya.
       Tanpa itu yang membacanya cuma tahu alatnya menolak, bukan apa yang
       harus ia kerjakan — dan alat yang menolak tanpa jalan keluar akan
       dipaksa jalan oleh orang berikutnya. */
    cek('menyebut #REF! sebagai sebabnya', /#REF!/.test(K));
    cek('menunjuk alat penggantinya', /hpp-prasmanan-per-porsi\.js/.test(K));
  }

  console.log('\nLULUS ' + ok + '   GAGAL ' + gagal);
  process.exit(gagal ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
