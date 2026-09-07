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

/* Versi blob yang sedang tersimpan. Dipakai penjaga tulis-basi di save_all()
   dan dikirim ke klien lewat getAll, supaya klien tahu ia sedang memegang
   salinan yang mana. */
function state_ts() {
  try {
    $row = db()->query('SELECT `updated_at` FROM `app_state` WHERE `id`=1')->fetch();
    return $row ? (int)$row['updated_at'] : 0;
  } catch (Throwable $e) {
    return 0;
  }
}

/* ==================== SIMPAN ====================
   Seluruh state ditimpa sebagai satu blob.

   KOMENTAR LAMA DI SINI KELIRU, dan kekeliruannya memakan data produksi: ia
   menyebut db_lock() "mencegah dua penyimpanan bertabrakan". db_lock hanya
   mencegah dua penyimpanan berjalan BERSAMAAN — ia tidak tahu apa-apa soal
   penyimpanan yang datang dari salinan BASI, dan justru itu yang berbahaya.

   Kejadian 7 September 2026: tax 23 Agustus dibetulkan dari 2.514 jadi
   2.514.400 lewat Input Omset Harian, tersimpan benar (hard refresh
   membuktikannya), lalu beberapa menit kemudian kembali ke 2.514. Sebabnya
   tab lain — Cashier, atau Omset di perangkat lain — yang masih memegang
   snapshot sebelum koreksi itu menyimpan sesuatu; karena saveAll mengirim
   SELURUH state, snapshot lamanya menimpa seluruh blob. Tidak ada satu pun
   galat: dari sisi server itu penyimpanan yang sah.

   PENJAGANYA: klien mengirim baseTs — versi yang ia muat. Kalau versi di
   server sudah bergerak sejak itu, penyimpanan DITOLAK dan yang menimpanya
   disebutkan namanya. Yang ditolak TIDAK kehilangan apa pun: datanya masih
   ada di layar dan di localStorage klien.

   baseTs kosong = klien versi lama, yaitu tab yang dibuka sebelum perbaikan
   ini ter-deploy → dibiarkan lewat, perilaku lama. Menolaknya akan membuat
   seluruh penyimpanan mati untuk siapa pun yang halamannya masih ter-cache,
   termasuk kalau PHP-nya lebih dulu mendarat daripada HTML-nya — dan di repo
   ini urutan pendaratan FTP memang tidak bisa dijamin. Lubang itu menutup
   sendiri begitu tiap orang memuat ulang sekali. */
