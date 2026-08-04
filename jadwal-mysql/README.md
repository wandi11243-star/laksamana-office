# jadwal-api-mysql — backend modul Jadwal Shift

Folder di repo: `jadwal-mysql/` → folder di server: `/jadwal-api-mysql/`
(nama sengaja berbeda; frontend memanggil `../jadwal-api-mysql/api.php`).

## Pemasangan sekali di tiap lingkungan

1. **cPanel > MySQL Databases** — buat database dan user, lalu *Add User to
   Database* dengan ALL PRIVILEGES.
   - produksi: `lakk5493_db_jadwal` / `lakk5493_jadwal`
   - dev: `lakk5493_db_dev_jadwal` / `lakk5493_dev_jadwal`
2. Salin `config.sample.php` → `config.php`, isi kredensialnya, set
   `ENV_LABEL` (`produksi` atau `dev`).
3. **Unggah `config.php` MANUAL** ke `/jadwal-api-mysql/` lewat File Manager
   atau FTP. Workflow GitHub sengaja tidak pernah mengirimnya (berisi
   password, dan isinya beda antara dev dan produksi).
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
