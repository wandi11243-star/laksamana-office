'use strict';
/* uji-kalkulator-hpp.js — Menu Kalkulator Marketing membaca Prasmanan HPP (27 Sep 2026)
 *   node tools/uji-kalkulator-hpp.js
 * 1. assets/hpp-mesin.js TIDAK BASI terhadap rumus modul HPP (gen-hpp-mesin --cek).
 * 2. Mesin = rumus asli modul HPP untuk SELURUH resep di tools/hpp-master.json.
 * 3. Kalkulator (jsdom): sumber HPP, marketing tanpa modal, admin dapat modal, gagal dikatakan.
 */
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..');
const { JSDOM, VirtualConsole } = (() => { for (const p of [process.env.JSDOM_PATH, path.join(ROOT, 'node_modules', 'jsdom'), 'jsdom']) { if (!p) continue; try { return require(p); } catch (e) {} } console.error('jsdom tidak ketemu. Setel JSDOM_PATH.'); process.exit(2); })();
/* Data HPP SUNGGUHAN (tools/hpp-master.json, di .gitignore — isinya harga beli). Tanpa berkas itu bagian jsdom MELEWAT; pemeriksaan mesin-tidak-basi tetap jalan. */
const HPP_P = path.join(__dirname, 'hpp-master.json');
const hppTeks = fs.existsSync(HPP_P) ? fs.readFileSync(HPP_P, 'utf8') : null;
const itemTeks = JSON.stringify({ products: {} });
let ok = 0, gagal = 0;
const cek = (n, s, k) => { if (s) { ok++; console.log('  OK   ' + n); } else { gagal++; console.log('  GAGAL ' + n + (k ? '  — ' + k : '')); } };
const tunggu = ms => new Promise(r => setTimeout(r, ms));

function buka(opsi) {
  const inline = f => '<script>' + fs.readFileSync(path.join(ROOT, 'deploy/assets/' + f), 'utf8') + '</script>';
  const html = fs.readFileSync(path.join(ROOT, 'deploy/marketing/index.html'), 'utf8')
    .replace(/<script[^>]*\ssrc="[^"]*performa-bonus\.js"[^>]*><\/script>/i, inline('performa-bonus.js'))
    .replace(/<script[^>]*\ssrc="[^"]*venue-layouts\.js"[^>]*><\/script>/i, inline('venue-layouts.js'))
    .replace(/<script[^>]*\ssrc="[^"]*hpp-mesin\.js"[^>]*><\/script>/i, inline('hpp-mesin.js'))
    .replace(/<script[^>]*\ssrc=[^>]*><\/script>/gi, '');
  const vc = new VirtualConsole();
  vc.on('jsdomError', e => { const t = String((e && e.detail && e.detail.stack) || e.message || e); if (!/Not implemented|Could not parse CSS/.test(t)) console.log('  !! ' + t.split('\n')[0]); });
  const jejak = { hpp: 0, item: 0, tulis: 0 };
  const dom = new JSDOM(html, { virtualConsole: vc, runScripts: 'dangerously', url: 'https://dev.laksamanamuda.id/marketing/',
    beforeParse(w) {
      w.localStorage.setItem('lm_session', JSON.stringify({ id: 'u-a', name: 'Aurel', modules: ['marketing'],
        adminModules: opsi.admin ? ['marketing'] : [], token: 't', expiry: Date.now() + 86400000 }));
      w.fetch = () => new Promise(() => {});
      w.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
      w.Chart = class { destroy() {} update() {} };
      w.HTMLCanvasElement.prototype.getContext = () => ({});
    } });
  const w = dom.window;
  const balas = t => Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve(t), json: () => Promise.resolve(JSON.parse(t)) });
  w.fetch = (url, o) => {
    const u = String(url);
    if (u.indexOf('hpp.php') > -1) { jejak.hpp++; return opsi.hppGagal ? Promise.reject(new Error('jaringan putus')) : balas(hppTeks); }
    if (u.indexOf('items.php') > -1) { jejak.item++; return balas(itemTeks); }
    if (o && o.method === 'POST') jejak.tulis++;
    return balas(JSON.stringify({ ok: true, data: {} }));
  };
  w.eval('S = normalizeState(seed()); S.users=[{id:"u-a",name:"Aurel",div:"Marketing",role:' + JSON.stringify(opsi.admin ? 'super_admin' : 'marketing') + '}]; ME=S.users[0];');
  return { w, jejak };
}

