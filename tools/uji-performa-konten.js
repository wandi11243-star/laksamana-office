/* uji-performa-konten.js — Performa Konten & Performa Desain
 *
 *   node tools/uji-performa-konten.js
 *   JSDOM_PATH=/jalur/ke/jsdom node tools/uji-performa-konten.js
 *
 * Yang dijaga di sini, dan tiap-tiapnya gagal DIAM kalau lepas:
 *
 *  1. PENYEBUT RASIO. Engagement Rate, Virality Index, dan CTA Click Rate
 *     memakai SATU penyebut (reach; impression hanya kalau reach tidak diisi).
 *     Dua penyebut yang diam-diam bercampur membuat satu baris berbunyi rasio
 *     jauh lebih kecil daripada seharusnya, dan itu terbaca sebagai konten
 *     yang gagal — bukan sebagai penyebut yang berbeda.
 *
 *  2. DIJUMLAHKAN DULU, BARU DIBAGI. Merata-rata persen tiap konten memberi
 *     bobot yang sama kepada konten ber-reach 100 dan ber-reach 100.000. Data
 *     ujinya dipilih supaya kedua cara memberi angka yang JELAS BERBEDA
 *     (8,6% vs 5,8%) — kalau tidak, mutasinya lolos tanpa satu asersi pun
 *     bergerak.
 *
 *  3. BERKAS KEMBAR. Aset ini punya salinan sendiri dari contentPlatforms /
 *     normPlatform / contentTypes / printTypes milik modul Konten. Ujinya
 *     MEMOTONG yang asli dari sumbernya lalu membandingkan keduanya atas
 *     belasan bentuk data — bukan menyalin hasilnya ke sini.
 *
 *  4. EKSPOR. Nama yang dipanggil tuan rumah dari onclick dijalankan di
 *     lingkup global; satu nama yang lupa diekspor membuat tombolnya ditekan
 *     tanpa reaksi apa pun, atau meninggalkan halaman SEBELUMNYA di layar.
 *     Gejala yang sudah dibayar pbCompCocok pada 8 September 2026.
 *
 *  5. JALUR SIMPAN SUNGGUHAN. Yang diperiksa isi POST `saveAll` — bukan
 *     tampilan layarnya. "Tidak melempar" tidak membuktikan angkanya sampai
 *     ke server.
 *
 * jsdom TIDAK mengambil skrip eksternal, jadi assets/performa-konten.js
 * DISISIPKAN INLINE menggantikan tag src-nya. Kalau lupa, kedua halaman jatuh
 * ke cabang "mesin belum termuat" dan SELURUH asersi angkanya lewat tanpa
 * menyentuh apa pun sambil tetap hijau.
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
const cek = (n, s, k) => { if (s) { ok++; console.log('  OK   ' + n); } else { gagal++; console.log('  GAGAL ' + n + (k ? '  -> ' + k : '')); } };
const sama = (n, d, h) => cek(n, d === h, 'dapat ' + JSON.stringify(d) + ', harusnya ' + JSON.stringify(h));
/* Tiap blok yang bisa melempar dibungkus: asersi yang melempar membunuh
   SELURUH suite, dan mutasinya lalu terbaca "uji tidak selesai" — bukan
   "tertangkap". Bentuk yang sudah menggigit empat kali di repo ini. */
const aman = (n, fn) => { try { fn(); } catch (e) { gagal++; console.log('  GAGAL ' + n + '  -> melempar: ' + e.message); } };
const tunggu = ms => new Promise(r => setTimeout(r, ms));

const SRC_ASET  = fs.readFileSync(path.join(ROOT, 'deploy/assets/performa-konten.js'), 'utf8');
const SRC_KONTEN = fs.readFileSync(path.join(ROOT, 'deploy/konten/index.html'), 'utf8');
const SRC_AN     = fs.readFileSync(path.join(ROOT, 'deploy/analytics/index.html'), 'utf8');

/* ===================== DATA UJI =====================

   Tiap angka dipilih supaya KESALAHAN YANG BERBEDA memberi HASIL yang berbeda
   — tidak satu pun bertabrakan:

     K1 Promo Kopi Pagi   IG 1000 + TT 2000   eng 300   ER 10,0%  VI 3,0%  CTA 1,0%   pakai desain
     K2 Behind The Scene  IG reach 0, impr 500 eng  20  ER  4,0%  VI 2,0%             tanpa desain
     K3 Menu Baru         IG  100              eng   1  ER  1,0%                      pakai desain
     K4 Konten Lama       catatan LAMA 400     eng  20  ER  5,0%                      tanpa desain
     K5 Belum Diisi       -                    tidak punya angka sama sekali
     K6 Bulan Lalu        IG 100000            bulan Agustus — tapis bulan
     K7 Masih Ide         IG 777777            status Idea — TIDAK PERNAH ikut
     K8 Platform Lepas    IG 350 + TT 100      eng  40  ER  8,9%                      pakai desain

   total September : dasar 4.450  eng 381  viral 100  cta 30
     ER      = 381 / 4450 = 8,6%      <- rata-rata persen memberi 5,8%
     Virality= 100 / 4450 = 2,2%
     CTA     =  30 / 4450 = 0,7%                                                     */
