/* Uji SIMPAN PARSIAL (delta) modul Konten (1 Oktober 2026).

   Masalahnya: getAll 4,1 MB dan SETIAP simpan mengirim ulang seluruh state
   (±4 MB), mayoritas gambar base64 di content[].refs[].v — mudah habis waktu
   di koneksi HP sehingga perubahan tidak tersimpan. Sekarang klien hanya
   mengirim baris yang BERUBAH + daftar `hapus` eksplisit, dan itu hanya
   dipakai kalau server mengiklankan `_fitur:['delta']`.

   Server tiruannya MENIRU ATURAN PHP (upsert_collection + hapus_id_eksplisit),
   dan asersinya membaca ISI SERVER, bukan layar. Empat mutasi yang harus
   tertangkap:
     1. klien kembali mengirim state utuh -> payload membengkak (blob ikut)
     2. klien memakai `dikenal − kiriman` di mode parsial -> baris tak berubah
        DIHAPUS
     3. baris yang dihapus lokal tidak masuk `hapus` -> penghapusan diam-diam
        gagal
     4. cap yang digeser server tidak dipasang -> `baseUpdatedAt` basi pada
        simpan berikutnya (bentrok palsu)

     node tools/uji-delta-konten.js
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

const SRC = fs.readFileSync(path.join(ROOT, 'deploy/konten/index.html'), 'utf8');
const ASET = fs.readFileSync(path.join(ROOT, 'deploy/assets/performa-konten.js'), 'utf8');

/* "Gambar" besar di c1: inilah yang dulu ikut terkirim tiap simpan. */
const BLOB = 'data:image/jpeg;base64,' + 'A'.repeat(120000);

/* Tabel-tabel Konten yang kosong — getAll harus memulangkannya. */
const KOSONG = { prodTasks: [], shootings: [], assets: [], bank: [], kols: [], visits: [],
                 ads: [], adFunds: [], notifs: [], brands: [], campaigns: [] };

function buatServer() {
  const SRV = {
    content: { c1: { id:'c1', title:'Konten satu', brand:'b1', status:'Idea',
                     refs:[{ t:'img', v:BLOB, n:'x.jpg' }], updatedAt:1000 },
               c2: { id:'c2', title:'Konten dua', brand:'b1', status:'Idea', updatedAt:1000 } },
    users: { u1: { id:'u1', name:'Uji Kru', division:'Konten', email:'a@b.c' } },
    campaigns: {},
  };
  const kiriman = [];
  let versiBalas = {};
  const get = () => ({
    ok: true,
    data: Object.assign({
      _fitur: ['delta'], settings: {}, perms: null, seeded: true, logs: [],
      content: Object.values(SRV.content).map(salin),
      users: Object.values(SRV.users).map(salin),
      campaigns: Object.values(SRV.campaigns).map(salin),
    }, salin(KOSONG)),
  });
  const post = body => {
    kiriman.push(salin(body));
    const st = body.data || {}, hp = body.hapus || null;
    ['content', 'users', 'campaigns'].forEach(k => {
      if (Array.isArray(st[k])) st[k].forEach(r => {
        if (!r || !r.id) return;
        const s = salin(r); delete s.baseUpdatedAt;
        SRV[k][r.id] = s;
      });
      if (hp && Array.isArray(hp[k])) hp[k].forEach(id => { delete SRV[k][id]; });
    });
    return { ok: true, data: { bentrok: [], versi: versiBalas } };
  };
  return { SRV, get, post, kiriman, setVersi: v => { versiBalas = v; } };
}

function buka(srv) {
  const h = SRC.replace('<script src="../assets/performa-konten.js"><' + '/script>',
    () => '<script>' + ASET + '<' + '/script>');
  const k = 'return API;';
  const hh = h.replace(k, 'window.__uji = function(src){ return eval(src); };' + k);
  const dom = new JSDOM(hh, {
    url: 'https://dev.laksamanamuda.id/konten/', runScripts: 'dangerously',
    pretendToBeVisual: true, virtualConsole: new VirtualConsole(),
    beforeParse(w) {
      w.alert = () => {}; w.confirm = () => true; w.scrollTo = () => {};
      try {
        w.localStorage.setItem('lm_session', JSON.stringify({
          expiry: Date.now() + 3600000, userId:'u1', name:'Uji Kru',
          modules:['*'], adminModules:['*'] }));
      } catch (e) {}
      w.fetch = async (url, init) => {
        const u = String(url);
        let isi = { ok: true, data: {} };
        if (init && init.method === 'POST') isi = srv.post(JSON.parse(init.body));
        else if (u.indexOf('action=getAll') > -1 && u.indexOf('konten-api') > -1) isi = srv.get();
        else if (u.indexOf('account-api') > -1)
          isi = { ok:true, members:[{ id:'u1', name:'Uji Kru', isModuleAdmin:true }], users:[] };
        return { ok:true, status:200, text: async () => JSON.stringify(isi), json: async () => isi };
      };
    }
  });
  return dom;
}
const saves = kiriman => kiriman.filter(p => p && p.action === 'saveAll');

