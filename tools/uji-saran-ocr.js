/* ============================================================
   UJI — HASIL OCR JADI SARAN, BUKAN ISIAN  (23 September 2026)
   ------------------------------------------------------------
   node tools/uji-saran-ocr.js

   Permintaan user: "foto ini jadi masalah untuk membaca tulisan, terkadang
   salah baca, terkadang benar, terkadang tidak terbaca … saya ingin mencatat
   uang masuk secara manual saja tapi lewat sistem".

   Sampai tanggal ini applyOcr() MENULIS LANGSUNG ke tfDate/tfTime/tfBank/
   tfName/tfAmount, jadi angka tebakan mesin dan angka yang dibaca orang
   berdiri di kotak yang sama dengan huruf yang sama. Diukur atas 494 baris
   DP produksi: 180 tanggal kosong, 264 nama pengirim kosong, dan 15 nominal
   berbeda dari yang diketik kru — di antaranya Rp200.000 yang terbaca
   Rp20.000.000 dan Rp2.242.500 yang terbaca Rp2.242.

   YANG DIJAGA DI SINI DUA HAL, dan yang pertama yang paling menentukan:

     1. applyOcr TIDAK menulis satu kolom tersimpan pun.
     2. saranOcr() cuma menyuruh sesuatu kalau memang ada yang disuruh —
        saran yang mengulang isi kotaknya sendiri melatih orang berhenti
        membacanya.

   FUNGSINYA DIPOTONG DARI SUMBER lalu dijalankan, bukan ditulis ulang di
   sini: uji yang memegang salinan aturannya sendiri tetap hijau kalau yang
   asli diubah.
   ============================================================ */
'use strict';
const fs = require('fs');
const path = require('path');

const AKAR = path.resolve(__dirname, '..');
const SRC = fs.readFileSync(path.join(AKAR, 'deploy/reservasi/index.html'), 'utf8');
let ok = 0, gagal = 0;
function T(nama, syarat, ket) {
  if (syarat) { ok++; return; }
  gagal++; console.log('  GAGAL  ' + nama + (ket ? '  (' + ket + ')' : ''));
}

const potong = n => {
  let i = SRC.indexOf('async function ' + n + '(');
  if (i < 0) i = SRC.indexOf('function ' + n + '(');
  if (i < 0) throw new Error('fungsi tidak ketemu di sumber: ' + n);
  const akhir = ['\nfunction ', '\nasync function ', '\nconst ', '\nlet ']
    .map(k => SRC.indexOf(k, i + 1)).filter(x => x > 0);
  return SRC.slice(i, akhir.length ? Math.min(...akhir) : SRC.length);
};
const barisKonst = a => { const i = SRC.indexOf(a); return i < 0 ? '' : SRC.slice(i, SRC.indexOf('\n', i)); };

/* ---- lingkungan tiruan: tetangganya dioper sebagai PARAMETER, bukan ditempel
        ke global. Kalau fungsinya suatu hari butuh nama global yang tidak ada
        di daftar ini, blok ini yang berbunyi lebih dulu. ---- */
const KOTAK = {};                       // id -> {value, innerHTML, style}
function buatKotak(id) { return (KOTAK[id] = { value: '', innerHTML: '', style: {} }); }
const TOAST = [];
let DP = null;

const U = new Function('byId', 'findDp', 'toast', 'rpDot', 'esc', 'fmtDateShort', 'tglSeharusnya', [
  barisKonst('const TF_SARAN_KOTAK'),
  potong('applyOcr'),
  potong('saranOcr'),
  potong('saranTampil'),
  potong('saranHtml'),
  potong('tfPakaiSaran'),
  potong('tfPakaiSemuaSaran'),
  'return { applyOcr, saranOcr, saranTampil, saranHtml, tfPakaiSaran, tfPakaiSemuaSaran, TF_SARAN_KOTAK };'
].join('\n'))(
  id => KOTAK[id] || null,
  () => ({ r: null, p: DP }),
  (m) => TOAST.push(String(m)),
  n => 'Rp' + (Number(n) || 0).toLocaleString('id-ID'),
  s => String(s == null ? '' : s),
  s => 'TGL(' + s + ')',
  p => (p && p.__stempel) || ''
);

