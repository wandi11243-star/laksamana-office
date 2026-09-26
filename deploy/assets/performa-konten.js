/* performa-konten.js — MESIN ANALISA PERFORMA KONTEN & DESAIN, SUMBER TUNGGAL.
 *
 * Dipakai bersama oleh:
 *   deploy/konten/      Performa Konten & Performa Desain (tim yang mengisi)
 *   deploy/analytics/   Performa Konten & Performa Desain (yang membacanya)
 *
 * KENAPA BERKAS SENDIRI. Permintaan user 18 September 2026 menyebut DUA modul
 * sekaligus. Menyalin rumusnya berarti dua salinan Engagement Rate, Virality
 * Index, dan CTA Click Rate — dan dua layar yang menyebut angka berbeda untuk
 * konten yang sama adalah selisih yang tidak akan bisa dijelaskan siapa pun.
 * Repo ini sudah kehilangan waktu lima kali karena berkas kembar yang
 * tertinggal: porsiPic, potonganHari, hpp.php, cocokPic, dan rkHitung. Pola
 * yang sama dengan deploy/assets/performa-bonus.js.
 *
 * MANDIRI, tidak bergantung pada satu pun nama global tuan rumah. Pemformatnya
 * (PK_NUM/PK_ESC) bernama sendiri: modul Konten punya num()/esc() sendiri dan
 * modul Analytics punya esc()/rp0() sendiri, jadi aset yang menumpang nama
 * global akan memformat BERBEDA di tiap modul tanpa satu pun galat.
 *
 * SELURUH KELUARANNYA HTML bergaya modul Analytics (.card/.card-sub/.stat
 * dengan anak .lab/.val/.foot, .grid.g4, .seg, .notice, .tbl-wrap, .num).
 * Tuan rumah yang kelasnya berbeda memetakannya lewat kurungan #pk-wrap —
 * pola yang sama dengan #pev-wrap di deploy/event/.
 *
 *   node tools/uji-performa-konten.js
 */
'use strict';
/* SELURUH isi berkas ini di dalam SATU pembungkus. Nama seperti num/esc/pct di
   bawah bernama SAMA dengan milik tuan rumah, dan dua const bernama sama di
   lingkup global skrip klasik membuat halamannya mati dengan SyntaxError
   sebelum satu baris pun sempat jalan. Yang dipakai tuan rumah diekspor ke
   window di kaki berkas ini. */
(function () {

/* ========================= PEMFORMAT & PEMBANTU ========================= */
var PK_NUM = function (n) { return Math.round(+n || 0).toLocaleString('id-ID'); };
var PK_ESC = function (s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c];
  });
};
/* Angka yang diketik orang: pemisah ribuan dibuang, sisanya digit. Nilai
   negatif TIDAK diterima — tidak ada satu pun metrik di sini yang bisa minus,
   dan minus di penyebut membuat seluruh persennya terbalik tandanya. */
var PK_ANGKA = function (v) {
  if (typeof v === 'number') return (isFinite(v) && v > 0) ? Math.round(v) : 0;
  var n = parseInt(String(v == null ? '' : v).replace(/[^0-9]/g, ''), 10);
  return (isNaN(n) || n < 0) ? 0 : n;
};
/* Persen dengan satu angka di belakang koma, dibulatkan di SATU tempat supaya
   angka yang sama tidak pernah tampil 4,7% di kartu dan 4,8% di tabel. */
var PK_PCT = function (x) {
  return (Math.round((x || 0) * 10) / 10).toLocaleString('id-ID',
    { minimumFractionDigits: 1, maximumFractionDigits: 1 });
};

/* ===================== BENTUK DATA: METRIK PER PLATFORM =====================

   Satu konten bisa tayang di IG DAN TikTok sekaligus, dan angkanya BERBEDA di
   tiap platform — itu inti permintaannya ("menghitung untuk semua platform
   yang terdaftar oleh tim konten"). Jadi yang disimpan c.perf[<platform>],
   bukan satu angka per konten.

   `c.metrics` LAMA (satu objek datar per konten) tetap dibaca — lihat
   pkBarisKonten(). */
var PK_FIELD = [
  { k:'reach',    t:'Reach',         ket:'Akun berbeda yang melihat konten ini' },
  { k:'impr',     t:'Impression',    ket:'Berapa kali konten ini muncul — boleh berulang ke orang yang sama' },
  { k:'views',    t:'Views',         ket:'Penayangan video / tontonan' },
  { k:'likes',    t:'Likes',         ket:'Suka' },
  { k:'comments', t:'Comments',      ket:'Komentar' },
  { k:'shares',   t:'Shares',        ket:'Dibagikan ulang — ikut menghitung Virality Index' },
  { k:'saves',    t:'Saves',         ket:'Disimpan — ikut menghitung Virality Index' },
  { k:'cta',      t:'Klik CTA',      ket:'Klik tautan / tombol ajakan: link in bio, WhatsApp, pesan sekarang' },
  { k:'follow',   t:'Follower Baru', ket:'Pertambahan follower dari konten ini' }
];
var PK_FIELD_K = PK_FIELD.map(function (f) { return f.k; });

/* Alias platform — SALINAN dari deploy/konten/. Sengaja TIDAK memanggil
   contentPlatforms() milik tuan rumah: modul Analytics tidak punya fungsi itu,
   dan membuat modul Konten memanggil balik ke aset ini berarti seluruh
   modulnya mati kalau asetnya gagal termuat (contentPlatforms dipakai di
   puluhan tempat, termasuk saat boot).

   Yang menjaganya bukan ingatan: tools/uji-performa-konten.js MEMOTONG
   contentPlatforms / normPlatform / contentTypes / printTypes dari sumber
   modul Konten lalu membandingkan hasilnya dengan yang di sini atas belasan
   bentuk data. Berkas kembar yang tertinggal akan berbunyi di situ. */
var PK_ALIAS = { Instagram:'IG', TikTok:'TT', YouTube:'YT', Facebook:'FB',
                 'Google Business':'Google', 'Google Bisnis':'Google' };
function pkNormPlat(p) { p = String(p == null ? '' : p).trim(); return PK_ALIAS[p] || p; }
function pkUnik(l) {
  var s = [], i;
  for (i = 0; i < l.length; i++) if (l[i] && s.indexOf(l[i]) < 0) s.push(l[i]);
  return s;
}
function pkPlat(c) {
  if (!c) return [];
  var l = (c.platforms && c.platforms.length) ? c.platforms : (c.platform ? [c.platform] : []);
  return pkUnik(l.map(pkNormPlat));
}
function pkTipeKonten(c) {
  if (!c) return [];
  return pkUnik((c.contentTypes && c.contentTypes.length) ? c.contentTypes : (c.contentType ? [c.contentType] : []));
}
function pkTipeCetak(c) {
  if (!c) return [];
  return pkUnik((c.printTypes && c.printTypes.length) ? c.printTypes : (c.printType ? [c.printType] : []));
}

var PK_TANPA_PILLAR = '(tanpa pillar)';
var PK_TANPA_KAT    = '(tanpa kategori)';
var PK_WARISAN      = '(catatan lama)';

/* Bulan tayang sebuah konten, 'YYYY-MM'. Yang dipakai WAKTU TAYANG SUNGGUHAN
   (publishRecord.at) lebih dulu, baru tanggal rencana — konten yang mundur
   seminggu dari rencananya harus dihitung di bulan ia benar-benar tayang.
   Kalau tidak, angka bulan lalu berubah sendiri tiap kali ada yang mundur. */
function pkBulanKonten(c) {
  var s = (c && c.publishRecord && c.publishRecord.at) || (c && c.publishDate) || '';
  s = String(s);
  return /^\d{4}-\d{2}/.test(s) ? s.slice(0, 7) : '';
}

function pkRapikan(m) {
  var o = {}, i;
  for (i = 0; i < PK_FIELD_K.length; i++) o[PK_FIELD_K[i]] = PK_ANGKA(m && m[PK_FIELD_K[i]]);
  return o;
}
function pkKosong(m) {
  var i;
  for (i = 0; i < PK_FIELD_K.length; i++) if (PK_ANGKA(m && m[PK_FIELD_K[i]]) > 0) return false;
  return true;
}

