-- =====================================================================
-- ABSENSI LAKSAMANA — SKEMA MySQL
-- ---------------------------------------------------------------------
-- Menjalankan berkas ini OPSIONAL: lib_absensi_mysql.php membuat semua
-- tabel sendiri (CREATE TABLE IF NOT EXISTS) saat pertama dipakai. Berkas
-- ini ada supaya bentuk tabelnya bisa dibaca tanpa membongkar PHP.
--
-- TIGA HAL YANG SENGAJA TIDAK ADA DI SINI, dan alasannya:
--
-- 1. TIDAK ADA TABEL PEGAWAI. Nama & divisi kru tetap datang dari database
--    Office (account-api-mysql), dan pekerja harian dari dw_pekerja di
--    modul DW. Menyalinnya ke sini melahirkan daftar ketiga yang pasti
--    berbeda isi begitu ada orang baru — dan yang salah selalu yang jarang
--    dilihat.
--
-- 2. TIDAK ADA TABEL JADWAL. Shift dibaca dari jadwal-api-mysql (kru tetap)
--    dan dw-api-mysql (pekerja harian) lewat HTTP server-ke-server. Kalau
--    disalin, seorang head yang mengubah jadwal besok tidak akan mengubah
--    apa pun di sini, dan absensi menghitung telat terhadap shift yang
--    sudah tidak berlaku.
--
-- 3. TIDAK ADA TABEL REKAP HARIAN. Telat, lembur, dan durasi kerja SELALU
--    dihitung ulang dari punch + shift saat dibaca. Menyimpannya berarti
--    angka rekap tidak ikut berubah ketika sebuah pengajuan disetujui
--    belakangan — dan itu tepat jenis kesalahan yang tidak menimbulkan
--    galat, cuma laporan yang salah.
-- =====================================================================

