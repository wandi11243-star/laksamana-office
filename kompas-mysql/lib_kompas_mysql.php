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
  /* OMSET HARI ITU ikut dikirim sejak 9 September 2026 (permintaan user):
     modul Marketing & Event memakainya sebagai PENYEBUT kolom Kontribusi hari
     itu, konvensi yang sama dengan halaman Pengaruh Event di modul Analytics.

     Yang dikirim TAGIHAN (net + service + pajak) — angka yang benar-benar
     ditagihkan ke tamu, dan itu pula yang dibandingkan Analytics. Dihitung
     lewat kp_peta_harian() + kp_tagihan_hari(), BUKAN dijumlahkan sendiri di
     sini: tiga konvensi penjualan hidup berdampingan di Office (net /
     tagihan / netSales) dan salinan keempat rumusnya pasti menyimpang suatu
     hari — salahnya pun muncul sebagai uang, bukan sebagai galat.

     Petanya juga yang MENJUMLAHKAN hari yang punya lebih dari satu baris
     `daily`. Dihitung dari $d saja, hari seperti itu memulangkan separuh
     omsetnya dan kontribusinya jadi dua kali lipat dari yang benar. */
  $petaHari = kp_peta_harian();
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
        /* PENGENAL ACARA ASALNYA — `mkt:<id>` / `vip:<id>` / `evt:<id>`,
           ditulis serapOtomatis() di deploy/finance/omset/. Sejak 9 September
           2026 Daftar Event di modul Marketing & Event disusun dari acara
           MILIK MODUL ITU, dan inilah satu-satunya kunci yang mencocokkan
           baris breakdown dengan acaranya. Dicocokkan lewat NAMA, satu acara
           yang namanya dibetulkan finance langsung berhenti punya pasangan
           dan tampil dua kali: sekali sebagai "belum diinput", sekali
           sebagai "hanya ada di Breakdown". */
        'srcId'     => isset($r['srcId'])     ? (string)$r['srcId'] : '',
        /* Penentu "event corporate" di Skema 1 bonus. Nama kuncinya BERKAS
           KEMBAR dengan yang ditulis deploy/finance/omset/ dan yang dibaca
           pbAgregasi(); beda satu huruf tidak melempar apa pun, barisnya cuma
           berhenti terhitung sebagai corporate. */
        'srcJenis'  => isset($r['srcJenis'])  ? (string)$r['srcJenis'] : '',
      );
    }
    $days[] = array(
      'date'      => $tgl,
      'omsetHari' => isset($petaHari[$tgl]) ? kp_tagihan_hari($petaHari[$tgl]) : 0,
      'bd'        => array($divi => $rows),
    );
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

/* =====================================================================
   CATATAN VOID MANUAL (16 September 2026, permintaan user)
   ---------------------------------------------------------------------
   "Setiap orang wajib melakukan input menu yang harus di-Void-kan."
   Diisi kasir di modul Cashier, DIBACA finance di panel Kas Kecil.

   BEDA DARI TAB VOID DI MODUL ANALYTICS, DAN KEDUANYA MEMANG PERLU:

     Analytics > Void & Cancel : hasil ekspor POS. Menjawab APA yang
                                 di-void menurut mesin — lengkap, tapi
                                 baru ada sesudah berkasnya diunggah,
                                 dan "Order By"-nya akun jabatan yang
                                 dipakai bersama (SPV, OPERATIONAL
                                 MANAGER), bukan nama orang.
     Halaman ini               : keterangan MANUSIA. Kronologi kenapa
                                 itu terjadi dan siapa yang memesan —
                                 dua hal yang tidak pernah ada di
                                 ekspor POS mana pun.

   Yang satu tidak menggantikan yang lain, dan selisih jumlah keduanya
   justru angka yang dicari: POS mencatat 84 item, input manual 12,
   berarti 72 kejadian tidak ada keterangannya.

   ---------------------------------------------------------------------
   TABEL SENDIRI, BUKAN blob `app_state`. Ini bukan pilihan gaya:

   Blob itu ditulis UTUH oleh modul Cashier dan panel Finance > Omset
   (`saveAll`), dan sejak 7 September 2026 ia berpagar penjaga tulis-basi
   `baseTs`. Catatan void diketik kasir di tengah shift, dari tab yang
   sama yang sudah membuka Report Daily sejak pagi — jadi menaruhnya di
   blob berarti tiap catatan void berpeluang ditolak sebagai konflik,
   atau (kalau penjaganya lewat) menimpa koreksi omset yang baru dibuat
   orang di modul sebelah. Penulisannya karena itu GRANULAR PER BARIS,
   pola yang sama dengan `simpanSel` di jadwal dan `simpanAjuan` di dw.
   Jangan "dirapikan" kembali jadi bagian saveAll.

   Tabelnya lahir sendiri lewat void_pastikan(), BUKAN berkas migrasi —
   migrasi di repo ini rutin tertinggal di produksi, dan tabel yang cuma
   ada di dev berarti endpoint yang 500 di satu server dan 200 di
   server sebelahnya.

   TIDAK ADA DELETE, dan itu disengaja. Ini catatan pertanggungjawaban:
   baris yang bisa dihapus orang yang membuatnya bukan catatan, cuma
   draf. Salah input DIBATALKAN (`batal_at`) — barisnya TETAP terlihat,
   dicoret, tidak ikut dijumlahkan, dan alasan pembatalannya tercatat.
   Pola `batalAt` yang sama dipakai Reservasi VIP di modul Marketing.
   ===================================================================== */
