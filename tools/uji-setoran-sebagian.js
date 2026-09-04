/* UJI SETORAN CASH SEBAGIAN + mutasi brankas tanpa setoran (4 September 2026)
 *
 *   node tools/uji-setoran-sebagian.js
 *
 * Dua permintaan user yang saling bersentuhan, dan keduanya gagal DIAM-DIAM
 * kalau salah:
 *
 *   1. Mutasi kas di panel Brankas tidak lagi mendaftar setoran cash. Yang
 *      TIDAK boleh ikut berubah adalah SALDONYA — saldoSemua() membaca
 *      setoranSemua() langsung, bukan lewat daftar mutasi. Kalau suatu hari
 *      ada yang "merapikannya" supaya membaca mutasiSemua(), seluruh setoran
 *      hilang dari saldo tanpa satu pun galat.
 *
 *   2. Setoran boleh sebagian: nominal per hari bisa disunting. Jebakannya
 *      hari yang disetor sebagian lalu dianggap lunas — sisanya lenyap dari
 *      daftar "belum disetor", dan uang yang masih di brankas tidak disebut
 *      satu layar pun.
 *
 * Aturan lunas ada di DUA tempat (layar & server) dan ujinya membaca keduanya
 * dari sumbernya, bukan menuliskan ulang angkanya.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const KAS = path.join(ROOT, 'deploy', 'finance', 'kas', 'index.html');
const BRANKAS = path.join(ROOT, 'deploy', 'finance', 'brankas', 'index.html');
const PHP = path.join(ROOT, 'kompas-mysql', 'lib_kompas_mysql.php');

let JSDOM, VirtualConsole;
try {
  const j = require(process.env.JSDOM_PATH || 'jsdom');
  JSDOM = j.JSDOM; VirtualConsole = j.VirtualConsole;
} catch (e) {
  console.log('LEWAT: jsdom tidak ada. Pasang dulu, atau set JSDOM_PATH.');
  process.exit(0);
}

let ok = 0, gagal = 0;
function cek(nama, syarat, ket) {
  if (syarat) { ok++; console.log('  OK   ' + nama); }
  else { gagal++; console.log('  GAGAL ' + nama + (ket ? '\n         → ' + ket : '')); }
}

/* Tiga hari cash: satu belum disetor sama sekali, satu disetor sebagian
   (bentuk BARU, punya `jumlah`), satu disetor penuh lewat bentuk LAMA (tanpa
   `jumlah` sama sekali) — bentuk terakhir itu yang ada di produksi hari ini. */
const REPORTS = {
  '2026-09-01': { pay: { cash: { actual: 1000000 } } },
  '2026-09-02': { pay: { cash: { actual: 800000 } } },
  '2026-09-03': { pay: { cash: { actual: 500000 } } }
};
const SETORAN = [
  { id: 'st1', tgl: '2026-09-02', tujuan: 'BCA', hari: ['2026-09-02'],
    jumlah: { '2026-09-02': 300000 }, nominal: 300000 },
  /* Baris LAMA: tidak punya `jumlah`. Harus terbaca sebagai setoran PENUH. */
  { id: 'st2', tgl: '2026-09-03', tujuan: 'BRI', hari: ['2026-09-03'], nominal: 500000 }
];

function boot(berkas, url) {
  const html = fs.readFileSync(berkas, 'utf8')
    .replace(/<script[^>]+src=["']https?:[^"']+["'][^>]*><\/script>/g, '');
  const dom = new JSDOM(html, {
    url: url, runScripts: 'dangerously', pretendToBeVisual: true,
    virtualConsole: new VirtualConsole()
  });
  dom.window.fetch = () => new Promise(() => {});   // boot tidak boleh menarik apa pun
  return dom.window;
}