const dp = (o) => Object.assign({
  tfDate: '', tfTime: '', tfBank: '', tfName: '', tfAmount: 0,
  tfOcrAt: 0, tfOcrText: '', tfOcrSaran: null, tfSource: ''
}, o);
const parsed = (o) => Object.assign({ date: '', time: '', bank: '', name: '', amount: 0 }, o);

console.log('\n=== [1] applyOcr TIDAK BOLEH MENGISI SATU KOLOM PUN ===\n');
{
  const p = dp({});
  U.applyOcr(p, parsed({ date: '2026-09-11', time: '20:44:23', bank: 'BCA', name: 'ARI', amount: 200000 }), 'teks mentah');

  T('tfDate tetap kosong',   p.tfDate === '');
  T('tfTime tetap kosong',   p.tfTime === '');
  T('tfBank tetap kosong',   p.tfBank === '');
  T('tfName tetap kosong',   p.tfName === '');
  T('tfAmount tetap nol',    Number(p.tfAmount) === 0);
  T('sarannya tersimpan',    p.tfOcrSaran && p.tfOcrSaran.date === '2026-09-11' && p.tfOcrSaran.amount === 200000);
  T('teks mentah tersimpan', p.tfOcrText === 'teks mentah');
  T('cap waktu bacanya diisi', Number(p.tfOcrAt) > 0);

  /* tfSource DULU disetel "ocr" di sini, dan itu yang membuat baris hasil
     tebakan mesin tidak bisa dibedakan dari baris yang pernah dilihat orang.
     Sejak applyOcr berhenti menulis, satu-satunya yang menyetelnya
     readTfForm() — yaitu orang yang menekan Simpan. */
  T('applyOcr tidak lagi mengaku sebagai sumber data', p.tfSource === '');

  /* Baris LAMA yang terlanjur diisi OCR tidak boleh ikut tersapu: yang
     sebagian besarnya benar, dan menimpanya berarti membuang data yang tidak
     bisa dikembalikan. */
  const lama = dp({ tfDate: '2026-09-01', tfAmount: 20000000, tfSource: 'ocr' });
  U.applyOcr(lama, parsed({ date: '2026-09-11', amount: 200000 }), 'x');
  T('scan ulang tidak menimpa isian lama', lama.tfDate === '2026-09-01' && lama.tfAmount === 20000000);
}

console.log('=== [2] saranOcr — hanya menyuruh kalau ada yang disuruh ===\n');
{
  const s = { date: '2026-09-11', time: '20:44:23', bank: 'BCA', name: 'ARI', amount: 200000 };

  T('kolom kosong -> sarannya muncul',
    U.saranOcr(dp({ tfOcrSaran: s }), 'date') === '2026-09-11');

  T('kolom sudah sama -> tidak ada saran',
    U.saranOcr(dp({ tfOcrSaran: s, tfDate: '2026-09-11' }), 'date') === '');

  T('kolom berbeda -> sarannya muncul',
    U.saranOcr(dp({ tfOcrSaran: s, tfDate: '2026-09-01' }), 'date') === '2026-09-11');

  T('mesin tidak membaca apa-apa -> tidak ada saran',
    U.saranOcr(dp({ tfOcrSaran: Object.assign({}, s, { name: '' }) }), 'name') === '');

  T('belum pernah dibaca mesin -> tidak ada saran',
    U.saranOcr(dp({}), 'date') === '');

  /* NOMINAL dibandingkan sebagai ANGKA, bukan string: "200000" dan 200000
     adalah nominal yang sama, dan saran yang mengulangnya cuma menambah
     tombol yang tidak mengubah apa pun. */
  T('nominal sama (beda tipe) -> tidak ada saran',
    U.saranOcr(dp({ tfOcrSaran: s, tfAmount: '200000' }), 'amount') === '');
  T('nominal berbeda -> sarannya muncul',
    U.saranOcr(dp({ tfOcrSaran: s, tfAmount: 20000000 }), 'amount') === 200000);
  T('mesin membaca nol -> tidak ada saran',
    U.saranOcr(dp({ tfOcrSaran: Object.assign({}, s, { amount: 0 }) }), 'amount') === '');

  /* Petunjuk stempel Ref berdiri tepat di atas kotak yang sama dan LEBIH
     KUAT — jamnya terbukti cocok. Menggambar keduanya membuat satu tanggal
     ditawarkan dua kali dengan dua kalimat yang berbeda, dan yang membacanya
     harus menebak mana yang berlaku. */
  T('tanggal yang sama dengan stempel Ref tidak ditawarkan dua kali',
    U.saranOcr(dp({ tfOcrSaran: s, __stempel: '2026-09-11' }), 'date') === '');
  T('tanggal yang BERBEDA dari stempel Ref tetap ditawarkan',
    U.saranOcr(dp({ tfOcrSaran: s, __stempel: '2026-09-12' }), 'date') === '2026-09-11');
}

