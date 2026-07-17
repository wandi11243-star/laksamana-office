-- =====================================================================
-- HR / PEOPLE OS LAKSAMANA MUDA — Skema MySQL
-- ---------------------------------------------------------------------
-- Pola sama dengan modul lain (event/marketing/konten/akademi):
--   1 baris per record, kolom inti untuk QUERY + `data` LONGTEXT (JSON)
--   sebagai SUMBER KEBENARAN. Kalau aplikasi menambah field baru, field itu
--   tetap tersimpan di `data` tanpa perlu ubah skema. Kolom inti boleh
--   "ketinggalan" tanpa ada data yang hilang.
--
-- BEDA PENTING dari modul lain — penjaga bentrok:
--   HR memakai revisi SELURUH DOKUMEN (`_rev`), bukan per-baris
--   (`baseUpdatedAt`). Ini bawaan desain frontend HR yang sudah jalan:
--   client kirim baseRev, server menolak kalau sudah ada yang menyimpan
--   duluan, lalu frontend menampilkan modal "Muat ulang". Modelnya lebih
--   galak (dua HRD menyunting kru BERBEDA tetap dianggap bentrok) tapi
--   tidak pernah menimpa kerja orang diam-diam. Dipertahankan apa adanya
--   supaya frontend yang sudah teruji tidak perlu dibongkar.
--
-- Nama kolom sengaja TIDAK memakai kata kunci MySQL. Yang dipetakan ulang:
--   app `type`  -> kolom `jenis`      (rewards, violations, trainings)
--   app `level` -> kolom `tingkat`    (employees)
--   app `date`  -> kolom `tanggal`
--   app `month` -> kolom `bulan`
--   app `text`  -> hanya di `data`, tidak diindeks
-- =====================================================================

SET NAMES utf8mb4;
SET time_zone = '+00:00';

