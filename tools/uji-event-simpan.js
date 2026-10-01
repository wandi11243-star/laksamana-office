/* Uji jalur SIMPAN modul Event (1 Oktober 2026).

   Dua cara kerja kru hilang tanpa satu pun galat, dan keduanya ditutup:

   1. PENGHAPUSAN. Server menghapus baris yang tidak ada di kiriman, dibatasi
      cap terbaru di kiriman itu. Begitu tab basi menyunting satu baris, capnya
      jadi "sekarang" — dan event/jadwal/talent yang dibuat kru lain sejak tab
      itu dibuka ikut terhapus. eventDetails bahkan tanpa batas sama sekali.
      Sekarang klien mengirim `dikenal`, server hanya menghapus dikenal − kiriman.
   2. TIMPA. Penjaga urutan memakai jam perangkat, jadi suntingan dari tab basi
      selalu menang. Sekarang baris yang berubah membawa baseUpdatedAt dan
      server MENOLAK kalau versinya sudah lebih baru.

   Server tiruannya meniru aturan lib_event_mysql.php yang BARU, dan HIDUP:
   yang ditulis saveAll dipulangkan getAll berikutnya. Yang diukur ISI SERVER
   sesudah simpan, bukan layar. Bagian akhir menjaga kontrak PHP-nya.

     node tools/uji-event-simpan.js
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

const HTML = fs.readFileSync(path.join(ROOT, 'deploy/event/index.html'), 'utf8');
const LIB = fs.readFileSync(path.join(ROOT, 'event-mysql/lib_event_mysql.php'), 'utf8');
const API = fs.readFileSync(path.join(ROOT, 'event-mysql/api.php'), 'utf8');
const KOL = ['talents','events','schedules','recurringRules','talentPayments',
             'ticketClasses','seats','orders','tickets','ideas','refunds','calendarExtra'];

/* Server tiruan bersama — dua tab menghadap SATU server. */
function buatServer(awal) {
  const srv = { db: salin(awal), simpan: [] };
  srv.saveAll = (body) => {
    srv.simpan.push(salin(body));
    const st = body.data, kenal = body.dikenal || null, bentrok = [], versi = {};
    KOL.forEach(k => {
      if (!Array.isArray(st[k])) return;
      const lama = new Map((srv.db[k] || []).map(r => [r.id, r]));
      const ids = [];
      st[k].forEach(r => {
        if (!r || !r.id) return; ids.push(r.id);
        const v = lama.has(r.id) ? (lama.get(r.id).updatedAt || 0) : null;
        let lolos = false;
        if ('baseUpdatedAt' in r) {
          if (v !== null && v > (r.baseUpdatedAt || 0)) { bentrok.push({ koleksi: k, id: r.id, nama: r.name || r.title || r.id }); return; }
          lolos = true;
        }
        const s = salin(r); delete s.baseUpdatedAt;
        let ua = s.updatedAt || 0;
        if (lolos && v !== null && ua <= v) { ua = v + 1; s.updatedAt = ua; versi[k + ':' + r.id] = ua; }
        if (v === null || ua >= v) lama.set(r.id, s);
      });
      if (Array.isArray(kenal && kenal[k])) {
        const hapus = kenal[k].filter(id => ids.indexOf(id) < 0);
        if (!(ids.length === 0 && hapus.length > 3)) hapus.forEach(id => lama.delete(id));
      } else {
        const maks = Math.max(0, ...st[k].map(r => r.updatedAt || 0));
        [...lama.keys()].forEach(id => { if (ids.indexOf(id) < 0 && (lama.get(id).updatedAt || 0) <= maks) lama.delete(id); });
      }
      srv.db[k] = [...lama.values()];
    });
    /* eventDetails: peta per event — aturan yang sama, kunci versi 'ed:'. */
    if (st.eventDetails && typeof st.eventDetails === 'object') {
      const ed = srv.db.eventDetails || (srv.db.eventDetails = {});
      const ids = Object.keys(st.eventDetails);
      ids.forEach(eid => {
        const d = st.eventDetails[eid], v = ed[eid] ? (ed[eid].updatedAt || 0) : null;
        if ('baseUpdatedAt' in d && v !== null && v > (d.baseUpdatedAt || 0)) { bentrok.push({ koleksi: 'eventDetails', id: eid, nama: eid }); return; }
        const s = salin(d); delete s.baseUpdatedAt;
        if (v === null || (s.updatedAt || 0) >= v) ed[eid] = s;
      });
      const kn = kenal && kenal.eventDetails;
      if (Array.isArray(kn)) kn.filter(id => ids.indexOf(id) < 0).forEach(id => delete ed[id]);
      else Object.keys(ed).forEach(id => { if (ids.indexOf(id) < 0) delete ed[id]; });   // aturan LAMA: tanpa batas
    }
    return { saved: true, bentrok, versi };
  };
  return srv;
}
function bukaTab(srv) {
  const dom = new JSDOM(HTML, {
    url: 'https://dev.laksamanamuda.id/event/', runScripts: 'dangerously', pretendToBeVisual: true,
    virtualConsole: new VirtualConsole(),
    beforeParse(w) {
      w.alert = () => {}; w.confirm = () => true; w.scrollTo = () => {};
      try {
        w.localStorage.setItem('lm_session', JSON.stringify({
          expiry: Date.now() + 3600000, userId: 'u1', name: 'Uji Kru',
          modules: ['event'], adminModules: ['event'] }));
      } catch (e) {}
      w.fetch = async (url, init) => {
        const u = String(url);
        let body = {}; try { body = init && init.body ? JSON.parse(init.body) : {}; } catch (e) {}
        const balas = o => ({ ok: true, status: 200, text: async () => JSON.stringify(o), json: async () => o });
        if (body.action === 'saveAll') return balas({ ok: true, data: srv.saveAll(body) });
        if (u.indexOf('event-api') > -1 && u.indexOf('getAll') > -1) return balas({ ok: true, data: salin(srv.db) });
        if (u.indexOf('account-api') > -1) return balas({ ok: true, members: [{ id: 'u1', name: 'Uji Kru', isModuleAdmin: true }], users: [] });
        return balas({ ok: true, data: {} });
      };
    }
  });
  return { dom, w: dom.window };
}
async function siap(w) {
  for (let i = 0; i < 200; i++) {
    try { if (w.eval('DB && Array.isArray(DB.events) && typeof syncNow === "function"')) return; } catch (e) {}
    await tunggu(50);
  }
  throw new Error('modul Event tidak pernah siap');
}
const simpan = async w => { w.eval('save()'); await w.eval('syncNow()'); await tunggu(50); };

