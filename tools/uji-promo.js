/* Uji halaman Promo & Klaim (deploy/analytics/) di jsdom.

   Yang diuji di sini BUKAN tampilannya, melainkan PEMBACAAN BERKASNYA dan
   satu hal yang lebih berbahaya lagi: berkas promo tidak boleh pernah terbaca
   sebagai laporan penjualan. ringkasPos() TIDAK melempar untuk berkas promo —
   ia menemukan 'sales date' dan 'sales number', tidak menemukan satu pun
   kolom nilai yang dikenalnya, lalu menyimpan Bill Report beromset Rp0 yang
   MENIMPA ringkasan bulan itu. Tidak ada satu pun galat di jalan.

   ASERSI TERKUATNYA MEMBANDINGKAN HASIL URAI DENGAN BARIS TOTAL DI KAKI
   BERKASNYA SENDIRI (Qty 554, Discount Total 6.890.800,95). Baris itu ditulis
   POS, bukan oleh kode ini, jadi ia satu-satunya pemeriksaan di berkas ini
   yang tidak bisa basi sendiri — dan sekaligus baris yang paling berbahaya
   kalau ikut terbaca sebagai data: angkanya berformat Indonesia, dan angka()
   salah membacanya DENGAN CARA YANG BERBEDA per kolom ("6.890.800,95" -> 6,89
   karena parseFloat berhenti di titik kedua; "554,00" -> 55.400 karena tidak
   punya pemisah ribuan).

   SATU HAL YANG PERLU DIKETAHUI SEBELUM MENAMBAH ASERSI DI SINI: baris total
   di berkas Agustus 2026 TIDAK punya tanggal, jadi penjaga tanggal sudah
   cukup membuangnya — dan itu berarti berkas asli tidak bisa membuktikan
   penjaga nama+nomor bill berfungsi. Mutasi yang mencabutnya memang LOLOS
   seluruh asersi atas berkas asli. Yang menuntutnya bagian "baris buatan",
   dan bentuk-bentuk di sana harus dibuat sendiri karena berkasnya kebetulan
   tidak punya satu pun.

   Berkas promo asli JANGAN di-commit: isinya seluruh klaim promo sebulan
   berikut nomor bill-nya. Ujinya MELEWAT dengan jelas kalau berkasnya tidak
   ada — yang menjalankan uji di mesin lain tidak punya berkas itu. */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const { JSDOM } = (() => {
  for (const p of [process.env.JSDOM_PATH, path.join(ROOT, 'node_modules', 'jsdom'), 'jsdom']) {
    if (!p) continue;
    try { return require(p); } catch (e) { /* coba berikutnya */ }
  }
  console.error('jsdom tidak ketemu. Pasang `npm i jsdom`, atau setel JSDOM_PATH ke foldernya.');
  process.exit(2);
})();

const ASET_XLSX = fs.readFileSync(path.join(ROOT, 'deploy', 'assets', 'xlsx-baca.js'), 'utf8');
const ASET_PB   = fs.readFileSync(path.join(ROOT, 'deploy', 'assets', 'performa-bonus.js'), 'utf8');
const SUMBER    = fs.readFileSync(path.join(ROOT, 'deploy', 'analytics', 'index.html'), 'utf8');
let HTML = SUMBER
  .replace('<script src="../assets/xlsx-baca.js"><' + '/script>', () => '<script>' + ASET_XLSX + '<' + '/script>')
  .replace('<script src="../assets/performa-bonus.js"><' + '/script>', () => '<script>' + ASET_PB + '<' + '/script>');

let lulus = 0, gagal = 0, lewat = 0;
const cek = (nama, syarat, ket) => {
  if (syarat) { lulus++; console.log('  OK   ' + nama); }
  else { gagal++; console.log('  GAGAL ' + nama + (ket ? '  -> ' + ket : '')); }
};
const skip = (nama, sebab) => { lewat++; console.log('  LEWAT ' + nama + '  -> ' + sebab); };
const tunggu = ms => new Promise(r => setTimeout(r, ms));
/* Sumber tanpa komentar. Sejarah kenapa sesuatu dikerjakan justru harus tetap
   boleh menyebut namanya; yang diperiksa PEMAKAIANNYA. */
