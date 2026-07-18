-- =====================================================================
-- HOWANDI LIFE OS — Skema MySQL
-- ---------------------------------------------------------------------
-- Pola sama dengan modul lain: 1 baris per record, kolom inti untuk QUERY
-- + `data` LONGTEXT (JSON) sebagai SUMBER KEBENARAN.
--
-- BENTUK DATA DIAMBIL DARI DATA LIVE + KODE, bukan dari tebakan:
--   * 13 koleksi berisi objek ber-id  -> tabel sendiri
--   * `channels` dan `dump` ternyata ARRAY STRING BIASA, bukan objek ber-id
--     (S.dump.unshift(v) dengan v = teks; S.channels = hasil split('\n')).
--     Keduanya disimpan sebagai JSON di tabel `settings` — urutannya penting
--     (dump memakai unshift = terbaru di atas) dan JSON menjaga urutan itu
--     apa adanya tanpa perlu kolom urutan.
--   * `finance` cuma pembungkus { ledger: [...] } -> ledger jadi tabel sendiri
--   * skalar (mood, energy, focus, weeklyTarget, firstRun) + `auth` -> settings
--
-- CATATAN PENJAGA BENTROK: modul ini TIDAK punya penjaga apa pun, sama
-- seperti versi Apps Script-nya (simpan = timpa). Ini OS pribadi satu orang,
-- jadi risikonya kecil — tapi dua tab/perangkat yang dibuka bersamaan tetap
-- bisa saling menimpa. Kalau nanti mau ditutup, polanya ada di hr-mysql/
-- (revisi dokumen `_rev` + SELECT ... FOR UPDATE).
-- =====================================================================

SET NAMES utf8mb4;
SET time_zone = '+00:00';

