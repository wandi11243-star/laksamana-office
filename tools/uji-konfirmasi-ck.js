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
  const jejak = { url: [], body: [] };
  const dom = new JSDOM(html, { virtualConsole: vc, runScripts: 'dangerously',
    url: 'https://dev.laksamanamuda.id/stock/ordering/',
    beforeParse(w) {
      w.localStorage.setItem('lm_session', JSON.stringify({
        userId:'u1', name:'Wandi', username:'wandi',
        modules:['ordering'], adminModules:[], token:'t', expiry: Date.now() + 86400000 }));
      w.fetch = (url, opt) => {
        jejak.url.push(String(url));
        if (opt && opt.body) jejak.body.push(String(opt.body));
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
  w.eval("setSubCKOrder('kirim')"); await tunggu(100);
  w.eval('document.getElementById("kirim-rows-wrapper").innerHTML = ""; addKirimRow();');
  const idKir = [...d.querySelectorAll('[id^="kirim-row-item-"]')].map(el => el.id.replace('kirim-row-item-', ''));
  cek('baris form kirim tergambar', idKir.length === 1, 'dapat ' + idKir.length);
  isi(d, 'kirim-row-item-' + idKir[0], 'Ayam Fillet');
  isi(d, 'kirim-row-qty-' + idKir[0], '8');
  isi(d, 'kirim-row-note-' + idKir[0], 'dari supplier pagi');
  idKir.forEach(id => w.eval('onPilihBarangKirim(' + id + ')'));
  const satuanK = d.getElementById('kirim-row-unit-' + idKir[0]).value;
  isi(d, 'batch-pic-name', 'Wandi');

  /* SATUAN BEBAS (2 Nov 2026): seluruh satuan tampil, yang tak bisa
     dikonversi ke satuan dasar ditampilkan disabled. Ayam Fillet berdasar Kg. */
  const selK = d.getElementById('kirim-row-unit-' + idKir[0]);
  const opsiK = [...selK.options];
  cek('Gram ditawarkan untuk barang berdasar Kg', opsiK.some(o => o.value === 'Gram'));
  cek('satuan tanpa ukuran (Dus) TIDAK ditawarkan', !opsiK.some(o => o.value === 'Dus'),
      opsiK.map(o => o.value).join(','));
  /* Pilihan mengikuti SATUAN BAHAN Purchasing, persis Form Order Belanja. */
  w.eval("globalProductInfo['Botol Chubby'] = { sumber:'both', packIsi:0, packSatuan:'Botol', satuan:['Dus','Botol'], satuanDasar:'Botol', isi:{Dus:50} };");
  w.eval('addKirimRow();');
  const idBc = [...d.querySelectorAll('[id^="kirim-row-item-"]')].map(el => el.id.replace('kirim-row-item-', '')).pop();
  isi(d, 'kirim-row-item-' + idBc, 'Botol Chubby');
  w.eval('onPilihBarangKirim(' + idBc + ')');
  const opsiBc = [...d.getElementById('kirim-row-unit-' + idBc).options].map(o => o.textContent);
  cek('pilihan = satuan bahan + ukurannya ("Dus (50 Botol)", "Botol")',
      opsiBc.length === 2 && opsiBc[0] === 'Dus (50 Botol)' && opsiBc[1] === 'Botol', JSON.stringify(opsiBc));
  cek('2 Dus -> 100 Botol', w.eval("ckKeDasarKirim(2,'Dus',globalProductInfo['Botol Chubby'])") === 100);
  /* Bentuk PRODUKSI (2 Nov 2026): stok Gudang Bar per DUS, Purchasing
     mengukur per Botol. Botol wajib tetap ditawarkan, = 0,02 Dus. */
  w.eval("globalProductInfo['Botol Chubby'] = { sumber:'both', packIsi:0, packSatuan:'Dus', satuan:['Dus','Botol'], satuanDasar:'Botol', isi:{Dus:50} };");
  w.eval('onPilihBarangKirim(' + idBc + ')');
  const opsiBc2 = [...d.getElementById('kirim-row-unit-' + idBc).options].map(o => o.value);
  cek('stok per Dus: Botol tetap ditawarkan', opsiBc2.includes('Botol') && opsiBc2.includes('Dus'), JSON.stringify(opsiBc2));
  cek('stok per Dus: 25 Botol -> 0.5 Dus', Math.abs(w.eval("ckKeDasarKirim(25,'Botol',globalProductInfo['Botol Chubby'])") - 0.5) < 1e-9);
  cek('stok per Dus: 2 Dus -> 2 Dus', w.eval("ckKeDasarKirim(2,'Dus',globalProductInfo['Botol Chubby'])") === 2);
  d.getElementById('kirim-row-item-' + idBc).closest('[id^="kirim-row-"]') && w.eval('document.getElementById("kirim-rows-wrapper").lastElementChild.remove()');
  cek('konversi 500 Gram -> 0.5 Kg', Math.abs(w.eval("ckKeDasarKirim(500,'Gram',{packIsi:0,packSatuan:'Kg'})") - 0.5) < 1e-9);
  cek('konversi 2 Kg -> 2000 Gram', w.eval("ckKeDasarKirim(2,'Kg',{packIsi:0,packSatuan:'gr'})") === 2000);
  cek('Pack memakai isi pack', w.eval("ckKeDasarKirim(3,'Pack',{packIsi:5,packSatuan:'Pcs'})") === 15);
  cek('satuan tanpa ukuran = null', w.eval("ckFaktorSatuan('Dus',{packIsi:0,packSatuan:'Kg'})") === null);

  /* TANGGAL KIRIM bisa disetel (2 Nov 2026). */
  cek('kotak tanggal kirim tampil di sub-tab kirim',
      d.getElementById('ck-kirim-tgl-wrap').className.indexOf('hidden') < 0);
  w.eval("setNilaiKalender('ck-kirim-date', '2026-09-10', false);");

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
  cek('rekap kiriman menampilkan tanggal kirim',
      d.getElementById('ck-konfirmasi-tgl-box').className.indexOf('hidden') < 0
      && d.getElementById('ck-konfirmasi-tgl-label').textContent === 'Tanggal Kirim');

  jejak.body.length = 0;
  w.lanjutKonfirmasiCK(); await tunggu(450);
  cek('sesudah dikonfirmasi barulah mutasi dicatat',
      jejak.url.some(u => u.indexOf('ck.php') > -1),
      'dapat: ' + JSON.stringify(jejak.url));
  const kirimBody = jejak.body.map(b => { try { return JSON.parse(b); } catch (e) { return {}; } }).find(b => b.action === 'kirim');
  cek('mutasi kiriman memakai tanggal yang dipilih', kirimBody && kirimBody.tanggal === '2026-09-10',
      JSON.stringify(kirimBody));

  /* ================= 2b. UBAH KIRIMAN (2 Nov 2026) ================= */
  console.log('\n== Ubah kiriman di riwayat ==');
  w.eval("riwayatKiriman = [{ id:'CKK1', tanggal:'2026-09-08', item:'Ayam Fillet', arah:'masuk', qty:8, qtyInput:8, unitInput:'Kg', sebab:'kiriman', status:'', ref:'', tim:'', pic:'Wandi', waktu:'', catatan:'awal', packIsi:0, packSatuan:'Kg', diubahOleh:'', diubahAt:'', nUbah:0 }]; renderRiwayatKiriman();");
  const tombolUbah = d.querySelector('[onclick^="bukaUbahKiriman("]');
  cek('baris riwayat punya tombol ubah', !!tombolUbah);
  if (tombolUbah) {
    tombolUbah.click(); await tunggu(50);
    cek('modal ubah terbuka', d.getElementById('ubah-kiriman-modal').classList.contains('modal-active'));
    cek('modal terisi angka lama', d.getElementById('ubk-qty').value === '8' && d.getElementById('ubk-tgl').value === '2026-09-08');
    cek('satuan ditawarkan termasuk Gram', [...d.getElementById('ubk-unit').options].some(o => o.value === 'Gram'));
    d.getElementById('ubk-qty').value = '500';
    d.getElementById('ubk-unit').value = 'Gram';
    jejak.body.length = 0;
    await w.simpanUbahKiriman(); await tunggu(80);
    const ub = jejak.body.map(b => { try { return JSON.parse(b); } catch (e) { return {}; } }).find(b => b.action === 'kirim');
    cek('kiriman diubah lewat id yang sama', ub && ub.id === 'CKK1' && ub.qtyInput === 500 && ub.unitInput === 'Gram' && ub.item === 'Ayam Fillet',
        JSON.stringify(ub));
  }
  w.eval("riwayatKiriman = [{ id:'CKK1', tanggal:'2026-09-08', item:'Ayam Fillet', arah:'masuk', qty:0.5, qtyInput:500, unitInput:'Gram', sebab:'kiriman', status:'', ref:'', tim:'', pic:'Wandi', waktu:'', catatan:'', packIsi:0, packSatuan:'Kg', diubahOleh:'Wandi', diubahAt:'2026-11-02 10:00:00', nUbah:2 }]; renderRiwayatKiriman();");
  cek('jejak ubah tampil di baris', d.getElementById('kirim-riwayat-wrap').textContent.indexOf('diubah Wandi') > -1);
  // Angka stok BASI (satuan stok diganti sesudah kiriman dicatat): simpan tanpa ubah isian tetap dikirim.
  w.eval("riwayatKiriman = [{ id:'CKK2', tanggal:'2026-09-08', item:'Ayam Fillet', arah:'masuk', qty:0.083, qtyInput:1, unitInput:'Kg', sebab:'kiriman', status:'', ref:'', tim:'', pic:'Wandi', waktu:'', catatan:'', packIsi:0, packSatuan:'Dus', diubahOleh:'', diubahAt:'', nUbah:0 }]; renderRiwayatKiriman();");
  w.eval("bukaUbahKiriman('CKK2')"); await tunggu(30);
  cek('modal menyebut stok tercatat basi', /0.083 Dus/.test(d.getElementById('ubk-info').textContent) && /1 Kg/.test(d.getElementById('ubk-info').textContent), d.getElementById('ubk-info').textContent);
  jejak.body.length = 0; await w.simpanUbahKiriman(); await tunggu(80);
  cek('angka basi tetap boleh disimpan tanpa mengubah isian', jejak.body.some(b => b.indexOf('CKK2') > -1));
  // Sisa stok ditulis per satuan beli, bukan satuan kecil (2 Nov 2026).
  w.eval("globalProductInfo['Syrup X'] = { sumber:'both', packIsi:0, packSatuan:'ML', satuan:['ML','Botol'], satuanDasar:'ML', isi:{Botol:760} };");
  const tampil = w.eval("ckPackUtamaOrder(3040, globalProductInfo['Syrup X'], '')");
  cek('stok 3040 ML ditulis 4 Botol', /4 Botol/.test(tampil) && /3040 ML/.test(tampil), tampil);
  w.eval("globalProductInfo['Lemon X'] = { sumber:'both', packIsi:0, packSatuan:'Gram', satuan:['Gram','Kg','Pcs'], satuanDasar:'Gram', isi:{Pcs:750} };");
  cek('satuan beli terkecil yang dipilih (Pcs 750 g, bukan Kg)', w.eval("ckSatuanTampil(globalProductInfo['Lemon X']).u") === 'Pcs');
  cek('barang tanpa ukuran tetap satuan stoknya', w.eval("ckSatuanTampil({packIsi:0,packSatuan:'Pcs',satuan:['Pcs']})") === null);
  // Satuan Tampilan Stok dari Purchasing (3 Nov 2026) menang atas otomatis.
  w.eval("globalProductInfo['Lemon X'].satuanTampil = 'Kg';");
  cek('setelan Kg dipakai: 1500 Gram -> 1.5 Kg', /1[.,]5 Kg/.test(w.eval("ckPackUtamaOrder(1500, globalProductInfo['Lemon X'], '')")), w.eval("ckPackUtamaOrder(1500, globalProductInfo['Lemon X'], '')"));
  w.eval("globalProductInfo['Lemon X'].satuanTampil = 'Gram';");
  const tG = w.eval("ckPackUtamaOrder(1500, globalProductInfo['Lemon X'], '')");
  cek('setelan satuan dasar: satu baris saja', /1500 Gram/.test(tG) && (tG.match(/Gram/g) || []).length === 1, tG);
  w.eval("globalProductInfo['Lemon X'].satuanTampil = 'Dus';");
  cek('satuan tanpa ukuran jatuh ke otomatis', w.eval("ckSatuanTampil(globalProductInfo['Lemon X']).u") === 'Pcs');
  w.eval("globalProductInfo['Pack X'] = { sumber:'ck', packIsi:500, packSatuan:'Gram', satuan:['Pack','Gram'], satuanDasar:'', isi:{}, satuanTampil:'Gram' };");
  const tP = w.eval("ckPackUtamaOrder(1500, globalProductInfo['Pack X'], '')");
  cek('barang dipack bisa dipaksa satuan dasar', /1500 Gram/.test(tP) && !/Pack/.test(tP), tP);

  /* FORM MINTA = satuan FORM KIRIM (3 Nov 2026), bawaannya Satuan Tampilan. */
  w.eval("globalProductInfo['Lemon X'].satuanTampil = 'Kg';");
  w.eval('addCKRow();');
  const idM = [...d.querySelectorAll('[id^="ck-row-item-"]')].map(el => el.id.replace('ck-row-item-', '')).pop();
  isi(d, 'ck-row-item-' + idM, 'Lemon X');
  w.eval('onPilihBarangCK(' + idM + ')');
  const opsiM = [...d.getElementById('ck-row-unit-' + idM).options].map(o => o.value);
  w.eval('addKirimRow();');
  const idK2 = [...d.querySelectorAll('[id^="kirim-row-item-"]')].map(el => el.id.replace('kirim-row-item-', '')).pop();
  isi(d, 'kirim-row-item-' + idK2, 'Lemon X');
  w.eval('onPilihBarangKirim(' + idK2 + ')');
  const opsiK2 = [...d.getElementById('kirim-row-unit-' + idK2).options].map(o => o.value);
  cek('minta menawarkan satuan yang sama dengan kirim', JSON.stringify(opsiM) === JSON.stringify(opsiK2) && opsiM.includes('Kg'),
      JSON.stringify(opsiM) + ' vs ' + JSON.stringify(opsiK2));
  cek('minta: bawaan = satuan tampilan (Kg)', d.getElementById('ck-row-unit-' + idM).value === 'Kg', d.getElementById('ck-row-unit-' + idM).value);
  cek('kirim: bawaan = satuan tampilan (Kg)', d.getElementById('kirim-row-unit-' + idK2).value === 'Kg', d.getElementById('kirim-row-unit-' + idK2).value);
  cek('minta 2 Kg dihitung 2000 Gram', w.eval("ckKeDasar(2,'Kg',globalProductInfo['Lemon X'])") === 2000);
  cek('pilihan yang diubah orang bertahan saat baris disegarkan', (() => {
      d.getElementById('ck-row-unit-' + idM).value = 'Gram'; w.eval('onPilihBarangCK(' + idM + ')');
      return d.getElementById('ck-row-unit-' + idM).value === 'Gram'; })());
  cek('chip sisa memakai satuan tampilan', /Kg/.test(w.eval("ckTeksPack(7000, globalProductInfo['Lemon X'])")), w.eval("ckTeksPack(7000, globalProductInfo['Lemon X'])"));
  isi(d, 'ck-row-item-' + idM, 'Pack X');
  w.eval('onPilihBarangCK(' + idM + ')');
  const opsiPX = [...d.getElementById('ck-row-unit-' + idM).options].map(o => o.value);
  cek('minta: barang dipack tetap Pack saja', JSON.stringify(opsiPX) === '["Pack"]', JSON.stringify(opsiPX));
  w.eval('document.getElementById("ck-rows-wrapper").lastElementChild.remove(); document.getElementById("kirim-rows-wrapper").lastElementChild.remove();');
  const SRCCK = fs.readFileSync(path.join(ROOT, 'stock-mysql/lib_stock_ck.php'), 'utf8');
  cek('php: sinkron order memakai faktor satuan', SRCCK.indexOf('pur_ck_ke_dasar($qtyInput, $unit, $p->packIsi, $p->packSatuan, $p)') > -1
      && SRCCK.indexOf('$f = pur_ck_faktor_satuan($unit, $p);') > -1);
  const SRCPUR = fs.readFileSync(path.join(ROOT, 'deploy/stock/purchasing/index.html'), 'utf8');
  cek('purchasing mengirim satuanTampil', SRCPUR.indexOf("satuanTampil: adaDiCKProd ?") > -1);
  cek('php: satuanTampil disimpan & dipulangkan',
      fs.readFileSync(path.join(ROOT, 'stock-mysql/lib_stock_mysql.php'), 'utf8').indexOf("'satuanTampil' => $adaDiCK ?") > -1
      && fs.readFileSync(path.join(ROOT, 'stock-mysql/lib_stock_ck.php'), 'utf8').indexOf("'satuanTampil'=>") > -1
      && fs.readFileSync(path.join(ROOT, 'stock-mysql/items.php'), 'utf8').indexOf('$b->satuanTampil ?? null') > -1);
  const SRCPHP = fs.readFileSync(path.join(ROOT, 'stock-mysql/lib_stock_ck.php'), 'utf8');
  cek('php: ubah kiriman menolak ganti barang & baris bukan kiriman',
      SRCPHP.indexOf("barang kiriman tidak bisa diganti") > -1 && SRCPHP.indexOf("baris ini bukan kiriman") > -1);
  cek('php: nilai lama disimpan di data.diubah', SRCPHP.indexOf("$rec->diubah = array_slice($jejak, -20);") > -1);

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
