/* uji-bonus-marketing.js — Bonus Marketing di Performa Marketing (panel Kas Kecil)
 *
 *   node tools/uji-bonus-marketing.js
 *
 * TANPA jsdom, dan itu disengaja: seluruh hitungan bonus di halaman ini fungsi
 * MURNI yang memulangkan angka atau string HTML — tidak satu pun menyentuh DOM.
 * Ujinya MEMOTONG fungsinya dari deploy/finance/kas/index.html lalu
 * menjalankannya, bukan menyalin rumusnya ke sini. Uji yang menyalin rumus cuma
 * mengulang asumsi yang sama dengan kode yang diujinya, dan tidak akan pernah
 * ikut basi kalau kodenya berubah — persis alasan yang sama dengan
 * tools/uji-openbill-performa.js.
 *
 * Yang dijaga:
 *   1. TANGGA TIDAK BOLEH BERLUBANG. Dokumen SDM-nya punya celah
 *      (Rp200.000.001–Rp201.000.000 tidak disebut baris mana pun) dan tumpang
 *      tindih (Rp150.000.000 diklaim dua baris). Yang diperiksa di sini bukan
 *      angka hasil salinan, melainkan INVARIAN: bonus tidak boleh pernah TURUN
 *      waktu omsetnya NAIK. Tangga berlubang gagal di situ tanpa perlu ada yang
 *      hafal batas-batasnya.
 *   2. Skema 1+2+3 diakumulasi, Skema 4 TIDAK ikut. Voucher yang diam-diam
 *      masuk rupiah bonus adalah uang yang dijanjikan tapi tidak pernah cair.
 *   3. Tiap event dihitung SEKALI di tangga tertingginya (Skema 1 & voucher).
 *   4. Event tanpa jenis BUKAN corporate, dan jumlahnya dilaporkan.
 *   5. srcJenis di deploy/finance/omset/ dan yang dibaca di kas adalah BERKAS
 *      KEMBAR — nama kuncinya dibandingkan langsung dari kedua sumbernya.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const AKAR = path.join(__dirname, '..');
const KAS   = path.join(AKAR, 'deploy/finance/kas/index.html');
const OMSET = path.join(AKAR, 'deploy/finance/omset/index.html');

let ok = 0, gagal = 0;
function cek(nama, syarat, ket) {
  if (syarat) { ok++; console.log('  OK   ' + nama); }
  else { gagal++; console.log('  GAGAL ' + nama + (ket ? '  — ' + ket : '')); }
}
function sama(nama, dapat, harap) {
  cek(nama, dapat === harap, 'dapat ' + JSON.stringify(dapat) + ', harusnya ' + JSON.stringify(harap));
}

/* ---------- potong fungsinya dari sumber ---------- */
/* Dinormalkan ke LF: berkasnya CRLF, dan penanda potongnya multi-baris. */
const LF = t => t.replace(/\r\n/g, '\n');
const kas = LF(fs.readFileSync(KAS, 'utf8'));

function potong(teks, mulai, akhir, label) {
  const a = teks.indexOf(mulai);
  if (a < 0) throw new Error('tidak ketemu di sumber: ' + label + ' (' + mulai.slice(0, 60) + ')');
  const b = teks.indexOf(akhir, a);
  if (b < 0) throw new Error('penutup tidak ketemu: ' + label);
  return teks.slice(a, b + akhir.length);
}

/* Helper yang dipakai kartu-kartunya. Ikut DIPOTONG, tidak ditulis ulang: yang
   membedakan hasil bisa saja justru di sini (fmtRp memakai locale id-ID). */
const helper = [
  potong(kas, "const fmtRp=", "\n", 'fmtRp'),
  potong(kas, "const num=v=>", "\n", 'num'),
  potong(kas, "const esc=s=>", "\n", 'esc'),
].join('');

/* Seluruh blok bonus, dari komentar kepalanya sampai penutup kartuBonusMk(). */
const blok = potong(kas,
  '/* ============ BONUS MARKETING ============',
  '+kartuSkema4(info,pid,list);\n}',
  'blok bonus marketing');

