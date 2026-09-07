/* uji-bonus-event.js — Bonus Event di Performa Event (panel Kas Kecil)
 *
 *   node tools/uji-bonus-event.js
 *
 * TANPA jsdom, pola yang sama dengan tools/uji-bonus-marketing.js: fungsinya
 * DIPOTONG dari deploy/finance/kas/index.html lalu dijalankan, bukan disalin.
 *
 * Yang dijaga, dan tiap-tiapnya gagal TANPA SATU PUN GALAT:
 *
 *   1. DASARNYA NET (`amount` = kolom Nilai Event), BUKAN `porsi`. Untuk event
 *      porsiPic() cuma SEPARUH nilai event, jadi kalau salah pakai, seluruh
 *      tangga praktis tidak pernah tercapai — dan angka yang kecil terbaca
 *      sebagai bulan yang sepi, bukan sebagai bug. Data uji ini sengaja
 *      menyertakan `porsi` yang berbeda dari `amount` supaya salah pakai punya
 *      tempat untuk muncul.
 *   2. TANGGA TIDAK BOLEH BERLUBANG. Dokumennya punya celah di Rp45–46 juta,
 *      Rp55–56 juta, dan tiga celah di Skema 4. Yang diperiksa INVARIAN —
 *      bonus tidak pernah turun saat omset naik — bukan angka salinan.
 *   3. Skema 1+2+4 diakumulasi, Skema 3 (voucher) TIDAK ikut.
 *   4. Tiap event dihitung SEKALI, di tangga tertingginya.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const AKAR = path.join(__dirname, '..');
const KAS = path.join(AKAR, 'deploy/finance/kas/index.html');
const LF = t => t.replace(/\r\n/g, '\n');
const kas = LF(fs.readFileSync(KAS, 'utf8'));

let ok = 0, gagal = 0;
function cek(nama, syarat, ket) {
  if (syarat) { ok++; console.log('  OK   ' + nama); }
  else { gagal++; console.log('  GAGAL ' + nama + (ket ? '  — ' + ket : '')); }
}
function sama(nama, dapat, harap) {
  cek(nama, dapat === harap, 'dapat ' + JSON.stringify(dapat) + ', harusnya ' + JSON.stringify(harap));
}

function potong(teks, mulai, akhir, label) {
  const a = teks.indexOf(mulai);
  if (a < 0) throw new Error('tidak ketemu di sumber: ' + label);
  const b = teks.indexOf(akhir, a);
  if (b < 0) throw new Error('penutup tidak ketemu: ' + label);
  return teks.slice(a, b + akhir.length);
}

const helper = [
  potong(kas, 'const fmtRp=', '\n', 'fmtRp'),
  potong(kas, 'const num=v=>', '\n', 'num'),
  potong(kas, 'const esc=s=>', '\n', 'esc'),
].join('');

/* KEDUA blok dipotong: mkTangga() dan MK_HI lahir di blok marketing dan dipakai
   bersama oleh blok event. Memotong yang event saja berarti menulis ulang
   mkTangga di sini — dan uji yang menulis ulang rumus yang diujinya tidak
   menguji apa pun. */
const blok = potong(kas,
  '/* ============ BONUS MARKETING ============',
  '+kartuEvS4(info,pid);\n}',
  'blok bonus marketing + event');
cek('blok bonus marketing + event ada di sumber', blok.indexOf('function bonusEvent') > -1);

const jalan = new Function(`
  ${helper}
  function ketOffice(){ return null; }   // leader cuma urusan Bonus Marketing
  ${blok}
  return { bonusEvent, tanggaEvS4, mkTangga, kartuBonusEv, kartuEvS1, kartuEvS2, kartuEvS3, kartuEvS4,
           EV_S1, EV_S2, EV_S2_DASAR, EV_S3_VOUCHER, EV_S4 };
`);
const M = jalan();

/* ---------- data uji ----------
   `porsi` sengaja SEPARUH `amount` — persis seperti porsiPic() untuk event.
   Kalau kodenya salah membaca porsi, tiap tangga meleset satu tingkat ke bawah
   dan ujinya berbunyi. */
function ev(nama, amount) { return { date: '2026-09-01', name: nama, amount: amount, porsi: Math.round(amount / 2) }; }

const list = [{ id: 'a', name: 'Andi' }, { id: 'b', name: 'Bima' }, { id: 'c', name: 'Cinta' }];
const agg = {
  a: { real: 0, events: [ev('Gala', 120000000), ev('Rapat', 60000000), ev('Kecil', 40000000)] },
  b: { real: 0, events: [ev('Pas Celah A', 45500000), ev('Pas Celah B', 55500000), ev('Di Bawah', 30000000)] },
  c: { real: 0, events: [] },
};
const info = M.bonusEvent(list, agg);

