/* Uji pembatasan Performa Kasir di modul Cashier — 7 September 2026,
   permintaan user: "yang bisa dilihat hanya diri yang login dan tab Semua;
   kalau mau lihat kasir satu per satu tidak bisa".

   YANG DIJAGA:

     - Tombol kasir lain TIDAK digambar. Tombol yang ada tapi menolak saat
       ditekan cuma membuat orang menekannya berkali-kali.

     - GERBANG SEBENARNYA di draw(), bukan di tombolnya. Halaman yang menjaga
       aksesnya hanya dengan tidak menggambar tombol tidak menjaga apa pun —
       `data-k` bisa diubah dari devtools dalam sepuluh detik. Uji ini
       melakukan persis itu: mengubah data-k tombol "Semua" jadi id kasir lain
       lalu mengkliknya, karena listener-nya membaca dataset saat diklik.

     - Tab SEMUA tetap terbuka. Ia agregat dan tidak menyebut siapa dapat
       berapa; menutupnya mencabut satu-satunya pembanding yang halaman ini
       punya, untuk sesuatu yang tidak pernah diminta.

     - Admin modul dikecualikan. Tanpa itu supervisor dan Finance yang membuka
       modul ini ikut terkunci dari nama-nama yang memang tugasnya ia periksa.

     - Akun yang tidak cocok dengan kasir mana pun DIKATAKAN sebabnya, bukan
       dibiarkan melihat daftar yang menyusut tanpa penjelasan — kasir yang
       kemarin melihat sepuluh nama dan hari ini satu akan melaporkannya
       sebagai data hilang. */
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

const HTML = fs.readFileSync(path.join(ROOT, 'deploy', 'cashier', 'index.html'), 'utf8');
let lulus = 0, gagal = 0;
const cek = (nama, syarat, ket) => {
  if (syarat) { lulus++; console.log('  OK   ' + nama); }
  else { gagal++; console.log('  GAGAL ' + nama + (ket ? '  -> ' + ket : '')); }
};
const tunggu = ms => new Promise(r => setTimeout(r, ms));

/* Nominal tiap kasir sengaja BERBEDA supaya tiap tab punya angka khasnya
   sendiri. Isi ks_body tidak pernah menyebut nama kasir — cuma angka — jadi
   angkanya yang jadi bukti tab mana yang sedang terbuka, DAN sekaligus bukti
   bahwa angka kasir lain tidak bocor. Itu yang sebenarnya dijaga: yang
   dirahasiakan capaian orangnya, bukan namanya (namanya toh ada di Office). */
const TGL = '2026-08-05';
const RP_ANI = 'Rp6.000.000', RP_BUDI = 'Rp5.000.000', RP_SEMUA = 'Rp15.000.000';
const KASIR = [
  { id:'k-ani',   name:'Ani',   target:0, officeUserId:'u-ani' },
  { id:'k-budi',  name:'Budi',  target:0, officeUserId:'u-budi' },
  { id:'k-citra', name:'Citra', target:0, officeUserId:'u-citra' }
];
const DB_UJI = {
  daily: [{
    date: TGL, food: 10000000, bev: 5000000, lainnya: 0, discount: 0,
    service_charge: 750000, tax: 1500000, traffic: 100, bill: 60,
    qty_food: 50, qty_bev: 40, qty_others: 0,
    bd: { marketing: [], event: [], kasir: [
      { kasirId:'k-ani',   amount: 6000000, disc: 0 },
      { kasirId:'k-budi',  amount: 5000000, disc: 0 },
      { kasirId:'k-citra', amount: 4000000, disc: 0 }
    ], self: { amount:0, disc:0 } }, bdValid: true
  }],
  reports: {}, compliments: [], piutang: [], settings: {},
  employees: { kasir: KASIR, marketing: [], event: [] }
};

