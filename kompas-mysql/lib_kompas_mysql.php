<?php
/************************************************************************
 * KOMPAS LAKSAMANA — Backend PHP + MySQL (Target & Omset Tracker)
 * ---------------------------------------------------------------------
 * PENYIMPAN BLOB JSON SATU BARIS.
 *
 * Modul ini dipakai HANYA oleh superadmin (satu penyunting), dan bentuk
 * datanya berkembang bebas di sisi aplikasi (omset harian, breakdown
 * marketing/event/kasir, target per PIC, dst). Menyimpannya sebagai satu
 * blob JSON membuat backend tidak perlu tahu bentuknya — apa pun yang
 * dikirim aplikasi disimpan apa adanya dan dikembalikan utuh. Tidak ada
 * ekstraksi kolom yang bisa rusak begitu bentuk data berubah.
 *
 * Tabel `daily/targets/cashiers/pics/settings/log` dari versi lama SENGAJA
 * tidak disentuh (dibiarkan sebagai cadangan data lama), backend baru hanya
 * memakai tabel `app_state`.
 *
 * File ini HANYA berisi fungsi (tanpa efek samping saat di-include).
 ************************************************************************/

if (file_exists(__DIR__ . '/config.local.php')) require_once __DIR__ . '/config.local.php';
else                                            require_once __DIR__ . '/config.php';

function db() {
  static $pdo = null;
  if ($pdo !== null) return $pdo;
  $dsn = 'mysql:host=' . DB_HOST . ';port=' . DB_PORT . ';dbname=' . DB_NAME . ';charset=' . DB_CHARSET;
  $pdo = new PDO($dsn, DB_USER, DB_PASS, array(
    PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    PDO::ATTR_EMULATE_PREPARES   => false,
  ));
  return $pdo;
}
function db_lock() {
  $st = db()->prepare('SELECT GET_LOCK(:k, 10) AS ok');
  $st->execute(array(':k' => DB_NAME . ':kompas_save'));
  $row = $st->fetch();
  if (empty($row['ok'])) throw new Exception('Server sedang sibuk menyimpan, coba lagi sebentar.');
  return true;
}
function db_unlock($h) {
  if (!$h) return;
  $st = db()->prepare('SELECT RELEASE_LOCK(:k)');
  $st->execute(array(':k' => DB_NAME . ':kompas_save'));
}

function json_enc($v) { return json_encode($v, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES); }
function json_dec($s) { $v = json_decode((string)$s); return $v === null ? new stdClass() : $v; }

/* Buat tabel blob kalau belum ada — dijalankan sebelum menyimpan, jadi tidak
   perlu migrasi manual: baris pertama yang disimpan sekaligus membuat tabelnya. */
function pastikan_tabel($pdo) {
  $pdo->exec(
    'CREATE TABLE IF NOT EXISTS `app_state` (
       `id` TINYINT UNSIGNED NOT NULL PRIMARY KEY,
       `data` LONGTEXT NOT NULL,
       `updated_at` BIGINT NOT NULL DEFAULT 0,
       `updated_by` VARCHAR(120) NOT NULL DEFAULT \'\'
     ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci');
}

/* ==================== BACA ====================
   Tahan banting kalau tabel belum ada (mis. sebelum penyimpanan pertama):
   kembalikan objek kosong, biar aplikasi mulai dari state default, bukan
   error. */
function baca_state() {
  try {
    $row = db()->query('SELECT `data` FROM `app_state` WHERE `id`=1')->fetch();
    if (!$row || $row['data'] === null || $row['data'] === '') return new stdClass();
    return json_dec($row['data']);
  } catch (Throwable $e) {
    return new stdClass();
  }
}

/* ==================== SIMPAN ====================
   Seluruh state ditimpa sebagai satu blob. Aman untuk satu penyunting;
   db_lock() di api.php mencegah dua penyimpanan bertabrakan. */
function save_all($state) {
  if (!is_array($state) && !is_object($state)) throw new Exception('Payload kosong/invalid');
  $pdo = db();
  pastikan_tabel($pdo);
  $ub = '';
  if (is_object($state) && isset($state->_savedBy)) $ub = (string)$state->_savedBy;
  else if (is_array($state) && isset($state['_savedBy'])) $ub = (string)$state['_savedBy'];
  $st = $pdo->prepare(
    'INSERT INTO `app_state` (`id`,`data`,`updated_at`,`updated_by`) VALUES (1,:d,:ua,:ub)
     ON DUPLICATE KEY UPDATE `data`=VALUES(`data`), `updated_at`=VALUES(`updated_at`), `updated_by`=VALUES(`updated_by`)');
  $st->execute(array(
    ':d'  => json_enc($state),
    ':ua' => (int)(microtime(true) * 1000),
    ':ub' => $ub,
  ));
  return array('saved' => true, 'ts' => gmdate('c'));
}

/* ==================== DIAGNOSTIK ==================== */
function ping() {
  return array('pong' => true, 'backend' => 'php-mysql',
               'env' => defined('ENV_LABEL') ? ENV_LABEL : '?',
               'db' => DB_NAME, 'ts' => gmdate('c'));
}
function stats() {
  $out = array('backend' => 'php-mysql',
               'env' => defined('ENV_LABEL') ? ENV_LABEL : '?', 'db' => DB_NAME,
               'bytes' => 0, 'updated_at' => 0, 'ada' => false);
  try {
    $row = db()->query('SELECT LENGTH(`data`) n, `updated_at` FROM `app_state` WHERE `id`=1')->fetch();
    if ($row) { $out['bytes'] = (int)$row['n']; $out['updated_at'] = (int)$row['updated_at']; $out['ada'] = true; }
  } catch (Throwable $e) { /* tabel belum dibuat — biarkan nol, bukan error */ }
  $out['ts'] = gmdate('c');
  return $out;
}
