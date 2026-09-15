/* Uji DASHBOARD modul Daily Worker — dua revisi user 15 September 2026:

     1. "tombol konfirmasi kehadiran, chat itu letaknya jangan di detail"
        → keduanya pindah ke BARIS tabel Dashboard, dan TIDAK BOLEH kembali
          jadi aksi modal Detail.
     2. "di bagian dashboard pengajuannya hanya bisa lihat yang mengajukan dari
        divisi masing-masing, kecuali superadmin atau HRD bisa lihat
        keseluruhan"
        → seluruh daftar DAN angka di halaman itu disaring menurut divisi.

   YANG PALING MUDAH LEPAS, dan karena itu yang dijaga paling keras:

     - Disaring SEPARUH. Daftarnya menyusut sementara kartu angkanya tidak,
       sehingga "Menunggu (semua) 2" berdiri di atas daftar berisi 1 — dan
       yang membacanya mencari baris yang memang sengaja tidak ada. Karena itu
       kartu-kartunya dibaca ANGKANYA, bukan cuma daftarnya.
     - Saringan tanpa keterangan. Daftar yang menyusut tanpa menyebut sebabnya
       dilaporkan sebagai data hilang — aturan yang berulang di CLAUDE.md.
     - Tombol yang dipasang di baris yang BISA DIKLIK. Baris tabel Dashboard
       membuka Detail; tombol tanpa stopPropagation justru membuka modal yang
       tombolnya baru saja dicabut. */
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
      w.scrollTo = () => {};
      w.__buka = [];
      w.open = (url) => { w.__buka.push(String(url)); return null; };
      w.fetch = async (url) => {
        const u = String(url);
        const balas = o => ({ ok: true, status: 200,
          text: async () => JSON.stringify(o), json: async () => o });
        if (/account-api/.test(u)) return balas({ ok: true, members: [] });
        if (/jadwal-api/.test(u))  return balas({ ok: true, data: { headIds: [] } });
        if (/-api-mysql/.test(u) && !/dw-api-mysql/.test(u)) {
          return balas({ ok: true, data: { events: [], clients: [], reservations: [] } });
        }
        return balas({ ok: true, data: { pekerja: [], ajuan: [], permintaan: [], setting: {},
                                         peran: { hrd: false, head: true, lihat: true, admin: false, divisi: ['bar'] } } });
      };
    },
  });
}

async function siap(w) {
  for (let i = 0; i < 200; i++) {
    try { if (w.eval('typeof S !== "undefined" && !!S && typeof divisiTampakDW === "function"')) return; }
    catch (e) {}
    await tunggu(50);
  }
  throw new Error('modul DW tidak pernah siap');
}

/* Fixture: DUA divisi yang sama-sama punya isi di tiap wadah. Satu divisi saja
   tidak bisa membedakan "disaring" dari "kebetulan memang cuma ada satu". */
