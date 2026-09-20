/* Uji LIMA permintaan user 20 September 2026:

     1. Meja yang kosong tapi sudah dipesan untuk nanti: warnanya dibedakan,
        dan diklik → konfirmasi dulu.
     2. Input reservasi: meja yang terkunci bisa dipakai lewat konfirmasi.
     3. Reservasi VIP (modul Marketing): sama.
     4. Tambah / pindah meja: sama.
     5. Audit Log: aksinya bisa diklik ke reservasinya (status sekarang).

   BATAS YANG TIDAK BOLEH DIGESER, dan inilah isi sesungguhnya berkas ini:

     Kursi yang SEDANG DIDUDUKI orang tidak pernah bisa ditimpa — berapa kali
     pun kru menjawab "ya". Yang dilonggarkan hanya PENYANGGA H±3 jam
     terhadap tamu yang belum datang; itu aturan, bukan kenyataan fisik.

     Dan izinnya harus SAMPAI KE PENGGABUNG DATA. Kalau hanya layar yang
     melonggar, mergeIntoState() memeriksanya lagi dengan aturan ketat dan
     reservasinya DITOLAK diam-diam saat naik: kru sudah menekan Simpan,
     layarnya bilang tersimpan, lalu barisnya lenyap. Aturan yang sama sudah
     tertulis untuk walk-in sejak 19 September 2026.

     Izinnya juga SEKALI PAKAI — terikat meja+tanggal+jam yang ditanyakan
     waktu itu. Disimpan sebagai boolean, reservasi yang pernah dipaksa sekali
     akan lolos pemeriksaan ketat pada setiap pemindahan meja berikutnya
     tanpa seorang pun ditanya lagi. */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const { JSDOM, VirtualConsole } = (() => {
  for (const p of [process.env.JSDOM_PATH, path.join(ROOT, 'node_modules', 'jsdom'), 'jsdom']) {
    if (!p) continue;
    try { return require(p); } catch (e) {}
  }
  console.error('jsdom tidak ketemu. Pasang `npm i jsdom`, atau setel JSDOM_PATH ke foldernya.');
  process.exit(2);
})();

const ASSET = fs.readFileSync(path.join(ROOT, 'deploy', 'assets', 'venue-layouts.js'), 'utf8');
const SRC = fs.readFileSync(path.join(ROOT, 'deploy', 'reservasi', 'index.html'), 'utf8');
const SRC_MKT = fs.readFileSync(path.join(ROOT, 'deploy', 'marketing', 'index.html'), 'utf8');
const HTML_UJI = SRC.replace(
  '<script src="../assets/venue-layouts.js"><' + '/script>',
  () => '<script>' + ASSET + '<' + '/script>');
if (HTML_UJI === SRC) { console.error('tag venue-layouts.js tidak ketemu di sumber'); process.exit(2); }

let lulus = 0, gagal = 0;
const cek = (nama, syarat, ket) => {
  if (syarat) { lulus++; console.log('  OK   ' + nama); }
  else { gagal++; console.log('  GAGAL ' + nama + (ket ? '  -> ' + ket : '')); }
};
const amanTunggu = async (nama, fn) => { try { await fn(); } catch (e) { cek(nama + ' (tidak melempar)', false, e.message); } };
const tunggu = ms => new Promise(r => setTimeout(r, ms));
const pad = n => String(n).padStart(2, '0');
const ymd = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const HARI_INI = ymd(new Date());
const BESOK = ymd(new Date(Date.now() + 86400000));
/* JAM FIXTURE RELATIF TERHADAP SEKARANG, bukan dipatok.

   Bukan sekadar supaya tidak membusuk: jendela kunci sebuah meja dihitung
   dari JAM BOOKING-nya, dan meja yang tamunya sedang duduk lepas sendiri
   sesudah estimasi lama duduk (3 jam) terlewati. Fixture berjam mati
   membuat kedua meja tidak pernah terkunci pada jam yang SAMA — dan asersi
   "yang sedang duduk tidak bisa ditimpa" lalu lulus/gagal tergantung jam
   berapa ujinya dijalankan. Versi pertama berkas ini memang begitu: jam
   16:11 ia merah, dan sebabnya bukan kodenya. */
function jamPlus(menit) {
  const d = new Date(Date.now() + menit * 60000);
  return { date: ymd(d), time: pad(d.getHours()) + ':' + pad(d.getMinutes()) };
}
/* LIMA titik waktu, dan tiap-tiapnya ada supaya satu tingkat aturan punya
   tempat untuk gagal. Jaraknya dipilih supaya tidak ada dua tingkat yang
   bisa tertukar:

     DUDUK  +60   tamu sedang duduk   -> selalu mati, apa pun jaraknya
     PESAN  +90   beda 120 dari NANTI -> TERKUNCI tapi boleh dipaksa
     MEPET +180   beda  30 dari NANTI -> TERKUNCI, tidak ditawar (H-1 jam)
     SEGERA +30   30 menit dari SEKARANG -> terkunci di denah Hari-H
     NANTI +210   jam yang diisi form / jam reservasi yang dipindah

   Tanpa PESAN dan MEPET yang terpisah, "boleh dipaksa" dan "tidak boleh
   sama sekali" jatuh ke meja yang sama — dan mutasi yang menghapus salah
   satu aturannya tidak mengubah satu asersi pun. */
const SEKARANG = jamPlus(0);
const DUDUK  = jamPlus(60);
const PESAN  = jamPlus(90);
const MEPET  = jamPlus(180);
const SEGERA = jamPlus(30);
const NANTI  = jamPlus(210);

/* Fixture: meja A1 dipesan NANTI (belum datang), meja A2 tamunya SEDANG
   DUDUK. Keduanya sama-sama "terkunci" menurut denah lama — dan seluruh isi
   berkas ini adalah pembedaan itu. Tanpa A2, mutasi yang membuat kursi
   berpenghuni ikut bisa ditimpa tidak mengubah satu asersi pun. */
