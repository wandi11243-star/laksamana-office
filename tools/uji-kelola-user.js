/* Uji panel Kelola User di portal Office (deploy/index.html) — jsdom,
   account-api tiruan.

   DUA HAL YANG DIJAGA DI SINI:

   1. HAPUS PERMANEN HANYA UNTUK AKUN YANG SUDAH NONAKTIF. Tombolnya cuma
      digambar untuk baris nonaktif dan cuma muncul di formulir saat akun yang
      dibuka nonaktif — tapi itu lapis pertama saja; yang menegakkan sungguhan
      `must_deactivate_first` di account-api. Berkas ini menjaga lapis
      layarnya, karena lapis layar yang bocor berarti orang menekan tombol
      yang lalu ditolak server dengan pesan yang datang entah dari mana.

   2. PENJELASANNYA TIDAK IKUT HILANG saat formulirnya dilipat. Seluruh
      paragraf `pick-hint` ditulis untuk orang yang sedang memutuskan centang
      mana yang diberikan; menatanya ulang jadi seksi lipat sangat mudah
      menjatuhkan satu paragraf tanpa ada yang menyadarinya sampai ada yang
      salah memberi akses. Ujinya membandingkan JUMLAH dan ISI paragrafnya,
      bukan sekadar "halamannya tergambar". */
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

const HTML = fs.readFileSync(path.join(ROOT, 'deploy', 'index.html'), 'utf8');

let lulus = 0, gagal = 0;
const cek = (nama, syarat, ket) => {
  if (syarat) { lulus++; console.log('  OK   ' + nama); }
  else { gagal++; console.log('  GAGAL ' + nama + (ket ? '  -> ' + ket : '')); }
};
const tunggu = ms => new Promise(r => setTimeout(r, ms));

const USERS = [
  { id:'u1', name:'Andi Aktif',   pin:'1111', keterangan:'Kasir', noHp:'0811', talentaId:'101',
    username:'andi', active:true,  modules:['kompas'], adminModules:[] },
  { id:'u2', name:'Budi Nonaktif', pin:'2222', keterangan:'Floor', noHp:'0812', talentaId:'102',
    username:'budi', active:false, modules:[], adminModules:[] },
  { id:'u3', name:'Cici Nonaktif', pin:'3333', keterangan:'Bar',   noHp:'0813', talentaId:'103',
    username:'cici', active:false, modules:['stock'], adminModules:[] },
  { id:'u4', name:'Dedi Aktif',   pin:'4444', keterangan:'HRD',   noHp:'0814', talentaId:'104',
    username:'dedi', active:true,  modules:['jadwal'], adminModules:['jadwal'] }
];

/* Permintaan yang dikirim halaman dicatat di sini supaya asersi bisa memeriksa
   APA yang dikirim, bukan cuma bahwa layarnya berubah. */
function domPortal() {
  const kirim = [];
  const dom = new JSDOM(HTML, { runScripts:'dangerously', url:'https://team.laksamanamuda.id/',
                                pretendToBeVisual:true, beforeParse(w) {
    w.localStorage.setItem('lm_session', JSON.stringify({
      userId:'u9', name:'Super', modules:['*'], adminModules:['*'],
      expiry: Date.now() + 3600e3 }));
    w.fetch = (url, opt) => {
      let body = {};
      try { body = JSON.parse((opt && opt.body) || '{}'); } catch (e) {}
      kirim.push(body);
      const aksi = body.action;
      let jawab = { ok:true };
      if (aksi === 'listUsers') jawab = { ok:true, users:USERS.map(u => Object.assign({}, u)),
                                          modules:[{ key:'kompas', label:'Kompas', active:true }],
                                          bawaan:[], terbatas:[], adminBawaan:[] };
      const teks = JSON.stringify(jawab);
      return Promise.resolve({ ok:true, status:200,
        text:() => Promise.resolve(teks), json:() => Promise.resolve(jawab) });
    };
    w.alert = () => {};
    w.confirm = () => true;
  }});
  return { dom, kirim };
}

