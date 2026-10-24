/* uji-ubah-nominal-dp.js — modul Reservasi, 24 Oktober 2026.

   Permintaan user: nominal tiap DP di detail reservasi bisa diedit.
   Yang dijaga:
    - tombol ✏️ ada di tiap baris DP dan benar-benar DITEKAN;
    - nominal + total DP (dpAmount) berubah dan TERKIRIM ke server;
    - DP yang sudah diverifikasi kembali "belum terverifikasi";
    - tfAmount yang cuma salinan nominal lama dikosongkan (kalau tidak, Dana
      Masuk & Pencocokan BRI tetap memajang angka lama), tapi tfAmount hasil
      baca bukti yang BERBEDA dibiarkan;
    - jejaknya menyebut angka lama → baru;
    - nominal kosong ditolak, nominal sama tidak mengirim apa pun;
    - server menolak -> data di layar dikembalikan.

   node tools/uji-ubah-nominal-dp.js */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const { JSDOM, VirtualConsole } = (() => {
  for (const p of [process.env.JSDOM_PATH, path.join(ROOT, 'node_modules', 'jsdom'), 'jsdom']) {
    if (!p) continue; try { return require(p); } catch (e) {}
  }
  console.error('jsdom tidak ketemu. Pasang `npm i jsdom`, atau setel JSDOM_PATH.'); process.exit(2);
})();
const ASSET = fs.readFileSync(path.join(ROOT, 'deploy', 'assets', 'venue-layouts.js'), 'utf8');
const SRC = fs.readFileSync(path.join(ROOT, 'deploy', 'reservasi', 'index.html'), 'utf8');
const HTML_UJI = SRC.replace('<script src="../assets/venue-layouts.js"><' + '/script>', () => '<script>' + ASSET + '<' + '/script>');
if (HTML_UJI === SRC) { console.error('tag venue-layouts.js tidak ketemu'); process.exit(2); }

let lulus = 0, gagal = 0;
const cek = (n, s, k) => { if (s) { lulus++; console.log('  OK   ' + n); } else { gagal++; console.log('  GAGAL ' + n + (k ? '  -> ' + k : '')); } };
const tunggu = ms => new Promise(r => setTimeout(r, ms));

function fixture() {
  const now = Date.now();
  return [{ id: 'r1', name: 'Kak Uji', phone: '0812', date: '2026-12-01', time: '19:00', pax: 4, table: '21',
    status: 'Confirmed', arrivals: [], createdAt: now, updatedAt: now - 5000,
    dpStatus: 'Sudah', dpAmount: 350000, dpMethod: 'Transfer UOB',
    dps: [
      { id: 'p1', amount: 300000, method: 'Transfer UOB', proofData: 'data:image/png;base64,AA', by: 'Aurel', at: now - 9000,
        tfAmount: 300000, tfStatus: 'verified', tfBy: 'Finance', tfAt: now - 8000 },
      { id: 'p2', amount: 50000, method: 'Transfer UOB', proofData: 'data:image/png;base64,AA', by: 'Aurel', at: now - 7000,
        tfAmount: 55000, tfStatus: '' },
    ] }];
}
function dom(tolak) {
  const srv = { reservations: fixture(), master: {}, audit: [], _ver: 1 };
  const jejak = { simpan: 0 };
  const d = new JSDOM(HTML_UJI, {
    url: 'https://team.laksamanamuda.id/reservasi/', runScripts: 'dangerously', pretendToBeVisual: true,
    virtualConsole: new VirtualConsole(),
    beforeParse(w) {
      w.alert = () => {}; w.print = () => {}; w.scrollTo = () => {}; w.confirm = () => true;
      w.HTMLElement.prototype.scrollIntoView = function () {};
      try { w.localStorage.setItem('lm_session', JSON.stringify({ expiry: Date.now() + 3600000, userId: 'u', name: 'Penguji', modules: ['reservasi'], adminModules: ['reservasi'] })); } catch (e) {}
      w.fetch = async (url, init) => {
        const u = String(url);
        const balas = o => ({ ok: true, status: 200, text: async () => JSON.stringify(o), json: async () => o });
        if (u.indexOf('account-api') > -1) return balas({ ok: true, members: [{ id: 'u', name: 'Penguji', isModuleAdmin: true }] });
        if (init && init.method === 'POST') {
          const b = JSON.parse(init.body || '{}');
          if (b.action === 'saveAll') {
            jejak.simpan++;
            if (tolak) return balas({ ok: false, error: 'ditolak uji' });
            srv.reservations = JSON.parse(JSON.stringify(b.data.reservations || [])); srv.audit = b.data.audit || []; srv._ver++;
            return balas({ ok: true, data: { saved: true, ver: srv._ver } });
          }
          return balas({ ok: true, data: {} });
        }
        if (u.indexOf('action=getAll') > -1) return balas({ ok: true, data: JSON.parse(JSON.stringify(srv)) });
        return balas({ ok: true, data: {} });
      };
    },
  });
  return { w: d.window, jejak, srv };
}
async function masuk(w) {
  for (let i = 0; i < 240; i++) { try { if (w.eval('typeof STATE!=="undefined"&&STATE&&STATE.reservations.length>0&&DATA_LOADED')) break; } catch (e) {} await tunggu(50); }
  w.eval('SESSION={id:"u",name:"Penguji",role:"admin"}; window.__toast=[]; toast=function(m,t){window.__toast.push(String(m))};');
}
const klik = (w, el) => el.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true }));
const isi = (w, v) => { const el = w.document.getElementById('udp_amount'); el.value = v; };
const tombolSimpan = w => [...w.document.querySelectorAll('button')].find(b => /Simpan/.test(b.textContent) && /simpanNominalDp/.test(b.getAttribute('onclick') || ''));

