/* Uji panel Stock → Break & Loss (deploy/stock/breakloss/) + kontrak backend.
 *
 *   node tools/uji-breakloss.js
 *
 * Tiga lapis:
 *   1. Sintaks PHP lewat php-parser (tidak ada php di mesin pengembangan;
 *      satu parse error mematikan SELURUH endpoint stock-api-mysql).
 *   2. Kontrak atas sumber PHP: tidak ada DELETE, stok dihitung dari mutasi
 *      yang tidak dibatalkan, opname dihitung server di dalam transaksi.
 *   3. Halamannya DIJALANKAN di jsdom dengan server tiruan yang HIDUP — apa
 *      yang ditulis POST dipulangkan GET berikutnya, dengan aturan yang sama
 *      dengan lib_stock_breakloss.php. Yang dijaga ISI SERVER, bukan layar.
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const JSDOM_PATH = process.env.JSDOM_PATH || 'jsdom';
const { JSDOM } = require(JSDOM_PATH);

let ok = 0, gagal = 0;
function cek(nama, kondisi, ket) {
  if (kondisi) { ok++; console.log('  OK   ' + nama); }
  else { gagal++; console.log('  GAGAL ' + nama + (ket ? '  — ' + ket : '')); }
}
const tunggu = ms => new Promise(r => setTimeout(r, ms));

/* ---------------- 1 & 2. PHP ---------------- */
console.log('\n[1] PHP');
const libSrc = fs.readFileSync(path.join(ROOT, 'stock-mysql/lib_stock_breakloss.php'), 'utf8');
const epSrc  = fs.readFileSync(path.join(ROOT, 'stock-mysql/breakloss.php'), 'utf8');
let parser = null;
for (const p of [process.env.PHP_PARSER_PATH, 'php-parser', 'C:/Users/LENOVO LEGION/node_modules/php-parser'].filter(Boolean)) {
  try { parser = require(p); break; } catch (e) {}
}
if (!parser) console.log('  LEWAT php-parser tidak terpasang');
else {
  const Engine = parser.Engine || parser;
  const eng = new Engine({ parser: { php8: true, suppressErrors: false }, ast: { withPositions: false } });
  for (const [n, s] of [['lib_stock_breakloss.php', libSrc], ['breakloss.php', epSrc]]) {
    let e = null; try { eng.parseCode(s, n); } catch (x) { e = x; }
    cek('sintaks ' + n, !e, e && e.message);
  }
}
const tanpaKomentar = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const libKode = tanpaKomentar(libSrc), epKode = tanpaKomentar(epSrc);
cek('tidak ada DELETE di lib', !/\bDELETE\b/i.test(libKode));
cek('tidak ada aksi hapus di endpoint', !/hapus/i.test(epKode));
cek('mb_substr hanya lewat penjaga function_exists', (libKode.match(/mb_[a-z]+\(/g) || []).length === 1 && libKode.includes("function_exists('mb_substr') ? mb_substr("));
cek('stok = SUM mutasi yang tidak dibatalkan', /SUM\(`qty`\)[\s\S]{0,120}`batal_at` IS NULL/.test(libKode));
cek('opname dihitung server dari fisik − stok', /\$delta = round\(\$fisik - \$stokSebelum, 2\)/.test(libKode));
cek('baris barang dikunci FOR UPDATE', /FOR UPDATE/.test(libKode));
cek('break & loss wajib bersebab', /\(\$jenis === 'break' \|\| \$jenis === 'loss'\) && \$sebab === ''/.test(libKode));
cek('batal hanya sekali (batal_at IS NULL)', /WHERE `id`=\? AND `batal_at` IS NULL/.test(libKode));
cek('server menolak pecahan (qty, fisik, stok awal, stok minimum)',
    /\$qty <= 0 \|\| floor\(\$qty\) != \$qty/.test(libKode) && /floor\(\$fisik\) != \$fisik/.test(libKode)
    && /floor\(\$awal\) != \$awal/.test(libKode) && /floor\(\$min\) != \$min/.test(libKode));
cek('harga disalin ke baris mutasi', /\(float\)\$it\['harga'\]/.test(libKode));
cek('tabel lahir sendiri (CREATE TABLE IF NOT EXISTS ×2)', (libKode.match(/CREATE TABLE IF NOT EXISTS/g) || []).length === 2);

/* ---------------- 3. Halaman ---------------- */
console.log('\n[2] Halaman');
const htmlPath = path.join(ROOT, 'deploy/stock/breakloss/index.html');
let html = fs.readFileSync(htmlPath, 'utf8');

/* Server tiruan yang meniru lib_stock_breakloss.php. */
const DB = { items: [], mutasi: [] };
let nPost = 0, nId = 0;
const stokOf = id => DB.mutasi.filter(m => m.itemId === id && !m.batalAt).reduce((a, m) => a + m.qty, 0);
function server(url, opt) {
  const u = new URL(url, 'https://dev.laksamanamuda.id/stock/breakloss/');
  let out;
  if (!opt || opt.method !== 'POST') {
    if (u.searchParams.get('action') === 'foto') {
      out = { status: 'success', foto: 'data:image/jpeg;base64,QUJD', fotoNama: 'x.jpg' };
    } else {
      const dari = u.searchParams.get('dari') || '', ke = u.searchParams.get('ke') || '';
      out = { status: 'success',
        items: DB.items.map(i => Object.assign({}, i, { stok: stokOf(i.id),
          totBreak: -DB.mutasi.filter(m => m.itemId === i.id && !m.batalAt && m.jenis === 'break').reduce((x, m) => x + m.qty, 0),
          totLoss:  -DB.mutasi.filter(m => m.itemId === i.id && !m.batalAt && m.jenis === 'loss').reduce((x, m) => x + m.qty, 0) })),
        mutasi: DB.mutasi.filter(m => (!dari || m.tanggal >= dari) && (!ke || m.tanggal <= ke))
                         .map(m => Object.assign({}, m, { foto: undefined })) };
    }
  } else {
    nPost++;
    const b = JSON.parse(opt.body);
    if (b.action === 'itemSimpan') {
      if (!b.nama) out = { status: 'error', message: 'nama wajib', kurang: ['nama'] };
      else if (!b.id && DB.items.some(i => i.nama.toLowerCase() === b.nama.toLowerCase())) out = { status: 'error', message: 'sudah terdaftar', kurang: ['nama'] };
      else if (b.id) { Object.assign(DB.items.find(i => i.id === b.id), b); out = { status: 'success', id: b.id }; }
      else {
        const id = 'BLI-' + (++nId);
        DB.items.push({ id, nama: b.nama, kategori: b.kategori, satuan: b.satuan, lokasi: b.lokasi, harga: b.harga,
                        stokMin: b.stokMin, aktif: true, catatan: b.catatan, thumb: b.thumb || '', adaFoto: !!b.foto });
        if (b.stokAwal > 0) DB.mutasi.push({ id: 'BLM-' + (++nId), itemId: id, tanggal: '2026-10-01', jenis: 'masuk', qty: b.stokAwal, harga: b.harga, sebab: 'Stok awal' });
        out = { status: 'success', id };
      }
    } else if (b.action === 'mutasiSimpan') {
      const it = DB.items.find(i => i.id === b.itemId);
      const kurang = [];
      if (!b.itemId) kurang.push('itemId');
      if ((b.jenis === 'break' || b.jenis === 'loss') && !String(b.sebab || '').trim()) kurang.push('sebab');
      if (b.jenis !== 'opname' && !(b.qty > 0)) kurang.push('qty');
      if (kurang.length) out = { status: 'error', message: 'Belum lengkap', kurang };
      else if (!it || !it.aktif) out = { status: 'error', message: 'barang tidak bisa dicatat' };
      else {
        const sebelum = stokOf(it.id);
        const delta = b.jenis === 'opname' ? b.fisik - sebelum : b.jenis === 'masuk' ? b.qty : -b.qty;
        DB.mutasi.push({ id: 'BLM-' + (++nId), itemId: it.id, tanggal: b.tanggal, jenis: b.jenis, qty: delta, harga: it.harga,
          sebab: b.sebab, pic: b.pic, tim: b.tim, catatan: b.catatan, adaFoto: !!b.foto, oleh: b.oleh, waktu: '2026-10-09 10:00:00', batalAt: null });
        out = { status: 'success', delta, stok: sebelum + delta };
      }
    } else if (b.action === 'mutasiBatal') {
      const m = DB.mutasi.find(x => x.id === b.id && !x.batalAt);
      if (!b.alasan) out = { status: 'error', message: 'alasan wajib' };
      else if (!m) out = { status: 'error', message: 'tidak ditemukan' };
      else { m.batalAt = '2026-10-09 11:00:00'; m.batalOleh = b.oleh; m.batalAlasan = b.alasan; out = { status: 'success' }; }
    } else if (b.action === 'itemAktif') {
      DB.items.find(i => i.id === b.id).aktif = !!b.aktif; out = { status: 'success' };
    } else out = { status: 'error', message: 'aksi tak dikenal' };
  }
  return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve(JSON.stringify(out)), json: () => Promise.resolve(JSON.parse(JSON.stringify(out))) });
}

