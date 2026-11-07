/* Uji REBASE BREAKDOWN SAAT KONFLIK — 7 November 2026, keluhan user:
   "kenapa sering muncul ini? [Sync BELUM tersimpan … diubah orang lain]
   padahal datanya kesave … takutnya datanya malah hilang".

   Penjaga tulis-basi bekerja per BLOB omset, dan kasir menyimpan blob yang
   sama sepanjang hari dari modul Cashier. Satu simpan kasir di sela-sela
   membuat Simpan/Sync Breakdown ditolak walau breakdown hari itu tidak diubah
   siapa pun. simpanHariRebase() menarik blob terbaru dan menempelkan HANYA
   perubahan hari itu.

   YANG DIJAGA (isi SERVER sesudahnya, bukan layar):
     - kasir menyimpan di sela-sela -> Sync & Simpan tetap masuk, DAN kerja
       kasir tadi ikut utuh (tidak tertimpa salinan lama);
     - breakdown hari itu diubah orang lain -> DITOLAK, server tidak berubah;
     - halaman masih punya suntingan lain yang belum naik -> tidak di-rebase;
     - pesan konflik tidak menjanjikan percobaan ulang otomatis. */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const { JSDOM, VirtualConsole } = (() => {
  for (const p of [process.env.JSDOM_PATH, path.join(ROOT, 'node_modules', 'jsdom'), 'jsdom']) {
    if (!p) continue;
    try { return require(p); } catch (e) {}
  }
  console.error('jsdom tidak ketemu. Setel JSDOM_PATH.'); process.exit(2);
})();
const OMSET = fs.readFileSync(path.join(ROOT, 'deploy/finance/omset/index.html'), 'utf8');
let lulus = 0, gagal = 0;
const cek = (n, s, k) => { if (s) { lulus++; console.log('  OK   ' + n); } else { gagal++; console.log('  GAGAL ' + n + (k ? '  -> ' + k : '')); } };
const tunggu = ms => new Promise(r => setTimeout(r, ms));
const salin = o => JSON.parse(JSON.stringify(o));

const KASIR = [{ id: 'k-ani', name: 'Ani', target: 0 }, { id: 'k-budi', name: 'Budi', target: 0 }];
const TGL = '2026-10-05';
const bd = (ani) => ({ marketing: [], event: [], abaikan: [],
  kasir: [{ kasirId: 'k-ani', amount: ani, disc: 0, off: false }, { kasirId: 'k-budi', amount: 4000000, disc: 0, off: false }],
  self: { amount: 0, disc: 0 } });
const hari = b => ({ date: TGL, food: 10000000, bev: 0, lainnya: 0, discount: 0, service_charge: 0, tax: 0,
  traffic: 0, bill: 0, qty_food: 0, qty_bev: 0, qty_others: 0, bd: b, bdValid: true });

/* Server tiruan yang HIDUP: menyimpan blob + versi, menolak baseTs basi persis
   seperti save_all() di kompas-mysql. */
function buatServer() {
  const S = { ts: 1000, by: 'awal', data: { daily: [hari(bd(6000000))], reports: {}, compliments: [], piutang: [],
    settings: {}, employees: { kasir: KASIR, marketing: [], event: [] } }, tolak: 0, terima: 0 };
  S.kasirMenyimpan = (ubah) => { ubah(S.data); S.ts += 7; S.by = 'Kasir Cindy'; };
  return S;
}
function dom(S, alerts) {
  return new JSDOM(OMSET.replace(/<link[^>]+fonts[^>]*>/g, ''), {
    url: 'https://team.laksamanamuda.id/finance/omset/', runScripts: 'dangerously', pretendToBeVisual: true,
    virtualConsole: new VirtualConsole(),
    beforeParse(w) {
      w.alert = m => alerts.push(String(m)); w.confirm = () => true; w.scrollTo = () => {};
      w.HTMLElement.prototype.scrollIntoView = function () {};
      w.localStorage.setItem('lm_session', JSON.stringify({ expiry: Date.now() + 3600000, userId: 'u-fin', name: 'Fina',
        modules: ['kompas'], adminModules: ['kompas'] }));
      w.fetch = async (url, init) => {
        const u = String(url), body = init && init.body ? JSON.parse(init.body) : {};
        const balas = o => ({ ok: true, status: 200, text: async () => JSON.stringify(o), json: async () => o });
        if (body.action === 'saveAll') {
          if (body.baseTs > 0 && body.baseTs !== S.ts) { S.tolak++; return balas({ ok: false, konflik: true, ts: S.ts, by: S.by, error: 'Data di server sudah diubah orang lain sejak halaman ini dimuat.' }); }
          S.terima++; S.data = salin(body.data); S.ts += 3; S.by = 'Fina';
          return balas({ ok: true, data: { saved: true, ts: S.ts } });
        }
        if (u.indexOf('getAll') > -1 && u.indexOf('kompas') > -1) return balas({ ok: true, ts: S.ts, data: salin(S.data) });
        if (u.indexOf('account-api') > -1) return balas({ ok: true, members: [] });
        return balas({ ok: true, data: [] });
      };
    }
  }).window;
}
async function siap(w) {
  for (let i = 0; i < 200; i++) { try { if (w.eval('typeof DB!=="undefined"&&DB&&Array.isArray(DB.daily)')) return; } catch (e) {} await tunggu(40); }
  throw new Error('modul tidak siap');
}
async function buka(w) { w.eval(`PERIOD='${TGL.slice(0, 7)}'; bdDate='${TGL}';`); w.go('breakdown'); await tunggu(250); return w.document; }
const hariSrv = S => S.data.daily.find(x => x.date === TGL);

