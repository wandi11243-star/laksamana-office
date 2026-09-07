/* uji-simpan-basi.js — penjaga tulis-basi pada blob omset bersama
 *
 *   node tools/uji-simpan-basi.js
 *   JSDOM_PATH=/jalur/ke/jsdom node tools/uji-simpan-basi.js
 *
 * KENAPA UJI INI ADA. deploy/finance/omset dan deploy/cashier menulis ke SATU
 * baris database yang sama (app_state id=1 di kompas-mysql) dan keduanya
 * mengirim SELURUH state tiap menyimpan. Sampai 7 September 2026 server
 * menimpanya buta, jadi tab yang sudah lama terbuka memegang snapshot basi dan
 * penyimpanan apa pun darinya menulis ulang seluruh blob dari snapshot itu —
 * menghapus koreksi yang baru saja dibuat orang di modul sebelah, tanpa satu
 * pun galat.
 *
 * Keluhan user 7 September 2026: tax 23 Agustus dibetulkan dari 2.514 jadi
 * 2.514.400 di Input Omset Harian, terbukti tersimpan lewat hard refresh, lalu
 * beberapa menit kemudian kembali ke 2.514.
 *
 * YANG DIUJI ADALAH SKENARIONYA, bukan potongan fungsinya: DUA jsdom terpisah —
 * satu Cashier, satu Omset — dengan localStorage masing-masing, menghadap SATU
 * server tiruan. Itu simulasi dua tab yang sesungguhnya. Uji yang cuma
 * memanggil apiSave() sekali tidak akan pernah menangkap bug ini, karena
 * bug-nya lahir dari URUTAN dua penyimpanan.
 *
 * PHP tidak bisa dijalankan di mesin pengembangan ini, jadi server tiruannya
 * ditulis di sini — dan supaya tiruannya tidak menyimpang dari yang ditiru,
 * bagian terakhir uji ini membandingkan kontraknya dengan SUMBER PHP-nya
 * (nama field, arah perbandingan, dan bahwa versi yang ditulis sama dengan
 * yang dibalas). Tiruan yang bentuknya beda dari yang ditiru tidak menguji apa
 * pun — pelajaran yang sudah dibayar di stub hpp.php pada uji-analytics.
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
const sama = (n, d, h) => cek(n, d === h, 'dapat ' + JSON.stringify(d) + ', harusnya ' + JSON.stringify(h));

/* ---------------- server tiruan: SATU blob, dipakai bersama ---------------- */
const TGL = '2026-08-23';
const server = {
  ts: 1000,
  by: '',
  data: { daily: [{ date: TGL, food: 12614400, bev: 13778500, lainnya: 185000,
                    discount: 359650, service_charge: 1257200, tax: 2514, bill: 214 }],
          employees: { marketing: [], event: [], kasir: [] }, settings: {} },
};
const jejakSimpan = [];   // {tab, baseTs, diterima}

function balas(obj) {
  return Promise.resolve({ ok: true, status: 200,
    json: () => Promise.resolve(obj), text: () => Promise.resolve(JSON.stringify(obj)) });
}
function buatFetch(tab) {
  return (url, opts) => {
    const u = String(url);
    let body = {};
    if (opts && opts.body) { try { body = JSON.parse(opts.body); } catch (e) {} }
    if (/listDivisiRoster/.test(String(opts && opts.body || ''))) return balas({ ok: true, members: [] });
    if (/action=getAll/.test(u)) {
      return balas({ ok: true, data: JSON.parse(JSON.stringify(server.data)), ts: server.ts });
    }
    if (body.action === 'saveAll') {
      const base = +body.baseTs || 0;
      /* Penjaganya persis seperti save_all() di kompas-mysql: hanya menolak
         kalau klien MENYEBUTKAN versinya dan versi itu sudah bergerak. */
      if (base > 0 && server.ts > 0 && base !== server.ts) {
        jejakSimpan.push({ tab, baseTs: base, diterima: false });
        return balas({ ok: false, konflik: true, ts: server.ts, by: server.by,
                       error: 'Data di server sudah diubah orang lain sejak halaman ini dimuat.' });
      }
      server.ts += 1;
      server.data = JSON.parse(JSON.stringify(body.data));
      server.by = String((body.data && body.data._savedBy) || '');
      jejakSimpan.push({ tab, baseTs: base, diterima: true });
      return balas({ ok: true, data: { saved: true, ts: server.ts } });
    }
    return balas({ ok: true, data: {} });
  };
}