(async () => {
  console.log('\n== mesin tidak basi ==');
  const { bangkitkan, NAMA, iris } = require('./gen-hpp-mesin.js');
  cek('assets/hpp-mesin.js sama dengan hasil bangkitkan dari modul HPP',
      fs.readFileSync(path.join(ROOT, 'deploy/assets/hpp-mesin.js'), 'utf8').replace(/\r\n/g, '\n') === bangkitkan(),
      'jalankan: node tools/gen-hpp-mesin.js');
  if (!hppTeks) {
    console.log('LEWAT — tools/hpp-master.json tidak ada; bagian data & jsdom tidak diuji.');
    console.log('\nLULUS ' + ok + '   GAGAL ' + gagal); process.exit(gagal ? 1 : 0);
  }
  {
    const hpp = JSON.parse(hppTeks), sal = o => JSON.parse(JSON.stringify(o));
    const dt = () => ({ bahan: sal(hpp.bahan), resep: sal(hpp.resep), setting: hpp.setting || {}, produk: {} });
    const W = {}; new Function('window', fs.readFileSync(path.join(ROOT, 'deploy/assets/hpp-mesin.js'), 'utf8'))(W);
    const M = W.LMHppMesin(dt());
    const A = new Function('data',
      'var S={bahan:data.bahan,resep:data.resep};var SET={targetFood:0.33,targetDrink:0.33,buffer:0.05};'
      + 'var PRODUK=data.produk,PB={},PR={},MEMO={};\n' + NAMA.map(iris).join('\n')
      + '\nSET=Object.assign(SET,data.setting);S.resep.forEach(function(r){if(!num(r.harga_baru)&&num(r.harga_lama))r.harga_baru=num(r.harga_lama);});'
      + 'petakan();return {modalPorsi:modalPorsi,resep:S.resep};')(dt());
    const beda = M.resep.filter((r, i) => Math.abs(M.modalPorsi(r) - A.modalPorsi(A.resep[i])) > 1e-6).map(r => r.nama);
    cek('modal per porsi SELURUH ' + M.resep.length + ' resep = rumus asli modul HPP', !beda.length, beda.slice(0, 5).join(', '));
  }
  console.log('\n== tim marketing ==');
  {
    const { w, jejak } = buka({ admin: false });
    w.eval("go('kalkulator')");
    cek('sebelum HPP menjawab: tampil "Memuat menu Prasmanan"', /Memuat menu Prasmanan/.test(w.document.getElementById('view').innerHTML));
    await tunggu(300);
    const v = () => w.document.getElementById('view').innerHTML;
    cek('HPP dibaca sekali', jejak.hpp === 1, 'hpp=' + jejak.hpp);
    cek('marketing TIDAK menarik items.php (tidak butuh rumus modal)', jejak.item === 0);
    cek('kalkulator tergambar (tabel menu)', /kalk_body/.test(v()));
    cek('keterangan menyebut sumber HPP Prasmanan', /Prasmanan<\/b> di modul <b>HPP &amp; Resep/.test(v()));
    const kat = JSON.parse(w.eval('JSON.stringify(kalkKategori().map(k=>k.kat))'));
    cek('kategori dari seksi PRASMANAN HPP', kat.length === 10 && kat.indexOf('Protein Berat') > -1, kat.join(', '));
    const semua = JSON.parse(w.eval('JSON.stringify(kalkMenuAll())'));
    cek('41 menu prasmanan HPP ditawarkan', semua.length === 41, semua.length);
    const es = semua.find(m => m.n === 'Es Kasturi');
    cek('harga jual dari HPP (Es Kasturi Rp3.000)', es && es.h === 3000, JSON.stringify(es));
    w.eval("KALK.rows=[{ref:'Drink|Es Kasturi',pcs:100}]; KALK.pax=100; renderKalkulator($('view'))");
    await tunggu(20);
    cek('harga jual / pax terhitung (Rp3.000)', /Rp\s?3\.000 \/ pax/.test(w.document.getElementById('kalk_perpax').textContent), w.document.getElementById('kalk_perpax').textContent);
    cek('TIDAK ada kolom/kartu modal untuk marketing', !/Modal \/ porsi|khusus admin|kalk_cogs/.test(v()));
    cek('Database Menu tetap dari S.menuDb (tidak diganti)', /function mdbItems\(j\)\{ return \(\(S\.menuDb/.test(fs.readFileSync(path.join(ROOT, 'deploy/marketing/index.html'), 'utf8')));
    cek('tidak ada satu pun tulisan ke server', jejak.tulis === 0, 'tulis=' + jejak.tulis);
  }
  console.log('\n== admin ==');
  {
    const { w, jejak } = buka({ admin: true });
    w.eval("go('kalkulator')"); await tunggu(300);
    cek('admin terdeteksi', w.eval('kalkAdmin()') === true);
    cek('admin menarik items.php (untuk rumus modal)', jejak.item === 1);
    const mp = w.eval("Math.round(kalkModalPorsi(kalkItemRef('Drink|Es Kasturi')))");
    cek('modal per porsi admin = modul HPP (Es Kasturi 654)', mp === 654, mp);
  }
  console.log('\n== HPP tidak menjawab ==');
  {
    const { w } = buka({ admin: false, hppGagal: true });
    w.eval("go('kalkulator')"); await tunggu(200);
    const v = w.document.getElementById('view').innerHTML;
    cek('sebabnya dikatakan + tombol Coba lagi', /tidak terbaca/.test(v) && /Coba lagi/.test(v));
  }
  console.log('\nLULUS ' + ok + '   GAGAL ' + gagal);
  process.exit(gagal ? 1 : 0);
})();
