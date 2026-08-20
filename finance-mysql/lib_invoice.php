<?php
/************************************************************************
 * FINANCE LAKSAMANA — INVOICE / KWITANSI (20 Agustus 2026)
 * ---------------------------------------------------------------------
 * Antrean permintaan kwitansi dari modul Reservasi, dan kwitansi resmi
 * yang dikeluarkan Finance atasnya.
 *
 * KENAPA DATANYA DI SINI, BUKAN DI RESERVASI
 * Permintaannya lahir di modul Reservasi, jadi tempat paling "alami"
 * adalah state Reservasi. Dua hal membatalkan itu:
 *
 *   1. Backend Reservasi menyimpan SELURUH state sebagai satu blob lewat
 *      saveAll. Kalau Finance ikut menulis ke sana, dua modul menimpa
 *      baris yang sama — orang finance yang membuat invoice jam 10:00
 *      menghapus reservasi yang baru diinput host jam 09:59, tanpa galat.
 *   2. Backend Reservasi TIDAK ikut auto-deploy (di-upload manual ke
 *      cPanel, dan pemiliknya orang lain). Menambah tabel di sana berarti
 *      fitur ini menunggu orang lain sebelum bisa hidup.
 *
 * Finance menulis granular ke tabelnya sendiri, dan Reservasi cuma
 * MEMBACA statusnya lewat endpoint sempit (invStatus/invBerkas). Pola yang
 * sama dengan jadwal yang membaca DW: satu arah, tanpa penyalinan baris.
 *
 * TABELNYA DIBUAT DARI KODE, bukan dari migrasi-*.sql — berkas migrasi di
 * repo ini tidak ikut ter-deploy dan produksi rutin tertinggal, sehingga
 * endpoint baru membalas 500 sementara tetangganya 200.
 *
 * Berkas ini di-require HANYA di dalam cabang aksi invoice di api.php,
 * bukan di puncak berkas. Tidak ada `php` di mesin pengembangan ini untuk
 * memeriksa sintaks lebih dulu, dan satu parse error di puncak akan
 * mematikan SELURUH endpoint folder ini — termasuk Kas Kecil yang tidak
 * ada hubungannya dengan invoice.
 ************************************************************************/

/* Satu baris = satu permintaan kwitansi untuk satu reservasi. Permintaan
   yang disetujui BUKAN baris baru: ia baris yang sama yang berpindah
   status, supaya jejak dari "siapa minta" sampai "siapa mengeluarkan"
   tidak pernah putus. Pelajaran yang sama sudah dipakai di modul BD. */