const tanpaKomentar = s => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');

function berkasPromo() {
  const f = fs.readdirSync(ROOT).find(x => /^Promotion Report.*\.xlsx$/i.test(x));
  return f ? path.join(ROOT, f) : null;
}
function berkasBill() {
  const f = fs.readdirSync(ROOT).find(x => /^Sales Recapitulation Report.*\.xlsx$/i.test(x));
  return f ? path.join(ROOT, f) : null;
}

function domAnalytics(opt) {
  opt = opt || {};
  const panggilan = [];
  const dom = new JSDOM(HTML, {
    url: 'https://dev.laksamanamuda.id/analytics/',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    beforeParse(w) {
      w.alert = m => panggilan.push({ alert: String(m) });
      w.confirm = () => opt.tolak !== true;
      w.DecompressionStream = DecompressionStream;
      w.Blob = Blob; w.Response = Response; w.TextDecoder = TextDecoder;
      try {
        w.localStorage.setItem('lm_session', JSON.stringify({
          expiry: Date.now() + 3600000, userId: 'u-wandi', name: 'Wandi Pranata',
          modules: ['analytics'], adminModules: ['analytics']
        }));
      } catch (e) {}
      const jawab = obj => ({ ok:true, status:200, text: async () => JSON.stringify(obj), json: async () => obj });
      w.fetch = async (url, init) => {
        const body = init && init.body ? JSON.parse(init.body) : {};
        const u = String(url);
        panggilan.push({ url:u, body });
        if (body.action === 'analyticsGet')
          return jawab({ ok:true, data: opt.an || { data:{ laporan:{}, setting:{} }, akses:{}, peran:{} } });
        if (body.action === 'analyticsSave')
          return jawab(opt.gagalSimpan ? { ok:false, error:'server mati' } : { ok:true, data:{ saved:true } });
        if (u.indexOf('hpp.php') > -1) return jawab({ bahan:[], resep:[], setting:{}, ts:'2026-09-04' });
        if (u.indexOf('account-api') > -1) return jawab({ ok:true, members: [] });
        if (u.indexOf('event-api') > -1 || u.indexOf('marketing-api') > -1) return jawab({ ok:true, data:{ events: [] } });
        return jawab({ ok:true, data:{} });
      };
    }
  });
  return { dom, panggilan };
}
async function siap(w) {
  for (let i = 0; i < 200; i++) {
    try { if (w.eval('typeof AN !== "undefined" && AN !== null')) return; } catch (e) {}
    await tunggu(50);
  }
  throw new Error('modul Analytics tidak pernah siap');
}
/* Berkas dimasukkan lewat JALUR YANG BENAR-BENAR DIPAKAI PERAMBAN
   (anPilihBerkas), bukan dengan memanggil pengurainya langsung — yang
   dilewati kalau memanggil langsung justru pengenal jenis berkasnya. */
async function unggah(w, bp) {
  const buf = fs.readFileSync(bp);
  const file = new w.File([new Uint8Array(buf)], path.basename(bp));
  file.arrayBuffer = async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  file.text = async () => buf.toString('utf8');
  w.eval('UNGGAH_HASIL = null');
  await w.anPilihBerkas({ files: [file] });
  for (let i = 0; i < 600 && !w.eval('UNGGAH_HASIL'); i++) await tunggu(50);
  return w.eval('UNGGAH_HASIL');
}
const bulat = n => Math.round(n * 100) / 100;

