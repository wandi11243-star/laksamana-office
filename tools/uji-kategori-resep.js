/* uji-kategori-resep.js — Kategori resep di penyunting HPP (29 Sep 2026)
 *
 *   node tools/uji-kategori-resep.js
 *
 * Permintaan user: saat membuat resep baru bisa langsung memilih Prasmanan /
 * Menu jadi / Base & olahan, dan bisa diubah. Prasmanan TIDAK punya kolom
 * sendiri — ia dikenali dari seksi berawalan PRASMANAN — jadi yang diuji
 * adalah isi KIRIMAN simpanResep (tipe + seksi), bukan cuma tampilan.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const { JSDOM } = (() => {
  for (const p of [process.env.JSDOM_PATH, path.join(ROOT, 'node_modules', 'jsdom'), 'jsdom']) {
    if (!p) continue;
    try { return require(p); } catch (e) {}
  }
  console.error('jsdom tidak ketemu. Setel JSDOM_PATH.'); process.exit(2);
})();
let ok = 0, gagal = 0;
const cek = (n, s, k) => { if (s) { ok++; console.log('  OK   ' + n); } else { gagal++; console.log('  GAGAL ' + n + (k ? '  — ' + k : '')); } };
const tunggu = ms => new Promise(r => setTimeout(r, ms));
const HTML = fs.readFileSync(path.join(ROOT, 'deploy/stock/hpp/index.html'), 'utf8');

const RESEP = [
  { id:'p1', nama:'Ayam Bakar', jenis:'food', tipe:'dish', seksi:'PRASMANAN - AYAM', yield_qty:1, yield_unit:'Porsi', harga_baru:26000, bahan:[], aktif:1 },
  { id:'d1', nama:'Nasi Goreng', jenis:'food', tipe:'dish', seksi:'DISH (NASI)', yield_qty:1, yield_unit:'Porsi', harga_baru:30000, bahan:[], aktif:1 },
  { id:'b1', nama:'Sambal', jenis:'food', tipe:'base', seksi:'SAUCE', yield_qty:500, yield_unit:'Gr', bahan:[], aktif:1 },
];
const KIRIM = [];
function buka() {
  return new JSDOM(HTML, { runScripts:'dangerously', url:'https://dev.laksamanamuda.id/stock/hpp/', pretendToBeVisual:true,
    beforeParse(w) {
      w.localStorage.setItem('lm_session', JSON.stringify({ userId:'u1', name:'Uji', modules:['hpp'], adminModules:['hpp'], expiry:Date.now()+3600e3 }));
      w.fetch = (url, opt) => {
        const u = String(url);
        if (opt && opt.body) { try { KIRIM.push(JSON.parse(opt.body)); } catch (e) {} }
        const body = u.indexOf('items.php') > -1 ? { products:{} }
          : (opt && opt.body) ? { status:'success', ok:true }
          : { status:'success', bahan:[], resep:RESEP, setting:{ targetFood:0.33, targetDrink:0.33, buffer:0.05, lampuKuning:3, lampuMerah:8 } };
        const t = JSON.stringify(body);
        return Promise.resolve({ ok:true, status:200, text:() => Promise.resolve(t), json:() => Promise.resolve(body) });
      };
      w.print = () => {}; w.alert = () => {}; w.confirm = () => true;
    } }).window;
}
const kat = w => (w.document.getElementById('ed_kat') || {}).value;
const ed = (w, s) => w.eval('ED' + s);
async function simpan(w) {
  const n = KIRIM.length; w.simpanResep();
  await tunggu(150);
  const k = KIRIM.slice(n).find(x => x.action === 'simpanResep');
  return k ? k.data : null;
}

(async () => {
  const w = buka(); await tunggu(150);

  console.log('\n== pilihannya tiga, sama dengan ketiga tab ==');
  w.bukaResep('d1');
  const sel = w.document.getElementById('ed_kat');
  cek('kotak Kategori ada di penyunting', !!sel);
  cek('isinya Menu jadi / Prasmanan / Base', sel && [...sel.options].map(o => o.value).join(',') === 'dish,pras,base');
  cek('resep lama terbaca kategorinya: menu jadi', kat(w) === 'dish');
  w.tutupModal(); w.bukaResep('p1'); cek('resep berseksi PRASMANAN terbaca prasmanan', kat(w) === 'pras');
  w.tutupModal(); w.bukaResep('b1'); cek('resep base terbaca base', kat(w) === 'base');
  w.tutupModal();

  console.log('\n== resep BARU mengikuti tab yang terbuka ==');
  for (const [tab, harap] of [['pras','pras'], ['base','base'], ['dish','dish']]) {
    w.eval("F.tab=" + JSON.stringify(tab)); w.bukaResep('');
    cek('tab ' + tab + ' -> kategori ' + harap, kat(w) === harap, kat(w));
    w.tutupModal();
  }

  console.log('\n== resep baru prasmanan: tersimpan sebagai dish + seksi PRASMANAN ==');
  w.eval("F.tab='dish'"); w.bukaResep('');
  w.document.getElementById('ed_kat').value = 'pras';
  w.document.getElementById('ed_kat').dispatchEvent(new w.Event('change'));
  cek('kotak harga jual muncul untuk prasmanan', /Harga jual/.test(w.document.getElementById('modal').innerHTML));
  w.eval("ED.nama='Rendang Prasmanan'");
  let d = await simpan(w);
  cek('terkirim', !!d);
  cek('tipe = dish', d && d.tipe === 'dish', d && d.tipe);
  cek('seksi = PRASMANAN', d && d.seksi === 'PRASMANAN', d && d.seksi);
  cek('kiriman terbaca prasmanan oleh penyaring tab', d && w.prasmananKah(d));
  w.tutupModal();

  console.log('\n== seksi yang sudah diketik DIPERTAHANKAN ==');
  w.bukaResep(''); w.eval("ED.nama='Ayam X'; ED.seksi='AYAM'"); w.setKategoriResep('pras');
  cek('menjadi "PRASMANAN - AYAM"', ed(w, '.seksi') === 'PRASMANAN - AYAM', ed(w, '.seksi'));
  w.setKategoriResep('pras');
  cek('memilih prasmanan dua kali tidak menggandakan awalan', ed(w, '.seksi') === 'PRASMANAN - AYAM', ed(w, '.seksi'));
  w.tutupModal();

  console.log('\n== resep lama bisa DIUBAH kategorinya ==');
  w.bukaResep('p1'); w.setKategoriResep('dish');
  d = await simpan(w);
  cek('prasmanan -> menu jadi: awalan dibuang, sisa seksi tetap', d && d.tipe === 'dish' && d.seksi === 'AYAM', d && d.seksi);
  cek('dan TIDAK lagi terbaca prasmanan', d && !w.prasmananKah(d));
  cek('id tetap (mengubah, bukan membuat baru)', d && d.id === 'p1');
  w.tutupModal();
  w.bukaResep('p1'); w.setKategoriResep('base');
  d = await simpan(w);
  cek('prasmanan -> base: tipe base, keluar dari tab prasmanan', d && d.tipe === 'base' && d.seksi === 'AYAM' && !w.prasmananKah(d), JSON.stringify(d && [d.tipe, d.seksi]));
  w.tutupModal();
  w.bukaResep('b1'); w.setKategoriResep('pras');
  d = await simpan(w);
  cek('base -> prasmanan: tipe dish + "PRASMANAN - SAUCE"', d && d.tipe === 'dish' && d.seksi === 'PRASMANAN - SAUCE', JSON.stringify(d && [d.tipe, d.seksi]));
  w.tutupModal();
  w.bukaResep('d1'); w.setKategoriResep('base');
  d = await simpan(w);
  cek('menu jadi -> base: seksi tidak disentuh', d && d.tipe === 'base' && d.seksi === 'DISH (NASI)');
  w.tutupModal();

  console.log('\n== data di memori tidak ikut berubah sebelum server menjawab ==');
  cek('S.resep p1 masih seksi aslinya', w.eval("S.resep.find(function(r){return r.id==='p1';}).seksi") === 'PRASMANAN - AYAM');

  console.log('\n== mengetik seksi menyegarkan kotak Kategori ==');
  w.bukaResep('d1');
  const inp = [...w.document.querySelectorAll('#modal input')].find(i => /DISH \(NASI\)/.test(i.value));
  inp.value = 'PRASMANAN - SNACK'; inp.dispatchEvent(new w.Event('input'));
  cek('kotak Kategori ikut jadi Prasmanan', kat(w) === 'pras', kat(w));
  w.tutupModal();

  console.log('\nLULUS ' + ok + '   GAGAL ' + gagal);
  process.exit(gagal ? 1 : 0);
})();
