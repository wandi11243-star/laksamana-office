-- ====================================================================
-- AKADEMI LAKSAMANA MUDA — Skema MySQL
-- --------------------------------------------------------------------
-- Jalankan SEKALI di database yang baru dibuat. Aman diulang (IF NOT EXISTS).
--
--   Rumahweb: cPanel > phpMyAdmin > pilih database > tab "SQL" > tempel > Go.
--   Lokal:    mysql -u root -p db_akademi < schema.sql
--
-- KENAPA MODUL INI PALING BUTUH DATABASE:
--   Sebelumnya data akademi HANYA di localStorage browser tiap kru — sinkron
--   Apps Script tidak pernah dipasang (syncUrl kosong). Akibatnya:
--     - Progress belajar tiap kru terkurung di browsernya sendiri.
--     - Hapus cache browser = progress kru itu HILANG, tanpa cadangan.
--     - Admin tidak pernah bisa melihat progress tim yang sebenarnya.
--   Setelah pindah ke sini, satu data dipakai semua device.
--
-- MODEL DATA (sama pola dengan modul lain):
--   - 1 BARIS per record, kolom inti untuk indeks + kolom `data` (JSON utuh).
--   - SUMBER KEBENARAN = kolom `data`.
--   - `updated_at` (epoch ms) = penjaga optimistic-lock per baris.
--   - `activity` APPEND-ONLY (jejak siapa mengerjakan apa).
--
-- BEDA PENTING dari modul lain: `progress` & `prog_prog` di aplikasi berbentuk
-- MAP BERSARANG (progress[userId][materialId]), bukan daftar ber-id. Di sini
-- dipecah jadi baris dengan PRIMARY KEY gabungan. Inilah yang membuat laporan
-- "siapa sudah lulus kuis apa" bisa dijawab SQL, bukan harus baca satu blob.
-- ====================================================================