(async () => {
  const BP = berkasPromo();

  /* ================= 1. kontrak sumber ================= */
  console.log('\n== Kontrak sumber ==');
  {
    const S = tanpaKomentar(SUMBER);
    cek('halaman promo terdaftar di TITLES', /promo\s*:\s*\['Promo & Klaim'/.test(S));
    cek('halaman promo ada di peta router', /promo\s*:\s*vPromo/.test(S));
    cek('halaman promo ada di menu sidebar', /data-view="promo"/.test(S));
    cek('halaman promo punya hak akses bawaan', /promo\s*:\s*\{\s*staf\s*:\s*PERM_VIEW/.test(S));
    /* AN.data.promo WAJIB dinormalkan di muatSemua(). Kalau tidak, halaman
       yang menuliskan bentuk bawaannya sendiri akan menyimpang dari yang
       menulisnya begitu ada field baru. */
    cek('AN.data.promo dinormalkan saat memuat', /AN\.data\.promo\s*=\s*\{\}/.test(S));
    /* SATU pengurai kolom untuk dua daftar. Dua salinan pasti menyimpang. */
    cek('petaKolom generik dipakai dua daftar',
        /function petaKolom\(kepala, def\)/.test(S)
        && /petaKolom\(kepala, KOL_CARI\)/.test(S) && /petaKolom\(baris\[iH\], KOL_PROMO\)/.test(S));
    /* Jenis berkas dikenali dari KOLOMNYA, bukan dari nama berkasnya — nama
       berkas diketik orang dan tidak pernah bisa dipercaya. */
    cek('jenis berkas dikenali dari kolom, bukan nama berkas',
        /P\.nama\s*&&\s*P\.tipe/.test(S) && !/namaBerkas.*(test|match|indexOf).*[Pp]romot/.test(S));
    /* Kunci yang dibaca vPromo() WAJIB ikut disimpan anSimpanPromo(). Ini
       invarian yang akan menangkap kunci BERIKUTNYA yang tertinggal — bukan
       daftar nama yang harus diingat orang. Persis lubang yang membuat
       paket/kategori/katMenu hilang lima hari tanpa satu pun galat. */
    const blokSimpan = (S.match(/AN\.data\.promo\[u\.bulan\]\s*=\s*\{[\s\S]*?\};/) || [''])[0];
    const wajib = ['promo','tipe','jam','menu','ringkas','diunggah','oleh','berkas'];
    const kurang = wajib.filter(k => blokSimpan.indexOf(k + ':') < 0);
    cek('semua kunci yang dibaca halaman ikut disimpan', kurang.length === 0, 'kurang: ' + kurang.join(','));
  }

  if (!BP) {
    skip('seluruh asersi atas berkas promo asli', 'berkas "Promotion Report*.xlsx" tidak ada di root repo');
    console.log('\n' + lulus + ' lulus, ' + gagal + ' gagal, ' + lewat + ' lewat');
    process.exit(gagal ? 1 : 0);
  }

  /* ================= 2. pengenal jenis berkas ================= */
  console.log('\n== Pengenal jenis berkas ==');
  const { dom } = domAnalytics({});
  await siap(dom.window);
  const w = dom.window, d = w.document;
  const u = await unggah(w, BP);
  cek('berkas promo dikenali sebagai promo', u && u.kind === 'promo', u && u.kind);
  cek('bukan dibaca sebagai laporan penjualan', !u || (!u.hari && !u.ringkas.grand));

  /* ================= 3. angka vs baris TOTAL berkasnya ================= */
  console.log('\n== Angka vs baris total di kaki berkas ==');
  const r = u.ringkas;
  cek('bulan terbaca Agustus 2026', u.bulan === '2026-08', u.bulan);
  /* Baris TOTAL berkas: Qty 554,00 · Discount Total 6.890.800,95. */
  cek('jumlah item sama dengan baris total berkas (554)', r.qty === 554, String(r.qty));
  cek('nilai diskon sama dengan baris total berkas (6.890.800,95)',
      bulat(r.nilaiDisc) === 6890800.95, String(r.nilaiDisc));
  /* Baris TOTAL itu sendiri TIDAK boleh ikut jadi promo. Kalau ikut, ia
     berdiri sebagai promo bernama kosong yang nilainya mengalahkan seluruh
     promo sungguhan — angka() membuang titik ribuannya jadi 689.080.095. */
  cek('baris total tidak jadi promo palsu', !Object.keys(u.promo).some(k => !k.trim()));
  cek('baris total dihitung sebagai dilewati', u.nLewat >= 1, String(u.nLewat));
  /* "554,00" di baris total terbaca 55.400 oleh angka() — seratus kali lipat,
     karena kolom itu tidak punya pemisah ribuan. Kalau barisnya ikut, jumlah
     item melompat dari 554 ke 55.954. Diperiksa di angkanya sendiri, bukan
     lewat ambang yang dikira-kira. */
  cek('jumlah item tidak tercemar baris total', r.qty === 554 && r.qty !== 55954, String(r.qty));

  /* ---- baris buatan: bentuk yang berkas aslinya kebetulan TIDAK punya ----
     Baris total di berkas Agustus 2026 tidak punya tanggal, jadi penjaga
     tanggal sudah cukup membuangnya — dan itu berarti berkas asli TIDAK BISA
     membuktikan penjaga nama+nomor bill berfungsi. Mutasi yang mencabutnya
     memang LOLOS seluruh asersi di atas. Dua bentuk berikut yang menuntutnya,
     dan keduanya harus dibuat sendiri. */
  console.log('\n== Penjaga nama + nomor bill (baris buatan) ==');
  {
    const KEPALA = { A:'Branch', B:'Sales Date', C:'Promotion Type', D:'Promotion Name',
      E:'Sales Number', F:'Original Price', S:'Menu Name', U:'Qty', V:'Discount Total', X:'Bill Total' };
    const rows = [
      { A:'Promotion Report' },
      KEPALA,
      { A:'X', B:'46235', C:'DISCOUNT (%)', D:'PROMO A', E:'SLMCL178558741794', U:'1', V:'1000.0000', X:'10000' },
      /* baris TOTAL yang PUNYA tanggal — penjaga tanggal tidak menolongnya */
      { B:'46235', U:'554,00', V:'6.890.800,95', X:'45.790.748,00' },
      /* baris bernama tapi TANPA nomor bill. Kalau lolos, seluruh baris
         semacam ini menumpuk jadi SATU transaksi hantu bernama string kosong,
         dan jumlah klaimnya terbaca 1 berapa pun banyaknya. */
      { A:'X', B:'46235', C:'FREE ITEM', D:'PROMO B', F:'25000.0000', S:'TEH', U:'2' }
    ];
    const ub = w.uraiBerkas(rows, 'buatan.xlsx');
    cek('baris buatan tetap dikenali sebagai promo', ub.kind === 'promo', ub.kind);
    cek('baris total BERTANGGAL tetap tidak ikut terbaca', ub.ringkas.qty === 1, String(ub.ringkas.qty));
    cek('nilainya tidak tercemar baris total', ub.ringkas.nilaiDisc === 1000, String(ub.ringkas.nilaiDisc));
    cek('baris tanpa nomor bill tidak ikut dihitung', !ub.promo['PROMO B']);
    cek('tidak ada transaksi hantu bernama kosong', ub.ringkas.bill === 1, String(ub.ringkas.bill));
    cek('keduanya dihitung sebagai dilewati', ub.nLewat === 2, String(ub.nLewat));
  }

  /* ================= 4. klaim = bill, bukan baris ================= */
  console.log('\n== Klaim dihitung dari bill, bukan baris ==');
  const pr = u.promo;
  /* Promo tingkat MENU menempel di tiap menu yang kena diskon, jadi satu
     transaksi bisa punya belasan baris. Diurut per baris, promo semacam ini
     melompat ke peringkat yang tidak pernah ia duduki. */
  const bd = pr['BUDRUN 26 DISC 15%'];
  cek('promo tingkat menu punya baris jauh lebih banyak daripada transaksi',
      bd && bd.baris === 60 && bd.bill === 12, bd && (bd.baris + ' baris / ' + bd.bill + ' transaksi'));
  const km = pr['DISC 17% KEMERDEKAAN'];
  cek('10 baris promo tetap terhitung 1 transaksi',
      km && km.baris === 10 && km.bill === 1, km && (km.baris + '/' + km.bill));
  cek('transaksi berpromo dihitung dari nomor bill berbeda', r.bill === 325, String(r.bill));
  cek('jumlah transaksi lebih kecil daripada jumlah baris', r.bill < r.baris, r.bill + ' vs ' + r.baris);

  /* ================= 5. nilai: dua kolom, dua jenis biaya ================= */
  console.log('\n== Nilai promo: diskon vs barang dilepas ==');
  /* Barang gratis dicatat POS berharga NOL di laporan penjualan, jadi
     Original Price x Qty di berkas ini satu-satunya tempat nilainya tercatat.
     Kalau cuma Discount Total yang dijumlahkan, sepertiga promonya berbunyi
     Rp0 dan terlihat tidak memakan biaya apa pun. */
  const ft = pr['FREE ICE TEA'];
  cek('promo barang gratis punya nilai, bukan Rp0', ft && ft.nilai > 0, ft && String(ft.nilai));
  cek('nilai barang gratis = Original Price x Qty', ft && ft.nilai === 2350000 && ft.qty === 94,
      ft && (ft.nilai + ' / qty ' + ft.qty));
  cek('promo gratis tidak punya komponen diskon', ft && ft.nilaiDisc === 0, ft && String(ft.nilaiDisc));
  const bl = pr['BUDRUN 26 DISC 15% (BILL DISCOUNT)'];
  cek('promo diskon tidak punya komponen barang dilepas', bl && bl.nilaiGratis === 0, bl && String(bl.nilaiGratis));
  cek('total = diskon + barang dilepas',
      bulat(r.nilai) === bulat(r.nilaiDisc + r.nilaiGratis), r.nilai + ' vs ' + (r.nilaiDisc + r.nilaiGratis));
  cek('nilai barang dilepas terhitung (6.795.000)', r.nilaiGratis === 6795000, String(r.nilaiGratis));

  /* ================= 6. jam klaim ================= */
  console.log('\n== Jam klaim ==');
  cek('seluruh baris terbaca jamnya', r.jamGelap === 0, String(r.jamGelap));
  const jam = u.jam;
  cek('jam berbentuk 24 kotak', Array.isArray(jam) && jam.length === 24, jam && String(jam.length));
  const puncak = jam.reduce((a, x, i) => (x.bill > a.v ? { j:i, v:x.bill } : a), { j:-1, v:0 });
  cek('jam paling ramai 13:00', puncak.j === 13 && puncak.v === 49, JSON.stringify(puncak));
  cek('jam 03:00 tidak punya klaim', jam[3].bill === 0, String(jam[3].bill));
  cek('jumlah transaksi per jam sama dengan transaksi berpromo',
      jam.reduce((a, x) => a + x.bill, 0) === r.bill,
      jam.reduce((a, x) => a + x.bill, 0) + ' vs ' + r.bill);
  /* PENJAGANYA TANGGAL BARISNYA SENDIRI. Tanpa itu, POS lain yang penomoran
     bill-nya bukan stempel waktu akan menghasilkan 24 kolom jam yang terisi
     rapi dan sepenuhnya karangan — tidak ada satu pun cara membedakannya dari
     yang benar. Diuji sebagai unit, bukan lewat berkas: berkas yang punya
     nomor semacam itu memang tidak ada. */
  cek('jam dipakai kalau tanggalnya cocok',
      w.jamNomorBill('SLMCL178558741794', '2026-08-01') === 19,
      String(w.jamNomorBill('SLMCL178558741794', '2026-08-01')));
  cek('jam DITOLAK kalau tanggalnya tidak cocok',
      w.jamNomorBill('SLMCL178558741794', '2026-08-02') === -1);
  cek('nomor bill yang bukan stempel waktu ditolak',
      w.jamNomorBill('INV0000000123', '2026-08-01') === -1);
  cek('nomor bill tanpa angka ditolak', w.jamNomorBill('ABCDEF', '2026-08-01') === -1);
  cek('nomor bill di luar rentang epoch ditolak',
      w.jamNomorBill('X0000000001', '2026-08-01') === -1);

  /* ================= 7. barang yang diklaim ================= */
  console.log('\n== Barang yang diklaim ==');
  const mn = u.menu;
  cek('menu terbaca dari kolom Menu Name', mn && Object.keys(mn).length > 0);
  cek('menu paling banyak diklaim CLASSIC TEA',
      mn['CLASSIC TEA'] && mn['CLASSIC TEA'].qty === 94, mn['CLASSIC TEA'] && String(mn['CLASSIC TEA'].qty));
  /* Diskon tingkat bill tidak menempel di satu menu pun; POS menuliskan "-".
     Kalau "-" ikut jadi nama menu, ia berdiri sebagai menu terlaris palsu. */
  cek('tanda hubung tidak jadi nama menu', !mn['-']);
  cek('baris tanpa menu dihitung dan dilaporkan', r.tanpaMenu > 0, String(r.tanpaMenu));

  /* ================= 8. putaran simpan sungguhan ================= */
  console.log('\n== Putaran simpan ==');
  /* Disimpan lewat anSimpanUnggah() SUNGGUHAN, bukan disuntikkan ke
     AN.data.promo. Uji yang menyuntikkan langsung melewati persis baris yang
     bisa rusak — daftar kunci tertutupnya — dan itulah yang membuat 260
     pemeriksaan tetap hijau selama paket/kategori/katMenu hilang. */
  const lapSebelum = JSON.stringify(w.eval('JSON.stringify(AN.data.laporan)'));
  await w.anSimpanUnggah();
  for (let i = 0; i < 100 && !w.eval('AN.data.promo && AN.data.promo["2026-08"] ? 1 : 0'); i++) await tunggu(50);
  const tersimpan = JSON.parse(w.eval('JSON.stringify(AN.data.promo["2026-08"])'));
  cek('tersimpan di AN.data.promo', !!tersimpan);
  ['promo','tipe','jam','menu','ringkas'].forEach(k =>
    cek('kunci "' + k + '" selamat sampai tersimpan', tersimpan && tersimpan[k] !== undefined));
  cek('angka tetap sama sesudah tersimpan',
      tersimpan.ringkas.qty === 554 && tersimpan.ringkas.bill === 325);
  /* Set tidak bisa di-JSON-kan: dikirim apa adanya ia jadi {} dan SELURUH
     jumlah klaim berbunyi nol, tanpa satu pun galat. */
  cek('jumlah bill per promo selamat melewati JSON',
      tersimpan.promo['FREE ICE TEA'].bill === 45, String(tersimpan.promo['FREE ICE TEA'].bill));
  /* YANG PALING PENTING DI BERKAS INI: berkas promo tidak boleh menyentuh
     ringkasan penjualan. Kalau ia jatuh ke jalur ringkasPos(), bulan itu
     tertimpa Bill Report beromset Rp0 — tanpa satu pun galat. */
  cek('laporan penjualan TIDAK tersentuh',
      JSON.stringify(w.eval('JSON.stringify(AN.data.laporan)')) === lapSebelum);
  const kirim = JSON.parse(w.eval('JSON.stringify(AN.data)'));
  cek('yang dikirim ke server memuat promo dan laporan sekaligus',
      kirim.promo && kirim.laporan !== undefined);

  /* ================= 9. halaman ================= */
  console.log('\n== Halaman Promo & Klaim ==');
  w.go('promo'); await tunggu(60);
  let isi = d.getElementById('app-view').innerHTML;
  cek('halaman tergambar', isi.length > 500, String(isi.length));
  cek('menyebut promo paling sering diklaim', isi.indexOf('BUDRUN 26 DISC 15% (BILL DISCOUNT)') > -1);
  cek('memajang jam paling ramai', /13:00/.test(isi));
  cek('memajang tabel jam', isi.indexOf('Jam Klaim') > -1);
  cek('memajang barang yang diklaim', isi.indexOf('CLASSIC TEA') > -1);
  /* Dua jenis biaya yang berbeda WAJIB dibedakan di layar: barang gratis
     tidak pernah ada di dalam omset, jadi mengurangkannya lagi dari Net Sales
     menghitungnya dua kali. */
  cek('membedakan diskon dari barang dilepas', /[Bb]arang dilepas/.test(isi));
  cek('mengatakan transaksi dihitung dari nomor bill', /nomor bill yang berbeda/.test(isi));

  /* Urutan: diurut per TRANSAKSI, promo tingkat menu TIDAK boleh naik ke atas
     hanya karena barisnya banyak. */
  const urutan = t => (t.match(/<td><b>([^<]+)<\/b><\/td>/g) || []).map(x => x.replace(/<[^>]+>/g, ''));
  const tabel = isi.slice(isi.indexOf('Promo yang Diklaim'));
  const nama1 = urutan(tabel)[0];
  cek('urutan bawaan menurut transaksi', nama1 === 'BUDRUN 26 DISC 15% (BILL DISCOUNT)', nama1);
  w.prUrut('nilai'); await tunggu(60);
  isi = d.getElementById('app-view').innerHTML;
  const nama2 = urutan(isi.slice(isi.indexOf('Promo yang Diklaim')))[0];
  cek('urut menurut nilai memberi peringkat yang berbeda',
      nama2 === 'BUDRUN FREE KOPI 2026', nama2);
  cek('urut menurut nilai tidak mengubah angkanya',
      isi.indexOf('Rp3.215.000') > -1);
  w.prUrut('trx'); await tunggu(60);

  /* Bulan yang tidak punya laporan promo menjelaskan dirinya, bukan tabel
     kosong — tabel kosong terbaca sebagai "tidak ada promo bulan ini". */
  {
    const { dom: d2 } = domAnalytics({});
    await siap(d2.window);
    d2.window.go('promo'); await tunggu(60);
    const isi2 = d2.window.document.getElementById('app-view').innerHTML;
    cek('kosong menjelaskan dirinya', /Belum ada laporan promo/.test(isi2));
    cek('kosong menunjuk halaman Unggah Laporan', /Unggah Laporan/.test(isi2));
    d2.window.close();
  }

  /* ================= 10. laporan penjualan tidak rusak ================= */
  console.log('\n== Laporan penjualan masih terbaca (regresi petaKolom) ==');
  const BB = berkasBill();
  if (!BB) skip('berkas penjualan asli', 'Sales Recapitulation Report*.xlsx tidak ada di root repo');
  else {
    const u2 = await unggah(w, BB);
    cek('berkas penjualan tetap dikenali sebagai laporan penjualan', u2 && u2.kind === 'pos', u2 && u2.kind);
    cek('omsetnya tetap terbaca, bukan Rp0', u2 && u2.ringkas.grand > 0, u2 && String(u2.ringkas.grand));
    cek('kolomnya tetap ketemu lewat petaKolom generik', u2 && u2.ringkas.bill > 0, u2 && String(u2.ringkas.bill));
  }
  w.close();

  console.log('\n' + lulus + ' lulus, ' + gagal + ' gagal' + (lewat ? ', ' + lewat + ' lewat' : ''));
  process.exit(gagal ? 1 : 0);
})().catch(e => { console.error('\nMELEDAK: ' + (e && e.stack || e)); process.exit(1); });

