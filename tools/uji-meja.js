/* uji-meja.js — halaman Performa Meja di modul Analytics
 *
 *   node tools/uji-meja.js
 *   JSDOM_PATH=/jalur/ke/jsdom node tools/uji-meja.js
 *
 * Halaman ini mempertemukan dua sumber yang sebelumnya tidak pernah bertemu:
 * omset per meja dari berkas POS, dan kapasitas tiap meja dari denah milik
 * modul Reservasi (deploy/assets/venue-layouts.js).
 *
 * YANG DIJAGA DI SINI TERUTAMA TIGA HAL, dan ketiganya gagal DIAM kalau lepas:
 *
 *   1. PENERJEMAH NAMA. POS menulis "U 3" dan "EXTRA 15"; denah menulis "U3"
 *      dan "EXT 15". Tanpa penerjemahnya, 18 meja jatuh ke "tidak ada di
 *      denah" berikut omsetnya — halaman ini lalu melaporkan lubang yang tidak
 *      ada, dan yang membacanya menambahkan meja yang sudah lama terdaftar.
 *
 *   2. INVARIAN OMSET. omset meja + Quick Service + tanpa meja + yang tidak
 *      dikenal HARUS sama persis dengan omset sebulan. Itu satu-satunya
 *      pemeriksaan di sini yang tidak bisa basi sendiri: ia menangkap
 *      pengelompokan apa pun yang salah, termasuk baris yang diam-diam
 *      dibuang.
 *
 *   3. PEMBAGI "Rp per kursi". Kapasitas di denah kadang RENTANG ("4-5",
 *      "10-12"), dan yang dipakai batas BAWAHnya. Dipakai batas atas, angkanya
 *      bergeser sampai 20% tanpa satu pun label ikut berubah.
 *
 * Berkas POS-nya DIBUAT DI SINI sebagai CSV dan didorong lewat
 * anPilihBerkas -> uraiPos -> anSimpanUnggah yang SUNGGUHAN — bukan dengan
 * menyuntikkan `meja` ke AN.data.laporan. Daftar kunci tertutup di
 * anSimpanUnggah() adalah tempat `paket`, `kategori`, dan `katMenu` pernah
 * tertinggal lima hari tanpa satu pun galat, dan kunci baru lewat jalur yang
 * sama persis.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const { JSDOM } = (() => {
  for (const p of [process.env.JSDOM_PATH, path.join(ROOT, 'node_modules', 'jsdom'), 'jsdom']) {
    if (!p) continue;
    try { return require(p); } catch (e) { /* coba berikutnya */ }
  }
  console.error('jsdom tidak ketemu. Pasang `npm i jsdom`, atau setel JSDOM_PATH ke foldernya.');
  process.exit(2);
})();

let ok = 0, gagal = 0;
const cek = (n, s, k) => { if (s) { ok++; console.log('  OK   ' + n); } else { gagal++; console.log('  GAGAL ' + n + (k ? '  — ' + k : '')); } };
const sama = (n, d, h) => cek(n, d === h, 'dapat ' + JSON.stringify(d) + ', harusnya ' + JSON.stringify(h));
const aman = (n, fn) => { try { fn(); } catch (e) { gagal++; console.log('  GAGAL ' + n + '  — melempar: ' + e.message); } };
const tunggu = ms => new Promise(r => setTimeout(r, ms));

/* ---- ASET DISISIPKAN INLINE: jsdom tidak mengambil skrip eksternal ----
   venue-layouts.js ITU YANG PALING MENENTUKAN di berkas ini. Kalau tagnya
   dibiarkan sebagai src, `window.LM_VENUE_LAYOUTS` tidak pernah ada, halaman
   jatuh ke cabang "denah tidak termuat", dan SELURUH asersi kapasitas lewat
   tanpa menyentuh apa pun sambil tetap hijau. */
const HTML = (() => {
  let h = fs.readFileSync(path.join(ROOT, 'deploy/analytics/index.html'), 'utf8');
  const pasang = (tag, berkas) => {
    const src = '<script src="../assets/' + tag + '"><' + '/script>';
    if (h.indexOf(src) < 0) { console.error('tag ' + tag + ' tidak ketemu di sumber analytics'); process.exit(2); }
    h = h.replace(src, () => '<script>' + fs.readFileSync(path.join(ROOT, 'deploy/assets/' + berkas), 'utf8') + '<' + '/script>');
  };
  pasang('xlsx-baca.js', 'xlsx-baca.js');
  pasang('performa-bonus.js', 'performa-bonus.js');
  pasang('venue-layouts.js', 'venue-layouts.js');
  return h;
})();