(async () => {
  console.log('=== UJI SETORAN SEBAGIAN & MUTASI BRANKAS ===\n');

  /* ============ 1. Rekap Penjualan: setoran sebagian ============ */
  console.log('== Rekap Penjualan (deploy/finance/kas) ==');
  const w = boot(KAS, 'https://team.laksamanamuda.id/finance/kas/');
  await new Promise(r => setTimeout(r, 500));
  w.eval('DB={reports:' + JSON.stringify(REPORTS) + ',rekap_setoran:' + JSON.stringify(SETORAN) + '};'
       + 'RK_UBAH={}; RK_PILIH={};');

  cek('hari yang belum disentuh: sisa = seluruh cash-nya',
      w.eval("rkSetorSudah('2026-09-01')") === 0 && w.eval("rkSisaSetor('2026-09-01')") === 1000000,
      String(w.eval("rkSisaSetor('2026-09-01')")));

  /* Inti permintaan user: sebagian tetap berdiri di daftar. */
  cek('hari yang disetor SEBAGIAN belum dianggap lunas',
      w.eval("rkSetor('2026-09-02')") === false);
  cek('...dan sisanya dihitung benar',
      w.eval("rkSisaSetor('2026-09-02')") === 500000, String(w.eval("rkSisaSetor('2026-09-02')")));

  /* Baris lama tanpa `jumlah` = setoran penuh. Dianggap nol, seluruh setoran
     yang sudah tercatat muncul lagi sebagai "belum disetor" dan disetorkan
     untuk kedua kalinya. */
  cek('baris LAMA tanpa `jumlah` terbaca sebagai setoran PENUH',
      w.eval("rkSetorSudah('2026-09-03')") === 500000 && w.eval("rkSetor('2026-09-03')") === true,
      String(w.eval("rkSetorSudah('2026-09-03')")));

  const belum = w.eval('rkBelumSetor()');
  cek('daftar belum-setor memuat hari yang baru sebagian',
      belum.map(b => b.tgl).join(',') === '2026-09-01,2026-09-02',
      belum.map(b => b.tgl).join(','));
  cek('barisnya membawa sisa & yang sudah masuk',
      belum[1].sisa === 500000 && belum[1].sudah === 300000,
      JSON.stringify(belum[1]));

  /* ---- mencentang mengisi SISA, bukan cash penuh ---- */
  w.eval("RK_PILIH={}; rkPilihHari('2026-09-02',true);");
  cek('mencentang mengisi sisa hari itu, bukan cash penuhnya',
      w.eval("RK_PILIH['2026-09-02']") === 500000, String(w.eval("RK_PILIH['2026-09-02']")));
  cek('total ikut sisa yang terisi', w.eval('rkTotalPilih()') === 500000);

  /* ---- nominal boleh disunting ---- */
  w.eval("RK_PILIH['2026-09-02']=200000;");
  cek('nominal yang disunting yang dipakai, bukan cash hari itu',
      w.eval('rkTotalPilih()') === 200000, String(w.eval('rkTotalPilih()')));

  /* Nol: dicentang tapi tidak menyetor apa pun. Tidak dibuang diam-diam. */
  w.eval("RK_PILIH['2026-09-02']=0;");
  cek('nominal nol ditahan, bukan dikirim',
      w.eval('rkPilihNol()').length === 1 && w.eval('rkNPilih()') === 1);
  cek('...dan alasannya dikatakan di layar',
      /nominalnya nol/.test(w.eval('rkPeringatanPilih()')), w.eval('rkPeringatanPilih()').slice(0, 160));

  /* Melampaui sisa: DITOLAK, bukan diperingatkan — server menjepitnya ke sisa,
     jadi meneruskannya membuat nominal tersimpan berbeda dari yang diketik. */
  w.eval("RK_PILIH={'2026-09-02':900000};");
  cek('nominal melampaui sisa ditahan', w.eval('rkPilihLebih()').length === 1);
  const pesanLebih = w.eval('rkPeringatanPilih()');
  cek('...dan layar menunjuk Cash Actual sebagai yang perlu dibetulkan',
      /Cash Actual/.test(pesanLebih), pesanLebih.slice(0, 200));
  cek('peringatannya bergaya bad (menahan), bukan warn (memperbolehkan)',
      /notice bad[^>]*>⚠ <b>1 hari nominalnya melampaui/.test(pesanLebih), pesanLebih.slice(0, 200));

  /* Kalau centangnya dilepas seluruhnya, tidak boleh ada peringatan tersisa. */
  w.eval('RK_PILIH={};');
  cek('tanpa pilihan, tidak ada peringatan', w.eval('rkPeringatanPilih()') === '');

  /* ---- yang dikirim ke server ---- */
  let terkirim = null;
  w.eval('rkKirim=function(d,cb){ __KIRIM=d; };');
  w.eval("RK_PILIH={'2026-09-01':400000,'2026-09-02':500000}; RK_TUJUAN='BCA'; RK_JALAN=false; __KIRIM=null; rkCatatSetoran();");
  terkirim = w.eval('__KIRIM');
  cek('nominal per hari ikut terkirim sebagai `jumlah`',
      terkirim && terkirim.setoran.tambah[0].jumlah['2026-09-01'] === 400000 &&
      terkirim.setoran.tambah[0].jumlah['2026-09-02'] === 500000,
      JSON.stringify(terkirim));
  cek('daftar hari tetap ikut (server yang menghitung ulang)',
      terkirim.setoran.tambah[0].hari.join(',') === '2026-09-01,2026-09-02');

  /* Penjagaan tidak boleh cuma lewat tombol yang dimatikan: rkSegarPilih()
     menyentuh DOM, dan sekali saja ia tidak sempat jalan, tombolnya hidup
     dengan pilihan yang tidak sah. */
  w.eval("RK_PILIH={'2026-09-02':900000}; __KIRIM=null; RK_PESAN=''; rkCatatSetoran();");
  cek('rkCatatSetoran menolak sendiri, bukan bergantung tombol yang disabled',
      w.eval('__KIRIM') === null && /melampaui/.test(w.eval('RK_PESAN')),
      w.eval('RK_PESAN').slice(0, 140));
  w.eval("RK_PILIH={'2026-09-02':0}; __KIRIM=null; RK_PESAN=''; rkCatatSetoran();");
  cek('...juga untuk nominal nol', w.eval('__KIRIM') === null && /nol/.test(w.eval('RK_PESAN')));
  w.close();

  /* ============ 2. Brankas: setoran keluar dari daftar mutasi ============ */
  console.log('\n== Brankas: Mutasi & Transfer Wallet ==');
  const b = boot(BRANKAS, 'https://team.laksamanamuda.id/finance/brankas/');
  await new Promise(r => setTimeout(r, 500));
  b.eval('KP={reports:' + JSON.stringify(REPORTS) + ',rekap_setoran:' + JSON.stringify(SETORAN) + '};'
       + 'BK={data:{mutasi:[{id:"m1",tgl:"2026-09-02",jenis:"pindah",dari:"kas",ke:"bca",nominal:70000,ket:"top-up"}],'
       + 'bayar:[],investor:[],setting:{}}};');

  const mut = b.eval('mutasiSemua()');
  cek('setoran cash tidak lagi didaftar sebagai mutasi',
      mut.length === 1 && mut[0].id === 'm1', JSON.stringify(mut.map(m => m.id)));
  cek('mutasi yang diketik sendiri tetap ada', mut[0].ket === 'top-up');
  cek('mutasiSetoran() benar-benar dicabut, bukan sekadar tidak dipanggil',
      b.eval('typeof mutasiSetoran') === 'undefined');

  /* YANG PALING PENTING: saldonya tidak boleh ikut berubah. */
  const s = b.eval('saldoSemua()');
  const kasK = b.eval('KAS_K');
  cek('setoran cash TETAP mengurangi brankas fisik',
      s[kasK].setorKeluar === 800000, JSON.stringify({ setorKeluar: s[kasK].setorKeluar }));
  cek('...dan tetap menambah bank tujuannya',
      s.bca && s.bca.setorMasuk === 300000 && s.bri && s.bri.setorMasuk === 500000,
      JSON.stringify({ bca: s.bca && s.bca.setorMasuk, bri: s.bri && s.bri.setorMasuk }));

  /* Jumlahnya tetap disebut: yang menjumlahkan tabel lalu membandingkannya
     dengan kartu saldo akan menemukan selisih, dan selisih tanpa penjelasan
     adalah selisih yang dicari berjam-jam. */
  const rs = b.eval('setoranRingkas()');
  cek('halaman masih tahu berapa setoran yang tidak didaftarnya',
      rs.n === 2 && rs.total === 800000, JSON.stringify(rs));
  b.eval('document.body.insertAdjacentHTML("beforeend","<div id=\'app-view\'></div>")');
  b.eval('vMutasi()');
  const html = b.document.getElementById('app-view').innerHTML;
  cek('layar menyebut setoran tidak didaftar di sini',
      /tidak didaftar di halaman ini/.test(html), html.slice(0, 300));
  cek('...berikut jumlahnya, supaya selisih dengan kartu saldo terjelaskan',
      html.indexOf('800.000') > -1 || html.indexOf('800,000') > -1);
  cek('...dan menunjuk ke mana tempatnya', /Setoran Cash/.test(html));
  cek('tabel riwayat tidak lagi memuat baris Rekap Penjualan',
      html.indexOf('Rekap Penjualan</span>') < 0);
  b.close();

  /* ============ 3. Server memakai aturan yang sama ============ */
  console.log('\n== kompas-mysql: aturan lunas yang sama ==');
  const php = fs.readFileSync(PHP, 'utf8');
  cek('kp_setor_masuk() ada', /function kp_setor_masuk\(/.test(php));
  cek('kp_cash_hari() ada', /function kp_cash_hari\(/.test(php));
  /* PHP tidak boleh mendeklarasikan fungsi DI DALAM fungsi lain: ia baru lahir
     saat pemuatnya dipanggil, dan panggilan kedua melempar "cannot redeclare". */
  cek('keduanya di tingkat atas, bukan di dalam simpan_rekap()',
      php.indexOf('function kp_setor_masuk(') < php.indexOf('function simpan_rekap('),
      'kp_setor_masuk berada setelah simpan_rekap');
  cek('baris lama tanpa `jumlah` dihitung sebagai setoran penuh',
      /\$n \+= kp_cash_hari\(\$s, \$h\);/.test(php));
  cek('penanda setor menyala hanya kalau sisanya habis',
      /\$s\['reports'\]\[\$h\]\['setor'\] = \(kp_cash_hari\(\$s, \$h\) - kp_setor_masuk\(\$s, \$h\)\) < 1;/.test(php));
  cek('nominal dijepit ke SISA hari itu, bukan ke cash-nya',
      /\$sisa = \$cash - kp_setor_masuk\(\$s, \$h\);/.test(php) && /if \(\$n > \$sisa\) \$n = \$sisa;/.test(php));
  cek('setoran bernilai nol ditolak di server juga',
      /if \(\$nominal <= 0\) throw new Exception/.test(php));
  cek('`jumlah` ikut tersimpan di barisnya', /'jumlah'  => \$perHari,/.test(php));
  /* Berkas kembar: kalau salah satunya diubah, yang lain harus ikut — dan itu
     cuma bisa diingat kalau ditulis di kodenya. */
  cek('ketergantungan berkas kembarnya ditulis di kedua sisi',
      /BERKAS KEMBAR rkSetorSudah\(\)/.test(php),
      'kp_setor_masuk tidak menyebut kembarannya');

  console.log('\n---------------------------------------');
  console.log('  OK: ' + ok + '   GAGAL: ' + gagal);
  process.exit(gagal ? 1 : 0);
})();