/* Baris metrik satu konten, satu baris per platform.

   CATATAN LAMA (`c.metrics`) IKUT, TAPI TIDAK DIPECAH KE PLATFORM. Bentuk itu
   satu objek datar untuk seluruh konten — menebak berapa bagian IG dan berapa
   bagian TikTok berarti mengarang angka yang tidak pernah dicatat siapa pun.
   Jadi ia berdiri sebagai satu baris berplatform PK_WARISAN: ikut di total,
   ikut di peringkat konten & pillar, dan SENGAJA tidak ikut di tabel per
   platform. Jumlahnya disebut di layar — daftar yang menyusut tanpa keterangan
   terbaca sebagai data yang hilang. */
function pkBarisKonten(c) {
  var out = [], plat = pkPlat(c), i, p, m;
  var perf = (c && c.perf && typeof c.perf === 'object' && !Array.isArray(c.perf)) ? c.perf : null;
  if (perf) {
    for (i = 0; i < plat.length; i++) {
      p = plat[i];
      if (!perf[p]) continue;
      m = pkRapikan(perf[p]);
      if (pkKosong(m)) continue;
      out.push({ plat:p, m:m, warisan:false, lepas:false, at:perf[p].at || 0, by:perf[p].by || '' });
    }
    /* Platform yang sudah TIDAK lagi terdaftar di kontennya tapi angkanya
       terlanjur diisi tetap ikut. Membuangnya berarti total halaman ini
       berubah sendiri begitu ada yang membetulkan daftar platform sebuah
       konten — tanpa satu pun galat, dan tanpa satu pun angka di layar yang
       bisa dicurigai. Jumlahnya disebut. */
    Object.keys(perf).forEach(function (p2) {
      if (plat.indexOf(p2) >= 0) return;
      var m2 = pkRapikan(perf[p2]);
      if (pkKosong(m2)) return;
      out.push({ plat:p2, m:m2, warisan:false, lepas:true, at:perf[p2].at || 0, by:perf[p2].by || '' });
    });
  }
  if (!out.length && c && c.metrics && typeof c.metrics === 'object') {
    m = pkRapikan(c.metrics);
    /* Bentuk lama menamai follower `followers`, bukan `follow`. */
    if (!m.follow) m.follow = PK_ANGKA(c.metrics.followers);
    if (!pkKosong(m)) out.push({ plat:PK_WARISAN, m:m, warisan:true, lepas:false, at:0, by:'' });
  }
  return out;
}
function pkAdaData(c) { return pkBarisKonten(c).length > 0; }

/* ============================== RUMUS ==============================

   SATU PENYEBUT untuk ketiga rasio di bawah, dan itu yang membuat ketiganya
   bisa berdiri di satu baris dan dibandingkan. Penyebutnya REACH; impression
   dipakai HANYA kalau reach tidak diisi.

   Impression SELALU >= reach (satu orang bisa melihat konten yang sama dua
   kali), jadi baris yang terpaksa memakai impression akan berbunyi rasio LEBIH
   KECIL daripada seharusnya. Itu bukan konten yang gagal — itu penyebut yang
   berbeda, dan karena itu penyebutnya DISEBUT di selnya sendiri, bukan cuma di
   kepala kolom. Kepala kolom dibaca sekali, angkanya dibaca tiap baris. */
function pkDasar(m) {
  var r = PK_ANGKA(m && m.reach), i = PK_ANGKA(m && m.impr);
  if (r > 0) return { n:r, dari:'reach' };
  if (i > 0) return { n:i, dari:'impr' };
  return { n:0, dari:'' };
}
function pkDasarLabel(dari) { return dari === 'impr' ? 'impression' : (dari === 'reach' ? 'reach' : ''); }

function pkEngagement(m) {
  return PK_ANGKA(m && m.likes) + PK_ANGKA(m && m.comments)
       + PK_ANGKA(m && m.shares) + PK_ANGKA(m && m.saves);
}
/* SAVE + SHARE saja — itu yang diminta, dan itu memang yang membedakan
   "disukai" dari "disebarkan". Like dan komentar berhenti di layar orang yang
   sudah melihat; save & share yang membawanya ke orang berikutnya. */
function pkViralJml(m) { return PK_ANGKA(m && m.shares) + PK_ANGKA(m && m.saves); }

/* Ketiganya memulangkan null — BUKAN 0 — kalau penyebutnya kosong. Nol berarti
   "dilihat banyak orang dan tidak satu pun bereaksi", dan itu kesimpulan
   tentang konten yang reach-nya belum pernah diisi siapa pun. */
function pkRasio(atas, m) { var d = pkDasar(m); return d.n > 0 ? (atas / d.n * 100) : null; }
function pkER(m)    { return pkRasio(pkEngagement(m), m); }
function pkViral(m) { return pkRasio(pkViralJml(m), m); }
function pkCTR(m)   { return pkRasio(PK_ANGKA(m && m.cta), m); }

/* ========================= AGREGASI =========================

   DIJUMLAHKAN DULU, BARU DIBAGI — bukan rata-rata dari persen tiap baris.
   Rata-rata persen memberi bobot yang sama kepada konten ber-reach 50 dan
   konten ber-reach 500.000, sehingga satu konten kecil yang kebetulan viral
   mengangkat seluruh angka pillar-nya. Yang ditanya di tabel ini "dari sekian
   orang yang melihat, berapa yang bereaksi" — dan itu penjumlahan. */
function pkKosongAgg() {
  var a = { n:0, dasar:0, dasarImpr:0, eng:0, viral:0, cta:0 };
  PK_FIELD_K.forEach(function (k) { a[k] = 0; });
  return a;
}
/* `eng` dan `viral` PUNYA penampung sendiri karena keduanya turunan — jumlah
   beberapa kolom sekaligus. `cta` TIDAK: ia kolom apa adanya, dan PK_FIELD_K
   di baris pertama sudah menjumlahkannya.

   Menambahkannya sekali lagi di sini terbaca wajar (ketiganya memang dipakai
   sebagai pembilang rasio) dan MENGGANDAKANNYA — dua kali di pkTambah, dua
   kali lagi di pkGabungAgg, jadi CTA Click Rate berbunyi EMPAT KALI LIPAT.
   Tidak ada satu pun galat, dan 2,7% sama masuk akalnya dengan 0,7%. Sudah
   kejadian saat berkas ini ditulis; yang menangkapnya asersi angka di
   tools/uji-performa-konten.js, bukan mata. */
function pkTambah(a, m) {
  PK_FIELD_K.forEach(function (k) { a[k] += PK_ANGKA(m[k]); });
  var d = pkDasar(m);
  a.dasar += d.n;
  if (d.dari === 'impr') a.dasarImpr += d.n;
  a.eng   += pkEngagement(m);
  a.viral += pkViralJml(m);
  a.n++;
  return a;
}
function pkGabungAgg(a, b) {
  PK_FIELD_K.forEach(function (k) { a[k] += b[k]; });
  a.dasar += b.dasar; a.dasarImpr += b.dasarImpr;
  a.eng += b.eng; a.viral += b.viral;
  return a;
}
function pkAggRasio(a, atas) { return (a && a.dasar > 0) ? (atas / a.dasar * 100) : null; }
function pkAggER(a)    { return pkAggRasio(a, a.eng); }
function pkAggViral(a) { return pkAggRasio(a, a.viral); }
function pkAggCTR(a)   { return pkAggRasio(a, a.cta); }

/* Seluruh baris metrik dari sebuah daftar konten, sudah tersaring.
   `bulanAda` dikumpulkan dari SELURUH konten tayang — bukan dari yang lolos
   tapis — supaya pemilih bulannya tidak pernah kehilangan bulan yang justru
   sedang dipilih. */
function pkKumpul(konten, tapis) {
  tapis = tapis || {};
  var out = { baris:[], konten:[], warisan:0, lepas:0, tanpaData:0, bulanAda:{}, tayang:0 };
  (konten || []).forEach(function (c) {
    if (!c || c.status !== 'Posted') return;
    out.tayang++;
    var b = pkBulanKonten(c);
    if (b) out.bulanAda[b] = 1;
    if (tapis.bulan && b !== tapis.bulan) return;
    var rows = pkBarisKonten(c);
    if (!rows.length) { out.tanpaData++; return; }
    if (tapis.plat) rows = rows.filter(function (r) { return r.plat === tapis.plat; });
    if (!rows.length) return;
    if (tapis.cari) {
      var q = String(tapis.cari).toLowerCase();
      var teks = String(c.title || '') + ' ' + String(c.pillar || '') + ' '
               + rows.map(function (r) { return r.plat; }).join(' ');
      if (teks.toLowerCase().indexOf(q) < 0) return;
    }
    var agg = pkKosongAgg();
    rows.forEach(function (r) {
      pkTambah(agg, r.m);
      if (r.warisan) out.warisan++;
      if (r.lepas) out.lepas++;
      out.baris.push({ konten:c, plat:r.plat, m:r.m, warisan:r.warisan });
    });
    out.konten.push({ c:c, agg:agg, plat:rows.map(function (r) { return r.plat; }) });
  });
  return out;
}
/* JUMLAH POST per platform × content type (26 September 2026, permintaan user:
   "input performa tidak perlu diwajibkan, di-count berdasarkan jumlahnya aja
   dulu per bulan — berapa Post TikTok, berapa Post Instagram, dibagi per
   content type, dan keseluruhannya bisa dicek juga").

   Dihitung dari konten berstatus Posted SAJA — TIDAK menuntut angka
   performanya diisi. Itu bedanya dengan seluruh kartu lain di halaman ini.
   Satu konten yang tayang di dua platform dihitung di keduanya (memang dua
   post), dan yang tipenya dua dihitung di keduanya; karena itu kolom/baris
   TOTAL dihitung terpisah dari konten unik, bukan dijumlahkan dari selnya. */
