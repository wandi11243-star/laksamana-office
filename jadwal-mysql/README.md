# jadwal-api-mysql — backend modul Jadwal Shift

Folder di repo: `jadwal-mysql/` → folder di server: `/jadwal-api-mysql/`
(nama sengaja berbeda; frontend memanggil `../jadwal-api-mysql/api.php`).

## Pemasangan sekali di tiap lingkungan

1. **cPanel > MySQL Databases** — buat database dan user, lalu *Add User to
   Database* dengan ALL PRIVILEGES.
   - produksi: `lakk5493_db_jadwal` / `lakk5493_jadwal`
   - dev: `lakk5493_db_dev_jadwal` / `lakk5493_dev_jadwal`
2. Kredensialnya **sudah disiapkan** di dua berkas lokal (keduanya
   di-gitignore, jadi tidak ada di repo — hanya ada di mesin yang membuatnya):

   | Berkas di repo | Untuk | Diunggah ke server sebagai |
   |---|---|---|
   | `config.php`     | produksi | `config.php` |
   | `config.dev.php` | dev      | `config.php` ← **ganti namanya** |

   Nama di server **selalu** `config.php`; `lib_jadwal_mysql.php` tidak
   mencari nama lain. Akhiran `.dev` hanya supaya dua lingkungan bisa
   disimpan berdampingan di repo tanpa saling menimpa.

   Password MySQL-nya ditulis di berkas itu **lebih dulu**, bukan disalin
   dari cPanel. Saat membuat MySQL user, **tempelkan password yang sama
   persis** dari berkasnya — jangan tekan tombol *Password Generator* milik
   cPanel, karena hasilnya akan berbeda dan koneksinya ditolak.

3. **Unggah MANUAL** ke `/jadwal-api-mysql/` lewat File Manager atau FTP.
   Workflow GitHub sengaja tidak pernah mengirim `config*.php` (berisi
   password, dan isinya beda antara dev dan produksi). Karena tidak pernah
   ada di `local-dir`, berkas ini juga tidak akan terhapus oleh sinkronisasi
   FTP berikutnya.
4. Tabel dibuat sendiri saat modul pertama kali menyimpan. Menjalankan
   `schema.sql` di phpMyAdmin sifatnya opsional — gunanya cuma menyiapkan
   database lebih dulu.
5. Cek dengan membuka `https://<situs>/jadwal-api-mysql/api.php?action=ping`.
   Balasannya harus memuat `"env":"dev"` atau `"env":"produksi"` yang sesuai.

## Kenapa tidak blob JSON seperti kompas-api-mysql

Tiap divisi punya head sendiri dan mereka menyusun jadwal minggu depan di
waktu yang berdekatan. Dengan blob satu baris, head yang menyimpan
belakangan akan menghapus pekerjaan head lain tanpa error apa pun. Di sini
penulisan granular per sel `(user_id, tgl)`, jadi dua head yang menggarap
divisi berbeda tidak pernah menyentuh baris yang sama.

Penjelasan lengkap ada di kepala `lib_jadwal_mysql.php`.

## Aksi API

| Aksi | Metode | Isi |
|---|---|---|
| `getAll` | GET | `?dari=&sampai=` — sel dalam rentang + semua pengajuan MENUNGGU + 200 putusan terakhir + setting |
| `ping` / `stats` | GET | diagnostik |
| `simpanSel` | POST | `{rows:[{u,d,t,m,s,n}], hapus:[{u,d}], by}` — satu transaksi |
| `simpanSetting` | POST | `{data:{shifts,heads,divOverride}, by}` |
| `simpanPengajuan` | POST | `{row:{id?,userId,jenis,dari,sampai,alasan}, by}` — status **selalu** dipaksa `MENUNGGU` |
| `putusPengajuan` | POST | `{id,status,nota,by}` |
| `hapusPengajuan` | POST | `{id}` |
| `kosongkanSemua` | POST | `{konfirmasi:"HAPUS SEMUA"}` — hapus SELURUH sel jadwal & pengajuan (setting tetap). Admin modul saja; kata kuncinya diperiksa ulang di server |