console.log('=== [3] tombol Pakai benar-benar mengisi kotaknya ===\n');
{
  for (const id of Object.values(U.TF_SARAN_KOTAK)) buatKotak(id);
  for (const id of Object.values(U.TF_SARAN_KOTAK)) buatKotak('saran_' + id);
  DP = dp({ tfOcrSaran: { date: '2026-09-11', time: '20:44:23', bank: 'BCA', name: 'ARI', amount: 200000 } });

  U.tfPakaiSaran('r1', 'p1', 'date');
  T('kotak tanggal terisi', KOTAK.tf_date.value === '2026-09-11');
  T('barisan sarannya berganti bunyi', /diisi/.test(KOTAK.saran_tf_date.innerHTML));
  T('barisan sarannya menyebut belum tersimpan', /belum tersimpan/i.test(KOTAK.saran_tf_date.innerHTML));

  /* NOMINAL DIFORMAT RUPIAH saat dimasukkan: kotaknya memakai fmtRupiahInput,
     dan angka telanjang di sana terbaca berbeda dari tiap angka lain di
     layar yang sama. */
  U.tfPakaiSaran('r1', 'p1', 'amount');
  T('kotak nominal diformat rupiah', KOTAK.tf_amount.value === 'Rp200.000');

  /* MENGISI KOTAK BUKAN MENYIMPAN. Kalau tombol Pakai ikut menulis ke `p`,
     saran mesin masuk ke data tanpa ada yang menekan Simpan — persis
     perilaku yang perubahan ini cabut. */
  T('tombol Pakai tidak menulis ke datanya', DP.tfDate === '' && Number(DP.tfAmount) === 0);

  /* Kotak yang tidak ada di DOM (modal keburu ditutup) tidak boleh melempar:
     yang melempar di sini meninggalkan modal separuh tergambar. */
  const simpan = KOTAK.tf_bank; delete KOTAK.tf_bank;
  let lempar = false;
  try { U.tfPakaiSaran('r1', 'p1', 'bank'); } catch (e) { lempar = true; }
  T('kotak yang tidak ada tidak melempar', !lempar);
  KOTAK.tf_bank = simpan;
}

console.log('=== [4] Pakai semua ===\n');
{
  for (const id of Object.values(U.TF_SARAN_KOTAK)) buatKotak(id);
  for (const id of Object.values(U.TF_SARAN_KOTAK)) buatKotak('saran_' + id);
  TOAST.length = 0;
  DP = dp({ tfOcrSaran: { date: '2026-09-11', time: '20:44:23', bank: 'BCA', name: 'ARI', amount: 200000 } });

  U.tfPakaiSemuaSaran('r1', 'p1');
  T('kelima kotaknya terisi',
    KOTAK.tf_date.value === '2026-09-11' && KOTAK.tf_time.value === '20:44:23'
    && KOTAK.tf_bank.value === 'BCA' && KOTAK.tf_name.value === 'ARI'
    && KOTAK.tf_amount.value === 'Rp200.000');
  T('jumlahnya disebut', TOAST.length === 1 && /^5 kolom/.test(TOAST[0]));
  T('masih menyuruh menekan Simpan', /Simpan/.test(TOAST[0]));

  /* HANYA yang memang punya saran yang disentuh. Kalau ia menyapu semuanya,
     kolom yang sudah diketik orang tertimpa nilai kosong — dan hilangnya
     tidak menimbulkan galat apa pun. */
  for (const id of Object.values(U.TF_SARAN_KOTAK)) buatKotak(id);
  TOAST.length = 0;
  KOTAK.tf_name.value = 'DIKETIK ORANG';
  DP = dp({ tfOcrSaran: { date: '2026-09-11', time: '', bank: '', name: '', amount: 0 } });
  U.tfPakaiSemuaSaran('r1', 'p1');
  T('kolom tanpa saran tidak disentuh', KOTAK.tf_name.value === 'DIKETIK ORANG');
  T('yang terisi cuma yang punya saran', TOAST.length === 1 && /^1 kolom/.test(TOAST[0]));

  /* Tidak ada saran sama sekali -> tidak ada toast. Pemberitahuan "0 kolom
     diisi" adalah kabar yang tidak menyuruh apa pun. */
  TOAST.length = 0;
  DP = dp({});
  U.tfPakaiSemuaSaran('r1', 'p1');
  T('tanpa saran tidak ada pemberitahuan', TOAST.length === 0);
}