var PK_TANPA_TIPE = '(tanpa tipe)', PK_TANPA_PLAT = '(tanpa platform)';
function pkHitungPost(konten, tapis) {
  tapis = tapis || {};
  var sel = {}, plat = {}, tipe = {}, platSet = {}, tipeSet = {}, n = 0;
  (konten || []).forEach(function (c) {
    if (!c || c.status !== 'Posted') return;
    if (tapis.bulan && pkBulanKonten(c) !== tapis.bulan) return;
    var ps = pkPlat(c); if (!ps.length) ps = [PK_TANPA_PLAT];
    if (tapis.plat) { ps = ps.filter(function (p) { return p === tapis.plat; }); if (!ps.length) return; }
    var ts = pkTipeKonten(c); if (!ts.length) ts = [PK_TANPA_TIPE];
    n++;
    ts.forEach(function (t) { tipe[t] = (tipe[t] || 0) + 1; tipeSet[t] = 1; });
    ps.forEach(function (p) {
      plat[p] = (plat[p] || 0) + 1; platSet[p] = 1;
      ts.forEach(function (t) { var k = t + '\u0001' + p; sel[k] = (sel[k] || 0) + 1; });
    });
  });
  var urut = function (peta) { return Object.keys(peta).sort(function (a, b) { return (peta[b] - peta[a]) || a.localeCompare(b); }); };
  return { n:n, sel:sel, plat:plat, tipe:tipe, daftarPlat:urut(plat), daftarTipe:urut(tipe) };
}
function pkKartuJumlahPost() {
  var j = pkHitungPost(PK_DB.content || [], { bulan:PK_ST.bulan, plat:PK_ST.plat });
  var h = '<div class="card"><h3>Jumlah Post — ' + PK_ESC(pkNamaBulan(PK_ST.bulan)) + '</h3>'
    + '<div class="card-sub">Dihitung dari konten berstatus <b>Posted</b>, <b>tanpa</b> menunggu angka performanya diisi. '
    + 'Satu konten yang tayang di dua platform dihitung di keduanya, jadi kolom platform boleh berjumlah lebih besar '
    + 'daripada total konten.</div>';
  if (!j.n) return h + '<div class="empty">Belum ada konten berstatus Posted pada periode ini.</div></div>';
  h += '<div class="grid g4">' + pkKartu('Total Konten Tayang', PK_NUM(j.n), 'konten unik berstatus Posted', true)
    + j.daftarPlat.slice(0, 3).map(function (p) { return pkKartu('Post ' + p, PK_NUM(j.plat[p]), ''); }).join('')
    + '</div>';
  h += '<div class="tbl-wrap"><table><thead><tr><th>Content Type</th>'
    + j.daftarPlat.map(function (p) { return '<th class="num">' + PK_ESC(p) + '</th>'; }).join('')
    + '<th class="num">Total konten</th></tr></thead><tbody>';
  j.daftarTipe.forEach(function (t) {
    h += '<tr><td><b>' + PK_ESC(t) + '</b></td>'
      + j.daftarPlat.map(function (p) {
          var v = j.sel[t + '\u0001' + p] || 0;
          return '<td class="num">' + (v ? PK_NUM(v) : '<span class="muted">—</span>') + '</td>';
        }).join('')
      + '<td class="num"><b>' + PK_NUM(j.tipe[t]) + '</b></td></tr>';
  });
  h += '<tr><td><b>Total post</b></td>'
    + j.daftarPlat.map(function (p) { return '<td class="num"><b>' + PK_NUM(j.plat[p]) + '</b></td>'; }).join('')
    + '<td class="num"><b>' + PK_NUM(j.n) + '</b></td></tr>';
  return h + '</tbody></table></div></div>';
}
function pkTotal(kumpul) {
  var a = pkKosongAgg();
  kumpul.konten.forEach(function (x) { pkGabungAgg(a, x.agg); });
  /* n dihitung ulang sebagai JUMLAH KONTEN, bukan jumlah baris platform:
     kartu di atas menjawab "berapa konten", dan konten tiga platform bukan
     tiga konten. */
  a.n = kumpul.konten.length;
  return a;
}

function pkPerPlatform(baris) {
  var peta = {};
  baris.forEach(function (r) {
    /* Baris catatan lama TIDAK punya platform, jadi ia tidak boleh berdiri di
       tabel per platform sebagai platform bernama "(catatan lama)". */
    if (r.warisan) return;
    if (!peta[r.plat]) peta[r.plat] = pkKosongAgg();
    pkTambah(peta[r.plat], r.m);
  });
  return Object.keys(peta).map(function (p) { return { nama:p, a:peta[p] }; })
    .sort(function (x, y) { return (y.a.dasar - x.a.dasar) || String(x.nama).localeCompare(String(y.nama)); });
}
function pkPerPillar(konten) {
  var peta = {};
  konten.forEach(function (x) {
    var p = String((x.c && x.c.pillar) || '').trim() || PK_TANPA_PILLAR;
    if (!peta[p]) peta[p] = pkKosongAgg();
    /* Dijumlahkan dari AGREGAT kontennya, bukan dari tiap barisnya lagi —
       kalau tidak, konten yang tayang di tiga platform terhitung tiga kali di
       kolom "jumlah konten". */
    pkGabungAgg(peta[p], x.agg);
    peta[p].n++;
  });
  return Object.keys(peta).map(function (p) { return { nama:p, a:peta[p] }; })
    .sort(function (x, y) { return (y.a.dasar - x.a.dasar) || String(x.nama).localeCompare(String(y.nama)); });
}

var PK_URUT = {
  reach: { t:'Reach',           v:function (a) { return a.dasar; } },
  er:    { t:'Engagement Rate', v:function (a) { return pkAggER(a); } },
  viral: { t:'Virality Index',  v:function (a) { return pkAggViral(a); } },
  cta:   { t:'CTA Click Rate',  v:function (a) { return pkAggCTR(a); } }
};
function pkUrutKonten(list, kunci) {
  var f = (PK_URUT[kunci] || PK_URUT.reach).v;
  /* SALINAN — sort menyunting di tempat, dan daftar yang sama dipakai kartu di
     atas tabel. */
  return list.slice().sort(function (x, y) {
    var a = f(x.agg), b = f(y.agg);
    /* Yang tidak punya nilai SELALU di bawah, ke arah mana pun urutannya:
       diurut sebagai nol ia memenuhi baris teratas justru waktu orang mencari
       yang terbaik. */
    if (a == null && b == null) return String(x.c.title || '').localeCompare(String(y.c.title || ''));
    if (a == null) return 1;
    if (b == null) return -1;
    return (b - a) || String(x.c.title || '').localeCompare(String(y.c.title || ''));
  });
}

/* ========================= DESAIN =========================

   "Total design yang sudah didesign (berdasarkan kategori)". Sumbernya DUA,
   dan keduanya milik modul Konten:
     1. konten yang ditandai butuh desain  -> c.prod.design.status === 'done'
     2. tugas desain mandiri               -> prodTasks kind='design' status='done'

   REQUEST DESAIN DARI MODUL MARKETING — dulu SENGAJA tidak ikut, karena yang
   dibaca antrian hanya designReqs&aktif=1 (yang masih aktif). Sejak 26
   September 2026 (permintaan user) ia ikut, dibaca lewat designReqs TANPA
   aktif=1 yang memang memulangkan yang sudah selesai — dan dihitung TERPISAH
   (pkKartuMkt), bukan dilebur ke dua sumber di bawah. Lihat pkMuatMkt(). */
