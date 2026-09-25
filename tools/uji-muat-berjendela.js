/* uji-muat-berjendela.js — modul Reservasi memuat riwayat per halaman (tahap 2)
 *
 *   node tools/uji-muat-berjendela.js
 *   JSDOM_PATH=/jalur/ke/jsdom node tools/uji-muat-berjendela.js
 *
 * Permintaan user 25 September 2026: "ketika di buka diproses per halaman yang
 * sedang di buka … agar proses backgroundnya tidak banyak dan lebih cepat".
 * Boot sekarang cuma menarik reservasi sejak awal bulan lalu; riwayat sebelum
 * itu dimuat halaman yang membacanya (muatArsip), dan profil tamu lama datang
 * dari ringkasan server (ringkasTamu).
 *
 * YANG PALING DIJAGA DI SINI BUKAN KECEPATAN, MELAINKAN DATA. Klien berjendela
 * yang salah langkah sekali saja menghapus seluruh riwayat di luar jendelanya
 * — server lama menjalankan DELETE NOT IN kiriman. Server tiruannya karena
 * itu HIDUP dan meniru save_all() apa adanya: mode parsial (dikenal) hanya
 * menghapus dikenal − kiriman, mode penuh menghapus apa pun yang tidak
 * dikirim. Asersinya membaca ISI SERVER sesudah simpan, bukan layar.
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
const cek = (n, s, k) => { if (s) { ok++; console.log('  OK   ' + n); } else { gagal++; console.log('  GAGAL ' + n + (k ? '  — ' + k : '')); } };
const sama = (n, d, h) => cek(n, JSON.stringify(d) === JSON.stringify(h), 'dapat ' + JSON.stringify(d) + ', harusnya ' + JSON.stringify(h));
const aman = async (n, fn) => { try { await fn(); } catch (e) { gagal++; console.log('  GAGAL ' + n + '  — melempar: ' + (e && e.stack || e)); } };
const tunggu = ms => new Promise(r => setTimeout(r, ms));

const ASSET = fs.readFileSync(path.join(ROOT, 'deploy/assets/venue-layouts.js'), 'utf8');
const SUMBER = fs.readFileSync(path.join(ROOT, 'deploy/reservasi/index.html'), 'utf8');
const HTML = SUMBER.replace('<script src="../assets/venue-layouts.js"><' + '/script>',
                            () => '<script>' + ASSET + '<' + '/script>');
if (HTML === SUMBER) { console.error('tag venue-layouts.js tidak ketemu di sumber'); process.exit(2); }

/* ---- tanggal relatif hari ini (fixture bertanggal mati membusuk sendiri) ---- */
const ymd = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const HARI_INI = ymd(new Date());
const DARI = (() => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1); return ymd(d); })();
const geser = (t, n) => { const d = new Date(t + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const BESOK = geser(HARI_INI, 1);
const P1 = '081111111111', P2 = '082222222222';
const baris = (id, date, o) => Object.assign({ id, name: 'Tamu ' + id, phone: P2, date, time: '19:00', pax: 2,
  table: '', status: 'Confirmed', createdAt: 1000, updatedAt: 1000 }, o || {});
function fixture() {
  return [
    baris('L1', geser(DARI, -40), { phone: P1, name: 'Budi Lama', status: 'Datang', pax: 4, member: true, memberNo: 'M-9', createdAt: 100 }),
    baris('L2', geser(DARI, -20), { phone: P1, name: 'Budi', status: 'No-show', pax: 2, createdAt: 200 }),
    baris('L3', geser(DARI, -1), { status: 'Datang', createdAt: 300 }),                     // tepat SEBELUM jendela
    baris('W0', DARI, { status: 'Datang', createdAt: 400 }),                                // tepat DI AWAL jendela
    baris('W1', BESOK, { phone: P1, name: 'Budi Baru', status: 'No-show', pax: 6, createdAt: 500 }),
    baris('W2', HARI_INI, { createdAt: 600 }),
    baris('N1', '', { createdAt: 700 }),                                  // tanggal kosong: selalu ikut
  ];
}

/* KEMBAR tanggal_valid() / baca_state() / save_all() / ringkas_tamu() di reservasi-mysql. */
const tglSah = t => { t = String(t == null ? '' : t).trim(); return /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : null; };
const normHp = p => { let x = String(p || '').replace(/[^0-9]/g, ''); if (!x) return ''; if (x[0] === '0') return '62' + x.slice(1); if (x.startsWith('62')) return x; return '62' + x; };

/* opsi: { fitur: 'lengkap'|'lama'|'separuh', conflictSekali } */
function buka(opsi) {
  opsi = Object.assign({ fitur: 'lengkap' }, opsi || {});
  const log = { get: [], save: [] };
  const srv = { ver: 1, db: new Map(fixture().map(r => [r.id, r])), master: {}, audit: [], sudahConflict: false };
  const fitur = () => opsi.fitur === 'lengkap' ? ['jendela', 'dikenal', 'ringkasTamu'] : opsi.fitur === 'separuh' ? ['jendela', 'dikenal'] : null;
  const d = new JSDOM(HTML, {
    url: 'https://dev.laksamanamuda.id/reservasi/',
    runScripts: 'dangerously', pretendToBeVisual: true,
    virtualConsole: new VirtualConsole(),
    beforeParse(w) {
      w.alert = () => {}; w.confirm = () => true; w.print = () => {}; w.scrollTo = () => {};
      w.HTMLElement.prototype.scrollIntoView = function () {};
      try { w.localStorage.setItem('lm_session', JSON.stringify({
        expiry: Date.now() + 3600000, userId: 'u-uji', name: 'Penguji',
        modules: ['reservasi'], adminModules: ['reservasi'] })); } catch (e) {}
      w.fetch = async (url, init) => {
        const u = new URL(String(url), 'https://dev.laksamanamuda.id/reservasi/');
        const body = init && init.body ? JSON.parse(init.body) : {};
        const aksi = body.action || u.searchParams.get('action') || '?';
        const balas = o => ({ ok: true, status: 200, text: async () => JSON.stringify(o), json: async () => o });
        if (String(url).indexOf('account-api') > -1) return balas({ ok: true, members: [
          { id: 'u-uji', name: 'Penguji', keterangan: 'Office', isModuleAdmin: true }] });
        if (aksi === 'getAll') {
          const f = fitur();
          const dari = f ? tglSah(u.searchParams.get('dari')) : null;          // server lama MENGABAIKAN dari
          const sampai = f ? tglSah(u.searchParams.get('sampai')) : null;
          log.get.push({ dari: u.searchParams.get('dari'), sampai: u.searchParams.get('sampai') });
          const rows = [...srv.db.values()].filter(r => {
            if (!dari && !sampai) return true;
            const t = tglSah(r.date); if (!t) return true;
            return t >= (dari || '0000-01-01') && t <= (sampai || '9999-12-31');
          });
          const data = { reservations: JSON.parse(JSON.stringify(rows)), master: srv.master, audit: srv.audit, _ver: srv.ver };
          if (f) data._fitur = f;
          if (f && (dari || sampai)) data._jendela = { dari, sampai };
          return balas({ ok: true, data });
        }
        if (aksi === 'ringkasTamu') {
          if (opsi.fitur !== 'lengkap') return balas({ ok: false, error: 'Aksi tidak dikenal: ringkasTamu' });
          const s = tglSah(u.searchParams.get('sebelum')); const out = {};
          [...srv.db.values()].sort((a, b) => a.createdAt - b.createdAt).forEach(r => {
            const t = tglSah(r.date); if (!t || !s || t >= s) return;
            const k = 'k' + normHp(r.phone);
            const e = out[k] || (out[k] = [0, 0, 0, 0, '', 0, '', 0, '', '']);
            e[0]++;
            if (r.status === 'Datang') { e[1]++; if (r.date > e[6]) e[6] = r.date; }
            if (r.status === 'No-show') e[2]++;
            if (r.member) { e[3] = 1; if (e[4] === '' && r.memberNo) e[4] = r.memberNo; }
            if (r.vip) e[5] = 1;
            e[7] += Number(r.pax) || 0;
            if (e[0] === 1) e[8] = r.name || '';
            if (String(r.name || '').trim()) e[9] = String(r.name).trim();
          });
          return balas({ ok: true, data: { sebelum: s, tamu: out } });
        }
        if (aksi === 'saveAll') {
          log.save.push(JSON.parse(JSON.stringify(body)));
          if (opsi.conflictSekali && !srv.sudahConflict) { srv.sudahConflict = true; srv.ver++; return balas({ ok: true, data: { conflict: true, ver: srv.ver } }); }
          if (String(body.baseVer) !== String(srv.ver)) return balas({ ok: true, data: { conflict: true, ver: srv.ver } });
          const isi = body.data || {};
          const kirim = (isi.reservations || []).filter(r => r && r.id);
          const ids = kirim.map(r => String(r.id));
          kirim.forEach(r => { const lama = srv.db.get(r.id); if (!lama || (Number(r.updatedAt) || 0) >= (Number(lama.updatedAt) || 0)) srv.db.set(r.id, r); });
          if (Array.isArray(body.dikenal) && fitur()) {
            const hapus = [...new Set(body.dikenal.map(String))].filter(id => !ids.includes(id));
            if (hapus.length && !(ids.length === 0 && hapus.length > 3)) hapus.forEach(id => srv.db.delete(id));
          } else if (ids.length) {
            [...srv.db.keys()].forEach(id => { if (!ids.includes(id)) srv.db.delete(id); });   // DELETE NOT IN
          }
          srv.master = isi.master || srv.master; srv.audit = isi.audit || srv.audit;
          srv.ver++; return balas({ ok: true, data: { saved: true, ver: srv.ver } });
        }
        return balas({ ok: false, error: 'Aksi tidak dikenal: ' + aksi });
      };
    }
  });
  return { w: d.window, log, srv, opsi };
}
async function siap(w) {
  for (let i = 0; i < 240; i++) {
    try { if (w.eval('typeof DATA_LOADED !== "undefined" && DATA_LOADED')) return; } catch (e) {}
    await tunggu(50);
  }
  throw new Error('modul Reservasi tidak pernah siap');
}
async function masuk(w) {
  await siap(w);
  w.eval('SESSION={id:"u-uji",name:"Penguji",role:"admin"}; SELECTED_CREW="u-uji";');
  await tunggu(60);
}
const idLayar = w => w.eval('STATE.reservations.map(r=>r.id)').slice().sort();
const idServer = srv => [...srv.db.keys()].sort();
/* Bagian RESERVASI dari hasLocalChanges(). Master sengaja tidak ikut: modul ini
   menyinkronkan roster Office ke master sesudah boot, dan itu memang perubahan
   yang belum naik — bukan urusan uji ini. */
const resBersih = w => w.eval('STATE.reservations.length===BASE.res.size && STATE.reservations.every(r=>BASE.res.get(r.id)===JSON.stringify(r))');
const ubah = (w, id, catatan) => w.eval(`(()=>{const r=STATE.reservations.find(x=>x.id==="${id}"); r.note=${JSON.stringify(catatan)}; r.updatedAt=Date.now(); return !!r;})()`);
async function simpan(w) { const r = await w.eval('saveNow()'); await tunggu(80); return r; }
const tungguSampai = async (fn, ms) => { for (let i = 0; i < (ms || 3000) / 50; i++) { if (fn()) return true; await tunggu(50); } return false; };

(async () => {

console.log('\n== 1. Boot berjendela ==');
await aman('boot', async () => {
  const { w, log } = buka();
  await masuk(w);
  sama('getAll boot membawa dari = awal bulan lalu', log.get[0] && log.get[0].dari, DARI);
  sama('jendelaDari() di layar = awal bulan lalu', w.eval('jendelaDari()'), DARI);
  cek('JENDELA menyala', w.eval('!!JENDELA && JENDELA.dari') === DARI);
  sama('yang termuat HANYA jendela + tanggal kosong', idLayar(w), ['N1', 'W0', 'W1', 'W2']);
  sama('boot = SATU getAll (tidak ada tarikan penuh)', log.get.length, 1);
});

console.log('\n== 2. Simpan berjendela tidak menyentuh riwayat lama ==');
await aman('simpan', async () => {
  const { w, log, srv } = buka();
  await masuk(w);
  ubah(w, 'W1', 'jendela');
  cek('simpan berhasil', await simpan(w) === true);
  const b = log.save[log.save.length - 1];
  cek('saveAll membawa dikenal', Array.isArray(b.dikenal));
  sama('dikenal = seluruh yang dipegang layar', (b.dikenal || []).slice().sort(), ['N1', 'W0', 'W1', 'W2']);
  sama('kiriman tanpa riwayat lama', b.data.reservations.map(r => r.id).sort(), ['N1', 'W0', 'W1', 'W2']);
  sama('ISI SERVER: riwayat lama utuh', idServer(srv), ['L1', 'L2', 'L3', 'N1', 'W0', 'W1', 'W2']);
  sama('suntingan tertulis', srv.db.get('W1').note, 'jendela');
  cek('getAll sebelum menulis juga berjendela', log.get.slice(1).every(g => g.dari === DARI));

  // hapus satu di layar → dikenal membawanya, server menghapus HANYA itu
  w.eval('STATE.reservations = STATE.reservations.filter(r=>r.id!=="W2")');
  cek('simpan hapus berhasil', await simpan(w) === true);
  const b2 = log.save[log.save.length - 1];
  cek('yang dihapus ikut di dikenal', (b2.dikenal || []).includes('W2'));
  cek('yang dihapus TIDAK ikut dikirim', !b2.data.reservations.some(r => r.id === 'W2'));
  sama('ISI SERVER: cuma W2 yang hilang', idServer(srv), ['L1', 'L2', 'L3', 'N1', 'W0', 'W1']);
  cek('tidak ada perubahan tersisa', resBersih(w));
});

console.log('\n== 3. Riwayat lama dimuat halaman yang membacanya ==');
await aman('arsip', async () => {
  const { w, log, srv } = buka();
  await masuk(w);
  const sebelum = log.get.length;
  w.eval('navigate("analitik")');
  cek('pita "memuat riwayat" tampil', /Memuat riwayat sebelum/.test(w.document.getElementById('page-analitik').innerHTML));
  cek('riwayat termuat', await tungguSampai(() => w.eval('ARSIP_DIMUAT')));
  const g = log.get[sebelum];
  cek('tarikan arsip = SEBELUM jendela saja', g && g.dari === '0001-01-01' && g.sampai === geser(DARI, -1), JSON.stringify(g));
  sama('layar kini memegang seluruh riwayat', idLayar(w), ['L1', 'L2', 'L3', 'N1', 'W0', 'W1', 'W2']);
  cek('tidak ada baris ganda', w.eval('new Set(STATE.reservations.map(r=>r.id)).size === STATE.reservations.length'));
  cek('riwayat tidak terbaca sebagai perubahan', resBersih(w));
  cek('pita hilang sesudah termuat', !/Memuat riwayat sebelum/.test(w.document.getElementById('page-analitik').innerHTML));
  const nArsip = log.get.length;
  w.eval('navigate("analitik")');
  await tunggu(150);
  sama('riwayat dimuat SEKALI saja', log.get.length, nArsip);

  // riwayat yang tidak diubah TIDAK dikirim; yang diubah dikirim
  ubah(w, 'W1', 'x');
  await simpan(w);
  let b = log.save[log.save.length - 1];
  sama('riwayat tak berubah ditahan, tidak dikirim', b.data.reservations.map(r => r.id).sort(), ['N1', 'W0', 'W1', 'W2']);
  cek('riwayat tetap di layar sesudah simpan', idLayar(w).includes('L1') && resBersih(w));
  ubah(w, 'L3', 'arsip disunting');
  await simpan(w);
  b = log.save[log.save.length - 1];
  cek('riwayat yang DIUBAH ikut dikirim', b.data.reservations.some(r => r.id === 'L3'));
  sama('suntingan riwayat tertulis', srv.db.get('L3').note, 'arsip disunting');

  // kru lain menghapus L1 di server — salinan kita TIDAK boleh menghidupkannya lagi
  srv.db.delete('L1'); srv.ver++;
  ubah(w, 'W1', 'y');
  await simpan(w);
  cek('riwayat yang dihapus kru lain tidak hidup lagi', !srv.db.has('L1'));

  // polling / applyServer berjendela tidak membuang riwayat di layar
  w.eval('applyServer(' + JSON.stringify({ reservations: [...srv.db.values()].filter(r => !tglSah(r.date) || r.date >= DARI), master: {}, audit: [], _ver: srv.ver, _jendela: { dari: DARI } }) + ')');
  cek('applyServer berjendela membawa riwayat lama', idLayar(w).includes('L2') && idLayar(w).includes('L3'));
  cek('...dan tetap bersih', resBersih(w));
});

console.log('\n== 4. Tabrakan versi tidak memecah potret riwayat ==');
await aman('conflict', async () => {
  const { w, log, srv } = buka({ conflictSekali: true });
  await masuk(w);
  await w.eval('muatArsip()');
  ubah(w, 'W1', 'tabrak');
  cek('simpan berhasil sesudah tabrakan', await simpan(w) === true);
  const b = log.save[log.save.length - 1];
  cek('putaran ulang tetap membawa dikenal', Array.isArray(b.dikenal));
  cek('putaran ulang tidak mengirim riwayat', !b.data.reservations.some(r => /^L/.test(r.id)));
  sama('ISI SERVER utuh', idServer(srv), ['L1', 'L2', 'L3', 'N1', 'W0', 'W1', 'W2']);
  cek('potret BASE masih memuat riwayat (bersih)', resBersih(w));
});

console.log('\n== 5. Server lama / separuh: kembali ke mode penuh ==');
await aman('server lama', async () => {
  const { w, log, srv } = buka({ fitur: 'lama' });
  await masuk(w);
  cek('JENDELA mati', w.eval('JENDELA') === null);
  sama('seluruh riwayat termuat', idLayar(w), ['L1', 'L2', 'L3', 'N1', 'W0', 'W1', 'W2']);
  ubah(w, 'W1', 'lama');
  await simpan(w);
  const b = log.save[log.save.length - 1];
  cek('mode penuh: tanpa dikenal', !('dikenal' in b));
  sama('ISI SERVER utuh (kiriman penuh)', idServer(srv), ['L1', 'L2', 'L3', 'N1', 'W0', 'W1', 'W2']);
});
await aman('server separuh', async () => {
  const { w, log, srv } = buka({ fitur: 'separuh' });
  await masuk(w);
  cek('JENDELA mati tanpa ringkasTamu', w.eval('JENDELA') === null);
  sama('ditarik ulang SELURUHNYA', idLayar(w), ['L1', 'L2', 'L3', 'N1', 'W0', 'W1', 'W2']);
  sama('tarikan kedua tanpa dari', log.get[1] && log.get[1].dari, null);
  ubah(w, 'W1', 's');
  await simpan(w);
  sama('ISI SERVER utuh', idServer(srv), ['L1', 'L2', 'L3', 'N1', 'W0', 'W1', 'W2']);
});
await aman('server diturunkan sesudah boot', async () => {
  const { w, log, srv, opsi } = buka();
  await masuk(w);
  opsi.fitur = 'lama';
  ubah(w, 'W1', 'turun');
  const n = log.save.length;
  cek('simpan DITOLAK klien', await simpan(w) === false);
  sama('saveAll tidak dikirim sama sekali', log.save.length, n);
  sama('ISI SERVER utuh', idServer(srv), ['L1', 'L2', 'L3', 'N1', 'W0', 'W1', 'W2']);
});

console.log('\n== 6. Profil tamu dari ringkasan server ==');
await aman('profil', async () => {
  const { w } = buka();
  await masuk(w);
  w.eval(`customerProfile(${JSON.stringify(P1)})`);           // memicu ringkasTamu
  cek('ringkasan termuat', await tungguSampai(() => w.eval('!!RINGKAS_TAMU')));
  const p = w.eval(`customerProfile(${JSON.stringify(P1)})`);
  sama('jumlah = lama + jendela', p.count, 3);
  sama('kunjungan dari riwayat lama', p.visits, 1);
  sama('no-show digabung → blacklist', [p.noshow, p.blacklist], [2, true]);
  sama('member & nomornya dari riwayat lama', [p.isMember, p.memberNo], [true, 'M-9']);
  sama('kunjungan terakhir', p.lastVisit, geser(DARI, -40));
  sama('rata-rata pax', p.avgPax, 4);
  sama('nama dari baris pertama', p.name, 'Budi Lama');
  const g = w.eval(`findGuestByPhone(${JSON.stringify(P1)})`);
  sama('isi-otomatis nama: yang terbaru menang', g && g.name, 'Budi Baru');
  /* Cek meja untuk tanggal lama melebarkan jendela, dan applyServer ikut
     membawa baris lama itu ke layar — ia sudah terhitung di ringkasan, jadi
     tidak boleh dihitung lagi. */
  const lebar = geser(DARI, -21);
  w.eval('applyServer(' + JSON.stringify({ reservations: fixture().filter(r => !tglSah(r.date) || r.date >= lebar),
    master: {}, audit: [], _ver: 1, _fitur: ['jendela', 'dikenal', 'ringkasTamu'], _jendela: { dari: lebar } }) + ')');
  cek('baris lama ikut masuk layar lewat jendela yang melebar', idLayar(w).includes('L2'));
  sama('...tapi tidak dihitung dua kali di profil', w.eval(`customerProfile(${JSON.stringify(P1)}).count`), 3);
  // sesudah riwayat dimuat, hasilnya SAMA dengan menghitung dari baris
  await w.eval('muatArsip()');
  const p2 = w.eval(`customerProfile(${JSON.stringify(P1)})`);
  sama('sama persis dengan hitungan penuh', [p2.count, p2.visits, p2.noshow, p2.memberNo, p2.lastVisit, p2.avgPax, p2.name],
                                             [p.count, p.visits, p.noshow, p.memberNo, p.lastVisit, p.avgPax, p.name]);
});

console.log('\n== 7. Pintu ke reservasi lama ==');
await aman('pintu', async () => {
  const { w, log } = buka();
  await masuk(w);
  const sel = w.eval('auditAksiSel({action:"Hapus",res:"L2"})');
  cek('audit: yang belum termuat TIDAK ditandai dihapus', sel.indexOf('✕') < 0);
  w.eval('openDetail("L2")');
  cek('detail reservasi lama terbuka sesudah dimuat', await tungguSampai(() => /Budi/.test(w.document.getElementById('modalRoot').innerHTML)));
  cek('riwayat dimuat untuk itu', w.eval('ARSIP_DIMUAT'));
  const sel2 = w.eval('auditAksiSel({action:"Hapus",res:"TIDAKADA"})');
  cek('sesudah dimuat, yang memang tidak ada ditandai ✕', sel2.indexOf('✕') > -1);

  // cek meja untuk tanggal lama menarik jendela sampai tanggal itu
  const { w: w2, log: log2 } = buka();
  await masuk(w2);
  const n = log2.get.length;
  await w2.eval(`mejaMasihKosong(${JSON.stringify(geser(DARI, -20))}, "21", "19:00", null, false)`);
  sama('cek meja lama: dari = sehari sebelum tanggalnya', log2.get[n] && log2.get[n].dari, geser(DARI, -21));
  w2.eval('hideBusy()');
});

console.log('\n== 8. Dashboard memuat riwayat hanya kalau saringannya membacanya ==');
await aman('dashboard', async () => {
  const { w } = buka();
  await masuk(w);
  w.eval('navigate("dashboard")');
  await tunggu(150);
  cek('mode Hari ini: riwayat TIDAK dimuat', w.eval('ARSIP_DIMUAT') === false && !w.eval('ARSIP_SIBUK'));
  w.eval('DASH_FILTER.mode="all"; navigate("dashboard")');
  cek('mode Semua: pita tampil', /Memuat riwayat sebelum/.test(w.document.getElementById('page-dashboard').innerHTML));
  cek('mode Semua: riwayat dimuat', await tungguSampai(() => w.eval('ARSIP_DIMUAT')));
});

console.log('\n== 9. Kontrak backend ==');
{
  const API = fs.readFileSync(path.join(ROOT, 'reservasi-mysql/api.php'), 'utf8');
  const LIB = fs.readFileSync(path.join(ROOT, 'reservasi-mysql/lib_reservasi_mysql.php'), 'utf8');
  cek('_fitur menyebut ringkasTamu', /\$st\['_fitur'\] = array\('jendela', 'dikenal', 'ringkasTamu'\)/.test(API));
  cek('aksi ringkasTamu ada', API.indexOf("$action === 'ringkasTamu'") > -1 && API.indexOf('ringkas_tamu($sebelum)') > -1);
  const i = LIB.indexOf('function ringkas_tamu('), badan = i > -1 ? LIB.slice(i, i + 2200) : '';
  cek('ringkas_tamu hanya SELECT', /SELECT data FROM reservations WHERE tanggal IS NOT NULL AND tanggal < :s/.test(badan) && !/DELETE|UPDATE|INSERT/.test(badan));
  cek('kunci berawalan k (bukan kunci integer)', badan.indexOf("'k' . rsv_norm_hp(") > -1);
  cek('urutan entri kembar dengan profilGabung', /array\(0, 0, 0, 0, '', 0, '', 0, '', ''\)/.test(badan));
  try {
    const { Engine } = require('php-parser');
    const p = new Engine({ parser: { php7: true }, ast: { withPositions: false } });
    p.parseCode(API, 'api.php'); p.parseCode(LIB, 'lib.php');
    cek('php-parser: kedua berkas sah', true);
  } catch (e) { cek('php-parser: kedua berkas sah', /Cannot find module/.test(e.message), e.message); }
}

console.log(`\nLULUS ${ok}   GAGAL ${gagal}`);
process.exit(gagal ? 1 : 0);
})();
