/* Uji SIMPAN PARSIAL (delta) modul Marketing (1 Oktober 2026).

   getAll Marketing 2,2 MB dan 1,74 MB-nya (79%) adalah gambar base64 di
   designreqs[].refs[].v — dari TIGA baris saja. Dulu SETIAP simpan mengirim
   ulang seluruhnya, termasuk dari orang yang cuma mencentang satu task. Kini
   klien hanya mengirim baris yang BERUBAH + daftar `hapus` eksplisit, dan itu
   hanya dipakai kalau server mengiklankan `_fitur:['delta']` — server lama yang
   menerima baris sepotong akan menganggap sisanya "dihapus user".

   Server tiruannya MENIRU ATURAN PHP (upsert_collection /
   upsert_settings_collection + hapus eksplisit), dan asersinya membaca ISI
   SERVER, bukan layar.

     node tools/uji-delta-marketing.js
*/
'use strict';
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

let ok = 0, gagal = 0;
const cek = (n, s, k) => { if (s) { ok++; console.log('  OK   ' + n); } else { gagal++; console.log('  GAGAL ' + n + (k ? '  -> ' + k : '')); } };
const tunggu = ms => new Promise(r => setTimeout(r, ms));
const salin = o => JSON.parse(JSON.stringify(o));

const MKT = fs.readFileSync(path.join(ROOT, 'deploy/marketing/index.html'), 'utf8');
const HTML = MKT
  .replace(/<script[^>]*\ssrc="[^"]*performa-bonus\.js"[^>]*><\/script>/i,
    () => '<script>' + fs.readFileSync(path.join(ROOT, 'deploy/assets/performa-bonus.js'), 'utf8') + '</script>')
  .replace(/<script[^>]*\ssrc="[^"]*venue-layouts\.js"[^>]*><\/script>/i,
    () => '<script>' + fs.readFileSync(path.join(ROOT, 'deploy/assets/venue-layouts.js'), 'utf8') + '</script>')
  .replace(/<script[^>]*\ssrc=[^>]*><\/script>/gi, '');

const SEKARANG = Date.now();
const BLOB = 'data:image/jpeg;base64,' + 'B'.repeat(120000);   // gambar referensi d1

function buatServer() {
  const SRV = {
    events: { e1: { id:'e1', nama:'Event Lama', tanggal:'2026-12-01', status:'Confirmed', pipeCol:'Confirmed', updatedAt: SEKARANG - 60000 } },
    designreqs: { d1: { id:'d1', judul:'Request Lama', status:'open', refs:[{ t:'img', v:BLOB, n:'ref.jpg' }], updatedAt: SEKARANG - 3600000 } },
    clients: {}, users: {}, staff: {}, vip: {}, kalkHistori: {},
    simpan: [],
  };
  const versiServer = () => Math.max(0, ...['events', 'designreqs'].flatMap(k => Object.values(SRV[k]).map(r => r.updatedAt || 0)));
  const get = () => ({ ok:true, data:{
    _fitur:['delta'], _versi: versiServer(),
    events: Object.values(SRV.events).map(salin),
    designreqs: Object.values(SRV.designreqs).map(salin),
    clients: [], users: Object.values(SRV.users).map(salin), staff: [], vip: [], kalkHistori: [],
    settings: {}, baseline: 0,
  }});
  const post = body => {
    SRV.simpan.push(salin(body));
    const st = body.data || {}, hp = body.hapus || null;
    ['events', 'clients', 'users', 'staff'].forEach(k => {
      if (Array.isArray(st[k])) st[k].forEach(r => {
        if (!r || !r.id) return;
        const s = salin(r); delete s.baseUpdatedAt; SRV[k][r.id] = s;
      });
      if (hp && Array.isArray(hp[k])) hp[k].forEach(id => { delete SRV[k][id]; });
    });
    ['designreqs', 'vip', 'kalkHistori'].forEach(k => {
      if (Array.isArray(st[k])) st[k].forEach(r => {
        if (!r || !r.id) return;
        const s = salin(r); delete s.baseUpdatedAt; SRV[k][r.id] = s;
      });
      if (hp && Array.isArray(hp[k])) hp[k].forEach(id => { delete SRV[k][id]; });
    });
    return { ok:true, data:{ bentrok:[], versi:{} } };
  };
  return { SRV, get, post };
}

