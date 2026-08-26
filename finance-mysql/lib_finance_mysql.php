<?php
/************************************************************************
 * FINANCE LAKSAMANA — Backend PHP + MySQL (Kas Kecil)
 * ---------------------------------------------------------------------
 * BUKAN penyimpan blob JSON, dan itu perbedaan paling penting dari
 * kompas-api-mysql yang berdiri di sebelahnya.
 *
 * Kompas dipakai satu penyunting dan bentuk datanya berkembang bebas, jadi
 * di sana blob satu baris memang pilihan yang tepat. Kas Kecil sebaliknya:
 * beberapa orang finance mencatat di jam yang berdekatan, dan blob satu
 * baris membuat yang menyimpan belakangan MENGHAPUS catatan yang lain tanpa
 * satu pun pesan galat. Untuk data uang itu tidak bisa diterima. Jadi di
 * sini tabel sungguhan, satu transaksi satu baris, tulisan granular.
 *
 * SALDO TIDAK PERNAH DISIMPAN. Ia selalu dihitung ulang di frontend dari
 * seluruh riwayat pos, urut tanggal lalu id. Menyimpan saldo berarti punya
 * dua sumber kebenaran untuk angka yang sama, dan yang satu pasti akan
 * ketinggalan begitu ada transaksi disisipkan bertanggal mundur — persis
 * penyakit lembar spreadsheet yang digantikan modul ini.
 *
 * SEMUA PENANDA BERNAMA DIIKAT BERDASARKAN POSISI (EMULATE_PREPARES=false).
 * Satu nama yang dipakai dua kali dalam satu prepare() gagal dengan
 * SQLSTATE[HY093] yang tidak menyebut kolom apa pun. Sudah kejadian
 * 5 Agustus 2026 di modul dw (simpan_pekerja) — jangan diulang di sini.
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

/* Tabel dibuat kalau belum ada, dijalankan di awal SETIAP permintaan.
   Alasannya bukan kemalasan: migrasi-*.sql di repo ini tidak ikut ter-deploy
   dan produksi sering tertinggal, sehingga endpoint baru membalas 500
   sementara tetangganya 200 — gejala yang mahal dilacak. Skema kas kecil
   cukup kecil untuk dijamin dari kode. */
