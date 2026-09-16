/* Uji "kuota localStorage penuh tidak boleh menghentikan penyimpanan" —
   modul Marketing, 16 September 2026.

   SEBABNYA NYATA, bukan teori. Dilaporkan user sebagai "upload foto di
   Request Design tidak bisa". Diukur atas state produksi hari itu:

     state seluruh modul   4,83 MB (5.067.474 karakter)
     kuota localStorage    5 MiB   (5.242.880 karakter)
     SISA                  171 KB
     designreqs saja       4,43 MB  <- 89% isinya foto referensi

   `localStorage.setItem(KEY, …)` ditulis TELANJANG di lima tempat, dan yang
   di BARIS PERTAMA save() berdiri SEBELUM fetch(). Begitu kuotanya lewat,
   setItem melempar QuotaExceededError, save() berhenti di situ, dan TIDAK
   SATU PUN kiriman sampai ke server — tanpa satu pun pesan di layar, karena
   galatnya lolos keluar dari penangan klik dan cuma mendarat di console.

   YANG DIJAGA DI SINI:

     - PENYIMPANAN TETAP JALAN. Diukur dengan MENGHITUNG POST saveAll, bukan
       dengan melihat ada-tidaknya galat: "tidak melempar" saja tidak
       membuktikan kirimannya berangkat.
     - DIKATAKAN, sekali per sesi. Jaring pengaman offline yang mati diam-diam
       membuat yang menutup tab di tengah kiriman kehilangan pekerjaannya
       tanpa satu pun tanda. Tapi peringatan yang muncul di TIAP simpan
       berhenti dibaca — jadi sekali saja.
     - CACHE TIDAK DITULIS SEPARUH. Godaan yang paling masuk akal saat kuota
       penuh adalah menyimpan versi tanpa foto. Itu BERBAHAYA: cache dibaca
       balik ke `S` kalau getAll gagal, dan penyimpanan berikutnya mengirim
       `S` apa adanya — cache tanpa foto akan MENGHAPUS foto yang sebenarnya
       masih utuh di server. Diuji sebagai larangan tersendiri.
     - SATU PENULIS CACHE. Yang keenam yang ditambahkan nanti akan telanjang
       lagi kalau yang dijaga cuma kelimanya; jadi yang dikunci INVARIANNYA. */
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

/* Mesin bonus dimuat lewat <script src>; jsdom tidak mengambil skrip eksternal,
   jadi isinya disisipkan inline. Kalau lupa, halamannya jatuh di tempat yang
   tidak ada hubungannya dengan yang diuji. */
const ASET = fs.readFileSync(path.join(ROOT, 'deploy', 'assets', 'performa-bonus.js'), 'utf8');
const ASLI = fs.readFileSync(path.join(ROOT, 'deploy', 'marketing', 'index.html'), 'utf8');
const HTML = ASLI.replace(/<script src="\.\.\/assets\/performa-bonus\.js"><\/script>/,
  () => '<script>' + ASET + '</' + 'script>');
if (HTML === ASLI) { console.error('tag performa-bonus.js tidak ketemu di sumber marketing'); process.exit(2); }

let lulus = 0, gagal = 0;
const cek = (n, s, k) => {
  if (s) { lulus++; console.log('  OK   ' + n); }
  else { gagal++; console.log('  GAGAL ' + n + (k ? '  -> ' + k : '')); }
};
const sama = (n, d, h) => cek(n, d === h, 'dapat ' + JSON.stringify(d) + ', harusnya ' + JSON.stringify(h));
const tunggu = ms => new Promise(r => setTimeout(r, ms));

/* Foto referensi TIRUAN — data URI base64, bentuk yang sama dengan yang
   benar-benar disimpan drRefFoto(). Besarnya dipilih supaya satu foto saja
   sudah melewati kuota tiruan di bawah. */
