/* Uji jejak "diinput oleh siapa" di Input Omset Harian — 7 September 2026,
   permintaan user.

   KENAPA UJI SENDIRI. `tools/smoke-modul.js` sama sekali tidak menyentuh
   `deploy/finance/omset/` — daftarnya cuma memuat `finance`, yaitu halaman
   PEMILIH panel yang tidak berisi aplikasi apa pun. Jadi seluruh Input Omset
   Harian, termasuk jalur simpannya, tidak pernah dijalankan satu baris pun
   oleh uji mana pun sebelum berkas ini ada.

   YANG DIJAGA:

     - Jejaknya MENUMPUK, bukan menimpa. Satu tanggal biasa disentuh lebih
       dari sekali: diisi malam itu, dikoreksi orang lain beberapa hari
       kemudian. Kalau yang tersimpan cuma yang terakhir, nama orang yang
       benar-benar mengetiknya hilang tanpa bekas — dan justru itu yang dicari
       kalau angkanya bermasalah.

     - Mekanismenya SATU, dipakai bersama Report Daily (`tambahJejak` /
       `jejakList` / `jejakHtml`). Dua mekanisme jejak di satu modul akan
       menyimpang begitu salah satunya diperbaiki.

     - Label per halaman berbeda ("Diinput" vs "Disubmit") tapi bentuk dan
       riwayatnya sama. Report Daily TIDAK BOLEH ikut berubah kata kerjanya —
       itu halaman yang memang disubmit.

     - Hari yang lahir sebelum jejak ini ada DIKATAKAN, bukan didiamkan.
       Baris yang hilang membuat halaman terbaca seolah tidak pernah mencatat
       siapa pun. */
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

const HTML = fs.readFileSync(path.join(ROOT, 'deploy', 'finance', 'omset', 'index.html'), 'utf8');
let lulus = 0, gagal = 0;
const cek = (nama, syarat, ket) => {
  if (syarat) { lulus++; console.log('  OK   ' + nama); }
  else { gagal++; console.log('  GAGAL ' + nama + (ket ? '  -> ' + ket : '')); }
};
const tunggu = ms => new Promise(r => setTimeout(r, ms));

const TGL = '2026-08-23';
/* Satu hari yang SUDAH ada tapi belum punya jejak — bentuk yang paling sering
   ada di produksi, dan satu-satunya yang tidak boleh diklaim siapa pun. */
const DAILY_LAMA = [{
  date: TGL, food: 12614400, bev: 13778500, lainnya: 185000, discount: 359650,
  service_charge: 1257200, tax: 2514400, traffic: 400, bill: 214,
  qty_food: 100, qty_bev: 80, qty_others: 0,
  bd: { marketing: [], event: [], kasir: [], self: { amount: 0, disc: 0 } }, bdValid: false
}];

function dom(opt) {
  opt = opt || {};
  const d = new JSDOM(HTML, {
    url: 'https://team.laksamanamuda.id/finance/omset/',
    runScripts: 'dangerously', pretendToBeVisual: true,
    virtualConsole: new VirtualConsole(),
    beforeParse(w) {
      w.Chart = function () {}; w.Chart.prototype.destroy = function () {};
      w.HTMLCanvasElement.prototype.getContext = () => ({});
      w.alert = () => {}; w.confirm = () => true; w.print = () => {}; w.scrollTo = () => {};
      w.HTMLElement.prototype.scrollIntoView = function () {};
      try {
        w.localStorage.setItem('lm_session', JSON.stringify({
          expiry: Date.now() + 3600000,
          userId: opt.id || 'u-ani', name: opt.nama || 'Ani',
          modules: ['kompas'], adminModules: ['kompas']
        }));
      } catch (e) {}
      w.fetch = async (url, init) => {
        const u = String(url);
        const balas = o => ({ ok: true, status: 200, text: async () => JSON.stringify(o), json: async () => o });
        if (u.indexOf('account-api') > -1) return balas({ ok: true, members: [] });
        if (u.indexOf('event-api') > -1 || u.indexOf('marketing-api') > -1)
          return balas({ ok: true, data: { events: [] } });
        return balas({ ok: true, data: { daily: opt.daily || [], reports: {}, compliments: [],
                                         piutang: [], settings: {}, employees: [] } });
      };
    }
  });
  return d.window;
}
async function siap(w) {
  for (let i = 0; i < 220; i++) {
    try { if (w.eval('typeof DB !== "undefined" && DB && Array.isArray(DB.daily)')) return; }
    catch (e) {}
    await tunggu(50);
  }
  throw new Error('panel Input Omset tidak pernah siap');
}
/* Form diisi lewat elemen sungguhan, lalu saveDaily() dipanggil apa adanya —
   yang diuji jalur simpan yang benar-benar dipakai orang. */
function isiForm(w) {
  const set = (id, v) => { const e = w.document.getElementById(id); if (e) e.value = v; };
  set('i_food', '12614400'); set('i_bev', '13778500'); set('i_lainnya', '185000');
  set('i_discount', '359650'); set('i_svc', '1257200'); set('i_tax', '2514400');
  set('i_traffic', '400'); set('i_bill', '214');
  set('i_qfood', '100'); set('i_qbev', '80'); set('i_qothers', '0');
}
const jejakDari = (w, tgl) =>
  JSON.parse(w.eval('JSON.stringify((DB.daily.find(x=>x.date==="' + tgl + '")||{}).log||[])'));