function pkBulanDesain(r) {
  if (r && r.doneAt) {
    var d = new Date(+r.doneAt);
    if (!isNaN(d.getTime())) {
      /* +7 TETAP, bukan zona peramban: tanggal usaha di sini WIB, dan laptop
         yang zonanya lain akan memindahkan pekerjaan ke bulan sebelah.
         Aturan yang sama dengan isoDari() di modul Analytics. */
      var w = new Date(d.getTime() + 7 * 3600 * 1000);
      return w.toISOString().slice(0, 7);
    }
  }
  var s = String((r && r.tgl) || '');
  return /^\d{4}-\d{2}/.test(s) ? s.slice(0, 7) : '';
}
function pkDesainRows(db) {
  var out = [];
  ((db && db.content) || []).forEach(function (c) {
    var d = c && c.prod && c.prod.design;
    if (!d || d.status !== 'done') return;
    out.push({
      src:'konten', id:c.id, judul:String(c.title || '(tanpa judul)'),
      brand:c.brand || '', pic:c.pic || '',
      pillar:String(c.pillar || '').trim() || PK_TANPA_PILLAR,
      tipe:pkTipeKonten(c), cetak:pkTipeCetak(c),
      doneAt:d.doneAt || 0, tgl:d.date || c.publishDate || '', konten:c
    });
  });
  ((db && db.prodTasks) || []).forEach(function (t) {
    if (!t || t.kind !== 'design' || t.status !== 'done') return;
    /* Tugas mandiri memang TIDAK punya pillar / jenis konten / jenis cetak —
       formulirnya cuma judul, brand, PIC, deadline, catatan. Dibuang, jumlah
       "desain selesai" di kartu berhenti sama dengan jumlah baris tabelnya;
       ditebak, ia masuk ke kategori yang tidak pernah dipilih siapa pun. */
    out.push({
      src:'mandiri', id:t.id, judul:String(t.title || '(tanpa judul)'),
      brand:t.brand || '', pic:t.pic || '',
      pillar:PK_TANPA_KAT, tipe:[], cetak:[],
      doneAt:t.doneAt || 0, tgl:t.date || '', konten:null
    });
  });
  return out;
}
var PK_KAT = {
  pillar: { t:'Content Pillar', amb:function (r) { return [r.pillar]; } },
  tipe:   { t:'Jenis Konten',   amb:function (r) { return r.tipe.length ? r.tipe : [PK_TANPA_KAT]; } },
  cetak:  { t:'Jenis Cetak',    amb:function (r) { return r.cetak.length ? r.cetak : [PK_TANPA_KAT]; } }
};
/* Satu pekerjaan desain bisa punya LEBIH DARI SATU jenis (satu materi dipakai
   sebagai Reel sekaligus Story; satu desain dicetak A4 sekaligus X Banner).
   Barisnya karena itu dihitung di TIAP jenisnya, dan kolomnya TIDAK BISA
   DIJUMLAHKAN — itu disebut di kaki tabelnya. Dijepit ke jenis pertama saja,
   separuh pekerjaan cetak lenyap dari daftar tanpa satu pun tanda. */
function pkDesainKategori(rows, mode) {
  var peta = {}, ganda = 0;
  var amb = (PK_KAT[mode] || PK_KAT.pillar).amb;
  rows.forEach(function (r) {
    var ks = amb(r);
    if (ks.length > 1) ganda++;
    ks.forEach(function (k) {
      if (!peta[k]) peta[k] = { nama:k, n:0, konten:0, mandiri:0 };
      peta[k].n++;
      if (r.src === 'konten') peta[k].konten++; else peta[k].mandiri++;
    });
  });
  var list = Object.keys(peta).map(function (k) { return peta[k]; })
    .sort(function (x, y) { return (y.n - x.n) || String(x.nama).localeCompare(String(y.nama)); });
  return { list:list, ganda:ganda };
}

/* Virality Index konten YANG MEMAKAI DESAIN dibanding yang tidak.

   PEMBANDINGNYA WAJIB ADA. Angka virality konten berdesain yang berdiri
   sendirian tidak menjawab apa pun — 6,2% itu bagus atau biasa saja tidak bisa
   dijawab tanpa tahu berapa angka konten yang tidak pakai desain. Aturan yang
   sama dengan "jam tampil vs jam yang sama tanpa penampil" di Performa Talent.

   BUKAN SEBAB-AKIBAT, dan itu dikatakan di layar: desain dipakai justru untuk
   konten yang sejak awal dianggap penting (promo, event), jadi sebagian
   selisihnya sudah ada sebelum satu desain pun dibuat. */
function pkDesainPakai(c) { return !!(c && c.prod && c.prod.design); }
function pkBandingDesain(kumpul) {
  var pakai = pkKosongAgg(), tanpa = pkKosongAgg();
  kumpul.konten.forEach(function (x) {
    var a = pkDesainPakai(x.c) ? pakai : tanpa;
    pkGabungAgg(a, x.agg);
    a.n++;
  });
  return { pakai:pakai, tanpa:tanpa };
}

/* ===================== KEADAAN & PENGGAMBAR =====================

   Tuan rumah memberikan keadaannya sendiri lewat pkPasang(). Yang dipegang
   aset ini cuma RUJUKANNYA, jadi tidak ada dua salinan keadaan yang bisa
   menyimpang — saklar yang menyala di "Virality" sementara tabelnya terurut
   reach adalah kebohongan yang tidak melempar apa pun. */
var PK_ST = null, PK_DB = null;
function pkPasang(st, db) {
  PK_ST = st || {};
  PK_DB = db || {};
  if (!PK_ST.urut) PK_ST.urut = 'reach';
  if (!PK_ST.kat)  PK_ST.kat  = 'pillar';
  /* Bawaannya BULAN BERJALAN (26 Sep 2026): yang ditanyakan "bulan ini sudah
     berapa post". "Semua bulan" tetap bisa dipilih di pemilihnya. */
  if (PK_ST.bulan == null) PK_ST.bulan = new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 7);   // WIB tetap, bukan zona peramban
  if (PK_ST.plat == null)  PK_ST.plat  = '';
  if (PK_ST.cari == null)  PK_ST.cari  = '';
}
function pkTapis() { return { bulan:PK_ST.bulan, plat:PK_ST.plat, cari:'' }; }

/* Kendali yang memang harus menggambar ulang SELURUH halaman: pemilih bulan
   dan tapis platform menggeser kartu, tabel platform, tabel pillar, dan tabel
   konten sekaligus. Keduanya <select>/<button>, jadi tidak ada kotak isian
   yang kehilangan fokus karenanya. */
function pkSet(k, v) {
  if (!PK_ST) return;
  PK_ST[k] = v;
  if (typeof PK_ST.gambar === 'function') PK_ST.gambar();
}
/* Mengetik di kotak cari dan menekan saklar urutan menggambar ulang WADAHNYA
   SAJA (#pk-top). Lewat penggambar penuh, kotak yang sedang diketik dibuat
   ulang dan hanya huruf pertama yang masuk — jebakan yang sudah dibayar di
   queueF() modul Konten dan gambarDaftar() panel Kas Kecil. */
function pkCari(v) {
  if (!PK_ST) return;
  PK_ST.cari = v;
  var el = document.getElementById('pk-top');
  if (el) el.innerHTML = pkIsiTop();
}
function pkUrut(v) {
  if (!PK_ST) return;
  PK_ST.urut = v;
  var el = document.getElementById('pk-top');
  if (el) el.innerHTML = pkIsiTop();
}
function pkKat(v) {
  if (!PK_ST) return;
  PK_ST.kat = v;
  var el = document.getElementById('pk-katdesain');
  if (el) el.innerHTML = pkIsiKatDesain();
}

/* ------------------------- pembantu HTML ------------------------- */
function pkKartu(lab, val, foot, accent) {
  return '<div class="stat' + (accent ? ' accent' : '') + '">'
    + '<div class="lab">' + PK_ESC(lab) + '</div>'
    + '<div class="val">' + val + '</div>'
    + (foot ? '<div class="foot">' + foot + '</div>' : '') + '</div>';
}
/* Sel persen yang MEMBAWA PENYEBUTNYA SENDIRI. Kepala kolom tergulir keluar
   layar di tabel panjang; angkanya yang tinggal. Empat putaran pertanyaan di
   kolom Kontribusi modul Analytics lahir persis dari kolom persen yang
   penyebutnya harus ditebak. */
