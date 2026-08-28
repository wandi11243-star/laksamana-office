/* Uji master vendor: kolom rekening di modul Purchasing, dan pemakaiannya di
   form Purchase Order (BD OS).

   Vendor dipakai LINTAS MODUL: panel Brankas di Finance membaca nama penerima,
   bank, dan nomor rekeningnya untuk menyusun lembar pembayaran mingguan. Salah
   satu huruf di nama penerima membuat transfer ditolak bank; salah nomor
   rekening mengirim uang ke orang lain. Jadi yang diuji di sini bukan
   tampilannya, tapi apa yang TERSIMPAN dan apa yang TERBACA.

   Sempat ada master vendor kedua di BD OS (28 Agustus 2026 pagi). Dicabut hari
   yang sama: Purchasing sudah punya Daftar Kontak Vendor sejak lama, dan dua
   daftar untuk perusahaan yang sama pasti berbeda ejaan dalam sebulan. */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
/* jsdom dicari di node_modules repo dulu, lalu lewat resolusi biasa. Mesin
   yang node_modules repo-nya belum dipasang bisa memakai JSDOM_PATH atau
   NODE_PATH — sebelumnya jalurnya dipatok, jadi ujinya mati sebelum satu pun
   pemeriksaan jalan dan yang terbaca cuma MODULE_NOT_FOUND. */
const { JSDOM } = (() => {
  for (const p of [process.env.JSDOM_PATH, path.join(ROOT, 'node_modules', 'jsdom'), 'jsdom']) {
    if (!p) continue;
    try { return require(p); } catch (e) { /* coba berikutnya */ }
  }
  console.error('jsdom tidak ketemu. Pasang `npm i jsdom`, atau setel JSDOM_PATH ke foldernya.');
  process.exit(2);
})();

let lulus = 0, gagal = 0;
const cek = (nama, syarat, ket) => {
  if (syarat) { lulus++; console.log('  OK   ' + nama); }
  else { gagal++; console.log('  GAGAL ' + nama + (ket ? '  -> ' + ket : '')); }
};
const tunggu = ms => new Promise(r => setTimeout(r, ms));
const NL = String.fromCharCode(10);

/* ===================================================================
   BAGIAN 1 — PURCHASING
   Modul ini memuat Tailwind & FontAwesome dari CDN dan menembak beberapa
   endpoint saat boot; merendernya utuh di jsdom bukan yang diuji di sini.
   Yang diuji adalah FUNGSI-nya, DIPOTONG dari berkas aslinya saat uji jalan —
   bukan disalin, supaya ujinya ikut basi kalau fungsinya berubah.
   =================================================================== */
const PUR = fs.readFileSync(path.join(ROOT, 'deploy', 'stock', 'purchasing', 'index.html'), 'utf8');

/* Ambil satu fungsi utuh dengan menghitung kurung kurawal. Regex sampai
   "\n}" akan berhenti di kurung tutup pertama yang kebetulan di kolom nol
   di dalam template literal — dan potongannya jadi kode yang tidak sah. */
function potong(sumber, tanda) {
  const i = sumber.indexOf(tanda);
  if (i < 0) throw new Error('tak ketemu di sumber: ' + tanda);
  let d = 0, mulai = false;
  for (let j = i; j < sumber.length; j++) {
    const c = sumber[j];
    if (c === '{') { d++; mulai = true; }
    else if (c === '}') { d--; if (mulai && d === 0) return sumber.slice(i, j + 1); }
  }
  throw new Error('kurung tidak tertutup: ' + tanda);
}
/* Sebagian helper ditulis sebagai const panah satu baris, bukan `function`.
   Diambil sebagai BARIS UTUH — memaksanya lewat potong() akan berhenti di
   kurung kurawal pertama yang kebetulan lewat. */
function ambilBaris(sumber, awalan) {
  const b = sumber.split(NL).find(x => x.trim().indexOf(awalan) === 0);
  if (!b) throw new Error('baris tak ketemu: ' + awalan);
  return b.trim();
}
function ambilArray(sumber, nama) {
  const m = sumber.match(new RegExp('const ' + nama + '\\s*=\\s*(\\[[\\s\\S]*?\\]);'));
  if (!m) throw new Error('array tak ketemu: ' + nama);
  return m[1];
}

