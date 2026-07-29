<?php
/************************************************************************
 * STOCK — Lapisan data MySQL
 * ---------------------------------------------------------------------
 * Kontrak dijaga SAMA PERSIS dengan Apps Script lama, termasuk balasan
 * {status:'success'} (bukan {ok:true} seperti modul lain) — frontend
 * memeriksa `resData.status === 'success'`.
 *
 * KENAPA ADA 4 BERKAS ENDPOINT (orders/vendors/items/users), bukan satu
 * api.php dengan ?src=:
 *   Frontend menempelkan cache-buster sendiri:
 *     fetch(`${appState.webAppUrlOrders}?t=${timestamp}`)
 *   Kalau URL-nya sudah membawa `?src=orders`, hasilnya
 *   `api.php?src=orders?t=123` — tanda tanya dobel, parameter rusak.
 *   Jadi tiap sumber WAJIB punya path sendiri.
 *
 * ATURAN JSON: selalu decode TANPA flag assoc. json_decode('{}', true)
 * dan json_decode('[]', true) sama-sama menghasilkan [] — bedanya hilang
 * permanen, dan peta kosong yang kembali sebagai Array bikin data hilang
 * diam-diam saat simpan berikutnya. (Pelajaran dari modul HR.)
 ************************************************************************/

function pur_pdo() {
  $dsn = 'mysql:host=' . DB_HOST . ';port=' . DB_PORT . ';dbname=' . DB_NAME . ';charset=' . DB_CHARSET;
  return new PDO($dsn, DB_USER, DB_PASS, [
    PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    PDO::ATTR_EMULATE_PREPARES   => false,
  ]);
}

function pur_json($arr, $kode = 200) {
  http_response_code($kode);
  header('Content-Type: application/json; charset=utf-8');
  header('Cache-Control: no-store');
  echo json_encode($arr, JSON_UNESCAPED_UNICODE);
  exit;
}

/* Token opsional. Jujur: kalau diisi, token itu ikut terkirim ke browser
   di dalam index.html — dia menyaring permintaan asal-asalan, bukan
   menahan orang yang niat. Penjaga sebenarnya gerbang SSO Office. */
function pur_cek_token($body = null) {
  if (!defined('API_TOKEN') || API_TOKEN === '') return;
  $t = $_GET['token'] ?? ($body && isset($body->token) ? $body->token : '');
  if (!is_string($t) || !hash_equals(API_TOKEN, $t)) {
    pur_json(['status' => 'error', 'message' => 'token salah'], 403);
  }
}

/* Baca body POST. text/plain (simple request) supaya tidak kena preflight
   CORS — sama seperti Apps Script lama. */
function pur_body() {
  $mentah = file_get_contents('php://input');
  $b = json_decode($mentah);          // tanpa assoc — lihat catatan di atas
  return is_object($b) ? $b : null;
}

// =====================================================================
// ORDERS
// =====================================================================

/* Susun ulang record order persis seperti bentuk balasan Apps Script:
   frontend membaca rowIndex/nomorOrder/timestamp/... apa adanya.
   `data` adalah sumber kebenaran; kolom inti cuma untuk query. */
function pur_order_dari_baris($r) {
  $o = json_decode($r['data']);
  if (!is_object($o)) $o = (object)[];
  // Kolom inti menang atas isi `data` supaya hasil UPDATE (mis. archive)
  // langsung terlihat tanpa perlu menulis ulang JSON-nya.
  $o->rowIndex   = (int)$r['row_index'];
  $o->nomorOrder = $r['nomor_order'];
  $o->timestamp  = $r['waktu'];
  $o->item       = $r['item'];
  $o->qty        = (float)$r['qty'];
  $o->unit       = $r['unit'];
  $o->tglDatang  = $r['tgl_datang'];
  $o->pic        = $r['pic'];
  $o->status     = $r['status'];
  $o->kedatangan = $r['kedatangan'];
  // Kolom batch belum tentu ada saat kode ini jalan di database yang belum
  // dimigrasi (lihat migrasi-2026-07-18-batch.sql). Jangan sampai seluruh
  // modul mati cuma karena ALTER belum dijalankan — jatuhkan ke '' saja,
  // yang artinya "order pra-batch" dan sudah ditangani frontend.
  $o->batchId    = $r['batch_id']   ?? '';
  $o->batchName  = $r['batch_name'] ?? '';
  $o->tim        = $r['tim']        ?? '';
  return $o;
}

function pur_orders_ambil($pdo) {
  $rows = $pdo->query("SELECT * FROM `orders` ORDER BY `row_index`")->fetchAll();
  return array_map('pur_order_dari_baris', $rows);
}

/* Nomor order dibuat di SERVER, bukan client. Apps Script lama juga begitu.
   Bentuknya ditiru dari data live: LKS-260716-232937-KEW-682
   = LKS - tgl(yymmdd) - jam(HHMMSS) - 3 huruf item - urutan. */
function pur_nomor_order($item, $urut) {
  $kode = strtoupper(substr(preg_replace('/[^A-Za-z]/', '', $item) ?: 'XXX', 0, 3));
  if ($kode === '') $kode = 'XXX';
  return 'LKS-' . date('ymd') . '-' . date('His') . '-' . str_pad($kode, 3, 'X') . '-' . $urut;
}

/* Huruf kecil yang aman untuk UTF-8, TAPI tidak menuntut ekstensi mbstring.
   Tidak ada satu pun mb_* lain di modul ini, jadi memakainya begitu saja
   berarti mempertaruhkan fatal error di hosting yang tidak memasangnya —
   dan yang mati bukan cuma fitur batch, melainkan seluruh endpoint orders.
   Nama item di data live semuanya ASCII, jadi strtolower sudah cukup;
   mb_strtolower dipakai kalau kebetulan tersedia. */
function pur_lower($s) {
  return function_exists('mb_strtolower') ? mb_strtolower($s, 'UTF-8') : strtolower($s);
}

/* Id batch dibuat di SERVER, sebangun dengan pur_nomor_order:
   BATCH-260718-232937-4F2A. Empat heksa acak di ekor supaya dua batch yang
   dibuat pada DETIK yang sama tetap beda — tanpa itu, dua kru yang menekan
   kirim bersamaan akan menempel jadi satu batch. */