function pkSelRasio(nilai, a) {
  if (nilai == null) return '<td class="num"><span class="muted">—</span>'
    + '<div class="helper">reach belum diisi</div></td>';
  var impr = a && a.dasarImpr > 0;
  return '<td class="num"><b>' + PK_PCT(nilai) + '%</b>'
    + '<div class="helper">dari ' + PK_NUM(a.dasar) + (impr ? ' reach/impression' : ' reach') + '</div></td>';
}
function pkSeg(aktif, opsi, fn) {
  return '<div class="seg">' + opsi.map(function (o) {
    return '<button type="button" class="' + (aktif === o[0] ? 'on active' : '') + '" '
      + 'onclick="' + fn + '(\'' + o[0] + '\')">' + PK_ESC(o[1]) + '</button>';
  }).join('') + '</div>';
}
function pkNamaBulan(b) {
  if (!b) return 'Semua bulan';
  var n = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
  var p = b.split('-');
  return (n[parseInt(p[1], 10) - 1] || p[1]) + ' ' + p[0];
}
function pkPilihBulan(bulanAda) {
  var l = Object.keys(bulanAda).sort().reverse();
  /* Bulan yang sedang dipilih tapi TIDAK ada di daftar tetap digambar,
     ditandai. Keadaan ini nyata: kedua halaman memakai keadaan yang SAMA
     (supaya yang berpindah antar keduanya tidak perlu memilih bulan dua kali),
     sementara daftar bulannya berbeda — yang satu bulan tayang konten, yang
     satu bulan desain selesai. Tanpa baris ini, pemilihnya menyala "Semua
     bulan" sementara isinya tersaring ke satu bulan yang memang kosong, dan
     halaman yang kosong tanpa sebab dilaporkan sebagai data hilang. */
  var lepas = (PK_ST.bulan && l.indexOf(PK_ST.bulan) < 0) ? PK_ST.bulan : '';
  return '<select onchange="pkSet(\'bulan\', this.value)" aria-label="Pilih bulan">'
    + '<option value=""' + (PK_ST.bulan ? '' : ' selected') + '>Semua bulan</option>'
    + l.map(function (b) {
        return '<option value="' + b + '"' + (PK_ST.bulan === b ? ' selected' : '') + '>' + PK_ESC(pkNamaBulan(b)) + '</option>';
      }).join('')
    + (lepas ? '<option value="' + lepas + '" selected>' + PK_ESC(pkNamaBulan(lepas)) + ' — tidak ada data</option>' : '')
    + '</select>';
}

/* ===================== HALAMAN: PERFORMA KONTEN ===================== */
function pkIsiTop() {
  var k = pkKumpul((PK_DB.content || []), { bulan:PK_ST.bulan, plat:PK_ST.plat, cari:PK_ST.cari });
  var list = pkUrutKonten(k.konten, PK_ST.urut);
  var namaUrut = (PK_URUT[PK_ST.urut] || PK_URUT.reach).t;
  var h = pkSeg(PK_ST.urut, [['reach','Reach'],['er','Engagement Rate'],['viral','Virality Index'],['cta','CTA Click Rate']], 'pkUrut');
  h += '<div class="card-sub">Diurut menurut <b>' + PK_ESC(namaUrut) + '</b>. '
    + (PK_ST.urut === 'reach'
        ? 'Yang teratas konten yang paling banyak dilihat — belum tentu yang paling menggerakkan orang.'
        : 'Diurut menurut RASIO, jadi konten ber-reach kecil bisa berdiri di atas. '
          + 'Reach-nya ikut dipajang di kolom sebelah supaya itu terlihat — tidak ada batas minimum yang '
          + 'diam-diam membuang konten dari daftar ini.')
    + '</div>';
  if (!list.length) {
    h += '<div class="empty">' + (PK_ST.cari
      ? 'Tidak ada konten yang cocok dengan <b>' + PK_ESC(PK_ST.cari) + '</b>.'
      : 'Belum ada konten tayang yang performanya sudah diisi pada periode ini.') + '</div>';
    return h;
  }
  h += '<div class="tbl-wrap"><table><thead><tr>'
    + '<th>#</th><th>Konten</th><th>Platform</th><th>Content Pillar</th>'
    + '<th class="num">Reach</th><th class="num">Impression</th><th class="num">Engagement</th>'
    + '<th class="num">Engagement Rate</th><th class="num">Virality Index</th><th class="num">CTA Click Rate</th>'
    + '</tr></thead><tbody>';
  list.forEach(function (x, i) {
    var a = x.agg;
    h += '<tr><td class="num">' + (i + 1) + '</td>'
      + '<td><b>' + PK_ESC(x.c.title || '(tanpa judul)') + '</b>'
      + '<div class="helper">' + PK_ESC(pkNamaBulan(pkBulanKonten(x.c)) || 'tanggal tayang belum dicatat') + '</div></td>'
      + '<td>' + x.plat.map(function (p) { return '<span class="chip mute">' + PK_ESC(p) + '</span>'; }).join(' ') + '</td>'
      + '<td>' + PK_ESC(String(x.c.pillar || '').trim() || PK_TANPA_PILLAR) + '</td>'
      + '<td class="num">' + PK_NUM(a.reach) + '</td>'
      + '<td class="num">' + (a.impr ? PK_NUM(a.impr) : '<span class="muted">—</span>') + '</td>'
      + '<td class="num">' + PK_NUM(a.eng) + '</td>'
      + pkSelRasio(pkAggER(a), a) + pkSelRasio(pkAggViral(a), a) + pkSelRasio(pkAggCTR(a), a)
      + '</tr>';
  });
  h += '</tbody></table></div>';
  h += '<div class="card-sub" style="margin-top:12px;margin-bottom:0">Menampilkan <b>' + list.length
    + '</b> konten. Satu baris = satu konten; angkanya gabungan seluruh platform konten itu'
    + (PK_ST.plat ? ' yang tersaring ke <b>' + PK_ESC(PK_ST.plat) + '</b>' : '') + '.</div>';
  return h;
}

