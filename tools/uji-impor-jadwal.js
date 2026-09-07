/* UJI: Impor / Tempel dari Excel di Input Mingguan (7 September 2026)
 *
 *   node tools/uji-impor-jadwal.js
 *
 * Permintaan user: jadwal Bar sudah disusun lebih dulu di lembar Excel
 * kasar, ingin dipindahkan ke modul tanpa mengetik ulang ~170 sel.
 *
 * imporParse() dipotong dari sumbernya (bukan disalin) dan dijalankan
 * langsung — TANPA jsdom, pola yang sama dengan uji-openbill-performa.js.
 * Yang dijaga: tiga jalan lolos yang tidak satu pun melempar galat —
 *
 *   1. Tanggal HARUS dari tempelan, tidak ditebak dari minggu aktif.
 *      Lembar Bar mulai hari Selasa; minggu modul mulai Senin.
 *   2. Nama di luar roster divisi TIDAK ditulis dan TIDAK ditebak.
 *   3. Kode yang bukan shift ("HARAU!!!") -> LAIN + catatan sel, disebut.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'deploy', 'jadwal', 'index.html'), 'utf8');

let ok = 0, gagal = 0;
function cek(nama, syarat, ket) {
  if (syarat) { ok++; console.log('  OK   ' + nama); }
  else { gagal++; console.log('  GAGAL ' + nama + (ket ? '\n         -> ' + ket : '')); }
}

/* Fungsi tingkat atas: dari tanda sampai kurung tutup di kolom nol. */
function potong(tanda, tutup) {
  const i = SRC.indexOf(tanda);
  if (i < 0) throw new Error(tanda + ' tidak ketemu di sumber');
  const j = SRC.indexOf(tutup || '\n}', i);
  if (j < 0) throw new Error(tanda + ' tidak punya penutup');
  return SRC.slice(i, j + (tutup ? tutup.length : 2));
}
function potongBaris(tanda) {
  const i = SRC.indexOf(tanda);
  if (i < 0) throw new Error(tanda + ' tidak ketemu di sumber');
  return SRC.slice(i, SRC.indexOf('\n', i));
}

const kode = [
  potongBaris('function parseD(s){'),
  potong('const IMP_BULAN=', '};'),
  potongBaris('function impPad2(n){'),
  potong('function impISO('),
  potong('function impTgl('),
  potongBaris('function impNorm(s){'),
  potong('function impCocokNama('),
  potong('function imporParse('),
  'return { imporParse, impTgl, impCocokNama, impNorm };',
].join('\n\n');

const M = new Function(kode)();

/* ---- data uji: roster Bar produksi (nama Office sebenarnya) ---- */
const EMPS = [
  { id: 'u-arif', name: 'Arif Rahman Harefa' },
  { id: 'u-condrofredyansidabutar', name: 'Condro Fredyan Sidabutar' },
  { id: 'u-myusufismail', name: 'M. Yusuf Ismail' },
  { id: 'u-yuzaalfarel', name: 'Yuza Alfarel' },
  { id: 'u-nabilamelaniputri', name: 'Nabila Melani Putri' },
  { id: 'u-welsapuanmaharani', name: 'Welsa Puan Maharani' },
];
const SHIFTS = {
  PAGI:   { n: 'PAGI',   m: '08:00', s: '17:00', libur: 0 },
  MIDDLE: { n: 'MIDDLE', m: '11:00', s: '20:00', libur: 0 },
  SPLIT:  { n: 'SPLIT',  m: '11:00', s: '23:00', libur: 0 },
  SIANG:  { n: 'SIANG',  m: '14:00', s: '23:00', libur: 0 },
  OFF:    { n: 'OFF',    m: '', s: '', libur: 1 },
  IZIN:   { n: 'IZIN',   m: '', s: '', libur: 1 },
  CUTI:   { n: 'CUTI',   m: '', s: '', libur: 1 },
  LAIN:   { n: 'LAIN',   m: '', s: '', libur: 1 },
};
const REF = '2026-08-31'; // Senin minggu yang memuat 1 September

/* Minggu 1 lembar Bar: kolom mulai SELASA 1 Sep. Ditempel apa adanya —
   baris judul, baris No./NAMA/TGL + tanggal, baris nama hari, lalu kru.
   Kolom A (No.) dan C (jabatan) ikut, harus dilewati sendiri. */
