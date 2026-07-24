-- ====================================================================
-- STOCK — MIGRASI: tabel SERAH TERIMA (pengeluaran ke Kitchen/Bar)
-- --------------------------------------------------------------------
-- Jalankan SEKALI di tiap database stock yang SUDAH ada
-- (lakk5493_db_dev_stock dan lakk5493_db_stock). Database baru tidak
-- perlu file ini — schema.sql sudah memuat tabelnya.
--
-- phpMyAdmin: pilih database > tab "SQL" > tempel > Go. Aman diulang.
--
-- Field `area` produk (Bar/Kitchen/Umum) dan field buku-stok Daily SO
-- (opening/masuk) TIDAK butuh migrasi: keduanya disimpan di dalam kolom
-- JSON `data` yang sudah ada, jadi hanya perlu upload ulang lib PHP-nya.
-- ====================================================================

CREATE TABLE IF NOT EXISTS serah_terima (
  id        VARCHAR(64)  NOT NULL PRIMARY KEY,
  tanggal   VARCHAR(20)  NOT NULL DEFAULT '',
  tujuan    VARCHAR(20)  NOT NULL DEFAULT '',   -- Kitchen | Bar
  penerima  VARCHAR(120) NOT NULL DEFAULT '',
  pic       VARCHAR(120) NOT NULL DEFAULT '',
  tim       VARCHAR(20)  NOT NULL DEFAULT '',
  waktu     VARCHAR(30)  NOT NULL DEFAULT '',
  foto      LONGTEXT     NOT NULL,
  foto_nama VARCHAR(190) NOT NULL DEFAULT '',
  data      LONGTEXT     NOT NULL,
  KEY idx_srh_tgl (tanggal),
  KEY idx_srh_tujuan (tujuan)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
