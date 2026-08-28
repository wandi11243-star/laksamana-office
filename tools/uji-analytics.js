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
    cek('base tidak ikut jadi baris bahan',
        !/>Susu Aren( \([^)]*\))?</.test(v), 'Susu Aren muncul sebagai bahan');
    /* Menu tanpa resep DILAPORKAN. Tanpa itu perkiraan terlihat lengkap
       padahal sebagian menunya tidak pernah ikut dihitung. */
    cek('menu tanpa resep dilaporkan', v.indexOf('belum punya resep') > -1);
    cek('menu tanpa resep disebut namanya', v.indexOf('Menu Tanpa Resep') > -1);
    cek('disebut berapa persen nilainya yang tidak terhitung', /% dari nilai penjualan menu/.test(v));
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
  console.log('\n== Pengaruh event ==');
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
      event: [{ start_datetime:'2026-08-01 19:00', title:'Live Music Agustusan' }],
      mkt:   [{ tanggal:'2026-08-01', nama:'Promo Merdeka' }] });
    await siap(dom.window);
    const w = dom.window, d = w.document;
    w.go('event'); await tunggu(60);
    const v = d.getElementById('app-view').innerHTML;

    cek('acara dari modul Event terbaca', v.indexOf('Live Music Agustusan') > -1);
    cek('acara dari modul Marketing terbaca', v.indexOf('Promo Merdeka') > -1);
    /* Satu hari dengan dua acara tetap DIHITUNG SATU HARI — kalau tidak,
       rata-ratanya condong ke hari itu saja. */
    cek('satu hari berevent dihitung sekali', /Hari ada event[\s\S]{0,120}>1</.test(v),
        v.slice(v.indexOf('Hari ada event') - 40, v.indexOf('Hari ada event') + 200));
    /* Peringatan sebab-akibat WAJIB ada. Event ditaruh di akhir pekan, dan
       akhir pekan memang lebih ramai tanpa event apa pun. */
    cek('mengatakan angkanya bukan bukti sebab-akibat', v.indexOf('bukan bukti sebab-akibat') > -1);
    cek('menyebutkan jumlah harinya', v.indexOf('hari berevent vs') > -1);
    /* Pembanding per hari yang SAMA: Sabtu berevent vs Sabtu biasa = +33%. */
    cek('dibandingkan dengan hari yang sama', v.indexOf('Rata-rata hari sama') > -1);
    cek('selisih dihitung terhadap Sabtu biasa, bukan seluruh hari',
        v.indexOf('+33%') > -1, v.slice(v.indexOf('Hari Berevent, Satu per Satu'), v.indexOf('Hari Berevent, Satu per Satu') + 900));
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
