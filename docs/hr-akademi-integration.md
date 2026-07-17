# Integrasi Staff Performance (hr) dengan Akademi

Rencana teknis menyambungkan komponen **Training 10%** di People Score
(modul `hr` / Staff Performance) ke data training asli di modul **Akademi**.
Ini padanan "Ordering terhubung Purchasing", tapi jauh lebih ringan: hubungannya
**satu arah dan read-only**. Staff Performance cukup MEMBACA satu angka per kru
dari Akademi, tidak menulis balik.

## Kenapa perlu

PRD PeopleOS menetapkan tabel People Score: `Training 10%, Sumber Data: PeopleOS`.
Maksudnya "penyelesaian training kru". Masalahnya, LMS asli (materi, kuis, lulus,
sertifikat) sudah dibangun sebagai **Akademi**, sementara prototipe PeopleOS
membawa Training Center sendiri yang HAMPA (HR mengetik nilai manual). Jadi:

- **Akademi** sudah menghitung `userStats(u).mandPct` = persen training WAJIB yang
  selesai, 0-100, dari materi + kuis yang benar-benar dikerjakan kru.
- **Staff Performance** menghitung `trainingScore(empId)` = angka yang SAMA, tapi
  dari daftar terpisah yang diisi manual.

Dua fungsi, satu pertanyaan, dua database yang tak saling kenal. Training 10%
seharusnya dibaca dari Akademi, bukan diketik ulang.

## Kunci join: Office `userId`

Sejak migrasi SSO, KEDUA modul menyelesaikan identitas dari `lm_session.userId`
yang sama (lihat [[office-auth-and-migration]]). Itu kunci gabung alaminya, bukan
nama (nama bisa beda ejaan) dan bukan divisi.

**Penting, ini menghindari masalah tersulit:** taksonomi divisi kedua modul
BERBEDA (Akademi: `service/kitchen/bar/marketing/sales/finance`; Staff
Performance: `d_store/d_kitchen/d_bar/d_marketing/d_event/d_finance/d_mgmt/d_hrga`).
Karena integrasi ini per-USER lewat `userId`, taksonomi divisi TIDAK perlu
direkonsiliasi sama sekali. "Training wajib untuk siapa" sudah dihitung di dalam
Akademi pakai divisi Akademi; Staff Performance hanya menerima hasil akhir % per
userId.

## Bentuk data yang dibaca

Staff Performance butuh, per kru: **persen training wajib yang selesai (0-100)**.
Idealnya Akademi mengekspos peta ringkas:

```
{ "<userId>": { mandPct: 0..100, mandTotal: n, mandDone: n, certified: bool, updatedAt: iso },
  ... }
```

`mandPct` sudah ada persis di `userStats()` Akademi. Yang perlu dibangun cuma:
endpoint/parsing yang mengembalikan peta ini per userId (bukan seluruh DB).

## Prasyarat (urut)

1. **Akademi harus di-backend dulu.** Saat ini Akademi masih pure localStorage:
   `settings.syncUrl` kosong, `Database Academy` cuma `Sheet1` kosong (lihat
   [[office-data-standard]]). Selama ini, tidak ada sumber lintas-perangkat untuk
   dibaca Staff Performance. Ini blocker utama.
   - Akademi memakai kontrak LAMA `push`/`pull` + `key`, bukan `getAll`/`saveAll`.
     Untuk integrasi, tambah satu action read-only, mis. `GET ?action=trainingStats`
     yang mengembalikan peta di atas (turunan dari `progress` + `materials`), tanpa
     membocorkan seluruh isi Akademi.

2. **Staff Performance membaca peta itu saat boot**, cache di `S._akademiTraining`
   (mirip pola cache lokal yang sudah ada), lalu `trainingScore(empId)`:
   - kalau ada entri Akademi untuk `empId` -> pakai `mandPct` dari Akademi.
   - kalau tidak ada -> jatuh ke perhitungan manual lama (kompatibel mundur), atau
     `null` (belum ada data). Keputusan: **utamakan Akademi bila ada**.

3. **Training Center di Staff Performance jadi read-only ringkas** untuk komponen
   yang berasal dari Akademi: tampilkan status dari Akademi (link "buka di
   Akademi"), sisakan input manual HANYA untuk training luar-Akademi (briefing,
   praktek offline) supaya tidak duplikat. Alternatif lebih tegas: hapus halaman
   Training di Staff Performance, jadikan murni pembaca.