console.log('=== [5] saranHtml ===\n');
{
  const p = dp({ tfOcrSaran: { date: '2026-09-11', time: '', bank: '', name: '', amount: 200000 } });
  const h = U.saranHtml('r1', 'p1', p, 'date');
  T('memanggil tfPakaiSaran dengan id barisnya', /tfPakaiSaran\('r1','p1','date'\)/.test(h));
  T('wadahnya ber-id supaya bisa disegarkan', /id="saran_tf_date"/.test(h));
  T('tanggalnya digambar terbaca orang, bukan ISO mentah', /TGL\(2026-09-11\)/.test(h));
  T('nominalnya digambar berupa rupiah', /Rp200\.000/.test(U.saranHtml('r1', 'p1', p, 'amount')));
  T('kolom tanpa saran tidak menggambar apa pun', U.saranHtml('r1', 'p1', p, 'bank') === '');

  /* NILAINYA TIDAK DITITIPKAN LEWAT ATRIBUT onclick, dan itu bukan soal gaya:
     modul ini tidak punya escJs(), dan nama pemilik rekening di bukti bisa
     memuat tanda kutip. Satu kutip yang lolos merusak seluruh barisnya, dan
     yang membacanya menyimpulkan tombolnya rusak. */
  const pKutip = dp({ tfOcrSaran: { date: '', time: '', bank: '', name: "D'ARI \"X\"", amount: 0 } });
  const hk = U.saranHtml('r1', 'p1', pKutip, 'name');
  T('nama berkutip tidak ikut ke dalam onclick', /tfPakaiSaran\('r1','p1','name'\)/.test(hk));
}

console.log('=== [6] penanda baris yang angkanya masih dari mesin ===\n');
{
  const tanda = new Function('esc', [potong('tfTandaGambar'), 'return tfTandaGambar;'].join('\n'))(s => String(s == null ? '' : s));

  T('baris lama hasil OCR yang belum diputuskan ditandai',
    /angka dari mesin/.test(tanda(dp({ tfSource: 'ocr', tfStatus: '' }))));

  /* SUDAH DIPUTUSKAN ORANG -> tidak ditandai lagi. Penanda yang tetap
     menyala sesudah orangnya menekan Verifikasi cuma melatih orang berhenti
     membacanya — dan yang pertama diabaikan adalah baris yang memang perlu
     diperiksa. */
  T('yang sudah diverifikasi tidak ditandai',
    !/angka dari mesin/.test(tanda(dp({ tfSource: 'ocr', tfStatus: 'verified' }))));
  T('yang sudah ditolak tidak ditandai',
    !/angka dari mesin/.test(tanda(dp({ tfSource: 'ocr', tfStatus: 'rejected' }))));

  /* Baris yang pernah disimpan orang tidak ditandai — itu justru keadaan
     yang dituju. */
  T('baris yang sudah disimpan orang tidak ditandai',
    !/angka dari mesin/.test(tanda(dp({ tfSource: 'manual', tfStatus: '' }))));
  T('baris yang belum pernah dibaca mesin tidak ditandai',
    !/angka dari mesin/.test(tanda(dp({}))));

  /* Penanda LAMA tidak boleh ikut hilang: ia menjawab pertanyaan yang lain. */
  T('penanda "dari gambar" tetap berlaku',
    /dari gambar/.test(tanda(dp({ tfStatus: 'verified', tfTanpaData: 'tanggal transfer' }))));
}

