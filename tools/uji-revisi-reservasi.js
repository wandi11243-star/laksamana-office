/* Uji TUJUH revisi modul Reservasi — 19 September 2026, permintaan user:

     1. Audit Log bisa dicari, dan jejak reservasi yang dibatalkan/dihapus
        tetap bisa ditemukan di sana.
     2. Di daftar, setelah kolom DP, ditulis uangnya masuk ke rekening mana.
     3. Rekening bawaannya QRIS, tetap bisa diganti.
     4. Tiap reservasi punya riwayat aktivitasnya sendiri: siapa menginput,
        siapa mengubah status, siapa meminta kwitansi, siapa menghapus.
     5 & 6. Status "Semua" tidak memuat yang dibatalkan — termasuk saat
        halamannya baru pertama dibuka.
     7. Edit cepat, tanpa melewati formulir input yang panjang.

   KENAPA UJI SENDIRI. `tools/smoke-modul.js` melaporkan modul ini sebagai
   "hanya boot yang diuji": routernya tidak terbaca dari luar, jadi tidak
   satu pun halamannya pernah dirender di sana — apalagi jalur simpannya.

   YANG PALING PERLU DIJAGA, dan bukan tampilannya:

     - Edit cepat TIDAK BOLEH jadi jalan pintas yang melewati cek bentrok
       meja. Dua tamu di satu meja tidak menimbulkan galat apa pun; ia baru
       ketahuan waktu keduanya berdiri di depan meja itu.
     - Jejak aktivitas WAJIB bertahan saat reservasinya disunting lewat
       formulir lengkap. `rec` di saveReservation() dibangun ulang dari
       daftar field eksplisit — yang tidak disebut di sana hilang tanpa satu
       pun galat, dan panelnya cuma berhenti menyebut siapa pun.
     - Jejak yang GAGAL tersimpan tidak boleh tertinggal di barisnya.
       Catatan yang mengatakan sebuah reservasi dibatalkan padahal
       penyimpanannya ditolak menyesatkan orang yang memeriksanya.
     - Rekening bawaan tidak boleh diambil dari urutan daftar. Daftar itu
       disunting orang lewat Master Data dan pernah bertambah sendiri lewat
       migrasi, jadi "yang pertama" bisa berubah tanpa ada yang
       memutuskannya. Fixture di sini sengaja menaruh QRIS di posisi
       KETIGA. */
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

/* Denah venue dimuat lewat <script src>; jsdom tidak mengambil skrip
   eksternal, jadi isinya disisipkan inline menggantikan tag src-nya — yang
   dijalankan tetap berkas aslinya, bukan tiruan yang bisa menyimpang dari
   koordinat sebenarnya. Modul ini SENGAJA berhenti keras kalau denahnya
   tidak termuat. */
const ASSET = fs.readFileSync(path.join(ROOT, 'deploy', 'assets', 'venue-layouts.js'), 'utf8');
const HTML = fs.readFileSync(path.join(ROOT, 'deploy', 'reservasi', 'index.html'), 'utf8');
const HTML_UJI = HTML.replace(
  '<script src="../assets/venue-layouts.js"><' + '/script>',
  () => '<script>' + ASSET + '<' + '/script>');
if (HTML_UJI === HTML) { console.error('tag venue-layouts.js tidak ketemu di sumber'); process.exit(2); }

let lulus = 0, gagal = 0;
const cek = (nama, syarat, ket) => {
  if (syarat) { lulus++; console.log('  OK   ' + nama); }
  else { gagal++; console.log('  GAGAL ' + nama + (ket ? '  -> ' + ket : '')); }
};
/* Blok yang bisa MELEMPAR dibungkus: sebuah mutasi yang membuat penggambar
   jatuh akan menghentikan node sebelum ringkasan tercetak, dan hasilnya
   terbaca "uji tidak selesai" — bukan "tertangkap". */
const aman = (nama, fn) => { try { fn(); } catch (e) { cek(nama + ' (tidak melempar)', false, e.message); } };
const amanTunggu = async (nama, fn) => { try { await fn(); } catch (e) { cek(nama + ' (tidak melempar)', false, e.message); } };
const tunggu = ms => new Promise(r => setTimeout(r, ms));
const pad = n => String(n).padStart(2, '0');
const ymd = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());

/* Tanggalnya RELATIF terhadap hari ini, bukan dipatok. Fixture bertanggal
   mati membusuk sendiri: `uji-vip-radar.js` sudah merah enam hari setelah
   ditulis karena Agenda Radar hanya menggambar minggu berjalan, dan uji yang
   berubah merah tanpa ada yang mengubah kode melatih orang mengabaikan
   warna merahnya. */
const HARI_INI = ymd(new Date());
const BESOK = ymd(new Date(Date.now() + 86400000));

/* Angkanya dipilih supaya tiap kesalahan memberi hasil yang BERBEDA:
   DP R1 = 300.000 + 200.000 lewat DUA rekening, jadi kolom Rekening yang
   cuma membaca cicilan pertama kehilangan "Transfer UOB" dan kolom DP yang
   membaca cicilan terakhir berbunyi 200.000, bukan 500.000. */
