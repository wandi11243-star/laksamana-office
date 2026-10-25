/* Uji "Cek Google" di Google Review modul Service Excellent (25 Okt 2026).
   Fungsinya DIPOTONG dari sumber lalu dijalankan — modul itu memuat
   venue-layouts.js dan boot-nya gagal di jsdom (pola uji-reward-se.js).
   Sisi PHP dijaga sebagai kontrak atas sumbernya + php-parser.
     node tools/uji-cek-google-se.js */
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'deploy/service_excellent/index.html'), 'utf8').replace(/\r\n/g, '\n');
let lulus = 0, gagal = 0;
const ok = (c, m) => { if (c) { lulus++; console.log('  OK   ' + m); } else { gagal++; console.log('  GAGAL ' + m); } };

const a = SRC.indexOf('/* ===================== CEK KE GOOGLE REVIEW');
const b = SRC.indexOf('function verifyReview(id){');
const v2 = SRC.indexOf('function rejectReview(id){');
ok(a > 0 && b > a && v2 > b, 'blok Cek Google & verifyReview ditemukan');
const blok = SRC.slice(a, v2);

const REV = [];
const SES = { name: 'Manager A', role: 'manager' };
const env = { toast: (m, t) => env.toasts.push([m, t]), toasts: [], conf: [], confirmJawab: true, simpan: 0 };
const fn = new Function('reviews', 'esc', 'fmtDateShort', 'byId', 'document', 'localStorage', 'fetch', 'reviewRange',
  'toast', 'confirm', 'CAN', 'SESSION', 'logAudit', 'saveState', 'renderReview',
  blok + '\nreturn {rvgCocok, rvgSel, rvgPita, rvgWib, rvgNorm, rvgMuat, rvgCek, verifyReview, get RVG(){return RVG;}, set RVG(v){RVG=v;}};');
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const POST = [];
let jawabFetch = null;
const M = fn(() => REV, esc, s => s, () => null, { querySelectorAll: () => [] },
  { getItem: () => JSON.stringify({ token: 'TOK' }) },
  (u, o) => { POST.push([u, JSON.parse(o.body)]); return Promise.resolve({ text: () => Promise.resolve(JSON.stringify(jawabFetch)) }); },
  () => ({ from: '2026-10-01', to: '2026-10-31' }),
  env.toast, m => { env.conf.push(m); return env.confirmJawab; }, { master: () => true }, SES,
  () => {}, () => { env.simpan++; }, () => {});

// WIB: 10 Okt 2026 20:00 WIB = 13:00 UTC
const ms = (ymd, jam) => Date.parse(ymd + 'T' + (jam || '13:00') + ':00Z');
ok(M.rvgWib(Date.parse('2026-10-10T17:30:00Z')) === '2026-10-11', 'tanggal WIB: 17:30 UTC = 00:30 WIB tanggal berikutnya');
ok(M.rvgNorm('  Budi  SANTOSO!! ') === 'budi santoso', 'nama dinormalkan');