/* ---------------- berkas POS tiruan ----------------
   Bentuk Bill Report: satu baris per bill, kolom mejanya bernama "Table".
   Tiap baris menjawab satu pertanyaan, dan angkanya dipilih supaya TIAP
   kesalahan memberi hasil yang BERBEDA — tidak satu pun bertabrakan:

     21          cap 4      denah cocok apa adanya
     U 3         cap 9      POS berspasi, denah "U3"      -> penerjemah spasi
     EXTRA 15    cap 4      POS "EXTRA", denah "EXT 15"   -> penerjemah singkatan
     R1          cap 10-12  kapasitas RENTANG             -> pembaginya 10
     EXTRA 12    -          TIDAK ADA di denah            -> dilaporkan, bukan dibuang
     Quick Servi -          BUKAN meja                    -> pitanya sendiri
     (kosong)    -          kolom mejanya kosong          -> "tanpa meja"

   omset meja      = 3.000.000 + 4.500.000 + 800.000 + 5.000.000 = 13.300.000
   Quick Service   = 2.200.000
   tanpa meja      =   300.000
   tidak di denah  =   600.000
   ------------------------------------------------- +
   omset sebulan   = 16.400.000
   kursi terpakai  = 4 + 9 + 4 + 10 = 27  ->  Rp per kursi = 492.593           */
const BARIS = [
  ['2026-09-02', '21',            1000000],
  ['2026-09-03', '21',            2000000],
  /* SATU BILL, DUA BARIS — bentuk Detail Report. Transaksinya wajib dihitung
     dari nomor bill yang BERBEDA, bukan dari jumlah baris: jebakan yang sama
     persis dengan r.bill dan kunjung, dan yang salah memberi "rata-rata per
     transaksi" separuh dari yang benar. Keduanya memakai nomor bill yang sama
     lewat kolom kelima (lihat penyusun CSV di bawah). */
  ['2026-09-02', 'U 3',           2250000, 'SAMA'],
  ['2026-09-02', 'U 3',           2250000, 'SAMA'],
  ['2026-09-03', 'EXTRA 15',       800000],
  ['2026-09-04', 'R1',            5000000],
  ['2026-09-04', 'EXTRA 12',       600000],
  ['2026-09-02', 'Quick Service', 1500000],
  ['2026-09-05', 'Quick Service',  700000],
  ['2026-09-05', '',               300000],
  /* BULAN SEBELAH. Berkas POS boleh menyeberang bulan, dan meja[] wajib
     dibuang untuk bulan yang tidak terpilih - aturan yang SAMA PERSIS dengan
     hari[], hariJam[], dan error[]. Nilainya sengaja jauh lebih besar daripada
     baris mana pun: kalau ia ikut, tidak ada satu angka pun di halaman ini
     yang masih cocok. */
  ['2026-08-30', '21',          99000000],
];
const CSV = (() => {
  /* cariBarisKepala() menuntut minimal lima sel non-angka di baris kepala —
     itu yang membedakannya dari sepuluh baris judul di berkas POS asli. */
  const b = ['Sales Date,Bill Number,Sales In Time,Visit Purpose,Table,Grand Total,Net Sales,Pax Total'];
  BARIS.forEach((r, i) => b.push(r[0] + ',SLM' + (r[3] ? r[3] : 100000 + i) + ',20:10:00,DINE IN,'
    + (r[1] ? '"' + r[1] + '"' : '') + ',' + r[2] + ',' + r[2] + ',1'));
  return b.join('\n');
})();
const G_MEJA = 13300000, G_QS = 2200000, G_TANPA = 300000, G_ASING = 600000;
const GRAND = G_MEJA + G_QS + G_TANPA + G_ASING;