## Yang TIDAK dilakukan

- Tidak menyalin roster/materi/kuis Akademi ke Sheet Staff Performance (itu bikin
  dua sumber kebenaran yang bisa menyimpang, persis bug yang baru dibereskan di
  dalam `hr`).
- Tidak menulis balik dari Staff Performance ke Akademi. Arahnya satu.
- Tidak menyatukan divisi. Join per userId membuatnya tak perlu.

## PENTING: Akademi SUDAH PINDAH ke MySQL (bukan Apps Script)

> Bagian Apps Script di bawah ini **USANG**. Ditulis waktu Akademi masih
> localStorage + rencana Sheet. Sejak migrasi MySQL, `deploy/akademi/index.html`
> memakai `API_URL = '../akademi-api-mysql/api.php'`, dan layar
> "Pengaturan > Sinkronisasi" (isi URL + kunci) **sudah DIHAPUS dari UI dengan
> sengaja** — jadi wajar kalau kru tidak menemukannya lagi. Sheet
> `Database Academy` + `docs/akademi-apps-script.gs` = backend TERLANTAR:
> masih menjawab kalau dipanggil, tapi `progress`-nya selamanya `{}` karena
> aplikasi live menulis ke MySQL. JANGAN membaca data dari sana.

**Implementasi yang BENAR (dikerjakan 2026-07-17):**

1. **Akademi (`akademi-mysql/`)**: aksi `?action=trainingStats` di `api.php`
   -> `training_stats()` di `lib_akademi_mysql.php`. Menghitung dari tabel
   `users` + `materials` + `progress`, meniru `userStats()` klien PERSIS.
   Tanpa token (API_TOKEN default kosong), baca-saja.
2. **Staff Performance (`deploy/hr/index.html`)**: `AKADEMI_STATS_URL` =
   `"../akademi-api-mysql/api.php"`. Consumer `loadAkademiStats()` sudah
   menerima bentuk `{ok:true,data:{...}}`, tidak perlu diubah.

**Jebakan kolom:** di MySQL, `progress.done` itu kolom TURUNAN
(`empty($r['done']) ? 0 : 1`) dan BUKAN penanda lulus kuis. `passed`/`status`
hanya ada di dalam kolom `data` (JSON). `training_stats()` karena itu membaca
`data`, sama seperti `baca_state()`.

**Cek berhasil:** buka `<domain>/akademi-api-mysql/api.php?action=trainingStats`
-> `{"ok":true,"data":{"u-adit":{"mandPct":…}}}`.

## (USANG) Cara mengaktifkan lewat Apps Script

Ditinggalkan. Disimpan hanya sebagai catatan sejarah.

1. Buka Sheet `Database Academy` > Extensions > Apps Script, tempel
   `docs/akademi-apps-script.gs`, ganti `SYNC_KEY`, Deploy > New deployment.
2. Isi URL `/exec` + Kunci di Akademi > Pengaturan > Sinkronisasi (layar ini
   sudah tidak ada lagi).
3. Isi `AKADEMI_STATS_URL` dengan URL `/exec` tersebut.

## Verifikasi yang sudah dilakukan (2026-07-16)

- `trainingStats_` (GAS) menghasilkan `mandPct` PERSIS sama dengan `userStats()`
  klien Akademi di banyak kasus (lulus penuh, sebagian, campuran wajib,
  user nonaktif dikecualikan, materi unpublished diabaikan).
- End-to-end di browser: kru yang menuntaskan training wajib di data Akademi ->
  komponen Training di People Score = 100 TANPA satu pun catatan training manual;
  kru yang belum = 0. Tanpa error console.

## Status

**2026-07-17:** dipindah ke MySQL dan dihidupkan. `trainingStats` ada di
`akademi-mysql/api.php`, `AKADEMI_STATS_URL` sudah diisi. Perlu deploy
`akademi-mysql/*` ke server, lalu cek URL di atas. Belum diuji terhadap DB asli
(tidak ada PHP/MySQL di mesin lokal), jadi verifikasi pertama = buka URL cek.

Catatan sejarah 2026-07-16: sisi kode Apps Script sempat dinyatakan "selesai &
terverifikasi", tapi itu menyasar backend yang sudah ditinggalkan. Pelajarannya:
periksa dulu `API_URL`/`WEB_APP_URL` modulnya sebelum percaya dokumen lama.

Lihat [[hr-module-plan]], [[office-data-standard]], [[office-auth-and-migration]].
