-- ====================================================================
-- EVENT MANAGEMENT SYSTEM (EMS) LAKSAMANA MUDA — Skema MySQL
-- --------------------------------------------------------------------
-- Jalankan SEKALI di database yang baru dibuat. Aman diulang (IF NOT EXISTS).
--
--   Rumahweb: cPanel > phpMyAdmin > pilih database > tab "SQL" > tempel > Go.
--   Lokal:    mysql -u root -p db_ems < schema.sql
--
-- MODEL DATA (sama pola dengan reservasi-mysql, supaya sekali paham dipakai
-- di dua modul):
--   - 1 BARIS per record. Kolom inti (untuk query, urut & indeks) + kolom
--     `data` (JSON utuh objek apa adanya dari aplikasi).
--   - SUMBER KEBENARAN = kolom `data`. Kolom lain hasil ekstraksi; kalau
--     aplikasi menambah field baru, `data` otomatis ikut tanpa ubah skema.
--   - `updated_at` (epoch ms) dipakai sebagai penjaga optimistic-lock:
--     baris kiriman yang LEBIH LAMA tidak menimpa baris server yang lebih baru.
--     Inilah yang mencegah dua kru saling menimpa (masalah yang sama sudah
--     ditutup di modul Marketing & Reservasi).
--   - `checkins` bersifat APPEND-ONLY (jejak kehadiran tidak boleh hilang).
--   - `settings` menyimpan konfigurasi kecil (entertainmentRules, role) sbg JSON.
--
-- Tidak ada tabel foto: modul ini memakai emoji poster, dan tombol upload
-- dokumen masih demo. Kalau nanti perlu file, ikuti pola DATA_DIR di
-- reservasi-mysql (foto di disk, bukan di MySQL).
-- ====================================================================

