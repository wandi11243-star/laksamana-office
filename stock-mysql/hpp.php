<?php
/* STOCK — endpoint HPP & RESEP (sub-modul ke-5, 13 Agustus 2026).
 *
 * Menggantikan berkas "HPP Food Laksamana Updated March 2026.xlsx". Keputusan
 * user saat modul ini dipesan: SESUDAH data dipindahkan, sumber kebenarannya
 * modul ini — bukan lagi Excel. Jadi endpoint ini harus bisa menulis semuanya,
 * bukan cuma membaca hasil impor.
 *
 *   GET  ?action=all      -> {bahan:[…], resep:[…], ts}
 *   POST {action:'simpanBahan', data:{…}}      upsert satu bahan (kunci: nama)
 *   POST {action:'hapusBahan',  nama}
 *   POST {action:'simpanResep', data:{…}}      upsert satu resep (kunci: id)
 *   POST {action:'hapusResep',  id}
 *   POST {action:'impor', data:{bahan:[],resep:[]}, timpa:bool}
 *                                              pemindahan awal dari Excel
 *
 * KENAPA UPSERT PER BARIS, BUKAN "kirim semua". Resep diubah satu-satu oleh
 * kitchen sementara harga bahan diubah purchasing di jam yang sama; kiriman
 * seluruh-state membuat yang menyimpan belakangan menghapus kerja yang lain
 * tanpa satu pun galat. Pola yang sama dengan `jadwal` dan `dw`.
 *
 * BARIS BAHAN SEBUAH RESEP DISIMPAN SEBAGAI JSON di kolom `bahan`, bukan tabel
 * sendiri. Resep selalu disunting utuh (tidak pernah "ubah satu baris bahan
 * saja"), jadi tabel anak cuma menambah join tanpa menambah keamanan apa pun.
 *
 * RESEP BISA MEMAKAI RESEP LAIN sebagai bahan — di berkas aslinya memang
 * begitu (mis. dish "Ayam Bawang Putih" memakai base "Ayam Karage" 80 Gr).
 * Yang disimpan cuma rujukannya; modalnya DIHITUNG di frontend, berjenjang.
 * Server sengaja tidak ikut menghitung: satu rumus di dua tempat pasti
 * menyimpang, dan yang dilihat orang adalah angka di layar.
 */
require __DIR__ . '/_boot.php';