-- ---------------------------------------------------------------------
-- SETTINGS: skalar, auth, dan dua array string (channels, dump).
-- Nilai selalu JSON supaya bentuk apa pun terjaga.
--
-- PERINGATAN: kunci `auth` berisi { enabled, hash } — hash SHA-256 kata
-- sandi kunci layar. Jangan pernah diekspor ke repo atau dikirim ke mana pun.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS settings (
  k  VARCHAR(80) NOT NULL PRIMARY KEY,
  v  LONGTEXT    NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- BISNIS & KERJA
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS businesses (
  id      VARCHAR(64)  NOT NULL PRIMARY KEY,
  nama    VARCHAR(190) NOT NULL DEFAULT '',
  bidang  VARCHAR(190) NOT NULL DEFAULT '',   -- app: field
  data    LONGTEXT     NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS projects (
  id       VARCHAR(64)  NOT NULL PRIMARY KEY,
  nama     VARCHAR(190) NOT NULL DEFAULT '',
  biz      VARCHAR(190) NOT NULL DEFAULT '',   -- nama bisnis (teks, bukan id)
  stage    VARCHAR(60)  NOT NULL DEFAULT '',
  pic      VARCHAR(190) NOT NULL DEFAULT '',
  due      VARCHAR(20)  NOT NULL DEFAULT '',
  data     LONGTEXT     NOT NULL,
  KEY idx_prj_biz (biz)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS tasks (
  id       VARCHAR(64)  NOT NULL PRIMARY KEY,
  nama     VARCHAR(255) NOT NULL DEFAULT '',
  biz      VARCHAR(190) NOT NULL DEFAULT '',
  project  VARCHAR(190) NOT NULL DEFAULT '',
  owner    VARCHAR(190) NOT NULL DEFAULT '',
  due      VARCHAR(20)  NOT NULL DEFAULT '',
  done     TINYINT(1)   NOT NULL DEFAULT 0,
  data     LONGTEXT     NOT NULL,             -- termasuk important/urgent/est/desc
  KEY idx_tsk_biz (biz),
  KEY idx_tsk_done (done)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- TUJUAN & MIMPI
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS goals (
  id    VARCHAR(64)  NOT NULL PRIMARY KEY,
  nama  VARCHAR(255) NOT NULL DEFAULT '',
  area  VARCHAR(80)  NOT NULL DEFAULT '',
  data  LONGTEXT     NOT NULL              -- cur, target, unit, milestone, desc
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS dreams (
  id       VARCHAR(64)  NOT NULL PRIMARY KEY,
  judul    VARCHAR(255) NOT NULL DEFAULT '',   -- app: title
  kategori VARCHAR(80)  NOT NULL DEFAULT '',   -- app: cat
  status   VARCHAR(60)  NOT NULL DEFAULT '',
  tahun    INT          NULL,                  -- app: year
  data     LONGTEXT     NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS roadmap (
  id     VARCHAR(64)  NOT NULL PRIMARY KEY,
  judul  VARCHAR(255) NOT NULL DEFAULT '',
  tahun  INT          NULL,
  done   TINYINT(1)   NOT NULL DEFAULT 0,
  data   LONGTEXT     NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- KONTEN & BELAJAR
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS content (
  id        VARCHAR(64)  NOT NULL PRIMARY KEY,
  judul     VARCHAR(255) NOT NULL DEFAULT '',
  channel   VARCHAR(190) NOT NULL DEFAULT '',   -- teks akun, cocok ke settings.channels
  platform  VARCHAR(60)  NOT NULL DEFAULT '',
  stage     VARCHAR(60)  NOT NULL DEFAULT '',
  tanggal   VARCHAR(20)  NOT NULL DEFAULT '',   -- app: date
  data      LONGTEXT     NOT NULL,
  KEY idx_cnt_stage (stage)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS learning (
  id      VARCHAR(64)  NOT NULL PRIMARY KEY,
  judul   VARCHAR(255) NOT NULL DEFAULT '',
  jenis   VARCHAR(60)  NOT NULL DEFAULT '',   -- app: type
  status  VARCHAR(60)  NOT NULL DEFAULT '',
  data    LONGTEXT     NOT NULL               -- source, rating, dst
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- KEBIASAAN, AGENDA, ASET, REVIEW
-- ---------------------------------------------------------------------
-- habits: { id, name, dates:[...], streak } — dates[] tetap utuh di `data`.
CREATE TABLE IF NOT EXISTS habits (
  id     VARCHAR(64)  NOT NULL PRIMARY KEY,
  nama   VARCHAR(190) NOT NULL DEFAULT '',
  streak INT          NOT NULL DEFAULT 0,
  data   LONGTEXT     NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS events (
  id       VARCHAR(64)  NOT NULL PRIMARY KEY,
  judul    VARCHAR(255) NOT NULL DEFAULT '',
  tanggal  VARCHAR(20)  NOT NULL DEFAULT '',
  jenis    VARCHAR(60)  NOT NULL DEFAULT '',   -- app: type
  data     LONGTEXT     NOT NULL,             -- start, end, dst
  KEY idx_evt_tgl (tanggal)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS assets (
  id       VARCHAR(64)  NOT NULL PRIMARY KEY,
  nama     VARCHAR(190) NOT NULL DEFAULT '',
  kategori VARCHAR(80)  NOT NULL DEFAULT '',   -- app: cat
  data     LONGTEXT     NOT NULL              -- loc, qty, unit, dst
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS reviews (
  id         VARCHAR(64) NOT NULL PRIMARY KEY,
  week_start VARCHAR(20) NOT NULL DEFAULT '',  -- app: weekStart
  data       LONGTEXT    NOT NULL,            -- sContent, sBusiness, sProject, dst
  KEY idx_rev_week (week_start)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- FINANCE — di app bentuknya finance:{ledger:[...]}, jadi cuma ledger yang
-- perlu tabel. Pembungkus `finance` dirakit ulang saat getAll.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ledger (
  id      VARCHAR(64) NOT NULL PRIMARY KEY,
  bulan   VARCHAR(10) NOT NULL DEFAULT '',   -- app: month 'YYYY-MM'
  scope   VARCHAR(40) NOT NULL DEFAULT '',   -- personal / bisnis
  income  DOUBLE      NOT NULL DEFAULT 0,
  expense DOUBLE      NOT NULL DEFAULT 0,
  data    LONGTEXT    NOT NULL,              -- termasuk note
  KEY idx_led_bulan (bulan)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