(async () => {
  /* ============ 1. hari BARU mencatat penginputnya ============ */
  console.log('\n== Hari baru: jejak lahir ==');
  {
    const w = dom({ nama: 'Ani', id: 'u-ani' });
    await siap(w);
    w.eval('inputDate="' + TGL + '"');
    w.go('input'); await tunggu(120);
    cek('halaman Input Omset tergambar', !!w.document.getElementById('i_food'));
    isiForm(w);
    w.eval('saveDaily()'); await tunggu(120);

    const log = jejakDari(w, TGL);
    cek('barisnya tersimpan', w.eval('DB.daily.length') === 1);
    cek('jejaknya tercatat satu entri', log.length === 1, JSON.stringify(log));
    cek('namanya orang yang login', log[0] && log[0].by === 'Ani', JSON.stringify(log[0] || {}));
    cek('waktunya ikut', !!(log[0] && log[0].at));
  }

  /* ============ 2. disunting orang lain: MENUMPUK ============ */
  console.log('\n== Disunting orang lain: menumpuk, bukan menimpa ==');
  {
    /* Hari yang sudah punya jejak Ani, lalu disimpan ulang oleh Budi. */
    const sudah = JSON.parse(JSON.stringify(DAILY_LAMA));
    sudah[0].log = [{ by: 'Ani', at: Date.now() - 86400000 }];
    const w = dom({ nama: 'Budi', id: 'u-budi', daily: sudah });
    await siap(w);
    w.eval('inputDate="' + TGL + '"');
    w.go('input'); await tunggu(120);
    isiForm(w);
    w.eval('saveDaily()'); await tunggu(120);

    const log = jejakDari(w, TGL);
    cek('jejak lama TIDAK hilang', log.length === 2, JSON.stringify(log));
    cek('yang pertama tetap Ani', log[0] && log[0].by === 'Ani');
    cek('yang terakhir Budi', log[log.length - 1] && log[log.length - 1].by === 'Budi');
    /* Baris hari itu tidak boleh berlipat: yang disentuh baris yang sama. */
    cek('tidak melahirkan baris kedua untuk tanggal yang sama',
        w.eval('DB.daily.filter(x=>x.date==="' + TGL + '").length') === 1);

    w.go('input'); await tunggu(120);
    const v = w.document.getElementById('app-view').innerHTML;
    cek('layar menyebut "Diinput oleh"', v.indexOf('Diinput</span> oleh') > -1 || /Diinput\s*oleh/.test(v),
        v.slice(Math.max(0, v.indexOf('Diinput') - 60), v.indexOf('Diinput') + 120));
    cek('nama terakhir dipajang', v.indexOf('Budi') > -1);
    cek('nama sebelumnya ikut disebut', v.indexOf('Ani') > -1,
        'riwayat hilang = jejak menumpuk jadi tak berguna');
    /* Halaman ini tombolnya berbunyi "Update Data"/"Simpan Omset" — kata
       "Disubmit" di sini membuat orang mengira ada langkah lain. */
    cek('TIDAK memakai kata Disubmit', v.indexOf('Disubmit') < 0);
  }

  /* ============ 3. hari lama tanpa jejak: dikatakan ============ */
  console.log('\n== Hari lama tanpa jejak ==');
  {
    const w = dom({ nama: 'Citra', id: 'u-citra', daily: JSON.parse(JSON.stringify(DAILY_LAMA)) });
    await siap(w);
    w.eval('inputDate="' + TGL + '"');
    w.go('input'); await tunggu(120);
    const v = w.document.getElementById('app-view').innerHTML;

    cek('ketiadaannya dikatakan', v.indexOf('sebelum jejak') > -1);
    cek('tidak mengarang nama siapa pun', v.indexOf('Citra') < 0,
        'nama yang membuka halaman ikut tergambar = jejak yang diklaim tanpa dasar');
    /* Menyimpan ulang mencatat yang MENGUBAH — dan itu memang bukan penginput
       pertama. Yang penting: tidak berpura-pura tahu. */
    isiForm(w);
    w.eval('saveDaily()'); await tunggu(120);
    const log = jejakDari(w, TGL);
    cek('menyimpan ulang mencatat yang mengubahnya', log.length === 1 && log[0].by === 'Citra',
        JSON.stringify(log));
  }

  /* ============ 4. Report Daily tidak ikut berubah ============ */
  console.log('\n== Report Daily tetap "Disubmit" ==');
  {
    cek('jejakHtml dipanggil tanpa label di Report Daily',
        /\$\{jejakHtml\(rec\)\}/.test(HTML), 'pemanggilan lama berubah = kata kerjanya ikut bergeser');
    cek('bawaannya tetap Disubmit', HTML.indexOf("esc(kata||'Disubmit')") > -1);
    /* Satu mekanisme, bukan dua. Kalau ada yang menambahkan jejak sendiri di
       kemudian hari, ini yang akan gagal lebih dulu. */
    cek('tambahJejak hanya satu di modul ini',
        (HTML.match(/function tambahJejak\(/g) || []).length === 1);
    cek('jejakHtml hanya satu di modul ini',
        (HTML.match(/function jejakHtml\(/g) || []).length === 1);
    cek('saveDaily memakai tambahJejak yang sama',
        /const jejak=tambahJejak\(ex\);/.test(HTML));
  }

  console.log('\n---------------------------------------');
  console.log('LULUS ' + lulus + '   GAGAL ' + gagal);
  process.exit(gagal ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
