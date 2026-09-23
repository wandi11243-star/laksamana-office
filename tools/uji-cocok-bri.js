/* ============================================================
   UJI — PENCOCOKAN DANA QRIS BRI  (19 September 2026)
   revisi 21 September 2026: unggah Excel dicabut, bukti bayar bisa dilihat,
   baris bisa ditandai tidak valid, metode bayar bisa dibetulkan dari sini.
   ------------------------------------------------------------
   node tools/uji-cocok-bri.js

   TIGA LAPIS, dan ketiganya perlu:

     1. MESIN BERDIRI SENDIRI (tanpa jsdom). deploy/assets/cocok-bri.js
        dijalankan lewat new Function('window','document', …) dengan document
        tiruan — kalau ia butuh satu pun nama global tuan rumah, blok pertama
        yang berbunyi. Pola yang sama dengan uji-performa-konten.js.

     2. HALAMANNYA DIJALANKAN di jsdom, menghadap SERVER TIRUAN YANG HIDUP:
        apa yang ditulis briAbai dipulangkan briList berikutnya, dan apa yang
        ditulis saveAll dipulangkan getAll berikutnya. Server tiruan yang
        cuma mengangguk tidak pernah bisa membuktikan satu putaran penuh —
        dan justru putaran penuh itu yang membedakan "tersimpan" dari
        "dilaporkan tersimpan".

     3. KONTRAK SISI PHP. Tidak ada php di mesin pengembangan, jadi
        kompas-mysql diperiksa dua cara: sintaksnya lewat php-parser (satu
        parse error mematikan SELURUH endpoint folder itu) dan aturannya
        sebagai kontrak atas SUMBERNYA. Keduanya BUKAN pengganti menjalankan
        PHP-nya, dan itu dikatakan di sini supaya yang membaca hasil hijau
        tahu persis apa yang sudah diuji. Pola uji-simpan-basi.js.

   YANG SUDAH TIDAK DIUJI DI SINI, dan sebabnya: seluruh pengurai lembar
   Excel (cbTgl, cbJam, cbCariKepala, cbUraiLembar) DICABUT 21 September 2026
   bersama jalur unggahnya. Asersinya ikut dicabut, diganti asersi bahwa
   ketiadaannya memang utuh — fungsi yang tidak dipanggil siapa pun akan
   dipanggil lagi suatu hari oleh orang yang mengira ia masih berarti
   sesuatu.
   ============================================================ */
'use strict';
const fs = require('fs');
const path = require('path');

const AKAR = path.resolve(__dirname, '..');
let ok = 0, gagal = 0, lewat = 0;
function T(nama, syarat, ket) {
  if (syarat) { ok++; return; }
  gagal++;
  console.log('  GAGAL  ' + nama + (ket ? '  (' + ket + ')' : ''));
}
function L(nama, sebab) { lewat++; console.log('  LEWAT  ' + nama + '  (' + sebab + ')'); }
/* Blok yang bisa melempar DIBUNGKUS: asersi yang melempar membunuh seluruh
   suite, dan mutasinya lalu terbaca "uji tidak selesai" — bukan
   "tertangkap". Bentuk yang sudah lima kali menggigit di repo ini. */
function aman(nama, fn) {
  try { fn(); } catch (e) { gagal++; console.log('  GAGAL  ' + nama + '  (melempar: ' + e.message + ')'); }
}
async function amanAsync(nama, fn) {
  try { await fn(); } catch (e) { gagal++; console.log('  GAGAL  ' + nama + '  (melempar: ' + e.message + ')'); }
}
const tidur = ms => new Promise(r => setTimeout(r, ms));

const srcCb = fs.readFileSync(path.join(AKAR, 'deploy/assets/cocok-bri.js'), 'utf8');
/* KOMENTAR DIBUANG DULU sebelum memindai pemakaian. Kepala berkas ini
   menyebut nama-nama yang DICABUT justru untuk menjelaskan kenapa ia
   dicabut, dan sejarah memang harus boleh menyebutnya — yang dilarang
   PEMAKAIANNYA. Pemindai yang merah untuk komentar akan dimatikan orang
   berikutnya. Pelajaran uji-tanpa-target.js. */
function tanpaKomentar(s) {
  return s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}
const kodeCb = tanpaKomentar(srcCb);

/* ============ 1. MESIN BERDIRI SENDIRI ============ */
console.log('\n[1] Mesin dijalankan tanpa tuan rumah');
const G = {};
const docPalsu = { head: null, activeElement: null,
  querySelector: () => null, querySelectorAll: () => [], getElementById: () => null,
  createElement: () => ({ style: {}, appendChild() {} }) };
aman('cocok-bri.js jalan berdiri sendiri', () => {
  new Function('window', 'document', srcCb)(G, docPalsu);
});
T('cbUsulan & cbNamaCocok diekspor',
  typeof G.cbUsulan === 'function' && typeof G.cbNamaCocok === 'function');
T('cbTglID tetap ada (dipakai seluruh layar)', typeof G.cbTglID === 'function');

/* ---- JALUR UNGGAH BENAR-BENAR DICABUT ----
   Yang dijaga KETIADAAN PEMAKAIANNYA, bukan ketiadaan katanya: satu
   pemanggilan yang tertinggal untuk fungsi yang sudah dibuang adalah
   ReferenceError, dan gejalanya layar putih tanpa satu kata pun yang
   menyebut sebabnya. */
console.log('\n[2] Unggah mutasi bank dari Excel sudah dicabut');
for (const n of ['cbTgl', 'cbJam', 'cbCariKepala', 'cbUraiLembar', 'cbPilihBerkas',
                 'cbPilihLembar', 'cbBacaTempel', 'cbKetikTempel', 'cbSimpanUnggah',
                 'cbBatalPratinjau']) {
  T('G.' + n + ' tidak ada lagi', typeof G[n] === 'undefined', typeof G[n]);
}
T('KOL_CARI / petaKolom tidak ada lagi di sumbernya',
  kodeCb.indexOf('KOL_CARI') < 0 && kodeCb.indexOf('petaKolom') < 0);
/* KETERGANTUNGAN PADA xlsx-baca.js IKUT DICABUT. Kalau pemanggilannya
   tertinggal, halaman ini mati di modul yang sudah berhenti memuat asetnya
   — dan kedua tuan rumah memang berhenti memuatnya di tanggal yang sama. */
T('tidak memanggil bacaBerkasLembar lagi', kodeCb.indexOf('bacaBerkasLembar') < 0);
/* DIJEPIT KE BENTUK YANG BENAR-BENAR DICARI. Pemindai 'cb-ta' yang
   telanjang juga cocok dengan 'cb-tabel' — id wadah tabel yang justru baru
   dipasang hari itu — jadi ia merah untuk kode yang benar. */
T('tombol unggah & kotak tempel hilang dari layar',
  kodeCb.indexOf('type="file"') < 0 && kodeCb.indexOf('<textarea') < 0
  && kodeCb.indexOf('<details') < 0);
/* BARIS HASIL UNGGAH YANG SUDAH TERSIMPAN TETAP DIBACA DAN TETAP BISA
   DICOCOKKAN. Yang dicabut cara memasukkannya, bukan barisnya — uang yang
   sudah tercatat tidak boleh hilang dari layar gara-gara satu tombol
   dicabut. */
T('mesin pencocokan (BABAK/cbUsulan) TETAP ada',
  kodeCb.indexOf('const BABAK') >= 0 && kodeCb.indexOf('G.cbUsulan') >= 0);
T('panel pencocokan baris mutasi TETAP ada', kodeCb.indexOf('function panelCocok') >= 0);

/* ---- nama ---- */
console.log('\n[3] Membaca & mencocokkan nama');
T('"Reservasi : Arlanda" -> Arlanda', G.cbNamaDari('Reservasi : Arlanda') === 'Arlanda');
T('"Reservasi: Laura" -> Laura', G.cbNamaDari('Reservasi: Laura') === 'Laura');
T('tanpa titik dua dipakai utuh', G.cbNamaDari('PT. Ibra Harisindo') === 'PT. Ibra Harisindo');
T('keterangan kosong -> nama kosong', G.cbNamaDari('') === '' && G.cbNamaDari('   ') === '');
T('beda huruf besar-kecil tetap cocok', G.cbNamaCocok('Arlanda', 'arlanda'));
T('sebagian nama panjang cocok', G.cbNamaCocok('Sri Rahmadani', 'Sri Rahmadani Putri'));
/* NAMA PENDEK WAJIB SAMA PERSIS. Dibiarkan sebagai substring, "Ika" cocok ke
   Rika / Ikang / Marika — dan pencocokan yang salah di sini memindahkan uang
   orang ke reservasi orang lain. */
T('nama pendek TIDAK cocok sebagai potongan', !G.cbNamaCocok('Ika', 'Rika'));
T('nama pendek cocok kalau sama persis', G.cbNamaCocok('Ika', 'ika'));
T('nama kosong tidak pernah cocok', !G.cbNamaCocok('', 'Arlanda') && !G.cbNamaCocok('Arlanda', ''));
T('tanggal ISO -> "5 Sep 2026"', G.cbTglID('2026-09-05') === '5 Sep 2026', G.cbTglID('2026-09-05'));

/* ---- jam selalu 24 jam WIB (21 September 2026) ---- */
console.log('\n[3b] Jam dibakukan ke 24 jam WIB');
const jam = (a, b) => T('jam ' + JSON.stringify(a) + ' -> ' + JSON.stringify(b),
  G.cbJamWIB(a) === b, JSON.stringify(G.cbJamWIB(a)));
jam('07:30 PM', '19:30');
jam('7.30 pm', '19:30');
jam('11:59 PM', '23:59');
/* TENGAH MALAM & TENGAH HARI adalah dua titik yang paling sering salah:
   12 AM = 00, 12 PM = 12 — bukan sebaliknya, dan bukan 12/24. */
jam('12:00 AM', '00:00');
jam('12:05 PM', '12:05');
jam('19:30:00', '19:30');
jam('08:15:00', '08:15');
jam('09:05', '09:05');
jam('', '');
/* "13:00 PM" BUKAN meridiem yang sah — dibaca sebagai PM ia memberi jam 25.
   Dan "10:31 Pembayaran" tidak boleh terbaca sebagai PM. */
jam('13:00 PM', '13:00');
/* JEPITAN 1..12 BARU KELIHATAN DI SINI, dan mutasi yang mencabutnya LOLOS
   tanpa asersi ini: untuk "13:00 PM" jepitan dan %12 memberi hasil yang SAMA
   (13%12=1, +12=13). Yang membedakannya jam dua digit ber-AM — tanpa
   jepitan, "15:00 AM" jadi 03:00, yaitu jam yang tidak pernah tertulis di
   struk mana pun. */
jam('15:00 AM', '15:00');
jam('10:31 Pembayaran', '10:31');
/* YANG TIDAK TERBACA DIPULANGKAN APA ADANYA, bukan dikosongkan: bentuk yang
   belum pernah kita lihat lebih baik tampil aneh daripada lenyap dari layar
   tanpa satu pun tanda. */
jam('7:5 PM', '7:5 PM');

/* ---- HULUNYA: OCR modul Reservasi ----
   Jam di halaman ini dibaca dari tfTime, yang diisi ocrTime() -> timeIn() di
   deploy/reservasi/index.html. Sampai 21 September 2026 tidak satu pun pola di
   sana melihat meridiemnya: struk "07:30 PM" tersimpan sebagai "07:30", dan
   transfer jam setengah delapan MALAM tercatat setengah delapan PAGI — tanpa
   satu pun galat. Dikonversi di hilir saja, yang tersimpan tetap salah.

   FUNGSINYA DIPOTONG DARI SUMBER lalu dijalankan, bukan ditulis ulang di
   sini: uji yang memegang salinan aturannya sendiri tetap hijau kalau yang
   asli diubah. */
