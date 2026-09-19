/* Uji tiga permintaan user 19 September 2026:

     1. "di bagian rekap penjualan ada tambahkan persentase di sebelah tulisan
        MDR, jadi ketahuan ketika isi MDR nanti berapa persentasenya"
     2. "bagian modul cashier dan reservasi bisa di filter berdasarkan
        reservasi di hari itu, dan bisa juga filter berdasarkan duit masuk
        tanggal berapa"
     3. "tambahkan juga dana masuk di kas kecil"

   KENAPA UJI SENDIRI. `tools/smoke-modul.js` TIDAK MENYENTUH
   deploy/finance/kas/ sama sekali — daftarnya cuma memuat `finance`, halaman
   PEMILIH panel yang tidak berisi aplikasi apa pun — dan melaporkan modul
   Reservasi sebagai "hanya boot yang diuji". Jadi tidak satu baris pun dari
   ketiga perubahan ini pernah dijalankan sebelum berkas ini ada.

   YANG DIJAGA, dan tidak satu pun gagal sebagai galat:

     - PENYEBUT persentase MDR adalah Aktual KOTOR kelompok yang memang kena
       potongan. Dibagi seluruh setoran (cash ikut), angkanya jatuh jauh di
       bawah tarif bank dan tidak bisa dicocokkan dengan perjanjian mana pun;
       dibagi Aktual MASUK, ia selalu sedikit lebih besar daripada tarifnya.
       Dua-duanya terlihat wajar di layar.
     - DUA DESIMAL. Dibulatkan, QRIS 0,7% terbaca "1%" — persis angka yang
       sedang dicocokkan orang dengan perjanjian banknya.
     - Persennya IKUT HIDUP saat angkanya diketik, termasuk saat kursor berada
       DI DALAM kotak MDR — di keadaan itu selnya sengaja tidak digambar ulang,
       jadi persen yang tidak disegarkan lewat DOM akan membeku dan berbohong
       sejak ketukan pertama.
     - Saringan Dana Masuk punya DUA basis tanggal dan keduanya benar-benar
       memulangkan daftar yang berbeda. Saklar yang tidak mengubah apa pun
       adalah saklar yang hasilnya dipercaya orang tanpa alasan.
     - Basis BAWAANNYA tetap 'reservasi'. Bawaan yang bergeser mengubah arti
       tombol "Hari Ini" untuk semua orang dalam satu deploy.
     - Baris yang tanggal transfernya belum terbaca DISEBUT jumlahnya saat
       basisnya 'uang masuk' — ia ikut lewat tanggal reservasinya, dan yang
       menjumlahkan kolomnya mengira itu setoran hari itu.
     - Halaman Dana Masuk di Kas Kecil memuat BINGKAI milik modul Reservasi
       dengan jalur `../../`, bukan salinan dan bukan `../` (panel ini dua
       tingkat di dalam deploy/; jalur yang kurang satu tingkat memulangkan
       404 server, bukan galat).
     - Gerbang SSO modul Reservasi benar-benar meloloskan pemegang `finance`
       LEWAT PINTU EMBED SAJA. Dijalankan, bukan dibaca dari sumbernya. */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const { JSDOM, VirtualConsole } = (() => {
  for (const p of [process.env.JSDOM_PATH, path.join(ROOT, 'node_modules', 'jsdom'), 'jsdom']) {
    if (!p) continue;
    try { return require(p); } catch (e) { /* coba berikutnya */ }
  }
  console.error('jsdom tidak ketemu. Pasang `npm i jsdom`, atau setel JSDOM_PATH ke foldernya.');
  process.exit(2);
})();

const HTML_KAS = fs.readFileSync(path.join(ROOT, 'deploy', 'finance', 'kas', 'index.html'), 'utf8');
const HTML_RSV = fs.readFileSync(path.join(ROOT, 'deploy', 'reservasi', 'index.html'), 'utf8');
/* venue-layouts.js disisipkan inline: jsdom tidak mengambil skrip eksternal,
   dan modul Reservasi SENGAJA berhenti keras kalau denahnya tidak termuat. */
const ASSET = fs.readFileSync(path.join(ROOT, 'deploy', 'assets', 'venue-layouts.js'), 'utf8');
const HTML_RSV_UJI = HTML_RSV.replace(
  '<script src="../assets/venue-layouts.js"><' + '/script>',
  () => '<script>' + ASSET + '<' + '/script>');
