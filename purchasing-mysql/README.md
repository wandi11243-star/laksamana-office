# Purchasing — Backend MySQL

Backend modul **Purchasing** (`deploy/stock/purchasing/`). Menggantikan
**empat** Web App Apps Script terpisah (orders, vendors, items, users).

## PERINGATAN ISI DATA

- `users` — **PIN login** kru
- `vendors` — nomor WhatsApp vendor

`.gitignore` di folder ini menolak `config*.php`, `*.json`, dan `*.csv`.
Itu jaring pengaman terakhir, bukan pengganti kehati-hatian.

## DUA SITUS, DUA DATABASE, SATU index.html

| Situs | Branch | Database |
|---|---|---|
| office.laksamanamuda.id | `main` | `lakk5493_db_purchasing` |
| dev.laksamanamuda.id | `develop` | `lakk5493_db_dev_purchasing` |

`index.html`-nya **sama persis** di kedua situs. Yang memisahkan hanya
`config.php` di masing-masing server, karena frontend memanggil API lewat
**path relatif**:

```
office.laksamanamuda.id/stock/purchasing/  ->  office.../purchasing-api-mysql/  ->  db_purchasing
dev.laksamanamuda.id/stock/purchasing/     ->  dev.../purchasing-api-mysql/     ->  db_dev_purchasing
```

Kalau di `EMBEDDED_CONFIG` ditulis URL lengkap, **dev akan menulis ke
database produksi** — coba-coba di dev langsung merusak data kru. Jangan
diubah jadi URL absolut.

Untuk memastikan tidak salah pasang, buka:
`<situs>/purchasing-api-mysql/orders.php?action=ping` → balasannya menyebut
`env` dan `db`. Di dev harus `dev` / `lakk5493_db_dev_purchasing`.

## Isi folder

| File | Fungsi |
|---|---|
| `config.php` | Kredensial **produksi** — dipasang di office |
| `config.dev.php` | Kredensial **dev** — dipasang di dev, **ganti namanya jadi `config.php`** di sana |
| `schema.sql` | 4 tabel. Dijalankan di KEDUA database |
| `lib_purchasing_mysql.php` | Logika bersama |
| `_boot.php` | Pemuat config + lib, melayani `?action=ping` |
| `orders.php` `vendors.php` `items.php` `users.php` | Endpoint |
| `config.sample.php` | Contoh tanpa password (yang masuk repo) |

## Kenapa 4 berkas endpoint, bukan satu `api.php?src=orders`

Frontend menempelkan cache-buster sendiri:

```js
fetch(`${appState.webAppUrlOrders}?t=${timestamp}`)
```

Kalau URL-nya sudah membawa `?src=orders`, hasilnya
`api.php?src=orders?t=123` — tanda tanya dobel, parameter rusak. Jadi tiap
sumber wajib punya path sendiri.

## Cara pasang

Lakukan **dua kali**: sekali untuk produksi, sekali untuk dev.

1. **cPanel > MySQL Databases** — buat database + user, `Add User to
   Database` → ALL PRIVILEGES.
   - produksi: `db_purchasing` + user `purchasing`
   - dev: `db_dev_purchasing` + user `dev_purchasing`
2. **phpMyAdmin** → pilih database → tab **SQL** → tempel `schema.sql` → Go.
   Aman dijalankan ulang.
3. **File Manager** → upload `purchasing-api-mysql.zip` (produksi) atau
   `purchasing-api-mysql-DEV.zip` (dev) → Extract, sehingga jadi
   `<docroot>/purchasing-api-mysql/orders.php`.
4. Cek `?action=ping` seperti di atas — **pastikan `db` yang disebut benar**.

Folder ini diupload manual lewat cPanel, jadi **aman dari sapuan FTP
deploy**: GitHub Action hanya menghapus berkas yang dia sendiri pernah
upload (dia menyimpan daftarnya di server). Folder yang tidak pernah dia
kirim tidak pernah dia sentuh.

## Kontrak API

