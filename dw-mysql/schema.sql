-- =====================================================================
-- DAILY WORKER LAKSAMANA — SKEMA MySQL
-- ---------------------------------------------------------------------
-- Menjalankan file ini OPSIONAL: lib_dw_mysql.php membuat ketiga tabel
-- sendiri (CREATE TABLE IF NOT EXISTS) saat pertama dipakai. File ini ada
-- supaya bentuk tabelnya bisa dibaca tanpa membongkar PHP.
--
-- BEDA MENDASAR DENGAN jadwal-api-mysql: di sini ADA tabel orang, dan itu
-- disengaja. Daily worker BUKAN pegawai Office — mereka tidak punya akun
-- Office, tidak masuk Kelola Akses, dan jumlahnya berganti tiap bulan.
-- Mendaftarkan mereka sebagai user Office akan mencemari roster SETIAP
-- modul (Marketing, HR, Kompas) dengan puluhan nama yang tidak pernah
-- membuka Office sama sekali. Karena itu daftar DW berdiri sendiri di sini,
-- dan modul Jadwal Shift membacanya lewat satu endpoint khusus
-- (`jadwalDW`) — bukan dengan menyalin barisnya.
-- =====================================================================

-- ---------------------------------------------------------------------
-- dw_pekerja — talent pool daily worker.
--
-- `no_hp` UNIK, dan itu bukan formalitas: nomor HP adalah satu-satunya
-- identitas yang benar-benar dipegang seorang DW. Tanpa kunci unik, orang
-- yang sama didaftarkan dua kali oleh dua staf HR akan punya DUA riwayat
-- no-show yang masing-masing terlihat bersih, dan justru yang paling sering
-- bermasalah yang paling sering didaftar ulang. Nomor juga dipakai sebagai
-- nama pengguna saat DW masuk sendiri untuk mengajukan jadwal.
--
-- `pin` SUDAH TIDAK DIPAKAI sejak 14 Agustus 2026. Gerbang masuk mandiri DW
-- (no HP + PIN) dicabut seluruhnya: daily worker tidak punya akun dan tidak
-- pernah membuka sistem — head mengajukan kebutuhan divisinya, HRD menyetujui
-- lalu menunjuk siapa yang dipakai. Kolomnya sengaja TIDAK di-DROP (menghapus
-- kolom tidak bisa dibatalkan), tapi tidak lagi dibaca maupun ditulis di mana
-- pun; lihat daftar kolom di baca_semua() dan simpan_pekerja().
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `dw_pekerja` (
  `id`           VARCHAR(32)  NOT NULL PRIMARY KEY,
  `nama`         VARCHAR(120) NOT NULL,
  `no_hp`        VARCHAR(32)  NOT NULL,               -- hanya angka, sudah dinormalkan ke 08xxxx
  `pin`          VARCHAR(8)   NOT NULL DEFAULT '',    -- menganggur, lihat catatan di atas
  `gender`       VARCHAR(10)  NOT NULL DEFAULT '',
  `area`         VARCHAR(80)  NOT NULL DEFAULT '',
  `bank`         VARCHAR(120) NOT NULL DEFAULT '',            -- keterangan lama (teks bebas), dibiarkan
  -- Tujuan pembayaran yang dipakai halaman Pembayaran. Dipecah supaya
  -- orang dengan tujuan yang sama bisa digabung jadi satu transfer.
  `bayar_jenis`  VARCHAR(16)  NOT NULL DEFAULT 'BANK',        -- BANK | GOPAY | DANA
  `bayar_bank`   VARCHAR(60)  NOT NULL DEFAULT '',            -- nama bank, hanya untuk jenis BANK (BCA, BPD Bali, …)
  `bayar_nomor`  VARCHAR(60)  NOT NULL DEFAULT '',            -- ANGKA saja: no rekening, atau no HP untuk GoPay/DANA
  `bayar_nama`   VARCHAR(120) NOT NULL DEFAULT '',            -- atas nama
  `divisi`       VARCHAR(16)  NOT NULL DEFAULT '',    -- bar|kitchen|floor|cashier — kode SAMA dengan modul Jadwal
  `posisi`       VARCHAR(60)  NOT NULL DEFAULT '',
  `skill`        VARCHAR(255) NOT NULL DEFAULT '',    -- dipisah koma
  -- AKTIF | NONAKTIF saja. Nilai lama PANTAU/BLOKIR masih mungkin ada di baris
  -- yang dibuat sebelum 5 Agustus 2026; keduanya dipetakan saat dibaca
  -- (PANTAU->AKTIF, BLOKIR->NONAKTIF) dan BLOKIR tetap ditolak saat login.
  `status`       VARCHAR(16)  NOT NULL DEFAULT 'AKTIF',
  `catatan`      VARCHAR(255) NOT NULL DEFAULT '',
  `dibuat_at`    BIGINT       NOT NULL DEFAULT 0,
  `dibuat_oleh`  VARCHAR(120) NOT NULL DEFAULT '',
  `updated_at`   BIGINT       NOT NULL DEFAULT 0,
  `updated_oleh` VARCHAR(120) NOT NULL DEFAULT '',
  UNIQUE KEY `uq_pekerja_hp` (`no_hp`),
  KEY `idx_pekerja_status` (`status`),
  KEY `idx_pekerja_divisi` (`divisi`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- dw_ajuan — satu baris per (DW × tanggal). Inilah inti modulnya: DW
-- mengajukan "saya bisa masuk tanggal sekian, jam sekian", HR memutuskan,
-- dan yang DISETUJUI muncul di kalender modul Jadwal Shift.
--
-- UNIK (dw_id, tgl) — sengaja, dengan alasan yang sama seperti PK
-- (user_id, tgl) di jadwal_sel: satu orang hanya punya SATU sel di kalender
-- untuk satu tanggal. Tanpa kunci ini, DW yang menekan Kirim dua kali (atau
-- mengirim ulang setelah ditolak) melahirkan dua baris, dan kalender
-- menampilkan orang yang sama dua kali di hari yang sama tanpa ada yang
-- salah menurut basis data. Pengajuan ulang MENIMPA baris yang sudah ada
-- dan mengembalikan statusnya ke MENUNGGU.
--
-- Kehadiran menempel di baris yang sama, bukan tabel sendiri: satu shift
-- kerja = satu catatan kehadiran, jadi tabel terpisah hanya melahirkan baris
-- yatim ketika ajuannya dihapus.
--
-- TIDAK ADA kolom penilaian. Sempat ada skor bintang 1–5 (`nilai`,
-- `nilai_nota`, …) dan itu dibuang 5 Agustus 2026: ia pendapat satu orang
-- tentang shift semalam, tidak pernah dipakai memutuskan apa pun, tapi selalu
-- menuntut diisi — dan kolom wajib yang tidak berguna adalah cara tercepat
-- membuat orang berhenti mengisi SELURUH formulirnya, termasuk kehadiran yang
-- justru penting. Kolom lamanya sengaja tidak di-DROP di pemasangan yang
-- sudah jalan; ia cuma menganggur (lihat pastikan_kolom di lib_dw_mysql.php).
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `dw_ajuan` (
  `id`          VARCHAR(32)  NOT NULL PRIMARY KEY,
  `dw_id`       VARCHAR(32)  NOT NULL,
  `tgl`         DATE         NOT NULL,
  `jam_mulai`   VARCHAR(5)   NOT NULL DEFAULT '',
  `jam_selesai` VARCHAR(5)   NOT NULL DEFAULT '',
  `divisi`      VARCHAR(16)  NOT NULL DEFAULT '',
  `posisi`      VARCHAR(60)  NOT NULL DEFAULT '',
  `catatan`     VARCHAR(255) NOT NULL DEFAULT '',
  `status`      VARCHAR(16)  NOT NULL DEFAULT 'MENUNGGU', -- MENUNGGU | DISETUJUI | DITOLAK | BATAL
  `dibuat_at`   BIGINT       NOT NULL DEFAULT 0,
  `dibuat_oleh` VARCHAR(120) NOT NULL DEFAULT '',
  `putus_at`    BIGINT       NOT NULL DEFAULT 0,
  `putus_oleh`  VARCHAR(120) NOT NULL DEFAULT '',
  `putus_nota`  VARCHAR(255) NOT NULL DEFAULT '',
  `hadir`       VARCHAR(10)  NOT NULL DEFAULT '',    -- '' | HADIR | TELAT | ALFA
  `hadir_nota`  VARCHAR(255) NOT NULL DEFAULT '',
  `hadir_oleh`  VARCHAR(120) NOT NULL DEFAULT '',
  `hadir_at`    BIGINT       NOT NULL DEFAULT 0,
  UNIQUE KEY `uq_ajuan_orang_tgl` (`dw_id`, `tgl`),
  KEY `idx_ajuan_tgl` (`tgl`),
  KEY `idx_ajuan_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- dw_setting — satu baris blob JSON: tarif per posisi, jam operasional
-- bawaan, dan kuota DW per divisi per hari.
--
-- Blob di sini AMAN (beda dengan ajuan): isinya jarang berubah dan hanya
-- admin modul yang menyentuhnya, jadi tidak ada dua orang yang menulisnya
-- bersamaan. Alasan yang sama seperti jadwal_setting.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `dw_setting` (
  `id`         TINYINT UNSIGNED NOT NULL PRIMARY KEY,   -- selalu 1
  `data`       LONGTEXT         NOT NULL,
  `updated_at` BIGINT           NOT NULL DEFAULT 0,
  `updated_by` VARCHAR(120)     NOT NULL DEFAULT ''
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