const TEMPEL_M1 = [
  'SCHEDULE BAR SEPTEMBER 2026',
  'No.\tNAMA\tTGL\t01/09/2026\t02/09/2026\t03/09/2026\t04/09/2026\t05/09/2026\t06/09/2026\t07/09/2026',
  '\t\tHARI\tSELASA\tRABU\tKAMIS\tJUMAT\tSABTU\tMINGGU\tSENIN',
  '1\tARIF\tHEAD\tHARAU!!!\tOFF\tSIANG\tSIANG\tSIANG\tSIANG\tSIANG',
  '2\tCONDRO\tS. BAR\tHARAU!!!\tSIANG\tSIANG\tOFF\tSIANG\tSIANG\tSIANG',
  '3\tYUSUF\tBARISTA\tHARAU!!!\tSIANG\tOFF\tSIANG\tSIANG\tSIANG\tOFF',
  '4\tYUZA\tBARISTA\tHARAU!!!\tSIANG\tOFF\tPAGI\tPAGI\tPAGI\tOFF',
  '5\tBILA\tBARISTA\tHARAU!!!\tPAGI\tPAGI\tOFF\tMIDDLE\tMIDDLE\tPAGI',
  '6\tWELSA\tBARISTA\tHARAU!!!\tOFF\tSIANG\tSIANG\tSIANG\tSIANG\tSIANG',
].join('\n');

console.log('\n=== Parse minggu 1 (tanggal dd/mm/yyyy) ===');
let h = M.imporParse(TEMPEL_M1, { emps: EMPS, shifts: SHIFTS, ref: REF });

cek('baris tanggal ketemu', h.adaTgl);
cek('6 nama dikenali', h.cocok.length === 6, JSON.stringify(h.cocok));
cek('tidak ada nama gagal cocok', h.lewat.length === 0, JSON.stringify(h.lewat));
cek('tidak ada nama ambigu', h.ganda.length === 0, JSON.stringify(h.ganda));
cek('6 kru x 7 hari = 42 sel', h.rows.length === 42, 'dapat ' + h.rows.length);

const byKey = {};
h.rows.forEach(r => { byKey[r.u + '|' + r.d] = r; });

cek('ARIF 1 Sep -> LAIN + catatan HARAU!!!',
  byKey['u-arif|2026-09-01'] && byKey['u-arif|2026-09-01'].t === 'LAIN'
  && byKey['u-arif|2026-09-01'].n === 'HARAU!!!',
  JSON.stringify(byKey['u-arif|2026-09-01']));
cek('"HARAU!!!" disebut sebagai catatan bebas', h.bebas.length === 1 && h.bebas[0] === 'HARAU!!!',
  JSON.stringify(h.bebas));
cek('ARIF 2 Sep -> OFF (libur, jam kosong)',
  byKey['u-arif|2026-09-02'].t === 'OFF' && byKey['u-arif|2026-09-02'].m === '' && byKey['u-arif|2026-09-02'].s === '');
cek('ARIF 3 Sep -> SIANG dengan jam bawaan 14:00-23:00',
  byKey['u-arif|2026-09-03'].t === 'SIANG' && byKey['u-arif|2026-09-03'].m === '14:00' && byKey['u-arif|2026-09-03'].s === '23:00');
cek('BILA 5 Sep -> MIDDLE (nama pendek "BILA" menemukan "Nabila")',
  byKey['u-nabilamelaniputri|2026-09-05'] && byKey['u-nabilamelaniputri|2026-09-05'].t === 'MIDDLE');
cek('YUZA 4 Sep -> PAGI', byKey['u-yuzaalfarel|2026-09-04'].t === 'PAGI');
cek('kolom No. (1..6) tidak jadi tanggal / nama', !h.rows.some(r => r.u === '1' || r.u === '6'));
cek('baris judul tidak masuk daftar "tidak dikenal"',
  h.lewat.indexOf('SCHEDULE BAR SEPTEMBER 2026') < 0);

/* ---- tanggal sebagai nomor seri Excel (kalau yang disalin nilainya) ---- */
console.log('\n=== Tanggal sebagai serial Excel ===');
const TEMPEL_SERIAL = [
  'NAMA\t46266\t46267\t46268',
  'ARIF\tSIANG\tOFF\tPAGI',
].join('\n');
let hs = M.imporParse(TEMPEL_SERIAL, { emps: EMPS, shifts: SHIFTS, ref: REF });
cek('serial 46266 -> 2026-09-01', hs.rows[0] && hs.rows[0].d === '2026-09-01', JSON.stringify(hs.rows[0]));
cek('serial 46268 -> 2026-09-03', hs.rows[2] && hs.rows[2].d === '2026-09-03');

/* ---- tanggal "1 Sep" / "1 September 2026" ---- */
console.log('\n=== Tanggal nama bulan ===');
let hn = M.imporParse('NAMA\t1 Sep\t2 September 2026\nARIF\tSIANG\tPAGI',
  { emps: EMPS, shifts: SHIFTS, ref: REF });
cek('"1 Sep" -> 2026-09-01', hn.rows[0] && hn.rows[0].d === '2026-09-01', JSON.stringify(hn.rows[0]));
cek('"2 September 2026" -> 2026-09-02', hn.rows[1] && hn.rows[1].d === '2026-09-02');

