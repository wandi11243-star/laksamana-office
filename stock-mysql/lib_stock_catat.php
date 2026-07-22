<?php
/************************************************************************
 * STOCK — PENCATATAN: pemakaian event, waste produk, stock opname.
 * ---------------------------------------------------------------------
 * Berkas TERPISAH dari lib_stock_mysql.php dengan sengaja:
 *   1. lib utama sudah panjang, dan ketiga modul ini urusan yang berbeda
 *      (mencatat apa yang KELUAR/DIHITUNG, bukan apa yang DIPESAN);
 *   2. memasangnya ke server jadi menambah berkas baru, bukan menimpa
 *      berkas yang sedang melayani ordering & purchasing — kalau ada yang
 *      salah, yang sudah jalan tidak ikut terbawa.
 *
 * Dipakai oleh usage.php, waste.php, opname.php. Ketiganya require
 * _boot.php dulu (config + lib utama + ping), baru berkas ini.
 *
 * TIDAK ADA di sini yang mengubah tabel `stock`. Lihat catatan panjang di
 * schema.sql: `stock` ditimpa SELURUHNYA tiap unggah xlsx "Stock Today",
 * jadi pengurangan otomatis akan lenyap tanpa jejak pada unggahan
 * berikutnya — dan selisih yang muncul karenanya justru menyesatkan.
 ************************************************************************/

/* Id record baru. Sebangun dengan pur_batch_id: waktu + acak, supaya dua
   kru yang menyimpan pada detik yang sama tidak bertabrakan. */
function pur_uid($awalan) {
  return $awalan . '-' . date('ymd-His') . '-' . strtoupper(bin2hex(random_bytes(3)));
}

/* Ambil `data` JSON sebagai objek. Baris yang JSON-nya rusak TIDAK
   menggagalkan seluruh daftar — ia cuma kehilangan isi rincinya, dan itu
   jauh lebih baik daripada halaman kosong gara-gara satu baris cacat. */
function pur_data_obj($raw) {
  $o = json_decode((string)$raw);
  return is_object($o) ? $o : (object)[];
}

/* Rentang tanggal opsional dari query string (?dari=&ke=), dipakai ketiga
   endpoint. Kosong = tanpa batas. Disaring di SQL, bukan di PHP: daftar
   ini tumbuh terus dan tidak ada gunanya mengirim setahun penuh ke browser
   hanya untuk membuang 90%-nya di sana. */
function pur_filter_tanggal(&$sql, &$par, $kolom = 'tanggal') {
  $dari = trim((string)($_GET['dari'] ?? ''));
  $ke   = trim((string)($_GET['ke']   ?? ''));
  if ($dari !== '') { $sql .= " AND `$kolom` >= ?"; $par[] = $dari; }
  if ($ke   !== '') { $sql .= " AND `$kolom` <= ?"; $par[] = $ke; }
}

/* rowCount() pada UPDATE mengembalikan 0 JUGA ketika barisnya ada tapi
   nilainya tidak berubah — jadi 0 sendirian bukan bukti "tidak ditemukan".
   Fungsi ini yang membedakan keduanya, supaya menyimpan tanpa perubahan
   tidak dilaporkan sebagai gagal. */
function pur_ada_baris($pdo, $tabel, $id) {
  $st = $pdo->prepare("SELECT 1 FROM `$tabel` WHERE `id`=? LIMIT 1");
  $st->execute([$id]);
  return (bool)$st->fetchColumn();
}

/* ======================== PEMAKAIAN BAHAN UNTUK EVENT ======================== */

function pur_usage_ambil($pdo) {
  $sql = "SELECT * FROM `usage_events` WHERE 1=1";
  $par = [];
  pur_filter_tanggal($sql, $par);
  $sql .= " ORDER BY `tanggal` DESC, `waktu` DESC";
  $st = $pdo->prepare($sql); $st->execute($par);

  $out = [];
  foreach ($st->fetchAll() as $r) {
    $d = pur_data_obj($r['data']);
    $out[] = [
      'id'        => $r['id'],
      'tanggal'   => $r['tanggal'],
      'jenis'     => $r['jenis'],
      'namaEvent' => $r['nama_event'],
      'status'    => $r['status'],
      'pic'       => $r['pic'],
      'tim'       => $r['tim'],
      'waktu'     => $r['waktu'],
      'catatan'   => isset($d->catatan) ? (string)$d->catatan : '',
      'items'     => isset($d->items) && is_array($d->items) ? $d->items : [],
    ];
  }
  return $out;
}