(async () => {
  const COMMON = fs.readFileSync(path.join(ROOT, 'deploy/stock/catat-common.js'), 'utf8');
  const { VirtualConsole } = require(JSDOM_PATH);
  const dom = new JSDOM(
    /* CDN Tailwind & FontAwesome tidak bisa dimuat jsdom; blok setelan tema
       ikut dibuang (menyentuh objek `tailwind`). catat-common.js — yang
       menggambar sidebar & memegang helper — DISISIPKAN apa adanya, sama
       dengan uji panel Pemakaian. */
    html.replace(/<script[^>]+src="https?:\/\/[^"]*"[^>]*><\/script>/g, '')
        .replace(/<script>[\s\S]*?tailwind\.config[\s\S]*?<\/script>/, '')
        .replace('<script src="../catat-common.js"></script>', () => '<script>' + COMMON + '</script>'),
    {
      url: 'https://dev.laksamanamuda.id/stock/breakloss/',
      runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: new VirtualConsole(),
      beforeParse(w) {
        w.localStorage.setItem('lm_session', JSON.stringify({ name: 'Uji Steward', token: 'tok', modules: ['breakloss'], expiry: Date.now() + 3600e3 }));
        w.fetch = server;
        w.confirm = () => true;
        w.prompt = () => w.__jawabPrompt;
        w.scrollTo = () => {};
      }
    });
  const w = dom.window, d = w.document;
  await tunggu(80);
  const $ = id => d.getElementById(id);
  const isi = id => ($(id) || {}).innerHTML || '';
  const TIM_JUMLAH = w.eval('TIM_OPSI.length');

  cek('halaman tidak dialihkan oleh guard', w.location.pathname.endsWith('/stock/breakloss/'));
  /* TAMPILAN SAMA DENGAN FORM WASTE — permintaan user. Yang dijaga
     kerangkanya: sidebar dari catat-common, sub-tab Catat | Report, dan
     kelas komponen yang sama dengan panel Pemakaian. */
  cek('sidebar digambar catat-common (pasangCangkang)', /Laksamana Muda/.test(isi('app-sidebar')) && !!d.querySelector('[data-nav-tampilan="bl"]') && !!d.querySelector('[data-nav-tampilan="barang"]'));
  cek('sub-tab Catat | Report seperti Waste', !!d.querySelector('.subtab[data-subgrup="bl"] [data-sub="catat"]') && !!d.querySelector('.subtab[data-subgrup="bl"] [data-sub="report"]'));
  cek('form memakai panel + field + btn-primary btn-block seperti Waste',
      !!d.querySelector('[data-subpane="bl:catat"] .panel .panel-body .field') && !!d.querySelector('[data-subpane="bl:catat"] .btn.btn-primary.btn-block'));
  cek('report memakai recap-grid + bars seperti Waste', !!$('bl-ringkas') && $('bl-ringkas').classList.contains('recap-grid') && !!d.querySelector('#br-sebab.bars'));
  const usage = fs.readFileSync(path.join(ROOT, 'deploy/stock/usage/index.html'), 'utf8').replace(/\r\n/g, '\n');
  const potongStyle = s => { const a = s.indexOf('<style>'); return s.slice(a, s.indexOf('</style>', a)); };
  cek('lapisan CSS identik dengan panel Pemakaian', potongStyle(html.replace(/\r\n/g, '\n')) === potongStyle(usage));
  cek('halaman terbuka di menu Break & Loss, sub-tab Catat', !d.querySelector('[data-tampilan="bl"]').classList.contains('hidden') && !d.querySelector('[data-subpane="bl:catat"]').classList.contains('hidden'));
  cek('keadaan kosong menunjuk ke Daftarkan Barang', /Belum ada barang/.test(isi('b-item-info')));

  /* TIM DARI DIVISI AKUN — aturan form Waste. SESI itu const, tapi isinya
     objek; keterangannya diganti lalu penguncinya dijalankan ulang. */
  const timDgn = ket => { w.eval('SESI.keterangan = ' + JSON.stringify(ket) + '; kunciPilihanTim();'); return $('b-tim'); };
  let sel = timDgn('Bar');
  cek('divisi tunggal: tim terisi & terkunci', sel.value === 'Bar' && sel.options.length === 1 && sel.classList.contains('locked') && sel.classList.contains('pointer-events-none'));
  sel = timDgn('Bar, Floor');
  cek('dua divisi: dipersempit ke miliknya, tidak terkunci', sel.options.length === 2 && sel.value === 'Bar' && !sel.classList.contains('locked'));
  sel = timDgn('Overhead Barista');
  cek('kata yang cuma memuat nama divisi tidak dicocokkan', sel.options.length === TIM_JUMLAH + 1 && sel.value === '' && !sel.classList.contains('locked'));
  sel = timDgn('');
  cek('tanpa divisi: bebas memilih + dikatakan', sel.options.length === TIM_JUMLAH + 1 && /belum tercatat/.test(isi('b-tim-info')));

  /* FOTO: tombol Buka Kamera memakai input ber-capture (di HP langsung membuka
     kamera belakang), tombol Upload tanpa capture (galeri). */
  for (const k of ['b', 'i']) {
    cek(`foto ${k}: input kamera ber-capture=environment`, ($(k + '-foto-cam') || {}).getAttribute && $(k + '-foto-cam').getAttribute('capture') === 'environment');
    cek(`foto ${k}: input unggah TANPA capture`, !!$(k + '-foto-file') && !$(k + '-foto-file').hasAttribute('capture'));
    let diklik = false;
    $(k + '-foto-cam').addEventListener('click', e => { diklik = true; e.preventDefault(); });
    const tombol = [...d.querySelectorAll('button')].find(b => /Buka Kamera/.test(b.textContent) && (b.getAttribute('onclick') || '').includes(k + '-foto-cam'));
    if (tombol) tombol.click();
    cek(`foto ${k}: tombol Buka Kamera memicu input kamera`, diklik);
  }

  // Daftarkan barang, dengan stok awal.
  w.buka('barang', 'catat');
  $('i-nama').value = 'Piring Saji 27cm'; $('i-kategori').value = 'Piring';
  $('i-harga').value = '45000'; $('i-min').value = '20'; $('i-awal').value = '24';
  await w.simpanItem(); await tunggu(30);
  cek('barang tersimpan di server', DB.items.length === 1 && DB.items[0].nama === 'Piring Saji 27cm');
  cek('stok awal jadi mutasi MASUK', DB.mutasi.length === 1 && DB.mutasi[0].jenis === 'masuk' && DB.mutasi[0].qty === 24);
  cek('sesudah simpan pindah ke Stok Terkini', !d.querySelector('[data-subpane="barang:report"]').classList.contains('hidden'));
  cek('Stok Terkini memajang stok 24', /Piring Saji 27cm/.test(isi('stok-daftar')) && /bl-stok[^"]*">24</.test(isi('stok-daftar')));

  // Nama kembar ditolak dan ditandai.
  w.buka('barang', 'catat'); $('i-nama').value = 'piring saji 27cm';
  const n0 = DB.items.length; await w.simpanItem(); await tunggu(20);
  cek('nama kembar ditolak & kotaknya ditandai', DB.items.length === n0 && $('i-nama').classList.contains('err'));
  w.resetItem();

  // Catat: sebab kosong DITAHAN di layar (tidak ada POST).
  const id = DB.items[0].id;
  w.catatUntuk(id); await tunggu(10);
  cek('Catat terbuka dengan barang terpilih + stok terkini', $('b-item').value === id && /Stok terkini <b[^>]*>24 Pcs<\/b>/.test(isi('b-item-info')));
  $('b-qty').value = '3';
  const p0 = nPost; await w.simpanCatat(); await tunggu(10);
  cek('sebab kosong ditahan tanpa kiriman', nPost === p0 && $('b-sebab').classList.contains('err'));

  /* SATUAN TERLIHAT (laporan user 10 Okt 2026: kotak satuan terdesak sampai
     hilang). Yang dijaga: satuan berupa label berteks, bukan input readonly
     yang ikut aturan .field input{width:100%}. */
  cek('satuan tampil sebagai label berteks', $('b-unit').tagName === 'SPAN' && $('b-unit').textContent === 'Pcs');
  cek('lebar kotak jumlah dipatok inline', /width:\s*96px/.test($('b-qty').getAttribute('style') || ''));

  /* BILANGAN BULAT: pecahan dibulatkan saat diketik dan ditahan saat simpan. */
  $('b-qty').value = '1.02'; w.bulatkanKotak($('b-qty'));
  cek('pecahan dibulatkan saat diketik (1.02 → 1)', $('b-qty').value === '1');
  cek('kotak jumlah step=1', $('b-qty').getAttribute('step') === '1');
  $('b-qty').value = '2.5'; $('b-sebab').value = 'x';
  const pDes = nPost; await w.simpanCatat(); await tunggu(10);
  cek('pecahan yang lolos ke simpan ditahan tanpa kiriman', nPost === pDes && $('b-qty').classList.contains('err'));
  $('b-qty').value = '3'; $('b-sebab').value = '';

  $('b-sebab').value = 'Pecah saat dicuci'; $('b-tim').value = 'Steward';
  await w.simpanCatat(); await tunggu(30);
  const br = DB.mutasi.find(m => m.jenis === 'break');
  cek('break tersimpan bertanda minus', br && br.qty === -3 && br.sebab === 'Pecah saat dicuci');
  cek('pencatat dari sesi', br && br.oleh === 'Uji Steward');
  cek('sesudah simpan pindah ke Report (seperti Waste)', !d.querySelector('[data-subpane="bl:report"]').classList.contains('hidden'));
  cek('form dikosongkan sesudah simpan', $('b-sebab').value === '' && $('b-item').value === '');

  // Loss
  w.catatUntuk(id); $('b-jenis').value = 'loss'; $('b-qty').value = '2'; $('b-sebab').value = 'Tidak kembali dari meja';
  await w.simpanCatat(); await tunggu(30);
  cek('stok terkini 24 − 3 − 2 = 19', stokOf(id) === 19);
  cek('report: kartu Break 3 & nilai 5 × 45.000', /💥 Break[\s\S]*?val">3</.test(isi('bl-ringkas')) && /Rp225\.000/.test(isi('bl-ringkas')));
  cek('report: daftar memuat kedua catatan', /Pecah saat dicuci/.test(isi('bl-daftar')) && /Tidak kembali dari meja/.test(isi('bl-daftar')));
  cek('report: tabel per barang memakai tbl', !!d.querySelector('#rekap-bl table.tbl'));
  cek('stok 19 ≤ minimum 20 ditandai menipis', /Stok menipis/.test(isi('stok-daftar')) && /bl-stok min">19</.test(isi('stok-daftar')));

  // Opname: fisik 17 → selisih −2 dihitung server.
  w.bukaMutasi(id, 'opname'); $('m-qty').value = '17';
  await w.simpanMutasi(id, 'opname'); await tunggu(30);
  const op = DB.mutasi.find(m => m.jenis === 'opname');
  cek('opname mencatat selisih −2', op && op.qty === -2 && stokOf(id) === 17);

  // Batal: tanpa alasan ditahan; dengan alasan → dicoret, stok kembali.
  w.__jawabPrompt = '';
  const p1 = nPost; await w.batalkan(br.id); await tunggu(10);
  cek('batal tanpa alasan ditahan', nPost === p1 && !br.batalAt);
  w.__jawabPrompt = 'Salah jumlah';
  await w.batalkan(br.id); await tunggu(30);
  cek('batal tersimpan, baris TIDAK dihapus', br.batalAt && DB.mutasi.includes(br));
  cek('stok kembali naik sebesar break yang dibatalkan', stokOf(id) === 20);
  cek('baris batal tercoret di daftar', !!d.querySelector('#bl-daftar .batal-row') && /Salah jumlah/.test(isi('bl-daftar')));
  cek('tidak ada tombol hapus di daftar', !/trash/.test(isi('bl-daftar')));

  // Nonaktif → tidak bisa dipilih di form catat.
  w.editItem(id); await w.aktifkanItem(); await tunggu(30);
  cek('barang nonaktif hilang dari pilihan catat', ![...$('b-item').options].some(o => o.value === id));

  // Pemilih panel & portal.
  const pem = fs.readFileSync(path.join(ROOT, 'deploy/stock/index.html'), 'utf8');
  cek('pemilih: guard head mengenal breakloss', /m\.indexOf\('breakloss'\) > -1\)\) return null;/.test(pem));
  cek('pemilih: tujuan tunggal diarahkan ke ./breakloss/', /panel\[0\] === 'breakloss' \? '\.\/breakloss\/'/.test(pem));
  cek('pemilih: kartu panel ada', /data-key="breakloss"/.test(pem));
  const portal = fs.readFileSync(path.join(ROOT, 'deploy/index.html'), 'utf8');
  cek('portal: kunci breakloss ada di access kartu Stock', /access:\['ordering','purchasing','tree','usage','hpp','breakloss'\]/.test(portal));

  console.log('\n====================================================');
  console.log('  OK: ' + ok + '   GAGAL: ' + gagal);
  console.log('====================================================');
  process.exit(gagal ? 1 : 0);
})().catch(e => { console.log('  GAGAL uji mati: ' + (e && e.stack || e)); process.exit(1); });
