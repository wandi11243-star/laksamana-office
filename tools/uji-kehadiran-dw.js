/* Uji KONFIRMASI KEHADIRAN & PENGGANTI di modul Daily Worker
   (deploy/dw/ + dw-mysql/), permintaan user 15 September 2026.

   BERKAS UJI PERTAMA untuk modul ini. `smoke-modul.js dw` merender halamannya
   dan melaporkan "OK", tapi ia hanya membuktikan tidak ada yang melempar —
   seluruh aritmetika upah di sana lewat tanpa satu baris pun dijalankan.

   YANG DIJAGA, dan semuanya gagal sebagai UANG bukan sebagai galat:

     - Yang ditandai TIDAK HADIR tidak ikut dibayar.
     - Yang BELUM DIKONFIRMASI **tetap** dibayar. Ini yang paling mudah
       "dirapikan" jadi sebaliknya, dan akibatnya seluruh riwayat pembayaran
       yang sudah ada — kolomnya kosong semua — berubah jadi Rp0 dalam sekali
       deploy. Jumlahnya tetap disebut di layar supaya tidak diam-diam lolos.
     - TELAT dibayar PENUH: potongan telat adalah aturan upah yang belum
       pernah diputuskan siapa pun.
     - Rekap Pegawai dan Pembayaran memakai penentu yang SAMA (hadirDibayar).
     - Head hanya boleh menyentuh divisinya sendiri.

   PHP TIDAK BISA DIJALANKAN di mesin pengembangan (lihat catatan di
   uji-simpan-basi.js), jadi sisi server dijaga sebagai KONTRAK atas sumbernya:
   nama aksi, gerbang, dan urutan operasi di dalam transaksinya. Tiruan yang
   bentuknya beda dari yang ditiru tidak menguji apa pun — pelajaran yang sudah
   dibayar di stub hpp.php pada uji-analytics. */
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

const HTML = fs.readFileSync(path.join(ROOT, 'deploy', 'dw', 'index.html'), 'utf8');
const LIB  = fs.readFileSync(path.join(ROOT, 'dw-mysql', 'lib_dw_mysql.php'), 'utf8');
const API  = fs.readFileSync(path.join(ROOT, 'dw-mysql', 'api.php'), 'utf8');

let ok = 0, gagal = 0;
const cek = (n, s, k) => {
  if (s) { ok++; console.log('  OK   ' + n); }
  else { gagal++; console.log('  GAGAL ' + n + (k ? '  -> ' + k : '')); }
};
const sama = (n, d, h) => cek(n, d === h, 'dapat ' + JSON.stringify(d) + ', harusnya ' + JSON.stringify(h));
const tunggu = ms => new Promise(r => setTimeout(r, ms));

/* Semua POST dicatat: yang diuji bukan cuma layarnya berubah, tapi bahwa
   permintaan yang benar BERANGKAT ke server dengan muatan yang benar. */
const kirim = [];

function bukaModul() {
  const vc = new VirtualConsole();
  vc.on('jsdomError', e => {
    const t = String((e && e.detail && e.detail.stack) || (e && e.message) || e);
    if (!/Not implemented|Could not parse CSS/.test(t)) console.log('  !! ' + t.split('\n')[0]);
  });
  const dom = new JSDOM(HTML, {
    url: 'https://dev.laksamanamuda.id/dw/',
    runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(w) {
      w.localStorage.setItem('lm_session', JSON.stringify({
        id: 'u-uji', userId: 'u-uji', name: 'Penguji', token: 't',
        modules: ['dw'], adminModules: ['dw'], expiry: Date.now() + 86400000,
      }));
      w.alert = () => {}; w.confirm = () => true; w.print = () => {};
      w.scrollTo = () => {};
      /* window.open dicatat, bukan dibuka — itulah jalur tombol Chat. */
      w.__buka = [];
      w.open = (url) => { w.__buka.push(String(url)); return null; };
      w.fetch = async (url, init) => {
        const u = String(url);
        const body = (init && init.body) ? JSON.parse(init.body) : {};
        if (init && init.method === 'POST' && body.action) kirim.push(body);
        const balas = o => ({ ok: true, status: 200,
          text: async () => JSON.stringify(o), json: async () => o });
        if (/account-api/.test(u)) return balas({ ok: true, members: [] });
        if (/jadwal-api/.test(u))  return balas({ ok: true, data: { headIds: [] } });
        /* Modul tamu (marketing/event/reservasi) sengaja dibalas kosong:
           kalender tamu tidak ada hubungannya dengan yang diuji di sini. */
        if (/-api-mysql/.test(u) && !/dw-api-mysql/.test(u)) {
          return balas({ ok: true, data: { events: [], clients: [], reservations: [] } });
        }
        return balas({ ok: true, data: { pekerja: [], ajuan: [], permintaan: [], setting: {},
                                         peran: { hrd: true, head: false, lihat: true, admin: true, divisi: [] } } });
      };
    },
  });
  return dom;
}

