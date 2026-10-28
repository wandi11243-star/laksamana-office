/* uji-invoice-revisi.js — tiga revisi Invoice & Kwitansi (28 Oktober 2026)
 *
 *   node tools/uji-invoice-revisi.js
 *   JSDOM_PATH=/jalur/ke/jsdom node tools/uji-invoice-revisi.js
 *
 * 1. Marketing bisa mengubah Kepada, U.P (dulu "PIC"), dan Keterangan (dulu
 *    "Deskripsi") di invoice resmi yang sudah terbit. Ubahan DISIMPAN DI
 *    FINANCE (invUbah), bukan di state Marketing.
 * 2. Finance yang menerbitkan KWITANSI ditanya dulu: perlu materai? Kalau ya,
 *    lembar polos: kotak materai, tanpa gambar tanda tangan & cap — dan itu
 *    ditegakkan SERVER (inv_berkas), bukan cuma di layar.
 * 3. Finance bisa melihat PDF dokumen yang sudah terbit, digambar berkas
 *    lembar yang SAMA dengan modul peminta (assets/*-sheet.js).
 *
 * PHP tidak bisa dijalankan di mesin pengembangan; sisi servernya dijaga
 * php-parser (sintaks) + kontrak atas sumbernya.
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
  console.error('jsdom tidak ketemu. Setel JSDOM_PATH.');
  process.exit(2);
})();

let ok = 0, gagal = 0;
const cek = (n, s, k) => { if (s) { ok++; console.log('  OK   ' + n); } else { gagal++; console.log('  GAGAL ' + n + (k ? '  — ' + k : '')); } };
const aman = async (n, fn) => { try { await fn(); } catch (e) { gagal++; console.log('  GAGAL ' + n + '  — melempar: ' + e.message); } };
const tunggu = ms => new Promise(r => setTimeout(r, ms));
const baca = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
const ASET_INV = baca('deploy/assets/invoice-sheet.js');
const ASET_KWI = baca('deploy/assets/kwitansi-sheet.js');
const sisip = (html, nama, isi) => html.replace(new RegExp('<script[^>]*\\ssrc="[^"]*' + nama.replace('.', '\\.') + '"[^>]*><\\/script>', 'i'), () => '<script>' + isi + '</script>');
const tanpaKomentarJs = s => s.replace(/\/\*[\s\S]*?\*\//g, '');

function asetBerdiri(src) {
  const w = {};
  new Function('window', src)(w);
  return w;
}

(async () => {
  /* ------------------------------------------------------------------ */
  console.log('\n== Lembar invoice bersama (assets/invoice-sheet.js) ==');
  await aman('lembar invoice', async () => {
    const L = asetBerdiri(ASET_INV).LMInvoice;
    cek('LMInvoice terekspor', !!(L && L.html && L.halaman && L.terapkanKet && L.adaBukti));
    const h = L.html({ resmi: true, no: 'INV/2026/10/0007', kepada: 'PT Contoh', up: 'Bu Rina',
      items: [{ desc: 'Paket A', qty: 2, harga: 100000 }], totals: [{ label: 'Grand Total', nilai: 200000, tebal: true }] });
    cek('label U.P tercetak', />U\.P<\/b>: Bu Rina/.test(h));
    cek('label "PIC" tidak tercetak lagi', !/<b>PIC<\/b>/.test(h));
    cek('kepala kolom "Keterangan"', />Keterangan<\/th>/.test(h));
    cek('kepala kolom "Deskripsi" hilang', !/>Deskripsi<\/th>/.test(h));
    cek('nomor resmi tercetak', /INV\/2026\/10\/0007/.test(h));
    // Ubahan keterangan dicocokkan lewat `asal`, bukan posisi saja.
    const k = L.terapkanKet([{ desc: 'Sewa sound' }, { desc: 'Paket A' }],
      [{ asal: 'Paket A', teks: 'Paket makan 50 pax' }, { asal: 'Sewa sound', teks: '' }]);
    cek('ubahan ikut barisnya walau urutan berubah', k[1].ket === 'Paket makan 50 pax' && k[0].ket === 'Sewa sound', JSON.stringify(k));
    cek('teks kosong = teks bawaan', k[0].diubah === false);
    const yatim = L.terapkanKet([{ desc: 'Baris baru' }], [{ asal: 'Sudah dihapus', teks: 'X' }]);
    cek('ubahan untuk baris yang sudah tidak ada tidak menempel ke baris lain', yatim[0].ket === 'Baris baru');
    const esc = L.html({ kepada: '<b>x</b>', items: [] });
    cek('Kepada di-escape', esc.indexOf('<b>x</b>') < 0 && esc.indexOf('&lt;b&gt;x') > -1);
    cek('cap DP: berbukti', L.adaBukti([{ jenis: 'DP', adaBukti: true }], 'INV_DP') === true);
    cek('cap pelunasan: pelunasan tanpa bukti = tidak', L.adaBukti([{ jenis: 'DP', adaBukti: true }, { jenis: 'Pelunasan', adaBukti: false }], 'INV_LUNAS') === false);
  });

  /* ------------------------------------------------------------------ */
  console.log('\n== Kwitansi bermaterai (assets/kwitansi-sheet.js) ==');
  await aman('kwitansi materai', async () => {
    const K = asetBerdiri(ASET_KWI).LMKwitansi;
    const pen = [{ nama: 'Wandi', jabatan: 'Finance', ttd: 'data:image/png;base64,TTD' }];
    const biasa = K.html({ nama: 'Tamu', total: 500000, penanda: pen, cap: 'data:image/png;base64,CAP' });
    const polos = K.html({ nama: 'Tamu', total: 500000, penanda: pen, cap: 'data:image/png;base64,CAP', materai: true });
    cek('tanpa materai: tanda tangan & cap digambar', biasa.indexOf('base64,TTD') > -1 && biasa.indexOf('base64,CAP') > -1);
    cek('tanpa materai: tidak ada kotak materai', biasa.indexOf('class="materai"') < 0);
    cek('bermaterai: kotak materai ada', polos.indexOf('class="materai"') > -1);
    cek('bermaterai: gambar tanda tangan TIDAK digambar (walau dikirim)', polos.indexOf('base64,TTD') < 0);
    cek('bermaterai: cap TIDAK digambar (walau dikirim)', polos.indexOf('base64,CAP') < 0);
    cek('bermaterai: nama penanda tangan tetap tercetak', /class="nm">Wandi</.test(polos));
    cek('bermaterai: tidak mengaku "sah tanpa tanda tangan basah"', !/sah tanpa tanda tangan basah/.test(polos));
    cek('tanpa materai: kalimat lama tetap', /sah tanpa tanda tangan basah/.test(biasa));
  });

  /* ------------------------------------------------------------------ */
  console.log('\n== Kontrak PHP (finance-mysql) ==');
  await aman('php', async () => {
    const lib = baca('finance-mysql/lib_invoice.php'), api = baca('finance-mysql/api.php');
    try {
      const E = require(path.join(ROOT, 'node_modules', 'php-parser'));
      const p = new E({ parser: { php7: true }, ast: { withPositions: false } });
      p.parseCode(lib); p.parseCode(api);
      cek('sintaks lib_invoice.php & api.php sah', true);
    } catch (e) { cek('sintaks PHP sah', false, e.message); }
    cek('kolom materai lahir lewat inv_pastikan_kolom', /inv_pastikan_kolom\('inv_kwitansi', 'materai'/.test(lib));
    cek('kolom ubah lahir lewat inv_pastikan_kolom', /inv_pastikan_kolom\('inv_kwitansi', 'ubah'/.test(lib));
    cek('aksi buat menyimpan materai', /`materai`=:m/.test(lib) && /\$mat = !empty\(\$in\['materai'\]\)/.test(lib));
    const berkas = lib.slice(lib.indexOf('function inv_berkas('));
    cek('inv_berkas mengosongkan ttd saat bermaterai', berkas.indexOf("($polos || !isset($peta[$pid])) ? ''") > -1);
    cek('inv_berkas mengosongkan cap saat bermaterai', berkas.indexOf("'cap'       => $polos ? '' : $set['cap']") > -1);
    cek('inv_berkas memulangkan materai & ubah', /'materai'   => \$polos/.test(berkas) && /'ubah'      => \$baris\['ubah'\]/.test(berkas));
    const ubah = lib.slice(lib.indexOf('function inv_ubah('), lib.indexOf('function inv_minta('));
    cek('invUbah menolak kwitansi (hanya invoice)', ubah.indexOf('inv_jenis_invoice($jns)') > -1);
    cek('invUbah tidak menyentuh ringkas', ubah.indexOf('`ringkas`') < 0);
    cek('api.php meneruskan invUbah', /case 'invUbah':[\s\S]{0,120}inv_ubah\(\$body\)/.test(api));
    cek('mb_substr berpenjaga function_exists', /function_exists\('mb_substr'\)/.test(lib));
  });

  /* ------------------------------------------------------------------ */
  console.log('\n== Marketing: ubah Kepada / U.P / Keterangan ==');
  await aman('marketing', async () => {
    let html = baca('deploy/marketing/index.html');
    html = sisip(html, 'performa-bonus.js', baca('deploy/assets/performa-bonus.js'));
    html = sisip(html, 'venue-layouts.js', baca('deploy/assets/venue-layouts.js'));
    html = sisip(html, 'invoice-sheet.js', ASET_INV);
    html = sisip(html, 'kwitansi-sheet.js', ASET_KWI);
    html = html.replace(/<script[^>]*\ssrc=[^>]*><\/script>/gi, '');
    const vc = new VirtualConsole();
    vc.on('jsdomError', e => {
      const t = String((e && e.detail && e.detail.stack) || (e && e.message) || e);
      if (!/Not implemented|Could not parse CSS/.test(t)) console.log('  !! ' + t.split('\n')[0]);
    });
    const kirim = [];
    let ubahServer = null;
    const dom = new JSDOM(html, { virtualConsole: vc, runScripts: 'dangerously',
      url: 'https://dev.laksamanamuda.id/marketing/',
      beforeParse(w) {
        w.localStorage.setItem('lm_session', JSON.stringify({ id: 'u-a', name: 'Aurel', modules: ['marketing'],
          adminModules: ['marketing'], token: 't', expiry: Date.now() + 86400000 }));
        w.fetch = () => new Promise(() => {});
        w.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
        w.print = () => {}; w.confirm = () => true;
        w.Chart = class { destroy() {} update() {} };
        w.HTMLCanvasElement.prototype.getContext = () => ({});
      } });
    const w = dom.window;
    const balas = o => { const t = JSON.stringify(o); return Promise.resolve({ ok: true, status: 200,
      json: () => Promise.resolve(JSON.parse(t)), text: () => Promise.resolve(t) }); };
    w.fetch = (url, opts) => {
      const u = String(url || '');
      let b = {}; try { b = JSON.parse((opts && opts.body) || '{}'); } catch (e) {}
      if (u.indexOf('finance-api-mysql') > -1) {
        kirim.push(b);
        if (/invBerkas/.test(u)) return balas({ ok: true, data: { ada: true, jenis: 'INV_DP', no: 'INV/2026/10/0009',
          penanda: [{ nama: 'Direktur X', jabatan: 'Direktur', ttd: '' }], cap: '', ubah: ubahServer } });
        if (/invUbah/.test(u)) { ubahServer = Object.assign({}, b.ubah, { oleh: b.oleh, at: Date.now() });
          return balas({ ok: true, data: { status: 'DIBUAT', no: 'INV/2026/10/0009', ubah: ubahServer } }); }
        return balas({ ok: true, data: {} });
      }
      return balas({ ok: true, data: { saved: true, bentrok: [], versi: {} } });
    };
    w.eval('S = normalizeState(seed());');
    w.eval(`
      S.users = [{ id:'u-a', name:'Aurel', div:'Marketing', role:'super_admin' }];
      ME = S.users[0];
      S.clients = [{ id:'c1', nama:'Budi', perusahaan:'PT Lama', pic:'Pak Budi', hp:'0812' }];
      S.events = [{ id:'e1', nama:'Gathering', clientId:'c1', tanggal:'2026-11-10', pax:50, jenis:'Corporate Event',
        status:'Deal', detail:{ rincianItem:[{desc:'Paket Makan',jumlah:50,harga:100000,jenis:'bayar'},
                                             {desc:'Sewa Sound',jumlah:1,harga:2000000,jenis:'bayar'}] },
        payments:[{type:'DP',amount:3000000,at:'2026-10-20',receiptUrl:'x'}] }];
    `);
    await w.eval("invoiceMktPDF('e1','INV_DP')");
    await tunggu(50);
    const d = w.document;
    const isiModal = () => (d.getElementById('modal') || d.body).innerHTML;
    cek('lembar memakai U.P bawaan dari PIC client', /U\.P<\/b>: Pak Budi/.test(isiModal()));
    cek('lembar memakai kolom Keterangan', />Keterangan<\/th>/.test(isiModal()));
    const tUbah = [...d.querySelectorAll('button')].find(b => /Ubah Kepada/.test(b.textContent));
    cek('tombol Ubah Kepada / U.P / Keterangan ada untuk invoice resmi', !!tUbah);
    tUbah && tUbah.click();
    await tunggu(20);
    const kp = d.getElementById('invu_kepada'), up = d.getElementById('invu_up'), k1 = d.getElementById('invu_ket_1');
    cek('form punya kotak Kepada, U.P, dan keterangan per baris', !!(kp && up && k1 && d.getElementById('invu_ket_0')));
    cek('kotak kosong menunjukkan isi bawaan sebagai placeholder', kp && kp.placeholder === 'PT Lama');
    kp.value = 'PT Baru Sejahtera'; up.value = 'Ibu Sari'; k1.value = 'Sound system + operator';
    const nKirimSebelum = kirim.length;
    d.getElementById('invu_simpan').click();
    await tunggu(60);
    const k = kirim.slice(nKirimSebelum).find(x => x.action === 'invUbah');
    cek('simpan mengirim invUbah ke Finance', !!k);
    cek('resId invoice DP yang benar', k && k.resId === 'mkt:e1:dp');
    cek('isi kiriman: kepada & up', k && k.ubah.kepada === 'PT Baru Sejahtera' && k.ubah.up === 'Ibu Sari');
    cek('keterangan dikirim dengan teks asalnya', k && k.ubah.ket[1].asal === 'Sewa Sound' && k.ubah.ket[1].teks === 'Sound system + operator');
    cek('baris yang tidak diubah dikirim kosong', k && k.ubah.ket[0].teks === '');
    cek('lembar langsung memakai ubahan', /Kepada<\/b>: PT Baru Sejahtera/.test(isiModal()) && /Sound system \+ operator/.test(isiModal()));
    cek('angka tidak berubah oleh ubahan teks', /Rp 2\.000\.000/.test(isiModal()));
    cek('rincian event di Marketing TIDAK ditimpa', w.eval("S.events[0].detail.rincianItem[1].desc") === 'Sewa Sound');
    // Dibuka lagi: ubahan dibaca dari Finance (invBerkas), bukan dari memori.
    await w.eval("invoiceMktPDF('e1','INV_DP')");
    await tunggu(50);
    cek('dibuka ulang: ubahan dari Finance tetap', /Kepada<\/b>: PT Baru Sejahtera/.test(isiModal()));
    // Tanpa izin: tombol ubah tidak digambar.
    w.eval("ME.role='staff'");
    await w.eval("invoiceMktPDF('e1','INV_DP')");
    await tunggu(30);
    cek('yang tidak boleh meminta invoice tidak diberi tombol Ubah',
      ![...d.querySelectorAll('button')].some(b => /Ubah Kepada/.test(b.textContent)));
    cek('Marketing tidak lagi menyalin rumus cap (memakai LMInvoice.adaBukti)',
      /function invAdaBukti[\s\S]{0,400}LMInvoice\.adaBukti/.test(baca('deploy/marketing/index.html')));
    cek('vipKwitansiData meneruskan materai', /materai: !!\(inv&&inv\.materai\)/.test(baca('deploy/marketing/index.html')));
    cek('kwitansiData Reservasi meneruskan materai', /materai: resmi && !!inv\.materai/.test(baca('deploy/reservasi/index.html')));
  });

  /* ------------------------------------------------------------------ */
  console.log('\n== Finance: pertanyaan materai & Lihat PDF ==');
  await aman('finance', async () => {
    let html = baca('deploy/finance/kas/index.html');
    html = sisip(html, 'performa-bonus.js', baca('deploy/assets/performa-bonus.js'));
    html = sisip(html, 'invoice-sheet.js', ASET_INV);
    html = sisip(html, 'kwitansi-sheet.js', ASET_KWI);
    html = html.replace(/<script[^>]*\ssrc=[^>]*><\/script>/gi, '');
    const kirim = [];
    const jendela = [];
    let materaiServer = false;
    const KWI = { id: 'k1', resId: 'r-1', jenis: 'KWITANSI', status: 'MENUNGGU', no: '',
      ringkas: { nama: 'Wulan', tanggal: '2026-11-01', jam: '19:00', meja: 'R3', pax: 6, dpTotal: 750000,
        dpCount: 1, dpVerifiedCount: 1, dpVerified: 750000, dp: [{ nominal: 750000, metode: 'QRIS' }] },
      penanda: [], mintaOleh: 'Kasir', mintaAt: Date.now(), catatan: '', putusOleh: '', putusAt: 0 };
    const INVB = { id: 'i1', resId: 'mkt:e1:dp', jenis: 'INV_DP', status: 'DIBUAT', no: 'INV/2026/10/0009',
      ringkas: { client: 'Budi', perusahaan: 'PT Lama', picClient: 'Pak Budi', event: 'Gathering', tanggal: '2026-11-10',
        pax: 50, sub: 7000000, grand: 7000000, dp: 3000000, paid: 3000000,
        items: [{ desc: 'Paket Makan', qty: 50, harga: 100000 }, { desc: 'Sewa Sound', qty: 1, harga: 2000000 }],
        bayar: [{ jenis: 'DP', nominal: 3000000, adaBukti: true }] },
      penanda: [{ id: 'p1', nama: 'Wandi', jabatan: 'Finance' }], materai: false,
      ubah: { kepada: 'PT Baru Sejahtera', up: 'Ibu Sari', ket: [{ asal: 'Sewa Sound', teks: 'Sound system + operator' }], oleh: 'Aurel' },
      mintaOleh: 'Aurel', mintaAt: Date.now(), catatan: '', putusOleh: 'Wandi', putusAt: Date.now() };
    const dom = new JSDOM(html, {
      url: 'https://team.laksamanamuda.id/finance/kas/',
      runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: new VirtualConsole(),
      beforeParse(w) {
        w.Chart = function () {}; w.Chart.prototype.destroy = function () {};
        w.HTMLCanvasElement.prototype.getContext = () => ({});
        w.alert = () => {}; w.confirm = () => true; w.print = () => {}; w.scrollTo = () => {};
        w.localStorage.setItem('lm_session', JSON.stringify({ expiry: Date.now() + 3600000, userId: 'u-wandi',
          name: 'Wandi Pranata', modules: ['finance'], adminModules: ['finance'] }));
        w.open = () => {
          const doc = { isi: '', open() { this.isi = ''; }, write(s) { this.isi += s; }, close() {} };
          const win = { document: doc }; jendela.push(win); return win;
        };
        w.fetch = async (url, init) => {
          const body = init && init.body ? JSON.parse(init.body) : {};
          const u = String(url);
          const balas = o => ({ ok: true, status: 200, text: async () => JSON.stringify(o), json: async () => o });
          if (u.indexOf('account-api') > -1)
            return balas({ ok: true, members: [{ id: 'u-wandi', name: 'Wandi Pranata', keterangan: 'Office', isModuleAdmin: true }] });
          if (u.indexOf('kompas-api') > -1)
            return balas({ ok: true, data: { reports: {}, daily: [], settings: {}, rekap_setoran: [], piutang: [] } });
          if (u.indexOf('finance-api') > -1) {
            kirim.push(body);
            if (body.action === 'invDaftar') return balas({ ok: true, data: { list: [KWI, INVB], setting: { cap: 'data:image/png;base64,CAP' },
              penanda: [{ id: 'p1', nama: 'Wandi', jabatan: 'Finance', ttd: 'data:image/png;base64,TTD', aktif: true }] } });
            if (body.action === 'invAntre') return balas({ ok: true, data: { total: 1, perJenis: {} } });
            if (body.action === 'invPutus') { materaiServer = !!body.materai; return balas({ ok: true, data: {} }); }
            if (body.action === 'invBerkas') {
              if (body.resId === 'r-1') return balas({ ok: true, data: { ada: true, jenis: 'KWITANSI', no: 'KWI/1', materai: true,
                cap: '', penanda: [{ nama: 'Wandi', jabatan: 'Finance', ttd: '' }] } });
              return balas({ ok: true, data: { ada: true, jenis: 'INV_DP', no: INVB.no, cap: 'data:image/png;base64,CAP',
                penanda: [{ nama: 'Wandi', jabatan: 'Finance', ttd: 'data:image/png;base64,TTD' }], ubah: INVB.ubah } });
            }
            return balas({ ok: true, data: { pos: [], kategori: [], trx: [], akses: {}, peran: {} } });
          }
          return balas({ ok: true, data: {} });
        };
      }
    });
    const w = dom.window, d = w.document;
    await tunggu(400);
    w.go('invoice');
    await tunggu(300);
    cek('halaman invoice termuat', w.eval('Array.isArray(INV)') && w.eval('INV.length') === 2, String(w.eval('INV && INV.length')));
    w.eval("invBukaPilih('k1')");
    await tunggu(20);
    const tombolTerbit = () => [...d.querySelectorAll('#app-view button')].find(b => /Terbitkan Kwitansi/.test(b.textContent));
    cek('pertanyaan materai muncul untuk kwitansi', /perlu materai\?/.test(d.getElementById('app-view').textContent));
    cek('tombol terbitkan DITAHAN sebelum materai dijawab', tombolTerbit() && tombolTerbit().disabled === true);
    const nSebelum = kirim.filter(k => k.action === 'invPutus').length;
    w.eval("invBuat('k1')");
    await tunggu(30);
    cek('dipanggil paksa dari console pun tidak mengirim', kirim.filter(k => k.action === 'invPutus').length === nSebelum);
    const radios = d.querySelectorAll('input[name="inv_materai"]');
    cek('dua pilihan Ya / Tidak', radios.length === 2);
    radios[1].checked = true; radios[1].dispatchEvent(new w.Event('change', { bubbles: true }));
    await tunggu(20);
    cek('sesudah dijawab tombol terbitkan hidup', tombolTerbit() && tombolTerbit().disabled === false);
    cek('keterangan cetak polos disebut', /kotak materai/.test(d.getElementById('app-view').textContent));
    tombolTerbit().click();
    await tunggu(80);
    const put = kirim.filter(k => k.action === 'invPutus').pop();
    cek('invPutus mengirim materai:true', put && put.materai === true);
    // Invoice tidak ditanya materai.
    w.eval("INV=" + JSON.stringify([Object.assign({}, INVB, { status: 'MENUNGGU', id: 'i2' })]) + ";INV_TAB='antrean';invBukaPilih('i2')");
    await tunggu(20);
    cek('invoice Marketing TIDAK ditanya materai', !/perlu materai\?/.test(d.getElementById('app-view').textContent));
    const tInv = [...d.querySelectorAll('#app-view button')].find(b => /Terbitkan Invoice/.test(b.textContent));
    cek('tombol terbitkan invoice tidak ditahan pertanyaan materai', tInv && !tInv.disabled);
    // Lihat PDF
    w.eval("INV=" + JSON.stringify([INVB, Object.assign({}, KWI, { status: 'DIBUAT', no: 'KWI/1', materai: true })]) + ";INV_PILIH=null;INV_TAB='riwayat';render()");
    await tunggu(20);
    const tLihat = [...d.querySelectorAll('#app-view button')].filter(b => /Lihat PDF/.test(b.textContent));
    cek('tombol Lihat PDF ada untuk tiap dokumen terbit', tLihat.length === 2, String(tLihat.length));
    cek('chip Bermaterai di riwayat', /Bermaterai/.test(d.getElementById('app-view').textContent));
    cek('penanda "isi diubah Marketing"', /isi diubah Marketing/.test(d.getElementById('app-view').textContent));
    tLihat[0].click();
    await tunggu(80);
    const inv = jendela[jendela.length - 1].document.isi;
    cek('jendela invoice terisi lembar', /INVOICE DOWN PAYMENT/.test(inv));
    cek('nomor resmi di lembar Finance', /INV\/2026\/10\/0009/.test(inv));
    cek('ubahan Marketing ikut di lembar Finance (Kepada)', /Kepada<\/b>: PT Baru Sejahtera/.test(inv));
    cek('ubahan Marketing ikut di lembar Finance (U.P)', /U\.P<\/b>: Ibu Sari/.test(inv));
    cek('ubahan keterangan ikut', /Sound system \+ operator/.test(inv));
    cek('cap ditempel karena DP berbukti', /base64,CAP/.test(inv));
    cek('DP yang ditagih benar', /DP yang ditagih[\s\S]{0,300}Rp 3\.000\.000/.test(inv));
    tLihat[1].click();
    await tunggu(80);
    const kw = jendela[jendela.length - 1].document.isi;
    cek('jendela kwitansi terisi lembar', /KWITANSI/.test(kw) && /WULAN/.test(kw));
    cek('kwitansi bermaterai: kotak materai di lembar Finance', /class="materai"/.test(kw));
    cek('kwitansi: total DP', /750\.000/.test(kw));
  });

  console.log('\n---------------------------------------');
  console.log('LULUS ' + ok + '   GAGAL ' + gagal);
  process.exit(gagal ? 1 : 0);
})();
