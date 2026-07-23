-- ====================================================================
-- BD OS LAKSAMANA MUDA — Skema MySQL
-- --------------------------------------------------------------------
-- Modul: Business Development, Project & Purchasing (deploy/bd/).
-- Jalankan SEKALI di database yang BARU dibuat. Aman diulang (IF NOT EXISTS).
--
--   Rumahweb: cPanel > phpMyAdmin > pilih database > tab "SQL" > tempel > Go.
--   Lokal:    mysql -u root -p db_bd < schema.sql
--
-- >>> DATABASE SENDIRI, JANGAN MENUMPANG. <<<
-- Nama tabel di sini (tasks, projects, orders, people) adalah nama umum.
-- Kalau skema ini dijalankan di database Event atau Marketing, `IF NOT EXISTS`
-- justru berbahaya: tabel senama yang sudah ada TIDAK dibuat ulang dan TIDAK
-- ada peringatan — backend BD akan menulis ke tabel milik modul lain dan
-- merusaknya tanpa satu pun pesan error.
--
-- MODEL DATA (sama pola dengan event-mysql & reservasi-mysql, supaya sekali
-- paham kepakai di semua modul):
--   - 1 BARIS per record. Kolom inti (untuk query, urut & indeks) + kolom
--     `data` (JSON utuh objek apa adanya dari aplikasi).
--   - SUMBER KEBENARAN = kolom `data`. Kolom lain hasil ekstraksi; kalau
--     aplikasi menambah field baru, `data` otomatis ikut tanpa ubah skema.
--   - `updated_at` (epoch ms) dipakai sebagai penjaga optimistic-lock:
--     baris kiriman yang LEBIH LAMA tidak menimpa baris server yang lebih baru.
--     Inilah yang mencegah dua kru saling menimpa.
--   - `settings` menyimpan konfigurasi kecil (fokus harian) sebagai JSON.
--
-- KOLOM `divisi`, BUKAN `div` — JANGAN DIKEMBALIKAN.
-- Field-nya di aplikasi memang bernama `div`, tapi `DIV` adalah KATA KUNCI
-- MySQL/MariaDB (operator pembagian bulat, `7 DIV 2`). `div VARCHAR(64)`
-- ditolak dengan error 1064, dan `INSERT INTO people (…,div,…)` ikut gagal.
-- Backtick sebenarnya cukup, tapi kolom yang butuh kutip di SETIAP query cepat
-- atau lambat akan lolos tanpa kutip di satu tempat. Pemetaannya ada di
-- collections() pada lib_bd_mysql.php; JSON di kolom `data` tetap `div`,
-- jadi frontend tidak tahu-menahu soal ini.
--
-- Tidak ada tabel berkas: BD OS tidak mengunggah apa pun. Kalau nanti perlu
-- (mis. lampiran penawaran vendor), ikuti pola DATA_DIR di event-mysql —
-- biner di disk, bukan base64 di dalam state.
-- ====================================================================