-- ---------------------------------------------------------------------
-- abs_lokasi — titik kerja yang sah. Absen di dalam radius salah satunya
-- langsung VALID; di luar semuanya wajib lewat pengajuan.
--
-- Radius disimpan per lokasi, bukan satu angka global: outlet dengan parkir
-- luas butuh radius lebih besar daripada kantor yang satu ruko.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `abs_lokasi` (
  `id`         VARCHAR(32)   NOT NULL PRIMARY KEY,
  `nama`       VARCHAR(120)  NOT NULL,
  `lat`        DECIMAL(10,7) NOT NULL DEFAULT 0,
  `lng`        DECIMAL(10,7) NOT NULL DEFAULT 0,
  `radius_m`   INT           NOT NULL DEFAULT 120,   -- meter
  `aktif`      TINYINT       NOT NULL DEFAULT 1,
  `updated_at` BIGINT        NOT NULL DEFAULT 0,
  `updated_by` VARCHAR(120)  NOT NULL DEFAULT ''
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- abs_wajah — satu wajah terdaftar per orang.
--
-- `descriptor` adalah 128 bilangan pecahan hasil face-api.js, disimpan
-- sebagai JSON. Itu BUKAN foto dan tidak bisa dibalik jadi foto — tapi ia
-- tetap data biometrik, jadi diperlakukan seperti kata sandi: tidak pernah
-- dikirim ke browser siapa pun, dan pencocokan dikerjakan di server.
--
-- Kalau pencocokan dikerjakan di browser (mengirim descriptor tersimpan ke
-- HP kru lalu membandingkan di sana), siapa pun yang membuka Developer
-- Tools bisa membalas "cocok" tanpa menghadapkan wajah ke kamera. Server
-- yang menghitung jaraknya membuat kebohongan itu perlu descriptor asli,
-- bukan sekadar satu baris JavaScript.
--
-- `foto` menyimpan potret kecil (data URI, sisi panjang <= 320px) sebagai
-- bukti yang bisa dilihat MANUSIA saat pengajuan diperiksa. Angka kemiripan
-- 0.38 tidak berarti apa-apa bagi HR; wajah di layar berarti segalanya.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `abs_wajah` (
  `subjek`      VARCHAR(72)  NOT NULL PRIMARY KEY,    -- 'USER:<id>' atau 'DW:<id>'
  `nama`        VARCHAR(120) NOT NULL DEFAULT '',
  `descriptor`  TEXT         NULL,                    -- JSON: [0.12, -0.03, ...] 128 angka
  `foto`        MEDIUMTEXT   NULL,                    -- data URI potret kecil
  `aktif`       TINYINT      NOT NULL DEFAULT 1,
  `daftar_at`   BIGINT       NOT NULL DEFAULT 0,
  `daftar_oleh` VARCHAR(120) NOT NULL DEFAULT ''
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- abs_punch — SATU BARIS PER KETUKAN. Inilah satu-satunya tabel yang
-- menyimpan kejadian; semua angka laporan diturunkan darinya.
--
-- Kunci unik (subjek_tipe, subjek_id, tgl, arah) menahan bug diam-diam yang
-- paling mahal di sistem absensi: baris kembar. Tanpa itu, kru yang menekan
-- tombol dua kali karena sinyal lambat punya dua jam masuk, dan rekap
-- memilih salah satunya tanpa aturan.
--
-- ATURAN TIMPA BERBEDA UNTUK MASUK DAN PULANG, dan ini disengaja:
--   MASUK  -> yang PERTAMA menang. Ketukan kedua ditolak halus.
--             Kalau ditimpa, orang yang sudah terlanjur telat bisa
--             "memperbaiki" catatannya jadi lebih telat lagi — atau lebih
--             buruk, sistem menghitung telat dari ketukan yang bukan
--             kedatangan sebenarnya.
--   PULANG -> yang TERAKHIR menang. Orang memang bisa pulang lalu diminta
--             kembali; jam pulang yang sah adalah yang paling akhir.
--
-- `jam` disimpan sebagai teks HH:MM di samping `waktu` epoch. Redundan
-- dengan sengaja: laporan tidak boleh berubah artinya kalau zona waktu
-- server berubah, dan epoch tanpa zona adalah angka yang tidak bisa
-- diperiksa manusia.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `abs_punch` (
  `id`            VARCHAR(32)   NOT NULL PRIMARY KEY,
  `subjek_tipe`   VARCHAR(8)    NOT NULL DEFAULT 'USER',  -- USER | DW
  `subjek_id`     VARCHAR(64)   NOT NULL,
  `nama`          VARCHAR(120)  NOT NULL DEFAULT '',      -- salinan untuk laporan lama
  `tgl`           DATE          NOT NULL,                 -- TANGGAL KERJA, bukan tanggal jam dinding
  `arah`          VARCHAR(8)    NOT NULL,                 -- MASUK | PULANG
  `waktu`         BIGINT        NOT NULL DEFAULT 0,       -- epoch ms
  `jam`           VARCHAR(5)    NOT NULL DEFAULT '',      -- HH:MM WIB
  `lat`           DECIMAL(10,7) NOT NULL DEFAULT 0,
  `lng`           DECIMAL(10,7) NOT NULL DEFAULT 0,
  `akurasi_m`     INT           NOT NULL DEFAULT 0,       -- akurasi GPS yang dilaporkan peramban
  `lokasi_id`     VARCHAR(32)   NOT NULL DEFAULT '',      -- lokasi terdekat yang cocok
  `jarak_m`       INT           NOT NULL DEFAULT -1,      -- -1 = tidak terhitung
  `dalam_area`    TINYINT       NOT NULL DEFAULT 0,
  `wajah_skor`    DECIMAL(5,4)  NOT NULL DEFAULT 1,       -- jarak euclidean; makin kecil makin mirip
  `wajah_ok`      TINYINT       NOT NULL DEFAULT 0,
  `shift_kode`    VARCHAR(16)   NOT NULL DEFAULT '',
  `shift_mulai`   VARCHAR(5)    NOT NULL DEFAULT '',
  `shift_selesai` VARCHAR(5)    NOT NULL DEFAULT '',
  `shift_sumber`  VARCHAR(8)    NOT NULL DEFAULT 'NONE',  -- ROSTER | DW | NONE
  `dalam_shift`   TINYINT       NOT NULL DEFAULT 0,
  `status`        VARCHAR(16)   NOT NULL DEFAULT 'VALID', -- VALID | MENUNGGU | DITOLAK
  `sebab`         VARCHAR(32)   NOT NULL DEFAULT '',      -- LUAR_AREA | LUAR_SHIFT | TANPA_SHIFT | WAJAH
  `alasan`        VARCHAR(255)  NOT NULL DEFAULT '',      -- diketik kru saat mengajukan
  `foto`          MEDIUMTEXT    NULL,                     -- potret saat menekan, bukti untuk HR
  `putus_at`      BIGINT        NOT NULL DEFAULT 0,
  `putus_oleh`    VARCHAR(120)  NOT NULL DEFAULT '',
  `putus_nota`    VARCHAR(255)  NOT NULL DEFAULT '',
  `dibuat_at`     BIGINT        NOT NULL DEFAULT 0,
  UNIQUE KEY `uq_punch` (`subjek_tipe`, `subjek_id`, `tgl`, `arah`),
  KEY `idx_punch_tgl` (`tgl`),
  KEY `idx_punch_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- abs_setting — satu baris blob JSON: toleransi telat, ambang kemiripan
-- wajah, apakah wajah wajib, dan daftar user yang boleh memutus pengajuan.
--
-- Blob AMAN di sini (beda dengan punch): isinya jarang berubah dan hanya
-- admin modul yang menyentuhnya, jadi tidak ada dua orang yang menulisnya
-- bersamaan.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `abs_setting` (
  `id`         TINYINT UNSIGNED NOT NULL PRIMARY KEY,   -- selalu 1
  `data`       LONGTEXT         NOT NULL,
  `updated_at` BIGINT           NOT NULL DEFAULT 0,
  `updated_by` VARCHAR(120)     NOT NULL DEFAULT ''
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
