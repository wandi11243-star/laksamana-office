/* uji-vip-yatim.js — Reservasi VIP yang ada di modul Reservasi tapi hilang di Marketing
 *
 *   node tools/uji-vip-yatim.js
 *   JSDOM_PATH=/jalur/ke/jsdom node tools/uji-vip-yatim.js
 *
 * SEBABNYA NYATA, dan diukur atas data PRODUKSI 17 September 2026: dari 17
 * booking bertanda VIP di modul Reservasi, SEPULUH tidak punya barisnya lagi
 * di `S.vip` modul Marketing. Semuanya lahir dari Marketing (id berawalan
 * `vip-`), dan tidak satu pun punya jejak "Reservasi VIP dihapus" di
 * activities — jadi bukan ada yang menekan Hapus.
 *
 * Akibatnya menyentuh UANG: yang hilang di `S.vip` hilang juga di Radar, di
 * Performa Omset & Bonus, dan di Breakdown Sumber milik Finance — sementara
 * Kalender di modul yang sama TETAP menggambarnya, karena ia membaca modul
 * Reservasi langsung. Dua layar bersebelahan menyebut jumlah yang berbeda.
 *
 * YANG DIJAGA DI SINI BUKAN DAFTAR NAMA, melainkan aturannya:
 *   - hanya booking yang LAHIR DARI MARKETING (id `vip-`) yang dilaporkan;
 *   - yang sudah punya pasangannya TIDAK dilaporkan;
 *   - pemulihan TIDAK PERNAH mengarang nominal & Pengakuan Omset;
 *   - DP ikut dipulihkan BERIKUT `vipBuktiId` aslinya — tanpa itu
 *     vipGabungDps() akan MENGHAPUS DP-nya dari modul Reservasi;
 *   - yang di sana sudah batal dipulihkan SEBAGAI batal, bukan hidup lagi;
 *   - Reservasi yang tidak terbaca DIKATAKAN, bukan didiamkan sebagai
 *     "tidak ada yang hilang".
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

let ok = 0, gagal = 0;
const cek = (n, s, k) => { if (s) { ok++; console.log('  OK   ' + n); } else { gagal++; console.log('  GAGAL ' + n + (k ? '  — ' + k : '')); } };
const sama = (n, d, h) => cek(n, d === h, 'dapat ' + JSON.stringify(d) + ', harusnya ' + JSON.stringify(h));
/* Blok yang bisa melempar dibungkus: satu asersi yang jatuh akan membunuh
   seluruh berkas dan mutasinya terbaca "uji tidak selesai" — bukan
   "tertangkap". Sudah menggigit empat kali di repo ini. */
const aman = (n, fn) => { try { fn(); } catch (e) { gagal++; console.log('  GAGAL ' + n + '  — melempar: ' + e.message); } };

/* ---------------- data uji ----------------
   Tiap baris dirancang supaya tiap kesalahan memberi hasil yang BERBEDA:
     V_ADA     punya pasangan di S.vip   -> TIDAK boleh dilaporkan
     V_HILANG  Assisted + DP + rundown   -> yatim, dan yang diuji paling dalam
     V_BATAL   Cancelled                 -> yatim, harus pulih SEBAGAI batal
     V_REG     Regular                   -> yatim, jenisnya jangan jadi Assisted
     r_manual  vip:true tanpa awalan      -> dibuat langsung di modul Reservasi
     r_biasa   bukan VIP                  -> tidak ada urusannya di sini
   Nominalnya sengaja beda-beda supaya angka yang tertukar langsung kelihatan. */
const CATATAN_HILANG = [
  'RESERVASI RUANG VIP (Assisted)',
  'Perusahaan: Istana Bayi',
  'Request layout: VIP ROOM',
  'TV: Ya · Speaker & Mic: Tidak',
  'TENTATIVE RUNDOWN',
  '11.00 - 11.10\tOpening',
  'TV: dipakai untuk video opening',     // sengaja: baris bebas yang MENYERUPAI field
  'Dari modul Marketing — PIC Devani Azahra',
].join('\n');