-- ---------------------------------------------------------------------
-- META: revisi dokumen. Inilah kunci penjaga bentrok.
-- Selalu tepat 1 baris (id=1). `rev` naik tiap simpan yang diterima.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS meta (
  id        TINYINT      NOT NULL PRIMARY KEY,   -- selalu 1
  rev       BIGINT       NOT NULL DEFAULT 0,
  saved_at  VARCHAR(40)  NOT NULL DEFAULT '',
  saved_by  VARCHAR(120) NOT NULL DEFAULT '',
  versi     INT          NOT NULL DEFAULT 1      -- S.version aplikasi
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO meta (id, rev, saved_at, saved_by, versi)
VALUES (1, 0, '', '', 1)
ON DUPLICATE KEY UPDATE id = id;   -- aman dijalankan ulang, tidak mereset rev

-- ---------------------------------------------------------------------
-- SETTINGS: 1 baris per kunci top-level (scoreWeights, grades, dst).
-- Nilai disimpan sebagai JSON supaya bentuk apa pun ikut terbawa.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS settings (
  k  VARCHAR(80) NOT NULL PRIMARY KEY,
  v  LONGTEXT    NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- DIVISI
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS divisions (
  id    VARCHAR(64)  NOT NULL PRIMARY KEY,
  nama  VARCHAR(190) NOT NULL DEFAULT '',
  warna VARCHAR(32)  NOT NULL DEFAULT '',
  data  LONGTEXT     NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- KRU. Berisi PII (tgl lahir, telepon, email) dan PIN akses.
-- Jangan pernah diekspor ke repo atau dikirim ke pihak ketiga.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS employees (
  id        VARCHAR(64)  NOT NULL PRIMARY KEY,
  nama      VARCHAR(190) NOT NULL DEFAULT '',
  jabatan   VARCHAR(190) NOT NULL DEFAULT '',   -- app: role
  div_id    VARCHAR(64)  NOT NULL DEFAULT '',
  tingkat   VARCHAR(80)  NOT NULL DEFAULT '',   -- app: level
  app_role  VARCHAR(40)  NOT NULL DEFAULT '',   -- ceo/hr/manager/crew
  join_date VARCHAR(20)  NOT NULL DEFAULT '',
  status    VARCHAR(40)  NOT NULL DEFAULT '',
  data      LONGTEXT     NOT NULL,              -- termasuk pin, phone, email, birthDate
  KEY idx_emp_div (div_id),
  KEY idx_emp_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- KPI: template per divisi (items[] bersarang tetap utuh di `data`)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS kpi_templates (
  id     VARCHAR(64) NOT NULL PRIMARY KEY,
  div_id VARCHAR(64) NOT NULL DEFAULT '',
  data   LONGTEXT    NOT NULL,
  KEY idx_kpit_div (div_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- kpiActuals: peta bersarang { divId: { 'YYYY-MM': { kpiItemId: angka } } }
-- Dipipihkan jadi baris supaya bisa di-query per divisi/bulan.
CREATE TABLE IF NOT EXISTS kpi_actuals (
  div_id  VARCHAR(64) NOT NULL,
  bulan   VARCHAR(10) NOT NULL,     -- 'YYYY-MM'
  item_id VARCHAR(64) NOT NULL,
  nilai   DOUBLE      NULL,         -- boleh NULL: "belum diisi" != 0
  PRIMARY KEY (div_id, bulan, item_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- monthlyInputs: peta { empId: { 'YYYY-MM': {attendance, review, teamwork, ...} }
-- Isi per bulan disimpan utuh sebagai JSON (field-nya bisa bertambah).
CREATE TABLE IF NOT EXISTS monthly_inputs (
  emp_id VARCHAR(64) NOT NULL,
  bulan  VARCHAR(10) NOT NULL,
  data   LONGTEXT    NOT NULL,
  PRIMARY KEY (emp_id, bulan)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- OKR. Catatan: field asli = ownerType/ownerId/period
-- (komentar seed di frontend menyebut owner/divId/month — itu SUDAH BASI).
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS okrs (
  id         VARCHAR(64)  NOT NULL PRIMARY KEY,
  owner_type VARCHAR(20)  NOT NULL DEFAULT '',   -- 'div' | 'emp'
  owner_id   VARCHAR(64)  NOT NULL DEFAULT '',
  periode    VARCHAR(40)  NOT NULL DEFAULT '',   -- app: period
  data       LONGTEXT     NOT NULL,              -- termasuk keyResults[]
  KEY idx_okr_owner (owner_type, owner_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- REVIEW 360 (layers: self/manager/hr/ceo tetap utuh di `data`)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS reviews (
  id     VARCHAR(64) NOT NULL PRIMARY KEY,
  emp_id VARCHAR(64) NOT NULL DEFAULT '',
  bulan  VARCHAR(10) NOT NULL DEFAULT '',
  status VARCHAR(40) NOT NULL DEFAULT '',
  data   LONGTEXT    NOT NULL,
  KEY idx_rv_emp (emp_id, bulan)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS competencies (
  id     VARCHAR(64) NOT NULL PRIMARY KEY,
  emp_id VARCHAR(64) NOT NULL DEFAULT '',
  data   LONGTEXT    NOT NULL,              -- skills[] {name, level}
  KEY idx_cm_emp (emp_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- TRAINING
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS trainings (
  id        VARCHAR(64)  NOT NULL PRIMARY KEY,
  judul     VARCHAR(255) NOT NULL DEFAULT '',
  div_id    VARCHAR(64)  NOT NULL DEFAULT '',   -- bisa 'all'
  jenis     VARCHAR(80)  NOT NULL DEFAULT '',   -- app: type
  mandatory TINYINT(1)   NOT NULL DEFAULT 0,
  data      LONGTEXT     NOT NULL,
  KEY idx_tr_div (div_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS training_records (
  id          VARCHAR(64) NOT NULL PRIMARY KEY,
  training_id VARCHAR(64) NOT NULL DEFAULT '',
  emp_id      VARCHAR(64) NOT NULL DEFAULT '',
  status      VARCHAR(40) NOT NULL DEFAULT '',   -- Lulus/Gagal
  skor        DOUBLE      NULL,                  -- app: score
  tanggal     VARCHAR(20) NOT NULL DEFAULT '',
  data        LONGTEXT    NOT NULL,              -- termasuk certNo
  KEY idx_trc_emp (emp_id),
  KEY idx_trc_tr (training_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- COACHING / 1-on-1
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS coachings (
  id       VARCHAR(64) NOT NULL PRIMARY KEY,
  emp_id   VARCHAR(64) NOT NULL DEFAULT '',
  coach_id VARCHAR(64) NOT NULL DEFAULT '',
  tanggal  VARCHAR(20) NOT NULL DEFAULT '',
  status   VARCHAR(40) NOT NULL DEFAULT '',
  data     LONGTEXT    NOT NULL,   -- problem, actionPlan, deadline, followUp
  KEY idx_co_emp (emp_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- POIN & PENGHARGAAN
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS rewards (
  id      VARCHAR(64) NOT NULL PRIMARY KEY,
  emp_id  VARCHAR(64) NOT NULL DEFAULT '',
  tanggal VARCHAR(20) NOT NULL DEFAULT '',
  jenis   VARCHAR(20) NOT NULL DEFAULT '',   -- app: type ('earn'/'redeem')
  points  DOUBLE      NOT NULL DEFAULT 0,
  data    LONGTEXT    NOT NULL,
  KEY idx_rw_emp (emp_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS badges (
  id     VARCHAR(64)  NOT NULL PRIMARY KEY,
  emp_id VARCHAR(64)  NOT NULL DEFAULT '',
  bulan  VARCHAR(10)  NOT NULL DEFAULT '',
  badge  VARCHAR(120) NOT NULL DEFAULT '',
  data   LONGTEXT     NOT NULL,
  KEY idx_bd_emp (emp_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- PELANGGARAN / SP. Sensitif — riwayat disiplin kru.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS violations (
  id       VARCHAR(64) NOT NULL PRIMARY KEY,
  emp_id   VARCHAR(64) NOT NULL DEFAULT '',
  tanggal  VARCHAR(20) NOT NULL DEFAULT '',
  jenis    VARCHAR(120) NOT NULL DEFAULT '',  -- app: type
  severity VARCHAR(20) NOT NULL DEFAULT '',   -- Ringan/Sedang/Berat
  sp       VARCHAR(10) NOT NULL DEFAULT '',   -- ''/SP1/SP2/SP3
  status   VARCHAR(40) NOT NULL DEFAULT '',
  data     LONGTEXT    NOT NULL,
  KEY idx_vi_emp (emp_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS feedbacks (
  id      VARCHAR(64) NOT NULL PRIMARY KEY,
  emp_id  VARCHAR(64) NOT NULL DEFAULT '',
  tanggal VARCHAR(20) NOT NULL DEFAULT '',
  kind    VARCHAR(40) NOT NULL DEFAULT '',   -- positif/komplain
  data    LONGTEXT    NOT NULL,
  KEY idx_fb_emp (emp_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- KARIR & SUKSESI
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS career_paths (
  id    VARCHAR(64)  NOT NULL PRIMARY KEY,
  track VARCHAR(120) NOT NULL DEFAULT '',
  data  LONGTEXT     NOT NULL     -- steps[], req
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS successions (
  id        VARCHAR(64)  NOT NULL PRIMARY KEY,
  posisi    VARCHAR(190) NOT NULL DEFAULT '',   -- app: position
  emp_id    VARCHAR(64)  NOT NULL DEFAULT '',
  readiness VARCHAR(40)  NOT NULL DEFAULT '',
  data      LONGTEXT     NOT NULL,
  KEY idx_sc_emp (emp_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- SUARA KRU
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS moods (
  id      VARCHAR(64) NOT NULL PRIMARY KEY,
  emp_id  VARCHAR(64) NOT NULL DEFAULT '',
  tanggal VARCHAR(20) NOT NULL DEFAULT '',
  mood    INT         NULL,
  data    LONGTEXT    NOT NULL,
  KEY idx_md_emp (emp_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- emp_id sengaja NULLable: saran boleh ANONIM (frontend mengirim null saat
-- kotak "anonim" dicentang). NOT NULL akan mengubah saran anonim jadi
-- ketahuan pemiliknya — justru merusak janji ke kru.
CREATE TABLE IF NOT EXISTS suggestions (
  id      VARCHAR(64) NOT NULL PRIMARY KEY,
  emp_id  VARCHAR(64) NULL,
  tanggal VARCHAR(20) NOT NULL DEFAULT '',
  status  VARCHAR(40) NOT NULL DEFAULT '',
  data    LONGTEXT    NOT NULL,   -- text, response
  KEY idx_sg_emp (emp_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS calendar (
  id      VARCHAR(64)  NOT NULL PRIMARY KEY,
  tanggal VARCHAR(20)  NOT NULL DEFAULT '',
  kind    VARCHAR(40)  NOT NULL DEFAULT '',
  judul   VARCHAR(255) NOT NULL DEFAULT '',
  data    LONGTEXT     NOT NULL,
  KEY idx_cal_tgl (tanggal)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- AUDIT — append-only. Tidak pernah dihapus oleh saveAll, hanya ditambah.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit (
  id        VARCHAR(64)  NOT NULL PRIMARY KEY,
  at        VARCHAR(40)  NOT NULL DEFAULT '',
  user_id   VARCHAR(64)  NOT NULL DEFAULT '',
  user_name VARCHAR(190) NOT NULL DEFAULT '',
  action    VARCHAR(80)  NOT NULL DEFAULT '',
  detail    TEXT         NULL,
  KEY idx_au_at (at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