cek('blok bonus marketing ada di deploy/finance/kas/', blok.length > 3000,
    'panjangnya cuma ' + blok.length);

/* ketOffice() hidup jauh di bawah dan membaca KET_MAP (peta Tim/Keterangan dari
   Office). Yang diuji di sini BUKAN ketOffice-nya — itu milik Performa Kasir —
   melainkan mkLeader() yang membacanya, jadi petanya disediakan uji ini. */
const jalan = new Function('KET_TIRUAN', `
  ${helper}
  function ketOffice(e){
    if(!e) return null;
    if(KET_TIRUAN && Object.prototype.hasOwnProperty.call(KET_TIRUAN,e.name)) return KET_TIRUAN[e.name];
    return null;
  }
  ${blok}
  return { bonusMarketing, bonusS2, mkCorporate, mkTangga, mkLeader,
           kartuBonusMk, kartuSkema1, kartuSkema2, kartuSkema3, kartuSkema4,
           MK_S2, MK_S3, MK_S1_JUMLAH, MK_S1_EVENT, MK_S4_VOUCHER,
           MK_S1_MIN_EVENT, MK_S4_CUTI_MIN, MK_S4_CUTI_PER, MK_S4_TOP };
`);

/* ---------- data uji ----------
   Dirancang supaya tiap kesalahan punya tempat untuk muncul:
     - Ayu  : 2 event corporate besar (Rp80jt & Rp35jt) + 1 wedding besar
     - Budi : 1 event corporate pas di ambang, sisanya kecil
     - Citra: TIDAK punya event sama sekali — pembagi Skema 1 tidak boleh
              menghitungnya, dan bonus Skema 1-nya harus nol
     - Dewi : leader, event sedang
   Nominalnya sengaja tidak bulat supaya angka yang kebetulan cocok karena
   pembulatan tidak lolos. */
function ev(nama, porsi, jenis) { return { date: '2026-09-01', name: nama, porsi: porsi, jenis: jenis || '' }; }

const list = [
  { id: 'a', name: 'Ayu' }, { id: 'b', name: 'Budi' },
  { id: 'c', name: 'Citra' }, { id: 'd', name: 'Dewi' },
];
const agg = {
  a: { real: 155000000, events: [ ev('Gala Corp', 80000000, 'Corporate Event'),
                                  ev('Rapat Corp', 35000000, 'Corporate Event'),
                                  ev('Nikahan', 40000000, 'Wedding') ] },
  b: { real: 121000000, events: [ ev('Corp Kecil', 20000000, 'Corporate Event'),
                                  ev('Ultah', 5000000, 'Birthday'),
                                  ev('Manual', 96000000, '') ] },
  c: { real: 0, events: [] },
  d: { real: 60000000, events: [ ev('Corp Sedang', 30000000, 'Corporate Event'),
                                 ev('Seminar', 30000000, 'Seminar') ] },
};
const KET = { Ayu: 'Marketing', Budi: 'Marketing', Citra: 'Marketing', Dewi: 'Marketing, Leader' };

const M = jalan(KET);
const info = M.bonusMarketing(list, agg);

/* ---------- 1. corporate vs bukan ---------- */
console.log('\n-- Jenis event --');
cek('"Corporate Event" terbaca corporate', M.mkCorporate({ jenis: 'Corporate Event' }));
cek('"corporate event" (huruf kecil) juga', M.mkCorporate({ jenis: 'corporate event' }));
cek('"Wedding" BUKAN corporate', !M.mkCorporate({ jenis: 'Wedding' }));
cek('jenis KOSONG bukan corporate (baris manual & VIP tidak ditebak)', !M.mkCorporate({ jenis: '' }));
cek('jenis tak ada sama sekali bukan corporate', !M.mkCorporate({}));
sama('4 event corporate terkumpul', info.corp.length, 4);
sama('1 event tanpa jenis dilaporkan', info.tanpaJenis, 1);
sama('total event tim', info.jumEvent, 8);

