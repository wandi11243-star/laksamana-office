/* uji-riwayat-halaman.js — tab Riwayat Reservasi dimuat PER HALAMAN dari server
 *
 *   JSDOM_PATH=/jalur/ke/jsdom node tools/uji-riwayat-halaman.js
 *
 * Permintaan user 24 September 2026: "ketika pindah page baru munculin data per
 * 10 per 10 — jangan ketika dibuka langsung memproses semua data".
 *
 * Yang diukur JUMLAH & ISI PANGGILAN ?action=riwayat, bukan tampilan saja:
 *   - buka = satu panggilan hal=1 per=10
 *   - pindah halaman = satu panggilan hal=2
 *   - render ulang tanpa perubahan (polling, simpan) TIDAK menembak lagi
 *   - gagal TIDAK berputar tanpa henti
 *   - server lama jatuh ke cara lokal, bukan layar kosong
 * Ditambah kontrak sumber PHP riwayat_hal() (php-parser + pola).
 */
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..');
const muat = ps => { for (const p of ps) { if (!p) continue; try { return require(p); } catch (e) {} } return null; };
const JSD = muat([process.env.JSDOM_PATH, path.join(ROOT, 'node_modules', 'jsdom'), 'C:/Users/LENOVO LEGION/node_modules/jsdom', 'jsdom']);
if (!JSD) { console.error('jsdom tidak ketemu'); process.exit(2); }
const { JSDOM, VirtualConsole } = JSD;
const PHP_MOD = muat([process.env.PHP_PARSER_PATH, path.join(ROOT, 'node_modules', 'php-parser'), 'C:/Users/LENOVO LEGION/node_modules/php-parser', 'php-parser']);

let ok = 0, gagal = 0;
const cek = (n, s, k) => { if (s) { ok++; console.log('  OK   ' + n); } else { gagal++; console.log('  GAGAL ' + n + (k ? '  — ' + k : '')); } };
const sama = (n, d, h) => cek(n, JSON.stringify(d) === JSON.stringify(h), 'dapat ' + JSON.stringify(d) + ', harusnya ' + JSON.stringify(h));
const aman = async (n, fn) => { try { await fn(); } catch (e) { gagal++; console.log('  GAGAL ' + n + '  — melempar: ' + e.message); } };
const tunggu = ms => new Promise(r => setTimeout(r, ms));

const ASSET = fs.readFileSync(path.join(ROOT, 'deploy/assets/venue-layouts.js'), 'utf8');
const SUMBER = fs.readFileSync(path.join(ROOT, 'deploy/reservasi/index.html'), 'utf8');
const HTML = SUMBER.replace('<script src="../assets/venue-layouts.js"><' + '/script>', () => '<script>' + ASSET + '<' + '/script>');

/* Tanggal RELATIF terhadap hari ini — fixture berjam mati membusuk sendiri. */
const hariLalu = n => { const d = new Date(Date.now() + 7 * 3600e3 - n * 86400e3); return d.toISOString().slice(0, 10); };
function fixture() {
  const rows = [];
  for (let i = 1; i <= 23; i++) rows.push({ id: 'r' + String(i).padStart(2, '0'), name: i === 7 ? 'Budi Santoso' : 'Tamu ' + i, phone: '0812' + String(1000 + i), date: hariLalu(i), time: '19:00', pax: 2, table: '21', status: i % 5 === 0 ? 'No-show' : 'Datang', dpStatus: 'Belum', updatedAt: 1, createdAt: i });
  rows.push({ id: 'besok', name: 'Nanti', phone: '0899', date: hariLalu(-1), time: '19:00', pax: 2, table: '22', status: 'Confirmed', dpStatus: 'Belum', updatedAt: 1, createdAt: 99 });
  return rows;
}
/* Tiruan riwayat_hal(): aturan yang sama dengan PHP & renderRiwayatLokal(). */
function riwayatTiruan(rows, p) {
  const hari = p.hariIni;
  let l = rows.filter(r => !r.date || r.date < hari || ['No-show', 'Cancelled'].includes(r.status));
  if (p.mode === 'month') l = l.filter(r => r.date.slice(0, 7) === p.bulan);
  else if (p.mode === 'year') l = l.filter(r => r.date.slice(0, 4) === p.tahun);
  if (p.status) l = l.filter(r => r.status === p.status);
  if (p.q) { const q = p.q.toLowerCase(); l = l.filter(r => r.name.toLowerCase().includes(q) || r.phone.includes(q)); }
  l.sort((a, b) => (b.date + b.time + b.id).localeCompare(a.date + a.time + a.id));
  const per = Math.min(100, Math.max(1, +p.per || 10)), total = l.length, maxHal = Math.max(1, Math.ceil(total / per));
  const hal = Math.min(Math.max(1, +p.hal || 1), maxHal);
  if (p.ekspor) return { ids: l.map(r => r.id), total };
  return { rows: l.slice((hal - 1) * per, hal * per), total, hal, per, maxHal };
}

