/* Uji mode HARIAN modul Analytics (22 Oktober 2026).

   Yang dijaga: memilih satu tanggal menarik HANYA tanggal itu dari ESB
   (dari = sampai), diurai pengurai yang sama, dan seluruh halaman satu-periode
   membaca ringkasan hari itu — tanpa menyimpan apa pun dan tanpa mengubah
   ringkasan bulanan. Angkanya dipilih supaya tiap kesalahan berbeda:

     ringkasan bulan tersimpan   grand 9.999.000 (fixture, bukan hasil urai)
     3 Okt (hari yang dipilih)   2 bill · grand 73.000
     4 Okt (hari sebelah)        1 bill · grand 40.000  — kalau ikut: 113.000 */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const muat = nama => {
  for (const p of [process.env[nama.toUpperCase().replace('-', '_') + '_PATH'], path.join(ROOT, 'node_modules', nama), nama,
                   path.join(process.env.USERPROFILE || '', 'node_modules', nama)]) {
    if (!p) continue;
    try { return require(p); } catch (e) {}
  }
  return null;
};
const jsdomMod = muat('jsdom');
if (!jsdomMod) { console.error('jsdom tidak ketemu (setel JSDOM_PATH).'); process.exit(2); }
const { JSDOM } = jsdomMod;

const ASET_XLSX = fs.readFileSync(path.join(ROOT, 'deploy', 'assets', 'xlsx-baca.js'), 'utf8');
const ASET_PB   = fs.readFileSync(path.join(ROOT, 'deploy', 'assets', 'performa-bonus.js'), 'utf8');
const SUMBER    = fs.readFileSync(path.join(ROOT, 'deploy', 'analytics', 'index.html'), 'utf8');
const HTML = SUMBER
  .replace('<script src="../assets/xlsx-baca.js"><' + '/script>', () => '<script>' + ASET_XLSX + '<' + '/script>')
  .replace('<script src="../assets/performa-bonus.js"><' + '/script>', () => '<script>' + ASET_PB + '<' + '/script>');

let lulus = 0, gagal = 0;
const cek = (nama, syarat, ket) => {
  if (syarat) { lulus++; console.log('  OK   ' + nama); }
  else { gagal++; console.log('  GAGAL ' + nama + (ket !== undefined ? '  -> ' + ket : '')); }
};
const tunggu = ms => new Promise(r => setTimeout(r, ms));

const mn = o => Object.assign({ batchID:'1', menuCode:'', discount:0, discountValue:0, otherTaxValue:0, otherTax:0,
  vat:0, vatValue:0, notes:'', statusName:'Preparing', cancelNotes:'', createdBy:'KRU_A', packages:[], extras:[] }, o);
const bill = (no, tgl, jam, menu, qty, total) => ({
  salesNum:'SLMCL' + no, billNum:'B' + no, salesDate:tgl, salesDateIn:tgl + ' ' + jam,
  tableName:'24', visitPurposeName:'DINE IN', paxTotal:'1', grandTotal:total, statusName:'Finished', editedBy:'KASIR_1',
  salesPayments:[{ paymentMethodName:'CASH', paymentAmount:total }],
  salesMenus:[ mn({ menuCategoryName:'BEVERAGES', menuCategoryDetailName:'COFFEE SERIES', menuName:menu, qty, price:total / qty,
    total, createdDate:tgl + 'T' + jam + '+07:00' }) ] });
const B3a = bill('1791000001', '2026-10-03', '12:00:00', 'ICE AMERICANO', 1, 33000);
const B3b = bill('1791000002', '2026-10-03', '20:15:00', 'MATCHA LATTE', 1, 40000);
const B4  = bill('1791000003', '2026-10-04', '19:00:00', 'HANYA HARI LAIN', 1, 40000);

const KINI = Date.UTC(2026, 9, 5, 3, 0, 0);
const BULANAN = { '2026-10': { jenis:'menu', ringkas:{ bill:99, grand:9999000, net:9999000 },
  hari:{ '2026-10-03':{ grand:5000000, bill:50 } }, jam:[], menu:[{ nama:'MENU SEBULAN', qty:500, nilai:9999000 }] } };