const AWAL = {
  talents: [{ id: 't1', name: 'Band Lama', updatedAt: 1000 }],
  events: [{ id: 'e1', name: 'Event Lama', updatedAt: 1000, start_datetime: '2026-10-10T12:00:00.000Z', status: 'Upcoming' }],
  schedules: [], recurringRules: [], talentPayments: [], ticketClasses: [], seats: [], orders: [],
  tickets: [], ideas: [], refunds: [], calendarExtra: [], checkins: [],
  eventDetails: { e1: { catatan: 'awal', updatedAt: 1000 } }
};

(async () => {
  /* ================= 1. tab basi tidak menghapus kerja orang lain ================= */
  console.log('\n== Tab basi tidak menghapus event buatan kru lain ==');
  {
    const srv = buatServer(AWAL);
    const A = bukaTab(srv); await siap(A.w);          // tab A dibuka pagi
    const B = bukaTab(srv); await siap(B.w);
    /* Kru B membuat event & talent baru. */
    B.w.eval("DB.events.push({ id:'e2', name:'Event Baru Kru B', start_datetime:'2026-10-20T12:00:00.000Z', status:'Upcoming' });" +
             "DB.talents.push({ id:'t2', name:'DJ Baru' }); DB.eventDetails.e2 = { catatan:'rincian B' };");
    await simpan(B.w);
    cek('event kru B tersimpan di server', srv.db.events.some(e => e.id === 'e2'));
    /* Tab A (masih memegang salinan pagi) menyunting talent lama. */
    A.w.eval("DB.talents.find(t => t.id==='t1').name = 'Band Lama (revisi)';");
    await simpan(A.w);
    cek('event kru B TIDAK terhapus oleh tab basi', srv.db.events.some(e => e.id === 'e2'),
        JSON.stringify(srv.db.events.map(e => e.id)));
    cek('talent kru B TIDAK terhapus', srv.db.talents.some(t => t.id === 't2'));
    cek('rincian event kru B TIDAK terhapus', !!(srv.db.eventDetails && srv.db.eventDetails.e2),
        JSON.stringify(Object.keys(srv.db.eventDetails || {})));
    cek('suntingan tab A tetap masuk', (srv.db.talents.find(t => t.id === 't1') || {}).name === 'Band Lama (revisi)');
    cek('dikenal tab A tidak memuat e2', !(srv.simpan.pop().dikenal.events || []).includes('e2'));
    /* Hapus yang memang dilihat tab A tetap berjalan. */
    A.w.eval("DB.talents = DB.talents.filter(t => t.id !== 't1');");
    await simpan(A.w);
    cek('baris yang dihapus tab A (dan pernah dilihatnya) terhapus', !srv.db.talents.some(t => t.id === 't1'));
    A.dom.window.close(); B.dom.window.close();
  }

  /* ================= 2. suntingan basi ditolak, bukan menimpa ================= */
  console.log('\n== Suntingan basi DITOLAK ==');
  {
    const srv = buatServer(AWAL);
    const A = bukaTab(srv); await siap(A.w);
    const B = bukaTab(srv); await siap(B.w);
    B.w.eval("DB.events.find(e => e.id==='e1').name = 'Nama dari B';");
    await simpan(B.w);
    A.w.eval("DB.events.find(e => e.id==='e1').name = 'Nama dari A (basi)';");
    await simpan(A.w);
    const kirimA = srv.simpan[srv.simpan.length - 1];
    const barisA = kirimA.data.events.find(e => e.id === 'e1');
    cek('baris yang disunting membawa baseUpdatedAt', barisA && barisA.baseUpdatedAt === 1000, barisA && String(barisA.baseUpdatedAt));
    cek('suntingan B TIDAK tertimpa', srv.db.events.find(e => e.id === 'e1').name === 'Nama dari B');
    await tunggu(300);
    cek('tab A menarik ulang dan memakai versi server', A.w.eval("DB.events.find(e => e.id==='e1').name") === 'Nama dari B');
    cek('DB tidak memegang baseUpdatedAt', !A.w.eval("JSON.stringify(DB)").includes('baseUpdatedAt'));
    /* Sesudah ditarik, suntingan berikutnya dari A lolos — tidak ada bentrok palsu. */
    const n = srv.simpan.length;
    A.w.eval("DB.events.find(e => e.id==='e1').name = 'Nama dari A (sesudah tarik)';");
    await simpan(A.w);
    cek('suntingan sesudah tarik ulang tersimpan', srv.db.events.find(e => e.id === 'e1').name === 'Nama dari A (sesudah tarik)',
        String(srv.simpan.length - n) + ' kiriman');
    A.dom.window.close(); B.dom.window.close();
  }

  /* ================= 3. suntingan di tengah request tidak terpotret tersimpan ================= */
  console.log('\n== Suntingan selagi menyimpan ==');
  {
    const srv = buatServer(AWAL);
    const A = bukaTab(srv); await siap(A.w);
    A.w.eval("DB.talents[0].name = 'Satu';"); A.w.eval('save()');
    const jalan = A.w.eval('syncNow()');
    A.w.eval("DB.talents[0].name = 'Dua (diketik saat request berjalan)';");
    await jalan; await tunggu(50);
    const k = A.w.eval("_snap['talents:t1']") || '';
    cek('suntingan kedua masih dianggap BELUM tersimpan', k.indexOf('Dua') < 0);
    await simpan(A.w);
    cek('dan terkirim pada simpan berikutnya', srv.db.talents.find(t => t.id === 't1').name.indexOf('Dua') === 0);
    A.dom.window.close();
  }

  /* ================= 4. kontrak PHP ================= */
  console.log('\n== Kontrak PHP ==');
  {
    const up = LIB.slice(LIB.indexOf('function upsert_collection('), LIB.indexOf('function hapus_yang_hilang'));
    const sa = LIB.slice(LIB.indexOf('function save_all('), LIB.indexOf('function events_hari'));
    cek('baseUpdatedAt basi DITOLAK', /\$verServer\[\$id\] > \$base/.test(up) && /continue;\s*\/\/ JANGAN timpa/.test(up));
    cek('baseUpdatedAt tidak tersimpan di data', /unset\(\$simpan\['baseUpdatedAt'\]\)/.test(up));
    cek('cap yang dinaikkan ikut ke data & dipulangkan', /\$simpan\['updatedAt'\] = \$ua;/.test(up) && /\$versi\[\$nama \. ':' \. \$id\] = \$ua/.test(up));
    cek('jalur dikenal tidak jatuh ke penghapusan lama',
        /if \(is_array\(\$kenal\)\) \{ event_hapus_dikenal\([^;]*;\s*return count\(\$ids\); \}/.test(up));
    cek('kiriman kosong yang menghapus >3 baris ditahan', /count\(\$ids\) === 0 && count\(\$hapus\) > 3/.test(LIB));
    cek('eventDetails ikut dijaga (bentrok + dikenal)',
        /\$verEd\[\$eid\] > \$base/.test(sa) && /event_hapus_dikenal\(\$pdo, 'event_details'/.test(sa));
    cek("kunci versi eventDetails berawalan 'ed:' (sama dengan eachRow)", /\$versi\['ed:' \. \$eid\]/.test(sa));
    cek('balasan memuat bentrok & versi', /'bentrok' => \$bentrok/.test(sa) && /'versi'\s*=> \(object\)\$versi/.test(sa));
    cek('api.php meneruskan dikenal', /save_all\([\s\S]{0,140}\$body\['dikenal'\]/.test(API));
  }

  console.log('\n---------------------------------------');
  console.log('LULUS ' + ok + '   GAGAL ' + gagal);
  process.exit(gagal ? 1 : 0);
})().catch(e => { console.log('  GAGAL uji tidak selesai -> ' + e.message); console.log('LULUS ' + ok + '   GAGAL ' + (gagal + 1)); process.exit(1); });