-- ---------- KRU BD ----------
-- LAPISAN TAMBAHAN di atas akun Office, BUKAN daftar kru tersendiri.
--
-- Barisnya lahir otomatis dari database account: aplikasi memanggil
-- account-api-mysql `listModuleRoster` untuk modul `bd`, yang mengembalikan
-- persis pemegang hak akses modul ini. Tidak ada tombol "tambah kru" di
-- aplikasi — siapa yang boleh masuk ditentukan di Office (Kelola Akses).
--
-- Yang MILIK tabel ini cuma tiga: `role` (jabatan), `divisi`, dan `boss_id`
-- (atasan). Office tidak mengenal hierarki, padahal justru atasan yang
-- menentukan siapa melihat task siapa — seorang atasan melihat task seluruh
-- anak buahnya, staff hanya miliknya.
--
-- `name` dan `active` disalin dari account tiap sinkron; jangan diedit di
-- sini, tulisannya akan tertimpa. `office_user_id` adalah tautannya
-- (lm_session.userId / accounts.id).
--
-- Baris TIDAK pernah dihapus otomatis saat akses dicabut — hanya ditandai
-- `tanpaAkses` di dalam kolom `data`. Menghapusnya membuat semua task yang
-- pernah dipegang orang itu jadi PIC "—", dan jejak siapa mengerjakan apa
-- hilang untuk selamanya. Hilangnya akses bukan alasan menghapus sejarah.
CREATE TABLE IF NOT EXISTS people (
  id             VARCHAR(64)  NOT NULL PRIMARY KEY,
  name           VARCHAR(255)     NULL,
  role           VARCHAR(128)     NULL,          -- jabatan, mis. "BD Manager"
  divisi         VARCHAR(64)      NULL,          -- Business Development / Project / Purchasing
  boss_id        VARCHAR(64)      NULL,          -- atasan langsung (people.id)
  office_user_id VARCHAR(64)      NULL,          -- lm_session.userId
  active         TINYINT(1)   NOT NULL DEFAULT 1,
  updated_at     BIGINT       NOT NULL DEFAULT 0,
  created_at     BIGINT       NOT NULL DEFAULT 0,
  data           LONGTEXT     NOT NULL,
  KEY idx_pe_div     (divisi),
  KEY idx_pe_boss    (boss_id),
  KEY idx_pe_office  (office_user_id),
  KEY idx_pe_updated (updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- PROJECT ----------
-- Pekerjaan besar berjangka. `milestones` ikut di dalam `data` (list pendek
-- yang selalu dibaca/ditulis sekaligus dengan projectnya — tidak perlu tabel
-- sendiri).
CREATE TABLE IF NOT EXISTS projects (
  id         VARCHAR(64)  NOT NULL PRIMARY KEY,
  name       VARCHAR(255)     NULL,
  type       VARCHAR(64)      NULL,              -- Event/Renovasi/Launching/Internal/Ekspansi
  stage      VARCHAR(32)      NULL,              -- Idea/Planning/Running/Review/Completed
  divisi     VARCHAR(64)      NULL,
  pic        VARCHAR(64)      NULL,              -- pics[0]: PIC pertama, untuk indeks/laporan.
                                                --   Daftar LENGKAP ada di kolom `data` (`pics`) —
                                                --   satu baris boleh dipegang beberapa orang.
  start_date DATE             NULL,
  end_date   DATE             NULL,
  budget     BIGINT       NOT NULL DEFAULT 0,
  spent      BIGINT       NOT NULL DEFAULT 0,
  health     VARCHAR(16)      NULL,              -- on-track/at-risk/off-track
  updated_at BIGINT       NOT NULL DEFAULT 0,
  created_at BIGINT       NOT NULL DEFAULT 0,
  data       LONGTEXT     NOT NULL,
  KEY idx_pr_stage   (stage),
  KEY idx_pr_div     (divisi),
  KEY idx_pr_pic     (pic),
  KEY idx_pr_end     (end_date),
  KEY idx_pr_updated (updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- TASK ----------
-- `important` + `urgent` adalah dua sumbu matriks Eisenhower. Sengaja dua
-- kolom BOOLEAN, bukan satu kolom "kuadran": kuadran adalah TURUNAN dari
-- keduanya, dan menyimpan turunan berarti ada dua kebenaran yang bisa
-- menyimpang (task "penting+mendesak" tapi kuadrannya tertulis DELEGATE).
CREATE TABLE IF NOT EXISTS tasks (
  id         VARCHAR(64)  NOT NULL PRIMARY KEY,
  name       VARCHAR(255)     NULL,
  divisi     VARCHAR(64)      NULL,
  pic        VARCHAR(64)      NULL,              -- pics[0]: PIC pertama, untuk indeks/laporan.
                                                --   Daftar LENGKAP ada di kolom `data` (`pics`) —
                                                --   satu baris boleh dipegang beberapa orang.
  status     VARCHAR(32)      NULL,              -- Backlog/To Do/Doing/Waiting/Review/Done
  priority   VARCHAR(16)      NULL,              -- Urgent/High/Medium/Low
  deadline   DATE             NULL,
  important  TINYINT(1)   NOT NULL DEFAULT 0,
  urgent     TINYINT(1)   NOT NULL DEFAULT 0,
  type       VARCHAR(32)      NULL,              -- Ad-hoc/Rutin/Project
  project_id VARCHAR(64)      NULL,              -- projects.id, boleh NULL
  progress   INT          NOT NULL DEFAULT 0,
  updated_at BIGINT       NOT NULL DEFAULT 0,
  created_at BIGINT       NOT NULL DEFAULT 0,
  data       LONGTEXT     NOT NULL,
  KEY idx_ta_pic      (pic),
  KEY idx_ta_status   (status),
  KEY idx_ta_deadline (deadline),
  KEY idx_ta_project  (project_id),
  -- papan Eisenhower selalu memfilter status + dua sumbu sekaligus
  KEY idx_ta_kuadran  (status, important, urgent),
  KEY idx_ta_updated  (updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- ROUTINE ----------
-- Task berulang + catatan kepatuhannya (done/total/missed per periode).
CREATE TABLE IF NOT EXISTS routines (
  id         VARCHAR(64)  NOT NULL PRIMARY KEY,
  name       VARCHAR(255)     NULL,
  divisi     VARCHAR(64)      NULL,
  pic        VARCHAR(64)      NULL,
  freq       VARCHAR(16)      NULL,              -- Daily/Weekly/Monthly/Custom
  important  TINYINT(1)   NOT NULL DEFAULT 0,
  urgent     TINYINT(1)   NOT NULL DEFAULT 0,
  active     TINYINT(1)   NOT NULL DEFAULT 1,
  updated_at BIGINT       NOT NULL DEFAULT 0,
  created_at BIGINT       NOT NULL DEFAULT 0,
  data       LONGTEXT     NOT NULL,
  KEY idx_ro_div     (divisi),
  KEY idx_ro_pic     (pic),
  KEY idx_ro_active  (active),
  KEY idx_ro_updated (updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- KOORDINASI ANTAR-DIVISI ----------
-- Permintaan dari tim BD/Project/Purchasing ke divisi lain (Kitchen, Bar,
-- Marketing, dst). Ini CATATAN PERMINTAAN, bukan task divisi tujuan: divisi
-- tujuan punya modulnya sendiri. Yang dilacak di sini cuma "sudah sampai
-- mana permintaan kita".
CREATE TABLE IF NOT EXISTS coord_requests (
  id           VARCHAR(64)  NOT NULL PRIMARY KEY,
  title        VARCHAR(255)     NULL,
  from_div     VARCHAR(64)      NULL,
  to_div       VARCHAR(64)      NULL,
  requested_by VARCHAR(64)      NULL,            -- people.id peminta
  assignee     VARCHAR(128)     NULL,            -- nama PIC di divisi tujuan (teks bebas)
  status       VARCHAR(32)      NULL,            -- Diminta/Diproses/Review/Selesai
  priority     VARCHAR(16)      NULL,
  due_date     DATE             NULL,
  project_id   VARCHAR(64)      NULL,
  updated_at   BIGINT       NOT NULL DEFAULT 0,
  created_at   BIGINT       NOT NULL DEFAULT 0,
  data         LONGTEXT     NOT NULL,
  KEY idx_co_status  (status),
  KEY idx_co_todiv   (to_div),
  KEY idx_co_due     (due_date),
  KEY idx_co_project (project_id),
  KEY idx_co_updated (updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- PURCHASE ORDER ----------
-- CATATAN: ini PO tingkat proyek (mesin, furniture, sewa) milik tim BD —
-- BUKAN pengganti modul Stock. Order bahan baku harian tetap di Stock ·
-- Ordering/Purchasing. Dua tempat ini sengaja tidak disatukan: siklusnya
-- beda (harian vs per-proyek) dan yang menyetujuinya beda orang.
CREATE TABLE IF NOT EXISTS purchase_orders (
  id         VARCHAR(64)  NOT NULL PRIMARY KEY,
  item       VARCHAR(255)     NULL,
  vendor     VARCHAR(255)     NULL,
  qty        INT          NOT NULL DEFAULT 1,
  unit       VARCHAR(32)      NULL,
  divisi     VARCHAR(64)      NULL,
  amount     BIGINT       NOT NULL DEFAULT 0,
  status     VARCHAR(32)      NULL,              -- Draft/Diajukan/Approved/Dibeli/Diterima
  need_by    DATE             NULL,
  pic        VARCHAR(64)      NULL,
  project_id VARCHAR(64)      NULL,
  updated_at BIGINT       NOT NULL DEFAULT 0,
  created_at BIGINT       NOT NULL DEFAULT 0,
  data       LONGTEXT     NOT NULL,
  KEY idx_po_status  (status),
  KEY idx_po_need    (need_by),
  KEY idx_po_project (project_id),
  KEY idx_po_updated (updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- AGENDA ----------
-- Agenda internal tim BD (meeting, kunjungan vendor, investor call).
--
-- Namanya `agenda`, BUKAN `events`, dan itu disengaja. Di office ini "event"
-- sudah punya dua pemilik sah (modul Marketing untuk event yang dijual, modul
-- Event untuk jadwal talent). Tabel bernama `events` di sini akan mengundang
-- orang menyalin acara ke sini juga — dan salinan ketiga yang sama-sama bisa
-- diubah pasti menyimpang tanpa satu pun pesan error. Acara perusahaan dibaca
-- di modul Radar; yang ada di sini hanya agenda internal tim BD.
CREATE TABLE IF NOT EXISTS agenda (
  id         VARCHAR(64)  NOT NULL PRIMARY KEY,
  title      VARCHAR(255)     NULL,
  tanggal    DATE             NULL,
  type       VARCHAR(32)      NULL,              -- Meeting/Vendor/Internal/Deadline
  divisi     VARCHAR(64)      NULL,
  updated_at BIGINT       NOT NULL DEFAULT 0,
  created_at BIGINT       NOT NULL DEFAULT 0,
  data       LONGTEXT     NOT NULL,
  KEY idx_ag_tanggal (tanggal),
  KEY idx_ag_updated (updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- SETTING KECIL ----------
-- Saat ini hanya `focus`: fokus utama harian per orang, {peopleId:{teks,tgl}}.
CREATE TABLE IF NOT EXISTS settings (
  k VARCHAR(64) NOT NULL PRIMARY KEY,
  v LONGTEXT    NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
