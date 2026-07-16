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

## Cara mengaktifkan (langkah Google-side, dilakukan user)

Sisi kode SUDAH SIAP dua-duanya:
- **Akademi** (`docs/akademi-apps-script.gs`): endpoint `?action=trainingStats`
  sudah ditambahkan, logikanya ditest identik dengan `userStats()` klien Akademi.
- **Staff Performance** (`deploy/hr/index.html`): consumer `loadAkademiStats()` +
  `trainingScore()` yang mengutamakan Akademi sudah ada dan ditest end-to-end.

Yang tinggal dilakukan (tak bisa dari kode, harus di Google):

1. **Backend Akademi.** Buka Sheet `Database Academy` > Extensions > Apps Script,
   tempel `docs/akademi-apps-script.gs`, ganti `SYNC_KEY`, Deploy > New deployment
   > Web app (Execute as: Me, Who has access: **Anyone**, bukan "Anyone with
   Google account"). Salin URL `/exec`.
2. **Isi sync Akademi.** Di aplikasi Akademi > Pengaturan > Sinkronisasi: isi URL
   `/exec` + Kunci (sama dgn `SYNC_KEY`). Klik "Kirim ke Server" sekali dari device
   utama supaya Sheet terisi data awal.
3. **Aktifkan link di Staff Performance.** Isi `AKADEMI_STATS_URL` di
   `deploy/hr/index.html` (sekarang `""`) dengan URL `/exec` Akademi yang SAMA.
   `trainingStats` sengaja tanpa kunci, jadi hanya URL yang diperlukan.

Setelah itu: kru menyelesaikan kuis di Akademi -> `mandPct` naik -> komponen
Training 10% di People Score otomatis mengikuti, tanpa input manual. Halaman
Training Center di Staff Performance otomatis berganti jadi mode "catat training
di luar Akademi saja".

**Cek berhasil:** buka `URL_AKADEMI/exec?action=trainingStats` di browser, harus
balas `{"ok":true,"data":{...}}` (JSON, bukan halaman login Google). Kalau
mengarah ke accounts.google.com, deployment belum "Anyone".

## Verifikasi yang sudah dilakukan (2026-07-16)

- `trainingStats_` (GAS) menghasilkan `mandPct` PERSIS sama dengan `userStats()`
  klien Akademi di banyak kasus (lulus penuh, sebagian, campuran wajib,
  user nonaktif dikecualikan, materi unpublished diabaikan).
- End-to-end di browser: kru yang menuntaskan training wajib di data Akademi ->
  komponen Training di People Score = 100 TANPA satu pun catatan training manual;
  kru yang belum = 0. Tanpa error console.

## Status

Sisi kode selesai & terverifikasi (2026-07-16). Menunggu 3 langkah deploy
Google-side di atas untuk benar-benar hidup. Sampai `AKADEMI_STATS_URL` diisi,
`trainingScore()` tetap jatuh ke input manual (dorman, tidak mengganggu).

Lihat [[hr-module-plan]], [[office-data-standard]], [[office-auth-and-migration]].