(async () => {
  console.log('\n== 1. Tombol di detail ==');
  {
    const { w, jejak, srv } = dom(false); await masuk(w);
    w.eval('openDetail("r1")');
    const btn = [...w.document.querySelectorAll('button')].filter(b => /openUbahNominalDp\('r1','p1'\)/.test(b.getAttribute('onclick') || ''));
    cek('tombol ✏️ ada untuk DP 1', btn.length === 1);
    cek('tombol ✏️ ada untuk DP 2', [...w.document.querySelectorAll('button')].some(b => /openUbahNominalDp\('r1','p2'\)/.test(b.getAttribute('onclick') || '')));
    klik(w, btn[0]);
    const inp = w.document.getElementById('udp_amount');
    cek('modal terbuka berisi nominal sekarang', inp && inp.value === '300.000', inp && inp.value);
    cek('modal memperingatkan DP yang sudah diverifikasi', /sudah diverifikasi/.test(w.document.body.innerHTML));

    console.log('\n== 2. Simpan nominal baru (DP terverifikasi) ==');
    isi(w, '250.000'); klik(w, tombolSimpan(w)); await tunggu(400);
    const r = srv.reservations[0], p1 = r && r.dps.find(x => x.id === 'p1');
    cek('terkirim ke server', jejak.simpan === 1, jejak.simpan);
    cek('nominal DP 1 jadi 250.000', p1 && p1.amount === 250000, p1 && p1.amount);
    cek('total DP (dpAmount) ikut 300.000', r && r.dpAmount === 300000, r && r.dpAmount);
    cek('verifikasi dikembalikan ke belum', p1 && p1.tfStatus === '' && !p1.tfBy && !p1.tfAt);
    cek('tfAmount salinan nominal lama dikosongkan', p1 && Number(p1.tfAmount) === 0, p1 && p1.tfAmount);
    cek('bukti & rekening tidak disentuh', p1 && p1.proofData && p1.method === 'Transfer UOB');
    const a = (srv.audit || []).find(x => /Ubah Nominal DP/.test(x.action || ''));
    cek('jejak menyebut angka lama -> baru', a && /300\.000/.test(a.detail) && /250\.000/.test(a.detail) && /verifikasi dibatalkan/.test(a.detail), a && a.detail);
    cek('jejak menempel di baris reservasinya (r.log)', (r.log || []).some(x => /Ubah Nominal DP/.test(x.action || x.a || JSON.stringify(x))));

    console.log('\n== 3. DP belum terverifikasi, tfAmount hasil baca bukti ==');
    w.eval('openUbahNominalDp("r1","p2")');
    cek('tanpa peringatan verifikasi untuk DP yang belum diverifikasi', !/sudah diverifikasi/.test(w.document.querySelector('.modal-body').innerHTML));
    isi(w, '55.000'); klik(w, tombolSimpan(w)); await tunggu(400);
    const p2 = srv.reservations[0].dps.find(x => x.id === 'p2');
    cek('nominal DP 2 jadi 55.000', p2.amount === 55000);
    cek('tfAmount hasil baca bukti (beda dari nominal lama) DIBIARKAN', Number(p2.tfAmount) === 55000);

    console.log('\n== 4. Penolakan isian ==');
    const sebelum = jejak.simpan;
    w.eval('openUbahNominalDp("r1","p2")'); isi(w, ''); klik(w, tombolSimpan(w)); await tunggu(200);
    cek('nominal kosong ditolak, tidak terkirim', jejak.simpan === sebelum && w.document.getElementById('udp_amount'));
    isi(w, '55.000'); klik(w, tombolSimpan(w)); await tunggu(200);
    cek('nominal sama tidak mengirim apa pun', jejak.simpan === sebelum);
  }
  console.log('\n== 5. Server menolak ==');
  {
    const { w } = dom(true); await masuk(w);
    w.eval('openUbahNominalDp("r1","p1")'); isi(w, '100.000'); klik(w, tombolSimpan(w)); await tunggu(500);
    cek('nominal di layar dikembalikan', w.eval('STATE.reservations[0].dps[0].amount') === 300000, w.eval('STATE.reservations[0].dps[0].amount'));
    cek('status verifikasi di layar dikembalikan', w.eval('STATE.reservations[0].dps[0].tfStatus') === 'verified');
  }

  console.log('\n---------------------------------------');
  console.log(`LULUS ${lulus}   GAGAL ${gagal}`);
  process.exit(gagal ? 1 : 0);
})();
