/* Uji Master Vendor di modul BD OS (deploy/bd/index.html).

   Vendor adalah data yang dipakai LINTAS MODUL: panel Brankas di Finance
   membacanya untuk tahu ke rekening mana sebuah pembayaran ditransfer. Salah
   satu huruf di nama penerima membuat transfer ditolak bank, dan salah nomor
   rekening mengirim uang ke orang lain — jadi yang diuji di sini bukan
   tampilannya, tapi apa yang tersimpan. */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const { JSDOM } = require(path.join(ROOT, 'node_modules', 'jsdom'));

/* Modul BD dibungkus IIFE, jadi DB/vVendor/vendorAktif TIDAK ada di window —
   jebakan yang sudah tercatat di CLAUDE.md. Jembatan uji disuntikkan DI DALAM
   pembungkusnya, tepat sebelum penutup, supaya ia melihat lingkup yang sama.
   Yang disuntik cuma di salinan memori; berkas repo tidak disentuh. */
const ASLI = fs.readFileSync(path.join(ROOT, 'deploy', 'bd', 'index.html'), 'utf8');
const JEMBATAN = [
  "",
  "window.__uji={get DB(){return DB;},set DB(v){DB=v;},",
  "vVendor:vVendor,vendorAktif:vendorAktif,vendorSemua:vendorSemua,norekBersih:norekBersih,",
  "setArsipLihat:function(v){vendorLihatArsip=v;},",
  "HALAMAN_ALAMAT:HALAMAN_ALAMAT,SUB:SUB};",
  ""
].join(String.fromCharCode(10));
const iTutup = ASLI.lastIndexOf("})();");
if (iTutup < 0) throw new Error("penutup IIFE modul BD tak ketemu");
const HTML = ASLI.slice(0, iTutup) + JEMBATAN + ASLI.slice(iTutup);

let lulus = 0, gagal = 0;
const cek = (nama, syarat, ket) => {
  if (syarat) { lulus++; console.log('  OK   ' + nama); }
  else { gagal++; console.log('  GAGAL ' + nama + (ket ? '  -> ' + ket : '')); }
};
const tunggu = ms => new Promise(r => setTimeout(r, ms));

/* Boot modul BD asinkron: DB masih null sampai getAll pulang dan normalize
   selesai. Menunggu jumlah milidetik tertentu itu tebakan — yang di sini
   menunggu KEADAANNYA, jadi mesin lambat tidak membuat uji gagal palsu. */
async function siapDB(w) {
  for (let i = 0; i < 100; i++) {
    if (w.__uji && w.__uji.DB) return w.__uji.DB;
    await tunggu(50);
  }
  throw new Error("DB modul BD tidak pernah siap");
}
function buatDom(state) {
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
         diurai — sengaja, supaya balasan HTML (404 / error PHP) menghasilkan
         pesan yang bisa ditindaklanjuti. Stub yang cuma punya json() membuat
         boot menggantung tanpa satu pun galat: DB tetap null selamanya. */
      const jawab = obj => ({ ok:true, status:200,
        text: async () => JSON.stringify(obj),
        json: async () => obj });
      w.fetch = async (url, init) => {
        const body = init && init.body ? JSON.parse(init.body) : {};
        const act = body.action || (String(url).match(/action=([a-zA-Z]+)/)||[])[1] || '';
        pesan.push({ url: String(url), action: act, data: body.data });
        if (String(url).indexOf('account-api') > -1) return jawab({ ok:true, members: [] });
        if (!act || act === 'getAll') return jawab({ ok:true, data: state || {} });
        return jawab({ ok:true, data: { saved:true } });
      };
    }
  });
  return { dom, pesan };
}

