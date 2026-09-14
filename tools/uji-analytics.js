/* Uji modul Analytics (deploy/analytics/) di jsdom.

   Yang paling penting diuji di sini BUKAN tampilannya, tapi PEMBACAAN
   BERKASNYA. Modul ini membuka .xlsx sendiri — ZIP + XML, tanpa satu pun
   pustaka — dan salah baca satu kolom membuat seluruh analisa memakai angka
   yang salah tanpa satu pun galat. Karena itu ujinya memakai BERKAS ASLI dari
   POS kalau ada di root repo, bukan berkas buatan yang kebetulan cocok dengan
   pembacanya.

   DecompressionStream, Blob, dan Response sudah ada di Node 18+, jadi jalur
   yang dipakai peramban benar-benar dijalankan di sini — bukan ditiru. */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
/* jsdom dicari di node_modules repo dulu, lalu lewat resolusi biasa. Mesin
   yang node_modules repo-nya belum dipasang bisa memakai JSDOM_PATH atau
   NODE_PATH. */
const { JSDOM } = (() => {
  for (const p of [process.env.JSDOM_PATH, path.join(ROOT, 'node_modules', 'jsdom'), 'jsdom']) {
    if (!p) continue;
    try { return require(p); } catch (e) { /* coba berikutnya */ }
  }
  console.error('jsdom tidak ketemu. Pasang `npm i jsdom`, atau setel JSDOM_PATH ke foldernya.');
  process.exit(2);
})();

/* Pembaca .xlsx hidup di ../assets/xlsx-baca.js sejak 7 September 2026 —
   dipakai bersama modul Jadwal Shift supaya tidak ada dua pembaca ZIP. jsdom
   tidak mengambil skrip eksternal, jadi isinya disisipkan sebagai skrip inline
   menggantikan tag src-nya: yang dijalankan tetap berkas aslinya, bukan tiruan
   yang bisa menyimpang dari pembaca yang sungguhan dipakai peramban.
   Pola yang sama dengan uji-bukti-dp.js untuk venue-layouts.js. */
const ASET_XLSX = fs.readFileSync(path.join(ROOT, 'deploy', 'assets', 'xlsx-baca.js'), 'utf8');
const HTML_ASLI = fs.readFileSync(path.join(ROOT, 'deploy', 'analytics', 'index.html'), 'utf8');
let HTML = HTML_ASLI.replace(
  '<script src="../assets/xlsx-baca.js"><' + '/script>',
  () => '<script>' + ASET_XLSX + '<' + '/script>');
if (HTML === HTML_ASLI) { console.error('tag xlsx-baca.js tidak ketemu di sumber analytics'); process.exit(2); }

/* performa-bonus.js dimuat halaman ini sejak 9 September 2026 — hanya untuk
   pbObTotal(), supaya Open Bill tidak jadi salinan KELIMA. Kalau tag-nya tidak
   ikut disisipkan di sini, `window.pbObTotal` tidak pernah ada dan jalur Open
   Bill lewat tanpa disentuh: angkanya cuma lebih kecil, dan uji yang tidak
   memakai Open Bill di datanya akan tetap hijau untuk kode yang salah. */
const ASET_PB = fs.readFileSync(path.join(ROOT, 'deploy', 'assets', 'performa-bonus.js'), 'utf8');
const HTML_PB = HTML.replace(
  '<script src="../assets/performa-bonus.js"><' + '/script>',
  () => '<script>' + ASET_PB + '<' + '/script>');
if (HTML_PB === HTML) { console.error('tag performa-bonus.js tidak ketemu di sumber analytics'); process.exit(2); }
HTML = HTML_PB;

let lulus = 0, gagal = 0;
/* Membaca berkas .xlsx dengan aset yang SAMA, di luar jsdom — dipakai asersi
   "berkas asli" supaya ia tidak bergantung pada boot halaman. */
async function winXlsxBaris(jalur) {
  const w = { console };
  new Function('window', ASET_XLSX)(w);
  const buf = fs.readFileSync(jalur);
  const f = new Blob([buf]);
  f.name = path.basename(jalur);
  return await w.bacaBerkasTabel(f);
}
const cek = (nama, syarat, ket) => {
  if (syarat) { lulus++; console.log('  OK   ' + nama); }
  else { gagal++; console.log('  GAGAL ' + nama + (ket ? '  -> ' + ket : '')); }
};
const tunggu = ms => new Promise(r => setTimeout(r, ms));

/* IRIS SATU KARTU menurut judul <h3>-nya, dari judul itu sampai <h3>
   berikutnya. Halaman ini punya beberapa kartu yang sama-sama menyebut nama
   kartu tetangganya di prosanya — dan itu memang disengaja, supaya yang
   membandingkan dua tabel tahu keduanya berjumlah sama. Asersi yang mengiris
   dengan indexOf atas SELURUH halaman karena itu bisa menguji potongan yang
   bukan yang dimaksudnya, tanpa satu pun tanda. */
const kartuJudul = (html, judul) => {
  const i = html.indexOf('<h3>' + judul + '</h3>');
  if (i < 0) return '';
  const sisa = html.slice(i);
  const j = sisa.indexOf('<h3>', 4);
  return j < 0 ? sisa : sisa.slice(0, j);
};

/* Berkas POS asli, kalau ada. Tidak di-commit (ada di .gitignore) — isinya
   seluruh transaksi sebulan. Ujinya MELEWAT dengan jelas kalau tak ada, bukan
   gagal: yang menjalankan uji di mesin lain tidak punya berkas itu. */
function berkasPos() {
  const f = fs.readdirSync(ROOT).find(x => /^Sales Recapitulation Report.*\.xlsx$/i.test(x));
  return f ? path.join(ROOT, f) : null;
}
/* Sales Recapitulation DETAIL Report — satu baris per menu terjual. Berkas
   inilah yang memuat nama menu; Bill Report tidak memuat satu pun. */