function bukaTab(nama, berkas, modul, url) {
  const html = fs.readFileSync(path.join(ROOT, berkas), 'utf8')
    .replace(/<script[^>]*\ssrc=[^>]*><\/script>/gi, '');
  const vc = new VirtualConsole();
  vc.on('jsdomError', e => {
    const t = String((e && e.detail && e.detail.stack) || (e && e.message) || e);
    if (!/Not implemented|Could not parse CSS/.test(t)) console.log('  !! ' + nama + ': ' + t.split('\n')[0]);
  });
  const dom = new JSDOM(html, { virtualConsole: vc, runScripts: 'dangerously', url,
    beforeParse(w) {
      w.localStorage.setItem('lm_session', JSON.stringify({
        id: 'u' + nama, name: nama, modules: [modul], adminModules: [],
        token: 't', expiry: Date.now() + 86400000 }));
      w.fetch = buatFetch(nama);
      w.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
      w.print = () => {};
      w.confirm = () => true;
      w.Chart = class { destroy() {} update() {} };
      w.HTMLCanvasElement.prototype.getContext = () => ({});
    } });
  return dom.window;
}
const tunggu = ms => new Promise(r => setTimeout(r, ms));
const taxDi = w => {
  const d = w.eval('JSON.stringify((DB&&DB.daily||[]).find(x=>x.date==="' + TGL + '")||null)');
  return d ? JSON.parse(d).tax : null;
};

