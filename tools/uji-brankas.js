/* Uji panel Brankas (deploy/finance/brankas/) di jsdom, dengan finance-api,
   kompas-api, dan account-api tiruan.

   Yang paling penting diuji di sini BUKAN tampilannya, tapi angkanya: saldo
   tiap wadah dihitung dari Aktual Masuk di Rekap Penjualan, dan salah sedikit
   saja muncul sebagai uang. */
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
        /* Master vendor Purchasing. Balasannya {vendors:{…}} TANPA kunci `ok`
           — beda dari finance-api & kompas-api, dan itulah yang paling mudah
           salah dibaca: memeriksa .ok akan membuang balasan yang baik-baik
           saja, dan gejalanya cuma kolom penerima yang selalu kosong. */
        if (String(url).indexOf('stock-api-mysql/vendors.php') > -1)
          return { json: async () => (opt.vendorGagal ? { status:'error' }
                                                      : { vendors: opt.vendors || {} }) };
        if (String(url).indexOf('kompas-api') > -1)
          return { json: async () => (opt.kompasGagal ? { ok:false, error:'x' }
                                                          : { ok:true, data: opt.kompas || KOMPAS }) };
        if (String(url).indexOf('account-api') > -1)
          return { json: async () => ({ ok:true, members: opt.roster || [
            { id:'u-wandi', name:'Wandi Pranata', keterangan:'Office', isModuleAdmin:true },
            { id:'u-dina',  name:'Dina',          keterangan:'Finance', isModuleAdmin:false } ] }) };
        // finance-api
        if (body.action === 'brankasGet')
          return { json: async () => ({ ok:true, data: opt.bk || { data:null, akses:{}, peran:{} } }) };
        if (body.action === 'brankasSave')  return { json: async () => (opt.gagalSimpan
          ? { ok:false, error:'server sedang mati' } : { ok:true, data:{ saved:true } }) };
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
    /* TikTok Go ikut UOB, sama dengan seluruh platform online lain. Metode
       baru yang lupa dipetakan memang tidak hilang diam-diam — ia muncul di
       petaBelum() dan dilaporkan di halaman Saldo — tapi selama tujuannya
       sudah diketahui, mengandalkan jaring itu berarti membiarkan uangnya
       tidak masuk saldo bank mana pun sampai ada yang menyetelnya. */
    cek('TikTok Go dipetakan ke UOB', pmap.tiktokgo === 'uob', pmap.tiktokgo);
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
    /* Piutang dibaca dari blob Kompas, jadi kalau Kompas mati halaman ini
       memang tidak punya isi — yang penting ia MENJELASKAN sebabnya, bukan
       memajang layar kosong yang terbaca sebagai modul rusak. */
    cek('halaman piutang menjelaskan Kompas mati',
        d.getElementById('app-view').innerHTML.indexOf('tidak terbaca') > -1,
        d.getElementById('app-view').innerHTML.slice(0, 200));
    w.go('mutasi'); await tunggu(40);
    cek('halaman mutasi tetap bisa dibuka (tidak bergantung Kompas)',
        d.getElementById('app-view').innerHTML.indexOf('Catat Mutasi') > -1);
    dom.window.close();
  }

  /* ================= 3. tidak ada data dummy ================= */
  console.log('\n== Tidak ada satu pun angka contoh ==');
  {
    const { dom } = domBrankas({});
    await tunggu(400);
    const w = dom.window, d = w.document;
    const semua = [];
    ['ringkasan','saldo','pending','bayar','modal','pengaturan','mutasi'].forEach(v => { w.go(v); semua.push(d.getElementById('app-view').innerHTML); });
    const gab = semua.join(' ');
    cek('tidak ada nama investor karangan', !/Bakri|Sari Wahyuni|Nusantara Capital/.test(gab));
    cek('tidak ada rekening karangan', !/BCA Operasional|Mandiri Payroll|4839/.test(gab));
    cek('tidak ada piutang karangan', !/Mitsubishi|Pertamina/.test(gab));
    cek('tidak ada PIN', !/pinCFO|pinCEO|2468|1357/.test(gab));
    cek('piutang kosong menyebutkan dirinya kosong', semua[2].indexOf('Tidak ada bon') > -1, semua[2].slice(0, 200));
    cek('investor kosong menyebutkan dirinya kosong', semua[4].indexOf('Belum ada investor') > -1);
    dom.window.close();
  }

  /* ================= 4. hak akses per role ================= */
  console.log('\n== Kelola akses per role ==');
  {
    /* viewer: seluruh halaman berisian turun jadi Lihat, dan matriks yang
       menyimpan 2 untuk viewer tetap dijepit. */
    const { dom, panggilan } = domBrankas({
      sesi: { modules:['brankas'], adminModules:[], userId:'u-dina', name:'Dina' },
      /* Dulu halaman `bayar` yang dipakai contoh; sejak Planning Pembayaran
         pindah ke panel Kas Kecil, yang diuji di sini `mutasi` — halaman
         berisian yang masih tinggal di panel ini. Yang diuji aturannya, dan
         aturannya tidak berubah. */
      bk: { data:null, akses:{ viewer:{ mutasi:2, pengaturan:0 } }, peran:{ '#u-dina':'viewer' } }
    });
    await tunggu(400);
    const w = dom.window, d = w.document;
    cek('role terbaca viewer', w.peranSaya() === 'viewer', w.peranSaya());
    cek('viewer tidak pernah boleh Ubah walau matriks menyimpan 2', w.bolehUbah('mutasi') === false);
    cek('viewer masih boleh Lihat', w.bolehLihat('mutasi') === true);
    cek('Pengaturan disembunyikan', w.bolehLihat('pengaturan') === false);
    const menuTampak = [...d.querySelectorAll('.nav a')].filter(a => a.style.display !== 'none').map(a => a.dataset.view);
    cek('menu Pengaturan hilang dari sidebar', menuTampak.indexOf('pengaturan') < 0, menuTampak.join(','));
    cek('menu lain tetap ada', menuTampak.indexOf('saldo') > -1);
    w.go('mutasi'); await tunggu(40);
    const v = d.getElementById('app-view').innerHTML;
    cek('halaman hanya-lihat memasang penjelasan', v.indexOf('hanya bisa melihat halaman ini') > -1, v.slice(0, 200));
    /* Blok [data-aks] DIBUANG seluruhnya untuk yang hanya boleh melihat, jadi
       form Catat Mutasi ikut hilang — sementara Riwayat Mutasi tetap tergambar:
       melihat bukan mengubah. */
    cek('form catat mutasi dibuang', !d.getElementById('mu_nom'));
    cek('riwayatnya tetap terbaca', v.indexOf('Riwayat Mutasi') > -1);
    /* Penjaga sungguhan: kotaknya memang dibuang dari layar, tapi fungsinya
       tetap bisa dipanggil dari console. Yang menahan harus di dalam fungsinya,
       bukan cuma di tampilannya. */
    await w.muSimpan(); await tunggu(120);
    cek('viewer tidak bisa menyimpan walau fungsinya dipanggil langsung',
        panggilan.filter(p => p.body && p.body.action === 'brankasSave').length === 0,
        String(panggilan.filter(p => p.body && p.body.action === 'brankasSave').length));
    cek('dan barisnya tidak menempel ke state', (w.eval('BK.data.mutasi') || []).length === 0);
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
    /* Halaman contohnya `mutasi` sejak Planning Pembayaran pindah ke Kas Kecil. */
    const target = tombol.find(b => b.dataset.hal === 'mutasi' && b.dataset.role === 'manajemen');
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
    /* Dipindah dari halaman Piutang (yang kini read-only) ke halaman Mutasi —
       jalur simpannya sama persis. */
    w.go('mutasi'); await tunggu(40);
    d.getElementById('mu_jenis').value = 'pindah';
    d.getElementById('mu_tgl').value = '2026-08-20';
    d.getElementById('mu_nom').value = '5.000.000';
    d.getElementById('mu_dari').value = 'bri';
    d.getElementById('mu_ke').value = 'bca';
    d.getElementById('mu_ket').value = 'Uji pindah';
    await w.muSimpan(); await tunggu(120);
    const kirim = panggilan.filter(p => p.body && p.body.action === 'brankasSave').pop();
    cek('mutasi terkirim ke server', !!kirim);
    cek('nominal terbaca dari format rupiah',
        kirim && kirim.body.data.mutasi[0].nominal === 5000000,
        kirim ? String(kirim.body.data.mutasi[0].nominal) : '-');
    cek('state dikirim UTUH, bukan sepotong',
        kirim && ['rekening','piutang','bayar','investor','mutasi','setting'].every(k => kirim.body.data[k] !== undefined));
    cek('tabel ikut memperbarui', d.getElementById('app-view').innerHTML.indexOf('Uji pindah') > -1);
    dom.window.close();
  }

  /* ================= 7. piutang dibaca dari Cashier ================= */
  console.log('\n== Piutang dari modul Cashier ==');
  {
    const KP2 = JSON.parse(JSON.stringify(KOMPAS));
    KP2.piutang = [
      { id:'b1', date:'2026-08-01', nama:'Pak Budi', tipe:'tamu',  bill:'A-11', nominal:1500000, status:'open' },
      { id:'b2', date:'2026-08-05', nama:'Pak Budi', tipe:'tamu',  bill:'A-22', nominal:500000,  status:'open' },
      { id:'b3', date:'2026-08-06', nama:'Owner',    tipe:'owner', bill:'',     nominal:2000000, status:'open' },
      { id:'b4', date:'2026-08-02', nama:'Sudah',    tipe:'tamu',  bill:'',     nominal:9000000, status:'lunas' }
    ];
    const asli = JSON.stringify(KOMPAS);
    Object.assign(KOMPAS, KP2);
    const { dom } = domBrankas({});
    await tunggu(400);
    const w = dom.window, d = w.document;
    w.go('pending'); await tunggu(60);
    const v = d.getElementById('app-view').innerHTML;
    cek('piutang: read-only, menyebut modul Cashier', v.indexOf('Cashier') > -1, v.slice(0, 300));
    cek('piutang: TIDAK ada form input', v.indexOf('Catat Piutang') < 0);
    cek('piutang: total 4.000.000 (yang lunas tidak ikut)', v.indexOf('Rp4.000.000') > -1, v.slice(0, 900));
    cek('piutang: dikelompokkan per orang — Pak Budi 2 bon', v.indexOf('Pak Budi') > -1);
    /* Rp9.000.000 memang tampil di kartu "Sudah Lunas" — yang tidak boleh
       adalah munculnya di TABEL rincian bon terbuka. Diperiksa di potongan
       tabelnya saja, bukan di seluruh halaman. */
    const rinci = v.slice(v.indexOf('Rincian Bon Belum Dibayar'));
    cek('piutang: yang lunas tidak muncul di rincian', rinci.indexOf('Rp9.000.000') < 0, rinci.slice(0, 300));
    cek('piutang: total lunas tetap dipajang di ringkasan', v.indexOf('Rp9.000.000') > -1);
    cek('piutang: bon tertua 1 Agu 2026', v.indexOf('1 Agu 2026') > -1, v.slice(0, 900));
    Object.assign(KOMPAS, JSON.parse(asli));
    dom.window.close();
  }

  /* ================= 8. mutasi & transfer wallet ================= */
  console.log('\n== Mutasi & transfer wallet ==');
  {
    const { dom, panggilan } = domBrankas({
      bk: { data:{ rekening:[], piutang:[], bayar:[], investor:[], mutasi:[
              { id:'m1', tgl:'2026-08-05', jenis:'pindah', dari:'bri', ke:'bca', nominal:5000000, ket:'top-up' },
              { id:'m2', tgl:'2026-08-06', jenis:'masuk',  dari:'',    ke:'uob', nominal:3000000, ket:'modal' },
              { id:'m3', tgl:'2026-08-07', jenis:'keluar', dari:'cash',ke:'',    nominal:1000000, ket:'biaya' }
            ], setting:{} }, akses:{}, peran:{} }
    });
    await tunggu(400);
    const w = dom.window, d = w.document;
    const s = w.saldoSemua();
    cek('pindah: BRI berkurang 5jt', s.bri.mutKeluar === 5000000, String(s.bri.mutKeluar));
    cek('pindah: BCA bertambah 5jt', s.bca.mutMasuk === 5000000, String(s.bca.mutMasuk));
    cek('masuk: UOB bertambah 3jt', s.uob.mutMasuk === 3000000, String(s.uob.mutMasuk));
    cek('keluar: cash berkurang 1jt', s.cash.mutKeluar === 1000000, String(s.cash.mutKeluar));
    /* Invarian: PINDAH tidak boleh menggeser total kas sepeser pun. */
    /* SEMUA_WADAH() dideklarasikan `const` -> ada di lingkup leksikal, BUKAN
       sebagai properti window. Harus lewat eval; jebakan yang sudah tercatat
       di CLAUDE.md. */
    const wadah = w.eval('SEMUA_WADAH()');
    const tot = wadah.reduce((a, k) => a + s[k].saldo, 0);
    const tanpaPindah = wadah.reduce((a, k) =>
      a + s[k].awal + s[k].masuk + s[k].setorMasuk - s[k].setorKeluar - s[k].keluar - s[k].modal, 0);
    cek('pindah tidak mengubah total kas', tot === tanpaPindah + 3000000 - 1000000,
        tot + ' vs ' + (tanpaPindah + 2000000));

    w.go('mutasi'); await tunggu(60);
    const v = d.getElementById('app-view').innerHTML;
    cek('halaman mutasi tergambar', v.indexOf('Catat Mutasi') > -1);
    cek('riwayat menampilkan tiga baris', (v.match(/btn-danger btn-xs/g) || []).length === 3);
    cek('jenis "masuk" menulis "luar brankas"', v.indexOf('luar brankas') > -1);

    /* pindah ke wallet yang sama harus DITOLAK */
    d.getElementById('mu_jenis').value = 'pindah';
    d.getElementById('mu_nom').value = '1.000.000';
    d.getElementById('mu_dari').value = 'bri';
    d.getElementById('mu_ke').value = 'bri';
    const sblm = panggilan.filter(p => p.body && p.body.action === 'brankasSave').length;
    await w.muSimpan(); await tunggu(60);
    cek('pindah ke wallet yang sama ditolak',
        panggilan.filter(p => p.body && p.body.action === 'brankasSave').length === sblm);
    cek('alasannya disebut', panggilan.some(p => p.alert && p.alert.indexOf('tidak boleh sama') > -1));
    dom.window.close();
  }

  /* ================= 9. pengembalian modal keluar dari wallet ================= */
  console.log('\n== Pengembalian modal berwadah ==');
  {
    const { dom, panggilan } = domBrankas({
      bk: { data:{ rekening:[], piutang:[], bayar:[], investor:[
              { id:'i1', name:'H. Bakri', capital:100000000, ownership:50, targetDate:'',
                returns:[ { date:'2026-08-10', amount:20000000, dari:'bri' },
                          { date:'2026-08-11', amount:5000000 } ] }   // tanpa wadah
            ], mutasi:[], setting:{} }, akses:{}, peran:{} }
    });
    await tunggu(400);
    const w = dom.window, d = w.document;
    const s = w.saldoSemua();
    cek('pengembalian berwadah mengurangi BRI', s.bri.modal === 20000000, String(s.bri.modal));
    cek('pengembalian TANPA wadah tidak mengurangi siapa pun',
        w.eval('SEMUA_WADAH()').reduce((a, k) => a + s[k].modal, 0) === 20000000);
    cek('yang menggantung dilaporkan', w.modalTanpaWadah().length === 1, String(w.modalTanpaWadah().length));

    w.go('modal'); await tunggu(60);
    const v = d.getElementById('app-view').innerHTML;
    cek('peringatan gantung tampil', v.indexOf('belum menyebut') > -1, v.slice(0, 400));
    cek('menyebut nominal yang menggantung', v.indexOf('Rp5.000.000') > -1);
    cek('form punya pemilih wallet', v.indexOf('Dibayar Dari') > -1);
    cek('tabel menandai baris tanpa wadah', v.indexOf('belum disebut') > -1);

    /* mencatat pengembalian baru harus membawa `dari` */
    d.getElementById('rv_d_i1').value = '2026-08-20';
    d.getElementById('rv_a_i1').value = '7.000.000';
    d.getElementById('rv_w_i1').value = 'bca';
    await w.rvTambah('i1'); await tunggu(80);
    const kirim = panggilan.filter(p => p.body && p.body.action === 'brankasSave').pop();
    const baru = kirim && kirim.body.data.investor[0].returns.slice(-1)[0];
    cek('pengembalian baru menyimpan wallet asal', baru && baru.dari === 'bca', JSON.stringify(baru));
    cek('nominalnya terbaca dari format rupiah', baru && baru.amount === 7000000);
    dom.window.close();
  }

  /* ================= 9b. EDIT mutasi & pengembalian modal (6 Oktober 2026) =================
     Yang dijaga: suntingan MENIMPA barisnya sendiri (jumlah baris tetap),
     id & pencatat aslinya tidak hilang, dan pengembalian lama yang belum
     punya wallet dibuka dengan kotak wallet KOSONG — tidak ditebak. */
  console.log('\n== Edit mutasi & pengembalian modal ==');
  {
    const { dom, panggilan } = domBrankas({
      bk: { data:{ rekening:[], piutang:[], bayar:[], investor:[
              { id:'i1', name:'H. Bakri', capital:100000000, ownership:50, targetDate:'',
                returns:[ { date:'2026-08-10', amount:20000000, dari:'bri', by:'Cindy' },
                          { date:'2026-08-11', amount:5000000 } ] }
            ], mutasi:[
              { id:'m1', tgl:'2026-08-09', jenis:'pindah', dari:'bca', ke:'uob', nominal:1000000, ket:'awal', by:'Cindy' }
            ], setting:{} }, akses:{}, peran:{} }
    });
    await tunggu(400);
    const w = dom.window, d = w.document;
    w.go('mutasi'); await tunggu(60);
    const tbl = d.getElementById('app-view').innerHTML;
    cek('baris mutasi manual punya tombol Edit', tbl.indexOf("muEdit('m1')") > -1);
    w.muEdit('m1'); await tunggu(40);
    cek('formulir terisi nominal barisnya', d.getElementById('mu_nom').value === '1.000.000', d.getElementById('mu_nom').value);
    cek('formulir terisi wallet asal & tujuan', d.getElementById('mu_dari').value === 'bca' && d.getElementById('mu_ke').value === 'uob');
    cek('judul berubah jadi Edit Mutasi', d.getElementById('app-view').innerHTML.indexOf('Edit Mutasi') > -1);
    d.getElementById('mu_nom').value = '2.500.000';
    d.getElementById('mu_ket').value = 'dibetulkan';
    await w.muSimpan(); await tunggu(120);
    let kirim = panggilan.filter(p => p.body && p.body.action === 'brankasSave').pop();
    const mu = kirim && kirim.body.data.mutasi;
    cek('suntingan TIDAK menambah baris', mu && mu.length === 1, mu ? String(mu.length) : '-');
    cek('nominal & keterangan baru tersimpan', mu && mu[0].nominal === 2500000 && mu[0].ket === 'dibetulkan', JSON.stringify(mu && mu[0]));
    cek('id & pencatat aslinya tetap', mu && mu[0].id === 'm1' && mu[0].by === 'Cindy');
    cek('penyuntingnya dicatat', mu && 'editAt' in mu[0]);
    cek('sesudah simpan kembali ke Catat Mutasi', d.getElementById('app-view').innerHTML.indexOf('Edit Mutasi') < 0);

    w.go('modal'); await tunggu(60);
    let v = d.getElementById('app-view').innerHTML;
    cek('baris pengembalian punya tombol Edit', v.indexOf("rvEdit('i1',") > -1);
    cek('peringatan gantung menyuruh Edit, bukan hapus-catat-ulang', v.indexOf('Tekan <b>Edit</b>') > -1);
    /* urutan terbaru dulu: ix 0 = 11 Agu (tanpa wallet), ix 1 = 10 Agu */
    w.rvEdit('i1', 0); await tunggu(40);
    cek('catatan tanpa wallet dibuka dengan kotak wallet KOSONG', d.getElementById('rv_w_i1').value === '', d.getElementById('rv_w_i1').value);
    cek('nominal terisi', d.getElementById('rv_a_i1').value === '5.000.000');
    const sebelum = panggilan.filter(p => p.body && p.body.action === 'brankasSave').length;
    w.confirm = () => true; w.alert = () => {};
    await w.rvTambah('i1'); await tunggu(80);
    cek('wallet kosong DITOLAK, tidak terkirim',
        panggilan.filter(p => p.body && p.body.action === 'brankasSave').length === sebelum);
    d.getElementById('rv_w_i1').value = 'mandiri';
    d.getElementById('rv_a_i1').value = '6.000.000';
    await w.rvTambah('i1'); await tunggu(80);
    kirim = panggilan.filter(p => p.body && p.body.action === 'brankasSave').pop();
    const rs = kirim && kirim.body.data.investor[0].returns;
    cek('suntingan pengembalian TIDAK menambah baris', rs && rs.length === 2, rs ? String(rs.length) : '-');
    const ub = rs && rs.find(r => r.date === '2026-08-11');
    cek('pengembalian tersunting: wallet & nominal baru', ub && ub.dari === 'mandiri' && ub.amount === 6000000, JSON.stringify(ub));
    cek('catatan lain tidak tersentuh', rs && rs.find(r => r.date === '2026-08-10').amount === 20000000);
    cek('yang menggantung habis', w.modalTanpaWadah().length === 0);
    dom.window.close();
  }

  /* ================= 10. setoran cash muncul di Riwayat Mutasi ================= */
  console.log('\n== Setoran cash ikut tercatat sebagai mutasi ==');
  {
    /* KOMPAS punya dua setoran: st1 ke BRI (dikenali), st2 "brankas kantor"
       (tidak dikenali). Keduanya harus muncul di riwayat, dan yang kedua
       harus ditandai. */
    const { dom, panggilan } = domBrankas({
      bk: { data:{ rekening:[], piutang:[], bayar:[], investor:[], mutasi:[
              { id:'m1', tgl:'2026-08-09', jenis:'pindah', dari:'bca', ke:'uob', nominal:1000000, ket:'manual' }
            ], setting:{} }, akses:{}, peran:{} }
    });
    await tunggu(400);
    const w = dom.window, d = w.document;
    w.go('mutasi'); await tunggu(60);
    const v = d.getElementById('app-view').innerHTML;

    cek('setoran ikut di riwayat', v.indexOf('Setoran cash') > -1, v.slice(0, 400));
    cek('ditandai berasal dari Rekap Penjualan', v.indexOf('Rekap Penjualan</span>') > -1);
    cek('mutasi manual tetap ada', v.indexOf('manual') > -1);
    cek('tiga baris di riwayat (1 manual + 2 setoran)',
        (v.match(/<tr><td>\d+ Agu 2026<\/td>/g) || []).length === 3,
        String((v.match(/<tr><td>\d+ Agu 2026<\/td>/g) || []).length));

    /* Baris otomatis TIDAK boleh punya tombol hapus: yang memegangnya Rekap
       Penjualan, dan menghapusnya di sini cuma membuang baris yang muncul
       lagi begitu halaman dimuat ulang. */
    cek('cuma baris manual yang punya tombol hapus',
        (v.match(/btn-danger btn-xs/g) || []).length === 1,
        String((v.match(/btn-danger btn-xs/g) || []).length));
    cek('baris otomatis menjelaskan kenapa tak bisa dihapus', v.indexOf('dari Rekap Penjualan') > -1);

    cek('total setoran disebutkan', v.indexOf('Rp18.000.000') > -1, v.slice(0, 700));
    cek('setoran tujuan tak dikenal diperingatkan', v.indexOf('tidak dikenali') > -1);
    cek('tujuan mentahnya ditulis apa adanya', v.indexOf('brankas kantor') > -1);
    cek('menyebut berapa hari yang dicakup', v.indexOf('mencakup 1 hari') > -1);

    /* Jenis mutasi manual TIDAK boleh memakai kata "Setor": halaman ini sudah
       memuat baris "Setoran cash" dari Rekap Penjualan, dan dua hal yang
       berlawanan arah (omset keluar dari brankas vs uang masuk dari luar)
       yang terbaca sama di satu layar akan tertukar cepat atau lambat.
       Permintaan user 4 September 2026. */
    cek('jenis mutasi manual tidak lagi bernama "Setor"',
        v.indexOf('Setor / uang masuk') < 0, v.slice(v.indexOf('mu_jenis'), v.indexOf('mu_jenis') + 300));
    cek('...melainkan menyebut uang masuk dari LUAR',
        v.indexOf('Uang masuk dari luar') > -1, v.slice(v.indexOf('mu_jenis'), v.indexOf('mu_jenis') + 300));
    cek('dan gunanya dijelaskan: cash di luar omset harian',
        v.indexOf('di luar omset harian') > -1 && v.indexOf('TIDAK lewat POS') > -1,
        v.slice(v.indexOf('Catat Mutasi'), v.indexOf('Catat Mutasi') + 600));
    /* Pemasukan yang sudah lewat POS dicatat lagi di sini = uang dihitung dua
       kali. Peringatannya harus ada di layarnya, bukan cuma di komentar. */
    cek('...berikut peringatan jangan mencatat omset dua kali',
        /dua kali/.test(v.slice(v.indexOf('Catat Mutasi'), v.indexOf('Catat Mutasi') + 700)));
    cek('setoran cash TETAP jadi baris riwayat (dipulihkan 4 Sep 2026)',
        v.indexOf('<td>Setoran cash') > -1, v.slice(0, 400));

    /* Saldo dan riwayat harus bercerita hal yang sama: yang menjumlahkan
       daftar tidak boleh mendapat angka lain daripada kartu di atasnya. */
    const s2 = w.saldoSemua();
    cek('setoran BRI di riwayat = setorMasuk BRI di saldo', s2.bri.setorMasuk === 10000000, String(s2.bri.setorMasuk));
    dom.window.close();
  }

  /* ================= 11. Kompas mati: daftar tidak lengkap, dan bilang ======= */
  console.log('\n== Setoran tak terbaca ==');
  {
    const { dom } = domBrankas({ kompasGagal:true });
    await tunggu(400);
    const w = dom.window, d = w.document;
    w.go('mutasi'); await tunggu(60);
    const v = d.getElementById('app-view').innerHTML;
    cek('halaman tetap jalan', v.indexOf('Catat Mutasi') > -1);
    cek('mengatakan daftarnya belum lengkap', v.indexOf('belum lengkap') > -1, v.slice(0, 400));
    dom.window.close();
  }

   /* ================= 19. TikTok Go ================= */
  console.log('\n== TikTok Go ==');
  {
    /* Blob kompas SENDIRI, bukan menambah ke KOMPAS bersama: angka harapan di
       sana sudah ditulis rinci di komentar dan dipakai belasan asersi lain,
       jadi menambah satu metode di situ akan menggeser semuanya. */
    const { dom } = domBrankas({ kompas: { reports: {
      '2026-08-01': { pay: { tiktokgo:{actual:5000000}, gofood:{actual:3000000}, cash:{actual:1000000} },
                      mdr: { tiktokgo:250000, gofood:150000 } }
    }, rekap_setoran: [] } });
    await tunggu(400);
    const w = dom.window, d = w.document;
    const s = w.saldoSemua();
    /* TikTok memotong komisi persis seperti ojol lain, jadi yang masuk
       rekening BUKAN nominal pesanan. Kalau `mdr` terlewat di RK_GRUP, saldo
       UOB akan selalu lebih besar daripada yang benar-benar diterima — dan
       selisihnya muncul sebagai uang, bukan sebagai galat. */
    cek('TikTok Go dikurangi MDR-nya', s.uob.masuk === 7600000,
        s.uob.masuk + ' (harusnya 4.750.000 + 2.850.000)');
    cek('cash tidak ikut terpengaruh', s.cash.masuk === 1000000, String(s.cash.masuk));
    w.go('saldo'); await tunggu(60);
    const v = d.getElementById('app-view').innerHTML;
    cek('TikTok Go tergambar di halaman Saldo', v.indexOf('TikTok Go') > -1);
    cek('nilainya sesudah MDR yang ditulis', v.indexOf('Rp4.750.000') > -1,
        v.slice(Math.max(0, v.indexOf('TikTok Go') - 40), v.indexOf('TikTok Go') + 260));
    /* Jaring pengamannya: metode yang tidak punya tujuan DILAPORKAN. Kalau
       TikTok Go terlewat di MAP_BAWAAN, di sinilah ia muncul. */
    cek('tidak ada metode yang menggantung tanpa rekening', w.petaBelum().length === 0,
        w.petaBelum().map(g => g.n).join(','));
    dom.window.close();
  }


  /* ================= 20. blob PHP menyimpan semua kunci ================= */
  /* Seluruh uji di atas memakai server TIRUAN, jadi tidak satu pun dari
     mereka bisa melihat apa yang benar-benar ditulis PHP ke bk_state.
     brankas_simpan() menyaring blob lewat daftar kunci tertutup, dan kunci
     yang terlewat di sana hilang TANPA satu pun galat: server tetap membalas
     ok, layar menggambar ulang dari memori sehingga barisnya kelihatan sudah
     masuk, dan baru lenyap saat halaman dimuat ulang. Sudah kejadian
     2 September 2026 — `mutasi` tidak ada di daftar itu, jadi seluruh Mutasi
     & Transfer Wallet hilang tiap refresh sementara 190 pemeriksaan di atas
     tetap hijau.

     Karena itu KEDUA daftar DIBACA dari sumbernya lalu dibandingkan, bukan
     ditulis ulang di sini: daftar yang disalin tangan akan ikut basi bersama
     yang disalinnya, dan uji yang basi persis itulah yang membuat bug ini
     lolos pertama kali. */
  console.log('\n== Kunci blob: frontend <-> PHP ==');
  {
    const daftar = (teks, re, nama) => {
      const m = teks.match(re);
      if (!m) { cek(nama + ' terbaca dari sumbernya', false, 'pola tidak ketemu'); return null; }
      return m[1].split(',').map(x => x.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
    };
    /* Baris di muatSemua() yang memastikan tiap kunci berbentuk array — itulah
       daftar kunci larik yang benar-benar dipakai halaman ini. */
    const fe = daftar(HTML, /\[([^\]]*)\]\.forEach\(k => \{ if \(!Array\.isArray\(BK\.data\[k\]\)\)/,
                      'daftar kunci frontend');
    const PHP = fs.readFileSync(path.join(ROOT, 'finance-mysql', 'lib_finance_mysql.php'), 'utf8');
    const be = daftar(PHP, /foreach \(array\(([^)]*)\) as \$k\)\s*\r?\n\s*\$bersih\[\$k\]/,
                      'daftar kunci brankas_simpan()');
    if (fe && be) {
      const hilang = fe.filter(k => be.indexOf(k) < 0);
      cek('semua kunci frontend ikut ditulis brankas_simpan()', hilang.length === 0,
          'dibuang diam-diam oleh PHP: ' + hilang.join(', '));
      cek('mutasi ada di daftar PHP', be.indexOf('mutasi') >= 0, be.join(','));
      /* Bentuk kosong brankas_baca() harus memuat kunci yang sama. Frontend
         memang menambalnya sendiri, tapi dua bentuk bawaan yang berbeda
         berarti salah satunya pasti tertinggal saat ada kunci baru. */
      const kosong = (PHP.match(/\$data = array\('rekening'[\s\S]*?\);/) || [''])[0];
      const kurang = fe.filter(k => kosong.indexOf("'" + k + "'") < 0);
      cek('bentuk kosong brankas_baca() lengkap', kurang.length === 0, 'kurang: ' + kurang.join(', '));
    }
  }

 console.log('\n---------------------------------------');
  console.log('LULUS ' + lulus + '   GAGAL ' + gagal);
  process.exit(gagal ? 1 : 0);
})();
