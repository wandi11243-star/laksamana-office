-- =====================================================================
-- KOMPAS LAKSAMANA — SKEMA MySQL (Target & Omset Tracker)
-- ---------------------------------------------------------------------
-- Menggantikan localStorage. Pola sama dengan modul lain: satu baris per
-- catatan, kolom inti untuk indeks + kolom `data` (JSON) sebagai sumber
-- kebenaran, dan `updated_at` sebagai penjaga tabrakan antar-pengguna.
--
-- Aman dijalankan ulang (CREATE TABLE IF NOT EXISTS).
-- =====================================================================

-- Catatan harian. Satu baris per tanggal — itu yang membuat dua orang
-- mengisi tanggal berbeda tidak pernah saling menimpa.
CREATE TABLE IF NOT EXISTS `daily` (
  `tanggal`      DATE         NOT NULL,
  `omset_total`  BIGINT       NOT NULL DEFAULT 0,
  `omset_food`   BIGINT       NOT NULL DEFAULT 0,
  `omset_bev`    BIGINT       NOT NULL DEFAULT 0,
  `traffic`      INT          NOT NULL DEFAULT 0,
  `pax`          INT          NOT NULL DEFAULT 0,
  `transaksi`    INT          NOT NULL DEFAULT 0,
  `review`       INT          NOT NULL DEFAULT 0,
  `updated_at`   BIGINT       NOT NULL DEFAULT 0,
  `updated_by`   VARCHAR(120) NOT NULL DEFAULT '',
  `data`         LONGTEXT     NOT NULL,
  PRIMARY KEY (`tanggal`),
  KEY `idx_daily_bulan` (`tanggal`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Target per bulan (YYYY-MM), termasuk target per kasir/PIC dan override
-- harian — semuanya di dalam `data`.
CREATE TABLE IF NOT EXISTS `targets` (
  `bulan`       CHAR(7)  NOT NULL,
  `omset_total` BIGINT   NOT NULL DEFAULT 0,
  `updated_at`  BIGINT   NOT NULL DEFAULT 0,
  `data`        LONGTEXT NOT NULL,
  PRIMARY KEY (`bulan`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Daftar kasir & PIC marketing.
CREATE TABLE IF NOT EXISTS `cashiers` (
  `id`         VARCHAR(64)  NOT NULL,
  `name`       VARCHAR(120) NOT NULL,
  `active`     TINYINT(1)   NOT NULL DEFAULT 1,
  `updated_at` BIGINT       NOT NULL DEFAULT 0,
  `data`       LONGTEXT     NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `pics` (
  `id`         VARCHAR(64)  NOT NULL,
  `name`       VARCHAR(120) NOT NULL,
  `active`     TINYINT(1)   NOT NULL DEFAULT 1,
  `updated_at` BIGINT       NOT NULL DEFAULT 0,
  `data`       LONGTEXT     NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Pengaturan (bobot hari, tier bonus, jenis event). Satu baris per kunci.
CREATE TABLE IF NOT EXISTS `settings` (
  `k`          VARCHAR(64) NOT NULL,
  `v`          LONGTEXT    NOT NULL,
  `updated_at` BIGINT      NOT NULL DEFAULT 0,
  PRIMARY KEY (`k`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Jejak aktivitas. Append-only: tidak pernah ditimpa atau dihapus oleh
-- penyimpanan biasa, supaya riwayat siapa-mengubah-apa tidak bisa hilang.
CREATE TABLE IF NOT EXISTS `log` (
  `id`     BIGINT AUTO_INCREMENT PRIMARY KEY,
  `at`     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `by`     VARCHAR(120) NOT NULL DEFAULT '',
  `action` VARCHAR(64)  NOT NULL DEFAULT '',
  `detail` VARCHAR(255) NOT NULL DEFAULT '',
  KEY `idx_log_at` (`at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