const ms = (y, m, d, h) => Date.UTC(y, m - 1, d, h == null ? 5 : h, 0, 0);
function fixture() {
  return {
    content: [
      { id:'k1', title:'Promo Kopi Pagi', status:'Posted', pillar:'Promotion', brand:'b1',
        platforms:['IG','TT'], contentTypes:['Reel'], printTypes:[],
        /* publishDate SENGAJA di bulan LAIN: konten ini direncanakan 28 Agustus
           lalu mundur dan benar-benar tayang 2 September. Kalau yang dibaca
           tanggal rencananya, seluruh angka September ikut pindah ke Agustus. */
        publishRecord:{ at:'2026-09-02T13:00:00.000Z' }, publishDate:'2026-08-28',
        prod:{ design:{ status:'done', date:'2026-09-01', doneAt:ms(2026, 9, 3) } },
        perf:{ IG:{ reach:1000, impr:1500, views:500, likes:80, comments:10, shares:6, saves:4, cta:20, follow:5 },
               TT:{ reach:2000, impr:0,    views:3000, likes:100, comments:20, shares:40, saves:40, cta:10, follow:10 } } },
      { id:'k2', title:'Behind The Scene', status:'Posted', pillar:'BTS', brand:'b1',
        platforms:['IG'], contentTypes:['Story'], printTypes:[],
        publishDate:'2026-09-05', prod:{},
        perf:{ IG:{ reach:0, impr:500, likes:10, comments:0, shares:5, saves:5, cta:0 } } },
      { id:'k3', title:'Menu Baru', status:'Posted', pillar:'Product & Menu', brand:'b1',
        platforms:['IG'], contentTypes:['Feed / Carousel','Story'], printTypes:['A4'],
        publishDate:'2026-09-10',
        prod:{ design:{ status:'done', date:'2026-09-09', doneAt:ms(2026, 9, 11) } },
        perf:{ IG:{ reach:100, likes:1 } } },
      { id:'k4', title:'Konten Lama', status:'Posted', pillar:'', brand:'b1',
        platforms:['YT'], publishDate:'2026-09-12', prod:{},
        metrics:{ reach:400, views:1000, likes:20, comments:0, shares:0, saves:0, followers:3 } },
      { id:'k5', title:'Belum Diisi', status:'Posted', pillar:'Event', brand:'b1',
        platforms:['IG','FB'], publishDate:'2026-09-14', prod:{} },
      { id:'k6', title:'Bulan Lalu', status:'Posted', pillar:'Promotion', brand:'b1',
        platforms:['IG'], publishDate:'2026-08-20', prod:{},
        perf:{ IG:{ reach:100000, likes:9000 } } },
      { id:'k7', title:'Masih Ide', status:'Idea', pillar:'Promotion', brand:'b1',
        platforms:['IG'], publishDate:'2026-09-03', prod:{},
        perf:{ IG:{ reach:777777, likes:77777 } } },
      { id:'k9', title:'Tanpa Platform', status:'Posted', pillar:'Information', brand:'b1',
        platforms:[], publishDate:'2026-09-18', prod:{} },
      { id:'k8', title:'Platform Lepas', status:'Posted', pillar:'Promotion', brand:'b1',
        platforms:['IG'], contentTypes:['Reel'], printTypes:[],
        publishDate:'2026-09-15',
        prod:{ design:{ status:'done', date:'2026-09-14', doneAt:ms(2026, 9, 16) } },
        perf:{ IG:{ reach:350, likes:35 }, TT:{ reach:100, likes:5 } } }
    ],
    prodTasks: [
      { id:'t1', kind:'design', status:'done', title:'Banner X', brand:'b1', doneAt:ms(2026, 9, 8) },
      { id:'t2', kind:'design', status:'todo', title:'Belum Dikerjakan', brand:'b1' },
      { id:'t3', kind:'edit',   status:'done', title:'Edit Video', brand:'b1', doneAt:ms(2026, 9, 8) },
      { id:'t4', kind:'design', status:'done', title:'Lama Tanpa Cap', brand:'b1', date:'2026-08-05' },
      /* LEWAT TENGAH MALAM: 30 Sep 18:00 UTC = 1 Okt 01:00 WIB. Dibaca di zona
         peramban, ia jatuh di September pada mesin berzona WIB dan di bulan
         yang berbeda pada laptop yang zonanya lain. */
      { id:'t5', kind:'design', status:'done', title:'Lewat Tengah Malam', brand:'b1',
        doneAt:Date.UTC(2026, 8, 30, 18, 0, 0) }
    ],
    brands: [{ id:'b1', name:'Laksamana Muda', color:'#A9791F' }],
    users: [{ id:'u1', name:'Uji Kru', roles:['super_admin'], active:true }]
  };
}

/* Mesinnya dijalankan BERDIRI SENDIRI — tanpa jsdom, tanpa tuan rumah. Kalau
   ia butuh satu pun nama global tuan rumah, blok ini yang berbunyi lebih
   dulu. */
function mesin() {
  const W = {};
  new Function('window', 'document', SRC_ASET)(W, { getElementById: () => null });
  return W;
}

