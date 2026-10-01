/* Uji jalur SIMPAN modul Konten (1 Oktober 2026).

   Dua cara data Konten hilang tanpa satu pun galat, dan keduanya ditutup:

   1. getAll yang DIJAWAB TAPI DITOLAK ({ok:false} — MySQL sesaat bermasalah)
      dulu jatuh ke seed(): DB = {users:[u_admin]}, lalu save() mengirimnya, dan
      server menghapus SELURUH kru kecuali Admin. Yang diukur di sini JUMLAH
      POST saveAll — nol adalah satu-satunya jawaban yang benar.
   2. Modul ini tidak pernah menarik ulang data sesudah dibuka, dan server
      menghapus semua baris yang tidak ada di kiriman. Tab yang basi seharian
      menghapus yang dibuat kru lain hari itu. Sekarang klien mengirim
      `dikenal` (id yang pernah dilihatnya) dan server hanya menghapus
      dikenal − kiriman. Pola BD OS (tools/uji-dikenal-bd.js).

   PHP tidak bisa dijalankan di mesin ini, jadi sisi server dijaga sebagai
   KONTRAK atas sumbernya (pola tools/uji-simpan-basi.js).

     node tools/uji-konten-simpan.js
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

const SRC = fs.readFileSync(path.join(ROOT, 'deploy/konten/index.html'), 'utf8');
const ASET = fs.readFileSync(path.join(ROOT, 'deploy/assets/performa-konten.js'), 'utf8');
const PHP = fs.readFileSync(path.join(ROOT, 'konten-mysql/lib_konten_mysql.php'), 'utf8');
const API = fs.readFileSync(path.join(ROOT, 'konten-mysql/api.php'), 'utf8');

/* getAll dijawab `jawabGetAll`; POST dicatat. Seluruh skrip modul ini
   terbungkus IIFE, jadi jembatan eval disuntikkan KE DALAM IIFE. */
function buka(jawabGetAll, jawabPost) {
  const POST = [];
  let h = SRC.replace('<script src="../assets/performa-konten.js"><' + '/script>',
    () => '<script>' + ASET + '<' + '/script>');
  const k = 'return API;';
  if (h.split(k).length - 1 !== 1) { console.error('jangkar IIFE tidak ketemu'); process.exit(2); }
  h = h.replace(k, 'window.__uji = function(src){ return eval(src); };' + k);
  const dom = new JSDOM(h, {
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
        let isi = { ok:true, data:{ bentrok:[] } };
        if (init && init.method === 'POST') { try { POST.push(JSON.parse(init.body)); } catch (e) {} if (jawabPost) isi = jawabPost(); }
        else if (u.indexOf('action=getAll') > -1 && u.indexOf('konten-api') > -1) isi = jawabGetAll;
        else if (u.indexOf('account-api') > -1)
          isi = { ok:true, members:[{ id:'u1', name:'Uji Kru', isModuleAdmin:true }], users:[] };
        return { ok:true, status:200, text: async () => JSON.stringify(isi), json: async () => isi };
      };
    }
  });
  return { dom, POST };
}
const saveAll = POST => POST.filter(p => p && p.action === 'saveAll');

const USERS = [
  { id:'u1', name:'Uji Kru', roles:['content_director'], division:'Konten', email:'a@b.c' },
  { id:'u2', name:'Budi Desain', roles:['designer'], division:'Desain', email:'b@b.c' }
];
const isiServer = () => ({ ok:true, data:{
  users: JSON.parse(JSON.stringify(USERS)), brands:[], campaigns:[],
  content:[ { id:'c1', title:'Konten satu', brand:'b1', status:'Idea', updatedAt:1000 },
            { id:'c2', title:'Konten dua',  brand:'b1', status:'Idea', updatedAt:1000 } ],
  prodTasks:[], shootings:[], assets:[], bank:[], kols:[], visits:[], ads:[], adFunds:[], notifs:[], logs:[],
  settings:{}, perms:null } });

