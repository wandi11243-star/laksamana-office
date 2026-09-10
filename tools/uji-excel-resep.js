/* UJI EKSPOR & IMPOR DAFTAR RESEP — deploy/stock/hpp/index.html
 *
 *   node tools/uji-excel-resep.js
 *
 * Yang dijaga di sini semuanya muncul sebagai UANG atau sebagai baris yang
 * hilang, bukan sebagai galat — jadi tidak satu pun bisa ditemukan dengan
 * membuka halamannya lalu melihat apakah ia tergambar:
 *
 *   - satu putaran ekspor → impor tidak boleh mengubah satu angka pun
 *   - baris catatan ("bumbu blender saring") tidak boleh hilang di jalan
 *   - resep yang TIDAK ada di berkas tidak boleh tersentuh
 *   - nama yang sama di food & drink tidak boleh saling menimpa
 *   - kolom yang tidak ada di berkas (catatan resep, harga_lama) tidak boleh
 *     terhapus jadi kosong — server menulis SELURUH kolom tiap simpan
 *
 * Modul ini memuat Tailwind & FontAwesome dari CDN yang tidak bisa diambil
 * jsdom; VirtualConsole dipakai supaya tumpukan galatnya tidak menenggelamkan
 * baris OK/GAGAL.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const BERKAS = path.join(ROOT, 'deploy', 'stock', 'hpp', 'index.html');

let JSDOM, VirtualConsole;
try {
  const j = require(process.env.JSDOM_PATH || 'jsdom');
  JSDOM = j.JSDOM; VirtualConsole = j.VirtualConsole;
} catch (e) {
  console.log('LEWAT: jsdom tidak ada. Pasang dulu, atau set JSDOM_PATH.');
  process.exit(0);
}

let ok = 0, gagal = 0;
function cek(nama, syarat, ket) {
  if (syarat) { ok++; console.log('  OK   ' + nama); }
  else { gagal++; console.log('  GAGAL ' + nama + (ket ? '\n         → ' + ket : '')); }
}

/* ---- data uji: sengaja memuat tiap jebakan yang sudah dikenal ---- */
const BAHAN = [
  { id: 'b1', nama: 'Ayam', harga_beli: 40000, qty_beli: 1000, satuan: 'Gr' },
  { id: 'b2', nama: 'Beras', harga_beli: 12000, qty_beli: 1000, satuan: 'Gr' },
  { id: 'b3', nama: 'Gula', harga_beli: 15000, qty_beli: 1000, satuan: 'Gr' }
];
const RESEP = [
  { id: 'r1', nama: 'Nasi Putih', jenis: 'food', tipe: 'base', seksi: 'Kitchen',
    yield_qty: 10, yield_unit: 'Porsi', harga_baru: 0, modal_manual: 0, aktif: 1,
    harga_lama: 5000, catatan: 'catatan resep yang tidak ada di berkas',
    bahan: [{ nama: 'Beras', qty: 500, satuan: 'Gr', ref: 'bahan' },
            { catatan: 'tanak 20 menit' }] },
  /* `kode` (10 September 2026): kode menu di POS. Ikut di fixture justru
     supaya putaran ekspor-impor punya tempat untuk kehilangannya — kolom yang
     lolos ekspor tapi tidak terbaca impor TIDAK menimbulkan galat di kedua
     sisinya, dan gejalanya baru muncul di modul Analytics minggu berikutnya. */
  { id: 'r2', nama: 'Ayam Goreng', jenis: 'food', tipe: 'dish', seksi: 'Kitchen', kode: 'AYAM01',
    yield_qty: 1, yield_unit: 'Porsi', harga_baru: 35000, modal_manual: 0, aktif: 1,
    bahan: [{ nama: 'Ayam', qty: 200, satuan: 'Gr', ref: 'bahan' },
            { nama: 'Nasi Putih', qty: 1, satuan: 'Porsi', ref: 'resep' }] },
  /* Nama yang sama di dua jenis — jebakan PR[jenis+'|'+nama]. */
  { id: 'r3', nama: 'Simple Syrup', jenis: 'food', tipe: 'base', seksi: 'Kitchen',
    yield_qty: 1000, yield_unit: 'Ml', harga_baru: 0, modal_manual: 0, aktif: 1,
    bahan: [{ nama: 'Gula', qty: 500, satuan: 'Gr', ref: 'bahan' }] },
  { id: 'r4', nama: 'Simple Syrup', jenis: 'drink', tipe: 'base', seksi: 'Bar',
    yield_qty: 2000, yield_unit: 'Ml', harga_baru: 0, modal_manual: 0, aktif: 1,
    bahan: [{ nama: 'Gula', qty: 900, satuan: 'Gr', ref: 'bahan' }] },
  { id: 'r5', nama: 'Es Teh', jenis: 'drink', tipe: 'dish', seksi: 'Bar',
    yield_qty: 1, yield_unit: 'Porsi', harga_baru: 8000, modal_manual: 0, aktif: 0,
    bahan: [{ nama: 'Simple Syrup', qty: 30, satuan: 'Ml', ref: 'resep' }] }
];

