-- ====================================================================
-- MARKETING / CRM LAKSAMANA MUDA — Skema MySQL
-- --------------------------------------------------------------------
-- Jalankan SEKALI di database yang baru dibuat. Aman diulang (IF NOT EXISTS).
--
--   Rumahweb: cPanel > phpMyAdmin > pilih database > tab "SQL" > tempel > Go.
--   Lokal:    mysql -u root -p db_marketing < schema.sql
--
-- MODEL DATA (sama pola dengan reservasi-mysql & event-mysql):
--   - 1 BARIS per record. Kolom inti (untuk query/indeks/laporan) + kolom
--     `data` (JSON utuh objek apa adanya dari aplikasi).
--   - SUMBER KEBENARAN = kolom `data`. Aplikasi boleh menambah field baru
--     tanpa mengubah skema. `events.data` inilah yang memuat `detail` berisi
--     144 field detailing D.1-D.12, plus payments[] & tasks{}.
--   - `updated_at` (epoch ms) = penjaga optimistic-lock PER BARIS.
--
-- PENTING — beda dengan backend Apps Script yang lama:
--   Yang lama mengunci SELURUH database sekaligus (satu nomor `_rev`), jadi dua
--   kru yang menyimpan bersamaan saling ditolak walau mengedit event yang
--   BERBEDA — muncul dialog "Timpa punya X / Muat ulang". Di sini penguncian
--   per-baris: bentrok hanya terjadi kalau benar-benar menyentuh baris yang
--   sama, dan baris lama tidak pernah menimpa baris server yang lebih baru.
--
--   `activities` bersifat APPEND-ONLY (jejak audit tidak boleh hilang).
-- ====================================================================