function pastikan_tabel() {
  $pdo = db();
  $pdo->exec(
    'CREATE TABLE IF NOT EXISTS `kk_pos` (
       `id`    INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
       `nama`  VARCHAR(120) NOT NULL,
       `urut`  INT          NOT NULL DEFAULT 0,
       `aktif` TINYINT(1)   NOT NULL DEFAULT 1,
       UNIQUE KEY `uq_pos_nama` (`nama`)
     ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci');
  $pdo->exec(
    'CREATE TABLE IF NOT EXISTS `kk_kategori` (
       `id`    INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
       `nama`  VARCHAR(120) NOT NULL,
       `urut`  INT          NOT NULL DEFAULT 0,
       `aktif` TINYINT(1)   NOT NULL DEFAULT 1,
       UNIQUE KEY `uq_kat_nama` (`nama`)
     ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci');
  /* kategori_id BOLEH NULL dan ON DELETE SET NULL: kategori yang belum
     terpakai boleh dihapus, dan transaksi lama tidak boleh ikut hilang
     karenanya. Kategori yang SUDAH terpakai tidak pernah sampai ke sini —
     frontend menawarkan nonaktifkan, dan hapus_kategori() menolaknya. */
  $pdo->exec(
    'CREATE TABLE IF NOT EXISTS `kk_trx` (
       `id`          INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
       `tgl`         DATE         NOT NULL,
       `keterangan`  VARCHAR(255) NOT NULL DEFAULT \'\',
       `kategori_id` INT UNSIGNED NULL,
       `input`       TINYINT(1)   NOT NULL DEFAULT 0,
       `bon`         TINYINT(1)   NOT NULL DEFAULT 0,
       `dibuat_at`   BIGINT       NOT NULL DEFAULT 0,
       `dibuat_oleh` VARCHAR(120) NOT NULL DEFAULT \'\',
       KEY `idx_trx_tgl` (`tgl`),
       CONSTRAINT `fk_trx_kat` FOREIGN KEY (`kategori_id`)
         REFERENCES `kk_kategori`(`id`) ON DELETE SET NULL
     ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci');
  /* Satu transaksi bisa dibagi ke beberapa pos (mis. sebagian Kas Kecil,
     sebagian PO), jadi barisnya tabel sendiri. UNIQUE (trx_id,pos_id)
     menahan bug diam-diam: dua baris untuk pos yang sama pada satu
     transaksi akan terhitung dua kali di saldo dan tidak ada tempat yang
     melaporkannya. */
  $pdo->exec(
    'CREATE TABLE IF NOT EXISTS `kk_trx_pos` (
       `id`     INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
       `trx_id` INT UNSIGNED NOT NULL,
       `pos_id` INT UNSIGNED NOT NULL,
       `debet`  BIGINT       NOT NULL DEFAULT 0,
       `kredit` BIGINT       NOT NULL DEFAULT 0,
       UNIQUE KEY `uq_trx_pos` (`trx_id`,`pos_id`),
       KEY `idx_tp_pos` (`pos_id`),
       CONSTRAINT `fk_tp_trx` FOREIGN KEY (`trx_id`)
         REFERENCES `kk_trx`(`id`) ON DELETE CASCADE,
       CONSTRAINT `fk_tp_pos` FOREIGN KEY (`pos_id`)
         REFERENCES `kk_pos`(`id`)
     ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci');

  /* Hak akses per sub-menu (25 Agustus 2026). `kunci` = ROLE ('staf',
     'manajemen', 'viewer'), bukan orang: hak yang ditempel ke orang harus
     disetel ulang tiap ada kru baru, dan tidak ada satu tempat pun yang bisa
     menjawab "apa sebenarnya beda hak staf dan manajemen".

     Barisnya SELISIH dari bawaan — yang tidak disetel khusus tidak punya baris
     di sini sama sekali, jadi halaman yang lahir besok otomatis memakai bawaan
     barunya alih-alih tertinggal terkunci di pemasangan yang matriksnya pernah
     disimpan.

     UNIQUE (kunci,halaman) menahan bug diam-diam: dua baris untuk sel yang
     sama akan terbaca bergantian tergantung urutan baris, dan tidak ada layar
     yang bisa melaporkannya. */
  $pdo->exec(
    'CREATE TABLE IF NOT EXISTS `kk_akses` (
       `id`      INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
       `kunci`   VARCHAR(80)  NOT NULL,
       `halaman` VARCHAR(40)  NOT NULL,
       `tingkat` TINYINT      NOT NULL DEFAULT 2,
       UNIQUE KEY `uq_akses` (`kunci`,`halaman`)
     ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci');
  /* Versi pertama matriks ini (yang hidup satu sore pada 25 Agustus 2026)
     memakai kunci per ORANG: '#<id user>' atau '@<nama>'. Barisnya dibuang di
     sini, bukan lewat berkas migrasi — migrasi tidak ikut ter-deploy dan
     produksi rutin tertinggal. Kalau dibiarkan, isinya tidak pernah terbaca
     lagi (frontend mencarinya per role) tapi tetap duduk di tabel dan akan
     membingungkan siapa pun yang membacanya lewat phpMyAdmin. */
  $pdo->exec("DELETE FROM `kk_akses` WHERE `kunci` LIKE '#%' OR `kunci` LIKE '@%'");

  /* Role tiap kru. Satu baris per orang, dan HANYA untuk yang rolenya pernah
     ditentukan — yang tidak ada di sini dihitung sebagai role bawaan ('staf'
     di frontend). Menyimpan baris untuk semua orang berarti kru yang baru
     diberi akses modul di Office tidak punya baris, dan perilakunya jadi
     bergantung pada apakah ada yang ingat membuka halaman ini. */
  $pdo->exec(
    'CREATE TABLE IF NOT EXISTS `kk_peran` (
       `kunci` VARCHAR(80) NOT NULL PRIMARY KEY,
       `peran` VARCHAR(24) NOT NULL
     ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci');

  seed_awal();
}

/* Isi awal, HANYA saat tabelnya benar-benar masih kosong. Tanpa ini, modul
   yang baru dipasang menyambut orang dengan form yang tidak bisa diisi
   ("belum ada pos") — dan pos/kategori yang dipakai finance sudah diketahui
   dari lembar yang selama ini berjalan. */
function seed_awal() {
  $pdo = db();
  $adaPos = (int)$pdo->query('SELECT COUNT(*) AS n FROM `kk_pos`')->fetch()['n'];
  if ($adaPos === 0) {
    $st = $pdo->prepare('INSERT INTO `kk_pos` (`nama`,`urut`) VALUES (:nama, :urut)');
    $i = 10;
    foreach (array('Kas Kecil', 'Pengajuan Pembayaran (PO)', 'Pengajuan Pembayaran') as $nama) {
      $st->execute(array(':nama' => $nama, ':urut' => $i));
      $i += 10;
    }
  }
  $adaKat = (int)$pdo->query('SELECT COUNT(*) AS n FROM `kk_kategori`')->fetch()['n'];
  if ($adaKat === 0) {
    $st = $pdo->prepare('INSERT INTO `kk_kategori` (`nama`,`urut`) VALUES (:nama, :urut)');
    $i = 10;
    foreach (array('SP', 'RND', 'COGS', 'Cleaning', 'Delivery', 'Maintenance',
                   'Bonus', 'Partime', 'Technology', 'Dekorasi', 'Spesial',
                   'Memorial Journal') as $nama) {
      $st->execute(array(':nama' => $nama, ':urut' => $i));
      $i += 10;
    }
  }
}

/* ---------------------------------------------------------------- baca */
function baca_semua() {
  pastikan_tabel();
  $pdo = db();
  $pos = $pdo->query('SELECT `id`,`nama`,`urut`,`aktif` FROM `kk_pos` ORDER BY `urut`,`id`')->fetchAll();
  $kat = $pdo->query('SELECT `id`,`nama`,`urut`,`aktif` FROM `kk_kategori` ORDER BY `urut`,`id`')->fetchAll();
  $trx = $pdo->query(
    'SELECT `id`,`tgl`,`keterangan`,`kategori_id`,`input`,`bon`,`dibuat_at`,`dibuat_oleh`
       FROM `kk_trx` ORDER BY `tgl`,`id`')->fetchAll();
  $baris = $pdo->query('SELECT `trx_id`,`pos_id`,`debet`,`kredit` FROM `kk_trx_pos` ORDER BY `id`')->fetchAll();

  /* Baris ditempelkan ke transaksinya di sini, bukan lewat satu query per
     transaksi: buku kas setahun mudah mencapai ribuan baris, dan pola
     query-di-dalam-loop itulah yang membuat halaman terasa mati padahal
     datanya sedikit. */
  $peta = array();
  foreach ($trx as $i => $t) {
    $trx[$i]['id']          = (int)$t['id'];
    $trx[$i]['kategori_id'] = $t['kategori_id'] === null ? null : (int)$t['kategori_id'];
    $trx[$i]['input']       = (int)$t['input'];
    $trx[$i]['bon']         = (int)$t['bon'];
    $trx[$i]['dibuat_at']   = (int)$t['dibuat_at'];
    $trx[$i]['baris']       = array();
    $peta[(int)$t['id']]    = $i;
  }
  foreach ($baris as $b) {
    $id = (int)$b['trx_id'];
    if (!isset($peta[$id])) continue;
    $trx[$peta[$id]]['baris'][] = array(
      'pos_id' => (int)$b['pos_id'],
      'debet'  => (int)$b['debet'],
      'kredit' => (int)$b['kredit'],
    );
  }
  foreach ($pos as $i => $p) { $pos[$i]['id'] = (int)$p['id']; $pos[$i]['urut'] = (int)$p['urut']; $pos[$i]['aktif'] = ((int)$p['aktif']) === 1; }
  foreach ($kat as $i => $k) { $kat[$i]['id'] = (int)$k['id']; $kat[$i]['urut'] = (int)$k['urut']; $kat[$i]['aktif'] = ((int)$k['aktif']) === 1; }

  return array('pos' => $pos, 'kategori' => $kat, 'trx' => array_values($trx),
               'akses' => akses_baca(), 'peran' => peran_baca());
}

/* ------------------------------------------------- hak akses sub-menu */
/* Dipulangkan sebagai OBJEK, bukan array. json_encode(array()) menghasilkan
   `[]`, dan frontend yang menerima array kosong lalu membacanya sebagai peta
   akan diam-diam menganggap tidak ada satu pun setelan — persis sama dengan
   "semua bawaan", jadi salahnya tidak kelihatan sampai ada yang bertanya
   kenapa setelannya hilang. */
function akses_baca() {
  $out = array();
  $st = db()->query('SELECT `kunci`,`halaman`,`tingkat` FROM `kk_akses`');
  foreach ($st->fetchAll() as $r) {
    $k = (string)$r['kunci'];
    if (!isset($out[$k])) $out[$k] = array();
    $out[$k][(string)$r['halaman']] = (int)$r['tingkat'];
  }
  return (object)$out;
}

/* Role tiap kru: {'#<id user>': 'staf'|'manajemen'|'viewer'}. Objek, bukan
   array — alasannya sama dengan akses_baca(). */
function peran_baca() {
  $out = array();
  $st = db()->query('SELECT `kunci`,`peran` FROM `kk_peran`');
  foreach ($st->fetchAll() as $r) $out[(string)$r['kunci']] = (string)$r['peran'];
  return (object)$out;
}

/* SATU orang sekali panggil, bukan seluruh daftar sekaligus. Penetapan role
   adalah keputusan tentang satu orang; mengirimnya bersama seluruh daftar
   membuat dua admin yang menyetel dua orang berbeda di menit yang sama saling
   menghapus, dan tidak ada satu pun pesan yang menyebutkannya.

   Nama role TIDAK diperiksa di sini terhadap daftar tertentu: daftarnya milik
   frontend, dan menyalinnya ke PHP berarti menambah role baru harus menyunting
   dua tempat — yang kelupaan akan menolak penyimpanan dengan galat yang tidak
   menyebut sebabnya. Yang dijaga cuma bentuknya. Nilai yang tidak dikenal
   dibaca frontend sebagai role bawaan, jadi gagalnya aman. */
function peran_simpan($in) {
  pastikan_tabel();
  $kunci = isset($in['kunci']) ? substr(trim((string)$in['kunci']), 0, 80) : '';
  $peran = isset($in['peran']) ? substr(trim((string)$in['peran']), 0, 24) : '';
  if ($kunci === '') throw new Exception('kunci kru kosong');
  if ($peran === '') {
    /* Role kosong = kembalikan ke bawaan. Barisnya DIHAPUS, bukan diisi
       'staf': baris yang ada berarti "pernah ditentukan", dan itu bedanya
       dengan kru yang memang belum pernah disentuh. */
    $d = db()->prepare('DELETE FROM `kk_peran` WHERE `kunci`=:kunci');
    $d->execute(array(':kunci' => $kunci));
  } else {
    $q = db()->prepare('INSERT INTO `kk_peran` (`kunci`,`peran`) VALUES (:kunci,:peran)
                        ON DUPLICATE KEY UPDATE `peran`=VALUES(`peran`)');
    $q->execute(array(':kunci' => $kunci, ':peran' => $peran));
  }
  return peran_baca();
}

/* Seluruh matriks ditulis sekali jalan (hapus lalu isi ulang), bukan per sel.
   Boleh begitu di sini — beda dengan jadwal & dw yang sengaja granular —
   karena yang menyunting halaman ini cuma admin modul finance, jumlahnya satu
   dua orang, dan mereka tidak pernah menyetel matriks yang sama di menit yang
   sama. Yang WAJIB dijaga sebagai gantinya: frontend harus selalu mengirim
   peta LENGKAP hasil pembacaan seluruh tombol, tidak pernah sepotong.
   Mengirim sepotong berarti sisanya terhapus tanpa ada pesan apa pun. */
function akses_simpan($in) {
  pastikan_tabel();
  $peta = (isset($in['peta']) && is_array($in['peta'])) ? $in['peta'] : array();
  $pdo  = db();
  $pdo->beginTransaction();
  try {
    $pdo->exec('DELETE FROM `kk_akses`');
    $q = $pdo->prepare('INSERT INTO `kk_akses` (`kunci`,`halaman`,`tingkat`)
                        VALUES (:kunci,:halaman,:tingkat)');
    foreach ($peta as $kunci => $baris) {
      if (!is_array($baris)) continue;
      $kunci = substr((string)$kunci, 0, 80);
      if ($kunci === '') continue;
      foreach ($baris as $hal => $tk) {
        $hal = substr((string)$hal, 0, 40);
        if ($hal === '') continue;
        $tk = (int)$tk;
        if ($tk < 0) $tk = 0;
        if ($tk > 2) $tk = 2;
        $q->execute(array(':kunci' => $kunci, ':halaman' => $hal, ':tingkat' => $tk));
      }
    }
    $pdo->commit();
  } catch (Throwable $e) {
    $pdo->rollBack();
    throw $e;
  }
  return akses_baca();
}

/* -------------------------------------------------------------- tulis */
function simpan_trx($in) {
  pastikan_tabel();
  $pdo = db();

  $tgl = isset($in['tgl']) ? trim((string)$in['tgl']) : '';
  if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $tgl)) throw new Exception('Tanggal tidak sah.');
  $ket = isset($in['keterangan']) ? trim((string)$in['keterangan']) : '';
  if ($ket === '') throw new Exception('Keterangan wajib diisi.');
  $kat = (isset($in['kategori_id']) && $in['kategori_id'] !== '' && $in['kategori_id'] !== null)
       ? (int)$in['kategori_id'] : null;

  $baris = isset($in['baris']) && is_array($in['baris']) ? $in['baris'] : array();
  $bersih = array();
  foreach ($baris as $b) {
    $pid = isset($b['pos_id']) ? (int)$b['pos_id'] : 0;
    $d   = isset($b['debet'])  ? (int)$b['debet']  : 0;
    $k   = isset($b['kredit']) ? (int)$b['kredit'] : 0;
    if ($pid <= 0) continue;
    if ($d === 0 && $k === 0) continue;
    if ($d < 0 || $k < 0) throw new Exception('Nominal tidak boleh negatif.');
    /* Satu baris tidak boleh debet DAN kredit sekaligus: itu bukan satu
       transaksi melainkan dua, dan menggabungkannya membuat saldo benar
       secara total tapi kolom Debet/Kredit di layar tidak bisa dicocokkan
       dengan nota mana pun. */
    if ($d > 0 && $k > 0) throw new Exception('Satu pos tidak boleh debet dan kredit sekaligus.');
    if (isset($bersih[$pid])) throw new Exception('Pos yang sama dikirim dua kali.');
    $bersih[$pid] = array('debet' => $d, 'kredit' => $k);
  }
  if (!$bersih) throw new Exception('Belum ada nominal di satu pos pun.');

  $id    = (isset($in['id']) && $in['id']) ? (int)$in['id'] : 0;
  $input = !empty($in['input']) ? 1 : 0;
  $bon   = !empty($in['bon'])   ? 1 : 0;
  $oleh  = isset($in['oleh']) ? substr(trim((string)$in['oleh']), 0, 120) : '';

  $pdo->beginTransaction();
  try {
    if ($id > 0) {
      $st = $pdo->prepare(
        'UPDATE `kk_trx` SET `tgl`=:tgl, `keterangan`=:ket, `kategori_id`=:kat,
                             `input`=:input, `bon`=:bon WHERE `id`=:id');
      $st->execute(array(':tgl' => $tgl, ':ket' => $ket, ':kat' => $kat,
                         ':input' => $input, ':bon' => $bon, ':id' => $id));
      if ($st->rowCount() === 0) {
        $ada = $pdo->prepare('SELECT COUNT(*) AS n FROM `kk_trx` WHERE `id`=:id');
        $ada->execute(array(':id' => $id));
        if ((int)$ada->fetch()['n'] === 0) throw new Exception('Transaksi sudah tidak ada — mungkin dihapus orang lain.');
      }
      /* Baris lama DIHAPUS lalu ditulis ulang, bukan ditambal satu per satu.
         Menambal berarti harus menebak baris mana yang hilang dari kiriman,
         dan pos yang dikosongkan orang akan tertinggal sebagai baris lama
         yang tetap ikut menghitung saldo. */
      $del = $pdo->prepare('DELETE FROM `kk_trx_pos` WHERE `trx_id`=:id');
      $del->execute(array(':id' => $id));
    } else {
      $st = $pdo->prepare(
        'INSERT INTO `kk_trx` (`tgl`,`keterangan`,`kategori_id`,`input`,`bon`,`dibuat_at`,`dibuat_oleh`)
         VALUES (:tgl,:ket,:kat,:input,:bon,:at,:oleh)');
      $st->execute(array(':tgl' => $tgl, ':ket' => $ket, ':kat' => $kat,
                         ':input' => $input, ':bon' => $bon,
                         ':at' => (int)round(microtime(true) * 1000), ':oleh' => $oleh));
      $id = (int)$pdo->lastInsertId();
    }
    $ins = $pdo->prepare('INSERT INTO `kk_trx_pos` (`trx_id`,`pos_id`,`debet`,`kredit`) VALUES (:trx,:pos,:d,:k)');
    foreach ($bersih as $pid => $v) {
      $ins->execute(array(':trx' => $id, ':pos' => $pid, ':d' => $v['debet'], ':k' => $v['kredit']));
    }
    $pdo->commit();
  } catch (Throwable $e) {
    $pdo->rollBack();
    throw $e;
  }
  return array('id' => $id);
}

function hapus_trx($id) {
  pastikan_tabel();
  $id = (int)$id;
  if ($id <= 0) throw new Exception('Id transaksi tidak sah.');
  // kk_trx_pos ikut terhapus lewat ON DELETE CASCADE.
  $st = db()->prepare('DELETE FROM `kk_trx` WHERE `id`=:id');
  $st->execute(array(':id' => $id));
  return array('dihapus' => $st->rowCount());
}

/* Centang Input / Bon diubah TANPA menyentuh transaksinya. Keduanya penanda
   administrasi yang dicentang belakangan, sering oleh orang yang berbeda dan
   berhari-hari sesudah transaksinya dicatat — mengirimnya lewat simpan_trx
   berarti seluruh isi transaksi ikut ditulis ulang dari layar yang mungkin
   sudah basi. */
function tandai_trx($id, $field, $nilai) {
  pastikan_tabel();
  $id = (int)$id;
  if ($id <= 0) throw new Exception('Id transaksi tidak sah.');
  if ($field !== 'input' && $field !== 'bon') throw new Exception('Penanda tidak dikenal: ' . $field);
  $kolom = $field === 'input' ? '`input`' : '`bon`';   // whitelist, bukan interpolasi bebas
  $st = db()->prepare('UPDATE `kk_trx` SET ' . $kolom . '=:v WHERE `id`=:id');
  $st->execute(array(':v' => $nilai ? 1 : 0, ':id' => $id));
  return array('diubah' => $st->rowCount());
}

/* ------------------------------------------------- pos & kategori */
function simpan_daftar($tabel, $in) {
  pastikan_tabel();
  $nama = isset($in['nama']) ? trim((string)$in['nama']) : '';
  if ($nama === '') throw new Exception('Nama wajib diisi.');
  $urut = isset($in['urut']) ? (int)$in['urut'] : 0;
  $id   = (isset($in['id']) && $in['id']) ? (int)$in['id'] : 0;
  $pdo  = db();
  try {
    if ($id > 0) {
      $st = $pdo->prepare('UPDATE `' . $tabel . '` SET `nama`=:nama, `urut`=:urut WHERE `id`=:id');
      $st->execute(array(':nama' => $nama, ':urut' => $urut, ':id' => $id));
    } else {
      $st = $pdo->prepare('INSERT INTO `' . $tabel . '` (`nama`,`urut`) VALUES (:nama,:urut)');
      $st->execute(array(':nama' => $nama, ':urut' => $urut));
      $id = (int)$pdo->lastInsertId();
    }
  } catch (PDOException $e) {
    // 23000 = pelanggaran UNIQUE. Pesannya diganti supaya terbaca manusia.
    if ($e->getCode() === '23000') throw new Exception('"' . $nama . '" sudah ada dalam daftar.');
    throw $e;
  }
  return array('id' => $id);
}
function aktif_daftar($tabel, $id, $aktif) {
  pastikan_tabel();
  $st = db()->prepare('UPDATE `' . $tabel . '` SET `aktif`=:a WHERE `id`=:id');
  $st->execute(array(':a' => $aktif ? 1 : 0, ':id' => (int)$id));
  return array('diubah' => $st->rowCount());
}
/* Hapus DITOLAK kalau sudah terpakai. Frontend sudah memeriksanya lebih dulu
   dan menawarkan nonaktifkan, tapi pemeriksaan di layar bukan penjaga: dua
   orang bisa menghapus dan memakai pos yang sama pada detik yang sama.
   Penjaga sebenarnya di sini. */
function hapus_pos($id) {
  pastikan_tabel();
  $id = (int)$id;
  $st = db()->prepare('SELECT COUNT(*) AS n FROM `kk_trx_pos` WHERE `pos_id`=:id');
  $st->execute(array(':id' => $id));
  if ((int)$st->fetch()['n'] > 0) throw new Exception('Pos ini sudah dipakai transaksi — nonaktifkan saja.');
  $d = db()->prepare('DELETE FROM `kk_pos` WHERE `id`=:id');
  $d->execute(array(':id' => $id));
  return array('dihapus' => $d->rowCount());
}
function hapus_kategori($id) {
  pastikan_tabel();
  $id = (int)$id;
  $st = db()->prepare('SELECT COUNT(*) AS n FROM `kk_trx` WHERE `kategori_id`=:id');
  $st->execute(array(':id' => $id));
  if ((int)$st->fetch()['n'] > 0) throw new Exception('Kategori ini sudah dipakai transaksi — nonaktifkan saja.');
  $d = db()->prepare('DELETE FROM `kk_kategori` WHERE `id`=:id');
  $d->execute(array(':id' => $id));
  return array('dihapus' => $d->rowCount());
}

function ping() {
  $db = 'gagal';
  try { db()->query('SELECT 1'); $db = 'ok'; } catch (Throwable $e) { $db = $e->getMessage(); }
  return array('pong' => true, 'env' => defined('ENV_LABEL') ? ENV_LABEL : '?', 'db' => $db);
}
function stats() {
  pastikan_tabel();
  $pdo = db();
  return array(
    'pos'      => (int)$pdo->query('SELECT COUNT(*) AS n FROM `kk_pos`')->fetch()['n'],
    'kategori' => (int)$pdo->query('SELECT COUNT(*) AS n FROM `kk_kategori`')->fetch()['n'],
    'trx'      => (int)$pdo->query('SELECT COUNT(*) AS n FROM `kk_trx`')->fetch()['n'],
    'baris'    => (int)$pdo->query('SELECT COUNT(*) AS n FROM `kk_trx_pos`')->fetch()['n'],
  );
}