(async function () {
  /* ---- 1. dua tab dibuka, dua-duanya memuat versi yang sama ---- */
  console.log('-- dua tab dibuka --');
  const kasir = bukaTab('Kasir', 'deploy/cashier/index.html', 'cashier',
                        'https://dev.laksamanamuda.id/cashier/');
  const fin = bukaTab('Finance', 'deploy/finance/omset/index.html', 'kompas',
                      'https://dev.laksamanamuda.id/finance/omset/');
  await tunggu(600);
  sama('tab Kasir memuat versi server', kasir.eval('BASE_TS'), 1000);
  sama('tab Finance memuat versi server', fin.eval('BASE_TS'), 1000);
  sama('keduanya melihat tax yang masih salah', taxDi(fin), 2514);

  /* ---- 2. Finance membetulkan tax, lalu menyimpan ---- */
  console.log('\n-- Finance membetulkan tax 2.514 -> 2.514.400 --');
  fin.eval('(function(){var d=DB.daily.find(function(x){return x.date==="' + TGL + '";}); d.tax=2514400; save(); clearTimeout(SAVE_TIMER); kirim();})()');
  await tunggu(300);
  sama('server menerima koreksinya', server.data.daily[0].tax, 2514400);
  sama('versi server maju', server.ts, 1001);
  sama('tab Finance ikut memperbarui versinya sendiri', fin.eval('BASE_TS'), 1001);
  cek('...jadi simpan KEDUA dari tab yang sama tidak ditolak', (function () {
    fin.eval('(function(){var d=DB.daily.find(function(x){return x.date==="' + TGL + '";}); d.bill=215; save(); clearTimeout(SAVE_TIMER); kirim();})()');
    return true;
  })());
  await tunggu(300);
  sama('simpan kedua diterima', server.data.daily[0].bill, 215);
  sama('...dan taxnya tetap benar', server.data.daily[0].tax, 2514400);

  /* ---- 3. INILAH BUG-NYA: tab Kasir yang basi menyimpan ---- */
  console.log('\n-- tab Kasir (masih memegang snapshot lama) menyimpan --');
  sama('tab Kasir memang masih memegang tax lama', taxDi(kasir), 2514);
  kasir.eval('(function(){DB.settings=DB.settings||{}; DB.settings.apaSaja=1; save(); clearTimeout(SAVE_TIMER); kirim();})()');
  await tunggu(300);
  sama('KOREKSI FINANCE TIDAK TERHAPUS', server.data.daily[0].tax, 2514400);
  const terakhir = jejakSimpan[jejakSimpan.length - 1];
  cek('penyimpanan tab basi DITOLAK', terakhir && terakhir.tab === 'Kasir' && terakhir.diterima === false,
      JSON.stringify(terakhir));
  sama('versi server tidak bergerak karena penolakan itu', server.ts, 1002);

  /* ---- 4. yang ditolak harus TAHU, dan tidak boleh mencoba ulang ---- */
  console.log('\n-- yang ditolak diberi tahu --');
  const kotak = kasir.document.getElementById('syncBox');
  cek('kotak status berbunyi TIDAK tersimpan', kotak && /TIDAK tersimpan/.test(kotak.innerHTML),
      kotak ? kotak.textContent.slice(0, 90) : '(kotak tidak ada)');
  cek('...menyebut siapa yang mengubahnya', kotak && /Finance/.test(kotak.innerHTML));
  cek('...dan menyuruh MENCATAT dulu, bukan sekadar muat ulang',
      kotak && /Catat dulu/.test(kotak.innerHTML) && /muat ulang/i.test(kotak.innerHTML));
  cek('perubahan tab Kasir TIDAK dibuang dari layarnya',
      kasir.eval('!!(DB.settings&&DB.settings.apaSaja)'));
  cek('ditandai masih ada yang belum tersimpan', kasir.eval('DIRTY') === true);
  /* Percobaan ulang untuk konflik bukan cuma sia-sia: kalau suatu hari
     penjaganya lewat, justru ulangan itu yang menimpa kerja orang. */
  const sebelum = jejakSimpan.length;
  await tunggu(1200);
  sama('TIDAK ada percobaan ulang otomatis', jejakSimpan.length, sebelum);

  /* ---- 5. sesudah memuat ulang, tab itu sehat lagi ---- */
  console.log('\n-- tab yang dimuat ulang sehat kembali --');
  const kasir2 = bukaTab('Kasir2', 'deploy/cashier/index.html', 'cashier',
                         'https://dev.laksamanamuda.id/cashier/');
  await tunggu(600);
  sama('memuat versi terkini', kasir2.eval('BASE_TS'), server.ts);
  sama('...berikut tax yang sudah betul', taxDi(kasir2), 2514400);
  kasir2.eval('(function(){DB.settings=DB.settings||{}; DB.settings.apaSaja=2; save(); clearTimeout(SAVE_TIMER); kirim();})()');
  await tunggu(300);
  cek('simpannya diterima', jejakSimpan[jejakSimpan.length - 1].diterima === true);
  sama('dan tax tetap benar', server.data.daily[0].tax, 2514400);

  /* ---- 6. server lama (tanpa ts) tidak boleh mematikan penyimpanan ---- */
  console.log('\n-- server versi lama (belum ter-deploy) --');
  server.ts = 0;
  const lama = bukaTab('Lama', 'deploy/finance/omset/index.html', 'kompas',
                       'https://dev.laksamanamuda.id/finance/omset/');
  await tunggu(600);
  sama('BASE_TS nol kalau server tidak mengirim versi', lama.eval('BASE_TS'), 0);
  const n0 = jejakSimpan.length;
  lama.eval('(function(){DB.settings=DB.settings||{}; DB.settings.apaSaja=3; save(); clearTimeout(SAVE_TIMER); kirim();})()');
  await tunggu(300);
  cek('penyimpanan TETAP jalan — urutan deploy tidak boleh mematikan simpan',
      jejakSimpan.length > n0 && jejakSimpan[jejakSimpan.length - 1].diterima === true);

  /* ---- 7. kontraknya cocok dengan SUMBER PHP ---- */
  console.log('\n-- kontrak dengan kompas-mysql --');
  const LF = t => t.replace(/\r\n/g, '\n');
  const lib = LF(fs.readFileSync(path.join(ROOT, 'kompas-mysql/lib_kompas_mysql.php'), 'utf8'));
  const api = LF(fs.readFileSync(path.join(ROOT, 'kompas-mysql/api.php'), 'utf8'));
  const omset = LF(fs.readFileSync(path.join(ROOT, 'deploy/finance/omset/index.html'), 'utf8'));
  const cash = LF(fs.readFileSync(path.join(ROOT, 'deploy/cashier/index.html'), 'utf8'));
  cek('getAll memulangkan ts', /'ts' => state_ts\(\)/.test(api));
  cek('saveAll membaca baseTs dari badan permintaan', /\$body\['baseTs'\]/.test(api));
  cek('konflik dibalas ok:false berikut penandanya',
      /'ok' => false, 'konflik' => true/.test(api));
  cek('save_all menerima baseTs', /function save_all\(\$state, \$baseTs = null\)/.test(lib));
  cek('penjaganya hanya menolak saat versinya BEDA',
      /if \(\$tsKini > 0 && \(int\)\$baseTs !== \$tsKini\)/.test(lib));
  cek('baseTs kosong dibiarkan lewat (klien/deploy lama tidak mati)',
      /if \(\$baseTs !== null && \(int\)\$baseTs > 0\)/.test(lib));
  /* Versi yang DITULIS wajib sama dengan yang DIBALAS. Kalau dihitung dua kali,
     tiap simpan kedua dari tab yang sama akan ditolak tanpa ada yang salah. */
  cek('versi dihitung sekali, dipakai menulis DAN dibalas',
      /\$ua = \(int\)\(microtime\(true\) \* 1000\);/.test(lib)
      && /':ua' => \$ua,/.test(lib) && /'ts' => \$ua,/.test(lib));
  cek('klien mengirim baseTs', /baseTs:BASE_TS/.test(omset) && /baseTs:BASE_TS/.test(cash));
  cek('klien membaca ts dari getAll', /BASE_TS=\+j\.ts\|\|0/.test(omset) && /BASE_TS=\+j\.ts\|\|0/.test(cash));
  cek('klien memajukan baseTs sesudah simpannya sendiri berhasil',
      /BASE_TS=\+j\.data\.ts\|\|BASE_TS/.test(omset) && /BASE_TS=\+j\.data\.ts\|\|BASE_TS/.test(cash));
  cek('versi ikut disimpan bersama salinan lokal (boot offline tetap berpenjaga)',
      /TS_KEY=CACHE_KEY\+'_ts'/.test(omset) && /BASE_TS=\+localStorage\.getItem\(TS_KEY\)\|\|0/.test(cash));
  /* finance/kas MEMBACA blob ini tapi tidak pernah menulisnya — save()-nya
     sudah dilumpuhkan. Kalau suatu hari ia menulis lagi tanpa baseTs, ia jadi
     lubang yang sama persis. */
  const kas = LF(fs.readFileSync(path.join(ROOT, 'deploy/finance/kas/index.html'), 'utf8'));
  const kasKode = kas.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
  /* kirim() dan apiSave() di finance/kas SENGAJA dibiarkan hidup sebagai kode
     mati — kode yang disalin dari Kompas masih memanggil save() di banyak
     tempat, dan fungsi yang dihapus akan menjatuhkan halaman dengan
     ReferenceError alih-alih tidak melakukan apa-apa. Jadi yang diperiksa
     bukan keberadaan teksnya, melainkan bahwa save()-nya TIDAK menembak
     jaringan. Kalau suatu hari ia dihidupkan lagi tanpa baseTs, ia jadi lubang
     yang sama persis dengan yang baru saja ditutup. */
  const badanFungsi = (src, kepala) => {
    const a = src.indexOf(kepala); if (a < 0) return '';
    let i = src.indexOf('{', a), d = 0;
    for (let j = i; j < src.length; j++) {
      if (src[j] === '{') d++;
      else if (src[j] === '}') { d--; if (!d) return src.slice(i, j + 1); }
    }
    return '';
  };
  const saveKas = badanFungsi(kasKode, 'function save(){');
  cek('save() di finance/kas ada dan tetap dilumpuhkan', saveKas.length > 0 && saveKas.length < 200,
      'panjang badannya ' + saveKas.length);
  cek('...cuma menulis salinan lokal, tidak menembak jaringan',
      /localStorage\.setItem/.test(saveKas) && !/kirim|apiSave|SAVE_TIMER/.test(saveKas),
      saveKas.replace(/\s+/g, ' ').slice(0, 120));

  console.log('\n' + ok + ' OK, ' + gagal + ' GAGAL');
  process.exit(gagal ? 1 : 0);
})();
