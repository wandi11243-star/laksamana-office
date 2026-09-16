/* Uji TOMBOL "TIDAK HADIR" & ESTIMASI YANG MENGIKUTINYA — modul Daily Worker.

   Permintaan user 16 September 2026: "ada tombol tidak hadirnya juga / karna
   kalau ditekan tidak hadir maka estimasi biayanya tidak perlu di-set lagi".

   DUA HAL, dan yang kedua yang menyentuh uang:

     1. tombolAlfa() di BARIS Dashboard — menandai yang tidak datang tanpa
        pindah halaman, dan bisa dibatalkan satu klik.
     2. Est. Biaya & Total Jam di Dashboard, di Kalender DW, dan di kaki berkas
        Excel-nya berhenti menghitung yang sudah ditandai TIDAK HADIR.

   YANG PALING MUDAH LEPAS, dan karena itu yang dijaga paling keras:

     - DIPERBAIKI SEPARUH. Tiga tempat menjumlahkan hal yang sama, dan yang
       tertinggal satu tidak melempar apa pun — ia cuma menyebut angka lain
       daripada dua layar sebelahnya untuk malam yang sama. Itu bentuk
       kegagalan yang sudah empat kali memakan waktu di repo ini (porsiPic,
       potonganHari, hpp.php, cocokPic), jadi yang dikunci bukan ketiga
       tempatnya melainkan INVARIANNYA: tidak boleh ada satu pun penjumlah
       biaya/jam di luar helper bersamanya.
     - ringkasAjuan() IKUT BERUBAH. Ia dipakai kotak konfirmasi "Setujui
       semua", dan pada detik itu belum seorang pun hadir atau tidak hadir —
       yang ditanyakan berapa yang sedang DISANGGUPI. Dibuat mengikuti
       kehadiran, angkanya jadi selalu penuh (semua kosong = dibayar) hari ini
       dan diam-diam salah besok.
     - ANGKA YANG MENYUSUT TANPA KETERANGAN. Est. Biaya yang turun tanpa
       menyebut sebabnya dibaca sebagai salah hitung.
     - Tombol di baris yang BISA DIKLIK. Tanpa stopPropagation ia justru
       membuka modal Detail.

   Angka fixture dipilih supaya tiap kesalahan memberi hasil yang BERBEDA:
   empat shift disetujui, SATU ditandai ALFA, tarif Rp100.000, 5 jam.
     benar               -> Rp300.000 / 15 jam
     ALFA ikut dihitung  -> Rp400.000 / 20 jam
     TELAT ikut dibuang  -> Rp200.000 / 10 jam
     kosong ikut dibuang -> Rp200.000 / 10 jam
   Tidak ada satu pun yang bisa tertukar dengan yang lain. */
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

const BERKAS = path.join(ROOT, 'deploy', 'dw', 'index.html');
const HTML = fs.readFileSync(BERKAS, 'utf8');

let ok = 0, gagal = 0;
const cek = (n, s, k) => {
  if (s) { ok++; console.log('  OK   ' + n); }
  else { gagal++; console.log('  GAGAL ' + n + (k ? '  -> ' + k : '')); }
};
const sama = (n, d, h) => cek(n, d === h, 'dapat ' + JSON.stringify(d) + ', harusnya ' + JSON.stringify(h));
const tunggu = ms => new Promise(r => setTimeout(r, ms));

/* Sumber TANPA komentar. Sejarah di repo ini memang menyebut nama yang sudah
   dicabut dan rumus yang sudah dipindah — yang dilarang PEMAKAIANNYA, bukan
   penyebutannya. Pemindai yang merah untuk komentar akan dimatikan orang
   berikutnya. */
