-- ====================================================================
-- BD OS — BERSIHKAN DATA CONTOH
-- --------------------------------------------------------------------
-- Sekali pakai. Jalankan di phpMyAdmin: pilih database BD OS
-- (lakk5493_db_dev_bd untuk dev, lakk5493_db_bd untuk office) >
-- tab "SQL" > tempel > Go.
--
-- KENAPA HARUS LEWAT phpMyAdmin, BUKAN DARI APLIKASI:
-- backend sengaja MENOLAK menghapus isi tabel ketika kiriman dari aplikasi
-- kosong (lihat hapus_yang_hilang() di lib_bd_mysql.php). Itu perlindungan
-- terhadap aplikasi yang gagal memuat lalu menyimpan state kosong — tanpa
-- penjaga itu, satu kali gagal muat bisa mengosongkan seluruh papan kerja.
-- Konsekuensinya, pengosongan yang memang DISENGAJA harus lewat sini.
--
-- >>> PERIKSA DULU sebelum menjalankan. <<<
-- Perintah ini menghapus SELURUH isi tabel, bukan cuma baris contoh —
-- keduanya sama saja SELAMA belum ada data sungguhan. Kalau tim sudah
-- mulai mengisi task betulan, JANGAN jalankan; hapus barisnya satu per satu
-- lewat aplikasi.
--
-- Cek isi tabel dulu:
--     SELECT 'tasks' t, COUNT(*) n FROM tasks
--     UNION ALL SELECT 'projects', COUNT(*) FROM projects
--     UNION ALL SELECT 'purchase_orders', COUNT(*) FROM purchase_orders
--     UNION ALL SELECT 'coord_requests', COUNT(*) FROM coord_requests
--     UNION ALL SELECT 'routines', COUNT(*) FROM routines
--     UNION ALL SELECT 'agenda', COUNT(*) FROM agenda
--     UNION ALL SELECT 'people', COUNT(*) FROM people;
-- ====================================================================

DELETE FROM tasks;
DELETE FROM projects;
DELETE FROM purchase_orders;
DELETE FROM coord_requests;
DELETE FROM routines;
DELETE FROM agenda;

-- Kru karangan (Howandi Chandra, Nadia Kusuma, dst) — dikenali dari
-- office_user_id yang KOSONG: baris yang lahir dari roster database account
-- selalu punya id itu. Jadi baris kru sungguhan tidak akan ikut terhapus.
DELETE FROM people WHERE office_user_id IS NULL OR office_user_id = '';

-- Fokus harian yang menunjuk kru contoh.
DELETE FROM settings WHERE k = 'focus';

-- Sesudah ini: refresh BD OS. Papan akan kosong, dan halaman Kru BD hanya
-- berisi pemegang hak akses modul `bd` dari database account.
-- Data contoh TIDAK akan muncul kembali — kode pengisinya sudah dihapus,
-- bukan sekadar dimatikan lewat saklar.
