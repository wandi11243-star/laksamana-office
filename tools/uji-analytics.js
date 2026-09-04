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

const HTML = fs.readFileSync(path.join(ROOT, 'deploy', 'analytics', 'index.html'), 'utf8');

let lulus = 0, gagal = 0;
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
        if (u.indexOf('hpp.php') > -1) return jawab(opt.hppGagal
          ? { ok:false } : { ok:true, data: opt.hpp || { bahan:[], resep:[] } });
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

    for (const v of ['ringkasan','hari','menu','event','unggah','pengaturan','akses']) {
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

    /* ===== 2. top menu, ATAU seluruh menu ===== */
    const v2 = d.getElementById('app-view').innerHTML;
    cek('ada saklar urutan & jumlah baris',
        /Menurut Nilai/.test(v2) && /Menurut Porsi/.test(v2) && /Seluruhnya \(3\)/.test(v2),
        v2.slice(v2.indexOf('Penjualan Menu'), v2.indexOf('Penjualan Menu') + 700));
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
    /* RATA-RATA, bukan jumlah: bulan dengan lima Sabtu dan empat Senin akan
       selalu menunjukkan Sabtu lebih besar kalau yang dibandingkan jumlahnya. */
    cek('yang dibandingkan rata-rata, bukan jumlah', v.indexOf('Rata-rata, bukan jumlah') > -1);
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
    const { dom } = domAnalytics({ an,
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
    cek('dibandingkan dengan hari yang sama', v.indexOf('Rata-rata hari sama') > -1);
    cek('selisih dihitung terhadap Sabtu biasa, bukan seluruh hari',
        v.indexOf('+33%') > -1, v.slice(v.indexOf('Hari Ada Acara, Satu per Satu'),
                                       v.indexOf('Hari Ada Acara, Satu per Satu') + 900));

    /* ---- KONTRIBUSI OMSET (permintaan user) ----
       1 Agu 12jt dari total 23jt yang punya data harian = 12/23 = 52,2%.
       Penyebutnya total omset BULAN ITU, bukan omset hari berevent saja. */
    cek('kontribusi hari itu terhadap total omset ditulis', v.indexOf('52.2%') > -1,
        v.slice(v.indexOf('Kontribusi'), v.indexOf('Kontribusi') + 400));
    cek('kartu Omset hari itu ada', v.indexOf('Omset hari itu') > -1);
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
  console.log('\n== Penjualan menu: top-N & dua urutan ==');
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

    /* Bawaannya 20 teratas, dan yang TERSEMBUNYI disebut jumlah & nilainya —
       daftar yang menyusut tanpa keterangan terbaca sebagai data yang hilang. */
    cek('bawaannya 20 teratas, bukan seluruhnya', w.eval('MN_SEMUA') === false);
    let v = d.getElementById('app-view').innerHTML;
    cek('cuma 20 menu tergambar', baris().length === 20, String(baris().length));
    cek('yang tersembunyi disebut jumlahnya', /5 menu senilai/.test(v),
        v.slice(v.indexOf('teratas dari'), v.indexOf('teratas dari') + 200));

    /* Seluruhnya: 25 baris. */
    w.eval('mnSemua(true)'); await tunggu(60);
    cek('Seluruhnya menggambar 25 baris', baris().length === 25, String(baris().length));
    v = d.getElementById('app-view').innerHTML;
    cek('...dan mengatakan semuanya sudah tampil', /Seluruh 25 menu ditampilkan/.test(v));

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

    /* Seluruh menu di sini tidak punya resep — kartunya harus menyebut
       semuanya, bukan memotongnya seperti chip yang lama. */
    const ta = d.getElementById('mn-teks');
    cek('teks salin memuat SELURUH menu tak dikenal, tidak dipotong',
        !!ta && ta.value.split('\n').length === 25, ta && String(ta.value.split('\n').length));
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
