-- =====================================================================
-- ACCOUNT — SKEMA MySQL (daftar user & hak akses portal Office)
-- ---------------------------------------------------------------------
-- Menggantikan Google Sheet berisi 4 tab: Users, Modules, Grants, Admins.
-- Bentuk tabelnya sengaja dibuat SAMA dengan tab-tab itu supaya isinya
-- bisa dipindahkan apa adanya dan perilakunya bisa dibandingkan satu-satu.
--
-- Aman dijalankan ulang (CREATE TABLE IF NOT EXISTS).
-- Jalankan di phpMyAdmin: pilih database -> tab SQL -> tempel -> Go.
-- =====================================================================

-- ---------------------------------------------------------------------
-- users — satu baris per orang.
--
-- PIN sengaja disimpan apa adanya, sama seperti di Sheet. Konsol "Kelola
-- User" di Office MENAMPILKAN dan MENGISI ULANG PIN saat mengedit, jadi
-- PIN yang di-hash akan mematikan layar itu. Ini bukan kemunduran:
-- sebelumnya PIN terbuka bagi siapa pun yang punya link spreadsheet-nya,
-- sekarang terkunci di balik kredensial database.
--
-- TIDAK ada UNIQUE pada `name`. Keunikan nama diperiksa di kode (sama
-- seperti Apps Script), supaya memindahkan data lama yang terlanjur punya
-- nama kembar tidak ditolak mentah-mentah oleh database.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `users` (
  `id`         VARCHAR(64)  NOT NULL,
  `name`       VARCHAR(120) NOT NULL,
  `pin`        VARCHAR(32)  NOT NULL DEFAULT '1111',
  `active`     TINYINT(1)   NOT NULL DEFAULT 1,
  `keterangan` VARCHAR(255) NOT NULL DEFAULT '',
  `created_at` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_users_name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- modules — registri modul yang dikenal Office.
-- `key` dipakai Grants & Admins sebagai identitas modul, jadi tidak pernah
-- diubah. Menonaktifkan modul menyembunyikannya dari daftar akses tanpa
-- menghapus grant lama.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `modules` (
  `key`    VARCHAR(64)  NOT NULL,
  `label`  VARCHAR(120) NOT NULL DEFAULT '',
  `active` TINYINT(1)   NOT NULL DEFAULT 1,
  `urut`   INT          NOT NULL DEFAULT 0,
  PRIMARY KEY (`key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- grants — SATU-SATUNYA sumber "modul apa yang boleh DIBUKA user".
--
-- module '*' berarti semua modul aktif di registri. Baris deny (access=0)
-- menimpa '*', jadi "semua kecuali howandi_life" ditulis sebagai dua baris:
--   ('u-wandi', '*',            1)
--   ('u-wandi', 'howandi_life', 0)
--
-- PRIMARY KEY (user_id, module) membuat pemberian akses idempoten: menekan
-- tombol dua kali tidak melahirkan baris kembar seperti di Sheet.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `grants` (
  `user_id`    VARCHAR(64) NOT NULL,
  `module`     VARCHAR(64) NOT NULL,
  `access`     TINYINT(1)  NOT NULL DEFAULT 1,
  `granted_by` VARCHAR(64) NOT NULL DEFAULT '',
  `ts`         DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`, `module`),
  KEY `idx_grants_module` (`module`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- admins — siapa yang boleh membuka konsol "Kelola Akses" sebuah modul.
-- module '*' = superadmin (boleh mengelola semuanya).
--
-- Mengelola sebuah modul TIDAK otomatis memberi akses membukanya; itu
-- tetap urusan grants. Dua hal yang sengaja dipisah.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `admins` (
  `user_id` VARCHAR(64) NOT NULL,
  `module`  VARCHAR(64) NOT NULL,
  PRIMARY KEY (`user_id`, `module`),
  KEY `idx_admins_module` (`module`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- Registri modul awal. Sama dengan ALL_MODULE_KEYS_SEED() di deploy/index.html.
-- INSERT IGNORE: label/aktif yang sudah diubah admin tidak tertimpa saat
-- skema ini dijalankan ulang.
-- ---------------------------------------------------------------------
INSERT IGNORE INTO `modules` (`key`, `label`, `active`, `urut`) VALUES
  ('ordering',     'Ordering',          1, 10),
  ('purchasing',   'Purchasing',        1, 20),
  ('konten',       'Konten',            1, 30),
  ('reservasi',    'Reservasi',         1, 40),
  ('akademi',      'Akademi',           1, 50),
  ('event',        'Event',             1, 60),
  ('marketing',    'Marketing',         1, 70),
  ('hr',           'Staff Performance', 1, 80),
  ('howandi_life', 'Howandi Life OS',   1, 90);