function pur_batch_id() {
  return 'BATCH-' . date('ymd') . '-' . date('His') . '-' . strtoupper(bin2hex(random_bytes(2)));
}

/**
 * DAFTAR BATCH AKTIF yang boleh digabungi, disaring per TIM.
 *
 * Yang TIDAK ikut, dan alasannya:
 *  - status 'Arsip'            -> sudah selesai, menambah item ke sana tidak berarti.
 *  - batch_id ''               -> 682 order lama pra-batch; tidak punya identitas
 *                                 untuk digabungi (lihat migrasi-2026-07-18-batch.sql).
 *  - batch yang sudah ada item 'Datang' -> penerimaannya sedang/sudah berjalan.
 *    Menyisipkan item baru ke batch yang sedang di-check-in membuat kru
 *    menerima barang yang tidak ada di kertas yang mereka pegang.
 *
 * $tim kosong = jangan saring per tim (dipakai admin / order tanpa keterangan).
 *
 * $tgl (YYYY-MM-DD) menyaring ke SATU tanggal kedatangan saja. Kru memilih
 * tanggal di form lebih dulu, jadi batch di tanggal lain tidak pernah jadi
 * tujuan yang masuk akal — menampilkannya cuma memancing salah pilih. Efek
 * sampingnya bagus: karena tanggal batch tujuan selalu sama dengan tanggal di
 * form, penggabungan tidak pernah lagi diam-diam memindahkan tanggal order.
 */
function pur_orders_batches($pdo, $tim = '', $tgl = '') {
  $sql = "SELECT `batch_id`, `batch_name`, `tgl_datang`, `tim`,
                 MIN(`pic`)   AS pic,
                 MIN(`waktu`) AS waktu,
                 COUNT(*)     AS jml_item,
                 SUM(CASE WHEN `kedatangan` = 'Datang' THEN 1 ELSE 0 END) AS jml_datang
          FROM `orders`
          WHERE `status` = 'Aktif' AND `batch_id` <> ''";
  $par = [];
  if ($tim !== '') { $sql .= " AND `tim` = ?";        $par[] = $tim; }
  if ($tgl !== '') { $sql .= " AND `tgl_datang` = ?"; $par[] = $tgl; }
  $sql .= " GROUP BY `batch_id`, `batch_name`, `tgl_datang`, `tim`
            HAVING jml_datang = 0
            ORDER BY `tgl_datang` ASC, waktu ASC";

  $st = $pdo->prepare($sql);
  $st->execute($par);

  $out = [];
  foreach ($st->fetchAll() as $r) {
    $out[] = [
      'batchId'   => $r['batch_id'],
      'batchName' => $r['batch_name'],
      'tglDatang' => $r['tgl_datang'],
      'tim'       => $r['tim'],
      'pic'       => $r['pic'],
      'waktu'     => $r['waktu'],
      'jmlItem'   => (int)$r['jml_item'],
    ];
  }
  return $out;
}

/**
 * SIMPAN SATU PENGAJUAN ORDER.
 *
 * Dua mode, ditentukan oleh $meta->batchId:
 *   kosong  -> BATCH BARU. Id dibuat di sini, tglDatang diambil dari payload.
 *   terisi  -> GABUNG ke batch yang sudah ada.
 *
 * Saat menggabung, dua hal sengaja terjadi:
 *
 *  1. TANGGAL BATCH TUJUAN MENANG atas tanggal yang diketik di form. Satu batch
 *     = satu kedatangan; membiarkan dua tanggal di dalam satu batch akan
 *     memecahnya kembali jadi dua kartu di halaman check-in, sehingga
 *     "menggabungkan" tidak menggabungkan apa pun.
 *
 *  2. ITEM YANG SAMA DIJUMLAHKAN, bukan jadi baris kedua (permintaan poin 3).
 *     Pencocokan pakai LOWER(item) supaya "Ayam Paha" dan "ayam paha" tetap
 *     bertemu. Satuan yang berbeda TIDAK dijumlahkan — 2 Kg + 3 Pcs bukan 5
 *     apa pun — baris seperti itu tetap masuk sebagai baris baru.
 */