/* ---------- 2. Skema 1 ---------- */
console.log('\n-- Skema 1 (pool tim) --');
sama('4 corporate lolos ambang Rp20 juta', info.s1.lolos.length, 4);
cek('tangga 5 event BELUM tercapai (baru 4)', info.s1.jum === null,
    'malah dapat ' + JSON.stringify(info.s1.jum));
/* Rp80jt -> Rp500.000 (tangga 70jt), Rp35jt & Rp30jt -> Rp300.000, Rp20jt -> nol */
sama('pool = 500.000 + 300.000 + 300.000', info.s1.pool, 1100000);
sama('pembagi = 3 PIC yang punya event (Citra tidak ikut)', info.s1.bagi, 3);
sama('per PIC', info.s1.perPic, Math.floor(1100000 / 3));
sama('Citra tidak dapat Skema 1', info.per.c.s1, 0);
sama('Ayu dapat Skema 1', info.per.a.s1, Math.floor(1100000 / 3));

/* Event Rp80jt tidak boleh dihitung DUA KALI (tangga 70jt + tangga 30jt). */
const ev80 = info.s1.ev.filter(x => x.ev.porsi === 80000000);
sama('event Rp80 juta dihitung SEKALI', ev80.length, 1);
sama('...dan di tangga tertingginya (Rp500.000)', ev80[0].t.bonus, 500000);

/* Tambah satu corporate besar lagi sampai tangga 5 event menyala. */
(function () {
  const agg2 = JSON.parse(JSON.stringify(agg));
  agg2.d.events.push(ev('Corp Ke-5', 25000000, 'Corporate Event'));
  const i2 = M.bonusMarketing(list, agg2);
  sama('5 corporate -> tangga jumlah menyala', i2.s1.jum && i2.s1.jum.bonus, 500000);
  sama('...pool naik persis sebesar bonus tangganya', i2.s1.pool - info.s1.pool, 500000);
})();

/* Tangga jumlah TIDAK berlipat: 10 event tidak juga menerima bonus baris 5. */
(function () {
  const agg3 = { a: { real: 0, events: [] }, b: { real: 0, events: [] },
                 c: { real: 0, events: [] }, d: { real: 0, events: [] } };
  for (let i = 0; i < 10; i++) agg3.a.events.push(ev('C' + i, 21000000, 'Corporate Event'));
  const i3 = M.bonusMarketing(list, agg3);
  sama('10 event corporate -> tangga Rp2.000.000', i3.s1.jum.bonus, 2000000);
  sama('...dan TIDAK ditambah bonus baris 5 event', i3.s1.pool, 2000000);
})();

/* ---------- 3. Skema 2 — invarian tangga ---------- */
console.log('\n-- Skema 2 (tangga per PIC) --');
sama('Ayu Rp155 juta -> Rp500.000', info.per.a.s2.bonus, 500000);
sama('Budi Rp121 juta -> Rp250.000', info.per.b.s2.bonus, 250000);
sama('Dewi Rp60 juta -> belum masuk tangga', info.per.d.s2.bonus, 0);
sama('tepat Rp150.000.000 diberi yang LEBIH BESAR', M.bonusS2(150000000).bonus, 500000);
sama('celah dokumen Rp200.000.001 masuk tangga di atasnya', M.bonusS2(200000001).bonus, 750000);
sama('tepat Rp200.000.000 masih tangga Rp500.000', M.bonusS2(200000000).bonus, 500000);
sama('di atas Rp350 juta -> tangga teratas', M.bonusS2(400000000).bonus, 1500000);

/* INVARIAN, bukan salinan angka: omset naik tidak boleh pernah menurunkan
   bonus. Inilah yang menangkap celah/tumpang tindih tangga tanpa perlu ada
   yang hafal batasnya. Disapu Rp1 juta sekali sampai Rp600 juta, plus tiap
   titik batas dan tetangga persisnya. */