/* ---- nama di luar roster: dilewati, tidak ditebak ---- */
console.log('\n=== Nama di luar roster ===');
let hx = M.imporParse([
  'NAMA\t01/09/2026\t02/09/2026',
  'ARIF\tSIANG\tOFF',
  'BUDI SANTOSO\tPAGI\tPAGI',
].join('\n'), { emps: EMPS, shifts: SHIFTS, ref: REF });
cek('BUDI SANTOSO dilaporkan tidak dikenal', hx.lewat.indexOf('BUDI SANTOSO') >= 0, JSON.stringify(hx.lewat));
cek('baris BUDI tidak ditulis (cuma ARIF, 2 sel)', hx.rows.length === 2 && hx.rows.every(r => r.u === 'u-arif'));

/* ---- tanpa baris tanggal: menolak, tidak menebak minggu aktif ---- */
console.log('\n=== Tanpa baris tanggal ===');
let ht = M.imporParse('ARIF\tSIANG\tOFF\tPAGI\nCONDRO\tOFF\tSIANG\tSIANG',
  { emps: EMPS, shifts: SHIFTS, ref: REF });
cek('adaTgl = false', ht.adaTgl === false);
cek('tidak ada baris yang ditulis', ht.rows.length === 0);

/* ---- tanggal liar (angka nyasar) ditolak jendela kewarasan ---- */
console.log('\n=== Jendela kewarasan tanggal ===');
cek('serial 99999 (tahun 2173) ditolak', M.impTgl('99999', REF) === null);
cek('01/09/2030 (4 tahun) ditolak', M.impTgl('01/09/2030', REF) === null);
cek('01/09/2026 diterima', M.impTgl('01/09/2026', REF) === '2026-09-01');

/* ---- dedupe: tanggal sama untuk satu orang -> yang terakhir menang ---- */
console.log('\n=== Dedupe u|tgl ===');
let hd = M.imporParse([
  'NAMA\t01/09/2026\t01/09/2026',   // kolom tanggal dobel (salah blok/tempel)
  'ARIF\tSIANG\tOFF',
].join('\n'), { emps: EMPS, shifts: SHIFTS, ref: REF });
cek('satu baris untuk u-arif|2026-09-01', hd.rows.length === 1);
cek('nilai terakhir (OFF) yang menang', hd.rows[0].t === 'OFF', JSON.stringify(hd.rows[0]));

/* ---- ambiguitas nama: dua kru cocok -> dilewati, tidak ditebak ---- */
console.log('\n=== Nama ambigu ===');
const EMPS2 = EMPS.concat([{ id: 'u-arifbudi', name: 'Arif Budiman' }]);
let ha = M.imporParse('NAMA\t01/09/2026\t02/09/2026\nARIF\tSIANG\tOFF',
  { emps: EMPS2, shifts: SHIFTS, ref: REF });
cek('"ARIF" jadi ambigu (dua "Arif")', ha.ganda.length === 1, JSON.stringify(ha.ganda));
cek('baris ambigu tidak ditulis', ha.rows.length === 0);

/* ---- seluruh 4 minggu dalam satu tempelan ---- */
console.log('\n=== Empat minggu sekaligus ===');
const TEMPEL_2M = TEMPEL_M1 + '\n'
  + 'No.\tNAMA\tTGL\t08/09/2026\t09/09/2026\t10/09/2026\t11/09/2026\t12/09/2026\t13/09/2026\t14/09/2026\n'
  + '\t\tHARI\tSELASA\tRABU\tKAMIS\tJUMAT\tSABTU\tMINGGU\tSENIN\n'
  + '1\tARIF\tHEAD\tOFF\tSIANG\tSIANG\tSIANG\tSIANG\tSIANG\tOFF\n'
  + '2\tCONDRO\tS. BAR\tSIANG\tSIANG\tOFF\tPAGI\tPAGI\tPAGI\tSIANG\n';
let h2 = M.imporParse(TEMPEL_2M, { emps: EMPS, shifts: SHIFTS, ref: REF });
cek('minggu 2 ikut terbaca (42 + 14 = 56 sel)', h2.rows.length === 56, 'dapat ' + h2.rows.length);
cek('ARIF 8 Sep -> OFF', h2.rows.some(r => r.u === 'u-arif' && r.d === '2026-09-08' && r.t === 'OFF'));
cek('ARIF 1 Sep tetap LAIN (minggu 1 tak tergeser)',
  h2.rows.some(r => r.u === 'u-arif' && r.d === '2026-09-01' && r.t === 'LAIN'));

console.log('\n' + (gagal ? 'GAGAL: ' : 'SEMUA LULUS: ') + ok + ' OK, ' + gagal + ' gagal');
process.exit(gagal ? 1 : 0);