console.log('=== [7] kontrak atas sumbernya ===\n');
{
  const bersih = SRC
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');

  const modal = (() => {
    const i = bersih.indexOf('function openTfEdit(');
    return bersih.slice(i, i + 6000);
  })();

  /* KELIMA kotaknya wajib punya barisan sarannya. Yang terlewat satu tidak
     melempar — kolom itu cuma diam-diam kembali harus diketik dari nol
     walaupun mesin sudah membacanya. */
  for (const k of ['date', 'time', 'bank', 'name', 'amount']) {
    T('modal menggambar saran untuk kolom ' + k,
      new RegExp('id="tf_' + k + '"[\\s\\S]{0,900}saranHtml\\(r\\.id,p\\.id,p,"' + k + '"\\)').test(modal));
  }
  T('modal menawarkan Pakai semua', /tfPakaiSemuaSaran\('\$\{r\.id\}','\$\{p\.id\}'\)/.test(modal));
  T('jumlah sarannya dihitung sebelum modal digambar', /const nSaran\s*=/.test(modal));

  /* PERINGATANNYA WAJIB MENYEBUT BAHWA ANGKANYA BELUM MASUK. Panel saran yang
     cuma memajang angka terbaca sebagai kolom yang sudah terisi, dan itu
     persis salah paham yang perubahan ini adakan untuk menutupnya. */
  T('panel saran mengatakan angkanya belum masuk', /Angkanya <b>belum masuk<\/b>/.test(modal));

  /* Bukti DIGANTI -> saran lama tidak berlaku lagi. Tertinggal, modal
     menawarkan angka dari struk yang sudah tidak ada di baris itu. */
  const reset = (() => {
    const i = bersih.indexOf('function resetDpScan(');
    return bersih.slice(i, bersih.indexOf('}', i));
  })();
  T('ganti bukti ikut membuang sarannya', /tfOcrSaran\s*=\s*null/.test(reset));

  /* Pita progres tidak boleh lagi menjanjikan kotaknya terisi sendiri —
     janji yang tidak ditepati tiap kali dibaca. */
  T('pita scan tidak lagi menjanjikan kotaknya terisi sendiri',
    !/akan terisi sendiri/.test(bersih));
  T('pita scan menyebut hasilnya berupa saran',
    /Hasilnya jadi <b>saran<\/b>/.test(bersih));
}

/* ============================================================
   [8] MODALNYA BENAR-BENAR DIGAMBAR — dibaca dari DOM, bukan dari sumber.
   ------------------------------------------------------------
   Rujukan yang benar di berkas tidak membuktikan ada barisan saran yang
   benar-benar muncul: asersi sumber tetap hijau untuk template literal yang
   jatuh dengan SyntaxError, dan gejalanya bukan galat melainkan modal yang
   tidak pernah terbuka. Pelajaran yang sudah dibayar logo panel Kas Kecil.
   ============================================================ */
