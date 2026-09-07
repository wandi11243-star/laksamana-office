/* Uji "Realisasi" yang dipajang sebagai TAGIHAN — 6 September 2026, permintaan
   user: "Realisasi Bulan Ini langsung aja total akhir dengan tax dan service
   tapi dikasih note".

   KENAPA UJI SENDIRI. `tools/smoke-modul.js` sama sekali tidak menyentuh
   deploy/finance/kas/ maupun deploy/finance/omset/ — daftarnya cuma memuat
   `finance`, yaitu halaman PEMILIH panel yang tidak berisi aplikasi apa pun.
   Jadi seluruh Dashboard Omset selama ini lolos tanpa satu baris pun
   dijalankan, dan perubahan yang menyentuh UANG di sana tidak punya jaring
   apa-apa.

   YANG DIJAGA, dan semuanya gagal sebagai ANGKA bukan sebagai galat:

     - Realisasi = tagihan (net + service + pajak), bukan net.
     - `real` (net) TIDAK ikut berubah. Ia dasar Rasio Komposisi, ATV, dan
       persentase Self Order; kalau ikut diganti, Rasio Komposisi berhenti
       berjumlah 100% dan tak satu pun label di layar ikut berubah.
     - Catatan yang menjelaskan bedanya ADA, dan menyebut angka net-nya.
       Halaman ini memajang dua angka omset sekaligus; tanpa kalimat itu, yang
       membandingkannya akan mengira salah satunya salah.
     - Lembar PDF & ringkasan WhatsApp memakai angka yang SAMA dengan layar.
       Aturan itu sudah tertulis di komentar RINGKAS_OMSET sejak lama, dan
       laporan yang berbeda dari layar adalah laporan yang tidak bisa
       dipercaya lagi sesudahnya.
     - Panel Input Omset (deploy/finance/omset/) memakai dasar yang sama.
       Dua panel yang memajang "Realisasi Bulan Ini" dengan dasar berbeda
       adalah selisih yang baru ketahuan waktu ada yang membuka dua layar. */
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
const SRC_OMSET = fs.readFileSync(path.join(ROOT, 'deploy', 'finance', 'omset', 'index.html'), 'utf8');

let lulus = 0, gagal = 0;
const cek = (nama, syarat, ket) => {
  if (syarat) { lulus++; console.log('  OK   ' + nama); }
  else { gagal++; console.log('  GAGAL ' + nama + (ket ? '  -> ' + ket : '')); }
};
const tunggu = ms => new Promise(r => setTimeout(r, ms));
const rp = n => 'Rp' + Math.round(n).toLocaleString('id-ID');

/* ---- data uji ----
   Angka dipilih supaya net dan tagihan TIDAK MUNGKIN tertukar tanpa ketahuan,
   dan supaya tiap komponen punya jejaknya sendiri di layar. */
const HARI = [
  { date:'2026-08-01', food:100000000, bev:50000000, lainnya:0, discount:10000000,
    service_charge:5000000, tax:7000000, bill:200, traffic:400,
    qty_food:100, qty_bev:80, qty_others:0 },
  { date:'2026-08-02', food:60000000, bev:40000000, lainnya:0, discount:0,
    service_charge:3000000, tax:4000000, bill:150, traffic:300,
    qty_food:70, qty_bev:60, qty_others:0 }
];
const NET     = 240000000;   // (100+50-10) + (60+40)
const TAXSVC  = 19000000;    // (5+7) + (3+4)
const TAGIHAN = 259000000;   // NET + TAXSVC
const KOMPO   = 250000000;   // food+bev+lainnya, TANPA dikurangi diskon

function domKas() {
  const dom = new JSDOM(HTML_KAS, {
    url: 'https://team.laksamanamuda.id/finance/kas/',
    runScripts: 'dangerously', pretendToBeVisual: true,
    virtualConsole: new VirtualConsole(),
    beforeParse(w) {
      w.Chart = function () {}; w.Chart.prototype.destroy = function () {};
      w.HTMLCanvasElement.prototype.getContext = () => ({});
      w.alert = () => {}; w.confirm = () => true; w.print = () => {}; w.scrollTo = () => {};
      try {
        w.localStorage.setItem('lm_session', JSON.stringify({
          expiry: Date.now() + 3600000, userId:'u-uji', name:'Penguji',
          modules:['finance'], adminModules:['finance']
        }));
      } catch (e) {}
      w.fetch = async (url, init) => {
        const body = init && init.body ? JSON.parse(init.body) : {};
        const u = String(url);
        const balas = o => ({ ok:true, status:200, text: async () => JSON.stringify(o), json: async () => o });
        if (u.indexOf('stock-api-mysql/vendors.php') > -1) return balas({ vendors:{} });
        if (u.indexOf('account-api') > -1) return balas({ ok:true, members:[
          { id:'u-uji', name:'Penguji', keterangan:'Office', isModuleAdmin:true } ] });
        if (u.indexOf('kompas-api') > -1) return balas({ ok:true, data:{
          daily: HARI, reports:{}, rekap_setoran:[], piutang:[], compliments:[], settings:{} } });
        if (body.action === 'brankasGet') return balas({ ok:true, data:{ data:null, akses:{}, peran:{} } });
        return balas({ ok:true, data:{ pos:[], kategori:[], trx:[], akses:{}, peran:{} } });
      };
    }
  });
  return dom;
}
async function siap(w) {
  for (let i = 0; i < 200; i++) {
    try { if (w.eval('typeof DB !== "undefined" && DB && Array.isArray(DB.daily) && DB.daily.length')) return; }
    catch (e) {}
    await tunggu(50);
  }
  throw new Error('panel Kas Kecil tidak pernah siap');
}

