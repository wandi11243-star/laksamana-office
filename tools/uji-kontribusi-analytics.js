/* Uji tiga tambahan di modul Analytics, 6 September 2026 (permintaan user):

     1. Jembatan ke Tiga Layar Office  — halaman Ringkasan
     2. kolom Kontribusi per hari dalam seminggu — halaman Hari & Jam
     3. kolom Kontribusi per jam — halaman Hari & Jam

   Ketiganya gagal DENGAN CARA YANG SAMA kalau salah: angkanya tetap tergambar
   rapi, cuma salah, dan tidak satu pun melempar galat. Karena itu yang diuji
   di sini INVARIAN-nya, bukan hasil satu rumus yang disalin ulang dari kode
   yang diuji — uji yang mengulang rumusnya cuma mengulang asumsi yang sama.

   Invarian yang dijaga:

     - kolom Kontribusi WAJIB berjumlah 100%. Penyebutnya karena itu harus
       dihitung dari tabelnya sendiri, bukan dari ringkas.grand yang
       menjumlahkan seluruh baris berkas termasuk bulan sebelah. Data uji
       sengaja dibuat supaya kedua penyebut itu BERBEDA JAUH — penyebut yang
       salah langsung menjatuhkan jumlahnya ke ~81%.

     - batang mengikuti kolom TOTAL, bukan rata-rata. Data uji punya satu hari
       yang rata-ratanya tertinggi tapi totalnya bukan yang terbesar, jadi
       batang yang salah kolom langsung ketahuan.

     - Realisasi BUKAN Net Sales dikurangi service dan pajak. Keduanya
       diturunkan dari Dibayar Tamu, dan angka rantai-lurus yang salah itu
       diperiksa TIDAK BOLEH muncul di layar.

     - compliment yang tidak terbaca dikatakan, tidak dianggap nol. Nol membuat
       Net Sales sama persis dengan Dibayar Tamu — angka salah yang terlihat
       sangat wajar, di baris yang justru dibaca investor. */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
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

/* ---------------------------------------------------------------- data uji

   Angkanya sengaja bulat supaya yang membaca kegagalan bisa menghitungnya di
   kepala, dan sengaja BERBEDA satu sama lain supaya tidak ada dua angka yang
   bisa tertukar tanpa ketahuan.

     Rekap Penjualan  net 240.000.000 + svc 8.000.000 + tax 11.000.000
                      = tagihan 259.000.000
     compliment       4.000.000       -> Net Sales 255.000.000
     POS grand        260.000.000     -> selisih 1.000.000

   ringkas.grand (260 jt) sengaja LEBIH BESAR daripada jumlah hari (210 jt):
   itulah bentuk yang lahir kalau berkas POS menyeberang bulan atau ada baris
   yang jamnya tidak terbaca, dan itulah yang membuat penyebut yang salah
   ketahuan. */
const RINGKAS_GRAND = 260000000;
const HARI = {
  /* Senin cuma SATU hari tapi paling besar per harinya: rata-rata 90 jt. */
  '2026-08-03': { grand: 90000000, bill: 300, net: 90000000 },
  /* Sabtu TIGA hari, rata-rata cuma 40 jt, tapi totalnya 120 jt — terbesar. */
  '2026-08-01': { grand: 40000000, bill: 200, net: 40000000 },
  '2026-08-08': { grand: 40000000, bill: 200, net: 40000000 },
  '2026-08-15': { grand: 40000000, bill: 200, net: 40000000 }
};
const TOTAL_HARI = 210000000;          // 90 + 40*3
const JAM = Array.from({ length: 24 }, () => ({ grand: 0, bill: 0 }));
JAM[12] = { grand: 60000000, bill: 100 };
JAM[19] = { grand: 90000000, bill: 150 };
JAM[20] = { grand: 60000000, bill: 90 };
const TOTAL_JAM = 210000000;

const LAPORAN = {
  '2026-08': {
    bulan: '2026-08', jenis: 'bill', berkas: 'uji.xlsx', diunggah: '2026-09-06', oleh: 'Uji',
    hari: HARI, jam: JAM, menu: {},
    ringkas: { bill: 900, grand: RINGKAS_GRAND, net: 250000000, svc: 8000000, tax: 11000000,
               sub: 0, discMenu: 0, discBill: 0, discVoucher: 0, pax: 0, billPax: 0 }
  }
};
const DAILY = [
  { date:'2026-08-01', food:100000000, bev:50000000, lainnya:0, discount:10000000,
    service_charge:5000000, tax:7000000, bill:200 },
  { date:'2026-08-03', food:60000000, bev:40000000, lainnya:0, discount:0,
    service_charge:3000000, tax:4000000, bill:300 }
];
const COMPS = [{ date:'2026-08-05', nominal:4000000 }];