function hpp_pastikan_tabel($pdo) {
  $pdo->exec(
    'CREATE TABLE IF NOT EXISTS hpp_bahan (
       nama       VARCHAR(190) NOT NULL PRIMARY KEY,
       satuan     VARCHAR(32)  NOT NULL DEFAULT \'\',
       qty_beli   DOUBLE       NOT NULL DEFAULT 0,
       harga_beli DOUBLE       NOT NULL DEFAULT 0,
       vendor     VARCHAR(190) NOT NULL DEFAULT \'\',
       produk     VARCHAR(190) NOT NULL DEFAULT \'\',
       kategori   VARCHAR(64)  NOT NULL DEFAULT \'\',
       catatan    VARCHAR(255) NOT NULL DEFAULT \'\',
       updated_at BIGINT       NOT NULL DEFAULT 0,
       updated_by VARCHAR(120) NOT NULL DEFAULT \'\',
       KEY idx_hpp_bahan_produk (produk)
     ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci');
  $pdo->exec(
    'CREATE TABLE IF NOT EXISTS hpp_resep (
       id           VARCHAR(48)  NOT NULL PRIMARY KEY,
       nama         VARCHAR(190) NOT NULL,
       jenis        VARCHAR(16)  NOT NULL DEFAULT \'food\',
       tipe         VARCHAR(16)  NOT NULL DEFAULT \'base\',
       seksi        VARCHAR(96)  NOT NULL DEFAULT \'\',
       yield_qty    DOUBLE       NOT NULL DEFAULT 1,
       yield_unit   VARCHAR(32)  NOT NULL DEFAULT \'\',
       harga_lama   DOUBLE       NOT NULL DEFAULT 0,
       harga_baru   DOUBLE       NOT NULL DEFAULT 0,
       harga_upsize DOUBLE       NOT NULL DEFAULT 0,
       modal_manual DOUBLE       NOT NULL DEFAULT 0,
       catatan      TEXT         NULL,
       bahan        LONGTEXT     NOT NULL,
       aktif        TINYINT(1)   NOT NULL DEFAULT 1,
       updated_at   BIGINT       NOT NULL DEFAULT 0,
       updated_by   VARCHAR(120) NOT NULL DEFAULT \'\',
       KEY idx_hpp_resep_nama (nama),
       KEY idx_hpp_resep_tipe (jenis, tipe)
     ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci');
}
function hpp_num($v) { if (is_int($v) || is_float($v)) return (float)$v;
  $s = preg_replace('/[^0-9.\-]/', '', (string)$v); return ($s === '' || $s === '-') ? 0.0 : (float)$s; }
function hpp_txt($v, $n) { return mb_substr(trim((string)$v), 0, $n); }
function hpp_ms() { return (int)(microtime(true) * 1000); }

function hpp_ambil($pdo) {
  $bahan = $pdo->query('SELECT * FROM hpp_bahan ORDER BY nama')->fetchAll(PDO::FETCH_ASSOC);
  foreach ($bahan as &$b) {
    $b['qty_beli']   = (float)$b['qty_beli'];
    $b['harga_beli'] = (float)$b['harga_beli'];
    /* per1 (harga per satuan terkecil) DIHITUNG, tidak disimpan. Di Excel ia
       kolom rumus, dan menyimpannya berarti suatu saat ada baris yang harganya
       sudah diubah tapi per1-nya tertinggal — persis jenis bug yang tidak
       pernah kelihatan sampai HPP satu menu terlihat aneh. */
    $b['per1'] = $b['qty_beli'] > 0 ? $b['harga_beli'] / $b['qty_beli'] : 0;
  }
  unset($b);
  $resep = $pdo->query('SELECT * FROM hpp_resep ORDER BY jenis, tipe, nama')->fetchAll(PDO::FETCH_ASSOC);
  foreach ($resep as &$r) {
    $r['yield_qty']    = (float)$r['yield_qty'];
    $r['harga_lama']   = (float)$r['harga_lama'];
    $r['harga_baru']   = (float)$r['harga_baru'];
    $r['harga_upsize'] = (float)$r['harga_upsize'];
    $r['modal_manual'] = (float)$r['modal_manual'];
    $r['aktif']        = (int)$r['aktif'];
    $j = json_decode((string)$r['bahan'], true);
    $r['bahan'] = is_array($j) ? $j : array();
  }
  unset($r);
  return array('bahan' => $bahan, 'resep' => $resep, 'ts' => gmdate('c'));
}

function hpp_simpan_bahan($pdo, $d, $by) {
  $nama = hpp_txt(isset($d->nama) ? $d->nama : '', 190);
  if ($nama === '') throw new Exception('Nama bahan kosong');
  $lama = hpp_txt(isset($d->namaLama) ? $d->namaLama : '', 190);
  /* Ganti nama = hapus baris lama sesudah baris baru berdiri. Resep menyimpan
     rujukan BERUPA NAMA, jadi penggantian nama tanpa menyentuh resep akan
     memutus rujukan diam-diam — karena itu resep ikut ditambal di bawah. */
  $st = $pdo->prepare(
    'INSERT INTO hpp_bahan (nama,satuan,qty_beli,harga_beli,vendor,produk,kategori,catatan,updated_at,updated_by)
     VALUES (:n,:s,:q,:h,:v,:p,:k,:c,:ua,:ub)
     ON DUPLICATE KEY UPDATE satuan=VALUES(satuan), qty_beli=VALUES(qty_beli),
       harga_beli=VALUES(harga_beli), vendor=VALUES(vendor), produk=VALUES(produk),
       kategori=VALUES(kategori), catatan=VALUES(catatan),
       updated_at=VALUES(updated_at), updated_by=VALUES(updated_by)');
  $st->execute(array(
    ':n' => $nama,
    ':s' => hpp_txt(isset($d->satuan) ? $d->satuan : '', 32),
    ':q' => hpp_num(isset($d->qty_beli) ? $d->qty_beli : 0),
    ':h' => hpp_num(isset($d->harga_beli) ? $d->harga_beli : 0),
    ':v' => hpp_txt(isset($d->vendor) ? $d->vendor : '', 190),
    ':p' => hpp_txt(isset($d->produk) ? $d->produk : '', 190),
    ':k' => hpp_txt(isset($d->kategori) ? $d->kategori : '', 64),
    ':c' => hpp_txt(isset($d->catatan) ? $d->catatan : '', 255),
    ':ua' => hpp_ms(), ':ub' => hpp_txt($by, 120),
  ));
  $ikut = 0;
  if ($lama !== '' && $lama !== $nama) {
    $pdo->prepare('DELETE FROM hpp_bahan WHERE nama=:n')->execute(array(':n' => $lama));
    $rs = $pdo->query('SELECT id,bahan FROM hpp_resep')->fetchAll(PDO::FETCH_ASSOC);
    foreach ($rs as $r) {
      $baris = json_decode((string)$r['bahan'], true);
      if (!is_array($baris)) continue;
      $ubah = false;
      foreach ($baris as &$b) {
        if (isset($b['nama']) && $b['nama'] === $lama) { $b['nama'] = $nama; $ubah = true; }
      }
      unset($b);
      if ($ubah) {
        $pdo->prepare('UPDATE hpp_resep SET bahan=:b WHERE id=:i')
            ->execute(array(':b' => json_encode($baris, JSON_UNESCAPED_UNICODE), ':i' => $r['id']));
        $ikut++;
      }
    }
  }
  return array('status' => 'success', 'saved' => true, 'nama' => $nama, 'resepIkutBerubah' => $ikut);
}

function hpp_simpan_resep($pdo, $d, $by) {
  $nama = hpp_txt(isset($d->nama) ? $d->nama : '', 190);
  if ($nama === '') throw new Exception('Nama resep kosong');
  $id = hpp_txt(isset($d->id) ? $d->id : '', 48);
  if ($id === '') $id = 'r' . dechex(hpp_ms()) . dechex(mt_rand(0, 0xffff));
  $baris = array();
  if (isset($d->bahan) && is_array($d->bahan)) {
    foreach ($d->bahan as $b) {
      if (is_object($b)) $b = (array)$b;
      if (!is_array($b)) continue;
      /* Baris keterangan (mis. "bumbu blender saring") ikut disimpan apa
         adanya: di berkas aslinya baris itu memisahkan tahap memasak, dan
         membuangnya membuat resep tidak bisa dibaca juru masak. */
      if (isset($b['catatan']) && !isset($b['nama'])) {
        $baris[] = array('catatan' => hpp_txt($b['catatan'], 190));
        continue;
      }
      $nm = hpp_txt(isset($b['nama']) ? $b['nama'] : '', 190);
      if ($nm === '') continue;
      $baris[] = array(
        'nama'   => $nm,
        'qty'    => hpp_num(isset($b['qty']) ? $b['qty'] : 0),
        'satuan' => hpp_txt(isset($b['satuan']) ? $b['satuan'] : '', 32),
        /* 'ref' menyebut baris ini menunjuk resep lain atau bahan mentah.
           Disimpan, bukan ditebak saat membaca: nama bisa saja sama di kedua
           daftar, dan tebakan yang salah memindahkan angka modal tanpa gejala. */
        'ref'    => (isset($b['ref']) && $b['ref'] === 'resep') ? 'resep' : 'bahan',
      );
    }
  }
  $st = $pdo->prepare(
    'INSERT INTO hpp_resep (id,nama,jenis,tipe,seksi,yield_qty,yield_unit,
       harga_lama,harga_baru,harga_upsize,modal_manual,catatan,bahan,aktif,updated_at,updated_by)
     VALUES (:i,:n,:j,:t,:s,:yq,:yu,:hl,:hb,:hu,:mm,:c,:b,:a,:ua,:ub)
     ON DUPLICATE KEY UPDATE nama=VALUES(nama), jenis=VALUES(jenis), tipe=VALUES(tipe),
       seksi=VALUES(seksi), yield_qty=VALUES(yield_qty), yield_unit=VALUES(yield_unit),
       harga_lama=VALUES(harga_lama), harga_baru=VALUES(harga_baru),
       harga_upsize=VALUES(harga_upsize), modal_manual=VALUES(modal_manual),
       catatan=VALUES(catatan), bahan=VALUES(bahan),
       aktif=VALUES(aktif), updated_at=VALUES(updated_at), updated_by=VALUES(updated_by)');
  $yq = hpp_num(isset($d->yield_qty) ? $d->yield_qty : 1);
  $st->execute(array(
    ':i' => $id, ':n' => $nama,
    ':j' => (isset($d->jenis) && $d->jenis === 'drink') ? 'drink' : 'food',
    ':t' => (isset($d->tipe) && $d->tipe === 'dish') ? 'dish' : 'base',
    ':s' => hpp_txt(isset($d->seksi) ? $d->seksi : '', 96),
    /* Yield nol dilarang: modal per satuan = total / yield, dan nol di sana
       memulangkan pembagian nol yang menjalar jadi Infinity ke SEMUA dish yang
       memakai base ini. Dijatuhkan ke 1 — angka yang salah tapi terlihat. */
    ':yq' => $yq > 0 ? $yq : 1,
    ':yu' => hpp_txt(isset($d->yield_unit) ? $d->yield_unit : '', 32),
    ':hl' => hpp_num(isset($d->harga_lama) ? $d->harga_lama : 0),
    ':hb' => hpp_num(isset($d->harga_baru) ? $d->harga_baru : 0),
    ':hu' => hpp_num(isset($d->harga_upsize) ? $d->harga_upsize : 0),
    /* Modal yang diketik tangan, dipakai HANYA untuk menu yang memang tidak
       punya resep (mis. minuman botolan yang dibeli jadi, atau menu yang
       resepnya belum sempat dipindahkan). Kalau resepnya ada, penghitung modal
       di frontend mengabaikan angka ini. */
    ':mm' => hpp_num(isset($d->modal_manual) ? $d->modal_manual : 0),
    ':c'  => hpp_txt(isset($d->catatan) ? $d->catatan : '', 2000),
    ':b'  => json_encode($baris, JSON_UNESCAPED_UNICODE),
    ':a'  => (isset($d->aktif) && !$d->aktif) ? 0 : 1,
    ':ua' => hpp_ms(), ':ub' => hpp_txt($by, 120),
  ));
  return array('status' => 'success', 'saved' => true, 'id' => $id, 'bahan' => count($baris));
}

/* Pemindahan awal dari Excel. MENOLAK jalan kalau tabelnya sudah berisi,
   kecuali `timpa` diminta terang-terangan: impor kedua yang tidak sengaja akan
   melipatgandakan resep dan mengembalikan harga bahan ke angka Maret 2026 —
   dua kerusakan yang baru ketahuan berminggu-minggu kemudian. */
function hpp_impor($pdo, $d, $by, $timpa) {
  $ada = (int)$pdo->query('SELECT COUNT(*) FROM hpp_resep')->fetchColumn()
       + (int)$pdo->query('SELECT COUNT(*) FROM hpp_bahan')->fetchColumn();
  if ($ada > 0 && !$timpa) {
    return array('status' => 'error', 'message' => 'Data HPP sudah ada (' . $ada . ' baris). Impor dibatalkan.');
  }
  if ($timpa) { $pdo->exec('DELETE FROM hpp_resep'); $pdo->exec('DELETE FROM hpp_bahan'); }
  $nB = 0; $nR = 0;
  if (isset($d->bahan) && is_array($d->bahan)) {
    foreach ($d->bahan as $b) { hpp_simpan_bahan($pdo, $b, $by); $nB++; }
  }
  if (isset($d->resep) && is_array($d->resep)) {
    foreach ($d->resep as $r) { hpp_simpan_resep($pdo, $r, $by); $nR++; }
  }
  return array('status' => 'success', 'saved' => true, 'bahan' => $nB, 'resep' => $nR);
}

try {
  $pdo = pur_pdo();
  hpp_pastikan_tabel($pdo);

  if ($metode === 'GET') {
    pur_cek_token();
    pur_json(hpp_ambil($pdo));
  }

  if ($metode === 'POST') {
    $b = pur_body();
    if (!$b) pur_json(['status' => 'error', 'message' => 'body bukan JSON'], 400);
    pur_cek_token($b);
    $a  = isset($b->action) ? $b->action : '';
    $by = isset($b->by) ? $b->by : '';
    if ($a === 'simpanBahan') pur_json(hpp_simpan_bahan($pdo, $b->data ?? new stdClass(), $by));
    if ($a === 'hapusBahan') {
      $n = hpp_txt($b->nama ?? '', 190);
      $pdo->prepare('DELETE FROM hpp_bahan WHERE nama=:n')->execute(array(':n' => $n));
      pur_json(['status' => 'success', 'saved' => true]);
    }
    if ($a === 'simpanResep') pur_json(hpp_simpan_resep($pdo, $b->data ?? new stdClass(), $by));
    if ($a === 'hapusResep') {
      $i = hpp_txt($b->id ?? '', 48);
      $pdo->prepare('DELETE FROM hpp_resep WHERE id=:i')->execute(array(':i' => $i));
      pur_json(['status' => 'success', 'saved' => true]);
    }
    if ($a === 'impor') pur_json(hpp_impor($pdo, $b->data ?? new stdClass(), $by, !empty($b->timpa)));
    pur_json(['status' => 'error', 'message' => 'action tidak dikenal: ' . $a], 400);
  }
  pur_json(['status' => 'error', 'message' => 'metode tidak didukung'], 405);
} catch (Throwable $e) {
  error_log('[stock/hpp] ' . $e->getMessage());
  pur_json(['status' => 'error', 'message' => 'kesalahan server: ' . $e->getMessage()], 500);
}
