# Event Management System (EMS) — Backend MySQL

Backend modul **Event** (`deploy/event/`). Menyimpan talent, event, jadwal,
ticketing, check-in, dan bank ide ke **MySQL** — bukan localStorage, jadi data
dipakai bersama semua kru, bukan per-browser.

Polanya **sama persis dengan `reservasi-mysql/`**: sekali paham, kepakai di dua
modul.

## Isi folder

| File | Fungsi |
|---|---|
| `config.php` | **Satu-satunya yang perlu kamu edit** — kredensial MySQL |
| `schema.sql` | Struktur 15 tabel (jalankan sekali) |
| `lib_event_mysql.php` | Logika. Tidak perlu disentuh |
| `api.php` | Endpoint (`getAll` / `saveAll` / `stats` / `ping`) |
| `.gitignore` | Mengunci `config.php` agar password tidak ikut ter-commit |

## Model data

- **1 baris per record.** Kolom inti (untuk indeks/laporan) + kolom `data`
  berisi JSON utuh. **Sumber kebenaran = `data`** — aplikasi boleh menambah
  field baru tanpa mengubah skema.
- **Penjaga `updated_at`.** Simpan per-baris pakai `INSERT ... ON DUPLICATE KEY
  UPDATE`: **baris kiriman yang lebih lama tidak menimpa baris server yang lebih
  baru**. Ini yang menutup masalah "kru saling menimpa" — masalah yang sama
  sudah ditambal di Marketing, di sini dicegah sejak awal.
- **`checkins` append-only.** Jejak kehadiran tidak pernah ditimpa/dihapus.
- **`qr_token` unik** di level database: QR ganda ditolak MySQL, bukan cuma
  dicegah aplikasi.
- **Jam disimpan WIB**, sezona dengan `schedules.tanggal`, supaya laporan di
  phpMyAdmin tidak meleset 7 jam.
- Tidak ada tabel foto (poster memakai emoji; tombol upload dokumen masih demo).

## Langkah pasang di Rumahweb (cPanel)

1. **Buat database + user MySQL**
   cPanel → *MySQL Databases* → buat DB (mis. `lakk5493_db_ems`), buat user +
   password, *Add User to Database* → **ALL PRIVILEGES**.

2. **Isi `config.php`** — `DB_NAME`, `DB_USER`, `DB_PASS`.

3. **Buat tabel**
   cPanel → *phpMyAdmin* → pilih database → tab **SQL** → tempel isi
   `schema.sql` → *Go*. Harus muncul **15 tabel**.

4. **Upload folder ini** ke:
   ```
   public_html/office/event-api-mysql/
   ```
   > Namanya harus `event-api-mysql` — itu yang ditunjuk `deploy/event/index.html`.
   > **Jangan ikut-upload `config.local.php`** kalau kamu sempat membuatnya untuk
   > tes lokal: file itu menimpa `config.php` dan akan bikin server nyambung ke
   > database yang salah.

5. **Uji endpoint** (belum menyentuh aplikasi):
   ```
   https://office.laksamanamuda.id/event-api-mysql/api.php?action=ping
   https://office.laksamanamuda.id/event-api-mysql/api.php?action=stats
   ```
   `ping` harus balas `{"ok":true,...,"backend":"php-mysql"}`.
   `stats` harus menampilkan daftar tabel dengan angka 0 (masih kosong).

6. **Beri akses modul ke kru**
   Modul baru hanya muncul di halaman Office untuk user yang punya modul
   `event`. Tambahkan `event` di **tab Modules** pada Google Sheet, lalu
   berikan ke role/user lewat *Kelola Akses*. Tanpa langkah ini, kartu Event
   hanya terlihat oleh pemilik akses `*`.

7. **Buka modulnya** — `https://office.laksamanamuda.id/event/`
   Saat pertama dibuka dan database masih kosong, data contoh akan diisi sekali.
   Kalau tidak mau, set `SEED_CONTOH = false` di `deploy/event/index.html`
   **sebelum** dibuka.

## Kalau bermasalah

Semua bisa dibalik tanpa menyentuh modul lain:

- Modul Event berdiri sendiri — reservasi, marketing, dll tidak tersentuh.
- Mau sembunyikan kartunya: hapus blok `key:'event'` di `deploy/index.html`.
- Ganti alamat backend: satu baris `API_URL` di `deploy/event/index.html`.

## Tes lokal (opsional)

```bash
# 1. DB lokal + tabel
mysql -u root -p -e "CREATE DATABASE ems_test CHARACTER SET utf8mb4;"
mysql -u root -p ems_test < schema.sql

# 2. Buat config.local.php (di-ignore git, menimpa config.php saat ada).
#    JANGAN pernah ikut di-upload ke server.

# 3. Jalankan
php -S 127.0.0.1:8099
curl "http://127.0.0.1:8099/api.php?action=ping"
```

## Yang sudah diuji

Berbeda dengan README reservasi kemarin yang berhenti di "syntax OK", backend
ini **sudah dijalankan melawan MySQL 8.1 sungguhan** (25 pemeriksaan backend +
15 pemeriksaan lapisan sync frontend, semua lulus):

- Round-trip utuh: emoji, field di luar kolom, dan struktur nested
  (rundown/budget/sponsor) kembali apa adanya.
- Penjaga anti-timpa bekerja **dua arah**: kiriman lama ditolak, kiriman baru
  diterima.
- Kiriman kosong **tidak** mengosongkan tabel; koleksi yang tidak dikirim tidak
  tersentuh.
- `checkins` tidak hilang walau tidak ikut dikirim.
- QR ganda ditolak database.
- Alur ticketing (order → tiket → check-in → kuota terjual) tersimpan benar.
- Seed hanya jalan saat database kosong; boot kedua tidak menggandakan data.

**Yang belum diuji:** jalannya di hosting Rumahweb (versi PHP/MySQL di sana,
izin user DB) dan tampilan modul di browser sungguhan. Langkah 5 di atas itulah
pembuktian cepatnya.
