/* UJI: Pengakuan Omset (menuFix) tidak boleh lahir kosong
 *
 *   node tools/uji-menufix.js
 *
 * Keluhan user 5 September 2026: "kenapa ada yang menu belum ditentukan,
 * padahal di sistem ada tulisan menu sudah ditetapkan dan menu dipilih di
 * tempat".
 *
 * Sebabnya bukan pilihan ketiga yang nyasar, melainkan pertanyaan yang tidak
 * pernah ditanyakan. Sampai hari itu kartu Pengakuan Omset HANYA ada di
 * halaman detail event, dan tidak satu pun yang memaksa membukanya — jadi
 * event yang dibuat lalu langsung ditinggalkan lahir tanpa jawaban, dan
 * "Menu belum ditentukan" di Breakdown Finance adalah KEADAAN itu.
 *
 * Yang dijaga uji ini, dan ketiganya lepas tanpa satu pun galat:
 *
 *   1. Event Baru MENANYAKANNYA dan menolak yang kosong.
 *   2. Kosong TIDAK dijatuhkan ke salah satu pilihan. 'tetap' memotong kasir
 *      untuk acara yang tidak seharusnya; 'ditempat' membuat omset marketing
 *      hilang dari pengakuan. Dua-duanya salah dan terlihat wajar.
 *   3. Yang terlanjur kosong tetap TERBACA — di daftar event Marketing dan di
 *      pita Breakdown Finance.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const MKT = path.join(ROOT, 'deploy', 'marketing', 'index.html');
const OMSET = path.join(ROOT, 'deploy', 'finance', 'omset', 'index.html');

let JSDOM, VirtualConsole;
try {
  const j = require(process.env.JSDOM_PATH || 'jsdom');
  JSDOM = j.JSDOM; VirtualConsole = j.VirtualConsole;
} catch (e) {
  console.log('LEWAT: jsdom tidak ada. Pasang dulu, atau set JSDOM_PATH.');
  process.exit(0);
}

let ok = 0, gagal = 0;
function cek(nama, syarat, ket) {
  if (syarat) { ok++; console.log('  OK   ' + nama); }
  else { gagal++; console.log('  GAGAL ' + nama + (ket ? '\n         -> ' + ket : '')); }
}

/* Skrip CDN dibuang: tidak bisa dimuat jsdom, dan tumpukan galatnya
   menenggelamkan baris OK/GAGAL. */
