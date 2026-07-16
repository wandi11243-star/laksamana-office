-- ====================================================================
-- RESERVASI LAKSAMANA MUDA — Skema MySQL (Jalan B)
-- --------------------------------------------------------------------
-- Jalankan SEKALI di database yang baru dibuat. Aman diulang (IF NOT EXISTS).
--
--   Rumahweb: cPanel > phpMyAdmin > pilih database > tab "SQL" > tempel > Go.
--   Lokal:    mysql -u root -p reservasi < schema.sql
--
-- MODEL DATA:
--   - reservations : 1 BARIS per reservasi. Kolom inti (untuk query & indeks) +
--                    kolom `data` (JSON utuh objek reservasi, termasuk dps/
--                    arrivals/followups). Sumber kebenaran = `data`; kolom lain
--                    hasil ekstraksi untuk laporan/urut/indeks.
--   - audit        : 1 baris per entri log (append-only, klien batasi 500).
--   - settings     : penyimpanan konfigurasi (master) sebagai 1 blob JSON.
--   Foto TIDAK di sini — tetap di disk (lihat config.php DATA_DIR).
-- ====================================================================

CREATE TABLE IF NOT EXISTS reservations (
  id          VARCHAR(64)  NOT NULL PRIMARY KEY,   -- rec.id (uid aplikasi)
  name        VARCHAR(255)     NULL,
  phone       VARCHAR(32)      NULL,
  tanggal     DATE             NULL,               -- rec.date (YYYY-MM-DD)
  jam         VARCHAR(8)       NULL,               -- rec.time (HH:MM)
  pax         INT          NOT NULL DEFAULT 0,
  status      VARCHAR(32)      NULL,
  pic_name    VARCHAR(255)     NULL,
  source      VARCHAR(64)      NULL,
  dp_amount   BIGINT       NOT NULL DEFAULT 0,
  updated_at  BIGINT       NOT NULL DEFAULT 0,     -- rec.updatedAt (epoch ms) — untuk optimistic concurrency
  created_at  BIGINT       NOT NULL DEFAULT 0,     -- rec.createdAt (epoch ms)
  data        LONGTEXT     NOT NULL,               -- JSON utuh objek reservasi
  KEY idx_tanggal   (tanggal),
  KEY idx_status    (status),
  KEY idx_phone     (phone),
  KEY idx_updated   (updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS audit (
  id    VARCHAR(64) NOT NULL PRIMARY KEY,          -- entri.id
  ts    BIGINT      NOT NULL DEFAULT 0,            -- entri.ts (epoch ms)
  data  LONGTEXT    NOT NULL,                      -- JSON utuh entri audit
  KEY idx_ts (ts)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS settings (
  k  VARCHAR(64) NOT NULL PRIMARY KEY,             -- mis. 'master'
  v  LONGTEXT    NOT NULL                          -- JSON
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
