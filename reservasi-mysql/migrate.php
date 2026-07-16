<?php
/************************************************************************
 * RESERVASI LAKSAMANA MUDA — Migrasi data.json -> MySQL (sekali jalan)
 * ---------------------------------------------------------------------
 * Membaca file data.json (dari backend PHP-file yang sekarang) lalu
 * memasukkannya ke MySQL. Aman diulang (UPSERT / INSERT IGNORE).
 *
 * CARA PAKAI:
 *   A. Lewat CLI (kalau ada SSH / cPanel Terminal) — DISARANKAN:
 *        php migrate.php /home/lakk5493/reservasi-db/data.json
 *      Tanpa argumen, default membaca <DATA_DIR>/data.json.
 *
 *   B. Lewat browser (kalau tak ada CLI):
 *        upload folder ini, buka:
 *        https://.../reservasi-api-mysql/migrate.php?confirm=YA&file=/home/lakk5493/reservasi-db/data.json
 *      (butuh ?confirm=YA supaya tidak jalan tak sengaja)
 *
 * CATATAN:
 *   - Foto TIDAK ikut dipindah — tetap di disk (folder files yang sama).
 *     Pastikan config.php DATA_DIR menunjuk ke folder foto yang benar bila perlu.
 *   - Jalankan schema.sql DULU (buat tabel) sebelum migrasi ini.
 ************************************************************************/

require __DIR__ . '/lib_reservasi_mysql.php';

$isCli = (php_sapi_name() === 'cli');

if (!$isCli) {
  header('Content-Type: text/plain; charset=utf-8');
  if (($_GET['confirm'] ?? '') !== 'YA') {
    exit("Tambahkan ?confirm=YA untuk menjalankan migrasi.\n" .
         "Opsional &file=/path/ke/data.json (default: <DATA_DIR>/data.json)\n");
  }
}

// tentukan path data.json
$path = $isCli
  ? ($argv[1] ?? (db_dir() . '/data.json'))
  : (($_GET['file'] ?? '') !== '' ? $_GET['file'] : (db_dir() . '/data.json'));

function say($s) { echo $s . "\n"; }

say('== MIGRASI data.json -> MySQL ==');
say('Sumber : ' . $path);
say('Target : ' . DB_NAME . ' @ ' . DB_HOST);

if (!file_exists($path)) { say('GAGAL: file tidak ditemukan.'); exit(1); }
$raw = file_get_contents($path);
$state = json_decode($raw, true);
if (!is_array($state)) { say('GAGAL: data.json tidak bisa dibaca sebagai JSON.'); exit(1); }

$nRes   = isset($state['reservations']) && is_array($state['reservations']) ? count($state['reservations']) : 0;
$nAudit = isset($state['audit']) && is_array($state['audit']) ? count($state['audit']) : 0;
say("Ditemukan di file: $nRes reservasi, $nAudit audit.");

// pastikan tabel sudah ada
try {
  db()->query('SELECT 1 FROM reservations LIMIT 1');
} catch (Throwable $e) {
  say('GAGAL: tabel belum ada. Jalankan schema.sql dulu. Detail: ' . $e->getMessage());
  exit(1);
}

// jalankan lewat save_all (idempoten, per-baris, dalam transaksi)
$lock = db_lock();
try {
  $out = save_all($state);
} catch (Throwable $e) {
  db_unlock($lock);
  say('GAGAL saat menyimpan: ' . $e->getMessage());
  exit(1);
}
db_unlock($lock);

// verifikasi jumlah di MySQL
$cek = stats();
say('');
say('== SELESAI ==');
say("Masuk MySQL : {$cek['reservations']} reservasi (file: $nRes)");
say("Foto inline : {$cek['fotoMasihInline']} (idealnya 0)");
say("Foto dipisah: {$cek['fotoSudahDipisah']}");
say("File foto   : {$cek['fileFoto']}");

if ((int)$cek['reservations'] === (int)$nRes) {
  say('OK: jumlah reservasi COCOK. Migrasi berhasil.');
} else {
  say('PERHATIAN: jumlah reservasi TIDAK cocok — perincian di atas, cek ada id kosong/duplikat.');
}