function buka(opsi) {
  opsi = opsi || {};
  const riw = [];
  const srv = { ver: 5, simpanan: { reservations: fixture(), master: {}, audit: [] }, gagalRiwayat: !!opsi.gagal, lambat: 0 };
  const d = new JSDOM(HTML, {
    url: 'https://dev.laksamanamuda.id/reservasi/', runScripts: 'dangerously', pretendToBeVisual: true,
    virtualConsole: new VirtualConsole(),
    beforeParse(w) {
      w.alert = () => {}; w.confirm = () => true; w.scrollTo = () => {};
      w.HTMLElement.prototype.scrollIntoView = function () {};
      w.localStorage.setItem('lm_session', JSON.stringify({ expiry: Date.now() + 3600000, userId: 'u-uji', name: 'Penguji', modules: ['reservasi'], adminModules: ['reservasi'] }));
      w.fetch = async (url, init) => {
        const u = String(url), body = init && init.body ? JSON.parse(init.body) : {};
        const q = new URL(u, 'https://x/').searchParams;
        const aksi = body.action || q.get('action') || '?';
        const balas = o => ({ ok: true, status: 200, text: async () => JSON.stringify(o), json: async () => o });
        if (u.indexOf('account-api') > -1) return balas({ ok: true, members: [{ id: 'u-uji', name: 'Penguji', keterangan: 'Office', isModuleAdmin: true }] });
        if (aksi === 'riwayat') {
          const p = Object.fromEntries(q.entries()); riw.push(p);
          if (opsi.serverLama) return balas({ ok: false, error: 'Aksi tidak dikenal: riwayat' });
          if (srv.gagalRiwayat) return balas({ ok: false, error: 'SQLSTATE mati' });
          if (srv.lambat) await tunggu(srv.lambat);
          return balas({ ok: true, data: riwayatTiruan(srv.simpanan.reservations, p) });
        }
        if (aksi === 'ver') return balas({ ok: true, data: { ver: srv.ver } });
        if (aksi === 'getAll') return balas({ ok: true, data: Object.assign(JSON.parse(JSON.stringify(srv.simpanan)), { _ver: srv.ver }) });
        if (aksi === 'saveAll') { srv.simpanan = body.data; srv.ver++; return balas({ ok: true, data: { saved: true, ver: srv.ver } }); }
        return balas({ ok: true, data: {} });
      };
    }
  });
  return { w: d.window, riw, srv };
}
async function siap(w) {
  for (let i = 0; i < 220; i++) { try { if (w.eval('typeof STATE!=="undefined" && STATE && DATA_LOADED')) return; } catch (e) {} await tunggu(50); }
  throw new Error('modul Reservasi tidak pernah siap');
}
async function keRiwayat(w) {
  await siap(w);
  w.eval('SESSION={id:"u-uji",name:"Penguji",role:"admin"}; SELECTED_CREW="u-uji";');
  await w.eval('flushSave()'); await tunggu(60);
  w.eval('navigate("riwayat")'); await tunggu(120);
}
const barisTabel = w => [...w.document.querySelectorAll('#page-riwayat tbody tr')].map(tr => tr.getAttribute('onclick'));
const teks = w => w.document.getElementById('page-riwayat').textContent;