const KODE = HTML
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/(^|[^:"'\\])\/\/[^\n]*/g, '$1');

function bukaModul() {
  const vc = new VirtualConsole();
  vc.on('jsdomError', e => {
    const t = String((e && e.detail && e.detail.stack) || (e && e.message) || e);
    if (!/Not implemented|Could not parse CSS/.test(t)) console.log('  !! ' + t.split('\n')[0]);
  });
  return new JSDOM(HTML, {
    url: 'https://dev.laksamanamuda.id/dw/',
    runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(w) {
      w.localStorage.setItem('lm_session', JSON.stringify({
        id: 'u-uji', userId: 'u-uji', name: 'Penguji', token: 't',
        modules: ['dw'], adminModules: [], expiry: Date.now() + 86400000,
      }));
      w.alert = () => {}; w.confirm = () => true; w.print = () => {};
      w.scrollTo = () => {};
      if (typeof w.TextEncoder === 'undefined') w.TextEncoder = TextEncoder;
      /* Ekspor Excel menulis lewat <a download>. jsdom tidak punya
         createObjectURL, dan tanpa stub ini exportExcelDW() melempar SEBELUM
         sampai ke baris kaki yang justru sedang diuji. */
      w.URL.createObjectURL = () => 'blob:uji';
      w.URL.revokeObjectURL = () => {};
      /* POST yang dikirim setHadir() dicatat, bukan dijawab asal-asalan:
         yang diuji apa yang BERANGKAT, bukan apa yang tergambar sesudahnya. */
      w.__post = [];
      w.fetch = async (url, opt) => {
        const u = String(url);
        const balas = o => ({ ok: true, status: 200,
          text: async () => JSON.stringify(o), json: async () => o });
        if (opt && opt.body) { try { w.__post.push(JSON.parse(opt.body)); } catch (e) {} }
        if (/account-api/.test(u)) return balas({ ok: true, members: [] });
        if (/jadwal-api/.test(u))  return balas({ ok: true, data: { headIds: [] } });
        if (/-api-mysql/.test(u) && !/dw-api-mysql/.test(u)) {
          return balas({ ok: true, data: { events: [], clients: [], reservations: [] } });
        }
        return balas({ ok: true, data: { pekerja: [], ajuan: [], permintaan: [], setting: {},
                                         peran: { hrd: true, head: false, lihat: true, admin: true, divisi: [] } } });
      };
    },
  });
}

async function siap(w) {
  for (let i = 0; i < 200; i++) {
    try { if (w.eval('typeof S !== "undefined" && !!S && typeof tombolAlfa === "function"')) return; }
    catch (e) {}
    await tunggu(50);
  }
  throw new Error('modul DW tidak pernah siap');
}

/* Empat shift KEMARIN di satu divisi, kehadirannya sengaja berbeda-beda —
   itulah yang membuat "ALFA saja yang dibuang" bisa dibedakan dari "hanya yang
   HADIR yang dihitung". Ditaruh KEMARIN, bukan hari ini: tombolnya memang
   tidak ditawarkan untuk tanggal yang belum lewat, dan fixture bertanggal hari
   ini tidak bisa membedakan "kemarin" dari "hariIni()". */
function pasangData(w) {
  const kemarin = w.eval('addD(hariIni(),-1)');
  const besok = w.eval('addD(hariIni(),1)');
  const b = (id, dw, hadir, tgl, div) => ({
    id: id, dwId: dw, tgl: tgl || kemarin, m: '18:00', s: '23:00',
    divisi: div || 'bar', posisi: 'Bartender', status: 'DISETUJUI', hadir: hadir,
  });
  const data = {
    peran: { hrd: true, head: false, lihat: true, admin: true, divisi: [] },
    setting: {
      tarif: { 'Bartender': 100000 },
      jamDasar: 6, tambahanPanjang: 20000,
      jam: [{ n: 'Sore', m: '16:00', s: '23:00' }],
      kuota: { bar: { biasa: 9, weekend: 9, event: 9 } },
    },
    pekerja: [
      { id: 'P1', nama: 'Andi',  hp: '081200000001', divisi: 'bar', posisi: 'Bartender', status: 'AKTIF' },
      { id: 'P2', nama: 'Budi',  hp: '081200000002', divisi: 'bar', posisi: 'Bartender', status: 'AKTIF' },
      { id: 'P3', nama: 'Citra', hp: '081200000003', divisi: 'bar', posisi: 'Bartender', status: 'AKTIF' },
      { id: 'P4', nama: 'Dewi',  hp: '081200000004', divisi: 'bar', posisi: 'Bartender', status: 'AKTIF' },
    ],
    ajuan: [
      b('A1', 'P1', ''),        /* belum dikonfirmasi -> TETAP dibayar */
      b('A2', 'P2', 'HADIR'),
      b('A3', 'P3', 'ALFA'),    /* satu-satunya yang keluar dari estimasi */
      b('A4', 'P4', 'TELAT'),   /* telat TETAP dibayar penuh */
      b('A9', 'P1', '', besok), /* tanggal belum lewat: tombolnya tidak ditawarkan */
    ],
    permintaan: [],
  };
  w.eval('S = normalizeState(' + JSON.stringify(data) + ');'
    + ' DASH_TGL=' + JSON.stringify(kemarin) + ';'
    + ' DIV="bar"; BULAN_AKTIF=bulanDari(' + JSON.stringify(kemarin) + ');');
  return { kemarin, besok };
}

function gambar(w, fn) {
  const d = w.document.createElement('div');
  d.innerHTML = w.eval(fn + '()');
  return d;
}
function angkaStat(kotak, label) {
  const s = Array.from(kotak.querySelectorAll('.stat'))
    .find(x => (x.querySelector('.l') || {}).textContent === label);
  return s ? (s.querySelector('.n') || {}).textContent : null;
}
function subStat(kotak, label) {
  const s = Array.from(kotak.querySelectorAll('.stat'))
    .find(x => (x.querySelector('.l') || {}).textContent === label);
  const n = s && s.querySelector('.s');
  return n ? n.textContent : '';
}
function barisId(kotak, id) {
  return Array.from(kotak.querySelectorAll('table.list tbody tr'))
    .find(tr => tr.innerHTML.indexOf("'" + id + "'") > -1);
}
/* KOLOM AKSINYA SAJA, bukan seluruh baris. Pil status di sebelahnya berbunyi
   "Tidak hadir" untuk baris yang sudah ditandai ALFA, jadi asersi atas seluruh
   baris cocok dengan PIL-nya tanpa pernah menyentuh tombolnya — dan "tombolnya
   sudah berganti jadi Batal" lalu tidak terbukti apa pun. Bentuk asersi hampa
   yang sudah berulang kali menggigit di repo ini. */
function selAksi(tr) { return (tr && tr.querySelector('td.noprint')) || null; }

(async () => {
  const dom = bukaModul();
  const w = dom.window;
  await siap(w);
  const T = pasangData(w);

  /* ================================================================
     1. TOMBOLNYA — ada di barisnya, dan berubah jadi Batal
     ================================================================ */
  console.log('\n== Tombol "Tidak hadir" di baris Dashboard ==');
  let k = gambar(w, 'viewDashboard');

  const a1 = selAksi(barisId(k, 'A1'));
  cek('baris yang belum dikonfirmasi punya tombolnya', !!a1 && /Tidak hadir/.test(a1.innerHTML),
      a1 ? a1.textContent.trim().slice(0, 90) : 'kolom aksinya tidak ketemu');
  cek('...dan tombolnya mengirim ALFA', !!a1 && /setHadir\([^)]*ALFA/.test(a1.innerHTML),
      a1 ? a1.innerHTML.slice(0, 260) : '');
  /* Baris tabel Dashboard MEMBUKA MODAL DETAIL saat diklik. Tanpa penahan ini,
     menekan "Tidak hadir" justru membuka modal yang tombolnya sudah dicabut. */
  cek('...dan menahan klik barisnya (stopPropagation)',
      !!a1 && /event\.stopPropagation\(\);setHadir\([^)]*ALFA/.test(a1.innerHTML),
      a1 ? a1.innerHTML.slice(0, 260) : '');

  const a3 = selAksi(barisId(k, 'A3'));
  cek('baris yang SUDAH ditandai ALFA menawarkan pembatalan',
      !!a3 && /Batal/.test(a3.innerHTML), a3 ? a3.textContent.trim().slice(0, 90) : '');
  cek('...dan TIDAK menawarkan "Tidak hadir" lagi',
      !!a3 && !/Tidak hadir/.test(a3.innerHTML), a3 ? a3.innerHTML.slice(0, 260) : '');
  cek('...pembatalannya mengosongkan nilainya, bukan menulis HADIR',
      !!a3 && /setHadir\('A3',''\)/.test(a3.innerHTML),
      a3 ? a3.innerHTML.slice(0, 260) : '');
  cek('...dan pembatalannya juga menahan klik barisnya',
      !!a3 && /event\.stopPropagation\(\);setHadir\('A3',''\)/.test(a3.innerHTML));
  /* Pil status di kolom sebelahnya TETAP menyebut keadaannya — itu yang
     membuat tombol "Batal" bisa dibaca sebagai membatalkan APA. */
  cek('pil statusnya menyebut "Tidak hadir"',
      /Tidak hadir/.test((barisId(k, 'A3') || { textContent: '' }).textContent));

  /* Tanggal yang belum lewat: aturannya ada DI DALAM tombolAlfa(), jadi
     pemanggil berikutnya tidak perlu tahu aturannya ada. */
  console.log('\n== Aturannya di dalam tombolnya, bukan di pemanggilnya ==');
  sama('shift BESOK tidak ditawari tombolnya',
       w.eval("tombolAlfa(S.ajuan.filter(x=>x.id==='A9')[0])"), '');
  cek('shift KEMARIN ditawari',
      /Tidak hadir/.test(w.eval("tombolAlfa(S.ajuan.filter(x=>x.id==='A1')[0])")));
  /* Gerbangnya di FUNGSINYA. Tidak menggambar tombol bukan penjagaan: onclick
     di baris tabel bisa dipanggil dari console dalam sepuluh detik. */
  w.eval("S.peran={hrd:false,head:true,lihat:true,divisi:['kitchen']}; ME.admin=false;");
  sama('yang tidak berhak tidak mendapat tombolnya',
       w.eval("tombolAlfa(S.ajuan.filter(x=>x.id==='A1')[0])"), '');
  w.eval("S.peran={hrd:true,head:false,lihat:true,admin:true,divisi:[]}; ME.admin=true;");

  /* ================================================================
     2. ESTIMASI DI DASHBOARD
     ================================================================ */
  console.log('\n== Dashboard: estimasi mengikuti kehadiran ==');
  k = gambar(w, 'viewDashboard');
  sama('Est. Biaya membuang yang tidak hadir', angkaStat(k, 'Est. Biaya'), w.eval('rp(300000)'));
  sama('Total Jam membuang yang tidak hadir', angkaStat(k, 'Total Jam'), '15');
  /* Kartu jumlah orang TETAP penuh — ia sama dengan jumlah baris di tabel di
     bawahnya, dan kartu yang tidak cocok dengan tabelnya sendiri berhenti
     dipercaya. */
  sama('"DW Masuk" tetap menghitung seluruh yang disetujui', angkaStat(k, 'DW Masuk'), '4');

  console.log('\n== Angka yang menyusut menyebut sebabnya ==');
  cek('kartu Est. Biaya menyebut berapa yang tidak dihitung',
      /1 tidak hadir/.test(subStat(k, 'Est. Biaya')), JSON.stringify(subStat(k, 'Est. Biaya')));
  cek('kartu DW Masuk menyebut berapa yang tidak hadir',
      /1 tidak hadir/.test(subStat(k, 'DW Masuk')), JSON.stringify(subStat(k, 'DW Masuk')));

  /* Tanpa satu pun ALFA, keterangannya TIDAK digambar: keterangan yang selalu
     muncul berhenti dibaca, dan "0 tidak hadir" membuat orang mencari orang
     yang memang tidak ada. */
  w.eval("S.ajuan.filter(x=>x.id==='A3')[0].hadir='';");
  const kPenuh = gambar(w, 'viewDashboard');
  sama('tanpa ALFA, estimasinya penuh lagi', angkaStat(kPenuh, 'Est. Biaya'), w.eval('rp(400000)'));
  sama('...dan jamnya penuh lagi', angkaStat(kPenuh, 'Total Jam'), '20');
  sama('...dan keterangannya tidak digambar', subStat(kPenuh, 'Est. Biaya'), '');
  w.eval("S.ajuan.filter(x=>x.id==='A3')[0].hadir='ALFA';");

  /* TELAT dan KOSONG sama-sama dibayar, dan itu keputusan yang tercatat —
     kalau salah satunya ikut dibuang, angkanya jatuh ke Rp200.000. */
  console.log('\n== Yang TETAP dibayar ==');
  sama('TELAT dibayar penuh', w.eval("hadirDibayar({hadir:'TELAT'})"), true);
  sama('belum dikonfirmasi TETAP dibayar', w.eval("hadirDibayar({hadir:''})"), true);
  sama('hanya ALFA yang tidak', w.eval("hadirDibayar({hadir:'ALFA'})"), false);

  /* ================================================================
     3. ESTIMASI DI KALENDER DW
     ================================================================ */
  /* ANGKANYA SENGAJA BERBEDA dari Dashboard, dan itu bukan kelalaian fixture:
     kalender menghitung SEBULAN (5 shift, termasuk yang besok) sementara
     Dashboard menghitung SATU HARI (4 shift). Dipaksa sama, mutasi "kalender
     membaca daftar milik Dashboard" tidak menggeser satu angka pun.
       benar              -> Rp400.000 / 20 jam
       ALFA ikut dihitung -> Rp500.000 / 25 jam */
  console.log('\n== Kalender DW memakai angka yang SAMA ==');
  const kal = gambar(w, 'viewKalender');
  sama('Est. Biaya kalender membuang yang tidak hadir',
       angkaStat(kal, 'Est. Biaya'), w.eval('rp(400000)'));
  sama('Total Jam kalender membuang yang tidak hadir', angkaStat(kal, 'Total Jam'), '20');
  sama('"Shift Disetujui" tetap penuh', angkaStat(kal, 'Shift Disetujui'), '5');
  cek('kalender juga menyebut berapa yang tidak dihitung',
      /1 tidak hadir/.test(subStat(kal, 'Est. Biaya')), JSON.stringify(subStat(kal, 'Est. Biaya')));

  /* ================================================================
     4. KAKI BERKAS EXCEL — dibaca dari berkasnya sendiri
     ================================================================
     Berkas ekspor tidak pernah dibuka siapa pun untuk memeriksa apa ia
     menyembunyikan sesuatu; ia justru yang dikirim ke luar. ZIP-nya metode
     SIMPAN (lihat komentar di atas xlsxZip), jadi teks lembarnya ada apa
     adanya di dalam blob dan bisa dibaca tanpa membongkar apa pun. */
  console.log('\n== Kaki berkas Excel kalender ==');
  w.eval('window.__xlsx=null; (function(){ var B=window.Blob;'
    + ' window.Blob=function(parts,opt){ window.__xlsx=parts; return new B(parts,opt); }; })();');
  w.eval('exportExcelDW();');
  const parts = w.__xlsx;
  let xls = '';
  if (parts && parts[0]) xls = Buffer.from(parts[0].buffer || parts[0]).toString('latin1');
  cek('berkasnya benar-benar dibuat', xls.length > 500, 'panjang=' + xls.length);
  if (xls.length > 500) {
    cek('estimasinya membuang yang tidak hadir',
        /estimasi Rp\s?400\.000/.test(xls),
        (xls.match(/estimasi Rp[^<]{0,14}/) || ['tidak ketemu'])[0]);
    cek('...bukan angka penuhnya', xls.indexOf('500.000') < 0,
        (xls.match(/[^<]{0,24}500\.000/) || [''])[0]);
    cek('jamnya ikut membuang yang tidak hadir', xls.indexOf('20 jam') > -1,
        (xls.match(/\d+ jam/) || ['tidak ketemu'])[0]);
    cek('...dan berkasnya MENYEBUT berapa yang tidak dihitung',
        xls.indexOf('1 tidak hadir (tidak dihitung)') > -1,
        (xls.match(/[^<]{0,40}tidak dihitung/) || ['tidak ketemu'])[0]);
    cek('jumlah shift disetujui TETAP disebut penuh', xls.indexOf('5 shift disetujui') > -1,
        (xls.match(/\d+ shift disetujui/) || ['tidak ketemu'])[0]);
  }

  /* ================================================================
     5. ringkasAjuan() SENGAJA TIDAK IKUT
     ================================================================ */
  console.log('\n== "Setujui semua" tetap menghitung SELURUHNYA ==');
  /* Pada detik persetujuan belum seorang pun hadir atau tidak hadir. Kalau
     ringkasan ini ikut mengikuti kehadiran, hari ini ia kebetulan benar (semua
     kosong = dibayar) dan besok diam-diam salah — kotak konfirmasi menyebut
     angka yang lebih kecil daripada yang disanggupi. */
  sama('upahnya menghitung yang ALFA sekalipun',
       w.eval("ringkasAjuan(['A1','A2','A3','A4']).upah"), 400000);
  sama('...dan jumlah shiftnya utuh', w.eval("ringkasAjuan(['A1','A2','A3','A4']).n"), 4);

  /* ================================================================
     6. INVARIAN — satu penjumlah, bukan tiga
     ================================================================
     Ini yang akan menangkap tempat KEEMPAT yang ditambahkan nanti, bukan
     daftar nama yang harus diingat orang. */
  console.log('\n== Invarian: tidak ada penjumlah kedua ==');
  /* UANG: tidak ada satu pun penjumlahan biaya yang sah tanpa mengikuti
     kehadiran, jadi aturannya global dan keras. (ringkasAjuan() memakai `+=`,
     bukan reduce, dan pengecualiannya sudah diuji di blok sebelumnya.) */
  const reduceBiaya = (KODE.match(/reduce\([^;]{0,90}biayaAjuan\(/g) || []);
  sama('biayaAjuan hanya dijumlahkan di biayaListDW()', reduceBiaya.length, 1);

  /* JAM: aturannya TIDAK bisa global. `statistikDW()` menjumlahkan jam kerja
     seorang DW di profilnya, dan yang ditanya di sana "berapa kali ia
     DIJADWALKAN" — bukan berapa yang dibayar; aturan yang sama dengan kolom
     `masuk` di Rekap Pegawai. Jadi yang dikunci KETIGA LAYAR ESTIMASI-nya:
     tidak satu pun boleh menjumlahkan sendiri. */
  const badan = nama => {
    const i = KODE.indexOf('function ' + nama + '(');
    if (i < 0) return '';
    const j = KODE.indexOf('\n}', i);
    return j < 0 ? KODE.slice(i) : KODE.slice(i, j);
  };
  ['viewDashboard', 'viewKalender', 'exportExcelDW'].forEach(function (fn) {
    const b = badan(fn);
    /* Yang dilarang MENJUMLAHKANNYA. `biayaAjuan(a)` per baris di kolom Upah
       Dashboard memang benar — ia nominal satu shift, bukan estimasi. */
    cek(fn + '() tidak menjumlahkan biayanya sendiri',
        b.length > 200 && !/reduce\([^;]{0,90}biayaAjuan\(/.test(b),
        (b.match(/[^\n]{0,60}reduce\([^\n]{0,40}biayaAjuan\(/) || ['badan=' + b.length])[0]);
    cek(fn + '() tidak menjumlahkan jamnya sendiri',
        b.length > 200 && !/reduce\([^;]{0,90}durasiJam\(/.test(b),
        (b.match(/[^\n]{0,60}durasiJam\([^\n]{0,20}/) || ['badan=' + b.length])[0]);
  });

  cek('...dan penjumlah itu memang yang menyaring kehadiran',
      /function biayaListDW\(list\)\{ return ajuanDibayarDW\(list\)\.reduce/.test(KODE)
      && /function jamListDW\(list\)\{ return ajuanDibayarDW\(list\)\.reduce/.test(KODE));
  cek('penyaringnya memakai hadirDibayar, bukan aturan kedua',
      /function ajuanDibayarDW\(list\)\{ return \(list\|\|\[\]\)\.filter\(hadirDibayar\); \}/.test(KODE));
  /* Halaman Pembayaran & rekap beban sudah memakai predikat yang sama sejak
     15 September 2026 — kalau salah satunya berpindah ke aturan lain, dua
     layar menyebut siapa yang dibayar dengan cara yang berbeda. */
  sama('halaman uang lain tetap memakai predikat yang sama',
       (KODE.match(/hadirDibayar/g) || []).length >= 4, true);

  console.log('\n== Sumber: tombolnya dipasang di barisnya ==');
  cek('kolom aksi Dashboard memuat ketiga tombolnya',
      /tombolWA\(a\)\+tombolAlfa\(a\)\+tombolKehadiran\(a\)/.test(KODE));
  cek('tombolAlfa() cuma didefinisikan sekali',
      (KODE.match(/function tombolAlfa\(/g) || []).length === 1);

  /* ================================================================
     7. setHadir() dari baris: apa yang BERANGKAT
     ================================================================ */
  console.log('\n== Menekan tombolnya benar-benar mengirim ALFA ==');
  /* setHadir() SELESAI dengan muatDanGambar(true), dan server tiruan di sini
     memulangkan daftar KOSONG — jadi sesudah satu panggilan, `S.ajuan` habis
     dan panggilan berikutnya berhenti diam-diam di `if(!a) return`. Asersinya
     lalu hijau apa pun keputusan kodenya. Fixture karena itu dipasang ULANG
     tiap kali, dan barisnya dipastikan ADA lebih dulu. */
  w.__post.length = 0;
  pasangData(w);
  sama('barisnya memang ada sebelum ditekan',
       w.eval("(S.ajuan||[]).filter(x=>x.id==='A1').length"), 1);
  await w.eval("setHadir('A1','ALFA')");
  const p = w.__post.filter(x => x && x.action === 'simpanHadir');
  sama('satu POST simpanHadir berangkat', p.length, 1);
  if (p.length) {
    sama('...untuk baris yang ditekan', p[0].id, 'A1');
    sama('...dengan nilai ALFA', p[0].hadir, 'ALFA');
  }

  w.__post.length = 0;
  pasangData(w);
  sama('baris ALFA memang ada sebelum dibatalkan',
       w.eval("(S.ajuan||[]).filter(x=>x.id==='A3' && x.hadir==='ALFA').length"), 1);
  await w.eval("setHadir('A3','')");
  const p2 = w.__post.filter(x => x && x.action === 'simpanHadir');
  cek('pembatalannya mengirim nilai KOSONG', p2.length === 1 && p2[0].hadir === '',
      JSON.stringify(p2[0] || null));
  cek('...untuk baris yang ditekan', p2.length === 1 && p2[0].id === 'A3');

  /* Nilai kosong BUKAN "hadir" — ia kembali ke BELUM DIKONFIRMASI, dan bedanya
     nyata: yang belum dikonfirmasi ikut di lencana "Belum dikonfirmasi".
     Sebelum tombol Batal ada, nilai kosong memang tidak pernah bisa dikirim
     dari layar mana pun, jadi cabang ini tidak pernah salah — sekarang bisa. */
  console.log('\n== Pesannya membedakan "hadir" dari "dibatalkan" ==');
  cek('setHadir() punya cabang HADIR tersendiri', /nilai==='HADIR' \?/.test(KODE));
  cek('...dan nilai kosong berbunyi dibatalkan',
      /Penandaan dibatalkan/.test(KODE) && !/: 'Ditandai hadir'\);/.test(KODE));

  console.log('\n' + ok + ' OK, ' + gagal + ' GAGAL');
  dom.window.close();
  process.exit(gagal ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