(async () => {
  const path2 = require('path');
  const JS = (() => {
    for (const p of [process.env.JSDOM_PATH, path2.join(AKAR, 'node_modules', 'jsdom'), 'jsdom']) {
      if (!p) continue;
      try { return require(p); } catch (e) { /* coba berikutnya */ }
    }
    return null;
  })();

  if (!JS) {
    console.log('  LEWAT  render modal di jsdom  (jsdom tidak ketemu — setel JSDOM_PATH)');
  } else {
    const ASET = fs.readFileSync(path2.join(AKAR, 'deploy/assets/venue-layouts.js'), 'utf8');
    const HTML = SRC.replace('<script src="../assets/venue-layouts.js"><' + '/script>',
      '<script>' + ASET + '<' + '/script>');
    const tunggu = (ms) => new Promise(r => setTimeout(r, ms));
    const d = new JS.JSDOM(HTML, {
      url: 'https://team.laksamanamuda.id/reservasi/',
      runScripts: 'dangerously', pretendToBeVisual: true,
      virtualConsole: new JS.VirtualConsole(),
      beforeParse(w) {
        w.alert = () => {}; w.confirm = () => false; w.print = () => {}; w.scrollTo = () => {};
        w.HTMLElement.prototype.scrollIntoView = function () {};
        try {
          w.localStorage.setItem('lm_session', JSON.stringify({
            expiry: Date.now() + 3600000, userId: 'u-uji', name: 'Penguji',
            modules: ['reservasi'], adminModules: ['reservasi']
          }));
        } catch (e) {}
        w.fetch = async () => ({ ok: true, status: 200, text: async () => '{"ok":true,"data":{}}', json: async () => ({ ok: true, data: {} }) });
      }
    });
    const w = d.window;
    let siap = false;
    for (let i = 0; i < 220 && !siap; i++) {
      try { siap = w.eval('typeof STATE !== "undefined" && STATE && Array.isArray(STATE.reservations)'); } catch (e) {}
      if (!siap) await tunggu(50);
    }
    if (!siap) {
      T('modul Reservasi boot di jsdom', false, 'tidak pernah siap');
    } else {
      w.eval('SESSION={id:"u-uji",name:"Penguji",role:"admin"};');
      /* Satu reservasi ber-DP yang KOLOMNYA KOSONG tapi punya saran mesin —
         bentuk yang paling sering ada di produksi sesudah perubahan ini. */
      w.eval(`STATE.reservations=[{ id:"r-uji", name:"Tamu Uji", date:"2026-09-11", time:"19:00",
        pax:4, table:"21", status:"Confirmed", dps:[{ id:"p-uji", amount:200000, method:"QRIS",
        proofData:"", proofName:"", tfDate:"", tfTime:"", tfBank:"", tfName:"", tfAmount:0,
        tfStatus:"", tfNote:"", tfSource:"", tfOcrAt:Date.now(), tfOcrText:"teks",
        tfOcrSaran:{ date:"2026-09-11", time:"20:44:23", bank:"BCA", name:"ARI", amount:200000 } }] }];`);
      let lempar = '';
      try { w.eval('openTfEdit("r-uji","p-uji")'); } catch (e) { lempar = String(e && e.message || e); }
      T('openTfEdit tidak melempar', !lempar, lempar);

      const html = w.document.body.innerHTML;
      const modal = (() => {
        const i = html.indexOf('Cek Dana Masuk');
        return i < 0 ? '' : html.slice(i, i + 9000);
      })();
      T('modalnya tergambar', modal.length > 0);

      /* KOTAKNYA WAJIB TETAP KOSONG. Kalau isinya sudah terisi saran, seluruh
         perubahan ini tidak mengubah apa pun — angka mesin kembali berdiri di
         kotak yang dibaca orang sebagai angka yang sudah dicek. */
      const kotak = (id) => { const e = w.document.getElementById(id); return e ? String(e.value) : null; };
      T('kotak tanggal masih kosong', kotak('tf_date') === '');
      T('kotak jam masih kosong', kotak('tf_time') === '');
      T('kotak nama pengirim masih kosong', kotak('tf_name') === '');

      /* Barisan sarannya BENAR-BENAR ada di DOM, dan tombolnya benar-benar
         tersambung — bukan cuma tertulis di markup. */
      for (const id of ['saran_tf_date', 'saran_tf_time', 'saran_tf_name', 'saran_tf_amount']) {
        T('barisan saran ' + id + ' tergambar', !!w.document.getElementById(id));
      }
      T('panel Pakai semua menyebut jumlahnya', /Pakai semua \(5\)/.test(modal));

      const tbl = w.document.querySelector('#saran_tf_date button');
      T('tombol Pakai ada di barisan sarannya', !!tbl);
      if (tbl) {
        tbl.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
        T('menekan Pakai mengisi kotaknya', kotak('tf_date') === '2026-09-11');
        T('menekan Pakai tidak menulis ke datanya',
          w.eval('STATE.reservations[0].dps[0].tfDate') === '');
      }

      /* Kolom yang sudah diisi orang tidak ditawari lagi — dan itu diperiksa
         lewat modal yang benar-benar digambar, bukan lewat saranOcr sendiri. */
      w.eval('STATE.reservations[0].dps[0].tfName="ARI";');
      try { w.eval('openTfEdit("r-uji","p-uji")'); } catch (e) {}
      T('kolom yang sudah sama tidak ditawari lagi', !w.document.getElementById('saran_tf_name'));
      T('kolom lain tetap ditawari', !!w.document.getElementById('saran_tf_date'));
    }
    w.close();
  }

  console.log('\n' + '='.repeat(52));
  console.log('  OK: ' + ok + '   GAGAL: ' + gagal);
  console.log('='.repeat(52));
  if (gagal) process.exit(1);
})();
