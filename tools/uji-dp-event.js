/* Uji TAB "DP EVENT (MARKETING)" di halaman Dana Masuk — 20 September 2026,
   permintaan user: *"saya ingin tambahkan juga di bagian dana masuk … kalau
   ada event ada DP juga, jadi kasir bisa pastiin dananya berapa. nanti
   dibuat tab yang berbeda karena tidak gabung ke reservasi"*.

   YANG PALING PERLU DIJAGA, dan bukan tampilannya:

     - TIDAK DIGABUNG ke daftar DP reservasi. Kedua daftar tidak bisa
       dijumlahkan: DP reservasi punya alur verifikasi sendiri di halaman ini,
       pembayaran event sudah diverifikasi marketing sebelum dicatat.
       Dicampur, angka "belum terverifikasi" berhenti bisa dipercaya.
     - DIBACA lewat endpoint SEMPIT, bukan getAll. getAll modul Marketing
       memulangkan seluruh CRM klien, pipeline, dan invoice — dan yang
       membuka halaman Dana Masuk adalah kasir.
     - READ-ONLY. Yang memegang pembayaran event adalah modul Marketing; dua
       tempat yang sama-sama boleh mengubahnya akan punya dua angka untuk
       satu uang.
     - Modul Marketing yang MATI tidak boleh mematikan halaman ini — DP
       reservasi di tab sebelah harus tetap bisa dipakai, dan sebab gagalnya
       disebut.
     - Pemuatnya TIDAK boleh berputar tanpa henti saat gagal. `galat` ikut
       menahan pemuatan ulang; tanpa itu render→muat→render tidak berhenti,
       dan yang terlihat bukan galat melainkan halaman yang menghujani
       server. */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const { JSDOM, VirtualConsole } = (() => {
  for (const p of [process.env.JSDOM_PATH, path.join(ROOT, 'node_modules', 'jsdom'), 'jsdom']) {
    if (!p) continue;
    try { return require(p); } catch (e) {}
  }
  console.error('jsdom tidak ketemu. Pasang `npm i jsdom`, atau setel JSDOM_PATH ke foldernya.');
  process.exit(2);
})();

const ASSET = fs.readFileSync(path.join(ROOT, 'deploy', 'assets', 'venue-layouts.js'), 'utf8');
const SRC = fs.readFileSync(path.join(ROOT, 'deploy', 'reservasi', 'index.html'), 'utf8');
const PHP_LIB = fs.readFileSync(path.join(ROOT, 'marketing-mysql', 'lib_marketing_mysql.php'), 'utf8');
const PHP_API = fs.readFileSync(path.join(ROOT, 'marketing-mysql', 'api.php'), 'utf8');
const HTML_UJI = SRC.replace(
  '<script src="../assets/venue-layouts.js"><' + '/script>',
  () => '<script>' + ASSET + '<' + '/script>');

let lulus = 0, gagal = 0;
const cek = (nama, syarat, ket) => {
  if (syarat) { lulus++; console.log('  OK   ' + nama); }
  else { gagal++; console.log('  GAGAL ' + nama + (ket ? '  -> ' + ket : '')); }
};
const amanTunggu = async (nama, fn) => { try { await fn(); } catch (e) { cek(nama + ' (tidak melempar)', false, e.message); } };
const tunggu = ms => new Promise(r => setTimeout(r, ms));
const pad = n => String(n).padStart(2, '0');
const ymd = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const HARI_INI = ymd(new Date());

/* Balasan endpoint sempit, bentuknya sama persis dengan yang disusun
   dp_masuk() di PHP. Angkanya dipilih supaya tiap kesalahan memberi hasil
   yang BERBEDA: 5.000.000 + 2.500.000 + 1.000.000 = 8.500.000; kalau
   pelunasan ikut terbuang 6.000.000, kalau cuma satu event 7.500.000. */