function dom(opt) {
  opt = opt || {};
  const d = new JSDOM(HTML, {
    url: 'https://team.laksamanamuda.id/cashier/',
    runScripts: 'dangerously', pretendToBeVisual: true,
    virtualConsole: new VirtualConsole(),
    beforeParse(w) {
      w.Chart = function () {}; w.Chart.prototype.destroy = function () {};
      w.HTMLCanvasElement.prototype.getContext = () => ({});
      w.alert = () => {}; w.confirm = () => true; w.print = () => {}; w.scrollTo = () => {};
      w.HTMLElement.prototype.scrollIntoView = function () {};
      try {
        w.localStorage.setItem('lm_session', JSON.stringify({
          expiry: Date.now() + 3600000,
          userId: opt.id || 'u-ani', name: opt.nama || 'Ani',
          modules: ['cashier'], adminModules: opt.admin ? ['cashier'] : []
        }));
      } catch (e) {}
      w.fetch = async (url) => {
        const u = String(url);
        const balas = o => ({ ok:true, status:200, text: async () => JSON.stringify(o), json: async () => o });
        /* Roster Office dibiarkan KOSONG dengan sengaja: ketKasir() lalu
           memulangkan null dan kasirMurni() memulangkan true, jadi ketiga
           nama tampil dan yang diuji murni aturan aksesnya — bukan saringan
           Tim/Keterangan yang sudah punya ujinya sendiri. */
        if (u.indexOf('account-api') > -1) return balas({ ok:true, members: [] });
        return balas({ ok:true, data: DB_UJI });
      };
    }
  });
  return d.window;
}
async function siap(w) {
  for (let i = 0; i < 220; i++) {
    try { if (w.eval('typeof DB !== "undefined" && DB && DB.employees && Array.isArray(DB.employees.kasir)')) return; }
    catch (e) {}
    await tunggu(50);
  }
  throw new Error('modul Cashier tidak pernah siap');
}
async function bukaKasir(w) {
  w.eval('VIEWMODE="bulan"; PERIOD="2026-08";');
  w.go('kasir');
  await tunggu(150);
  return w.document;
}
const tombol = d => [...d.querySelectorAll('#ks_seg button')].map(b => b.dataset.k);