async function siap(w) {
  for (let i = 0; i < 200; i++) {
    try { if (w.eval('typeof S !== "undefined" && !!S && typeof viewHadir === "function"')) return; }
    catch (e) {}
    await tunggu(50);
  }
  throw new Error('modul DW tidak pernah siap');
}

/* Data uji dipasang LEWAT normalizeState(), bukan disuntikkan mentah ke S:
   itulah jalur yang dilewati data sungguhan, dan justru di sanalah kolom
   kehadiran sempat dibuang diam-diam selama sebulan. */
function pasangData(w, opsi) {
  const o = opsi || {};
  const kemarin = w.eval('addD(hariIni(),-1)');
  const besok   = w.eval('addD(hariIni(),1)');
  const data = {
    peran: o.peran || { hrd: true, head: false, lihat: true, admin: true, divisi: [] },
    setting: { tarif: { 'Bartender': 100000 }, jamDasar: 6, tambahanPanjang: 20000 },
    pekerja: [
      { id: 'P1', nama: 'Andi',  hp: '081234567890', divisi: 'bar', posisi: 'Bartender', status: 'AKTIF' },
      { id: 'P2', nama: 'Budi',  hp: '081200000002', divisi: 'bar', posisi: 'Bartender', status: 'AKTIF' },
      { id: 'P3', nama: 'Citra', hp: '',             divisi: 'bar', posisi: 'Bartender', status: 'AKTIF' },
      { id: 'P4', nama: 'Dewi',  hp: '081200000004', divisi: 'kitchen', posisi: 'Bartender', status: 'AKTIF' },
    ],
    ajuan: [
      /* Kehadiran KOSONG — bentuk seluruh baris yang sudah ada di produksi. */
      { id: 'A1', dwId: 'P1', tgl: kemarin, m: '18:00', s: '23:00',
        divisi: 'bar', posisi: 'Bartender', status: 'DISETUJUI', hadir: '' },
      /* TIDAK HADIR — tidak boleh ikut dibayar. */
      { id: 'A2', dwId: 'P2', tgl: kemarin, m: '18:00', s: '23:00',
        divisi: 'bar', posisi: 'Bartender', status: 'DISETUJUI', hadir: 'ALFA',
        hadirNota: 'Sakit', hadirOleh: 'HRD', hadirAt: 1700000000000 },
      /* HADIR. */
      { id: 'A3', dwId: 'P3', tgl: kemarin, m: '18:00', s: '23:00',
        divisi: 'bar', posisi: 'Bartender', status: 'DISETUJUI', hadir: 'HADIR' },
      /* TELAT — dibayar PENUH. */
      { id: 'A4', dwId: 'P4', tgl: kemarin, m: '18:00', s: '23:00',
        divisi: 'kitchen', posisi: 'Bartender', status: 'DISETUJUI', hadir: 'TELAT' },
      /* Belum disetujui: tidak pernah masuk hitungan apa pun. */
      { id: 'A5', dwId: 'P1', tgl: besok, m: '18:00', s: '23:00',
        divisi: 'bar', posisi: 'Bartender', status: 'MENUNGGU', hadir: '' },
    ],
    permintaan: [],
  };
  w.eval('S = normalizeState(' + JSON.stringify(data) + '); HADIR_TGL=' + JSON.stringify(kemarin) + ';');
  return { kemarin, besok };
}

