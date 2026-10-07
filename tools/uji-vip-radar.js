/* uji-vip-radar.js — Reservasi VIP di modul Radar
 *
 *   node tools/uji-vip-radar.js
 *   JSDOM_PATH=/jalur/ke/jsdom node tools/uji-vip-radar.js
 *
 * BERKAS UJI PERTAMA untuk modul Radar. Sampai 9 September 2026 modul ini cuma
 * "hanya boot yang diuji" di smoke-modul.js — routernya tidak terbaca dari
 * luar, jadi tidak satu pun panel detailnya pernah dijalankan. Dua bug yang
 * dilaporkan user hari itu hidup di sana berbulan-bulan tanpa satu pun galat:
 *
 *  1. PANEL DETAIL VIP membaca field milik modul Event (venue, category,
 *     capacity, pic, co_pic). Tidak satu pun ada di baris VIP, jadi keenam
 *     kotaknya berbunyi "—" dan panelnya terbaca sebagai data rusak.
 *
 *  2. PAX VIP dihitung dari `v.pax` yang TIDAK PERNAH ADA. Reservasi VIP
 *     menyimpan `paxMin`/`paxMax`, jadi kartu "Reservasi VIP" di Agenda selalu
 *     menulis 0 pax walau ada tiga reservasi seratus orang.
 *
 * Keduanya gagal DIAM: yang pertama tampil sebagai panel kosong, yang kedua
 * sebagai angka nol yang kelihatan wajar. Karena itu yang dijaga di sini
 * ANGKANYA dan ISINYA, bukan adanya elemen.
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
const tunggu = ms => new Promise(r => setTimeout(r, ms));

/* ---- data uji ----
   paxMin/paxMax SENGAJA berbeda di tiap baris supaya tiap keadaan punya sidik
   jarinya sendiri:
     v1 rentang 80–120  -> ditulis sebagai rentang, dihitung 120
     v2 hanya paxMin 50 -> ditulis satu angka, dihitung 50
     v3 DIBATALKAN      -> tidak boleh ikut sama sekali
   Kalau paxMax diam-diam diabaikan, totalnya 130 dan bukan 170.

   TANGGALNYA RELATIF TERHADAP HARI INI, dan itu bukan kerapian. Halaman Agenda
   bawaannya memajang MINGGU BERJALAN dan hanya yang AKAN DATANG (fAg.mode
   'minggu' + fAg.waktu 'akan'), jadi fixture bertanggal mati berhenti muncul di
   sana begitu tanggalnya lewat — dan asersi "kartu Reservasi VIP menyebut
   pax-nya" jadi MERAH untuk kode yang tidak berubah sedikit pun. Persis itu
   yang terjadi: ujinya ditulis 9 September 2026 dengan tanggal 10–12
   September, dan sejak 13 September ia melaporkan bug yang tidak ada. Uji yang
   membusuk sendiri lebih buruk daripada tidak ada uji — yang membacanya
   belajar mengabaikan warna merah.

   KETIGANYA DI HARI YANG SAMA, dan itu juga disengaja. Tanggal yang berjajar
   (besok, lusa) bisa jatuh di DUA minggu berbeda kalau ujinya kebetulan
   dijalankan menjelang akhir pekan — lalu salah satunya keluar dari periode
   dan totalnya berbunyi 120, bukan 170. Yang membedakan tiap baris di sini
   PAX-nya, bukan tanggalnya. */