function pur_orders_batch($pdo, $orders, $meta = null) {
  if (!is_array($orders) || !$orders) return ['status' => 'error', 'message' => 'orders kosong'];
  if (!is_object($meta)) $meta = (object)[];

  $batchId   = trim((string)($meta->batchId   ?? ''));
  $batchName = trim((string)($meta->batchName ?? ''));   // opsional — poin 4
  $tim       = trim((string)($meta->tim       ?? ''));

  $pdo->beginTransaction();
  try {
    // Kunci tabel supaya dua kru yang memesan bersamaan tidak dapat
    // row_index / urutan yang sama. Tanpa ini, keduanya membaca MAX() yang
    // sama lalu salah satu gagal (row_index UNIQUE) atau saling menimpa.
    $maxRow = (int)$pdo->query("SELECT COALESCE(MAX(`row_index`), 1) m FROM `orders` FOR UPDATE")->fetch()['m'];
    $jml    = (int)$pdo->query("SELECT COUNT(*) c FROM `orders`")->fetch()['c'];

    // --- Mode gabung: baca batch tujuan dan baris-barisnya sekali di depan ---
    $adaBaris = [];      // lower(item) => baris existing
    $gabung   = false;
    if ($batchId !== '') {
      $st = $pdo->prepare("SELECT * FROM `orders`
                           WHERE `batch_id` = ? AND `status` = 'Aktif' FOR UPDATE");
      $st->execute([$batchId]);
      $baris = $st->fetchAll();
      if (!$baris) {
        // Batch hilang di antara saat frontend memuat daftar dan saat kirim
        // (diarsipkan orang lain, atau sudah mulai diterima). Menolak lebih
        // baik daripada diam-diam membuat batch baru dengan id yang tidak ada.
        $pdo->rollBack();
        return ['status' => 'error', 'message' => 'batch tujuan tidak ditemukan atau sudah tidak aktif'];
      }
      $gabung = true;
      foreach ($baris as $b) $adaBaris[pur_lower($b['item'])] = $b;
      $b0        = $baris[0];
      $batchName = $b0['batch_name'] ?? $batchName;
      if ($tim === '') $tim = $b0['tim'] ?? '';
    } else {
      $batchId = pur_batch_id();
    }

    $stIns = $pdo->prepare("INSERT INTO `orders`
      (`nomor_order`,`row_index`,`waktu`,`item`,`qty`,`unit`,`tgl_datang`,`pic`,`status`,`kedatangan`,`batch_id`,`batch_name`,`tim`,`data`)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)");
    $stUpd = $pdo->prepare("UPDATE `orders` SET `qty` = ?, `data` = ? WHERE `nomor_order` = ?");

    $dibuat    = [];
    $digabung  = [];
    foreach ($orders as $o) {
      if (!is_object($o)) continue;
      $item = (string)($o->item ?? '');
      if ($item === '') continue;
      $qty   = isset($o->qty) ? (float)$o->qty : 0;
      $unit  = (string)($o->unit ?? '');
      $waktu = date('Y-m-d H:i:s');

      // Tanggal batch tujuan menang saat menggabung — lihat catatan (1) di atas.
      $tgl = $gabung ? ($b0['tgl_datang'] ?? '-') : (string)($o->tglDatang ?? '-');

      // --- (2) item sama + satuan sama -> jumlahkan ke baris yang sudah ada ---
      $kunci = pur_lower($item);
      if ($gabung && isset($adaBaris[$kunci]) && $adaBaris[$kunci]['unit'] === $unit) {
        $lama    = $adaBaris[$kunci];
        $qtyBaru = (float)$lama['qty'] + $qty;

        $rec = json_decode($lama['data']);
        if (!is_object($rec)) $rec = (object)[];
        $rec->qty = $qtyBaru;
        // Catatan baris baru ikut dilampirkan, jangan dibuang: itu satu-satunya
        // jejak bahwa penambahan ini pernah diminta terpisah.
        $noteBaru = isset($o->note) && $o->note !== '' && $o->note !== '-' ? (string)$o->note : '';
        if ($noteBaru !== '') {
          $noteLama = isset($rec->note) && $rec->note !== '-' ? (string)$rec->note : '';
          $rec->note = $noteLama === '' ? $noteBaru : ($noteLama . ' | ' . $noteBaru);
        }
        $stUpd->execute([$qtyBaru, json_encode($rec, JSON_UNESCAPED_UNICODE), $lama['nomor_order']]);

        // Perbarui salinan di memori supaya dua baris form dengan item yang
        // sama dalam SATU kiriman juga menumpuk ke baris yang sama.
        $adaBaris[$kunci]['qty']  = $qtyBaru;
        $adaBaris[$kunci]['data'] = json_encode($rec, JSON_UNESCAPED_UNICODE);
        $digabung[] = ['item' => $item, 'qty' => $qtyBaru, 'unit' => $unit];
        continue;
      }

      $urut  = $jml + count($dibuat) + 1;
      $nomor = pur_nomor_order($item, $urut);
      $row   = $maxRow + count($dibuat) + 1;

      $rec = (object)[
        'rowIndex'   => $row,
        'nomorOrder' => $nomor,
        'timestamp'  => $waktu,
        'item'       => $item,
        'qty'        => $qty,
        'unit'       => $unit,
        'note'       => isset($o->note) && $o->note !== '' ? $o->note : '-',
        'tglDatang'  => $tgl,
        'pic'        => (string)($o->pic ?? ''),
        'status'     => 'Aktif',
        'kedatangan' => '',
        'catatan'    => '',
        'batchId'    => $batchId,
        'batchName'  => $batchName,
        'tim'        => $tim,
      ];
      $stIns->execute([$nomor, $row, $waktu, $item, $rec->qty, $rec->unit,
                       $tgl, $rec->pic, 'Aktif', '',
                       $batchId, $batchName, $tim,
                       json_encode($rec, JSON_UNESCAPED_UNICODE)]);
      $dibuat[] = $rec;
      $adaBaris[$kunci] = ['nomor_order' => $nomor, 'item' => $item, 'qty' => $qty,
                          'unit' => $unit, 'data' => json_encode($rec, JSON_UNESCAPED_UNICODE)];
    }

    $pdo->commit();
    return ['status'    => 'success',
            'created'   => count($dibuat),
            'merged'    => count($digabung),
            'batchId'   => $batchId,
            'batchName' => $batchName,
            'orders'    => $dibuat,
            'mergedItems' => $digabung];
  } catch (Exception $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    throw $e;
  }
}

/**
 * IMPOR order dari data lama (migrasi Apps Script -> MySQL).
 *
 * Beda dari batchOrder: ini MEMPERTAHANKAN nomor_order, row_index, timestamp,
 * DAN status (Aktif/Arsip) apa adanya — batchOrder mengarang nomor baru dan
 * memaksa semua jadi 'Aktif', yang akan membuat 680 order arsip lama tampil
 * seolah masih aktif.
 *
 * Idempoten: ON DUPLICATE KEY UPDATE, jadi jalan kedua kali menimpa baris yang
 * sama (berdasar nomor_order) — bukan menggandakan. Aman diulang, dan aman
 * dijalankan di dev lalu di prod dengan data yang sama.
 *
 * BUKAN untuk dipakai frontend sehari-hari — hanya alat migrasi. Tidak
 * mengubah data yang tidak ada di payload (tidak menghapus).
 */
function pur_orders_import($pdo, $orders) {
  if (!is_array($orders) || !$orders) return ['status' => 'error', 'message' => 'orders kosong'];

  $pdo->beginTransaction();
  try {
    $st = $pdo->prepare("INSERT INTO `orders`
      (`nomor_order`,`row_index`,`waktu`,`item`,`qty`,`unit`,`tgl_datang`,`pic`,`status`,`kedatangan`,`data`)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)
      ON DUPLICATE KEY UPDATE
        `row_index`=VALUES(`row_index`), `waktu`=VALUES(`waktu`), `item`=VALUES(`item`),
        `qty`=VALUES(`qty`), `unit`=VALUES(`unit`), `tgl_datang`=VALUES(`tgl_datang`),
        `pic`=VALUES(`pic`), `status`=VALUES(`status`), `kedatangan`=VALUES(`kedatangan`),
        `data`=VALUES(`data`)");

    $n = 0; $lewat = 0; $rowFallback = 100000;
    foreach ($orders as $o) {
      if (!is_object($o)) { $lewat++; continue; }
      $nomor = (string)($o->nomorOrder ?? '');
      if ($nomor === '') { $lewat++; continue; }   // tanpa nomor, tak ada identitas

      // row_index tetap NOT NULL + UNIQUE. Kalau data lama tak punya, beri
      // angka tinggi yang tak bentrok dengan data operasional (yang mulai kecil).
      $row = isset($o->rowIndex) && is_numeric($o->rowIndex) ? (int)$o->rowIndex : ++$rowFallback;

      // `data` = seluruh objek asli apa adanya (sumber kebenaran, note/catatan utuh).
      $st->execute([
        $nomor, $row,
        (string)($o->timestamp ?? ''), (string)($o->item ?? ''),
        isset($o->qty) ? (float)$o->qty : 0, (string)($o->unit ?? ''),
        (string)($o->tglDatang ?? ''), (string)($o->pic ?? ''),
        (string)($o->status ?? 'Aktif'), (string)($o->kedatangan ?? ''),
        json_encode($o, JSON_UNESCAPED_UNICODE),
      ]);
      $n++;
    }
    $pdo->commit();
    return ['status' => 'success', 'imported' => $n, 'skipped' => $lewat];
  } catch (Exception $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    throw $e;
  }
}

/**
 * Ubah status arsip.
 *
 * Menerima DUA cara menunjuk order:
 *   - orderIds: ['LKS-...'] -> lewat nomor order. DIUTAMAKAN.
 *   - rows: [12]            -> lewat row_index, untuk kecocokan dengan
 *                              pemanggilan lama.
 *
 * Kenapa nomor order diutamakan: row_index itu POSISI, bukan identitas.
 * Frontend punya satu jalur (mode offline) yang mengarang rowIndex dari
 * `appState.orders.length + 2`. Angka karangan itu bisa menunjuk order
 * lain yang sah — dan yang terarsip jadi order yang salah, tanpa error.
 * Nomor order tidak punya masalah itu.
 */
function pur_orders_arsip($pdo, $body, $status) {
  $ids  = (isset($body->orderIds) && is_array($body->orderIds)) ? $body->orderIds : [];
  $rows = [];
  if (isset($body->rows) && is_array($body->rows))      $rows = $body->rows;
  elseif (isset($body->rowIndex))                        $rows = [$body->rowIndex];

  $n = 0;
  if ($ids) {
    $ph = implode(',', array_fill(0, count($ids), '?'));
    $st = $pdo->prepare("UPDATE `orders` SET `status`=? WHERE `nomor_order` IN ($ph)");
    $st->execute(array_merge([$status], array_map('strval', $ids)));
    $n = $st->rowCount();
  } elseif ($rows) {
    $rows = array_values(array_filter(array_map('intval', $rows), fn($x) => $x > 0));
    if (!$rows) return ['status' => 'error', 'message' => 'rows kosong'];
    $ph = implode(',', array_fill(0, count($rows), '?'));
    $st = $pdo->prepare("UPDATE `orders` SET `status`=? WHERE `row_index` IN ($ph)");
    $st->execute(array_merge([$status], $rows));
    $n = $st->rowCount();
  } else {
    return ['status' => 'error', 'message' => 'tidak ada order yang ditunjuk'];
  }

  // Selaraskan `data` JSON dengan kolom status, supaya keduanya tidak
  // berbeda kalau nanti ada yang membaca JSON-nya langsung.
  $pdo->exec("UPDATE `orders` SET `data` = JSON_SET(`data`, '$.status', `status`)
              WHERE JSON_VALID(`data`)");

  return ['status' => 'success', 'updated' => $n];
}

// =====================================================================
// AKSI DARI MODUL ORDERING (stock/ordering)
// ---------------------------------------------------------------------
// Ordering adalah tampilan KEDUA di atas tabel `orders` yang sama. Ketiga
// aksi ini dulunya ditangani Apps Script yang dipakai bareng purchasing.
// Semua berbasis row_index (Sheet lama tidak punya konsep lain); di MySQL
// row_index tetap UNIQUE jadi tetap bisa jadi penunjuk yang sah.
//
// `data` JSON selalu diselaraskan dengan kolom inti supaya pembaca JSON
// (mis. order lain yang membaca lewat purchasing) melihat nilai yang sama.
// =====================================================================

/* Check-in kedatangan: tandai barang datang + catat jumlah aktual.
   Payload: {action:'updateKedatangan', updates:[{rowIndex, kedatangan, catatanAktual}]}
   catatanAktual = jumlah yang benar-benar datang (disimpan di kolom `catatan`
   lewat `data`, mengikuti perilaku Sheet lama). */
function pur_orders_update_kedatangan($pdo, $updates) {
  if (!is_array($updates) || !$updates) return ['status' => 'error', 'message' => 'updates kosong'];

  $pdo->beginTransaction();
  try {
    // JSON_SET memperlakukan parameter STRING sebagai JSON string otomatis —
    // tidak perlu CAST AS JSON (yang tadi memicu error server) atau json_encode.
    $st = $pdo->prepare(
      "UPDATE `orders`
         SET `kedatangan` = ?,
             `data` = JSON_SET(IF(JSON_VALID(`data`), `data`, '{}'),
                        '$.kedatangan', ?, '$.catatan', ?)
       WHERE `row_index` = ?");
    $n = 0;
    foreach ($updates as $u) {
      if (!is_object($u) || !isset($u->rowIndex)) continue;
      $row  = (int)$u->rowIndex;
      if ($row <= 0) continue;
      $kdt  = (string)($u->kedatangan ?? '');
      // catatanAktual bisa angka atau teks; disimpan apa adanya sebagai string.
      $cat  = isset($u->catatanAktual) ? (string)$u->catatanAktual : '';
      $st->execute([$kdt, $kdt, $cat, $row]);
      $n += $st->rowCount();
    }
    $pdo->commit();
    return ['status' => 'success', 'updated' => $n];
  } catch (Exception $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    throw $e;
  }
}

/* Ubah jumlah satu order. Payload: {action:'updateOrderQty', rowIndex, newQty} */
function pur_orders_update_qty($pdo, $rowIndex, $newQty) {
  $row = (int)$rowIndex;
  if ($row <= 0) return ['status' => 'error', 'message' => 'rowIndex tidak sah'];
  if (!is_numeric($newQty)) return ['status' => 'error', 'message' => 'newQty bukan angka'];
  $qty = (float)$newQty;

  $st = $pdo->prepare(
    "UPDATE `orders`
       SET `qty` = ?,
           `data` = JSON_SET(IF(JSON_VALID(`data`), `data`, '{}'), '$.qty', ?)
     WHERE `row_index` = ?");
  $st->execute([$qty, $qty, $row]);
  return ['status' => 'success', 'updated' => $st->rowCount()];
}

/* Hapus satu order. Payload: {action:'deleteRow', rowIndex}
   Beda dari 'archive': ini benar-benar MENGHAPUS baris, sesuai perilaku
   tombol hapus di ordering. */
function pur_orders_delete_row($pdo, $rowIndex) {
  $row = (int)$rowIndex;
  if ($row <= 0) return ['status' => 'error', 'message' => 'rowIndex tidak sah'];
  $st = $pdo->prepare("DELETE FROM `orders` WHERE `row_index` = ?");
  $st->execute([$row]);
  return ['status' => 'success', 'deleted' => $st->rowCount()];
}

// =====================================================================
// VENDORS — peta berkunci NAMA
// =====================================================================
function pur_vendors_ambil($pdo) {
  $out = [];
  foreach ($pdo->query("SELECT `nama`, `data` FROM `vendors` ORDER BY `nama`")->fetchAll() as $r) {
    $v = json_decode($r['data']);
    $out[$r['nama']] = is_object($v) ? $v : (object)['whatsapp' => ''];
  }
  // (object) supaya peta kosong terkirim sebagai {} bukan [] — lihat
  // catatan aturan JSON di kepala berkas.
  return (object)$out;
}

function pur_vendor_simpan($pdo, $nama, $telp, $namaLama = '') {
  $nama = trim((string)$nama);
  if ($nama === '') return ['status' => 'error', 'message' => 'nama vendor kosong'];
  $rec = (object)['whatsapp' => (string)$telp];

  $pdo->beginTransaction();
  try {
    // Ganti nama: hapus yang lama, lalu tulis yang baru. Produk yang
    // menunjuk vendor lama SENGAJA tidak ikut diubah — nama vendor di
    // produk memang teks bebas, dan di data live ada 5 produk yang sudah
    // menunjuk vendor tak terdaftar. Menyentuhnya di sini akan mengubah
    // data yang tidak diminta.
    $namaLama = trim((string)$namaLama);
    if ($namaLama !== '' && $namaLama !== $nama) {
      $pdo->prepare("DELETE FROM `vendors` WHERE `nama`=?")->execute([$namaLama]);
    }
    $pdo->prepare("INSERT INTO `vendors` (`nama`,`whatsapp`,`data`) VALUES (?,?,?)
                   ON DUPLICATE KEY UPDATE `whatsapp`=VALUES(`whatsapp`), `data`=VALUES(`data`)")
        ->execute([$nama, (string)$telp, json_encode($rec, JSON_UNESCAPED_UNICODE)]);
    $pdo->commit();
    return ['status' => 'success'];
  } catch (Exception $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    throw $e;
  }
}

function pur_vendor_hapus($pdo, $nama) {
  $st = $pdo->prepare("DELETE FROM `vendors` WHERE `nama`=?");
  $st->execute([(string)$nama]);
  return ['status' => 'success', 'deleted' => $st->rowCount()];
}

// =====================================================================
// PRODUCTS — peta berkunci NAMA
// =====================================================================
function pur_products_ambil($pdo) {
  $out = [];
  foreach ($pdo->query("SELECT `nama`, `data` FROM `products` ORDER BY `nama`")->fetchAll() as $r) {
    $p = json_decode($r['data']);
    if (!is_object($p)) $p = (object)['utama' => '', 'cadangan' => []];
    // cadangan HARUS array — kalau jadi objek, frontend .map() meledak.
    if (!isset($p->cadangan) || !is_array($p->cadangan)) $p->cadangan = [];
    // satuan: daftar satuan yang SAH untuk bahan ini. Array kosong = belum
    // ditentukan, dan frontend memaknainya sebagai "semua satuan boleh" —
    // supaya 237 produk lama tidak mendadak jadi tak bisa dipesan.
    if (!isset($p->satuan) || !is_array($p->satuan)) $p->satuan = [];
    // kategori: kelompok bahan (DRY ITEM, CHILLER, FRESH, dst) untuk Daily SO.
    // '' = belum dikelompokkan; Daily SO menaruhnya di "Belum dikategori".
    if (!isset($p->kategori) || !is_string($p->kategori)) $p->kategori = '';
    // area: lokasi hitung — 'Bar' | 'Kitchen' | 'Umum'/'' (dipakai kedua tempat).
    // Daily SO menyaring item menurut area supaya Bar tidak melihat item Kitchen.
    if (!isset($p->area) || !is_string($p->area)) $p->area = '';
    // sumber: '' = bahan vendor (perilaku lama), 'ck' = produksi Central
    // Kitchen. packIsi/packSatuan hanya berarti untuk yang 'ck'; dinormalkan
    // di sini supaya frontend tidak perlu memeriksa tipenya tiap pemakaian.
    if (!isset($p->sumber) || !is_string($p->sumber)) $p->sumber = '';
    $p->packIsi = isset($p->packIsi) ? (float)$p->packIsi : 0;
    if (!isset($p->packSatuan) || !is_string($p->packSatuan)) $p->packSatuan = '';
    $out[$r['nama']] = $p;
  }
  return (object)$out;
}

/* $caraBeli: '' | 'online' | 'jemput'
   Cara barang ini diperoleh. 'jemput' = harus diambil sendiri ke tokonya,
   'online' = dikirim/dipesan daring, '' = belum ditentukan. Dipakai modul
   Ordering untuk memberi tahu tim barang mana yang perlu dijemput hari itu,
   supaya tidak perlu bertanya ke orang yang tahu. Sama seperti `kategori` dan
   `area`: ikut di dalam blob `data`, jadi TIDAK perlu migrasi tabel. */
/* CENTRAL KITCHEN — barang produksi dapur sendiri.
   Disimpan di tabel `products` yang SAMA dengan bahan vendor, dibedakan
   `sumber`='ck'. Bukan tabel terpisah: kalau terpisah, form order, check-in,
   dan daftar jemput masing-masing harus tahu dua sumber data dan
   menggabungkannya di tiap layar — tiga tempat baru yang bisa lupa
   digabung. Satu tabel + satu penanda membuat semua jalur yang sudah ada
   berlaku apa adanya, dan pemisahannya cukup dilakukan di layar.

   packIsi + packSatuan = isi satu pack, mis. 1 Pack = 500 Gram. Itulah yang
   membuat "2 Pack" dan "1000 Gram" bisa dijumlah jadi satu saldo. */
function pur_product_simpan($pdo, $nama, $utama, $cadangan, $namaLama = '', $satuan = null, $kategori = null, $area = null, $caraBeli = null, $sumber = null, $packIsi = null, $packSatuan = null) {
  $nama = trim((string)$nama);
  if ($nama === '') return ['status' => 'error', 'message' => 'nama produk kosong'];

  // backupVendors bisa datang sebagai array atau teks dipisah koma.
  if (is_string($cadangan)) {
    $cadangan = array_values(array_filter(array_map('trim', explode(',', $cadangan)), fn($s) => $s !== ''));
  }
  if (!is_array($cadangan)) $cadangan = [];
  $cadangan = array_values(array_map('strval', $cadangan));

  /* SATUAN yang sah untuk bahan ini (boleh lebih dari satu, mis. Kg & Pack).
     null = pemanggil TIDAK menyertakan field ini sama sekali -> pertahankan
     nilai lama, jangan dikosongkan. Ini penting: kalau ada jalur lama yang
     masih menyimpan produk tanpa mengirim `satuan`, tanpa penjagaan ini
     daftar satuan yang sudah disusun akan terhapus diam-diam. */
  /* satuan DAN kategori sama-sama "preserve-if-null": null berarti pemanggil
     tidak menyertakan field itu, jadi pertahankan nilai lama. Keduanya dibaca
     dari baris lama dalam SATU query supaya tidak menembak DB dua kali. */
  $satuanLama = [];
  $kategoriLama = '';
  $areaLama = '';
  $caraBeliLama = '';
  $sumberLama = '';
  $packIsiLama = 0;
  $packSatuanLama = '';
  if ($satuan === null || $kategori === null || $area === null || $caraBeli === null
      || $sumber === null || $packIsi === null || $packSatuan === null) {
    $st = $pdo->prepare("SELECT `data` FROM `products` WHERE `nama`=?");
    $st->execute([$namaLama !== '' ? $namaLama : $nama]);
    $row = $st->fetch();
    if ($row) {
      $lama = json_decode($row['data']);
      if (is_object($lama) && isset($lama->satuan) && is_array($lama->satuan)) $satuanLama = $lama->satuan;
      if (is_object($lama) && isset($lama->kategori) && is_string($lama->kategori)) $kategoriLama = $lama->kategori;
      if (is_object($lama) && isset($lama->area) && is_string($lama->area)) $areaLama = $lama->area;
      if (is_object($lama) && isset($lama->caraBeli) && is_string($lama->caraBeli)) $caraBeliLama = $lama->caraBeli;
      if (is_object($lama) && isset($lama->sumber) && is_string($lama->sumber)) $sumberLama = $lama->sumber;
      if (is_object($lama) && isset($lama->packIsi)) $packIsiLama = (float)$lama->packIsi;
      if (is_object($lama) && isset($lama->packSatuan) && is_string($lama->packSatuan)) $packSatuanLama = $lama->packSatuan;
    }
  }
  if ($satuan === null)     $satuan = $satuanLama;
  if ($kategori === null)   $kategori = $kategoriLama;
  if ($area === null)       $area = $areaLama;
  if ($caraBeli === null)   $caraBeli = $caraBeliLama;
  if ($sumber === null)     $sumber = $sumberLama;
  if ($packIsi === null)    $packIsi = $packIsiLama;
  if ($packSatuan === null) $packSatuan = $packSatuanLama;

  if (is_string($satuan)) {
    $satuan = array_values(array_filter(array_map('trim', explode(',', $satuan)), fn($s) => $s !== ''));
  }
  if (!is_array($satuan)) $satuan = [];
  // Buang duplikat & nilai kosong: dua "Kg" di satu bahan tidak berarti apa-apa.
  $satuan = array_values(array_unique(array_filter(array_map(fn($s) => trim((string)$s), $satuan), fn($s) => $s !== '')));

  $kategori = trim((string)$kategori);
  $area     = trim((string)$area);
  // Hanya dua nilai yang berarti; apa pun selain itu disimpan sebagai ''
  // (belum ditentukan), bukan diteruskan apa adanya. Daftar "perlu dijemput"
  // dibangun dari kolom ini, jadi nilai asing di sini berarti barang yang
  // tidak pernah masuk daftar mana pun dan tidak ada yang tahu kenapa.
  $caraBeli = strtolower(trim((string)$caraBeli));
  if ($caraBeli !== 'online' && $caraBeli !== 'jemput') $caraBeli = '';

  /* SUMBER: '' = bahan dari vendor (perilaku lama, berlaku untuk ratusan
     bahan yang sudah ada), 'ck' = barang produksi Central Kitchen. Nilai
     asing dibuang jadi '' — bukan diteruskan apa adanya, karena daftar
     barang CK dibangun dari kolom ini dan nilai yang tidak dikenal berarti
     barang yang tidak masuk daftar mana pun tanpa ada yang tahu kenapa. */
  $sumber = strtolower(trim((string)$sumber));
  if ($sumber !== 'ck') $sumber = '';

  $packIsi    = (float)$packIsi;
  $packSatuan = trim((string)$packSatuan);
  if ($sumber !== 'ck') { $packIsi = 0; $packSatuan = ''; }   // pack cuma berarti untuk barang CK
  if ($packIsi < 0) $packIsi = 0;

  /* Satuan barang CK DIPAKSA jadi [Pack, satuan dasar], bukan dibiarkan
     mengikuti centang di layar. Alasannya: konversi saldo cuma mengenal dua
     satuan itu; satuan ketiga yang lolos ke form order akan tercatat sebagai
     angka yang tidak bisa dijumlahkan ke saldo mana pun, dan baru ketahuan
     saat saldonya sudah telanjur salah. */
  if ($sumber === 'ck' && $packSatuan !== '') {
    $satuan = $packIsi > 0 ? ['Pack', $packSatuan] : [$packSatuan];
  }

  $rec = (object)['utama' => (string)$utama, 'cadangan' => $cadangan, 'satuan' => $satuan,
                  'kategori' => $kategori, 'area' => $area, 'caraBeli' => $caraBeli,
                  'sumber' => $sumber, 'packIsi' => $packIsi, 'packSatuan' => $packSatuan];

  $pdo->beginTransaction();
  try {
    $namaLama = trim((string)$namaLama);
    if ($namaLama !== '' && $namaLama !== $nama) {
      $pdo->prepare("DELETE FROM `products` WHERE `nama`=?")->execute([$namaLama]);
    }
    $pdo->prepare("INSERT INTO `products` (`nama`,`utama`,`data`) VALUES (?,?,?)
                   ON DUPLICATE KEY UPDATE `utama`=VALUES(`utama`), `data`=VALUES(`data`)")
        ->execute([$nama, (string)$utama, json_encode($rec, JSON_UNESCAPED_UNICODE)]);
    $pdo->commit();
    return ['status' => 'success'];
  } catch (Exception $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    throw $e;
  }
}

function pur_product_hapus($pdo, $nama) {
  $st = $pdo->prepare("DELETE FROM `products` WHERE `nama`=?");
  $st->execute([(string)$nama]);
  return ['status' => 'success', 'deleted' => $st->rowCount()];
}

// =====================================================================
// USERS — berisi PIN
// =====================================================================
function pur_users_ambil($pdo) {
  $out = [];
  foreach ($pdo->query("SELECT `id`,`nama`,`pin`,`role`,`keterangan` FROM `users` ORDER BY `nama`")->fetchAll() as $r) {
    $out[] = (object)['id' => $r['id'], 'name' => $r['nama'], 'pin' => $r['pin'],
                      'role' => $r['role'], 'keterangan' => $r['keterangan']];
  }
  return $out;
}

function pur_user_simpan($pdo, $u) {
  if (!is_object($u) || !isset($u->id) || $u->id === '') {
    return ['status' => 'error', 'message' => 'user tanpa id'];
  }
  $rec = (object)['id' => (string)$u->id, 'name' => (string)($u->name ?? ''),
                  'pin' => (string)($u->pin ?? ''), 'role' => (string)($u->role ?? 'full'),
                  'keterangan' => (string)($u->keterangan ?? $u->tim ?? '')];
  $pdo->prepare("INSERT INTO `users` (`id`,`nama`,`pin`,`role`,`keterangan`,`data`) VALUES (?,?,?,?,?,?)
                 ON DUPLICATE KEY UPDATE `nama`=VALUES(`nama`), `pin`=VALUES(`pin`),
                 `role`=VALUES(`role`), `keterangan`=VALUES(`keterangan`), `data`=VALUES(`data`)")
      ->execute([$rec->id, $rec->name, $rec->pin, $rec->role, $rec->keterangan,
                 json_encode($rec, JSON_UNESCAPED_UNICODE)]);
  return ['status' => 'success'];
}

function pur_user_hapus($pdo, $u) {
  $id = is_object($u) ? ($u->id ?? '') : (string)$u;
  if ($id === '') return ['status' => 'error', 'message' => 'user tanpa id'];

  // Jangan sampai admin terakhir terhapus — sesudah itu tidak ada yang
  // bisa mengelola user lagi, dan pemulihannya harus lewat phpMyAdmin.
  $adm = (int)$pdo->query("SELECT COUNT(*) c FROM `users` WHERE `role`='admin'")->fetch()['c'];
  $st  = $pdo->prepare("SELECT `role` FROM `users` WHERE `id`=?");
  $st->execute([$id]);
  $peran = $st->fetchColumn();
  if ($peran === 'admin' && $adm <= 1) {
    return ['status' => 'error', 'message' => 'tidak bisa menghapus admin terakhir'];
  }

  $st = $pdo->prepare("DELETE FROM `users` WHERE `id`=?");
  $st->execute([$id]);
  return ['status' => 'success', 'deleted' => $st->rowCount()];
}

// =====================================================================
// ORDERING USERS — tabel terpisah `ordering_users` (daftar kru dapur).
// Frontend ordering: GET -> daftar; POST {action:'saveUser', user} atau
// {action:'bulkSeed', users}. Berisi PIN.
// =====================================================================
function pur_ordering_users_ambil($pdo) {
  $out = [];
  foreach ($pdo->query("SELECT `id`,`nama`,`pin`,`role`,`keterangan` FROM `ordering_users` ORDER BY `nama`")->fetchAll() as $r) {
    $out[] = (object)['id' => $r['id'], 'name' => $r['nama'], 'pin' => $r['pin'],
                      'role' => $r['role'], 'keterangan' => $r['keterangan']];
  }
  return $out;
}

function pur_ordering_user_row($pdo, $u) {
  // dipakai saveUser & bulkSeed; TIDAK commit sendiri (biar bisa dibungkus transaksi)
  if (!is_object($u)) return false;
  $id = (string)($u->id ?? '');
  if ($id === '') $id = 'u-' . substr(sha1(($u->pin ?? '') . ($u->name ?? '') . microtime()), 0, 12);
  $rec = (object)['id' => $id, 'name' => (string)($u->name ?? ''),
                  'pin' => (string)($u->pin ?? ''), 'role' => (string)($u->role ?? 'full'),
                  'keterangan' => (string)($u->keterangan ?? $u->tim ?? '')];
  $pdo->prepare("INSERT INTO `ordering_users` (`id`,`nama`,`pin`,`role`,`keterangan`,`data`) VALUES (?,?,?,?,?,?)
                 ON DUPLICATE KEY UPDATE `nama`=VALUES(`nama`), `pin`=VALUES(`pin`),
                 `role`=VALUES(`role`), `keterangan`=VALUES(`keterangan`), `data`=VALUES(`data`)")
      ->execute([$rec->id, $rec->name, $rec->pin, $rec->role, $rec->keterangan,
                 json_encode($rec, JSON_UNESCAPED_UNICODE)]);
  return true;
}

function pur_ordering_user_simpan($pdo, $u) {
  if (!pur_ordering_user_row($pdo, $u)) return ['status' => 'error', 'message' => 'user tidak sah'];
  return ['status' => 'success'];
}

/* bulkSeed: isi banyak user sekaligus. TIDAK menghapus yang sudah ada —
   hanya menambah/menimpa berdasar id, jadi aman dijalankan berulang dan
   tidak membuang user yang dibuat manual. */
function pur_ordering_users_seed($pdo, $users) {
  if (!is_array($users)) return ['status' => 'error', 'message' => 'users bukan array'];
  $pdo->beginTransaction();
  try {
    $n = 0;
    foreach ($users as $u) { if (pur_ordering_user_row($pdo, $u)) $n++; }
    $pdo->commit();
    return ['status' => 'success', 'seeded' => $n];
  } catch (Exception $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    throw $e;
  }
}

function pur_ordering_user_hapus($pdo, $u) {
  $id = is_object($u) ? ($u->id ?? '') : (string)$u;
  if ($id === '') return ['status' => 'error', 'message' => 'user tanpa id'];
  $st = $pdo->prepare("DELETE FROM `ordering_users` WHERE `id`=?");
  $st->execute([$id]);
  return ['status' => 'success', 'deleted' => $st->rowCount()];
}

// =====================================================================
// SETTINGS — konfigurasi bersama per modul. Dipakai untuk matriks hak
// akses (Kelola Akses): { "<page>": { "<role>": 0|1|2 } }. `$modul` HARUS
// 'ordering' atau 'purchasing' — endpoint masing-masing yang mengunci ini,
// bukan fungsi ini, supaya satu endpoint tidak bisa menimpa milik modul lain.
// =====================================================================
function pur_settings_ambil($pdo, $modul) {
  $st = $pdo->prepare("SELECT `data` FROM `stock_settings` WHERE `modul`=?");
  $st->execute([$modul]);
  $row = $st->fetch();
  if (!$row) return (object)[];
  $d = json_decode($row['data']);   // tanpa assoc, lihat catatan JSON di atas berkas
  return is_object($d) ? $d : (object)[];
}

function pur_settings_simpan($pdo, $modul, $data) {
  if (!is_object($data)) return ['status' => 'error', 'message' => 'data bukan objek'];
  $pdo->prepare("INSERT INTO `stock_settings` (`modul`,`data`) VALUES (?,?)
                 ON DUPLICATE KEY UPDATE `data`=VALUES(`data`)")
      ->execute([$modul, json_encode($data, JSON_UNESCAPED_UNICODE)]);
  return ['status' => 'success'];
}

// =====================================================================
// STOCK — sisa bahan "Stock Today" (dipakai bersama ordering + purchasing).
// Bentuk balasan SENGAJA dijaga sama dengan Apps Script lama supaya
// ForecastBook menerima masukan identik: {stock:{nama:{stock_now,stock_unit}}, as_of}.
// =====================================================================
function pur_stock_ambil($pdo) {
  $stock = [];
  $asOf  = '';
  foreach ($pdo->query("SELECT `nama`,`stock_now`,`stock_unit`,`as_of` FROM `stock`")->fetchAll() as $r) {
    $stock[$r['nama']] = (object)['stock_now' => (float)$r['stock_now'],
                                  'stock_unit' => $r['stock_unit']];
    if ($r['as_of'] > $asOf) $asOf = $r['as_of'];   // semua baris seunggahan sama; ambil yang ada
  }
  // (object) supaya peta kosong terkirim {} bukan [] (lihat aturan JSON di atas).
  return ['stock' => (object)$stock, 'as_of' => $asOf, 'count' => count((array)$stock)];
}

/* Simpan snapshot stok. Payload: {type:'stock', as_of, stock:{nama:{stock_now,stock_unit}}}
   Satu upload = snapshot penuh -> tabel DITULIS ULANG. Guard: payload kosong
   TIDAK mengosongkan tabel (biar upload gagal/rusak tak menghapus stok). */
function pur_stock_simpan($pdo, $stockMap, $asOf) {
  if (!is_object($stockMap) || count((array)$stockMap) === 0) {
    return ['status' => 'error', 'message' => 'stock kosong'];
  }
  $pdo->beginTransaction();
  try {
    $pdo->exec("DELETE FROM `stock`");
    $st = $pdo->prepare("INSERT INTO `stock` (`nama`,`stock_now`,`stock_unit`,`as_of`,`data`)
                         VALUES (?,?,?,?,?)");
    $n = 0;
    foreach ($stockMap as $nama => $v) {
      $nama = (string)$nama;
      if ($nama === '') continue;
      $now  = (is_object($v) && isset($v->stock_now)  && is_numeric($v->stock_now)) ? (float)$v->stock_now : 0;
      $unit = (is_object($v) && isset($v->stock_unit)) ? (string)$v->stock_unit : '';
      $st->execute([$nama, $now, $unit, (string)$asOf, json_encode($v, JSON_UNESCAPED_UNICODE)]);
      $n++;
    }
    $pdo->commit();
    return ['status' => 'success', 'saved' => $n, 'as_of' => (string)$asOf];
  } catch (Exception $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    throw $e;
  }
}

// =====================================================================
function pur_stats($pdo) {
  $out = [];
  foreach (['orders', 'vendors', 'products', 'users'] as $t) {
    $out[$t] = (int)$pdo->query("SELECT COUNT(*) c FROM `$t`")->fetch()['c'];
  }
  $out['orders_aktif'] = (int)$pdo->query("SELECT COUNT(*) c FROM `orders` WHERE `status`='Aktif'")->fetch()['c'];
  $out['env']          = defined('ENV_LABEL') ? ENV_LABEL : '(tidak diberi label)';
  $out['db']           = DB_NAME;
  return $out;
}
