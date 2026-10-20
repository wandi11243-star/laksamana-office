/* Uji tarikan data penjualan dari API POS ESB (deploy/analytics/ +
   kompas-mysql/lib_esb.php), 20 Oktober 2026.

   Yang dijaga: JSON ESB diratakan jadi baris Detail Report lalu diringkas
   pengurai yang SAMA dengan unggahan Excel. Fixture-nya bentuk ASLI balasan
   ESB (contoh dari user, nama orang diganti), dan angkanya dipilih supaya
   tiap kesalahan memberi hasil yang berbeda:

     benar                         grand 44.903.790,5 · 5 bill
     service & pajak tertukar      svc 24.500 alih-alih 2.133.680,5
     paket REGULAR ikut dihitung   ICE KOPI LAKSAMANA 12 porsi, bukan 6
     bill ganda antar halaman      6 bill
     kembalian ikut jadi omset     CASH 355.000, bukan 313.750

   PHP tidak bisa dijalankan di mesin ini, jadi lib_esb.php dijaga php-parser
   (sintaks) + kontrak atas sumbernya. */
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
const PHP = fs.readFileSync(path.join(ROOT, 'kompas-mysql', 'lib_esb.php'), 'utf8');
const API = fs.readFileSync(path.join(ROOT, 'kompas-mysql', 'api.php'), 'utf8');

let lulus = 0, gagal = 0;
const cek = (nama, syarat, ket) => {
  if (syarat) { lulus++; console.log('  OK   ' + nama); }
  else { gagal++; console.log('  GAGAL ' + nama + (ket !== undefined ? '  -> ' + ket : '')); }
};
const tunggu = ms => new Promise(r => setTimeout(r, ms));
const bulat = n => Math.round(n * 100) / 100;

/* ---------- fixture: bentuk asli balasan ESB ---------- */
const mn = (o) => Object.assign({ batchID:'1', menuCode:'', discount:0, discountValue:0, otherTaxValue:0, otherTax:0,
  vat:0, vatValue:0, notes:'', statusName:'Preparing', cancelNotes:'', createdBy:'KRU_A', packages:[], extras:[] }, o);