function boot(berkas, url) {
  const html = fs.readFileSync(berkas, 'utf8')
    .replace(/<script[^>]+src=["']https?:[^"']+["'][^>]*><\/script>/g, '');
  const dom = new JSDOM(html, {
    url: url, runScripts: 'dangerously', pretendToBeVisual: true,
    virtualConsole: new VirtualConsole()
  });
  dom.window.localStorage.setItem('lm_session', JSON.stringify({
    userId: 'u1', name: 'Aurel Erbakan', modules: ['*'], expiry: Date.now() + 9e8 }));
  dom.window.fetch = () => new Promise(() => {});
  return dom.window;
}
const tunggu = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  console.log('=== UJI PENGAKUAN OMSET (menuFix) ===\n');

  /* ============ 1. Marketing: Event Baru wajib menjawab ============ */
  console.log('== Event Baru (deploy/marketing) ==');
  {
    const w = boot(MKT, 'https://team.laksamanamuda.id/marketing/');
    await tunggu(900);
    w.eval("S = normalizeState(seed()); ME = {id:'u1',name:'Aurel Erbakan',role:'marketing'};");
    w.eval("S.clients=[{id:'c1',nama:'PT Uji',perusahaan:'PT Uji',hp:'081',mktPIC:'u1'}]; S.events=[];");
    w.eval("window.__toast=[]; toast=function(a,b){window.__toast.push(String(a));}; save=function(){}; go=function(){};");

    w.eval('newEvent()');
    const seg = w.document.getElementById('ne_menufix');
    cek('formulir Event Baru MENANYAKAN Pengakuan Omset', !!seg,
        'pertanyaannya cuma ada di halaman detail — event lahir tanpa jawaban');
    const tombol = seg ? [].slice.call(seg.children) : [];
    cek('...dua pilihan, sama dengan Reservasi VIP', tombol.length === 2,
        tombol.map(b => b.textContent).join(' / '));
    /* KOSONG bukan berarti salah satu. Bawaan diam-diam ke mana pun adalah
       keputusan tentang uang yang tidak pernah diambil siapa-siapa. */
    cek('...bawaannya KOSONG, tidak dijatuhkan ke salah satu',
        !tombol.some(b => b.className === 'on'),
        'ada yang sudah menyala sebelum orangnya memilih');
    const fh = seg && seg.parentNode ? seg.parentNode.querySelector('.fh') : null;
    cek('...dan kekosongannya dikatakan, bukan dibiarkan diam',
        !!fh && fh.textContent.indexOf('Belum ditentukan') > -1);

    /* Ditolak, dan yang paling penting: TIDAK melahirkan apa pun. */
    w.eval("$('ne_client').value='c1'; $('ne_nama').value='Group Reservation'; $('ne_tanggal').value='2026-09-10';");
    w.eval('submitNewEvent()');
    cek('event tanpa Pengakuan Omset DITOLAK',
        w.eval('window.__toast.join("|")').indexOf('Pengakuan Omset wajib') > -1,
        w.eval('window.__toast.join("|")'));
    cek('...dan tidak ada event yang terlanjur lahir', w.eval('S.events.length') === 0);
    /* Ditolak SEBELUM client baru dibuat: kalau di belakang, satu Lead yatim
       tertinggal di Database Client tiap kali formulirnya ditolak, dan tidak
       ada satu pun layar yang menjelaskan dari mana asalnya. */
    w.eval("window.__toast=[]; $('ne_client').value='__new__'; $('ne_cnama').value='Client Yatim'; submitNewEvent()");
    cek('...client baru juga tidak terlanjur dibuat',
        w.eval('S.clients.length') === 1, w.eval('S.clients.length') + ' client');

    w.eval("$('ne_client').value='c1'; setMenuFixBaru('ditempat')");
    const on = [].slice.call(w.document.getElementById('ne_menufix').children)
      .filter(b => b.className === 'on').map(b => b.textContent);
    cek('memilih menyalakan tombolnya', on.length === 1 && on[0].indexOf('di tempat') > -1, on.join());
    /* Yang diganti hanya tombol & teks bantuannya. Menggambar ulang modalnya
       menghapus Nama Event yang sudah diketik, dan yang mengetiknya tidak
       akan tahu kenapa. */
    cek('...tanpa menggambar ulang modalnya',
        w.eval("$('ne_nama') && $('ne_nama').value") === 'Group Reservation',
        'isian yang sudah diketik hilang saat tombolnya ditekan');

    w.eval('window.__toast=[]; submitNewEvent()');
    cek('sesudah dipilih, eventnya tersimpan', w.eval('S.events.length') === 1);
    cek('...berikut pilihannya', w.eval('S.events[0] && S.events[0].menuFix') === 'ditempat',
        String(w.eval('S.events[0] && S.events[0].menuFix')));

    /* Event LAMA yang belum menjawab harus bisa DITEMUKAN dari Marketing.
       Selama penandanya cuma ada di kartu detail dan di pita Finance, orang
       yang harus memutuskannya tidak punya satu pun layar yang menunjukkan
       event mana saja yang masih menunggu. */
    const chipKosong = w.eval('menuFixChip({})');
    cek('yang belum menjawab punya chip peringatan',
        chipKosong.indexOf('Menu belum ditentukan') > -1, chipKosong);
    const src = fs.readFileSync(MKT, 'utf8');
    cek('...dan chip itu digambar di daftar event',
        src.indexOf('menuFixChip(e))') > -1,
        'daftar event tidak menandai baris yang belum menjawab');
    /* Yang SUDAH menjawab tidak diberi chip: penanda yang muncul di setiap
       baris berhenti dibaca, dan yang perlu menonjol justru yang belum. */
    cek('...hanya yang belum, bukan semua baris',
        src.indexOf("(menuFix(e)?'':") > -1);

    /* Reservasi VIP Assisted sudah wajib sejak awal — jangan sampai lepas
       gara-gara jalur Event Baru sekarang punya penjaganya sendiri. */
    cek('Reservasi VIP Assisted tetap wajib menjawab',
        src.indexOf("f.jenis==='Assisted' && !menuFix(f)") > -1);
    w.close();
  }

  /* ============ 2. Finance: yang kosong tidak boleh diam ============ */
  console.log('\n== Breakdown Sumber (deploy/finance/omset) ==');
  {
    const w = boot(OMSET, 'https://team.laksamanamuda.id/finance/omset/');
    await tunggu(700);
    const src = fs.readFileSync(OMSET, 'utf8');

    /* Nilai di luar dua pilihan dipulangkan sebagai KOSONG, bukan diteruskan
       apa adanya: data lama pernah menyimpan bentuk lain, dan meneruskannya
       membuat potongKasirAktif() memutuskan berdasarkan string yang tidak
       pernah dikenali siapa pun. */
    cek('menuFixRow hanya mengakui tetap & ditempat',
        w.eval("menuFixRow({menuFix:'tetap'})") === 'tetap' &&
        w.eval("menuFixRow({menuFix:'ditempat'})") === 'ditempat' &&
        w.eval("menuFixRow({menuFix:'entah'})") === '' &&
        w.eval('menuFixRow({})') === '');
    /* Yang kosong DIPERLAKUKAN seperti 'tetap' — kasir tetap dipotong. Itu
       pilihan sadar: kalau tidak dipotong, omsetnya terhitung dua kali,
       sekali di realisasi PIC dan sekali di realisasi kasir. */
    cek('yang kosong diperlakukan seperti tetap (kasir tetap dipotong)',
        w.eval('potongKasirAktif({})') === true &&
        w.eval("potongKasirAktif({menuFix:'tetap'})") === true &&
        w.eval("potongKasirAktif({menuFix:'ditempat'})") === false);
    /* ...dan justru karena diperlakukan diam-diam seperti 'tetap', ia WAJIB
       disebut. Tanpa itu tidak ada cara apa pun bagi finance untuk tahu
       marketing belum memutuskan. */
    cek('...tapi kekosongannya DISEBUT di pita barisnya',
        src.indexOf('menu belum ditentukan') > -1,
        'baris yang belum diputuskan terlihat sama dengan yang sudah');
    cek('...berikut akibatnya, di title chipnya',
        src.indexOf('diperlakukan seperti menu ditetapkan') > -1);
    /* Penanda milik modul sumber, jadi disegarkan tiap render — bukan hanya
       saat barisnya lahir. Kalau tidak, keputusan yang baru diambil marketing
       tidak akan pernah sampai ke baris yang sudah tersimpan. */
    cek('penanda menu disegarkan dari modul sumber tiap render',
        src.indexOf('menuSumber[r.srcId]') > -1 &&
        src.indexOf('r.menuFix=menuSumber[r.srcId]') > -1);
    w.close();
  }

  console.log('\n---------------------------------------');
  console.log('  OK: ' + ok + '   GAGAL: ' + gagal);
  process.exit(gagal ? 1 : 0);
})();