(async () => {
  console.log('\n== Kolom kehadiran dibaca lagi ==');
  const dom = bukaModul();
  const w = dom.window;
  await siap(w);
  const T = pasangData(w);

  const a2 = JSON.parse(w.eval('JSON.stringify((S.ajuan||[]).find(x=>x.id==="A2"))'));
  cek('normalizeState membawa hadir', a2 && a2.hadir === 'ALFA', JSON.stringify(a2));
  cek('...berikut catatannya', a2 && a2.hadirNota === 'Sakit');
  cek('...siapa yang mencatat', a2 && a2.hadirOleh === 'HRD');
  /* hadirAt sempat tidak ikut sama sekali: layar punya namanya tapi tidak
     pernah punya jamnya, dan "dicatat oleh siapa" tanpa kapan tidak bisa
     ditanyakan kembali. */
  sama('...DAN WAKTUNYA', a2 && a2.hadirAt, 1700000000000);

  console.log('\n== Siapa yang dibayar ==');
  const bayar = w.eval('hadirDibayar');
  cek('yang TIDAK HADIR tidak dibayar', bayar({ hadir: 'ALFA' }) === false);
  cek('yang HADIR dibayar',             bayar({ hadir: 'HADIR' }) === true);
  cek('yang TELAT dibayar PENUH',       bayar({ hadir: 'TELAT' }) === true);
  /* INVARIAN PALING MENENTUKAN DI BERKAS INI. Dibalik, seluruh riwayat
     pembayaran produksi jadi Rp0 dalam sekali deploy. */
  cek('yang BELUM DIKONFIRMASI tetap dibayar', bayar({ hadir: '' }) === true);

  console.log('\n== Halaman Pembayaran ==');
  const senin = w.eval('seninDari(' + JSON.stringify(T.kemarin) + ')');
  const rb = JSON.parse(w.eval('JSON.stringify(rekapBayar(' + JSON.stringify(senin) + '))'));
  const byId = k => rb.find(x => x.id === k) || null;
  cek('yang tidak hadir TIDAK punya baris upah',
      !byId('P2') || byId('P2').total === 0, JSON.stringify(byId('P2')));
  sama('...dan dihitung sebagai alfa', byId('P2') ? byId('P2').alfa : 0, 1);
  sama('yang hadir dibayar', byId('P3') ? byId('P3').total : 0, 100000);
  sama('yang telat dibayar PENUH', byId('P4') ? byId('P4').total : 0, 100000);
  sama('yang belum dikonfirmasi tetap dibayar', byId('P1') ? byId('P1').total : 0, 100000);
  sama('...dan ditandai belum', byId('P1') ? byId('P1').belum : 0, 1);

  w.eval('BAYAR_MINGGU=' + JSON.stringify(senin) + ';');
  const vb = w.eval('viewBayar()');
  cek('halaman Pembayaran menyebut yang tidak ikut dibayar',
      /tidak ikut dibayar/.test(vb) && /1 shift/.test(vb), vb.slice(0, 200));
  cek('...dan menyebut yang belum dikonfirmasi',
      /belum dikonfirmasi/.test(vb), vb.slice(0, 200));
  /* Kalimat kakinya ikut: janji "hanya yang sudah disetujui" sudah tidak
     lengkap sejak kehadiran ikut menentukan. */
  cek('...kalimat kakinya menyebut syarat barunya',
      /tidak ditandai tidak hadir/.test(vb));

  console.log('\n== Rekap Pegawai memakai penentu yang SAMA ==');
  const bln = w.eval('bulanDari(' + JSON.stringify(T.kemarin) + ')');
  const r2 = JSON.parse(w.eval('JSON.stringify(rekapBebanDW("P2",' + JSON.stringify(bln) + '))'));
  sama('upah yang tidak hadir nol di Rekap', r2.upah, 0);
  sama('...tapi tetap terhitung PERNAH dijadwalkan', r2.masuk, 1);
  sama('...dan alfanya disebut', r2.alfa, 1);
  const r1 = JSON.parse(w.eval('JSON.stringify(rekapBebanDW("P1",' + JSON.stringify(bln) + '))'));
  sama('yang belum dikonfirmasi tetap berupah di Rekap', r1.upah, 100000);

  console.log('\n== Halaman Konfirmasi Kehadiran ==');
  const vh = w.eval('viewHadir()');
  cek('halaman tergambar', /Belum dikonfirmasi/.test(vh), vh.slice(0, 160));
  cek('memuat yang disetujui hari itu', /Andi/.test(vh) && /Budi/.test(vh) && /Citra/.test(vh));
  cek('TIDAK memuat yang masih menunggu', !/A5/.test(vh));
  cek('tombol Hadir / Telat / Tidak hadir ada',
      /setHadir\([^)]*HADIR/.test(vh) && /setHadir\([^)]*TELAT/.test(vh) && /setHadir\([^)]*ALFA/.test(vh));
  cek('tombol Ganti orang ada', /bukaGantiOrang\(/.test(vh));
  /* Yang sudah ditandai tidak boleh bisa ditandai ulang dengan nilai yang
     sama — tombol yang tidak melakukan apa pun terbaca sebagai rusak. */
  cek('nilai yang sedang berlaku tombolnya dimatikan', /disabled/.test(vh));

  console.log('\n== Tombol Chat (WhatsApp) ==');
  sama('nomor 08 diubah ke 62', w.eval('waNomor("081234567890")'), '6281234567890');
  const teks = w.eval('waTeksAjuan((S.ajuan||[]).find(x=>x.id==="A1"))');
  cek('pesannya menyebut nama', /Andi/.test(teks), teks.slice(0, 80));
  /* TANGGAL DAN JAM IKUT DIISIKAN. Yang mengetiknya ulang untuk sepuluh orang
     akan salah pada salah satunya, dan DW yang datang di jam yang salah tetap
     harus dibayar. */
  cek('...tanggalnya', teks.indexOf(w.eval('tglPanjang(' + JSON.stringify(T.kemarin) + ')')) > -1);
  cek('...dan jamnya', /18:00/.test(teks) && /23:00/.test(teks), teks);
  w.eval('waAjuan("A1")');
  const dibuka = w.eval('JSON.stringify(window.__buka)');
  cek('membuka wa.me dengan nomor yang benar',
      /wa\.me\/6281234567890/.test(dibuka), dibuka.slice(0, 120));
  cek('...berikut pesannya', /text=/.test(dibuka));
  /* Nomor kosong DIKATAKAN, bukan membuka wa.me yang memulangkan halaman
     galat WhatsApp — yang membacanya menyimpulkan WhatsApp-nya yang rusak. */
  const sebelum = JSON.parse(w.eval('JSON.stringify(window.__buka)')).length;
  w.eval('waAjuan("A3")');
  sama('yang nomornya kosong TIDAK membuka wa.me',
       JSON.parse(w.eval('JSON.stringify(window.__buka)')).length, sebelum);
  cek('...dan barisnya menyebut nomornya kosong', /no\. HP kosong/.test(vh), vh.slice(0, 200));

  console.log('\n== Menandai kehadiran benar-benar dikirim ==');
  kirim.length = 0;
  await w.eval('setHadir("A1","HADIR")');
  await tunggu(120);
  const pk = kirim.find(x => x.action === 'simpanHadir');
  cek('simpanHadir dikirim', !!pk, JSON.stringify(kirim));
  sama('...untuk shift yang benar', pk && pk.id, 'A1');
  sama('...dengan nilai yang benar', pk && pk.hadir, 'HADIR');

  console.log('\n== Ganti orang ==');
  kirim.length = 0;
  await w.eval('gantiOrangKirim("A1","P2","sakit")');
  await tunggu(120);
  const pg = kirim.find(x => x.action === 'gantiOrang');
  cek('gantiOrang dikirim', !!pg, JSON.stringify(kirim));
  sama('...shift yang diganti', pg && pg.id, 'A1');
  sama('...penggantinya', pg && pg.dwBaru, 'P2');
  sama('...berikut alasannya', pg && pg.nota, 'sakit');
  /* Tanpa pengganti terpilih tidak boleh ada yang berangkat: permintaan
     setengah jadi ditolak server dengan pesan yang datang sesudah modal
     tertutup, dan yang menekannya mengira sudah tersimpan. */
  kirim.length = 0;
  await w.eval('gantiOrangKirim("A1","","")');
  await tunggu(60);
  sama('pengganti kosong tidak dikirim ke server',
       kirim.filter(x => x.action === 'gantiOrang').length, 0);

  dom.window.close();

  console.log('\n== Head hanya divisinya sendiri ==');
  {
    const d2 = bukaModul(); const w2 = d2.window;
    await siap(w2);
    pasangData(w2, { peran: { hrd: false, head: true, lihat: true, admin: false, divisi: ['bar'] } });
    const bk = w2.eval('bolehKonfirmasi');
    const aBar = JSON.parse(w2.eval('JSON.stringify((S.ajuan||[]).find(x=>x.id==="A1"))'));
    const aKit = JSON.parse(w2.eval('JSON.stringify((S.ajuan||[]).find(x=>x.id==="A4"))'));
    cek('head Bar boleh menandai shift Bar', bk(aBar) === true);
    cek('...tapi TIDAK shift Kitchen', bk(aKit) === false);
    /* Bukan cuma tombolnya: shift divisi lain tidak boleh ikut di daftar sama
       sekali, kalau tidak angka "belum dikonfirmasi" di layarnya tidak pernah
       bisa nol. */
    const vh2 = w2.eval('viewHadir()');
    cek('shift divisi lain tidak digambar untuk head', !/Dewi/.test(vh2), vh2.slice(0, 200));
    cek('...shift divisinya sendiri tetap digambar', /Andi/.test(vh2));
    /* Yang MENUNGGU tidak bisa ditandai: kehadiran di baris yang belum
       dijadwalkan tidak berarti apa pun, dan servernya pun menolak. */
    const aMenunggu = JSON.parse(w2.eval('JSON.stringify((S.ajuan||[]).find(x=>x.id==="A5"))'));
    cek('yang masih MENUNGGU tidak bisa ditandai', bk(aMenunggu) === false);
    d2.window.close();
  }

  console.log('\n== Kontrak dengan dw-mysql (PHP tidak bisa dijalankan di sini) ==');
  cek('aksi gantiOrang ada di api.php', /case 'gantiOrang':/.test(API));
  cek('ganti_orang ada di lib', /function ganti_orang\(/.test(LIB));
  /* GERBANGNYA: bukan wajib_hrd. Yang tahu siapa datang adalah head di lokasi;
     dijaga per DIVISI baris itu, bukan per modul. */
  cek('kehadiran memakai gerbang wajib_hadir', /case 'simpanHadir': \{\s*\r?\n\s*\$u = wajib_hadir\(/.test(API),
      'masih wajib_hrd — head tidak akan pernah bisa menandai kehadiran');
  cek('ganti orang memakai gerbang yang sama', /case 'gantiOrang': \{\s*\r?\n\s*\$u = wajib_hadir\(/.test(API));
  cek('wajib_hadir membaca divisi dari BARIS, bukan dari kiriman layar',
      /function wajib_hadir[\s\S]*?ajuan_by_id\(\$id\)[\s\S]*?wajib_minta\(\$body, \$a \? \(string\)\$a\['divisi'\] : ''\)/.test(API));

  /* Isi ganti_orang — badannya dipotong dulu supaya pencarian tidak nyasar ke
     fungsi di bawahnya. Bentuk kesalahan yang sudah dibayar di
     uji-hilang-marketing.js. */
  const iG = LIB.indexOf('function ganti_orang(');
  const badan = LIB.slice(iG, LIB.indexOf('\nfunction ', iG + 10));
  /* Literal SQL di dalam string PHP bertanda kutip tunggal ditulis TER-ESCAPE
     (\'ALFA\'), jadi yang dicari substring apa adanya — bukan pola yang
     mengira kutipnya polos. Versi pertama asersi ini merah untuk kode yang
     benar justru karena itu. */
  cek('yang digantikan ditandai TIDAK HADIR, bukan dihapus',
      badan.indexOf("`hadir`=\\'ALFA\\'") > -1 && !/DELETE FROM `dw_ajuan`/.test(badan),
      'ditandai ALFA? ' + (badan.indexOf('ALFA') > -1));
  cek('penggantinya lahir sebagai baris SENDIRI yang sudah disetujui & hadir',
      /INSERT INTO `dw_ajuan`/.test(badan)
      && badan.indexOf("\\'DISETUJUI\\'") > -1
      && badan.indexOf("\\'HADIR\\'") > -1);
  /* permintaan_id ikut: tanpa itu permintaan head berbunyi "terpenuhi 0 dari
     1" begitu orangnya diganti, dan HRD menugaskan orang KEDUA.

     YANG DIPERIKSA DAFTAR KOLOM INSERT-nya, bukan sekadar ada-tidaknya kata
     `permintaan_id` di badan fungsi: kata itu juga hidup di baris yang
     MEMBACANYA dari ajuan lama ($pm = ...), jadi asersi yang menyapu seluruh
     badan tetap hijau walau kolomnya dicabut dari INSERT. Mutasi itu memang
     LOLOS di putaran pertama. */
  {
    const iIns2 = badan.indexOf('INSERT INTO `dw_ajuan`');
    const kolom = badan.slice(iIns2, badan.indexOf('VALUES', iIns2));
    const nilai = badan.slice(badan.indexOf('VALUES', iIns2), badan.indexOf("');", iIns2));
    cek('permintaan_id ikut di DAFTAR KOLOM baris pengganti', kolom.indexOf('permintaan_id') > -1, kolom);
    cek('...dan nilainya ikut dikirim', nilai.indexOf(':pm') > -1, nilai);
  }
  cek('keduanya dalam SATU transaksi',
      /beginTransaction\(\)/.test(badan) && /commit\(\)/.test(badan) && /rollBack\(\)/.test(badan));
  /* YANG DIPERIKSA HASILNYA DIPAKAI, bukan sekadar teks panggilannya ada di
     badan fungsi. Mutasi \`$B = null && bentrok_ajuan_row(...)\` meninggalkan
     teks panggilannya UTUH — yang dibuang hasilnya — jadi asersi yang cuma
     mencari namanya tetap hijau. Mutasi itu memang LOLOS di putaran pertama. */
  cek('bentrok jam penggantinya tetap diperiksa',
      /\$B\s*=\s*bentrok_ajuan_row\(/.test(badan), badan.slice(badan.indexOf('$B'), badan.indexOf('$B') + 80));
  cek('...dan hasilnya benar-benar menolak, bukan dibuang', /if\s*\(\$B\)/.test(badan));
  cek('hanya shift DISETUJUI yang bisa diganti', /!== 'DISETUJUI'/.test(badan));
  /* PDO::ATTR_EMULATE_PREPARES => false: penanda bernama diikat MENURUT
     POSISI, jadi satu nama yang dipakai dua kali dalam satu prepare() gagal
     dengan SQLSTATE[HY093] yang tidak menyebut kolom apa pun. */
  {
    const iIns = badan.indexOf('INSERT INTO `dw_ajuan`');
    const sql = badan.slice(iIns, badan.indexOf("');", iIns));
    const nama = (sql.match(/:[a-z0-9_]+/gi) || []);
    const unik = new Set(nama);
    sama('tiap penanda bernama dipakai SEKALI di INSERT-nya', nama.length, unik.size);
  }
  cek('kehadiran hanya untuk shift yang sudah disetujui (dijaga server)',
      /function simpan_hadir[\s\S]*?Kehadiran hanya bisa dicatat untuk shift yang sudah disetujui/.test(LIB));
  cek('hadirAt ikut dipulangkan bentuk_ajuan', /'hadirAt' => isset\(\$r\['hadir_at'\]\)/.test(LIB));

  console.log('\n' + ok + ' OK, ' + gagal + ' GAGAL');
  process.exit(gagal ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
