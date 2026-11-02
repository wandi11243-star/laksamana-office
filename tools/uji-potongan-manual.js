/* Uji POTONGAN KASIR SHIFT dengan nominal manual (2 Nov 2026, permintaan user:
   "bisa isiin jumlah pembagian, tidak mesti harus bagi 2").

   1. potonganBaris()/potonganHari() DIPOTONG dari KETIGA berkas kembar
      (finance/omset, finance/kas, cashier) lalu dijalankan atas baris yang
      sama — hasilnya wajib sama persis.
   2. Modal Potongan Kasir Shift di finance/omset dijalankan di jsdom: mode
      manual, jumlah yang meleset menahan Simpan, yang pas menulis shiftNom.

     JSDOM_PATH=... node tools/uji-potongan-manual.js */
const fs = require('fs'), path = require('path');
const { JSDOM, VirtualConsole } = require(process.env.JSDOM_PATH || 'jsdom');
const ROOT = path.join(__dirname, '..');
const BERKAS = { omset: 'deploy/finance/omset/index.html', kas: 'deploy/finance/kas/index.html', cashier: 'deploy/cashier/index.html' };
let ok = 0, gagal = 0;
const cek = (n, s, k) => { if (s) { ok++; console.log('  OK   ' + n); } else { gagal++; console.log('  GAGAL ' + n + (k ? '\n         -> ' + k : '')); } };

function fungsi(src, nama) {
  const a = src.indexOf('function ' + nama + '(');
  if (a < 0) throw new Error(nama + ' tidak ada');
  let i = src.indexOf('{', a), d = 0;
  for (; i < src.length; i++) { if (src[i] === '{') d++; else if (src[i] === '}' && --d === 0) break; }
  return src.slice(a, i + 1);
}

console.log('== Rumus di ketiga berkas ==');
const hasil = {};
for (const k in BERKAS) {
  const src = fs.readFileSync(path.join(ROOT, BERKAS[k]), 'utf8').replace(/\r\n/g, '\n');
  const num = v => { const n = parseInt(String(v).replace(/[^0-9-]/g, ''), 10); return isNaN(n) ? 0 : n; };
  const M = new Function('num', 'potongKasir', 'porsiPic',
    fungsi(src, 'potonganBaris') + '\n' + fungsi(src, 'potonganHari') + '\nreturn {potonganBaris, potonganHari};')(
    num, r => num(r.amount), r => num(r.amount));
  const rata = { amount: 7000000, shift: ['a', 'b'] };
  const manual = { amount: 7000000, shift: ['a', 'b'], shiftNom: { a: 5000000, b: 2000000 } };
  const meleset = { amount: 7000000, shift: ['a', 'b'], shiftNom: { a: 5000000, b: 1000000 } };
  const kurangOrang = { amount: 7000000, shift: ['a', 'b', 'c'], shiftNom: { a: 5000000, b: 2000000 } };
  hasil[k] = [
    M.potonganHari({ bd: { marketing: [rata] } }, 'a'),
    M.potonganHari({ bd: { marketing: [manual] } }, 'a'),
    M.potonganHari({ bd: { marketing: [manual] } }, 'b'),
    M.potonganHari({ bd: { marketing: [meleset] } }, 'a'),
    M.potonganHari({ bd: { marketing: [kurangOrang] } }, 'a'),
    M.potonganBaris(manual).manual,
  ];
  cek(k + ': bagi rata 7jt / 2 = 3,5jt', hasil[k][0] === 3500000, hasil[k][0]);
  cek(k + ': manual a = 5jt, b = 2jt', hasil[k][1] === 5000000 && hasil[k][2] === 2000000, hasil[k].join(','));
  cek(k + ': jumlah meleset -> jatuh ke bagi rata', hasil[k][3] === 3500000, hasil[k][3]);
  cek(k + ': kasir tanpa nominal -> jatuh ke bagi rata', hasil[k][4] === Math.round(7000000 / 3), hasil[k][4]);
}
cek('ketiga berkas memberi hasil yang sama', JSON.stringify(hasil.omset) === JSON.stringify(hasil.kas) && JSON.stringify(hasil.kas) === JSON.stringify(hasil.cashier),
  JSON.stringify(hasil));