(async () => {
  // ---- gerbang admin ----
  M.rvgCek(); M.rvgMuat();
  ok(POST.length === 0, 'bukan admin: tidak menarik data sama sekali (fungsinya menolak, bukan cuma tombolnya)');
  ok(env.toasts.some(t => /hanya untuk admin/.test(t[0])), 'bukan admin: rvgCek menolak dengan pesan');
  ok(M.rvgPita() === '', 'bukan admin: pita & tombol tidak digambar');
  SES.role = 'admin';
  ok(/rvgCek\(\)/.test(M.rvgPita()) && /Cek ke Google/.test(M.rvgPita()), 'admin: tombol Cek ke Google tampil');
  ok(/belum dicek/.test(M.rvgSel({ id: 'q', status: 'diklaim', reviewerName: 'Budi' })), 'sebelum ditekan: "belum dicek"');
  // ---- muat ----
  jawabFetch = { ok: true, data: { review: [
    { id: 'g1', sumber: 'bp', penulis: 'Budi Santoso', rating: 5, waktu_ms: ms('2026-10-11') },
    { id: 'g2', sumber: 'bp', penulis: 'Rina Wijaya Kusuma', rating: 4, waktu_ms: ms('2026-10-12') },
    { id: 'g3', sumber: 'bp', penulis: 'Andi Lama', rating: 5, waktu_ms: ms('2026-09-01') },
    { id: 'g4', sumber: 'bp', penulis: 'Siti', rating: 3, waktu_ms: ms('2026-10-05') }
  ], sumber: ['bp'], syncAt: Date.now() } };
  M.rvgCek();
  ok(POST.length === 1 && POST[0][1].action === 'campaignGoogleCocok' && POST[0][1].sesi === 'TOK', 'memanggil campaignGoogleCocok membawa token sesi');
  ok(POST[0][1].data.dari === '2026-09-28' && POST[0][1].data.sampai === '2026-11-14', 'jendela tarik: rentang -3 hari s.d. +14 hari');
  ok(/memeriksa/.test(M.rvgSel({ id: 'x', status: 'diklaim', reviewerName: 'Budi' })), 'selama memuat: "memeriksa…", bukan "tidak ditemukan"');
  M.rvgMuat();
  ok(POST.length === 1, 'tidak menarik dua kali selama masih memuat');
  await new Promise(r => setTimeout(r, 10));
  M.rvgMuat();
  ok(POST.length === 1, 'rentang yang sama tidak ditarik ulang');

  const rv1 = { id: 'r1', status: 'diklaim', reviewerName: 'budi santoso', date: '2026-10-10', name: 'Budi' };
  const rv2 = { id: 'r2', status: 'diklaim', reviewerName: 'Rina Wijaya', date: '2026-10-10', name: 'Rina' };
  const rv3 = { id: 'r3', status: 'diklaim', reviewerName: 'Andi Lama', date: '2026-10-20', name: 'Andi' };
  const rv4 = { id: 'r4', status: 'diklaim', reviewerName: 'Sit', date: '2026-10-05', name: 'Sit' };
  REV.push(rv1, rv2, rv3, rv4);
  let c = M.rvgCocok(rv1);
  ok(c.jenis === 'cocok' && c.g.id === 'g1', 'nama sama persis (beda huruf besar) -> cocok');
  c = M.rvgCocok(rv2);
  ok(c.jenis === 'mirip' && c.g.id === 'g2', 'nama sebagian -> mirip, bukan cocok');
  ok(M.rvgCocok(rv3).jenis === 'tidak', 'ulasan di luar jendela tanggal tidak dipakai');
  ok(M.rvgCocok(rv4).jenis === 'tidak', 'nama pendek (<3 huruf token) tidak dicocokkan sebagian');
  ok(/Ada di Google/.test(M.rvgSel(rv1)), 'sel: Ada di Google');
  ok(/Nama mirip/.test(M.rvgSel(rv2)), 'sel: Nama mirip');
  ok(/tidak ditemukan/.test(M.rvgSel(rv3)), 'sel: tidak ditemukan');
  ok(M.rvgSel({ id: 'z', status: 'diminta' }) === '<span class="muted">-</span>', 'status diminta tidak dicek');
  ok(/saran/.test(M.rvgPita()) && !/Places API/.test(M.rvgPita()), 'pita menyebut ini saran; sumber Business Profile tanpa catatan Places');

  // ---- verifikasi tetap ditekan manusia ----
  rv1.proof2Data = 'x';
  env.confirmJawab = false; M.verifyReview('r1');
  ok(rv1.status === 'diklaim' && env.simpan === 0, 'konfirmasi dibatalkan -> TIDAK terverifikasi (tidak otomatis)');
  ok(/Ditemukan di Google: Budi Santoso, 5/.test(env.conf[0]), 'konfirmasi menyebut hasil cek Google');
  env.confirmJawab = true; M.verifyReview('r1');
  ok(rv1.status === 'terverifikasi' && rv1.googleReviewId === 'g1' && rv1.googleRating === 5, 'diverifikasi manual -> ulasan Google dicatat');
  rv2.proof2Data = 'x'; M.verifyReview('r2');
  ok(rv2.status === 'terverifikasi' && !rv2.googleReviewId, 'yang cuma mirip tidak mencatat id ulasan');
  ok(/NAMA MIRIP/.test(env.conf[env.conf.length - 1]), 'konfirmasi untuk yang mirip memperingatkan');
  // klaim kedua memakai ulasan yang sama
  const rv5 = { id: 'r5', status: 'diklaim', reviewerName: 'Budi Santoso', date: '2026-10-11', name: 'Budi Lagi', proof2Data: 'x' };
  REV.push(rv5);
  c = M.rvgCocok(rv5);
  ok(c.dipakai && c.dipakai.id === 'r1', 'ulasan yang sudah jadi bukti klaim lain ditandai');
  ok(/sudah dipakai klaim/.test(M.rvgSel(rv5)), 'sel menyebut ulasannya sudah dipakai');
  env.confirmJawab = false; M.verifyReview('r5');
  ok(/sudah dipakai klaim Budi/.test(env.conf[env.conf.length - 1]), 'konfirmasi memperingatkan ulasan dipakai dua kali');
  // foto 2 tetap wajib
  const rv6 = { id: 'r6', status: 'diklaim', reviewerName: 'Budi Santoso', date: '2026-10-11', name: 'x' };
  REV.push(rv6); const nConf = env.conf.length; M.verifyReview('r6');
  ok(env.conf.length === nConf && rv6.status === 'diklaim', 'aturan Foto 2 wajib tidak dilonggarkan');

  // ---- galat & sumber Places ----
  M.RVG = { kunci: '', memuat: false, data: null, galat: '' };
  jawabFetch = { ok: false, error: 'tanpa_modul: Akun Anda belum diberi akses modul ini.' };
  M.rvgMuat(); await new Promise(r => setTimeout(r, 10));
  ok(/tidak terbaca/.test(M.rvgPita()) && /belum diberi akses/.test(M.rvgPita()) && !/tanpa_modul/.test(M.rvgPita()), 'galat disebut sebabnya, tanpa kode mentah');
  ok(/tidak bisa dicek/.test(M.rvgSel(rv3)), 'galat: sel berbunyi tidak bisa dicek, bukan tidak ditemukan');
  const nPost = POST.length; M.rvgMuat();
  ok(POST.length === nPost, 'kegagalan dicatat di kuncinya (tidak berputar)');
  M.RVG = { kunci: '2026-09-28|2026-11-14', memuat: false, data: { review: [], sumber: ['places'], syncAt: 0 }, galat: '' };
  ok(/Places API/.test(M.rvgPita()), 'data hanya dari Places: dikatakan "tidak ditemukan" lemah');

  // ---- tabel ----
  ok(SRC.includes('${rvgBoleh()?"<th>Cek Google</th>":""}') && SRC.includes('${rvgBoleh()?`<td data-rvg="${x.id}">${rvgSel(x)}</td>`:""}'), 'kolom Cek Google hanya digambar untuk admin');
  ok(!SRC.includes('+ reviewGoogleView();\n  rvgMuat();'), 'render TIDAK memuat sendiri — lewat tombol');
  ok(/id="rvg-pita"/.test(SRC), 'pita penjelasan ada di atas daftar');

  // ---- PHP ----
  const LC = fs.readFileSync(path.join(ROOT, 'konten-mysql/lib_campaign.php'), 'utf8');
  const LG = fs.readFileSync(path.join(ROOT, 'konten-mysql/lib_greview.php'), 'utf8');
  const iC = LC.indexOf("$action === 'campaignGoogleCocok'"), iGate = LC.indexOf("if (!sesi_punya_modul($u, 'campaign')) sesi_tolak_tanpa_modul('Campaign');");
  ok(iC > 0 && iGate > iC, 'campaignGoogleCocok ditangani SEBELUM gerbang kunci Campaign');
  ok(LC.indexOf("sesi_punya_modul($u, 'service_excellent')") > 0, 'pintunya untuk pemegang kunci service_excellent');
  ok(LC.indexOf('if (!$u) sesi_tolak_tak_dikenal();') < iC, 'tetap berpagar sesi');
  const g = LG.slice(LG.indexOf('function gr_cocok'), LG.indexOf('/* ==================== BALAS'));
  ok(g.length > 100 && !/balasan|tangani|UPDATE|DELETE|INSERT/i.test(g.replace(/\/\*[\s\S]*?\*\//g, '')), 'gr_cocok cuma MEMBACA dan tidak memulangkan balasan/penanganan');
  ok(/- 7 \* 3600/.test(g), 'batas rentang dihitung WIB');
  try {
    let P; try { P = require(path.join(ROOT, 'node_modules/php-parser')); } catch (e) { P = require(process.env.PHP_PARSER_PATH); }
    const p = new P({ parser: { php8: true, suppressErrors: false } });
    p.parseCode(LC, 'lib_campaign.php'); p.parseCode(LG, 'lib_greview.php');
    ok(true, 'sintaks PHP sah');
  } catch (e) { ok(false, 'sintaks PHP: ' + e.message); }

  console.log(`\n${lulus} lulus, ${gagal} gagal`);
  process.exit(gagal ? 1 : 0);
})();
