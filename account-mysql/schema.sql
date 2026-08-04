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
  `no_hp`      VARCHAR(32)  NOT NULL DEFAULT '',
  `talenta_id` VARCHAR(32)  NOT NULL DEFAULT '',
  `username`   VARCHAR(40)  NOT NULL DEFAULT '',
  `created_at` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_users_name` (`name`),
  KEY `idx_users_talenta` (`talenta_id`),
  KEY `idx_users_username` (`username`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- talenta_id — Employee ID di Talenta (mis. '118825'), penghubung ke
-- report absensi bulanan yang diunggah ke modul HR.
--
-- Kosong = kru itu belum dipetakan; modul HR akan menampilkannya sebagai
-- "belum cocok" saat unggah, BUKAN diam-diam melewatinya. Pencocokan lewat
-- nama saja tidak bisa dipercaya ('M. Rizki Arfan' vs 'Rizki Arfan').
--
-- TIDAK unik di tingkat database: kolom kosong akan bentrok satu sama lain.
-- Keunikan yang bukan-kosong diperiksa di kode.
--
-- Baris ALTER di bawah untuk database yang TERLANJUR dibuat sebelum kolom
-- ini ada. Di MySQL, ADD COLUMN IF NOT EXISTS tidak tersedia, jadi kalau
-- kolomnya sudah ada perintah ini akan error — abaikan, itu tandanya
-- memang sudah terpasang.
-- ---------------------------------------------------------------------
-- ALTER TABLE `users` ADD COLUMN `talenta_id` VARCHAR(32) NOT NULL DEFAULT '' AFTER `keterangan`;
-- ALTER TABLE `users` ADD KEY `idx_users_talenta` (`talenta_id`);

-- no_hp — nomor HP/WhatsApp kru, untuk template reminder WA di modul lain.
-- Database yang terlanjur ada akan mendapatkannya OTOMATIS: lib membuat kolom
-- ini saat koneksi pertama (pastikan_kolom_no_hp), jadi ALTER manual di bawah
-- hanya cadangan bila auto-migrasi tak berjalan.
-- ALTER TABLE `users` ADD COLUMN `no_hp` VARCHAR(32) NOT NULL DEFAULT '' AFTER `keterangan`;

-- ---------------------------------------------------------------------
-- username — nama pendek untuk LOGIN, dipilih sendiri oleh kru.
--
-- Masalah yang dipecahkan: login memakai nama + PIN, dan nama resmi harus
-- diketik LENGKAP supaya "Rizki Arfan" tidak tertukar dengan "Rizky Kemala".
-- Mengetik nama lengkap tiap login itu menyiksa. Dengan kolom ini, keduanya
-- cukup mengetik 'arfan' dan 'mala'.
--
-- INI KREDENSIAL, BUKAN HIASAN. Konsekuensinya:
--
--   1. WAJIB UNIK, dan uniknya LINTAS KOLOM: sebuah username tidak boleh
--      sama dengan username orang lain MAUPUN dengan `name` orang lain.
--      Kalau tidak, "Rizky Kemala" bisa mengambil username "Rizki Arfan"
--      dan login akan mengarah ke akun yang salah.
--   2. Login mencocokkan `username` ATAU `name`. Nama resmi tetap bisa
--      dipakai, jadi tidak ada yang terkunci saat fitur ini dipasang.
--   3. Formatnya dibatasi (huruf/angka/titik/garis bawah/strip, 3-40) supaya
--      tidak ada spasi ganda atau karakter tak terlihat yang membuat orang
--      gagal login tanpa tahu sebabnya.
--
-- Kosong = belum pilih; orang itu login dengan nama resminya seperti biasa.
-- Baris kosong BEBAS bentrok satu sama lain, jadi UNIQUE biasa tidak dipakai
-- (MySQL menganggap '' sama dengan ''). Keunikan diperiksa di kode.
--
-- Perbandingan selalu lower-case: 'Arfan' dan 'arfan' orang yang sama.
-- ---------------------------------------------------------------------
-- ALTER TABLE `users` ADD COLUMN `username` VARCHAR(40) NOT NULL DEFAULT '' AFTER `talenta_id`;
-- ALTER TABLE `users` ADD KEY `idx_users_username` (`username`);

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
  ('howandi_life', 'Howandi Life OS',   1, 90),
  ('kompas',       'Kompas Laksamana',  1,100),
  ('jadwal',       'Jadwal Shift',      1,110);

-- ---------------------------------------------------------------------
-- SESSIONS — token sesi Office, dipakai modul lain untuk MEMBUKTIKAN
-- siapa yang memanggil API-nya.
--
-- Sebelum ini, API modul (mis. stock) hanya dijaga token bersama yang sama
-- untuk semua orang — server tidak punya cara mengetahui SIAPA pemanggilnya,
-- jadi aturan "tim Bar hanya melihat data Bar" tidak mungkin ditegakkan di
-- server. Yang bisa dilakukan cuma menyembunyikannya di layar, dan itu
-- bukan pembatasan.
--
-- Token dibuat saat login dan dikirim ulang oleh browser di tiap permintaan.
-- PIN TIDAK ikut disimpan maupun dikirim: token inilah buktinya, dan ia bisa
-- dicabut sepihak dengan menghapus barisnya — PIN tidak bisa.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `sessions` (
  `token`   VARCHAR(64) NOT NULL,
  `user_id` VARCHAR(64) NOT NULL,
  `expiry`  BIGINT      NOT NULL,          -- epoch MILIDETIK, sama satuan dengan lm_session di browser
  `dibuat`  DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`token`),
  KEY `idx_sessions_user` (`user_id`),
  KEY `idx_sessions_expiry` (`expiry`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
