# Pintu AI Agent — Reminder Task BD OS lewat WhatsApp

Panduan untuk AI agent di VPS (opencode). Website **tidak mengirim WhatsApp** —
agent yang mengirim reminder, menerima balasan, lalu memanggil API di bawah.

## Alamat

| server | URL |
|---|---|
| dev | `https://dev.laksamanamuda.id/bd-api-mysql/api.php` |
| produksi | `https://team.laksamanamuda.id/bd-api-mysql/api.php` |

Semua aksi **POST**, badan JSON, dan wajib membawa `agentToken`
(nilainya = `AGENT_TOKEN` di `config.php` server itu; boleh juga lewat header
`X-Agent-Token`). Token **tidak pernah** di URL.

Balasan selalu `{ok:true, data:{…}}` atau `{ok:false, error:"…"}`.

## 1. `agentTugas` — daftar task yang perlu diingatkan

```json
{ "action": "agentTugas", "agentToken": "…" }
```

Bawaan: task **belum Done** yang deadline-nya **hari ini (WIB) atau sudah lewat**.
Opsional: `"dari":"2026-10-27","sampai":"2026-10-27"` untuk mengingatkan lebih awal (H-1).

Tiap tugas berisi: `id`, `nama`, `deskripsi`, `deadline`, `deadlineTeks` (mis. "Min, 1 Nov 2026"), `lewatHari`, `status`,
`divisi`, `project`, `berulang`, `terlewat`, `pic:[{id,nama,officeUserId,noHp}]`,
`subtask:[{teks,selesai,deadline,pelaksana}]`.

`noHp` sudah dalam bentuk `62812…`. Kalau `rosterTerbaca:false`, Office sedang
tidak menjawab dan semua `noHp` kosong — coba lagi nanti, jangan kirim apa pun.
PIC dengan `noHp` kosong = nomornya belum diisi di Office (Kelola Akses / Data Pegawai).

## 2. `agentSelesai` — orangnya membalas "Sudah"

```json
{ "action": "agentSelesai", "agentToken": "…",
  "id": "<id task>", "noHp": "<nomor WA PENGIRIM balasan>", "catatan": "opsional" }
```

- `noHp` **wajib** dan harus milik PIC task itu (atau yang di-assign sub-task-nya).
  Nomor lain ditolak — jadi selalu kirim nomor pengirim dari webhook WhatsApp,
  bukan nomor yang diingat agent.
- Task yang sudah Done memulangkan `sudahSebelumnya:true` (klik ganda aman).
- Task yang masih menunggu task lain ditolak: `Belum bisa Done — selesaikan dulu: …`.
  Teruskan pesan itu ke orangnya.
- Task berulang: jadwal berikutnya dibuat otomatis oleh website saat modul BD
  terbuka/dibuka berikutnya (`penerus:true` di balasan).

## 3. `agentCatat` — balasan selain "Sudah"

```json
{ "action": "agentCatat", "agentToken": "…", "id": "…", "noHp": "…",
  "catatan": "Belum, genset sedang diservis teknisi" }
```

Dicatat di task (terlihat di modal task → *Balasan lewat chat*), status tidak berubah.

## Alur yang disarankan

1. Jadwal (cron di VPS), mis. tiap jam 09:00 & 16:00 WIB → `agentTugas`.
2. Untuk tiap tugas × tiap PIC ber-`noHp` → kirim template WhatsApp (Cloud API)
   dengan tombol balas cepat **Sudah** / **Belum**. Simpan payload tombol berisi
   `id` task, mis. `selesai:<id>` dan `belum:<id>`.
3. Webhook WhatsApp masuk:
   - tombol `selesai:<id>` → `agentSelesai` dengan `noHp` = pengirim;
   - tombol `belum:<id>` → tanyakan alasannya, lalu `agentCatat`;
   - teks bebas → AI menebak maksudnya; kalau jelas "sudah" → `agentSelesai`
     (sertakan teksnya sebagai `catatan`), selain itu → `agentCatat`.
4. Balas ke orangnya berdasarkan `ok` / `error`.

Hindari mengirim reminder yang sama berkali-kali: catat `id + tanggal` yang sudah
dikirim di sisi agent.

## Menyalakan di server (sekali per server, manual di cPanel)

`config.php` tidak ikut deploy. Tambahkan di
`bd-api-mysql/config.php` server dev dan produksi (nilai BEDA):

```php
define('AGENT_TOKEN', 'string-acak-minimal-24-karakter');
```

Selama belum diisi, ketiga aksi menjawab
`Pintu agent belum dinyalakan`. Cek versi: `?action=ping` → `versi` `2026-10-27a`.