(function () {
  const titik = [];
  for (let n = 0; n <= 600000000; n += 1000000) titik.push(n);
  M.MK_S2.forEach(t => { titik.push(t.min - 1, t.min, t.min + 1); });
  titik.sort((x, y) => x - y);
  let turun = null, sebelum = -1;
  titik.forEach(n => {
    const b = M.bonusS2(n).bonus;
    if (b < sebelum && turun === null) turun = n;
    sebelum = Math.max(sebelum, b);
  });
  cek('Skema 2 monoton — bonus tidak pernah turun saat omset naik', turun === null,
      'turun di ' + turun);
})();

/* `next` harus menunjuk tangga DI ATAS, bukan di bawah — kalimat "kurang
   sekian lagi" di layar dihitung darinya. */
(function () {
  const b = M.bonusS2(155000000);
  cek('next menunjuk tangga di atasnya', b.next && b.next.bonus === 750000,
      JSON.stringify(b.next));
  const atas = M.bonusS2(999000000);
  cek('di tangga teratas, next kosong', atas.next === null);
  const bawah = M.bonusS2(0);
  cek('belum masuk tangga -> next = tangga terendah', bawah.next && bawah.next.bonus === 250000);
})();

/* ---------- 4. Skema 3 ---------- */
console.log('\n-- Skema 3 (omset tim & leader) --');
sama('omset tim = jumlah realisasi semua PIC', info.s3.total, 155000000 + 121000000 + 0 + 60000000);
cek('Rp336 juta -> tangga Rp300–350 juta', info.s3.tier && info.s3.tier.leader === 500000,
    JSON.stringify(info.s3.tier));
sama('Dewi terbaca leader', info.leaderIds.join(','), 'd');
sama('Dewi dapat nominal LEADER', info.per.d.s3, 500000);
sama('Ayu dapat nominal TIM', info.per.a.s3, 250000);
cek('"Marketing" polos bukan leader', !M.mkLeader({ name: 'Ayu' }));
cek('Office belum menjawab -> TIDAK ada yang dianggap leader',
    !M.mkLeader({ name: 'Orang Asing' }));
sama('tepat di batas Rp350 juta diberi tangga yang lebih besar',
     M.mkTangga(M.MK_S3, 350000000).leader, 1000000);
sama('"Rp 4.00.0000" dibaca Rp4.000.000', M.MK_S3[0].leader, 4000000);

/* Skema 3 juga tidak boleh berlubang, untuk KEDUA kolomnya. */
(function () {
  ['leader', 'tim'].forEach(kol => {
    let turun = null, sebelum = -1;
    for (let n = 0; n <= 700000000; n += 500000) {
      const t = M.mkTangga(M.MK_S3, n); const b = t ? t[kol] : 0;
      if (b < sebelum && turun === null) turun = n;
      sebelum = Math.max(sebelum, b);
    }
    cek('Skema 3 kolom ' + kol + ' monoton', turun === null, 'turun di ' + turun);
  });
})();

/* ---------- 5. akumulasi 1+2+3, dan Skema 4 TIDAK ikut ---------- */
console.log('\n-- Akumulasi --');
list.forEach(e => {
  const p = info.per[e.id];
  sama('tunai ' + e.name + ' = Skema 1 + 2 + 3', p.tunai, p.s1 + p.s2.bonus + p.s3);
});
cek('voucher TIDAK masuk bonus tunai',
    info.per.a.voucher > 0 && info.per.a.tunai === info.per.a.s1 + info.per.a.s2.bonus + info.per.a.s3,
    'voucher Ayu ' + info.per.a.voucher);
sama('tunaiSemua = jumlah tunai tiap PIC',
     info.tunaiSemua, list.reduce((s, e) => s + info.per[e.id].tunai, 0));

