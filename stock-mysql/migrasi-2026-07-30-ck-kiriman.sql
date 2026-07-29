-- ====================================================================
-- STOCK — MIGRASI: KIRIMAN OUTLET → CENTRAL KITCHEN (kolom status)
-- --------------------------------------------------------------------
-- Jalankan SEKALI di tiap database stock (lakk5493_db_dev_stock dulu,
-- baru lakk5493_db_stock). phpMyAdmin: pilih database > tab "SQL" >
-- tempel > Go.
--
-- WAJIB dijalankan SESUDAH migrasi-2026-07-29-central-kitchen.sql —
-- berkas ini mengubah tabel yang dibuat di sana.
--
-- TIDAK aman diulang begitu saja: MySQL tidak punya
-- "ADD COLUMN IF NOT EXISTS". Kalau dijalankan dua kali, yang kedua
-- gagal dengan "Duplicate column name 'status'" — itu TIDAK merusak
-- apa pun, cukup diabaikan.
-- ====================================================================

-- ---------------------------------------------------------------------
-- Arah baru: outlet mengirim barang KE Central Kitchen (retur sisa,
-- titipan stok berlebih). Berbeda dengan mutasi masuk biasa, kiriman
-- ini BELUM tentu sampai — jadi ia tercatat lebih dulu sebagai 'pending'
-- dan baru dihitung ke saldo setelah orang CK mengonfirmasi menerimanya.
--
-- Kenapa satu kolom di ck_stock, bukan tabel `ck_kiriman` sendiri:
-- kiriman yang sudah diterima ADALAH mutasi masuk, tidak ada bedanya
-- dengan hasil produksi. Tabel terpisah berarti saldo harus menjumlah
-- dua sumber, dan setiap query saldo baru wajib ingat menjumlah
-- keduanya — satu yang lupa, dan angkanya salah tanpa ada yang tahu.
--
-- Nilai:
--   ''        = mutasi biasa, DIHITUNG (semua baris lama otomatis ini)
--   'pending' = kiriman menunggu konfirmasi CK, TIDAK dihitung
-- Kiriman yang ditolak DIHAPUS barisnya, bukan diberi status 'ditolak':
-- barang yang tidak pernah sampai bukan peristiwa yang perlu disimpan
-- di buku besar stok, dan barisnya cuma akan mengaburkan riwayat.
-- ---------------------------------------------------------------------
ALTER TABLE ck_stock
  ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT '' AFTER sebab;

ALTER TABLE ck_stock
  ADD KEY idx_ck_status (status);