function pur_usage_simpan($pdo, $b) {
  $id      = trim((string)($b->id ?? ''));
  $tanggal = trim((string)($b->tanggal ?? ''));
  $jenis   = trim((string)($b->jenis ?? ''));
  $nama    = trim((string)($b->namaEvent ?? ''));
  if ($tanggal === '') return ['status' => 'error', 'message' => 'tanggal wajib diisi'];
  if ($jenis === '')   return ['status' => 'error', 'message' => 'jenis event wajib dipilih'];

  /* Baris tanpa nama bahan dibuang, dan catatan tanpa satu pun bahan
     ditolak: pemakaian kosong tidak menjawab pertanyaan apa pun dan cuma
     jadi baris hampa di laporan. */
  $items = [];
  foreach ((array)($b->items ?? []) as $it) {
    if (!is_object($it)) continue;
    $nm = trim((string)($it->item ?? ''));
    if ($nm === '') continue;
    $items[] = (object)[
      'item' => $nm,
      'qty'  => isset($it->qty) ? (float)$it->qty : 0,
      'unit' => trim((string)($it->unit ?? '')),
      'note' => trim((string)($it->note ?? '')),
    ];
  }
  if (!$items) return ['status' => 'error', 'message' => 'minimal satu bahan harus diisi'];

  $status = ((string)($b->status ?? '')) === 'Selesai' ? 'Selesai' : 'Rencana';
  $json = json_encode((object)[
    'catatan' => trim((string)($b->catatan ?? '')),
    'items'   => $items,
  ], JSON_UNESCAPED_UNICODE);

  $pic = trim((string)($b->pic ?? ''));
  $tim = trim((string)($b->tim ?? ''));

  if ($id !== '') {
    $pdo->prepare("UPDATE `usage_events`
        SET `tanggal`=?, `jenis`=?, `nama_event`=?, `status`=?, `pic`=?, `tim`=?, `data`=?
        WHERE `id`=?")
      ->execute([$tanggal, $jenis, $nama, $status, $pic, $tim, $json, $id]);
    if (!pur_ada_baris($pdo, 'usage_events', $id)) {
      return ['status' => 'error', 'message' => 'catatan tidak ditemukan'];
    }
    return ['status' => 'success', 'id' => $id];
  }

  $id = pur_uid('USE');
  $pdo->prepare("INSERT INTO `usage_events`
      (`id`,`tanggal`,`jenis`,`nama_event`,`status`,`pic`,`tim`,`waktu`,`data`)
      VALUES (?,?,?,?,?,?,?,?,?)")
    ->execute([$id, $tanggal, $jenis, $nama, $status, $pic, $tim, date('Y-m-d H:i:s'), $json]);
  return ['status' => 'success', 'id' => $id];
}

function pur_usage_status($pdo, $id, $status) {
  $status = ($status === 'Selesai') ? 'Selesai' : 'Rencana';
  $pdo->prepare("UPDATE `usage_events` SET `status`=? WHERE `id`=?")->execute([$status, $id]);
  if (!pur_ada_baris($pdo, 'usage_events', $id)) return ['status' => 'error', 'message' => 'tidak ditemukan'];
  return ['status' => 'success'];
}

function pur_usage_hapus($pdo, $id) {
  $st = $pdo->prepare("DELETE FROM `usage_events` WHERE `id`=?");
  $st->execute([$id]);
  return $st->rowCount() ? ['status' => 'success'] : ['status' => 'error', 'message' => 'tidak ditemukan'];
}

/* ================================= WASTE ================================== */

/* Daftar waste TANPA kolom `foto` — disengaja, dan ini yang menentukan
   halaman ini tetap ringan. Satu foto ±200-400KB; daftar sebulan bisa
   ratusan baris, jadi menyertakan fotonya berarti mengunduh puluhan
   megabita hanya untuk menampilkan tabel. Frontend cukup tahu ADA/TIDAKNYA
   foto (`adaFoto`), lalu menariknya satu per satu lewat ?action=foto. */
function pur_waste_ambil($pdo) {
  $sql = "SELECT `id`,`tanggal`,`item`,`qty`,`unit`,`sebab`,`pic`,`tim`,`waktu`,
                 `foto_nama`, (`foto` <> '') AS ada_foto, `data`
          FROM `waste` WHERE 1=1";
  $par = [];
  pur_filter_tanggal($sql, $par);
  $sql .= " ORDER BY `tanggal` DESC, `waktu` DESC";
  $st = $pdo->prepare($sql); $st->execute($par);

  $out = [];
  foreach ($st->fetchAll() as $r) {
    $d = pur_data_obj($r['data']);
    $out[] = [
      'id'       => $r['id'],
      'tanggal'  => $r['tanggal'],
      'item'     => $r['item'],
      'qty'      => (float)$r['qty'],
      'unit'     => $r['unit'],
      'sebab'    => $r['sebab'],
      'pic'      => $r['pic'],
      'tim'      => $r['tim'],
      'waktu'    => $r['waktu'],
      'fotoNama' => $r['foto_nama'],
      'adaFoto'  => (bool)$r['ada_foto'],
      'catatan'  => isset($d->catatan) ? (string)$d->catatan : '',
    ];
  }
  return $out;
}

// Satu foto, ditarik saat diklik. Dipisah dari daftar — lihat catatan di atas.
function pur_waste_foto($pdo, $id) {
  $st = $pdo->prepare("SELECT `foto`,`foto_nama` FROM `waste` WHERE `id`=? LIMIT 1");
  $st->execute([$id]);
  $r = $st->fetch();
  if (!$r || $r['foto'] === '') return ['status' => 'error', 'message' => 'foto tidak ada'];
  return ['status' => 'success', 'foto' => $r['foto'], 'fotoNama' => $r['foto_nama']];
}

function pur_waste_simpan($pdo, $b) {
  $id      = trim((string)($b->id ?? ''));
  $tanggal = trim((string)($b->tanggal ?? ''));
  $item    = trim((string)($b->item ?? ''));
  $qty     = isset($b->qty) ? (float)$b->qty : 0;
  if ($tanggal === '') return ['status' => 'error', 'message' => 'tanggal wajib diisi'];
  if ($item === '')    return ['status' => 'error', 'message' => 'nama produk wajib diisi'];
  if ($qty <= 0)       return ['status' => 'error', 'message' => 'jumlah harus lebih dari 0'];

  $json  = json_encode((object)['catatan' => trim((string)($b->catatan ?? ''))], JSON_UNESCAPED_UNICODE);
  $unit  = trim((string)($b->unit ?? ''));
  $sebab = trim((string)($b->sebab ?? ''));
  $pic   = trim((string)($b->pic ?? ''));
  $tim   = trim((string)($b->tim ?? ''));

  /* `foto` TIDAK dikirim (null) = pertahankan yang lama.
     Dikirim sebagai string kosong = sengaja dihapus.
     Tanpa pembedaan ini, menyunting catatan tanpa memilih ulang berkas akan
     menghapus fotonya diam-diam — dan foto itu satu-satunya bukti waste. */
  $fotoBaru = $b->foto ?? null;

  if ($id !== '') {
    if ($fotoBaru === null) {
      $pdo->prepare("UPDATE `waste`
          SET `tanggal`=?,`item`=?,`qty`=?,`unit`=?,`sebab`=?,`pic`=?,`tim`=?,`data`=?
          WHERE `id`=?")
        ->execute([$tanggal, $item, $qty, $unit, $sebab, $pic, $tim, $json, $id]);
    } else {
      $pdo->prepare("UPDATE `waste`
          SET `tanggal`=?,`item`=?,`qty`=?,`unit`=?,`sebab`=?,`pic`=?,`tim`=?,`data`=?,`foto`=?,`foto_nama`=?
          WHERE `id`=?")
        ->execute([$tanggal, $item, $qty, $unit, $sebab, $pic, $tim, $json,
                   (string)$fotoBaru, trim((string)($b->fotoNama ?? '')), $id]);
    }
    if (!pur_ada_baris($pdo, 'waste', $id)) return ['status' => 'error', 'message' => 'catatan tidak ditemukan'];
    return ['status' => 'success', 'id' => $id];
  }

  $id = pur_uid('WST');
  $pdo->prepare("INSERT INTO `waste`
      (`id`,`tanggal`,`item`,`qty`,`unit`,`sebab`,`pic`,`tim`,`waktu`,`foto`,`foto_nama`,`data`)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)")
    ->execute([$id, $tanggal, $item, $qty, $unit, $sebab, $pic, $tim, date('Y-m-d H:i:s'),
               (string)($fotoBaru ?? ''), trim((string)($b->fotoNama ?? '')), $json]);
  return ['status' => 'success', 'id' => $id];
}

function pur_waste_hapus($pdo, $id) {
  $st = $pdo->prepare("DELETE FROM `waste` WHERE `id`=?");
  $st->execute([$id]);
  return $st->rowCount() ? ['status' => 'success'] : ['status' => 'error', 'message' => 'tidak ditemukan'];
}

/* ================================ OPNAME ================================== */

function pur_opname_ambil($pdo) {
  $sql = "SELECT * FROM `opname` WHERE 1=1";
  $par = [];
  pur_filter_tanggal($sql, $par);
  $sql .= " ORDER BY `tanggal` DESC, `waktu` DESC";
  $st = $pdo->prepare($sql); $st->execute($par);

  $out = [];
  foreach ($st->fetchAll() as $r) {
    $d = pur_data_obj($r['data']);
    $out[] = [
      'id'      => $r['id'],
      'tanggal' => $r['tanggal'],
      'pic'     => $r['pic'],
      'tim'     => $r['tim'],
      'status'  => $r['status'],
      'waktu'   => $r['waktu'],
      'catatan' => isset($d->catatan) ? (string)$d->catatan : '',
      'items'   => isset($d->items) && is_array($d->items) ? $d->items : [],
    ];
  }
  return $out;
}

function pur_opname_simpan($pdo, $b) {
  $id      = trim((string)($b->id ?? ''));
  $tanggal = trim((string)($b->tanggal ?? ''));
  if ($tanggal === '') return ['status' => 'error', 'message' => 'tanggal wajib diisi'];

  /* Baris disimpan APA ADANYA, termasuk yang angka fisiknya belum diisi.
     Opname sering dikerjakan bertahap — hitung rak A, simpan sebagai Draft,
     lanjut rak B nanti. Membuang baris yang belum terisi saat menyimpan
     berarti menghapus daftar yang sedang dikerjakan.

     `selisih` sengaja TIDAK disimpan: ia selalu fisik − sistem, dan
     menyimpan hasil hitungan membuka peluang angka tersimpan yang tidak
     cocok dengan kedua sumbernya. Dihitung ulang saat ditampilkan.

     null (bukan 0) untuk yang belum diisi: "belum dihitung" dan "dihitung,
     hasilnya nol" dua hal yang sangat berbeda saat menilai selisih. */
  $items = [];
  foreach ((array)($b->items ?? []) as $it) {
    if (!is_object($it)) continue;
    $nm = trim((string)($it->item ?? ''));
    if ($nm === '') continue;
    $items[] = (object)[
      'item'   => $nm,
      'unit'   => trim((string)($it->unit ?? '')),
      'sistem' => (isset($it->sistem) && $it->sistem !== '' && $it->sistem !== null) ? (float)$it->sistem : null,
      'fisik'  => (isset($it->fisik)  && $it->fisik  !== '' && $it->fisik  !== null) ? (float)$it->fisik  : null,
      'note'   => trim((string)($it->note ?? '')),
    ];
  }
  if (!$items) return ['status' => 'error', 'message' => 'minimal satu produk harus diisi'];

  $status = ((string)($b->status ?? '')) === 'Selesai' ? 'Selesai' : 'Draft';
  $json = json_encode((object)[
    'catatan' => trim((string)($b->catatan ?? '')),
    'items'   => $items,
  ], JSON_UNESCAPED_UNICODE);

  $pic = trim((string)($b->pic ?? ''));
  $tim = trim((string)($b->tim ?? ''));

  if ($id !== '') {
    $pdo->prepare("UPDATE `opname` SET `tanggal`=?,`pic`=?,`tim`=?,`status`=?,`data`=? WHERE `id`=?")
      ->execute([$tanggal, $pic, $tim, $status, $json, $id]);
    if (!pur_ada_baris($pdo, 'opname', $id)) return ['status' => 'error', 'message' => 'opname tidak ditemukan'];
    return ['status' => 'success', 'id' => $id];
  }

  $id = pur_uid('OPN');
  $pdo->prepare("INSERT INTO `opname` (`id`,`tanggal`,`pic`,`tim`,`status`,`waktu`,`data`)
                 VALUES (?,?,?,?,?,?,?)")
    ->execute([$id, $tanggal, $pic, $tim, $status, date('Y-m-d H:i:s'), $json]);
  return ['status' => 'success', 'id' => $id];
}

function pur_opname_hapus($pdo, $id) {
  $st = $pdo->prepare("DELETE FROM `opname` WHERE `id`=?");
  $st->execute([$id]);
  return $st->rowCount() ? ['status' => 'success'] : ['status' => 'error', 'message' => 'tidak ditemukan'];
}
