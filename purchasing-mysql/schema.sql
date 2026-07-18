-- =====================================================================
-- PURCHASING LAKSAMANA MUDA — Skema MySQL
-- ---------------------------------------------------------------------
-- Menggantikan EMPAT Web App Apps Script terpisah (orders, vendors,
-- items, users). Forecast SENGAJA TIDAK ikut — lihat catatan di bawah.
--
-- Pola sama dengan modul lain: 1 baris per record, kolom inti untuk QUERY
-- + `data` LONGTEXT (JSON) sebagai SUMBER KEBENARAN.
--
-- DIPAKAI OLEH DUA SITUS, SATU SKEMA:
--   office.laksamanamuda.id (main)    -> lakk5493_db_purchasing
--   dev.laksamanamuda.id    (develop) -> lakk5493_db_dev_purchasing
-- File ini dijalankan di KEDUANYA. Yang memisahkan bukan skema, tapi
-- config.php di masing-masing situs.
--
-- TIDAK ADA FOREIGN KEY, dan itu disengaja:
--   Di data live, 5 dari 237 produk menunjuk vendor yang TIDAK ADA di
--   daftar vendor (Ekaputra, Andersen, Online, dst). FK akan membuat
--   migrasi gagal — atau lebih buruk, memaksa membuang produk yang sah.
--   Nama vendor di sini memang teks bebas, bukan referensi.
-- =====================================================================

SET NAMES utf8mb4;
SET time_zone = '+00:00';

-- ---------------------------------------------------------------------
-- ORDERS — inti modul. 682 baris di data live.
--
-- PK = `nomor_order`, BUKAN row_index. Sudah diperiksa: 682 dari 682
-- nomorOrder unik, tidak ada yang kosong. row_index cuma nomor baris Sheet
-- (2..683) yang ikut terbawa — di Sheet dia bergeser kalau ada baris
-- dihapus, di MySQL tidak. Tetap disimpan karena frontend memakainya untuk
-- arsip: POST {action:'archive', rows:[rowIndex]}.
--
-- `waktu` bukan `timestamp`: TIMESTAMP nama tipe data di MySQL, dan kolom
-- bernama sama bikin query gampang salah baca.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS orders (
  nomor_order VARCHAR(64)  NOT NULL PRIMARY KEY,
  row_index   INT          NOT NULL,
  waktu       VARCHAR(30)  NOT NULL DEFAULT '',   -- app: timestamp 'YYYY-MM-DD HH:MM:SS'
  item        VARCHAR(190) NOT NULL DEFAULT '',
  qty         DOUBLE       NOT NULL DEFAULT 0,
  unit        VARCHAR(40)  NOT NULL DEFAULT '',
  tgl_datang  VARCHAR(20)  NOT NULL DEFAULT '',   -- app: tglDatang (bisa '-')
  pic         VARCHAR(120) NOT NULL DEFAULT '',
  status      VARCHAR(20)  NOT NULL DEFAULT '',   -- Aktif | Arsip
  kedatangan  VARCHAR(40)  NOT NULL DEFAULT '',   -- 'Datang' | ''
  data        LONGTEXT     NOT NULL,              -- termasuk note & catatan (tipe campur di data live)
  UNIQUE KEY uq_ord_row (row_index),
  KEY idx_ord_status (status),
  KEY idx_ord_item (item),
  KEY idx_ord_tgl (tgl_datang)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- VENDORS — 35 baris.
--
-- Di app bentuknya PETA berkunci NAMA: {"Sinar Horeca":{"whatsapp":"..."}}
-- jadi NAMA adalah identitasnya, bukan id buatan. PK = nama.
--
-- Catatan: Apps Script lama menyimpan vendor di sheet BERBENTUK ORDER —
-- `item` diisi nama vendor dan `qty` diisi nomor WhatsApp (jadi angka
-- 6282110691626). Balasan lamanya membawa sisa itu sebagai `orders`, dan
-- frontend mengabaikannya. Di sini vendor disimpan sebagaimana mestinya.
--
-- Berisi nomor WhatsApp vendor — jangan diekspor ke repo.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS vendors (
  nama     VARCHAR(190) NOT NULL PRIMARY KEY,
  whatsapp VARCHAR(40)  NOT NULL DEFAULT '',
  data     LONGTEXT     NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- PRODUCTS — 237 baris.
-- Peta berkunci NAMA: {"Ayam Paha Boneless (Kg)":{"utama":"Sinar Horeca",
-- "cadangan":["Sufo"]}}. cadangan[] tetap utuh di `data`.
-- `utama` TIDAK diberi FK ke vendors — lihat catatan di kepala berkas.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS products (
  nama  VARCHAR(190) NOT NULL PRIMARY KEY,
  utama VARCHAR(190) NOT NULL DEFAULT '',   -- vendor utama (teks bebas)
  data  LONGTEXT     NOT NULL,              -- termasuk cadangan[]
  KEY idx_prd_utama (utama)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- USERS — 2 baris di data live (Admin, Novi).
--
-- BERISI PIN LOGIN. Jangan pernah diekspor ke repo, chat, atau layanan
-- pihak ketiga. PIN disimpan apa adanya (bukan hash) karena frontend
-- membandingkannya langsung — sama seperti Apps Script lama. Mengubahnya
-- jadi hash berarti membongkar alur login, jadi dibiarkan setara dulu.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id         VARCHAR(64)  NOT NULL PRIMARY KEY,
  nama       VARCHAR(190) NOT NULL DEFAULT '',   -- app: name
  pin        VARCHAR(20)  NOT NULL DEFAULT '',
  role       VARCHAR(20)  NOT NULL DEFAULT '',   -- admin | full | view
  keterangan VARCHAR(60)  NOT NULL DEFAULT '',   -- tim: Kitchen | Bar | Floor | ''
  data       LONGTEXT     NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- FORECAST — SENGAJA TIDAK ADA TABELNYA.
--
-- Frontend cuma MEMBACA forecast (fetch GET, tidak pernah POST). Angkanya
-- dibuat proses LAIN di luar modul ini. Memindahkannya ke sini berarti
-- menyalin hasil yang akan langsung basi, karena pembuatnya tidak tahu
-- database ini ada. Jadi forecast tetap menunjuk Apps Script lama.
--
-- Yang perlu diketahui: forecast live terakhir dibuat 2026-07-07, sepuluh
-- hari sebelum migrasi ini. Jadi dia SUDAH basi bahkan sebelum pindah —
-- ini soal terpisah yang perlu diputuskan sendiri.
-- ---------------------------------------------------------------------