function inv_pastikan_tabel() {
  /* Sekali per permintaan. Bukan penghematan gaya: fungsi ini sekarang ikut
     menjalankan pemeriksaan kolom (information_schema) dan migrasi penanda
     tangan, dan inv_setting_baca() memanggilnya dari beberapa tempat dalam
     satu permintaan yang sama. */
  static $sudah = false;
  if ($sudah) return;
  $sudah = true;
  $pdo = db();
  $pdo->exec(
    'CREATE TABLE IF NOT EXISTS `inv_kwitansi` (
       `id`         VARCHAR(40)  NOT NULL PRIMARY KEY,
       `res_id`     VARCHAR(64)  NOT NULL,
       `no_invoice` VARCHAR(60)  NOT NULL DEFAULT \'\',
       `status`     VARCHAR(20)  NOT NULL DEFAULT \'MENUNGGU\',
       `ringkas`    MEDIUMTEXT   NULL,
       `minta_oleh` VARCHAR(120) NOT NULL DEFAULT \'\',
       `minta_at`   BIGINT       NOT NULL DEFAULT 0,
       `catatan`    TEXT         NULL,
       `putus_oleh` VARCHAR(120) NOT NULL DEFAULT \'\',
       `putus_at`   BIGINT       NOT NULL DEFAULT 0,
       UNIQUE KEY `uq_inv_res` (`res_id`),
       KEY `idx_inv_status` (`status`),
       KEY `idx_inv_minta` (`minta_at`)
     ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci');
  /* UNIQUE(res_id) disengaja: satu reservasi = satu kwitansi resmi. Tanpa
     itu, tombol Request yang ditekan dua kali (koneksi lambat, orang
     mengira belum masuk) melahirkan dua antrean untuk tamu yang sama, dan
     finance mengeluarkan dua nomor invoice untuk satu pembayaran. */

  $pdo->exec(
    'CREATE TABLE IF NOT EXISTS `inv_setting` (
       `k` VARCHAR(40) NOT NULL PRIMARY KEY,
       `v` MEDIUMTEXT  NULL
     ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci');
  /* Tanda tangan & cap disimpan sebagai data URI di MEDIUMTEXT, bukan
     sebagai berkas di disk: folder unggahan berarti satu hal lagi yang
     harus dibuat manual di cPanel saat modul ini mendarat, dan yang lupa
     dibuat tidak menimbulkan galat — cuma kwitansi tanpa tanda tangan. */

  /* ---- PENANDA TANGAN: DAFTAR, bukan satu (21 Agustus 2026) ----
     Versi pertama menyimpan SATU tanda tangan di inv_setting. Kenyataannya
     satu lembar bisa perlu dua atau tiga tanda tangan (Finance + Manager +
     Direktur), dan siapa yang menandatangani berbeda per dokumen.

     Tabel sendiri, bukan JSON di inv_setting: gambarnya ratusan KB, dan
     menyimpannya sebagai satu blob berarti mengubah nama satu orang
     menulis ulang SELURUH gambar orang lain di baris yang sama — bertambah
     lambat tiap ada penanda tangan baru, dan satu penyimpanan yang gagal di
     tengah menghilangkan semuanya sekaligus. */
  $pdo->exec(
    'CREATE TABLE IF NOT EXISTS `inv_penanda` (
       `id`      VARCHAR(40)  NOT NULL PRIMARY KEY,
       `nama`    VARCHAR(160) NOT NULL DEFAULT \'\',
       `jabatan` VARCHAR(160) NOT NULL DEFAULT \'\',
       `ttd`     MEDIUMTEXT   NULL,
       `urut`    INT          NOT NULL DEFAULT 0,
       `aktif`   TINYINT(1)   NOT NULL DEFAULT 1,
       KEY `idx_pen_urut` (`urut`)
     ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci');

  /* Siapa yang menandatangani lembar INI. Disalin ke dalam barisnya saat
     invoice terbit, bukan dibaca dari inv_penanda tiap kali ditampilkan:
     kwitansi tahun lalu harus tetap menunjukkan siapa yang menandatanganinya
     waktu itu, walau jabatannya sekarang dipegang orang lain. Pelajaran yang
     sama sudah dipakai pada penyetuju PR di modul BD. */
  inv_pastikan_kolom('inv_kwitansi', 'penanda', '`penanda` TEXT NULL');

  inv_migrasi_penanda_tunggal();
}

/* ALTER hanya kalau kolomnya memang belum ada. Tanpa pemeriksaan ini, setiap
   permintaan melempar "Duplicate column name" dan seluruh endpoint invoice
   mati — sementara tetangganya (Kas Kecil) tetap 200, gejala yang mahal
   dilacak. */
function inv_pastikan_kolom($tabel, $kolom, $ddl) {
  $q = db()->prepare(
    'SELECT COUNT(*) AS c FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :t AND COLUMN_NAME = :k');
  $q->execute(array(':t' => $tabel, ':k' => $kolom));
  $row = $q->fetch();
  if (!$row || (int)$row['c'] === 0) {
    db()->exec('ALTER TABLE `' . $tabel . '` ADD COLUMN ' . $ddl);
  }
}

/* Pemasangan yang sempat memakai versi satu-tanda-tangan sudah punya gambar
   di inv_setting. Diangkat jadi baris pertama inv_penanda, sekali saja —
   kalau tidak, Finance membuka tab Pengaturan dan mendapati tanda tangan yang
   baru saja diunggahnya hilang tanpa penjelasan. */
function inv_migrasi_penanda_tunggal() {
  $st = db()->query('SELECT COUNT(*) AS c FROM `inv_penanda`');
  $row = $st->fetch();
  if ($row && (int)$row['c'] > 0) return;

  $set = inv_setting_baca_mentah();
  $ttd  = isset($set['ttd']) ? (string)$set['ttd'] : '';
  $nama = isset($set['penandaNama']) ? (string)$set['penandaNama'] : '';
  $jab  = isset($set['penandaJabatan']) ? (string)$set['penandaJabatan'] : '';
  if ($ttd === '' && $nama === '') return;

  $id = inv_uid('pen');
  $q = db()->prepare('INSERT INTO `inv_penanda` (`id`,`nama`,`jabatan`,`ttd`,`urut`,`aktif`)
                      VALUES (:i,:n,:j,:t,0,1)');
  $q->execute(array(':i' => $id, ':n' => $nama, ':j' => $jab, ':t' => $ttd));
  inv_setting_tulis('penandaDefault', $id);
}

function inv_penanda_daftar($semua) {
  $sql = 'SELECT * FROM `inv_penanda`' . ($semua ? '' : ' WHERE `aktif`=1') . ' ORDER BY `urut`, `nama`';
  $st = db()->query($sql);
  $out = array();
  while ($row = $st->fetch()) {
    $out[] = array(
      'id'      => $row['id'],
      'nama'    => $row['nama'],
      'jabatan' => $row['jabatan'],
      'ttd'     => $row['ttd'] === null ? '' : $row['ttd'],
      'urut'    => (int)$row['urut'],
      'aktif'   => ((int)$row['aktif']) === 1,
    );
  }
  return $out;
}

function inv_penanda_simpan($in) {
  inv_pastikan_tabel();
  if (!is_array($in)) throw new Exception('data penanda tangan kosong');
  $id   = isset($in['id']) && $in['id'] !== '' ? (string)$in['id'] : '';
  $nama = isset($in['nama']) ? trim((string)$in['nama']) : '';
  if ($nama === '') throw new Exception('nama penanda tangan wajib diisi');
  $jab  = isset($in['jabatan']) ? trim((string)$in['jabatan']) : '';
  $urut = isset($in['urut']) ? (int)$in['urut'] : 0;
  $aktif = array_key_exists('aktif', $in) ? (!empty($in['aktif']) ? 1 : 0) : 1;

  $pdo = db();
  if ($id === '') {
    $id = inv_uid('pen');
    $q = $pdo->prepare('INSERT INTO `inv_penanda` (`id`,`nama`,`jabatan`,`ttd`,`urut`,`aktif`)
                        VALUES (:i,:n,:j,:t,:u,:a)');
    $q->execute(array(':i' => $id, ':n' => $nama, ':j' => $jab,
                      ':t' => isset($in['ttd']) ? (string)$in['ttd'] : '',
                      ':u' => $urut, ':a' => $aktif));
  } else {
    /* `ttd` hanya ditulis kalau memang dikirim. Form nama/jabatan tidak ikut
       mengunggah ulang gambarnya, dan menimpanya dengan string kosong berarti
       tanda tangan orang itu lenyap saat namanya dibetulkan — tanpa satu pun
       galat, dan baru ketahuan dari lembar yang sudah dikirim ke tamu. */
    if (array_key_exists('ttd', $in)) {
      $q = $pdo->prepare('UPDATE `inv_penanda` SET `nama`=:n,`jabatan`=:j,`ttd`=:t,`urut`=:u,`aktif`=:a WHERE `id`=:i');
      $q->execute(array(':i' => $id, ':n' => $nama, ':j' => $jab,
                        ':t' => (string)$in['ttd'], ':u' => $urut, ':a' => $aktif));
    } else {
      $q = $pdo->prepare('UPDATE `inv_penanda` SET `nama`=:n,`jabatan`=:j,`urut`=:u,`aktif`=:a WHERE `id`=:i');
      $q->execute(array(':i' => $id, ':n' => $nama, ':j' => $jab, ':u' => $urut, ':a' => $aktif));
    }
  }
  return inv_penanda_daftar(true);
}

/* Dihapus BENAR-BENAR hanya kalau belum pernah dipakai. Yang sudah menempel
   di kwitansi yang terbit cuma bisa dinonaktifkan: gambarnya dibaca hidup
   dari tabel ini saat lembarnya dicetak ulang, jadi menghapusnya membuat
   dokumen lama kehilangan tanda tangannya — dan tidak ada yang memberitahu. */
function inv_penanda_hapus($id) {
  inv_pastikan_tabel();
  $id = (string)$id;
  $q = db()->prepare('SELECT COUNT(*) AS c FROM `inv_kwitansi`
                       WHERE `status`=\'DIBUAT\' AND `penanda` LIKE :p');
  $q->execute(array(':p' => '%' . $id . '%'));
  $row = $q->fetch();
  if ($row && (int)$row['c'] > 0) {
    throw new Exception('Penanda tangan ini sudah menempel di ' . (int)$row['c'] .
      ' kwitansi yang terbit, jadi tidak bisa dihapus. Nonaktifkan saja — ' .
      'ia hilang dari daftar pilihan, tapi dokumen lama tetap bertanda tangan.');
  }
  $d = db()->prepare('DELETE FROM `inv_penanda` WHERE `id`=:i');
  $d->execute(array(':i' => $id));
  return inv_penanda_daftar(true);
}

function inv_uid($p) {
  return $p . dechex(time()) . substr(str_shuffle('abcdefghijklmnopqrstuvwxyz0123456789'), 0, 6);
}

/* MENTAH = tanpa inv_pastikan_tabel(). Dipanggil dari dalam migrasi, yang
   sendirinya dijalankan OLEH pastikan_tabel — memanggilnya lewat pintu yang
   biasa berarti rekursi tanpa dasar. */
function inv_setting_baca_mentah() {
  $out = array();
  $st = db()->query('SELECT `k`,`v` FROM `inv_setting`');
  while ($row = $st->fetch()) {
    $out[$row['k']] = $row['v'] === null ? '' : $row['v'];
  }
  return $out;
}
function inv_setting_tulis($k, $v) {
  $q = db()->prepare('INSERT INTO `inv_setting` (`k`,`v`) VALUES (:k,:v)
                      ON DUPLICATE KEY UPDATE `v`=VALUES(`v`)');
  $q->execute(array(':k' => (string)$k, ':v' => (string)$v));
}
function inv_setting_baca() {
  inv_pastikan_tabel();
  /* `ttd`/`penandaNama`/`penandaJabatan` DIPERTAHANKAN sebagai kunci walau
     sudah digantikan tabel inv_penanda: pemasangan yang sempat memakai versi
     satu-tanda-tangan masih menyimpan nilainya, dan inv_migrasi_penanda_tunggal()
     membacanya dari sini. Tidak dibaca lagi oleh frontend. */
  $out = array('ttd' => '', 'cap' => '', 'penandaNama' => '', 'penandaJabatan' => '',
               'prefix' => 'INV', 'penandaDefault' => '');
  foreach (inv_setting_baca_mentah() as $k => $v) $out[$k] = $v;
  return $out;
}

function inv_setting_simpan($in) {
  inv_pastikan_tabel();
  if (!is_array($in)) throw new Exception('data pengaturan kosong');
  $boleh = array('ttd', 'cap', 'penandaNama', 'penandaJabatan', 'prefix');
  $pdo = db();
  $q = $pdo->prepare('INSERT INTO `inv_setting` (`k`,`v`) VALUES (:k,:v)
                      ON DUPLICATE KEY UPDATE `v`=VALUES(`v`)');
  foreach ($boleh as $k) {
    /* Kunci yang TIDAK dikirim dibiarkan apa adanya, bukan dikosongkan.
       Form pengaturan bisa menyimpan nama penanda tangan tanpa ikut
       mengunggah ulang gambar tanda tangannya, dan menimpanya dengan
       string kosong berarti kwitansi berikutnya keluar tanpa tanda tangan
       tanpa ada yang menyadarinya. */
    if (!array_key_exists($k, $in)) continue;
    $q->execute(array(':k' => $k, ':v' => (string)$in[$k]));
  }
  return inv_setting_baca();
}

/* Nomor diambil dari yang TERTINGGI di bulan berjalan, bukan dari jumlah
   baris. Kwitansi yang pernah dihapus tidak boleh membuat nomor terpakai
   ulang — dua lembar bernomor sama di arsip tidak bisa dibedakan lagi. */
function inv_nomor_berikut() {
  $set = inv_setting_baca();
  $prefix = $set['prefix'] !== '' ? $set['prefix'] : 'INV';
  $bulan  = gmdate('Y/m', time() + 7 * 3600);   // WIB
  $awalan = $prefix . '/' . $bulan . '/';
  $q = db()->prepare('SELECT `no_invoice` FROM `inv_kwitansi` WHERE `no_invoice` LIKE :p');
  $q->execute(array(':p' => $awalan . '%'));
  $maks = 0;
  while ($row = $q->fetch()) {
    $n = (int)substr($row['no_invoice'], strlen($awalan));
    if ($n > $maks) $maks = $n;
  }
  return $awalan . str_pad((string)($maks + 1), 4, '0', STR_PAD_LEFT);
}

function inv_baris($row) {
  $ringkas = array();
  if (!empty($row['ringkas'])) {
    $d = json_decode($row['ringkas'], true);
    if (is_array($d)) $ringkas = $d;
  }
  $penanda = array();
  if (isset($row['penanda']) && $row['penanda'] !== null && $row['penanda'] !== '') {
    $d = json_decode($row['penanda'], true);
    if (is_array($d)) $penanda = $d;
  }
  return array(
    'id'        => $row['id'],
    'resId'     => $row['res_id'],
    'no'        => $row['no_invoice'],
    'status'    => $row['status'],
    'ringkas'   => $ringkas,
    'penanda'   => $penanda,
    'mintaOleh' => $row['minta_oleh'],
    'mintaAt'   => (int)$row['minta_at'],
    'catatan'   => $row['catatan'] === null ? '' : $row['catatan'],
    'putusOleh' => $row['putus_oleh'],
    'putusAt'   => (int)$row['putus_at'],
  );
}

/* Dipanggil modul Reservasi saat kru menekan "Request Kwitansi".
   IDEMPOTEN: permintaan kedua untuk reservasi yang sama tidak melahirkan
   baris kedua — ia memperbarui ringkasannya (DP bisa bertambah sejak
   permintaan pertama) dan memulangkan baris yang sudah ada. */
function inv_minta($in) {
  inv_pastikan_tabel();
  if (!is_array($in) || empty($in['resId'])) throw new Exception('resId kosong');
  $resId   = (string)$in['resId'];
  $oleh    = isset($in['oleh']) ? (string)$in['oleh'] : '';
  $ringkas = isset($in['ringkas']) && is_array($in['ringkas'])
             ? json_encode($in['ringkas'], JSON_UNESCAPED_UNICODE) : null;
  $pdo = db();
  $q = $pdo->prepare('SELECT * FROM `inv_kwitansi` WHERE `res_id`=:r');
  $q->execute(array(':r' => $resId));
  $ada = $q->fetch();

  if ($ada) {
    if ($ada['status'] === 'DIBUAT') {
      /* Sudah ada kwitansi resminya. Ringkasannya TIDAK ditimpa: yang
         tercetak di lembar bernomor itu adalah keadaan saat ia dibuat, dan
         menimpanya belakangan membuat arsip Finance tidak lagi cocok
         dengan kertas yang sudah ditandatangani. */
      return inv_baris($ada);
    }
    /* MENUNGGU atau DITOLAK -> disegarkan jadi permintaan hidup lagi.
       Catatan penolakan lama dibuang: kalau ditinggal, modul Reservasi
       terus menampilkan alasan penolakan di samping permintaan yang
       sebenarnya sudah diajukan ulang. */
    $u = $pdo->prepare('UPDATE `inv_kwitansi`
                        SET `status`=\'MENUNGGU\', `ringkas`=COALESCE(:g,`ringkas`),
                            `minta_oleh`=:o, `minta_at`=:t, `catatan`=\'\',
                            `putus_oleh`=\'\', `putus_at`=0
                        WHERE `id`=:i');
    $u->execute(array(':g' => $ringkas, ':o' => $oleh, ':t' => inv_ms(), ':i' => $ada['id']));
    $q->execute(array(':r' => $resId));
    return inv_baris($q->fetch());
  }

  $id = inv_uid('inv');
  $i = $pdo->prepare('INSERT INTO `inv_kwitansi`
      (`id`,`res_id`,`no_invoice`,`status`,`ringkas`,`minta_oleh`,`minta_at`,`catatan`)
      VALUES (:i,:r,\'\',\'MENUNGGU\',:g,:o,:t,\'\')');
  $i->execute(array(':i' => $id, ':r' => $resId, ':g' => $ringkas, ':o' => $oleh, ':t' => inv_ms()));
  $q->execute(array(':r' => $resId));
  return inv_baris($q->fetch());
}

function inv_ms() { return (int)round(microtime(true) * 1000); }

/* Dibaca modul Reservasi untuk memutuskan tombol apa yang digambar di tiap
   baris. Sengaja sempit: TIDAK memulangkan tanda tangan maupun cap (yang
   berukuran ratusan KB), karena ini dipanggil untuk seluruh daftar. */
function inv_status_banyak($resIds) {
  inv_pastikan_tabel();
  $out = array();
  if (!is_array($resIds) || !count($resIds)) return $out;
  /* Dipotong: daftar reservasi bisa ribuan baris, dan IN(...) sepanjang itu
     melewati batas placeholder MySQL. Yang di luar potongan cukup dianggap
     belum punya permintaan — tombolnya tetap "Request", dan menekannya
     memulangkan baris yang benar. */
  $resIds = array_slice(array_values($resIds), 0, 400);
  $tanda = array();
  $args  = array();
  $n = 0;
  foreach ($resIds as $r) { $k = ':r' . $n++; $tanda[] = $k; $args[$k] = (string)$r; }
  $st = db()->prepare('SELECT * FROM `inv_kwitansi` WHERE `res_id` IN (' . implode(',', $tanda) . ')');
  $st->execute($args);
  while ($row = $st->fetch()) $out[$row['res_id']] = inv_baris($row);
  return $out;
}

function inv_daftar() {
  inv_pastikan_tabel();
  $st = db()->query('SELECT * FROM `inv_kwitansi` ORDER BY `minta_at` DESC');
  $out = array();
  while ($row = $st->fetch()) $out[] = inv_baris($row);
  return $out;
}

/* Keputusan Finance atas satu permintaan.
   aksi: 'buat' -> terbitkan nomor & status DIBUAT
         'tolak' -> DITOLAK, catatan WAJIB (kalau tidak, yang meminta tidak
                    pernah tahu harus membetulkan apa)
         'batal' -> kembalikan ke MENUNGGU (mis. salah tekan) */
function inv_putus($in) {
  inv_pastikan_tabel();
  if (!is_array($in) || empty($in['id'])) throw new Exception('id permintaan kosong');
  $id      = (string)$in['id'];
  $aksi    = isset($in['aksi']) ? (string)$in['aksi'] : '';
  $oleh    = isset($in['oleh']) ? (string)$in['oleh'] : '';
  $catatan = isset($in['catatan']) ? trim((string)$in['catatan']) : '';

  $pdo = db();
  $q = $pdo->prepare('SELECT * FROM `inv_kwitansi` WHERE `id`=:i');
  $q->execute(array(':i' => $id));
  $row = $q->fetch();
  if (!$row) throw new Exception('permintaan tidak ditemukan');

  if ($aksi === 'buat') {
    /* Nomor hanya diberikan SEKALI. Menekan "Buat Invoice" dua kali pada
       baris yang sama tidak boleh memakan nomor kedua — lubang di
       penomoran arsip tidak bisa dijelaskan lagi setahun kemudian. */
    $no = $row['no_invoice'] !== '' ? $row['no_invoice'] : inv_nomor_berikut();
    $pen = json_encode(inv_snapshot_penanda(array_key_exists('penanda', $in) ? $in['penanda'] : null),
                       JSON_UNESCAPED_UNICODE);
    $u = $pdo->prepare('UPDATE `inv_kwitansi`
                        SET `status`=\'DIBUAT\', `no_invoice`=:n, `catatan`=:c, `penanda`=:p,
                            `putus_oleh`=:o, `putus_at`=:t WHERE `id`=:i');
    $u->execute(array(':n' => $no, ':c' => $catatan, ':p' => $pen,
                      ':o' => $oleh, ':t' => inv_ms(), ':i' => $id));
  } else if ($aksi === 'tolak') {
    if ($catatan === '') throw new Exception('alasan penolakan wajib diisi');
    $u = $pdo->prepare('UPDATE `inv_kwitansi`
                        SET `status`=\'DITOLAK\', `catatan`=:c,
                            `putus_oleh`=:o, `putus_at`=:t WHERE `id`=:i');
    $u->execute(array(':c' => $catatan, ':o' => $oleh, ':t' => inv_ms(), ':i' => $id));
  } else if ($aksi === 'batal') {
    /* no_invoice TIDAK dihapus. Kalau lembarnya sempat dicetak dan dikirim,
       nomornya sudah beredar; memulangkannya ke kolam nomor berarti dua
       lembar berbeda bisa memakai nomor yang sama. */
    $u = $pdo->prepare('UPDATE `inv_kwitansi`
                        SET `status`=\'MENUNGGU\', `catatan`=\'\',
                            `putus_oleh`=:o, `putus_at`=:t WHERE `id`=:i');
    $u->execute(array(':o' => $oleh, ':t' => inv_ms(), ':i' => $id));
  } else {
    throw new Exception('aksi tidak dikenal: ' . $aksi);
  }

  $q->execute(array(':i' => $id));
  return inv_baris($q->fetch());
}

/* Nama & jabatan DISALIN ke dalam baris kwitansi; gambarnya TIDAK. Gambar
   dibaca hidup dari inv_penanda saat lembarnya dicetak (lihat inv_berkas),
   supaya satu baris kwitansi tidak membawa ratusan KB base64 dan daftar
   antrean tidak berubah jadi beberapa megabyte.

   Konsekuensinya penanda tangan yang dihapus akan menghilangkan gambar dari
   dokumen lama — itulah sebabnya inv_penanda_hapus() menolak menghapus yang
   sudah terpakai dan menyuruh menonaktifkannya. */
function inv_snapshot_penanda($ids) {
  /* null (field tidak dikirim) = pakai daftar bawaan.
     array kosong = SENGAJA tanpa tanda tangan. Dua hal yang berbeda: kalau
     disamakan, Finance yang melepas semua centangnya justru mendapat lembar
     bertanda tangan bawaan — kebalikan persis dari yang ia minta. */
  if ($ids === null) {
    $set = inv_setting_baca();
    $ids = $set['penandaDefault'] !== '' ? explode(',', $set['penandaDefault']) : array();
  }
  if (!is_array($ids)) $ids = array();
  $out = array();
  if (!count($ids)) return $out;
  $peta = array();
  foreach (inv_penanda_daftar(true) as $p) $peta[$p['id']] = $p;
  foreach ($ids as $id) {
    $id = trim((string)$id);
    if ($id === '' || !isset($peta[$id])) continue;
    $out[] = array('id' => $id, 'nama' => $peta[$id]['nama'], 'jabatan' => $peta[$id]['jabatan']);
  }
  return $out;
}

/* Dipanggil modul Reservasi tepat sebelum menggambar kwitansi PDF.
   Inilah satu-satunya endpoint yang memulangkan gambar tanda tangan & cap,
   dan ia hanya melakukannya untuk reservasi yang kwitansinya SUDAH dibuat. */
function inv_berkas($resId) {
  inv_pastikan_tabel();
  $q = db()->prepare('SELECT * FROM `inv_kwitansi` WHERE `res_id`=:r');
  $q->execute(array(':r' => (string)$resId));
  $row = $q->fetch();
  if (!$row || $row['status'] !== 'DIBUAT') {
    return array('ada' => false);
  }
  $set  = inv_setting_baca();
  $baris = inv_baris($row);
  /* Gambar ditempelkan ke salinan nama/jabatan yang tersimpan di barisnya.
     Yang orangnya sudah dihapus dari daftar tetap tercetak NAMANYA, cuma
     tanpa gambar — lebih jujur daripada menjatuhkannya diam-diam dari
     dokumen yang sudah pernah dikirim ke tamu. */
  $peta = array();
  foreach (inv_penanda_daftar(true) as $p) $peta[$p['id']] = $p;
  $penanda = array();
  foreach ($baris['penanda'] as $p) {
    $pid = isset($p['id']) ? $p['id'] : '';
    $penanda[] = array(
      'nama'    => isset($p['nama']) ? $p['nama'] : '',
      'jabatan' => isset($p['jabatan']) ? $p['jabatan'] : '',
      'ttd'     => isset($peta[$pid]) ? $peta[$pid]['ttd'] : '',
    );
  }
  return array(
    'ada'       => true,
    'no'        => $row['no_invoice'],
    'putusOleh' => $row['putus_oleh'],
    'putusAt'   => (int)$row['putus_at'],
    'cap'       => $set['cap'],
    'penanda'   => $penanda,
  );
}