function pkPanelKonten() {
  var semua = PK_DB.content || [];
  var k = pkKumpul(semua, pkTapis());
  var tot = pkTotal(k);
  var platAda = pkPerPlatform(pkKumpul(semua, { bulan:PK_ST.bulan }).baris);
  var h = '';

  /* --- kendali --- */
  h += '<div class="card"><div style="display:flex;gap:12px;flex-wrap:wrap;align-items:center">'
    + pkPilihBulan(k.bulanAda)
    + '<div class="seg" style="margin-bottom:0">'
    + '<button type="button" class="' + (PK_ST.plat ? '' : 'on active') + '" onclick="pkSet(\'plat\',\'\')">Semua Platform</button>'
    + platAda.map(function (p) {
        return '<button type="button" class="' + (PK_ST.plat === p.nama ? 'on active' : '') + '" '
          + 'onclick="pkSet(\'plat\',\'' + PK_ESC(p.nama) + '\')">' + PK_ESC(p.nama) + '</button>';
      }).join('')
    + '</div></div>'
    + '<div class="card-sub" style="margin:12px 0 0"><b>Jumlah Post</b> di bawah menghitung seluruh konten berstatus '
    + '<b>Posted</b>. Angka performa (reach, engagement, dll.) <b>tidak wajib</b> diisi — kartu-kartu performa '
    + 'hanya memakai konten yang angkanya sudah diisi. Semua platform yang didaftarkan tim konten ikut — angkanya dicatat '
    + 'per platform, jadi satu konten yang tayang di dua platform punya dua catatan.</div></div>';

  h += pkKartuJumlahPost();

  if (!k.konten.length) {
    h += '<div class="notice info">ℹ <div><b>Belum ada angka performa pada periode ini</b> — tidak wajib. '
      + (k.tayang
          ? 'Ada <b>' + k.tayang + '</b> konten berstatus Posted, tapi angkanya belum diisi. '
            + 'Isi lewat halaman <b>Input Performa</b> di modul Konten — reach, impression, likes, '
            + 'komentar, share, save, dan klik CTA per platform.'
          : 'Belum ada satu pun konten yang ditandai tayang.')
      + '</div></div>';
    return h;
  }

  /* --- kartu pokok --- */
  var imprAda = tot.impr > 0;
  h += '<div class="grid g4">'
    + pkKartu('Reach', PK_NUM(tot.reach),
        'Akun berbeda yang melihat, dijumlahkan dari ' + tot.n + ' konten')
    + pkKartu('Impression', imprAda ? PK_NUM(tot.impr) : '—',
        imprAda ? 'Berapa kali konten muncul — selalu lebih besar daripada reach'
                : 'Belum ada yang mengisi kolom impression')
    + pkKartu('Engagement Rate', pkAggER(tot) == null ? '—' : PK_PCT(pkAggER(tot)) + '%',
        '(likes + komentar + share + save) ÷ ' + PK_NUM(tot.dasar) + ' ' + (tot.dasarImpr ? 'reach/impression' : 'reach'), true)
    + pkKartu('Virality Index', pkAggViral(tot) == null ? '—' : PK_PCT(pkAggViral(tot)) + '%',
        '(share + save) ÷ ' + PK_NUM(tot.dasar) + ' — yang membawa konten ke orang berikutnya')
    + '</div>';
  h += '<div class="grid g4">'
    + pkKartu('CTA Click Rate', pkAggCTR(tot) == null ? '—' : PK_PCT(pkAggCTR(tot)) + '%',
        PK_NUM(tot.cta) + ' klik tautan / tombol ajakan')
    + pkKartu('Engagement', PK_NUM(tot.eng), 'Likes ' + PK_NUM(tot.likes) + ' · Komentar ' + PK_NUM(tot.comments)
        + ' · Share ' + PK_NUM(tot.shares) + ' · Save ' + PK_NUM(tot.saves))
    + pkKartu('Views', PK_NUM(tot.views), 'Penayangan video')
    + pkKartu('Follower Baru', '+' + PK_NUM(tot.follow), 'Pertambahan follower dari ' + tot.n + ' konten')
    + '</div>';

  /* --- yang belum diisi & catatan lama: DIKATAKAN, bukan didiamkan --- */
  if (k.tanpaData) {
    h += '<div class="notice info">ℹ <div><b>' + k.tanpaData + ' konten tayang belum diisi performanya</b> (tidak wajib) '
      + 'pada periode ini, jadi angkanya tidak ikut di halaman ini. Isi lewat halaman '
      + '<b>Input Performa</b> di modul Konten.</div></div>';
  }
  if (k.warisan) {
    h += '<div class="notice info">ℹ <div><b>' + k.warisan + ' konten memakai catatan performa lama</b> '
      + 'yang tidak dipecah per platform. Angkanya IKUT di kartu, tabel pillar, dan peringkat konten, '
      + 'tapi SENGAJA tidak ikut di tabel per platform — memecahnya berarti menebak berapa bagian tiap '
      + 'platform, dan itu tidak pernah dicatat siapa pun.</div></div>';
  }
  if (k.lepas) {
    h += '<div class="notice info">ℹ <div><b>' + k.lepas + ' catatan berada di platform yang sudah tidak '
      + 'terdaftar lagi</b> di kontennya. Angkanya tetap dihitung — membuangnya membuat total halaman ini '
      + 'berubah sendiri tiap kali ada yang membetulkan daftar platform sebuah konten.</div></div>';
  }

  /* --- per platform --- */
  var perPlat = pkPerPlatform(k.baris);
  h += '<div class="card"><h3>Per Platform</h3>'
    + '<div class="card-sub">Semua platform yang didaftarkan tim konten. Satu konten yang tayang di dua '
    + 'platform dihitung di kedua-duanya, jadi kolom <b>konten</b> di sini boleh berjumlah lebih besar '
    + 'daripada jumlah konten di kartu atas.</div>';
  if (!perPlat.length) {
    h += '<div class="empty">Belum ada catatan per platform pada periode ini.</div>';
  } else {
    h += '<div class="tbl-wrap"><table><thead><tr><th>Platform</th><th class="num">Konten</th>'
      + '<th class="num">Reach</th><th class="num">Impression</th><th class="num">Engagement</th>'
      + '<th class="num">Engagement Rate</th><th class="num">Virality Index</th><th class="num">CTA Click Rate</th>'
      + '<th class="num">Follower Baru</th></tr></thead><tbody>';
    perPlat.forEach(function (p) {
      h += '<tr><td><b>' + PK_ESC(p.nama) + '</b></td>'
        + '<td class="num">' + p.a.n + '</td>'
        + '<td class="num">' + PK_NUM(p.a.reach) + '</td>'
        + '<td class="num">' + (p.a.impr ? PK_NUM(p.a.impr) : '<span class="muted">—</span>') + '</td>'
        + '<td class="num">' + PK_NUM(p.a.eng) + '</td>'
        + pkSelRasio(pkAggER(p.a), p.a) + pkSelRasio(pkAggViral(p.a), p.a) + pkSelRasio(pkAggCTR(p.a), p.a)
        + '<td class="num">+' + PK_NUM(p.a.follow) + '</td></tr>';
    });
    h += '</tbody></table></div>';
  }
  h += '</div>';

  /* --- content pillar --- */
  var perPil = pkPerPillar(k.konten);
  h += '<div class="card"><h3>Content Pillar Performance</h3>'
    + '<div class="card-sub">Pillar mana yang benar-benar menggerakkan orang, bukan cuma yang paling '
    + 'sering dibuat. Rasionya dihitung dengan menjumlahkan dulu lalu dibagi — bukan merata-rata persen '
    + 'tiap konten, yang akan memberi bobot sama kepada konten ber-reach 50 dan ber-reach 500.000.</div>'
    + '<div class="tbl-wrap"><table><thead><tr><th>Content Pillar</th><th class="num">Konten</th>'
    + '<th class="num">Reach</th><th class="num">Engagement</th>'
    + '<th class="num">Engagement Rate</th><th class="num">Virality Index</th><th class="num">CTA Click Rate</th>'
    + '</tr></thead><tbody>';
  perPil.forEach(function (p) {
    h += '<tr><td><b>' + PK_ESC(p.nama) + '</b>'
      + (p.nama === PK_TANPA_PILLAR ? '<div class="helper">konten yang pillar-nya belum diisi — tidak ditebak</div>' : '')
      + '</td><td class="num">' + p.a.n + '</td>'
      + '<td class="num">' + PK_NUM(p.a.reach) + '</td>'
      + '<td class="num">' + PK_NUM(p.a.eng) + '</td>'
      + pkSelRasio(pkAggER(p.a), p.a) + pkSelRasio(pkAggViral(p.a), p.a) + pkSelRasio(pkAggCTR(p.a), p.a)
      + '</tr>';
  });
  h += '</tbody></table></div></div>';

  /* --- top konten --- */
  h += '<div class="card"><h3>Top Konten</h3>'
    + '<div style="margin-bottom:12px"><input class="cari" type="search" placeholder="Cari judul, pillar, platform…" '
    + 'value="' + PK_ESC(PK_ST.cari) + '" oninput="pkCari(this.value)"></div>'
    + '<div class="card-sub">Kotak cari ini hanya menyaring tabel di bawahnya — kartu dan kedua tabel di '
    + 'atas tetap menghitung seluruh periode.</div>'
    + '<div id="pk-top">' + pkIsiTop() + '</div></div>';
  return h;
}

/* ===================== HALAMAN: PERFORMA DESAIN ===================== */
/* ---------- REQUEST DESAIN DARI MODUL MARKETING (26 September 2026) ----------
   Permintaan user: "dari marketing juga termasuk, tapi dipisah berapa banyak".

   Sumbernya endpoint BACA yang sudah ada: marketing-api?action=designReqs
   TANPA `aktif=1` — ia memulangkan request yang sudah selesai juga, berikut
   `doneAt` (ISO, ditulis design_req_set()). Tidak ada perubahan backend dan
   tidak ada data yang ditulis. Yang dibatalkan memang tidak pernah ikut
   (disaring server lewat batalAt).

   Dimuat SEKALI per sesi halaman, MALAS (hanya saat Performa Desain dibuka),
   dan satu pemuat untuk kedua tuan rumah. `gagal` ikut menahan pemuatan ulang
   — kalau tidak: fetch gagal → gambar ulang → pemuat dipanggil lagi, selamanya.
   Pelajaran muatReqMkt() di modul Konten.

   HANYA jenis 'design' yang ikut total "desain selesai"; request VIDEO ('edit')
   disebut di kartunya sendiri. Menjumlahkan video ke hitungan desain membuat
   angka yang tidak bisa dibandingkan dengan dua sumber lain di halaman ini. */
