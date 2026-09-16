/* Uji halaman VOID & CANCEL MENU di modul Analytics — 16 September 2026,
   permintaan user: "tab baru namanya Void ... siapa yang sering melakukan
   void, per detailnya, alasan void itu karena apa, item, jumlah total,
   harganya, dan jamnya."

   YANG PALING MAHAL, dan karena itu yang diuji pertama: BERKASNYA DIKENALI
   SEBAGAI JENISNYA SENDIRI. Diukur atas berkas aslinya, DUA BELAS kolom
   Cancel Menu Detail Report cocok dengan peta kolom laporan penjualan — menu,
   qty, kategori, subtotal, service charge, tax, total, nomor bill. Yang
   menahannya jatuh ke ringkasPos() cuma ketiadaan satu kolom tanggal. Kalau
   pengenalnya lepas, berkas ini tersimpan sebagai Detail Report dan MENIMPA
   ringkasan penjualan bulan itu — kehilangan data, bukan sekadar halaman yang
   salah.

   Yang dijaga berikutnya:

     - CANCEL TIDAK IKUT TERBUANG. Tab-nya bernama "Void", tapi berkasnya
       memuat keduanya dan di Agustus 2026 justru Cancel yang membawa 68%
       nilainya. Menyaring ke Void saja membuang mayoritas uangnya di halaman
       yang dibuka untuk melihat berapa yang dibatalkan.
     - JAMNYA TIDAK DIGESER. Serial di berkas ini sudah jam WIB — dibuktikan
       dengan mencocokkannya ke epoch di nomor bill. Digeser +7 seperti
       datetime ber-zona, seluruh kolom jam meleset tujuh jam dan tetap
       terlihat wajar.
     - BARIS vs BILL. 84 baris dari 17 bill; satu bill sendirian membawa 16
       baris. Yang tertukar melaporkan lima kali lipat.
     - DAFTAR KUNCI TERTUTUP di anSimpanVoid(). Kunci yang dihasilkan pengurai
       tapi tidak disebut di sana dibuang di klien tanpa satu pun galat — itu
       tempat `paket`, `kategori`, dan `katMenu` tertinggal lima hari. Diuji
       lewat putaran simpan SUNGGUHAN, bukan dengan menyuntikkan datanya.
     - HALAMANNYA BISA DIBUKA. Entri TITLES yang hilang membuat halamannya
       memantul balik ke Ringkasan tanpa satu pun galat — sudah kejadian di
       modul DW pada 15 September 2026. */
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

/* Pembaca .xlsx disisipkan inline — jsdom tidak mengambil skrip eksternal, dan
   yang dijalankan harus tetap berkas aslinya. */
const ASET_XLSX = fs.readFileSync(path.join(ROOT, 'deploy', 'assets', 'xlsx-baca.js'), 'utf8');
const HTML_ASLI = fs.readFileSync(path.join(ROOT, 'deploy', 'analytics', 'index.html'), 'utf8');
const HTML = HTML_ASLI.replace(
  '<script src="../assets/xlsx-baca.js"><' + '/script>',
  () => '<script>' + ASET_XLSX + '<' + '/script>');
if (HTML === HTML_ASLI) { console.error('tag xlsx-baca.js tidak ketemu di sumber analytics'); process.exit(2); }

let lulus = 0, gagal = 0, lewat = 0;
const cek = (n, s, k) => {
  if (s) { lulus++; console.log('  OK   ' + n); }
  else { gagal++; console.log('  GAGAL ' + n + (k ? '  -> ' + k : '')); }
};
const sama = (n, d, h) => cek(n, d === h, 'dapat ' + JSON.stringify(d) + ', harusnya ' + JSON.stringify(h));
const melewat = (n, sebab) => { lewat++; console.log('  LEWAT ' + n + '  (' + sebab + ')'); };
const tunggu = ms => new Promise(r => setTimeout(r, ms));

/* Serial Excel dari tanggal + jam. Dipakai membangun fixture; kalau rumusnya
   meleset, asersi pertama di bawah yang berbunyi — bukan diam-diam menggeser
   seluruh fixture. */
function serial(iso, jam) {
  const p = iso.split('-').map(Number);
  return (Date.UTC(p[0], p[1] - 1, p[2]) / 86400000) + 25569 + (jam / 24);
}