-- ---------- KRU ----------
CREATE TABLE IF NOT EXISTS users (
  id         VARCHAR(64) NOT NULL PRIMARY KEY,
  name       VARCHAR(255)    NULL,
  role       VARCHAR(32)     NULL,             -- admin / manager / staff
  divisi     VARCHAR(64)     NULL,             -- app: division ("div" reserved word)
  title      VARCHAR(255)    NULL,
  active     TINYINT(1)  NOT NULL DEFAULT 1,
  updated_at BIGINT      NOT NULL DEFAULT 0,
  data       LONGTEXT    NOT NULL,
  KEY idx_us_role   (role),
  KEY idx_us_divisi (divisi),
  KEY idx_us_active (active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS divisions (
  id         VARCHAR(64) NOT NULL PRIMARY KEY,
  name       VARCHAR(255)    NULL,
  updated_at BIGINT      NOT NULL DEFAULT 0,
  data       LONGTEXT    NOT NULL              -- termasuk ic (nama ikon)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- MATERI ----------
-- type: modul / sop / quiz / video / menu. Isi yang berbeda-beda per type
-- (body, steps[], questions[], videoUrl, menu{}) semuanya ikut di `data`,
-- jadi menambah jenis materi baru tidak perlu ubah skema.
CREATE TABLE IF NOT EXISTS materials (
  id         VARCHAR(64) NOT NULL PRIMARY KEY,
  title      VARCHAR(255)    NULL,
  kind       VARCHAR(32)     NULL,             -- app: type ("type" bikin rancu)
  cat        VARCHAR(64)     NULL,             -- onboarding / sop / menu / skill / brand
  mandatory  TINYINT(1)  NOT NULL DEFAULT 0,
  published  TINYINT(1)  NOT NULL DEFAULT 0,
  passing    INT         NOT NULL DEFAULT 0,   -- nilai lulus (untuk quiz)
  created_at BIGINT      NOT NULL DEFAULT 0,
  updated_at BIGINT      NOT NULL DEFAULT 0,
  data       LONGTEXT    NOT NULL,             -- division[] (JAMAK), body/steps/questions/menu
  KEY idx_mt_kind      (kind),
  KEY idx_mt_cat       (cat),
  KEY idx_mt_published (published),
  KEY idx_mt_mandatory (mandatory)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- PROGRAM BULANAN ----------
CREATE TABLE IF NOT EXISTS programs (
  id         VARCHAR(64) NOT NULL PRIMARY KEY,
  title      VARCHAR(255)    NULL,
  bulan      VARCHAR(7)      NULL,             -- YYYY-MM
  deadline   DATE            NULL,
  created_at BIGINT      NOT NULL DEFAULT 0,
  updated_at BIGINT      NOT NULL DEFAULT 0,
  data       LONGTEXT    NOT NULL,             -- termasuk materialIds[], note
  KEY idx_pg_bulan    (bulan),
  KEY idx_pg_deadline (deadline)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- PROGRESS BELAJAR ----------
-- Aplikasi: progress[userId][materialId] = {done, score, at, ...}
-- Di sini dipecah per baris supaya bisa di-query:
--   "berapa kru sudah lulus kuis onboarding?" -> 1 SELECT, bukan baca blob.
CREATE TABLE IF NOT EXISTS progress (
  user_id     VARCHAR(64) NOT NULL,
  material_id VARCHAR(64) NOT NULL,
  done        TINYINT(1)  NOT NULL DEFAULT 0,
  score       INT             NULL,
  at_ms       BIGINT      NOT NULL DEFAULT 0,
  updated_at  BIGINT      NOT NULL DEFAULT 0,
  data        LONGTEXT    NOT NULL,
  PRIMARY KEY (user_id, material_id),
  KEY idx_pr_material (material_id),
  KEY idx_pr_done     (done),
  KEY idx_pr_lulus    (material_id, done)      -- laporan per materi
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Aplikasi: progProg[userId][programId][materialId] = {done, at, score}
CREATE TABLE IF NOT EXISTS prog_prog (
  user_id     VARCHAR(64) NOT NULL,
  program_id  VARCHAR(64) NOT NULL,
  material_id VARCHAR(64) NOT NULL,
  done        TINYINT(1)  NOT NULL DEFAULT 0,
  score       INT             NULL,
  at_ms       BIGINT      NOT NULL DEFAULT 0,
  updated_at  BIGINT      NOT NULL DEFAULT 0,
  data        LONGTEXT    NOT NULL,
  PRIMARY KEY (user_id, program_id, material_id),
  KEY idx_pp_program (program_id),
  KEY idx_pp_done    (program_id, done)        -- progres program per kru
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- JEJAK AKTIVITAS (APPEND-ONLY) ----------
-- Tidak pernah ditimpa/dihapus oleh saveAll.
-- Aplikasi tidak memberi id pada baris activity (hanya ts+userId+action), jadi
-- id dibuat backend dari sidik jari isinya — supaya baris yang sama tidak
-- tercatat dua kali saat aplikasi mengirim ulang daftarnya.
CREATE TABLE IF NOT EXISTS activity (
  id      VARCHAR(64) NOT NULL PRIMARY KEY,
  ts      BIGINT      NOT NULL DEFAULT 0,
  user_id VARCHAR(64)     NULL,
  action  VARCHAR(64)     NULL,                -- login / logout / user / system / quiz
  data    LONGTEXT    NOT NULL,
  KEY idx_ac_ts   (ts),
  KEY idx_ac_user (user_id),
  KEY idx_ac_act  (action)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- KONFIGURASI ----------
-- settings{}, version, createdAt — dan kunci top-level BARU yang belum dikenal
-- backend (disimpan berawalan "extra:") supaya tidak ada data yang diam-diam
-- hilang saat aplikasi berkembang.
CREATE TABLE IF NOT EXISTS settings (
  k VARCHAR(64) NOT NULL PRIMARY KEY,
  v LONGTEXT    NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
