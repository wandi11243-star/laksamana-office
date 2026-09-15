/* Uji KETERANGAN WAJIB di pengajuan DW (deploy/dw/), permintaan user
   15 September 2026: "kirim pengajuan DW wajib mengisi keterangan".

   YANG DIJAGA, dan urutannya menentukan:

     1. KIRIMANNYA BENAR-BENAR DITAHAN. Pita merah yang muncul sementara
        barisnya tetap berangkat ke server adalah kebalikan dari yang diminta —
        dan dari layar keduanya terlihat sama persis. Karena itu yang dihitung
        JUMLAH POST-nya, bukan ada-tidaknya pita.
     2. KETIGA PINTUNYA, bukan satu. Modul ini punya tiga form yang sama-sama
        melahirkan baris di antrean HRD (Minta DW, sel kalender, Ajukan DW);
        yang dijaga cuma satu berarti dua jalan pintas yang tetap mengirim
        baris tanpa keterangan.
     3. MENGETIK TIDAK MENGGAMBAR ULANG MODALNYA. Kotak yang dibuat ulang
        kehilangan fokus dan hanya huruf pertama yang masuk — jebakan yang
        sudah dibayar di queueF() modul Konten, jadi identitas elemennya
        dibandingkan sebelum & sesudah.
     4. HRD TIDAK IKUT DITAHAN. Ia yang memutuskan; menuntut alasan tertulis
        kepada dirinya sendiri lima kali menghasilkan lima catatan asal-asalan.

   `smoke-modul.js dw` tidak cukup: ia tidak pernah membuka satu modal pun. */
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

const HTML = fs.readFileSync(path.join(ROOT, 'deploy', 'dw', 'index.html'), 'utf8');

let ok = 0, gagal = 0;
const cek = (n, s, k) => {
  if (s) { ok++; console.log('  OK   ' + n); }
  else { gagal++; console.log('  GAGAL ' + n + (k ? '  -> ' + k : '')); }
};
const sama = (n, d, h) => cek(n, d === h, 'dapat ' + JSON.stringify(d) + ', harusnya ' + JSON.stringify(h));
const tunggu = ms => new Promise(r => setTimeout(r, ms));

const kirim = [];
const nPost = aksi => kirim.filter(x => x.action === aksi).length;

function bukaModul() {
  const vc = new VirtualConsole();
  vc.on('jsdomError', e => {
    const t = String((e && e.detail && e.detail.stack) || (e && e.message) || e);
    if (!/Not implemented|Could not parse CSS/.test(t)) console.log('  !! ' + t.split('\n')[0]);
  });
  return new JSDOM(HTML, {
    url: 'https://dev.laksamanamuda.id/dw/',
    runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(w) {
      w.localStorage.setItem('lm_session', JSON.stringify({
        id: 'u-uji', userId: 'u-uji', name: 'Penguji', token: 't',
        modules: ['dw'], adminModules: [], expiry: Date.now() + 86400000,
      }));
      w.alert = () => {}; w.confirm = () => true; w.print = () => {};
      w.scrollTo = () => {}; w.open = () => null;
      w.fetch = async (url, init) => {
        const u = String(url);
        const body = (init && init.body) ? JSON.parse(init.body) : {};
        const post = !!(init && init.method === 'POST' && body.action);
        if (post) kirim.push(body);
        const balas = o => ({ ok: true, status: 200,
          text: async () => JSON.stringify(o), json: async () => o });
        if (/account-api/.test(u)) return balas({ ok: true, members: [] });
        if (/jadwal-api/.test(u))  return balas({ ok: true, data: { headIds: [] } });
        if (/-api-mysql/.test(u) && !/dw-api-mysql/.test(u)) {
          return balas({ ok: true, data: { events: [], clients: [], reservations: [] } });
        }
        /* Balasan simpan dibuat SEPERTI YANG DIHARAPKAN pemanggilnya
           (simpanAjuanRow membaca `row`, kirimMinta membaca `row.usulan` &
           `bentrok`) — tiruan yang bentuknya beda dari yang ditiru tidak
           menguji apa pun. */
        if (post) return balas({ ok: true, data: { row: { id: 'BARU', usulan: [] }, bentrok: [] } });
        return balas({ ok: true, data: { pekerja: [], ajuan: [], permintaan: [], setting: {},
                                         peran: { hrd: false, head: true, lihat: true, admin: false, divisi: ['bar'] } } });
      };
    },
  });
}

