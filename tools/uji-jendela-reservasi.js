/* uji-jendela-reservasi.js — backend Reservasi siap untuk memuat berjendela
 *
 *   node tools/uji-jendela-reservasi.js
 *
 * TAHAP 1 dari paging Reservasi (24 September 2026). Yang berubah HANYA
 * backend, dan perilaku untuk klien lama WAJIB persis sama:
 *   - getAll tanpa ?dari/?sampai  -> seluruh riwayat, seperti dulu
 *   - saveAll tanpa `dikenal`      -> DELETE ... NOT IN (kiriman) + gc_files, seperti dulu
 * Yang baru:
 *   - getAll ?dari=&sampai=        -> hanya reservasi di rentang itu (+ yang tanggalnya kosong)
 *   - saveAll dengan `dikenal`     -> hanya (dikenal − kiriman) yang dihapus; gc_files dilewati
 *   - getAll menggemakan _fitur    -> klien baru boleh beralih mode HANYA kalau ini ada
 *
 * Tidak ada php di mesin pengembangan, jadi: sintaks diperiksa php-parser,
 * aturan diperiksa sebagai KONTRAK atas sumbernya (komentar dibuang dulu —
 * penjelasan sejarah boleh menyebut apa saja), dan aturan penghapusannya
 * disimulasikan dengan rumus yang DIPOTONG dari sumber lalu diterjemahkan.
 */
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..');
let ok = 0, gagal = 0;
const cek = (n, s, k) => { if (s) { ok++; console.log('  OK   ' + n); } else { gagal++; console.log('  GAGAL ' + n + (k ? '  — ' + k : '')); } };

const muat = ps => { for (const p of ps) { if (!p) continue; try { return require(p); } catch (e) {} } return null; };
const PHP_MOD = muat([process.env.PHP_PARSER_PATH, path.join(ROOT, 'node_modules', 'php-parser'), 'C:/Users/LENOVO LEGION/node_modules/php-parser', 'php-parser']);

const LIB_MENTAH = fs.readFileSync(path.join(ROOT, 'reservasi-mysql/lib_reservasi_mysql.php'), 'utf8').replace(/\r\n/g, '\n');
const API_MENTAH = fs.readFileSync(path.join(ROOT, 'reservasi-mysql/api.php'), 'utf8').replace(/\r\n/g, '\n');
const buangKomentar = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const LIB = buangKomentar(LIB_MENTAH), API = buangKomentar(API_MENTAH);

const badan = (src, nama) => {
  const i = src.indexOf('function ' + nama + '(');
  if (i < 0) return '';
  let j = src.indexOf('{', i), d = 0;
  for (let k = j; k < src.length; k++) { if (src[k] === '{') d++; else if (src[k] === '}') { d--; if (!d) return src.slice(i, k + 1); } }
  return '';
};

console.log('\n== Sintaks PHP ==');
if (PHP_MOD) {
  const Engine = PHP_MOD.Engine || PHP_MOD;
  const parser = new Engine({ parser: { php8: true, suppressErrors: false }, ast: {} });
  for (const [n, s] of [['lib_reservasi_mysql.php', LIB_MENTAH], ['api.php', API_MENTAH]]) {
    let e = null; try { parser.parseCode(s, n); } catch (x) { e = x; }
    cek('parse ' + n, !e, e && e.message);
  }
} else console.log('  LEWAT parse-check (php-parser tidak ada)');