var PK_MKT = { st:'idle', list:[], err:'' };
function pkMktUrl() { return (PK_DB && PK_DB.mktApi) || '../marketing-api-mysql/api.php'; }
function pkMuatMkt(paksa) {
  if (paksa) PK_MKT = { st:'idle', list:[], err:'' };
  if (PK_MKT.st !== 'idle') return;
  if (typeof window.fetch !== 'function') { PK_MKT.st = 'gagal'; PK_MKT.err = 'peramban tidak mendukung fetch'; return; }
  PK_MKT.st = 'muat';
  window.fetch(pkMktUrl() + '?action=designReqs&t=' + Date.now(), { method:'GET', redirect:'follow' })
    .then(function (r) { return r.text(); })
    .then(function (t) {
      var j = null; try { j = JSON.parse(t); } catch (e) {}
      if (!j || !j.ok) throw new Error((j && j.error) || 'balasan modul Marketing bukan JSON');
      PK_MKT = { st:'ok', list:((j.data && j.data.reqs) || []), err:'' };
    })
    .catch(function (e) { PK_MKT = { st:'gagal', list:[], err:(e && e.message) || String(e) }; })
    .then(function () { if (PK_ST && typeof PK_ST.gambar === 'function') PK_ST.gambar(); });
}
function pkMktUlang() { pkMuatMkt(true); if (PK_ST && typeof PK_ST.gambar === 'function') PK_ST.gambar(); }
/* Bulan selesai, WIB tetap (+7) — doneAt dari server adalah ISO UTC. */
function pkBulanMkt(r) {
  var d = new Date(String((r && r.doneAt) || ''));
  if (!isNaN(d.getTime())) return new Date(d.getTime() + 7 * 3600 * 1000).toISOString().slice(0, 7);
  var s = String((r && r.deadline) || '');
  return /^\d{4}-\d{2}/.test(s) ? s.slice(0, 7) : '';
}
function pkMktSelesai(bulan) {
  return (PK_MKT.list || []).filter(function (r) {
    return r && r.status === 'done' && (!bulan || pkBulanMkt(r) === bulan);
  });
}
function pkKartuMkt() {
  var h = '<div class="card"><h3>Request dari Modul Marketing</h3>'
    + '<div class="card-sub">Request Design &amp; Video yang diajukan tim Marketing lalu ditandai <b>Selesai</b> '
    + 'di Design Queue / Editing Queue. Dihitung <b>terpisah</b> dari desain konten & tugas mandiri; '
    + 'yang dibatalkan Marketing tidak ikut.</div>';
  if (PK_MKT.st === 'idle' || PK_MKT.st === 'muat') return h + '<div class="empty">Memuat request dari modul Marketing…</div></div>';
  if (PK_MKT.st === 'gagal') {
    return h + '<div class="notice warn">⚠ <div><b>Request dari modul Marketing tidak terbaca</b> — ' + PK_ESC(PK_MKT.err)
      + '. Angka di kartu atas karena itu <b>belum</b> memuatnya.'
      + '<div style="margin-top:8px"><button type="button" class="btn btn-ghost btn-sm" onclick="pkMktUlang()">Coba lagi</button></div></div></div></div>';
  }
  var list = pkMktSelesai(PK_ST.bulan);
  var des = list.filter(function (r) { return r.jenis !== 'edit'; });
  var vid = list.length - des.length;
  h += '<div class="grid g4">'
    + pkKartu('Desain dari Marketing', PK_NUM(des.length), 'ikut dihitung di total desain selesai', true)
    + pkKartu('Video dari Marketing', PK_NUM(vid), 'Editing Queue — tidak ikut total desain')
    + pkKartu('Total Request Selesai', PK_NUM(list.length), PK_ST.bulan ? 'Pada ' + PK_ESC(pkNamaBulan(PK_ST.bulan)) : 'Seluruh periode')
    + pkKartu('Masih di Antrian', PK_NUM((PK_MKT.list || []).filter(function (r) { return r && r.status !== 'done'; }).length),
        'request Marketing yang belum selesai (semua bulan)')
    + '</div>';
  if (!list.length) return h + '<div class="empty">Belum ada request Marketing yang selesai pada periode ini.</div></div>';
  /* Per pemohon — siapa yang paling banyak meminta. */
  var peta = {};
  list.forEach(function (r) {
    var k = String(r.pemohon || '').trim() || '(tanpa nama)';
    if (!peta[k]) peta[k] = { d:0, v:0 };
    if (r.jenis === 'edit') peta[k].v++; else peta[k].d++;
  });
  var nama = Object.keys(peta).sort(function (a, b) { return (peta[b].d + peta[b].v) - (peta[a].d + peta[a].v) || a.localeCompare(b); });
  h += '<div class="tbl-wrap"><table><thead><tr><th>Pemohon (Marketing)</th><th class="num">Desain</th>'
    + '<th class="num">Video</th><th class="num">Total</th></tr></thead><tbody>'
    + nama.map(function (n) {
        return '<tr><td><b>' + PK_ESC(n) + '</b></td><td class="num">' + peta[n].d + '</td><td class="num">'
          + peta[n].v + '</td><td class="num"><b>' + (peta[n].d + peta[n].v) + '</b></td></tr>';
      }).join('')
    + '</tbody></table></div>';
  return h + '</div>';
}

function pkIsiKatDesain() {
  var rows = pkDesainRows(PK_DB).filter(function (r) {
    return !PK_ST.bulan || pkBulanDesain(r) === PK_ST.bulan;
  });
  var hasil = pkDesainKategori(rows, PK_ST.kat);
  var nama = (PK_KAT[PK_ST.kat] || PK_KAT.pillar).t;
  var h = pkSeg(PK_ST.kat, [['pillar','Content Pillar'],['tipe','Jenis Konten'],['cetak','Jenis Cetak']], 'pkKat');
  if (!hasil.list.length) {
    return h + '<div class="empty">Belum ada pekerjaan desain yang ditandai selesai pada periode ini.</div>';
  }
  h += '<div class="tbl-wrap"><table><thead><tr><th>' + PK_ESC(nama) + '</th>'
    + '<th class="num">Desain Selesai</th><th class="num">Dari Konten</th><th class="num">Tugas Mandiri</th>'
    + '</tr></thead><tbody>';
  hasil.list.forEach(function (r) {
    h += '<tr><td><b>' + PK_ESC(r.nama) + '</b>'
      + (r.nama === PK_TANPA_KAT
          ? '<div class="helper">tugas desain mandiri &amp; konten yang jenisnya belum diisi — tidak ditebak</div>' : '')
      + '</td><td class="num"><b>' + r.n + '</b></td>'
      + '<td class="num">' + r.konten + '</td><td class="num">' + r.mandiri + '</td></tr>';
  });
  h += '</tbody></table></div>';
  h += '<div class="card-sub" style="margin:12px 0 0">Total baris tabel ini <b>'
    + hasil.list.reduce(function (s, r) { return s + r.n; }, 0) + '</b> untuk <b>' + rows.length
    + '</b> pekerjaan desain'
    + (hasil.ganda
        ? '. <b>Kolomnya tidak bisa dijumlahkan</b>: ' + hasil.ganda + ' pekerjaan punya lebih dari satu '
          + PK_ESC(nama.toLowerCase()) + ' dan dihitung di tiap-tiapnya — dijepit ke yang pertama saja, '
          + 'sisanya lenyap dari daftar tanpa satu pun tanda.'
        : '.')
    + '</div>';
  return h;
}