async function siap(w) {
  for (let i = 0; i < 200; i++) {
    try { if (w.eval('typeof S !== "undefined" && !!S && typeof fieldCatatanDW === "function"')) return; }
    catch (e) {}
    await tunggu(50);
  }
  throw new Error('modul DW tidak pernah siap');
}

/* Lewat normalizeState(), bukan disuntikkan mentah: itulah jalur data
   sungguhan. Dipanggil ulang tiap skenario — pengiriman yang BERHASIL memicu
   muat ulang, dan stub getAll memulangkan state kosong. */
function pasangData(w, peran) {
  const besok = w.eval('addD(hariIni(),1)');
  const data = {
    peran: peran,
    setting: { tarif: { 'Bartender': 100000 }, jamDasar: 6,
               jam: [{ n: 'Sore', m: '16:00', s: '23:00' }] },
    pekerja: [
      { id: 'P1', nama: 'Andi', hp: '081234567890', divisi: 'bar', posisi: 'Bartender', status: 'AKTIF' },
    ],
    ajuan: [], permintaan: [],
  };
  w.eval('S = normalizeState(' + JSON.stringify(data) + '); DIV="bar";');
  return { besok };
}

const HEAD = { hrd: false, head: true, lihat: true, admin: false, divisi: ['bar'] };
const HRD  = { hrd: true,  head: false, lihat: true, admin: true,  divisi: [] };

/* Menekan TOMBOLNYA, bukan memanggil fungsinya. Pelajaran `putuskan()` di
   modul Jadwal: tombol "Teruskan ke HRD" sempat mengirim status yang salah
   sementara ujinya hijau, karena ujinya memanggil pengirimnya langsung. */
function tekanAksi(w, i) {
  /* DIBUNGKUS try: begitu sebuah mutasi meloloskan kiriman yang seharusnya
     ditahan, modalnya sudah tertutup pada tekanan berikutnya dan
     jalankanAksiModal melempar. Yang melempar di sini MEMBUNUH seluruh
     berkas uji — dan mutasinya lalu terbaca "uji tidak selesai", bukan
     "tertangkap". Bentuk yang sama sudah dibayar di uji-analytics. */
  try { w.eval('jalankanAksiModal(' + (i || 0) + ')'); }
  catch (e) { /* dilaporkan asersinya, bukan dengan mematikan prosesnya */ }
}

function isiKotak(w, id, teks) {
  const el = w.document.getElementById(id);
  if (!el) return null;
  el.value = teks;
  /* Lewat penangan `oninput` yang sebenarnya — itu yang membersihkan pitanya,
     dan itu pula yang tidak boleh menggambar ulang modalnya. */
  el.dispatchEvent(new w.Event('input', { bubbles: true }));
  return el;
}