function dpEvent() {
  return {
    baris: [
      { evId: 'ev-1', event: 'Gathering Nusantara', jenis: 'Corporate Event', tglEvent: HARI_INI,
        status: 'Deal', client: 'PT Bahari Jaya', pic: 'Devani',
        id: 'p1', no: 'KW-0001', type: 'DP', amount: 5000000, method: 'Transfer BCA',
        at: HARI_INI, receipt: 'bukti1.jpg', receiptUrl: '../marketing-api-mysql/api.php?action=receipt&key=abc' },
      { evId: 'ev-1', event: 'Gathering Nusantara', jenis: 'Corporate Event', tglEvent: HARI_INI,
        status: 'Deal', client: 'PT Bahari Jaya', pic: 'Devani',
        id: 'p2', no: 'KW-0002', type: 'Pelunasan', amount: 2500000, method: 'Transfer BCA',
        at: HARI_INI, receipt: '', receiptUrl: '' },
      { evId: 'ev-2', event: 'Ulang Tahun Sekar', jenis: 'Birthday', tglEvent: HARI_INI,
        status: 'Confirmed', client: '', pic: 'Aurel',
        id: 'p3', no: 'KW-0003', type: 'DP', amount: 1000000, method: 'QRIS BRI',
        at: HARI_INI, receipt: 'bukti3.jpg', receiptUrl: '../marketing-api-mysql/api.php?action=receipt&key=def' },
    ],
    total: 8500000, tanpaTanggal: 2, dari: HARI_INI, sampai: HARI_INI,
    luar: { n: 0, total: 0, dari: '', sampai: '' },
  };
}
/* RENTANG YANG DIPILIH KOSONG, TAPI DI LUARNYA ADA ISINYA — dan itu keadaan
   yang PALING SERING terjadi di tab ini: ia terbuka pada rentang HARI INI,
   sementara DP event ditransfer berminggu-minggu sebelum acaranya.
   Dilaporkan user 20 September 2026: "DP-nya tidak ditampilkan padahal sudah
   diisi". Angkanya sengaja SAMA dengan fixture berisi, supaya yang tertukar
   antara "di dalam rentang" dan "di luar rentang" tidak bisa bersembunyi. */
function dpEventKosong() {
  return { baris: [], total: 0, tanpaTanggal: 0, dari: HARI_INI, sampai: HARI_INI,
           luar: { n: 3, total: 8500000, dari: '2026-09-01', sampai: '2026-09-15' } };
}
/* KOSONG SELURUHNYA — memang belum ada satu pembayaran pun. Fixture berisi
   TIDAK bisa menguji ini: daftarnya tidak kosong, jadi keadaan kosongnya
   tidak pernah digambar dan asersinya hampa. */
function dpEventNihil() {
  return { baris: [], total: 0, tanpaTanggal: 0, dari: HARI_INI, sampai: HARI_INI,
           luar: { n: 0, total: 0, dari: '', sampai: '' } };
}

function dom(opt) {
  opt = opt || {};
  const jejak = { dpUrl: [], getAllMkt: 0 };
  const srv = { reservations: [], master: {}, audit: [], _ver: 1 };
  const d = new JSDOM(HTML_UJI, {
    url: 'https://team.laksamanamuda.id/reservasi/',
    runScripts: 'dangerously', pretendToBeVisual: true,
    virtualConsole: new VirtualConsole(),
    beforeParse(w) {
      w.alert = () => {}; w.confirm = () => true; w.print = () => {}; w.scrollTo = () => {};
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
        if (u.indexOf('marketing-api') > -1) {
          if (u.indexOf('action=getAll') > -1) { jejak.getAllMkt++; return balas({ ok: true, data: {} }); }
          jejak.dpUrl.push(u);
          if (opt.gagalDp) return balas({ ok: false, error: 'server tiruan menolak' });
          return balas({ ok: true, data: (opt.kosongTapiAdaLuar ? dpEventKosong() : (opt.nihil ? dpEventNihil() : dpEvent())) });
        }
        if (init && init.method === 'POST') return balas({ ok: true, data: { saved: true, ver: ++srv._ver } });
        if (u.indexOf('action=getAll') > -1) return balas({ ok: true, data: JSON.parse(JSON.stringify(srv)) });
        return balas({ ok: true, data: {} });
      };
    },
  });
  return { w: d.window, jejak };
}
async function masuk(w) {
  for (let i = 0; i < 240; i++) {
    try { if (w.eval('typeof STATE!=="undefined" && DATA_LOADED')) break; } catch (e) {}
    await tunggu(50);
  }
  w.eval('SESSION={id:"u-uji",name:"Penguji",role:"admin"}; SELECTED_CREW="u-uji"; CURRENT_PAGE="finance";');
  await tunggu(40);
}
const hal = w => w.document.getElementById('page-finance').innerHTML;