function boot() {
  const html = fs.readFileSync(BERKAS, 'utf8')
    /* Skrip CDN dibuang: jsdom tidak bisa memuatnya dan galatnya berisik. */
    .replace(/<script[^>]+src=["']https?:[^"']+["'][^>]*><\/script>/g, '');
  const vc = new VirtualConsole();
  const dom = new JSDOM(html, {
    url: 'https://team.laksamanamuda.id/stock/hpp/',
    runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc
  });
  const w = dom.window;
  w.fetch = () => Promise.resolve({ ok: true, text: () => Promise.resolve('{"status":"success"}') });
  return w;
}

function pasang(w, bahan, resep) {
  w.eval('S={bahan:' + JSON.stringify(bahan) + ',resep:' + JSON.stringify(resep) + '};'
       + 'ME={name:"Uji"}; SET=SET||{}; SET.buffer=5; petakan(); MEMO={};');
}

(async () => {
  console.log('=== UJI EKSPOR & IMPOR DAFTAR RESEP ===\n');
  const w = boot();
  await new Promise(r => setTimeout(r, 400));
  pasang(w, BAHAN, RESEP);

  /* ================= 1. bentuk berkas ekspor ================= */
  console.log('== Bentuk berkas ekspor ==');
  const kol = w.eval('KOL_RESEP');
  const baris = w.eval('barisEksporResep()');
  const K = n => kol.indexOf(n);

  cek('kolom Nama Resep ada di kepala', K('Nama Resep') === 0, kol.join('|'));
  ['Jenis', 'Tipe', 'Yield Qty', 'Yield Unit', 'Harga Jual', 'Bahan', 'Qty', 'Satuan', 'Ref']
    .forEach(n => cek('kolom ' + n + ' ada', K(n) > -1, kol.join('|')));

  /* Satu baris per bahan, bukan satu baris per resep — 5 resep, 7 baris isi. */
  cek('satu baris per baris bahan (bukan per resep)', baris.length === 7,
      baris.length + ' baris untuk 5 resep');

  /* Kolom resep hanya di baris pertama; kalau diulang, yang menyuntingnya harus
     menebak baris mana yang menentukan. */
  const bNasi = baris.filter(r => r[K('Nama Resep')] === 'Nasi Putih');
  cek('kolom resep cuma ditulis di baris pertama tiap resep',
      baris[1][K('Nama Resep')] === '' && baris[1][K('Jenis')] === '',
      JSON.stringify(baris[1]));

  /* Baris catatan IKUT dan ditandai — kalau tidak, satu putaran ekspor-impor
     menghapus tahap memasaknya tanpa satu pun galat. */
  const catBaris = baris.filter(r => String(r[K('Ref')]) === 'Catatan');
  cek('baris catatan ikut diekspor', catBaris.length === 1, JSON.stringify(baris));
  cek('isi catatan utuh di kolom Bahan', catBaris[0] && catBaris[0][K('Bahan')] === 'tanak 20 menit');

  /* Jenis & tipe ditulis dengan KATA INDONESIA — berkasnya dibaca orang. */
  cek('jenis ditulis Makanan/Minuman, bukan food/drink',
      baris.some(r => r[K('Jenis')] === 'Makanan') && baris.some(r => r[K('Jenis')] === 'Minuman'),
      baris.map(r => r[K('Jenis')]).join(','));
  cek('tipe ditulis Menu Jadi/Base',
      baris.some(r => r[K('Tipe')] === 'Menu Jadi') && baris.some(r => r[K('Tipe')] === 'Base'));

  /* Menu jadi lebih dulu, sama dengan urutan tab di layar. */
  const namaUrut = baris.filter(r => r[K('Nama Resep')]).map(r => r[K('Nama Resep')]);
  cek('menu jadi diekspor lebih dulu, lalu base',
      namaUrut[0] === 'Ayam Goreng' && namaUrut[1] === 'Es Teh',
      namaUrut.join(' > '));

  /* Resep non-aktif TETAP ikut: berkas yang cuma memuat yang aktif, diunggah
     balik, tidak akan pernah bisa menghidupkan kembali yang dimatikan. */
  cek('resep non-aktif ikut diekspor', namaUrut.indexOf('Es Teh') > -1, namaUrut.join(','));
  cek('kolom Aktif menyebut Tidak untuk yang dimatikan',
      baris.find(r => r[K('Nama Resep')] === 'Es Teh')[K('Aktif')] === 'Tidak');

  /* ================= 2. baca kembali (putaran penuh) ================= */
  console.log('\n== Ekspor lalu impor: tidak boleh mengubah apa pun ==');
  const rows = [kol].concat(baris);
  const hasil = w.eval('bacaResepRows(' + JSON.stringify(rows) + ')');
  cek('tidak ada galat baca', !hasil.galat, hasil.galat);
  cek('kelima resep terbaca kembali', hasil.resep.length === 5, String(hasil.resep.length));

  const byNama = (l, n, j) => l.find(r => r.nama === n && (!j || r.jenis === j));
  const ag = byNama(hasil.resep, 'Ayam Goreng');
  cek('jenis dipulangkan sebagai food/drink, bukan kata Indonesianya',
      ag.jenis === 'food' && byNama(hasil.resep, 'Es Teh').jenis === 'drink',
      ag.jenis);
  cek('tipe dipulangkan sebagai dish/base', ag.tipe === 'dish' &&
      byNama(hasil.resep, 'Nasi Putih').tipe === 'base');
  cek('yield & harga jual utuh', ag.yield_qty === 1 && ag.harga_baru === 35000,
      JSON.stringify([ag.yield_qty, ag.harga_baru]));
  cek('non-aktif tetap non-aktif setelah putaran',
      byNama(hasil.resep, 'Es Teh').aktif === 0);

  const np = byNama(hasil.resep, 'Nasi Putih');
  cek('baris bahan resep utuh', np.bahan[0].nama === 'Beras' && np.bahan[0].qty === 500 &&
      np.bahan[0].satuan === 'Gr', JSON.stringify(np.bahan));
  cek('baris catatan kembali sebagai catatan, bukan sebagai bahan',
      np.bahan[1] && np.bahan[1].catatan === 'tanak 20 menit' && !np.bahan[1].nama,
      JSON.stringify(np.bahan[1]));
  cek('ref=resep dipertahankan (bukan ditebak dari nama)',
      ag.bahan[1].nama === 'Nasi Putih' && ag.bahan[1].ref === 'resep',
      JSON.stringify(ag.bahan[1]));

  /* Dua Simple Syrup harus tetap dua, dan masing-masing membawa isinya sendiri. */
  const ssF = byNama(hasil.resep, 'Simple Syrup', 'food');
  const ssD = byNama(hasil.resep, 'Simple Syrup', 'drink');
  cek('nama yang sama di food & drink tetap dua baris', !!ssF && !!ssD);
  cek('dan isinya tidak tertukar', ssF.bahan[0].qty === 500 && ssD.bahan[0].qty === 900,
      JSON.stringify([ssF.bahan[0].qty, ssD.bahan[0].qty]));

  /* ================= 3. pratinjau impor ================= */
  console.log('\n== Pratinjau sebelum menulis ==');
  /* Putaran utuh: tidak ada yang berubah, jadi tidak boleh ada yang ditulis. */
  w.eval('IMPOR_RESEP=null; PESAN="";');
  w.eval('siapkanImporResep(' + JSON.stringify(hasil.resep) + ',[])');
  const p1 = w.eval('PESAN');
  cek('putaran ekspor→impor tanpa suntingan: tidak ada yang berubah',
      /Tidak ada yang berubah/.test(p1) && w.eval('IMPOR_RESEP') === null,
      p1.slice(0, 200));

  /* Sekarang benar-benar disunting. */
  const sunt = JSON.parse(JSON.stringify(hasil.resep));
  byNama(sunt, 'Ayam Goreng').harga_baru = 40000;
  sunt.push({ nama: 'Sate Ayam', jenis: 'food', tipe: 'dish', seksi: 'Kitchen',
              yield_qty: 1, yield_unit: 'Porsi', harga_baru: 30000, modal_manual: 0,
              aktif: 1, bahan: [{ nama: 'Ayam', qty: 150, satuan: 'Gr', ref: 'bahan' },
                                { nama: 'Bumbu Kacang', qty: 30, satuan: 'Gr', ref: 'bahan' }] });
  w.eval('IMPOR_RESEP=null;');
  w.eval('siapkanImporResep(' + JSON.stringify(sunt) + ',[])');
  const dlg = w.document.getElementById('konfirm').innerHTML;
  const kirim = w.eval('IMPOR_RESEP.rows');

  cek('pratinjau menyebut 1 baru & 1 diperbarui',
      />1<[\s\S]*?Baru/.test(dlg) && kirim.length === 2, String(kirim.length));
  cek('yang tidak berubah tidak ikut dikirim',
      !kirim.some(r => r.nama === 'Es Teh'), kirim.map(r => r.nama).join(','));

  /* Id resep lama DIPERTAHANKAN — kalau kosong, hpp_simpan_resep membuat id
     baru dan resepnya jadi kembar, bukan diperbarui. */
  const kAg = kirim.find(r => r.nama === 'Ayam Goreng');
  cek('id resep lama dibawa serta', kAg.id === 'r2', kAg.id);
  cek('resep baru dikirim tanpa id', kirim.find(r => r.nama === 'Sate Ayam').id === '');

  /* Kolom yang TIDAK ada di berkas tidak boleh terhapus: server menulis seluruh
     kolom tiap simpan, jadi yang hilang di sini hilang di database. */
  const kNp = kirim.find(r => r.nama === 'Ayam Goreng');
  const cocok = w.eval('cariResep("Nasi Putih","food")');
  cek('kolom di luar berkas dipertahankan (catatan resep, harga_lama)',
      (function () {
        w.eval('IMPOR_RESEP=null;');
        const s2 = JSON.parse(JSON.stringify(hasil.resep));
        byNama(s2, 'Nasi Putih').yield_qty = 12;      // supaya dianggap berubah
        w.eval('siapkanImporResep(' + JSON.stringify(s2) + ',[])');
        const r = w.eval('IMPOR_RESEP.rows').find(x => x.nama === 'Nasi Putih');
        return r && r.catatan === 'catatan resep yang tidak ada di berkas' && r.harga_lama === 5000;
      })(), 'catatan/harga_lama hilang');

  /* Nama yang ada di satu jenis saja TIDAK boleh menimpa resep berjenis lain.
     cariResep() sengaja jatuh ke pencarian tanpa jenis (dipakai penghitung
     modal), jadi tanpa penjaga sejenis di sini, resep drink baru bernama
     "Ayam Goreng" akan MENIMPA resep food yang sudah ada — dan yang hilang
     bukan barisnya, melainkan isinya, tanpa satu pun galat. */
  w.eval('IMPOR_RESEP=null;');
  w.eval('siapkanImporResep(' + JSON.stringify([{
    nama: 'Ayam Goreng', jenis: 'drink', tipe: 'dish', seksi: 'Bar',
    yield_qty: 1, yield_unit: 'Porsi', harga_baru: 12000, modal_manual: 0,
    aktif: 1, bahan: [{ nama: 'Gula', qty: 5, satuan: 'Gr', ref: 'bahan' }]
  }]) + ',[])');
  const silang = w.eval('IMPOR_RESEP.rows')[0];
  cek('nama yang cuma ada di jenis lain dianggap resep BARU, bukan menimpa',
      silang.id === '' && silang.jenis === 'drink', JSON.stringify([silang.id, silang.jenis]));
  cek('...dan resep food yang bernama sama tidak ikut dikirim',
      w.eval('IMPOR_RESEP.rows').length === 1);

  /* Ejaan tersimpan menang: menemukan resep lewat ejaan lain tidak boleh
     sekalian mengganti namanya. */
  w.eval('IMPOR_RESEP=null;');
  const ejaan = JSON.parse(JSON.stringify(hasil.resep));
  const eAg = byNama(ejaan, 'Ayam Goreng');
  eAg.nama = 'ayam goreng'; eAg.harga_baru = 41000;
  w.eval('siapkanImporResep(' + JSON.stringify(ejaan) + ',[])');
  const kirimEjaan = w.eval('IMPOR_RESEP.rows').find(r => r.id === 'r2');
  cek('ejaan berbeda tetap menemukan resepnya (bukan bikin kembar)', !!kirimEjaan,
      JSON.stringify(w.eval('IMPOR_RESEP.rows').map(r => [r.id, r.nama])));
  cek('...tapi TIDAK mengganti nama tersimpannya',
      kirimEjaan && kirimEjaan.nama === 'Ayam Goreng', kirimEjaan && kirimEjaan.nama);

  /* Bahan yang tidak dikenal DILAPORKAN sebelum menulis: modalnya akan terhitung
     tanpa bahan itu — angka yang terlihat wajar padahal kurang. */
  w.eval('IMPOR_RESEP=null;');
  w.eval('siapkanImporResep(' + JSON.stringify(sunt) + ',[])');
  const dlg2 = w.document.getElementById('konfirm').innerHTML;
  cek('bahan tak dikenal disebut namanya di pratinjau',
      /Bumbu Kacang/.test(dlg2) && /belum dikenal/.test(dlg2),
      dlg2.slice(dlg2.indexOf('belum dikenal') - 120, dlg2.indexOf('belum dikenal') + 160));
  cek('baris catatan tidak ikut dilaporkan sebagai bahan tak dikenal',
      !/tanak 20 menit/.test(dlg2));
  cek('pratinjau menyebut resep di luar berkas tidak dihapus',
      /tidak ada di berkas ini tidak dihapus/.test(dlg2));
  cek('...dan menyebut baris bahan yang ikut memang diganti utuh',
      /diganti persis seperti isinya/.test(dlg2));

  /* ================= 4. baris yang salah bentuk ================= */
  console.log('\n== Berkas yang salah bentuk ==');
  const salah = w.eval('bacaResepRows([["Nama","Harga"],["Ayam","10"]])');
  cek('kepala kolom yang salah ditolak dengan menyebut kolomnya',
      !!salah.galat && /Nama Resep/.test(salah.galat), salah.galat);

  const bolong = w.eval('bacaResepRows(' + JSON.stringify([
    kol, ['', '', '', '', '', '', '', '', '', 'Ayam', 100, 'Gr', 'Bahan', ''],
    ['Rendang', 'Makanan', 'Menu Jadi', 'Kitchen', 1, 'Porsi', 50000, 0, 'Ya', 'Ayam', 200, 'Gr', 'Bahan', '']
  ]) + ')');
  cek('baris bahan sebelum nama resep mana pun dilewati, bukan menggagalkan berkas',
      !bolong.galat && bolong.resep.length === 1 && bolong.bolong.length === 1,
      JSON.stringify(bolong.bolong));
  cek('nomor baris yang dilewati disebutkan (untuk dicari di Excel)',
      bolong.bolong[0] === 2, String(bolong.bolong[0]));

  /* ================= 5. tombolnya benar-benar ada di layar ================= */
  console.log('\n== Tombol di Daftar Resep ==');
  const src = fs.readFileSync(BERKAS, 'utf8');
  ['exportResepXlsx()', 'exportResepCsv()', 'pilihBerkasResep()', 'id="fResep"']
    .forEach(t => cek('layar memanggil ' + t, src.indexOf(t) > -1));
  /* Berkas bahan & berkas resep TIDAK boleh berbagi satu <input type=file>:
     yang satu akan membaca berkas yang satunya dengan pembaca yang salah. */
  cek('input berkas resep terpisah dari input berkas bahan',
      src.indexOf('id="fBahan"') > -1 && src.indexOf('id="fResep"') > -1 &&
      src.indexOf('bacaBerkasResep(this)') > -1);

  /* ================= 6. backend ================= */
  console.log('\n== Backend stock-mysql/hpp.php ==');
  const php = fs.readFileSync(path.join(ROOT, 'stock-mysql', 'hpp.php'), 'utf8');
  cek('aksi imporResep terdaftar', /\$a === 'imporResep'/.test(php));
  cek('hpp_impor_resep ada', /function hpp_impor_resep\(/.test(php));
  /* Yang paling penting: ia TIDAK BOLEH menghapus tabel seperti hpp_impor(). */
  const fn = php.slice(php.indexOf('function hpp_impor_resep('),
                       php.indexOf('function hpp_impor_bahan('));
  cek('hpp_impor_resep tidak menghapus satu tabel pun', !/DELETE\s+FROM/i.test(fn),
      (fn.match(/DELETE[^\n]*/i) || [''])[0]);
  cek('satu resep yang gagal tidak menjatuhkan seluruh unggahan',
      /catch \(Throwable/.test(fn) && /\$galat\[\] = \$nm/.test(fn));
  cek('yang gagal dipulangkan namanya ke layar', /'galat' => \$galat/.test(fn));
  cek('menulis lewat penyimpan yang sama (satu aturan)',
      /hpp_simpan_resep\(\$pdo, \$r, \$by\)/.test(fn));

  /* ---- KOLOM `kode` (10 September 2026, permintaan user) ----
     PHP tidak bisa dijalankan di mesin pengembangan, jadi kontraknya dijaga
     terhadap SUMBERNYA — pola yang sama dengan uji-simpan-basi.js. Tanpa ini
     seluruh sisi server lewat tanpa disentuh: server tiruan di uji ini
     menerima apa saja, dan kolom yang tidak pernah ditulis tidak menimbulkan
     galat di satu sisi pun. Pelajaran yang sudah dibayar di stub hpp.php pada
     uji-analytics dan di kontrak omsetHari. */
  const simpanFn = php.slice(php.indexOf('function hpp_simpan_resep('),
                             php.indexOf('function hpp_impor_resep('));
  cek('kode ikut ditulis saat menyimpan resep',
      /INSERT INTO hpp_resep \([^)]*\bkode\b/.test(simpanFn)
      && /kode=VALUES\(kode\)/.test(simpanFn), 'kolom kode tidak ada di INSERT/UPDATE');
  cek('kode diikat sebagai penanda tersendiri', /':kd' =>/.test(simpanFn));
  /* Dibakukan huruf besar DI SATU TEMPAT, dan tempatnya server: kode diketik
     orang lewat dua jalur (form dan impor Excel), jadi "Matcha02" dan
     "MATCHA02" pasti bercampur — dan yang bercampur tidak pernah cocok dengan
     kode dari POS, tanpa satu pun galat. */
  cek('kode dibakukan huruf besar di server', /strtoupper\(hpp_txt\(isset\(\$d->kode\)/.test(simpanFn));
  /* Fungsi mbstring akan mematikan SELURUH endpoint folder ini di server yang
     tidak memasangnya. DIPERIKSA TANPA KOMENTAR: penjelasan di atas barisnya
     menyebut nama fungsi yang dilarang itu apa adanya — sejarah kenapa sesuatu
     tidak dipakai justru harus tetap boleh menyebut namanya, dan pemindai yang
     merah untuk komentar akan dimatikan orang berikutnya. Aturan yang sama
     dengan uji-tanpa-target.js. */
  const simpanKode = simpanFn.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
  cek('tidak memakai fungsi mbstring untuk kode', !/mb_strtoupper/.test(simpanKode),
      (simpanKode.match(/mb_strtoupper[^\n]*/) || [''])[0]);
  /* Kolomnya lahir lewat ALTER, BUKAN berkas migrasi: migrasi di repo ini
     rutin tertinggal di produksi, dan CREATE TABLE IF NOT EXISTS tidak pernah
     menyentuh tabel yang sudah berisi. */
  cek('kolom kode lahir sendiri lewat hpp_pastikan_kolom',
      /array\('hpp_resep', 'kode',/.test(php));
  cek('kode juga ada di CREATE TABLE untuk pemasangan baru',
      /kode\s+VARCHAR\(64\)/.test(php));
  cek('tidak ada berkas migrasi baru untuk kolom ini',
      !fs.readdirSync(path.join(ROOT, 'stock-mysql')).some(f => /^migrasi.*kode/i.test(f)));

  w.close();
  console.log('\n---------------------------------------');
  console.log('  OK: ' + ok + '   GAGAL: ' + gagal);
  process.exit(gagal ? 1 : 0);
})();
