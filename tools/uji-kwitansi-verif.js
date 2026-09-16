/* Uji "Request Kwitansi ditahan selama dana masuknya belum diverifikasi" —
   modul Reservasi, 16 September 2026, permintaan user.

   KENAPA UJI SENDIRI. `smoke-modul.js` melaporkan modul ini "hanya boot yang
   diuji", jadi jalur kwitansi tidak pernah dijalankan sekali pun di sana. Yang
   dijaga di berkas ini menyentuh UANG: kwitansi adalah pengakuan perusahaan
   bahwa dana sudah diterima, dan kertasnya dipegang tamu.

   YANG PALING MUDAH LEPAS, dan karena itu yang dijaga paling keras:

     - DIPERINGATKAN TAPI TETAP DIKIRIM. Dari layar, "ditahan" dan "muncul
       pita merah lalu tetap berangkat" terlihat sama persis. Satu-satunya
       asersi yang bisa membedakannya adalah MENGHITUNG POST `invMinta` yang
       benar-benar berangkat — dan itulah yang dilakukan di sini. Aturan ini
       sebelumnya memang cuma satu kalimat di kotak confirm() yang tinggal
       ditekan OK.
     - GERBANG CUMA DI TOMBOL. `mintaKwitansi()` global dan bisa dipanggil dari
       console dalam sepuluh detik, jadi tidak menggambar tombolnya bukan
       penjagaan. Diuji dengan memanggil fungsinya LANGSUNG.
     - JALAN PINTAS LEWAT "Request ulang". Baris yang sudah DITOLAK Finance
       punya tombolnya sendiri, dan justru itu tombol yang paling sering
       ditekan berulang kali — kalau ia lolos, seluruh aturannya jadi hiasan.
     - MENGUNDUH yang sudah terbit ikut terkunci. Lembarnya sudah jadi;
       menahan unduhannya tidak menarik kembali apa pun, cuma membuat kru yang
       berhadapan dengan tamunya tidak bisa berbuat apa-apa. */
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

/* Denah venue disisipkan inline — modul ini SENGAJA berhenti keras kalau
   berkasnya tidak termuat, dan jsdom tidak mengambil skrip eksternal. */
const ASSET = fs.readFileSync(path.join(ROOT, 'deploy', 'assets', 'venue-layouts.js'), 'utf8');
const HTML = fs.readFileSync(path.join(ROOT, 'deploy', 'reservasi', 'index.html'), 'utf8');
const HTML_UJI = HTML.replace(
  '<script src="../assets/venue-layouts.js"><' + '/script>',
  () => '<script>' + ASSET + '<' + '/script>');
if (HTML_UJI === HTML) { console.error('tag venue-layouts.js tidak ketemu di sumber'); process.exit(2); }

let lulus = 0, gagal = 0;
const cek = (n, s, k) => {
  if (s) { lulus++; console.log('  OK   ' + n); }
  else { gagal++; console.log('  GAGAL ' + n + (k ? '  -> ' + k : '')); }
};
const sama = (n, d, h) => cek(n, d === h, 'dapat ' + JSON.stringify(d) + ', harusnya ' + JSON.stringify(h));
const tunggu = ms => new Promise(r => setTimeout(r, ms));

function bukaModul() {
  const jejak = { minta: [], toast: [] };
  const d = new JSDOM(HTML_UJI, {
    url: 'https://team.laksamanamuda.id/reservasi/',
    runScripts: 'dangerously', pretendToBeVisual: true,
    virtualConsole: new VirtualConsole(),
    beforeParse(w) {
      w.alert = () => {}; w.confirm = () => true; w.print = () => {}; w.scrollTo = () => {};
      w.HTMLElement.prototype.scrollIntoView = function () {};
      try {
        w.localStorage.setItem('lm_session', JSON.stringify({
          expiry: Date.now() + 3600000, userId: 'u-uji', name: 'Penguji',
          modules: ['reservasi'], adminModules: ['reservasi'] }));
      } catch (e) {}
      w.fetch = async (url, init) => {
        const u = String(url);
        let body = {}; try { body = init && init.body ? JSON.parse(init.body) : {}; } catch (e) {}
        const balas = o => ({ ok: true, status: 200, text: async () => JSON.stringify(o), json: async () => o });
        /* SETIAP permintaan kwitansi dicatat. Inilah satu-satunya pengukur
           yang bisa membedakan "ditahan" dari "tetap dikirim". */
        if (u.indexOf('finance-api') > -1) {
          if (body.action === 'invMinta') {
            jejak.minta.push(body);
            return balas({ ok: true, data: { id: 'inv1', resId: body.resId, status: 'MENUNGGU' } });
          }
          return balas({ ok: true, data: {} });
        }
        if (u.indexOf('account-api') > -1) return balas({ ok: true, members: [
          { id: 'u-uji', name: 'Penguji', keterangan: 'Office', isModuleAdmin: true } ] });
        return balas({ ok: true, data: {} });
      };
    }
  });
  return { w: d.window, jejak };
}
async function siap(w) {
  for (let i = 0; i < 220; i++) {
    try { if (w.eval('typeof STATE !== "undefined" && STATE && typeof kwiTertahan === "function"')) return; }
    catch (e) {}
    await tunggu(50);
  }
  throw new Error('modul Reservasi tidak pernah siap');
}

