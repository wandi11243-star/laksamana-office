<?php
/************************************************************************
 * RESERVASI LAKSAMANA MUDA — Backend PHP (cPanel / Rumahweb)
 * ---------------------------------------------------------------------
 * Pengganti backend Google Apps Script. Kontrak API-nya SAMA PERSIS, jadi
 * aplikasi (deploy/reservasi/index.html) tidak perlu diubah logikanya —
 * cukup ganti APPS_SCRIPT_URL ke URL api.php ini.
 *
 * KENAPA PINDAH:
 *   Apps Script menambah ~2-4 detik PER PANGGILAN (redirect /exec ->
 *   googleusercontent.com + cold start + LockService). Diukur: `ping` yang
 *   tidak melakukan apa-apa pun butuh 3,8 detik. Ubah status = getAll+saveAll
 *   = ~5-6 detik. Di hosting sendiri, tiap panggilan ~50-200 ms -> ubah status
 *   bisa di bawah 1 detik.
 *
 * MODEL DATA (sama seperti Apps Script v2):
 *   - db/data.json         : blob JSON utama (TANPA foto). Foto diganti
 *                            penanda "@f:<key>". ~0,2 MB.
 *   - db/files/<key>.txt   : 1 file per foto (base64). Diambil hanya saat
 *                            "Lihat Bukti" / OCR.
 *   Folder db/ dilindungi .htaccess supaya tidak bisa diunduh langsung.
 *
 * File ini HANYA berisi fungsi (tanpa efek samping). Dipakai oleh:
 *   - api.php      : melayani request dari aplikasi.
 *   - migrate.php  : impor sekali-jalan dari Apps Script lama.
 ************************************************************************/

/* ---------- KONFIGURASI ---------- */
// Folder penyimpanan. Default: subfolder "db" di sebelah file ini.
if (!defined('DB_DIR'))   define('DB_DIR',   __DIR__ . '/db');
if (!defined('DATA_FILE')) define('DATA_FILE', DB_DIR . '/data.json');
if (!defined('FILE_DIR'))  define('FILE_DIR',  DB_DIR . '/files');
if (!defined('LOCK_FILE')) define('LOCK_FILE', DB_DIR . '/.lock');
if (!defined('FILE_TAG'))  define('FILE_TAG',  '@f:');

/* ---------- SETUP FOLDER ---------- */
function db_pastikan_folder() {
  if (!is_dir(DB_DIR))   @mkdir(DB_DIR, 0775, true);
  if (!is_dir(FILE_DIR)) @mkdir(FILE_DIR, 0775, true);
  /* Lindungi folder db dari akses langsung lewat browser — tanpa ini, orang bisa
     mengunduh https://…/reservasi-api/db/data.json dan membaca SELURUH database.
     Ditulis dgn penjaga <IfModule> supaya tidak bikin error 500: sintaks Apache 2.4
     (Require) dan 2.2 (Deny) tidak boleh dicampur begitu saja. */
  $ht = DB_DIR . '/.htaccess';
  if (!file_exists($ht)) @file_put_contents($ht,
    "<IfModule mod_authz_core.c>\n  Require all denied\n</IfModule>\n" .
    "<IfModule !mod_authz_core.c>\n  Order allow,deny\n  Deny from all\n</IfModule>\n");
}

/* ---------- KUNCI TULIS (anti tabrakan, seperti LockService) ---------- */
function db_lock() {
  db_pastikan_folder();
  $fh = fopen(LOCK_FILE, 'c');
  if ($fh) flock($fh, LOCK_EX);
  return $fh;
}
function db_unlock($fh) {
  if ($fh) { flock($fh, LOCK_UN); fclose($fh); }
}

/* ---------- BLOB UTAMA ---------- */
function baca_state() {
  if (!file_exists(DATA_FILE)) return array('reservations' => array(), 'master' => null, 'audit' => array());
  $raw = file_get_contents(DATA_FILE);
  if ($raw === false || $raw === '') return array('reservations' => array(), 'master' => null, 'audit' => array());
  $obj = json_decode($raw, true);
  if (!is_array($obj)) return array('reservations' => array(), 'master' => null, 'audit' => array());
  return $obj;
}