/* ---------- 1. DASARNYA NET, bukan porsi ---------- */
console.log('-- dasar angka --');
/* Andi: 120jt -> Rp1.000.000, 60jt -> Rp500.000, 40jt -> Rp300.000 */
sama('Skema 1 Andi dihitung dari Nilai Event (net)', info.per.a.s1, 1000000 + 500000 + 300000);
cek('...dan BUKAN dari porsi (yang cuma separuh)', info.per.a.s1 !== 400000 + 400000 + 0,
    'angkanya sama dengan hasil kalau porsi yang dipakai');
sama('Skema 4 Andi memakai jumlah Nilai Event', info.per.a.net, 220000000);

/* ---------- 2. Skema 1 — tangga & celah dokumen ---------- */
console.log('\n-- Skema 1 (per event) --');
const t1 = n => { const t = M.mkTangga(M.EV_S1, n); return t ? t.bonus : 0; };
sama('di bawah Rp35.000.000 tidak dapat', t1(34999999), 0);
sama('tepat Rp35.000.000 dapat Rp300.000', t1(35000000), 300000);
sama('Rp45.000.000 masih Rp300.000', t1(45000000), 300000);
sama('celah Rp45.000.001 naik ke Rp400.000', t1(45000001), 400000);
sama('Rp55.000.000 masih Rp400.000', t1(55000000), 400000);
sama('celah Rp55.000.001 naik ke Rp500.000', t1(55000001), 500000);
sama('Rp100.000.000 masih Rp500.000', t1(100000000), 500000);
sama('di atas Rp100.000.000 dapat Rp1.000.000', t1(100000001), 1000000);
sama('Bima kena kedua celah', info.per.b.s1, 400000 + 500000);
sama('...event Rp30.000.000 tidak menambah apa pun', info.per.b.s1Jml[35000000] || 0, 0);
sama('event Rp120 juta dihitung SEKALI di tangga teratas', info.per.a.s1Jml[100000001], 1);
cek('...dan tidak ikut terhitung di tangga bawahnya',
    !info.per.a.s1Jml[55000001] || info.per.a.s1Jml[55000001] === 1, 'Rp60jt saja yang boleh di sana');
sama('tangga Rp55.000.001 hanya berisi event Rp60 juta', info.per.a.s1Jml[55000001], 1);

/* ---------- 3. Skema 2 — jumlah event, pool tim ---------- */
console.log('\n-- Skema 2 (pool tim dari jumlah event) --');
sama('6 event belum masuk tangga', info.s2.pool, 0);
sama('pembagi = PIC yang punya event (Cinta tidak ikut)', info.s2.bagi, 2);
function ulang(n) {
  const g = { a: { real: 0, events: [] }, b: { real: 0, events: [] }, c: { real: 0, events: [] } };
  for (let i = 0; i < n; i++) g.a.events.push(ev('E' + i, 10000000));
  return M.bonusEvent(list, g);
}
sama('9 event -> belum ada bonus', ulang(9).s2.pool, 0);
sama('10 event -> Rp200.000', ulang(10).s2.pool, 200000);
sama('11 event -> masih Rp200.000', ulang(11).s2.pool, 200000);
sama('12 event -> Rp500.000, TIDAK ditambah baris 10 event', ulang(12).s2.pool, 500000);
sama('garis dasar dokumennya 8 event', M.EV_S2_DASAR, 8);
(function () {
  const i = ulang(12);
  sama('pool dibagi ke 1 PIC yang punya event', i.s2.bagi, 1);
  sama('...jadi per PIC penuh', i.s2.perPic, 500000);
  sama('PIC tanpa event tidak dapat Skema 2', i.per.c.s2, 0);
})();

/* ---------- 4. Skema 3 — voucher ---------- */
console.log('\n-- Skema 3 (voucher, terpisah) --');
const t3 = n => { const t = M.mkTangga(M.EV_S3_VOUCHER, n); return t ? t.nilai : 0; };
sama('tepat Rp30.000.000 belum dapat ("di atas")', t3(30000000), 0);
sama('Rp30.000.001 dapat Rp100.000', t3(30000001), 100000);
sama('Rp56.000.000 masih Rp100.000', t3(56000000), 100000);
sama('Rp56.000.001 dapat Rp150.000', t3(56000001), 150000);
sama('Rp100.000.000 masih Rp150.000', t3(100000000), 150000);
sama('Rp100.000.001 dapat Rp250.000', t3(100000001), 250000);
sama('voucher Andi', info.per.a.voucher, 250000 + 150000 + 100000);
sama('event Rp120 juta dapat SATU voucher tertinggi', info.per.a.vJml[100000001], 1);
sama('...dan tidak ikut di tangga Rp30 juta', info.per.a.vJml[30000001], 1);

