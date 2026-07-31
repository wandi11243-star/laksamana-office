# Laksamana Muda Ticketing — Backend situs customer

Pintu **publik** ke database EMS. Dipakai `deploy/ticketing/` (situs
customer), **bukan** oleh modul Office mana pun.

## Kenapa folder sendiri, padahal databasenya sama

Databasenya memang **harus sama** dengan `event-api-mysql` — kursi yang dijual
di situs customer adalah kursi yang digambar kru di denah EMS, dan tiket yang
lahir di sini harus bisa di-scan di menu Check-In EMS. Dua database berarti dua
kebenaran, dan kursi yang sama akan terjual dua kali.

Yang **tidak** boleh sama adalah **pintunya**. EMS hanya punya `getAll` dan
`saveAll`:

| Endpoint EMS | Kalau dibuka ke publik |
|---|---|
| `getAll` | memulangkan seluruh isi EMS — fee talent, pembayaran, catatan internal, data semua pembeli |
| `saveAll` | menerima seluruh state dan menimpanya — satu permintaan bisa menghapus semua event & tiket |

Jadi situs customer memakai endpoint sempit di folder ini. Folder ini juga
menyimpan **kunci rahasia Xendit**, yang tidak boleh ada di config EMS.

## Aturan yang tidak boleh dilanggar

1. **Harga selalu dihitung server.** Total dari browser hanya untuk ditampilkan.
   Yang ditagihkan ke Xendit adalah hasil hitungan dari `ticket_classes.price`
   di database. Tanpa ini, mengubah satu angka di DevTools cukup untuk membeli
   meja VIP seharga seribu rupiah.
2. **Lunas hanya lewat webhook Xendit.** Tidak ada tombol "saya sudah bayar".
   Yang menentukan lunas adalah uang yang masuk, bukan pengakuan pembeli.
3. **Webhook wajib `x-callback-token`.** Tanpa pemeriksaan itu, siapa pun yang
   tahu URL-nya bisa menandai pesanan lunas tanpa membayar.
4. **Kursi baru `Sold` setelah uang masuk.** Sebelum itu hanya *hold*
   sementara — kalau tidak, denah akan penuh oleh pesanan yang tak pernah dibayar.

## Isi folder

| File | Fungsi |
|---|---|
| `config.php` | **Satu-satunya yang perlu diedit** — kredensial MySQL (samakan dengan EMS) + kunci Xendit |
| `schema-tambahan.sql` | **Satu** tabel baru: `seat_holds`. Sisanya menumpang tabel EMS |
| `lib_ticketing.php` | Logika. Tidak perlu disentuh |
| `api.php` | Endpoint publik |

## Endpoint

```
GET  ?action=ping                      -> {env, db, xendit, simulasi_bayar}
GET  ?action=events                    -> event Published/Ongoing saja
GET  ?action=event&id=
GET  ?action=denah&id=[&hold=]         -> objek denah + status tiap kursi
POST {action:"hold",   event_id, seats[], hold_token?}
POST {action:"release",hold_token, seats?}
POST {action:"checkout",event_id,hold_token,name,email,phone}
                                       -> {invoice_url, ref, access_token}
POST  <badan invoice Xendit>           <- webhook, dikenali dari header
GET  ?action=order&ref=&token=         -> status + e-ticket (QR)
POST {action:"simbayar",ref,token}     -> HANYA di dev, lihat bawah
```

## Kenapa `seat_holds` tabel sendiri

EMS menyimpan lewat `saveAll`: browser kru mengirim **seluruh** koleksi `seats`
sekaligus. Kalau kunci sementara ditulis ke `seats.status`, satu penyimpanan
dari EMS — yang state-nya dimuat sebelum ada pembeli — akan menghapus kunci
itu, dan kursi yang sedang di halaman pembayaran customer mendadak bisa diambil
orang lain. Sebaliknya, kunci dari situs customer akan ikut ke state EMS dan
tampil sebagai kursi "Locked" yang tak pernah bisa dibersihkan kru.

Tabel terpisah tidak pernah disentuh `saveAll`. Penjualan permanen tetap di
`seats.status='Sold'` + baris `tickets` — dan **itu** yang dilihat EMS.

## Alur lengkap

```
Kru gambar denah di EMS  ──►  seats (zone='Custom')
                                    │
Customer buka /ticketing ──► ?action=denah  ──► denah yang sama persis
                                    │
        pilih kursi ──► hold (UNIQUE seat_id, 10 menit)
                                    │
        checkout ──► orders(Pending) + invoice Xendit ──► halaman bayar
                                    │
        bayar ──► webhook Xendit ──► lunaskan():
                                       • tickets + qr_token acak
                                       • seats.status='Sold'
                                       • ticket_classes.sold naik
                                    │
        e-ticket (QR) ◄─────────────┘
                                    │
Hari-H: petugas scan QR di menu Check-In EMS
        ──► tickets.status='Checked-In' ──► kursi biru di denah
```

QR-nya adalah kolom `tickets.qr_token` yang sama dengan yang dipakai kasir EMS,
jadi **menu Check-In EMS tidak perlu diubah sama sekali** untuk bisa memindai
tiket yang dibeli online.

## Pasang di server (cPanel)

1. **Jangan buat database baru.** Pakai database EMS yang sudah ada.
2. phpMyAdmin → pilih database EMS → tab **SQL** → tempel `schema-tambahan.sql` → *Go*.
   Harus muncul tabel `seat_holds`.
3. Salin `config.sample.php` → `config.php`, isi:
   - `DB_*` **persis** seperti `event-api-mysql/config.php`
   - `ENV_LABEL` — `'dev'` di server dev, `'produksi'` di produksi
   - `XENDIT_SECRET` & `XENDIT_CALLBACK`
   - `SITE_URL` — alamat situs customer, tanpa garis miring di akhir
4. Upload folder ini ke `ticketing-api/` (dev) atau
   `public_html/office/ticketing-api/` (produksi).
5. Uji: `?action=ping` harus membalas `env` & `db` yang benar.
   **Cocokkan `db` dengan `event-api-mysql/api.php?action=ping`** — kalau
   berbeda, kedua sistem tidak akan pernah melihat kursi yang sama.
6. Dashboard Xendit → **Webhooks** → *Invoices paid* → isi URL
   `https://<domain>/ticketing-api/api.php`, lalu salin *Callback Verification
   Token* ke `XENDIT_CALLBACK`.

## Mode simulasi (dev)

Supaya seluruh alur bisa dicoba **sebelum** kunci Xendit ada. Tambahkan di
`config.php` server dev:

```php
define('XENDIT_MOCK', true);
```

Halaman bayar Xendit diganti halaman konfirmasi sendiri, tapi pelunasannya
tetap lewat `lunaskan()` yang sama dengan jalur Xendit — jadi yang diuji di dev
benar-benar jalur produksinya.

**Mode ini menerbitkan tiket tanpa uang masuk.** Karena itu ia menolak jalan
ketika `ENV_LABEL='produksi'`, apa pun isi config-nya, dan statusnya ikut
terbaca di `?action=ping` (`simulasi_bayar: true`) — supaya "kok bisa dapat
tiket gratis" ketahuan dari satu URL, bukan dari membaca config di server.
