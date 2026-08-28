/* Uji panel Brankas (deploy/finance/brankas/) di jsdom, dengan finance-api,
   kompas-api, dan account-api tiruan.

   Yang paling penting diuji di sini BUKAN tampilannya, tapi angkanya: saldo
   tiap wadah dihitung dari Aktual Masuk di Rekap Penjualan, dan salah sedikit
   saja muncul sebagai uang. */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const { JSDOM } = require(path.join(ROOT, 'node_modules', 'jsdom'));

const HTML = fs.readFileSync(path.join(ROOT, 'deploy', 'finance', 'brankas', 'index.html'), 'utf8');

let lulus = 0, gagal = 0;
const cek = (nama, syarat, ket) => {
  if (syarat) { lulus++; console.log('  OK   ' + nama); }
  else { gagal++; console.log('  GAGAL ' + nama + (ket ? '  -> ' + ket : '')); }
};
const tunggu = ms => new Promise(r => setTimeout(r, ms));

/* Dua hari omset. Angkanya dipilih supaya tiap jalur rumus terlihat:
   - cash          : tanpa MDR  -> aktual masuk = aktual kotor
   - edc_bri       : MDR tersimpan -> kotor - mdr
   - qris_mandiri  : aktual DIKETIK -> pakai angka itu, MDR diabaikan
   - transfer(UOB) : tanpa MDR
   - error_*       : BUKAN uang, tidak boleh masuk saldo mana pun */
const KOMPAS = {
  reports: {
    '2026-08-01': {
      pay: { cash:{actual:10000000}, edc_bri:{actual:5000000}, qris_mandiri:{actual:3000000},
             transfer_uob:{actual:2000000}, error_kasir:{actual:9999999} },
      mdr: { edc_bri:100000, qris_mandiri:50000 }
    },
    '2026-08-02': {
      pay: { cash:{actual:8000000}, edc_bri:{actual:4000000}, qris_mandiri:{actual:1000000} },
      mdr: { edc_bri:80000 },
      aktual: { qris_mandiri:990000 }        // diketik -> menang atas kotor-mdr
    }
  },
  rekap_setoran: [
    { id:'st1', tgl:'2026-08-03', tujuan:'Setor ke BRI', hari:['2026-08-01'], nominal:10000000 },
    { id:'st2', tgl:'2026-08-04', tujuan:'brankas kantor', hari:['2026-08-02'], nominal:8000000 }
  ]
};
/* Perhitungan yang diharapkan:
     cash    masuk = 10.000.000 + 8.000.000       = 18.000.000
     bri     masuk = (5jt-100rb) + (4jt-80rb)     =  8.820.000
     mandiri masuk = (3jt-50rb) + 990.000         =  3.940.000
     uob     masuk = 2.000.000                    =  2.000.000
     bca     masuk = 0
     setoran: BRI +10.000.000 ; cash -18.000.000 (dua-duanya keluar dari cash)
     st2 tujuannya tidak dikenal -> cash tetap berkurang, tidak masuk bank mana pun */

function domBrankas(opt) {
  opt = opt || {};
  const panggilan = [];
  const dom = new JSDOM(HTML, {
    url: 'https://team.laksamanamuda.id/finance/brankas/',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    beforeParse(w) {
      w.Chart = function () {}; w.Chart.prototype.destroy = function () {};
      w.HTMLCanvasElement.prototype.getContext = () => ({});
      w.alert = m => { panggilan.push({ alert:m }); };
      w.confirm = () => opt.confirm !== false;
      try {
        w.localStorage.setItem('lm_session', JSON.stringify(Object.assign({
          expiry: Date.now() + 3600000, userId:'u-wandi', name:'Wandi Pranata',
          modules:['brankas'], adminModules:['brankas']
        }, opt.sesi || {})));
      } catch (e) {}
      w.fetch = async (url, init) => {
        const body = init && init.body ? JSON.parse(init.body) : {};
        panggilan.push({ url, body });
        if (String(url).indexOf('kompas-api') > -1)
          return { json: async () => (opt.kompasGagal ? { ok:false, error:'x' } : { ok:true, data: KOMPAS }) };
        if (String(url).indexOf('account-api') > -1)
          return { json: async () => ({ ok:true, members: opt.roster || [
            { id:'u-wandi', name:'Wandi Pranata', keterangan:'Office', isModuleAdmin:true },
            { id:'u-dina',  name:'Dina',          keterangan:'Finance', isModuleAdmin:false } ] }) };
        // finance-api
        if (body.action === 'brankasGet')
          return { json: async () => ({ ok:true, data: opt.bk || { data:null, akses:{}, peran:{} } }) };
        if (body.action === 'brankasSave')  return { json: async () => ({ ok:true, data:{ saved:true } }) };
        if (body.action === 'brankasAkses') return { json: async () => ({ ok:true, data:{ akses: body.peta } }) };
        if (body.action === 'brankasPeran') return { json: async () => ({ ok:true, data:{ peran: { [body.kunci]: body.peran } } }) };
        return { json: async () => ({ ok:false, error:'aksi tak dikenal' }) };
      };
    }
  });
  return { dom, panggilan };
}

