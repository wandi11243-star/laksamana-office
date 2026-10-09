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
        items: DB.items.map(i => Object.assign({}, i, { stok: stokOf(i.id) })),
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
  return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve(JSON.stringify(out)) });
}

(async () => {
  const dom = new JSDOM(html, {
    url: 'https://dev.laksamanamuda.id/stock/breakloss/',
    runScripts: 'dangerously', pretendToBeVisual: true,
    beforeParse(w) {
      w.localStorage.setItem('lm_session', JSON.stringify({ name: 'Uji Steward', token: 'tok', modules: ['breakloss'], expiry: Date.now() + 3600e3 }));
      w.fetch = server;
      w.confirm = () => true;
      w.scrollTo = () => {};
    }
  });
  const w = dom.window, d = w.document;
  await tunggu(80);
  const app = () => d.getElementById('app').innerHTML;
  const ev = (el, t) => el.dispatchEvent(new w.Event(t, { bubbles: true }));

  cek('halaman tidak dialihkan oleh guard', w.location.pathname.endsWith('/stock/breakloss/'));
  cek('keadaan kosong menyuruh mendaftarkan barang', /Belum ada barang terdaftar/.test(app()));

  // Daftarkan barang lewat modal, dengan stok awal.
  w.bukaItem();
  d.getElementById('if-nama').value = 'Piring Saji 27cm';
  d.getElementById('if-kategori').value = 'Piring';
  d.getElementById('if-satuan').value = 'pcs';
  d.getElementById('if-harga').value = '45000';
  d.getElementById('if-min').value = '20';
  d.getElementById('if-awal').value = '24';
  await w.simpanItem(); await tunggu(30);
  cek('barang tersimpan di server', DB.items.length === 1 && DB.items[0].nama === 'Piring Saji 27cm');
  cek('stok awal jadi mutasi MASUK', DB.mutasi.length === 1 && DB.mutasi[0].jenis === 'masuk' && DB.mutasi[0].qty === 24);
  cek('kartu barang memajang stok 24', /Piring Saji 27cm/.test(app()) && /<b class="">24<\/b>/.test(app()));

  // Nama kembar ditolak, modal tetap terbuka.
  w.bukaItem(); d.getElementById('if-nama').value = 'piring saji 27cm';
  const n0 = DB.items.length; await w.simpanItem(); await tunggu(20);
  cek('nama kembar ditolak', DB.items.length === n0 && !!d.querySelector('#if-nama.err'));
  w.tutup();

  // Catat: sebab kosong DITAHAN di layar (tidak ada POST).
  const id = DB.items[0].id;
  w.catatUntuk(id); await tunggu(10);
  cek('tab Catat terbuka dengan barang terpilih', /Stok terkini <b>24 pcs<\/b>/.test(app()));
  w.ubahForm('qty', '3');
  const p0 = nPost; await w.simpanCatat(); await tunggu(10);
  cek('sebab kosong ditahan tanpa kiriman', nPost === p0 && !!d.querySelector('input.err[list="sebab-saran"]'));

  w.ubahForm('sebab', 'Pecah saat dicuci'); w.ubahForm('tim', 'Steward');
  await w.simpanCatat(); await tunggu(30);
  const br = DB.mutasi.find(m => m.jenis === 'break');
  cek('break tersimpan bertanda minus', br && br.qty === -3 && br.sebab === 'Pecah saat dicuci');
  cek('pencatat diambil dari sesi', br && br.oleh === 'Uji Steward');
  cek('form dikosongkan sesudah simpan', w.eval("ST.form.qty === '' && ST.form.itemId === ''"));

  // Loss
  w.eval("ST.form = formBaru('" + id + "', 'loss')"); w.ubahForm('qty', '2'); w.ubahForm('sebab', 'Tidak kembali dari meja');
  await w.simpanCatat(); await tunggu(30);
  cek('stok terkini 24 − 3 − 2 = 19', stokOf(id) === 19);

  // Rekap
  w.go('rekap'); await tunggu(5);
  cek('rekap menyebut nilai break 3 × 45.000', /Rp135\.000/.test(app()));
  cek('rekap menyebut total nilai 5 × 45.000', /Rp225\.000/.test(app()));
  w.go('stok'); await tunggu(5);
  cek('stok 19 ≤ minimum 20 ditandai menipis', /Stok menipis/.test(app()) && /<b class="min">19<\/b>/.test(app()));

  // Opname: fisik 17 → selisih −2 dihitung server.
  w.bukaMutasi(id, 'opname');
  d.getElementById('mt-qty').value = '17';
  await w.simpanMutasi(id, 'opname'); await tunggu(30);
  const op = DB.mutasi.find(m => m.jenis === 'opname');
  cek('opname mencatat selisih −2', op && op.qty === -2 && stokOf(id) === 17);

  // Batalkan break → stok kembali naik 3, baris tetap ada.
  w.go('riwayat'); await tunggu(5);
  cek('riwayat bawaan menampilkan break & loss', /Pecah saat dicuci/.test(app()) && /Tidak kembali dari meja/.test(app()));
  w.bukaBatal(br.id);
  const p1 = nPost; await w.simpanBatal(br.id); await tunggu(10);
  cek('batal tanpa alasan ditahan', nPost === p1 && !br.batalAt);
  d.getElementById('bt-alasan').value = 'Salah jumlah';
  await w.simpanBatal(br.id); await tunggu(30);
  cek('batal tersimpan, baris TIDAK dihapus', br.batalAt && DB.mutasi.includes(br));
  cek('stok kembali naik sebesar break yang dibatalkan', stokOf(id) === 20);
  cek('baris batal tercoret di riwayat', !!d.querySelector('tr.batal') && /Salah jumlah/.test(app()));

  // Nonaktif → tidak muncul di form catat.
  await w.aktifkanItem(id, 0); await tunggu(30);
  w.go('catat'); await tunggu(5);
  cek('barang nonaktif tidak bisa dicatat', /Belum ada barang aktif/.test(app()));

  // Mengetik di kotak cari tidak membuat ulang kotaknya.
  w.go('stok'); w.eval("ST.tampil = 'semua'"); w.render();
  const kotak = d.getElementById('cari-stok'); kotak.value = 'piring'; ev(kotak, 'input');
  cek('kotak cari tidak dibuat ulang saat mengetik', d.getElementById('cari-stok') === kotak);
  kotak.value = 'gelas'; ev(kotak, 'input');
  cek('kata tanpa hasil dikatakan', /Tidak ada barang yang cocok/.test(app()));

  // Pemilih panel Stock mengenal tujuan baru.
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
