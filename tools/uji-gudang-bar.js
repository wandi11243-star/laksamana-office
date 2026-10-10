/* uji-gudang-bar.js — Gudang Bar + matriks hak akses per sub-menu di panel
 * Ordering (deploy/stock/ordering/), 10 Oktober 2026.
 *
 *   node tools/uji-gudang-bar.js
 *
 * jsdom + server tiruan HIDUP: apa yang ditulis gudang-bar.php (simpan/batal)
 * dan ordering-settings.php (savePerms) dipulangkan GET berikutnya. Sisi PHP
 * dijaga sebagai kontrak atas sumbernya (php tidak ada di mesin ini).
 *
 * Yang dijaga:
 *  - bawaan matriks = aturan lama (Check-in Saja tidak bisa Order/CK, tetap
 *    mendarat di Check-in; Order+Check-in mendarat di Order);
 *  - Lihat = halaman terbuka tapi form & tombol tulis tertutup, DAN fungsi
 *    tulisnya menolak walau dipanggil dari console;
 *  - Tak Terlihat = menu hilang dan switchTab() tidak bisa memaksanya;
 *  - Gudang Bar: konversi ke satuan dasar dikerjakan server, batal tidak
 *    menghapus baris, sisa stok tidak menghitung yang dibatalkan.
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
  'Gin':        { area: ['Bar'], satuan: ['Botol', 'ML'], satuanDasar: 'ML', isi: { Botol: 750 }, kategori: 'LIQUOR' },
  'Lemon':      { area: ['Bar', 'Kitchen'], satuan: ['Kg', 'Pcs'], satuanDasar: 'Pcs', isi: { Kg: 8 }, kategori: 'FRESH' },
  'Ayam Fillet':{ area: ['Kitchen'], satuan: ['Kg'], satuanDasar: 'Kg', isi: {} }
};

/* Server tiruan yang meniru aturan lib_stock_gb.php — konversi, batal, saldo. */
function server(perms) {
  const S = { mutasi: [], perms: perms || null, nid: 0, simpanPerms: 0 };
  const produkBar = () => Object.keys(PRODUK).filter(n => PRODUK[n].area.some(a => a.toLowerCase() === 'bar'));
  const saldo = () => produkBar().map(n => {
    const p = PRODUK[n];
    const hidup = S.mutasi.filter(m => m.item === n && !m.batalAt);
    const masuk = hidup.filter(m => m.arah === 'masuk').reduce((a, m) => a + m.qty, 0);
    const keluar = hidup.filter(m => m.arah === 'keluar').reduce((a, m) => a + m.qty, 0);
    return { item: n, satuan: p.satuanDasar, pilihan: p.satuan, isi: p.isi, kategori: p.kategori || '', aktif: true,
             masuk, keluar, saldo: masuk - keluar, terakhir: '' };
  });
  function jawab(url, body) {
    if (url.indexOf('gudang-bar.php') > -1) {
      if (!body) return { saldo: saldo(), mutasi: S.mutasi.slice().reverse() };
      if (body.action === 'simpan') {
        for (const it of body.items) {
          const p = PRODUK[it.item];
          if (!p || !p.area.some(a => a.toLowerCase() === 'bar')) return { status: 'error', message: 'bukan barang Gudang Bar: ' + it.item };
          const f = it.unit === p.satuanDasar ? 1 : (p.isi[it.unit] || 1);
          S.mutasi.push({ id: 'GB' + (++S.nid), tanggal: body.tanggal, item: it.item, arah: body.arah, qty: it.qty * f,
            qtyInput: it.qty, unitInput: it.unit, satuan: p.satuanDasar, sebab: body.sebab, catatan: body.catatan || '',
            pic: body.pic, batalAt: null, batalOleh: '', batalAlasan: '' });
        }
        return { status: 'success' };
      }
      if (body.action === 'batal') {
        const m = S.mutasi.find(x => x.id === body.id && !x.batalAt);
        if (!m) return { status: 'error', message: 'tidak ditemukan' };
        if (!body.alasan) return { status: 'error', message: 'alasan wajib' };
        m.batalAt = '2026-10-10 12:00:00'; m.batalOleh = body.oleh; m.batalAlasan = body.alasan;
        return { status: 'success' };
      }
    }
    if (url.indexOf('ordering-settings.php') > -1) {
      if (!body) return S.perms ? { perms: S.perms } : { perms: {} };
      if (body.action === 'savePerms') { S.perms = body.perms; S.simpanPerms++; return { status: 'success' }; }
    }
    return { status: 'success', created: 1, merged: 0, mutasi: [], data: [], orders: [], users: [], saldo: [] };
  }
  return { S, jawab };
}

