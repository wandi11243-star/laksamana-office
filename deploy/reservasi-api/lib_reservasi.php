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
 *   - <data>/data.json       : blob JSON utama (TANPA foto). Foto diganti
 *                              penanda "@f:<key>". ~0,2 MB.
 *   - <data>/files/<key>.txt : 1 file per foto (base64). Diambil hanya saat
 *                              "Lihat Bukti" / OCR.
 *   <data> = /home/<user>/reservasi-db — sengaja DI LUAR public_html: tidak
 *   tersentuh deploy FTP, dan tidak bisa diunduh lewat browser. Lihat db_dir().
 *
 * File ini HANYA berisi fungsi (tanpa efek samping). Dipakai oleh:
 *   - api.php      : melayani request dari aplikasi.
 *   - migrate.php  : impor sekali-jalan dari Apps Script lama.
 ************************************************************************/

/* ---------- KONFIGURASI PENYIMPANAN ----------
   PENTING — folder data HARUS di LUAR folder yang di-deploy.

   Repo ini punya workflow FTP: isi ./deploy/ disalin ke /public_html/office/
   setiap kali push. File ini berada di deploy/reservasi-api/ → di server jadi
   /home/<user>/public_html/office/reservasi-api/.
   Kalau data ditaruh di dalam folder itu juga, ada dua bahaya:
     1. Deploy berikutnya bisa MENGHAPUS/menimpanya → SELURUH DATABASE HILANG.
     2. data.json bisa diunduh siapa pun lewat browser (hanya dilindungi .htaccess).

   Maka default-nya naik 3 tingkat, keluar dari public_html:
     __DIR__                        = /home/<user>/public_html/office/reservasi-api
     __DIR__/../../../reservasi-db  = /home/<user>/reservasi-db      <- AMAN
   Tidak tersentuh deploy, dan tidak bisa diakses lewat web sama sekali.

   Kalau path itu tidak bisa dibuat (izin hosting), otomatis mundur ke ./db
   di sebelah file ini + .htaccess. Cek yang terpakai lewat ?action=stats. */
if (!defined('FILE_TAG')) define('FILE_TAG', '@f:');

function db_dir() {
  static $dir = null;
  if ($dir !== null) return $dir;

  $luar = __DIR__ . '/../../../reservasi-db';        // di luar public_html (disarankan)
  $dalam = __DIR__ . '/db';                          // cadangan (kurang aman)

  if (is_dir($luar) || @mkdir($luar, 0775, true))    $dir = $luar;
  else if (is_dir($dalam) || @mkdir($dalam, 0775, true)) $dir = $dalam;
  else throw new Exception('Tidak bisa membuat folder data. Cek izin tulis di hosting.');

  $dir = realpath($dir) ?: $dir;
  return $dir;
}
function data_file() { return db_dir() . '/data.json'; }
function file_dir()  { return db_dir() . '/files'; }
function lock_file() { return db_dir() . '/.lock'; }
function ver_file()  { return db_dir() . '/data.ver'; }
// true kalau data terpaksa disimpan di dalam public_html (perlu .htaccess)
function db_di_dalam_web() { return strpos(db_dir(), realpath(__DIR__)) === 0; }

/* ---------- SETUP FOLDER ---------- */
function db_pastikan_folder() {
  $dir = db_dir();
  if (!is_dir(file_dir())) @mkdir(file_dir(), 0775, true);
  if (!db_di_dalam_web()) return;                    // di luar web root → tak perlu .htaccess
  /* Cadangan: kalau terpaksa di dalam public_html, tutup aksesnya. Tanpa ini orang bisa
     mengunduh …/reservasi-api/db/data.json dan membaca SELURUH database.
     Pakai penjaga <IfModule> supaya tidak bikin error 500 — sintaks Apache 2.4 (Require)
     dan 2.2 (Deny) tidak boleh dicampur begitu saja. */
  $ht = $dir . '/.htaccess';
  if (!file_exists($ht)) @file_put_contents($ht,
    "<IfModule mod_authz_core.c>\n  Require all denied\n</IfModule>\n" .
    "<IfModule !mod_authz_core.c>\n  Order allow,deny\n  Deny from all\n</IfModule>\n");
}

/* ---------- KUNCI TULIS (anti tabrakan, seperti LockService) ---------- */
function db_lock() {
  db_pastikan_folder();
  $fh = fopen(lock_file(), 'c');
  if ($fh) flock($fh, LOCK_EX);
  return $fh;
}
function db_unlock($fh) {
  if ($fh) { flock($fh, LOCK_UN); fclose($fh); }
}