const BILLS = [
  { salesNum:'SLMCL179078460089', billNum:'B1', salesDate:'2026-09-30', salesDateIn:'2026-09-30 23:10:00',
    branchName:'Laksamana Muda Coffee & Live Space', tableName:'24', visitPurposeName:'DINE IN', paxTotal:'1',
    subtotal:42428610, otherTaxTotal:2121430.5, vatTotal:0, grandTotal:44550040.5, additionalInfo:'PRASMANAN',
    statusName:'Finished', createdBy:'KASIR_1', editedBy:'KASIR_2',
    salesPayments:[{ paymentMethodName:'TRANSFER', paymentAmount:44550041 }],
    salesMenus:[ mn({ menuCategoryName:'FOOD', menuCategoryDetailName:'EVENT', menuName:'PRASMANAN', qty:270,
      price:157143, otherTaxValue:2121430.5, otherTax:5, total:44550040.5, createdDate:'2026-09-30T23:11:05+07:00' }) ] },
  { salesNum:'SLMCL179078495092', billNum:'B2', salesDate:'2026-09-30', salesDateIn:'2026-09-30 23:15:50',
    branchName:'Laksamana Muda Coffee & Live Space', tableName:'EXTRA 1', visitPurposeName:'DINE IN', paxTotal:'1',
    subtotal:255000, otherTaxTotal:11250, vatTotal:22500, grandTotal:288750, statusName:'Finished',
    createdBy:'KASIR_2', editedBy:'KASIR_1',
    salesPayments:[{ paymentMethodName:'CASH', paymentAmount:300000 }],
    salesMenus:[
      mn({ menuCategoryName:'FOOD', menuCategoryDetailName:'ROTI', menuName:'ROTI DOUBLE CHEESE', qty:1, price:10000, total:10000, createdDate:'2026-09-30T23:17:28+07:00' }),
      mn({ menuCategoryName:'FOOD', menuCategoryDetailName:'ROTI', menuName:'ROTI OREO CHEESE', qty:1, price:10000, total:10000, createdDate:'2026-09-30T23:17:28+07:00' }),
      mn({ menuCategoryName:'FOOD', menuCategoryDetailName:'ROTI', menuName:'ROTI HAZELNUT ALMOND', qty:1, price:10000, total:10000, createdDate:'2026-09-30T23:17:28+07:00' }),
      mn({ menuCategoryName:'BEVERAGES', menuCategoryDetailName:'GRAB AND GO', menuName:'MINERAL WATER', qty:1, price:10000, otherTaxValue:500, vatValue:1000, total:11500, createdDate:'2026-09-30T23:17:42+07:00' }),
      mn({ menuCategoryName:'FOOD', menuCategoryDetailName:'CAKE', menuName:'BURNT CHEESECAKE BROWNIE', qty:1, price:35000, otherTaxValue:1750, vatValue:3500, total:40250, createdDate:'2026-09-30T23:17:28+07:00' }),
      mn({ menuCategoryName:'BEVERAGES', menuCategoryDetailName:'COFFEE SERIES', menuName:'ICE KOPI LAKSAMANA', qty:6, price:30000, otherTaxValue:9000, vatValue:18000, total:207000, createdDate:'2026-09-30T23:17:28+07:00',
        packages:[{ menuName:'REGULAR', menuCode:'KOPISUSU001', qty:6, price:0, total:0, statusName:'Preparing' }] })
    ] },
  { salesNum:'SLMCL179078510193', billNum:'B3', salesDate:'2026-09-30', salesDateIn:'2026-09-30 23:18:21',
    tableName:'EXTRA 1', visitPurposeName:'DINE IN', paxTotal:'1', grandTotal:2000, statusName:'Finished', editedBy:'KASIR_2',
    salesPayments:[{ paymentMethodName:'CASH', paymentAmount:5000 }],
    salesMenus:[ mn({ menuCategoryName:'BEVERAGES', menuCategoryDetailName:'PACKAGING', menuName:'ES BATU', qty:1, price:2000, total:2000, createdDate:'2026-09-30T23:18:26+07:00' }) ] },
  { salesNum:'SLMCL179078542809', billNum:'B4', salesDate:'2026-09-30', salesDateIn:'2026-09-30 23:23:48',
    tableName:'U 2', visitPurposeName:'DINE IN', paxTotal:'1', otherTaxTotal:1000, vatTotal:2000, grandTotal:23000, statusName:'Finished', editedBy:'KASIR_2',
    salesPayments:[{ paymentMethodName:'CASH', paymentAmount:50000 }],
    salesMenus:[ mn({ menuCategoryName:'BEVERAGES', menuCategoryDetailName:'GRAB AND GO', menuName:'MINERAL WATER', qty:2, price:10000, otherTaxValue:1000, vatValue:2000, total:23000, createdDate:'2026-09-30T23:23:52+07:00' }) ] },
  { salesNum:'SLMCL179078703721', billNum:'B5', salesDate:'2026-09-30', salesDateIn:'2026-09-30 23:50:37',
    tableName:'23', visitPurposeName:'DINE IN', paxTotal:'1', grandTotal:40000, additionalInfo:'CT', statusName:'Finished', editedBy:'KASIR_3',
    salesPayments:[{ paymentMethodName:'COMPLIMENT', paymentAmount:40000 }],
    salesMenus:[ mn({ menuCategoryName:'BEVERAGES', menuCategoryDetailName:'COMPLIMENT', menuName:'TEA JAR COMPLIMENT', qty:2, price:20000, total:40000, createdDate:'2026-09-30T23:50:44+07:00' }) ] },
  /* Bill BATAL — tidak boleh ikut. */
  { salesNum:'SLMCL179078799999', billNum:'B6', salesDate:'2026-09-30', salesDateIn:'2026-09-30 22:00:00',
    tableName:'5', visitPurposeName:'DINE IN', grandTotal:999999, statusName:'Cancelled',
    salesPayments:[], salesMenus:[ mn({ menuName:'HANTU', qty:1, price:999999, total:999999 }) ] }
];
const GRAND = 44550040.5 + 288750 + 2000 + 23000 + 40000;