const RES = [
  { id: 'vip-V_ADA', name: 'Sudah Tercatat', phone: '0811', date: '2026-09-20', time: '19:00',
    pax: 10, table: 'R1, R2', vip: true, status: 'Confirmed', picName: 'Devani Azahra', dps: [],
    createdAt: 1789000000000, updatedAt: 1789000000000,
    notes: 'RESERVASI RUANG VIP (Assisted)\nTV: Tidak · Speaker & Mic: Tidak\nDari modul Marketing — PIC Devani Azahra' },

  { id: 'vip-V_HILANG', name: 'Nana Istana Bayi Panam', phone: '628117600418',
    date: '2026-09-18', time: '21:00', pax: 81, table: '24, 23, R1, U1', vip: true,
    status: 'Confirmed', picName: 'Devani Azahra', createdBy: 'Devani Azahra',
    createdAt: 1789457402824, updatedAt: 1789551496492, notes: CATATAN_HILANG,
    dps: [
      { id: 'vip-V_HILANG-dp_abc', vipBuktiId: 'dp_abc', amount: 500000, method: 'Transfer UOB',
        proofData: '@f:p:vip-V_HILANG:dp_abc', proofName: 'bukti.jpg', by: 'Aurel Erbakan', at: 1789457500000 },
      /* Cicilan yang dicatat kru Reservasi sendiri: TANPA vipBuktiId, jadi ia
         bukan milik Marketing dan tidak boleh ikut tersalin ke sini. */
      { id: 'lokal-1', amount: 250000, method: 'Cash', proofData: '', proofName: '', by: 'Kru Reservasi', at: 1789460000000 },
    ] },

  { id: 'vip-V_BATAL', name: 'Angela', phone: '0823', date: '2026-09-12', time: '11:00',
    pax: 45, table: 'R3, R5', vip: true, status: 'Cancelled', picName: 'Devani Azahra',
    cancelReason: 'tamu membatalkan', createdAt: 1789033124913, updatedAt: 1789209140628, dps: [],
    notes: 'RESERVASI RUANG VIP (Assisted)\nPerusahaan: Indo6Dance\nTV: Ya · Speaker & Mic: Ya\nDari modul Marketing — PIC Devani Azahra' },

  { id: 'vip-V_REG', name: 'Mas Danny', phone: '0812', date: '2026-08-24', time: '18:00',
    pax: 8, table: 'U3', vip: true, status: 'Confirmed', picName: 'Aurel Erbakan',
    createdAt: 1787000000000, updatedAt: 1787000000000, dps: [],
    notes: 'RESERVASI RUANG VIP (Regular)\nTV: Tidak · Speaker & Mic: Tidak\nDari modul Marketing — PIC Aurel Erbakan' },

  /* DIBATALKAN TAPI SUDAH SEMPAT DATANG. Dibuka kembali, statusnya wajib
     pulih jad 'Datang' — bukan 'Confirmed', yang membuat tamu yang sudah
     tercatat hadir berubah jadi "belum datang" di rekap modul Reservasi. */
  { id: 'vip-V_HADIR', name: 'Sudah Sempat Datang', phone: '0899', date: '2026-09-14', time: '19:00',
    pax: 4, table: '21', vip: true, status: 'Cancelled', picName: 'Devani Azahra',
    checkinAt: 1789300000000, arrivals: [{ ts: 1789300000000, pax: 4, by: 'Kru' }],
    createdAt: 1789200000000, updatedAt: 1789310000000, dps: [],
    notes: 'RESERVASI RUANG VIP (Assisted)\nTV: Tidak · Speaker & Mic: Tidak\nDari modul Marketing — PIC Devani Azahra' },

  /* PESAING MEJA. Hidup, di tanggal & jam yang sama dengan Angela, dan memakai
     salah satu mejanya (R3). Begitu Angela dibatalkan mejanya BEBAS, jadi
     bentuk ini memang terjadi — dan membuka Angela kembali tanpa memeriksa
     berarti dua tamu memegang R3 pada jam yang sama. */
  { id: 'r_bentrok', name: 'Tamu Lain', date: '2026-09-12', time: '11:00', pax: 6,
    table: 'R3', vip: false, status: 'Confirmed', picName: '', createdAt: 1789210000000,
    updatedAt: 1789210000000, dps: [], notes: '' },

  { id: 'r_manual', name: 'VIP Diketik di Reservasi', date: '2026-09-19', time: '20:00',
    pax: 6, table: 'VIP 1', vip: true, status: 'Confirmed', picName: 'Kru Reservasi',
    createdAt: 1789400000000, updatedAt: 1789400000000, dps: [], notes: 'ditulis langsung di modul Reservasi' },

  { id: 'r_biasa', name: 'Tamu Biasa', date: '2026-09-18', time: '18:00', pax: 4,
    table: '11', vip: false, status: 'Confirmed', picName: '', createdAt: 1789400000000,
    updatedAt: 1789400000000, dps: [], notes: '' },
];

