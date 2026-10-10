/* uji-gudang-bar.js — Gudang Bar = mesin Central Kitchen dengan gudang kedua,
 * plus matriks hak akses per sub-menu di panel Ordering (10 Oktober 2026).
 *
 *   node tools/uji-gudang-bar.js
 *
 * Permintaan user: "Gudang Bar konsepnya samakan dengan Central Kitchen,
 * jangan dibuat baru lagi". Yang dijaga:
 *  - menu Gudang Bar membuka layar CK yang SAMA, dengan gudang 'bar':
 *    daftar barang = sumber 'bar', endpoint ck.php?gudang=bar, batch
 *    pengajuan "Gudang Bar";
 *  - kembali ke Central Kitchen memulihkan semuanya (batch "Central Kitchen",
 *    barang ck/both) — dua gudang tidak boleh saling bocor;
 *  - Form Order Belanja TIDAK ikut berubah (infoCKItem tetap milik CK);
 *  - draf Minta/Kirim terpisah per gudang;
 *  - matriks: bawaan = aturan lama, 'gb' Lihat menutup Minta/Kirim dan
 *    fungsi kirimnya menolak;
 *  - Purchasing: sumber 'bar' di Atur Produk, pengajuan Gudang Bar jadi grup
 *    sendiri di Jemput, halaman CK punya pemilih gudang;
 *  - PHP: ck_stock dapat kolom gudang lewat ALTER, sinkron check-in mengenali
 *    batch "Gudang Bar", ck.php meneruskan gudang.
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
  console.error('jsdom tidak ketemu. Setel JSDOM_PATH.'); process.exit(2);
})();

let ok = 0, gagal = 0;
const cek = (n, s, k) => { if (s) { ok++; console.log('  OK   ' + n); } else { gagal++; console.log('  GAGAL ' + n + (k ? '  — ' + k : '')); } };
const tunggu = ms => new Promise(r => setTimeout(r, ms));

const PRODUK = {
  'Ayam Fillet': { sumber: 'ck',   packIsi: 0, packSatuan: 'Kg',  satuan: ['Kg'] },
  'Bumbu Rendang': { sumber: 'both', packIsi: 0, packSatuan: 'Pcs', satuan: ['Pcs'], diOutlet: true },
  'Gin':         { sumber: 'bar',  packIsi: 750, packSatuan: 'ML', satuan: ['Pack', 'ML'], diOutlet: true },
  'Lemon':       { sumber: 'bar',  packIsi: 0, packSatuan: 'Pcs', satuan: ['Pcs'], diOutlet: true },
  'Gula':        { sumber: '',     satuan: ['Kg'] }
};

function bukaOrdering(opt) {
  opt = opt || {};
  const asli = fs.readFileSync(path.join(ROOT, 'deploy/stock/ordering/index.html'), 'utf8');
  const lokal = b => { const j = path.join(ROOT, 'deploy/stock/ordering', b); return fs.existsSync(j) ? fs.readFileSync(j, 'utf8') : ''; };
  const html = asli
    .replace(/<script[^>]*\ssrc="laksamana-forecast\.js"[^>]*><\/script>/i, () => '<script>' + lokal('laksamana-forecast.js') + '<' + '/script>')
    .replace(/<script[^>]*\ssrc="forecast_export\.js"[^>]*><\/script>/i, () => '<script>' + lokal('forecast_export.js') + '<' + '/script>')
    .replace(/<script[^>]*\ssrc="https?:[^>]*><\/script>/gi, '');
  const jejak = [];
  const S = { perms: opt.perms || null, simpanPerms: 0 };
  const dom = new JSDOM(html, { virtualConsole: new VirtualConsole(), runScripts: 'dangerously', url: 'https://dev.laksamanamuda.id/stock/ordering/',
    beforeParse(w) {
      w.localStorage.setItem('lm_session', JSON.stringify({ userId: 'u1', name: 'Wandi', username: 'wandi',
        modules: ['ordering'], adminModules: [], token: 't', expiry: Date.now() + 86400000 }));
      w.fetch = (url, o) => {
        const u = String(url); const body = o && o.body ? JSON.parse(o.body) : null;
        jejak.push({ url: u, body });
        let j = { status: 'success', created: 1, merged: 0, mutasi: [], data: [], orders: [], users: [] };
        if (u.indexOf('ck.php') > -1 && !body) {
          const g = /gudang=bar/.test(u) ? 'bar' : 'ck';
          j = { gudang: g, saldo: g === 'bar' ? [{ item: 'Gin', saldo: 1500 }, { item: 'Lemon', saldo: 20 }] : [{ item: 'Ayam Fillet', saldo: 9 }],
                mutasi: g === 'bar' ? [{ id: 'GBK1', tanggal: '2026-10-10', item: 'Gin', arah: 'masuk', qty: 750, sebab: 'kiriman' }] : [] };
        }
        if (u.indexOf('ordering-settings.php') > -1) {
          if (!body) j = { perms: S.perms || {} };
          else if (body.action === 'savePerms') { S.perms = body.perms; S.simpanPerms++; j = { status: 'success' }; }
        }
        const t = JSON.stringify(j);
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(JSON.parse(t)), text: () => Promise.resolve(t) });
      };
      w.tailwind = { config: {} };
      w.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
      w.print = () => {}; w.alert = () => {}; w.confirm = () => true;
      w.HTMLCanvasElement.prototype.getContext = () => ({});
    } });
  return { dom, jejak, S };
}
async function siap(w) {
  const selesai = () => { try { w.eval('tabAktif'); w.eval('ckRowCount'); return true; } catch (e) { return false; } };
  for (let i = 0; i < 150 && !selesai(); i++) await tunggu(20);
  return selesai();
}
async function masuk(w, role) {
  w.eval("enterApp({id:'u1', name:'Wandi', pin:'', role:'" + role + "', keterangan:'Bar'})");
  await tunggu(120);
  w.eval('globalProductInfo = ' + JSON.stringify(PRODUK) + ';');
  w.eval("state.appScriptUrlHistory = 'https://contoh/exec';");
  w.eval("document.querySelectorAll('[data-kal]').forEach(el => { if (!el.querySelector('input')) pasangKalender(el); });");
}
const tampak = (d, id) => { const e = d.getElementById(id); return !!e && !e.classList.contains('hidden'); };
const isi = (d, id, v) => { const el = d.getElementById(id); if (el) el.value = v; return !!el; };

(async () => {
  console.log('\n== Gudang Bar = layar Central Kitchen yang sama ==');
  {
    const { dom, jejak } = bukaOrdering();
    const w = dom.window, d = w.document;
    cek('modul ter-boot', await siap(w));
    await masuk(w, 'full');
    cek('buku stok terpisah lama sudah dicabut', !d.getElementById('view-gb') && typeof w.gbSimpan === 'undefined');
    jejak.length = 0;
    w.eval("switchTab('gb')"); await tunggu(150);
    cek('menu Gudang Bar membuka view-ck', tampak(d, 'view-ck') && w.eval('GUDANG') === 'bar', w.eval('GUDANG'));
    cek('menu Gudang Bar yang menyala, bukan Central Kitchen', /bg-indigo-50/.test(d.getElementById('tab-gb').className) && !/bg-indigo-50/.test(d.getElementById('tab-ck').className));
    cek('judul & sub-tab menyebut Gudang Bar', /Gudang Bar/.test(d.getElementById('ck-judul').textContent) && /Gudang Bar/.test(d.getElementById('subcko-minta').textContent));
    cek('daftar barang = sumber bar saja', w.eval('JSON.stringify(daftarBarangCK())') === '["Gin","Lemon"]', w.eval('JSON.stringify(daftarBarangCK())'));
    w.eval("setSubCKOrder('stok')"); await tunggu(150);
    cek('saldo ditarik dari ck.php?gudang=bar', jejak.some(x => /ck\.php\?gudang=bar/.test(x.url) && !x.body));
    cek('stok yang tergambar milik Gudang Bar', /Gin/.test(d.getElementById('cko-stok-wrap').textContent) && !/Ayam Fillet/.test(d.getElementById('cko-stok-wrap').textContent));

    /* Minta dari Gudang Bar -> batch "Gudang Bar" */
    w.eval("setSubCKOrder('minta')"); await tunggu(30);
    w.eval('document.getElementById("ck-rows-wrapper").innerHTML = ""; addCKRow();');
    const id = [...d.querySelectorAll('[id^="ck-row-item-"]')].map(el => el.id.replace('ck-row-item-', ''))[0];
    isi(d, 'ck-row-item-' + id, 'Lemon'); isi(d, 'ck-row-qty-' + id, '6');
    w.eval('onPilihBarangCK(' + id + ')');
    w.eval("setNilaiKalender('ck-arrival-date', '2026-10-11', false);");
    isi(d, 'batch-pic-name', 'Wandi');
    w.eval('cekDuplikatCK = async function(){ return []; };');
    jejak.length = 0;
    w.submitCKOrder(); await tunggu(80);
    cek('rekap konfirmasi menyebut Gudang Bar', /Gudang Bar/.test(d.getElementById('ck-konfirmasi-judul').textContent) || /Gudang Bar/.test(d.getElementById('ck-konfirmasi-modal').textContent));
    w.lanjutKonfirmasiCK(); await tunggu(450);
    const kirim = jejak.find(x => x.body && x.body.action === 'batchOrder');
    cek('pengajuan terkirim ber-batch "Gudang Bar"', kirim && kirim.body.batchName === 'Gudang Bar', kirim && JSON.stringify(kirim.body).slice(0, 160));

    /* barang CK ditolak di mode Bar */
    w.eval('document.getElementById("ck-rows-wrapper").innerHTML = ""; addCKRow();');
    const id2 = [...d.querySelectorAll('[id^="ck-row-item-"]')].map(el => el.id.replace('ck-row-item-', ''))[0];
    isi(d, 'ck-row-item-' + id2, 'Ayam Fillet'); isi(d, 'ck-row-qty-' + id2, '2');
    jejak.length = 0; await tunggu(400);
    w.submitCKOrder(); await tunggu(80);
    cek('barang Central Kitchen tidak bisa diminta dari Gudang Bar', !jejak.some(x => x.body && x.body.action === 'batchOrder') && !/modal-active/.test(d.getElementById('ck-konfirmasi-modal').className));

    /* Kirim ke Gudang Bar -> ck.php?gudang=bar */
    w.eval("setSubCKOrder('kirim')"); await tunggu(30);
    cek('daftar kirim = barang bar yang ada di outlet', w.eval('JSON.stringify(daftarBarangKirimCK())') === '["Gin","Lemon"]', w.eval('JSON.stringify(daftarBarangKirimCK())'));
    w.eval("setSubCKOrder('riwayat')"); await tunggu(120);
    cek('riwayat kiriman dari gudang bar', /Gin/.test(d.getElementById('kirim-riwayat-wrap').textContent));

    /* kembali ke Central Kitchen */
    w.eval("switchTab('ck')"); await tunggu(150);
    cek('kembali ke Central Kitchen: GUDANG ck', w.eval('GUDANG') === 'ck');
    cek('judul kembali Central Kitchen', /Central Kitchen/.test(d.getElementById('ck-judul').textContent) && !/Gudang Bar/.test(d.getElementById('subcko-minta').textContent));
    cek('daftar barang CK = ck & both', w.eval('JSON.stringify(daftarBarangCK())') === '["Ayam Fillet","Bumbu Rendang"]');
    cek('form dikosongkan saat pindah gudang', d.querySelectorAll('#ck-rows-wrapper > *').length <= 2 && ![...d.querySelectorAll('[id^="ck-row-item-"]')].some(x => x.value === 'Ayam Fillet' || x.value === 'Lemon'));
    w.eval("setSubCKOrder('minta')"); await tunggu(30);
    w.eval('document.getElementById("ck-rows-wrapper").innerHTML = ""; addCKRow();');
    const id3 = [...d.querySelectorAll('[id^="ck-row-item-"]')].map(el => el.id.replace('ck-row-item-', ''))[0];
    isi(d, 'ck-row-item-' + id3, 'Ayam Fillet'); isi(d, 'ck-row-qty-' + id3, '2');
    w.eval('onPilihBarangCK(' + id3 + ')');
    w.eval("setNilaiKalender('ck-arrival-date', '2026-10-11', false);");
    jejak.length = 0; await tunggu(400);
    w.submitCKOrder(); await tunggu(80); w.lanjutKonfirmasiCK(); await tunggu(450);
    const k2 = jejak.find(x => x.body && x.body.action === 'batchOrder');
    cek('pengajuan CK tetap ber-batch "Central Kitchen"', k2 && k2.body.batchName === 'Central Kitchen', k2 && k2.body.batchName);

    /* Form Order Belanja tidak terpengaruh */
    w.eval("GUDANG='bar'");
    cek('infoCKItem (Form Belanja) tetap milik CK walau GUDANG=bar', w.eval("!!infoCKItem('Bumbu Rendang') && !infoCKItem('Gin')"));
    w.eval("GUDANG='ck'");
    cek('dariFormCK mengenali kedua batch (pemilih batch & check-in)', w.eval("dariFormCK({batchName:'Gudang Bar'}) && dariFormCK({batchName:'Central Kitchen'}) && !dariFormCK({batchName:'Batch 1'})"));
    cek('dariFormGudang membedakan keduanya', w.eval("dariFormGudang({batchName:'gudang bar'})") === 'bar' && w.eval("dariFormGudang({batch_name:'Central Kitchen'})") === 'ck');

    /* draf per gudang */
    w.eval("GUDANG='bar'");
    cek('kunci draf Gudang Bar terpisah', w.eval("kunciDraf('ck')") === 'ck@bar' && w.eval("kunciDraf('kirim')") === 'kirim@bar' && w.eval("kunciDraf('belanja')") === 'belanja');
    w.eval("GUDANG='ck'");
    cek('kunci draf CK tetap seperti dulu', w.eval("kunciDraf('ck')") === 'ck');
  }

  console.log('\n== Hak akses per sub-menu ==');
  {
    const { dom, jejak } = bukaOrdering();
    const w = dom.window, d = w.document;
    await siap(w); await masuk(w, 'checkin');
    cek('Check-in Saja mendarat di Check-in', w.eval('tabAktif') === 'checkin', w.eval('tabAktif'));
    cek('Check-in Saja: Order & CK tersembunyi, Gudang Bar terlihat', !tampak(d, 'tab-order') && !tampak(d, 'tab-ck') && tampak(d, 'tab-gb'));
    w.eval("switchTab('order')");
    cek('switchTab tidak bisa memaksa halaman Tak Terlihat', w.eval('tabAktif') === 'noakses');
    w.eval("switchTab('gb')"); await tunggu(150);
    cek('Gudang Bar (Lihat): sub-tab Minta & Kirim disembunyikan', !tampak(d, 'subcko-minta') && !tampak(d, 'subcko-kirim'));
    cek('Gudang Bar (Lihat): mendarat di Stok', w.eval('subCKOrder') === 'stok');
    w.eval("setSubCKOrder('minta')");
    cek('setSubCKOrder tidak bisa memaksa form Minta', w.eval('subCKOrder') === 'stok');
    const tc = d.getElementById('toast-container'); tc.innerHTML = '';
    jejak.length = 0;
    try { w.eval('submitCKOrder()'); } catch (e) {}
    await tunggu(40);
    cek('submitCKOrder dari console ditolak (Akses Ditolak)', /Akses Ditolak/.test(tc.textContent) && !jejak.some(x => x.body && x.body.action === 'batchOrder'), tc.textContent.slice(0, 100));
    tc.innerHTML = '';
    try { w.eval('submitKirimCK()'); } catch (e) {}
    await tunggu(40);
    cek('submitKirimCK dari console ditolak', /Akses Ditolak/.test(tc.textContent));
    await masuk(w, 'full');
    cek('Order + Check-in mendarat di Form Order', w.eval('tabAktif') === 'order');
    await masuk(w, 'admin');
    w.eval("switchTab('users')"); await tunggu(80);
    cek('matriks tergambar: 6 sub-menu × 2 peran', d.querySelectorAll('#perm-matrix .perm-btn:not([disabled])').length === 12);
  }
  {
    const { dom, S } = bukaOrdering({ perms: { gb: { checkin: 0 }, order: { checkin: 1 } } });
    const w = dom.window, d = w.document;
    await siap(w); await masuk(w, 'checkin'); await tunggu(150);
    cek('setelan server: Gudang Bar Tak Terlihat untuk Check-in Saja', !tampak(d, 'tab-gb'));
    cek('setelan server: Order jadi Lihat, tombol kirim disembunyikan', tampak(d, 'tab-order') && (w.eval("switchTab('order')"), !tampak(d, 'btn-trigger-submit')));
    const tc = d.getElementById('toast-container'); tc.innerHTML = '';
    try { w.eval('startOrderSubmission()'); } catch (e) {}
    await tunggu(30);
    cek('Order hanya-lihat: startOrderSubmission ditolak', /Akses Ditolak/.test(tc.textContent));
    await masuk(w, 'admin'); w.eval("switchTab('users')"); await tunggu(80);
    const sel = d.querySelector('#perm-matrix .perm-btn[data-page="gb"][data-role="checkin"]');
    cek('sel membaca nilai server', sel && sel.dataset.v === '0');
    sel.click(); w.eval('ordPermSimpan()'); await tunggu(150);
    cek('matriks tersimpan ke server', S.simpanPerms === 1 && S.perms.gb.checkin === 1);
  }

  console.log('\n== Purchasing ==');
  {
    const src = fs.readFileSync(path.join(ROOT, 'deploy/stock/purchasing/index.html'), 'utf8');
    /* Skrip LOKAL disisipkan inline (jsdom tidak mengambil skrip eksternal):
       tanpa itu blok utama mati di tengah dan `const` di bawahnya tetap di TDZ. */
    const lokalP = b => { const j = path.join(ROOT, 'deploy/stock/purchasing', b); return fs.existsSync(j) ? fs.readFileSync(j, 'utf8') : ''; };
    const html = src
      .replace(/<script[^>]*\ssrc="laksamana-forecast\.js"[^>]*><\/script>/i, () => '<script>' + lokalP('laksamana-forecast.js') + '<' + '/script>')
      .replace(/<script[^>]*\ssrc="forecast_export\.js"[^>]*><\/script>/i, () => '<script>' + lokalP('forecast_export.js') + '<' + '/script>')
      .replace(/<script[^>]*\ssrc="https?:[^>]*><\/script>/gi, '');
    const jejak = [];
    const dom = new JSDOM(html, { virtualConsole: new VirtualConsole(), runScripts: 'dangerously', url: 'https://dev.laksamanamuda.id/stock/purchasing/',
      beforeParse(w) {
        w.fetch = (url, o) => { jejak.push({ url: String(url), body: o && o.body ? JSON.parse(o.body) : null });
          const t = JSON.stringify({ status: 'success', saldo: [], mutasi: [], perms: {}, templates: {}, users: [], products: {}, vendors: {} });
          return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(JSON.parse(t)), text: () => Promise.resolve(t) }); };
        w.tailwind = { config: {} };
        w.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
        w.alert = () => {}; w.confirm = () => true; w.HTMLCanvasElement.prototype.getContext = () => ({});
      } });
    const w = dom.window, d = w.document;
    for (let i = 0; i < 150; i++) { try { w.eval('CK_GUDANG'); break; } catch (e) { await tunggu(20); } }
    cek('Purchasing ter-boot', (() => { try { w.eval('CK_GUDANG'); return true; } catch (e) { return false; } })());
    w.eval('appState.products = ' + JSON.stringify(PRODUK) + ';');
    cek('pengajuan "Gudang Bar" = pesanan gudang (keluar dari Monitor Order)', w.eval("pesananCK({batchName:'Gudang Bar', item:'Lemon'})") === true);
    cek('gudangPesanan membedakan CK & Bar', w.eval("gudangPesanan({batchName:'Gudang Bar'})") === 'bar' && w.eval("gudangPesanan({batchName:'Central Kitchen'})") === 'ck' && w.eval("gudangPesanan({batchName:'Batch 1', item:'Gula'})") === '');
    /* Jemput: pengajuan Gudang Bar berdiri sebagai grupnya SENDIRI, bukan
       ditumpuk di bawah Central Kitchen — yang mengambil barangnya pergi ke
       rak yang berbeda. Mutasi "semua pengajuan gudang masuk grup CK" sempat
       lolos sebelum blok ini ada. */
    w.eval("appState.orders = [" +
      "{rowIndex:11, item:'Ayam Fillet', qty:2, unit:'Kg', batchName:'Central Kitchen', tglJemput:'2026-10-10', status:'Aktif', kedatangan:''}," +
      "{rowIndex:12, item:'Lemon', qty:6, unit:'Pcs', batchName:'Gudang Bar', tglJemput:'2026-10-10', status:'Aktif', kedatangan:''}];");
    const jd = d.getElementById('jemput-date'); if (jd) jd.value = '2026-10-10';
    try { w.eval('renderJemput(true)'); } catch (e) { console.log('  !! renderJemput: ' + e.message); }
    const jw = (d.getElementById('jemput-wrapper') || {}).textContent || '';
    cek('Jemput: grup Gudang Bar sendiri', /🍸 Gudang Bar/.test(jw) && /memotong stok Gudang Bar/.test(jw), jw.slice(0, 200));
    cek('Jemput: grup Central Kitchen tetap ada', /👨‍🍳 Central Kitchen/.test(jw));
    cek('Atur Produk punya tombol Vendor & Gudang Bar', !!d.getElementById('prod-sumber-bar'));
    w.eval("setSumberProduk('bar')");
    cek('sumber bar tersimpan & sisi gudang (pack) terbuka', d.getElementById('prod-sumber').value === 'bar' && !d.getElementById('prod-pack-wrap').classList.contains('hidden') && !d.getElementById('prod-vendor-wrap').classList.contains('hidden'));
    jejak.length = 0;
    w.eval("setGudangCK('bar')"); await tunggu(80);
    cek('halaman CK: pilih Gudang Bar menarik ck.php?gudang=bar', jejak.some(x => /ck\.php\?gudang=bar/.test(x.url)));
    cek('judul halaman jadi Gudang Bar', d.getElementById('ck-judul-hal').textContent === 'Gudang Bar');
    cek('produk halaman = sumber bar', w.eval('JSON.stringify(Object.keys(produkCK()))') === '["Gin","Lemon"]', w.eval('JSON.stringify(Object.keys(produkCK()))'));
    w.eval("setArahCK('masuk')");
    cek('sebab masuk Gudang Bar = Terima Barang (bukan produksi)', [...d.getElementById('ck-m-sebab').options].map(o => o.value).join(',') === 'terima,penyesuaian');
    w.eval("setGudangCK('ck')"); await tunggu(50);
    w.eval("setArahCK('masuk')");
    cek('kembali ke CK: sebab produksi', [...d.getElementById('ck-m-sebab').options].map(o => o.value)[0] === 'produksi');
    cek('kembali ke CK: produk ck & both', w.eval('JSON.stringify(Object.keys(produkCK()))') === '["Ayam Fillet","Bumbu Rendang"]');
  }

  console.log('\n== Kontrak PHP ==');
  {
    const lib = fs.readFileSync(path.join(ROOT, 'stock-mysql/lib_stock_ck.php'), 'utf8');
    const ep = fs.readFileSync(path.join(ROOT, 'stock-mysql/ck.php'), 'utf8');
    const ls = fs.readFileSync(path.join(ROOT, 'stock-mysql/lib_stock_mysql.php'), 'utf8');
    cek('buku stok terpisah (gb_stock) dicabut', !fs.existsSync(path.join(ROOT, 'stock-mysql/lib_stock_gb.php')) && !fs.existsSync(path.join(ROOT, 'stock-mysql/gudang-bar.php')));
    cek('kolom gudang lahir lewat ALTER, bawaan ck', /ALTER TABLE `ck_stock` ADD COLUMN `gudang` VARCHAR\(10\) NOT NULL DEFAULT 'ck'/.test(lib));
    cek('saldo disaring per gudang', /FROM `ck_stock` WHERE `gudang` = \? GROUP BY `item`/.test(lib));
    cek('mutasi disaring per gudang', /FROM `ck_stock` WHERE `gudang` = \?";/.test(lib));
    cek('sinkron check-in mengenali batch "gudang bar"', /\$bn === 'gudang bar'\)  \$gudang = 'bar'/.test(lib));
    cek('sinkron menulis kolom gudang', /`gudang`=VALUES\(`gudang`\)/.test(lib));
    cek('barang bar = sumber bar', /if \(\$gudang === 'bar'\) \{ if \(\$sumber !== 'bar'\) continue; \}/.test(lib));
    cek('mutasi gudang lain tidak bisa dihapus dari gudang ini', /function pur_ck_hapus[\s\S]*?pur_ck_gudang\(\$gudang\)[\s\S]*?milik/.test(lib));
    cek('ck.php meneruskan gudang ke GET & POST', /pur_ck_saldo\(\$pdo, \$g\)/.test(ep) && /pur_ck_kiriman_simpan\(\$pdo, \$b, \$g\)/.test(ep));
    cek('master produk menerima sumber bar', /\$sumber !== 'bar'\) \$sumber = '';/.test(ls));
    cek('stock_settings dipastikan ada', (ls.match(/pur_settings_pastikan\(\$pdo\);/g) || []).length === 2);
    let P = null;
    for (const p of [process.env.PHP_PARSER_PATH, 'php-parser']) { if (!p) continue; try { P = require(p); break; } catch (e) {} }
    if (P) {
      const e = new (P.Engine || P)({ parser: { php7: true } });
      for (const [n, s] of [['lib_stock_ck.php', lib], ['ck.php', ep], ['lib_stock_mysql.php', ls]]) {
        let okp = true, er = ''; try { e.parseCode(s); } catch (x) { okp = false; er = x.message; }
        cek('sintaks ' + n, okp, er);
      }
    } else console.log('  LEWAT sintaks PHP (php-parser tidak ada)');
  }

  console.log('\nLULUS ' + ok + '   GAGAL ' + gagal);
  process.exit(gagal ? 1 : 0);
})();
