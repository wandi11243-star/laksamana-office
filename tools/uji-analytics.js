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
          ? { ok:false } : { ok:true, data:{ events: opt.event || [] } });
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

    cek('menu terlaris tergambar', v.indexOf('Kopi Susu Aren') > -1);
    /* Diurut menurut NILAI, bukan qty: menu murah yang terjual ratusan porsi
       bisa menyumbang lebih sedikit daripada satu menu mahal. */
    cek('diurut menurut nilai', v.indexOf('Kopi Susu Aren') < v.indexOf('Roti Bakar'));
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
    cek('menu tanpa resep disebut namanya', v.indexOf('Menu Tanpa Resep') > -1);
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
        vq.indexOf('>Kopi Susu Aren<') < vq.indexOf('>Roti Bakar<') &&
        vq.indexOf('>Roti Bakar<') < vq.indexOf('>Menu Tanpa Resep<'));
    w.eval("mnUrut('nilai')"); await tunggu(60);

    /* ===== rincian bahan PER PRODUK ===== */
    w.eval("mnBuka('Kopi Susu Aren')"); await tunggu(60);
    const vr = d.getElementById('app-view').innerHTML;
    cek('rincian per produk memisahkan mentah & prep',
        vr.indexOf('Bahan mentah') > -1 && vr.indexOf('Bahan prep / base') > -1,
        vr.slice(vr.indexOf('porsi Kopi Susu Aren') - 200, vr.indexOf('porsi Kopi Susu Aren') + 400));
    cek('rinciannya menyebut jumlah porsi yang dihitung', /100<\/b> porsi Kopi Susu Aren/.test(vr));
    /* Menekan baris yang sedang terbuka harus MENUTUPNYA — kalau tidak,
       satu-satunya cara menutupnya adalah membuka baris lain, dan yang membuka
       baris terakhir terjebak dengan rincian yang tidak bisa dihilangkan. */
    w.eval("mnBuka('Kopi Susu Aren')"); await tunggu(60);
    cek('menekan baris yang terbuka menutupnya', w.eval('MN_BUKA') === '');
    /* Menu tanpa resep: rinciannya MENGATAKAN sebabnya, bukan kosong. Kosong
       terbaca sebagai "menu ini tidak butuh bahan apa-apa". */
    w.eval("mnBuka('Menu Tanpa Resep')"); await tunggu(60);
    const vt = d.getElementById('app-view').innerHTML;
    cek('rincian menu tanpa resep menjelaskan sebabnya', /belum punya resep di HPP/.test(vt),
        vt.slice(vt.indexOf('Menu Tanpa Resep'), vt.indexOf('Menu Tanpa Resep') + 400));

    /* ===== 3. daftar menu tak dikenal sebagai TEKS yang bisa disalin ===== */
    const ta = d.getElementById('mn-teks');
    cek('daftar menu tak dikenal tersedia sebagai teks', !!ta, 'textarea mn-teks tidak ada');
    cek('...satu baris per menu, dipisah TAB',
        !!ta && ta.value.split('\n').length === 1 && ta.value.split('\t').length === 3,
        ta && JSON.stringify(ta.value));
    cek('...memuat nama, qty, dan nilainya',
        !!ta && ta.value.indexOf('Menu Tanpa Resep') === 0 && ta.value.indexOf('\t5\t150000') > -1,
        ta && JSON.stringify(ta.value));
    /* readonly, BUKAN disabled: yang disabled tidak bisa diblok untuk disalin
       manual, dan itu jalan keluar terakhir kalau izin clipboard ditolak. */
    cek('teksnya readonly tapi tetap bisa diblok',
        !!ta && ta.readOnly === true && ta.disabled === false);
    cek('ada tombol salin & unduh',
        vt.indexOf('mnSalin()') > -1 && vt.indexOf('mnUnduhTak()') > -1);
    w.eval("mnBuka('Menu Tanpa Resep')"); await tunggu(60);
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
    cek('kode yang belum dipetakan dilaporkan', Object.keys(NM.takKenal).length === 2,
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
    cek('porsi total tidak berubah karena penggabungan',
        totQ(NM.gab) + NM.ev.qty === totQ(u.menu),
        totQ(NM.gab) + '+' + NM.ev.qty + ' vs ' + totQ(u.menu));
    cek('nilai total tidak berubah karena penggabungan',
        totN(NM.gab) + NM.ev.nilai === totN(u.menu),
        totN(NM.gab) + '+' + NM.ev.nilai + ' vs ' + totN(u.menu));

    /* Dipetakan: porsinya pindah ke menu aslinya. */
    w.eval("AN.data.setting.petaKode = { MATCHA02:'MATCHA LATTE', MATCHA01:'MATCHA LATTE' }");
    NM = w.eval('menuNormal')(u);
    cek('kode yang dipetakan pindah ke menu aslinya',
        NM.gab['MATCHA LATTE'].qty === 11, String(NM.gab['MATCHA LATTE'].qty));
    cek('...dan totalnya tetap sama', totQ(NM.gab) + NM.ev.qty === totQ(u.menu),
        totQ(NM.gab) + '+' + NM.ev.qty + ' vs ' + totQ(u.menu));
    cek('...sisa kode yang belum dipetakan tinggal yang tanpa kode',
        Object.keys(NM.takKenal).length === 0, JSON.stringify(Object.keys(NM.takKenal)));
    /* Peta dipakai saat MENGGAMBAR, bukan saat mengurai: kalau dibakukan ke
       laporan tersimpan, peta yang dibetulkan bulan depan tidak akan pernah
       memperbaiki bulan yang sudah diunggah. */
    cek('laporan tersimpan tetap memakai nama mentah',
        !!u.menu['LARGE (PACKAGE)'], JSON.stringify(Object.keys(u.menu)));

    /* Saran tidak boleh menawarkan baris paket itu sendiri — memetakan kode ke
       namanya sendiri tidak memindahkan porsi ke mana pun, dan yang menekan
       tombolnya mengira sudah selesai. */
    const saran = w.eval('saranKode')('MATCHA02', Object.keys(NM.gab).concat(['REGULAR (PACKAGE) · MATCHA02']));
    cek('saran kode tidak menawarkan baris paket', saran.every(x => x.indexOf('(PACKAGE)') < 0),
        JSON.stringify(saran));
    cek('saran kode menemukan menu yang mirip', saran.indexOf('MATCHA LATTE') > -1, JSON.stringify(saran));

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
    /* ANGKANYA DIPATOK, bukan cuma "lebih dari nol": penggabungan punya DUA
       cabang (nama jelas, dan kode yang dipetakan), dan yang lebih-dari-nol
       tetap benar walau salah satunya dicabut.
         MINERAL WATER (PACKAGE) 3 + MATCHA02 4 + MATCHA01 2 = 9 */
    cek('...tapi penggabungannya tetap berjalan', NMs.digabung === 9, String(NMs.digabung));
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
    /* NUSANTARA berisi satu menu, SIGNATURE NON COFFEE berisi tiga —
       angkanya HARUS berbeda, kalau tidak kolom yang menulis angka mati pun
       akan lulus. */
    cek('...jumlahnya dibaca dari isi kategorinya',
        selJml(v, 'NUSANTARA') === '1' && selJml(v, 'SIGNATURE NON COFFEE') === '3',
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
    cek('HPP mati: menu terlaris tetap terbaca', v.indexOf('Kopi') > -1);
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
        baris()[24] === 'Air Mineral', baris().slice(-3).join(' | '));
    w.eval("mnUrut('qty')"); await tunggu(60);
    cek('menurut PORSI, menu murah naik ke paling atas',
        baris()[0] === 'Air Mineral', baris().slice(0, 3).join(' | '));
    /* Dan itu memang dua jawaban yang berbeda — kalau sama, saklarnya tidak
       menjawab pertanyaan apa pun. */
    cek('kedua urutan benar-benar berbeda', baris()[0] !== 'Menu 01' || false);

    /* GANTI URUTAN KEMBALI KE HALAMAN 1: yang diurut ulang SELURUH daftarnya,
       jadi halaman 2 sesudahnya memuat menu yang tidak ada hubungannya dengan
       yang barusan dilihat. Dijepit tidak menolong — halaman 2 memang ada. */
    w.eval('mnPer(20)'); await tunggu(60);
    w.eval('mnHal(2)'); await tunggu(60);
    w.eval("mnUrut('nilai')"); await tunggu(60);
    cek('ganti urutan kembali ke halaman 1',
        w.eval('MN_HAL') === 1 && baris()[0] === 'Menu 01', w.eval('MN_HAL') + ' | ' + baris()[0]);

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
          baris().length === 1 && baris()[0] === 'Menu 24', baris().join(' | '));

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
          w.eval('MN_HAL') === 2 && baris()[0] === 'Menu 21', w.eval('MN_HAL') + ' | ' + baris()[0]);
      kt.value = 'menu';
      kt.dispatchEvent(new w.Event('input', { bubbles:true }));
      await tunggu(40);
      cek('mengetik kata kunci kembali ke halaman 1',
          w.eval('MN_HAL') === 1 && baris()[0] === 'Menu 01', w.eval('MN_HAL') + ' | ' + baris()[0]);

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
        w.eval('MN_HAL') === 1 && baris().length === 20 && baris()[0] === 'Menu 01',
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
    const tbl = v.slice(v.indexOf('Per Metode'));
    const nama = (tbl.match(/<td><b>[^<]+<\/b><\/td>/g) || []).map(x => x.replace(/<[^>]*>/g, ''));

    cek('halaman Metode Kunjungan menggambar tabelnya', nama.length === 5, nama.join(' | '));
    /* DIURUT MENURUT JUMLAH TRANSAKSI, bukan omset. ESB ORDER membawa
       Rp500.000 dari satu transaksi sementara DINE IN cuma Rp120.000 dari
       tiga — diurut menurut omset, ESB ORDER yang naik ke atas. */
    cek('diurut menurut jumlah transaksi, bukan omset',
        nama[0] === 'DINE IN', nama.join(' | '));
    cek('kartu Paling Sering menyebut metodenya',
        v.indexOf('Paling Sering') > -1 && v.slice(v.indexOf('Paling Sering'),
          v.indexOf('Paling Sering') + 300).indexOf('DINE IN') > -1,
        v.slice(v.indexOf('Paling Sering'), v.indexOf('Paling Sering') + 300));
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

  /* ================= 9. simpan & timpa ================= */
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

  console.log('\n---------------------------------------');
  console.log('LULUS ' + lulus + '   GAGAL ' + gagal);
  process.exit(gagal ? 1 : 0);
})();
