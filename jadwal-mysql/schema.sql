-- =====================================================================
-- JADWAL SHIFT LAKSAMANA — SKEMA MySQL
-- ---------------------------------------------------------------------
-- Menjalankan file ini OPSIONAL: lib_jadwal_mysql.php membuat ketiga tabel
-- sendiri (CREATE TABLE IF NOT EXISTS) saat pertama dipakai. File ini ada
-- supaya bentuk tabelnya bisa dibaca tanpa membongkar PHP, dan supaya
-- database bisa disiapkan lebih dulu sebelum modulnya dibuka.
--
-- TIDAK ADA TABEL PEGAWAI DI SINI, dan itu disengaja. Nama, divisi, dan
-- jabatan kru selalu datang dari database Office (account-api-mysql) lewat
-- listDivisiRoster. `user_id` di bawah adalah ID user Office apa adanya.
-- Menyalin roster ke sini akan melahirkan dua daftar nama yang pasti
-- berbeda isi begitu ada kru baru — dan yang salah selalu yang jarang
-- dilihat.
-- =====================================================================

-- ---------------------------------------------------------------------
-- jadwal_sel — satu baris per (kru × tanggal). Sel kosong TIDAK disimpan
-- sebagai baris; ia cuma tidak ada. Itu sebabnya "kosongkan" di layar
-- diterjemahkan jadi DELETE, bukan UPDATE shift=''.
--
-- PK (user_id, tgl) membuat penulisan idempoten: menekan Simpan dua kali,
-- atau dua tab yang sama-sama mengirim sel yang sama, tidak melahirkan
-- baris kembar.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `jadwal_sel` (
  `user_id`     VARCHAR(64)  NOT NULL,               -- id user Office
  `tgl`         DATE         NOT NULL,
  `shift`       VARCHAR(16)  NOT NULL DEFAULT '',    -- PAGI/MIDDLE/SIANG/SPLIT/OFF/IZIN/CUTI/LAIN
  `jam_mulai`   VARCHAR(5)   NOT NULL DEFAULT '',    -- '' = pakai jam default shift
  `jam_selesai` VARCHAR(5)   NOT NULL DEFAULT '',
  `catatan`     VARCHAR(120) NOT NULL DEFAULT '',    -- teks bebas di dalam sel (mis. "HARAU!!!")
  `updated_at`  BIGINT       NOT NULL DEFAULT 0,     -- epoch ms
  `updated_by`  VARCHAR(120) NOT NULL DEFAULT '',    -- nama head yang mengisi
  PRIMARY KEY (`user_id`, `tgl`),
  KEY `idx_sel_tgl` (`tgl`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- jadwal_pengajuan — kru mengajukan off/izin/cuti/tukar shift, head yang
-- memutuskan. `status` hanya boleh diubah lewat aksi putusPengajuan;
-- endpoint pembuatan SELALU memaksa 'MENUNGGU' (lihat simpan_pengajuan).
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `jadwal_pengajuan` (
  `id`          VARCHAR(32)  NOT NULL PRIMARY KEY,
  `user_id`     VARCHAR(64)  NOT NULL,               -- yang mengajukan
  `jenis`       VARCHAR(16)  NOT NULL DEFAULT 'OFF', -- OFF | IZIN | CUTI | TUKAR | UBAH
  `tgl_mulai`   DATE         NOT NULL,
  `tgl_selesai` DATE         NOT NULL,               -- sama dengan tgl_mulai kalau satu hari
  `alasan`      TEXT         NULL,
  `status`      VARCHAR(16)  NOT NULL DEFAULT 'MENUNGGU',  -- MENUNGGU | DISETUJUI | DITOLAK
  `dibuat_at`   BIGINT       NOT NULL DEFAULT 0,
  `dibuat_oleh` VARCHAR(120) NOT NULL DEFAULT '',
  `putus_at`    BIGINT       NOT NULL DEFAULT 0,
  `putus_oleh`  VARCHAR(120) NOT NULL DEFAULT '',
  `putus_nota`  VARCHAR(255) NOT NULL DEFAULT '',
  KEY `idx_aju_user` (`user_id`),
  KEY `idx_aju_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- jadwal_setting — satu baris blob JSON: definisi shift (nama, jam, warna),
-- head tiap divisi, dan penyesuaian divisi manual untuk kru yang keterangan
-- di Office-nya belum diisi.
--
-- Blob di sini AMAN (beda dengan sel jadwal): isinya jarang berubah dan
-- hanya admin modul yang menyentuhnya, jadi tidak ada dua orang yang
-- menulisnya bersamaan.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `jadwal_setting` (
  `id`         TINYINT UNSIGNED NOT NULL PRIMARY KEY,   -- selalu 1
  `data`       LONGTEXT         NOT NULL,
  `updated_at` BIGINT           NOT NULL DEFAULT 0,
  `updated_by` VARCHAR(120)     NOT NULL DEFAULT ''
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