function domAnalytics(opt) {
  opt = opt || {};
  const panggilan = [];
  const dom = new JSDOM(HTML, {
    url: 'https://dev.laksamanamuda.id/analytics/', runScripts: 'dangerously', pretendToBeVisual: true,
    beforeParse(w) {
      const D0 = w.Date;
      class DPatok extends D0 { constructor(...a) { if (!a.length) super(KINI); else super(...a); } static now() { return KINI; } }
      w.Date = DPatok;
      w.alert = m => panggilan.push({ alert:String(m) });
      w.confirm = () => true;
      try {
        w.localStorage.setItem('lm_session', JSON.stringify({ expiry: KINI + 3600000, userId:'u1',
          name:'Penguji', token:'tok-uji', modules:['analytics'], adminModules:['analytics'] }));
      } catch (e) {}
      const jawab = obj => ({ ok:true, status:200, text: async () => JSON.stringify(obj), json: async () => JSON.parse(JSON.stringify(obj)) });
      w.fetch = async (url, init) => {
        const body = init && init.body ? JSON.parse(init.body) : {};
        const u = String(url);
        panggilan.push({ url:u, body });
        if (body.action === 'esbHalaman') return jawab(opt.esb(body));
        if (body.action === 'analyticsGet') return jawab({ ok:true, data:{ data:{ laporan: JSON.parse(JSON.stringify(BULANAN)), setting:{} }, akses:{}, peran:{} } });
        if (body.action === 'analyticsSave') return jawab({ ok:true, data:{ saved:true } });
        if (u.indexOf('hpp.php') > -1) return jawab({ bahan:[], resep:[], setting:{}, ts:'x' });
        if (u.indexOf('account-api') > -1) return jawab({ ok:true, members:[] });
        return jawab({ ok:true, data:{ events:[] } });
      };
    }
  });
  return { dom, panggilan };
}
async function siap(w) {
  for (let i = 0; i < 200; i++) {
    try { if (w.eval('typeof AN !== "undefined" && AN !== null && AN.data')) return; } catch (e) {}
    await tunggu(50);
  }
  throw new Error('modul Analytics tidak pernah siap');
}
/* ESB tiruan yang MENGHORMATI rentang: memulangkan bill yang tanggalnya di
   antara dari..sampai saja. Kalau klien meminta sebulan, hari sebelah ikut. */
const esbRentang = b => ({ ok:true, data:{ page:b.page, pageCount:1,
  bills: b.page === 1 ? [B3a, B3b, B4].filter(x => x.salesDate >= b.dari && x.salesDate <= b.sampai) : [] } });
const view = w => w.document.getElementById('app-view').innerHTML;
const tungguMuat = async (w, t) => { for (let i = 0; i < 100; i++) { if (w.eval('HARI_MUAT[' + JSON.stringify(t) + ']') !== 'memuat') return; await tunggu(30); } };

