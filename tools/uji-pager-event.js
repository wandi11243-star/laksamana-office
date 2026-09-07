/* uji-pager-event.js — pager tabel Daftar Event di Performa Marketing/Event
 *
 *   node tools/uji-pager-event.js
 *   JSDOM_PATH=/jalur/ke/jsdom node tools/uji-pager-event.js
 *
 * Kenapa uji ini ada, dan kenapa TIDAK cukup dijaga smoke test:
 * `smoke-modul.js` sama sekali tidak menyentuh `finance/kas` — daftarnya cuma
 * memuat `finance`, yaitu halaman PEMILIH panel yang tidak berisi aplikasi apa
 * pun. Seluruh Performa Marketing tidak pernah dijalankan satu baris pun di
 * sana.
 *
 * Dua hal yang dijaga di sini, dan keduanya gagal TANPA SATU PUN GALAT:
 *
 *   1. GANTI HALAMAN TIDAK BOLEH MEMBANGUN ULANG #pf_body. Kartu Daftar Event
 *      berdiri bersebelahan dengan grafik "Omset per Event" di grid yang sama,
 *      dan di bawahnya ada empat kartu skema bonus. Kalau pf_body ikut
 *      digambar ulang, Chart.js membangun ulang grafiknya tiap klik dan gulir
 *      melompat kembali ke atas halaman. Persis jebakan yang sudah dibayar di
 *      pager Riwayat Performa Kasir.
 *
 *   2. YANG DIPOTONG HANYA TAMPILANNYA. Lembar PDF (cetakAchievement) dan
 *      hitungan bonus membaca `a.events` yang utuh. Report yang cuma memuat
 *      halaman yang kebetulan terbuka akan menghilangkan event dari lembar
 *      PIC-nya, dan yang menerimanya tidak punya cara tahu ada yang kurang.
 *      Karena itu tombol PDF di sini ditekan dari HALAMAN TERAKHIR — di
 *      situlah baris yang tampil paling sedikit.
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

/* Skrip CDN (Chart.js, font) tidak bisa diambil jsdom — dibuang, lalu Chart
   diganti tiruan. Yang diuji pagernya, bukan grafiknya; yang penting grafik itu
   TIDAK dibangun ulang, dan untuk itu cukup memeriksa elemen canvas-nya. */
/* Mesin bonus hidup di deploy/assets/performa-bonus.js dan dimuat lewat
   <script src>. jsdom tidak mengambil skrip eksternal, jadi isinya DISISIPKAN
   sebagai skrip inline menggantikan tagnya — bukan ditiru. Pola yang sama
   dengan venue-layouts.js di uji-bukti-dp.js dan xlsx-baca.js di uji-analytics.
   Kalau cuma dibuang seperti skrip CDN lain, viewPerforma() melempar di
   bonusMarketing() dan seluruh uji pagernya gagal karena sebab yang tidak ada
   hubungannya dengan pager. */
const html = fs.readFileSync(path.join(ROOT, 'deploy/finance/kas/index.html'), 'utf8')
  .replace(/<script[^>]*\ssrc="[^"]*performa-bonus\.js"[^>]*><\/script>/i,
    '<script>' + fs.readFileSync(path.join(ROOT, 'deploy/assets/performa-bonus.js'), 'utf8') + '</script>')
  .replace(/<script[^>]*\ssrc=[^>]*><\/script>/gi, '');

const vc = new VirtualConsole();
vc.on('jsdomError', e => {
  const t = String((e && e.detail && e.detail.stack) || (e && e.message) || e);
  console.log('  !! galat halaman: ' + t.split('\n').slice(0, 4).join('\n'));
});

const dom = new JSDOM(html, {
  virtualConsole: vc, runScripts: 'dangerously',
  url: 'https://dev.laksamanamuda.id/finance/kas/',
  beforeParse(w) {
    /* Gerbang SSO di <head> membaca localStorage SEBELUM skrip lain jalan.
       Tanpa sesi, halaman melempar dirinya ke Office dan tidak satu baris pun
       sempat didefinisikan. Yang diuji pagernya, bukan gerbangnya — pola yang
       sama dengan uji-kelola-user.js. */
    w.localStorage.setItem('lm_session', JSON.stringify({
      id: 'u1', name: 'Ayu', modules: ['finance'], adminModules: ['finance'],
      token: 't', expiry: Date.now() + 86400000,
    }));
    w.fetch = () => new Promise(() => {});   // boot tidak boleh menembak jaringan
    w.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
    w.print = () => {};
    w.Chart = class { destroy() {} update() {} };
    w.HTMLCanvasElement.prototype.getContext = () => ({});
  },
});
const w = dom.window;
const $ = s => w.document.querySelector(s);
const $$ = s => Array.from(w.document.querySelectorAll(s));

