# Cara Pasang Pembaruan BATCH (database + backend)

Panduan sekali-jalan untuk menerapkan fitur **batch order** (batch baru /
gabung batch, penjumlahan item yang sama) ke server.

Lakukan **dua kali**: dev dulu sampai benar-benar yakin, baru produksi.

| Situs | Branch | Database | Folder API di server |
|---|---|---|---|
| dev.laksamanamuda.id | `develop` | `lakk5493_db_dev_stock` | `public_html/dev.laksamanamuda.id/dev_office/stock-api-mysql/` |
| office.laksamanamuda.id | `main` | `lakk5493_db_stock` | `public_html/office/stock-api-mysql/` — **pastikan dulu**, lihat catatan |

Path dev di atas sudah **terbukti** (dipakai saat pemasangan 2026-07-18).

Path produksi disimpulkan dari `.github/workflows/deploy.yml` (`server-dir:
/public_html/office/`) dan **belum diperiksa langsung**. Sebelum menimpa apa
pun, pastikan dengan salah satu cara ini:

- File Manager → **Search** → ketik `stock-api-mysql` → lihat path mana yang
  berada di bawah folder produksi, dan
- folder yang benar berisi `orders.php`, `lib_stock_mysql.php`, `config.php`,
  serta **berdampingan dengan folder `stock/`** (frontend).

Jangan tertukar dengan folder dev: keduanya berisi berkas bernama sama persis.

---

## Kenapa ini perlu dilakukan manual

Push ke Git **tidak** mengirim backend. GitHub Action hanya mengunggah isi
folder `deploy/` (frontend). Folder `stock-mysql/` sengaja di luar jangkauannya
supaya `config.php` yang berisi password tidak pernah tersapu deploy otomatis.

Akibatnya ada jendela waktu di mana **frontend sudah baru tapi backend masih
lama**. Persis itu yang terjadi di dev: `?action=batches` dibalas dengan 688
baris order biasa, sehingga pilihan batch terisi
`Batch Putra — 1 Jan (undefined item)` dan penjumlahan qty tidak jalan.
Selama backend belum naik, **tidak ada perbaikan frontend yang bisa menolong.**

---

## Urutannya: DATABASE DULU, baru PHP

Jangan dibalik. Alasannya:

- **Migrasi dulu, PHP belakangan** → aman. PHP lama menulis dengan daftar kolom
  yang disebut satu per satu, dan kolom baru punya `DEFAULT ''`, jadi ia tetap
  bekerja seolah tidak terjadi apa-apa. Situs tidak pernah mati.
- **PHP dulu, migrasi belakangan** → rusak sementara. PHP baru menulis ke kolom
  yang belum ada, jadi **submit order gagal** sampai migrasi dijalankan.

---

## Langkah 1 — Jalankan migrasi di phpMyAdmin

1. cPanel → **phpMyAdmin**.
2. Panel kiri: klik database yang benar.
   **Dev = `lakk5493_db_dev_stock`.** Salah pilih di sini artinya mengubah data
   asli kru, jadi pastikan dulu.
3. Sebelum jalan, cek apakah sudah pernah dimigrasi. Tab **SQL**, tempel:

   ```sql
   SHOW COLUMNS FROM `orders` LIKE 'batch_id';
   ```

   - **Kosong (0 baris)** → belum dimigrasi, lanjut ke langkah 4.
   - **Ada 1 baris** → sudah dimigrasi, **lewati** ke Langkah 2.

4. Buka file `stock-mysql/migrasi-2026-07-18-batch.sql`, salin seluruh isinya,
   tempel di tab **SQL**, klik **Go**.

Isinya menambah tiga kolom (`batch_id`, `batch_name`, `tim`) dan dua index.
Tidak ada data lama yang diubah, dihapus, atau ditimpa.

**Kalau muncul `Duplicate column name`:** artinya migrasi sudah pernah jalan.
Bukan kerusakan, abaikan saja.

### Cek hasilnya

```sql
SHOW COLUMNS FROM `orders`;
```

Harus muncul `batch_id`, `batch_name`, `tim`. Lalu pastikan data lama utuh:

```sql
SELECT COUNT(*) FROM `orders`;
```

Angkanya harus sama dengan sebelum migrasi (di dev sekitar **688**).

> 682 order lama sengaja dibiarkan `batch_id` kosong. Order lama memang tidak
> pernah mencatat batch — mengarang batch untuk data itu hanya akan
> menghidupkan lagi tebakan yang justru dihapus oleh perubahan ini. Order lama
> tetap tampil normal di Check-in, dikelompokkan dengan cara lama.

---

## Langkah 2 — Unggah dua berkas PHP

Yang berubah **hanya dua**:

- `lib_stock_mysql.php`
- `orders.php`

Berkas lain (`items.php`, `users.php`, `vendors.php`, `_boot.php`) **tidak
berubah**, tidak perlu disentuh.

1. cPanel → **File Manager** → masuk ke folder `stock-api-mysql/`.
2. **Upload** kedua berkas itu dari folder `stock-mysql/` di komputer, timpa
   yang lama.

### ⚠️ Jangan sentuh `config.php`

`config.php` berisi password database dan **isinya berbeda antara dev dan
produksi**. Ia tidak ada di repo dan tidak ikut berubah.