// Tulis atomik: tulis ke file sementara lalu rename (rename di filesystem sama = atomik).
function tulis_state($state) {
  db_pastikan_folder();
  $json = json_encode($state, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
  $tmp = DATA_FILE . '.tmp' . getmypid();
  if (file_put_contents($tmp, $json) === false) throw new Exception('Gagal menulis data (cek izin folder db)');
  if (!rename($tmp, DATA_FILE)) { @unlink($tmp); throw new Exception('Gagal menyimpan data (rename)'); }
  return strlen($json);
}

/* ---------- FOTO (db/files) ---------- */
// key aplikasi hanya berisi [a-z0-9:] → ubah ":" jadi "_" (bijektif, tanpa tabrakan).
function file_path($key) {
  $safe = preg_replace('/[^A-Za-z0-9._-]/', '_', (string)$key);
  return FILE_DIR . '/' . $safe . '.txt';
}
function get_file($key) {
  if (!$key) throw new Exception('key kosong');
  $p = file_path($key);
  $data = file_exists($p) ? file_get_contents($p) : '';
  return array('key' => $key, 'data' => $data === false ? '' : $data);
}
function put_file($payload) {
  if (!$payload || empty($payload['key'])) throw new Exception('key kosong');
  db_pastikan_folder();
  $key = $payload['key'];
  $data = isset($payload['data']) ? (string)$payload['data'] : '';
  $p = file_path($key);
  if ($data === '') { if (file_exists($p)) @unlink($p); return array('key' => $key, 'len' => 0, 'deleted' => true); }
  if (file_put_contents($p, $data) === false) throw new Exception('Gagal menulis foto (cek izin folder db/files)');
  return array('key' => $key, 'len' => strlen($data));
}

/* ---------- PEMISAHAN FOTO DARI STATE ----------
   Sama seperti versi Apps Script: foto inline ("data:...") dipindah ke db/files
   dan field-nya diganti penanda "@f:<key>". Aman diulang. */
function is_inline($v) { return is_string($v) && substr($v, 0, 5) === 'data:'; }
function is_ref($v)    { return is_string($v) && substr($v, 0, strlen(FILE_TAG)) === FILE_TAG; }

// Panggil $fn($obj, $field, $key) untuk tiap kemungkinan lokasi foto (by-reference).
function each_file_field(&$state, $fn) {
  if (!empty($state['reservations']) && is_array($state['reservations'])) {
    foreach ($state['reservations'] as &$r) {
      if (empty($r['id'])) continue;
      $fn($r, 'dpProofData', 'r:' . $r['id'] . ':dp');
      $fn($r, 'docReqData',  'r:' . $r['id'] . ':doc');
      if (!empty($r['dps']) && is_array($r['dps'])) {
        foreach ($r['dps'] as &$p) {
          if (!empty($p['id'])) $fn($p, 'proofData', 'p:' . $r['id'] . ':' . $p['id']);
        }
        unset($p);
      }
    }
    unset($r);
  }
  if (!empty($state['master']) && is_array($state['master'])) {
    if (!empty($state['master']['reviews']) && is_array($state['master']['reviews'])) {
      foreach ($state['master']['reviews'] as &$rv) if (!empty($rv['id'])) $fn($rv, 'proofData', 'rv:' . $rv['id']);
      unset($rv);
    }
    if (!empty($state['master']['feedbacks']) && is_array($state['master']['feedbacks'])) {
      foreach ($state['master']['feedbacks'] as &$fb) if (!empty($fb['id'])) $fn($fb, 'proofData', 'fb:' . $fb['id']);
      unset($fb);
    }
  }
}

function externalize(&$state) {
  $moved = 0; $bytes = 0;
  each_file_field($state, function (&$obj, $field, $key) use (&$moved, &$bytes) {
    if (!isset($obj[$field]) || !is_inline($obj[$field])) return;   // penanda/kosong → lewati
    $v = $obj[$field];
    put_file(array('key' => $key, 'data' => $v));
    $obj[$field] = FILE_TAG . $key;
    $moved++; $bytes += strlen($v);
  });
  return array('moved' => $moved, 'bytes' => $bytes);
}

// Hapus foto yang tak lagi dirujuk state (reservasinya dihapus).
function gc_files(&$state) {
  if (!is_dir(FILE_DIR)) return 0;
  $hidup = array();
  each_file_field($state, function (&$obj, $field, $key) use (&$hidup) {
    if (empty($obj[$field])) return;
    // Pakai key yang BENAR-BENAR tertulis di penanda, bukan hanya key hasil hitung.
    // Kalau keduanya beda (mis. data dari server lama dgn penamaan berbeda), memakai
    // key hitung akan membuat file yang masih dipakai dianggap yatim lalu DIHAPUS.
    if (is_ref($obj[$field])) $hidup[substr($obj[$field], strlen(FILE_TAG))] = true;
    $hidup[$key] = true;
  });
  // ubah set key -> nama file aman
  $hidupFile = array();
  foreach ($hidup as $k => $_) $hidupFile[basename(file_path($k))] = true;
  $buang = 0;
  foreach (scandir(FILE_DIR) as $f) {
    if ($f === '.' || $f === '..' || substr($f, -4) !== '.txt') continue;
    if (empty($hidupFile[$f])) { @unlink(FILE_DIR . '/' . $f); $buang++; }
  }
  return $buang;
}

/* ---------- SIMPAN (dipanggil di dalam kunci) ---------- */
function save_all($state) {
  if (!is_array($state)) throw new Exception('Payload data kosong/invalid');
  $ext = externalize($state);      // jaring pengaman: foto inline → db/files
  $buang = gc_files($state);
  $len = tulis_state($state);
  return array(
    'saved' => true,
    'reservations' => isset($state['reservations']) ? count($state['reservations']) : 0,
    'audit' => isset($state['audit']) ? count($state['audit']) : 0,
    'blobChars' => $len,
    'fotoDipisah' => $ext['moved'],
    'fotoDihapus' => $buang,
    'ts' => gmdate('c')
  );
}

/* ---------- DIAGNOSTIK ---------- */
function stats() {
  $state = baca_state();
  $blob = strlen(json_encode($state, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
  $inline = 0; $ref = 0;
  each_file_field($state, function (&$obj, $field, $key) use (&$inline, &$ref) {
    if (!isset($obj[$field])) return;
    if (is_inline($obj[$field])) $inline++;
    else if (is_ref($obj[$field])) $ref++;
  });
  $nfile = 0;
  if (is_dir(FILE_DIR)) foreach (scandir(FILE_DIR) as $f) if (substr($f, -4) === '.txt') $nfile++;
  return array(
    'backend' => 'php',
    'blobChars' => $blob,
    'blobMB' => round($blob / 1048576, 3),
    'reservations' => isset($state['reservations']) ? count($state['reservations']) : 0,
    'fotoMasihInline' => $inline,     // idealnya 0
    'fotoSudahDipisah' => $ref,
    'fileFoto' => $nfile
  );
}