/* 30 hari × 1 event untuk Ayu, plus 1 event untuk Budi di hari pertama.
   31 baris di segmen "Semua" = 3 halaman yang TIDAK genap (12+12+7), jadi
   halaman terakhir yang salah hitung punya tempat untuk ketahuan. Budi sengaja
   cuma 1 event: pager tidak boleh digambar untuk daftar sependek itu. */
const hari = i => '2026-09-' + String(i + 1).padStart(2, '0');
const evRow = (i, pic) => ({
  picId: pic, eventName: 'Event ke-' + (i + 1), amount: 1000000 + i * 1000,
  tax: 100000, service: 50000, shift: [],
  srcJenis: i % 3 === 0 ? 'Corporate Event' : 'Wedding',
});
const daily = [];
for (let i = 0; i < 30; i++) {
  daily.push({
    date: hari(i), food: 0, bev: 0, other: 0, discount: 0, tax: 0, service_charge: 0,
    bd: {
      marketing: [evRow(i, 'p1')].concat(i === 0 ? [evRow(99, 'p2')] : []),
      event: [], kasir: [], self: { amount: 0, disc: 0 },
    }, bdValid: true,
  });
}
/* DB/KET_MAP/PERIOD dideklarasikan dengan let di lingkup leksikal global —
   BUKAN properti window, jadi harus lewat eval. Jebakan ini sudah tercatat di
   CLAUDE.md dan sudah pernah memakan satu siklus penuh. */
w.eval(`
  DB = normalizeDB({
    employees:{ marketing:[{id:'p1',name:'Ayu'},{id:'p2',name:'Budi'}], event:[], kasir:[] },
    daily: ${JSON.stringify(daily)}
  });
  KET_MAP = { '@ayu':'Marketing', '@budi':'Marketing, Leader' };
  CURRENT='marketing'; VIEWMODE='bulan'; PERIOD='2026-09';
`);
w.eval('viewPerforma("marketing")');

/* Jumlah halamannya DIHITUNG dari PF_PER_HAL yang benar-benar ada di sumber,
   bukan ditulis 5 di sini. Angkanya sudah pernah berubah sekali (12 -> 5 atas
   permintaan user 7 September 2026), dan uji yang memasang angkanya sendiri
   akan merah untuk perubahan yang benar — lalu dibetulkan dengan mengganti
   angkanya, yang justru menghapus pemeriksaannya. */
const PER = w.eval('PF_PER_HAL');
const halDari = n => Math.max(1, Math.ceil(n / PER));
const HAL_SEMUA = halDari(31), HAL_AYU = halDari(30);

console.log('-- halaman pertama --');
cek('#pf_daftar ada (tabelnya wadah sendiri, bukan di dalam pf_body)', !!$('#pf_daftar'));
sama('rentang aktif memang sebulan penuh', w.eval('rentangAktif().length'), 30);
sama('lima baris per halaman (permintaan user)', PER, 5);
sama('halaman dipotong sepanjang PF_PER_HAL', $$('#pf_daftar tbody tr').length, PER);
cek('pager digambar', !!$('#pf_pager'));
cek('tombol Sebelumnya mati di halaman 1', $$('#pf_pager button')[0].disabled);
cek('keterangan menyebut rentang & total baris',
    new RegExp('Baris 1–' + PER + ' dari 31').test($('#pf_pager span').textContent),
    $('#pf_pager span').textContent);

console.log('\n-- pindah halaman --');
const grafikSebelum = $('#pf_chart');
const bonusSebelum = $('#pf_daftar').closest('.grid').nextElementSibling;
$$('#pf_pager button')[1].click();
cek('halaman 2 tergambar',
    new RegExp('halaman 2/' + HAL_SEMUA).test($('#pf_pager span').textContent), $('#pf_pager span').textContent);