const srcRsv = fs.readFileSync(path.join(AKAR, 'deploy/reservasi/index.html'), 'utf8');
function potong(src, nama) {
  const i = src.indexOf('function ' + nama + '(');
  if (i < 0) return '';
  const j = src.indexOf('\nfunction ', i + 1);
  return src.slice(i, j < 0 ? src.length : j);
}
let timeIn = null;
aman('timeIn() dipotong dari modul Reservasi', () => {
  timeIn = new Function(potong(srcRsv, 'pad2') + '\n' + potong(srcRsv, 'timeIn')
    + '\nreturn timeIn;')();
});
if (timeIn) {
  const ti = (a, b) => T('OCR jam ' + JSON.stringify(a) + ' -> ' + JSON.stringify(b),
    timeIn(a) === b, JSON.stringify(timeIn(a)));
  ti('21 Sep 2026, 07:30 PM', '19:30');
  ti('07:30:15 PM', '19:30:15');
  ti('12:00 AM', '00:00');
  ti('12:30 PM', '12:30');
  /* Yang SUDAH 24 jam tidak boleh ikut bergeser. */
  ti('16:55:03 WIB', '16:55:03');
  ti('15:21 WIB', '15:21');
  ti('10:31', '10:31');
  /* Kata berawalan P/A sesudah jam BUKAN meridiem. */
  ti('10:31 Pembayaran', '10:31');
  /* Lihat cbJamWIB di atas: ini satu-satunya bentuk yang membedakan jepitan
     1..12 dari %12 yang telanjang. */
  ti('15:00 AM', '15:00');
}

/* ---- usulan ---- */
console.log('\n[4] Usulan pencocokan');
const dpU = [
  { dpId: 'd1', resId: 'r1', nama: 'Arlanda', resTgl: '2026-09-02', tfTgl: '2026-09-02', nominal: 200000 },
  { dpId: 'd2', resId: 'r2', nama: 'Laura',   resTgl: '2026-09-04', tfTgl: '',           nominal: 500000 },
  { dpId: 'd3', resId: 'r3', nama: 'Winanto', resTgl: '2026-09-06', tfTgl: '2026-09-03', nominal: 750000 }
];
{
  const m = [{ id: 'm1', tgl: '2026-09-02', nominal: 200000, ket: 'Reservasi : Arlanda', booking: '2026-09-02' }];
  const u = G.cbUsulan(m, dpU);
  T('nama + tanggal bayar + nominal -> usulan PASTI',
    u.m1 && u.m1.dp.dpId === 'd1' && u.m1.babak.pasti, JSON.stringify(u.m1 && u.m1.babak));
}
{
  /* tanggal bayarnya TIDAK cocok, tapi tanggal BOOKING-nya cocok. */
  const m = [{ id: 'm2', tgl: '2026-09-01', nominal: 500000, ket: 'Reservasi : Laura', booking: '2026-09-04' }];
  const u = G.cbUsulan(m, dpU);
  T('nama + tanggal booking + nominal -> usulan PASTI',
    u.m2 && u.m2.dp.dpId === 'd2' && u.m2.babak.pasti);
}
{
  const m = [{ id: 'm3', tgl: '2026-09-09', nominal: 750000, ket: 'Reservasi : Winanto', booking: '' }];
  const u = G.cbUsulan(m, dpU);
  T('nama + nominal saja -> usulan KIRA-KIRA', u.m3 && !u.m3.babak.pasti);
}
{
  const m = [{ id: 'm4', tgl: '2026-09-02', nominal: 200000, ket: '', booking: '' }];
  const u = G.cbUsulan(m, dpU);
  T('mutasi tanpa keterangan dicocokkan lewat tanggal+nominal, dan itu KIRA-KIRA',
    u.m4 && u.m4.dp.dpId === 'd1' && !u.m4.babak.pasti);
}
{
  const m = [{ id: 'm5', tgl: '2026-09-02', nominal: 200001, ket: 'Reservasi : Arlanda', booking: '2026-09-02' }];
  T('nominal beda Rp1 TIDAK pernah dicocokkan', !G.cbUsulan(m, dpU).m5);
}
{
  const dipakai = dpU.map(d => Object.assign({}, d, { dipakai: d.dpId === 'd1' }));
  const m = [{ id: 'm6', tgl: '2026-09-02', nominal: 200000, ket: 'Reservasi : Arlanda', booking: '2026-09-02' }];
  T('DP yang sudah dipegang baris lain tidak diusulkan lagi', !G.cbUsulan(m, dipakai).m6);
}
/* ===== YANG MEMBEDAKAN SERAKAH DARI BERTINGKAT =====
   Baris tanpa keterangan berdiri LEBIH DULU dan cocok lewat babak longgar
   (tanggal+nominal); baris berikutnya cocok sampai ke NAMANYA. Pencocokan
   serakah memberikan DP-nya kepada yang pertama, dan yang kedua — yang
   sebenarnya pasti — kehabisan. */
{
  const dp = [{ dpId: 'x1', resId: 'r9', nama: 'Fenty', resTgl: '2026-09-08', tfTgl: '2026-09-08', nominal: 300000 }];
  const m = [
    { id: 'a', tgl: '2026-09-08', nominal: 300000, ket: '',                  booking: '' },
    { id: 'b', tgl: '2026-09-08', nominal: 300000, ket: 'Reservasi : Fenty', booking: '' }
  ];
  const u = G.cbUsulan(m, dp);
  T('babak PASTI menyapu seluruh baris lebih dulu (bukan serakah per baris)',
    !!u.b && !u.a, 'a=' + !!u.a + ' b=' + !!u.b);
}

/* ============ 5. HALAMANNYA DIJALANKAN (jsdom) ============ */
function cariJsdom() {
  const kandidat = [];
  if (process.env.JSDOM_PATH) kandidat.push(process.env.JSDOM_PATH);
  kandidat.push('jsdom', path.join(AKAR, 'node_modules/jsdom'));
  const home = process.env.USERPROFILE || process.env.HOME || '';
  if (home) kandidat.push(path.join(home, 'node_modules/jsdom'));
  for (const k of kandidat) { try { return require(k); } catch (e) {} }
  return null;
}

/* DP tiruan yang tiap barisnya menjawab satu pertanyaan, dan angkanya
   dipilih supaya tiap kesalahan memberi hasil yang BERBEDA.

   BUKTINYA TIGA BENTUK, dan ketiganya harus ada: penanda "@f:" (bentuk
   sekarang, wajib diunduh), data URI inline (reservasi lama, tidak boleh
   memicu unduhan sama sekali), dan TIDAK ADA bukti (keterangan tersendiri —
   justru baris itulah yang paling perlu diperiksa). */
const DP_AWAL = () => [
  /* tfTime-nya sengaja BER-PM. Jamnya sama persis dengan 19:30:00, jadi tidak
     satu pun ekspektasi lain bergeser — tapi pembakuan jamnya jadi punya
     tempat untuk gagal: dibaca apa adanya (potong 5 huruf) ia berbunyi 07:30
     dan MELOMPAT ke atas 08:15 di urutan waktu. Tanpa baris seperti ini,
     mutasi yang mencabut cbJamWIB() dari penyusun baris tidak menggeser satu
     angka pun dan LOLOS bersih. */
  { id: 'p2', amount: 250000, method: 'QRIS',         tfDate: '2026-09-05', tfTime: '07:30:00 PM', tfBank: 'DANA',
    proofData: '@f:k2', proofName: 'bukti-arlanda.jpg' },
  { id: 'p1', amount: 300000, method: 'QRIS',         tfDate: '2026-09-05', tfTime: '08:15:00', tfBank: 'Mandiri',
    proofData: 'data:image/png;base64,AAAA', proofName: 'lama.png' },
  { id: 'p3', amount: 175000, method: 'QRIS',         tfDate: '',           tfTime: '',         tfBank: '' },
  { id: 'p4', amount: 900000, method: 'Transfer UOB', tfDate: '2026-09-06', tfTime: '10:00:00', tfBank: 'BRI' },
  { id: 'p5', amount: 800000, method: 'Transfer BCA', tfDate: '2026-09-07', tfTime: '11:00:00', tfBank: 'BRI',
    proofData: '@f:k5', proofName: 'struk-dewi.pdf' }
];
function rsvAwal() {
  const d = DP_AWAL();
  return [
    { id: 'r1', name: 'Arlanda', date: '2026-09-06', updatedAt: 1000, dps: [d[0], d[1]] },
    { id: 'r2', name: 'Bagas',   date: '2026-09-09', updatedAt: 1000, dps: [d[2]] },
    { id: 'r3', name: 'Citra',   date: '2026-09-08', updatedAt: 1000, dps: [d[3]] },
    { id: 'r4', name: 'Dewi',    date: '2026-09-10', updatedAt: 1000, dps: [d[4]] }
  ];
}
/* 'Transfer UOB' SENGAJA TIDAK ADA di daftar ini — itulah yang membuat
   keadaan "(lama)" punya tempat untuk gagal. Nilai tersimpan yang sudah
   tidak ada di daftar WAJIB tetap digambar; kalau tidak, membuka panelnya
   diam-diam menggantinya ke pilihan pertama begitu Simpan ditekan. */
const METODE_UJI = ['QRIS', 'Transfer BRI', 'Transfer BCA', 'Cash'];

const MUT_UJI = [
  { id: 'b1', tgl: '2026-09-05', jam: '12:00', nominal: 425000, ket: '', settle: '', booking: '',
    resId: '', dpId: '', resNama: '', resTgl: '', cara: '', catatan: '', sumber: 'unggah',
    cocokOleh: '', cocokAt: 0, oleh: 'Rani', olehId: 'u1', dibuat: 1, diubah: 1, diubahOleh: '',
    batalAt: 0, batalOleh: '', batalAlasan: '' },
  { id: 'b2', tgl: '2026-09-04', jam: '09:00', nominal: 5000000, ket: 'Event corporate PT Ibra',
    settle: '', booking: '', resId: '', dpId: '', resNama: '', resTgl: '', cara: 'bukan',
    catatan: 'Event corporate PT Ibra', sumber: 'manual', cocokOleh: 'Rani', cocokAt: 2,
    oleh: 'Rani', olehId: 'u1', dibuat: 2, diubah: 2, diubahOleh: '',
    batalAt: 0, batalOleh: '', batalAlasan: '' },
  /* SUDAH dicocokkan ke p1 (DP Arlanda Rp300.000). Tanpa baris seperti ini,
     dua aturan tidak punya tempat untuk gagal: DP yang sudah diwakili baris
     mutasi TIDAK boleh digambar dua kali, dan baris mutasi yang sudah cocok
     WAJIB ikut dihitung sebagai "dari reservasi". */
  { id: 'b3', tgl: '2026-09-05', jam: '08:15', nominal: 300000, ket: 'Reservasi : Arlanda',
    settle: '', booking: '', resId: 'r1', dpId: 'p1', resNama: 'Arlanda', resTgl: '2026-09-06',
    cara: 'cocok', catatan: '', sumber: 'unggah', cocokOleh: 'Rani', cocokAt: 3,
    oleh: 'Rani', olehId: 'u1', dibuat: 3, diubah: 3, diubahOleh: '',
    batalAt: 0, batalOleh: '', batalAlasan: '' }
];

/* ===== SERVER TIRUAN YANG HIDUP =====
   Apa yang ditulis dipulangkan pembacaan berikutnya. Server yang cuma
   mengangguk tidak pernah bisa membuktikan satu putaran penuh, dan uji yang
   berhenti sebelum putarannya selesai hijau untuk kode yang tidak pernah
   menyimpan apa pun. */
function bikinServer() {
  const S = {
    res: rsvAwal(), ver: 7, audit: [],
    abai: [], post: [], getFile: [], tolakSekali: false, getAll: 0,
    /* briTambah WAJIB memulangkan id barisnya: jalur "Catat dari DP"
       menyambungkannya lewat panggilan KEDUA yang butuh id itu. Stub yang
       tidak memulangkannya membuat penyambungannya gagal diam-diam, dan
       asersinya hijau untuk kode yang tidak pernah menyambung apa pun. */
    nTambah: 0, tolakCocok: false
  };
  S.fetch = (url, opt) => {
    const u = String(url);
    const jawab = o => Promise.resolve({ json: () => Promise.resolve(o) });
    if (opt && opt.method === 'POST') {
      const b = JSON.parse(opt.body);
      S.post.push({ url: u, body: b });
      if (b.action === 'saveAll') {
        if (S.tolakSekali) { S.tolakSekali = false; return jawab({ ok: true, data: { conflict: true, ver: S.ver } }); }
        if (String(b.baseVer) !== String(S.ver))
          return jawab({ ok: true, data: { conflict: true, ver: S.ver } });
        S.res = b.data.reservations;
        S.audit = b.data.audit || [];
        S.ver += 1;
        return jawab({ ok: true, data: { saved: true, ver: S.ver } });
      }
      if (b.action === 'briAbai') {
        const d = b.data || {};
        if (d.pulih) S.abai = S.abai.filter(x => x.dpId !== d.dpId);
        else {
          if (!String(d.alasan || '').trim()) return jawab({ ok: false, error: 'Sebutkan dulu kenapa baris ini tidak valid.' });
          S.abai = S.abai.filter(x => x.dpId !== d.dpId)
            .concat([{ dpId: d.dpId, resId: d.resId, nama: d.nama, tgl: d.tgl,
                       nominal: d.nominal, alasan: d.alasan, oleh: 'Rani', at: 9 }]);
        }
        return jawab({ ok: true, data: { saved: true } });
      }
      if (b.action === 'briTambah')
        return jawab({ ok: true, data: { saved: true, id: 'bBaru' + (++S.nTambah) } });
      if (b.action === 'briCocok' && S.tolakCocok) {
        S.tolakCocok = false;
        return jawab({ ok: false, error: 'DP itu sudah dicocokkan ke mutasi lain.' });
      }
      return jawab({ ok: true, data: { saved: true, n: 1 } });
    }
    if (u.indexOf('briList') >= 0)
      return jawab({ ok: true, data: { baris: MUT_UJI, total: MUT_UJI.length, maks: 2000, abai: S.abai.slice() } });
    if (u.indexOf('getFile') >= 0) {
      const m = u.match(/key=([^&]+)/);
      S.getFile.push(m ? decodeURIComponent(m[1]) : '');
      return jawab({ ok: true, data: { key: m && m[1], data: 'data:image/jpeg;base64,ZZZ' } });
    }
    if (u.indexOf('getAll') >= 0) {
      S.getAll++;
      return jawab({ ok: true, data: { reservations: S.res, master: { dpMethods: METODE_UJI },
                                       audit: S.audit, _ver: S.ver } });
    }
    return jawab({ ok: false, error: 'url tak dikenal: ' + u });
  };
  return S;
}

