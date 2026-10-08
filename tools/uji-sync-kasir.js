/* Uji SYNC KE PERFORMA KASIR — 8 Oktober 2026, permintaan user:
   "ketika di bagian breakdown sumber jika masih diisi data kasir saja, itu
   masih belum dihitungkan … ketika sudah final, nnti ada tinggal tekan tombol
   untuk sync ke performa kasir … yang sudah berlalu di bulan bulan sebelumnya
   biarlah berlalu, diberlakukan pas september ini saja."

   YANG DIJAGA:
     - Breakdown Sumber (finance/omset): tombol Sync membekukan d.bdSync dari
       d.bd TERSIMPAN; ditahan selama ada perubahan belum disimpan, baris
       marketing/event bernominal nol, atau shift belum diatur; dan menyebut
       kalau breakdown berubah sesudah sync.
     - Performa Kasir (finance/kas DAN cashier): mulai 1 Okt 2026 hanya
       membaca BEKUAN — hari belum di-sync tidak dihitung dan DISEBUT; angka
       bekuan menang atas d.bd hidup; bulan sebelum Oktober tetap langsung.
     - Yang diukur ANGKA di layar & isi kiriman saveAll, bukan cuma adanya
       tombol. */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const { JSDOM, VirtualConsole } = (() => {
  for (const p of [process.env.JSDOM_PATH, path.join(ROOT, 'node_modules', 'jsdom'), 'jsdom']) {
    if (!p) continue;
    try { return require(p); } catch (e) {}
  }
  console.error('jsdom tidak ketemu. Pasang `npm i jsdom`, atau setel JSDOM_PATH.');
  process.exit(2);
})();
const baca = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
const OMSET = baca('deploy/finance/omset/index.html');
/* jsdom tidak mengambil skrip eksternal: aset yang dipakai viewKasir disisipkan inline. */
const sisip = (html, rel, isi) => html.split('<script src="' + rel + '"></script>').join('<script>' + isi + '</script>');
const KAS = sisip(sisip(baca('deploy/finance/kas/index.html'), '../../assets/performa-bonus.js', baca('deploy/assets/performa-bonus.js')),
  '../../assets/cocok-bri.js', baca('deploy/assets/cocok-bri.js'));
const CASHIER = sisip(baca('deploy/cashier/index.html'), '../assets/cocok-bri.js', baca('deploy/assets/cocok-bri.js'));

let lulus = 0, gagal = 0;
const cek = (nama, syarat, ket) => {
  if (syarat) { lulus++; console.log('  OK   ' + nama); }
  else { gagal++; console.log('  GAGAL ' + nama + (ket ? '  -> ' + ket : '')); }
};
const tunggu = ms => new Promise(r => setTimeout(r, ms));
const salin = o => JSON.parse(JSON.stringify(o));

const KASIR = [
  { id: 'k-ani', name: 'Ani', target: 0, officeUserId: 'u-ani' },
  { id: 'k-budi', name: 'Budi', target: 0, officeUserId: 'u-budi' }
];
const MKT = [{ id: 'm-1', name: 'Mira', target: 0 }];
const hari = (date, bd, extra) => Object.assign({
  date, food: 10000000, bev: 0, lainnya: 0, discount: 0, service_charge: 0, tax: 0,
  traffic: 0, bill: 0, qty_food: 0, qty_bev: 0, qty_others: 0, bd, bdValid: true
}, extra || {});
const bdDasar = (ani, budi, mk) => ({
  marketing: mk || [], event: [], abaikan: [],
  kasir: [{ kasirId: 'k-ani', amount: ani, disc: 0, off: false },
          { kasirId: 'k-budi', amount: budi, disc: 0, off: false }],
  self: { amount: 0, disc: 0 }
});
const BARIS_MK = { picId: 'm-1', eventName: 'Gathering PT X', amount: 1000000, tax: 0, service: 0,
                   menuFix: 'tetap', shift: ['k-ani'], dw: 0 };

