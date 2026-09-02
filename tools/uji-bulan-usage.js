/* Uji penyaring BULAN di Pemakaian Bahan Baku (deploy/stock/usage/) — jsdom,
   stock-api tiruan.

   Tiga layar report di modul ini punya pemilih bulan: Pemakaian, Waste, dan
   Serah Terima. Yang dijaga di sini:

   1. RENTANGNYA SATU RUMUS. Ketiganya memanggil rentangBulan() yang sama.
      Kalau salah satu menghitung hari terakhir bulan sendiri, yang meleset di
      Februari tidak melempar apa pun — ia cuma kehilangan catatan tanggal 29,
      dan tidak ada satu pun layar yang menyebutkannya.
   2. TANGGALNYA DIJEPIT KE BULAN ITU. Bulan lalu harus terambil PENUH, bukan
      sampai hari ini; dan bulan berjalan tidak boleh menarik tanggal yang
      belum terjadi.
   3. ADA JALAN KELUARNYA. Memilih satu bulan tanpa cara kembali berarti
      terkurung di bulan itu sampai halaman dimuat ulang. */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const { JSDOM, VirtualConsole } = (() => {
  for (const p of [process.env.JSDOM_PATH, path.join(ROOT, 'node_modules', 'jsdom'), 'jsdom']) {
    if (!p) continue;
    try { return require(p); } catch (e) { /* coba berikutnya */ }
  }
  console.error('jsdom tidak ketemu. Pasang `npm i jsdom`, atau setel JSDOM_PATH ke foldernya.');
  process.exit(2);
})();

const DIR  = path.join(ROOT, 'deploy', 'stock', 'usage');
const HTML = fs.readFileSync(path.join(DIR, 'index.html'), 'utf8');
const COMMON = fs.readFileSync(path.join(ROOT, 'deploy', 'stock', 'catat-common.js'), 'utf8');

let lulus = 0, gagal = 0;
const cek = (nama, syarat, ket) => {
  if (syarat) { lulus++; console.log('  OK   ' + nama); }
  else { gagal++; console.log('  GAGAL ' + nama + (ket ? '  -> ' + ket : '')); }
};
const tunggu = ms => new Promise(r => setTimeout(r, ms));

/* Tiap permintaan ke API dicatat lengkap dengan parameternya: yang diuji di
   sini justru RENTANG YANG DIMINTA ke server, bukan tampilannya. Periode
   disaring di server (dari/ke jadi query string), jadi kalau rentangnya salah
   layarnya tetap tergambar rapi — dengan isi bulan yang keliru. */
function domUsage() {
  const minta = [];
  const dom = new JSDOM(
    /* Tailwind & FontAwesome dari CDN tidak bisa dimuat jsdom dan memang tidak
       perlu: yang diuji hitungan tanggalnya. Skrip CDN-nya dibuang, sementara
       catat-common.js (berkas lokal, memuat sidebar & helper) DISISIPKAN apa
       adanya supaya kode yang jalan tetap kode sungguhan. */
    HTML.replace(/<script[^>]+src="https?:\/\/[^"]*"[^>]*><\/script>/g, '')
        /* Blok setelan tema Tailwind ikut dibuang: ia menyentuh objek `tailwind`
           yang cuma ada kalau CDN-nya termuat, dan tumpukan galatnya menenggelamkan
           hasil uji ini. Galat yang selalu muncul melatih orang berhenti membaca. */
        .replace(/<script>[\s\S]*?tailwind\.config[\s\S]*?<\/script>/, '')
        .replace('<script src="../catat-common.js"></script>', '<script>' + COMMON + '</script>'),
    { runScripts:'dangerously', url:'https://dev.laksamanamuda.id/stock/usage/',
      /* Konsol jsdom disenyapkan: yang diteriakkannya cuma scrollTo() yang belum
         diterapkan dan berkas CDN yang memang tidak dimuat — tak satu pun
         berhubungan dengan yang diuji, dan semuanya menutupi baris OK/GAGAL. */
      virtualConsole: new VirtualConsole(),
      pretendToBeVisual:true, beforeParse(w) {
        w.localStorage.setItem('lm_session', JSON.stringify({
          userId:'u1', name:'Uji', modules:['*'], adminModules:['*'],
          keterangan:'Bar', expiry: Date.now() + 3600e3 }));
        w.fetch = (url, opt) => {
          minta.push(String(url));
          const body = (opt && opt.method === 'POST') ? { status:'success' } : [];
          const teks = JSON.stringify(body);
          return Promise.resolve({ ok:true, status:200,
            text:() => Promise.resolve(teks), json:() => Promise.resolve(body) });
        };
        w.alert = () => {}; w.confirm = () => true; w.print = () => {};
      } });
  return { dom, minta };
}
/* Rentang terakhir yang diminta ke sebuah endpoint. Diambil dari URL-nya,
   bukan dari variabel dalam halaman: yang menentukan isi layar adalah apa yang
   benar-benar dikirim ke server. */