const HARI = n => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const TGL = HARI(1);
const VIP = [
  { id:'v1', nama:'Liya', tanggal:TGL, jamMulai:'12:30', jamSelesai:'17:00',
    jenis:'Assisted', hp:'0811-2233', clientId:'c1', perusahaan:'PT Sinar Baru',
    paxMin:'80', paxMax:'120', meja:['M40','M39'], mktPIC:'u1',
    catatan:'Dekor ulang tahun, kue disimpan di chiller.\nAlergi kacang satu tamu.' },
  { id:'v2', nama:'Rangga', tanggal:TGL, jamMulai:'19:00',
    jenis:'Assisted', paxMin:'50', paxMax:'', meja:['R1'], mktPIC:'u2', catatan:'' },
  { id:'v3', nama:'Batal Saja', tanggal:TGL, paxMin:'900', paxMax:'900',
    meja:[], mktPIC:'u1', batalAt:'2026-09-01T00:00:00.000Z', catatan:'jangan muncul' }
];
const DATA_MKT = {
  vip: VIP,
  users:   [{ id:'u1', name:'Wandi Marketing' }, { id:'u2', name:'Devani' }],
  clients: [{ id:'c1', nama:'Liya Pratama', perusahaan:'PT Sinar Baru' }],
  events: [], designreqs: [], activities: []
};

/* SELURUH skrip modul Radar terbungkus IIFE, dan yang ditempel ke window cuma
   APP. AGENDA / render / page karena itu TIDAK bisa dijangkau dari luar.
   Jembatan eval disuntikkan KE DALAM IIFE saat uji jalan — bukan ditambahkan
   ke berkas yang di-deploy, karena kait yang ikut ter-deploy membuka seluruh
   isi modul ke console siapa pun. Pola yang sama dengan uji-arsip-konten.js
   untuk modul Konten dan uji-vendor.js untuk modul BD. */
const JEMBATAN = 'window.APP=APP; window.__EV__=function(s){return eval(s);};';
function buka() {
  const asli = fs.readFileSync(path.join(ROOT, 'deploy/radar/index.html'), 'utf8');
  const html = asli.replace('window.APP=APP;', () => JEMBATAN);
  if (html === asli) { console.error('jangkar window.APP=APP; tidak ketemu di sumber Radar'); process.exit(2); }
  const vc = new VirtualConsole();
  vc.on('jsdomError', e => {
    const t = String((e && e.detail && e.detail.stack) || (e && e.message) || e);
    if (!/Not implemented|Could not parse CSS/.test(t)) console.log('  !! ' + t.split('\n')[0]);
  });
  const dom = new JSDOM(html, { virtualConsole: vc, runScripts: 'dangerously',
    url: 'https://dev.laksamanamuda.id/radar/',
    beforeParse(w) {
      w.localStorage.setItem('lm_session', JSON.stringify({
        userId:'u1', name:'Wandi', username:'wandi',
        modules:['radar'], adminModules:[], token:'t', expiry: Date.now() + 86400000 }));
      /* Tiap sumber dijawab TERPISAH. Menjawab satu bentuk untuk semua URL
         membuat data Marketing ikut terbaca sebagai data Event, dan panel yang
         diuji jadi hijau karena sebab yang salah. */
      w.fetch = (url) => {
        const u = String(url);
        const isi = u.indexOf('marketing-api') > -1 ? DATA_MKT
                  : u.indexOf('event-api') > -1 ? { events:[], talents:[], schedules:[] }
                  : u.indexOf('reservasi-api') > -1 ? { reservations:[] }
                  : { };
        const j = JSON.stringify({ ok:true, data:isi });
        return Promise.resolve({ ok:true, status:200,
          json:() => Promise.resolve(JSON.parse(j)), text:() => Promise.resolve(j) });
      };
      w.matchMedia = () => ({ matches:false, addListener(){}, removeListener(){}, addEventListener(){}, removeEventListener(){} });
      w.print = () => {}; w.confirm = () => true;
      w.HTMLCanvasElement.prototype.getContext = () => ({});
    } });
  return dom;
}