(async () => {
  console.log('\n== mode parsial: hanya baris berubah yang dikirim ==');
  {
    const srv = buatServer();
    const dom = buka(srv);
    await tunggu(1200);
    const w = dom.window;
    let siap = false; try { siap = w.__uji('DATA_DARI_SERVER') === true && w.__uji('BISA_DELTA') === true; } catch (e) {}
    cek('data server dimuat & fitur delta dikenali', siap);

    const n0 = saves(srv.kiriman).length;
    w.__uji("DB.content.find(c => c.id==='c2').title = 'Konten dua (disunting)';");
    await w.__uji('save()'); await tunggu(120);
    const kirim = saves(srv.kiriman).slice(n0).pop();
    cek('saveAll terkirim', !!kirim);
    cek('mode parsial memakai `hapus`, bukan `dikenal`',
        !!kirim && !!kirim.hapus && !kirim.dikenal, JSON.stringify(Object.keys(kirim || {})));
    const ids = (kirim && kirim.data.content || []).map(c => c.id);
    cek('hanya c2 yang dikirim, c1 tidak', ids.length === 1 && ids[0] === 'c2', JSON.stringify(ids));
    cek('gambar base64 c1 TIDAK ikut terkirim',
        JSON.stringify(kirim).indexOf(BLOB) < 0);
    const penuh = w.__uji('JSON.stringify(DB).length');
    cek('muatannya jauh lebih kecil daripada state utuh (gambar tidak ikut)',
        JSON.stringify(kirim).length < penuh / 10,
        JSON.stringify(kirim).length + ' dari ' + penuh + ' char');
    cek('server menyimpan suntingan', srv.SRV.content.c2.title === 'Konten dua (disunting)');
    cek('c1 di server UTUH (tidak terhapus)', !!srv.SRV.content.c1 && srv.SRV.content.c1.refs[0].v === BLOB);
    cek('hapus.content kosong (tidak ada yang dihapus)', (kirim.hapus.content || []).length === 0);
    dom.window.close();
  }

  console.log('\n== penghapusan lewat daftar `hapus` eksplisit ==');
  {
    const srv = buatServer();
    const dom = buka(srv);
    await tunggu(1200);
    const w = dom.window;
    const n0 = saves(srv.kiriman).length;
    w.__uji("DB.content = DB.content.filter(c => c.id!=='c1'); DB.content.push({ id:'c3', title:'Baru', brand:'b1', status:'Idea' });");
    await w.__uji('save()'); await tunggu(120);
    const kirim = saves(srv.kiriman).slice(n0).pop();
    cek('c1 (yang dihapus lokal) masuk daftar hapus',
        !!kirim && (kirim.hapus.content || []).indexOf('c1') > -1, JSON.stringify(kirim && kirim.hapus.content));
    cek('c1 TIDAK ikut di kiriman', !(kirim.data.content || []).some(c => c.id === 'c1'));
    cek('c3 (baru) ikut dikirim', (kirim.data.content || []).some(c => c.id === 'c3'));
    cek('c2 (tak berubah) TIDAK dikirim', !(kirim.data.content || []).some(c => c.id === 'c2'));
    cek('c1 benar-benar terhapus di server', !srv.SRV.content.c1);
    cek('c2 tetap ada di server', !!srv.SRV.content.c2);
    cek('c3 masuk server', !!srv.SRV.content.c3);
    dom.window.close();
  }

  console.log('\n== cap server yang digeser dipasang balik (tidak bentrok palsu) ==');
  {
    const srv = buatServer();
    const dom = buka(srv);
    await tunggu(1200);
    const w = dom.window;
    srv.setVersi({ 'content:c2': 7777 });
    const n0 = saves(srv.kiriman).length;
    w.__uji("DB.content.find(c => c.id==='c2').title = 'Pertama';");
    await w.__uji('save()'); await tunggu(120);
    cek('cap dari server dipasang di baris', w.__uji("_serverVer['content:c2']") === 7777,
        String(w.__uji("_serverVer['content:c2']")));
    w.__uji("DB.content.find(c => c.id==='c2').title = 'Kedua';");
    await w.__uji('save()'); await tunggu(120);
    const kirim = saves(srv.kiriman).slice(n0).pop();
    const baris = (kirim.data.content || []).find(c => c.id === 'c2');
    cek('suntingan berikutnya memakai baseUpdatedAt yang SUDAH dibetulkan',
        baris && baris.baseUpdatedAt === 7777, JSON.stringify(baris));
    dom.window.close();
  }

  console.log('\n== gambar BARU dikecilkan sebelum disimpan (B) ==');
  {
    cek('ada fungsi pengecil gambar', /function kecilkanGambar\(/.test(SRC));
    cek('referensi konten memakai pengecil, bukan readAsDataURL mentah',
        /kecilkanGambar\(f,IMG_MAKS_PX,IMG_TARGET/.test(SRC));
    cek('rate card memakai pengecil',
        /kecilkanGambar\(f,KOL_IMG_MAKS_PX,KOL_IMG_TARGET/.test(SRC));
    const refFn = SRC.slice(SRC.indexOf('function addRefImages('), SRC.indexOf('function escJsAttr('));
    cek('addRefImages tidak lagi membaca berkas apa adanya', refFn.indexOf('readAsDataURL') < 0);
    cek('maks 1280px & target < 1 MB', /IMG_MAKS_PX=1280/.test(SRC) && /IMG_TARGET=700\*1024/.test(SRC));
  }

  console.log('\n---------------------------------------');
  console.log('LULUS ' + ok + '   GAGAL ' + gagal);
  process.exit(gagal ? 1 : 0);
})().catch(e => { console.log('  GAGAL uji tidak selesai -> ' + (e && e.message)); console.log('LULUS ' + ok + '   GAGAL ' + (gagal + 1)); process.exit(1); });