function pasangData(w, peran) {
  const ini = w.eval('hariIni()');
  const besok = w.eval('addD(hariIni(),1)');
  const kemarin = w.eval('addD(hariIni(),-1)');
  const data = {
    peran: peran,
    setting: {
      tarif: { 'Bartender': 100000 },
      jamDasar: 6,
      jam: [{ n: 'Sore', m: '16:00', s: '23:00' }],
      /* Kuota 1 di KETIGA konteks: kalau cuma diisi salah satunya, hasil uji
         berubah menurut hari apa ia dijalankan. */
      kuota: { bar: { biasa: 1, weekend: 1, event: 1 },
               kitchen: { biasa: 1, weekend: 1, event: 1 } },
    },
    pekerja: [
      { id: 'P1', nama: 'Andi',  hp: '081200000001', divisi: 'bar',     posisi: 'Bartender', status: 'AKTIF' },
      { id: 'P2', nama: 'Budi',  hp: '081200000002', divisi: 'kitchen', posisi: 'Bartender', status: 'AKTIF' },
      { id: 'P3', nama: 'Citra', hp: '081200000003', divisi: 'bar',     posisi: 'Bartender', status: 'AKTIF' },
      { id: 'P4', nama: 'Dewi',  hp: '081200000004', divisi: 'kitchen', posisi: 'Bartender', status: 'AKTIF' },
    ],
    ajuan: [
      { id: 'A1', dwId: 'P1', tgl: ini, m: '18:00', s: '23:00', divisi: 'bar',     posisi: 'Bartender', status: 'DISETUJUI', hadir: '' },
      { id: 'A2', dwId: 'P2', tgl: ini, m: '18:00', s: '23:00', divisi: 'kitchen', posisi: 'Bartender', status: 'DISETUJUI', hadir: '' },
      { id: 'A5', dwId: 'P3', tgl: ini, m: '18:00', s: '23:00', divisi: 'bar',     posisi: 'Bartender', status: 'DISETUJUI', hadir: 'HADIR' },
      { id: 'A6', dwId: 'P4', tgl: ini, m: '18:00', s: '23:00', divisi: 'kitchen', posisi: 'Bartender', status: 'DISETUJUI', hadir: '' },
      { id: 'A3', dwId: 'P1', tgl: ini,   m: '18:00', s: '23:00', divisi: 'bar',     posisi: 'Bartender', status: 'MENUNGGU' },
      { id: 'A4', dwId: 'P2', tgl: besok, m: '18:00', s: '23:00', divisi: 'kitchen', posisi: 'Bartender', status: 'MENUNGGU' },
      /* Besok & sudah disetujui: dipakai menguji kolom kehadiran TIDAK digambar
         untuk tanggal yang belum lewat. */
      { id: 'A7', dwId: 'P1', tgl: besok, m: '18:00', s: '23:00', divisi: 'bar', posisi: 'Bartender', status: 'DISETUJUI', hadir: '' },
      /* KEMARIN — dan ini yang membuat "tanggalnya ikut disetel" berarti.
         Diuji atas baris HARI INI, tombol yang diam-diam memakai hariIni()
         memulangkan angka yang sama persis dan mutasinya LOLOS. */
      { id: 'A8', dwId: 'P3', tgl: kemarin, m: '18:00', s: '23:00', divisi: 'bar', posisi: 'Bartender', status: 'DISETUJUI', hadir: '' },
    ],
    permintaan: [
      { id: 'M1', tgl: ini, divisi: 'bar',     m: '18:00', s: '23:00', posisi: 'Bartender', jumlah: 2, status: 'MENUNGGU', dibuatOleh: 'Head Bar' },
      { id: 'M2', tgl: ini, divisi: 'kitchen', m: '18:00', s: '23:00', posisi: 'Bartender', jumlah: 3, status: 'MENUNGGU', dibuatOleh: 'Head Kitchen' },
    ],
  };
  w.eval('S = normalizeState(' + JSON.stringify(data) + '); DASH_TGL=' + JSON.stringify(ini) + '; DIV="bar";');
  return { ini, besok, kemarin };
}

/* Halaman digambar ke wadah sendiri lalu DIBACA SEBAGAI DOM, bukan dicocokkan
   sebagai teks: kartu angka dan tabel isinya harus bisa dipisahkan, dan
   pencocokan teks atas seluruh halaman akan cocok dengan komentar & kalimat
   penjelas di panel lain. */
function gambar(w) {
  const d = w.document.createElement('div');
  d.innerHTML = w.eval('viewDashboard()');
  return d;
}
function angkaStat(kotak, label) {
  const s = Array.from(kotak.querySelectorAll('.stat'))
    .find(x => (x.querySelector('.l') || {}).textContent === label);
  return s ? (s.querySelector('.n') || {}).textContent : null;
}
function barisTabel(kotak) {
  return Array.from(kotak.querySelectorAll('table.list tbody tr'));
}
const HEAD_BAR  = { hrd: false, head: true,  lihat: true, admin: false, divisi: ['bar'] };
const HEAD_NOL  = { hrd: false, head: true,  lihat: true, admin: false, divisi: [] };
const HRD       = { hrd: true,  head: false, lihat: true, admin: true,  divisi: [] };

