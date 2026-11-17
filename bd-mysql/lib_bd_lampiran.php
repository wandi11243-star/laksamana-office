<?php
/************************************************************************
 * BD OS — LAMPIRAN SUB-TASK (17 November 2026)
 * ---------------------------------------------------------------------
 * Permintaan user: sub-task bisa diberi catatan dan lampiran (berkas /
 * gambar), di Office lama DAN Office baru (laksamana-office-vue).
 *
 * Berkasnya di DISK, bukan di baris task. Baris task cuma menyimpan
 * rujukannya di sub-task: subtasks[].files = [{key,name,mime,size}].
 * Alasannya: seluruh papan ikut getAll tiap polling — gambar base64 di
 * dalam `data` akan membuat setiap tarikan membengkak berkali lipat.
 *
 * ATURAN YANG SAMA PERSIS DENGAN laksamana-api (BdFiles.php) — kedua
 * backend boleh memakai folder yang SAMA supaya lampiran dari Office lama
 * terbuka di Office baru dan sebaliknya:
 *   - kunci   bdf_<16 hex>.<ext>   di   <BD_DATA_DIR>/lampiran/
 *   - jenis   gambar, PDF, Word, Excel, PowerPoint, TXT, CSV; maks 8 MB
 *   - berkas YATIM (tidak dirujuk task mana pun) dihapus SATU JAM setelah
 *     diunggah — unggah dan simpan adalah dua langkah, tanpa jeda itu
 *     berkas yang baru diunggah orang lain bisa terhapus sebelum
 *     tersimpan. Kunci yang hidup dibaca dari DATABASE, tidak pernah dari
 *     kiriman.
 *
 * LOKASI: konstanta BD_DATA_DIR di config.php kalau ada; kalau tidak,
 * folder `bd-db` di samping folder backend ini (= di web root situsnya
 * sendiri, jadi dev dan produksi otomatis terpisah), dikunci .htaccess.
 * Di luar folder bd-api-mysql supaya sinkronisasi FTP tidak pernah
 * menyentuhnya. Untuk berbagi dengan laksamana-api, setel BD_DATA_DIR di
 * env Laravel ke folder yang SAMA (dev ke folder dev, produksi ke folder
 * produksi — jangan pernah disilang: pembersihannya membaca database
 * situsnya sendiri).
 ************************************************************************/

const BD_LAMPIRAN_MAKS = 8388608;   // 8 MB
const BD_LAMPIRAN_JEDA = 3600;      // detik sebelum berkas yatim boleh dibuang
const BD_LAMPIRAN_JENIS = array(
  'jpg' => 'image/jpeg', 'png' => 'image/png', 'webp' => 'image/webp', 'gif' => 'image/gif', 'heic' => 'image/heic',
  'pdf' => 'application/pdf',
  'doc' => 'application/msword',
  'docx' => 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'xls' => 'application/vnd.ms-excel',
  'xlsx' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'ppt' => 'application/vnd.ms-powerpoint',
  'pptx' => 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'txt' => 'text/plain', 'csv' => 'text/csv',
);

function lampiran_dir() {
  $d = (defined('BD_DATA_DIR') && BD_DATA_DIR !== '') ? BD_DATA_DIR : dirname(__DIR__) . '/bd-db';
  if (!is_dir($d) && !@mkdir($d, 0775, true)) throw new RuntimeException('Folder lampiran tidak bisa dibuat.');
  // Folder ini bisa berada di web root: tolak akses langsung lewat URL.
  $ht = $d . '/.htaccess';
  if (!file_exists($ht)) {
    @file_put_contents($ht, "<IfModule mod_authz_core.c>\n  Require all denied\n</IfModule>\n<IfModule !mod_authz_core.c>\n  Order allow,deny\n  Deny from all\n</IfModule>\n");
  }
  $f = $d . '/lampiran';
  if (!is_dir($f)) @mkdir($f, 0775, true);
  return $f;
}

function lampiran_kunci_sah($k) {
  return is_string($k) && preg_match('/^bdf_[a-f0-9]{16}\.[a-z0-9]{2,5}$/', $k);
}