function save_all($state, $baseTs = null) {
  if (!is_array($state) && !is_object($state)) throw new Exception('Payload kosong/invalid');
  $pdo = db();
  pastikan_tabel($pdo);
  /* Dibaca DI DALAM db_lock() milik pemanggil. Kalau di luar, dua penyimpanan
     bisa sama-sama lolos pemeriksaan lalu saling menimpa persis seperti
     sebelum penjaga ini ada. */
  if ($baseTs !== null && (int)$baseTs > 0) {
    $tsKini = 0; $oleh = '';
    try {
      $r = $pdo->query('SELECT `updated_at`,`updated_by` FROM `app_state` WHERE `id`=1')->fetch();
      if ($r) { $tsKini = (int)$r['updated_at']; $oleh = (string)$r['updated_by']; }
    } catch (Throwable $e) { $tsKini = 0; }
    if ($tsKini > 0 && (int)$baseTs !== $tsKini) {
      return array('saved' => false, 'konflik' => true, 'ts' => $tsKini, 'by' => $oleh);
    }
  }
  $ub = '';
  if (is_object($state) && isset($state->_savedBy)) $ub = (string)$state->_savedBy;
  else if (is_array($state) && isset($state['_savedBy'])) $ub = (string)$state['_savedBy'];
  /* Versinya dihitung SEKALI lalu dipakai untuk menulis DAN dibalas ke klien.
     Dihitung dua kali, yang dibalas berbeda dari yang tersimpan — dan
     penyimpanan klien BERIKUTNYA langsung dianggap basi oleh penjaganya
     sendiri, jadi tiap simpan kedua ditolak tanpa ada yang salah. */
  $ua = (int)(microtime(true) * 1000);
  $st = $pdo->prepare(
    'INSERT INTO `app_state` (`id`,`data`,`updated_at`,`updated_by`) VALUES (1,:d,:ua,:ub)
     ON DUPLICATE KEY UPDATE `data`=VALUES(`data`), `updated_at`=VALUES(`updated_at`), `updated_by`=VALUES(`updated_by`)');
  $st->execute(array(
    ':d'  => json_enc($state),
    ':ua' => $ua,
    ':ub' => $ub,
  ));
  return array('saved' => true, 'ts' => $ua, 'waktu' => gmdate('c'));
}

/* ==================== PERFORMA PER DIVISI (dibaca modul Marketing/Event)
   Dipakai halaman Performa Marketing di deploy/marketing/ (dan nanti Performa
   Event di deploy/event/), supaya kedua modul memajang REALISASI dan BONUS
   yang sama dengan panel Finance.

   KENAPA ENDPOINT SENDIRI, BUKAN getAll. getAll memulangkan SELURUH blob
   omset: piutang, 222 baris compliment berikut pemberinya, breakdown per
   kasir, pegawai seluruh divisi. Menyuruh modul Marketing memanggilnya berarti
   menuliskan alamat blob itu di halaman yang dibuka seluruh staf marketing —
   dan itu BERTENTANGAN dengan permintaan hak akses yang justru melahirkan
   halaman ini (user 7 September 2026: yang bukan Head hanya boleh melihat
   dirinya sendiri). Alasan yang sama dengan investorRingkas.

   Yang dipulangkan cuma: roster PIC divisi itu, baris breakdown divisi itu per
   tanggal, dan compliment yang menyangkut PIC divisi itu. Baris kasir, baris
   divisi lain, piutang, dan setoran TIDAK ikut.

   RUMUSNYA TIDAK DIHITUNG DI SINI. Yang dipulangkan baris mentah; realisasi,
   potongan compliment, dan seluruh tangga bonus dihitung di
   deploy/assets/performa-bonus.js — satu tempat untuk semua modul. Menghitung
   sebagiannya di PHP berarti melahirkan berkas kembar lintas bahasa, yang
   justru paling sulit dicocokkan. */
function performa_divisi($divi, $dari, $sampai) {
  $divi = ($divi === 'event') ? 'event' : 'marketing';
  $dari = kp_tgl($dari); $sampai = kp_tgl($sampai);
  if (!$dari || !$sampai) throw new Exception('rentang tanggal tidak sah (pakai YYYY-MM-DD)');
  if (strcmp($dari, $sampai) > 0) { $t = $dari; $dari = $sampai; $sampai = $t; }

  $s = kp_state_assoc();

  $pic = array();
  $emp = isset($s['employees'][$divi]) && is_array($s['employees'][$divi])
       ? $s['employees'][$divi] : array();
  foreach ($emp as $e) {
    if (!is_array($e) || !isset($e['id'])) continue;
    $pic[] = array(
      'id'           => (string)$e['id'],
      'name'         => isset($e['name']) ? (string)$e['name'] : '',
      'officeUserId' => isset($e['officeUserId']) ? $e['officeUserId'] : null,
    );
  }

  /* Baris breakdown, DISARING ke kolom yang benar-benar dipakai penghitung.
     Mengirim barisnya apa adanya berarti ikut mengirim `shift` (daftar kasir
     yang dipotong) — data kasir yang tidak ada urusannya dengan halaman ini. */
  $days = array();
  $daily = isset($s['daily']) && is_array($s['daily']) ? $s['daily'] : array();
  foreach ($daily as $d) {
    if (!is_array($d)) continue;
    $tgl = kp_tgl(isset($d['date']) ? $d['date'] : '');
    if (!$tgl || strcmp($tgl, $dari) < 0 || strcmp($tgl, $sampai) > 0) continue;
    $src = isset($d['bd'][$divi]) && is_array($d['bd'][$divi]) ? $d['bd'][$divi] : array();
    $rows = array();
    foreach ($src as $r) {
      if (!is_array($r)) continue;
      $rows[] = array(
        'picId'     => isset($r['picId'])     ? $r['picId'] : null,
        'eventName' => isset($r['eventName']) ? (string)$r['eventName'] : '',
        'amount'    => isset($r['amount'])    ? $r['amount'] : 0,
        'tax'       => isset($r['tax'])       ? $r['tax'] : 0,
        'service'   => isset($r['service'])   ? $r['service'] : 0,
        'ob'        => isset($r['ob'])        ? $r['ob'] : null,
        'obAmount'  => isset($r['obAmount'])  ? $r['obAmount'] : 0,
        'obTax'     => isset($r['obTax'])     ? $r['obTax'] : 0,
        'obService' => isset($r['obService']) ? $r['obService'] : 0,
        'tiket'     => isset($r['tiket'])     ? $r['tiket'] : null,
        'srcPic'    => isset($r['srcPic'])    ? (string)$r['srcPic'] : '',
        /* Penentu "event corporate" di Skema 1 bonus. Nama kuncinya BERKAS
           KEMBAR dengan yang ditulis deploy/finance/omset/ dan yang dibaca
           pbAgregasi(); beda satu huruf tidak melempar apa pun, barisnya cuma
           berhenti terhitung sebagai corporate. */
        'srcJenis'  => isset($r['srcJenis'])  ? (string)$r['srcJenis'] : '',
      );
    }
    $days[] = array('date' => $tgl, 'bd' => array($divi => $rows));
  }

  /* Compliment dalam rentang yang MENYANGKUT PIC divisi ini saja — sisi PIC
     kasir maupun sisi pemberi. Yang tidak menyangkut siapa pun di divisi ini
     tidak ikut: isinya nama tamu dan alasannya, dan tidak ada gunanya di
     halaman ini. Penyaring akhir (potong / menunggu / tidak) tetap dikerjakan
     pbCompFilterPic() di aset — dua penyaring untuk satu aturan pasti
     menyimpang. */
  $oid = array(); $nama = array();
  foreach ($pic as $p) {
    if ($p['officeUserId'] !== null && $p['officeUserId'] !== '') $oid[(string)$p['officeUserId']] = true;
    if ($p['name'] !== '') $nama[strtolower(trim($p['name']))] = true;
  }
  $comps = array();
  $cl = isset($s['compliments']) && is_array($s['compliments']) ? $s['compliments'] : array();
  foreach ($cl as $c) {
    if (!is_array($c)) continue;
    $tgl = kp_tgl(isset($c['date']) ? $c['date'] : '');
    if (!$tgl || strcmp($tgl, $dari) < 0 || strcmp($tgl, $sampai) > 0) continue;
    $kena = false;
    foreach (array(array('picDiv','picOfficeId','picName'), array('pemberiDiv','pemberiOfficeId','pemberiName')) as $sisi) {
      $dv = isset($c[$sisi[0]]) ? (string)$c[$sisi[0]] : '';
      if ($dv === 'tamu') continue;
      $id = isset($c[$sisi[1]]) ? (string)$c[$sisi[1]] : '';
      $nm = isset($c[$sisi[2]]) ? strtolower(trim((string)$c[$sisi[2]])) : '';
      if (($id !== '' && isset($oid[$id])) || ($nm !== '' && isset($nama[$nm]))) { $kena = true; break; }
    }
    if ($kena) $comps[] = $c;
  }

  return array('pic' => $pic, 'days' => $days, 'comps' => $comps,
               'dari' => $dari, 'sampai' => $sampai);
}
/* ==================== OMSET PER PIC MARKETING (dibaca modul lain) ====
   Dipakai modul Marketing > Marketing Performance untuk memajang totalan
   KEDUA di sampingnya sendiri: berapa yang benar-benar dialokasikan finance
   di Breakdown Sumber Omset untuk tiap PIC marketing, pada rentang tanggal
   tertentu.

   KENAPA ENDPOINT SENDIRI, bukan getAll. State kompas itu satu blob berisi
   SELURUH riwayat harian — tiap hari menambah baris omset per kasir, baris
   breakdown, report daily, compliment, piutang. Halaman Performance dibuka
   berkali-kali sehari oleh seluruh tim marketing; menariknya utuh berarti
   memindahkan megabyte hanya untuk mendapat satu angka per orang. Pola yang
   sama dengan events_hari() di marketing dan shiftHari() di jadwal.

   YANG DIBACA HANYA SECTION B (bd.marketing). Section C (bd.event) itu milik
   PIC event internal, dan Section A milik kasir — memasukkannya ke sini akan
   membuat angka marketing membengkak oleh kerja divisi lain.

   RUMUS PENGAKUANNYA DISALIN dari porsiPic(r,'marketing') di
   deploy/finance/omset/index.html:
       diakui = amount + tax + service + openBill
   Kalau rumus di sana berubah, ubah di sini juga. Gejala kalau lupa: angka
   "menurut Breakdown" di modul Marketing beda dari "Diakui PIC" yang tertulis
   di layar Finance untuk baris yang sama, tanpa ada yang salah di keduanya. */
function kp_tgl($d) {
  $d = trim((string)$d);
  return preg_match('/^\d{4}-\d{2}-\d{2}$/', $d) ? $d : null;
}
/* Cerminan num() di sisi aplikasi: buang semua yang bukan digit/minus lalu
   ambil bilangan bulatnya. Nilai di blob bisa datang sebagai angka JSON
   maupun string hasil ketikan berformat ("3.855.000"), dan (int) polos akan
   memulangkan 3 untuk yang kedua. */
function kp_num($v) {
  if (is_int($v))   return $v;
  if (is_float($v)) return (int)round($v);
  $s = preg_replace('/[^0-9-]/', '', (string)$v);
  return ($s === '' || $s === '-') ? 0 : (int)$s;
}
function kp_state_assoc() {
  try {
    $row = db()->query('SELECT `data` FROM `app_state` WHERE `id`=1')->fetch();
  } catch (Throwable $e) { return array(); }
  if (!$row || !isset($row['data']) || $row['data'] === '') return array();
  $s = json_decode((string)$row['data'], true);
  return is_array($s) ? $s : array();
}
function omset_pic($dari, $sampai) {
  $dari = kp_tgl($dari); $sampai = kp_tgl($sampai);
  if (!$dari || !$sampai) throw new Exception('rentang tanggal tidak sah (pakai YYYY-MM-DD)');
  if (strcmp($dari, $sampai) > 0) { $t = $dari; $dari = $sampai; $sampai = $t; }

  $s = kp_state_assoc();

  /* Peta PIC. `officeUserId` itu id user Office yang sama dengan yang dipakai
     modul Marketing, jadi pemanggil bisa mencocokkan lewat id — bukan lewat
     nama, yang selalu meleset begitu ada yang berganti ejaan. Namanya tetap
     ikut dikirim sebagai cadangan untuk PIC lama yang belum punya
     officeUserId (dibuat manual sebelum sinkronisasi roster ada). */
  $peta = array();
  $emp = isset($s['employees']['marketing']) && is_array($s['employees']['marketing'])
       ? $s['employees']['marketing'] : array();
  foreach ($emp as $e) {
    if (!is_array($e) || !isset($e['id'])) continue;
    $peta[(string)$e['id']] = array(
      'name'         => isset($e['name']) ? (string)$e['name'] : '',
      'officeUserId' => isset($e['officeUserId']) ? (string)$e['officeUserId'] : '',
    );
  }

  $agg = array();
  $hariAda = 0; $hariIsi = 0;
  $daily = isset($s['daily']) && is_array($s['daily']) ? $s['daily'] : array();
  foreach ($daily as $d) {
    if (!is_array($d)) continue;
    $tgl = kp_tgl(isset($d['date']) ? $d['date'] : '');
    if (!$tgl || strcmp($tgl, $dari) < 0 || strcmp($tgl, $sampai) > 0) continue;
    $hariAda++;
    $baris = isset($d['bd']['marketing']) && is_array($d['bd']['marketing'])
           ? $d['bd']['marketing'] : array();
    if ($baris) $hariIsi++;
    foreach ($baris as $r) {
      if (!is_array($r)) continue;
      $pid = isset($r['picId']) ? (string)$r['picId'] : '';
      $om  = kp_num(isset($r['amount'])  ? $r['amount']  : 0);
      $tax = kp_num(isset($r['tax'])     ? $r['tax']     : 0);
      $svc = kp_num(isset($r['service']) ? $r['service'] : 0);
      /* Open Bill hanya dihitung kalau centangnya HIDUP. Angkanya sengaja
         tidak dinolkan waktu centang dicabut (lihat catatan di bindOb), jadi
         membacanya tanpa memeriksa `ob` akan mengakui uang yang sudah
         dibatalkan orangnya. */
      $ob = (isset($r['ob']) && $r['ob'])
          ? kp_num(isset($r['obAmount'])  ? $r['obAmount']  : 0)
          + kp_num(isset($r['obTax'])     ? $r['obTax']     : 0)
          + kp_num(isset($r['obService']) ? $r['obService'] : 0)
          : 0;
      if (!isset($agg[$pid])) $agg[$pid] = array(
        'picId' => $pid, 'name' => '', 'officeUserId' => '',
        'omset' => 0, 'tax' => 0, 'service' => 0, 'openBill' => 0, 'diakui' => 0, 'baris' => 0);
      $agg[$pid]['omset']    += $om;
      $agg[$pid]['tax']      += $tax;
      $agg[$pid]['service']  += $svc;
      $agg[$pid]['openBill'] += $ob;
      $agg[$pid]['diakui']   += $om + $tax + $svc + $ob;
      $agg[$pid]['baris']++;
    }
  }

  $pic = array();
  $tot = array('omset' => 0, 'tax' => 0, 'service' => 0, 'openBill' => 0, 'diakui' => 0, 'baris' => 0);
  foreach ($agg as $pid => $a) {
    if (isset($peta[$pid])) { $a['name'] = $peta[$pid]['name']; $a['officeUserId'] = $peta[$pid]['officeUserId']; }
    foreach (array('omset','tax','service','openBill','diakui','baris') as $k) $tot[$k] += $a[$k];
    $pic[] = $a;
  }
  usort($pic, function ($a, $b) { return $b['diakui'] - $a['diakui']; });

  return array(
    'dari' => $dari, 'sampai' => $sampai,
    /* Dua angka yang mudah tertukar dan dua-duanya perlu. `hariAda` = hari
       yang punya catatan omset sama sekali; `hariIsi` = hari yang breakdown
       Section B-nya benar-benar terisi. Pemanggil butuh keduanya untuk bisa
       membedakan "finance belum mengisi apa pun" dari "sudah diisi, memang
       tidak ada event" — dua keadaan yang sama-sama memulangkan Rp0. */
    'hariAda' => $hariAda, 'hariIsi' => $hariIsi,
    'pic' => $pic, 'total' => $tot,
  );
}
/* ==================== SIMPAN TARGET SAJA (tulis sempit) ==============
   Dipakai panel Finance > Kas Kecil & Performa, halaman Pengaturan Target
   (pindah ke sana 12 Agustus 2026).

   KENAPA BUKAN saveAll. Panel kas SENGAJA tidak pernah menulis blob kompas —
   lihat save() di deploy/finance/kas/index.html yang dilumpuhkan on purpose.
   Alasannya: saveAll mengirim SELURUH state, jadi satu penyimpanan dari layar
   yang salinannya sudah basi akan menimpa omset, breakdown, dan compliment
   yang baru saja diubah orang di panel Input Omset Harian — tanpa satu pun
   pesan, karena dari sisi server itu penyimpanan yang sah.

   Endpoint ini menambal HANYA lima hal, dibaca-ubah-tulis di dalam kunci yang
   sama dengan saveAll (db_lock di api.php):
     settings.companyMonthlyTarget, settings.useWorkingDays,
     settings.workingDaysPerMonth, dan employees[divi][].target
   Apa pun yang tidak disebut di payload TIDAK disentuh. Jadi memindahkan
   halaman itu ke panel kas tidak menghidupkan kembali bahaya yang justru
   membuatnya dikeluarkan dari sana dulu.

   PIC YANG SUDAH TIDAK ADA dilaporkan balik, tidak didiamkan. Kalau seseorang
   membuka halaman target lalu PIC-nya dihapus di Kompas sebelum ia menekan
   simpan, target untuk id itu tidak punya tempat lagi — dan diam berarti
   orangnya mengira angkanya tersimpan. */
function simpan_target($data) {
  if (!is_array($data)) throw new Exception('Payload kosong/invalid');
  $pdo = db();
  pastikan_tabel($pdo);

  $s = kp_state_assoc();
  if (!$s) throw new Exception('Data omset belum pernah tersimpan — buka panel Input Omset Harian lebih dulu');

  if (!isset($s['settings']) || !is_array($s['settings'])) $s['settings'] = array();
  if (array_key_exists('companyMonthlyTarget', $data))
    $s['settings']['companyMonthlyTarget'] = kp_num($data['companyMonthlyTarget']);
  if (array_key_exists('useWorkingDays', $data))
    $s['settings']['useWorkingDays'] = !empty($data['useWorkingDays']);
  if (array_key_exists('workingDaysPerMonth', $data)) {
    $wd = kp_num($data['workingDaysPerMonth']);
    // 0 hari kerja = pembagi nol = target harian nol di seluruh dashboard.
    $s['settings']['workingDaysPerMonth'] = $wd > 0 ? $wd : 26;
  }

  $tg = (isset($data['target']) && is_array($data['target'])) ? $data['target'] : array();
  $ubah = 0;
  foreach (array('marketing', 'event', 'kasir') as $divi) {
    if (!isset($s['employees'][$divi]) || !is_array($s['employees'][$divi])) continue;
    foreach ($s['employees'][$divi] as $i => $e) {
      if (!is_array($e) || !isset($e['id'])) continue;
      $id = (string)$e['id'];
      if (!array_key_exists($id, $tg)) continue;
      $baru = kp_num($tg[$id]);
      $lama = isset($e['target']) ? kp_num($e['target']) : 0;
      if ($lama !== $baru) $ubah++;
      $s['employees'][$divi][$i]['target'] = $baru;
      unset($tg[$id]);
    }
  }
  // Sisa $tg = id yang tidak cocok dengan satu pun PIC yang ada sekarang.
  $hilang = array_values(array_map('strval', array_keys($tg)));

  $ub = isset($data['by']) ? (string)$data['by'] : '';
  $st = $pdo->prepare(
    'INSERT INTO `app_state` (`id`,`data`,`updated_at`,`updated_by`) VALUES (1,:d,:ua,:ub)
     ON DUPLICATE KEY UPDATE `data`=VALUES(`data`), `updated_at`=VALUES(`updated_at`), `updated_by`=VALUES(`updated_by`)');
  $st->execute(array(
    ':d'  => json_enc($s),
    ':ua' => (int)(microtime(true) * 1000),
    ':ub' => $ub,
  ));

  return array(
    'saved'   => true,
    'ubah'    => $ubah,
    'hilang'  => $hilang,
    'ts'      => gmdate('c'),
  );
}

/* ==================== SIMPAN REKAP PENJUALAN (tulis sempit) ==========
   Dipakai panel Finance > Rekap Penjualan (lahir 12 Agustus 2026), yang
   menggantikan berkas Excel "Penjualan 2026" sheet 07'26.

   Panel itu MEMBACA hampir semua angkanya dari Daily Report yang sudah ada
   (reports[tgl].pay[metode].pos/actual) dan dari omset harian. Yang benar-benar
   miliknya sendiri cuma tiga, dan hanya tiga inilah yang boleh ditulis:

     reports[tgl].mdr   {bri,mandiri,bca}  biaya MDR per bank, diketik tangan
     reports[tgl].setor bool               cash hari itu sudah disetor
     reports[tgl].esb   {grup:bool}        "Input POS" — penanda bahwa nominal
                                           adjust grup itu sudah dikunci di POS.
                                           NAMA FIELD-nya tetap `esb`: kata itu
                                           diganti jadi POS di seluruh layar
                                           pada 12 Agustus 2026, tapi kuncinya
                                           TIDAK ikut diganti supaya penanda
                                           yang sudah tersimpan tidak hilang
                                           dan supaya deploy yang berhasil
                                           sebagian (frontend naik, backend
                                           tidak) tidak membuang centang orang
                                           diam-diam.

   ALASAN ENDPOINT SENDIRI sama persis dengan simpan_target: saveAll mengirim
   SELURUH state, jadi satu penyimpanan dari panel ini yang salinannya sudah
   basi akan menimpa omset, breakdown, dan Daily Report yang baru saja diubah
   orang di panel sebelah — tanpa satu pun pesan galat.

   `pay` SENGAJA TIDAK BISA DITULIS DARI SINI. Angka POS/Actual tetap milik
   Daily Report di panel Input Omset Harian; kalau panel ini boleh menyentuhnya,
   dua layar akan menulis satu angka yang sama dan yang belakangan menang tanpa
   ada yang tahu. Panel rekap cuma menandai dan menghitung. */
/* Cash actual satu hari. Satu pembaca, dipakai penjepit nominal setoran dan
   penghitung penanda `setor` — dua pembaca yang berbeda letak kuncinya akan
   memulangkan nol untuk salah satunya, dan nol di sini berarti "hari itu tidak
   punya cash" alias langsung dianggap lunas. */
function kp_cash_hari($s, $h) {
  return isset($s['reports'][$h]['pay']['cash']['actual'])
           ? kp_num($s['reports'][$h]['pay']['cash']['actual']) : 0;
}
/* Berapa yang SUDAH disetor untuk satu hari, dijumlahkan dari seluruh baris
   setoran. Baris LAMA tidak punya `jumlah` dan itu berarti setoran penuh —
   begitulah satu-satunya bentuk yang mungkin sebelum 4 September 2026.
   Dianggap nol, seluruh setoran yang sudah tercatat akan mendadak muncul lagi
   sebagai "belum disetor" dan disetorkan untuk kedua kalinya.

   BERKAS KEMBAR rkSetorSudah() di deploy/finance/kas/. Kalau aturannya berubah
   di sini, di sana HARUS ikut: layar dan server yang berbeda pendapat tentang
   hari mana yang masih perlu disetor adalah selisih yang cuma ketahuan waktu
   uangnya dihitung ulang di brankas. */
function kp_setor_masuk($s, $h) {
  $h = (string)$h; $n = 0;
  if (!isset($s['rekap_setoran']) || !is_array($s['rekap_setoran'])) return 0;
  foreach ($s['rekap_setoran'] as $row) {
    if (!isset($row['hari']) || !is_array($row['hari'])) continue;
    if (!in_array($h, array_map('strval', $row['hari']), true)) continue;
    if (isset($row['jumlah'][$h]) && $row['jumlah'][$h] !== '' && $row['jumlah'][$h] !== null) {
      $n += kp_num($row['jumlah'][$h]);
    } else {
      $n += kp_cash_hari($s, $h);
    }
  }
  return $n;
}

function simpan_rekap($data) {
  if (!is_array($data)) throw new Exception('Payload kosong/invalid');
  $baris = isset($data['hari']) && is_array($data['hari']) ? $data['hari'] : null;
  if ($baris === null) throw new Exception('Payload kosong/invalid: tidak ada daftar hari');

  $pdo = db();
  pastikan_tabel($pdo);
  $s = kp_state_assoc();
  if (!$s) throw new Exception('Data omset belum pernah tersimpan — buka panel Input Omset Harian lebih dulu');
  if (!isset($s['reports']) || !is_array($s['reports'])) $s['reports'] = array();

  /* Grup "Input POS" yang dikenal. Daftar TERTUTUP dengan sengaja: kunci yang
     tidak dikenal berarti panelnya sudah lebih baru daripada backend, dan
     menyimpannya diam-diam membuat penanda yang tidak pernah terbaca siapa
     pun. Lebih baik dilaporkan. */
  /* EDC DAN QRIS DIPECAH (12 Agustus 2026, permintaan user). Sebelumnya satu
     kelompok per bank ('bri','mandiri','bca'); sekarang enam, karena tarif MDR
     EDC dan QRIS berbeda dan menggabungkannya membuat potongan yang sebenarnya
     mustahil diketik dengan benar. Kunci lama sengaja DIBIARKAN dikenal supaya
     penanda yang sudah tersimpan tidak jadi "tak dikenal" saat dibaca ulang. */
  $grup = array('cash','qr_order',
                'edc_bri','qris_bri','edc_mandiri','qris_mandiri','edc_bca','qris_bca',
                'transfer','gofood','grabfood','tiktokgo','error',
                'bri','mandiri','bca');   // ← warisan, sebelum EDC/QRIS dipecah
  /* Yang punya MDR. Bertambah dua kali pada 12 Agustus 2026: `gofood` &
     `grabfood` (ojol memotong komisi persis seperti bank memotong MDR), lalu
     `qr_order` plus pemecahan EDC/QRIS. Daftar ini TERTUTUP — kunci di luar
     daftar dibuang diam-diam, jadi menambah bank/ojol baru di frontend TANPA
     menambahnya di sini membuat angka yang diketik hilang tanpa satu pun pesan
     galat. */
  $bank = array('qr_order',
                'edc_bri','qris_bri','edc_mandiri','qris_mandiri','edc_bca','qris_bca',
                'gofood','grabfood','tiktokgo',
                'bri','mandiri','bca');   // ← warisan

  $ubah = 0; $takDikenal = array();
  foreach ($baris as $tgl => $isi) {
    $tgl = kp_tgl($tgl);
    if (!$tgl || !is_array($isi)) continue;
    /* Baris report DIBUAT kalau belum ada. Hari yang Daily Report-nya belum
       diisi tetap boleh ditandai sudah disetor / sudah masuk POS — urutan
       kerjanya di lapangan memang tidak selalu report dulu. */
    if (!isset($s['reports'][$tgl]) || !is_array($s['reports'][$tgl])) $s['reports'][$tgl] = array();
    $r =& $s['reports'][$tgl];

    if (array_key_exists('setor', $isi)) {
      $baru = !empty($isi['setor']);
      if (!isset($r['setor']) || (bool)$r['setor'] !== $baru) $ubah++;
      $r['setor'] = $baru;
    }
    if (isset($isi['mdr']) && is_array($isi['mdr'])) {
      if (!isset($r['mdr']) || !is_array($r['mdr'])) $r['mdr'] = array();
      foreach ($bank as $b) {
        if (!array_key_exists($b, $isi['mdr'])) continue;
        $baru = kp_num($isi['mdr'][$b]);
        $lama = isset($r['mdr'][$b]) ? kp_num($r['mdr'][$b]) : 0;
        if ($lama !== $baru) $ubah++;
        $r['mdr'][$b] = $baru;
      }
    }
    /* AKTUAL MASUK (21 Agustus 2026, permintaan tim). Menggantikan `mdr`
       sebagai satu-satunya angka yang diketik di panel Rekap Penjualan: yang
       dipegang orang finance adalah nominal yang benar-benar masuk rekening
       (ia melihatnya di mutasi bank), sementara MDR cuma selisihnya terhadap
       Aktual kotor dari Report Daily.

       Disimpan sebagai AKTUAL, bukan sebagai MDR hasil hitungan, dan bedanya
       baru terasa saat Report Daily-nya dikoreksi belakangan: kalau yang
       tersimpan MDR, nilai aktual ikut bergeser sendiri padahal uang yang
       masuk rekening tidak berubah sepeser pun.

       `mdr` di atas SENGAJA TETAP DITERIMA & TETAP DIBACA. Hari-hari sebelum
       tanggal ini hanya menyimpan MDR, dan panelnya jatuh ke sana kalau
       `aktual` belum ada — membuang jalur itu berarti seluruh riwayat rekap
       berubah angkanya sendiri.

       STRING KOSONG = HAPUS, bukan nol. Nol berarti "uangnya tidak masuk sama
       sekali"; itu arti yang sangat berbeda, dan menyimpannya membuat kotak
       yang sengaja dikosongkan di layar tidak pernah benar-benar kosong. */
    if (isset($isi['aktual']) && is_array($isi['aktual'])) {
      if (!isset($r['aktual']) || !is_array($r['aktual'])) $r['aktual'] = array();
      foreach ($bank as $b) {
        if (!array_key_exists($b, $isi['aktual'])) continue;
        $v = $isi['aktual'][$b];
        if ($v === '' || $v === null) {
          if (array_key_exists($b, $r['aktual'])) { unset($r['aktual'][$b]); $ubah++; }
          continue;
        }
        $baru = kp_num($v);
        $ada  = array_key_exists($b, $r['aktual']);
        if (!$ada || kp_num($r['aktual'][$b]) !== $baru) $ubah++;
        $r['aktual'][$b] = $baru;
      }
    }
    /* MDR YANG DIKETIK SAAT DANA BERLEBIH (26 Agustus 2026, permintaan user).

       Pada hari biasa MDR tidak perlu — dan tidak boleh — diketik: ia pasti
       sebesar `aktual kotor − aktual masuk`, dan itulah keputusan 21 Agustus
       2026 yang tidak dibatalkan di sini. Yang ditangani kunci ini cuma satu
       keadaan: aktual masuk MELEBIHI aktual kotor. Di situ angka tidak bisa
       memberi tahu berapa yang potongan bank dan berapa yang input kasirnya
       kurang; salah satunya harus disebut manusia, dan yang dipegang orang
       finance adalah MDR-nya (tertulis di mutasi). Dana lebihnya DIHITUNG
       frontend dari situ — tidak ada kunci `lebih` yang disimpan.

       Kunci `lebih` versi 25 Agustus 2026 (arahnya kebalikan: dana lebih yang
       diketik) hidup kurang dari sehari, tidak pernah sampai produksi, dan
       SUDAH TIDAK DITERIMA lagi. Sengaja tidak dibaca sebagai cadangan:
       artinya berbeda, dan membacanya sebagai MDR akan mengarang angka yang
       kelihatan masuk akal.

       Memakai daftar $bank yang sama dengan `aktual`: kelebihan hanya bisa
       terbaca pada kelompok yang punya sisi "aktual masuk" — cash & transfer
       angkanya datang langsung dari Report Daily, tidak ada mutasi bank yang
       dibandingkan.

       STRING KOSONG = HAPUS, bukan nol — alasan yang sama persis dengan
       `aktual` di atas. */
    if (isset($isi['mdrManual']) && is_array($isi['mdrManual'])) {
      if (!isset($r['mdrManual']) || !is_array($r['mdrManual'])) $r['mdrManual'] = array();
      foreach ($bank as $b) {
        if (!array_key_exists($b, $isi['mdrManual'])) continue;
        $v = $isi['mdrManual'][$b];
        if ($v === '' || $v === null) {
          if (array_key_exists($b, $r['mdrManual'])) { unset($r['mdrManual'][$b]); $ubah++; }
          continue;
        }
        /* Dijepit ke >= 0, sama seperti di layar. MDR adalah POTONGAN; nilai
           negatif tidak punya arti, dan seluruh tampilannya memakai bentuk
           «−Rp <angka positif>» — angka negatif yang lolos ke sini akan
           membuat bentuk itu berbohong di setiap layar yang membacanya. */
        $baru = kp_num($v);
        if ($baru < 0) $baru = 0;
        $ada  = array_key_exists($b, $r['mdrManual']);
        if (!$ada || kp_num($r['mdrManual'][$b]) !== $baru) $ubah++;
        $r['mdrManual'][$b] = $baru;
      }
    }
    if (isset($isi['esb']) && is_array($isi['esb'])) {
      if (!isset($r['esb']) || !is_array($r['esb'])) $r['esb'] = array();
      foreach ($isi['esb'] as $g => $v) {
        if (!in_array($g, $grup, true)) { $takDikenal[$g] = 1; continue; }
        $baru = !empty($v);
        if (!isset($r['esb'][$g]) || (bool)$r['esb'][$g] !== $baru) $ubah++;
        $r['esb'][$g] = $baru;
      }
    }
    unset($r);
  }

  /* ---------- SETORAN CASH (12 Agustus 2026, permintaan user) ----------
     Sebelumnya "sudah setor" cuma satu boolean per hari, dan itu tidak menjawab
     dua pertanyaan yang justru selalu ditanyakan: BERAPA yang disetor, dan KE
     MANA. Sekarang satu setoran = satu baris di `rekap_setoran`, boleh
     mencakup banyak hari sekaligus (kasir memang sering menyetor beberapa hari
     tumpukan cash dalam satu kali jalan ke bank).

     NOMINALNYA DIHITUNG DI SINI, bukan dikirim peramban. Angka uang yang
     datang dari layar bisa dikarang, dan yang lebih sering terjadi: layarnya
     memakai salinan basi sehingga nominal tersimpan tidak sama dengan jumlah
     cash hari-hari yang dicakupnya. Server membaca cash actual tiap hari dari
     Report Daily yang sama, jadi angkanya mustahil menyimpang.

     `reports[tgl].setor` TETAP DIPELIHARA sebagai cerminan: true kalau hari itu
     tercakup salah satu setoran. Bidang itu sudah dibaca panel lain dan
     penanda lama (sebelum riwayat ini ada) juga masih tersimpan di sana. */
  $setoran = isset($data['setoran']) && is_array($data['setoran']) ? $data['setoran'] : null;
  if ($setoran) {
    if (!isset($s['rekap_setoran']) || !is_array($s['rekap_setoran'])) $s['rekap_setoran'] = array();
    $tersentuh = array();   // tanggal yang penanda setornya perlu dihitung ulang

    if (isset($setoran['hapus']) && is_array($setoran['hapus'])) {
      foreach ($setoran['hapus'] as $id) {
        $id = (string)$id;
        foreach ($s['rekap_setoran'] as $i => $row) {
          if (!isset($row['id']) || (string)$row['id'] !== $id) continue;
          if (isset($row['hari']) && is_array($row['hari'])) {
            foreach ($row['hari'] as $h) { $h = kp_tgl($h); if ($h) $tersentuh[$h] = 1; }
          }
          array_splice($s['rekap_setoran'], $i, 1);
          $ubah++;
          break;
        }
      }
    }

    if (isset($setoran['tambah']) && is_array($setoran['tambah'])) {
      foreach ($setoran['tambah'] as $baru) {
        if (!is_array($baru)) continue;
        $tglSetor = kp_tgl(isset($baru['tgl']) ? $baru['tgl'] : '');
        if (!$tglSetor) throw new Exception('Tanggal setor tidak sah');
        $hari = array();
        if (isset($baru['hari']) && is_array($baru['hari'])) {
          foreach ($baru['hari'] as $h) { $h = kp_tgl($h); if ($h && !in_array($h, $hari, true)) $hari[] = $h; }
        }
        if (!count($hari)) throw new Exception('Setoran tanpa satu pun hari yang dicakup');
        sort($hari);
        /* SETORAN SEBAGIAN (4 September 2026, permintaan user). `jumlah` boleh
           menyebut nominal per hari — kasir kadang membawa sebagian saja.
           Hari yang TIDAK disebut di sana tetap dihitung dari cash-nya, jadi
           layar lama (yang tidak mengirim `jumlah` sama sekali) berperilaku
           persis seperti sebelumnya.

           Angka dari peramban tetap TIDAK dipercaya bulat-bulat: ia dijepit
           ke SISA hari itu (lihat penjepitnya di bawah). Layar sudah menolak
           nominal yang melampaui sisa, jadi jepitan di sini tidak akan
           pernah menyala lewat pemakaian biasa — ia menahan panggilan yang
           datang dari console peramban, dan itu memang satu-satunya
           tugasnya. */
        $jml = (isset($baru['jumlah']) && is_array($baru['jumlah'])) ? $baru['jumlah'] : array();
        $nominal = 0;
        $perHari = array();
        foreach ($hari as $h) {
          $cash = kp_cash_hari($s, $h);
          /* Dijepit ke SISA hari itu, bukan ke cash-nya. Dijepit ke cash,
             setoran kedua untuk hari yang sudah disetor sebagian bisa membawa
             jumlah penuh lagi — total yang disetor jadi lebih besar daripada
             uang yang pernah ada di laci, dan gejalanya saldo brankas fisik
             yang minus di panel Brankas, bukan galat. */
          $sisa = $cash - kp_setor_masuk($s, $h);
          if ($sisa < 0) $sisa = 0;
          $n = (isset($jml[$h]) && $jml[$h] !== '' && $jml[$h] !== null) ? kp_num($jml[$h]) : $sisa;
          if ($n < 0)     $n = 0;
          if ($n > $sisa) $n = $sisa;
          $perHari[$h] = $n;
          $nominal += $n;
          $tersentuh[$h] = 1;
        }
        if ($nominal <= 0) throw new Exception('Setoran bernilai nol — tidak ada uang yang berpindah');
        $s['rekap_setoran'][] = array(
          'id'      => 'st' . dechex((int)(microtime(true) * 1000)) . dechex(mt_rand(0, 0xffff)),
          'tgl'     => $tglSetor,
          'tujuan'  => mb_substr(trim((string)(isset($baru['tujuan']) ? $baru['tujuan'] : '')), 0, 80),
          'catatan' => mb_substr(trim((string)(isset($baru['catatan']) ? $baru['catatan'] : '')), 0, 200),
          'hari'    => $hari,
          'jumlah'  => $perHari,
          'nominal' => $nominal,
          'by'      => isset($data['by']) ? (string)$data['by'] : '',
          'at'      => (int)(microtime(true) * 1000),
        );
        $ubah++;
      }
    }

    /* Penanda per hari dihitung ULANG dari daftar setoran, bukan disetel
       searah. Hari yang setorannya dibatalkan harus kembali "belum setor",
       kecuali masih tercakup setoran lain — dan itu cuma bisa diketahui dengan
       melihat seluruh daftar. */
    if (count($tersentuh)) {
      /* Yang dijumlahkan NOMINALNYA, bukan sekadar "harinya disebut". Sejak
         setoran boleh sebagian, hari yang tercakup belum tentu lunas — dan
         penanda yang menyala terlalu cepat membuat sisanya lenyap dari daftar
         "belum disetor" di layar. Uang yang masih di brankas lalu tidak
         disebut satu layar pun, dan tidak ada satu pun galat yang menandainya.

         Baris LAMA tidak punya `jumlah` dan itu berarti setoran penuh — sama
         dengan aturan rkSetorSudah() di deploy/finance/kas/. Kedua sisi harus
         memakai aturan yang sama, kalau tidak layar dan server berbeda
         pendapat tentang hari mana yang masih perlu disetor. */
      foreach (array_keys($tersentuh) as $h) {
        if (!isset($s['reports'][$h]) || !is_array($s['reports'][$h])) $s['reports'][$h] = array();
        /* Toleransi 1 rupiah: cash actual disimpan sebagai float, dan sisa
           0,0001 yang tidak pernah bisa disetor siapa pun akan membuat harinya
           berdiri di daftar "belum disetor" selamanya. */
        $s['reports'][$h]['setor'] = (kp_cash_hari($s, $h) - kp_setor_masuk($s, $h)) < 1;
      }
    }
  }

  $ub = isset($data['by']) ? (string)$data['by'] : '';
  $st = $pdo->prepare(
    'INSERT INTO `app_state` (`id`,`data`,`updated_at`,`updated_by`) VALUES (1,:d,:ua,:ub)
     ON DUPLICATE KEY UPDATE `data`=VALUES(`data`), `updated_at`=VALUES(`updated_at`), `updated_by`=VALUES(`updated_by`)');
  $st->execute(array(
    ':d'  => json_enc($s),
    ':ua' => (int)(microtime(true) * 1000),
    ':ub' => $ub,
  ));

  return array(
    'saved'      => true,
    'ubah'       => $ubah,
    'hari'       => count($baris),
    'takDikenal' => array_values(array_map('strval', array_keys($takDikenal))),
    /* Daftar setoran dipulangkan UTUH sesudah menyimpan. Panel rekap memakainya
       apa adanya untuk menggambar riwayat, jadi id & nominal yang dihitung
       server langsung terlihat tanpa perlu getAll kedua — dan tidak ada
       kesempatan bagi layar untuk memajang versi karangannya sendiri. */
    'setoran'    => isset($s['rekap_setoran']) && is_array($s['rekap_setoran'])
                      ? array_values($s['rekap_setoran']) : array(),
    'ts'         => gmdate('c'),
  );
}

/* ==================== RINGKASAN UNTUK HALAMAN INVESTOR ====================
   Dipakai investor.laksamanamuda.id — situs terpisah, di luar Office.

   KENAPA ENDPOINT SENDIRI, BUKAN getAll
   ---------------------------------------------------------------------
   getAll memulangkan SELURUH blob omset: daftar pegawai, 222 baris
   compliment berikut siapa yang memberi, piutang, pemilik, dan breakdown
   omset per kasir. Halaman investor cuma perlu angka totalnya. Menyuruhnya
   memanggil getAll berarti menuliskan alamat blob itu di dalam HTML yang
   dibuka orang luar perusahaan — dan getAll tidak menanyakan siapa pun,
   jadi yang membacanya tidak harus investor, cukup siapa saja yang pernah
   melihat halamannya.

   Yang dipulangkan di sini SUDAH DIJUMLAHKAN. Tidak ada satu pun nama orang,
   tidak ada breakdown per kasir, tidak ada piutang. Kalaupun bocor, yang
   bocor adalah angka yang memang boleh dilihat investor.

   Konvensi angka penjualannya TIDAK diputuskan di sini — balasan memuat
   ketiganya (net / dibayarTamu / netSales) dan layar yang memilih. Lihat
   kp_net_hari() dkk di bawah untuk apa bedanya dan kenapa ada tiga.
   ====================================================================== */
function kp_hari_ini_wib() { return gmdate('Y-m-d', time() + 7 * 3600); }

/* ==================== SATU PETA HARIAN UNTUK SEMUA ANGKA =================
   Baik tab Ringkasan maupun tab Laporan Laba Rugi di halaman investor
   dihitung dari fungsi ini, dan itu bukan sekadar kerapian.

   Sebelumnya keduanya punya loop sendiri-sendiri. Aturan compliment-nya
   beda tipis — yang satu melewati compliment yang jatuh di hari tanpa baris
   omset, yang satu menghitungnya — dan akibatnya kartu "Omset Agu 2026"
   bisa menyebut angka lain daripada "Net Sales" di tab sebelahnya untuk
   bulan yang sama. Bedanya cuma muncul kalau ada compliment yatim, jadi ia
   akan lolos dari pemeriksaan apa pun sampai suatu hari kasir mencatat
   compliment sebelum menutup buku.

   Sekarang keduanya membaca peta yang sama, jadi selisih semacam itu
   mustahil secara konstruksi, bukan karena dijaga.

   Isi tiap hari: array(food, bev, lainnya, diskon, service, pajak, bill,
   compliment). Semua angka mentah — yang menyusunnya jadi net / tagihan /
   netSales adalah pemanggilnya.

   HARI YANG HANYA PUNYA COMPLIMENT TETAP DIBUAT. Barang yang keluar tetap
   kejadian, dan hari yang dibuang diam-diam adalah tepat jenis kesalahan
   yang membuat dua layar berselisih. Kalau omsetnya memang belum diinput,
   hari itu akan tergambar minus — dan itu jujur: barang keluar, penjualan
   belum tercatat.
   ====================================================================== */
function kp_peta_harian() {
  $s = kp_state_assoc();
  $rows  = (isset($s['daily']) && is_array($s['daily'])) ? $s['daily'] : array();
  $comps = (isset($s['compliments']) && is_array($s['compliments'])) ? $s['compliments'] : array();

  $peta = array();
  $baru = array(0, 0, 0, 0, 0, 0, 0, 0);
  foreach ($rows as $d) {
    if (!is_array($d)) continue;
    $t = kp_tgl(isset($d['date']) ? $d['date'] : '');
    if (!$t) continue;
    if (!isset($peta[$t])) $peta[$t] = $baru;
    $peta[$t][0] += kp_num(isset($d['food'])     ? $d['food']     : 0);
    $peta[$t][1] += kp_num(isset($d['bev'])      ? $d['bev']      : 0);
    $peta[$t][2] += kp_num(isset($d['lainnya'])  ? $d['lainnya']  : 0);
    $peta[$t][3] += kp_num(isset($d['discount']) ? $d['discount'] : 0);
    $peta[$t][4] += kp_num(isset($d['service_charge']) ? $d['service_charge'] : 0);
    $peta[$t][5] += kp_num(isset($d['tax'])      ? $d['tax']      : 0);
    $peta[$t][6] += kp_num(isset($d['bill'])     ? $d['bill']     : 0);
  }
  foreach ($comps as $c) {
    if (!is_array($c)) continue;
    $t = kp_tgl(isset($c['date']) ? $c['date'] : '');
    if (!$t) continue;
    if (!isset($peta[$t])) $peta[$t] = $baru;
    $peta[$t][7] += kp_num(isset($c['nominal']) ? $c['nominal'] : 0);
  }
  return $peta;
}

/* TIGA ANGKA PENJUALAN HIDUP DI OFFICE, DAN KETIGANYA SAH. Ini sumber salah
   paham paling mahal di sekitar omset, jadi ditulis sekali di sini:

     net       = food + bev + lainnya − discount     -> Dashboard Omset
     tagihan   = net + service + pajak               -> Rekap Penjualan
     netSales  = tagihan − compliment                -> Laporan CFO

   Agustus 2026 berturut-turut: Rp 546.005.454, Rp 622.035.872,
   Rp 610.400.022. Menyebut "angka omset" tanpa menyebut layarnya selalu
   ambigu.

   COMPLIMENT ADALAH SELISIH KETIGA-KEDUA. Di Office ia METODE PEMBAYARAN
   (reports[].pay.compliment): barangnya tetap ditagihkan lalu "dibayar"
   pakai compliment, jadi ia ADA di dalam tagihan. Di laporan CFO ia baris
   diskon yang memotong penjualan, karena tamunya memang tidak membayar.
   `daily.discount` TIDAK memuatnya — itu cuma bill discount — jadi
   mengurangkannya aman, tidak ada yang terpotong dua kali. Kalau suatu hari
   compliment ikut dimasukkan ke kolom Discount di Input Omset Harian,
   pengurangan ini WAJIB dicabut. */
function kp_net_hari($v)      { return $v[0] + $v[1] + $v[2] - $v[3]; }
function kp_tagihan_hari($v)  { return kp_net_hari($v) + $v[4] + $v[5]; }
function kp_netsales_hari($v) { return kp_tagihan_hari($v) - $v[7]; }

/* Rekap per bulan. [net, bill, hari, service, pajak, compliment,
   food, bev, lainnya, diskon] — dipakai KPI, grafik tahunan, dan susunan
   laba rugi sekaligus, semuanya dari peta yang sama. */
function kp_peta_bulanan($peta) {
  $b = array();
  foreach ($peta as $t => $v) {
    $k = substr($t, 0, 7);
    if (!isset($b[$k])) $b[$k] = array(0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
    $b[$k][0] += kp_net_hari($v);
    $b[$k][1] += $v[6];
    $b[$k][2] += 1;
    $b[$k][3] += $v[4];
    $b[$k][4] += $v[5];
    $b[$k][5] += $v[7];
    $b[$k][6] += $v[0];
    $b[$k][7] += $v[1];
    $b[$k][8] += $v[2];
    $b[$k][9] += $v[3];
  }
  return $b;
}

/* ==================== LABA RUGI BULANAN (untuk halaman investor) ==========
   Meniru bentuk "Profit Loss Report" yang disiapkan CFO tiap bulan, supaya
   investor melihat susunan yang sama dengan laporan resminya — bukan bentuk
   karangan sendiri yang harus dicocokkan manual tiap kali.

   YANG BISA DIISI DARI SISTEM INI, dan hanya ini:

     Sales - Food              <- daily.food
     Sales - Beverage          <- daily.bev
     Sales - Other             <- daily.lainnya
     Income Pb 1               <- daily.tax             (pajak restoran)
     Income service charge     <- daily.service_charge
     Bill Discount             <- daily.discount
     Compliment                <- compliments[].nominal
     Total Sales / Net Sales   <- dihitung dari yang di atas

   YANG TIDAK ADA DI SISTEM INI: COGS, Operational Expense, Other Income &
   Expense, dan Depreciation. Semuanya dicatat di pembukuan CFO, tidak ada
   satu pun layar Office yang menginputnya. Karena itu fungsi ini TIDAK
   memulangkan Gross Profit, EBITDA, EBIT, EBT, maupun Net Profit — angka
   yang dihitung dari nol yang dianggap nol adalah angka yang salah, dan di
   halaman investor angka salah lebih mahal daripada kolom kosong.
   Layar yang menggambarnya menandai baris-baris itu "belum ada inputnya".

   `netSales` di sini SAMA PERSIS dengan `netSales` di ringkas_investor():
     totalSales − totalDiskon
       = (food+bev+lainnya+pajak+service) − (diskon+compliment)
       = net + service + pajak − compliment
   Bukan kebetulan — keduanya dihitung dari kp_peta_harian() yang sama.
   ====================================================================== */
function laba_rugi_bulanan($peta = null) {
  if ($peta === null) $peta = kp_peta_harian();
  $b = kp_peta_bulanan($peta);
  krsort($b);        // bulan terbaru lebih dulu — itu yang dibuka orang duluan

  $out = array();
  foreach ($b as $k => $v) {
    $totalSales  = $v[6] + $v[7] + $v[8] + $v[4] + $v[3];   // food+bev+lainnya+pajak+service
    $totalDiskon = $v[9] + $v[5];                            // bill discount + compliment
    $out[] = array(
      'kunci'       => $k,
      'food'        => $v[6],
      'bev'         => $v[7],
      'lainnya'     => $v[8],
      'pb1'         => $v[4],
      'service'     => $v[3],
      'totalSales'  => $totalSales,
      'diskon'      => $v[9],
      'compliment'  => $v[5],
      'totalDiskon' => $totalDiskon,
      'netSales'    => $totalSales - $totalDiskon,
      'hariTerisi'  => $v[2]
    );
  }
  return $out;
}

function ringkas_investor() {
  $peta = kp_peta_harian();
  $b    = kp_peta_bulanan($peta);

  $terakhir = null;
  foreach ($peta as $t => $v) {
    if ($terakhir === null || strcmp($t, $terakhir) > 0) $terakhir = $t;
  }

  $hariIni = kp_hari_ini_wib();
  $kemarin = gmdate('Y-m-d', strtotime($hariIni . ' -1 day'));
  $blnIni  = substr($hariIni, 0, 7);
  $blnLalu = gmdate('Y-m', strtotime($blnIni . '-01 -1 month'));

  /* Satu bulan jadi satu blok balasan. Ditulis sekali supaya bulan ini dan
     bulan lalu tidak pernah tersusun beda — sempat begitu, dan akibatnya
     bulan lalu tidak punya angka pembanding yang sejenis sehingga deltanya
     diam-diam mengadu dua konvensi berbeda. */
  $blokBulan = function ($k) use ($b) {
    $v = isset($b[$k]) ? $b[$k] : array(0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
    $tagihan = $v[0] + $v[3] + $v[4];
    return array('kunci' => $k,
                 'omset' => $v[0], 'transaksi' => $v[1], 'hariTerisi' => $v[2],
                 'svc' => $v[3], 'pajak' => $v[4], 'compliment' => $v[5],
                 'dibayarTamu' => $tagihan,
                 'netSales'    => $tagihan - $v[5]);
  };

  /* Grafik year-over-year memakai NET SALES — sama dengan kartu KPI di
     atasnya dan sama dengan tab Laba Rugi. Kalau kartunya satu konvensi dan
     grafiknya konvensi lain, orang yang menjumlahkan batangnya mendapat
     angka lain daripada yang tertulis besar di atas.

     HANYA tahun yang benar-benar punya data yang ikut — tahun kosong yang
     tetap digambar menghasilkan garis rata nol, dan garis nol terbaca
     sebagai "tahun itu tidak jualan", bukan "datanya belum diisi". Bulan
     tanpa data dipulangkan null (bukan 0) dengan alasan yang sama. */
  $tahunan = array();
  foreach ($b as $k => $v) {
    $th = substr($k, 0, 4);
    $bl = (int)substr($k, 5, 2) - 1;
    if (!isset($tahunan[$th])) $tahunan[$th] = array_fill(0, 12, null);
    $tahunan[$th][$bl] = $v[0] + $v[3] + $v[4] - $v[5];
  }
  ksort($tahunan);

  /* SELURUH hari yang ada datanya, bukan 30 hari terakhir (29 Agustus 2026,
     permintaan user: tampilan harian diganti jadi per bulan). Layar yang
     memilih bulannya, jadi server tidak perlu tahu bulan mana yang sedang
     dibuka — dan berpindah bulan tidak menembak server lagi.

     Yang dikirim CUMA hari yang benar-benar terisi. Hari kosong TIDAK
     dibuatkan barisnya di sini: layar menyusun sendiri 1..31 untuk bulan yang
     dipilih dan menandai yang tidak ada sebagai kosong. Kalau server yang
     mengirim seluruh hari kalender, balasannya penuh baris null untuk bulan
     yang memang belum ada datanya sama sekali.

     Ukurannya tetap kecil: satu tahun penuh ~365 baris x ~60 byte.

     `omset` di sini NET SALES, seragam dengan kartu dan grafik tahunan;
     `net` dan `tagihan` ikut supaya layar bisa berpindah konvensi tanpa
     menyentuh server. */
  $harian = array();
  $tglUrut = array_keys($peta);
  sort($tglUrut);
  foreach ($tglUrut as $t) {
    $harian[] = array('tgl' => $t,
                      'omset'   => kp_netsales_hari($peta[$t]),
                      'tagihan' => kp_tagihan_hari($peta[$t]),
                      'net'     => kp_net_hari($peta[$t]));
  }

  $s  = kp_state_assoc();
  $st = (isset($s['settings']) && is_array($s['settings'])) ? $s['settings'] : array();
  $adaHariIni = isset($peta[$hariIni]);
  $adaKemarin = isset($peta[$kemarin]);

  $bi = $blokBulan($blnIni);
  $bi['target'] = kp_num(isset($st['companyMonthlyTarget']) ? $st['companyMonthlyTarget'] : 0);

  return array(
    'ts'       => gmdate('c'),
    'hariIni'  => array('tgl' => $hariIni,
                        'omset'      => $adaHariIni ? kp_net_hari($peta[$hariIni]) : null,
                        'transaksi'  => $adaHariIni ? $peta[$hariIni][6] : null,
                        'svc'        => $adaHariIni ? $peta[$hariIni][4] : null,
                        'pajak'      => $adaHariIni ? $peta[$hariIni][5] : null,
                        'compliment' => $adaHariIni ? $peta[$hariIni][7] : null,
                        /* Sama dengan kartu "Dibayar Tamu" di Rekap Penjualan. */
                        'dibayarTamu'=> $adaHariIni ? kp_tagihan_hari($peta[$hariIni])  : null,
                        /* Sama dengan "Net Sales" di Laporan Laba Rugi. */
                        'netSales'   => $adaHariIni ? kp_netsales_hari($peta[$hariIni]) : null),
    'kemarin'  => array('tgl' => $kemarin,
                        'omset'       => $adaKemarin ? kp_net_hari($peta[$kemarin]) : null,
                        'dibayarTamu' => $adaKemarin ? kp_tagihan_hari($peta[$kemarin])  : null,
                        'netSales'    => $adaKemarin ? kp_netsales_hari($peta[$kemarin]) : null),
    'bulanIni' => $bi,
    'bulanLalu'=> $blokBulan($blnLalu),
    'tahunan'  => $tahunan,
    'harian'   => $harian,
    /* Daftar laporan PDF per bulan. Ikut di balasan ini dan bukan aksi
       sendiri: daftarnya pendek (dua berkas per bulan) dan tab Laporan ada di
       halaman yang sama. Yang TIDAK ikut adalah isi berkasnya — itu diambil
       satu per satu lewat investorLaporFile saat tombolnya ditekan. */
    'lapor'    => inv_lapor_daftar(),
    /* Susunan Profit Loss Report per bulan. Ikut di balasan ini, bukan
       endpoint sendiri: bulannya cuma belasan, dan satu perjalanan lebih
       murah daripada dua. PETANYA DIOPER, bukan dibaca ulang — sekali baca
       blob, dan dijamin dua tab menghitung dari angka yang sama persis. */
    /* Pengembalian modal investor, diambil server-ke-server dari panel
       Brankas. Ikut di balasan ini dan bukan aksi sendiri: tab Dividen
       ada di halaman yang sama dan daftarnya pendek — satu perjalanan
       lebih murah daripada dua. Kalau finance-api mati, `gagal:true` dan
       layar mengatakannya; daftar kosong yang berarti "servernya mati"
       terbaca sebagai "belum pernah ada pembagian". */
    'dividen' => dividen_investor(),
    'labaRugi' => laba_rugi_bulanan($peta),
    /* Tanggal data terakhir yang benar-benar diisi. Halaman investor
       memajangnya apa adanya — tanpa itu, omset hari ini yang kosong karena
       kasir belum menutup buku terbaca sebagai omset nol. */
    'terakhir' => $terakhir,
    'adaData'  => count($peta) > 0
  );
}

/* ==================== AGENDA & PROMO UNTUK HALAMAN INVESTOR ==============
   Dipakai investor.laksamanamuda.id, tab Upcoming Event & Promo.

   KENAPA DIKUMPULKAN DI SINI, BUKAN DIPANGGIL LANGSUNG DARI PERAMBAN
   ---------------------------------------------------------------------
   Sumbernya tiga modul lain: Marketing, Event, dan BD OS. Ketiganya punya
   `getAll` yang TIDAK menanyakan siapa pun dan memulangkan seluruh blob —
   marketing membawa CRM klien, pipeline, dan invoice; bd membawa purchase
   order berikut harganya. Menyuruh halaman investor memanggilnya berarti
   menuliskan tiga alamat itu di dalam HTML yang dibuka orang luar
   perusahaan, dan siapa pun yang membuka View Source memegangnya.

   Jadi peramban cuma bicara ke SATU pintu berpagar (investorAgenda di
   kompas-api), dan server yang mengambil ketiganya SERVER-KE-SERVER lalu
   memulangkan daftar pendek berisi judul, tanggal, tempat. Tidak ada nama
   klien, tidak ada nilai rupiah, tidak ada nomor telepon.

   Kenapa di kompas-api dan bukan modul masing-masing: lib_sesi.php sudah ada
   di sini. Menaruh gerbang di tiga modul berarti tiga salinan baru berkas
   kembar itu — sekarang tiga, akan jadi enam — dan berkas kembar yang
   terlalu banyak adalah berkas kembar yang salah satunya pasti tertinggal.

   `poster` promo SENGAJA tidak ikut. Isinya data URI hasil unggahan, bisa
   400 KB per promo; sepuluh promo berarti balasan 4 MB untuk halaman yang
   cuma perlu tahu ada promo apa.
   ====================================================================== */

/* Alamat modul tetangga di host yang SAMA. SERVER_NAME, bukan HTTP_HOST —
   HTTP_HOST datang dari permintaan dan bisa dipalsukan, dan alamat yang bisa
   dialihkan berarti data yang bisa dialihkan. Alasan yang sama persis dengan
   sesi_akun_url() di lib_sesi.php. */
function kp_url_modul($folder) {
  $host = isset($_SERVER['SERVER_NAME']) ? $_SERVER['SERVER_NAME']
        : (isset($_SERVER['HTTP_HOST']) ? $_SERVER['HTTP_HOST'] : '');
  if ($host === '') return '';
  $skema = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
  return $skema . '://' . $host . '/' . $folder . '/api.php?action=getAll';
}

/* GET JSON server-ke-server. Gagal = array kosong, TIDAK melempar: satu modul
   yang sedang mati tidak boleh mengosongkan seluruh tab. Yang gagal dicatat
   dan dilaporkan ke layar sebagai satu baris peringatan — pola yang sama
   dengan muatDW() di modul Jadwal. */
function kp_ambil_modul($folder) {
  $url = kp_url_modul($folder);
  if ($url === '') return null;
  $jawab = null;
  if (function_exists('curl_init')) {
    $ch = curl_init($url);
    curl_setopt_array($ch, array(
      CURLOPT_RETURNTRANSFER => true,
      CURLOPT_TIMEOUT        => 8,
      CURLOPT_FOLLOWLOCATION => true,
    ));
    $jawab = curl_exec($ch);
    curl_close($ch);
  } else {
    $ctx = stream_context_create(array('http' => array('method' => 'GET', 'timeout' => 8)));
    $jawab = @file_get_contents($url, false, $ctx);
  }
  if (!is_string($jawab) || $jawab === '') return null;
  $d = json_decode($jawab, true);
  if (!is_array($d) || empty($d['ok']) || !isset($d['data']) || !is_array($d['data'])) return null;
  return $d['data'];
}

/* "YYYY-MM-DD HH:MM" atau "YYYY-MM-DDTHH:MM" -> array(tgl, jam).
   Modul Event menyimpan tanggal+jam dalam satu kolom, Marketing memisahnya. */
function kp_pecah_waktu($v) {
  $v = trim((string)$v);
  if ($v === '') return null;
  if (!preg_match('/^(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}:\d{2}))?/', $v, $m)) return null;
  return array('tgl' => $m[1], 'jam' => isset($m[2]) ? $m[2] : '');
}

function kp_teks($v, $maks = 120) {
  $s = trim((string)$v);
  if ($s === '') return '';
  return function_exists('mb_substr') ? mb_substr($s, 0, $maks, 'UTF-8') : substr($s, 0, $maks);
}

/* Agenda & promo yang MASIH RELEVAN saja.
   ---------------------------------------------------------------------
   Event: dari hari ini ke depan, diurut paling dekat dulu.
   Promo: yang sedang berjalan dan yang akan datang — persis seperti Radar.
          Yang sudah berakhir tidak ikut; halaman investor bukan arsip.

   Batas 20 baris per daftar bukan kosmetik: tanpa batas, satu modul yang
   berisi ratusan event lama membuat balasan ini membengkak untuk halaman
   yang cuma menampilkan agenda terdekat. Yang terpotong DILAPORKAN
   (`lebih`), bukan dibuang diam-diam — daftar yang memotong tanpa
   mengatakannya terbaca sebagai "cuma segitu acaranya". */
function agenda_investor() {
  $hariIni = kp_hari_ini_wib();
  /* Event dibatasi jauh lebih longgar daripada promo sejak halaman
     investor punya kalender: tampilan bulanan butuh SELURUH acara di bulan
     yang sedang dilihat, dan potongan 20 baris membuat bulan-bulan berikutnya
     tergambar kosong padahal acaranya ada. Balasannya tetap kecil — satu
     acara ~150 byte. */
  $BATAS_EVENT = 200;
  $BATAS_PROMO = 50;
  $gagal = array();

  /* ---------- EVENT: Marketing + Event ---------- */
  $ev = array();

  $mkt = kp_ambil_modul('marketing-api-mysql');
  if ($mkt === null) $gagal[] = 'Marketing';
  else foreach ((isset($mkt['events']) && is_array($mkt['events'])) ? $mkt['events'] : array() as $e) {
    if (!is_array($e)) continue;
    $t = kp_tgl(isset($e['tanggal']) ? $e['tanggal'] : '');
    if (!$t || strcmp($t, $hariIni) < 0) continue;
    $d = (isset($e['detail']) && is_array($e['detail'])) ? $e['detail'] : array();
    $ev[] = array(
      'tgl'    => $t,
      'jam'    => kp_teks(isset($d['tamuDatang']) ? $d['tamuDatang'] : '', 5),
      'judul'  => kp_teks(isset($e['nama']) ? $e['nama'] : '') ?: '(tanpa nama)',
      'tempat' => kp_teks(isset($d['area']) ? $d['area'] : '', 60),
      'jenis'  => kp_teks(isset($e['jenis']) ? $e['jenis'] : '', 40),
      'pax'    => kp_num(isset($e['pax']) ? $e['pax'] : 0),
      'sumber' => 'Marketing');
  }

  $evt = kp_ambil_modul('event-api-mysql');
  if ($evt === null) $gagal[] = 'Event';
  else foreach ((isset($evt['events']) && is_array($evt['events'])) ? $evt['events'] : array() as $e) {
    if (!is_array($e)) continue;
    $m = kp_pecah_waktu(isset($e['start_datetime']) ? $e['start_datetime']
                       : (isset($e['tanggal']) ? $e['tanggal'] : ''));
    if (!$m || strcmp($m['tgl'], $hariIni) < 0) continue;
    $ev[] = array(
      'tgl'    => $m['tgl'],
      'jam'    => $m['jam'],
      'judul'  => kp_teks(isset($e['title']) ? $e['title'] : '') ?: '(tanpa judul)',
      'tempat' => kp_teks(isset($e['venue']) ? $e['venue'] : '', 60),
      'jenis'  => kp_teks(isset($e['category']) ? $e['category'] : '', 40),
      'pax'    => kp_num(isset($e['capacity']) ? $e['capacity'] : 0),
      'sumber' => 'Event');
  }

  /* Terdekat dulu. Agenda tanpa jam ditaruh di AKHIR harinya, bukan awal:
     string kosong secara alami terurut paling kecil, sehingga acara
     berjam-tidak-diketahui akan naik ke puncak dan terbaca seolah paling
     pagi. Sudah jadi masalah di Radar. */
  usort($ev, function ($a, $b) {
    if ($a['tgl'] !== $b['tgl']) return strcmp($a['tgl'], $b['tgl']);
    $ja = $a['jam'] === '' ? '99:99' : $a['jam'];
    $jb = $b['jam'] === '' ? '99:99' : $b['jam'];
    return strcmp($ja, $jb);
  });
  $evLebih = count($ev) > $BATAS_EVENT ? count($ev) - $BATAS_EVENT : 0;
  $ev = array_slice($ev, 0, $BATAS_EVENT);

  /* ---------- PROMO: BD OS ---------- */
  $pr = array();
  $prLebih = 0;
  $bd = kp_ambil_modul('bd-api-mysql');
  if ($bd === null) $gagal[] = 'BD OS';
  else {
    foreach ((isset($bd['promos']) && is_array($bd['promos'])) ? $bd['promos'] : array() as $p) {
      if (!is_array($p)) continue;
      if (!empty($p['paused'])) continue;              // dijeda = tidak berlaku
      $a = kp_tgl(isset($p['mulai']) ? $p['mulai'] : '');
      $b = kp_tgl(isset($p['selesai']) ? $p['selesai'] : '');
      if ($b && strcmp($b, $hariIni) < 0) continue;    // sudah berakhir
      $pr[] = array(
        'nama'     => kp_teks(isset($p['nama']) ? $p['nama'] : '') ?: '(tanpa nama)',
        'kategori' => kp_teks(isset($p['kategori']) ? $p['kategori'] : '', 20),
        'benefit'  => kp_teks(isset($p['benefit']) ? $p['benefit'] : '', 80),
        'outlet'   => kp_teks(isset($p['outlet']) ? $p['outlet'] : '', 60),
        'mulai'    => $a ? $a : '',
        'selesai'  => $b ? $b : '',
        'status'   => ($a && strcmp($hariIni, $a) < 0) ? 'upcoming' : 'running');
    }
    /* Yang berjalan dulu, lalu yang paling dekat mulainya — urutan yang sama
       dengan papan Promo di BD dan Radar. Dua layar yang menampilkan data
       sama dengan urutan berbeda membuat orang mengira salah satunya belum
       tersegarkan. */
    usort($pr, function ($x, $y) {
      $sx = $x['status'] === 'running' ? 0 : 1;
      $sy = $y['status'] === 'running' ? 0 : 1;
      if ($sx !== $sy) return $sx - $sy;
      return strcmp($x['mulai'], $y['mulai']);
    });
    $prLebih = count($pr) > $BATAS_PROMO ? count($pr) - $BATAS_PROMO : 0;
    $pr = array_slice($pr, 0, $BATAS_PROMO);
  }

  return array(
    'ts'         => gmdate('c'),
    'hariIni'    => $hariIni,
    'event'      => $ev,
    'eventLebih' => $evLebih,
    'promo'      => $pr,
    'promoLebih' => $prLebih,
    /* Modul yang tidak menjawab. Dilaporkan apa adanya ke layar — daftar
       kosong yang sebenarnya berarti "servernya mati" terbaca sebagai
       "memang tidak ada acara", dan itu dua hal yang sangat berbeda. */
    'gagal'      => $gagal
  );
}

/* ==================== DIVIDEN / PENGEMBALIAN MODAL =======================
   Dicatat CFO di panel Finance → Brankas → Pengembalian Modal, dan tersimpan
   di tabel bk_state milik finance-mysql — database yang BERBEDA dari blob
   omset ini. Karena itu diambil server-ke-server lewat finance-api, cara yang
   sama persis dengan agenda_investor() mengambil Marketing/Event/BD.

   KENAPA TIDAK DIBALIK — halaman investor memanggil finance-api langsung?
   Karena finance-api tidak punya lib_sesi.php dan seluruh aksinya terbuka.
   Menyuruh halaman investor memanggilnya berarti menuliskan alamat backend
   Kas Kecil — buku kas, invoice, seluruh transaksi harian — di dalam HTML
   yang dibuka orang luar perusahaan. Satu pintu berpagar, dan pintunya di
   sini.

   Yang dipulangkan cuma nama investor, tanggal, dan nominal. TIDAK ada
   nomor rekening, TIDAK ada wallet asalnya (itu urusan internal Finance),
   dan TIDAK ada modal maupun kepemilikan investor LAIN — tiap investor
   melihat daftar yang sama, jadi apa pun yang ada di sini terlihat oleh
   semuanya.
   ====================================================================== */
function dividen_investor() {
  $url = kp_url_modul('finance-api-mysql');
  if ($url === '') return array('riwayat' => array(), 'gagal' => true);
  /* kp_ambil_modul() memakai getAll; brankas punya aksinya sendiri, jadi
     alamatnya ditambal di sini. */
  $url = str_replace('action=getAll', 'action=brankasGet', $url);
  $jawab = null;
  if (function_exists('curl_init')) {
    $ch = curl_init($url);
    curl_setopt_array($ch, array(CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 8, CURLOPT_FOLLOWLOCATION => true));
    $jawab = curl_exec($ch); curl_close($ch);
  } else {
    $ctx = stream_context_create(array('http' => array('method' => 'GET', 'timeout' => 8)));
    $jawab = @file_get_contents($url, false, $ctx);
  }
  if (!is_string($jawab) || $jawab === '') return array('riwayat' => array(), 'gagal' => true);
  $d = json_decode($jawab, true);
  if (!is_array($d) || empty($d['ok']) || !isset($d['data']['data']['investor'])) {
    return array('riwayat' => array(), 'gagal' => true);
  }
  $inv = $d['data']['data']['investor'];
  if (!is_array($inv)) return array('riwayat' => array(), 'gagal' => true);

  $riwayat = array(); $totalModal = 0;
  foreach ($inv as $i) {
    if (!is_array($i)) continue;
    $totalModal += kp_num(isset($i['capital']) ? $i['capital'] : 0);
    $nama = kp_teks(isset($i['name']) ? $i['name'] : '', 80);
    $ret = (isset($i['returns']) && is_array($i['returns'])) ? $i['returns'] : array();
    foreach ($ret as $r) {
      if (!is_array($r)) continue;
      $t = kp_tgl(isset($r['date']) ? $r['date'] : '');
      $n = kp_num(isset($r['amount']) ? $r['amount'] : 0);
      if (!$t || !$n) continue;
      $riwayat[] = array('tgl' => $t, 'investor' => $nama, 'nominal' => $n);
    }
  }
  /* Terbaru dulu — yang dibuka investor pertama kali adalah "kapan terakhir
     saya dibayar", bukan yang paling lama. */
  usort($riwayat, function ($a, $b) { return strcmp($b['tgl'], $a['tgl']); });

  return array(
    'riwayat'    => $riwayat,
    'total'      => array_reduce($riwayat, function ($a, $x) { return $a + $x['nominal']; }, 0),
    'modal'      => $totalModal,
    'investor'   => count($inv),
    'gagal'      => false
  );
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

/* =====================================================================
   ANALYTICS — ringkasan laporan POS yang diunggah (28 Agustus 2026)
   ---------------------------------------------------------------------
   MENUMPANG kompas-mysql, bukan backend sendiri. Backend baru berarti
   config.php baru yang harus disunting manual di cPanel, dan langkah manual
   di repo ini rutin tertinggal — modulnya jalan di dev lalu 500 di produksi
   tanpa satu pun galat yang menyebut sebabnya. Di sini ia numpang koneksi
   yang sudah ada, dan tabelnya lahir sendiri lewat an_pastikan().

   Ditaruh di kompas karena yang dianalisis adalah PENJUALAN, dan Rekap
   Penjualan tinggal di sini. Halaman Analytics membandingkan angka POS
   dengan angka Kompas untuk hari yang sama — dua sumber di dua database
   berbeda akan membuat perbandingan itu menyeberang jaringan tanpa alasan.

   TABEL SENDIRI, BUKAN blob `settings` milik saveAll. Modul Omset mengirim
   SELURUH state-nya tiap kali menyimpan; menaruh analytics di dalamnya
   berarti satu simpan dari layar Omset menghapus seluruh riwayat unggahan
   tanpa ada yang menyadarinya. Bahaya yang sama sudah tercatat untuk
   jadwal & dw di CLAUDE.md.

   YANG DISIMPAN RINGKASANNYA, BUKAN BARISNYA. Satu bulan = 4.000-an bill;
   setahun 50.000 baris, dan blob sebesar itu harus dibaca utuh tiap kali
   halaman dibuka. Yang disimpan: per tanggal, per jam, dan per menu —
   cukup untuk seluruh pertanyaan yang dijawab halaman ini, dan tetap di
   bawah 100 KB per bulan.
   ===================================================================== */
function an_pastikan() {
  $pdo = db();
  $pdo->exec(
    'CREATE TABLE IF NOT EXISTS `an_state` (
       `id`         TINYINT UNSIGNED NOT NULL PRIMARY KEY,
       `data`       LONGTEXT NOT NULL,
       `updated_at` BIGINT NOT NULL DEFAULT 0,
       `updated_by` VARCHAR(80) NOT NULL DEFAULT \'\'
     ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci');
  /* Matriks halaman x role, bentuknya sama persis dengan bk_akses & kk_akses
     supaya yang membaca salah satunya langsung mengerti yang lain. */
  $pdo->exec(
    'CREATE TABLE IF NOT EXISTS `an_akses` (
       `id`      INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
       `kunci`   VARCHAR(80)  NOT NULL,
       `halaman` VARCHAR(40)  NOT NULL,
       `tingkat` TINYINT      NOT NULL DEFAULT 2,
       UNIQUE KEY `uq_an_akses` (`kunci`,`halaman`)
     ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci');
  $pdo->exec(
    'CREATE TABLE IF NOT EXISTS `an_peran` (
       `kunci` VARCHAR(80) NOT NULL PRIMARY KEY,
       `peran` VARCHAR(20) NOT NULL DEFAULT \'staf\'
     ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci');
}

function an_baca() {
  an_pastikan();
  $pdo = db();

  $data = null; $ts = 0;
  $row = $pdo->query('SELECT `data`,`updated_at` FROM `an_state` WHERE `id`=1')->fetch();
  if ($row && isset($row['data']) && $row['data'] !== '') {
    $d = json_decode((string)$row['data'], true);
    if (is_array($d)) { $data = $d; $ts = (int)$row['updated_at']; }
  }
  /* Bentuk kosong yang LENGKAP, bukan null. Frontend yang menerima null harus
     menuliskan bentuk bawaannya sendiri, dan begitu dua tempat memegang bentuk
     yang sama salah satunya pasti tertinggal saat ada field baru. */
  if ($data === null) $data = array('laporan' => new stdClass(), 'setting' => new stdClass());

  $akses = array();
  foreach ($pdo->query('SELECT `kunci`,`halaman`,`tingkat` FROM `an_akses`')->fetchAll() as $r) {
    $k = (string)$r['kunci'];
    if (!isset($akses[$k])) $akses[$k] = array();
    $akses[$k][(string)$r['halaman']] = (int)$r['tingkat'];
  }
  $peran = array();
  foreach ($pdo->query('SELECT `kunci`,`peran` FROM `an_peran`')->fetchAll() as $r) {
    $peran[(string)$r['kunci']] = (string)$r['peran'];
  }
  return array('data' => $data, 'akses' => (object)$akses, 'peran' => (object)$peran, 'ts' => $ts);
}

function an_simpan($data, $oleh) {
  an_pastikan();
  if (!is_array($data)) return array('ok' => false, 'error' => 'data bukan objek');
  $pdo = db();
  $st = $pdo->prepare(
    'INSERT INTO `an_state` (`id`,`data`,`updated_at`,`updated_by`) VALUES (1,:d,:t,:b)
     ON DUPLICATE KEY UPDATE `data`=VALUES(`data`), `updated_at`=VALUES(`updated_at`),
                             `updated_by`=VALUES(`updated_by`)');
  $st->execute(array(':d' => json_encode($data, JSON_UNESCAPED_UNICODE),
                     ':t' => (int)(microtime(true) * 1000),
                     ':b' => mb_substr((string)$oleh, 0, 80)));
  return array('ok' => true, 'saved' => true);
}

function an_akses_simpan($peta) {
  an_pastikan();
  if (!is_array($peta)) return array('ok' => false, 'error' => 'akses bukan objek');
  $pdo = db();
  $pdo->beginTransaction();
  try {
    $pdo->exec('DELETE FROM `an_akses`');
    $st = $pdo->prepare('INSERT INTO `an_akses` (`kunci`,`halaman`,`tingkat`) VALUES (:k,:h,:t)');
    foreach ($peta as $kunci => $baris) {
      if (!is_array($baris)) continue;
      foreach ($baris as $hal => $tk) {
        $st->execute(array(':k' => mb_substr((string)$kunci, 0, 80),
                           ':h' => mb_substr((string)$hal, 0, 40),
                           ':t' => max(0, min(2, (int)$tk))));
      }
    }
    $pdo->commit();
  } catch (Throwable $e) { if ($pdo->inTransaction()) $pdo->rollBack(); throw $e; }
  return array('ok' => true, 'saved' => true);
}

function an_peran_simpan($peta) {
  an_pastikan();
  if (!is_array($peta)) return array('ok' => false, 'error' => 'peran bukan objek');
  $pdo = db();
  $pdo->beginTransaction();
  try {
    $pdo->exec('DELETE FROM `an_peran`');
    $st = $pdo->prepare('INSERT INTO `an_peran` (`kunci`,`peran`) VALUES (:k,:p)');
    foreach ($peta as $kunci => $p) {
      $st->execute(array(':k' => mb_substr((string)$kunci, 0, 80),
                         ':p' => mb_substr((string)$p, 0, 20)));
    }
    $pdo->commit();
  } catch (Throwable $e) { if ($pdo->inTransaction()) $pdo->rollBack(); throw $e; }
  return array('ok' => true, 'saved' => true);
}

/* =====================================================================
   LAPORAN PDF BULANAN UNTUK INVESTOR (29 Agustus 2026)
   ---------------------------------------------------------------------
   Balance Report & General Ledger Report, satu kali unggah per bulan.

   BINERNYA DI DISK, BUKAN DI DATABASE. Pola yang sama dengan event-mysql
   dan marketing-mysql — dan alasannya sama: General Ledger sebulan bisa
   belasan MB, dan menaruhnya di kolom LONGTEXT berarti tiap pembacaan
   daftar ikut menyeret isinya melewati max_allowed_packet.

   FOLDERNYA DIUSAHAKAN DI LUAR WEB ROOT, dan itu bukan kehati-hatian
   berlebih: berkas ini neraca dan buku besar perusahaan. Kalau terpaksa
   di dalam, ditutup .htaccess — dan tetap tidak pernah dilayani lewat URL
   tebakan, cuma lewat aksi berpagar di api.php.

   YANG DISIMPAN DI DATABASE CUMA PENUNJUKNYA. Satu baris per bulan per
   jenis, dan kuncinya (bulan, jenis) UNIK: mengunggah ulang MENGGANTI,
   bukan menumpuk. Dua Balance Report untuk bulan yang sama berarti
   investor melihat dua tombol yang isinya berbeda tanpa satu pun tanda
   mana yang terbaru.
   ===================================================================== */
function inv_lapor_pastikan() {
  $pdo = db();
  $pdo->exec(
    'CREATE TABLE IF NOT EXISTS `inv_lapor` (
       `id`     INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
       `bulan`  CHAR(7)      NOT NULL,
       `jenis`  VARCHAR(20)  NOT NULL,
       `kunci`  VARCHAR(80)  NOT NULL,
       `nama`   VARCHAR(190) NOT NULL DEFAULT \'\',
       `ukuran` INT UNSIGNED NOT NULL DEFAULT 0,
       `at`     BIGINT       NOT NULL DEFAULT 0,
       `oleh`   VARCHAR(80)  NOT NULL DEFAULT \'\',
       UNIQUE KEY `uq_inv_lapor` (`bulan`,`jenis`)
     ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci');
}

/* Dua jenis, daftar TERTUTUP. Jenis bebas berarti tab Laporan suatu hari
   penuh berkas yang tidak ada yang tahu apa isinya. */
function inv_lapor_jenis() {
  return array('balance' => 'Balance Report', 'ledger' => 'General Ledger Report');
}

function inv_lapor_dir() {
  static $dir = null;
  if ($dir !== null) return $dir;
  if (defined('DATA_DIR') && DATA_DIR !== '') {
    if (!is_dir(DATA_DIR) && !@mkdir(DATA_DIR, 0775, true))
      throw new Exception('DATA_DIR tidak bisa dibuat: ' . DATA_DIR);
    $dir = realpath(DATA_DIR) ?: DATA_DIR;
  } else {
    $luar  = __DIR__ . '/../../../kompas-db';   // di luar public_html
    $dalam = __DIR__ . '/db';                   // terpaksa: ditutup .htaccess
    if (is_dir($luar) || @mkdir($luar, 0775, true))        $dir = $luar;
    else if (is_dir($dalam) || @mkdir($dalam, 0775, true)) $dir = $dalam;
    else throw new Exception('Tidak bisa membuat folder berkas. Cek izin tulis hosting.');
    $dir = realpath($dir) ?: $dir;
  }
  return $dir;
}
function inv_lapor_files_dir() { return inv_lapor_dir() . '/lapor'; }
function inv_lapor_siapkan() {
  if (!is_dir(inv_lapor_files_dir())) @mkdir(inv_lapor_files_dir(), 0775, true);
  /* .htaccess dipasang kalau foldernya terpaksa di dalam web root. Tanpa itu,
     neraca perusahaan bisa diambil siapa pun yang menebak nama berkasnya. */
  if (strpos(inv_lapor_dir(), realpath(__DIR__)) !== 0) return;
  $ht = inv_lapor_dir() . '/.htaccess';
  if (!file_exists($ht)) @file_put_contents($ht,
    "<IfModule mod_authz_core.c>\n  Require all denied\n</IfModule>\n" .
    "<IfModule !mod_authz_core.c>\n  Order allow,deny\n  Deny from all\n</IfModule>\n");
}
/* kunci -> path aman. Kunci buatan kita sendiri (lp_<acak>.pdf), tapi tetap
   dibersihkan: satu hari nanti ada yang mengoper kunci dari luar. */
function inv_lapor_path($kunci) {
  $safe = preg_replace('/[^A-Za-z0-9._-]/', '_', (string)$kunci);
  return inv_lapor_files_dir() . '/' . $safe;
}

function inv_lapor_daftar() {
  inv_lapor_pastikan();
  $out = array();
  foreach (db()->query('SELECT `bulan`,`jenis`,`nama`,`ukuran`,`at`,`oleh`
                        FROM `inv_lapor` ORDER BY `bulan` DESC, `jenis`')->fetchAll() as $r) {
    $b = (string)$r['bulan'];
    if (!isset($out[$b])) $out[$b] = array();
    $out[$b][(string)$r['jenis']] = array(
      'nama' => (string)$r['nama'], 'ukuran' => (int)$r['ukuran'],
      'at' => (int)$r['at'], 'oleh' => (string)$r['oleh']);
  }
  /* (object) supaya peta kosong terkirim sebagai {} bukan [] — aturan JSON
     yang sama dengan seluruh berkas ini. */
  return (object)$out;
}

function inv_lapor_simpan($bulan, $jenis, $payload, $oleh) {
  inv_lapor_pastikan();
  $bulan = trim((string)$bulan);
  if (!preg_match('/^\d{4}-\d{2}$/', $bulan)) return array('ok' => false, 'error' => 'bulan harus YYYY-MM');
  $jenisSah = inv_lapor_jenis();
  if (!isset($jenisSah[$jenis])) return array('ok' => false, 'error' => 'jenis laporan tidak dikenal: ' . $jenis);
  if (!$payload || empty($payload['dataBase64'])) return array('ok' => false, 'error' => 'berkas kosong');

  $bin = base64_decode(preg_replace('#^data:[^,]+,#', '', $payload['dataBase64']), true);
  if ($bin === false) return array('ok' => false, 'error' => 'base64 tidak valid');
  /* HANYA PDF. Diperiksa dari ISI berkasnya, bukan namanya: nama diketik
     orang dan ekstensi bisa diganti, sedangkan empat byte pertama tidak. */
  if (substr($bin, 0, 4) !== '%PDF') return array('ok' => false, 'error' => 'berkasnya bukan PDF');
  if (strlen($bin) > 12 * 1024 * 1024)
    return array('ok' => false, 'error' => 'berkas melebihi 12 MB (' . round(strlen($bin) / 1048576, 1) . ' MB)');

  inv_lapor_siapkan();
  $kunci = 'lp_' . bin2hex(random_bytes(8)) . '.pdf';
  if (file_put_contents(inv_lapor_path($kunci), $bin) === false)
    return array('ok' => false, 'error' => 'gagal menulis berkas (cek izin folder)');

  $pdo = db();
  /* Berkas LAMA dihapus SESUDAH yang baru berhasil ditulis. Dibalik, satu
     kegagalan tulis meninggalkan bulan itu tanpa laporan sama sekali. */
  $st = $pdo->prepare('SELECT `kunci` FROM `inv_lapor` WHERE `bulan`=? AND `jenis`=?');
  $st->execute(array($bulan, $jenis));
  $lama = $st->fetchColumn();

  $pdo->prepare('INSERT INTO `inv_lapor` (`bulan`,`jenis`,`kunci`,`nama`,`ukuran`,`at`,`oleh`)
                 VALUES (?,?,?,?,?,?,?)
                 ON DUPLICATE KEY UPDATE `kunci`=VALUES(`kunci`), `nama`=VALUES(`nama`),
                   `ukuran`=VALUES(`ukuran`), `at`=VALUES(`at`), `oleh`=VALUES(`oleh`)')
      ->execute(array($bulan, $jenis, $kunci,
                      mb_substr((string)(isset($payload['fileName']) ? $payload['fileName'] : $kunci), 0, 190),
                      strlen($bin), (int)(microtime(true) * 1000), mb_substr((string)$oleh, 0, 80)));

  if ($lama && $lama !== $kunci) @unlink(inv_lapor_path($lama));
  return array('ok' => true, 'bulan' => $bulan, 'jenis' => $jenis, 'ukuran' => strlen($bin));
}

/* Dikirim sebagai biner, BUKAN base64 di dalam JSON. Base64 membengkakkan
   berkas 12 MB jadi 16 MB, dan peramban harus menampung keduanya sekaligus
   di memori sebelum satu byte pun sampai ke layar. */
function inv_lapor_sajikan($bulan, $jenis) {
  inv_lapor_pastikan();
  $st = db()->prepare('SELECT `kunci`,`nama` FROM `inv_lapor` WHERE `bulan`=? AND `jenis`=?');
  $st->execute(array((string)$bulan, (string)$jenis));
  $r = $st->fetch();
  if (!$r) { http_response_code(404); header('Content-Type: application/json');
             echo json_encode(array('ok' => false, 'error' => 'laporan tidak ada')); exit; }
  $p = inv_lapor_path($r['kunci']);
  if (!is_file($p)) { http_response_code(404); header('Content-Type: application/json');
             echo json_encode(array('ok' => false, 'error' => 'berkasnya hilang dari disk')); exit; }
  header('Content-Type: application/pdf');
  header('Content-Length: ' . filesize($p));
  header('Content-Disposition: inline; filename="' . preg_replace('/[^A-Za-z0-9._ -]/', '_', $r['nama']) . '"');
  header('Cache-Control: private, max-age=0, no-store');
  readfile($p);
  exit;
}

function inv_lapor_hapus($bulan, $jenis) {
  inv_lapor_pastikan();
  $pdo = db();
  $st = $pdo->prepare('SELECT `kunci` FROM `inv_lapor` WHERE `bulan`=? AND `jenis`=?');
  $st->execute(array((string)$bulan, (string)$jenis));
  $k = $st->fetchColumn();
  $pdo->prepare('DELETE FROM `inv_lapor` WHERE `bulan`=? AND `jenis`=?')
      ->execute(array((string)$bulan, (string)$jenis));
  if ($k) @unlink(inv_lapor_path($k));
  return array('ok' => true);
}
