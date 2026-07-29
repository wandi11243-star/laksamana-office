-- ====================================================================
-- STOCK — MIGRASI: STOK CENTRAL KITCHEN (ck_stock)
-- --------------------------------------------------------------------
-- Jalankan SEKALI di tiap database stock yang SUDAH ada
-- (lakk5493_db_dev_stock dan lakk5493_db_stock). Database baru tidak
-- perlu file ini — schema.sql sudah memuat tabelnya.
--
-- phpMyAdmin: pilih database > tab "SQL" > tempel > Go. Aman diulang.
--
-- MASTER BARANG CK TIDAK BUTUH MIGRASI. Barang produksi dapur disimpan
-- di tabel `products` yang sudah ada, dibedakan lewat field `sumber`
-- ('ck') di dalam kolom JSON `data` — bersama `packIsi` & `packSatuan`.
-- Jadi untuk sisi master, cukup upload ulang lib PHP-nya.
-- ====================================================================

-- ---------------------------------------------------------------------
-- CK_STOCK — buku besar mutasi stok Central Kitchen.
--
-- Satu baris = satu pergerakan. Saldo TIDAK disimpan sebagai angka di
-- mana pun; ia selalu dihitung ulang dari SUM(masuk) - SUM(keluar).
-- Saldo tersimpan akan menyimpang dari riwayatnya cepat atau lambat —
-- satu penyimpanan gagal di tengah dan angkanya salah selamanya, tanpa
-- ada cara tahu mana yang benar. Menghitung ulang selalu bisa dibuktikan
-- dari barisnya.
--
-- `qty` SELALU dalam SATUAN DASAR barang itu (packSatuan, mis. Gram),
-- bukan dalam satuan yang diketik orang. Tanpa aturan ini, "2" milik
-- Pack dan "2" milik Gram akan terjumlah jadi 4 dan tidak ada yang
-- menyadarinya. Yang diketik orang tetap disimpan apa adanya di
-- `qty_input` + `unit_input`, supaya riwayatnya bisa ditampilkan
-- sebagaimana ia dicatat ("2 Pack", bukan "1000 Gram").
--
-- `ref` = nomor_order, HANYA untuk mutasi keluar yang lahir otomatis
-- dari pengajuan tim yang sudah ditandai datang. UNIQUE (ref, arah)
-- yang membuat sinkronisasi itu idempoten: menyimpan check-in dua kali
-- tidak bisa mengurangi stok dua kali. Mutasi manual ber-`ref` kosong,
-- dan '' tidak ikut aturan unik karena beberapa baris kosong tetap sah
-- — karena itu kolomnya NULL-able dan mutasi manual diisi NULL.
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