const teks = el => (el ? (el.textContent || '').replace(/\s+/g, ' ').trim() : '');

(async () => {
  /* ================= 1. boot & saldo ================= */
  console.log('\n== Boot, saldo dari Rekap Penjualan ==');
  {
    const { dom, panggilan } = domBrankas({
      bk: { data: { rekening:[], piutang:[], bayar:[], investor:[],
                    setting:{ awal:{ bri:1000000 }, burn:5000000 } }, akses:{}, peran:{} }
    });
    await tunggu(400);
    const w = dom.window, d = w.document;

    cek('tidak dilempar keluar', d.getElementById('app-view') !== null);
    cek('nama pemakai terisi', teks(d.getElementById('suName')) === 'Wandi Pranata', teks(d.getElementById('suName')));
    cek('avatar inisial WP', teks(d.getElementById('suAvatar')) === 'WP', teks(d.getElementById('suAvatar')));
    cek('memanggil brankasGet', panggilan.some(p => p.body && p.body.action === 'brankasGet'));
    cek('memanggil kompas getAll', panggilan.some(p => String(p.url).indexOf('kompas-api') > -1));

    const s = w.saldoSemua();
    cek('cash masuk 18.000.000', s.cash.masuk === 18000000, String(s.cash.masuk));
    cek('BRI masuk 8.820.000 (kotor − MDR)', s.bri.masuk === 8820000, String(s.bri.masuk));
    cek('Mandiri masuk 3.940.000 (aktual diketik menang)', s.mandiri.masuk === 3940000, String(s.mandiri.masuk));
    /* UOB kini menampung transfer DAN ojol DAN QR Order. Data uji tidak punya
       ojol, jadi angkanya tetap 2 juta — yang diuji di bawah pemetaannya. */
    cek('UOB masuk 2.000.000 (transfer, tanpa MDR)', s.uob.masuk === 2000000, String(s.uob.masuk));
    const pmap = w.petaGrup();
    cek('QR Order dipetakan ke UOB', pmap.qr_order === 'uob', pmap.qr_order);
    cek('Gofood dipetakan ke UOB', pmap.gofood === 'uob', pmap.gofood);
    cek('Grabfood dipetakan ke UOB', pmap.grabfood === 'uob', pmap.grabfood);
    cek('tidak ada metode tanpa tujuan', w.petaBelum().length === 0,
        w.petaBelum().map(g => g.n).join(','));
    cek('BCA masuk 0', s.bca.masuk === 0, String(s.bca.masuk));
    /* error_kasir 9.999.999 ada di Report Daily tapi BUKAN uang yang masuk
       rekening — ia catatan salah input. Diperiksa lewat TOTAL, bukan ambang
       per wadah: cash 18 juta wajar melebihi angka sentinel apa pun, dan
       asersi berambang akan menuduh baris yang benar. */
    const totalMasuk = Object.keys(s).reduce((a, k) => a + s[k].masuk, 0);
    cek('error_* TIDAK masuk saldo mana pun (total 32.760.000)',
        totalMasuk === 32760000, String(totalMasuk) + ' — kalau 42.759.999 berarti error ikut terhitung');
    cek('setoran ke BRI menambah BRI', s.bri.setorMasuk === 10000000, String(s.bri.setorMasuk));
    cek('setoran mengurangi cash (dua-duanya)', s.cash.setorKeluar === 18000000, String(s.cash.setorKeluar));
    cek('setoran tujuan tak dikenal tidak masuk bank mana pun',
        s.mandiri.setorMasuk === 0 && s.bca.setorMasuk === 0 && s.uob.setorMasuk === 0);
    cek('saldo awal BRI ikut', s.bri.awal === 1000000, String(s.bri.awal));
    cek('saldo BRI = 1jt + 8,82jt + 10jt', s.bri.saldo === 19820000, String(s.bri.saldo));
    cek('saldo cash = 18jt − 18jt = 0', s.cash.saldo === 0, String(s.cash.saldo));

    /* halaman Saldo & Rekening */
    w.go('saldo'); await tunggu(60);
    const v = d.getElementById('app-view').innerHTML;
    cek('saldo: format Rp dengan titik ribuan', v.indexOf('Rp19.820.000') > -1, v.slice(0, 300));
    cek('saldo: menyebut cash = aktual kotor', v.indexOf('aktual masuk = aktual kotor') > -1);
    /* Sejak QR Order/Gofood/Grabfood dipetakan ke UOB (27 Agu 2026), tidak ada
       lagi metode yang menggantung — jadi pita peringatannya justru TIDAK boleh
       muncul. Yang diuji sekarang kebalikannya. */
    cek('saldo: tidak ada metode yang menggantung', v.indexOf('belum punya tujuan bank') < 0, v.slice(0, 900));
    cek('saldo: tidak ada label "belum dipetakan"', v.indexOf('belum dipetakan') < 0);
    cek('saldo: menyebut QR Order/Gofood/Grabfood',
        v.indexOf('QR Order') > -1 && v.indexOf('Gofood') > -1 && v.indexOf('Grabfood') > -1);
    cek('saldo: memperingatkan setoran tak dikenal', v.indexOf('tujuannya tidak dikenali') > -1);
    cek('saldo: empat bank + cash tergambar',
        ['BRI','Mandiri','BCA','UOB','Brankas Fisik'].every(n => v.indexOf(n) > -1));
    dom.window.close();
  }

  /* ================= 2. kompas mati ================= */
  console.log('\n== Rekap Penjualan tidak terbaca ==');
  {
    const { dom } = domBrankas({ kompasGagal:true });
    await tunggu(400);
    const w = dom.window, d = w.document;
    cek('modul tetap hidup', d.getElementById('app-view').innerHTML.length > 0);
    w.go('ringkasan'); await tunggu(40);
    cek('ringkasan memperingatkan', d.getElementById('app-view').innerHTML.indexOf('belum bisa dihitung') > -1,
        d.getElementById('app-view').innerHTML.slice(0, 300));
    w.go('pending'); await tunggu(40);
    cek('halaman piutang tetap bisa dibuka', d.getElementById('app-view').innerHTML.indexOf('Catat Piutang') > -1);
    dom.window.close();
  }

  /* ================= 3. tidak ada data dummy ================= */
  console.log('\n== Tidak ada satu pun angka contoh ==');
  {
    const { dom } = domBrankas({});
    await tunggu(400);
    const w = dom.window, d = w.document;
    const semua = [];
    ['ringkasan','saldo','pending','bayar','modal','pengaturan'].forEach(v => { w.go(v); semua.push(d.getElementById('app-view').innerHTML); });
    const gab = semua.join(' ');
    cek('tidak ada nama investor karangan', !/Bakri|Sari Wahyuni|Nusantara Capital/.test(gab));
    cek('tidak ada rekening karangan', !/BCA Operasional|Mandiri Payroll|4839/.test(gab));
    cek('tidak ada piutang karangan', !/Mitsubishi|Pertamina/.test(gab));
    cek('tidak ada PIN', !/pinCFO|pinCEO|2468|1357/.test(gab));
    cek('piutang kosong menyebutkan dirinya kosong', semua[2].indexOf('Belum ada piutang') > -1);
    cek('investor kosong menyebutkan dirinya kosong', semua[4].indexOf('Belum ada investor') > -1);
    dom.window.close();
  }

  /* ================= 4. hak akses per role ================= */
  console.log('\n== Kelola akses per role ==');
  {
    /* viewer: seluruh halaman berisian turun jadi Lihat, dan matriks yang
       menyimpan 2 untuk viewer tetap dijepit. */
    const { dom } = domBrankas({
      sesi: { modules:['brankas'], adminModules:[], userId:'u-dina', name:'Dina' },
      bk: { data:null, akses:{ viewer:{ bayar:2, pengaturan:0 } }, peran:{ '#u-dina':'viewer' } }
    });
    await tunggu(400);
    const w = dom.window, d = w.document;
    cek('role terbaca viewer', w.peranSaya() === 'viewer', w.peranSaya());
    cek('viewer tidak pernah boleh Ubah walau matriks menyimpan 2', w.bolehUbah('bayar') === false);
    cek('viewer masih boleh Lihat', w.bolehLihat('bayar') === true);
    cek('Pengaturan disembunyikan', w.bolehLihat('pengaturan') === false);
    const menuTampak = [...d.querySelectorAll('.nav a')].filter(a => a.style.display !== 'none').map(a => a.dataset.view);
    cek('menu Pengaturan hilang dari sidebar', menuTampak.indexOf('pengaturan') < 0, menuTampak.join(','));
    cek('menu lain tetap ada', menuTampak.indexOf('saldo') > -1);
    w.go('bayar'); await tunggu(40);
    const v = d.getElementById('app-view').innerHTML;
    cek('halaman hanya-lihat memasang penjelasan', v.indexOf('hanya bisa melihat halaman ini') > -1, v.slice(0, 200));
    cek('tombol simpan dibuang', v.indexOf('Simpan Rencana') < 0);
    /* penjaga sungguhan: fungsi tetap bisa dipanggil dari console */
    w.bySimpan();
    cek('penjaga menolak walau dipanggil langsung', d.getElementById('app-view').innerHTML.indexOf('Simpan Rencana') < 0);
    dom.window.close();
  }

  /* ================= 5. admin & matriks ================= */
  console.log('\n== Admin modul ==');
  {
    const { dom, panggilan } = domBrankas({});
    await tunggu(400);
    const w = dom.window, d = w.document;
    cek('admin selalu penuh', w.peranSaya() === 'admin' && w.bolehUbah('pengaturan') === true);
    w.go('akses'); await tunggu(60);
    const v = d.getElementById('app-view').innerHTML;
    cek('matriks tergambar', v.indexOf('perm-matrix') > -1);
    cek('kolom admin terkunci', v.indexOf('perm-lock') > -1);
    cek('roster tergambar', v.indexOf('Dina') > -1);
    cek('admin modul tidak diberi pemilih role', v.indexOf('Admin modul — selalu akses penuh') > -1);
    /* simpan matriks: yang dikirim harus SELISIH, bukan salinan penuh */
    const tombol = [...d.querySelectorAll('.perm-btn[data-hal]')];
    const target = tombol.find(b => b.dataset.hal === 'bayar' && b.dataset.role === 'manajemen');
    const semula = target.dataset.v;
    w.permKlik(target);
    cek('klik memutar nilai', target.dataset.v !== semula, semula + ' -> ' + target.dataset.v);
    await w.simpanAkses(); await tunggu(60);
    const kirim = panggilan.filter(p => p.body && p.body.action === 'brankasAkses').pop();
    cek('matriks terkirim', !!kirim);
    const jml = kirim ? Object.keys(kirim.body.peta).reduce((n, r) => n + Object.keys(kirim.body.peta[r]).length, 0) : -1;
    cek('yang dikirim cuma selisih (1 sel)', jml === 1, String(jml));
    dom.window.close();
  }

  /* ================= 6. simpan & gagal simpan ================= */
  console.log('\n== Simpan gagal harus terlihat ==');
  {
    const { dom, panggilan } = domBrankas({});
    await tunggu(400);
    const w = dom.window, d = w.document;
    w.go('pending'); await tunggu(40);
    d.getElementById('pi_src').value = 'Event PT Uji';
    d.getElementById('pi_amt').value = '5.000.000';
    d.getElementById('pi_due').value = '2026-09-01';
    await w.pdSimpan(); await tunggu(120);
    const kirim = panggilan.filter(p => p.body && p.body.action === 'brankasSave').pop();
    cek('piutang terkirim ke server', !!kirim);
    cek('nominal terbaca dari format rupiah',
        kirim && kirim.body.data.piutang[0].amount === 5000000,
        kirim ? String(kirim.body.data.piutang[0].amount) : '-');
    cek('state dikirim UTUH, bukan sepotong',
        kirim && ['rekening','piutang','bayar','investor','setting'].every(k => kirim.body.data[k] !== undefined));
    cek('tabel ikut memperbarui', d.getElementById('app-view').innerHTML.indexOf('Event PT Uji') > -1);
    dom.window.close();
  }

  console.log('\n---------------------------------------');
  console.log('LULUS ' + lulus + '   GAGAL ' + gagal);
  process.exit(gagal ? 1 : 0);
})();