function void_pastikan() {
  $pdo = db();
  $pdo->exec(
    'CREATE TABLE IF NOT EXISTS `void_log` (
       `id`           VARCHAR(40)  NOT NULL PRIMARY KEY,
       `tgl`          DATE         NOT NULL,
       `bill`         VARCHAR(60)  NOT NULL DEFAULT \'\',
       `item`         VARCHAR(200) NOT NULL DEFAULT \'\',
       `penginput`    VARCHAR(120) NOT NULL DEFAULT \'\',
       `salah`        VARCHAR(120) NOT NULL DEFAULT \'\',
       `alasan`       TEXT         NULL,
       `nominal`      BIGINT       NOT NULL DEFAULT 0,
       `oleh`         VARCHAR(120) NOT NULL DEFAULT \'\',
       `oleh_id`      VARCHAR(60)  NOT NULL DEFAULT \'\',
       `dibuat`       BIGINT       NOT NULL DEFAULT 0,
       `diubah`       BIGINT       NOT NULL DEFAULT 0,
       `diubah_oleh`  VARCHAR(120) NOT NULL DEFAULT \'\',
       `batal_at`     BIGINT       NOT NULL DEFAULT 0,
       `batal_oleh`   VARCHAR(120) NOT NULL DEFAULT \'\',
       `batal_alasan` VARCHAR(255) NOT NULL DEFAULT \'\',
       KEY `idx_void_tgl` (`tgl`)
     ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci');
  void_pastikan_kolom($pdo);
  /* Persen tax & service, disetel admin. SATU baris — ia setelan
     perusahaan, bukan per orang. */
  $pdo->exec(
    'CREATE TABLE IF NOT EXISTS `void_setting` (
       `id`             TINYINT UNSIGNED NOT NULL PRIMARY KEY,
       `tax_persen`     DECIMAL(6,3) NOT NULL DEFAULT 10.000,
       `service_persen` DECIMAL(6,3) NOT NULL DEFAULT 5.000,
       `updated_at`     BIGINT NOT NULL DEFAULT 0,
       `updated_by`     VARCHAR(120) NOT NULL DEFAULT \'\'
     ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci');
}

/* KOLOM BARU TIDAK BISA LEWAT `CREATE TABLE IF NOT EXISTS` — ia tidak
   pernah menyentuh tabel yang sudah ada, jadi kolomnya cuma lahir di
   pemasangan baru sementara server yang sudah hidup tertinggal tanpa satu
   pun galat. Polanya disalin dari hpp_pastikan_kolom(); berkas migrasi
   sengaja TIDAK dipakai karena di repo ini migrasi rutin tertinggal di
   produksi.

   Bawaannya 0, dan itu berarti "rinciannya tidak pernah dicatat" untuk
   baris yang lahir sebelum 17 September 2026 — BUKAN "subtotalnya nol".
   void_list() yang membedakan keduanya lewat penanda `rinci`. */
function void_pastikan_kolom($pdo) {
  $cek = $pdo->prepare('SELECT COUNT(*) FROM information_schema.COLUMNS
                         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :t
                           AND COLUMN_NAME = :c');
  /* Tipenya ikut di daftar: dua kolom terakhir teks, bukan angka, dan
     satu tipe untuk semuanya membuat nama orang tersimpan sebagai 0. */
  $kolom = array(
    'subtotal'  => 'BIGINT NOT NULL DEFAULT 0',
    'service'   => 'BIGINT NOT NULL DEFAULT 0',
    'tax'       => 'BIGINT NOT NULL DEFAULT 0',
    /* 17 September 2026 — menggantikan `pemesan`, yang TIDAK di-DROP:
       menghapus kolom adalah operasi yang tidak bisa dibatalkan, dan
       kolom kosong yang menganggur tidak merugikan siapa pun. */
    'penginput' => "VARCHAR(120) NOT NULL DEFAULT ''",
    'salah'     => "VARCHAR(120) NOT NULL DEFAULT ''");
  foreach ($kolom as $kol => $tipe) {
    $cek->execute(array(':t' => 'void_log', ':c' => $kol));
    if ((int)$cek->fetchColumn() > 0) continue;
    $pdo->exec('ALTER TABLE `void_log` ADD COLUMN `' . $kol . '` ' . $tipe);
  }
}

/* SETELAN PERSEN. Bawaannya 10% tax dan 5% service — dan itu BUKAN angka
   karangan: diukur atas Cancel Menu Detail Report Agustus 2026, 71 dari 74
   baris bersubtotal memenuhi tax = 10% x SUBTOTAL, sementara hipotesis
   tax = 10% x (subtotal + service) cocok pada NOL baris. Service 5% x
   subtotal, dan total = subtotal + service + tax cocok di 74 dari 74.

   Itu penting karena konvensi yang lebih umum di Indonesia justru
   memajaki (subtotal + service). Dipakai di sini, tiap baris void
   berselisih 0,5% dari yang dicatat POS — selisih yang tidak akan
   dicurigai siapa pun. */
function void_setting_baca() {
  void_pastikan();
  $row = db()->query('SELECT `tax_persen`,`service_persen`,`updated_at`,`updated_by`
                        FROM `void_setting` WHERE `id`=1')->fetch();
  if (!$row) return array('tax' => 10.0, 'service' => 5.0, 'diubah' => 0, 'oleh' => '');
  return array('tax' => (float)$row['tax_persen'], 'service' => (float)$row['service_persen'],
               'diubah' => (float)$row['updated_at'], 'oleh' => (string)$row['updated_by']);
}

function void_setting_simpan($d, $oleh) {
  void_pastikan();
  if (!is_array($d)) return array('ok' => false, 'error' => 'data bukan objek');
  $tax = isset($d['tax']) ? (float)$d['tax'] : -1;
  $svc = isset($d['service']) ? (float)$d['service'] : -1;
  /* Dijepit 0..100. Persen negatif MENGURANGI total void, dan persen di
     atas 100 membuat pajaknya lebih besar daripada barangnya — dua angka
     yang tidak akan bisa dijelaskan siapa pun, dan dua-duanya tersimpan
     tanpa satu pun galat kalau tidak dijepit di sini. */
  foreach (array($tax, $svc) as $p) {
    if (!is_finite($p) || $p < 0 || $p > 100)
      return array('ok' => false, 'error' => 'Persen harus antara 0 dan 100.');
  }
  db()->prepare('INSERT INTO `void_setting` (`id`,`tax_persen`,`service_persen`,`updated_at`,`updated_by`)
                 VALUES (1,:t,:s,:u,:o)
                 ON DUPLICATE KEY UPDATE `tax_persen`=VALUES(`tax_persen`),
                   `service_persen`=VALUES(`service_persen`),
                   `updated_at`=VALUES(`updated_at`), `updated_by`=VALUES(`updated_by`)')
    ->execute(array(':t' => $tax, ':s' => $svc, ':u' => (int)(microtime(true) * 1000),
                    ':o' => mb_substr((string)$oleh, 0, 120)));
  return array('ok' => true, 'saved' => true, 'setting' => void_setting_baca());
}

/* SATU tempat yang memutuskan rincian sebuah item, dipakai jalur satu baris
   DAN jalur banyak item. Dua tempat yang menghitungnya sendiri-sendiri akan
   menyimpang, dan yang menyimpang di sini adalah UANG.

   `nominal` DIHITUNG SERVER (subtotal + service + tax), tidak pernah
   diambil dari kiriman: total yang dikirim layar bisa tidak cocok dengan
   ketiga komponennya — karena salah hitung, karena versi layar lama, atau
   karena diketik ulang dari console — dan yang tersimpan lalu tidak bisa
   dicocokkan dengan rinciannya sendiri.

   KIRIMAN TANPA `subtotal` jatuh ke perilaku LAMA (nominal apa adanya,
   service & tax nol). Itu layar yang belum ter-deploy; menolaknya berarti
   Catatan Void mati selama jendela waktu antara PHP dan HTML mendarat, dan
   urutan pendaratan FTP di repo ini memang tidak bisa dijamin. */
function void_rinci($it) {
  if (!is_array($it)) $it = array();
  $adaSub = array_key_exists('subtotal', $it);
  $sub = $adaSub ? (float)$it['subtotal'] : (isset($it['nominal']) ? (float)$it['nominal'] : 0);
  $svc = $adaSub && isset($it['service']) ? (float)$it['service'] : 0;
  $tax = $adaSub && isset($it['tax']) ? (float)$it['tax'] : 0;
  foreach (array($sub, $svc, $tax) as $v) if (!is_finite($v) || $v < 0) return null;
  return array('subtotal' => (int)round($sub), 'service' => (int)round($svc),
               'tax' => (int)round($tax), 'nominal' => (int)round($sub + $svc + $tax));
}

/* Tanggal ISO yang benar-benar ada di kalender. `2026-02-31` lolos regex
   tapi MySQL menyimpannya jadi `0000-00-00` tanpa satu pun galat, dan
   barisnya lalu hilang dari setiap penyaring bulan. */
function void_tgl_sah($s) {
  $s = trim((string)$s);
  if (!preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', $s, $m)) return '';
  return checkdate((int)$m[2], (int)$m[3], (int)$m[1]) ? $s : '';
}

/* MAKS dipatok supaya satu rentang yang kelewat lebar tidak menarik
   seluruh riwayat ke peramban. Yang terpotong DILAPORKAN jumlahnya —
   daftar yang menyusut diam-diam dibaca sebagai data yang hilang. */
define('VOID_LIST_MAKS', 1500);

function void_list($dari, $sampai) {
  void_pastikan();
  $d = void_tgl_sah($dari);
  $s = void_tgl_sah($sampai);
  $pdo = db();
  $sql = 'SELECT * FROM `void_log`';
  $arg = array();
  if ($d !== '' && $s !== '') { $sql .= ' WHERE `tgl` BETWEEN :d AND :s'; $arg = array(':d' => $d, ':s' => $s); }
  else if ($d !== '')         { $sql .= ' WHERE `tgl` >= :d';            $arg = array(':d' => $d); }
  else if ($s !== '')         { $sql .= ' WHERE `tgl` <= :s';            $arg = array(':s' => $s); }

  /* Jumlahnya dihitung SEBELUM dipotong. Dihitung dari baris yang sudah
     terpotong, angka "N tidak ditampilkan" selalu nol dan pemotongannya
     jadi tidak pernah bisa diketahui siapa pun. */
  $stc = $pdo->prepare(str_replace('SELECT *', 'SELECT COUNT(*)', $sql));
  $stc->execute($arg);
  $total = (int)$stc->fetchColumn();

  $st = $pdo->prepare($sql . ' ORDER BY `tgl` DESC, `dibuat` DESC LIMIT ' . VOID_LIST_MAKS);
  $st->execute($arg);
  $baris = array();
  foreach ($st->fetchAll() as $r) {
    $baris[] = array(
      'id' => (string)$r['id'], 'tgl' => (string)$r['tgl'], 'bill' => (string)$r['bill'],
      'item' => (string)$r['item'],
      /* `pemesan` DIGANTI dua kolom ini 17 September 2026. Kolom lamanya
         sengaja tidak dibaca lagi dan sengaja tidak dihapus. */
      'penginput' => (string)(isset($r['penginput']) ? $r['penginput'] : ''),
      'salah' => (string)(isset($r['salah']) ? $r['salah'] : ''),
      'alasan' => (string)$r['alasan'], 'nominal' => (float)$r['nominal'],
      'subtotal' => (float)$r['subtotal'], 'service' => (float)$r['service'],
      'tax' => (float)$r['tax'],
      /* Baris yang lahir sebelum kolom ini ada TIDAK punya rincian, dan
         nol di ketiganya BUKAN berarti "tidak kena service & tax" — dua
         keadaan yang menuntut bacaan berbeda. Layar memakai penanda ini,
         bukan menyimpulkannya dari angka nol. */
      'rinci' => ((float)$r['subtotal'] > 0 || (float)$r['service'] > 0 || (float)$r['tax'] > 0),
      'oleh' => (string)$r['oleh'], 'olehId' => (string)$r['oleh_id'],
      'dibuat' => (float)$r['dibuat'], 'diubah' => (float)$r['diubah'],
      'diubahOleh' => (string)$r['diubah_oleh'],
      'batalAt' => (float)$r['batal_at'], 'batalOleh' => (string)$r['batal_oleh'],
      'batalAlasan' => (string)$r['batal_alasan']);
  }
  return array('baris' => $baris, 'total' => $total, 'maks' => VOID_LIST_MAKS,
               'setting' => void_setting_baca());
}

/* Wajib diisi, DAN DITEGAKKAN DI SINI — bukan cuma di layar. Penjaga yang
   hanya ada di HTML dilewati siapa pun yang membuka console, dan catatan
   pertanggungjawaban yang separuh kosong tidak menjawab apa pun.

   Nama field-nya BERKAS KEMBAR dengan VOID_WAJIB di kedua modul frontend.
   Beda satu huruf tidak melempar: layar cuma berhenti menandai kotak yang
   salah, lalu kirimannya ditolak server dengan pesan yang menyebut field
   yang tidak ada di form mana pun. */
function void_wajib() {
  return array('tgl' => 'Tanggal', 'bill' => 'Nomor Bill', 'item' => 'Nama Item',
               'penginput' => 'Siapa yang Menginput', 'salah' => 'Kesalahan dari Siapa',
               'alasan' => 'Alasan / Kronologi');
}

/* SERVICE & TAX DIISI SEKALI UNTUK SATU BILL (permintaan user 17 September
   2026), lalu DIBAGI ke tiap item menurut subtotalnya. Yang tersimpan tetap
   satu baris per item — itu yang membuat bentuknya sama dengan ekspor POS,
   dan itu pula yang membuat satu item bisa dibatalkan tanpa menyeret
   lima belas item lain di bill yang sama.

   PEMBAGIANNYA KUMULATIF, bukan "bulatkan tiap baris lalu betulkan baris
   terakhir". Cara yang kedua terlihat lebih sederhana dan MENGHASILKAN
   BARIS MINUS: kalau servicenya kecil dan barisnya banyak, pembulatan tiap
   baris bisa menjumlah melampaui totalnya, dan koreksi di baris terakhir
   menariknya ke bawah nol. Komponen minus ditolak void_rinci(), jadi yang
   sampai ke layar adalah seluruh bill yang gagal disimpan dengan pesan yang
   tidak bisa dijelaskan siapa pun.

   Cara kumulatif menjamin dua hal sekaligus: jumlahnya SAMA PERSIS dengan
   yang diketik, dan tidak satu baris pun bisa negatif. */
function void_bagi($subs, $total) {
  $n = count($subs);
  $out = array_fill(0, $n, 0);
  if ($n === 0 || $total <= 0) return $out;
  $semua = 0;
  foreach ($subs as $v) $semua += $v;
  /* Subtotal SELURUHNYA nol (mis. sebill compliment) tapi servicenya
     diketik: tidak ada yang bisa jadi dasar pembagian, jadi ia jatuh utuh
     ke baris pertama. Dibagi rata, angkanya jadi pecahan yang tidak pernah
     diketik siapa pun di baris mana pun. */
  if ($semua <= 0) { $out[0] = (int)round($total); return $out; }
  $akum = 0; $akumSub = 0;
  foreach ($subs as $i => $v) {
    $akumSub += $v;
    $sampai = (int)round($total * $akumSub / $semua);
    $out[$i] = $sampai - $akum;
    $akum = $sampai;
  }
  return $out;
}

function void_simpan($d, $oleh, $olehId) {
  void_pastikan();
  if (!is_array($d)) return array('ok' => false, 'error' => 'data bukan objek');

  $nil = array(
    'tgl'     => void_tgl_sah(isset($d['tgl']) ? $d['tgl'] : ''),
    'bill'    => trim((string)(isset($d['bill'])    ? $d['bill']    : '')),
    'item'    => trim((string)(isset($d['item'])    ? $d['item']    : '')),
    'penginput' => trim((string)(isset($d['penginput']) ? $d['penginput'] : '')),
    'salah'   => trim((string)(isset($d['salah'])   ? $d['salah']   : '')),
    'alasan'  => trim((string)(isset($d['alasan'])  ? $d['alasan']  : '')));

  if (($e = void_layar_lama($d)) !== null) return $e;
  $kurang = array();
  foreach (void_wajib() as $k => $label) if ($nil[$k] === '') $kurang[] = $label;
  if (count($kurang)) {
    return array('ok' => false, 'kurang' => $kurang,
                 'error' => 'Belum lengkap: ' . implode(', ', $kurang));
  }

  /* Nominal BOLEH nol — barang yang di-void sebelum sempat dibuat memang
     tidak bernilai rupiah, dan menolaknya memaksa orang mengetik angka
     karangan. Yang ditolak cuma yang NEGATIF: void bernominal minus
     MENAMBAH omset, dan angka itu tidak akan bisa dijelaskan siapa pun. */
  $rn = void_rinci($d);
  if ($rn === null) return array('ok' => false, 'error' => 'Nominal tidak boleh minus.');

  $pdo = db();
  $now = (int)(microtime(true) * 1000);
  $id  = trim((string)(isset($d['id']) ? $d['id'] : ''));

  $lama = null;
  if ($id !== '') {
    $st = $pdo->prepare('SELECT * FROM `void_log` WHERE `id`=?');
    $st->execute(array($id));
    $lama = $st->fetch();
  }

  if ($lama) {
    /* Baris yang SUDAH DIBATALKAN tidak bisa disunting lagi. Kalau bisa,
       pembatalan berubah jadi tombol hapus-lalu-pakai-ulang: id yang sama
       menyimpan kejadian yang sama sekali berbeda, dan jejak pembatalannya
       ikut menunjuk ke isi yang bukan lagi yang dibatalkan. */
    if ((float)$lama['batal_at'] > 0)
      return array('ok' => false, 'error' => 'Catatan ini sudah dibatalkan dan tidak bisa diubah lagi.');
    $st = $pdo->prepare(
      'UPDATE `void_log` SET `tgl`=:t,`bill`=:b,`item`=:i,`penginput`=:p,`salah`=:sl,`alasan`=:a,
              `nominal`=:n,`subtotal`=:sb,`service`=:sv,`tax`=:tx,
              `diubah`=:u,`diubah_oleh`=:o WHERE `id`=:id');
    $st->execute(array(':t' => $nil['tgl'], ':b' => mb_substr($nil['bill'], 0, 60),
                       ':i' => mb_substr($nil['item'], 0, 200), ':p' => mb_substr($nil['penginput'], 0, 120),
                       ':sl' => mb_substr($nil['salah'], 0, 120),
                       ':a' => $nil['alasan'], ':n' => $rn['nominal'],
                       ':sb' => $rn['subtotal'], ':sv' => $rn['service'], ':tx' => $rn['tax'],
                       ':u' => $now, ':o' => mb_substr((string)$oleh, 0, 120), ':id' => $id));
    return array('ok' => true, 'saved' => true, 'id' => $id, 'baru' => false);
  }

  /* Id dibuat SERVER, bukan diterima dari peramban: id kiriman bisa
     menabrak baris orang lain — disengaja maupun tidak — dan cabang UPDATE
     di atas akan menimpanya tanpa satu pun tanda.

     Tiap penanda bernama dipakai SEKALI walau nilainya sama persis.
     PDO::ATTR_EMULATE_PREPARES => false mengikat penanda MENURUT POSISI;
     satu nama yang dipakai dua kali gagal dengan SQLSTATE[HY093] yang
     tidak menyebut kolom apa pun. Sudah kejadian 5 Agustus 2026 di
     simpan_pekerja modul DW. */
  $id = 'v' . dechex($now) . substr(bin2hex(random_bytes(4)), 0, 8);
  $st = $pdo->prepare(
    'INSERT INTO `void_log` (`id`,`tgl`,`bill`,`item`,`penginput`,`salah`,`alasan`,`nominal`,
                             `subtotal`,`service`,`tax`,
                             `oleh`,`oleh_id`,`dibuat`,`diubah`,`diubah_oleh`)
     VALUES (:id,:t,:b,:i,:p,:sl,:a,:n,:sb,:sv,:tx,:o1,:oi,:c1,:c2,:o2)');
  $st->execute(array(':id' => $id, ':t' => $nil['tgl'], ':b' => mb_substr($nil['bill'], 0, 60),
                     ':i' => mb_substr($nil['item'], 0, 200), ':p' => mb_substr($nil['penginput'], 0, 120),
                     ':sl' => mb_substr($nil['salah'], 0, 120),
                     ':a' => $nil['alasan'], ':n' => $rn['nominal'],
                     ':sb' => $rn['subtotal'], ':sv' => $rn['service'], ':tx' => $rn['tax'],
                     ':o1' => mb_substr((string)$oleh, 0, 120), ':oi' => mb_substr((string)$olehId, 0, 60),
                     ':c1' => $now, ':c2' => $now, ':o2' => mb_substr((string)$oleh, 0, 120)));
  return array('ok' => true, 'saved' => true, 'id' => $id, 'baru' => true);
}

/* SATU BILL, BANYAK ITEM (17 September 2026, pertanyaan user: "jika misalnya
   dalam 1 bill itu banyak menu yang di-void gimana?").

   Itu justru bentuk yang paling sering: di Cancel Menu Detail Report Agustus
   2026, 84 baris void datang dari cuma 17 bill — dan SATU bill sendirian
   membawa 16 baris. Menuntut kasir mengetik ulang nomor bill, nama pemesan,
   dan kronologi enam belas kali berarti aturan "wajib dicatat" itu tidak akan
   pernah dijalankan pada malam yang justru paling perlu dicatat.

   YANG DISIMPAN TETAP SATU BARIS PER ITEM, bukan satu baris berisi daftar
   menu. Tiga alasan, dan ketiganya menentukan:

     1. Bentuknya jadi SAMA PERSIS dengan ekspor POS, yang juga satu baris per
        item. Kartu Pembanding POS di Kas Kecil karena itu membandingkan dua
        angka yang benar-benar setara — sebelum ini ia harus mengaku bahwa
        keduanya "mengukur hal yang berbeda".
     2. Nominal memang melekat di item, bukan di bill. Disimpan sebagai satu
        baris berisi "3 menu, Rp250.000", tidak ada satu pun cara memecahnya
        lagi waktu ada yang bertanya menu mana yang paling sering di-void.
     3. Pembatalan tetap bisa per item. Satu dari enam belas yang salah ketik
        tidak boleh menuntut lima belas lainnya ikut dibatalkan.

   Yang DIPAKAI BERSAMA seluruh item: tanggal, nomor bill, siapa yang memesan,
   dan alasan/kronologinya. Kalau satu item punya alasan yang berbeda, ia
   dicatat sebagai kiriman tersendiri — dan itu dikatakan di layarnya.

   TIDAK ADA KOLOM BARU. Barisnya dikelompokkan lewat NOMOR BILL saat
   digambar, sama seperti halaman Void & Cancel di modul Analytics
   mengelompokkan 84 barisnya jadi 17 bill. Kolom `grup` tersendiri berarti
   ALTER TABLE pada tabel yang sudah berisi — dan `CREATE TABLE IF NOT EXISTS`
   tidak pernah menyentuhnya, jadi ia cuma jalan di pemasangan baru sementara
   server yang sudah hidup tertinggal tanpa satu pun galat. */
/* Kiriman dari layar SEBELUM 17 September 2026 membawa `pemesan` dan tidak
   pernah bisa membawa `penginput` maupun `salah`. Ditolak sebagai "belum
   lengkap", pesannya menyebut dua kotak yang memang tidak ada di form yang
   sedang dibuka orangnya — dan yang membacanya akan mencarinya sampai
   menyerah. Jendela ini nyata: PHP dan HTML mendarat lewat FTP pada waktu
   yang berbeda.

   `pemesan` SENGAJA TIDAK dipetakan ke `penginput`. Keduanya menjawab
   pertanyaan yang berbeda — siapa yang MEMESAN vs siapa yang MENGINPUT —
   dan menyalinnya berarti menulis nama tamu ke kolom yang dibaca orang
   sebagai nama kru, permanen dan tanpa satu pun tanda. */
function void_layar_lama($d) {
  if (!is_array($d)) return null;
  if (!array_key_exists('pemesan', $d)) return null;
  if (array_key_exists('penginput', $d) || array_key_exists('salah', $d)) return null;
  return array('ok' => false, 'error' =>
    'Halaman Cashier yang terbuka versi lama — ia masih mengirim kolom "Siapa yang Memesan", '
    . 'yang sejak 17 September 2026 diganti "Siapa yang Menginput" dan "Kesalahan dari Siapa". '
    . 'Muat ulang halamannya (Ctrl+Shift+R), lalu isi lagi.');
}

function void_simpan_banyak($d, $oleh, $olehId) {
  void_pastikan();
  if (!is_array($d)) return array('ok' => false, 'error' => 'data bukan objek');

  /* Field bersama diperiksa SEKALI. `item` sengaja dikeluarkan dari daftar
     wajib di sini — ia diperiksa per baris di bawah, dan menuntutnya di sini
     membuat pesan galatnya menunjuk kotak yang memang tidak ada di form. */
  $nil = array(
    'tgl'     => void_tgl_sah(isset($d['tgl']) ? $d['tgl'] : ''),
    'bill'    => trim((string)(isset($d['bill'])    ? $d['bill']    : '')),
    'penginput' => trim((string)(isset($d['penginput']) ? $d['penginput'] : '')),
    'salah'   => trim((string)(isset($d['salah'])   ? $d['salah']   : '')),
    'alasan'  => trim((string)(isset($d['alasan'])  ? $d['alasan']  : '')));

  if (($e = void_layar_lama($d)) !== null) return $e;
  $kurang = array();
  foreach (void_wajib() as $k => $label) {
    if ($k === 'item') continue;
    if (!isset($nil[$k]) || $nil[$k] === '') $kurang[] = $label;
  }

  /* Item yang namanya kosong DIBUANG, bukan ditolak: baris kosong di ujung
     daftar adalah bentuk paling wajar dari form yang barisnya bisa ditambah,
     dan menolak seluruh kiriman karenanya membuang lima belas baris yang
     sudah benar. Yang ditolak cuma kalau TIDAK SATU PUN item punya nama. */
  $masuk = array();
  $items = (isset($d['items']) && is_array($d['items'])) ? $d['items'] : array();
  foreach ($items as $it) {
    if (!is_array($it)) continue;
    $nama = trim((string)(isset($it['item']) ? $it['item'] : ''));
    if ($nama === '') continue;
    /* Kiriman TANPA service & tax tingkat bill datang dari layar versi
       lama, yang menaruh keduanya di tiap item — dan urutan pendaratan
       FTP di repo ini memang tidak bisa dijamin. Bentuk itu tetap
       diterima apa adanya lewat void_rinci(). */
    $rn = void_rinci($it);
    if ($rn === null)
      return array('ok' => false, 'error' => 'Nominal "' . $nama . '" tidak boleh minus.');
    $rn['item'] = $nama;
    $masuk[] = $rn;
  }
  if (!count($masuk)) $kurang[] = 'Nama Item';

  /* Service & tax tingkat BILL menang atas apa pun yang menempel di item.
     Diperiksa dengan array_key_exists, bukan nilainya: service Rp0 yang
     memang diketik orang (sebill compliment) tidak boleh terbaca sebagai
     "layar tidak mengirimkannya". */
  $adaBill = array_key_exists('service', $d) || array_key_exists('tax', $d);
  if ($adaBill && count($masuk)) {
    $svcT = isset($d['service']) ? (float)$d['service'] : 0;
    $taxT = isset($d['tax'])     ? (float)$d['tax']     : 0;
    foreach (array($svcT, $taxT) as $v)
      if (!is_finite($v) || $v < 0)
        return array('ok' => false, 'error' => 'Service & tax tidak boleh minus.');
    $subs = array(); foreach ($masuk as $m) $subs[] = $m['subtotal'];
    $bagiSvc = void_bagi($subs, $svcT);
    $bagiTax = void_bagi($subs, $taxT);
    foreach ($masuk as $i => $m) {
      $masuk[$i]['service'] = $bagiSvc[$i];
      $masuk[$i]['tax']     = $bagiTax[$i];
      $masuk[$i]['nominal'] = $m['subtotal'] + $bagiSvc[$i] + $bagiTax[$i];
    }
  }

  if (count($kurang)) {
    return array('ok' => false, 'kurang' => $kurang,
                 'error' => 'Belum lengkap: ' . implode(', ', $kurang));
  }

  /* SATU TRANSAKSI. Berhenti di tengah meninggalkan bill yang tercatat
     SEPARUH — sembilan item masuk, tujuh tidak — dan tidak ada satu pun layar
     yang bisa menyebutkan sampai mana. Angkanya tetap terlihat wajar, dan
     itulah bentuk kesalahan yang tidak akan pernah dipertanyakan. Aturan yang
     sama dengan ganti_orang() di modul DW. */
  $pdo = db();
  $now = (int)(microtime(true) * 1000);
  $ids = array();
  $pdo->beginTransaction();
  try {
    $st = $pdo->prepare(
      'INSERT INTO `void_log` (`id`,`tgl`,`bill`,`item`,`penginput`,`salah`,`alasan`,`nominal`,
                               `subtotal`,`service`,`tax`,
                               `oleh`,`oleh_id`,`dibuat`,`diubah`,`diubah_oleh`)
       VALUES (:id,:t,:b,:i,:p,:sl,:a,:n,:sb,:sv,:tx,:o1,:oi,:c1,:c2,:o2)');
    foreach ($masuk as $i => $m) {
      /* Id dibuat SERVER, sama dengan jalur satu baris — id kiriman bisa
         menabrak baris orang lain. `$i` ikut supaya dua item yang tersimpan
         pada milidetik yang sama tidak pernah bisa berebut id yang sama. */
      $id = 'v' . dechex($now) . dechex($i) . substr(bin2hex(random_bytes(4)), 0, 8);
      $st->execute(array(':id' => $id, ':t' => $nil['tgl'], ':b' => mb_substr($nil['bill'], 0, 60),
                         ':i' => mb_substr($m['item'], 0, 200), ':p' => mb_substr($nil['penginput'], 0, 120),
                         ':sl' => mb_substr($nil['salah'], 0, 120),
                         ':a' => $nil['alasan'], ':n' => $m['nominal'],
                         ':sb' => $m['subtotal'], ':sv' => $m['service'], ':tx' => $m['tax'],
                         ':o1' => mb_substr((string)$oleh, 0, 120), ':oi' => mb_substr((string)$olehId, 0, 60),
                         ':c1' => $now, ':c2' => $now, ':o2' => mb_substr((string)$oleh, 0, 120)));
      $ids[] = $id;
    }
    $pdo->commit();
  } catch (Throwable $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    throw $e;
  }
  return array('ok' => true, 'saved' => true, 'n' => count($ids), 'ids' => $ids);
}

/* PEMBATALAN, bukan penghapusan — barisnya tetap ada dan tetap tergambar.
   Alasannya WAJIB: pembatalan tanpa sebab sama tidak bisa diauditnya dengan
   penghapusan, cuma meninggalkan baris membingungkan yang tidak dijelaskan
   apa pun. */
function void_batal($id, $alasan, $oleh) {
  void_pastikan();
  $id = trim((string)$id);
  $alasan = trim((string)$alasan);
  if ($id === '') return array('ok' => false, 'error' => 'id kosong');
  if ($alasan === '') return array('ok' => false, 'error' => 'Alasan pembatalan wajib diisi.');
  $pdo = db();
  $st = $pdo->prepare('SELECT `batal_at` FROM `void_log` WHERE `id`=?');
  $st->execute(array($id));
  $row = $st->fetch();
  if (!$row) return array('ok' => false, 'error' => 'Catatan tidak ditemukan.');
  if ((float)$row['batal_at'] > 0) return array('ok' => false, 'error' => 'Catatan ini sudah dibatalkan.');
  $pdo->prepare('UPDATE `void_log` SET `batal_at`=:a,`batal_oleh`=:o,`batal_alasan`=:s WHERE `id`=:id')
      ->execute(array(':a' => (int)(microtime(true) * 1000), ':o' => mb_substr((string)$oleh, 0, 120),
                      ':s' => mb_substr($alasan, 0, 255), ':id' => $id));
  return array('ok' => true, 'saved' => true);
}

/* ============================================================
   PENCOCOKAN DANA QRIS BRI  (19 September 2026, permintaan user)
   ------------------------------------------------------------
   Mutasi masuk rekening BRI dicocokkan satu per satu ke DP reservasi yang
   tercatat di modul Reservasi. Sampai hari ini pekerjaan itu dikerjakan di
   sebuah berkas Excel ("Qris BRI 2026.xlsx", satu sheet per bulan) yang
   diisi tangan; tabel ini menggantikan berkas itu.

   YANG DICOCOKKAN HAMPIR SELURUHNYA DP RESERVASI, dan itu DIUKUR bukan
   dikira: dari berkas Excel-nya, September 2026 memuat 155 baris
   "Reservasi" dari 160 baris berketerangan, Agustus 245 dari 253. Sisanya
   segelintir event corporate, sewa videotron, dan setoran tamu. TIDAK ADA
   satu pun baris tiket. Itu sebabnya lawan cocoknya dps[] milik modul
   Reservasi dan bukan yang lain.

   TABEL SENDIRI, bukan menumpang blob app_state. Blob itu ditulis UTUH oleh
   modul Cashier DAN panel Finance > Omset, dan sejak 7 September 2026
   berpagar penjaga tulis-basi baseTs. Pencocokan diketik finance di tengah
   hari dari tab yang sudah membuka Report Daily sejak pagi — ditaruh di
   blob, tiap pencocokan berpeluang DITOLAK sebagai konflik, atau (kalau
   penjaganya lewat) MENIMPA koreksi omset yang baru dibuat di modul
   sebelah. Penulisannya karena itu granular per baris, pola yang sama
   dengan void_log, simpanSel di jadwal, dan simpanAjuan di dw. Jangan
   dirapikan kembali jadi bagian save().

   TABELNYA LAHIR SENDIRI lewat bri_pastikan(), bukan berkas migrasi —
   migrasi di repo ini rutin tertinggal di produksi.

   TIDAK ADA DELETE. Baris salah unggah DIBATALKAN (batal_at), tetap
   tergambar, tercoret, dan tidak ikut dijumlahkan. Catatan rekonsiliasi
   yang barisnya bisa dihapus orang yang mengunggahnya bukan catatan, cuma
   draf — aturan yang sama dengan void_batal().
   ============================================================ */
define('BRI_LIST_MAKS', 2000);
define('BRI_UNGGAH_MAKS', 3000);

function bri_pastikan() {
  $pdo = db();
  $pdo->exec(
    "CREATE TABLE IF NOT EXISTS `bri_mutasi` (
       `id`           VARCHAR(40)  NOT NULL PRIMARY KEY,
       `sidik`        VARCHAR(90)  NOT NULL,
       `tgl`          DATE         NOT NULL,
       `jam`          VARCHAR(8)   NOT NULL DEFAULT '',
       `nominal`      BIGINT       NOT NULL DEFAULT 0,
       `ket`          VARCHAR(255) NOT NULL DEFAULT '',
       `settle`       DATE         NULL,
       `booking`      DATE         NULL,
       `res_id`       VARCHAR(60)  NOT NULL DEFAULT '',
       `dp_id`        VARCHAR(60)  NOT NULL DEFAULT '',
       `res_nama`     VARCHAR(160) NOT NULL DEFAULT '',
       `res_tgl`      DATE         NULL,
       `cara`         VARCHAR(12)  NOT NULL DEFAULT '',
       `catatan`      VARCHAR(255) NOT NULL DEFAULT '',
       `cocok_oleh`   VARCHAR(120) NOT NULL DEFAULT '',
       `cocok_at`     BIGINT       NOT NULL DEFAULT 0,
       `oleh`         VARCHAR(120) NOT NULL DEFAULT '',
       `oleh_id`      VARCHAR(60)  NOT NULL DEFAULT '',
       `dibuat`       BIGINT       NOT NULL DEFAULT 0,
       `diubah`       BIGINT       NOT NULL DEFAULT 0,
       `diubah_oleh`  VARCHAR(120) NOT NULL DEFAULT '',
       `batal_at`     BIGINT       NOT NULL DEFAULT 0,
       `batal_oleh`   VARCHAR(120) NOT NULL DEFAULT '',
       `batal_alasan` VARCHAR(255) NOT NULL DEFAULT '',
       UNIQUE KEY `uniq_bri_sidik` (`sidik`),
       KEY `idx_bri_tgl` (`tgl`),
       KEY `idx_bri_dp` (`dp_id`)
     ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
  bri_pastikan_kolom($pdo);
}

/* KOLOM BARU TIDAK BISA LEWAT `CREATE TABLE IF NOT EXISTS` — ia tidak pernah
   menyentuh tabel yang sudah ada, jadi kolomnya cuma lahir di pemasangan
   baru sementara server yang sudah hidup tertinggal tanpa satu pun galat.
   Polanya disalin dari void_pastikan_kolom(); berkas migrasi sengaja TIDAK
   dipakai karena di repo ini migrasi rutin tertinggal di produksi.

   Bawaannya 'unggah' — itulah satu-satunya bentuk yang mungkin sebelum
   19 September 2026 sore, saat baris manual lahir. Dianggap 'manual',
   seluruh baris hasil unggah berhenti bisa dicocokkan dan berpindah ke
   kelompok "di luar reservasi" tanpa satu pun galat. */
function bri_pastikan_kolom($pdo) {
  $cek = $pdo->prepare('SELECT COUNT(*) FROM information_schema.COLUMNS
                         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :t
                           AND COLUMN_NAME = :c');
  $kolom = array('sumber' => "VARCHAR(12) NOT NULL DEFAULT 'unggah'");
  foreach ($kolom as $kol => $tipe) {
    $cek->execute(array(':t' => 'bri_mutasi', ':c' => $kol));
    if ((int)$cek->fetchColumn() > 0) continue;
    $pdo->exec('ALTER TABLE `bri_mutasi` ADD COLUMN `' . $kol . '` ' . $tipe);
  }
}

/* Tanggal WAJIB lewat checkdate(), bukan cuma cocok polanya: '2026-02-31'
   lolos regex tapi MySQL menyimpannya jadi '0000-00-00' tanpa satu pun
   galat, dan barisnya lalu hilang dari setiap penyaring bulan. */
function bri_tgl_sah($s) {
  $s = trim((string)$s);
  if ($s === '') return '';
  if (!preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', $s, $m)) return '';
  if (!checkdate((int)$m[2], (int)$m[3], (int)$m[1])) return '';
  return $s;
}
/* Tanggal yang BOLEH kosong dipulangkan sebagai null, bukan ''. Kolomnya
   DATE NULL: string kosong masuk sebagai '0000-00-00' di server yang
   MODE-nya longgar, dan tanggal itu tidak pernah cocok dengan penyaring
   mana pun sementara di layar ia terbaca sebagai tanggal sungguhan. */
function bri_tgl_null($s) { $t = bri_tgl_sah($s); return $t === '' ? null : $t; }

/* Jam dibakukan ke HH:MM. Berkas Excel-nya menuliskannya bermacam-macam —
   "15.46", "15:46", dan serial Excel (0.6013888) untuk sel yang terlanjur
   berformat waktu. Disimpan apa adanya, dua baris transfer yang jamnya sama
   berdiri sebagai dua sidik berbeda dan unggah ulang melahirkan baris
   ganda. */
function bri_jam($s) {
  $s = trim((string)$s);
  if ($s === '') return '';
  if (preg_match('/^(\d{1,2})[.:](\d{2})/', $s, $m)) {
    $h = (int)$m[1]; $i = (int)$m[2];
    if ($h >= 0 && $h < 24 && $i >= 0 && $i < 60) return sprintf('%02d:%02d', $h, $i);
  }
  /* Serial Excel pecahan hari. Dijepit < 1: angka >= 1 adalah serial
     TANGGAL, dan membacanya sebagai jam memberi jam karangan. */
  if (is_numeric($s)) {
    $f = (float)$s;
    if ($f > 0 && $f < 1) {
      $det = (int)round($f * 86400);
      return sprintf('%02d:%02d', intdiv($det, 3600) % 24, intdiv($det % 3600, 60));
    }
  }
  return '';
}

/* SIDIK = kunci anti-unggah-ganda, dan ia DIBUAT SERVER — bukan dikirim
   layar. Sidik karangan dari klien bisa menabrak baris orang lain, dan yang
   tertabrak adalah pencocokan yang sudah diputuskan.

   Bentuknya tgl|jam|nominal|#k, dengan k = kemunculan ke-berapa di antara
   baris yang KETIGANYA sama persis. Dua transfer identik pada jam yang sama
   memang mungkin (dua tamu, nominal bulat yang sama), dan tanpa k yang
   kedua akan menimpa yang pertama — satu baris mutasi hilang tanpa satu pun
   galat, dan uangnya ikut hilang dari rekonsiliasi. */
function bri_sidik($tgl, $jam, $nominal, $k) {
  return $tgl . '|' . $jam . '|' . (int)$nominal . '|#' . (int)$k;
}

/* ---- UNGGAH / TEMPEL ----
   UPSERT, dan yang diperbarui HANYA kolom yang datang dari berkas. Kolom
   pencocokan (res_id, dp_id, cara, catatan, cocok_*) TIDAK PERNAH ditimpa
   unggah: berkas Excel itu diunggah ulang berkali-kali sepanjang bulan
   sementara pencocokannya diputuskan di layar ini, dan unggah yang menimpa
   akan membuang keputusan yang baru diambil orang — tanpa satu pun galat,
   karena dari sisi server itu penyimpanan yang sah.

   Baris yang ADA di tabel tapi TIDAK ada di berkas dibiarkan apa adanya.
   Membuangnya berarti satu unggah berkas yang salah pilih sheet menghapus
   sebulan pencocokan, dan tidak ada satu pun cara mengembalikannya. */
function bri_unggah($d, $oleh, $olehId) {
  bri_pastikan();
  if (!is_array($d)) return array('ok' => false, 'error' => 'data bukan objek');
  $baris = (isset($d['baris']) && is_array($d['baris'])) ? $d['baris'] : array();
  if (!count($baris)) return array('ok' => false, 'error' => 'Tidak ada satu baris pun yang bisa dibaca dari berkasnya.');
  if (count($baris) > BRI_UNGGAH_MAKS)
    return array('ok' => false, 'error' => 'Terlalu banyak baris (' . count($baris) . '). Batasnya ' . BRI_UNGGAH_MAKS . ' per unggah, pilih satu bulan saja.');

  $now = (int)(microtime(true) * 1000);
  $siap = array(); $hitungK = array(); $lewat = 0;
  foreach ($baris as $b) {
    if (!is_array($b)) { $lewat++; continue; }
    $tgl = bri_tgl_sah(isset($b['tgl']) ? $b['tgl'] : '');
    $nom = isset($b['nominal']) ? (float)$b['nominal'] : 0;
    /* Baris tanpa tanggal atau tanpa nominal DILEWATI, bukan menggagalkan
       seluruh unggah: berkas Excel-nya penuh baris kosong, baris total, dan
       baris judul, dan menolak seluruhnya karena itu berarti berkas yang
       isinya benar tidak pernah bisa masuk. Jumlahnya dilaporkan di layar. */
    if ($tgl === '' || !is_finite($nom) || $nom <= 0) { $lewat++; continue; }
    $jam = bri_jam(isset($b['jam']) ? $b['jam'] : '');
    $kunci = $tgl . '|' . $jam . '|' . (int)$nom;
    $k = isset($hitungK[$kunci]) ? $hitungK[$kunci] + 1 : 0;
    $hitungK[$kunci] = $k;
    $siap[] = array(
      'sidik'   => bri_sidik($tgl, $jam, $nom, $k),
      'tgl'     => $tgl, 'jam' => $jam, 'nominal' => (int)round($nom),
      'ket'     => mb_substr(trim((string)(isset($b['ket']) ? $b['ket'] : '')), 0, 255),
      'settle'  => bri_tgl_null(isset($b['settle'])  ? $b['settle']  : ''),
      'booking' => bri_tgl_null(isset($b['booking']) ? $b['booking'] : ''));
  }
  if (!count($siap))
    return array('ok' => false, 'error' => 'Tidak ada satu baris pun yang punya tanggal DAN nominal. Periksa lagi kolom yang dipilih.');

  $pdo = db();
  /* Dihitung SEBELUM menulis. Sesudahnya seluruh sidik pasti ada, dan
     angka "N baris baru" jadi nol selamanya — yang mengunggah tidak punya
     satu pun cara tahu unggahannya benar-benar menambah sesuatu. */
  $adaSidik = array();
  $q = $pdo->prepare('SELECT `sidik` FROM `bri_mutasi` WHERE `sidik`=?');
  foreach ($siap as $s) { $q->execute(array($s['sidik'])); if ($q->fetchColumn() !== false) $adaSidik[$s['sidik']] = true; }

  /* SATU TRANSAKSI. Berhenti di tengah meninggalkan sebulan mutasi yang
     terunggah separuh, dan tidak ada satu pun layar yang bisa menyebutkan
     sampai mana — angkanya tetap terlihat wajar. Aturan yang sama dengan
     void_simpan_banyak() dan ganti_orang() di modul DW. */
  $pdo->beginTransaction();
  try {
    $st = $pdo->prepare(
      "INSERT INTO `bri_mutasi` (`id`,`sidik`,`tgl`,`jam`,`nominal`,`ket`,`settle`,`booking`,
                                 `oleh`,`oleh_id`,`dibuat`,`diubah`,`diubah_oleh`)
       VALUES (:id,:sd,:t,:j,:n,:k,:se,:bo,:o1,:oi,:c1,:c2,:o2)
       ON DUPLICATE KEY UPDATE
         `ket`     = IF(VALUES(`ket`)='', `ket`, VALUES(`ket`)),
         `settle`  = COALESCE(VALUES(`settle`),  `settle`),
         `booking` = COALESCE(VALUES(`booking`), `booking`),
         `diubah`  = VALUES(`diubah`), `diubah_oleh` = VALUES(`diubah_oleh`)");
    foreach ($siap as $i => $s) {
      /* Id dibuat SERVER. Id kiriman bisa menabrak baris orang lain, dan
         $i ikut supaya dua baris yang tersimpan pada milidetik yang sama
         tidak pernah berebut id yang sama. */
      $id = 'b' . dechex($now) . dechex($i) . substr(bin2hex(random_bytes(4)), 0, 8);
      $st->execute(array(':id' => $id, ':sd' => $s['sidik'], ':t' => $s['tgl'], ':j' => $s['jam'],
                         ':n' => $s['nominal'], ':k' => $s['ket'], ':se' => $s['settle'], ':bo' => $s['booking'],
                         ':o1' => mb_substr((string)$oleh, 0, 120), ':oi' => mb_substr((string)$olehId, 0, 60),
                         ':c1' => $now, ':c2' => $now, ':o2' => mb_substr((string)$oleh, 0, 120)));
    }
    $pdo->commit();
  } catch (Throwable $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    throw $e;
  }
  $baru = 0; foreach ($siap as $s) if (empty($adaSidik[$s['sidik']])) $baru++;
  return array('ok' => true, 'saved' => true, 'n' => count($siap),
               'baru' => $baru, 'lama' => count($siap) - $baru, 'lewat' => $lewat);
}

/* ---- DANA MASUK YANG DITAMBAHKAN TANGAN (19 September 2026, permintaan
   user: "ada option juga agar bisa menambahkan dana masuk jika ada hal yg
   diluar dari reservasi") ----

   Daftar dana masuk di layar ini hampir seluruhnya lahir SENDIRI dari bukti
   bayar DP di modul Reservasi — tidak ada yang perlu mengetiknya. Yang
   tidak bisa lahir sendiri justru yang di luar reservasi: event corporate,
   sewa videotron, setoran tamu. Di berkas Excel yang digantikan halaman ini
   memang ada barisnya (September 2026: 5 dari 160 baris berketerangan,
   Agustus 8 dari 253), jadi tanpa jalur ini angka totalnya berhenti sama
   dengan mutasi banknya.

   LANGSUNG BERTANDA `cara='bukan'`, dan itu bukan jalan pintas: yang
   menambahkannya melakukannya JUSTRU karena uang itu bukan DP reservasi,
   dan menuntutnya menekan tombol kedua untuk menyatakan hal yang sudah ia
   nyatakan lewat formulirnya sendiri cuma menyisakan baris menggantung di
   daftar "belum dicocokkan". Tetap bisa dilepas lewat bri_cocok() kalau
   ternyata keliru.

   KETERANGAN WAJIB. Baris dana masuk tanpa sebab tidak bisa diperiksa siapa
   pun, dan ia jadi tempat paling mudah menyembunyikan uang yang sebenarnya
   belum dicocokkan. Aturan yang sama dengan cara='bukan' di bri_cocok(). */
function bri_tambah($d, $oleh, $olehId) {
  bri_pastikan();
  if (!is_array($d)) return array('ok' => false, 'error' => 'data bukan objek');

  $tgl = bri_tgl_sah(isset($d['tgl']) ? $d['tgl'] : '');
  $ket = trim((string)(isset($d['ket']) ? $d['ket'] : ''));
  $nom = isset($d['nominal']) ? (float)$d['nominal'] : 0;

  /* `kurang` dipulangkan sebagai daftar LABEL supaya layar bisa menandai
     KOTAK yang belum diisi, bukan cuma menempelkan satu kalimat galat. Pita
     yang menyebut aturan tanpa menunjuk kotaknya menyuruh orang mencari
     sendiri di formulir. Pola yang sama dengan void_wajib(). */
  $kurang = array();
  if ($tgl === '')                        $kurang[] = 'Tanggal';
  if (!is_finite($nom) || $nom <= 0)      $kurang[] = 'Nominal';
  if ($ket === '')                        $kurang[] = 'Keterangan';
  if (count($kurang))
    return array('ok' => false, 'kurang' => $kurang,
                 'error' => 'Belum lengkap: ' . implode(', ', $kurang));

  $jam = bri_jam(isset($d['jam']) ? $d['jam'] : '');
  $now = (int)(microtime(true) * 1000);

  /* SIDIKNYA DIBEDAKAN dari baris unggah lewat awalan 'm|'. Tanpa itu,
     dana masuk manual yang kebetulan setanggal, sejam, dan senominal dengan
     satu baris di berkas Excel akan MENIMPA baris itu lewat kunci unik —
     dan mutasi banknya hilang tanpa satu pun galat. Dua-duanya sah berdiri
     sendiri: yang satu apa yang tercatat di bank, yang satu apa yang
     diketik orang. */
  $k = 0;
  $q = db()->prepare('SELECT `id` FROM `bri_mutasi` WHERE `sidik`=?');
  do {
    $sidik = 'm|' . bri_sidik($tgl, $jam, $nom, $k);
    $q->execute(array($sidik));
    $bentrok = ($q->fetchColumn() !== false);
    $k++;
  } while ($bentrok && $k < 200);
  if ($bentrok) return array('ok' => false, 'error' => 'Terlalu banyak baris manual yang sama persis pada jam itu.');

  $id = 'b' . dechex($now) . 'm' . substr(bin2hex(random_bytes(4)), 0, 8);
  db()->prepare(
    "INSERT INTO `bri_mutasi` (`id`,`sidik`,`tgl`,`jam`,`nominal`,`ket`,`sumber`,
                               `cara`,`catatan`,`cocok_oleh`,`cocok_at`,
                               `oleh`,`oleh_id`,`dibuat`,`diubah`,`diubah_oleh`)
     VALUES (:id,:sd,:t,:j,:n,:k,'manual','bukan',:ct,:o1,:a,:o2,:oi,:c1,:c2,:o3)")
    ->execute(array(':id' => $id, ':sd' => $sidik, ':t' => $tgl, ':j' => $jam,
                    ':n' => (int)round($nom), ':k' => mb_substr($ket, 0, 255),
                    ':ct' => mb_substr($ket, 0, 255),
                    ':o1' => mb_substr((string)$oleh, 0, 120), ':a' => $now,
                    ':o2' => mb_substr((string)$oleh, 0, 120), ':oi' => mb_substr((string)$olehId, 0, 60),
                    ':c1' => $now, ':c2' => $now, ':o3' => mb_substr((string)$oleh, 0, 120)));
  return array('ok' => true, 'saved' => true, 'id' => $id);
}

/* ---- PENCOCOKAN ----
   Tiga bentuk keputusan, dan ketiganya menuntut bacaan yang berbeda di
   layar — jadi ketiganya disimpan berbeda, bukan diringkas jadi satu
   penanda boolean "sudah dicocokkan":

     cocok   res_id & dp_id terisi     uangnya milik DP itu
     bukan   res_id & dp_id KOSONG     uang masuk yang memang bukan DP
                                       reservasi (event corporate, sewa
                                       videotron, setoran tamu) - catatan
                                       WAJIB, karena tanpa sebabnya baris
                                       itu tidak bisa diperiksa siapa pun
     lepas   cara dikosongkan          pencocokan yang dibatalkan, barisnya
                                       kembali ke daftar "belum cocok"

   `lepas` BUKAN penghapusan baris: yang dilepas keputusannya, mutasinya
   tetap ada. Menghapus barisnya berarti uang yang benar-benar masuk hilang
   dari rekonsiliasi. */
function bri_cara_sah($c) {
  $c = trim((string)$c);
  return ($c === 'cocok' || $c === 'bukan' || $c === 'lepas') ? $c : '';
}

/* SATU DP TIDAK BOLEH DIPEGANG DUA BARIS MUTASI, dan itu ditegakkan DI
   SINI — bukan di layar. Kalau boleh, satu DP Rp300.000 bisa diakui dua
   kali dan total "dana terverifikasi" jadi lebih besar daripada uang yang
   benar-benar masuk; angkanya tetap terlihat wajar di tiap barisnya, dan
   yang menjumlahkannya tidak punya satu pun cara tahu.

   Baris yang sudah DIBATALKAN tidak ikut menahan: DP-nya memang tidak
   dipegang siapa-siapa lagi. */
function bri_dp_dipakai($pdo, $dpId, $kecualiId) {
  $st = $pdo->prepare('SELECT `id`,`tgl`,`nominal` FROM `bri_mutasi`
                        WHERE `dp_id`=:d AND `cara`=\'cocok\' AND `batal_at`=0 AND `id`<>:x LIMIT 1');
  $st->execute(array(':d' => $dpId, ':x' => $kecualiId));
  return $st->fetch();
}

function bri_cocok_satu($pdo, $b, $oleh, $now) {
  $id   = trim((string)(isset($b['id']) ? $b['id'] : ''));
  $cara = bri_cara_sah(isset($b['cara']) ? $b['cara'] : '');
  if ($id === '')   return 'Baris tanpa id.';
  if ($cara === '') return 'Keputusan tidak dikenal (harus cocok / bukan / lepas).';

  $cek = $pdo->prepare('SELECT `batal_at` FROM `bri_mutasi` WHERE `id`=?');
  $cek->execute(array($id));
  $row = $cek->fetch();
  if (!$row) return 'Baris mutasi tidak ditemukan.';
  /* Baris yang sudah dibatalkan tidak bisa dicocokkan lagi. Kalau bisa,
     pembatalan berubah jadi tombol hapus-lalu-pakai-ulang: id yang sama
     menyimpan mutasi yang berbeda, dan jejak pembatalannya ikut menunjuk
     ke isi yang bukan lagi yang dibatalkan. Aturan yang sama dengan
     void_batal(). */
  if ((float)$row['batal_at'] > 0) return 'Baris ini sudah dibatalkan, tidak bisa dicocokkan lagi.';

  $resId = ''; $dpId = ''; $nama = ''; $resTgl = null; $catatan = '';
  if ($cara === 'cocok') {
    $resId = trim((string)(isset($b['resId']) ? $b['resId'] : ''));
    $dpId  = trim((string)(isset($b['dpId'])  ? $b['dpId']  : ''));
    if ($resId === '' || $dpId === '') return 'Reservasi & cicilan DP-nya wajib disebut.';
    $bentrok = bri_dp_dipakai($pdo, $dpId, $id);
    if ($bentrok)
      return 'DP itu sudah dicocokkan ke mutasi ' . (string)$bentrok['tgl']
           . ' sebesar Rp' . number_format((float)$bentrok['nominal'], 0, ',', '.')
           . '. Lepas dulu pencocokan di sana.';
    /* Nama & tanggal reservasi DISALIN saat dicocokkan, bukan dibaca ulang
       tiap kali daftar dibuka. Modul Reservasi memotong riwayatnya sendiri,
       dan reservasi yang kelak dihapus akan meninggalkan baris mutasi yang
       cuma berisi id tanpa satu kata pun yang bisa dibaca orang. */
    $nama   = mb_substr(trim((string)(isset($b['resNama']) ? $b['resNama'] : '')), 0, 160);
    $resTgl = bri_tgl_null(isset($b['resTgl']) ? $b['resTgl'] : '');
  } else if ($cara === 'bukan') {
    $catatan = trim((string)(isset($b['catatan']) ? $b['catatan'] : ''));
    /* WAJIB. Baris "bukan DP reservasi" tanpa sebab tidak bisa diperiksa
       siapa pun, dan ia jadi tempat paling mudah menyembunyikan uang yang
       sebenarnya belum dicocokkan. */
    if ($catatan === '') return 'Sebutkan dulu uang ini masuk dari mana.';
    $catatan = mb_substr($catatan, 0, 255);
  }

  $simpanCara = ($cara === 'lepas') ? '' : $cara;
  $pdo->prepare('UPDATE `bri_mutasi`
                    SET `res_id`=:r,`dp_id`=:d,`res_nama`=:nm,`res_tgl`=:rt,`cara`=:c,
                        `catatan`=:ct,`cocok_oleh`=:o,`cocok_at`=:a,`diubah`=:a2,`diubah_oleh`=:o2
                  WHERE `id`=:id')
      ->execute(array(':r' => $resId, ':d' => $dpId, ':nm' => $nama, ':rt' => $resTgl,
                      ':c' => $simpanCara, ':ct' => $catatan,
                      ':o' => mb_substr((string)$oleh, 0, 120), ':a' => $now,
                      ':a2' => $now, ':o2' => mb_substr((string)$oleh, 0, 120), ':id' => $id));
  return '';
}

/* SATU jalur untuk satu baris DAN untuk banyak baris sekaligus (tombol
   "Terapkan usulan"), dibedakan dari BENTUK datanya — bukan dari aksi
   tersendiri. Aksi kedua berarti layar harus memilih sendiri mana yang
   dipanggil, dan yang salah memilih mengirim lima puluh usulan ke jalur
   satu baris: empat puluh sembilan di antaranya hilang tanpa satu pun
   galat. Pelajaran yang sama dengan void_simpan_banyak().

   TIDAK SATU TRANSAKSI, dan itu disengaja — beda dari bri_unggah(). Tiap
   baris adalah keputusan yang berdiri sendiri; satu usulan yang ditolak
   karena DP-nya keburu dipakai orang lain tidak boleh membatalkan empat
   puluh sembilan keputusan yang sudah benar. Yang gagal dilaporkan satu
   per satu berikut sebabnya. */
function bri_cocok($d, $oleh) {
  bri_pastikan();
  if (!is_array($d)) return array('ok' => false, 'error' => 'data bukan objek');
  $items = (isset($d['items']) && is_array($d['items'])) ? $d['items'] : array($d);
  if (!count($items)) return array('ok' => false, 'error' => 'Tidak ada satu baris pun yang dikirim.');

  $pdo = db();
  $now = (int)(microtime(true) * 1000);
  $ok = 0; $gagal = array();
  foreach ($items as $b) {
    if (!is_array($b)) { $gagal[] = array('id' => '', 'sebab' => 'baris bukan objek'); continue; }
    $e = bri_cocok_satu($pdo, $b, $oleh, $now);
    if ($e === '') $ok++;
    else $gagal[] = array('id' => (string)(isset($b['id']) ? $b['id'] : ''), 'sebab' => $e);
  }
  /* Yang SELURUHNYA gagal dipulangkan sebagai gagal, supaya layar tidak
     mengaku berhasil untuk kiriman yang tidak mengubah satu baris pun. */
  if (!$ok && count($gagal))
    return array('ok' => false, 'error' => $gagal[0]['sebab'], 'gagal' => $gagal);
  return array('ok' => true, 'saved' => true, 'n' => $ok, 'gagal' => $gagal);
}

/* PEMBATALAN BARIS MUTASI, bukan penghapusan — barisnya tetap tergambar,
   tercoret, dan tidak ikut dijumlahkan. Alasannya WAJIB: baris yang hilang
   dari hitungan tanpa sebab adalah selisih yang tidak bisa dijelaskan siapa
   pun waktu rekening korannya dicocokkan ulang. */
function bri_batal($id, $alasan, $oleh) {
  bri_pastikan();
  $id = trim((string)$id);
  $alasan = trim((string)$alasan);
  if ($id === '') return array('ok' => false, 'error' => 'id kosong');
  if ($alasan === '') return array('ok' => false, 'error' => 'Alasan pembatalan wajib diisi.');
  $pdo = db();
  $st = $pdo->prepare('SELECT `batal_at` FROM `bri_mutasi` WHERE `id`=?');
  $st->execute(array($id));
  $row = $st->fetch();
  if (!$row) return array('ok' => false, 'error' => 'Baris mutasi tidak ditemukan.');
  if ((float)$row['batal_at'] > 0) return array('ok' => false, 'error' => 'Baris ini sudah dibatalkan.');
  $pdo->prepare('UPDATE `bri_mutasi` SET `batal_at`=:a,`batal_oleh`=:o,`batal_alasan`=:s WHERE `id`=:id')
      ->execute(array(':a' => (int)(microtime(true) * 1000), ':o' => mb_substr((string)$oleh, 0, 120),
                      ':s' => mb_substr($alasan, 0, 255), ':id' => $id));
  return array('ok' => true, 'saved' => true);
}

/* ============ DP RESERVASI YANG DITANDAI TIDAK VALID (21 September 2026) ============
   Permintaan user: "bisa di hapus juga jika kalau reservasi pencocokan
   dananya itu tidak valid".

   YANG DITANDAI PENGAKUANNYA SEBAGAI DANA MASUK BRI, BUKAN DP-nya. DP itu
   catatan uang yang benar-benar ditransfer tamu, berikut bukti transfernya,
   dan yang memegangnya modul Reservasi — ia dipakai kwitansi, halaman Dana
   Masuk, dan dpTotal di sana. Layar rekonsiliasi yang menghapusnya membuang
   catatan pembayaran tamu, dan di repo ini penghapusan TIDAK BISA
   dikembalikan: tidak ada snapshot dan tidak ada undo.

   Jadi yang disimpan di sini NISAN: barisnya tetap tergambar di daftar,
   tercoret, berhenti ikut dijumlahkan, dan bisa dipulihkan satu klik.
   Aturan yang sama dengan batal_at di `bri_mutasi` dan void_batal().

   TABEL SENDIRI, bukan kolom baru di `bri_mutasi`: baris `rsv` memang tidak
   punya baris di sana — itu inti bentuknya (DP DIBACA dari modul Reservasi,
   tidak disalin). Lahir sendiri lewat bri_abai_pastikan(), bukan berkas
   migrasi — migrasi di repo ini rutin tertinggal di produksi.

   TGL & NOMINAL DISIMPAN SEBAGAI SALINAN, dan itu bukan duplikasi angka
   yang dipakai menghitung apa pun: ia cuma penyaring bulan (supaya daftar
   nisan tidak ikut terbawa seluruhnya tiap bulan dibuka) dan jejak apa yang
   dulu ditandai. Yang dipajang di layar tetap angka dari modul Reservasi. */
function bri_abai_pastikan() {
  $pdo = db();
  $pdo->exec(
    "CREATE TABLE IF NOT EXISTS `bri_dp_abai` (
       `dp_id`   VARCHAR(60)  NOT NULL PRIMARY KEY,
       `res_id`  VARCHAR(60)  NOT NULL DEFAULT '',
       `nama`    VARCHAR(160) NOT NULL DEFAULT '',
       `tgl`     DATE         NULL,
       `nominal` BIGINT       NOT NULL DEFAULT 0,
       `alasan`  VARCHAR(255) NOT NULL DEFAULT '',
       `oleh`    VARCHAR(120) NOT NULL DEFAULT '',
       `abai_at` BIGINT       NOT NULL DEFAULT 0,
       KEY `idx_abai_tgl` (`tgl`)
     ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
}

/* ALASAN WAJIB, dan ditegakkan DI SINI — bukan cuma di layar. Baris yang
   dicabut dari rekonsiliasi tanpa sebab tidak bisa diperiksa siapa pun, dan
   ia jadi tempat paling mudah menyembunyikan uang yang sebenarnya belum
   dicocokkan. Aturan yang sama dengan cara='bukan' dan bri_batal(). */
function bri_abai($d, $oleh) {
  bri_abai_pastikan();
  if (!is_array($d)) $d = array();
  $dpId = trim((string)(isset($d['dpId']) ? $d['dpId'] : ''));
  if ($dpId === '') return array('ok' => false, 'error' => 'dpId kosong');
  $pdo = db();

  /* PULIHKAN = membuang nisannya, bukan menandainya lagi dengan penanda
     kedua. Nisan yang cuma "dinonaktifkan" berarti dua keadaan mati untuk
     satu baris, dan yang membacanya harus menebak mana yang berlaku. */
  if (!empty($d['pulih'])) {
    $pdo->prepare('DELETE FROM `bri_dp_abai` WHERE `dp_id`=?')->execute(array($dpId));
    return array('ok' => true, 'saved' => true, 'pulih' => true);
  }

  $alasan = trim((string)(isset($d['alasan']) ? $d['alasan'] : ''));
  if ($alasan === '') return array('ok' => false, 'error' => 'Sebutkan dulu kenapa baris ini tidak valid.');
  $st = $pdo->prepare(
    "INSERT INTO `bri_dp_abai` (`dp_id`,`res_id`,`nama`,`tgl`,`nominal`,`alasan`,`oleh`,`abai_at`)
     VALUES (:dp,:res,:nama,:tgl,:nom,:alasan,:oleh,:at)
     ON DUPLICATE KEY UPDATE `alasan`=VALUES(`alasan`),`oleh`=VALUES(`oleh`),`abai_at`=VALUES(`abai_at`)");
  $st->execute(array(
    ':dp'     => mb_substr($dpId, 0, 60),
    ':res'    => mb_substr((string)(isset($d['resId']) ? $d['resId'] : ''), 0, 60),
    ':nama'   => mb_substr((string)(isset($d['nama'])  ? $d['nama']  : ''), 0, 160),
    ':tgl'    => bri_tgl_null(isset($d['tgl']) ? $d['tgl'] : ''),
    ':nom'    => (int)round((float)(isset($d['nominal']) ? $d['nominal'] : 0)),
    ':alasan' => mb_substr($alasan, 0, 255),
    ':oleh'   => mb_substr((string)$oleh, 0, 120),
    ':at'     => (int)(microtime(true) * 1000)));
  return array('ok' => true, 'saved' => true);
}

/* Nisan dalam rentang yang sedang dibuka. Yang TGL-nya kosong selalu ikut:
   DP yang tanggal transfernya tidak terbaca memang tidak punya bulan, dan
   membuangnya membuat nisannya lenyap sementara barisnya hidup lagi di
   daftar — persis kebalikan dari yang diminta orang yang menandainya. */
function bri_abai_list($dari, $sampai) {
  bri_abai_pastikan();
  $d = bri_tgl_sah($dari);
  $s = bri_tgl_sah($sampai);
  $sql = 'SELECT * FROM `bri_dp_abai`';
  $arg = array();
  if ($d !== '' && $s !== '') {
    $sql .= ' WHERE `tgl` IS NULL OR `tgl` BETWEEN :d AND :s';
    $arg = array(':d' => $d, ':s' => $s);
  }
  $st = db()->prepare($sql);
  $st->execute($arg);
  $out = array();
  foreach ($st->fetchAll() as $r) {
    $out[] = array(
      'dpId' => (string)$r['dp_id'], 'resId' => (string)$r['res_id'],
      'nama' => (string)$r['nama'],
      'tgl' => $r['tgl'] === null ? '' : (string)$r['tgl'],
      'nominal' => (float)$r['nominal'], 'alasan' => (string)$r['alasan'],
      'oleh' => (string)$r['oleh'], 'at' => (float)$r['abai_at']);
  }
  return $out;
}

function bri_list($dari, $sampai) {
  bri_pastikan();
  $d = bri_tgl_sah($dari);
  $s = bri_tgl_sah($sampai);
  $pdo = db();
  $sql = 'SELECT * FROM `bri_mutasi`';
  $arg = array();
  if ($d !== '' && $s !== '') { $sql .= ' WHERE `tgl` BETWEEN :d AND :s'; $arg = array(':d' => $d, ':s' => $s); }
  else if ($d !== '')         { $sql .= ' WHERE `tgl` >= :d';            $arg = array(':d' => $d); }
  else if ($s !== '')         { $sql .= ' WHERE `tgl` <= :s';            $arg = array(':s' => $s); }

  /* Jumlahnya dihitung SEBELUM dipotong. Dihitung dari baris yang sudah
     terpotong, angka "N tidak ditampilkan" selalu nol dan pemotongannya
     jadi tidak pernah bisa diketahui siapa pun. */
  $stc = $pdo->prepare(str_replace('SELECT *', 'SELECT COUNT(*)', $sql));
  $stc->execute($arg);
  $total = (int)$stc->fetchColumn();

  $st = $pdo->prepare($sql . ' ORDER BY `tgl` ASC, `jam` ASC, `dibuat` ASC LIMIT ' . BRI_LIST_MAKS);
  $st->execute($arg);
  $baris = array();
  foreach ($st->fetchAll() as $r) {
    $baris[] = array(
      'id' => (string)$r['id'], 'tgl' => (string)$r['tgl'], 'jam' => (string)$r['jam'],
      'nominal' => (float)$r['nominal'], 'ket' => (string)$r['ket'],
      'settle' => $r['settle'] === null ? '' : (string)$r['settle'],
      'booking' => $r['booking'] === null ? '' : (string)$r['booking'],
      'resId' => (string)$r['res_id'], 'dpId' => (string)$r['dp_id'],
      'resNama' => (string)$r['res_nama'],
      'resTgl' => $r['res_tgl'] === null ? '' : (string)$r['res_tgl'],
      'cara' => (string)$r['cara'], 'catatan' => (string)$r['catatan'],
      'sumber' => (string)(isset($r['sumber']) ? $r['sumber'] : 'unggah'),
      'cocokOleh' => (string)$r['cocok_oleh'], 'cocokAt' => (float)$r['cocok_at'],
      'oleh' => (string)$r['oleh'], 'olehId' => (string)$r['oleh_id'],
      'dibuat' => (float)$r['dibuat'], 'diubah' => (float)$r['diubah'],
      'diubahOleh' => (string)$r['diubah_oleh'],
      'batalAt' => (float)$r['batal_at'], 'batalOleh' => (string)$r['batal_oleh'],
      'batalAlasan' => (string)$r['batal_alasan']);
  }
  /* NISAN IKUT DI BALASAN YANG SAMA, bukan aksi baca kedua: halaman ini
     menggambar daftar dan nisannya dalam satu render, dan dua permintaan yang
     datangnya tidak bersamaan membuat baris tercoret berkedip jadi hidup lagi
     sekejap tiap halaman digambar ulang. */
  return array('baris' => $baris, 'total' => $total, 'maks' => BRI_LIST_MAKS,
               'abai' => bri_abai_list($dari, $sampai));
}