/* FIXTURE: dirancang supaya TIAP KESALAHAN memberi hasil yang BERBEDA.

     benar                       -> 5 baris, 2 bill, Rp1.050.000
     disaring ke Void saja       -> 3 baris, Rp350.000
     baris bulan lain ikut       -> 6 baris, Rp1.550.000
     baris dihitung sebagai bill -> 5 bill
     "-" dianggap orang          -> muncul di peringkat pemesan

   Dua alasan sengaja ditulis beda huruf besar-kecil ("ganti produk" vs
   "Ganti Produk"): digabung, ia baris teratas; tidak, ia terbelah dua. */
const BARIS_CSV = [
  ['SLMCL-B1','Laksamana','ICE KOPI LAKSAMANA','','BEVERAGES','KOPI','GITA',serial('2026-08-09',19),'SPV',serial('2026-08-09',22),'Void','ganti produk','1','100000','0','0','100000'],
  ['SLMCL-B1','Laksamana','BAKMI AYAM','','FOOD','NUSANTARA','GITA',serial('2026-08-09',19),'SPV',serial('2026-08-09',22),'Void','Ganti Produk','2','200000','0','0','200000'],
  ['SLMCL-B1','Laksamana','TEH TARIK','','BEVERAGES','TEH','-',serial('2026-08-09',19),'SPV',serial('2026-08-09',22),'Void','Salah Input Kasir','1','50000','0','0','50000'],
  ['SLMCL-B2','Laksamana','NASI GORENG','','FOOD','NUSANTARA','SULIS',serial('2026-08-15',20),'CINDY',serial('2026-08-15',23),'Cancel','Cancel Customer','1','400000','0','0','400000'],
  ['SLMCL-B2','Laksamana','SATE MADURA','','FOOD','NUSANTARA','SULIS',serial('2026-08-15',20),'CINDY',serial('2026-08-15',23),'Cancel','Salah Input Kasir','1','300000','0','0','300000'],
  /* Bulan SEBELAH — wajib dibuang, aturan yang sama dengan hari[] & error[]. */
  ['SLMCL-B9','Laksamana','MENU JULI','','FOOD','NUSANTARA','TASYA',serial('2026-07-30',18),'ANDY',serial('2026-07-30',21),'Void','Testing System','5','500000','0','0','500000'],
];
function csvVoid() {
  const kepala = ['Sales Number','Branch','Menu','Menu Code','Menu Category','Menu Category Detail',
    'Order By','Order Time','Cancel / Void By','Cancel / Void Time','Cancel / Void','Cancel Notes',
    'Qty','Subtotal','Service Charge','Tax','Total'];
  /* Dua belas baris judul & penyaring di atas kepalanya, persis seperti berkas
     POS aslinya — itu yang membuat cariBarisKepala() benar-benar diuji. */
  const atas = ['Cancel Menu Detail Report','PT LAKSAMANA MUDA BERSATU','',
    'Generated,16-09-2026','Period,01-08-2026 - 31-08-2026','Branch,All',
    'Type,Cancel / Void (Default)','Status,all','Is Preview Bill,1',
    'Generated Username,MUDASUPERADMIN','Report File Name,uji',''];
  return atas.join('\n') + '\n' + kepala.join(',') + '\n'
    + BARIS_CSV.map(r => r.join(',')).join('\n') + '\n';
}