/* Reservasi uji: DP dicicil DUA kali. Satu transfer saja tidak bisa
   membedakan "semua terverifikasi" dari "ada yang belum" — dan bentuk
   dicicil itulah yang justru ada di produksi. */
function pasang(w, dps) {
  const r = { id: 'R1', name: 'Tamu Uji', phone: '08123', date: '2026-09-20', time: '19:00',
              pax: 4, table: 'A1', dpStatus: 'Sudah', dpAmount: 800000, dps: dps };
  w.eval('STATE.reservations = [' + JSON.stringify(r) + '];');
  return r;
}
const DP2 = (a, b) => ([
  { id: 'd1', amount: 500000, tfStatus: a },
  { id: 'd2', amount: 300000, tfStatus: b }
]);
function slot(w) { return w.eval('slotKwitansiHTML(STATE.reservations[0], "btn-sm")'); }
/* ADA TOMBOLNYA, bukan ada KATANYA. Pita penahan menyebut "Request Kwitansi"
   di dalam title-nya — justru supaya yang membacanya tahu tombol apa yang
   akan muncul sesudah diverifikasi — jadi mencari frasa itu di seluruh HTML
   cocok dengan penjelasannya sendiri dan tidak membuktikan apa pun. Bentuk
   asersi hampa yang sudah berulang kali menggigit di repo ini. */
function adaTombolMinta(html) { return /<button[^>]*onclick="[^"]*mintaKwitansi\(/.test(html); }
function peran(w, p) { w.eval('SESSION={id:"u-uji",name:"Penguji",role:"' + p + '"};'); }
function cacheInv(w, v) { w.eval('INV_CACHE={R1:' + JSON.stringify(v) + '};'); }