function buka(opt) {
  opt = opt || {};
  const dom = new JSDOM(HTML, {
    url: 'https://dev.laksamanamuda.id/analytics/', runScripts: 'dangerously', pretendToBeVisual: true,
    beforeParse(w) {
      w.alert = () => {}; w.confirm = () => true;
      w.DecompressionStream = DecompressionStream; w.Blob = Blob;
      w.Response = Response; w.TextDecoder = TextDecoder;
      try {
        w.localStorage.setItem('lm_session', JSON.stringify({
          expiry: Date.now() + 3600000, userId: 'u-wandi', name: 'Wandi Pranata',
          modules: ['analytics'], adminModules: ['analytics'] }));
      } catch (e) {}
      const jawab = o => ({ ok: true, status: 200, text: async () => JSON.stringify(o), json: async () => o });
      w.fetch = async (url, init) => {
        const body = init && init.body ? JSON.parse(init.body) : {};
        const u = String(url);
        if (body.action === 'analyticsGet') return jawab({ ok: true, data: opt.an || { data: { laporan: {}, setting: {} }, akses: {}, peran: {} } });
        if (body.action === 'analyticsSave') return jawab({ ok: true, data: { saved: true } });
        if (u.indexOf('hpp.php') > -1) return jawab({ bahan: [], resep: [], setting: {}, ts: '2026-09' });
        return jawab({ ok: true, data: {} });
      };
    }
  });
  return dom.window;
}
async function siap(w) {
  for (let i = 0; i < 160; i++) {
    try { if (w.eval('typeof AN !== "undefined" && AN !== null')) return; } catch (e) {}
    await tunggu(40);
  }
  throw new Error('modul Analytics tidak pernah siap');
}
async function unggah(w, csv) {
  const file = new w.File([csv], 'pos-sep.csv', { type: 'text/csv' });
  file.text = async () => csv;
  file.arrayBuffer = async () => new TextEncoder().encode(csv).buffer;
  w.eval('UNGGAH_HASIL = null');
  await w.anPilihBerkas({ files: [file] });
  for (let i = 0; i < 300 && !w.eval('UNGGAH_HASIL'); i++) await tunggu(25);
  return w.eval('UNGGAH_HASIL');
}
const layar = w => (w.document.getElementById('app-view') || { innerHTML: '' }).innerHTML;
/* Mengiris SATU kartu menurut <h3>-nya. Halaman ini punya dua tabel yang
   sama-sama menulis angka rupiah, dan asersi yang menyapu seluruh layar cocok
   dengan kartu yang bukan yang diuji — bentuk yang sudah menggigit tiga kali
   di tools/uji-analytics.js. */
function kartuJudul(html, judul) {
  const i = html.indexOf('<h3>' + judul + '</h3>');
  if (i < 0) return '';
  const j = html.indexOf('<h3>', i + 4);
  return html.slice(i, j < 0 ? html.length : j);
}
const angkaDi = (html, re) => { const m = html.match(re); return m ? m[1] : null; };