(async () => {
  const dom = bukaModul();
  const w = dom.window;
  await siap(w);

  console.log('\n== Siapa yang dituntut mengisi ==');
  pasangData(w, HEAD);
  cek('head WAJIB mengisi keterangan', w.eval('catatanWajibDW()') === true);
  pasangData(w, HRD);
  cek('HRD tidak dituntut', w.eval('catatanWajibDW()') === false);

  /* ---------------------------------------------------------------------
     Tiga pintu, satu skenario yang sama. Yang berbeda cuma cara membukanya
     dan aksi yang dihitung — kalau salah satunya suatu hari lepas, barisnya
     berangkat tanpa keterangan dan tidak ada satu pun layar yang menyebutnya.
     --------------------------------------------------------------------- */
  const pintu = [
    { nama: 'Minta DW', pfx: 'mt', aksi: 'simpanPermintaan', gambar: 'gambarMinta',
      buka: (T) => 'bukaMinta("")' },
    { nama: 'Sel kalender', pfx: 'sel', aksi: 'simpanAjuan', gambar: 'gambarSelDW',
      buka: (T) => 'isiSelDW("P1",' + JSON.stringify(T.besok) + ')' },
    { nama: 'Ajukan DW', pfx: 'ajt', aksi: 'simpanAjuan', gambar: 'gambarAjukanTgl',
      buka: (T) => 'ajukanTgl(' + JSON.stringify(T.besok) + ',"P1")' },
  ];

  for (const f of pintu) {
    console.log('\n== ' + f.nama + ' — keterangan kosong ditahan ==');
    const T = pasangData(w, HEAD);
    w.eval(f.buka(T));

    const html0 = w.document.getElementById('modalRoot').innerHTML;
    cek(f.nama + ': labelnya ditandai wajib', /<label>Catatan[^<]*\*<\/label>/.test(html0),
        (html0.match(/<label>Catatan[^<]*<\/label>/) || ['(tidak ada label Catatan)'])[0]);
    cek(f.nama + ': ...dan sebabnya disebut sebelum ditekan',
        /Wajib diisi — HRD memutuskan dari keterangan ini/.test(html0));

    const sebelum = nPost(f.aksi);
    tekanAksi(w, 0);
    await tunggu(120);
    /* INVARIAN TERPENTING DI BERKAS INI. */
    sama(f.nama + ': TIDAK ada yang dikirim ke server', nPost(f.aksi), sebelum);
    const html1 = w.document.getElementById('modalRoot').innerHTML;
    cek(f.nama + ': pitanya muncul', /Keterangannya belum diisi/.test(html1));
    /* Ditandai DI KOTAKNYA, bukan cuma lewat pita: pita menyebut aturannya,
       dan yang membacanya masih harus mencari kotak mana yang dimaksud di
       form berisi tujuh kotak. */
    const box = w.document.getElementById(f.pfx + 'Cat');
    cek(f.nama + ': ...dan kotaknya sendiri ditandai',
        !!box && box.classList.contains('err'), box ? box.className : '(kotaknya tidak ada)');

    /* Spasi saja bukan keterangan. */
    isiKotak(w, f.pfx + 'Cat', '   ');
    tekanAksi(w, 0);
    await tunggu(120);
    sama(f.nama + ': spasi saja tetap ditahan', nPost(f.aksi), sebelum);

    console.log('\n== ' + f.nama + ' — mengetik membersihkan pitanya ==');
    const el0 = w.document.getElementById(f.pfx + 'Cat');
    /* Diperiksa ADA lebih dulu, dan sisanya dilewati kalau tidak. Kalau
       kotaknya sudah tidak ada, formnya sudah tertutup — yaitu kirimannya
       LOLOS — dan asersi yang langsung menyentuh elemennya akan melempar,
       bukan memerah. */
    cek(f.nama + ': formnya masih terbuka sesudah ditahan', !!el0,
        'modalnya sudah tertutup — kirimannya lolos?');
    if (el0) {
      isiKotak(w, f.pfx + 'Cat', 'Ada acara 300 pax');
      const el1 = w.document.getElementById(f.pfx + 'Cat');
      cek(f.nama + ': kotaknya TIDAK dibuat ulang saat diketik', el0 === el1,
          'elemennya berganti — fokus & sisa ketikan hilang');
      cek(f.nama + ': pitanya hilang', !w.document.getElementById(f.pfx + 'CatErr'));
      cek(f.nama + ': ...dan tanda merah di kotaknya ikut lepas',
          !!el1 && !el1.classList.contains('err'));
      /* PENANDANYA ikut dicabut, bukan cuma pitanya dihapus dari layar.
         Form ini digambar ulang tiap ganti divisi/jam/posisi; penanda yang
         tertinggal membuat pita "belum diisi" muncul lagi di atas kotak yang
         jelas-jelas sudah terisi, dan peringatan yang keliru itulah yang
         melatih orang berhenti membacanya. */
      w.eval(f.gambar + '()');
      cek(f.nama + ': pitanya tidak kembali saat formnya digambar ulang',
          !w.document.getElementById(f.pfx + 'CatErr'));
    }

    console.log('\n== ' + f.nama + ' — terisi, baru berangkat ==');
    tekanAksi(w, 0);
    await tunggu(200);
    cek(f.nama + ': terkirim sesudah diisi', nPost(f.aksi) === sebelum + 1,
        'post=' + nPost(f.aksi) + ', sebelum=' + sebelum);
    const last = kirim.filter(x => x.action === f.aksi).pop() || {};
    const cat = String((last.row && (last.row.catatan || last.row.cat)) || '');
    cek(f.nama + ': keterangannya IKUT di muatan yang dikirim',
        cat === 'Ada acara 300 pax', JSON.stringify(last.row || last));
    w.eval('tutupModal(); MINTA=null; SEL_DW=null; AJT=null;');
  }

  /* ---------------------------------------------------------------------
     HRD: tidak ditahan. Dijaga tersendiri karena melonggarkannya untuk SEMUA
     orang adalah cara paling mudah membuat seluruh uji di atas tetap hijau
     sementara aturannya sudah tidak berlaku bagi siapa pun.
     --------------------------------------------------------------------- */
  console.log('\n== HRD tidak ikut ditahan ==');
  const T2 = pasangData(w, HRD);
  w.eval('bukaMinta("")');
  const htmlHrd = w.document.getElementById('modalRoot').innerHTML;
  cek('HRD: labelnya TIDAK ditandai wajib', !/<label>Catatan[^<]*\*<\/label>/.test(htmlHrd));
  cek('HRD: ...dan tidak dijanjikan wajib', !/Wajib diisi/.test(htmlHrd));
  const sblm = nPost('simpanPermintaan');
  tekanAksi(w, 0);
  await tunggu(200);
  sama('HRD: permintaan tanpa keterangan tetap terkirim', nPost('simpanPermintaan'), sblm + 1);
  w.eval('tutupModal(); MINTA=null;');

  /* ---------------------------------------------------------------------
     KONTRAK SUMBER: penjaganya harus dipanggil di ketiga pengirimnya. Asersi
     runtime di atas bisa saja hijau untuk kode yang menahannya lewat jalan
     lain (mis. tombol dimatikan) — dan tombol yang dimatikan tidak menahan
     apa pun terhadap devtools.
     --------------------------------------------------------------------- */
  console.log('\n== Kontrak sumber ==');
  for (const [fn, pfx] of [['kirimMinta', 'mt'], ['simpanSelDW', 'sel'], ['kirimAjukanTgl', 'ajt']]) {
    const i = HTML.indexOf('function ' + fn + '(');
    const badan = HTML.slice(i, i + 2600);
    cek(fn + '() memanggil penjaganya',
        badan.indexOf("tahanCatatanKosong(") > -1 && badan.indexOf("'" + pfx + "'") > -1, badan.slice(0, 80));
  }
  /* Satu penentu, bukan tiga. Tiga tempat yang memutuskan "wajib atau tidak"
     akan menyimpang, dan yang menyimpang di sini adalah pintu yang diam-diam
     berhenti menuntut apa pun. */
  sama('catatanWajibDW() cuma didefinisikan sekali',
       (HTML.match(/function catatanWajibDW\(/g) || []).length, 1);
  for (const fn of ['fieldCatatanDW', 'tahanCatatanKosong']) {
    const i = HTML.indexOf('function ' + fn + '(');
    cek(fn + '() membacanya dari penentu yang sama',
        HTML.slice(i, i + 900).indexOf('catatanWajibDW()') > -1);
  }

  dom.window.close();
  console.log('\n' + ok + ' OK, ' + gagal + ' GAGAL');
  process.exit(gagal ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
