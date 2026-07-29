-- =====================================================================
-- STOCK LAKSAMANA MUDA (purchasing + ordering) — Skema MySQL
-- ---------------------------------------------------------------------
-- Menggantikan EMPAT Web App Apps Script terpisah (orders, vendors,
-- items, users). Forecast SENGAJA TIDAK ikut — lihat catatan di bawah.
--
-- Pola sama dengan modul lain: 1 baris per record, kolom inti untuk QUERY
-- + `data` LONGTEXT (JSON) sebagai SUMBER KEBENARAN.
--
-- DIPAKAI OLEH DUA SITUS, SATU SKEMA:
--   office.laksamanamuda.id (main)    -> lakk5493_db_stock
--   dev.laksamanamuda.id    (develop) -> lakk5493_db_dev_stock
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
-- BATCH (batch_id / batch_name / tim): satu pengajuan order = satu batch.
-- Sebelumnya batch cuma DITEBAK di frontend dari timestamp+pic yang berdekatan
-- (lihat groupRecordsByPo), jadi dua kru yang mengirim di menit yang sama bisa
-- tercampur jadi satu "Batch #1". Sekarang batch punya identitas sungguhan,
-- sehingga order bisa DIGABUNGKAN ke batch yang sudah ada.
--
-- `tim` (Kitchen|Bar|Floor) disimpan di baris order, bukan dicari ulang dari
-- nama PIC saat render: PIC bisa pindah tim atau keluar, dan order lama harus
-- tetap tercatat sebagai milik tim yang memesannya dulu.
--
-- Baris lama (682 order hasil migrasi) punya ketiganya '' — itu wajar dan
-- ditangani: order tanpa batch_id jatuh ke pengelompokan lama.
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
  batch_id    VARCHAR(64)  NOT NULL DEFAULT '',   -- app: batchId  ('' = order lama pra-batch)
  batch_name  VARCHAR(120) NOT NULL DEFAULT '',   -- app: batchName (opsional, boleh kosong)
  tim         VARCHAR(20)  NOT NULL DEFAULT '',   -- Kitchen | Bar | Floor | ''
  data        LONGTEXT     NOT NULL,              -- termasuk note & catatan (tipe campur di data live)
  UNIQUE KEY uq_ord_row (row_index),
  KEY idx_ord_status (status),
  KEY idx_ord_item (item),
  KEY idx_ord_tgl (tgl_datang),
  KEY idx_ord_batch (batch_id),
  KEY idx_ord_tim (tim, status)
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
-- ORDERING_USERS — daftar user modul ordering (stock/ordering).
--
-- Ordering berbagi tabel orders/vendors/products dengan purchasing, TAPI
-- daftar user-nya TERPISAH: kru dapur lengkap + role 'checkin' yang tidak
-- dipakai purchasing. Di Apps Script lama pun URL user keduanya beda.
-- Tabel sendiri ini MEMPERTAHANKAN pemisahan itu — migrasi tidak boleh
-- diam-diam mengubah siapa yang bisa masuk ke modul mana.
--
-- BERISI PIN LOGIN. Jangan diekspor ke repo/chat/pihak ketiga.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ordering_users (
  id         VARCHAR(64)  NOT NULL PRIMARY KEY,
  nama       VARCHAR(190) NOT NULL DEFAULT '',   -- app: name
  pin        VARCHAR(20)  NOT NULL DEFAULT '',
  role       VARCHAR(20)  NOT NULL DEFAULT '',   -- admin | full | checkin
  keterangan VARCHAR(60)  NOT NULL DEFAULT '',   -- Kitchen | Bar | Floor | ''
  data       LONGTEXT     NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- STOCK — sisa bahan "Stock Today" yang di-upload kru dapur (dari Excel).
--
-- Ini DATA MILIK APLIKASI (bukan hasil model), jadi memang tempatnya di DB.
-- Dipakai BERSAMA ordering + purchasing (keduanya membaca stok yang sama),
-- lalu digabung dengan angka forecast oleh LaksForecast.ForecastBook untuk
-- menghitung rekomendasi restock.
--
-- PENTING: bentuk yang dikembalikan endpoint HARUS sama persis dengan yang
-- dulu dari Apps Script — { "<Nama>": {stock_now, stock_unit} } + as_of —
-- supaya ForecastBook menerima masukan identik dan FORECASTING TIDAK BERUBAH.
-- Yang pindah cuma tempat penyimpanan stok, bukan cara menghitung.
--
-- Satu upload = satu snapshot penuh "Stock Today" -> tabel ditulis ulang
-- (bukan digabung). as_of = tanggal hitung, sama untuk semua baris seunggahan.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS stock (
  nama       VARCHAR(190) NOT NULL PRIMARY KEY,
  stock_now  DOUBLE       NOT NULL DEFAULT 0,
  stock_unit VARCHAR(40)  NOT NULL DEFAULT '',
  as_of      VARCHAR(30)  NOT NULL DEFAULT '',   -- tanggal hitung stok
  data       LONGTEXT     NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- SETTINGS — konfigurasi bersama per modul (bukan per baris data). Dipakai
-- pertama kali untuk matriks hak akses (Kelola Akses): siapa boleh apa,
-- per peran, per halaman. 1 baris per modul ('ordering' | 'purchasing'),
-- `data` JSON = { "<page>": { "<role>": 0|1|2 } }  (0=Tak Terlihat,
-- 1=Lihat, 2=Boleh Ubah). Modul terpisah dari ordering_users/users karena
-- ini bukan daftar orang, tapi aturan yang berlaku untuk SEMUA orang di
-- satu peran — beda concern, jadi tabel sendiri, bukan kolom tambahan.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS stock_settings (
  modul VARCHAR(20) NOT NULL PRIMARY KEY,   -- 'ordering' | 'purchasing'
  data  LONGTEXT    NOT NULL
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

-- =====================================================================
-- TIGA MODUL PENCATATAN (2026-07-22): pemakaian event, waste, opname.
--
-- Ketiganya MURNI PENCATATAN — tidak satu pun mengubah tabel `stock`.
-- Alasannya bukan kemalasan: `stock` ditimpa SELURUHNYA tiap kali supervisor
-- mengunggah xlsx "Stock Today" (lihat pur_stock_simpan, ada DELETE FROM
-- `stock` di dalamnya). Angka apa pun yang dikurangi otomatis di sini akan
-- lenyap tanpa jejak pada unggahan berikutnya, dan selisihnya justru
-- menyesatkan. Perbandingan sistem-vs-fisik dilakukan di tabel `opname`,
-- di mana angkanya memang dicatat sebagai perbandingan, bukan sebagai
-- kebenaran baru.
--
-- Pola sama dengan tabel lain: kolom inti untuk QUERY + `data` LONGTEXT
-- (JSON) sebagai sumber kebenaran isi rincinya.
-- =====================================================================

-- ---------------------------------------------------------------------
-- USAGE_EVENTS — bahan baku yang dipakai untuk sebuah event.
-- Satu baris = satu event, dengan banyak item di dalam `data`.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS usage_events (
  id         VARCHAR(64)  NOT NULL PRIMARY KEY,
  tanggal    VARCHAR(20)  NOT NULL DEFAULT '',   -- YYYY-MM-DD, kapan dipakai
  jenis      VARCHAR(40)  NOT NULL DEFAULT '',   -- Prasmanan | Training | RND | Lainnya
  nama_event VARCHAR(190) NOT NULL DEFAULT '',
  status     VARCHAR(20)  NOT NULL DEFAULT 'Rencana',  -- Rencana | Selesai
  pic        VARCHAR(120) NOT NULL DEFAULT '',
  tim        VARCHAR(20)  NOT NULL DEFAULT '',   -- Kitchen | Bar | Floor
  waktu      VARCHAR(30)  NOT NULL DEFAULT '',   -- 'YYYY-MM-DD HH:MM:SS'
  data       LONGTEXT     NOT NULL,              -- {catatan, items:[{item,qty,unit,note}]}
  KEY idx_ue_tgl (tanggal),
  KEY idx_ue_jenis (jenis),
  KEY idx_ue_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- WASTE — produk terbuang, satu baris satu kejadian.
--
-- `foto` DIPISAH dari `data` dan SENGAJA TIDAK ikut saat daftar dimuat.
-- Satu foto ±200-400KB; daftar sebulan bisa ratusan baris, dan menyertakan
-- fotonya membuat halaman menunggu puluhan megabita hanya untuk menampilkan
-- tabel. Foto ditarik satu per satu lewat ?action=foto&id=... saat diklik.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS waste (
  id        VARCHAR(64)  NOT NULL PRIMARY KEY,
  tanggal   VARCHAR(20)  NOT NULL DEFAULT '',
  item      VARCHAR(190) NOT NULL DEFAULT '',
  qty       DOUBLE       NOT NULL DEFAULT 0,
  unit      VARCHAR(40)  NOT NULL DEFAULT '',
  sebab     VARCHAR(40)  NOT NULL DEFAULT '',   -- Kadaluarsa | Rusak | Tumpah | Salah Olah | Sisa Produksi | Lainnya
  pic       VARCHAR(120) NOT NULL DEFAULT '',
  tim       VARCHAR(20)  NOT NULL DEFAULT '',
  waktu     VARCHAR(30)  NOT NULL DEFAULT '',
  foto      LONGTEXT     NOT NULL,              -- data URL; kosong = tanpa foto
  foto_nama VARCHAR(190) NOT NULL DEFAULT '',
  data      LONGTEXT     NOT NULL,              -- {catatan}
  KEY idx_w_tgl (tanggal),
  KEY idx_w_item (item),
  KEY idx_w_sebab (sebab)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- OPNAME — hitung fisik harian. Satu baris = satu sesi hitung.
--
-- TIDAK diberi UNIQUE (tanggal, tim): hitung ulang di hari yang sama itu
-- wajar (mis. per shift, atau mengulang karena salah hitung). Yang menahan
-- duplikat tak sengaja adalah peringatan di frontend, bukan penolakan
-- database — menolak hitungan kedua yang sah jauh lebih merugikan.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS opname (
  id      VARCHAR(64)  NOT NULL PRIMARY KEY,
  tanggal VARCHAR(20)  NOT NULL DEFAULT '',
  pic     VARCHAR(120) NOT NULL DEFAULT '',
  tim     VARCHAR(20)  NOT NULL DEFAULT '',
  status  VARCHAR(20)  NOT NULL DEFAULT 'Draft',   -- Draft | Selesai
  waktu   VARCHAR(30)  NOT NULL DEFAULT '',
  -- data.items: buku stok harian per item —
  --   {item,unit,opening,masuk,sistem(=seharusnya),fisik(=closing),note}
  data    LONGTEXT     NOT NULL,
  KEY idx_op_tgl (tanggal),
  KEY idx_op_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- SERAH TERIMA — pengeluaran barang dari stok ke Kitchen/Bar, WAJIB berfoto.
-- Tercatat sebagai barang KELUAR di Daily SO tanggal & tim yang sama.
-- Pola foto sama dengan `waste`: `foto` kolom sendiri, tidak ikut di daftar.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS serah_terima (
  id        VARCHAR(64)  NOT NULL PRIMARY KEY,
  tanggal   VARCHAR(20)  NOT NULL DEFAULT '',
  tujuan    VARCHAR(20)  NOT NULL DEFAULT '',   -- Kitchen | Bar
  penerima  VARCHAR(120) NOT NULL DEFAULT '',
  pic       VARCHAR(120) NOT NULL DEFAULT '',
  tim       VARCHAR(20)  NOT NULL DEFAULT '',
  waktu     VARCHAR(30)  NOT NULL DEFAULT '',
  foto      LONGTEXT     NOT NULL,              -- data URL; wajib untuk baris baru
  foto_nama VARCHAR(190) NOT NULL DEFAULT '',
  data      LONGTEXT     NOT NULL,              -- {catatan, items:[{item,qty,unit}]}
  KEY idx_srh_tgl (tanggal),
  KEY idx_srh_tujuan (tujuan)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- CK_STOCK — buku besar mutasi stok CENTRAL KITCHEN (barang produksi dapur).
--
-- Satu baris = satu pergerakan. Saldo TIDAK disimpan di mana pun; selalu
-- dihitung ulang dari SUM(masuk) - SUM(keluar). Saldo tersimpan pasti
-- menyimpang dari riwayatnya cepat atau lambat, dan tidak ada cara tahu
-- mana yang benar; menghitung ulang selalu bisa dibuktikan dari barisnya.
--
-- `qty` SELALU dalam SATUAN DASAR barang (packSatuan, mis. Gram) — tanpa
-- itu "2" milik Pack dan "2" milik Gram terjumlah jadi 4. Yang diketik
-- orang tetap disimpan di qty_input/unit_input supaya riwayat bisa
-- ditampilkan sebagaimana dicatat ("2 Pack", bukan "1000 Gram").
--
-- `ref` = nomor_order, hanya untuk mutasi keluar yang lahir otomatis dari
-- pengajuan yang sudah ditandai datang. UNIQUE (ref, arah) membuat
-- sinkronisasinya idempoten: menyimpan check-in dua kali tidak bisa
-- mengurangi stok dua kali. Mutasi manual diisi NULL (NULL tidak ikut
-- aturan unik, dan memang boleh berulang).
--
-- Master barangnya ada di `products`, ditandai data.sumber='ck' beserta
-- data.packIsi & data.packSatuan — bukan tabel produk terpisah.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ck_stock (
  id         VARCHAR(64)  NOT NULL PRIMARY KEY,
  tanggal    VARCHAR(20)  NOT NULL DEFAULT '',
  item       VARCHAR(190) NOT NULL DEFAULT '',
  arah       VARCHAR(10)  NOT NULL DEFAULT '',   -- masuk | keluar
  qty        DOUBLE       NOT NULL DEFAULT 0,    -- SELALU satuan dasar
  qty_input  DOUBLE       NOT NULL DEFAULT 0,    -- angka yang diketik orang
  unit_input VARCHAR(40)  NOT NULL DEFAULT '',   -- 'Pack' atau satuan dasar
  sebab      VARCHAR(40)  NOT NULL DEFAULT '',   -- produksi | pengajuan | penyesuaian | rusak
  ref        VARCHAR(64)  NULL DEFAULT NULL,     -- nomor_order (mutasi otomatis)
  tim        VARCHAR(20)  NOT NULL DEFAULT '',
  pic        VARCHAR(120) NOT NULL DEFAULT '',
  waktu      VARCHAR(30)  NOT NULL DEFAULT '',
  data       LONGTEXT     NOT NULL,              -- {catatan, packIsi, packSatuan}
  UNIQUE KEY uq_ck_ref (ref, arah),
  KEY idx_ck_item (item),
  KEY idx_ck_tgl (tanggal),
  KEY idx_ck_arah (arah)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