function domAnalytics(opt) {
  opt = opt || {};
  const panggilan = [];
  const dom = new JSDOM(HTML, {
    url: 'https://dev.laksamanamuda.id/analytics/', runScripts: 'dangerously', pretendToBeVisual: true,
    beforeParse(w) {
      w.alert = m => panggilan.push({ alert:String(m) });
      w.confirm = () => true;
      try {
        w.localStorage.setItem('lm_session', JSON.stringify({ expiry: Date.now() + 3600000, userId:'u1',
          name:'Penguji', token:'tok-uji', modules:['analytics'], adminModules:['analytics'] }));
      } catch (e) {}
      const jawab = obj => ({ ok:true, status:200, text: async () => JSON.stringify(obj), json: async () => obj });
      w.fetch = async (url, init) => {
        const body = init && init.body ? JSON.parse(init.body) : {};
        const u = String(url);
        panggilan.push({ url:u, body });
        if (body.action === 'esbHalaman') return jawab(opt.esb(body));
        if (body.action === 'analyticsGet') return jawab({ ok:true, data:{ data:{ laporan:{}, setting:{} }, akses:{}, peran:{} } });
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
    try { if (w.eval('typeof AN !== "undefined" && AN !== null')) return; } catch (e) {}
    await tunggu(50);
  }
  throw new Error('modul Analytics tidak pernah siap');
}
async function tarik(w) {
  w.eval("go('unggah')");
  await tunggu(50);
  const el = w.document.getElementById('esb_bulan');
  if (el) el.value = '2026-09';
  await w.anTarikEsb();
  return w.eval('UNGGAH_HASIL');
}

(async () => {
  console.log('\n== 1. Adaptor + pengurai yang sama (2 halaman, 1 bill ganda) ==');
  {
    /* Halaman 1: bill 1-3; halaman 2: bill 3 (GANDA) - 6. */
    const { dom, panggilan } = domAnalytics({ esb: b => ({ ok:true, data:{
      bills: b.page === 1 ? BILLS.slice(0, 3) : BILLS.slice(2), page:b.page, pageCount:2 } }) });
    const w = dom.window; await siap(w);
    cek('kartu Tarik dari ESB tergambar', (w.eval("go('unggah')"), !!w.document.getElementById('esb_btn')));
    const u = await tarik(w);
    cek('hasil tarikan jadi pratinjau', !!u, JSON.stringify(panggilan.filter(p => p.alert)));
    if (u) {
      const esbP = panggilan.filter(p => p.body && p.body.action === 'esbHalaman');
      cek('dua halaman ditarik', esbP.length === 2, esbP.length);
      cek('tanggal sebulan penuh dikirim', esbP[0].body.dari === '2026-09-01' && esbP[0].body.sampai === '2026-09-30');
      cek('token sesi Office ikut, token ESB tidak', esbP[0].body.sesi === 'tok-uji' && !('token' in esbP[0].body));
      cek('dikenali sebagai laporan penjualan per menu', u.kind === 'pos' && u.jenis === 'menu', u.kind + '/' + u.jenis);
      cek('bulan = 2026-09', u.bulan === '2026-09', u.bulan);
      cek('bill batal & ganda tidak ikut: 5 bill', u.ringkas.bill === 5, u.ringkas.bill);
      cek('grand = jumlah grandTotal bill', bulat(u.ringkas.grand) === bulat(GRAND), u.ringkas.grand);
      cek('service = otherTaxValue (bukan vat)', bulat(u.ringkas.svc) === bulat(2121430.5 + 11250 + 1000), u.ringkas.svc);
      cek('pajak = vatValue', bulat(u.ringkas.tax) === 24500, u.ringkas.tax);
      cek('pax tidak dihitung per baris menu', u.ringkas.pax === 5, u.ringkas.pax);
      cek('menu biasa terhitung', u.menu['ICE KOPI LAKSAMANA'] && u.menu['ICE KOPI LAKSAMANA'].qty === 6);
      const uk = (u.ukuran || {})['ICE KOPI LAKSAMANA'];
      cek('paket REGULAR menempel ke induknya', !!(uk && uk.REGULAR && uk.REGULAR.KOPISUSU001 && uk.REGULAR.KOPISUSU001.qty === 6),
          JSON.stringify(u.ukuran));
      cek('menu batal tidak ikut', !u.menu['HANTU']);
      cek('kategori EVENT terbaca', !!(u.kategori && u.kategori['EVENT']));
      cek('cara datang DINE IN', u.kunjung && u.kunjung['DINE IN'] && bulat(u.kunjung['DINE IN'].grand) === bulat(GRAND));
      const mj = u.meja && u.meja['24'];
      cek('meja terbaca', !!mj, JSON.stringify(Object.keys(u.meja || {})));
      cek('jam 23 terisi', u.hariJam && u.hariJam['2026-09-30'] && u.hariJam['2026-09-30'][23]);
      const by = u.bayar || {};
      const sumBy = Object.values(by).reduce((a, x) => a + (x.grand || 0), 0);
      cek('omset per metode bayar berjumlah pas', bulat(sumBy) === bulat(GRAND), sumBy);
      cek('kembalian tunai tidak jadi omset', by.CASH && bulat(by.CASH.grand) === 313750, JSON.stringify(by.CASH));
      cek('info ESB menyebut bill batal & ganda', u.esb && u.esb.billBatal === 1 && u.esb.ganda === 1, JSON.stringify(u.esb));
      w.eval("render()"); await tunggu(20);
      cek('pratinjau menyebut sumbernya API ESB', /Ditarik dari <b>API ESB<\/b>/.test(w.document.getElementById('app-view').innerHTML));
      await w.anSimpanUnggah(); await tunggu(20);
      const sv = panggilan.filter(p => p.body && p.body.action === 'analyticsSave');
      cek('disimpan lewat analyticsSave yang sama', sv.length === 1 && sv[0].body.data.laporan['2026-09']);
    }
  }

  console.log('\n== 2. ESB tidak menyebut jumlah halaman: lanjut sampai kosong ==');
  {
    const { dom, panggilan } = domAnalytics({ esb: b => ({ ok:true, data:{
      bills: b.page === 1 ? BILLS.slice(0, 2) : b.page === 2 ? BILLS.slice(2, 4) : b.page === 3 ? BILLS.slice(4, 5) : [],
      page:b.page, pageCount:null } }) });
    const w = dom.window; await siap(w);
    const u = await tarik(w);
    const n = panggilan.filter(p => p.body && p.body.action === 'esbHalaman').length;
    cek('berhenti di halaman yang lebih pendek', n === 3, n);
    cek('5 bill terkumpul', u && u.ringkas.bill === 5, u && u.ringkas.bill);
  }

  console.log('\n== 3. Satu halaman gagal: BERHENTI, tidak disimpan bolong ==');
  {
    const { dom } = domAnalytics({ esb: b => b.page === 2 ? { ok:false, error:'ESB menjawab HTTP 500' }
      : { ok:true, data:{ bills: BILLS.slice(0, 2), page:b.page, pageCount:3 } } });
    const w = dom.window; await siap(w);
    const u = await tarik(w);
    cek('tidak ada pratinjau', !u);
    cek('galatnya disebut dengan nomor halaman',
        /Halaman 2/.test(w.document.getElementById('esb_status').innerHTML), w.document.getElementById('esb_status').innerHTML);
    cek('tombol bisa ditekan lagi', w.document.getElementById('esb_btn').disabled === false);
  }

  console.log('\n== 4. Token ESB ditolak: tidak diulang-ulang ==');
  {
    let n = 0;
    const { dom } = domAnalytics({ esb: () => { n++; return { ok:false, error:'Token ESB ditolak (HTTP 401).' }; } });
    const w = dom.window; await siap(w);
    await tarik(w);
    cek('sekali coba saja', n === 1, n);
    cek('pesannya menyebut token', /Token ESB ditolak/.test(w.document.getElementById('esb_status').innerHTML));
  }

  console.log('\n== 5. Server (lib_esb.php) ==');
  {
    const pp = muat('php-parser');
    if (pp) {
      const Engine = pp.Engine || pp;
      const parser = new Engine({ parser:{ php7:true }, ast:{ withPositions:false } });
      let ok = true, msg = '';
      try { parser.parseCode(PHP, 'lib_esb.php'); } catch (e) { ok = false; msg = e.message; }
      cek('lib_esb.php sintaksnya sah', ok, msg);
      try { parser.parseCode(API, 'api.php'); ok = true; } catch (e) { ok = false; msg = e.message; }
      cek('api.php sintaksnya sah', ok, msg);
    } else console.log('  LEWAT php-parser tidak ada');
    cek('token dari config, dikirim sebagai Bearer', /ESB_TOKEN/.test(PHP) && /'Authorization: Bearer '/.test(PHP));
    cek('jumlah halaman dibaca dari header X-Pagination', /x-pagination-page-count/.test(PHP));
    cek('401 dibedakan', /\$kode === 401/.test(PHP));
    const blok = API.slice(API.indexOf("$action === 'esbHalaman'"), API.indexOf("$action === 'analyticsGet'"));
    cek('aksi berpagar sesi + kunci analytics', /sesi_user\(\$body\)/.test(blok) && /sesi_punya_modul\(\$u, 'analytics'\)/.test(blok));
    cek('tidak ada DELETE di lib_esb.php', !/DELETE|TRUNCATE/i.test(PHP));
    cek('token tidak ada di frontend', !/ESB_TOKEN|core-api\.esb/.test(SUMBER));
  }

  console.log('\n' + lulus + ' lulus, ' + gagal + ' gagal');
  process.exit(gagal ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