/* ================= 1. Breakdown Sumber (finance/omset) ================= */
function domOmset(daily, kiriman) {
  const DB = { daily, reports: {}, compliments: [], piutang: [], settings: {},
               employees: { kasir: KASIR, marketing: MKT, event: [] } };
  const html = OMSET.replace(/<link[^>]+fonts[^>]*>/g, '');
  const dom = new JSDOM(html, {
    url: 'https://team.laksamanamuda.id/finance/omset/',
    runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: new VirtualConsole(),
    beforeParse(w) {
      w.alert = () => {}; w.confirm = () => true; w.scrollTo = () => {};
      w.HTMLElement.prototype.scrollIntoView = function () {};
      w.localStorage.setItem('lm_session', JSON.stringify({
        expiry: Date.now() + 3600000, userId: 'u-fin', name: 'Fina',
        modules: ['kompas'], adminModules: ['kompas'] }));
      w.fetch = async (url, init) => {
        const u = String(url);
        const body = init && init.body ? JSON.parse(init.body) : {};
        const balas = o => ({ ok: true, status: 200, text: async () => JSON.stringify(o), json: async () => o });
        if (body.action === 'saveAll') { kiriman.push(body.data); return balas({ ok: true, data: { ts: Date.now() } }); }
        if (u.indexOf('getAll') > -1 && u.indexOf('kompas') > -1) return balas({ ok: true, ts: 1, data: DB });
        if (u.indexOf('account-api') > -1) return balas({ ok: true, members: [] });
        return balas({ ok: true, data: [] });
      };
    }
  });
  return dom.window;
}
async function siapOmset(w) {
  for (let i = 0; i < 200; i++) {
    try { if (w.eval('typeof DB!=="undefined" && DB && Array.isArray(DB.daily)')) return; } catch (e) {}
    await tunggu(40);
  }
  throw new Error('modul Omset tidak pernah siap');
}
async function bukaBd(w, tgl) {
  w.eval(`PERIOD='${tgl.slice(0, 7)}'; bdDate='${tgl}';`);
  w.go('breakdown');
  await tunggu(250);
  return w.document;
}
const tombolSync = d => d.getElementById('bd_sync');
const teksBal = d => (d.getElementById('bd_balance') || {}).innerHTML || '';

