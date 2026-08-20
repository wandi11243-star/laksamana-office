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
}

function inv_uid($p) {
  return $p . dechex(time()) . substr(str_shuffle('abcdefghijklmnopqrstuvwxyz0123456789'), 0, 6);
}

function inv_setting_baca() {
  inv_pastikan_tabel();
  $out = array('ttd' => '', 'cap' => '', 'penandaNama' => '', 'penandaJabatan' => '', 'prefix' => 'INV');
  $st = db()->query('SELECT `k`,`v` FROM `inv_setting`');
  while ($row = $st->fetch()) {
    $out[$row['k']] = $row['v'] === null ? '' : $row['v'];
  }
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
  return array(
    'id'        => $row['id'],
    'resId'     => $row['res_id'],
    'no'        => $row['no_invoice'],
    'status'    => $row['status'],
    'ringkas'   => $ringkas,
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
    $u = $pdo->prepare('UPDATE `inv_kwitansi`
                        SET `status`=\'DIBUAT\', `no_invoice`=:n, `catatan`=:c,
                            `putus_oleh`=:o, `putus_at`=:t WHERE `id`=:i');
    $u->execute(array(':n' => $no, ':c' => $catatan, ':o' => $oleh, ':t' => inv_ms(), ':i' => $id));
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
  $set = inv_setting_baca();
  return array(
    'ada'            => true,
    'no'             => $row['no_invoice'],
    'putusOleh'      => $row['putus_oleh'],
    'putusAt'        => (int)$row['putus_at'],
    'ttd'            => $set['ttd'],
    'cap'            => $set['cap'],
    'penandaNama'    => $set['penandaNama'],
    'penandaJabatan' => $set['penandaJabatan'],
  );
}