function buka(opt) {
  opt = opt || {};
  const asli = fs.readFileSync(path.join(ROOT, 'deploy/stock/ordering/index.html'), 'utf8');
  const lokal = b => { const j = path.join(ROOT, 'deploy/stock/ordering', b); return fs.existsSync(j) ? fs.readFileSync(j, 'utf8') : ''; };
  const html = asli
    .replace(/<script[^>]*\ssrc="laksamana-forecast\.js"[^>]*><\/script>/i, () => '<script>' + lokal('laksamana-forecast.js') + '<' + '/script>')
    .replace(/<script[^>]*\ssrc="forecast_export\.js"[^>]*><\/script>/i, () => '<script>' + lokal('forecast_export.js') + '<' + '/script>')
    .replace(/<script[^>]*\ssrc="https?:[^>]*><\/script>/gi, '');
  const srv = server(opt.perms);
  const jejak = [];
  const vc = new VirtualConsole();
  const dom = new JSDOM(html, { virtualConsole: vc, runScripts: 'dangerously', url: 'https://dev.laksamanamuda.id/stock/ordering/',
    beforeParse(w) {
      w.localStorage.setItem('lm_session', JSON.stringify({ userId: 'u1', name: 'Wandi', username: 'wandi',
        modules: ['ordering'], adminModules: [], token: 't', expiry: Date.now() + 86400000 }));
      w.fetch = (url, o) => {
        const body = o && o.body ? JSON.parse(o.body) : null;
        jejak.push({ url: String(url), body });
        const j = JSON.stringify(srv.jawab(String(url), body));
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(JSON.parse(j)), text: () => Promise.resolve(j) });
      };
      w.tailwind = { config: {} };
      w.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
      w.print = () => {}; w.alert = () => {};
      w.confirm = () => opt.confirm !== false;
      w.prompt = () => (opt.prompt !== undefined ? opt.prompt : 'salah hitung');
      w.HTMLCanvasElement.prototype.getContext = () => ({});
    } });
  return { dom, srv, jejak };
}
async function siap(w) {
  const selesai = () => { try { w.eval('tabAktif'); w.eval('GB'); return true; } catch (e) { return false; } };
  for (let i = 0; i < 150 && !selesai(); i++) await tunggu(20);
  return selesai();
}
async function masuk(w, role) {
  w.eval("enterApp({id:'u1', name:'Wandi', pin:'', role:'" + role + "', keterangan:'Bar'})");
  await tunggu(120);
}
const tampak = (d, id) => { const e = d.getElementById(id); return !!e && !e.classList.contains('hidden'); };

