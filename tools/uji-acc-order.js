/* uji-acc-order.js — ACC head untuk Form Order Belanja (3 November 2026)
 *
 *   JSDOM_PATH=/jalur/ke/jsdom node tools/uji-acc-order.js
 *
 * Permintaan user: order belanja anggota di-ACC dulu oleh head divisinya
 * (Kitchen/Bar/Floor); order dari head tidak perlu ACC.
 *
 * Penjaga sebenarnya di SERVER (stock-mysql/lib_stock_acc.php). PHP tidak
 * bisa dijalankan di mesin ini, jadi sisi itu dijaga sebagai KONTRAK ATAS
 * SUMBER + php-parser; sisi layar dijalankan di jsdom dengan server tiruan.
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
  console.error('jsdom tidak ketemu.'); process.exit(2);
})();

let ok = 0, gagal = 0;
const cek = (n, s, k) => { if (s) { ok++; console.log('  OK   ' + n); } else { gagal++; console.log('  GAGAL ' + n + (k ? '  — ' + k : '')); } };
const tunggu = ms => new Promise(r => setTimeout(r, ms));

const ACCLIST = {
  status: 'success', head: ['bar'], admin: false,
  menunggu: [{ id: 'ACC-1', waktu: '2026-11-03 10:15:00', pemohonId: 'u9', pemohon: 'Budi Bar', divisi: ['bar'],
               tim: 'Bar', tglDatang: '2026-11-04', status: 'menunggu', putusOleh: '', alasan: '',
               orders: [{ item: 'Lemon', qty: 5, unit: 'Kg', note: '-' }, { item: 'Gula', qty: 2, unit: 'Kg', note: '-' }] }],
  milik: [{ id: 'ACC-0', waktu: '2026-11-03 09:00:00', pemohonId: 'u1', pemohon: 'Wandi', divisi: ['bar'],
            tglDatang: '2026-11-04', status: 'ditolak', putusOleh: 'Arif', putusAt: new Date().toISOString().slice(0, 19).replace('T', ' '),
            alasan: 'stok masih ada', orders: [{ item: 'Susu', qty: 3, unit: 'Liter' }] }],
  riwayat: [{ id: 'ACC-R', waktu: '2026-11-02 08:00:00', pemohonId: 'u7', pemohon: 'Sari Bar', divisi: ['bar'],
            tglDatang: '2026-11-03', status: 'disetujui', putusOleh: 'Arif', putusAt: '2026-11-02 09:30:00', alasan: '',
            orders: [{ item: 'Jeruk', qty: 5, unit: 'Kg' }, { item: 'Es Batu', qty: 2, unit: 'Pack' }],
            ordersAcc: [{ item: 'Jeruk', qty: 3, unit: 'Kg' }] }]
};

function buka(jawabBatch) {
  const asli = fs.readFileSync(path.join(ROOT, 'deploy/stock/ordering/index.html'), 'utf8');
  const lokal = b => { const j = path.join(ROOT, 'deploy/stock/ordering', b); return fs.existsSync(j) ? fs.readFileSync(j, 'utf8') : ''; };
  const html = asli
    .replace(/<script[^>]*\ssrc="laksamana-forecast\.js"[^>]*><\/script>/i, () => '<script>' + lokal('laksamana-forecast.js') + '<' + '/script>')
    .replace(/<script[^>]*\ssrc="forecast_export\.js"[^>]*><\/script>/i, () => '<script>' + lokal('forecast_export.js') + '<' + '/script>')
    .replace(/<script[^>]*\ssrc="https?:[^>]*><\/script>/gi, '');
  const vc = new VirtualConsole();
  vc.on('jsdomError', e => {
    const t = String((e && e.detail && e.detail.stack) || (e && e.message) || e);
    if (!/Not implemented|Could not parse CSS|is not defined/.test(t)) console.log('  !! ' + t.split('\n')[0]);
  });
  const jejak = { url: [], body: [], toast: [] };
  const dom = new JSDOM(html, { virtualConsole: vc, runScripts: 'dangerously', url: 'https://dev.laksamanamuda.id/stock/ordering/',
    beforeParse(w) {
      w.localStorage.setItem('lm_session', JSON.stringify({ userId: 'u1', name: 'Wandi', modules: ['ordering'], adminModules: [], token: 'TOK', expiry: Date.now() + 86400000 }));
      w.fetch = (url, opt) => {
        jejak.url.push(String(url));
        let j = { status: 'success', created: 1, merged: 0, data: [], orders: [] };
        if (/action=accList/.test(url)) j = ACCLIST;
        if (opt && opt.body) {
          jejak.body.push(String(opt.body));
          const b = JSON.parse(opt.body);
          if (b.action === 'batchOrder' && jawabBatch) j = jawabBatch;
        }
        const s = JSON.stringify(j);
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(JSON.parse(s)), text: () => Promise.resolve(s) });
      };
      w.tailwind = { config: {} };
      w.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
      w.print = () => {}; w.confirm = () => true; w.alert = () => {}; w.prompt = () => '';
      w.HTMLCanvasElement.prototype.getContext = () => ({});
    } });
  return { dom, jejak };
}

(async () => {
  const { dom, jejak } = buka({ status: 'success', menungguAcc: true, accId: 'ACC-9', divisi: ['bar'], jumlah: 1, created: 0, merged: 0 });
  const w = dom.window, d = w.document;
  const siap = () => { try { w.eval('ACC'); return true; } catch (e) { return false; } };
  for (let i = 0; i < 150 && !siap(); i++) await tunggu(20);
  cek('modul ter-boot', siap());
  w.eval("enterApp({id:'u1', name:'Wandi', pin:'', role:'full', keterangan:'Bar'})");
  w.eval("state.appScriptUrlHistory = 'https://contoh/orders.php';");
  w.eval("showToast = (j,p,t) => { window.__toast = (window.__toast||[]).concat([[j,p,t]]); };");

  console.log('\n== Panel & lencana ==');
  await w.eval('accMuat()');
  cek('accList memakai sesi Office', jejak.url.some(u => /action=accList&sesi=TOK/.test(u)));
  cek('lencana menu = 1', d.getElementById('acc-badge').textContent === '1' && !d.getElementById('acc-badge').classList.contains('hidden'));
  const panel = d.getElementById('acc-panel');
  cek('menu ACC Order tampil untuk head', !d.getElementById('tab-acc').classList.contains('hidden'));
  cek('panel di halaman sendiri, BUKAN di form order', !!panel.closest('#view-acc') && !d.querySelector('#view-order #acc-panel'));
  w.eval("switchTab('acc')");
  cek('halaman ACC terbuka, form order tersembunyi', !d.getElementById('view-acc').classList.contains('hidden')
      && d.getElementById('view-order').classList.contains('hidden'));
  cek('menu ACC Order aktif & tetap terlihat', /bg-indigo-50/.test(d.getElementById('tab-acc').className) && !d.getElementById('tab-acc').classList.contains('hidden'));
  cek('panel menyebut pemohon & divisi', /Budi Bar/.test(panel.textContent) && /Bar/.test(panel.textContent), panel.textContent.replace(/s+/g,' ').slice(0,300));
  cek('nama menu Approval Order, tanpa kata ACC', /Approval Order/.test(d.getElementById('tab-acc').textContent) && !/ACC/.test(d.getElementById('view-acc').textContent));
  cek('tombol Setujui, bukan ACC', /Setujui/.test(panel.textContent));
  cek('tab Riwayat Approval ada untuk head', /Riwayat Approval/.test(panel.textContent));
  w.eval("accTab('riwayat')");
  cek('riwayat: pemohon, oleh siapa, status', /Sari Bar/.test(panel.textContent) && /Arif/.test(panel.textContent) && /Disetujui/.test(panel.textContent));
  cek('riwayat: jumlah diubah ditulis 5 → 3', /5 → 3/.test(panel.textContent), panel.textContent.replace(/s+/g,' ').slice(0,300));
  cek('riwayat: barang yang dibuang dicoret', !!panel.querySelector('.line-through') && /Es Batu/.test(panel.querySelector('.line-through').textContent));
  w.eval("accTab('milik')");
  cek('pengajuan saya: ditolak + alasannya', /Ditolak/.test(panel.textContent) && /stok masih ada/.test(panel.textContent));
  w.eval("accTab('menunggu')");

  w.eval("switchTab('checkin'); switchTab('order')");
  cek('lencana bertahan sesudah pindah tab', d.getElementById('acc-badge') && d.getElementById('acc-badge').textContent === '1');

  console.log('\n== ACC ==');
  d.getElementById('acc-q-ACC-1-0').value = '3';
  jejak.body.length = 0;
  await w.eval("accPutus('ACC-1','setuju')");
  const bS = jejak.body.map(x => JSON.parse(x)).find(b => b.action === 'accPutus');
  cek('ACC mengirim accPutus setuju', bS && bS.keputusan === 'setuju' && bS.id === 'ACC-1');
  cek('ACC membawa sesi', bS && bS.sesi === 'TOK');
  cek('jumlah yang diubah head ikut terkirim', bS && bS.orders[0].qty === 3 && bS.orders[1].qty === 2, JSON.stringify(bS && bS.orders));

  console.log('\n== Tolak ==');
  jejak.body.length = 0;
  await w.eval("accPutus('ACC-1','tolak')");
  cek('tolak tanpa alasan tidak dikirim', !jejak.body.some(x => /accPutus/.test(x)));
  w.eval("prompt = () => 'barang belum habis'");
  await w.eval("accPutus('ACC-1','tolak')");
  const bT = jejak.body.map(x => JSON.parse(x)).find(b => b.action === 'accPutus');
  cek('tolak dengan alasan dikirim', bT && bT.keputusan === 'tolak' && bT.alasan === 'barang belum habis');

  console.log('\n== Kirim order belanja ==');
  jejak.body.length = 0;
  await w.eval("executeFormSubmission([{item:'Lemon', qty:2, unit:'Kg', note:'-'}], 'Wandi', '2026-11-04')");
  const bO = jejak.body.map(x => JSON.parse(x)).find(b => b.action === 'batchOrder');
  cek('batchOrder meminta ACC head + membawa sesi', bO && bO.accHead === true && bO.sesi === 'TOK');
  const tt = w.eval('JSON.stringify(window.__toast||[])');
  cek('balasan menunggu ACC disebut, bukan "gagal"', /Menunggu Approval Head/.test(tt) && !/Pengiriman Gagal/.test(tt), tt);

  console.log('\n== Form CK TIDAK ikut tertahan ==');
  const SRC = fs.readFileSync(path.join(ROOT, 'deploy/stock/ordering/index.html'), 'utf8');
  const ckBody = SRC.slice(SRC.indexOf("action: 'batchOrder', batchId: '', batchName: gdInfo().batch"), SRC.indexOf("action: 'batchOrder', batchId: '', batchName: gdInfo().batch") + 300);
  cek('kiriman CK tanpa accHead', ckBody.length > 0 && !/accHead/.test(ckBody));

  console.log('\n== Kontrak PHP ==');
  const ORD = fs.readFileSync(path.join(ROOT, 'stock-mysql/orders.php'), 'utf8');
  const LIB = fs.readFileSync(path.join(ROOT, 'stock-mysql/lib_stock_acc.php'), 'utf8');
  try {
    const P = require(process.env.PHP_PARSER_PATH || path.join(ROOT, 'node_modules', 'php-parser'));
    const p = new P({ parser: { php7: true, php8: true } });
    p.parseCode(ORD); p.parseCode(LIB);
    cek('sintaks PHP sah (orders.php + lib_stock_acc.php)', true);
  } catch (e) { cek('sintaks PHP sah', false, e.message); }
  const iAcc = ORD.indexOf("if ($a === 'batchOrder' && !empty($b->accHead))");
  const iBatch = ORD.indexOf("if ($a === 'batchOrder') {");
  cek('cabang ACC berdiri SEBELUM batchOrder biasa', iAcc > -1 && iBatch > iAcc);

  /* Gudang Bar tanpa Check-in (3 Nov 2026): batch "Gudang Bar" langsung
     diterima server + stok dipotong lewat pintu sinkron yang sama. */
  console.log('\n== Gudang Bar tanpa Check-in ==');
  const MYS = fs.readFileSync(path.join(ROOT, 'stock-mysql/lib_stock_mysql.php'), 'utf8');
  const CKL = fs.readFileSync(path.join(ROOT, 'stock-mysql/lib_stock_ck.php'), 'utf8');
  const cabBatch = ORD.slice(iBatch, iBatch + 1500);
  cek('batch Gudang Bar langsung diterima', /=== 'gudang bar'/.test(cabBatch) && /pur_orders_terima_batch\(\$pdo/.test(cabBatch));
  const fT = MYS.slice(MYS.indexOf('function pur_orders_terima_batch'), MYS.indexOf('function pur_orders_terima_batch') + 2200);
  cek('terima batch: Datang + Arsip', /`kedatangan` = 'Datang', `status` = 'Arsip'/.test(fT));
  cek('terima batch: stok lewat pur_ck_sinkron_order', /pur_ck_sinkron_order\(\$pdo, \$rows\)/.test(fT));
  cek('terima batch: gagal stok tidak menggagalkan', /catch \(Throwable/.test(fT));
  cek('mutasi pengambilan mencatat batchId', /'batchId' => \(string\)\(\$o\['batch_id'\]/.test(CKL) && /'batchId'    => isset\(\$d->batchId\)/.test(CKL));
  cek('Check-in menyaring batch Gudang Bar yang sudah Datang', SRC.includes("filteredRecords.filter(o => !(dariFormGudang(o) === 'bar' && o.kedatangan === 'Datang'))"));
  cek('Riwayat Gudang Bar memuat pengambilan per batch', SRC.includes("(GUDANG === 'bar' && m.sebab === 'pengajuan')") && SRC.includes('function kartuBatchAmbil('));
  cek('head divisinya sendiri tidak perlu ACC', LIB.indexOf('if (array_intersect($div, pur_acc_head_akun($u))) return [];') > -1);
  cek('divisi tanpa head langsung masuk', LIB.indexOf('return array_keys($adaHead);') > -1);
  cek('yang meng-ACC wajib head divisi itu / admin modul', LIB.indexOf("if (!pur_acc_admin($u) && !array_intersect($x['divisi'], pur_acc_head_akun($u)))") > -1);
  cek('klaim atomik sebelum melahirkan order', LIB.indexOf("SET `status`='diproses' WHERE `id`=? AND `status`='menunggu'") > -1
      && LIB.indexOf('$klaim->rowCount() !== 1') > -1);
  cek('order lahir lewat pur_orders_batch yang sama', LIB.indexOf('pur_orders_batch($pdo, $kirim, $meta)') > -1);
  cek('alasan tolak wajib di server', LIB.indexOf("Alasan penolakan wajib diisi.") > -1);
  cek('tidak ada DELETE di lib ACC', !/DELETE\s+FROM/i.test(LIB));

  console.log('\n' + ok + ' OK, ' + gagal + ' GAGAL');
  process.exit(gagal ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