(async () => {
  /* ================================================================
     1. TAB TERPISAH, DAN JALAN PULANGNYA ADA
     ================================================================ */
  console.log('\n== 1. Tab terpisah ==');
  {
    const { w, jejak } = dom({});
    await masuk(w);
    await amanTunggu('renderFinance', async () => { w.eval('renderFinance()'); });
    await tunggu(60);

    cek('tab DP Reservasi tergambar', hal(w).indexOf("finSumber('reservasi')") > -1);
    cek('tab DP Event tergambar', hal(w).indexOf("finSumber('event')") > -1);
    cek('bawaannya tetap DP Reservasi — halaman ini memang dibuka untuk itu',
        w.eval('JSON.stringify(FIN_SUMBER)') === '"reservasi"');
    /* Saklarnya digambar di KEDUA tab. Kalau hanya di salah satunya, yang
       sudah pindah ke tab event tidak punya jalan pulang. */
    cek('dua daftar yang tidak bisa dijumlahkan — dan itu dikatakan',
        hal(w).indexOf('tidak bisa dijumlahkan') > -1);

    await amanTunggu('pindah ke tab event', async () => { w.eval('finSumber("event")'); });
    await tunggu(200);
    cek('pindah tab menarik datanya', jejak.dpUrl.length === 1, jejak.dpUrl.length + '× panggil');
    cek('saklarnya tetap ada di tab event (ada jalan pulang)',
        hal(w).indexOf("finSumber('reservasi')") > -1);

    /* ENDPOINT SEMPIT, bukan getAll — getAll memulangkan seluruh CRM klien
       & pipeline ke layar kasir. */
    cek('dibaca lewat endpoint sempit dpMasuk',
        /action=dpMasuk/.test(jejak.dpUrl[0] || ''), jejak.dpUrl[0]);
    cek('dan TIDAK lewat getAll modul Marketing', jejak.getAllMkt === 0, jejak.getAllMkt + '× getAll');
    cek('rentangnya ikut dikirim',
        /dari=/.test(jejak.dpUrl[0] || '') && /sampai=/.test(jejak.dpUrl[0] || ''));
  }

  /* ================================================================
     2. ISI TABELNYA
     ================================================================ */
  console.log('\n== 2. Isi tabel ==');
  {
    const { w } = dom({});
    await masuk(w);
    await amanTunggu('buka tab event', async () => { w.eval('renderFinance(); finSumber("event")'); });
    await tunggu(250);
    const v = hal(w);

    cek('judulnya menyebut sumbernya', v.indexOf('DP Event (dari Marketing)') > -1);
    cek('total dana masuk dijumlahkan benar', v.indexOf('Rp. 8.500.000') > -1, 'tidak ada Rp. 8.500.000');
    /* Dihitung dari evId yang BERBEDA, bukan dari jumlah barisnya: satu event
       boleh dibayar beberapa kali, dan "3 event" untuk 2 event yang dicicil
       adalah angka yang tidak akan dipertanyakan siapa pun. */
    cek('jumlah EVENT-nya dihitung dari event yang berbeda, bukan jumlah baris',
        v.indexOf('Event</div><div class="val">2</div>') > -1, 'harusnya 2 event dari 3 pembayaran');
    cek('nama event tampil', v.indexOf('Gathering Nusantara') > -1);
    cek('client & PIC-nya ikut', v.indexOf('PT Bahari Jaya') > -1 && v.indexOf('Devani') > -1);
    cek('nomor kwitansinya ikut', v.indexOf('KW-0001') > -1);
    cek('jenis pembayaran dibedakan', v.indexOf('Pelunasan') > -1 && v.indexOf('>DP<') > -1);
    cek('metodenya ikut', v.indexOf('Transfer BCA') > -1 && v.indexOf('QRIS BRI') > -1);
    /* Bukti dibuka di tab baru, bukan diunduh lewat jalur modul ini: berkasnya
       disajikan marketing-api, dan menyalin pengunduhnya ke sini berarti dua
       jalur untuk satu berkas. */
    cek('bukti bisa dibuka', v.indexOf('action=receipt&amp;key=abc') > -1 || v.indexOf('action=receipt&key=abc') > -1);
    /* Barisnya DIIRIS: asersi yang menyapu seluruh tabel cocok dengan
       keterangan di kartu atas maupun dengan baris lain, dan mutasi yang
       mencabut penandanya LOLOS darinya. Yang diuji baris KW-0002, satu-
       satunya yang memang tidak punya lampiran. */
    const barisTanpaBukti = (() => {
      const i = v.indexOf('KW-0002'); if (i < 0) return '';
      const a = v.lastIndexOf('<tr', i); return a < 0 ? '' : v.slice(a, v.indexOf('</tr>', i));
    })();
    cek('baris tanpa bukti ketemu', barisTanpaBukti.length > 0);
    cek('pembayaran TANPA bukti ditandai, bukan dibiarkan kosong',
        barisTanpaBukti.indexOf('tanpa bukti') > -1, barisTanpaBukti.slice(-200));
    cek('dan TIDAK diberi tautan bukti yang tidak ada',
        barisTanpaBukti.indexOf('action=receipt') < 0);

    /* Yang tidak punya tanggal bayar TIDAK ikut di daftar mana pun — itu
       disebut angkanya, kalau tidak yang menjumlahkan mengira sudah lengkap. */
    cek('pembayaran tanpa tanggal disebut jumlahnya',
        v.indexOf('2 pembayaran event tidak punya tanggal bayar') > -1);
    cek('dan dikatakan kenapa tidak dijatuhkan ke tanggal acaranya',
        v.indexOf('menaruh uang di hari yang tidak pernah menerimanya') > -1);

    /* READ-ONLY, dan itu dikatakan di layar — bukan cuma diam-diam tidak ada
       tombolnya. */
    cek('dikatakan daftarnya hanya dibaca', v.indexOf('hanya dibaca') > -1);
    cek('tidak ada tombol verifikasi/tolak di tab ini',
        v.indexOf('verifyTf(') < 0 && v.indexOf('rejectTf(') < 0);
    /* Reservasi VIP sudah punya barisnya di tab sebelah — menampilkannya lagi
       di sini membuat satu transfer terhitung dua kali. */
    cek('dikatakan Reservasi VIP tidak ikut di tab ini',
        v.indexOf('Reservasi VIP tidak ada di sini') > -1);

    // Pencarian
    w.eval('DPEV.q="sekar"; renderFinance();');
    const v2 = hal(w);
    cek('pencarian menyaring', v2.indexOf('Ulang Tahun Sekar') > -1 && v2.indexOf('Gathering Nusantara') < 0);
    const kartuTotal = (() => {
      const i = v2.indexOf('Total DP Event Masuk'); if (i < 0) return '';
      return v2.slice(i, v2.indexOf('</div></div>', i));
    })();
    cek('kartu total ketemu', kartuTotal.length > 0);
    cek('dan totalnya ikut angka yang tersaring, bukan seluruh rentang',
        kartuTotal.indexOf('Rp. 1.000.000') > -1 && kartuTotal.indexOf('8.500.000') < 0, kartuTotal.slice(0, 160));
    w.eval('DPEV.q="zzz"; renderFinance();');
    cek('kata kunci tanpa hasil DIKATAKAN, bukan tabel kosong',
        hal(w).indexOf('Tidak ada pembayaran yang cocok') > -1);
    w.eval('DPEV.q=""; renderFinance();');
  }

  /* ================================================================
     3. MODUL MARKETING MATI
     ================================================================ */
  console.log('\n== 3. Modul Marketing tidak menjawab ==');
  {
    const { w, jejak } = dom({ gagalDp: true });
    await masuk(w);
    await amanTunggu('buka tab event', async () => { w.eval('renderFinance(); finSumber("event")'); });
    await tunggu(300);
    const v = hal(w);
    cek('gagalnya DIKATAKAN, bukan tabel kosong', v.indexOf('tidak terbaca') > -1);
    cek('sebabnya ikut disebut', v.indexOf('server tiruan menolak') > -1);
    cek('dan ditunjukkan DP reservasi di tab sebelah masih bisa dipakai',
        v.indexOf('tab sebelah tetap bisa dipakai') > -1);
    cek('ada tombol coba lagi', v.indexOf('dpevCobaLagi()') > -1);

    /* INI YANG PALING MUDAH LEPAS: gagal harus MENAHAN pemuatan ulang.
       Tanpa itu render memanggil muatDpEvent() lagi, yang gagal lagi, yang
       merender lagi — dan yang terlihat bukan galat melainkan halaman yang
       menghujani server. */
    const n1 = jejak.dpUrl.length;
    await amanTunggu('muat ulang sesudah gagal', async () => {
      await w.eval('muatDpEvent()'); await w.eval('muatDpEvent()'); await w.eval('muatDpEvent()');
    });
    await tunggu(250);
    cek('gagal TIDAK memicu pemuatan berulang tanpa henti',
        jejak.dpUrl.length === n1, n1 + ' -> ' + jejak.dpUrl.length);

    // Tombol coba lagi memang membersihkan penahannya.
    await amanTunggu('coba lagi', async () => { w.eval('dpevCobaLagi()'); });
    await tunggu(250);
    cek('tombol coba lagi menarik ulang', jejak.dpUrl.length === n1 + 1,
        n1 + ' -> ' + jejak.dpUrl.length);

    /* Dan tab reservasi tetap utuh — modul Marketing yang mati tidak boleh
       mematikan halaman ini. */
    w.eval('finSumber("reservasi")');
    await tunggu(80);
    cek('tab DP Reservasi tetap tergambar walau Marketing mati',
        hal(w).indexOf('Dana Masuk (DP)') > -1);
  }

  /* ================================================================
     4. RENTANG TANGGAL
     ================================================================ */
  console.log('\n== 4. Rentang tanggal ==');
  {
    const { w, jejak } = dom({});
    await masuk(w);
    await amanTunggu('buka tab event', async () => { w.eval('renderFinance(); finSumber("event")'); });
    await tunggu(250);
    const n1 = jejak.dpUrl.length;

    /* Rentang yang berubah WAJIB menarik ulang: kotak tanggalnya bergerak
       sementara daftarnya tetap rentang lama adalah dua angka yang
       bertentangan di satu layar. */
    await amanTunggu('ubah rentang', async () => { w.eval('finSet("from","2026-01-01")'); });
    await tunggu(250);
    cek('mengubah rentang menarik ulang daftarnya', jejak.dpUrl.length === n1 + 1,
        n1 + ' -> ' + jejak.dpUrl.length);
    cek('rentang barunya yang dikirim', /dari=2026-01-01/.test(jejak.dpUrl[jejak.dpUrl.length - 1]));

    /* Kotak tanggal boleh kosong (tombol "Semua"), sementara backend menuntut
       tanggal sah — dijepit, bukan ditolak: daftar kosong karena tanggalnya
       kosong terbaca sebagai "tidak ada DP event". */
    await amanTunggu('rentang semua', async () => { w.eval('finRange("all")'); });
    await tunggu(250);
    const akhir = jejak.dpUrl[jejak.dpUrl.length - 1];
    cek('rentang kosong dijepit ke rentang lebar, bukan dikirim kosong',
        /dari=2000-01-01/.test(akhir) && /sampai=2100-12-31/.test(akhir), akhir);

    /* Rentang yang SAMA tidak ditarik dua kali — polling & render ulang tidak
       boleh jadi permintaan berulang ke modul sebelah. */
    const n2 = jejak.dpUrl.length;
    await amanTunggu('muat ulang rentang yang sama', async () => {
      await w.eval('muatDpEvent()'); await w.eval('muatDpEvent()');
    });
    await tunggu(250);
    cek('rentang yang sama tidak ditarik berulang', jejak.dpUrl.length === n2,
        n2 + ' -> ' + jejak.dpUrl.length);
  }

  /* ================================================================
     5. KONTRAK BACKEND (atas sumber PHP)

     PHP tidak bisa dijalankan di mesin pengembangan, jadi aturannya dijaga
     terhadap SUMBERNYA — server tiruan menerima apa saja, dan aturan yang
     tidak pernah ditulis di sana tidak menimbulkan galat di satu sisi pun.
     Pola yang sama dengan uji-simpan-basi.js dan uji-void-catatan.js.
     ================================================================ */
  console.log('\n== 5. Kontrak backend ==');
  {
    cek('fungsinya ada dan tunggal', (PHP_LIB.match(/function dp_masuk\(/g) || []).length === 1);
    cek('dirouting di api.php', PHP_API.indexOf("$action === 'dpMasuk'") > -1);
    cek('didokumentasikan di kepala api.php', PHP_API.indexOf('?action=dpMasuk') > -1);
    /* Rentangnya DIVALIDASI: tanggal karangan yang lolos ke SQL adalah
       perbandingan string yang hasilnya tidak bisa dijelaskan siapa pun. */
    cek('rentangnya divalidasi', /function dp_masuk[\s\S]{0,400}?tanggal_valid\(\$dari\) \|\| !tanggal_valid\(\$sampai\)/.test(PHP_LIB));
    cek('rentang terbalik dibetulkan, bukan memulangkan kosong',
        /function dp_masuk[\s\S]{0,600}?if \(\$dari > \$sampai\)/.test(PHP_LIB));
    /* Pembayaran tanpa tanggal TIDAK dijatuhkan ke tanggal acara, dan
       jumlahnya dilaporkan. */
    cek('pembayaran tanpa tanggal dilewati & dihitung',
        /if \(\$at === ''\) \{ \$tanpaTanggal\+\+; continue; \}/.test(PHP_LIB));
    cek('jumlahnya ikut dipulangkan', /'tanpaTanggal' => \$tanpaTanggal/.test(PHP_LIB));
    /* LEFT JOIN: event yang client-nya sudah dihapus tetap muncul — uangnya
       sudah masuk, dan baris yang hilang dibaca sebagai dana yang tidak ada. */
    cek('client & PIC lewat LEFT JOIN, bukan JOIN',
        /LEFT JOIN clients c/.test(PHP_LIB) && /LEFT JOIN users   u/.test(PHP_LIB)
        && !/\n\s+JOIN clients/.test(PHP_LIB));
    /* Yang dipulangkan hanya pembayarannya — nilai/grand event dihitung
       eventFinance() di JS, dan menyalinnya ke PHP berarti berkas kembar
       lintas bahasa. */
    cek('grand total event TIDAK ikut dihitung di PHP',
        !/function dp_masuk[\s\S]{0,3000}?'grand'/.test(PHP_LIB));
    cek('disebut alasannya di komentarnya', PHP_LIB.indexOf('berkas kembar LINTAS BAHASA') > -1);
  }

  /* ================================================================
     RENTANG KOSONG YANG MENYEBUT DI MANA ISINYA (20 September 2026)

     Tab ini terbuka pada rentang HARI INI, sementara DP event ditransfer
     berminggu-minggu sebelum acaranya — jadi daftar kosong adalah keadaan
     yang PALING SERING terjadi, dan "Tidak ada pembayaran event pada 20 Sep
     – 20 Sep" terbaca sebagai fitur yang tidak jalan. Dilaporkan user.
     ================================================================ */
  console.log('\n== Rentang kosong: di mana isinya ==');
  {
    const { w } = dom({ kosongTapiAdaLuar: true });
    await masuk(w);
    await amanTunggu('buka tab event', async () => { w.eval('finSumber("event")'); });
    await tunggu(250);
    const h = hal(w);

    cek('daftarnya memang kosong', /Tidak ada pembayaran event pada/.test(h));
    /* JUMLAH, NOMINAL, dan RENTANG yang benar-benar ada isinya. Tanpa
       ketiganya, yang membacanya tidak punya cara tahu apakah datanya memang
       belum ada atau cuma di luar rentang yang kebetulan terpilih. */
    cek('menyebut ADA yang di luar rentang', /Di luar rentang ini ada/.test(h), h.slice(0, 0));
    cek('menyebut jumlahnya', /3 pembayaran/.test(h));
    cek('menyebut nominalnya', /8\.500\.000/.test(h));
    cek('menyebut rentang yang ada isinya',
        /1 Sep 2026/.test(h) && /15 Sep 2026/.test(h), 'rentang luar tidak disebut');
    /* ANGKA TANPA JALAN KELUAR cuma memberi tahu orang bahwa ia salah tanpa
       menunjukkan yang benar. */
    cek('menawarkan tombol yang memakainya', /dpevPakaiRentang\('2026-09-01','2026-09-15'\)/.test(h));

    /* Tombolnya benar-benar menggeser rentangnya — dan lewat jalur yang SAMA
       dengan kotak tanggalnya sendiri, supaya kotak di atas tidak menyebut
       rentang lain daripada daftar di bawahnya. */
    await amanTunggu('tekan tombolnya', async () => { w.eval("dpevPakaiRentang('2026-09-01','2026-09-15')"); });
    await tunggu(200);
    cek('rentangnya bergeser', w.eval('FIN_F.from') === '2026-09-01' && w.eval('FIN_F.to') === '2026-09-15',
        w.eval('FIN_F.from') + '..' + w.eval('FIN_F.to'));
    cek('kotak tanggalnya ikut menyebut rentang baru',
        hal(w).indexOf('value="2026-09-01"') > -1 && hal(w).indexOf('value="2026-09-15"') > -1);
  }

  /* Yang rentangnya kosong DAN di luarnya juga kosong tidak boleh diberi
     kalimat itu — menawarkan rentang yang sama-sama kosong membuat orang
     menekannya lalu kembali ke layar yang sama. */
  console.log('\n== Rentang kosong & memang tidak ada apa-apa ==');
  {
    /* FIXTURE-nya harus KOSONG juga. Fixture berisi tidak bisa menguji ini:
       daftarnya tidak kosong, jadi keadaan kosongnya tidak pernah digambar
       dan asersinya hijau apa pun keputusan kodenya — mutasi "ditawarkan
       walau di luar rentang juga kosong" memang LOLOS karenanya. */
    const { w } = dom({ nihil: true });
    await masuk(w);
    await amanTunggu('buka tab event', async () => { w.eval('finSumber("event")'); });
    await tunggu(250);
    cek('keadaan kosongnya memang digambar', /Tidak ada pembayaran event pada/.test(hal(w)));
    /* Menawarkan rentang yang sama-sama kosong membuat orang menekannya lalu
       kembali ke layar yang sama. */
    cek('tidak menawarkan apa pun', !/Di luar rentang ini ada/.test(hal(w)));
  }

  /* ================================================================
     BACKEND: yang di luar rentang DIHITUNG, bukan cuma dilewati
     ================================================================ */
  console.log('\n== Backend: hitungan di luar rentang ==');
  if (PHP_LIB) {
    const i = PHP_LIB.indexOf('function dp_masuk(');
    const j = PHP_LIB.indexOf('function events_hari(');
    const badan = (i > -1 && j > i) ? PHP_LIB.slice(i, j).replace(/\/\*[\s\S]*?\*\//g, '') : '';
    cek('badan dp_masuk terbaca', !!badan);
    cek('yang di luar rentang dihitung, bukan cuma continue',
        /\$luarN\+\+/.test(badan) && /\$luarRp \+=/.test(badan));
    /* Rentang yang BENAR-BENAR ada isinya, supaya layar bisa menawarkan
       rentang yang menampilkan sesuatu — bukan cuma memberi tahu bahwa yang
       dipilih kosong. */
    /* YANG DITUNTUT PENGISIANNYA, bukan sekadar namanya muncul: $luarMin &
       $luarMax juga berdiri di deklarasi awal dan di baris return, jadi
       asersi yang cuma mencari namanya tetap hijau walau baris yang
       mengisinya dicabut — mutasi itu memang LOLOS di putaran pertama. */
    cek('tanggal terawal & terakhirnya ikut dicatat',
        /\$luarMin === ''[\s\S]{0,40}?\$luarMin = \$at;/.test(badan)
        && /\$at > \$luarMax\) \$luarMax = \$at;/.test(badan));
    cek('ikut dipulangkan sebagai luar', /'luar'\s*=>/.test(badan));
    /* BARISNYA TIDAK ikut terkirim — kalau ikut, penyaring tanggalnya
       berhenti berarti apa-apa. */
    cek('barisnya TIDAK ikut terkirim',
        /\$luarN\+\+[\s\S]{0,200}?continue;/.test(badan));
  }

  console.log('\n---------------------------------------');
  console.log('LULUS ' + lulus + '   GAGAL ' + gagal);
  process.exit(gagal ? 1 : 0);
})();