(async () => {

/* ================= 1. urai & simpan lewat jalur SUNGGUHAN ================= */
console.log('-- berkas POS -> ringkasan tersimpan --');
const w = buka();
await siap(w);
const u = await unggah(w, CSV);
cek('berkas terbaca', !!u && u.bulan === '2026-09', u ? String(u.bulan) : 'null');
aman('hasil urai', () => {
  /* ringkas.grand menjumlahkan SELURUH baris berkas, termasuk bulan sebelah.
     Itu memang perilaku yang sudah ada (lihat hari[]), dan justru sebabnya
     penyebut persen di halaman ini dihitung dari hari[], bukan dari sini. */
  sama('ringkas.grand memuat bulan sebelah juga', Math.round(u.ringkas.grand), GRAND + 99000000);
  sama('omset bulan terpilih', Math.round(Object.keys(u.hari).reduce((a2, t2) => a2 + u.hari[t2].grand, 0)), GRAND);
  sama('meja bulan sebelah TIDAK ikut', u.meja['21'].grand, 3000000);
  cek('meja diurai', !!u.meja, JSON.stringify(Object.keys(u.meja || {})));
  /* ENAM nama meja di berkas + satu kunci '(tanpa meja)' untuk baris yang
     kolom mejanya kosong = TUJUH. Yang kosong memang diberi namanya sendiri,
     bukan dibuang: ia tetap membawa omset. */
  sama('jumlah kunci meja (6 nama + tanpa meja)', Object.keys(u.meja || {}).length, 7);
  sama('penanda kolom meja ada', u.ringkas.mejaKolom, true);
  /* Transaksi dari nomor bill yang BERBEDA, bukan jumlah baris. Meja 21 punya
     dua bill di dua tanggal — dihitung per baris hasilnya kebetulan sama, jadi
     yang membedakan ada di berkas asli; di sini yang dijaga omsetnya. */
  sama('omset meja 21', u.meja['21'].grand, 3000000);
  sama('transaksi meja 21', u.meja['21'].bill, 2);
  sama('nama meja POS dipertahankan apa adanya', !!u.meja['U 3'], true);
});
/* DAFTAR KUNCI TERTUTUP: `meja` harus selamat melewati anSimpanUnggah(). */
w.eval('anSimpanUnggah()');
for (let i = 0; i < 100 && !w.eval('Object.keys(AN.data.laporan).length'); i++) await tunggu(25);
const tersimpan = JSON.parse(w.eval('JSON.stringify(AN.data.laporan["2026-09"] || null)'));
cek('ringkasan tersimpan', !!tersimpan);
aman('meja lolos daftar kunci tertutup', () => {
  cek('`meja` ikut tersimpan', !!(tersimpan && tersimpan.meja), JSON.stringify(Object.keys(tersimpan || {})));
  sama('isinya utuh', Object.keys((tersimpan || {}).meja || {}).length, 7);
});

/* ================= 2. hitungannya ================= */
console.log('-- mjHitung --');
const H = JSON.parse(w.eval('JSON.stringify(mjHitung(AN.data.laporan["2026-09"]))'));
aman('pengelompokan', () => {
  cek('denah venue termuat', !!H.D, 'tanpa denah, seluruh asersi kapasitas jadi hampa');
  /* baris[] sekarang memuat DUA jenis: meja yang cocok denah, dan baris TANPA
     MEJA (Quick Service) yang sejak 18 September 2026 ikut di tabel atas
     permintaan user. Keduanya dihitung TERPISAH — dijumlahkan jadi satu,
     mutasi yang menjatuhkan Quick Service ke jalur meja biasa lolos tanpa satu
     angka pun bergerak. */
  sama('meja yang cocok denah', H.baris.filter(x => !x.tanpaMeja).length, 4);
  sama('...plus satu baris tanpa meja', H.baris.filter(x => x.tanpaMeja).length, 1);
  sama('baris tanpa meja itu Quick Service', H.baris.filter(x => x.tanpaMeja)[0].n, 'Quick Service');
  /* Kapasitasnya NOL, bukan ditebak dari rata-rata meja lain: transaksi Quick
     Service tidak menempati kursi mana pun, jadi angka per kursi untuknya
     tidak punya arti — bukan sekadar tidak diketahui. */
  sama('...kapasitasnya nol, bukan ditebak', H.baris.filter(x => x.tanpaMeja)[0].kursi, 0);
  sama('...dan tidak menggeser kursi terpakai', H.kursiPakai, 27);
  sama('omset meja', Math.round(H.gMeja), G_MEJA);
  sama('Quick Service dipisah', Math.round(H.gBukan), G_QS);
  sama('tanpa meja dipisah', Math.round(H.gTanpa), G_TANPA);
  sama('yang tidak ada di denah dipisah', H.takKenal.length, 1);
  sama('...dan omsetnya', Math.round(H.takKenal[0].g), G_ASING);
  sama('...namanya', H.takKenal[0].n, 'EXTRA 12');
  cek('Quick Service TIDAK masuk "tidak ada di denah"',
      !H.takKenal.some(x => /quick/i.test(x.n)), JSON.stringify(H.takKenal.map(x => x.n)));
});
/* INVARIAN TERKUAT: tidak satu rupiah pun boleh hilang di pengelompokan. */
sama('omset meja + bukan meja + tanpa meja + tak dikenal = omset sebulan',
     Math.round(H.gMeja + H.gBukan + H.gTanpa + H.takKenal.reduce((a, x) => a + x.g, 0)), GRAND);

console.log('-- penerjemah nama POS <-> denah --');
const cari = id => H.baris.find(x => x.n === id);
aman('nama diterjemahkan', () => {
  cek('"U 3" di POS ketemu sebagai "U3" di denah', !!cari('U3'), JSON.stringify(H.baris.map(x => x.n)));
  sama('...kapasitasnya terbaca', cari('U3') && cari('U3').kursi, 9);
  cek('"EXTRA 15" di POS ketemu sebagai "EXT 15" di denah', !!cari('EXT 15'));
  sama('...zonanya terbaca', cari('EXT 15') && cari('EXT 15').zona, 'ext');
  sama('nama POS-nya ikut disimpan untuk kotak cari', cari('EXT 15') && cari('EXT 15').pos, 'EXTRA 15');
});

console.log('-- kapasitas & Rp per kursi --');
aman('pembagi', () => {
  const r1 = cari('R1');
  sama('kapasitas rentang ditulis apa adanya', r1 && r1.cap, '10-12');
  /* Batas BAWAH yang jadi pembagi. Dipakai batas atas, angkanya 416.667 —
     bergeser 20% tanpa satu pun label ikut berubah. */
  sama('...dibagi batas bawahnya', r1 && r1.kursi, 10);
  sama('...Rp per kursi', r1 && Math.round(r1.perKursi), 500000);
  sama('kursi meja yang terpakai', H.kursiPakai, 27);
  sama('Rp per kursi keseluruhan', Math.round(H.gMeja / H.kursiPakai), 492593);
  sama('rata-rata per transaksi meja 21', Math.round(cari('21').atv), 1500000);
  /* Dua baris, SATU bill. Dihitung per baris, transaksinya 2 dan rata-ratanya
     separuh dari yang benar - dua angka yang sama-sama terlihat masuk akal. */
  sama('satu bill dua baris tetap SATU transaksi', cari('U3').b, 1);
  sama('...rata-ratanya penuh, bukan separuh', Math.round(cari('U3').atv), 4500000);
});


console.log('-- Rp per orang & baris tanpa meja --');
aman('Rp per orang per bill', () => {
  /* omset / (transaksi x kapasitas) — sama saja dengan "rata-rata per
     transaksi dibagi kapasitas". Meja 21: 3.000.000 / (2 x 4) = 375.000.

     ANGKANYA SENGAJA BERBEDA dari Rp per kursi meja yang sama (750.000):
     kalau keduanya dibuat sama, mutasi yang menukar kedua kolomnya lolos
     tanpa satu angka pun bergerak. */
  sama('meja 21: Rp per orang', Math.round(cari('21').perOrang), 375000);
  sama('...dan itu BEDA dari Rp per kursi meja yang sama', Math.round(cari('21').perKursi), 750000);
  sama('...yaitu rata-rata per transaksi dibagi kapasitas',
       Math.round(cari('21').atv / cari('21').kursi), Math.round(cari('21').perOrang));
  sama('U3: satu bill sembilan kursi', Math.round(cari('U3').perOrang), 500000);
  sama('R1 dibagi batas bawah rentangnya', Math.round(cari('R1').perOrang), 500000);
  /* DIJUMLAHKAN DULU, BARU DIBAGI. Kursi-kunjungan = 4x2 + 9x1 + 4x1 + 10x1 = 31,
     jadi 13.300.000 / 31 = 429.032. Merata-rata keempat angka per meja memberi
     (375.000+500.000+200.000+500.000)/4 = 393.750 — angka yang sama masuk
     akalnya, dan itulah sebabnya keduanya sengaja dibuat berbeda di sini. */
  sama('kursi-kunjungan dijumlahkan', H.orangVisit, 31);
  sama('Rp per orang keseluruhan', Math.round(H.gMeja / H.orangVisit), 429032);
  const kalauRata = [375000, 500000, 200000, 500000].reduce((a, b) => a + b, 0) / 4;
  cek('...dan itu BUKAN rata-rata angka per meja',
      Math.round(kalauRata) !== Math.round(H.gMeja / H.orangVisit), 'keduanya ' + Math.round(kalauRata));
});
aman('baris tanpa meja tidak mengarang angka per kursi', () => {
  const qs = H.baris.filter(x => x.tanpaMeja)[0];
  sama('Rp per kursi ditahan', qs.perKursi, null);
  sama('Rp per orang ditahan', qs.perOrang, null);
  /* Rata-rata per transaksinya TETAP dihitung: ia tidak butuh kapasitas, dan
     justru itu satu-satunya angka pembanding yang dipunyai baris ini.
     2.200.000 / 2 bill = 1.100.000. */
  sama('...tapi rata-rata per transaksinya tetap ada', Math.round(qs.atv), 1100000);
  /* Omsetnya TIDAK ikut di gMeja — kalau ikut, Rp per kursi dan Rp per orang
     memasukkan uang yang tidak menempati satu kursi pun, dan keduanya diam-diam
     terlalu besar. */
  sama('omsetnya tidak ikut di omset meja', Math.round(H.gMeja), G_MEJA);
  sama('...melainkan di gBukan', Math.round(H.gBukan), G_QS);
  /* Penyebut kolom % di tabel = seluruh baris yang TAMPIL di sana. */
  sama('penyebut kolom persen memuat keduanya', Math.round(H.gTabel), G_MEJA + G_QS);
});
/* ================= 3. layarnya ================= */
console.log('-- halaman --');
w.eval("go('meja')");
const v = layar(w);
cek('halaman tergambar', v.indexOf('Per Meja') > -1, v.slice(0, 200));
aman('kartu & tabel', () => {
  cek('kartu Omset dari Meja menyebut angkanya', v.indexOf('Rp13.300.000') > -1);
  cek('kartu Rp per Kursi menyebut angkanya', v.indexOf('Rp492.593') > -1);
  cek('kartu Tanpa Meja menggabung Quick Service + tanpa meja', v.indexOf('Rp2.500.000') > -1);
  /* PERSENNYA DIHITUNG DARI hari[], bukan ringkas.grand. Berkas uji ini
     menyeberang bulan, jadi keduanya BERBEDA: 13,3jt dari 16,4jt = 81,1%,
     sementara ringkas.grand (115,4jt, memuat baris 30 Agustus) memberi 11,5%.
     Tanpa baris bulan sebelah di fixture, kedua penyebut itu sama persis dan
     asersi ini tidak menguji apa pun. */
  cek('persennya memakai omset BULAN INI, bukan seluruh isi berkas',
      v.indexOf('81.1%') > -1 && v.indexOf('11.5%') < 0,
      (v.match(/>[d.]+% dari omset sebulan/) || ['tidak ketemu'])[0]);
  /* Pembaginya DISEBUT DI SELNYA, bukan cuma di kepala kolom. Kepala kolom
     dibaca sekali, angkanya dibaca tiap baris — empat putaran pertanyaan di
     kolom Kontribusi lahir persis dari kolom yang pembaginya harus ditebak. */
  const perMeja = kartuJudul(v, 'Per Meja');
  cek('kapasitas rentang menyebut pembaginya di selnya', perMeja.indexOf('dibagi 10') > -1, perMeja.slice(0, 400));
  cek('pembagi "Rp per kursi" dikatakan bukan pax POS',
      /Pax Total<\/i> memang terisi/.test(v) && /kapasitas kursi/.test(v));
  /* Tiga pita, tiga arti. Digabung, yang membacanya tidak tahu mana yang perlu
     dibetulkan di denah dan mana yang memang bukan meja. */
  cek('Quick Service punya pitanya sendiri',
      /Ikut di tabel sebagai baris tanpa meja<\/b>[\s\S]{0,80}Quick Service/.test(v), 'tidak ketemu');
  cek('EXTRA 12 dilaporkan sebagai tidak ada di denah',
      /tidak ada di denah Reservasi<\/b>[\s\S]{0,120}EXTRA 12/.test(v));
  cek('...dan menyuruh membetulkan DENAHNYA, bukan berkas POS',
      /perlu dibetulkan <b>denahnya<\/b>/.test(v));
  cek('meja denah yang tidak terpakai dilaporkan jumlahnya',
      /<b>117 meja<\/b> ada di denah tapi/.test(v), (v.match(/<b>\d+ meja<\/b> ada di denah/) || ['?'])[0]);
  cek('...daftarnya dipotong, tidak 117 nama sekaligus', /dan \d+ lagi/.test(v));
});
aman('tabel per zona', () => {
  const z = kartuJudul(v, 'Per Zona Denah');
  cek('kartu Per Zona ada', !!z);
  cek('zona wood menyebut omsetnya', z.indexOf('Rp5.000.000') > -1, z.slice(0, 400));
  cek('menyebut berapa meja zona itu punya', /dari 8<\/span>/.test(z), 'wood punya 8 meja di denah');
});

aman('Rp per orang & baris tanpa meja di layar', () => {
  cek('kartu Rp per Orang menyebut angkanya', v.indexOf('Rp429.032') > -1,
      (v.match(/Rp per Orang[\s\S]{0,200}/) || ['tidak ketemu'])[0].replace(/<[^>]+>/g, ' ').slice(0, 160));
  /* BATAS BAWAH, dan itu WAJIB dikatakan: pembaginya kapasitas, bukan jumlah
     tamu sungguhan. Meja berkursi 4 yang diduduki 2 orang membuat belanja per
     orang yang sebenarnya dua kali lipat angka di kolom itu. */
  cek('dikatakan angkanya batas bawah', /BATAS BAWAH/.test(v), '');
  cek('...dan bedanya dengan Rp per kursi dijelaskan',
      /omset <b>sebulan<\/b> dibagi kursi/.test(v) && /omset <b>satu bill<\/b> dibagi kursi/.test(v), '');
  cek('kolomnya ada di tabel', v.indexOf('Rp per orang / bill') > -1, '');
  /* Baris Quick Service ikut di tabel — sebelumnya omset Rp2,2 juta sebulan
     tidak punya satu baris pun yang bisa diurutkan atau dibandingkan. */
  const tabel = v.slice(v.indexOf('<h3>Per Meja</h3>'));
  cek('Quick Service punya barisnya sendiri di tabel', tabel.indexOf('Quick Service') > -1, '');
  /* BARISNYA DIIRIS, bukan disapu dari seluruh tabel. Disapu, asersi di bawah
     cocok dengan sel milik baris lain — dan mutasi yang cuma merusak SATU dari
     dua kolom per-kursi lolos karena kolom satunya masih menulis kalimat yang
     dicari. Sudah kejadian saat asersi ini ditulis. */
  const barisQS = (tabel.match(/<tr><td><b>Quick Service<\/b>[\s\S]*?<\/tr>/) || [''])[0];
  cek('barisnya ketemu utuh', barisQS.length > 0, '');
  /* DUA kolom per-kursi, DUA-DUANYA ditahan: Rp per kursi dan Rp per orang. */
  sama('...kedua kolom per-kursinya ditandai tanpa meja',
       (barisQS.match(/tanpa meja<\/span>/g) || []).length, 2);
  /* "kapasitas tidak terbaca" itu kalimat untuk meja SUNGGUHAN yang kapasitasnya
     belum diisi di denah — pekerjaan. Baris tanpa meja bukan itu: ia jawaban. */
  cek('...dan BUKAN dengan kalimat "kapasitas tidak terbaca"',
      barisQS.indexOf('kapasitas tidak terbaca') < 0, '');
  /* Penyebut kolom % = seluruh baris tabel (15,5 jt), bukan omset meja saja
     (13,3 jt). Dengan penyebut yang salah barisnya berbunyi 16.5%. */
  cek('persen barisnya memakai penyebut seluruh tabel',
      barisQS.indexOf('14.2%') > -1, (barisQS.match(/\d+\.\d%/g) || ['tidak ketemu']).join(','));
  /* Zona denah TIDAK memuatnya: tabel itu menilai denah, dan baris yang tidak
     menempati zona mana pun cuma akan berdiri sebagai zona berkursi nol. */
  const zona = v.slice(v.indexOf('Per Zona Denah'), v.indexOf('<h3>Per Meja</h3>'));
  cek('tabel Per Zona TIDAK memuat baris tanpa meja', zona.indexOf('(tanpa meja)') < 0, '');
  cek('...dan itu dikatakan', /tidak ikut di tabel ini/.test(zona), '');
  /* Penyebut kolom persen disebut angkanya — persen yang penyebutnya harus
     ditebak sudah berkali-kali jadi pertanyaan di modul ini.

     YANG DICARI KALIMAT UTUHNYA, bukan angkanya saja: kaki tabel sudah lebih
     dulu menulis "jumlah omsetnya Rp15.500.000" untuk baris yang tampil, jadi
     asersi yang cuma mencari angkanya cocok dengan kalimat yang BUKAN yang
     diuji — dan mutasi yang mencabut keterangan penyebutnya lolos. Sudah
     kejadian saat asersi ini ditulis. */
  cek('penyebut kolom % disebut angkanya',
      /kolom <b>% omset<\/b> dibagi <b>Rp15\.500\.000<\/b>/.test(v), '');
});

console.log('-- urut & cari --');
aman('kepala kolom', () => {
  const sebelum = layar(w);
  cek('bawaannya omset menurun', sebelum.indexOf('Rp5.000.000') < sebelum.indexOf('Rp3.000.000'),
      'R1 (5jt) harus di atas meja 21 (3jt)');
  w.eval("mjUrut('kursi')");
  const isi = w.document.getElementById('mj_isi').innerHTML;
  cek('diurut menurut kapasitas', isi.indexOf('>U3<') < isi.indexOf('>21<'), 'U3 cap 9 harus di atas 21 cap 4');
  /* Menekan kepala kolom menggambar ulang WADAHNYA saja. Kalau ia memanggil
     render(), kotak carinya ikut dibuat ulang dan hanya huruf pertama yang
     masuk — jebakan queueF() modul Konten. */
  const kotak = w.document.getElementById('mj_q');
  w.eval("mjUrut('g')");
  cek('kotak cari TIDAK dibuat ulang saat mengurutkan',
      w.document.getElementById('mj_q') === kotak, 'elemennya berganti');
});
aman('kotak cari', () => {
  const kotak = w.document.getElementById('mj_q');
  kotak.value = 'wood'; w.mnCari(kotak);
  let isi = w.document.getElementById('mj_isi').innerHTML;
  cek('cari zona menyaring', isi.indexOf('>R1<') > -1 && isi.indexOf('>U3<') < 0, isi.slice(0, 300));
  /* Nama MENURUT POS harus tetap ketemu: itu yang barusan dibaca orang di
     berkasnya, dan kotak yang tidak menemukannya terasa rusak. */
  kotak.value = 'extra 15'; w.mnCari(kotak);
  isi = w.document.getElementById('mj_isi').innerHTML;
  cek('cari pakai nama POS ("EXTRA 15") tetap ketemu', isi.indexOf('EXT 15') > -1, isi.slice(0, 300));
  kotak.value = 'zzz'; w.mnCari(kotak);
  isi = w.document.getElementById('mj_isi').innerHTML;
  cek('kata kunci tanpa hasil DIKATAKAN, bukan tabel kosong', /Tidak ada meja yang cocok/.test(isi));
  kotak.value = ''; w.mnCari(kotak);
});

/* ================= 4. tiga keadaan kosong ================= */
console.log('-- keadaan kosong --');
{
  const w2 = buka({ an: { data: { laporan: { '2026-08': { jenis: 'bill', ringkas: { grand: 1 }, hari: {}, jam: [] } }, setting: {} }, akses: {}, peran: {} } });
  await siap(w2);
  w2.eval("go('meja')");
  const t = layar(w2);
  cek('laporan lama: menyuruh unggah ulang', /belum memuat data meja/.test(t) && /Unggah ulang berkas bulan itu/.test(t), t.slice(0, 260));
}
{
  const w3 = buka({ an: { data: { laporan: { '2026-08': { jenis: 'bill', meja: {}, ringkas: { grand: 1, mejaKolom: false }, hari: {}, jam: [] } }, setting: {} }, akses: {}, peran: {} } });
  await siap(w3);
  w3.eval("go('meja')");
  const t = layar(w3);
  /* "Berkasnya tidak punya kolom meja" dan "bulan ini memang tidak ada
     transaksi bermeja" memulangkan bentuk data yang SAMA PERSIS. Disamakan,
     yang membacanya menyimpulkan bulan itu bersih padahal tidak ada satu pun
     yang pernah diperiksa. */
  cek('kolomnya tidak ada: menyuruh ekspor ulang dari POS',
      /tidak punya kolom meja/.test(t) && /ikut dicentang/.test(t), t.slice(0, 260));
  cek('...dan TIDAK menyuruh unggah ulang ringkasan', !/Unggah ulang berkas bulan itu/.test(t));
}
{
  const w4 = buka({ an: { data: { laporan: { '2026-08': { jenis: 'bill', meja: {}, ringkas: { grand: 1, mejaKolom: true }, hari: {}, jam: [] } }, setting: {} }, akses: {}, peran: {} } });
  await siap(w4);
  w4.eval("go('meja')");
  const t = layar(w4);
  cek('kolomnya ada tapi kosong: itu JAWABAN, bukan kesalahan',
      /Tidak ada satu pun transaksi bermeja/.test(t) && /bukan kesalahan/.test(t), t.slice(0, 260));
}

/* ================= 5. menu & judulnya ================= */
console.log('-- menu sidebar --');
aman('sidebar', () => {
  const a = w.document.querySelector('a[data-view="meja"]');
  cek('menunya ada di sidebar', !!a, 'SIDEBAR ITU HTML STATIS — menambah TITLES saja tidak melahirkan menunya');
  cek('...ada tulisannya', !!a && a.textContent.trim().length > 3, a ? JSON.stringify(a.textContent) : '');
  cek('...tidak disembunyikan', !!a && a.style.display !== 'none', a ? a.style.display : '');
  cek('punya judul di TITLES', w.eval('!!TITLES.meja'));
});

/* ================= 6. berkas POS ASLI (penguat) ================= */
console.log('-- berkas POS asli --');
{
  const nm = fs.readdirSync(ROOT).find(x => /^Sales Recapitulation Report.*\.xlsx$/i.test(x));
  if (!nm) {
    console.log('  LEWAT  berkas "Sales Recapitulation Report*.xlsx" tidak ada di root repo.');
  } else {
    const w5 = buka(); await siap(w5);
    const buf = fs.readFileSync(path.join(ROOT, nm));
    const file = new w5.File([new Uint8Array(buf)], nm,
      { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    file.arrayBuffer = async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    file.text = async () => buf.toString('utf8');
    w5.eval('UNGGAH_HASIL = null');
    await w5.anPilihBerkas({ files: [file] });
    for (let i = 0; i < 400 && !w5.eval('UNGGAH_HASIL'); i++) await tunggu(50);
    const u5 = w5.eval('UNGGAH_HASIL');
    if (!u5) { cek('berkas asli terbaca', false, 'UNGGAH_HASIL tetap null'); }
    else {
      const H5 = JSON.parse(w5.eval('JSON.stringify(mjHitung(UNGGAH_HASIL))'));
      /* Angka-angka ini dari BERKAS POS, bukan dari kode yang diuji — jadi
         kalau salah satunya bergerak, yang berubah aturan pencocokannya. */
      cek('120 dari 123 nama meja cocok dengan denah',
          H5.baris.filter(x => !x.tanpaMeja).length === 120,
          'dapat ' + H5.baris.filter(x => !x.tanpaMeja).length);
      cek('Quick Service dikenali bukan meja', H5.bukan.length === 1 && /quick/i.test(H5.bukan[0].n),
          JSON.stringify(H5.bukan.map(x => x.n)));
      cek('EXTRA 12 & 13 dilaporkan tidak ada di denah',
          H5.takKenal.length === 2 && H5.takKenal.every(x => /^EXTRA 1[23]$/.test(x.n)),
          JSON.stringify(H5.takKenal.map(x => x.n)));
      cek('meja 67 tidak sekali pun dipakai', H5.nganggur.indexOf('67') > -1, JSON.stringify(H5.nganggur));
      /* INVARIAN yang sama, atas data sungguhan. */
      const jum = H5.gMeja + H5.gBukan + H5.gTanpa + H5.takKenal.reduce((a, x) => a + x.g, 0);
      cek('omsetnya berjumlah pas ke omset sebulan',
          Math.abs(jum - u5.ringkas.grand) < 1, Math.round(jum) + ' vs ' + Math.round(u5.ringkas.grand));
      console.log('         [produksi] omset meja ' + Math.round(H5.gMeja).toLocaleString('id')
        + ' / ' + H5.kursiPakai + ' kursi = Rp' + Math.round(H5.gMeja / H5.kursiPakai).toLocaleString('id') + ' per kursi');
    }
  }
}

console.log('\n' + ok + ' OK, ' + gagal + ' GAGAL');
process.exit(gagal ? 1 : 0);
})();