(async () => {
  const { w, jejak } = bukaModul();
  await siap(w);
  w.eval('window.__toast=[]; toast=function(m,t){ window.__toast.push(String(m)); };');
  const toastAkhir = () => { const a = JSON.parse(w.eval('JSON.stringify(window.__toast||[])')); return a.length ? a[a.length - 1] : ''; };

  /* ================================================================
     1. Penentunya sendiri
     ================================================================ */
  console.log('\n== kwiTertahan(): apa yang dihitung sebagai belum terverifikasi ==');
  pasang(w, DP2('verified', 'verified'));
  sama('dua-duanya terverifikasi -> tidak ditahan', w.eval('kwiTertahan(STATE.reservations[0])'), null);

  pasang(w, DP2('verified', ''));
  sama('satu belum dicek -> ditahan', w.eval('(kwiTertahan(STATE.reservations[0])||{}).n'), 1);
  sama('...dan nominalnya yang belum, bukan totalnya',
       w.eval('(kwiTertahan(STATE.reservations[0])||{}).nominal'), 300000);

  /* DITOLAK bukan "belum diperiksa" — ia sudah diperiksa dan dinyatakan tidak
     ada. Kalau ia lolos, kwitansi terbit untuk uang yang Finance sendiri sudah
     menyatakan tidak masuk. */
  pasang(w, DP2('verified', 'rejected'));
  sama('yang DITOLAK ikut menahan', w.eval('(kwiTertahan(STATE.reservations[0])||{}).n'), 1);
  sama('...dan dihitung sebagai ditolak', w.eval('(kwiTertahan(STATE.reservations[0])||{}).ditolak'), 1);

  pasang(w, DP2('', ''));
  sama('dua-duanya belum -> keduanya dihitung', w.eval('(kwiTertahan(STATE.reservations[0])||{}).n'), 2);

  /* ================================================================
     2. Tombolnya: sebabnya disebut SEBELUM ditekan
     ================================================================ */
  console.log('\n== Tombol Request untuk kru yang meminta (cashier) ==');
  peran(w, 'cashier'); cacheInv(w, null);

  pasang(w, DP2('verified', ''));
  let h = slot(w);
  cek('belum terverifikasi: tombol Request TIDAK digambar', !adaTombolMinta(h), h.slice(0, 200));
  cek('...dan sebabnya disebut di tempatnya',
      /belum diverifikasi/i.test(h), h.slice(0, 200));
  cek('...berikut berapa transfer & nominalnya',
      /1 transfer belum terverifikasi/.test(h) && /300/.test(h), h.slice(0, 260));

  pasang(w, DP2('verified', 'verified'));
  h = slot(w);
  cek('semua terverifikasi: tombol Request muncul', adaTombolMinta(h), h.slice(0, 200));
  cek('...dan pita penahannya hilang', !/belum diverifikasi/i.test(h), h.slice(0, 200));

  /* ================================================================
     3. GERBANGNYA DI FUNGSINYA — diuji dengan memanggilnya langsung
     ================================================================ */
  console.log('\n== mintaKwitansi(): yang benar-benar berangkat ==');
  peran(w, 'cashier'); cacheInv(w, null);
  pasang(w, DP2('verified', ''));
  jejak.minta.length = 0;
  await w.eval('mintaKwitansi("R1")');
  await tunggu(60);
  sama('belum terverifikasi: TIDAK ada POST invMinta', jejak.minta.length, 0);
  cek('...dan sebabnya dikatakan', /belum terverifikasi|belum bisa diminta/i.test(toastAkhir()), toastAkhir());

  pasang(w, DP2('verified', 'verified'));
  jejak.minta.length = 0;
  await w.eval('mintaKwitansi("R1")');
  await tunggu(60);
  sama('semua terverifikasi: POST invMinta berangkat', jejak.minta.length, 1);
  if (jejak.minta.length) sama('...untuk reservasi yang benar', jejak.minta[0].resId, 'R1');

  /* ================================================================
     4. Jalan pintas "Request ulang" ikut ditutup
     ================================================================ */
  console.log('\n== Baris yang sudah DITOLAK Finance ==');
  peran(w, 'cashier');
  cacheInv(w, { id: 'inv1', resId: 'R1', status: 'DITOLAK', catatan: 'bukti tidak jelas' });

  pasang(w, DP2('verified', ''));
  h = slot(w);
  cek('belum terverifikasi: tombol Request ulang TIDAK digambar', !adaTombolMinta(h), h.slice(0, 260));
  cek('...dan keadaan ditolaknya tetap terbaca', h.indexOf('ditolak') > -1, h.slice(0, 260));

  pasang(w, DP2('verified', 'verified'));
  h = slot(w);
  cek('semua terverifikasi: Request ulang muncul lagi', adaTombolMinta(h) && h.indexOf('Request ulang') > -1, h.slice(0, 260));

  /* Gerbang fungsinya juga berlaku di jalur ini. */
  pasang(w, DP2('verified', ''));
  jejak.minta.length = 0;
  await w.eval('mintaKwitansi("R1")');
  await tunggu(60);
  sama('Request ulang lewat console pun tidak berangkat', jejak.minta.length, 0);

  /* ================================================================
     5. Yang SENGAJA tidak ikut ditahan
     ================================================================ */
  console.log('\n== Yang sudah terbit tetap bisa diunduh ==');
  peran(w, 'cashier');
  cacheInv(w, { id: 'inv1', resId: 'R1', status: 'DIBUAT', no: 'INV/2026/001' });
  pasang(w, DP2('verified', ''));
  h = slot(w);
  cek('kwitansi yang SUDAH terbit tetap bisa diunduh', h.indexOf('Kwitansi PDF') > -1, h.slice(0, 200));

  console.log('\n== Manajer/admin: diperingatkan, bukan dikunci ==');
  peran(w, 'admin'); cacheInv(w, null);
  pasang(w, DP2('verified', ''));
  h = slot(w);
  cek('manajer tetap punya tombol Kwitansi PDF', h.indexOf('Kwitansi PDF') > -1, h.slice(0, 200));
  cek('...tapi peringatannya disebut berikut angkanya',
      /1 transfer belum terverifikasi/.test(h), h.slice(0, 300));

  pasang(w, DP2('verified', 'verified'));
  h = slot(w);
  cek('semua terverifikasi: peringatannya hilang',
      !/belum terverifikasi/.test(h) && h.indexOf('Kwitansi PDF') > -1, h.slice(0, 200));

  /* ================================================================
     6. Invarian sumber
     ================================================================ */
  console.log('\n== Invarian: satu penentu, bukan tersebar ==');
  const KODE = HTML.replace(/\/\*[\s\S]*?\*\//g, ' ');
  sama('kwiTertahan() cuma didefinisikan sekali',
       (KODE.match(/function kwiTertahan\(/g) || []).length, 1);
  cek('mintaKwitansi() memanggil penentu yang sama',
      /function mintaKwitansi[\s\S]{0,700}kwiTertahan\(/.test(KODE));
  cek('slotKwitansiHTML() memanggil penentu yang sama',
      /function slotKwitansiHTML[\s\S]{0,2200}kwiTertahan\(/.test(KODE));
  /* Kalimatnya satu sumber: pita di layar dan pesan toast tidak boleh menyebut
     sebab yang berbeda untuk keadaan yang sama. */
  sama('kalimat penahannya satu tempat',
       (KODE.match(/function kwiTertahanTeks\(/g) || []).length, 1);

  console.log('\n' + lulus + ' OK, ' + gagal + ' GAGAL');
  w.close();
  process.exit(gagal ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