console.log('\n== baca_state: tanpa jendela = seluruh riwayat ==');
const BACA = badan(LIB, 'baca_state');
cek('baca_state menerima $dari & $sampai opsional', /function baca_state\(\$dari = null, \$sampai = null\)/.test(BACA));
cek('tanpa jendela: query lama tanpa WHERE', /if \(\$dari === null && \$sampai === null\) \{\s*\$q = \$pdo->query\('SELECT data FROM reservations ORDER BY created_at ASC, id ASC'\)/.test(BACA));
cek('jendela memakai kolom tanggal', /tanggal >= :d AND tanggal <= :s/.test(BACA));
cek('yang tanggalnya kosong IKUT dimuat', /tanggal IS NULL OR \(/.test(BACA));
cek('tanggal dibersihkan tanggal_valid() dulu', /\$dari\s*= \$dari\s*!== null \? tanggal_valid\(\$dari\)/.test(BACA) && /tanggal_valid\(\$sampai\)/.test(BACA));
const pakaiD = (BACA.match(/:d\b/g) || []).length, pakaiS = (BACA.match(/:s\b/g) || []).length;
cek('tiap penanda dipakai sekali di SQL + sekali di execute (EMULATE off)', pakaiD === 2 && pakaiS === 2, ':d=' + pakaiD + ' :s=' + pakaiS);

console.log('\n== save_all: klien lama TIDAK berubah perilakunya ==');
const SAVE = badan(LIB, 'save_all');
cek('save_all menerima $dikenal opsional (bawaan null)', /function save_all\(\$state, \$baseVer = null, \$dikenal = null\)/.test(SAVE));
cek('mode ditentukan is_array($dikenal)', /\$parsial = is_array\(\$dikenal\);/.test(SAVE));
cek('klien penuh: gc_files tetap jalan', /\$buang = \$parsial \? 0 : gc_files\(\$state\);/.test(SAVE));
cek('klien penuh: DELETE NOT IN (kiriman) masih ada', /DELETE FROM reservations WHERE id NOT IN \(/.test(SAVE));
cek('DELETE NOT IN berada di cabang else (bukan parsial)', (() => {
  const i = SAVE.indexOf('if ($parsial) {'), e = SAVE.indexOf('} else {', i), n = SAVE.indexOf('NOT IN (', e);
  return i > -1 && e > i && n > e;
})());
cek('penjaga baseVer WAJIB tidak disentuh', /APP_LAWAS/.test(SAVE));
cek('penjaga versi FOR UPDATE tetap mendahului penghapusan', SAVE.indexOf('FOR UPDATE') > -1 && SAVE.indexOf('FOR UPDATE') < SAVE.indexOf('if ($parsial) {'));

console.log('\n== save_all mode parsial ==');
const CABANG = (() => { const i = SAVE.indexOf('if ($parsial) {'); return SAVE.slice(i, SAVE.indexOf('} else {', i)); })();
cek('yang dihapus = dikenal − kiriman', /array_diff\(array_unique\(array_map\('strval', \$dikenal\)\), \$ids\)/.test(CABANG));
cek('DELETE memakai IN (daftar hapus), bukan NOT IN', /DELETE FROM reservations WHERE id IN \(/.test(CABANG) && CABANG.indexOf('NOT IN') < 0);
cek('kiriman kosong + hapus >3 ditahan', /!\(count\(\$ids\) === 0 && count\(\$hapus\) > 3\)/.test(CABANG));
cek('gc_files TIDAK dipanggil di mode parsial', (SAVE.match(/gc_files\(/g) || []).length === 1);
cek('balasan menyebut parsial & dihapus', /'parsial'\s*=> \$parsial/.test(SAVE) && /'dihapus'\s*=> \$dihapus/.test(SAVE));

console.log('\n== api.php ==');
cek('getAll membaca ?dari & ?sampai', /\$_GET\['dari'\]/.test(API) && /\$_GET\['sampai'\]/.test(API) && /baca_state\(\$dari, \$sampai\)/.test(API));
cek('getAll menggemakan _fitur jendela & dikenal', /\$st\['_fitur'\] = array\('jendela', 'dikenal'[,)]/.test(API));
cek('saveAll meneruskan dikenal (hanya kalau array)', /\$dikenal = isset\(\$body\['dikenal'\]\) && is_array\(\$body\['dikenal'\]\)/.test(API) && /save_all\([^;]*\$baseVer, \$dikenal\)/.test(API));
cek("aksi 'ver' tetap ada", /\$action === 'ver'/.test(API));

console.log('\n== Simulasi aturan penghapusan (skenario) ==');
/* Terjemahan langsung dari cabang di atas. Kalau cabangnya berubah bentuk,
   asersi kontrak di atas yang berbunyi lebih dulu. */
function hapusYang(db, kiriman, dikenal) {
  const ids = kiriman.map(String);
  if (Array.isArray(dikenal)) {
    const hapus = [...new Set(dikenal.map(String))].filter(x => ids.indexOf(x) < 0);
    if (hapus.length && !(ids.length === 0 && hapus.length > 3)) return db.filter(x => hapus.indexOf(x) > -1);
    return [];
  }
  if (ids.length === 0) return [];
  return db.filter(x => ids.indexOf(x) < 0);
}
const DB = ['lama1', 'lama2', 'lama3', 'lama4', 'baru1', 'baru2', 'dariTabLain'];
const J = s => JSON.stringify(s);
cek('klien PENUH menghapus apa pun yang tidak dikirim (perilaku lama)', J(hapusYang(DB, ['baru1', 'baru2'], null)) === J(['lama1', 'lama2', 'lama3', 'lama4', 'dariTabLain']));
cek('klien BERJENDELA tanpa hapus: nol baris hilang', J(hapusYang(DB, ['baru1', 'baru2'], ['baru1', 'baru2'])) === '[]');
cek('berjendela menghapus baru2: hanya baru2', J(hapusYang(DB, ['baru1'], ['baru1', 'baru2'])) === J(['baru2']));
cek('baris tab lain yang belum pernah dilihat tidak ikut terhapus', hapusYang(DB, ['baru1'], ['baru1', 'baru2']).indexOf('dariTabLain') < 0);
cek('kiriman kosong + 4 dikenal: ditahan', J(hapusYang(DB, [], ['lama1', 'lama2', 'lama3', 'lama4'])) === '[]');

console.log(`\nLULUS ${ok}   GAGAL ${gagal}`);
process.exit(gagal ? 1 : 0);