(async () => {
  /* ================= 1. getAll ditolak server ================= */
  console.log('\n== getAll dijawab {ok:false} ==');
  {
    const { dom, POST } = buka({ ok:false, error:'SQLSTATE[HY000]: MySQL server has gone away' });
    await tunggu(900);
    cek('TIDAK ada satu pun saveAll yang berangkat', saveAll(POST).length === 0,
        JSON.stringify(saveAll(POST).map(p => Object.keys(p.data || {}))));
    /* catch di initAPI menyetel innerText — jsdom tidak mengenalnya, jadi
       nilainya cuma jadi properti JS biasa dan textContent tidak berubah. */
    const elTeks = dom.window.document.getElementById('api-loading-text') || {};
    const teks = String(elTeks.innerText || elTeks.textContent || '');
    cek('kegagalannya dikatakan di layar', /Gagal/.test(teks), teks);
    let users = null; try { users = dom.window.__uji('DB && DB.users'); } catch (e) {}
    cek('state seed TIDAK lahir', !(Array.isArray(users) && users.some(x => x.id === 'u_admin')),
        JSON.stringify(users));
    let lewat = 0;
    try { await dom.window.__uji('save()'); lewat = saveAll(POST).length; } catch (e) { lewat = -1; }
    cek('save() manual pun ditahan sebelum data dari server ada', lewat === 0, String(lewat));
    dom.window.close();
  }

  /* ================= 2. dikenal ikut dikirim ================= */
  console.log('\n== saveAll membawa `dikenal` ==');
  {
    const { dom, POST } = buka(isiServer());
    await tunggu(1200);
    const w = dom.window;
    let siap = false; try { siap = w.__uji('DATA_DARI_SERVER') === true; } catch (e) {}
    cek('data server dimuat', siap);
    /* Kru di tab ini: menghapus c1 dan membuat c3. */
    w.__uji("DB.content = DB.content.filter(c => c.id !== 'c1'); DB.content.push({ id:'c3', title:'Baru', brand:'b1', status:'Idea' });");
    const sblm = saveAll(POST).length;
    await w.__uji('save()'); await tunggu(100);
    const kirim = saveAll(POST).slice(sblm).pop();
    cek('saveAll terkirim', !!kirim);
    const kc = (kirim && kirim.dikenal && kirim.dikenal.content) || [];
    cek('dikenal memuat baris dari server (c1, c2)', kc.indexOf('c1') > -1 && kc.indexOf('c2') > -1, JSON.stringify(kc));
    cek('dikenal memuat baris yang dibuat di tab ini (c3)', kc.indexOf('c3') > -1, JSON.stringify(kc));
    cek('baris yang dihapus tetap dikenal — itulah yang membuatnya terhapus di server',
        kc.indexOf('c1') > -1 && !(kirim.data.content || []).some(c => c.id === 'c1'));
    cek('dikenal TIDAK memuat baris yang tidak pernah dilihat tab ini', kc.indexOf('c99') < 0);
    cek('dikenal punya entri untuk tiap koleksi', kirim && ['users','content','ads','kols'].every(k => Array.isArray(kirim.dikenal[k])));
    dom.window.close();
  }

  /* ================= 3. simpan gagal: dicoba ulang & tab ditahan ================= */
  console.log('\n== Simpan gagal ==');
  {
    let tolak = true;
    const { dom, POST } = buka(isiServer(), () => tolak ? { ok:false, error:'server sibuk' } : { ok:true, data:{ bentrok:[] } });
    await tunggu(1200);
    const w = dom.window;
    w.__uji("DB.content.push({ id:'c4', title:'Belum naik', brand:'b1', status:'Idea' });");
    await w.__uji('save()'); await tunggu(50);
    const ev = new w.Event('beforeunload', { cancelable:true }); w.dispatchEvent(ev);
    cek('tab ditahan selama perubahan belum naik', ev.defaultPrevented === true);
    cek('percobaan ulang dijadwalkan', !!w.__uji('_ulangTimer'));
    tolak = false; const n = saveAll(POST).length;
    await w.__uji('save()'); await tunggu(50);
    const ev2 = new w.Event('beforeunload', { cancelable:true }); w.dispatchEvent(ev2);
    cek('sesudah server menerima, tab tidak ditahan lagi', saveAll(POST).length > n && ev2.defaultPrevented === false);
    dom.window.close();
  }

  /* ================= 4. kontrak server ================= */
  console.log('\n== Kontrak PHP ==');
  {
    const fn = PHP.slice(PHP.indexOf('function upsert_collection'), PHP.indexOf('function hapus_yang_hilang'));
    cek('upsert_collection menerima daftar dikenal', /function upsert_collection\([^)]*\$kenal = null\)/.test(PHP));
    cek('yang dihapus cuma dikenal − kiriman', /array_diff\(array_map\('strval', \$kenal\), \$ids\)/.test(fn));
    cek('kiriman kosong yang menghapus >3 baris ditahan', /count\(\$ids\) === 0 && count\(\$hapus\) > 3/.test(fn));
    cek('jalur dikenal TIDAK jatuh ke penghapusan lama',
        /if \(is_array\(\$kenal\)\) \{[\s\S]*?return count\(\$ids\);\s*\}/.test(fn));
    cek('save_all meneruskan dikenal per koleksi', /\$dikenal\[\$nama\]/.test(PHP) && /upsert_collection\([^)]*\$kenal\)/.test(PHP));
    cek('api.php meneruskan body dikenal', /save_all\([\s\S]{0,120}\$body\['dikenal'\]/.test(API));
  }

  console.log('\n---------------------------------------');
  console.log('LULUS ' + ok + '   GAGAL ' + gagal);
  process.exit(gagal ? 1 : 0);
})();