/* ---------- 6. Skema 4 ---------- */
console.log('\n-- Skema 4 (non-tunai) --');
/* Ayu: Rp80jt -> voucher Rp200.000; Rp40jt & Rp35jt -> Rp100.000 masing-masing */
sama('voucher Ayu', info.per.a.voucher, 200000 + 100000 + 100000);
sama('event Rp80 juta dapat voucher Rp200.000 saja, bukan Rp300.000',
     info.per.a.vJml[56000000], 1);
sama('...dan tidak ikut terhitung di tangga Rp20 juta', info.per.a.vJml[20000000], 2);
/* Budi: Rp20jt (pas ambang) + Rp96jt manual -> dua voucher; Rp5jt tidak */
sama('voucher Budi — event tepat di ambang tetap dapat', info.per.b.voucher, 200000 + 100000);
sama('Citra tanpa event -> tanpa voucher', info.per.c.voucher, 0);
/* cuti: event >= Rp50 juta. Ayu punya 1 (Rp80jt), Budi 1 (Rp96jt) */
sama('Ayu 1 event besar -> belum genap 3, cuti 0', info.per.a.cuti, 0);
sama('...tapi jumlah event besarnya tetap dilaporkan', info.per.a.evBesar, 1);
(function () {
  const agg4 = JSON.parse(JSON.stringify(agg));
  agg4.a.events.push(ev('Besar 2', 51000000, 'Wedding'), ev('Besar 3', 52000000, 'Gathering'));
  const i4 = M.bonusMarketing(list, agg4);
  sama('3 event besar -> 1 hari cuti', i4.per.a.cuti, 1);
  cek('cuti tidak dibulatkan ke atas dari 4 event', (function () {
    const a5 = JSON.parse(JSON.stringify(agg4));
    a5.a.events.push(ev('Besar 4', 53000000, 'Wedding'));
    return M.bonusMarketing(list, a5).per.a.cuti === 1;
  })());
  cek('cuti tidak ikut menambah bonus tunai', i4.per.a.tunai === i4.per.a.s1 + i4.per.a.s2.bonus + i4.per.a.s3);
})();
cek('Top Marketer belum tercapai di data ini', info.topSemua.length === 0, info.topSemua.join(','));
(function () {
  const agg5 = JSON.parse(JSON.stringify(agg));
  agg5.a.real = 350000000;
  const i5 = M.bonusMarketing(list, agg5);
  sama('realisasi Rp350 juta -> Top Marketer', i5.topSemua.join(','), 'Ayu');
})();

/* ---------- 7. kartunya benar-benar digambar ---------- */
console.log('\n-- Kartu di layar --');
const html = M.kartuBonusMk(info, 'a', list[0], agg.a, list);
cek('kartu tergambar untuk satu PIC', html.length > 2000);
['Skema 1', 'Skema 2', 'Skema 3', 'Skema 4'].forEach(t =>
  cek('kartu menyebut ' + t, html.indexOf(t) > -1));
cek('mengatakan Skema 4 berdiri sendiri', /Skema 4 berdiri sendiri/.test(html));
cek('menyebut pembagi pool berikut angkanya', /Dibagi ke 3 PIC/.test(html));

/* KETERANGAN KOTAK HARUS COCOK DENGAN ANGKANYA. Bonus tunai gabungan
   dijumlahkan dari SELURUH roster (Skema 3 diterima juga oleh PIC yang belum
   punya event periode itu), sedangkan pembagi pool Skema 1 mengecualikan
   mereka. Sempat memakai angka pembagi sebagai keterangan, jadi kotaknya
   memajang jumlah 4 orang dengan tulisan "3 PIC" — dua angka yang tidak cocok
   di satu kotak akan dilaporkan sebagai salah hitung. */