function fixture() {
  const now = Date.now();
  const dasar = (o) => Object.assign({
    phone: '081200000000', pax: 4, table: '', sharing: false, category: 'Tamu Umum',
    foodReq: '', drinkReq: '', dpStatus: 'Belum', dpMethod: '', dpAmount: 0,
    dps: [], source: 'WhatsApp', picType: 'Host/Captain', picName: 'Penguji',
    member: false, memberNo: '', notes: '', vip: false, status: 'Confirmed',
    createdBy: 'Rina Host', createdAt: now - 7200000, updatedAt: now - 7200000,
    arrivals: [], checkinAt: null, leftAt: 0, followups: [],
  }, o);
  return [
    dasar({ id: 'res-1', name: 'Dewi Anggraini', date: HARI_INI, time: '19:00', table: 'A1',
      dpStatus: 'Sudah', dpAmount: 500000,
      dps: [
        { id: 'dp-1a', amount: 300000, method: 'QRIS BRI', proofData: 'data:image/png;base64,AA', by: 'Rina Host', at: now - 7000000 },
        { id: 'dp-1b', amount: 200000, method: 'Transfer UOB', proofData: 'data:image/png;base64,AA', by: 'Budi Kasir', at: now - 3600000 },
      ] }),
    dasar({ id: 'res-2', name: 'Bagus Prakoso', date: HARI_INI, time: '20:00', table: 'A2',
      dpStatus: 'Sudah', dpAmount: 150000,
      dps: [{ id: 'dp-2a', amount: 150000, method: '', proofData: 'data:image/png;base64,AA', by: 'Rina Host', at: now - 3500000 }] }),
    dasar({ id: 'res-3', name: 'Citra Melati', date: HARI_INI, time: '18:30', table: 'A3' }),
    dasar({ id: 'res-4', name: 'Dimas Saputra', date: HARI_INI, time: '16:00', table: 'A5',
      status: 'Cancelled', cancelReason: 'Tamu berubah rencana' }),
    dasar({ id: 'res-5', name: 'Eka Lestari', date: HARI_INI, time: '17:00', table: 'A6',
      pax: 4, status: 'Datang', checkinAt: now - 1800000,
      arrivals: [{ ts: now - 1800000, pax: 4, by: 'Rina Host' }], actualPax: 4,
      dpStatus: 'Sudah', dpAmount: 250000,
      dps: [{ id: 'dp-5a', amount: 250000, method: 'QRIS BCA', proofData: 'data:image/png;base64,AA', by: 'Rina Host', at: now - 3000000 }] }),
    /* Pemegang meja A1 BESOK. Ia yang membuat "edit cepat memindahkan R1 ke
       besok" jadi bentrok yang sesungguhnya — tanpa baris ini, mutasi yang
       mencabut cek bentroknya tidak mengubah satu asersi pun. */
    dasar({ id: 'res-6', name: 'Fajar Nugroho', date: BESOK, time: '19:00', table: 'A1' }),
  ];
}

function dom(opt) {
  opt = opt || {};
  const srv = {
    reservations: fixture(),
    /* QRIS sengaja di posisi KETIGA. Kalau bawaannya diambil dari urutan
       daftar, yang terpilih "Cash" — dan itu keputusan tentang ke mana uang
       dicatat masuk, diambil oleh kebetulan urutan. */
    master: { dpMethods: ['Cash', 'Transfer UOB', 'QRIS BRI', 'QRIS BCA'] },
    audit: opt.audit || [],
    _ver: 1,
  };
  const jejak = { simpan: 0, payload: null, tolakSimpan: !!opt.tolakSimpan };
  const d = new JSDOM(HTML_UJI, {
    url: 'https://team.laksamanamuda.id/reservasi/',
    runScripts: 'dangerously', pretendToBeVisual: true,
    virtualConsole: new VirtualConsole(),
    beforeParse(w) {
      w.alert = () => {};
      w.confirm = () => opt.confirmYa !== false;
      w.print = () => {}; w.scrollTo = () => {};
      w.HTMLElement.prototype.scrollIntoView = function () {};
      try {
        w.localStorage.setItem('lm_session', JSON.stringify({
          expiry: Date.now() + 3600000, userId: 'u-uji', name: 'Penguji',
          modules: ['reservasi'], adminModules: ['reservasi'],
        }));
      } catch (e) {}
      w.fetch = async (url, init) => {
        const u = String(url);
        const balas = o => ({ ok: true, status: 200, text: async () => JSON.stringify(o), json: async () => o });
        if (u.indexOf('account-api') > -1) {
          return balas({ ok: true, members: [{ id: 'u-uji', name: 'Penguji', keterangan: 'Office', isModuleAdmin: true }] });
        }
        if (init && init.method === 'POST') {
          const body = JSON.parse(init.body || '{}');
          if (body.action === 'saveAll') {
            jejak.simpan++;
            jejak.payload = body.data;
            if (jejak.tolakSimpan) return balas({ ok: false, error: 'server tiruan menolak' });
            srv.reservations = JSON.parse(JSON.stringify(body.data.reservations || []));
            srv.audit = JSON.parse(JSON.stringify(body.data.audit || []));
            srv.master = JSON.parse(JSON.stringify(body.data.master || {}));
            srv._ver++;
            return balas({ ok: true, data: { saved: true, ver: srv._ver } });
          }
          return balas({ ok: true, data: {} });
        }
        if (u.indexOf('action=getAll') > -1) return balas({ ok: true, data: JSON.parse(JSON.stringify(srv)) });
        return balas({ ok: true, data: {} });
      };
    },
  });
  return { w: d.window, jejak, srv };
}

