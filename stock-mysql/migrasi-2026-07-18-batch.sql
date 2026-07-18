-- =====================================================================
-- MIGRASI: tambahkan identitas BATCH ke tabel `orders`.
-- Tanggal: 2026-07-18
-- ---------------------------------------------------------------------
-- schema.sql sudah memuat kolom ini untuk database BARU. Berkas ini untuk
-- database yang SUDAH ADA (dev & prod) — `CREATE TABLE IF NOT EXISTS` tidak
-- pernah mengubah tabel yang sudah berdiri, jadi ALTER harus dijalankan
-- terpisah.
--
-- JALANKAN DI dev (lakk5493_db_dev_stock) DULU, pastikan ordering & purchasing
-- masih normal, baru ke prod (lakk5493_db_stock).
--
-- Aman diulang? TIDAK sepenuhnya: MySQL tidak punya `ADD COLUMN IF NOT EXISTS`
-- di semua versi. Kalau dijalankan dua kali, ALTER kedua gagal dengan
-- "Duplicate column name" — itu galat yang tidak merusak apa pun, boleh
-- diabaikan. Periksa dulu dengan:  SHOW COLUMNS FROM `orders` LIKE 'batch_id';
--
-- TIDAK ADA BACKFILL. 682 order lama sengaja dibiarkan batch_id = ''.
-- Mengarang batch untuk order lama berarti menebak — persis kelemahan yang
-- migrasi ini hilangkan. Order tanpa batch_id tetap tampil, dikelompokkan
-- dengan cara lama (per waktu submit + PIC).
-- =====================================================================

ALTER TABLE `orders`
  ADD COLUMN `batch_id`   VARCHAR(64)  NOT NULL DEFAULT '' AFTER `kedatangan`,
  ADD COLUMN `batch_name` VARCHAR(120) NOT NULL DEFAULT '' AFTER `batch_id`,
  ADD COLUMN `tim`        VARCHAR(20)  NOT NULL DEFAULT '' AFTER `batch_name`;

ALTER TABLE `orders`
  ADD KEY `idx_ord_batch` (`batch_id`),
  ADD KEY `idx_ord_tim`   (`tim`, `status`);