async function ujiHalaman() {
  console.log('\n[5] Halamannya dijalankan (jsdom)');
  const jsdom = cariJsdom();
  if (!jsdom) { L('halaman dijalankan di jsdom', 'jsdom tidak ketemu — setel JSDOM_PATH'); return; }
  const { JSDOM } = jsdom;
  /* runScripts DIANGKAT KE 'dangerously', dan itu bukan kelonggaran.
     Dengan 'outside-only' jsdom TIDAK MENJALANKAN onclick inline sama
     sekali — seluruh tombol di aset ini memakainya, jadi uji yang cuma
     memanggil fungsinya langsung tidak pernah membuktikan satu tombol pun
     tersambung. Dokumennya tidak punya <script> sendiri, jadi tidak ada
     apa pun yang ikut terbawa. */
  const dom = new JSDOM('<!doctype html><html><head></head><body><div id="app-view"></div></body></html>',
                        { runScripts: 'dangerously' });
  const W = dom.window;
  const SRV = bikinServer();

  /* fetch / alert / confirm / prompt DIOPER SEBAGAI PARAMETER, bukan
     ditempel ke window sesudahnya. Di peramban keempatnya memang global
     window, tapi di Node badan fungsi ini mengikat ke global NODE — jadi
     stub yang cuma ditempel ke W tidak pernah dipanggil, seluruh pemuatnya
     gagal diam-diam, dan halamannya tergambar KOSONG. Asersi apa pun di
     atasnya lalu menguji layar yang tidak pernah terisi. */
  let jawabPrompt = '';
  const alertUji = m => { PESAN.push(String(m)); };
  let jawabConfirm = true;
  const PESAN = [];
  const confirmUji = m => { PESAN.push(String(m)); return jawabConfirm; };
  const promptUji = m => { PESAN.push(String(m)); return jawabPrompt; };
  W.alert = alertUji; W.confirm = confirmUji; W.prompt = promptUji;
  /* jsdom tidak mengerjakan createObjectURL maupun window.open. Keduanya
     distub supaya jalur "buka di tab baru" benar-benar dijalankan — yang
     diuji bukan bahwa kodenya ADA, melainkan bahwa yang dibuka blob: dan
     bukan data: yang diblokir peramban. */
  const TAB = [];
  let blobKe = 0;
  W.URL.createObjectURL = b => { TAB.push({ jenis: 'blob', tipe: b && b.type }); return 'blob:uji/' + (++blobKe); };
  W.URL.revokeObjectURL = () => {};
  W.open = (u) => { TAB.push({ jenis: 'open', url: String(u) }); return {}; };
  new Function('window', 'document', 'fetch', 'alert', 'confirm', 'prompt', srcCb)
    (W, W.document, SRV.fetch, alertUji, confirmUji, promptUji);

  const el = W.document.getElementById('app-view');
  let bolehUbah = true;
  W.cbPasang({ apiUrl: '/api', rsvUrl: '/rsv', sesi: () => ({ name: 'Rani', role: 'kasir', token: 't' }),
               bolehUbah: () => bolehUbah, gambarUlang: () => W.cbGambar(el, '2026-09') });
  W.cbGambar(el, '2026-09');
  /* DITUNGGU LEWAT STATE-NYA, BUKAN LEWAT TEKS DI LAYAR — penunggu yang
     mencari nama tamu di innerHTML bisa cocok dengan layar SEBELUMNYA atau
     dengan contoh isian. Bentuk itu sudah empat kali menggigit di repo ini. */
  const S = W.__cbState;
  for (let i = 0; i < 80 && (!S.rows.length || !S.dps); i++) await tidur(10);
  T('daftar mutasi termuat', S.rows.length === MUT_UJI.length, 'rows=' + S.rows.length + ' err=' + S.err);
  T('bukti bayar dari modul Reservasi termuat', !!S.dps && S.dps.length === 5,
    'dps=' + (S.dps ? S.dps.length : 'null') + ' dpErr=' + S.dpErr);
  T('daftar metode pembayaran ikut terbaca dari master', S.metode.length === METODE_UJI.length);

  const html = () => el.innerHTML;
  /* Irisan per KARTU menurut <h3>-nya. Asersi yang menyapu seluruh halaman
     cocok dengan kartu lain — bentuk yang sudah enam kali menggigit. */
  function kartu(judul) {
    const h = html();
    const i = h.indexOf('<h3>' + judul);
    if (i < 0) return '';
    const j = h.indexOf('<h3>', i + 4);
    return h.slice(i, j < 0 ? h.length : j);
  }
  /* cbBuka() MENUTUP panel yang sudah terbuka — ia saklar. Uji yang
     memanggilnya dua kali untuk baris yang sama justru MENUTUPNYA, dan
     asersi sesudahnya menguji panel yang tidak ada: kotaknya tidak ketemu,
     fungsinya berhenti di penjaga pertama, dan kirimannya "ditahan" untuk
     sebab yang sama sekali lain. Satu asersi konfirmasi memang hampa karena
     ini di putaran pertama. */
  const bukaPanel = id => { if (S.buka !== id) W.cbBuka(id); };
  const barisTabel = () => {
    const k = kartu('Dana Masuk BRI');
    const m = k.match(/<tbody>([\s\S]*?)<\/tbody>/);
    return m ? m[1].split('<tr').slice(1).map(x => '<tr' + x) : [];
  };

  T('halaman tergambar', html().indexOf('Dana Masuk BRI') >= 0);

  /* ===== POIN 1: TOMBOL & KOTAK UNGGAH HILANG DARI LAYAR ===== */
  T('tidak ada lagi tombol unggah mutasi bank', html().indexOf('Unggah mutasi bank') < 0);
  T('tidak ada lagi kotak tempel dari Excel', html().indexOf('tempel dari Excel') < 0);
  T('tidak ada lagi kotak pilih berkas', html().indexOf('type="file"') < 0);
  /* Kartu atasnya tetap ada — di situlah tombol Tambah dana masuk & Muat
     ulang berdiri. Dicabut sekalian, keduanya ikut hilang. */
  T('tombol tambah dana masuk & muat ulang tetap ada',
    html().indexOf('cbBukaTambah()') >= 0 && html().indexOf('cbSegarkan()') >= 0);

  /* ===== SATU BARIS = SATU UANG YANG ORANG NYATAKAN MASUK (23 Sep 2026) =====
     DP reservasi TIDAK lagi lahir jadi baris. Yang ada di tabel cuma baris
     yang diketik/diunggah orang; DP disambungkan ke baris itu. */
  const barisBelum = () => {
    const k = kartu('DP Reservasi yang Belum Dicatat');
    const m = k.match(/<tbody>([\s\S]*?)<\/tbody>/);
    return m ? m[1].split('<tr').slice(1).map(x => '<tr' + x) : [];
  };
  const b = barisTabel();
  /* p2 Arlanda 250.000 & p3 Bagas 175.000 sama-sama QRIS dan belum dipegang
     baris mana pun — keduanya WAJIB tidak ada di tabel, dan WAJIB ada di
     daftar kerjanya. */
  T('DP tidak lagi lahir jadi baris di tabel',
    b.filter(x => x.indexOf('Bagas') >= 0).length === 0, 'baris ber-Bagas: '
      + b.filter(x => x.indexOf('Bagas') >= 0).length);
  T('3 baris transaksi tergambar', b.length === 3, 'dapat ' + b.length);
  /* Yang SUDAH dicocokkan tetap berdiri — ia baris mutasi, bukan DP. */
  T('baris yang sudah dicocokkan tetap menyebut tamunya',
    b.filter(x => x.indexOf('Arlanda') >= 0).length === 1,
    'baris ber-Arlanda: ' + b.filter(x => x.indexOf('Arlanda') >= 0).length);

  /* DAFTAR KERJANYA — dan ia yang menahan pencabutan jadi kehilangan. */
  const kBelum = kartu('DP Reservasi yang Belum Dicatat');
  T('kartu daftar kerja tergambar', kBelum.length > 0);
  T('DP BRI yang belum dicatat disebut satu per satu',
    kBelum.indexOf('Arlanda') >= 0 && kBelum.indexOf('Bagas') >= 0);
  T('jumlah & nominalnya disebut', kBelum.indexOf('2 DP') >= 0 && kBelum.indexOf('Rp425.000') >= 0,
    kBelum.slice(0, 400));
  /* DP yang SUDAH dipegang baris mutasi tidak ikut ditagih — kalau ikut,
     daftar kerjanya menyuruh mencatat uang yang sudah tercatat. */
  T('DP yang sudah dicocokkan tidak ikut ditagih',
    barisBelum().filter(x => x.indexOf('Rp300.000') >= 0).length === 0);
  /* Yang uangnya masuk rekening lain juga tidak ikut: ia memang tidak akan
     pernah ada di mutasi BRI, dan menagihnya berarti menyuruh mencatat uang
     yang tidak pernah masuk rekening ini. */
  T('DP non-BRI tidak ikut di daftar kerja',
    kBelum.indexOf('Citra') < 0 && kBelum.indexOf('Dewi') < 0);

  /* ===== URUT WAKTU TRANSAKSI MASUK =====
     Dipulihkan 21 September 2026: asersi ini ada di suite 19 September dan
     IKUT HILANG waktu berkas ujinya ditulis ulang — tidak satu pun mutasi
     menangkapnya, karena tidak ada satu pun mutasi urutan yang pernah
     dicoba. Urutan daftar rekonsiliasi bukan kerapian: yang menyisirnya
     mencocokkan baris demi baris dengan rekening koran yang juga urut
     waktu. */
  const urutNama = b.map(x => {
    if (x.indexOf('Arlanda') >= 0) return 'Arlanda-300';
    if (x.indexOf('PT Ibra') >= 0) return 'manual';
    return 'bank';
  });
  T('diurut menurut waktu transaksi masuk',
    urutNama.join('|') === 'manual|Arlanda-300|bank', urutNama.join('|'));

  const kr0 = html().slice(0, html().indexOf('<h3>'));
  /* 425.000 + 5.000.000 + 300.000 — DP yang belum dicatat TIDAK ikut, dan
     itu inti perubahannya: yang dijumlahkan cuma uang yang dinyatakan
     orang, bukan uang yang disimpulkan dari foto struk. */
  T('total dana masuk = Rp5.725.000', kr0.indexOf('Rp5.725.000') >= 0, kr0.slice(0, 260));
  T('DP yang belum dicatat tidak ikut dijumlahkan', kr0.indexOf('Rp6.150.000') < 0);

  /* ===== POIN 2: BUKTI BAYARNYA BISA DILIHAT =====
     Pindah ke kartu daftar kerja bersama barisnya. Yang diuji tetap sama:
     buktinya bisa dilihat TANPA berpindah modul, dan tombol koreksinya ada
     di barisnya sendiri. */
  const barisArl = barisBelum().find(x => x.indexOf('Arlanda') >= 0) || '';
  T('baris DP punya tombol koreksinya sendiri', barisArl.indexOf("cbBuka('belum:p2')") >= 0,
    barisArl.slice(0, 250));
  /* TOMBOL CATAT — jalan satu-klik dari DP ke baris dana masuk. Tanpa itu
     tiap DP harus diketik ulang lima kolom, dan aturan "catat manual" cuma
     jadi pekerjaan tambahan yang ditinggalkan orang. */
  T('baris DP punya tombol Catat', barisArl.indexOf("cbCatatDp('p2')") >= 0, barisArl.slice(0, 250));

  T('belum ada satu berkas bukti pun diunduh sebelum panelnya dibuka', SRV.getFile.length === 0,
    JSON.stringify(SRV.getFile));
  aman('panel DP terbuka', () => { W.cbBuka('belum:p2'); });
  T('kotak bukti tergambar seketika (sebelum unduhannya selesai)',
    html().indexOf('Memuat bukti') >= 0);
  for (let i = 0; i < 80 && !S.bukti['@f:k2']; i++) await tidur(10);
  T('berkas buktinya diunduh lewat getFile', SRV.getFile.indexOf('k2') >= 0, JSON.stringify(SRV.getFile));
  T('gambarnya tergambar di panelnya', /<img src="data:image\/jpeg/.test(html()), html().slice(html().indexOf('cb-bukti'), html().indexOf('cb-bukti') + 200));
  /* ===== GAMBARNYA BISA DIBUKA — DAN INI BUG YANG DILAPORKAN =====
     Bentuk lamanya <a href="data:image/…" target="_blank">, dan di Chrome
     MENEKANNYA TIDAK MELAKUKAN APA-APA: navigasi tingkat atas ke URL data:
     diblokir sejak Chrome 60. Tidak ada galat, tidak ada tab yang terbuka.
     Yang dijaga sekarang KETIADAAN bentuk itu, plus dua jalan yang memang
     bekerja: lightbox di halaman ini, dan blob: untuk tab baru. */
  T('bukti TIDAK lagi dibuka lewat tautan data: yang diblokir peramban',
    !/<a[^>]+href="data:/.test(html()), (html().match(/<a[^>]+href="data:[^"]{0,40}/) || [''])[0]);

  /* DIUNDUH SEKALI SAJA. Tanpa penjaga CB.buktiSibuk / cache, tiap
     penggambaran ulang memicu unduhan baru untuk berkas yang sama — dan
     halaman ini digambar ulang tiap simpan. */
  const n0file = SRV.getFile.length;
  W.cbGambar(el, '2026-09');
  await tidur(30);
  T('bukti yang sudah diunduh tidak diunduh lagi tiap render', SRV.getFile.length === n0file,
    'bertambah ' + (SRV.getFile.length - n0file));
  /* DAN TIDAK PULA TIAP PANELNYA DIBUKA LAGI. Menutup lalu membuka kembali
     baris yang sama memanggil muatBuktiUntuk() sekali lagi — tanpa cache,
     berkas ratusan KB itu diunduh berulang tiap orang mengintip barisnya. */
  W.cbBuka('belum:p2');           // tutup
  W.cbBuka('belum:p2');           // buka lagi
  await tidur(40);
  T('bukti tidak diunduh ulang saat panelnya dibuka lagi', SRV.getFile.length === n0file,
    'bertambah ' + (SRV.getFile.length - n0file));
  T('gambarnya masih tergambar sesudah dibuka lagi', /<img src="data:image\/jpeg/.test(html()));

  /* DP TANPA BUKTI adalah KETERANGAN, bukan kekosongan — justru baris itulah
     yang paling perlu diperiksa waktu rekonsiliasinya tidak ketemu. */
  aman('panel DP tanpa bukti terbuka', () => { W.cbBuka('belum:p3'); });
  T('DP tanpa bukti mengatakannya', html().indexOf('tidak punya bukti transfer') >= 0);
  T('DP tanpa bukti tidak memicu unduhan apa pun', SRV.getFile.length === n0file);

  /* BUKTI DP LAMA yang masih inline TIDAK boleh memicu unduhan sama sekali,
     dan ia dipajang lewat baris mutasi yang sudah dicocokkan (b3) — tanpa
     itu, buktinya berhenti bisa dilihat dari mana pun begitu pencocokannya
     disimpan. */
  /* DI KOLOM BUKTI BARISNYA, bukan cuma di dalam panel yang harus dibuka
     dulu. Sejak DP berhenti jadi baris, kolom itu HANYA terisi lewat DP yang
     dicari dari r.dpId — dan tanpa pencarian itu seluruh kolom Bukti di tabel
     utama mati tanpa satu pun galat. */
  {
    const barisCocok = barisTabel().find(x => x.indexOf('Arlanda') >= 0) || '';
    T('baris yang sudah dicocokkan memajang bukti DP-nya di kolomnya',
      /data:image\/png;base64,AAAA/.test(barisCocok),
      barisCocok.slice(barisCocok.indexOf('cb-selbukti'), barisCocok.indexOf('cb-selbukti') + 200));
  }
  aman('panel baris mutasi yang sudah cocok terbuka', () => { W.cbBuka('b3'); });
  T('bukti DP yang sudah dipasangkan ikut tergambar di panel pencocokan',
    /<img src="data:image\/png;base64,AAAA/.test(html()), html().indexOf('cb-bukti') >= 0 ? 'ada cb-bukti' : 'tidak ada cb-bukti');
  T('bukti inline lama tidak pernah diunduh', SRV.getFile.length === n0file);

  /* BUKTI PDF dibuka di tab sendiri, bukan dipaksa jadi <img> yang tergambar
     sebagai kotak rusak — dan kotak rusak di sebelah nominal terbaca sebagai
     "buktinya hilang", padahal ia utuh. */
  aman('panel DP non-BRI terbuka dari kartu bawah', () => { W.cbBuka('luar:p5'); });
  for (let i = 0; i < 80 && !S.bukti['@f:k5']; i++) await tidur(10);
  {
    const kl = kartu('DP Bulan Ini yang Tidak Masuk BRI');
    T('bukti berjenis PDF digambar sebagai tautan, bukan <img>',
      kl.indexOf('Buka bukti') >= 0 && kl.indexOf('struk-dewi.pdf') >= 0,
      kl.slice(kl.indexOf('cb-bukti'), kl.indexOf('cb-bukti') + 200));
  }
  W.cbBuka('luar:p5');   // tutup lagi

  /* ===== KOLOM BUKTI MENGGANTIKAN "SUMBER BARIS" =====
     (21 September 2026, permintaan user: "bukti bayar terisi sendiri itu
     gunanya buat apa? kalau ga dihapus saja") */
  {
    const k = kartu('Dana Masuk BRI');
    T('kolom "Sumber baris" dicabut', k.indexOf('Sumber baris') < 0);
    /* DIJEPIT KE BARISNYA. Kalimat "terisi sendiri dari bukti bayar" masih
       berdiri di kepala kartu — di sana ia dibaca SEKALI dan menjelaskan
       kenapa barisnya muncul tanpa ada yang mengetik. Yang dicabut chip yang
       mengulanginya di TIAP baris tanpa menambah apa pun. Asersi yang
       menyapu seluruh kartu merah untuk kode yang benar. */
    const isiBaris = barisTabel().join('');
    T('chip "terisi sendiri" di tiap baris ikut hilang', isiBaris.indexOf('terisi sendiri') < 0,
      isiBaris.slice(Math.max(0, isiBaris.indexOf('terisi sendiri') - 60), isiBaris.indexOf('terisi sendiri') + 40));
    T('chip "bukti bayar" di tiap baris ikut hilang', isiBaris.indexOf('>bukti bayar<') < 0);
    T('tempatnya dipakai kolom Bukti', k.indexOf('<th>Bukti</th>') >= 0);
    /* Jam DISEBUT ZONANYA. Jam tanpa keterangan zona dibaca orang menurut
       kebiasaannya sendiri, dan di halaman yang dicocokkan dengan rekening
       koran itu selisih yang tidak pernah ketahuan. */
    T('kepala kolom jam menyebut WIB', k.indexOf('<th>Jam (WIB)</th>') >= 0);
    /* Keterangan asal baris yang ikut tercabut bersama kolomnya PINDAH ke
       kolom Dari — cuma untuk baris yang memang belum ketahuan. */
    T('baris mutasi yang belum ketahuan tetap menyebut asalnya',
      k.indexOf('baris mutasi bank') >= 0);
  }
  {
    const bb = barisBelum();
    const barisBagas = bb.find(x => x.indexOf('Bagas') >= 0) || '';
    T('DP tanpa bukti ditandai di kolomnya', barisBagas.indexOf('tanpa bukti') >= 0,
      barisBagas.slice(0, 200));
    const barisArl2 = bb.find(x => x.indexOf('Rp250.000') >= 0) || '';
    /* Buktinya SUDAH terunduh di blok sebelumnya, jadi kotaknya wajib sudah
       berupa gambar — bukan tombol "muat" yang tidak pernah berganti. */
    T('bukti yang sudah terunduh tergambar sebagai gambar di barisnya',
      /<img[^>]+class="cb-thumb"[^>]*src="data:image\/jpeg/.test(barisArl2)
      || /<img[^>]+src="data:image\/jpeg[^"]*"[^>]*class="cb-thumb"/.test(barisArl2),
      barisArl2.slice(barisArl2.indexOf('cb-selbukti'), barisArl2.indexOf('cb-selbukti') + 220));
    T('gambarnya bisa ditekan untuk diperbesar', barisArl2.indexOf("cbLihat('p2')") >= 0);
  }

  /* ===== IKON PENSIL (permintaan user) ===== */
  {
    const barisArl2 = barisBelum().find(x => x.indexOf('Rp250.000') >= 0) || '';
    const aksi = barisArl2.slice(barisArl2.indexOf('cb-aksi'));
    T('tombol koreksi berupa ikon pensil', aksi.indexOf('✎') >= 0, aksi.slice(0, 200));
    /* Tombol berikon tanpa keterangan cuma bisa ditebak. */
    T('ikonnya punya title yang menyebut gunanya', /title="Koreksi[^"]*"/.test(aksi));
  }

  /* ===== LIGHTBOX: GAMBARNYA BISA DIBUKA ===== */
  /* ===== DIBUKA DENGAN MENEKAN GAMBARNYA, BUKAN MEMANGGIL FUNGSINYA =====
     Inilah lubang yang meloloskan laporan "klik gambar masih tidak bisa
     dibuka": asersinya memanggil cbLihat() langsung, jadi ia tidak pernah
     menguji bahwa gambarnya BENAR-BENAR tersambung ke sana. Pelajaran
     putuskan() di modul Jadwal, dan ini kali kedua bentuk itu menggigit. */
  {
    /* DIJEPIT ke gambar milik p2. Sejak baris yang sudah dicocokkan ikut
       memajang bukti DP-nya, ada LEBIH DARI SATU img.cb-thumb di halaman —
       dan yang pertama justru milik p1 di tabel utama. Selektor yang
       menyapu akan menguji gambar yang bukan yang diuji. */
    const semua = [...W.document.querySelectorAll('img.cb-thumb')];
    const img = semua.find(x => (x.getAttribute('onclick') || '').indexOf("'p2'") >= 0);
    T('gambar bukti ada di barisnya', !!img, semua.length + ' gambar di halaman');
    if (img) img.dispatchEvent(new W.MouseEvent('click', { bubbles: true }));
  }
  T('menekan gambarnya membuka lightbox', S.lihat === 'p2', 'CB.lihat=' + JSON.stringify(S.lihat));

  /* WADAHNYA DI TINGKAT <body>, bukan di dalam #app-view: position:fixed di
     dalam pohon tuan rumah bergantung pada tidak adanya satu pun leluhur
     ber-transform/filter/contain, dan rantai itu milik modul lain yang boleh
     berubah kapan saja. */
  const lb = () => W.document.getElementById('cb-lightbox-root');
  const lbHtml = () => (lb() ? lb().innerHTML : '');
  T('wadah lightbox menempel langsung ke <body>',
    !!lb() && lb().parentNode === W.document.body,
    lb() ? lb().parentNode.tagName : 'wadahnya tidak ada');
  T('lightbox TIDAK lagi digambar di dalam #app-view', html().indexOf('cb-lightbox') < 0);
  T('lightbox tergambar', lbHtml().indexOf('cb-lightbox') >= 0);
  T('lightbox memajang gambarnya', /<div class="cb-lightbox"[\s\S]*?<img src="data:image\/jpeg/.test(lbHtml()));
  T('lightbox menyebut nama & nominalnya', /cb-lightbox-kepala[\s\S]{0,200}Arlanda/.test(lbHtml()));
  /* DIGAMBAR DARI STATE, bukan disisipkan ke DOM: halaman ini digambar ulang
     tiap penyimpanan, dan overlay yang cuma hidup di DOM lenyap di tengah
     orang memeriksanya. */
  W.cbGambar(el, '2026-09');
  await tidur(20);
  T('lightbox bertahan sesudah halaman digambar ulang', lbHtml().indexOf('cb-lightbox') >= 0);
  /* DIPERIKSA SESUDAH DIGAMBAR ULANG, dan itu momen yang menentukan:
     selama cbGambar() masih ikut menyisipkannya ke #app-view, overlay-nya
     berdiri DUA KALI — satu di wadah <body> yang benar, satu lagi di dalam
     pohon tuan rumah yang posisinya tidak bisa dipercaya. Diperiksa sebelum
     render, salinan kedua itu belum lahir dan mutasinya LOLOS. */
  T('lightbox TIDAK ikut digambar ulang di dalam #app-view',
    html().indexOf('cb-lightbox') < 0);
  T('hanya ADA SATU lightbox di seluruh halaman',
    W.document.querySelectorAll('.cb-lightbox').length === 1,
    'dapat ' + W.document.querySelectorAll('.cb-lightbox').length);
  {
    const n = TAB.length;
    aman('buka di tab baru', () => { W.cbBukaTab('p2'); });
    const blob = TAB.slice(n).find(x => x.jenis === 'blob');
    const buka = TAB.slice(n).find(x => x.jenis === 'open');
    T('buktinya diubah jadi Blob dulu', !!blob && blob.tipe === 'image/jpeg', JSON.stringify(blob));
    /* INI INTI PERBAIKANNYA: yang dibuka blob:, bukan data: yang diblokir
       Chrome sejak versi 60 — dengan data: tombolnya diam tanpa satu pun
       galat, dan yang menekannya menyimpulkan buktinya rusak. */
    T('yang dibuka URL blob:, bukan data:',
      !!buka && buka.url.indexOf('blob:') === 0, JSON.stringify(buka));
  }
  /* DITUTUP DENGAN MENEKAN TOMBOLNYA, sama alasannya dengan membukanya. */
  {
    const tutup = lb() && [...lb().querySelectorAll('.cb-lightbox-alat button')]
      .find(b => (b.getAttribute('onclick') || '').indexOf('cbTutupLihat') >= 0);
    T('tombol Tutup ada di lightbox', !!tutup);
    if (tutup) tutup.dispatchEvent(new W.MouseEvent('click', { bubbles: true }));
  }
  T('lightbox hilang sesudah ditutup', lbHtml().indexOf('cb-lightbox') < 0);
  /* ESC juga menutupnya: overlay yang menutupi seluruh layar wajib punya
     jalan keluar yang tidak menuntut mengarahkan tetikus ke satu tombol. */
  W.cbLihat('p2');
  T('lightbox terbuka lagi', lbHtml().indexOf('cb-lightbox') >= 0);
  W.document.dispatchEvent(new W.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  T('Escape menutup lightbox', lbHtml().indexOf('cb-lightbox') < 0, JSON.stringify(S.lihat));

  /* ===== POIN 3a: METODE BAYAR BISA DIBETULKAN DARI SINI ===== */
  aman('panel DP non-BRI dibuka lagi', () => { W.cbBuka('luar:p4'); });
  {
    const kl = kartu('DP Bulan Ini yang Tidak Masuk BRI');
    T('kartu DP non-BRI sekarang berisi tabel, bukan cuma kalimat',
      kl.indexOf('Citra') >= 0 && kl.indexOf("cbBuka('luar:p4')") >= 0, kl.slice(0, 200));
    T('kotak pilihan metode tergambar', kl.indexOf('id="cb-met-p4"') >= 0);
    /* NILAI TERSIMPAN YANG SUDAH TIDAK ADA DI DAFTAR tetap digambar,
       ditandai (lama). Dibuang, membuka panelnya diam-diam menggantinya ke
       pilihan pertama begitu Simpan ditekan. */
    /* DIBACA DARI DOM YANG SUDAH DISERIALKAN ULANG: jsdom menulis atribut
       kosong sebagai selected="", bukan selected. Pola yang menuntut bentuk
       string aslinya merah untuk kode yang benar. */
    T('metode tersimpan di luar daftar tetap ditawarkan, ditandai (lama)',
      /<option value="Transfer UOB" selected(="")?>Transfer UOB \(lama\)<\/option>/.test(kl),
      kl.slice(kl.indexOf('cb-met-p4'), kl.indexOf('cb-met-p4') + 400));
  }

  /* YANG DIUKUR ISI KIRIMAN KE MODUL RESERVASI, bukan pesan di layar. Itu
     satu-satunya yang bisa membedakan "tersimpan" dari "dilaporkan
     tersimpan" — dan dari layar keduanya terlihat sama persis. */
  const setSel = (id, v) => { const s = W.document.getElementById(id); if (s) s.value = v; return !!s; };
  T('kotak metodenya benar-benar ada di DOM', setSel('cb-met-p4', 'Transfer BRI'));
  const nPost0 = SRV.post.length, verLama = SRV.ver;
  /* BENTROK SEKALI DULU. Kiriman pertama ditolak versi — kalau ulangannya
     tidak jalan, perubahannya hilang tanpa satu pun galat. */
  SRV.tolakSekali = true;
  jawabConfirm = true;
  await amanAsync('ubah metode tidak melempar', async () => { await W.cbUbahMetode('p4'); });
  for (let i = 0; i < 80 && S.sibuk; i++) await tidur(10);
  const simpanRsv = SRV.post.filter(p => p.url === '/rsv' && p.body.action === 'saveAll');
  T('kirimannya diulang sesudah ditolak conflict', simpanRsv.length === 2, 'dapat ' + simpanRsv.length);
  if (simpanRsv.length) {
    const akhir = simpanRsv[simpanRsv.length - 1].body;
    T('baseVer ikut terkirim', String(akhir.baseVer) === String(verLama), 'baseVer=' + akhir.baseVer);
    const r3 = (akhir.data.reservations || []).find(x => x.id === 'r3');
    T('metode DP-nya benar-benar berubah di kiriman',
      r3 && r3.dps[0].method === 'Transfer BRI', r3 && JSON.stringify(r3.dps[0].method));
    /* updatedAt WAJIB naik: penjaga UPSERT di sana membuang perubahan yang
       capnya tidak lebih baru, tanpa satu pun galat. */
    T('updatedAt reservasinya dinaikkan', r3 && r3.updatedAt > 1000, r3 && String(r3.updatedAt));
    T('ringkasan dpMethod ikut disamakan', r3 && r3.dpMethod === 'Transfer BRI', r3 && r3.dpMethod);
    /* SELURUH reservasi ikut terkirim. saveAll di sana MENGHAPUS yang tidak
       ada di kiriman — kiriman sebagian membuang reservasi kru lain. */
    T('seluruh reservasi ikut di kiriman, bukan cuma yang disentuh',
      (akhir.data.reservations || []).length === 4, String((akhir.data.reservations || []).length));
    const au = (akhir.data.audit || [])[0];
    T('jejaknya ditulis di audit global', !!au && au.res === 'r3' && /Transfer BRI/.test(au.detail),
      JSON.stringify(au));
    T('jejaknya juga menempel di barisnya sendiri',
      r3 && Array.isArray(r3.log) && r3.log.length === 1 && /Transfer BRI/.test(r3.log[0].detail));
    T('nama pengubahnya dari sesi', !!au && au.user === 'Rani');
  }
  T('kiriman ubah metode TIDAK nyasar ke kompas-api',
    SRV.post.slice(nPost0).every(p => p.url === '/rsv'), JSON.stringify(SRV.post.slice(nPost0).map(p => p.url)));

  /* DP DITARIK ULANG sesudahnya, bukan disetel di memori — layar yang
     menyetel salinan lokalnya akan memajang metode yang tidak pernah
     tersimpan di mana pun kalau satu penyimpanan ditolak diam-diam. */
  for (let i = 0; i < 100 && !(S.dps || []).some(d => d.dpId === 'p4' && d.metode === 'Transfer BRI'); i++) await tidur(10);
  T('DP ditarik ulang dari modul Reservasi sesudah tersimpan',
    (S.dps || []).some(d => d.dpId === 'p4' && d.metode === 'Transfer BRI'),
    JSON.stringify((S.dps || []).map(d => d.dpId + ':' + d.metode)));
  W.cbGambar(el, '2026-09');
  await tidur(20);
  /* SEJAK BARIS DP TIDAK LAGI LAHIR SENDIRI, yang berpindah bukan lagi ke
     tabel utama melainkan ke DAFTAR KERJA: metode yang dibetulkan membuat
     DP-nya ikut ditagih sebagai "belum dicatat". Itu memang yang benar —
     uangnya masuk BRI, dan belum ada satu baris pun yang mengakuinya. */
  T('barisnya pindah ke daftar kerja begitu metodenya benar',
    kartu('DP Reservasi yang Belum Dicatat').indexOf('Citra') >= 0, 'Citra tidak ketemu di daftar kerja');
  T('dan berhenti disebut sebagai DP non-BRI',
    kartu('DP Bulan Ini yang Tidak Masuk BRI').indexOf('Citra') < 0);

  /* Metode yang tidak berubah TIDAK dikirim: penyimpanan yang tidak mengubah
     apa pun menaikkan versi di sana, dan tab kru Reservasi yang terbuka
     lalu bentrok tanpa ada yang menyentuh apa pun. */
  {
    const n = SRV.post.length;
    bukaPanel('belum:p2');
    T('kotak metode p2 ada di DOM', setSel('cb-met-p2', 'QRIS'));
    await amanAsync('ubah metode ke nilai yang sama tidak melempar', async () => { await W.cbUbahMetode('p2'); });
    T('metode yang tidak berubah tidak dikirim ke server', SRV.post.length === n,
      'POST bertambah ' + (SRV.post.length - n));
  }
  /* KONFIRMASINYA MENAHAN, bukan sekadar memberitahu. Panelnya dipastikan
     TERBUKA dulu — kalau tidak, kotaknya tidak ketemu dan kirimannya tertahan
     oleh penjaga "pilih dulu metodenya", bukan oleh konfirmasinya. */
  {
    const n = SRV.post.length;
    jawabConfirm = false;
    bukaPanel('belum:p2');
    T('kotak metode p2 masih ada di DOM', setSel('cb-met-p2', 'Cash'));
    await amanAsync('konfirmasi ditolak tidak melempar', async () => { await W.cbUbahMetode('p2'); });
    T('kiriman DITAHAN saat konfirmasinya ditolak', SRV.post.length === n,
      'POST bertambah ' + (SRV.post.length - n));
    jawabConfirm = true;
  }

  /* ===== POIN 3b: BARIS TIDAK VALID BISA DITANDAI, DAN DIPULIHKAN ===== */
  /* DIREKAM DULU SELAGI MASIH SAH. Asersi yang cuma menuntut sesuatu HILANG
     sesudahnya tidak membuktikan apa pun kalau ia memang tidak pernah ada. */
  bukaPanel('b1');
  T('DP p2 ditawarkan sebagai kandidat pencocokan selagi masih sah',
    html().indexOf("cbPilihDp('b1','p2')") >= 0);
  W.cbBuka('b1');
  bukaPanel('belum:p2');
  T('tombol tandai tidak valid ada di panel DP', html().indexOf("cbAbaiDp('p2')") >= 0);
  /* DIKATAKAN DI TEMPAT TOMBOLNYA BERDIRI bahwa DP-nya TIDAK dihapus. Yang
     menekannya mengira ia menghapus DP-nya, dan kalau itu tidak dibantah di
     sini ia berhenti mencarinya di modul Reservasi. */
  {
    const i = html().indexOf("cbAbaiDp('p2')");
    const potong = html().slice(i, i + 900);
    T('panelnya mengatakan DP-nya tidak dihapus dari modul Reservasi',
      potong.indexOf('TIDAK dihapus') >= 0 && potong.indexOf('modul Reservasi') >= 0, potong.slice(0, 200));
  }
  {
    const n = SRV.post.length;
    jawabPrompt = '   ';
    await amanAsync('tandai tanpa alasan tidak melempar', async () => { await W.cbAbaiDp('p2'); });
    T('penandaan DITAHAN saat alasannya kosong', SRV.post.length === n,
      'POST bertambah ' + (SRV.post.length - n));
  }
  {
    const n = SRV.post.length;
    jawabPrompt = null;
    await amanAsync('tandai lalu dibatalkan tidak melempar', async () => { await W.cbAbaiDp('p2'); });
    T('penandaan DITAHAN saat kotaknya dibatalkan', SRV.post.length === n);
  }
  jawabPrompt = 'dobel dengan transfer 5 Sep';
  await amanAsync('tandai tidak valid tidak melempar', async () => { await W.cbAbaiDp('p2'); });
  for (let i = 0; i < 100 && !S.abai['p2']; i++) await tidur(10);
  T('penandaannya tersimpan & pulang lewat briList', !!S.abai['p2'], JSON.stringify(S.abai));
  {
    const kirimAbai = SRV.post.filter(p => p.body.action === 'briAbai');
    const d = kirimAbai.length ? kirimAbai[kirimAbai.length - 1].body.data : {};
    T('kirimannya membawa alasan, nama, tanggal & nominal',
      d.alasan === 'dobel dengan transfer 5 Sep' && d.nama === 'Arlanda'
      && d.tgl === '2026-09-05' && d.nominal === 250000, JSON.stringify(d));
    T('penandaan nyasar ke kompas-api, bukan ke modul Reservasi',
      kirimAbai.every(p => p.url === '/api'));
  }
  W.cbGambar(el, '2026-09');
  for (let i = 0; i < 80 && !S.abai['p2']; i++) await tidur(10);
  await tidur(30);
  /* DP YANG SUDAH DINYATAKAN TIDAK VALID TIDAK DITAWARKAN LAGI sebagai
     kandidat: satu layar menyuruh mencocokkan apa yang layar sebelahnya
     sudah coret, dan yang menerimanya menghidupkan kembali baris yang
     sengaja dicabut. */
  bukaPanel('b1');
  T('DP bernisan berhenti ditawarkan sebagai kandidat',
    html().indexOf("cbPilihDp('b1','p2')") < 0);
  T('kandidat lain tetap ditawarkan', html().indexOf("cbPilihDp('b1','p3')") >= 0);
  W.cbBuka('b1');
  {
    /* PENANDAAN BUKAN PENGHAPUSAN. DP bernisan keluar dari daftar yang
       DITAGIH, tapi tetap tergambar tercoret di kaki daftar kerjanya —
       dan di situlah satu-satunya tombol Pulihkannya berdiri. Hilang dari
       layar, penandaan berubah jadi keputusan yang tidak bisa dibatalkan
       siapa pun. */
    const bb = barisBelum();
    const barisP2 = bb.find(x => x.indexOf('Rp250.000') >= 0) || '';
    T('barisnya tetap tergambar, tercoret', barisP2.indexOf('cb-coret') >= 0, barisP2.slice(0, 160));
    T('sebab penandaannya ditulis di barisnya, bukan cuma di panel',
      barisP2.indexOf('dobel dengan transfer 5 Sep') >= 0);
    /* Yang bernisan TIDAK ditawari tombol Catat: satu layar yang menyuruh
       mencatat apa yang layar sebelahnya sudah coret membuat penandanya
       berhenti berarti. */
    T('yang bernisan tidak ditawari tombol Catat', barisP2.indexOf("cbCatatDp('p2')") < 0);
    const kb = kartu('DP Reservasi yang Belum Dicatat');
    T('yang ditandai disebut jumlahnya di kartunya', /1 DP ditandai tidak valid/.test(kb),
      kb.slice(kb.length - 400));
    /* Yang ditagih tinggal p3 Bagas 175.000 + p4 Citra 900.000 (metodenya
       baru dibetulkan jadi Transfer BRI beberapa asersi di atas). */
    T('nominalnya berhenti ikut ditagih', kb.indexOf('Rp1.075.000') >= 0, kb.slice(0, 400));
    /* Kartu ringkas TIDAK bergerak: nisan menandai DP, dan DP memang sudah
       bukan baris di tabel dana masuk. */
    const kr = html().slice(0, html().indexOf('<h3>'));
    T('total dana masuk tidak ikut bergeser', kr.indexOf('Rp5.725.000') >= 0, kr.slice(0, 260));
  }
  /* PULIHKAN. Baris mati tanpa jalan pulang adalah penandaan yang tidak bisa
     dibatalkan siapa pun. */
  W.cbBuka('belum:p2');
  T('panel baris bernisan menawarkan Pulihkan', html().indexOf("cbPulihDp('p2')") >= 0);
  T('panel baris bernisan TIDAK menawarkan tandai tidak valid lagi',
    html().indexOf("cbAbaiDp('p2')") < 0);
  await amanAsync('pulihkan tidak melempar', async () => { await W.cbPulihDp('p2'); });
  for (let i = 0; i < 100 && S.abai['p2']; i++) await tidur(10);
  W.cbGambar(el, '2026-09');
  await tidur(30);
  T('penandaannya tercabut & DP-nya ditagih lagi',
    kartu('DP Reservasi yang Belum Dicatat').indexOf('Rp1.325.000') >= 0,
    kartu('DP Reservasi yang Belum Dicatat').slice(0, 400));

  /* NISAN JUGA MENCABUT DP DARI KARTU "TIDAK MASUK BRI". Tetap berdiri di
     sana, kartunya menyuruh membetulkan metode yang memang sengaja
     dibiarkan — dan peringatan yang menuntut pekerjaan yang sudah selesai
     persis yang membuat peringatan berikutnya berhenti dibaca. */
  T('kartu DP non-BRI masih menagih Dewi sebelum ditandai',
    kartu('DP Bulan Ini yang Tidak Masuk BRI').indexOf('Dewi') >= 0);
  jawabPrompt = 'salah catat, uangnya tidak pernah masuk';
  await amanAsync('tandai DP non-BRI tidak melempar', async () => { await W.cbAbaiDp('p5'); });
  for (let i = 0; i < 100 && !S.abai['p5']; i++) await tidur(10);
  W.cbGambar(el, '2026-09');
  await tidur(30);
  T('DP non-BRI bernisan berhenti ditagih di kartunya',
    kartu('DP Bulan Ini yang Tidak Masuk BRI') === '',
    kartu('DP Bulan Ini yang Tidak Masuk BRI').slice(0, 200));
  await amanAsync('pulihkan DP non-BRI tidak melempar', async () => { await W.cbPulihDp('p5'); });
  for (let i = 0; i < 100 && S.abai['p5']; i++) await tidur(10);
  W.cbGambar(el, '2026-09');
  await tidur(30);
  T('kartunya kembali menagih sesudah dipulihkan',
    kartu('DP Bulan Ini yang Tidak Masuk BRI').indexOf('Dewi') >= 0);

  /* ===== KOTAK CARI BENAR-BENAR MENYARING =====
     gambarTabelSaja() dulu mencari kartu ber-<h3> "Mutasi Masuk BRI" — nama
     yang sudah diganti 19 September 2026 — jadi ia tidak pernah menemukan
     apa pun dan kotak carinya TIDAK MENYARING APA-APA. Tidak ada galat:
     penggambar ulangnya cuma diam. */
  {
    W.cbBuka('');
    W.cbGambar(el, '2026-09');
    await tidur(20);
    const sebelum = barisTabel().length;
    aman('mengetik di kotak cari tidak melempar', () => { W.cbKetikCari({ value: 'Arlanda' }); });
    const sesudah = barisTabel().length;
    T('kotak cari benar-benar memangkas tabelnya', sesudah === 1 && sebelum > 1,
      'sebelum=' + sebelum + ' sesudah=' + sesudah);
    T('yang tersisa memang baris yang dicari', (barisTabel()[0] || '').indexOf('Arlanda') >= 0);
    aman('kata kunci dikosongkan lagi', () => { W.cbKetikCari({ value: '' }); });
    T('daftarnya kembali utuh', barisTabel().length === sebelum);
  }

  /* ===== CATAT DARI DP: SATU KLIK, LALU TERSAMBUNG SENDIRI =====
     Inilah yang membuat "catat manual" tetap bisa dikerjakan: tanpa jalur
     ini tiap DP harus diketik ulang lima kolom, dan aturan barunya cuma
     jadi pekerjaan tambahan yang ditinggalkan orang. */
  {
    W.cbBuka(''); W.cbTutupTambah();
    W.cbGambar(el, '2026-09');
    await tidur(20);
    aman('menekan Catat tidak melempar', () => { W.cbCatatDp('p2'); });

    const pra = html().slice(html().indexOf('cb-pra'));
    T('formulirnya terbuka', html().indexOf('cb-pra') >= 0);
    /* ISIANNYA TERISI DARI DP-nya — dan ini pengisi awal, bukan jalan pintas
       yang melewati orang: yang tersimpan tetap apa yang ada di kotaknya
       waktu Simpan ditekan. */
    T('isiannya terisi dari DP-nya', S.tambah && S.tambah.tgl === '2026-09-05'
      && Number(S.tambah.nominal) === 250000 && S.tambah.ket === 'Arlanda',
      JSON.stringify(S.tambah));
    /* DIBAKUKAN 24 JAM. Diisikan apa adanya ("07:30:00 PM"), <input
       type="time"> tidak bisa menampilkannya sama sekali — kotaknya
       tergambar KOSONG, dan yang menyimpannya kehilangan jam yang sebenarnya
       sudah terbaca. */
    T('jamnya ikut, sudah dibakukan 24 jam', S.tambah && S.tambah.jam === '19:30',
      S.tambah && S.tambah.jam);
    T('niat menyambungkannya dibawa di formulirnya', S.tambah && S.tambah.dp === 'p2');
    /* DIKATAKAN DI LAYAR bahwa barisnya akan tersambung sendiri. Tanpa itu
       yang menekannya mencari tombol Cocokkan yang tidak perlu ditekan. */
    T('formulirnya menyebut DP mana yang akan disambungkan',
      pra.indexOf('Arlanda') >= 0 && pra.indexOf('langsung disambungkan') >= 0, pra.slice(0, 400));
    /* TANGGAL TRANSFERNYA DARI BUKTI YANG DIBACA MESIN, dan itu disebut —
       kalau tidak, satu-klik ini jadi cara baru memasukkan tanggal karangan
       ke daftar rekonsiliasi. */
    T('formulirnya menyuruh mencocokkan dulu dengan mutasi bank',
      /dibaca mesin/.test(pra) && /Cocokkan dulu/.test(pra));

    const n0 = SRV.post.length;
    await amanAsync('menyimpan tidak melempar', async () => { await W.cbSimpanTambah(); });
    const baru = SRV.post.slice(n0).filter(p => p.body.action === 'briTambah' || p.body.action === 'briCocok');
    T('dua panggilan: briTambah lalu briCocok',
      baru.length === 2 && baru[0].body.action === 'briTambah' && baru[1].body.action === 'briCocok',
      baru.map(x => x.body.action).join('|'));
    if (baru.length === 2) {
      T('yang disimpan isi kotaknya, bukan angka DP-nya langsung',
        baru[0].body.data.nominal === 250000 && baru[0].body.data.tgl === '2026-09-05'
        && baru[0].body.data.ket === 'Arlanda', JSON.stringify(baru[0].body.data));
      /* Penyambungnya memakai id yang DIPULANGKAN briTambah — bukan id
         karangan. Yang salah id menyambungkan DP ke baris orang lain. */
      T('disambungkan ke id baris yang baru dibuat',
        baru[1].body.data.id === 'bBaru1' && baru[1].body.data.dpId === 'p2'
        && baru[1].body.data.cara === 'cocok', JSON.stringify(baru[1].body.data));
      T('nama & tanggal reservasinya ikut disalin',
        baru[1].body.data.resNama === 'Arlanda' && baru[1].body.data.resId === 'r1',
        JSON.stringify(baru[1].body.data));
    }
    T('formulirnya tertutup sesudah tersimpan', !S.tambah);
    T('layarnya mengatakan barisnya tersambung', /tersambung ke Arlanda/.test(S.pesan || ''), S.pesan);
  }

  /* ===== PENYAMBUNGAN YANG GAGAL TIDAK BOLEH DIAM =====
     Barisnya sudah tersimpan — uangnya memang masuk — tapi ia berdiri di
     kelompok yang SALAH sampai ada yang menyambungkannya. Dibiarkan diam,
     satu DP tetap tertagih di daftar kerja sementara uangnya sudah tercatat
     sebagai bukan-reservasi, dan totalnya berhenti bisa dicocokkan. */
  {
    W.cbTutupTambah();
    W.cbGambar(el, '2026-09');
    await tidur(20);
    /* p4 (Citra), BUKAN p3 — p3 tidak punya tanggal transfer, jadi
       formulirnya ditahan penjaga kelengkapan dan tidak pernah sampai ke
       penyambungnya. Asersinya lalu hijau/merah karena sebab yang sama
       sekali lain. */
    aman('buka Catat lagi', () => { W.cbCatatDp('p4'); });
    SRV.tolakCocok = true;
    await amanAsync('menyimpan tidak melempar walau penyambungnya ditolak',
      async () => { await W.cbSimpanTambah(); });
    T('barisnya tetap dinyatakan TERSIMPAN', /TERSIMPAN/.test(S.pesan || ''), S.pesan);
    T('dan dikatakan BELUM tersambung', /BELUM tersambung/.test(S.pesan || ''), S.pesan);
    T('berikut apa yang harus dikerjakan', /tombol Cocokkan/.test(S.pesan || ''), S.pesan);
  }

  /* ===== FORMULIR BIASA (tanpa DP) TIDAK IKUT MENYAMBUNG ===== */
  {
    W.cbTutupTambah();
    W.cbGambar(el, '2026-09');
    await tidur(20);
    aman('buka formulir kosong', () => { W.cbBukaTambah(); });
    T('formulir kosong tidak membawa niat menyambung', !(S.tambah && S.tambah.dp));
    const pra2 = html().slice(html().indexOf('cb-pra'));
    T('bunyinya berbeda dari yang dibuka dari DP', pra2.indexOf('langsung disambungkan') < 0);
    W.cbKetikTambah({ value: '2026-09-11', classList: { remove: () => {} } }, 'tgl');
    W.cbKetikTambah({ value: '400000', classList: { remove: () => {} } }, 'nominal');
    W.cbKetikTambah({ value: 'Sewa videotron', classList: { remove: () => {} } }, 'ket');
    const n1 = SRV.post.length;
    await amanAsync('simpan formulir kosong', async () => { await W.cbSimpanTambah(); });
    const baru2 = SRV.post.slice(n1).filter(p => p.body.action === 'briCocok');
    T('tidak ada penyambungan yang ikut terkirim', baru2.length === 0);
    W.cbTutupTambah();
  }

  /* ===== KARTU ATAS TIDAK LAGI MENJANJIKAN BARIS YANG TERISI SENDIRI =====
     Janji yang tidak ditepati tiap kali dibaca. */
  W.cbGambar(el, '2026-09');
  await tidur(20);
  T('kartu atas tidak lagi bilang dana reservasi terisi sendiri',
    html().indexOf('terisi sendiri') < 0);
  T('kartu atas menunjuk ke daftar kerjanya',
    html().indexOf('DP Reservasi yang Belum Dicatat') >= 0);

  /* ===== HAK LIHAT ===== */
  bolehUbah = false;
  W.cbGambar(el, '2026-09');
  T('yang cuma boleh Lihat tidak diberi tombol tambah', html().indexOf('cbBukaTambah()') < 0);
  T('yang cuma boleh Lihat tetap melihat daftarnya', kartu('Dana Masuk BRI').indexOf('Arlanda') >= 0);
  /* BUKTI TETAP BISA DILIHAT: isinya bukan cuma isian, dan melihat bukti
     adalah melihat. Yang ditutup kotak metodenya, bukan buktinya. */
  T('yang cuma boleh Lihat tetap punya tombol bukti',
    kartu('DP Reservasi yang Belum Dicatat').indexOf("cbBuka('belum:p2')") >= 0);
  /* Tombol CATAT ditutup — ia menulis. Yang tidak boleh mengubah tetap
     melihat daftar kerjanya: tanpa itu ia tidak punya satu pun layar yang
     menyebutkan DP mana yang belum dicatat. */
  T('yang cuma boleh Lihat TIDAK diberi tombol Catat',
    kartu('DP Reservasi yang Belum Dicatat').indexOf("cbCatatDp('p2')") < 0);
  T('yang cuma boleh Lihat tetap melihat daftar kerjanya',
    kartu('DP Reservasi yang Belum Dicatat').indexOf('Arlanda') >= 0);
  W.cbBuka('belum:p2');
  T('yang cuma boleh Lihat melihat buktinya', html().indexOf('cb-bukti') >= 0);
  T('yang cuma boleh Lihat TIDAK diberi kotak metode', html().indexOf('id="cb-met-p2"') < 0);
  T('yang cuma boleh Lihat TIDAK diberi tombol tandai tidak valid',
    html().indexOf("cbAbaiDp('p2')") < 0);
  bolehUbah = true;
}

/* ============ 5c. BUKTI TERMUAT SENDIRI SAAT BARISNYA MASUK LAYAR ============
   Dijalankan di jsdom TERPISAH, dengan IntersectionObserver yang distub
   supaya langsung berbunyi. Dipasang di jsdom utama, ia akan mengunduh
   seluruh bukti sejak render pertama — dan seluruh asersi "belum ada yang
   diunduh sebelum panelnya dibuka" di sana jadi tidak bisa diuji lagi.
   Keduanya jalur yang sah: yang punya pengamat memuat sendiri, yang tidak
   punya tetap bisa menekan kotaknya. */
async function ujiPengamat() {
  console.log('\n[5c] Bukti termuat sendiri saat barisnya masuk layar');
  const jsdom = cariJsdom();
  if (!jsdom) { L('pengamat bukti', 'jsdom tidak ketemu'); return; }
  const { JSDOM } = jsdom;
  const dom = new JSDOM('<!doctype html><html><head></head><body><div id="app-view"></div></body></html>',
                        { runScripts: 'outside-only' });
  const W = dom.window;
  const SRV = bikinServer();
  /* Pengamat tiruan yang LANGSUNG berbunyi untuk tiap elemen yang diamati.
     Yang dijaga bukan IntersectionObserver-nya — itu milik peramban —
     melainkan bahwa asetnya BENAR-BENAR mengamati kotak buktinya dan
     mengunduh begitu barisnya masuk layar. */
  let diamati = 0, dilepas = 0;
  W.IntersectionObserver = function (cb) {
    this.observe = el => { diamati++; cb([{ isIntersecting: true, target: el }]); };
    this.disconnect = () => { dilepas++; };
  };
  W.alert = () => {}; W.confirm = () => true; W.prompt = () => '';
  new Function('window', 'document', 'fetch', 'alert', 'confirm', 'prompt', srcCb)
    (W, W.document, SRV.fetch, W.alert, W.confirm, W.prompt);
  const el = W.document.getElementById('app-view');
  W.cbPasang({ apiUrl: '/api', rsvUrl: '/rsv', sesi: () => ({ name: 'Rani', token: 't' }),
               bolehUbah: () => true, gambarUlang: () => W.cbGambar(el, '2026-09') });
  W.cbGambar(el, '2026-09');
  const S = W.__cbState;
  for (let i = 0; i < 80 && (!S.rows.length || !S.dps); i++) await tidur(10);
  for (let i = 0; i < 80 && !S.bukti['@f:k2']; i++) await tidur(10);
  T('kotak buktinya diamati', diamati > 0, 'diamati=' + diamati);
  T('bukti terunduh sendiri tanpa ada yang menekan apa pun',
    SRV.getFile.indexOf('k2') >= 0, JSON.stringify(SRV.getFile));
  T('gambarnya tergambar di barisnya', /<img[^>]*class="cb-thumb"/.test(el.innerHTML));
  /* HANYA YANG PERLU. DP tanpa bukti tidak punya kotak untuk diamati, dan
     bukti yang sudah inline tidak perlu diunduh sama sekali — menariknya
     tetap berarti satu permintaan sia-sia per baris. */
  T('DP tanpa bukti tidak ikut diunduh', SRV.getFile.indexOf('') < 0);
  T('bukti inline lama tidak ikut diunduh', SRV.getFile.length === new Set(SRV.getFile).size
    && SRV.getFile.every(k => k === 'k2' || k === 'k5'), JSON.stringify(SRV.getFile));
  /* PENGAMAT LAMA DILEPAS tiap render: halaman ini digambar ulang dari
     string HTML, jadi elemen yang diamati sudah bukan yang ada di layar.
     Yang tidak dilepas menumpuk satu per render sambil memegang node mati. */
  const d0 = dilepas;
  W.cbGambar(el, '2026-09');
  await tidur(20);
  T('pengamat lama dilepas saat halaman digambar ulang', dilepas > d0, 'dilepas=' + dilepas);
  /* Dan tidak mengunduh ulang apa yang sudah ada di cache. */
  const n = SRV.getFile.length;
  W.cbGambar(el, '2026-09');
  await tidur(30);
  T('tidak mengunduh ulang bukti yang sudah di cache', SRV.getFile.length === n,
    'bertambah ' + (SRV.getFile.length - n));
}

/* ============ 6. KONTRAK SISI PHP ============ */
function ujiPhp() {
  console.log('\n[6] Sisi PHP (sintaks + kontrak atas sumbernya)');
  const fLib = path.join(AKAR, 'kompas-mysql/lib_kompas_mysql.php');
  const fApi = path.join(AKAR, 'kompas-mysql/api.php');
  let parser = null;
  for (const k of ['php-parser', path.join(process.env.USERPROFILE || process.env.HOME || '', 'node_modules/php-parser')]) {
    try { parser = require(k); break; } catch (e) {}
  }
  if (parser) {
    for (const f of [fLib, fApi]) {
      aman('php-parser: ' + path.basename(f), () => {
        new parser({ parser: { suppressErrors: false } }).parseCode(fs.readFileSync(f, 'utf8'));
      });
    }
  } else {
    L('sintaks PHP diperiksa php-parser', 'php-parser belum terpasang — npm i php-parser');
  }

  const lib = fs.readFileSync(fLib, 'utf8');
  const api = fs.readFileSync(fApi, 'utf8');
  const badan = nama => {
    const i = lib.indexOf('function ' + nama + '(');
    if (i < 0) return '';
    const j = lib.indexOf('\nfunction ', i + 1);
    return lib.slice(i, j < 0 ? lib.length : j);
  };

  T('tabel bri_mutasi lahir lewat CREATE TABLE IF NOT EXISTS, bukan migrasi',
    /CREATE TABLE IF NOT EXISTS `bri_mutasi`/.test(lib));
  T('sidik dikunci UNIQUE', /UNIQUE KEY `uniq_bri_sidik`/.test(lib));
  const bSidik = badan('bri_sidik');
  T('sidik memuat nomor urut kemunculan', /'\|#' \. \(int\)\$k/.test(bSidik), bSidik.trim().slice(0, 120));

  const bCocokSatu = badan('bri_cocok_satu');
  T('bri_cocok_satu ada', !!bCocokSatu);
  /* SATU DP TIDAK BOLEH DIPEGANG DUA BARIS. Kalau boleh, satu DP diakui dua
     kali dan total dana tercocokkan lebih besar daripada uang yang masuk. */
  T('bentrok DP diperiksa sebelum menyimpan', /bri_dp_dipakai\(/.test(bCocokSatu));
  const bDp = badan('bri_dp_dipakai');
  T('pemeriksa bentrok melewati baris yang sudah dibatalkan', /`batal_at`=0/.test(bDp));
  T('pemeriksa bentrok mengecualikan baris itu sendiri', /`id`<>:x/.test(bDp));
  T('cara "bukan" menuntut catatan', /\$catatan === ''\) return 'Sebutkan dulu/.test(bCocokSatu));

  const bList = badan('bri_list');
  T('jumlah baris dihitung SEBELUM LIMIT',
    bList.indexOf('SELECT COUNT(*)') < bList.indexOf('LIMIT'));
  T('bri_list memulangkan sumber', bList.indexOf("'sumber' => (string)") >= 0);

  const bTambah = badan('bri_tambah');
  T('bri_tambah ada', !!bTambah);
  T('keterangan WAJIB di server, bukan cuma di layar',
    bTambah.indexOf("$ket === '')") >= 0 && bTambah.indexOf("$kurang[] = 'Keterangan'") >= 0);
  T('baris manual ditandai sumber=manual & cara=bukan', /'manual','bukan'/.test(bTambah));
  T('sidik baris manual dibedakan dari sidik unggahan',
    bTambah.indexOf("'m|' . bri_sidik(") >= 0);

  /* ---- NISAN DP TIDAK VALID (21 September 2026) ---- */
  const bAbai = badan('bri_abai');
  const bAbaiList = badan('bri_abai_list');
  const bAbaiPastikan = badan('bri_abai_pastikan');
  T('bri_abai ada', !!bAbai);
  T('tabelnya lahir sendiri lewat CREATE TABLE IF NOT EXISTS, bukan migrasi',
    /CREATE TABLE IF NOT EXISTS `bri_dp_abai`/.test(bAbaiPastikan));
  T('bri_abai memastikan tabelnya dulu', bAbai.indexOf('bri_abai_pastikan();') >= 0);
  /* ALASAN WAJIB DI SERVER. Baris yang dicabut dari rekonsiliasi tanpa sebab
     tidak bisa diperiksa siapa pun, dan ia jadi tempat paling mudah
     menyembunyikan uang yang sebenarnya belum dicocokkan. */
  T('alasan WAJIB di server, bukan cuma di layar',
    bAbai.indexOf("$alasan === ''") >= 0 && bAbai.indexOf('Sebutkan dulu kenapa baris ini tidak valid') >= 0,
    bAbai.slice(0, 60));
  /* NAMA PENANDANYA DARI SESI, bukan dari badan permintaan — nama yang
     dikirim layar bisa diketik siapa saja. */
  T('nama penandanya datang sebagai argumen, bukan dibaca dari data kiriman',
    /function bri_abai\(\$d, \$oleh\)/.test(bAbai) && bAbai.indexOf("$d['oleh']") < 0);
  T('pemulihan membuang nisannya, bukan menandainya lagi',
    bAbai.indexOf("DELETE FROM `bri_dp_abai` WHERE `dp_id`=?") >= 0);
  /* SATU DP SATU NISAN. Tanpa kunci primer di dp_id, menandai baris yang
     sama dua kali melahirkan dua nisan dan pemulihannya cuma mencabut satu. */
  T('dp_id jadi kunci primer, dan penandaan ulang menimpa',
    /`dp_id`   VARCHAR\(60\)  NOT NULL PRIMARY KEY/.test(bAbaiPastikan)
    && bAbai.indexOf('ON DUPLICATE KEY UPDATE') >= 0);
  /* NISANNYA IKUT DI BALASAN briList yang SAMA: dua permintaan yang datangnya
     tidak bersamaan membuat baris tercoret berkedip jadi hidup lagi sekejap
     tiap halaman digambar ulang. */
  T('nisan ikut dipulangkan bri_list', bList.indexOf("'abai' => bri_abai_list(") >= 0);
  /* NISAN TANPA TANGGAL SELALU IKUT: DP yang tanggal transfernya tidak
     terbaca memang tidak punya bulan, dan membuangnya membuat nisannya
     lenyap sementara barisnya hidup lagi di daftar. */
  T('nisan tanpa tanggal tetap ikut di rentang mana pun',
    bAbaiList.indexOf('`tgl` IS NULL OR `tgl` BETWEEN :d AND :s') >= 0);

  /* TIDAK ADA DELETE PADA `bri_mutasi` DI SELURUH JALUR BRI. Aturan nomor 0
     repo ini, dan di sini ia juga aturan produk: baris mutasi yang bisa
     dihapus membuat uang yang benar-benar masuk hilang dari rekonsiliasi.
     Satu-satunya DELETE yang ada mencabut NISAN (bri_dp_abai) — itu jalan
     pulang penandaan, bukan penghapusan catatan uang. */
  const semuaBri = ['bri_pastikan', 'bri_unggah', 'bri_cocok_satu', 'bri_cocok', 'bri_batal',
                    'bri_list', 'bri_tambah', 'bri_abai', 'bri_abai_list'].map(badan).join('\n');
  const delBri = (semuaBri.match(/\bDELETE\b[^\n]*/gi) || []);
  T('tidak ada DELETE/TRUNCATE pada bri_mutasi di seluruh jalur BRI',
    !/\bTRUNCATE\b/i.test(semuaBri) && delBri.every(b => b.indexOf('`bri_dp_abai`') >= 0),
    delBri.join(' | '));
  T('bri_batal menandai, bukan menghapus', /UPDATE `bri_mutasi` SET `batal_at`/.test(badan('bri_batal')));
  T('alasan pembatalan wajib', /Alasan pembatalan wajib diisi/.test(badan('bri_batal')));

  /* ROUTING. briList terbuka (aksi baca), aksi tulis berpagar sesi. */
  T('briList ada di router', /\$action === 'briList'/.test(api));
  /* briAbai WAJIB ikut di blok BERPAGAR itu, bukan berdiri sebagai cabang
     sendiri: nama yang tercatat sebagai penanda diambil server dari sesi
     yang sudah diverifikasi, dan cabang terbuka membuat siapa pun bisa
     mencabut baris rekonsiliasi atas nama siapa pun. */
  T('briAbai ikut di blok berpagar sesi, bukan cabang terbuka sendiri',
    api.indexOf("|| $action === 'briTambah' || $action === 'briAbai') {") >= 0);
  T('briAbai punya cabangnya di router', /\$action === 'briAbai'\)\s+\$r = bri_abai\(\$dt, \$nama\);/.test(api));
  const blokTulis = api.slice(api.indexOf("$action === 'briUnggah'"));
  T('kuncinya cashier ATAU finance',
    /sesi_punya_modul\(\$u, 'cashier'\) && !sesi_punya_modul\(\$u, 'finance'\)/.test(blokTulis));
  T('nama pencatat diambil dari sesi, bukan dari body',
    /\$nama = isset\(\$u\['name'\]\)/.test(blokTulis) && !/\$body\['oleh'\]/.test(blokTulis));
}

/* ============ 7. TUAN RUMAH ============ */
function ujiTuanRumah() {
  console.log('\n[7] Pemasangan di dua tuan rumah');
  const cas = fs.readFileSync(path.join(AKAR, 'deploy/cashier/index.html'), 'utf8');
  const kas = fs.readFileSync(path.join(AKAR, 'deploy/finance/kas/index.html'), 'utf8');

  for (const [nama, h, pfx] of [['cashier', cas, '../'], ['finance/kas', kas, '../../']]) {
    T(nama + ': memuat cocok-bri.js', h.indexOf('src="' + pfx + 'assets/cocok-bri.js"') >= 0);
    /* xlsx-baca.js DICABUT bersama jalur unggahnya. Dibiarkan termuat, kedua
       modul ini menyeret satu aset yang tidak dipanggil satu baris pun. */
    T(nama + ': TIDAK lagi memuat xlsx-baca.js',
      h.indexOf('src="' + pfx + 'assets/xlsx-baca.js"') < 0);
    /* TITLES adalah yang benar-benar mengunci halaman: render() menjatuhkan
       view yang tidak punya judul. Halaman yang punya menu tapi tidak punya
       judul MEMANTUL BALIK tanpa satu pun galat — pelajaran modul DW. */
    T(nama + ': bri punya baris di TITLES', /bri:\['Pencocokan QRIS BRI'/.test(h));
    /* SIDEBAR-NYA HTML STATIS di kedua modul. Menambah TITLES saja TIDAK
       melahirkan menunya — sudah menggigit di tab Void modul Analytics. */
    T(nama + ': bri punya <a data-view> di sidebar', h.indexOf('data-view="bri"') >= 0);
    T(nama + ': menunya punya tulisan yang terbaca', /data-view="bri"[\s\S]{0,400}?Pencocokan QRIS BRI/.test(h));
    T(nama + ': bri ada di peta router', /bri:viewBri/.test(h));
    T(nama + ': ketiadaan mesin dikatakan', /Mesin pencocokan tidak termuat/.test(h));
    T(nama + ': tidak menyalin rumus pencocokan',
      !/function cbUsulan|function panelDp|const BABAK/.test(h));
  }
  /* JALUR RESERVASI: panel Kas dua tingkat di dalam deploy/, jadi `../../`.
     Yang kurang satu tingkat tidak melempar — ia memulangkan 404 server.
     Sejak 21 September 2026 jalur ini bukan cuma dibaca: metode DP ditulis
     balik lewatnya, jadi yang salah tingkat membuang perubahan orang. */
  T('cashier memakai ../reservasi-api-mysql', cas.indexOf("rsvUrl:'../reservasi-api-mysql/api.php'") >= 0);
  T('finance/kas memakai ../../reservasi-api-mysql', kas.indexOf("rsvUrl:'../../reservasi-api-mysql/api.php'") >= 0);
  T('cashier bacaSesi membawa token', /token:s\.token/.test(cas));
  T('finance/kas bacaSesi membawa token', /token:s\.token/.test(kas));
  T('finance/kas: bri ada di AKS_HAL_ISI', /'rekap','bri','invoice'/.test(kas));
  T('finance/kas: bri punya baris DEFAULT_PERMS', /bri\s+:\{staf:PERM_EDIT/.test(kas));
  T('finance/kas: mesin diberi bolehUbah yang sungguhan', /bolehUbah:\(\)=>bolehUbah\('bri'\)/.test(kas));

  /* GAYA DIKURUNG #cb-wrap. Ditulis global, .card/.stat/.seg/th/td di dua
     puluhan halaman lain kedua modul ikut bergeser. Komentar dibuang dulu:
     penjelasan di atas aturannya menyebut nama kelas apa adanya. */
  const mGaya = srcCb.match(/const GAYA = `([\s\S]*?)`;/);
  T('blok GAYA ketemu', !!mGaya);
  if (mGaya) {
    const baris = mGaya[1].split('\n')
      .map(b => b.replace(/\/\*[\s\S]*?\*\//g, '').trim())
      .filter(b => b && !b.startsWith('/*') && !b.startsWith('*'))
      .filter(b => /\{/.test(b));
    /* SATU PENGECUALIAN, dan cuma satu: #cb-lightbox-root. Wadahnya memang
        menempel ke <body>, di luar #cb-wrap — position:fixed di dalam pohon
        tuan rumah bergantung pada tidak adanya satu pun leluhur
        ber-transform/filter/contain, dan rantai itu milik modul lain yang
        boleh berubah kapan saja tanpa ada yang ingat halaman ini.
        Selain kedua awalan itu, aturan telanjang tetap dilarang: ia akan
        menggeser dua puluhan halaman lain di kedua modul. */
    const nakal = baris.filter(b => b.indexOf('#cb-wrap') !== 0 && b.indexOf('#cb-lightbox-root') !== 0);
    T('seluruh aturan CSS dikurung #cb-wrap atau #cb-lightbox-root',
      nakal.length === 0, nakal.slice(0, 3).join(' | '));
    T('gaya lightbox dikurung wadahnya sendiri',
      /#cb-lightbox-root .cb-lightbox{/.test(mGaya[1]));
    /* OFFSET DITULIS SATU PER SATU, bukan inset: — pemendekan yang tidak
       dimengerti peramban lama membuat overlay-nya jatuh ke posisi statis,
       yaitu di bawah seluruh halaman, tanpa satu pun galat. */
    T('offset lightbox ditulis satu per satu, bukan inset',
      /#cb-lightbox-root .cb-lightbox{[^}]*top:0;right:0;bottom:0;left:0/.test(mGaya[1]));
    /* Tombol di dalamnya berdiri DI LUAR #cb-wrap, jadi gaya tombolnya wajib
       ditulis lagi — tanpa itu "Tutup" tergambar sebagai tombol polos
       bawaan peramban. */
    T('gaya tombol ikut ditulis untuk wadah lightbox',
      /#cb-lightbox-root .cb-btn{/.test(mGaya[1]));
    T('keadaan aktif saklar ikut dikurung',
      /#cb-wrap \.cb-seg button\.on/.test(mGaya[1]) && /button\.active/.test(mGaya[1]));
    /* Struk transfer berbentuk potret panjang; digambar sebesar aslinya ia
       mendorong kotak metode dan tombol di bawahnya jauh keluar layar. */
    T('tinggi gambar bukti dijepit', /#cb-wrap \.cb-bukti img\{[^}]*max-height/.test(mGaya[1]));
  }
  T('aset punya pemformat sendiri', /const CB_RP =/.test(srcCb) && /const CB_NUM =/.test(srcCb));
  T('seluruh isi aset di dalam SATU IIFE',
    /^\s*\(function \(G\) \{/m.test(srcCb) && /\}\)\(window\);\s*$/.test(srcCb));
}

/* ============ JALAN ============ */
(async () => {
  await ujiHalaman();
  await ujiPengamat();
  ujiPhp();
  ujiTuanRumah();
  console.log('\n' + '='.repeat(56));
  console.log('  OK: ' + ok + '   GAGAL: ' + gagal + '   LEWAT: ' + lewat);
  console.log('='.repeat(56));
  if (gagal) process.exit(1);
})();