-- ---------- CRM ----------
CREATE TABLE IF NOT EXISTS clients (
  id           VARCHAR(64)  NOT NULL PRIMARY KEY,
  nama         VARCHAR(255)     NULL,
  perusahaan   VARCHAR(255)     NULL,
  hp           VARCHAR(32)      NULL,
  email        VARCHAR(255)     NULL,
  source       VARCHAR(64)      NULL,
  status       VARCHAR(32)      NULL,
  mkt_pic      VARCHAR(64)      NULL,          -- user id marketing yang pegang
  last_contact DATE             NULL,
  next_fu      DATE             NULL,          -- next follow-up
  updated_at   BIGINT       NOT NULL DEFAULT 0,
  created_at   BIGINT       NOT NULL DEFAULT 0,
  data         LONGTEXT     NOT NULL,
  KEY idx_cl_status  (status),
  KEY idx_cl_pic     (mkt_pic),
  KEY idx_cl_nextfu  (next_fu),
  KEY idx_cl_hp      (hp),
  KEY idx_cl_updated (updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- EVENT / PELUANG ----------
CREATE TABLE IF NOT EXISTS events (
  id           VARCHAR(64)  NOT NULL PRIMARY KEY,
  client_id    VARCHAR(64)      NULL,
  nama         VARCHAR(255)     NULL,
  jenis        VARCHAR(64)      NULL,
  tanggal      DATE             NULL,
  pax          INT          NOT NULL DEFAULT 0,
  status       VARCHAR(32)      NULL,          -- Lead/Confirmed/dst
  pipe_col     VARCHAR(32)      NULL,          -- kolom pipeline
  mkt_pic      VARCHAR(64)      NULL,
  invoice_sent TINYINT(1)   NOT NULL DEFAULT 0,
  updated_at   BIGINT       NOT NULL DEFAULT 0,
  created_at   BIGINT       NOT NULL DEFAULT 0,
  data         LONGTEXT     NOT NULL,          -- termasuk detail{} (D.1-D.12), payments[], tasks{}
  KEY idx_ev_client  (client_id),
  KEY idx_ev_status  (status),
  KEY idx_ev_tanggal (tanggal),
  KEY idx_ev_pic     (mkt_pic),
  KEY idx_ev_updated (updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS followups (
  id         VARCHAR(64) NOT NULL PRIMARY KEY,
  client_id  VARCHAR(64)     NULL,
  event_id   VARCHAR(64)     NULL,
  by_user    VARCHAR(64)     NULL,
  at_time    DATETIME        NULL,
  next_fu    DATE            NULL,
  updated_at BIGINT      NOT NULL DEFAULT 0,
  data       LONGTEXT    NOT NULL,
  KEY idx_fu_client (client_id),
  KEY idx_fu_event  (event_id),
  KEY idx_fu_at     (at_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS approvals (
  id         VARCHAR(64) NOT NULL PRIMARY KEY,
  event_id   VARCHAR(64)     NULL,
  status     VARCHAR(32)     NULL,
  updated_at BIGINT      NOT NULL DEFAULT 0,
  data       LONGTEXT    NOT NULL,
  KEY idx_ap_event  (event_id),
  KEY idx_ap_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- ORANG ----------
CREATE TABLE IF NOT EXISTS users (
  id         VARCHAR(64) NOT NULL PRIMARY KEY,
  name       VARCHAR(255)    NULL,
  role       VARCHAR(32)     NULL,
  divisi     VARCHAR(64)     NULL,             -- divisi untuk role operational
  active     TINYINT(1)  NOT NULL DEFAULT 1,
  updated_at BIGINT      NOT NULL DEFAULT 0,
  data       LONGTEXT    NOT NULL,
  KEY idx_us_role (role)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS staff (
  id         VARCHAR(64) NOT NULL PRIMARY KEY,
  nama       VARCHAR(255)    NULL,
  divisi     VARCHAR(64)     NULL,
  updated_at BIGINT      NOT NULL DEFAULT 0,
  data       LONGTEXT    NOT NULL,
  KEY idx_st_div (divisi)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- TASK / KATEGORI ----------
CREATE TABLE IF NOT EXISTS task_templates (
  id         VARCHAR(64) NOT NULL PRIMARY KEY,
  divisi     VARCHAR(64)     NULL,
  updated_at BIGINT      NOT NULL DEFAULT 0,
  data       LONGTEXT    NOT NULL,
  KEY idx_tt_div (divisi)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS task_categories (
  id         VARCHAR(64) NOT NULL PRIMARY KEY,
  updated_at BIGINT      NOT NULL DEFAULT 0,
  data       LONGTEXT    NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS categories (
  id         VARCHAR(64) NOT NULL PRIMARY KEY,
  updated_at BIGINT      NOT NULL DEFAULT 0,
  data       LONGTEXT    NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- NOTIFIKASI ----------
CREATE TABLE IF NOT EXISTS notifs (
  id         VARCHAR(64) NOT NULL PRIMARY KEY,
  at_time    DATETIME        NULL,
  updated_at BIGINT      NOT NULL DEFAULT 0,
  data       LONGTEXT    NOT NULL,
  KEY idx_nt_at (at_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- JEJAK AUDIT (APPEND-ONLY) ----------
-- Tidak pernah ditimpa/dihapus oleh saveAll. Ini catatan siapa mengubah apa.
CREATE TABLE IF NOT EXISTS activities (
  id       VARCHAR(64) NOT NULL PRIMARY KEY,
  ref_type VARCHAR(32)     NULL,               -- event / client / dst
  ref_id   VARCHAR(64)     NULL,
  action   VARCHAR(255)    NULL,
  by_user  VARCHAR(255)    NULL,
  at_time  DATETIME        NULL,
  data     LONGTEXT    NOT NULL,
  KEY idx_ac_ref (ref_type, ref_id),
  KEY idx_ac_at  (at_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- KONFIGURASI ----------
-- Menyimpan yang bukan daftar: settings{}, baseline, rolePerms{}, roleNav{}.
-- Kunci top-level BARU yang belum dikenal backend juga mendarat di sini,
-- supaya tidak ada data yang diam-diam hilang saat aplikasi berkembang.
CREATE TABLE IF NOT EXISTS settings (
  k VARCHAR(64) NOT NULL PRIMARY KEY,
  v LONGTEXT    NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