/* Ekstensi simpanan dari mime / nama berkas; null = jenis tidak diterima. */
function lampiran_ext($mime, $nama) {
  $mime = strtolower(trim((string)$mime));
  if ($mime === 'image/jpg') $mime = 'image/jpeg';
  $e = array_search($mime, BD_LAMPIRAN_JENIS, true);
  if ($e !== false) return $e;
  $e = strtolower(pathinfo((string)$nama, PATHINFO_EXTENSION));
  if ($e === 'jpeg') $e = 'jpg';
  return array_key_exists($e, BD_LAMPIRAN_JENIS) ? $e : null;
}

/* {dataBase64, fileName, mimeType} -> {key, name, mime, size}. Galat = pesan untuk kru. */
function lampiran_unggah($b) {
  $nama = trim(str_replace(array("\r", "\n", '/', '\\'), ' ', (string)(isset($b['fileName']) ? $b['fileName'] : '')));
  $isi = (string)(isset($b['dataBase64']) ? $b['dataBase64'] : '');
  if ($isi === '') throw new RuntimeException('Berkas kosong.');
  $ext = lampiran_ext(isset($b['mimeType']) ? $b['mimeType'] : '', $nama);
  if ($ext === null) throw new RuntimeException('Jenis berkas tidak didukung. Pakai gambar, PDF, Word, Excel, PowerPoint, TXT atau CSV.');
  $bin = base64_decode(preg_replace('#^data:[^,]*,#', '', $isi), true);
  if ($bin === false || $bin === '') throw new RuntimeException('Isi berkas tidak terbaca.');
  if (strlen($bin) > BD_LAMPIRAN_MAKS) throw new RuntimeException('Berkas melebihi 8 MB.');
  $kunci = 'bdf_' . bin2hex(random_bytes(8)) . '.' . $ext;
  if (file_put_contents(lampiran_dir() . '/' . $kunci, $bin) === false) {
    throw new RuntimeException('Gagal menulis berkas di server (cek izin folder).');
  }
  try { lampiran_bersihkan(); } catch (Throwable $e) { /* pembersihan boleh gagal; unggahnya sudah jadi */ }
  return array('key' => $kunci, 'name' => mb_substr($nama !== '' ? $nama : $kunci, 0, 160),
               'mime' => BD_LAMPIRAN_JENIS[$ext], 'size' => strlen($bin));
}

/* Kunci yang masih dirujuk baris task mana pun — dibaca dari DATABASE. */
function lampiran_hidup() {
  $hidup = array();
  $st = db()->query("SELECT `data` FROM `tasks` WHERE `data` LIKE '%bdf\\_%'");
  foreach ($st->fetchAll(PDO::FETCH_COLUMN) as $data) {
    if (preg_match_all('/bdf_[a-f0-9]{16}\.[a-z0-9]{2,5}/', (string)$data, $m)) {
      foreach ($m[0] as $k) $hidup[$k] = true;
    }
  }
  return $hidup;
}

/* Buang berkas yatim yang umurnya lewat BD_LAMPIRAN_JEDA. */
function lampiran_bersihkan() {
  $dir = lampiran_dir();
  $hidup = lampiran_hidup();
  $batas = time() - BD_LAMPIRAN_JEDA;
  $n = 0;
  foreach (scandir($dir) ?: array() as $f) {
    if (!lampiran_kunci_sah($f) || isset($hidup[$f])) continue;
    $p = $dir . '/' . $f;
    if (is_file($p) && filemtime($p) <= $batas && @unlink($p)) $n++;
  }
  return $n;
}

/* Kirim berkas apa adanya (inline). Keluar dengan 404 kalau kuncinya tidak ada. */
function lampiran_kirim($kunci, $nama = '') {
  $p = lampiran_kunci_sah($kunci) ? lampiran_dir() . '/' . $kunci : '';
  if ($p === '' || !is_file($p)) { http_response_code(404); header('Content-Type: text/plain; charset=utf-8'); echo 'Lampiran tidak ditemukan.'; exit; }
  $ext = pathinfo($kunci, PATHINFO_EXTENSION);
  $nama = trim((string)$nama) !== '' ? preg_replace('/[^\w .()-]/u', '_', (string)$nama) : $kunci;
  header('Content-Type: ' . (array_key_exists($ext, BD_LAMPIRAN_JENIS) ? BD_LAMPIRAN_JENIS[$ext] : 'application/octet-stream'));
  header('Content-Length: ' . filesize($p));
  header('Content-Disposition: inline; filename="' . $nama . '"');
  header('Cache-Control: private, max-age=86400');
  header('X-Content-Type-Options: nosniff');
  readfile($p);
  exit;
}