function rentangTerakhir(minta, berkas) {
  const u = minta.filter(x => x.indexOf(berkas) > -1).pop();
  if (!u) return null;
  const q = new URL(u, 'https://x/').searchParams;
  return { dari: q.get('dari'), ke: q.get('ke') };
}
const bulanIni = () => {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
};

(async () => {

  /* ================= 1. kotaknya ada dan terisi ================= */
  console.log('\n== Pemilih bulan ada di ketiga report ==');
  {
    const { dom } = domUsage(); await tunggu(200);
    const d = dom.window.document;
    [['Pemakaian', 'p-bulan-pilih'], ['Waste', 'wp-bulan-pilih'], ['Serah Terima', 'srp-bulan-pilih']]
      .forEach(([nama, id]) => {
        const sel = d.getElementById(id);
        cek(nama + ': kotak bulan ada', !!sel);
        /* 24 bulan ke belakang. Daftar kosong tampil seperti "tidak ada bulan
           yang bisa dipilih" — dan itulah yang terjadi kalau isiPilihanBulan()
           cuma dipanggil untuk satu kotak. */
        cek(nama + ': daftarnya terisi 24 bulan', !!sel && sel.options.length === 24,
            sel ? String(sel.options.length) : '-');
        cek(nama + ': terbuka di bulan berjalan', !!sel && sel.value === bulanIni(),
            sel ? sel.value : '-');
        cek(nama + ': tombol bersih tersembunyi dulu',
            !!d.getElementById(id.replace('-pilih', '-hapus')) &&
            d.getElementById(id.replace('-pilih', '-hapus')).classList.contains('hidden'));
      });
    dom.window.close();
  }

  /* ================= 2. rentangnya satu rumus ================= */
  console.log('\n== rentangBulan(): satu rumus, tiga layar ==');
  {
    const { dom } = domUsage(); await tunggu(200);
    const w = dom.window;
    /* Februari tahun kabisat dan tahun biasa — di sinilah rumus yang disalin
       tangan meleset, dan melesetnya tidak pernah muncul sebagai galat. */
    cek('Februari 2024 (kabisat) sampai tanggal 29',
        w.rentangBulan('2024-02').ke === '2024-02-29', w.rentangBulan('2024-02').ke);
    cek('Februari 2026 sampai tanggal 28',
        w.rentangBulan('2026-02').ke === '2026-02-28', w.rentangBulan('2026-02').ke);
    cek('bulan 31 hari sampai tanggal 31',
        w.rentangBulan('2026-07').ke === '2026-07-31', w.rentangBulan('2026-07').ke);
    cek('bulan 30 hari sampai tanggal 30',
        w.rentangBulan('2026-04').ke === '2026-04-30', w.rentangBulan('2026-04').ke);
    cek('mulainya selalu tanggal 1',
        w.rentangBulan('2026-04').dari === '2026-04-01', w.rentangBulan('2026-04').dari);
    /* Desember: bulan ke-12, jadi new Date(th, 12, 0) menyeberang tahun.
       Kalau salah, rentangnya jatuh ke Januari tahun berikutnya. */
    cek('Desember tidak menyeberang tahun',
        w.rentangBulan('2026-12').dari === '2026-12-01' && w.rentangBulan('2026-12').ke === '2026-12-31',
        JSON.stringify(w.rentangBulan('2026-12')));
    dom.window.close();
  }

  /* ================= 3. Waste ================= */
  console.log('\n== Report Waste: pilih bulan ==');
  {
    const { dom, minta } = domUsage(); await tunggu(200);
    const w = dom.window, d = w.document;
    w.setBulanWaste('2026-02');
    await tunggu(60);
    const r = rentangTerakhir(minta, 'waste.php');
    cek('waste.php diminta rentang Februari penuh',
        r && r.dari === '2026-02-01' && r.ke === '2026-02-28', JSON.stringify(r));
    /* Saat sebuah bulan dipilih, TIDAK ADA tombol periode yang menyala — itu
       memang benar, yang berlaku bukan salah satu dari ketiganya. Yang
       menggantikan tandanya tombol ✕. */
    cek('tombol periode tidak ada yang menyala',
        !['wp-minggu', 'wp-bulan', 'wp-semua'].some(id => d.getElementById(id).classList.contains('on')));
    cek('tombol bersih muncul',
        !d.getElementById('wp-bulan-hapus').classList.contains('hidden'));

    /* Jalan keluarnya: ✕ mengembalikan ke Bulan Ini. Tanpa ini, memilih satu
       bulan berarti terkurung di bulan itu sampai halaman dimuat ulang. */
    w.setBulanWaste('');
    await tunggu(60);
    const r2 = rentangTerakhir(minta, 'waste.php');
    cek('kembali ke bulan berjalan', r2 && r2.dari === bulanIni() + '-01', JSON.stringify(r2));
    cek('tombol Bulan Ini menyala lagi', d.getElementById('wp-bulan').classList.contains('on'));
    cek('tombol bersih tersembunyi lagi',
        d.getElementById('wp-bulan-hapus').classList.contains('hidden'));
    cek('kotak bulan kembali ke bulan berjalan',
        d.getElementById('wp-bulan-pilih').value === bulanIni());

    /* Tombol periode dan pemilih bulan saling meniadakan: kalau tidak, menekan
       "7 Hari" sesudah memilih Februari akan tetap memulangkan Februari, dan
       tombolnya menyala untuk rentang yang tidak diberikannya. */
    w.setBulanWaste('2026-03'); await tunggu(60);
    w.setPeriodeWaste('minggu'); await tunggu(60);
    const r3 = rentangTerakhir(minta, 'waste.php');
    cek('tombol periode membatalkan pilihan bulan',
        r3 && r3.dari !== '2026-03-01' && r3.ke !== '2026-03-31', JSON.stringify(r3));
    dom.window.close();
  }

  /* ================= 4. Serah Terima ================= */
  console.log('\n== Report Serah Terima: pilih bulan ==');
  {
    const { dom, minta } = domUsage(); await tunggu(200);
    const w = dom.window, d = w.document;
    w.setBulanSerah('2024-02');
    await tunggu(60);
    const r = rentangTerakhir(minta, 'serah.php');
    cek('serah.php diminta rentang Februari kabisat penuh',
        r && r.dari === '2024-02-01' && r.ke === '2024-02-29', JSON.stringify(r));
    cek('tombol periode tidak ada yang menyala',
        !['srp-minggu', 'srp-bulan', 'srp-semua'].some(id => d.getElementById(id).classList.contains('on')));
    cek('tombol bersih muncul',
        !d.getElementById('srp-bulan-hapus').classList.contains('hidden'));

    w.setBulanSerah(''); await tunggu(60);
    const r2 = rentangTerakhir(minta, 'serah.php');
    cek('kembali ke bulan berjalan', r2 && r2.dari === bulanIni() + '-01', JSON.stringify(r2));
    cek('tombol Bulan Ini menyala lagi', d.getElementById('srp-bulan').classList.contains('on'));

    w.setBulanSerah('2026-05'); await tunggu(60);
    w.setPeriodeSerah('semua'); await tunggu(60);
    const r3 = rentangTerakhir(minta, 'serah.php');
    /* "Semua" mengirim TANPA rentang sama sekali. */
    cek('Semua tidak membawa rentang', r3 && !r3.dari && !r3.ke, JSON.stringify(r3));

    /* Tombol periode HARUS membatalkan pilihan bulan. Diuji lewat "7 Hari",
       bukan "Semua": rentangSerah() memeriksa 'semua' lebih dulu lalu keluar,
       jadi lewat jalur itu pilihan bulan yang tertinggal tidak pernah terlihat —
       dan tombol yang menyala untuk rentang yang tidak diberikannya adalah
       kebohongan yang paling sulit dilacak di layar penyaring. */
    w.setBulanSerah('2026-05'); await tunggu(60);
    w.setPeriodeSerah('minggu'); await tunggu(60);
    const r4 = rentangTerakhir(minta, 'serah.php');
    cek('tombol periode membatalkan pilihan bulan',
        r4 && r4.dari !== '2026-05-01' && r4.ke !== '2026-05-31', JSON.stringify(r4));
    cek('dan tombolnya yang menyala', d.getElementById('srp-minggu').classList.contains('on'));
    dom.window.close();
  }

  /* ================= 5. Pemakaian tidak ikut rusak ================= */
  console.log('\n== Report Pemakaian tetap seperti semula ==');
  {
    const { dom, minta } = domUsage(); await tunggu(200);
    const w = dom.window, d = w.document;
    w.setBulan('2026-02'); await tunggu(60);
    const r = rentangTerakhir(minta, 'usage.php');
    cek('usage.php diminta rentang Februari penuh',
        r && r.dari === '2026-02-01' && r.ke === '2026-02-28', JSON.stringify(r));
    cek('tombol bersihnya muncul',
        !d.getElementById('p-bulan-hapus').classList.contains('hidden'));
    w.setBulan(''); await tunggu(60);
    cek('kembali ke Bulan Ini', d.getElementById('p-bulan').classList.contains('on'));
    dom.window.close();
  }

  console.log('\n---------------------------------------');
  console.log('LULUS ' + lulus + '   GAGAL ' + gagal);
  process.exit(gagal ? 1 : 0);
})();