if (HTML_RSV_UJI === HTML_RSV) { console.error('tag venue-layouts.js tidak ketemu'); process.exit(2); }

let lulus = 0, gagal = 0;
const cek = (nama, syarat, ket) => {
  if (syarat) { lulus++; console.log('  OK   ' + nama); }
  else { gagal++; console.log('  GAGAL ' + nama + (ket ? '  -> ' + ket : '')); }
};
const tunggu = ms => new Promise(r => setTimeout(r, ms));
/* Blok yang bisa melempar dibungkus supaya satu kegagalan tidak membunuh
   seluruh berkas: mutasi yang mematikan uji terbaca "tidak selesai", bukan
   "tertangkap", dan hasilnya tidak bisa dibaca sama sekali. */
const aman = (nama, fn) => { try { return fn(); } catch (e) { cek(nama, false, String(e && e.message)); } };

/* ============ DATA UJI: REKAP PENJUALAN ============
   Tiap persentase dipilih supaya TIDAK MUNGKIN tertukar dengan yang lain, dan
   supaya penyebut yang salah memberi angka yang jelas berbeda:

     EDC BCA       kotor 1.000.000  masuk   980.000 -> MDR  20.000 =  2,00%
     QRIS BRI      kotor 2.000.000  masuk 1.986.000 -> MDR  14.000 =  0,70%
     Gofood        kotor   500.000  masuk   400.000 -> MDR 100.000 = 20,00%
     QRIS Mandiri  kotor 1.000.000  masuk 1.050.000 -> MDR  10.000 =  1,00%  (BERLEBIH)
     Cash          kotor 3.000.000  (tanpa MDR)     -> tidak punya persen

   Total MDR 144.000 dari kotor ber-MDR 4.500.000 = 3,20%.
   Kalau cash ikut jadi penyebut: 144.000 / 7.500.000 = 1,92% — angka yang
   sama wajarnya di layar, jadi penyebut yang melar punya tempat ketahuan. */
const TGL = '2026-08-01';
const REPORTS = {};
REPORTS[TGL] = {
  pay: {
    cash:         { pos: 3000000, actual: 3000000 },
    edc_bca:      { pos: 1000000, actual: 1000000 },
    qris_bri:     { pos: 2000000, actual: 2000000 },
    gofood:       { pos:  500000, actual:  500000 },
    /* QRIS Mandiri sengaja BERLEBIH: aktual masuk melampaui kotor, dan itulah
       satu-satunya keadaan yang membuat kolom MDR berubah jadi kotak isian. */
    qris_mandiri: { pos: 1000000, actual: 1000000 }
  },
  aktual: { edc_bca: 980000, qris_bri: 1986000, gofood: 400000, qris_mandiri: 1050000 },
  mdrManual: { qris_mandiri: 10000 }
};
const DAILY = [{ date: TGL, food: 6000000, bev: 1500000, lainnya: 0, discount: 0,
                 service_charge: 0, tax: 0, bill: 100, traffic: 100,
                 qty_food: 50, qty_bev: 40, qty_others: 0 }];

