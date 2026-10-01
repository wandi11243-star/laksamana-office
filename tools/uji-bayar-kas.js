/* Uji Planning Pembayaran di panel Kas Kecil (deploy/finance/kas/) — jsdom,
   kompas-api / finance-api / stock-api tiruan.

   Halamannya PINDAH ke sini dari panel Brankas pada 2 September 2026
   (permintaan user). Asersi di bawah diiris dari tools/uji-brankas.js apa
   adanya: yang berpindah halamannya, bukan aturannya.

   TIGA HAL YANG KHAS SESUDAH PINDAH, dan ketiganya dijaga di sini:

   1. MENULISNYA LEWAT `bayarSave`, BUKAN `brankasSave`. Yang kedua menulis
      SELURUH blob brankas; dua panel yang sama-sama memakainya akan saling
      menimpa — panel yang menyimpan belakangan menghapus mutasi atau
      pengembalian modal yang baru dicatat di panel sebelah, tanpa satu pun
      galat. Kalau suatu hari ada yang "menyederhanakannya" jadi brankasSave,
      uji ini yang menyalakannya.
   2. DATANYA TETAP DI bk_state. Halaman ini membacanya lewat brankasGet —
      ia memang perlu seluruh state untuk menghitung saldo wallet.
   3. SALDONYA DIHITUNG DARI rkHitung() MILIK PANEL INI. aktGrup() di brankas
      sudah berkas kembar rkHitung() di sini; menyalinnya sekali lagi berarti
      TIGA rumus untuk satu angka. */
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

const HTML = fs.readFileSync(path.join(ROOT, 'deploy', 'finance', 'kas', 'index.html'), 'utf8');

let lulus = 0, gagal = 0;
const cek = (nama, syarat, ket) => {
  if (syarat) { lulus++; console.log('  OK   ' + nama); }
  else { gagal++; console.log('  GAGAL ' + nama + (ket ? '  -> ' + ket : '')); }
};
const tunggu = ms => new Promise(r => setTimeout(r, ms));
const teks = el => (el ? (el.textContent || '').replace(/\s+/g, ' ').trim() : '');

/* Blob Kompas secukupnya: halaman ini cuma memakainya untuk menghitung saldo
   wallet, dan saldo awal 24.760.000 di bawah dipilih supaya angka di asersi
   lembar pembayaran tetap sama dengan waktu ia masih di panel Brankas. */
const KOMPAS = {
  reports: {
    '2026-08-01': { pay: { cash:{actual:20000000}, edc_bri:{actual:5000000},
                           transfer_uob:{actual:2000000} }, mdr:{ edc_bri:250000 } }
  },
  rekap_setoran: [{ id:'st1', tujuan:'BRI', nominal:10000000, hari:['2026-08-01'] }],
  daily: [], piutang: [], settings: {}
};

function domKas(opt) {
  opt = opt || {};
  const panggilan = [];
  const dom = new JSDOM(HTML, {
    url: 'https://team.laksamanamuda.id/finance/kas/',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    /* Konsol jsdom disenyapkan: modul ini memuat Chart.js dari CDN dan
       memanggil scrollTo(); tumpukan galatnya menenggelamkan baris OK/GAGAL. */
    virtualConsole: new VirtualConsole(),
    beforeParse(w) {
      w.Chart = function () {}; w.Chart.prototype.destroy = function () {};
      w.HTMLCanvasElement.prototype.getContext = () => ({});
      w.alert = m => { panggilan.push({ alert:m }); };
      w.confirm = () => opt.confirm !== false;
      w.print = () => {};
      w.scrollTo = () => {};
      try {
        w.localStorage.setItem('lm_session', JSON.stringify(Object.assign({
          expiry: Date.now() + 3600000, userId:'u-wandi', name:'Wandi Pranata',
          modules:['finance'], adminModules:['finance']
        }, opt.sesi || {})));
      } catch (e) {}
      w.fetch = async (url, init) => {
        const body = init && init.body ? JSON.parse(init.body) : {};
        const u = String(url);
        panggilan.push({ url:u, body });
        const balas = obj => ({ ok:true, status:200,
          text: async () => JSON.stringify(obj), json: async () => obj });
        /* Master vendor Purchasing. Balasannya {vendors:{…}} TANPA kunci `ok` —
           beda dari finance-api & kompas-api, dan itulah yang paling mudah
           salah dibaca: memeriksa .ok akan membuang balasan yang baik-baik
           saja, dan gejalanya cuma kolom penerima yang selalu kosong. */
        if (u.indexOf('stock-api-mysql/vendors.php') > -1)
          return balas(opt.vendorGagal ? { status:'error' } : { vendors: opt.vendors || {} });
        if (u.indexOf('account-api') > -1)
          return balas({ ok:true, members: opt.roster || [
            { id:'u-wandi', name:'Wandi Pranata', keterangan:'Office', isModuleAdmin:true } ] });
        if (u.indexOf('kompas-api') > -1)
          return balas({ ok:true, data: opt.kompas || KOMPAS });
        /* ---- finance-api ---- */
        /* opt.konflik: bayarSave pertama ditolak sebagai bentrok versi, dan
           brankasGet sesudahnya memulangkan opt.bkSegar — persis yang terjadi
           kalau tab lain menyimpan duluan (1 Oktober 2026). */
        if (body.action === 'brankasGet')
          return balas({ ok:true, data: (opt._konflikTerjadi && opt.bkSegar) || opt.bk || { data:null, akses:{}, peran:{} } });
        if (body.action === 'bayarSave' && opt.konflik && !opt._konflikTerjadi) {
          opt._konflikTerjadi = true;
          return balas({ ok:false, error:'conflict', conflict:true, oleh:'Cindy' });
        }
        if (body.action === 'bayarSave') return balas(opt.gagalSimpan
          ? { ok:false, error:'server sedang mati' } : { ok:true, data:{ saved:true } });
        if (body.action === 'brankasSave') return balas({ ok:true, data:{ saved:true } });
        // kas kecil sendiri (getAll dsb.) — kosong sudah cukup untuk halaman ini
        return balas({ ok:true, data:{ pos:[], kategori:[], trx:[], akses:{}, peran:{} } });
      };
    }
  });
  return { dom, panggilan };
}