(async () => {
  /* ============ 1. kasir biasa: hanya dirinya + Semua ============ */
  console.log('\n== Kasir biasa (Ani) ==');
  {
    const w = dom({ id:'u-ani', nama:'Ani' });
    await siap(w);
    const d = await bukaKasir(w);
    const t = tombol(d);

    cek('halaman Performa Kasir tergambar', !!d.getElementById('ks_seg'), JSON.stringify(t));
    cek('tab Semua tetap ada', t.indexOf('__all__') > -1);
    cek('namanya sendiri ada', t.indexOf('k-ani') > -1);
    cek('kasir lain TIDAK digambar', t.indexOf('k-budi') < 0 && t.indexOf('k-citra') < 0,
        JSON.stringify(t));
    cek('cuma dua tombol', t.length === 2, String(t.length));

    const v = d.getElementById('app-view').innerHTML;
    cek('sebabnya dikatakan di layar', v.indexOf('hanya untuk') > -1 && v.indexOf('Ani') > -1);
    cek('dikatakan tab Semua tetap utuh', /Semua<\/b> tetap memuat seluruh kasir/.test(v));

    /* ---- gerbang: akali data-k lalu klik, persis cara devtools ---- */
    const btn = d.querySelector('#ks_seg button');
    btn.dataset.k = 'k-budi';
    btn.click();
    await tunggu(80);
    const body = d.getElementById('ks_body').innerHTML;
    cek('draw() menolak kasir lain walau tombolnya diakali',
        body.indexOf('tidak dibuka di modul ini') > -1,
        body.slice(0, 160));
    /* Yang tidak boleh bocor ANGKANYA. Nama Budi memang tidak pernah muncul
       di body mana pun, jadi memeriksanya tidak membuktikan apa-apa. */
    cek('...dan angka kasir lain tidak bocor', body.indexOf(RP_BUDI) < 0, body.slice(0, 160));

    /* Yang boleh tetap jalan — gerbang yang menolak semuanya bukan gerbang. */
    btn.dataset.k = '__all__'; btn.click(); await tunggu(80);
    const semua = d.getElementById('ks_body').innerHTML;
    cek('tab Semua tetap bisa dibuka (angka gabungan ' + RP_SEMUA + ')',
        semua.indexOf(RP_SEMUA) > -1, semua.slice(0, 160));

    btn.dataset.k = 'k-ani'; btn.click(); await tunggu(80);
    const sendiri = d.getElementById('ks_body').innerHTML;
    cek('namanya sendiri tetap bisa dibuka (' + RP_ANI + ')', sendiri.indexOf(RP_ANI) > -1,
        sendiri.slice(0, 160));
    cek('...dan yang tampil memang angkanya sendiri, bukan gabungan',
        sendiri.indexOf(RP_SEMUA) < 0);
  }

  /* ============ 2. admin modul: semuanya terbuka ============ */
  console.log('\n== Admin modul ==');
  {
    const w = dom({ id:'u-sup', nama:'Supervisor', admin:true });
    await siap(w);
    const d = await bukaKasir(w);
    const t = tombol(d);
    cek('ketiga kasir digambar', t.indexOf('k-ani') > -1 && t.indexOf('k-budi') > -1 && t.indexOf('k-citra') > -1,
        JSON.stringify(t));
    cek('tidak diberi catatan pembatasan',
        d.getElementById('app-view').innerHTML.indexOf('hanya untuk') < 0);
    const btn = d.querySelector('#ks_seg button');
    btn.dataset.k = 'k-budi'; btn.click(); await tunggu(80);
    cek('boleh membuka kasir lain (' + RP_BUDI + ')',
        d.getElementById('ks_body').innerHTML.indexOf(RP_BUDI) > -1);
  }

  /* ============ 3. akun yang tidak cocok kasir mana pun ============ */
  console.log('\n== Akun yang bukan kasir ==');
  {
    const w = dom({ id:'u-lain', nama:'Orang Lain' });
    await siap(w);
    const d = await bukaKasir(w);
    const t = tombol(d);
    cek('hanya tab Semua', t.length === 1 && t[0] === '__all__', JSON.stringify(t));
    const v = d.getElementById('app-view').innerHTML;
    cek('sebabnya dikatakan, bukan didiamkan', v.indexOf('belum cocok dengan satu pun nama kasir') > -1);
    cek('...berikut cara membetulkannya', v.indexOf('Tim/Keterangan di Office') > -1);
    /* Tab Semua tetap berguna: ia satu-satunya yang tersisa untuknya. */
    const btn = d.querySelector('#ks_seg button');
    btn.click(); await tunggu(80);
    cek('tab Semua tetap bisa dibuka (' + RP_SEMUA + ')',
        d.getElementById('ks_body').innerHTML.indexOf(RP_SEMUA) > -1);
  }

  /* ============ 4. cocok lewat NAMA saat id tidak sama ============ */
  console.log('\n== Pencocokan lewat nama ==');
  {
    /* Akun Office-nya berganti id (mis. dibuat ulang), tapi namanya sama.
       officeUserId dicoba DULU; kalau tidak ketemu, nama jadi jaring kedua —
       aturan yang sama dengan compFilterPic() di berkas ini. */
    const w = dom({ id:'u-baru', nama:'Citra' });
    await siap(w);
    const d = await bukaKasir(w);
    const t = tombol(d);
    cek('ketemu lewat namanya', t.indexOf('k-citra') > -1, JSON.stringify(t));
    cek('tetap tidak membuka yang lain', t.indexOf('k-ani') < 0 && t.indexOf('k-budi') < 0);
  }

  /* ============ 5. gerbangnya satu tempat ============ */
  console.log('\n== Bentuk kodenya ==');
  {
    cek('bolehLihatKasir() ada dan tunggal',
        (HTML.match(/function bolehLihatKasir\(/g) || []).length === 1);
    cek('dipakai DI DALAM draw(), bukan cuma saat menggambar tombol',
        /const draw=kid=>\{[\s\S]{0,400}?bolehLihatKasir\(kid,list\)/.test(HTML));
    cek('sesi membaca adminModules', HTML.indexOf("adm.indexOf('cashier')") > -1);
    /* Tab Semua tidak boleh ikut terkunci — kalau suatu hari ada yang',
       menambahkan pemeriksaan di depannya, ini yang berbunyi. */
    cek('tab __all__ dilewatkan lebih dulu',
        /if\(kid==='__all__'\) return true;/.test(HTML));
  }

  console.log('\n---------------------------------------');
  console.log('LULUS ' + lulus + '   GAGAL ' + gagal);
  process.exit(gagal ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