(async () => {
  console.log('\n== Modal di Breakdown Sumber ==');
  const html = fs.readFileSync(path.join(ROOT, BERKAS.omset), 'utf8').replace(/<script[^>]+src=["']https?:[^"']+["'][^>]*><\/script>/g, '');
  const dom = new JSDOM(html, { url: 'https://team.laksamanamuda.id/finance/omset/', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: new VirtualConsole() });
  const w = dom.window, d = w.document;
  w.fetch = () => new Promise(() => {});
  await new Promise(r => setTimeout(r, 500));
  w.eval("DB = DB || {}; DB.employees = { kasir:[{id:'a',name:'Faila'},{id:'b',name:'Rizki'},{id:'c',name:'Cindy'}], marketing:[], event:[] };");
  w.eval("window.__row = { amount:7000000, shift:['a','b'], eventName:'Mahacare' }; window.__simpan = 0;");
  w.eval("modalBagiHasil(window.__row, 'Mahacare', ()=>{ window.__simpan++; }, DB.employees.kasir);");
  const ovl = () => d.querySelector('.ovl');
  cek('modal terbuka', !!ovl());
  cek('bawaan bagi rata: 3.500.000', /3\.500\.000/.test(d.getElementById('bh_prev').textContent));
  d.querySelector('#bh_mode [data-mode="manual"]').click();
  const kotak = [...d.querySelectorAll('.bh_nominal')];
  cek('mode manual: satu kotak per kasir tercentang', kotak.length === 2, kotak.length);
  cek('kotak mulai dari bagi rata', kotak.every(k => k.value === '3.500.000'), kotak.map(k => k.value).join(','));
  kotak[0].value = '5.000.000'; kotak[0].dispatchEvent(new w.Event('input', { bubbles: true }));
  cek('jumlah meleset: Simpan dimatikan', d.getElementById('bh_ok').disabled === true);
  cek('...dan selisihnya disebut', /lebih/.test(d.getElementById('bh_prev').textContent) && /1\.500\.000/.test(d.getElementById('bh_prev').textContent),
    d.getElementById('bh_prev').textContent);
  d.getElementById('bh_ok').disabled = false; d.getElementById('bh_ok').click();
  cek('penjaga kedua: klik paksa tidak menyimpan', w.__simpan === 0 && !w.__row.shiftNom);
  kotak[1].value = '2.000.000'; kotak[1].dispatchEvent(new w.Event('input', { bubbles: true }));
  cek('jumlah pas: Simpan hidup', d.getElementById('bh_ok').disabled === false);
  d.getElementById('bh_ok').click();
  cek('tersimpan: shiftNom {a:5jt, b:2jt}', w.__simpan === 1 && w.__row.shiftNom && w.__row.shiftNom.a === 5000000 && w.__row.shiftNom.b === 2000000,
    JSON.stringify(w.__row.shiftNom));
  cek('potonganHari membaca nominal manual', w.eval("potonganHari({bd:{marketing:[window.__row]}}, 'a')") === 5000000);

  // Kembali ke bagi rata = shiftNom dibuang.
  w.eval("modalBagiHasil(window.__row, 'Mahacare', ()=>{ window.__simpan++; }, DB.employees.kasir);");
  cek('dibuka lagi: langsung mode manual dengan angkanya', [...d.querySelectorAll('.bh_nominal')].map(k => k.value).join(',') === '5.000.000,2.000.000');
  d.querySelector('#bh_mode [data-mode="rata"]').click();
  d.getElementById('bh_ok').click();
  cek('bagi rata lagi: shiftNom dibuang', w.__simpan === 2 && !('shiftNom' in w.__row));

  console.log('\n' + ok + ' OK, ' + gagal + ' GAGAL');
  process.exit(gagal ? 1 : 0);
})();