function dom(opt) {
  opt = opt || {};
  return new JSDOM(HTML, {
    url: 'https://dev.laksamanamuda.id/analytics/',
    runScripts: 'dangerously', pretendToBeVisual: true,
    beforeParse(w) {
      w.alert = () => {}; w.confirm = () => true;
      try {
        w.localStorage.setItem('lm_session', JSON.stringify({
          expiry: Date.now() + 3600000, userId:'u-uji', name:'Penguji',
          modules:['analytics'], adminModules:['analytics']
        }));
      } catch (e) {}
      const jawab = o => ({ ok:true, status:200, text: async () => JSON.stringify(o), json: async () => o });
      w.fetch = async (url, init) => {
        const body = init && init.body ? JSON.parse(init.body) : {};
        const u = String(url);
        if (body.action === 'analyticsGet')
          return jawab({ ok:true, data:{ data:{ laporan: opt.laporan || LAPORAN, setting:{} }, akses:{}, peran:{} } });
        if (u.indexOf('hpp.php') > -1) return jawab({ bahan:[], resep:[], setting:{}, ts:'2026-09-06' });
        if (u.indexOf('event-api') > -1 || u.indexOf('marketing-api') > -1)
          return jawab({ ok:true, data:{ events: [] } });
        if (u.indexOf('action=getAll') > -1) {
          const kp = { daily: opt.daily || DAILY };
          /* Register compliment DIHILANGKAN, bukan dikosongkan: yang diuji
             perbedaan antara "tidak terbaca" dan "nol". */
          if (!opt.tanpaCompliment) kp.compliments = COMPS;
          return jawab({ ok:true, data: kp });
        }
        return jawab({ ok:true, data:{} });
      };
    }
  });
}
async function siap(w) {
  for (let i = 0; i < 160; i++) {
    try { if (w.eval('typeof AN !== "undefined" && AN !== null')) return; } catch (e) {}
    await tunggu(50);
  }
  throw new Error('modul Analytics tidak pernah siap');
}
/* Potongan HTML satu kartu, dicari dari judulnya sampai judul berikutnya.
   Dua tabel di halaman yang sama sama-sama memuat sel persen, jadi tanpa
   pemotongan ini uji jumlah 100% akan menjumlahkan keduanya sekaligus. */
function potong(html, dari, sampai) {
  const a = html.indexOf(dari); if (a < 0) return '';
  const b = sampai ? html.indexOf(sampai, a) : -1;
  return html.slice(a, b > -1 ? b : html.length);
}
/* Semua sel persen tebal di satu potongan: <b>12.3%</b> */
function persenTebal(html) {
  return (html.match(/<b>(\d+\.\d)%<\/b>/g) || []).map(x => parseFloat(x.replace(/[^0-9.]/g, '')));
}
function barisTabel(html, nama) {
  const a = html.indexOf('>' + nama + '<'); if (a < 0) return '';
  const b = html.indexOf('</tr>', a);
  return html.slice(a, b > -1 ? b : a + 600);
}