(async () => {
  console.log('\n== 1. Bulanan tetap seperti dulu ==');
  const { dom, panggilan } = domAnalytics({ esb: esbRentang });
  const w = dom.window; await siap(w);
  w.eval("go('ringkasan')"); await tunggu(30);
  cek('ringkasan bulan tampil (9.999.000)', /9\.999\.000/.test(view(w)));
  cek('kendali Per hari tergambar', !!w.document.getElementById('an_hari'));

  console.log('\n== 2. Pilih 3 Okt: ditarik SATU hari dari ESB ==');
  w.hariPilih('2026-10-03');
  cek('selama memuat, keadaan kosong menyebut tanggalnya', /Menarik 3 Okt/i.test(view(w)) || /Menarik/.test(view(w)), view(w).slice(0, 200));
  await tungguMuat(w, '2026-10-03'); await tunggu(30);
  const esbP = panggilan.filter(p => p.body.action === 'esbHalaman');
  cek('ESB diminta dari = sampai = 2026-10-03', esbP.length >= 1 && esbP.every(p => p.body.dari === '2026-10-03' && p.body.sampai === '2026-10-03'),
      JSON.stringify(esbP.map(p => p.body.dari + '..' + p.body.sampai)));
  const v = view(w);
  cek('grand hari itu 73.000', /73\.000/.test(v), v.slice(0, 400));
  cek('angka bulanan tidak tampil', !/9\.999\.000/.test(v));
  cek('hari sebelah tidak ikut (bukan 113.000)', !/113\.000/.test(v));
  cek('keterangan menyebut satu hari & tidak disimpan', /tidak disimpan/.test(v) && /2 bill/.test(v));
  cek('TIDAK ada analyticsSave', !panggilan.some(p => p.body.action === 'analyticsSave'));
  cek('ringkasan bulan tersimpan tidak berubah', w.eval('AN.data.laporan["2026-10"].ringkas.grand') === 9999000);

  console.log('\n== 3. Halaman lain ikut hari itu ==');
  w.eval("go('menu')"); await tunggu(40);
  const vm = view(w);
  cek('Menu: menu hari itu ada', /ICE AMERICANO/.test(vm) && /MATCHA LATTE/.test(vm));
  cek('Menu: menu sebulan & hari lain tidak ada', !/MENU SEBULAN/.test(vm) && !/HANYA HARI LAIN/.test(vm));
  cek('pembanding bulan dimatikan', w.eval('blnBandingAktif()') === '');
  w.eval("go('tren')"); await tunggu(40);
  cek('Tren (bukan halaman harian) tetap membaca bulanan', w.eval('lap("2026-10").ringkas.grand') === 9999000);
  w.eval("go('ringkasan')"); await tunggu(30);
  const n1 = panggilan.filter(p => p.body.action === 'esbHalaman').length;
  w.hariPilih('2026-10-03'); await tunggu(30);
  cek('tanggal yang sama tidak ditarik ulang', panggilan.filter(p => p.body.action === 'esbHalaman').length === n1);

  console.log('\n== 4. Geser hari & keluar ==');
  w.hariGeser(1); await tungguMuat(w, '2026-10-04'); await tunggu(30);
  cek('‹ › pindah ke 4 Okt', w.eval('HARI') === '2026-10-04' && /40\.000/.test(view(w)));
  w.hariGeser(1); await tunggu(30);
  w.hariGeser(1); await tunggu(30);
  cek('tidak bisa melompat ke tanggal yang belum terjadi', w.eval('HARI') <= '2026-10-05', w.eval('HARI'));
  w.blnPilih('2026-10'); await tunggu(30);
  cek('chip bulan mengembalikan ke bulanan', w.eval('HARI') === '' && /9\.999\.000/.test(view(w)));

  console.log('\n== 5. Hari tanpa bill & ESB gagal ==');
  w.hariPilih('2026-10-01'); await tungguMuat(w, '2026-10-01'); await tunggu(30);
  cek('hari tanpa bill dikatakan, bukan "belum ada laporan diunggah"', /Tidak ada bill di ESB/.test(view(w)) && !/Belum ada laporan yang diunggah/.test(view(w)));
  const { dom: d2 } = domAnalytics({ esb: () => ({ ok:false, error:'token ESB ditolak' }) });
  const w2 = d2.window; await siap(w2);
  w2.eval("go('ringkasan')"); await tunggu(30);
  w2.hariPilih('2026-10-03'); await tungguMuat(w2, '2026-10-03'); await tunggu(30);
  cek('galat ESB disebut sebabnya + tombol coba lagi', /gagal ditarik/.test(view(w2)) && /token ESB ditolak/.test(view(w2)) && /Coba lagi/.test(view(w2)));

  console.log('\n---------------------------------------');
  console.log('LULUS ' + lulus + '   GAGAL ' + gagal);
  process.exit(gagal ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
