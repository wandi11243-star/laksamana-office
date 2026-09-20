/* uji-simpan-cepat.js — berapa kali modul Reservasi menembak server per Simpan
 *
 *   node tools/uji-simpan-cepat.js
 *   JSDOM_PATH=/jalur/ke/jsdom node tools/uji-simpan-cepat.js
 *
 * Keluhan user 20 September 2026: "input dan simpan reservasi kok lama
 * banget". DIUKUR, bukan ditebak — dan dua sebabnya berdiri terpisah:
 *
 *   1. SATU kali Simpan menembak server TIGA kali: getAll milik
 *      mejaMasihKosong(), getAll milik flushSave() beberapa milidetik
 *      sesudahnya, lalu saveAll. Seluruh request diserialkan (apiQueue), dan
 *      satu getAll di dev ~1,2 detik — jadi tarikan kedua itu murni waktu
 *      tunggu untuk isi yang praktis pasti sama.
 *
 *   2. Blob yang ditarik & dikirim 306 KB, dan 218 KB di antaranya
 *      `master.reviews[].proof2Data` — foto base64 yang TERLEWAT dari
 *      mekanisme pemisahan berkas di backend. Empat baris, 71% dari
 *      seluruh blob, terseret bolak-balik tiap kali siapa pun menyimpan
 *      apa pun.
 *
 * YANG DIUKUR DI SINI JUMLAH PANGGILAN, bukan milidetik: waktu berbeda di
 * tiap mesin, dan uji yang mematok milidetik akan merah di laptop yang
 * sibuk. Jumlah panggilan itulah yang menentukan berapa lama kru menunggu.
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

let ok = 0, gagal = 0, lewat = 0;
const cek = (n, s, k) => { if (s) { ok++; console.log('  OK   ' + n); } else { gagal++; console.log('  GAGAL ' + n + (k ? '  — ' + k : '')); } };
const sama = (n, d, h) => cek(n, d === h, 'dapat ' + JSON.stringify(d) + ', harusnya ' + JSON.stringify(h));
const aman = async (n, fn) => { try { await fn(); } catch (e) { gagal++; console.log('  GAGAL ' + n + '  — melempar: ' + e.message); } };
const tunggu = ms => new Promise(r => setTimeout(r, ms));

const ASSET = fs.readFileSync(path.join(ROOT, 'deploy/assets/venue-layouts.js'), 'utf8');
const SUMBER = fs.readFileSync(path.join(ROOT, 'deploy/reservasi/index.html'), 'utf8');
const HTML = SUMBER.replace('<script src="../assets/venue-layouts.js"><' + '/script>',
                            () => '<script>' + ASSET + '<' + '/script>');
if (HTML === SUMBER) { console.error('tag venue-layouts.js tidak ketemu di sumber'); process.exit(2); }

/* opsi: { conflictSekali } */
function buka(opsi) {
  opsi = opsi || {};
  const jejak = [];
  /* SERVER TIRUAN YANG HIDUP: apa yang ditulis saveAll dipulangkan getAll
     berikutnya. Tanpa itu, reservasi yang barusan tersimpan terbaca sebagai
     baris yang DIHAPUS kru lain pada putaran berikutnya — mergeIntoState
     membuangnya dari STATE, dan asersi "simpan kedua" merah untuk kode yang
     benar. Pola yang sama dengan uji-revisi-reservasi.js. */
  let ver = 1, sudahConflict = false;
  let simpanan = { reservations: opsi.res || [], master: {}, audit: [] };
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
        const u = String(url);
        const body = init && init.body ? JSON.parse(init.body) : {};
        const aksi = body.action || (u.match(/action=([a-zA-Z]+)/) || [])[1] || '?';
        jejak.push(aksi);
        const balas = o => ({ ok: true, status: 200, text: async () => JSON.stringify(o), json: async () => o });
        if (u.indexOf('account-api') > -1) return balas({ ok: true, members: [
          { id: 'u-uji', name: 'Penguji', keterangan: 'Office', isModuleAdmin: true } ] });
        if (aksi === 'getAll') return balas({ ok: true, data: Object.assign(
          JSON.parse(JSON.stringify(simpanan)), { _ver: ver }) });
        if (aksi === 'saveAll') {
          /* Penjaga versi di server: yang basenya tertinggal DITOLAK. Ditiru
             supaya jalur putaran-ulang benar-benar dijalankan, bukan dilewati. */
          if (opsi.conflictSekali && !sudahConflict) { sudahConflict = true; ver++; return balas({ ok: true, data: { conflict: true } }); }
          const isi = body.data || {};
          simpanan = { reservations: isi.reservations || [], master: isi.master || {}, audit: isi.audit || [] };
          ver++; return balas({ ok: true, data: { _ver: ver } });
        }
        return balas({ ok: true, data: {} });
      };
    }
  });
  return { w: d.window, jejak };
}
async function siap(w) {
  for (let i = 0; i < 220; i++) {
    try { if (w.eval('typeof STATE !== "undefined" && STATE && Array.isArray(STATE.reservations)')) return; } catch (e) {}
    await tunggu(50);
  }
  throw new Error('modul Reservasi tidak pernah siap');
}
async function masuk(w) {
  await siap(w);
  w.eval('SESSION={id:"u-uji",name:"Penguji",role:"admin"}; SELECTED_CREW="u-uji";');
  await tunggu(40);
}
/* Form diisi lewat elemen sungguhan: yang diuji jalur simpan yang benar-benar
   dipakai kru, bukan objek yang disusun di uji. */
