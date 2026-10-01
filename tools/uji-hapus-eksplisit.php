<?php
/************************************************************************
 * Uji PENGHAPUSAN EKSPLISIT (mode simpan parsial) — dijalankan atas KODE PHP
 * yang sesungguhnya, bukan tiruan JS.
 *
 * Kenapa ada: server tiruan di uji-delta-konten.js / uji-delta-marketing.js
 * MENIRU aturan ini, jadi ia hanya bisa membuktikan klien mengirim yang benar
 * — bukan bahwa PHP-nya berperilaku benar. Penjaga "hanya tahan yang akan
 * mengosongkan tabel" adalah perubahan yang gampang salah dan akibatnya
 * SENYAP (baris muncul lagi sesudah refresh), jadi ia dijalankan di sini.
 *
 * Fungsi di-ekstrak dari berkas lib, tidak disalin — salinan yang diuji bukan
 * salinan yang dipakai.
 *
 *   php tools/uji-hapus-eksplisit.php
 ************************************************************************/

$ROOT = dirname(__DIR__);
$sumber = array(
  'konten'    => file_get_contents($ROOT . '/konten-mysql/lib_konten_mysql.php'),
  'marketing' => file_get_contents($ROOT . '/marketing-mysql/lib_marketing_mysql.php'),
);
$namaFn = array('konten' => 'hapus_id_eksplisit', 'marketing' => 'mkt_hapus_eksplisit');

/* Ambil badan fungsi apa adanya (kurung kurawal dihitung; badan kedua fungsi
   ini tidak memuat '{' di dalam string). */
function ambil_fungsi($src, $nama) {
  $i = strpos($src, 'function ' . $nama . '(');
  if ($i === false) { fwrite(STDERR, "fungsi $nama tidak ketemu\n"); exit(2); }
  $j = strpos($src, '{', $i);
  $depth = 0; $k = $j; $n = strlen($src);
  for (; $k < $n; $k++) {
    if ($src[$k] === '{') $depth++;
    elseif ($src[$k] === '}') { $depth--; if ($depth === 0) { $k++; break; } }
  }
  return substr($src, $i, $k - $i);
}

$ok = 0; $gagal = 0;
function cek($nama, $syarat, $ket = '') {
  global $ok, $gagal;
  if ($syarat) { $ok++; echo "  OK   $nama\n"; }
  else { $gagal++; echo "  GAGAL $nama" . ($ket !== '' ? "  -> $ket" : '') . "\n"; }
}

/* Tabel kecil di SQLite; fungsi hanya butuh id, prepare, COUNT(*), fetchColumn,
   rowCount, dan DELETE ... IN (?) — semuanya sama di MySQL. */
function tabel($pdo, $ids) {
  $pdo->exec('DROP TABLE IF EXISTS t');
  $pdo->exec('CREATE TABLE t (id TEXT PRIMARY KEY)');
  $st = $pdo->prepare('INSERT INTO t (id) VALUES (?)');
  foreach ($ids as $id) $st->execute(array($id));
}
function isi_tabel($pdo) {
  $out = array();
  foreach ($pdo->query('SELECT id FROM t ORDER BY id') as $r) $out[] = $r['id'];
  return $out;
}

foreach (array('konten', 'marketing') as $mod) {
  $fn = $namaFn[$mod];
  /* eval() menerima kode PHP tanpa tag; badan fungsi ini tidak memuat `?>`. */
  eval(ambil_fungsi($sumber[$mod], $fn));
  $pdo = new PDO('sqlite::memory:');
  $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

  echo "\n== $fn ($mod) ==\n";

  /* 1. Hapus 5 dari 6 (>3) TETAP JALAN — inilah bug hapus berantai. */
  tabel($pdo, array('a1','a2','a3','a4','a5','a6'));
  $fn($pdo, 't', array(), array('a1','a2','a3','a4','a5'));
  cek('hapus >3 baris JALAN selama tabel tidak kosong',
      isi_tabel($pdo) === array('a6'), implode(',', isi_tabel($pdo)));

  /* 2. Hapus 4 dari 4 (>3) MENGOSONGKAN tabel -> DITAHAN. */
  tabel($pdo, array('b1','b2','b3','b4'));
  $fn($pdo, 't', array(), array('b1','b2','b3','b4'));
  cek('hapus yang MENGOSONGKAN tabel ditahan',
      isi_tabel($pdo) === array('b1','b2','b3','b4'), implode(',', isi_tabel($pdo)));

  /* 3. Hapus 3 baris (<=3) tetap jalan walau tabel jadi kosong. */
  tabel($pdo, array('c1','c2','c3'));
  $fn($pdo, 't', array(), array('c1','c2','c3'));
  cek('hapus 3 baris (<=3) JALAN walau jadi kosong', isi_tabel($pdo) === array(), implode(',', isi_tabel($pdo)));

  /* 4. Baris sisa menghitung baris yang BARU DI-INSERT dalam simpan yang sama
        (upsert dijalankan sebelum hapus) — bukan mengosongkan. */
  tabel($pdo, array('d1','d2','d3','d4'));
  $st = $pdo->prepare('INSERT INTO t (id) VALUES (?)'); $st->execute(array('baru'));
  $fn($pdo, 't', array(), array('d1','d2','d3','d4'));
  cek('baris baru ikut dihitung sebagai sisa -> hapus lanjut',
      isi_tabel($pdo) === array('baru'), implode(',', isi_tabel($pdo)));

  /* 5. Daftar kosong = tidak menyentuh apa pun. */
  tabel($pdo, array('e1','e2','e3','e4'));
  $fn($pdo, 't', array(), array());
  cek('daftar hapus kosong tidak menyentuh tabel',
      isi_tabel($pdo) === array('e1','e2','e3','e4'));

  /* 6. Daftar berisi id yang tidak ada = aman (idempoten). */
  tabel($pdo, array('f1'));
  $fn($pdo, 't', array(), array('f1','f2','f3','f4','f5'));
  cek('id yang tidak ada diabaikan, sisa dihitung dengan benar',
      isi_tabel($pdo) === array('f1'), implode(',', isi_tabel($pdo)));
}

echo "\n---------------------------------------\n";
echo "LULUS $ok   GAGAL $gagal\n";
exit($gagal ? 1 : 0);