function domKas() {
  return new JSDOM(HTML_KAS, {
    url: 'https://team.laksamanamuda.id/finance/kas/',
    runScripts: 'dangerously', pretendToBeVisual: true,
    virtualConsole: new VirtualConsole(),
    beforeParse(w) {
      w.Chart = function () {}; w.Chart.prototype.destroy = function () {};
      w.HTMLCanvasElement.prototype.getContext = () => ({});
      w.alert = () => {}; w.confirm = () => true; w.print = () => {}; w.scrollTo = () => {};
      try {
        w.localStorage.setItem('lm_session', JSON.stringify({
          expiry: Date.now() + 3600000, userId: 'u-uji', name: 'Penguji',
          modules: ['finance'], adminModules: ['finance']
        }));
      } catch (e) {}
      w.fetch = async (url, init) => {
        const body = init && init.body ? JSON.parse(init.body) : {};
        const u = String(url);
        const balas = o => ({ ok: true, status: 200, text: async () => JSON.stringify(o), json: async () => o });
        if (u.indexOf('stock-api-mysql/vendors.php') > -1) return balas({ vendors: {} });
        if (u.indexOf('account-api') > -1) return balas({ ok: true, members: [
          { id: 'u-uji', name: 'Penguji', keterangan: 'Office', isModuleAdmin: true } ] });
        if (u.indexOf('kompas-api') > -1) return balas({ ok: true, data: {
          daily: DAILY, reports: REPORTS, rekap_setoran: [], piutang: [],
          compliments: [], settings: {} } });
        if (body.action === 'brankasGet') return balas({ ok: true, data: { data: null, akses: {}, peran: {} } });
        return balas({ ok: true, data: { pos: [], kategori: [], trx: [], akses: {}, peran: {} } });
      };
    }
  }).window;
}
async function siapKas(w) {
  for (let i = 0; i < 220; i++) {
    try { if (w.eval('typeof DB !== "undefined" && DB && DB.reports && DB.reports["' + TGL + '"]')) return; }
    catch (e) {}
    await tunggu(50);
  }
  throw new Error('panel Kas Kecil tidak pernah siap');
}
/* Potongan HTML satu baris tabel, dijepit ke <tr> yang memuat nama kelompoknya.
   Asersi yang menyapu SELURUH halaman akan cocok dengan sel baris lain — di
   repo ini bentuk itu sudah lima kali menggigit. */
function barisGrup(html, nama) {
  const i = html.indexOf('>' + nama + '<');
  if (i < 0) return '';
  const a = html.lastIndexOf('<tr', i), b = html.indexOf('</tr>', i);
  return (a < 0 || b < 0) ? '' : html.slice(a, b);
}
/* Satu kartu .stat, dijepit menurut labelnya. */
function kartuStat(html, lab) {
  const i = html.indexOf('>' + lab + '<');
  if (i < 0) return '';
  const a = html.lastIndexOf('<div class="stat', i), b = html.indexOf('</div></div>', i);
  return (a < 0 || b < 0) ? '' : html.slice(a, b + 12);
}