const FOTO = 'data:image/jpeg;base64,' + 'A'.repeat(300 * 1024);
const STATE = {
  clients: [], events: [], followups: [], approvals: [], users: [], staff: [],
  designreqs: [
    { id: 'DR1', judul: 'kupon pudding', brief: 'warna kuning', refs: [], updatedAt: 1 },
    { id: 'DR2', judul: 'backdrop mc', brief: 'ada nama mc', refs: [], updatedAt: 1 }
  ],
  vip: [], activities: [], settings: {}
};

function buka(opt) {
  opt = opt || {};
  const jejak = { post: [], toast: [], kuota: 0 };
  const d = new JSDOM(HTML, {
    url: 'https://team.laksamanamuda.id/marketing/',
    runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: new VirtualConsole(),
    beforeParse(w) {
      w.alert = () => {}; w.confirm = () => true; w.scrollTo = () => {}; w.print = () => {};
      w.HTMLElement.prototype.scrollIntoView = function () {};
      /* localStorage TIRUAN berkuota, persis seperti peramban: setItem yang
         melewati batas MELEMPAR QuotaExceededError. Tanpa tiruan ini kuota
         tidak pernah bisa diuji — jsdom tidak punya batas sama sekali, jadi
         bug-nya tidak akan pernah muncul. */
      const isi = {};
      let batas = opt.kuota || (5 * 1024 * 1024);
      w.__kuota = n => { batas = n; };
      w.__isiCache = () => (isi['lm_crm_v1'] || '');
      Object.defineProperty(w, 'localStorage', { configurable: true, value: {
        getItem: k => (k in isi ? isi[k] : null),
        removeItem: k => { delete isi[k]; },
        clear: () => { Object.keys(isi).forEach(k => delete isi[k]); },
        key: i => Object.keys(isi)[i] || null,
        get length() { return Object.keys(isi).length; },
        setItem: (k, v) => {
          const total = Object.keys(isi).reduce((a, x) => a + (x === k ? 0 : isi[x].length), 0)
            + String(v).length;
          if (total > batas) {
            jejak.kuota++;
            const e = new Error('exceeded the quota.'); e.name = 'QuotaExceededError'; throw e;
          }
          isi[k] = String(v);
        }
      }});
      w.localStorage.setItem('lm_session', JSON.stringify({
        expiry: Date.now() + 3600000, userId: 'u-uji', name: 'Penguji',
        modules: ['marketing'], adminModules: ['marketing'] }));
      w.fetch = async (url, init) => {
        const u = String(url);
        let b = {}; try { b = init && init.body ? JSON.parse(init.body) : {}; } catch (e) {}
        const balas = o => ({ ok: true, status: 200, text: async () => JSON.stringify(o), json: async () => o });
        if (b && b.action === 'saveAll') { jejak.post.push(JSON.parse(JSON.stringify(b.data || {}))); return balas({ ok: true, data: { saved: true } }); }
        if (u.indexOf('account-api') > -1) return balas({ ok: true, members: [] });
        if (u.indexOf('marketing-api') > -1 && u.indexOf('getAll') > -1)
          return balas({ ok: true, data: JSON.parse(JSON.stringify(STATE)) });
        return balas({ ok: true, data: {} });
      };
    }
  });
  return { w: d.window, jejak };
}
async function siap(w) {
  for (let i = 0; i < 300; i++) {
    try { if (w.eval('typeof S !== "undefined" && S && typeof simpanCache === "function" && Array.isArray(S.designreqs)')) return; }
    catch (e) {}
    await tunggu(50);
  }
  throw new Error('modul Marketing tidak pernah siap');
}
/* Foto ditempelkan lewat bentuk yang SAMA dengan drRefFoto() — {t:'img',v,n}. */
function tempelFoto(w, idReq) {
  w.eval('(function(){ var r=(S.designreqs||[]).filter(function(x){return x.id==="' + idReq + '";})[0];'
    + ' if(r) r.refs=(r.refs||[]).concat([{t:"img",v:window.__foto,n:"foto.jpg"}]); })()');
}

