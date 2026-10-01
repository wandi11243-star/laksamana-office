/* Uji perubahan HR yang belum sempat naik ke server (1 Oktober 2026).

   Dulu simpan yang gagal cuma meninggalkan perubahannya di cache peramban,
   tanpa percobaan ulang — lalu muat berikutnya yang berhasil MENIMPA cache itu
   dengan data server. Perubahannya hilang tanpa satu pun tanda, padahal
   toast-nya berjanji "perubahan ada di browser ini".

   Yang diuji:
   1. server MASIH di revisi tempat perubahan dibuat -> salinan lokal dipakai
      dan DIKIRIM (baseRev = revisi itu);
   2. server SUDAH maju -> salinan lokal TIDAK dikirim (akan menimpa kerja
      orang lain) dan itu DIKATAKAN;
   3. simpan gagal -> penanda terpasang, percobaan ulang dijadwalkan, tab
      ditahan; sesudah berhasil semuanya dilepas.

     node tools/uji-hr-tertunda.js
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
/* Seluruh aplikasi HR terbungkus IIFE, jadi S dan kawan-kawan tidak ada di window.
   Jembatan eval disuntikkan KE DALAM IIFE (pola uji-arsip-konten.js). */
const HTML = (() => {
  const h = fs.readFileSync(path.join(ROOT, 'deploy/hr/index.html'), 'utf8');
  const re = /\(function\(\)\{\r?\n'use strict';/;
  if (!re.test(h)) { console.error('jangkar IIFE tidak ketemu'); process.exit(2); }
  return h.replace(re, m => m + '\nwindow.__uji = function(s){ return eval(s); };');
})();

const DIV = [{ id:'d1', name:'Kitchen' }];
const EMP = [{ id:'e1', name:'Uji Kru', divId:'d1', role:'admin', active:true }];
function dataServer(rev, emp) {
  return { divisions: JSON.parse(JSON.stringify(DIV)), employees: JSON.parse(JSON.stringify(emp || EMP)),
           audit: [], settings: {}, _rev: rev, _savedBy: 'Cindy', _savedAt: '2026-10-01T02:00:00.000Z' };
}

/* opt.server: data getAll; opt.cache: isi LS_KEY; opt.tanda: penanda belum-naik;
   opt.simpan: fungsi yang menjawab saveAll. */
function buka(opt) {
  const jejak = { simpan: [], toast: [] };
  const dom = new JSDOM(HTML, {
    url: 'https://dev.laksamanamuda.id/hr/', runScripts: 'dangerously', pretendToBeVisual: true,
    virtualConsole: new VirtualConsole(),
    beforeParse(w) {
      w.alert = () => {}; w.confirm = () => true; w.scrollTo = () => {};
      try {
        w.localStorage.setItem('lm_session', JSON.stringify({
          expiry: Date.now() + 3600000, userId: 'e1', name: 'Uji Kru',
          modules: ['hr'], adminModules: ['hr'] }));
        if (opt.cache) w.localStorage.setItem('lm_peopleos_v1', JSON.stringify(opt.cache));
        if (opt.tanda !== undefined) w.localStorage.setItem('lm_peopleos_belum_naik', opt.tanda);
      } catch (e) {}
      w.fetch = async (url, init) => {
        const u = String(url);
        let body = {}; try { body = init && init.body ? JSON.parse(init.body) : {}; } catch (e) {}
        const balas = o => ({ ok: true, status: 200, text: async () => JSON.stringify(o), json: async () => o });
        if (body.action === 'saveAll') {
          jejak.simpan.push(JSON.parse(JSON.stringify(body)));
          return opt.simpan ? opt.simpan(body) : balas({ ok: true, data: { rev: (+body.baseRev || 0) + 1 } });
        }
        if (u.indexOf('hr-api-mysql') > -1 && u.indexOf('getAll') > -1)
          return balas({ ok: true, data: JSON.parse(JSON.stringify(opt.server)) });
        if (u.indexOf('account-api') > -1) return balas({ ok: true, members: [], users: [] });
        return balas({ ok: true, data: {} });
      };
    }
  });
  return { dom, w: dom.window, jejak };
}
const adaE2 = b => (b.data.employees || []).some(e => e.id === 'e2');
const tanda = w => { try { return w.localStorage.getItem('lm_peopleos_belum_naik'); } catch (e) { return 'ERR'; } };

(async () => {
  /* ================= 1. server masih di revisi yang sama ================= */
  console.log('\n== Perubahan tertunda, server belum maju ==');
  {
    const lokal = dataServer(5, EMP.concat([{ id:'e2', name:'Kru Baru Offline', divId:'d1', active:true }]));
    const { dom, w, jejak } = buka({ server: dataServer(5), cache: lokal, tanda: '5' });
    await tunggu(1500);
    const kirim = jejak.simpan.filter(adaE2);
    cek('perubahan tertunda DIKIRIM ke server', kirim.length > 0, String(jejak.simpan.length) + ' saveAll');
    cek('dengan baseRev revisi tempat ia dibuat', kirim[0] && +kirim[0].baseRev === 5,
        kirim[0] ? String(kirim[0].baseRev) : '-');
    cek('penanda dilepas sesudah diterima server', tanda(w) === null, String(tanda(w)));
    dom.window.close();
  }

  /* ================= 2. server sudah maju ================= */
  console.log('\n== Perubahan tertunda, server SUDAH maju ==');
  {
    const lokal = dataServer(5, EMP.concat([{ id:'e2', name:'Kru Baru Offline', divId:'d1', active:true }]));
    const { dom, w, jejak } = buka({ server: dataServer(6), cache: lokal, tanda: '5' });
    await tunggu(1500);
    cek('salinan lama TIDAK dikirim (akan menimpa kerja Cindy)', !jejak.simpan.some(adaE2),
        JSON.stringify(jejak.simpan.map(s => s.baseRev)));
    cek('layar memakai data server', !w.__uji('S.employees').some(e => e.id === 'e2'));
    cek('penanda dilepas', tanda(w) === null, String(tanda(w)));
    const teks = w.document.body.textContent;
    cek('kehilangannya DIKATAKAN berikut siapa yang menyimpan', /tidak bisa digabung/.test(teks) && /Cindy/.test(teks));
    dom.window.close();
  }

  /* ================= 3. simpan gagal ================= */
  console.log('\n== Simpan gagal: dicoba ulang & tab ditahan ==');
  {
    let tolak = true;
    const { dom, w } = buka({ server: dataServer(5),
      simpan: body => tolak ? Promise.reject(new Error('jaringan putus'))
        : Promise.resolve({ ok: true, json: async () => ({ ok: true, data: { rev: (+body.baseRev || 0) + 1 } }) }) });
    await tunggu(1500);
    w.__uji("S.employees.push({ id:'e3', name:'Kru Baru', divId:'d1', active:true }); save();");
    await tunggu(100);
    cek('penanda belum-naik terpasang', tanda(w) === '5', String(tanda(w)));
    cek('percobaan ulang dijadwalkan', !!w.__uji('_ulangHr'));
    const ev = new w.Event('beforeunload', { cancelable: true }); w.dispatchEvent(ev);
    cek('tab ditahan', ev.defaultPrevented === true);
    tolak = false;
    w.__uji('save()'); await tunggu(100);
    cek('sesudah berhasil penanda dilepas', tanda(w) === null, String(tanda(w)));
    const ev2 = new w.Event('beforeunload', { cancelable: true }); w.dispatchEvent(ev2);
    cek('dan tab tidak ditahan lagi', ev2.defaultPrevented === false);
    dom.window.close();
  }

  console.log('\n---------------------------------------');
  console.log('LULUS ' + ok + '   GAGAL ' + gagal);
  process.exit(gagal ? 1 : 0);
})().catch(e => { console.log('  GAGAL uji tidak selesai -> ' + e.message); console.log('LULUS ' + ok + '   GAGAL ' + (gagal + 1)); process.exit(1); });