async function siap(w) {
  for (let i = 0; i < 240; i++) {
    try {
      if (w.eval('typeof STATE !== "undefined" && STATE && Array.isArray(STATE.reservations) && STATE.reservations.length>0 && DATA_LOADED')) return;
    } catch (e) {}
    await tunggu(50);
  }
  throw new Error('modul Reservasi tidak pernah siap');
}
/* SESSION diisi alur SSO Office yang menuntut roster sungguhan. Yang diuji di
   berkas ini isi halamannya dan jalur simpannya, bukan gerbang masuknya —
   pola yang sama dengan uji-bukti-dp.js. Yang dijalankan sesudah ini tetap
   kode sungguhan. */
async function masuk(w) {
  await siap(w);
  w.eval('SESSION={id:"u-uji",name:"Penguji",role:"admin"}; SELECTED_CREW="u-uji"; CURRENT_PAGE="dashboard";');
  w.eval('window.__toast=[]; toast=function(m,t){ window.__toast.push({m:String(m),t:t}); };');
  await tunggu(40);
}
const toastTerakhir = w => {
  const arr = JSON.parse(w.eval('JSON.stringify(window.__toast||[])'));
  return arr.length ? arr[arr.length - 1].m : '';
};
const hal = (w, id) => w.document.getElementById('page-' + id).innerHTML;
/* Satu baris tabel Daftar Reservasi, diiris menurut nama tamunya. Asersi yang
   menyapu SELURUH tabel akan cocok dengan sel milik baris lain — bentuk yang
   sudah menggigit lima kali di modul Analytics. */
function barisTabel(html, nama) {
  const i = html.indexOf(nama); if (i < 0) return '';
  const mulai = html.lastIndexOf('<tr', i);
  const akhir = html.indexOf('</tr>', i);
  return (mulai < 0 || akhir < 0) ? '' : html.slice(mulai, akhir);
}