function isiForm(w, nama, meja) {
  const f = w.document.getElementById('resForm');
  if (!f) return false;
  const set = (n, v) => { if (f.elements[n]) f.elements[n].value = v; };
  const besok = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  set('name', nama); set('phone', '081234567890'); set('date', besok);
  set('time', '19:00'); set('pax', '4'); set('table', meja || '21');
  const r = w.document.querySelector('input[name=dpStatus][value="Belum"]');
  if (r) r.checked = true;
  return true;
}

(async () => {

/* ============ 1. SATU Simpan = SATU getAll + SATU saveAll ============ */
console.log('\n== Jumlah panggilan per Simpan ==');
await aman('blok jumlah panggilan', async () => {
  const { w, jejak } = buka();
  await masuk(w);
  w.eval('newReservation()');
  await tunggu(200);
  cek('form input tergambar', isiForm(w, 'Tamu Satu'));

  jejak.length = 0;
  await w.eval('saveReservation()');
  await tunggu(900);

  sama('tersimpan', w.eval('STATE.reservations.length'), 1);
  /* DUA, bukan tiga. Yang dibuang tarikan getAll kedua — mejaMasihKosong()
     baru saja menariknya, dan flushSave() dulu menariknya lagi beberapa
     milidetik kemudian. */
  sama('tepat 1× getAll', jejak.filter(x => x === 'getAll').length, 1);
  sama('tepat 1× saveAll', jejak.filter(x => x === 'saveAll').length, 1);
  cek('urutannya getAll dulu, baru saveAll',
      jejak.indexOf('getAll') > -1 && jejak.indexOf('getAll') < jejak.indexOf('saveAll'),
      jejak.join(' > '));

  /* SEKALI PAKAI. Titipan yang menetap akan dipakai penyimpanan berikutnya
     berjam-jam kemudian — dan itu mengundang penolakan versi setiap kali. */
  jejak.length = 0;
  w.eval('newReservation()');
  await tunggu(200);
  isiForm(w, 'Tamu Dua', '22');
  await w.eval('saveReservation()');
  await tunggu(900);
  sama('simpan kedua tersimpan juga', w.eval('STATE.reservations.length'), 2);
  sama('simpan kedua menarik getAll-nya sendiri', jejak.filter(x => x === 'getAll').length, 1);
});

/* ============ 2. PUTARAN ULANG menarik yang SEGAR ============ */
console.log('\n== Ditolak versi -> putaran ulang ==');
await aman('blok conflict', async () => {
  const { w, jejak } = buka({ conflictSekali: true });
  await masuk(w);
  w.eval('newReservation()');
  await tunggu(200);
  isiForm(w, 'Tamu Tolak');
  jejak.length = 0;
  await w.eval('saveReservation()');
  await tunggu(1200);

  sama('akhirnya tersimpan', w.eval('STATE.reservations.length'), 1);
  /* Putaran PERTAMA boleh memakai titipan; yang KEDUA tidak — di situ justru
     yang dibutuhkan data yang benar-benar segar, karena kru lain baru saja
     menyimpan. Titipan yang dipakai lagi di sini membuat penolakannya
     berulang sampai batas percobaan habis. */
  sama('saveAll dicoba dua kali', jejak.filter(x => x === 'saveAll').length, 2);
  sama('putaran kedua menarik getAll SEGAR', jejak.filter(x => x === 'getAll').length, 1 + 1);
});

/* ============ 3. TITIPAN: sekali pakai & berjendela ============ */
console.log('\n== Aturan titipan getAll ==');
await aman('blok titipan', async () => {
  const { w } = buka();
  await masuk(w);
  w.eval('simpanGetAllSegar({reservations:[],_ver:7})');
  cek('titipan terbaca sekali', w.eval('!!ambilGetAllSegar()'));
  cek('dan HANYA sekali', !w.eval('!!ambilGetAllSegar()'));

  /* KEDALUWARSA. Jendelanya dibaca dari sumbernya, bukan diketik ulang di
     uji: uji yang memegang salinan ambangnya sendiri tetap hijau kalau
     angkanya diubah di sana. */
  const jendela = w.eval('GETALL_SEGAR_MS');
  cek('jendelanya ada dan masuk akal', jendela > 0 && jendela <= 60000, String(jendela));
  w.eval('simpanGetAllSegar({reservations:[],_ver:8}); _getAllSegar.at = Date.now() - (GETALL_SEGAR_MS + 1000);');
  cek('yang kedaluwarsa TIDAK dipakai', !w.eval('!!ambilGetAllSegar()'));

  cek('titipan kosong tidak melempar', w.eval('simpanGetAllSegar(null), ambilGetAllSegar()') === null);
});

/* ============ 4. POLLING dibatalkan sebelum cek meja ============ */
console.log('\n== Polling tidak lagi menghalangi ==');
{
  const tanpaKomentar = SUMBER.replace(/\/\*[\s\S]*?\*\//g, '').replace(/<!--[\s\S]*?-->/g, '');
  const i = tanpaKomentar.indexOf('async function mejaMasihKosong(');
  const badan = i > -1 ? tanpaKomentar.slice(i, i + 900) : '';
  /* Fungsi inilah yang berjalan LEBIH DULU saat kru menekan Simpan. Polling
     yang kebetulan sedang menarik seluruh database membuatnya menunggu di
     belakang — dan kru menonton overlay untuk sesuatu yang bukan
     pekerjaannya. saveNow() membatalkannya, tapi ia baru jalan belakangan. */
  cek('mejaMasihKosong membatalkan polling', /batalkanPolling\(\)/.test(badan));
  cek('dibatalkan SEBELUM getAll-nya',
      badan.indexOf('batalkanPolling()') > -1 &&
      badan.indexOf('batalkanPolling()') < badan.indexOf('apiGet("getAll")'));
}

/* ============ 4b. MEJA BENTROK: tidak ada titipan yang tertinggal ======== */
console.log('\n== Cek meja yang BENTROK ==');
await aman('blok bentrok', async () => {
  const besok = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  /* Meja 21 sudah dipegang kru lain pada jam yang sama. */
  const { w } = buka({ res: [{
    id: 'r-lain', name: 'Tamu Lain', phone: '0811', date: besok, time: '19:00',
    pax: 4, table: '21', status: 'Confirmed', dps: [], notes: '',
    createdAt: Date.now() - 60000, updatedAt: Date.now() - 60000 }] });
  await masuk(w);
  const hasil = await w.eval(
    'mejaMasihKosong(' + JSON.stringify(besok) + ',"21","19:00",null,false,null)');
  cek('bentroknya memang terdeteksi', hasil && hasil.ok === false, JSON.stringify(hasil));
  /* TITIPAN CUMA UNTUK CABANG YANG ALURNYA LANJUT KE SIMPAN. Di cabang
     bentrok, simpan tidak pernah terjadi — dan titipan yang tertinggal akan
     dipungut penyimpanan lain yang lewat belakangan, dengan data yang sudah
     tidak ada hubungannya dengan apa pun yang sedang ia kerjakan.
     Diuji lewat KEADAANNYA, bukan urutan baris di sumber: asersi urutan
     tetap hijau begitu salah satu penanda yang dibandingkannya hilang. */
  cek('tidak ada titipan yang tertinggal', w.eval('_getAllSegar') === null,
      JSON.stringify(w.eval('_getAllSegar && _getAllSegar.at')));
});

/* ============ 5. BACKEND: proof2Data ikut dipisah ============ */
console.log('\n== Backend: foto kedua ikut dipisah dari blob ==');
{
  const P = path.join(ROOT, 'reservasi-mysql/lib_reservasi_mysql.php');
  if (!fs.existsSync(P)) {
    lewat++; console.log('  LEWAT  reservasi-mysql/lib_reservasi_mysql.php tidak ada di repo ini');
  } else {
    /* KOMENTAR DIBUANG DULU. Penjelasan di atas barisnya menyebut kedua kunci
       apa adanya — asersi yang menghitungnya akan mencocokkan komentarnya
       sendiri dan melaporkan dua kunci untuk satu yang benar-benar dipakai.
       Bentuk yang sudah menggigit berkali-kali di repo ini. */
    const php = fs.readFileSync(P, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
    const i = php.indexOf('function each_file_field(');
    const j = php.indexOf('function externalize(');
    const badan = (i > -1 && j > i) ? php.slice(i, j) : '';
    cek('each_file_field terbaca', !!badan);
    /* INILAH 71% BLOBNYA (diukur di dev 20 Sep 2026: 218 KB dari 306 KB,
       dari EMPAT baris saja). Terlewat sejak mekanismenya lahir. */
    cek('proof2Data ikut dipisah', badan.indexOf("'proof2Data'") > -1);
    /* KUNCINYA HARUS BEDA. Kunci yang sama membuat foto kedua MENIMPA foto
       pertama di disk — dan yang hilang bukti yang dipakai memverifikasi
       poin review, tanpa satu pun galat. */
    cek('kuncinya rv2:, bukan rv:', badan.indexOf("'rv2:'") > -1);
    const kRv  = (badan.match(/'rv:'/g)  || []).length;
    const kRv2 = (badan.match(/'rv2:'/g) || []).length;
    cek('tiap foto punya kuncinya sendiri', kRv === 1 && kRv2 === 1, 'rv:=' + kRv + ' rv2:=' + kRv2);
    /* gc_files() memakai each_file_field yang SAMA, jadi berkas foto kedua
       ikut terlindungi dari sapuan. Kalau suatu hari ia menyusun daftarnya
       sendiri, foto yang baru dipisah akan dihapus sebagai berkas yatim. */
    cek('gc_files memakai penyisir yang sama',
        /function gc_files[\s\S]{0,400}?each_file_field\(/.test(php));

    /* Sisi klien sudah siap: kedua foto dilewatkan loadFile(), yang mengerti
       rujukan maupun data lama yang masih inline. Tanpa ini, memisahkan foto
       kedua justru MERUSAK tampilannya. */
    const se = fs.readFileSync(path.join(ROOT, 'deploy/service_excellent/index.html'), 'utf8');
    const k = se.indexOf('async function viewReviewProof(');
    const badanSe = k > -1 ? se.slice(k, k + 900) : '';
    cek('Service Excellent membaca foto kedua lewat loadFile',
        /proof2Data/.test(badanSe) && /loadFile\(/.test(badanSe));
  }
}

console.log('\n---------------------------------------');
console.log('LULUS ' + ok + '   GAGAL ' + gagal + (lewat ? '   LEWAT ' + lewat : ''));
process.exit(gagal ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
