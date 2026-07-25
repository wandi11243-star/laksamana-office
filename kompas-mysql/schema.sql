-- =====================================================================
-- KOMPAS LAKSAMANA — SKEMA MySQL (Target & Omset Tracker)
-- ---------------------------------------------------------------------
-- PENYIMPAN BLOB JSON SATU BARIS.
--
-- Modul dipakai satu penyunting (superadmin) dan bentuk datanya berkembang
-- bebas di aplikasi, jadi seluruh state disimpan sebagai satu blob JSON di
-- baris id=1. Backend tidak perlu tahu bentuknya.
--
-- Tabel ini juga dibuat otomatis oleh lib saat penyimpanan pertama
-- (CREATE TABLE IF NOT EXISTS), jadi menjalankan file ini bersifat opsional.
--
-- Tabel lama (daily/targets/cashiers/pics/settings/log) dari versi terdahulu
-- SENGAJA tidak disertakan lagi di sini, tapi juga tidak di-DROP: kalau masih
-- ada di database, biarkan — itu cadangan data lama. Aman diabaikan.
-- =====================================================================

CREATE TABLE IF NOT EXISTS `app_state` (
  `id`         TINYINT UNSIGNED NOT NULL PRIMARY KEY,   -- selalu 1 (baris tunggal)
  `data`       LONGTEXT         NOT NULL,               -- seluruh state, JSON
  `updated_at` BIGINT           NOT NULL DEFAULT 0,     -- epoch ms terakhir disimpan
  `updated_by` VARCHAR(120)     NOT NULL DEFAULT ''
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
