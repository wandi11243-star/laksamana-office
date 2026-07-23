-- ====================================================================
-- BD OS — MIGRASI: Purchase Request (PR) mingguan
-- --------------------------------------------------------------------
-- Jalankan SEKALI di tiap database BD OS yang SUDAH ada tabelnya
-- (lakk5493_db_dev_bd dan lakk5493_db_bd). Pemasangan baru tidak perlu
-- file ini — schema.sql sudah memuat semuanya.
--
-- phpMyAdmin: pilih database > tab "SQL" > tempel > Go.
--
-- APA YANG BERUBAH DAN KENAPA
-- Sebelumnya tiap kebutuhan barang berdiri sendiri sebagai satu PO. Itu
-- tidak cocok dengan cara tim bekerja: yang benar-benar dikirim ke Finance
-- dan disetujui adalah SATU DOKUMEN PR MINGGUAN berisi banyak item, dengan
-- satu nomor PR, satu tanggal, dan satu blok tanda tangan.
--
-- Jadi sekarang ada dua tingkat, dan keduanya perlu ada:
--   purchase_orders    = satu BARIS kebutuhan (siapa pun boleh mengajukan)
--   purchase_requests  = satu DOKUMEN mingguan yang mengumpulkannya
--
-- Barisnya TIDAK disalin ke dalam dokumen. `purchase_orders.pr_id` menunjuk
-- ke dokumennya, jadi tetap ada satu sumber kebenaran per item — dokumen
-- yang menyalin isinya akan menyimpang dari barisnya begitu salah satu
-- diubah, dan tidak ada yang tahu mana yang benar.
-- ====================================================================

-- ---------- DOKUMEN PR MINGGUAN ----------
CREATE TABLE IF NOT EXISTS purchase_requests (
  id         VARCHAR(64)  NOT NULL PRIMARY KEY,
  no         VARCHAR(32)      NULL,              -- nomor PR di kertas, mis. "96"
  nama       VARCHAR(255)     NULL,              -- penyusun (NAME di lembar)
  dept       VARCHAR(64)      NULL,              -- DEPARTMENT
  tanggal    DATE             NULL,              -- REQUEST DATE
  week_start DATE             NULL,              -- Senin minggu yang direkap
  status     VARCHAR(32)      NULL,              -- Draft/Diajukan/Disetujui/Selesai
  total      BIGINT       NOT NULL DEFAULT 0,    -- grand total saat disimpan
  updated_at BIGINT       NOT NULL DEFAULT 0,
  created_at BIGINT       NOT NULL DEFAULT 0,
  data       LONGTEXT     NOT NULL,
  KEY idx_pq_week    (week_start),
  KEY idx_pq_status  (status),
  KEY idx_pq_no      (no),
  KEY idx_pq_updated (updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- KOLOM BARU DI purchase_orders ----------
-- MySQL 5.x/MariaDB lama tidak mengenal "ADD COLUMN IF NOT EXISTS".
-- Kalau kolomnya sudah ada, perintahnya akan menolak dengan error 1060
-- ("Duplicate column name") — itu AMAN diabaikan, bukan tanda ada yang
-- rusak. Jalankan satu per satu kalau phpMyAdmin berhenti di tengah.

ALTER TABLE purchase_orders ADD COLUMN payment VARCHAR(16) NULL AFTER amount;
ALTER TABLE purchase_orders ADD COLUMN pr_id   VARCHAR(64) NULL AFTER project_id;
ALTER TABLE purchase_orders ADD KEY idx_po_pr (pr_id);

-- Baris lama belum punya cara bayar. Dibiarkan NULL, BUKAN diisi 'CASH':
-- menebak cara bayar berarti menaruh angka di kolom TOTAL CASH yang tidak
-- pernah dikatakan siapa pun, dan rekap yang mengarang lebih berbahaya
-- daripada rekap yang mengaku tidak tahu.