(async () => {
  /* ================= 1. PERSENTASE MDR ================= */
  console.log('\n== Rekap Penjualan: persentase MDR ==');
  const w = domKas();
  await siapKas(w);
  w.eval("PERIOD='2026-08'; RK_TGL='" + TGL + "'; RK_TAB='input';");
  w.go('rekap');
  await tunggu(150);
  const v = w.document.getElementById('app-view').innerHTML;

  cek('sub-tab Input Harian tergambar', v.indexOf('Aktual Masuk') > -1, String(v.length));

  const bBca = barisGrup(v, 'EDC BCA');
  const bBri = barisGrup(v, 'QRIS BRI');
  const bGof = barisGrup(v, 'Gofood');
  const bCash = barisGrup(v, 'Cash');
  cek('baris EDC BCA ketemu', !!bBca);
  cek('EDC BCA: MDR Rp20.000', bBca.indexOf('Rp20.000') > -1, bBca.slice(0, 220));
  cek('EDC BCA: persennya 2,00%', bBca.indexOf('2,00%') > -1, bBca);
  cek('QRIS BRI: persennya 0,70% (dua desimal)', bBri.indexOf('0,70%') > -1, bBri);
  cek('QRIS BRI TIDAK dibulatkan jadi 1%', bBri.indexOf('>1% ') < 0 && bBri.indexOf(' 1% ') < 0, bBri);
  cek('Gofood: persennya 20,00%', bGof.indexOf('20,00%') > -1, bGof);
  /* Kelompok tanpa MDR tidak boleh punya persen: baris yang memang tidak kena
     potongan akan terlihat sudah diperiksa orang. */
  cek('Cash tidak punya persen sama sekali', !!bCash && bCash.indexOf('%') < 0, bCash);
  /* Penyebut disebut DI SELNYA, bukan cuma di kepala kolom: kepala kolom
     dibaca sekali, angkanya dibaca tiap baris. */
  cek('tiap sel menyebut penyebutnya', (v.match(/dari kotor/g) || []).length >= 3,
      String((v.match(/dari kotor/g) || []).length));
  cek('kepala kolom menyebut dasarnya', v.indexOf('% dari Aktual kotor') > -1);

  const kTot = kartuStat(v, 'Total MDR');
  cek('kartu Total MDR ketemu', !!kTot);
  cek('kartu Total MDR: Rp144.000', kTot.indexOf('Rp144.000') > -1, kTot);
  cek('kartu Total MDR: 3,20%', kTot.indexOf('3,20%') > -1, kTot);
  /* Penyebut yang melar sampai memuat cash memberi 1,92% — angka yang sama
     wajarnya di layar dan tidak akan dipertanyakan siapa pun. */
  cek('penyebutnya BUKAN seluruh setoran (1,92% tidak muncul)', kTot.indexOf('1,92%') < 0, kTot);

  /* --- persennya ikut hidup saat Aktual diketik --- */
  console.log('\n== Persen ikut bergerak saat diketik ==');
  aman('mengetik Aktual menyegarkan persen', () => {
    const sebelum = w.document.querySelector('[aria-label="Aktual masuk EDC BCA"]');
    cek('kotak Aktual EDC BCA ada', !!sebelum);
    w.eval("rkKetikAkt('edc_bca','960000')");
    const sesudah = w.document.querySelector('[aria-label="Aktual masuk EDC BCA"]');
    cek('kotak Aktual TIDAK diganti elemen baru', sebelum === sesudah);
    const sel = w.document.getElementById('rk-mdr-edc_bca');
    cek('MDR ikut jadi Rp40.000', !!sel && sel.innerHTML.indexOf('Rp40.000') > -1, sel && sel.innerHTML);
    cek('persennya ikut jadi 4,00%', !!sel && sel.innerHTML.indexOf('4,00%') > -1, sel && sel.innerHTML);
    const kartu = w.document.getElementById('rk-mdr');
    cek('kartu Total MDR ikut disegarkan berikut persennya',
        !!kartu && kartu.innerHTML.indexOf('%') > -1, kartu && kartu.innerHTML);
  });

  /* --- keadaan berlebih: MDR jadi kotak isian, persennya tetap ikut --- */
  console.log('\n== Dana berlebih: MDR diketik sendiri ==');
  aman('kotak MDR saat dana berlebih', () => {
    const sel = w.document.getElementById('rk-mdr-qris_mandiri');
    cek('sel MDR QRIS Mandiri jadi kotak isian',
        !!sel && !!sel.querySelector('input'), sel && sel.innerHTML);
    const pct = w.document.getElementById('rk-mdrp-qris_mandiri');
    cek('persennya berdiri di elemen sendiri', !!pct, sel && sel.innerHTML);
    cek('persen awal 1,00%', !!pct && pct.textContent.indexOf('1,00%') > -1, pct && pct.textContent);
    /* Kursor DI DALAM kotaknya: selnya sengaja tidak digambar ulang, jadi
       persennya harus disegarkan lewat DOM. Tanpa itu ia membeku di angka
       pertama — dan justru angka itu yang sedang dicari orang. */
    const box = sel.querySelector('input');
    box.focus();
    w.eval("rkKetikMdr('qris_mandiri','30000')");
    const box2 = w.document.getElementById('rk-mdr-qris_mandiri').querySelector('input');
    cek('kotak MDR TIDAK diganti elemen baru saat diketik', box === box2);
    const pct2 = w.document.getElementById('rk-mdrp-qris_mandiri');
    cek('persennya ikut jadi 3,00%', !!pct2 && pct2.textContent.indexOf('3,00%') > -1,
        pct2 && pct2.textContent);
    box.blur();
  });

  /* --- tab Rekap Bulanan --- */
  console.log('\n== Rekap Bulanan ==');
  aman('tab Rekap Bulanan', () => {
    w.eval("rkKetikAkt('edc_bca','980000'); rkKetikMdr('qris_mandiri','10000'); RK_TAB='rekap';");
    w.eval('render()');
    const vb = w.document.getElementById('app-view').innerHTML;
    cek('halaman Rekap Bulanan tergambar', vb.indexOf('Per Metode Pembayaran') > -1);
    const kb = kartuStat(vb, 'Total MDR');
    cek('kartu Total MDR bulanan punya persen', kb.indexOf('%') > -1, kb);
    const iBca = vb.indexOf('>EDC BCA<');
    const gcard = iBca > -1 ? vb.slice(iBca, iBca + 600) : '';
    cek('kartu per metode EDC BCA menyebut 2,00%', gcard.indexOf('2,00%') > -1, gcard.slice(0, 300));
  });

  /* --- unit: aturan pembulatan & keadaan kosong --- */
  console.log('\n== rkMdrPct sebagai unit ==');
  const pct = (a, b) => w.eval('rkMdrPct(' + a + ',' + b + ')');
  cek('0,7% tidak dibulatkan', pct(14000, 2000000) === '0,70%', pct(14000, 2000000));
  cek('MDR nol -> kosong, bukan "0%"', pct(0, 1000000) === '', pct(0, 1000000));
  cek('kotor nol -> kosong, bukan bagi nol', pct(5000, 0) === '', pct(5000, 0));
  cek('pemisah desimalnya koma', pct(20000, 1000000) === '2,00%', pct(20000, 1000000));

  /* ================= 3. DANA MASUK DI KAS KECIL ================= */
  console.log('\n== Dana Masuk (DP) di panel Kas Kecil ==');
  const judul = JSON.parse(w.eval('JSON.stringify(TITLES.dp||null)'));
  cek('TITLES.dp ada', !!judul, String(judul));
  /* Sidebar panel ini HTML STATIS — menambah TITLES saja tidak melahirkan
     menunya, dan halaman yang tidak punya baris di TITLES memantul balik ke
     halaman pertama. Yang dijaga INVARIANNYA, bukan nama 'dp': itu yang akan
     menangkap halaman BERIKUTNYA. */
  const navKeys = Array.from(w.document.querySelectorAll('.nav a[data-view]')).map(a => a.dataset.view);
  const titleKeys = JSON.parse(w.eval('JSON.stringify(Object.keys(TITLES))'));
  cek('tiap judul punya menunya di sidebar',
      titleKeys.every(k => navKeys.indexOf(k) > -1),
      titleKeys.filter(k => navKeys.indexOf(k) < 0).join(','));
  cek('tiap menu punya judulnya di TITLES',
      navKeys.every(k => titleKeys.indexOf(k) > -1),
      navKeys.filter(k => titleKeys.indexOf(k) < 0).join(','));
  const aDp = w.document.querySelector('.nav a[data-view="dp"]');
  cek('menu Dana Masuk punya tulisan yang terbaca',
      !!aDp && aDp.textContent.trim().length > 3, aDp && aDp.textContent);

  aman('halaman dp digambar', () => {
    w.go('dp');
    cek('go("dp") benar-benar mendarat di dp', w.eval('CURRENT') === 'dp', w.eval('CURRENT'));
    const vd = w.document.getElementById('app-view').innerHTML;
    const f = w.document.getElementById('dpFrame');
    cek('bingkainya tergambar', !!f, vd.slice(0, 200));
    const src = f ? f.getAttribute('src') : '';
    cek('bingkainya menunjuk modul Reservasi lewat pintu embed',
        src.indexOf('reservasi/?embed=finance') > -1, src);
    /* Panel ini DUA tingkat di dalam deploy/. Jalur yang kurang satu tingkat
       tidak melempar — yang sampai ke layar cuma 404 server. */
    cek('jalurnya ../../ bukan ../', src.indexOf('../../reservasi/') === 0, src);
    cek('BUKAN salinan halamannya', vd.indexOf('Perlu Diverifikasi') < 0, vd.slice(0, 300));
    /* Yang membukanya bisa memverifikasi — itu tidak boleh cuma ada di
       komentar kode: orang yang mengira ia sedang membaca saja tidak akan
       berhati-hati menekan tombol. */
    cek('layar mengatakan yang membuka bisa memverifikasi',
        vd.indexOf('memverifikasi') > -1, vd.slice(0, 600));
    cek('ada tombol Muat Ulang', vd.indexOf('muatUlangDpKas') > -1);
    const src0 = f.getAttribute('src');
    w.eval('muatUlangDpKas()');
    const src1 = w.document.getElementById('dpFrame').getAttribute('src');
    cek('Muat Ulang mengganti src bingkainya saja',
        src1 !== src0 && src1.indexOf('embed=finance') > -1, src1);
  });

  const perms = JSON.parse(w.eval('JSON.stringify(DEFAULT_PERMS.dp||null)'));
  cek('DEFAULT_PERMS.dp ada', !!perms, String(perms));
  /* View Only sengaja TIDAK diberi halaman ini: isinya tunduk pada hak akses
     modul Reservasi, jadi siapa pun yang bisa membukanya bisa menekan
     Verifikasi — dan role yang namanya berjanji "tidak pernah bisa mengubah
     apa pun" akan berbohong. */
  cek('viewer TIDAK diberi halaman ini', !!perms && perms.viewer === 0, JSON.stringify(perms));
  cek('staf boleh membukanya', !!perms && perms.staf >= 1, JSON.stringify(perms));

  w.go('akses');
  await tunggu(250);
  const va = w.document.getElementById('app-view').innerHTML;
  const iRow = va.indexOf('Dana Masuk (DP)');
  const row = iRow > -1 ? va.slice(va.lastIndexOf('<tr', iRow), va.indexOf('</tr>', iRow)) : '';
  cek('barisnya ada di matriks hak akses', !!row, String(iRow));
  /* "(baca saja)" benar untuk halaman lain di luar AKS_HAL_ISI, tapi BOHONG
     di sini — bingkainya menjalankan modul Reservasi. */
  cek('barisnya TIDAK ditulis "(baca saja)"', !!row && row.indexOf('(baca saja)') < 0, row);
  cek('barisnya menyebut isinya milik modul Reservasi',
      !!row && row.indexOf('modul Reservasi') > -1, row);

  /* --- gerbang SSO modul Reservasi, DIJALANKAN --- */
  console.log('\n== Gerbang embed modul Reservasi ==');
  const iA = HTML_RSV.indexOf("(function(){try{var s=JSON.parse(localStorage.getItem('lm_session')");
  const iB = HTML_RSV.indexOf('</' + 'script>', iA);
  cek('gerbangnya ketemu di sumber', iA > -1 && iB > iA, String(iA));
  const SRC_GERBANG = iA > -1 ? HTML_RSV.slice(iA, iB) : '';
  function lolos(modules, search) {
    let dialihkan = false;
    const ls = { getItem: () => JSON.stringify({ expiry: Date.now() + 3600000, modules: modules }) };
    const loc = { search: search, replace: () => { dialihkan = true; } };
    new Function('localStorage', 'location', SRC_GERBANG)(ls, loc);
    return !dialihkan;
  }
  cek('finance + embed  -> LOLOS', lolos(['finance'], '?embed=finance'));
  cek('finance TANPA embed -> DITOLAK', !lolos(['finance'], ''));
  cek('cashier + embed tetap LOLOS', lolos(['cashier'], '?embed=finance'));
  cek('reservasi tanpa embed tetap LOLOS', lolos(['reservasi'], ''));
  cek('tanpa modul apa pun -> DITOLAK', !lolos([], '?embed=finance'));
  cek('modul lain + embed -> DITOLAK', !lolos(['konten'], '?embed=finance'));

  /* ================= 2. SARING DANA MASUK ================= */
  console.log('\n== Dana Masuk: saring menurut tgl reservasi / tgl uang masuk ==');
  await ujiDanaMasuk();

  console.log('\n---------------------------------------');
  console.log('LULUS ' + lulus + '   GAGAL ' + gagal);
  process.exit(gagal ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });

/* ---------- bagian Reservasi ----------
   Empat reservasi, dan tiap kesalahan memberi hasil yang BERBEDA:

     Tamu Satu    reservasi 10 Agu, transfer  1 Agu, Rp1.000.000
     Tamu Dua     reservasi  1 Agu, transfer 10 Agu, Rp2.000.000
     Tamu Tiga    reservasi  1 Agu, transfer BELUM TERBACA, Rp500.000
     Tamu Empat   reservasi  5 Agu, transfer  1 Agu, Rp300.000

   Rentang 1 Agu:
     basis reservasi  -> Dua + Tiga           = 2 baris, Rp2.500.000
     basis uang masuk -> Satu + Empat + Tiga  = 3 baris, Rp1.800.000
   Jumlah barisnya BERBEDA dan totalnya BERBEDA, jadi basis yang tidak
   berpindah tidak punya tempat bersembunyi. */
const RESV = [
  { id: 'r1', name: 'Tamu Satu', phone: '0811111111', date: '2026-08-10', time: '19:00', table: 'A1', pax: 4,
    dps: [{ id: 'd1', amount: 1000000, method: 'Transfer BCA', proofData: '', proofName: '',
            tfDate: '2026-08-01', tfTime: '10:00', tfBank: 'BCA', tfName: 'Tamu Satu', tfAmount: 1000000, tfStatus: '' }] },
  { id: 'r2', name: 'Tamu Dua', phone: '0822222222', date: '2026-08-01', time: '19:00', table: 'A2', pax: 4,
    dps: [{ id: 'd2', amount: 2000000, method: 'Transfer BRI', proofData: '', proofName: '',
            tfDate: '2026-08-10', tfTime: '11:00', tfBank: 'BRI', tfName: 'Tamu Dua', tfAmount: 2000000, tfStatus: '' }] },
  { id: 'r3', name: 'Tamu Tiga', phone: '0833333333', date: '2026-08-01', time: '19:00', table: 'A3', pax: 4,
    dps: [{ id: 'd3', amount: 500000, method: 'Transfer BCA', proofData: '', proofName: '',
            tfDate: '', tfTime: '', tfBank: '', tfName: '', tfAmount: 0, tfStatus: '' }] },
  { id: 'r4', name: 'Tamu Empat', phone: '0844444444', date: '2026-08-05', time: '19:00', table: 'A4', pax: 4,
    dps: [{ id: 'd4', amount: 300000, method: 'Transfer BCA', proofData: '', proofName: '',
            tfDate: '2026-08-01', tfTime: '09:00', tfBank: 'BCA', tfName: 'Tamu Empat', tfAmount: 300000, tfStatus: '' }] }
];

async function ujiDanaMasuk() {
  const d = new JSDOM(HTML_RSV_UJI, {
    url: 'https://team.laksamanamuda.id/reservasi/',
    runScripts: 'dangerously', pretendToBeVisual: true,
    virtualConsole: new VirtualConsole(),
    beforeParse(w) {
      w.alert = () => {}; w.confirm = () => true; w.print = () => {}; w.scrollTo = () => {};
      w.HTMLElement.prototype.scrollIntoView = function () {};
      try {
        w.localStorage.setItem('lm_session', JSON.stringify({
          expiry: Date.now() + 3600000, userId: 'u-uji', name: 'Penguji',
          modules: ['reservasi'], adminModules: ['reservasi']
        }));
      } catch (e) {}
      w.fetch = async (url) => {
        const u = String(url);
        const balas = o => ({ ok: true, status: 200, text: async () => JSON.stringify(o), json: async () => o });
        if (u.indexOf('account-api') > -1) return balas({ ok: true, members: [
          { id: 'u-uji', name: 'Penguji', keterangan: 'Office', isModuleAdmin: true } ] });
        return balas({ ok: true, data: {} });
      };
    }
  });
  const w = d.window;
  for (let i = 0; i < 220; i++) {
    try { if (w.eval('typeof STATE !== "undefined" && STATE && Array.isArray(STATE.reservations)')) break; }
    catch (e) {}
    await tunggu(50);
  }
  w.eval('SESSION={id:"u-uji",name:"Penguji",role:"admin"}; SELECTED_CREW="u-uji";');
  w.eval('STATE.reservations=' + JSON.stringify(RESV) + ';');
  /* Rentang dipatok ke tanggal data uji, bukan hari ini: uji yang hasilnya
     bergantung tanggal mesin penguji akan berubah sendiri besok pagi. */
  w.eval("FIN_F.from='2026-08-01'; FIN_F.to='2026-08-01'; FIN_TAB='perlu';");

  const gambar = basis => {
    w.eval("FIN_F.basis='" + basis + "'; renderFinance();");
    return w.document.getElementById('page-finance').innerHTML;
  };
  const adaTamu = (html, nama) => html.indexOf('>' + nama + '<') > -1;

  /* --- bawaan tidak bergeser --- */
  const bawaan = w.eval('FIN_F.basis');
  cek('basis BAWAANNYA tetap "reservasi"', bawaan === 'reservasi', String(bawaan));

  let v = gambar('reservasi');
  cek('halaman Dana Masuk tergambar', v.indexOf('Transaksi Masuk') > -1, String(v.length));
  cek('basis reservasi: Tamu Dua ikut', adaTamu(v, 'Tamu Dua'));
  cek('basis reservasi: Tamu Tiga ikut', adaTamu(v, 'Tamu Tiga'));
  cek('basis reservasi: Tamu Satu TIDAK ikut', !adaTamu(v, 'Tamu Satu'));
  cek('basis reservasi: Tamu Empat TIDAK ikut', !adaTamu(v, 'Tamu Empat'));
  cek('basis reservasi: totalnya Rp2.500.000', v.indexOf('2.500.000') > -1);
  cek('label kotak tanggal menyebut Tgl Reservasi', v.indexOf('Tgl Reservasi — Dari') > -1);
  cek('judul tabel menyebut reservasi', v.indexOf('· reservasi ') > -1);
  /* Pita tanggal cadangan tidak boleh muncul di basis reservasi: di sana
     tanggal transfer tidak dipakai menyaring apa pun. */
  cek('pita tanggal cadangan TIDAK muncul di basis reservasi',
      v.indexOf('dipakai tanggal reservasinya') < 0);

  v = gambar('masuk');
  cek('basis uang masuk: Tamu Satu ikut', adaTamu(v, 'Tamu Satu'));
  cek('basis uang masuk: Tamu Empat ikut', adaTamu(v, 'Tamu Empat'));
  cek('basis uang masuk: Tamu Dua TIDAK ikut', !adaTamu(v, 'Tamu Dua'));
  /* Baris yang tanggal transfernya belum terbaca tetap ikut lewat CADANGAN
     tanggal reservasinya — dibuang, DP yang buktinya baru diunggah lenyap dari
     layar justru waktu ia paling perlu diperiksa. */
  cek('basis uang masuk: Tamu Tiga tetap ikut lewat tanggal reservasinya', adaTamu(v, 'Tamu Tiga'));
  cek('basis uang masuk: totalnya Rp1.800.000', v.indexOf('1.800.000') > -1);
  cek('basis uang masuk: total lama Rp2.500.000 tidak lagi muncul', v.indexOf('2.500.000') < 0);
  cek('label kotak tanggal ikut berubah', v.indexOf('Tgl Uang Masuk — Dari') > -1);
  cek('judul tabel menyebut uang masuk', v.indexOf('· uang masuk ') > -1);
  cek('pita tanggal cadangan muncul & menyebut jumlahnya',
      v.indexOf('dipakai tanggal reservasinya') > -1 && v.indexOf('<b>1 baris') > -1);
  cek('pita menyebut nominalnya', v.indexOf('dipakai tanggal reservasinya') > -1 && v.indexOf('500.000') > -1);

  /* --- saklarnya ada, dan menandai yang sedang berlaku --- */
  const tombol = Array.from(w.document.querySelectorAll('#page-finance .seat-switch button'))
    .filter(b => /Tgl (Reservasi|Uang Masuk)/.test(b.textContent));
  cek('dua tombol basis digambar', tombol.length === 2, String(tombol.length));
  /* Saklarnya BERDIRI DI BARISNYA SENDIRI. Disandingkan dengan kotak tanggal,
     labelnya jatuh lebih rendah daripada label di sebelahnya — barisnya
     rata-bawah dan pil ini lebih pendek daripada kotak isian — dan itu persis
     yang dikeluhkan user. jsdom tidak menghitung tata letak, jadi yang dijaga
     penentu lebarnya di elemen yang sungguhan digambar. */
  aman('saklar basis punya barisnya sendiri', () => {
    const kotak = tombol[0].closest('.field');
    cek('saklarnya duduk di .field', !!kotak);
    const st = kotak ? String(kotak.getAttribute('style') || '') : '';
    cek('field saklarnya selebar satu baris penuh',
        /flex\s*:\s*0\s+0\s+100%/.test(st), st);
  });
  cek('yang sedang berlaku ditandai',
      tombol.length === 2 && tombol[1].className.indexOf('on') > -1 && tombol[0].className.indexOf('on') < 0,
      tombol.map(b => b.className).join('|'));
  /* Diklik sungguhan: tombol yang tergambar tapi tidak tersambung ke apa pun
     terlihat persis sama di layar sampai ada yang menekannya. */
  aman('tombol basis benar-benar tersambung', () => {
    tombol[0].click();
    cek('menekan "Tgl Reservasi" memindahkan basisnya', w.eval('FIN_F.basis') === 'reservasi',
        w.eval('FIN_F.basis'));
    const vv = w.document.getElementById('page-finance').innerHTML;
    cek('daftarnya ikut berpindah', adaTamu(vv, 'Tamu Dua') && !adaTamu(vv, 'Tamu Satu'));
  });
}