console.log('\n== Purchasing: helper rekening ==');
{
  const kode = [
    'const VENDOR_BANK = ' + ambilArray(PUR, 'VENDOR_BANK') + ';',
    potong(PUR, 'function norekBersih('),
    potong(PUR, 'function selRekening('),
    potong(PUR, 'function opsiBank('),
    'module.exports = { VENDOR_BANK, norekBersih, selRekening, opsiBank };'
  ].join(NL);
  const m = { exports: {} };
  new Function('module', 'exports', kode)(m, m.exports);
  const { norekBersih, selRekening, opsiBank, VENDOR_BANK } = m.exports;

  /* Nomor rekening disimpan apa adanya tapi DIBANDINGKAN tanpa pemisah. */
  cek('norekBersih membuang tanda hubung', norekBersih('034-2928-828') === '0342928828');
  cek('dua bentuk nomor yang sama dianggap sama',
      norekBersih('034-2928-828') === norekBersih('0342928828'));
  cek('norekBersih aman untuk null/undefined',
      norekBersih(null) === '' && norekBersih(undefined) === '');
  cek('spasi & titik ikut dibuang', norekBersih(' 034 2928.828 ') === '0342928828');

  /* Vendor tanpa rekening DITANDAI, bukan dikosongkan: kosong terbaca sebagai
     "belum sempat diisi", padahal artinya vendor ini tidak bisa masuk lembar
     pembayaran sama sekali. */
  const kosong = selRekening({ penerima: 'CV. X', bank: 'BCA', norek: '' });
  cek('tanpa rekening ditandai terang', kosong.indexOf('belum ada rekening') > -1, kosong);
  cek('penandanya menyebutkan akibatnya', kosong.indexOf('Brankas') > -1);
  cek('selRekening aman untuk objek kosong', selRekening({}).indexOf('belum ada rekening') > -1);
  cek('selRekening aman untuk null', selRekening(null).indexOf('belum ada rekening') > -1);

  const isi = selRekening({ penerima: 'CV. Toffin Riau Jaya', bank: 'BCA', norek: '034-2928-828' });
  cek('penerima tergambar', isi.indexOf('CV. Toffin Riau Jaya') > -1);
  cek('bank & nomor tergambar', isi.indexOf('BCA') > -1 && isi.indexOf('034-2928-828') > -1);
  /* Nomornya ditulis APA ADANYA, bukan hasil norekBersih: bentuk bertanda
     hubung itulah yang dicocokkan mata sebelum menekan kirim di m-banking. */
  cek('nomor ditulis apa adanya, bukan dibersihkan', isi.indexOf('0342928828') < 0);

  /* Nama penerima kosong tidak sama dengan nomor rekening kosong. Yang pertama
     masih bisa ditransfer (nama vendornya dipakai); yang kedua tidak sama
     sekali. Menyamakan keduanya membuat vendor yang sebenarnya siap transfer
     ikut ditandai merah, dan tanda merah yang salah berhenti dibaca. */
  const tanpaNama = selRekening({ penerima: '', bank: 'BCA', norek: '123' });
  cek('penerima kosong tetap menggambar nomornya', tanpaNama.indexOf('123') > -1);
  cek('penerima kosong dibedakan dari rekening kosong',
      tanpaNama.indexOf('belum ada rekening') < 0, tanpaNama);

  /* Bank sebagai daftar tertutup — tapi nilai lama TETAP DIGAMBAR. Tanpa itu,
     membuka vendor yang banknya diimpor dengan ejaan lain akan diam-diam
     menggantinya ke pilihan pertama begitu Simpan ditekan. */
  cek('daftar bank memuat yang dipakai perusahaan',
      ['BCA', 'Mandiri', 'BRI', 'UOB'].every(b => VENDOR_BANK.indexOf(b) > -1), VENDOR_BANK.join(','));
  cek('opsiBank menandai yang terpilih', opsiBank('BCA').indexOf('value="BCA" selected') > -1);
  const lama = opsiBank('Bank Nagari');
  cek('bank tersimpan di luar daftar tetap digambar', lama.indexOf('Bank Nagari') > -1, lama);
  cek('bank luar daftar ditandai (lama)', lama.indexOf('(lama)') > -1);
  cek('bank luar daftar tetap terpilih', /Bank Nagari[^<]*\(lama\)/.test(lama));
  cek('tanpa bank tidak memaksa pilihan', opsiBank('').indexOf('selected') < 0);
}