(async () => {
  /* ================================================================
     1. KUOTA LONGGAR — keadaan normal, cache memang ditulis
     ================================================================ */
  console.log('\n== Kuota longgar: cache ditulis seperti biasa ==');
  {
    const { w, jejak } = buka({ kuota: 5 * 1024 * 1024 });
    await siap(w);
    w.eval('window.__toast=[]; toast=function(a,b,c){ window.__toast.push(String(a)); };');
    jejak.post.length = 0;
    w.eval('save()');
    await tunggu(200);
    sama('kuota tidak terlampaui', jejak.kuota, 0);
    sama('POST saveAll berangkat', jejak.post.length, 1);
    cek('cache benar-benar tertulis', w.eval('__isiCache()').length > 10, 'panjang=' + w.eval('__isiCache()').length);
    sama('penandanya sehat', w.eval('CACHE_GAGAL'), '');
    w.close();
  }

  /* ================================================================
     2. KUOTA PENUH — inilah keadaan yang dilaporkan user
     ================================================================ */
  console.log('\n== Kuota penuh: penyimpanan TETAP berangkat ==');
  {
    const { w, jejak } = buka({ kuota: 5 * 1024 * 1024 });
    await siap(w);
    w.eval('window.__toast=[]; toast=function(a,b,c){ window.__toast.push(String(a)); };');
    w.__foto = FOTO;
    /* Isi cache DIREKAM sebelum kuotanya dijepit — itu pembandingnya. */
    const sebelum = w.eval('__isiCache()');
    tempelFoto(w, 'DR1');
    /* Kuotanya dijepit SESUDAH fotonya ditempel — begitulah urutannya di
       lapangan: state tumbuh dulu, lalu melewati batas. */
    w.eval('__kuota(' + (200 * 1024) + ')');
    jejak.post.length = 0; jejak.kuota = 0;

    let lempar = '';
    try { w.eval('save()'); } catch (e) { lempar = (e && e.name) || String(e); }
    await tunggu(250);

    sama('kuota memang terlampaui', jejak.kuota > 0, true);
    /* INI ASERSI YANG MENENTUKAN. "Tidak melempar" saja tidak membuktikan
       kirimannya berangkat — yang dihitung POST-nya. */
    sama('save() TIDAK melempar keluar', lempar, '');
    sama('POST saveAll TETAP berangkat', jejak.post.length, 1);
    sama('penandanya menyebut penuh', w.eval('CACHE_GAGAL'), 'penuh');

    /* Fotonya benar-benar ikut di kiriman — bukan cuma "ada POST". */
    const p = jejak.post[0] || {};
    const dr1 = (p.designreqs || []).filter(x => x.id === 'DR1')[0] || {};
    const img = (dr1.refs || []).filter(x => x && x.t === 'img');
    sama('fotonya ikut di kiriman', img.length, 1);
    cek('...dan isinya utuh, tidak dipotong',
        img[0] && String(img[0].v).length === FOTO.length,
        'panjang=' + (img[0] ? String(img[0].v).length : 0) + ' dari ' + FOTO.length);

    console.log('\n== Sebabnya dikatakan, sekali saja ==');
    const t1 = JSON.parse(w.eval('JSON.stringify(window.__toast||[])'));
    cek('ada peringatan tentang simpanan lokal',
        t1.some(x => /simpanan lokal/i.test(x)), JSON.stringify(t1));
    /* Peringatan yang muncul di TIAP simpan berhenti dibaca. */
    /* DIBUNGKUS try. Begitu sebuah mutasi mengembalikan bug-nya, save() di
       sini MELEMPAR — dan panggilan telanjang membuat seluruh berkas uji ini
       mati sebelum ringkasannya tercetak, sehingga mutasinya terbaca "uji
       tidak selesai" alih-alih "tertangkap". Bentuk yang sudah dibayar di
       uji-catatan-wajib-dw.js dan uji-analytics.js. Melemparnya sendiri jadi
       asersi tersendiri, bukan ditelan. */
    jejak.post.length = 0;
    let lempar2 = '';
    try { w.eval('save()'); await tunggu(250); w.eval('save()'); await tunggu(250); }
    catch (e) { lempar2 = (e && e.name) || String(e); }
    sama('simpan berikutnya pun tidak melempar', lempar2, '');
    const t2 = JSON.parse(w.eval('JSON.stringify(window.__toast||[])'));
    sama('tidak diulang tiap simpan',
         t2.filter(x => /simpanan lokal/i.test(x)).length, 1);
    cek('...dan simpan berikutnya tetap berangkat', jejak.post.length >= 1,
        'post=' + jejak.post.length);

    /* ============================================================
       CACHE TIDAK BOLEH DITULIS SEPARUH
       ============================================================
       Kalau kuota penuh lalu kodenya "menolong" dengan menyimpan versi tanpa
       foto, cache itu dibaca balik ke S saat getAll gagal — dan penyimpanan
       berikutnya MENGHAPUS foto yang sebenarnya masih utuh di server. */
    /* CACHE DIBIARKAN APA ADANYA, bukan ditulis separuh.

       Cache yang tertinggal memang BASI — ia versi sebelum fotonya ditempel,
       dan itu wajar: penulisannya gagal, jadi tidak ada yang berubah. Yang
       dilarang bukan basinya, melainkan kodenya "menolong" dengan menyimpan
       versi yang DIPANGKAS (mis. tanpa foto) supaya muat. Cache semacam itu
       dibaca balik ke `S` kalau getAll gagal, dan yang membacanya tidak punya
       cara tahu fotonya sengaja dibuang.

       Basinya sendiri tidak berbahaya, dan itu sudah dijaga SERVER: baris yang
       tidak ditandai berubah dan capnya lebih tua dilewati
       (`$ua < $verServer` -> continue di upsert_settings_collection), jadi
       salinan lama tidak pernah bisa menghapus foto yang ada di server. */
    console.log('\n== Cache dibiarkan apa adanya, bukan ditulis separuh ==');
    const sesudah = w.eval('__isiCache()');
    sama('isi cache tidak berubah sesudah penulisan gagal', sesudah, sebelum);
    w.close();
  }

  /* ================================================================
     3. INVARIAN SUMBER — satu penulis cache
     ================================================================ */
  console.log('\n== Invarian: satu penulis cache ==');
  const KODE = ASLI.replace(/\/\*[\s\S]*?\*\//g, ' ');
  const tulis = (KODE.match(/localStorage\.setItem\(KEY\s*,/g) || []).length;
  sama('localStorage.setItem(KEY,…) cuma ada SEKALI di seluruh berkas', tulis, 1);
  cek('...dan yang satu itu di dalam simpanCache()',
      /function simpanCache\(\)\{[\s\S]{0,400}localStorage\.setItem\(KEY\s*,/.test(KODE));
  cek('simpanCache() menangkap galatnya',
      /function simpanCache\(\)\{[\s\S]{0,600}catch\s*\(/.test(KODE));
  /* Larangan yang menjaga godaan paling masuk akal: menulis cache tanpa foto. */
  cek('tidak ada penyaring foto di jalur cache',
      !/localStorage\.setItem\(KEY[\s\S]{0,200}filter\([^)]*img/.test(KODE));

  /* KONTRAK SISI SERVER. Cache yang basi baru aman selama penjaga urutan ini
     berdiri: baris yang TIDAK ditandai berubah dan capnya lebih tua DILEWATI.
     Dicabut, salinan lama dari cache bisa menghapus foto yang sebenarnya
     masih utuh di server — dan gejalanya foto yang hilang sendiri, bukan
     galat. PHP tidak bisa dijalankan di mesin ini, jadi yang dijaga
     KONTRAKNYA atas sumber; pola yang sama dengan uji-simpan-basi.js. */
  const PHP = fs.readFileSync(path.join(ROOT, 'marketing-mysql', 'lib_marketing_mysql.php'), 'utf8');
  cek('server melewati baris lama yang tidak diubah (penjaga urutan)',
      /!\$lolosBentrok && \$verServer !== null && \$ua < \$verServer\)\s*continue;/.test(PHP),
      'penjaga urutan di upsert_settings_collection tidak ketemu');

  console.log('\n' + lulus + ' OK, ' + gagal + ' GAGAL');
  process.exit(gagal ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