-- ---------- TALENT ----------
CREATE TABLE IF NOT EXISTS talents (
  id              VARCHAR(64)  NOT NULL PRIMARY KEY,
  name            VARCHAR(255)     NULL,
  category        VARCHAR(64)      NULL,
  phone           VARCHAR(32)      NULL,
  status          VARCHAR(32)      NULL,          -- Active / Inactive
  contract_status VARCHAR(32)      NULL,          -- None / Active / Expired
  default_fee     BIGINT       NOT NULL DEFAULT 0,
  updated_at      BIGINT       NOT NULL DEFAULT 0,
  created_at      BIGINT       NOT NULL DEFAULT 0,
  data            LONGTEXT     NOT NULL,
  KEY idx_tal_status   (status),
  KEY idx_tal_category (category),
  KEY idx_tal_updated  (updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- EVENT ----------
CREATE TABLE IF NOT EXISTS events (
  id             VARCHAR(64)  NOT NULL PRIMARY KEY,
  title          VARCHAR(255)     NULL,
  category       VARCHAR(64)      NULL,
  status         VARCHAR(32)      NULL,           -- Draft/Upcoming/Today/Finished/Cancelled
  venue          VARCHAR(255)     NULL,
  start_datetime DATETIME         NULL,
  end_datetime   DATETIME         NULL,
  capacity       INT          NOT NULL DEFAULT 0,
  pic            VARCHAR(255)     NULL,
  is_ticketed    TINYINT(1)   NOT NULL DEFAULT 0,
  idea_id        VARCHAR(64)      NULL,
  updated_at     BIGINT       NOT NULL DEFAULT 0,
  created_at     BIGINT       NOT NULL DEFAULT 0,
  data           LONGTEXT     NOT NULL,
  KEY idx_ev_status  (status),
  KEY idx_ev_start   (start_datetime),
  KEY idx_ev_idea    (idea_id),
  KEY idx_ev_updated (updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Detail per event (timeline, rundown, vendor, budget, sponsor, task).
-- Disimpan 1 baris per event sebagai JSON: isinya list kecil yang selalu
-- dibaca/ditulis sekaligus per event, jadi tidak perlu dipecah jadi 6 tabel.
CREATE TABLE IF NOT EXISTS event_details (
  event_id   VARCHAR(64) NOT NULL PRIMARY KEY,
  updated_at BIGINT      NOT NULL DEFAULT 0,
  data       LONGTEXT    NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- JADWAL TALENT ----------
CREATE TABLE IF NOT EXISTS schedules (
  id               VARCHAR(64) NOT NULL PRIMARY KEY,
  talent_id        VARCHAR(64)     NULL,
  event_id         VARCHAR(64)     NULL,
  tanggal          DATE            NULL,          -- s.date (YYYY-MM-DD)
  start_time       VARCHAR(8)      NULL,          -- HH:MM
  end_time         VARCHAR(8)      NULL,
  performance_type VARCHAR(64)     NULL,
  fee              BIGINT      NOT NULL DEFAULT 0,
  status           VARCHAR(32)     NULL,          -- Scheduled/Confirmed/Done/Cancelled
  source           VARCHAR(32)     NULL,          -- manual/recurring/monthly_generator
  updated_at       BIGINT      NOT NULL DEFAULT 0,
  created_at       BIGINT      NOT NULL DEFAULT 0,
  data             LONGTEXT    NOT NULL,
  KEY idx_sc_talent  (talent_id),
  KEY idx_sc_tanggal (tanggal),
  KEY idx_sc_status  (status),
  -- pencarian bentrok (anti double-booking) selalu per talent + tanggal
  KEY idx_sc_konflik (talent_id, tanggal, status),
  KEY idx_sc_updated (updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS recurring_rules (
  id         VARCHAR(64) NOT NULL PRIMARY KEY,
  talent_id  VARCHAR(64)     NULL,
  valid_from DATE            NULL,
  valid_to   DATE            NULL,
  updated_at BIGINT      NOT NULL DEFAULT 0,
  data       LONGTEXT    NOT NULL,
  KEY idx_rr_talent (talent_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- FEE & PEMBAYARAN ----------
CREATE TABLE IF NOT EXISTS talent_payments (
  id           VARCHAR(64) NOT NULL PRIMARY KEY,
  talent_id    VARCHAR(64)     NULL,
  period_month VARCHAR(7)      NULL,              -- YYYY-MM
  show_count   INT         NOT NULL DEFAULT 0,
  total_amount BIGINT      NOT NULL DEFAULT 0,
  status       VARCHAR(32)     NULL,              -- Waiting/Paid/Rejected
  updated_at   BIGINT      NOT NULL DEFAULT 0,
  data         LONGTEXT    NOT NULL,
  KEY idx_tp_talent (talent_id),
  KEY idx_tp_period (period_month),
  KEY idx_tp_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- TICKETING ----------
CREATE TABLE IF NOT EXISTS ticket_classes (
  id         VARCHAR(64) NOT NULL PRIMARY KEY,
  event_id   VARCHAR(64)     NULL,
  name       VARCHAR(255)    NULL,
  price      BIGINT      NOT NULL DEFAULT 0,
  quota      INT         NOT NULL DEFAULT 0,
  sold       INT         NOT NULL DEFAULT 0,
  is_seated  TINYINT(1)  NOT NULL DEFAULT 0,
  updated_at BIGINT      NOT NULL DEFAULT 0,
  data       LONGTEXT    NOT NULL,
  KEY idx_tc_event (event_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS seats (
  id              VARCHAR(64) NOT NULL PRIMARY KEY,
  event_id        VARCHAR(64)     NULL,
  ticket_class_id VARCHAR(64)     NULL,
  zone            VARCHAR(64)     NULL,
  table_no        VARCHAR(32)     NULL,
  status          VARCHAR(32)     NULL,           -- Available/Sold/Locked
  updated_at      BIGINT      NOT NULL DEFAULT 0,
  data            LONGTEXT    NOT NULL,
  KEY idx_st_event (event_id),
  KEY idx_st_class (ticket_class_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS orders (
  id             VARCHAR(64) NOT NULL PRIMARY KEY,
  event_id       VARCHAR(64)     NULL,
  buyer_name     VARCHAR(255)    NULL,
  phone          VARCHAR(32)     NULL,
  email          VARCHAR(255)    NULL,
  total          BIGINT      NOT NULL DEFAULT 0,
  payment_status VARCHAR(32)     NULL,            -- Paid/Pending/Failed/Refunded
  payment_ref    VARCHAR(64)     NULL,
  updated_at     BIGINT      NOT NULL DEFAULT 0,
  created_at     BIGINT      NOT NULL DEFAULT 0,
  data           LONGTEXT    NOT NULL,
  KEY idx_or_event  (event_id),
  KEY idx_or_status (payment_status),
  KEY idx_or_phone  (phone)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS tickets (
  id              VARCHAR(64)  NOT NULL PRIMARY KEY,
  order_item_id   VARCHAR(64)      NULL,
  ticket_class_id VARCHAR(64)      NULL,
  seat_id         VARCHAR(64)      NULL,
  ticket_number   VARCHAR(64)      NULL,
  qr_token        VARCHAR(191)     NULL,
  status          VARCHAR(32)      NULL,          -- Valid/Checked-In/Cancelled
  updated_at      BIGINT       NOT NULL DEFAULT 0,
  data            LONGTEXT     NOT NULL,
  -- QR wajib unik: 1 token = 1 tiket. Ini yang membuat scan ganda ketahuan
  -- di level database, bukan cuma di aplikasi.
  UNIQUE KEY uq_tk_qr (qr_token),
  KEY idx_tk_order (order_item_id),
  KEY idx_tk_seat  (seat_id),
  KEY idx_tk_status(status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Jejak check-in: APPEND-ONLY, tidak pernah dihapus/ditimpa oleh saveAll.
CREATE TABLE IF NOT EXISTS checkins (
  id            VARCHAR(64) NOT NULL PRIMARY KEY,
  ticket_id     VARCHAR(64)     NULL,
  checked_in_at DATETIME        NULL,
  staff         VARCHAR(255)    NULL,
  gate          VARCHAR(64)     NULL,
  result        VARCHAR(32)     NULL,
  data          LONGTEXT    NOT NULL,
  KEY idx_ci_ticket (ticket_id),
  KEY idx_ci_at     (checked_in_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS refunds (
  id         VARCHAR(64) NOT NULL PRIMARY KEY,
  order_id   VARCHAR(64)     NULL,
  status     VARCHAR(32)     NULL,               -- Pending/Approved/Rejected
  updated_at BIGINT      NOT NULL DEFAULT 0,
  data       LONGTEXT    NOT NULL,
  KEY idx_rf_order  (order_id),
  KEY idx_rf_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- INTELLIGENCE ----------
CREATE TABLE IF NOT EXISTS ideas (
  id         VARCHAR(64) NOT NULL PRIMARY KEY,
  name       VARCHAR(255)    NULL,
  category   VARCHAR(64)     NULL,
  frequency  VARCHAR(32)     NULL,
  difficulty VARCHAR(32)     NULL,
  updated_at BIGINT      NOT NULL DEFAULT 0,
  data       LONGTEXT    NOT NULL,               -- termasuk evaluations[]
  KEY idx_id_category (category)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- KALENDER TERPADU ----------
CREATE TABLE IF NOT EXISTS calendar_extra (
  id         VARCHAR(64) NOT NULL PRIMARY KEY,
  type       VARCHAR(32)     NULL,               -- Reservation/Marketing/Holiday/Birthday
  title      VARCHAR(255)    NULL,
  tanggal    DATE            NULL,
  updated_at BIGINT      NOT NULL DEFAULT 0,
  data       LONGTEXT    NOT NULL,
  KEY idx_ce_tanggal (tanggal),
  KEY idx_ce_type    (type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- KONFIGURASI ----------
CREATE TABLE IF NOT EXISTS settings (
  k VARCHAR(64) NOT NULL PRIMARY KEY,            -- 'entertainmentRules', 'role'
  v LONGTEXT    NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
