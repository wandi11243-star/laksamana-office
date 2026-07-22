-- =====================================================================
-- MIGRASI: tiga tabel baru — usage_events, waste, opname.
-- Tanggal: 2026-07-22
-- ---------------------------------------------------------------------
-- Untuk database yang SUDAH ADA (dev & prod). schema.sql memuat tabel ini
-- untuk database baru, tapi `CREATE TABLE IF NOT EXISTS` di sana tidak
-- pernah dijalankan lagi di database yang sudah berdiri.
--
-- AMAN DIULANG: seluruhnya CREATE TABLE IF NOT EXISTS, tidak ada ALTER dan
-- tidak ada DROP. Menjalankannya dua kali tidak mengubah apa pun.
--
-- TIDAK MENYENTUH tabel yang sudah ada. Orders, products, stock, dan
-- kawan-kawan tidak berubah sama sekali.
--
-- Jalankan di dev (lakk5493_db_dev_stock) dulu, pastikan modulnya jalan,
-- baru ke prod (lakk5493_db_stock).
-- =====================================================================

SET NAMES utf8mb4;

-- Bahan baku yang dipakai untuk sebuah event.
CREATE TABLE IF NOT EXISTS usage_events (
  id         VARCHAR(64)  NOT NULL PRIMARY KEY,
  tanggal    VARCHAR(20)  NOT NULL DEFAULT '',
  jenis      VARCHAR(40)  NOT NULL DEFAULT '',
  nama_event VARCHAR(190) NOT NULL DEFAULT '',
  status     VARCHAR(20)  NOT NULL DEFAULT 'Rencana',
  pic        VARCHAR(120) NOT NULL DEFAULT '',
  tim        VARCHAR(20)  NOT NULL DEFAULT '',
  waktu      VARCHAR(30)  NOT NULL DEFAULT '',
  data       LONGTEXT     NOT NULL,
  KEY idx_ue_tgl (tanggal),
  KEY idx_ue_jenis (jenis),
  KEY idx_ue_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Produk terbuang. `foto` sengaja kolom sendiri: ia tidak pernah ikut saat
-- daftar dimuat, hanya ditarik satu per satu ketika dibuka.
CREATE TABLE IF NOT EXISTS waste (
  id        VARCHAR(64)  NOT NULL PRIMARY KEY,
  tanggal   VARCHAR(20)  NOT NULL DEFAULT '',
  item      VARCHAR(190) NOT NULL DEFAULT '',
  qty       DOUBLE       NOT NULL DEFAULT 0,
  unit      VARCHAR(40)  NOT NULL DEFAULT '',
  sebab     VARCHAR(40)  NOT NULL DEFAULT '',
  pic       VARCHAR(120) NOT NULL DEFAULT '',
  tim       VARCHAR(20)  NOT NULL DEFAULT '',
  waktu     VARCHAR(30)  NOT NULL DEFAULT '',
  foto      LONGTEXT     NOT NULL,
  foto_nama VARCHAR(190) NOT NULL DEFAULT '',
  data      LONGTEXT     NOT NULL,
  KEY idx_w_tgl (tanggal),
  KEY idx_w_item (item),
  KEY idx_w_sebab (sebab)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Hitung fisik harian.
CREATE TABLE IF NOT EXISTS opname (
  id      VARCHAR(64)  NOT NULL PRIMARY KEY,
  tanggal VARCHAR(20)  NOT NULL DEFAULT '',
  pic     VARCHAR(120) NOT NULL DEFAULT '',
  tim     VARCHAR(20)  NOT NULL DEFAULT '',
  status  VARCHAR(20)  NOT NULL DEFAULT 'Draft',
  waktu   VARCHAR(30)  NOT NULL DEFAULT '',
  data    LONGTEXT     NOT NULL,
  KEY idx_op_tgl (tanggal),
  KEY idx_op_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Cek hasilnya:
--   SHOW TABLES LIKE 'usage_events';
--   SHOW TABLES LIKE 'waste';
--   SHOW TABLES LIKE 'opname';