/* Halaman ini dimuat MALAS: BK & master vendor baru diambil saat menunya
   dibuka. Semua bagian di bawah karena itu masuk lewat sini, bukan langsung
   memanggil vBayar(). */
async function bukaBayar(w) {
  w.go('bayar');
  await tunggu(60);
  await tunggu(140);          // muatBayar() + render ulang
  return w.document;
}

(async () => {
  /* ================= 1. lembar pembayaran per batch ================= */
  console.log('\n== Lembar pembayaran: batch & kelompok rekening ==');
  {
    /* Meniru lembar Excel: satu tanggal, tiga rekening pembayar. */
    const { dom, panggilan } = domKas({
      vendors: {
        'Toffin':  { penerima:'CV. Toffin Riau Jaya', bank:'BCA', norek:'034-2928-828' },
        'Ecocare': { penerima:'PT. Ecocare Indo Pasifik', bank:'BCA', norek:'' }
      },
      bk: { data:{ rekening:[], piutang:[], investor:[], mutasi:[], setting:{}, bayar:[
        { id:'p1', name:'Bahan baku 21 Agu', cat:'Bahan baku', amount:885000, dari:'uob',
          vendor:'Toffin', batch:'2026-08-27', status:'scheduled', bukti:null },
        { id:'p2', name:'Air refreshner',    cat:'Jasa & Langganan', amount:518000, dari:'uob',
          vendor:'Ecocare', batch:'2026-08-27', status:'scheduled', bukti:null },
        { id:'p3', name:'Bagi hasil cake',   cat:'Bagi hasil', amount:2518100, dari:'mandiri',
          vendor:'', batch:'2026-08-27', status:'scheduled', bukti:null },
        { id:'p4', name:'Bahan baku 20-25',  cat:'Bahan baku', amount:1996000, dari:'bri',
          vendor:'', batch:'2026-08-27', status:'scheduled', bukti:null },
        { id:'p5', name:'Belum dijadwalkan', cat:'Lainnya', amount:100000, dari:'bca',
          vendor:'', batch:'', status:'scheduled', bukti:null }
      ] }, akses:{}, peran:{} }
    });
    await tunggu(400);
    const w = dom.window, d = w.document;
    await bukaBayar(w);
    const v = d.getElementById('app-view').innerHTML;

    cek('judul lembar menyebut tanggalnya', v.indexOf('Pembayaran tgl 27 Agu 2026') > -1, v.slice(0, 400));
    cek('tiga kelompok rekening digambar',
        v.indexOf('Rekening UOB') > -1 && v.indexOf('Rekening Mandiri') > -1 && v.indexOf('Rekening BRI') > -1);
    cek('BCA tidak digambar (barisnya di luar batch)', v.indexOf('Rekening BCA') < 0);

    /* Subtotal per kelompok — angka yang dicocokkan orang dengan m-banking. */
    cek('subtotal UOB 885.000 + 518.000 = 1.403.000', v.indexOf('Rp1.403.000') > -1, v.slice(0, 2500));
    cek('subtotal Mandiri', v.indexOf('Rp2.518.100') > -1);
    cek('total lembar 5.917.100', v.indexOf('Rp5.917.100') > -1, v.slice(-600));

    /* Penerima & rekening DIBACA dari master vendor, tidak diketik ulang. */
    cek('penerima dari master vendor', v.indexOf('CV. Toffin Riau Jaya') > -1);
    cek('nomor rekening dari master vendor', v.indexOf('034-2928-828') > -1);
    cek('vendor tanpa rekening ditandai', v.indexOf('belum ada') > -1);
    cek('baris tanpa vendor tidak mengarang penerima',
        (v.match(/Bagi hasil cake[\s\S]{0,400}?PT\./) || []).length === 0);

    cek('baris di luar batch dihitung terpisah', v.indexOf('Belum Masuk Batch') > -1);
    cek('barisnya sendiri tidak ikut lembar', v.indexOf('Belum dijadwalkan') < 0);

    /* Bukti TF menyimpan siapa & kapan, bukan cuma centang. */
    w.byBukti('p1'); await tunggu(80);
    const kirim = panggilan.filter(p => p.body && p.body.action === 'bayarSave').pop();
    const p1 = kirim && kirim.body.bayar.find(x => x.id === 'p1');
    cek('bukti TF tersimpan', p1 && p1.bukti && p1.bukti.ok === true, JSON.stringify(p1 && p1.bukti));
    cek('bukti mencatat siapa', p1 && p1.bukti.by === 'Wandi Pranata', JSON.stringify(p1 && p1.bukti));
    cek('bukti mencatat kapan', p1 && /^\d{4}-\d{2}-\d{2}$/.test(p1.bukti.at || ''));
    dom.window.close();
  }

  /* ================= 2. bayar satu kelompok sekaligus ================= */
  console.log('\n== Tandai satu rekening terbayar ==');
  {
    const { dom, panggilan } = domKas({
      vendors: {},
      bk: { data:{ rekening:[], piutang:[], investor:[], mutasi:[], setting:{}, bayar:[
        { id:'p1', name:'A', cat:'', amount:1000000, dari:'uob', vendor:'', batch:'2026-08-27', status:'scheduled', bukti:null },
        { id:'p2', name:'B', cat:'', amount:2000000, dari:'uob', vendor:'', batch:'2026-08-27', status:'scheduled', bukti:null },
        { id:'p3', name:'C', cat:'', amount:5000000, dari:'bri', vendor:'', batch:'2026-08-27', status:'scheduled', bukti:null }
      ] }, akses:{}, peran:{} }
    });
    await tunggu(400);
    const w = dom.window;
    await bukaBayar(w);
    const sblm = w.saldoSemua().uob.saldo;
    await w.byBayarGrup('uob'); await tunggu(120);
    const kirim = panggilan.filter(p => p.body && p.body.action === 'bayarSave').pop();
    const rows = kirim ? kirim.body.bayar : [];
    cek('kedua baris UOB jadi paid',
        rows.filter(x => x.dari === 'uob').every(x => x.status === 'paid'),
        JSON.stringify(rows.map(x => x.dari + ':' + x.status)));
    cek('baris BRI TIDAK ikut', (rows.find(x => x.id === 'p3') || {}).status === 'scheduled');
    /* Yang sudah dibayar mengurangi saldo wallet — inilah yang membedakannya
       dari lembar Excel yang cuma dicetak. */
    cek('saldo UOB berkurang 3.000.000', w.saldoSemua().uob.saldo === sblm - 3000000,
        sblm + ' -> ' + w.saldoSemua().uob.saldo);
    cek('saldo BRI tidak bergeser', w.saldoSemua().bri.keluar === 0);
    dom.window.close();
  }

  /* ================= 3. BD mati: lembar tetap terbaca ================= */
  console.log('\n== Master vendor tidak terbaca ==');
  {
    const { dom } = domKas({
      vendorGagal: true,
      bk: { data:{ rekening:[], piutang:[], investor:[], mutasi:[], setting:{}, bayar:[
        { id:'p1', name:'Bahan baku', cat:'', amount:885000, dari:'uob', vendor:'Toffin',
          batch:'2026-08-27', status:'scheduled', bukti:null }
      ] }, akses:{}, peran:{} }
    });
    await tunggu(400);
    const w = dom.window, d = w.document;
    await bukaBayar(w);
    const v = d.getElementById('app-view').innerHTML;
    cek('halaman tetap jalan', v.indexOf('Pembayaran tgl') > -1);
    cek('nominal tetap terbaca', v.indexOf('Rp885.000') > -1);
    cek('mengatakan master vendor tak terbaca', v.indexOf('tidak terbaca') > -1, v.slice(0, 300));
    dom.window.close();
  }

  /* ================= 4. baris cepat + draf ================= */
  console.log('\n== Baris cepat pembayaran ==');
  {
    const { dom, panggilan } = domKas({
      vendors: {
        'Toffin':  { penerima:'CV. Toffin Riau Jaya', bank:'BCA', norek:'034-2928-828' },
        'Ecocare': { penerima:'PT. Ecocare Indo Pasifik', bank:'BCA', norek:'' }
      },
      bk: { data:{ rekening:[], piutang:[], investor:[], mutasi:[], bayar:[], setting:{} }, akses:{}, peran:{} }
    });
    await tunggu(400);
    const w = dom.window, d = w.document;
    await bukaBayar(w);
    const v = d.getElementById('app-view').innerHTML;

    /* Form lama punya tiga bagian berjudul dan enam kotak berlabel — lebih
       tinggi daripada lembar Excel yang sedang disalin, dan tiap baris menuntut
       satu gulir turun lalu naik lagi. Sekarang satu strip. */
    cek('form tidak lagi dibagi bagian berjudul', v.indexOf('by-sec-h') < 0);
    cek('digambar sebagai satu lembar isian', v.indexOf('class="qa-sheet"') > -1, v.slice(0, 400));
    ['by_vendor', 'by_name', 'by_cat', 'by_dari', 'by_amt'].forEach(id =>
      cek('kotak ' + id + ' ada di baris cepat', !!d.getElementById(id)));

    /* SATU grid untuk kepala kolom, baris ketik, dan baris draf. Sebelumnya
       tiga wadah terpisah dengan lebar yang disalin tangan ke masing-masing —
       dan lebar yang disalin pasti melenceng suatu hari, sehingga judul kolom
       tidak lagi berada di atas kotak yang dimaksudnya. */
    const sheet = d.querySelector('.qa-sheet');
    const kepala = [...sheet.querySelectorAll('.hd')].map(x => x.textContent);
    cek('kolomnya berjudul', kepala.filter(Boolean).length === 5, kepala.join('|'));
    cek('judulnya urut seperti kotaknya',
        kepala.filter(Boolean).join('|') === 'Vendor|Keterangan|Kategori|Dibayar dari|Nominal',
        kepala.join('|'));
    cek('kepala kolom & kotaknya di grid yang sama',
        sheet.contains(d.getElementById('by_vendor')) && kepala.length === 6, String(kepala.length));
    /* Rp menempel di kotak nominal, bukan di placeholder: placeholder hilang
       begitu diketik, padahal justru saat mengetik angka satuannya perlu ada. */
    const selRp = d.getElementById('by_amt').parentNode;
    cek('nominal bertanda Rp yang tidak hilang saat diketik',
        selRp.className.indexOf('rp') > -1 && selRp.querySelector('span').textContent === 'Rp',
        selRp.outerHTML.slice(0, 120));
    /* Kotaknya sendiri tidak bergaris — yang memisahkan kolom adalah garis
       lembarnya. Deretan kotak bergaris masing-masing membaca sebagai enam benda
       terpisah, padahal yang sedang diisi satu baris. */
    cek('keterangan vendor membentang selebar lembar',
        d.getElementById('by_infoVendor').className.indexOf('qa-note') > -1,
        d.getElementById('by_infoVendor').className);

    /* Vendor DIKETIK, bukan dipilih dari dropdown: 36 vendor berarti menggulir
       untuk satu nama yang sudah diketahui sebelum kotaknya dibuka. */
    const box = d.getElementById('by_vendor');
    cek('kotak vendor bisa diketik', box.tagName === 'INPUT', box.tagName);
    cek('kotak vendor punya daftar saran', box.getAttribute('list') === 'by_vlist');
    const dl = d.getElementById('by_vlist');
    cek('daftar sarannya berisi vendor', !!dl && dl.querySelectorAll('option').length === 2,
        dl && String(dl.querySelectorAll('option').length));
    cek('sarannya memakai nama vendor',
        !!dl && dl.innerHTML.indexOf('value="Toffin"') > -1, dl && dl.innerHTML);

    /* Tanggal lembar dan tujuan baris baru jadi SATU kendali. Dua kendali untuk
       satu maksud membuat yang mengisi harus menebak mana yang menentukan. */
    cek('tanggal lembar sekaligus tujuan baris baru',
        !!d.getElementById('by_batch') && d.getElementById('by_batch').type === 'date');
    cek('kotak terkunci penerima/bank/norek dibuang',
        !d.getElementById('by_penerima') && !d.getElementById('by_norek'));

    /* Keterangan hidup: dikenal / belum ada di master / tanpa vendor. */
    const info = () => d.getElementById('by_infoVendor').innerHTML;
    const kelas = () => d.getElementById('by_infoVendor').className;
    box.value = 'Toffin'; w.byVendorPilih();
    cek('vendor dikenal: penerima disebut', info().indexOf('CV. Toffin Riau Jaya') > -1, info());
    cek('vendor dikenal: rekening disebut', info().indexOf('034-2928-828') > -1);
    cek('vendor dikenal tidak diberi peringatan', kelas().indexOf('warn') < 0, kelas());

    box.value = 'Ecocare'; w.byVendorPilih();
    cek('vendor tanpa rekening diperingatkan', kelas().indexOf('warn') > -1, info());
    cek('peringatannya menunjuk tempat melengkapinya', info().indexOf('Purchasing') > -1);

    /* Nama di luar master TIDAK ditolak — baris tanpa vendor memang ada di
       lembar Excel (isi kas kecil, biaya admin) — tapi DIKATAKAN, supaya salah
       ketik satu huruf tidak lolos diam-diam sebagai vendor baru. */
    box.value = 'Toffn'; w.byVendorPilih();
    cek('salah ketik dikatakan, bukan ditolak',
        info().indexOf('belum ada di master') > -1, info());
    box.value = ''; w.byVendorPilih();
    cek('kosong dijelaskan sebagai tanpa vendor', info().indexOf('Tanpa vendor') > -1, info());
    cek('kosong bukan peringatan', kelas().indexOf('warn') < 0);
    dom.window.close();
  }

  /* ================= 5. draf: kumpulkan dulu, simpan sekali ================= */
  console.log('\n== Draf: kumpulkan dulu, simpan sekali ==');
  {
    const { dom, panggilan } = domKas({
      vendors: { 'Toffin': { penerima:'CV. Toffin Riau Jaya', bank:'BCA', norek:'034-2928-828' } },
      bk: { data:{ rekening:[], piutang:[], investor:[], mutasi:[], bayar:[], setting:{} }, akses:{}, peran:{} }
    });
    await tunggu(400);
    const w = dom.window, d = w.document;
    await bukaBayar(w);
    const simpanKe = () => panggilan.filter(p => p.body && p.body.action === 'bayarSave');
    const isi = (vd, nm, amt, dari) => {
      d.getElementById('by_vendor').value = vd;
      d.getElementById('by_name').value = nm;
      d.getElementById('by_amt').value = amt;
      if (dari) d.getElementById('by_dari').value = dari;
    };

    /* Enter menambah ke DRAF, bukan mengirim ke server. */
    isi('Toffin', 'Bahan baku 21 Agu', '885.000', 'uob');
    let dicegah = false;
    w.byEnter({ key:'Enter', preventDefault: () => { dicegah = true; } });
    await tunggu(120);
    cek('Enter tidak diteruskan ke peramban', dicegah);
    cek('Enter menambah ke draf, tidak ke server', simpanKe().length === 0, String(simpanKe().length));
    cek('draf tergambar', !!d.querySelector('.qa-sel'));
    cek('draf mengatakan belum tersimpan',
        d.querySelector('.draf-kaki').textContent.indexOf('belum disimpan') > -1);
    cek('draf menyebut jumlah barisnya',
        Math.round(d.querySelectorAll('.qa-sel').length / 6) === 1,
        String(Math.round(d.querySelectorAll('.qa-sel').length / 6)));

    /* Yang BERULANG dalam satu lembar tidak dikosongkan. */
    cek('rekening diingat untuk baris berikutnya', d.getElementById('by_dari').value === 'uob');
    cek('kursor kembali ke kotak vendor',
        d.activeElement && d.activeElement.id === 'by_vendor',
        d.activeElement && d.activeElement.id);
    cek('kotak vendor dikosongkan untuk baris berikutnya',
        d.getElementById('by_vendor').value === '', d.getElementById('by_vendor').value);

    isi('Ecocare', 'Air refreshner', '518.000');
    w.byTambahDraf(); await tunggu(120);
    cek('baris kedua masuk draf', Math.round(d.querySelectorAll('.qa-sel').length / 6) === 2);
    cek('total draf dijumlahkan',
        d.querySelector('.draf-kaki').textContent.indexOf('Rp1.403.000') > -1,
        d.querySelector('.draf-kaki').textContent);
    /* Vendor yang belum ada di master ditandai di tabel draf juga — di sinilah
       barisnya berjajar dan salah ketik paling mudah terlihat. */
    cek('vendor di luar master ditandai di tabel draf',
        d.querySelector('.qa-sheet').innerHTML.indexOf('baru') > -1);
    cek('masih belum ada yang dikirim', simpanKe().length === 0);

    /* Baris draf bisa dibuang satu-satu sebelum disimpan. */
    w.byHapusDraf(0); await tunggu(100);
    cek('baris draf bisa dibuang', Math.round(d.querySelectorAll('.qa-sel').length / 6) === 1);
    cek('yang tersisa adalah baris kedua',
        d.querySelector('.qa-sheet').textContent.indexOf('Air refreshner') > -1);

    /* SATU penulisan untuk seluruh draf. Menyimpan per baris berarti 20
       penulisan blob penuh untuk satu lembar Excel — dan kalau yang kesepuluh
       gagal, sembilan sudah masuk sementara sebelas belum. */
    isi('Toffin', 'Bagi hasil', '2.518.100', 'mandiri');
    w.byTambahDraf(); await tunggu(100);
    d.getElementById('by_batch').value = '2026-08-27';
    await w.bySimpanDraf(); await tunggu(200);
    cek('seluruh draf disimpan sekali jalan', simpanKe().length === 1, String(simpanKe().length));
    const rows = simpanKe()[0].body.bayar || [];
    cek('kedua baris ikut terkirim', rows.length === 2, JSON.stringify(rows.map(r => r.name)));
    cek('semuanya masuk lembar yang dipilih',
        rows.every(r => r.batch === '2026-08-27'), JSON.stringify(rows.map(r => r.batch)));
    cek('nominal terbaca dari teks berformat',
        rows.some(r => r.amount === 2518100), JSON.stringify(rows.map(r => r.amount)));
    cek('rekening tiap baris ikut tersimpan',
        rows.some(r => r.dari === 'mandiri') && rows.some(r => r.dari === 'uob'),
        JSON.stringify(rows.map(r => r.dari)));
    cek('draf kosong sesudah disimpan', !d.querySelector('.qa-sel'));
    dom.window.close();
  }

  /* ================= 6. gagal simpan tidak meninggalkan baris hantu ============ */
  console.log('\n== Draf: simpan gagal ==');
  {
    const { dom } = domKas({
      gagalSimpan: true,
      vendors: {},
      bk: { data:{ rekening:[], piutang:[], investor:[], mutasi:[], bayar:[], setting:{} }, akses:{}, peran:{} }
    });
    await tunggu(400);
    const w = dom.window, d = w.document;
    await bukaBayar(w);
    d.getElementById('by_name').value = 'Bahan baku';
    d.getElementById('by_amt').value = '885.000';
    w.byTambahDraf(); await tunggu(100);
    d.getElementById('by_batch').value = '2026-08-27';
    await w.bySimpanDraf(); await tunggu(250);
    /* Gagal simpan HARUS mengembalikan keduanya: baris yang sudah terlanjur
       ditempel ke state, DAN drafnya. Kalau barisnya tertinggal di layar, yang
       membacanya mengira sudah tercatat padahal server tidak pernah menerimanya. */
    cek('baris tidak tertinggal di lembar', (w.eval('BK.data.bayar')).length === 0,
        JSON.stringify(w.eval('BK.data.bayar')));
    cek('draf dikembalikan supaya bisa dicoba lagi', !!d.querySelector('.qa-sel'));
    cek('isinya utuh', Math.round(d.querySelectorAll('.qa-sel').length / 6) === 1);
    dom.window.close();
  }

  /* ================= 6b. bentrok versi: dua tab Kas Kecil ================= */
  /* Tab ini memuat daftar KOSONG. Sesudahnya tab lain (Cindy) menambah baris
     'Dari tab lain'. Dulu simpan dari tab ini MENGHAPUS baris itu tanpa satu
     pun galat, karena yang dikirim daftar milik tab ini apa adanya. Sekarang
     server menolak; halaman memuat ulang, drafnya tetap utuh, dan simpan
     ulang mengirim KEDUA baris. */
  console.log('\n== Draf: bentrok versi dengan tab lain ==');
  {
    const barisLain = { id:'px', name:'Dari tab lain', cat:'', amount:500000, dari:'uob',
      vendor:'', batch:'2026-08-27', status:'scheduled', bukti:null };
    const { dom, panggilan } = domKas({
      konflik: true, vendors: {},
      bk: { data:{ rekening:[], piutang:[], investor:[], mutasi:[], bayar:[], setting:{} },
            akses:{}, peran:{}, ver:{ lain:100, bayar:200 } },
      bkSegar: { data:{ rekening:[], piutang:[], investor:[], mutasi:[], bayar:[ barisLain ], setting:{} },
            akses:{}, peran:{}, ver:{ lain:100, bayar:300 } }
    });
    await tunggu(400);
    const w = dom.window, d = w.document;
    await bukaBayar(w);
    d.getElementById('by_name').value = 'Bahan baku';
    d.getElementById('by_amt').value = '885.000';
    w.byTambahDraf(); await tunggu(100);
    d.getElementById('by_batch').value = '2026-08-27';
    await w.bySimpanDraf(); await tunggu(300);
    const kirim1 = panggilan.filter(p => p.body && p.body.action === 'bayarSave');
    cek('versi yang dipegang ikut dikirim (baseVer)', kirim1.length === 1 && kirim1[0].body.baseVer === 200,
        JSON.stringify(kirim1.map(k => k.body.baseVer)));
    cek('bentrok dikatakan, berikut nama yang menyimpan duluan',
        panggilan.some(p => p.alert && /TIDAK disimpan/.test(p.alert) && /Cindy/.test(p.alert)));
    const bayar = w.eval('BK.data.bayar');
    cek('data terbaru dimuat ulang — baris tab lain TIDAK hilang',
        bayar.length === 1 && bayar[0].id === 'px', JSON.stringify(bayar));
    cek('rollback tidak menimpa data segar dengan salinan lama', w.eval('BK.ver.bayar') === 300);
    cek('draf tetap utuh untuk disimpan ulang', d.querySelectorAll('.qa-sel').length > 0);
    d.getElementById('by_batch').value = '2026-08-27';
    await w.bySimpanDraf(); await tunggu(300);
    const kirim2 = panggilan.filter(p => p.body && p.body.action === 'bayarSave').pop();
    const nama2 = (kirim2 && kirim2.body.bayar || []).map(r => r.name).sort();
    cek('simpan ulang membawa KEDUA baris', JSON.stringify(nama2) === JSON.stringify(['Bahan baku','Dari tab lain']),
        JSON.stringify(nama2));
    cek('dan memakai versi yang baru', kirim2 && kirim2.body.baseVer === 300);
    dom.window.close();
  }

  /* ================= 7. lembar lama terarsipkan sendiri ================= */
  console.log('\n== Lembar berjalan & arsip ==');
  {
    const { dom } = domKas({
      vendors: {},
      bk: { data:{ rekening:[], piutang:[], investor:[], mutasi:[], setting:{}, bayar:[
        { id:'p1', name:'Minggu ini', cat:'', amount:885000, dari:'uob', vendor:'',
          batch:'2026-08-27', status:'scheduled', bukti:null },
        { id:'p2', name:'Minggu lalu lunas', cat:'', amount:5000000, dari:'bri', vendor:'',
          batch:'2026-08-20', status:'paid', bukti:null },
        { id:'p3', name:'Dua minggu lalu, belum', cat:'', amount:900000, dari:'bca', vendor:'',
          batch:'2026-08-13', status:'scheduled', bukti:null }
      ] }, akses:{}, peran:{} }
    });
    await tunggu(400);
    const w = dom.window, d = w.document;
    await bukaBayar(w);

    /* LEMBAR BERJALAN = TANGGAL TERBARU, dihitung, bukan ditandai. Penanda yang
       harus diperbarui manual akan melenceng, dan lembar minggu lalu yang lupa
       ditandai terus menerima baris minggu ini tanpa satu pun tanda. */
    cek('lembar terbaru yang terbuka lebih dulu',
        d.getElementById('by_batch').value === '2026-08-27', d.getElementById('by_batch').value);
    const bar = () => d.getElementById('by_batch').closest('.card');
    cek('lembar terbaru ditandai berjalan',
        bar().textContent.indexOf('lembar berjalan') > -1);
    const chips = () => [...bar().querySelectorAll('.arsip-bar .qa-chip')].map(c => c.textContent);
    cek('lembar lama pindah ke arsip', chips().length === 2, chips().join('|'));
    /* Mengarsipkan yang belum selesai persis begitulah pembayaran terlupakan:
       lembarnya turun dari layar dan tidak ada yang menyebut masih ada sisa. */
    cek('arsip yang masih punya sisa disebutkan',
        chips().some(t => t.indexOf('13 Agu') > -1 && t.indexOf('1 belum') > -1), chips().join('|'));
    cek('arsip yang sudah lunas tidak diberi angka',
        chips().some(t => t.indexOf('20 Agu') > -1 && t.indexOf('belum') < 0), chips().join('|'));

    /* Lembar arsip TIDAK langsung menerima baris baru: menambahkan baris ke
       lembar minggu lalu karena kebetulan sedang dibuka adalah salah yang tidak
       menghasilkan satu pun galat — barisnya cuma tidak pernah ikut dibayar. */
    w.batchPilih('2026-08-20'); await tunggu(80);
    cek('lembar arsip ditandai arsip', bar().textContent.indexOf('arsip') > -1);
    cek('strip tambah baris disembunyikan di lembar arsip', !d.getElementById('by_vendor'));
    cek('dikatakan kenapa', bar().textContent.indexOf('sudah diarsipkan') > -1);
    cek('menunjuk lembar berjalan', bar().textContent.indexOf('27 Agu 2026') > -1);
    /* Bukti TF & status bayar TETAP bisa diubah di arsip — pembayaran minggu
       lalu sering baru dikonfirmasi minggu ini. */
    cek('barisnya tetap tergambar',
        d.getElementById('app-view').innerHTML.indexOf('Minggu lalu lunas') > -1);

    /* Menambah ke lembar arsip tetap MUNGKIN, tapi harus diminta. */
    w.byPaksaArsip(); await tunggu(80);
    cek('bisa tetap menambah kalau diminta', !!d.getElementById('by_vendor'));
    cek('dan diperingatkan ke mana barisnya masuk',
        bar().textContent.indexOf('lembar arsip 20 Agu 2026') > -1, bar().textContent.slice(0, 300));
    /* Izinnya berlaku SATU lembar: kalau menetap, lembar arsip berikutnya ikut
       terbuka untuk diisi tanpa ada yang memintanya. */
    w.batchPilih('2026-08-27'); await tunggu(60);
    w.batchPilih('2026-08-13'); await tunggu(60);
    cek('izin menulis ke arsip tidak menetap', !d.getElementById('by_vendor'));
    dom.window.close();
  }




  /* ================= 8. yang khas sesudah pindah ================= */
  console.log('\n== Pindah dari Brankas ke Kas Kecil ==');
  {
    const { dom, panggilan } = domKas({ bk:{ data:{ bayar:[
      { id:'p1', batch:'2026-08-25', vendor:'Toffin', name:'Kopi', cat:'Bahan baku',
        dari:'uob', amount:500000, status:'scheduled' }
    ], mutasi:[], investor:[], setting:{} }, akses:{}, peran:{} } });
    await tunggu(400);
    const w = dom.window;
    const d = await bukaBayar(w);
    cek('halamannya ada di Kas Kecil', d.getElementById('app-view').innerHTML.indexOf('Toffin') > -1);

    /* Membacanya lewat brankasGet — halaman ini memang perlu seluruh state
       untuk menghitung saldo wallet. */
    cek('dibaca lewat brankasGet',
        panggilan.some(x => x.body && x.body.action === 'brankasGet'));
    /* ...dan hanya SAAT dibuka. Panel ini sudah menarik tiga sumber saat boot;
       menambah dua lagi untuk menu yang tidak selalu dibuka membuat seluruh
       modul terasa lebih lambat demi satu halaman. */
    const { dom:dom2, panggilan:pg2 } = domKas({ bk:{ data:{ bayar:[] }, akses:{}, peran:{} } });
    await tunggu(400);
    cek('tidak diambil saat boot, hanya saat menunya dibuka',
        !pg2.some(x => x.body && x.body.action === 'brankasGet'));
    dom2.window.close();

    /* PENULISNYA SEMPIT. brankasSave menulis SELURUH blob; dua panel yang
       sama-sama memakainya akan saling menimpa — panel yang menyimpan
       belakangan menghapus mutasi atau pengembalian modal yang baru dicatat di
       panel sebelah, tanpa satu pun galat. */
    await w.hapusBaris('bayar', 'p1', 'bayar', 'x');
    await tunggu(120);
    cek('menulis lewat bayarSave',
        panggilan.some(x => x.body && x.body.action === 'bayarSave'));
    cek('TIDAK pernah menulis lewat brankasSave',
        !panggilan.some(x => x.body && x.body.action === 'brankasSave'),
        JSON.stringify(panggilan.filter(x => x.body && x.body.action === 'brankasSave').map(x => x.body.action)));
    const kirim = panggilan.filter(x => x.body && x.body.action === 'bayarSave').pop();
    /* Muatannya HANYA daftar bayar. Kalau `data` ikut terkirim, penulis sempit
       di server tinggal satu langkah dari menulis seluruh blob lagi. */
    cek('yang dikirim cuma daftar bayar',
        kirim && Array.isArray(kirim.body.bayar) && kirim.body.data === undefined,
        kirim ? Object.keys(kirim.body).join(',') : '-');
    dom.window.close();
  }

  /* ================= 9. tidak tertinggal di panel lama ================= */
  console.log('\n== Sudah tidak ada di panel Brankas ==');
  {
    const BR = fs.readFileSync(path.join(ROOT, 'deploy', 'finance', 'brankas', 'index.html'), 'utf8');
    cek('menu Planning Pembayaran hilang dari sidebar Brankas',
        BR.indexOf('data-view="bayar"') < 0);
    cek('halamannya tidak lagi digambar di sana', BR.indexOf('function vBayar') < 0);
    cek('tidak ada berkas kembar: lembar isiannya cuma di satu tempat',
        BR.indexOf('qa-sheet') < 0);
    /* YANG HARUS TETAP: datanya. Baris berstatus `paid` mengurangi saldo
       wallet di halaman Saldo panel Brankas; mencabut `bayar` dari blob
       "karena halamannya sudah pindah" akan membuang seluruh rencana
       pembayaran pada penyimpanan berikutnya, dan saldo wallet naik sendiri
       sebesar yang sudah terbayar. */
    cek('saldo Brankas MASIH menghitung baris terbayar',
        /bk\.bayar|BK\.data\.bayar/.test(BR) && BR.indexOf("p.status !== 'paid'") > -1);

    const PHP = fs.readFileSync(path.join(ROOT, 'finance-mysql', 'lib_finance_mysql.php'), 'utf8');
    cek('`bayar` masih di daftar kunci brankas_simpan()',
        /foreach \(array\([^)]*'bayar'[^)]*\) as \$k\)/.test(PHP));
    /* Penulis sempit mengganti SATU kunci, dan blob lainnya dibaca di DALAM
       transaksi yang sama — itu yang membuat dua panel bisa hidup
       berdampingan di atas satu blob (bentuk sejak 1 Oktober 2026: satu
       penulis brankas_tulis() untuk kedua panel). */
    const potong = (a, b) => PHP.slice(PHP.indexOf(a), PHP.indexOf(b));
    const fn = potong('function brankas_bayar_simpan', 'function brankas_akses_simpan');
    const tulis = potong('function brankas_tulis', 'function brankas_simpan');
    const simpanBk = potong('function brankas_simpan', 'function brankas_bayar_simpan');
    cek('penulis sempit cuma menulis kunci bayar',
        /brankas_tulis\(array\('bayar' => \$rows\), array\('bayar'\), 'bayar'/.test(fn));
    cek('blob lama dibaca di dalam transaksi berkunci (FOR UPDATE)',
        tulis.indexOf('FOR UPDATE') > -1 && tulis.indexOf('beginTransaction') > -1);
    cek('penyaringan kuncinya tetap satu tempat (brankas_saring)',
        tulis.indexOf('brankas_saring(') > -1);
    /* Panel Brankas TIDAK boleh lagi menulis `bayar`: salinannya bisa basi
       berjam-jam, dan menuliskannya menghapus baris yang diketik di Kas Kecil. */
    const kunciBk = (simpanBk.match(/brankas_tulis\(\$data, array\(([^)]*)\)/) || [, ''])[1];
    cek('brankasSave tidak menulis bayar', kunciBk !== '' && kunciBk.indexOf("'bayar'") < 0, kunciBk);
    cek('versi dipisah per pemilik (lain / bayar)',
        /'lain'/.test(simpanBk) && /'bayar'\)/.test(fn));
    cek('bentrok versi ditolak, bukan ditimpa',
        /\(int\)\$baseVer !== \$ver\[\$jenis\]/.test(tulis) && tulis.indexOf("'conflict' => true") > -1);
  }

  console.log('\n---------------------------------------');
  console.log('LULUS ' + lulus + '   GAGAL ' + gagal);
  process.exit(gagal ? 1 : 0);
})();
