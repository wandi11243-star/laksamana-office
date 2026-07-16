-- ====================================================================
-- KONTEN / CONTENT OPERATIONS LAKSAMANA MUDA — Skema MySQL
-- --------------------------------------------------------------------
-- Jalankan SEKALI di database yang baru dibuat. Aman diulang (IF NOT EXISTS).
--
--   Rumahweb: cPanel > phpMyAdmin > pilih database > tab "SQL" > tempel > Go.
--   Lokal:    mysql -u root -p db_konten < schema.sql
--
-- MODEL DATA (sama pola dengan reservasi/event/marketing-mysql):
--   - 1 BARIS per record. Kolom inti (untuk query/indeks/laporan) + kolom
--     `data` (JSON utuh objek apa adanya dari aplikasi).
--   - SUMBER KEBENARAN = kolom `data`. Aplikasi boleh menambah field baru
--     tanpa mengubah skema. `content.data` memuat caption, script, checklist,
--     comments, revisions, approvals, metrics, prod{} — semuanya ikut.
--   - `updated_at` (epoch ms) = penjaga optimistic-lock PER BARIS.
--   - `baseUpdatedAt` (dikirim klien, tidak disimpan) = penjaga bentrok:
--     baris yang sudah disalip kru lain DITOLAK, bukan ditimpa diam-diam.
--   - `logs` bersifat APPEND-ONLY (jejak audit tidak boleh hilang).
--
-- CATATAN NAMA KOLOM: hindari kata kunci MySQL. `rank`, `lead`, `div`, `read`
-- adalah reserved word — di sini dipakai nama lain (mis. `divisi`).
-- ====================================================================

