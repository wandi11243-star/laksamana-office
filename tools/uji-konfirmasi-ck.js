/* uji-konfirmasi-ck.js — rekap konfirmasi Central Kitchen (Minta & Kirim)
 *
 *   node tools/uji-konfirmasi-ck.js
 *   JSDOM_PATH=/jalur/ke/jsdom node tools/uji-konfirmasi-ck.js
 *
 * Permintaan user 9 September 2026: "Minta dari CK dan Kirim ke CK, tolong buat
 * confirmation send, rekapan seperti kirim orderan form order belanja."
 *
 * YANG DIJAGA URUTANNYA, bukan adanya modal. Rekap yang muncul SESUDAH
 * barangnya terkirim tidak menahan apa pun — dan itu bentuk kegagalan yang
 * paling mungkin kalau seseorang "merapikan" alurnya nanti. Karena itu tiap
 * pemanggilan fetch dihitung, dan diperiksa bahwa hitungannya masih NOL selagi
 * modal rekapnya terbuka.
 *
 * SKRIP CDN DIBUANG, SKRIP LOKAL DISISIPKAN INLINE — dan bedanya menentukan.
 * jsdom tidak mengambil skrip eksternal sama sekali; membuang keduanya membuat
 * `LaksForecast is not defined` melempar DI TENGAH blok skrip utama, sehingga
 * seluruh baris sesudahnya tidak pernah dijalankan. Gejalanya menyesatkan:
 * fungsi tetap terbaca (deklarasi fungsi terangkat) sementara `let` di
 * bawahnya masih di TDZ, jadi ujinya gagal dengan "Cannot access ckRowCount
 * before initialization" — galat yang tidak ada hubungannya dengan yang diuji.
 * Pola yang sama dengan uji-analytics.js untuk xlsx-baca.js.
 */
'use strict';
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

let ok = 0, gagal = 0;
const cek = (n, s, k) => { if (s) { ok++; console.log('  OK   ' + n); } else { gagal++; console.log('  GAGAL ' + n + (k ? '  — ' + k : '')); } };
const tunggu = ms => new Promise(r => setTimeout(r, ms));

/* Barang Central Kitchen. `sumber:'ck'` wajib — infoCKItem() menolak apa pun
   yang tidak ada di CK, dan baris yang ditolak tidak pernah sampai ke rekap. */
const PRODUK = {
  'Ayam Fillet':   { sumber:'ck',   packIsi:0, packSatuan:'Kg',  unitDasar:'Kg' },
  'Bumbu Rendang': { sumber:'both', packIsi:0, packSatuan:'Pcs', unitDasar:'Pcs' }
};