function berkasPosDetail() {
  const f = fs.readdirSync(ROOT).find(x => /^Sales Recapitulation Detail Report.*\.xlsx$/i.test(x));
  return f ? path.join(ROOT, f) : null;
}
/* Membaca satu berkas lewat jalur yang benar-benar dipakai peramban. */
async function uraiBerkas(w, bp) {
  const buf = fs.readFileSync(bp);
  const file = new w.File([new Uint8Array(buf)], path.basename(bp),
    { type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  file.arrayBuffer = async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  file.text = async () => buf.toString('utf8');
  w.eval('UNGGAH_HASIL = null');
  await w.anPilihBerkas({ files: [file] });
  for (let i = 0; i < 400 && !w.eval('UNGGAH_HASIL'); i++) await tunggu(50);
  return w.eval('UNGGAH_HASIL');
}

function domAnalytics(opt) {
  opt = opt || {};
  const panggilan = [];
  const dom = new JSDOM(HTML, {
    url: 'https://dev.laksamanamuda.id/analytics/',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    beforeParse(w) {
      w.alert = m => panggilan.push({ alert: String(m) });
      w.confirm = () => opt.tolak !== true;
      /* Jalur .xlsx peramban dijalankan APA ADANYA — ketiganya ada di Node. */
      w.DecompressionStream = DecompressionStream;
      w.Blob = Blob;
      w.Response = Response;
      w.TextDecoder = TextDecoder;
      try {
        w.localStorage.setItem('lm_session', JSON.stringify({
          expiry: Date.now() + 3600000, userId: 'u-wandi', name: 'Wandi Pranata',
          modules: ['analytics'], adminModules: opt.bukanAdmin ? [] : ['analytics']
        }));
      } catch (e) {}
      const jawab = obj => ({ ok:true, status:200,
        text: async () => JSON.stringify(obj), json: async () => obj });
      w.fetch = async (url, init) => {
        const body = init && init.body ? JSON.parse(init.body) : {};
        const u = String(url);
        panggilan.push({ url: u, body });
        if (body.action === 'analyticsGet') {
          if (opt.anGagal) return jawab({ ok:false, error:'server mati' });
          return jawab({ ok:true, data: opt.an || { data:{ laporan:{}, setting:{} }, akses:{}, peran:{} } });
        }
        if (body.action === 'analyticsSave') return jawab(opt.gagalSimpan
          ? { ok:false, error:'server mati' } : { ok:true, data:{ saved:true } });
        if (body.action === 'analyticsAkses' || body.action === 'analyticsPeran')
          return jawab({ ok:true, data:{ akses:{}, peran:{} } });
        /* hpp.php membalas payload DATAR — {bahan, resep, setting, ts}, tanpa
           `ok` dan tanpa `data`. Bentuk ini DIPERIKSA terhadap sumber PHP-nya
           di bagian 3d, jadi tiruan ini tidak bisa menyimpang diam-diam lagi. */
        if (u.indexOf('hpp.php') > -1) return jawab(opt.hppGagal
          ? { status:'error', message:'token salah' }
          : Object.assign({ bahan:[], resep:[], setting:{}, ts:'2026-09-04' }, opt.hpp || {}));
        if (u.indexOf('account-api') > -1) return jawab({ ok:true, members: opt.roster || [] });
        if (u.indexOf('event-api') > -1) return jawab(opt.eventGagal
          ? { ok:false }
          : { ok:true, data: Object.assign({ events: opt.event || [] }, opt.eventRaw || {}) });
        if (u.indexOf('marketing-api') > -1) return jawab(opt.mktGagal
          ? { ok:false } : { ok:true, data:{ events: opt.mkt || [] } });
        if (u.indexOf('action=getAll') > -1) return jawab(opt.kpGagal
          ? { ok:false } : { ok:true, data: opt.kp || {} });
        return jawab({ ok:true, data:{} });
      };
    }
  });
  return { dom, panggilan };
}
/* Boot asinkron: AN masih null sampai analyticsGet pulang. Menunggu jumlah
   milidetik tertentu itu tebakan — yang di sini menunggu KEADAANNYA. */
async function siap(w) {
  for (let i = 0; i < 120; i++) {
    try { if (w.eval('typeof AN !== "undefined" && AN !== null')) return; } catch (e) {}
    await tunggu(50);
  }
  throw new Error('modul Analytics tidak pernah siap');
}

(async () => {
  /* ================= 1. boot & halaman ================= */
  console.log('\n== Boot & halaman ==');
  {
    const { dom, panggilan } = domAnalytics({});
    await siap(dom.window);
    const w = dom.window, d = w.document;
    cek('tidak dilempar keluar', d.getElementById('suName').textContent === 'Wandi Pranata');
    cek('memanggil analyticsGet', panggilan.some(p => p.body && p.body.action === 'analyticsGet'));
    /* Modul ini di deploy/analytics/, SATU tingkat — bukan dua seperti panel
       Finance. Jalur yang tertinggal satu tingkat tidak melempar; ia
       memulangkan 404 server, dan yang sampai ke layar cuma "bukan JSON". */
    cek('alamat backend satu tingkat, bukan dua',
        panggilan.some(p => /^\.\.\/kompas-api-mysql|\/analytics\/\.\.\/kompas/.test(p.url) || p.url.indexOf('/kompas-api-mysql/') > -1),
        (panggilan.find(p => p.url && p.url.indexOf('kompas') > -1) || {}).url);
    cek('tidak ada alamat dua tingkat yang tertinggal', HTML.indexOf("'../../") < 0, 'ada ../../ di sumber');

    for (const v of ['ringkasan','hari','menu','kategori','kunjungan','tren','marketing','event','unggah','pengaturan','akses']) {
      w.go(v); await tunggu(30);
      const isi = d.getElementById('app-view').innerHTML;
      cek('halaman ' + v + ' tergambar', isi.length > 50, String(isi.length));
    }
    /* Belum ada laporan: yang tergambar keadaan kosong yang MENYEBUTKAN apa
       yang kurang, bukan tabel nol. Tabel nol terbaca sebagai "tidak ada
       penjualan" — jawaban salah untuk pertanyaan yang tidak ditanyakan. */
    w.go('ringkasan'); await tunggu(30);
    cek('kosong menjelaskan dirinya',
        d.getElementById('app-view').innerHTML.indexOf('Belum ada laporan') > -1);
    dom.window.close();
  }

  /* ================= PENGURAI SEL .xlsx =================
     SEL KOSONG DI BERKAS POS DITULIS SELF-CLOSING (<c r="M12" s="9"/>), dan
     pola lama menuntut penutup </c> — jadi begitu ia mulai mencocokkan sel
     seperti itu, pencarian penutupnya BERLANJUT KE SEL BERIKUTNYA dan
     menelannya utuh. Kolom sesudah tiap kolom kosong karena itu hilang tanpa
     satu pun galat, dan nilainya terbaca sebagai kosong.

     Diukur atas kedua berkas POS Agustus 2026: Visit Purpose hilang di 100%
     baris (keluhan yang melahirkan uji ini), Pax Total 93%, Order Mode 90%,
     Menu Code 14% — dan Total After Bill Discount di 2 baris, yaitu UANG.

     Diuji sebagai UNIT di sini, bukan lewat berkas asli: berkas POS tidak
     boleh di-commit, jadi asersi yang cuma ada di sana MELEWAT diam-diam di
     mesin yang tidak punya berkasnya — yaitu tempat yang paling mungkin
     menjalankan uji ini. */
  console.log('\n== Pengurai sel .xlsx ==');
  {
    const winX = { console };
    new Function('window', ASET_XLSX)(winX);
    const urai = winX.uraiSheet;

    /* Bentuk yang benar-benar dipulangkan POS: inlineStr, dan sel kosong
       self-closing di antara dua sel berisi. */
    const xml1 = '<row r="12">'
      + '<c r="L12" s="9" t="inlineStr"><is><t>Pekanbaru</t></is></c>'
      + '<c r="M12" s="9"/>'
      + '<c r="N12" s="9" t="inlineStr"><is><t>DINE IN</t></is></c>'
      + '<c r="O12" s="9" t="inlineStr"><is><t>Non Member</t></is></c>'
      + '</row>';
    const b1 = urai(xml1, [])[0];
    cek('sel sesudah sel kosong TIDAK ditelan', b1.N === 'DINE IN',
        'N=' + JSON.stringify(b1.N) + ' seluruh baris=' + JSON.stringify(b1));
    cek('...sel kosongnya sendiri tetap tercatat sebagai kosong', b1.M === '',
        JSON.stringify(b1.M));
    cek('...dan sel sesudahnya lagi ikut utuh', b1.O === 'Non Member', JSON.stringify(b1.O));
    cek('...sel sebelum yang kosong tidak terpengaruh', b1.L === 'Pekanbaru', JSON.stringify(b1.L));

    /* Beberapa sel kosong berurutan — bentuk yang ada di kolom metadata POS. */
    const b2 = urai('<row r="3">'
      + '<c r="A3" s="1"/><c r="B3" s="1"/><c r="C3" s="1"/>'
      + '<c r="D3"><v>12345.67</v></c></row>', [])[0];
    cek('beberapa sel kosong berurutan tidak menelan yang berikutnya',
        b2.D === '12345.67', JSON.stringify(b2));
    /* INI YANG PALING MAHAL: kolom UANG tepat sesudah kolom kosong. Nilainya
       jatuh ke nol dan totalnya tetap terlihat wajar — tidak ada satu pun
       galat yang menyebutnya. */
    cek('...termasuk kalau yang berikutnya kolom angka', Number(b2.D) === 12345.67);

    /* sharedStrings tetap terbaca, dan sel kosong di depannya tidak
       menggesernya. */
    const b3 = urai('<row r="4"><c r="A4" s="1"/><c r="B4" t="s"><v>1</v></c></row>',
        ['nol', 'satu'])[0];
    cek('sharedStrings tetap terbaca sesudah sel kosong', b3.B === 'satu', JSON.stringify(b3));

    /* Baris tanpa satu pun sel kosong harus tetap sama seperti dulu — perbaikan
       ini tidak boleh mengubah apa pun untuk bentuk yang memang sudah benar. */
    const b4 = urai('<row r="5"><c r="A5" t="inlineStr"><is><t>x</t></is></c>'
      + '<c r="B5"><v>7</v></c></row>', [])[0];
    cek('baris tanpa sel kosong tidak berubah artinya', b4.A === 'x' && b4.B === '7',
        JSON.stringify(b4));

    /* Entity XML tetap dibalikkan. */
    const b5 = urai('<row r="6"><c r="A6" s="1"/>'
      + '<c r="B6" t="inlineStr"><is><t>Kopi &amp; Susu</t></is></c></row>', [])[0];
    cek('entity XML tetap dibalikkan', b5.B === 'Kopi & Susu', JSON.stringify(b5));
  }

  /* ================= 2. baca berkas POS ASLI ================= */
  console.log('\n== Baca berkas .xlsx asli ==');
  const bp = berkasPos();
  if (!bp) {
    console.log('  LEWAT  berkas "Sales Recapitulation Report*.xlsx" tidak ada di root repo.');
    console.log('         Taruh satu di sana untuk menguji pembacaan sungguhan.');
  } else {
    const { dom } = domAnalytics({});
    await siap(dom.window);
    const w = dom.window, d = w.document;
    w.go('unggah'); await tunggu(40);

    const buf = fs.readFileSync(bp);
    const file = new w.File([new Uint8Array(buf)], path.basename(bp),
      { type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    /* File jsdom tidak punya arrayBuffer()/text() yang bisa dipakai langsung
       di sebagian versi — disediakan supaya yang diuji tetap kode modulnya. */
    file.arrayBuffer = async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    file.text = async () => buf.toString('utf8');

    /* Visit Purpose di berkas ASLI. Kalau ini merah sementara asersi unit di
       atas hijau, berarti POS mengganti nama atau bentuk kolomnya — dua sebab
       yang berbeda, dan memisahkannya menghemat satu putaran penuh. */
    {
      const barisAsli = await winXlsxBaris(bp);
      const iH = barisAsli.findIndex(r => Object.values(r).filter(x => x && isNaN(Number(x))).length >= 5);
      const kol = Object.keys(barisAsli[iH] || {})
        .find(k => String(barisAsli[iH][k] || '').trim().toLowerCase() === 'visit purpose');
      cek('berkas asli: kolom Visit Purpose ketemu', !!kol, 'kepala baris ' + iH);
      if (kol) {
        let isi = 0;
        for (let i = iH + 1; i < barisAsli.length; i++)
          if (String(barisAsli[i][kol] || '').trim()) isi++;
        const nData = barisAsli.length - iH - 1;
        cek('berkas asli: Visit Purpose benar-benar terisi, bukan kosong seluruhnya',
            isi > nData * 0.9, isi + ' dari ' + nData + ' baris terisi');
      }
    }

    const t0 = Date.now();
    await w.anPilihBerkas({ files: [file] });
    for (let i = 0; i < 200 && !w.eval('UNGGAH_HASIL'); i++) await tunggu(50);
    const ms = Date.now() - t0;

    const u = w.eval('UNGGAH_HASIL');
    cek('berkas .xlsx terbaca', !!u, 'UNGGAH_HASIL masih null');
    if (u) {
      console.log('         (' + ms + ' ms, ' + (buf.length / 1e6).toFixed(1) + ' MB)');
      cek('bulannya terbaca', /^\d{4}-\d{2}$/.test(u.bulan), u.bulan);
      cek('dikenali sebagai Bill Report', u.jenis === 'bill', u.jenis);
      cek('ribuan bill terbaca', u.nBaris > 1000, String(u.nBaris));
      cek('grand total terbaca', u.ringkas.grand > 1e8, String(u.ringkas.grand));
      /* Service & pajak WAJIB ikut terbaca: keduanya yang membedakan Grand
         Total dari Net Sales, dan tanpa itu perbandingan dengan Rekap
         Penjualan akan selalu meleset sebesar keduanya. */
      cek('service charge terbaca', u.ringkas.svc > 0, String(u.ringkas.svc));
      cek('pajak terbaca', u.ringkas.tax > 0, String(u.ringkas.tax));
      cek('net sales terbaca', u.ringkas.net > 0, String(u.ringkas.net));
      cek('grand > net (ada service & pajak)', u.ringkas.grand > u.ringkas.net);
      cek('per tanggal terisi', Object.keys(u.hari).length > 20, String(Object.keys(u.hari).length));
      /* Sebaran jam adalah dasar seluruh analisa shift. Kalau kolom jam salah
         dibaca, semuanya jatuh ke satu ember dan sebarannya terlihat rata. */
      const berjam = (u.jam || []).filter(x => x.bill > 0).length;
      cek('sebaran jam terisi lebih dari satu ember', berjam > 4, String(berjam));
      cek('jumlah bill per jam = total bill',
          (u.jam || []).reduce((a, x) => a + x.bill, 0) === u.nBaris,
          (u.jam || []).reduce((a, x) => a + x.bill, 0) + ' vs ' + u.nBaris);
      /* Jumlah per tanggal HARUS sama dengan totalnya. Kalau tidak, ada baris
         yang masuk total tapi tidak masuk hari mana pun — dan grafik hariannya
         akan selamanya lebih kecil daripada kartu di atasnya. */
      const jmlHari = Object.keys(u.hari).reduce((a, t) => a + u.hari[t].grand, 0);
      cek('jumlah per tanggal = grand total', Math.round(jmlHari) === Math.round(u.ringkas.grand),
          Math.round(jmlHari) + ' vs ' + Math.round(u.ringkas.grand));
      cek('Bill Report tidak mengarang nama menu', Object.keys(u.menu).length === 0,
          Object.keys(u.menu).join(',').slice(0, 80));

      /* Pratinjau harus MENGATAKAN kalau laporannya tak berisi menu. */
      const v = d.getElementById('app-view').innerHTML;
      cek('pratinjau menyebut jenis laporannya', v.indexOf('Bill Report') > -1);
      cek('pratinjau memperingatkan tidak ada menu', v.indexOf('tidak berisi nama menu') > -1);
    }
    dom.window.close();
  }

  /* ================= 3. tanggal ================= */
  console.log('\n== Pembacaan tanggal ==');
  {
    const { dom } = domAnalytics({});
    await siap(dom.window);
    const w = dom.window;
    const iso = s => w.eval('isoDari(' + JSON.stringify(s) + ')');
    /* Serial Excel: 46235 = 2026-08-01. Dihitung UTC — kalau lokal, zona di
       sebelah timur menggeser tanggalnya satu hari, dan omset pindah hari. */
    cek('serial Excel 46235 -> 2026-08-01', iso(46235) === '2026-08-01', iso(46235));
    cek('serial sebagai teks juga terbaca', iso('46235') === '2026-08-01', iso('46235'));
    cek('ISO dilewatkan apa adanya', iso('2026-08-01') === '2026-08-01');
    cek('ISO berjam dipotong', iso('2026-08-01T19:30:00') === '2026-08-01');
    cek('dd-mm-yyyy terbaca', iso('01-08-2026') === '2026-08-01', iso('01-08-2026'));
    cek('dd/mm/yyyy terbaca', iso('1/8/2026') === '2026-08-01', iso('1/8/2026'));
    /* Angka yang jelas bukan tanggal (nomor meja, jumlah pax) TIDAK boleh jadi
       tanggal — kalau iya, satu kolom yang salah dipetakan akan mengisi
       kalender dengan tahun 1900-an dan tidak ada yang tahu dari mana. */
    cek('angka kecil bukan tanggal', iso(21) === '', iso(21));
    cek('kosong tetap kosong', iso('') === '' && iso(null) === '');
    dom.window.close();
  }


  /* ================= 3b. Detail Report (satu baris per menu) ==============
     Diunggah user 4 September 2026. Empat kolomnya bernama beda tipis dari
     Bill Report, dan yang tidak dikenali TIDAK melempar galat — ia memulangkan
     nol, dan nol di halaman analitik terbaca sebagai fakta. */
  console.log('\n== Detail Report: satu baris per menu ==');
  {
    /* jamDari() diuji SELALU, tidak bergantung berkas: ia yang menentukan
       seluruh sebaran jam, dan salahnya muncul sebagai grafik rata. */
    const { dom } = domAnalytics({});
    await siap(dom.window);
    const w = dom.window;
    const jd = v => w.eval('jamDari')(v);
    cek('jam dari teks "10:03:21"', jd('10:03:21') === 10, String(jd('10:03:21')));
    cek('jam dari teks berjam-tanggal', jd('2026-08-01 21:45') === 21, String(jd('2026-08-01 21:45')));
    /* Serial Excel: 46235.419108796 -> 0.419… x 24 = 10,06 -> jam 10. Dibaca
       dengan parseInt(slice(0,2)) ia jadi 46, di luar 0..23, dan barisnya
       dibuang — itulah sebab sebaran jam kosong 24 dari 24. */
    cek('jam dari serial Excel penuh', jd(46235.419108796) === 10, String(jd(46235.419108796)));
    cek('jam dari serial jam-saja', jd(0.9) === 21, String(jd(0.9)));
    /* Serial BULAT = tanggal tanpa jam. Dijadikan 0 ia menumpuk jadi "ramai
       sekali tengah malam" — satu-satunya jam yang tidak akan dicurigai,
       karena tutupnya memang lewat tengah malam. */
    cek('serial bulat = tidak ada jam, bukan jam 00', jd(46235) === -1, String(jd(46235)));
    cek('kosong = tidak ada jam', jd('') === -1 && jd(null) === -1);

    /* Urutan KOL_CARI menentukan mana yang menang saat berkas punya keduanya.
       'Total' di Detail Report adalah nilai SEBELUM bill discount; memakainya
       membuat omset sebulan Rp6,3 juta lebih besar daripada Bill Report untuk
       data yang sama persis. */
    const kc = w.eval('KOL_CARI');
    cek('total-after-bill-discount menang atas total',
        kc.grand.indexOf('total after bill discount') === 0, kc.grand.join(','));
    cek('"Nett Sales" (dua t) dikenali', kc.net.indexOf('nett sales') > -1, kc.net.join(','));
    cek('"Order Time" dikenali sebagai jam', kc.jam.indexOf('order time') > -1, kc.jam.join(','));
    /* 'discount' pindah dari dBill ke dMenu: di Detail Report kolom itu diskon
       per menu, dan menghitungnya sebagai bill discount membuatnya berganda
       dengan kolom 'Bill Discount' yang juga ada di berkas yang sama. */
    cek('kolom "Discount" dihitung sebagai diskon menu, bukan bill',
        kc.dMenu.indexOf('discount') > -1 && kc.dBill.indexOf('discount') < 0,
        JSON.stringify({ dMenu:kc.dMenu, dBill:kc.dBill }));

    /* ---- dua jalur penghitungan bill, diuji langsung di ringkasPos ---- */
    const ringkas = w.eval('ringkasPos');
    /* Empat baris menu milik DUA bill. Yang menghitung baris memberi 4. */
    const detail = [
      { a:'Sales Date', b:'Bill Number', c:'Order Time', d:'Menu', e:'Qty', f:'Total After Bill Discount' },
      { a:'2026-08-01', b:'B1', c:'0.5',  d:'Kopi',  e:'1', f:'10000' },
      { a:'2026-08-01', b:'B1', c:'0.5',  d:'Roti',  e:'2', f:'20000' },
      { a:'2026-08-01', b:'B2', c:'0.75', d:'Kopi',  e:'1', f:'10000' },
      { a:'2026-08-01', b:'B2', c:'0.75', d:'Teh',   e:'1', f:'5000' }
    ];
    const rd = ringkas(detail, 'detail.xlsx');
    cek('4 baris menu milik 2 bill dihitung sebagai 2 bill',
        rd.ringkas.bill === 2, String(rd.ringkas.bill));
    cek('...tapi barisnya tetap dilaporkan 4', rd.nBaris === 4, String(rd.nBaris));
    cek('...dan nilainya dijumlahkan dari tiap baris',
        rd.ringkas.grand === 45000, String(rd.ringkas.grand));
    cek('rata-rata per bill jadi 22.500, bukan 11.250',
        rd.ringkas.grand / rd.ringkas.bill === 22500,
        String(rd.ringkas.grand / rd.ringkas.bill));
    cek('bill per hari juga dari nomor bill', rd.hari['2026-08-01'].bill === 2,
        String(rd.hari['2026-08-01'].bill));
    /* 0.5 -> jam 12, 0.75 -> jam 18. Satu bill per jam. */
    cek('bill per jam juga dari nomor bill',
        rd.jam[12].bill === 1 && rd.jam[18].bill === 1,
        rd.jam[12].bill + ' / ' + rd.jam[18].bill);
    cek('laporan yang punya nomor bill tidak ditandai jatuh-ke-baris',
        rd.billDariBaris === false, String(rd.billDariBaris));

    /* TANPA kolom nomor bill: jatuh ke hitungan baris — dan itu DITANDAI,
       bukan didiamkan. Angka bill yang diam-diam berarti "jumlah baris"
       adalah angka yang dibaca sebagai jumlah tamu. */
    const tanpaBill = detail.map(r => ({ a:r.a, c:r.c, d:r.d, e:r.e, f:r.f }));
    const rt = ringkas(tanpaBill, 'x.xlsx');
    cek('tanpa kolom nomor bill, jatuh ke hitungan baris',
        rt.ringkas.bill === 4, String(rt.ringkas.bill));
    cek('...dan ditandai supaya bisa dikatakan di layar',
        rt.billDariBaris === true, String(rt.billDariBaris));
    cek('...bill per hari & per jam ikut terisi',
        rt.hari['2026-08-01'].bill === 4 && rt.jam[12].bill === 2,
        rt.hari['2026-08-01'].bill + ' / ' + rt.jam[12].bill);
    dom.window.close();
  }

  {
    const bd = berkasPosDetail();
    if (!bd) {
      console.log('  LEWAT  berkas "Sales Recapitulation Detail Report*.xlsx" tidak ada di root repo.');
    } else {
      const { dom } = domAnalytics({});
      await siap(dom.window);
      const w = dom.window;
      w.go('unggah'); await tunggu(40);
      const u = await uraiBerkas(w, bd);
      cek('Detail Report terbaca', !!u, 'UNGGAH_HASIL masih null');
      if (u) {
        cek('dikenali sebagai Menu Report', u.jenis === 'menu', u.jenis);
        cek('nama menu terbaca', Object.keys(u.menu).length > 50,
            String(Object.keys(u.menu).length));
        /* INTI perbaikan 4 September 2026: bill dihitung dari nomor bill yang
           BERBEDA. Menghitung baris memberi 19.734 "bill" untuk 4.785 bill
           sungguhan — rata-rata per bill jatuh empat kali lipat, dan angkanya
           tetap terlihat masuk akal. */
        cek('bill lebih sedikit daripada baris (dihitung dari nomor bill)',
            u.ringkas.bill > 0 && u.ringkas.bill < u.nBaris / 2,
            u.ringkas.bill + ' bill dari ' + u.nBaris + ' baris');
        cek('Nett Sales terbaca (bukan nol)', u.ringkas.net > 1e8, String(u.ringkas.net));
        cek('service & pajak terbaca', u.ringkas.svc > 0 && u.ringkas.tax > 0);
        const berjam = (u.jam || []).filter(x => x.bill > 0).length;
        cek('sebaran jam terisi (Order Time serial terbaca)', berjam > 8, String(berjam));
        /* Satu bill boleh muncul di dua jam — pesan lagi belakangan. Jadi
           jumlah kolom bill per jam BOLEH lebih besar daripada total bill,
           tapi tidak boleh lebih kecil. */
        const jamBill = (u.jam || []).reduce((a, x) => a + (x.bill || 0), 0);
        cek('bill per jam >= total bill (satu bill bisa dua jam)',
            jamBill >= u.ringkas.bill, jamBill + ' vs ' + u.ringkas.bill);
        cek('per tanggal terisi', Object.keys(u.hari).length > 20,
            String(Object.keys(u.hari).length));
        /* Bulanan: bill per hari juga harus dari nomor bill, bukan baris. */
        const hariBill = Object.keys(u.hari).reduce((a, t) => a + u.hari[t].bill, 0);
        cek('bill per hari dijumlahkan = total bill', hariBill === u.ringkas.bill,
            hariBill + ' vs ' + u.ringkas.bill);
      }
      dom.window.close();
    }
  }

  /* ================= 3c. Dua laporan, satu bulan, angka yang sama ==========
     Pemeriksaan terkuat di berkas ini, dan satu-satunya yang tidak bisa
     dipalsukan: Bill Report dan Detail Report untuk bulan yang sama HARUS
     memulangkan angka yang sama. Keduanya dibaca lewat jalur yang benar-benar
     dipakai peramban, dan yang dibandingkan hasilnya — bukan asumsinya. */
  console.log('\n== Bill Report vs Detail Report: bulan yang sama ==');
  {
    const bp = berkasPos(), bd = berkasPosDetail();
    if (!bp || !bd) {
      console.log('  LEWAT  perlu KEDUA berkas di root repo untuk membandingkannya.');
    } else {
      const { dom } = domAnalytics({});
      await siap(dom.window);
      const w = dom.window;
      w.go('unggah'); await tunggu(40);
      const a = await uraiBerkas(w, bp);
      const b = await uraiBerkas(w, bd);
      if (!a || !b) { cek('kedua berkas terbaca', false, 'salah satu gagal diurai'); }
      else {
        cek('bulannya sama', a.bulan === b.bulan, a.bulan + ' vs ' + b.bulan);
        cek('jumlah bill sama', a.ringkas.bill === b.ringkas.bill,
            a.ringkas.bill + ' vs ' + b.ringkas.bill);
        /* Nilai uang dibandingkan dengan toleransi Rp100: Detail Report
           membagi bill discount ke tiap baris menu, dan pembulatan per baris
           menyisakan selisih beberapa rupiah. */
        const dekat = (x, y, tol) => Math.abs(x - y) <= (tol || 100);
        cek('grand total sama', dekat(a.ringkas.grand, b.ringkas.grand),
            a.ringkas.grand + ' vs ' + b.ringkas.grand);
        cek('net sales sama', dekat(a.ringkas.net, b.ringkas.net),
            a.ringkas.net + ' vs ' + b.ringkas.net);
        cek('subtotal sama', dekat(a.ringkas.sub, b.ringkas.sub),
            a.ringkas.sub + ' vs ' + b.ringkas.sub);
        cek('service charge sama', dekat(a.ringkas.svc, b.ringkas.svc),
            a.ringkas.svc + ' vs ' + b.ringkas.svc);
        cek('pajak sama', dekat(a.ringkas.tax, b.ringkas.tax),
            a.ringkas.tax + ' vs ' + b.ringkas.tax);
        cek('bill discount sama', dekat(a.ringkas.discBill, b.ringkas.discBill),
            a.ringkas.discBill + ' vs ' + b.ringkas.discBill);
        /* Rata-rata per bill adalah angka yang paling sering dibaca orang di
           halaman ini, dan yang paling mudah salah empat kali lipat. */
        const rb = x => x.ringkas.grand / (x.ringkas.bill || 1);
        cek('rata-rata per bill sama', dekat(rb(a), rb(b), 1),
            Math.round(rb(a)) + ' vs ' + Math.round(rb(b)));
        /* Cuma Detail Report yang punya nama menu — itu sebabnya ia diunggah. */
        cek('cuma Detail Report yang memuat nama menu',
            Object.keys(a.menu).length === 0 && Object.keys(b.menu).length > 50,
            Object.keys(a.menu).length + ' vs ' + Object.keys(b.menu).length);
      }
      dom.window.close();
    }
  }


  /* ================= 3d. Bentuk balasan hpp.php =============================
     Sampai 4 September 2026 analytics memeriksa `c.value.ok && c.value.data`,
     padahal hpp.php membalas payload DATAR. Keduanya selalu undefined, jadi HP
     selalu null dan perkiraan bahan baku TIDAK PERNAH SEKALI PUN terhitung —
     tanpa satu pun galat, dengan pesan di layar yang terdengar seperti
     gangguan sementara.

     Ujinya tidak lolos begitu saja waktu itu karena STUB-nya ikut salah: ia
     memulangkan {ok,data} yang tidak pernah dipulangkan server mana pun.
     Karena itu bentuknya sekarang dibaca dari SUMBER PHP-nya, bukan dari
     tiruannya. */
  console.log('\n== Bentuk balasan stock-api-mysql/hpp.php ==');
  {
    const php = fs.readFileSync(path.join(ROOT, 'stock-mysql', 'hpp.php'), 'utf8');
    const fn = php.slice(php.indexOf('function hpp_ambil('));
    const ret = fn.slice(fn.indexOf('return array('), fn.indexOf(';', fn.indexOf('return array(')));
    cek('hpp_ambil memulangkan bahan & resep di tingkat ATAS',
        /'bahan' =>/.test(ret) && /'resep' =>/.test(ret), ret.slice(0, 200));
    cek('...tanpa membungkusnya dalam kunci `data`', ret.indexOf("'data'") < 0, ret.slice(0, 200));
    cek('...dan tanpa kunci `ok`', ret.indexOf("'ok'") < 0, ret.slice(0, 200));
    /* pur_json menggemakan array apa adanya — tidak ada pembungkus di jalan. */
    const lib = fs.readFileSync(path.join(ROOT, 'stock-mysql', 'lib_stock_mysql.php'), 'utf8');
    const pj = lib.slice(lib.indexOf('function pur_json('), lib.indexOf('function pur_json(') + 320);
    cek('pur_json menggemakan payload apa adanya', /echo json_encode\(\$arr/.test(pj), pj);

    /* Dan layarnya membaca bentuk itu, bukan bentuk lain. */
    const src = HTML;   // berkas modulnya, sudah dibaca di kepala berkas ini
    cek('analytics tidak lagi menugaskan HP dari c.value.data',
        src.indexOf('? c.value.data : null') < 0,
        'penugasan lama masih ada');
    cek('...melainkan bentuk yang benar-benar dipakai (resep berupa array)',
        src.indexOf('Array.isArray(c.value.resep)') > -1);

    /* Yang menentukan: dengan tiruan berbentuk BENAR, resepnya harus terbaca
       dan perkiraan bahan baku harus benar-benar tergambar. */
    const hpp = { bahan: [], resep: [
      { nama:'Kopi', yield_qty:1, bahan:[ { nama:'Biji', qty:18, satuan:'Gr' } ] } ] };
    const an = { data:{ laporan:{ '2026-08': {
      diunggah:'2026-08-28', oleh:'W', berkas:'x.xlsx', jenis:'menu',
      hari:{ '2026-08-01':{ bill:1, grand:10000 } },
      jam:Array.from({length:24},()=>({bill:0,grand:0})),
      menu:{ 'Kopi':{ qty:10, nilai:250000 } },
      ringkas:{ bill:1, grand:10000, net:10000, svc:0, tax:0, sub:10000,
                discMenu:0, discBill:0, discVoucher:0, pax:0, billPax:0 }
    } }, setting:{} }, akses:{}, peran:{} };
    const { dom } = domAnalytics({ an, hpp });
    await siap(dom.window);
    const w = dom.window, d = w.document;
    cek('HP terisi dari balasan datar', !!w.eval('HP'), 'HP masih null');
    cek('...dan resepnya ikut', w.eval('HP && HP.resep.length') === 1);
    w.go('menu'); await tunggu(60);
    const v = d.getElementById('app-view').innerHTML;
    cek('perkiraan bahan baku benar-benar tergambar',
        v.indexOf('Resep dari modul HPP tidak terbaca') < 0 &&
        v.indexOf('Perkiraan Bahan Baku') > -1, v.slice(0, 300));
    /* 10 Kopi x 18 Gr = 180 Gr. */
    cek('angkanya dihitung, bukan cuma kerangkanya',
        v.slice(v.indexOf('Biji'), v.indexOf('Biji') + 160).indexOf('180') > -1,
        v.slice(v.indexOf('Biji'), v.indexOf('Biji') + 200));
    dom.window.close();
  }

  {
    /* Gagalnya harus MENYEBUTKAN sebabnya. Tiga kemungkinan (token salah,
       modul mati, versi beda) butuh tiga tindakan yang berbeda, dan pesan
       "tidak terbaca" tanpa sebab mengirim orang menebak ketiganya. */
    const { dom } = domAnalytics({ hppGagal:true });
    await siap(dom.window);
    const w = dom.window;
    cek('hpp gagal -> HP null', w.eval('HP') === null);
    cek('...dan sebabnya dicatat', /token salah/.test(w.eval('HP_ERR')), w.eval('HP_ERR'));
    cek('...tapi halamannya tetap hidup', !!w.document.getElementById('app-view'));
    dom.window.close();
  }

  /* ================= 4. laporan menu & bahan baku ================= */
  console.log('\n== Menu Report & bahan baku ==');
  {
    /* Resep bertingkat: Kopi Susu memakai base Susu Aren, yang punya resepnya
       sendiri. Kalau penguraiannya cuma satu tingkat, bahan di dalam base
       tidak pernah terhitung — dan selisih di lapangan dikira barang hilang. */
    const hpp = { bahan: [], resep: [
      { nama:'Kopi Susu Aren', yield_qty:1, bahan:[
        { nama:'Biji Kopi', qty:18, satuan:'Gr' },
        { nama:'Susu Aren', qty:1, satuan:'Pcs' } ] },
      { nama:'Susu Aren', yield_qty:10, bahan:[
        { nama:'Susu UHT', qty:1200, satuan:'Ml' },
        { nama:'Gula Aren', qty:300, satuan:'Gr' } ] },
      { nama:'Roti Bakar', yield_qty:1, bahan:[ { nama:'Roti', qty:2, satuan:'Slice' } ] }
    ] };
    const an = { data:{ laporan:{ '2026-08': {
      diunggah:'2026-08-28', oleh:'Wandi', berkas:'x.xlsx', jenis:'menu',
      hari:{ '2026-08-01':{ bill:10, grand:1000000 } },
      jam:Array.from({length:24},()=>({bill:0,grand:0})),
      menu:{ 'Kopi Susu Aren':{ qty:100, nilai:2500000 },
             'Roti Bakar':{ qty:20, nilai:400000 },
             'Menu Tanpa Resep':{ qty:5, nilai:150000 } },
      ringkas:{ bill:10, grand:1000000, net:900000, svc:50000, tax:50000, sub:900000,
                discMenu:0, discBill:0, discVoucher:0, pax:0, billPax:0 }
    } }, setting:{} }, akses:{}, peran:{} };
    const { dom } = domAnalytics({ an, hpp });
    await siap(dom.window);
    const w = dom.window, d = w.document;
    w.go('menu'); await tunggu(60);
    const v = d.getElementById('app-view').innerHTML;

    cek('menu terlaris tergambar', v.indexOf('KOPI SUSU AREN') > -1);
    /* Diurut menurut NILAI, bukan qty: menu murah yang terjual ratusan porsi
       bisa menyumbang lebih sedikit daripada satu menu mahal. */
    cek('diurut menurut nilai', v.indexOf('KOPI SUSU AREN') < v.indexOf('ROTI BAKAR'));
    cek('perkiraan bahan baku dihitung', v.indexOf('Perkiraan Bahan Baku') > -1);
    /* 100 Kopi Susu x 18 Gr = 1.800 Gr biji kopi. */
    cek('bahan langsung dikalikan benar', v.indexOf('1.800') > -1, v.slice(v.indexOf('Biji Kopi') - 60, v.indexOf('Biji Kopi') + 200));
    /* 100 x 1 Pcs Susu Aren, yield 10 -> 100/10 x 1200 Ml = 12.000 Ml UHT. */
    cek('resep di dalam resep ikut diurai', v.indexOf('Susu UHT') > -1);
    cek('yield resep dihitung', v.indexOf('12.000') > -1,
        v.slice(Math.max(0, v.indexOf('Susu UHT') - 60), v.indexOf('Susu UHT') + 200));
    /* Base TIDAK boleh muncul sebagai bahan: ia diurai jadi isinya, dan
       menghitungnya dua kali membuat perkiraan lebih besar dari kenyataan. */
    cek('base tidak ikut jadi baris bahan MENTAH',
        !/>Susu Aren( \([^)]*\))?</.test(v), 'Susu Aren muncul sebagai bahan');
    /* Menu tanpa resep DILAPORKAN. Tanpa itu perkiraan terlihat lengkap
       padahal sebagian menunya tidak pernah ikut dihitung. */
    cek('menu tanpa resep dilaporkan', v.indexOf('Menu yang belum ada di HPP') > -1);
    cek('menu tanpa resep disebut namanya', v.indexOf('MENU TANPA RESEP') > -1);
    cek('disebut berapa persen nilainya yang tidak terhitung', /% dari nilai penjualan menu/.test(v));
    /* Barisnya ikut ditandai DI TABEL PENJUALAN, bukan cuma di kartu bawah:
       yang melihat menu terlaris harus langsung tahu mana yang bahannya tidak
       ikut terhitung, tanpa menggulir ke bawah dan mencocokkan nama. */
    cek('...dan ditandai di baris penjualannya', v.indexOf('belum ada resep') > -1);

    /* ===== 1. bahan prep dipisah dari bahan mentah (4 Sep 2026) ===== */
    cek('ada saklar Bahan Mentah / Bahan Prep',
        /Bahan Mentah \(\d+\)/.test(v) && /Bahan Prep \/ Base \(\d+\)/.test(v),
        v.slice(v.indexOf('Perkiraan Bahan Baku'), v.indexOf('Perkiraan Bahan Baku') + 600));
    /* Bawaannya MENTAH — itu yang dibandingkan dengan stok gudang, dan itu
       pertanyaan yang lebih sering dibawa orang ke halaman ini. */
    cek('bawaannya bahan mentah', w.eval('MN_BAHAN') === 'mentah');
    cek('dikatakan kedua daftar tidak boleh dijumlahkan', /tidak boleh dijumlahkan/.test(v));
    w.eval("mnBahan('prep')"); await tunggu(60);
    const vp = d.getElementById('app-view').innerHTML;
    /* 100 Kopi Susu x 1 Pcs Susu Aren = 100 Pcs base yang harus diproduksi.
       Dicatat dalam satuan BARIS RESEPNYA (Pcs) — bukan satuan yield-nya,
       karena itulah takaran yang benar-benar diambil dapur. */
    cek('base muncul di daftar prep', vp.indexOf('Susu Aren (Pcs)') > -1,
        vp.slice(vp.indexOf('Base / bahan prep'), vp.indexOf('Base / bahan prep') + 400));
    cek('jumlah base dihitung benar (100 Pcs)',
        vp.slice(vp.indexOf('Susu Aren (Pcs)'), vp.indexOf('Susu Aren (Pcs)') + 140).indexOf('>100<') > -1,
        vp.slice(vp.indexOf('Susu Aren (Pcs)'), vp.indexOf('Susu Aren (Pcs)') + 160));
    /* Bahan mentah TIDAK boleh ikut di daftar prep, dan sebaliknya: bahan
       penyusun base sudah terurai di daftar mentah, jadi mencampurnya
       menghitung barang yang sama dua kali. */
    cek('bahan mentah tidak ikut di daftar prep',
        vp.slice(vp.indexOf('Base / bahan prep')).indexOf('Biji Kopi') < 0);
    w.eval("mnBahan('mentah')"); await tunggu(60);

    /* ===== 2. saklar urutan & ukuran halaman =====
       Saklar "20 Teratas / Seluruhnya" DICABUT 10 September 2026 (permintaan
       user), diganti pemilih 20/50/100 baris per halaman. Yang dijaga di sini
       ketiganya ditawarkan — pemilih yang cuma menawarkan satu ukuran adalah
       saklar lama dengan nama baru. */
    const v2 = d.getElementById('app-view').innerHTML;
    cek('ada saklar urutan',
        /Menurut Nilai/.test(v2) && /Menurut Porsi/.test(v2),
        v2.slice(v2.indexOf('Penjualan Menu'), v2.indexOf('Penjualan Menu') + 700));
    cek('saklar "20 Teratas / Seluruhnya" sudah dicabut',
        v2.indexOf('Teratas<') < 0 && !/Seluruhnya \(/.test(v2));
    cek('ketiga ukuran halaman ditawarkan',
        /mnPer\(20\)/.test(v2) && /mnPer\(50\)/.test(v2) && /mnPer\(100\)/.test(v2),
        v2.slice(v2.indexOf('Tampilkan'), v2.indexOf('Tampilkan') + 400));
    /* Urutan menurut porsi menjawab pertanyaan yang BERBEDA: menu murah yang
       terjual ratusan porsi menghabiskan paling banyak bahan, sementara menu
       mahal menyumbang paling banyak omset. */
    w.eval("mnUrut('qty')"); await tunggu(60);
    const vq = d.getElementById('app-view').innerHTML;
    cek('urutan menurut porsi benar-benar berubah',
        vq.indexOf('>KOPI SUSU AREN<') < vq.indexOf('>ROTI BAKAR<') &&
        vq.indexOf('>ROTI BAKAR<') < vq.indexOf('>MENU TANPA RESEP<'));
    w.eval("mnUrut('nilai')"); await tunggu(60);

    /* ===== rincian bahan PER PRODUK ===== */
    w.eval("mnBuka('KOPI SUSU AREN')"); await tunggu(60);
    const vr = d.getElementById('app-view').innerHTML;
    cek('rincian per produk memisahkan mentah & prep',
        vr.indexOf('Bahan mentah') > -1 && vr.indexOf('Bahan prep / base') > -1,
        vr.slice(vr.indexOf('porsi KOPI SUSU AREN') - 200, vr.indexOf('porsi KOPI SUSU AREN') + 400));
    cek('rinciannya menyebut jumlah porsi yang dihitung', /100<\/b> porsi KOPI SUSU AREN/.test(vr));
    /* Menekan baris yang sedang terbuka harus MENUTUPNYA — kalau tidak,
       satu-satunya cara menutupnya adalah membuka baris lain, dan yang membuka
       baris terakhir terjebak dengan rincian yang tidak bisa dihilangkan. */
    w.eval("mnBuka('KOPI SUSU AREN')"); await tunggu(60);
    cek('menekan baris yang terbuka menutupnya', w.eval('MN_BUKA') === '');
    /* Menu tanpa resep: rinciannya MENGATAKAN sebabnya, bukan kosong. Kosong
       terbaca sebagai "menu ini tidak butuh bahan apa-apa". */
    w.eval("mnBuka('MENU TANPA RESEP')"); await tunggu(60);
    const vt = d.getElementById('app-view').innerHTML;
    cek('rincian menu tanpa resep menjelaskan sebabnya', /belum punya resep di HPP/.test(vt),
        vt.slice(vt.indexOf('MENU TANPA RESEP'), vt.indexOf('MENU TANPA RESEP') + 400));

    /* ===== 3. daftar menu tak dikenal sebagai TEKS yang bisa disalin ===== */
    const ta = d.getElementById('mn-teks');
    cek('daftar menu tak dikenal tersedia sebagai teks', !!ta, 'textarea mn-teks tidak ada');
    cek('...satu baris per menu, dipisah TAB',
        !!ta && ta.value.split('\n').length === 1 && ta.value.split('\t').length === 3,
        ta && JSON.stringify(ta.value));
    cek('...memuat nama, qty, dan nilainya',
        !!ta && ta.value.indexOf('MENU TANPA RESEP') === 0 && ta.value.indexOf('\t5\t150000') > -1,
        ta && JSON.stringify(ta.value));
    /* readonly, BUKAN disabled: yang disabled tidak bisa diblok untuk disalin
       manual, dan itu jalan keluar terakhir kalau izin clipboard ditolak. */
    cek('teksnya readonly tapi tetap bisa diblok',
        !!ta && ta.readOnly === true && ta.disabled === false);
    cek('ada tombol salin & unduh',
        vt.indexOf('mnSalin()') > -1 && vt.indexOf('mnUnduhTak()') > -1);
    w.eval("mnBuka('MENU TANPA RESEP')"); await tunggu(60);
    dom.window.close();
  }


  /* ================= 4b. Menu paket & kategori (4 September 2026) =========
     Tiga permintaan user yang saling bersentuhan:
       1. porsi baris (PACKAGE) ikut dihitung di menu aslinya
       2. kategori menu (termasuk EVENT) punya halaman sendiri
       3. baris paket yang namanya cuma ukuran dikenali dari KODE-nya

     Yang dijaga di sini semuanya gagal DIAM-DIAM: porsi yang tidak digabung
     berdiri sebagai menu palsu bernama "REGULAR (PACKAGE)", dan bahan bakunya
     tidak pernah ikut terhitung. */
  console.log('\n== Menu paket & kategori ==');
  {
    /* Empat bentuk baris paket sekaligus, plus satu menu biasa sebagai
       pembanding yang tidak boleh ikut berubah. */
    const rows = [
      { a:'Sales Date', b:'Bill Number', c:'Menu', d:'Custom Menu Name', e:'Menu Code',
        f:'Qty', g:'Subtotal', h:'Menu Category', i:'Menu Category Detail', j:'Visit Purpose' },
      { a:'2026-08-01', b:'B1', c:'MINERAL WATER',           d:'', e:'', f:'10', g:'100000', h:'BEVERAGES', i:'GRAB AND GO' },
      { a:'2026-08-01', b:'B1', c:'MINERAL WATER (PACKAGE)', d:'', e:'', f:'3',  g:'0',      h:'BEVERAGES', i:'GRAB AND GO' },
      { a:'2026-08-01', b:'B2', c:'LARGE (PACKAGE)',         d:'MATCHA02', e:'', f:'4', g:'20000', h:'BEVERAGES', i:'SIGNATURE NON COFFEE' },
      { a:'2026-08-01', b:'B2', c:'REGULAR (PACKAGE)',       d:'MATCHA01', e:'', f:'2', g:'10000', h:'BEVERAGES', i:'SIGNATURE NON COFFEE' },
      { a:'2026-08-01', b:'B3', c:'MATCHA LATTE',            d:'', e:'', f:'5',  g:'150000', h:'BEVERAGES', i:'SIGNATURE NON COFFEE' },
      /* Kolom kode juga dipakai kasir menulis catatan — tidak boleh jadi kode. */
      { a:'2026-08-01', b:'B4', c:'LARGE (PACKAGE)',         d:'Setengah mateng', e:'', f:'1', g:'5000', h:'BEVERAGES', i:'TEA COLLECTION' },
      { a:'2026-08-01', b:'B5', c:'NASI GORENG',             d:'', e:'', f:'6',  g:'300000', h:'FOOD', i:'NUSANTARA' },
      /* PASANGAN SUNGGUHAN: baris minuman lalu baris UKURANNYA, qty sama —
         bentuk yang benar-benar ditulis POS (2.619 dari 2.620 baris ukuran
         Agustus 2026). Tanpa pasangan seperti ini, seluruh baris ukuran di
         fixture ini yatim dan jalur PEMINDAHAN tidak pernah dijalankan sekali
         pun — mutasi "ukuran dijumlahkan lagi" akan LOLOS. Kategorinya sengaja
         yang sudah ada, supaya jumlah kategori tidak ikut berubah. */
      { a:'2026-08-01', b:'B8', c:'ICE AMERICANO',           d:'', e:'', f:'3',  g:'90000',  h:'BEVERAGES', i:'SIGNATURE NON COFFEE' },
      { a:'2026-08-01', b:'B8', c:'LARGE (PACKAGE)',         d:'AMERICANO02', e:'', f:'3', g:'15000', h:'BEVERAGES', i:'SIGNATURE NON COFFEE' },
      { a:'2026-08-01', b:'B8', c:'ICE AMERICANO',           d:'', e:'', f:'7',  g:'210000', h:'BEVERAGES', i:'SIGNATURE NON COFFEE' },
      { a:'2026-08-01', b:'B8', c:'REGULAR (PACKAGE)',       d:'AMERICANO01', e:'', f:'7', g:'0', h:'BEVERAGES', i:'SIGNATURE NON COFFEE' },
      /* RANTAI INDUK PUTUS: baris ukuran KEDUA di bill ini tidak punya
         baris minuman tepat di atasnya — yang di atasnya baris ukuran juga.
         Bentuk ini ADA di produksi (paket yang cuma menuliskan baris
         ukuran kopinya, induknya justru nasi dua baris sebelumnya), dan
         tanpa fixture ini mutasi 'rantai induk tidak diputus' LOLOS:
         porsinya lalu dikurangkan dari menu yang sama sekali lain. */
      { a:'2026-08-01', b:'B9', c:'NASI GORENG',             d:'', e:'', f:'2', g:'100000', h:'FOOD', i:'NUSANTARA' },
      { a:'2026-08-01', b:'B9', c:'REGULAR (PACKAGE)',       d:'NASIGOR01', e:'', f:'2', g:'0', h:'BEVERAGES', i:'SIGNATURE NON COFFEE' },
      { a:'2026-08-01', b:'B9', c:'LARGE (PACKAGE)',         d:'TEHTARIK02', e:'', f:'1', g:'5000', h:'BEVERAGES', i:'SIGNATURE NON COFFEE' },
      /* EVENT berkelompok FOOD, dan ia DULUAN supaya `kategori['EVENT'].kat`
         terisi FOOD (yang pertama menang). Tanpa baris ini kedua aturan tidak
         bisa dibedakan: di produksi EVENT kebetulan berkelompok OTHERS, jadi
         mencabut aturan EVENT tidak mengubah satu angka pun. */
      { a:'2026-08-01', b:'B6', c:'PRASMANAN',               d:'', e:'', f:'3',  g:'900000', h:'FOOD',   i:'EVENT' },
      { a:'2026-08-01', b:'B6', c:'DJ PERFORMANCE',          d:'', e:'', f:'1',  g:'500000', h:'OTHERS', i:'EVENT' },
      /* Kelompok OTHERS, kategori BUKAN EVENT. Rokok dijual apa adanya, tidak
         punya resep, dan tidak pernah keluar dari gudang bahan. */
      { a:'2026-08-01', b:'B7', c:'ROKOK SAMPOERNA',         d:'', e:'', f:'2',  g:'60000',  h:'OTHERS', i:'ROKOK' }
    ];
    /* HPP tiruan diberi SATU resep supaya daftar bahan baku benar-benar ada
       isinya — tanpa itu daftarnya selalu kosong dan penyaring pencariannya
       tidak pernah dijalankan sekali pun. */
    const { dom } = domAnalytics({ hpp: { resep: [
      { nama:'NASI GORENG', yield_qty:1, bahan:[
        { nama:'BERAS', qty:200, satuan:'Gr' },
        { nama:'TELUR', qty:1, satuan:'Btr' } ] }
    ] } });
    await siap(dom.window);
    const w = dom.window, d = w.document;
    const u = w.eval('ringkasPos')(rows, 'x.xlsx');

    /* ---- pengurai ---- */
    cek('baris paket dirinci per kode', !!u.paket['LARGE (PACKAGE)'],
        JSON.stringify(Object.keys(u.paket)));
    cek('kode dibaca dari Custom Menu Name saat Menu Code kosong',
        !!(u.paket['LARGE (PACKAGE)'] || {})['MATCHA02'],
        JSON.stringify(u.paket['LARGE (PACKAGE)']));
    /* Kolom yang ADA tapi KOSONG adalah jebakannya: kalau `Menu Code` dipilih
       sekali di depan karena kolomnya ada, nol kode terbaca tanpa satu pun
       galat. Karena itu kolomnya dipilih PER BARIS. */
    cek('catatan kasir TIDAK dianggap kode',
        !!(u.paket['LARGE (PACKAGE)'] || {})[''], JSON.stringify(u.paket['LARGE (PACKAGE)']));
    cek('kodeMenu menolak teks bercelah',
        w.eval("kodeMenu('Setengah mateng')") === '' && w.eval("kodeMenu('MATCHA02')") === 'MATCHA02');
    cek('kodeMenu menolak yang tidak berakhiran angka',
        w.eval("kodeMenu('Takeaway')") === '');
    cek('kode dibakukan huruf besar', w.eval("kodeMenu('matcha02')") === 'MATCHA02');

    /* ---- 1 & 3: penggabungan saat MENGGAMBAR ---- */
    w.eval('AN.data.setting.petaKode = {}');
    let NM = w.eval('menuNormal')(u);
    /* Nama jelas cukup dibuang akhirannya — tidak butuh peta apa pun. */
    cek('paket bernama jelas digabung ke menu aslinya',
        NM.gab['MINERAL WATER'].qty === 13, String(NM.gab['MINERAL WATER'] && NM.gab['MINERAL WATER'].qty));
    cek('...dan nama berakhiran (PACKAGE) tidak lagi berdiri sendiri',
        !NM.gab['MINERAL WATER (PACKAGE)']);
    /* Yang namanya cuma ukuran BELUM bisa digabung — tapi porsinya TETAP
       dihitung, dengan nama yang menyebut kodenya. Dibuang, jumlah porsi di
       halaman ini berhenti sama dengan jumlah di berkas POS. */
    cek('kode yang belum dipetakan dilaporkan', Object.keys(NM.takKenal).length === 4,
        JSON.stringify(Object.keys(NM.takKenal)));
    cek('...porsinya tetap dihitung dengan nama berkode',
        !!NM.gab['LARGE (PACKAGE) · MATCHA02'], JSON.stringify(Object.keys(NM.gab)));

    /* JUMLAH TOTAL TIDAK BOLEH BERUBAH karena penggabungan — ini pemeriksaan
       yang paling menentukan: penggabungan yang menghilangkan atau
       menggandakan porsi tidak akan terlihat di layar mana pun. */
    const totQ = o => Object.keys(o).reduce((a, k) => a + o[k].qty, 0);
    const totN = o => Object.keys(o).reduce((a, k) => a + o[k].nilai, 0);
    /* gab + yang DIKELUARKAN harus sama dengan menu mentah. Membandingkan gab
       saja sudah tidak benar sejak kategori acara disaring — tapi menurunkan
       asersinya berarti membuang penjaganya. Bentuk ini menjaga DUA hal
       sekaligus: penggabungan tidak menghilangkan porsi, dan penyaring acara
       tidak membuang porsi tanpa melaporkannya. */
    cek('jumlah porsi tidak berubah karena penggabungan',
        totQ(NM.gab) + NM.ev.qty + (NM.ukTotal.qty - NM.ukTotal.sendiri) === totQ(u.menu),
        totQ(NM.gab) + '+' + NM.ev.qty + '+' + (NM.ukTotal.qty - NM.ukTotal.sendiri) + ' vs ' + totQ(u.menu));
    cek('nilai total tidak berubah karena penggabungan',
        totN(NM.gab) + NM.ev.nilai === totN(u.menu),
        totN(NM.gab) + '+' + NM.ev.nilai + ' vs ' + totN(u.menu));

    /* ---- BARIS UKURAN BUKAN PORSI TAMBAHAN (10 September 2026) ----

       "REGULAR (PACKAGE)" / "LARGE (PACKAGE)" mengulang qty baris minuman
       tepat di atasnya, jadi menjumlahkannya menghitung minuman yang sama DUA
       KALI — 3.217 porsi hantu di Agustus 2026, tanpa satu pun galat.

       Ini asersi yang paling menentukan di seluruh blok ini: 3 + 7 = 10,
       BUKAN 20. */
    cek('porsi large PINDAH dari induknya, bukan ditambahkan',
        NM.gab['ICE AMERICANO'] && NM.gab['ICE AMERICANO'].qty === 7,
        JSON.stringify(NM.gab['ICE AMERICANO']));
    cek('...dan berdiri sebagai barisnya sendiri',
        NM.gab['ICE AMERICANO (LARGE)'] && NM.gab['ICE AMERICANO (LARGE)'].qty === 3,
        JSON.stringify(NM.gab['ICE AMERICANO (LARGE)']));
    cek('...jumlah keduanya SAMA dengan porsi mentahnya, bukan dua kali lipat',
        NM.gab['ICE AMERICANO'].qty + NM.gab['ICE AMERICANO (LARGE)'].qty === u.menu['ICE AMERICANO'].qty,
        NM.gab['ICE AMERICANO'].qty + '+' + NM.gab['ICE AMERICANO (LARGE)'].qty
          + ' vs ' + u.menu['ICE AMERICANO'].qty);
    /* Ukuran BAWAAN tidak dipisah — kalau ikut, tiap menu berdiri dua baris
       tanpa satu pun pertanyaan yang terjawab olehnya. */
    cek('ukuran REGULAR tidak dipisah jadi barisnya sendiri',
        !NM.gab['ICE AMERICANO (REGULAR)'], JSON.stringify(Object.keys(NM.gab)));
    /* NILAI ikut pindah dari baris induknya (diambil dari baris induknya
       sendiri saat mengurai), plus biaya upsize di baris ukurannya. Kalau
       nilainya tidak ikut, baris large berdiri dengan 3 porsi seharga biaya
       upsize saja — dan rata-rata per porsi induknya melonjak. */
    cek('nilainya ikut pindah, berikut biaya upsize-nya',
        NM.gab['ICE AMERICANO'].nilai === 210000
        && NM.gab['ICE AMERICANO (LARGE)'].nilai === 105000,
        NM.gab['ICE AMERICANO'].nilai + ' / ' + NM.gab['ICE AMERICANO (LARGE)'].nilai);
    /* Induknya dicatat saat MENGURAI — sesudah diringkas per nama menu, urutan
       barisnya hilang selamanya. Laporan lama karena itu tidak bisa
       dipisahkan tanpa diunggah ulang, dan itu dikatakan di layar. */
    cek('induk baris ukuran ikut tersimpan di hasil urai',
        !!(u.ukuran && u.ukuran['ICE AMERICANO'] && u.ukuran['ICE AMERICANO']['LARGE']),
        JSON.stringify(Object.keys(u.ukuran || {})));
    /* Baris ukuran yang TIDAK punya induk tepat di atasnya adalah minumannya
       SENDIRI — ditambahkan, bukan dipindahkan. Kalau ikut dibuang, porsinya
       hilang dari daftar menu tanpa satu pun tanda. */
    cek('baris ukuran tanpa induk tetap dihitung',
        NM.ukTotal.sendiri === 8, String(NM.ukTotal.sendiri));
    /* Baris ukuran yang di atasnya baris ukuran juga TIDAK boleh mewarisi
       menu dua baris sebelumnya — porsinya akan dikurangkan dari menu yang
       sama sekali lain, tanpa satu pun galat. */
    cek('rantai induk diputus baris paket',
        !NM.gab['NASI GORENG (LARGE)'] && NM.gab['NASI GORENG'].qty === 8,
        JSON.stringify(NM.gab['NASI GORENG']) + ' / ' + JSON.stringify(Object.keys(NM.gab)));

    /* Dipetakan: porsinya pindah ke menu aslinya. */
    w.eval("AN.data.setting.petaKode = { MATCHA02:'MATCHA LATTE', MATCHA01:'MATCHA LATTE' }");
    NM = w.eval('menuNormal')(u);
    cek('kode yang dipetakan pindah ke menu aslinya',
        NM.gab['MATCHA LATTE'].qty === 11, String(NM.gab['MATCHA LATTE'].qty));
    cek('...dan totalnya tetap sama',
        totQ(NM.gab) + NM.ev.qty + (NM.ukTotal.qty - NM.ukTotal.sendiri) === totQ(u.menu),
        totQ(NM.gab) + '+' + NM.ev.qty + '+' + (NM.ukTotal.qty - NM.ukTotal.sendiri) + ' vs ' + totQ(u.menu));
    /* AMERICANO02 sengaja TIDAK ikut dipetakan: ia baris ukuran yang PUNYA
       induk, jadi ia satu-satunya yang membuktikan kode berinduk pun tetap
       dilaporkan kalau resepnya belum ada. */
    cek('...sisa kode yang belum dipetakan tinggal yang berinduk',
        Object.keys(NM.takKenal).sort().join(',') === 'AMERICANO02,TEHTARIK02', JSON.stringify(Object.keys(NM.takKenal)));
    cek('...dan yang berinduk menyebut induknya',
        NM.takKenal['AMERICANO02'].induk === 'ICE AMERICANO',
        JSON.stringify(NM.takKenal['AMERICANO02']));
    /* Peta dipakai saat MENGGAMBAR, bukan saat mengurai: kalau dibakukan ke
       laporan tersimpan, peta yang dibetulkan bulan depan tidak akan pernah
       memperbaiki bulan yang sudah diunggah. */
    cek('laporan tersimpan tetap memakai nama mentah',
        !!u.menu['LARGE (PACKAGE)'], JSON.stringify(Object.keys(u.menu)));

    /* Saran tidak boleh menawarkan baris paket itu sendiri — memetakan kode ke
       namanya sendiri tidak memindahkan porsi ke mana pun, dan yang menekan
       tombolnya mengira sudah selesai. */
    const saran = w.eval('saranKode')('MATCHA02', Object.keys(NM.gab).concat(['REGULAR (PACKAGE) · MATCHA02']));
    cek('saran kode tidak menawarkan baris paket', saran.utama.every(x => x.indexOf('(PACKAGE)') < 0),
        JSON.stringify(saran));
    cek('saran kode menemukan menu yang mirip', saran.utama.indexOf('MATCHA LATTE') > -1, JSON.stringify(saran));

    /* ---- SARAN DIJEPIT KE UKURAN BARIS PAKETNYA (10 September 2026,
       permintaan user) ----

       Laporan POS tidak punya satu pun menu yang namanya menyebut ukuran —
       diperiksa atas Agustus 2026, NOL dari 259 menu. Ukurannya cuma hidup di
       nama baris paket dan di kodenya. Jadi selama sarannya cuma diambil dari
       nama menu laporan, kode LARGE tidak akan pernah punya satu pun tombol
       yang benar: yang ditawarkan selalu menu regular, dan menekannya
       meleburkan porsi large ke sana tanpa satu pun tanda. */
    cek('ukuran dibaca dari nama baris paket',
        w.eval("ukuranPaket('LARGE (PACKAGE)')") === 'LARGE'
        && w.eval("ukuranPaket('LARGE KOPI (PACKAGE)')") === 'LARGE'
        && w.eval("ukuranPaket('REGULAR (PACKAGE)')") === 'REGULAR'
        && w.eval("ukuranPaket('MINERAL WATER (PACKAGE)')") === '');
    /* KATA UTUH, bukan potongan — aturan yang sama dengan pbHead() yang
       mencari "Head" dan sengaja menolak "Overhead". */
    cek('kata ukuran dicocokkan utuh',
        w.eval("punyaKataUkuran('LARGE MATCHA LATTE','LARGE')") === true
        && w.eval("punyaKataUkuran('ENLARGED MATCHA','LARGE')") === false);
    const namaGab = Object.keys(NM.gab);
    const sL = w.eval('saranKode')('MATCHA02', namaGab, 'LARGE');
    cek('kode LARGE tidak menawarkan menu regular sebagai pilihan utama',
        sL.utama.length === 0, JSON.stringify(sL));
    /* Jalan keluarnya TETAP ada — tanpa itu kode LARGE tidak punya satu pun
       tombol sampai resepnya dibuat, dan porsinya berdiri sendiri
       berbulan-bulan. Yang berubah: akibatnya dikatakan. */
    cek('...tapi tetap menyediakan jalan gabung ke regular',
        sL.cadangan.indexOf('MATCHA LATTE') > -1, JSON.stringify(sL));
    const sR = w.eval('saranKode')('MATCHA01', namaGab, 'REGULAR');
    cek('kode REGULAR tetap menawarkan menu biasa',
        sR.utama.indexOf('MATCHA LATTE') > -1, JSON.stringify(sR));

    /* Dengan resep ber-kata LARGE di Daftar Resep HPP, kode LARGE
       menawarkannya — dan itulah inti permintaannya. Diuji lewat dom KEDUA
       karena stub HPP disetel saat boot. */
    {
      const { dom: dl } = domAnalytics({ hpp: { resep: [
        { nama:'LARGE MATCHA LATTE', tipe:'dish', yield_qty:1, bahan:[] },
        /* `base` bahan olahan, BUKAN menu yang bisa dijual. Memasangkan kode
           paket ke sana memindahkan porsinya ke sesuatu yang tidak pernah
           muncul di daftar menu mana pun. */
        { nama:'LARGE MATCHA BASE',  tipe:'base', yield_qty:1, bahan:[] }
      ] } });
      await siap(dl.window);
      const s2 = dl.window.eval('saranKode')('MATCHA02', namaGab, 'LARGE');
      cek('resep HPP ber-kata LARGE ditawarkan untuk kode LARGE',
          s2.utama.indexOf('LARGE MATCHA LATTE') > -1, JSON.stringify(s2));
      cek('resep base TIDAK pernah ditawarkan sebagai menu',
          s2.utama.indexOf('LARGE MATCHA BASE') < 0
          && s2.cadangan.indexOf('LARGE MATCHA BASE') < 0, JSON.stringify(s2));
      const s3 = dl.window.eval('saranKode')('MATCHA01', namaGab, 'REGULAR');
      cek('resep LARGE tidak pernah ditawarkan untuk kode REGULAR',
          s3.utama.indexOf('LARGE MATCHA LATTE') < 0, JSON.stringify(s3));
      /* Nama resep HPP ikut ditawarkan di Pengaturan lewat <datalist>, jadi
         yang mengetiknya tidak perlu mengingat ejaannya. Kotaknya TETAP teks
         bebas: menu yang belum punya resep harus tetap bisa dipasangkan. */
      dl.window.go('pengaturan');
      const hp = dl.window.document.getElementById('app-view').innerHTML;
      cek('daftar resep HPP ditawarkan di Pengaturan',
          hp.indexOf('id="pk_resep"') > -1 && hp.indexOf('LARGE MATCHA LATTE') > -1);
      cek('kotak pasangan tetap teks bebas', hp.indexOf('list="pk_resep"') > -1);
      dl.window.close();
    }

    /* ---- KODE MENU DIISI DI HPP (10 September 2026, permintaan user) ----

       "dari di HPP & Resep bisa masukin menu code, jadi kalau misalnya menu
       code-nya ada yg sama brrti menu nya itu nama menu yg di ambil dari hpp
       & resep."

       Pasangannya jadi hidup di tempat yang sama dengan resepnya, dan ukuran
       selesai sendiri: resep large-nya yang memegang kode large. */
    {
      const { dom: dk } = domAnalytics({ hpp: { resep: [
        { nama:'LARGE MATCHA LATTE', tipe:'dish', kode:'MATCHA02', yield_qty:1, bahan:[] },
        /* Sengaja ditulis Title Case seperti orang mengetiknya di HPP, dan
           sengaja bernama SAMA dengan menu yang sudah ada di laporan POS
           ("MATCHA LATTE") — itu bentuk yang melahirkan baris ganda. */
        { nama:'Matcha Latte',       tipe:'dish', kode:'matcha01', yield_qty:1, bahan:[] },
        /* `base` tidak pernah dijual, jadi ia tidak bisa jadi tujuan sebuah
           baris paket — porsinya akan pindah ke sesuatu yang tidak pernah
           muncul di daftar menu mana pun. */
        { nama:'MATCHA BASE',        tipe:'base', kode:'MATCHA09', yield_qty:1, bahan:[] }
      ] } });
      await siap(dk.window);
      const wk = dk.window;
      wk.eval('AN.data.setting.petaKode = {}');
      const ph = wk.eval('petaKodeHpp')();
      cek('kode dibaca dari resep HPP', ph.peta['MATCHA02'] === 'LARGE MATCHA LATTE', JSON.stringify(ph.peta));
      /* Kode diketik orang di dua jalur (form & impor Excel), jadi "matcha01"
         dan "MATCHA01" pasti bercampur — dan yang bercampur tidak pernah cocok
         dengan kode dari POS, tanpa satu pun galat. */
      cek('kode dibakukan huruf besar', ph.peta['MATCHA01'] === 'Matcha Latte', JSON.stringify(ph.peta));
      cek('resep base tidak pernah jadi tujuan kode', ph.peta['MATCHA09'] === undefined, JSON.stringify(ph.peta));

      /* Porsi baris paket masuk ke menunya TANPA satu pun daftar pasangan. */
      const NK = wk.eval('menuNormal')(u);
      cek('porsi paket masuk ke resep lewat kodenya',
          !!NK.gab['LARGE MATCHA LATTE'], JSON.stringify(Object.keys(NK.gab)));
      cek('...dan tidak lagi berdiri sebagai baris berkode',
          !NK.gab['LARGE (PACKAGE) · MATCHA02'], JSON.stringify(Object.keys(NK.gab)));
      cek('kode yang sudah dikenali tidak lagi dilaporkan belum dipasangkan',
          NK.takKenal['MATCHA02'] === undefined, JSON.stringify(Object.keys(NK.takKenal)));

      /* ---- NAMA DIBAKUKAN HURUF BESAR (10 September 2026, permintaan user) ----

         Ini SEKALIGUS yang menghapus baris gandanya, dan dua hal itu sebabnya
         satu: POS menulis "MATCHA LATTE", HPP diketik "Matcha Latte". Dikunci
         string persis, satu minuman yang sama berdiri sebagai DUA baris —
         menu terlarisnya terbaca separuh dari yang sebenarnya, dan bahan
         bakunya terpecah dua. Tidak satu pun melempar galat. */
      cek('seluruh nama menu huruf besar',
          Object.keys(NK.gab).every(x => x === x.toUpperCase()),
          JSON.stringify(Object.keys(NK.gab).filter(x => x !== x.toUpperCase())));
      cek('nama resep HPP tidak berdiri sebagai baris kedua',
          !NK.gab['Matcha Latte'], JSON.stringify(Object.keys(NK.gab)));
      /* Porsi dari kodenya MENYATU dengan porsi menu yang sama dari POS —
         angkanya dihitung dari fixture, bukan dipatok, supaya ia ikut benar
         kalau fixture-nya berubah. */
      {
        const dariPos = (u.menu['MATCHA LATTE'] || {}).qty || 0;
        const dariKode = ((u.paket['REGULAR (PACKAGE)'] || {})['MATCHA01'] || {}).qty || 0;
        cek('porsinya menyatu, bukan terpecah dua baris',
            dariKode > 0 && NK.gab['MATCHA LATTE']
            && NK.gab['MATCHA LATTE'].qty === dariPos + dariKode,
            (NK.gab['MATCHA LATTE'] || {}).qty + ' vs ' + dariPos + '+' + dariKode);
      }
      /* Yang beda UKURAN tetap terpisah — dedupe-nya menyatukan nama yang
         sama, bukan menu yang mirip. */
      cek('menu ukuran large tetap barisnya sendiri',
          !!NK.gab['LARGE MATCHA LATTE'], JSON.stringify(Object.keys(NK.gab)));

      /* HPP MENANG atas pasangan manual. Dibalik, mengisi kode di HPP tidak
         mengubah apa pun selama pasangan lamanya masih ada — perubahan yang
         GAGAL DIAM-DIAM, dan yang mengisinya tidak punya satu pun cara tahu
         kenapa. */
      wk.eval("AN.data.setting.petaKode = { MATCHA02:'MATCHA LATTE', ZZZ01:'MENU Z' }");
      cek('kode dari HPP mengalahkan pasangan manual',
          wk.eval("petaKode()['MATCHA02']") === 'LARGE MATCHA LATTE',
          wk.eval("petaKode()['MATCHA02']"));
      /* Daftar manual tidak boleh mati begitu saja — ia tetap berlaku untuk
         kode yang belum diisi di HPP. */
      cek('pasangan manual tetap berlaku untuk kode di luar HPP',
          wk.eval("petaKode()['ZZZ01']") === 'MENU Z');
      cek('bentroknya DISEBUT, bukan didiamkan',
          wk.eval('kodeCatatan()').bentrok.length === 1,
          JSON.stringify(wk.eval('kodeCatatan()').bentrok));
      wk.eval('AN.data.laporan["2026-08"] = ' + JSON.stringify(u));
      wk.go('menu'); await tunggu(60);
      const isiK = wk.document.getElementById('app-view').innerHTML;
      cek('bentrok tergambar di halaman Menu', isiK.indexOf('dua pasangan yang berbeda') > -1);
      dk.window.close();
    }

    /* SATU KODE DIPAKAI DUA RESEP: tidak dipasangkan ke mana pun, dan
       DILAPORKAN. Memilih salah satunya berarti menebak resep mana yang dapat
       porsinya berikut bahan bakunya — dan kedua jawabannya sama-sama terlihat
       wajar, jadi tidak akan pernah dipertanyakan siapa pun. */
    {
      const { dom: dd } = domAnalytics({ hpp: { resep: [
        { nama:'MATCHA A', tipe:'dish', kode:'MATCHA02', yield_qty:1, bahan:[] },
        { nama:'MATCHA B', tipe:'dish', kode:'MATCHA02', yield_qty:1, bahan:[] }
      ] } });
      await siap(dd.window);
      const wd = dd.window;
      wd.eval('AN.data.setting.petaKode = {}');
      cek('kode kembar tidak dipasangkan ke mana pun',
          wd.eval("petaKode()['MATCHA02']") === undefined, wd.eval("String(petaKode()['MATCHA02'])"));
      cek('kode kembar dilaporkan berikut nama resepnya',
          wd.eval("kodeCatatan().dobel['MATCHA02'].length") === 2,
          wd.eval("JSON.stringify(kodeCatatan().dobel)"));
      const ND = wd.eval('menuNormal')(u);
      /* Porsinya TIDAK hilang — ia tetap dihitung, berdiri sebagai barisnya
         sendiri dengan nama yang menyebut kodenya, jadi sebabnya terlihat. */
      cek('porsinya tetap dihitung sebagai barisnya sendiri',
          !!ND.gab['LARGE (PACKAGE) · MATCHA02'], JSON.stringify(Object.keys(ND.gab)));
      wd.eval('AN.data.laporan["2026-08"] = ' + JSON.stringify(u));
      wd.go('menu'); await tunggu(60);
      const isiD = wd.document.getElementById('app-view').innerHTML;
      cek('kode kembar tergambar di halaman Menu', isiD.indexOf('lebih dari satu resep') > -1);
      /* Anjuran mengisi kode di HPP hidup DI DALAM kartu "kode yang belum
         dipasangkan" — ia memang cuma berarti selama masih ada yang belum
         terpasang, jadi diuji di dom yang punya kode belum terpasang. */
      cek('halaman menganjurkan mengisi kode di HPP', isiD.indexOf('Kode menu di POS') > -1);
      dd.window.close();
    }

    /* ---- 2: halaman kategori ---- */
    cek('kategori terbaca dari laporan', Object.keys(u.kategori).length === 6,
        JSON.stringify(Object.keys(u.kategori)));
    cek('EVENT jadi kategorinya sendiri', !!u.kategori['EVENT'] && u.kategori['EVENT'].nilai === 1400000,
        JSON.stringify(u.kategori['EVENT']));
    cek('kelompok atas ikut disimpan', u.kategori['EVENT'].kat === 'FOOD',
        JSON.stringify(u.kategori['EVENT']));
    cek('menu di dalam kategori ikut disimpan',
        !!(u.katMenu['NUSANTARA'] || {})['NASI GORENG']);
    /* Kolomnya tidak diisi di fixture ini, jadi seluruh barisnya jatuh ke
       "(tanpa keterangan)" — yang diuji di sini bukan angkanya melainkan
       bahwa kuncinya IKUT TERSIMPAN lewat daftar kunci tertutup di bawah. */
    cek('metode kunjungan ikut terbaca pengurainya', !!u.kunjung, JSON.stringify(u.kunjung));

    /* ---- PUTARAN SIMPAN, dan inilah yang selama ini tidak pernah dijalankan.
       Seluruh asersi di atas menguji KELUARAN PENGURAINYA (`u`); yang tersimpan
       ditulis anSimpanUnggah() dengan daftar kunci tertutup, dan `paket`,
       `kategori`, `katMenu` tertinggal di sana sejak 4 September 2026. Dua
       fitur karena itu mati lima hari sementara 260 pemeriksaan tetap hijau.

       Uji yang menyuntikkan `u` langsung ke AN.data.laporan melewati persis
       baris yang rusak — dan itu yang dikerjakan blok di bawah ini sebelum
       hari ini. Yang benar: lewat jalur simpannya sendiri. */
    w.eval('AN.data.laporan = {}');
    w.eval('UNGGAH_HASIL = Object.assign({ diunggah:"2026-09-10", oleh:"Uji" }, '
      + JSON.stringify(u) + ')');
    await w.eval('anSimpanUnggah()');
    const simpan = w.eval('AN.data.laporan["2026-08"]');
    cek('putaran simpan menyimpan laporannya', !!simpan);
    /* Ketiganya DIBACA dari laporan tersimpan (menuNormal & halaman Kategori),
       jadi yang hilang di sini mematikan fiturnya tanpa satu pun galat. */
    cek('kategori ikut tersimpan', !!(simpan && simpan.kategori && simpan.kategori['EVENT']),
        JSON.stringify(simpan && Object.keys(simpan)));
    cek('katMenu ikut tersimpan', !!(simpan && simpan.katMenu && simpan.katMenu['NUSANTARA']),
        JSON.stringify(simpan && Object.keys(simpan)));
    cek('paket ikut tersimpan', !!(simpan && simpan.paket && simpan.paket['LARGE (PACKAGE)']),
        JSON.stringify(simpan && Object.keys(simpan)));
    /* DAFTAR KUNCI TERTUTUP di anSimpanUnggah() adalah tempat `paket`,
       `kategori`, dan `katMenu` tertinggal selama lima hari sementara 260
       pemeriksaan tetap hijau. `kunjung` lahir 10 September 2026 dan lewat
       jalur yang sama persis. */
    cek('kunjung ikut tersimpan', !!(simpan && simpan.kunjung),
        JSON.stringify(simpan && Object.keys(simpan)));
    /* Kalau ini merah, penggabungan (PACKAGE) mati untuk laporan yang benar-benar
       tersimpan walau `u` di atas hijau. */
    cek('...jadi penggabungan paket bekerja atas laporan TERSIMPAN',
        !w.eval('menuNormal')(simpan).gab['MINERAL WATER (PACKAGE)']);

    /* ---- KATEGORI ACARA TIDAK IKUT DI MENU & BAHAN BAKU (10 Sep 2026) ----
       DJ PERFORMANCE ada di kategori EVENT: 1 porsi, Rp500.000. */
    const NMs = w.eval('menuNormal')(simpan);
    cek('menu kategori EVENT dikeluarkan dari daftar menu',
        !NMs.gab['DJ PERFORMANCE'], JSON.stringify(Object.keys(NMs.gab)));
    /* ATURAN KEDUA (10 September 2026): seluruh kelompok OTHERS ikut keluar.
       ROKOK bukan kategori EVENT, jadi penyaring yang cuma memeriksa EVENT
       akan meloloskannya — dan barisnya lalu berdiri di daftar "belum ada
       resep" selamanya. */
    cek('seluruh kelompok OTHERS ikut dikeluarkan, bukan cuma EVENT',
        !NMs.gab['ROKOK SAMPOERNA'], JSON.stringify(Object.keys(NMs.gab)));
    /* PRASMANAN keluar lewat aturan EVENT (kelompoknya FOOD), ROKOK lewat
       aturan OTHERS, DJ PERFORMANCE kena keduanya. Mencabut salah satu aturan
       karena itu selalu ada yang bocor. */
    cek('menu EVENT yang kelompoknya BUKAN Others tetap dikeluarkan',
        !NMs.gab['PRASMANAN'], JSON.stringify(Object.keys(NMs.gab)));
    cek('...dan yang dikeluarkan dihitung, bukan dibuang',
        NMs.ev.qty === 6 && NMs.ev.nilai === 1460000 && NMs.ev.nama.length === 3,
        JSON.stringify(NMs.ev));
    /* FOOD & BEVERAGES tidak boleh ikut terbawa. */
    cek('kelompok lain tidak ikut terkena',
        !!NMs.gab['NASI GORENG'] && !!NMs.gab['MATCHA LATTE'], JSON.stringify(Object.keys(NMs.gab)));
    /* Sama persis, BUKAN awalan: 'OTHERS LAIN' berawalan sama tapi kelompok
       yang berbeda, dan awalan akan menelannya tanpa satu pun tanda. */
    cek('penentu kelompoknya tanpa peduli huruf besar & spasi',
        w.eval("kelLewatKah(' others ')") === true && w.eval("kelLewatKah('OTHER')") === false);
    cek('...dan sama persis, bukan awalan',
        w.eval("kelLewatKah('OTHERS LAIN')") === false);
    cek('...begitu juga penentu kategori acaranya',
        w.eval("katEventKah('EVENT LAIN')") === false);
    /* Nama kategorinya diketik di POS, jadi 'Event' dan 'EVENT ' pasti
       bercampur. Yang tidak cocok tidak melempar apa pun — ia cuma diam-diam
       ikut lagi ke perkiraan bahan baku. */
    cek('cocoknya tanpa peduli huruf besar & spasi',
        w.eval("katEventKah(' event ')") === true && w.eval("katEventKah('EVENTS')") === false);
    /* Laporan lama tidak punya katMenu — tidak ada yang bisa dikeluarkan, dan
       menebak dari NAMA menunya berarti membuang menu biasa yang kebetulan
       bernama mirip. */
    cek('laporan tanpa katMenu tidak mengeluarkan apa pun',
        w.eval('menuNormal')({ menu: simpan.menu }).ev.nama.length === 0);

    /* Peta kode dikosongkan lagi supaya kartu 'Kode paket yang belum
       dipasangkan' punya isi — dengan seluruh kode sudah dipetakan, kartunya
       memang tidak digambar, dan asersi di bawah akan merah untuk kode yang
       benar. */
    w.eval('AN.data.setting.petaKode = {}');
    w.go('menu'); await tunggu(60);
    const vm = d.getElementById('app-view').innerHTML;
    /* KEDUA PITA ℹ DICABUT 10 September 2026 (permintaan user), sehari sesudah
       yang pertama dipasang. Yang dijaga sekarang KETIADAANNYA — asersi lama
       justru akan menahannya tetap ada. */
    cek('pita "yang tidak ikut" sudah dicabut',
        vm.indexOf('tidak ikut di halaman ini') < 0);
    cek('pita "porsi paket sudah digabung" sudah dicabut',
        vm.indexOf('sudah digabung') < 0);
    /* Penggabungannya sendiri TETAP berjalan — yang dicabut cuma
       keterangannya, dan angkanya yang membuktikannya masih dihitung. */
    /* ANGKANYA DIPATOK, bukan cuma "lebih dari nol".

       `digabung` sekarang menghitung paket BERNAMA saja (MINERAL WATER
       (PACKAGE) 3). Baris UKURAN tidak lagi ikut di sini karena ia memang
       tidak digabungkan ke mana pun — ia DIPINDAHKAN, dan itu dihitung
       terpisah di ukTotal. Dulu angkanya 9 (3 + MATCHA02 4 + MATCHA01 2),
       dan 4+2 itulah porsi yang ternyata dihitung dua kali. */
    cek('...tapi penggabungannya tetap berjalan', NMs.digabung === 3, String(NMs.digabung));
    cek('...dan porsi ukuran dihitung terpisah, bukan sebagai penggabungan',
        NMs.ukTotal.pindah === 3 && NMs.ukTotal.sendiri === 8,
        JSON.stringify(NMs.ukTotal));
    /* Kartu "Kode paket yang belum dipasangkan" BUKAN keterangan melainkan
       pekerjaan yang menunggu, jadi ia tidak ikut dicabut. */
    cek('kartu kode paket yang belum dipasangkan TIDAK ikut dicabut',
        vm.indexOf('Kode paket yang belum dipasangkan') > -1);
    cek('menu yang dikeluarkan tidak lagi dihitung sebagai belum ada resep',
        vm.indexOf('DJ PERFORMANCE</b>') < 0 && vm.indexOf('ROKOK SAMPOERNA</b>') < 0);

    /* ---- PENCARIAN DI TIGA DAFTAR (permintaan user 10 September 2026) ----
       Yang paling menentukan BUKAN adanya kotaknya melainkan bahwa mengetik
       tidak membuat ulang kotaknya: render() di modul ini TOTAL, dan kotak
       yang dibuat ulang kehilangan fokus sehingga hanya huruf pertama yang
       masuk. Karena itu yang diperiksa IDENTITAS elemennya. */
    cek('tiga kotak cari digambar',
        !!d.getElementById('mn_q') && !!d.getElementById('mn_qb') && !!d.getElementById('mn_qr'));
    {
      const kotak = d.getElementById('mn_q');
      kotak.value = 'nasi';
      kotak.dispatchEvent(new w.Event('input', { bubbles:true }));
      await tunggu(30);
      cek('kotak yang sedang diketik TIDAK dibuat ulang',
          d.getElementById('mn_q') === kotak && kotak.value === 'nasi',
          'kotaknya diganti elemen baru — hanya huruf pertama yang akan masuk');
      const isi = d.getElementById('mn_isi_menu').innerHTML;
      cek('...dan tabelnya tersaring', isi.indexOf('NASI GORENG') > -1 && isi.indexOf('MATCHA LATTE') < 0,
          isi.slice(0, 400));
      cek('...kakinya menyebut berapa yang cocok', isi.indexOf('cocok dengan') > -1);
      /* Kata kunci yang tidak cocok dengan apa pun harus DIKATAKAN — tabel
         kosong tanpa keterangan terbaca sebagai data yang hilang. */
      kotak.value = 'zzz';
      kotak.dispatchEvent(new w.Event('input', { bubbles:true }));
      await tunggu(30);
      cek('kata kunci tanpa hasil dikatakan, bukan tabel kosong',
          d.getElementById('mn_isi_menu').innerHTML.indexOf('Tidak ada menu yang namanya memuat') > -1);
      kotak.value = '';
      kotak.dispatchEvent(new w.Event('input', { bubbles:true }));
      await tunggu(30);
    }
    /* RESET HALAMAN SAAT MENCARI diuji di blok pagination, bukan di sini:
       fixture ini cuma punya beberapa menu, jadi hasil pencarian apa pun
       selalu muat di satu halaman dan PENJEPIT RENTANG-nya menutupi resetnya.
       Asersi di sini akan hijau apa pun keputusan kodenya. */
    {
      const kb = d.getElementById('mn_qb');
      kb.value = 'zzz';
      kb.dispatchEvent(new w.Event('input', { bubbles:true }));
      await tunggu(30);
      cek('cari bahan menyaring daftarnya sendiri',
          d.getElementById('mn_isi_bahan').innerHTML.indexOf('Tidak ada bahan yang namanya memuat') > -1,
          d.getElementById('mn_isi_bahan').innerHTML.slice(0, 300));
      /* Kata kunci yang COCOK harus menyisakan yang cocok saja — tanpa ini,
         penyaring yang tidak menyaring apa pun tetap lulus selama daftarnya
         kebetulan kosong. */
      kb.value = 'beras';
      kb.dispatchEvent(new w.Event('input', { bubbles:true }));
      await tunggu(30);
      {
        const ib = d.getElementById('mn_isi_bahan').innerHTML;
        cek('...dan menyisakan yang cocok saja',
            ib.indexOf('BERAS') > -1 && ib.indexOf('TELUR') < 0, ib.slice(0, 300));
      }
      cek('...dan tabel menu di atasnya TIDAK ikut tersaring',
          d.getElementById('mn_isi_menu').innerHTML.indexOf('NASI GORENG') > -1,
          'tiga daftar menjawab tiga pertanyaan; satu kotak untuk ketiganya memangkas yang lain');
      kb.value = ''; kb.dispatchEvent(new w.Event('input', { bubbles:true })); await tunggu(30);
    }

    w.eval('AN.data.laporan = null');
    w.eval('AN.data.laporan = {}');
    w.eval('AN.data.laporan["2026-08"] = ' + JSON.stringify(u));
    w.eval("BLN='2026-08'");
    w.go('kategori'); await tunggu(60);
    const v = d.getElementById('app-view').innerHTML;
    cek('halaman Kategori Menu tergambar', v.indexOf('Per Kategori') > -1, v.slice(0, 300));
    cek('EVENT tampil di halamannya sendiri', v.indexOf('EVENT') > -1);
    cek('...berikut kelompok atasnya', v.indexOf('OTHERS') > -1);
    /* Kategori TERPISAH dari peringkat menu — itu inti permintaannya. */
    cek('halaman kategori tidak memuat tabel peringkat menu',
        v.indexOf('<h3>Penjualan Menu</h3>') < 0 && v.indexOf('Perkiraan Bahan Baku') < 0,
        v.slice(0, 300));
    cek('...tapi tetap menunjuk ke sana supaya angkanya bisa dibandingkan',
        v.indexOf('Penjualan Menu') > -1);
    cek('persentasenya dihitung dari total omset menu', /% omset menu/.test(v));
    /* ---- JUMLAH MENU PER KATEGORI (permintaan user 10 September 2026) ----
       Dihitung dari katMenu, bukan disimpan tersendiri: kolom yang tidak cocok
       dengan daftar yang muncul saat barisnya dibuka berhenti dipercaya. */
    cek('kolom Jumlah Menu digambar', v.indexOf('>Jumlah Menu<') > -1);
    /* DIBACA DARI SELNYA, bukan dihitung ulang di dalam uji: asersi yang
       menghitung sendiri dari fixture lalu membandingkannya dengan hitungannya
       sendiri lulus juga untuk kolom yang selalu menulis angka yang sama.
       Sel Jumlah Menu adalah `td.num` PERTAMA sesudah nama kategorinya. */
    const selJml = (html, nama) => {
      const i = html.indexOf('<b>' + nama + '</b>');
      if (i < 0) return null;
      const tr = html.slice(i, html.indexOf('</tr>', i));
      const m = tr.match(/<td class="num">([\s\S]*?)<\/td>/);
      return m ? m[1].replace(/<[^>]*>/g, '').trim() : null;
    };
    /* NUSANTARA berisi satu menu, SIGNATURE NON COFFEE berisi empat —
       angkanya HARUS berbeda, kalau tidak kolom yang menulis angka mati pun
       akan lulus. */
    cek('...jumlahnya dibaca dari isi kategorinya',
        selJml(v, 'NUSANTARA') === '1' && selJml(v, 'SIGNATURE NON COFFEE') === '4',
        JSON.stringify([selJml(v, 'NUSANTARA'), selJml(v, 'SIGNATURE NON COFFEE')]));
    /* Kategori acara dibuka SENDIRI — yang dicari orang di halaman ini nama
       menunya (Prasmanan, Nasi Kotak, Snack Box), bukan totalnya. */
    cek('kategori EVENT terbuka sendiri berikut nama menunya',
        w.eval('KT_BUKA') === 'EVENT' && v.indexOf('DJ PERFORMANCE') > -1,
        'KT_BUKA=' + JSON.stringify(w.eval('KT_BUKA')));
    cek('...dan barisnya menyebut kenapa ia tidak ada di Menu & Bahan Baku',
        v.indexOf('tidak ikut di Menu') > -1);
    /* Yang sudah menutupnya tidak boleh dibukakan lagi tiap render — `null`
       (belum disentuh) dan `''` (sengaja ditutup) memang dua keadaan berbeda. */
    w.eval("ktBuka('EVENT')"); w.go('kategori'); await tunggu(60);
    cek('...tapi yang sudah ditutup tidak dibuka lagi', w.eval('KT_BUKA') === '');
    /* Laporan yang diunggah sebelum katMenu ikut disimpan tidak punya isi
       kategori sama sekali. Kolomnya lalu berbunyi \u2014, BUKAN 0: nol berarti
       kategori itu memang tidak punya menu, dan itu jawaban yang salah untuk
       pertanyaan yang tidak pernah ditanyakan. */
    w.eval('delete AN.data.laporan["2026-08"].katMenu');
    w.go('kategori'); await tunggu(60);
    {
      const vk = d.getElementById('app-view').innerHTML;
      const sel = selJml(vk, 'NUSANTARA');
      cek('laporan tanpa katMenu menulis tanda hubung, bukan 0',
          sel === '\u2014', JSON.stringify(sel));
    }
    w.eval('AN.data.laporan["2026-08"].katMenu = ' + JSON.stringify(u.katMenu));
    /* Baris kategori bisa dibuka untuk melihat isinya. */
    w.eval("ktBuka('NUSANTARA')"); await tunggu(60);
    const v2 = d.getElementById('app-view').innerHTML;
    cek('isi kategori bisa dibuka', v2.indexOf('NASI GORENG') > -1,
        v2.slice(v2.indexOf('menu di kategori') - 100, v2.indexOf('menu di kategori') + 300));
    w.eval("ktBuka('NUSANTARA')"); await tunggu(60);
    cek('menekan lagi menutupnya', w.eval('KT_BUKA') === '');

    /* Laporan LAMA tidak punya kategori — halamannya harus MENGATAKAN sebabnya
       dan cara membetulkannya, bukan menggambar tabel kosong. */
    w.eval('delete AN.data.laporan["2026-08"].kategori');
    w.go('kategori'); await tunggu(60);
    const v3 = d.getElementById('app-view').innerHTML;
    cek('laporan tanpa kategori mengatakan sebabnya',
        /belum memuat kategori menu/.test(v3) && /Unggah ulang/.test(v3), v3.slice(0, 400));
    dom.window.close();
  }

  /* ================= 5. Bill Report: halaman menu mengatakan apa yang kurang === */
  console.log('\n== Bill Report: menu memang tidak ada ==');
  {
    const an = { data:{ laporan:{ '2026-08': {
      diunggah:'2026-08-28', oleh:'W', berkas:'x.xlsx', jenis:'bill',
      hari:{ '2026-08-01':{ bill:10, grand:1000000 } },
      jam:Array.from({length:24},()=>({bill:0,grand:0})), menu:{},
      ringkas:{ bill:10, grand:1000000, net:900000, svc:50000, tax:50000 }
    } }, setting:{} }, akses:{}, peran:{} };
    const { dom } = domAnalytics({ an });
    await siap(dom.window);
    const w = dom.window, d = w.document;
    w.go('menu'); await tunggu(60);
    const v = d.getElementById('app-view').innerHTML;
    /* Tabel kosong terbaca sebagai "tidak ada yang terjual" — jawaban yang
       salah untuk pertanyaan yang tidak pernah ditanyakan. */
    cek('tidak menggambar tabel menu kosong', v.indexOf('Menu Terlaris') < 0);
    cek('mengatakan laporannya tidak memuat menu', v.indexOf('tidak memuat nama menu') > -1);
    cek('menyebut apa yang harus diunggah', v.indexOf('Menu Report') > -1);
    cek('menunjuk di mana menggantinya', v.indexOf('Sales Report Type') > -1);
    dom.window.close();
  }

  /* ================= 6. hari & shift ================= */
  console.log('\n== Hari & jam ==');
  {
    const jam = Array.from({ length: 24 }, () => ({ bill:0, grand:0 }));
    jam[11] = { bill:10, grand:1000000 };     // siang
    jam[20] = { bill:30, grand:9000000 };     // malam
    jam[2]  = { bill:2,  grand:200000  };     // di luar keduanya
    const hari = {};
    /* Agustus 2026: 1 Agu = Sabtu. Dua Sabtu besar, sisanya kecil. */
    ['2026-08-01','2026-08-08'].forEach(t => hari[t] = { bill:40, grand:9000000 });
    ['2026-08-03','2026-08-10'].forEach(t => hari[t] = { bill:10, grand:1000000 });
    const an = { data:{ laporan:{ '2026-08': {
      diunggah:'2026-08-28', oleh:'W', berkas:'x.xlsx', jenis:'bill',
      hari, jam, menu:{},
      ringkas:{ bill:100, grand:20000000, net:18000000, svc:1000000, tax:1000000 }
    } }, setting:{} }, akses:{}, peran:{} };
    const { dom } = domAnalytics({ an });
    await siap(dom.window);
    const w = dom.window, d = w.document;
    w.go('hari'); await tunggu(60);
    const v = d.getElementById('app-view').innerHTML;

    cek('tabel hari dalam seminggu tergambar', v.indexOf('Omset per Hari dalam Seminggu') > -1);
    /* DUA KOLOM, DUA PERTANYAAN (6 September 2026, permintaan user).
       Rata-rata membandingkan hari mana yang lebih ramai; Kontribusi menjawab
       dari mana omset bulan itu datang, dan itu memang dihitung dari JUMLAH.
       Card-sub WAJIB mengatakan bedanya — tanpa itu kolom Kontribusi dibaca
       sebagai pembanding keramaian, dan bulan dengan lima Sabtu akan selalu
       memenangkan Sabtu tanpa satu pun tanda bahwa sebabnya jumlah hari.

       Yang diperiksa MAKNANYA, bukan satu kalimat persis: asersi yang
       mencocokkan kalimat akan gagal tiap kali kata-katanya dirapikan, dan
       uji yang gagal karena hal yang bukan salah akan dimatikan orang. */
    cek('kolom Rata-rata omset dan Kontribusi dua-duanya ada',
        v.indexOf('Rata-rata omset') > -1 && v.indexOf('Kontribusi') > -1);
    cek('bedanya dua kolom itu dikatakan di layar',
        v.indexOf('lima Sabtu dan empat Senin') > -1 && v.indexOf('dihitung dari JUMLAH') > -1);
    cek('Sabtu rata-rata 9jt', v.indexOf('Rp9.000.000') > -1, v.slice(v.indexOf('Sabtu') - 20, v.indexOf('Sabtu') + 260));
    cek('Senin rata-rata 1jt', v.indexOf('Rp1.000.000') > -1);
    cek('urutannya mulai Senin', v.indexOf('>Senin<') < v.indexOf('>Minggu<'));

    cek('dua shift tergambar', v.indexOf('10:00–18:00') > -1 && v.indexOf('18:00–00:00') > -1, v.slice(0, 200));
    cek('omset siang 1jt', /Siang[\s\S]{0,200}Rp1\.000\.000/.test(v));
    cek('omset malam 9jt', /Malam[\s\S]{0,200}Rp9\.000\.000/.test(v));
    /* Jam di luar kedua shift TIDAK disembunyikan: kalau dibuang, jumlah kedua
       shift tidak sama dengan total di Ringkasan dan yang menjumlahkannya akan
       mengira salah satu halaman salah. */
    cek('jam di luar shift tetap dihitung', v.indexOf('Di luar keduanya') > -1);
    cek('yang di luar shift disebut nilainya', /Di luar keduanya[\s\S]{0,200}Rp200\.000/.test(v));

    /* Batas shift DISETEL, bukan dikunci. */
    w.eval('AN.data.setting.shift = { s1a:10, s1b:21, s2a:21, s2b:24 }');
    w.go('hari'); await tunggu(60);
    const v2 = d.getElementById('app-view').innerHTML;
    cek('batas shift dari pengaturan dipakai', v2.indexOf('10:00–21:00') > -1, v2.slice(0, 200));
    /* Jam 20 sekarang masuk siang, jadi 9jt-nya ikut pindah ke sana. Kalau
       tidak, setelan jamnya cuma mengubah judul kolom tanpa menghitung apa pun.
       Percobaan sebelumnya memakai 8-12/12-24 yang kebetulan membagi persis
       sama seperti bawaannya — ujinya lulus tanpa membuktikan apa pun. */
    cek('omset ikut pindah shift', v2.indexOf('Rp10.000.000') > -1,
        v2.slice(Math.max(0, v2.indexOf('Siang') - 20), v2.indexOf('Siang') + 300));

    /* Shift yang melewati tengah malam. Perbandingan lurus a<=j&&j<b
       memulangkan kosong untuk seluruh shift semacam ini, dan omset malamnya
       menghilang tanpa satu pun galat. */
    w.eval('AN.data.setting.shift = { s1a:10, s1b:18, s2a:18, s2b:4 }');
    w.go('hari'); await tunggu(60);
    const v3 = d.getElementById('app-view').innerHTML;
    cek('shift lewat tengah malam menangkap jam 02',
        /Malam[\s\S]{0,220}Rp9\.200\.000/.test(v3),
        v3.slice(v3.indexOf('Malam') - 20, v3.indexOf('Malam') + 240));
    dom.window.close();
  }

  /* ================= 7. pengaruh event ================= */
  console.log('\n== Pengaruh Event & Marketing (dipisah) ==');
  {
    const hari = {};
    /* Sabtu berevent 12jt, Sabtu biasa 9jt, Senin biasa 1jt. Kalau
       pembandingnya rata-rata SELURUH hari (5jt), event terlihat naik 140% —
       padahal dibanding Sabtu biasa cuma 33%. Itulah kesalahan yang dijaga. */
    hari['2026-08-01'] = { bill:40, grand:12000000 };   // Sabtu, ada event
    hari['2026-08-08'] = { bill:40, grand:9000000  };   // Sabtu, tanpa event
    hari['2026-08-03'] = { bill:10, grand:1000000  };   // Senin
    hari['2026-08-10'] = { bill:10, grand:1000000  };   // Senin
    const an = { data:{ laporan:{ '2026-08': {
      diunggah:'2026-08-28', oleh:'W', berkas:'x.xlsx', jenis:'bill',
      hari, jam:Array.from({length:24},()=>({bill:0,grand:0})), menu:{},
      ringkas:{ bill:100, grand:23000000 }
    } }, setting:{} }, akses:{}, peran:{} };
    /* Baris Breakdown Sumber: inilah "omset event saja". Tax & service ikut,
       dan SATU baris sengaja punya Open Bill supaya jalur pbObTotal() benar-
       benar dijalankan — tanpa itu, angkanya tetap benar walau Open Bill
       diam-diam tidak ikut dihitung.

       3 Agustus SENGAJA tidak diberi baris: hari yang belum diisi finance
       harus dibedakan dari hari yang nilainya nol. */
    const kp = { daily:[
      { date:'2026-08-01', bd:{
          event:[{ eventName:'Live Music Agustusan', amount:5000000, tax:500000, service:250000,
                   ob:1, obAmount:200000, obTax:0, obService:0 }],
          marketing:[{ eventName:'Promo Merdeka', amount:3000000 },
                     { eventName:'Gathering Korporat', amount:19000000 }] } }
    ] };
    const { dom } = domAnalytics({ an, kp,
      event: [{ start_datetime:'2026-08-01 19:00', title:'Live Music Agustusan', category:'Live Music' },
              { start_datetime:'2026-08-03 19:00', title:'Akustik Senin',        category:'Live Music' }],
      mkt:   [{ tanggal:'2026-08-01', nama:'Promo Merdeka', jenis:'Promo' }] });
    await siap(dom.window);
    const w = dom.window, d = w.document;

    /* ---- Halaman Event: HANYA acara modul Event ---- */
    w.go('event'); await tunggu(60);
    let v = d.getElementById('app-view').innerHTML;
    cek('acara dari modul Event terbaca', v.indexOf('Live Music Agustusan') > -1);
    /* Inilah gunanya dipisah: acara Marketing TIDAK ikut mengotori halaman
       Event. Kalau ikut, memisahkannya tidak berarti apa-apa. */
    cek('acara Marketing TIDAK ikut di halaman Event', v.indexOf('Promo Merdeka') < 0);

    /* ---- Halaman Marketing: kebalikannya ---- */
    w.go('marketing'); await tunggu(60);
    let m = d.getElementById('app-view').innerHTML;
    cek('acara Marketing terbaca di halamannya sendiri', m.indexOf('Promo Merdeka') > -1);
    cek('acara Event tidak ikut ke halaman Marketing', m.indexOf('Live Music Agustusan') < 0);

    w.go('event'); await tunggu(60);
    v = d.getElementById('app-view').innerHTML;
    /* Satu hari dengan dua acara tetap DIHITUNG SATU HARI — kalau tidak,
       rata-ratanya condong ke hari itu saja. 1 Agu punya acara Event DAN
       Marketing; di halaman Event yang dihitung 2 hari (1 & 3 Agustus). */
    cek('hari dihitung sekali per hari', /Hari ada acara[\s\S]{0,140}>2</.test(v),
        v.slice(Math.max(0, v.indexOf('Hari ada acara') - 40), v.indexOf('Hari ada acara') + 240));
    /* Peringatan sebab-akibat WAJIB ada. Acara ditaruh di akhir pekan, dan
       akhir pekan memang lebih ramai tanpa acara apa pun. */
    cek('mengatakan angkanya bukan bukti sebab-akibat', v.indexOf('bukan bukti sebab-akibat') > -1);
    cek('menyebutkan jumlah harinya', v.indexOf('hari ada acara vs') > -1);
    /* Kepala kolomnya WAJIB menyebut syaratnya. Pertanyaan user 9 September
       2026: kenapa rata-rata hari di sini beda dari halaman Hari & Jam —
       jawabannya di sana SELURUH hari itu, di sini hanya yang TIDAK ada
       acaranya. Syaratnya sudah tertulis di kalimat pengantar tabel sejak awal,
       dan itu tidak cukup: pengantar dibaca sekali, kolomnya tiap baris. */
    cek('dibandingkan dengan hari yang sama', v.indexOf('Rata-rata hari sama') > -1);
    cek('...dan kepala kolomnya menyebut syarat tanpa acara',
        v.indexOf('Rata-rata hari sama tanpa acara') > -1,
        'tanpa ini, dua halaman memajang dua angka berbeda untuk hari yang sama');
    /* 1 Agu (Sabtu) berevent; Sabtu tanpa acara di data uji cuma 8 Agu — satu
       hari. Angka itulah yang membuat bedanya dengan Hari & Jam terbaca
       sendiri, tanpa perlu membuka halaman sebelah. */
    cek('jumlah hari pembandingnya disebut', v.indexOf('1 Sabtu tanpa acara') > -1,
        v.slice(v.indexOf('Rata-rata hari sama'), v.indexOf('Rata-rata hari sama') + 1400));
    cek('sebab bedanya dengan Hari &amp; Jam dikatakan di layar',
        v.indexOf('SENGAJA berbeda dari halaman Hari') > -1,
        'pertanyaan yang lahir dari membandingkan dua layar harus dijawab di salah satunya');
    cek('selisih dihitung terhadap Sabtu biasa, bukan seluruh hari',
        v.indexOf('+33%') > -1, v.slice(v.indexOf('Hari Ada Acara, Satu per Satu'),
                                       v.indexOf('Hari Ada Acara, Satu per Satu') + 900));

    /* ---- KONTRIBUSI OMSET (permintaan user) ----
       1 Agu 12jt dari total 23jt yang punya data harian = 12/23 = 52,2%.
       Penyebutnya total omset BULAN ITU, bukan omset hari berevent saja. */
    cek('kontribusi hari itu terhadap total omset ditulis', v.indexOf('52.2%') > -1,
        v.slice(v.indexOf('Kontribusi'), v.indexOf('Kontribusi') + 400));
    cek('kartu Omset hari itu ada', v.indexOf('Omset hari itu') > -1);

    /* ---------- TANGGAL BER-ZONA (keluhan user 9 September 2026) ----------
       `start_datetime` di modul Event disimpan sebagai INSTANT UTC berakhiran
       Z. Memotong stringnya mentah membuat acara yang mulai lewat tengah malam
       WIB MUNDUR SEHARI — tanggal di halaman ini lalu berbeda dari tanggal
       acara yang sama di modul Event, tanpa satu pun galat.

       Keempatnya diperiksa bersama karena yang berbahaya BUKAN cuma yang
       kurang digeser, tapi juga yang KELEBIHAN digeser: menggeser tanggal
       polos memindahkan tanggal yang tadinya benar ke hari yang salah. */
    const isoCek = (masuk, harap, nama) => { const dp = w.eval('isoDari(' + JSON.stringify(masuk) + ')');
      cek(nama, dp === harap, 'dapat ' + dp + ', harusnya ' + harap); };
    isoCek('2026-08-02T18:00:00.000Z', '2026-08-03', 'UTC lewat tengah malam WIB maju sehari');
    isoCek('2026-08-01T12:00:00.000Z', '2026-08-01', '...yang belum lewat tengah malam tetap di harinya');
    isoCek('2026-08-01',               '2026-08-01', 'tanggal polos TIDAK ikut digeser');
    isoCek('2026-08-03 19:00',         '2026-08-03', 'datetime tanpa zona TIDAK ikut digeser');
    /* ASERSI SUMBER, dan ia WAJIB ada di samping keempat asersi runtime di
       atas. Di mesin berzona WIB keduanya memberi hasil yang SAMA walau
       penjaga zonanya dicabut: menggeser tanggal polos +7 jam tetap jatuh di
       hari yang sama, dan datetime tanpa zona pun diurai sebagai waktu lokal
       +7 lalu digeser +7 kembali ke harinya sendiri.

       Mutasi "penanda zona diabaikan" karena itu LOLOS dari keempat
       pemeriksaan runtime — ia baru merah di laptop yang zonanya lain, yaitu
       tempat yang tidak pernah menjalankan uji ini. Yang benar-benar
       membedakannya syaratnya sendiri: pergeseran hanya boleh untuk string
       yang MENYATAKAN zona, bukan untuk setiap tanggal yang punya jam. */
    cek('pergeseran WIB dijaga penanda zona, bukan sekadar adanya jam',
        HTML_ASLI.indexOf("/(Z|[+-]\\d{2}:?\\d{2})$/.test(s)") > -1,
        'tanpa penjaga ini tanggal polos ikut digeser, dan salahnya cuma muncul di zona lain');

    /* ---------- OMSET EVENT SAJA (permintaan user 9 September 2026) ----------
       Angkanya dibandingkan lewat rp0() milik halamannya sendiri, bukan lewat
       'Rp5.950.000' yang diketik di sini: pemisah ribuan id-ID bergantung ICU
       Node, dan uji yang mematok teksnya akan merah di mesin lain untuk kode
       yang benar. Yang dijaga ANGKANYA, bukan cara menulisnya. */
    const rpH = n => w.eval('rp0(' + n + ')');
    cek('kartu Omset event saja ada', v.indexOf('Omset event saja') > -1);
    /* 5.000.000 + 500.000 + 250.000 + Open Bill 200.000. Kalau Open Bill
       lepas, angkanya 5.750.000 dan asersi ini yang berbunyi. */
    cek('nilainya omset + tax + service + Open Bill', v.indexOf(rpH(5950000)) > -1,
        'Open Bill / tax / service tidak ikut — ' + v.slice(v.indexOf('Omset event saja'), v.indexOf('Omset event saja') + 260));
    /* Hari yang belum diisi finance TIDAK boleh terbaca sebagai Rp0: yang
       pertama berarti angkanya belum diketik, yang kedua berarti acaranya
       memang tidak membawa omset. */
    cek('hari tanpa baris breakdown ditulis belum diisi', v.indexOf('belum diisi') > -1);
    /* Pertanyaan user 9 September 2026: "kontribusinya gimana bisa dapat angka
       segitu?" Kolom bernama "Kontribusi" berdiri tepat di sebelah "Omset
       event saja", jadi terbaca sebagai kontribusi ACARANYA — padahal
       pembilangnya omset SEHARI PENUH. Kepala kolomnya sekarang menyebut
       pembilangnya, dan persentase acaranya sendiri ditulis di kolom acaranya.
       5.950.000 / 23.000.000 = 25,9%. */
    /* Nama kolomnya memuat PENYEBUTNYA. Kolom bernama "Kontribusi" saja sudah
       tiga kali ditanyakan user karena penyebutnya harus ditebak. */
    cek('kepala kolom menyebut penyebutnya', v.indexOf('Kontribusi hari itu') > -1,
        'kolom ini tiga kali ditanyakan user karena penyebutnya harus ditebak');
    /* DIIRIS KE TABELNYA DULU. Kartu ringkas di atas halaman memajang kalimat
       yang bentuknya sama persis ('…% dari omset sebulan'), jadi asersi atas
       seluruh halaman COCOK DENGAN KARTU dan tidak pernah menyentuh sel
       tabelnya — versi pertama asersi ini memang hampa karena itu, dan tetap
       hijau waktu kalimat di tabelnya diganti seluruhnya.

       Angkanya pun sengaja berbeda antara kartu dan tabel: kartu memakai
       SELURUH hari berevent (5.950.000 / 13.000.000 = 45,8%), baris tabel
       memakai harinya sendiri (5.950.000 / 12.000.000 = 49,6%). Bedanya itu
       yang membuat asersinya tidak bisa lagi tertukar. */
    const tabelHari = v.slice(v.indexOf('Hari Ada Acara, Satu per Satu'));
    /* 5.950.000 / 12.000.000 = 49,6% — porsi acara terhadap HARI ITU, yang
       sekarang berdiri di kolomnya sendiri. */
    cek('kolom Kontribusi hari itu memakai omset hari itu sebagai penyebut',
        tabelHari.indexOf('49.6%') > -1, tabelHari.slice(0, 1200));
    /* Penyebutnya IKUT DI SELNYA. Kepala kolom cuma terbaca sekali, angkanya
       dibaca tiap kali — dan dua putaran pertanyaan user lahir persis dari
       kolom yang penyebutnya harus ditebak. */
    cek('...dan selnya membawa penyebutnya sendiri',
        tabelHari.indexOf('dari omset hari itu') > -1, tabelHari.slice(0, 1200));
    /* Diiris ke tabelnya dulu: kartu ringkas di atas memajang kalimat yang
       bentuknya sama persis, dan asersi atas seluruh halaman akan cocok dengan
       KARTU tanpa pernah menyentuh sel tabelnya. */
    cek('rupiahnya masing-masing membawa porsi bulanannya',
        tabelHari.indexOf('52.2% dari omset sebulan') > -1
        && tabelHari.indexOf('25.9% dari omset sebulan') > -1,
        tabelHari.slice(0, 1200));

    /* ---------- TOP 3, menggantikan kartu pembanding kasar ---------- */
    cek('kartu pembanding kasar sudah tidak digambar',
        v.indexOf('pembanding kasar') < 0 && v.indexOf('Beda rata-rata') < 0,
        'kartu yang dicabut 9 September 2026 kembali');
    cek('kartu Top 3 digambar', v.indexOf('Penyumbang Omset Terbesar') > -1);
    const top3 = t => t.slice(t.indexOf('Penyumbang Omset Terbesar'),
                             t.indexOf('Penyumbang Omset Terbesar') + 1600);
    /* Divisi Breakdown-nya WAJIB ikut sumbernya. Kalau tertukar, halaman Event
       memajang omset Marketing dengan angka yang tetap kelihatan wajar. */
    cek('Top 3 halaman Event membaca bd.event',
        top3(v).indexOf('Live Music Agustusan') > -1 && top3(v).indexOf('Promo Merdeka') < 0,
        top3(v).slice(0, 500));

    w.go('marketing'); await tunggu(60);
    const vm = d.getElementById('app-view').innerHTML;
    cek('Top 3 halaman Marketing membaca bd.marketing',
        top3(vm).indexOf('Promo Merdeka') > -1 && top3(vm).indexOf('Live Music Agustusan') < 0,
        top3(vm).slice(0, 500));
    cek('...dengan angkanya sendiri', vm.indexOf(rpH(3000000)) > -1);
    /* 23.000.000 nilai acara / 12.000.000 omset hari = 191,7%. TIDAK dijepit ke
       100%: dijepit, selisih antara angka finance dan angka POS hilang tanpa
       satu pun tanda — padahal justru selisih itu yang perlu dilihat. */
    const tabelM = vm.slice(vm.indexOf('Hari Ada Acara, Satu per Satu'));
    cek('porsi acara boleh lewat 100% dan tidak dijepit',
        tabelM.indexOf('183.3%') > -1 && tabelM.indexOf('100.0%') < 0,
        tabelM.slice(0, 1200));
    dom.window.close();
  }

  /* ================= 7c. tanggal ber-zona sampai ke layar ================= */
  console.log('\n== Acara lewat tengah malam WIB ==');
  {
    /* Uji satuan isoDari saja tidak cukup: yang dilaporkan user bukan nilai
       kembalian sebuah fungsi melainkan acara yang muncul di tanggal yang
       salah. Kalau bug-nya kembali, acaranya jatuh ke 2 Agustus yang TIDAK
       punya data POS — halamannya lalu berbunyi "tidak ada acara" dan
       acaranya hilang sama sekali, bukan cuma bergeser. */
    const hari = { '2026-08-03': { bill:40, grand:5000000 },
                   '2026-08-04': { bill:10, grand:1000000 } };
    const an = { data:{ laporan:{ '2026-08': {
      diunggah:'2026-08-28', oleh:'W', berkas:'x.xlsx', jenis:'bill',
      hari, jam:Array.from({length:24},()=>({bill:0,grand:0})), menu:{},
      ringkas:{ bill:50, grand:6000000 }
    } }, setting:{} }, akses:{}, peran:{} };
    const { dom } = domAnalytics({ an,
      event: [{ start_datetime:'2026-08-02T18:00:00.000Z', title:'Lewat Tengah Malam', category:'Party' }] });
    await siap(dom.window);
    const w = dom.window, d = w.document;
    w.go('event'); await tunggu(60);
    const v = d.getElementById('app-view').innerHTML;
    cek('acaranya tidak hilang ke hari yang tidak punya data POS',
        v.indexOf('Lewat Tengah Malam') > -1 && v.indexOf('belum ada yang bisa dibandingkan') < 0,
        v.slice(0, 600));
    cek('...dan mendarat di 3 Agustus, bukan 2 Agustus',
        v.indexOf(w.eval("fmtTgl('2026-08-03')")) > -1
        && v.indexOf(w.eval("fmtTgl('2026-08-02')")) < 0,
        v.slice(v.indexOf('Hari Ada Acara'), v.indexOf('Hari Ada Acara') + 700));
    dom.window.close();
  }

  /* ================= 7d. peringkat Top 3 ================= */
  console.log('\n== Top 3 penyumbang omset ==');
  {
    /* TIDAK ada satu pun acara di modul Marketing di sini, dan itu disengaja:
       nama acara sering cuma diketik finance di Breakdown Sumber. Halaman ini
       tetap harus bisa menjawab "acara mana yang membawa omset" — kalau Top 3
       ikut disembunyikan bersama jalan buntu "tidak ada acara", pertanyaan
       yang sudah ada jawabannya dijawab dengan layar kosong. */
    const hari = { '2026-08-01': { bill:40, grand:6000000 },
                   '2026-08-02': { bill:40, grand:4000000 } };
    const an = { data:{ laporan:{ '2026-08': {
      diunggah:'2026-08-28', oleh:'W', berkas:'x.xlsx', jenis:'bill',
      hari, jam:Array.from({length:24},()=>({bill:0,grand:0})), menu:{},
      ringkas:{ bill:80, grand:10000000 }
    } }, setting:{} }, akses:{}, peran:{} };
    /* Acara A tersebar di DUA tanggal dan salah satunya beda huruf besar-kecil
       — kalau tidak dikelompokkan, ia muncul tiga kali sambil masing-masing
       terlihat lebih kecil daripada yang sebenarnya, lalu kalah dari acara
       yang seharusnya di bawahnya. */
    const kp = { daily:[
      { date:'2026-08-01', bd:{ marketing:[
          { eventName:'Acara A', amount:1100000 },
          { eventName:'',        amount:4000000 },
          { eventName:'Acara C', amount:0 } ] } },
      { date:'2026-08-02', bd:{ marketing:[
          { eventName:'Acara A', amount:2500000 },
          { eventName:'acara a', amount:500000  },
          { eventName:'Acara D', amount:900000  },
          { eventName:'Acara E', amount:700000  } ] } }
    ] };
    const { dom } = domAnalytics({ an, kp });
    await siap(dom.window);
    const w = dom.window, d = w.document;
    w.go('marketing'); await tunggu(60);
    const v = d.getElementById('app-view').innerHTML;
    const rpH = n => w.eval('rp0(' + n + ')');

    cek('Top 3 tetap digambar walau tidak ada acara tercatat',
        v.indexOf('Penyumbang Omset Terbesar') > -1, v.slice(0, 500));
    cek('satu acara lintas hari dijumlahkan, bukan dipecah',
        v.indexOf(rpH(4100000)) > -1,
        '1.100.000 + 2.500.000 + 500.000 (beda huruf besar-kecil ikut) = 4.100.000');
    /* Baris tanpa nama TIDAK digabung jadi satu acara besar — tapi jumlahnya
       DISEBUT, karena baris tanpa nama tidak akan pernah bisa dikenali di layar
       mana pun kalau tidak ada yang menyuruh membetulkannya. */
    cek('baris tanpa nama ditandai, bukan disembunyikan',
        v.indexOf('(tanpa nama)') > -1 && v.indexOf('belum punya Nama Event') > -1);
    cek('acara bernilai nol tidak ikut diperingkatkan', v.indexOf('Acara C') < 0,
        'acara Rp0 menyumbang 0% dan cuma mendorong turun yang benar-benar membawa omset');
    cek('yang keempat tidak ditampilkan', v.indexOf('Acara E') < 0);
    cek('...tapi disebut ada berapa, dan angkanya benar',
        v.indexOf('1 acara lain tidak ditampilkan') > -1,
        'daftar yang dipotong tanpa keterangan terbaca sebagai `cuma segitu acaranya`');
    /* Kontribusi dihitung terhadap SELURUH omset bulan itu (10jt), bukan
       terhadap jumlah baris breakdown. 4.100.000 / 10.000.000 = 41,0%. */
    cek('kontribusi dihitung dari total omset sebulan', v.indexOf('41.0%') > -1,
        v.slice(v.indexOf('Penyumbang Omset Terbesar'), v.indexOf('Penyumbang Omset Terbesar') + 1400));
    dom.window.close();
  }

  /* ================= 7b. per kategori ================= */
  console.log('\n== Pengaruh per kategori ==');
  {
    const hari = {
      '2026-08-01': { bill:40, grand:12000000 },   // Sabtu, Live Music
      '2026-08-08': { bill:40, grand:9000000  },   // Sabtu, tanpa acara
      '2026-08-15': { bill:40, grand:6000000  },   // Sabtu, Workshop
      '2026-08-03': { bill:10, grand:1000000  }    // Senin, tanpa acara
    };
    const an = { data:{ laporan:{ '2026-08': {
      diunggah:'2026-08-28', oleh:'W', berkas:'x.xlsx', jenis:'bill',
      hari, jam:Array.from({length:24},()=>({bill:0,grand:0})), menu:{},
      ringkas:{ bill:130, grand:28000000 }
    } }, setting:{} }, akses:{}, peran:{} };
    const { dom } = domAnalytics({ an,
      event: [{ start_datetime:'2026-08-01 19:00', title:'Band A', category:'Live Music' },
              { start_datetime:'2026-08-15 19:00', title:'Kelas Kopi', category:'Workshop' },
              { start_datetime:'2026-08-01 21:00', title:'Tanpa Label' }] });
    await siap(dom.window);
    const w = dom.window, d = w.document;
    w.go('event'); await tunggu(60);
    const v = d.getElementById('app-view').innerHTML;

    cek('tabel per kategori digambar', v.indexOf('Per Kategori') > -1);
    cek('kategori dari modul Event terbaca', v.indexOf('Live Music') > -1 && v.indexOf('Workshop') > -1);
    /* Acara tanpa kategori TIDAK dibuang dan tidak dijatuhkan ke kategori
       pertama: ia diberi nama sendiri. Kalau dibuang, jumlah kategori tidak
       akan pernah sama dengan totalnya. */
    cek('acara tanpa kategori diberi nama sendiri', v.indexOf('(tanpa kategori)') > -1);

    /* Kontribusi Live Music: 12jt dari 28jt = 42,9%.
       Workshop: 6jt dari 28jt = 21,4%. Penyebutnya SAMA untuk keduanya. */
    cek('kontribusi tiap kategori dihitung dari total bulan',
        v.indexOf('42.9%') > -1 && v.indexOf('21.4%') > -1,
        v.slice(v.indexOf('Per Kategori'), v.indexOf('Per Kategori') + 1400));

    /* 1 Agustus punya DUA kategori (Live Music & tanpa kategori), jadi hari
       itu ikut dihitung di keduanya dan kolom Omset tidak bisa dijumlahkan.
       Itu HARUS dikatakan — angka yang tidak bisa dijumlahkan tanpa penjelasan
       adalah angka yang berhenti dipercaya. */
    cek('tumpang tindih hari dikatakan', v.indexOf('tidak bisa dijumlahkan') > -1);

    /* Tapis kategori: menekan satu kategori menyaring seluruh halaman. */
    w.katPilih('Event', 'Workshop'); await tunggu(60);
    const vw = d.getElementById('app-view').innerHTML;
    cek('tapis kategori menyaring harinya', /Hari ada acara[\s\S]{0,140}>1</.test(vw),
        vw.slice(Math.max(0, vw.indexOf('Hari ada acara') - 40), vw.indexOf('Hari ada acara') + 240));
    cek('yang tersaring cuma acara kategori itu',
        vw.indexOf('Kelas Kopi') > -1 && vw.indexOf('Band A') < 0);
    /* Angka di tombol kategori dihitung dari SELURUH acara bulan itu, bukan
       dari yang sedang tersaring — kalau ikut, tombol yang tidak dipilih
       selalu menulis nol, dan nol membaca sebagai "tidak ada acaranya". */
    cek('angka di chip kategori tidak jadi nol',
        vw.indexOf('>Live Music <span style="opacity:.7">1 hari</span>') > -1,
        vw.slice(vw.indexOf('Kategori'), vw.indexOf('Kategori') + 700));
    dom.window.close();
  }

  /* ================= 7c. tren bulanan ================= */
  console.log('\n== Tren bulanan ==');
  {
    const bulan = (b, grand, bill, nHari) => {
      const hari = {};
      for (let i = 1; i <= nHari; i++) hari[b + '-' + String(i).padStart(2,'0')] = { bill:1, grand:grand/nHari };
      return { diunggah:'2026-09-01', oleh:'W', berkas:'x.xlsx', jenis:'bill',
               hari, jam:Array.from({length:24},()=>({bill:0,grand:0})), menu:{},
               ringkas:{ bill, grand } };
    };
    const an = { data:{ laporan:{
      '2026-06': bulan('2026-06', 100000000, 1000, 10),
      '2026-07': bulan('2026-07', 150000000, 1200, 10),
      '2026-08': bulan('2026-08', 120000000, 1100, 10)
    }, setting:{} }, akses:{}, peran:{} };
    const { dom } = domAnalytics({ an });
    await siap(dom.window);
    const w = dom.window, d = w.document;
    w.go('tren'); await tunggu(80);
    const v = d.getElementById('app-view').innerHTML;

    cek('halaman tren tergambar', v.indexOf('Total Omset Bulan ke Bulan') > -1);
    cek('ketiga bulan ikut', ['Jun','Jul','Agu'].every(x => v.indexOf(x) > -1));
    /* Agustus 120jt dari Juli 150jt = -20,0%. Tandanya harus ikut: angka
       tanpa tanda membuat turun dan naik terbaca sama. */
    cek('selisih bulan sebelumnya dihitung', v.indexOf('-20.0%') > -1,
        v.slice(v.indexOf('Perbandingan Bulan ke Bulan'), v.indexOf('Perbandingan Bulan ke Bulan') + 1200));
    cek('kartu bulan tertinggi menyebut Juli', /Bulan tertinggi[\s\S]{0,240}Jul/.test(v),
        v.slice(0, 900));
    cek('ada kanvas grafiknya', !!d.getElementById('trenChart'));
    /* Chart.js dimuat dari CDN; di jsdom ia memang tidak ada. Yang WAJIB:
       halamannya tetap menggambar tabelnya dan MENGATAKAN grafiknya gagal —
       grafik yang hilang diam-diam tidak bisa dibedakan dari data yang nol. */
    cek('CDN grafik mati dikatakan, tabelnya tetap ada',
        v.indexOf('Grafik tidak bisa digambar') > -1 && v.indexOf('Perbandingan Bulan ke Bulan') > -1);

    /* Pembanding dua bulan bebas — pertanyaan "Agustus vs Juni" tidak terjawab
       oleh selisih berurutan. */
    cek('pembanding dua bulan ada', v.indexOf('Bandingkan Dua Bulan') > -1);
    w.trenPilih('b', '2026-06'); await tunggu(60);
    const vb = d.getElementById('app-view').innerHTML;
    /* Agustus 120jt vs Juni 100jt = +20,0%. */
    cek('bandingan bebas dihitung benar', vb.indexOf('+20.0%') > -1,
        vb.slice(vb.indexOf('Bandingkan Dua Bulan'), vb.indexOf('Bandingkan Dua Bulan') + 1400));
    dom.window.close();
  }

  /* ================= 7d. baru satu bulan ================= */
  console.log('\n== Tren dengan satu bulan saja ==');
  {
    const an = { data:{ laporan:{ '2026-08': {
      diunggah:'2026-08-28', oleh:'W', berkas:'x.xlsx', jenis:'bill',
      hari:{ '2026-08-01':{ bill:1, grand:100000 } },
      jam:Array.from({length:24},()=>({bill:0,grand:0})), menu:{}, ringkas:{ bill:1, grand:100000 }
    } }, setting:{} }, akses:{}, peran:{} };
    const { dom } = domAnalytics({ an });
    await siap(dom.window);
    const w = dom.window, d = w.document;
    w.go('tren'); await tunggu(60);
    const v = d.getElementById('app-view').innerHTML;
    /* Satu bulan bukan tren. Menggambar grafik satu batang lalu menyebutnya
       "tren" adalah janji yang tidak ditepati; yang dikatakan justru apa yang
       kurang dan bagaimana melengkapinya. */
    cek('satu bulan: dikatakan belum bisa digambar', v.indexOf('Baru satu bulan') > -1);
    cek('dan menunjuk cara melengkapinya', v.indexOf('Unggah Laporan') > -1);
    cek('tidak menggambar grafik menyesatkan', !d.getElementById('trenChart'));
    dom.window.close();
  }

  /* ================= 8. modul agenda mati ================= */
  console.log('\n== Modul lain mati ==');
  {
    const an = { data:{ laporan:{ '2026-08': {
      diunggah:'2026-08-28', oleh:'W', berkas:'x.xlsx', jenis:'menu',
      hari:{ '2026-08-01':{ bill:1, grand:100000 } },
      jam:Array.from({length:24},()=>({bill:0,grand:0})),
      menu:{ 'Kopi':{ qty:1, nilai:20000 } }, ringkas:{ bill:1, grand:100000 }
    } }, setting:{} }, akses:{}, peran:{} };
    const { dom } = domAnalytics({ an, eventGagal:true, mktGagal:true, hppGagal:true, kpGagal:true });
    await siap(dom.window);
    const w = dom.window, d = w.document;
    /* Modul lain yang mati TIDAK boleh mematikan halaman — paling jauh satu
       bagian yang kosong dan mengatakan kenapa. */
    w.go('ringkasan'); await tunggu(40);
    cek('Kompas mati: halaman tetap jalan',
        d.getElementById('app-view').innerHTML.indexOf('Total Penjualan') > -1);
    cek('Kompas mati: dikatakan', d.getElementById('app-view').innerHTML.indexOf('tidak terbaca') > -1);
    w.go('event'); await tunggu(40);
    cek('Event & Marketing mati: dikatakan',
        d.getElementById('app-view').innerHTML.indexOf('tidak menjawab') > -1);
    w.go('menu'); await tunggu(40);
    const v = d.getElementById('app-view').innerHTML;
    cek('HPP mati: menu terlaris tetap terbaca', v.indexOf('KOPI') > -1);
    cek('HPP mati: bahan baku dikatakan tidak bisa dihitung', v.indexOf('Resep dari modul HPP tidak terbaca') > -1);
    dom.window.close();
  }


  /* ================= 8b. Top-N vs seluruh menu, dan dua urutan =============
     25 menu supaya batas 20 baris punya arti, dan satu menu MURAH yang
     terjual PALING BANYAK supaya urutan menurut porsi benar-benar berbeda
     dari urutan menurut nilai. Tanpa keduanya, asersinya tidak menguji apa
     pun — sudah terbukti sekali. */
  console.log('\n== Penjualan menu: halaman 20/50/100 & dua urutan ==');
  {
    const menu = { 'Air Mineral': { qty: 900, nilai: 4500000 } };   // murah, paling laku
    for (let i = 1; i <= 24; i++) {
      menu['Menu ' + String(i).padStart(2, '0')] = { qty: 30 - i, nilai: 20000000 - i * 100000 };
    }
    const an = { data: { laporan: { '2026-08': {
      diunggah: '2026-08-28', oleh: 'Wandi', berkas: 'x.xlsx', jenis: 'menu',
      hari: { '2026-08-01': { bill: 10, grand: 1000000 } },
      jam: Array.from({ length: 24 }, () => ({ bill: 0, grand: 0 })),
      menu,
      ringkas: { bill: 10, grand: 1000000, net: 900000, svc: 0, tax: 0, sub: 900000,
                 discMenu: 0, discBill: 0, discVoucher: 0, pax: 0, billPax: 0 }
    } }, setting: {} }, akses: {}, peran: {} };
    const { dom } = domAnalytics({ an, hpp: { bahan: [], resep: [] } });
    await siap(dom.window);
    const w = dom.window, d = dom.window.document;
    w.go('menu'); await tunggu(60);

    /* Dihitung HANYA di dalam kartu Penjualan Menu. Kartu "Menu yang belum ada
       di HPP" di bawahnya memakai bentuk baris yang sama persis, jadi tanpa
       dibatasi hitungannya jadi 20+25 — dan asersinya menguji hal lain. */
    const baris = () => {
      const v = d.getElementById('app-view').innerHTML;
      const a0 = v.indexOf('Penjualan Menu'), a1 = v.indexOf('Perkiraan Bahan Baku');
      return (v.slice(a0, a1 > a0 ? a1 : undefined).match(/<td><b>[^<]+<\/b>/g) || [])
        .map(x => x.replace(/<[^>]*>/g, ''));
    };

    /* HALAMAN 20/50/100 menggantikan saklar "20 Teratas / Seluruhnya"
       (permintaan user 10 September 2026). Bedanya yang menentukan: yang
       tersembunyi sekarang BISA DICAPAI, bukan cuma disebut jumlahnya. */
    cek('bawaannya 20 baris per halaman', w.eval('MN_PER') === 20 && w.eval('MN_HAL') === 1);
    let v = d.getElementById('app-view').innerHTML;
    cek('halaman 1 menggambar 20 baris', baris().length === 20, String(baris().length));
    cek('kakinya menyebut yang sedang ditampilkan', /Menampilkan 1.{1,8}20 dari 25 menu/.test(v),
        v.slice(v.indexOf('Menampilkan'), v.indexOf('Menampilkan') + 200));
    cek('nomor halaman berikutnya digambar', /mnHal\(2\)/.test(v));

    /* KOTAK CARI HIDUP DI LUAR WADAH TABEL, jadi menekan nomor halaman tidak
       boleh membuatnya ulang: render() penuh membuat ulang seluruh halaman,
       dan yang sedang mengetik kehilangan fokusnya — DAN gulir melompat balik
       ke atas persis saat orang membaca tabel di bawah. Karena itu yang
       diperiksa IDENTITAS elemennya, bukan adanya elemennya. */
    const kotakMn = d.getElementById('mn_q');
    w.eval('mnHal(2)'); await tunggu(60);
    cek('menekan nomor halaman TIDAK membuat ulang kotak cari',
        d.getElementById('mn_q') === kotakMn,
        'wadahnya digambar ulang lewat render() penuh');
    cek('halaman 2 menggambar sisanya', baris().length === 5, String(baris().length));
    v = d.getElementById('mn_isi_menu').innerHTML;
    /* Kolom pertama itu PERINGKAT menu, bukan nomor baris di layar. Dimulai
       ulang tiap halaman, menu ke-21 berdiri sebagai "1" dan halaman 2 terbaca
       seolah punya menu terlarisnya sendiri. */
    cek('nomor peringkatnya melanjutkan, bukan mulai dari 1 lagi',
        v.indexOf('<td>21</td>') > -1 && v.indexOf('<td>1</td>') < 0, v.slice(0, 400));
    cek('...dan kakinya ikut menyebutnya', /Menampilkan 21.{1,8}25 dari 25 menu/.test(v),
        v.slice(v.indexOf('Menampilkan'), v.indexOf('Menampilkan') + 200));

    /* Halaman di luar rentang DIJEPIT, tidak memulangkan tabel kosong. */
    w.eval('mnHal(9)'); await tunggu(60);
    cek('halaman di luar rentang dijepit, bukan tabel kosong',
        w.eval('MN_HAL') === 2 && baris().length === 5, w.eval('MN_HAL') + '/' + baris().length);

    /* 50 per halaman: seluruh 25 menu muat, dan nomor halaman ikut hilang. */
    w.eval('mnPer(50)'); await tunggu(60);
    cek('50 per halaman memuat seluruh 25 menu', baris().length === 25, String(baris().length));
    cek('...dan kembali ke halaman 1', w.eval('MN_HAL') === 1);
    v = d.getElementById('mn_isi_menu').innerHTML;
    cek('...nomor halaman tidak digambar kalau cuma ada satu halaman',
        v.indexOf('mnHal(2)') < 0, v.slice(v.indexOf('Tampilkan'), v.indexOf('Tampilkan') + 400));

    /* Air Mineral: PALING BANYAK porsinya (900), tapi nilainya paling KECIL.
       Menurut nilai ia terakhir; menurut porsi ia pertama. Kalau saklarnya
       tidak bekerja, kedua daftar ini akan sama. */
    cek('menurut NILAI, menu murah ada di paling bawah',
        baris()[24] === 'AIR MINERAL', baris().slice(-3).join(' | '));
    w.eval("mnUrut('qty')"); await tunggu(60);
    cek('menurut PORSI, menu murah naik ke paling atas',
        baris()[0] === 'AIR MINERAL', baris().slice(0, 3).join(' | '));
    /* Dan itu memang dua jawaban yang berbeda — kalau sama, saklarnya tidak
       menjawab pertanyaan apa pun. */
    cek('kedua urutan benar-benar berbeda', baris()[0] !== 'MENU 01' || false);

    /* GANTI URUTAN KEMBALI KE HALAMAN 1: yang diurut ulang SELURUH daftarnya,
       jadi halaman 2 sesudahnya memuat menu yang tidak ada hubungannya dengan
       yang barusan dilihat. Dijepit tidak menolong — halaman 2 memang ada. */
    w.eval('mnPer(20)'); await tunggu(60);
    w.eval('mnHal(2)'); await tunggu(60);
    w.eval("mnUrut('nilai')"); await tunggu(60);
    cek('ganti urutan kembali ke halaman 1',
        w.eval('MN_HAL') === 1 && baris()[0] === 'MENU 01', w.eval('MN_HAL') + ' | ' + baris()[0]);

    /* PENCARIAN MENYAPU SELURUH MENU, bukan halaman yang sedang terbuka:
       "Menu 24" ada di halaman 2, dan mencarinya dari halaman 1 harus tetap
       menemukannya. Penyaring yang jalan SESUDAH pemotongan halaman akan
       memulangkan tabel kosong, dan kosong terbaca sebagai "menunya tidak ada
       bulan ini". */
    {
      const kt = d.getElementById('mn_q');
      kt.value = 'menu 24';
      kt.dispatchEvent(new w.Event('input', { bubbles:true }));
      await tunggu(40);
      cek('mencari dari halaman 1 tetap menemukan menu di halaman 2',
          baris().length === 1 && baris()[0] === 'MENU 24', baris().join(' | '));

      /* MENGETIK KATA KUNCI KEMBALI KE HALAMAN 1, dan itu HARUS diuji dengan
         kata kunci yang hasilnya MASIH lebih dari satu halaman: kalau hasilnya
         muat di satu halaman, MN_HAL jatuh ke 1 karena DIJEPIT dan resetnya
         tidak pernah terbukti ada. "menu" cocok dengan 24 menu = dua halaman,
         jadi halaman 2 tetap sah — dan yang membedakan tinggal barisnya.

         KATA KUNCINYA DIKOSONGKAN DULU. Menekan halaman 2 selagi "menu 24"
         masih terpasang cuma memberi satu halaman, jadi penjepitnya menarik
         MN_HAL balik ke 1 sebelum kata kunci berikutnya diketik — dan
         asersinya lalu hijau apa pun keputusan kodenya. */
      kt.value = ''; kt.dispatchEvent(new w.Event('input', { bubbles:true })); await tunggu(40);
      w.eval('mnHal(2)'); await tunggu(40);
      cek('...dan halaman 2 benar-benar terbuka sebelum kata kuncinya diketik',
          w.eval('MN_HAL') === 2 && baris()[0] === 'MENU 21', w.eval('MN_HAL') + ' | ' + baris()[0]);
      kt.value = 'menu';
      kt.dispatchEvent(new w.Event('input', { bubbles:true }));
      await tunggu(40);
      cek('mengetik kata kunci kembali ke halaman 1',
          w.eval('MN_HAL') === 1 && baris()[0] === 'MENU 01', w.eval('MN_HAL') + ' | ' + baris()[0]);

      kt.value = ''; kt.dispatchEvent(new w.Event('input', { bubbles:true })); await tunggu(40);
      cek('mengosongkan kata kunci mengembalikan seluruh halaman 1',
          baris().length === 20, String(baris().length));
    }

    /* GANTI UKURAN HALAMAN JUGA KEMBALI KE HALAMAN 1. Diuji dengan ukuran yang
       SEDANG BERLAKU — itu satu-satunya keadaan yang bisa membedakan resetnya
       dari penjepit rentang: ukuran yang membesar selalu memperkecil jumlah
       halaman, jadi MN_HAL jatuh ke 1 dengan sendirinya dan mutasi "resetnya
       dicabut" lolos tanpa satu pun asersi merah. Menekan ukuran yang sedang
       berlaku tetap tindakan yang nyata, dan jawabannya memang halaman 1. */
    w.eval('mnHal(2)'); await tunggu(40);
    w.eval('mnPer(20)'); await tunggu(40);
    cek('ganti ukuran halaman kembali ke halaman 1',
        w.eval('MN_HAL') === 1 && baris().length === 20 && baris()[0] === 'MENU 01',
        w.eval('MN_HAL') + ' | ' + baris().length + ' | ' + baris()[0]);

    /* Seluruh menu di sini tidak punya resep — kartunya harus menyebut
       semuanya, bukan memotongnya seperti chip yang lama. */
    const ta = d.getElementById('mn-teks');
    cek('teks salin memuat SELURUH menu tak dikenal, tidak dipotong',
        !!ta && ta.value.split('\n').length === 25, ta && String(ta.value.split('\n').length));
    dom.window.close();
  }

  /* ================= METODE KUNJUNGAN (Visit Purpose) =================
     Permintaan user 10 September 2026. Yang paling gampang lepas TANPA satu
     pun galat: jumlah transaksi dihitung dari JUMLAH BARIS, bukan dari nomor
     bill yang berbeda. Di Detail Report satu bill tersebar di beberapa baris
     menu, jadi salahnya cuma tampil sebagai angka yang lebih besar dan
     rata-rata per transaksi yang lebih kecil — dua angka yang sama-sama
     terlihat masuk akal. Fixture di bawah karena itu memberi B1 dan B3 lebih
     dari satu baris. */
  console.log('\n== Metode Kunjungan (Visit Purpose) ==');
  {
    const rows = [
      { a:'Sales Date', b:'Bill Number', c:'Menu', d:'Qty', e:'Subtotal',
        f:'Total After Bill Discount', g:'Visit Purpose' },
      /* B1: DUA baris menu, SATU transaksi. */
      { a:'2026-08-01', b:'B1', c:'NASI GORENG', d:'1', e:'50000',  f:'50000',  g:'DINE IN' },
      { a:'2026-08-01', b:'B1', c:'ES TEH',      d:'2', e:'20000',  f:'20000',  g:'DINE IN' },
      /* Huruf kecil: metode yang SAMA, bukan metode kelima. */
      { a:'2026-08-01', b:'B2', c:'NASI GORENG', d:'1', e:'30000',  f:'30000',  g:'dine in' },
      { a:'2026-08-01', b:'B3', c:'ES TEH',      d:'1', e:'20000',  f:'20000',  g:'DINE IN' },
      /* B3 juga punya baris ONLINE — satu bill yang barisnya memuat dua
         metode. Ini yang membuat jumlah transaksi di halaman ini boleh lebih
         besar daripada di Ringkasan, dan cabang pemberitahuannya baru punya
         data untuk dijalankan karena baris ini ada. */
      { a:'2026-08-01', b:'B3', c:'KOPI',        d:'1', e:'15000',  f:'15000',  g:'ONLINE' },
      /* SATU transaksi, tapi omsetnya PALING BESAR. Kalau tabelnya diurut
         menurut omset alih-alih jumlah transaksi, baris inilah yang naik ke
         paling atas — dan halaman ini menjawab pertanyaan yang tidak dibawa
         siapa pun. */
      { a:'2026-08-02', b:'B4', c:'PAKET AYAM',  d:'1', e:'500000', f:'500000', g:'ESB ORDER' },
      /* Rp45.000, bukan Rp40.000: Rp40.000 adalah rata-rata per transaksi
         DINE IN (120.000 / 3), dan angka yang bertabrakan membuat asersi
         rata-rata cocok dengan sel omset baris ini tanpa pernah menyentuh yang
         diuji. Tiap angka di data uji harus punya sidik jarinya sendiri. */
      { a:'2026-08-02', b:'B5', c:'KOPI',        d:'1', e:'45000',  f:'45000',  g:'TIKTOK GO' },
      /* Kolomnya kosong: diberi namanya sendiri, tidak dibuang dan tidak
         dijatuhkan ke metode pertama. */
      { a:'2026-08-02', b:'B6', c:'KOPI',        d:'1', e:'25000',  f:'25000',  g:'' }
    ];
    const { dom } = domAnalytics({});
    await siap(dom.window);
    const w = dom.window, d = w.document;
    const u = w.eval('ringkasPos')(rows, 'x.xlsx');

    /* ---- pengurai ---- */
    const kj = u.kunjung || {};
    cek('metode kunjungan terbaca dari kolom Visit Purpose',
        Object.keys(kj).length === 5, JSON.stringify(Object.keys(kj)));
    cek('TRANSAKSI dihitung dari nomor bill yang berbeda, bukan jumlah baris',
        kj['DINE IN'] && kj['DINE IN'].bill === 3,
        'DINE IN = ' + JSON.stringify(kj['DINE IN']) + ' (4 berarti barisnya yang dihitung)');
    cek('omsetnya dijumlahkan per baris', kj['DINE IN'].grand === 120000,
        String(kj['DINE IN'].grand));
    cek('huruf kecil jatuh ke metode yang sama', !kj['dine in'], JSON.stringify(Object.keys(kj)));
    cek('yang kolomnya kosong diberi namanya sendiri, tidak dibuang',
        !!kj['(tanpa keterangan)'] && kj['(tanpa keterangan)'].grand === 25000,
        JSON.stringify(kj['(tanpa keterangan)']));
    /* Kolom omset WAJIB tetap berjumlah pas ke total sebulan — kalau tidak,
       yang menjumlahkannya sendiri menyimpulkan ada omset yang hilang. */
    cek('jumlah omset seluruh metode sama dengan total sebulan',
        Object.keys(kj).reduce((a, k) => a + kj[k].grand, 0) === u.ringkas.grand,
        Object.keys(kj).reduce((a, k) => a + kj[k].grand, 0) + ' vs ' + u.ringkas.grand);

    /* ---- lewat JALUR SIMPANNYA, bukan disuntikkan langsung ----
       Daftar kunci tertutup di anSimpanUnggah() adalah tempat tiga kunci
       tertinggal 4 September 2026 sementara 260 pemeriksaan tetap hijau. */
    w.eval('AN.data.laporan = {}');
    w.eval('UNGGAH_HASIL = Object.assign({ diunggah:"2026-09-10", oleh:"Uji" }, '
      + JSON.stringify(u) + ')');
    await w.eval('anSimpanUnggah()');
    cek('kunjung bertahan lewat putaran simpan',
        !!w.eval('AN.data.laporan["2026-08"].kunjung'));

    w.go('kunjungan'); await tunggu(60);
    const v = d.getElementById('app-view').innerHTML;
    /* Judulnya "Per Metode" sampai 13 September 2026; sejak halaman ini
       memajang dua dimensi, tabelnya dinamai dimensinya sendiri. */
    const tbl = v.slice(v.indexOf('Cara Tamu Datang'));
    const nama = (tbl.match(/<td><b>[^<]+<\/b><\/td>/g) || []).map(x => x.replace(/<[^>]*>/g, ''));

    cek('halaman Metode Kunjungan menggambar tabelnya', nama.length === 5, nama.join(' | '));
    /* DIURUT MENURUT JUMLAH TRANSAKSI, bukan omset. ESB ORDER membawa
       Rp500.000 dari satu transaksi sementara DINE IN cuma Rp120.000 dari
       tiga — diurut menurut omset, ESB ORDER yang naik ke atas. */
    cek('diurut menurut jumlah transaksi, bukan omset',
        nama[0] === 'DINE IN', nama.join(' | '));
    /* Label kartunya menyebut DIMENSINYA. Sejak halaman ini memajang cara
       datang DAN metode bayar, "Paling Sering" saja tidak mengatakan yang mana
       — bentuk pertanyaan yang sama dengan kolom "Kontribusi" tanpa penyebut. */
    cek('kartu Cara Datang Terbanyak menyebut caranya',
        v.indexOf('Cara Datang Terbanyak') > -1 && v.slice(v.indexOf('Cara Datang Terbanyak'),
          v.indexOf('Cara Datang Terbanyak') + 300).indexOf('DINE IN') > -1,
        v.slice(v.indexOf('Cara Datang Terbanyak'), v.indexOf('Cara Datang Terbanyak') + 300));
    cek('jumlah transaksi & omsetnya tergambar di barisnya',
        tbl.indexOf('>3</td>') > -1 && tbl.indexOf(w.eval('rp0')(120000)) > -1,
        tbl.slice(0, 900));
    /* Rata-rata per transaksi memakai jumlah bill, bukan jumlah baris:
       120.000 / 3 = 40.000, sementara 120.000 / 4 = 30.000. */
    cek('rata-rata per transaksi dihitung dari transaksi, bukan baris',
        tbl.indexOf(w.eval('rp0')(40000)) > -1, tbl.slice(0, 900));
    cek('barisnya berjumlah total di kaki tabel',
        tbl.indexOf('<tfoot>') > -1 && tbl.indexOf(w.eval('rp0')(705000)) > -1,
        tbl.slice(tbl.indexOf('<tfoot>'), tbl.indexOf('<tfoot>') + 400));
    /* Laporan per menu: satu transaksi punya beberapa baris, dan itu WAJIB
       dikatakan — yang membandingkannya dengan jumlah baris berkas akan
       mengira ada yang hilang. */
    cek('laporan per menu dikatakan menghitung nomor bill yang berbeda',
        v.indexOf('nomor bill yang berbeda') > -1);
    /* B3 punya baris DINE IN dan ONLINE, jadi ia dihitung di kedua-duanya:
       7 di sini vs 6 di Ringkasan. Didiamkan, selisihnya dilaporkan sebagai
       angka yang salah di salah satu halaman. */
    cek('selisih dengan jumlah bill di Ringkasan dikatakan, bukan didiamkan',
        v.indexOf('sementara Ringkasan menyebut') > -1,
        v.slice(v.indexOf('Batangnya'), v.indexOf('Batangnya') + 600));
    dom.window.close();
  }

  /* Laporan LAMA tidak punya `kunjung` sama sekali, dan itu bukan galat —
     kolomnya baru dibaca 10 September 2026. Yang dibedakan: menyuruh mengunggah
     ulang, bukan menggambar tabel kosong yang terbaca sebagai "tidak ada
     transaksi bulan ini". */
  {
    const an = { data: { laporan: { '2026-08': {
      diunggah:'2026-08-28', oleh:'Wandi', berkas:'x.xlsx', jenis:'menu',
      hari: { '2026-08-01': { bill:10, grand:1000000 } },
      jam: Array.from({ length: 24 }, () => ({ bill:0, grand:0 })),
      menu: { 'NASI GORENG': { qty:1, nilai:50000 } },
      ringkas: { bill:10, grand:1000000, net:900000, svc:0, tax:0, sub:900000,
                 discMenu:0, discBill:0, discVoucher:0, pax:0, billPax:0 }
    } }, setting: {} }, akses: {}, peran: {} };
    const { dom } = domAnalytics({ an });
    await siap(dom.window);
    const w = dom.window, d = w.document;
    w.go('kunjungan'); await tunggu(60);
    const v = d.getElementById('app-view').innerHTML;
    cek('laporan lama: dikatakan sebabnya, bukan tabel kosong',
        v.indexOf('belum memuat metode kunjungan') > -1, v.slice(0, 400));
    cek('...berikut cara membetulkannya', v.indexOf('Unggah ulang berkas bulan itu') > -1);
    cek('...dan kemungkinan keduanya: berkas POS tanpa kolom itu',
        v.indexOf('memang tidak punya kolom itu') > -1);
    dom.window.close();
  }


  /* ================= METODE PEMBAYARAN (Payment Method) =================
     Permintaan user 13 September 2026: "metode ini jangan dilihat dari visit
     purpose, tapi berdasarkan juga payment method; semisalnya payment
     methodnya online, itu ada yg grabfood ada yg gofood, minta bantu juga
     dijabarkan".

     TIGA hal yang gagal TANPA satu pun galat kalau lepas, dan fixture di bawah
     dirancang supaya ketiganya punya tempat untuk muncul:

       1. Pembayaran gabungan TIDAK dipecah — "VOUCHER (25.000),CASH (50.000)"
          berdiri sebagai metode tersendiri. Di produksi ini melahirkan 90-an
          metode palsu yang mengubur yang sungguhan.
       2. Nominalnya dibaca angka() alih-alih angkaTampil() — "1.234.567"
          terbaca 1,234 sehingga rasio pembagiannya jungkir balik.
       3. Kembalian tunai dibagi rata — nominal tunai adalah uang yang
          DISERAHKAN, jadi jumlahnya melebihi tagihan.

     Angkanya dipilih supaya tiap kesalahan memberi hasil yang BERBEDA, dan
     tidak satu pun bertabrakan dengan angka lain di halaman yang sama. */
  console.log('\n== Metode Pembayaran ==');
  {
    const { dom } = domAnalytics({});
    await siap(dom.window);
    const w = dom.window, d = w.document;

    /* ---- helper sebagai UNIT ---- */
    const angkaTampil = w.eval('angkaTampil'), pecahBayar = w.eval('pecahBayar'),
          porsiBayar = w.eval('porsiBayar');
    /* angka() yang sudah ada BENAR untuk sel .xlsx numerik dan SALAH untuk
       angka berformat tampilan. Kedua bentuk di bawah dipakai POS di kolom
       Payment Method, dan salahnya berbeda besarnya di tiap bentuk. */
    cek('angkaTampil membaca titik sebagai pemisah RIBUAN',
        angkaTampil('4.167.925') === 4167925 && angkaTampil('25.000') === 25000,
        angkaTampil('4.167.925') + ' / ' + angkaTampil('25.000'));
    cek('...angka() yang lama memang salah membacanya (sebab helper ini ada)',
        w.eval('angka')('4.167.925') !== 4167925, String(w.eval('angka')('4.167.925')));
    cek('...koma tetap dibaca sebagai desimal kalau ia yang paling belakang',
        angkaTampil('1.234,56') === 1234.56, String(angkaTampil('1.234,56')));
    cek('...nol tetap nol, bukan dianggap tidak terbaca', angkaTampil('0') === 0);

    cek('pecahBayar memecah pembayaran gabungan jadi komponennya',
        pecahBayar('VOUCHER (25.000),QRIS MANDIRI (15.250)').length === 2);
    /* DIPECAH PADA KOMA DI LUAR KURUNG. Nominal berkoma akan terbelah di
       tengah angkanya dan melahirkan dua metode hantu. */
    cek('...tapi TIDAK pada koma di dalam kurung',
        pecahBayar('CASH (1,500)').length === 1
        && pecahBayar('CASH (1,500)')[0].nama === 'CASH'
        && pecahBayar('CASH (1,500)')[0].nom === 1500,
        JSON.stringify(pecahBayar('CASH (1,500)')));
    /* null, BUKAN 0 — supaya bisa dibedakan dari nominal nol yang memang
       tertulis ("VOUCHER (0),QRIS MANDIRI (45.000)"). */
    cek('metode tunggal tidak punya nominal, dan itu null bukan 0',
        pecahBayar('QRIS MANDIRI')[0].nom === null,
        JSON.stringify(pecahBayar('QRIS MANDIRI')));

    /* Tagihan Rp40.000 dibayar voucher Rp25.000 + tunai Rp50.000 diserahkan.
       Kembaliannya Rp35.000, dan itu DIPOTONG DARI TUNAINYA — dibagi rata,
       voucher berbunyi Rp13.333 padahal voucher di sini kelipatan Rp25.000. */
    {
      const p = porsiBayar([{ nama:'VOUCHER', nom:25000 }, { nama:'CASH', nom:50000 }], 40000);
      cek('kembalian dipotong dari komponen TUNAInya, bukan dibagi rata',
          Math.abs(p.porsi[0] * 40000 - 25000) < 0.001 && Math.abs(p.porsi[1] * 40000 - 15000) < 0.001,
          JSON.stringify(p.porsi.map(x => x * 40000)));
    }
    /* Tanpa komponen tunai, kelebihannya TIDAK ditebak jatuh ke mana pun —
       porsinya tetap menurut nominal. */
    cek('porsi selalu berjumlah 1, apa pun bentuk nominalnya',
        Math.abs(porsiBayar([{ nama:'A', nom:3 }, { nama:'B', nom:1 }], 100).porsi
          .reduce((a, x) => a + x, 0) - 1) < 1e-9);
    {
      const p = porsiBayar([{ nama:'A', nom:null }, { nama:'B', nom:null }], 100);
      cek('nominal yang tidak terbaca dibagi rata DAN ditandai', p.rata === true);
      /* Diberikan PENUH ke masing-masing, omset halaman ini jadi lebih besar
         daripada omset bulan itu — dan selisih semacam itu dicari orang di
         tempat yang salah. Yang dijaga PORSINYA, bukan penandanya. */
      cek('...dan porsinya tetap berjumlah 1, bukan 1 untuk masing-masing',
          Math.abs(p.porsi.reduce((a, x) => a + x, 0) - 1) < 1e-9, JSON.stringify(p.porsi));
    }

    /* ---- pengurai atas fixture ---- */
    const rows = [
      { a:'Sales Date', b:'Bill Number', c:'Menu', d:'Qty', e:'Subtotal',
        f:'Total After Bill Discount', g:'Visit Purpose', h:'Payment Method' },
      /* B1: DUA baris menu, SATU transaksi, metode tunggal. */
      { a:'2026-08-01', b:'B1', c:'NASI GORENG', d:'1', e:'50000', f:'50000', g:'DINE IN', h:'QRIS MANDIRI' },
      { a:'2026-08-01', b:'B1', c:'ES TEH',      d:'2', e:'20000', f:'20000', g:'DINE IN', h:'QRIS MANDIRI' },
      /* B2: gabungan voucher + TUNAI YANG DISERAHKAN Rp50.000 untuk tagihan
         Rp40.000. Dua baris menu — kalau porsinya dihitung per BARIS alih-alih
         per BILL, voucher berbunyi Rp28.333, bukan Rp25.000. */
      { a:'2026-08-01', b:'B2', c:'KOPI',  d:'1', e:'30000', f:'30000', g:'DINE IN', h:'VOUCHER (25.000),CASH (50.000)' },
      { a:'2026-08-01', b:'B2', c:'ROTI',  d:'1', e:'10000', f:'10000', g:'DINE IN', h:'VOUCHER (25.000),CASH (50.000)' },
      /* ONLINE pecah jadi DUA metode — inilah yang ditanyakan user. */
      { a:'2026-08-01', b:'B3', c:'PAKET', d:'1', e:'60000', f:'60000', g:'ONLINE', h:'GRABFOOD' },
      { a:'2026-08-01', b:'B4', c:'PAKET', d:'1', e:'24000', f:'24000', g:'ONLINE', h:'GOFOOD' },
      /* B5: gabungan yang nominalnya PAS — tidak ada kembalian. */
      { a:'2026-08-02', b:'B5', c:'STEAK', d:'1', e:'100000', f:'100000', g:'DINE IN', h:'QRIS BRI (100.000),QRIS MANDIRI (80.000)' },
      { a:'2026-08-02', b:'B5', c:'WINE',  d:'1', e:'80000',  f:'80000',  g:'DINE IN', h:'QRIS BRI (100.000),QRIS MANDIRI (80.000)' },
      /* Kolomnya kosong: diberi namanya sendiri, tidak dibuang. */
      { a:'2026-08-02', b:'B6', c:'KOPI',  d:'1', e:'14000', f:'14000', g:'ESB ORDER', h:'' },
      /* Nominal berpemisah ribuan TIGA kelompok. Dibaca angka(), "1.234.567"
         jadi 1,234 dan "500.000" jadi 500 — rasionya jungkir balik dari
         29:71 jadi 99:1, dan TRANSFER berbunyi Rp1,7 juta. */
      { a:'2026-08-02', b:'B7', c:'PESTA', d:'1', e:'1000000', f:'1000000', g:'DINE IN', h:'TRANSFER (500.000),QRIS MANDIRI (1.234.567)' },
      { a:'2026-08-02', b:'B7', c:'DEKOR', d:'1', e:'734567',  f:'734567',  g:'DINE IN', h:'TRANSFER (500.000),QRIS MANDIRI (1.234.567)' },
      /* B8: gabungan TANPA satu pun nominal. Omsetnya dibagi RATA — dan yang
         dijaga porsinya tetap berjumlah 1, bukan 1 untuk masing-masing. */
      { a:'2026-08-02', b:'B8', c:'SNACK', d:'1', e:'8000', f:'8000', g:'DINE IN', h:'EDC BCA,MEMBER DEPOSIT' },
      /* B9: GOFOOD dipakai bill KEDUA. Tanpa ini, urutan menurut jumlah
         transaksi kebetulan SAMA PERSIS dengan urutan menurut omset, dan
         mutasi "diurut menurut omset" tidak menggeser satu baris pun. */
      { a:'2026-08-02', b:'B9', c:'PAKET', d:'1', e:'6000', f:'6000', g:'ONLINE', h:'GOFOOD' },
      /* B10: SATU bill, DUA cara datang. Tanpa bentuk ini, pb.vp[vp] selalu
         sama dengan pb.grand — jadi silang yang dibagi menurut tagihan BILL
         (bukan menurut omset baris cara datangnya) memberi angka yang sama
         persis, dan kesalahannya tidak punya tempat untuk muncul. */
      { a:'2026-08-02', b:'B10', c:'MEJA', d:'1', e:'12000', f:'12000', g:'DINE IN', h:'QRIS BRI' },
      { a:'2026-08-02', b:'B10', c:'ANTAR', d:'1', e:'3000', f:'3000', g:'ONLINE', h:'QRIS BRI' }
    ];
    const u = w.eval('ringkasPos')(rows, 'x.xlsx');
    const by = u.bayar || {};

    cek('metode pembayaran terbaca dari kolom Payment Method',
        Object.keys(by).length === 10, JSON.stringify(Object.keys(by)));
    /* Kalau gabungannya TIDAK dipecah, string utuhnya berdiri sebagai metode. */
    cek('pembayaran gabungan dipecah, bukan berdiri sebagai metode sendiri',
        !by['VOUCHER (25.000),CASH (50.000)'] && !!by['VOUCHER'] && !!by['CASH'],
        JSON.stringify(Object.keys(by)));
    cek('voucher menerima nominalnya sendiri, bukan porsi rata',
        Math.abs(by['VOUCHER'].grand - 25000) < 0.01, String(by['VOUCHER'].grand));
    cek('tunai menerima SISANYA, bukan uang yang diserahkan',
        Math.abs(by['CASH'].grand - 15000) < 0.01, String(by['CASH'].grand));
    cek('nominal berpemisah ribuan dibaca utuh',
        Math.abs(by['TRANSFER'].grand - 500000) < 0.01, String(by['TRANSFER'].grand));
    /* Satu metode yang dipakai tiga bill berbeda — dua di antaranya lewat
       pembayaran gabungan. */
    cek('satu metode menjumlahkan seluruh bill yang memakainya',
        by['QRIS MANDIRI'].bill === 3 && Math.abs(by['QRIS MANDIRI'].grand - 1384567) < 0.01,
        JSON.stringify(by['QRIS MANDIRI']));
    cek('yang kolomnya kosong diberi namanya sendiri, tidak dibuang',
        !!by['(tanpa keterangan)'] && by['(tanpa keterangan)'].grand === 14000,
        JSON.stringify(by['(tanpa keterangan)']));
    /* TRANSAKSI dari nomor bill yang berbeda, bukan jumlah baris: B1, B2, B5,
       dan B7 masing-masing dua baris. */
    cek('transaksi dihitung dari nomor bill yang berbeda, bukan jumlah baris',
        by['VOUCHER'].bill === 1 && by['GRABFOOD'].bill === 1,
        JSON.stringify({ voucher: by['VOUCHER'].bill, grab: by['GRABFOOD'].bill }));

    /* INVARIAN TERKUAT DI BAGIAN INI: kolom omset WAJIB berjumlah pas ke total
       sebulan. Ia yang menangkap pembagian apa pun yang salah — proporsional
       yang keliru, nominal yang salah baca, atau porsi yang tidak berjumlah 1. */
    cek('jumlah omset seluruh metode bayar sama dengan total sebulan',
        Math.abs(Object.keys(by).reduce((a, k) => a + by[k].grand, 0) - u.ringkas.grand) < 0.01,
        Object.keys(by).reduce((a, k) => a + by[k].grand, 0) + ' vs ' + u.ringkas.grand);
    /* ...sementara kolom transaksinya TIDAK boleh dijumlahkan: tiga bill di
       fixture ini dibayar dua metode, jadi 10 > 7. Itu bukan galat, tapi WAJIB
       dikatakan di layar (diuji di bawah). */
    cek('jumlah transaksi per metode LEBIH BESAR daripada bill sungguhan',
        Object.keys(by).reduce((a, k) => a + by[k].bill, 0) === 14 && u.ringkas.bill === 10,
        Object.keys(by).reduce((a, k) => a + by[k].bill, 0) + ' vs ' + u.ringkas.bill);

    /* Gabungan tanpa nominal: dibagi RATA, dan jumlahnya DICATAT supaya bisa
       disebut di layar. Perkiraan yang tidak dikatakan tidak bisa diperiksa
       siapa pun. */
    cek('gabungan tanpa nominal dibagi rata ke tiap metodenya',
        Math.abs(by['EDC BCA'].grand - 4000) < 0.01 && Math.abs(by['MEMBER DEPOSIT'].grand - 4000) < 0.01,
        JSON.stringify({ bca: by['EDC BCA'].grand, dep: by['MEMBER DEPOSIT'].grand }));
    cek('...dan jumlahnya dicatat untuk disebut di layar', u.ringkas.bayarRata === 1,
        String(u.ringkas.bayarRata));

    /* ---- SILANG cara datang x metode bayar ---- */
    const kb = u.kunjungBayar || {};
    cek('ONLINE dirinci jadi GrabFood dan GoFood',
        Math.abs((kb['ONLINE|GRABFOOD'] || {}).grand - 60000) < 0.01
        && Math.abs((kb['ONLINE|GOFOOD'] || {}).grand - 30000) < 0.01,
        JSON.stringify(Object.keys(kb).filter(k => k.indexOf('ONLINE|') === 0)));
    /* B10 satu bill dua cara datang: silangnya dibagi menurut OMSET BARISNYA,
       bukan menurut tagihan bill. Dibagi menurut tagihan bill, keduanya
       menerima Rp15.000 dan rincian tiap cara datang berhenti berjumlah sama
       dengan baris induknya (diuji tepat di bawah). */
    cek('bill yang barisnya dua cara datang dibagi menurut omset barisnya',
        Math.abs((kb['ONLINE|QRIS BRI'] || {}).grand - 3000) < 0.01
        && Math.abs((kb['DINE IN|QRIS BRI'] || {}).grand - 112000) < 0.01,
        JSON.stringify({ on: (kb['ONLINE|QRIS BRI'] || {}).grand, di: (kb['DINE IN|QRIS BRI'] || {}).grand }));
    /* INVARIAN: rincian tiap cara datang WAJIB berjumlah sama dengan baris
       induknya. Kalau tidak, dua angka untuk hal yang sama berdiri di satu
       tabel — dan yang membandingkannya tidak punya cara tahu mana yang benar. */
    Object.keys(u.kunjung).forEach(vp => {
      const g = Object.keys(kb).filter(k => k.slice(0, vp.length + 1) === vp + '|')
                  .reduce((a, k) => a + kb[k].grand, 0);
      cek('rincian ' + vp + ' berjumlah sama dengan baris induknya',
          Math.abs(g - u.kunjung[vp].grand) < 0.01, g + ' vs ' + u.kunjung[vp].grand);
    });

    /* ---- lewat JALUR SIMPANNYA, bukan disuntikkan langsung ----
       Daftar kunci tertutup di anSimpanUnggah() adalah tempat paket,
       kategori, dan katMenu tertinggal lima hari tanpa satu pun galat. */
    w.eval('AN.data.laporan = {}');
    w.eval('UNGGAH_HASIL = Object.assign({ diunggah:"2026-09-13", oleh:"Uji" }, '
      + JSON.stringify(u) + ')');
    await w.eval('anSimpanUnggah()');
    cek('bayar & kunjungBayar bertahan lewat putaran simpan',
        !!w.eval('AN.data.laporan["2026-08"].bayar')
        && !!w.eval('AN.data.laporan["2026-08"].kunjungBayar'));

    /* ---- layarnya ---- */
    w.go('kunjungan'); await tunggu(60);
    const v = d.getElementById('app-view').innerHTML;
    const tBayar = kartuJudul(v, 'Metode Pembayaran'), tDatang = kartuJudul(v, 'Cara Tamu Datang');
    cek('kedua tabelnya digambar', !!tBayar && !!tDatang,
        'bayar=' + tBayar.length + ' datang=' + tDatang.length);
    /* REKAP KANAL berdiri di atas keduanya (15 September 2026) dan memang
       menyebut "Cara Tamu Datang" di keterangannya — itu sebabnya ketiga
       potongan ini diiris menurut KARTUNYA, bukan menurut posisi frasa di
       seluruh halaman. */
    const tRekap = kartuJudul(v, 'Rekap Kanal');
    cek('Rekap Kanal berdiri PALING ATAS, di atas kedua tabel lama',
        !!tRekap && v.indexOf('<h3>Rekap Kanal</h3>') < v.indexOf('<h3>Metode Pembayaran</h3>'),
        String(v.indexOf('<h3>Rekap Kanal</h3>')) + ' vs ' + v.indexOf('<h3>Metode Pembayaran</h3>'));
    const namaDi = html => (html.match(/<td><b>[^<]+<\/b><\/td>/g) || []).map(x => x.replace(/<[^>]*>/g, ''));

    const nb = namaDi(tBayar);
    cek('tabel metode bayar memuat kesepuluh metodenya', nb.length === 10, nb.join(' | '));
    /* DIURUT MENURUT JUMLAH TRANSAKSI, sama dengan tabel di bawahnya.
       Memeriksa baris PERTAMA saja tidak cukup: QRIS MANDIRI kebetulan
       teratas menurut kedua-duanya. Yang membedakan baris KEDUA — QRIS BRI
       dipakai 2 bill dengan omset Rp115.000, sementara TRANSFER cuma 1 bill
       tapi Rp500.000. Diurut menurut omset, TRANSFER yang naik. */
    cek('diurut menurut jumlah transaksi, bukan omset',
        nb[0] === 'QRIS MANDIRI' && nb[1] === 'QRIS BRI', nb.join(' | '));
    cek('GrabFood & GoFood berdiri sebagai metodenya sendiri',
        nb.indexOf('GRABFOOD') > -1 && nb.indexOf('GOFOOD') > -1, nb.join(' | '));
    cek('omset tiap metode tergambar', tBayar.indexOf(w.eval('rp0')(500000)) > -1, tBayar.slice(0, 900));
    cek('kaki tabelnya berjumlah total sebulan',
        tBayar.indexOf(w.eval('rp0')(2151567)) > -1, tBayar.slice(tBayar.indexOf('<tfoot>'), tBayar.indexOf('<tfoot>') + 400));
    cek('pembagian rata yang cuma perkiraan dikatakan di layar',
        tBayar.indexOf('dibagi rata ke tiap metodenya') > -1, tBayar.slice(-900));

    /* Kolom transaksi TIDAK bisa dijumlahkan, kolom omset bisa — dan keduanya
       berdiri bersebelahan di satu baris, jadi bedanya wajib dikatakan. */
    cek('kolom transaksi yang tidak bisa dijumlahkan DIKATAKAN, berikut angkanya',
        tBayar.indexOf('tidak bisa dijumlahkan') > -1 && tBayar.indexOf('>14<') > -1,
        tBayar.slice(tBayar.indexOf('<tfoot>')));
    /* Kembalian tunai adalah keputusan tentang uang — disebut di LAYAR, bukan
       cuma di komentar kodenya. */
    cek('aturan kembalian tunai dikatakan di layar',
        tBayar.indexOf('uang yang diserahkan') > -1, tBayar.slice(-700));

    /* ---- rincian di tabel cara datang: jawaban pertanyaan aslinya ---- */
    const barisVp = n => {
      const i = tDatang.indexOf('<td><b>' + n + '</b></td>');
      if (i < 0) return '';
      const sisa = tDatang.slice(i + 1);
      const j = sisa.indexOf('<td><b>');
      return j < 0 ? sisa : sisa.slice(0, j);
    };
    const bOnline = barisVp('ONLINE');
    cek('baris ONLINE dirinci jadi GrabFood dan GoFood, TANPA harus diklik',
        bOnline.indexOf('GRABFOOD') > -1 && bOnline.indexOf('GOFOOD') > -1, bOnline.slice(0, 900));
    cek('...berikut jumlah transaksi & omsetnya masing-masing',
        bOnline.indexOf(w.eval('rp0')(60000)) > -1 && bOnline.indexOf(w.eval('rp0')(30000)) > -1,
        bOnline.slice(0, 900));
    /* PENYEBUT KOLOM PERSEN DI BARIS RINCIAN ADALAH INDUKNYA, bukan sebulan —
       dan itu disebut DI SELNYA. Kepala kolom dibaca sekali, angkanya dibaca
       tiap baris; pelajaran empat putaran pertanyaan di kolom Kontribusi.

       DIHITUNG, bukan cuma dicari kata "dari ONLINE": ONLINE punya tiga baris
       rincian dan tiap barisnya punya DUA kolom persen, jadi enam. Mencari
       katanya saja meloloskan mutasi yang mencabutnya dari salah satu kolom —
       bentuk asersi hampa yang sudah dibayar di kolom Kontribusi. */
    cek('penyebut persen baris rincian disebut di KEDUA kolomnya',
        (bOnline.match(/dari ONLINE/g) || []).length === 6,
        String((bOnline.match(/dari ONLINE/g) || []).length) + ' dari 6');
    /* Dan angkanya memang dihitung terhadap induknya: GrabFood 1 dari 4
       transaksi ONLINE (25%) dan Rp60.000 dari Rp93.000 (65%). Terhadap
       sebulan angkanya 7% dan 3% — tidak ada yang bisa tertukar. */
    {
      const i = bOnline.indexOf('GRABFOOD');
      const sel = bOnline.slice(i, i + 700);
      cek('...dan angkanya dihitung terhadap induknya, bukan terhadap sebulan',
          sel.indexOf('>' + w.eval('pct')(1, 4) + '% ') > -1
          && sel.indexOf('>' + w.eval('pct')(60000, 93000) + '% ') > -1, sel);
    }
    /* Rincian DINE IN tidak boleh bocor ke baris ONLINE. */
    cek('rincian sebuah baris tidak bocor ke baris lain',
        bOnline.indexOf('TRANSFER') < 0 && barisVp('DINE IN').indexOf('TRANSFER') > -1,
        bOnline.slice(0, 900));

    /* ---- REKAP KANAL (permintaan user 15 September 2026) ----
       "metode kunjungan ini di rekap, Dine in, GrabFood, Gofood, Tiktok go,
       ESB Order" — satu daftar yang memecah ONLINE jadi kanal pemesanannya. */
    {
      /* Nama baris rekap: kanal hasil pemecahan membawa "· dari ONLINE" di
         sel yang sama, jadi pencarinya tidak boleh menuntut </td> langsung
         sesudah </b> seperti namaDi(). */
      /* KATA UTUH, bukan potongan — dan ini diuji sebagai UNIT karena
         fixture-nya tidak punya metode yang namanya memuat nama kanal tanpa
         menjadi kanal. GOPAY metode bayar, bukan kanal pemesanan; aturan
         potongan akan memecah DINE IN jadi baris GOPAY. Aturan yang sama
         dengan pbHead() yang mencari "Head" dan menolak "Overhead". */
      {
        const kk = w.eval('kanalKah');
        cek('kanal dikenali dari KATA UTUH: GOFOOD, GO FOOD, GRABFOOD, TIKTOK GO',
            kk('GOFOOD') && kk('GO FOOD') && kk('GRABFOOD') && kk('GRAB FOOD') && kk('TIKTOK GO'));
        cek('...tapi GOPAY BUKAN kanal — ia metode bayar',
            !kk('GOPAY') && !kk('GOPAY MERCHANT'), 'GOPAY=' + kk('GOPAY'));
        cek('...dan nama yang cuma MEMUAT potongannya juga bukan',
            !kk('MANGO FOODS') && !kk('GRABPAY') && !kk('TIKTOK'),
            'MANGO FOODS=' + kk('MANGO FOODS') + ' GRABPAY=' + kk('GRABPAY'));
      }

      const namaRekap = html => (html.match(/<td><b>[^<]+<\/b>/g) || [])
        .map(x => x.replace(/<[^>]*>/g, ''));
      const nr = namaRekap(tRekap);
      cek('rekap memecah ONLINE jadi GRABFOOD dan GOFOOD',
          nr.indexOf('GRABFOOD') > -1 && nr.indexOf('GOFOOD') > -1, nr.join(' | '));
      /* DINE IN dibayar QRIS/VOUCHER/CASH/TRANSFER — tidak satu pun kanal
         pemesanan, jadi ia TIDAK boleh ikut terpecah. Mutasi yang memecah
         tiap cara datang menurut metodenya akan memecahkannya jadi lima. */
      cek('...tapi DINE IN tidak ikut dipecah menurut metode bayarnya',
          nr.filter(x => x === 'DINE IN').length === 1
          && nr.indexOf('QRIS MANDIRI') < 0 && nr.indexOf('VOUCHER') < 0, nr.join(' | '));

      const barisRekap = n => {
        const i = tRekap.indexOf('<td><b>' + n + '</b>');
        if (i < 0) return '';
        const sisa = tRekap.slice(i + 1);
        const j = sisa.indexOf('<td><b>');
        return j < 0 ? sisa : sisa.slice(0, j);
      };
      /* SISA ONLINE TIDAK BOLEH HILANG. B10 dibayar QRIS BRI — bukan kanal —
         jadi ia tinggal di baris bernama ONLINE: 1 transaksi, Rp3.000.
         Dibuang, omset rekap berhenti sama dengan tabel Cara Tamu Datang. */
      /* DIURUT MENURUT JUMLAH TRANSAKSI, sama dengan dua tabel di bawahnya.
         Baris KEDUA yang membedakannya: GOFOOD dipakai 2 bill beromset
         Rp30.000, sementara GRABFOOD cuma 1 bill tapi Rp60.000. Diurut
         menurut omset, GRABFOOD yang naik — jadi memeriksa baris pertama
         saja (DINE IN, teratas menurut kedua-duanya) tidak membuktikan apa
         pun. */
      cek('rekap diurut menurut jumlah transaksi, bukan omset',
          nr[0] === 'DINE IN' && nr[1] === 'GOFOOD', nr.join(' | '));

      const bSisa = barisRekap('ONLINE');
      cek('sisa ONLINE yang bukan kanal tetap berdiri sebagai barisnya sendiri',
          !!bSisa && bSisa.indexOf(w.eval('rp0')(3000)) > -1, bSisa.slice(0, 500));
      cek('...dan nama metodenya DISEBUT, supaya kanal baru ketahuan',
          tRekap.indexOf('QRIS BRI') > -1, tRekap.slice(tRekap.indexOf('notice info'), tRekap.indexOf('notice info') + 500));
      /* Kanal hasil pemecahan menyebut induknya — tanpa itu yang mencari
         GRABFOOD di tabel Cara Tamu Datang menyimpulkan keduanya tidak
         sinkron, padahal ia memang tidak pernah ada di Visit Purpose. */
      cek('kanal hasil pemecahan menyebut cara datang asalnya',
          barisRekap('GRABFOOD').indexOf('dari ONLINE') > -1, barisRekap('GRABFOOD').slice(0, 400));
      cek('GOFOOD menjumlahkan KEDUA bill-nya, bukan cuma yang pertama',
          barisRekap('GOFOOD').indexOf(w.eval('rp0')(30000)) > -1, barisRekap('GOFOOD').slice(0, 500));

      /* SATU BILL, DUA KANAL — bentuk yang tidak ada di fixture bersama dan
         sengaja diuji langsung atas fungsinya. Bill pecahan dihitung PENUH di
         tiap kanalnya, jadi jumlahnya bisa melampaui bill induknya; tanpa
         dijepit, baris sisanya berbunyi "-1 transaksi". */
      {
        const RKj = w.eval('rekapKanal')(
          { ONLINE: { grand: 100000, bill: 1 } },
          { 'ONLINE|GRABFOOD': { grand: 60000, bill: 1 },
            'ONLINE|GOFOOD':   { grand: 30000, bill: 1 } });
        const sisa = RKj.baris.filter(x => x.n === 'ONLINE')[0];
        cek('satu bill dua kanal: sisa transaksinya dijepit ke nol, bukan minus',
            !!sisa && sisa.bill === 0, JSON.stringify(RKj.baris));
        cek('...dan omset sisanya tetap utuh, bukan ikut dijepit',
            !!sisa && Math.abs(sisa.grand - 10000) < 0.01, JSON.stringify(RKj.baris));
      }

      /* INVARIAN TERKUAT DI BAGIAN INI, dan satu-satunya yang tidak bisa basi
         sendiri: omset rekap WAJIB sama persis dengan omset Cara Tamu Datang.
         Ia menangkap pemecahan apa pun yang salah — sisa yang dibuang, kanal
         yang dihitung dua kali, atau induk yang tidak dikurangi. */
      const RKu = w.eval('rekapKanal')(u.kunjung, u.kunjungBayar);
      const gRekap = RKu.baris.reduce((a, x) => a + x.grand, 0);
      const gDatang = Object.keys(u.kunjung).reduce((a, k) => a + u.kunjung[k].grand, 0);
      cek('INVARIAN: omset rekap kanal sama persis dengan omset cara datang',
          Math.abs(gRekap - gDatang) < 0.01, gRekap + ' vs ' + gDatang);
      cek('...dan itu memang angka sebulan, bukan sebagian',
          Math.abs(gRekap - 2151567) < 1, String(gRekap));
    }

    dom.window.close();
  }

  /* Dua keadaan kosong yang bentuk datanya SAMA (sama-sama tanpa metode bayar) tapi
     tindakannya BERBEDA — dan kalimat yang salah menyuruh orang mengerjakan
     sesuatu yang tidak akan pernah menolong. */
  {
    const dasar = jenis => ({ data: { laporan: { '2026-08': {
      diunggah:'2026-08-28', oleh:'Wandi', berkas:'x.xlsx', jenis,
      hari: { '2026-08-01': { bill:10, grand:1000000 } },
      jam: Array.from({ length: 24 }, () => ({ bill:0, grand:0 })),
      menu: {}, kunjung: { 'DINE IN': { grand:1000000, bill:10 } },
      ringkas: { bill:10, grand:1000000, net:900000, svc:0, tax:0, sub:900000,
                 discMenu:0, discBill:0, discVoucher:0, pax:0, billPax:0 }
    } }, setting: {} }, akses: {}, peran: {} });

    /* BILL REPORT TIDAK PUNYA kolom Payment Method sama sekali — diperiksa
       atas kedua berkas POS Agustus 2026. Menyuruh mencentang kolomnya saat
       ekspor adalah pekerjaan yang tidak akan pernah menolong di sana. */
    {
      const { dom } = domAnalytics({ an: dasar('bill') });
      await siap(dom.window);
      const w = dom.window;
      w.go('kunjungan'); await tunggu(60);
      const v = w.document.getElementById('app-view').innerHTML;
      const kBill = kartuJudul(v, 'Metode Pembayaran');
      cek('Bill Report: dikatakan bentuk laporannya yang tidak punya kolom itu',
          kBill.indexOf('DETAIL Report') > -1, kBill.slice(0, 800));
      cek('...dan TIDAK menyuruh mencentang kolomnya saat ekspor',
          kBill.indexOf('ikut dicentang') < 0, kBill);
      dom.window.close();
    }
    /* DETAIL REPORT yang diunggah sebelum kolomnya dibaca: unggah ulang. */
    {
      const { dom } = domAnalytics({ an: dasar('menu') });
      await siap(dom.window);
      const w = dom.window;
      w.go('kunjungan'); await tunggu(60);
      const v = w.document.getElementById('app-view').innerHTML;
      const kartu = kartuJudul(v, 'Metode Pembayaran');
      cek('Detail Report lama: disuruh unggah ulang, bukan ganti bentuk laporan',
          kartu.indexOf('Unggah ulang berkas bulan itu') > -1 && kartu.indexOf('DETAIL Report') < 0, kartu);
      /* Tabel cara datangnya TETAP digambar — yang kurang cuma satu dimensi,
         bukan seluruh halamannya. */
      cek('...tabel cara datang tetap digambar', v.indexOf('Cara Tamu Datang') > -1);
      dom.window.close();
    }
  }

  /* ================= 9. simpan & timpa ================= */
  /* ================= ERROR & KOREKSI BILL =================
     Permintaan user 15 September 2026: tab Error gabungan, berikut detail
     bill, catatannya, dan siapa yang memegangnya.

     DUA BENTUK LAPORAN diuji terpisah, dan itu bukan kelebihan: POS menaruh
     penandanya di kolom yang BERBEDA di tiap bentuk, dan kolom yang bisa
     diisi karena itu juga berbeda. Menguji salah satunya saja meloloskan
     seluruh jalur yang satunya lagi. */
  console.log('\n== Error & Koreksi Bill ==');
  {
    const { dom } = domAnalytics({});
    await siap(dom.window);
    const w = dom.window, d = w.document;

    /* ---- DETAIL REPORT: penandanya di Payment Method ---- */
    const rowsDetail = [
      { a:'Sales Date', b:'Bill Number', c:'Menu', d:'Qty', e:'Subtotal',
        f:'Total After Bill Discount', g:'Visit Purpose', h:'Payment Method',
        i:'Waiter', j:'Menu Notes' },
      /* E1: SATU bill, DUA baris menu. Dikumpulkan per BARIS, ia berdiri dua
         kali dan nilainya terhitung separuh-separuh. */
      { a:'2026-08-08', b:'E1', c:'LONTONG', d:'1', e:'30000', f:'30000', g:'DINE IN', h:'ERROR KASIR', i:'SULIS', j:'' },
      { a:'2026-08-08', b:'E1', c:'BUBUR',   d:'1', e:'39000', f:'39000', g:'DINE IN', h:'ERROR KASIR', i:'SPV',   j:'dadar' },
      /* E2: label yang MEMANG disebut user. */
      { a:'2026-08-21', b:'E2', c:'NASGOR',  d:'1', e:'48300', f:'48300', g:'DINE IN', h:'ERROR FLOOR', i:'ANDY',  j:'' },
      /* E3: penandanya di dalam PEMBAYARAN GABUNGAN — labelnya wajib komponen
         yang berawalan ERROR, bukan seluruh string yang tidak akan pernah
         bisa dikelompokkan. */
      { a:'2026-08-22', b:'E3', c:'STEAK',   d:'1', e:'20000', f:'20000', g:'DINE IN', h:'CASH (15.000),ERROR BAR (5.000)', i:'-', j:'' },
      /* BUKAN error — dan namanya sengaja MEMUAT kata yang mirip. */
      { a:'2026-08-23', b:'E4', c:'KOPI',    d:'1', e:'10000', f:'10000', g:'DINE IN', h:'QRIS MANDIRI', i:'RIZKI', j:'' },
      /* BULAN SEBELAH. Berkas POS rutin memuat baris yang tanggalnya
         menyeberang, dan bill ber-error di sana harus dibuang dengan aturan
         yang SAMA PERSIS dengan hari[] dan hariJam[] — kalau tidak, halaman
         ini memajang bill bulan lain sementara seluruh halaman lain tidak. */
      { a:'2026-07-30', b:'E9', c:'SATE',    d:'1', e:'11000', f:'11000', g:'DINE IN', h:'ERROR FLOOR', i:'ANDY',  j:'' }
    ];
    const uD = w.eval('ringkasPos')(rowsDetail, 'x.xlsx');
    cek('bill ber-error dikumpulkan PER BILL, bukan per baris menu',
        uD.error.length === 3, JSON.stringify(uD.error.map(e => e.bill)));
    const e1 = uD.error.filter(x => x.bill === 'E1')[0];
    cek('...dan nilainya dijumlahkan seluruh barisnya',
        !!e1 && Math.abs(e1.grand - 69000) < 0.01, e1 ? String(e1.grand) : '-');
    /* PENANDANYA AWALAN ERROR, BUKAN DAFTAR LIMA NAMA. Agustus 2026 justru
       berisi ERROR KASIR — yang TIDAK disebut user — dan daftar tertutup akan
       membuangnya tanpa satu pun tanda. */
    cek('ERROR KASIR ikut walau TIDAK ada di daftar lima yang disebut',
        !!e1 && e1.label.indexOf('ERROR KASIR') > -1, JSON.stringify(e1 && e1.label));
    cek('metode yang bukan error TIDAK ikut',
        uD.error.filter(x => x.bill === 'E4').length === 0, JSON.stringify(uD.error.map(x => x.bill)));
    cek('bill ber-error BULAN SEBELAH dibuang, aturan yang sama dengan hari[]',
        uD.error.filter(x => x.bill === 'E9').length === 0, JSON.stringify(uD.error.map(x => x.bill)));
    const e3 = uD.error.filter(x => x.bill === 'E3')[0];
    cek('penanda di dalam pembayaran gabungan dipecah jadi labelnya sendiri',
        !!e3 && e3.label.length === 1 && e3.label[0] === 'ERROR BAR', JSON.stringify(e3 && e3.label));
    /* "-" itu kolom kosong versi POS ini, bukan nama orang — diukur atas
       Agustus 2026: 15.918 dari 19.739 baris Employee Name berisi "-". */
    cek('waiter "-" tidak dibaca sebagai nama orang',
        !!e3 && e3.waiter.length === 0, JSON.stringify(e3 && e3.waiter));
    cek('waiter per baris menu dikumpulkan seluruhnya',
        !!e1 && e1.waiter.join(',') === 'SULIS,SPV', JSON.stringify(e1 && e1.waiter));
    cek('rincian menunya ikut, berikut catatan memasaknya',
        !!e1 && e1.menu.length === 2 && e1.menu[1].c === 'dadar', JSON.stringify(e1 && e1.menu));
    cek('kolom penandanya DICATAT, bukan disimpulkan dari daftar kosong',
        (uD.ringkas.errSumber || []).indexOf('Payment Method') > -1,
        JSON.stringify(uD.ringkas.errSumber));

    /* ---- lewat JALUR SIMPAN SUNGGUHAN ----
       Daftar kunci tertutup di anSimpanUnggah() adalah tempat paket,
       kategori, dan katMenu tertinggal lima hari tanpa satu pun galat. */
    w.eval('AN.data.laporan = {}');
    w.eval('UNGGAH_HASIL = Object.assign({ diunggah:"2026-09-15", oleh:"Uji" }, '
      + JSON.stringify(uD) + ')');
    await w.eval('anSimpanUnggah()');
    cek('error bertahan lewat putaran simpan',
        (w.eval('AN.data.laporan["2026-08"].error') || []).length === 3);

    /* ---- layarnya ---- */
    /* Penggambar yang MELEMPAR meninggalkan halaman sebelumnya di layar —
       gejala yang sama dengan Performa Kas yang mati senyap. Ditangkap di
       sini supaya ia jadi asersi merah, bukan suite yang mati di tengah. */
    let lempar = '';
    try { w.go('error'); } catch (err) { lempar = String(err && err.message || err); }
    await tunggu(60);
    cek('halaman Error tidak melempar saat digambar', !lempar, lempar);
    let v = d.getElementById('app-view').innerHTML;
    const kErr = kartuJudul(v, 'Bill yang Ditandai Error');
    cek('ketiga bill tergambar berikut nomornya', !!kErr
        && kErr.indexOf('E1') > -1 && kErr.indexOf('E2') > -1 && kErr.indexOf('E3') > -1, kErr.slice(0, 700));
    cek('nilainya tergambar', kErr.indexOf(w.eval('rp0')(69000)) > -1, kErr.slice(0, 900));
    cek('jenis errornya tergambar berikut yang di luar daftar lima',
        kErr.indexOf('ERROR KASIR') > -1 && kErr.indexOf('ERROR BAR') > -1, kErr.slice(0, 900));
    /* Detail Report TIDAK punya Cashier & Additional Info — dan itu wajib
       DIKATAKAN berikut laporan mana yang memuatnya. Sel kosong tanpa
       keterangan terbaca sebagai data hilang, dan yang membacanya akan
       mengekspor ulang berkas yang sama berkali-kali. */
    cek('kolom yang TIDAK bisa diisi dikatakan, berikut laporan yang memuatnya',
        v.indexOf('tidak memuat') > -1 && v.indexOf('hanya ada di') > -1,
        v.slice(v.indexOf('tidak memuat') - 200, v.indexOf('tidak memuat') + 400));
    const kJenis = kartuJudul(v, 'Per Jenis Error');
    cek('rekap per jenis dihitung dari penanda yang benar-benar ada',
        !!kJenis && kJenis.indexOf('ERROR KASIR') > -1 && kJenis.indexOf('ERROR BAR') > -1,
        kJenis.slice(0, 600));

    /* Baris bisa dibuka, dan menekannya lagi MENUTUPNYA — kalau tidak,
       satu-satunya cara menutup rincian adalah membuka baris lain. */
    cek('rincian menu belum tergambar sebelum barisnya dibuka',
        kErr.indexOf('LONTONG') < 0, kErr.slice(0, 400));
    w.eval('errBuka("E1")'); await tunggu(40);
    v = d.getElementById('app-view').innerHTML;
    cek('baris bisa dibuka dan rincian menunya tergambar',
        kartuJudul(v, 'Bill yang Ditandai Error').indexOf('LONTONG') > -1);
    w.eval('errBuka("E1")'); await tunggu(40);
    cek('menekan baris yang sedang terbuka menutupnya',
        kartuJudul(d.getElementById('app-view').innerHTML, 'Bill yang Ditandai Error').indexOf('LONTONG') < 0);
    dom.window.close();
  }

  /* ---- BILL REPORT: penandanya di Additional Info ---- */
  {
    const { dom } = domAnalytics({});
    await siap(dom.window);
    const w = dom.window;
    const rowsBill = [
      { a:'Sales Date', b:'Bill Number', c:'Grand Total', d:'Visit Purpose',
        e:'Waiter', f:'Cashier', g:'Additional Info' },
      { a:'2026-08-08', b:'E1', c:'69000', d:'DINE IN', e:'TASYA', f:'ANDY', g:'ERROR CASHIER' },
      { a:'2026-08-21', b:'E2', c:'48300', d:'DINE IN', e:'ANDY',  f:'ANDY', g:'ERROR FLOOR' },
      /* Additional Info di bill biasa berisi NAMA TAMU — diukur atas Agustus
         2026: "CHRISTI", "INDAH OFFICE", "office wandi". Ia BUKAN penanda
         error dengan sendirinya, dan membaca kolomnya sebagai penanda akan
         menandai separuh bulan sebagai error. */
      { a:'2026-08-22', b:'E3', c:'50000', d:'DINE IN', e:'FEILA', f:'RIZKI', g:'INDAH OFFICE' }
    ];
    const uB = w.eval('ringkasPos')(rowsBill, 'x.xlsx');
    cek('Bill Report: error terbaca dari Additional Info',
        uB.error.length === 2, JSON.stringify(uB.error.map(e => e.bill)));
    cek('...dan Additional Info berisi NAMA TAMU tidak dianggap error',
        uB.error.filter(e => e.bill === 'E3').length === 0, JSON.stringify(uB.error.map(e => e.bill)));
    /* DIJAGA dari daftar kosong: asersi yang membaca error[0] apa adanya akan
       MELEMPAR begitu sebuah mutasi mengosongkan daftarnya, dan suite-nya mati
       sebelum sempat mencetak ringkasan — mutasinya lalu terbaca "uji tidak
       selesai", bukan "tertangkap". */
    const b1 = uB.error[0] || {};
    cek('...kasirnya ikut — kolom yang TIDAK ada di Detail Report',
        b1.kasir === 'ANDY', String(b1.kasir));
    cek('...begitu juga catatan bebasnya, apa adanya',
        b1.catatan === 'ERROR CASHIER', String(b1.catatan));

    w.eval('AN.data.laporan = {}');
    w.eval('UNGGAH_HASIL = Object.assign({ diunggah:"2026-09-15", oleh:"Uji" }, '
      + JSON.stringify(uB) + ')');
    await w.eval('anSimpanUnggah()');
    w.go('error'); await tunggu(60);
    const v = w.document.getElementById('app-view').innerHTML;
    cek('layar Bill Report menyebut kasirnya', v.indexOf('ANDY') > -1);
    cek('...dan yang kurang di sini RINCIAN MENU, bukan kasir',
        v.indexOf('Rincian menu') > -1 && v.indexOf('kolom <i>Cashier</i>') < 0,
        v.slice(v.indexOf('tidak memuat') - 100, v.indexOf('tidak memuat') + 400));
    dom.window.close();
  }

  /* ---- TIGA keadaan kosong, bentuk datanya nyaris sama, tindakannya beda ---- */
  {
    const dasar = extra => ({ data: { laporan: { '2026-08': Object.assign({
      diunggah:'2026-08-28', oleh:'Wandi', berkas:'x.xlsx', jenis:'menu',
      hari: { '2026-08-01': { bill:10, grand:1000000 } },
      jam: Array.from({ length: 24 }, () => ({ bill:0, grand:0 })),
      menu: {}, kunjung: { 'DINE IN': { grand:1000000, bill:10 } },
      ringkas: { bill:10, grand:1000000, net:900000, svc:0, tax:0, sub:900000,
                 discMenu:0, discBill:0, discVoucher:0, pax:0, billPax:0 }
    }, extra) }, setting: {} }, akses: {}, peran: {} });

    /* 1. Laporan LAMA — kunci error belum pernah ada. */
    {
      const { dom } = domAnalytics({ an: dasar({}) });
      await siap(dom.window);
      let lempar = '';
      try { dom.window.go('error'); } catch (err) { lempar = String(err && err.message || err); }
      await tunggu(60);
      cek('...dan halaman Error tidak melempar untuk bentuk data ini', !lempar, lempar);
      const v = dom.window.document.getElementById('app-view').innerHTML;
      cek('laporan lama: disuruh unggah ulang', v.indexOf('Unggah ulang berkas bulan itu') > -1, v.slice(0, 700));
      dom.window.close();
    }
    /* 2. Sudah dibaca, dan memang TIDAK ADA yang error — itu JAWABAN. */
    {
      const { dom } = domAnalytics({ an: dasar({ error: [],
        ringkas: { bill:10, grand:1000000, errSumber:['Payment Method'] } }) });
      await siap(dom.window);
      let lempar = '';
      try { dom.window.go('error'); } catch (err) { lempar = String(err && err.message || err); }
      await tunggu(60);
      cek('...dan halaman Error tidak melempar untuk bentuk data ini', !lempar, lempar);
      const v = dom.window.document.getElementById('app-view').innerHTML;
      cek('tidak ada error: dikatakan sebagai JAWABAN, bukan data yang belum terbaca',
          v.indexOf('Tidak ada satu pun bill yang ditandai error') > -1
          && v.indexOf('Unggah ulang') < 0, v.slice(0, 700));
      dom.window.close();
    }
    /* 3. Berkasnya tidak punya kolom penandanya sama sekali — BUKAN bulan
       yang bersih, dan menyamakannya membuat yang membacanya menyimpulkan
       tidak ada masalah padahal tidak ada satu pun yang pernah diperiksa. */
    {
      const { dom } = domAnalytics({ an: dasar({ error: [],
        ringkas: { bill:10, grand:1000000, errSumber: [] } }) });
      await siap(dom.window);
      let lempar = '';
      try { dom.window.go('error'); } catch (err) { lempar = String(err && err.message || err); }
      await tunggu(60);
      cek('...dan halaman Error tidak melempar untuk bentuk data ini', !lempar, lempar);
      const v = dom.window.document.getElementById('app-view').innerHTML;
      cek('berkas tanpa kolom penanda DIBEDAKAN dari bulan yang bersih',
          v.indexOf('tidak punya kolom penanda error') > -1
          && v.indexOf('Tidak ada satu pun bill') < 0, v.slice(0, 700));
      dom.window.close();
    }
  }

  console.log('\n== Simpan ringkasan ==');
  {
    const { dom, panggilan } = domAnalytics({});
    await siap(dom.window);
    const w = dom.window;
    w.go('unggah'); await tunggu(40);
    w.eval('UNGGAH_HASIL = { bulan:"2026-08", jenis:"bill", berkas:"x.xlsx", diunggah:"2026-08-28", oleh:"W",'
      + ' hari:{"2026-08-01":{bill:1,grand:100}}, jam:[], menu:{}, ringkas:{bill:1,grand:100},'
      + ' nBaris:1, nLewat:0, blnLain:[], tglAwal:"2026-08-01", tglAkhir:"2026-08-01" }');
    await w.anSimpanUnggah(); await tunggu(150);
    const kirim = panggilan.filter(p => p.body && p.body.action === 'analyticsSave').pop();
    cek('ringkasan dikirim ke server', !!kirim);
    cek('disimpan di bawah bulannya', !!(kirim && kirim.body.data.laporan['2026-08']),
        JSON.stringify(kirim && Object.keys(kirim.body.data.laporan || {})));
    /* Yang dikirim RINGKASANNYA, bukan barisnya: 4.000 bill per bulan berarti
       blob yang harus dibaca utuh tiap kali halaman dibuka. */
    cek('yang dikirim ringkasan, bukan baris mentah',
        !!kirim && JSON.stringify(kirim.body.data).indexOf('Sales Number') < 0);
    cek('pratinjau dibersihkan sesudah tersimpan', w.eval('UNGGAH_HASIL') === null);
    dom.window.close();
  }

  console.log('\n== Simpan gagal ==');
  {
    const { dom } = domAnalytics({ gagalSimpan: true });
    await siap(dom.window);
    const w = dom.window;
    w.go('unggah'); await tunggu(40);
    w.eval('UNGGAH_HASIL = { bulan:"2026-08", jenis:"bill", berkas:"x.xlsx", diunggah:"2026-08-28", oleh:"W",'
      + ' hari:{}, jam:[], menu:{}, ringkas:{bill:1,grand:100}, nBaris:1, nLewat:0, blnLain:[] }');
    await w.anSimpanUnggah(); await tunggu(200);
    /* Gagal simpan harus MENGEMBALIKAN keadaan. Ringkasan yang tertinggal di
       layar padahal server tidak menerimanya akan dibaca sebagai tersimpan. */
    cek('bulan tidak tertinggal di state', !w.eval('AN.data.laporan["2026-08"]'));
    cek('pratinjau dipertahankan supaya bisa dicoba lagi', !!w.eval('UNGGAH_HASIL'));
    dom.window.close();
  }

  /* ================= 10. hak akses ================= */
  console.log('\n== Hak akses ==');
  {
    const an = { data:{ laporan:{}, setting:{} }, akses:{}, peran:{ '#u-wandi':'viewer' } };
    const { dom, panggilan } = domAnalytics({ an, bukanAdmin: true });
    await siap(dom.window);
    const w = dom.window, d = w.document;
    cek('role terbaca viewer', w.peranSaya() === 'viewer', w.peranSaya());
    /* View Only tidak pernah boleh mengunggah — yang bisa mengunggah bisa
       MENIMPA ringkasan bulan yang sudah ada. */
    cek('viewer tidak bisa mengunggah', w.bolehUbah('unggah') === false);
    cek('viewer tidak melihat halaman Unggah sama sekali', w.bolehLihat('unggah') === false);
    cek('viewer tetap boleh membaca analisanya', w.bolehLihat('ringkasan') === true);
    w.go('unggah'); await tunggu(40);
    cek('dilempar ke halaman yang boleh', w.eval('CURRENT') !== 'unggah', w.eval('CURRENT'));
    /* Penjaga sungguhan: fungsinya tetap bisa dipanggil dari console. */
    w.eval('UNGGAH_HASIL = { bulan:"2026-08", jenis:"bill", berkas:"x", diunggah:"2026-08-28", oleh:"W",'
      + ' hari:{}, jam:[], menu:{}, ringkas:{bill:1,grand:1}, nBaris:1, nLewat:0, blnLain:[] }');
    await w.anSimpanUnggah(); await tunggu(120);
    cek('viewer tidak bisa menyimpan walau fungsinya dipanggil langsung',
        panggilan.filter(p => p.body && p.body.action === 'analyticsSave').length === 0);
    dom.window.close();
  }

  /* ================= 11. backend ================= */
  console.log('\n== Backend ==');
  {
    const LIB = fs.readFileSync(path.join(ROOT, 'kompas-mysql', 'lib_kompas_mysql.php'), 'utf8');
    const API = fs.readFileSync(path.join(ROOT, 'kompas-mysql', 'api.php'), 'utf8');
    /* Tabel lahir sendiri, BUKAN lewat berkas migrasi: migrasi tidak ikut
       ter-deploy dan produksi rutin tertinggal. */
    cek('tabel dibuat sendiri', LIB.indexOf('CREATE TABLE IF NOT EXISTS `an_state`') > -1);
    cek('tidak ada berkas migrasi baru',
        !fs.readdirSync(path.join(ROOT, 'kompas-mysql')).some(x => /^migrasi.*analytic/i.test(x)));
    /* TABEL SENDIRI, bukan blob settings milik saveAll: modul Omset mengirim
       SELURUH state-nya tiap menyimpan, jadi menaruh analytics di dalamnya
       berarti satu simpan dari layar Omset menghapus seluruh riwayat. */
    cek('tidak menumpang blob saveAll', LIB.indexOf("get_setting('analytics'") < 0);
    ['analyticsGet','analyticsSave','analyticsAkses','analyticsPeran'].forEach(a =>
      cek('endpoint ' + a + ' ada', API.indexOf("'" + a + "'") > -1));
    cek('matriks akses & peran punya tabel sendiri',
        LIB.indexOf('`an_akses`') > -1 && LIB.indexOf('`an_peran`') > -1);
  }

  /* ================= 12. tapis kelompok, urut kolom, bulan pembanding =======
     Tiga permintaan user 11 September 2026, dan ketiganya menyentuh DUA
     halaman sekaligus (Menu & Bahan Baku dan Kategori Menu) lewat penggambar
     yang sama — thSort/urutKolom/kelOpsi/gabungBanding. Yang diuji karena itu
     bukan "tombolnya ada" melainkan bahwa angka di layar benar-benar berubah
     mengikutinya, di KEDUA halaman.

     FIXTURE-nya sengaja dibuat supaya tiap kesalahan punya tempat untuk
     muncul:

       - nilai tiap menu BERBEDA, jadi tiap sel punya sidik jarinya sendiri
         (pelajaran dari kolom Kontribusi: Rp40.000 yang kebetulan juga nilai
         sebuah baris lain membuat asersi cocok dengan sel yang bukan diuji);
       - urutan menurut NILAI berbeda dari urutan menurut PORSI, kalau tidak
         mutasi "kolom qty diurut pakai nilai" tidak mengubah satu baris pun;
       - urutan menurut ABJAD berbeda dari keduanya;
       - ada menu yang HANYA ada di bulan pembanding, dan ada yang hanya di
         bulan ini — dua-duanya perlu, karena penggabung yang cuma menyalin
         satu arah tetap hijau kalau salah satunya tidak ada;
       - FOOD dan BEVERAGES sama-sama berisi lebih dari satu menu, jadi tapis
         yang tidak menyaring apa pun punya tempat untuk ketahuan. */
  console.log('\n== Tapis kelompok, urut kolom, bulan pembanding ==');
  {
    /* Nilai & porsi dipilih supaya KETIGA urutan berbeda:
         nilai  : ZUPPA(900rb) > AYAM(500rb) > MATCHA(300rb) > BIR(120rb)
         porsi  : BIR(60)      > MATCHA(40)  > AYAM(20)      > ZUPPA(9)
         abjad  : AYAM, BIR, MATCHA, ZUPPA                                  */
    const bulanAgu = {
      diunggah:'2026-09-01', oleh:'W', berkas:'agu.xlsx', jenis:'menu',
      hari:{ '2026-08-01':{ bill:10, grand:2000000 } }, jam:{},
      menu:{
        'AYAM GORENG':   { qty:20, nilai:500000 },
        'ZUPPA SOUP':    { qty:9,  nilai:900000 },
        'MATCHA LATTE':  { qty:40, nilai:300000 },
        /* Baris paket tanpa kategori sendiri — ia melebur ke MATCHA LATTE dan
           membawa kelompok KOSONG. Itu yang membuat penjaga "yang kosong tidak
           menimpa" punya tempat untuk gagal; tanpa baris ini, mencabut penjaga
           itu tidak mengubah satu angka pun. */
        'MATCHA LATTE (PACKAGE)': { qty:3, nilai:0 },
        'BIR BINTANG':   { qty:60, nilai:120000 },
        'ROKOK SAMPOERNA': { qty:5, nilai:75000 }
      },
      kategori:{
        'NUSANTARA':      { qty:29, nilai:1400000, kat:'FOOD' },
        'KOPI & TEH':     { qty:40, nilai:300000,  kat:'BEVERAGES' },
        'MINUMAN KERAS':  { qty:60, nilai:120000,  kat:'BEVERAGES' },
        'TEMBAKAU':       { qty:5,  nilai:75000,   kat:'OTHERS' }
      },
      katMenu:{
        'NUSANTARA':     { 'AYAM GORENG':{qty:20,nilai:500000}, 'ZUPPA SOUP':{qty:9,nilai:900000} },
        'KOPI & TEH':    { 'MATCHA LATTE':{qty:40,nilai:300000} },
        'MINUMAN KERAS': { 'BIR BINTANG':{qty:60,nilai:120000} },
        'TEMBAKAU':      { 'ROKOK SAMPOERNA':{qty:5,nilai:75000} }
      },
      ringkas:{ bill:10, grand:2000000 }
    };
    /* Juli: AYAM & MATCHA ada di kedua bulan (nilainya BERBEDA supaya
       selisihnya punya tanda yang jelas — satu naik, satu turun), SOTO BETAWI
       hanya ada di Juli, ZUPPA & BIR tidak ada di Juli. Kategori SEAFOOD juga
       hanya ada di Juli. */
    const bulanJul = {
      diunggah:'2026-08-01', oleh:'W', berkas:'jul.xlsx', jenis:'menu',
      hari:{ '2026-07-01':{ bill:8, grand:1500000 } }, jam:{},
      menu:{
        'AYAM GORENG':  { qty:12, nilai:400000 },
        'MATCHA LATTE': { qty:50, nilai:375000 },
        'SOTO BETAWI':  { qty:30, nilai:660000 }
      },
      kategori:{
        'NUSANTARA': { qty:42, nilai:1060000, kat:'FOOD' },
        'KOPI & TEH':{ qty:50, nilai:375000,  kat:'BEVERAGES' },
        'SEAFOOD':   { qty:7,  nilai:210000,  kat:'FOOD' }
      },
      katMenu:{
        'NUSANTARA': { 'AYAM GORENG':{qty:12,nilai:400000}, 'SOTO BETAWI':{qty:30,nilai:660000} },
        'KOPI & TEH':{ 'MATCHA LATTE':{qty:50,nilai:375000} },
        'SEAFOOD':   { 'UDANG GORENG':{qty:7,nilai:210000} }
      },
      ringkas:{ bill:8, grand:1500000 }
    };
    const an = { data:{ laporan:{ '2026-08':bulanAgu, '2026-07':bulanJul }, setting:{} },
                 akses:{}, peran:{} };
    /* Resep HPP diberikan supaya perkiraan bahan baku & daftar "belum ada
       resep" benar-benar terhitung — tanpa resep, tapis yang tidak menyaring
       daftar bahan tetap hijau karena daftarnya memang selalu kosong.
       Pelajaran yang sudah dibayar di mutasi "cari bahan tidak menyaring". */
    const hpp = { bahan:[{ id:'b1', nama:'Beras' }, { id:'b2', nama:'Bubuk Matcha' }],
      resep:[
        { id:'r1', nama:'Ayam Goreng',  tipe:'dish', jenis:'food',  yield_qty:1, yield_satuan:'Porsi',
          bahan:[{ ref:'bahan', nama:'Beras', qty:100, satuan:'Gr' }] },
        { id:'r2', nama:'Matcha Latte', tipe:'dish', jenis:'drink', yield_qty:1, yield_satuan:'Porsi',
          bahan:[{ ref:'bahan', nama:'Bubuk Matcha', qty:8, satuan:'Gr' }] }
      ], setting:{} };

    const { dom } = domAnalytics({ an, hpp });
    const w = dom.window, d = w.document;
    await siap(w);
    w.eval("BLN='2026-08'; BLN_BANDING=''; MN_KEL=''; KT_KEL=''; MN_Q='';");
    w.eval("MN_SORT={k:'nilai',turun:true}; KT_SORT={k:'nilai',turun:true}; MN_HAL=1; MN_BUKA='';");
    w.go('menu'); await tunggu(80);

    const vw = () => d.getElementById('app-view').innerHTML;
    const tbl = () => d.getElementById('mn_isi_menu').innerHTML;
    /* Urutan nama menu SEPERTI YANG TERGAMBAR di tabel — dibaca dari selnya,
       bukan dihitung ulang di dalam uji. Asersi yang menghitung sendiri lalu
       membandingkannya dengan hitungannya sendiri lulus juga untuk tabel yang
       tidak pernah diurut. */
    /* &amp; diurai balik. Nama kategori "KOPI & TEH" digambar ter-escape, dan
       itu memang benar — yang tidak boleh adalah asersinya ikut menuliskannya
       ter-escape: kesalahan urutan lalu tenggelam di antara noise, dan yang
       membaca kegagalannya mengira escaping-nya yang rusak. Fixture-nya
       sengaja TETAP memuat "&" supaya escaping-nya ikut terjaga. */
    const teksSel = t => String(t).replace(/&amp;/g, '&').replace(/&quot;/g, '"');
    const urutanTabel = html => {
      const body = html.slice(html.indexOf('<tbody>'));
      return [...body.matchAll(/<td><b>([^<]+)<\/b>/g)].map(m => teksSel(m[1]));
    };
    /* Satu baris tabel menu, dipotong dari <tr> sampai </tr>. */
    const barisMenu = (html, nama) => {
      const i = html.indexOf('<b>' + nama + '</b>');
      if (i < 0) return '';
      return html.slice(html.lastIndexOf('<tr', i), html.indexOf('</tr>', i));
    };

    /* ---- 1. TAPIS KELOMPOK di halaman Menu ---- */
    cek('tapis kelompok digambar di halaman Menu',
        /onclick="mnKel\(&quot;FOOD&quot;\)"/.test(vw()) && /onclick="mnKel\(&quot;BEVERAGES&quot;\)"/.test(vw()),
        vw().slice(vw().indexOf('Penjualan Menu'), vw().indexOf('Penjualan Menu') + 900));
    /* OTHERS sudah dikeluarkan seluruhnya dari halaman ini sejak 10 September
       2026. Tombolnya karena itu TIDAK boleh ada — tombol yang menyaring ke
       daftar yang selalu kosong dilaporkan sebagai halaman rusak. */
    cek('...tanpa OTHERS, yang memang tidak ikut di halaman ini',
        !/onclick="mnKel\(&quot;OTHERS&quot;\)"/.test(vw()));
    cek('...dan sebelum ditekan seluruh menu tampil',
        urutanTabel(tbl()).length === 4, JSON.stringify(urutanTabel(tbl())));

    w.eval("mnKel('BEVERAGES')"); await tunggu(60);
    {
      const isi = tbl(), semua = vw();
      cek('tapis BEVERAGES menyisakan minuman saja',
          urutanTabel(isi).join('|') === 'MATCHA LATTE|BIR BINTANG', JSON.stringify(urutanTabel(isi)));
      /* KARTU IKUT TERSARING. Kartu yang tetap menulis 4 di atas tabel berisi
         2 adalah selisih yang dilaporkan sebagai data hilang. */
      cek('...kartu Menu Berbeda ikut tersaring',
          semua.replace(/\s+/g, ' ').indexOf('Menu Berbeda</div><div class="val mono">2</div>') > -1,
          semua.slice(semua.indexOf('Menu Berbeda') - 40, semua.indexOf('Menu Berbeda') + 160));
      /* Nilai menu = 300.000 + 120.000 = 420.000, BUKAN 1.895.000. */
      cek('...kartu Nilai Menu ikut tersaring', semua.indexOf('Rp420.000') > -1,
          semua.slice(semua.indexOf('Nilai Menu') - 200, semua.indexOf('Nilai Menu') + 120));
      /* BAHAN BAKU ikut: Ayam Goreng (Beras) keluar, Matcha Latte tetap. */
      const bahan = d.getElementById('mn_isi_bahan').innerHTML;
      cek('...perkiraan bahan baku ikut tersaring',
          bahan.indexOf('Bubuk Matcha') > -1 && bahan.indexOf('Beras') < 0, bahan.slice(0, 400));
      /* Daftar "belum ada resep" ikut: BIR BINTANG belum punya resep,
         ZUPPA SOUP (food) tidak boleh ikut muncul. */
      const resep = d.getElementById('mn_isi_resep');
      cek('...daftar menu tanpa resep ikut tersaring',
          !!resep && resep.innerHTML.indexOf('BIR BINTANG') > -1 && resep.innerHTML.indexOf('ZUPPA SOUP') < 0,
          resep ? resep.innerHTML.slice(0, 400) : 'kartu tidak digambar');
      cek('...dan tapis yang menyala dikatakan di layar',
          /sedang disaring ke kelompok/.test(semua));
      /* Penyebut kolom persen ikut menyusut — kalau tidak, kolomnya berhenti
         berjumlah 100% tanpa satu pun tanda. */
      cek('...penyebut kolom persen ikut menyebut kelompoknya',
          /yang berkelompok <\/b>?BEVERAGES|berkelompok BEVERAGES/.test(semua.replace(/<b>|<\/b>/g, '')),
          semua.slice(semua.indexOf('% dari nilai menu</b>'), semua.indexOf('% dari nilai menu</b>') + 400));
    }
    w.eval("mnKel('')"); await tunggu(60);
    cek('melepas tapis mengembalikan seluruh menu', urutanTabel(tbl()).length === 4);

    /* ---- 2. URUT KOLOM di halaman Menu ---- */
    cek('kepala kolom bisa ditekan', /<th class="srt[^"]*" onclick="mnSort\(&quot;qty&quot;\)"/.test(tbl()),
        tbl().slice(0, 500));
    cek('urutan bawaan menurut nilai, dari terbesar',
        urutanTabel(tbl()).join('|') === 'ZUPPA SOUP|AYAM GORENG|MATCHA LATTE|BIR BINTANG',
        JSON.stringify(urutanTabel(tbl())));
    w.eval("mnSort('qty')"); await tunggu(40);
    cek('menekan Qty mengurutkannya menurut porsi',
        urutanTabel(tbl()).join('|') === 'BIR BINTANG|MATCHA LATTE|AYAM GORENG|ZUPPA SOUP',
        JSON.stringify(urutanTabel(tbl())));
    /* BATANGNYA IKUT KOLOM YANG DIURUT. Batang nilai di sebelah tabel terurut
       porsi memajang baris teratas dengan batang TERPENDEK, dan itu terbaca
       sebagai salah hitung — bukan sebagai salah kolom. */
    {
      const brs = barisMenu(tbl(), 'BIR BINTANG');
      cek('...dan batangnya ikut kolom itu, bukan tetap nilai',
          /width:100%/.test(brs), brs.slice(-260));
    }
    w.eval("mnSort('qty')"); await tunggu(40);
    cek('menekan kolom yang sama membalik arahnya',
        urutanTabel(tbl()).join('|') === 'ZUPPA SOUP|AYAM GORENG|MATCHA LATTE|BIR BINTANG',
        JSON.stringify(urutanTabel(tbl())));
    w.eval("mnSort('n')"); await tunggu(40);
    cek('kolom nama mulai dari A, bukan dari Z',
        urutanTabel(tbl()).join('|') === 'AYAM GORENG|BIR BINTANG|MATCHA LATTE|ZUPPA SOUP',
        JSON.stringify(urutanTabel(tbl())));
    cek('...dan urutan yang sedang berlaku disebut di kaki tabel',
        tbl().indexOf('Diurut menurut') > -1 && tbl().indexOf('nama menu') > -1,
        tbl().slice(tbl().indexOf('Menampilkan'), tbl().indexOf('Menampilkan') + 400));
    /* KAKI TABELNYA ADA DI DALAM WADAH YANG DIGAMBAR ULANG. Kalimat urutan
       yang ditulis di card-sub (di LUAR #mn_isi_menu) akan membeku di urutan
       pertama dan berbohong sejak klik pertama. */
    cek('...dan kalimat itu TIDAK ditulis di luar wadahnya',
        vw().indexOf('<div class="card-sub">Diurut menurut') < 0);
    /* Menekan kepala kolom TIDAK boleh membuat ulang kotak cari — render()
       di modul ini TOTAL, dan kotak yang dibuat ulang kehilangan fokus.
       Jebakan yang sama sudah dibayar di queueF() modul Konten. */
    {
      const kotak = d.getElementById('mn_q');
      w.eval("mnSort('nilai')"); await tunggu(40);
      cek('mengurutkan TIDAK membuat ulang kotak cari',
          d.getElementById('mn_q') === kotak,
          'kotaknya diganti elemen baru — fokus hilang dan hanya huruf pertama yang masuk');
    }
    /* Saklar "Menurut Nilai / Menurut Porsi" dan kepala kolom memakai SATU
       keadaan. Dua keadaan membuat saklar menyala di Nilai sementara tabelnya
       terurut porsi, tanpa satu pun galat. */
    /* SAKLAR IKUT MENYALA MENGIKUTI KEPALA KOLOM. Keadaannya memang sudah satu
       (MN_SORT), tapi saklarnya berdiri di LUAR #mn_isi_menu — tanpa penyegar
       tersendiri ia membeku di urutan terakhir kali halaman digambar, dan
       tabelnya terurut porsi sementara saklarnya menyala di "Nilai". */
    w.eval("mnSort('qty')"); await tunggu(40);
    {
      const seg = d.getElementById('mn_seg_urut');
      const isi = seg ? seg.innerHTML : '';
      cek('saklar lama ikut menyala mengikuti kepala kolom',
          /class="active"[^>]*onclick="mnUrut\('qty'\)"/.test(isi)
          && !/class="active"[^>]*onclick="mnUrut\('nilai'\)"/.test(isi), isi);
      /* Wadah saklarnya BOLEH dibuat ulang isinya, tapi elemen wadahnya sendiri
         tidak perlu diganti — dan kotak cari di baris yang sama TIDAK BOLEH
         ikut tersentuh. */
      const kotak = d.getElementById('mn_q');
      w.eval("mnSort('nilai')"); await tunggu(40);
      cek('...tanpa menyentuh kotak cari di baris yang sama',
          d.getElementById('mn_q') === kotak);
      cek('...dan menyala balik ke Nilai',
          /class="active"[^>]*onclick="mnUrut\('nilai'\)"/.test(d.getElementById('mn_seg_urut').innerHTML));
    }
    w.eval("mnSort('qty')"); await tunggu(40);
    w.eval("mnUrut('nilai')"); await tunggu(40);
    cek('...dan menekan saklarnya mengurutkan tabelnya',
        urutanTabel(tbl())[0] === 'ZUPPA SOUP', JSON.stringify(urutanTabel(tbl())));

    /* ---- 3. BULAN PEMBANDING di halaman Menu ---- */
    cek('pemilih bulan pembanding digambar', vw().indexOf('Bandingkan dengan') > -1);
    /* Bulan yang SEDANG dibuka tidak ditawarkan: membandingkan sebuah bulan
       dengan dirinya sendiri memajang kolom selisih nol yang tidak menjawab
       apa pun. */
    {
      const i = vw().indexOf('bandingPilih');
      const sel = vw().slice(i, vw().indexOf('</select>', i));
      cek('...tanpa menawarkan bulan yang sedang dibuka',
          sel.indexOf('value="2026-07"') > -1 && sel.indexOf('value="2026-08"') < 0, sel);
    }
    w.eval("bandingPilih('2026-07')"); await tunggu(80);
    {
      const isi = tbl();
      cek('kolom bulan pembanding ditambahkan',
          isi.indexOf('Nilai Jul 2026') > -1 && isi.indexOf('Selisih nilai') > -1, isi.slice(0, 700));
      /* AYAM GORENG: 500.000 vs 400.000 -> +100.000 (+25%) */
      const a = barisMenu(isi, 'AYAM GORENG');
      cek('...angka bulan pembanding dibaca dari bulan itu',
          a.indexOf('Rp400.000') > -1 && a.indexOf('>12<') > -1, a);
      cek('...selisihnya bertanda dan berpersen',
          a.indexOf('+Rp100.000') > -1 && a.indexOf('+25%') > -1, a);
      /* MATCHA LATTE: 300.000 vs 375.000 -> turun 75.000 (-20%) */
      const m = barisMenu(isi, 'MATCHA LATTE');
      cek('...yang turun diberi tanda minus, bukan tanda yang sama',
          m.indexOf('−Rp75.000') > -1 && m.indexOf('−20%') > -1, m);
      cek('...dan diberi kelas warna yang berbeda',
          /class="num naik"/.test(a) && /class="num turun"/.test(m));
      /* MENU YANG HANYA ADA DI BULAN PEMBANDING wajib ikut — itu justru
         pertanyaan yang paling sering dibawa orang ke pembanding: menu apa
         yang HILANG bulan ini. */
      const st = barisMenu(isi, 'SOTO BETAWI');
      cek('menu yang hanya ada di bulan pembanding tetap muncul', !!st, 'barisnya tidak digambar');
      cek('...ditandai, bukan dibiarkan terbaca sebagai terjual nol porsi',
          st.indexOf('tidak ada bulan ini') > -1, st);
      cek('...dan nilainya bulan ini nol, bukan disalin dari pembandingnya',
          st.indexOf('Rp0') > -1 && st.indexOf('Rp660.000') > -1, st);
      /* ZUPPA SOUP tidak ada di Juli: kolom pembandingnya nol, dan persennya
         DITAHAN — menu yang bulan lalu tidak ada tidak punya persen
         pertumbuhan yang berarti, dan angka yang dikarang di sana dibaca
         sebagai lonjakan yang sesungguhnya. */
      const z = barisMenu(isi, 'ZUPPA SOUP');
      cek('...persen ditahan kalau pembandingnya nol',
          z.indexOf('+Rp900.000') > -1 && !/[+−]\d+%/.test(z), z);
    }
    /* INVARIAN TERPENTING: pembanding TIDAK boleh menggeser satu pun angka
       bulan ini. Kartu, penyebut persen, dan perkiraan bahan baku semuanya
       tetap milik bulan yang sedang dibuka — kalau ikut bergerak, halaman ini
       berhenti bisa dibandingkan dengan berkas POS-nya sendiri. */
    {
      const semua = vw();
      cek('kartu Menu Berbeda TIDAK ikut menghitung baris pembanding',
          semua.replace(/\s+/g, ' ').indexOf('Menu Berbeda</div><div class="val mono">4</div>') > -1,
          semua.slice(semua.indexOf('Menu Berbeda') - 40, semua.indexOf('Menu Berbeda') + 160));
      cek('...begitu juga kartu Nilai Menu', semua.indexOf('Rp1.820.000') > -1,
          semua.slice(semua.indexOf('Nilai Menu') - 220, semua.indexOf('Nilai Menu') + 120));
      /* Bahan baku: Beras dari 20 porsi Ayam Goreng bulan INI = 2.000 Gr.
         Kalau porsi Juli ikut (12 porsi), angkanya jadi 3.200. */
      const bahan = d.getElementById('mn_isi_bahan').innerHTML;
      cek('perkiraan bahan baku tetap dari porsi bulan ini saja',
          bahan.indexOf('2.000') > -1 && bahan.indexOf('3.200') < 0, bahan.slice(0, 500));
      /* Selisih jumlah baris tabel vs kartu WAJIB dikatakan — kaki tabel
         menulis 5 sementara kartunya 4, dan selisih tanpa keterangan
         dilaporkan sebagai salah hitung. */
      cek('selisih jumlah baris terhadap kartunya dikatakan',
          tbl().indexOf('tidak ada bulan ini dan ikut karena') > -1,
          tbl().slice(tbl().indexOf('Menampilkan'), tbl().indexOf('Menampilkan') + 400));
    }
    /* Kolom pembanding ikut bisa diurut — "menu mana yang paling anjlok"
       adalah pertanyaan yang cuma bisa dijawab dengan mengurutkan selisihnya,
       dan itu justru alasan kolomnya ada. */
    w.eval("mnSort('dnilai')"); await tunggu(40);
    cek('kolom selisih bisa diurut', urutanTabel(tbl())[0] === 'ZUPPA SOUP',
        JSON.stringify(urutanTabel(tbl())));
    w.eval("mnSort('dnilai')"); await tunggu(40);
    cek('...dan dibalik, yang paling anjlok berdiri paling atas',
        urutanTabel(tbl())[0] === 'SOTO BETAWI', JSON.stringify(urutanTabel(tbl())));
    w.eval("mnSort('nilai')"); await tunggu(40);

    /* Rincian satu menu ikut menyebut bulan pembanding — barisnya sendiri
       terdorong ke atas layar begitu rinciannya terbuka. */
    w.eval("mnBuka('AYAM GORENG')"); await tunggu(60);
    cek('rincian menu menyebut porsi bulan pembanding',
        vw().indexOf('Bulan Jul 2026') > -1 && vw().indexOf('porsi. Bahan di bawah') > -1,
        vw().slice(vw().indexOf('Untuk <b>'), vw().indexOf('Untuk <b>') + 400));
    w.eval("mnBuka('AYAM GORENG')"); await tunggu(60);

    /* Bulan pembanding yang laporannya Bill Report tidak punya satu pun nama
       menu. Itu DIKATAKAN — kolom penuh nol terbaca sebagai "bulan itu tidak
       menjual apa-apa", dan kolom yang tidak muncul sama sekali terbaca
       sebagai halaman rusak. */
    w.eval('AN.data.laporan["2026-07"] = ' + JSON.stringify({
      diunggah:'2026-08-01', oleh:'W', berkas:'jul.xlsx', jenis:'bill',
      hari:{ '2026-07-01':{ bill:8, grand:1500000 } }, jam:{}, menu:{},
      ringkas:{ bill:8, grand:1500000 }
    }));
    w.go('menu'); await tunggu(80);
    cek('pembanding tanpa nama menu dikatakan sebabnya',
        vw().indexOf('tidak bisa dibandingkan di halaman ini') > -1
        && vw().indexOf('Bill Report') > -1, vw().slice(0, 400));
    cek('...dan kolom pembandingnya tidak digambar', tbl().indexOf('Selisih nilai') < 0);
    w.eval('AN.data.laporan["2026-07"] = ' + JSON.stringify(bulanJul));

    /* ---- 4. HALAMAN KATEGORI: tapis, urut, pembanding ---- */
    w.eval("BLN_BANDING=''; KT_KEL=''; KT_SORT={k:'nilai',turun:true}; KT_BUKA='';");
    w.go('kategori'); await tunggu(80);
    const urutanKat = html => {
      const body = html.slice(html.indexOf('<tbody>'));
      return [...body.matchAll(/<td><b>([^<]+)<\/b>/g)].map(m => teksSel(m[1]));
    };
    cek('tapis kelompok digambar di halaman Kategori',
        /onclick="ktKel\(&quot;FOOD&quot;\)"/.test(vw()) && /onclick="ktKel\(&quot;OTHERS&quot;\)"/.test(vw()),
        vw().slice(vw().indexOf('Per Kategori'), vw().indexOf('Per Kategori') + 900));
    /* OTHERS MEMANG ADA di halaman ini — beda dari halaman Menu, tempat ia
       dikeluarkan seluruhnya. Tombol yang tidak digambar untuknya berarti
       barisnya tidak bisa dicapai dari mana pun. */
    cek('...termasuk OTHERS, yang di halaman ini memang tampil',
        urutanKat(vw()).indexOf('TEMBAKAU') > -1, JSON.stringify(urutanKat(vw())));
    cek('urutan bawaan kategori menurut nilai',
        urutanKat(vw()).join('|') === 'NUSANTARA|KOPI & TEH|MINUMAN KERAS|TEMBAKAU',
        JSON.stringify(urutanKat(vw())));
    w.eval("ktSort('qty')"); await tunggu(60);
    cek('kepala kolom kategori bisa diurut menurut porsi',
        urutanKat(vw()).join('|') === 'MINUMAN KERAS|KOPI & TEH|NUSANTARA|TEMBAKAU',
        JSON.stringify(urutanKat(vw())));
    w.eval("ktSort('n')"); await tunggu(60);
    cek('...dan menurut nama, dari A',
        urutanKat(vw())[0] === 'KOPI & TEH', JSON.stringify(urutanKat(vw())));
    w.eval("ktSort('nilai')"); await tunggu(60);

    w.eval("ktKel('BEVERAGES')"); await tunggu(60);
    {
      const semua = vw();
      cek('tapis kategori menyisakan kelompoknya saja',
          urutanKat(semua).join('|') === 'KOPI & TEH|MINUMAN KERAS', JSON.stringify(urutanKat(semua)));
      /* KARTUNYA SENGAJA TIDAK IKUT TERSARING — ia justru jawaban atas
         "seberapa besar tiap kelompok", yang hilang kalau ia menyusut jadi
         satu kartu. Bedanya dari halaman Menu, dan perbedaan itu dikatakan. */
      /* DIBACA DARI LABEL KARTUNYA (kartu() menulis <div class="lab">…</div>),
         BUKAN dari '>FOOD<' — tombol tapis di halaman yang sama juga berbunyi
         >FOOD</button>, jadi asersi itu cocok dengan tombolnya dan hijau walau
         kartunya ikut tersaring. Asersi hampa lebih berbahaya daripada tidak
         ada asersi. */
      cek('...tapi ketiga kartu kelompok TIDAK ikut tersaring',
          semua.indexOf('<div class="lab">FOOD</div>') > -1
          && semua.indexOf('<div class="lab">OTHERS</div>') > -1,
          semua.slice(semua.indexOf('grid g3'), semua.indexOf('grid g3') + 700));
      cek('...dan perbedaannya dikatakan di layar',
          semua.indexOf('tetap menghitung seluruh kelompok') > -1);
      cek('...kaki tabel menyebut tapisnya', semua.indexOf('kelompok <b>BEVERAGES</b> saja') > -1,
          semua.slice(semua.indexOf('Total Rp'), semua.indexOf('Total Rp') + 300));
    }
    w.eval("ktKel('')"); await tunggu(60);

    w.eval("bandingPilih('2026-07')"); await tunggu(80);
    {
      const semua = vw();
      cek('kolom pembanding ditambahkan di halaman Kategori',
          semua.indexOf('Nilai Jul 2026') > -1, semua.slice(semua.indexOf('Per Kategori'), semua.indexOf('Per Kategori') + 1200));
      /* NUSANTARA: 1.400.000 vs 1.060.000 -> +340.000 */
      const i = semua.indexOf('<b>NUSANTARA</b>');
      const brs = semua.slice(semua.lastIndexOf('<tr', i), semua.indexOf('</tr>', i));
      cek('...angkanya dari bulan itu berikut selisihnya',
          brs.indexOf('Rp1.060.000') > -1 && brs.indexOf('+Rp340.000') > -1, brs);
      /* SEAFOOD hanya ada di Juli — dan kelompoknya (FOOD) harus ikut
         terbaca, kalau tidak ia lenyap begitu tapis FOOD ditekan. */
      cek('kategori yang hanya ada di bulan pembanding ikut muncul',
          urutanKat(semua).indexOf('SEAFOOD') > -1, JSON.stringify(urutanKat(semua)));
      const j = semua.indexOf('<b>SEAFOOD</b>');
      const brsS = semua.slice(semua.lastIndexOf('<tr', j), semua.indexOf('</tr>', j));
      cek('...ditandai tidak ada bulan ini', brsS.indexOf('tidak ada bulan ini') > -1, brsS);
      cek('...dan kelompoknya tetap terbaca dari bulan pembandingnya',
          brsS.indexOf('>FOOD<') > -1, brsS);
      /* Jumlah Menu-nya milik BULAN INI, dan untuk baris yang tidak ada
         bulan ini ia tanda hubung — bukan 0, yang berarti kategori itu
         memang tidak punya menu. */
      cek('...jumlah menunya tanda hubung, bukan 0',
          brsS.indexOf('—') > -1, brsS);
    }
    /* Kategori yang cuma ada di bulan pembanding TIDAK boleh ikut ke penyebut
       persen maupun total — ia tidak membawa satu rupiah pun bulan ini. */
    cek('total kaki tabel tetap milik bulan ini',
        vw().indexOf('Total Rp1.895.000') > -1,
        vw().slice(vw().indexOf('Total Rp'), vw().indexOf('Total Rp') + 200));
    /* Tapis kelompok harus tetap bisa menjangkau baris pembanding. */
    w.eval("ktKel('FOOD')"); await tunggu(60);
    cek('baris pembanding ikut tersaring kelompoknya, bukan lenyap',
        urutanKat(vw()).indexOf('SEAFOOD') > -1 && urutanKat(vw()).indexOf('TEMBAKAU') < 0,
        JSON.stringify(urutanKat(vw())));
    w.eval("ktKel('')"); await tunggu(60);

    /* ---- 5. RINCIAN KATEGORI: perbandingan per menu ----
       Inilah tempat "analisa masing-masing sub menu bisa dibandingin dengan
       bulan lain" benar-benar dijawab per menu. */
    w.eval("ktBuka('NUSANTARA')"); await tunggu(60);
    {
      const semua = vw();
      const i = semua.indexOf('menu di kategori');
      const blok = semua.slice(i, semua.indexOf('</table>', i));
      cek('rincian kategori memuat kolom bulan pembanding',
          blok.indexOf('Nilai Jul 2026') > -1, blok.slice(0, 600));
      cek('...AYAM GORENG berdampingan dengan angka Juli-nya',
          blok.indexOf('Rp400.000') > -1 && blok.indexOf('+Rp100.000') > -1, blok.slice(0, 900));
      /* SOTO BETAWI ada di NUSANTARA Juli tapi tidak bulan ini — dan itu
         justru baris yang paling dicari orang saat membandingkan. */
      cek('...dan menu yang hilang bulan ini ikut disebut',
          blok.indexOf('SOTO BETAWI') > -1 && blok.indexOf('tidak ada bulan ini') > -1,
          blok.slice(0, 1200));
      cek('...berikut jumlahnya di kepala rinciannya',
          semua.indexOf('yang tidak ada bulan ini') > -1,
          semua.slice(i - 200, i + 200));
    }
    /* Tanpa pembanding, rinciannya kembali ke bentuk semula — kepala kolom
       yang tetap tergambar untuk bulan yang tidak dipilih memajang dua kolom
       kosong yang terbaca sebagai data gagal dimuat. */
    w.eval("bandingPilih('')"); await tunggu(80);
    w.eval("ktBuka('NUSANTARA')");
    if (w.eval('KT_BUKA') !== 'NUSANTARA') { w.eval("ktBuka('NUSANTARA')"); }
    await tunggu(60);
    {
      const semua = vw();
      const i = semua.indexOf('menu di kategori');
      const blok = semua.slice(i, semua.indexOf('</table>', i));
      cek('tanpa pembanding rinciannya kembali dua kolom',
          blok.indexOf('Nilai Jul 2026') < 0 && blok.indexOf('AYAM GORENG') > -1, blok.slice(0, 500));
    }

    /* ---- 6. bulan pembanding yang tidak lagi masuk akal ----
       Bulan aktif bisa BERGANTI sesudah pembandingnya dipilih. Kalau syaratnya
       cuma diperiksa saat memilih, sebuah bulan bisa berakhir membandingkan
       dirinya sendiri — satu kolom selisih nol yang tidak menjawab apa pun. */
    w.eval("bandingPilih('2026-07'); BLN='2026-07';");
    cek('pembanding yang sama dengan bulan aktif dimatikan sendiri',
        w.eval('blnBandingAktif()') === '');
    w.eval("BLN='2026-08';");
    cek('...dan hidup lagi begitu bulan aktifnya berpindah',
        w.eval('blnBandingAktif()') === '2026-07');
    w.eval("BLN_BANDING='2026-01';");
    cek('bulan pembanding yang laporannya tidak ada dimatikan sendiri',
        w.eval('blnBandingAktif()') === '');
    w.eval("BLN_BANDING='';");

    /* ---- 7. urutKolom: yang kosong selalu di bawah ----
       Diuji sebagai UNIT. Kolom pembanding untuk baris yang tidak ada di bulan
       itu bernilai null, dan kalau ia ikut diurut sebagai nol maka membalik
       arah memajang satu layar penuh baris kosong — persis di tempat yang
       paling dicari. */
    {
      const baris = [{ n:'A', v:5 }, { n:'B', v:null }, { n:'C', v:9 }];
      const t = w.eval('urutKolom')(baris, { k:'v', turun:true }).map(x => x.n).join('');
      const n = w.eval('urutKolom')(baris, { k:'v', turun:false }).map(x => x.n).join('');
      cek('yang kosong di bawah saat menurun', t === 'CAB', t);
      cek('...dan tetap di bawah saat menaik', n === 'ACB', n);
      /* Memulangkan SALINAN: daftar yang dipakai kartu di atas tabel tidak
         boleh ikut berubah urutannya. */
      cek('...dan daftar aslinya tidak ikut diurut', baris.map(x => x.n).join('') === 'ABC');
      /* Yang sama besar dipisah NAMANYA — urutan yang berubah sendiri tiap
         render membuat baris melompat saat halaman digambar ulang. */
      const sama = [{ n:'Z', v:5 }, { n:'A', v:5 }];
      cek('...yang sama besar diurut menurut nama, bukan dibiarkan',
          w.eval('urutKolom')(sama, { k:'v', turun:true }).map(x => x.n).join('') === 'AZ');
    }

    /* ---- 7b. INVARIAN YANG MEMBUAT DUA MUTASI JADI EKUIVALEN ----

       Dua mutasi sengaja dibiarkan LOLOS di uji mutasi, dan keduanya
       EKUIVALEN — bukan cacat uji:

         - penyebut kolom persen memakai `baris` alih-alih `urut`
         - total kaki tabel Kategori memakai `list` alih-alih `listKini`

       Keduanya memulangkan angka yang SAMA PERSIS, dan sebabnya satu: baris
       yang hanya ada di bulan pembanding selalu bernilai NOL untuk bulan ini,
       jadi ia tidak menggeser satu penjumlahan pun.

       Ekuivalensi itu BERGANTUNG pada invarian ini, bukan pada kebetulan
       fixture — jadi yang dikunci invariannya. Kalau suatu hari gabungBanding
       ikut membawa nilai bulan pembanding ke kolom bulan ini, kedua mutasi itu
       berhenti ekuivalen DAN asersi ini yang berbunyi lebih dulu. */
    {
      const g = w.eval('gabungBanding')(
        [{ n:'A', qty:1, nilai:10, kel:'FOOD' }],
        { 'A': { qty:2, nilai:20 }, 'B': { qty:5, nilai:50, kel:'BEVERAGES' } });
      const a = g.find(x => x.n === 'A'), b = g.find(x => x.n === 'B');
      cek('baris bulan ini tidak ikut ditimpa nilai pembandingnya',
          a.qty === 1 && a.nilai === 10 && a.bqty === 2 && a.bnilai === 20, JSON.stringify(a));
      cek('baris yang HANYA ada di bulan pembanding bernilai NOL bulan ini',
          b.qty === 0 && b.nilai === 0 && b.bqty === 5 && b.bnilai === 50, JSON.stringify(b));
      cek('...dan ditandai, bukan disamakan dengan yang terjual nol porsi',
          b.ada === false && a.ada === true);
      cek('...kelompoknya diambil dari bulan pembandingnya', b.kel === 'BEVERAGES');
      cek('selisihnya dihitung dua-duanya', a.dnilai === -10 && b.dnilai === -50);
    }

    /* ---- 8. kelMenu: laporan lama tidak punya kelompok sama sekali ---- */
    {
      const kel = w.eval('kelMenu')(bulanAgu);
      cek('kelompok dibaca lewat kategori detailnya',
          kel['AYAM GORENG'] === 'FOOD' && kel['MATCHA LATTE'] === 'BEVERAGES',
          JSON.stringify(kel));
      cek('laporan tanpa katMenu memulangkan peta kosong',
          Object.keys(w.eval('kelMenu')({ menu: bulanAgu.menu })).length === 0);
      cek('...dan menuNormal menandainya, bukan menyamakannya dengan kosong',
          w.eval('menuNormal')({ menu: bulanAgu.menu }).adaKel === false
          && w.eval('menuNormal')(bulanAgu).adaKel === true);
    }
    dom.window.close();
  }

  /* ================= 13. Performa Talent =====================================
     Permintaan user 11 September 2026: kontribusi omset tiap penampil,
     "sesuai dengan jamnya".

     Yang diuji di sini BUKAN tampilannya melainkan ARITMETIKANYA, dan tiap
     angka di fixture dipilih supaya punya sidik jarinya sendiri — dua sel yang
     kebetulan bernilai sama membuat asersi cocok dengan sel yang bukan diuji,
     pelajaran yang sudah dibayar di kolom Kontribusi dan di rata-rata per
     transaksi Metode Kunjungan.

     BERKAS POS-nya DIBUAT DI SINI sebagai CSV dan didorong lewat jalur unggah
     yang SUNGGUHAN (anPilihBerkas -> uraiPos -> anSimpanUnggah). Menyuntikkan
     hariJam langsung ke AN.data.laporan akan melewati persis baris yang paling
     mungkin rusak: daftar kunci tertutup di anSimpanUnggah(), tempat paket,
     kategori, dan katMenu pernah tertinggal lima hari tanpa satu pun galat
     sementara 260 pemeriksaan tetap hijau. */
  console.log('\n== Performa Talent ==');
  {
    /* ---- berkas POS tiruan ----
       Empat malam, dan tiap malam dirancang menjawab satu pertanyaan:

         2026-09-02  band 20-23 + DJ 22:30-01:30  -> tumpang tindih di jam 22,
                                                     DJ menyeberang tengah malam
         2026-09-03  TANPA penampil               -> pembanding jam yang sama
         2026-09-04  dua band di jam yang sama    -> gabungan, bukan jumlah
         2026-09-05  penampil dibatalkan          -> tidak boleh ikut

       Nilai tiap jam BERBEDA supaya salah jam punya tempat untuk ketahuan. */
    const JAM = {
      '2026-09-02': { 19:1000000, 20:2000000, 21:3000000, 22:4000000, 23:5000000 },
      '2026-09-03': { 19:1100000, 20:1200000, 21:1300000, 22:1400000, 23:1500000 },
      '2026-09-04': { 20:6000000, 21:7000000 },
      '2026-09-05': { 20:800000, 21:900000 },
      /* Jam dini hari milik malam tanggal 2 — di POS ia tercatat di tanggal
         berikutnya, dan itu yang membuat penyeberangan tengah malam bisa diuji. */
      '2026-09-03T': {}
    };
    JAM['2026-09-03'][0] = 2500000;
    JAM['2026-09-03'][1] = 1700000;
    delete JAM['2026-09-03T'];

    const baris = ['Sales Date,Sales Number,Sales In Time,Visit Purpose,Grand Total,Net Sales,Service Charge,Tax Total'];
    let no = 0;
    Object.keys(JAM).sort().forEach(t => {
      Object.keys(JAM[t]).forEach(j => {
        no++;
        baris.push(t + ',SLM' + String(100000 + no) + ',' + String(j).padStart(2, '0') + ':15:00'
          + ',DINE IN,' + JAM[t][j] + ',' + JAM[t][j] + ',0,0');
      });
    });
    const csv = baris.join('\n');

    /* ---- jadwal talent tiruan, lewat event-api ---- */
    const talents = [
      { id:'t1', name:'James Project', category:'Band' },
      { id:'t2', name:'Fuego',         category:'DJ' },
      { id:'t3', name:'Pennykids',     category:'MC DJ' },
      { id:'t4', name:'Amerta',        category:'Band' },
      { id:'t5', name:'Vie',           category:'DJ' },
      { id:'t6', name:'A Deeps',       category:'DJ' },
      { id:'t7', name:'Minor Feel',     category:'Band' }
    ];
    const schedules = [
      { id:'s1', talent_id:'t1', date:'2026-09-02', start_time:'20:00', end_time:'23:00', status:'Done' },
      /* Menyeberang tengah malam: jam 22 & 23 tanggal 2, lalu jam 0 & 1
         tanggal 3. Jam 22 juga diklaim band di atas — tumpang tindih. */
      { id:'s2', talent_id:'t2', date:'2026-09-02', start_time:'22:30', end_time:'01:30', status:'Confirmed' },
      /* Dua band di jam yang SAMA: kategorinya harus menggabungkan jamnya,
         bukan menjumlahkannya. */
      { id:'s3', talent_id:'t1', date:'2026-09-04', start_time:'20:00', end_time:'22:00', status:'Done' },
      { id:'s4', talent_id:'t4', date:'2026-09-04', start_time:'20:00', end_time:'22:00', status:'Done' },
      /* Dibatalkan: tidak pernah tampil, jadi omset jam itu bukan miliknya. */
      { id:'s5', talent_id:'t5', date:'2026-09-05', start_time:'20:00', end_time:'22:00', status:'Cancelled' },
      /* BERPASANGAN dengan DJ di jam yang SAMA (s2) — inilah bentuk yang
         dikatakan user, dan yang membuat baris "DJ + MC DJ" bisa membedakan
         gabungan dari penjumlahan: gabungan 13,2jt, dijumlahkan 26,4jt. */
      { id:'s6', talent_id:'t3', date:'2026-09-02', start_time:'22:30', end_time:'01:30', status:'Done' },
      /* Jamnya tidak terbaca: TIDAK ditebak, dan disebut di layar. */
      { id:'s7', talent_id:'t6', date:'2026-09-05', start_time:'', end_time:'', status:'Done' },
      /* TANGGAL YANG TIDAK ADA DI BERKAS POS. Kontribusinya tidak bisa
         dihitung, dan itu harus DIKATAKAN — bukan ditulis 0%, yang berarti
         tidak ada satu rupiah pun masuk di jam tampilnya. Tanpa baris ini,
         cabang itu tidak pernah dijalankan sekali pun. */
      { id:'s8', talent_id:'t7', date:'2026-09-08', start_time:'20:00', end_time:'22:00', status:'Done' }
    ];

    const { dom } = domAnalytics({ event: [], eventRaw: { talents, schedules } });
    const w = dom.window, d = w.document;
    await siap(w);

    /* ---- unggah lewat jalur sungguhan ---- */
    const file = new w.File([csv], 'pos-sep.csv', { type:'text/csv' });
    file.text = async () => csv;
    file.arrayBuffer = async () => new TextEncoder().encode(csv).buffer;
    w.eval('UNGGAH_HASIL = null');
    await w.anPilihBerkas({ files: [file] });
    for (let i = 0; i < 200 && !w.eval('UNGGAH_HASIL'); i++) await tunggu(25);
    const u = w.eval('UNGGAH_HASIL');
    cek('berkas POS tiruan terbaca', !!u && u.bulan === '2026-09', u ? u.bulan : 'null');

    /* ---- hariJam: diurai DAN tersimpan ---- */
    cek('omset diurai per tanggal per jam',
        !!(u.hariJam && u.hariJam['2026-09-02'] && u.hariJam['2026-09-02'][21]),
        JSON.stringify(Object.keys(u.hariJam || {})));
    cek('...angkanya per jam, bukan diratakan',
        u.hariJam['2026-09-02'][21].g === 3000000 && u.hariJam['2026-09-02'][22].g === 4000000,
        JSON.stringify(u.hariJam['2026-09-02']));
    /* Jumlah per tanggal WAJIB sama dengan hari[].grand — dua penjumlahan
       untuk angka yang sama pasti berbeda suatu hari, dan yang berbeda di sini
       membuat kolom persen berhenti berjumlah masuk akal. */
    {
      let cocokSemua = true;
      Object.keys(u.hari).forEach(t => {
        const jum = Object.keys(u.hariJam[t] || {}).reduce((a, j) => a + u.hariJam[t][j].g, 0);
        if (Math.abs(jum - u.hari[t].grand) > 1) cocokSemua = false;
      });
      cek('jumlah per jam sama dengan omset hari itu', cocokSemua);
    }
    /* DAFTAR KUNCI TERTUTUP — tempat tiga kunci pernah tertinggal lima hari. */
    await w.eval('anSimpanUnggah()'); await tunggu(150);
    cek('hariJam ikut TERSIMPAN, tidak dibuang daftar kunci tertutup',
        !!w.eval('AN.data.laporan["2026-09"].hariJam'),
        JSON.stringify(Object.keys(w.eval('AN.data.laporan["2026-09"]') || {})));

    /* ---- talSlot: jam yang diklaim satu penampilan ---- */
    {
      const sl = w.eval('talSlot')({ tgl:'2026-09-02', mulai:'20:00', selesai:'23:00' });
      cek('20:00-23:00 menempati jam 20, 21, 22 — bukan 23',
          sl.jam.map(x => x.jam).join(',') === '20,21,22', JSON.stringify(sl.jam));
      const w2 = w.eval('talSlot')({ tgl:'2026-09-02', mulai:'22:30', selesai:'01:30' });
      cek('yang lewat tengah malam pindah TANGGAL, bukan membungkus di hari yang sama',
          w2.jam.map(x => x.tgl + '|' + x.jam).join(' ')
            === '2026-09-02|22 2026-09-02|23 2026-09-03|0 2026-09-03|1',
          JSON.stringify(w2.jam));
      const w3 = w.eval('talSlot')({ tgl:'2026-09-02', mulai:'20:00', selesai:'22:30' });
      cek('jam yang tersentuh sebagian tetap ikut',
          w3.jam.map(x => x.jam).join(',') === '20,21,22', JSON.stringify(w3.jam));
      cek('jam yang tidak terbaca memulangkan null, bukan ditebak',
          w.eval('talSlot')({ tgl:'2026-09-02', mulai:'', selesai:'' }) === null
          && w.eval('talSlot')({ tgl:'2026-09-02', mulai:'20:00', selesai:'' }) === null);
      cek('...dan jam di luar 0-23 ditolak',
          w.eval('talMenit')('25:00') === null && w.eval('talMenit')('20:75') === null
          && w.eval('talMenit')('20:00') === 1200);
    }

    /* ---- halamannya ---- */
    w.eval("BLN='2026-09'; TL_Q=''; TL_SORT={k:'omset',turun:true};");
    w.go('talent'); await tunggu(80);
    const vw = () => d.getElementById('app-view').innerHTML;
    cek('halaman Performa Talent tergambar', vw().indexOf('Per Penampil') > -1, vw().slice(0, 300));
    cek('kartu omset di jam tampil menggabungkan jam, bukan menjumlahkannya',
        vw().indexOf('Rp31.200.000') > -1,
        vw().slice(vw().indexOf('Omset di Jam Tampil') - 200, vw().indexOf('Omset di Jam Tampil') + 120));
    cek('...dan persennya memakai omset SELURUH bulan sebagai penyebut',
        vw().indexOf('77% dari omset bulan ini') > -1,
        vw().slice(vw().indexOf('Omset di Jam Tampil') - 200, vw().indexOf('Omset di Jam Tampil') + 200));

    /* Yang DIBATALKAN tidak boleh ikut — ia tidak pernah naik panggung. */
    cek('jadwal yang dibatalkan tidak ikut dihitung', vw().indexOf('>Vie<') < 0, 'Vie dibatalkan');
    /* Jam tak terbaca DISEBUT, bukan ditebak dan bukan dibuang diam-diam. */
    cek('penampilan tanpa jam yang terbaca disebut, bukan ditebak',
        vw().indexOf('tidak punya jam') > -1 && vw().indexOf('A Deeps') > -1,
        vw().slice(vw().indexOf('tidak punya jam') - 100, vw().indexOf('tidak punya jam') + 300));

    /* ---- angka per penampil ----
       James Project 2 Sep (jam 20,21,22) = 2jt+3jt+4jt = 9jt
                     4 Sep (jam 20,21)    = 6jt+7jt     = 13jt
                     total 22.000.000, 5 jam
       Fuego         2 Sep 22,23 + 3 Sep 0,1 = 4+5+2,5+1,7 = 13.200.000, 4 jam
       Amerta        4 Sep 20,21 = 13.000.000, 2 jam                            */
    /* Potongan satu kartu, dicari dari judulnya. */
    const kartuHtml = judul => {
      const v = vw(), i = v.indexOf('<h3>' + judul + '</h3>');
      if (i < 0) return '';
      const j = v.indexOf('<h3>', i + 4);
      return v.slice(i, j < 0 ? v.length : j);
    };
    const barisDi = (html, nama) => {
      const i = html.indexOf('<b>' + nama + '</b>');
      if (i < 0) return '';
      return html.slice(html.lastIndexOf('<tr', i), html.indexOf('</tr>', i));
    };
    const barisOrang = nama => barisDi(kartuHtml('Per Penampil'), nama);
    cek('omset penampil dihitung dari jam tampilnya sendiri',
        barisOrang('James Project').indexOf('Rp22.000.000') > -1, barisOrang('James Project'));
    cek('...termasuk jam sesudah tengah malam, di tanggal berikutnya',
        barisOrang('Fuego').indexOf('Rp13.200.000') > -1, barisOrang('Fuego'));
    /* Rp/jam: 22jt / 5 = 4,4jt — dan itulah pembanding yang adil antara slot
       tiga jam dan slot satu setengah jam. */
    cek('Rp per jam dihitung dari jumlah jamnya',
        barisOrang('James Project').indexOf('Rp4.400.000') > -1, barisOrang('James Project'));
    /* 22.000.000 / 40.400.000 = 54,5%. Penyebut yang salah (mis. omset jam
       tampil saja) memberi 70,5% — angka yang sama-sama terlihat wajar. */
    cek('...dan persennya dibagi omset SELURUH bulan',
        barisOrang('James Project').indexOf('54,5%') > -1, barisOrang('James Project'));

    /* ---- kategori: GABUNGAN jam, bukan penjumlahan ----
       4 Sep: James Project & Amerta sama-sama jam 20 & 21. Kategori Band
       karena itu = 9jt (2 Sep) + 13jt (4 Sep) = 22jt, BUKAN 22jt + 13jt. */
    {
      const blok = kartuHtml('Per Kategori Penampil');
      const brs = blok.slice(blok.indexOf('<b>Band</b>'));
      cek('kategori menggabungkan jam yang sama, bukan menjumlahkannya',
          brs.indexOf('Rp22.000.000') > -1 && brs.indexOf('Rp35.000.000') < 0, brs.slice(0, 400));
      /* DJ + MC DJ: MC DJ satu-satunya jadwalnya tanpa jam, jadi pasangannya
         sama dengan DJ saja — dan itu benar, bukan bug. */
      cek('baris pasangan DJ + MC DJ digambar', blok.indexOf('DJ + MC DJ') > -1, blok.slice(0, 600));
      /* DJ dan MC DJ tampil di jam yang SAMA. Gabungan = 13,2jt; dijumlahkan =
         26,4jt, dan pasangannya selalu terlihat lebih besar daripada
         kenyataannya. Keduanya angka yang sama-sama terlihat wajar. */
      {
        const brsP = blok.slice(blok.indexOf('DJ + MC DJ'));
        cek('...dan jamnya DIGABUNG, bukan dijumlahkan',
            brsP.indexOf('Rp13.200.000') > -1 && brsP.indexOf('Rp26.400.000') < 0, brsP.slice(0, 400));
        /* PENAMPILAN & ORANG tetap DIJUMLAHKAN — yang digabung jamnya, bukan
           jumlah orang yang naik panggung. Dua angka ini pula satu-satunya
           yang bergerak kalau daftar kategori pasangannya salah: DJ dan MC DJ
           menempati jam yang sama, jadi kolom omsetnya tidak bergeser sedikit
           pun walau MC DJ dicabut dari pasangannya. */
        const angkaP = [...brsP.matchAll(/<td class="num">(\d+)<\/td>/g)].map(m => m[1]);
        cek('...dan pasangannya benar-benar memuat DJ DAN MC DJ',
            angkaP[0] === '2' && angkaP[1] === '2', JSON.stringify(angkaP) + ' :: ' + brsP.slice(0, 400));
      }
      cek('...dan ditandai tidak boleh dijumlahkan dengan barisnya sendiri',
          blok.indexOf('jangan dijumlahkan') > -1);
    }

    /* ---- pembanding per jam ----
       Jam 22: ada penampil hanya 2 Sep (Rp4.000.000). Tanpa penampil 3 Sep
       (Rp1.400.000). Jadi Rp/jam saat ada 4jt, saat tanpa 1,4jt.
       Jam 19: TIDAK PERNAH ada penampil -> sisi "ada" kosong.               */
    {
      const blok = kartuHtml('Pembanding: Jam Tampil vs Jam Yang Sama Tanpa Penampil');
      const brsJam = jj => {
        const k = blok.indexOf('<b>' + jj + ':00</b>');
        return k < 0 ? '' : blok.slice(blok.lastIndexOf('<tr', k), blok.indexOf('</tr>', k));
      };
      cek('jam yang sama dibandingkan ada-penampil vs tanpa',
          brsJam('22').indexOf('Rp4.000.000') > -1 && brsJam('22').indexOf('Rp1.400.000') > -1,
          brsJam('22'));
      cek('...berikut selisihnya',
          brsJam('22').indexOf('+Rp2.600.000') > -1, brsJam('22'));
      /* Jam yang ADA penampilnya tapi TIDAK PERNAH tanpa: jam 0, yang cuma ada
         di 3 Sep dan seluruhnya diklaim DJ yang menyeberang tengah malam.
         Pembandingnya memang tidak ada, dan itu harus DIKATAKAN — bukan diisi
         +100% yang dikarang. */
      cek('jam tanpa pembanding dikatakan, bukan diisi angka',
          brsJam('00').indexOf('tidak ada pembandingnya') > -1, brsJam('00'));
      /* Sisi yang kosong ditulis tanda hubung, BUKAN Rp0 — nol berarti jam itu
         pernah tanpa penampil dan omsetnya memang nol, dan itu jawaban yang
         salah untuk pertanyaan yang tidak pernah ditanyakan. */
      cek('...dan sisi yang memang kosong ditulis tanda hubung, bukan Rp0',
          brsJam('00').indexOf('Rp0') < 0, brsJam('00'));

      /* ---- JAM YANG TIDAK PERNAH ADA PENAMPILNYA TIDAK DIGAMBAR ----
         (11 September 2026, ditanyakan user "ini maksudnya apa?" atas tabel
         yang di produksi berisi 20-an baris "tidak ada pembandingnya".)

         Tabelnya ada untuk MEMBANDINGKAN. Jam yang tidak pernah sekali pun ada
         penampilnya tidak punya sisi kiri, dan barisnya cuma mengubur empat
         sampai enam baris yang benar-benar menjawab pertanyaannya. */
      cek('jam yang tidak pernah ada penampilnya tidak digambar',
          brsJam('19') === '', brsJam('19').slice(0, 200));
      cek('...tapi jumlahnya DISEBUT, bukan hilang diam-diam',
          blok.indexOf('tidak digambar sama sekali karena') > -1,
          blok.slice(blok.indexOf('Jam yang <b>tidak pernah'), blok.indexOf('Jam yang <b>tidak pernah') + 500));
      /* Jam yang memang ada penampilnya tetap digambar — kalau penyaringnya
         terlalu rakus, seluruh tabelnya ikut hilang. */
      cek('...dan jam yang ada penampilnya tetap digambar',
          brsJam('20') !== '' && brsJam('22') !== '');

      /* Penjelasannya memakai CONTOH BARIS, bukan cuma menyebut aturannya —
         yang lama sudah menyebut aturannya dan tetap ditanyakan. */
      cek('penjelasannya memberi contoh cara membaca satu baris',
          blok.indexOf('Cara membaca satu baris') > -1 && blok.indexOf('21:00') > -1,
          blok.slice(0, 700));
      cek('...dan aturan "jam tanpa bill tidak dihitung" dikatakan di layar',
          vw().indexOf('benar-benar punya bill') > -1);
      /* Jam 10 tidak punya satu pun bill di berkas mana pun. Ia tidak boleh
         berdiri sebagai baris, dan tidak boleh ikut sebagai Rp0 di sisi
         "tanpa penampil" — kalau ikut, rata-rata sisi itu jatuh ke hampir nol
         dan SETIAP penampil terlihat luar biasa. */
      cek('jam yang tidak punya satu pun bill tidak digambar sama sekali',
          brsJam('10') === '', brsJam('10').slice(0, 200));
      /* Jam 22 punya data di 2 Sep (ada penampil) dan 3 Sep (tanpa). Jadi
         hitungannya persis 1 dan 1 — bukan 4 hari dikurangi 1. */
      {
        const b22 = brsJam('22');
        const angka = [...b22.matchAll(/<td class="num">(\d+)<\/td>/g)].map(m => m[1]);
        cek('...dan jam-hari tiap sisi dihitung dari hari yang punya data saja',
            angka[0] === '1' && angka[1] === '1', JSON.stringify(angka) + ' :: ' + b22);
      }
    }

    /* ---- tumpang tindih DIKATAKAN, bukan dijepit ke 100% ---- */
    cek('tumpang tindih antar penampil dikatakan',
        vw().indexOf('tidak bisa dijumlahkan') > -1 && vw().indexOf('lebih dari 100%') > -1);

    /* ---- urut & cari ---- */
    {
      const urutan = () => {
        const i = vw().indexOf('Per Penampil');
        const body = vw().slice(vw().indexOf('<tbody>', i));
        return [...body.matchAll(/<td><b>([^<]+)<\/b>/g)].map(m => m[1]);
      };
      cek('bawaan diurut menurut omset', urutan()[0] === 'James Project', JSON.stringify(urutan()));
      w.eval("tlSort('perJam')"); await tunggu(60);
      /* Amerta Rp6.500.000/jam mengalahkan James Project Rp4.400.000/jam —
         itulah gunanya kolom ini: slot pendek yang padat kalah di total tapi
         menang di Rp/jam. */
      cek('kolom Rp/jam mengurutkannya berbeda dari omset',
          urutan()[0] === 'Amerta', JSON.stringify(urutan()));
      w.eval("tlSort('omset')"); await tunggu(60);
      const kotak = d.getElementById('tl_q');
      kotak.value = 'fue';
      kotak.dispatchEvent(new w.Event('input', { bubbles:true }));
      await tunggu(40);
      cek('mencari penampil tidak membuat ulang kotaknya',
          d.getElementById('tl_q') === kotak && kotak.value === 'fue');
      cek('...dan tabelnya tersaring',
          d.getElementById('tl_isi').innerHTML.indexOf('Fuego') > -1
          && d.getElementById('tl_isi').innerHTML.indexOf('James Project') < 0);
      kotak.value = ''; kotak.dispatchEvent(new w.Event('input', { bubbles:true })); await tunggu(40);
    }


    /* ---- PER MALAM & RINCIAN PER PENAMPIL (revisi user 11 September 2026) ----

       "tidak perlu menampilkan jam tapi secara hari saja ... dibandingkan
       dengan omset hari H secara keseluruhan kontribusinya berapa persen", dan
       "band A tampil di hari selasa, terus band A tampil di senin depan, nah
       itu saya pengen tau secara per harinya juga".

       Angka fixture-nya:
         2 Sep  jam 19..23 = 1+2+3+4+5 jt  -> omset hari 15.000.000
         James Project 20:00-23:00 -> jam 20,21,22 = 9.000.000 -> 60,0%
         Fuego 22:30-01:30 -> jam 22,23 (2 Sep) = 9.000.000
                            + jam 0,1 (3 Sep)  = 4.200.000  SESUDAH TENGAH MALAM
           kontribusinya 9.000.000 / 15.000.000 = 60,0%, BUKAN 13,2/15 = 88%    */
    {
      const blokMalam = kartuHtml('Per Malam');
      cek('tabel Per Malam tergambar', !!blokMalam && blokMalam.indexOf('Kontribusi hari itu') > -1,
          blokMalam.slice(0, 300));
      cek('...berisi tanggal dan nama harinya', blokMalam.indexOf('2 Sep 2026') > -1
          && blokMalam.indexOf('Rabu') > -1, blokMalam.slice(0, 600));

      const brsJP = barisDi(blokMalam, 'James Project');
      cek('kontribusi dibagi omset SELURUH hari itu',
          brsJP.indexOf('60%') > -1 && brsJP.indexOf('Rp15.000.000') > -1, brsJP);
      /* PENYEBUTNYA DISEBUT DI SELNYA, bukan cuma di kepala kolom: kepala
         kolom dibaca sekali, angkanya dibaca tiap baris. Pelajaran empat
         putaran pertanyaan di kolom Kontribusi halaman Pengaruh Event. */
      cek('...dan penyebutnya disebut di selnya sendiri',
          brsJP.indexOf('dari Rp15.000.000 hari itu') > -1, brsJP);

      /* JAM SESUDAH TENGAH MALAM: ikut di kolom omset, TIDAK ikut di persen.
         Dicampur ke pembilang sementara penyebutnya tetap tanggal penampilan,
         Fuego akan berbunyi 88% dari hari yang omsetnya tidak pernah memuat
         jam 0 dan 1 itu. */
      const brsFu = barisDi(blokMalam, 'Fuego');
      cek('omset sesudah tengah malam ikut di kolom omset jam tampil',
          brsFu.indexOf('Rp13.200.000') > -1, brsFu);
      cek('...disebut sendiri, bukan dicampur diam-diam',
          brsFu.indexOf('Rp4.200.000 sesudah tengah malam') > -1, brsFu);
      cek('...dan TIDAK ikut di kolom kontribusi',
          brsFu.indexOf('60%') > -1 && brsFu.indexOf('88') < 0, brsFu);
      cek('tumpang tindih antar penampil semalam dikatakan',
          blokMalam.indexOf('Kolom Kontribusi tidak bisa dijumlahkan') > -1);

      /* HARI YANG TIDAK PUNYA DATA POS: dikatakan, bukan 0%. Nol berarti tidak
         ada satu rupiah pun masuk di jam tampilnya, dan itu jawaban yang salah
         untuk hari yang berkasnya memang belum diunggah. */
      {
        const brsMF = barisDi(blokMalam, 'Minor Feel');
        cek('malam yang tanggalnya tidak ada di berkas POS ikut tampil', !!brsMF,
            'barisnya hilang — penampilannya lenyap tanpa satu pun tanda');
        cek('...kontribusinya DIKATAKAN belum ada datanya, bukan ditulis 0%',
            brsMF.indexOf('belum ada data POS') > -1 && brsMF.indexOf('0%') < 0, brsMF);
        cek('...dan omset harinya tanda hubung, bukan Rp0',
            brsMF.indexOf('Rp0') < 0, brsMF);
      }

      /* Kepala kolomnya bisa diurut, dan yang digambar ulang WADAHNYA saja —
         kotak cari di kartu Per Penampil di bawahnya tidak boleh ikut dibuat
         ulang. */
      {
        const kotak = d.getElementById('tl_q');
        w.eval("tnSort('omset')"); await tunggu(40);
        const b2 = kartuHtml('Per Malam');
        const urutNama = [...b2.slice(b2.indexOf('<tbody>')).matchAll(/<td><b>([^<]+)<\/b><\/td><td>/g)]
          .map(m => m[1]);
        cek('tabel Per Malam bisa diurut menurut omset',
            urutNama.length > 0, JSON.stringify(urutNama));
        cek('...tanpa membuat ulang kotak cari di kartu bawahnya',
            d.getElementById('tl_q') === kotak);
        w.eval("tnSort('tgl')"); await tunggu(40);
      }
    }

    /* ---- CARI NAMA BAND DI TABEL PER MALAM (permintaan user 11 Sep 2026) ----

       Yang paling menentukan BUKAN adanya kotaknya melainkan bahwa mengetik
       tidak membuat ulang kotaknya: render() di modul ini TOTAL, dan kotak yang
       dibuat ulang kehilangan fokus sehingga hanya huruf pertama yang masuk.
       Karena itu yang diperiksa IDENTITAS elemennya. */
    {
      const kotak = d.getElementById('tn_q');
      cek('kotak cari di tabel Per Malam digambar', !!kotak);
      kotak.value = 'james';
      kotak.dispatchEvent(new w.Event('input', { bubbles:true }));
      await tunggu(40);
      cek('...mengetik TIDAK membuat ulang kotaknya',
          d.getElementById('tn_q') === kotak && kotak.value === 'james',
          'kotaknya diganti elemen baru — hanya huruf pertama yang akan masuk');
      {
        const isi = d.getElementById('tn_isi').innerHTML;
        cek('...dan tabelnya tersaring ke band itu saja',
            isi.indexOf('James Project') > -1 && isi.indexOf('Fuego') < 0, isi.slice(0, 600));
        /* Dua malam James Project harus tetap utuh — mencari nama band gunanya
           justru melihat seluruh malamnya berjajar. */
        cek('...berikut SELURUH malamnya, bukan cuma yang pertama',
            isi.indexOf('2 Sep 2026') > -1 && isi.indexOf('4 Sep 2026') > -1, isi.slice(0, 900));
        cek('...kakinya menyebut berapa yang cocok', isi.indexOf('cocok dengan') > -1);
      }
      /* Dicari juga di KATEGORI dan NAMA HARI — tiga pertanyaan yang sama-sama
         wajar dibawa ke tabel ini, dan kotak yang cuma mencari nama akan
         terasa rusak untuk dua yang lain. */
      kotak.value = 'mc dj';
      kotak.dispatchEvent(new w.Event('input', { bubbles:true }));
      await tunggu(40);
      cek('bisa dicari menurut kategorinya',
          d.getElementById('tn_isi').innerHTML.indexOf('Pennykids') > -1
          && d.getElementById('tn_isi').innerHTML.indexOf('James Project') < 0);
      kotak.value = 'jumat';
      kotak.dispatchEvent(new w.Event('input', { bubbles:true }));
      await tunggu(40);
      {
        const isi = d.getElementById('tn_isi').innerHTML;
        cek('...dan menurut nama harinya',
            isi.indexOf('4 Sep 2026') > -1 && isi.indexOf('2 Sep 2026') < 0, isi.slice(0, 600));
      }
      /* Kata kunci tanpa hasil DIKATAKAN — tabel kosong tanpa keterangan
         terbaca sebagai data yang hilang. */
      kotak.value = 'zzz';
      kotak.dispatchEvent(new w.Event('input', { bubbles:true }));
      await tunggu(40);
      cek('kata kunci tanpa hasil dikatakan, bukan tabel kosong',
          d.getElementById('tn_isi').innerHTML.indexOf('Tidak ada penampilan yang cocok') > -1);
      /* Kotak di kartu Per Penampil TIDAK ikut tersaring — dua tabel menjawab
         pertanyaan yang berbeda, dan satu kotak untuk keduanya berarti mencari
         satu nama ikut memangkas tabel di sebelahnya. */
      cek('...dan tabel Per Penampil TIDAK ikut tersaring',
          d.getElementById('tl_isi').innerHTML.indexOf('James Project') > -1);
      kotak.value = '';
      kotak.dispatchEvent(new w.Event('input', { bubbles:true }));
      await tunggu(40);
    }

    /* ---- RINCIAN SATU PENAMPIL ---- */
    {
      w.eval("tlBuka('James Project')"); await tunggu(60);
      const blokP = kartuHtml('Per Penampil');
      cek('baris penampil bisa dibuka', blokP.indexOf('tampil 2 kali bulan ini') > -1,
          blokP.slice(blokP.indexOf('James Project'), blokP.indexOf('James Project') + 600));
      /* Dua malamnya berjajar — inilah yang diminta: 2 Sep (Rabu) dan
         4 Sep (Jumat). */
      cek('...seluruh malamnya berjajar berikut nama harinya',
          blokP.indexOf('2 Sep 2026') > -1 && blokP.indexOf('4 Sep 2026') > -1
          && blokP.indexOf('Jumat') > -1, blokP.slice(0, 900));
      /* 4 Sep: jam 20,21 = 13 jt dari omset hari 13 jt -> 100% */
      cek('...tiap malam membawa kontribusinya sendiri',
          blokP.indexOf('100%') > -1, blokP.slice(0, 1200));
      /* RINGKASAN PER HARI: dua hari berbeda, jadi tabelnya digambar. */
      cek('...berikut ringkasan per hari dalam seminggu',
          blokP.indexOf('Per hari dalam seminggu') > -1);
      cek('...yang dirata-rata, bukan dijumlahkan',
          blokP.indexOf('rata-rata, bukan jumlah') > -1);

      w.eval("tlBuka('James Project')"); await tunggu(60);
      cek('menekan lagi menutupnya',
          kartuHtml('Per Penampil').indexOf('tampil 2 kali bulan ini') < 0);

      /* Penampil yang cuma tampil di SATU hari tidak diberi ringkasan per
         hari — ringkasan satu baris yang mengulang tabel di atasnya tidak
         menjawab apa pun. */
      w.eval("tlBuka('Amerta')"); await tunggu(60);
      {
        const bA = kartuHtml('Per Penampil');
        cek('penampil yang cuma satu hari tidak diberi ringkasan per hari',
            bA.indexOf('tampil 1 kali bulan ini') > -1
            && bA.indexOf('Per hari dalam seminggu') < 0, bA.slice(0, 700));
      }
      w.eval("tlBuka('Amerta')"); await tunggu(60);
    }

    /* ---- DUA ATURAN YANG DIJAGA DI SUMBERNYA ----

       Keduanya memulangkan hasil yang SAMA saat dijalankan di mesin ini, jadi
       asersi runtime apa pun akan hijau untuk kode yang salah. Yang dijaga
       karena itu sumbernya — pola yang sama dengan penjaga zona di isoDari(),
       yang mutasinya juga lolos seluruh pemeriksaan runtime di mesin berzona
       WIB dan cuma merah di laptop yang zonanya lain. */
    {
      const SRC = fs.readFileSync(path.join(ROOT, 'deploy', 'analytics', 'index.html'), 'utf8');
      const blok = SRC.slice(SRC.indexOf('function tlRincianHtml'),
                             SRC.indexOf('function tlIsiHtml'));
      /* RINGKASAN PER HARI DIRATA-RATA, bukan dijumlahkan. Di fixture ini tiap
         penampil cuma tampil sekali per hari, jadi jumlah dan rata-rata
         memulangkan angka yang sama persis — dan mutasinya lolos. Di produksi
         bedanya besar: band yang tampil empat kali di Sabtu akan selalu
         mengalahkan yang tampil sekali, dan itu bukan jawaban atas "hari mana
         yang paling besar untuk dia". */
      cek('ringkasan per hari dirata-rata, bukan dijumlahkan',
          blok.indexOf('rp0(k.omset / k.n)') > -1 && blok.indexOf("rp0(k.omset)") < 0,
          'jumlah membuat yang sering tampil selalu menang');
      cek('...begitu juga rata-rata kontribusinya', blok.indexOf('k.pct / k.nPct') > -1);

      /* NAMA HARI DARI UTC. new Date(t).getDay() dibaca di zona peramban: di
         WIB hasilnya kebetulan sama, tapi laptop berzona barat akan menyebut
         hari yang berbeda untuk tanggal yang sama. */
      const blokMalamSrc = SRC.slice(SRC.indexOf('const malam = isi.map'),
                                     SRC.indexOf('TN_CACHE = { baris: malam };'));
      cek('nama hari dibaca UTC, bukan zona peramban',
          blokMalamSrc.indexOf('NAMA_HARI[dowDari(t)]') > -1
          && blokMalamSrc.indexOf('getDay()') < 0,
          'zona peramban membuat laptop di zona lain menyebut hari yang berbeda');
    }

    /* ---- laporan lama: tidak punya hariJam sama sekali ---- */
    w.eval('delete AN.data.laporan["2026-09"].hariJam');
    w.go('talent'); await tunggu(60);
    cek('laporan tanpa hariJam mengatakan sebabnya dan cara membetulkannya',
        vw().indexOf('belum memuat omset per jam per tanggal') > -1 && vw().indexOf('Unggah ulang') > -1,
        vw().slice(0, 400));
    /* DIBEDAKAN dari modul Event yang mati — dua keadaan, dua tindakan. */
    cek('...dan itu BEDA dari pesan modul Event tidak menjawab',
        vw().indexOf('Jadwal talent tidak terbaca') < 0);
    dom.window.close();
  }

  /* Modul Event yang tidak menjawab: daftar kosong yang sebenarnya berarti
     "servernya mati" tidak membuat siapa pun memeriksa apa pun. */
  {
    const { dom } = domAnalytics({ eventGagal: true });
    const w = dom.window;
    await siap(w);
    w.eval('AN.data.laporan = {}');
    w.eval('AN.data.laporan["2026-09"] = ' + JSON.stringify({
      diunggah:'2026-09-11', oleh:'W', berkas:'x.csv', jenis:'bill',
      hari:{ '2026-09-02':{ bill:5, grand:1000000 } }, jam:[],
      hariJam:{ '2026-09-02':{ 20:{ g:1000000, b:5 } } }, ringkas:{ bill:5, grand:1000000 }
    }));
    w.eval("BLN='2026-09'");
    w.go('talent'); await tunggu(60);
    const v = w.document.getElementById('app-view').innerHTML;
    cek('modul Event yang mati dikatakan, bukan dibaca sebagai tidak ada jadwal',
        v.indexOf('Jadwal talent tidak terbaca') > -1, v.slice(0, 300));
    dom.window.close();
  }

  console.log('\n---------------------------------------');
  console.log('LULUS ' + lulus + '   GAGAL ' + gagal);
  process.exit(gagal ? 1 : 0);
})();