-- ---------- ORANG ----------
CREATE TABLE IF NOT EXISTS users (
  id         VARCHAR(64) NOT NULL PRIMARY KEY,
  name       VARCHAR(255)    NULL,
  email      VARCHAR(255)    NULL,
  divisi     VARCHAR(64)     NULL,             -- app: division ("div" reserved word)
  capacity   INT         NOT NULL DEFAULT 0,
  avail      VARCHAR(32)     NULL,             -- available / busy / off
  updated_at BIGINT      NOT NULL DEFAULT 0,
  data       LONGTEXT    NOT NULL,             -- termasuk roles[], skills[], brands[], pin
  KEY idx_us_divisi (divisi),
  KEY idx_us_avail  (avail)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- BRAND & CAMPAIGN ----------
CREATE TABLE IF NOT EXISTS brands (
  id         VARCHAR(64) NOT NULL PRIMARY KEY,
  name       VARCHAR(255)    NULL,
  updated_at BIGINT      NOT NULL DEFAULT 0,
  data       LONGTEXT    NOT NULL              -- termasuk platforms[]
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS campaigns (
  id         VARCHAR(64) NOT NULL PRIMARY KEY,
  name       VARCHAR(255)    NULL,
  brand      VARCHAR(64)     NULL,
  start_date DATE            NULL,
  end_date   DATE            NULL,
  updated_at BIGINT      NOT NULL DEFAULT 0,
  data       LONGTEXT    NOT NULL,
  KEY idx_cp_brand (brand)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- KONTEN (inti modul) ----------
-- Satu baris = satu konten, dari Idea sampai Posted.
CREATE TABLE IF NOT EXISTS content (
  id           VARCHAR(64)  NOT NULL PRIMARY KEY,
  title        VARCHAR(255)     NULL,
  brand        VARCHAR(64)      NULL,
  campaign     VARCHAR(64)      NULL,
  platform     VARCHAR(32)      NULL,          -- platform utama (platforms[] lengkap di `data`)
  pillar       VARCHAR(64)      NULL,
  content_type VARCHAR(64)      NULL,          -- app: contentType
  status       VARCHAR(32)      NULL,          -- PIPELINE: Idea..Posted
  priority     VARCHAR(16)      NULL,
  pic          VARCHAR(64)      NULL,
  deadline     DATE             NULL,
  publish_date DATE             NULL,          -- app: publishDate
  publish_time VARCHAR(8)       NULL,
  updated_at   BIGINT       NOT NULL DEFAULT 0,
  created_at   BIGINT       NOT NULL DEFAULT 0,
  data         LONGTEXT     NOT NULL,          -- caption, script, checklist[], comments[],
                                               -- revisions[], approvals[], metrics{}, prod{}
  KEY idx_ct_status   (status),
  KEY idx_ct_pic      (pic),
  KEY idx_ct_brand    (brand),
  KEY idx_ct_campaign (campaign),
  KEY idx_ct_deadline (deadline),
  KEY idx_ct_publish  (publish_date),
  -- papan kanban selalu menyaring per status lalu urut deadline
  KEY idx_ct_board    (status, deadline),
  KEY idx_ct_updated  (updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Task produksi (todo/doing/done) — dipisah karena dikelola per task, bukan
-- selalu ikut kontennya.
CREATE TABLE IF NOT EXISTS prod_tasks (
  id         VARCHAR(64) NOT NULL PRIMARY KEY,
  content_id VARCHAR(64)     NULL,
  assignee   VARCHAR(64)     NULL,
  status     VARCHAR(32)     NULL,             -- todo / doing / done
  due_date   DATE            NULL,
  updated_at BIGINT      NOT NULL DEFAULT 0,
  data       LONGTEXT    NOT NULL,
  KEY idx_pt_content  (content_id),
  KEY idx_pt_assignee (assignee),
  KEY idx_pt_status   (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- SHOOTING & ASET ----------
CREATE TABLE IF NOT EXISTS shootings (
  id         VARCHAR(64) NOT NULL PRIMARY KEY,
  title      VARCHAR(255)    NULL,
  tanggal    DATE            NULL,
  location   VARCHAR(255)    NULL,
  status     VARCHAR(32)     NULL,
  updated_at BIGINT      NOT NULL DEFAULT 0,
  data       LONGTEXT    NOT NULL,
  KEY idx_sh_tanggal (tanggal),
  KEY idx_sh_status  (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Aset & bank ide/caption. File-nya TIDAK di MySQL — ikuti pola foto reservasi
-- (disimpan di disk, di luar web root; `data` hanya memuat penunjuknya).
CREATE TABLE IF NOT EXISTS assets (
  id         VARCHAR(64) NOT NULL PRIMARY KEY,
  name       VARCHAR(255)    NULL,
  kind       VARCHAR(64)     NULL,             -- app: type/kategori aset
  by_user    VARCHAR(64)     NULL,             -- app: by
  at_ms      BIGINT      NOT NULL DEFAULT 0,   -- app: at (epoch ms)
  updated_at BIGINT      NOT NULL DEFAULT 0,
  data       LONGTEXT    NOT NULL,
  KEY idx_as_kind (kind),
  KEY idx_as_at   (at_ms)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS bank (
  id         VARCHAR(64) NOT NULL PRIMARY KEY,
  owner      VARCHAR(64)     NULL,
  kind       VARCHAR(64)     NULL,
  at_ms      BIGINT      NOT NULL DEFAULT 0,
  updated_at BIGINT      NOT NULL DEFAULT 0,
  data       LONGTEXT    NOT NULL,             -- termasuk reference
  KEY idx_bk_owner (owner),
  KEY idx_bk_at    (at_ms)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- KOL / MEDIA PARTNER ----------
CREATE TABLE IF NOT EXISTS kols (
  id         VARCHAR(64) NOT NULL PRIMARY KEY,
  name       VARCHAR(255)    NULL,
  category   VARCHAR(64)     NULL,             -- KOL_CATEGORIES
  kol_type   VARCHAR(32)     NULL,             -- KOL / Media Partner
  platform   VARCHAR(32)     NULL,
  phone      VARCHAR(32)     NULL,
  status     VARCHAR(32)     NULL,
  followers  BIGINT      NOT NULL DEFAULT 0,
  rate       BIGINT      NOT NULL DEFAULT 0,
  updated_at BIGINT      NOT NULL DEFAULT 0,
  created_at BIGINT      NOT NULL DEFAULT 0,
  data       LONGTEXT    NOT NULL,
  KEY idx_kl_category (category),
  KEY idx_kl_type     (kol_type),
  KEY idx_kl_status   (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Kunjungan KOL/media ke outlet.
CREATE TABLE IF NOT EXISTS visits (
  id         VARCHAR(64) NOT NULL PRIMARY KEY,
  kol_id     VARCHAR(64)     NULL,
  tanggal    DATE            NULL,
  location   VARCHAR(255)    NULL,             -- VISIT_LOCATIONS
  status     VARCHAR(32)     NULL,
  updated_at BIGINT      NOT NULL DEFAULT 0,
  created_at BIGINT      NOT NULL DEFAULT 0,
  data       LONGTEXT    NOT NULL,
  KEY idx_vs_kol     (kol_id),
  KEY idx_vs_tanggal (tanggal),
  KEY idx_vs_status  (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- IKLAN BERBAYAR ----------
CREATE TABLE IF NOT EXISTS ads (
  id         VARCHAR(64) NOT NULL PRIMARY KEY,
  name       VARCHAR(255)    NULL,
  brand      VARCHAR(64)     NULL,
  platform   VARCHAR(32)     NULL,
  objective  VARCHAR(64)     NULL,             -- ADS_OBJECTIVES
  status     VARCHAR(32)     NULL,
  budget     BIGINT      NOT NULL DEFAULT 0,
  spent      BIGINT      NOT NULL DEFAULT 0,
  start_date DATE            NULL,
  end_date   DATE            NULL,
  updated_at BIGINT      NOT NULL DEFAULT 0,
  created_at BIGINT      NOT NULL DEFAULT 0,
  data       LONGTEXT    NOT NULL,             -- target[], usia, hasil/metrics
  KEY idx_ad_brand  (brand),
  KEY idx_ad_status (status),
  KEY idx_ad_start  (start_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Top-up / pengisian dana iklan.
CREATE TABLE IF NOT EXISTS ad_funds (
  id         VARCHAR(64) NOT NULL PRIMARY KEY,
  platform   VARCHAR(32)     NULL,
  amount     BIGINT      NOT NULL DEFAULT 0,
  tanggal    DATE            NULL,
  updated_at BIGINT      NOT NULL DEFAULT 0,
  created_at BIGINT      NOT NULL DEFAULT 0,
  data       LONGTEXT    NOT NULL,
  KEY idx_fd_platform (platform),
  KEY idx_fd_tanggal  (tanggal)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- NOTIFIKASI ----------
CREATE TABLE IF NOT EXISTS notifs (
  id         VARCHAR(64) NOT NULL PRIMARY KEY,
  for_user   VARCHAR(64)     NULL,             -- "for" reserved-ish; pakai for_user
  at_ms      BIGINT      NOT NULL DEFAULT 0,
  seen       TINYINT(1)  NOT NULL DEFAULT 0,   -- "read" reserved word -> seen
  updated_at BIGINT      NOT NULL DEFAULT 0,
  data       LONGTEXT    NOT NULL,
  KEY idx_nt_for  (for_user),
  KEY idx_nt_at   (at_ms)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- JEJAK AUDIT (APPEND-ONLY) ----------
-- Tidak pernah ditimpa/dihapus oleh saveAll.
CREATE TABLE IF NOT EXISTS logs (
  id       VARCHAR(64) NOT NULL PRIMARY KEY,
  ref_id   VARCHAR(64)     NULL,
  action   VARCHAR(255)    NULL,
  by_user  VARCHAR(255)    NULL,
  at_ms    BIGINT      NOT NULL DEFAULT 0,
  data     LONGTEXT    NOT NULL,
  KEY idx_lg_ref (ref_id),
  KEY idx_lg_at  (at_ms)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- KONFIGURASI ----------
-- settings{}, perms{}, seeded, dan kunci top-level BARU yang belum dikenal
-- backend (disimpan berawalan "extra:") supaya tidak ada data yang diam-diam
-- hilang saat aplikasi berkembang.
CREATE TABLE IF NOT EXISTS settings (
  k VARCHAR(64) NOT NULL PRIMARY KEY,
  v LONGTEXT    NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