(async () => {
  console.log('\n== Bawaan matriks = aturan lama ==');
  {
    const { dom } = buka();
    const w = dom.window, d = w.document;
    cek('modul ter-boot', await siap(w));
    await masuk(w, 'checkin');
    cek('Check-in Saja mendarat di Check-in, bukan Gudang Bar', w.eval('tabAktif') === 'checkin', w.eval('tabAktif'));
    cek('Check-in Saja: menu Order tersembunyi', !tampak(d, 'tab-order'));
    cek('Check-in Saja: menu CK tersembunyi', !tampak(d, 'tab-ck'));
    cek('Check-in Saja: menu Gudang Bar terlihat (Lihat)', tampak(d, 'tab-gb'));
    cek('Check-in Saja: grup Admin tersembunyi', !tampak(d, 'nav-admin-sec'));
    w.eval("switchTab('order')");
    cek('switchTab tidak bisa memaksa halaman Tak Terlihat', w.eval('tabAktif') === 'noakses' && tampak(d, 'view-noakses') && !tampak(d, 'view-order'));
    await masuk(w, 'full');
    cek('Order + Check-in mendarat di Form Order', w.eval('tabAktif') === 'order', w.eval('tabAktif'));
    cek('Order + Check-in: Restock & Forecast tetap tersembunyi', !tampak(d, 'nav-admin-sec'));
    await masuk(w, 'admin');
    cek('Admin: grup Admin & Kelola Akses terlihat', tampak(d, 'nav-admin-sec') && tampak(d, 'tab-users'));
  }

  console.log('\n== Gudang Bar: Lihat saja ==');
  {
    const { dom, jejak } = buka();
    const w = dom.window, d = w.document;
    await siap(w); await masuk(w, 'checkin');
    w.eval("switchTab('gb')"); await tunggu(120);
    cek('halaman Gudang Bar terbuka', w.eval('tabAktif') === 'gb' && tampak(d, 'view-gb'));
    const isi = d.getElementById('gb-isi').textContent;
    cek('stok barang ber-area Bar tergambar', /Gin/.test(isi) && /Lemon/.test(isi));
    cek('barang Kitchen tidak ikut', !/Ayam Fillet/.test(isi));
    cek('sub-tab Catat Masuk/Keluar disembunyikan', !tampak(d, 'gbsub-masuk') && !tampak(d, 'gbsub-keluar'));
    cek('pita "hanya bisa melihat" terpasang', /hanya bisa melihat/.test(d.getElementById('view-gb').textContent));
    w.eval("gbSub('masuk')");
    cek('gbSub tidak bisa memaksa form catat', w.eval('GB_SUB') === 'stok');
    const n0 = jejak.filter(x => x.body && x.body.action === 'simpan').length;
    /* Tanggal WAJIB diisi: tanpa itu gbSimpan berhenti di validasi dan
       penjaga haknya tidak pernah teruji — mutasi yang mencabutnya sempat lolos. */
    w.eval("GB_SUB='masuk'; GB_FORM={tanggal:'2026-10-10',sebab:'terima',catatan:''}; GB_ROWS=[{item:'Gin',qty:'1',unit:'Botol'}]; gbBacaForm=function(){}; gbSimpan()"); await tunggu(80);
    cek('gbSimpan dari console DITOLAK untuk peran Lihat', jejak.filter(x => x.body && x.body.action === 'simpan').length === n0);
  }

  console.log('\n== Gudang Bar: catat masuk, keluar, batal ==');
  {
    const { dom, srv, jejak } = buka();
    const w = dom.window, d = w.document;
    await siap(w); await masuk(w, 'full');
    w.eval("switchTab('gb')"); await tunggu(120);
    cek('peran Ubah melihat Catat Masuk', tampak(d, 'gbsub-masuk'));
    w.eval("gbSub('masuk')"); await tunggu(20);
    const inp = d.querySelectorAll('#gb-isi [data-gb="item"]');
    cek('form catat punya dua baris', inp.length === 2);
    inp[0].value = 'Gin'; inp[0].dispatchEvent(new w.Event('change', { bubbles: true })); await tunggu(20);
    const unit0 = d.querySelector('#gb-isi [data-gb="unit"][data-i="0"]');
    cek('pilihan satuan mengikuti master barang', unit0 && [...unit0.options].map(o => o.value).join(',') === 'ML,Botol', unit0 && [...unit0.options].map(o => o.value).join(','));
    unit0.value = 'Botol';
    d.querySelector('#gb-isi [data-gb="qty"][data-i="0"]').value = '2';
    const inp1 = d.querySelector('#gb-isi [data-gb="item"][data-i="1"]');
    inp1.value = 'Lemon'; inp1.dispatchEvent(new w.Event('change', { bubbles: true })); await tunggu(20);
    d.querySelector('#gb-isi [data-gb="qty"][data-i="1"]').value = '10';
    w.eval('gbSimpan()'); await tunggu(200);
    const k = jejak.filter(x => x.body && x.body.action === 'simpan');
    cek('SATU kiriman untuk dua barang', k.length === 1);
    cek('kiriman membawa satuan yang DIPILIH (konversi dikerjakan server)', k[0] && k[0].body.items[0].unit === 'Botol' && k[0].body.items[0].qty === 2);
    cek('arah & sebab bawaan masuk = terima', k[0] && k[0].body.arah === 'masuk' && k[0].body.sebab === 'terima');
    cek('PIC dari akun yang login', k[0] && k[0].body.pic === 'Wandi');
    const gin = () => w.eval("JSON.stringify(GB.saldo.find(x=>x.item==='Gin'))");
    cek('sisa Gin 1500 ML (2 Botol × 750)', JSON.parse(gin()).saldo === 1500, gin());

    w.eval("gbSub('keluar')"); await tunggu(20);
    cek('sebab bawaan keluar = ambil', d.getElementById('gb-sebab').value === 'ambil');
    const ik = d.querySelector('#gb-isi [data-gb="item"][data-i="0"]');
    ik.value = 'Gin'; ik.dispatchEvent(new w.Event('change', { bubbles: true })); await tunggu(20);
    d.querySelector('#gb-isi [data-gb="qty"][data-i="0"]').value = '300';
    w.eval('gbSimpan()'); await tunggu(200);
    cek('sisa Gin 1200 ML sesudah keluar 300 ML', JSON.parse(gin()).saldo === 1200, gin());

    // barang bukan bar ditolak di layar
    w.eval("gbSub('keluar')");
    const n1 = jejak.filter(x => x.body && x.body.action === 'simpan').length;
    w.eval("GB_SUB='keluar'; gbGambar(); document.querySelector('#gb-isi [data-gb=item][data-i=\"0\"]').value='Ayam Fillet'; document.querySelector('#gb-isi [data-gb=qty][data-i=\"0\"]').value='1'; gbSimpan()");
    await tunggu(80);
    cek('barang yang bukan Gudang Bar tidak dikirim', jejak.filter(x => x.body && x.body.action === 'simpan').length === n1);

    w.eval("gbSub('riwayat')"); await tunggu(20);
    cek('riwayat memuat 3 baris', d.querySelectorAll('#gb-rw-tabel tbody tr').length === 3);
    const idKeluar = srv.S.mutasi.find(m => m.arah === 'keluar').id;
    w.eval("gbBatal('" + idKeluar + "')"); await tunggu(200);
    cek('batal TIDAK menghapus baris', srv.S.mutasi.length === 3);
    cek('alasan batal terkirim', srv.S.mutasi.find(m => m.id === idKeluar).batalAlasan === 'salah hitung');
    cek('sisa Gin kembali 1500 ML', JSON.parse(gin()).saldo === 1500, gin());
    cek('baris yang dibatalkan tetap tergambar, dicoret', /Dibatalkan/.test(d.getElementById('gb-isi').textContent));
  }

  console.log('\n== Matriks hak akses ==');
  {
    const { dom, srv } = buka({ perms: { gb: { checkin: 0 }, order: { checkin: 1 } } });
    const w = dom.window, d = w.document;
    await siap(w); await masuk(w, 'checkin'); await tunggu(150);
    cek('setelan server dipakai: Gudang Bar Tak Terlihat untuk Check-in Saja', !tampak(d, 'tab-gb'));
    cek('setelan server dipakai: Order jadi Lihat', tampak(d, 'tab-order'));
    w.eval("switchTab('order')"); await tunggu(30);
    cek('Order hanya-lihat: tombol kirim disembunyikan', !tampak(d, 'btn-trigger-submit'));
    /* Yang diukur PESAN PENOLAKANNYA, bukan modal yang tidak terbuka: form
       kosong sudah ditolak validasi lebih dulu, jadi "modal tidak terbuka"
       tetap benar walau penjaganya dicabut — asersi hampa, dan mutasinya
       memang sempat lolos karena itu. */
    const tc = d.getElementById('toast-container'); if (tc) tc.innerHTML = '';
    try { w.eval('startOrderSubmission()'); } catch (e) {}
    await tunggu(30);
    cek('Order hanya-lihat: startOrderSubmission ditolak dengan Akses Ditolak', /Akses Ditolak/.test(tc ? tc.textContent : ''), tc ? tc.textContent.slice(0, 120) : 'toast tidak ada');
    if (tc) tc.innerHTML = '';
    try { w.eval('submitCKOrder()'); } catch (e) {}
    await tunggu(30);
    cek('CK Tak Terlihat: submitCKOrder dari console ditolak', /Akses Ditolak/.test(tc ? tc.textContent : ''));

    await masuk(w, 'admin'); await tunggu(100);
    w.eval("switchTab('users')"); await tunggu(80);
    const sel = d.querySelectorAll('#perm-matrix .perm-btn:not([disabled])');
    cek('matriks tergambar: 6 sub-menu × 2 peran', sel.length === 12, sel.length);
    const gbCheckin = d.querySelector('#perm-matrix .perm-btn[data-page="gb"][data-role="checkin"]');
    cek('sel membaca nilai server (Tak Terlihat)', gbCheckin && gbCheckin.dataset.v === '0');
    gbCheckin.click();
    cek('klik menggeser ke Lihat', gbCheckin.dataset.v === '1' && gbCheckin.textContent === 'Lihat');
    w.eval('ordPermSimpan()'); await tunggu(150);
    cek('tersimpan ke server', srv.S.simpanPerms === 1 && srv.S.perms.gb.checkin === 1);
    cek('Kelola Akses dikunci (tidak bisa diklik)', d.querySelectorAll('#perm-matrix .perm-btn[disabled]').length >= 8);
  }

  console.log('\n== Kontrak PHP ==');
  {
    const lib = fs.readFileSync(path.join(ROOT, 'stock-mysql/lib_stock_gb.php'), 'utf8');
    const ep = fs.readFileSync(path.join(ROOT, 'stock-mysql/gudang-bar.php'), 'utf8');
    const ls = fs.readFileSync(path.join(ROOT, 'stock-mysql/lib_stock_mysql.php'), 'utf8');
    const tanpaKomentar = lib.replace(/\/\*[\s\S]*?\*\//g, '');
    cek('tidak ada DELETE di lib Gudang Bar', !/DELETE\s+FROM/i.test(tanpaKomentar));
    cek('saldo tidak menghitung yang dibatalkan', /WHERE `batal_at` IS NULL GROUP BY/.test(lib));
    cek('simpan dalam satu transaksi', /beginTransaction[\s\S]*commit/.test(lib));
    cek('tabel lahir sendiri di kedua jalur endpoint', (ep.match(/gb_pastikan\(\$pdo\)/g) || []).length === 2);
    cek('stock_settings dipastikan ada sebelum dibaca & ditulis', (ls.match(/pur_settings_pastikan\(\$pdo\);/g) || []).length === 2);
    let P = null;
    for (const p of [process.env.PHP_PARSER_PATH, 'php-parser']) { if (!p) continue; try { P = require(p); break; } catch (e) {} }
    if (P) {
      const e = new (P.Engine || P)({ parser: { php7: true } });
      for (const [n, s] of [['lib_stock_gb.php', lib], ['gudang-bar.php', ep], ['lib_stock_mysql.php', ls]]) {
        let okp = true, er = ''; try { e.parseCode(s); } catch (x) { okp = false; er = x.message; }
        cek('sintaks ' + n, okp, er);
      }
    } else console.log('  LEWAT sintaks PHP (php-parser tidak ada)');
  }

  console.log('\nLULUS ' + ok + '   GAGAL ' + gagal);
  process.exit(gagal ? 1 : 0);
})();