- Jangan menghapusnya.
- Jangan mengunggah `config.sample.php` lalu menamainya `config.php`.
- Jangan menyalin `config.php` dari dev ke produksi atau sebaliknya —
  **dev akan langsung menulis ke database produksi.**

`schema.sql` dan `migrasi-*.sql` juga **tidak perlu** diunggah. Keduanya untuk
phpMyAdmin, bukan untuk dijalankan dari web.

---

## Langkah 3 — Pastikan berhasil

### a. Database yang dituju benar

Buka di browser:

```
https://dev.laksamanamuda.id/stock-api-mysql/orders.php?action=ping
```

Harus menyebut `"env":"dev"` dan `"db":"lakk5493_db_dev_stock"`.
Kalau di dev tertulis `lakk5493_db_stock`, **berhenti** — `config.php`-nya
salah dan coba-coba di dev akan merusak data kru.

### b. Endpoint batch sudah hidup

```
https://dev.laksamanamuda.id/stock-api-mysql/orders.php?action=batches&tim=Kitchen
```

- **Benar:** `[]` (kosong, wajar — belum ada batch baru) atau daftar berisi
  `batchId` dan `jmlItem`.
- **Masih salah:** balasan panjang berisi `nomorOrder`, `rowIndex`, `item`.
  Itu tandanya `orders.php` lama masih di sana — ulangi Langkah 2.

### c. Coba alur sebenarnya di aplikasi

1. Buka **Form Order Belanja**, pilih tanggal, isi 1 item, kirim sebagai
   **Batch Baru** (nama boleh dikosongkan).
2. Kirim lagi item **yang sama, tanggal sama**, kali ini pilih **Gabung Batch**.
   - Batch tadi harus muncul di pilihan.
   - Peringatan duplikat harus menyebut jumlah, mis. *sudah 5 Kg + 5 Kg*.
3. Buka **Check-in Penerimaan**, pilih tanggal itu.
   - Harus **satu baris** dengan qty **sudah dijumlahkan** — bukan dua baris
     kembar. Kalau masih dua baris, penggabungan tidak jalan.

> Dua baris "Mie Kwetiau" yang terlanjur ada di Batch #3 **tidak akan tergabung
> sendiri**. Penggabungan hanya berlaku untuk pengiriman baru. Baris lama itu
> perlu dirapikan manual lewat tombol edit/hapus di halaman Check-in.

> Pilihan "Gabung Batch" hanya menampilkan batch **tim yang sama** di **tanggal
> kedatangan yang sama**. Jadi wajar kalau kosong di awal — batch baru muncul
> setelah ada order dikirim lewat versi baru ini.

---

## Kalau perlu dibatalkan

Kembalikan `lib_stock_mysql.php` dan `orders.php` ke versi sebelumnya
(commit `964d862`), unggah ulang. Frontend lama juga perlu dikembalikan, karena
frontend baru mengandalkan endpoint batch.

Kolom database **tidak perlu ikut dihapus** — PHP lama mengabaikannya dan situs
tetap jalan. Kalau tetap ingin bersih:

```sql
ALTER TABLE `orders`
  DROP COLUMN `batch_id`,
  DROP COLUMN `batch_name`,
  DROP COLUMN `tim`;
```

Perlu disadari: perintah itu **membuang semua informasi batch yang sudah
terkumpul**, dan tidak bisa dikembalikan. Order-nya sendiri tetap aman.

---

## Giliran produksi

Ulangi **Langkah 1–3** untuk database `lakk5493_db_stock` dan folder API
produksi (lihat tabel di atas — pastikan dulu path-nya).

### Keadaan produksi per 2026-07-18

Frontend batch **sudah tayang** di `office.laksamanamuda.id`, karena pekerjaan
ini sudah lebih dulu di-merge ke `main`. Backend-nya belum. Jadi produksi
sekarang berjalan campur: tampilan baru, server lama.

**Itu tidak merusak apa pun, dan tidak perlu diburu-buru.** PHP lama mengabaikan
field batch yang dikirim frontend, jadi kru tetap bisa mengirim order seperti
biasa. Yang belum hidup hanya "Gabung Batch", dan halamannya jujur menampilkan
*"Backend belum mendukung batch"* — bukan pilihan berisi data sampah.

Yang perlu diketahui: keadaan campur ini **hanya aman ke satu arah**.

- Frontend baru + backend lama → aman (yang sekarang terjadi).
- Frontend baru + backend baru + **DB belum dimigrasi** → **submit order gagal**.

Karena itu urutannya tidak boleh dibalik: **migrasi database dulu, baru unggah
PHP.** Kalau PHP naik lebih dulu, kru langsung tidak bisa memesan.

### Cara cepat memeriksa produksi kapan saja

```
https://office.laksamanamuda.id/stock-api-mysql/orders.php?action=ping
https://office.laksamanamuda.id/stock-api-mysql/orders.php?action=batches&tim=Kitchen
```

`ping` harus menyebut `"env":"produksi"` dan `"db":"lakk5493_db_stock"`.
`batches` menjawab `[]` kalau backend sudah benar; kalau masih daftar panjang
berisi `nomorOrder`, PHP produksi belum diperbarui.