console.log('\n== Purchasing: ekspor & impor ==');
{
  /* Kolom rekening WAJIB ikut ekspor-impor. Kalau tidak, satu putaran
     ekspor-sunting-impor mengembalikan seluruh vendor tanpa nomor rekening —
     dan bukan sebagai galat, melainkan sebagai kolom yang tiba-tiba kosong di
     lembar pembayaran minggu depan. */
  const kol = ambilArray(PUR, 'KOL_VENDOR');
  cek('KOL_VENDOR memuat Nama Penerima', kol.indexOf("'Nama Penerima'") > -1, kol);
  cek('KOL_VENDOR memuat Bank', kol.indexOf("'Bank'") > -1);
  cek('KOL_VENDOR memuat No. Rekening', kol.indexOf("'No. Rekening'") > -1);

  const eks = potong(PUR, 'function barisEksporVendor(');
  cek('baris ekspor menyertakan ketiganya',
      eks.indexOf('v.penerima') > -1 && eks.indexOf('v.bank') > -1 && eks.indexOf('v.norek') > -1, eks);

  const imp = potong(PUR, 'function bacaVendorRows(');
  cek('pembaca impor mengenal Nama Penerima', imp.indexOf('Nama Penerima') > -1);
  cek('pembaca impor mengenal No. Rekening', imp.indexOf('No. Rekening') > -1);

  /* Jalankan pembacanya sungguhan, bukan cuma memeriksa teksnya. */
  const kode = [
    potong(PUR, 'function petaKolom('),
    ambilBaris(PUR, 'const CSV_SUB'),
    ambilBaris(PUR, 'const bacaYa'),
    ambilBaris(PUR, 'const pisahSub'),
    'const HARI_SINGKAT = ' + ambilArray(PUR, 'HARI_SINGKAT') + ';',
    imp,
    'module.exports = { bacaVendorRows };'
  ].join(NL);
  const m = { exports: {} };
  new Function('module', 'exports', kode)(m, m.exports);
  const hasil = m.exports.bacaVendorRows([
    ['Nama Vendor', 'WhatsApp', 'Perlu Jadwal Jemput', 'Hari Tutup', 'Nama Penerima', 'Bank', 'No. Rekening'],
    ['Toffin', '08123456789', 'Ya', 'Min', 'CV. Toffin Riau Jaya', 'BCA', '034-2928-828'],
    ['Ecocare', '', '', '', '', '', '']
  ]);
  const r0 = (hasil.rows || [])[0] || {};
  cek('impor: penerima terbaca', r0.penerima === 'CV. Toffin Riau Jaya', JSON.stringify(r0));
  cek('impor: bank terbaca', r0.bank === 'BCA');
  /* Nomor rekening TIDAK dibakukan seperti nomor WhatsApp: tanda hubungnya
     memang bagian dari cara nomor itu tertulis di buku bank, dan itulah bentuk
     yang dicocokkan mata sebelum menekan kirim. Yang mengabaikan tanda hubung
     adalah PEMBANDINGNYA, bukan penyimpanannya. */
  cek('impor: nomor rekening utuh dengan tanda hubungnya', r0.norek === '034-2928-828', r0.norek);
  cek('impor: WhatsApp tetap dibakukan ke 62', r0.whatsapp === '628123456789', r0.whatsapp);

  /* Berkas LAMA yang belum punya kolom rekening tidak boleh mengosongkannya.
     Yang menjaganya preserve-if-null di server; yang dijaga di sini adalah
     kliennya tidak mengirim string kosong untuk kolom yang tidak ada. */
  const lawas = m.exports.bacaVendorRows([
    ['Nama Vendor', 'WhatsApp'],
    ['Toffin', '08123456789']
  ]);
  const l0 = (lawas.rows || [])[0] || {};
  cek('berkas tanpa kolom rekening tidak mengirim norek', !('norek' in l0), JSON.stringify(l0));
  cek('berkas tanpa kolom rekening tidak mengirim penerima', !('penerima' in l0));
}