sama('halaman 2 juga sepanjang PF_PER_HAL', $$('#pf_daftar tbody tr').length, PER);
cek('GRAFIK TIDAK DIBANGUN ULANG — canvas-nya elemen yang sama',
    $('#pf_chart') === grafikSebelum,
    'canvas diganti: pf_body ikut digambar ulang, gulir akan melompat ke atas');
cek('kartu bonus juga tidak dibangun ulang',
    $('#pf_daftar').closest('.grid').nextElementSibling === bonusSebelum);

const keAkhir = () => { let n = 0; while ($('#pf_pager') && !$$('#pf_pager button')[1].disabled && n++ < 50) $$('#pf_pager button')[1].click(); };
keAkhir();
sama('halaman terakhir berisi sisanya', $$('#pf_daftar tbody tr').length, 31 - PER * (HAL_SEMUA - 1));
cek('tombol Berikutnya mati di halaman terakhir', $$('#pf_pager button')[1].disabled);
cek('keterangan halaman terakhir benar',
    new RegExp('Baris ' + (PER * (HAL_SEMUA - 1) + 1) + '–31 dari 31').test($('#pf_pager span').textContent),
    $('#pf_pager span').textContent);

console.log('\n-- ganti PIC --');
const seg = $$('#pf_seg button');
/* PINDAH SELAGI DI HALAMAN TERAKHIR, ke PIC yang halaman terakhirnya BUKAN
   nomor yang sama. Ini satu-satunya urutan yang bisa membedakan: kalau pindah
   ke PIC yang cuma punya satu halaman, PF_HAL dijepit ke 1 oleh gambarDaftar()
   sendiri dan reset yang hilang tidak akan pernah kelihatan. */
cek('masih di halaman terakhir sebelum ganti PIC',
    new RegExp('halaman ' + HAL_SEMUA + '/' + HAL_SEMUA).test($('#pf_pager span').textContent),
    $('#pf_pager span').textContent);
seg[1].click();                                   // Ayu: 30 event
cek('ganti PIC kembali ke halaman 1, bukan bertahan di halaman terakhir',
    new RegExp('halaman 1/' + HAL_AYU).test($('#pf_pager span').textContent), $('#pf_pager span').textContent);
sama('...dan barisnya sehalaman penuh', $$('#pf_daftar tbody tr').length, PER);

seg[2].click();                                   // Budi: 1 event saja
sama('PIC dengan satu event tergambar utuh', $$('#pf_daftar tbody tr').length, 1);
cek('pager TIDAK digambar untuk daftar satu baris', !$('#pf_pager'));
seg[0].click();                                   // kembali ke Semua
sama('kembali ke Semua juga mulai dari halaman 1', $$('#pf_daftar tbody tr').length, PER);
cek('...dan pagernya menyebut halaman 1',
    new RegExp('halaman 1/' + HAL_SEMUA).test($('#pf_pager span').textContent), $('#pf_pager span').textContent);

console.log('\n-- yang TIDAK boleh ikut terpotong --');
cek('kotak Jumlah Event menyebut SELURUH event, bukan sehalaman',
    />31</.test($('#pf_body').innerHTML), 'angka 31 tidak ketemu di kartu ringkas');
cek('kartu bonus tetap dihitung dari seluruh event',
    /Skema 1 — Bonus Target Tim/.test($('#pf_body').innerHTML));
keAkhir();
cek('sedang di halaman terakhir saat tombol PDF ditekan',
    new RegExp('halaman ' + HAL_SEMUA + '/' + HAL_SEMUA).test($('#pf_pager span').textContent),
    $('#pf_pager span').textContent);
const tampilSaatCetak = $$('#pf_daftar tbody tr').length;
$('#pf_pdf').click();
const barisCetak = ($('#printSheet').innerHTML.match(/Event ke-/g) || []).length;
sama('lembar PDF memuat SELURUH 31 event, bukan ' + tampilSaatCetak + ' baris yang sedang tampil', barisCetak, 31);
cek('...dan yang tampil saat itu memang jauh lebih sedikit', tampilSaatCetak < 31,
    'halaman terakhir kebetulan memuat semuanya — ujinya tidak menguji apa pun');

console.log('\n' + ok + ' OK, ' + gagal + ' GAGAL');
process.exit(gagal ? 1 : 0);
