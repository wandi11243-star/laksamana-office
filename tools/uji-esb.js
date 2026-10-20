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

/* JAM DIPATOK 5 Oktober 2026. Sinkron menarik "bulan ini s.d. hari ini",
   jadi uji yang mengikuti jam mesin membusuk sendiri begitu bulannya
   berganti. */
const KINI = Date.UTC(2026, 9, 5, 3, 0, 0);
const BILL_OKT = Object.assign({}, BILLS[3], { salesNum:'SLMCL179100000001', salesDate:'2026-10-03',
  salesDateIn:'2026-10-03 12:00:00',
  salesMenus: BILLS[3].salesMenus.map(m => Object.assign({}, m, { createdDate:'2026-10-03T12:00:00+07:00' })) });

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
      w.confirm = m => { panggilan.push({ confirm:String(m) }); return opt.tolak !== true; };
      try {
        w.localStorage.setItem('lm_session', JSON.stringify({ expiry: KINI + 3600000, userId:'u1',
          name:'Penguji', token:'tok-uji', modules:['analytics'], adminModules:['analytics'] }));
      } catch (e) {}
      /* json() memulangkan SALINAN: fixture yang sama dipakai beberapa bagian, dan
         objek yang dioper apa adanya ikut disunting modulnya — bagian 1 sempat
         mengubah fixture bagian 5 dengan cara itu. */
      const jawab = obj => ({ ok:true, status:200, text: async () => JSON.stringify(obj), json: async () => JSON.parse(JSON.stringify(obj)) });
      w.fetch = async (url, init) => {
        const body = init && init.body ? JSON.parse(init.body) : {};
        const u = String(url);
        panggilan.push({ url:u, body });
        if (body.action === 'esbHalaman') return jawab(opt.esb(body));
        if (body.action === 'analyticsGet') return jawab({ ok:true, data:{ data:{ laporan: opt.laporan || {}, setting:{} }, akses:{}, peran:{} } });
        if (body.action === 'analyticsSave') return jawab(opt.gagalSimpan ? { ok:false, error:'server mati' } : { ok:true, data:{ saved:true } });
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
const esbHal = b => b.page;
/* September: dua halaman, bill ke-3 GANDA di kedua halaman. Oktober: satu bill. */
const esbBiasa = b => {
  if (b.dari === '2026-10-01') return { ok:true, data:{ bills: b.page === 1 ? [BILL_OKT] : [], page:b.page, pageCount:1 } };
  return { ok:true, data:{ bills: esbHal(b) === 1 ? BILLS.slice(0, 3) : BILLS.slice(2), page:b.page, pageCount:2 } };
};
const SEPT_SETENGAH = { '2026-09': { ringkas:{ bill:1, grand:1 }, hari:{}, esb:{ sampai:'2026-09-25', at:'2026-09-25T10:00:00Z', oleh:'X' } } };

(async () => {
  console.log('\n== 1. Sinkronkan: bulan lalu yang belum tuntas + bulan ini s.d. hari ini ==');
  {
    const { dom, panggilan } = domAnalytics({ esb: esbBiasa, laporan: SEPT_SETENGAH });
    const w = dom.window; await siap(w);
    w.eval("go('ringkasan')"); await tunggu(30);
    cek('tombol Sinkronkan ada di Ringkasan', /anSinkronEsb\(\)/.test(w.document.getElementById('app-view').innerHTML));
    w.eval("go('unggah')"); await tunggu(30);
    cek('tombol Sinkronkan ada di Unggah', !!w.document.getElementById('esb_btn'));
    cek('tidak ada lagi pemilih bulan ESB', !w.document.getElementById('esb_bulan'));
    await w.anSinkronEsb();
    const esbP = panggilan.filter(p => p.body && p.body.action === 'esbHalaman');
    const sept = esbP.filter(p => p.body.dari === '2026-09-01'), okt = esbP.filter(p => p.body.dari === '2026-10-01');
    cek('September dilanjutkan s.d. akhir bulan', sept.length === 2 && sept[0].body.sampai === '2026-09-30', JSON.stringify(sept.map(p => p.body.sampai)));
    cek('Oktober ditarik s.d. HARI INI (5 Okt)', okt.length === 1 && okt[0].body.sampai === '2026-10-05', JSON.stringify(okt.map(p => p.body.sampai)));
    cek('token sesi Office ikut, token ESB tidak', esbP[0].body.sesi === 'tok-uji' && !('token' in esbP[0].body));
    cek('tidak ada pertanyaan (bukan bulan Excel)', !panggilan.some(p => p.confirm), JSON.stringify(panggilan.filter(p => p.confirm)));
    const sv = panggilan.filter(p => p.body && p.body.action === 'analyticsSave');
    cek('disimpan PER BULAN (2x) tanpa pratinjau', sv.length === 2, sv.length);
    const u = w.eval('AN.data.laporan["2026-09"]');
    cek('September tersimpan', !!u);
    if (u) {
      cek('dikenali sebagai laporan per menu', u.jenis === 'menu', u.jenis);
      cek('bill batal & ganda tidak ikut: 5 bill', u.ringkas.bill === 5, u.ringkas.bill);
      cek('grand = jumlah grandTotal bill', bulat(u.ringkas.grand) === bulat(GRAND), u.ringkas.grand);
      cek('service = otherTaxValue (bukan vat)', bulat(u.ringkas.svc) === bulat(2121430.5 + 11250 + 1000), u.ringkas.svc);
      cek('pajak = vatValue', bulat(u.ringkas.tax) === 24500, u.ringkas.tax);
      cek('pax tidak dihitung per baris menu', u.ringkas.pax === 5, u.ringkas.pax);
      cek('menu biasa terhitung', u.menu['ICE KOPI LAKSAMANA'] && u.menu['ICE KOPI LAKSAMANA'].qty === 6);
      const uk = (u.ukuran || {})['ICE KOPI LAKSAMANA'];
      cek('paket REGULAR menempel ke induknya', !!(uk && uk.REGULAR && uk.REGULAR.KOPISUSU001 && uk.REGULAR.KOPISUSU001.qty === 6));
      cek('menu batal tidak ikut', !u.menu['HANTU']);
      cek('kategori EVENT terbaca', !!(u.kategori && u.kategori['EVENT']));
      cek('cara datang DINE IN', u.kunjung && u.kunjung['DINE IN'] && bulat(u.kunjung['DINE IN'].grand) === bulat(GRAND));
      cek('meja terbaca', !!(u.meja && u.meja['24']));
      cek('jam 23 terisi', u.hariJam && u.hariJam['2026-09-30'] && u.hariJam['2026-09-30'][23]);
      const by = u.bayar || {};
      const sumBy = Object.values(by).reduce((a, x) => a + (x.grand || 0), 0);
      cek('omset per metode bayar berjumlah pas', bulat(sumBy) === bulat(GRAND), sumBy);
      cek('kembalian tunai tidak jadi omset', by.CASH && bulat(by.CASH.grand) === 313750, JSON.stringify(by.CASH));
      cek('jejak sinkron dicatat', u.esb && u.esb.sampai === '2026-09-30' && u.esb.billBatal === 1 && u.esb.ganda === 1, JSON.stringify(u.esb));
    }
    const o = w.eval('AN.data.laporan["2026-10"]');
    cek('Oktober tersimpan s.d. 5 Okt', o && o.esb && o.esb.sampai === '2026-10-05' && o.ringkas.bill === 1);
    w.eval("go('ringkasan')"); await tunggu(30);
    cek('Ringkasan menyebut tersinkron s.d. tanggalnya', /tersinkron s\.d\. <b>5 Okt 2026<\/b>/.test(w.document.getElementById('app-view').innerHTML));
    cek('tombol bisa ditekan lagi', w.eval('ESB_JALAN') === null);
  }

  console.log('\n== 2. Sinkron kedua: bulan yang sudah tuntas tidak ditarik lagi ==');
  {
    const lap = { '2026-09': { ringkas:{ bill:5 }, hari:{}, esb:{ sampai:'2026-09-30' } } };
    const { dom, panggilan } = domAnalytics({ esb: esbBiasa, laporan: lap });
    const w = dom.window; await siap(w);
    await w.anSinkronEsb();
    const esbP = panggilan.filter(p => p.body && p.body.action === 'esbHalaman');
    cek('hanya Oktober', esbP.length && esbP.every(p => p.body.dari === '2026-10-01'), JSON.stringify(esbP.map(p => p.body.dari)));
  }

  console.log('\n== 3. Bulan ini dari Excel: ditanya dulu; ditolak = tidak ada apa pun ==');
  {
    const lap = { '2026-10': { ringkas:{ bill:9 }, hari:{} } };
    const { dom, panggilan } = domAnalytics({ esb: esbBiasa, laporan: lap, tolak: true });
    const w = dom.window; await siap(w);
    await w.anSinkronEsb();
    cek('pertanyaan menyebut Excel', panggilan.some(p => p.confirm && /unggahan Excel/.test(p.confirm)));
    cek('ditolak: tidak ada tarikan', !panggilan.some(p => p.body && p.body.action === 'esbHalaman'));
  }

  console.log('\n== 4. ESB tidak menyebut jumlah halaman: lanjut sampai kosong ==');
  {
    const { dom, panggilan } = domAnalytics({ esb: b => ({ ok:true, data:{
      bills: b.page === 1 ? [BILL_OKT] : [], page:b.page, pageCount:null } }) });
    const w = dom.window; await siap(w);
    await w.anSinkronEsb();
    const n = panggilan.filter(p => p.body && p.body.action === 'esbHalaman').length;
    cek('berhenti di halaman kosong', n === 2, n);
    cek('Oktober tersimpan', !!w.eval('AN.data.laporan["2026-10"]'));
  }

  console.log('\n== 5. Satu halaman gagal: bulan lalu tetap, bulan ini tidak disimpan bolong ==');
  {
    const { dom, panggilan } = domAnalytics({ laporan: SEPT_SETENGAH, esb: b => b.dari === '2026-10-01' && b.page === 1
      ? { ok:false, error:'ESB menjawab HTTP 500' } : esbBiasa(b) });
    const w = dom.window; await siap(w);
    await w.anSinkronEsb();
    const st = w.document.getElementById('esb_status').innerHTML;
    cek('galatnya disebut dengan nomor halaman', /Halaman 1/.test(st), st);
    cek('yang sudah tersimpan disebut', /Sep 2026/.test(st), st);
    cek('September tetap tersimpan', w.eval('AN.data.laporan["2026-09"].esb.sampai') === '2026-09-30');
    cek('Oktober tidak lahir', !w.eval('AN.data.laporan["2026-10"]'));
    cek('tombol bisa ditekan lagi', w.document.getElementById('esb_btn').disabled === false);
  }

  console.log('\n== 6. Token ESB ditolak: tidak diulang-ulang ==');
  {
    let n = 0;
    const { dom } = domAnalytics({ esb: () => { n++; return { ok:false, error:'Token ESB ditolak (HTTP 401).' }; } });
    const w = dom.window; await siap(w);
    await w.anSinkronEsb();
    cek('sekali coba saja', n === 1, n);
    cek('pesannya menyebut token', /Token ESB ditolak/.test(w.document.getElementById('esb_status').innerHTML));
  }

  console.log('\n== 6b. Server menolak simpan: ringkasan lama dipulihkan ==');
  {
    const lap = { '2026-10': { ringkas:{ bill:9 }, hari:{}, esb:{ sampai:'2026-10-02' } } };
    const { dom } = domAnalytics({ esb: esbBiasa, laporan: lap, gagalSimpan: true });
    const w = dom.window; await siap(w);
    await w.anSinkronEsb();
    cek('ringkasan lama tetap (bukan hasil yang tidak tersimpan)', w.eval('AN.data.laporan["2026-10"].ringkas.bill') === 9);
    cek('galatnya disebut', /Gagal menyimpan/.test(w.document.getElementById('esb_status').innerHTML));
  }

  console.log('\n== 7. Server (lib_esb.php) ==');
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