const USERS = [
  { id: 'u-devani', name: 'Devani Azahra', div: 'Marketing', role: 'marketing' },
  { id: 'u-aurel',  name: 'Aurel Erbakan', div: 'Marketing', role: 'marketing' },
];

/* opsi: { rsvGagal, akuMarketing } */
function buka(opsi) {
  opsi = opsi || {};
  const html = fs.readFileSync(path.join(ROOT, 'deploy/marketing/index.html'), 'utf8')
    .replace(/<script[^>]*\ssrc="[^"]*performa-bonus\.js"[^>]*><\/script>/i,
      '<script>' + fs.readFileSync(path.join(ROOT, 'deploy/assets/performa-bonus.js'), 'utf8') + '</script>')
    .replace(/<script[^>]*\ssrc="[^"]*venue-layouts\.js"[^>]*><\/script>/i,
      '<script>' + fs.readFileSync(path.join(ROOT, 'deploy/assets/venue-layouts.js'), 'utf8') + '</script>')
    .replace(/<script[^>]*\ssrc=[^>]*><\/script>/gi, '');
  const vc = new VirtualConsole();
  vc.on('jsdomError', e => {
    const t = String((e && e.detail && e.detail.stack) || (e && e.message) || e);
    if (!/Not implemented|Could not parse CSS/.test(t)) console.log('  !! ' + t.split('\n')[0]);
  });
  const jejak = { simpan: 0, payload: null, rsv: 0, rsvTulis: 0, rsvPayload: null };
  const dom = new JSDOM(html, { virtualConsole: vc, runScripts: 'dangerously',
    url: 'https://dev.laksamanamuda.id/marketing/',
    beforeParse(w) {
      w.localStorage.setItem('lm_session', JSON.stringify({
        id: 'u-devani', name: 'Devani Azahra', modules: ['marketing'], adminModules: ['marketing'],
        token: 't', expiry: Date.now() + 86400000 }));
      w.fetch = () => new Promise(() => {});    // boot tidak boleh menembak jaringan
      w.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
      w.print = () => {}; w.confirm = () => true;
      w.Chart = class { destroy() {} update() {} };
      w.HTMLCanvasElement.prototype.getContext = () => ({});
    } });
  const w = dom.window;
  const balas = o => { const t = JSON.stringify(o); return Promise.resolve({ ok: true, status: 200,
    json: () => Promise.resolve(JSON.parse(t)), text: () => Promise.resolve(t) }); };
  w.fetch = (url, opts) => {
    const u = String(url || '');
    if (u.indexOf('reservasi-api-mysql') > -1) {
      /* Tulisan balik ke modul Reservasi DICATAT, bukan ditelan: yang
         membedakan "ditolak" dari "diterima diam-diam" adalah ADA-TIDAKNYA
         kiriman ini, bukan pesan di layar. */
      let b = {}; try { b = JSON.parse((opts && opts.body) || '{}'); } catch (e) {}
      if (b.action === 'saveAll') { jejak.rsvTulis++; jejak.rsvPayload = b.data; return balas({ ok: true, data: {} }); }
      jejak.rsv++;
      if (opsi.rsvGagal) return Promise.reject(new Error('Modul Reservasi tidak menjawab.'));
      return balas({ ok: true, data: { reservations: (opsi.res || RES), master: {}, _ver: 1 } });
    }
    let b = {}; try { b = JSON.parse((opts && opts.body) || '{}'); } catch (e) {}
    if (b.action === 'saveAll') { jejak.simpan++; jejak.payload = b.data; }
    return balas({ ok: true, data: { saved: true, bentrok: [], versi: {} } });
  };
  /* S & ME `let` di lingkup leksikal global — bukan properti window. */
  w.eval('S = normalizeState(seed());');
  w.eval(`
    S.users = ${JSON.stringify(USERS)};
    ME = S.users[0];
    ME.role = ${JSON.stringify(opsi.akuMarketing ? 'marketing' : 'super_admin')};
    S.vip = [{ id:'V_ADA', jenis:'Assisted', nama:'Sudah Tercatat', tanggal:'2026-09-20',
               jamMulai:'19:00', paxMin:10, meja:['R1','R2'], mktPIC:'u-devani',
               nominal:1234567, resId:'vip-V_ADA' }];
  `);
  return { w, jejak };
}
const tunggu = ms => new Promise(r => setTimeout(r, ms));
const strip = w => (w.document.getElementById('vip-yatim') || { innerHTML: '' }).innerHTML;
const vipS = w => JSON.parse(w.eval('JSON.stringify(S.vip)'));
const toastTeks = w => { const n = w.document.querySelectorAll('#toasts .toast'); return n.length ? n[n.length-1].textContent : ''; };

