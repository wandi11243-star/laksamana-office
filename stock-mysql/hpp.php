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
 *   POST {action:'imporBahan', rows:[…]}       impor BERULANG bahan dari
 *                                              Excel/CSV; upsert per nama,
 *                                              tidak menghapus & tidak ganti nama
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
/* ---------- PEMAKAIAN BULANAN & PENGATURAN (13 Agustus 2026) ----------
   Digabungkan dari dua prototipe yang dikirim user (Kontrol Bahan Baku &
   Galangan HPP). Yang diambil cuma yang BELUM ada di modul ini: analisa selisih
   pemakaian, COGS bulanan, dan target/ambang yang tadinya angka mati di kode.

   Halaman order, reorder, opname, dan waste di prototipe itu SENGAJA tidak
   dibawa: ketiganya sudah punya rumahnya sendiri di Stock (Ordering,
   Purchasing, Pemakaian Bahan Baku). Dua tempat mencatat opname yang sama
   berarti dua angka yang berbeda, dan tidak ada cara memilih mana yang benar. */
function hpp_pastikan_tabel2($pdo) {
  $pdo->exec(
    'CREATE TABLE IF NOT EXISTS hpp_pakai (
       bulan      CHAR(7)      NOT NULL,
       bahan      VARCHAR(190) NOT NULL,
       sa         DOUBLE NOT NULL DEFAULT 0,   -- stok awal
       beli       DOUBLE NOT NULL DEFAULT 0,
       resep      DOUBLE NOT NULL DEFAULT 0,   -- terpakai menurut resep (teoretis)
       spoil      DOUBLE NOT NULL DEFAULT 0,
       team       DOUBLE NOT NULL DEFAULT 0,
       rnd        DOUBLE NOT NULL DEFAULT 0,
       comp       DOUBLE NOT NULL DEFAULT 0,
       opname     DOUBLE NOT NULL DEFAULT 0,   -- stok fisik akhir bulan
       updated_at BIGINT NOT NULL DEFAULT 0,
       updated_by VARCHAR(120) NOT NULL DEFAULT \'\',
       PRIMARY KEY (bulan, bahan)
     ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci');
  $pdo->exec(
    'CREATE TABLE IF NOT EXISTS hpp_bulan (
       bulan      CHAR(7)      NOT NULL PRIMARY KEY,
       penjualan  DOUBLE       NOT NULL DEFAULT 0,
       catatan    VARCHAR(255) NOT NULL DEFAULT \'\',
       updated_at BIGINT       NOT NULL DEFAULT 0,
       updated_by VARCHAR(120) NOT NULL DEFAULT \'\'
     ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci');
  $pdo->exec(
    'CREATE TABLE IF NOT EXISTS hpp_setting (
       id   TINYINT UNSIGNED NOT NULL PRIMARY KEY,
       data LONGTEXT NOT NULL
     ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci');
}
/* PERLU ADA DI PURCHASING? — saklar per barang (14 Agustus 2026, permintaan
   user). Sebabnya: daftar Bahan & Harga isinya BAHAN BAKU RAW, sementara base
   dan produk rakitan hidup sebagai RESEP. Keduanya tidak selalu perlu berdiri
   di basis purchasing:

     - bahan raw     : hampir semuanya dibeli, jadi bawaannya YA. Yang tidak
                       dibeli (Air, es dari mesin sendiri) dimatikan saklarnya.
     - resep base    : dibuat sendiri, jadi bawaannya TIDAK. Tapi base yang
                       diproduksi Central Kitchen lalu diambil outlet MEMANG
                       barang purchasing — purchasing sudah punya penanda
                       `sumber:'ck'` untuk itu — jadi saklarnya bisa dinyalakan.

   Kolomnya ditambahkan belakangan lewat ALTER, bukan lewat CREATE TABLE saja:
   tabelnya sudah berisi di dev dan produksi, dan CREATE TABLE IF NOT EXISTS
   tidak pernah menyentuh tabel yang sudah ada. */
function hpp_pastikan_kolom($pdo) {
  $cek = $pdo->prepare('SELECT COUNT(*) FROM information_schema.COLUMNS
                         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :t AND COLUMN_NAME = :c');
  /* sisi_harga (17 Agustus 2026): untuk nama yang berdiri di daftar bahan DAN
     di Daftar Resep — "harga untuk nama ini diambil dari mana?".
       'beli'  = dari baris bahannya (barang yang dipesan ke vendor)
       'resep' = dari resep bernama sama (olahan sendiri; barisnya cuma penopang
                 nama supaya bisa dipesan ke Central Kitchen lewat Purchasing)
       ''      = belum diputuskan; layar menyimpulkannya dari pemakaian.
     Lihat catatan panjang di tabrakan() pada deploy/stock/hpp/index.html.

     `dibeli_jadi` adalah pendahulunya yang berumur satu hari (saklar ya/tidak,
     sebelum sisi ketiga ada). Kolomnya sengaja TIDAK dibuang: menjatuhkan kolom
     di basis data yang sedang melayani berarti permintaan dari layar lama —
     yang masih mengirim `dibeli_jadi` — gagal seluruhnya, bukan cuma
     mengabaikan satu field. Ia dipindahkan sekali ke sisi_harga di bawah, lalu
     berhenti ditulis dan berhenti dibaca. */
  foreach (array(array('hpp_bahan', 'di_purchasing', 'TINYINT(1) NOT NULL DEFAULT 1'),
                 array('hpp_bahan', 'dibeli_jadi',   'TINYINT(1) NOT NULL DEFAULT 0'),
                 array('hpp_bahan', 'sisi_harga',    "VARCHAR(8) NOT NULL DEFAULT ''"),
                 array('hpp_resep', 'di_purchasing', 'TINYINT(1) NOT NULL DEFAULT 0')) as $k) {
    $cek->execute(array(':t' => $k[0], ':c' => $k[1]));
    if ((int)$cek->fetchColumn()) continue;
    $pdo->exec('ALTER TABLE `' . $k[0] . '` ADD COLUMN `' . $k[1] . '` ' . $k[2]);
    /* Syaratnya kolomnya, BUKAN cuma tabelnya: sejak hpp_bahan punya dua kolom
       yang ditambahkan lewat jalur ini, `$k[0] === 'hpp_bahan'` saja akan
       menjalankan backfill di_purchasing lagi saat dibeli_jadi lahir. */
    if ($k[0] === 'hpp_bahan' && $k[1] === 'di_purchasing') {
      /* Warisan: bahan yang dulu ditandai "mandiri" (produk = '-') adalah
         persis bahan yang user nyatakan tidak dibeli lewat purchasing. Saklarnya
         dimatikan sekali di sini supaya keputusan itu tidak perlu diulang. */
      $pdo->exec("UPDATE hpp_bahan SET di_purchasing = 0 WHERE produk = '-'");
    }
    if ($k[0] === 'hpp_bahan' && $k[1] === 'sisi_harga') {
      /* Pindahan sekali dari saklar pendahulunya. Dijalankan DI DALAM cabang
         "kolomnya baru saja dibuat", jadi ia tidak akan menimpa pilihan yang
         sudah diketik orang sesudahnya. */
      $pdo->exec("UPDATE hpp_bahan SET sisi_harga = 'beli' WHERE dibeli_jadi = 1");
    }
  }
}
function hpp_setting_baca($pdo) {
  $row = $pdo->query('SELECT data FROM hpp_setting WHERE id=1')->fetch(PDO::FETCH_ASSOC);
  $d = $row ? json_decode((string)$row['data'], true) : null;
  if (!is_array($d)) $d = array();
  /* Bawaan diambil dari berkas HPP aslinya: ambang 33% (kolom "Below 33%") dan
     buffer 5% (baris buffer di sheet Harga). Ditaruh di sini, bukan di kode
     frontend, supaya angkanya bisa diubah tanpa deploy. */
  $bawaan = array('targetFood' => 0.33, 'targetDrink' => 0.33, 'buffer' => 0.05,
                  'lampuKuning' => 3.0, 'lampuMerah' => 8.0);
  foreach ($bawaan as $k => $v) if (!isset($d[$k])) $d[$k] = $v;
  return $d;
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
    $b['di_purchasing'] = isset($b['di_purchasing']) ? (int)$b['di_purchasing'] : 1;
    /* dibeli_jadi TIDAK ikut dipulangkan: satu konsep dengan dua nama di layar
       berarti dua tempat yang bisa menjawab beda. Migrasinya sudah dijalankan
       hpp_pastikan_kolom; sisiHarga() di layar masih mengenalinya sebagai
       cadangan untuk data yang keburu terbaca sebelum migrasi sempat jalan. */
    $s = isset($b['sisi_harga']) ? strtolower(trim((string)$b['sisi_harga'])) : '';
    $b['sisi_harga'] = ($s === 'beli' || $s === 'resep') ? $s : '';
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
    $r['di_purchasing'] = isset($r['di_purchasing']) ? (int)$r['di_purchasing'] : 0;
    $j = json_decode((string)$r['bahan'], true);
    $r['bahan'] = is_array($j) ? $j : array();
  }
  unset($r);
  return array('bahan' => $bahan, 'resep' => $resep,
               'setting' => hpp_setting_baca($pdo), 'ts' => gmdate('c'));
}

/* Satu bulan pemakaian: baris per bahan + nilai penjualan bulan itu. Dipisah
   dari `all` karena bisa ada puluhan bulan × 296 bahan, dan yang dibuka orang
   selalu satu bulan saja. */
function hpp_pakai_ambil($pdo, $bulan) {
  $st = $pdo->prepare('SELECT * FROM hpp_pakai WHERE bulan=:b ORDER BY bahan');
  $st->execute(array(':b' => $bulan));
  $baris = $st->fetchAll(PDO::FETCH_ASSOC);
  foreach ($baris as &$r) {
    foreach (array('sa','beli','resep','spoil','team','rnd','comp','opname') as $k) $r[$k] = (float)$r[$k];
  }
  unset($r);
  $st2 = $pdo->prepare('SELECT * FROM hpp_bulan WHERE bulan=:b');
  $st2->execute(array(':b' => $bulan));
  $meta = $st2->fetch(PDO::FETCH_ASSOC);
  $daftar = $pdo->query('SELECT bulan FROM hpp_bulan ORDER BY bulan DESC')->fetchAll(PDO::FETCH_COLUMN);
  return array('bulan' => $bulan, 'baris' => $baris,
               'penjualan' => $meta ? (float)$meta['penjualan'] : 0,
               'catatan' => $meta ? $meta['catatan'] : '',
               'daftarBulan' => $daftar);
}
function hpp_pakai_simpan($pdo, $d, $by) {
  $bulan = trim((string)(isset($d->bulan) ? $d->bulan : ''));
  if (!preg_match('/^\d{4}-\d{2}$/', $bulan)) throw new Exception('Bulan tidak sah (YYYY-MM)');
  $ms = hpp_ms(); $ub = hpp_txt($by, 120);
  $st = $pdo->prepare(
    'INSERT INTO hpp_pakai (bulan,bahan,sa,beli,resep,spoil,team,rnd,comp,opname,updated_at,updated_by)
     VALUES (:b,:n,:sa,:be,:re,:sp,:te,:rn,:co,:op,:ua,:ub)
     ON DUPLICATE KEY UPDATE sa=VALUES(sa), beli=VALUES(beli), resep=VALUES(resep),
       spoil=VALUES(spoil), team=VALUES(team), rnd=VALUES(rnd), comp=VALUES(comp),
       opname=VALUES(opname), updated_at=VALUES(updated_at), updated_by=VALUES(updated_by)');
  $n = 0;
  if (isset($d->baris) && is_array($d->baris)) {
    foreach ($d->baris as $r) {
      if (is_object($r)) $r = (array)$r;
      $nama = hpp_txt(isset($r['bahan']) ? $r['bahan'] : '', 190);
      if ($nama === '') continue;
      $st->execute(array(':b'=>$bulan, ':n'=>$nama,
        ':sa'=>hpp_num(isset($r['sa'])?$r['sa']:0),      ':be'=>hpp_num(isset($r['beli'])?$r['beli']:0),
        ':re'=>hpp_num(isset($r['resep'])?$r['resep']:0),':sp'=>hpp_num(isset($r['spoil'])?$r['spoil']:0),
        ':te'=>hpp_num(isset($r['team'])?$r['team']:0),  ':rn'=>hpp_num(isset($r['rnd'])?$r['rnd']:0),
        ':co'=>hpp_num(isset($r['comp'])?$r['comp']:0),  ':op'=>hpp_num(isset($r['opname'])?$r['opname']:0),
        ':ua'=>$ms, ':ub'=>$ub));
      $n++;
    }
  }
  $st3 = $pdo->prepare(
    'INSERT INTO hpp_bulan (bulan,penjualan,catatan,updated_at,updated_by) VALUES (:b,:p,:c,:ua,:ub)
     ON DUPLICATE KEY UPDATE penjualan=VALUES(penjualan), catatan=VALUES(catatan),
       updated_at=VALUES(updated_at), updated_by=VALUES(updated_by)');
  $st3->execute(array(':b'=>$bulan, ':p'=>hpp_num(isset($d->penjualan)?$d->penjualan:0),
                      ':c'=>hpp_txt(isset($d->catatan)?$d->catatan:'',255), ':ua'=>$ms, ':ub'=>$ub));
  return array('status'=>'success','saved'=>true,'bulan'=>$bulan,'baris'=>$n);
}

function hpp_simpan_bahan($pdo, $d, $by) {
  $nama = hpp_txt(isset($d->nama) ? $d->nama : '', 190);
  if ($nama === '') throw new Exception('Nama bahan kosong');
  $lama = hpp_txt(isset($d->namaLama) ? $d->namaLama : '', 190);
  /* Ganti nama = hapus baris lama sesudah baris baru berdiri. Resep menyimpan
     rujukan BERUPA NAMA, jadi penggantian nama tanpa menyentuh resep akan
     memutus rujukan diam-diam — karena itu resep ikut ditambal di bawah. */
  $st = $pdo->prepare(
    'INSERT INTO hpp_bahan (nama,satuan,qty_beli,harga_beli,vendor,produk,kategori,catatan,di_purchasing,sisi_harga,updated_at,updated_by)
     VALUES (:n,:s,:q,:h,:v,:p,:k,:c,:dp,:sh,:ua,:ub)
     ON DUPLICATE KEY UPDATE satuan=VALUES(satuan), qty_beli=VALUES(qty_beli),
       harga_beli=VALUES(harga_beli), vendor=VALUES(vendor), produk=VALUES(produk),
       kategori=VALUES(kategori), catatan=VALUES(catatan), di_purchasing=VALUES(di_purchasing),
       sisi_harga=VALUES(sisi_harga),
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
    /* Bahan raw bawaannya HARUS ada di purchasing; yang tidak dibeli dimatikan
       satu per satu. Bawaan sebaliknya (default mati) akan membuat ratusan
       bahan diam-diam hilang dari daftar belanja tanpa ada yang memutuskan. */
    ':dp' => (isset($d->di_purchasing) && !$d->di_purchasing) ? 0 : 1,
    /* Hanya dua kata yang diterima; apa pun selainnya jadi '' = belum
       diputuskan. Nilai bebas yang lolos ke sini akan membuat layar tidak
       mengenali sisinya lagi dan barisnya kembali jadi "bayangan" tanpa ada
       yang mengubah apa pun.

       Warisan `dibeli_jadi` masih diterima dari layar lama yang belum ikut
       ter-deploy: tanpa itu, satu deploy yang tertinggal separuh akan
       mengosongkan pilihan setiap kali orang menyimpan sebuah bahan. */
    ':sh' => (function ($d) {
      $s = isset($d->sisi_harga) ? strtolower(trim((string)$d->sisi_harga)) : '';
      if ($s === 'beli' || $s === 'resep') return $s;
      return (isset($d->dibeli_jadi) && $d->dibeli_jadi) ? 'beli' : '';
    })($d),
    ':ua' => hpp_ms(), ':ub' => hpp_txt($by, 120),
  ));
  $ikut = 0;
  if ($lama !== '' && $lama !== $nama) {
    $pdo->prepare('DELETE FROM hpp_bahan WHERE nama=:n')->execute(array(':n' => $lama));
    /* Pemakaian bulanan ikut pindah. Kuncinya (bulan, bahan), jadi bulan yang
       nama barunya SUDAH terisi dilewati — menimpanya berarti membuang angka
       opname yang sudah diketik orang. */
    $bl = $pdo->prepare('SELECT bulan FROM hpp_pakai WHERE bahan=:l');
    $bl->execute(array(':l' => $lama));
    $adaB = $pdo->prepare('SELECT COUNT(*) FROM hpp_pakai WHERE bahan=:b AND bulan=:m');
    $pindah = $pdo->prepare('UPDATE hpp_pakai SET bahan=:b WHERE bahan=:l AND bulan=:m');
    foreach ($bl->fetchAll(PDO::FETCH_COLUMN) as $m) {
      $adaB->execute(array(':b' => $nama, ':m' => $m));
      if ((int)$adaB->fetchColumn()) continue;
      $pindah->execute(array(':b' => $nama, ':l' => $lama, ':m' => $m));
    }
    /* Penanda pasangan lama ikut diarahkan ulang, kalau tidak ia menunjuk nama
       yang sudah tidak ada. */
    $pdo->prepare('UPDATE hpp_bahan SET produk=:b WHERE produk=:l')
        ->execute(array(':b' => $nama, ':l' => $lama));
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
       harga_lama,harga_baru,harga_upsize,modal_manual,catatan,bahan,aktif,di_purchasing,updated_at,updated_by)
     VALUES (:i,:n,:j,:t,:s,:yq,:yu,:hl,:hb,:hu,:mm,:c,:b,:a,:dp,:ua,:ub)
     ON DUPLICATE KEY UPDATE nama=VALUES(nama), jenis=VALUES(jenis), tipe=VALUES(tipe),
       seksi=VALUES(seksi), yield_qty=VALUES(yield_qty), yield_unit=VALUES(yield_unit),
       harga_lama=VALUES(harga_lama), harga_baru=VALUES(harga_baru),
       harga_upsize=VALUES(harga_upsize), modal_manual=VALUES(modal_manual),
       catatan=VALUES(catatan), bahan=VALUES(bahan),
       aktif=VALUES(aktif), di_purchasing=VALUES(di_purchasing),
       updated_at=VALUES(updated_at), updated_by=VALUES(updated_by)');
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
    /* Resep dibuat sendiri, jadi bawaannya TIDAK berdiri di purchasing.
       Dinyalakan hanya untuk base yang diproduksi Central Kitchen lalu diambil
       outlet — itu memang barang yang dipesan lewat sana. */
    ':dp' => (isset($d->di_purchasing) && $d->di_purchasing) ? 1 : 0,
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

/* IMPOR BAHAN DARI EXCEL/CSV (17 Agustus 2026, permintaan user).
 *
 * Beda dari hpp_impor di atas, yang sekali-jalan untuk pemindahan awal dan
 * MENOLAK bila tabelnya sudah berisi. Yang ini justru dipakai berulang: daftar
 * harga baru dari vendor disunting di Excel lalu diunggah kembali.
 *
 * TIDAK MENGHAPUS APA PUN. Bahan yang ada di tabel tapi tidak ada di berkas
 * dibiarkan — berkas yang tidak lengkap (orang menyaring dulu di Excel lalu
 * menyimpan) tidak boleh berarti "sisanya sudah tidak ada".
 *
 * TIDAK MENGGANTI NAMA: `namaLama` dibuang paksa. Nama di berkas yang berbeda
 * dari yang tersimpan berarti bahan BARU — tidak ada kolom yang bisa
 * memberitahu mana yang sebenarnya bahan lama yang berganti nama, dan tebakan
 * yang salah memutus rujukan di ribuan baris resep tanpa satu pun galat.
 *
 * Barisnya sudah DIGABUNG dengan data lama di layar (lihat siapkanImpor),
 * jadi di sini ia disimpan apa adanya lewat jalur simpan yang sama — satu
 * penulis, satu aturan. Yang tidak dilakukan dan itu disengaja: mendaftarkan
 * bahan baru ke basis purchasing. Satu berkas bisa membawa ratusan nama, dan
 * membanjiri modul tetangga adalah keputusan orang, bukan efek samping sebuah
 * unggahan; tombol "Daftarkan semuanya" di layar sudah menyediakan jalannya.
 */
/* IMPOR RESEP DARI EXCEL/CSV (4 September 2026, permintaan user).
 *
 * Beda dari hpp_impor() di atas, yang MENGHAPUS SELURUH TABEL saat $timpa dan
 * memang cuma untuk pemindahan awal sekali jalan. Yang ini dipakai berulang:
 * daftar resep disunting di Excel lalu diunggah kembali.
 *
 * TIDAK MENGHAPUS RESEP. Resep yang ada di tabel tapi tidak ada di berkas
 * dibiarkan — berkas yang cuma memuat sebagian (orang menyaring dulu di Excel)
 * tidak boleh berarti "sisanya sudah tidak ada".
 *
 * TAPI BARIS BAHAN DI DALAM RESEP YANG IKUT DI BERKAS MEMANG DIGANTI UTUH, dan
 * itu tidak bisa dihindari: satu resep = beberapa baris berkas, jadi baris yang
 * dihapus orang di Excel adalah satu-satunya cara ia menyatakan "bahan ini
 * sudah tidak dipakai". Layar mengatakannya terang-terangan sebelum menulis.
 *
 * Barisnya sudah DIGABUNG dengan data lama di layar (id resep lama
 * dipertahankan di sana), jadi di sini ia disimpan apa adanya lewat jalur
 * simpan yang sama — satu penulis, satu aturan.
 */
function hpp_impor_resep($pdo, $rows, $by) {
  if (!is_array($rows)) return array('status' => 'error', 'message' => 'rows bukan array');
  /* Id yang sudah ada dikumpulkan SEKALI di depan; angka "baru" harus dihitung
     SEBELUM barisnya ditulis — sesudahnya semua baris terlihat sudah ada. */
  $ada = array();
  foreach ($pdo->query('SELECT id FROM hpp_resep')->fetchAll(PDO::FETCH_COLUMN) as $i) {
    $ada[(string)$i] = true;
  }
  $baru = 0; $ubah = 0; $lewat = 0; $galat = array();
  foreach ($rows as $r) {
    if (is_array($r)) $r = (object)$r;
    if (!is_object($r)) { $lewat++; continue; }
    $nm = hpp_txt(isset($r->nama) ? $r->nama : '', 190);
    if ($nm === '') { $lewat++; continue; }
    $id = hpp_txt(isset($r->id) ? $r->id : '', 48);
    $sebelum = ($id !== '' && isset($ada[$id]));
    try {
      hpp_simpan_resep($pdo, $r, $by);
    } catch (Throwable $e) {
      /* Satu resep yang gagal TIDAK menjatuhkan seluruh unggahan — 364 resep
         yang benar tidak boleh hilang karena satu nama yang kepanjangan.
         Namanya dipulangkan supaya yang gagal bisa DISEBUT di layar. */
      error_log('[stock/hpp] impor resep "' . $nm . '" gagal: ' . $e->getMessage());
      $galat[] = $nm;
      continue;
    }
    if ($sebelum) $ubah++; else $baru++;
  }
  return array('status' => 'success', 'saved' => true,
               'baru' => $baru, 'diubah' => $ubah, 'lewat' => $lewat, 'galat' => $galat);
}

function hpp_impor_bahan($pdo, $rows, $by) {
  if (!is_array($rows)) return array('status' => 'error', 'message' => 'rows bukan array');
  /* Daftar nama yang sudah ada dikumpulkan SEKALI di depan. Menanyakannya per
     baris berarti 300 query untuk pertanyaan yang jawabannya tidak berubah,
     dan angka "baru" harus dihitung SEBELUM barisnya ditulis — sesudahnya
     semua baris terlihat sudah ada. */
  $ada = array();
  foreach ($pdo->query('SELECT nama FROM hpp_bahan')->fetchAll(PDO::FETCH_COLUMN) as $n) {
    $ada[mb_strtolower((string)$n)] = true;
  }
  $baru = 0; $ubah = 0; $lewat = 0; $galat = array();
  foreach ($rows as $r) {
    if (is_array($r)) $r = (object)$r;
    if (!is_object($r)) { $lewat++; continue; }
    $nm = hpp_txt(isset($r->nama) ? $r->nama : '', 190);
    if ($nm === '') { $lewat++; continue; }
    unset($r->namaLama);
    $k = mb_strtolower($nm);
    $sebelum = isset($ada[$k]);
    try {
      hpp_simpan_bahan($pdo, $r, $by);
    } catch (Throwable $e) {
      /* Satu baris yang gagal TIDAK menjatuhkan seluruh unggahan: 299 harga
         yang benar tidak boleh hilang karena satu nama yang kepanjangan.
         Namanya dipulangkan supaya yang gagal bisa disebut di layar, bukan
         cuma dihitung. */
      error_log('[stock/hpp] impor bahan "' . $nm . '" gagal: ' . $e->getMessage());
      $galat[] = $nm;
      continue;
    }
    if ($sebelum) $ubah++; else { $baru++; $ada[$k] = true; }
  }
  return array('status' => 'success', 'saved' => true, 'baru' => $baru,
               'diubah' => $ubah, 'dilewati' => $lewat, 'galat' => $galat);
}

try {
  $pdo = pur_pdo();
  hpp_pastikan_tabel($pdo);
  hpp_pastikan_tabel2($pdo);
  hpp_pastikan_kolom($pdo);

  if ($metode === 'GET') {
    pur_cek_token();
    if ($aksiUrl === 'pakai') {
      $bl = isset($_GET['bulan']) ? trim((string)$_GET['bulan']) : '';
      if (!preg_match('/^\d{4}-\d{2}$/', $bl)) $bl = gmdate('Y-m');
      pur_json(hpp_pakai_ambil($pdo, $bl));
    }
    pur_json(hpp_ambil($pdo));
  }

  if ($metode === 'POST') {
    $b = pur_body();
    if (!$b) pur_json(['status' => 'error', 'message' => 'body bukan JSON'], 400);
    pur_cek_token($b);
    $a  = isset($b->action) ? $b->action : '';
    $by = isset($b->by) ? $b->by : '';
    if ($a === 'simpanBahan') {
      $d = $b->data ?? new stdClass();
      $nm = hpp_txt(isset($d->nama) ? $d->nama : '', 190);
      /* Bahan BARU di HPP ikut didaftarkan ke Purchasing (permintaan user
         14 Agustus 2026: penambahan dari sisi mana pun harus menambah di
         keduanya). Diperiksa SEBELUM menyimpan — sesudahnya barisnya sudah ada
         dan "baru" tidak bisa dibedakan dari "disunting".

         Yang dikirim cuma nama + satuan. Vendor, kategori, dan cara beli
         dibiarkan kosong supaya purchasing yang memutuskan; menebak isian milik
         modul lain berarti mengarang data atas nama orang lain.

         SENGAJA TIDAK DILAKUKAN saat impor awal (hpp_impor) — 296 bahan
         sekaligus akan membanjiri daftar purchasing dengan nama yang belum
         tentu mereka beli. */
      $hasil = hpp_simpan_bahan($pdo, $d, $by);
      /* MENYALAKAN SAKLARNYA SUDAH CUKUP untuk mendaftarkan bahan ke purchasing
         — tidak perlu bahan itu baru (14 Agustus 2026, permintaan user:
         "ketika saya klik bahan ini dibeli lewat purchasing, datanya otomatis
         ditambahkan di halaman purchasing"). Sebelumnya pendaftaran hanya
         terjadi untuk bahan yang baru dibuat, jadi mencentang saklar pada 179
         bahan lama tidak menghasilkan apa pun dan tidak ada yang menjelaskan
         kenapa.

         Aman diulang: produk yang sudah ada di sana dilewati, jadi menyimpan
         bahan yang sama dua kali tidak menimpa vendor/kategori yang sudah diisi
         purchasing. */
      if (!(isset($d->di_purchasing) && !$d->di_purchasing)) {
        try {
          $ada = $pdo->prepare('SELECT COUNT(*) FROM products WHERE nama=:n');
          $ada->execute(array(':n' => $nm));
          if (!(int)$ada->fetchColumn()) {
            $sat = hpp_txt(isset($d->satuan) ? $d->satuan : '', 32);
            pur_product_simpan($pdo, $nm, '', array(), '', $sat !== '' ? array($sat) : array());
            $hasil['purchasingBaru'] = true;
          }
        } catch (Throwable $e) {
          error_log('[stock/hpp] daftar ke purchasing gagal: ' . $e->getMessage());
          $hasil['purchasingGagal'] = true;
        }
      }
      pur_json($hasil);
    }
    /* Impor massal dari Excel/CSV (halaman Bahan & Harga). Upsert berdasarkan
       NAMA; tidak ada yang dihapus, tidak ada yang diganti nama. Lihat catatan
       panjang di hpp_impor_bahan. */
    if ($a === 'imporBahan') {
      pur_json(hpp_impor_bahan($pdo, isset($b->rows) ? $b->rows : null, $by));
    }
    /* SEKALI JALAN: tarik semua bahan purchasing yang belum punya baris di HPP.
       Penyambungan otomatis di atas cuma menangkap produk yang DISIMPAN sejak
       hari ini; ratusan produk yang sudah ada sebelumnya tidak akan pernah
       lewat sana. */
    /* GABUNGKAN dua bahan. Dipakai saat pasangan lama menunjuk nama yang sudah
       dipakai bahan lain — ganti nama otomatis menolak kasus ini karena
       menggabung dua bahan berharga beda itu keputusan manusia.

       Yang digabung cuma RUJUKANNYA: baris resep yang memakai `dari` dialihkan
       ke `ke`, pemakaian bulanan ikut pindah kalau bulannya belum terisi, lalu
       baris `dari` dihapus. Harga `ke` TIDAK disentuh — yang dipilih user
       sebagai tujuan adalah yang dianggap benar. */
    if ($a === 'gabungBahan') {
      $dari = hpp_txt($b->dari ?? '', 190);
      $ke   = hpp_txt($b->ke ?? '', 190);
      /* Penolakan yang WAJAR dipulangkan dengan HTTP 200 + status error, bukan
         4xx. Server Rumahweb mengganti badan balasan non-200 dengan halaman
         galatnya sendiri, jadi pesan yang dikirim lewat 400/500 sampai ke
         peramban sebagai badan KOSONG — layar cuma bisa bilang "Gagal:" tanpa
         sebab. Terbukti 14 Agustus 2026 saat menguji endpoint ini di dev. */
      if ($dari === '' || $ke === '' || $dari === $ke) {
        pur_json(array('status' => 'error', 'message' => 'Nama gabung tidak sah'));
      }
      $c = $pdo->prepare('SELECT COUNT(*) FROM hpp_bahan WHERE nama=:n');
      $c->execute(array(':n' => $ke));
      if (!(int)$c->fetchColumn()) {
        pur_json(array('status' => 'error', 'message' => 'Bahan tujuan "' . $ke . '" tidak ada'));
      }
      $nResep = 0;
      $st = $pdo->query('SELECT id,bahan FROM hpp_resep');
      $tulis = $pdo->prepare('UPDATE hpp_resep SET bahan=:b WHERE id=:i');
      foreach ($st->fetchAll(PDO::FETCH_ASSOC) as $r) {
        $baris = json_decode((string)$r['bahan'], true);
        if (!is_array($baris)) continue;
        $ubah = false;
        foreach ($baris as &$ln) {
          if (isset($ln['nama']) && $ln['nama'] === $dari) { $ln['nama'] = $ke; $ubah = true; }
        }
        unset($ln);
        if ($ubah) { $tulis->execute(array(':b' => json_encode($baris, JSON_UNESCAPED_UNICODE), ':i' => $r['id'])); $nResep++; }
      }
      $bl = $pdo->prepare('SELECT bulan FROM hpp_pakai WHERE bahan=:l'); $bl->execute(array(':l' => $dari));
      $adaB = $pdo->prepare('SELECT COUNT(*) FROM hpp_pakai WHERE bahan=:b AND bulan=:m');
      $pindah = $pdo->prepare('UPDATE hpp_pakai SET bahan=:b WHERE bahan=:l AND bulan=:m');
      foreach ($bl->fetchAll(PDO::FETCH_COLUMN) as $m) {
        $adaB->execute(array(':b' => $ke, ':m' => $m));
        if ((int)$adaB->fetchColumn()) continue;
        $pindah->execute(array(':b' => $ke, ':l' => $dari, ':m' => $m));
      }
      $pdo->prepare('DELETE FROM hpp_pakai WHERE bahan=:l')->execute(array(':l' => $dari));
      $pdo->prepare('DELETE FROM hpp_bahan WHERE nama=:l')->execute(array(':l' => $dari));
      pur_json(array('status'=>'success','saved'=>true,'resep'=>$nResep));
    }
    if ($a === 'tarikProduk') {
      require_once __DIR__ . '/lib_hpp_nama.php';
      $n = 0;
      foreach ($pdo->query('SELECT nama, data FROM products')->fetchAll(PDO::FETCH_ASSOC) as $p) {
        $sat = array();
        $j = json_decode((string)$p['data'], true);
        if (is_array($j) && isset($j['satuan']) && is_array($j['satuan'])) $sat = $j['satuan'];
        if (hpp_ikut_tambah($pdo, $p['nama'], $sat)) $n++;
      }
      pur_json(array('status'=>'success','saved'=>true,'ditarik'=>$n));
    }
    if ($a === 'hapusBahan') {
      $n = hpp_txt($b->nama ?? '', 190);
      $pdo->prepare('DELETE FROM hpp_bahan WHERE nama=:n')->execute(array(':n' => $n));
      pur_json(['status' => 'success', 'saved' => true]);
    }
    /* HAPUS BAYANGAN — bahan yang namanya ada di Daftar Resep (15 Agustus 2026),
       DIPERSEMPIT 17 Agustus 2026.

       Aturan lamanya menyapu SETIAP tabrakan nama, dengan anggapan barang yang
       bernama sama dengan resep pasti barang buatan sendiri yang barisnya cuma
       bayangan. Anggapan itu salah untuk barang yang DIBELI dan kebetulan
       bernama sama dengan menunya — Dimsum Ayam, Indomie Goreng, Sate Taichan —
       dan tombol ini akan menghapus harga belinya tanpa bisa dikembalikan.

       Tiga hal yang sekarang menyelamatkan sebuah baris — sama persis dengan
       tabrakan() di layar, dan kesamaan itu WAJIB dijaga: aturan yang menyimpang
       sedikit saja membuat tombol berkata "Hapus 1" lalu menghapus dua:
         1. `sisi_harga` sudah diisi ('beli' atau 'resep'),
         2. yang bertabrakan dengannya adalah resep bertipe BASE — base olahan
            seperti Ayam Karage & Sate Lilit, yang barisnya di sini memang cuma
            penopang nama supaya bisa dipesan ke Central Kitchen. Ia TIDAK
            pernah jadi calon hapus, dipakai atau tidak,
         3. ada baris resep yang memakainya sebagai Bahan (`ref` != 'resep').
       Syarat 3 tidak bisa ditulis sebagai SQL: baris bahan sebuah resep
       disimpan sebagai JSON di kolom `bahan`, jadi ia disaring di PHP.

       Tetap dihitung DI SERVER, bukan menerima daftar nama dari layar: layar
       cuma memegang halaman yang sedang tampil, dan daftar yang dikirim
       sebagian akan menyisakan sisanya tanpa ada yang tahu. Aturannya harus
       sama persis dengan tabrakan() di layar — kalau menyimpang, angka di
       tombol tidak pernah sama dengan yang benar-benar terhapus.

       TIDAK menyentuh hpp_resep sama sekali: yang dibuang bayangannya, bukan
       resepnya. */
    if ($a === 'hapusBahanSamaResep') {
      // Nama yang dipakai sebagai BAHAN oleh baris resep mana pun.
      $dipakai = array();
      foreach ($pdo->query('SELECT bahan FROM hpp_resep')->fetchAll(PDO::FETCH_COLUMN) as $js) {
        $baris = json_decode((string)$js, true);
        if (!is_array($baris)) continue;
        foreach ($baris as $ln) {
          if (!is_array($ln) || !isset($ln['nama'])) continue;
          if (isset($ln['ref']) && $ln['ref'] === 'resep') continue;
          $dipakai[mb_strtolower(trim((string)$ln['nama']))] = true;
        }
      }
      /* NOT IN (… tipe='base') memakai daftar base SELURUHNYA, bukan
         "tipe <> 'base'" pada baris yang bertabrakan: satu nama bisa berdiri
         dua kali di hpp_resep (mis. base "Sate Lilit" dan menu "Sate Lilit"),
         dan syarat yang cuma melihat salah satunya akan menghapus penopang
         nama sebuah base. */
      $st = $pdo->query("SELECT b.nama FROM hpp_bahan b
                          WHERE b.sisi_harga = ''
                            AND LOWER(b.nama) IN (SELECT LOWER(r.nama) FROM hpp_resep r)
                            AND LOWER(b.nama) NOT IN (SELECT LOWER(r2.nama) FROM hpp_resep r2 WHERE r2.tipe = 'base')");
      $nama = array();
      foreach ($st->fetchAll(PDO::FETCH_COLUMN) as $n) {
        if (isset($dipakai[mb_strtolower(trim((string)$n))])) continue;
        $nama[] = $n;
      }
      /* Dihapus SATU PER SATU dengan nama yang sudah disaring, bukan lewat satu
         DELETE ... IN (subquery): subquery-nya tidak bisa memuat syarat "dipakai
         sebagai bahan", jadi ia akan menghapus lebih banyak daripada yang
         dihitung — dan angka yang dilaporkan ke layar jadi bohong. */
      $hapus = $pdo->prepare('DELETE FROM hpp_bahan WHERE nama=:n');
      foreach ($nama as $n) $hapus->execute(array(':n' => $n));
      pur_json(['status' => 'success', 'dihapus' => count($nama), 'nama' => array_slice($nama, 0, 50)]);
    }
    if ($a === 'simpanResep') {
      $d = $b->data ?? new stdClass();
      $hasil = hpp_simpan_resep($pdo, $d, $by);
      /* Base yang ditandai "ada di purchasing" didaftarkan sebagai barang
         produksi Central Kitchen (`sumber:'ck'`) — penanda yang memang sudah
         dipakai purchasing untuk barang yang tidak dibeli ke vendor tapi tetap
         dipesan outlet. Tanpa penanda itu, ia akan muncul di daftar belanja
         vendor sebagai barang yang tidak pernah bisa dibeli dari siapa pun. */
      if (!empty($d->di_purchasing)) {
        $nmR = hpp_txt(isset($d->nama) ? $d->nama : '', 190);
        try {
          $adaP = $pdo->prepare('SELECT COUNT(*) FROM products WHERE nama=:n');
          $adaP->execute(array(':n' => $nmR));
          if ($nmR !== '' && !(int)$adaP->fetchColumn()) {
            $satR = hpp_txt(isset($d->yield_unit) ? $d->yield_unit : '', 32);
            pur_product_simpan($pdo, $nmR, '', array(), '', $satR !== '' ? array($satR) : array(),
                               null, null, null, 'ck');
            $hasil['purchasingBaru'] = true;
          }
        } catch (Throwable $e) {
          error_log('[stock/hpp] daftar resep ke purchasing gagal: ' . $e->getMessage());
          $hasil['purchasingGagal'] = true;
        }
      }
      pur_json($hasil);
    }
    if ($a === 'hapusResep') {
      $i = hpp_txt($b->id ?? '', 48);
      $pdo->prepare('DELETE FROM hpp_resep WHERE id=:i')->execute(array(':i' => $i));
      pur_json(['status' => 'success', 'saved' => true]);
    }
    if ($a === 'impor') pur_json(hpp_impor($pdo, $b->data ?? new stdClass(), $by, !empty($b->timpa)));
    /* Dipakai berulang dari layar Daftar Resep; TIDAK menghapus resep yang
       tidak ada di berkas. Lihat catatan di hpp_impor_resep(). */
    if ($a === 'imporResep') pur_json(hpp_impor_resep($pdo, $b->rows ?? array(), $by));
    /* SAMAKAN NAMA DENGAN PURCHASING (14 Agustus 2026, permintaan user).
       Pencocokan dihapus sebagai konsep: nama bahan di HPP harus SAMA PERSIS
       dengan nama di basis purchasing, supaya bahan baru di sana langsung
       terpakai di sini tanpa disandingkan siapa pun.

       Pekerjaan menyandingkan yang sudah terlanjur dilakukan TIDAK dibuang —
       justru dipakai sekali sebagai peta ganti nama: tiap bahan yang punya
       pasangan diganti namanya jadi nama purchasing, seluruh baris resep yang
       merujuknya ikut ditambal (lihat hpp_simpan_bahan), lalu penandanya
       dikosongkan supaya tidak ada yang membacanya lagi.

       Nama tujuan yang SUDAH dipakai baris lain sengaja dilewati dan
       dilaporkan: menggabung dua bahan berharga beda adalah keputusan manusia,
       bukan sesuatu yang boleh diputuskan skrip. */
    if ($a === 'samakanNama') {
      $rows = $pdo->query("SELECT * FROM hpp_bahan WHERE produk<>'' AND produk<>'-'")->fetchAll(PDO::FETCH_ASSOC);
      $ada = array();
      foreach ($pdo->query('SELECT nama FROM hpp_bahan')->fetchAll(PDO::FETCH_COLUMN) as $n) $ada[$n] = 1;
      $ganti = 0; $bersih = 0; $bentrok = array();
      foreach ($rows as $r) {
        if ($r['produk'] === $r['nama']) {
          $pdo->prepare("UPDATE hpp_bahan SET produk='' WHERE nama=:n")->execute(array(':n' => $r['nama']));
          $bersih++; continue;
        }
        if (isset($ada[$r['produk']])) { $bentrok[] = $r['nama'] . ' → ' . $r['produk']; continue; }
        $d = (object)array('nama' => $r['produk'], 'namaLama' => $r['nama'],
                           'satuan' => $r['satuan'], 'qty_beli' => $r['qty_beli'],
                           'harga_beli' => $r['harga_beli'], 'vendor' => $r['vendor'],
                           'produk' => '', 'kategori' => $r['kategori'], 'catatan' => $r['catatan']);
        hpp_simpan_bahan($pdo, $d, $by);
        unset($ada[$r['nama']]); $ada[$r['produk']] = 1;
        $ganti++;
      }
      pur_json(array('status'=>'success','saved'=>true,'ganti'=>$ganti,'bersih'=>$bersih,
                     'bentrok'=>$bentrok));
    }
    if ($a === 'simpanPakai') pur_json(hpp_pakai_simpan($pdo, $b->data ?? new stdClass(), $by));
    if ($a === 'simpanSetting') {
      $lama = hpp_setting_baca($pdo);
      $baru = (array)($b->data ?? new stdClass());
      foreach ($baru as $k => $v) if (array_key_exists($k, $lama)) $lama[$k] = hpp_num($v);
      $st = $pdo->prepare('INSERT INTO hpp_setting (id,data) VALUES (1,:d) ON DUPLICATE KEY UPDATE data=VALUES(data)');
      $st->execute(array(':d' => json_encode($lama, JSON_UNESCAPED_UNICODE)));
      pur_json(array('status'=>'success','saved'=>true,'setting'=>$lama));
    }
    pur_json(['status' => 'error', 'message' => 'action tidak dikenal: ' . $a], 400);
  }
  pur_json(['status' => 'error', 'message' => 'metode tidak didukung'], 405);
} catch (Throwable $e) {
  error_log('[stock/hpp] ' . $e->getMessage());
  pur_json(['status' => 'error', 'message' => 'kesalahan server: ' . $e->getMessage()], 500);
}