(async () => {
  console.log('\n== Buka tab Riwayat: SATU halaman, 10 baris ==');
  await aman('blok buka', async () => {
    const { w, riw } = buka();
    await keRiwayat(w);
    sama('satu panggilan riwayat', riw.length, 1);
    sama('halaman 1, per 10', [riw[0] && riw[0].hal, riw[0] && riw[0].per], ['1', '10']);
    sama('10 baris digambar', barisTabel(w).length, 10);
    cek('baris teratas = tanggal terbaru (r01)', (barisTabel(w)[0] || '').indexOf("'r01'") > -1, barisTabel(w)[0]);
    cek('total arsip 23 (reservasi besok tidak ikut)', /1–10 dari 23/.test(teks(w)), teks(w).slice(0, 400));

    console.log('\n== Pindah halaman: satu panggilan hal=2 ==');
    riw.length = 0; w.eval('riwHal(2)'); await tunggu(100);
    sama('satu panggilan', riw.length, 1);
    sama('hal=2', riw[0] && riw[0].hal, '2');
    cek('baris halaman 2 mulai r11', (barisTabel(w)[0] || '').indexOf("'r11'") > -1, barisTabel(w)[0]);
    cek('info 11–20 dari 23', /11–20 dari 23/.test(teks(w)));

    console.log('\n== Render ulang tanpa perubahan TIDAK menembak lagi ==');
    riw.length = 0; w.eval('renderRiwayat(); renderRiwayat(); renderRiwayat();'); await tunggu(100);
    sama('nol panggilan', riw.length, 0);

    console.log('\n== Halaman terakhir berisi 3 baris ==');
    w.eval('riwHal(3)'); await tunggu(100);
    sama('3 baris', barisTabel(w).length, 3);

    console.log('\n== Ganti saringan: kembali ke halaman 1 ==');
    riw.length = 0; w.eval('HIST_F.status="No-show"; renderRiwayat()'); await tunggu(100);
    sama('hal=1 & status dikirim', [riw[0] && riw[0].hal, riw[0] && riw[0].status], ['1', 'No-show']);
    sama('4 baris No-show', barisTabel(w).length, 4);
    w.eval('HIST_F.status=""; renderRiwayat()'); await tunggu(100);

    console.log('\n== Ukuran halaman 25 ==');
    riw.length = 0; w.eval('riwPer(25)'); await tunggu(100);
    sama('per=25 hal=1', [riw[0] && riw[0].per, riw[0] && riw[0].hal], ['25', '1']);
    sama('23 baris', barisTabel(w).length, 23);
    w.eval('riwPer(10)'); await tunggu(100);

    console.log('\n== Cari: ditunda, satu panggilan untuk ketikan beruntun ==');
    riw.length = 0;
    w.eval('riwCari("b"); riwCari("bu"); riwCari("bud");'); await tunggu(500);
    sama('satu panggilan', riw.length, 1);
    sama('kata kunci terakhir', riw[0] && riw[0].q, 'bud');
    sama('satu baris Budi', barisTabel(w).length, 1);
    cek('kotak cari tetap fokus', w.document.activeElement && w.document.activeElement.id === 'histSearch');
    w.eval('HIST_F.q=""; renderRiwayat()'); await tunggu(100);

    console.log('\n== Klik baris membuka detail ==');
    let dibuka = null;
    w.openDetail = id => { dibuka = id; };
    w.eval('openDetail = window.openDetail; riwBuka("r03")');
    sama('openDetail dipanggil untuk r03', dibuka, 'r03');

    console.log('\n== Ekspor meminta SELURUH id yang cocok ==');
    let dieks = null;
    w.eval('exportCSV = ids => { window.__eks = ids; }');
    riw.length = 0; await w.eval('riwEkspor()'); await tunggu(50); dieks = w.__eks;
    sama('ekspor=1 dikirim', riw[0] && riw[0].ekspor, '1');
    sama('23 id', dieks && dieks.length, 23);
  });

  console.log('\n== Versi berubah (ada yang menyimpan) → halaman ditarik ulang ==');
  await aman('blok versi', async () => {
    const { w, riw } = buka();
    await keRiwayat(w);
    riw.length = 0;
    w.eval('VER_TAMPIL="999"; renderRiwayat()'); await tunggu(100);
    sama('satu panggilan baru', riw.length, 1);
  });

  console.log('\n== Jawaban basi dibuang ==');
  await aman('blok basi', async () => {
    const { w, riw, srv } = buka();
    await keRiwayat(w);
    srv.lambat = 150;
    w.eval('riwHal(2)'); await tunggu(20);
    srv.lambat = 0;
    w.eval('riwHal(3)'); await tunggu(400);
    sama('yang tampil halaman 3 (3 baris)', barisTabel(w).length, 3);
    sama('RIW.hal = 3', w.eval('RIW.hal'), 3);
  });

  console.log('\n== Gagal: tidak berputar, tombol Coba lagi ==');
  await aman('blok gagal', async () => {
    const { w, riw, srv } = buka({ gagal: true });
    await keRiwayat(w);
    const n = riw.length;
    w.eval('renderRiwayat(); renderRiwayat();'); await tunggu(150);
    sama('tidak menembak lagi sesudah gagal', riw.length, n);
    cek('sebabnya disebut', /SQLSTATE mati/.test(teks(w)));
    cek('ada tombol Coba lagi', !!w.document.querySelector('#page-riwayat button[onclick="riwCobaLagi()"]'));
    srv.gagalRiwayat = false;
    w.eval('riwCobaLagi()'); await tunggu(120);
    sama('sesudah Coba lagi: 10 baris', barisTabel(w).length, 10);
  });

  console.log('\n== Server lama → cara lokal, tidak kosong ==');
  await aman('blok server lama', async () => {
    const { w, riw } = buka({ serverLama: true });
    await keRiwayat(w);
    cek('RIW_TAK_ADA menyala', w.eval('RIW_TAK_ADA') === true);
    cek('tabel tetap terisi (cara lokal)', barisTabel(w).length > 0, barisTabel(w).length);
    cek('cara lokal juga 23 arsip', /Arsip\s*23/.test(teks(w)));
    const n = riw.length;
    w.eval('renderRiwayat()'); await tunggu(80);
    sama('tidak menanyakan riwayat lagi', riw.length, n);
  });

  console.log('\n== Kontrak PHP riwayat_hal() ==');
  const LIB = fs.readFileSync(path.join(ROOT, 'reservasi-mysql/lib_reservasi_mysql.php'), 'utf8').replace(/\r\n/g, '\n');
  const API = fs.readFileSync(path.join(ROOT, 'reservasi-mysql/api.php'), 'utf8').replace(/\r\n/g, '\n');
  if (PHP_MOD) {
    const E = PHP_MOD.Engine || PHP_MOD, par = new E({ parser: { php8: true, suppressErrors: false }, ast: {} });
    for (const [n, s] of [['lib', LIB], ['api', API]]) { let e = null; try { par.parseCode(s, n); } catch (x) { e = x; } cek('parse ' + n, !e, e && e.message); }
  } else console.log('  LEWAT parse (php-parser tidak ada)');
  const i = LIB.indexOf('function riwayat_hal('); const B = i > -1 ? LIB.slice(i, LIB.indexOf('/* ==================== DIAGNOSTIK', i)) : '';
  cek('riwayat_hal ada', !!B);
  cek('arsip = lampau ATAU No-show/Cancelled (+ tanggal kosong)', B.indexOf("(tanggal IS NULL OR tanggal < :hari OR status IN ('No-show','Cancelled'))") > -1);
  cek('per dijepit 1..100', /if \(\$per > 100\) \$per = 100;/.test(B));
  cek('urut terbaru dulu + id supaya stabil', (B.match(/ORDER BY tanggal DESC, jam DESC, id DESC/g) || []).length === 2);
  cek('LIMIT/OFFSET di-cast int', /LIMIT ' \. \(int\)\$per \. ' OFFSET ' \. \(int\)\$mulai/.test(B));
  cek('kata kunci: dua penanda berbeda (EMULATE off)', B.indexOf('LOWER(name) LIKE :q1 OR phone LIKE :q2') > -1);
  cek('wildcard LIKE di-escape', B.indexOf("'%' => '\\\\%'") > -1 && B.indexOf("'_' => '\\\\_'") > -1);
  cek('bulan: batas atas eksklusif bulan berikutnya', B.indexOf("tanggal < :bsampai") > -1 && B.indexOf("+1 month") > -1);
  cek('status hanya dari daftar tertutup', B.indexOf("in_array($status, array('Datang', 'No-show', 'Cancelled'), true)") > -1);
  cek('hanya membaca (tanpa INSERT/UPDATE/DELETE)', !/\b(INSERT|UPDATE|DELETE)\b/.test(B.replace(/\/\*[\s\S]*?\*\//g, '')));
  cek("api.php punya aksi 'riwayat'", /\$action === 'riwayat'[\s\S]{0,200}riwayat_hal\(\$_GET\)/.test(API));

  console.log(`\nLULUS ${ok}   GAGAL ${gagal}`);
  process.exit(gagal ? 1 : 0);
})();