(async () => {
  /* ============ 1. Jembatan ke Tiga Layar Office ============ */
  console.log('\n== Jembatan ke tiga layar ==');
  {
    const w = dom({}).window;
    await siap(w);
    w.go('ringkasan'); await tunggu(80);
    const v = w.document.getElementById('app-view').innerHTML;

    cek('kartu jembatan tergambar', v.indexOf('Jembatan ke Tiga Layar Office') > -1);
    const jb = potong(v, 'Jembatan ke Tiga Layar Office');

    cek('POS Grand Total disebut',      jb.indexOf('Rp260.000.000') > -1);
    cek('selisih input disebut',        jb.indexOf('Rp1.000.000') > -1);
    cek('Dibayar Tamu disebut',         jb.indexOf('Rp259.000.000') > -1);
    cek('compliment disebut',           jb.indexOf('Rp4.000.000') > -1);
    cek('Net Sales disebut',            jb.indexOf('Rp255.000.000') > -1);
    cek('service charge disebut',       jb.indexOf('Rp8.000.000') > -1);
    cek('pajak disebut',                jb.indexOf('Rp11.000.000') > -1);
    cek('Realisasi net disebut',        jb.indexOf('Rp240.000.000') > -1);

    /* Ketiga layar disebut NAMANYA. Tabel rekonsiliasi yang cuma memajang
       angka tidak menjawab pertanyaan aslinya: "yang mana yang di layar
       mana". */
    cek('menyebut Rekap Penjualan',  jb.indexOf('Rekap Penjualan') > -1);
    cek('menyebut Dashboard Omset',  jb.indexOf('Dashboard Omset') > -1);
    cek('menyebut Investor',         jb.indexOf('Investor') > -1);

    /* DIBAYAR TAMU DIPAKAI DUA KALI sebagai titik tolak. Kalau ia cuma sekali,
       berarti tabelnya sudah jadi rantai lurus dan Realisasi seolah-olah
       diturunkan dari Net Sales. */
    const n = (jb.match(/Rp259\.000\.000/g) || []).length;
    cek('Dibayar Tamu muncul dua kali sebagai titik tolak', n === 2, 'muncul ' + n + '×');
    cek('titik tolak kedua dikatakan', jb.indexOf('titik tolak jalur kedua') > -1);

    /* RANTAI LURUS YANG SALAH: 255 - 8 - 11 = 236 juta. Angka itu tidak ada di
       layar mana pun di Office, dan kalau ia muncul di sini berarti tabelnya
       sudah dirapikan jadi satu rantai — persis kesalahan yang bentuk dua
       titik tolak ini dibuat untuk mencegahnya. */
    cek('tidak memunculkan angka rantai lurus yang salah',
        jb.indexOf('Rp236.000.000') < 0, 'Rp236.000.000 muncul');

    /* Yang benar-benar selisih WAJIB dibedakan dari yang cuma beda konvensi. */
    cek('baris selisih ditandai merah', /var\(--danger\)[^<]*">−Rp1\.000\.000/.test(jb)
        || jb.indexOf('satu-satunya selisih di tabel ini') > -1);
    cek('dikatakan bedanya bukan uang hilang', jb.indexOf('bukan karena ada yang hilang') > -1);
    cek('dikatakan Realisasi bukan Net Sales dikurangi svc & pajak',
        jb.indexOf('Realisasi <b>bukan</b> Net Sales') > -1);
  }

  /* ---- compliment tidak terbaca: dikatakan, BUKAN dianggap nol ---- */
  console.log('\n== Compliment tidak terbaca ==');
  {
    const w = dom({ tanpaCompliment:true }).window;
    await siap(w);
    w.go('ringkasan'); await tunggu(80);
    const jb = potong(w.document.getElementById('app-view').innerHTML, 'Jembatan ke Tiga Layar Office');

    cek('ketidakterbacaannya dikatakan', jb.indexOf('Register compliment tidak terbaca') > -1);
    cek('ditegaskan angkanya bukan nol', jb.indexOf('BUKAN nol') > -1);
    /* Kalau compliment dianggap 0, Net Sales digambar 259 jt — sama persis
       dengan Dibayar Tamu, dan 259 jt akan muncul TIGA kali. */
    const n = (jb.match(/Rp259\.000\.000/g) || []).length;
    cek('Net Sales tidak digambar sama dengan Dibayar Tamu', n === 2, 'Rp259jt muncul ' + n + '×');
    /* Jalur kedua tetap utuh: yang hilang cuma satu cabang. */
    cek('Realisasi tetap dijabarkan', jb.indexOf('Rp240.000.000') > -1);
  }

  /* ============ 2 & 3. Kontribusi hari & jam ============ */
  console.log('\n== Kontribusi per hari dalam seminggu ==');
  {
    const w = dom({}).window;
    await siap(w);
    w.go('hari'); await tunggu(80);
    const v = w.document.getElementById('app-view').innerHTML;
    const dw = potong(v, 'Omset per Hari dalam Seminggu', 'Dua Shift');

    cek('kolom Kontribusi ada',   dw.indexOf('Kontribusi') > -1);
    cek('kolom Total omset ada',  dw.indexOf('Total omset') > -1);
    cek('kolom Rata-rata omset tetap ada', dw.indexOf('Rata-rata omset') > -1);

    /* INVARIAN UTAMA: berjumlah 100%. Penyebut dari ringkas.grand (260 jt)
       akan memberi 80,8% — jauh di luar toleransi pembulatan tujuh baris. */
    const p = persenTebal(dw);
    const jml = p.reduce((a, x) => a + x, 0);
    cek('kontribusi berjumlah 100%', Math.abs(jml - 100) < 0.4, 'jumlahnya ' + jml.toFixed(1) + '%');
    cek('penyebutnya bukan ringkas.grand', Math.abs(jml - 80.8) > 1,
        'jumlah ' + jml.toFixed(1) + '% = tanda penyebutnya ringkas.grand');

    /* Kontribusi dihitung dari JUMLAH, jadi Sabtu (3 hari × 40 jt = 120 jt)
       harus mengalahkan Senin (1 hari × 90 jt) walau rata-ratanya lebih
       kecil. Kalau kontribusinya diam-diam dihitung dari rata-rata, urutannya
       terbalik. */
    cek('Sabtu 57,1% (dari jumlah, bukan rata-rata)', dw.indexOf('>57.1%<') > -1);
    cek('Senin 42,9%', dw.indexOf('>42.9%<') > -1);

    cek('total omset Sabtu ditulis',  dw.indexOf('Rp120.000.000') > -1);
    cek('rata-rata Sabtu tetap 40 jt', dw.indexOf('Rp40.000.000') > -1);
    cek('rata-rata Senin 90 jt',       dw.indexOf('Rp90.000.000') > -1);

    /* BATANG MENGIKUTI KOLOM TOTAL. Data uji dibuat supaya kedua kolom
       memberi puncak yang BERBEDA: kalau batangnya masih memakai rata-rata,
       yang penuh adalah Senin, bukan Sabtu. */
    cek('batang penuh di Sabtu (total terbesar)',
        barisTabel(dw, 'Sabtu').indexOf('width:100%') > -1);
    cek('batang Senin tidak penuh',
        barisTabel(dw, 'Senin').indexOf('width:100%') < 0);

    cek('kaki tabel menyebut kolom mana yang digambar batangnya',
        dw.indexOf('batangnya menggambar kolom itu') > -1);
    cek('kaki tabel menyebut totalnya', dw.indexOf('Rp210.000.000') > -1);

    /* ---- sebaran per jam ---- */
    console.log('\n== Kontribusi per jam ==');
    const jm = potong(v, 'Sebaran per Jam', 'Per Tanggal');
    cek('kolom Kontribusi ada di sebaran jam', jm.indexOf('Kontribusi') > -1);

    const pj = persenTebal(jm);
    const jmlJ = pj.reduce((a, x) => a + x, 0);
    cek('kontribusi jam berjumlah 100%', Math.abs(jmlJ - 100) < 0.4,
        'jumlahnya ' + jmlJ.toFixed(1) + '%');
    cek('tiga jam terisi digambar', pj.length === 3, pj.length + ' baris');
    cek('jam 19 paling besar 42,9%', jm.indexOf('>42.9%<') > -1);

    /* Penyebutnya `tot` — SAMA dengan kartu Dua Shift di atasnya. Dua penyebut
       berbeda di satu halaman membuat kolom yang sama berbunyi lain di dua
       tempat, dan yang mencocokkannya tidak punya cara tahu mana yang benar. */
    cek('penyebut jam disebut angkanya', jm.indexOf('Rp210.000.000') > -1);
    cek('penyebutnya disebut sama dengan kartu Dua Shift',
        jm.indexOf('penyebut yang sama dengan kartu Dua Shift') > -1);

    /* Omset yang jamnya tidak terbaca (260 − 210 = 50 jt) WAJIB disebut.
       Kalau didiamkan, jumlah kolom Omset di tabel ini tidak sama dengan
       total di Ringkasan dan yang menjumlahkannya akan mengira salah satu
       halaman salah. */
    cek('omset tanpa jam disebut nominalnya', jm.indexOf('Rp50.000.000') > -1);
    cek('sebabnya dikatakan', jm.indexOf('jamnya tidak') > -1);
  }

  /* ============ Selisih POS vs Rekap dipecah per hari ============

     Datanya MENIRU KEJADIAN NYATA di produksi (Agustus 2026): 30 hari yang
     net-nya cocok semua, dan SATU hari yang kolom tax-nya kehilangan tiga
     digit terakhir saat diketik. Itu bentuk kesalahan yang paling sulit
     dilihat — angkanya tetap masuk akal, netnya benar, dan selisihnya cuma
     0,3% dari sebulan. */
  console.log('\n== Selisih dipecah per hari ==');
  {
    /* 5 hari, semuanya sinkron POS<->Rekap, kecuali hari ke-3 yang tax-nya
       diketik 2.514 padahal seharusnya 2.514.400. */
    const HARI_S = {}, DAILY_S = [];
    for (let i = 1; i <= 5; i++) {
      const t = '2026-08-0' + i;
      const net = 20000000, svc = 1000000;
      const tax = (i === 3) ? 2514 : 2000000;   // hari ke-3 salah ketik
      HARI_S[t] = { grand: net + svc + 2000000, bill: 100, net };
      DAILY_S.push({ date:t, food:12000000, bev:8000000, lainnya:0, discount:0,
                     service_charge:svc, tax:tax, bill:100 });
    }
    const LAP_S = { '2026-08': { bulan:'2026-08', jenis:'bill', berkas:'s.xlsx',
      diunggah:'2026-09-06', oleh:'Uji', hari:HARI_S, jam:JAM, menu:{},
      ringkas:{ bill:500, grand:5*23000000, net:5*20000000, svc:5000000, tax:10000000,
                sub:0, discMenu:0, discBill:0, discVoucher:0, pax:0, billPax:0 } } };

    const w2 = dom({ laporan: LAP_S, daily: DAILY_S }).window;
    await siap(w2);
    w2.go('ringkasan'); await tunggu(100);
    const rv = w2.document.getElementById('app-view').innerHTML;
    const tb = potong(rv, 'Selisihnya Ada di Hari Mana', 'Jembatan ke Tiga Layar');

    cek('tabel rincian digambar', tb.length > 200, String(tb.length));
    /* Hari yang salah HARUS disebut tanggalnya — itu satu-satunya yang dicari
       orang yang membuka tabel ini. */
    cek('menyebut tanggal yang berselisih', tb.indexOf('03 Agu 2026') > -1 || tb.indexOf('3 Agu 2026') > -1,
        tb.slice(tb.indexOf('<tbody>'), tb.indexOf('<tbody>') + 260));
    /* Selisihnya = 2.000.000 - 2.514 */
    cek('nominal selisihnya benar', tb.indexOf('Rp1.997.486') > -1);
    /* LETAKNYA yang paling menolong: net cocok, yang beda tax & service.
       Menunjuk kolom yang salah membuat orang membuka layar yang keliru. */
    cek('letak selisih menunjuk tax & service', tb.indexOf('tax &amp; service') > -1 || tb.indexOf('tax & service') > -1);
    cek('TIDAK menuduh net', tb.indexOf('net (food/bev') < 0);
    /* Hari yang cocok disebut jumlahnya — tabel yang cuma memuat satu baris
       tanpa keterangan terbaca seolah 4 hari lain tidak diperiksa. */
    cek('jumlah hari yang cocok disebut', /4 hari cocok persis/.test(tb), tb.slice(-260));
    /* Jumlah di tabel WAJIB sama dengan kartu Selisih di atasnya. Dua angka
       yang seharusnya sama tapi berbeda membuat tabel ini berhenti dipercaya
       justru saat ia benar. */
    cek('totalnya dinyatakan sama dengan kartu Selisih',
        tb.indexOf('sama dengan kartu Selisih') > -1);
    const kartu = potong(rv, 'Dibanding Rekap Penjualan', 'Selisihnya Ada di Hari Mana');
    cek('kartu Selisih memang menyebut angka yang sama', kartu.indexOf('Rp1.997.486') > -1);
  }

  /* Tidak ada selisih adalah JAWABAN, bukan alasan menyembunyikan kartunya. */
  console.log('\n== Kalau semua hari cocok ==');
  {
    const HARI_C = {}, DAILY_C = [];
    for (let i = 1; i <= 3; i++) {
      const t = '2026-08-0' + i;
      HARI_C[t] = { grand: 23000000, bill: 100, net: 20000000 };
      DAILY_C.push({ date:t, food:12000000, bev:8000000, lainnya:0, discount:0,
                     service_charge:1000000, tax:2000000, bill:100 });
    }
    const LAP_C = { '2026-08': { bulan:'2026-08', jenis:'bill', berkas:'c.xlsx',
      diunggah:'2026-09-06', oleh:'Uji', hari:HARI_C, jam:JAM, menu:{},
      ringkas:{ bill:300, grand:69000000, net:60000000, svc:3000000, tax:6000000,
                sub:0, discMenu:0, discBill:0, discVoucher:0, pax:0, billPax:0 } } };
    const w3 = dom({ laporan: LAP_C, daily: DAILY_C }).window;
    await siap(w3);
    w3.go('ringkasan'); await tunggu(100);
    const rv = w3.document.getElementById('app-view').innerHTML;
    cek('dikatakan semuanya cocok', rv.indexOf('hari cocok persis') > -1);
    cek('tidak menggambar tabel selisih', rv.indexOf('Selisihnya Ada di Hari Mana') < 0);
  }

  console.log('\n---------------------------------------');
  console.log('LULUS ' + lulus + '   GAGAL ' + gagal);
  process.exit(gagal ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