(async () => {
  /* ================= 1. halaman kosong ================= */
  console.log('\n== Belum ada vendor ==');
  {
    const { dom } = buatDom({});
    await siapDB(dom.window);
    const w = dom.window;
    w.__uji.DB.vendors = [];
    const h = w.__uji.vVendor();
    cek('halaman tergambar', h.indexOf('Vendor') > -1);
    cek('menjelaskan cara menambah', h.indexOf('+ Vendor') > -1 || h.indexOf('Belum ada vendor') > -1, h.slice(0, 300));
    cek('menyebut dipakai Brankas', h.indexOf('Brankas') > -1);
    cek('tidak ada peringatan rekening kosong', h.indexOf('belum punya nomor rekening') < 0);
    dom.window.close();
  }

  /* ================= 2. daftar terisi ================= */
  console.log('\n== Daftar vendor ==');
  {
    const { dom } = buatDom({});
    await siapDB(dom.window);
    const w = dom.window;
    w.__uji.DB.vendors = [
      {id:'v1',nama:'Toffin',penerima:'CV. Toffin Riau Jaya',bank:'BCA',norek:'034-2928-828',kategori:'Bahan baku',catatan:'',arsip:false},
      {id:'v2',nama:'Djarum',penerima:'PT. Sumber Cipta Multiniaga',bank:'BCA',norek:'034-180-5588',kategori:'Rokok',catatan:'',arsip:false},
      {id:'v3',nama:'Ecocare',penerima:'PT. Ecocare Indo Pasifik',bank:'BCA',norek:'',kategori:'Jasa & Langganan',catatan:'',arsip:false},
      {id:'v4',nama:'Vendor Lama',penerima:'',bank:'',norek:'',kategori:'',catatan:'',arsip:true}
    ];
    const h = w.__uji.vVendor();
    cek('vendor aktif dihitung 3 (arsip tidak ikut)', /Vendor aktif[\s\S]{0,200}?>3</.test(h), h.slice(0, 900));
    cek('nama pendek tampil', h.indexOf('Toffin') > -1);
    cek('nama penerima tampil terpisah', h.indexOf('CV. Toffin Riau Jaya') > -1);
    cek('nomor rekening apa adanya (bertanda hubung)', h.indexOf('034-2928-828') > -1);
    cek('yang diarsipkan tidak tampil', h.indexOf('Vendor Lama') < 0);
    /* Vendor tanpa rekening tetap boleh ada, TAPI harus diperingatkan: ia bisa
       dipilih saat bayar, dan yang mentransfer akan menemukan kolom kosong. */
    cek('memperingatkan 1 vendor tanpa rekening', h.indexOf('1 vendor belum punya nomor rekening') > -1, h.slice(0, 900));
    cek('barisnya ditandai "belum diisi"', h.indexOf('belum diisi') > -1);
    /* arsip ditampilkan hanya kalau diminta */
    w.__uji.setArsipLihat(true);
    cek('arsip muncul saat dicentang', w.__uji.vVendor().indexOf('Vendor Lama') > -1);
    dom.window.close();
  }

  /* ================= 3. simpan ================= */
  console.log('\n== Menyimpan vendor ==');
  {
    const { dom, pesan } = buatDom({});
    await siapDB(dom.window);
    const w = dom.window, d = w.document;
    w.__uji.DB.vendors = [];
    w.APP.vendorModal();
    await tunggu(60);
    cek('modal terbuka', !!d.getElementById('v_nama'));
    cek('ada kolom penerima terpisah', !!d.getElementById('v_penerima'));
    cek('ada kolom bank & nomor rekening', !!d.getElementById('v_bank') && !!d.getElementById('v_norek'));

    /* nama wajib */
    w.APP.vendorSimpan(null);
    cek('nama kosong ditolak', w.__uji.DB.vendors.length === 0, String(w.__uji.DB.vendors.length));

    d.getElementById('v_nama').value = 'Toffin';
    d.getElementById('v_penerima').value = 'CV. Toffin Riau Jaya';
    d.getElementById('v_bank').value = 'BCA';
    d.getElementById('v_norek').value = '034-2928-828';
    d.getElementById('v_kat').value = 'Bahan baku';
    w.APP.vendorSimpan(null);
    await tunggu(60);
    const v = JSON.stringify(w.__uji.DB.vendors[0]);
    const o = JSON.parse(v);
    cek('tersimpan satu baris', w.__uji.DB.vendors.length === 1);
    cek('nama pendek benar', o.nama === 'Toffin', v);
    cek('penerima disimpan terpisah', o.penerima === 'CV. Toffin Riau Jaya');
    cek('nomor rekening apa adanya', o.norek === '034-2928-828');
    cek('punya id', !!o.id);
    cek('lahir sebagai tidak-arsip', o.arsip === false);
    dom.window.close();
  }

  /* ================= 4. nama kembar ditolak ================= */
  console.log('\n== Nama kembar ==');
  {
    const { dom, pesan } = buatDom({});
    await siapDB(dom.window);
    const w = dom.window, d = w.document;
    w.__uji.DB.vendors = [{id:'v1',nama:'Toffin',penerima:'',bank:'',norek:'',kategori:'',catatan:'',arsip:false}];
    w.APP.vendorModal(); await tunggu(60);
    d.getElementById('v_nama').value = 'toffin';        // beda huruf besar-kecil
    w.APP.vendorSimpan(null);
    /* Dua vendor bernama sama membuat pemilih di Brankas menampilkan dua baris
       identik, dan yang memilih tidak punya cara tahu mana rekeningnya benar. */
    cek('nama kembar ditolak (tak peduli huruf besar-kecil)', w.__uji.DB.vendors.length === 1,
        String(w.__uji.DB.vendors.length));
    dom.window.close();
  }

  /* ================= 5. rekening kembar: diperingatkan, tidak ditolak ===== */
  console.log('\n== Nomor rekening kembar ==');
  {
    const { dom } = buatDom({});
    await siapDB(dom.window);
    const w = dom.window, d = w.document;
    w.__uji.DB.vendors = [{id:'v1',nama:'Esb',penerima:'PT. Esensi Solusi Buana',bank:'BCA',norek:'8015193456',kategori:'',catatan:'',arsip:false}];
    w.APP.vendorModal(); await tunggu(60);
    d.getElementById('v_nama').value = 'Esb Admin';
    d.getElementById('v_norek').value = '801-519-3456';   // sama, beda pemisah
    w.APP.vendorSimpan(null);
    await tunggu(60);
    /* Satu perusahaan memang bisa punya beberapa nama dagang dengan satu
       rekening — menolaknya akan memaksa orang mengarang nomor. */
    cek('rekening kembar TETAP tersimpan', w.__uji.DB.vendors.length === 2,
        String(w.__uji.DB.vendors.length));
    cek('nomor disimpan apa adanya', w.__uji.DB.vendors[1].norek === '801-519-3456');
    cek('pembandingnya mengabaikan tanda hubung',
        w.__uji.norekBersih('801-519-3456') === w.__uji.norekBersih('8015193456'));
    dom.window.close();
  }

  /* ================= 6. arsip, bukan hapus ================= */
  console.log('\n== Arsip ==');
  {
    const { dom } = buatDom({});
    await siapDB(dom.window);
    const w = dom.window;
    w.__uji.DB.vendors = [{id:'v1',nama:'Toffin',penerima:'',bank:'',norek:'1',kategori:'',catatan:'',arsip:false}];
    w.APP.vendorArsip('v1');
    /* Vendor yang DIHAPUS membuat pembayaran lama di Brankas kehilangan nama
       penerimanya — riwayat yang tidak bisa dibaca lagi lebih buruk daripada
       satu baris tambahan di daftar. */
    cek('barisnya tidak hilang', w.__uji.DB.vendors.length === 1);
    cek('ditandai arsip', w.__uji.DB.vendors[0].arsip === true);
    cek('tidak lagi ikut vendorAktif()', w.__uji.vendorAktif().length === 0);
    w.APP.vendorArsip('v1');
    cek('bisa diaktifkan lagi', w.__uji.DB.vendors[0].arsip === false);
    dom.window.close();
  }

  /* ================= 7. normalisasi data lama ================= */
  console.log('\n== Data lama / cacat ==');
  {
    const { dom } = buatDom({
      vendors: [
        { nama: '  Toffin  ', penerima: ' CV. Toffin ', bank: 'BCA', norek: ' 034 ' },  // tanpa id, berspasi
        { nama: '' },                                                                    // tanpa nama
        null
      ]
    });
    await siapDB(dom.window);
    const w = dom.window;
    cek('baris tanpa nama dibuang', w.__uji.DB.vendors.length === 1, String(w.__uji.DB.vendors.length));
    cek('id dibuatkan', !!w.__uji.DB.vendors[0].id);
    cek('spasi di ujung dibuang', w.__uji.DB.vendors[0].nama === 'Toffin', w.__uji.DB.vendors[0].nama);
    cek('penerima ikut dirapikan', w.__uji.DB.vendors[0].penerima === 'CV. Toffin');
    cek('arsip diisi false, bukan undefined', w.__uji.DB.vendors[0].arsip === false);
    dom.window.close();
  }

  /* ================= 8. menu & rute ================= */
  console.log('\n== Navigasi ==');
  {
    const { dom } = buatDom({});
    await siapDB(dom.window);
    const w = dom.window, d = w.document;
    cek('menu Vendor ada di sidebar',
        [...d.querySelectorAll('.nav a, .nav button, .nl')].some(e => (e.textContent || '').indexOf('Vendor') > -1),
        [...d.querySelectorAll('.nl')].map(e => e.textContent.trim()).join(','));
    cek('vendor terdaftar sebagai alamat', w.__uji.HALAMAN_ALAMAT.indexOf('vendor') > -1);
    cek('vendor punya judul & keterangan', !!(w.__uji.SUB.vendor && w.__uji.SUB.vendor[2]));
    dom.window.close();
  }

  console.log('\n---------------------------------------');
  console.log('LULUS ' + lulus + '   GAGAL ' + gagal);
  process.exit(gagal ? 1 : 0);
})();