function pkPanelDesain() {
  var rowsSemua = pkDesainRows(PK_DB);
  var bulanAda = {};
  rowsSemua.forEach(function (r) { var b = pkBulanDesain(r); if (b) bulanAda[b] = 1; });
  pkMuatMkt();
  pkMktSelesai('').forEach(function (r) { var b = pkBulanMkt(r); if (b) bulanAda[b] = 1; });
  var mktOk = PK_MKT.st === 'ok';
  var desMkt = mktOk ? pkMktSelesai(PK_ST.bulan).filter(function (r) { return r.jenis !== 'edit'; }).length : 0;
  var rows = rowsSemua.filter(function (r) { return !PK_ST.bulan || pkBulanDesain(r) === PK_ST.bulan; });
  var dariKonten = rows.filter(function (r) { return r.src === 'konten'; }).length;
  var mandiri = rows.length - dariKonten;
  var tanpaCap = rows.filter(function (r) { return !r.doneAt; }).length;

  var h = '';
  h += '<div class="card"><div style="display:flex;gap:12px;flex-wrap:wrap;align-items:center">'
    + pkPilihBulan(bulanAda) + '</div>'
    + '<div class="card-sub" style="margin:12px 0 0">Yang dihitung pekerjaan desain yang sudah ditandai '
    + '<b>Selesai</b> di Design Queue — dari konten, tugas mandiri, <b>dan request dari modul Marketing</b>. '
    + 'Request Marketing dihitung <b>terpisah</b> di kartunya sendiri (dan di kartu di bawah), jadi '
    + 'jumlah ketiganya bisa dicocokkan satu per satu.</div></div>';

  /* --- kartu --- */
  h += '<div class="grid g4">'
    + pkKartu('Desain Selesai', PK_NUM(rows.length + desMkt),
        (PK_ST.bulan ? 'Pada ' + PK_ESC(pkNamaBulan(PK_ST.bulan)) : 'Seluruh periode')
        + (mktOk ? ' · termasuk request Marketing' : ' · request Marketing belum terbaca'), true)
    + pkKartu('Dari Konten', PK_NUM(dariKonten), 'Konten yang ditandai butuh desain')
    + pkKartu('Tugas Mandiri', PK_NUM(mandiri), 'Pekerjaan desain di luar konten')
    + pkKartu('Request Marketing', mktOk ? PK_NUM(desMkt) : '—',
        mktOk ? 'Request desain dari modul Marketing (video tidak ikut)' : 'sedang dimuat / belum terbaca')
    + '</div>';
  h += pkKartuMkt();
  if (tanpaCap) {
    h += '<div class="notice info">ℹ <div><b>' + tanpaCap + ' pekerjaan tidak punya tanggal selesai.</b> '
      + 'Jejak itu baru mulai dicatat 18 September 2026; yang ditandai selesai sebelum itu dihitung '
      + 'memakai <b>tanggal deadline desainnya</b> — bulan yang tertera bisa berbeda dari bulan ia '
      + 'benar-benar dikerjakan. Yang ditandai selesai mulai sekarang tidak lagi begitu.</div></div>';
  }

  /* --- virality: pakai desain vs tidak --- */
  var k = pkKumpul((PK_DB.content || []), { bulan:PK_ST.bulan });
  var b = pkBandingDesain(k);
  h += '<div class="card"><h3>Virality Index — Konten Berdesain vs Tanpa Desain</h3>'
    + '<div class="card-sub">(share + save) ÷ reach. Angka konten berdesain yang berdiri sendirian tidak '
    + 'menjawab apa pun — bagus atau biasa saja baru terbaca setelah ada pembandingnya.</div>';
  if (!b.pakai.n && !b.tanpa.n) {
    h += '<div class="notice warn">⚠ <div><b>Belum ada angka performa pada periode ini</b>, jadi virality-nya '
      + 'belum bisa dihitung. Isi lewat halaman <b>Input Performa</b> di modul Konten.</div></div>';
  } else {
    var vp = pkAggViral(b.pakai), vt = pkAggViral(b.tanpa);
    h += '<div class="grid g4">'
      + pkKartu('Pakai Desain', vp == null ? '—' : PK_PCT(vp) + '%',
          b.pakai.n + ' konten · reach ' + PK_NUM(b.pakai.dasar), true)
      + pkKartu('Tanpa Desain', vt == null ? '—' : PK_PCT(vt) + '%',
          b.tanpa.n + ' konten · reach ' + PK_NUM(b.tanpa.dasar))
      + pkKartu('Selisih', (vp == null || vt == null) ? '—'
          : (vp - vt >= 0 ? '+' : '−') + PK_PCT(Math.abs(vp - vt)) + ' poin',
          (vp == null || vt == null)
            ? 'Salah satu sisi belum punya reach, jadi tidak ada yang bisa dibandingkan'
            : 'Selisih poin persen, bukan persen dari persen')
      + pkKartu('Engagement Rate Berdesain', pkAggER(b.pakai) == null ? '—' : PK_PCT(pkAggER(b.pakai)) + '%',
          'Pembandingnya ' + (pkAggER(b.tanpa) == null ? '—' : PK_PCT(pkAggER(b.tanpa)) + '%') + ' tanpa desain')
      + '</div>';
    h += '<div class="notice info">ℹ <div><b>Ini bukan sebab-akibat.</b> Desain dipakai justru untuk konten '
      + 'yang sejak awal dianggap penting — promo, event, pengumuman — dan konten seperti itu memang '
      + 'lebih banyak dibagikan tanpa desain apa pun. Selisihnya menunjukkan ke mana harus melihat, '
      + 'bukan membuktikan desainnya yang menyebabkan.</div></div>';
    if (!b.tanpa.n) {
      h += '<div class="notice warn">⚠ <div>Seluruh konten pada periode ini memakai desain, jadi tidak ada '
        + 'pembandingnya. Angka di sebelah kiri tetap benar; yang tidak ada cuma sisi kanannya.</div></div>';
    }
  }
  h += '</div>';

  /* --- per kategori --- */
  h += '<div class="card"><h3>Desain Selesai per Kategori</h3>'
    + '<div class="card-sub">Kategori diambil dari kontennya sendiri: Content Pillar, jenis kontennya '
    + '(Reel / Feed / Story), atau jenis cetaknya (A4 / X Banner / Voucher). Request Marketing tidak '
    + 'punya kategori itu, jadi ia tidak ikut di tabel ini — jumlahnya ada di kartu Request dari Modul Marketing.</div>'
    + '<div id="pk-katdesain">' + pkIsiKatDesain() + '</div></div>';
  return h;
}

/* ===================== EKSPOR =====================
   WAJIB diekspor walau seluruh pemakaian di dalam berkas ini sudah lewat
   closure: tuan rumah memanggilnya dari onclick — dan onclick dijalankan di
   lingkup global, bukan di dalam pembungkus ini. Satu nama yang lupa diekspor
   membuat tombolnya ditekan tanpa reaksi apa pun, atau (kalau ia dipanggil
   saat menggambar) meninggalkan HALAMAN SEBELUMNYA di layar — gejala yang
   sudah dibayar pbCompCocok pada 8 September 2026.

   Yang menjaganya bukan ingatan: tools/uji-performa-konten.js memindai kedua
   tuan rumah dan menuntut tiap nama berawalan pk / PK_ yang mereka panggil ada
   di daftar ini. */
window.pkPasang       = pkPasang;
window.pkPanelKonten  = pkPanelKonten;
window.pkPanelDesain  = pkPanelDesain;
window.pkHitungPost   = pkHitungPost;
window.pkMktUlang     = pkMktUlang;
window.pkSet          = pkSet;
window.pkCari         = pkCari;
window.pkUrut         = pkUrut;
window.pkKat          = pkKat;
window.pkPlat         = pkPlat;
window.pkTipeKonten   = pkTipeKonten;
window.pkTipeCetak    = pkTipeCetak;
window.pkBarisKonten  = pkBarisKonten;
window.pkAdaData      = pkAdaData;
window.pkBulanKonten  = pkBulanKonten;
window.pkRapikan      = pkRapikan;
window.pkKosong       = pkKosong;
window.pkNamaBulan    = pkNamaBulan;
window.pkER           = pkER;
window.pkViral        = pkViral;
window.pkCTR          = pkCTR;
window.pkEngagement   = pkEngagement;
window.pkPersen       = PK_PCT;
window.PK_FIELD       = PK_FIELD;
window.PK_ANGKA       = PK_ANGKA;
/* Diekspor KHUSUS untuk uji: dipanggil langsung oleh tools/uji-performa-konten.js.
   Tanpa ini ujinya harus menulis ulang rumusnya — dan uji yang menulis ulang
   rumus yang diujinya tidak menguji apa pun. */
window.PK_UJI = {
  pkDasar:pkDasar, pkDasarLabel:pkDasarLabel, pkEngagement:pkEngagement, pkViralJml:pkViralJml,
  pkER:pkER, pkViral:pkViral, pkCTR:pkCTR, pkNormPlat:pkNormPlat,
  pkKumpul:pkKumpul, pkTotal:pkTotal, pkPerPlatform:pkPerPlatform, pkPerPillar:pkPerPillar,
  pkUrutKonten:pkUrutKonten, pkAggER:pkAggER, pkAggViral:pkAggViral, pkAggCTR:pkAggCTR,
  pkDesainRows:pkDesainRows, pkDesainKategori:pkDesainKategori, pkBandingDesain:pkBandingDesain,
  pkBulanDesain:pkBulanDesain, pkDesainPakai:pkDesainPakai,
  PK_TANPA_PILLAR:PK_TANPA_PILLAR, PK_TANPA_KAT:PK_TANPA_KAT, PK_WARISAN:PK_WARISAN,
  PK_FIELD_K:PK_FIELD_K, PK_KAT:PK_KAT, PK_URUT:PK_URUT
};
})();