function fixture() {
  const now = Date.now();
  const dasar = o => Object.assign({
    phone: '081200000000', pax: 4, table: '', sharing: false, category: 'Tamu Umum',
    foodReq: '', drinkReq: '', dpStatus: 'Belum', dpMethod: '', dpAmount: 0, dps: [],
    source: 'WhatsApp', picType: 'Host/Captain', picName: 'Penguji', member: false,
    memberNo: '', notes: '', vip: false, status: 'Confirmed', createdBy: 'Rina Host',
    createdAt: now - 7200000, updatedAt: now - 7200000, arrivals: [], checkinAt: null,
    leftAt: 0, followups: [],
  }, o);
  return [
    // meja 21 — terkunci terhadap NANTI, tapi jaraknya 120 menit: BOLEH dipaksa
    dasar({ id: 'res-nanti', name: 'Dewi Anggraini', date: PESAN.date, time: PESAN.time, table: '21', pax: 4 }),
    // meja 22 — tamunya SEDANG DUDUK: tidak pernah bisa, walau jaraknya 150 menit
    dasar({ id: 'res-duduk', name: 'Bagus Prakoso', date: DUDUK.date, time: DUDUK.time, table: '22',
      status: 'Datang', checkinAt: now,
      arrivals: [{ ts: now, pax: 4, by: 'Rina Host' }], actualPax: 4 }),
    // meja 24 — jaraknya cuma 30 menit dari NANTI: TERKUNCI, tidak ditawar
    dasar({ id: 'res-mepet', name: 'Hana Pertiwi', date: MEPET.date, time: MEPET.time, table: '24', pax: 3 }),
    /* meja 23 — terkunci & boleh dipaksa, sama dengan 21. Ia yang membuat
       "izin untuk meja A tidak melonggarkan meja B" punya tempat untuk
       gagal; tanpa baris ini satu-satunya meja yang boleh dipaksa selalu
       yang sama dengan yang disetujui. */
    dasar({ id: 'res-nanti2', name: 'Indra Wijaya', date: PESAN.date, time: PESAN.time, table: '23', pax: 3 }),
    // meja 32 — 30 menit dari SEKARANG: terkunci di denah Hari-H
    dasar({ id: 'res-segera', name: 'Joko Santoso', date: SEGERA.date, time: SEGERA.time, table: '32', pax: 2 }),
    dasar({ id: 'res-pindah', name: 'Citra Melati', date: NANTI.date, time: NANTI.time, table: '41', pax: 2 }),
    dasar({ id: 'res-besok', name: 'Fajar Nugroho', date: BESOK, time: '19:00', table: '42' }),
  ];
}