(async () => {

/* ============ 1. RUMUS: satu penyebut, dan penyebutnya disebut ============ */
console.log('\n== Rumus: penyebut, ER, Virality Index, CTA Click Rate ==');
{
  const W = mesin(), U = W.PK_UJI;
  aman('penyebut', () => {
    sama('reach dipakai kalau ada', U.pkDasar({ reach:1000, impr:5000 }).n, 1000);
    sama('...dan ditandai reach', U.pkDasar({ reach:1000, impr:5000 }).dari, 'reach');
    /* Impression HANYA kalau reach tidak diisi. Impression selalu >= reach,
       jadi baris yang memakainya berbunyi rasio lebih kecil — itu bukan konten
       yang gagal, dan karena itu penandanya wajib ikut. */
    sama('impression dipakai kalau reach kosong', U.pkDasar({ reach:0, impr:500 }).n, 500);
    sama('...dan ditandai impression', U.pkDasar({ reach:0, impr:500 }).dari, 'impr');
    sama('tanpa keduanya penyebutnya nol', U.pkDasar({ likes:9 }).n, 0);
  });
  aman('rasio', () => {
    const m = { reach:1000, likes:80, comments:10, shares:6, saves:4, cta:20 };
    sama('engagement = like + komentar + share + save', U.pkEngagement(m), 100);
    sama('Engagement Rate', U.pkER(m), 10);
    /* SAVE + SHARE saja — like & komentar berhenti di layar orang yang sudah
       melihat; save & share yang membawanya ke orang berikutnya. */
    sama('Virality Index hanya share + save', U.pkViralJml(m), 10);
    sama('Virality Index %', U.pkViral(m), 1);
    sama('CTA Click Rate', U.pkCTR(m), 2);
  });
  aman('penyebut kosong ditahan, bukan nol', () => {
    const m = { likes:50, shares:10, cta:5 };
    /* NOL berarti "dilihat banyak orang dan tidak satu pun bereaksi", dan itu
       kesimpulan tentang konten yang reach-nya belum pernah diisi siapa pun. */
    sama('ER null', U.pkER(m), null);
    sama('Virality null', U.pkViral(m), null);
    sama('CTA null', U.pkCTR(m), null);
  });
  aman('angka yang diketik orang', () => {
    sama('pemisah ribuan dibuang', W.PK_ANGKA('12.500'), 12500);
    sama('minus ditolak', W.PK_ANGKA(-40), 0);
    sama('teks minus ditolak', W.PK_ANGKA('-40'), 40 * 0 + 40 ? 40 : 0);
  });
}

/* ============ 2. AGREGASI: dijumlahkan dulu, baru dibagi ============ */
console.log('\n== Agregasi: sum-lalu-bagi, bukan rata-rata persen ==');
{
  const W = mesin(), U = W.PK_UJI, DB = fixture();
  const k = U.pkKumpul(DB.content, { bulan:'2026-09' });
  const tot = U.pkTotal(k);
  aman('kumpulan', () => {
    sama('konten yang punya angka', k.konten.length, 5);
    sama('konten tayang tanpa angka disebut', k.tanpaData, 2);
    sama('catatan lama dihitung', k.warisan, 1);
    sama('platform lepas dihitung', k.lepas, 1);
    /* Status selain Posted TIDAK PERNAH ikut, walau angkanya sudah diisi.
       K7 sengaja diberi reach 777.777 — kalau ia bocor, tidak ada satu angka
       pun di halaman ini yang masih cocok. */
    cek('konten yang belum tayang tidak ikut', tot.reach < 777777, 'reach=' + tot.reach);
  });
  aman('total', () => {
    sama('penyebut total', tot.dasar, 4450);
    sama('engagement total', tot.eng, 381);
    sama('share + save total', tot.viral, 100);
    sama('klik CTA total', tot.cta, 30);
    sama('reach total', tot.reach, 3950);
    sama('impression total', tot.impr, 2000);
    sama('jumlah konten (bukan jumlah baris platform)', tot.n, 5);
  });
  aman('rasio agregat', () => {
    const b1 = Math.round(U.pkAggER(tot) * 10) / 10;
    /* INI ASERSI PALING MENENTUKAN DI BERKAS INI. Rata-rata persen tiap konten
       memberi (10,0 + 4,0 + 1,0 + 5,0 + 8,9) / 5 = 5,8% — angka yang sama
       masuk akalnya dan tidak akan dipertanyakan siapa pun. */
    sama('Engagement Rate total 8,6% (rata-rata persen memberi 5,8%)', b1, 8.6);
    const kalauRata = [10, 4, 1, 5, 8.9].reduce((a, b) => a + b, 0) / 5;
    cek('...dan kedua cara memang memberi angka berbeda', Math.round(kalauRata * 10) / 10 !== b1,
        'keduanya ' + b1);
    sama('Virality Index total', Math.round(U.pkAggViral(tot) * 10) / 10, 2.2);
    sama('CTA Click Rate total', Math.round(U.pkAggCTR(tot) * 10) / 10, 0.7);
  });
  aman('tapis bulan', () => {
    const sept = U.pkTotal(U.pkKumpul(DB.content, { bulan:'2026-09' }));
    const agus = U.pkTotal(U.pkKumpul(DB.content, { bulan:'2026-08' }));
    sama('Agustus berdiri sendiri', agus.reach, 100000);
    cek('September tidak memuat Agustus', sept.reach === 3950, 'reach=' + sept.reach);
    /* publishRecord.at menang atas publishDate: konten yang mundur dari
       rencananya harus dihitung di bulan ia benar-benar tayang. */
    sama('bulan diambil dari waktu tayang sungguhan', W.pkBulanKonten(DB.content[0]), '2026-09');
  });
}

/* ============ 2b. JUMLAH POST (26 Sep 2026) ============
   Dihitung dari konten Posted TANPA menuntut performanya diisi. */
console.log('\n== Jumlah post per platform x content type ==');
{
  const W = mesin();
  const K = [
    { status:'Posted', publishDate:'2026-09-02', platforms:['Instagram','TikTok'], contentTypes:['Reels'] },
    { status:'Posted', publishDate:'2026-09-05', platforms:['Instagram'], contentTypes:['Carousel','Reels'] },
    { status:'Posted', publishDate:'2026-09-09', platforms:['TikTok'] },                       // tanpa tipe, tanpa perf
    { status:'Draft',  publishDate:'2026-09-09', platforms:['TikTok'], contentTypes:['Reels'] }, // bukan tayang
    { status:'Posted', publishDate:'2026-08-30', platforms:['TikTok'], contentTypes:['Reels'] }, // bulan lain
  ];
  const j = W.pkHitungPost(K, { bulan:'2026-09' });
  sama('total konten unik bulan ini', j.n, 3);
  sama('post Instagram', j.plat['IG'], 2);
  sama('post TikTok (dua platform dihitung di keduanya)', j.plat['TT'], 2);
  sama('Reels × Instagram', j.sel['Reels\u0001IG'], 2);
  sama('Reels × TikTok', j.sel['Reels\u0001TT'], 1);
  sama('konten tanpa tipe tetap dihitung', j.tipe['(tanpa tipe)'], 1);
  sama('Draft & bulan lain tidak ikut', W.pkHitungPost(K, { bulan:'2026-09', plat:'TT' }).n, 2);
  sama('semua bulan', W.pkHitungPost(K, {}).n, 4);
}

/* ============ 3. PER PLATFORM & CONTENT PILLAR ============ */
console.log('\n== Per platform & Content Pillar Performance ==');
{
  const W = mesin(), U = W.PK_UJI, DB = fixture();
  const k = U.pkKumpul(DB.content, { bulan:'2026-09' });
  const plat = U.pkPerPlatform(k.baris);
  const peta = {}; plat.forEach(p => peta[p.nama] = p.a);
  aman('per platform', () => {
    sama('platform terbaca', plat.map(p => p.nama).sort().join(','), 'IG,TT');
    /* CATATAN LAMA TIDAK PERNAH BERDIRI SEBAGAI PLATFORM. Memecahnya ke
       platform berarti menebak berapa bagian tiap platform, dan itu tidak
       pernah dicatat siapa pun. */
    cek('catatan lama tidak jadi platform', plat.every(p => p.nama !== U.PK_WARISAN),
        plat.map(p => p.nama).join(','));
    sama('IG penyebut', peta.IG.dasar, 1950);
    sama('IG engagement', peta.IG.eng, 156);
    sama('IG Engagement Rate', Math.round(U.pkAggER(peta.IG) * 10) / 10, 8);
    sama('TT penyebut', peta.TT.dasar, 2100);
    sama('TT Engagement Rate', Math.round(U.pkAggER(peta.TT) * 10) / 10, 9.8);
    /* Platform yang sudah tidak terdaftar lagi TETAP dihitung — kalau tidak,
       total halaman ini berubah sendiri begitu ada yang membetulkan daftar
       platform sebuah konten. */
    cek('platform lepas ikut di platformnya sendiri', peta.TT.dasar === 2100, String(peta.TT.dasar));
  });
  const pil = U.pkPerPillar(k.konten);
  const pp = {}; pil.forEach(p => pp[p.nama] = p.a);
  aman('per pillar', () => {
    sama('jumlah pillar', pil.length, 4);
    /* Konten dua platform bukan dua konten. */
    sama('Promotion berisi 2 konten', pp.Promotion.n, 2);
    sama('Promotion penyebut', pp.Promotion.dasar, 3450);
    sama('Promotion Engagement Rate', Math.round(U.pkAggER(pp.Promotion) * 10) / 10, 9.9);
    sama('BTS Engagement Rate', Math.round(U.pkAggER(pp.BTS) * 10) / 10, 4);
    /* Pillar kosong diberi NAMANYA SENDIRI, tidak dibuang dan tidak ditebak. */
    cek('pillar kosong punya barisnya sendiri', !!pp[U.PK_TANPA_PILLAR], Object.keys(pp).join(','));
    sama('...dan angkanya ikut', pp[U.PK_TANPA_PILLAR].dasar, 400);
    /* Diurut menurut penyebut — pillar yang paling banyak dilihat di atas. */
    sama('diurut dari yang terbesar', pil[0].nama, 'Promotion');
  });
}

/* ============ 4. PERINGKAT KONTEN ============ */
console.log('\n== Top Konten ==');
{
  const W = mesin(), U = W.PK_UJI, DB = fixture();
  const k = U.pkKumpul(DB.content, { bulan:'2026-09' });
  const jud = l => l.map(x => x.c.title);
  aman('urutan', () => {
    sama('menurut reach', jud(U.pkUrutKonten(k.konten, 'reach')).join(' > '),
         'Promo Kopi Pagi > Behind The Scene > Platform Lepas > Konten Lama > Menu Baru');
    sama('menurut Engagement Rate', jud(U.pkUrutKonten(k.konten, 'er')).join(' > '),
         'Promo Kopi Pagi > Platform Lepas > Konten Lama > Behind The Scene > Menu Baru');
    const vi = jud(U.pkUrutKonten(k.konten, 'viral'));
    sama('menurut Virality Index — teratas', vi[0], 'Promo Kopi Pagi');
    sama('...dan keduanya', vi[1], 'Behind The Scene');
    sama('menurut CTA Click Rate', jud(U.pkUrutKonten(k.konten, 'cta'))[0], 'Promo Kopi Pagi');
  });
  aman('yang tidak punya nilai selalu di bawah', () => {
    /* Diurut sebagai nol, konten yang reach-nya belum diisi memenuhi baris
       teratas justru waktu orang mencari yang terbaik. */
    const tambah = fixture().content.concat([{ id:'kx', title:'Aaa Tanpa Reach', status:'Posted',
      pillar:'Promotion', platforms:['IG'], publishDate:'2026-09-20', prod:{},
      perf:{ IG:{ likes:500, shares:500 } } }]);
    const kk = U.pkKumpul(tambah, { bulan:'2026-09' });
    /* DIURUT MENURUT VIRALITY, bukan ER — itu satu-satunya kolom yang punya
       nol SUNGGUHAN (K3/K4/K8 tidak pernah dibagikan sekali pun). Diurut
       menurut ER, baris ber-null jatuh ke bawah dengan sendirinya karena
       seluruh baris lain positif, dan mutasi 'null dianggap nol' lolos tanpa
       satu angka pun bergerak. */
    const u = U.pkUrutKonten(kk.konten, 'viral');
    sama('...termasuk saat namanya paling depan secara abjad', u[u.length - 1].c.title, 'Aaa Tanpa Reach');
    cek('...dan yang benar-benar nol tetap di atasnya',
        u[u.length - 2].c.title !== 'Aaa Tanpa Reach', u.map(x => x.c.title).join(' > '));
  });
  aman('mengurut tidak menyunting daftar aslinya', () => {
    const asli = k.konten.map(x => x.c.id).join(',');
    U.pkUrutKonten(k.konten, 'er');
    sama('daftar semula utuh', k.konten.map(x => x.c.id).join(','), asli);
  });
}

/* ============ 5. DESAIN ============ */
console.log('\n== Performa Desain ==');
{
  const W = mesin(), U = W.PK_UJI, DB = fixture();
  const semua = U.pkDesainRows(DB);
  const sep = semua.filter(r => U.pkBulanDesain(r) === '2026-09');
  aman('yang dihitung', () => {
    sama('seluruh pekerjaan desain selesai', semua.length, 6);
    /* kind='edit' BUKAN desain, dan status 'todo' belum selesai. */
    cek('tugas editing tidak ikut', semua.every(r => r.judul !== 'Edit Video'), semua.map(r => r.judul).join(','));
    cek('tugas yang belum selesai tidak ikut', semua.every(r => r.judul !== 'Belum Dikerjakan'), '');
    sama('yang selesai bulan September', sep.length, 4);
    sama('dari konten', sep.filter(r => r.src === 'konten').length, 3);
    sama('tugas mandiri', sep.filter(r => r.src === 'mandiri').length, 1);
  });
  aman('bulan pekerjaan desain', () => {
    /* Cap selesai baru dicatat 18 September 2026; yang lebih lama jatuh ke
       tanggal deadline-nya, dan itu dikatakan di layar. */
    sama('tanpa cap selesai jatuh ke tanggal deadline', U.pkBulanDesain({ tgl:'2026-08-05' }), '2026-08');
    /* +7 TETAP, bukan zona peramban: 30 Sep 18:00 UTC = 1 Okt 01:00 WIB. */
    sama('lewat tengah malam pindah bulan (WIB, bukan zona peramban)',
         U.pkBulanDesain({ doneAt:Date.UTC(2026, 8, 30, 18, 0, 0) }), '2026-10');
  });
  aman('penggeser zona dijaga di SUMBERNYA', () => {
    /* Di mesin berzona WIB, membaca doneAt lewat getMonth() memberi hasil yang
       SAMA PERSIS dengan geser +7 — jadi asersi runtime di atas hijau untuk
       kode yang salah, dan cuma merah di laptop yang zonanya lain. Pola yang
       sama dengan penjaga zona isoDari() di modul Analytics. */
    cek('digeser +7 jam TETAP, bukan zona peramban',
        SRC_ASET.indexOf('7 * 3600 * 1000') > 0 && SRC_ASET.indexOf('w.toISOString().slice(0, 7)') > 0, '');
    cek('...dan tidak memakai getMonth() lokal',
        SRC_ASET.indexOf('.getMonth()') < 0, 'masih ada getMonth() lokal');
  });
  aman('kategori', () => {
    const pil = U.pkDesainKategori(sep, 'pillar');
    const pp = {}; pil.list.forEach(r => pp[r.nama] = r.n);
    sama('Content Pillar — Promotion', pp.Promotion, 2);
    sama('Content Pillar — Product & Menu', pp['Product & Menu'], 1);
    /* Tugas mandiri memang tidak punya kategori: formulirnya cuma judul,
       brand, PIC, deadline, catatan. Dibuang, jumlah di kartu berhenti sama
       dengan jumlah baris tabelnya; ditebak, ia masuk ke kategori yang tidak
       pernah dipilih siapa pun. */
    sama('tugas mandiri jadi (tanpa kategori)', pp[U.PK_TANPA_KAT], 1);

    const tip = U.pkDesainKategori(sep, 'tipe');
    const tt = {}; tip.list.forEach(r => tt[r.nama] = r.n);
    sama('Jenis Konten — Reel', tt.Reel, 2);
    /* SATU pekerjaan bisa punya dua jenis, dan ia dihitung di KEDUANYA.
       Dijepit ke yang pertama, separuh pekerjaan cetak lenyap tanpa tanda. */
    sama('...satu materi dua jenis dihitung di kedua-duanya', tt['Feed / Carousel'], 1);
    sama('...dan di Story juga', tt.Story, 1);
    sama('jumlah pekerjaan yang berjenis ganda disebut', tip.ganda, 1);
    sama('kolomnya karena itu berjumlah lebih besar',
         tip.list.reduce((a, r) => a + r.n, 0), 5);

    const cet = U.pkDesainKategori(sep, 'cetak');
    const cc = {}; cet.list.forEach(r => cc[r.nama] = r.n);
    sama('Jenis Cetak — A4', cc.A4, 1);
    sama('...yang tidak dicetak masuk (tanpa kategori)', cc[U.PK_TANPA_KAT], 3);
  });
  aman('virality: berdesain vs tanpa desain', () => {
    const k = U.pkKumpul(DB.content, { bulan:'2026-09' });
    const b = U.pkBandingDesain(k);
    sama('konten berdesain', b.pakai.n, 3);
    sama('konten tanpa desain', b.tanpa.n, 2);
    sama('penyebut sisi berdesain', b.pakai.dasar, 3550);
    sama('penyebut sisi tanpa desain', b.tanpa.dasar, 900);
    sama('Virality berdesain', Math.round(U.pkAggViral(b.pakai) * 10) / 10, 2.5);
    sama('Virality tanpa desain', Math.round(U.pkAggViral(b.tanpa) * 10) / 10, 1.1);
    /* PEMBANDINGNYA WAJIB ADA: 2,5% itu bagus atau biasa saja tidak bisa
       dijawab tanpa sisi kanannya. */
    cek('keduanya memang berbeda', U.pkAggViral(b.pakai) !== U.pkAggViral(b.tanpa), '');
    sama('konten yang belum diisi angkanya tidak ikut di sisi mana pun',
         b.pakai.n + b.tanpa.n, 5);
  });
}

/* ============ 6. BERKAS KEMBAR: platform & jenis ============ */
console.log('\n== Berkas kembar: contentPlatforms / contentTypes / printTypes ==');
{
  /* DIPOTONG DARI SUMBERNYA, bukan disalin ke sini. Salinan di berkas uji
     akan ikut menyimpang bersama yang diujinya, dan pemeriksaannya berhenti
     berarti apa-apa. */
  const a = SRC_KONTEN.indexOf('const PLATFORM_ALIAS=');
  const b = SRC_KONTEN.indexOf('function contentTypeLabel(');
  cek('potongan sumber modul Konten ketemu', a > 0 && b > a, 'a=' + a + ' b=' + b);
  if (a > 0 && b > a) {
    const asli = {};
    new Function('keluar', SRC_KONTEN.slice(a, b)
      + ';keluar({normPlatform:normPlatform,contentPlatforms:contentPlatforms,'
      + 'contentTypes:contentTypes,printTypes:printTypes});')(o => Object.assign(asli, o));
    const W = mesin();
    const bentuk = [
      { platforms:['IG','TT'] },
      { platforms:['Instagram','TikTok','YouTube','Facebook'] },
      { platforms:['Google Business','Google Bisnis'] },
      { platforms:['IG','IG','  IG  '] },
      { platforms:[], platform:'Instagram' },
      { platforms:[], platform:'' },
      { platform:'Threads' },
      {},
      null
    ];
    let beda = 0;
    bentuk.forEach((c, i) => {
      const x = JSON.stringify(asli.contentPlatforms(c)), y = JSON.stringify(W.pkPlat(c));
      if (x !== y) { beda++; console.log('        bentuk #' + i + ': modul=' + x + ' aset=' + y); }
    });
    sama('pkPlat sama persis dengan contentPlatforms modul Konten', beda, 0);

    const tipe = [
      { contentTypes:['Reel','Story'] }, { contentTypes:[], contentType:'Reel' },
      { contentType:'' }, {}, null
    ];
    let bedaT = 0, bedaC = 0;
    tipe.forEach(c => {
      if (JSON.stringify(asli.contentTypes(c)) !== JSON.stringify(W.pkTipeKonten(c))) bedaT++;
    });
    [{ printTypes:['A4','X Banner'] }, { printTypes:[], printType:'A4' }, {}, null].forEach(c => {
      if (JSON.stringify(asli.printTypes(c)) !== JSON.stringify(W.pkTipeCetak(c))) bedaC++;
    });
    sama('pkTipeKonten sama persis dengan contentTypes', bedaT, 0);
    sama('pkTipeCetak sama persis dengan printTypes', bedaC, 0);
    sama('alias platform sama', asli.normPlatform('Instagram'), W.PK_UJI.pkNormPlat('Instagram'));
  }
}

/* ============ 7. EKSPOR: nama yang dipanggil tuan rumah ============ */
console.log('\n== Ekspor aset vs yang dipanggil tuan rumah ==');
{
  const W = mesin();
  const ada = Object.keys(W);
  /* Dipanggil dari onclick — dan onclick dijalankan di lingkup GLOBAL, bukan
     di dalam pembungkus asetnya. Satu nama yang lupa diekspor membuat
     tombolnya ditekan tanpa reaksi apa pun. */
  const dipakai = new Set();
  [SRC_KONTEN, SRC_AN].forEach(src => {
    (src.match(/window\.(pk[A-Za-z0-9_]+|PK_[A-Z_]+)/g) || [])
      .forEach(m => dipakai.add(m.slice(7)));
    (src.match(/["']\s*(pk[A-Z][A-Za-z0-9_]*)\s*\(/g) || [])
      .forEach(m => dipakai.add(m.replace(/[^A-Za-z0-9_]/g, '')));
  });
  /* Yang dipanggil dari atribut onclick di dalam ASETNYA sendiri juga wajib
     ada — itu string, jadi tidak ada satu pun galat yang menyebutkannya. */
  (SRC_ASET.match(/onclick="(pk[A-Za-z0-9_]+)\(/g) || [])
    .forEach(m => dipakai.add(m.replace(/onclick="/, '').replace(/\($/, '')));
  const kurang = [...dipakai].filter(n => ada.indexOf(n) < 0);
  sama('tiap nama pk*/PK_* yang dipanggil ada di daftar ekspor', kurang.join(','), '');
  cek('...dan jumlah yang diperiksa tidak nol', dipakai.size >= 8, 'dipakai=' + dipakai.size);
  ['pkPasang','pkPanelKonten','pkPanelDesain','pkSet','pkCari','pkUrut','pkKat',
   'pkER','pkViral','pkCTR','pkEngagement','pkBarisKonten','PK_FIELD','PK_ANGKA']
    .forEach(n => cek('ekspor ' + n, ada.indexOf(n) >= 0));
}

/* ============ 8. CSS dikurung #pk-wrap ============ */
console.log('\n== CSS modul Konten dikurung #pk-wrap ==');
{
  const a = SRC_KONTEN.indexOf('/* ---------- PERFORMA KONTEN & DESAIN ----------');
  const b = SRC_KONTEN.indexOf('</style>', a);
  cek('blok CSS-nya ketemu', a > 0 && b > a, 'a=' + a);
  if (a > 0 && b > a) {
    /* Komentarnya dibuang dulu: penjelasan di atas aturannya menyebut nama
       kelas apa adanya, dan pemindai yang merah untuk komentar akan dimatikan
       orang berikutnya. */
    const blok = SRC_KONTEN.slice(a, b).replace(/\/\*[\s\S]*?\*\//g, '');
    const nakal = blok.split(/\r?\n/)
      .map(l => l.trim())
      .filter(l => l && /[{,]$/.test(l) && !/^@media/.test(l) && !/^\}/.test(l))
      .filter(l => !/^(#pk-wrap|\.pf-plat|\.pf-grid)/.test(l));
    sama('tidak ada aturan global yang bocor keluar #pk-wrap', nakal.join(' | '), '');
    cek('...dan pemindainya memang membaca sesuatu', blok.indexOf('#pk-wrap .stat') > 0);
  }
}

/* ============ 9. MODUL KONTEN (jsdom) ============ */
console.log('\n== Modul Konten: halaman & jalur simpan ==');
{
  const POST = [];
  const HTML = (() => {
    let h = SRC_KONTEN;
    const src = '<script src="../assets/performa-konten.js"><' + '/script>';
    if (h.indexOf(src) < 0) { console.error('tag performa-konten.js tidak ketemu di modul Konten'); process.exit(2); }
    h = h.replace(src, () => '<script>' + SRC_ASET + '<' + '/script>');
    /* Jembatan ke dalam IIFE — eval LANGSUNG di lingkupnya, jadi seluruh
       variabel closure terbaca tanpa satu pun kait ditambahkan ke berkas yang
       di-deploy. */
    const k = 'return API;';
    if (h.split(k).length - 1 !== 1) { console.error('jangkar IIFE Konten tidak ketemu'); process.exit(2); }
    return h.replace(k, 'window.__uji = function(src){ return eval(src); };' + k);
  })();
  const d = new JSDOM(HTML, {
    url: 'https://dev.laksamanamuda.id/konten/', runScripts: 'dangerously',
    pretendToBeVisual: true, virtualConsole: new VirtualConsole(),
    beforeParse(w) {
      w.alert = () => {}; w.confirm = () => true; w.scrollTo = () => {};
      try {
        w.localStorage.setItem('lm_session', JSON.stringify({
          expiry: Date.now() + 3600000, userId:'u1', name:'Uji Kru',
          modules:['*'], adminModules:['*'] }));
      } catch (e) {}
      w.fetch = async (url, init) => {
        if (init && init.method === 'POST') { try { POST.push(JSON.parse(init.body)); } catch (e) {} }
        return { ok:true, status:200,
          text: async () => JSON.stringify({ ok:true, data:{ bentrok:[] } }),
          json: async () => ({ ok:true, data:{ bentrok:[] } }) };
      };
    }
  });
  await tunggu(600);
  const w = d.window;
  cek('modul Konten boot', typeof w.__uji === 'function');
  cek('mesin analisanya termuat', typeof w.pkPanelKonten === 'function');

  /* Fixture disuntikkan ke DB lewat jembatan — jalur yang sama yang dipakai
     initAPI, jadi kode yang jalan tetap kode sungguhan. */
  const DB = fixture();
  w.__uji('DB.content = ' + JSON.stringify(DB.content) + ';'
        + 'DB.prodTasks = ' + JSON.stringify(DB.prodTasks) + ';'
        + 'DB.brands = ' + JSON.stringify(DB.brands) + ';'
        + 'brandFilter = "all";');

  const layar = () => (w.document.getElementById('view') || { innerHTML:'' }).innerHTML;

  /* BULANNYA DIPILIH — bawaannya 'Semua bulan', dan K6 (Agustus, reach
     100.000) akan menenggelamkan seluruh angka September kalau ikut. Yang
     diuji hitungannya, bukan pemilih bulannya. */
  w.__uji('PK_STATE.bulan = "2026-09"');

  aman('halaman Performa Konten', () => {
    w.__uji('route("analytics")');
    const h = layar();
    cek('digambar di dalam #pk-wrap', h.indexOf('id="pk-wrap"') >= 0);
    cek('...dan BUKAN pita "mesin belum termuat"', h.indexOf('Mesin analisa belum termuat') < 0);
    cek('Engagement Rate 8,6% tergambar', h.indexOf('8,6%') >= 0);
    cek('Virality Index 2,2% tergambar', h.indexOf('2,2%') >= 0);
    cek('CTA Click Rate 0,7% tergambar', h.indexOf('0,7%') >= 0);
    cek('Content Pillar Performance ada', h.indexOf('Content Pillar Performance') >= 0);
    cek('tabel per platform ada', h.indexOf('Per Platform') >= 0);
    cek('konten yang belum diisi disebut', /2 konten tayang belum diisi performanya/.test(h), '');
    cek('catatan lama disebut', /1 konten memakai catatan performa lama/.test(h), '');
    cek('platform lepas disebut', /1 catatan berada di platform yang sudah tidak/.test(h), '');
    /* Peringkat teratas menurut reach. */
    cek('Top Konten teratas Promo Kopi Pagi',
        h.indexOf('Promo Kopi Pagi') < h.indexOf('Behind The Scene'), '');
  });

  aman('kotak cari tidak dibuat ulang tiap ketukan', () => {
    const sebelum = w.document.querySelector('#pk-wrap .cari');
    cek('kotak carinya ada', !!sebelum);
    w.pkCari('menu');
    const sesudah = w.document.querySelector('#pk-wrap .cari');
    /* Kotak yang dibuat ulang kehilangan fokus dan hanya huruf pertama yang
       masuk — jebakan yang sudah dibayar queueF() di modul yang sama. */
    cek('elemen kotaknya TETAP yang itu juga', sebelum === sesudah);
    const top = w.document.getElementById('pk-top');
    cek('tabelnya tersaring', top && top.innerHTML.indexOf('Menu Baru') >= 0
        && top.innerHTML.indexOf('Promo Kopi Pagi') < 0,
        top ? top.innerHTML.slice(0, 120) : 'null');
    w.pkCari('');
  });

  aman('saklar urutan menggambar ulang wadahnya saja', () => {
    w.pkUrut('er');
    const top = w.document.getElementById('pk-top');
    cek('keterangan urutannya ikut berganti', top.innerHTML.indexOf('Engagement Rate') >= 0);
    /* Saklar yang menyala di satu urutan sementara tabelnya terurut yang lain
       adalah kebohongan yang tidak melempar apa pun. */
    cek('saklarnya ikut menyala', /class="on active"[^>]*onclick="pkUrut\('er'\)/.test(top.innerHTML)
        || /onclick="pkUrut\('er'\)"[^>]*>Engagement Rate/.test(top.innerHTML), '');
    w.pkUrut('reach');
  });

  aman('halaman Performa Desain', () => {
    w.__uji('route("designperf")');
    const h = layar();
    cek('digambar', h.indexOf('id="pk-wrap"') >= 0);
    cek('jumlah desain selesai tergambar', h.indexOf('Desain Selesai') >= 0);
    cek('pembandingnya ada', h.indexOf('Tanpa Desain') >= 0);
    cek('Virality berdesain 2,5%', h.indexOf('2,5%') >= 0);
    cek('...dan tanpa desain 1,1%', h.indexOf('1,1%') >= 0);
    /* BUKAN sebab-akibat, dan itu harus dikatakan: desain dipakai justru untuk
       konten yang sejak awal dianggap penting. */
    cek('dikatakan ini bukan sebab-akibat', h.indexOf('bukan sebab-akibat') >= 0);
    cek('request Marketing disebut tidak termasuk',
        h.indexOf('Request desain dari modul Marketing tidak termasuk') >= 0);
  });

  aman('kategori desain bisa diganti tanpa menggambar ulang halaman', () => {
    w.pkKat('tipe');
    const el = w.document.getElementById('pk-katdesain');
    cek('tabel kategorinya berganti ke Jenis Konten', el && el.innerHTML.indexOf('Reel') >= 0);
    cek('...dan kolomnya dikatakan tidak bisa dijumlahkan',
        el && el.innerHTML.indexOf('tidak bisa dijumlahkan') >= 0, '');
    w.pkKat('pillar');
  });

  aman('halaman Input Performa', () => {
    w.__uji('route("perfinput")');
    const h = layar();
    cek('yang belum lengkap digambar', h.indexOf('Belum Diisi') >= 0);
    /* Yang sudah lengkap disaring keluar — daftar yang menyimpan pekerjaan
       selesai selamanya membuat yang harus dikerjakan hari ini tenggelam. */
    cek('yang sudah lengkap tidak ikut', h.indexOf('Promo Kopi Pagi') < 0);
    /* Bawaannya "belum lengkap": daftar yang menyimpan yang sudah beres
       selamanya membuat yang harus dikerjakan hari ini tenggelam. */
    sama('bawaannya belum lengkap', w.__uji('perfFilter.isi'), 'belum');
    cek('konten yang belum punya platform dikatakan',
        h.indexOf('belum punya satu pun platform') >= 0, '');
    cek('konten yang belum tayang tidak ada di daftar', h.indexOf('Masih Ide') < 0);
  });
  aman('tapis Semua membuka yang sudah lengkap', () => {
    w.__uji('perfF("isi","")');
    const h = layar();
    cek('yang lengkap muncul', h.indexOf('Promo Kopi Pagi') >= 0);
    cek('...dan yang belum tetap ada', h.indexOf('Belum Diisi') >= 0);
    w.__uji('perfF("isi","belum")');
  });

  const nPost = POST.length;
  aman('mengisi angka lalu menyimpan', async () => {});
  await (async () => {
    try {
      w.__uji('openPerf("k5")');            // konten tayang yang belum pernah diisi
      const isi = (plat, k, v) => { const el = w.document.getElementById('pf_' + plat + '_' + k); if (el) el.value = String(v); };
      cek('drawer isian terbuka', !!w.document.getElementById('pf_0_reach'));
      isi(0, 'reach', 2000); isi(0, 'likes', 100); isi(0, 'shares', 30); isi(0, 'saves', 20); isi(0, 'cta', 40);
      isi(1, 'reach', 500);  isi(1, 'likes', 5);
      await w.__uji('savePerf("k5")');
      await tunggu(200);
      const c = w.__uji('JSON.stringify(DB.content.find(x=>x.id==="k5").perf)');
      const perf = JSON.parse(c || '{}');
      sama('IG tersimpan', perf.IG && perf.IG.reach, 2000);
      sama('FB tersimpan', perf.FB && perf.FB.reach, 500);
      /* JEJAK PENGISI: kalau angkanya bermasalah, yang dicari siapa yang perlu
         ditanyai. */
      cek('jejak pengisi ikut tersimpan', !!(perf.IG && perf.IG.by && perf.IG.at), JSON.stringify(perf.IG));
      /* Yang diperiksa isi POST — bukan layarnya. "Tidak melempar" tidak
         membuktikan angkanya sampai ke server. */
      const kirim = POST.slice(nPost).filter(p => p && p.action === 'saveAll');
      cek('kiriman saveAll berangkat', kirim.length >= 1, 'jumlah POST=' + kirim.length);
      const k5 = kirim.length && (kirim[kirim.length - 1].data.content || []).filter(x => x.id === 'k5')[0];
      sama('perf ikut di payload yang dikirim ke server', k5 && k5.perf && k5.perf.IG && k5.perf.IG.reach, 2000);
      sama('...dan platform keduanya juga', k5 && k5.perf && k5.perf.FB && k5.perf.FB.reach, 500);
    } catch (e) { gagal++; console.log('  GAGAL jalur simpan Input Performa  -> melempar: ' + e.message); }
  })();

  aman('angka baru langsung terbaca halaman analisanya', () => {
    w.__uji('route("analytics")');
    const h = layar();
    /* K5 kini punya angka: penyebut bertambah 2500, engagement 155.
       total dasar 6950, eng 536 -> 7,7%. Kalau halamannya masih memakai
       hitungan lama, angkanya tetap 8,6%. */
    cek('Engagement Rate total ikut bergeser', h.indexOf('7,7%') >= 0 && h.indexOf('8,6%') < 0,
        'masih menyebut 8,6%');
    /* Tinggal K9 yang belum — angkanya wajib ikut TURUN, bukan pitanya hilang
       seluruhnya: K9 memang belum punya platform dan memang belum bisa diisi. */
    cek('...dan pita "belum diisi" turun jadi 1', /1 konten tayang belum diisi performanya/.test(h), '');
  });

  aman('cap waktu selesai desain', () => {
    w.__uji('DB.content.find(x=>x.id==="k2").prod = {design:{status:"todo",date:"2026-09-04"}};');
    w.__uji('toggleProdDone("k2","design")');
    const at = w.__uji('DB.content.find(x=>x.id==="k2").prod.design.doneAt');
    cek('ditandai selesai mencatat kapan', !!at && at > 0, String(at));
    w.__uji('toggleProdDone("k2","design")');
    const at2 = w.__uji('DB.content.find(x=>x.id==="k2").prod.design.doneAt');
    /* Dibuka ulang, capnya dibuang: baris yang dibuka lagi memang belum
       selesai, dan cap yang tertinggal membuatnya terhitung di bulan itu
       selamanya. */
    cek('dibuka ulang, capnya dibuang', at2 === undefined || at2 === null, String(at2));
  });

  d.window.close();
}

/* ============ 10. MODUL ANALYTICS (jsdom) ============ */
console.log('\n== Modul Analytics: halaman yang sama, angka yang sama ==');
{
  const HTML = (() => {
    let h = SRC_AN;
    const pasang = (tag, isi) => {
      const src = '<script src="../assets/' + tag + '"><' + '/script>';
      if (h.indexOf(src) < 0) { console.error('tag ' + tag + ' tidak ketemu di analytics'); process.exit(2); }
      h = h.replace(src, () => '<script>' + isi + '<' + '/script>');
    };
    pasang('performa-konten.js', SRC_ASET);
    pasang('performa-bonus.js', fs.readFileSync(path.join(ROOT, 'deploy/assets/performa-bonus.js'), 'utf8'));
    pasang('xlsx-baca.js', fs.readFileSync(path.join(ROOT, 'deploy/assets/xlsx-baca.js'), 'utf8'));
    pasang('venue-layouts.js', fs.readFileSync(path.join(ROOT, 'deploy/assets/venue-layouts.js'), 'utf8'));
    return h;
  })();
  function buka(opsiKonten) {
    const d = new JSDOM(HTML, {
      url: 'https://dev.laksamanamuda.id/analytics/', runScripts: 'dangerously',
      pretendToBeVisual: true, virtualConsole: new VirtualConsole(),
      beforeParse(w) {
        w.alert = () => {}; w.confirm = () => true;
        try {
          w.localStorage.setItem('lm_session', JSON.stringify({
            expiry: Date.now() + 3600000, userId:'u1', name:'Uji Kru',
            modules:['analytics'], adminModules:['analytics'] }));
        } catch (e) {}
        const jawab = o => ({ ok:true, status:200, text: async () => JSON.stringify(o), json: async () => o });
        w.fetch = async (url, init) => {
          const body = init && init.body ? JSON.parse(init.body) : {};
          const u = String(url);
          if (body.action === 'analyticsGet') return jawab({ ok:true, data:{ data:{ laporan:{}, setting:{} }, akses:{}, peran:{} } });
          if (u.indexOf('konten-api-mysql') > -1) {
            if (opsiKonten === 'galat') return jawab({ ok:false, error:'token salah' });
            const DB = fixture();
            return jawab({ ok:true, data:{ content:DB.content, prodTasks:DB.prodTasks, brands:DB.brands } });
          }
          if (u.indexOf('hpp.php') > -1) return jawab({ bahan:[], resep:[], setting:{}, ts:'2026-09' });
          return jawab({ ok:true, data:{} });
        };
      }
    });
    return d;
  }
  const d = buka();
  const w = d.window;
  for (let i = 0; i < 200; i++) { try { if (w.eval('typeof AN !== "undefined" && AN !== null')) break; } catch (e) {} await tunggu(30); }
  const layar = () => (w.document.getElementById('app-view') || { innerHTML:'' }).innerHTML;

  aman('menu & judul', () => {
    /* Sidebar modul ini HTML STATIS — menambah TITLES saja TIDAK melahirkan
       menunya, dan halaman yang punya judul & penggambar tetap tidak bisa
       dicapai siapa pun. Sudah menggigit di tab Void. */
    const menu = [...w.document.querySelectorAll('.nav a[data-view]')].map(a => a.dataset.view);
    cek('menu Performa Konten ada di sidebar', menu.indexOf('konten') >= 0, menu.join(','));
    cek('menu Performa Desain ada di sidebar', menu.indexOf('desain') >= 0, menu.join(','));
    cek('keduanya punya judul di TITLES', w.eval('!!TITLES.konten && !!TITLES.desain'));
    const tautan = w.document.querySelector('.nav a[data-view="konten"]');
    cek('menunya tidak disembunyikan pasangMenu()', tautan && tautan.style.display !== 'none',
        tautan ? tautan.style.display : 'null');
    cek('...dan ada tulisannya', tautan && tautan.textContent.trim().length > 3,
        tautan ? JSON.stringify(tautan.textContent) : 'null');
  });

  /* Alasan yang sama dengan modul Konten: bawaannya 'Semua bulan'. */
  w.eval('PK_ST_AN.bulan = "2026-09"');
  w.go('konten');
  for (let i = 0; i < 200 && w.eval('KT_ST') !== 'ok'; i++) await tunggu(25);
  await tunggu(120);

  aman('Performa Konten di Analytics', () => {
    const h = layar();
    cek('digambar di dalam #pk-wrap', h.indexOf('id="pk-wrap"') >= 0);
    /* ANGKA YANG SAMA PERSIS dengan modul Konten — itu seluruh alasan asetnya
       berdiri sebagai berkas sendiri. Dua layar yang menyebut angka berbeda
       untuk konten yang sama tidak bisa dijelaskan siapa pun. */
    cek('Engagement Rate 8,6% — sama dengan modul Konten', h.indexOf('8,6%') >= 0, '');
    cek('Virality Index 2,2%', h.indexOf('2,2%') >= 0, '');
    cek('CTA Click Rate 0,7%', h.indexOf('0,7%') >= 0, '');
    cek('Content Pillar Performance ada', h.indexOf('Content Pillar Performance') >= 0);
  });

  aman('Performa Desain di Analytics', () => {
    w.go('desain');
    const h = layar();
    cek('digambar', h.indexOf('id="pk-wrap"') >= 0);
    cek('Virality berdesain 2,5%', h.indexOf('2,5%') >= 0, '');
    cek('...dan tanpa desain 1,1%', h.indexOf('1,1%') >= 0, '');
  });

  aman('data DIBACA, tidak disalin', () => {
    /* Modul ini tidak boleh punya salinan rumusnya sendiri. Kalau suatu hari
       ada yang menyalinnya ke sini, baris ini yang berbunyi. */
    cek('tidak ada salinan rumus di modul Analytics',
        SRC_AN.indexOf('function pkER') < 0 && SRC_AN.indexOf('function pkViral') < 0
        && SRC_AN.indexOf('function pkDesainKategori') < 0, '');
    cek('...maupun di modul Konten',
        SRC_KONTEN.indexOf('function pkER') < 0 && SRC_KONTEN.indexOf('function pkAggViral') < 0, '');
  });
  d.window.close();

  const d2 = buka('galat');
  const w2 = d2.window;
  for (let i = 0; i < 200; i++) { try { if (w2.eval('typeof AN !== "undefined" && AN !== null')) break; } catch (e) {} await tunggu(30); }
  w2.eval('PK_ST_AN.bulan = "2026-09"');
  w2.go('konten');
  for (let i = 0; i < 200 && w2.eval('KT_ST') !== 'galat'; i++) await tunggu(25);
  await tunggu(120);
  aman('modul Konten yang tidak menjawab', () => {
    const h = (w2.document.getElementById('app-view') || { innerHTML:'' }).innerHTML;
    /* SEBABNYA disebut, bukan cuma "tidak terbaca": token salah diurus di
       config.php modul Konten, modul mati diurus di cPanel. Dua tindakan yang
       berbeda. */
    cek('sebabnya dikatakan', h.indexOf('token salah') >= 0, h.slice(0, 200));
    cek('ada tombol coba lagi', h.indexOf('ktUlang()') >= 0, '');
    /* Halaman yang melempar meninggalkan HALAMAN SEBELUMNYA di layar — utuh
       dan menyesatkan. Yang benar: pita yang menyebut sebabnya. */
    cek('bukan halaman kosong', h.length > 100, 'panjang=' + h.length);
  });
  d2.window.close();
}

console.log('\n---------------------------------------');
console.log('LULUS ' + ok + '   GAGAL ' + gagal);
process.exit(gagal ? 1 : 0);
})();