(async () => {
  /* =================================================================
     1. AUDIT LOG BISA DICARI
     ================================================================= */
  console.log('\n== 1. Audit Log: pencarian ==');
  {
    const { w } = dom({ audit: [
      { id: 'a1', ts: Date.now() - 500000, user: 'Rina Host', role: 'host', action: 'Buat Reservasi', detail: 'Dewi Anggraini (19:00, 4 pax)' },
      { id: 'a2', ts: Date.now() - 400000, user: 'Budi Kasir', role: 'cashier', action: 'Tambah DP', detail: 'Dewi Anggraini: DP ke-2 Rp. 200.000' },
      { id: 'a3', ts: Date.now() - 300000, user: 'Sari Manager', role: 'manager', action: 'Hapus Reservasi', detail: 'Gita Permata (1 Sep 2026 20:00, 6 pax, meja B3, status Confirmed), diinput Rina Host, DP Rp. 400.000 ikut terhapus' },
    ] });
    await masuk(w);
    await amanTunggu('renderAudit', async () => { w.eval('renderAudit()'); });
    await tunggu(60);

    let v = hal(w, 'audit');
    cek('kotak cari Audit Log ada', v.indexOf('id="auditSearch"') > -1);
    cek('ketiga jejak tergambar sebelum dicari',
        v.indexOf('Buat Reservasi') > -1 && v.indexOf('Tambah DP') > -1 && v.indexOf('Hapus Reservasi') > -1);

    /* Reservasi yang sudah DIHAPUS tidak punya baris lagi di mana pun —
       jejak inilah satu-satunya keterangan yang tersisa, dan mencarinya
       lewat nama tamu adalah cara orang mencarinya. */
    w.eval('AUDIT_Q="Gita"; renderAudit();');
    v = hal(w, 'audit');
    cek('mencari nama reservasi yang sudah DIHAPUS menemukan jejaknya', v.indexOf('Gita Permata') > -1);
    cek('jejak yang tidak cocok disaring keluar', v.indexOf('Dewi Anggraini') < 0);

    w.eval('AUDIT_Q="budi"; renderAudit();');
    cek('pencarian tidak peka huruf besar-kecil, dan mencari nama KRU juga',
        hal(w, 'audit').indexOf('Tambah DP') > -1);

    w.eval('AUDIT_Q="zzz-tidak-ada"; renderAudit();');
    v = hal(w, 'audit');
    cek('kata kunci tanpa hasil DIKATAKAN, bukan tabel kosong tanpa sebab',
        v.indexOf('Tidak ada jejak yang cocok') > -1);

    w.eval('AUDIT_Q=""; renderAudit();');
    cek('dibersihkan, seluruh jejak kembali',
        hal(w, 'audit').indexOf('Dewi Anggraini') > -1);

    /* AUDIT_Q hidup DI LUAR renderAudit. Polling menarik data tiap beberapa
       detik dan menggambar ulang halaman aktif; kalau kata kuncinya lahir di
       dalam penggambar, ia terhapus sendiri di tengah orang mengetik. */
    cek('kata kunci disimpan di luar penggambarnya',
        /\blet AUDIT_Q\s*=/.test(HTML) && !/function renderAudit\(\)\{[\s\S]{0,400}?let AUDIT_Q/.test(HTML));
  }

  /* =================================================================
     2 & 3. KOLOM REKENING + BAWAAN QRIS
     ================================================================= */
  console.log('\n== 2 & 3. Kolom Rekening & bawaan QRIS ==');
  {
    const { w } = dom({});
    await masuk(w);
    await amanTunggu('renderDashboard', async () => { w.eval('renderDashboard()'); });
    await tunggu(60);
    const v = hal(w, 'dashboard');

    cek('kolom Rekening berdiri TEPAT setelah kolom DP',
        v.indexOf('<th>DP</th><th>Rekening</th>') > -1);

    const b1 = barisTabel(v, 'Dewi Anggraini');
    cek('baris ber-DP dua rekening menyebut KEDUANYA',
        b1.indexOf('QRIS BRI') > -1 && b1.indexOf('Transfer UOB') > -1, b1.slice(0, 200));
    cek('kolom DP-nya tetap TOTAL kedua cicilan', b1.indexOf('500.000') > -1);

    const b2 = barisTabel(v, 'Bagus Prakoso');
    cek('DP yang rekeningnya belum diisi DIBEDAKAN dari yang belum DP',
        b2.indexOf('belum diisi') > -1, b2.slice(0, 200));
    cek('dan sebabnya dikatakan berikut cara membetulkannya',
        b2.indexOf('rekening tujuannya tidak pernah diisi') > -1);

    const b3 = barisTabel(w.eval('document.getElementById("page-dashboard").innerHTML'), 'Citra Melati');
    cek('baris yang BELUM DP tidak menyebut rekening mana pun',
        b3.indexOf('QRIS') < 0 && b3.indexOf('belum diisi') < 0, b3.slice(0, 200));

    /* Fixture menaruh QRIS di posisi KETIGA justru untuk ini. */
    cek('bawaan rekening = QRIS, BUKAN yang pertama di daftar',
        w.eval('dpMethodDefault()') === 'QRIS BRI', w.eval('dpMethodDefault()'));
    cek('daftar rekening di master memang tidak diawali QRIS',
        w.eval('JSON.stringify(STATE.master.dpMethods[0])') === '"Cash"');

    // Form input: bawaannya terpilih, tapi tetap bisa diganti.
    w.eval('newReservation()');
    await tunggu(120);
    const sel = w.document.querySelector('select[name=dpMethod]');
    cek('kotak rekening di formulir input ada', !!sel);
    cek('dan terpilih di QRIS saat reservasi BARU', sel && sel.value === 'QRIS BRI', sel && sel.value);
    cek('pilihan lain tetap tersedia (bisa diubah)', sel && sel.options.length === 4);
    if (sel) { sel.value = 'Transfer UOB'; cek('rekening bisa diganti', sel.value === 'Transfer UOB'); }

    // Reservasi LAMA memakai rekening yang tersimpan, bukan bawaannya.
    w.eval('editReservation("res-1")');
    await tunggu(120);
    const sel2 = w.document.querySelector('select[name=dpMethod]');
    cek('reservasi lama memakai rekening yang TERSIMPAN, bukan ditimpa bawaan',
        sel2 && sel2.value === 'QRIS BRI');

    // Modal Tambah DP juga.
    w.eval('openAddDp("res-3")');
    await tunggu(80);
    const sel3 = w.document.getElementById('ndp_method');
    cek('modal Tambah DP ikut berbawaan QRIS', sel3 && sel3.value === 'QRIS BRI', sel3 && sel3.value);
  }

  /* =================================================================
     4. RIWAYAT AKTIVITAS PER RESERVASI
     ================================================================= */
  console.log('\n== 4. Riwayat Aktivitas per reservasi ==');
  {
    const { w, jejak } = dom({ audit: [
      /* Jejak LAMA: tidak menyimpan id reservasi sama sekali. Itu bentuk
         SELURUH audit yang sudah ada di produksi sebelum hari ini. */
      { id: 'a-lama', ts: Date.now() - 900000, user: 'Rina Host', role: 'host',
        action: 'Request Kwitansi', detail: 'Dewi Anggraini, Rp. 500.000 (KW-001)' },
    ] });
    await masuk(w);

    await amanTunggu('changeStatus', async () => { await w.eval('changeStatus("res-1","Datang")'); });
    await tunggu(150);

    const log = JSON.parse(w.eval('JSON.stringify((STATE.reservations.find(x=>x.id==="res-1")||{}).log||[])'));
    cek('jejak menempel di BARIS reservasinya, bukan cuma di audit global', log.length >= 1, JSON.stringify(log));
    cek('jejaknya menyebut aksinya', log.some(x => x.action === 'Ubah Status'));
    cek('jejaknya menyebut SIAPA', log.some(x => x.by === 'Penguji'));
    cek('jejaknya ikut terkirim ke server',
        !!(jejak.payload && (jejak.payload.reservations || []).find(r => r.id === 'res-1' && (r.log || []).length)));

    const a = JSON.parse(w.eval('JSON.stringify(STATE.audit.filter(x=>x.action==="Ubah Status"))'));
    cek('audit global ikut membawa id reservasinya', a.length && a[0].res === 'res-1');

    w.eval('openDetail("res-1")');
    await tunggu(80);
    let m = w.document.getElementById('modalRoot').innerHTML;
    cek('panel Riwayat Aktivitas digambar di detail', m.indexOf('Riwayat Aktivitas') > -1);
    cek('panel menyebut aksi yang barusan terjadi', m.indexOf('Ubah Status') > -1);
    cek('panel menyebut nama orangnya', m.indexOf('Penguji') > -1);
    /* Jejak lama dicocokkan lewat NAMA — itu tebakan, dan tebakannya
       ditandai. Dibuang, panel ini lahir kosong untuk tiap reservasi yang
       sudah berjalan; dicampur diam-diam, dua tamu bernama sama saling
       meminjam jejak tanpa ada yang bisa tahu. */
    cek('jejak LAMA (tanpa id) ikut, lewat pencocokan nama', m.indexOf('Request Kwitansi') > -1);
    cek('dan ditandai bahwa itu cocokan nama, bukan kepastian',
        m.indexOf('dicocokkan dari nama') > -1);

    // Jejak reservasi LAIN tidak ikut nyasar ke sini.
    await amanTunggu('changeStatus res-3', async () => { await w.eval('changeStatus("res-3","Datang")'); });
    await tunggu(150);
    w.eval('closeModal(); openDetail("res-1")');
    await tunggu(80);
    m = w.document.getElementById('modalRoot').innerHTML;
    cek('jejak reservasi LAIN tidak ikut di panel ini', m.indexOf('Citra Melati') < 0);

    /* INVARIAN TERPENTING di blok ini: `rec` di saveReservation() dibangun
       ulang dari daftar field eksplisit. Kalau `log` tidak disebut di sana,
       seluruh jejak sebuah reservasi lenyap begitu ada yang membetulkan satu
       huruf namanya — tanpa satu pun galat. */
    w.eval('closeModal()');
    const sebelum = w.eval('((STATE.reservations.find(x=>x.id==="res-1")||{}).log||[]).length');
    w.eval('editReservation("res-1")');
    await tunggu(150);
    const f = w.document.getElementById('resForm');
    cek('form edit tergambar', !!f);
    if (f) { f.elements['name'].value = 'Dewi Anggraini Putri'; }
    await amanTunggu('saveReservation', async () => { await w.eval('saveReservation()'); });
    await tunggu(200);
    const logSesudah = w.eval('JSON.stringify((STATE.reservations.find(x=>x.id==="res-1")||{}).log||[])');
    const sesudah = JSON.parse(logSesudah).length;
    cek('jejak LAMA masih ada sesudah disunting lewat formulir lengkap',
        logSesudah.indexOf('Ubah Status') > -1, logSesudah.slice(0, 300));
    cek('jumlahnya bertambah satu, bukan dimulai dari nol',
        sesudah === sebelum + 1, sebelum + ' -> ' + sesudah);
    cek('suntingannya sendiri ikut tercatat', logSesudah.indexOf('Edit Reservasi') > -1);
  }

  /* =================================================================
     5 & 6. "SEMUA" TIDAK MEMUAT YANG DIBATALKAN
     ================================================================= */
  console.log('\n== 5 & 6. Yang dibatalkan tidak ikut di "Semua" ==');
  {
    const { w } = dom({});
    await masuk(w);
    await amanTunggu('renderDashboard', async () => { w.eval('renderDashboard()'); });
    await tunggu(60);

    cek('saringan status memang sedang "Semua" (bawaannya)',
        w.eval('JSON.stringify(DASH_FILTER.status)') === '""');
    cek('reservasi yang DIBATALKAN tidak ikut di tabel',
        hal(w, 'dashboard').indexOf('Dimas Saputra') < 0);
    cek('yang masih berlaku tetap tampil',
        hal(w, 'dashboard').indexOf('Dewi Anggraini') > -1);

    /* LABELNYA yang jadi keluhan, bukan aturannya: saringan berbunyi "Semua"
       sementara yang dibatalkan tidak ada di daftarnya, dan yang membacanya
       menyimpulkan datanya hilang lalu mencarinya di database. */
    cek('saringan Status TIDAK lagi berbunyi "Semua" begitu saja',
        hal(w, 'dashboard').indexOf('<option value="">Semua (tanpa Cancelled)</option>') > -1);

    /* Label yang jujur saja belum cukup — yang mencari SATU nama tetap tidak
       tahu apakah yang dicarinya memang tidak ada, atau ada tapi dibatalkan. */
    let v = hal(w, 'dashboard');
    cek('jumlah yang disembunyikan DISEBUT di pita ringkas',
        v.indexOf('<b>1 dibatalkan</b> tidak ditampilkan') > -1, v.slice(v.indexOf('reservasi \u00b7'), 400));
    cek('dan ada jalan langsung untuk melihatnya',
        v.indexOf("DASH_FILTER.status='Cancelled'") > -1);

    /* Angkanya harus mengikuti saringan yang sedang berlaku. Dihitung dari
       seluruh data, ia akan menyebut reservasi batal bulan lalu pada layar
       yang sedang menampilkan hari ini — angka yang tidak bisa dijelaskan. */
    w.eval('HARIH_Q="Dewi"; renderDashboard();');
    v = hal(w, 'dashboard');
    cek('hitungannya ikut kata kunci, bukan dari seluruh data',
        v.indexOf('dibatalkan</b> tidak ditampilkan') < 0, 'masih menyebut yang batal padahal tidak cocok kata kunci');
    w.eval('HARIH_Q="Dimas"; renderDashboard();');
    cek('mencari nama yang ternyata DIBATALKAN menyebutkannya',
        hal(w, 'dashboard').indexOf('<b>1 dibatalkan</b> tidak ditampilkan') > -1);
    w.eval('HARIH_Q=""; renderDashboard();');

    // Kalender: dulu "Semua" tetap menggambar yang dibatalkan.
    w.eval('dashTab("calendar")');
    await tunggu(80);
    v = hal(w, 'dashboard');
    cek('kalender terbuka', v.indexOf('cal-grid') > -1);
    cek('kalender "Semua" TIDAK menggambar yang dibatalkan',
        v.indexOf('Dimas Saputra') < 0);
    cek('yang tidak digambar DISEBUT jumlahnya, bukan hilang diam-diam',
        v.indexOf('yang dibatalkan</b> tidak ikut digambar') > -1);
    cek('chip "Semua" menyebut sendiri apa yang tidak ikut',
        v.indexOf('Semua (kecuali dibatalkan)') > -1);

    /* Dibuang dari "Semua" BUKAN berarti tidak bisa dilihat lagi. */
    w.eval('CAL_STATUS="Cancelled"; renderDashboard();');
    v = hal(w, 'dashboard');
    cek('chip Cancelled tetap memperlihatkannya', v.indexOf('Dimas Saputra') > -1);
    cek('dan yang lain tidak ikut terbawa di saringan itu', v.indexOf('Dewi Anggraini') < 0);

    /* Saringan status yang DIPATOK ke Cancelled tetap menampilkannya di
       tabel — aturan yang sudah ada sejak lama, dan tidak boleh ikut
       tercabut. */
    w.eval('CAL_STATUS=""; DASH_FILTER.status="Cancelled"; dashTab("list");');
    await tunggu(60);
    cek('memilih status Cancelled di tabel tetap menampilkannya',
        hal(w, 'dashboard').indexOf('Dimas Saputra') > -1);
  }

  /* =================================================================
     7. EDIT CEPAT
     ================================================================= */
  console.log('\n== 7. Edit Cepat ==');
  {
    const { w, jejak } = dom({});
    await masuk(w);
    await amanTunggu('renderDashboard', async () => { w.eval('renderDashboard()'); });
    await tunggu(60);

    const b = barisTabel(hal(w, 'dashboard'), 'Dewi Anggraini');
    cek('tombol pensil di baris membuka EDIT CEPAT, bukan formulir panjang',
        b.indexOf('openQuickEdit(') > -1 && b.indexOf('editReservation(') < 0, b.slice(0, 300));

    w.eval('openQuickEdit("res-1")');
    await tunggu(80);
    let m = w.document.getElementById('modalRoot').innerHTML;
    cek('modal edit cepat terbuka', m.indexOf('Edit Cepat') > -1);
    ['qe_name', 'qe_phone', 'qe_date', 'qe_time', 'qe_pax', 'qe_category', 'qe_notes']
      .forEach(id => cek('isian ' + id + ' ada', !!w.document.getElementById(id)));
    cek('jalan ke formulir lengkap tetap ada di dalamnya',
        m.indexOf('Form Lengkap') > -1 && m.indexOf("editReservation('res-1')") > -1);
    /* Yang TIDAK ikut disebutkan sebabnya, bukan didiamkan: tombol yang
       hilang tanpa keterangan terbaca sebagai halaman rusak. */
    cek('dikatakan meja/DP/status diubah lewat tombolnya sendiri',
        m.indexOf('diubah lewat tombolnya masing-masing') > -1);
    cek('denah meja TIDAK ikut diseret ke modal ini', m.indexOf('seat-map') < 0);

    // --- simpan perubahan biasa ---
    const simpanSebelum = jejak.simpan;
    w.document.getElementById('qe_pax').value = '6';
    w.document.getElementById('qe_notes').value = 'Tambah 2 kursi bayi';
    await amanTunggu('simpanQuickEdit', async () => { await w.eval('simpanQuickEdit("res-1")'); });
    await tunggu(200);
    cek('perubahan tersimpan tanpa membuka formulir panjang',
        w.eval('(STATE.reservations.find(x=>x.id==="res-1")||{}).pax') === 6);
    cek('catatan ikut tersimpan',
        w.eval('JSON.stringify((STATE.reservations.find(x=>x.id==="res-1")||{}).notes)') === '"Tambah 2 kursi bayi"');
    cek('benar-benar dikirim ke server', jejak.simpan > simpanSebelum);
    cek('modal ditutup sesudah berhasil',
        w.document.getElementById('modalRoot').innerHTML.indexOf('Edit Cepat') < 0);

    /* Jejaknya menyebut APA yang berubah. Baris yang cuma berbunyi "Edit
       Cepat" tidak menjawab pertanyaan yang membawa orang membuka panelnya. */
    const log = w.eval('JSON.stringify((STATE.reservations.find(x=>x.id==="res-1")||{}).log||[])');
    cek('jejak edit cepat menyebut nilai LAMA dan BARU', log.indexOf('pax 4 \\u2192 6') > -1 || log.indexOf('pax 4 → 6') > -1, log.slice(0, 300));

    // --- tidak ada yang diubah: tidak mengirim apa-apa ---
    const s2 = jejak.simpan;
    w.eval('openQuickEdit("res-1")');
    await tunggu(80);
    await amanTunggu('simpanQuickEdit tanpa ubahan', async () => { await w.eval('simpanQuickEdit("res-1")'); });
    await tunggu(120);
    cek('tanpa perubahan, tidak ada kiriman ke server sama sekali', jejak.simpan === s2, s2 + ' -> ' + jejak.simpan);

    // --- validasi: nama kosong ---
    const s3 = jejak.simpan;
    w.eval('openQuickEdit("res-1")');
    await tunggu(80);
    w.document.getElementById('qe_name').value = '   ';
    await amanTunggu('simpanQuickEdit nama kosong', async () => { await w.eval('simpanQuickEdit("res-1")'); });
    await tunggu(120);
    cek('nama kosong DITAHAN, bukan sekadar diperingatkan', jejak.simpan === s3);
    cek('sebabnya dikatakan', /[Nn]ama tamu tidak boleh kosong/.test(toastTerakhir(w)), toastTerakhir(w));
    cek('modalnya tetap terbuka supaya bisa dibetulkan',
        w.document.getElementById('modalRoot').innerHTML.indexOf('Edit Cepat') > -1);

    // --- pax tidak boleh turun di bawah yang sudah masuk ---
    const s4 = jejak.simpan;
    w.eval('closeModal(); openQuickEdit("res-5")');
    await tunggu(80);
    w.document.getElementById('qe_pax').value = '2';
    await amanTunggu('simpanQuickEdit pax < masuk', async () => { await w.eval('simpanQuickEdit("res-5")'); });
    await tunggu(120);
    cek('pax di bawah yang sudah tercatat masuk DITAHAN', jejak.simpan === s4);
    cek('dan diarahkan ke tempat yang bisa membetulkannya',
        /Form Lengkap/.test(toastTerakhir(w)), toastTerakhir(w));

    /* --- YANG PALING MENENTUKAN: edit cepat bukan jalan pintas yang
       melewati cek bentrok meja. Memindahkan tanggal memindahkan jendela
       kunci mejanya juga, dan meja A1 besok sudah dipegang Fajar. --- */
    const s5 = jejak.simpan;
    w.eval('closeModal(); openQuickEdit("res-1")');
    await tunggu(80);
    w.document.getElementById('qe_date').value = BESOK;
    await amanTunggu('simpanQuickEdit bentrok', async () => { await w.eval('simpanQuickEdit("res-1")'); });
    await tunggu(250);
    cek('pindah tanggal ke meja yang sudah dipesan orang lain DITOLAK', jejak.simpan === s5, s5 + ' -> ' + jejak.simpan);
    cek('tanggalnya TIDAK ikut berubah di data',
        w.eval('JSON.stringify((STATE.reservations.find(x=>x.id==="res-1")||{}).date)') === JSON.stringify(HARI_INI));
    cek('dan disebut siapa yang sudah memegang mejanya',
        /Fajar/.test(w.eval('JSON.stringify(window.__toast||[])')), toastTerakhir(w));
  }

  /* =================================================================
     8. JEJAK YANG GAGAL TERSIMPAN TIDAK BOLEH TERTINGGAL
     ================================================================= */
  console.log('\n== 8. Simpan gagal: jejak ikut dibatalkan ==');
  {
    const { w } = dom({ tolakSimpan: true });
    await masuk(w);
    const sebelum = w.eval('((STATE.reservations.find(x=>x.id==="res-1")||{}).log||[]).length');
    await amanTunggu('konfirmCancel saat server menolak', async () => {
      w.eval('openCancelModal("res-1")');
      await tunggu(60);
      const el = w.document.getElementById('cancelReason'); if (el) el.value = 'Uji';
      await w.eval('konfirmCancel("res-1")');
    });
    await tunggu(250);
    const r = JSON.parse(w.eval('JSON.stringify(STATE.reservations.find(x=>x.id==="res-1")||{})'));
    cek('status dikembalikan saat penyimpanan ditolak', r.status === 'Confirmed', r.status);
    /* Jejak yang mengatakan sebuah reservasi dibatalkan padahal
       penyimpanannya GAGAL akan dibaca orang yang memeriksanya sebagai
       kejadian yang benar-benar terjadi. */
    cek('jejak "Batal" TIDAK tertinggal di barisnya',
        (r.log || []).length === sebelum && !(r.log || []).some(x => x.action === 'Batal'),
        JSON.stringify(r.log || []));

    /* No-show lewat jalur yang berbeda, dan rollback-nya juga ditulis
       terpisah — jadi ia perlu asersinya sendiri. Pemulihan yang cuma
       mengembalikan `status` meninggalkan jejaknya di barisnya. */
    await amanTunggu('markNoShow saat server menolak', async () => {
      await w.eval('markNoShow("res-2")');
    });
    await tunggu(250);
    const r2 = JSON.parse(w.eval('JSON.stringify(STATE.reservations.find(x=>x.id==="res-2")||{})'));
    cek('status no-show dikembalikan saat penyimpanan ditolak', r2.status === 'Confirmed', r2.status);
    cek('jejak "No-show" TIDAK tertinggal di barisnya',
        !(r2.log || []).some(x => x.action === 'No-show'), JSON.stringify(r2.log || []));
  }

  /* =================================================================
     8b. RESERVASI YANG DIHAPUS: JEJAKNYA TETAP BISA DICARI

     Diuji lewat delReservation() yang SUNGGUHAN, bukan lewat baris audit
     yang ditulis fixture-nya sendiri — yang begitu lulus apa pun yang
     dilakukan kodenya, dan mutasi "jejak hapus berhenti menyebut apa yang
     ikut hilang" memang LOLOS darinya di putaran pertama.

     Sesudah barisnya lenyap, kalimat di audit inilah SATU-SATUNYA
     keterangan yang tersisa tentang reservasi itu. Kalau ia cuma berbunyi
     nama + tanggal, yang memeriksanya bulan depan tidak punya cara tahu ada
     uang yang ikut terhapus bersamanya.
     ================================================================= */
  console.log('\n== 8b. Reservasi dihapus: jejaknya tetap ada ==');
  {
    const { w } = dom({});
    await masuk(w);
    await amanTunggu('delReservation', async () => { await w.eval('delReservation("res-5")'); });
    await tunggu(250);

    cek('barisnya benar-benar hilang dari data',
        w.eval('STATE.reservations.some(x=>x.id==="res-5")') === false);

    const a = JSON.parse(w.eval('JSON.stringify((STATE.audit||[]).filter(x=>x.action==="Hapus Reservasi"))'));
    cek('penghapusannya tercatat di audit', a.length === 1, JSON.stringify(a).slice(0, 200));
    const d = a.length ? String(a[0].detail || '') : '';
    cek('jejaknya membawa id reservasinya', a.length && a[0].res === 'res-5');
    cek('menyebut nama, jam & meja', d.indexOf('Eka Lestari') > -1 && d.indexOf('17:00') > -1 && d.indexOf('A6') > -1, d);
    cek('menyebut NOMINAL DP yang ikut terhapus', d.indexOf('Rp. 250.000 ikut terhapus') > -1, d);
    cek('menyebut catatan kedatangan yang ikut terhapus', d.indexOf('catatan kedatangan ikut terhapus') > -1, d);
    cek('menyebut siapa yang dulu menginputnya', d.indexOf('diinput Rina Host') > -1, d);

    /* Dan itu harus bisa DITEMUKAN — jejak yang ada tapi tidak bisa dicari
       sama saja tidak ada, karena Audit Log berisi seluruh venue. */
    w.eval('AUDIT_Q="Eka Lestari"; renderAudit();');
    await tunggu(60);
    cek('jejaknya ketemu lewat pencarian nama tamu di Audit Log',
        hal(w, 'audit').indexOf('Hapus Reservasi') > -1);
  }

  /* =================================================================
     9. INVARIAN SUMBER
     ================================================================= */
  console.log('\n== 9. Invarian sumber ==');
  {
    /* SATU pintu pencatat. Dua pencatat yang dipanggil terpisah akan
       menyimpang begitu ada aksi baru yang lupa memanggil salah satunya. */
    cek('jejak per-baris ditulis dari dalam logAudit, bukan oleh pemanggilnya',
        /function logAudit\(action, detail, resId\)\{[\s\S]{0,900}?tempelLogRes\(resId, e\)/.test(HTML));
    cek('tempelLogRes tunggal', (HTML.match(/function tempelLogRes\(/g) || []).length === 1);
    /* Jejak dibatasi supaya tidak menggelembungkan blob yang dikirim tiap
       simpan — seluruh reservasi ikut di tiap saveAll. */
    cek('jumlah jejak per baris dibatasi', /RES_LOG_MAX/.test(HTML) && /r\.log\.splice\(0, r\.log\.length-RES_LOG_MAX\)/.test(HTML));
    cek('keterangannya ikut dipangkas', /slice\(0,180\)/.test(HTML));
    /* Satu penentu rekening bawaan; dua penentu akan menyimpang dan
       formulir input bisa berbawaan lain daripada modal Tambah DP. */
    cek('dpMethodDefault tunggal', (HTML.match(/function dpMethodDefault\(/g) || []).length === 1);
    cek('dpMethodDefault mencari QRIS, bukan mengambil indeks 0',
        /list\.find\(v=>\/qris\/i\.test/.test(HTML));
    cek('kedua kotak rekening memakai penentu yang sama',
        (HTML.match(/dpMethodDefault\(\)/g) || []).length >= 4);
    /* Edit cepat wajib memakai pemeriksa meja yang SAMA dengan jalur lain —
       bukan menyalin aturannya sendiri. */
    cek('edit cepat memakai mejaMasihKosong(), pemeriksa yang sama dengan jalur meja lain',
        /function simpanQuickEdit[\s\S]{0,3000}?await mejaMasihKosong\(/.test(HTML));
    cek('dan mengoper opsi walk-in lewat opsiCekOf, bukan menebaknya',
        /function simpanQuickEdit[\s\S]{0,3000}?opsiCekOf\(r\)/.test(HTML));
    /* Pemulihan saat gagal memakai helper yang membuang field baru juga —
       Object.assign saja meninggalkan jejak yang barusan ditempel. */
    cek('konfirmCancel memulihkan baris lewat pulihkanRes',
        /async function konfirmCancel[\s\S]{0,900}?pulihkanRes\(r, prev\)/.test(HTML));
    cek('markNoShow memulihkan baris lewat pulihkanRes',
        /async function markNoShow[\s\S]{0,900}?pulihkanRes\(r, prev\)/.test(HTML));
  }

  console.log('\n---------------------------------------');
  console.log('LULUS ' + lulus + '   GAGAL ' + gagal);
  process.exit(gagal ? 1 : 0);
})();