function dom(opt) {
  opt = opt || {};
  const srv = { reservations: fixture(), master: {}, audit: opt.audit || [], _ver: 1 };
  const jejak = { simpan: 0, payload: null, tanya: [], jawab: opt.jawab !== false };
  const d = new JSDOM(HTML_UJI, {
    url: 'https://team.laksamanamuda.id/reservasi/',
    runScripts: 'dangerously', pretendToBeVisual: true,
    virtualConsole: new VirtualConsole(),
    beforeParse(w) {
      w.alert = () => {};
      /* confirm() DICATAT, bukan cuma dijawab: yang diuji bukan sekadar
         "boleh/tidak", melainkan apakah pertanyaannya benar-benar diajukan —
         dan apa isinya. Pertanyaan yang tidak menyebut siapa pemesannya
         tidak bisa dijawab orang dengan sadar. */
      w.confirm = m => { jejak.tanya.push(String(m || '')); return jejak.jawab; };
      w.print = () => {}; w.scrollTo = () => {};
      w.HTMLElement.prototype.scrollIntoView = function () {};
      try {
        w.localStorage.setItem('lm_session', JSON.stringify({
          expiry: Date.now() + 3600000, userId: 'u-uji', name: 'Penguji',
          modules: ['reservasi'], adminModules: ['reservasi'],
        }));
      } catch (e) {}
      w.fetch = async (url, init) => {
        const u = String(url);
        const balas = o => ({ ok: true, status: 200, text: async () => JSON.stringify(o), json: async () => o });
        if (u.indexOf('account-api') > -1) {
          return balas({ ok: true, members: [{ id: 'u-uji', name: 'Penguji', keterangan: 'Office', isModuleAdmin: true }] });
        }
        if (init && init.method === 'POST') {
          const body = JSON.parse(init.body || '{}');
          if (body.action === 'saveAll') {
            jejak.simpan++; jejak.payload = body.data;
            srv.reservations = JSON.parse(JSON.stringify(body.data.reservations || []));
            srv.audit = JSON.parse(JSON.stringify(body.data.audit || []));
            srv._ver++;
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
  for (let i = 0; i < 240; i++) {
    try { if (w.eval('typeof STATE!=="undefined" && STATE && STATE.reservations.length>0 && DATA_LOADED')) break; } catch (e) {}
    await tunggu(50);
  }
  w.eval('SESSION={id:"u-uji",name:"Penguji",role:"admin"}; SELECTED_CREW="u-uji"; CURRENT_PAGE="dashboard";');
  w.eval('window.__toast=[]; toast=function(m,t){ window.__toast.push({m:String(m),t:t}); };');
  await tunggu(40);
}
/* Tombol sebuah meja di denah. Dipakai menguji tombolnya benar-benar MATI,
   bukan cuma menolak saat ditekan: penjaganya berlapis, jadi mencabut
   `disabled` saja tidak mengubah hasil akhirnya — dan tombol yang bisa
   ditekan lalu menolak terbaca sebagai halaman rusak. Tiga mutasi memang
   lolos sampai asersi ini ada. */
function seatBtn(w, wadahId, meja) {
  const wadah = w.document.getElementById(wadahId); if (!wadah) return null;
  const btn = [...wadah.querySelectorAll('button.seat')].find(b => {
    const sn = b.querySelector('.sn'); return sn && sn.textContent.trim() === meja;
  });
  return btn || null;
}
const toastTerakhir = w => {
  const a = JSON.parse(w.eval('JSON.stringify(window.__toast||[])'));
  return a.length ? a[a.length - 1].m : '';
};

(async () => {
  /* ================================================================
     1. DENAH HARI-H: warna khas + konfirmasi
     ================================================================ */
  console.log('\n== 1. Denah: meja dipesan-nanti ==');
  {
    const { w, jejak } = dom({});
    await masuk(w);

    cek('warnanya BEDA dari meja kosong, bukan cuma tebal garisnya',
        /\.seat\.avail\.booking-soon\{[^}]*background:#DDEFF2/.test(SRC), 'warna lama cream #F7EFDB tidak terbaca di denah 40 meja');
    /* DUA BAHASA, DAN CUMA DUA — inti permintaan "jadi ga ambigu". Gembok
       terbuka = boleh dipakai (ditanya dulu); gembok terkunci = tidak bisa
       ditekan. Satu gembok untuk keduanya persis yang dikeluhkan. */
/* Legendanya DIIRIS dari blok .seat-legend. Asersi yang menyapu seluruh
   sumber cocok dengan KOMENTAR di CSS-nya sendiri — yang memang menyebut
   frasa yang sama untuk menjelaskan kenapa aturannya ada. Mutasi yang
   mencabut kalimatnya dari layar memang LOLOS darinya. */
    const legenda = (() => {
      const i = SRC.indexOf('class="seat-viewlegend"'); if (i < 0) return '';
      return SRC.slice(i, SRC.indexOf('</div>', SRC.indexOf('≤1 jam lagi', i)));
    })();
    cek('blok legenda ketemu', legenda.length > 0);
    cek('legendanya menyebut yang bisa dipakai dengan gembok TERBUKA',
        legenda.indexOf('🔓 Dipesan nanti') > -1 && legenda.indexOf('bisa dipakai</b>, tapi ditanya dulu') > -1);
    cek('dan yang terkunci dengan gembok TERTUTUP',
        legenda.indexOf('🔒 Dipesan <b>≤1 jam lagi</b>') > -1 && legenda.indexOf('tidak bisa ditekan') > -1);
    cek('warna terkunci BUKAN merah — merah di denah ini berarti "Sudah Datang"',
        /\.seat\.avail\.booking-mepet\{[^}]*background:#E2E0DC/.test(SRC)
        && !/\.seat\.avail\.booking-mepet\{[^}]*#C9432B/.test(SRC));
    cek('dan ia kelihatan tidak bisa ditekan',
        /\.seat\.avail\.booking-mepet\{[^}]*cursor:not-allowed/.test(SRC));

    // Meja A1 dipesan 23:30 dan belum datang → ditanya.
    w.eval('HARIH_DATE=' + JSON.stringify(PESAN.date) + ';');
    await amanTunggu('klik meja yang sudah dipesan', async () => { w.eval('seatEmptyClick("21")'); });
    await tunggu(80);
    cek('mengklik meja yang sudah dipesan MENANYAKAN dulu', jejak.tanya.length === 1, jejak.tanya.length + '× tanya');
    const t1 = jejak.tanya[0] || '';
    cek('pertanyaannya menyebut siapa pemesannya', t1.indexOf('Dewi Anggraini') > -1, t1.slice(0, 160));
    cek('menyebut jam & jumlah paxnya', t1.indexOf(PESAN.time) > -1 && t1.indexOf('4 pax') > -1, t1.slice(0, 200));
    cek('dijawab ya, formulir walk-in tetap terbuka',
        w.document.getElementById('modalRoot').innerHTML.indexOf('Walk-in') > -1);

    /* Meja yang memang bebas tidak ditanya apa-apa. Pertanyaan yang muncul di
       tiap klik berhenti dibaca — dan yang berhenti dibaca sama saja tidak
       ada, termasuk waktu suatu hari ia benar. */
    jejak.tanya.length = 0;
    w.eval('closeModal()');
    await amanTunggu('klik meja bebas', async () => { w.eval('seatEmptyClick("31")'); });
    await tunggu(80);
    cek('meja yang memang bebas TIDAK ditanya apa-apa', jejak.tanya.length === 0, jejak.tanya.length + '× tanya');

    /* H-1 JAM: TERKUNCI, tidak ditawar. Meja 32 dipesan 30 menit lagi —
       tamunya bisa muncul kapan saja, dan rombongan yang baru duduk sepuluh
       menit lalu tidak akan berdiri tepat waktu. */
    jejak.tanya.length = 0;
    w.eval('closeModal()');
    await amanTunggu('klik meja yang jamnya tinggal 30 menit', async () => { w.eval('seatEmptyClick("32")'); });
    await tunggu(80);
    cek('meja yang dipesan <=1 jam lagi TIDAK bisa dipakai',
        w.document.getElementById('modalRoot').innerHTML.indexOf('Walk-in') < 0);
    cek('dan TIDAK ditanya — pertanyaan yang jawabannya tidak boleh ya cuma melatih orang menekan OK',
        jejak.tanya.length === 0, jejak.tanya.length + '× tanya');
    cek('sebabnya dikatakan', /terkunci/i.test(toastTerakhir(w)), toastTerakhir(w));

    /* Dan tombolnya memang MATI di denah — bukan hidup lalu menolak. */
    w.eval('renderDashboard(); dashTab("map");');
    await tunggu(120);
    const b32 = seatBtn(w, 'harihMap', '32');
    const b21 = seatBtn(w, 'harihMap', '21');
    cek('denah Hari-H tergambar', !!b32 && !!b21);
    cek('meja yang dipesan <=1 jam lagi digambar MATI', !!b32 && b32.disabled === true);
    cek('yang jaraknya masih jauh tetap bisa ditekan', !!b21 && b21.disabled === false);
    /* GEMBOKNYA yang membawa arti, bukan warnanya — yang buta warna pun
       bisa membedakan gembok terbuka dari gembok terkunci. Dibaca dari
       tombolnya, bukan dari sumber: satu gembok untuk keduanya persis yang
       dikeluhkan, dan asersi atas sumber tidak bisa melihatnya. */
    cek('yang terkunci bertanda gembok TERTUTUP',
        !!b32 && b32.textContent.indexOf('🔒') > -1, b32 && b32.textContent);
    cek('yang bisa dipakai bertanda gembok TERBUKA',
        !!b21 && b21.textContent.indexOf('🔓') > -1, b21 && b21.textContent);
    cek('dan keduanya TIDAK bertanda sama',
        !!b21 && b21.textContent.indexOf('🔒') < 0, b21 && b21.textContent);
  }
  {
    // Dijawab TIDAK → formulirnya tidak boleh terbuka sama sekali.
    const { w, jejak } = dom({ jawab: false });
    await masuk(w);
    w.eval('HARIH_DATE=' + JSON.stringify(PESAN.date) + ';');
    await amanTunggu('klik lalu batal', async () => { w.eval('seatEmptyClick("21")'); });
    await tunggu(80);
    cek('dijawab TIDAK, formulirnya tidak terbuka', jejak.tanya.length === 1
        && w.document.getElementById('modalRoot').innerHTML.indexOf('Walk-in') < 0);
  }

  /* ================================================================
     2. FORM INPUT RESERVASI
     ================================================================ */
  console.log('\n== 2. Form input reservasi ==');
  {
    const { w, jejak } = dom({});
    await masuk(w);
    w.eval('newReservation()');
    await tunggu(150);
    const f = w.document.getElementById('resForm');
    cek('form tergambar', !!f);
    if (f) {
      f.elements['name'].value = 'Tamu Baru';
      f.elements['phone'].value = '081234567890';
      f.elements['date'].value = NANTI.date;
      f.elements['time'].value = NANTI.time;
      f.elements['pax'].value = '4';
      w.eval('renderSeatMap()');
    }
    await tunggu(80);

    /* Meja A2 tamunya SEDANG DUDUK → mati total. Meja A1 cuma dipesan →
       bisa diklik. Bedanya itu isi permintaan ini. */
    const btn = id => w.document.querySelector('#seatMap button[title*="' + id + ' "], #seatMap button');
    const peta = w.document.getElementById('seatMap') ? w.document.getElementById('seatMap').innerHTML : '';
    cek('denah form tergambar', peta.length > 100);
    cek('meja yang tamunya SEDANG DUDUK tetap mati', /masih duduk/.test(peta));

    jejak.tanya.length = 0;
    await amanTunggu('pilih meja terkunci', async () => { w.eval('pickSeat("21")'); });
    await tunggu(80);
    cek('memilih meja yang sudah dipesan MENANYAKAN dulu', jejak.tanya.length === 1, jejak.tanya.length + '× tanya');
    cek('pertanyaannya menyebut pemesannya', (jejak.tanya[0] || '').indexOf('Dewi Anggraini') > -1);
    cek('dijawab ya, mejanya benar-benar terpilih',
        w.eval('JSON.stringify(SEAT_SELS)').indexOf('21') > -1, w.eval('JSON.stringify(SEAT_SELS)'));
    cek('izinnya dicatat', w.eval('SEAT_IZIN.has("21")') === true);

    /* Mengubah jam berarti pertanyaannya jadi pertanyaan yang LAIN — jawaban
       lama tidak boleh ikut terbawa. */
    if (f) f.elements['time'].value = '20:00';
    w.eval('seatIzinSegar()');
    cek('mengubah jam mencabut izin yang sudah diberikan', w.eval('SEAT_IZIN.size') === 0);

    /* H-1 JAM DI FORM INPUT. Meja 24 dipesan 30 menit dari jam yang diisi —
       terkunci, dan TIDAK ditawar. Kembalikan dulu jamnya, karena asersi di
       atas baru saja menggesernya. */
    if (f) f.elements['time'].value = NANTI.time;
    w.eval('seatIzinSegar()');
    jejak.tanya.length = 0;
    await amanTunggu('pilih meja yang jaraknya 30 menit', async () => { w.eval('pickSeat("24")'); });
    await tunggu(80);
    cek('meja yang jaraknya <=1 jam TIDAK bisa dipilih',
        w.eval('JSON.stringify(SEAT_SELS)').indexOf('24') < 0, w.eval('JSON.stringify(SEAT_SELS)'));
    cek('dan sebabnya dikatakan, bukan tombol yang diam',
        /terkunci/i.test(toastTerakhir(w)), toastTerakhir(w));
    cek('tidak ada pertanyaan yang bisa dijawab ya untuk yang mepet',
        jejak.tanya.length === 0, jejak.tanya.length + '× tanya');
    cek('izinnya pun tidak tercatat', w.eval('SEAT_IZIN.has("24")') === false);

    w.eval('renderSeatMap()');
    await tunggu(80);
    const f24 = seatBtn(w, 'seatMap', '24');
    const f23 = seatBtn(w, 'seatMap', '23');    // terkunci TAPI boleh dipaksa, dan belum terpilih
    cek('denah form tergambar ulang', !!f24 && !!f23);
    cek('meja yang jaraknya <=1 jam digambar MATI di form', !!f24 && f24.disabled === true);
    cek('yang masih boleh dipaksa tetap bisa ditekan', !!f23 && f23.disabled === false);
    cek('di form pun gemboknya dibedakan',
        !!f24 && !!f23 && f24.textContent.indexOf('🔒') > -1
        && f23.textContent.indexOf('🔓') > -1 && f23.textContent.indexOf('🔒') < 0,
        (f24 && f24.textContent) + ' | ' + (f23 && f23.textContent));
  }
  {
    const { w, jejak } = dom({ jawab: false });
    await masuk(w);
    w.eval('newReservation()');
    await tunggu(150);
    const f = w.document.getElementById('resForm');
    if (f) { f.elements['date'].value = NANTI.date; f.elements['time'].value = NANTI.time; }
    await amanTunggu('pilih lalu batal', async () => { w.eval('pickSeat("21")'); });
    await tunggu(60);
    cek('dijawab TIDAK, mejanya tidak ikut terpilih',
        jejak.tanya.length === 1 && w.eval('JSON.stringify(SEAT_SELS)').indexOf('21') < 0);
  }

  /* ================================================================
     2b. RESERVASI YANG DIPAKSA BENAR-BENAR TERSIMPAN

     Asersi yang paling menentukan untuk jalur ini, dan yang paling mudah
     hilang kalau ruang lingkupnya dipersempit nanti: memilih mejanya di
     layar tidak membuktikan apa pun. mergeIntoState() memeriksa bentrok
     LAGI saat datanya naik, dengan data SERVER — jadi kalau izinnya tidak
     ikut ke barisnya, reservasinya ditolak DIAM-DIAM di sana: kru sudah
     menekan Simpan, layarnya bilang tersimpan, lalu barisnya lenyap.
     ================================================================ */
  console.log('\n== 2b. Reservasi yang dipaksa benar-benar tersimpan ==');
  {
    const { w, jejak } = dom({});
    await masuk(w);
    w.eval('newReservation()');
    await tunggu(150);
    const f = w.document.getElementById('resForm');
    if (f) {
      f.elements['name'].value = 'Tamu Paksa';
      f.elements['phone'].value = '081299998888';
      f.elements['date'].value = NANTI.date;
      f.elements['time'].value = NANTI.time;
      f.elements['pax'].value = '2';
    }
    await amanTunggu('pilih meja terkunci', async () => { w.eval('pickSeat("21")'); });
    await tunggu(60);
    const sebelum = w.eval('STATE.reservations.length');
    await amanTunggu('simpan reservasi', async () => { await w.eval('saveReservation()'); });
    await tunggu(350);

    cek('reservasinya BENAR-BENAR masuk, bukan cuma terpilih di layar',
        w.eval('STATE.reservations.length') === sebelum + 1,
        sebelum + ' -> ' + w.eval('STATE.reservations.length'));
    const r = JSON.parse(w.eval('JSON.stringify(STATE.reservations.find(x=>x.name==="Tamu Paksa")||{})'));
    cek('mejanya yang dipaksa itu', String(r.table || '') === '21', r.table);
    cek('izinnya menempel di barisnya', !!r.izinTumpang && r.izinTumpang.meja === '21', JSON.stringify(r.izinTumpang));
    cek('izinnya menyebut siapa yang menyetujui', r.izinTumpang && r.izinTumpang.by === 'Penguji');
    /* Dan ia harus SELAMAT dari penggabung, bukan cuma ada di memori:
       payload yang dikirim ke server memuatnya, dan barisnya masih ada
       sesudah putaran tarik-gabung-tulis selesai. */
    cek('ikut terkirim ke server',
        !!(jejak.payload && (jejak.payload.reservations || []).some(x => x.name === 'Tamu Paksa')));
    cek('dan TIDAK ditolak diam-diam oleh penggabung',
        w.eval('STATE.reservations.some(x=>x.name==="Tamu Paksa")') === true);

  }
  {
    /* Penjaga intinya diuji atas dom BERSIH: blok di atas sudah menaruh
       reservasi baru di meja 21, dan yang ditemukan conflictCheck lalu baris
       itu (jaraknya nol menit) — bukan lawan yang dimaksud asersi ini. */
    const { w } = dom({});
    await masuk(w);
    const cc = (meja, waktu, opsi) =>
      w.eval('!!conflictCheck(' + JSON.stringify(waktu.date) + ',' + JSON.stringify(meja) + ',' +
             JSON.stringify(waktu.time) + ',null,false,null,' + JSON.stringify(opsi) + ')');
    cek('tanpa izin, meja terkunci tetap bentrok', cc('21', NANTI, {}) === true);
    cek('dengan izin, yang jaraknya jauh lolos', cc('21', NANTI, { izin: true }) === false);
    /* INI YANG PALING MENENTUKAN untuk permintaan H-1 jam: izin TIDAK boleh
       melonggarkan yang mepet. Ditaruh di conflictCheck, bukan cuma di
       layar, karena inilah yang dipanggil mergeIntoState() saat datanya
       naik — satu jalur layar yang terlewat tetap tertahan di sini. */
    cek('dengan izin pun, yang jaraknya <=1 jam TETAP bentrok', cc('24', NANTI, { izin: true }) === true);
    cek('dan walk-in pun tidak bisa menembusnya', cc('24', NANTI, { walkin: true }) === true);
    /* Yang sedang duduk: tetap bentrok walau jaraknya 150 menit. */
    cek('yang sedang duduk tetap bentrok walau jaraknya jauh', cc('22', NANTI, { izin: true }) === true);
  }
  {
    /* TANPA izin sama sekali, jalur simpan form harus tetap KETAT. Kalau
       tidak, kelonggarannya berlaku untuk semua orang dan pertanyaannya
       cuma jadi hiasan — mejanya bisa dipakai tanpa satu pun kru pernah
       ditanya. */
    const { w, jejak } = dom({});
    await masuk(w);
    w.eval('newReservation()');
    await tunggu(150);
    const f = w.document.getElementById('resForm');
    if (f) {
      f.elements['name'].value = 'Tanpa Izin';
      f.elements['phone'].value = '081211112222';
      f.elements['date'].value = NANTI.date;
      f.elements['time'].value = NANTI.time;
      f.elements['pax'].value = '2';
      f.elements['table'].value = '21';        // meja terkunci, TIDAK lewat pickSeat
    }
    /* OPSI YANG DIOPER dicatat, bukan cuma hasil akhirnya.

       Hasil akhirnya dijaga DUA lapis — pemeriksaan sebelum menulis, dan
       mergeIntoState() saat datanya naik — jadi melonggarkan lapis pertama
       saja tetap berakhir "tidak tersimpan", dan asersi yang cuma membaca
       jumlah baris tidak bisa membedakannya. Yang membedakan: apa yang
       benar-benar dioper ke pemeriksanya. */
    w.eval('window.__cekArg=[]; (function(){ const _m=mejaMasihKosong; mejaMasihKosong=function(){ window.__cekArg.push(JSON.stringify(arguments[5]||null)); return _m.apply(null,arguments); }; })();');
    const sebelum = w.eval('STATE.reservations.length');
    await amanTunggu('simpan tanpa izin', async () => { await w.eval('saveReservation()'); });
    await tunggu(350);
    cek('meja terkunci tanpa izin TETAP DITOLAK di jalur simpan',
        w.eval('STATE.reservations.length') === sebelum,
        sebelum + ' -> ' + w.eval('STATE.reservations.length'));
    const arg = JSON.parse(w.eval('JSON.stringify(window.__cekArg||[])'));
    cek('pemeriksanya memang dipanggil', arg.length > 0);
    cek('dan TANPA izin — kelonggarannya tidak berlaku untuk semua orang',
        arg.length > 0 && arg[arg.length - 1] === 'null', JSON.stringify(arg));
  }
  {
    /* Izin untuk meja A tidak boleh melonggarkan meja B. Kotak meja itu
       hidden — yang mengubahnya lewat devtools tidak pernah ditanya apa
       pun, dan izin yang dihitung dari SEAT_SELS akan meloloskannya. */
    const { w } = dom({});
    await masuk(w);
    w.eval('newReservation()');
    await tunggu(150);
    const f = w.document.getElementById('resForm');
    if (f) {
      f.elements['name'].value = 'Izin Nyasar';
      f.elements['phone'].value = '081233334444';
      f.elements['date'].value = NANTI.date;
      f.elements['time'].value = NANTI.time;
      f.elements['pax'].value = '2';
    }
    await amanTunggu('setujui meja 21', async () => { w.eval('pickSeat("21")'); });
    await tunggu(60);
    cek('izin untuk meja 21 tercatat', w.eval('SEAT_IZIN.has("21")') === true);
    if (f) f.elements['table'].value = '24';   // ditukar ke meja terkunci LAIN
    w.eval('window.__cekArg=[]; (function(){ const _m=mejaMasihKosong; mejaMasihKosong=function(){ window.__cekArg.push(JSON.stringify(arguments[5]||null)); return _m.apply(null,arguments); }; })();');
    const sebelum = w.eval('STATE.reservations.length');
    await amanTunggu('simpan meja yang tidak disetujui', async () => { await w.eval('saveReservation()'); });
    await tunggu(350);
    cek('izin meja 21 TIDAK melonggarkan meja 24',
        w.eval('STATE.reservations.length') === sebelum,
        sebelum + ' -> ' + w.eval('STATE.reservations.length'));
    const arg2 = JSON.parse(w.eval('JSON.stringify(window.__cekArg||[])'));
    cek('izinnya dihitung dari meja yang DIKIRIM, bukan dari yang pernah disetujui',
        arg2.length > 0 && arg2[arg2.length - 1] === 'null', JSON.stringify(arg2));
  }
  {
    /* Dan sebaliknya: meja yang memang disetujui HARUS dioper dengan izin.
       Tanpa asersi ini, "selalu null" lulus dengan sendirinya. */
    const { w } = dom({});
    await masuk(w);
    w.eval('newReservation()');
    await tunggu(150);
    const f = w.document.getElementById('resForm');
    if (f) {
      f.elements['name'].value = 'Izin Benar';
      f.elements['phone'].value = '081255556666';
      f.elements['date'].value = NANTI.date;
      f.elements['time'].value = NANTI.time;
      f.elements['pax'].value = '2';
    }
    await amanTunggu('setujui meja 21', async () => { w.eval('pickSeat("21")'); });
    await tunggu(60);
    w.eval('window.__cekArg=[]; (function(){ const _m=mejaMasihKosong; mejaMasihKosong=function(){ window.__cekArg.push(JSON.stringify(arguments[5]||null)); return _m.apply(null,arguments); }; })();');
    await amanTunggu('simpan meja yang disetujui', async () => { await w.eval('saveReservation()'); });
    await tunggu(350);
    const arg3 = JSON.parse(w.eval('JSON.stringify(window.__cekArg||[])'));
    cek('meja yang disetujui dioper DENGAN izin',
        arg3.length > 0 && arg3[arg3.length - 1] === '{"izin":true}', JSON.stringify(arg3));
  }

  /* ================================================================
     4. PINDAH / TAMBAH MEJA
     ================================================================ */
  console.log('\n== 4. Pindah / tambah meja ==');
  {
    const { w, jejak } = dom({});
    await masuk(w);
    await amanTunggu('buka modal pindah meja', async () => { w.eval('openMoveModal("res-pindah")'); });
    await tunggu(100);
    cek('modal pindah meja terbuka',
        w.document.getElementById('modalRoot').innerHTML.indexOf('Pindah Meja') > -1);

    jejak.tanya.length = 0;
    await amanTunggu('pilih meja terkunci di modal pindah', async () => { w.eval('toggleMoveSeat("21")'); });
    await tunggu(80);
    cek('memilih meja yang sudah dipesan MENANYAKAN dulu', jejak.tanya.length === 1, jejak.tanya.length + '× tanya');
    cek('dijawab ya, mejanya terpilih', w.eval('JSON.stringify(MOVE_SELS)').indexOf('21') > -1);
    cek('izinnya dicatat', w.eval('MOVE_IZIN.has("21")') === true);

    /* Yang sedang diduduki tidak pernah bisa — berapa kali pun dijawab ya. */
    jejak.tanya.length = 0;
    await amanTunggu('coba meja berpenghuni', async () => { w.eval('toggleMoveSeat("22")'); });
    await tunggu(80);
    cek('meja yang tamunya SEDANG DUDUK tidak pernah bisa dipilih',
        w.eval('JSON.stringify(MOVE_SELS)').indexOf('22') < 0, w.eval('JSON.stringify(MOVE_SELS)'));
    cek('dan sebabnya dikatakan, bukan tombol yang diam',
        /sedang diduduki/.test(toastTerakhir(w)), toastTerakhir(w));
    cek('untuk yang sedang duduk TIDAK ada pertanyaan yang bisa dijawab ya',
        jejak.tanya.length === 0, jejak.tanya.length + '× tanya');

    /* H-1 JAM DI MODAL PINDAH. Reservasi yang dipindah berjam NANTI, dan
       meja 24 dipesan 30 menit darinya. */
    jejak.tanya.length = 0;
    await amanTunggu('coba meja yang jaraknya 30 menit', async () => { w.eval('toggleMoveSeat("24")'); });
    await tunggu(80);
    cek('meja yang jaraknya <=1 jam tidak bisa jadi tujuan pindah',
        w.eval('JSON.stringify(MOVE_SELS)').indexOf('24') < 0, w.eval('JSON.stringify(MOVE_SELS)'));
    cek('dan tidak ditanya apa-apa', jejak.tanya.length === 0, jejak.tanya.length + '× tanya');
    const m24 = seatBtn(w, 'moveMap', '24');
    const m21 = seatBtn(w, 'moveMap', '21');
    cek('denah pindah tergambar', !!m24 && !!m21);
    cek('meja yang jaraknya <=1 jam digambar MATI di modal pindah', !!m24 && m24.disabled === true);
    cek('yang masih boleh dipaksa tetap bisa ditekan', !!m21 && m21.disabled === false);

    /* Yang paling menentukan: izinnya sampai ke barisnya, jadi pemeriksaan
       terakhir sebelum menulis memakai aturan longgar. Kalau tidak,
       pertanyaan yang barusan dijawab kru tidak berarti apa-apa. */
    const s0 = jejak.simpan;
    await amanTunggu('simpan pindah meja', async () => { await w.eval('applyMoveTables()'); });
    await tunggu(300);
    cek('pemindahan benar-benar tersimpan', jejak.simpan > s0, s0 + ' -> ' + jejak.simpan);
    const r = JSON.parse(w.eval('JSON.stringify(STATE.reservations.find(x=>x.id==="res-pindah")||{})'));
    cek('mejanya berpindah', String(r.table || '').indexOf('21') > -1, r.table);
    cek('izinnya menempel di barisnya, bukan cuma di layar', !!r.izinTumpang && r.izinTumpang.meja === r.table, JSON.stringify(r.izinTumpang));
    cek('izinnya menyebut siapa yang menyetujui', r.izinTumpang && r.izinTumpang.by === 'Penguji');
    cek('jejaknya menyebut mejanya dipaksa',
        (r.log || []).some(x => /DIPAKSA/.test(String(x.detail || ''))), JSON.stringify(r.log || []));

    /* Izin SEKALI PAKAI: begitu mejanya/jamnya berubah, ia kedaluwarsa
       sendiri. Disimpan sebagai boolean, reservasi ini akan lolos setiap
       pemeriksaan ketat berikutnya tanpa seorang pun ditanya lagi. */
    cek('izin berlaku selama konteksnya sama', w.eval('izinTumpangBerlaku(STATE.reservations.find(x=>x.id==="res-pindah"))') === true);
    w.eval('STATE.reservations.find(x=>x.id==="res-pindah").time="12:00";');
    cek('izin KEDALUWARSA begitu jamnya berubah',
        w.eval('izinTumpangBerlaku(STATE.reservations.find(x=>x.id==="res-pindah"))') === false);
    w.eval('STATE.reservations.find(x=>x.id==="res-pindah").table="Z9";');
    cek('izin KEDALUWARSA begitu mejanya berubah',
        w.eval('izinTumpangBerlaku(STATE.reservations.find(x=>x.id==="res-pindah"))') === false);
  }

  /* ================================================================
     5. AUDIT LOG: aksi bisa diklik
     ================================================================ */
  console.log('\n== 5. Audit Log: aksi bisa diklik ==');
  {
    const { w } = dom({ audit: [
      { id: 'a1', ts: Date.now() - 60000, user: 'Rina Host', role: 'host',
        action: 'Ubah Status', detail: 'Dewi Anggraini → Confirmed', res: 'res-nanti' },
      { id: 'a2', ts: Date.now() - 50000, user: 'Rina Host', role: 'host',
        action: 'Hapus Reservasi', detail: 'Gita Permata (1 Sep)', res: 'res-hilang' },
      { id: 'a3', ts: Date.now() - 40000, user: 'Rina Host', role: 'host',
        action: 'Login', detail: 'Masuk ke sistem' },
    ] });
    await masuk(w);
    await amanTunggu('renderAudit', async () => { w.eval('renderAudit()'); });
    await tunggu(80);
    const v = w.document.getElementById('page-audit').innerHTML;

    cek('jejak yang punya reservasinya bisa diklik', v.indexOf("bukaDariAudit('res-nanti')") > -1);
    /* Barisnya DIIRIS dulu. Asersi yang menyapu seluruh tabel lulus dengan
       sendirinya: baris lain memang punya tautannya, dan jejak yang salah
       dibungkus tautan pun digambar bertanda ✕ (id-nya undefined, jadi
       "tidak ketemu") — jadi mencari ikon ↗ saja membuktikan nol. Yang
       benar: baris itu tidak boleh punya tautan SAMA SEKALI. */
    const barisLogin = (() => {
      const i = v.indexOf('Masuk ke sistem'); if (i < 0) return '';
      const a = v.lastIndexOf('<tr', i); return a < 0 ? '' : v.slice(a, v.indexOf('</tr>', i));
    })();
    cek('baris Login memang tergambar', barisLogin.length > 0);
    cek('jejak TANPA reservasi tidak dibuat seolah bisa diklik',
        barisLogin.indexOf('bukaDariAudit') < 0, barisLogin.slice(0, 220));
    /* Jejak reservasi yang sudah dihapus tetap ditandai berbeda: tautan yang
       menjanjikan halaman lalu tidak membuka apa pun adalah kegagalan yang
       paling sulit dilaporkan orang. */
    cek('jejak reservasi yang sudah dihapus ditandai', v.indexOf('sudah dihapus') > -1);

    await amanTunggu('klik aksi', async () => { w.eval('bukaDariAudit("res-nanti")'); });
    await tunggu(80);
    const m = w.document.getElementById('modalRoot').innerHTML;
    cek('mengkliknya membuka reservasinya', m.indexOf('Dewi Anggraini') > -1);
    cek('dan yang dibuka memuat STATUS SEKARANG', m.indexOf('Confirmed') > -1);
    cek('berikut riwayat aktivitasnya', m.indexOf('Riwayat Aktivitas') > -1);

    w.eval('closeModal()');
    await amanTunggu('klik aksi reservasi yang sudah dihapus', async () => { w.eval('bukaDariAudit("res-hilang")'); });
    await tunggu(60);
    cek('yang barisnya sudah tidak ada DIKATAKAN, bukan diam',
        /sudah dihapus/.test(toastTerakhir(w)), toastTerakhir(w));
    cek('dan tidak membuka modal yang kosong',
        w.document.getElementById('modalRoot').innerHTML.indexOf('Riwayat Aktivitas') < 0);

    // Arah sebaliknya: dari detail reservasi ke Audit Log, tersaring ke tamunya.
    w.eval('openDetail("res-nanti")');
    await tunggu(60);
    cek('detail reservasi punya jalan ke Audit Log',
        w.document.getElementById('modalRoot').innerHTML.indexOf("bukaAuditRes('res-nanti')") > -1);
    await amanTunggu('buka audit dari detail', async () => { w.eval('bukaAuditRes("res-nanti")'); });
    await tunggu(80);
    cek('kata kuncinya diisi NAMA tamunya, bukan id yang tidak pernah muncul di kolom Detail',
        w.eval('JSON.stringify(AUDIT_Q)') === '"Dewi Anggraini"', w.eval('JSON.stringify(AUDIT_Q)'));
  }

  /* ================================================================
     3. RESERVASI VIP (modul Marketing) — kontrak atas sumber
     ================================================================
     Modul Marketing 400 KB dan pemilih mejanya berdiri di balik alur
     formulir VIP berlangkah-langkah; yang dijaga di sini ATURANNYA, dan
     jalur runtime-nya dijaga smoke-modul + uji-denah-marketing. */
  console.log('\n== 3. Reservasi VIP (modul Marketing) ==');
  {
    cek('ada pembeda "sedang duduk" vs "cuma dipesan"',
        /function rsvMejaDuduk\(/.test(SRC_MKT));
    cek('yang dihitung duduk hanya yang statusnya Datang & belum pulang',
        /function rsvMejaDuduk\([\s\S]{0,900}?!=='datang'\) return;[\s\S]{0,200}?if\(r\.leftAt\) return;/.test(SRC_MKT));
    cek('denahnya menanyakan, bukan mematikan tombolnya',
        /const duduk = off && \(opts\.duduk \? \(opts\.duduk\.has\(t\.id\) \|\| \(opts\.mepet && opts\.mepet\.has\(t\.id\)\)\) : true\);/.test(SRC_MKT));
    /* Bawaannya WAJIB ketat: pemilih meja yang tidak menyerahkan daftar meja
       berpenghuni (mis. pemilih meja Event) harus mendapat perilaku lama.
       Longgar secara bawaan berarti pintu yang terlewat diam-diam melepas
       penjaganya, tanpa satu pun galat. */
    cek('bawaannya KETAT untuk pemanggil yang belum menyerahkan daftarnya',
        /\) : true\);/.test(SRC_MKT) && !/\) : false\);/.test(SRC_MKT));
    /* H-1 jam di sisi VIP juga: terkunci, dan dihitung ULANG di dalam
       putaran simpan — jam acaranya bisa digeser sesudah mejanya dipilih. */
    cek('VIP punya ambang kunci sendiri, sebagai kembaran MEPET_MIN',
        /var VIP_MEPET_MIN = 60;/.test(SRC_MKT) && /function vipMejaMepet\(/.test(SRC_MKT));
    cek('VIP menolak yang mepet, bukan menanyakannya',
        /function vipTanyaTumpang\([\s\S]{0,900}?if\(mepet\)\{[\s\S]{0,400}?return false;/.test(SRC_MKT));
    cek('dan penjaga simpannya menghitung ulang yang mepet',
        /const mepetKini=vipMejaMepet\(d,f\.tanggal,vipJamAtau00\(f\.jamMulai\),'vip-'\+f\.id\);/.test(SRC_MKT)
        && /\|\| mepetKini\.has\(m\)\)\);/.test(SRC_MKT));
    cek('tamu yang sedang duduk ditolak, bukan ditanya',
        /function vipTanyaTumpang\([\s\S]{0,400}?if\(duduk\)\{[\s\S]{0,300}?return false;/.test(SRC_MKT));
    cek('pertanyaannya menyebut siapa yang sudah memesannya',
        /vipTanyaTumpang\(m, terpakai\[m\], VIP_DUDUK\.has\(m\), VIP_MEPET\.has\(m\)\)/.test(SRC_MKT));
    /* Penjaga simpan harus menghormati izinnya — kalau tidak, pertanyaan yang
       barusan dijawab kru tidak berarti apa-apa dan simpan tetap ditolak. */
    cek('penjaga simpan melewati meja yang izinnya sudah diberikan',
        /terpakai\[m\] && \(!VIP_IZIN\.has\(m\) \|\| dudukKini\.has\(m\) \|\| mepetKini\.has\(m\)\)/.test(SRC_MKT));
    /* …TAPI izinnya gugur kalau tamunya keburu duduk di sela-sela memilih.
       Persetujuannya diberikan untuk meja yang DIPESAN, bukan untuk meja
       yang sedang dipakai orang. */
    cek('izin gugur kalau tamunya keburu duduk sebelum simpan',
        /const dudukKini=rsvMejaDuduk\(d,f\.tanggal,'vip-'\+f\.id\);/.test(SRC_MKT));
    cek('pertanyaannya diajukan di FUNGSINYA, bukan cuma lewat markup',
        /function vipToggleMeja\([\s\S]{0,900}?vipTanyaTumpang\(/.test(SRC_MKT));
  }

  console.log('\n---------------------------------------');
  console.log('LULUS ' + lulus + '   GAGAL ' + gagal);
  process.exit(gagal ? 1 : 0);
})();