function bukaModul() {
  const jejak = { simpan: [] };
  const vc = new VirtualConsole();
  const d = new JSDOM(HTML, {
    url: 'https://team.laksamanamuda.id/analytics/',
    runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(w) {
      w.alert = () => {}; w.confirm = () => true; w.print = () => {}; w.scrollTo = () => {};
      /* .xlsx diurai DecompressionStream milik peramban; jsdom tidak punya,
         jadi yang dipinjamkan milik Node. Yang dijalankan tetap pembaca ZIP
         yang sungguhan. Pola yang sama dengan uji-promo.js. */
      w.DecompressionStream = DecompressionStream;
      w.Blob = Blob; w.Response = Response; w.TextDecoder = TextDecoder;
      try {
        w.localStorage.setItem('lm_session', JSON.stringify({
          expiry: Date.now() + 3600000, userId: 'u-uji', name: 'Penguji',
          modules: ['analytics'], adminModules: ['analytics'] }));
      } catch (e) {}
      w.fetch = async (url, init) => {
        const u = String(url);
        let body = {}; try { body = init && init.body ? JSON.parse(init.body) : {}; } catch (e) {}
        const balas = o => ({ ok: true, status: 200, text: async () => JSON.stringify(o), json: async () => o });
        if (body && body.action === 'analyticsSave') {
          /* Yang DIKIRIM dicatat apa adanya. Inilah satu-satunya cara melihat
             kunci apa yang benar-benar lolos daftar tertutup di klien. */
          jejak.simpan.push(JSON.parse(JSON.stringify(body.data || {})));
          return balas({ ok: true, data: {} });
        }
        if (u.indexOf('hpp.php') > -1) return balas({ bahan: [], resep: [], setting: {} });
        if (u.indexOf('account-api') > -1) return balas({ ok: true, members: [] });
        return balas({ ok: true, data: { state: { laporan: {}, promo: {}, voidb: {}, setting: {} } } });
      };
    }
  });
  return { w: d.window, jejak };
}
async function siap(w) {
  for (let i = 0; i < 240; i++) {
    try { if (w.eval('typeof AN !== "undefined" && AN && typeof ringkasVoid === "function"')) return; }
    catch (e) {}
    await tunggu(50);
  }
  throw new Error('modul Analytics tidak pernah siap');
}
/* Berkas dipalsukan sebagai objek File seadanya — yang dijalankan tetap
   bacaBerkasTabel() + uraiBerkas() + anSimpanUnggah() yang sungguhan. */
function berkas(w, nama, teks) {
  return { name: nama, text: async () => teks,
           arrayBuffer: async () => new w.ArrayBuffer(0) };
}
async function unggah(w, nama, teks) {
  w.eval('window.__f = null;');
  w.__f = berkas(w, nama, teks);
  await w.eval('anPilihBerkas({ files: [window.__f] })');
  for (let i = 0; i < 80; i++) { if (w.eval('!!UNGGAH_HASIL')) break; await tunggu(25); }
  return w.eval('UNGGAH_HASIL ? JSON.parse(JSON.stringify(UNGGAH_HASIL)) : null');
}