/* ---------- BLOB UTAMA ---------- */
function baca_state() {
  if (!file_exists(data_file())) return array('reservations' => array(), 'master' => null, 'audit' => array());
  $raw = file_get_contents(data_file());
  if ($raw === false || $raw === '') return array('reservations' => array(), 'master' => null, 'audit' => array());
  $obj = json_decode($raw, true);
  if (!is_array($obj)) return array('reservations' => array(), 'master' => null, 'audit' => array());
  return $obj;
}

/* ---------- NOMOR VERSI (anti timpa / optimistic locking) ----------
   Tiap kali data disimpan, nomor versi naik 1. Klien membaca nomor versi saat getAll,
   lalu menyertakannya kembali saat saveAll. Kalau di server versinya sudah BEDA (kru lain
   menyelip menyimpan lebih dulu), tulisan ditolak — klien tarik ulang, gabungkan, coba lagi.
   Ini yang mencegah "tulisan kru terakhir menimpa yang sudah berhasil duluan".
   Dibaca/ditulis di dalam db_lock() saat save, jadi naik-turunnya atomik. */
function read_ver() {
  $p = ver_file();
  if (!file_exists($p)) return 0;
  $v = trim((string)@file_get_contents($p));
  return ($v === '' || !ctype_digit($v)) ? 0 : (int)$v;
}
function write_ver($v) {
  db_pastikan_folder();
  $tmp = ver_file() . '.tmp' . getmypid();
  @file_put_contents($tmp, (string)((int)$v));
  @rename($tmp, ver_file());
}

// Tulis atomik: tulis ke file sementara lalu rename (rename di filesystem sama = atomik).
function tulis_state($state) {
  db_pastikan_folder();
  $json = json_encode($state, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
  $tmp = data_file() . '.tmp' . getmypid();
  if (file_put_contents($tmp, $json) === false) throw new Exception('Gagal menulis data (cek izin folder db)');
  if (!rename($tmp, data_file())) { @unlink($tmp); throw new Exception('Gagal menyimpan data (rename)'); }
  return strlen($json);
}

/* ---------- FOTO (db/files) ---------- */
// key aplikasi hanya berisi [a-z0-9:] → ubah ":" jadi "_" (bijektif, tanpa tabrakan).
function file_path($key) {
  $safe = preg_replace('/[^A-Za-z0-9._-]/', '_', (string)$key);
  return file_dir() . '/' . $safe . '.txt';
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
  if (!is_dir(file_dir())) return 0;
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
  foreach (scandir(file_dir()) as $f) {
    if ($f === '.' || $f === '..' || substr($f, -4) !== '.txt') continue;
    if (empty($hidupFile[$f])) { @unlink(file_dir() . '/' . $f); $buang++; }
  }
  return $buang;
}

/* ---------- SIMPAN (dipanggil di dalam kunci) ----------
   $baseVer = nomor versi yang KLIEN lihat terakhir. Kalau tidak cocok dengan versi server
   sekarang, berarti ada kru lain yang menyimpan lebih dulu → TOLAK (conflict). Klien akan
   tarik ulang + gabung + coba lagi. $baseVer null = klien lama tanpa penjaga versi → tetap
   dilayani (timpa) demi kompatibilitas saat masa transisi deploy. */
function save_all($state, $baseVer = null) {
  if (!is_array($state)) throw new Exception('Payload data kosong/invalid');
  $curVer = read_ver();
  if ($baseVer !== null && $baseVer !== '' && (string)$baseVer !== (string)$curVer) {
    // Bukan error — kondisi normal saat dua kru menyimpan hampir bersamaan.
    return array('conflict' => true, 'saved' => false, 'ver' => $curVer);
  }
  unset($state['_ver']);           // jangan simpan nomor versi ke dalam blob
  $ext = externalize($state);      // jaring pengaman: foto inline → db/files
  $buang = gc_files($state);
  $len = tulis_state($state);
  $newVer = $curVer + 1;
  write_ver($newVer);
  return array(
    'saved' => true,
    'ver' => $newVer,
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
  if (is_dir(file_dir())) foreach (scandir(file_dir()) as $f) if (substr($f, -4) === '.txt') $nfile++;
  return array(
    'backend' => 'php',
    'blobChars' => $blob,
    'blobMB' => round($blob / 1048576, 3),
    'reservations' => isset($state['reservations']) ? count($state['reservations']) : 0,
    'fotoMasihInline' => $inline,     // idealnya 0
    'fotoSudahDipisah' => $ref,
    'fileFoto' => $nfile,
    // Diagnostik lokasi data — "amanDiLuarWeb" HARUS true. Kalau false, data ada
    // di dalam public_html: berisiko tertimpa deploy FTP & hanya dilindungi .htaccess.
    'folderData' => db_dir(),
    'amanDiLuarWeb' => !db_di_dalam_web()
  );
}