(async () => {
  console.log('\n== 1. Sync: kasir menyimpan di sela-sela ==');
  {
    const S = buatServer(), A = [], w = dom(S, A); await siap(w);
    const d = await buka(w);
    S.kasirMenyimpan(x => { x.reports[TGL] = { catatan: 'report kasir' }; });
    const b = d.getElementById('bd_sync');
    cek('tombol sync hidup', b && !b.disabled);
    b.click(); await tunggu(600);
    cek('penolakan pertama memang terjadi', S.tolak === 1, 'tolak=' + S.tolak);
    cek('sync akhirnya MASUK ke server', !!(hariSrv(S).bdSync), JSON.stringify(Object.keys(hariSrv(S))));
    cek('kerja kasir di sela-sela TETAP utuh', S.data.reports[TGL] && S.data.reports[TGL].catatan === 'report kasir');
    cek('pesan sukses, bukan galat', A.some(m => /sudah di-sync/.test(m)) && !A.some(m => /BELUM/.test(m)), A.join(' | '));
  }

  console.log('\n== 2. Simpan Breakdown: kasir menyimpan di sela-sela ==');
  {
    const S = buatServer(), A = [], w = dom(S, A); await siap(w);
    const d = await buka(w);
    const inp = d.querySelector('#ks_list input, [data-ks] input, input');
    w.eval(`DIRTY=false`);
    S.kasirMenyimpan(x => { x.reports[TGL] = { catatan: 'report kasir 2' }; });
    d.getElementById('bd_save').click(); await tunggu(600);
    cek('Simpan Breakdown akhirnya masuk', S.terima >= 1 && hariSrv(S).bdLog && hariSrv(S).bdLog.length >= 1, 'terima=' + S.terima);
    cek('kerja kasir TETAP utuh', S.data.reports[TGL] && S.data.reports[TGL].catatan === 'report kasir 2');
    cek('pesan TERSIMPAN', A.some(m => /TERSIMPAN di server/.test(m)), A.join(' | '));
    void inp;
  }

  console.log('\n== 3. Breakdown hari itu diubah ORANG LAIN -> ditolak ==');
  {
    const S = buatServer(), A = [], w = dom(S, A); await siap(w);
    const d = await buka(w);
    S.kasirMenyimpan(x => { x.daily[0].bd.kasir[0].amount = 7777777; });
    d.getElementById('bd_sync').click(); await tunggu(600);
    cek('tidak ada simpan yang diterima', S.terima === 0, 'terima=' + S.terima);
    cek('breakdown orang lain tidak tertimpa', hariSrv(S).bd.kasir[0].amount === 7777777);
    cek('pesan menyebut breakdown diubah orang lain', A.some(m => /sudah diubah orang lain/.test(m)), A.join(' | '));
    cek('pesan TIDAK menjanjikan percobaan ulang otomatis', A.length && !A.some(m => /dicoba lagi otomatis/.test(m)));
    cek('BASE_TS tidak ikut maju (tanpa DB baru)', w.eval('BASE_TS') === 1000, String(w.eval('BASE_TS')));
  }

  console.log('\n== 4. Ada suntingan lain belum naik -> tidak di-rebase ==');
  {
    const S = buatServer(), A = [], w = dom(S, A); await siap(w);
    const d = await buka(w);
    S.kasirMenyimpan(x => { x.reports[TGL] = { catatan: 'k' }; });
    w.eval('DIRTY=true');
    d.getElementById('bd_sync').click(); await tunggu(600);
    cek('tidak di-rebase: tidak ada simpan diterima', S.terima === 0, 'terima=' + S.terima);
    cek('kerja kasir utuh', S.data.reports[TGL].catatan === 'k');
  }

  console.log(`\nLULUS ${lulus}   GAGAL ${gagal}`);
  process.exit(gagal ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
