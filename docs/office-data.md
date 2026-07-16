# Office — Standar Data & Peta Database

Dokumen ini memetakan modul Office ke database-nya, dan menetapkan **standar
penyimpanan** yang wajib diikuti modul baru. Ini padanan data dari
`office-playbook.md` (desain) dan `office-auth.md` (identitas).

## Peta modul → database

Tiap modul punya **Sheet sendiri** + **Apps Script `/exec` sendiri**. Tidak ada
database bersama, kecuali identitas (Database User) yang dipakai semua modul.

| Sheet | Modul | Status |
|---|---|---|
| **Database User** (`Users`, `Roles`, `Grants`) | Office landing (identitas/SSO) | Live. Juga endpoint yang dipanggil panel *Kelola Akses* tiap modul. |
| **Database Reserve** (`_DATA`, `Reservations`, `Audit`) | Reservasi | Live. |
| **Database COMS** (16 tab) | Konten | Live. Skema paling lengkap. |
| **Database CRM** | Marketing | Script: `docs/crm-apps-script.gs`. |
| **Database Academy** | Akademi | Script: `docs/akademi-apps-script.gs`. |
| **Database Performance** | Staff Performance (`hr`) | Script: `docs/performance-apps-script.gs`. Kontrak standar + `_rev`. Tinggal isi `WEB_APP_URL` di `deploy/hr/index.html`. |
| (sheet terpisah) | Howandi Life OS | Live, sheet sendiri. |
| (beberapa script) | Stock (ordering + purchasing) | Live tapi terpecah ke 5+ script. Perlu konsolidasi. |
| Laravel | Event / Finance / Manajemen | Di luar cakupan (arsitektur lain). |

## Standar penyimpanan (WAJIB untuk modul baru)

Pola yang sudah dipakai Reservasi & Konten, dan sekarang jadi standar:

1. **`_DB` (atau `_DATA`)** — satu sel berisi **JSON blob**. Ini **sumber
   kebenaran**. App membaca/menulisnya utuh.
2. **Tab rata (flattened)** — satu tab per koleksi (`1_Users`, `2_Clients`, …),
   **ditulis ulang tiap save**. Hanya untuk dibaca manusia / pivot / laporan.
   **Jangan diedit manual**: akan tertimpa. Semua edit lewat aplikasi.
3. **Tab audit** (`Audit` / `logs` / `Activity`) — jejak perubahan.
4. **Tab `settings`** — konfigurasi (pasangan `field` / `value`).

Alasan blob + tab rata: app-nya single-file dan menyimpan seluruh state
sekaligus, jadi blob bikin baca/tulis atomik dan bebas migrasi kolom; tab rata
menutup kekurangannya, yaitu Sheet jadi tak terbaca manusia.

## Kontrak Web App

**Standar (dipakai Reservasi, Konten, Marketing):**

```
GET  ?action=getAll                 -> {ok:true, data:{...}}
POST {action:"saveAll", data:{...}} -> {ok:true, data:{...}}
error                               -> {ok:false, error:"..."}
```

**Akademi** memakai varian lama (`push`/`pull` + `key`, last-write-wins lewat
`db.updatedAt`). Dipertahankan karena kliennya sudah jadi dan sudah benar:

```
GET  ?action=pull&key=...               -> {ok:true, db:{...}}
POST {action:"push", key:"...", db:{}}  -> {ok:true}
```

Modul baru: pakai kontrak **standar** (`getAll`/`saveAll`).

Selalu POST dengan `Content-Type: text/plain;charset=utf-8` — supaya jadi
*simple request* dan tidak kena preflight CORS ke Apps Script.

## Cara pasang (Marketing & Akademi)

1. Buka Sheet-nya → **Extensions > Apps Script**.
2. Tempel isi `docs/crm-apps-script.gs` (Marketing) atau
   `docs/akademi-apps-script.gs` (Akademi).
3. **Deploy > New deployment > Web app** — *Execute as: Me*,
   *Who has access: Anyone*. Salin URL `/exec`.
4. Pasang URL-nya:
   - **Marketing**: ganti `WEB_APP_URL` di `deploy/marketing/index.html`
     (sekarang masih `PASTE_URL_EXEC_CRM_DI_SINI`).
   - **Akademi**: buka **Pengaturan** di aplikasinya, isi *URL Web App* +
     *Kunci* (samakan dengan `SYNC_KEY` di script-nya).
   - **Staff Performance**: buat Sheet baru **Database Performance**, tempel
     `docs/performance-apps-script.gs`, deploy, lalu ganti `WEB_APP_URL` di
     `deploy/hr/index.html` (sekarang masih `PASTE_URL_EXEC_PERFORMANCE_DI_SINI`).
     Selama masih placeholder, app jalan offline (localStorage) dan kartu *Data*
     di Pengaturan memberi tahu bahwa server belum tersambung. Sheet kosong pada
     boot pertama akan otomatis diisi data awal (divisi + template KPI) oleh app.

Deploy ulang script = **New deployment** (bukan Save saja), kalau tidak URL
lama tetap menjalankan kode lama.

## Utang teknis yang diketahui

- **Stock** memanggil 5+ Apps Script berbeda. Perlu dilipat jadi satu
  endpoint/sheet seperti modul lain.
- **Skema CRM** sebelumnya bolong: tab `3_Events` dan `4_Followups` tidak ada
  (penomoran melompat dari `2_Clients` ke `5_Activities`) walau app menyimpan
  `events` dan `followups`. Sudah ditutup di `crm-apps-script.gs`.
- Penegakan hak akses ada di tiap Apps Script/Sheet, **bukan** di Office/
  `lm_session` (itu gating UX saja). Lihat `office-auth.md`.