(async () => {
  console.log('\n== Dashboard Omset: kartu Realisasi ==');
  const w = domKas().window;
  await siap(w);
  /* Mode BULANAN pada bulan datanya, bukan bulan berjalan mesin penguji —
     uji yang hasilnya bergantung tanggal hari ini akan berubah sendiri. */
  w.eval("VIEWMODE='bulan'; PERIOD='2026-08';");
  w.go('bulanan');
  await tunggu(120);
  const v = w.document.getElementById('app-view').innerHTML;

  cek('halaman Dashboard Omset tergambar', v.indexOf('Rasio Komposisi Omset') > -1, String(v.length));

  /* --- INVARIAN 1: yang dipajang tagihan, bukan net --- */
  cek('Realisasi memajang TAGIHAN ' + rp(TAGIHAN), v.indexOf(rp(TAGIHAN)) > -1);
  const iLab = v.indexOf('Realisasi Bulan Ini');
  const potongan = iLab > -1 ? v.slice(iLab, iLab + 400) : '';
  cek('angka tagihan berdiri di kartu Realisasi', potongan.indexOf(rp(TAGIHAN)) > -1,
      potongan.slice(0, 200));
  /* Rata-rata harus sedasar dengan kartu di sebelahnya. Dua kartu bersebelahan
     dengan dasar berbeda adalah kekeliruan yang tidak akan dicurigai. */
  cek('Rata-rata per Hari ikut tagihan ' + rp(TAGIHAN / 2), v.indexOf(rp(TAGIHAN / 2)) > -1);
  cek('rata-rata TIDAK memakai net ' + rp(NET / 2), v.indexOf(rp(NET / 2)) < 0,
      'Rp120.000.000 masih muncul = rata-rata masih net');

  /* --- INVARIAN 2: net tidak ikut berubah --- */
  cek('net masih dipakai & disebut ' + rp(NET), v.indexOf(rp(NET)) > -1);
  cek('penyebut Rasio Komposisi tetap gross ' + rp(KOMPO), v.indexOf(rp(KOMPO)) > -1);
  /* Rasio Komposisi wajib tetap berjumlah 100%: kalau penyebutnya diam-diam
     ikut jadi tagihan, ketiganya menyusut dan jumlahnya tidak lagi 100. */
  const rasio = (v.match(/<div class="val">(\d+\.\d)%<\/div>/g) || [])
    .map(x => parseFloat(x.replace(/[^0-9.]/g, '')));
  const jml = rasio.reduce((a, b) => a + b, 0);
  cek('rasio komposisi tetap berjumlah 100%', rasio.length === 3 && Math.abs(jml - 100) < 0.3,
      rasio.join(' + ') + ' = ' + jml.toFixed(1));

  /* --- INVARIAN 3: catatan ada dan menyebut angkanya --- */
  cek('catatan penjelas digambar', v.indexOf('adalah TAGIHAN') > -1);
  cek('catatan menyebut angka net', v.indexOf('Omset <b>net</b>-nya ' + rp(NET)) > -1);
  cek('catatan menyebut tax & service ' + rp(TAXSVC), v.indexOf(rp(TAXSVC)) > -1);
  cek('catatan menghubungkan ke Rekap Penjualan', v.indexOf('Dibayar Tamu') > -1);
  cek('catatan menyebut siapa yang masih pakai net',
      v.indexOf('Rasio Komposisi') > -1 && v.indexOf('Self Order') > -1);

  /* --- INVARIAN 4: PDF & WA memakai angka yang sama dengan layar --- */
  console.log('\n== Lembar PDF & ringkasan WhatsApp ==');
  const R = w.eval('JSON.stringify({real:RINGKAS_OMSET.real,tag:RINGKAS_OMSET.realTagihan,tax:RINGKAS_OMSET.tax})');
  const r = JSON.parse(R);
  cek('RINGKAS_OMSET membawa realTagihan', r.tag === TAGIHAN, String(r.tag));
  cek('RINGKAS_OMSET tetap membawa net', r.real === NET, String(r.real));
  cek('RINGKAS_OMSET tetap membawa tax & service', r.tax === TAXSVC, String(r.tax));

  /* Teks WA dibangun fungsi yang sama dengan tombolnya. Yang diperiksa: angka
     tagihan yang muncul, dan net yang tetap disebut supaya pesan yang
     diteruskan sepotong masih bisa dicocokkan. */
  const wa = w.eval('typeof teksWaDashboardOmset==="function"?teksWaDashboardOmset():(typeof waTeksDashboardOmset==="function"?waTeksDashboardOmset():"")');
  if (wa) {
    cek('WA memakai angka tagihan', wa.indexOf(rp(TAGIHAN)) > -1, wa.slice(0, 160));
    cek('WA tetap menyebut net', wa.indexOf(rp(NET)) > -1);
  } else {
    /* Fungsinya tidak dipisah dari tombolnya — sumbernya yang diperiksa. */
    cek('WA memakai r.realTagihan (sumber)', HTML_KAS.indexOf('fmtRp(r.realTagihan)') > -1);
    cek('WA tetap menyebut net (sumber)', HTML_KAS.indexOf('_(net ${fmtRp(r.real)}') > -1);
  }
  cek('lembar PDF memakai realTagihan', HTML_KAS.indexOf("['Realisasi (tagihan)', fmtRp(r.realTagihan)") > -1);
  cek('lembar PDF tetap menyebut net', HTML_KAS.indexOf("'net '+fmtRp(r.real)") > -1);
  /* Label lama "Realisasi (net)" tidak boleh tertinggal di lembar cetak:
     lembar yang menjanjikan net tapi memuat tagihan adalah janji yang tidak
     ditepati tiap kali dibuka, dan lembar PDF beredar tanpa layarnya. */
  cek('label "Realisasi (net)" tidak tertinggal di PDF',
      HTML_KAS.indexOf("'Realisasi (net)'") < 0);

  /* --- INVARIAN 5: panel Input Omset sedasar --- */
  console.log('\n== Panel Input Omset (berkas kembar) ==');
  cek('bReal memakai tagihanOf, bukan netOf',
      /const bReal=lainHari\.reduce\(\(s,x\)=>s\+tagihanOf\(x\),0\)\+tagihanOf\(t\);/.test(SRC_OMSET),
      'masih netOf — dua panel akan menyebut angka berbeda untuk bulan yang sama');
  cek('foot-nya menyebut bahwa angkanya tagihan',
      SRC_OMSET.indexOf('`tagihan · ${lainHari.length} hari tersimpan') > -1);
  cek('sub-judulnya menjelaskan dasarnya', SRC_OMSET.indexOf('Angkanya <b>tagihan</b>') > -1);
  /* tagihanOf() ada di KEDUA berkas dan tidak boleh disalin jadi rumus ketiga. */
  cek('tagihanOf tetap satu rumus di tiap berkas',
      (SRC_OMSET.match(/function tagihanOf/g) || []).length === 1 &&
      (HTML_KAS.match(/function tagihanOf/g) || []).length === 1);

  /* ============ Halaman pertama panel Kas ============
     Permintaan user 7 September 2026: masuk ke Kas, yang terbuka Dashboard
     Omset. Sehari sebelumnya grup menunya sudah dinaikkan ke paling atas;
     ini melengkapinya — menu teratas yang bukan halaman pertama membuat
     sidebar dan layar mengatakan dua hal berbeda tentang mana yang utama. */
  console.log('\n== Halaman pertama panel Kas ==');
  {
    const w2 = domKas().window;
    await siap(w2);
    cek('halPertamaBoleh() memulangkan Dashboard Omset',
        w2.eval('halPertamaBoleh()') === 'bulanan', String(w2.eval('halPertamaBoleh()')));
    /* Jaring terakhirnya tetap ada: yang tidak berhak membuka Dashboard Omset
       tidak boleh mendarat di layar kosong tanpa penjelasan. */
    cek('kk_buku tetap jadi cadangan berikutnya',
        /if\(bolehLihat\('bulanan'\)\) return 'bulanan';\s*\r?\n\s*if\(bolehLihat\('kk_buku'\)\) return 'kk_buku';/
          .test(HTML_KAS));
  }

  console.log('\n---------------------------------------');
  console.log('LULUS ' + lulus + '   GAGAL ' + gagal);
  process.exit(gagal ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