(function () {
  const semua = M.kartuBonusMk(info, '__all__', { name: 'Semua PIC' },
      { real: info.s3.total, events: [] }, list);
  sama('jumPic = seluruh roster, bukan pembagi Skema 1', info.jumPic, list.length);
  cek('jumPic memang berbeda dari pembagi Skema 1 di data uji ini',
      info.jumPic !== info.s1.bagi, 'keduanya sama, uji ini tidak menguji apa pun');
  cek('keterangan kotak gabungan menyebut jumlah PIC yang benar',
      new RegExp('jumlah bonus tunai ' + info.jumPic + ' PIC').test(semua));
  cek('...dan BUKAN pembagi Skema 1',
      !new RegExp('jumlah bonus tunai ' + info.s1.bagi + ' PIC').test(semua));
  /* PIC tanpa event tetap menerima Skema 3, dan itu harus DIKATAKAN — bukan
     diam-diam, karena itu uang untuk orang yang tidak menangani apa pun. */
  cek('PIC tanpa event tetap dapat Skema 3', info.per.c.tunai === info.per.c.s3 && info.per.c.s3 > 0);
  cek('...dan layarnya mengatakan itu', /termasuk yang periode ini belum punya event/.test(semua));
})();
/* Angka yang dipajang harus angka yang dihitung — bukan sekadar ada tulisan
   "Rp" di halaman. Kalau kartunya memajang nilai lain daripada info.per, yang
   membacanya menyiapkan pembayaran sebesar angka di layar. */
(function () {
  const p = info.per.a;
  const rp = n => 'Rp' + Math.round(n).toLocaleString('id-ID');
  cek('kartu memajang bonus tunai yang sama dengan yang dihitung',
      html.indexOf(rp(p.tunai)) > -1, 'mencari ' + rp(p.tunai));
  cek('rincian Skema 1/2/3 ikut disebut angkanya',
      html.indexOf(rp(p.s1)) > -1 && html.indexOf(rp(p.s2.bonus)) > -1 && html.indexOf(rp(p.s3)) > -1);
  cek('nilai voucher dipajang di kartu Skema 4', html.indexOf(rp(p.voucher)) > -1);
})();

/* SELURUH nominal ditulis penuh — permintaan user. Bentuk singkat "Rp20jt" /
   "Rp 20 juta" tidak boleh muncul satu pun di kartu bonus. */
(function () {
  const semuaKartu = M.kartuBonusMk(info, '__all__', { name: 'Semua PIC' },
      { real: info.s3.total, events: [] }, list)
    + M.kartuBonusMk(info, 'd', list[3], agg.d, list);
  const singkat = semuaKartu.match(/Rp\s?\d{1,3}\s?(jt|juta|rb|M)\b/gi);
  cek('tidak ada nominal bentuk singkat di kartu bonus', singkat === null,
      'ketemu: ' + (singkat || []).join(', '));
  cek('segmen Semua tergambar tanpa melempar', semuaKartu.length > 4000);
  cek('segmen Semua tidak memakai tangga Skema 2 gabungan',
      /Dinilai per PIC/.test(semuaKartu));
})();

/* Leader kosong & leader ganda harus DIKATAKAN, bukan didiamkan. */
(function () {
  const tanpaLeader = jalan({ Ayu: 'Marketing', Budi: 'Marketing', Citra: 'Marketing', Dewi: 'Marketing' });
  const i = tanpaLeader.bonusMarketing(list, agg);
  sama('tanpa leader, tidak ada yang dianggap leader', i.leaderIds.length, 0);
  cek('layar mengatakan leader belum ditentukan',
      /Leader belum ditentukan/.test(tanpaLeader.kartuSkema3(i, list, 'a')));
  sama('semua PIC memakai nominal tim', i.per.d.s3, 250000);

  /* Office BELUM MENJAWAB tidak boleh berbunyi sama dengan "leader belum
     ditentukan": yang pertama menyuruh menunggu, yang kedua menyuruh menyunting
     Office. Bentuk datanya identik (leaderIds kosong), jadi yang membedakan
     cuma ketAda — dan kalau itu lepas, tidak ada satu pun galat. */
  const sepi = jalan(null);
  const iSepi = sepi.bonusMarketing(list, agg);
  cek('Office belum menjawab -> ketAda false', iSepi.ketAda === false);
  cek('...layarnya menyuruh MENUNGGU, bukan menyunting Office',
      /belum termuat/.test(sepi.kartuSkema3(iSepi, list, 'a'))
      && !/Leader belum ditentukan/.test(sepi.kartuSkema3(iSepi, list, 'a')));
  cek('Office menjawab tapi tanpa leader -> ketAda true',
      tanpaLeader.bonusMarketing(list, agg).ketAda === true);

  const duaLeader = jalan({ Ayu: 'Marketing Leader', Budi: 'Marketing', Citra: 'Marketing', Dewi: 'Marketing, Leader' });
  const i2 = duaLeader.bonusMarketing(list, agg);
  sama('dua leader terbaca dua', i2.leaderIds.length, 2);
  cek('layar mengatakan ada lebih dari satu leader',
      /2 orang<\/b> tercatat sebagai leader/.test(duaLeader.kartuSkema3(i2, list, 'a')));
})();