/* Panel Kelola User dijaga PIN (verifyAdminPin) sebelum terbuka — di sini
   fungsinya dipanggil langsung, karena yang diuji isinya, bukan gerbangnya.
   Daftar usernya disuntikkan ke tempat yang sama dengan yang diisi
   loadAdminUsers(), jadi kode yang jalan tetap kode yang sungguhan. */
function siapkan(w, users) {
  const list = w.document.getElementById('admin-list');
  list._users = (users || USERS).map(u => Object.assign({}, u));
  w.renderAdminList('');
  return list;
}

(async () => {

  /* ================= 1. formulir tidak lagi satu gulungan panjang ========= */
  console.log('\n== Formulir dilipat jadi seksi ==');
  {
    const { dom } = domPortal(); await tunggu(80);
    const d = dom.window.document;
    const sec = Array.from(d.querySelectorAll('#admin-form .af-sec'));
    cek('formulir punya empat seksi', sec.length === 4, String(sec.length));
    const judul = sec.map(s => s.querySelector('summary').textContent.trim());
    cek('seksinya bernama sesuai isinya',
        judul.some(t => t.indexOf('Identitas') === 0) &&
        judul.some(t => t.indexOf('Data kepegawaian') === 0) &&
        judul.some(t => t.indexOf('Modul yang boleh dibuka') === 0) &&
        judul.some(t => t.indexOf('Kelola akses') === 0), judul.join(' | '));
    /* Data kepegawaian TERTUTUP: enam kolom Talenta jarang disentuh, dan
       membuka formulir untuk membetulkan satu nomor HP tidak perlu melewati
       keenamnya. Sisanya terbuka — itu yang dikerjakan tiap kali. */
    const tutup = sec.filter(s => !s.hasAttribute('open'));
    cek('cuma Data kepegawaian yang tertutup', tutup.length === 1 &&
        tutup[0].querySelector('summary').textContent.indexOf('Data kepegawaian') === 0,
        tutup.map(s => s.querySelector('summary').textContent.trim()).join(','));

    /* Kotak isian menggulir sendiri; baris tombol di luar kotak itu, jadi
       Simpan tidak pernah ikut hanyut ke bawah. */
    const scroll = d.querySelector('#admin-form .af-scroll');
    cek('ada kotak gulir tersendiri', !!scroll);
    cek('baris tombol DI LUAR kotak gulir',
        !!scroll && !scroll.contains(d.getElementById('af-save')));
    cek('centang Akun aktif ikut di baris tombol',
        !!d.querySelector('.af-actions #af-active'));
    dom.window.close();
  }

  /* ================= 2. penjelasannya tidak hilang ================= */
  console.log('\n== Penjelasan tetap utuh, cuma dilipat ==');
  {
    const { dom } = domPortal(); await tunggu(80);
    const d = dom.window.document;
    const hint = Array.from(d.querySelectorAll('#admin-form .pick-hint'));
    /* SEPULUH paragraf, sama persis dengan sebelum ditata ulang (dihitung dari
       berkas sebelum perubahan). Angkanya ditulis mati supaya yang menjatuhkan
       satu paragraf saat menyunting formulir ini ketahuan di sini, bukan di
       lapangan — sebuah paragraf yang hilang tidak menimbulkan galat apa pun,
       cuma centang yang diberikan tanpa tahu akibatnya. */
    cek('sepuluh paragraf penjelasan masih ada', hint.length === 10, String(hint.length));
    const semua = hint.map(p => p.textContent).join(' ');
    [['aturan tim boleh lebih dari satu', 'Boleh dicentang lebih dari satu'],
     ['batasan per tim di Stock',          'kru hanya melihat catatan pemakaian'],
     ['keterangan tambahan bukan tim',     'jangan menulis nama tim di situ'],
     ['Talenta ID = Employee ID',          'Employee ID'],
     ['nama panggilan untuk login',        'nama login pendek'],
     ['ejaan Talenta harus sama persis',   'sama persis dengan yang dikenali Talenta'],
     ['Daily Worker tidak ikut Semua (*)', 'modul ini sengaja tidak']
    ].forEach(([nama, potongan]) =>
      cek('penjelasan ' + nama + ' masih ada', semua.indexOf(potongan) > -1));
    /* Semua penjelasan panjang berada di balik <details>, jadi tidak satu pun
       memakan ruang sebelum diminta. */
    const diLuar = hint.filter(p => !p.closest('.af-help'));
    cek('semuanya di balik pelipat penjelasan', diLuar.length === 0,
        diLuar.map(p => p.textContent.slice(0, 40)).join(' | '));
    dom.window.close();
  }

  /* ================= 3. tapis aktif / nonaktif ================= */
  console.log('\n== Tapis Aktif / Nonaktif ==');
  {
    const { dom } = domPortal(); await tunggu(80);
    const w = dom.window, d = w.document;
    siapkan(w);
    /* Bawaannya AKTIF: yang dicari sehari-hari cuma orang yang masih bekerja. */
    cek('bawaannya menampilkan yang aktif saja',
        d.querySelectorAll('#admin-list .u-row').length === 2,
        String(d.querySelectorAll('#admin-list .u-row').length));
    const jml = k => d.querySelector(`#admin-filter [data-jml="${k}"]`).textContent.trim();
    cek('jumlah di tiap tombol tapis benar',
        jml('semua') === '4' && jml('aktif') === '2' && jml('nonaktif') === '2',
        [jml('semua'), jml('aktif'), jml('nonaktif')].join('/'));

    d.querySelector('#admin-filter [data-tapis="nonaktif"]').click();
    const baris = Array.from(d.querySelectorAll('#admin-list .u-row'));
    cek('tapis Nonaktif menampilkan dua', baris.length === 2, String(baris.length));
    cek('semuanya baris pudar', baris.every(r => r.classList.contains('inactive')));
    d.querySelector('#admin-filter [data-tapis="semua"]').click();
    cek('tapis Semua menampilkan empat',
        d.querySelectorAll('#admin-list .u-row').length === 4);

    /* Kosong karena TAPIS, bukan karena datanya hilang — kalimatnya harus
       menyebut itu. Inilah salah paham yang sudah tercatat di modul Jadwal:
       orang mencari nama yang ADA tapi orangnya nonaktif, lalu menyimpulkan
       akunnya sudah terhapus. */
    d.querySelector('#admin-filter [data-tapis="aktif"]').click();
    w.renderAdminList('Budi');
    const kosong = d.querySelector('#admin-list .empty');
    cek('kosong karena tapis dijelaskan', !!kosong && kosong.textContent.indexOf('aktif') > -1,
        kosong ? kosong.textContent : '(tidak ada)');
    cek('dan menunjuk tapis Semua', !!kosong && kosong.innerHTML.indexOf('Semua') > -1);
    dom.window.close();
  }

  /* ================= 4. hapus permanen: hanya yang nonaktif ============== */
  console.log('\n== Hapus permanen hanya untuk akun nonaktif ==');
  {
    const { dom } = domPortal(); await tunggu(80);
    const w = dom.window, d = w.document;
    siapkan(w);
    d.querySelector('#admin-filter [data-tapis="semua"]').click();
    const baris = id => Array.from(d.querySelectorAll('#admin-list .u-row'))
      .find(r => r.querySelector(`[data-id="${id}"]`));
    cek('baris aktif TIDAK punya tombol hapus', !baris('u1').querySelector('.u-del'));
    cek('baris nonaktif punya tombol hapus', !!baris('u2').querySelector('.u-del'));
    cek('tombolnya menyebut hapus permanen',
        baris('u2').querySelector('.u-del').getAttribute('title') === 'Hapus permanen');

    /* Formulir: tombol Hapus cuma muncul untuk akun nonaktif, dan yang aktif
       diberi keterangan KENAPA — tombol yang hilang tanpa penjelasan terbaca
       sebagai halaman rusak. */
    w.fillAdminForm(USERS[0]);
    cek('form akun aktif: tombol hapus disembunyikan',
        d.getElementById('af-delete').classList.contains('hidden'));
    cek('form akun aktif: dijelaskan kenapa',
        !d.getElementById('af-delnote').classList.contains('hidden'));
    w.fillAdminForm(USERS[1]);
    cek('form akun nonaktif: tombol hapus muncul',
        !d.getElementById('af-delete').classList.contains('hidden'));
    cek('form akun nonaktif: keterangannya hilang',
        d.getElementById('af-delnote').classList.contains('hidden'));
    cek('tombolnya menunjuk user yang benar',
        d.getElementById('af-delete').dataset.id === 'u2');

    /* resetAdminForm dipanggil sesudah simpan/hapus. Keterangan yang tertinggal
       di formulir kosong akan menyuruh menonaktifkan akun yang belum ada. */
    w.resetAdminForm();
    cek('form kosong: keduanya disembunyikan',
        d.getElementById('af-delete').classList.contains('hidden') &&
        d.getElementById('af-delnote').classList.contains('hidden'));
    dom.window.close();
  }

  /* ================= 5. yang benar-benar dikirim ke server =============== */
  console.log('\n== Permintaan yang dikirim ==');
  {
    const { dom, kirim } = domPortal(); await tunggu(80);
    const w = dom.window, d = w.document;
    w.eval("adminCreds = { name:'Super', pin:'1111' }");
    siapkan(w);
    d.querySelector('#admin-filter [data-tapis="nonaktif"]').click();
    const tombol = Array.from(d.querySelectorAll('#admin-list .u-del'))
      .find(b => b.dataset.id === 'u3');
    cek('tombol hapus baris Cici ada', !!tombol);
    if (tombol) {
      tombol.click();
      await tunggu(30);
      d.getElementById('ask-ok').click();     // konfirmasi
      await tunggu(60);
      const del = kirim.filter(b => b.action === 'deleteUser');
      cek('deleteUser terkirim sekali', del.length === 1, String(del.length));
      cek('id yang dikirim benar', del[0] && del[0].id === 'u3', del[0] && del[0].id);
    }

    /* Daftar bisa basi kalau orang lain mengaktifkan akun itu di sela-sela.
       Baris nonaktif yang ternyata sudah aktif TIDAK boleh lolos ke server. */
    const list = d.getElementById('admin-list');
    list._users = [Object.assign({}, USERS[1], { active:true })];
    w.eval("ADMIN_TAPIS = 'semua'");
    w.renderAdminList('');
    const sebelum = kirim.filter(b => b.action === 'deleteUser').length;
    /* Barisnya digambar tanpa tombol karena sudah aktif — itu sendiri sudah
       menutupnya, dan tidak ada permintaan hapus yang bisa lahir dari sini. */
    cek('baris yang sudah diaktifkan tidak punya tombol hapus',
        !d.querySelector('#admin-list .u-del'));
    cek('tidak ada deleteUser tambahan',
        kirim.filter(b => b.action === 'deleteUser').length === sebelum);
    dom.window.close();
  }

  /* ================= 6. pagar server ikut disebut ================= */
  console.log('\n== Pagar server ==');
  {
    const PHP = fs.readFileSync(path.join(ROOT, 'account-mysql', 'lib_account_mysql.php'), 'utf8');
    const fn = PHP.slice(PHP.indexOf('function aksi_hapus_user'),
                         PHP.indexOf('function butuh_pengelola_roster'));
    /* Pagar layar bisa dilewati satu panggilan dari console. Yang menegakkan
       sungguhan ada di sini, dan uji ini yang menjaganya tetap ada. */
    cek('aksi_hapus_user menolak akun yang masih aktif',
        fn.indexOf('must_deactivate_first') > -1);
    cek('grants & admins ikut dibuang',
        fn.indexOf('DELETE FROM `grants`') > -1 && fn.indexOf('DELETE FROM `admins`') > -1);
    cek('pesannya dikenali layar', HTML.indexOf('must_deactivate_first:') > -1);
  }

  console.log('\n---------------------------------------');
  console.log('LULUS ' + lulus + '   GAGAL ' + gagal);
  process.exit(gagal ? 1 : 0);
})();
