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
                'transfer','gofood','grabfood','error',
                'bri','mandiri','bca');   // ← warisan, sebelum EDC/QRIS dipecah
  /* Yang punya MDR. Bertambah dua kali pada 12 Agustus 2026: `gofood` &
     `grabfood` (ojol memotong komisi persis seperti bank memotong MDR), lalu
     `qr_order` plus pemecahan EDC/QRIS. Daftar ini TERTUTUP — kunci di luar
     daftar dibuang diam-diam, jadi menambah bank/ojol baru di frontend TANPA
     menambahnya di sini membuat angka yang diketik hilang tanpa satu pun pesan
     galat. */
  $bank = array('qr_order',
                'edc_bri','qris_bri','edc_mandiri','qris_mandiri','edc_bca','qris_bca',
                'gofood','grabfood',
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
        $nominal = 0;
        foreach ($hari as $h) {
          if (isset($s['reports'][$h]['pay']['cash']['actual'])) $nominal += kp_num($s['reports'][$h]['pay']['cash']['actual']);
          $tersentuh[$h] = 1;
        }
        $s['rekap_setoran'][] = array(
          'id'      => 'st' . dechex((int)(microtime(true) * 1000)) . dechex(mt_rand(0, 0xffff)),
          'tgl'     => $tglSetor,
          'tujuan'  => mb_substr(trim((string)(isset($baru['tujuan']) ? $baru['tujuan'] : '')), 0, 80),
          'catatan' => mb_substr(trim((string)(isset($baru['catatan']) ? $baru['catatan'] : '')), 0, 200),
          'hari'    => $hari,
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
      $tercakup = array();
      foreach ($s['rekap_setoran'] as $row) {
        if (!isset($row['hari']) || !is_array($row['hari'])) continue;
        foreach ($row['hari'] as $h) $tercakup[(string)$h] = 1;
      }
      foreach (array_keys($tersentuh) as $h) {
        if (!isset($s['reports'][$h]) || !is_array($s['reports'][$h])) $s['reports'][$h] = array();
        $s['reports'][$h]['setor'] = isset($tercakup[$h]);
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
