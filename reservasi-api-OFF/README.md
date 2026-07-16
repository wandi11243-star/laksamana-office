# Reservasi — Backend LAMA (berbasis file JSON) — SUDAH TIDAK DIPAKAI

**Jangan dinyalakan lagi.** Ini arsip kode, disimpan untuk rujukan saja.

## Statusnya

Backend reservasi sudah pindah ke MySQL (`reservasi-mysql/`, live di
`public_html/office/reservasi-api-mysql/`). Backend lama ini **beku sejak hari
migrasi (16 Juli 2026)**.

Dulu folder ini ada di `deploy/reservasi-api/`, jadi ikut ter-FTP otomatis dan
tetap hidup di server — URL-nya bisa diakses siapa saja padahal datanya sudah
basi. Sekarang dipindah ke luar `deploy/` supaya **tidak ikut ter-deploy lagi**.

## Kenapa tidak boleh dipakai lagi

Datanya sudah **bercabang**. Pada 16 Juli 2026:

| Backend | Isi |
|---|---|
| MySQL (live) | 186 reservasi — terus bertambah |
| File JSON (ini) | **167 reservasi — berhenti di hari migrasi** |

Mengarahkan aplikasi kembali ke sini berarti kru **kehilangan semua reservasi
setelah tanggal migrasi** dari tampilan (datanya masih ada di MySQL, tapi tidak
terlihat) — dan berisiko dobel-booking meja yang sebenarnya sudah terisi.

Jadi "balik satu baris URL" yang dulu tertulis di README **sudah tidak berlaku**.

## Datanya di mana

`data.json` **tidak ada di folder ini**. Dia tersimpan di luar web root:

```
/home/lakk5493/reservasi-db/data.json     <- 167 reservasi, arsip dingin
/home/lakk5493/reservasi-db/files/        <- 84 foto (DIPAKAI BERSAMA backend MySQL)
```

Menghapus folder kode ini **tidak menyentuh data itu sama sekali**.

> **PENTING:** folder `files/` (foto) **masih dipakai backend MySQL**. Jangan
> dihapus. Yang sudah tidak terpakai hanya `data.json`.

## Kalau benar-benar perlu membaca data lama

Buka `/home/lakk5493/reservasi-db/data.json` langsung (file JSON biasa), atau
salin folder ini ke lokasi mana pun di luar server lalu jalankan lokal. Tidak
perlu menaruhnya kembali ke `public_html`.