(async () => {
  const { w, jejak } = bukaModul();
  await siap(w);

  console.log('\n== Fixture-nya sendiri sahih ==');
  sama('serial -> tanggal bolak-balik', w.eval('isoDari(' + serial('2026-08-09', 22) + ')'), '2026-08-09');
  sama('serial -> jam dibaca apa adanya (tidak digeser)', w.eval('jamDari(' + serial('2026-08-09', 22) + ')'), 22);

  /* ================================================================
     1. PENGENALAN JENIS — yang paling mahal kalau lepas
     ================================================================ */
  console.log('\n== Berkasnya dikenali sebagai jenisnya sendiri ==');
  const u = await unggah(w, 'Cancel Menu Detail Report_uji.csv', csvVoid());
  cek('berkasnya terbaca', !!u, 'UNGGAH_HASIL kosong');
  if (!u) { console.log('\n' + lulus + ' OK, ' + gagal + ' GAGAL'); process.exit(1); }
  sama('dikenali kind=void, BUKAN pos', u.kind, 'void');
  sama('bulannya dari datanya, bukan dari baris Period', u.bulan, '2026-08');

  console.log('\n== Yang terbaca dari isinya ==');
  const r = u.ringkas || {};
  sama('5 baris ikut (yang bulan sebelah dibuang)', r.nBaris, 5);
  sama('...dan yang dibuang dihitung', r.blnLain, 1);
  sama('2 bill, bukan 5 — satu bill membawa banyak item', r.nBill, 2);
  sama('qty dijumlahkan, bukan dihitung barisnya', r.qty, 6);
  sama('nilainya Void + Cancel, bukan Void saja', r.total, 1050000);

  const bar = u.baris || [];
  sama('Cancel TIDAK ikut terbuang', bar.filter(x => /cancel/i.test(x.jenis)).length, 2);
  sama('...dan Void tetap ada', bar.filter(x => /void/i.test(x.jenis)).length, 3);
  sama('jamnya jam WIB apa adanya', (bar.find(x => x.bill === 'SLMCL-B1') || {}).jam, 22);
  /* "-" adalah kolom kosong versi POS ini, bukan nama orang. */
  sama('"-" di Order By tidak jadi nama orang',
       bar.filter(x => x.orderBy === '-').length, 0);
  cek('...dan barisnya tetap ikut', bar.filter(x => x.menu === 'TEH TARIK').length === 1);

  /* ================================================================
     2. PUTARAN SIMPAN SUNGGUHAN — daftar kunci tertutup
     ================================================================ */
  console.log('\n== Disimpan lewat jalur sungguhan ==');
  jejak.simpan.length = 0;
  await w.eval('anSimpanUnggah()');
  await tunggu(150);
  cek('ada yang dikirim ke server', jejak.simpan.length > 0, 'tidak ada analyticsSave');
  const terkirim = jejak.simpan[jejak.simpan.length - 1] || {};
  const vb = (terkirim.voidb || {})['2026-08'] || null;
  cek('laporan Void ikut di yang dikirim', !!vb, Object.keys(terkirim).join(','));
  if (vb) {
    /* INVARIAN, bukan daftar nama: tiap kunci yang dibaca halamannya wajib
       selamat melewati daftar tertutup di anSimpanVoid(). Itu yang akan
       menangkap kunci BERIKUTNYA yang ditambahkan pengurai tapi lupa
       disebut di blok simpan. */
    ['diunggah', 'oleh', 'berkas', 'baris', 'ringkas'].forEach(k =>
      cek('kunci "' + k + '" selamat sampai server', vb[k] !== undefined, Object.keys(vb).join(',')));
    sama('...dan barisnya utuh', (vb.baris || []).length, 5);
    sama('...berikut ringkasannya', (vb.ringkas || {}).nBill, 2);
  }

  /* ================================================================
     3. HALAMANNYA BISA DIBUKA, dan isinya menjawab yang ditanya
     ================================================================ */
  console.log('\n== Halamannya ==');
  /* TITLES yang hilang membuat halamannya memantul balik tanpa satu pun galat
     — pelajaran modul DW, 15 September 2026. Diperiksa sebagai INVARIAN. */
  cek('halaman "voidb" punya judul di TITLES', w.eval('!!TITLES.voidb'));
  cek('...dan punya penggambar di peta router',
      /voidb\s*:\s*vVoid/.test(HTML_ASLI), 'router tidak menyebut vVoid');

  w.eval('go("voidb")');
  await tunggu(80);
  sama('go("voidb") benar-benar mendarat di sana', w.eval('CURRENT'), 'voidb');
  const v = w.document.getElementById('app-view').innerHTML;

  cek('tabel "Siapa yang Membatalkan" digambar', v.indexOf('Siapa yang Membatalkan') > -1);
  cek('...dan SPV berdiri di sana', v.indexOf('SPV') > -1);
  cek('tabel "Alasan Pembatalan" digambar', v.indexOf('Alasan Pembatalan') > -1);
  cek('tabel "Jam Pembatalan" digambar', v.indexOf('Jam Pembatalan') > -1);
  cek('tabel detail per item digambar', v.indexOf('Detail Tiap Item') > -1);
  cek('itemnya disebut namanya', v.indexOf('ICE KOPI LAKSAMANA') > -1);

  /* Alasan yang cuma beda huruf besar-kecil digabung, dan yang tampil ejaan
     pertama — bukan dua baris yang membelah baris teratasnya. */
  /* DIJEPIT KE KARTUNYA. Tabel detail di bawah memang menampilkan alasan tiap
     barisnya apa adanya — dua baris di sana MEMANG menyebut "ganti produk",
     dan itu benar. Asersi yang menyapu seluruh halaman cocok dengan tabel yang
     bukan yang diuji; bentuk yang sudah berulang kali menggigit di repo ini. */
  const iAl = v.indexOf('Alasan Pembatalan');
  const iJam = v.indexOf('Jam Pembatalan');
  const kartuAlasan = iAl < 0 ? '' : v.slice(iAl, iJam > iAl ? iJam : v.length);
  const nGanti = (kartuAlasan.match(/ganti produk/gi) || []).length;
  cek('alasan beda huruf besar-kecil digabung jadi SATU baris', nGanti === 1,
      'ketemu ' + nGanti + ' kali di kartu Alasan');

  /* Nilai Void dan Cancel disebut TERPISAH — digabung jadi satu angka, yang
     membaca halaman bernama "Void" mengira seluruhnya void. */
  cek('kartu menyebut Void dan Cancel terpisah',
      /Void\s*Rp/.test(v.replace(/&nbsp;/g, ' ')) && /Cancel\s*Rp/.test(v.replace(/&middot;/g, ' ')),
      v.slice(v.indexOf('Nilai Dibatalkan'), v.indexOf('Nilai Dibatalkan') + 300));

  /* Nama di kolom itu belum tentu orang — 75 dari 84 baris produksi tercatat
     atas nama akun jabatan "SPV". */
  cek('dikatakan bahwa isinya akun, bukan tentu satu orang',
      /akun yang menekan tombolnya/i.test(v), 'kalimatnya tidak ada');

  /* Baris ≠ bill, dan bedanya disebut angkanya. */
  cek('beda baris vs bill dikatakan', /BUKAN jumlah kejadian/i.test(v), 'keterangannya tidak ada');

  console.log('\n== Kotak cari di tabel detail ==');
  const kotak = w.document.getElementById('vd_q');
  cek('kotak carinya ada', !!kotak);
  if (kotak) {
    kotak.value = 'bakmi';
    kotak.dispatchEvent(new w.Event('input', { bubbles: true }));
    await tunggu(40);
    const det = w.document.getElementById('vd_detail').innerHTML;
    cek('mencari menyaring tabelnya', det.indexOf('BAKMI AYAM') > -1 && det.indexOf('NASI GORENG') < 0,
        det.slice(0, 160));
    /* Elemen kotaknya HARUS yang sama — kotak yang diganti elemen baru
       kehilangan fokus, dan hanya huruf pertama yang masuk. */
    cek('kotaknya elemen yang SAMA sesudah mengetik',
        w.document.getElementById('vd_q') === kotak);
  }

  /* ================================================================
     4. Berkas ASLI, kalau ada — angka dari POS, bukan dari kode kita
     ================================================================ */
  console.log('\n== Berkas asli dari POS ==');
  const asli = fs.readdirSync(ROOT).filter(f => /^Cancel Menu Detail Report.*\.xlsx$/i.test(f))[0];
  if (!asli) {
    melewat('berkas Cancel Menu Detail Report tidak ada di root repo',
            'ia tidak boleh di-commit — lihat .gitignore');
  } else {
    const buf = fs.readFileSync(path.join(ROOT, asli));
    w.__f2 = { name: asli, text: async () => '',
      arrayBuffer: async () => { const ab = new w.ArrayBuffer(buf.length);
        new w.Uint8Array(ab).set(buf); return ab; } };
    await w.eval('anPilihBerkas({ files: [window.__f2] })');
    for (let i = 0; i < 120; i++) { if (w.eval('!!UNGGAH_HASIL')) break; await tunggu(30); }
    const a = w.eval('UNGGAH_HASIL ? JSON.parse(JSON.stringify(UNGGAH_HASIL)) : null');
    cek('berkas aslinya terbaca', !!a, 'UNGGAH_HASIL kosong');
    if (a) {
      sama('dikenali kind=void', a.kind, 'void');
      sama('84 baris item', (a.ringkas || {}).nBaris, 84);
      sama('17 bill', (a.ringkas || {}).nBill, 17);
      const bv = (a.baris || []).filter(x => /^void$/i.test((x.jenis || '').trim())).length;
      const bc = (a.baris || []).filter(x => /^cancel$/i.test((x.jenis || '').trim())).length;
      sama('67 Void', bv, 67);
      sama('17 Cancel', bc, 17);
      sama('nilai totalnya Rp8.469.050', Math.round((a.ringkas || {}).total), 8469050);
    }
  }

  console.log('\n' + lulus + ' OK, ' + gagal + ' GAGAL' + (lewat ? ', ' + lewat + ' LEWAT' : ''));
  w.close();
  process.exit(gagal ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