/* ---------- 5. Skema 4 ---------- */
console.log('\n-- Skema 4 (tangga per PIC) --');
const t4 = n => M.tanggaEvS4(n).bonus;
sama('di bawah Rp150.000.000 tidak dapat', t4(149999999), 0);
sama('tepat Rp150.000.000 dapat Rp250.000', t4(150000000), 250000);
sama('Rp200.000.000 masih Rp250.000', t4(200000000), 250000);
sama('celah Rp200.000.001 naik ke Rp350.000', t4(200000001), 350000);
sama('celah Rp250.000.001 naik ke Rp500.000', t4(250000001), 500000);
sama('celah Rp300.000.001 naik ke Rp700.000', t4(300000001), 700000);
sama('Rp350.000.000 masih Rp700.000', t4(350000000), 700000);
sama('di atas Rp350.000.000 dapat Rp1.000.000', t4(350000001), 1000000);
sama('Andi Rp220 juta -> Rp350.000', info.per.a.s4.bonus, 350000);
sama('Bima Rp131 juta -> belum masuk tangga', info.per.b.s4.bonus, 0);
cek('next menunjuk tangga DI ATAS', M.tanggaEvS4(220000000).next.bonus === 500000);
cek('di tangga teratas, next kosong', M.tanggaEvS4(999000000).next === null);
cek('belum masuk tangga -> next = tangga terendah', M.tanggaEvS4(0).next.bonus === 250000);

/* ---------- 6. INVARIAN: tangga tidak boleh berlubang ---------- */
console.log('\n-- invarian tangga --');
function monoton(nama, ambil, sampai, langkah, batas) {
  const titik = [];
  for (let n = 0; n <= sampai; n += langkah) titik.push(n);
  batas.forEach(t => titik.push(t.min - 1, t.min, t.min + 1));
  titik.sort((x, y) => x - y);
  let turun = null, sebelum = -1;
  titik.forEach(n => { const b = ambil(n); if (b < sebelum && turun === null) turun = n; sebelum = Math.max(sebelum, b); });
  cek(nama + ' monoton — bonus tidak pernah turun saat omset naik', turun === null, 'turun di ' + turun);
}
monoton('Skema 1', t1, 150000000, 250000, M.EV_S1);
monoton('Skema 3', t3, 150000000, 250000, M.EV_S3_VOUCHER);
monoton('Skema 4', t4, 500000000, 1000000, M.EV_S4);

/* ---------- 7. akumulasi 1+2+4, voucher TIDAK ikut ---------- */
console.log('\n-- akumulasi --');
list.forEach(e => {
  const p = info.per[e.id];
  sama('tunai ' + e.name + ' = Skema 1 + 2 + 4', p.tunai, p.s1 + p.s2 + p.s4.bonus);
});
cek('voucher TIDAK masuk bonus tunai',
    info.per.a.voucher > 0 && info.per.a.tunai === info.per.a.s1 + info.per.a.s2 + info.per.a.s4.bonus);
sama('tunaiSemua = jumlah tunai tiap PIC', info.tunaiSemua,
     list.reduce((s, e) => s + info.per[e.id].tunai, 0));
sama('voucherSemua = jumlah voucher tiap PIC', info.voucherSemua,
     list.reduce((s, e) => s + info.per[e.id].voucher, 0));

/* ---------- 8. kartunya ---------- */
console.log('\n-- kartu di layar --');
const html = M.kartuBonusEv(info, 'a', list[0], agg.a, list);
['Skema 1', 'Skema 2', 'Skema 3', 'Skema 4'].forEach(t => cek('kartu menyebut ' + t, html.indexOf(t) > -1));
cek('mengatakan Skema 3 berdiri sendiri', /Skema 3 berdiri sendiri/.test(html));
cek('mengatakan dasarnya net, bukan kolom Diakui',
    /net, sebelum tax &amp; service/.test(html) && /bukan kolom Diakui/.test(html));
cek('mengatakan nominal Skema 1 itu PER ORANG dan timnya tidak tercatat',
    /Nominalnya per orang/.test(html) && /tidak menyimpan siapa saja anggota tim/.test(html));
