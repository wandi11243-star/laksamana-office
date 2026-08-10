-- =====================================================================
-- FINANCE LAKSAMANA — SKEMA MySQL (Kas Kecil)
-- ---------------------------------------------------------------------
-- MENJALANKAN BERKAS INI OPSIONAL. lib_finance_mysql.php membuat keempat
-- tabel ini sendiri (CREATE TABLE IF NOT EXISTS) di awal setiap permintaan,
-- dan itu disengaja: migrasi-*.sql di repo ini tidak ikut ter-deploy lewat
-- FTP, produksi sering tertinggal, dan gejalanya adalah endpoint baru yang
-- membalas 500 sementara tetangganya 200. Berkas ini untuk dibaca manusia
-- yang ingin tahu bentuk datanya, dan untuk memasang skema di database
-- kosong tanpa menunggu permintaan pertama.
--
-- BUKAN blob JSON — berbeda dari kompas-api-mysql yang berdiri di sebelahnya.
-- Kompas dipakai satu penyunting; kas kecil dicatat beberapa orang finance di
-- jam yang berdekatan, dan blob satu baris membuat yang menyimpan belakangan
-- menghapus catatan yang lain tanpa satu pun pesan galat.
--
-- SALDO TIDAK ADA DI SINI, dan jangan ditambahkan. Ia dihitung ulang dari
-- seluruh riwayat pos (urut tgl lalu id) tiap kali dibaca. Menyimpannya
-- berarti dua sumber kebenaran untuk angka yang sama, dan yang satu pasti
-- ketinggalan begitu ada transaksi disisipkan bertanggal mundur.
-- =====================================================================

-- Pos = sumber uangnya (Kas Kecil, PO, …). Tiap pos punya saldo berjalan
-- sendiri. Sengaja DATA, bukan kolom: menambah pos ketiga di lembar
-- spreadsheet berarti menyisipkan tiga kolom dan memperbaiki semua rumus.
CREATE TABLE IF NOT EXISTS `kk_pos` (
  `id`    INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `nama`  VARCHAR(120) NOT NULL,
  `urut`  INT          NOT NULL DEFAULT 0,
  `aktif` TINYINT(1)   NOT NULL DEFAULT 1,   -- 0 = tidak muncul di form input
  UNIQUE KEY `uq_pos_nama` (`nama`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Kategori = jenis belanjanya (SP, RND, COGS, …). Untuk menyaring & merekap;
-- TIDAK memengaruhi saldo.
CREATE TABLE IF NOT EXISTS `kk_kategori` (
  `id`    INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `nama`  VARCHAR(120) NOT NULL,
  `urut`  INT          NOT NULL DEFAULT 0,
  `aktif` TINYINT(1)   NOT NULL DEFAULT 1,
  UNIQUE KEY `uq_kat_nama` (`nama`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Satu baris = satu transaksi. `input` = sudah masuk pembukuan,
-- `bon` = nota fisik sudah ada. Keduanya penanda administrasi yang dicentang
-- BELAKANGAN, sering oleh orang lain dan berhari-hari sesudahnya — itu sebab
-- ada endpoint `tandai` tersendiri yang tidak menyentuh isi transaksinya.
CREATE TABLE IF NOT EXISTS `kk_trx` (
  `id`          INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `tgl`         DATE         NOT NULL,
  `keterangan`  VARCHAR(255) NOT NULL DEFAULT '',
  `kategori_id` INT UNSIGNED NULL,               -- NULL = tanpa kategori
  `input`       TINYINT(1)   NOT NULL DEFAULT 0,
  `bon`         TINYINT(1)   NOT NULL DEFAULT 0,
  `dibuat_at`   BIGINT       NOT NULL DEFAULT 0, -- epoch ms
  `dibuat_oleh` VARCHAR(120) NOT NULL DEFAULT '',
  KEY `idx_trx_tgl` (`tgl`),
  -- SET NULL, bukan CASCADE: menghapus kategori tidak boleh ikut menghapus
  -- transaksinya. (Kategori yang sudah terpakai memang ditolak dihapus di
  -- lib; ini jaring pengaman kalau ada yang menghapusnya lewat phpMyAdmin.)
  CONSTRAINT `fk_trx_kat` FOREIGN KEY (`kategori_id`)
    REFERENCES `kk_kategori`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Pembagian satu transaksi ke beberapa pos. Contoh nyata dari lembar yang
-- digantikan: belanja Rp351.300 dibayar Rp26.150 dari Kas Kecil dan
-- Rp325.150 lewat PO — dua baris di sini, satu transaksi di kk_trx.
--
-- UNIQUE (trx_id,pos_id) menahan bug diam-diam: dua baris untuk pos yang sama
-- pada satu transaksi akan terhitung dua kali di saldo, dan tidak ada satu pun
-- tempat yang melaporkannya.
CREATE TABLE IF NOT EXISTS `kk_trx_pos` (
  `id`     INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `trx_id` INT UNSIGNED NOT NULL,
  `pos_id` INT UNSIGNED NOT NULL,
  `debet`  BIGINT       NOT NULL DEFAULT 0,   -- uang masuk ke pos ini
  `kredit` BIGINT       NOT NULL DEFAULT 0,   -- uang keluar dari pos ini
  UNIQUE KEY `uq_trx_pos` (`trx_id`,`pos_id`),
  KEY `idx_tp_pos` (`pos_id`),
  CONSTRAINT `fk_tp_trx` FOREIGN KEY (`trx_id`)
    REFERENCES `kk_trx`(`id`) ON DELETE CASCADE,
  -- TANPA ON DELETE untuk pos: pos yang sudah dipakai memang tidak boleh
  -- dihapus (lihat hapus_pos()), dan constraint inilah penjaga terakhirnya.
  CONSTRAINT `fk_tp_pos` FOREIGN KEY (`pos_id`)
    REFERENCES `kk_pos`(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Isi awal. lib menjalankan ini sendiri HANYA saat tabelnya benar-benar masih
-- kosong — tanpa pos, form Input Transaksi tidak bisa diisi sama sekali.
INSERT IGNORE INTO `kk_pos` (`nama`,`urut`) VALUES
  ('Kas Kecil', 10), ('Pengajuan Pembayaran (PO)', 20), ('Pengajuan Pembayaran', 30);

INSERT IGNORE INTO `kk_kategori` (`nama`,`urut`) VALUES
  ('SP',10), ('RND',20), ('COGS',30), ('Cleaning',40), ('Delivery',50),
  ('Maintenance',60), ('Bonus',70), ('Partime',80), ('Technology',90),
  ('Dekorasi',100), ('Spesial',110), ('Memorial Journal',120);