(async () => {
  const dom = bukaModul();
  const w = dom.window;
  await siap(w);

  /* ================================================================
     REVISI 2 — Dashboard disaring menurut divisi
     ================================================================ */
  console.log('\n== Head hanya melihat divisinya ==');
  w.eval('ME.admin=false;');
  const T = pasangData(w, HEAD_BAR);
  let k = gambar(w);

  sama('tabel DW masuk cuma berisi barisnya sendiri', barisTabel(k).length, 2);
  cek('...dan menyebut orang divisinya', k.textContent.indexOf('Andi') > -1);
  /* NAMA DIVISI LAIN TIDAK BOLEH MUNCUL DI MANA PUN di halaman ini — bukan
     cuma di tabelnya. Permintaan head divisi lain punya panelnya sendiri di
     bawah, dan itulah yang paling mudah terlewat saat menyaring. */
  cek('...dan TIDAK menyebut orang divisi lain', k.textContent.indexOf('Budi') < 0,
      'Budi (kitchen) ikut tergambar');
  cek('...termasuk di panel permintaan head', k.textContent.indexOf('Head Kitchen') < 0,
      'permintaan divisi lain ikut tergambar');
  cek('permintaan divisinya sendiri tetap ada', k.textContent.indexOf('Head Bar') > -1);

  /* Kartu angkanya ikut disaring — disaring separuh lebih menyesatkan daripada
     tidak disaring sama sekali. */
  sama('kartu "Menunggu (semua)" ikut disaring', angkaStat(k, 'Menunggu (semua)'), '1');
  sama('kartu "Permintaan Head" ikut disaring', angkaStat(k, 'Permintaan Head'), '1');
  sama('kartu "DW Masuk" ikut disaring', angkaStat(k, 'DW Masuk'), '2');

  /* Peringatan panduan menyebut JUMLAH SHIFT DISETUJUI divisi lain — angka
     pengajuan juga, cuma dalam bentuk lain. */
  const pita = Array.from(k.querySelectorAll('.note')).map(x => x.textContent).join(' | ');
  cek('peringatan panduan menyebut divisinya sendiri', /Bar 2\/1/.test(pita), pita);
  cek('...dan TIDAK menyebut divisi lain', !/Kitchen/.test(pita), pita);

  console.log('\n== Saringannya DIKATAKAN, bukan didiamkan ==');
  cek('halaman menyebut divisi apa yang sedang ditampilkan',
      /hanya menampilkan divisi/i.test(k.textContent), k.textContent.slice(0, 120));
  cek('...berikut nama divisinya', /Bar/.test(pita));

  console.log('\n== HRD & admin modul melihat seluruhnya ==');
  pasangData(w, HRD);
  k = gambar(w);
  sama('HRD: seluruh divisi tergambar', barisTabel(k).length, 4);
  sama('HRD: kartu "Menunggu (semua)" utuh', angkaStat(k, 'Menunggu (semua)'), '2');
  sama('HRD: kartu "Permintaan Head" utuh', angkaStat(k, 'Permintaan Head'), '2');
  cek('HRD: tidak ada pita saringan', !/hanya menampilkan divisi/i.test(k.textContent));

  /* Admin modul yang BUKAN HRD: daftar `hr` di Pengaturan bisa diisi tanpa
     memuat admin modulnya. Memakai satu penentu saja membuat salah satu dari
     keduanya kehilangan pandangan atas divisi lain tanpa ada yang mengubah
     haknya. */
  pasangData(w, HEAD_BAR);
  w.eval('ME.admin=true;');
  k = gambar(w);
  sama('admin modul (bukan HRD) melihat seluruhnya', barisTabel(k).length, 4);
  cek('admin modul: tidak ada pita saringan', !/hanya menampilkan divisi/i.test(k.textContent));
  w.eval('ME.admin=false;');

  console.log('\n== Head tanpa divisi: dikatakan sebabnya ==');
  pasangData(w, HEAD_NOL);
  k = gambar(w);
  sama('tidak ada baris yang tergambar', barisTabel(k).length, 0);
  cek('...dan sebabnya disebut, bukan layar kosong',
      /belum tercatat sebagai head divisi/i.test(k.textContent), k.textContent.slice(0, 200));

  /* ================================================================
     REVISI 1 — tombolnya di baris, BUKAN di Detail
     ================================================================ */
  console.log('\n== Tombolnya ada di barisnya ==');
  pasangData(w, HEAD_BAR);
  k = gambar(w);
  const br = barisTabel(k)[0];
  cek('baris tabel punya tombol Chat', !!br && /waAjuan\(/.test(br.innerHTML));
  cek('baris tabel punya tombol Kehadiran', !!br && /bukaKonfirmasi\(/.test(br.innerHTML));
  /* Barisnya sendiri membuka Detail; tanpa stopPropagation, menekan Chat
     justru membuka modal yang tombolnya baru saja dicabut. */
  const tbl = Array.from(br ? br.querySelectorAll('button') : []);
  const wa = tbl.find(b => /waAjuan\(/.test(b.getAttribute('onclick') || ''));
  const kh = tbl.find(b => /bukaKonfirmasi\(/.test(b.getAttribute('onclick') || ''));
  cek('tombol Chat menahan klik barisnya',
      !!wa && /stopPropagation/.test(wa.getAttribute('onclick')), wa && wa.getAttribute('onclick'));
  cek('tombol Kehadiran menahan klik barisnya',
      !!kh && /stopPropagation/.test(kh.getAttribute('onclick')), kh && kh.getAttribute('onclick'));
  cek('pil kehadiran ikut di barisnya', !!br && /Belum dikonfirmasi|stpill/.test(br.innerHTML));

  console.log('\n== ...dan TIDAK lagi di modal Detail ==');
  w.eval('bukaAjuan("A1")');
  const mf = w.document.querySelector('#modalRoot .mf');
  const tombolModal = mf ? Array.from(mf.querySelectorAll('button')).map(b => b.textContent).join(' | ') : '(tidak ada modal)';
  cek('Detail tidak lagi punya tombol Chat', !/Chat/.test(tombolModal), tombolModal);
  cek('Detail tidak lagi punya tombol Konfirmasi kehadiran',
      !/Konfirmasi kehadiran/.test(tombolModal), tombolModal);
  /* Modalnya sendiri tetap hidup — yang dicabut tombolnya, bukan halamannya. */
  cek('Detail tetap menggambar isinya', !!mf && tombolModal.indexOf('Tutup') > -1, tombolModal);
  w.eval('tutupModal()');

  console.log('\n== Tombol Kehadiran membuka tanggal BARIS ITU ==');
  pasangData(w, HEAD_BAR);
  w.eval('HADIR_TGL=""; VIEW="dashboard";');
  /* A8 bertanggal KEMARIN, bukan hari ini. Diuji atas baris hari ini, tombol
     yang diam-diam memakai hariIni() memulangkan angka yang sama persis —
     dan mutasinya lolos tanpa satu asersi pun bergerak. */
  w.eval('bukaKonfirmasi("A8")');
  await tunggu(200);
  sama('tanggalnya ikut disetel — tanggal BARISNYA', w.eval('HADIR_TGL'), T.kemarin);
  sama('alamatnya ikut ditulis', w.eval('location.hash'), '#/hadir');
  /* terapkanHash() DIPANGGIL LANGSUNG, bukan sekadar ditunggu. go() menulis
     hash, dan hashchange-lah yang memanggilnya — di jsdom itu asinkron, jadi
     asersi yang kebetulan membaca VIEW sebelum ia jalan akan HIJAU untuk
     halaman yang di peramban sungguhan memantul balik ke Dashboard. Persis
     itu yang menyembunyikan TITLES['hadir'] yang hilang selama sehari. */
  w.eval('terapkanHash()');
  sama('...dan halamannya BERTAHAN di situ', w.eval('VIEW'), 'hadir');

  /* Gerbangnya di FUNGSINYA, bukan cuma dengan tidak menggambar tombolnya:
     onclick di baris tabel bisa dipanggil dari console dalam sepuluh detik. */
  console.log('\n== Head tidak bisa menyeberang divisi ==');
  /* DIPASANG ULANG DULU. Berpindah halaman di blok sebelumnya memicu muat
     ulang, dan server tiruan memulangkan state kosong — tanpa ini
     bukaKonfirmasi("A2") berhenti di `if(!a) return` dan asersinya HIJAU apa
     pun yang dilakukan gerbangnya. Asersi hampa seperti itu persis yang
     meloloskan mutasi "head bisa menandai divisi lain" di putaran pertama. */
  pasangData(w, HEAD_BAR);
  cek('barisnya memang ada di data', w.eval('!!(S.ajuan||[]).find(x=>x.id==="A2")'));
  w.eval('HADIR_TGL=""; VIEW="dashboard";');
  w.eval('bukaKonfirmasi("A2")');   // kitchen, sementara kuasanya bar
  await tunggu(60);
  sama('shift divisi lain ditolak', w.eval('HADIR_TGL'), '');
  sama('...dan halamannya tidak berpindah', w.eval('VIEW'), 'dashboard');

  console.log('\n== Tanggal yang belum lewat ==');
  /* Fixture dipasang ulang: berpindah halaman di blok sebelumnya memicu muat
     ulang, dan server tiruan memulangkan state kosong. */
  pasangData(w, HEAD_BAR);
  w.eval('DASH_TGL=' + JSON.stringify(T.besok) + ';');
  k = gambar(w);
  const br2 = barisTabel(k)[0];
  cek('besok: tombol Chat tetap ada — itu justru gunanya sebelum harinya',
      !!br2 && /waAjuan\(/.test(br2.innerHTML), br2 && br2.innerHTML.slice(0, 160));
  /* Shift nanti malam memang belum bisa dikonfirmasi; kolom berisi "Belum
     dikonfirmasi" di seluruh baris minggu depan membuat penandanya berhenti
     berarti. Aturan yang sama dengan hadirTertunggak(). */
  cek('besok: tombol Kehadiran TIDAK digambar',
      !!br2 && !/bukaKonfirmasi\(/.test(br2.innerHTML), br2 && br2.innerHTML.slice(0, 160));
  cek('besok: kolom Kehadiran tidak digambar',
      k.innerHTML.indexOf('<th>Kehadiran</th>') < 0);

  console.log('\n== Tiap halaman di menu benar-benar bisa dibuka ==');
  /* INVARIAN, bukan daftar nama — inilah yang akan menangkap halaman
     BERIKUTNYA yang ditambahkan ke sidebar tanpa judul. `halamanSah()` memakai
     TITLES sebagai daftar halaman yang SAH, jadi kunci yang tidak disebut di
     sana dijatuhkan terapkanHash() kembali ke Dashboard: menunya terbuka
     sekejap lalu memantul, tanpa satu pun galat. Konfirmasi Kehadiran lahir
     begitu dan tidak satu pun uji melihatnya. */
  pasangData(w, HRD);
  const kunciNav = JSON.parse(w.eval('JSON.stringify(NAV_DEF.filter(n=>n.k).map(n=>n.k))'));
  cek('menunya terbaca', kunciNav.length > 5, JSON.stringify(kunciNav));
  for (const kk of kunciNav) {
    cek('halaman "' + kk + '" punya judul — tanpa itu ia memantul ke Dashboard',
        w.eval('!!TITLES[' + JSON.stringify(kk) + ']'), 'TITLES[' + kk + '] kosong');
  }

  /* ================================================================
     KONTRAK SUMBER
     ================================================================ */
  console.log('\n== Kontrak sumber ==');
  const iModal = HTML.indexOf('function bukaAjuan(');
  const badanModal = HTML.slice(iModal, HTML.indexOf('modal(\'Ajuan — \'', iModal));
  cek('bukaAjuan() tidak mendorong aksi Chat', badanModal.indexOf("t:'💬 Chat'") < 0);
  cek('bukaAjuan() tidak mendorong aksi Konfirmasi kehadiran',
      badanModal.indexOf("t:'Konfirmasi kehadiran'") < 0);
  /* Satu penentu untuk "boleh lihat semua divisi", bukan `isHR()` yang
     ditempel di beberapa tempat. */
  sama('lihatSemuaDivisiDW() didefinisikan sekali',
       (HTML.match(/function lihatSemuaDivisiDW\(/g) || []).length, 1);
  cek('...dan memuat KEDUANYA (HRD & admin modul)',
      /function lihatSemuaDivisiDW\(\)\{ return isHR\(\) \|\| isAdmin\(\); \}/.test(HTML));

  dom.window.close();
  console.log('\n' + ok + ' OK, ' + gagal + ' GAGAL');
  process.exit(gagal ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
