<?php
/************************************************************************
 * STOCK — LOG AKTIVITAS (ordering + purchasing)
 * ---------------------------------------------------------------------
 * Satu baris = satu tindakan yang MENGUBAH sesuatu. Yang cuma dibaca
 * (buka halaman, ganti filter, cari) TIDAK dicatat: log yang penuh
 * kejadian tak berakibat adalah log yang berhenti dibaca, dan begitu ia
 * berhenti dibaca ia tidak lagi bisa menjawab "siapa yang mengubah ini".
 *
 * TABELNYA DIBUAT SENDIRI SAAT DIPAKAI (CREATE TABLE IF NOT EXISTS di
 * pur_log_siap), bukan lewat berkas migrasi. Alasannya konkret dan sudah
 * berulang di repo ini: migrasi manual berkali-kali tertinggal di
 * produksi, dan gejalanya endpoint membalas 500 sementara di dev semuanya
 * hijau. Fitur yang baru lahir tidak boleh menambah satu lagi langkah
 * manual yang bisa terlupa. Pola yang sama sudah dipakai jadwal-mysql.
 * Tabelnya tetap ditulis di schema.sql supaya pemasangan dari nol utuh.
 *
 * MENCATAT TIDAK BOLEH MENGGAGALKAN PEKERJAAN. Semua kesalahan di sini
 * ditelan dan dilaporkan sebagai {status:'success', dicatat:0}: order yang
 * gagal tersimpan karena log-nya bermasalah adalah kerugian yang jauh
 * lebih besar daripada satu baris jejak yang hilang.
 ************************************************************************/

function pur_log_siap($pdo) {
  static $sudah = false;
  if ($sudah) return true;
  $pdo->exec("CREATE TABLE IF NOT EXISTS `activity_log` (
    `id`      VARCHAR(64)  NOT NULL PRIMARY KEY,
    `waktu`   VARCHAR(30)  NOT NULL DEFAULT '',   -- 'YYYY-MM-DD HH:MM:SS' waktu server
    `tanggal` VARCHAR(20)  NOT NULL DEFAULT '',   -- YYYY-MM-DD, disaring per hari
    `modul`   VARCHAR(30)  NOT NULL DEFAULT '',   -- ordering | purchasing
    `aksi`    VARCHAR(40)  NOT NULL DEFAULT '',   -- kode pendek, mis. order_kirim
    `aktor`   VARCHAR(120) NOT NULL DEFAULT '',   -- nama orang
    `tim`     VARCHAR(40)  NOT NULL DEFAULT '',
    `ringkas` VARCHAR(500) NOT NULL DEFAULT '',   -- satu kalimat siap tampil
    `data`    LONGTEXT     NOT NULL,              -- rincian bebas, JSON
    KEY `idx_log_tgl` (`tanggal`),
    KEY `idx_log_modul` (`modul`),
    KEY `idx_log_aksi` (`aksi`)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
  $sudah = true;
  return true;
}

/* Id dibuat di SERVER, sebangun dengan pur_nomor_order/pur_batch_id.
   Enam heksa acak di ekor supaya dua catatan pada DETIK yang sama tetap
   beda — tanpa itu satu di antaranya hilang tertimpa PRIMARY KEY. */
function pur_log_id() {
  return 'LOG-' . date('ymd-His') . '-' . strtoupper(bin2hex(random_bytes(3)));
}

/* Tulis beberapa baris sekaligus. Frontend mengirimnya dalam satu tembakan
   supaya satu tindakan yang menyentuh 10 barang tidak jadi 10 permintaan. */
function pur_log_catat($pdo, $entri) {
  try {
    if (!is_array($entri) || !$entri) return ['status' => 'success', 'dicatat' => 0];
    pur_log_siap($pdo);
    $st = $pdo->prepare("INSERT INTO `activity_log`
      (`id`,`waktu`,`tanggal`,`modul`,`aksi`,`aktor`,`tim`,`ringkas`,`data`)
      VALUES (?,?,?,?,?,?,?,?,?)");
    $n = 0;
    foreach ($entri as $e) {
      if (!is_object($e)) continue;
      $modul = trim((string)($e->modul ?? ''));
      $aksi  = trim((string)($e->aksi  ?? ''));
      if ($modul === '' || $aksi === '') continue;   // baris tanpa identitas tidak berguna
      /* WAKTUNYA DARI SERVER, bukan dari client. Jam di HP kru sering
         meleset berjam-jam, dan log yang urutannya kacau tidak bisa dipakai
         menjawab "mana yang terjadi lebih dulu" — satu-satunya pertanyaan
         yang membuat log ini ada. */
      $waktu = date('Y-m-d H:i:s');
      $st->execute([
        pur_log_id(), $waktu, substr($waktu, 0, 10), $modul, $aksi,
        trim((string)($e->aktor ?? '')), trim((string)($e->tim ?? '')),
        mb_substr(trim((string)($e->ringkas ?? '')), 0, 500),
        json_encode($e->data ?? new stdClass, JSON_UNESCAPED_UNICODE)
      ]);
      $n++;
    }
    return ['status' => 'success', 'dicatat' => $n];
  } catch (Throwable $ex) {
    error_log('[stock/log] gagal mencatat: ' . $ex->getMessage());
    return ['status' => 'success', 'dicatat' => 0];   // sengaja: lihat catatan di kepala berkas
  }
}

/* Daftar log. Selalu dibatasi: tabel ini tumbuh terus, dan halaman yang
   menarik seluruh isinya akan makin lambat tiap minggu tanpa ada yang
   menyadari kapan mulainya. */
function pur_log_ambil($pdo, $dari = '', $ke = '', $modul = '', $cari = '', $limit = 300) {
  try {
    pur_log_siap($pdo);
    $sql = "SELECT * FROM `activity_log` WHERE 1=1";
    $par = [];
    if ($dari !== '') { $sql .= " AND `tanggal` >= ?"; $par[] = $dari; }
    if ($ke   !== '') { $sql .= " AND `tanggal` <= ?"; $par[] = $ke; }
    if ($modul!== '') { $sql .= " AND `modul` = ?";    $par[] = $modul; }
    if ($cari !== '') {
      $sql .= " AND (`ringkas` LIKE ? OR `aktor` LIKE ? OR `aksi` LIKE ?)";
      $k = '%' . $cari . '%'; $par[] = $k; $par[] = $k; $par[] = $k;
    }
    $limit = (int)$limit; if ($limit <= 0 || $limit > 2000) $limit = 300;
    // LIMIT tidak bisa jadi parameter terikat pada MySQL dengan
    // EMULATE_PREPARES=false, jadi angkanya disisipkan SESUDAH di-(int)-kan.
    $sql .= " ORDER BY `waktu` DESC, `id` DESC LIMIT " . $limit;
    $st = $pdo->prepare($sql);
    $st->execute($par);
    $out = [];
    foreach ($st->fetchAll() as $r) {
      $d = json_decode($r['data']);
      $out[] = [
        'id' => $r['id'], 'waktu' => $r['waktu'], 'tanggal' => $r['tanggal'],
        'modul' => $r['modul'], 'aksi' => $r['aksi'], 'aktor' => $r['aktor'],
        'tim' => $r['tim'], 'ringkas' => $r['ringkas'],
        'data' => is_object($d) || is_array($d) ? $d : new stdClass,
      ];
    }
    return $out;
  } catch (Throwable $ex) {
    error_log('[stock/log] gagal membaca: ' . $ex->getMessage());
    return [];
  }
}