function buatTab(srv) {
  const vc = new VirtualConsole(); vc.on('jsdomError', () => {});
  return new JSDOM(HTML, { virtualConsole: vc, runScripts: 'dangerously',
    url: 'https://dev.laksamanamuda.id/marketing/',
    beforeParse(w) {
      w.localStorage.setItem('lm_session', JSON.stringify({ id:'u1', name:'Uji',
        modules:['marketing'], adminModules:['marketing'], token:'t', expiry: Date.now() + 86400000 }));
      w.matchMedia = () => ({ matches:false, addListener(){}, removeListener(){}, addEventListener(){}, removeEventListener(){} });
      w.print = () => {}; w.confirm = () => true; w.alert = () => {}; w.scrollTo = () => {};
      w.Chart = class { destroy(){} update(){} };
      w.HTMLCanvasElement.prototype.getContext = () => ({});
      w.fetch = async (url, init) => {
        const u = String(url);
        const b = init && init.body ? JSON.parse(init.body) : {};
        const bal = o => ({ ok:true, status:200, text: async () => JSON.stringify(o), json: async () => o });
        if (u.indexOf('account-api') > -1) return bal({ ok:true, members: [] });
        if (b.action === 'saveAll') return bal(srv.post(b));
        if (u.indexOf('marketing-api') > -1 && u.indexOf('getAll') > -1) return bal(srv.get());
        return bal({ ok:true, data:{} });
      };
    } });
}
async function siap(w) {
  for (let i = 0; i < 200; i++) {
    try { if (w.eval('typeof S !== "undefined" && S && Array.isArray(S.events) && S.events.length && _sejakVersi > 0 && MKT_BISA_DELTA === true')) return; } catch (e) {}
    await tunggu(50);
  }
  throw new Error('modul Marketing tidak pernah siap dengan mode delta');
}
async function simpanTab(w) {
  w.eval('save()');
  for (let i = 0; i < 100; i++) { await tunggu(50); try { if (!w.eval('saveInFlight')) break; } catch (e) {} }
  await tunggu(100);
}
const saves = srv => srv.SRV.simpan.filter(p => p && p.action === 'saveAll');

(async () => {
  console.log('\n== mode parsial: hanya baris berubah yang dikirim ==');
  {
    const srv = buatServer();
    const dom = buatTab(srv); await siap(dom.window);
    const w = dom.window;
    const n0 = saves(srv).length;
    w.eval("S.events.find(e => e.id==='e1').nama = 'Event Lama (disunting)';");
    await simpanTab(w);
    const kirim = saves(srv).slice(n0).pop();
    cek('saveAll terkirim', !!kirim);
    cek('mode parsial memakai `hapus`, bukan `dikenal`',
        !!kirim && !!kirim.hapus && !kirim.dikenal, JSON.stringify(Object.keys(kirim || {})));
    const eids = (kirim && kirim.data.events || []).map(e => e.id);
    cek('hanya e1 yang dikirim', eids.length === 1 && eids[0] === 'e1', JSON.stringify(eids));
    cek('gambar base64 di designreqs TIDAK ikut terkirim', JSON.stringify(kirim).indexOf(BLOB) < 0);
    cek('kiriman tidak memuat designreqs yang tak berubah', !(kirim.data.designreqs));
    cek('server menyimpan suntingan', srv.SRV.events.e1.nama === 'Event Lama (disunting)');
    cek('Request Design di server UTUH', !!srv.SRV.designreqs.d1 && srv.SRV.designreqs.d1.refs[0].v === BLOB);
    cek('hapus.events & hapus.designreqs kosong',
        (kirim.hapus.events || []).length === 0 && (kirim.hapus.designreqs || []).length === 0);
    dom.window.close();
  }

  console.log('\n== penghapusan lewat `hapus` eksplisit (koleksi settings) ==');
  {
    const srv = buatServer();
    const dom = buatTab(srv); await siap(dom.window);
    const w = dom.window;
    const n0 = saves(srv).length;
    w.eval("S.designreqs = S.designreqs.filter(d => d.id !== 'd1');" +
           "S.designreqs.push({ id:'d2', judul:'Request baru', status:'open' });");
    await simpanTab(w);
    const kirim = saves(srv).slice(n0).pop();
    cek('d1 masuk daftar hapus', !!kirim && (kirim.hapus.designreqs || []).indexOf('d1') > -1,
        JSON.stringify(kirim && kirim.hapus.designreqs));
    cek('d1 tidak ikut di kiriman', !(kirim.data.designreqs || []).some(d => d.id === 'd1'));
    cek('d2 (baru) ikut dikirim', (kirim.data.designreqs || []).some(d => d.id === 'd2'));
    cek('d1 benar-benar terhapus di server', !srv.SRV.designreqs.d1);
    cek('d2 masuk server', !!srv.SRV.designreqs.d2);
    dom.window.close();
  }

  console.log('\n== gambar BARU dikecilkan sebelum disimpan (B) ==');
  {
    cek('ada fungsi pengecil gambar', /function drKecilkanGambar\(/.test(MKT));
    cek('referensi design memakai pengecil, bukan readAsDataURL mentah',
        /drKecilkanGambar\(f, DR_IMG_MAKS_PX, DR_IMG_TARGET/.test(MKT));
    const fn = MKT.slice(MKT.indexOf('function drRefFoto('), MKT.indexOf('function drForm('));
    cek('drRefFoto tidak lagi membaca berkas apa adanya', fn.indexOf('readAsDataURL') < 0);
    cek('maks 1280px & target < 1 MB', /DR_IMG_MAKS_PX=1280/.test(MKT) && /DR_IMG_TARGET=700\*1024/.test(MKT));
  }

  console.log('\n---------------------------------------');
  console.log('LULUS ' + ok + '   GAGAL ' + gagal);
  process.exit(gagal ? 1 : 0);
})().catch(e => { console.log('  GAGAL uji tidak selesai -> ' + (e && e.message)); console.log('LULUS ' + ok + '   GAGAL ' + (gagal + 1)); process.exit(1); });