console.log('\n== Purchasing: tabel & form ==');
{
  cek('tabel punya kolom Rekening Transfer', PUR.indexOf("'Rekening Transfer'") > -1);
  cek('sel rekening dipakai di baris tabel', PUR.indexOf('${selRekening(item)}') > -1);
  /* Tabel vendor sekarang delapan kolom. colspan yang tertinggal di tujuh
     membuat baris "tidak ada yang cocok" berhenti di tengah tabel. */
  cek('colspan keadaan kosong ikut delapan kolom', PUR.indexOf('colspan="8"') > -1);
  cek('pencarian ikut menyisir nomor rekening',
      /teksCariVendor[\s\S]{0,1400}norekBersih\(v\.norek\)/.test(PUR));
  cek('pencarian mengenal dua bentuk nomor',
      /v\.norek \|\| '', norekBersih\(v\.norek\)/.test(PUR));
  cek('bisa diurut menurut ada-tidaknya rekening', /rek: n => norekBersih/.test(PUR));

  ['vend-penerima', 'vend-bank', 'vend-norek'].forEach(id =>
    cek('form punya kotak ' + id, PUR.indexOf('id="' + id + '"') > -1));
  cek('form menegaskan nama sesuai buku rekening',
      PUR.indexOf('persis seperti di buku rekening') > -1);
  cek('form menerangkan penerima kosong = nama vendor',
      /Dikosongkan = dianggap sama dengan nama vendor/.test(PUR));
  cek('peringatan rekening kembar ada', PUR.indexOf('function cekNorekKembar(') > -1);
  /* Rekening kembar cuma DIPERINGATKAN, tidak ditolak: satu perusahaan wajar
     punya beberapa nama dagang yang setor ke rekening yang sama. */
  cek('rekening kembar diperingatkan, bukan ditolak',
      /cekNorekKembar[\s\S]{0,1600}Boleh saja/.test(PUR));
  cek('form ubah mengisi ketiga kotaknya',
      /openEditVendorModal[\s\S]{0,1000}vend-norek'\)\.value = appState\.vendors\[name\]\.norek/.test(PUR));
  cek('form tambah mengosongkan ketiga kotaknya',
      /openAddVendorModal[\s\S]{0,900}vend-norek'\)\.value = ""/.test(PUR));
  cek('simpan mengirim ketiganya ke server',
      /action: 'addVendor'[\s\S]{0,400}penerima: penerima[\s\S]{0,120}norek: norek/.test(PUR));
}

console.log('\n== Purchasing: backend ==');
{
  const LIB = fs.readFileSync(path.join(ROOT, 'stock-mysql', 'lib_stock_mysql.php'), 'utf8');
  const API = fs.readFileSync(path.join(ROOT, 'stock-mysql', 'vendors.php'), 'utf8');

  cek('pembaca menormalkan penerima ke string', LIB.indexOf('$v->penerima = isset($v->penerima)') > -1);
  cek('pembaca menormalkan bank ke string', LIB.indexOf('$v->bank     = isset($v->bank)') > -1);
  cek('pembaca menormalkan norek ke string', LIB.indexOf('$v->norek    = isset($v->norek)') > -1);
  cek('penyimpan menerima ketiga parameter',
      /function pur_vendor_simpan\([\s\S]{0,300}\$penerima = null, \$bank = null, \$norek = null\)/.test(LIB));
  /* preserve-if-null WAJIB berlaku untuk ketiganya. Tanpa itu satu kali impor
     Excel (yang barisnya cuma nama + WhatsApp) MENGOSONGKAN nomor rekening
     seluruh vendor — dan yang menyadarinya adalah orang yang mentransfer
     minggu depan, saat kolomnya sudah kosong tanpa satu pun catatan kenapa. */
  cek('preserve-if-null mencakup ketiganya',
      /\$penerima === null \|\| \$bank === null \|\| \$norek === null/.test(LIB));
  cek('nilai lama dibaca dari baris tersimpan',
      LIB.indexOf('$peLama = (string)$lama->penerima') > -1);
  cek('ketiganya masuk ke rekaman yang ditulis',
      /'penerima' => trim\(\(string\)\$penerima\)/.test(LIB));
  cek('impor massal meneruskan ketiganya',
      /pur_vendors_impor[\s\S]{0,1600}\$r->penerima \?\? null, \$r->bank \?\? null, \$r->norek \?\? null/.test(LIB));
  cek('endpoint addVendor meneruskan ketiganya',
      /\$b->penerima \?\? null, \$b->bank \?\? null, \$b->norek \?\? null/.test(API));
}

/* ===================================================================
   BAGIAN 2 — BD OS: form Purchase Order membaca daftar Purchasing
   Modul BD dibungkus IIFE, jadi opsiVendor/VENDOR_PUR TIDAK ada di window.
   Jembatan uji disuntikkan DI DALAM pembungkusnya, di salinan memori.
   =================================================================== */
const ASLI = fs.readFileSync(path.join(ROOT, 'deploy', 'bd', 'index.html'), 'utf8');
const JEMBATAN = [
  '',
  'window.__uji={get DB(){return DB;},set DB(v){DB=v;},',
  'opsiVendor:opsiVendor,muatVendorPur:muatVendorPur,',
  'get VENDOR_PUR(){return VENDOR_PUR;},set VENDOR_PUR(v){VENDOR_PUR=v;},',
  'HALAMAN_ALAMAT:HALAMAN_ALAMAT,SUB:SUB,NAV:NAV};',
  ''
].join(NL);
const iTutup = ASLI.lastIndexOf('})();');
if (iTutup < 0) throw new Error('penutup IIFE modul BD tak ketemu');
const HTML = ASLI.slice(0, iTutup) + JEMBATAN + ASLI.slice(iTutup);

/* Boot modul BD asinkron: DB masih null sampai getAll pulang dan normalize
   selesai. Menunggu jumlah milidetik tertentu itu tebakan — yang di sini
   menunggu KEADAANNYA, jadi mesin lambat tidak membuat uji gagal palsu. */
async function siapDB(w) {
  for (let i = 0; i < 120; i++) {
    if (w.__uji && w.__uji.DB) return w.__uji.DB;
    await tunggu(50);
  }
  throw new Error('DB modul BD tidak pernah siap');
}
function buatDom(opt) {
  opt = opt || {};
  const pesan = [];
  const dom = new JSDOM(HTML, {
    url: 'https://team.laksamanamuda.id/bd/',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    beforeParse(w) {
      w.alert = m => pesan.push(m);
      w.confirm = () => true;
      try {
        w.localStorage.setItem('lm_session', JSON.stringify({
          expiry: Date.now() + 3600000, userId: 'u-wandi', name: 'Wandi Pranata',
          modules: ['bd'], adminModules: ['bd']
        }));
      } catch (e) {}
      /* bacaJawaban() di modul BD membaca respons sebagai TEKS dulu, baru
         diurai. Stub yang cuma punya json() membuat boot menggantung tanpa
         satu pun galat: DB tetap null selamanya. */
      const jawab = obj => ({ ok: true, status: 200,
        text: async () => JSON.stringify(obj),
        json: async () => obj });
      w.fetch = async (url, init) => {
        const body = init && init.body ? JSON.parse(init.body) : {};
        const act = body.action || (String(url).match(/action=([a-zA-Z]+)/) || [])[1] || '';
        pesan.push({ url: String(url), action: act, data: body.data });
        if (String(url).indexOf('vendors.php') > -1) {
          if (opt.vendorGagal) throw new Error('purchasing mati');
          return jawab({ vendors: opt.vendors || {} });
        }
        if (String(url).indexOf('account-api') > -1) return jawab({ ok: true, members: [] });
        if (!act || act === 'getAll') return jawab({ ok: true, data: opt.state || {} });
        return jawab({ ok: true, data: { saved: true } });
      };
    }
  });
  return { dom, pesan };
}

(async () => {
  console.log('\n== BD OS: master vendor sudah tidak ada di sini ==');
  {
    const { dom } = buatDom({});
    await siapDB(dom.window);
    const u = dom.window.__uji;
    const nav = JSON.stringify(u.NAV);
    cek('menu Vendor dicabut dari sidebar',
        nav.indexOf('"vendor"') < 0 && nav.indexOf("'vendor'") < 0, nav.slice(0, 300));
    cek('halaman vendor dicabut dari daftar alamat', u.HALAMAN_ALAMAT.indexOf('vendor') < 0,
        u.HALAMAN_ALAMAT.join(','));
    cek('subjudul halaman vendor ikut dibuang', !u.SUB.vendor);
    /* normalizeState membuang `vendors` — wadah kosong yang tidak dibaca
       siapa pun cuma membuat orang berikutnya mengira ada dua sumber. */
    cek('state tidak lagi menyimpan daftar vendor', !('vendors' in u.DB), Object.keys(u.DB).join(','));
    dom.window.close();
  }

  console.log('\n== BD OS: kotak vendor di form Purchase Order ==');
  {
    const { dom, pesan } = buatDom({
      vendors: { Toffin: { norek: '034-2928-828' }, Ecocare: { norek: '' }, Alisan: { norek: '1' } }
    });
    await siapDB(dom.window);
    const w = dom.window, d = w.document, u = w.__uji;

    u.muatVendorPur();
    for (let i = 0; i < 60 && !Array.isArray(u.VENDOR_PUR); i++) await tunggu(30);
    cek('daftar ditarik dari Purchasing', Array.isArray(u.VENDOR_PUR), String(u.VENDOR_PUR));
    const url = (pesan.find(p => p.url && p.url.indexOf('vendors.php') > -1) || {}).url || '';
    cek('alamatnya menunjuk stock-api-mysql', url.indexOf('stock-api-mysql/vendors.php') > -1, url);
    cek('bukan lagi bd-api', url.indexOf('bd-api') < 0);
    cek('daftarnya berisi nama vendor', (u.VENDOR_PUR || []).indexOf('Toffin') > -1);
    cek('diurutkan menurut abjad', (u.VENDOR_PUR || [])[0] === 'Alisan', String(u.VENDOR_PUR));

    /* DIKETIK, bukan dipilih (28 Agustus 2026, permintaan user). 36 vendor di
       dropdown berarti menggulir untuk satu nama yang sudah diketahui sebelum
       kotaknya dibuka. */
    const saran = u.opsiVendor();
    cek('daftar saran berisi seluruh vendor',
        ['Toffin', 'Ecocare', 'Alisan'].every(n => saran.indexOf('value="' + n + '"') > -1), saran);
    cek('sarannya <option> untuk datalist, bukan pilihan <select>',
        saran.indexOf('selected') < 0 && saran.indexOf('</option>') < 0, saran);
    /* Vendor tanpa rekening TETAP disarankan: purchase order bukan perintah
       transfer, dan rekeningnya baru dibutuhkan di Brankas. */
    cek('vendor tanpa rekening tetap disarankan', saran.indexOf('value="Ecocare"') > -1);

    /* Formnya sungguhan digambar, bukan cuma fungsinya dipanggil — kotak yang
       tidak tersambung ke datalist tidak akan pernah menyaring apa pun. */
    w.APP.poModal();
    await tunggu(120);
    const box = d.getElementById('o_vendor');
    cek('kotak vendor ada di form PO', !!box);
    cek('kotak vendor bisa diketik', box && box.tagName === 'INPUT', box && box.tagName);
    cek('kotak vendor tersambung ke daftar saran',
        box && box.getAttribute('list') === 'o_vlist', box && box.getAttribute('list'));
    cek('daftar sarannya ikut digambar', !!d.getElementById('o_vlist'));

    /* Tiga keadaan yang perlu dibedakan, dan bedanya menentukan apa yang
       dikerjakan orangnya: dikenal, belum ada di master, atau daftarnya memang
       belum terbaca. */
    const info = () => (d.getElementById('o_vendorInfo') || {}).innerHTML || '';
    box.value = 'Toffin'; w.APP.infoVendorPO();
    cek('nama dikenal ditandai', info().indexOf('ada di master') > -1, info());
    cek('nama dikenal bukan peringatan', info().indexOf('belum ada') < 0, info());

    /* Nama di luar master TIDAK ditolak: PO untuk vendor baru sering dibuat
       sebelum vendornya sempat didaftarkan. Yang dilakukan cuma
       mengatakannya, supaya salah ketik tidak lolos diam-diam. */
    box.value = 'Toffn'; w.APP.infoVendorPO();
    cek('salah ketik dikatakan, bukan ditolak', info().indexOf('belum ada di master') > -1, info());
    cek('dan tetap boleh disimpan', info().indexOf('Tetap bisa disimpan') > -1);
    box.value = ''; w.APP.infoVendorPO();
    cek('kosong menunjuk tempat daftarnya', info().indexOf('Purchasing') > -1, info());

    /* Idempoten: dipanggil lagi tidak menembak ulang. Form PO bisa digambar
       ulang belasan kali dalam satu sesi. */
    const sblm = pesan.filter(p => p.url && p.url.indexOf('vendors.php') > -1).length;
    u.muatVendorPur(); u.muatVendorPur();
    await tunggu(150);
    cek('pemuatan tidak diulang tiap render',
        pesan.filter(p => p.url && p.url.indexOf('vendors.php') > -1).length === sblm);
    dom.window.close();
  }

  console.log('\n== BD OS: Purchasing mati ==');
  {
    const { dom } = buatDom({ vendorGagal: true });
    await siapDB(dom.window);
    const w = dom.window, d = w.document, u = w.__uji;
    u.muatVendorPur();
    await tunggu(250);
    /* Purchasing yang mati TIDAK boleh mematikan form PO. Paling jauh kotaknya
       kehilangan saran, dan itu dikatakan. */
    cek('modul BD tetap hidup', !!u.DB);
    cek('daftar tetap null, bukan array kosong palsu', u.VENDOR_PUR === null, String(u.VENDOR_PUR));
    cek('tanpa daftar, sarannya kosong — bukan melempar', u.opsiVendor() === '');

    w.APP.poModal();
    await tunggu(120);
    const box = d.getElementById('o_vendor');
    /* Nama tetap BISA DIKETIK walau masternya tidak datang. Inilah keuntungan
       kotak ketik atas dropdown: dropdown yang daftarnya gagal dibaca tidak
       punya satu pun pilihan, jadi PO-nya tidak bisa dicatat sama sekali. */
    cek('kotaknya tetap bisa diketik', !!box && box.tagName === 'INPUT');
    w.APP.infoVendorPO();
    const info = (d.getElementById('o_vendorInfo') || {}).innerHTML || '';
    cek('dikatakan daftarnya belum terbaca', info.indexOf('belum terbaca') > -1, info);
    /* Dan yang penting: TIDAK menuduh nama yang tersimpan salah. Selama
       daftarnya belum ada, tidak ada dasar untuk mengatakan apa pun tentangnya. */
    box.value = 'Toffin'; w.APP.infoVendorPO();
    const info2 = (d.getElementById('o_vendorInfo') || {}).innerHTML || '';
    cek('nama tersimpan tidak dituduh salah', info2.indexOf('belum ada di master') < 0, info2);
    dom.window.close();
  }

  console.log('\n== BD OS: yang disimpan form PO ==');
  {
    const simpan = ASLI.match(/vendor:\s*g\('o_vendor'\)[^,]*/);
    /* Yang tersimpan NAMA vendor apa adanya (spasinya saja dirapikan). Penanda
       "(lama)" milik versi dropdown sudah tidak ada — kotak ketik menyimpan apa
       yang diketik, jadi tidak ada teks hiasan yang bisa ikut tersimpan. */
    cek('nama disimpan apa adanya, cuma dirapikan spasinya',
        !!simpan && /vendor:\s*g\('o_vendor'\)\.trim\(\)/.test(simpan[0]), simpan && simpan[0]);
    cek('tidak ada penanda tampilan yang ikut tersimpan',
        !!simpan && simpan[0].indexOf('lama') < 0, simpan && simpan[0]);
    cek('kotak vendor bukan <select> lagi', ASLI.indexOf('<select id="o_vendor">') < 0);
    cek('kotak vendor tersambung datalist', ASLI.indexOf('list="o_vlist"') > -1);
    cek('daftarnya ditarik saat form PO digambar', ASLI.indexOf("(muatVendorPur(),'')+") > -1);
    cek('menunjuk tempat menambah vendor',
        ASLI.indexOf('Purchasing → Database &amp; Vendor') > -1);
  }


  console.log('\n== BD OS: backend berhenti menyimpan vendor ==');
  {
    const LIB = fs.readFileSync(path.join(ROOT, 'bd-mysql', 'lib_bd_mysql.php'), 'utf8');
    cek('getAll tidak lagi memulangkan vendors', LIB.indexOf("$out['vendors']") < 0);
    cek('save_all tidak lagi menulis vendors', LIB.indexOf("put_setting($pdo, 'vendors'") < 0);
    /* Barisnya TIDAK dihapus dari database — menghapus baris orang lain lewat
       kode yang kebetulan lewat adalah cara paling pasti untuk suatu hari
       menghapus yang salah. Ia cuma berhenti dibaca. */
    cek('tidak ada penghapusan baris lama', !/DELETE[\s\S]{0,160}vendors/.test(LIB));
    cek('alasannya dicatat untuk yang membacanya nanti', LIB.indexOf('modul Purchasing') > -1);
  }

  /* ===================================================================
     BAGIAN 3 — BRANKAS membaca master yang sama
     Isi lembarnya diuji tools/uji-brankas.js; yang diperiksa di sini cuma
     SUMBERNYA, karena inilah yang paling mudah tertinggal saat dipindahkan.
     =================================================================== */
  console.log('\n== Brankas membaca master yang sama ==');
  {
    const BK = fs.readFileSync(path.join(ROOT, 'deploy', 'finance', 'brankas', 'index.html'), 'utf8');
    cek('alamatnya stock-api-mysql/vendors.php',
        BK.indexOf("const API_VENDOR = '../../stock-api-mysql/vendors.php'") > -1);
    cek('tidak lagi memanggil bd-api', BK.indexOf('bd-api-mysql') < 0);
    /* vendors.php membalas {vendors:{…}} TANPA kunci `ok`. Memeriksa .ok akan
       membuang balasan yang sebenarnya baik-baik saja, dan gejalanya cuma
       kolom penerima yang selalu kosong tanpa satu pun galat. */
    cek('balasan diperiksa lewat .vendors, bukan .ok',
        /VD = \(c\.status === 'fulfilled' && c\.value && c\.value\.vendors/.test(BK));
    cek('peta berkunci nama diratakan jadi array', BK.indexOf('function vendorSemua()') > -1
        && /Object\.keys\(VD\)\.map/.test(BK));
    cek('dicari menurut nama, bukan id', BK.indexOf('function vendorByNama(') > -1);
    cek('pencarian nama tidak peduli besar-kecil huruf', /trim\(\)\.toLowerCase\(\)/.test(
        potong(BK, 'function vendorByNama(')));
    /* Baris pembayaran menyimpan NAMA. Bentuk lama `vendorId` tetap dibaca
       supaya baris yang terlanjur dicatat di dev tidak kehilangan vendornya. */
    /* Baris draf menyimpan NAMA yang diketik, dan bySimpanDraf meneruskannya
       apa adanya. Mencocokkannya ke master lalu menimpanya berarti ejaan yang
       beda tipis diganti tanpa yang mengetiknya tahu. */
    cek('baris draf menyimpan nama vendor yang diketik',
        BK.indexOf("vendor: g('by_vendor').trim()") > -1);
    cek('nama itu diteruskan apa adanya saat disimpan',
        BK.indexOf('vendor: r.vendor') > -1);
    cek('bentuk lama vendorId masih dibaca', BK.indexOf('p.vendor || p.vendorId') > -1);
    cek('menunjuk Purchasing saat rekeningnya kosong',
        BK.indexOf('Purchasing &rarr; Database') > -1 || BK.indexOf('Purchasing → Database') > -1
        || /Purchasing[\s\S]{0,60}Database/.test(BK));
  }

  console.log('\n---------------------------------------');
  console.log('LULUS ' + lulus + '   GAGAL ' + gagal);
  process.exit(gagal ? 1 : 0);
})();