/* Event tanpa jenis harus disebut di kartunya, berikut cara membetulkannya. */
cek('kartu Skema 1 menyebut event yang belum punya jenis',
    /belum punya jenis/.test(M.kartuSkema1(info)));
cek('...berikut cara membetulkannya (Breakdown Sumber)',
    /Breakdown Sumber/.test(M.kartuSkema1(info)));
(function () {
  const bersih = JSON.parse(JSON.stringify(agg));
  bersih.b.events[2].jenis = 'Gathering';
  const i = M.bonusMarketing(list, bersih);
  sama('tidak ada yang tanpa jenis', i.tanpaJenis, 0);
  cek('...maka peringatannya tidak digambar', !/belum punya jenis/.test(M.kartuSkema1(i)));
})();

/* ---------- 8. BERKAS KEMBAR srcJenis ---------- */
console.log('\n-- srcJenis: omset menulis, kas membaca --');
const omset = LF(fs.readFileSync(OMSET, 'utf8'));
cek('omset MENULIS srcJenis saat baris marketing lahir',
    /srcJenis:String\(\(ev\.detail&&ev\.detail\.jenis\)\|\|''\)/.test(omset));
cek('omset MENYEGARKAN srcJenis tiap render (baris lama ikut betul)',
    /r\.srcJenis=jenisSumber\[r\.srcId\]/.test(omset));
cek('penyegarnya hanya menyentuh baris marketing, bukan event',
    /state\.mk\.forEach\(r=>\{\s*\n?\s*if\(!r\.srcId \|\| !\(r\.srcId in jenisSumber\)\)/.test(omset));
cek('kas MEMBACA nama kunci yang sama', /jenis:String\(r\.srcJenis\|\|''\)/.test(kas));
/* VIP sengaja tidak diberi jenis — kalau suatu hari ikut, ia jadi corporate
   palsu tanpa satu pun galat. */
cek('VIP tidak ikut diberi jenis', !/vip:'\+v\.id\]=String\(\(v\.detail/.test(omset));

/* ketOffice: satu pembaca KET_MAP, bukan dua.

   KOMENTAR DIBUANG DULU. Sejarah kenapa sebuah nama diganti justru HARUS boleh
   menyebut nama lamanya — yang dilarang PEMAKAIANNYA, bukan penyebutannya.
   Aturan yang sama dengan tools/uji-tanpa-target.js; tanpa ini, satu kalimat
   penjelas di atas fungsinya membuat uji ini merah tanpa ada yang rusak. */
const kasKode = kas.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
cek('ketOffice ada dan dipakai bersama', kasKode.indexOf('function ketOffice(e)') > -1);
cek('tidak ada lagi PEMAKAIAN ketKasir() di kode', kasKode.indexOf('ketKasir(') === -1,
    'masih terpanggil di luar komentar');
cek('sejarah nama lamanya tetap tertulis di komentar', kas.indexOf('ketKasir()') > -1);

console.log('\n' + ok + ' OK, ' + gagal + ' GAGAL');
process.exit(gagal ? 1 : 0);