(async () => {
  console.log('\n== Panel detail Reservasi VIP ==');
  const dom = buka();
  const w = dom.window, d = w.document;
  /* Menunggu KEADAANNYA, bukan jumlah milidetik: boot menembak empat sumber
     sekaligus dan menunggu angka tetap adalah tebakan yang merah di laptop
     yang sibuk. */
  for (let i = 0; i < 150 && !(typeof w.__EV__ === 'function'
        && w.__EV__('typeof AGENDA') === 'object' && w.__EV__('AGENDA.length')); i++) await tunggu(20);

  const jml = w.__EV__('AGENDA.filter(function(a){return a.sumber==="vip";}).length');
  cek('reservasi VIP masuk agenda', jml === 2, 'dapat ' + jml + ' (yang dibatalkan harus tidak ikut)');
  cek('yang dibatalkan tidak ikut', w.__EV__('JSON.stringify(AGENDA.map(function(a){return a.judul;}))').indexOf('Batal Saja') < 0);

  /* ---------- PAX: paxMin/paxMax, bukan `pax` yang tidak pernah ada ---------- */
  const paxTotal = w.__EV__('AGENDA.filter(function(a){return a.sumber==="vip";}).reduce(function(s,a){return s+(+a.pax||0);},0)');
  cek('pax VIP dihitung dari paxMax/paxMin, bukan field pax', paxTotal === 170,
      'dapat ' + paxTotal + ' — 0 berarti membaca v.pax yang memang tidak ada; 130 berarti paxMax diabaikan');

  /* ---------- PANEL DETAIL ---------- */
  w.APP.detail('ag', 'vip', 'v1'); await tunggu(60);
  const body = d.getElementById('drwBody').innerHTML;

  /* Inti keluhannya: panel yang seluruh kotaknya "—". Yang dijaga ISINYA. */
  cek('PIC marketing terbaca namanya, bukan idnya',
      body.indexOf('Wandi Marketing') > -1 && body.indexOf('u1') < 0, body.slice(0, 700));
  cek('jumlah orang ditulis sebagai rentang', body.indexOf('80–120 orang') > -1, body.slice(0, 700));
  cek('catatan reservasi ditampilkan', body.indexOf('Dekor ulang tahun') > -1);
  cek('...utuh, tidak dipotong di tengah', body.indexOf('Alergi kacang satu tamu') > -1,
      'catatan yang terpotong justru menyembunyikan bagian yang membuatnya ditulis');
  cek('meja yang dikunci disebut', body.indexOf('M40') > -1 && body.indexOf('M39') > -1);
  cek('kontak tamu disebut', body.indexOf('0811-2233') > -1);
  cek('klien terdaftar disebut', body.indexOf('Liya Pratama') > -1 && body.indexOf('PT Sinar Baru') > -1);

  /* Field milik modul Event TIDAK boleh muncul di panel VIP — kalau muncul,
     berarti barisnya masih jatuh ke cabang `else` dan kotaknya kosong lagi. */
  cek('tidak lagi memakai kotak milik modul Event',
      body.indexOf('Co-PIC') < 0 && body.indexOf('Kapasitas') < 0 && body.indexOf('Venue') < 0,
      body.slice(0, 700));
  /* Dan buktinya bukan sekadar label yang hilang: panel lama berisi enam "—"
     berturut-turut. Satu pun tidak boleh tersisa di enam kotak pertama. */
  const kotak = (body.match(/<span>—<\/span>/g) || []).length;
  cek('tidak ada kotak yang menggantung tanpa isi', kotak === 0,
      'masih ada ' + kotak + ' kotak "—" — panel yang terbaca sebagai data rusak');

  /* ---------- reservasi tanpa paxMax & tanpa catatan ---------- */
  w.APP.detail('ag', 'vip', 'v2'); await tunggu(60);
  const b2 = d.getElementById('drwBody').innerHTML;
  cek('paxMax kosong ditulis satu angka, bukan rentang',
      b2.indexOf('50 orang') > -1 && b2.indexOf('–50') < 0, b2.slice(0, 500));
  /* Judul bagian catatan TIDAK digambar kalau catatannya kosong: judul kosong
     membuat orang mencari catatan yang memang tidak pernah ada. */
  cek('catatan kosong tidak menggambar judulnya', b2.indexOf('Catatan reservasi') < 0);

  /* ---------- kartu Agenda ----------
     Periodenya DIPATOK ke minggu tanggal fixture, bukan dibiarkan di minggu
     berjalan: kalau tidak, ujinya bergantung pada hari apa ia dijalankan. Yang
     diuji di sini hitungan paxnya, bukan pemilih periodenya. */
  w.__EV__("fAg.mgg=seninMinggu(" + JSON.stringify(TGL) + "); page='agenda'; render();"); await tunggu(80);
  /* SKRIPNYA DIBUANG DULU. `document.body.innerHTML` di jsdom ikut memuat isi
     tag <script> — dan seluruh skrip modul ini memang berada di dalam <body>.
     Tanpa ini, asersi teks apa pun bisa cocok dengan KOMENTAR di kodenya
     sendiri: mutasi yang mencabut kalimat "perkiraan atas" dari layar LOLOS,
     karena kalimat itu masih tertulis di komentar yang menjelaskannya.
     Bentuk baru dari jebakan yang sudah tercatat di CLAUDE.md — mencari string
     tanpa membuang komentar dulu. */
  const layar = d.body.innerHTML.replace(/<script[\s\S]*?<\/script>/gi, '');
  cek('kartu Reservasi VIP menyebut pax-nya', layar.indexOf('170 pax') > -1,
      'nol berarti bug pax kembali');
  /* Angkanya perkiraan ATAS (paxMax), bukan angka pasti seperti pax kontrak
     event. Dipajang tanpa keterangan, ia akan dibaca sebagai jumlah tamu yang
     sudah dipastikan. */
  cek('...dan mengatakan itu perkiraan atas', layar.indexOf('perkiraan atas') > -1);

  /* ---------- kontrak sumber ---------- */
  const SRC = fs.readFileSync(path.join(ROOT, 'deploy/radar/index.html'), 'utf8');
  cek('VIP punya cabangnya sendiri di drawer', /a\.sumber==='vip'\)\{/.test(SRC.replace(/\s+/g, ' ')) ||
      SRC.indexOf("}else if(a.sumber==='vip'){") > -1,
      'tanpa cabang sendiri ia jatuh ke cabang modul Event lagi');
  cek('rentang pax ditulis SATU tempat', (SRC.match(/function paxVipTeks/g) || []).length === 1,
      'dua penulis untuk satu rentang akan menyimpang, dan yang menyimpang jumlah orang yang disiapkan');

  /* Status modul Event berubah (Draft/Today/Finished -> Planning/Prospect/
     Approval/Upcoming/Event Done) dan Radar tertinggal: 23 dari 26 acara
     produksi lenyap dari kalender (7 Okt 2026). Dijaga sebagai invarian
     LINTAS BERKAS, bukan daftar nama yang harus diingat orang. */
  const EVT = fs.readFileSync(path.join(ROOT, 'deploy/event/index.html'), 'utf8');
  const mH = EVT.match(/const EVT_STATUS_HASIL\s*=\s*\[([^\]]*)\]/);
  const mR = SRC.match(/var ST_EVT_JALAN\s*=\s*\[([^\]]*)\]/);
  const daftar = m => m ? m[1].split(',').map(x => x.trim().replace(/^'|'$/g, '')).filter(Boolean) : [];
  const hasil = daftar(mH), radar = daftar(mR);
  cek('tiap status HASIL modul Event lolos penyaring Radar', hasil.length > 0 && hasil.every(x => radar.indexOf(x) > -1),
      'hasil=' + hasil.join('/') + ' radar=' + radar.join('/'));
  cek('Planning & Prospect TIDAK lolos (belum diputuskan)', radar.indexOf('Planning') < 0 && radar.indexOf('Prospect') < 0);

  console.log('\n' + ok + ' OK, ' + gagal + ' GAGAL');
  dom.window.close();
  process.exit(gagal ? 1 : 0);
})();