Balasannya `{status:'success'}`, **bukan** `{ok:true}` seperti modul lain —
frontend memeriksa `resData.status === 'success'`. Jangan diseragamkan
tanpa mengubah frontend.

```
GET  orders.php               -> [ {rowIndex, nomorOrder, timestamp, item, qty,
                                    unit, note, tglDatang, pic, status,
                                    kedatangan, catatan}, ... ]   (array telanjang)
POST orders.php  {action:'batchOrder', orders:[{item,qty,unit,note,tglDatang,pic}]}
POST orders.php  {action:'archive',   orderIds:['LKS-...'] | rows:[rowIndex]}
POST orders.php  {action:'unarchive', orderIds:['LKS-...'] | rowIndex:N}

GET  vendors.php              -> {vendors: {"Nama": {whatsapp}}}
POST vendors.php {action:'addVendor', vendorName, vendorPhone, oldVendorName}
POST vendors.php {action:'deleteVendor', vendorName}

GET  items.php                -> {products: {"Nama": {utama, cadangan[]}}}
POST items.php   {action:'addProduct', productName, primaryVendor, backupVendors, oldProductName}
POST items.php   {action:'deleteProduct', productName}

GET  users.php                -> {users: [{id, name, pin, role, keterangan}]}
POST users.php   {action:'add'|'update'|'delete', user:{...}}

GET  <apa saja>?action=ping   -> {status, env, db}     <- untuk memastikan DB benar
GET  orders.php?action=stats  -> jumlah per tabel
```

## Catatan pemetaan

Bentuk diambil dari **data live + kode**, bukan tebakan.

- **PK orders = `nomor_order`**, bukan `row_index`. Sudah diperiksa: 682
  dari 682 unik, tidak ada yang kosong. `row_index` cuma nomor baris Sheet
  yang ikut terbawa; tetap disimpan karena frontend memakainya untuk arsip.
- **Arsip mengutamakan `orderIds`.** `row_index` itu posisi, bukan
  identitas — jalur offline frontend mengarang rowIndex dari
  `orders.length + 2`, dan angka karangan bisa menunjuk order lain yang sah
  (yang terarsip jadi order yang salah, tanpa error). Frontend sekarang
  mengirim keduanya; server memilih `orderIds`.
- **Vendor & produk berkunci NAMA**, bukan id buatan — di app memang peta
  `{"Sinar Horeca": {whatsapp}}`.
- **TIDAK ADA FOREIGN KEY.** Di data live, **5 dari 237 produk** menunjuk
  vendor yang tidak terdaftar (Ekaputra, Andersen, Online, dst). FK akan
  menggagalkan migrasi, atau memaksa membuang produk yang sah.
- `waktu` bukan `timestamp` (nama tipe data MySQL).
- Vendor di Apps Script lama disimpan di sheet **berbentuk order** — `item`
  = nama vendor, `qty` = nomor WhatsApp. Balasan lamanya membawa sisa itu
  sebagai `orders` dan frontend mengabaikannya. Di sini sudah rapi.

## Yang TIDAK ikut pindah

**Forecast tetap di Apps Script.** Modul ini cuma membacanya (tidak pernah
POST); angkanya dihitung proses lain yang tidak tahu database ini ada.
Menyalinnya ke MySQL berarti memindahkan hasil yang langsung basi.

Perlu diketahui: forecast live terakhir dibuat **2026-07-07**, sepuluh hari
sebelum migrasi ini. Jadi dia **sudah basi sebelum pindah** — soal terpisah
yang perlu diputuskan sendiri.

**`cafeName` dan template WhatsApp** masih di localStorage per browser —
tiap orang punya template sendiri. Itu perilaku lama, tidak diubah di sini.

## Yang BELUM ada: penjaga bentrok

Sama seperti Apps Script lama, tidak ada penjaga bentrok antar-pengguna.
Yang sudah ditutup: `batchOrder` memakai `SELECT ... FOR UPDATE` supaya dua
kru yang memesan bersamaan tidak berebut `row_index`/urutan yang sama.