(async () => {
  console.log('\n== Breakdown Sumber: tombol Sync ==');
  {
    const kiriman = [];
    const w = domOmset([
      hari('2026-09-05', bdDasar(6000000, 4000000)),
      hari('2026-10-05', bdDasar(6000000, 4000000, [salin(BARIS_MK)]))
    ], kiriman);
    await siapOmset(w);

    let d = await bukaBd(w, '2026-09-05');
    cek('hari September: tidak ada tombol sync', !tombolSync(d));
    cek('...dan dikatakan langsung dihitung', /langsung dihitung di Performa Kasir/.test(teksBal(d)), teksBal(d).slice(-400));

    d = await bukaBd(w, '2026-10-05');
    const b = tombolSync(d);
    cek('hari Oktober: tombol sync ada', !!b);
    cek('...dan hidup (breakdown tersimpan & lengkap)', b && !b.disabled, teksBal(d).slice(-600));
    cek('status "belum di-sync" disebut', /Belum di-sync ke Performa Kasir/.test(teksBal(d)));

    b.click();
    await tunggu(300);
    const terakhir = kiriman[kiriman.length - 1];
    const hr = terakhir && terakhir.daily.find(x => x.date === '2026-10-05');
    const s = hr && hr.bdSync;
    cek('sync terkirim ke server', !!s, JSON.stringify(Object.keys(hr || {})));
    const ani = s && s.kasir.find(x => x.kasirId === 'k-ani');
    const budi = s && s.kasir.find(x => x.kasirId === 'k-budi');
    cek('bekuan Ani = omset 6jt − potongan event 1jt = 5jt', ani && ani.real === 5000000 && ani.potong === 1000000, JSON.stringify(ani));
    cek('bekuan Budi = 4jt tanpa potongan', budi && budi.real === 4000000 && budi.potong === 0, JSON.stringify(budi));
    cek('pencatatnya dari sesi', s && s.by === 'Fina');
    cek('bekuan DI LUAR d.bd', hr && hr.bd && hr.bd.bdSync === undefined);

    d = await bukaBd(w, '2026-10-05');
    cek('sesudah sync: status sudah di-sync', /Sudah di-sync ke Performa Kasir/.test(teksBal(d)));
    cek('...dan tombolnya mati (tidak ada yang berubah)', tombolSync(d) && tombolSync(d).disabled);

    /* Breakdown disunting & DISIMPAN sesudah sync: bekuannya tetap, layar menyebutnya. */
    w.eval(`(()=>{const x=DB.daily.find(y=>y.date==='2026-10-05'); x.bd.kasir[1].amount=3000000;})()`);
    d = await bukaBd(w, '2026-10-05');
    cek('breakdown berubah sesudah sync: disebut', /berubah sesudah sync terakhir/.test(teksBal(d)));
    cek('...tombol Sync ulang hidup', tombolSync(d) && !tombolSync(d).disabled && /Sync ulang/.test(tombolSync(d).textContent));
    const bekuLama = w.eval(`JSON.stringify(DB.daily.find(y=>y.date==='2026-10-05').bdSync.kasir)`);
    cek('...bekuan lama TIDAK ikut berubah sebelum di-sync ulang', JSON.parse(bekuLama).find(x => x.kasirId === 'k-budi').real === 4000000);

    /* Perubahan yang BELUM disimpan menahan tombolnya. */
    const inp = d.querySelector('.ksf[data-f="amount"]');
    cek('kotak omset kasir ketemu', !!inp);
    if (inp) {
      inp.value = '7000000'; inp.dispatchEvent(new w.Event('input'));
      await tunggu(30);
      cek('isian belum disimpan: tombol sync ditahan', tombolSync(d) && tombolSync(d).disabled);
      cek('...dan sebabnya disebut', /belum disimpan/.test(teksBal(d)));
    }

    /* Klik paksa dari devtools tetap ditolak. */
    const nKirim = kiriman.length;
    if (tombolSync(d)) { tombolSync(d).disabled = false; tombolSync(d).click(); }
    await tunggu(150);
    cek('tombol yang dihidupkan paksa tetap tidak mengirim', kiriman.length === nKirim);
  }

  console.log('\n== Breakdown Sumber: event belum diisi menahan sync ==');
  {
    const kiriman = [];
    const bd = bdDasar(6000000, 4000000, [salin(BARIS_MK)]);
    bd.event = [{ picId: '', eventName: 'Nobar Final', amount: 0 }];
    const w = domOmset([hari('2026-10-06', bd)], kiriman);
    await siapOmset(w);
    const d = await bukaBd(w, '2026-10-06');
    cek('baris event nominal nol: tombol ditahan', tombolSync(d) && tombolSync(d).disabled);
    cek('...dan nama acaranya disebut', /belum diisi nominalnya/.test(teksBal(d)) && /Nobar Final/.test(teksBal(d)), teksBal(d).slice(-700));
  }

  /* ================= 2. Performa Kasir: Kas Kecil & Cashier ================= */
  const DAILY_PERF = [
    hari('2026-09-05', bdDasar(6000000, 4000000)),
    /* Disync: bekuannya SENGAJA berbeda dari d.bd hidup — kalau yang dibaca
       d.bd, Ani berbunyi 9jt; kalau bekuannya, 2jt. */
    hari('2026-10-05', bdDasar(9000000, 1000000), { bdSync: { at: 1, by: 'Fina', sidik: 'x',
      kasir: [{ kasirId: 'k-ani', off: false, real: 2000000, potong: 0 },
              { kasirId: 'k-budi', off: false, real: 3000000, potong: 0 }] } }),
    /* Belum disync: tidak boleh dihitung sama sekali. */
    hari('2026-10-06', bdDasar(7000000, 3000000))
  ];

  async function perfKas() {
    const dom = new JSDOM(KAS, {
      url: 'https://team.laksamanamuda.id/finance/kas/',
      runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: new VirtualConsole(),
      beforeParse(w) {
        w.Chart = function () {}; w.Chart.prototype.destroy = function () {};
        w.HTMLCanvasElement.prototype.getContext = () => ({});
        w.alert = () => {}; w.confirm = () => true; w.print = () => {}; w.scrollTo = () => {};
        w.localStorage.setItem('lm_session', JSON.stringify({
          expiry: Date.now() + 3600000, userId: 'u-fin', name: 'Fina',
          modules: ['finance'], adminModules: ['finance'] }));
        w.fetch = async (url, init) => {
          const body = init && init.body ? JSON.parse(init.body) : {};
          const u = String(url);
          const balas = o => ({ ok: true, status: 200, text: async () => JSON.stringify(o), json: async () => o });
          if (u.indexOf('stock-api-mysql/vendors.php') > -1) return balas({ vendors: {} });
          if (u.indexOf('account-api') > -1) return balas({ ok: true, members: [] });
          if (u.indexOf('kompas-api') > -1) return balas({ ok: true, data: {
            daily: salin(DAILY_PERF), reports: {}, rekap_setoran: [], piutang: [], compliments: [], settings: {},
            employees: { kasir: KASIR, marketing: MKT, event: [] } } });
          if (body.action === 'brankasGet') return balas({ ok: true, data: { data: null, akses: {}, peran: {} } });
          return balas({ ok: true, data: { pos: [], kategori: [], trx: [], akses: {}, peran: {} } });
        };
      }
    });
    const w = dom.window;
    for (let i = 0; i < 200; i++) {
      try { if (w.eval('typeof DB!=="undefined" && DB && Array.isArray(DB.daily) && DB.daily.length')) break; } catch (e) {}
      await tunggu(50);
    }
    return w;
  }
  async function perfCashier() {
    const dom = new JSDOM(CASHIER, {
      url: 'https://team.laksamanamuda.id/cashier/',
      runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: new VirtualConsole(),
      beforeParse(w) {
        w.Chart = function () {}; w.Chart.prototype.destroy = function () {};
        w.HTMLCanvasElement.prototype.getContext = () => ({});
        w.alert = () => {}; w.confirm = () => true; w.print = () => {}; w.scrollTo = () => {};
        w.HTMLElement.prototype.scrollIntoView = function () {};
        w.localStorage.setItem('lm_session', JSON.stringify({
          expiry: Date.now() + 3600000, userId: 'u-fin', name: 'Fina',
          modules: ['cashier'], adminModules: ['cashier'] }));
        w.fetch = async (url) => {
          const u = String(url);
          const balas = o => ({ ok: true, status: 200, text: async () => JSON.stringify(o), json: async () => o });
          if (u.indexOf('account-api') > -1) return balas({ ok: true, members: [] });
          return balas({ ok: true, data: { daily: salin(DAILY_PERF), reports: {}, compliments: [], piutang: [], settings: {},
            employees: { kasir: KASIR, marketing: MKT, event: [] } } });
        };
      }
    });
    const w = dom.window;
    for (let i = 0; i < 220; i++) {
      try { if (w.eval('typeof DB!=="undefined" && DB && DB.employees && Array.isArray(DB.employees.kasir)')) break; } catch (e) {}
      await tunggu(50);
    }
    return w;
  }

  for (const [nama, buat] of [['Kas Kecil', perfKas], ['Cashier', perfCashier]]) {
    console.log(`\n== Performa Kasir (${nama}) ==`);
    const w = await buat();
    w.eval("VIEWMODE='bulan'; PERIOD='2026-10';");
    w.go('kasir'); await tunggu(200);
    let v = w.document.getElementById('app-view').innerHTML;
    cek('Oktober: total Semua = bekuan saja (Rp5.000.000)', /Rp5\.000\.000/.test(v) && !/Rp10\.000\.000/.test(v) && !/Rp20\.000\.000/.test(v),
        (v.match(/Rp[\d.]+/g) || []).slice(0, 8).join(' '));
    cek('...hari belum di-sync disebut berikut tanggalnya', /1 hari belum di-sync/.test(v) && /2026-10-06/.test(v));
    w.eval("PERIOD='2026-09';"); w.go('kasir'); await tunggu(200);
    v = w.document.getElementById('app-view').innerHTML;
    cek('September: tetap dihitung langsung (Rp10.000.000)', /Rp10\.000\.000/.test(v));
    cek('...tanpa peringatan sync', !/belum di-sync/.test(v));
  }

  /* ================= 3. Berkas kembar ================= */
  console.log('\n== Berkas kembar ==');
  const mulai = s => (s.match(/const SYNC_KASIR_MULAI='([^']+)'/) || [])[1];
  cek('tanggal mulai sama di ketiga berkas', mulai(OMSET) === '2026-10-01' && mulai(KAS) === mulai(OMSET) && mulai(CASHIER) === mulai(OMSET),
      [mulai(OMSET), mulai(KAS), mulai(CASHIER)].join(' / '));
  for (const [n, s] of [['kas', KAS], ['cashier', CASHIER]]) {
    const vk = s.slice(s.indexOf('function viewKasir('), s.indexOf('function viewKasir(') + 6000);
    cek(`${n}: viewKasir membaca barisKasirPerforma, bukan d.bd.kasir langsung`,
        vk.indexOf('barisKasirPerforma(d)') > -1 && vk.indexOf('(d.bd?.kasir||[]).forEach') < 0);
  }

  console.log(`\nLULUS ${lulus}   GAGAL ${gagal}`);
  process.exit(gagal ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
