# Reservasi — Backend MySQL (Jalan B)

Versi backend reservasi yang menyimpan data ke **MySQL**, pengganti versi
file `data.json`. **Kontrak API sama persis**, jadi aplikasi (`index.html`)
tidak perlu diubah logikanya — cukup diarahkan ke `api.php` di folder ini.

> **Terisolasi & aman.** Folder ini di luar `deploy/`, jadi **tidak ikut
> ter-deploy otomatis** dan **tidak menyentuh** backend live
> (`deploy/reservasi-api/`) maupun datanya. Semua yang sekarang jalan **tetap
> jalan**. Perpindahan nanti bersifat **reversible** (tinggal balik 1 baris URL).

## Kenapa Jalan B (bukan Laravel)

- Kecepatan sudah beres di backend PHP sekarang — ini bukan soal kecepatan.
- Nilai MySQL di sini: **tulis PER-BARIS** → menutup risiko "saling menimpa"
  saat banyak kru simpan bersamaan, plus siap untuk laporan/query & skala besar.
- Nol framework, nol Composer. Dan ini **batu loncatan** ke Laravel nanti:
  database + data yang dibuat di sini **kepakai lagi** tanpa diulang.

## Isi folder

| File | Fungsi |
|---|---|
| `config.php` | **Satu-satunya yang perlu kamu edit** — kredensial MySQL + lokasi foto |
| `schema.sql` | Struktur tabel (jalankan sekali) |
| `lib_reservasi_mysql.php` | Logika (MySQL). Tidak perlu disentuh |
| `api.php` | Endpoint (sama kontrak dgn live), require lib MySQL |
| `migrate.php` | Impor `data.json` → MySQL (sekali jalan, idempoten) |

## Model data

- `reservations` — **1 baris per reservasi**. Kolom inti (name, phone, tanggal,
  jam, status, pic, dp, updated_at, created_at) untuk query/indeks + kolom `data`
  (JSON utuh, termasuk `dps`/`arrivals`/`followups`). Sumber kebenaran = `data`.
- `audit` — 1 baris per log (append-only, dibatasi 500).
- `settings` — `master` (konfigurasi) sebagai 1 blob JSON.
- **Foto tetap di disk** (1 file per foto), sama seperti sekarang — tidak masuk MySQL.

Simpan per-baris pakai `INSERT ... ON DUPLICATE KEY UPDATE` dengan penjaga
`updated_at`: **baris yang datang lebih lama tidak menimpa baris server yang
lebih baru**. Inilah yang menutup masalah tabrakan data.

---

## Langkah pasang di Rumahweb (cPanel)

1. **Buat database + user MySQL**
   cPanel → *MySQL Databases* → buat DB (mis. `lakk5493_reservasi`), buat user +
   password, *Add User to Database* → **ALL PRIVILEGES**.

2. **Isi `config.php`**
   `DB_NAME`, `DB_USER`, `DB_PASS`. Set `DATA_DIR` ke folder foto yang sudah ada
   agar 84 foto lama langsung kepakai:
   ```php
   define('DATA_DIR', '/home/lakk5493/reservasi-db');
   ```

3. **Buat tabel** (jalankan `schema.sql`)
   cPanel → *phpMyAdmin* → pilih database → tab **SQL** → tempel isi `schema.sql` → *Go*.

4. **Upload folder ini** ke lokasi BARU (jangan menimpa yang live):
   ```
   public_html/office/reservasi-api-mysql/
   ```

5. **Migrasi data** dari data.json yang sekarang:
   - Ada SSH / cPanel Terminal:
     ```
     php public_html/office/reservasi-api-mysql/migrate.php /home/lakk5493/reservasi-db/data.json
     ```
   - Tanpa CLI (lewat browser):
     ```
     https://office.laksamanamuda.id/reservasi-api-mysql/migrate.php?confirm=YA&file=/home/lakk5493/reservasi-db/data.json
     ```
   Pastikan output: **"jumlah reservasi COCOK"** (harus 167).

6. **Uji endpoint baru** (belum menyentuh aplikasi):
   ```
   https://office.laksamanamuda.id/reservasi-api-mysql/api.php?action=stats
   https://office.laksamanamuda.id/reservasi-api-mysql/api.php?action=getAll
   ```
   `stats` harus menunjukkan `backend: php-mysql`, `reservations: 167`.

7. **Pindahkan aplikasi** (langkah terakhir, reversible)
   Di `deploy/reservasi/index.html`, ganti satu baris:
   ```js
   // dari:
   const API_URL = "../reservasi-api/api.php";
   // jadi:
   const API_URL = "../reservasi-api-mysql/api.php";
   ```
   Uji beberapa menit. **Kalau ada masalah, balikkan baris itu** → kembali ke
   backend file lama seperti semula (data.json tetap utuh, tidak tersentuh).

> Selama langkah 1–6, aplikasi live **masih memakai backend lama** — nol risiko.
> Baru langkah 7 yang mengalihkannya, dan itu pun bisa dibalik seketika.

---

## Tes lokal (opsional, sebelum ke server)

```bash
# 1. buat DB lokal + tabel
mysql -u root -p -e "CREATE DATABASE reservasi CHARACTER SET utf8mb4;"
mysql -u root -p reservasi < schema.sql

# 2. isi config.php (DB_USER/DB_PASS lokal, DATA_DIR boleh folder lokal kosong)

# 3. ambil salinan data.json (read-only dari live) lalu migrasi
#    (contoh data sudah bisa ditarik via ?action=getAll)
php migrate.php /path/ke/data.json

# 4. cek
php -r 'require "lib_reservasi_mysql.php"; print_r(stats());'
```

## Rollback / keamanan

- **data.json lama tidak disentuh** oleh proses ini → selalu bisa kembali.
- Foto tidak dipindah → tidak ada risiko kehilangan foto.
- Peralihan aplikasi cuma 1 baris URL → balik kapan saja.
- Simpan `.htaccess` folder foto (dibuat otomatis kalau foto terpaksa di dalam web root).

## Belum sempat aku tes

Aku sudah cek: **syntax semua PHP OK**, dan **struktur data live cocok** dengan
yang `migrate.php` harapkan (167 reservasi, field lengkap). Yang **belum** aku
jalankan adalah migrasi end-to-end ke MySQL beneran (aku tidak punya akses DB-mu).
Langkah 3–6 di atas itulah pembuktiannya — kalau jumlahnya cocok 167, berhasil.
Kalau mau, kasih aku akses MySQL lokal, nanti aku jalankan & buktikan sampai tuntas.