function buka() {
  const asli = fs.readFileSync(path.join(ROOT, 'deploy/stock/ordering/index.html'), 'utf8');
  const lokal = (berkas) => {
    const j = path.join(ROOT, 'deploy/stock/ordering', berkas);
    return fs.existsSync(j) ? fs.readFileSync(j, 'utf8') : '';
  };
  const html = asli
    .replace(/<script[^>]*\ssrc="laksamana-forecast\.js"[^>]*><\/script>/i,
      () => '<script>' + lokal('laksamana-forecast.js') + '<' + '/script>')
    .replace(/<script[^>]*\ssrc="forecast_export\.js"[^>]*><\/script>/i,
      () => '<script>' + lokal('forecast_export.js') + '<' + '/script>')
    .replace(/<script[^>]*\ssrc="https?:[^>]*><\/script>/gi, '');
  const vc = new VirtualConsole();
  vc.on('jsdomError', e => {
    const t = String((e && e.detail && e.detail.stack) || (e && e.message) || e);
    if (!/Not implemented|Could not parse CSS|is not defined/.test(t)) console.log('  !! ' + t.split('\n')[0]);
  });
  const jejak = { url: [] };
  const dom = new JSDOM(html, { virtualConsole: vc, runScripts: 'dangerously',
    url: 'https://dev.laksamanamuda.id/stock/ordering/',
    beforeParse(w) {
      w.localStorage.setItem('lm_session', JSON.stringify({
        userId:'u1', name:'Wandi', username:'wandi',
        modules:['ordering'], adminModules:[], token:'t', expiry: Date.now() + 86400000 }));
      w.fetch = (url, opt) => {
        jejak.url.push(String(url));
        const j = JSON.stringify({ status:'success', created:1, merged:0, mutasi:[], data:[], orders:[] });
        return Promise.resolve({ ok:true, status:200,
          json:() => Promise.resolve(JSON.parse(j)), text:() => Promise.resolve(j) });
      };
      /* Blok inline halaman ini menyetel `tailwind.config`. Tanpa objeknya,
         blok itu melempar dan seluruh isinya batal — dan yang batal di sana
         cuma warna, tapi galatnya menenggelamkan baris OK/GAGAL. */
      w.tailwind = { config: {} };
      w.matchMedia = () => ({ matches:false, addListener(){}, removeListener(){}, addEventListener(){}, removeEventListener(){} });
      w.print = () => {}; w.confirm = () => true; w.alert = () => {};
      w.HTMLCanvasElement.prototype.getContext = () => ({});
    } });
  return { dom, jejak };
}

const isi = (d, id, v) => { const el = d.getElementById(id); if (el) el.value = v; return !!el; };

(async () => {
  const { dom, jejak } = buka();
  const w = dom.window, d = w.document;
  const bootSelesai = () => {
    try { w.eval('ckRowCount'); return true; } catch (e) { return false; }
  };
  for (let i = 0; i < 150 && !bootSelesai(); i++) await tunggu(20);
  cek('blok skrip utama benar-benar selesai dijalankan', bootSelesai(),
      'fungsi bisa terbaca walau bloknya mati di tengah — deklarasi fungsi terangkat, `let` tidak');
  cek('modul ter-boot', typeof w.submitCKOrder === 'function' && typeof w.submitKirimCK === 'function');

  /* Master barang & identitas disetel langsung: yang diuji jalur KONFIRMASI,
     bukan gerbang SSO maupun pemuat master. Pola yang sama dengan
     uji-kelola-user.js dan uji-bukti-dp.js. */
  /* MASUK SEBAGAI PERAN "Order + Check-in" (10 Oktober 2026). Sejak hak akses
     panel ini jadi matriks per sub-menu, submitCKOrder/submitKirimCK menolak
     siapa pun yang tidak punya hak Ubah di Central Kitchen — termasuk keadaan
     tanpa pengguna sama sekali, yang dulu diam-diam dipakai uji ini. Di
     aplikasi sungguhan form CK baru bisa diisi sesudah enterApp(). */
  w.eval("enterApp({id:'u1', name:'Wandi', pin:'', role:'full', keterangan:''})");
  await tunggu(80);
  w.eval('globalProductInfo = ' + JSON.stringify(PRODUK) + ';');
  w.eval("state.appScriptUrlHistory = 'https://contoh/exec';");
  /* Kotak tanggal BUKAN <input> di markup melainkan <div data-kal> yang diisi
     pasangKalender(). Dipasang lewat kode halamannya sendiri, bukan dengan
     menyuntik <input> palsu: kotak buatan uji tidak punya perilaku yang sama,
     dan uji yang memakainya menguji kotak yang tidak pernah ada di layar. */
  w.eval("document.querySelectorAll('[data-kal]').forEach(pasangKalender);");

  /* ================= 1. MINTA DARI CK ================= */
  console.log('\n== Minta dari CK ==');
  w.eval('document.getElementById("ck-rows-wrapper").innerHTML = ""; addCKRow(); addCKRow();');
  const idRow = [...d.querySelectorAll('[id^="ck-row-item-"]')].map(el => el.id.replace('ck-row-item-', ''));
  cek('dua baris form tergambar', idRow.length === 2, 'dapat ' + idRow.length);

  isi(d, 'ck-row-item-' + idRow[0], 'Ayam Fillet');
  isi(d, 'ck-row-qty-' + idRow[0], '5');
  isi(d, 'ck-row-note-' + idRow[0], 'potong dadu');
  isi(d, 'ck-row-item-' + idRow[1], 'Bumbu Rendang');
  isi(d, 'ck-row-qty-' + idRow[1], '3');
  /* <select> satuannya KOSONG di markup — diisi onPilihBarangCK() dari
     packSatuan barangnya. Disetel paksa lewat .value, pilihannya tidak ada
     dan nilainya jadi string kosong: rekapnya menulis "5 " tanpa satuan, dan
     ujinya merah karena sebab yang tidak ada hubungannya dengan konfirmasi. */
  idRow.forEach(id => w.eval('onPilihBarangCK(' + id + ')'));
  const satuan0 = d.getElementById('ck-row-unit-' + idRow[0]).value;
  const satuan1 = d.getElementById('ck-row-unit-' + idRow[1]).value;
  cek('satuan terisi dari master barang', satuan0 === 'Kg' && satuan1 === 'Pcs',
      'dapat ' + JSON.stringify([satuan0, satuan1]));
  w.eval("setNilaiKalender('ck-arrival-date', '2026-09-12', false);");
  isi(d, 'batch-pic-name', 'Wandi');

  jejak.url.length = 0;
  w.submitCKOrder(); await tunggu(80);

  const modal = d.getElementById('ck-konfirmasi-modal');
  const terbuka = () => (d.getElementById('ck-konfirmasi-modal') || {}).className.indexOf('modal-active') > -1;
  cek('rekap konfirmasi terbuka', !!modal && terbuka(),
      modal ? modal.className : 'modalnya tidak ada');
  /* INTI SELURUH BERKAS UJI INI. Rekap yang muncul sesudah barangnya terkirim
     tidak menahan apa pun. */
  cek('BELUM ada apa pun yang dikirim ke server', jejak.url.length === 0,
      'sudah menembak: ' + JSON.stringify(jejak.url));

  const rk = d.getElementById('ck-konfirmasi-list').innerHTML;
  cek('kedua barang masuk rekap', rk.indexOf('Ayam Fillet') > -1 && rk.indexOf('Bumbu Rendang') > -1, rk.slice(0, 400));
  cek('jumlah & satuannya ikut', rk.indexOf('5 ' + satuan0) > -1 && rk.indexOf('3 ' + satuan1) > -1, rk.slice(0, 400));
  /* Catatan per baris paling sering salah tempat, dan tanpa rekap tidak ada
     satu pun layar yang memperlihatkannya sebelum terkirim. */
  cek('catatan per baris ikut ditampilkan', rk.indexOf('potong dadu') > -1);
  cek('PIC disebut', d.getElementById('ck-konfirmasi-pic').textContent.indexOf('Wandi') > -1);
  cek('jumlah barangnya disebut', d.getElementById('ck-konfirmasi-jml').textContent.indexOf('2 barang') > -1);
  /* Tanggal cuma berlaku di jalur MINTA. */
  cek('tanggal dibutuhkan ditampilkan',
      d.getElementById('ck-konfirmasi-tgl-box').className.indexOf('hidden') < 0);
  cek('judulnya menyebut permintaan',
      d.getElementById('ck-konfirmasi-judul').textContent.indexOf('Permintaan') > -1,
      d.getElementById('ck-konfirmasi-judul').textContent);
  cek('kata kerja tombolnya sesuai jalurnya',
      d.getElementById('btn-ck-konfirmasi').innerHTML.indexOf('Kirim Permintaan') > -1,
      d.getElementById('btn-ck-konfirmasi').innerHTML);

  /* Batal TIDAK boleh mengirim apa pun, dan tidak boleh membuang isian form. */
  w.tutupKonfirmasiCK(); await tunggu(60);
  cek('menutup rekap tidak mengirim apa pun', jejak.url.length === 0);
  cek('...dan isian form tidak dibuang',
      d.getElementById('ck-row-item-' + idRow[0]).value === 'Ayam Fillet');

  /* TUNGGU SAMPAI PENUTUPANNYA BENAR-BENAR SELESAI sebelum membukanya lagi.
     closeModal() mencabut `modal-active` lewat setTimeout 300 ms; kalau modal
     dibuka lagi sebelum jadwal itu jalan, jadwal lama tetap menyala dan
     menutup modal yang BARU dibuka. Asersi "rekap ditutup sesudah
     dikonfirmasi" lalu hijau apa pun yang dilakukan kodenya — mutasi yang
     mencabut tutupKonfirmasiCK() memang LOLOS karena balapan ini. */
  await tunggu(400);
  w.submitCKOrder(); await tunggu(60);
  w.lanjutKonfirmasiCK(); await tunggu(450);   // closeModal() menunda 300 ms
  cek('sesudah dikonfirmasi barulah menembak server', jejak.url.length > 0,
      'tidak ada satu pun permintaan — konfirmasinya tidak menyambung ke pengiriman');
  cek('rekap ditutup sesudah dikonfirmasi', !terbuka());

  /* ---- jalur DUPLIKAT: rekap wajib menutup dulu ---- */
  await tunggu(400);
  /* Formnya DIISI ULANG: pengiriman yang berhasil mengosongkan barisnya —
     itu memang benar, dan uji yang tidak menyadarinya cuma menguji form
     kosong lalu mengira rekapnya yang tidak muncul. */
  w.eval('document.getElementById("ck-rows-wrapper").innerHTML = ""; addCKRow();');
  const idUlang = [...d.querySelectorAll('[id^="ck-row-item-"]')].map(el => el.id.replace('ck-row-item-', ''));
  isi(d, 'ck-row-item-' + idUlang[0], 'Ayam Fillet');
  isi(d, 'ck-row-qty-' + idUlang[0], '5');
  w.eval('onPilihBarangCK(' + idUlang[0] + ')');
  w.eval("setNilaiKalender('ck-arrival-date', '2026-09-12', false);");
  isi(d, 'batch-pic-name', 'Wandi');
  const dupAsli = w.eval('cekDuplikatCK');
  w.eval("cekDuplikatCK = async function(){ return [{ item:'Ayam Fillet', sudah:'3 Kg', tambah:'5 Kg' }]; };");
  jejak.url.length = 0;
  w.submitCKOrder(); await tunggu(80);
  cek('rekap terbuka lagi untuk pengajuan berikutnya', terbuka());
  w.lanjutKonfirmasiCK(); await tunggu(450);
  cek('rekap DITUTUP sebelum peringatan duplikat muncul', !terbuka(),
      'dua modal penuh layar bertumpuk — dua tombol Batal berdiri berdekatan');
  cek('peringatan duplikatnya benar-benar muncul',
      d.getElementById('duplicate-modal').className.indexOf('modal-active') > -1,
      d.getElementById('duplicate-modal').className);
  cek('...dan belum ada yang dikirim selagi duplikat ditanyakan',
      !jejak.url.some(u => u.indexOf('contoh/exec') > -1),
      JSON.stringify(jejak.url));
  w.eval('closeModal("duplicate-modal")');
  w.eval('cekDuplikatCK = ' + '(' + String(dupAsli) + ')');
  await tunggu(400);

  /* ================= 2. KIRIM KE CK ================= */
  console.log('\n== Kirim ke CK ==');
  w.eval('document.getElementById("kirim-rows-wrapper").innerHTML = ""; addKirimRow();');
  const idKir = [...d.querySelectorAll('[id^="kirim-row-item-"]')].map(el => el.id.replace('kirim-row-item-', ''));
  cek('baris form kirim tergambar', idKir.length === 1, 'dapat ' + idKir.length);
  isi(d, 'kirim-row-item-' + idKir[0], 'Ayam Fillet');
  isi(d, 'kirim-row-qty-' + idKir[0], '8');
  isi(d, 'kirim-row-note-' + idKir[0], 'dari supplier pagi');
  idKir.forEach(id => w.eval('onPilihBarangKirim(' + id + ')'));
  const satuanK = d.getElementById('kirim-row-unit-' + idKir[0]).value;
  isi(d, 'batch-pic-name', 'Wandi');

  jejak.url.length = 0;
  w.submitKirimCK(); await tunggu(80);
  cek('rekap kiriman terbuka', terbuka());
  cek('BELUM ada mutasi stok yang dicatat', jejak.url.length === 0,
      'sudah menembak: ' + JSON.stringify(jejak.url));
  const rk2 = d.getElementById('ck-konfirmasi-list').innerHTML;
  cek('barang & jumlahnya masuk rekap kiriman',
      rk2.indexOf('Ayam Fillet') > -1 && rk2.indexOf('8 ' + satuanK) > -1, rk2.slice(0, 300));
  cek('catatan kiriman ikut', rk2.indexOf('dari supplier pagi') > -1);
  /* Kata kerjanya WAJIB berbeda: "minta" dan "kirim" berlawanan arah, dan satu
     kalimat untuk keduanya membuat yang salah membuka tab tidak punya satu pun
     tanda bahwa ia sedang di form yang keliru. */
  cek('judulnya menyebut kiriman, bukan permintaan',
      d.getElementById('ck-konfirmasi-judul').textContent.indexOf('Kiriman') > -1,
      d.getElementById('ck-konfirmasi-judul').textContent);
  cek('kalimatnya menyebut stok CK BERTAMBAH',
      d.getElementById('ck-konfirmasi-sub').textContent.toLowerCase().indexOf('bertambah') > -1,
      d.getElementById('ck-konfirmasi-sub').textContent);
  /* Tanggal disembunyikan di jalur kirim: tanggalnya hari ini dan tidak
     diketik siapa pun, jadi kotak kosong cuma membuat orang mencarinya. */
  cek('kotak tanggal disembunyikan di jalur kirim',
      d.getElementById('ck-konfirmasi-tgl-box').className.indexOf('hidden') > -1);

  w.lanjutKonfirmasiCK(); await tunggu(450);
  cek('sesudah dikonfirmasi barulah mutasi dicatat',
      jejak.url.some(u => u.indexOf('ck.php') > -1),
      'dapat: ' + JSON.stringify(jejak.url));

  /* ================= 3. kontrak sumber ================= */
  console.log('\n== Kontrak sumber ==');
  const SRC = fs.readFileSync(path.join(ROOT, 'deploy/stock/ordering/index.html'), 'utf8');
  /* Kedua form WAJIB lewat rekap yang SAMA. Dua modal yang isinya nyaris sama
     akan menyimpang begitu salah satunya diperbaiki. */
  cek('kedua jalur memakai satu rekap yang sama',
      (SRC.match(/bukaKonfirmasiCK\(\);/g) || []).length === 2,
      'dapat ' + (SRC.match(/bukaKonfirmasiCK\(\);/g) || []).length + ' pemanggilan');
  /* Pengiriman TIDAK boleh lagi bisa dicapai langsung dari tombol form. */
  cek('tombol form tidak lagi memanggil pengirim langsung',
      SRC.indexOf('onclick="lanjutCKOrder(') < 0 && SRC.indexOf('onclick="lanjutKirimCK(') < 0);
  cek('rekap dibuka SEBELUM pemeriksa duplikat',
      SRC.indexOf('bukaKonfirmasiCK();') < SRC.indexOf('cekDuplikatCK(pesanan, tgl)'),
      'kalau dibalik, orang menjawab peringatan tentang pengajuan orang lain sebelum melihat pengajuannya sendiri');

  console.log('\n' + ok + ' OK, ' + gagal + ' GAGAL');
  dom.window.close();
  process.exit(gagal ? 1 : 0);
})();