(async () => {

/* ================= 1. deteksi ================= */
console.log('-- daftar yang hilang --');
let { w, jejak } = buka();
w.eval("go('vip')");
sama('strip kosong sebelum Reservasi menjawab', strip(w).trim(), '');
await tunggu(200);
const h1 = strip(w);
cek('Reservasi dibaca sekali', jejak.rsv === 1, 'rsv=' + jejak.rsv);
/* YANG DIBATALKAN TIDAK IKUT DITAGIH (permintaan user 17 September 2026).
   Keluhannya konkret: pitanya menagih "Liya · Cancelled" padahal Liya sudah
   berdiri di daftar — tamunya membatalkan lalu memesan lagi, dan yang hidup
   memang cuma yang kedua. Memulihkan yang batal tidak membawa omzet apa pun. */
cek('melaporkan 2 yang hilang DAN MASIH HIDUP', /2 Reservasi VIP ada di modul Reservasi/.test(h1), h1.slice(0, 200));
cek('menyebut Nana', /Nana Istana Bayi Panam/.test(h1));
cek('TIDAK menagih Angela yang sudah dibatalkan', !/Angela/.test(h1), 'Angela muncul di pita utama');
cek('TIDAK menagih yang batal walau pernah datang', !/Sudah Sempat Datang/.test(h1));
cek('menyebut Mas Danny (Regular)', /Mas Danny/.test(h1));
/* TIDAK DIBUANG, cuma dilipat: jumlahnya tetap disebut, dan daftarnya ada di
   balik satu klik. Dibuang diam-diam, halaman ini berhenti bisa menjawab
   "berapa yang hilang seluruhnya". */
cek('yang dibatalkan tetap dihitung dan bisa dibuka', /Tampilkan 2 yang sudah dibatalkan/.test(h1), h1.slice(-600));
cek('...dan sebabnya dikatakan', /omzetnya nol dan mejanya sudah bebas/.test(h1));
cek('TIDAK menyebut yang sudah tercatat', !/Sudah Tercatat/.test(h1));
/* Booking yang diketik langsung di modul Reservasi BUKAN milik Marketing:
   melaporkannya berarti menyuruh orang "memulihkan" baris yang memang tidak
   pernah ada di sini, dan hasilnya baris VIP hantu berikut omzetnya. */
cek('TIDAK menyebut VIP yang diketik di modul Reservasi', !/VIP Diketik di Reservasi/.test(h1));
cek('TIDAK menyebut reservasi biasa', !/Tamu Biasa/.test(h1));
cek('menyebut akibatnya di Radar & Finance', /Radar/.test(h1) && /Breakdown Sumber/.test(h1));
cek('mengatakan nominal tetap kosong', /nominal omzet &amp; Pengakuan Omset tetap kosong/i.test(h1), h1.slice(0, 400));

aman('saklar yang dibatalkan', () => {
  w.eval('vipYatimBatalToggle()');
  const buka = strip(w);
  cek('dibuka: Angela muncul', /Angela/.test(buka), buka.slice(-800));
  cek('...berikut tombol Pulihkannya', /vipPulihkan\('vip-V_BATAL'\)/.test(buka));
  cek('...dan saklarnya berubah jadi Sembunyikan', /Sembunyikan 2 yang sudah dibatalkan/.test(buka));
  const kotak = w.document.getElementById('vip-cari');
  w.eval('vipYatimBatalToggle()');
  cek('ditutup lagi: Angela hilang lagi', !/Angela/.test(strip(w)));
  cek('kotak cari TIDAK dibuat ulang oleh saklarnya',
      !!kotak && w.document.getElementById('vip-cari') === kotak, 'elemennya berganti');
});
/* Tombol "Pulihkan semuanya" hanya menyentuh yang hidup — kalau ia ikut
   menyapu yang dibatalkan, saklar di atasnya jadi hiasan. */
cek('tombol "Pulihkan semuanya" menyebut 2, bukan 4', /Pulihkan semuanya \(2\)/.test(h1), 'angkanya salah');

/* ================= 2. pengurai catatan ================= */
console.log('-- membaca kembali catatan modul Reservasi --');
aman('urai catatan', () => {
  const c = JSON.parse(w.eval('JSON.stringify(vipUraiCatatan(' + JSON.stringify(CATATAN_HILANG) + '))'));
  sama('jenis', c.jenis, 'Assisted');
  sama('perusahaan', c.perusahaan, 'Istana Bayi');
  sama('request layout', c.layoutReq, 'VIP ROOM');
  sama('TV', c.tv, true);
  sama('speaker', c.speaker, false);
  sama('PIC', c.pic, 'Devani Azahra');
  /* Catatan bebasnya UTUH, termasuk baris yang MENYERUPAI field. Pencocokan
     per baris akan menelan baris "TV: dipakai untuk video opening" sebagai
     setelan TV dan membuangnya dari catatan — dan yang membacanya tidak punya
     satu pun cara tahu kalimat itu pernah ada. */
  cek('catatan bebas utuh (3 baris)', c.catatan.split('\n').length === 3, JSON.stringify(c.catatan));
  cek('baris yang menyerupai field tidak ditelan', /TV: dipakai untuk video opening/.test(c.catatan));
  cek('baris PIC tidak ikut jadi catatan', !/Dari modul Marketing/.test(c.catatan));
});

/* ================= 3. pemulihan satu baris ================= */
console.log('-- pulihkan Nana --');
w.eval("vipPulihkan('vip-V_HILANG')");
let v = vipS(w).find(x => x.id === 'V_HILANG');
cek('barisnya lahir di S.vip', !!v);
aman('isi baris pulihan', () => {
  sama('nama', v.nama, 'Nana Istana Bayi Panam');
  sama('tanggal', v.tanggal, '2026-09-18');
  sama('jam mulai', v.jamMulai, '21:00');
  sama('jenis', v.jenis, 'Assisted');
  sama('perusahaan', v.perusahaan, 'Istana Bayi');
  sama('hp', v.hp, '628117600418');
  sama('pax', v.paxMin, 81);
  cek('meja jadi daftar', Array.isArray(v.meja) && v.meja.join('|') === '24|23|R1|U1', JSON.stringify(v.meja));
  sama('resId menunjuk barisnya di Reservasi', v.resId, 'vip-V_HILANG');
  sama('PIC dicocokkan ke user', v.mktPIC, 'u-devani');
  /* DUA angka yang TIDAK BOLEH dikarang. Ditebak, yang pertama mengarang omzet
     orang dan yang kedua mengarang keputusan pengakuan omset — dua-duanya
     tanpa satu pun galat, dengan angka yang kelihatan wajar. */
  sama('nominal TIDAK ditebak', v.nominal, '');
  sama('Pengakuan Omset TIDAK ditebak', v.menuFix, '');
  cek('belum dibatalkan', !v.batalAt, String(v.batalAt));
});
aman('DP ikut pulih', () => {
  const b = v.bukti || [];
  sama('hanya DP milik Marketing yang ikut', b.length, 1);
  /* vipBuktiId ASLINYA wajib dipertahankan: vipGabungDps() mencocokkan lewat
     itu, dan yang tidak ketemu pasangannya DIBUANG dari baris Reservasi —
     yaitu DP yang uangnya benar-benar masuk, hilang tanpa satu pun galat. */
  sama('vipBuktiId aslinya dipertahankan', b[0] && b[0].id, 'dp_abc');
  sama('nominal DP', b[0] && b[0].nominal, 500000);
  sama('metode DP', b[0] && b[0].metode, 'Transfer UOB');
  sama('key kosong (berkasnya di server Reservasi)', b[0] && b[0].key, '');
  cek('total DP terbaca', w.eval('vipDpTotal(S.vip.find(x=>x.id==="V_HILANG"))') === 500000);
});
const h2 = strip(w);
cek('sesudah dipulihkan tinggal 1 yang hilang', /1 Reservasi VIP ada di modul Reservasi/.test(h2), h2.slice(0, 160));
cek('Nana tidak lagi disebut hilang', !/Nana Istana Bayi Panam/.test(h2));
cek('pita "belum ada nominalnya" ikut menagih', /belum ada nominalnya/.test(w.document.getElementById('view').innerHTML));

/* Memulihkan baris yang SAMA dua kali tidak boleh melahirkan baris kedua:
   satu booking dengan dua baris berarti omzetnya terhitung dua kali. */
w.eval("vipPulihkan('vip-V_HILANG')");
sama('pulihkan dua kali tidak menggandakan', vipS(w).filter(x => x.id === 'V_HILANG').length, 1);

await tunggu(1500);
cek('kirimannya benar-benar berangkat ke server', jejak.simpan > 0, 'simpan=' + jejak.simpan);
aman('payload memuat barisnya', () => {
  const p = (jejak.payload && jejak.payload.vip) || [];
  cek('vip di payload memuat V_HILANG', p.some(x => x && x.id === 'V_HILANG'), JSON.stringify(p.map(x => x && x.id)));
});

/* ================= 4. yang sudah batal ================= */
console.log('-- yang di Reservasi sudah batal --');
w.eval("vipPulihkan('vip-V_BATAL')");
const vb = vipS(w).find(x => x.id === 'V_BATAL');
aman('baris batal', () => {
  cek('dipulihkan SEBAGAI batal', !!(vb && vb.batalAt), JSON.stringify(vb && vb.batalAt));
  cek('sebab batalnya ikut', /tamu membatalkan/.test(String(vb && vb.batalOleh)), String(vb && vb.batalOleh));
  /* Kartu "Total Reservasi" menghitung yang HIDUP. Kalau yang batal pulih
     sebagai aktif, omzetnya ikut terhitung untuk acara yang tidak pernah
     terjadi — kebalikan persis dari yang sedang dibereskan. */
  sama('TV terbaca dari catatannya', vb && vb.tv, true);
  sama('speaker terbaca dari catatannya', vb && vb.speaker, true);
});

/* ================= 5. Regular tidak jadi Assisted ================= */
console.log('-- Regular --');
w.eval("vipPulihkan('vip-V_REG')");
const vr = vipS(w).find(x => x.id === 'V_REG');
sama('jenisnya Regular', vr && vr.jenis, 'Regular');
sama('PIC-nya Aurel', vr && vr.mktPIC, 'u-aurel');
sama('Regular tidak pernah punya nominal', w.eval('vipNominal(S.vip.find(x=>x.id==="V_REG"))'), 0);
/* Yang tersisa cuma yang dibatalkan: pitanya turun jadi keterangan biasa,
   BUKAN blok merah. Blok merah untuk sesuatu yang tidak menuntut tindakan apa
   pun persis yang membuat peringatan berhenti dibaca. */
{
  const sisa = strip(w);
  cek('tidak ada lagi blok merah', sisa.indexOf('var(--danger)') < 0, sisa.slice(0, 200));
  cek('...tapi yang dibatalkan tetap disebut', /sudah dibatalkan<\/b> ada di modul Reservasi/.test(sisa), sisa.slice(0, 300));
  cek('...dan dikatakan tidak ada omzet yang hilang', /Tidak ada omzet yang hilang/.test(sisa));
}

/* ================= 6. Reservasi tidak terbaca ================= */
console.log('-- modul Reservasi tidak menjawab --');
const b2 = buka({ rsvGagal: true });
b2.w.eval("go('vip')");
await tunggu(200);
const h3 = strip(b2.w);
/* Diam di sini terbaca sebagai "semuanya aman" — kesimpulan tentang daftar
   yang belum pernah dibaca satu baris pun. */
cek('ketidakmampuannya DIKATAKAN', /tidak bisa memastikan/i.test(h3), h3.slice(0, 200));
cek('ada jalan mencoba lagi', /muatReservasi\(true\)/.test(h3));
cek('tidak mengaku "tidak ada yang hilang"', !/ada di modul Reservasi tapi tidak ada/.test(h3));

/* ================= 7. yang berperan marketing ================= */
console.log('-- penyaring "cuma milik sendiri" --');
const b3 = buka({ akuMarketing: true });
b3.w.eval("go('vip')");
await tunggu(200);
const h4 = strip(b3.w);
/* Aturan yang SAMA dengan daftar di bawahnya. Kalau pita ini melewatinya,
   yang berperan marketing melihat booking rekannya di layar yang justru
   dipotong supaya ia tidak melihatnya. */
cek('melaporkan 1 miliknya sendiri yang masih hidup', /1 Reservasi VIP ada di modul Reservasi/.test(h4), h4.slice(0, 160));
cek('menyebut miliknya (Nana)', /Nana Istana Bayi Panam/.test(h4));
cek('TIDAK menyebut milik Aurel (Mas Danny)', !/Mas Danny/.test(h4));

/* ================= 7b. "Pulihkan semuanya" hanya yang masih hidup ========= */
console.log('-- pulihkan semuanya --');
{
  const b5 = buka();
  b5.w.eval("go('vip')");
  await tunggu(200);
  b5.w.eval('vipPulihkanSemua()');
  await tunggu(30);
  const btn = b5.w.document.getElementById('vip_konfirm_btn');
  cek('konfirmasi muncul', !!btn);
  if (btn) btn.onclick();
  await tunggu(200);
  const id = vipS(b5.w).map(x => x.id).sort();
  cek('yang masih hidup dipulihkan', id.indexOf('V_HILANG') > -1 && id.indexOf('V_REG') > -1, JSON.stringify(id));
  /* Yang dibatalkan TIDAK ikut tersapu: kalau ikut, saklar "tampilkan yang
     sudah dibatalkan" jadi hiasan — yang sengaja dilipat tetap masuk lewat
     satu tombol yang tidak menyebutkannya. */
  cek('yang dibatalkan TIDAK ikut tersapu',
      id.indexOf('V_BATAL') < 0 && id.indexOf('V_HADIR') < 0, JSON.stringify(id));
  cek('...dan tetap dilaporkan sebagai yang dibatalkan',
      /2 Reservasi VIP yang <b>sudah dibatalkan<\/b>/.test(strip(b5.w)), strip(b5.w).slice(0, 220));
}

/* ================= 8. buka kembali yang dibatalkan =================
   Permintaan user 17 September 2026: "jika reservasi yang sudah di batalkan
   bisa ada tombol di buka kembali".

   YANG DIJAGA DI SINI BUKAN TOMBOLNYA, melainkan mejanya. Begitu dibatalkan,
   meja sebuah reservasi BEBAS — tamu lain boleh sudah memesannya. Dibuka tanpa
   memeriksa, dua tamu memegang meja yang sama pada jam yang sama, dan tidak
   ada satu pun layar yang mengatakannya. */
console.log('-- buka kembali --');
/* Tombolnya hanya untuk yang memang dibatalkan. */
aman('tombol di daftar', () => {
  /* Sejak 26 Sep 2026 daftar bawaannya Regular & Assisted TANPA yang
     dibatalkan — jadi yang dibatalkan dibuka lewat tab "Dibatalkan". */
  cek('bawaan: baris dibatalkan TIDAK ada di daftar',
      !/vipBukaLagi\('V_BATAL'\)/.test((w.document.getElementById('view') || { innerHTML: '' }).innerHTML));
  w.eval("vipSaring('jenis','batal')");
  const v = (w.document.getElementById('view') || { innerHTML: '' }).innerHTML;
  cek('baris yang dibatalkan menawarkan Buka kembali', /vipBukaLagi\('V_BATAL'\)/.test(v), 'tombolnya tidak ada');
  cek('baris yang AKTIF tidak menawarkannya', !/vipBukaLagi\('V_HILANG'\)/.test(v), 'muncul di baris yang aktif');
  cek('baris yang dibatalkan tidak menawarkan Batalkan lagi', !/vipBatal\('V_BATAL'\)/.test(v));
});

/* ---- A. MEJANYA SUDAH DIPESAN ORANG LAIN -> DITOLAK ----
   Angela memakai R3 & R5 pada 12 Sep 11:00, dan "Tamu Lain" sudah memegang R3
   pada jam yang sama. Yang dijaga: TIDAK ADA tulisan yang berangkat ke modul
   Reservasi — bukan sekadar ada pesan di layar. */
{
  const sebelum = jejak.rsvTulis;
  w.eval("vipBukaLagi('V_BATAL')");
  await tunggu(30);
  const btn = w.document.getElementById('vip_konfirm_btn');
  cek('konfirmasi muncul', !!btn);
  if (btn) btn.onclick();
  await tunggu(400);
  sama('tidak ada tulisan yang berangkat ke Reservasi', jejak.rsvTulis, sebelum);
  const v = vipS(w).find(x => x.id === 'V_BATAL');
  cek('tetap berstatus batal', !!(v && v.batalAt), JSON.stringify(v && v.batalAt));
  cek('meja yang bentrok disebutkan namanya', /R3/.test(toastTeks(w)),
      toastTeks(w));
}

/* ---- B. MEJANYA BEBAS -> DIBUKA, dan statusnya PULIH MENURUT CATATANNYA ---- */
w.eval("vipPulihkan('vip-V_HADIR')");
{
  const v0 = vipS(w).find(x => x.id === 'V_HADIR');
  cek('yang dibatalkan pulih sebagai batal', !!(v0 && v0.batalAt));
  const sebelum = jejak.rsvTulis;
  w.eval("vipBukaLagi('V_HADIR')");
  await tunggu(30);
  const btn = w.document.getElementById('vip_konfirm_btn');
  if (btn) btn.onclick();
  await tunggu(500);
  cek('tulisannya berangkat ke Reservasi', jejak.rsvTulis > sebelum, 'rsvTulis=' + jejak.rsvTulis);
  const rec = ((jejak.rsvPayload || {}).reservations || []).find(x => x && x.id === 'vip-V_HADIR');
  aman('baris di Reservasi', () => {
    cek('barisnya ikut terkirim', !!rec, JSON.stringify(((jejak.rsvPayload || {}).reservations || []).map(x => x.id)));
    /* 'Datang', BUKAN 'Confirmed'. Dipatok Confirmed, tamu yang sudah tercatat
       hadir berubah jadi "belum datang" di rekap modul Reservasi. */
    sama('statusnya pulih jadi Datang', rec && rec.status, 'Datang');
    /* Catatan kru Reservasi TIDAK dihapus — itu kejadian yang memang terjadi,
       dan bukan milik Marketing untuk dibuang. */
    sama('jejak check-in tidak dihapus', rec && rec.checkinAt, 1789300000000);
    sama('daftar kedatangan tidak dihapus', rec && (rec.arrivals || []).length, 1);
    cek('jejak pembukaannya ditulis di catatan', /Dibuka kembali dari modul Marketing/.test(String(rec && rec.notes)));
  });
  const v = vipS(w).find(x => x.id === 'V_HADIR');
  aman('baris di Marketing', () => {
    cek('penanda batal dicabut', !(v && v.batalAt), JSON.stringify(v && v.batalAt));
    cek('siapa yang membukanya dicatat', !!(v && v.dibukaOleh), JSON.stringify(v && v.dibukaOleh));
  });
  cek('tercatat di activities', /Reservasi VIP dibuka kembali/.test(w.eval('JSON.stringify(S.activities.map(function(a){return a.action;}))')));
}

/* ---- C. BARISNYA SUDAH TIDAK ADA DI RESERVASI -> DITOLAK ----
   Membuka catatan di sini tanpa mejanya terkunci berarti Marketing
   menjanjikan meja yang tidak dipesan siapa pun di modul sebelah. */
{
  w.eval("S.vip.unshift({id:'V_YATIM',jenis:'Assisted',nama:'Sudah Dihapus di Reservasi',tanggal:'2026-09-20'," +
         "jamMulai:'19:00',paxMin:4,meja:['R6'],mktPIC:'u-devani',resId:'vip-TIDAK-ADA'," +
         "batalAt:'2026-09-01T00:00:00.000Z',batalOleh:'x'})");
  const sebelum = jejak.rsvTulis;
  w.eval("vipBukaLagi('V_YATIM')");
  await tunggu(30);
  const btn = w.document.getElementById('vip_konfirm_btn');
  if (btn) btn.onclick();
  await tunggu(400);
  sama('tidak menulis apa pun ke Reservasi', jejak.rsvTulis, sebelum);
  const v = vipS(w).find(x => x.id === 'V_YATIM');
  cek('tetap berstatus batal', !!(v && v.batalAt));
  cek('sebabnya dikatakan', /tidak ada lagi di Reservasi/i.test(toastTeks(w)),
      toastTeks(w));
}

/* ---- D. penentu statusnya, sebagai unit ---- */
aman('vipStatusPulih', () => {
  sama('tanpa jejak hadir -> Confirmed', w.eval("vipStatusPulih({})"), 'Confirmed');
  sama('ada checkinAt -> Datang', w.eval("vipStatusPulih({checkinAt:1})"), 'Datang');
  sama('ada arrivals -> Datang', w.eval("vipStatusPulih({arrivals:[{pax:1}]})"), 'Datang');
});

console.log('\n' + ok + ' OK, ' + gagal + ' GAGAL');
process.exit(gagal ? 1 : 0);
})();