cek('menyebut pembagi pool Skema 2 berikut angkanya', /Dibagi ke 2 PIC/.test(html));
(function () {
  const rp = n => 'Rp' + Math.round(n).toLocaleString('id-ID');
  const p = info.per.a;
  cek('kartu memajang bonus tunai yang sama dengan yang dihitung', html.indexOf(rp(p.tunai)) > -1, rp(p.tunai));
  cek('rincian Skema 1/2/4 disebut angkanya',
      html.indexOf(rp(p.s1)) > -1 && html.indexOf(rp(p.s4.bonus)) > -1);
  cek('total voucher dipajang', html.indexOf(rp(p.voucher)) > -1);
})();
(function () {
  const semua = M.kartuBonusEv(info, '__all__', { name: 'Semua PIC' }, { real: 0, events: [] }, list);
  cek('segmen Semua tergambar tanpa melempar', semua.length > 3000);
  cek('segmen Semua tidak memakai tangga Skema 4 gabungan', /Dinilai per PIC/.test(semua));
  const singkat = (html + semua).match(/Rp\s?\d{1,3}\s?(jt|juta|rb|M)\b/gi);
  cek('tidak ada nominal bentuk singkat di kartu bonus', singkat === null,
      'ketemu: ' + (singkat || []).join(', '));
})();

/* ---------- 8b. kolom Realisasi di tangga Skema 4 (7 September 2026) ----------
   Yang dijaga bukan sekadar "ada kolomnya", melainkan ISINYA BEDA PER BARIS:
   kolom yang memajang angka yang sama di semua baris tidak menghapus satu pun
   pekerjaan yang jadi alasan kolom ini ada. */
console.log('\n-- kolom Realisasi --');
(function () {
  const rp = n => 'Rp' + Math.round(n).toLocaleString('id-ID');
  const s4 = M.kartuEvS4(info, 'a');                 // Andi, net Rp220.000.000
  cek('Skema 4 punya kolom Realisasi', /<th class="num">Realisasi<\/th>/.test(s4));
  cek('...dan letaknya SEBELUM kolom bonus (di kirinya)',
      s4.indexOf('>Realisasi<') < s4.indexOf('>Bonus untuk Tim Event<'));
  cek('baris yang sedang berlaku memajang ANGKA realisasinya',
      s4.indexOf('<b>' + rp(info.per.a.net) + '</b> ✓') > -1, 'mencari ' + rp(info.per.a.net));
  sama('...dan cuma sekali, bukan di tiap baris',
       (s4.match(new RegExp('<b>' + rp(info.per.a.net).replace(/\./g, '\\.') + '</b> ✓', 'g')) || []).length, 1);
  cek('baris di atasnya menyebut KURANG berapa lagi',
      s4.indexOf('kurang ' + rp(250000001 - info.per.a.net)) > -1,
      'mencari kurang ' + rp(250000001 - info.per.a.net));
  cek('baris yang sudah terlewati ditandai, bukan diulang angkanya', /terlampaui/.test(s4));

  /* PIC yang belum masuk tangga: angkanya harus muncul di baris DASAR, bukan
     hilang sama sekali dari tabel. Kalau hilang, yang paling perlu tahu
     posisinya justru tidak melihat angkanya di mana pun. */
  const s4b = M.kartuEvS4(info, 'b');                // Bima, net Rp131.000.000
  cek('PIC di bawah tangga tetap melihat angkanya, di baris dasar',
      s4b.indexOf('<b>' + rp(info.per.b.net) + '</b> ✓') > -1, 'mencari ' + rp(info.per.b.net));
  cek('...dan tangga pertama menyebut kurang berapa lagi',
      s4b.indexOf('kurang ' + rp(150000000 - info.per.b.net)) > -1);

  const s4all = M.kartuEvS4(info, '__all__');
  cek('segmen Semua TIDAK memajang angka realisasi di tangga per PIC',
      !/terlampaui|kurang Rp/.test(s4all));
})();

/* ---------- 9. tidak menabrak Bonus Marketing ---------- */
console.log('\n-- terpisah dari Bonus Marketing --');
cek('tabel event punya konstanta sendiri, bukan memakai MK_S2',
    /const EV_S4=/.test(kas) && /const MK_S2=/.test(kas));
cek('viewPerforma memilih penghitung menurut divisinya',
    /divi==='marketing'\?bonusMarketing\(list,agg\):bonusEvent\(list,agg\)/.test(kas));
cek('...dan penggambarnya juga',
    /divi==='marketing'\?kartuBonusMk\(BONUS,pid,e,a,list\):kartuBonusEv\(BONUS,pid,e,a,list\)/.test(kas));
cek('mkTangga dipakai bersama, tidak ditulis dua kali',
    (kas.match(/function mkTangga\(/g) || []).length === 1);

console.log('\n' + ok + ' OK, ' + gagal + ' GAGAL');
process.exit(gagal ? 1 : 0);
