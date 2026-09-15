# Laksamana Office — panduan kerja untuk Claude

Tujuan berkas ini: **memangkas token yang terbuang untuk menemukan ulang hal
yang sudah diketahui**, bukan menambah aturan. Semua di bawah ini adalah fakta
repo yang kalau tidak ditulis, harus ditemukan ulang dengan belasan panggilan
`ls` / `find` / `grep` setiap sesi.

Bahasa kerja: **Indonesia** — UI, komentar kode, pesan commit, dan balasan ke
user. Istilah teknis (commit, merge, pager, endpoint) dibiarkan apa adanya.

---

## 0. ATURAN MUTLAK: Claude TIDAK BOLEH MENGHAPUS DATA

**Claude tidak pernah boleh menghapus, mengosongkan, atau menimpa data yang
ada di database situs ini — di produksi maupun di dev.** Aturan ini di atas
segalanya di berkas ini: kalau sebuah tugas hanya bisa diselesaikan dengan
menghapus data, tugas itu BERHENTI dan ditanyakan ke user, bukan dikerjakan.

Yang dilarang, tanpa pengecualian dan tanpa perlu diminta izin dulu (jawabannya
sudah tidak):

| dilarang | contohnya |
|---|---|
| SQL perusak | `DELETE`, `TRUNCATE`, `DROP TABLE`, `DROP DATABASE`, `UPDATE` massal tanpa `WHERE` |
| memanggil endpoint yang menghapus | `hapusUser`, `rosterHapusUser`, `designReqSet` yang membuang, aksi `*Hapus*` mana pun |
| menimpa blob | `saveAll` / `brankasSave` / `an_simpan` dengan state yang disusun Claude sendiri |
| "merapikan" data | membuang baris uji, baris ganda, atau baris yang kelihatan salah |
| memulihkan dengan menimpa | menulis ulang tabel dari salinan/seed demi "membetulkan" |
| menjalankan migrasi | `migrasi-*.sql` di server yang hidup |

**Yang BOLEH, dan memang berguna saat menelusuri masalah:** membaca. `getAll`,
`stats`, `ping`, dan aksi baca lain silakan dipanggil — semuanya GET dan tidak
mengubah apa pun. Menulis KODE yang kelak menghapus (mis. memperbaiki fungsi
hapus di modul) juga boleh: yang dilarang Claude SENDIRI yang mengeksekusi
penghapusan terhadap data yang hidup.

**Kalau user memintanya pun, jangan langsung kerjakan.** Sebutkan persis baris
apa yang akan hilang dan berapa banyak, lalu minta user yang menjalankannya
sendiri lewat phpMyAdmin atau UI modulnya. Data yang terhapus di sini **tidak
bisa dikembalikan**: tidak ada snapshot, tidak ada undo, dan `activities` cuma
menyimpan 5000 baris terakhir berupa JEJAK — bukan isinya.

> **Ini bukan aturan pencegahan yang mengada-ada.** Repo ini sudah punya
> riwayatnya sendiri: `hapus_yang_hilang()` di marketing-mysql PERNAH menghapus
> kerja orang lain tanpa satu pun galat (8 Agustus 2026), dan `saveAll` yang
> menimpa buta pernah menghilangkan seluruh Reservasi VIP & Request Desain tiap
> kali di-refresh (2 September 2026). Keduanya lahir dari kode yang berniat
> baik. Penghapusan yang dijalankan tanpa berpikir dua kali jauh lebih cepat
> merusaknya.

### Kalau user melaporkan data hilang

Telusuri, jangan menebak — dan JANGAN memperbaikinya dengan menulis ulang data.
Urutan yang sudah terbukti berguna (15 September 2026):

1. **`?action=stats`** — jumlah baris per tabel. Aman, tidak memuat isi.
2. **Tabel `activities`** — append-only, 5000 baris terakhir, berisi
   `action` / `detail` / `by` / `at`. Penghapusan lewat UI TERCATAT di sini
   (`Event dihapus permanen`, `Client dihapus permanen`) berikut NAMA dan
   WAKTUNYA. Inilah alat forensik satu-satunya yang dipunyai repo ini.
3. **Cap waktu vs jam sekarang** — `_versi` dan `updatedAt` tiap baris.
   `_versi` yang berada di MASA DEPAN berarti ada perangkat berjam cepat, dan
   itu membuat `hapus_yang_hilang()` boleh membuang baris yang baru lahir.

**BATAS YANG WAJIB DIKATAKAN saat melapor:** `hapus_yang_hilang()` berjalan di
server dan **TIDAK menulis satu baris pun ke `activities`**. Jadi log itu
membuktikan penghapusan yang MEMANG lewat tombol, tapi **tidak bisa menyangkal**
adanya penghapusan senyap. Menyimpulkan "berarti tidak ada bug" dari log yang
bersih adalah kesimpulan yang tidak ditanggung datanya.

---

## 1. Peta repo — jangan `find` lagi

```
deploy/<modul>/index.html   ← FRONTEND. Satu berkas HTML raksasa per modul.
                              Inilah yang di-deploy. 99% pekerjaan ada di sini.
deploy/assets/              ← logo & tema bersama antar modul
<modul>-mysql/              ← BACKEND PHP modul itu (api.php, lib_*.php, schema.sql)
account-mysql/              ← database USER/akun bersama. Sumber SSO & roster pegawai.
docs/                       ← Apps Script lama + catatan Office (arsip/rujukan)
.github/workflows/          ← deploy FTP otomatis
```

Modul: `marketing` `reservasi` `event` `bd` `konten` `hr` `akademi` `finance`
`analytics`
`radar` `stock` `howandi_life` `jadwal` `dw` — plus `absensi`, yang letaknya
BERBEDA (lihat di bawah).

### Modul berpanel: `stock` dan `finance`

Dua modul TIDAK berbentuk satu `index.html`. `deploy/<modul>/index.html`-nya
adalah **pemilih panel** (~280 baris, tanpa aplikasi di dalamnya), dan
aplikasinya ada satu tingkat lebih dalam:

```
deploy/stock/index.html          pemilih   →  ordering/ purchasing/ tree/ usage/ hpp/
deploy/stock/hpp/index.html      HPP & Resep, izin SENDIRI 'hpp' (bukan 'stock')
deploy/finance/index.html        pemilih   →  omset/ kas/
deploy/finance/omset/index.html  BEKAS deploy/kompas/  (izin 'kompas')
deploy/finance/kas/index.html    BEKAS deploy/finance/ (izin 'finance')
```

### Modul berpanel `finance` sekarang TIGA panel

```
deploy/finance/index.html          pemilih  →  omset/ kas/ brankas/
deploy/finance/omset/index.html    BEKAS deploy/kompas/  (izin 'kompas')
deploy/finance/kas/index.html      BEKAS deploy/finance/ (izin 'finance')
deploy/finance/brankas/index.html  BARU 27 Agu 2026      (izin 'brankas')
```

**Brankas** — posisi kas perusahaan per bank, piutang, rencana pembayaran, dan
pengembalian modal investor. Asalnya berkas mandiri `Laksamana_Muda_BRANKAS.html`
(localStorage + PIN CFO/CEO + seluruh angkanya karangan); ketiganya dicabut saat
masuk ke sini.

**Kunci izinnya `brankas`, SENGAJA tidak dilebur ke `finance`.** Yang memegang
kas kecil tidak dengan sendirinya melihat posisi kas seluruh perusahaan dan
pengembalian modal investor — dan justru itu alasan panel ini berdiri sendiri.
Kuncinya harus disebut di **empat** tempat, dan yang terlewat gagal diam-diam:
penjaga `<head>` pemilih, `sesiOffice()` di badan pemilih, `panelBoleh()`, dan
`PANEL_URL`.

**SALDO REKENING TIDAK PERNAH DIKETIK.** Ia dihitung dari **Aktual Masuk** tiap
metode pembayaran di Rekap Penjualan:

```
kotor = Σ reports[tgl].pay[k].actual
akt   = aktual yang DIKETIK (reports[tgl].aktual[grup])   kalau ada
      = kotor − MDR tersimpan (reports[tgl].mdr[grup])    kalau tidak
tanpa MDR (cash, transfer) → akt = kotor
```

- `aktGrup()` adalah **BERKAS KEMBAR** `rkHitung()` di `deploy/finance/kas/`.
  Kalau di sana berubah, di sini HARUS ikut — dua rumus untuk satu angka berarti
  Saldo & Rekening bisa menyebut angka lain daripada Rekap Penjualan untuk hari
  yang sama, dan yang mencari sebabnya akan mengira uangnya hilang.
- MDR & aktual tersimpan **di dalam `reports[tgl]` sendiri**, bukan di kunci
  terpisah. Membaca kunci yang salah memulangkan saldo NOL tanpa satu pun galat
  — `kotor − 0` tetap kotor, dan angkanya kelihatan masuk akal.
- Kelompok `error_*` **tidak ada** di daftar: ia catatan salah input, bukan uang.
**METODE PEMBAYARAN BARU HARUS DIDAFTARKAN DI LIMA TEMPAT** (TikTok Go, 29
Agustus 2026). Yang terlewat gagal dengan cara yang berbeda-beda, dan tidak
satu pun melempar galat:

| tempat | kalau terlewat |
|---|---|
| `PAYS` di `deploy/cashier/`, `deploy/finance/omset/`, `deploy/finance/kas/` | kasir tidak punya kotak untuk mengetiknya |
| `RK_GRUP` di `deploy/finance/kas/` | tidak muncul di Rekap Penjualan |
| `RK_GRUP` **kembar** di `deploy/finance/brankas/` | uangnya tidak pernah masuk saldo bank mana pun |
| `MAP_BAWAAN` di brankas | metodenya menggantung — dilaporkan di halaman Saldo (jaring terakhir) |
| `$grup` di `kompas-mysql` | penanda dilaporkan sebagai `takDikenal` |
| `$bank` di `kompas-mysql` | **MDR yang diketik DIBUANG DIAM-DIAM** |

Yang terakhir paling berbahaya: daftar `$bank` tertutup, jadi menambah ojol
baru di frontend tanpa menambahnya di sana membuat potongan komisi yang sudah
diketik hilang tanpa satu pun pesan — dan saldo banknya jadi lebih besar
daripada yang benar-benar diterima.

Kuncinya ditulis **serangkai tanpa pemisah** (`gofood`, `grabfood`, `tiktokgo`)
— nama merek di daftar itu memang begitu, dan satu kunci yang pakai garis bawah
membuat orang berikutnya harus mengingat mana yang mana.

- **Setoran cash** (`rekap_setoran`) menambah bank tujuan dan mengurangi brankas
  fisik. `tujuan` teks bebas, jadi yang tidak cocok dengan BRI/Mandiri/BCA/UOB
  **dilaporkan di layar**, bukan dijatuhkan ke bank pertama.
- QR Order, Gofood, Grabfood, dan TikTok Go bawaannya **UOB**, sama dengan Transfer
  (ditetapkan user 27 Agustus 2026). Sempat dibiarkan kosong karena tidak ada
  yang bisa MENEBAK ke rekening mana settlement ojol masuk — tapi jawaban dari
  yang memegang rekeningnya bukan tebakan. Ini bawaan, bukan kunci mati:
  `setting.peta` menimpanya, jadi kalau settlement pindah bank yang diubah
  setelan di Pengaturan. Metode yang tidak punya tujuan tetap **dilaporkan di
  halaman Saldo**; itulah jaringnya kalau suatu hari ada metode baru.

**Piutang DIBACA dari modul Cashier**, tidak diketik di sini (27 Agustus 2026).
Bon tamu dicatat kasir di Cashier → Piutang / Bon, dan blob-nya SAMA dengan
Kompas — jadi sudah ikut di data yang dimuat halaman ini. Halaman Brankas-nya
read-only: bon yang bisa diketik di dua tempat akan punya dua angka berbeda
suatu hari, dan yang mencocokkannya tidak punya cara tahu mana yang benar.

**Mutasi & Transfer Wallet** punya tiga jenis, dan `pindah` adalah SATU baris
yang menyentuh dua wadah — bukan dua baris (keluar dari A, masuk ke B). Dua
baris yang salah satunya terhapus membuat uang perusahaan bertambah atau
hilang tanpa ada yang menyadarinya.

**Setoran cash dari Rekap Penjualan IKUT di Riwayat Mutasi** — dibaca, bukan
disalin. Uangnya memang berpindah wallet, jadi ia mutasi; saldonya sudah
bergeser sejak awal, tapi jejaknya sempat tidak ada di daftar perpindahan
wallet — sehingga perpindahan yang PALING SERING terjadi justru tidak
kelihatan di sana, dan yang menjumlahkan daftarnya mendapat angka yang tidak
cocok dengan saldo. Barisnya **tidak bisa dihapus dari Brankas**: yang
memegang setoran adalah Rekap Penjualan, dan menyalinnya ke `bk_state` berarti
setoran yang dibatalkan di sana meninggalkan mutasi hantu di sini.

> Sempat DICABUT 4 September 2026 lalu **dipulihkan hari yang sama atas
> permintaan user**. Jangan dicabut lagi tanpa diminta. Yang dicabut sebagai
> gantinya adalah kata "Setor" di jenis mutasi manual — lihat blok di bawah.

**`saldoSemua()` membaca `setoranSemua()` LANGSUNG, bukan lewat
`mutasiSemua()`.** Baris setoran yang ikut di daftar karena itu **tidak boleh**
ikut dijumlahkan lagi di sana — kalau ia disalin ke `BK.data.mutasi`, brankas
fisik berkurang dua kali lipat dari yang benar-benar keluar, tanpa satu pun
galat.

**Jenis mutasi manual TIDAK memakai kata "Setor"** (4 September 2026,
permintaan user). Ia dulu bernama *Setor / uang masuk dari luar*, dan di layar
yang sama sudah ada baris **Setoran cash** dari Rekap Penjualan — dua hal yang
arahnya BERLAWANAN (omset yang keluar dari brankas vs uang yang masuk dari
luar) terbaca sama, dan yang tertukar mencatat pemasukan sebagai setoran atau
sebaliknya. Sekarang **Uang masuk dari luar (di luar omset harian)**.

Gunanya disebut di labelnya sendiri, bukan ditebak: pemasukan cash yang tidak
lewat POS — sewa tempat, penjualan barang bekas, titipan yang dikembalikan.
Yang **sudah** masuk omset harian jangan dicatat di sini: ia sudah terhitung
lewat **Aktual Masuk** di Rekap Penjualan, dan mencatatnya lagi menaikkan saldo
tanpa satu pun uang yang benar-benar datang. Peringatan itu ada **di layarnya**,
bukan cuma di komentar kode.

**SETORAN BOLEH SEBAGIAN** (4 September 2026, permintaan user: "semisalnya mau
dirubah setorannya ternyata tidak semuanya"). Mencentang sebuah hari di Rekap
Penjualan → Setoran Cash mengisi kotak nominal dengan **sisa** hari itu, dan
nominalnya boleh disunting. Nominal per hari disimpan di `rekap_setoran[].jumlah`
`{tgl: nominal}`.

- **Baris LAMA tidak punya `jumlah`, dan itu berarti setoran PENUH** — itulah
  satu-satunya bentuk yang mungkin sebelum tanggal itu. Dianggap nol, seluruh
  setoran yang sudah tercatat muncul lagi sebagai "belum disetor" dan
  disetorkan untuk kedua kalinya.
- **Hari yang baru disetor sebagian BELUM lunas.** `rkSetor()` memulangkan true
  hanya kalau sisanya habis. Kalau ia menyala begitu harinya disebut satu baris
  setoran, sisanya lenyap dari daftar "belum disetor" — uang yang masih di
  brankas dan tidak disebut satu layar pun.
- **`rkSetorSudah()` di `deploy/finance/kas/` adalah BERKAS KEMBAR
  `kp_setor_masuk()` di `kompas-mysql`.** Layar dan server yang berbeda
  pendapat tentang hari mana yang masih perlu disetor adalah selisih yang cuma
  ketahuan waktu uangnya dihitung ulang di brankas.
- **Server menjepit nominal ke SISA hari itu**, bukan ke cash-nya: dijepit ke
  cash, setoran kedua untuk hari yang sudah sebagian bisa membawa jumlah penuh
  lagi, dan total setoran jadi lebih besar daripada uang yang pernah ada di
  laci. Gejalanya saldo brankas fisik yang minus, bukan galat.
- **Layar MENOLAK nominal yang melampaui sisa**, tidak sekadar
  memperingatkan — karena servernya menjepit. Layar yang meneruskannya membuat
  nominal tersimpan berbeda dari yang diketik tanpa satu pun pesan. Kalau uang
  yang benar-benar disetor memang lebih besar, yang salah **Cash Actual** hari
  itu di Report Daily, dan layarnya mengatakan begitu.
- **Nominal nol ditahan di dua tempat** — tombolnya dimatikan DAN
  `rkCatatSetoran()` menolak sendiri. Yang pertama menyentuh DOM, dan sekali
  saja ia tidak sempat jalan, tombolnya hidup dengan pilihan yang tidak sah.
- **Mengetik nominal tidak menggambar ulang halaman** (`rkUbahNominal`), sama
  alasannya dengan centangnya: render di modul ini TOTAL, jadi kotak yang
  sedang diketik akan dibuat ulang dan hanya huruf pertama yang masuk.
- **"Rp" di kotak nominal adalah HIASAN, bukan bagian nilainya** (`.rpin>span`).
  Sempat ikut di dalam `value` lewat `fmtRp()`, dan begitu kotaknya diketik
  pemformat hidup modul ini (`fmtRpInput`, yang membuang semua non-digit)
  menghapusnya — sehingga kotak yang belum disentuh berbunyi `Rp1.803.000`
  sementara yang barusan diketik berbunyi `1.527.000`, di kolom yang sama
  (keluhan user 4 September 2026). Sebagai hiasan ia tidak bisa hilang dan
  tidak pernah ikut terpilih saat isinya di-blok untuk diganti.
- **Kotaknya berclass `rp`, jadi yang memformat pemformat modul** — satu
  penangan `input` di `document`. `rkUbahNominal` sengaja TIDAK memformat
  sendiri: dua pemformat untuk satu kotak menggeser kursornya dua kali tiap
  ketukan. Penangan elemen jalan lebih dulu, jadi `el.value` di sana masih
  mentah — dan itu aman, `num()` memang membuang seluruh non-digit.
- **Kotak yang isinya tidak sah ditandai DI KOTAKNYA** (`.rpin.err`), bukan
  cuma di pita peringatan: pita menyebut tanggal, dan mencocokkan tanggal
  dengan baris di tabel 30 baris adalah pekerjaan yang tidak perlu ada.
  Disegarkan di `rkSegarPilih()`, bukan di `rkUbahNominal` — supaya ikut
  tersegar sesudah Pilih Semua, bukan hanya sesudah ada yang mengetik.
- **`rkPasangKotak()` satu tempat untuk menyalakan/mematikan kotak**, dipakai
  centang per baris dan Pilih Semua. Dua tempat yang menyetelnya
  sendiri-sendiri akan menyimpang, dan yang menyimpang di sini adalah kotak
  yang terlihat mati padahal harinya ikut terkirim.

```bash
node tools/uji-setoran-sebagian.js   # 59 pemeriksaan, jsdom (kas + brankas + php)
```

**Pengembalian modal menyebut wallet asalnya** (`returns[].dari`). Tanpa itu
saldo rekening tetap utuh padahal uangnya sudah ditransfer ke investor. Baris
lama yang belum punya `dari` TIDAK dijatuhkan ke wadah mana pun — menebaknya
berarti mengurangi rekening yang uangnya tidak pernah keluar dari sana; yang
menggantung dilaporkan lewat `modalTanpaWadah()`.

**Pengembalian modal ikut tampil di halaman investor** sebagai riwayat dividen.
Jalurnya `kompas-api?action=investorRingkas` → `dividen_investor()` → ambil
`finance-api?action=brankasGet` SERVER-KE-SERVER. Dibalik (halaman investor
memanggil finance-api langsung) tidak boleh: finance-api tidak punya
`lib_sesi.php` dan seluruh aksinya terbuka — alamatnya berarti buku kas,
invoice, dan seluruh transaksi harian di HTML yang dibuka orang luar.

> **PLANNING PEMBAYARAN SUDAH PINDAH KE PANEL KAS KECIL** (2 September 2026,
> permintaan user). Halamannya sekarang `deploy/finance/kas/` → menu *Planning
> Pembayaran*, kunci izin **`finance`** — bukan `brankas` lagi. Seluruh
> keterangan bentuk lembar di bawah tetap berlaku, cuma letaknya yang berbeda.
> Rinciannya di bagian **Planning Pembayaran: layar di Kas Kecil, data di
> Brankas** sesudah blok ini.

**Planning Pembayaran berbentuk LEMBAR per tanggal** (28 Agustus 2026), menyalin
lembar Excel pembayaran mingguan: satu `batch` (tanggal bayar) berisi baris yang
dikelompokkan per rekening pembayar, dengan subtotal tiap kelompok.

- **Kelompok rekening DIHITUNG dari kolom `dari`, bukan diketik.** Di Excel judul
  kelompok cuma teks; baris yang nyasar ke kelompok salah tidak pernah ketahuan.
- **Penerima / bank / nomor rekening DIBACA dari Daftar Kontak Vendor di modul
  Purchasing**, tidak disalin. Nomor yang dibetulkan di sana harus langsung
  berlaku di sini — salinan berarti yang mentransfer memakai nomor lama tanpa
  satu pun tanda.
- **`bukti` menyimpan `{ok, at, by}`**, bukan boolean. Centang tanpa jejak tidak
  bisa diaudit, padahal justru kolom itu yang membuktikan uang keluar.
- **`byBayarGrup()` menandai satu kelompok rekening sekaligus** dan menyebut saldo
  sesudahnya. Orang menekan kirim di m-banking sekali untuk beberapa transfer;
  menandainya satu per satu membuat sebagian tertinggal tanpa disadari.
- **Satu lembar isian `.qa-sheet`, bukan form berlabel** (28 Agustus 2026,
  permintaan user). Kepala kolom (`.hd`), baris yang diketik (`.cel`), keterangan
  vendor (`.qa-note`, membentang `1/-1`), dan baris draf (`.qa-sel`) adalah sel di
  **grid yang sama** — jadi kolomnya tidak bisa melenceng satu sama lain.
  Percobaan sebelumnya memakai tiga wadah terpisah dengan lebar disalin tangan,
  dan lebar yang disalin pasti melenceng: judul kolomnya berhenti berada di atas
  kotak yang dimaksudnya. **Enter menambah ke draf.**
- **Kotaknya tidak bergaris sendiri** — yang memisahkan kolom adalah garis
  lembarnya, seperti Excel. Enam kotak bergaris masing-masing membaca sebagai
  enam benda terpisah, padahal yang sedang diisi satu baris ("terlalu kaku",
  koreksi user). Di bawah 860px grid jadi satu kolom dan tiap sel draf menulis
  judul kolomnya sendiri lewat `data-l` — tanpa itu barisnya menumpuk jadi
  deretan angka tanpa keterangan.
- **`DRAF` dikumpulkan dulu, disimpan SEKALI** (`bySimpanDraf`). Menyimpan per
  baris berarti 20 penulisan blob penuh + 20 gambar ulang halaman untuk satu
  lembar; dan kalau yang kesepuluh gagal, sembilan sudah masuk sementara sebelas
  belum, tanpa satu pun tempat yang mengatakan sampai mana. Gagal simpan
  **mengembalikan `BK.data.bayar` DAN drafnya** — baris yang tertinggal di layar
  padahal server tidak menerimanya adalah kegagalan paling mahal di halaman ini.
- **Draf hidup di peramban saja**, dan itu dikatakan di layar + ditahan
  `beforeunload` + konfirmasi saat pindah halaman (`go()` — perpindahan di dalam
  satu halaman tidak pernah sampai ke `beforeunload`). **Sengaja TIDAK ke
  localStorage**: draf yang bertahan berhari-hari di satu perangkat akan disimpan
  orang lain di perangkat lain tanpa tahu isinya sudah basi, dan uang keluar dua
  kali.
- **Kategori & rekening TIDAK dikosongkan sesudah baris masuk** (`QA.cat`,
  `QA.dari`), dan kursor kembali ke kotak Vendor (`QA.fokus`). Keduanya di luar
  DOM karena render di modul ini TOTAL — halaman digambar ulang tiap simpan,
  jadi apa pun yang cuma ada di DOM ikut hilang. Tanpa keduanya, menuangkan 20
  baris berarti dua pilihan + satu klik yang diulang 20 kali.
- **Vendor DIKETIK lewat `<datalist>`**, bukan dipilih dari `<select>`. 36 vendor
  di dropdown berarti menggulir untuk nama yang sudah diketahui sebelum kotaknya
  dibuka. Nama di luar master **tidak ditolak** — baris tanpa vendor memang ada
  di lembar Excel — tapi **dikatakan** di baris bawahnya, supaya salah ketik satu
  huruf tidak lolos diam-diam sebagai vendor baru. Yang tersimpan adalah yang
  DIKETIK; mencocokkannya ke master lalu menimpanya berarti ejaan yang beda tipis
  diganti tanpa yang mengetiknya tahu.
- **Tanggal lembar = tujuan baris berikutnya**, satu kendali. Sempat dua (dropdown
  batch di satu kartu, kotak tanggal di form), dan yang mengisi harus menebak mana
  yang menentukan.
- **Lembar berjalan = tanggal TERBARU, DIHITUNG bukan ditandai.** Tanggal baru
  otomatis mengarsipkan yang sebelumnya (permintaan user). Penanda yang harus
  diperbarui manual akan melenceng, dan lembar minggu lalu yang lupa ditandai
  terus menerima baris minggu ini tanpa satu pun tanda.
- **Lembar arsip tidak langsung menerima baris baru** — stripnya disembunyikan,
  diganti penjelasan + tombol ke lembar berjalan. Menambah ke sana tetap mungkin
  (`byPaksaArsip()`) tapi harus diminta, dan izinnya **berlaku satu lembar saja**:
  kalau menetap, lembar arsip berikutnya ikut terbuka untuk diisi tanpa ada yang
  memintanya. Bukti TF & status bayar di arsip TETAP bisa diubah — pembayaran
  minggu lalu sering baru dikonfirmasi minggu ini.
- **Chip arsip menyebut sisa yang belum terbayar** (`3 belum`). Mengarsipkan yang
  belum selesai persis begitulah pembayaran terlupakan: lembarnya turun dari layar
  dan tidak ada satu pun tempat yang menyebut masih ada sisa.
- Master vendor yang mati **tidak mematikan halaman** — nominalnya tetap terbaca,
  cuma kolom penerima yang kosong, dan itu dikatakan.

"Rekening Pribadi - Mandiri" di lembar Excel adalah **rekening Mandiri yang sama**
(ditegaskan user 28 Agustus 2026), bukan wadah terpisah — jadi tidak ada wadah
"pribadi", dan saldonya memang kas perusahaan.

### Planning Pembayaran: layar di Kas Kecil, data di Brankas (2 Sep 2026)

Permintaan user: "planning pembayaran yang berada di modul brankas saya ingin
pindahkan ke modul kas kecil saja". Yang pindah **layarnya**; **datanya tetap
di `bk_state`**, dan pemisahan itu yang harus dijaga.

**Kenapa datanya tidak ikut pindah.** Baris pembayaran berstatus `paid`
MENGURANGI saldo wallet di `saldoSemua()` panel Brankas. Memindahkan datanya
keluar berarti halaman Saldo di sana kehilangan hitungannya, dan yang
menggantikannya cuma ketergantungan yang arahnya terbalik — plus satu migrasi
data produksi yang bisa tertinggal.

| | di mana |
|---|---|
| layar & lembar isian | `deploy/finance/kas/` (kunci `finance`) |
| data `bayar` | `bk_state` di `finance-mysql`, bersama sisa blob brankas |
| saldo wallet yang menguranginya | halaman Saldo panel Brankas |

**Kas Kecil MEMBACA lewat `brankasGet`, MENULIS lewat `bayarSave`.** Bedanya
menentukan: `brankasSave` menulis SELURUH blob, jadi dua panel yang sama-sama
memakainya akan saling menimpa — panel yang menyimpan belakangan menghapus
mutasi atau pengembalian modal yang baru dicatat di panel sebelah, **tanpa satu
pun galat**. `brankas_bayar_simpan()` membaca blob dulu, mengganti hanya kunci
`bayar`, lalu menulis kembali lewat `brankas_simpan()` — jadi penyaringan kunci
tetap dikerjakan satu tempat.

Membacanya sengaja tetap `brankasGet`: halaman ini memang perlu seluruh state
untuk menghitung saldo wallet, dan user memutuskan (2 September 2026) bahwa
pemegang Kas Kecil boleh melihat saldo rekening perusahaan. **Itu melonggarkan
pemisahan `brankas` vs `finance` yang dulu dibuat sengaja** — kalau suatu hari
harus diketatkan lagi, yang perlu diubah `muatBayar()` di kas, bukan aksinya.

Yang lain yang perlu dijaga:

- **`bayar` WAJIB tetap ada** di daftar kunci `brankas_simpan()` dan di bentuk
  kosong `brankas_baca()`. Mencabutnya "karena halamannya sudah tidak di sana"
  membuang seluruh rencana pembayaran pada penyimpanan berikutnya, dan saldo
  wallet naik sendiri sebesar yang sudah terbayar.
- **`saldoSemua()` di kas dibangun di atas `rkHitung()` milik panel itu**, bukan
  disalin dari `aktGrup()` brankas. Keduanya sudah berkas kembar; menyalinnya
  sekali lagi berarti TIGA rumus untuk satu angka.
- **Dimuat MALAS** — `BK` & master vendor baru diambil saat menunya dibuka.
  Panel ini sudah menarik tiga sumber saat boot.
- **Penjaga draf ikut pindah** (`beforeunload` + konfirmasi di `go()`). Kalau
  tertinggal di panel lama, Brankas melempar `ReferenceError` tiap tab ditutup
  DAN Kas Kecil membuang 20 baris yang belum tersimpan tanpa peringatan.

```bash
node tools/uji-bayar-kas.js   # 98 pemeriksaan, jsdom + kompas/finance/stock tiruan
```

84 di antaranya **diiris apa adanya** dari `uji-brankas.js` — yang berpindah
halamannya, bukan aturannya, dan angkanya keluar sama persis sesudah pindah.

**Backend menumpang `finance-mysql`** (tabel `bk_state`, `bk_akses`, `bk_peran`),
bukan backend sendiri: tabelnya lahir sendiri lewat `brankas_pastikan()`, jadi
tidak ada database baru yang harus dibuat manual di cPanel dan tidak ada berkas
migrasi yang bisa tertinggal di produksi. Datanya blob satu baris — boleh karena
yang menyunting cuma CFO; kalau suatu hari dibuka untuk banyak orang, inilah yang
pertama harus dipecah.

**Blobnya DISARING daftar kunci tertutup di `brankas_simpan()`, dan itu satu-
satunya tempat yang memutuskan apa yang bertahan.** Kunci yang dipakai
`BK.data` tapi tidak disebut di sana hilang **tanpa satu pun galat**: server
tetap membalas `ok`, layar menggambar ulang dari memori sehingga barisnya
kelihatan sudah masuk, dan baru lenyap saat halaman dimuat ulang. Kejadian
2 September 2026 — `mutasi` tidak ada di daftar itu sejak panel ini lahir, jadi
seluruh Mutasi & Transfer Wallet hilang tiap refresh sementara 190 pemeriksaan
`uji-brankas.js` tetap hijau (servernya di sana tiruan, jadi ia cuma bisa
melihat apa yang DIKIRIM frontend, bukan apa yang DITULIS PHP). Kunci baru
wajib ditambahkan di **dua** tempat: daftar `foreach` itu, dan bentuk kosong di
`brankas_baca()`. Sekarang keduanya dibandingkan dengan daftar di `muatSemua()`
lewat uji yang membaca ketiga sumbernya — bukan menyalinnya.

Hak aksesnya matriks halaman × role yang **sama persis** dengan panel Kas Kecil
dan modul Reservasi (None/Lihat/Ubah). Bawaannya PENUH untuk `staf` — permintaan
user "masuk langsung full akses dulu, tapi ada kelola akses per role".

Ujinya:

```bash
node tools/uji-brankas.js    # 114 pemeriksaan, jsdom + finance/kompas/account tiruan
                             # (84 pemeriksaan lembar pembayaran pindah ke uji-bayar-kas.js)
```

**`kompas` sudah bukan modul.** Sejak 11 Agustus 2026 ia masuk ke `finance`
sebagai panel `omset`; `deploy/kompas/index.html` tinggal halaman pengalih
(alamat lama sudah tersebar sebagai pintasan di HP kasir). Kunci izinnya tetap
`kompas` — dua panel, dua kunci, supaya kasir yang mengisi omset tidak dengan
sendirinya melihat kas kecil perusahaan.

Konsekuensi yang paling sering menggigit: **seluruh jalur relatif di kedua
panel itu `../../`, bukan `../`** (`../../account-api-mysql/api.php`,
`../../assets/`, `location.replace('../../')`). Yang tertinggal satu tingkat
tidak melempar — ia memulangkan halaman 404 server, dan yang sampai ke layar
cuma "balasan bukan JSON".

`jadwal` (Jadwal Shift, Agustus 2026) dan `dw` (Daily Worker, Agustus 2026)
adalah dua modul yang **tidak** memakai pola `save()` kirim-seluruh-state: tiap
divisi punya head sendiri yang menyusun jadwal minggu depan di waktu berdekatan,
jadi blob satu baris membuat head yang menyimpan belakangan menghapus kerja head
lain tanpa error. Penulisannya granular per baris — `simpanSel` di jadwal,
`simpanAjuan`/`putusAjuan` di dw. Jangan "rapikan" kembali jadi `saveAll`.

### Pengakuan Omset: "belum ditentukan" bukan pilihan ketiga (5 Sep 2026)

Keluhan user: *"kenapa ada yang menu belum ditentukan, padahal di sistem ada
tulisan menu sudah ditetapkan dan menu dipilih di tempat"*. Betul — pilihannya
memang cuma dua (`MENU_FIX` di `deploy/marketing/`). Yang ketiga adalah
**keadaan**, bukan pilihan: `menuFix` yang masih kosong.

Sebabnya **pertanyaan yang tidak pernah ditanyakan**. Kartu Pengakuan Omset
(`menuFixCard`) cuma ada di halaman DETAIL event, dan tidak satu pun yang
memaksa membukanya — jadi event yang dibuat lewat *Event Baru* lalu langsung
ditinggalkan lahir tanpa jawaban. Reservasi VIP tidak kena karena di sana ia
sudah wajib sejak awal (`f.jenis==='Assisted' && !menuFix(f)`).

Sekarang `newEvent()` ikut menanyakannya dan `submitNewEvent()` menolak yang
kosong. Yang perlu dijaga:

- **Bawaannya tetap KOSONG, jangan dijatuhkan ke salah satu.** `tetap` membuat
  kasir dipotong untuk acara yang tidak seharusnya; `ditempat` membuat omset
  marketing hilang dari pengakuan. Dua-duanya salah dengan cara yang tidak
  menimbulkan galat apa pun — sudah tertulis di komentar `MENU_FIX` sejak
  penanda ini lahir, dan itu masih berlaku.
- **Ditolak SEBELUM client baru dibuat.** Kalau pemeriksaannya di belakang,
  formulir yang ditolak sudah terlanjur melahirkan satu Lead di Database
  Client, dan Lead itu tinggal di sana tanpa ada yang tahu asalnya.
- **`NE_MENUFIX` hidup di luar DOM**, dan `setMenuFixBaru()` cuma menukar kelas
  tombol + teks bantuannya — bukan menggambar ulang modalnya. Menggambar ulang
  menghapus Nama Event & client yang sudah diketik. Polanya disalin dari
  `setMenuFixVip()`.
- **Daftar event menandai yang belum menjawab** (`menuFixChip`), dan HANYA yang
  belum. Sebelumnya penandanya cuma ada di kartu detail dan di pita Breakdown
  milik Finance — jadi orang yang harus memutuskannya tidak punya satu pun
  layar yang menunjukkan event mana saja yang menunggu.
- **Event lama tetap kosong**, dan itu benar: menebaknya adalah keputusan
  tentang uang yang tidak pernah diambil siapa-siapa. Dibetulkan satu per satu
  lewat chip di daftar event → kartu Pengakuan Omset.
- Di Finance yang kosong tetap **diperlakukan seperti `tetap`** (kasir tetap
  dipotong — kalau tidak, omsetnya terhitung dua kali), dan justru karena
  diam-diam begitu, ia **wajib disebut** di pita barisnya.

**PAYMENT GROUP — keputusan finance untuk baris yang menunya belum ditentukan**
(5 September 2026, permintaan user). Kekosongan itu dulu diperlakukan
diam-diam seperti `tetap`; sekarang ia punya kotaknya sendiri di baris
Breakdown. Dicentang = tamunya bayar sebagai satu grup (omset diakui
marketing, kasir shift dipotong); tidak = bayar sendiri-sendiri di meja
(omsetnya tetap milik kasir, tombol potongan tidak muncul).

- **Bawaannya TRUE** (`payGroupRow()` = `r.payGroup!==false`), dan itu bukan
  kelalaian: itulah persis perilaku yang sudah berjalan. Bawaan false
  MENCABUT potongan dari seluruh baris lama begitu halamannya dibuka lagi —
  omsetnya lalu terhitung dua kali, tanpa satu pun galat.
- **Hanya berlaku saat `menuFix` KOSONG.** Kalau marketing sudah memutuskan,
  keputusan merekalah yang menang — dua tempat yang menjawab pertanyaan yang
  sama akan berselisih suatu hari, dan yang selisih itu uang.
- **Bunyinya dibedakan** dari "menu dipilih di tempat": yang memeriksa kenapa
  kasirnya tidak dipotong perlu tahu itu keputusan marketing atau finance.

```bash
node tools/uji-menufix.js   # 26 pemeriksaan, jsdom (marketing + omset)
```

### Bonus Marketing: empat skema di Performa Marketing (7 Sep 2026)

Permintaan user. `deploy/finance/kas/` → **Performa Marketing**, meniru bentuk
Performa Kasir: satu baris tiga kotak posisi sekarang, lalu tangganya sebagai
tabel. **Skema 1+2+3 diakumulasi jadi satu angka rupiah; Skema 4 berdiri
sendiri** karena bentuknya voucher, cuti, dan penghargaan — menjumlahkan
voucher F&B ke rupiah bonus membuat angka yang TIDAK BISA DICAIRKAN tampak
seperti uang yang bisa, dan yang menyiapkan pembayarannya tidak punya cara
membedakannya lagi.

| | isinya | dasarnya |
|---|---|---|
| Skema 1 | pool TIM dari event corporate, dibagi per PIC | nilai tiap event |
| Skema 2 | tangga per PIC | realisasi PIC itu |
| Skema 3 | tangga total omset TIM; leader beda nominal | realisasi seluruh tim |
| Skema 4 | voucher F&B, cuti, Top Marketer | per event & realisasi |

**Keputusan user yang TIDAK bisa ditemukan ulang dari dokumen SDM-nya**, dan
tiap-tiapnya menggeser uang:

- **Dasarnya "Diakui" (omset + tax + service)**, bukan omset polos — kolom yang
  sama dengan kartu Realisasi. Per PIC memakai `real`, yang SUDAH dipotong
  compliment: compliment mengurangi omset yang diakui, jadi ia harus ikut
  mengurangi tangganya. Kalau tidak, kartu Realisasi dan kartu bonus di layar
  yang sama bercerita lain tentang bulan yang sama.
- **Skema 1 butir 1 & 2 AMBIL YANG TERTINGGI** ("salah satu dari target
  berikut"); butir 3 & 4 **per event dan boleh berulang**, tapi tiap event
  dihitung SEKALI di tangga tertingginya — event Rp75 juta memberi Rp500.000,
  bukan Rp500.000 + Rp300.000.
- **Pembagi pool Skema 1 = PIC yang punya event bulan itu**, bukan seluruh
  roster. Roster ini tumbuh sendiri dari Tim/Keterangan Office dan rutin
  menyimpan nama yang sudah pindah tim; dibagi ke seluruh roster, satu baris
  yang tertinggal mengecilkan bonus SEMUA orang tanpa satu pun tanda. Angkanya
  karena itu selalu disebut di layar.
- **Skema 2 memakai SELURUH event PIC itu**, bukan yang corporate saja.
- **Skema 3 diterima seluruh PIC di roster**, termasuk yang bulan itu belum
  punya event — yang dinilai capaian TIM. Itu uang untuk orang yang tidak
  menangani apa pun, jadi **dikatakan di kartunya**, bukan didiamkan.

**TANGGA DOKUMENNYA BERLUBANG DAN TUMPANG TINDIH**, dan keduanya diputuskan di
satu tempat (`MK_S2`), **memihak PIC**:

| | dokumen | diputuskan |
|---|---|---|
| tumpang tindih | "Rp120–150 jt" vs "Rp150–200 jt" | tepat Rp150.000.000 → yang lebih besar |
| celah | "Rp150–200 jt" lalu "Rp201–250 jt" | Rp200.000.001–Rp201.000.000 → tangga di atasnya |
| Skema 3 | batasnya bersentuhan | yang tepat di batas → tangga lebih besar |
| Skema 3 | tertulis "Rp 4.00.0000" | salah ketik, dibaca **Rp4.000.000** |

Tangga yang berlubang membuat omset yang **NAIK** bisa **menurunkan** bonus,
dan tidak ada seorang pun yang bisa menjelaskan itu kepada yang menerimanya.
Yang ditulis di kolom Syarat pada tabel di layar adalah `min` di kode, bukan
kalimat dokumennya — supaya yang dibaca sama persis dengan yang dihitung.

**"EVENT CORPORATE" BARU BISA DIBACA SEJAK TANGGAL INI.** Jenis event
(`detail.jenis` di modul Marketing — `EVENT_TYPES`, 'Corporate Event') tidak
pernah sampai ke Finance. Sekarang ikut sebagai **`srcJenis`** di baris
breakdown marketing, dan **DISEGARKAN tiap render** persis seperti `menuFix` —
bukan cuma diisi saat barisnya lahir. `sudahAda()` melewati baris lama, jadi
tanpa penyegar itu bonus corporate bulan-bulan lama hilang **tanpa satu pun
galat**, dengan jumlah event yang tetap kelihatan wajar.

- **VIP dan baris manual memang tidak punya jenis, dan itu benar** — Reservasi
  VIP bukan event corporate. Yang kosong **TIDAK ditebak**; jumlahnya
  **dilaporkan di kartu Skema 1** berikut cara membetulkannya (buka Breakdown
  Sumber sekali pada tanggalnya).
- `srcJenis` **berkas kembar**: nama kuncinya di `deploy/finance/omset/` harus
  sama persis dengan yang dibaca `deploy/finance/kas/`. Beda satu huruf tidak
  melempar — barisnya cuma berhenti jadi corporate.

**PENERIMA BONUS LEADER DIBACA DARI Tim/Keterangan DI OFFICE** (permintaan
user): tulis **Head** di keterangan orangnya, di samping **Marketing**. Sengaja
TIDAK ada setelan terpisah — setelan kedua untuk fakta yang sudah tercatat di
Office pasti menyimpang darinya suatu hari, dan yang menyimpang di sini
selisihnya sampai Rp2.250.000 sebulan untuk satu orang.

**KATANYA "Head", BUKAN "Leader"** (keputusan user 7 September 2026). Sempat
dua kata berbeda: *Leader* untuk Bonus Leader, *Head* untuk hak melihat seluruh
tim di modul Marketing/Event. Dua penanda untuk satu jabatan yang sama pasti
menyimpang — orang yang ditandai Leader saja akan menerima bonusnya tapi tidak
bisa membuka daftar timnya, dan tidak ada satu pun layar yang bisa menjelaskan
kenapa. Sekarang satu kata untuk keduanya, satu fungsi: `pbHead()` di
`deploy/assets/performa-bonus.js`, diekspor ke `window` justru supaya tuan
rumah memakai penentu yang SAMA.

- **KOLOMNYA TETAP BERNAMA "Bonus Leader".** Itu nama di dokumen SDM-nya;
  mengganti nama baris bonus membuat layar berhenti bisa dicocokkan dengan
  dokumen yang dipegang orang. Yang berubah PENANDANYA di Office, bukan nama
  bonusnya.
- **Kata "Leader" TIDAK lagi dikenali**, dan itu disengaja — dua kata yang
  sama-sama berlaku mengembalikan persis masalah yang baru ditutup. Yang
  keterangannya terlanjur "Leader" terbaca sebagai BUKAN head, dan kartunya
  **mengatakannya**: *"Kata yang dicari Head, bukan 'Leader' — kalau
  keterangannya sudah terlanjur ditulis Leader, gantilah."*
- **Kata UTUH, bukan potongan**: "Overhead" dan "Headhunter" tidak boleh
  membuat orang jadi head. Diuji.
- **"Office belum menjawab" DIBEDAKAN dari "Head belum ditentukan"**
  (`info.ketAda`). Bentuk datanya identik — `headIds` kosong — tapi yang
  pertama menyuruh MENUNGGU dan yang kedua menyuruh MENYUNTING Office. Kalimat
  yang salah menyuruh orang membetulkan sesuatu yang sudah benar.
- **Lebih dari satu Head juga dikatakan**, berikut nama-namanya.

**`ketKasir()` diganti nama jadi `ketOffice()`** — isinya tidak pernah khusus
kasir, dan nama yang menyempit begitu membuat pemakai berikutnya menyalinnya
jadi fungsi kedua. Dua pembaca `KET_MAP` akan menyimpang begitu bentuk
keterangan Office berubah.

```bash
node tools/uji-bonus-marketing.js   # 101 pemeriksaan, TANPA jsdom
```

Ujinya **memotong fungsinya dari sumber** lalu menjalankannya — seluruh
hitungan bonus di halaman ini fungsi murni yang memulangkan angka atau string
HTML, tidak satu pun menyentuh DOM. Yang dijaga bukan angka hasil salinan
melainkan **INVARIAN**: bonus tidak boleh pernah TURUN waktu omsetnya NAIK,
disapu Rp1 juta sekali sampai Rp600 juta plus tiap titik batas dan tetangga
persisnya. Tangga berlubang gagal di situ tanpa perlu ada yang hafal batasnya.
Tujuh mutasi sudah dicoba dan ketujuhnya tertangkap.

`smoke-modul.js` **tidak menyentuh `finance/kas` sama sekali** — daftarnya cuma
memuat `finance`, halaman pemilih panel. Uji di atas satu-satunya yang pernah
menjalankan hitungan bonus ini.

### Realisasi dipajang sebagai TAGIHAN, & Dashboard naik ke atas (6 Sep 2026)

Dua permintaan user di panel Kas Kecil.

**1. Grup menu `Dashboard` (Dashboard Omset + Analytics) naik ke paling atas
sidebar.** Dua halaman itu dibuka untuk MELIHAT, sisanya untuk MENGISI.
Urutan menu di sini **tidak** menentukan halaman default — yang menentukan
`halPertamaBoleh()`, dan ia membaca urutan `TITLES`, bukan urutan DOM. Jadi
Buku Kas Kecil tetap yang terbuka tiap pagi.

**2. Kartu Realisasi memajang TAGIHAN** (net + service + pajak), bukan net —
angka yang benar-benar dibayar tamu, sama persis dengan **Dibayar Tamu** di
Rekap Penjualan. Yang perlu dijaga:

- **`real` (net) TIDAK diganti, cuma didampingi `realTagihan`.** Net tetap
  dasar Rasio Komposisi, ATV, dan persentase Self Order. Menggantinya diam-
  diam menggeser ketiganya tanpa satu pun label ikut berubah, dan Rasio
  Komposisi malah berhenti berjumlah 100%.
- **Catatan di layar WAJIB, bukan hiasan.** Halaman itu sekarang memajang dua
  angka omset sekaligus; tanpa kalimat yang menyebut angka net-nya, yang
  membandingkan keduanya akan mengira salah satunya salah — persis keluhan
  yang melahirkan kartu Jembatan di modul Analytics.
- **Lembar PDF & ringkasan WhatsApp ikut**, lewat `RINGKAS_OMSET`. Aturan
  "laporan memakai HASIL YANG SAMA dengan layar" sudah tertulis di komentarnya
  sejak lama. Label lama `Realisasi (net)` di lembar cetak DIGANTI: lembar yang
  menjanjikan net tapi memuat tagihan beredar tanpa layarnya.
- **`bulan.tagihan` berkas kembar dengan `realTagihan`**, dan `bReal` di
  `deploy/finance/omset/` berkas kembar dengan keduanya. Dua panel yang
  memajang "Realisasi Bulan Ini" dengan dasar berbeda adalah selisih yang baru
  ketahuan waktu ada yang membuka dua layar.
- **Jembatan di Analytics IKUT DIPERBARUI**: baris Dibayar Tamu sekarang
  menunjuk "Rekap Penjualan & Dashboard Omset", dan baris net menunjuk
  pemakainya yang sebenarnya. Menunjuk layar yang salah lebih buruk daripada
  tidak menunjuk sama sekali.

```bash
node tools/uji-realisasi-tagihan.js   # 25 pemeriksaan, jsdom
```

**`smoke-modul.js` TIDAK MENYENTUH `finance/kas` maupun `finance/omset`** —
daftarnya cuma memuat `finance`, yaitu halaman PEMILIH panel yang tidak berisi
aplikasi apa pun. Seluruh Dashboard Omset selama ini lolos tanpa satu baris pun
dijalankan. Uji di atas yang menutupnya; jangan mengandalkan smoke di sini.

#### Mode harian tidak lagi memajang angka sebulan, & logo baru (15 Sep 2026)

Dua permintaan user di Dashboard Omset.

**1. Kartu "Realisasi Bulan Berjalan" DICABUT DARI LAYAR** (*"jika di pilih
tanggal harian, tidak perlu menampilkan omset bulannya karna sudah terfilter
harian"*). Ia dulu digambar HANYA di mode harian, dengan alasan yang masuk
akal — di mode bulanan angkanya sama persis dengan kartu Realisasi di atas.
Yang tidak terpikir waktu itu: di mode harian pun ia **membantah pemilih
tanggalnya sendiri**. Layar yang saklarnya berbunyi *Harian* dan tanggalnya
satu hari memajang angka sebulan sebagai kartu setara di bawahnya, dan
dua-duanya tampak wajar.

- **`bulan` TETAP DIHITUNG dan tetap masuk `RINGKAS_OMSET`.** Lembar PDF dan
  ringkasan WhatsApp masih memakainya, dan di sana ia memang berguna:
  penerima pesan tidak punya saklar bulanan untuk diklik. Aturan *"laporan
  memakai HASIL YANG SAMA dengan layar"* **tidak dilanggar** — yang dijaganya
  SATU perhitungan untuk satu angka, bukan daftar isi yang identik.
- **Jangan membuang `bulan` dari `viewBulanan()`** kalau suatu hari blok
  bulanan di laporan ikut dicabut. Yang perlu disentuh `waDashboardOmset()`
  dan `cetakDashboardOmset()`, yang dua-duanya membaca `r.bulan`; dibuang di
  sini, keduanya jatuh dengan **TypeError** — bukan sekadar kehilangan satu
  baris. Dijaga asersi tersendiri.
- **Yang dijaga uji ANGKANYA, bukan judul kartunya.** Judul bisa diganti
  sementara angkanya tetap berdiri di kartu lain, dan yang membaca layar
  bertanya tentang angka. Data ujinya dipilih supaya keduanya tidak mungkin
  tertukar: 1 Agustus bertagihan Rp152.000.000, sebulan Rp259.000.000.

**2. Logo Laksamana Muda diganti** ke `deploy/assets/laksamana-muda.png`.
Yang lama `LaksamanaMudaLogo.jpeg` **JPEG berlatar putih OPAK**, jadi di atas
latar apa pun yang bukan putih ia tampil sebagai kotak putih; yang baru PNG
transparan, dan taglinenya emas — bukan hitam.

- **Dikecilkan ke 512x512 (41 KB)** dari 4500x4500 (385 KB). Ia digambar 52 px
  di kop lembar PDF dan 32 px sebagai favicon; berkas sepuluh kali lipat
  kebutuhannya ikut terunduh tiap halaman dibuka. Ukurannya dikunci uji
  (< 120 KB) berikut keberadaan kanal alpha-nya — PNG tanpa alpha
  mengembalikan persis kotak putih yang baru saja ditutup.
- **Baru dipakai di `deploy/finance/kas/`** (favicon + kop lembar PDF), sesuai
  lingkup permintaannya. **17 tempat lain masih memakai logo lama** — kalau
  suatu hari disapu, `deploy/assets/laksamanamuda-warna.jpg` dan
  `LaksamanaMudaLogo.jpeg` yang perlu dicari.

- **LOGONYA HARUS TAMPIL DI LAYAR, dan itu terlewat di putaran pertama.**
  Favicon dan kop lembar PDF dua-duanya benar, tapi **tidak satu pun dari
  keduanya kelihatan di halaman**: yang berdiri di sidebar sejak modul ini
  lahir adalah **kotak emas berhuruf F**, bukan logo Laksamana. Jadi logonya
  sudah diganti, layarnya tidak berubah sedikit pun, dan yang melaporkannya
  menyebut logonya *"masih kosong"*. Sekarang kotak itu diganti
  `deploy/assets/laksamana-mark.png`.
- **YANG DI SIDEBAR TANDA KAPALNYA SAJA, bukan logo penuh.** Slotnya 38px dan
  **tetap 38px di mode `nav-mini`** (sidebar menyusut 72px, seluruh teks brand
  disembunyikan) — logo penuh berikut wordmark-nya tidak akan terbaca di
  sana sama sekali. Wordmark-nya toh sudah berdiri sebagai teks di sebelahnya.
  Tandanya dipotong dari `Logo.png` lewat kotak-batas kanal alphanya, lalu
  ditengahkan di kanvas persegi — potongan persegi langsung dari tengah logo
  ikut menyeret potongan wordmark di bawahnya.
- **Uji DOM, bukan uji sumber.** Rujukan yang benar di berkas tidak
  membuktikan ada gambar yang benar-benar digambar; asersi sumber di putaran
  pertama hijau seluruhnya untuk layar yang tidak berubah apa pun. Yang
  menjaganya sekarang `document.querySelector('.brand img.logo')`.

```bash
node tools/uji-realisasi-tagihan.js   # 51 pemeriksaan (dari 27)
```

Tujuh mutasi dicoba, ketujuhnya tertangkap.

> **KOMENTAR HTML DI DALAM TEMPLATE LITERAL IKUT TERKIRIM KE `innerHTML`**,
> dan itu menggigit dua kali saat perubahan ini ditulis. Pertama: asersi
> *"kartu Realisasi Bulan Berjalan tidak digambar"* MERAH untuk kode yang
> benar — yang cocok komentar penjelasnya sendiri, yang menyebut nama kartu
> itu. Kedua, dan ini yang mematikan: komentar itu memuat **backtick**, yang
> MENUTUP template literal-nya dan menjatuhkan SELURUH panel dengan
> SyntaxError. Penjelasan panjang karena itu ditaruh sebagai komentar JS di
> luar literalnya; yang di dalam cuma satu baris penunjuk. Jangan sekali pun
> menulis backtick atau `${` di komentar yang berada di dalam template
> literal.

#### Daftar Event berhalaman (7 September 2026)

Permintaan user. **LIMA baris per halaman** (`PF_PER_HAL`), sengaja BEDA dari
`KS_PER_HAL=12` milik Riwayat Performa Kasir. Sempat 12 dengan alasan "dua
tabel bersebelahan jangan beda panjang halaman"; **alasan itu keliru** —
keduanya di HALAMAN yang berbeda dan tidak pernah berdiri bersebelahan, jadi
tidak ada yang bisa membandingkannya. Yang nyata: kartu ini berdampingan dengan
grafik *Omset per Event* dan di atas empat kartu skema bonus, dan dua belas
baris membuatnya jauh lebih tinggi daripada grafik di sebelahnya.

- **Tabelnya digambar ke wadahnya sendiri (`#pf_daftar`), BUKAN ke `#pf_body`.**
  Kartunya berdiri bersebelahan dengan grafik *Omset per Event* dan di atas
  empat kartu skema bonus; kalau `pf_body` ikut digambar ulang tiap klik, Chart.js
  membangun ulang grafiknya dan gulir melompat kembali ke atas halaman. Jebakan
  yang sama persis sudah dibayar di pager Riwayat — lihat komentar `gambarRiwayat()`.
- **`PF_HAL` global, bukan di dalam `viewPerforma`** — kalau tidak, ia lahir
  ulang jadi 1 tiap kali hanya tabelnya digambar ulang.
- **YANG DIPOTONG HANYA TAMPILANNYA.** `a.events` tetap utuh, dan itu yang dibaca
  `cetakAchievement()` maupun `bonusMarketing()`. Lembar PDF yang cuma memuat
  halaman yang kebetulan terbuka menghilangkan event dari report PIC-nya, dan
  bonus yang dihitung dari satu halaman jadi lebih kecil daripada yang berhak —
  dua-duanya **tanpa satu pun galat**. Ujinya menekan tombol PDF dari halaman
  TERAKHIR, tempat baris yang tampil paling sedikit.
- **Ganti PIC kembali ke halaman 1.** Bertahan di halaman 3 milik PIC sebelumnya
  memajang layar kosong pada PIC yang event-nya sedikit.

```bash
node tools/uji-pager-event.js   # 24 pemeriksaan, jsdom
```

Ujinya memakai PIC yang **sama-sama punya tiga halaman** saat menguji reset ganti
PIC. Itu satu-satunya urutan yang bisa membedakan: pindah ke PIC yang cuma punya
satu halaman membuat `PF_HAL` dijepit ke 1 oleh `gambarDaftar()` sendiri, dan
reset yang hilang tidak akan pernah kelihatan — versi pertama uji ini memang
meloloskan mutasi itu.

### Bonus Event: empat skema di Performa Event (7 Sep 2026)

Permintaan user, sehari setelah Bonus Marketing. Bentuk kartunya SAMA PERSIS
(satu baris tiga kotak posisi, lalu tangganya sebagai tabel) supaya yang
membuka dua halaman itu tidak perlu belajar dua cara membaca. Isinya berbeda,
dan bedanya yang harus dijaga.

| | isinya | dasar |
|---|---|---|
| Skema 1 | tangga dari omset TIAP event, nominal **/orang** | nilai event |
| Skema 2 | pool TIM dari **JUMLAH** event sebulan, dibagi tim | jumlah event |
| Skema 3 | voucher F&B per event — **tidak diakumulasi** | nilai event |
| Skema 4 | tangga per PIC dari total nilai omset sebulan | jumlah nilai event |

**SKEMA 1 + 2 + 4 diakumulasi; SKEMA 3 berdiri sendiri.** Penomorannya
**mengikuti dokumen SDM-nya**, jadi yang tunai memang tidak berurutan —
diurutkan ulang supaya rapi, yang memegang dokumennya akan mencari "Skema 3"
dan menemukan hal lain.

**DASARNYA NET (`amount` = kolom Nilai Event), BUKAN `porsi` — dan ini BEDA
dari Bonus Marketing**, yang memakai kolom Diakui. Dokumennya menyebutkan
sendiri: *"Angka dari nett (Sebelum tax & services)"*. Untuk event
`porsiPic()` cuma **separuh** nilai event (`amount/2 + Open Bill`), jadi salah
pakai membuat seluruh tangga praktis tidak pernah tercapai — dan angka yang
kecil terbaca sebagai bulan yang sepi, bukan sebagai bug. Ujinya menyertakan
`porsi` yang berbeda dari `amount` justru supaya salah pakai punya tempat
untuk muncul.

- **Potongan compliment SENGAJA tidak dikurangkan.** Akibatnya orang bisa
  menjumlahkan sendiri kolom Nilai Event di layar dan mendapat angka yang sama
  persis dengan dasar tangganya. Dasar bonus yang tidak bisa dicocokkan dengan
  tabel yang berdiri di layar yang sama adalah dasar yang berhenti dipercaya.
- **Tabelnya konstanta SENDIRI (`EV_*`), bukan memakai `MK_*`.** Tangga dan
  nominal Skema 4 event berbeda dari Skema 2 marketing walau bentuknya mirip;
  menyatukannya membuat satu perubahan diam-diam menggeser bonus divisi
  sebelah. Yang dipakai bersama cuma `mkTangga()` dan `MK_HI`.

**NOMINAL SKEMA 1 ITU PER ORANG, dan Office tidak menyimpan anggota tim
event.** Halaman ini menghitungnya untuk **PIC yang tercatat** di baris
breakdown — tidak ada angka lain yang bisa dipakai. Kalau timnya lebih dari
satu orang, yang dibayarkan angka itu **dikali jumlah orangnya**. Itu
**dikatakan di layar**, bukan cuma di komentar: total yang diam-diam berarti
"kalau timnya satu orang" akan dipakai menyiapkan pembayaran apa adanya.
Kalau suatu hari perlu tepat, yang harus ditambah adalah kolom jumlah anggota
tim di modul Event — bukan tebakan di sini.

**Skema 2 dihitung dari JUMLAH event, bukan nilainya** — satu-satunya skema di
seluruh repo yang begitu, dan gampang "diperbaiki" jadi nilai oleh yang
membacanya sekilas. Bedanya juga dari Skema 1: yang ini **satu pool yang
dibagi**, bukan nominal per orang.

**TANGGA DOKUMENNYA BERLUBANG DI LIMA TEMPAT**, dan semuanya diputuskan
memihak tim — dimasukkan ke tangga **DI ATASNYA**, aturan yang sama dengan
`MK_S2`:

| skema | celah di dokumen |
|---|---|
| 1 | "Rp35–45 juta" lalu "Rp46–55 juta" → Rp45.000.001 naik |
| 1 | "Rp46–55 juta" lalu "> Rp56 juta" → Rp55.000.001 naik |
| 4 | Rp200–201, Rp250–251, Rp300–301 juta |

Tangga berlubang membuat omset yang **NAIK** bisa **MENURUNKAN** bonus, dan
itu tidak pernah bisa dijelaskan ke orang yang menerimanya. Label di layar
ditulis dari `min` di kode, bukan dari kalimat dokumennya.

**"Di atas Rp X" di Skema 3 dibaca HARFIAH (`> X`)**, beda dari Bonus
Marketing yang terpaksa membacanya `>= X` karena di sana satu ambang yang sama
ditulis dua kali dengan kata berbeda. Di dokumen event tidak ada tabrakan
seperti itu.

```bash
node tools/uji-bonus-event.js   # 76 pemeriksaan, TANPA jsdom
```

Ujinya memotong **KEDUA blok** (marketing + event) dari sumber: `mkTangga()`
dan `MK_HI` lahir di blok marketing dan dipakai bersama, jadi memotong yang
event saja berarti menulis ulang `mkTangga` di dalam uji — dan uji yang
menulis ulang rumus yang diujinya tidak menguji apa pun. Delapan mutasi sudah
dicoba dan kedelapannya tertangkap.

#### Kolom Realisasi di tabel tangga (7 September 2026)

Permintaan user, untuk TIGA tangga sekaligus: **Tangga Total Nilai Deal per PIC**
dan **Bonus Total Omset Team** di Performa Marketing, dan **Tangga Total Nilai
Omset per PIC** di Performa Event. Satu penggambar untuk ketiganya —
`selRealisasi(nilai, min, aktif)`. Letaknya **di kiri kolom bonus**, jadi
urutannya: syarat → realisasi → bonus.

**ISINYA BEDA PER BARIS, dan itu inti kolomnya:**

| baris | isinya |
|---|---|
| yang sedang berlaku | **angka realisasinya**, tebal + ✓ |
| di atasnya | *kurang Rp X lagi* untuk sampai ke sana |
| yang sudah terlewati | *terlampaui* — bukan diulang angkanya |

Kolom yang memajang angka yang sama di semua baris tidak menghapus satu pun
pekerjaan yang jadi alasan kolom ini ada: yang membacanya tetap harus
menghitung sendiri sudah di baris mana ia berdiri dan kurang berapa lagi.
Ujinya menjaga ketiga bentuk itu, bukan sekadar keberadaan kolomnya.

- **PIC yang belum masuk tangga tetap melihat angkanya**, di baris DASAR ("Di
  bawah Rp…"). Kalau hilang dari tabel, yang paling perlu tahu posisinya justru
  tidak melihat angkanya di mana pun.
- **`nilai` null di segmen "Semua PIC"** untuk kedua tangga PER PIC — memajang
  angka gabungan di tangga yang dinilai per orang berarti menjanjikan bonus yang
  tidak akan pernah diterima siapa pun. **Bonus Total Omset Team TIDAK null**:
  dasarnya memang angka tim, jadi kolomnya berlaku di kedua segmen.

### Reservasi: bukti DP WAJIB (6 September 2026)

Permintaan user: *"setiap input reservasi, jika dia masukin DP, wajib upload
foto buktinya — dibuat mandatory"*. Kotaknya sudah ada sejak lama tapi boleh
dilewati, dan yang terlewat baru ketahuan di halaman Dana Masuk berhari-hari
kemudian. DP tanpa lampiran adalah uang yang tidak bisa dicocokkan dengan
mutasi bank oleh siapa pun.

- **`adaBuktiDp()` satu tempat yang memutuskan**, dan ia membaca **dua bentuk**
  yang sama-sama sah: `dpProofData` (field datar, reservasi lama) dan
  `dps[].proofData` (cicilan, bentuk sekarang). Memeriksa salah satu saja
  membuat reservasi yang buktinya ada di bentuk satunya dianggap kosong.
- **Bukti yang SUDAH TERSIMPAN ikut dihitung.** Menyunting nama tamu tidak
  boleh menuntut berkasnya diunggah ulang — berkas itu di database, bukan di
  komputer yang sedang membuka form.
- **Reservasi LAMA yang DP-nya terlanjur tanpa bukti TIDAK DIKUNCI**, cuma
  ditanya sekali lewat `confirm()`. Menguncinya berarti data yang sudah
  terlanjur begitu tidak bisa dibetulkan siapa pun — termasuk nama tamu yang
  salah ketik — dan justru bukti itulah yang sedang diusahakan lengkap. Pola
  yang sama dengan kotak PIC event lama di modul Event.
- **Modal Tambah DP wajib TANPA pengecualian.** Cicilannya baru lahir saat itu
  juga, jadi tidak ada data lama yang bisa terkunci, dan yang mengetik
  nominalnya sedang memegang struknya.
- **Jalur Marketing (Reservasi VIP) sudah aman secara konstruksi**: di sana
  satu baris DP LAHIR dari satu berkas bukti (`vipBuktiList`), jadi DP tanpa
  bukti memang tidak bisa dibuat. Tidak ada yang perlu ditambahkan di sana.

```bash
node tools/uji-bukti-dp.js   # 25 pemeriksaan, jsdom
```

Modul Reservasi juga cuma "hanya boot yang diuji" di `smoke-modul.js`. Ujinya
menyisipkan `deploy/assets/venue-layouts.js` sebagai skrip inline menggantikan
tag `src`-nya — modul ini SENGAJA berhenti keras kalau denahnya tidak termuat,
dan yang dijalankan tetap berkas aslinya, bukan tiruan yang bisa menyimpang
dari koordinat sebenarnya. `SESSION` disetel langsung karena yang diuji jalur
SIMPAN, bukan gerbang SSO-nya — pola yang sama dengan `uji-kelola-user.js`.

### Input Omset Harian: siapa yang menginput (7 September 2026)

Permintaan user. **Memakai ULANG `tambahJejak()` / `jejakList()` /
`jejakHtml()`** yang sudah dipakai Report Daily di berkas yang sama sejak 11
Agustus 2026 — bukan mekanisme baru. Dua bentuk jejak di satu modul akan
menyimpang begitu salah satunya diperbaiki, dan yang mencari "siapa yang
mengisi" harus tahu lebih dulu ia sedang melihat halaman yang mana.

- **JEJAKNYA MENUMPUK** (`log[]`, 20 terakhir), bukan menimpa. Satu tanggal
  biasa disentuh lebih dari sekali: diisi malam itu, dikoreksi orang lain
  beberapa hari kemudian. Kalau yang tersimpan cuma yang terakhir, nama orang
  yang benar-benar mengetiknya hilang — dan justru itu yang dicari kalau
  angkanya bermasalah. Sebabnya konkret: 6 September 2026 ditemukan tax 23
  Agustus diketik `2.514` alih-alih `2.514.400`, dan tidak ada satu pun layar
  yang bisa menyebut siapa yang perlu ditanyai.
- **`jejakHtml(rec, kata)`** — Report Daily "Disubmit", Input Omset "Diinput".
  Bentuk dan riwayatnya tetap satu; yang berbeda cuma kata kerjanya, karena
  "disubmit" di halaman yang tombolnya berbunyi *Simpan Omset* membuat orang
  mengira ada langkah lain yang belum ia kerjakan. Bawaannya tetap
  `Disubmit`, jadi pemanggilan lama tidak berubah artinya.
- **Hari yang lahir sebelum ini tidak diklaim siapa pun.** Yang membukanya
  sekarang bukan yang mengisinya dulu; layarnya mengatakan jejaknya memang
  tidak ada, dan menyimpan ulang dicatat sebagai *yang mengubah*.
- **Aman dari kehilangan diam-diam**, dan itu sudah diperiksa: `save_all()` di
  `kompas-mysql` menulis blob apa adanya (`json_enc($state)`) tanpa daftar
  kunci tertutup — beda dari `brankas_simpan()`. Ketiga modul yang membaca
  `daily` (omset, kas, cashier) hanya MENAMBAH field yang kurang di
  `normalize`, tidak menyusun ulang objeknya, jadi `log` tidak dibuang. Hanya
  modul Omset yang MENULIS `daily` — beda dari `reports`, yang salinannya ada
  di Cashier juga.

```bash
node tools/uji-jejak-omset.js   # 21 pemeriksaan, jsdom
```

`smoke-modul.js` **tidak menyentuh `deploy/finance/omset/` sama sekali** —
daftarnya cuma memuat `finance`, halaman pemilih panel. Uji di atas adalah
satu-satunya yang pernah menjalankan `saveDaily()`.


### Analytics: Performa Talent — omset di JAM TAMPILNYA (11 September 2026)

Permintaan user: *"utk khususnya performa Band dan DJ (partner dengan MC DJ),
saya ingin kontribusi hadirnya band sama DJ itu kontribusi omsetnya tinggi atau
tidak, terus per masing masing performance juga begitu apakah kontribusinya
juga brp persen dari omset. ingat sesuai dengan jam nya."*

Halaman baru **Performa Talent** (kunci view `talent`), mempertemukan dua
sumber yang sebelumnya tidak pernah bertemu:

| | dari |
|---|---|
| jadwal talent | modul **Event** → Talent Schedule (`schedules` + `talents`) |
| omset per jam | berkas POS → **`hariJam[tgl][jam]`**, wadah baru |

#### Wadah baru `hariJam` — tanpa itu pertanyaannya tidak bisa dijawab

`jam[]` yang sudah ada **diringkas untuk sebulan penuh** dan `hari[]` tidak
punya dimensi jam, jadi tidak satu pun dari keduanya bisa menjawab *"jam 20
tanggal 2 berapa"* — dan itu persis pertanyaan yang dibawa jadwal talent.

**Menebaknya dari sebaran jam sebulan dikali omset harian terdengar masuk akal
dan SELALU salah dengan cara yang sama:** tiap malam jadi berbentuk identik,
sehingga penampil yang benar-benar menarik tamu dan yang tidak memulangkan
angka yang sama persis. Angka seperti itu tidak akan dipertanyakan siapa pun.

- **Diisi di BARIS YANG SAMA dengan `jam[]`**, dari `jm` yang sama. Dua tempat
  yang memutuskan jam sebuah baris akan menyimpang, dan yang menyimpang di sini
  membuat halaman ini menyebut angka lain daripada Sebaran per Jam untuk bulan
  yang sama.
- **Dibuang dengan aturan yang SAMA PERSIS dengan `hari[]`** untuk bulan
  sebelah — kalau tidak, halaman ini menghitung jam bulan lain sementara
  halaman lain tidak.
- **WAJIB ada di daftar kunci tertutup `anSimpanUnggah()`.** Itu tempat
  `paket`, `kategori`, dan `katMenu` tertinggal lima hari tanpa satu pun
  galat sementara 260 pemeriksaan tetap hijau; kunci baru lewat jalur yang sama
  persis. Ujinya mendorong berkas CSV lewat jalur unggah SUNGGUHAN, bukan
  menyuntikkan `hariJam` ke `AN.data.laporan`.
- **Laporan lama tidak punya `hariJam`**, dan halamannya mengatakan sebabnya
  berikut cara membetulkannya (unggah ulang) — dibedakan dari modul Event yang
  tidak menjawab, karena dua keadaan itu menuntut tindakan yang berbeda.

#### Jam yang diklaim satu penampilan

`talSlot()` memulangkan daftar `{tgl, jam}`.

- **Jam terakhir dihitung dari MENIT TERAKHIRNYA** (`m1 + durasi - 1`), bukan
  dari jam selesainya: 20:00–23:00 menempati jam **20, 21, 22** — bukan 23,
  karena pada pukul 23:00 ia sudah selesai. Dibaca sampai 23, tiap penampilan
  mencuri satu jam penuh milik penampil berikutnya.
- **Lewat tengah malam PINDAH TANGGAL**: 22:30–01:30 menempati jam 22 & 23 di
  tanggalnya sendiri lalu jam 0 & 1 di tanggal **berikutnya**. Di POS bill jam
  01:00 memang tercatat di tanggal berikutnya, jadi menagihkannya ke tanggal
  penampilan berarti membaca omset malam yang salah.
- **Jam yang tidak terbaca TIDAK DITEBAK** — menebaknya berarti menagihkan
  omset satu jam kepada penampil yang mungkin belum naik panggung. Jumlahnya
  **disebut di layar** berikut nama & tanggalnya.
- **Jadwal `Cancelled` tidak ikut**; status lain (Scheduled/Confirmed/Done)
  semuanya ikut — jadwal yang lupa ditandai Done tetap penampilan yang
  benar-benar terjadi, dan membuangnya menghapus malam yang sedang dianalisa.

#### Pembandingnya JAM YANG SAMA, bukan rata-rata seluruh jam

Ini yang menjawab *"kontribusinya tinggi atau tidak"*, dan aturannya sama
dengan **vs hari sama** di halaman Pengaruh Event — diturunkan satu tingkat ke
jam. Penampil dijadwalkan di jam ramai (20:00 ke atas), dan jam itu memang
lebih besar tanpa penampil apa pun; angka yang membandingkannya dengan jam 11
siang cuma memuji mereka untuk sesuatu yang sudah terjadi dengan sendirinya.

- **JAM YANG TIDAK PUNYA SATU PUN BILL TIDAK DIHITUNG DI KEDUA SISI.** Venue
  tutup lewat tengah malam, jadi jam 3 pagi sampai jam 10 pagi tidak punya
  baris sama sekali. Menghitungnya sebagai Rp0 di sisi *tanpa penampil* akan
  menyeret rata-ratanya ke nol dan membuat **setiap** penampil terlihat luar
  biasa. Dikatakan di layar.
- **Jam yang tidak pernah sekali pun tanpa penampil memang tidak punya
  pembanding**, dan itu ditulis di barisnya — bukan diisi +100% yang dikarang.
- Sisi yang kosong ditulis **tanda hubung, bukan Rp0**: nol berarti jam itu
  pernah ada penampilnya dan omsetnya memang nol.

#### Yang digabung, dan yang tidak boleh dijumlahkan

- **Di dalam satu kategori jamnya DIGABUNG (union), bukan dijumlahkan.** Dua
  band yang tampil di jam yang sama tidak boleh membuat jam itu terhitung dua
  kali untuk kategorinya sendiri.
- **Antar kategori tetap tumpang tindih**, dan itu **dikatakan**: band
  20:00–23:00 dan DJ 22:30–01:30 sama-sama menempati jam 22. Menjepitnya supaya
  berjumlah 100% berarti membagi omset satu jam dengan aturan yang tidak pernah
  diputuskan siapa pun. Kolom **% omset bulan** karena itu boleh berjumlah
  lebih dari 100%.
- **Baris `DJ + MC DJ`** (dikatakan user: keduanya berpasangan) dihitung dari
  **gabungan jam keduanya**, bukan penjumlahan dua barisnya — dijumlahkan, jam
  yang mereka tempati bersama terhitung dua kali dan pasangannya selalu
  terlihat lebih besar daripada kenyataannya. Barisnya menandai dirinya sendiri
  *jangan dijumlahkan dengan dua baris di atasnya*.
- **`Rp / jam` yang paling adil dibandingkan**, bukan totalnya: slot band tiga
  jam dan slot DJ satu setengah jam tidak bisa diadu lewat total. Di data uji
  Amerta (Rp6,5 jt/jam) mengalahkan James Project (Rp4,4 jt/jam) yang totalnya
  jauh lebih besar — dan itu justru gunanya kolom ini.
- **Penyebut kolom persen adalah omset SELURUH bulan**, dan itu disebut
  angkanya di tiap selnya. Pelajaran empat putaran pertanyaan di kolom
  Kontribusi: kepala kolom dibaca sekali, angkanya dibaca tiap baris.
- **`% malam itu` dirata-rata ANTAR MALAM**, bukan dijumlahkan lalu dibagi —
  kalau tidak, satu malam yang kebetulan ramai menentukan seluruh angkanya.

```bash
node tools/uji-analytics.js   # 503 pemeriksaan (dari 464)
```

Fixture-nya empat malam, dan tiap malam dirancang menjawab satu pertanyaan:
tumpang tindih jam (2 Sep), pembanding jam yang sama (3 Sep tanpa penampil),
gabungan dalam satu kategori (4 Sep dua band di jam yang sama), dan jadwal yang
dibatalkan (5 Sep). Angkanya dipilih supaya **tiap kesalahan memberi hasil yang
berbeda**: jam 22 terhitung dua kali → Rp35,2 jt, jam sesudah tengah malam
hilang → Rp27 jt, yang benar → **Rp31,2 jt**.

> **Berkas POS-nya DIBUAT DI UJI sebagai CSV** dan didorong lewat
> `anPilihBerkas` → `uraiPos` → `anSimpanUnggah` yang sungguhan.
> `cariBarisKepala()` menuntut **minimal lima sel non-angka** di baris kepala
> (itu yang membedakannya dari sepuluh baris judul di berkas POS asli), jadi
> CSV tiruan berkolom empat ditolak dengan pesan yang menyebut berkasnya
> disunting — bukan kolomnya kurang.

**Enam belas mutasi dicoba, keenam belasnya tertangkap** — tiga di antaranya
baru tertangkap sesudah ujinya dibetulkan, dan ketiganya bentuk yang berbeda:

| yang lolos | sebabnya | yang ditutup |
|---|---|---|
| pasangan DJ + MC DJ menjumlahkan, bukan menggabungkan | **cacat fixture** — satu-satunya jadwal MC DJ tidak punya jam, jadi ia tidak menyumbang satu jam pun dan gabungan = penjumlahan | Pennykids tampil BERPASANGAN dengan Fuego di jam yang sama (13,2 jt vs 26,4 jt) |
| jam tanpa bill dihitung sebagai Rp0 | **mutasinya sendiri inert** — jam yang dipilihnya justru diklaim DJ yang menyeberang tengah malam | mutasi diganti "seluruh 24 jam dihitung", plus asersi bahwa jam 10 tidak digambar sama sekali |
| daftar kategori pasangan salah (isi hanya DJ) | **asersinya tidak membaca kolom tempat kesalahannya muncul** — DJ & MC DJ menempati jam yang sama, jadi kolom omsetnya tidak bergeser sedikit pun | kolom **Penampilan** & **Orang** ikut dikunci (2 dan 2) |

> Yang ketiga layak diingat terpisah: datanya sudah cukup dan mutasinya
> berjalan — **asersinya** yang berhenti satu kolom sebelum tempat kesalahan
> itu muncul. Memeriksa kolom yang paling jelas saja tidak cukup kalau kolom
> itu kebetulan tidak bergerak.

### Analytics: dua label yang tidak menjelaskan dirinya (7 September 2026)

Dua pertanyaan user, dan keduanya pertanyaan yang wajar — labelnya memang
tidak cukup.

**1. `% nilai` di Penjualan Menu.** Penyebutnya `totNilai` = jumlah nilai
SELURUH menu bulan itu (sebelum service & pajak), bukan omset. Sekarang
judulnya `% dari nilai menu` dan penyebutnya **disebut angkanya** di kaki
tabel. Kolom persen tanpa penyebut cuma bisa ditebak, dan tebakan paling wajar
di halaman omset justru yang salah: orang mengira pembaginya omset sebulan,
lalu heran kolomnya tidak berjumlah 100%.

**2. `Selisih` di Pengaruh Event / Marketing — ada DUA, pembandingnya
BERBEDA**, dan itulah sumber pertanyaannya:

| | pembandingnya |
|---|---|
| kartu **Beda rata-rata** | rata-rata hari berevent vs rata-rata **seluruh** hari biasa |
| kolom di tabel per hari | hari itu vs rata-rata **hari yang SAMA** tanpa acara |

Yang pertama kasar dan hampir selalu terlalu memuji — acara ditaruh di akhir
pekan, dan akhir pekan memang lebih ramai tanpa acara apa pun. Yang kedua yang
berarti. Sekarang kartunya berjudul **Selisihnya — pembanding kasar** dan
menyebut kedua angka rata-ratanya, sementara kolom tabel diganti namanya jadi
**`vs hari sama`** — nama yang SUDAH dipakai tabel Per Kategori untuk
perhitungan yang sama persis. Dua kolom yang menghitung hal yang sama dengan
nama berbeda, di satu halaman, adalah pertanyaan yang pasti datang.

### Modul Event: tema diselaraskan, CSS SAJA (7 September 2026)

Permintaan user: tampilannya dibuat lebih seperti modul Konten/Reservasi —
dan saat ditanya bagian mana, jawabannya **“lebih ke CSS-nya saja, yang lain
oke-oke saja”**. Jadi yang diubah HANYA nilai gaya; struktur halaman dan
seluruh JS tidak disentuh. Modul ini 667 KB dan semuanya digambar dari string
HTML — menyentuh strukturnya demi tampilan adalah pertukaran yang buruk.

**Paletnya memang sudah sama sejak lama** (emas `#A9791F`, Plus Jakarta Sans +
Inter). Yang membuatnya terasa berbeda kerapatannya, bukan warnanya:

| | sebelum | sesudah (= Konten) |
|---|---|---|
| `.card` sudut / padding | 12px / 16px | **16px / 20px** |
| `.card` bayangan | nilai sendiri | **`var(--shadow)`** |
| `.grid` gap | 14px | **16px** |
| `th` / `td` padding | 9px 10px / 10px | **10px 14px / 11px 14px** |
| kotak isian | 8px 10px, r7, 13px | **9px 12px, r9, 13.5px** |
| `.btn.sm` | 5px 10px, 12px | **7px 12px, 12.5px** |

- **Latar kotak isian TIDAK diubah.** `--panel2` yang hangat itu identitas
  modul ini, dan yang diminta nuansanya — bukan warnanya.
- **Bayangan memakai `var(--shadow)` yang sudah ada**, bukan nilai sendiri:
  dua nilai bayangan di satu berkas akan menyimpang begitu salah satunya
  disetel, dan bedanya terlalu halus untuk disadari sampai keduanya berdiri
  bersebelahan.
- Verifikasinya: `git diff` menunjukkan hanya enam aturan CSS, isi di luar
  seluruh blok `<style>` **identik byte-per-byte**, dan `smoke-modul.js event`
  tetap merender 16 halaman.

### Cashier: berkas kembar KETIGA yang tertinggal DUA kali (7 Sep 2026)

Keluhan user: Performa Kasir di **modul Cashier** memajang *“13 hari punya
baris event yang belum ditentukan kasir shift-nya”* untuk baris yang justru
berbunyi **“Tidak ada potongan kasir”**, sementara panel Finance untuk bulan
yang sama menyebut **satu** hari.

`deploy/cashier/` tertinggal DUA perbaikan berturut-turut, dan keduanya sudah
tercatat di berkas ini untuk berkas lain:

| kapan | apa | sampai ke |
|---|---|---|
| 7 Agustus 2026 | section event berhenti memotong kasir (`potonganHari`) | omset, kas |
| 5 September 2026 | baris tanpa potongan disaring (`potongKasirAktif`) | omset, kas |

Akibatnya bukan cuma peringatan palsu: `potonganHari()` di sana masih membaca
`d.bd.event`, jadi selama sebulan ia **menghidupkan kembali potongan yang sudah
sengaja dihapus** — termasuk pada baris event lama yang `shift`-nya terlanjur
tersimpan. Realisasi kasir di Cashier karena itu lebih kecil daripada angka
yang sama di Finance. **Efek perbaikannya berlaku surut**: realisasi kasir pada
hari yang ada event-nya akan naik di modul Cashier.

**PELAJARANNYA ADA DI UJINYA, bukan di bug-nya.** `uji-openbill-performa.js`
membandingkan omset vs kas sejak lahir — dua berkas — dan berkas ketiga yang
memakai rumus yang sama tidak pernah ikut diperiksa. Sekarang ia membandingkan
**KETIGANYA**, dan langsung menemukan satu perbedaan lagi (di bawah).

#### `porsiPic` di Cashier masih versi lama — MENUNGGU KEPUTUSAN

```
omset & kas : amount + tax + service + obTotal      -> 8.457.330
cashier     : r.tiket ? amount × PORSI_PIC_TIKET : amount -> 6.977.200
```

`PORSI_PIC_TIKET` dan cabang `r.tiket` sudah dibuang dari kedua berkas lain;
di Cashier keduanya masih hidup. **Ini TIDAK disamakan begitu saja** —
`porsiPic()` dipakai `potonganBaris()` sebagai besar POTONGAN ke kasir shift,
jadi menyamakannya mengubah angka uang yang sudah berjalan. Komentar kedua sisi
pun saling bertentangan: Cashier menulis *“Open Bill TIDAK BOLEH masuk
porsiPic()”*, sementara `potonganBaris()` di omset memakai `porsiPic()` yang
sudah memuat `obTotal`. Yang benar adalah keputusan tentang uang, bukan tentang
kode. Nilainya **dikunci di uji** sampai diputuskan, jadi perubahan ke arah
mana pun akan berbunyi.

```bash
node tools/uji-openbill-performa.js   # 47 pemeriksaan (dari 25), TIGA berkas
```

### Jejak penginput: Breakdown & halaman pertama Kas (7 September 2026)

- **Breakdown Omset ikut mencatat siapa yang menyimpannya** (`d.bdLog`),
  memakai `tambahJejak()` yang sama. **DI LUAR `d.bd`** — objek itu diganti
  UTUH tiap simpan, jadi jejak di dalamnya akan terhapus setiap kali tanpa satu
  pun galat. Kata kerjanya *Diatur*.
- **Panel Kas membuka Dashboard Omset lebih dulu**, bukan Buku Kas Kecil.
  Melengkapi kenaikan grup menunya sehari sebelumnya — menu teratas yang bukan
  halaman pertama membuat sidebar dan layar mengatakan dua hal berbeda tentang
  mana yang utama. `kk_buku` tetap jadi cadangan berikutnya: yang tidak berhak
  membuka Dashboard Omset tidak boleh mendarat di layar kosong.

### Cashier: Performa Kasir cuma untuk diri sendiri (7 September 2026)

Permintaan user: yang login boleh melihat **namanya sendiri** dan tab
**Semua**; kasir lain **tidak** bisa dibuka satu per satu.

- **Tab Semua SENGAJA tetap terbuka.** Ia agregat — tidak menyebut siapa dapat
  berapa — dan justru itu angka yang dipakai kasir membandingkan dirinya
  dengan capaian tim. Menutupnya mencabut satu-satunya pembanding yang halaman
  ini punya, untuk sesuatu yang tidak pernah diminta.
- **GERBANGNYA DI `draw()`, bukan di tombolnya.** Tombol kasir lain memang
  tidak digambar, tapi `draw()` membaca `b.dataset.k` saat diklik — dan
  `data-k` bisa diubah dari devtools dalam sepuluh detik. Halaman yang menjaga
  aksesnya hanya dengan tidak menggambar tombol tidak menjaga apa pun. Ujinya
  melakukan persis itu: mengakali `data-k` lalu mengklik.
- **ADMIN MODUL DIKECUALIKAN** (`adminModules` kini ikut dibaca `bacaSesi()`,
  sebelumnya modul ini tidak pernah membedakan siapa pun). Tanpa itu
  supervisor dan Finance yang membuka modul ini ikut terkunci dari nama-nama
  yang memang tugasnya ia periksa. Kalau suatu hari harus diketatkan juga,
  yang perlu diubah cuma `bolehLihatKasir()`.
- **Pencocokan user↔kasir lewat `officeUserId` DULU, baru nama** — nama bisa
  berubah ejaannya di Office, id tidak. Aturan yang sama dengan
  `compFilterPic()` di berkas yang sama.
- **Akun yang tidak cocok dengan kasir mana pun DIKATAKAN sebabnya** berikut
  cara membetulkannya (Tim/Keterangan di Office). Daftar yang menyusut tanpa
  penjelasan akan dilaporkan sebagai data hilang, bukan dibaca sebagai aturan
  baru.

Yang dijaga ujinya bukan NAMA melainkan ANGKA: isi `ks_body` tidak pernah
menyebut nama kasir sama sekali, dan yang sebenarnya dirahasiakan memang
capaian orangnya — namanya toh ada di Office. Tiap kasir di data uji diberi
nominal berbeda supaya tiap tab punya angka khasnya sendiri.

```bash
node tools/uji-performa-kasir-akses.js   # 25 pemeriksaan, jsdom
```

### Impor jadwal dari BERKAS Excel, & pembaca .xlsx jadi milik bersama

Permintaan user 7 September 2026: *“yang mingguan dan bulanan bisa, tapi
modelnya bukan copy text tapi upload excel saja”*.

**`deploy/assets/xlsx-baca.js` — SUMBER TUNGGAL pembaca .xlsx/.csv.** Isinya
pindah dari `deploy/analytics/`, tempat ia lahir. Saat modul Jadwal ikut perlu
membaca Excel, satu-satunya pilihan lain adalah MENYALINNYA — dan repo ini
sudah tiga kali kehilangan waktu karena berkas kembar yang tertinggal
(`porsiPic`, `potonganHari`, `hpp.php`). Pola yang sama dengan
`assets/venue-layouts.js`.

- Yang diekspor: `bisaXlsx`, `bacaZip`, `uraiSheet`, `uraiSharedStrings`,
  `uraiCsvBaris`, **`bacaBerkasTabel(file)`** (berkas → baris berkunci huruf
  kolom, apa pun bentuknya), **`barisKeTsv(baris)`**.
- **Pemilihan lembar & cabang .csv ikut pindah.** Keduanya dulu ditulis di
  Analytics; dua tempat yang memutuskan lembar mana yang dibaca akan
  memulangkan lembar yang salah tanpa satu pun galat.
- **Ketiadaannya DIKATAKAN di kedua modul**, bukan dibiarkan jadi
  `ReferenceError` yang menyebut nama fungsi — yang membacanya akan menyangka
  berkasnya yang rusak.
- Uji Analytics **menyisipkan asset-nya sebagai skrip inline** menggantikan tag
  `src`-nya (jsdom tidak mengambil skrip eksternal). Pola yang sama dengan
  `uji-bukti-dp.js` untuk `venue-layouts.js`.

**Modul Jadwal: unggah berkas jadi cara utama.** Yang ditambahkan HANYA cara
memasukkan datanya — aturan membacanya tetap `imporParse()` yang sudah ada.
Dua pengurai jadwal berarti berkas yang diunggah bisa menghasilkan sel berbeda
dari tempelan yang isinya sama, dan yang membandingkannya tidak punya cara tahu
mana yang benar.

- **LEBAR TSV DARI KOLOM TERJAUH DI SELURUH BERKAS, bukan per baris.** Sel
  kosong di ujung baris tidak ditulis ke XML sama sekali, jadi baris yang
  berhenti lebih awal kehilangan kolomnya dan **seluruh tanggal di kanannya
  BERGESER** — jadwal orang itu pindah hari tanpa satu pun galat. Ini
  kesalahan paling mahal di jalur ini dan satu-satunya yang tidak kelihatan
  dari layar.
- **Menempel TIDAK dicabut**, cuma dilipat ke `<details>`. Jadwal yang disusun
  di Google Sheets tidak selalu berbentuk berkas, dan mencabutnya
  menghilangkan satu-satunya jalan untuk kasus itu.
- **`input.value=` sesudah dibaca**, supaya memilih berkas yang SAMA dua kali
  tetap memicu `onchange`. Tanpa itu, memperbaiki berkasnya di Excel lalu
  memilih ulang tidak menghasilkan apa pun.
- **Nama berkas digambar terpisah** (`imporNamaGambar`), tidak menggambar ulang
  modal — menggambar ulang membuang isi textarea dan fokusnya.

Bentuk berkas HR ternyata **sama persis** dengan ekspor 📗 Excel modul ini:
`Employee ID | Employee Name | 2026-09-01 | …`, isinya `PAGI`/`SIANG`/
`MIDDLE`/`dayoff`. `dayoff` jatuh ke kode `OFF` lewat nama shift-nya, bukan
jadi shift bebas — kalau bebas, lembarnya penuh sel bertuliskan teks mentah
dan tidak satu pun terbaca sebagai libur.

```bash
node tools/uji-impor-jadwal.js         # 39 pemeriksaan, TANPA jsdom — aturan pengurainya
node tools/uji-impor-berkas-jadwal.js  # 26 pemeriksaan, jsdom — jalur berkasnya
```

**DUA BERKAS UJI, dan itu disengaja.** `uji-impor-jadwal.js` (sudah ada sejak
pagi yang sama) menjaga ATURAN PENGURAINYA — tanggal harus dari tempelan bukan
ditebak dari minggu aktif, nama di luar roster tidak ditulis, kode yang bukan
shift jadi `LAIN` + catatan — dan berjalan TANPA jsdom. Yang baru menjaga
JALUR BERKASNYA. Digabung, uji pengurai yang cepat itu ikut menyeret boot
jsdom setiap kali dijalankan.

Ujinya memakai **berkas jadwal asli** di root repo kalau ada; kalau tidak,
bagian itu MELEWAT dengan jelas. Berkas itu **jangan di-commit** (sudah di
`.gitignore`: `SCHEDULE*.xlsx`) — satu berkas memuat nama seluruh kru satu
divisi berikut Employee ID Talenta-nya. Nama kru untuk uji diambil DARI
berkasnya sendiri, jadi tidak ada nama pegawai yang tertulis di dalam kode uji.

### TARGET DICABUT SELURUHNYA dari Finance & Cashier (5 September 2026)

Permintaan user: *"Target bulanan dan pengaturan target di modul finance, dan
cashier tidak perlu ada"* — **kedua jenisnya**, target perusahaan
(`settings.companyMonthlyTarget`) maupun target per PIC (`employees[].target`).
Yang tinggal cuma **realisasi**: omset yang benar-benar masuk, dan siapa yang
diakui menerimanya.

Yang dicabut, di **tiga** berkas:

| berkas | yang hilang |
|---|---|
| `deploy/finance/kas/` | halaman **Pengaturan Target** (nav, TITLES, router, matriks akses, `AKS_HAL_ISI`), kartu Target/Achievement di Dashboard Omset & ketiga Performa, grafik *Target vs Actual*, kolom Target/Ach di tabel harian, blok target di laporan WA & PDF |
| `deploy/finance/omset/` | kartu Target Harian & Achievement Harian, progress bar, tiga dari empat angka *Pencapaian Bulan Berjalan* |
| `deploy/cashier/` | Target & Achievement di ringkas Performa Kasir |

Yang perlu dijaga:

- **`pembagiHari` / `dailyTarget` / `targetPic` / `targetRentang` DIBUANG
  seluruhnya**, bukan dibiarkan menganggur. Fungsi yang tidak dipanggil siapa
  pun akan dipanggil lagi suatu hari oleh orang yang mengira ia masih berarti
  sesuatu — dan kali ini ia akan membaca setelan yang tidak pernah lagi bisa
  diubah dari layar mana pun.
- **Bonus Kasir TIDAK ikut dicabut.** Tangganya dihitung dari omset yang
  DIAKUI, bukan dari pencapaian target. `baguRingkasKasir()` tinggal tiga
  kotak (g5 → **g3**); grid yang tetap g5 menyisakan dua kolom kosong yang
  terbaca sebagai kartu gagal dimuat.
- **Data lama SENGAJA tidak dihapus.** `companyMonthlyTarget` dan
  `employees[].target` tetap di database, cuma tidak dibaca siapa pun.
  Menghapus angka yang tidak bisa dikembalikan demi kerapian layar bukan
  pertukaran yang baik. Endpoint `simpanTarget` di `kompas-api` juga dibiarkan
  hidup.
- **Judul lembar PDF Performa jadi "Report Realisasi"**, dan
  `cetakAchievement(divi,e,a)` tidak lagi menerima `tgt`/`ach`. Judul yang
  menjanjikan achievement padahal isinya realisasi adalah janji yang tidak
  ditepati tiap kali dibuka. Nama fungsinya sengaja tidak diganti — diff-nya
  kecil dan riwayat gitnya tidak putus.
- **Kalimat yang menyuruh ke "Pengaturan Target" ikut dibetulkan** di pita PIC
  yatim (kas) dan pita baris tanpa PIC (omset). Roster PIC memang tidak pernah
  diisi di sana: ia ditarik `syncPicOffice()` dari kolom **Tim/Keterangan** di
  Office.

```bash
node tools/uji-tanpa-target.js   # 35 pemeriksaan, TANPA jsdom
```

Ujinya membuang komentar (JS **dan** HTML) sebelum mencari — sejarah kenapa
sesuatu dicabut justru harus tetap boleh menyebut namanya; yang dilarang
PEMAKAIANNYA. Satu rujukan yang tertinggal untuk fungsi yang sudah dibuang
adalah ReferenceError, dan gejalanya **layar putih** tanpa satu kata pun yang
menyebut target.

### Breakdown: simpan dikunci, & baris yang memang tidak memotong (5 Sep 2026)

**Simpan Breakdown sekarang DIKUNCI kalau masih ada kasir shift yang belum
diatur** (permintaan user). Dulu sengaja tidak mengunci — alasannya tertulis
di kodenya: angka yang sudah betul tidak boleh tertahan gara-gara pembagian
shift. Yang terbukti di lapangan justru sebaliknya: peringatannya dilewati,
breakdown tetap disimpan, dan potongan yang tidak dibebankan membuat uang yang
sama terhitung dua kali — sekali di realisasi PIC, sekali di realisasi kasir.

- `balance` dan `belum.length` **dipisah**, jangan dilebur jadi satu `ok`.
  Hari yang sudah balance tapi shift-nya belum diatur kalau berbunyi "Belum
  Balance" akan membuat orang mencari selisih rupiah yang memang tidak ada.

**BARIS YANG TIDAK MEMOTONG KASIR — tiga berkas kembar yang tertinggal.**
Keluhan user: Performa Kasir memajang *"5 hari punya baris event yang belum
ditentukan kasir shift-nya"* untuk baris yang justru memang tidak punya
potongan. Sebabnya `deploy/finance/kas/` **tidak pernah mengenal**
`menuFixRow` / `payGroupRow` / `potongKasirAktif` sama sekali:

| | omset | kas (sebelum 5 Sep) |
|---|---|---|
| `potongKasir()` | `potongKasirAktif(r) ? num(r.amount) : 0` | `num(r.amount)` |
| `barisTanpaShift()` | menyaring `potongKasirAktif` | tidak |

Akibatnya baris yang di Breakdown berbunyi **"Tidak ada potongan kasir"**
TETAP mengurangi realisasi kasir di Performa, dan tetap dihitung sebagai
"belum diatur". Dua layar menyebut potongan yang berbeda untuk baris yang
sama, dan tidak satu pun melempar galat.

- **Penjaganya SATU tempat, di `potongKasir()`.** `potonganBaris()` tidak
  memeriksanya lagi — dua penjaga untuk satu aturan cuma membuat yang
  berikutnya menebak mana yang menentukan.
- Karena penjaganya di `potongKasir()`, **daftar `shift` yang terlanjur
  tersimpan sebelum penandanya disetel tidak pernah ikut dihitung.** Itu
  bentuk data yang paling sering ada di produksi.
- **Efeknya berlaku surut**: realisasi kasir pada hari yang punya baris
  "dipilih di tempat" berikut `shift` tersimpan akan NAIK. Itu memang angka
  yang benar menurut aturan yang sudah berlaku sejak 12 Agustus 2026.

**Halaman Ranking PIC DICABUT** (permintaan user). Rujukannya ada di **enam**
tempat dan semuanya harus ikut: menu sidebar, matriks hak akses
(`summary:{staf:…}`), `VIEW_ANALITIK`, `TITLES`, peta router, dan
`viewSummary()` sendiri. Yang benar-benar mengunci halamannya adalah
**`TITLES`** — `render()` menjatuhkan view yang tidak punya judul, jadi
`go('summary')` dari console pun tidak bisa membukanya lagi.

```bash
node tools/uji-openbill-performa.js   # 25 pemeriksaan (dari 18)
node tools/uji-breakdown-simpan.js    # 36 pemeriksaan (dari 25)
```

### Open Bill: satu rumus untuk dua layar (5 September 2026)

Keluhan user: *"yang diakui PIC include Open Bill, tapi di Performa tidak
include"*. Benar — dan sebabnya **berkas kembar yang tertinggal**.

`porsiPic()` ada DUA KALI: `deploy/finance/omset/` (kolom **Diakui PIC** di
Breakdown) dan `deploy/finance/kas/` (**Realisasi** di Performa). Open Bill
lahir 11 Agustus 2026 dan salinan di omset ikut diperbarui; salinan di kas
tidak. Sejak itu satu baris yang sama punya dua angka:

```
Breakdown : 6.977.200 + 697.720 + 348.860 + 433.550 = 8.457.330
Performa  : 6.977.200 + 697.720 + 348.860           = 8.023.780
```

Selisihnya tidak pernah muncul sebagai galat — cuma sebagai realisasi yang
lebih kecil daripada yang dijanjikan halaman sebelah, dengan dua angka yang
sama-sama kelihatan wajar.

- **`obAktif()` / `obTotal()` / `porsiPic()` bertiga adalah berkas kembar.**
  Kalau salah satu berkas disentuh, yang lain HARUS ikut.
- **Open Bill TETAP tidak dipotong dari kasir.** Uangnya sudah masuk omset
  bruto kasir hari itu, jadi ia memang diakui dua kali — penuh untuk kasir,
  penuh untuk PIC. Keputusan user 11 Agustus 2026; jangan "diperbaiki" dengan
  menambahkannya ke `potongKasir()`.
- **Kolom Open Bill muncul di Daftar Event hanya kalau ada yang punya.** Tanpa
  kolomnya, Omset + Tax + Service tidak berjumlah sama dengan kolom Diakui dan
  selisihnya dilaporkan sebagai salah hitung; kalau selalu tampil, mayoritas
  periode memajang satu kolom penuh Rp0. `colspan` keadaan kosong ikut
  menyesuaikan — kalau tidak, baris "Belum ada event" melenceng satu kolom.
- **Komentar di omset sempat menjanjikan "muncul di Performa Kasir", dan itu
  TIDAK PERNAH benar** — panel Kas Kecil tidak mengenal Open Bill sama sekali
  sampai tanggal ini, dan yang menyusul cuma `porsiPic()`-nya. Pengakuan
  bernama untuk kasir memang belum ada di sana. Komentar yang menjanjikan
  layar yang tidak ada membuat yang membacanya berhenti memeriksa; itu persis
  yang membuat `porsiPic()` di kas tertinggal hampir sebulan — kesalahan yang
  sama dengan `hpp.php` dan `cocokPic()`.

```bash
node tools/uji-openbill-performa.js   # 18 pemeriksaan, TANPA jsdom
```

Ujinya **memotong kedua rumusnya dari kedua berkas** lalu memberi baris yang
sama — hasilnya wajib sama persis. Itu satu-satunya pemeriksaan yang tidak
bisa basi sendiri, dan itu pula yang akan menangkap berkas kembar berikutnya
yang tertinggal. `num()` ikut dipotong: yang membedakan hasil bisa saja justru
di sana, bukan di `porsiPic()`.

### Breakdown: acara lintas hari & simpan yang dikonfirmasi (5 Sep 2026)

Dua keluhan user, dua-duanya gagal **tanpa satu pun galat** dan dua-duanya
menyentuh uang.

**1. Acara lintas hari cuma muncul di hari pertama.** Modul Marketing punya
saklar *Berlangsung lebih dari satu hari* yang menulis `tanggalSelesai`, dan
kalendernya sudah menggambar acaranya di semua hari itu — tapi
`events_hari()` mencocokkan `e.tanggal = :tgl` persis. Omset hari kedua
karena itu tidak punya barisnya sendiri.

- **`tanggalSelesai` tidak punya kolom sendiri** (ada di blob `data`), jadi
  tidak bisa disaring di SQL tanpa berkas migrasi. Yang dilakukan: ambil
  jendela **60 hari** ke belakang lewat `idx_ev_tanggal`, lalu saring di PHP.
  Tanpa batas bawah, query ini berubah jadi pemindaian tabel penuh tiap kali
  halaman Breakdown dibuka.
- **Syarat keduanya wajib** (`$mulai !== $tgl && !($selesai >= $tgl)` →
  `continue`). Tanpa itu seluruh acara 60 hari terakhir ikut tertarik.
- **Tombol "salin ke kolom" SENGAJA tidak digambar untuk baris lintas hari.**
  Nilai yang dipulangkan Marketing adalah nilai **seluruh** acara — satu angka
  untuk semua harinya, karena di sana memang cuma ada satu. Menyalinnya di dua
  tanggal membuat omsetnya terhitung dua kali, dengan angka yang kelihatan
  wajar di kedua harinya. Sebabnya **dikatakan di tempat tombolnya berdiri**:
  tombol yang hilang tanpa keterangan terbaca sebagai halaman rusak.
- `hari` / `totalHari` **berkas kembar** — nama kunci di PHP harus sama persis
  dengan `ev.hari`/`ev.totalHari` yang dibaca JS. Beda satu huruf tidak
  melempar; barisnya cuma diam-diam kembali dianggap acara sehari.

**2. "Simpan selalu berhasil tapi datanya tidak tersimpan."** `save()` itu
fire-and-forget: menulis ke localStorage, memasang "Menyimpan…" di pojok, lalu
menjadwalkan `kirim()` **satu detik** kemudian. Tombol Simpan Breakdown tidak
pernah menunggu satu pun jawaban — `render()` dipanggil seketika dan halaman
terlihat beres. Kalau tabnya ditutup, halamannya dipindah, atau requestnya
gagal dalam detik itu, server **tidak pernah menerima apa pun**; muat
berikutnya mengambil salinan server lewat `apiGet()` dan salinan lokal yang
lebih baru tertimpa diam-diam.

- **`kirimSekarang()`** membatalkan penundaannya, mengirim sekarang, dan baru
  selesai setelah server menjawab `ok`. Itulah satu-satunya cara sebuah tombol
  boleh mengatakan "tersimpan".
- **`render()` pindah ke cabang BERHASIL.** Saat gagal, layarnya dibiarkan apa
  adanya — isian yang barusan diketik masih di sana, dan percobaan ulang
  otomatis masih berjalan.
- **Konfirmasi sebelum kirim menyebut angkanya** (Total Omset Diakui, net,
  Selisih, jumlah baris), bukan sekadar "yakin?". Pertanyaan tanpa isi cuma
  melatih orang menekan OK.
- **`beforeunload`** menahan penutupan selama `DIRTY || SAVING`. `kirimSekarang()`
  mengembalikan `DIRTY=true` saat gagal justru supaya penjaga itu menyala.

```bash
node tools/uji-breakdown-simpan.js   # 25 pemeriksaan, jsdom (omset + marketing + php)
```

Ujinya menjalankan `kirimSekarang()` sungguhan dengan `fetch` tiruan: server
yang menolak harus sampai ke pemanggilnya sebagai **gagal**, berikut sebab
aslinya — bukan ditelan lalu dilaporkan berhasil, yang persis keluhan aslinya.

### Breakdown Sumber → Performa: PIC yang kosong (4 September 2026)

Keluhan user: *"omset performa event tidak ketarik padahal sudah di-set
breakdown"*. Sebabnya **dua hal yang saling menutupi**, dan sendiri-sendiri
tidak satu pun kelihatan:

| | |
|---|---|
| `deploy/finance/omset/` Breakdown | kotaknya digambar `mkSelect(list, r.picId ‖ list[0].id)` — baris yang `picId`-nya kosong **tetap memajang nama orang pertama**, jadi di layar terlihat sudah punya PIC |
| `deploy/finance/kas/` Performa | `if(agg[r.picId])` — baris ber-PIC tak dikenal **dibuang tanpa satu pun tanda** |

Gabungannya: angkanya rapi di Breakdown, tidak muncul di Performa, dan tidak
ada satu layar pun yang menjelaskan selisihnya.

- **PIC yang kosong TIDAK dijatuhkan ke orang pertama, di layar maupun di
  data.** Itu menebak siapa yang dapat omsetnya, dan tebakan tentang uang
  orang lebih buruk daripada kotak yang jelas-jelas belum diisi. Yang kosong
  digambar sebagai pilihan **— pilih PIC —**, termasuk kalau PIC tersimpannya
  sudah dihapus dari roster.
- **Baris tanpa PIC DISEBUT di dua tempat**: pita di Breakdown (berikut nama
  PIC di modul asalnya, petunjuk tercepat kenapa ia tidak cocok) dan pita di
  Performa **di atas segmen PIC** — yang membukanya sedang mencari angka yang
  ia harapkan ada, dan jawabannya harus terbaca sebelum ia menyimpulkan
  angkanya memang nol.
- **Nominalnya tetap tidak diakui untuk siapa pun.** Yang berubah cuma:
  sekarang dikatakan.
- Sumber tersering: baris otomatis dari modul Marketing/Event yang nama
  PIC-nya tidak ada di roster (`cocokPic()` memulangkan null).

**Komentar di `cocokPic()` sempat menyatakan "dibiarkan memakai PIC pertama"**
— dan itu memang yang TERLIHAT, tapi cuma di layar. Komentar yang salah itulah
yang membuat bug ini bertahan: yang membacanya berhenti memeriksa. Sama persis
dengan kasus `hpp.php` di bawah.

**PIC yang tidak cocok jatuh ke AKUN YANG MENGINPUT EVENT-nya, baru ke ORANG
YANG MENGISI** (permintaan user, dua kali di hari yang sama). Modul Event
menulis PIC-nya **"Event Manager"** — sebuah JABATAN, bukan nama orang, jadi
`cocokPic()` tidak akan pernah menemukannya berapa kali pun dicoba.

Rantainya TIGA langkah, dan urutannya menentukan siapa yang diakui:

```
cocokPic('event', ev.picName)                       nama yang DITULIS di modul Event
  || picAkun('event', ev.inputOlehId, ev.inputOleh) AKUN YANG MENGINPUT event itu
  || picPengisi('event')                            orang yang MENGISI breakdown
```

**Langkah kedua melewati TIGA berkas, dan tiap sambungan yang putus gagal
diam-diam** — PIC-nya cuma jatuh ke jaring berikutnya, dan angkanya tetap
terlihat wajar:

| berkas | perannya |
|---|---|
| `deploy/event/` `saveEvent()` | menulis `createdBy` + `createdById` dari `sesiKru()`, **hanya saat event lahir** |
| `deploy/event/` `fieldPicEvent()` | kotak PIC **TERKUNCI** ke akun itu — sejak 5 Sep 2026 |
| `event-mysql` `events_hari()` | membacanya dari blob `data` → `inputOleh` / `inputOlehId` |
| `deploy/finance/omset/` `serapOtomatis()` | `picAkun('event', ev.inputOlehId, ev.inputOleh)` |

- **TIDAK ditulis ulang saat event disunting.** Yang menyunting belum tentu
  yang membuat, dan menimpanya memindahkan pengakuan omset ke orang yang cuma
  membetulkan satu huruf.
- **Event yang lahir sebelum 4 September 2026 memang tidak punya jejak ini**,
  dan itu bukan galat — langkah ketiga tetap ada. Backend memulangkan string
  kosong, bukan null: yang membacanya memperlakukannya sebagai "tidak ketemu".
- **Jejaknya tidak punya kolom sendiri** — ia field aplikasi, jadi ikut di blob
  `data` tanpa satu pun berkas migrasi (lihat `collections()`). Yang perlu
  diubah cuma `SELECT`-nya, yang sebelumnya tidak mengambil kolom itu.
- **Nama kuncinya berkas kembar**: `inputOleh`/`inputOlehId` di PHP harus sama
  persis dengan yang dibaca JS. Beda satu huruf tidak melempar apa pun.
- **"Diinput oleh" ikut tampil di detail event**, dan tidak digambar kalau
  kosong — "Diinput oleh: —" membuat orang mencari jejak yang memang tidak
  pernah ada.

Langkah ketiga tetap ada karena breakdown-nya memang sering diisi PIC event
itu sendiri, tapi ia ditaruh PALING BELAKANG: breakdown juga sering diisi
kasir atau finance tiap malam, dan mengakui omset event kepada mereka adalah
tebakan yang lebih buruk daripada memakai nama orang yang benar-benar tercatat
membuat acaranya.

**KOTAK PIC DI FORM EVENT SUDAH TIDAK DIKETIK** (5 September 2026, permintaan
user). `fieldPicEvent(id,e)` punya TIGA keadaan, dan ketiganya berbunyi
berbeda karena jalan keluarnya berbeda:

| keadaan | kotaknya |
|---|---|
| event BARU | terkunci ke akun yang sedang login |
| event lama BERJEJAK (`createdBy` ada) | terkunci ke pembuat yang tercatat |
| event lama TANPA jejak | **tetap bisa diketik**, dan sebabnya dikatakan |

- **Yang ketiga TIDAK boleh ikut dikunci.** Jejak pembuat baru lahir 4
  September 2026, jadi event sebelum itu tidak punya satu pun — menguncinya
  berarti "Event Manager" di 25 event lama tidak akan pernah bisa diperbaiki
  siapa pun, dan justru itu yang sedang dibereskan.
- **`saveEvent()` TIDAK membaca kotaknya kalau PIC terkunci** — kotak
  `readonly` tetap bisa diubah lewat devtools, dan yang menentukan pengakuan
  omset di Finance tidak boleh bergantung pada elemen layar. Urutan di
  `saveEvent()` **berkas kembar** dengan `fieldPicEvent()`: kalau salah satu
  diubah yang lain HARUS ikut, kalau tidak yang diketik dan yang tersimpan
  bisa berbeda tanpa satu pun tanda.
- **`readonly`, bukan `disabled`** (`input[readonly]` di CSS): yang `disabled`
  tidak bisa diblok untuk disalin, dan itu satu-satunya cara orang memindahkan
  namanya ke tempat lain. Aturan yang sama dengan daftar menu tak dikenal di
  Analytics.
- Akibatnya `pic` dan `createdBy` event baru **selalu berbunyi sama**, jadi
  `cocokPic()` di Breakdown sudah berhasil di langkah PERTAMA. Langkah kedua
  tetap perlu: ia yang menahan pencocokan tetap benar kalau nama orangnya
  diganti ejaannya di Office (`createdById`).

**Siapa yang menginput event LAMA tidak bisa dipulihkan dari data.** Tabel
`events` punya `created_at` (KAPAN) tapi tidak ada satu kolom pun untuk
SIAPA, dan blob `data`-nya juga tidak — modul ini tidak punya audit log.
Jangan menghabiskan waktu mencarinya lagi. Yang bisa: mengetik nama orangnya
di kotak PIC event itu (keadaan ketiga di atas), atau — untuk baris breakdown
yang SUDAH tersimpan — memilih PIC-nya satu per satu di Breakdown Sumber.
Baris breakdown tersimpan **tidak ikut terperbaiki sendiri**: `serapOtomatis()`
hanya menyetel `picId` saat barisnya LAHIR, dan menimpanya belakangan berarti
menghapus pilihan yang sudah dibuat finance.

- **Dijepit ke roster divisi itu** (`picPengisi(divi)`). Breakdown sering
  diisi kasir atau finance tiap malam — menjatuhkan omset event ke mereka
  berarti mengakui omset untuk orang yang tidak mengerjakannya, dan mereka
  memang tidak ada di roster event/marketing. Yang tidak ketemu di kedua-duanya
  tetap kosong dan tetap dilaporkan.
- **CADANGAN, bukan pengganti**: kalau nama dari modul asalnya memang cocok,
  itu yang menang — yang mengisi belum tentu PIC-nya.
- Dicocokkan lewat **`officeUserId` dulu**, baru nama — nama bisa berubah
  ejaannya di Office, id tidak. Aturan yang sama dengan `compCocok()`.
- **Baris manual juga** bawaannya yang mengisi, bukan orang PERTAMA di daftar:
  orang pertama cuma kebetulan urutan.
- **DIKATAKAN di pita barisnya** saat PIC terpilih berbeda dari nama di modul
  asalnya, berikut SEBABNYA — `— yang input di Event` dan `— yang mengisi`
  adalah dua orang yang berbeda pada hari yang sama (event diketik PIC-nya
  siang, breakdown diisi kasir malamnya), dan satu kata untuk kedua-duanya
  membuat pemeriksaan "apakah omsetnya diakui ke orang yang benar" mustahil.
  Nama penginputnya juga disebut walau PIC-nya sudah cocok (`diinput oleh
  <nama>`): kolom PIC di modul Event berisi jabatan, jadi itulah satu-satunya
  nama orang yang pernah tercatat di sana.

```bash
node tools/uji-pic-breakdown.js   # 55 pemeriksaan, jsdom (omset + kas + event + php)
```

Ujinya menjaga **kedua sisinya** — memperbaiki satu saja tidak menutup
jalurnya — dan sejak babak keduanya juga **ketiga berkas** jalur penginput,
termasuk membandingkan nama kunci di PHP dengan nama kunci yang dibaca JS.
`mkSelect`, `picAkun`, dan `picPengisi` hidup di dalam `viewBreakdown()` jadi
ketiganya DIPOTONG dari sumbernya saat uji jalan, bukan disalin.

### Modul `analytics`: laporan POS diurai DI PERAMBAN (29 Agustus 2026)

`deploy/analytics/index.html`, kunci izin `analytics`. Alurnya: unggah berkas
*Sales Recapitulation* dari POS → diurai di peramban → yang dikirim ke server
cuma **ringkasannya**.

**Backend MENUMPANG `kompas-mysql`** (tabel `an_state`, `an_akses`, `an_peran`,
lahir sendiri lewat `an_pastikan()`), aksi `analyticsGet/Save/Akses/Peran`.
Ditaruh di kompas karena yang dianalisis penjualan, dan halaman ini
membandingkan angka POS dengan Rekap Penjualan untuk hari yang sama.
**TABEL SENDIRI, bukan blob `settings` milik `saveAll`** — modul Omset mengirim
seluruh state-nya tiap menyimpan, jadi menaruh analytics di dalamnya berarti
satu simpan dari layar Omset menghapus seluruh riwayat unggahan.

**Diurai tanpa satu pun pustaka.** `.xlsx` adalah ZIP berisi XML, dan peramban
modern sudah punya `DecompressionStream('deflate-raw')` — yang perlu ditulis
cuma pembaca daftar isi ZIP-nya (~60 baris). Alternatifnya SheetJS ~900 KB dari
CDN, untuk satu berkas per bulan, dan CDN yang mati berarti modulnya ikut mati.
Berkas 9,4 MB terurai **~280 ms**. Yang perambannya terlalu tua DIKATAKAN, dan
jalur **CSV** tetap tersedia.

Yang menahan bug diam-diam:

- **KOLOM DICARI MENURUT NAMANYA** (`KOL_CARI`), bukan posisinya. POS mengubah
  urutan kolom antar versi tanpa memberi tahu siapa pun, dan pembaca yang
  menghitung kolom ke-41 akan membaca Tax sebagai Grand Total — salah yang
  muncul sebagai uang, bukan sebagai galat.
- **Baris kepala DICARI**, bukan dianggap baris pertama: berkas POS punya 10
  baris judul & penyaring di atasnya.
- **`isoDari()` satu pembaca untuk tiga bentuk tanggal** — serial Excel (46235),
  ISO, dan dd-mm-yyyy. Serialnya dihitung **UTC**; dibaca lokal, zona di timur
  menggeser tanggalnya satu hari. Rentangnya dijepit 20000–80000 supaya nomor
  meja tidak diam-diam jadi tanggal tahun 1900-an.
- **`dowDari()` pakai `getUTCDay`**, alasan yang sama. Salahnya cuma muncul
  sebagai "Sabtu ternyata sepi".
- **Hari dalam seminggu dibanding RATA-RATA, bukan jumlah.** Bulan dengan lima
  Sabtu dan empat Senin akan selalu menunjukkan Sabtu lebih besar kalau yang
  dibandingkan jumlahnya.
- **Jam di luar kedua shift TETAP dihitung** dan ditampilkan. Kalau dibuang,
  jumlah kedua shift tidak sama dengan total di Ringkasan.
- **Shift boleh melewati tengah malam** (`diRentang()` melingkar). Perbandingan
  lurus `a<=j&&j<b` memulangkan kosong untuk seluruh shift 18–02.
- **Rata-rata per TAMU disembunyikan kalau kolom Pax jarang terisi.**
  Membaginya memberi angka belasan kali lipat dari kenyataan, dan angka
  semacam itu terlihat sangat meyakinkan. ~~di data produksi cuma 318 dari
  4.087 bill~~ — **angka itu KELIRU dan sudah dibetulkan 10 September 2026**:
  Pax Total terisi di SELURUH baris (Agustus 2026: 4.829 pax di 4.785 bill),
  dan yang membuatnya terbaca kosong adalah bug pengurai .xlsx — lihat
  **Pengurai .xlsx menelan sel sesudah tiap sel kosong** di bawah. Yang perlu
  diketahui saat membacanya sekarang: POS-nya diisi **1 pax per bill** di 4.759
  dari 4.785 bill, jadi angkanya praktis sama dengan rata-rata per bill.

**DUA BENTUK LAPORAN, dan bedanya menentukan apa yang bisa dijawab:**

| ekspor POS | isinya | menjawab |
|---|---|---|
| *Sales Recapitulation Report* (**Bill Report**) | satu baris per bill, 45 kolom | omset/hari, rata-rata per bill, sebaran jam |
| *Sales Recapitulation **Detail** Report* (**Menu Report**) | satu baris per menu terjual, 46 kolom | menu terlaris + perkiraan bahan baku |

Berkas yang diunggah user pertama kali **Bill Report**, dan di dalamnya TIDAK
ada satu pun nama menu (kolom terdekatnya `Menu Discount` — itu nilai
diskonnya). Halaman Menu & Bahan Baku karena itu **mengatakan laporan mana yang
kurang**, bukan menggambar tabel kosong — tabel kosong terbaca sebagai "tidak
ada yang terjual". Yang memuat nama menu adalah **Detail Report**.

**DETAIL REPORT memakai nama kolom yang beda tipis, dan yang tidak dikenali
TIDAK melempar galat — ia memulangkan NOL** (4 September 2026). Agustus 2026:
19.734 baris menu, 4.785 bill, 259 menu.

| kolomnya | kalau tidak dikenali |
|---|---|
| `Nett Sales` (dua t) | Net Sales terbaca Rp0 |
| `Order Time` | sebaran jam kosong 24 dari 24 |
| `Total After Bill Discount` vs `Total` | omset sebulan Rp6,3 juta lebih besar |
| `Discount` (per menu) vs `Bill Discount` | diskon menu terhitung sebagai diskon bill |

Yang ketiga paling halus: `Total` di Detail Report adalah nilai **sebelum** bill
discount. Karena itu `'total after bill discount'` ditaruh **paling depan** di
`KOL_CARI.grand` — Bill Report tidak punya kolom itu dan tetap jatuh ke
`grand total`.

**BILL DIHITUNG DARI NOMOR BILL YANG BERBEDA, bukan dari jumlah baris.** Di
Bill Report keduanya sama; di Detail Report satu bill tersebar di beberapa
baris menu, jadi menghitung baris memberi **19.734 "bill" untuk 4.785 bill
sungguhan** — rata-rata per bill jatuh dari Rp152.613 ke Rp37.325 dan grafik
bill per jam empat kali lebih tinggi. Dua angka yang terlihat masuk akal dan
tidak akan dipertanyakan siapa pun.

- Berkas **tanpa** kolom nomor bill jatuh ke hitungan baris, dan itu
  **DIKATAKAN di pratinjau** (`billDariBaris`). Angka bill yang diam-diam
  berarti "jumlah baris" akan dibaca sebagai jumlah tamu.
- **Satu bill boleh muncul di dua jam** (pesan lagi belakangan — 481 dari 4.785
  di Agustus). Jadi jumlah kolom bill per jam boleh lebih besar daripada total
  bill; yang ditanya "jam berapa ramai", bukan "bill-nya dibagi ke mana".
  Bill per HARI tetap dijumlahkan pas.

**`jamDari()` membaca tiga bentuk**, dan memulangkan `-1` kalau tidak ada jam:
`"10:03:21"` (Bill Report), `46235.419108796` (serial Excel di Detail Report),
dan serial jam-saja. Sebelumnya jamnya diambil `parseInt(teks.slice(0,2))`, yang
untuk serial memulangkan **46** — di luar 0..23, jadi barisnya dibuang dan
seluruh sebaran jam kosong. **Serial BULAT = tanggal tanpa jam**, dipulangkan
`-1`: dijadikan nol ia menumpuk jadi "ramai sekali tengah malam", dan itu
satu-satunya jam yang tidak akan dicurigai karena tutupnya memang lewat tengah
malam.

Ujinya membandingkan **kedua berkas untuk bulan yang sama** — bill, grand, net,
subtotal, service, pajak, bill discount, dan rata-rata per bill harus keluar
angka yang sama dari dua bentuk laporan yang berbeda. Itu pemeriksaan terkuat
di berkas ini dan satu-satunya yang tidak bisa dipalsukan; ia MELEWAT dengan
jelas kalau salah satu berkasnya tidak ada di root repo.

### Analytics: menu paket & Kategori Menu (4 September 2026)

**BARIS `(PACKAGE)` DIGABUNGKAN KE MENU ASLINYA** (permintaan user). POS
menulis menu bonus/paket sebagai baris tersendiri berakhiran `(PACKAGE)`, dan
selama tidak digabung ia berdiri sebagai menu palsu — Agustus 2026: **4.123
porsi** yang tidak pernah masuk hitungan menu sesungguhnya, dan bahan bakunya
tidak pernah ikut terhitung.

Dua bentuk, dan bedanya menentukan bisa-tidaknya ia dihitung:

| bentuk | contoh | caranya |
|---|---|---|
| bernama JELAS (905 porsi) | `MINERAL WATER (PACKAGE)` | buang akhirannya, selesai |
| bernama UKURAN (3.218 porsi) | `LARGE (PACKAGE)`, `REGULAR (PACKAGE)` | ~~minumannya ada di KODE-nya~~ **KELIRU — lihat blok di bawah** |

> **BARIS UKURAN TERNYATA BUKAN PORSI TAMBAHAN.** Baris kedua di tabel itu
> menyuruh MENGGABUNGKAN porsinya ke menu yang ditunjuk kodenya, dan itu
> menghitung minuman yang sama dua kali. Dibetulkan 10 September 2026 —
> lihat **BARIS UKURAN BUKAN MINUMAN TERSENDIRI** di bawah.

- **Digabungkan saat MENGGAMBAR (`menuNormal()`), bukan saat mengurai.**
  Dibakukan ke laporan tersimpan, peta kode yang dibetulkan bulan depan tidak
  akan pernah memperbaiki bulan-bulan yang sudah diunggah — dan yang
  membetulkannya tidak punya cara tahu kenapa angkanya tidak berubah. `menu`
  di laporan tersimpan **tetap memakai nama mentah dari POS**.
- **Kode yang belum dipetakan TETAP DIHITUNG**, dengan nama yang menyebut
  kodenya (`LARGE (PACKAGE) · MATCHA02`). Dibuang, jumlah porsi di halaman ini
  berhenti sama dengan jumlah di berkas POS — dan ujinya memeriksa persis itu:
  total porsi & nilai **tidak boleh berubah** karena penggabungan.
- **`KOL_CARI.kode` dan `kode2` dipilih PER BARIS.** Kolom yang ADA tapi
  kosong adalah jebakan yang tidak bisa ditangkap dengan memilih kolom sekali
  di depan — `menu code` menang karena kolomnya memang ada, dan nol kode
  terbaca tanpa satu pun galat.

  ~~`Menu Code` ADA tapi KOSONG di seluruh 19.734 baris; yang berisi kodenya
  `Custom Menu Name`~~ — **itu TERBALIK, dibetulkan 10 September 2026.**
  Diukur ulang sesudah bug pengurai .xlsx ditutup: **Menu Code (AD) terisi di
  2.620 dari 2.811 baris (PACKAGE)**, sementara **Custom Menu Name (AC) kosong
  seluruhnya**. Selama bug itu hidup TIDAK SATU PUN kode paket pernah terbaca —
  AC yang kosong menelan AD — jadi penggabungan baris berkode dan halaman
  *Pengaturan → Kode Menu Paket* tidak pernah bekerja atas data sungguhan.
  Pemilihan per baris tetap dipertahankan: ia sekarang menemukan kodenya di
  kolom pertama, dan tetap punya cadangan kalau POS memindahkannya lagi.
- **`Custom Menu Name` juga dipakai kasir menulis catatan** ("Setengah
  mateng", "Takeaway", "No sugar") — 860 nilai berbeda. `kodeMenu()`
  menyaringnya: diawali huruf, diakhiri angka, hanya huruf/angka/`._-` di
  antaranya. Tanpa itu daftarnya penuh baris yang tidak akan pernah bisa
  dipetakan siapa pun.
- **Saran pasangan TIDAK boleh menawarkan baris paket** — namanya memuat
  kodenya sendiri, jadi ia selalu cocok dan selalu jadi saran teratas.
  Memasangkannya ke situ memetakan kode ke dirinya sendiri: porsinya tidak
  pindah ke mana pun, dan yang menekan tombolnya mengira sudah selesai.
- Sarannya **ditawarkan, tidak dipakai sendiri**: `SALTED01` cocok ke `SALTED
  EGG` maupun `KOPI SUSU SALTED AREN`, dan menebak salah satunya memindahkan
  porsi ke menu yang salah tanpa satu pun tanda. Petanya di **Pengaturan →
  Kode Menu Paket**, dan bisa diisi langsung dari halaman Menu lewat tombol
  saran. Kodenya **dibakukan huruf besar di satu tempat** — ia diketik kasir,
  jadi `Matcha02` dan `MATCHA02` pasti bercampur.

#### BARIS UKURAN BUKAN MINUMAN TERSENDIRI — ia menempel di baris di atasnya (10 Sep 2026)

Keluhan user: *"jangan kaya gini, bukan dijumlahin — Reguler + ice kopi
laksamana (package) gabung jadi 672, large jadi 195."*

**Angkanya yang membuktikan modelnya.** 672 + 195 = **867**, dan 867 itu persis
`ICE KOPI LAKSAMANA` (834 baris biasa + 33 paket bernama) sebelum kode paket
dipakai. Jadi 195 porsi LARGE bukan porsi TAMBAHAN — ia **menandai 195 dari 867
porsi itu** berukuran large.

**DIBUKTIKAN ATAS DETAIL REPORT AGUSTUS 2026, bukan disimpulkan dari angkanya:**

```
2.619 dari 2.620 baris ukuran (100%) berdiri TEPAT SESUDAH baris menu biasa,
dengan qty SAMA PERSIS:

  ICE AMERICANO      q=1  ->  REGULAR (PACKAGE) q=1  kode=AMERICANO01
  ICE KOPI LAKSAMANA q=2  ->  REGULAR (PACKAGE) q=2  kode=KOPISUSU001
  LYCHEE TEA         q=1  ->  LARGE (PACKAGE)   q=1  kode=LYCHEE02
```

| baris ukuran | porsi | nilai | artinya |
|---|---|---|---|
| `REGULAR (PACKAGE)` | 2.488 | **Rp0** | penanda ukuran murni |
| `LARGE` / `LARGE KOPI` / `LARGE TEH` | 729 | Rp4.097.233 | **biaya upsize** (~Rp5.600/porsi) |

**Jadi menjumlahkannya MENGHITUNG MINUMAN YANG SAMA DUA KALI — 3.218 porsi
hantu di Agustus 2026, tanpa satu pun galat.** Halaman Menu memajang 24.598
porsi untuk 21.381 porsi yang benar-benar terjual, dan tiap menu berminuman
paket terbaca lebih laris daripada kenyataannya.

> **YANG TERCATAT DI BERKAS INI SEBELUMNYA KELIRU**, dan kekeliruannya yang
> membuat ini bertahan: baris "bernama UKURAN (3.218 porsi) → minumannya ada di
> KODE-nya" di bagian *menu paket & Kategori Menu* menyuruh MENGGABUNGKANNYA ke
> menu yang ditunjuk kodenya. Kodenya memang menunjuk minuman yang benar — yang
> salah adalah menganggap porsinya belum terhitung. Contoh keenam di repo ini
> sesudah `hpp.php`, `cocokPic()`, `save_all()` kompas, pengurai .xlsx, dan
> `baca_state()` marketing. **Kalau sebuah baris terlihat seperti item
> tersendiri, buka urutan barisnya di satu bill sebelum menuliskannya sebagai
> fakta.**

**Yang dikerjakan sekarang:**

```
REGULAR  -> tetap di induknya (ukuran bawaan; biaya upsize Rp0)
LARGE/…  -> PINDAH ke barisnya sendiri, berikut biaya upsize-nya

ICE KOPI LAKSAMANA        673      (867 - 194 yang berukuran large)
ICE KOPI LAKSAMANA LARGE  195
```

- **INDUKNYA DICATAT SAAT MENGURAI** (`ukuran[induk][LABEL][KODE]`), karena
  sesudah berkasnya diringkas per nama menu **urutan barisnya hilang
  selamanya**. Itu pula sebabnya laporan lama tidak bisa dibetulkan dari layar:
  ia harus diunggah ulang, dan halamannya mengatakan itu.
- **INDUKNYA HARUS BARIS TEPAT DI ATASNYA, bukan baris menu biasa TERAKHIR.**
  Ada bill yang menyelipkan baris paket bernama di antaranya; kalau rantainya
  tidak diputus, baris ukuran sebuah kopi menempel ke **nasi dua baris
  sebelumnya** dan porsinya dikurangkan dari menu yang sama sekali lain.
  Sudah kejadian saat ditulis — `indukAkhir = null` di tiap baris paket yang
  menutupnya.
- **BARIS UKURAN TANPA INDUK adalah minumannya SENDIRI** (disimpan di bawah
  kunci `''`) — ada paket yang cuma menuliskan baris ukurannya tanpa baris
  minumannya sama sekali (Agustus 2026: 1 porsi, kopi large di dalam paket
  nasi). Di situ menghitungnya tidak menggandakan apa pun; dibuang, porsinya
  hilang dari daftar tanpa satu pun tanda. **Kebalikan persis dari yang
  berinduk** — dan itu sebabnya keduanya tidak boleh diperlakukan sama.
- **DIPECAH SAMPAI KODENYA**, bukan berhenti di labelnya. Dua baris LARGE
  berkode berbeda adalah dua minuman berbeda; dikelompokkan per label saja,
  porsi yang kodenya tidak terbaca ikut terbawa ke menu yang kebetulan kodenya
  paling banyak. Sudah kejadian di uji.
- **NILAI IKUT PINDAH, dan diambil dari baris induknya sendiri** (`u.induk`,
  dicatat saat mengurai) — bukan dibagi rata belakangan, yang cuma perkiraan.
  Total nilai halaman ini karena itu **tidak berubah**; yang berubah cuma ke
  baris mana ia dicatatkan. Kalau nilainya tidak ikut, baris large berdiri
  dengan tiga porsi seharga biaya upsize saja dan rata-rata per porsi induknya
  melonjak.
- **REGULAR TIDAK dipisah.** Yang diminta cuma large berdiri sendiri; memisah
  keduanya membuat tiap menu berdiri dua baris tanpa satu pun pertanyaan yang
  terjawab olehnya.
- **NAMANYA resep HPP kalau kodenya sudah dipasangkan** — itu yang membuat
  bahan bakunya terhitung. Kalau belum: `LYCHEE TEA (LARGE)`, yang tetap
  terbaca orang — jauh lebih berguna daripada `LARGE (PACKAGE) · LYCHEE02` yang
  dipakai sebelumnya.
- **`ukuran` WAJIB ada di daftar kunci tertutup `anSimpanUnggah()`.** Itu
  tempat `paket`/`kategori`/`katMenu` tertinggal lima hari tanpa satu pun
  galat; kunci baru lewat jalur yang sama persis.
- **Induk yang porsinya tidak cukup TIDAK dipaksa** (`ukTotal.minus`) —
  memaksanya membuat baris induk minus, angka yang tidak akan pernah bisa
  dijelaskan. Dilaporkan di layar.

**INVARIANNYA BERUBAH, dan itu memang intinya:**

```
sebelum : gab + dikeluarkan            === menu mentah
sekarang: gab + dikeluarkan + (ukuran − ukuran tanpa induk) === menu mentah
```

Menurunkannya berarti membuang penjaga paling menentukan di berkas itu; yang
benar menyatakan ulang apa yang sekarang BUKAN porsi. Nilai tetap
`gab + dikeluarkan === menu mentah` — tidak ada rupiah yang hilang.

**`digabung` sekarang menghitung paket BERNAMA saja** (Agustus 2026: 905
porsi). Baris ukuran tidak lagi ikut di sana karena ia memang tidak digabungkan
ke mana pun — ia dipindahkan, dan itu dihitung terpisah di `ukTotal`.

**Laporan lama tetap harus diunggah ulang**, dan halamannya mengatakannya
berikut sebabnya. Porsinya sementara itu **tidak dihitung sama sekali** —
menjumlahkannya mengembalikan hitung-ganda yang baru saja ditutup.

```bash
node tools/uji-analytics.js   # 383 pemeriksaan (dari 373)
```

Delapan mutasi dicoba, kedelapannya tertangkap. Yang terakhir — *"rantai induk
tidak diputus baris paket"* — **LOLOS di putaran pertama** karena fixture-nya
belum punya bill berbentuk begitu, padahal bentuk itu ADA di produksi dan
justru itulah bug yang ditemukan saat menulisnya.



#### Tapis kelompok, urut kolom, dan bulan pembanding (11 September 2026)

Empat permintaan user dalam satu pesan, dan ketiganya yang pertama menyentuh
**dua halaman sekaligus** — Menu & Bahan Baku dan Kategori Menu. Penggambarnya
karena itu **satu**: `thSort()`, `urutKolom()`, `sortKlik()`, `kelOpsi()`,
`kelSegHtml()`, `gabungBanding()`, `selSelisih()`, `pctUbah()`. Dua halaman
yang cara mengurutkannya berbeda membuat yang berpindah antar keduanya harus
belajar dua kali, dan dua penggambar panah yang sendiri-sendiri akan menyimpang
begitu salah satunya diperbaiki — panah yang menunjuk arah BERLAWANAN dengan
urutan barisnya tidak melempar apa pun, dan yang membacanya menyimpulkan
datanya yang salah.

**1. Tapis FOOD / BEVERAGES.** Kelompok atas TIDAK tersimpan per menu — yang
tersimpan cuma `kategori[detail].kat`, jadi jalurnya menu → kategori detail →
kelompok (`kelMenu()`, sejajar dengan `menuKatLewat()` yang menempuh jalur
sama untuk pertanyaan lain). Kelompoknya lalu **menempel di tiap baris `gab`**
lewat argumen keempat `tambah()`.

- **PILIHANNYA DIHITUNG DARI DATANYA**, bukan daftar tertutup FOOD/BEVERAGES.
  Halaman Kategori Menu juga memuat **OTHERS**, dan tombol yang tidak pernah
  digambar untuknya berarti barisnya tidak bisa dicapai dari mana pun.
  Di halaman Menu, OTHERS memang tidak muncul — ia sudah dikeluarkan seluruhnya
  sejak 10 September 2026, dan tombol yang menyaring ke daftar yang selalu
  kosong dilaporkan sebagai halaman rusak.
- **LABELNYA NILAI APA ADANYA DARI POS**, tidak diterjemahkan jadi
  Makanan/Minuman: kolom Kelompok di tabel yang sama menulis FOOD/BEVERAGES,
  dan tapis bertuliskan "Minuman" di atas kolom bertuliskan "BEVERAGES" membuat
  orang mencari hubungan yang tidak perlu ada. (Beda dari `namaJenis()` di
  Daftar Resep HPP — di sana nilainya `food`/`drink`, yang memang bukan kata
  yang pernah dilihat siapa pun di layar lain.)
- **YANG KOSONG TIDAK PERNAH MENIMPA yang sudah terbaca.** Satu baris gabungan
  diisi dari beberapa nama mentah (menu biasa + baris paketnya + baris
  ukurannya), dan sebagian memang tidak punya kelompok. Kalau yang kosong boleh
  menimpa, kelompok sebuah menu bergantung pada **URUTAN baris di berkas POS** —
  dan itu berubah tiap ekspor.
- **Baris ukuran TANPA induk memang tidak punya kelompok**, dan sengaja tidak
  ditebak: `ukuran` dikunci induk+label+kode, jadi nama mentahnya sudah hilang.
  Menebaknya "pasti minuman" salah diam-diam begitu ada paket makanan
  berukuran. Jumlahnya **disebut di layar** saat tapisnya menyala.

**KARTU DI ATAS TABEL: IKUT di halaman Menu, TIDAK IKUT di halaman Kategori** —
dan perbedaan itu disengaja, bukan kelalaian:

| | kartunya | sebabnya |
|---|---|---|
| Menu & Bahan Baku | **IKUT** tersaring | kartunya menggambarkan DAFTARNYA; "Menu Berbeda 259" di atas tabel berisi 120 adalah selisih yang dilaporkan sebagai data hilang |
| Kategori Menu | **TIDAK** ikut | kartunya menggambarkan KELOMPOKNYA — justru yang hilang kalau ia menyusut jadi satu kartu begitu tapisnya menyala |

Di halaman Menu tapisnya **menyaring seluruh halaman**: daftar menu, perkiraan
bahan baku, dan daftar "belum ada resep" ketiganya diturunkan dari daftar yang
sama, jadi menyaring salah satunya saja berarti dua bagian di satu layar
menyebut jumlah menu yang berbeda untuk bulan yang sama. Itu **dikatakan di
layar**, berikut cara melepasnya.

**2. Kolom yang bisa diurut.** Saklar *Menurut Nilai / Menurut Porsi*
**SENGAJA tidak dicabut** — ia yang membawa keterangan kenapa nilai dan porsi
menjawab hal yang berbeda, dan itu bacaan yang tidak punya tempat lain. Yang
tidak boleh dua adalah **KEADAANNYA**: keduanya membaca `MN_SORT` yang sama,
karena saklar yang menyimpan urutannya sendiri akan menyala di "Nilai"
sementara tabelnya terurut menurut porsi, tanpa satu pun galat.

- **PENGURUTAN DIKERJAKAN DI DALAM `mnIsiMenuHtml()`**, bukan di `vMenu()`.
  Itu yang membuat menekan kepala kolom cukup menggambar ulang **wadahnya**;
  lewat `render()` yang TOTAL, gulir melompat ke atas persis saat orang
  menekan kepala kolom di tabel bagian bawah, DAN kotak cari yang sedang
  diketik ikut dibuat ulang. Jebakan yang sudah dibayar di `queueF()` modul
  Konten dan `gambarDaftar()` panel Kas Kecil.
- **KALIMAT "Diurut menurut …" PINDAH KE KAKI TABEL**, ke dalam wadah itu. Di
  `card-sub` (di luar wadahnya) ia tidak ikut digambar ulang, jadi ia membeku
  di urutan pertama lalu **berbohong sejak klik pertama**.
- **SAKLARNYA PUNYA WADAH SENDIRI** (`#mn_seg_urut`, disegarkan
  `mnGambarUrut()`). Masalah yang sama dengan kalimat di atas, dan ia
  **ketahuan saat menulis ujinya, bukan dari uji mutasi**: keadaannya memang
  sudah satu, tapi saklarnya berdiri di LUAR wadah yang digambar ulang —
  sesudah menekan kolom Qty, tabelnya terurut porsi sementara saklarnya tetap
  menyala di "Nilai". Yang dipisah wadahnya **saklarnya saja**, bukan seluruh
  barisnya: kotak cari berdiri di baris yang sama dan tidak boleh ikut dibuat
  ulang. Dijaga dua mutasi — yang tidak menyegarkannya, dan yang
  menyegarkannya lewat `render()` yang menyeret kotak carinya.
- **Halaman Kategori memanggil `render()`**, dan itu benar: tabelnya digambar
  langsung ke `#app-view` dan tidak punya kotak isian yang perlu diselamatkan
  fokusnya. Memberinya wadah terpisah cuma demi ini berarti menyalin pola
  pemisahannya tanpa ada yang diselamatkan.
- **Kolom "% dari nilai menu" TIDAK bisa diurut**: penyebutnya sama untuk
  seluruh baris, jadi urutannya persis sama dengan kolom Nilai — dan dua kepala
  kolom yang memulangkan urutan yang sama membuat panahnya menyala di tempat
  yang tidak dicari orang.
- **BATANGNYA MENGIKUTI KOLOM YANG DIURUT** kalau itu qty atau nilai. Batang
  selalu dibaca sebagai gambar dari kolom di sebelahnya; batang nilai di
  sebelah tabel terurut porsi memajang baris teratas dengan batang TERPENDEK,
  dan itu terbaca sebagai salah hitung, bukan sebagai salah kolom.
- **YANG KOSONG SELALU DI BAWAH**, ke arah mana pun urutannya. Kolom pembanding
  untuk baris yang tidak ada di bulan itu bernilai null; ikut diurut sebagai
  nol, membalik arah memajang satu layar penuh baris kosong — persis di tempat
  yang paling dicari.
- **Yang sama besar dipisah NAMANYA**, bukan dibiarkan: urutan yang berubah
  sendiri tiap render membuat baris melompat saat halaman digambar ulang.
- `urutKolom()` **selalu memulangkan SALINAN** — `sort` menyunting di tempat,
  dan daftar yang dipakai kartu di atas tabel tidak boleh ikut berubah.

**3. Bulan pembanding.** `BLN_BANDING` **satu kendali dipakai bersama** kedua
halaman: dua pemilih yang berdiri sendiri-sendiri akan menyimpang, dan yang
membandingkan kedua halaman untuk bulan yang sama tidak punya cara tahu bulan
pembanding mana yang berlaku di sebelah.

- **BULAN YANG SEDANG DIBUKA TIDAK DITAWARKAN.** Bulan aktif bisa **BERGANTI**
  sesudah pembandingnya dipilih, jadi syaratnya diperiksa lagi tiap kali dibaca
  (`blnBandingAktif()`) — bukan cuma saat memilih. Kalau tidak, sebuah bulan
  bisa berakhir membandingkan dirinya sendiri: satu kolom selisih nol yang
  tidak menjawab apa pun, dan yang melihatnya menyimpulkan pembandingnya rusak.
- **DAFTARNYA GABUNGAN KEDUA BULAN** (`gabungBanding()`). Menu yang bulan lalu
  terjual 500 porsi lalu bulan ini HILANG justru pertanyaan yang paling sering
  dibawa orang ke pembanding, dan daftar yang cuma memuat bulan ini tidak bisa
  menjawabnya sama sekali. Barisnya ditandai **tidak ada bulan ini** — `ada` /
  `adaB` DIBEDAKAN dari qty nol: menu yang ada di daftar tapi tidak terjual
  satu porsi pun adalah hal lain.
- **PEMBANDING TIDAK BOLEH MENGGESER SATU PUN ANGKA BULAN INI**, dan inilah
  invarian terpentingnya. Kartu, penyebut kolom persen, perkiraan bahan baku,
  dan total kaki tabel semuanya dihitung dari baris yang `ada !== false`.
  Kalau ikut bergerak, halaman ini berhenti bisa dibandingkan dengan berkas
  POS-nya sendiri — dan selisihnya tidak akan pernah bisa dijelaskan.
- **Jumlah baris tabel karena itu LEBIH BESAR daripada kartu "Menu Berbeda"**,
  dan itu **disebut di kaki tabel** berikut sebabnya. Selisih tanpa keterangan
  dilaporkan sebagai salah hitung.
- **PERSEN PERTUMBUHAN DITAHAN kalau pembandingnya nol** (`pctUbah` → null),
  bukan ditulis 100% atau ∞. Menu yang bulan lalu tidak ada sama sekali tidak
  punya persen pertumbuhan yang berarti, dan angka yang dikarang di sana dibaca
  sebagai lonjakan yang sesungguhnya.
- **Selisih NOL tidak diberi warna maupun tanda**: hijau untuk "tidak berubah"
  membuat mata mencari perubahan yang memang tidak ada.
- **Bentuk baris pembanding WAJIB disamakan dulu.** `kategori[n]` menyimpan
  kelompoknya di `.kat` sementara baris halaman ini memakai `.kel`; diserahkan
  mentah ke `gabungBanding()`, kategori yang HANYA ada di bulan pembanding
  lahir tanpa kelompok dan **lenyap begitu tapisnya menyala**, tanpa satu pun
  galat.
- **Pembanding yang tidak bisa dipakai DIKATAKAN** — bulan yang laporannya Bill
  Report tidak punya satu pun nama menu, dan bulan yang laporannya lama tidak
  punya kolom kategori. Kolom penuh nol terbaca sebagai "bulan itu tidak
  menjual apa-apa"; kolom yang tidak muncul sama sekali terbaca sebagai halaman
  rusak.
- **Perkiraan bahan baku TETAP dari porsi bulan ini saja**, dan itu dikatakan
  di rincian menunya. Menjumlahkannya dengan bulan pembanding memberi angka
  yang tidak pernah keluar dari gudang mana pun.

**4. Rincian kategori ikut membandingkan menunya** (`ktRincian(d, x, B)`).
Inilah tempat *"analisa masing-masing sub menu bisa dibandingin dengan bulan
lain"* benar-benar dijawab per menu: barisnya dibuka, dan tiap menu di dalamnya
berdiri berdampingan dengan angkanya di bulan pembanding — termasuk menu yang
bulan lalu ada di kategori itu lalu bulan ini hilang.

> **Yang BELUM dikerjakan, dan itu disengaja:** pembanding ini cuma ada di
> **Menu & Bahan Baku** dan **Kategori Menu** — dua halaman yang jadi isi
> permintaan yang sama. Halaman lain (Hari & Jam, Metode Kunjungan, Promo &
> Klaim) masih menuntut berpindah bulan. Kalau suatu hari diminta, yang perlu
> dipakai ulang `pilihBanding()` + `gabungBanding()` yang sudah ada — jangan
> menulis pemilih bulan pembanding kedua.

```bash
node tools/uji-analytics.js   # 464 pemeriksaan (dari 383)
```

**Delapan belas mutasi dicoba; enam belas tertangkap, dan DUA sisanya
EKUIVALEN** — bukan cacat uji:

| mutasi | kenapa ekuivalen |
|---|---|
| penyebut kolom persen memakai `baris`, bukan `urut` | baris yang hanya ada di bulan pembanding **selalu bernilai NOL bulan ini** |
| total kaki tabel Kategori memakai `list`, bukan `listKini` | sebab yang sama persis |

Keduanya memulangkan angka yang sama karena satu invarian, jadi yang dikunci
**invariannya** (`gabungBanding` diuji sebagai unit): kalau suatu hari baris
pembanding ikut membawa nilai ke kolom bulan ini, kedua mutasi itu berhenti
ekuivalen DAN asersi invariannya berbunyi lebih dulu. Kodenya tetap memakai
`urut`/`listKini` — yang benar menurut maksudnya, bukan yang kebetulan sama
hasilnya.

**Empat mutasi LOLOS di putaran pertama**, dan dua di antaranya cacat uji yang
sudah ditutup — keduanya bentuk yang sudah punya nama di berkas ini:

- *"kelompok kosong boleh menimpa yang sudah terbaca"* LOLOS karena **tidak
  satu pun menu di fixture ditulis DUA KALI**: tanpa baris `(PACKAGE)`,
  argumen kelompok tidak pernah datang dua kali untuk nama yang sama dan
  penjaganya tidak pernah dijalankan. Ditutup dengan
  `MATCHA LATTE (PACKAGE)` yang sengaja TIDAK didaftarkan di `katMenu` —
  begitulah bentuknya di produksi.
- *"kartu kelompok di halaman Kategori ikut tersaring"* LOLOS karena asersinya
  mencari `>FOOD<`, dan **tombol tapis di halaman yang sama juga berbunyi
  `>FOOD</button>`** — jadi ia cocok dengan tombolnya tanpa pernah menyentuh
  kartunya. Sekarang yang dibaca label kartunya sendiri
  (`<div class="lab">FOOD</div>`). Bentuk yang sama dengan asersi hampa di
  kolom Kontribusi dan di pita "belum diinput finance".

Fixture-nya dibuat supaya tiap kesalahan punya tempat
untuk muncul, dan itu yang paling menentukan di bagian ini: **urutan menurut
nilai, menurut porsi, dan menurut abjad ketiganya BERBEDA** — kalau tidak,
mutasi "kolom qty diurut pakai nilai" tidak mengubah satu baris pun dan lolos
tanpa bunyi. Begitu juga harus ada menu yang **hanya** ada di bulan pembanding
DAN yang hanya ada di bulan ini: penggabung yang cuma menyalin satu arah tetap
hijau kalau salah satunya tidak ada. Resep HPP ikut diberikan justru supaya
daftar bahan baku benar-benar terisi — tanpa resep, tapis yang tidak menyaring
daftar bahan tetap hijau karena daftarnya memang selalu kosong (pelajaran yang
sudah dibayar di mutasi *"cari bahan tidak menyaring"*).

Satu jebakan uji yang layak diingat: nama kategori `KOPI & TEH` digambar
**ter-escape** (`&amp;`), dan asersi yang membandingkan teks mentah gagal untuk
kode yang benar. Fixture-nya sengaja TETAP memuat `&` supaya escaping-nya ikut
terjaga; yang dibetulkan pembaca selnya (`teksSel`), bukan fixture-nya.


##### Revisi: bingkainya PER HARI, bukan per jam (11 September 2026)

Dua permintaan user sehari setelah halamannya lahir.

**1. "Tidak perlu menampilkan jam tapi secara hari saja."** Jamnya tetap yang
MENGHITUNG — itu yang membuat angkanya berarti — tapi yang dibaca orang
tanggalnya. Tabel **Per Malam** jadi tabel utama: satu baris = satu
penampilan, dengan **Kontribusi hari itu** = omset selama jam tampilnya dibagi
omset **seluruh hari** itu.

**JAM SESUDAH TENGAH MALAM DIPISAH, bukan dibuang dan bukan dicampur.** Slot
22:30–01:30 menempati jam 0 & 1 yang di POS tercatat di **tanggal berikutnya**,
sementara penyebut kontribusinya omset **tanggal penampilan**. Dicampur ke
pembilang, persennya jadi angka yang tidak punya arti dan bisa melewati 100%
tanpa sebab yang bisa dijelaskan — di data uji Fuego akan berbunyi 88% dari
hari yang omsetnya tidak pernah memuat jam 0 dan 1 itu. Jadi:

| kolom | isinya |
|---|---|
| Omset di jam tampil | SELURUH jam tampil, termasuk sesudah tengah malam |
| └ baris kecil di bawahnya | berapa dari situ yang jatuh sesudah tengah malam |
| Kontribusi hari itu | hanya jam yang jatuh di tanggal penampilan ÷ omset hari itu |

Dua angka dengan dua penyebut yang jelas selalu lebih berguna daripada satu
angka yang harus ditebak dasarnya.

- **Penyebutnya disebut DI SELNYA** (*dari Rp15.000.000 hari itu*), bukan cuma
  di kepala kolom. Kepala kolom dibaca sekali, angkanya dibaca tiap baris —
  pelajaran empat putaran pertanyaan di kolom Kontribusi halaman Pengaruh
  Event.
- **Hari yang belum punya data POS ditulis “belum ada data POS”, bukan 0%.**
  Nol berarti tidak ada satu rupiah pun masuk di jam tampilnya, dan itu jawaban
  yang salah untuk hari yang berkasnya memang belum diunggah.
- **Kolom Kontribusi tidak bisa dijumlahkan**, dan itu dikatakan: dua penampil
  semalam bisa menempati jam yang beririsan.
- **Tabel per jam TIDAK dicabut**, cuma turun ke bawah dan berganti judul jadi
  *Pembanding: Jam Tampil vs Jam Yang Sama Tanpa Penampil*. Ia menjawab satu
  hal yang tabel per malam tidak bisa: apakah jam tampilnya memang lebih besar
  daripada jam yang sama saat tidak ada penampil. Mencabutnya berarti halaman
  ini kehilangan satu-satunya kendali yang jujur atas pertanyaan "tinggi atau
  tidak".

**2. "Band A tampil di hari Selasa, terus Senin depan — saya pengen tau secara
per harinya."** Baris di tabel **Per Penampil** sekarang bisa diklik, dan
membukanya memperlihatkan seluruh malam orang itu berjajar: tanggal, nama hari,
jam, omset di jamnya, omset hari itu, kontribusinya.

- **Dibaca dari `TN_CACHE` yang SAMA dengan tabel Per Malam**, bukan dihitung
  ulang. Dua tempat yang menghitung porsi malam yang sama akan menyimpang, dan
  yang menyimpang di sini dua angka untuk satu malam di satu layar.
- **RINGKASAN PER HARI DALAM SEMINGGU ikut**, dan angkanya **rata-rata, bukan
  jumlah**: band yang tampil empat kali di Sabtu akan selalu mengalahkan yang
  tampil sekali, dan itu bukan jawaban atas "hari mana yang paling besar untuk
  dia". Hari dalam seminggu menentukan omset jauh lebih besar daripada siapa
  yang tampil — tanpa pengelompokan ini, band yang selalu dapat Selasa dan band
  yang selalu dapat Sabtu dibandingkan lewat total, dan yang membacanya
  menyimpulkan yang satu jauh lebih menarik daripada yang lain.
- **Digambar HANYA kalau ia tampil di lebih dari satu hari** — ringkasan satu
  baris yang mengulang tabel di atasnya tidak menjawab apa pun.
- Menekan baris yang sedang terbuka **menutupnya**, aturan yang sama dengan
  `mnBuka()` di halaman Menu.
- **Nama hari dari `dowDari()` (UTC)**, bukan `new Date(t).getDay()`: yang
  kedua dibaca di zona peramban, dan laptop berzona lain akan menyebut hari
  yang berbeda untuk tanggal yang sama. Aturan yang sama dengan `isoDari()`.

```bash
node tools/uji-analytics.js   # 526 pemeriksaan (dari 503)
```

**Sebelas mutasi dicoba, kesebelasnya tertangkap** — tiga baru tertangkap
sesudah ujinya dibetulkan, dan ketiganya bentuk yang berbeda:

| yang lolos | sebabnya | yang ditutup |
|---|---|---|
| hari tanpa data POS ditulis 0% | **cacat fixture** — tiap tanggal penampilan punya data POS, jadi cabangnya tidak pernah dijalankan | penampilan di 8 Sep, tanggal yang sengaja tidak ada di berkas |
| ringkasan per hari menjumlahkan, bukan merata-rata | tiap penampil cuma tampil sekali per hari, jadi jumlah = rata-rata | **asersi SUMBER** |
| nama hari dari zona peramban | di WIB hasilnya kebetulan sama | **asersi SUMBER** |

Dua yang terakhir **tidak bisa dibedakan saat dijalankan di mesin ini**, jadi
yang dijaga sumbernya — pola yang sama dengan penjaga zona di `isoDari()`, yang
mutasinya juga lolos seluruh pemeriksaan runtime di mesin berzona WIB dan cuma
merah di laptop yang zonanya lain.

> **SATU CACAT PRODUK DITEMUKAN OLEH ASERSI BARU ITU SENDIRI**: kolom *Omset di
> jam tampil* menulis **Rp0** untuk tanggal yang tidak ada di berkas POS. Nol di
> situ berarti "tidak ada satu rupiah pun masuk selama ia tampil" — kesimpulan
> tentang malam yang datanya belum pernah dibaca siapa pun, dan persis konflasi
> yang sudah dijaga di kolom Kontribusi **tepat di sebelahnya**. Dua kolom di
> satu baris tidak boleh menjawab pertanyaan yang sama dengan keyakinan yang
> berbeda. Sekarang keduanya berbunyi *belum ada data POS*.

> **PENCARI BARIS DI UJI WAJIB DIJEPIT KE KARTUNYA.** Halaman ini sekarang
> punya DUA tabel yang sama-sama menulis nama penampil di dalam `<b>` — Per
> Malam dan Per Penampil — jadi pencari yang menyapu seluruh halaman menemukan
> yang teratas, dan asersi tentang tabel kedua diuji atas tabel pertama.
> Tujuh asersi lama langsung merah karenanya saat tabel baru ini dipasang, dan
> itu bentuk yang sama dengan asersi hampa di kolom Kontribusi: cocok dengan
> sel yang bukan yang diuji. Sekarang ada `kartuHtml(judul)` dan
> `barisDi(html, nama)`.


###### Tabel pembanding jam: disaring, dan dijelaskan dengan contoh

Ditanyakan user 11 September 2026: *"Pembanding: Jam Tampil vs Jam Yang Sama
Tanpa Penampil, ini maksudnya apa?"* — dengan layar yang memperlihatkan **jam
00:00 sampai 16:00 seluruhnya berbunyi "tidak ada pembandingnya"**.

**Pertanyaannya wajar, dan tabelnya memang rusak bacaannya.** Penampil di venue
ini mulai tampil jam 20:00, jadi jam siang tidak pernah punya sisi kiri — dan
20-an baris kosong itu **mengubur empat sampai enam baris** yang justru berisi
jawabannya.

- **Hanya jam yang `adaN > 0` yang digambar.** Tabelnya ada untuk
  MEMBANDINGKAN; jam yang tidak pernah sekali pun ada penampilnya tidak punya
  apa-apa untuk dibandingkan.
- **Jumlah jam yang disembunyikan DISEBUT** berikut sebabnya. Daftar yang
  menyusut tanpa keterangan terbaca sebagai data yang hilang.
- **Penyaringnya JANGAN dibuat `adaN > 0 && takN > 0`.** Jam yang selalu ada
  penampilnya memang tidak punya pembanding — tapi barisnya tetap perlu berdiri,
  karena "tidak pernah sekali pun tanpa penampil" itu sendiri jawaban. Dijaga
  mutasi tersendiri.
- **Penjelasannya sekarang memberi CONTOH satu baris** (baris 21:00 dibaca
  bagaimana), bukan cuma menyebut aturannya. Aturannya sudah disebut sejak
  halaman ini lahir dan ternyata tidak cukup — yang menolong contohnya.

###### Cari nama band di tabel Per Malam

Permintaan user di pesan yang sama. Dicari di **nama penampil, kategori, dan
nama hari** sekaligus: "fuego", "band", dan "sabtu" tiga pertanyaan yang
sama-sama wajar dibawa ke tabel ini, dan kotak yang cuma mencari nama akan
terasa rusak untuk dua yang lain.

- **Kotaknya SENDIRI**, terpisah dari kotak di kartu Per Penampil. Dua tabel itu
  menjawab pertanyaan yang berbeda — yang satu "malam apa saja", yang satu
  "siapa saja" — dan satu kotak untuk keduanya berarti mencari satu nama ikut
  memangkas tabel di sebelahnya. Pola yang sama dengan tiga kotak cari di
  halaman Menu & Bahan Baku.
- **Menggambar ulang WADAHNYA saja** (`tnGambar()`), bukan halamannya: kotak
  yang dibuat ulang kehilangan fokus dan hanya huruf pertama yang masuk.
- **Kata kunci tanpa hasil DIKATAKAN**, bukan tabel kosong.

```bash
node tools/uji-analytics.js   # 539 pemeriksaan (dari 526)
```

Delapan mutasi dicoba, kedelapannya tertangkap — termasuk penyaring yang
terlalu rakus dan kotak cari yang cuma mencari nama.


#### Metode Kunjungan dapat dimensi kedua: METODE PEMBAYARAN (13 Sep 2026)

Permintaan user: *"saya ingin metode ini jangan dilihat dari visit purpose,
tapi berdasarkan juga payment method. Nah semisalnya di payment methodnya
online, itu ada yg grab food ada yg gofood, minta bantu juga di jabarkan."*

Halamannya sekarang memajang **dua dimensi yang berbeda**, dan bedanya yang
membuat keduanya perlu berdiri bersama:

| kolom POS | menjawab | isinya (Agustus 2026) |
|---|---|---|
| `Visit Purpose` | **cara tamu datang** | DINE IN, ESB ORDER, ONLINE, TIKTOK GO |
| `Payment Method` | **cara mereka bayar** | QRIS, CASH, EDC, GRABFOOD, GOFOOD, VOUCHER, … |

Pertanyaan aslinya dijawab tabel **Cara Tamu Datang**, yang tiap barisnya
dirinci per metode bayar tepat di bawahnya: **ONLINE → GRABFOOD 78 transaksi,
GOFOOD 7**. Digambar LANGSUNG, bukan di balik klik — yang membuka halaman ini
sedang membawa pertanyaan itu, dan jawaban yang harus dicari dulu sama saja
belum dijawab.

##### `Payment Method` HANYA ADA DI DETAIL REPORT

Diperiksa atas kedua berkas POS Agustus 2026: **Bill Report tidak punya kolom
itu sama sekali** (45 kolomnya sudah diperiksa satu per satu). Jadi
ketiadaannya di sana BUKAN berarti kolomnya lupa dicentang saat ekspor, dan
halamannya membedakan kedua sebab itu:

| keadaan | yang dikatakan |
|---|---|
| laporannya Bill Report | bentuk itu memang tidak punya kolomnya — **unggah Detail Report** |
| Detail Report lama | kolomnya baru dibaca 13 Sep 2026 — **unggah ulang**, lalu kalau tetap kosong ekspor ulang dengan kolomnya dicentang |

Disamakan, yang membacanya akan mengekspor ulang Bill Report berkali-kali
untuk kolom yang memang tidak pernah ada di sana. **Tabel Cara Tamu Datang
TETAP digambar** — yang kurang satu dimensi, bukan seluruh halamannya.

##### SATU BILL BISA DIBAYAR BEBERAPA METODE, dan POS menulisnya SATU STRING

```
VOUCHER (25.000),QRIS MANDIRI (15.250)
QRIS BRI (500.000),QRIS MANDIRI (4.167.925)
```

Dikelompokkan apa adanya, string itu berdiri sebagai metode tersendiri —
Agustus 2026 menghasilkan **90-an "metode"** yang masing-masing dipakai satu
dua kali, dan yang sungguhan (QRIS, CASH, EDC) terkubur di antaranya.
`pecahBayar()` memecahnya jadi komponen.

- **DIPECAH PADA KOMA DI LUAR KURUNG** (`/,(?![^()]*))/`). Nominal di berkas
  ini memakai titik sebagai pemisah ribuan, jadi koma polos aman **hari ini** —
  tapi berkas yang suatu hari menulis `CASH (1,500)` akan terbelah di tengah
  angkanya dan melahirkan dua metode hantu bernama `CASH (1` dan `500)`.
- **Metode tunggal bernominal `null`, BUKAN 0** — supaya bisa dibedakan dari
  nominal nol yang memang tertulis (`VOUCHER (0),QRIS MANDIRI (45.000)`).

**`angka()` TIDAK BISA MEMBACA NOMINAL ITU, dan salahnya berbeda besarnya di
tiap bentuk.** Ia benar untuk sel .xlsx numerik — di sana titik memang pemisah
DESIMAL — dan salah untuk angka yang ditulis sebagai TEKS berformat Indonesia:

```
"4.167.925"  -> 4,167   parseFloat berhenti di titik KEDUA
"25.000"     -> 25      seribu kali lebih kecil
```

Dibaca begitu, rasio `QRIS BRI (500.000),QRIS MANDIRI (4.167.925)` jadi
**500 : 4,167 yaitu 99% untuk QRIS BRI**, padahal yang benar 11%. Karena itu
ada `angkaTampil()` — pemisah desimalnya yang MUNCUL PALING BELAKANG, jadi
`"1.234,56"` (Indonesia) maupun `"1,234.56"` (Inggris) sama-sama benar.
Jebakan yang sama sudah dibayar di baris total Promotion Report.

##### NOMINAL TUNAI ADALAH UANG YANG DISERAHKAN, BUKAN YANG DITERIMA

Ini yang paling mudah salah dan paling tidak kelihatan salahnya.

```
QRIS BRI (100.000),CASH (30.000)   tagihan 128.500   jumlah nominal 130.000
```

Selisih Rp1.500 itu **kembalian**. Bukan dugaan — dari **393 bill
berpembayaran gabungan** Agustus 2026, **115** yang jumlah nominalnya tidak
sama dengan tagihan **SELURUHNYA** punya komponen tunai, selisihnya **selalu
MUAT** di komponen itu, dan **tidak satu pun** yang jumlahnya lebih KECIL
daripada tagihan.

Jadi kelebihannya dipotong dari komponen tunainya (`BAYAR_TUNAI`), bukan dibagi
rata. Bedanya terlihat: dibagi rata, **VOUCHER Agustus berbunyi Rp3.248.559** —
padahal voucher di sini kelipatan Rp25.000 dan yang benar **Rp3.617.500**.
Angka yang tidak bulat di kolom yang isinya kelipatan bulat adalah satu-satunya
tanda yang pernah ada, dan tidak ada yang akan menyadarinya.

- **Tanpa komponen tunai, kelebihannya TIDAK ditebak jatuh ke mana pun** —
  porsinya tetap menurut nominal. Menebak siapa yang menerima kembalian berarti
  menggeser uang ke metode yang tidak pernah menerimanya.
- Aturannya **DISEBUT DI LAYAR**, bukan cuma di komentar kodenya: ia keputusan
  tentang uang.

##### Dikumpulkan PER BILL, dibaginya sesudah seluruh baris dibaca

`pbBill[kunciBill] = { pm, grand, vp:{ visitPurpose: omsetBarisnya } }`

- **Bukan pilihan gaya.** Porsi tiap metode baru bisa dihitung sesudah TAGIHAN
  SELURUH BILL diketahui — kembaliannya tidak bisa dipotong dari tagihan yang
  belum lengkap. Dibagi per baris, nominal yang sama dipakai berkali-kali
  (sekali untuk tiap menu), dan di data uji VOUCHER berbunyi Rp28.333 alih-alih
  Rp25.000.
- **`vp` ikut dicatat di wadah yang sama** supaya silang "cara datang ×
  metode bayar" lahir dari PEMBAGIAN YANG SAMA. Dihitung di tempat kedua,
  rincian sebuah baris berhenti berjumlah sama dengan baris induknya — dua
  angka untuk hal yang sama, di satu tabel.
- **`bayar` dan `kunjungBayar` WAJIB ada di daftar kunci tertutup
  `anSimpanUnggah()`.** Itu tempat `paket`, `kategori`, dan `katMenu`
  tertinggal lima hari tanpa satu pun galat. Diuji lewat putaran simpan
  SUNGGUHAN, bukan dengan menyuntikkannya ke `AN.data.laporan`.
- **Set diubah jadi angka sebelum disimpan** — Set tidak bisa di-JSON-kan, dan
  dikirim apa adanya ia jadi `{}` sehingga SELURUH jumlah transaksi berbunyi
  nol tanpa satu pun galat.

##### Kolom OMSET boleh dijumlahkan, kolom TRANSAKSI tidak

Dan keduanya berdiri bersebelahan di satu baris, jadi bedanya wajib dikatakan:

| kolom | boleh dijumlahkan? | sebabnya |
|---|---|---|
| omset | **YA**, pas ke total sebulan | porsinya selalu berjumlah 1 |
| transaksi | **TIDAK** | satu bill gabungan dihitung PENUH di tiap metodenya |

Agustus 2026: 5.180 di kolom transaksi untuk 4.785 bill sungguhan. Selisihnya
**disebut angkanya** di layar berikut sebabnya; didiamkan, ia dilaporkan
sebagai angka yang salah di salah satu halaman.

**Invarian omset itu pemeriksaan terkuat di bagian ini** dan satu-satunya yang
tidak bisa basi sendiri: ia menangkap pembagian apa pun yang salah — nominal
yang salah baca, kembalian yang dibagi rata, atau porsi yang tidak berjumlah 1.

##### Yang lain

- **Kartu teratas menyebut DIMENSINYA** — *Cara Datang Terbanyak* dan *Metode
  Bayar Terbanyak*, bukan "Paling Sering" saja. Sejak halaman ini memajang dua
  dimensi, label yang tidak menyebut yang mana persis mengulang pertanyaan yang
  sudah empat kali datang di kolom Kontribusi.
- **Penyebut persen di baris rincian adalah INDUKNYA, bukan sebulan**, dan itu
  ditulis DI SELNYA (`65% dari ONLINE`). Kepala kolom dibaca sekali, angkanya
  dibaca tiap baris.
- **Yang kolomnya kosong diberi namanya sendiri** (`(tanpa keterangan)`), tidak
  dibuang dan tidak dijatuhkan ke metode pertama — aturan yang sama dengan
  `KAT_TANPA` dan `katEvent()`.
- **Judul tabel Visit Purpose diganti** dari *Per Metode* jadi **Cara Tamu
  Datang**: dua tabel yang sama-sama berjudul "metode" di satu halaman membuat
  yang membacanya harus menebak yang mana.

```bash
node tools/uji-analytics.js   # 586 pemeriksaan (dari 539)
```

**Sembilan belas mutasi dicoba; EMPAT lolos di putaran pertama**, dan
keempatnya cacat FIXTURE atau ASERSI — bukan cacat produk. Ketiga bentuknya
sudah punya nama di berkas ini:

| yang lolos | sebabnya | yang ditutup |
|---|---|---|
| nominal tak terbaca diberikan PENUH ke tiap metode | tidak ada satu pun bill gabungan TANPA nominal di fixture — cabangnya tidak pernah dijalankan, dan asersi unitnya cuma membaca penandanya, tidak pernah porsinya | bill `EDC BCA,MEMBER DEPOSIT` + asersi porsinya berjumlah 1 |
| diurut menurut omset, bukan transaksi | QRIS MANDIRI kebetulan teratas menurut KEDUA-DUANYA, dan asersinya cuma membaca baris pertama | satu metode berbill DUA tapi beromset kecil; yang dikunci baris KEDUA |
| penyebut persen rincian memakai total sebulan | mutasinya cuma menyentuh SATU dari dua kolom persen, dan asersinya cuma mencari kata "dari ONLINE" — masih ketemu di kolom satunya | jumlah kemunculannya DIHITUNG (6), plus angkanya dibandingkan |
| silang dibagi menurut tagihan bill | tidak ada bill yang barisnya memuat DUA cara datang, jadi `pb.vp[vp]` selalu sama dengan `pb.grand` | bill B10: satu bill, baris DINE IN dan ONLINE |

Fixture-nya dirancang supaya tiap kesalahan memberi hasil yang BERBEDA dan
tidak satu pun angkanya bertabrakan: bill bermenu dua baris (supaya pembagian
per baris punya tempat gagal), gabungan bernominal PAS, gabungan dengan tunai
yang dilebihkan, gabungan tanpa nominal sama sekali, nominal berpemisah ribuan
tiga kelompok (supaya `angka()` vs `angkaTampil()` menjungkirkan rasionya),
ONLINE yang pecah jadi dua metode, dan satu bill yang barisnya dua cara datang.


##### REKAP KANAL: ONLINE dipecah jadi GrabFood & GoFood (15 Sep 2026)

Permintaan user: *"metode kunjungan ini di rekap, Dine in, GrabFood, Gofood,
Tiktok go, ESB Order"*. Halamannya sekarang dibuka tabel **Rekap Kanal** —
satu daftar yang menjawab "dari kanal mana tamunya datang", berdiri di atas
dua tabel yang sudah ada.

**SEBABNYA satu kolom tidak cukup, dan itu bisa diukur:** POS menulis GrabFood
MAUPUN GoFood sebagai Visit Purpose yang sama — **ONLINE** — dan bedanya cuma
hidup di kolom Payment Method. Diukur atas Detail Report Agustus 2026:

```
  3626 trx   Rp597.034.359   DINE IN
  1060 trx   Rp123.522.200   ESB ORDER
    78 trx     Rp7.184.400   GRABFOOD    (dari ONLINE)
    11 trx       Rp496.126   TIKTOK GO
     7 trx       Rp748.050   GOFOOD      (dari ONLINE)
     3 trx     Rp1.267.500   ONLINE      <- SISA, bukan kanal
```

**TIGA BILL TERAKHIR ITU YANG MENENTUKAN BENTUKNYA.** ONLINE punya 88 bill;
85 di antaranya ojol, TIGA sisanya dibayar EDC BRI, CASH, dan satu pembayaran
gabungan QRIS. Kalau baris ONLINE sekadar DIBUANG sesudah dipecah, omset rekap
berhenti sama dengan tabel **Cara Tamu Datang** di halaman yang sama — dan
selisih Rp1.267.500 itu tidak akan bisa dijelaskan siapa pun. Sisanya karena
itu tetap berdiri sebagai barisnya sendiri, memakai nama induknya.

- **DIHITUNG SAAT MENGGAMBAR** (`rekapKanal()`), bukan saat mengurai. Daftar
  kanalnya bisa bertambah bulan depan, dan laporan yang sudah tersimpan tidak
  akan pernah bisa ikut membaik kalau hasilnya dibakukan ke dalam ringkasan.
  Aturan yang sama dengan `menuNormal()`. **Tidak ada kunci baru di
  `anSimpanUnggah()`**, dan tidak ada yang perlu diunggah ulang.
- **INVARIANNYA: omset rekap SAMA PERSIS dengan omset Cara Tamu Datang.** Itu
  pemeriksaan terkuat di bagian ini dan satu-satunya yang tidak bisa basi
  sendiri — ia menangkap pemecahan apa pun yang salah: sisa yang dibuang,
  kanal yang dihitung dua kali, atau induk yang tidak dikurangi. Di data
  produksi ia berbunyi **Rp730.252.635**, sama dengan `ringkas.grand`.
- **Sisanya dihitung sebagai PENGURANGAN** (`g - sg`), bukan dijumlahkan ulang
  dari metode yang bukan kanal. Keduanya kebetulan sama besar — porsi tiap
  metode selalu berjumlah 1 — jadi mutasinya EKUIVALEN; yang dipakai tetap
  pengurangan karena itu yang benar menurut maksudnya.
- **SISA BILL DIJEPIT KE NOL.** Bill pecahan dihitung PENUH di tiap kanalnya,
  jadi jumlahnya bisa melampaui bill induknya (satu bill dibayar GrabFood DAN
  GoFood). Tanpa dijepit, barisnya berbunyi **"-1 transaksi"** — angka yang
  tidak akan pernah bisa dijelaskan, sekelas dengan baris induk minus yang
  sudah dijaga `ukTotal.minus`. Omsetnya TIDAK ikut dijepit: porsinya memang
  selalu berjumlah 1.
- **DAFTAR KANALNYA TERTUTUP** (`KANAL_BAYAR`), dan itu memang bisa basi. Tapi
  gagalnya TERLIHAT, bukan diam: bill-nya tetap dihitung di baris induknya,
  dan **nama metodenya ditulis di layar** ("ONLINE masih menyisakan… EDC BRI,
  CASH, QRIS BRI"). Itu yang membuat kanal berikutnya ketahuan tanpa ada yang
  perlu memeriksa kode.
- **KATA UTUH, bukan potongan** (`\bGO\s*FOOD\b`). **GOPAY metode bayar, bukan
  kanal pemesanan** — aturan potongan akan memecah DINE IN jadi baris GOPAY
  yang tidak pernah diminta siapa pun. Aturan yang sama dengan `pbHead()` yang
  mencari "Head" dan menolak "Overhead".
- **Kanal hasil pemecahan MENYEBUT induknya** (*· dari ONLINE*). Tanpa itu,
  yang membandingkan rekap ini dengan tabel Cara Tamu Datang akan mencari
  GRABFOOD di sana dan menyimpulkan keduanya tidak sinkron — padahal ia memang
  tidak pernah ada di Visit Purpose.
- **DINE IN tidak ikut dipecah.** Yang dipecah hanya cara datang yang metode
  bayarnya berupa kanal; memecah semuanya membuat tiap cara datang berdiri
  lima baris tanpa satu pun pertanyaan yang terjawab olehnya.

```bash
node tools/uji-analytics.js   # 601 pemeriksaan (dari 586)
```

**Sembilan mutasi dicoba, kesembilannya tertangkap** — dua di antaranya baru
sesudah asersinya ditambah, dan keduanya bentuk yang sudah punya nama di
berkas ini:

| yang lolos | sebabnya | yang ditutup |
|---|---|---|
| `kanalKah` jadi potongan, bukan kata utuh | fixture tidak punya satu pun metode yang namanya MEMUAT nama kanal tanpa menjadi kanal | asersi UNIT: GOPAY, GRABPAY, MANGO FOODS ketiganya bukan kanal |
| sisa bill tidak dijepit ke nol | bentuk pemicunya (satu bill DUA kanal) tidak ada di fixture | asersi UNIT atas `rekapKanal()`, bukan menambah bill ke fixture bersama |

> **SEMBILAN ASERSI LAMA LANGSUNG MERAH saat kartu ini dipasang**, dan
> semuanya cacat UJI: asersinya mengiris halaman dengan
> `v.indexOf('Cara Tamu Datang')`, sementara kartu baru di ATASNYA memang
> menyebut frasa itu di prosanya — karena omsetnya wajib berjumlah sama dengan
> tabel itu, dan kalimat yang menyebutnya justru yang menahan orang
> menyimpulkan keduanya tidak sinkron. Sekarang ada `kartuJudul(html, judul)`,
> yang mengiris SATU kartu menurut `<h3>`-nya. Bentuk yang sama persis dengan
> pencari baris di halaman Performa Talent — dan ini kali kedua ia menggigit.


##### Dua tabel lama DICABUT — tinggal Rekap Kanal (15 Sep 2026)

Permintaan user beberapa jam sesudah Rekap Kanal lahir: *"Metode Pembayaran
dan Cara Tamu Datang di hapus saja"*. Halaman Metode Kunjungan sekarang
berisi **SATU tabel**.

| yang dicabut | isinya |
|---|---|
| **Metode Pembayaran** | 90-an metode hasil pemecahan pembayaran gabungan |
| **Cara Tamu Datang** | kolom Visit Purpose apa adanya, berikut rincian per metode bayar di bawah tiap barisnya |

**DATANYA TIDAK IKUT DICABUT.** `d.bayar` dan `d.kunjungBayar` tetap diurai
dan tetap disimpan — yang kedua justru yang memecah ONLINE jadi GrabFood &
GoFood, jadi mencabutnya berarti mencabut tabel yang diminta berdiri. Tidak
ada kunci yang hilang dari `anSimpanUnggah()`, dan tidak ada yang perlu
diunggah ulang.

**PEMBANDING DI LAYAR HILANG BERSAMANYA, dan itu yang paling mahal.** Omset
Rekap Kanal wajib berjumlah sama persis dengan omset Cara Tamu Datang —
pemeriksaan terkuat di halaman itu, dan satu-satunya yang tidak bisa basi
sendiri. Selama kedua tabel berdiri bersebelahan, siapa pun bisa
membuktikannya dengan mata. Sekarang yang menjaganya **hanya**
`tools/uji-analytics.js`, dan asersinya dihitung dari `d.kunjung` langsung
**bukan dari tabel yang sudah tidak digambar**. Kalau asersi itu suatu hari
ikut dicabut, pemecahan kanal yang salah tidak punya satu pun tempat untuk
ketahuan. Komentar di atas `rekapKanal()` mengatakan itu di tempatnya.

**TIGA KETERANGAN PINDAH, bukan ikut dibuang** — ketiganya menjelaskan angka
yang MASIH dipajang, dan tanpa mereka baris kanalnya jadi angka yang harus
ditebak dasarnya:

| keterangan | kenapa masih perlu |
|---|---|
| kembalian tunai dipotong dari komponen tunainya | menggeser omset tiap kanal |
| pembagian rata untuk bill tanpa nominal | menggeser omset tiap kanal |
| kolom transaksi tidak bisa dijumlahkan | menjelaskan kaki tabelnya sendiri |

Yang keempat juga pindah: **penjelasan kenapa bulan itu tidak bisa dipecah**,
berikut KEDUA sebabnya (Bill Report memang tidak punya kolom Payment Method
vs Detail Report yang diunggah sebelum kolomnya dibaca). Dulu ia hidup di
kartu Metode Pembayaran; disamakan atau dibuang, yang membacanya mengekspor
ulang berkas yang salah berkali-kali.

**KEEMPAT KARTU DI ATASNYA DIHITUNG DARI TABEL ITU**, bukan dari `d.kunjung`
atau `ringkas.bill`. Kartu *Cara Datang Terbanyak* diganti **Kanal
Terbanyak** dan dibaca dari `RK.baris[0]`; kartu *Metode Bayar Terbanyak*
dicabut bersama tabelnya. Sebabnya bukan kerapian: memecah ONLINE
**MENGECILKAN** baris induknya, jadi "cara datang terbanyak" dan "kanal
terbanyak" tidak selalu sama — dan kartu yang menyebut nama yang tidak ada
di baris mana pun adalah selisih yang berdiri di satu layar.

```bash
node tools/uji-analytics.js   # 627 pemeriksaan (dari 633)
```

Jumlahnya **TURUN**, dan itu memang benar: 13 asersi yang menguji kedua tabel
itu ikut dicabut, diganti 7 yang menguji KETIADAANNYA plus pindahnya ketiga
keterangan. Sepuluh mutasi dicoba, kesepuluhnya tertangkap — termasuk
memasang kembali salah satu tabelnya dan membaca kartu dari `ringkas.bill`.

> **Asersi ketiadaan diperiksa lewat `<h3>`-nya, bukan lewat frasanya.** Kartu
> Rekap Kanal menyebut nama kedua tabel yang dicabut di prosa dan komentarnya
> — justru supaya yang membandingkannya dengan berkas POS tidak menyimpulkan
> keduanya tidak sinkron. Asersi yang menyapu seluruh halaman akan cocok
> dengan kalimat itu tanpa pernah menyentuh tabelnya. Ini **kali ketiga**
> bentuk itu menggigit di berkas ini.

> **Mutasi "kartu dibaca dari Ringkasan" HANYA bisa dibedakan di fixture yang
> punya bill pecahan**, tempat jumlah transaksi rekap MELAMPAUI jumlah bill
> sungguhan. Di fixture Visit Purpose keduanya sama, dan asersi yang sama
> persis akan hampa di sana. Syarat `bT !== ringkas.bill` karena itu ikut
> dikunci di asersinya: kalau fixture-nya suatu hari berubah sampai keduanya
> sama, ia berbunyi — bukan diam-diam berhenti menguji apa pun.


#### Halaman Error & Koreksi Bill (15 September 2026)

Permintaan user: *"tambahkan menu tab baru namanya Error gabungan dari (Error
Floor, Error System, Error Kitchen, Error Bar, Error Customer) dan didalam
error ini saya ingin melihat detail bill dan notes nya kenapa hal itu bisa
terjadi, saya ingin yang menginput bill disaat itu siapa juga"*. Kunci view
`error`.

**PENANDANYA AWALAN "ERROR", BUKAN KELIMA NAMA ITU.** Diukur atas Agustus 2026,
yang benar-benar ada di data cuma dua — dan salah satunya **tidak disebut di
permintaan**:

```
  Payment Method (Detail Report) : ERROR KASIR, ERROR FLOOR
  Additional Info (Bill Report)  : ERROR CASHIER, ERROR FLOOR
```

Tidak satu pun dari Error System / Kitchen / Bar / Customer muncul bulan itu.
Daftar tertutup berisi lima nama yang disebut akan **MEMBUANG ERROR KASIR
tanpa satu pun tanda**, dan bulan yang punya bill bermasalah terbaca bersih.

##### Penandanya di DUA kolom berbeda, dan itu menentukan bentuk halamannya

Ini yang paling menentukan di bagian ini, dan bukan pilihan kita — POS memang
menaruhnya di tempat berbeda di tiap bentuk laporan:

| | penanda | yang IKUT | yang TIDAK ADA |
|---|---|---|---|
| **Detail Report** | `Payment Method` | rincian menu + waiter per baris | **Cashier**, **Additional Info** |
| **Bill Report** | `Additional Info` | kasir + catatan bebas + waiter bill | **rincian menu** |

**Keduanya dibaca**, dan yang tidak bisa diisi **DIKATAKAN di layar** berikut
laporan mana yang memuatnya. Sel kosong tanpa keterangan terbaca sebagai data
hilang, dan yang membacanya akan mengekspor ulang berkas yang sama
berkali-kali — aturan yang sama dengan pesan Payment Method di halaman Metode
Kunjungan.

> **Satu bulan menyimpan SATU laporan**, jadi kasir dan rincian menu memang
> tidak bisa ada bersamaan. Itu disebut di layarnya, bukan didiamkan. Kalau
> suatu hari keduanya harus ada sekaligus, yang perlu diubah model "satu bulan
> satu laporan" — bukan halaman ini.

##### Yang gampang salah, dan sudah diukur

- **`Additional Info` BUKAN penanda error dengan sendirinya.** Untuk bill biasa
  isinya **nama tamu** — "CHRISTI", "INDAH OFFICE", "office wandi" (2.030 dari
  4.786 bill terisi). Yang menandai error cuma isinya yang memuat kata ERROR.
  Membaca kolomnya sebagai penanda akan menandai separuh bulan sebagai error.
- **`Menu Notes` BUKAN sebab bill dibatalkan.** Isinya catatan MEMASAK —
  "dadar" (134x), "Dingin", "Less sugar". Dipajang apa adanya di rincian menu,
  dan **dikatakan** bahwa ia bukan alasan; yang mencari sebabnya akan
  membacanya sebagai sebab kalau tidak.
- **`Employee Name` TIDAK dipakai sebagai "siapa".** Diukur: isinya "-" di
  **15.918 dari 19.739 baris**. Yang benar-benar berisi nama **Waiter**
  (99,97%) dan **Cashier**. Nilai "-" juga disaring di sini — ia kolom kosong
  versi POS ini, bukan nama orang.
- **Kasir dan waiter DIBEDAKAN, tidak digabung jadi satu angka.** Bill
  LMCL202608080396 waiter-nya TASYA di Bill Report tapi SULIS & SPV per baris
  menu di Detail Report, sementara kasirnya ANDY. Digabung, yang membacanya
  tidak tahu ia sedang melihat yang memproses bill atau yang mencatat pesanan.
  Kartu "terbanyak" karena itu menyebut yang mana.
- **Dikumpulkan PER BILL, bukan per baris.** Satu bill Detail Report tersebar
  di beberapa baris menu dan tiap barisnya membawa penanda yang sama —
  dikumpulkan per baris, satu bill berdiri dua kali dan nilainya terpecah.
- **Label diambil dari KOMPONEN yang berawalan ERROR**, bukan seluruh string.
  Pembayaran gabungan "CASH (15.000),ERROR BAR (5.000)" harus berdiri sebagai
  ERROR BAR; dibiarkan utuh, ia label yang tidak akan pernah bisa
  dikelompokkan dengan apa pun.
- **`error` WAJIB disebut di daftar kunci tertutup `anSimpanUnggah()`.** Itu
  tempat `paket`, `kategori`, dan `katMenu` tertinggal lima hari tanpa satu
  pun galat. Diuji lewat putaran simpan SUNGGUHAN.
- **Bulan sebelah dibuang** dengan aturan yang SAMA PERSIS dengan `hari[]` dan
  `hariJam[]` — kalau tidak, halaman ini memajang bill bulan lain sementara
  seluruh halaman lain tidak.
- **Daftarnya dipotong di 400 bill** (`ERR_MAKS`), dan yang terpotong DISEBUT
  angkanya. Di produksi sebulan cuma 3 bill, tapi POS yang suatu hari menandai
  seluruh bill error akan membuat blob ringkasannya meledak.

##### TIGA keadaan kosong, dan ketiganya menuntut tindakan berbeda

| keadaan | yang dikatakan |
|---|---|
| `error` tidak ada (laporan lama) | **unggah ulang** berkas bulan itu |
| `error` kosong, kolom penandanya ADA | **tidak ada bill error bulan ini** — itu JAWABAN |
| `error` kosong, kolom penandanya TIDAK ADA | berkasnya **tidak punya kolom penandanya**; halaman ini tidak bisa menyimpulkan apa pun |

Yang ketiga itu sebabnya `ringkas.errSumber` ada: **ketiadaan kolom penanda dan
bulan yang benar-benar bersih memulangkan bentuk data yang SAMA PERSIS**.
Disamakan, yang membacanya menyimpulkan tidak ada masalah padahal tidak ada
satu pun yang pernah diperiksa.

```bash
node tools/uji-analytics.js   # 633 pemeriksaan (dari 601)
```

**Empat belas mutasi dicoba, keempat belasnya tertangkap** — tapi TIGA di
antaranya baru sesudah ujinya dibetulkan, dan ketiganya bentuk yang sama:

> **ASERSI YANG MELEMPAR MEMBUNUH SELURUH SUITE, dan mutasinya lalu terbaca
> "uji tidak selesai" — bukan "tertangkap".** Dua asersi membaca
> `error[0].kasir` apa adanya, dan ketiga blok keadaan kosong memanggil
> `go('error')` tanpa penjaga. Begitu sebuah mutasi mengosongkan daftarnya
> atau membuat penggambarnya melempar, node mati sebelum ringkasan tercetak
> dan hasil mutasinya **tidak bisa dibaca sama sekali**. Sekarang
> `go('error')` dibungkus `try` dan kegagalannya jadi asersi merah
> tersendiri — yang sekaligus menjaga perilaku yang benar: penggambar yang
> melempar meninggalkan **halaman SEBELUMNYA** di layar, utuh dan
> menyesatkan, persis gejala Performa Kas yang mati senyap.

Satu mutasi lagi LOLOS bersih sebelum ditutup: **"bill bulan sebelah ikut
terbawa"** — tidak ada satu pun asersi yang menjaganya. Ditutup dengan baris
30 Juli di fixture-nya sendiri, bukan di fixture bersama.

#### KODE MENU DIISI DI HPP & RESEP — sumber utamanya sekarang di sana (10 Sep 2026)

Permintaan user: *"dari di HPP & Resep bisa masukin menu code, jadi kalau
misalnya menu code-nya ada yg sama brrti menu nya itu nama menu yg di ambil
dari hpp & resep."*

Tiap resep **Menu Jadi** di `deploy/stock/hpp/` sekarang punya kotak **Kode menu
di POS** (`hpp_resep.kode`). Baris paket `LARGE (PACKAGE)` di laporan POS
membawa kodenya sendiri, jadi begitu keduanya cocok menunya diketahui **tanpa
daftar pasangan terpisah** — dan ukuran selesai dengan sendirinya, karena resep
large-nya yang memegang kode large.

**KENAPA DI HPP, BUKAN DI PENGATURAN ANALYTICS.** Pasangannya jadi hidup di
tempat yang sama dengan resepnya — satu-satunya tempat yang benar-benar tahu
resep mana yang dimaksud. Daftar pasangan di Pengaturan menyimpan **nama sebagai
teks**: nama resep yang diperbaiki ejaannya di HPP diam-diam berhenti cocok, dan
gejalanya cuma porsi yang berhenti masuk ke menunya.

**DUA SUMBER, DAN URUTANNYA MENENTUKAN:**

| | |
|---|---|
| `kode` di HPP | **menang** |
| `setting.petaKode` (Pengaturan Analytics) | **cadangan**, untuk kode yang belum diisi di HPP |

Dibalik, mengisi kode di HPP **tidak akan mengubah apa pun** selama pasangan
lamanya masih ada — perubahan yang gagal DIAM-DIAM, dan yang mengisinya tidak
punya satu pun cara tahu kenapa. Kalau keduanya ada dan **berbeda**, selisihnya
**disebut di layar** berikut kedua nilainya, bukan dipilih diam-diam.

- **`base` TIDAK PERNAH jadi tujuan sebuah kode** (`tipe === 'dish'` saja). Ia
  tidak dijual — porsinya akan pindah ke sesuatu yang tidak pernah muncul di
  daftar menu mana pun.
- **SATU KODE DIPAKAI DUA RESEP → tidak dipasangkan ke mana pun**, dan
  dilaporkan berikut nama kedua resepnya. Memilih salah satunya berarti menebak
  resep mana yang dapat porsinya berikut bahan bakunya, dan **kedua jawabannya
  sama-sama terlihat wajar**. Porsinya tetap dihitung, berdiri sebagai barisnya
  sendiri dengan nama yang menyebut kodenya — jadi sebabnya terlihat.
- **Kode dibakukan huruf besar DI SATU TEMPAT: server** (`hpp_simpan_resep`).
  Ia diketik orang lewat dua jalur (form dan impor Excel), jadi `Matcha02` dan
  `MATCHA02` pasti bercampur — dan yang bercampur tidak pernah cocok dengan kode
  dari POS, tanpa satu pun galat. `strtoupper`, **bukan** `mb_strtoupper`:
  fungsi mbstring yang tidak terpasang mematikan SELURUH endpoint folder itu.
- **Kolomnya lahir lewat `hpp_pastikan_kolom()`, BUKAN berkas migrasi.**
  Migrasi di repo ini rutin tertinggal di produksi, dan `CREATE TABLE IF NOT
  EXISTS` tidak pernah menyentuh tabel yang sudah berisi. Ditambahkan di
  **dua** tempat: daftar ALTER itu, dan `CREATE TABLE` untuk pemasangan baru.
- **`Kode POS` WAJIB ikut di ekspor DAN impor Excel** (`KOL_RESEP`, `kepala`,
  `kosong`, dan pembacanya). Kalau cuma salah satu, satu putaran
  ekspor–sunting–impor **mengosongkan kodenya di seluruh resep** — server
  menulis SELURUH kolom tiap simpan. Yang menyadarinya adalah orang yang
  membuka Analytics minggu depan dan mendapati seluruh baris paket kembali
  tidak dikenali. Dijaga uji putaran penuh di `uji-excel-resep.js`.
- **Catatan bentrok & kode kembar digambar DI LUAR kartu "kode yang belum
  dipasangkan"** — kartu itu cuma muncul kalau ADA yang belum dipasangkan, dan
  bentrok justru keadaan waktu semuanya sudah terpasang tapi ke tujuan yang
  berbeda. Di dalamnya, peringatan itu tersembunyi persis pada satu-satunya
  keadaan yang melahirkannya.

`menuNormal()` tidak diubah sama sekali — ia sudah memakai nama tujuan apa
adanya. Daftar `petaKode` lama juga tidak dicabut: ia tetap jalan keluar untuk
menu yang belum punya resep di HPP.

```bash
node tools/uji-analytics.js     # 383 pemeriksaan (dari 354)
node tools/uji-excel-resep.js   # 65 pemeriksaan (dari 58)
```

Enam mutasi dicoba untuk aturan kodenya, keenamnya tertangkap. Sisi PHP-nya
**tidak bisa dijalankan** di mesin pengembangan, jadi kontraknya dijaga
terhadap SUMBERNYA di `uji-excel-resep.js` — server tiruan menerima apa saja,
dan kolom yang tidak pernah ditulis tidak menimbulkan galat di satu sisi pun.
Pelajaran yang sudah dibayar di stub `hpp.php` pada `uji-analytics` dan di
kontrak `omsetHari`.


##### Nama menu dibakukan HURUF BESAR — dan itu yang menghapus baris gandanya

Permintaan user 10 September 2026: *"saya ingin nya ice kopi laksamana tidak
perlu ada duplikasi… terus namanya di capslock saja khusus utk bagian analytics
biar ngikuti yang lain saja."*

Dua permintaan, satu sebab. Nama menu di halaman ini datang dari **dua sumber
yang menulisnya dengan gaya berbeda**:

```
POS  ->  "ICE KOPI LAKSAMANA"   (semua huruf besar)
HPP  ->  "Ice Kopi Laksamana"   (diketik orang)
```

Keduanya bertemu begitu sebuah kode paket dipasangkan ke resep — dan karena
`gab` dikunci **string persis**, satu minuman yang sama berdiri sebagai DUA
baris:

| | porsi | nilai |
|---|---|---|
| `ICE KOPI LAKSAMANA` (nama dari POS) | 867 | Rp23.712.000 |
| `Ice Kopi Laksamana` (nama resep HPP, lewat kodenya) | 640 | Rp0 |

Tidak satu pun melempar galat. Yang terjadi: **menu terlarisnya terbaca separuh
dari yang sebenarnya**, dan bahan bakunya terpecah dua — lalu yang
mencocokkannya dengan stok gudang mencari selisih yang tidak pernah ada.
Sesudah dibakukan: **1.507 porsi dalam satu baris**.

- **Dibakukan di SATU tempat: `tambah()` di dalam `menuNormal()`.** Seluruh
  layar Menu & Bahan Baku (daftar penjualan, perkiraan bahan, "belum ada
  resep", kotak salinnya) diturunkan dari `gab`, jadi membakukannya per layar
  berarti dua layar menyebut jumlah menu yang berbeda untuk bulan yang sama.
- **AMAN terhadap pencocokan resep**, dan itu yang harus diperiksa sebelum
  menyentuhnya lagi: seluruh pembacaan resep memakai `resepPeta()` yang dikunci
  huruf **kecil** (`peta[nama.toLowerCase()]`), jadi nama yang dibesarkan tetap
  menemukan resepnya di HPP. Yang berubah cuma yang TAMPIL dan yang
  DIKELOMPOKKAN.
- **Yang beda UKURAN tetap terpisah.** `ICE KOPI LAKSAMANA` dan `ICE KOPI
  LAKSAMANA LARGE` dua baris, dan memang harus: takarannya berbeda. Yang
  disatukan nama yang SAMA, bukan menu yang mirip.
- **Aturan penggabungan `(PACKAGE)` tidak disentuh** — yang berubah kunci
  kelompoknya, bukan aturannya. `ICE KOPI LAKSAMANA (PACKAGE)` tetap melebur ke
  `ICE KOPI LAKSAMANA` seperti sebelumnya (Agustus 2026: 905 porsi dari baris
  paket bernama jelas).
- **Fixture di uji SENGAJA tetap Title Case** (`Kopi Susu Aren`, `Menu Tanpa
  Resep`, `Menu 01`) — justru itu yang membuktikan pembakuannya bekerja.
  Fixture yang ikut dibesarkan membuat mutasi "pembakuan dicabut" LOLOS tanpa
  satu asersi pun bergerak.

> **Paket event: omsetnya dan bahan bakunya memang terpisah, dan itu benar.**
> Diukur atas Agustus 2026: baris header paket (`LEMKARI`, `BIRTHDAY 17 SIDIK`)
> berkategori **EVENT** → dikeluarkan dari Menu & Bahan Baku, sementara minuman
> yang disertakan di dalamnya (`ICE KOPI LAKSAMANA (PACKAGE)`, Rp0) berkategori
> **BEVERAGES** → ikut, digabung, menambah porsi tanpa menambah nilai. Itu yang
> diinginkan untuk bahan baku — 33 kopi itu sungguh diseduh. Akibatnya
> rata-rata harga per porsinya sedikit turun; uangnya tidak hilang, ia ada di
> kategori EVENT di halaman Kategori Menu.


#### Saran pasangan dijepit ke UKURAN, dan ikut membaca Daftar Resep HPP (10 Sep 2026)

> **Bagian di bawah ini jalur CADANGAN.** Sejak kode diisi di HPP (lihat
> bagian di atas), sarannya cuma dipakai untuk kode yang belum punya resep
> berkode di sana. Aturan ukurannya tetap berlaku.

Permintaan user: kode yang muncul sebagai `LARGE (PACKAGE)` *"bisa didefine
menu yg menggunakan kata large di modul HPP & Resep → daftar resep"*.

**SEBABNYA: laporan POS tidak punya satu pun menu yang namanya menyebut
ukuran** — diperiksa atas Agustus 2026, **nol dari 259 menu**. Ukurannya cuma
hidup di nama baris paket (`LARGE (PACKAGE)`) dan di kodenya (`...001` regular,
`...002` large). Selama sarannya cuma diambil dari nama menu laporan, kode
LARGE **tidak akan pernah punya satu pun tombol yang benar**: yang ditawarkan
selalu menu regular, dan menekannya meleburkan porsi large ke sana.

Agustus 2026 itu bukan selisih kecil — `KOPISUSU001` 640 porsi dan
`KOPISUSU002` 195 porsi dipasangkan ke nama yang sama jadi **satu baris 835
porsi**, dan bahan bakunya dihitung seolah 835-nya ukuran regular.

- **Sumber sarannya sekarang nama menu di laporan DITAMBAH nama resep di
  HPP**, diambil dari `resepPeta()` yang SAMA dengan yang dipakai `kenal()` di
  halaman Menu. Itu yang menjamin saran di sini tidak pernah menawarkan nama
  yang justru akan mendarat di daftar *belum ada resep*. Dua sumber nama resep
  akan menyimpang, dan yang menyimpang di sini adalah tombol yang menjanjikan
  bahan bakunya ikut terhitung padahal tidak.
- **Resep `base` DIBUANG** (`tipe === 'dish'` saja). Ia bahan olahan, bukan
  menu yang bisa dijual — memasangkan kode paket ke sana memindahkan porsinya
  ke sesuatu yang tidak pernah muncul di daftar menu mana pun.
- **DIJEPIT KE UKURAN BARISNYA.** Kode `LARGE` hanya ditawari nama yang memuat
  kata LARGE; kode `REGULAR` **tidak pernah** ditawari nama berukuran. Salah
  arah mana pun menghitung bahan baku dengan takaran yang salah, dan angkanya
  tetap terlihat wajar.
- **KATA UTUH, bukan potongan** (`\bLARGE\b`). "ENLARGED" dan "LARGEMOUTH"
  tidak boleh membuat sebuah resep dianggap berukuran large. Aturan yang sama
  dengan `pbHead()` yang mencari "Head" dan menolak "Overhead". Diuji.
- **JALAN GABUNG KE REGULAR TETAP ADA**, sebagai `cadangan` yang terpisah dan
  **akibatnya dikatakan** (*porsinya melebur dan bahan bakunya terhitung
  sebagai regular*). Dicabut, kode LARGE tidak punya satu pun tombol sampai
  resepnya dibuat — dan porsinya berdiri sendiri berbulan-bulan.
- **TIGA keadaan kosong dibedakan**, karena bentuk datanya sama (daftar saran
  kosong) tapi tindakannya berbeda, dan kalimat yang salah menyuruh orang
  membetulkan sesuatu yang sudah benar:

  | keadaan | yang dikatakan |
  |---|---|
  | `HP` null | daftar resep HPP tidak terbaca, berikut `HP_ERR` |
  | belum ada resep ber-kata LARGE | buat resepnya di HPP → Daftar Resep, berikut CONTOH namanya |
  | kodenya memang tidak mirip apa pun | isi manual di Pengaturan |

- **`saranKode()` memulangkan `{utama, cadangan}`, bukan array.** Pemanggil
  lama yang memperlakukannya sebagai array tidak melempar — `.length` pada
  objek memulangkan `undefined`, jadi daftarnya cuma diam-diam kosong.
- **Kotak di Pengaturan tetap TEKS BEBAS**, nama resep cuma ditawarkan lewat
  `<datalist>`. Menu yang belum punya resep harus tetap bisa dipasangkan; yang
  tidak boleh cuma menebaknya. Pola yang sama dengan kotak Vendor di lembar
  pembayaran Brankas.

`menuNormal()` tidak perlu diubah sama sekali: ia sudah memakai nama tujuan apa
adanya, jadi kode yang dipasangkan ke `LARGE ICE AMERICANO` otomatis berdiri
sebagai barisnya sendiri dan cocok dengan resep HPP bernama sama.

```bash
node tools/uji-analytics.js   # 354 pemeriksaan (dari 344)
```

Enam mutasi dicoba, keenamnya tertangkap.


**HALAMAN `Kategori Menu` BERDIRI SENDIRI** (permintaan user). Dari kolom
`Menu Category Detail`; Agustus 2026 ada 23 kategori, termasuk **EVENT**
(Rp27,4 juta). Dipisahkan dari peringkat menu bukan demi kerapian: kategori
seperti EVENT menjawab "berapa yang datang dari acara", bukan "menu mana yang
paling laku", dan mencampurnya ke daftar 259 menu membuatnya harus dicari
dengan mata di antara nama-nama minuman.

- **Kelompok atas (FOOD/BEVERAGES/OTHERS) DIHITUNG dari kategori detailnya**,
  bukan disimpan terpisah — dua tempat yang menjumlahkan sendiri-sendiri akan
  berselisih suatu hari, dan yang selisih itu omset.
- **`katMenu` menyimpan menu apa saja yang ada di tiap kategori**, supaya
  barisnya bisa dibuka tanpa mengunggah ulang. Ringkasan yang cuma menyimpan
  total tidak bisa menjawab "isinya apa", dan itu pertanyaan berikutnya yang
  pasti muncul.
- **Laporan lama tidak punya kategori**, dan halamannya MENGATAKAN sebabnya
  berikut cara membetulkannya (unggah ulang) — dibedakan pula antara "Bill
  Report" dan "Detail Report yang diunggah sebelum kolomnya dibaca", karena
  yang keliru menebaknya akan mengunggah berkas yang salah lagi.

**`hpp.php` MEMBALAS PAYLOAD DATAR** — `{bahan, resep, setting, ts}`, tanpa
kunci `ok` dan tanpa kunci `data`. Sama dengan `vendors.php`, beda dari
finance-api/kompas-api yang memakai `{ok,data}`.

Sampai 4 September 2026 `muatSemua()` memeriksa `c.value.ok && c.value.data`,
dan keduanya SELALU `undefined` — jadi `HP` selalu null dan **perkiraan bahan
baku tidak pernah sekali pun terhitung sejak modul ini lahir**. Yang tampil di
layar "Resep dari modul HPP tidak terbaca", yang terdengar seperti gangguan
sementara. Dua hal yang membuatnya bertahan berbulan-bulan, dan keduanya lebih
penting daripada bug-nya sendiri:

- **Komentar di atas barisnya menyatakan sebaliknya** ("hpp.php membalas
  {ok,data}"). Yang membacanya percaya bentuknya sudah diperiksa. Komentar yang
  salah lebih berbahaya daripada tidak ada komentar.
- **Stub `fetch` di `uji-analytics.js` ikut salah** — ia memulangkan `{ok,data}`
  yang tidak pernah dipulangkan server mana pun, jadi 185 pemeriksaan lewat
  tanpa menyentuhnya. Tiruan yang bentuknya beda dari yang ditiru tidak menguji
  apa pun; ia cuma mengulang asumsi yang sama dengan kode yang diujinya.

Sekarang yang diperiksa **bentuk yang benar-benar dipakai** (`resep` berupa
array), bukan kunci status — itu juga menolak balasan galat
`{status:'error',message}` yang dipulangkan `hpp.php` dengan kode 403 kalau
`API_TOKEN` dipasang. Bentuk balasannya dibandingkan dengan **sumber PHP-nya**
di uji, bukan dengan tiruannya. Gagalnya menyebut SEBABNYA (`HP_ERR`): token
salah, modul mati, dan versi beda butuh tiga tindakan yang berbeda.

**Perkiraan bahan baku = qty menu × resep HPP**, dan resepnya **bertingkat**
(`uraiResep()`): resep boleh memakai resep lain dan `yield_qty` dibagi.
Kedalaman dibatasi 6 dan resep yang menunjuk dirinya sendiri DILAPORKAN.

**DUA DAFTAR, dan sengaja TIDAK dijumlahkan** (4 September 2026, permintaan
user). `uraiResep()` mengisi dua wadah sekaligus:

| | isinya | menjawab |
|---|---|---|
| **mentah** (`keluar`) | daun penguraian — yang benar-benar dibeli | berapa yang harus keluar gudang, buat dicocokkan stok fisik |
| **prep** (`prep`) | base yang dilewati penguraian | berapa banyak base yang harus DIPRODUKSI dapur bulan itu |

- **Menjumlahkannya menghitung barang yang sama dua kali**: bahan mentah yang
  MENYUSUN sebuah base sudah ikut terurai di daftar mentah. Itu dikatakan di
  layar, bukan cuma dijaga di kode — daftar yang tidak boleh dijumlahkan tanpa
  penjelasan akan dijumlahkan orang.
- **Base dicatat dalam satuan BARIS RESEPNYA** (mis. `Susu Aren (Pcs)`), bukan
  satuan yield-nya: itulah takaran yang benar-benar diambil dapur, dan yield
  sering berbeda satuan (yield 1000 Ml, dipakai per Ml).
- **Bawaannya MENTAH.** Itu pertanyaan yang lebih sering dibawa orang ke
  halaman ini, dan itu yang dibandingkan dengan stok gudang.
- **Kosongnya dibedakan**: "tidak ada base yang dipakai" adalah jawaban yang
  sah, "tidak ada bahan sama sekali" hampir selalu berarti resepnya belum
  diisi. Dua keadaan itu tidak boleh berbunyi sama.

**Rincian per produk** (`mnRincian`, klik satu baris menu) memakai
`bahanSatuMenu()` yang MENGHITUNG ULANG untuk menu itu — total di bawahnya
sudah dijumlahkan lintas menu dan tidak bisa dipecah balik. Menekan baris yang
sedang terbuka **menutupnya**; kalau tidak, satu-satunya cara menutup rincian
adalah membuka baris lain.

**Daftar penjualan menu punya dua saklar**: urut menurut **Nilai** atau
**Porsi**, dan **20 teratas** atau **Seluruhnya**. Keduanya menjawab pertanyaan
yang berbeda — menu murah yang terjual ratusan porsi menghabiskan paling banyak
bahan, sementara menu mahal menyumbang paling banyak omset, dan yang terlaris
menurut salah satunya sering bukan yang terlaris menurut yang lain. Yang
tersembunyi **disebut jumlah dan nilainya**; daftar yang menyusut tanpa
keterangan terbaca sebagai data yang hilang.

**Menu yang belum ada di HPP disajikan sebagai TEKS yang bisa disalin**
(`mnTakDikenalHtml`, permintaan user). Sebelumnya cuma chip berwarna dan
dipotong 12 — chip tidak bisa disalin, jadi yang mau menambahkan resepnya harus
mengetik ulang puluhan nama sambil bolak-balik antar tab, dan satu huruf yang
meleset membuat menunya tetap tidak cocok. Sekarang tabel lengkap + `<textarea>`
satu-baris-per-menu dipisah TAB (nama · qty · nilai, bisa ditempel ke Excel) +
tombol salin & unduh CSV.

- **`readonly`, BUKAN `disabled`**: yang `disabled` tidak bisa diblok untuk
  disalin manual, dan itu jalan keluar terakhir kalau izin clipboard ditolak
  (`navigator.clipboard` butuh HTTPS dan bisa ditolak). Gagalnya **dikatakan**
  berikut cara manualnya — tombol yang ditekan tanpa reaksi apa pun akan
  ditekan berkali-kali.
- **Tidak dipotong.** Daftar yang dipotong justru menyembunyikan menu yang
  paling perlu ditambahkan.
- Barisnya juga **ditandai di tabel penjualan** (`belum ada resep`): yang
  melihat menu terlaris harus langsung tahu mana yang bahannya tidak ikut
  terhitung, tanpa menggulir ke bawah dan mencocokkan nama.
- Nilai totalnya tetap **disebut berikut persentasenya** — tanpa itu perkiraan
  terlihat lengkap padahal separuh menunya tidak ikut dihitung, dan selisih di
  lapangan akan dikira barang hilang.

**PENGARUH EVENT & PENGARUH MARKETING adalah DUA HALAMAN, satu penggambar**
(2 September 2026, permintaan user). Sebelumnya satu halaman yang mencampur
acara dari modul Event dan modul Marketing — dua hal yang direncanakan tim
berbeda dan dinilai dengan pertanyaan berbeda; dicampur, tidak satu pun
pertanyaan tentang salah satunya bisa dijawab tanpa memilah dengan mata.

Dipisah sebagai **parameter `vDampak(sumber)`, bukan disalin jadi dua fungsi**.
Kalau disalin, satu perbaikan rumus akan berlaku di satu halaman saja — dan dua
halaman yang menghitung "pengaruh" dengan cara berbeda lebih buruk daripada
satu halaman yang tercampur.

**Kategori datang dari dua nama kolom yang berbeda** dan disatukan di satu
tempat (`katEvent()`): `category` di modul Event, `jenis` di Marketing.
Dibiarkan berbeda sampai ke layar, tapis kategori di satu halaman tidak akan
pernah cocok dengan yang di sebelahnya. Yang kosong diberi nama sendiri
(`(tanpa kategori)`), tidak dibuang dan tidak dijatuhkan ke kategori pertama —
acara tanpa kategori tetap membawa omset, dan membuangnya membuat jumlah
kategori tidak pernah sama dengan totalnya.

Dua angka yang diminta user ada di tabel **Per Kategori**: omset yang masuk di
hari-hari kategori itu, dan **berapa persen kontribusinya terhadap seluruh
omset bulan itu**. Yang menahan bug diam-diam:

- **Penyebutnya total omset SEBULAN**, bukan omset hari berevent saja. Salah
  penyebut membuat tiap kategori terlihat menyumbang berlipat-lipat dan tidak
  ada satu pun angka yang kelihatan aneh.
- **Satu hari bisa punya acara dari dua kategori**, dan hari itu ikut dihitung
  di keduanya — jadi kolom Omset **tidak bisa dijumlahkan**. Itu DIKATAKAN di
  layar berikut angka yang tidak berganda; angka yang tidak bisa dijumlahkan
  tanpa penjelasan adalah angka yang berhenti dipercaya.
- **Angka di chip kategori dihitung dari SELURUH acara bulan itu**, bukan dari
  yang sedang tersaring. Kalau ikut, chip yang tidak dipilih selalu menulis
  `0 hari` — dan nol membaca sebagai "tidak ada acara kategori itu".

**Halaman Tren Bulanan** menjawab satu-satunya pertanyaan yang tidak terjawab
dari mana pun sebelumnya: "dibanding bulan lalu bagaimana". Grafiknya memakai
**Chart.js yang memang sudah dimuat modul ini sejak awal tapi belum pernah
dipakai sekali pun**.

- **Ketiadaan `Chart` DIKATAKAN dan tabelnya tetap digambar.** CDN yang mati
  membuat grafik hilang, dan grafik yang hilang diam-diam tidak bisa dibedakan
  dari data yang memang nol.
- **Dua sumbu Y**: total sebulan dan rata-rata sehari berbeda dua orde besaran;
  digambar di satu sumbu, garis rata-ratanya menempel di dasar grafik dan
  terbaca sebagai nol.
- **Menu Report dipisah, bukan digambar sebagai bulan beromset nol.** Batang nol
  di tengah grafik terbaca sebagai bulan yang sepi, bukan sebagai bulan yang
  laporannya berbeda jenis.
- **Satu bulan bukan tren**: kalau baru satu bulan diunggah, yang digambar
  penjelasan + cara melengkapinya, bukan grafik satu batang.
- Pembanding **dua bulan bebas** ada di bawahnya — tabel MoM cuma membandingkan
  dengan bulan tepat sebelumnya, dan "Agustus vs Agustus tahun lalu" tidak
  terjawab oleh selisih berurutan.

**`pilihBulan()` tidak lagi dipotong `slice(0, 14)`.** Bulan ke-15 dan
seterusnya hilang dari layar tanpa satu pun tanda, dan yang mencarinya akan
menyimpulkan laporannya belum pernah diunggah.

**Pengaruh event TIDAK disajikan sebagai sebab-akibat.** Event hampir selalu di
akhir pekan, dan akhir pekan memang lebih ramai tanpa event apa pun — jadi tiap
hari berevent dibandingkan dengan **rata-rata hari yang SAMA tanpa event**, dan
jumlah harinya selalu disebutkan. Peringatannya jangan dihapus supaya
halamannya terlihat lebih tegas.

Berkas POS **jangan di-commit** (sudah di `.gitignore`): satu berkas memuat
seluruh transaksi sebulan.

```bash
node tools/uji-analytics.js   # 230 pemeriksaan
```

#### Pengurai .xlsx menelan sel sesudah tiap sel kosong (10 Sep 2026)

Pertanyaan user: *"kenapa tertulis tanpa keterangan, padahal di Excel ada
Visit Purpose DINE IN, ONLINE dll"* — halaman Metode Kunjungan menulis
**(tanpa keterangan) 4.785 transaksi (100%)**.

**Kolomnya bukan salah nama, dan bukan pula kosong di berkasnya.** XML
mentahnya:

```xml
<c r="L12" s="9" t="inlineStr"><is><t>Pekanbaru</t></is></c>
<c r="M12" s="9"/>                                        <-- Area, KOSONG
<c r="N12" s="9" t="inlineStr"><is><t>DINE IN</t></is></c> <-- Visit Purpose
```

Pola sel di `uraiSheet()` menuntut penutup `</c>`:

```js
/<c r="([A-Z]+)\d+"([^>]*)>([\s\S]*?)<\/c>/g
```

Begitu ia mulai mencocokkan `<c r="M12" s="9"/>`, `([^>]*)` menelan
` s="9"/` lalu pencarian `</c>` **BERLANJUT KE SEL BERIKUTNYA** dan
menghabiskannya. Akibatnya M terbaca kosong dan **N tidak pernah ada sama
sekali** — jadi tiap kolom yang berdiri tepat sesudah kolom kosong hilang
tanpa satu pun galat.

**DAMPAKNYA JAUH LEBIH LUAS DARIPADA KELUHANNYA**, diukur atas kedua berkas
POS Agustus 2026 (74.458 sel self-closing di satu berkas):

| berkas | kolom | hilang |
|---|---|---|
| Detail | `Visit Purpose` | 19.734 baris (100%) |
| Detail | `Order Mode` | 17.812 (90%) |
| Detail | `Menu Code` | 2.800 (14%) |
| Detail | `Menu Notes` | 1.913 (10%) |
| Detail | `Menu` | 4 baris |
| Detail | **`Total After Bill Discount`** | **2 baris — UANG** |
| Bill | `Visit Purpose` | 4.785 (100%) |
| Bill | `Pax Total` | 4.461 (93%) |
| Bill | `Voucher Sales Total` | 4.785 (100%) |

**Yang paling berbahaya bukan kolom yang hilang seluruhnya — itu kelihatan.
Yang berbahaya kolom UANG yang ditelan di beberapa baris saja:** nilainya
jatuh ke nol, totalnya tetap terlihat wajar, dan tidak ada satu pun layar yang
menyebutkannya.

Polanya sekarang mengerti kedua bentuk sel:

```js
/<c r="([A-Z]+)\d+"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g
```

- **`[^>]*?` WAJIB LAZY.** Rakus, ia melewati `/>` sel ini dan mencari `>`
  di sel berikutnya — bug yang sama dengan bentuk lain.
- **Sel self-closing TETAP dicatat sebagai kosong**, bukan dilewati: kolomnya
  memang ada di baris itu, dan yang membaca `Object.keys` untuk menghitung
  lebar baris tidak boleh melihatnya berbeda dari sel kosong berpasangan —
  lihat aturan **LEBAR TSV DARI KOLOM TERJAUH** di impor Jadwal.
- **`mc[3]` undefined untuk sel self-closing** dan wajib dijatuhkan ke `''`;
  diteruskan apa adanya, `.match()` melempar dan seluruh pembacaan berkas mati.

**DUA "FAKTA" DI BERKAS INI TERNYATA GEJALA BUG INI**, dan keduanya sudah
dibetulkan di tempatnya (dengan teks lamanya dicoret, bukan dihapus — supaya
yang pernah membacanya tahu apa yang berubah):

| yang tercatat | yang sebenarnya |
|---|---|
| "`Menu Code` ADA tapi KOSONG di seluruh 19.734 baris; yang berisi kodenya `Custom Menu Name`" | TERBALIK — Menu Code terisi 2.620 dari 2.811 baris (PACKAGE), Custom Menu Name kosong seluruhnya |
| "kolom Pax jarang terisi — cuma 318 dari 4.087 bill" | Pax Total terisi di SELURUH baris: 4.829 pax di 4.785 bill |

> **PELAJARANNYA bukan soal regex.** Kedua kalimat itu ditulis dari HASIL
> PEMBACAAN, bukan dari berkasnya — jadi bug pengurainya tercatat sebagai
> sifat data POS, lalu dipakai membenarkan keputusan lain (pemilihan kolom per
> baris, penyembunyian kartu Pax). Komentar yang salah lebih berbahaya
> daripada tidak ada komentar; ini contoh keempat di repo ini sesudah
> `hpp.php`, `cocokPic()`, dan `save_all()` kompas. **Kalau sebuah kolom
> terbaca kosong, buka XML-nya sebelum menuliskannya sebagai fakta.**

Efeknya **berlaku surut hanya untuk yang diunggah ulang**: laporan yang sudah
tersimpan menyimpan hasil pembacaan lama. Bulan yang perlu Visit Purpose,
Menu Code, atau Pax-nya benar harus diunggah ulang.

```bash
node tools/uji-analytics.js   # 344 pemeriksaan (dari 333)
```

Ujinya menguji `uraiSheet()` sebagai **UNIT, tanpa jsdom dan tanpa berkas POS
asli** — berkas POS tidak boleh di-commit, jadi asersi yang cuma ada di jalur
berkas asli MELEWAT diam-diam di mesin yang tidak punya berkasnya, yaitu tempat
yang paling mungkin menjalankan uji ini. Yang atas berkas asli tetap ada
sebagai penguat: kalau ia merah sementara asersi unitnya hijau, berarti POS
mengganti nama atau bentuk kolomnya — dua sebab berbeda yang layak dipisahkan.

Enam mutasi dicoba, lima tertangkap, dan **yang keenam EKUIVALEN** — bukan
cacat uji: membalik urutan cabang (`>…` sebelum `/>`) tidak mengubah apa pun,
karena kedua cabang menuntut karakter yang BERBEDA di posisi yang sama
(`>` vs `/`) sehingga tidak pernah bisa sama-sama cocok pada satu panjang
`[^>]*?`. Dibuktikan dengan menjalankan kedua pola atas enam bentuk sel.

### Analytics: jembatan tiga layar & kolom Kontribusi (6 September 2026)

Tiga pertanyaan user, dan ketiganya menyentuh angka yang sama dibaca dari
sudut berbeda.

**1. “Kenapa Rekap Penjualan, Dashboard Omset, dan Investor beda?”** Karena
ketiganya memang berbeda — lihat **TIGA KONVENSI PENJUALAN** di bagian
Investor Compass. Yang salah bukan angkanya, tapi tidak adanya satu pun layar
yang menjabarkan bedanya: yang membuka ketiganya untuk bulan yang sama melihat
tiga angka dan menyimpulkan ada uang yang hilang. Sekarang halaman Ringkasan
punya kartu **Jembatan ke Tiga Layar Office** (`jembatanLayar()`), tabel
rekonsiliasi baris demi baris.

- **DIBAYAR TAMU DIULANG sebagai titik tolak jalur kedua**, bukan diganti baris
  keterangan. Net Sales dan Realisasi diturunkan dari angka yang SAMA, bukan
  berurutan. Kalau Service charge langsung menyusul Net Sales, yang membacanya
  akan mengurangkannya dari sana — Agustus 2026 itu memberi Rp236.000.000,
  angka yang tidak ada di layar mana pun dan tetap terlihat wajar. Ujinya
  memeriksa angka rantai-lurus itu **tidak boleh muncul**.
- **Hanya SATU baris yang benar-benar selisih** (POS vs ketikan harian), dan ia
  diwarnai merah serta dikatakan. Sisanya beda konvensi, dan beda konvensi
  bukan sesuatu yang perlu dicari sebabnya.
- **`complimentBulan()` memulangkan `null` kalau register `compliments[]` tidak
  terbaca, BUKAN 0.** Nol membuat Net Sales sama persis dengan Dibayar Tamu —
  angka salah yang terlihat sangat wajar, di baris yang justru dibaca investor.
  Ia dibaca dari register, bukan dari `daily.discount` (itu cuma bill
  discount); kalau suatu hari compliment ikut masuk kolom Discount di Input
  Omset Harian, pengurangannya wajib dicabut di TIGA tempat — di sini, di
  `kp_netsales_hari()`, dan di `laba_rugi_bulanan()`.

**2 & 3. Kolom `vs rata-rata bulan` diganti `Total omset` + `Kontribusi`**, dan
kolom Kontribusi yang sama ditambahkan di **Sebaran per Jam** (permintaan
user). Yang menahan bug diam-diam:

- **PENYEBUTNYA DIHITUNG DARI TABELNYA SENDIRI, bukan `ringkas.grand`.**
  `ringkas` menjumlahkan SELURUH baris berkas termasuk yang tanggalnya jatuh di
  bulan sebelah, sementara `hari` sudah dibuang untuk bulan lain di
  `uraiPos()`, dan `jam` cuma memuat baris yang jamnya terbaca (`jamDari()`
  memulangkan `-1`). Penyebut yang salah membuat kolomnya berhenti berjumlah
  100% tanpa satu pun tanda — di data uji ia jatuh ke 80,8%, dan persen yang
  tidak genap dibaca sebagai omset yang hilang.
- **Sebaran jam memakai `tot` yang SAMA dengan kartu Dua Shift** di atasnya.
  Dua penyebut di satu halaman membuat kolom yang sama berbunyi lain di dua
  tempat, dan yang mencocokkannya tidak punya cara tahu mana yang benar.
- **Omset yang jamnya tidak terbaca DISEBUT nominalnya** di kaki tabel — alasan
  yang sama dengan kartu `Di luar keduanya` yang sengaja tidak disembunyikan:
  jumlah kolom yang tidak sama dengan Ringkasan membuat orang mengira salah
  satu halaman salah.
- **BATANG MENGIKUTI KOLOM TOTAL, bukan rata-rata**, karena batang selalu
  dibaca sebagai gambar dari kolom di sebelahnya. Itu dikatakan di kaki tabel.
- **Rata-rata TIDAK dicabut.** Dua kolom menjawab dua pertanyaan: rata-rata
  “hari mana yang lebih ramai” (adil), kontribusi “dari mana omsetnya datang”
  (dari JUMLAH, jadi bulan dengan lima Sabtu mengangkat Sabtu). Bedanya wajib
  dikatakan di `card-sub` — tanpa itu kolom Kontribusi dibaca sebagai
  pembanding keramaian, dan kolom **Jumlah hari** yang menjelaskannya jadi
  tidak berarti apa-apa.

```bash
node tools/uji-kontribusi-analytics.js   # 54 pemeriksaan, jsdom
```

#### Pengaruh Event & Marketing: tanggal UTC, omset dijabarkan, Top 3 (9 Sep 2026)

Empat revisi user dalam satu pesan, dan yang pertama **bug tanggal yang nyata**.

**1. `start_datetime` adalah INSTANT UTC, dan memotongnya mentah menggeser
acara MUNDUR SEHARI.** Keluhan user: tanggal beberapa acara di halaman ini
berbeda dari tanggal yang sama di modul Event. Dibuktikan dari data dev, bukan
ditebak — `getAll` event-api memulangkan `2026-07-29T18:00:00.000Z`, yaitu
**30 Juli 01:00 WIB**, sementara `isoDari()` memotong sepuluh huruf pertama dan
menulisnya 29 Juli.

Modul Event **sudah mencatat jebakan yang sama persis** di `tglWIB()`
(“memotong string UTC mentah akan menggeser acara lewat tengah malam ke hari
sebelumnya”), dan Analytics tetap melakukannya. Sekarang `isoDari()` menggeser
+7 dulu, tapi **hanya untuk string yang MENYATAKAN zona** (`Z` atau `±hh:mm`):

| bentuk | contoh | diperlakukan |
|---|---|---|
| ber-zona | `2026-08-02T18:00:00.000Z` | digeser → `2026-08-03` |
| tanggal polos | `2026-08-01` (Marketing, POS) | **tidak disentuh** |
| datetime tanpa zona | `2026-08-03 19:00` | **tidak disentuh** |

- **Digeser +7 TETAP, bukan zona peramban.** Tanggal POS dan tanggal Breakdown
  Sumber yang dibandingkan dengannya adalah tanggal usaha WIB; laptop yang
  zonanya tersetel lain akan memindahkan acaranya sendiri.
- **Yang KELEBIHAN digeser sama berbahayanya**: menggeser tanggal polos
  memindahkan tanggal yang tadinya benar ke hari yang salah.

> **ASERSI RUNTIME-NYA TIDAK CUKUP, dan ini pelajaran ujinya.** Di mesin
> berzona WIB, mencabut penjaga zonanya memberi hasil yang SAMA untuk keempat
> bentuk di atas — geser +7 atas tanggal polos tetap jatuh di hari yang sama.
> Mutasi “penanda zona diabaikan” karena itu **LOLOS** dari seluruh
> pemeriksaan runtime dan cuma merah di laptop yang zonanya lain, yaitu tempat
> yang tidak pernah menjalankan uji ini. Yang menangkapnya asersi SUMBER atas
> syaratnya sendiri.

**2. Omsetnya dijabarkan** (permintaan user). Kartu atas sekarang: hari ada
acara · **Omset hari itu** · **Omset event saja** · rata-rata omset hari ada
acara, dan tabel per hari dapat kolom **Omset event saja**.

**DUA SUMBER YANG BERBEDA, dan itu inti kartunya:**

| | isinya |
|---|---|
| `hari[t].grand` | SELURUH tagihan hari itu menurut berkas POS |
| baris `bd.event` / `bd.marketing` | nilai acaranya SENDIRI, diketik finance di Breakdown Sumber |

- **Selisih keduanya BUKAN “omset non-event”**, dan itu dikatakan di layar.
  Selisih POS vs ketikan harian memang selalu ada — halaman Ringkasan punya
  kartunya sendiri untuk itu.
- **Rumus barisnya `amount + tax + service + Open Bill`** — yang benar-benar
  DITAGIHKAN ke tamu, sebanding dengan Grand Total POS. **BUKAN `porsiPic()`**:
  itu aturan bagi-hasil bonus (event dibagi dua), dan memakainya membuat
  kontribusi acara tampak separuh tanpa satu pun tanda.
- **Open Bill DIDELEGASIKAN ke `deploy/assets/performa-bonus.js`** lewat
  `pbObTotal`, tidak disalin. `obAktif`/`obTotal`/`porsiPic` sudah berkas kembar
  di tiga berkas; salinan KELIMA akan menyimpang dengan cara yang sama. Asetnya
  karena itu dimuat halaman ini — dan **uji jsdom WAJIB menyisipkannya inline**,
  kalau tidak jalur Open Bill lewat tanpa disentuh dan angkanya cuma lebih kecil.
- **Hari yang BELUM diisi finance dibedakan dari yang nilainya NOL**
  (`belum diisi`). Disamakan, orang menyimpulkan acaranya gagal padahal
  angkanya belum pernah diketik.
- `BD_DIVISI` **berkas kembar** dengan `d.bd.marketing`/`d.bd.event` di
  `kompas-mysql`. Beda satu huruf tidak melempar — kolomnya cuma berhenti terisi
  dan terbaca sebagai “finance belum mengisi”.

**3 & 4. Kartu “Selisihnya — pembanding kasar” DICABUT**, diganti **Tiga Acara
Penyumbang Omset Terbesar** — di KEDUA tab sekaligus, karena penggambarnya satu
(`vDampak`).

Kenapa yang lama dicabut, dan **jangan dikembalikan tanpa diminta**: ia
membandingkan rata-rata hari berevent dengan rata-rata SELURUH hari biasa.
Acara hampir selalu ditaruh di akhir pekan, dan akhir pekan memang lebih ramai
tanpa acara apa pun — angkanya memuji acara untuk sesuatu yang sudah terjadi
dengan sendirinya. Kartunya sampai harus memasang peringatan yang membantah
angkanya sendiri, dan angka yang perlu dibantah di tempatnya berdiri memang
tidak layak berdiri di sana.

- **Peringatan sebab-akibatnya PINDAH ke tabel per hari, bukan ikut terbuang.**
  Kolom `vs hari sama` di sanalah yang sekarang memikul seluruh perbandingannya.
- **Dikelompokkan per NAMA** (huruf besar-kecil diabaikan): acara lintas hari
  punya satu baris di tiap tanggalnya, dan menampilkannya terpisah membuat acara
  yang sama muncul dua kali sambil masing-masing terlihat lebih kecil — lalu
  kalah dari acara yang seharusnya di bawahnya.
- **Baris TANPA NAMA tidak ikut dikelompokkan**: menggabungkannya jadi satu
  “(tanpa nama)” berarti menjumlahkan acara yang tidak ada hubungannya lalu
  memajangnya sebagai satu acara besar — dan itu bisa merebut peringkat pertama.
  Jumlahnya disebut berikut cara membetulkannya.
- **Nilai nol disaring.** Acara Rp0 menyumbang 0% dan cuma mendorong turun yang
  benar-benar membawa omset.
- **TETAP digambar di jalan buntu “tidak ada acara”.** Barisnya datang dari
  Breakdown Sumber, bukan dari daftar acara — nama acara sering cuma diketik
  finance dan tidak pernah dibuatkan barisnya di modul Event. Disembunyikan,
  halaman ini menjawab layar kosong untuk pertanyaan yang sudah ada jawabannya.
- **TIDAK ikut tapis kategori**, dan itu dikatakan: baris breakdown tidak
  menyimpan kategori sama sekali, dan mencocokkannya lewat nama acara adalah
  tebakan yang diam-diam salah begitu ada dua acara bernama mirip.

> **Asersi “Acara C tidak muncul” juga sempat LOLOS mutasi.** Dengan nilai nol
> ikut diperingkatkan, ia tetap terurut paling bawah dan tetap tidak masuk tiga
> besar — jadi ketiadaannya bukan bukti apa pun. Yang benar-benar bergerak
> JUMLAH sisanya (`1 acara lain tidak ditampilkan` → `2`), dan itulah yang
> dikunci sekarang.

```bash
node tools/uji-analytics.js   # 260 pemeriksaan (dari 230)
```

Dua belas mutasi dicoba; dua di antaranya lolos lebih dulu (keduanya di atas)
lalu tertangkap sesudah asersinya dibetulkan.


**KOLOM ITU SEKARANG PORSI ACARA TERHADAP HARI ITU** — ditanyakan user TIGA
kali berturut-turut, dan tiap jawaban setengah cuma memancing pertanyaan
berikutnya:

| putaran | yang ditanya | yang dikerjakan | hasilnya |
|---|---|---|---|
| 1 | "kontribusinya gimana dapat angkanya?" | kolom diganti nama `Kontribusi hari` | masih ditanya |
| 2 | "bukannya secara hitungan 50%?" | 52,5% ditambahkan sebagai baris kecil | "ini masih settingan lama" |
| 3 | — | **angkanya dipindah ke kolomnya** | selesai |

Rp14.580.550 dari omset hari Rp27.797.629 memang **52,5%**, dan itulah angka
yang dibawa orang ke baris sebuah acara. Yang dulu berdiri di kolom itu —
omset hari ÷ omset sebulan (3,8%) — menjawab pertanyaan yang tidak dibawa
siapa pun: ia praktis cuma mengatakan "hari ini sepertiga puluh bulan ini".

Bentuk akhirnya, dan **tidak ada yang hilang**:

| kolom | isinya | baris kecil di bawahnya |
|---|---|---|
| Omset hari itu | Rp27.797.629 | 3,8% dari omset sebulan |
| Omset event saja | Rp14.580.550 | 2,0% dari omset sebulan |
| **Kontribusi hari itu** | **52,5%** | dari omset hari itu |

- **NAMA KOLOMNYA MEMUAT PENYEBUTNYA** (permintaan user): `Kontribusi hari itu`,
  bukan `Kontribusi` saja. JANGAN TERTUKAR dengan `Kontribusi hari` yang sempat
  ada beberapa jam di hari yang sama — yang itu omset hari / omset SEBULAN dan
  sudah dicabut. Namanya mirip, artinya berbeda sama sekali.
- **TIAP SEL JUGA MEMBAWA PENYEBUTNYA**, bukan cuma kepalanya: tabel panjang
  membuat kepala kolom tergulir keluar layar, dan yang tersisa di layar
  angkanya. Kepala kolom cuma terbaca sekali, angkanya
  dibaca tiap kali — dan tiga putaran pertanyaan di atas lahir persis dari kolom
  bernama "Kontribusi" yang penyebutnya harus ditebak. Menamai ulang kolomnya
  saja TIDAK cukup; itu sudah dicoba di putaran pertama.
- **DUA HALAMAN MEMAJANG "rata-rata omset hari" YANG BERBEDA, dan dua-duanya
  benar** (ditanyakan user 9 September 2026):

  | halaman | penyebutnya |
  |---|---|
  | Hari & Jam | SELURUH hari Minggu di bulan itu (mis. 5 hari) |
  | Pengaruh Event → `Rata-rata hari sama tanpa acara` | hanya Minggu yang TIDAK ada acaranya (mis. 3 hari) |

  Yang kedua memang harus begitu — ia **pembanding**. Hari berevent yang ikut
  dijumlahkan ke pembandingnya berarti acaranya dibandingkan dengan dirinya
  sendiri, dan selisihnya mengecil sendiri tanpa ada yang menyadarinya.

  Syaratnya SUDAH tertulis di kalimat pengantar tabel sejak awal, dan itu
  **tidak cukup**: pengantar dibaca sekali, kolomnya dibaca tiap baris — dan
  yang membandingkannya dengan halaman sebelah cuma melihat kepala kolomnya.
  Sekarang kepala kolomnya menyebut `tanpa acara`, tiap selnya menulis jumlah
  hari pembandingnya (`3 Minggu tanpa acara`), dan kaki tabelnya menyebut
  terang-terangan bahwa angkanya SENGAJA berbeda dari Hari & Jam. Angka yang
  lahir dari membandingkan dua layar harus dijawab di salah satu layarnya.

- **Boleh lewat 100%, dan TIDAK dijepit.** Nilai acara diketik finance
  sementara omset hari datang dari berkas POS; angka di atas 100% berarti
  keduanya memang berselisih, dan dijepit ke 100% selisihnya hilang tanpa satu
  pun tanda.

> **Data uji harus dipilih supaya tiap angka punya sidik jarinya sendiri.**
> Baris uji sempat bernilai 20 juta, yang kebetulan membuat porsi bulanannya
> tepat `100.0%` — dan angka itu bertabrakan dengan asersi "tidak dijepit ke
> 100%", membuatnya merah untuk kode yang benar. Diganti 19 juta: 183,3% dan
> 95,7%, tidak ada yang bisa tertukar.

> **Dua asersi ujinya sempat HAMPA**, dan keduanya jenis yang sama — cocok
> dengan sesuatu yang BUKAN yang diuji. Kartu ringkas di atas halaman memajang
> kalimat yang bentuknya sama persis (`…% dari omset sebulan`), jadi asersi atas
> SELURUH halaman cocok dengan KARTU tanpa pernah menyentuh sel tabelnya;
> halamannya sekarang diiris ke tabelnya dulu, dan angka kartu vs tabel sengaja
> berbeda (45,8% vs 49,6%). Yang kedua: tanpa satu baris bernilai di atas omset
> harinya, mutasi "dijepit ke 100%" tidak mengubah satu angka pun dan LOLOS.

**Yang sudah DICOBA dan tidak cukup, jangan diulang:** kolomnya sempat cuma
DIGANTI NAMA jadi `Kontribusi hari` (putaran 1), lalu porsi acaranya
ditambahkan sebagai baris kecil di bawah nilai rupiahnya (putaran 2). Dua-duanya
benar secara isi dan dua-duanya tetap ditanyakan lagi — selama angka yang dicari
tidak berdiri di KOLOM yang orang baca, menamai ulang dan menambah keterangan
tidak menyelesaikan apa pun.

#### Selisih POS vs Rekap dipecah PER HARI (6 September 2026)

Pertanyaan user: *"selisihnya datang dari mana? tanggal berapa yang berbeda?"*
Kartu Selisih cuma mengatakan selisihnya ADA — setengah pekerjaan: yang
membacanya tahu ada yang salah tapi tidak punya satu pun jalan mencarinya,
selain membandingkan 30 baris dengan mata di dua layar. **Angka yang
menunjukkan masalah tanpa menunjukkan letaknya akan didiamkan.**

Tabel **Selisihnya Ada di Hari Mana** menjawabnya. Dijalankan atas data
produksi Agustus 2026, seluruh selisih sebulan ternyata dari **satu hari dan
satu kolom**:

```
23 Agu 2026   POS Rp29.989.850   Rekap Rp27.477.964   +Rp2.511.886   tax & service
29 hari lain cocok persis.
```

Sebabnya **tax diketik `2.514` padahal `2.514.400`** — tiga digit terakhir
hilang. Ketahuan karena rasio tax:service tepat **2,000** di 29 hari lain
(PB 1 10%, service 5%), dan 0,002 di hari itu. Netnya benar, jumlah bill-nya
benar; yang salah satu kolom kecil di sebelahnya, dan selisihnya cuma 0,3%
dari omset sebulan — bentuk kesalahan yang tidak akan dicurigai siapa pun.

Yang menahan bug diam-diam di tabel ini:

- **Total dan rincian dihitung dari PETA YANG SAMA** (`rekap[tgl]`), bukan dua
  loop terpisah. Selisih yang tidak cocok dengan totalnya sendiri adalah
  petunjuk yang menyesatkan ke arah yang salah.
- **Satu tanggal boleh punya lebih dari satu baris `daily`** — dijumlahkan,
  bukan ditimpa. Yang ditimpa membuang omset separuh hari tanpa satu pun tanda.
- **Kolom LETAK memecah selisih jadi `net` vs `tax & service`.** Dua sebab itu
  dicari di tempat yang berbeda; menunjuk kolom yang salah membuat orang
  membuka layar yang keliru. Kalau kolom Net Sales tidak terbaca di berkas POS,
  pemecahannya **DITAHAN** (`tidak bisa dipecah`), bukan ditebak.
- **Hari yang cuma ada di SATU sisi dibedakan** dari selisih angka: *belum
  diinput di Rekap Penjualan* vs *tidak ada di berkas POS*. Itu hari yang
  hilang, bukan angka yang beda, dan dicari dengan cara yang berbeda.
- **Ambangnya Rp1, bukan nol.** Berkas POS menyimpan pecahan sen (grand total
  Agustus berakhiran `,6992`), jadi nol menandai ke-30 harinya sebagai
  berselisih — dan tabel yang menyalakan semuanya sama tidak berartinya dengan
  yang tidak menyalakan apa pun.
- **"Semua cocok" adalah JAWABAN**, digambar sebagai pita hijau berisi jumlah
  harinya — bukan kartu yang hilang. Yang membukanya sedang bertanya "hari mana
  yang beda", dan tabel yang lenyap terbaca sebagai gagal dimuat.

Ujinya menjaga **invarian**, bukan hasil rumus yang disalin ulang dari kode
yang diujinya — uji yang mengulang rumusnya cuma mengulang asumsi yang sama.
Data ujinya dirancang supaya tiap kesalahan punya tempat untuk muncul:
`ringkas.grand` sengaja jauh berbeda dari jumlah harinya, dan satu hari dibuat
punya rata-rata tertinggi tapi total BUKAN yang terbesar — jadi batang yang
salah kolom langsung ketahuan. Ketiga mutasinya sudah dicoba dan tertangkap.

Ujinya memakai **berkas POS asli** di root repo kalau ada (kalau tidak, bagian
itu MELEWAT dengan jelas). `DecompressionStream`/`Blob`/`Response` ada di Node
18+, jadi jalur yang dipakai peramban benar-benar dijalankan — bukan ditiru.

#### Kategori Menu yang tidak pernah tersimpan, dan kategori acara (10 Sep 2026)

Pertanyaan user: *"ini kenapa?"* atas peringatan **"Laporan bulan ini belum
memuat kategori menu… unggah ulang berkas bulan itu"** — untuk berkas yang
memang Detail Report dan memang baru diunggah.

**PERINGATANNYA BENAR, SARANNYA TIDAK BISA DITEPATI.** Yang membuang
kategorinya bukan berkasnya, melainkan langkah simpannya:

```js
AN.data.laporan[u.bulan] = {
  diunggah, oleh, berkas, jenis, hari, jam, menu, ringkas   // <- daftar TERTUTUP
};
```

`uraiPos()` menghasilkan `paket`, `kategori`, dan `katMenu`; ketiganya tidak
disebut di sana, jadi **dibuang di klien** — sebelum menyentuh server
(`an_simpan()` sendiri menulis blob apa adanya, tanpa penyaringan). Bentuknya
sama persis dengan `brankas_simpan()`; bedanya di sini menggigit lebih cepat,
karena yang dibuang tidak pernah sempat ada di memori.

**DUA fitur karena itu tidak pernah bekerja sekali pun sejak 4 September 2026:**

| | akibatnya |
|---|---|
| halaman **Kategori Menu** | `d.kategori` selalu kosong → peringatan itu SELALU muncul |
| penggabungan baris **(PACKAGE)** | `d.paket` kosong → `menuNormal()` tidak bisa menguraikan `LARGE (PACKAGE)`; ~4.123 porsi Agustus 2026 tetap berdiri sebagai menu palsu dan bahan bakunya tidak ikut terhitung |

Halaman **Pengaturan → Kode Menu Paket** ikut jadi setelan mati: petanya diisi
orang tapi tidak pernah dibaca siapa pun.

Porsinya sendiri tidak hilang — baris `(PACKAGE)` tetap masuk `menu[]`; yang
hilang cuma kemampuan menggabungkannya.

> **KENAPA 260 PEMERIKSAAN TETAP HIJAU.** Seluruh asersi kategori & paket
> menguji **keluaran pengurainya** (`u`), lalu menyuntikkan `u` LANGSUNG ke
> `AN.data.laporan` — melewati persis baris yang rusak. Uji yang berhenti tepat
> sebelum jalur yang rusak tidak menguji apa pun di sana. Sekarang ada
> **putaran simpan sungguhan** lewat `anSimpanUnggah()`, dan itu yang akan
> menangkap kunci BERIKUTNYA yang tertinggal.
>
> Yang SENGAJA tidak ikut disimpan: `nBaris`, `nLewat`, `blnLain`,
> `billDariBaris`, `tglAwal`, `tglAkhir` — keenamnya cuma dibaca layar
> pratinjau, tidak pernah dari laporan tersimpan.

**KATEGORI ACARA TIDAK IKUT DI MENU & BAHAN BAKU** (permintaan user di pesan
yang sama). `Menu Category Detail` bernilai `EVENT` — isinya Prasmanan, Nasi
Kotak, Snack Box — dikeluarkan dari halaman Menu, dan **tetap utuh** di halaman
Kategori Menu berikut rincian menunya.

- **Disaring di `menuNormal()`, SATU tempat.** Halaman Menu, daftar *belum ada
  resep*, dan perkiraan bahan baku semuanya diturunkan dari `gab`; menyaringnya
  di salah satu layar saja berarti dua layar menyebut jumlah menu yang berbeda
  untuk bulan yang sama.
- **Sebabnya bukan kerapian.** Menu acara dijual per paket dan tidak punya
  resep di HPP, jadi kalau ikut ia cuma menambah baris *belum ada resep* yang
  tidak akan pernah bisa dibereskan siapa pun — dan justru daftar itu yang
  dipakai orang untuk tahu resep mana yang masih kurang. Bahan acara pun
  dibelanjakan terpisah, bukan dari stok yang dicocokkan halaman itu.
- **YANG DIKELUARKAN DIHITUNG DAN DISEBUT** (`NM.ev`), bukan dibuang diam-diam:
  nama menunya, porsinya, dan nilainya ditulis di pita halaman Menu. Keempat
  kartu di atasnya berhenti sama dengan berkas POS begitu penyaring ini
  menyala, dan selisih tanpa keterangan dicari orang di tempat yang salah.
- **Dicocokkan `trim().toUpperCase() === 'EVENT'`**, sama persis — bukan
  awalan. Isinya diketik di POS jadi `Event` dan `EVENT ` pasti bercampur, dan
  yang tidak cocok tidak melempar apa pun: ia cuma diam-diam ikut lagi.
  Awalan akan menelan kategori lain yang kebetulan berawalan sama.
- **BUKAN setelan.** Setelan yang harus diisi lebih dulu berarti fitur ini mati
  sampai ada yang mengisinya — dan setelan yang tidak dibaca siapa pun sudah
  pernah hidup dua minggu di modul HPP tanpa satu pun layar mengatakannya.
- **Laporan tanpa `katMenu` tidak mengeluarkan apa pun**, dan TIDAK menebak
  dari nama menunya: menebak berarti membuang menu biasa yang kebetulan
  bernama mirip.

**KOLOM `Jumlah Menu` di Kategori Menu** (permintaan user). Dihitung dari
`katMenu`, bukan disimpan sebagai angka tersendiri — kolom yang tidak cocok
dengan daftar yang muncul saat barisnya dibuka adalah kolom yang berhenti
dipercaya. Laporan lama menulis **—**, bukan **0**: nol berarti kategori itu
memang tidak punya menu.

**TIDAK ADA KATEGORI YANG TERBUKA SENDIRI** (15 September 2026, permintaan
user: *"ketika buka kategori menu, kategorinya jangan langsung terbuka
detailnya"*). Sampai tanggal itu kategori acara MEMBUKA DIRINYA SENDIRI saat
halaman ini pertama digambar, dengan alasan yang terdengar masuk akal — nama
menunya yang dicari, bukan totalnya. Yang terjadi di layar berbeda: EVENT di
produksi berisi 20 menu, jadi yang membuka halaman ini mendarat di tengah
daftar menu yang terbentang dan harus menggulir balik ke atas untuk melihat
tabel kategorinya — padahal tabel itulah isi halamannya.

- **`KT_BUKA` tinggal DUA keadaan**: `''` (tertutup) atau nama kategori.
  Keadaan ketiga `null` (belum pernah disentuh) dicabut bersama pembukaan
  otomatisnya; **jangan dikembalikan tanpa diminta** — ia tidak punya arti
  lagi kalau tidak ada yang dibuka sendiri, dan `ktBuka()` membandingkannya
  dengan `===`.
- **Yang dijaga uji ISI RINCIANNYA, bukan cuma nilai `KT_BUKA`**: nama menu di
  dalam EVENT tidak boleh tergambar sebelum ada yang menekannya. Memeriksa
  `KT_BUKA` saja meloloskan penggambar yang tetap membukanya lewat jalan lain.
- Barisnya tetap menyebut sendiri *tidak ikut di Menu & Bahan Baku* — yang
  membandingkan kedua halaman berdiri di sini.

```bash
node tools/uji-analytics.js   # 279 pemeriksaan (dari 260)
```

Tujuh belas mutasi dicoba, **dua lolos di putaran pertama** dan keduanya cacat
ASERSI, bukan cacat produk:

- *"Jumlah Menu tidak dihitung dari isi kategorinya"* LOLOS — asersinya
  menghitung sendiri dari fixture lalu membandingkannya dengan hitungannya
  sendiri, tidak pernah menyentuh sel yang digambar. Kolom yang menulis angka
  mati pun lulus. Sekarang angkanya **dibaca dari selnya**.
- *"laporan lama menulis 0, bukan tanda hubung"* LOLOS — keadaan itu tidak
  pernah dijalankan sekali pun.

Invarian **"total tidak berubah karena penggabungan"** DIPERKUAT, bukan
dilonggarkan: sejak kategori acara disaring, `gab` memang tidak lagi sama
dengan menu mentah — tapi menurunkan asersinya berarti membuang pemeriksaan
paling menentukan di berkas itu. Sekarang berbunyi **`gab` + yang dikeluarkan
=== menu mentah**, jadi ia menjaga dua hal sekaligus: penggabungan tidak
menghilangkan porsi, dan penyaring acara tidak membuang porsi tanpa
melaporkannya.

**Berkas lama tetap harus diunggah ulang** — dan kali ini pesannya benar.


##### Putaran kedua: pitanya dicabut, OTHERS ikut keluar, dan pencarian

Tiga permintaan user sehari kemudian, dan yang pertama mencabut apa yang baru
dipasang kemarin.

**1. KEDUA PITA ℹ DI HALAMAN MENU DICABUT.** Pita *"N menu kategori EVENT tidak
ikut di halaman ini"* menyebut nama seluruh menu yang dikeluarkan — di produksi
**20 nama sekaligus** — dan mendorong tabel yang jadi isi halaman itu turun satu
layar penuh. Pita *"N porsi dari menu paket sudah digabung"* ikut dicabut.

- **Yang hilang dengannya, dan itu memang pertukarannya:** keempat kartu di atas
  (Menu Berbeda, Porsi Terjual, Nilai Menu) tidak lagi sama dengan berkas POS,
  dan tidak ada satu kalimat pun di halaman itu yang menyebut sebabnya. Yang
  masih menjawabnya halaman **Kategori Menu** — kategori yang dikeluarkan
  berdiri utuh di sana dan barisnya menyebut sendiri *tidak ikut di Menu & Bahan
  Baku*. **Jangan dipasang lagi tanpa diminta.**
- **Kartu "Kode paket yang belum dipasangkan" TIDAK ikut dicabut** — ia bukan
  keterangan melainkan pekerjaan yang menunggu, berikut tombol saran
  pasangannya.
- **`NM.digabung` tetap dihitung** walau tidak lagi dipajang: angkanya yang
  membuktikan penggabungannya benar-benar terjadi, dan mencabut hitungannya
  berarti tidak ada lagi yang bisa membuktikannya di uji.

**2. SELURUH KELOMPOK `OTHERS` IKUT DIKELUARKAN dari Menu & Bahan Baku.** Kolom
`Menu Category` di POS cuma punya tiga nilai — FOOD, BEVERAGES, OTHERS — dan yang
ketiga isinya rokok, kemasan, dan sejenisnya: barang yang dijual apa adanya,
tidak punya resep, dan tidak pernah keluar dari gudang bahan.

- **DUA aturan yang ditulis TERPISAH** (`katEventKah` untuk kategori detail
  `EVENT`, `kelLewatKah` untuk kelompok atas `OTHERS`), walau di data produksi
  EVENT kebetulan berkelompok OTHERS sehingga aturan kedua sudah mencakupnya.
  Aturan yang menumpang kebetulan itu akan diam-diam berhenti berlaku begitu
  EVENT dipindah ke kelompok lain.
- Keduanya **sama persis, bukan awalan**, dan dipangkas + huruf besar: isinya
  diketik di POS. Awalan akan menelan `OTHERS LAIN` / `EVENT LAIN`.

> **FIXTURE-nya harus membuat kedua aturan bisa dibedakan.** Selama seluruh
> baris EVENT berkelompok OTHERS, mencabut aturan EVENT tidak mengubah satu
> angka pun dan mutasinya LOLOS. Sekarang ada baris `PRASMANAN` berkategori
> EVENT tapi berkelompok **FOOD**, dan ia ditaruh DULUAN supaya
> `kategori['EVENT'].kat` terisi FOOD (yang pertama menang).

**3. KOTAK CARI DI TIGA DAFTAR** halaman Menu & Bahan Baku — Penjualan Menu,
Perkiraan Bahan Baku, dan Menu yang belum ada di HPP. **Tiga kotak terpisah**:
ketiganya menjawab pertanyaan yang berbeda, dan satu kotak untuk ketiganya
berarti mencari satu bahan ikut memangkas tabel menu di atasnya.

- **YANG DIGAMBAR ULANG HANYA WADAHNYA** (`#mn_isi_menu` / `#mn_isi_bahan` /
  `#mn_isi_resep`), bukan halamannya. `render()` di modul ini TOTAL, jadi kotak
  yang sedang diketik akan dibuat ulang dan **hanya huruf pertama yang masuk** —
  jebakan yang sudah dibayar di `queueF()` modul Konten. Pola pemisahannya sama
  dengan `prodQueue()`/`renderQueueTable()`. **Jangan** "perbaiki" dengan
  menyimpan-mengembalikan posisi kursor.
- **`MN_CACHE` menyimpan hasil hitungan render terakhir.** `uraiResep()` diurai
  bertingkat untuk tiap menu; mengulangnya tiap ketukan terasa di jari yang
  mengetik cepat. Diisi ulang tiap `vMenu()`, jadi ganti bulan / ganti urutan /
  peta kode yang berubah selalu menyegarkannya.
- **Saat mencari, batas 20 teratas DILEPAS.** Kalau tidak, mencari menu
  peringkat ke-50 memulangkan tabel kosong — dan kosong terbaca sebagai
  "menunya tidak ada bulan ini". Penyaring dan pemotongnya karena itu ada di
  SATU tempat (`mnIsiMenuHtml`). *(Batas 20 teratas sendiri sudah DICABUT
  sehari kemudian — lihat putaran ketiga di bawah. Yang tetap berlaku:
  pencariannya menyapu SELURUH menu, bukan halaman yang sedang terbuka, dan
  penyaring + pemotongnya tetap di satu tempat.)*
- **Panjang batangnya tetap diukur terhadap SELURUH menu**, bukan terhadap yang
  tersaring: kalau ikut menyusut, menu kecil yang kebetulan sendirian di hasil
  pencarian tergambar sepanjang menu terlaris.
- **Kata kunci tanpa hasil DIKATAKAN**, bukan tabel kosong. Tiga keadaan kosong
  di daftar bahan tidak boleh berbunyi sama: *tidak ada base yang dipakai*
  (sah), *belum ada bahan sama sekali* (resep belum diisi), dan *tidak ada yang
  cocok dengan pencarian*.
- **Angka di tombol Bahan Mentah / Bahan Prep tetap menghitung seluruhnya** —
  itu jumlah yang benar-benar keluar, bukan hasil pencarian.
- **Kotak salin di "Menu yang belum ada di HPP" tetap memuat daftar PENUH.**
  Gunanya memindahkan seluruh menu yang belum punya resep ke Excel; menyalin
  hasil pencarian akan diunggah balik orang sebagai "seluruh daftar" — aturan
  yang sama dengan ekspor bahan di modul HPP.
- CSS-nya kelas **`.cari` sendiri**, bukan menyetel `input` global: modul ini
  punya kotak isian di enam halaman lain.

```bash
node tools/uji-analytics.js   # 295 pemeriksaan (dari 279)
```

Delapan belas mutasi dicoba, **empat lolos di putaran pertama** — dan keempatnya
cacat FIXTURE atau ASERSI, bukan cacat produk:

- *"penggabungan paket berhenti dihitung"* LOLOS — `digabung > 0` masih benar
  karena cabang kode-yang-dipetakan juga menaikkannya. Angkanya sekarang
  **dipatok** (9), jadi tiap cabang punya tempat untuk gagal.
- *"kategori EVENT tidak lagi dikeluarkan"* LOLOS — kebetulan yang dikomentari
  di sumbernya, dan fixture-nya sendiri yang menutupinya. Ditutup dengan baris
  EVENT berkelompok FOOD.
- *"penentu kelompok jadi awalan"* LOLOS — tidak ada kelompok yang berawalan
  `OTHERS` tanpa sama dengannya. Ditutup dengan asersi unit langsung.
- *"cari bahan tidak menyaring apa pun"* LOLOS — HPP tiruan blok itu tidak punya
  satu resep pun, jadi daftar bahannya memang selalu kosong dan penyaringnya
  tidak pernah dijalankan sekali pun. Sekarang ada resepnya, dan yang diuji
  bukan cuma kata kunci yang GAGAL cocok tapi juga yang COCOK.

Yang paling menentukan di antara asersi pencariannya: **identitas elemen
kotaknya** sebelum & sesudah diketik. Kotak yang diganti elemen baru terlihat
persis sama di layar sampai ada yang mengetik huruf kedua.


##### Putaran ketiga: halaman 20/50/100, dan Metode Kunjungan

Tiga permintaan user 10 September 2026, dan yang kedua mencabut saklar yang
baru dipakai sehari sebelumnya.

**1 & 2. SAKLAR "20 TERATAS / SELURUHNYA" DICABUT, diganti pagination
20/50/100.** Saklar itu cuma punya dua jawaban dan keduanya salah untuk daftar
259 menu: yang pertama menyembunyikan 239 menu, yang kedua menggelar seluruhnya
jadi tabel sepanjang sebelas layar.

| | sebelum | sesudah |
|---|---|---|
| keadaan | `MN_SEMUA` (bool), `MN_TOP=20` | `MN_PER` (20/50/100) + `MN_HAL` |
| yang tersembunyi | disebut jumlah & nilainya, tidak bisa dicapai | **bisa dicapai** lewat nomor halaman |
| kaki tabel | "20 teratas dari 259 — tekan Seluruhnya" | "Menampilkan 21–40 dari 259 menu" |

- **KETERANGANNYA TIDAK DICABUT, cuma berganti isi.** Yang tersembunyi dulu
  WAJIB disebut jumlah & nilainya justru karena tidak ada cara mencapainya;
  sekarang yang perlu disebut baris ke berapa sampai ke berapa. Daftar yang
  menyusut tanpa keterangan tetap terbaca sebagai data yang hilang.
- **NOMOR PERINGKAT MELANJUTKAN, tidak mulai dari 1 lagi tiap halaman.** Kolom
  pertama itu peringkat menu, bukan nomor baris di layar — dimulai ulang, menu
  ke-21 berdiri sebagai "1" dan halaman 2 terbaca seolah punya menu
  terlarisnya sendiri.
- **UKURAN & NOMOR HALAMAN DIGAMBAR DI DALAM `#mn_isi_menu`**, bersama
  tabelnya — bukan di kerangka halaman. Dikendalikan dari luar wadah itu,
  menekannya harus memanggil `render()`: gulir melompat balik ke atas persis
  saat orang membaca tabel di bawah, DAN kotak cari ikut dibuat ulang. Jebakan
  yang sama sudah dibayar di `gambarDaftar()` panel Kas Kecil dan di
  `queueF()` modul Konten.
- **EMPAT hal mengembalikan ke halaman 1**, dan tiap-tiapnya lewat jalan yang
  berbeda: kata kunci (`mnCari`), ukuran halaman (`mnPer`), urutan
  (`mnUrut`), dan ganti bulan (`blnPilih`). Yang terlewat tidak melempar —
  ia cuma memajang tabel kosong atau baris yang tidak ada hubungannya dengan
  yang barusan ditekan.
- **Penjepit rentang tetap ada di `mnIsiMenuHtml()`, SATU tempat**, karena
  daftarnya bisa menyusut dari tiga arah sekaligus. Ia BUKAN pengganti keempat
  reset di atas — lihat pelajaran ujinya di bawah.
- **Panah yang sudah mentok digambar `disabled`**: tombol yang bisa ditekan
  tapi tidak melakukan apa pun dibaca sebagai halaman rusak.
- **Jendela LIMA nomor** di sekitar halaman aktif. 259 menu × 20 = 13 tombol,
  dan deretan nomor yang membungkus dua baris lebih sulit dibaca daripada tidak
  ada nomornya sama sekali.

**3. HALAMAN BARU `Metode Kunjungan`**, dari kolom `Visit Purpose` — DINE
IN, ESB ORDER, ONLINE, TIKTOK GO. Isinya **jumlah omset dan jumlah transaksi**
per metode.

- **TRANSAKSI DIHITUNG DARI NOMOR BILL YANG BERBEDA, bukan jumlah baris.**
  Jebakan yang sama persis dengan `r.bill`: di Detail Report satu bill
  tersebar di belasan baris menu, jadi menghitung baris memberi angka empat
  kali lipat dan "rata-rata per transaksi" jatuh ke seperempatnya — dua angka
  yang sama-sama terlihat masuk akal dan tidak akan dipertanyakan siapa pun.
  Omsetnya tetap dijumlahkan per baris; di kedua bentuk laporan kolom grand
  memang berjumlah pas ke total sebulan.
- **DIURUT MENURUT JUMLAH TRANSAKSI, bukan omset.** Yang ditanya metode mana
  yang paling SERING dipakai. Keduanya sering menjawab berbeda — ESB Order bisa
  membawa omset jauh lebih besar dari transaksi yang jauh lebih sedikit — dan
  halaman yang diurut omset menjawab pertanyaan yang tidak dibawa siapa pun.
  Kolom omsetnya tetap berdiri di sebelahnya, jadi tidak ada yang hilang.
- **Nilainya dibakukan huruf besar** (`trim().toUpperCase()`): isinya diketik
  di POS, jadi `Dine In` dan `DINE IN` pasti bercampur — dan yang tidak
  disatukan berdiri sebagai metode kelima yang porsinya diam-diam terbelah.
- **Yang kolomnya kosong diberi NAMANYA SENDIRI** (`(tanpa keterangan)`),
  tidak dibuang dan tidak dijatuhkan ke metode pertama: ia tetap membawa omset,
  dan membuangnya membuat jumlah metode berhenti sama dengan totalnya. Aturan
  yang sama dengan `KAT_TANPA` dan `katEvent()`.
- **PENYEBUT PERSENNYA DIHITUNG DARI TABELNYA SENDIRI**, bukan dari
  `ringkas.bill`. Untuk omset keduanya memang sama, tapi untuk transaksi
  TIDAK harus: satu bill yang barisnya memuat dua metode ikut dihitung di
  kedua-duanya. Memakai `ringkas.bill` membuat kolom persennya berhenti
  berjumlah 100% tanpa satu pun tanda — kesalahan yang sudah dibayar di kolom
  Kontribusi halaman Hari & Jam. **Selisihnya DISEBUT** kalau ada, berikut
  sebabnya; didiamkan, ia dilaporkan sebagai angka yang salah di salah satu
  halaman.
- **Rata-rata per transaksi DITAHAN** (`—`) kalau metodenya tidak punya satu
  pun transaksi terbaca — membaginya dengan nol memberi angka yang terlihat
  sangat meyakinkan.
- **Batangnya mengikuti kolom TRANSAKSI, dan itu dikatakan.** Batang selalu
  dibaca sebagai gambar dari kolom di sebelahnya, dan di sini yang di
  sebelahnya dua-duanya.
- **`kunjung` WAJIB disebut di daftar kunci tertutup `anSimpanUnggah()`.**
  Itu tempat `paket`, `kategori`, dan `katMenu` tertinggal selama lima
  hari sementara 260 pemeriksaan tetap hijau — dan kunci baru lewat jalur yang
  sama persis. Ujinya menyimpannya lewat `anSimpanUnggah()` sungguhan, bukan
  menyuntikkannya ke `AN.data.laporan`.
- **Laporan lama tidak punya `kunjung`, dan halamannya MENGATAKAN sebabnya**
  berikut DUA kemungkinannya: diunggah sebelum kolomnya dibaca (unggah ulang),
  atau berkas POS-nya memang tidak punya kolom itu (ekspor ulang dengan
  kolomnya dicentang). Yang keliru menebaknya akan mengunggah berkas yang salah
  lagi — aturan yang sama dengan pesan di halaman Kategori Menu.
- Nama kolomnya dicari menurut NAMA lewat `KOL_CARI.kunjung`, dan yang tidak
  dikenali **tidak melempar**: halamannya cuma kosong dan menyuruh mengunggah
  ulang.

```bash
node tools/uji-analytics.js   # 333 pemeriksaan (dari 295)
```

Dua puluh lima mutasi dicoba, dan **tiga lolos di putaran pertama** — ketiganya
cacat UJI, dan dua di antaranya bentuk yang sama:

- *"ganti ukuran halaman bertahan di halaman lama"* dan *"mencari bertahan di
  halaman lama"* LOLOS karena **PENJEPIT RENTANG MENUTUPI RESETNYA**. Ukuran
  halaman yang membesar selalu memperkecil jumlah halaman, jadi `MN_HAL`
  jatuh ke 1 dengan sendirinya; begitu juga kata kunci yang hasilnya muat di
  satu halaman. Ditutup dengan keadaan yang jumlah halamannya TIDAK berubah:
  menekan ukuran yang sedang berlaku, dan kata kunci yang hasilnya masih dua
  halaman (`menu` → 24 menu). **Reset dan penjepit dua hal yang berbeda, dan
  uji yang tidak bisa membedakannya tidak menguji resetnya.**
- *"rata-rata per transaksi dibagi jumlah baris"* LOLOS karena **angkanya
  bertabrakan**: Rp40.000 kebetulan juga omset TIKTOK GO, jadi asersinya cocok
  dengan sel yang bukan yang diuji. Angkanya diganti Rp45.000. Tiap angka di
  data uji harus punya sidik jarinya sendiri — pelajaran yang sudah dibayar di
  kolom Kontribusi hari itu.

Satu lagi yang perlu diingat saat menambah mutasi di berkas ini: **mutasi yang
cuma memangkas separuh kalimat tidak membuktikan apa pun** kalau frasa yang
diuji masih tertinggal di separuh berikutnya — dan frasa yang sama juga hidup
di KOMENTAR `ringkasPos()`. Yang dipotong harus seluruh pernyataannya.

### Analytics: Promotion Report → halaman Promo & Klaim (10 September 2026)

Permintaan user: unggah *Promotion Report* dari POS lalu tahu promo mana yang
paling banyak diklaim, barang apa yang paling banyak diklaim, dan jam berapa
saja klaimnya terjadi. Menu baru **Promo & Klaim** (kunci view `promo`).

**Backend TIDAK disentuh sama sekali.** `an_simpan()` menulis blob apa adanya
tanpa daftar kunci tertutup — beda dari `brankas_simpan()` — jadi wadah baru
cukup dinormalkan di `muatSemua()`.

**DISIMPAN DI `AN.data.promo`, TERPISAH dari `AN.data.laporan`.** Keduanya
laporan berbeda dengan periode yang bisa berbeda pula; di satu objek,
mengunggah salah satunya bisa menimpa ringkasan satunya lagi. Pemilih bulannya
pun sendiri (`BLN_PROMO`) — bulan yang ada di satu sisi belum tentu ada di
sisi lain, dan pemilih bersama akan memajang bulan yang halaman ini tidak
punya datanya lalu terbaca sebagai data hilang.

**SATU KOTAK UNGGAH, jenisnya dikenali sendiri** (`uraiBerkas()`), dan ini yang
paling penting di seluruh bagian ini. Dua kotak terpisah berarti berkas promo
bisa dijatuhkan ke kotak penjualan — dan `ringkasPos()` **TIDAK melempar**
untuknya: ia menemukan `sales date` dan `sales number`, tidak menemukan satu
pun kolom nilai yang dikenalnya, lalu menyimpan **Bill Report beromset Rp0
yang MENIMPA ringkasan bulan itu**. Dikenali dari ADANYA kolom `Promotion
Name` + `Promotion Type`, bukan dari nama berkasnya — nama berkas diketik
orang. Aturan yang sama dengan pembeda Menu Report vs Bill Report.

`petaKolomPos()` karena itu dipecah jadi **`petaKolom(kepala, def)` generik**
yang dipakai `KOL_CARI` dan `KOL_PROMO`. Dua salinan pencocok kolom pasti
menyimpang, dan yang menyimpang memulangkan kolom yang salah tanpa satu pun
galat.

**KLAIM DIHITUNG DARI NOMOR BILL YANG BERBEDA, bukan dari jumlah baris.** Satu
bill punya satu baris untuk tiap menu yang kena diskon. Agustus 2026:

| promo | baris | transaksi |
|---|---|---|
| `BUDRUN 26 DISC 15%` | 60 | **12** |
| `DISC 17% KEMERDEKAAN` | 10 | **1** |
| `DISC BOOSTER 15%` | 6 | **1** |

Diurut per baris, ketiganya melompat ke peringkat yang tidak pernah mereka
duduki — dan angkanya tetap terlihat wajar. Jebakan yang sama persis dengan
`r.bill` di Detail Report penjualan. Kolom Baris tetap **dipajang**: selisihnya
dari kolom Transaksi justru yang menunjukkan promo mana yang menempel per menu.

**NILAI PROMO ADA DI DUA KOLOM YANG BERBEDA**, dan salah pakai membuat
sepertiga promonya berbunyi Rp0:

| jenis | nilainya |
|---|---|
| diskon (`DISCOUNT %`, `DISCOUNT LIMIT %`, `BILL DISCOUNT(RP)`) | `Discount Total` |
| gratis (`FREE ITEM`, `BUY X GET FREE Y`) | `Original Price` × `Qty` |

**Barang gratis dicatat POS berharga NOL di laporan penjualan** — dibuktikan
atas Detail Report: baris menunya `total=0`, `nett=0`, `disc=0` — jadi
`Original Price` di berkas promo satu-satunya tempat nilainya pernah tercatat.
Agustus 2026: 148 dari 434 baris (Rp6.795.000) akan berbunyi Rp0 kalau cuma
`Discount Total` yang dijumlahkan.

- **YANG MEMUTUSKAN ADA-TIDAKNYA SEL `Discount Total`, bukan nama tipenya.**
  Nama tipe disetel per POS dan daftar tertutup di kode akan diam-diam basi;
  bentuk datanya tidak. Sel berisi `"0"` tetap dibaca sebagai diskon bernilai
  nol — itu memang diskon yang tidak memotong apa pun, bukan barang dilepas.
- **Keduanya dipajang TERPISAH dan sebabnya dikatakan di layar.** Diskon sudah
  ikut mengurangi omset; barang gratis **tidak pernah ada di dalam omset**,
  jadi mengurangkannya lagi dari Net Sales menghitungnya dua kali. Boleh
  dijumlahkan karena tidak ada satu baris pun yang masuk ke dua-duanya.

**JAM KLAIM DITURUNKAN DARI NOMOR BILL — Promotion Report tidak punya kolom
jam.** `Sales Date` di sana serial Excel **BULAT** (46235), yaitu tanggal tanpa
jam, dan `jamDari()` memang memulangkan `-1` untuknya.

Nomor bill POS ini `SLMCL` + 12 digit, dan **sepuluh digit pertamanya epoch
detik**. Itu bukan tebakan — dibuktikan atas 4.785 bill Agustus 2026 dengan
mencocokkannya ke kolom `Sales In Time` di Bill Report:

```
epoch+7 jam == Sales In Time : 4.747 (99,21%) cocok DETIK PER DETIK
38 sisanya                   : meleset tepat 1 detik (pembulatan sentidetik)
dibaca UTC                   : 0 cocok
```

- **PENJAGANYA TANGGAL BARISNYA SENDIRI** (`jamNomorBill(nomor, tglIso)`). Jam
  hanya dipakai kalau tanggal yang ikut terbaca dari nomor itu SAMA PERSIS
  dengan kolom Sales Date baris tersebut. Tanpa itu, POS lain yang penomoran
  bill-nya bukan stempel waktu menghasilkan **24 kolom jam yang terisi rapi dan
  sepenuhnya karangan** — dan tidak ada satu pun cara membedakannya dari yang
  benar. Yang tidak cocok memulangkan `-1`, dihitung, dan **dilaporkan di
  layar** serta di pratinjau sebelum disimpan. Agustus 2026: 434 dari 434 lolos.
- **Kolom jam sungguhan tetap menang** kalau suatu hari ekspornya punya — yang
  diturunkan cuma cadangan.
- Digeser **+7 TETAP**, bukan zona peramban. Alasan yang sama dengan `isoDari()`.

**BARIS TERAKHIR BERKAS ADALAH BARIS TOTAL**, dan angkanya berformat Indonesia.
`angka()` salah membacanya **dengan cara yang berbeda di tiap kolom** — diukur,
bukan dikira-kira:

```
"6.890.800,95"  -> 6,89     parseFloat berhenti di titik KEDUA
"554,00"        -> 55.400   tidak punya pemisah ribuan, seratus kali lipat
```

Satu baris itu bisa **melipatgandakan jumlah item sekaligus mengecilkan
nilainya**. Dibuang karena tidak punya `Promotion Name` maupun `Sales Number`.

> Tanggalnya yang kosong sebenarnya sudah cukup membuangnya, dan itu berarti
> **berkas asli tidak bisa membuktikan penjaga nama+nomor bill berfungsi** —
> mutasi yang mencabutnya memang LOLOS seluruh asersi atas berkas asli. Yang
> menuntutnya baris buatan di uji: baris total yang PUNYA tanggal, dan baris
> data yang nomor bill-nya kosong (yang kedua paling halus — seluruhnya
> menumpuk jadi satu "transaksi" hantu bernama string kosong).

**Diskon tingkat bill tidak menempel di satu menu pun** (`Menu Name` = `-`),
jadi tabel Barang yang Diklaim memang berjumlah lebih kecil daripada tabel
promo. Jumlah barisnya disebut di layar; didiamkan, selisihnya dicari orang di
tempat yang salah.

**DAFTAR KUNCI TERTUTUP DI KLIEN (`anSimpanPromo`) tetap ada dan tetap
berbahaya** — sama persis dengan `anSimpanUnggah()`, tempat `paket`,
`kategori`, dan `katMenu` tertinggal lima hari tanpa satu pun galat. Ujinya
menjaganya sebagai **invarian**: tiap kunci yang dibaca halaman wajib ada di
blok simpan, bukan daftar nama yang harus diingat orang.

**Set WAJIB diubah jadi angka sebelum disimpan.** `Set` tidak bisa di-JSON-kan:
dikirim apa adanya ia jadi `{}` dan SELURUH jumlah klaim berbunyi nol, tanpa
satu pun galat.

```bash
node tools/uji-promo.js   # 71 pemeriksaan, jsdom + berkas POS asli
```

Ujinya memakai **berkas asli** kalau ada di root repo; kalau tidak, bagian itu
MELEWAT dengan jelas. Berkasnya **jangan di-commit** (sudah di `.gitignore`:
`Promotion Report*.xlsx`) — satu berkas memuat seluruh klaim promo sebulan
berikut nomor bill-nya, dan nomor bill di POS ini memuat stempel waktu
transaksinya.

Asersi terkuatnya membandingkan hasil urai dengan **baris total di kaki
berkasnya sendiri** (Qty 554, Discount Total 6.890.800,95). Baris itu ditulis
POS, bukan oleh kode yang diuji, jadi ia satu-satunya pemeriksaan di sana yang
tidak bisa basi sendiri. Delapan mutasi dicoba, kedelapannya tertangkap.

`smoke-modul.js analytics` **tidak cukup** untuk halaman ini — ia cuma
melaporkan halamannya tidak melempar.


### HPP: SPARE MODAL, sekali dan hanya di menu jadi (2 September 2026)

`deploy/stock/hpp/`, kunci izin **`hpp`** (bukan `stock` — panel ini berdiri
sendiri di pemilih). Modal tiap **menu jadi** ditambah cadangan sekian persen —
penutup susut, ceceran, dan porsi yang meleset. Persentasenya setelan
(`SET.buffer`, halaman Pengaturan, bawaan 5%), tersimpan di `hpp_setting` lewat
`simpanSetting` — **backend tidak perlu diubah sama sekali**, kuncinya sudah ada
di sana sejak modul lahir.

**Kotak isiannya memang sudah ada sejak awal — yang tidak ada justru
pemakaiannya.** `SET.buffer` disimpan rapi ke server lalu tidak dibaca satu pun
perhitungan, jadi mengubahnya tidak menggeser satu angka pun. Ia setelan mati
selama dua minggu, dan tidak ada satu pun layar yang mengatakannya.

Rumusnya, dan pembagian tugas ketiga fungsinya:

```
modalResep(r)   bahan mentah saja, MEMOIZED di MEMO
modalDasar(r)   modalResep + jalur modal_manual   <- yang dipakai MENYUSUN resep lain
modalMenu(r)    modalDasar + spare kalau tipe==='dish'   <- modal RESMI seluruh layar
```

Yang menahan bug diam-diam, dan ketiganya muncul sebagai UANG bukan sebagai galat:

- **Spare dikenakan SEKALI, di menu jadi saja** (`kenaSpare()`). Kalau base ikut
  dipadding, menu yang memakai base kena 5% di atas 5% dan resep bertingkat tiga
  kena tiga kali. Karena itu `perUnitResep()` — harga per satuan sebuah base yang
  menyusun modal resep lain — memakai **`modalDasar`, bukan `modalMenu`**.
- **`modalMenu()` selalu membuat OBJEK BARU.** `modalResep()` memoize hasilnya
  dan memulangkan referensi yang sama tiap kali; menambahkan spare ke objek itu
  membuat resep yang digambar dua kali dapat spare dua kali. Render di modul ini
  TOTAL, jadi gejalanya modal yang **naik sendiri tiap halaman digambar ulang** —
  sudah diuji, tiga render membawa satu menu dari 7.293 ke 11.879.
- **`modalPratinjau()` memakai aturan yang SAMA.** Penyunting resep memakai
  fungsi itu, daftar memakai `modalMenu()`; kalau cuma salah satunya kena spare,
  yang menyunting menyimpan lalu mendapati modalnya berubah tanpa ia menyentuh
  apa pun.
- **Buffer negatif diabaikan**, nol tetap sah. Negatif MENGURANGI modal, dan
  modal yang lebih murah daripada bahannya adalah angka menyesatkan yang tidak
  akan dipertanyakan siapa pun. Nol wajib sah — itu satu-satunya cara mematikan
  spare tanpa menyunting kode.
- **Spare selalu ditulis sebagai barisnya sendiri** di penyunting, lembar PDF,
  dan kartu kalkulator; daftar Menu Jadi menyebutnya di keterangan tabel dan
  merincinya di `title` tiap sel Modal. Total yang 5% lebih besar daripada jumlah
  subtotal di atasnya akan dikira salah hitung, dan yang mencari selisihnya tidak
  punya satu pun petunjuk.
- Kalkulator HPP ikut menghitung spare: ia menimbang menu yang AKAN dijual, jadi
  harga yang diputuskan di sana harus sama dengan yang keluar di Daftar Resep
  begitu menunya benar-benar dibuat.

### HPP: ekspor & impor Daftar Resep lewat Excel (4 September 2026)

Permintaan user: "daftar resep dan barang dan harga dan floor itu bisa export
dan import lewat excel". **Bahan & Harga dan Barang Floor sudah punya sejak 17
Agustus 2026** — satu berkas untuk keduanya, tombolnya digambar `layarBahan()`
yang dipakai kedua halaman. Yang belum cuma **Daftar Resep**, dan itulah yang
ditambahkan.

**SATU BARIS = SATU BARIS BAHAN**, bukan satu resep: sebuah resep punya banyak
bahan dan Excel tidak punya sel bersarang. Kolom resepnya (jenis, tipe, yield,
harga jual) ditulis **di baris pertama tiap resep saja**; diulang di tiap baris,
yang menyuntingnya harus menebak baris mana yang menentukan.

Yang menahan bug diam-diam — tidak satu pun muncul sebagai galat:

- **Baris CATATAN ikut, ditandai `Ref=Catatan`.** `hpp_simpan_resep` menyimpan
  baris `{catatan}` tanpa `nama` ("bumbu blender saring") yang memisahkan tahap
  memasak. Kalau ekspor menyaringnya dengan `b.nama`, satu putaran
  ekspor–sunting–impor **menghapus seluruh tahap memasak** — dan yang hilang
  bukan angka, jadi tidak ada yang menyadarinya. Dibaca balik ia juga tidak
  boleh jadi bahan biasa: ia akan muncul sebagai "bahan tak dikenal" yang tidak
  akan pernah bisa dibereskan siapa pun.
- **Pencocokan NAMA + JENIS.** `cariResep()` sengaja jatuh ke pencarian tanpa
  jenis (dipakai penghitung modal), jadi impor **tidak boleh memakainya apa
  adanya**: resep drink baru bernama "Ayam Goreng" akan menimpa isi resep food
  yang sudah ada. Yang dipakai hanya kecocokan sejenis; nama yang cuma ada di
  jenis lain dianggap resep BARU.
- **Ejaan tersimpan menang atas ejaan berkas** (`rec.nama=cocok.nama`), sama
  dengan impor bahan. Pencocokannya `low()`, jadi "ayam goreng" tetap menemukan
  "Ayam Goreng" — tapi menemukannya tidak boleh sekalian MENGGANTI namanya.
- **Barisnya digabung dengan data lama** (`Object.assign({},cocok,r)`) sebelum
  dikirim. Server menulis SELURUH kolom tiap simpan, jadi kolom yang tidak ada
  di berkas (`catatan` resep, `harga_lama`, `di_purchasing`) akan **terhapus
  jadi kosong** kalau barisnya dikirim mentah.
- **Resep non-aktif tetap diekspor.** Berkas yang cuma memuat yang aktif,
  diunggah balik, tidak akan pernah bisa menghidupkan yang dimatikan.
- **Saringan di layar TIDAK ikut** — sama alasannya dengan ekspor bahan dan
  dengan ekspor Jadwal Shift: berkas berisi 40 resep yang namanya sama persis
  dengan ekspor lengkap akan diunggah balik orang lain sebagai "seluruh daftar".
- **Bahan yang belum dikenal DISEBUT namanya di pratinjau**, sebelum menulis.
  Barisnya tetap tersimpan, tapi modalnya dihitung tanpa bahan itu — angka yang
  terlihat wajar padahal kurang.

**Satu-satunya aturan yang berbeda dari impor bahan, dan itu dikatakan
terang-terangan di pratinjau: baris bahan resep yang IKUT di berkas diganti
utuh.** Tidak bisa lain — satu resep tersebar di beberapa baris, jadi menghapus
baris di Excel adalah satu-satunya cara orang menyatakan "bahan ini sudah tidak
dipakai". Yang tetap berlaku: **resep yang tidak ada di berkas tidak disentuh**.

Backend `hpp_impor_resep()` di `stock-mysql/hpp.php` dibentuk mengikuti
`hpp_impor_bahan()`, **bukan `hpp_impor()`** — yang terakhir menjalankan
`DELETE FROM hpp_resep` / `hpp_bahan` saat `$timpa` dan memang cuma untuk
pemindahan awal sekali jalan. Dipakai berulang, ia menghapus seluruh daftar
resep sebelum menulis yang ada di berkas. Aksinya `imporResep`, terpisah dari
`impor` lama yang tidak disentuh.

```bash
node tools/uji-excel-resep.js   # 58 pemeriksaan, jsdom
```

Ujinya melakukan **putaran penuh** — ekspor lalu impor tanpa satu suntingan pun
harus melaporkan "tidak ada yang berubah". Itu satu-satunya cara menangkap kolom
yang hilang di jalan: yang lolos ekspor tapi tidak terbaca impor tidak
menimbulkan galat di kedua sisinya.

**Tapis Makanan / Minuman di Daftar Resep** (2 September 2026). Tapisnya sudah
ada sejak lama — tapi berupa **dropdown bertuliskan "Food" / "Drink"**, satu
dari empat kotak pilihan berjajar di baris atas. Yang mencari "minuman" tidak
menemukannya lalu menyimpulkan tapisnya tidak ada; itu permintaan yang datang
dari user, dan dua sebabnya (istilah data dipakai sebagai label, kendali
tenggelam di antara tiga kendali lain) sama-sama diperbaiki:

- Jadi **saklar `.seg`, sebaris dengan tab Menu Jadi / Base** — keduanya
  menjawab pertanyaan yang sama-sama dijawab sebelum melihat tabel: bagian mana
  yang sedang dilihat.
- **Nilainya TETAP `'food'`/`'drink'`.** Itu isi kolom `jenis` di data; saklar
  yang mengirim `'makanan'` membuat tidak satu pun resep cocok dan daftarnya
  kosong tanpa satu pun galat. Yang berubah cuma tulisannya, lewat
  `namaJenis()` — satu tempat, supaya tapis bertuliskan "Makanan" tidak pernah
  berdiri di atas kolom bertuliskan "Food".
- **Angka di tombol dihitung TANPA tapis jenis** (`resepTersaring(tipe, true)`).
  Kalau ikut, tombol yang tidak sedang dipilih selalu menulis `(0)` — dan nol
  membaca sebagai "tidak ada minuman sama sekali", bukan "kamu sedang melihat
  makanan". Tapis lain (seksi, aktif, kata kunci) **tetap** berlaku: angkanya
  harus menjanjikan apa yang benar-benar muncul kalau ditekan.

**Yield menu jadi = 1 Porsi, KECUALI resep sebatch.** September 2026 seluruh
menu jadi diisi yield "1 Porsi" (permintaan user) lewat alat sekali pakai di
Daftar Resep; alatnya **sudah dicabut lagi** begitu pekerjaannya selesai —
tombol yang tidak punya pekerjaan lagi akan ditekan lagi tanpa sebab.

Yang perlu bertahan bukan alatnya, tapi **kenapa sebagian sengaja TIDAK 1
Porsi** — dan itu jangan "dirapikan" belakangan. Resep yang ditulis untuk SATU
BATCH (Bubur Ayam & Soto Bening 10 Porsi, Bitterballen 25 Pcs, Chicken Skin
400 Gr, Hainan Chicken 1000 Gr, Nasi Kuning 6 Porsi, Tea Orange Extract
1600 Ml) memakai yield sebagai **PEMBAGI**, bukan keterangan:
`perUnitResep()` = modal ÷ yield, dan angka itulah yang dipakai resep lain yang
merujuknya sebagai bahan (`hitungBaris`, cabang `lewatResep`).

```
Nasi Campur Bali pakai 20 Gr Chicken Skin   (Chicken Skin hasil 400 Gr)
  yield 400 Gr  : (modal ÷ 400) × 20
  yield 1 Porsi : (modal ÷   1) × 20      -> 400 kali lipat
```

Sembilan resep merujuk ketujuh batch itu. Menuliskannya 1 Porsi tanpa ikut
membagi takaran bahannya **tidak melempar apa pun** — yang berubah cuma angka
modal, dan angka modal yang salah terlihat persis seperti yang benar.
Membaginya otomatis juga bukan jawabannya: takaran sebatch tidak selalu habis
dibagi rata (satu telur untuk 10 porsi).

Resep BARU tidak menambah pekerjaan ini: bawaan form sudah `1 Porsi`.

```bash
node tools/uji-spare-hpp.js   # 47 pemeriksaan, jsdom + stock-api tiruan
```

Ujinya membuat resep bertingkat (bahan → base → menu, dan menu berisi dua base)
justru supaya spare berlipat punya tempat untuk muncul. `smoke-modul.js` **tidak
cukup** untuk modul ini — ia melaporkan `hanya boot yang diuji`, jadi seluruh
aritmetikanya lewat tanpa disentuh.

### Pemakaian Bahan Baku: pemilih bulan di KETIGA report (2 September 2026)

`deploy/stock/usage/`. Modul ini punya tiga layar report — **Pemakaian**,
**Waste**, dan **Serah Terima** — dan sampai 2 September 2026 cuma Pemakaian
yang punya pemilih bulan. Dua lainnya hanya 7 Hari / Bulan Ini / Semua, jadi
waste bulan lalu dan serah terima bulan lalu hanya bisa dilihat dengan menarik
SELURUH data lewat "Semua" lalu mencarinya dengan mata (permintaan user).

**`rentangBulan(ym)` adalah SATU rumus untuk ketiganya.** Sebelumnya hitungan
hari terakhir bulan ada inline di `rentang()` milik Pemakaian; menyalinnya ke
dua layar baru berarti tiga tempat menghitungnya sendiri-sendiri, dan yang
meleset di Februari **tidak melempar apa pun** — ia cuma kehilangan catatan
tanggal 29, dan tidak ada satu pun layar yang menyebutkannya.

Yang perlu dijaga saat menyentuhnya:

- **Akhir rentang = hari terakhir BULAN ITU, bukan hari ini.** Bulan lalu harus
  terambil penuh. `new Date(th, bl, 0)` = tanggal 0 bulan berikutnya = hari
  terakhir bulan ini, dan itu benar juga untuk Februari maupun tahun kabisat.
- **`isiPilihanBulan(id)` menerima id kotaknya.** Tiga layar, tiga `<select>`;
  yang cuma diisi satu membuat dua kotak lain tampil kosong — terbaca sebagai
  "tidak ada bulan yang bisa dipilih", bukan sebagai bug.
- **Tombol periode dan pemilih bulan saling meniadakan.** Menekan "7 Hari"
  sesudah memilih Februari harus benar-benar memberi 7 hari; tombol yang
  menyala untuk rentang yang tidak diberikannya adalah kebohongan yang paling
  sulit dilacak di layar penyaring.
- **Saat sebuah bulan dipilih, tidak ada tombol periode yang menyala** — itu
  memang benar, yang berlaku bukan salah satu dari ketiganya. Yang menggantikan
  tandanya tombol **✕** di sebelah pemilih bulan, dan ✕ itu pula satu-satunya
  jalan keluar: tanpa itu, memilih satu bulan berarti terkurung di bulan itu
  sampai halaman dimuat ulang.
- Periode disaring **di server** (`dari`/`ke` jadi query string ke `usage.php` /
  `waste.php` / `serah.php`). Rentang yang salah tetap menggambar layar yang
  rapi, cuma dengan isi bulan yang keliru — karena itu ujinya memeriksa **URL
  yang benar-benar diminta**, bukan tampilannya.
- Pemilih bulan Pemakaian ada **di dalam laci filter** (layar itu punya lima
  penyaring); Waste dan Serah tidak punya laci, jadi pemilihnya langsung
  terlihat. Perbedaan itu disengaja — laci untuk layar yang penyaringnya
  menumpuk, bukan untuk semua.

```bash
node tools/uji-bulan-usage.js   # 37 pemeriksaan, jsdom + stock-api tiruan
```

Ujinya memuat modulnya sungguhan (termasuk `catat-common.js`) tapi **membuang
skrip CDN Tailwind & FontAwesome** — keduanya tidak bisa dimuat jsdom dan
tumpukan galatnya menenggelamkan baris OK/GAGAL. `smoke-modul.js` **tidak
cukup**: ia melaporkan `hanya boot yang diuji` untuk modul ini.

### Denah meja: Marketing MENGIKUTI Reservasi, tidak menyalinnya (2 Sep 2026)

`deploy/marketing/` → *Pilih & Kunci Meja* (Reservasi VIP dan pemilih meja
Event) menggambar denah venue yang SAMA dengan `deploy/reservasi/` dan menulis
kunciannya ke database Reservasi. Dua modul, satu ruangan — dan tiap kali
keduanya menyimpang, gejalanya bukan galat melainkan kru yang berdebat meja
mana yang benar.

Koordinat mejanya sudah lama satu sumber (`deploy/assets/venue-layouts.js`).
Yang **belum** ikut sampai 2 September 2026, dan semuanya keluhan user:

- **`layoutTanggal` tidak dibaca sama sekali.** Modul Reservasi punya denah
  KHUSUS SATU TANGGAL yang menang atas segalanya (`getLayout()`); Marketing cuma
  membaca `master.layouts`. Akibatnya meja yang digeser untuk satu malam tetap
  tergambar di posisi lamanya. `vipDenah()` sekarang memakai urutan yang sama:
  **denah tanggal > template hasil edit > bawaan**.
- **Minggu bukan akhir pekan.** Di sini dulu cuma Jumat & Sabtu, sementara
  Reservasi sudah memasukkan Minggu — jadi tiap Minggu kedua modul menggambar
  denah yang berbeda untuk ruangan yang sama, tanpa satu pun tanda.
- **Lantai 2 memakai `layoutOverrides2`**, kunci yang terpisah. Menumpangkannya
  di `layoutOverrides` berarti menjadwalkan denah lantai bawah ikut mengganti
  denah atas.

**KUNCI MEJA H-3 JAM, bukan sehari penuh.** `rsvMejaTerpakai()` dulu memblokir
meja untuk SATU HARI PENUH: tamu jam 12:00 membuat mejanya tak bisa dipakai
acara jam 20:00 di hari yang sama, padahal modul Reservasi sendiri
mengizinkannya. Kru Marketing karena itu melihat denah yang jauh lebih penuh
daripada kenyataan, lalu menolak acara yang sebenarnya masih muat.

`vipLockStart/vipLockEnd/vipLocksRange` adalah **BERKAS KEMBAR**
`lockStart/lockEnd/locksRange` di `deploy/reservasi/`. Kalau di sana berubah, di
sini HARUS ikut — dua aturan untuk satu meja berarti satu modul menjualnya
sementara modul lain menganggapnya penuh. Yang perlu dijaga:

- **`jam` kosong = SEHARI PENUH**, bukan "tidak ada yang terkunci". Tanpa jam
  tidak ada cara tahu jendela mana yang bentrok, dan menganggapnya kosong
  berarti menjanjikan meja yang mungkin sudah dipesan.
- **Reservasi lintas hari ikut dipertimbangkan** (±1 hari): booking 02:00 dini
  hari mengunci mejanya sejak 23:00 malam sebelumnya. Penyaring lama
  (`r.date !== tanggal`) membuat kuncian itu tidak terlihat sama sekali.
- **Jamnya wajib ikut di pemeriksaan terakhir sebelum menulis**, bukan cuma di
  denah. Kalau tidak, orang memilih meja yang terlihat kosong lalu ditolak saat
  menekan Simpan.
- Pemilih meja Event mengambil jamnya dari `tamuDatang` lalu `mulaiSetup` —
  **sumber yang sama** dengan yang ditulis ke Reservasi saat menyimpan.

**Nada warna & ukuran** juga disamakan: latar `--paper`, `aspect-ratio
1600/1160`, meja diwarnai per ZONA dengan nilai yang disalin dari `.seat.zone-*`
di Reservasi, terpilih = garis emas di LUAR kotak (warna zonanya tetap
terbaca), terkunci = pudar + ✕. Lebar maksimumnya naik dari 1180px ke 1560px
dan ukuran hurufnya `clamp()` — denah yang dibesarkan tapi hurufnya tetap 9,5px
tidak menyelesaikan keluhannya. Zona yang **tidak dikenal dibiarkan tanpa
kelas**, bukan dijatuhkan ke warna pertama: meja berzona baru harus terlihat
berbeda supaya CSS-nya ditambah.

**Jam kosong diarahkan ke `00:00`, dan itu DIKATAKAN** (3 September 2026,
permintaan user). Sebelumnya jam kosong berarti seluruh hari terkunci — aman,
tapi denahnya tampak penuh merah begitu tanggalnya baru dipilih. Akibat 00:00
harus terlihat: jendela H-3 jadi 21:00 malam sebelumnya sampai 03:00, jadi meja
yang dipesan tamu jam 20:00 tampil **bebas**. `vipCatatanJam()` memasang pita
peringatan selama jamnya belum diisi; tanpa itu dua pihak bisa memegang meja
yang sama tanpa satu pun tanda. Peringatannya hilang sendiri begitu jamnya
diisi — peringatan yang selalu muncul berhenti dibaca.

**Denah bawaan yang tidak berlaku hari itu TIDAK ditawarkan** (permintaan user).
Dulu empat tombol berjajar — Weekday/Weekend × Lt.1/Lt.2 — padahal dua di
antaranya jelas bukan denah hari itu, dan denah hari kerja yang dibuka pada hari
Sabtu menggambar meja di posisi yang malam itu tidak ada. Sekarang tinggal dua.

- **Template custom TIDAK ikut disaring**: namanya bebas, dan menebak jenis
  harinya dari nama berarti menyembunyikan denah yang mungkin justru dibuat
  untuk hari itu.
- **`vipDenahKeys(d, tanggal, semua)` — `semua=true` membuka lagi seluruhnya**,
  dan itu wajib untuk dua pemakai: `vipDenahKunci()` (mencari denah mana yang
  memuat meja sebuah reservasi lama, bisa saja denah jenis hari lain) dan
  pengumpul kapasitas `VIP_CAP`. Tanpa itu reservasi lama tampil dengan denah
  yang semua mejanya pudar — terbaca sebagai "mejanya hilang" — dan ringkasan
  slot berubah jadi "? org".

```bash
node tools/uji-denah-marketing.js   # 57 pemeriksaan, jsdom
```

Ujinya membaca **kedua berkas** lalu membandingkannya — angka H-3 jam, aturan
akhir pekan, dan tujuh warna zona diambil dari `deploy/reservasi/index.html`,
bukan ditulis ulang. Yang disalin tangan pasti menyimpang.

### Konten: yang selesai otomatis diarsipkan (4 September 2026)

`deploy/konten/`. Permintaan user: Content Planning, Shooting, Design, dan
Editing hanya menampilkan **task yang masih berjalan**; yang sudah tayang atau
selesai diarsipkan sendiri.

- **Antrian produksi** (`queueState`) bawaannya `status:todo`, bukan ``.
  Kotak pilihannya sekarang berbunyi *Aktif / Arsip / Semua* — kendalinya
  memang sudah ada, yang berubah bawaannya dan kata-katanya.
- **Content Planning** punya tapis `arsip` sendiri (`aktif`/`arsip`/``),
  terpisah dari tapis per-status yang sudah ada. `STATUS_ARSIP` =
  `[Posted,Cancelled]`, satu daftar dipakai tapis dan penghitungnya.
- **Dua tapis tidak boleh saling meniadakan.** Memilih status `Posted`
  sementara tapis arsip masih `aktif` akan memulangkan tabel KOSONG — dan
  kosong terbaca sebagai "belum ada yang tayang", bukan sebagai "tapisnya
  bertabrakan". Karena itu status arsip yang dipilih eksplisit MENANG atas
  tapis arsip.
- **Reset kembali ke AKTIF, bukan ke Semua.** Kalau tidak, menekan Reset justru
  memunculkan seluruh arsip — kebalikan dari yang diharapkan yang menekannya.
- **Yang disembunyikan disebut angkanya** di kepala halaman dan di baris
  penyaring antrian. Daftar yang menyusut tanpa keterangan terbaca sebagai data
  yang hilang, dan dilaporkan sebagai bug.

**Mengetik di antrian produksi tidak lagi melempar fokus** (4 September 2026,
keluhan user "typing-nya error" di Shooting/Design/Editing). `queueF()` dulu
memanggil `route()`, yang menulis ulang `innerHTML` SELURUH `#view` — termasuk
kotak carinya sendiri. Kotak yang dibuat ulang kehilangan fokus, jadi **hanya
huruf pertama yang masuk**.

`prodQueue()` sekarang dipisah jadi tiga: `prodRows()` (data), `prodQueue()`
(kerangka + baris penyaring), `renderQueueTable()` (isi tabel). Yang dipanggil
tiap ketukan cuma yang terakhir. Bentuknya disamakan dengan Content Planning,
yang memang tidak pernah kena karena sudah memisahkan keduanya sejak awal
(`planF` → `renderPlanTable`).

- **Jangan "perbaiki" dengan menyimpan-mengembalikan posisi kursor.** Yang
  menggambar ulang kotak yang sedang diketik akan selalu punya masalah
  berikutnya: teks yang sedang dipilih, komposisi IME, autocomplete.
- **`AFTER.shooting/design/editing` wajib ada.** `#queueTable` belum ada di DOM
  saat `VIEWS.*` dipanggil; mengisinya di sana gagal diam-diam (elemennya null)
  dan yang tampil halaman tanpa tabel sama sekali.
- **Angka "x / y pekerjaan" disegarkan `renderQueueTable()`**, bukan cuma
  ditulis di kerangka — kalau tidak ia membeku di hasil pencarian pertama dan
  berbohong sejak ketukan kedua.

**Pipeline bisa disaring per PIC** (permintaan user), berikut **jumlah konten
tiap orang di pilihannya** — yang membuka tapis ini justru sedang mencari siapa
yang menumpuk pekerjaan. Pilihan **Belum ada PIC** memakai nilai `__none__` dan
disaring lewat cabangnya sendiri: dibandingkan langsung dengan `c.pic` ia tidak
akan pernah cocok, dan kanbannya kosong tanpa satu pun keterangan.

**Pilihan PIC dibuat SATU tempat** (`picOptions()` + `picCocok()`), dipakai
Pipeline dan Content Planning. Dua dropdown yang disusun sendiri-sendiri akan
menyimpang begitu ada pilihan baru — dan yang membacanya tidak punya cara tahu
kenapa "Belum ada PIC" cuma ada di satu halaman.

- **Baris penyaring Pipeline berbentuk KARTU**, sama dengan halaman lain.
  Sebelumnya kotak PIC-nya diselipkan ke `.page-head` bersama tombol Konten
  Baru; `.page-head` memakai `align-items:flex-end` + `flex-wrap`, jadi begitu
  isinya tiga benda ia membungkus dan kotaknya berdiri sendiri di kanan atas
  tanpa sejajar dengan apa pun (keluhan user 4 September 2026).
- **`hitung()` diberikan pemanggilnya**, karena yang dihitung memang berbeda:
  Pipeline menghitung konten aktif, Content Planning menghitung yang lolos
  saringan halamannya sendiri. Yang sama bentuk daftarnya, bukan angkanya.
- **Angka PIC di Planning dihitung TANPA tapis PIC-nya sendiri**
  (`filteredContent(true)`). Kalau ikut, tiap nama yang tidak sedang dipilih
  selalu menulis `(0)` — dan nol membaca sebagai "orang itu tidak pegang
  apa-apa". Saringan lain (arsip, status, kata kunci) TETAP berlaku: angkanya
  harus menjanjikan apa yang benar-benar muncul kalau ditekan.
- **Orang yang tidak memegang apa pun tidak ditawarkan**; memilihnya cuma
  memulangkan daftar kosong, dan daftar kosong terbaca sebagai bug.
- **`__none__` untuk "Belum ada PIC"**, bukan `` yang sudah berarti semua.
  Dibandingkan langsung dengan `c.pic` ia tidak akan pernah cocok.

**Kartu "Tugas Saya" di dashboard berbasis DEADLINE** (permintaan user: yang
overdue atau dekat, dan hanya milik yang login). `tugasSaya()` mengumpulkan
dari **tiga sumber**: konten yang PIC-nya saya, sub-tugas produksi di dalam
konten itu, dan tugas produksi mandiri. Kartu yang cuma membaca `DB.content`
akan menulis "Bersih!" untuk orang yang besok pagi harus menyerahkan tiga
video — kesalahan paling mahal di layar yang justru dibuka untuk memastikan
tidak ada yang terlewat.

- Diurutkan **yang paling lewat tenggat di paling atas**; tanpa itu kartunya
  cuma tujuh baris pertama menurut urutan input data, dan yang terlambat bisa
  tidak pernah kelihatan.
- Yang **tanpa deadline tetap ikut**, ditaruh paling belakang (`sisa` null).
  Membuangnya berarti tugas yang lupa diberi tenggat menghilang dari
  satu-satunya layar yang menampilkannya.
- `DEADLINE_DEKAT = 3` hari, satu tempat.

### Reservasi: siapa yang terakhir mengubah denah (4 September 2026)

Permintaan user. Capnya **menempel di objek denahnya** (`_editBy`, `_editAt`
lewat `leCap()`), bukan disimpulkan dari Audit Log: audit dipotong di 500
baris, jadi denah yang disunting lama justru yang paling pasti sudah kehilangan
jejaknya di sana. Audit **tetap** dicatat — yang satu menjawab "siapa yang
terakhir", yang satu "apa saja yang pernah terjadi".

- Dipasang di **kedua** jalur simpan: `leSave()` (template) dan
  `leSimpanTanggal()` (denah khusus tanggal). Yang terlewat tidak melempar apa
  pun — denahnya cuma tidak pernah punya jejak.
- Ditampilkan di penyunting denah, di baris Hari-H, dan di daftar template.
- **Denah bawaan yang belum pernah disunting tidak diberi keterangan**:
  `leCapTeks()` memulangkan kosong. "Terakhir diubah: -" membuat orang mencari
  orang yang tidak pernah ada.
- Aman terhadap backend: `master` disimpan sebagai **satu blob JSON tanpa
  penyaringan kunci** (`json_encode($state[master])`), jadi kunci baru tidak
  hilang diam-diam seperti kasus `mutasi` di brankas.

```bash
node tools/uji-arsip-konten.js   # 66 pemeriksaan, jsdom (Konten + Reservasi)
```

Modul Konten seluruhnya terbungkus IIFE (`const COMS = (function(){…})()`), jadi
`planFilters`/`queueState` TIDAK ada di `window` — ujinya menyuntikkan jembatan
`eval` KE DALAM IIFE saat uji jalan, bukan menambah kait ke berkas yang
di-deploy. Pola yang sama dengan `uji-vendor.js` untuk modul BD.

### Master Vendor: di PURCHASING, dibaca Finance & BD (28 Agustus 2026)

`deploy/stock/purchasing/` → tab **Database & Vendor** → *Daftar Kontak Vendor*.
Sudah ada sejak lama berisi nama, WhatsApp, jadwal jemput, hari tutup, dan barang
apa saja yang dipasoknya. Yang **ditambahkan** 28 Agustus 2026 cuma tiga kolom:
`penerima` (nama sesuai buku rekening), `bank`, `norek` — disimpan di dalam blob
`data` tabel `vendors` yang sudah ada, jadi tidak ada berkas migrasi yang bisa
tertinggal di produksi.

**Sempat salah tempat.** Percobaan pertama pagi itu membuat master vendor BARU di
BD OS; dicabut hari yang sama atas koreksi user. Alasannya bukan selera: dua
daftar vendor untuk perusahaan yang sama pasti berbeda ejaan dalam sebulan, dan
yang mentransfer tidak punya cara tahu mana yang lebih baru. Jangan dibuat lagi —
kalau butuh kolom baru tentang vendor, tambahkan di Purchasing.

Yang menahan bug diam-diam:

- **Nama pendek ≠ nama penerima.** Yang diketik sehari-hari "Toffin"; yang harus
  sama persis dengan buku rekening "CV. Toffin Riau Jaya". Beda satu huruf
  membuat transfer ditolak bank — baru ketahuan sesudah uangnya dikirim.
  `penerima` kosong berarti "sama dengan nama vendor".
- **Nomor rekening disimpan apa adanya** (boleh bertanda hubung — begitulah
  tertulis di buku rekening dan begitu pula yang dicocokkan mata), tapi
  DIBANDINGKAN lewat `norekBersih()`. Tanpa itu `034-2928-828` dan `0342928828`
  terbaca sebagai dua rekening berbeda. Impor Excel **tidak** membakukannya
  seperti nomor WhatsApp.
- **`preserve-if-null` WAJIB mencakup ketiga kolom** di `pur_vendor_simpan()`.
  Impor Excel mengirim baris yang cuma punya nama + WhatsApp; tanpa itu satu kali
  impor MENGOSONGKAN nomor rekening seluruh vendor, dan yang menyadarinya adalah
  orang yang mentransfer minggu depan.
- **Ketiganya ikut di ekspor–impor** (`KOL_VENDOR`). Kalau tidak, satu putaran
  ekspor–sunting–impor mengembalikan seluruh vendor tanpa rekening.
- **Rekening kembar cuma DIPERINGATKAN.** Satu perusahaan wajar punya beberapa
  nama dagang yang setor ke rekening yang sama; yang tidak wajar adalah tidak
  menyadarinya.
- **Bank daftar tertutup, tapi nilai lama tetap digambar** ditandai `(lama)` lewat
  `opsiBank()` — pola yang sama dengan `opsiPosisi()` di DW. Tanpa itu, membuka
  vendor yang banknya diimpor dengan ejaan lain menggantinya ke pilihan pertama
  begitu Simpan ditekan, dan transfernya nyasar.

**Kuncinya NAMA, bukan id** — Purchasing memang tidak punya id vendor, nama itulah
kunci tabelnya. Karena itu baris pembayaran di Brankas menyimpan `vendor` (nama),
dan justru itu lebih tahan: vendor yang dihapus dari master tetap meninggalkan
namanya di lembar pembayaran lama, ditandai `tak ada di master`. Bentuk lama
`vendorId` masih dibaca (`vendorBaris()`) untuk baris percobaan di dev.

**Dua pembaca, keduanya read-only:**

| pembaca | jalur | kalau Purchasing mati |
|---|---|---|
| Brankas → lembar pembayaran | `../../stock-api-mysql/vendors.php` | pita peringatan, nominal tetap terbaca |
| BD OS → kolom Vendor di Purchase Order | `../stock-api-mysql/vendors.php` | kotaknya tetap bisa diketik, dan dikatakan daftarnya belum terbaca |

`vendors.php` membalas `{vendors:{…}}` **TANPA kunci `ok`** — beda dari
finance-api & kompas-api. Memeriksa `.ok` membuang balasan yang sebenarnya
baik-baik saja, dan gejalanya cuma kolom penerima yang selalu kosong tanpa satu
pun galat.

`muatVendorPur()` di BD dipanggil **saat form PO digambar**, bukan saat boot:
daftarnya cuma dipakai satu form. Idempoten, dan kegagalannya tidak pernah
dilempar.

Kolom `vendor` di 51 baris PO produksi **kosong seluruhnya** — belum pernah diisi
sekali pun, karena selama ini teks bebas. Nama tersimpan yang tidak ada di master
tetap digambar ditandai `(lama)`, dan penandanya dibuang lagi saat menyimpan —
kalau tidak ia menular jadi bagian nama.

```bash
node tools/uji-vendor.js   # 104 pemeriksaan
```

Ujinya tiga bagian: fungsi Purchasing **dipotong dari sumbernya** saat uji jalan
(modul itu memuat Tailwind & FontAwesome dari CDN, jadi merendernya utuh di jsdom
bukan yang diuji), modul BD dirender penuh dengan jembatan **DI DALAM IIFE**
(`DB` tidak ada di `window`) termasuk form PO-nya lewat `APP.poModal()`, dan
Brankas diperiksa sumbernya saja — isi lembarnya
sudah diuji `tools/uji-brankas.js`. Stub `fetch` untuk BD wajib menyediakan
`text()`: `bacaJawaban()` membaca respons sebagai teks dulu, dan stub yang cuma
punya `json()` membuat boot menggantung tanpa satu pun galat.

### `dw` ↔ `jadwal`: satu arah, dan sengaja begitu

`dw` menyimpan pekerja harian (part time). Mereka **bukan** user Office — tidak
ada di `account-mysql`, tidak muncul di `listDivisiRoster`, dan **tidak punya
akun sama sekali**: sejak 14 Agustus 2026 gerbang no HP + PIN (`loginDW`)
dicabut seluruhnya. Alurnya sekarang **head mengajukan kebutuhan divisinya,
HRD menyetujui lalu menunjuk siapa yang dipakai**; orangnya dikabari lewat
WhatsApp. Itu sebabnya `dw` tetap punya tabel orang sendiri (`dw_pekerja`)
padahal `jadwal` sengaja tidak punya: mendaftarkan puluhan part-timer sebagai
user Office akan mencemari roster **setiap** modul.

Ajuan yang sudah `DISETUJUI` muncul di kalender `jadwal`. Yang terjadi adalah
**pembacaan**, bukan penyalinan baris ke `jadwal_sel`:

```
deploy/jadwal/index.html  →  GET ../dw-api-mysql/api.php?action=jadwalDW&dari=&sampai=
                          →  DW_ROWS  →  blokDW()  →  baris di bawah kru tetap
```

Konsekuensi yang harus dijaga saat menyunting keduanya:

- **Kode divisi (`bar` `kitchen` `floor` `cashier`) wajib identik** di `DIVISI`
  kedua modul. Mengganti salah satu membuat DW divisi itu hilang dari lembarnya
  tanpa error apa pun, dan tidak ada tempat yang melaporkannya.
- `muatDW()` di jadwal **tidak pernah melempar**. Backend `dw` yang mati tidak
  boleh membuat lembar kru tetap ikut blank — paling jauh satu baris peringatan
  (`panelGagalDW()`).
- Baris DW di lembar jadwal **read-only**. Yang mengubahnya HR di modul `dw`.
- `jadwalDW` sengaja tidak membalas `no_hp`. Modul jadwal dibuka seluruh kru
  yang punya akses jadwal.
- Semua backend memakai `PDO::ATTR_EMULATE_PREPARES => false`, jadi penanda
  bernama diikat **berdasarkan posisi**: satu nama yang dipakai dua kali dalam
  satu `prepare()` gagal dengan `SQLSTATE[HY093]` yang tidak menyebut kolom apa
  pun. Sudah kejadian 5 Agustus 2026 di `simpan_pekerja`.

### Hak akses DUA modul ini ditegakkan di SERVER (sejak 14 Agustus 2026)

Beda dengan modul lain, `dw` dan `jadwal` **tidak** lagi menjaga hak akses cuma
di layar. Tiap permintaan wajib membawa `sesi` (token sesi Office dari
`lm_session`); backend menanyakannya
balik ke `account-api?action=whoami` **server-ke-server** lewat
`<modul>-mysql/lib_sesi.php` — **berkas kembar, dua salinan identik**, kalau
salah satu disunting yang lain harus ikut.

Aturannya, dan ini yang tidak boleh dilonggarkan tanpa sengaja:

| | boleh |
|---|---|
| DW — memutuskan (setujui/tolak, talent pool, tandai bayar, **tugaskanDW**) | **HRD saja** (`dw_hrd`). Daftar `hr` kosong = semua pemegang modul dianggap HRD **KECUALI head divisi** — tanpa pengecualian itu setiap head jadi HRD begitu ia ikut memegang kunci modul, dan pembagian "head meminta, HRD memenuhi" runtuh diam-diam |
| DW — minta DW (`simpanPermintaan`) & tunjuk orang langsung (`simpanAjuan`) | **head divisi ITU** atau HRD (`wajib_minta`) |
| DW — `simpanSetting` | HRD, tapi daftar `hr` dipertahankan server kalau bukan admin modul |
| DW — MELIHAT seluruh isi modul | HRD **dan head divisi** (`dw_boleh_lihat`); peran dihitung server & dikirim sebagai `data.peran`, layar tidak menyimpulkannya sendiri |
| akses modul `dw` di Office | otomatis untuk Tim HRD/CEO, admin modul, Admin Akses, **dan head divisi** — head-nya ditanyakan ke `jadwal-api?action=headIds`, lazy + cache + gagal = kosong |
| akses modul `jadwal` di Office | **otomatis** untuk Tim Kitchen/Bar/Floor/Cashier/HRD/CEO + admin modul (`modul_bawaan_untuk`) — tidak perlu dicentang |
| Jadwal — tulis/hapus sel, putus pengajuan | **head divisi kru itu** (`jdw_wajib_boleh_baris`, diperiksa PER BARIS) |
| Jadwal — **mengesahkan** pengajuan (`DISETUJUI`) | **admin modul saja = HRD**, dan hanya dari `MENUNGGU_HRD` |
| Jadwal — `simpanSetting` | admin modul saja (blob-nya memuat daftar head) |
| Jadwal — halaman **Data Pegawai** (`rosterSaveUser`, `rosterSetActive` di account-api) | admin modul `jadwal` — dan itu sudah berarti HRD, lihat `admin_modul_untuk`. Gerbangnya **token sesi**, bukan callerName+callerPin |

### Jadwal: ekspor Excel bisa dipilih orangnya (29 Agustus 2026)

`exportExcel()` sekarang MEMBUKA PEMILIH, tidak langsung mengunduh — yang
mengerjakan ekspornya `tulisExcel(lingkup, emps, total)`.

- **Bawaannya semua tercentang.** Beda dari modal Isi Jadwal yang sengaja
  kosong: di sana satu klik menimpa jadwal orang lain, di sini yang terjadi
  cuma berkas terunduh. Memaksa mencentang 39 nama untuk pekerjaan yang
  hampir selalu berarti "semuanya" adalah pekerjaan tanpa alasan.
- **"Kosongkan" hanya menyentuh yang sedang tampil** di kotak cari
  (`eksDaftar()`). Menekannya sesudah menyaring lalu mendapati orang di luar
  saringan ikut hilang centangnya adalah kejutan yang tidak diminta siapa pun.
- **Berkas sebagian DITANDAI DI NAMANYA** (`_2dari4`). Berkas berisi 3 dari 39
  orang yang namanya sama persis dengan ekspor lengkap akan dikirim ke Talenta
  sebagai jadwal seluruh divisi — dan 36 orang yang tidak ikut tidak terjadwal
  tanpa satu pun pesan.
- Yang **belum punya Employee ID** ditandai di daftar pilihnya, bukan cuma
  dihitung sesudah berkasnya terunduh: barisnya diterima Talenta tanpa keluhan
  lalu dilewati.

### Jadwal: pengajuan lewat DUA persetujuan (29 Agustus 2026)

Permintaan user: pengajuan off/izin/cuti disetujui **head dulu, baru HRD**.

```
MENUNGGU  --head meloloskan-->  MENUNGGU_HRD  --HRD mengesahkan-->  DISETUJUI
    |                                |
    +-- head menolak --> DITOLAK     +-- HRD menolak --> DITOLAK
```

- **Urutannya ditegakkan di SERVER** (`putus_pengajuan`), bukan cuma di layar.
  Tanpa itu head tinggal mengirim `status:'DISETUJUI'` sekali dari console dan
  langkah HRD terlewat seluruhnya — sel jadwalnya ikut terisi. Bahaya yang sama
  sudah tercatat di komentar `putusPengajuan` untuk kasus kru yang menyetujui
  cutinya sendiri; yang berubah cuma siapa yang melompat.
- **Sel jadwal baru ditulis di langkah KEDUA.** `kirimPutusan` hanya menulis
  saat `DISETUJUI`, jadi persetujuan head tidak menyentuh lembar sama sekali.
  Kalau ditulis di langkah pertama, jadwal sudah berubah sebelum HRD setuju.
- **Kata di tombolnya beda per langkah**: head melihat *Teruskan ke HRD*, HRD
  melihat *Sahkan*. Tombol bertuliskan "Setujui" yang ternyata belum menyetujui
  apa pun adalah janji yang tidak ditepati.
- **`head_at` / `head_oleh` kolom SENDIRI**, terpisah dari `putus_*`. Kalau
  ditumpuk, nama head yang meloloskan tertimpa nama HRD begitu langkah kedua
  ditekan — dan pertanyaan "siapa head yang menyetujui cuti ini" tidak punya
  jawaban di layar mana pun. Keduanya lahir lewat `pastikan_kolom()`, bukan
  berkas migrasi.
- **HRD TIDAK bisa melakukan langkah pertama** (29 Agustus 2026, permintaan
  user). Sempat boleh dengan alasan head yang cuti tidak boleh menghentikan
  divisinya — tapi akibatnya HRD bisa menekan Teruskan lalu Sahkan berturut-
  turut, dan dua langkahnya jadi hiasan. Tombol HRD baru muncul SESUDAH head
  meneruskan.
- **Satu pengecualian, dan cuma satu**: divisi yang belum punya head sama
  sekali (`divPunyaHead` / `jdw_div_punya_head`). Tanpa itu pengajuan dari
  divisi seperti Marketing menggantung selamanya tanpa satu pun yang berhak
  meneruskan. Head yang berhalangan diselesaikan dengan MENUNJUK head kedua di
  Pengaturan — bukan dengan melonggarkan gerbang ini.
- **Jejaknya ditulis "✓ Disetujui head: <nama>"**, bukan "head: <nama>". Nama
  saja tidak mengatakan apa yang ia lakukan — ia bisa saja yang menolak. Yang
  perlu terbaca HRD sebelum menekan Sahkan adalah langkah pertama SUDAH lewat.
- **`AJU_BERJALAN`** (`['MENUNGGU','MENUNGGU_HRD']`) dipakai bersama oleh
  lencana sidebar, tab Antrian, dan tombol Batal. Tiga tempat yang menghitung
  sendiri pasti menyimpang begitu ada status baru — dan `MENUNGGU_HRD` yang
  jatuh ke tab Riwayat adalah pekerjaan yang disembunyikan di balik nama yang
  mengatakan sudah selesai.
- Query `getAll` juga memakai kedua status itu sebagai "masih berjalan"; kalau
  tidak, pengajuan yang sudah diloloskan head masuk potongan 200 baris terakhir
  dan bisa hilang dari layar HRD tanpa pernah diputuskan.
- **`putuskan()` mengoper `status` apa adanya.** Dulu di situ tertulis
  `DISETUJUI` mati — warisan dari waktu putusannya satu langkah — jadi tombol
  "Teruskan ke HRD" tetap mengirim DISETUJUI dan ditolak server dengan pesan
  yang membingungkan. **Ujinya lolos** karena memanggil `kirimPutusan()`
  langsung, melewati `putuskan()`. Uji tombol harus MENGKLIK tombolnya.
- **Pengajuan SATU TANGGAL**, bukan rentang (29 Agustus 2026). Rentang membuat
  satu persetujuan menimpa belasan sel sekaligus tanpa pernah melihat isinya.
  `sampai` tetap ada di data (pengajuan lama menyimpannya) dan disamakan
  dengan `dari` saat dikirim.
- **Form menampilkan shift yang SEKARANG ada** di tanggal itu
  (`gambarShiftSekarang`). Tanpa itu yang mengajukan tukar shift tidak melihat
  apa yang sedang ia tukar, dan head tidak tahu apa yang akan tertimpa.
- **`bisaLihatAju()` TERPISAH dari `bisaPutuskan()`.** Penyaring daftarnya
  sempat memakai `bisaPutuskan`, dan begitu langkah HRD lahir akibatnya
  langsung terasa: pengajuan yang baru diteruskan head LENYAP dari layarnya
  sendiri — sama persis seperti kalau ia menolaknya. Siapa yang boleh MELIHAT
  tidak boleh bergantung status.
- **Pita menyebut DUA angka**: yang menunggu keputusan saya, dan yang sudah
  saya teruskan ke HRD. Tanpa yang kedua, head yang barusan meneruskan tidak
  punya satu pun tanda bahwa pengajuannya masih hidup.
- Urutan daftar memakai `ajuBerjalan`, bukan `status===MENUNGGU` — kalau
  tidak, baris yang baru diteruskan jatuh ke bawah bersama riwayat.
- **Kru boleh menarik pengajuannya selama belum disahkan**, termasuk saat sudah
  di meja HRD.

### Jadwal: "Isi Sel Kosong" jadi "Isi Jadwal" (29 Agustus 2026)

Permintaan user. Tiga perubahan yang saling terkait:

- **Tidak ada hari yang tercentang saat dibuka** (`hari:[0,0,0,0,0,0,0]`).
  Sebelumnya ketujuhnya menyala, jadi satu klik shift menyentuh seluruh minggu.
- **`timpa` bawaannya `true`** — sel yang sudah terisi ikut diganti.
- **Namanya ikut berubah.** Alat bernama "Isi Sel Kosong" yang menimpa sel
  terisi adalah cara tercepat menghapus kerja head lain; jawabannya mengganti
  NAMANYA, bukan membatasi alatnya. Yang menahan salah tekan bukan lagi nama,
  melainkan konfirmasi bentrok di `isiSisaPilih()` — tiap sel yang tertimpa
  disebut satu per satu, dan yang lahir dari pengajuan disetujui ditandai.

### Jadwal: Tempel dari Excel di Input Mingguan (7 September 2026)

Permintaan user: Bar (dan divisi lain) menyusun jadwalnya lebih dulu di lembar
Excel kasar, lalu ingin memindahkannya ke modul tanpa mengetik ulang ~170 sel.
Tombol **📥 Tempel dari Excel** di halaman Input Mingguan (sebaris dengan Isi
Jadwal / Salin Minggu Lalu, hanya saat SATU divisi dipilih & orangnya head-nya).

**SATU template**: bentuk yang sama persis dengan yang keluar dari tombol
**📗 Excel** (`tulisExcel` — impor Talenta *shift attendance*): baris 1
`Employee ID | Employee Name | <30 tanggal> | Branch | Organization | Job
Position | Job Level | Employment Status | Join Date`, lalu satu baris per kru.
Ekspor dan impor memakai template yang sama supaya tidak ada dua bentuk berkas.
Parser tetap **lenient** — bentuk `NAMA | tanggal` sederhana juga masih terbaca.

Alurnya: tempel isi berkas Excel apa adanya (tab antar kolom) → `imporParse()`
mencari sendiri baris tanggal (≥2 sel tanggal) & baris tiap kru; kolom Employee
ID / Branch / Organization dan baris nama hari dilewati sendiri → pratinjau
(kisi per minggu + daftar bentrok lewat `daftarTimpa`/`htmlTimpa`) → simpan
lewat **`tulisSel()`** — jalur, penjaga per-divisi, dan konfirmasi bentrok yang
SAMA dengan alat massal lain. **Tidak ada endpoint baru.**

Yang menahan bug diam-diam (tidak satu pun melempar galat kalau lepas):

- **Tanggal WAJIB dari tempelan, tidak pernah ditebak dari minggu aktif.**
  Lembar Excel Bar mulai hari **Selasa** (1 Sep = Selasa) sementara minggu
  modul ini mulai Senin — memetakan "kolom pertama = Senin minggu aktif"
  menggeser SELURUH jadwal satu hari. Baris tanpa ≥2 sel tanggal bukan baris
  tanggal; kalau tak ada satu pun, pratinjau menolak dan menyebut sebabnya.
- **`impTgl()` membaca lima bentuk**: `dd/mm/yyyy`, `dd/mm` (tahun dari minggu
  aktif), ISO, `1 Sep` / `1 September 2026` (nama bulan ID **dan** EN — Excel
  ikut setelan Windows), dan nomor seri Excel (kalau yang disalin nilainya).
  Dijepit **±18 bulan** dari minggu aktif — satu angka yang salah baca sebagai
  seri tidak boleh menulis sel ke tahun 2125.
- **Nama di luar roster divisi TIDAK ditulis dan TIDAK ditebak** ke orang
  termirip. Disebut di pratinjau, barisnya dilewati. Nama yang cocok ke >1 kru
  → ditandai ambigu, juga dilewati. (`impCocokNama`: token = kata utuh di nama
  Office, atau — token ≥4 huruf — bagian dari sebuah kata; "BILA" menemukan
  "Nabila"; nama lengkap "Arif Rahman Harefa" dari berkas Talenta juga cocok.)
  Backend pun menolak baris di luar divisi head; di sini tidak dikirim sama
  sekali.
- **Kolom metadata di kanan berkas Talenta** (Branch/Organization/Job
  Position/…) tidak ikut jadi shift: yang dibaca cuma kolom yang ada di
  `kolTgl`, dan person-search berhenti begitu nama ketemu di 4 kolom pertama.
- **Kode yang bukan shift (mis. `HARAU!!!`) → `LAIN` + catatan sel**, persis
  cara lembar Excel lama menuliskannya (`labelSel`: catatan bebas menimpa nama
  shift). Disebut di pratinjau sebagai "catatan sel", bukan diam-diam jadi
  shift. Kalau `LAIN` sudah dihapus di Pengaturan → jatuh ke `OFF`.
- **`imporHitung()` (tiap ketukan) TIDAK menggambar ulang textarea-nya** —
  hanya `#imporPrev` + keadaan tombol Simpan. Menggambar ulang kotak yang
  sedang diketik membuang fokus (jebakan yang sama dicatat untuk `queueF` di
  modul Konten).
- **`imporParse()` sengaja MURNI** (argumen saja, tanpa global) supaya
  `tools/uji-impor-jadwal.js` bisa memotongnya dari sumber dan menjalankannya
  **tanpa jsdom** — pola `uji-openbill-performa.js`. Dedupe `u|tgl` (kolom
  tanggal dobel di tempelan) → nilai terakhir menang.

```bash
node tools/uji-impor-jadwal.js   # 39 pemeriksaan, TANPA jsdom (imporParse dipotong dari sumber)
```

`smoke-modul.js jadwal` merender 8 halaman tapi **tidak membuka modal** — uji
di atas + satu pemeriksaan glue DOM (di scratchpad) yang menutupnya.

### Jadwal: HRD mengurus DATA DIRI, bukan hak akses (19 Agustus 2026)

Halaman **Data Pegawai** di modul Jadwal Shift memberi HRD dua hal yang dulu
harus menunggu superadmin: **menambah kru baru** dan **menonaktifkan yang
keluar**, plus membetulkan data dirinya (Tim, no HP, Employee ID Talenta,
jabatan, status kerja, tanggal masuk). Yang **tidak** ikut, dan pemisahan
inilah alasan halamannya ada: modul mana yang boleh dibuka siapa, dan siapa
yang jadi admin modul — keduanya tetap di **Kelola Akses** superadmin.

Ditegakkan di server lewat dua endpoint account-api yang **tidak menyentuh
tabel `grants` maupun `admins` sama sekali**. Yang harus dijaga saat
menyentuhnya:

- `simpan_user_inti()` adalah isi `saveUser` **tanpa gerbang**, dipakai
  bersama oleh jalur superadmin dan jalur roster. Ia **selalu menulis kolom
  `pin` dan `active`** saat mengubah, dan yang tidak dikirim dianggap
  `'1111'` / aktif. `aksi_roster_simpan_user()` karena itu **menyisipkan
  keduanya dari baris lama**. Menghapus dua baris itu tidak melempar apa pun:
  gejalanya PIN seluruh kru jadi 1111 satu per satu, dan kru yang sudah keluar
  hidup lagi begitu nomor HP-nya dibetulkan.
- **Kolom Tim memang memberi akses modul bawaan** (`tim_bawaan_jadwal`), jadi
  HRD menulis "Bar" = orang itu bisa membuka modul Jadwal. Disengaja — tanpa
  Tim, kru baru tidak muncul di lembar mana pun. Yang tetap mustahil: modul di
  LUAR bawaan Tim, dan mengangkat siapa pun jadi admin.
- **Hapus permanen ADA sejak 29 Agustus 2026**, dan hanya untuk akun yang
  **sudah dinonaktifkan** (`rosterHapusUser`). Yang diminta user: nomor HP,
  username, dan Employee ID-nya bisa dipakai lagi. Syarat nonaktif dulu itu
  pagarnya — dua langkah dengan jeda di tengah, dan jeda itulah yang menahan
  penghapusan karena salah klik. **Ditegakkan di server** (`must_deactivate_
  first`), bukan cuma di layar.
- **`grants` & `admins` ikut dibuang.** Kalau tidak, barisnya jadi yatim dan
  HIDUP LAGI begitu id yang sama dipakai ulang — memberi akses modul kepada
  orang yang tidak pernah diberi apa pun. Justru itu yang membuat "id-nya bisa
  dipakai lagi" berbahaya kalau dikerjakan setengah.
- Superadmin dan diri sendiri tetap tidak bisa dihapus dari sini, alasan yang
  sama dengan nonaktif.
- Nonaktif **bukan** hapus. `kruDivisi()` menyaring `active!==false`, jadi yang
  dinonaktifkan hilang dari **seluruh** lembar termasuk bulan lalu — selnya
  tetap tersimpan dan kembali saat diaktifkan lagi. Menghapus akun (hanya bisa
  superadmin) membuat jadwal lama benar-benar kehilangan namanya.
- **Rekap Pegawai membaca SEMUA divisi** sejak tanggal yang sama
  (`rekapKandidat` tidak lagi dipotong `divisiLihat()`). Hak MENGUBAH sel di
  halaman itu tetap `bolehUbah(div)`.
- **Daftarnya menjelaskan saringannya sendiri.** Tiga kendali berdiri berjauhan
(tapis Aktif/Nonaktif, divisi, kotak cari), dan yang paling sering terjadi:
orang mencari nama yang ADA tapi tapisnya masih di "Aktif" sementara orangnya
sudah nonaktif — lalu menyimpulkan datanya hilang. Sekarang saringan yang
sedang berlaku disebut dengan KATA di atas tabel, berikut tautan **Bersihkan
saringan** yang mengembalikan ketiganya sekaligus. Bagian yang cocok dengan
kotak cari **disorot** (`sorot()`, di-esc dulu baru ditandai), dan baris kru
nonaktif diredupkan (`.peg-mati`).

Empat kolom kepegawaian adalah **daftar tertutup** di layar ini:
  `HR_BRANCH` / `HR_ORG` / `HR_LEVEL` / `HR_STATUS`. Nilai tersimpan yang tidak
  ada di daftar tetap digambar dan ditandai `(lama)` lewat `opsiHR()` — tanpa
  itu, membuka form seorang kru yang datanya diimpor dengan ejaan lain akan
  MENGGANTI kolomnya ke pilihan pertama begitu Simpan ditekan, tanpa satu pun
  galat. `jobPosition` sengaja tetap teks bebas: isinya jabatan sungguhan, dan
  daftar tertutup di situ akan basi tiap ada posisi baru.

### Portal: Kelola User dilipat, dan hapus permanen berpagar (2 September 2026)

`deploy/index.html` → **Kelola Akses** → tab **User** (superadmin, di balik PIN).
Beda dari halaman **Data Pegawai** di modul Jadwal: yang ini mengurus **hak
akses modul & admin modul**, yang itu mengurus **data diri**. Pemisahan itu
sengaja — lihat bagian Data Pegawai di atas.

**Formulirnya dilipat jadi empat seksi `<details class="af-sec">`** — Identitas
& akun, Data kepegawaian (tertutup, 6 kolom Talenta), Modul yang boleh dibuka,
Kelola akses. Dulu ketiganya digelar sekaligus bersama **sepuluh paragraf
penjelasan**, jadi tombol Simpan berada dua layar penuh di bawah kotak Nama dan
membetulkan satu nomor HP berarti menggulir turun lalu naik lagi.

- **Penjelasannya TIDAK dibuang satu kata pun** — ia pindah ke
  `<details class="af-help">` di dalam seksinya. Paragraf itu ditulis untuk
  orang yang sedang memutuskan centang mana yang diberikan, dan justru pada
  detik itulah ia dibutuhkan. `tools/uji-kelola-user.js` menghitung **10**
  paragraf dan memeriksa isi tiap-tiapnya: paragraf yang jatuh saat menyunting
  formulir tidak menimbulkan galat apa pun, cuma centang yang diberikan tanpa
  tahu akibatnya.
- **Baris tombol ada DI LUAR `.af-scroll`.** Yang menggulir cuma isiannya, jadi
  Simpan / Batal / Hapus selalu di tempat yang sama. Centang *Akun aktif* ikut
  pindah ke baris itu — ia keadaan akun, sama seperti Simpan dan Hapus.
- **Kedua kolom menggulir sendiri** di atas 900px (`position:sticky` +
  `max-height:calc(100vh - 108px)`), jadi halamannya tidak bergerak sama sekali
  dan kotak cari tidak ikut hanyut saat menggulir ke user ke-38. Di bawah 900px
  gulir bersarang **dimatikan**: dua kotak gulir di dalam halaman yang juga
  menggulir membuat orang menggeser yang salah lalu mengira daftarnya mentok.

**Hapus permanen hanya untuk akun yang SUDAH dinonaktifkan.** Aturan yang sama
dengan `rosterHapusUser` di Data Pegawai, dan alasannya sama: dua langkah
dengan jeda di tengah, dan jeda itulah yang menahan penghapusan karena salah
klik. Yang perlu dijaga:

- **Ditegakkan di server** (`must_deactivate_first` di `aksi_hapus_user`), bukan
  cuma di layar. Tombolnya memang hanya digambar untuk baris nonaktif, tapi satu
  panggilan dari console peramban melewati seluruh penjagaan layar.
- **`grants` & `admins` ikut dibuang** — sudah begitu sejak awal, dan itu justru
  yang membuat "id-nya bisa dipakai ulang" aman: baris yatim akan HIDUP LAGI
  begitu id yang sama dipakai lagi.
- **Tapis Aktif / Nonaktif / Semua**, bawaannya **Aktif**. Tanpa itu, menemukan
  akun nonaktif yang mau dihapus berarti menyisir seluruh daftar mencari baris
  yang justru paling sulit dilihat (`.u-row.inactive` diredupkan). Angka di tiap
  tombol dihitung dari **kata kunci yang sedang berlaku**, bukan dari seluruh
  daftar — kalau tidak, mencari nama yang ternyata nonaktif memperlihatkan
  "Nonaktif 6" sementara daftarnya kosong.
- **Keadaan kosong menyebut tapisnya**, bukan cuma kata kuncinya. Salah paham
  yang sudah tercatat di Data Pegawai: orang mencari nama yang ADA tapi orangnya
  nonaktif, tapisnya masih di Aktif, lalu menyimpulkan akunnya sudah terhapus.
- **Yang BELUM dipagari, dan disengaja:** tidak ada penjaga "superadmin
terakhir" di `aksi_hapus_user`. Menonaktifkan superadmin terakhir sudah mengunci
semua orang di luar sebelum sampai ke penghapusan, jadi pagarnya ada di langkah
sebelumnya — tapi kalau suatu hari nonaktif dilonggarkan, ini yang pertama harus
ditambahkan.

```bash
node tools/uji-kelola-user.js   # 39 pemeriksaan, jsdom + account-api tiruan
```

Ujinya memanggil `renderAdminList` / `fillAdminForm` langsung — panel ini di
balik gerbang PIN (`verifyAdminPin`), dan yang diuji isinya, bukan gerbangnya.
Daftar user disuntikkan ke `admin-list._users`, tempat yang sama yang diisi
`loadAdminUsers()`, jadi kode yang jalan tetap kode sungguhan.

**Matriks halaman × peran DW bisa disetel** (19 Agustus 2026) — `setting.akses`
`{halaman:{peran:0|1}}`, disunting admin modul di halaman Hak Akses. Yang perlu
diingat sebelum menyentuhnya:

- Ia **hanya mengubah halaman mana yang terlihat**. Siapa yang boleh
  MEMUTUSKAN tetap tabel di atas, dan tetap diperiksa server.
- Disimpan sebagai **selisih** dari `bolehBukaBawaan()`, bukan salinan penuh —
  salinan penuh membekukan aturan hari ini, sehingga halaman baru tidak pernah
  sampai ke pemasangan yang sudah jalan.
- `HALAMAN_KUNCI = ['akses']` tidak bisa dilonggarkan: yang bisa membukanya
  bisa mengubah matriksnya sendiri.
- `simpan_setting` **mempertahankan `akses`** persis seperti `hr` kalau yang
  menyimpan bukan admin modul. Tanpa itu penguncian cuma berlaku di layar.
- `bolehBuka()` menggabungkan SELURUH peran yang dipegang orangnya (dan `staf`
  selalu ikut). Melonggarkan sebuah baris untuk Staf = melonggarkannya untuk
  semua orang; itu disengaja, kalau tidak head bisa KEHILANGAN halaman gara-gara
  admin membukanya untuk staf.

Sengaja **tetap terbuka**: `ping`, `stats`, `jadwalDW`, `shiftHari`, `headIds`, `probeTulis`.
`probeTulis` dipakai langkah Verifikasi kedua workflow FTP — probe lama memakai
`simpanSel`, dan begitu itu dijaga sesi **seluruh deploy gagal**. Dua yang
terakhir dipanggil backend Absensi server-ke-server, yang `config.php`-nya cuma
bisa disunting manual di cPanel — menutupnya mematikan absensi kedua situs
tanpa satu pun galat yang menyebut sebabnya.

`ACCOUNT_API_URL` **tidak perlu diisi**: alamatnya diturunkan dari `SERVER_NAME`
(bukan `HTTP_HOST`, yang bisa dipalsukan), jadi tidak ada langkah cPanel saat
mendarat. Yang berubah untuk pemakai: sesi Office lama yang belum menyimpan
`token` akan mendapat gerbang "Sesi berakhir" — satu kali masuk ulang, bukan
modul yang mati.

Ujinya **wajib dijalankan** setelah menyentuh salah satu penjaga itu:

```bash
node tools/uji-hak-akses.js     # 88 pemeriksaan, butuh php + pdo_sqlite di PATH
```

Ia menjalankan kedua API sungguhan lewat `php -S` dengan account-api tiruan
berisi lima peran (admin / HRD / staf biasa / head Bar / salah-centang). Hak akses adalah
satu-satunya bagian repo ini yang **kegagalannya tidak terlihat dari layar** —
penjaga yang longgar tidak menampilkan apa pun yang aneh.
- Kunci unik yang menahan bug diam-diam: `dw_pekerja.no_hp` (satu orang satu
  baris, riwayat no-show tidak pecah).

### DW: SATU ORANG BEBERAPA DIVISI & POSISI (19 Agustus 2026)

`dw_pekerja.divisi` dan `.posisi` sekarang **CSV**, bukan satu nilai —
`"floor,bar"`. **Yang pertama adalah yang utama**: itulah yang dipakai saat
sebuah pintu menjadwalkan orang tanpa menyebut divisinya, dan itu yang tampil
sebagai identitasnya di daftar. Kolomnya diperlebar otomatis oleh
`pastikan_lebar()` (VARCHAR 120/240) — tanpa itu MySQL **memotong diam-diam**.

- Layar: `divPekerja()` / `posPekerja()` / `punyaDiv()` / `punyaPos()` /
  `divUtama()` / `posUtama()`. **Jangan** bandingkan `p.divisi === div` lagi —
  orang berdivisi `"bar,floor"` tidak akan pernah cocok dengan satu pun.
  Sama berbahayanya: memakai `p.divisi` utuh sebagai **kunci pengelompokan**.
  Terjadi 19 Agustus 2026 di kotak pilihan Rekap Pegawai — kelompok bernama
  `"floor,bar"` tidak sama dengan kode divisi mana pun, jadi orangnya **lenyap
  dari daftar** tanpa galat sementara chip di sebelahnya tetap menulis kedua
  divisinya. Kelompokkan per divisi yang ia pegang (satu orang boleh muncul di
  beberapa kelompok), dan sediakan keranjang terakhir untuk kode tak dikenal —
  daftar pilihan tidak boleh pernah menjatuhkan orang diam-diam.
- **`dw_ajuan.divisi`/`.posisi` TETAP TUNGGAL.** `simpan_ajuan` memakai
  `csv_utama()` saat mewarisi dari master; menyalin CSV ke sana tidak melempar
  apa pun — barisnya cuma tidak pernah cocok dengan lembar divisi mana pun,
  di sini maupun di modul Jadwal Shift, dan orangnya lenyap dari kalender.
- Tiap pintu yang menjadwalkan memilih posisi **yang berlaku di divisi itu**,
  bukan posisi pertama: posisi yang tidak berlaku membuat `tarifPosisi()`
  memulangkan 0, dan salahnya muncul sebagai uang.

### DW: HEAD TIDAK MELIHAT ANGKA UANG (19 Agustus 2026)

`bolehLihatUang()` = `isHR()`, satu penjaga untuk seluruh modul. Yang
disembunyikan: estimasi biaya di form Minta, kolom & kotak Est. Biaya di
Dashboard/Kalender, kolom & kotak Upah di Rekap Pegawai, chip upah di
`barisAjuan`, "Estimasi biaya" di modal detail ajuan, **dan baris kaki berkas
Excel ekspor kalender**. Yang terakhir paling mudah terlewat — tidak ada yang
membuka berkas ekspor untuk memeriksa apa ia menyembunyikan sesuatu.

Halaman yang perlu dijaga adalah yang terbuka untuk head: `dashboard`, `tamu`,
`kalender`, `rekap`, `pekerja`. `antrean`/`bayar`/`pengaturan`/`akses` sudah
HRD-only lewat `bolehBuka()`.

Yang disembunyikan hanya **tampilannya**; `S.setting.tarif` tetap ikut dalam
balasan API. Kalau tarif harus benar-benar dirahasiakan dari head, yang perlu
diubah `baca_semua()` di server.

### DW: DOBEL SHIFT SEHARI diizinkan (19 Agustus 2026)

`dw_ajuan (dw_id, tgl)` **sudah bukan kunci unik**. Sampai 19 Agustus 2026 ia
memaksa satu DW punya paling banyak satu shift per hari, dan kunci itulah —
bukan aturan lapangan — yang membuat kandidat "sudah terjadwal" dimatikan
centangnya. Sekarang Bar 11:00–17:00 lalu Floor 18:00–23:00 di hari yang sama
adalah hal yang sah. Yang tetap mustahil cuma **jam yang bertindih**.

Yang ikut berubah, dan semuanya harus dijaga bersama:

- Penjaganya `bentrok_ajuan_row()` (backend) ↔ `bentrokOrangJam()` (layar).
  **Keduanya memeriksa TIGA hari** (kemarin/hari ini/besok) karena shift lewat
  tengah malam. Kalau salah satu diubah, yang lain harus ikut — yang lolos di
  layar akan ditolak backend dengan pesan yang datang sesudah form ditutup.
- `timpa` **tidak lagi menimpa dengan sendirinya**. Dulu INSERT jatuh ke baris
  yang sama karena kunci uniknya; sekarang `simpan_ajuan` harus menunjuk id
  baris bentrok secara eksplisit, kalau tidak "timpa" justru melahirkan shift
  kedua yang bertindih — kebalikan persis dari yang diminta orangnya.
- `lembarDW().peta[dwId|tgl]` sekarang **array**, bukan satu objek.
- **Absensi ikut**: `shift_hari('DW',…)` menerima menit ketukan dan memilih
  shift yang paling pas. Tanpa itu yang terambil selalu baris pertama —
  ketukan 18:05 dihitung terhadap shift pagi, tercatat telat 7 jam, dan
  salahnya muncul sebagai **uang**, bukan sebagai galat.
- Indeksnya dicabut lewat `cabut_indeks()` di `pastikan_tabel()`, **bukan**
  berkas migrasi: migrasi tidak ikut ter-deploy dan produksi rutin tertinggal.

### DW: shift dasar & tambahan shift panjang (19 Agustus 2026)

Tarif per posisi = harga **satu shift dasar** (`setting.jamDasar`, bawaan 6 jam).
Dua akibatnya, dan keduanya disetel HRD di Pengaturan:

- Permintaan yang **jam mulainya di luar shift siap pakai** langsung diisikan
  jam selesainya sepanjang shift dasar (`serapMinta`, hanya saat jam MULAI yang
  berubah — yang menyunting jam selesai dengan sengaja tidak boleh ditimpa).
- Shift **lebih panjang dari `jamDasar`** dapat tambahan sekali jalan
  (`setting.tambahanPanjang`, bawaan 20.000) lewat `tambahanJam()` → masuk ke
  `biayaAjuan()`, jadi seluruh halaman uang ikut sendiri.

`setting.jamBatas` (bawaan 12) **tidak mengubah harga** — ia cuma memunculkan
peringatan "sebaiknya dipecah dua shift". Jangan "melengkapinya" jadi batas
atas tambahan: kalau di atas 12 jam tarifnya kembali polos, shift 13 jam jadi
LEBIH MURAH daripada shift 7 jam, dan salah seperti itu muncul sebagai uang.

Uang di modul ini dihitung **frontend saja** — tidak ada satu pun tarif di PHP.

### DW: Kalender Tamu membaca TIGA modul (19 Agustus 2026)

`TAMU_SUMBER` = Marketing + Event + **Reservasi**. Total pax di layar adalah
gabungan ketiganya. Tapi `konteksHari()` — yang menentukan panduan jumlah DW —
sengaja memakai **`paxAcaraTgl()`, bukan `paxTgl()`**: venue ini hampir selalu
punya reservasi, jadi kalau ikut dijumlahkan maka setiap hari jadi "hari
event" dan seluruh kolom kuota di Pengaturan berubah arti tanpa ada yang
mengubahnya.

### Tim HRD otomatis admin modul Roster (19 Agustus 2026)

`admin_modul_untuk()` di account-api menambahkan `jadwal` + `dw` untuk user
yang kolom Tim-nya memuat `hrd`/`hr`. **CEO tidak ikut** (ia perlu membaca
jadwal, bukan menyetel tarif). Tidak ada tabel deny untuk `admins`, jadi
aturan ini tidak bisa ditimpa per orang — cara mencabutnya mengubah kolom Tim,
dan Kelola Akses menuliskannya di kotak yang bersangkutan.

### DW: satu formulir, dua cara meminta (sejak 14 Agustus 2026)

Halaman **Ajukan Jadwal dihapus**. Ia pintu kedua ke tujuan yang sama dan
menulis langsung ke jadwal **tanpa melewati HRD** — kebalikan dari pembagian
yang justru sedang ditegakkan. Yang menggantikannya: satu form `bukaMinta()`
dengan centang *"saya sudah tahu orangnya"*.

- Nama yang dicentang head tersimpan sebagai **`dw_permintaan.usulan`** (CSV
  id, kolom sendiri), **bukan** baris `dw_ajuan`. Kalau langsung jadi ajuan,
  head efektif menjadwalkan sendiri. HRD menekan **Setujui** → jalur
  `tugaskanDW` yang sama dengan modal Tunjuk.
- Server **menyaring usulan**: id yang tidak ada / `NONAKTIF` dibuang, dan
  dipotong sebanyak `jumlah`. Usulan yang lebih banyak dari kebutuhan berarti
  head menaikkan anggarannya sendiri tanpa menyebutkannya.
- **Posisi terikat divisi**, dan sejak 14 Agustus 2026 **disimpan di
  `setting.posisiDivisi`** ({divisi: [posisi]}) yang bisa ditambah/dihapus HRD
  di Pengaturan → Posisi per Divisi. `POSISI_DIVISI` cuma nilai bawaannya.
  `posisiSemua()` (gabungan) dipakai tabel Tarif — tarif memang satu daftar
  untuk semua divisi. `normalPosisiDivisi()` memigrasi `setting.posisi` lama:
  posisi buatan sendiri masuk ke SEMUA divisi (tidak ada keterangan tersimpan
  yang bisa menebak divisinya), `POSISI_CABUT` (Runner, Event Crew) dibuang.
  Ejaan `Waiter/Waitress` dan `Dishwasher` **sengaja dipertahankan** — string
  itulah kunci `setting.tarif` dan isi `dw_pekerja.posisi`; menggantinya
  membuat `tarifPosisi()` memulangkan 0 tanpa satu pun galat, dan salahnya
  muncul sebagai uang. `opsiPosisi(div, terpilih)` tetap menggambar nilai lama
  yang sudah dihapus, ditandai `(lama)` — kalau tidak, membuka form seorang DW
  berposisi lama diam-diam mengganti posisinya (dan tarifnya) saat Simpan.
- Modal **Tunjuk** HRD ikut disaring posisi, dan pilihannya **dibatasi**
  sebanyak yang diminta (dulu cuma diberi pita peringatan lalu tetap dikirim).
- `kandidatDW(divisi, posisi, urut)` satu sumber untuk kedua daftar. Urutan
  **beda dan memang harus beda**: head `'sering'` (yang ia kenal kerjanya),
  HRD `'lama'` (menjaga giliran). **Tidak ada pelonggaran** — sempat dibuat
  melebar sendiri saat tak seorang pun cocok, dan hasilnya permintaan Cashier
  menampilkan Kitchen Helper lengkap dengan centangnya. Kosongnya dijelaskan
  `kosongKandidatHTML()`, yang membedakan "tidak ada yang berposisi itu" dari
  "divisinya memang belum punya siapa-siapa" — dua masalah dengan dua jalan
  keluar yang berbeda.

### DW: satu meja HRD, satu meja head (14 Agustus 2026)

| halaman | siapa | isinya |
|---|---|---|
| **Antrean Pengajuan** | **HRD saja** (`bolehBuka('antrean') = isHR()`) | permintaan head **dan** pengajuan DW dalam satu tabel, dibedakan kolom Jenis |
| **Permintaan DW** | **head saja** (`isHeadDW() && !isHR()`) | permintaan divisinya sendiri + putusannya, tanpa tombol putusan |

Digabung karena yang punya dua meja masuk selalu lupa membuka salah satunya:
permintaan untuk Sabtu bisa menganggur tiga hari sementara HRD merasa
antreannya kosong. HRD **tidak** melihat menu Permintaan DW — isinya sudah ada
di Antrean miliknya, dan dua pintu ke daftar yang sama membuat ia memutuskan di
satu tempat lalu mencarinya lagi di tempat lain.

`Setujui semua` di baris kepala tanggal hanya menyapu **pengajuan**, tidak
permintaan: tiap permintaan perlu diputuskan siapa orangnya, dan tombol yang
menyapu keduanya melewati justru bagian yang butuh dipikirkan.

Antrian ↔ Riwayat dipisah menurut **masih ada pekerjaannya atau tidak**
(`entriPerluDikerjakan`), **bukan** menurut status. Permintaan `DISETUJUI` yang
orangnya belum lengkap ("0 dari 1", terjadi begitu penugasannya ditolak/ditarik)
masuk **Antrian**: selama pemisahnya status, baris itu duduk di Riwayat lengkap
dengan tombol Setuju & Pilih DW-nya sementara Antrian menulis 0 — pekerjaan yang
disembunyikan di balik tab bernama Riwayat, dan yang terlewat adalah shift yang
malam itu kurang orang. Lencana sidebar memakai fungsi yang sama
(`antreanPerluDikerjakan`); dulu ia cuma menghitung ajuan `MENUNGGU`.

Di **Riwayat**, permintaan yang **terpenuhi penuh** tidak diulang
(`mintaTerwakiliAjuan`): baris penugasannya menceritakan hal yang sama dengan
lebih lengkap, dan dua baris untuk satu shift membuat kolom Upah terbaca dua
kali. Jejak "dari permintaan `<head>`" pindah ke baris penugasannya
(`asalPermintaanHTML`). `viewPermintaan` (halaman head) **sengaja tetap memakai
status** — di sana pertanyaannya "sudah diputuskan atau belum".

**Putusan bisa ditarik** (`kembalikanAjuan` / `kembalikanPermintaan`, HRD saja):
statusnya kembali `MENUNGGU`, catatan putusan lama dibuang, `putus_oleh`/`putus_at`
ditimpa dan tergambar sebagai "dikembalikan `<nama>`" (`kataPutusan('MENUNGGU')`).
Backend sudah menerima `MENUNGGU` sejak awal — tidak ada endpoint baru.
Permintaan **ditahan** kalau masih punya penugasan hidup: `kurang` jadi nol, jadi
Setuju & Pilih DW tidak muncul satu pun dan barisnya duduk di antrean selamanya.

Uang satu orang satu shift dihitung **satu tempat**: `biayaSatuOrang()` →
`biayaAjuan()` dan `biayaPermintaan()`. Sempat dua tempat, dan yang di baris
permintaan tertinggal saat tambahan shift panjang lahir — Antrean menulis
Rp 50.000 untuk shift yang ditagih Rp 70.000 begitu orangnya ditugaskan.

### DW: `KEDALUWARSA` ditulis saat DIBACA, bukan lewat cron

`tutup_kedaluwarsa()` dipanggil di awal `baca_semua()`: permintaan & ajuan
`MENUNGGU` yang tanggalnya sudah lewat jadi `KEDALUWARSA`, `putus_oleh` =
`(sistem)`. Bukan cron — hosting ini tidak punya penjadwal yang bisa
diandalkan, dan penutupan yang bergantung pada cron yang mati adalah
penutupan yang tidak pernah terjadi. Idempoten, jadi dipanggil seratus kali
sehari pun sama saja. Bukan `DITOLAK`: tidak ada manusia yang menolaknya.
Hari ini dihitung **WIB**, kalau UTC maka setiap sore lewat 17.00 permintaan
untuk HARI INI ikut tertutup.

### DW: konfirmasi kehadiran & pengganti di lokasi (15 September 2026)

Permintaan user: *"HRD udh approve, terus ternyata di lokasi ada kondisi —
orang yg di-approve tidak bisa hadir dan bisa digantikan orang lain, atau
jadinya statusnya tidak hadir. Sudah di-approve pengajuan 3 orang, tapi
realita datang 2 orang. Ini butuh ada tombol konfirmasi yang hadir siapa,
karna nnti sistem pembayaran sesuai dengan orang yg beneran hadir itu."*
Plus: *"tombol nomor untuk chat untuk memastikan apakah dia bisa hadir."*

Halaman baru **Konfirmasi Kehadiran** (kunci view `hadir`), satu tanggal per
layar, berisi shift `DISETUJUI` divisi yang jadi kuasa orangnya.

**KOLOM KEHADIRANNYA SUDAH ADA DI DATABASE SEJAK LAMA** (`hadir`,
`hadir_nota`, `hadir_oleh`, `hadir_at`) berikut endpoint `simpanHadir` —
yang dicabut 6 Agustus 2026 cuma LAYARNYA, dengan komentar di
`normalizeState` yang berbunyi "SENGAJA tidak dibaca". Alasan pencabutan itu
masih berlaku waktu itu dan **tidak berlaku lagi sekarang**: dulu tidak ada
satu pun angka yang bergantung padanya, jadi ia kolom yang diisi orang tanpa
ada yang membacanya. Yang membuatnya hidup kali ini justru **upahnya yang
mengikutinya**.

#### Yang menentukan uang: `hadirDibayar()`

```
ALFA        -> TIDAK dibayar
HADIR/TELAT -> dibayar PENUH
''  (kosong)-> dibayar PENUH
```

- **`''` TETAP DIBAYAR, dan itu bukan kelalaian.** Seluruh baris produksi yang
  lahir sebelum tanggal ini kolomnya kosong; diperlakukan sebagai tidak hadir,
  **seluruh riwayat pembayaran DW berbulan-bulan jatuh ke Rp0 sekaligus** —
  tanpa satu pun galat, dengan angka yang kelihatan wajar di tiap barisnya.
  Yang belum dikonfirmasi karena itu **dihitung terpisah** (`belum`) dan
  disebut angkanya di halaman Pembayaran serta di dashboard.
- **TELAT dibayar PENUH.** Potongan keterlambatan belum pernah diputuskan
  siapa pun, dan memotongnya diam-diam adalah keputusan tentang uang orang
  yang tidak pernah diambil. Kalau suatu hari diputuskan, yang perlu diubah
  `hadirDibayar()` — satu tempat.
- **`rekapBayar()` dan `rekapBebanDW()` memakai predikat yang SAMA.** Dua
  tempat yang memutuskan siapa dibayar akan menyimpang, dan yang menyimpang di
  sini selisih yang baru ketahuan waktu uangnya dihitung di amplop. `masuk` di
  Rekap Pegawai tetap menghitung SEMUA yang disetujui — yang ditanya di sana
  berapa kali ia dijadwalkan, bukan berapa kali ia datang.

#### Ganti orang: baris LAMA tidak diubah orangnya dan tidak dihapus

`ganti_orang()` menandai baris lama **ALFA** berikut sebabnya ("Digantikan
<nama>"), lalu **MELAHIRKAN BARIS BARU** yang sudah `DISETUJUI` + `HADIR`.

- **Mengganti `dw_id` di tempat memang satu baris SQL, dan itu yang salah.**
  Jejak bahwa si A pernah disetujui lalu berhalangan hilang seluruhnya, dan
  yang membuka riwayatnya bulan depan melihat seakan si B memang dijadwalkan
  sejak awal. Riwayat no-show adalah angka yang dicari HR sebelum memanggil
  orang yang sama lagi.
- **`permintaan_id` IKUT DISALIN.** Tanpa itu permintaan head yang
  melahirkannya berbunyi "terpenuhi 0 dari 1" begitu orangnya diganti — dan
  HRD menugaskan orang KEDUA untuk shift yang sudah punya pengganti.
- **SATU TRANSAKSI.** Berhenti di tengah meninggalkan shift tanpa siapa pun
  (yang lama sudah ALFA, yang baru belum lahir) atau dua orang untuk satu
  slot; dua-duanya muncul sebagai uang, bukan sebagai galat.
- **Bentrok jam penggantinya tetap diperiksa** (`bentrok_ajuan_row`) — ia bisa
  sudah dijadwalkan di divisi lain pada jam yang sama, dan dua shift bertindih
  untuk satu orang adalah uang untuk waktu yang tidak mungkin ia kerjakan.
- **Tiap penanda bernama dipakai SEKALI** (`:t1/:t2/:t3`, `:by1/:by2/:by3`)
  walau nilainya sama persis. `PDO::ATTR_EMULATE_PREPARES => false` mengikat
  penanda MENURUT POSISI; satu nama yang dipakai dua kali gagal dengan
  `SQLSTATE[HY093]` yang tidak menyebut kolom apa pun. Sudah kejadian
  5 Agustus 2026 di `simpan_pekerja`.

#### Gerbangnya BUKAN HRD-saja

`simpanHadir` dan `gantiOrang` memakai `wajib_hadir()` → `wajib_minta()`:
**head divisi itu atau HRD**. Yang menandai kehadiran orang yang berdiri di
lapangan adalah head yang ada di sana; menuntut HRD menekannya berarti
konfirmasi baru masuk keesokan harinya — dan yang terlambat dikonfirmasi
tidak pernah dikonfirmasi.

- **Divisinya dibaca dari BARIS (`ajuan_by_id`), bukan dari kiriman layar.**
  Dibaca dari kiriman, head Bar tinggal mengirim `divisi:'bar'` untuk shift
  Kitchen dan gerbangnya jadi hiasan.
- **`simpan_hadir()` menolak baris yang belum `DISETUJUI`** — kehadiran untuk
  shift yang belum disetujui adalah upah yang tidak pernah diajukan.

#### Tombol chat WhatsApp

`wa.me/<62…>` dengan pesan terisi (nama, tanggal, jam, divisi/posisi).

- **Nomornya dinormalkan `08…` → `628…`** (`waNomor`). Dikirim apa adanya,
  tautannya membuka percakapan kosong ke nomor yang tidak ada.
- **Yang belum punya nomor DIKATAKAN**, bukan tombol mati tanpa sebab.

#### Yang gampang lepas

- **`el()` BUKAN global** di modul ini — ia variabel lokal di beberapa fungsi.
  Memakainya di fungsi baru melempar `ReferenceError`, dan gejalanya tombol
  yang ditekan tanpa reaksi apa pun.
- **`hadirTertunggak()` dipakai dashboard DAN halaman Pembayaran.** Yang belum
  dikonfirmasi tapi sudah lewat tanggalnya adalah pekerjaan yang menggantung;
  tanpa disebut di dua tempat itu, ia cuma terlihat kalau ada yang membuka
  halaman Konfirmasi Kehadiran di tanggal yang tepat.

```bash
node tools/uji-kehadiran-dw.js   # 64 pemeriksaan, jsdom + php-parser
```

**BERKAS UJI PERTAMA untuk modul DW.** Sampai tanggal ini modul ini cuma
"hanya boot yang diuji" di `smoke-modul.js` — routernya tidak terbaca dari
luar, jadi tidak satu pun halamannya pernah dijalankan. PHP tidak bisa
dijalankan di mesin ini, jadi sisi servernya dijaga sebagai **kontrak atas
sumbernya** (pola `uji-simpan-basi.js`).

Enam belas mutasi dicoba, keenam belasnya tertangkap — **dua baru sesudah
asersinya dibetulkan**, dan keduanya bentuk yang sudah punya nama di berkas
ini: asersi yang cocok dengan teks di LUAR tempat yang diujinya.

| yang lolos | sebabnya | yang ditutup |
|---|---|---|
| `permintaan_id` tidak ikut disalin ke pengganti | kata itu masih hidup di baris yang MEMBACANYA (`$pm = ...`), jadi asersi yang menyapu seluruh badan fungsi tetap hijau | yang dibaca **daftar kolom INSERT**-nya, dan `:pm` di daftar VALUES-nya |
| pengganti tidak dicek bentrok jamnya | mutasi `$B = null && bentrok_ajuan_row(...)` meninggalkan teks panggilannya UTUH — yang dibuang hasilnya | hasilnya wajib DIPAKAI: `$B = bentrok_ajuan_row(` lalu `if ($B)` |

### DW: keterangan WAJIB di tiap pengajuan (15 September 2026)

Permintaan user: *"kirim pengajuan DW wajib mengisi keterangan"*.

**SATU ATURAN UNTUK KETIGA PINTUNYA**, dan itu yang paling menentukan di
bagian ini. Modul ini punya TIGA form yang sama-sama melahirkan baris di
antrean HRD, dan sampai tanggal ini ketiganya membiarkan kotak catatannya
kosong:

| form | kotak | tombolnya | pengirimnya |
|---|---|---|---|
| Minta DW | `mtCat` | *Kirim permintaan* | `kirimMinta()` |
| sel kalender Input Mingguan | `selCat` | *Kirim pengajuan* | `simpanSelDW()` |
| Ajukan DW (Kalender Tamu / Rekap Pegawai) | `ajtCat` | *Kirim Ajuan* | `kirimAjukanTgl()` |

Dipasang di satu form saja, dua sisanya jadi jalan pintas yang tetap mengirim
baris tanpa keterangan — HRD kembali menerima antrean yang tidak bisa dibaca
sebabnya, dan aturannya cuma menyusahkan yang menurutinya.

**WAJIB HANYA UNTUK YANG MENGIRIMKANNYA KE ORANG LAIN** (`catatanWajibDW()` =
`!isHR()`). Yang ditanyakan di sini *kenapa DW-nya dibutuhkan*, dan yang
membacanya HRD sebelum memutuskan. HRD yang menugaskan sendiri dari kalender
memasukkan lima orang berturut-turut untuk satu malam (lihat komentar
`ajukanTgl`); menuntut alasan tertulis kepada dirinya sendiri lima kali
menghasilkan lima catatan asal-asalan — dan catatan asal-asalan **lebih buruk
daripada kolom yang kosong**, karena ia terbaca seolah pertanyaannya sudah
dijawab. Kalau suatu hari HRD harus ikut, yang perlu diubah satu baris itu.

- **KIRIMANNYA DITAHAN, bukan cuma diperingatkan.** Pita merah yang muncul
  sementara barisnya tetap berangkat adalah kebalikan dari yang diminta, dan
  dari layar keduanya terlihat sama persis. `tahanCatatanKosong()` memulangkan
  `true` dan pemanggilnya **berhenti di situ**.
- **Letaknya SESUDAH penjaga tanggal lampau** di kedua form kalender: yang
  tanggalnya sudah lewat menutup modalnya sendiri, dan menyuruh mengetik
  keterangan ke modal yang sedang ditutup adalah pekerjaan yang dibuang. Di
  `kirimAjukanTgl()` ia juga **MENDAHULUI** kotak bentrok & kotak panduan —
  keduanya memanggil fungsi itu lagi, jadi pemeriksaan di belakangnya menyuruh
  mengisi keterangan sesudah dua pertanyaan dijawab.
- **Spasi saja bukan keterangan** (`.trim()`).
- **Ditandai DI KOTAKNYA** (`.field textarea.err`), bukan cuma lewat pita:
  pita menyebut aturannya, dan yang membacanya masih harus mencari kotak mana
  yang dimaksud di form berisi tujuh kotak. Aturan yang sama dengan `.rpin.err`
  di panel Kas Kecil. Kursornya juga ditaruh di kotak itu.
- **Sebabnya disebut SEBELUM tombolnya ditekan** — label bertanda `*` plus
  `Wajib diisi — HRD memutuskan dari keterangan ini`. Aturan yang cuma muncul
  sesudah orang menekan kirim dibaca sebagai halaman yang menolak, bukan
  sebagai syarat.
- **MENGETIK TIDAK MENGGAMBAR ULANG MODALNYA** (`catatanKetikDW`). Kotak yang
  dibuat ulang kehilangan fokus dan hanya huruf pertama yang masuk — jebakan
  yang sudah dibayar di `queueF()` modul Konten. Pitanya dicabut lewat DOM
  (`n.remove()`), bukan lewat penggambar ulang.
- **Penandanya (`b.catErr`) ikut dicabut**, bukan cuma pitanya dihapus dari
  layar. Ketiga form ini digambar ulang tiap ganti divisi/jam/posisi; penanda
  yang tertinggal membuat pita "belum diisi" muncul lagi di atas kotak yang
  jelas-jelas sudah terisi, dan peringatan yang keliru itulah yang melatih
  orang berhenti membacanya.
- **Kotaknya digambar SATU tempat** (`fieldCatatanDW`). Label, tanda wajib,
  contoh isian, dan pita merahnya harus berbunyi sama di pintu mana pun ia
  muncul; tiga penggambar yang sendiri-sendiri akan menyimpang, dan yang
  menyimpang di sini adalah pintu yang diam-diam berhenti menuntut apa pun.
- **DI LAYAR SAJA, tidak di server** — dan itu disengaja. Ini aturan
  kelengkapan isian, bukan gerbang hak akses: yang mengakalinya lewat devtools
  cuma merugikan dirinya sendiri. Pola yang sama dengan `adaBuktiDp()` di modul
  Reservasi. Menegakkannya di PHP juga berarti head mendapat penolakan yang
  membingungkan pada jendela waktu antara PHP dan HTML mendarat — urutan
  pendaratan FTP di repo ini memang tidak bisa dijamin.

```bash
node tools/uji-catatan-wajib-dw.js   # 50 pemeriksaan, jsdom
```

**Yang dihitung ujinya JUMLAH POST-nya, bukan ada-tidaknya pita di layar** —
itu satu-satunya asersi yang bisa membedakan "ditahan" dari "diperingatkan lalu
tetap dikirim", dan mutasi yang persis begitu memang dicoba. Tombolnya
**ditekan** lewat `jalankanAksiModal()`, bukan pengirimnya dipanggil langsung:
pelajaran `putuskan()` di modul Jadwal, yang sempat mengirim status salah
sementara ujinya hijau.

Lima belas mutasi dicoba, kelima belasnya tertangkap — tapi **enam di antaranya
mula-mula terbaca `gagal=-1`, yaitu ujinya MATI, bukan menangkap**. Sebabnya
bentuk yang sudah punya nama di berkas ini: begitu sebuah mutasi meloloskan
kiriman yang seharusnya ditahan, modalnya sudah tertutup pada langkah
berikutnya — `jalankanAksiModal()` melempar dan asersi yang langsung menyentuh
elemen kotaknya ikut melempar, jadi ringkasannya tidak pernah tercetak dan
hasil mutasinya tidak bisa dibaca sama sekali. Sekarang penekanan tombolnya
dibungkus `try` dan keberadaan kotaknya jadi **asersi tersendiri**, yang
sekaligus menjaga perilaku yang benar: form yang ditahan harus tetap terbuka.

### Dua situs yang TIDAK di bawah `deploy/`: `absensi` dan `investor`

```
absensi/                    ← FRONTEND (PWA)  -> /public_html/absensi/
                               = absensi.laksamanamuda.id
                               (dev: dev.laksamanamuda.id/absensi/)
absensi-mysql/              ← BACKEND         -> /public_html/absensi/api/
                               dipanggil sebagai 'api/api.php' — DI DALAM,
                               bukan folder tetangga

investor/                   ← Investor Compass, SATU berkas HTML mandiri
                               -> /public_html/investor.laksamanamuda.id/
                               = investor.laksamanamuda.id
                               (dev: /public_html/dev.investor.laksamanamuda.id/
                                     = dev.investor.laksamanamuda.id)
                               TIDAK punya backend: tidak memanggil API mana
                               pun dan tidak membaca sesi Office.
```

Perhatikan bedanya penamaan folder di server: `absensi` memakai nama pendek,
`investor` memakai NAMA DOMAIN PENUH — begitulah subdomainnya dibuat di cPanel,
dan menyamakannya "biar rapi" akan membuat deploy mendarat di folder yang tidak
dilayani siapa pun. Salahnya tidak melempar apa pun; yang membuka alamatnya
cuma melihat 404.

**Investor punya workflow SENDIRI: `.github/workflows/deploy-investor.yml`.**
Ia tidak ada di `deploy.yml` maupun `deploy-dev.yml` — jadi kalau menambah
sesuatu di kedua berkas itu, investor memang tidak perlu ikut. Cabangnya tetap
sama (`develop` → dev, `main` → produksi); yang membedakan cuma penyaring
`paths: investor/**`, supaya menyunting satu berkas HTML tidak memicu 40-an
langkah FTP milik seluruh modul Office. Berkas workflow-nya sendiri ikut di
`paths` — tanpa itu, memperbaiki workflow-nya tidak pernah bisa diuji.

**Kedua targetnya memakai secret `FTP_*` (produksi), termasuk yang dev** —
bukan salah ketik. Susunannya:

```
/public_html/
├── dev.laksamanamuda.id/            ← rumah akun FTP dev; "/" baginya
├── dev.investor.laksamanamuda.id/   ← docroot dev.investor, SEJAJAR
└── investor.laksamanamuda.id/       ← docroot investor (produksi)
```

Akun FTP dev terkurung di docroot-nya sendiri, jadi folder sejajar mustahil
dicapai olehnya (`../` ditolak server). Akun produksi rumahnya di home akun —
itu sebabnya seluruh job di `deploy.yml` berawalan `/public_html/` — jadi ia
bisa menulis ke kedua tempat. Percobaan pertama memakai `DEV_FTP_*` dan
BERHASIL tanpa satu pun galat, tapi foldernya lahir DI DALAM docroot dev
sementara subdomainnya tetap 403.

Yang paling sering disalahpahami soal jalur ini: **merge `develop` → `main`
TIDAK menyalin apa pun dari server dev ke server produksi.** Keduanya diisi
dari isi folder `investor/` di repo. Berkas yang disunting langsung di server
lewat cPanel karena itu akan tertimpa pada deploy berikutnya, tanpa satu pun
peringatan.

Workflow-nya punya langkah **Verifikasi** yang membuka alamat situsnya lalu
membandingkan isinya dengan repo (sesudah CRLF dibuang — FTP mengubah akhir
baris). Kalau `https` gagal karena sertifikat subdomainnya belum terbit, ia
mencoba `http` dulu sebelum menyerah: SSL yang belum siap bukan tanda deploy
gagal, dan menggagalkan run karenanya cuma melatih orang mengabaikan tanda
merah.

### Investor Compass: SSO Office, dan tidak satu pun angka contoh

Sampai 27 Agustus 2026 halaman ini dijaga **satu kata sandi yang tertulis di
dalam HTML** (`CONFIG.password`) dan seluruh isinya — omset, dividen, laporan,
program, event, buku — adalah **angka karangan di objek `CONFIG`**. Keduanya
sudah dicabut, dan alasan mencabutnya perlu diingat sebelum ada yang
"mengembalikannya biar cepat":

- Kata sandi di dalam HTML dipegang siapa pun yang menekan View Source, dan
  satu kata sandi untuk semua orang berarti mencabut akses **satu** investor
  mengharuskan mengganti kata sandi **semua** orang.
- Angka contoh yang tampil rapi di halaman investor adalah kesalahan yang
  paling mahal di repo ini: tidak ada satu pun tanda di layar yang
  membedakannya dari angka sungguhan.

Sekarang gerbangnya **akun Office yang sama** (`account-api?action=login`,
nama/username + PIN), dan yang lolos hanya pemegang kunci modul **`investor`**.
Kuncinya terdaftar lewat kartu `key:'investor'` di `BRANCHES`
(`deploy/index.html`) — tanpa baris itu kotak centangnya tidak pernah muncul di
Kelola Akses dan tidak ada seorang pun yang bisa masuk, tanpa satu layar pun
yang menyebutkan sebabnya.

**Omsetnya nyata, lewat endpoint berpagar sendiri:**

```
investor/index.html  →  POST kompas-api-mysql/api.php {action:'investorRingkas', sesi:<token>}
                     →  lib_sesi.php  →  account-api?action=whoami  (server-ke-server)
                     →  ringkas_investor()  →  angka yang SUDAH dijumlahkan
```

- **Bukan `getAll`.** getAll memulangkan seluruh blob omset — pegawai, 222
  baris compliment berikut pemberinya, piutang, pemilik, breakdown per kasir —
  dan ia **tidak menanyakan siapa pun**. Menyuruh halaman investor
  memanggilnya berarti menuliskan alamat blob itu di HTML yang dibuka orang
  luar perusahaan.
- `kompas-mysql/lib_sesi.php` adalah **salinan KETIGA** berkas kembar
  (dw-mysql, jadwal-mysql). Menyunting satu berarti menyunting tiga.
- `investorRingkas` adalah **satu-satunya** aksi berpagar di kompas-api. Aksi
  lain sengaja dibiarkan terbuka: semuanya dipanggil dari dalam Office, dan
  memasang gerbang di sana sekarang akan mematikan panel Finance.
- **TIGA KONVENSI PENJUALAN HIDUP BERDAMPINGAN DI OFFICE, dan ketiganya sah.**
  Ini sumber salah paham paling mahal di sekitar angka omset — dua kali
  ditanyakan dalam satu hari (27 Agustus 2026):

  | | rumus | dipajang di | Agustus 2026 |
  |---|---|---|---|
  | **net** | `food+bev+lainnya−discount` | Dashboard Omset ("Total Omset Hari Ini (net)") | Rp 546.005.454 |
  | **tagihan** | net + service + pajak | Rekap Penjualan ("after tax & service") | Rp 622.035.872 |
  | **netSales** | tagihan − compliment | Laporan CFO, **dan halaman investor** | Rp 610.400.022 |

  Menyebut "angka omset" tanpa menyebut layarnya karena itu selalu ambigu.

  **Compliment adalah selisih ketiga↔kedua.** Di Office ia METODE PEMBAYARAN
  (`reports[].pay.compliment`): barangnya tetap ditagihkan lalu "dibayar"
  pakai compliment, jadi ia ADA di dalam tagihan. Di laporan CFO ia baris
  diskon yang memotong penjualan, karena tamunya memang tidak membayar.
  `daily.discount` TIDAK memuatnya — itu cuma bill discount — jadi
  mengurangkannya aman. Kalau suatu hari compliment ikut dimasukkan ke kolom
  Discount di Input Omset Harian, pengurangannya WAJIB dicabut di
  `kp_netsales_hari()` DAN di `laba_rugi_bulanan()`.

  **`kp_peta_harian()` adalah satu-satunya tempat blob dibaca**, dan kedua tab
  halaman investor dihitung darinya. Sebelumnya masing-masing punya loop
  sendiri dengan aturan compliment yang beda tipis, sehingga kartu "Omset"
  bisa menyebut angka lain daripada "Net Sales" di tab sebelahnya — persis
  yang dikeluhkan user. Selisih semacam itu sekarang mustahil secara
  konstruksi, bukan karena dijaga. Jangan pisahkan lagi.

  Balasan API memuat KETIGANYA (`omset`, `dibayarTamu`, `netSales`) dan tidak
  memilih. Yang memilih adalah layar, jadi konvensinya bisa diganti tanpa
  menyentuh server. Halaman investor memakai `netSales` di SELURUH tab
  Ringkasan — kartu, grafik tahunan, grafik harian, sorotan, rata-rata per
  transaksi, dan persentase target. Seragam, karena kartu satu konvensi di
  atas grafik konvensi lain membuat yang menjumlahkan batangnya mendapat
  angka lain daripada yang tertulis besar di atasnya.

  Baris keterangan kecil di bawah kartu menyebut service, pajak, compliment,
  **dan angka tagihan POS-nya utuh** — itulah jembatan ke kartu Dibayar Tamu
  di Rekap Penjualan. Kedua layar itu MEMANG harus beda sebesar compliment:
  Rekap mencocokkan POS dengan setoran bank dan `compliment` adalah salah satu
  METODE PEMBAYARAN di daftarnya, jadi mengeluarkannya membuat jumlah metode
  tidak lagi sama dengan totalnya. Barisnya tidak digambar kalau service,
  pajak, dan compliment ketiganya nol.
**Satu berkas HTML, dua situs.** Alamat Office diturunkan dari host yang
membuka (`dev.` → `https://dev.laksamanamuda.id`, selain itu
`https://team.laksamanamuda.id` — **bukan** `office.laksamanamuda.id`, yang
tidak ada di DNS). Kalau dipatok satu, halaman dev akan memajang omset
PRODUKSI dengan angka yang kelihatan wajar.

**Bagian "Omset Harian" DICABUT dari dashboard** (29 Agustus 2026, permintaan
user). Sempat ada sebagai grafik + tabel per bulan; dibuang atas permintaan yang
sama sehari kemudian.

Yang TETAP ada: `harian` di balasan `investorRingkas` — Sorotan menghitung hari
terbaik dan rata-rata dari sana. Mencabutnya karena grafiknya hilang akan
mematikan Sorotan diam-diam. Isinya SELURUH hari yang ada datanya (bukan 30
hari terakhir seperti dulu), ~365 baris setahun.

**Angka uang SELALU PENUH** (29 Agustus 2026, permintaan user). Bentuk singkat
`rpShort` ("Rp 622 jt") dicabut dari seluruh teks dan diganti `rp()`.
Pembulatan ke jutaan menyembunyikan sampai Rp 999.999, dan di halaman yang
dibaca investor selisih sebesar itu adalah selisih yang ditanyakan. Yang tetap
singkat cuma **sumbu Y grafik** (`rpSumbu`) — sembilan digit per garis
mendorong grafiknya keluar layar, dan angka pastinya sudah ada di tooltip.

**Laporan PDF bulanan: Balance Report & General Ledger** (29 Agustus 2026).
Daftarnya **satu bulan saja, dipilih lewat penyaring** — bukan seluruh bulan
ditumpuk jadi kartu. Daftar yang memanjang tiap bulan mendorong form unggahnya
dua belas kartu ke bawah sesudah setahun. Bentuk penyaringnya sengaja sama
dengan yang di tab Laba Rugi: dua daftar bulanan di satu halaman yang cara
memilihnya berbeda membuat orang mengira salah satunya tidak bisa dipilih.
Sesudah unggah, penyaring **pindah ke bulan yang barusan diunggah** — kalau
tidak, yang mengunggah bulan baru tidak melihat perubahan apa pun dan mengira
unggahannya gagal.
Satu kali unggah untuk kedua berkas — keduanya selalu terbit bersamaan dari
sistem akuntansi, dan dua form berarti dua kali memilih bulan yang sama.

- **Binernya di disk, bukan di database** (`inv_lapor_dir()`), pola yang sama
  dengan event-mysql & marketing-mysql. General Ledger sebulan bisa belasan MB;
  di LONGTEXT tiap pembacaan daftar ikut menyeret isinya melewati
  `max_allowed_packet`. Foldernya **diusahakan di luar web root**; kalau
  terpaksa di dalam, ditutup `.htaccess` — ini neraca perusahaan.
- Tabel `inv_lapor`, kunci **(bulan, jenis) UNIK**: unggah ulang MENGGANTI,
  bukan menumpuk. Dua Balance Report untuk bulan yang sama berarti investor
  melihat dua tombol berbeda isi tanpa tanda mana yang terbaru.
- Berkas lama dihapus **SESUDAH** yang baru berhasil ditulis. Dibalik, satu
  kegagalan tulis meninggalkan bulan itu tanpa laporan sama sekali.
- **PDF diperiksa dari ISI berkasnya** (`%PDF` di empat byte pertama), bukan
  namanya: nama diketik orang dan ekstensi bisa diganti.
- **Dua pagar berbeda:** unggah/hapus = `sesi_admin_modul($u,'investor')`;
  membaca = `sesi_punya_modul`. Investor perlu membaca neraca, tidak
  menggantinya. `bolehUnggah` **dihitung server** dan ikut di balasan
  `investorRingkas` — halaman investor tidak menyimpan `adminModules` sama
  sekali, dan kalaupun menyimpan, apa pun di peramban bisa diketik ulang.
- **Isi berkas dikirim sebagai BINER lewat POST**, bukan base64 di JSON dan
  bukan `<a href>`: base64 membengkakkan 12 MB jadi 16 MB, dan URL dengan
  token tercatat di log server serta riwayat peramban.
- Kalau satu dari dua berkas gagal, **yang berhasil TETAP tersimpan** dan yang
  gagal disebut namanya. Membatalkan keduanya berarti mengunggah ulang berkas
  10 MB yang sebenarnya sudah sampai dengan selamat.

**Tab Laporan Keuangan = Profit Loss Report, tapi separuh** (27 Agustus 2026).
Susunannya disalin persis dari laporan bulanan CFO — urutan dan nama barisnya
sama — supaya investor tidak perlu mencocokkan dua penyusunan yang berbeda.
Yang perlu dijaga:

- **Hanya blok Pendapatan yang punya sumber.** COGS, Operational Expense,
  Other Income & Expense, dan Depreciation dicatat di pembukuan Finance dan
  tidak ada satu pun layar Office yang menginputnya. Barisnya tetap digambar,
  ditandai `belum ada inputnya`. Menghapusnya membuat halaman terbaca seolah
  Net Sales itu laba; mengisinya nol membuat Gross Profit = Net Sales dan Net
  Profit = Net Sales — dua angka salah yang terlihat sangat meyakinkan.
- **Compliment adalah baris pengurang TERSENDIRI**, dan itu bukan kosmetik.
  Di Office ia metode pembayaran (`reports[].pay.compliment`) dengan register
  sendiri (`compliments[]`), sementara `daily.discount` cuma bill discount.
  Karena terpisah, menjumlahkan keduanya aman. Kalau suatu hari compliment
  ikut dimasukkan ke kolom Discount di Input Omset Harian, baris ini WAJIB
  dicabut — kalau tidak Net Sales menyusut dua kali lipat tanpa satu pun galat.
- **`Income Pb 1` itu `daily.tax`, `Income service charge` itu
  `daily.service_charge`.** Keduanya IKUT di Total Sales di sini — beda dari
  KPI Ringkasan yang memakai net. Itu memang bentuk laporan CFO, dan itulah
  sebabnya angka di tab Laporan lebih besar daripada angka di tab Ringkasan
  untuk bulan yang sama.
- **Juni 2026 tidak bisa ditampilkan.** `daily` produksi baru mulai
  2026-07-31, jadi laporan PDF Juni tidak punya pasangan di sistem. Bulan yang
  tidak ada datanya memang tidak muncul di pemilih — bukan digambar nol.
- Berkas PDF laporan CFO **jangan di-commit**: isinya bertanda "PRIBADI DAN
  RAHASIA" dan memuat neraca serta gaji.

**Kerangkanya menyalin modul Reservasi** (27 Agustus 2026): menu di kiri
(`aside.sidebar` + `.side-nav`), tombol Keluar berupa ikon kecil di kaki sidebar
bersama avatar & nama pemakainya (`.side-user > .logout-x`). CSS-nya SALINAN,
bukan berkas bersama — mengubah sidebar Reservasi tidak ikut mengubah yang di
sini.

Tab **Desain Buku** dan blok **Yang Baru & Akan Launching** DIHAPUS di tanggal
yang sama atas permintaan user; keduanya tidak punya sumber data dan cuma
memajang keadaan kosong. Sisa tab lama "Program & Event" tinggal agendanya,
jadi namanya jadi **Upcoming Event** — menu bernama "Program & Event" yang
isinya cuma event adalah janji yang tidak ditepati tiap kali dibuka.

**Upcoming Event & Promo lewat SATU pintu berpagar** (27 Agustus 2026).
`kompas-api?action=investorAgenda` mengumpulkan agenda dari Marketing, Event,
dan BD OS **server-ke-server**, lalu memulangkan daftar pendek berisi judul,
tanggal, tempat. Peramban tidak pernah memegang alamat `getAll` ketiganya —
marketing membawa CRM klien, pipeline, dan invoice; bd membawa purchase order
berikut harganya, dan ketiganya tidak menanyakan siapa pun.

Ditaruh di kompas-api karena `lib_sesi.php` sudah ada di sana. Menaruh gerbang
di tiga modul berarti tiga salinan baru berkas kembar itu — dari tiga jadi
enam — dan berkas kembar yang terlalu banyak adalah yang salah satunya pasti
tertinggal.

Yang perlu dijaga:

- **Aksi TERPISAH dari `investorRingkas`**, dan dimuat MALAS di layar (hanya
  saat tab Event/Promo dibuka, hanya sekali). Ia memicu tiga permintaan HTTP;
  tab Ringkasan yang paling sering dibuka tidak perlu membayar itu.
- **`poster` promo sengaja tidak ikut.** Isinya data URI hasil unggahan, bisa
  400 KB per promo.
- Modul yang tidak menjawab **dilaporkan** (`gagal`) dan digambar sebagai pita
  peringatan. Daftar kosong yang sebenarnya berarti "servernya mati" terbaca
  sebagai "memang tidak ada acara" — dan yang kedua tidak membuat siapa pun
  memeriksa apa pun.
- Batas **200 event / 50 promo**, dan yang terpotong disebutkan jumlahnya.
  Event dibatasi longgar karena kalendernya butuh SELURUH acara di bulan yang
  sedang dilihat — potongan 20 baris membuat bulan berikutnya tergambar kosong
  padahal acaranya ada.
- **Upcoming Event punya dua bentuk**: tabel berhalaman (10 baris) dan
  kalender bulanan. Keduanya menggambar dari `AG.event` yang SAMA — datanya
  tidak diambil dua kali. Kalendernya mulai hari **Minggu**, sama dengan Radar:
  dua kalender di satu perusahaan yang kolom pertamanya berbeda hari membuat
  orang salah baca tanggal saat berpindah layar.
- Nomor halaman dipangkas jadi jendela 5 di sekitar yang aktif, dan `EV_HAL`
  dijepit ke rentang sah tiap kali digambar — daftar yang menyusut
  meninggalkan halaman 4 yang sudah tidak ada, dan tabelnya tergambar kosong
  padahal datanya ada.

**Tab yang masih kosong itu disengaja.** Dividen, laporan keuangan, program,
event, dan desain buku tidak punya sumber data di Office mana pun. Yang tampil
adalah keadaan kosong yang menyebutkan apa yang kurang. Tabnya **tidak
dihapus**: kalau dihapus, tidak ada satu pun tempat yang mengingatkan bahwa
lima hal itu pernah dijanjikan ada di sana.

Ujinya:

```bash
node tools/uji-investor.js   # 209 pemeriksaan, jsdom + account-api/kompas-api tiruan
```

Dua hal yang akan membuang waktu kalau tidak diketahui lebih dulu:

- **`absensi/` bukan di `deploy/`.** Ia berdiri sebagai situs sendiri di
  subdomain sendiri. Backend-nya DI DALAM (`api/api.php`), bukan sejajar
  seperti ticketing: kalau docroot subdomain adalah `/public_html/absensi/`,
  maka `../` menunjuk ke luar docroot dan tidak bisa dicapai lewat host itu.
- **Punya job SENDIRI di KEDUA workflow.** `deploy.yml` hanya untuk `main`,
  `deploy-dev.yml` hanya untuk `develop` — menambah modul di satu berkas saja
  membuat push ke cabang satunya tidak menghasilkan apa pun, tanpa galat.
  Sudah kejadian saat modul ini lahir.
- **Sesi Office tidak terbaca dari sana.** `localStorage` terikat origin, jadi
  `lm_session` milik `team.laksamanamuda.id` tidak ada di subdomain absensi.
  Modul ini punya login sendiri (kunci `lm_absensi_sesi`, 30 hari) yang
  **diteruskan backend-nya** ke `account-api` lewat `action=masuk` — akun tetap
  akun Office yang sama, tapi peramban tidak pernah menyentuh API akun langsung.
- **`ACCOUNT_API_URL` / `JADWAL_API_URL` / `DW_API_URL` WAJIB diisi di
  `config.php`.** Modul lain menebaknya dari host yang melayani; di subdomain
  sendiri tebakan itu salah dan tidak menimbulkan galat — absensi dev akan
  menghitung telat terhadap jadwal produksi dengan angka yang terlihat wajar.

Absensi **membaca** shift, tidak menyalinnya: `jadwal-api-mysql?action=shiftHari`
(kru tetap) dan `dw-api-mysql?action=jadwalDW` (pekerja harian). `shiftHari`
adalah endpoint sempit yang dibuat khusus untuk ini — jangan diganti `getAll`,
yang memulangkan seluruh sel + 200 pengajuan tiap kali orang menekan tombol.

`shift_hari()` memulangkan **tiga** keadaan, dan bedanya menentukan apakah
seluruh absensi hari itu masuk antrean HR: `array` (ketemu), `null` (modulnya
menjawab, orangnya memang tidak dijadwalkan), `false` (modulnya **tidak
menjawab**). Yang `false` **tidak** diantrekan — kalau disamakan dengan `null`,
satu gangguan di modul Jadwal mengirim setiap ketukan hari itu ke antrean
persetujuan tanpa satu pun pesan yang menyebut sebabnya. Jejaknya disimpan di
`shift_sumber` = `TAK_TERBACA`.

Lembur & pulang-cepat dihitung dari **lama kerja sungguhan** (`durasi`, dari
selisih dua stempel waktu), bukan dari menebak tanggal jam pulang. Tebakan lama
(`jam_pulang + 720 < jam_mulai`) tidak pernah menyala untuk shift pagi, jadi kru
pagi yang pulang lewat tengah malam tercatat **pulang cepat 16 jam**.

Yang **tidak** disimpan, dan jangan "dioptimalkan" jadi disimpan: telat, lembur,
durasi kerja. Semuanya dihitung ulang dari ketukan + shift tiap kali dibaca,
karena shift bisa berubah sesudah absen dan pengajuan bisa disetujui
berhari-hari kemudian.

Berkas berat yang memang harus ikut ter-deploy: `absensi/vendor/face-api.min.js`
(1,3 MB) dan `absensi/models/` (6,5 MB). Tanpa model, pengenalan wajah mati
total tanpa satu pun pesan galat.

**Abaikan sepenuhnya** (jangan dibaca, jangan di-grep): `node_modules/`,
`vendor/`, `*.zip` di root (itu paket rilis backend, bukan sumber),
`.pratinjau/`, `hr/` dan `event/` di root (proyek Laravel lama, BUKAN modul
yang di-deploy — modulnya ada di `deploy/hr/` dan `deploy/event/`).

Ukuran frontend (per Juli 2026): reservasi ~8.300 baris, marketing ~8.300,
event/bd/konten ~3.000–3.400, sisanya di bawah 2.000.

---

## 2. Aturan paling penting: JANGAN baca index.html utuh

`deploy/marketing/index.html` ≈ 400 KB. Sekali `Read` tanpa batas menghabiskan
puluhan ribu token untuk mendapatkan satu fungsi.

**Alur yang benar — Grep dulu, Read seperlunya:**

1. `Grep` pola nama fungsi → dapat nomor baris
2. `Read` dengan `offset` + `limit` (biasanya 40–120 baris cukup)
3. `Edit` dengan `old_string` yang unik dan sependek mungkin

Konvensi nama yang bisa langsung di-grep. **Paling lengkap di `marketing`**
(rujukan terbaik saat butuh contoh); modul lain memakai sebagian saja —
`reservasi` dan `konten` mis. tidak punya `go()`, jadi jangan berasumsi.

| Pola | Isinya |
|---|---|
| `function render<Nama>(V)` | penggambar satu halaman; `V` = elemen `#view` |
| `function paint<Nama>()` | penggambar ulang sebagian (tabel di dalam halaman) |
| `const NAV_DEF` | daftar menu sidebar; **juga sumber daftar izin** |
| `const TITLES` | judul + subjudul tiap halaman |
| `function go(view,param)` | router. Peta `R={...}` di dalamnya → render mana |
| `function normalizeState(s)` | bentuk data + **semua migrasi data lama** |
| `function seed()` | state awal kosong |
| `const API_URL` | `"../<modul>-api-mysql/api.php"` |

Cari fitur berdasarkan **teks yang dilihat user**, bukan tebakan nama fungsi:
`Grep "Surat Penawaran"` jauh lebih cepat menemukan tempatnya daripada menebak
`function penawaran...`.

> Catatan: `index.html` beberapa modul memuat byte `\0` (data URI gambar), jadi
> ripgrep kadang melaporkannya sebagai berkas biner. Itu normal, bukan
> kerusakan. `Grep` tetap bekerja.

### Graphify — untuk pertanyaan "siapa yang memanggil ini"

`Grep` menjawab **"di mana"**. Yang mahal justru **"apa saja yang ikut rusak
kalau ini kuubah"** — itu butuh beberapa `Grep` beruntun, dan gampang ada yang
terlewat. Untuk itu ada graf panggilan yang sudah terpasang:

```bash
graphify affected "infoCK" --depth 2   # siapa saja yang terdampak (radius perubahan)
graphify explain  "viewBreakdown"      # pemanggil + yang dipanggil + nomor baris
graphify update .                      # bangun ulang graf (tanpa LLM, tanpa biaya)
```

**Nomor baris yang dilaporkan graphify LANGSUNG dipakai.** `explain` menjawab
`tools/graph-src/finance.omset.js L1497`, dan baris **1497** di
`deploy/finance/omset/index.html` memang `function viewBreakdown(){`. Berkas kerangka
itu ditulis sejajar baris demi baris dengan aslinya justru untuk ini — jadi
`explain` lalu `Read` dengan `offset` itu, tanpa `Grep` sama sekali.

**Kapan TIDAK usah dipakai:** kalau cuma mau menemukan satu fitur, `Grep` teks
yang dilihat user tetap yang tercepat. Graf tidak tahu apa-apa soal string HTML,
teks tombol, atau CSS.

**Yang perlu diketahui soal berkas kerangka di `tools/graph-src/`:**

- Isinya **turunan**, dihasilkan `tools/graph-src.ps1`. **Jangan pernah
  disunting**, dan jangan tertukar saat `Grep` — kode sebenarnya ada di
  `deploy/<modul>/index.html`. Isinya sengaja cuma tanda tangan fungsi +
  panggilannya (tanpa badan fungsi) supaya hasil `Grep` tidak berlipat dua.
- graphify **menghormati `.gitignore`** (sudah diuji 31 Juli 2026), jadi
  kerangkanya wajib ter-track — tidak bisa disembunyikan di direktori terabaikan.
- **Perbarui setelah menambah/menghapus/mengganti nama fungsi**, kalau tidak
  grafnya berbohong — dan graf yang berbohong lebih berbahaya daripada tidak ada
  graf, karena ia dipercaya:

  ```bash
  powershell -ExecutionPolicy Bypass -File tools/graph-src.ps1
  graphify update .
  ```

- `graphify-out/` **tidak** masuk repo (sudah di `.gitignore`) — ia keluaran
  mesin, ukurannya megabyte, dan bisa dibangun ulang kapan saja. `tools/`
  maupun `graphify-out/` tidak pernah ikut ter-deploy: workflow FTP hanya
  mengunggah `deploy/` dan `<modul>-mysql/`.

---

## 3. Arsitektur frontend — model mental yang sudah benar

Semua modul memakai pola yang sama, jadi paham satu berarti paham semuanya:

- **`S`** = seluruh state aplikasi (satu objek besar). **`ME`** = user yang login.
  Keduanya `let` di lingkup global skrip — **bukan** properti `window`.
- **`save()`** mengirim `S` ke `api.php?action=saveAll`; **`normalizeState()`**
  merapikan yang pulang dari server.
- **Render itu total, bukan diferensial.** Setiap perubahan → `save()` lalu
  `go(...)` / `refreshView()` yang menggambar ulang halaman dari nol dengan
  string HTML. Tidak ada framework, tidak ada virtual DOM. Jangan mencoba
  memperbarui DOM secara manual kecuali memang sedang menghindari kehilangan
  fokus input (lihat `paintCRM`, `kalkHitung`).
- **Identitas dari Office (SSO).** Login lokal sudah tidak ada. Roster pegawai
  ditarik dari `account-mysql` lewat `listDivisiRoster` (semua user, tanpa PIN)
  dan `listModuleRoster` (anggota modul + flag admin).

### Helper bersama yang sudah ada — pakai ini, jangan bikin baru

`esc()` `escJs()` `rp()` `fmtDate()` `fmtDateLong()` `ago()` `today()`
`daysTo()` `uid()` `svg(IC.x)` `toast()` `modal()` `confirmUI()` `logAct()`
`pushNotif()` `can('aksi')` `stat()` `empty()` `pageHead()` `statusChip()`

**Marketing punya mesin tabel bersama** (`tblHead` / `tblUrut` / `tblPage` /
`tblPagerHtml` / `tblSortKlik`). Tabel daftar apa pun yang baru **wajib**
memakainya — cukup deklarasikan `const KOL_XXX=[{k,t,v,cls,turun,def}, …]`.
Pola yang sama sudah ada di reservasi (`tblPage`/`tblPagerHtml`).

### Hak akses

Satu matriks `(view × role) → 0 Tak Terlihat / 1 Lihat / 2 Boleh Ubah`.
`can('edit_event')` memetakan aksi → view lewat `ACTION_VIEW`. Daftar view
diambil dari `NAV_DEF`, jadi **menghapus baris `NAV_DEF` ikut menghapus baris
izinnya**. Kalau sebuah halaman perlu disembunyikan dari sidebar tapi izinnya
harus tetap ada, beri `hidden:1` (lihat baris `users` di marketing).

---

## 4. Verifikasi: pakai smoke test, jangan menebak

Repo ini tidak punya test suite. Tapi `jsdom` **sudah terpasang** di
`node_modules/`, dan modulnya berkas HTML mandiri — jadi seluruh frontend bisa
dirender di Node tanpa server. Ini pengganti "coba buka di browser" yang paling
murah, dan menangkap 90% kerusakan (halaman blank karena satu `TypeError`).

Harness siap pakai: **`tools/smoke-modul.js`**

```bash
node tools/smoke-modul.js marketing     # satu modul
node tools/smoke-modul.js               # semua modul; keluar 1 kalau ada yang gagal
```

**Cakupannya tidak seragam — jangan terlalu percaya "OK":**

| Modul | Yang benar-benar diuji |
|---|---|
| `marketing` | 22 halaman dirender satu per satu + wadah render tidak kosong |
| `event` | 10 halaman dirender + wadah render tidak kosong |
| `jadwal` | 5 halaman dirender + wadah render tidak kosong |
| `finance.omset` | 12 halaman dirender (wadahnya tak dikenali, jadi hanya "tidak melempar") |
| `cashier` | 6 halaman dirender (wadah tak dikenali) |
| sisanya | hanya boot — router/daftar halamannya tidak terbaca dari luar |

Harness mengenali **dua gaya router**: `go(view)` (marketing dkk) dan
`router()` + `location.hash = '#/<halaman>'` (modul Event). Modul dengan router
lain tetap dilaporkan apa adanya sebagai "hanya boot", bukan diam-diam
dianggap lulus. State disiapkan untuk dua penamaan: `S` (normalizeState+seed)
dan `DB` (normalize({})).

Harness mencetak sendiri alasannya di tiap baris. Kalau menggarap modul yang
cakupannya masih "hanya boot", **ujilah manual di browser** atau perluas
harness-nya lebih dulu.

Untuk pemeriksaan khusus perubahan yang sedang dikerjakan (mis. "pager muncul",
"kolom X hilang"), salin harness ke scratchpad dan tambahkan asersi — jangan
menumpuk asersi sekali-pakai ke dalam berkas repo.

**Jebakan yang sudah memakan satu siklus penuh:** `S` dan `ME` dideklarasikan
dengan `let`, jadi ada di lingkup leksikal global — **bukan** `window.S`.
Menulis `dom.window.S = ...` dari Node tidak akan terlihat oleh kode halaman.
Harus lewat `dom.window.eval("S = ...")`. Harness sudah menanganinya.

Sebelum menyerahkan pekerjaan, minimal jalankan:
```bash
node --check <blok-script-yang-diekstrak>   # sintaks
node tools/smoke-modul.js <modul>           # render semua halaman
```

### `tools/uji-qr.js` — kalau menyentuh QR tiket

Pembuat QR ada **dua kali** di repo ini, dan itu disengaja: versi JS di
`deploy/ticketing/index.html` (menggambar QR di layar) dan versi PHP di
`ticketing-mysql/lib_qr.php` (menggambar QR di lampiran PDF, dibuat di server
saat pesanan dilunaskan). Keduanya **harus** memulangkan matriks yang sama
persis untuk teks yang sama.

Kalau menyimpang, tidak ada galat sama sekali — yang terjadi cuma petugas
gagal memindai lembar cetak di pintu masuk, malam acara. Karena itu ada
pembanding otomatis:

```bash
node tools/uji-qr.js        # butuh `php` di PATH; kalau tidak ada, ia melewat, bukan gagal
```

---

### Service Excellent: papan Reward (27 Agustus 2026)

Aturan reward dulu cuma SATU BARIS teks di atas tabel Perolehan per Kru
(`rewardAturanTeks`, sudah dibuang). Sekarang `rewardPapanHtml()`: empat kartu
`.recap` + SATU tabel tangga + satu baris keterangan.

**Papan ini TIDAK punya satu pun kelas CSS sendiri, dan itu disengaja.** Versi
pertamanya (pagi yang sama) punya deret tangga bergaya `.rw-*` buatan sendiri
plus dua tabel kru — hasilnya terlihat seperti tempelan dari modul lain dan
lebih panjang daripada tabel Perolehan per Kru yang justru jadi isi halaman.
Sekarang seluruhnya memakai `.recap`, `.table-wrap`, dan `.hint` milik modul,
jadi apa pun yang berubah di gaya modul otomatis ikut.

**Jangan tambahkan daftar kru di papan ini.** Kolom Reward di tabel Perolehan
per Kru sudah menuliskan siapa dapat berapa dan siapa kurang berapa, untuk
orang yang sama, di layar yang sama.

Dua hal yang harus dijaga saat menyentuhnya:

- **Tiap kru dihitung di SATU tangga saja**, yaitu yang dibayarkan. Kru dengan
  120 review ada di tangga 100; menghitungnya juga di tangga 40 dan 70 membuat
  jumlah ketiganya lebih besar daripada jumlah kru yang dapat — dan angka yang
  tidak bisa dijumlahkan adalah angka yang berhenti dipercaya.
- **Yang belum lolos syarat minimum diukur jaraknya ke SYARAT, bukan ke
  tangga.** Syarat menang atas tangga di `rewardOf()`, jadi menulis "kurang 2
  ke tangga 40" untuk orang yang belum lolos minimum adalah janji yang tidak
  akan ditepati.

Papannya dihitung dari `baris` yang SAMA dengan tabel di bawahnya — dua tempat
yang menghitung reward sendiri-sendiri akan berselisih suatu hari, dan yang
selisih itu uang.

```bash
node tools/uji-reward-se.js   # 36 pemeriksaan, fungsinya dipotong dari sumber
```

Ujinya sengaja TERISOLASI, bukan merender seluruh modul: halaman itu memuat
`assets/venue-layouts.js` yang tidak ada di jsdom, jadi boot-nya selalu gagal
dan uji apa pun di sana akan gagal karena sebab yang tidak ada hubungannya
dengan reward. Fungsinya DIPOTONG dari berkas aslinya saat uji jalan, bukan
disalin — supaya ujinya ikut basi kalau fungsinya berubah.

## 5. Git & deploy

**Alur baku — berhenti di `develop`, jangan pernah menyentuh `main`:**

```bash
# 1. kerja di develop
git add <berkas> && git commit -m "…"

# 2. origin/develop sering sudah maju (sesi lain ikut push) — sinkronkan dulu,
#    kalau tidak push ditolak
git fetch origin && git rebase origin/develop

# 3. push
git push origin develop
```

**Naik ke produksi itu urusan user, bukan Claude.** Merge `develop` → `main`
dikerjakan user secara manual kalau perubahannya sudah dicoba di dev dan
dianggap beres. Jangan `git checkout main`, jangan merge ke `main`, jangan
`git push origin main` — walaupun kelihatannya itu langkah berikutnya yang
wajar, dan walaupun pekerjaannya sudah selesai. Cukup laporkan bahwa develop
sudah di-push dan tunggu.

### HAK AKSES TIDAK IKUT MERGE

Kode ada di git; **centang Kelola Akses ada di database**, dan dev memakai
`lakk5493_db_dev_account` sementara produksi memakai `lakk5493_db_account`.
Dua database, dua isi. Merge `develop` → `main` menyalin berkas, bukan baris
`grants`/`admins`.

Gejalanya selalu sama dan selalu membingungkan: modul barunya jalan mulus di
dev, lalu di produksi **tidak seorang pun bisa membukanya** — tanpa satu pun
galat, karena memang tidak ada yang rusak. Sudah kejadian 27 Agustus 2026 saat
modul `investor` naik: dev 6 pemegang, produksi 0.

Dua langkah yang keduanya perlu, dan yang kedua sering dikira sudah otomatis:

1. **Kunci modulnya didaftarkan.** `syncModules` cuma jalan saat superadmin
   MEMBUKA panel Kelola Akses (`openAdminPanel`) — bukan saat portal dimuat.
   Jadi di server yang panelnya belum pernah dibuka sejak modulnya lahir,
   kotak centangnya memang belum ada.
2. **Orangnya dicentang**, di server itu, satu per satu.

Untuk langkah 2 ada alat penyalin:

```bash
node tools/samakan-akses.js investor                 # lihat rencananya (tidak menulis)
LM_ADMIN="Admin" LM_PIN="…" node tools/samakan-akses.js investor --terapkan
```

PIN dibaca dari environment, **tidak pernah dari argumen** — argumen tercatat
di riwayat shell dan daftar proses. Secara bawaan alat ini **hanya menambah**:
akses yang ada di produksi tapi tidak di dev cuma dilaporkan. Dev itu tempat
main-main dan isinya rutin tertinggal; menjadikannya sumber kebenaran untuk
pencabutan berarti satu percobaan di dev bisa memutus akses orang yang sedang
bekerja. `--cabut` ada, tapi bacalah daftarnya dulu.

### Penjaga tulis-basi pada blob omset bersama (7 September 2026)

**Ini sebab kehilangan data produksi, bukan teori.** Keluhan user: tax 23
Agustus dibetulkan dari `2.514` jadi `2.514.400` di Input Omset Harian,
**terbukti tersimpan** (hard refresh menunjukkannya), lalu **beberapa menit
kemudian kembali ke `2.514`**.

`deploy/finance/omset` dan `deploy/cashier` menulis ke **SATU baris yang sama**
(`app_state` id=1 di `kompas-mysql`) dan keduanya mengirim **SELURUH state**
tiap menyimpan — omset punya 20 titik `save()`, cashier 14. Servernya menimpa
buta (`data=VALUES(data)`). Jadi:

1. Tab A dibuka pagi → memegang snapshot pagi.
2. Tab B membetulkan tax siang → tersimpan **benar**.
3. Tab A menyentuh apa pun sore → mengirim **snapshot paginya**, utuh.
4. Koreksi siang **terhapus**. Tanpa galat: dari sisi server itu penyimpanan
   yang sah.

Dua tab milik satu orang sudah cukup; tidak perlu dua orang.

**KOMENTAR LAMA DI `save_all()` KELIRU** dan kekeliruannya yang membuat ini
bertahan: ia menyebut `db_lock()` "mencegah dua penyimpanan bertabrakan".
`db_lock` hanya mencegah dua penyimpanan berjalan **BERSAMAAN** — ia tidak tahu
apa-apa soal penyimpanan dari salinan **BASI**, dan justru itu yang berbahaya.

**PENJAGANYA:** `getAll` memulangkan `ts` (= `updated_at`); klien menyimpannya
di `BASE_TS` dan mengirimkannya kembali sebagai `baseTs` saat `saveAll`. Kalau
versi di server sudah bergerak, penyimpanan **DITOLAK** berikut nama yang
menimpanya.

- **`baseTs` kosong DIBIARKAN LEWAT.** Itu klien versi lama — tab yang dibuka
  sebelum perbaikan ini ter-deploy. Menolaknya mematikan penyimpanan untuk
  siapa pun yang halamannya masih ter-cache, **termasuk kalau PHP mendarat
  lebih dulu daripada HTML** — dan di repo ini urutan pendaratan FTP memang
  tidak bisa dijamin. Lubang itu menutup sendiri begitu tiap orang memuat ulang
  sekali.
- **Versi dihitung SEKALI** (`$ua`), dipakai menulis DAN dibalas. Dihitung dua
  kali, tiap simpan KEDUA dari tab yang sama ditolak tanpa ada yang salah.
- **Klien memajukan `BASE_TS` sesudah simpannya sendiri berhasil** — isi server
  kini sama persis dengan DB di layarnya, jadi sah. Tanpa ini, simpan kedua
  selalu ditolak.
- **Konflik DIBEDAKAN dari galat jaringan** dan **tidak dicoba ulang**.
  Ulangannya tidak akan pernah berhasil selama versinya beda, dan kalau suatu
  hari penjaganya lewat, justru ulangan itu yang menimpa kerja orang.
- **Yang ditolak TIDAK dibuang.** Perubahannya masih di layar dan di
  localStorage; `DIRTY` dikembalikan true. Pesannya menyuruh **mencatat dulu**,
  bukan sekadar "muat ulang" — memuat ulang membuang ketikan itu, dan orang
  akan menurutinya lalu kehilangan justru koreksi yang sedang ia kerjakan.
- **Versi ikut disimpan bersama salinan lokal** (`CACHE_KEY+'_ts'`). Tanpa itu,
  boot yang GAGAL menghubungi server jatuh ke localStorage dengan `BASE_TS`
  nol — yaitu **tanpa penjaga** — padahal itu justru salinan yang paling
  mungkin sudah tertinggal jauh.

**`deploy/finance/kas` TIDAK ikut**, dan memang tidak boleh: `save()`-nya sudah
dilumpuhkan jadi localStorage saja sejak lama, `kirim()`/`apiSave()` di sana
kode mati yang sengaja dibiarkan hidup (kode salinan Kompas masih memanggil
`save()`, dan fungsi yang dihapus menjatuhkan halaman dengan ReferenceError).
Kas Kecil menulis lewat backend sendiri, Rekap lewat `simpanRekap` yang sempit.
Kalau suatu hari `save()` di sana dihidupkan lagi tanpa `baseTs`, ia jadi
lubang yang sama persis.

Endpoint sempit yang sudah ada (`simpanRekap`, `simpanTarget`, setoran) tetap
aman — semuanya baca-ubah-tulis di server. Ia **memajukan `updated_at`**, jadi
tab omset/cashier yang terbuka akan konflik sesudahnya. Itu **bukan** positif
palsu: blob di tab itu memang sudah basi, dan menyimpannya memang akan
menghapus hasil endpoint sempit tadi.

```bash
node tools/uji-simpan-basi.js   # 76 pemeriksaan, jsdom
```

#### Konflik yang menyuruh menunggu selamanya (15 September 2026)

Keluhan user dari **Report Daily**: kotak merah di formulir berbunyi

> *"...percobaan ulang otomatis masih berjalan. Jangan tutup halaman sebelum
> status di pojok berubah jadi Tersimpan."*

untuk kegagalan **KONFLIK** — padahal ulangan SENGAJA tidak dijadwalkan untuk
konflik. Statusnya karena itu **tidak akan pernah** berubah jadi Tersimpan, dan
yang membacanya menunggu sesuatu yang tidak akan datang.

**DUA CACAT, dan yang kedua berkas kembar yang tertinggal:**

| | |
|---|---|
| `simpanTunggu()` mencetak SATU pesan untuk semua kegagalan | **kedua** berkas |
| `kirimSekarang()` tidak punya cabang konflik sama sekali | **hanya** `deploy/finance/omset/` |

Yang kedua lebih berbahaya, dan jalur itulah yang dipakai **setiap tombol
Simpan**: konflik ikut dijadwalkan ulang 5s/10s/20s/40s/60s, padahal
ulangannya **dijamin ditolak** selama versinya masih beda — dan komentar di
`kirim()` sudah menulis sejak awal bahwa ulangan itu justru berbahaya kalau
suatu hari penjaganya lewat. `gagal(new Error(sebab))` di sana juga **membuang
penanda `.konflik`**, jadi `simpanTunggu()` tidak punya apa pun untuk
dibedakan. Cashier sudah benar sejak 7 September 2026; Omset tidak pernah ikut.

- **Pesannya dibedakan, bukan diseragamkan.** Jaringan putus: ulangan memang
  berjalan, jadi menunggu status Tersimpan itu benar. Konflik: *catat dulu,
  lalu muat ulang dan isi lagi*.
- **JANGAN sediakan tombol muat-ulang di kotak itu.** Memuat ulang membuang
  ketikan yang belum naik, dan tombol yang gampang ditekan akan ditekan
  sebelum sempat dicatat. Alasan yang sama sudah tertulis di cabang konflik
  `kirim()`.
- **Sebabnya sendiri BUKAN bug**: blob omset dipakai bersama `deploy/cashier/`,
  dan endpoint sempit (`simpanRekap`, setoran) ikut memajukan `updated_at`.
  Tab yang sudah lama terbuka memang basi. Yang salah cuma pesannya.

> **ASERSI LAMA "TIDAK ada percobaan ulang otomatis" TIDAK PERNAH BISA
> MENANGKAPNYA.** Ia menunggu **1,2 detik**, sementara ulangan pertama
> dijadwalkan **5 detik** — jadi ia hijau apa pun yang dilakukan kodenya. Yang
> baru memperkecil `RETRY_JEDA[0]` jadi 200ms lewat `eval` (const array, tapi
> isinya tetap bisa diubah) supaya jendela tunggunya benar-benar melewati
> jadwal ulangan.

> **`jejakSimpan` DIPAKAI BERSAMA SELURUH BERKAS UJI, dan tab dari seksi
> sebelumnya masih hidup.** Ulangan mereka ikut terhitung dan membuat asersi
> ini merah untuk kode yang benar — yang menyusup tab `Segar` milik uji
> penyegar otomatis. Hitungannya sekarang dijepit `x.tab === nama`. Simpan
> terjadwal dari boot tab itu sendiri juga dibersihkan dulu sebelum jendelanya
> dibuka.

Empat mutasi dicoba, keempatnya tertangkap — yang pertama mereproduksi persis
gejala aslinya (dua kiriman untuk satu konflik).

Ujinya membuka **DUA jsdom terpisah** — satu Cashier, satu Omset, localStorage
masing-masing — menghadap SATU server tiruan. Itu simulasi dua tab yang
sesungguhnya; uji yang cuma memanggil `apiSave()` sekali tidak akan pernah
menangkap bug ini, karena bug-nya lahir dari URUTAN dua penyimpanan. PHP tidak
bisa dijalankan di mesin pengembangan, jadi bagian terakhir ujinya
**membandingkan kontraknya dengan SUMBER PHP** (nama field, arah perbandingan,
dan bahwa versi yang ditulis sama dengan yang dibalas) — tiruan yang bentuknya
beda dari yang ditiru tidak menguji apa pun, pelajaran yang sudah dibayar di
stub `hpp.php` pada `uji-analytics`. Tujuh mutasi dicoba; yang pertama
(klien berhenti mengirim `baseTs`) **mereproduksi persis gejala aslinya** —
tax kembali ke `2.514`.

**Yang BELUM dikerjakan, dan itu perbaikan sesungguhnya:** mengganti `saveAll`
dengan endpoint sempit per layar, pola `simpanRekap`/`brankas_bayar_simpan`.
Penjaga ini mengubah kehilangan senyap jadi penolakan yang terlihat — ia tidak
menghapus sebabnya. 34 titik panggil, layak dikerjakan bertahap mulai dari
Input Omset Harian dan Report Daily.

#### Tombol tidak boleh bilang "tersimpan" sebelum server menjawab

Pertanyaan user 7 September 2026: *"apakah perlu loading dulu sebelum muncul
pesan sukses? jangan sampai statusnya berhasil, ternyata malah tidak
berhasil."* Perlu — dan **lima tombol** memang belum begitu.

`save()` itu fire-and-forget: menulis localStorage, memasang "Menyimpan…" di
pojok, lalu menjadwalkan kiriman **satu detik** kemudian. Tombol yang memanggil
`save()` lalu langsung mencetak `✓ tersimpan` sedang **menebak**.

`kirimSekarang()` yang menunggu jawaban server sudah ada di `omset` sejak
5 September 2026 — dengan komentar yang berbunyi *"itulah satu-satunya cara
sebuah tombol boleh mengatakan tersimpan"* — tapi **cuma dipakai satu tombol**
(Simpan Breakdown). Empat lainnya tidak, dan `cashier` bahkan belum punya
fungsinya sama sekali.

| tombol | modul |
|---|---|
| **Simpan Omset** (Input Omset Harian) | omset — *layar yang dilaporkan user* |
| Report Daily | omset & cashier |
| Simpan Pembagian | omset |
| Stock | cashier |

`simpanTunggu(idBox, idTombol, pesanOk, sesudah)` satu pola untuk kelimanya:
matikan tombolnya, pasang **⏳ Menyimpan ke server…**, dan baru cetak sukses
sesudah server menjawab.

- **GAGAL TIDAK MENGGAMBAR ULANG HALAMAN.** Isian yang barusan diketik harus
  tetap di layar, dan percobaan ulang otomatis masih berjalan. Pesan gagalnya
  menyebut keduanya — orang yang mengira ketikannya hilang akan mengetik ulang
  di atas data yang sebenarnya masih utuh.
- **Simpan Pembagian tanpa id tombol** (`null`): modalnya sudah tertutup saat
  callback-nya jalan, jadi `bh_ok` tidak ada lagi di DOM.
- **`cashier` kebagian `kirimSekarang()` DAN `beforeunload`** — keduanya belum
  pernah ada di sana. Tanpa `beforeunload`, menutup tab Cashier di dalam detik
  penundaan itu membuang simpannya tanpa satu pun peringatan.
- `kirimSekarang()` di cashier **berkas kembar** milik omset. Keduanya menulis
  blob yang sama; dua aturan untuk satu penyimpanan berarti satu modul mengaku
  berhasil untuk kiriman yang tidak pernah sampai.

Ujinya menjaga **URUTAN**, bukan adanya pesan: server tiruannya diberi jeda
buatan supaya keadaan sedang-mengirim sempat diamati. Tanpa jeda itu,
jawabannya datang di microtask berikutnya dan ujinya lulus untuk kode yang
langsung mencetak sukses. Ditambah **invarian pemindai sumber**: tidak boleh
ada `save();` yang dalam tiga baris disusul `innerHTML` berisi tanda sukses —
itu yang akan menangkap tombol BERIKUTNYA, bukan daftar nama di atas.
Diperiksa **per baris**, bukan per jendela: versi pertamanya melewati seluruh
jendela begitu melihat `simpanTunggu(` di dalamnya, dan mutasi yang
menyelipkan satu baris pola lama tepat di atas panggilan itu lolos tanpa bunyi.

#### Mesin bonus jadi SUMBER TUNGGAL: deploy/assets/performa-bonus.js (7 Sep 2026)

Permintaan user: Performa Marketing juga muncul di **modul Marketing**, Performa
Event juga di **modul Event**. (User menyebutnya "yang ada di modul cashier" —
sebenarnya keduanya ada di **panel Kas Kecil modul Finance**; Cashier cuma punya
Performa Kasir.)

Menyalinnya berarti **TIGA salinan rumus uang**. Repo ini sudah kehilangan waktu
empat kali karena berkas kembar yang tertinggal — `porsiPic`, `potonganHari`,
`hpp.php`, `cocokPic`. Jadi mesinnya **DIPINDAH**, bukan disalin: pola yang
sama dengan `deploy/assets/venue-layouts.js` dan `deploy/assets/xlsx-baca.js`.

Isinya seluruh Bonus Marketing + Bonus Event: konstanta tangga, `bonusMarketing()`,
`bonusEvent()`, `mkTangga()`, `selRealisasi()`, dan seluruh kartu skema.

- **MANDIRI.** Pemformatnya sendiri (`PB_RP/PB_NUM/PB_ESC`), disalin dari
  finance/kas. Modul Marketing memakai `rp()` bukan `fmtRp()` dan modul Event
  punya `esc()` sendiri; aset yang menumpang nama global tuan rumah akan
  memformat BERBEDA di tiap modul tanpa satu pun galat. Yang disalin hanya
  pemformat — tidak satu pun rumus uang.
- **SELURUH isinya di dalam SATU pembungkus IIFE.** `fmtRp/num/esc` di dalamnya
  bernama sama dengan milik tuan rumah, dan dua `const` bernama sama di lingkup
  global skrip klasik membuat halamannya **mati dengan SyntaxError sebelum satu
  baris pun jalan**. Sudah kejadian saat aset ini lahir. Yang dipakai tuan rumah
  diekspor ke `window` di kaki berkas.
- **Satu-satunya yang WAJIB diberikan tuan rumah**: peta Tim/Keterangan Office,
  lewat `pbSetKeterangan(fn)`. Tanpa itu tidak ada yang dianggap leader — dan itu
  keadaan yang SAH, bukan galat.
- **WAJIB dimuat SEBELUM skrip halaman** (`<script src>` biasa): penyambung
  `pbSetKeterangan(ketOffice)` dipanggil di badan skrip tuan rumah.

**Uji jsdom yang mem-boot halaman pemakainya WAJIB menyisipkan asetnya inline**
menggantikan tag `src`-nya — jsdom tidak mengambil skrip eksternal. Sudah
dilakukan di `uji-pager-event.js` dan `uji-pic-breakdown.js`; kalau lupa,
`viewPerforma()` melempar di `bonusEvent()` dan ujinya gagal karena sebab yang
tidak ada hubungannya dengan yang sedang diuji. Pola yang sama dengan
`venue-layouts.js` di `uji-bukti-dp.js`.

`uji-bonus-marketing.js` dan `uji-bonus-event.js` sekarang **MENJALANKAN aset**
apa adanya (`new Function('window', src)`), bukan memotong potongan darinya:
berkas itu sudah berdiri sendiri, jadi memotongnya lagi cuma menambah satu
tempat yang bisa menyimpang. `uji-bonus-event.js` juga memeriksa **ketiga tuan
rumah tidak menyalin rumusnya** — itu yang akan menangkap salinan berikutnya,
bukan daftar nama.

> **BELUM SELESAI.** Yang sudah: mesinnya jadi sumber tunggal. Yang BELUM:
> halamannya sendiri di modul Marketing & Event, endpoint sempit untuk
> datanya, dan aturan akses Head. Lihat blok berikutnya.

#### Aturan akses Head (BELUM dikerjakan)

Permintaan user 7 September 2026: yang **Head** (dari kolom Tim/Keterangan di
Office, kata "Head") bisa melihat seluruh tim; yang bukan Head **hanya bisa
melihat dirinya sendiri dan rekapan gabungan** — anggota tim lain tidak bisa
dibuka satu per satu. Bentuknya sama dengan Performa Kasir di modul Cashier
(7 September 2026): tab **Semua** sengaja tetap terbuka karena ia agregat dan
tidak menyebut siapa dapat berapa.

**Aturan ini untuk halaman di modul MARKETING & EVENT, BUKAN untuk
`deploy/finance/kas/`.** Di panel Kas Kecil yang membukanya Finance, dan
memeriksa siapa dapat berapa memang tugasnya — mengunci mereka di sana akan
mencabut justru pekerjaan yang halamannya ada untuk itu. Sama dengan
`adminModules` yang dikecualikan di Performa Kasir.

Yang harus diingat saat mengerjakannya:

- **Gerbangnya di penggambar, bukan di tombolnya.** Tombol PIC lain memang
  tidak digambar, tapi `data-*` bisa diubah dari devtools dalam sepuluh detik.
  Pelajaran yang sudah dibayar di `uji-performa-kasir-akses.js`.
- **Daftar Event pada segmen Semua menyebut nama PIC tiap baris** (`ev.pic`).
  Itu bocornya data per orang lewat pintu belakang; harus ikut disembunyikan
  untuk yang bukan Head.
- **SATU KATA UNTUK DUA HAL: "Head".** Hak melihat tim dan penerima Bonus
  Leader (Skema 3) memakai penanda yang SAMA, lewat `pbHead()` di
  `deploy/assets/performa-bonus.js` — sudah disatukan atas permintaan user
  7 September 2026. Jangan dipisah lagi jadi dua kata: orang yang ditandai
  salah satunya akan mendapat separuh haknya, dan tidak ada layar yang bisa
  menjelaskan kenapa. `pbHead` sengaja diekspor ke `window` supaya tuan rumah
  tidak menulis penentunya sendiri.
- Pencocokan user↔PIC lewat `officeUserId` DULU, baru nama.

Datanya juga belum ada di kedua modul itu: `getAll` memulangkan SELURUH blob
omset (piutang, 222 baris compliment berikut pemberinya, breakdown per kasir),
jadi membukanya untuk staf marketing/event **bertentangan dengan permintaan
akses ini sendiri**. Yang benar endpoint sempit — pola `investorRingkas` /
`omsetPic` / `eventsHari`.

### Performa Omset & Bonus di modul Marketing (7 September 2026)

Permintaan user. Halaman **Performa Marketing** yang selama ini hanya ada di
panel Kas Kecil modul Finance sekarang juga ada di `deploy/marketing/` sebagai
menu **Performa Omset & Bonus** (kunci view `perfomset`, kelompok Analitik).

**BEDA dari "Marketing Performance" yang sudah ada di modul itu**, dan namanya
sengaja dibedakan: yang lama mengukur **aktivitas** (lead, konversi, target
aktivitas), yang baru mengukur **omset yang diakui** berikut bonusnya. Dua
halaman bernama mirip yang mengukur hal berbeda akan membuat satu di antaranya
dikira versi lama.

**TIDAK MENYALIN SATU RUMUS PUN.** Realisasi, potongan compliment, dan seluruh
tangga bonus dihitung `deploy/assets/performa-bonus.js` — berkas yang SAMA yang
dipakai panel Finance (`pbAgregasi()`, `bonusMarketing()`, `kartuBonusMk()`).
Ujinya memeriksa persis itu: modul ini tidak boleh memuat `function bonusMarketing(`,
`function pbAgregasi(`, maupun `const MK_S2=`.

**DATANYA LEWAT ENDPOINT SEMPIT** `kompas-api?action=performaDivisi&divi=&dari=&sampai=`,
BUKAN `getAll`. getAll memulangkan seluruh blob omset — piutang, compliment
seluruh divisi berikut pemberinya, breakdown per kasir — dan membukanya di
halaman yang dibuka seluruh staf marketing **bertentangan dengan aturan hak
lihat yang justru melahirkan halaman ini**. Alasan yang sama dengan
`investorRingkas`.

- **BERPAGAR SESI**, satu dari dua aksi kompas yang begitu (selain
  `investorRingkas`). Kunci modulnya mengikuti `divi`-nya: kalau dipatok satu,
  orang yang cuma punya modul Event bisa membaca omset per PIC marketing.
- **Rumusnya TIDAK dihitung di PHP.** Yang dipulangkan baris mentah; menghitung
  sebagiannya di server berarti melahirkan berkas kembar LINTAS BAHASA, yang
  paling sulit dicocokkan.
- Baris breakdown **disaring ke kolom yang dipakai saja** — `shift` (daftar kasir
  yang dipotong) tidak ikut, itu data kasir yang tidak ada urusannya di sini.
- `strtolower`, bukan `mb_strtolower` — nama pegawai ASCII, dan fungsi mbstring
  yang tidak terpasang mematikan SELURUH endpoint folder itu.

#### Hak lihat: Head melihat tim, yang lain melihat dirinya sendiri

Permintaan user. Yang keterangannya di Office memuat kata **Head** boleh
membuka tiap anggota tim satu per satu; yang bukan **hanya** boleh melihat
dirinya sendiri dan **rekapan gabungan**.

- **Tab "Semua" SENGAJA tetap terbuka.** Ia agregat — tidak menyebut siapa
  dapat berapa — dan justru itu angka yang dipakai orang membandingkan dirinya
  dengan capaian tim. Menutupnya mencabut satu-satunya pembanding yang halaman
  ini punya, untuk sesuatu yang tidak pernah diminta. Aturan yang sama dengan
  Performa Kasir di modul Cashier.
- **GERBANGNYA DI PENGGAMBAR (`gambar()`), bukan di tombolnya.** Tombol PIC lain
  memang tidak digambar, tapi `data-pic` bisa diubah dari devtools dalam sepuluh
  detik. Ujinya melakukan persis itu — dan **versi pertama ujinya bocor**: ia
  menyuntik tombol BARU, yang tidak punya penangan klik, jadi mengkliknya tidak
  memanggil apa pun dan mutasi "gerbang cuma di tombol" LOLOS. Serangan yang
  sesungguhnya jauh lebih sederhana: ubah `data-pic` tombol yang SUDAH ADA lalu
  tekan. Jangan disederhanakan lagi.
- **Daftar Event pada segmen Semua menyebut nama PIC tiap baris** (`ev.pic`).
  Itu pintu belakang bocornya capaian per orang, jadi nama PIC hanya
  disertakan untuk Head.
- **ADMIN MODUL DIKECUALIKAN** (permintaan user: "untuk super admin tetap bisa
  lihat full team marketing punya"). Alasannya sama dengan pengecualian
  `adminModules` di Performa Kasir: yang mengelola modul ini memang tugasnya
  memeriksa siapa dapat berapa, dan menguncinya justru mencabut pekerjaan yang
  halamannya ada untuk itu. **Diperiksa dari DUA sumber** —
  `lm_session.adminModules` (jawaban Office) dan `ME.role==='super_admin'`
  (turunannya di modul ini). Turunan itu hanya diperbarui kalau pembacaan
  roster Office BERHASIL, jadi memeriksa role saja mengunci admin yang membuka
  halaman ini saat Office sedang tidak menjawab; memeriksa adminModules saja
  mengunci yang sesinya sudah lama. **`pfoBolehSemua()` satu tempat yang
  memutuskannya** — dua penentu yang disebar akan menyimpang, dan yang bocor
  justru gerbang penggambarnya.
- **Pengecualiannya TIDAK melebar**: admin modul LAIN (mis. Event) tidak ikut
  terbuka. Diuji.
- **Pitanya menyebut SEBAB haknya**, bukan cuma bahwa ia punya hak — Head dan
  admin modul dua jalan berbeda, dan yang memeriksa "kenapa saya bisa/tidak
  bisa" perlu tahu yang mana.
- **Halaman terbuka di capaian SENDIRI** untuk yang bukan Head, bukan di
  rekapan: yang membukanya paling sering ingin melihat dirinya.
- Akun yang tidak cocok dengan PIC mana pun **dikatakan sebabnya** berikut cara
  membetulkannya (isi Tim/Keterangan di Office), bukan dibiarkan melihat layar
  yang menyusut tanpa penjelasan.
- Penentunya `pbHead()` dari aset — **bukan ditulis ulang di modul ini**. Kata
  yang sama juga menentukan Bonus Leader; lihat blok penanda Head.

Peta Tim/Keterangan diberikan ke aset lewat `pbSetKeterangan()`. Di modul ini
keterangan Office tersimpan sebagai `S.users[].jabatan` (lihat sinkronisasi
roster), dicocokkan lewat `officeUserId` DULU baru nama.

**Beberapa kelas CSS kartu aset belum ada di modul ini** (`.card-sub`, `.helper`,
`.grid.g3`/`.g2`) dan ditambahkan SEPERLUNYA. Yang sudah ada (`.card` `.stat`,
`.tbl-wrap`, `.seg`, `.muted`, `.num`, `.mono`) tidak disentuh — halaman baru
tidak boleh menggeser tampilan halaman lain.

`
**MEMUAT SENDIRI, tanpa tombol** (permintaan user). Tombol "Tampilkan" cuma satu
klik yang jawabannya selalu sama — halaman ini tidak punya pilihan lain untuk
ditunggu. Ganti bulan langsung memuat.

- **Penjaganya `PFO.dimuat`** (bulan yang sudah dimuat). `pfoMuat()` menggambar
  ulang di ujungnya, dan penggambaran itulah yang memicu pemuatan — tanpa
  penanda ini keduanya saling memanggil tanpa henti, dan yang terlihat bukan
  galat melainkan halaman berkedip sambil menghujani server. Ditandai SEBELUM
  permintaan berangkat, bukan sesudah.
- Bulan yang GAGAL juga ditandai, jadi kegagalan tidak dicoba ulang selamanya;
  yang mencoba ulang tombol di pesan galatnya.
- **`render()` dan variabel `view` TIDAK ADA di modul Marketing** — penggambarnya
  `go(view,param)`, dan `view` cuma parameter go(). Ditulis `render()`, halaman
  melempar ReferenceError saat tombolnya ditekan; ditulis `view===...`, ia malah
  resolve ke `window.view` (elemen `<div id="view">`) sehingga syaratnya tidak
  pernah benar dan halaman tidak pernah digambar ulang sesudah datanya datang.
  **Kedua kesalahan itu sempat ter-commit** dan baru ketahuan waktu uji
  pemuatan otomatis ditulis.
- "Masih di halaman ini?" diperiksa lewat **elemennya sendiri**
  (`#pfo_bulan`), bukan `location.hash`: `go()` mengosongkan hash pada beberapa
  keadaan, dan `refreshView()` yang membacanya bisa melempar orang ke dashboard.


**TAMPILANNYA DISAMAKAN DENGAN PANEL FINANCE** (permintaan user), dan seluruh
aturannya **DIKURUNG `#pfo-wrap`**. Kartu halaman ini digambar aset yang lahir
untuk panel Kas Kecil, jadi ia memakai kelas MILIK MODUL ITU: `.stat` dengan anak
`.lab`/`.val`/`.foot`, `.stat.accent`, dan tabel berkepala kapital. Modul
Marketing punya `.stat` sendiri dengan anak kelas yang BERBEDA (`.sl`/`.sv`) dan
mengharapkan `.card` di sebelahnya — tanpa aturan ini kartunya tampil polos:
tanpa kotak, tanpa aksen emas, tabelnya tanpa kepala.

- **Ditulis global, `.stat`/`th`/`td`/`.seg` di 20-an halaman lain modul ini ikut
  bergeser.** Halaman baru tidak boleh mengubah tampilan halaman yang sudah
  jalan. Ujinya memindai blok CSS-nya dan menolak baris yang tidak berawalan
  `#pfo-wrap` — itu yang akan menangkap aturan BERIKUTNYA. Pemindainya membuang
  komentar dulu: penjelasan di atas aturannya menyebut nama kelas apa adanya,
  dan pemindai yang merah untuk komentar akan dimatikan orang berikutnya.
- **Keempat keadaan ikut dibungkus** (memuat, galat, siap, isi). Kalau sebagian
  saja, layarnya berpindah gaya waktu datanya datang.
- **Warnanya memakai variabel palet modul ini**, bukan nilai yang disalin dari
  Finance: dua palet yang disalin pasti menyimpang begitu salah satunya
  disetel, dan yang menyetelnya tidak akan tahu ada salinan kedua.
- `.stat::before` (garis emas di kepala kartu) DIMATIKAN di dalam kurungan —
  itu gaya modul Marketing; panel Finance tidak punya, dan yang diminta
  tampilan Finance.

```bash
node tools/uji-performa-marketing-modul.js   # 49 pemeriksaan, jsdom
````

Empat belas mutasi dicoba, keempat belasnya tertangkap. Ujinya juga membandingkan angka di
layar dengan `pbAgregasi()` langsung: kalau suatu hari ada yang menyalin
rumusnya ke modul ini, perbandingan itu yang berbunyi.

> **Performa Event di modul Event BELUM dikerjakan.** Fondasinya sudah siap —
> endpoint `performaDivisi` sudah menerima `divi=event`, dan `bonusEvent()` /
> `kartuBonusEv()` sudah ada di aset. Yang perlu ditulis tinggal halamannya,
> dengan aturan hak lihat yang sama.

### Modul Marketing: tiga revisi (7 September 2026)

**1. Request Design & Video dibagi kategori, bawaannya YANG BELUM SELESAI.**
Kendalinya sudah ada sejak lama (`drFilter.status` = `'open'/'done'/'batal'`), tapi
berupa dropdown yang tenggelam di antara tiga kendali lain dan bawaannya SEMUA.
Sekarang tab `.seg` — **Belum Selesai / Sudah Selesai / Dibatalkan / Semua** —
dengan angka di tiap tab.

- **Angka tab dihitung TANPA tapis status itu sendiri** (`drHitungKat()`). Kalau
  ikut, tab yang tidak sedang dipilih selalu menulis `(0)`, dan nol membaca
  sebagai "tidak ada apa-apa di sana" alih-alih "kamu sedang melihat kategori
  lain". Tapis LAIN (jenis, kata kunci) TETAP berlaku: angkanya harus
  menjanjikan apa yang benar-benar muncul kalau tabnya ditekan. Aturan yang
  sama dengan angka PIC di Content Planning modul Konten.
- **Keadaan kosong menyebut KATEGORI yang sedang dilihat** berikut jumlah yang
  ada di kategori lain — tab itulah saringan yang paling sering jadi sebabnya,
  dan yang tidak menyadarinya akan melaporkan datanya hilang.
- `drSelesai()` membaca `S.designreqprog` (kabar dari modul Konten), bukan field
  di requestnya. Uji yang menyetel wadah lain akan lulus karena sebab yang
  salah: seluruh request terbaca "belum selesai".

**2. Reporting jadi PER BULAN, barisnya PER KATEGORI.** Pemilih bulan, tiga
kartu ringkas (Total Omset, Jumlah Event, Rata-rata per Event), dan tabel
**kategori · jumlah event · total omset**, dengan baris TOTAL di kakinya.

> Barisnya sempat **per tanggal acara**, dan diganti hari yang sama atas
> permintaan user ("jangan per tanggal, per kategori"). Yang hilang dengan
> pengelompokan per tanggal justru pertanyaan yang dibawa orang ke halaman ini:
> omsetnya datang dari jenis acara yang mana. "Hari mana yang ramai" sudah
> dijawab kalender di halaman sebelah.

- **KATEGORINYA DARI `jenisEvent()`, BUKAN `e.jenis` mentah.** "Lainnya" itu
  penanda isian bebas, bukan jenis — dibaca mentah, seluruh acara yang jenisnya
  diketik sendiri menumpuk jadi satu baris bernama "Lainnya" dan tidak ada satu
  pun layar yang bisa memecahnya lagi. `jenisEvent()` dipakai chip di Daftar
  Event, kalender, dan Event Brief; penentu kedua di sini berarti kategori yang
  sama berbunyi lain di dua layar.
- **Yang jenisnya kosong TIDAK dibuang dan TIDAK dijatuhkan ke kategori
  pertama** — acara tanpa jenis tetap membawa omset, dan membuangnya membuat
  jumlah kategori berhenti sama dengan totalnya. Ia diberi namanya sendiri,
  aturan yang sama dengan `katEvent()` di modul Analytics.
- **Diurutkan dari omset TERBESAR, bukan menurut abjad.** Pertanyaannya "dari
  kategori mana omsetnya datang", dan jawabannya ada di urutannya. Yang sama
  besar dipisah namanya supaya urutannya tidak berubah-ubah tiap render.
- **BULANNYA DIBACA TANGGAL ACARANYA** (`e.tanggal`), bukan tanggal barisnya
  diinput — yang dipasangkan dengan omset adalah bulan acaranya berlangsung.
  Dikatakan di layarnya supaya tidak perlu ditebak.
- Hanya event **Confirmed / Deal / Event Done**. Peluang yang belum closing
  bukan omset, dan memasukkannya membuat angka bulan berjalan turun tiap kali
  ada peluang yang batal.
- Angkanya dari `eventFinance().grand` — rumus yang sama dengan Surat Penawaran
  dan Invoice. Menghitungnya sendiri berarti laporan yang menyebut angka lain
  daripada dokumen yang sudah dikirim ke klien. **`detail.total` TIDAK dibaca
  siapa pun**; subtotalnya dari tabel Rincian, atau — kalau tabelnya kosong —
  dari `eventFbCost + sewaVenue + biayaTeknis + biayaLain`. Uji yang mengisi
  `detail.total` mendapat NOL untuk semua barisnya, dan pemeriksaan urutan lulus
  tanpa menyentuh apa pun: deret nol memang selalu tidak menaik. Karena itu
  ujinya sekarang memeriksa dulu angkanya benar-benar sampai ke tabel.
- **Baris TOTAL ada DI DALAM tabelnya**, bukan cuma di kartu atas: yang
  menjumlahkan kolomnya sendiri harus bisa mencocokkannya tanpa menggulir balik.
- Yang DICABUT: donat *Revenue per Jenis Event*, kartu Total Pax, dan Avg per
  Pax. `donutSVG()` ikut dicabut — Reporting satu-satunya pemakainya. Donat itu
  memang memecah per jenis juga, tapi sebagai gambar tanpa angka; yang
  menggantikannya tabel yang bisa dibaca dan dijumlahkan.

**3. Halaman "Marketing Performance" DICABUT.** Yang menggantikannya *Performa
Omset & Bonus*: ia menjawab pertanyaan yang sama ("sebagai tim kita di mana")
dengan angka yang BENAR-BENAR dipakai membayar bonus, dan dihitung berkas yang
sama dengan panel Finance. Papan lama menilai AKTIVITAS dari data yang cuma ada
di modul ini, jadi ia selalu bisa berbeda dari yang dipegang finance tanpa ada
yang bisa menjelaskan mana yang benar.

Rujukannya ada di **enam** tempat dan semuanya harus ikut: `NAV_DEF`, `TITLES`,
peta router, **keempat** daftar nav role, `VIEW_TERBUKA`, dan penggambarnya
sendiri. Ikut dicabut seluruh pembantunya — `perfPeriode`, `PERF_BD`,
`muatPerfBD`, `perfPitaBD`, `KOL_LEADERBOARD`, dan `KOMPAS_API` yang hanya
dipakai `muatPerfBD`.

- **`VIEW_TERBUKA` jadi KOSONG, mekanismenya TIDAK dicabut.** `'performance'`
  satu-satunya isinya; mencabut mekanismenya berarti menyentuh
  `punyaAksesModul()`, `accessMatrix`, dan `openUserAccess` demi perubahan yang
  seharusnya cukup di satu baris.
- **`'perfomset'` SENGAJA TIDAK dimasukkan ke `VIEW_TERBUKA`**: halaman itu
  memajang omset per orang, jadi ia harus tunduk pada matriks hak akses seperti
  halaman lain — bukan terbuka untuk siapa pun yang memegang modul ini.
- Endpoint `omsetPic` di kompas-api **TIDAK** dicabut, dibiarkan hidup seperti
  `simpanTarget`: mencabut endpoint karena satu-satunya pemakainya hilang adalah
  pekerjaan yang tidak bisa dibatalkan demi kerapian yang tidak diminta.

````bash
node tools/uji-revisi-marketing.js   # 46 pemeriksaan, jsdom
````

Ujinya membuang komentar sebelum mencari — sejarah kenapa sesuatu dicabut
justru harus tetap boleh menyebut namanya; yang dilarang PEMAKAIANNYA. Satu
rujukan yang tertinggal untuk fungsi yang sudah dibuang adalah ReferenceError,
dan gejalanya **layar putih** tanpa satu kata pun yang menyebut sebabnya. Enam
mutasi dicoba, keenamnya tertangkap.

### Performa Omset & Bonus di modul Event (7 September 2026)

Permintaan user, sehari setelah halaman kembarannya di modul Marketing:
*"yang di bagian modul event, saya ingin juga ada performa event yang di ambil
dari modul finance, tapi CSS-nya juga samakan aja dengan yang modul marketing
punya performa marketing."* Kunci view `perfomset`, kelompok menu Analitik.

**BEDA dari "Event Performance" yang sudah ada di modul itu**, dan keduanya
sengaja dipertahankan: yang lama mengukur **jalannya acara** (talent, tiket,
kehadiran), yang baru mengukur **omset yang diakui** berikut bonusnya. Dua
halaman bernama mirip yang mengukur hal berbeda akan membuat salah satunya
dikira versi lama — karena itu namanya dibedakan, bukan disamakan.

**TIDAK MENYALIN SATU RUMUS PUN.** Realisasi, potongan compliment, dan keempat
skema bonus dihitung `deploy/assets/performa-bonus.js` — berkas yang SAMA yang
dipakai panel Kas Kecil dan modul Marketing (`pbAgregasi()`, `bonusEvent()`,
`kartuBonusEv()`). Ujinya memeriksa persis itu: modul ini tidak boleh memuat
`function bonusEvent(`, `function pbAgregasi(`, `function kartuBonusEv(`, maupun
`const EV_S1=`.

**Datanya lewat `performaDivisi&divi=event`**, endpoint sempit yang sudah ada
sejak halaman Marketing — tidak ada endpoint baru. Bukan `getAll`: getAll
memulangkan seluruh blob omset (piutang, compliment seluruh divisi berikut
pemberinya, breakdown per kasir), dan membukanya di halaman yang dibuka seluruh
tim event bertentangan dengan aturan hak lihat yang justru melahirkannya.

#### Hak lihat: sama persis dengan modul Marketing

Yang keterangannya di Office memuat kata **Head** boleh membuka tiap anggota
tim; yang bukan **hanya** boleh melihat dirinya sendiri dan rekapan gabungan.

- **Penentunya `pbHead()` dari aset**, bukan ditulis ulang di modul ini. Kata
  yang sama juga menentukan penerima Bonus Leader — satu kata untuk dua hal,
  keputusan user 7 September 2026. Jangan dipecah lagi.
- **GERBANGNYA DI PENGGAMBAR (`gambar()`), bukan di tombolnya.** Tombol PIC lain
  memang tidak digambar, tapi `data-pic` bisa diubah dari devtools dalam sepuluh
  detik. Ujinya melakukan persis itu — mengubah `data-pic` tombol yang **sudah
  ada** lalu menekannya, BUKAN menyuntik tombol baru (tombol suntikan tidak
  punya penangan klik, jadi mutasi "gerbang cuma di tombol" akan lolos; itu
  sudah kejadian di versi pertama uji Marketing).
- **Tab Semua SENGAJA tetap terbuka** — ia agregat, tidak menyebut siapa dapat
  berapa, dan justru itu pembanding yang halaman ini punya.
- **Nama PIC di Daftar Event segmen Semua hanya untuk yang berhak.** Itu pintu
  belakang bocornya capaian per orang.
- **MANAJEMEN dikecualikan lewat `peranSaya()`**, bukan penentu kedua. Fungsi itu
  sudah menggabungkan roster Office dan `adminModules` di sesi, **termasuk jalan
  mundurnya waktu Office tidak menjawab** — yang menulis penentunya sendiri di
  sini akan mengunci manajemen setiap kali account-api diam.
- **Office yang diam TIDAK membuka tim untuk staf biasa**: `rosterSaya()`
  memulangkan null, jadi ia bukan Head dan bukan pula PIC yang dikenal. Yang
  tersisa rekapan gabungan, dan sebabnya dikatakan di layar.

#### Yang gampang lepas tanpa satu pun galat

- **Nama field Open Bill `ob` / `obAmount` / `obTax` / `obService`** (lihat
  `pbObTotal()`). Salah nama tidak melempar — barisnya cuma berhenti punya Open
  Bill, dan "Diakui" berhenti sama dengan setengah Nilai Event. Kolomnya hanya
  digambar kalau ada yang punya: kalau selalu tampil, mayoritas periode
  memajang satu kolom penuh Rp0.
- **Dasarnya NET (`amount`), bukan Diakui** — beda dari Bonus Marketing. Sudah
  dijaga `tools/uji-bonus-event.js`; di sini yang dijaga tabelnya menyebut nilai
  yang sama.
- **`PEV.dimuat` menahan perputaran render→muat→render.** `pevMuat()` memanggil
  `router()` di ujungnya, dan `router()` itulah yang memicu pemuatan; tanpa
  penanda bulan yang sudah dimuat, yang terlihat bukan galat melainkan halaman
  berkedip sambil menghujani server. Ditandai SEBELUM permintaan berangkat.
- **"Masih di halaman ini?" diperiksa lewat `#pev_bulan`**, bukan
  `location.hash` — hash di modul ini bisa memuat segmen kedua & ketiga.
- **Aset WAJIB dimuat sebelum skrip halaman**: `pbSetKeterangan()` dipanggil di
  badan skrip tuan rumah.
- **Uji jsdom WAJIB menyisipkan asetnya inline** menggantikan tag `src`-nya.
  Kalau lupa, halamannya jatuh ke cabang "mesin tidak termuat" dan ujinya
  lulus/gagal karena sebab yang tidak ada hubungannya dengan yang diuji.
- **Stub `fetch` di uji tidak boleh menjawab `listModuleRoster` asal-asalan.
  `ambilOffice()` membaca balasan tanpa `members` lalu MENGOSONGKAN `EMS_ROSTER`,
  dan seluruh hak lihat runtuh — halamannya jatuh ke rekapan gabungan, dan yang
  membaca laporannya akan mengira gerbangnya yang salah. Sudah kejadian saat
  uji ini ditulis.

#### CSS: dikurung `#pev-wrap`

Kartu halaman ini digambar aset yang lahir untuk panel Finance, jadi ia memakai
kelas MILIK MODUL ITU: `.stat` dengan anak `.lab`/`.val`/`.foot`, `.stat.accent`,
`.seg`, `.notice`, `.tbl-wrap`, `.num`. Modul Event punya `.stat` sendiri dengan
anak kelas yang BERBEDA (`.lbl`/`.val`/`.sub`).

- **Ditulis global, `.stat`/`th`/`td`/`.seg` di 16 halaman lain ikut bergeser.**
  Ujinya memindai blok CSS-nya dan menolak baris yang tidak berawalan
  `#pev-wrap` — itu yang akan menangkap aturan BERIKUTNYA. Pemindainya
  membuang komentar dulu: penjelasan di atas aturannya menyebut nama kelas apa
  adanya, dan pemindai yang merah untuk komentar akan dimatikan orang
  berikutnya.
- **`.stat .val` modul ini bergradasi emas lewat
  `-webkit-text-fill-color:transparent`.** Kalau tidak dikembalikan jadi
  `currentColor`, angka di kartu `.accent` (latarnya sudah emas) **TIDAK
  TERLIHAT sama sekali** — dan kartu kosong terbaca sebagai data yang gagal
  dimuat, bukan sebagai salah warna.
- **Keempat keadaan ikut dibungkus** (memuat, galat, siap, isi); kalau sebagian
  saja, layarnya berpindah gaya waktu datanya datang.
- **Warnanya memakai variabel palet modul ini**, bukan nilai yang disalin dari
  Finance. Yang ditulis `rgba()` literal cuma tint pita peringatan — modul ini
  memang tidak punya variabel latarnya, dan `.perhatian-kosong` sudah begitu.
- **`.btn-ghost`/`.btn-sm` dipetakan di sini**, bukan diganti di asetnya: asetnya
  dipakai tiga tuan rumah, dan modul ini menamainya `.btn.ghost`/`.btn.sm`.

````bash
node tools/uji-performa-event-modul.js   # 80 pemeriksaan, jsdom
````

Dua belas mutasi dicoba, kedua belasnya tertangkap. `smoke-modul.js event`
**tidak cukup**: ia tidak mengambil skrip eksternal, jadi halaman ini di sana
selalu jatuh ke cabang "mesin tidak termuat" dan seluruh hitungannya lewat
tanpa disentuh.

> Dengan ini pekerjaan yang tertulis "BELUM dikerjakan" di blok **Mesin bonus
> jadi SUMBER TUNGGAL** sudah selesai untuk kedua modul.

### Data Marketing hilang sendiri: koleksi yang tidak punya penjaga (8 Sep 2026)

Tiga keluhan user dalam satu pesan, dan **dua di antaranya satu sebab**:

1. *"Request Design & Video yang di-request kok hilang semua?"*
3. *"Reservasi VIP yang Aurel input tgl 7 Sept untuk tgl 10 Sept hilang."*

**`designreqs` dan `vip` ADA di `MKT_COLS` (klien) tapi TIDAK ADA di
`collections()` maupun `scalar_keys()` (server).** Keduanya karena itu jatuh ke
cabang **terakhir** `save_all()` — cabang "kunci yang belum dikenal backend" — dan
disimpan sebagai satu gumpalan JSON lewat `put_setting()`:

```sql
INSERT INTO settings (k,v) VALUES (:k,:v) ON DUPLICATE KEY UPDATE v = VALUES(v)
```

**Timpa buta, tanpa satu pun penjaga.** Siapa pun yang tab Marketing-nya
terbuka sejak pagi lalu menekan simpan apa pun sore hari MENGGANTI seluruh
daftar Request Design dan seluruh daftar Reservasi VIP dengan salinan lamanya.
Ada **100 titik `save()`** di modul itu, jadi hampir tindakan apa pun memicunya.

Yang membuatnya bertahan: **penjaganya sudah ada dan sudah benar** untuk
tabel lain (`baseUpdatedAt`, cap urutan, `hapus_yang_hilang` yang dibatasi
`_sejak`), dan **klien sudah mengirim semua yang dibutuhkan** — `designreqs` dan
`vip` ada di `MKT_COLS` sejak lama, jadi `stampChanges()` dan `buildPayload()`
sudah mencapnya. **Servernya yang membuangnya.** Yang membaca kodenya melihat
mesin penjaga yang lengkap dan berhenti memeriksa.

Sekarang keduanya digabung PER BARIS lewat `upsert_settings_collection()`,
dengan penjaga yang **sama persis** dengan `upsert_collection()`.

- **BUKAN dijadikan tabel baru**, dan itu disengaja: berkas migrasi di repo ini
  rutin tertinggal di produksi, sehingga tabel yang lahir dari `schema.sql` saja
  berarti endpoint yang 500 di satu server dan 200 di server sebelahnya.
  Bentuk simpanannya tetap; yang berubah CARA MENULISNYA.
- **Namanya WAJIB masuk `$known`**, dan penggabungannya WAJIB sebelum cabang
  `extra:`. Kalau tidak, `put_setting()` di sana menimpa balik hasilnya dengan
  salinan mentah kiriman, dan seluruh penjaga jadi hiasan.
- **`_versi` WAJIB ikut menghitungnya** (`versi_baris()`). Tanpa itu, menambah
  satu Request Design atau satu Reservasi VIP **tidak menaikkan `_versi` sama
  sekali** — dan penyegar otomatis di klien berhenti lebih awal begitu versinya
  sama (`vSrv===_sejakVersi`). Tab orang lain karena itu tidak pernah menarik
  baris baru itu, lalu kirimannya yang basi menghapusnya. **Dua bug yang saling
  memberi makan**, dan yang kedua tidak akan pernah ketahuan tanpa yang pertama.
- **Baris tanpa `id` tidak ikut digabung**: tanpa id ia tidak bisa dicocokkan,
  jadi mempertahankannya berarti ia berlipat tiap kali disimpan.

#### Cap urutan tidak boleh datang dari jam perangkat

Keluhan **nomor 2** — *"inputan event baru Devani bulan Oktober hilang"* —
menyentuh `events`, yang justru **sudah** punya penjaga lengkap. Satu-satunya
mekanisme yang bisa mengalahkannya: `updated_at` datang dari `Date.now()` **jam
perangkat masing-masing**, sementara `_versi` adalah MAX di seluruh tabel.

Satu jam yang berjalan CEPAT menaikkan `_versi` melampaui waktu sebenarnya — dan
sejak itu setiap baris yang dibuat perangkat berjam normal lahir dengan cap **di
bawah `_sejak` orang lain**, sehingga sah dihapus oleh `hapus_yang_hilang()`.

> Komentar lama di `baca_state()` menyatakan cara ini *"tetap sahih walau jam
> tiap perangkat berbeda"*. Itu **keliru**, dan kekeliruannya yang membuat ini
> bertahan: mengambil maksimum dari tabel tidak menyatukan jamnya — ia justru
> memungut yang paling melenceng. Pola yang sama dengan komentar keliru di
> `cocokPic()` dan `save_all()` kompas.

Sekarang `cap_tulis()` yang memutuskan, dari **jam server**:

- baris yang DIUBAH klien (punya `baseUpdatedAt`) → cap jam server, minimal satu
  di atas versi server supaya penjaga urutan tidak memblokir tulisan yang benar;
- baris yang TIDAK diubah → **dijepit** ke jam server: capnya cuma dipantulkan
  balik klien, dan yang dipantulkan tidak boleh melompat ke masa depan.
- `$nowMs` diambil **sekali per kiriman**; per baris, dua baris yang disimpan
  bersamaan bisa dapat cap berbeda tanpa alasan.

**Cap yang dipakai WAJIB ikut tersimpan di `data`** (`$simpan['updatedAt'] = $ua`).
Klien membaca versinya dari sana lalu mengirimkannya balik sebagai
`baseUpdatedAt`, sementara penjaga bentrok membandingkannya dengan **kolom**
`updated_at`. Sejak cap ditentukan server keduanya PASTI berbeda kalau tidak
disamakan — dan setiap suntingan berikutnya lalu dilaporkan bentrok padahal
tidak ada yang menyalip. Bug ini sudah laten sebelum perubahan hari ini (cap
yang dinaikkan `verServer+1` pun tidak pernah dipantulkan ke `data`).

#### Reservasi VIP di Radar (permintaan user nomor 4)

**Datanya SUDAH ikut terbawa sejak lama** — `vip` ada di dalam `getAll` Marketing
yang memang sudah ditarik Radar. Yang belum cuma pemakaiannya: **tidak ada
permintaan HTTP tambahan dan tidak ada sumber baru di `SUMBER[]`**.

- **Sumbernya diberi nama sendiri (`'vip'`)**, bukan ditumpangkan ke `'mkt'`:
  panel detail, badge, dan penyaring semuanya bercabang di `a.sumber`, dan baris
  VIP yang menyamar sebagai event Marketing akan dibaca `drawerAgenda()` sebagai
  event — lalu mencari `clientId`, `payments`, dan job divisi yang tidak pernah
  ada di reservasi VIP. Yang tampil bukan galat, melainkan panel setengah
  kosong yang terbaca sebagai data rusak.
- **Yang dibatalkan disaring lewat `batalAt`**, penanda yang sama yang dipakai
  `vip_hari()` di marketing-mysql. Menyaringnya dengan kata pada `status` adalah
  kesalahan yang sudah pernah dibayar di modul ini — lihat `resBatal()`.
- **`agPasti()` TIDAK diberi daftar putih status untuk VIP.** Yang di sini bukan
  tahapan jualan melainkan booking yang sudah ada; daftar putih yang
  ditebak-tebak akan MENYEMBUNYIKAN seluruh reservasi begitu ada satu status
  baru di Marketing, dan daftar kosong terbaca sebagai tidak ada acara.
- **`labelSumber()` menggantikan ternary dua cabang** yang tersebar di 6 layar
  (`a.sumber==='mkt' ? 'Marketing' : 'Event'`). Bentuk itu diam-diam salah begitu
  ada sumber KETIGA: reservasi VIP dilabeli "Event" di kalender, di judul panel,
  dan di laci — tanpa satu pun galat. Penyaring kalendernya juga: ternary
  `a.sumber==='mkt'?fCal.mkt:fCal.evt` menjatuhkan setiap sumber yang bukan mkt
  ke penyaring Event, jadi mematikan centang Event ikut menyembunyikan VIP.
- **Pax VIP DIHITUNG tapi TIDAK dijumlahkan ke Total pax**, dan itu dikatakan di
  kartunya. Reservasi VIP juga mengunci meja di database Reservasi, jadi tamunya
  bisa terhitung dua kali. Angka yang mungkin berganda lebih buruk daripada
  angka yang jelas-jelas dipisah: yang pertama tidak akan dipertanyakan siapa pun.

#### PHP diperiksa dengan pengurai, bukan dengan harapan

Tidak ada `php` di mesin pengembangan, dan **satu parse error di
`lib_marketing_mysql.php` mematikan SELURUH endpoint modul Marketing**. Ujinya
karena itu memakai **php-parser** (pengurai PHP murni-JS) untuk memeriksa
sintaksnya sungguhan, lalu memeriksa **logikanya sebagai kontrak** atas
sumbernya — pola yang sama dengan `uji-simpan-basi.js`. Keduanya bukan
pengganti menjalankan PHP-nya, dan itu dikatakan di kepala berkas ujinya.

```bash
npm i php-parser        # sekali; atau setel PHP_PARSER_PATH
node tools/uji-hilang-marketing.js   # 118 pemeriksaan, jsdom + php-parser
```

**Yang dijaga adalah INVARIANNYA, bukan nama `designreqs`/`vip`**: setiap
koleksi di `MKT_COLS` wajib punya pasangan di `collections()` ATAU di
`kol_settings()`. Itu yang akan menangkap koleksi BERIKUTNYA yang ditambahkan
ke klien tanpa pasangan di server — bukan daftar nama yang harus diingat orang.
Empat belas mutasi dicoba, keempat belasnya tertangkap.

> **Dua asersi sempat lolos mutasi**, dan keduanya kesalahan yang khas:
> `/function upsert_collection[\s\S]*?cap_tulis\(/` tetap cocok walau
> `cap_tulis` dicabut dari fungsi itu — pencariannya berlanjut sampai
> menemukannya di `upsert_settings_collection` di bawahnya; dan
> `'paxMkt+paxEvt'` adalah AWALAN dari `'paxMkt+paxEvt+paxVip'`, jadi
> asersinya cocok justru pada versi yang menjumlahkannya. Badan fungsi harus
> DIPOTONG dulu, dan yang diperiksa harus KETIADAAN-nya.

**Data yang sudah hilang tidak bisa dikembalikan dari sini** — gumpalan yang
ditimpa tidak menyimpan versi sebelumnya. Yang masih ada: tabel `activities`
(append-only, `INSERT IGNORE`, 5000 baris terakhir) merekam siapa membuat apa
dan kapan, jadi ia bisa dipakai menyusun ulang daftar yang hilang — bukan
isinya, tapi jejaknya.

#### Cap server WAJIB dikembalikan ke klien — kalau tidak, bentrok palsu

**Babak kedua, beberapa jam kemudian di produksi.** Sesudah cap ditentukan jam
server, modal **"Sebagian Perubahan Tidak Tersimpan"** muncul TERUS — menyebut
baris Request Design dan Reservasi VIP yang tidak seorang pun sedang menyentuh.

Dua penjaga yang membandingkan angka dari **dua jam yang berbeda**:

| | capnya dari |
|---|---|
| server menyimpan `updated_at` | jam SERVER (`cap_tulis`) |
| klien mencatat acuan `_serverVer` | `r.updatedAt` di salinan LAYARNYA = jam KLIEN |

Waktu selalu maju antara klien mencap dan server menulis, jadi cap server
hampir selalu lebih besar — dan **setiap suntingan KEDUA pada baris yang sama**
dilaporkan bentrok. Bukan karena ada yang menyalip.

Yang menentukan **bukan jam siapa yang dipakai**, melainkan bahwa kedua sisi
memakai **angka yang sama**. Karena itu `save_all()` sekarang membalas `versi` —
peta `<koleksi>:<id> -> cap` untuk baris yang capnya bergeser — dan klien
memasangnya lewat `terapkanVersiServer()` **sebelum** `refreshSnapshot()`.

- **Urutannya menentukan.** Dipasang sesudah, yang dicatat sebagai acuan tetap
  cap klien dan bentrok palsunya kembali utuh. Diuji sebagai mutasi tersendiri.
- **Hanya baris yang capnya BERGESER yang dikirim balik** (`$ua !== $uaKirim`).
  Kiriman utuh berisi ribuan baris `clients` tidak perlu memantulkan angka yang
  tidak berubah.
- **Kuncinya `<koleksi>:<id>`**, bentuk yang SAMA dengan `_eachRow()` di klien.
  Beda satu huruf tidak melempar apa pun — klien cuma tidak menemukan barisnya,
  dan bentrok palsunya kembali tanpa satu pun tanda.
- **Alarm bentrok SUNGGUHAN tidak ikut dilonggarkan**, dan itu diuji sebagai
  jaring tersendiri: mematikan alarmnya lebih buruk daripada bentrok palsu.

> **Pelajarannya bukan soal jam.** Perbaikan babak pertama memindahkan sumber
> cap ke server tanpa memeriksa **siapa lagi yang membaca angka itu** — dan
> pembacanya ada di berkas lain, di sisi lain jaringan. Penjaga bentrok itu
> kontrak DUA SISI; mengubah satu sisinya saja mengubah artinya, bukan
> memperbaikinya. Gejalanya pun bukan galat, melainkan modal yang muncul
> terus — dan modal yang selalu muncul berhenti dibaca orang, termasuk waktu
> suatu hari ia benar.

Ujinya menjalankan **DUA siklus simpan sungguhan** lewat `save()` milik modul,
dengan server tiruan yang jamnya sengaja dimajukan. **Satu siklus tidak cukup**:
bentroknya baru lahir di siklus kedua, dan uji yang berhenti di siklus pertama
akan hijau untuk kode yang rusak. Lima mutasi dicoba — termasuk mengembalikan
gejala produksinya persis — dan kelimanya tertangkap.


**Babak ketiga: satu jalur yang ditutup, dua yang terlewat.** Sesudah `versi`
dipasang, modalnya MASIH muncul terus di produksi. Sebabnya cap server cuma
dipasang di cabang SUKSES `save()`. Ada TIGA jalur yang menerima balasan
server, dan ketiganya wajib memasangnya:

| jalur | kapan berjalan |
|---|---|
| `save()` sukses bersih | penyimpanan biasa |
| `save()` yang ADA bentroknya | baris lain TETAP tersimpan — capnya wajib ikut dipasang |
| `kirimPemulihan()` | **tiap kali halaman dimuat** selama penanda "belum naik" masih ada |

Begitu terjadi SATU bentrok, cap klien dan cap server tidak pernah menyatu
lagi: penyimpanan berikutnya bentrok, penandanya tidak pernah dicabut, dan
muat ulang — yang justru disarankan modalnya — menjalankan `kirimPemulihan()`
yang mencatat cap KLIEN sebagai acuan. **Perbaikannya sendiri yang memutar
ulang masalahnya.**

- `terapkanVersiServer()` membetulkan `_serverVer` LANGSUNG, tidak menunggu
  `refreshSnapshot()` — dua dari tiga jalur itu memang tidak boleh memanggilnya.
- **Jalur bentrok SENGAJA tidak memanggil `refreshSnapshot()`**: ia akan
  menghapus tanda "berubah" pada baris yang barusan DITOLAK, dan perubahan itu
  lalu tidak pernah dicoba kirim lagi. Diuji sebagai mutasi tersendiri.
- **Baris yang benar-benar disalip TETAP dilaporkan sampai dimuat ulang** —
  itu yang diinstruksikan modalnya. Yang dijaga: bentroknya tidak MELEBAR ke
  baris lain, dan input baru tetap tersimpan.

> Pelajarannya sama dengan babak kedua, dan itu yang membuatnya layak dicatat
> dua kali: perbaikan pertama menutup jalur yang paling terlihat lalu berhenti
> mencari. Pertanyaan yang tidak diajukan: **siapa LAGI yang membaca angka
> ini?** Jawabannya tiga tempat, dan dua di antaranya justru yang berjalan
> paling sering.



#### Babak ketujuh: yang menyalip ternyata BROWSER-NYA SENDIRI (11 Sep 2026)

Keluhan user: modal *Sebagian Perubahan Tidak Tersimpan* muncul untuk event
yang ia input sendiri — *"kenapa bisa terjadi overlapping yg diinput sendiri?"*
— dan datanya nyangkut lagi. Di layar yang sama muncul toast *"4 data yang
belum sempat naik sudah masuk ke database"*.

**TIDAK ADA REKAN KERJA YANG MENYALIP.** Yang menyalip otomasi di modul ini
sendiri:

```
boot()  ->  autoCloseEvents()  ->  save()
```

`autoCloseEvents()` mengubah status event yang tanggalnya sudah lewat jadi
*Event Done* dan **menyimpannya**. Ia berjalan **di SETIAP tab, setiap kali
halaman dibuka**. Jadi dua tab yang dibuka berdekatan sama-sama membaca versi
lama, tab pertama menulis, dan tab kedua ditolak sebagai *"orang lain menyimpan
duluan"* — untuk baris yang isinya **persis sama** dengan yang barusan ditulis
tab pertama.

**DIREPRODUKSI, bukan disimpulkan.** Dua jsdom menghadap satu server tiruan
yang setia pada aturan `lib_marketing_mysql.php`:

```
GET  tab A  -> versi V0, status Confirmed
GET  tab B  -> versi V0, status Confirmed
POST tab A  -> diterima, status "Event Done", versi naik
POST tab B  -> BENTROK 1        <- basisnya masih V0
```

Dan bentroknya **berulang tiap percobaan kirim berikutnya** — itulah bentuk
"nyangkut lagi": basis tab B tidak pernah menyusul.

**PERBAIKANNYA DI SERVER, satu aturan: TULISAN YANG TIDAK MENGUBAH APA PUN
BUKAN BENTROK.** Sebelum sebuah baris dilaporkan bentrok, isinya dibandingkan
dengan yang tersimpan (`sidik_baris()`); kalau sama, kiriman itu diterima
diam-diam dan **versi server dipulangkan lewat `versi`** supaya acuan bentrok
di klien menyusul.

- **KUNCINYA DIURUTKAN BERTINGKAT** (`urut_dalam()`). Urutan kunci JSON yang
  tersimpan sudah pernah melewati `json_decode`/`json_encode` PHP, sementara
  kiriman menuruti urutan properti di JavaScript. Dibandingkan apa adanya, dua
  baris yang identik terbaca berbeda — dan penjaganya berhenti menolong persis
  pada kasus yang ia diadakan untuk menolongnya.
- **Daftar berindeks angka TIDAK diurutkan** — urutan isinya berarti (daftar
  pembayaran, daftar tamu).
- **`updatedAt` & `baseUpdatedAt` dibuang** sebelum dibandingkan: yang pertama
  memang selalu berbeda (itu inti persoalannya), yang kedua tidak pernah
  tersimpan.
- **Dipasang di KEDUA penjaga** — `upsert_collection()` dan
  `upsert_settings_collection()`. Yang dilonggarkan cuma di salah satunya
  membuat `designreqs` & `vip` tetap melaporkan bentrok palsu sementara
  `events` berhenti, dan bedanya mustahil dijelaskan.
- **Pemeriksaannya MENDAHULUI pendorongan `$bentrok`.** Ditaruh sesudahnya,
  barisnya tetap dilaporkan dan seluruh perbaikan ini tidak mengubah apa pun
  di layar.
- **Bentrok SUNGGUHAN tidak ikut dilonggarkan**, dan itu dijaga asersi
  tersendiri: melonggarkan alarmnya lebih berbahaya daripada bentrok palsu.

**`autoCloseEvents()` SENGAJA TIDAK DICABUT.** Ia memang harus menutup event
yang sudah lewat, dan mencabutnya berarti menukar satu masalah dengan masalah
lain. Yang salah bukan otomasinya, melainkan penjaga bentrok yang
memperlakukan kesimpulan yang sama dari dua klien sebagai perebutan.

> **PELAJARANNYA: "siapa yang menyalip" tidak selalu manusia.** Enam babak
> sebelumnya seluruhnya mengejar cap waktu, jam perangkat, dan jalur pemulihan
> — dan tidak satu pun bertanya **apa yang sebenarnya berubah** pada baris yang
> dilaporkan bentrok. Jawabannya: tidak ada. Kalau sebuah penjaga melaporkan
> perebutan, periksa dulu apakah kedua pihak benar-benar menulis hal yang
> berbeda.

```bash
npm i php-parser        # sekali; atau setel PHP_PARSER_PATH
node tools/uji-hilang-marketing.js   # 142 pemeriksaan (dari 130)
```

Ujinya dua lapis, dan keduanya perlu: **reproduksi dua tab** (dua jsdom, satu
server tiruan — yang dijaga JUMLAH BENTROK dari server, bukan ada-tidaknya
modal di layar, karena teks modal itu juga hidup sebagai string di dalam
`<script>` halaman dan asersi atas `body.textContent` cocok dengan KODENYA)
dan **kontrak atas sumber PHP** (tiruan yang bentuknya beda dari yang ditiru
tidak menguji apa pun). Tiga mutasi dicoba — mencabut jalurnya di PHP, tidak
memulangkan versinya, dan membuat tiruannya berhenti memaafkan — ketiganya
tertangkap.

#### Buffering simpan di modul Marketing (8 September 2026)

Permintaan user: *"pastikan setiap submit ada buffering untuk memastikan data
tersimpan di server."* Sebelum ini `save()` fire-and-forget — modal ditutup dan
toast sukses muncul **sebelum server menjawab apa pun**, jadi kru bisa langsung
pindah halaman atau menutup tab sambil mengira pekerjaannya sudah aman.

**DIPASANG DI `save()`, SATU tempat — bukan di 36 penangan submit.** Alasannya
bukan kemalasan: ada **101** titik `save()` di berkas itu, dan yang tidak lewat
penangan submit (pindah kolom pipeline, centang job, hapus baris) sama-sama
menulis ke server. Dipasang per tombol, yang terlewat justru yang paling sering
dipakai — dan tidak ada satu pun tanda bahwa ia terlewat.

| keadaan | yang tampil |
|---|---|
| mengirim | kartu terkunci **"Menyimpan ke server…"** + *jangan tutup halaman* |
| berhasil | **"Tersimpan di server"**, hilang sendiri ~1 detik |
| gagal | **"Belum tersimpan di server"** + tombol Coba lagi, **DITAHAN** |
| bentrok | tidak apa-apa — modal bentroknya sendiri yang menjelaskan |

- **Ditunda 250 ms sebelum tampil** (`ST_TUNDA`). Penyimpanan yang selesai dalam
  sekejap tidak boleh membuat layar berkedip tiap kali ada yang dicentang; yang
  lambat — yang justru perlu ditunggu — tetap tertangkap.
- **Keadaan BERHASIL hanya ditampilkan kalau overlaynya memang sempat
  terlihat.** Kalau tidak, penyimpanan cepat memunculkan kartu "tersimpan" yang
  berkedip tanpa ada yang sempat membacanya.
- **Kegagalan DITAHAN sampai ditutup sendiri.** Kegagalan yang hilang sendiri
  dalam dua detik sama saja tidak pernah diberitahukan — dan justru itulah
  keadaan yang membuat orang menutup tab sambil mengira pekerjaannya aman.
  Kalimatnya menyebut datanya **masih aman di perangkat** dan kirim ulang masih
  berjalan; tanpa itu orang akan mengetik ulang di atas data yang sebenarnya
  masih utuh.
- **Sinkronisasi roster Office memakai `save({diam:true})`.** Ia berjalan sendiri
  tiap modul dibuka; layar yang tiba-tiba terkunci "Menyimpan…" untuk sesuatu
  yang tidak ditekan siapa pun cuma membingungkan. Antrean `savePending`
  **mewarisi sifat ramai** (`_savePendingRamai`) — kalau tidak, satu simpan diam
  yang kebetulan mengantre di belakang akan menelan buffering milik tindakan
  kru.
- **`beforeunload` ikut menyebut `saveInFlight`**, bukan hanya `adaBelumNaik()`.
  Penanda itu ditulis `tandaiBelumNaik()` yang **menelan galatnya sendiri**, jadi
  di peramban yang localStorage-nya ditolak (mode penyamaran) penandanya tidak
  pernah terpasang — dan `saveInFlight` jadi satu-satunya yang menahan tab
  ditutup di tengah kiriman.

Ujinya menjaga **URUTAN**, bukan adanya elemen: server tiruannya digantung
supaya keadaan sedang-mengirim sempat diamati, dan diperiksa bahwa layarnya
**belum** mengaku tersimpan sebelum jawaban datang. Penangan `beforeunload`
DIBANGKITKAN sungguhan (`dispatchEvent` + `defaultPrevented`) — memeriksa
variabel `saveInFlight` saja tidak membuktikan tab benar-benar ditahan, dan
versi pertama uji ini memang meloloskan mutasinya karena itu.

Enam mutasi dicoba, keenamnya tertangkap — termasuk mengembalikan keadaan lama
(tanpa buffering sama sekali) dan mengaku tersimpan sebelum server menjawab.


**TIGA LAPIS, dan pemisahannya yang membuatnya tidak menyiksa** (permintaan
lanjutan user: *"ketika menyimpan ke server dibuat tidak bisa klik apa-apa
dulu, baru berhasil"*):

| lapis | kapan | yang terjadi |
|---|---|---|
| 1. blokir **sunyi** | milidetik pertama | klik mati, layar TIDAK berubah |
| 2. kartu terlihat | sesudah `ST_TUNDA` (250 ms) | hanya kalau simpannya lambat |
| 3. jalan keluar | sesudah `ST_BATAS` (20 dtk) | kalau server tidak menjawab sama sekali |

- **Lapis 1 dipasang LANGSUNG, bukan lewat `setTimeout`.** Diblokir hanya sesudah
  kartunya muncul, masih ada celah 250 ms tempat tombol Simpan bisa ditekan dua
  kali.
- **LAPIS 3 WAJIB ADA, dan ia yang paling gampang dilupakan.** `fetch` di `save()`
  **tidak punya batas waktu sendiri**. Tanpa jalan keluar, satu permintaan yang
  menggantung mengunci SELURUH aplikasi selamanya, dan satu-satunya jalan
  keluarnya menutup tab — yang justru membuang pekerjaan yang belum sempat naik.
  **Mengunci layar tanpa jalan keluar lebih berbahaya daripada tidak mengunci
  sama sekali.**
- **Keberhasilan WAJIB melepas layarnya lagi** (`_stTutupTimer`). Simpan yang
  BERHASIL tapi kartunya tidak pernah hilang mematikan seluruh aplikasi — dan
  mutasi itu sempat LOLOS karena ujinya cuma memeriksa teks kartunya, bukan
  menunggu sungguhan sampai lewat `ST_BERES`.
- **Keadaannya disimpan di variabel (`_stKeadaan`), bukan dibaca dari nama
  kelas.** `sunyi` dan `tampil` sama-sama memuat kata `on`, jadi memeriksa kelas
  membuat simpan cepat ikut memunculkan kartu "Tersimpan" yang berkedip.
- **Fokus dilepas (`blur()`) saat blokir mulai.** Lapisan itu menahan KLIK, bukan
  papan ketik: tombol yang barusan ditekan masih memegang fokus, jadi Enter
  akan menekannya lagi — kiriman kedua untuk satu tindakan.

Uji jsdom untuk lapis 1 **wajib memeriksa SEGERA sesudah `save()`**, tanpa
menunggu; yang langsung `await tunggu(400)` tidak akan pernah melihat celahnya.
Dan penyimpanan yang sengaja digantung WAJIB dibereskan (`saveInFlight=false`)
sebelum bagian uji berikutnya: kalau tidak, tiap `save()` sesudahnya cuma
mengantre dan pemeriksaan berikutnya menguji sisa layar sebelumnya — tiga
asersi sempat gagal karena itu, dan ketiganya cacat uji, bukan cacat produk.


#### Babak keempat: jalur PEMULIHAN membuang pekerjaan (8 Sep 2026)

Pertanyaan user: *"apakah kamu sudah pastikan halaman ini tidak pernah muncul
lagi?"* — dan jawabannya **belum**. `pulihkanBelumNaik()` masih membandingkan
dua jam yang berbeda, dan yang ini **membuang pekerjaan**, bukan sekadar
memunculkan modal:

```
tLok = cap di salinan lokal  -> jam KLIEN (stampChanges)
tSrv = cap di salinan server -> jam SERVER (cap_tulis)

if      (tLok > tSrv) selamatkan   // TIDAK PERNAH menyala
else if (tLok < tSrv) kalah        // SELALU -> yang belum naik DIBUANG
```

Waktu selalu maju antara klien mencap dan server menulis, jadi cabang
*selamatkan* mati total. Suntingan yang benar-benar belum terkirim jatuh ke
*kalah* — dilaporkan di modal lalu **hilang**. Itulah bentuk keluhan *"input
Database Client tidak tersimpan"*, dan itu pula yang memenuhi modal dengan
sembilan nama yang tidak seorang pun sentuh.

Sekarang penanda `belum naik` ikut menyimpan **BASIS tiap baris yang kotor**
(`KEY_PENDING_BASE` = `{"<koleksi>:<id>": versiServerYangKitaPegang}`), dan
pemulihan membandingkan **basis vs versi server sekarang** — dua-duanya angka
server. Pertanyaannya jadi benar: *apakah ada yang menyimpan baris ini sesudah
aku memuatnya?*

- **Baris yang server BELUM punya selalu diselamatkan**, ada catatan basis atau
  tidak: ia tidak mungkin milik orang lain. Ini juga jaring untuk penanda lama
  yang dipasang versi sebelumnya.
- **Baris yang TIDAK tercatat kotor dibiarkan apa adanya.** Menebak di sini
  berarti menimpa kerja orang lain atau membuang kerja sendiri, dua-duanya
  tanpa satu pun tanda — dan itulah yang memenuhi modal dengan nama asing.
- **Catatan basis WAJIB ikut dibersihkan** `tandaiSudahNaik()`. Kalau tertinggal,
  muat ulang berikutnya "memulihkan" baris yang sudah lama tersimpan dan
  menimpanya dengan salinan lama.

> **Uji yang memanggil `pulihkanBelumNaik()` WAJIB menyetel `S = srv` lebih
> dulu**, seperti `apiLoad()`. Versi pertama uji ini memanggilnya sementara `S`
> masih memegang salinan lokal — jadi asersinya benar apa pun keputusan
> fungsinya, dan mutasi yang mengembalikan bug-nya LOLOS. Asersi hampa lebih
> berbahaya daripada tidak ada asersi.

Sembilan mutasi dicoba di babak ini, kesembilannya tertangkap.


#### Menyimpan yang lama sekali: yang mahal bukan yang disangka (8 Sep 2026)

Keluhan user: *"Menyimpan ke server ini juga lama banget untuk eksekusi."*

**Dugaan pertama salah, dan pengukuran yang membetulkannya.** Disangka biaya
terbesar ada di `JSON.parse(JSON.stringify(S))` — kloning seluruh database
hanya untuk menempelkan satu field. Diukur pada **20.000 clients + 2.000
events, satu baris berubah**:

| | biaya |
|---|---|
| kloning penuh state | **34 ms** |
| SATU sapuan `_dirty` (JSON.stringify per baris lewat `_sig()`) | **51 ms** |

Jadi yang mahal **sapuannya**, bukan kloningnya — dan jalur simpan menyapunya
**tiga kali**: `stampChanges()`, `petaBasisKotor()`, lalu `buildPayload()`,
ditambah `refreshSnapshot()` penuh sesudah server menjawab.

```
cara LAMA  = sapu*3 + kloning   ~186 ms
cara BARU  = sapu*1 + sisa       ~50 ms
```

- **`stampChanges()` memulangkan `{basis, kotor}`** — peta basis untuk penanda
  "belum naik" DAN himpunan kunci baris kotor. Keduanya dipungut dari sapuan
  yang memang sudah jalan.
- **`buildPayload(kotor)` menerima himpunan itu**, jadi tidak menghitung ulang.
  Tanpa argumen ia menghitung sendiri — `kirimPemulihan()` memanggilnya begitu,
  dan di sana memang sekali saja.
- **`refreshSnapshotSebagian(kotor)` di jalur simpan yang berhasil.** Baris yang
  tidak ikut berubah tanda tangannya memang tetap sama — `_sig()` membuang
  `updatedAt`, jadi cap baru dari server pun tidak menggesernya. Pemuatan tetap
  memakai `refreshSnapshot()` penuh: di sana seluruh isinya memang baru.
- **Salinan payload DANGKAL**, dan baris kotor diganti objek BARU
  (`Object.assign`), bukan disunting di tempat. Kalau ini disederhanakan jadi
  menyunting langsung, `baseUpdatedAt` bocor ke `S` dan penyimpanan berikutnya
  mengirim base yang basi — bentrok palsu lagi. Diuji sebagai mutasi sendiri.

**Di SERVER, baris yang tidak berubah tidak lagi ditulis ulang.** Aplikasi
mengirim state utuh, jadi kiriman berisi SELURUH baris — puluhan ribu clients
untuk satu event yang disunting, dan sebelumnya tiap baris tetap melewati satu
`execute()` di dalam satu transaksi. Syaratnya dua-duanya: klien tidak
menandainya berubah (tanpa `baseUpdatedAt`) DAN capnya sama persis dengan yang
tersimpan; baris yang isinya disunting selalu dicap ulang `stampChanges()`, jadi
isi berbeda dengan cap sama tidak bisa terjadi.

> **`$ids[] = $id` TETAP dijalankan lebih dulu.** Itu yang menentukan baris tidak
> ikut terhapus `hapus_yang_hilang()`. Melewatkannya bersama `continue` berarti
> MENGOSONGKAN tabel — diuji sebagai asersi urutan tersendiri.

**Modal bentrok sekarang menyebut sebab tersering dan menunjukkan angkanya.**
"Orang lain sudah menyimpan" itu benar tapi tidak menolong: yang membacanya
bertanya *siapa? kapan?* tanpa satu pun jalan mencarinya. Sebab tersering
justru **modul yang sama terbuka di lebih dari satu tab** pada perangkat yang
sama. Jam versi klien vs versi server ikut ditulis — tanpa angka, bentrok
sungguhan dan bentrok palsu terlihat sama persis, dan sepanjang hari itu modal
yang sama muncul untuk keduanya.

Ujinya menjaga **JUMLAH SAPUAN, bukan milidetik** — waktu berbeda di tiap mesin
dan uji yang mematok milidetik akan merah di laptop yang sibuk. `_sig()`
dibungkus lalu dihitung berapa kali ia dipanggil per baris.

Lima mutasi dicoba di babak ini, kelimanya tertangkap.


#### CAP SERVER DICABUT — dan kenapa itu keputusan yang benar (8 Sep 2026)

**Baca blok ini SEBELUM memindahkan sumber cap ke server lagi.**

Cap urutan sempat dipindah dari jam KLIEN ke jam SERVER (`cap_tulis`) untuk
menutup satu bahaya nyata: `_versi` adalah cap tertinggi di seluruh data dan
penghapusan dibatasi `updated_at <= _sejak`, jadi satu perangkat berjam CEPAT
menaikkan `_versi` melampaui waktu sebenarnya — dan sejak itu baris yang dibuat
perangkat berjam normal lahir di bawah `_sejak` orang lain, sah dihapus.

**Dicabut hari itu juga, atas keputusan user.** Dua alasannya:

1. **Bahaya itu tidak pernah dibuktikan.** Ia dugaan untuk satu keluhan (event
   Oktober yang hilang) yang tidak pernah dicocokkan dengan isi database.
   Menukar penyakit yang MUNGKIN dengan penyakit yang PASTI bukan pertukaran
   yang baik.
2. **Akibatnya pasti dan langsung terasa.** Klien mencatat acuan penjaga
   bentroknya dari cap yang ia pegang; begitu server mencapnya dengan jam LAIN,
   kedua sisi membandingkan angka dari dua jam yang berbeda. Waktu selalu maju
   antara klien mencap dan server menulis, jadi cap server selalu lebih besar —
   dan modal *Sebagian Perubahan Tidak Tersimpan* muncul untuk baris yang tidak
   seorang pun sentuh.

**EMPAT babak perbaikan berturut-turut mengejar akibat dari satu keputusan
itu**, dan yang keempat bahkan MEMBUANG suntingan yang belum sempat naik. Tiap
babak menutup jalur yang paling terlihat lalu berhenti mencari:

| babak | yang ditutup | yang terlewat |
|---|---|---|
| 1 | cabang sukses `save()` | jalur bentrok & `kirimPemulihan()` |
| 2 | ketiga jalur simpan | `pulihkanBelumNaik()` |
| 3 | buffering & penguncian layar | — |
| 4 | `pulihkanBelumNaik()` | (cap servernya sendiri) |

> **PELAJARANNYA: cap urutan itu KONTRAK DUA SISI.** Mengganti sumbernya di
> server saja tidak memperbaikinya — ia mengubah ARTINYA, sementara sisi klien
> tetap membaca dengan aturan lama. Pertanyaan yang tidak diajukan sejak awal:
> *siapa LAGI yang membaca angka ini?* Jawabannya empat tempat.

Kalau suatu hari jam perangkat benar-benar TERBUKTI jadi penyebab, yang perlu
diganti **bukan sumber capnya melainkan bentuknya**: nomor urut milik server
yang tidak ada hubungannya dengan jam mana pun, dipulangkan ke klien lewat
`versi`, dan dipakai kedua sisi. Setengahnya saja lebih buruk daripada tidak
sama sekali.

**Yang TETAP dipertahankan dari babak-babak itu**, karena benar tanpa syarat
dan tidak bergantung pada sumber cap:

- `$simpan['updatedAt'] = $ua` — cap yang dipakai ikut tersimpan di `data`;
- balasan `versi` + `terapkanVersiServer()` di KETIGA jalur — cap masih bisa
  bergeser lewat **bump** (`$verServer + 1`) kalau cap klien kebetulan tidak
  lebih besar daripada yang tersimpan, dan begitu bergeser klien wajib tahu;
- `KEY_PENDING_BASE` di `pulihkanBelumNaik()` — membandingkan BASIS yang kita
  pegang dengan versi server sekarang tetap lebih benar daripada membandingkan
  dua cap, apa pun jam yang mencapnya;
- guard `kol_settings` untuk `designreqs`/`vip`, buffering simpan, dan seluruh
  perbaikan biaya menyimpan.

```bash
node tools/uji-hilang-marketing.js   # 118 pemeriksaan
```

Tiga mutasi dicoba untuk pencabutan ini — termasuk mengembalikan cap server —
dan ketiganya tertangkap.


#### "Muat ulang" yang tidak menyembuhkan apa pun (8 Sep 2026)

Gejala terakhir, dan yang paling membingungkan user: modal bentrok muncul lagi
dan lagi **di dev**, bahkan sesudah cap server dicabut — dengan nama-nama yang
tidak seorang pun sedang menyentuh.

**Angka yang dipajang di modalnya sendiri yang memecahkannya.** Diambil dari
`getAll` dev, keempat baris itu bercap **BULAN AGUSTUS**:

```
123123132 (designreqs)  server = 22 Agu 15:49
ssss      (vip)         server = 13 Agu 12:27
shsfjosd  (vip)         server = 14 Agu 11:20
sdssssss  (vip)         server = 21 Agu 19:06
```

Artinya tab itu memegang salinan **basi** dari baris Agustus, menandainya
"belum terkirim", dan mengirimnya terus. Basisnya lebih tua daripada versi
server, jadi kirimannya **tidak akan pernah bisa menang** — berapa kali pun
diulang.

**Dan "Muat ulang" tidak menyembuhkannya.** Baris yang KALAH tetap tinggal di
cache lokal berikut penanda "belum naik"; sesudah halaman dimuat,
`pulihkanBelumNaik()` mengembalikannya ke `S`, penyimpanan berikutnya
mengirimnya lagi, server menolaknya lagi. Tombolnya memutar ulang masalahnya.

> **Tombol yang menjanjikan penyembuhan tapi memutar ulang masalahnya adalah
> yang paling merusak kepercayaan.** Yang menekannya berkali-kali akhirnya
> berhenti membaca isinya — termasuk waktu suatu hari isinya benar.

Sekarang `reloadFromServer(bentrok)` memanggil `lupakanBentrok()` lebih dulu:
kunci baris yang kalah dibuang dari catatan basis, jadi sesudah muat ulang
versi SERVER yang dipakai untuk baris itu — persis yang dijanjikan kalimat di
modalnya. Baris lain yang masih menunggu kirim **tidak** ikut dibuang: yang
belum pernah sampai ke server tetap harus diselamatkan.

- **Melupakan WAJIB sebelum `location.reload()`** — sesudahnya, kodenya tidak
  pernah sampai dijalankan. Diuji sebagai mutasi tersendiri.
- Kalau tidak ada sisa yang menunggu, penandanya ikut dicabut; kalau tidak,
  tiap muat ulang menjalankan pemulihan untuk daftar yang sudah kosong.

**Angka versi di modal WAJIB memuat TANGGAL, bukan cuma jam.** Versi pertama
menulis jam saja, dan itu menyesatkan: baris 13 Agustus tampil `12.27.59` di
sebelah basis 12 Agustus `12.39.21` — terbaca seolah versi server lebih TUA
daripada versi kita, padahal syarat bentroknya justru sebaliknya. Angka yang
dipajang untuk MENJELASKAN sesuatu tidak boleh bisa dibaca terbalik; ia
menyesatkan diagnosis selama satu putaran penuh.

> **Modalnya sendiri yang akhirnya jadi alat diagnosisnya.** Sebelum angka itu
> ada, tiga babak dihabiskan menebak. Kalau sebuah pesan galat dipakai orang
> untuk melapor, isinya harus cukup untuk dilacak.

Tiga hal yang ikut ketahuan saat menulis ujinya, dan ketiganya cacat UJI:

- Uji memanggil `lupakanBentrok()` langsung, jadi tidak pernah membuktikan
  `reloadFromServer()` memakainya — mutasi yang mencabut pemanggilannya LOLOS.
- Stub `location.reload` gagal dipasang di jsdom, dan penanda kegagalannya
  (`-1`) lolos syarat `!== 0` — asersi hampa lagi. Sekarang keadaan yang tidak
  bisa diuji **MELEWAT dengan jelas**, dan kontraknya dijaga di sumber.
- Pola regex yang ditulis lewat heredoc + string biasa kehilangan
  backslash-nya dua kali, sehingga yang mendarat di berkas uji adalah pola
  TANPA escape — `(` dan `{` terbaca sebagai grup dan kuantifier, dan polanya
  tidak pernah cocok. Tulis pola regex dengan `String.raw`.

```bash
node tools/uji-hilang-marketing.js   # 130 pemeriksaan (1 melewat: stub reload)
```

**Dan yang kalah harus dilupakan SENDIRI, tanpa menunggu tombol ditekan.**
Penanda `belum naik` hidup di localStorage yang **dibagi antar tab**: satu tab
yang basi menulis ulang penandanya, lalu tab lain memungutnya saat dimuat.
Kalau pembersihannya bergantung pada seseorang menekan tombol, tab yang tidak
pernah dilihat orang akan terus meracuninya — dan modalnya muncul lagi di tab
yang justru sudah bersih. `pulihkanBelumNaik()` karena itu memanggil
`lupakanBentrok(kalah)` **sebelum** `kirimPemulihan()` berangkat: kiriman yang
GAGAL pun tidak lagi meninggalkan mereka di catatan.

- **Entri `kalah` WAJIB membawa `id`.** Daftar buatan lokal itu dulu cuma
  membawa `{koleksi, nama}`, dan `lupakanBentrok()` melewatinya diam-diam
  (`if(b && b.koleksi && b.id)`). Balasan server memang membawa `id`, jadi
  jalur tombol tetap bekerja — bedanya tidak menimbulkan galat apa pun, dan
  hanya ketahuan karena ujinya memaksa keadaan yang menuntutnya.
- **Ujinya WAJIB punya baris yang MASIH MENUNGGU di samping yang kalah**, dan
  `kirimPemulihan()` yang GAGAL. Tanpa keduanya `dipulihkan` kosong,
  `tandaiSudahNaik()` membersihkan seluruh catatan, dan asersinya hijau walau
  `lupakanBentrok()` dicabut — versi pertama uji ini memang meloloskannya.

Tujuh mutasi dicoba untuk babak ini, ketujuhnya tertangkap.

#### Babak keenam: `baseUpdatedAt` yang BOCOR ke data tersimpan (8 Sep 2026)

Modal masih muncul TIAP SIMPAN di dev — untuk baris Reservasi VIP & Request
Design bercap Agustus yang tidak seorang pun sentuh. Bukan cache lokal seperti
dugaan pertama: **`getAll` dev menunjukkan 202 baris menyimpan `baseUpdatedAt`
DI DALAM barisnya sendiri** (`vip`, `designreqs`, `activities`) — warisan kode
lama yang menulis koleksi settings sebagai gumpalan JSON mentah sebelum
`unset($simpan['baseUpdatedAt'])` ada di jalur itu.

`baseUpdatedAt` metadata kiriman: `buildPayload()` menambahkannya HANYA untuk
baris yang diedit, `_sig()` membuangnya sebelum membandingkan. Begitu ia bocor
ke `data` tersimpan → masuk `S` tiap muat → dikirim untuk baris yang tak
disentuh → server (yang percaya `array_key_exists('baseUpdatedAt',$r)` = "baris
ini diedit klien") membandingkan cap Agustus vs `updated_at` yang lebih baru →
**bentrok, tiap simpan, tak bisa disembuhkan muat ulang.**

`normalizeState()` sekarang membuang `baseUpdatedAt` dari tiap baris tiap
MKT_COLS — satu tempat yang dilewati SEMUA jalur muat (getAll, cache
localStorage, `pulihkanBelumNaik`). Data yang terlanjur bocor di server jadi
inert karena klien berhenti memantulkannya. Baris yang BENAR-BENAR diedit tetap
membawanya (metadata sah). Diuji `uji-hilang-marketing.js` (pemindai sumber).

> **Endpoint `saveAll` TIDAK bisa menghapus baris TERAKHIR sebuah koleksi**
> (`kiriman kosong tidak pernah mengosongkan daftar`). Baris uji sampah di dev
> dibereskan lewat UI (hapus / `batalAt`) atau phpMyAdmin, bukan lewat API.


#### Simpan otomatis TETAP, tampilannya yang DICABUT (9 Sep 2026)

Permintaan user: *"buat sistem modul marketing jangan auto save, karena
jadinya muncul popup menyimpan ke server."* Yang dikerjakan **bukan** mencabut
simpan otomatisnya — itu ditawarkan dan **user memilih yang diam** — melainkan
mencabut seluruh tampilan keberhasilannya.

**Kenapa auto-save tidak ikut dicabut.** Tanpa itu data cuma naik saat ada yang
menekan tombol, dan tab yang ditutup lebih dulu kehilangan pekerjaannya **tanpa
satu pun tanda** — persis bentuk kehilangan yang enam babak sebelumnya (blok-blok
di atas) dipakai untuk menutupnya.

**Kenapa lapisannya salah sejak awal.** Permintaan 8 September 2026 berbunyi
*"pastikan setiap submit ada buffering"*, dan itu dipasang di `save()` — satu
tempat, karena ada **101 titik `save()`**. Tapi sebagian besar titik itu **bukan
submit**: centang job, geser kolom pipeline, hapus baris. Jadi yang sampai ke
layar bukan satu konfirmasi per formulir melainkan **kuncian per klik**, dan
kartu yang muncul di tiap tindakan berhenti dibaca orang — termasuk waktu suatu
hari isinya benar.

| | sebelum | sesudah |
|---|---|---|
| simpan berhasil | blokir klik + kartu "Menyimpan ke server…" + kartu "Tersimpan" | **tidak ada apa pun** |
| simpan gagal | kartu di tengah layar, mengunci | panel pojok, **tidak mengunci** |
| yang menandai keberhasilan | kartu | titik status di header (`setSyncBadge`) |

Yang DICABUT, dan **jangan dikembalikan tanpa diminta**: `ST_TUNDA`, `ST_BERES`,
`_stTimer`, `_stTutupTimer`, kelas `.sunyi`, kelas `.beres`, dan `blur()` di
`tungguSimpanMulai()`. Melepas fokus dulu benar karena ada lapisan blokir yang
menahan klik tapi bukan papan ketik; tanpa lapisan itu ia cuma membuang tempat
kursor orang yang sedang mengetik, **di tiap centang**.

Yang TETAP, dan ketiganya wajib:

- **Panel kegagalan** — satu-satunya keadaan yang menuntut tindakan. Ia
  `pointer-events:none` di wadahnya dan `auto` di kartunya: yang gagal harus
  terlihat **tanpa menghentikan pekerjaan**, karena datanya justru masih perlu
  diselamatkan. Kiri bawah, karena `.toast-wrap` sudah memakai kanan bawah.
- **`ST_BATAS` (20 dtk)** — `fetch` di `save()` tidak punya batas waktu sendiri,
  jadi server yang diam selamanya tidak memanggil `.then` maupun `.catch`.
  Sejak kartu sukses dicabut, **tidak ada lagi ketiadaan kartu yang bisa dibaca
  sebagai gejala**, jadi timer inilah satu-satunya suaranya. Ujinya memeriksanya
  **di sumber**: asersi runtimenya memanggil `tungguSimpanSelesai(gagal,true)`
  langsung, jadi ia tetap hijau walau timernya dicabut.
- **`beforeunload`** — sekarang **satu-satunya** yang menahan tab ditutup di
  tengah kiriman. Dulu lapisan blokir ikut menahannya secara tidak langsung.

**Yang ikut kembali sebagai risiko, dan itu memang keadaan sebelum 8 September:**
tombol submit bisa ditekan dua kali dalam satu detik. `save()` sendiri aman
(`saveInFlight` mengantre), tapi penangan yang membuat baris bisa membuat dua.
Kalau itu jadi keluhan, yang benar mematikan **tombolnya** di penangan itu —
bukan mengunci seluruh layar lagi.

```bash
node tools/uji-hilang-marketing.js   # 126 pemeriksaan (1 melewat: stub reload)
```

Ujinya memeriksa keadaan diam **dua kali**: segera sesudah `save()` dan sekali
lagi sesudah server menjawab. Yang cuma melihat salah satunya akan hijau untuk
kode yang memblokir sekejap lalu melepasnya — dan celah itu persis yang
dikeluhkan. Delapan mutasi dicoba, kedelapannya tertangkap.

### Radar: Reservasi VIP punya cabangnya sendiri (9 September 2026)

Permintaan user: panel detail Reservasi VIP di Radar diisi **PIC**, **jumlah
orang**, dan **catatan** dari reservasinya di modul Marketing. Yang ditemukan
saat mengerjakannya: panel itu memang **kosong seluruhnya**, dan sebabnya dua
bug yang sama-sama gagal DIAM.

**1. `drawerAgenda()` cuma punya dua cabang** — `mkt` dan `else`. VIP jatuh ke
`else` milik modul Event dan dibaca sebagai event: `venue`, `category`,
`capacity`, `pic`, `co_pic`. Tidak satu pun ada di baris VIP, jadi keenam
kotaknya berbunyi `—` dan panelnya terbaca sebagai **data rusak**.

> Bahayanya SUDAH tertulis di komentar pembangun AGENDA sejak VIP lahir
> ("baris VIP yang menyamar sebagai event akan dibaca `drawerAgenda()` sebagai
> event"), dan penjaganya cuma dipasang di cabang `mkt`. Sumber KETIGA yang
> jatuh ke cabang terakhir adalah bentuk kesalahan yang sama persis dengan
> `labelSumber()` — dan kali ini komentarnya pun sudah ada, cuma tidak diikuti.

**2. `pax` VIP TIDAK PERNAH ADA.** Baris VIP menyimpan `paxMin`/`paxMax` (tamu
memberi perkiraan rentang), sementara Radar membaca `v.pax`. Jadi kartu
**Reservasi VIP** di Agenda selalu menulis **0 pax** walau ada tiga reservasi
seratus orang — angka nol yang kelihatan wajar, tanpa satu pun galat.

- **Yang dipakai BATAS ATAS** (`paxMax`, jatuh ke `paxMin`): angka ini dibaca
  untuk menyiapkan tempat dan orang, dan menyiapkan kekurangan lebih mahal
  daripada menyiapkan kelebihan. Karena ia perkiraan — bukan pax kontrak seperti
  event — kartunya **mengatakan "(perkiraan atas)"**.
- **Rentangnya ditulis SATU tempat** (`paxVipTeks`), dipakai kartu dan panel.
  Dua penulis akan menyimpang, dan yang menyimpang di sini jumlah orang yang
  disiapkan.
- **Catatan reservasi ditampilkan UTUH**, tidak dipotong: isinya permintaan tamu
  (dekorasi, alergi, susunan meja), dan potongan di tengah kalimat justru
  menyembunyikan bagian yang membuatnya ditulis. Beda dari deskripsi acara modul
  Event yang memang panjang dan dipotong 400 huruf.
- **Judul bagian catatan tidak digambar kalau kosong** — "Catatan: —" membuat
  orang mencari catatan yang memang tidak pernah ada.

```bash
node tools/uji-vip-radar.js   # 18 pemeriksaan, jsdom
```

**BERKAS UJI PERTAMA untuk modul Radar.** Sampai tanggal ini modul ini cuma
"hanya boot yang diuji" di `smoke-modul.js` — routernya tidak terbaca dari luar,
jadi tidak satu pun panel detailnya pernah dijalankan. Dua hal yang perlu
diingat saat menambah ujinya:

- **Seluruh skrip Radar terbungkus IIFE** dan yang ditempel ke `window` cuma
  `APP`. Jembatan `eval` disuntikkan KE DALAM IIFE saat uji jalan — pola yang
  sama dengan `uji-arsip-konten.js` dan `uji-vendor.js`.
- **`document.body.innerHTML` di jsdom IKUT MEMUAT ISI `<script>`**, dan skrip
  modul ini memang di dalam `<body>`. Asersi teks apa pun karena itu bisa cocok
  dengan KOMENTAR di kodenya sendiri: mutasi yang mencabut kalimat "perkiraan
  atas" dari layar **LOLOS**, karena kalimat itu masih tertulis di komentar yang
  menjelaskannya. Buang tag `<script>` dulu sebelum mencari. Bentuk baru dari
  jebakan yang sudah tercatat untuk `uji-tanpa-target.js`.

**Fixture VIP di `uji-hilang-marketing.js` ikut dibetulkan** — ia mengarang
field `pax` yang tidak pernah ada di produksi, jadi ia hijau untuk kode yang
membaca `v.pax` dan tidak pernah bisa melihat bahwa seluruh pax VIP terhitung
nol. **Tiruan yang bentuknya beda dari yang ditiru tidak menguji apa pun** —
pelajaran yang sudah dibayar di stub `hpp.php`, dan terulang di sini.

Delapan mutasi dicoba, kedelapannya tertangkap.

### Ordering: rekap konfirmasi Central Kitchen (9 September 2026)

Permintaan user: *"Minta dari CK dan Kirim ke CK, tolong buat confirmation
send, rekapan seperti kirim orderan form order belanja."* Form belanja sudah
punya rekapnya sejak lama (`pre-submit-modal`); dua form CK **langsung mengirim**
begitu tombolnya ditekan.

Bedanya bukan kenyamanan: satu MENAMBAH stok Central Kitchen dan satu menyuruh
dapur menyiapkan barang, dan **keduanya tidak punya tombol batal sesudah
terkirim** — salah ketik jumlah baru ketahuan saat barangnya datang.

| | sebelum | sesudah |
|---|---|---|
| Minta dari CK | `submitCKOrder()` → cek duplikat → kirim | → **rekap** → cek duplikat → kirim |
| Kirim ke CK | `submitKirimCK()` → catat mutasi | → **rekap** → catat mutasi |

- **SATU modal untuk dua form** (`ck-konfirmasi-modal`), bukan dua. Yang berbeda
  cuma judul, kata kerjanya, dan ada-tidaknya tanggal; dua modal yang isinya
  nyaris sama akan menyimpang begitu salah satunya diperbaiki.
- **Modal belanja TIDAK dipakai ulang**: di dalamnya ada pilihan batch
  (baru/gabung) yang tidak berarti apa-apa untuk CK, dan memakainya berarti
  menyembunyikan separuh isinya lewat `hidden` yang harus dijaga benar di dua
  jalur sekaligus.
- **Kata kerjanya DIBEDAKAN.** "Minta" dan "kirim" berlawanan arah; satu kalimat
  untuk keduanya membuat yang salah membuka tab tidak punya satu pun tanda.
  Jalur kirim menyebut **stok CK BERTAMBAH**.
- **Tanggal hanya di jalur MINTA.** Untuk kirim, tanggalnya hari ini dan tidak
  diketik siapa pun — kotak kosong cuma membuat orang mencari isian yang tidak
  pernah ada.
- **Catatan per baris IKUT di rekap.** Justru catatan yang paling sering salah
  tempat, dan tanpa rekap tidak ada satu pun layar yang memperlihatkannya
  sebelum terkirim.
- **Rekap dulu, baru pemeriksa duplikat** — urutan yang sama dengan form
  belanja. Dibalik, orang menjawab peringatan tentang pengajuan ORANG LAIN
  sebelum sempat melihat pengajuannya sendiri.
- **Rekap DITUTUP sebelum modal duplikat dibuka.** Dua modal penuh layar yang
  bertumpuk membuat dua tombol "Batal" berdiri berdekatan, dan yang menekan
  salah satunya tidak tahu mana yang berlaku.
- **Yang dikunci tombol DI MODAL**, bukan tombol di form: modal menutupi
  formnya, jadi tombol form tidak bisa ditekan dua kali — tapi tombol modal
  bisa, dan tiap tekan mengirim seluruh daftarnya lagi.
- **Nama barang di-escape** (`escHtmlCK`). Ia diketik orang; digambar lewat
  `innerHTML` tanpa escape, satu nama yang memuat `<` merusak seluruh daftar
  rekap — dan rekap yang rusak dibaca sebagai "barangnya tidak ikut".
- **`textContent`, bukan `innerText`.** Untuk teks polos `textContent` memang
  yang benar, dan `innerText` tidak ada di jsdom sama sekali: menyetelnya di
  sana cuma membuat properti JS biasa, jadi teksnya tidak pernah sampai ke DOM
  dan tidak satu pun uji bisa membacanya.

```bash
node tools/uji-konfirmasi-ck.js   # 34 pemeriksaan, jsdom
```

**Yang dijaga URUTANNYA, bukan adanya modal.** Rekap yang muncul SESUDAH
barangnya terkirim tidak menahan apa pun, dan itulah kegagalan yang paling
mungkin kalau alurnya "dirapikan" nanti — jadi tiap pemanggilan `fetch`
dihitung, dan diperiksa bahwa hitungannya masih **NOL** selagi rekapnya
terbuka. Empat hal yang memakan waktu kalau tidak diketahui lebih dulu:

- **Skrip CDN dibuang, skrip LOKAL disisipkan inline.** Membuang keduanya
  membuat `LaksForecast is not defined` melempar DI TENGAH blok skrip utama;
  fungsi tetap terbaca (deklarasi fungsi terangkat) sementara `let` di bawahnya
  masih di TDZ, jadi ujinya gagal dengan galat yang tidak ada hubungannya dengan
  yang diuji. Boot dianggap selesai kalau `let`-nya sudah keluar TDZ — bukan
  kalau fungsinya terbaca.
- **`tailwind` perlu distub**: blok inline halaman ini menyetel `tailwind.config`.
- **Kotak tanggal BUKAN `<input>` di markup** melainkan `<div data-kal>` yang
  diisi `pasangKalender()`; satuan barang juga `<select>` KOSONG yang diisi
  `onPilihBarangCK()` dari `packSatuan`. Disetel paksa lewat `.value`, keduanya
  jadi string kosong dan formnya ditolak sebelum sampai ke rekap.
- **`closeModal()` mencabut `modal-active` lewat `setTimeout` 300 ms.** Modal
  yang dibuka lagi sebelum jadwal itu jalan akan ditutup oleh jadwal LAMA — dan
  asersi "rekap ditutup" lalu hijau apa pun yang dilakukan kodenya.

> **Satu asersi sempat LOLOS mutasi**, dan sebabnya layak diingat: jalur SUKSES
> menutup modalnya sendiri lewat `kirimCKKeServer()`, jadi "rekap ditutup
> sesudah dikonfirmasi" benar walau `tutupKonfirmasiCK()` dicabut. Yang
> benar-benar menuntut penutupan adalah jalur **DUPLIKAT**, dan di situlah
> asersinya sekarang berdiri.

Sembilan mutasi dicoba, kesembilannya tertangkap.

### Kolom "Kontribusi hari itu" di Daftar Event (9 September 2026)

Permintaan user: kolom kontribusi omset di Daftar Event **modul Marketing dan
modul Event**, *"tanpa menampilkan total omset di hari itu"*. Penyebutnya
dipilih user sendiri lewat pertanyaan: **omset hari itu, seperti di Analytics**.

Namanya sama persis dengan kolom di halaman *Pengaruh Event* modul Analytics,
dan itu disengaja: tiga layar yang memajang "kontribusi" dengan penyebut
berbeda adalah pertanyaan yang pasti datang — dan sudah datang empat kali
berturut-turut sepanjang hari itu.

```
Kontribusi hari itu = (omset + tax + service + Open Bill) / omset venue hari itu
```

- **PENYEBUTNYA DARI SERVER**, field baru `omsetHari` di tiap hari yang
  dipulangkan `performaDivisi`. Dihitung `kp_peta_harian()` +
  `kp_tagihan_hari()`, **bukan** dijumlahkan sendiri di sana: tiga konvensi
  penjualan hidup berdampingan di Office (net / tagihan / netSales), dan
  salinan keempat rumusnya pasti menyimpang suatu hari — salahnya muncul
  sebagai **uang**, bukan sebagai galat. Petanya juga yang menjumlahkan hari
  yang punya lebih dari satu baris `daily`; dihitung dari satu baris saja, hari
  seperti itu memulangkan separuh omsetnya dan kontribusinya jadi dua kali
  lipat dari yang benar.
- **TIAP SEL MEMBAWA PENYEBUTNYA SENDIRI** (`dari omset hari itu` di bawah
  angkanya). Kepala kolom dibaca sekali, angkanya dibaca tiap baris — itu
  pelajaran dari empat putaran pertanyaan yang sama di modul Analytics, dan
  yang paling mahal untuk diulang.
- **PENYEBUTNYA BUKAN kolom Diakui di sebelahnya**, dan itu dikatakan di
  `card-sub` modul Event. Di sana Diakui cuma **separuh** nilai acara, jadi
  memakainya membuat persennya separuh — dan separuh tetap terlihat wajar.
- **Peta tanggal → omset dibangun dari payload MENTAH** (`PFO.data.days` /
  `PEV.data.days`), bukan dari `a.events`. Dibangun dari daftar acara, satu
  tanggal yang punya dua acara menjumlahkan omset harinya dua kali dan seluruh
  kontribusi di hari itu mengecil separuh.
- **Hari yang omsetnya BELUM diinput ditulis "belum ada omset", bukan 0%.**
  Nol membuat acaranya terbaca seolah tidak membawa apa-apa — angka yang tidak
  akan dipertanyakan siapa pun. Ini juga bentuk yang dipulangkan backend yang
  belum ter-deploy, jadi ia bukan keadaan yang langka.
- `colspan` keadaan kosong ikut naik satu di kedua modul. Yang tertinggal
  membuat baris "Belum ada event" melenceng satu kolom.

**Kalimat "N event · nilai total Rp… · diakui 50%, kasir tidak dipotong" di
modul Event DICABUT** (permintaan user di pesan yang sama). Keterangan Open
Bill yang dulu menumpang di ujungnya ditulis ulang berdiri sendiri — kalau
tidak, ia jadi anak kalimat tanpa induk. `const nilaiEv` yang tinggal dipakai
kalimat itu ikut dibuang; nilai yang tidak dipanggil siapa pun akan dipanggil
lagi suatu hari oleh yang mengira ia masih berarti sesuatu.

```bash
node tools/uji-performa-marketing-modul.js   # 58 pemeriksaan, jsdom
node tools/uji-performa-event-modul.js       # 83 pemeriksaan, jsdom
```

Tiga belas mutasi dicoba, dan **dua di antaranya lolos di putaran pertama** —
keduanya cacat yang khas di repo ini:

- **"hari tanpa omset ditulis 0%" LOLOS di modul Event**: seluruh hari di
  fixture-nya punya `omsetHari`, jadi cabang itu tidak pernah dijalankan sekali
  pun. Cabang yang tidak punya data untuk menjalankannya sama saja tidak
  diuji. Ditutup dengan `DATA_TANPA_OMSET` + opsi `tanpaOmsetHari` pada
  `buka()` — lewat jalur yang SAMA, bukan harness kedua yang bisa menyimpang
  dari yang sungguhan dipakai.
- **"pembilang jadi `ev.porsi`" LOLOS di modul Marketing, dan itu BUKAN cacat
  uji.** Di sana kolom Diakui memang omset+tax+service+Open Bill, jadi keduanya
  hari ini memulangkan angka yang sama persis — tidak ada satu angka pun di
  layar yang bisa membedakannya. Yang membuatnya tetap perlu dijaga: di modul
  Event `porsi` cuma separuh nilai acara, dan kedua halaman memakai rumus
  bernama sama. Dikunci lewat **asersi atas SUMBER**, pola yang sama dengan
  kontrak backend di bawah.

Ujinya juga menjaga **kontrak backend-nya**: `'omsetHari' =>` ada, dihitung
lewat `kp_tagihan_hari(`, dan petanya `kp_peta_harian()`. Fixture menyediakan
`omsetHari` sendiri, jadi tanpa asersi itu seluruh sisi PHP-nya lewat tanpa
disentuh — tiruan yang bentuknya beda dari yang ditiru tidak menguji apa pun.


### Tiga revisi: Bulanan, Mulai Dingin, Daftar Event (9 September 2026)

Tiga permintaan user dalam satu pesan. Yang ketiga menyentuh uang dan
keputusannya diambil user lewat pertanyaan; dua yang pertama kecil.

**1. Jadwal Bulanan selalu terbuka di tab "Semua"** (`divMasukHalaman`).
Lembar bulanan satu-satunya tampilan yang menjawab *"malam Sabtu ini siapa saja
yang masuk, di semua pos"*, dan mendarat di satu divisi berarti pertanyaan itu
baru terjawab sesudah satu klik yang jawabannya selalu sama.

- **DISETEL SAAT MASUK HALAMAN, bukan di `viewBulanan()`.** Di penggambar, tab
  divisi yang barusan ditekan dipulihkan ke Semua pada render berikutnya —
  render di modul ini TOTAL — dan tab yang menolak dipilih terbaca sebagai
  halaman rusak, bukan sebagai aturan.
- **TIGA pintu masuk, ketiganya wajib melewatinya**: `go()` (menekan menunya),
  `terapkanHash()` (menekan Back, atau hash yang diketik), dan `boot()`
  (membuka `#/bulanan` langsung dari alamat). Yang terlewat gagal DIAM.
- **Di `boot()` letaknya SESUDAH `DIV = kuasa[0]`.** Dipasang lebih dulu, baris
  itu menimpanya balik dan tab Semua tidak pernah terlihat.
- **`DIV` tetap dipakai bersama dengan Input Mingguan**, dan yang berubah cuma
  nilai AWALNYA saat lembar bulanan dibuka. Memberi lembar bulanan variabel
  sendiri berarti `exportExcel`/`exportPNG` harus tahu ia sedang di halaman
  mana, dan yang salah menebak mengunduh lembar divisi lain.

```bash
node tools/uji-bulanan-semua.js   # 12 pemeriksaan, jsdom
```

**BERKAS UJI KEDUA untuk modul Jadwal** (yang pertama `uji-impor-jadwal.js`,
tanpa jsdom). `smoke-modul.js jadwal` merender delapan halamannya tapi tidak
pernah menekan satu pun menu, jadi ia tidak bisa melihat divisi mana yang
terpilih saat halaman itu dibuka.

**2. Panel "Mulai Dingin" DICABUT dari Dashboard Marketing.** Ikut dicabut
seluruh pembantunya — `panelPerluDigarap()`, `isStale()`, `daysSinceFU()`,
`lastFUDate()` — dan barisnya di Pengaturan (*Ambang Mulai Dingin*).

- **Setelan yang tidak dibaca satu pun perhitungan adalah setelan mati**, dan
  keterangannya menjanjikan panel yang sudah tidak ada — janji yang tidak
  ditepati tiap kali dibaca. Pelajaran yang sudah dibayar di `SET.buffer` modul
  HPP, yang begitu selama dua minggu tanpa satu pun layar mengatakannya.
- **`settings.staleDays` SENGAJA dibiarkan hidup di data.** Menghapus angka
  yang sudah tersimpan demi kerapian layar bukan pertukaran yang baik — aturan
  yang sama dengan `companyMonthlyTarget` saat Target dicabut.

**3. Daftar Event di halaman Performa disusun DARI MODULNYA SENDIRI**, bukan
menunggu Breakdown Sumber. Permintaan user: *"tab daftar event itu langsung
di-define aja dari marketing, jadi tidak mesti nunggu diinput dari sisi
breakdown sumber, tetapi jika belum diinput nanti yang tombol diakuinya itu
masih kosong."*

Sebelumnya tabel itu digambar dari baris breakdown saja, jadi acara yang
finance belum sempat memasukkannya **TIDAK ADA di layar sama sekali** — dan
layar kosong terbaca sebagai *"bulan ini memang sepi"*, bukan sebagai *"finance
belum mengisi"*.

| kolom | dari mana |
|---|---|
| Tanggal, Nama | acara milik modul itu |
| **Nominal** | modul itu — grand total Surat Penawaran / kolom Nominal VIP |
| Omset, Tax, Service, Open Bill | baris Breakdown Sumber, kosong kalau belum ada |
| **Diakui** | baris Breakdown Sumber, *belum diinput finance* kalau belum ada |
| Kontribusi hari itu | baris Breakdown Sumber |

**SATU ANGKA SATU PEMILIK — keputusan user saat ditanya.** Menyunting Nominal
di halaman Performa menulis ke event / Reservasi VIP di modul itu saja, dan
**TIDAK** menulis ke baris breakdown di `kompas-mysql`. Finance tetap
menariknya sendiri lewat tombol *"salin ke kolom"* yang sudah ada. Dua tempat
yang sama-sama boleh mengubah satu angka pasti berselisih suatu hari, dan yang
berselisih di sini uang — bentuk kesalahan yang di repo ini sudah empat kali
memakan waktu (`porsiPic`, `potonganHari`, `hpp.php`, `cocokPic`).

- **`srcId` (`mkt:` / `vip:` / `evt:`) adalah kunci pencocokannya**, dan ia
  harus lolos dari `serapOtomatis()` → `performa_divisi()` → `pbAgregasi()` →
  layar. Dicocokkan lewat NAMA, satu acara yang namanya dibetulkan finance
  langsung berhenti punya pasangan dan tampil **dua kali**: sekali sebagai
  "belum diinput", sekali sebagai "hanya ada di Breakdown".
- **REALISASI DAN SELURUH BONUS TETAP DARI BREAKDOWN.** Yang ditambahkan cuma
  pembandingnya. Kalau kartu Realisasi ikut memakai nominal modul, halaman ini
  berhenti menyebut uang yang benar-benar diakui — dan itulah satu-satunya
  angka yang dipakai membayar bonus.
- **Baris breakdown TANPA pasangan tetap digambar** (*hanya ada di Breakdown*):
  ia bisa baris manual finance, atau acara yang di modulnya PIC-nya lain.
  Membuangnya membuat jumlah kolom Diakui berhenti sama dengan kartu Realisasi
  di atasnya.
- **`nominalDiakui` pada event Marketing DISIMPAN TERPISAH**, bukan ditulis
  balik ke rincian: `eventFinance().grand` itu yang tercetak di Surat Penawaran
  dan Invoice yang sudah dikirim ke client, dan mengubahnya dari papan performa
  berarti dokumen yang beredar berbeda dari yang tersimpan. Yang ditimpa
  dikatakan di selnya berikut angka asalnya dan tautan **pulihkan**.
  Reservasi VIP tidak begitu — `v.nominal` memang angka yang diketik PIC-nya,
  jadi menyuntingnya di sini SAMA dengan menyuntingnya di halaman VIP.
- **IZIN MENYUNTING IKUT DATA ASALNYA** (`can('edit_event')` / `can('edit_vip')`),
  bukan izin halaman `perfomset`. Dijadikan izin halaman, bawaannya cuma
  **Lihat** dan tidak seorang pun bisa mengetik nominalnya sampai admin membuka
  Kelola Akses — kotak yang tidak pernah bisa diketik dilaporkan sebagai rusak,
  bukan dibaca sebagai izin.
- **Acara yang PIC-nya belum cocok dengan roster kompas cuma muncul di segmen
  Semua**, dan jumlahnya disebut. Daftar yang menyusut tanpa keterangan
  dilaporkan sebagai data hilang.
- **`change`, BUKAN `input`.** Menyimpan + menggambar ulang tiap ketukan
  membuat kotak yang sedang diketik dibuat ulang, dan hanya huruf pertama yang
  masuk — jebakan yang sama sudah dibayar di `queueF()` modul Konten.

#### Modul Event: bedanya satu, dan itu menentukan bentuk kolomnya

**MODUL EVENT TIDAK MENYIMPAN NILAI RUPIAH EVENT** — sudah tertulis begitu di
`serapOtomatis()` sejak baris event lahir di sana. Jadi tidak ada grand total
yang bisa jadi bawaan: kolom Nominal di sana **lahir kosong** dan diketik
orangnya, lalu disimpan di event itu sendiri (`nominal`, ikut di blob `data` —
tidak perlu kolom baru, dan berkas migrasi di repo ini rutin tertinggal di
produksi).

- **Yang kosong TIDAK ditebak dari baris breakdown.** Menyalin angka finance ke
  sana lalu memajangnya sebagai "menurut modul Event" membuat kedua kolomnya
  selalu cocok — dan pembanding yang tidak pernah bisa berselisih tidak
  membanding apa pun.
- **Dikosongkan = KEMBALI KOSONG, bukan nol.** Nol berarti acaranya memang
  tidak membawa apa-apa; dua keadaan yang menuntut tindakan berbeda tidak boleh
  berbunyi sama.
- **Penyaring statusnya `['Planning','Draft','Cancelled']` — sama persis dengan
  `events_hari()`.** Disaring dengan aturan lain, acara Draft muncul sebagai
  "belum diinput finance" yang tidak akan pernah bisa dibereskan siapa pun.
- **`pevTglWIB()`**: `start_datetime` INSTANT UTC, dan memotong sepuluh huruf
  pertamanya menggeser acara lewat tengah malam ke hari sebelumnya. Jebakan
  yang sama sudah dibayar di `isoDari()` modul Analytics.

```bash
node tools/uji-performa-marketing-modul.js   # 70 pemeriksaan, jsdom
node tools/uji-performa-event-modul.js       # 93 pemeriksaan, jsdom
node tools/uji-revisi-marketing.js           # 55 pemeriksaan, jsdom
node tools/uji-bulanan-semua.js              # 12 pemeriksaan, jsdom
```

Dua puluh empat mutasi dicoba untuk ketiga revisi, dan **dua lolos di putaran
pertama** — keduanya cacat UJI yang sudah punya nama di berkas ini:

- **"php srcId tidak dikirim" LOLOS**: fixture-nya menyediakan `srcId` sendiri,
  jadi seluruh sisi PHP lewat tanpa disentuh. Sama persis dengan kontrak
  `omsetHari` sehari sebelumnya; ditutup dengan asersi atas SUMBER. Tanpa baris
  PHP itu, di produksi **tidak satu pun** acara punya pasangan: seluruhnya
  berbunyi "belum diinput finance" sementara barisnya berdiri tepat di bawahnya
  sebagai "hanya ada di Breakdown".
- **"yang belum diinput ditulis Rp0" LOLOS**: kalimat *belum diinput finance*
  ada JUGA di `card-sub` ("3 belum diinput finance"), jadi asersi atas seluruh
  badan halaman cocok dengan kartunya tanpa pernah menyentuh selnya. Ditutup
  dengan menuntut penutup `</div>` milik selnya.

Satu asersi lagi ketahuan **hampa** saat ditulis: "sesudah disamakan barisnya
berbunyi cocok" — baris lain memang sudah cocok sejak awal, jadi adanya kata
itu bukan bukti apa pun. Yang benar-benar bergerak **hilangnya** selisih.


### Delegasi ke aset yang lupa diekspor: Performa Kas mati senyap (8 Sep 2026)

Keluhan user: **Performa Marketing dan Performa Event di panel Kas Kecil tidak
bisa dibuka.** Yang terlihat di layar bukan pesan galat melainkan **halaman
Performa Kasir yang tertinggal** — judulnya sudah berbunyi "Performa Event"
sementara badannya masih kartu bonus kasir berikut Riwayat OFF/Masuk.

Sebabnya satu baris yang tidak ada:

```
viewPerforma()  ->  kartuApprovalCompliment()  ->  compListPemberi()
                ->  compIsPemberi()  ->  compCocok()  ->  pbCompCocok   TIDAK ADA
```

`deploy/finance/kas/` mendelegasikan `compCocok()` ke `pbCompCocok`, tapi fungsi
itu hidup **di dalam IIFE** `deploy/assets/performa-bonus.js` dan tidak pernah
diekspor ke `window`. Seluruh pemakaian di dalam aset lolos lewat closure, jadi
ketiadaannya tidak kelihatan dari mana pun sampai tuan rumah memanggilnya.

**Ia hanya menggigit kalau periodenya punya minimal SATU baris compliment.**
`compListPemberi()` menyaring daftar; daftar kosong berarti fungsinya tidak
pernah dipanggil. Itulah kenapa data uji (tanpa compliment) hijau sementara
produksi (ratusan baris compliment) mati sejak commit `ebea814`.

**GEJALANYA BUKAN GALAT, DAN ITU YANG PALING MAHAL.** `el.innerHTML` ada di
UJUNG `viewPerforma()`, jadi penggambar yang melempar meninggalkan halaman
SEBELUMNYA di layar — utuh, rapi, dan menyesatkan. Yang melaporkannya menyebut
"tidak bisa dibuka", dan tidak ada satu pun tanda yang menunjuk ke barisnya.

Tiga hal yang membuatnya bertahan, dan ketiganya lebih penting daripada bugnya:

- **`smoke-modul.js` TIDAK PERNAH menyentuh `deploy/finance/kas/`** — daftarnya
  cuma memuat `finance`, halaman PEMILIH panel yang tidak berisi aplikasi apa
  pun. Sudah tertulis di berkas ini sejak lama, dan tetap terlewat.
- **Uji bonus menjalankan asetnya BERDIRI SENDIRI** (`new Function(`). Itu
  memang disengaja dan tetap benar — tapi ia tidak pernah membuktikan tuan
  rumahnya bisa memanggil apa yang dipanggilnya.
- **Data uji tanpa compliment.** Jalur yang rusak tidak pernah dijalankan.

Yang menjaganya sekarang **bukan nama `pbCompCocok`**, melainkan invariannya:
tiap nama berawalan `pb` / `PB_` yang dipanggil salah satu dari **ketiga** tuan
rumah wajib ada di daftar `window.*` aset. Itu yang akan menangkap delegasi
BERIKUTNYA yang lupa diekspor.

Ujinya juga menanam penanda di `#app-view` sebelum menggambar lalu menuntutnya
HILANG — "tidak melempar" saja tidak cukup, karena yang dilaporkan user justru
layar yang kelihatan terisi padahal isinya halaman lain.

```bash
node tools/uji-performa-kas-boot.js   # 15 pemeriksaan, jsdom
```

**Berhati-hatilah menulis komentar tentang pemindai ini.** Draf pertama
komentar di atas baris ekspornya memuat `pb` lalu bintang lalu garis-miring
lalu `PB_` — urutan itu **menutup blok komentar lebih awal** dan mematikan
SELURUH aset dengan SyntaxError, sehingga ketiga tuan rumahnya blank. Kalimat
yang menyebut pola berawalan jangan ditulis sebagai glob di dalam `/* */`.

Tiga bentuk data lain masih melempar di halaman ini dan **sengaja dibiarkan**,
karena tidak satu pun bisa lahir dari `normalizeDB()`: `bd.<divisi>` yang bukan
array, `compliments` yang bukan array, dan baris compliment **tanpa `date`**
(`compsBulan()` melakukan `c.date.slice(0,7)`). Yang terakhir paling mungkin
suatu hari benar-benar ada; kalau muncul, gejalanya akan sama persis dengan
yang baru saja dibereskan.

### Deploy gagal ETIMEDOUT — DUA SEBAB YANG BENTUKNYA SAMA PERSIS

```
Error: connect ETIMEDOUT 202.10.43.196:21 (control socket)
```

Ini **kegagalan jaringan sebelum satu byte pun terkirim** — bukan berkas,
bukan kredensial, bukan commit yang barusan di-push.

> **DUA SEBAB BERBEDA MEMULANGKAN PESAN YANG SAMA PERSIS**, dan sampai
> 14 September 2026 berkas ini cuma menyebut yang pertama. Yang kedua ada DI
> DALAM KENDALI KITA, dan selama tidak diketahui ia menghabiskan berhari-hari
> menunggu support hosting mencabut blokir yang tidak pernah ada.
>
> | | yang membedakannya di log |
> |---|---|
> | **blokir firewall** (CSF DROP) | probe curl di langkah yang sama JUGA gagal |
> | **Happy Eyeballs Node** | probe curl **BERHASIL**, aksi FTP gagal beberapa detik kemudian, dan jejaknya memuat `internalConnectMultipleTimeout` |
>
> **Periksa hasil probe-nya dulu.** Ia curl, jadi ia tidak kena masalah kedua —
> itulah gunanya ia berdiri terpisah. Probe hijau + aksi FTP merah berarti
> servernya bisa dihubungi dan yang salah ada di sisi kita.

#### Sebab kedua: Node menyerah sesudah 250 ms (14 September 2026)

Dari run `34807363038`, dan inilah bukti yang memutuskannya:

```
04:48:18  probe curl  -> kode 0, login berhasil, root terbaca
04:48:19  aksi FTP    -> AggregateError [ETIMEDOUT]
                         at Timeout.internalConnectMultipleTimeout
```

**Satu detik, IP sama, runner sama.** Firewall tidak bisa berbalik secepat itu,
dan `internalConnectMultipleTimeout` cuma ada di jalur `autoSelectFamily` Node —
batas waktu **PER ALAMAT** yang bawaannya **250 ms**, bukan batas soketnya
(aksinya sendiri menyetel 300 detik).

Nama host FTP-nya punya A **dan** AAAA. Runner GitHub tidak punya IPv6
(`ENETUNREACH 2001:df0:…` ikut di daftar galatnya), dan jabat tangan TCP ke
Indonesia dari runner sering **lebih lama daripada 250 ms** — jadi IPv4-nya
dibatalkan tepat sebelum SYN-ACK-nya sampai. curl tidak punya batas itu, jadi
ia lolos.

Itu juga yang menjelaskan dua hal yang sebelumnya tidak masuk akal:

- **"Dari dulu bisa kok"** — memang bisa, selama latensinya kebetulan di bawah
  250 ms. Yang berubah bukan repo dan bukan hosting.
- **Rumahweb menjawab "bukan di kami"** — dan mereka benar. Port 21-nya
  menjawab `530` dari laptop di jaringan mana pun.

**PERBAIKANNYA: server FTP dihubungi lewat ALAMAT IPv4, bukan nama host.**
Langkah `Resolve IPv4 server FTP` menerjemahkannya sekali di awal job, dan
SELURUH aksi FTP (29 di dev, 32 di produksi) memakai keluarannya. Host berupa
IP literal melewati DNS, jadi Node tidak pernah masuk jalur multi-alamat itu
sama sekali.

- **Gagal resolve JATUH KEMBALI ke nama host.** Yang sebelumnya kadang berhasil
  tidak boleh berubah jadi tidak pernah berhasil gara-gara langkah bantuan.
- **Yang tertinggal satu saja gagal dengan cara yang sama persis**, dan di log
  ia terlihat identik dengan yang sudah diperbaiki. Karena itu penggantiannya
  diperiksa jumlahnya, bukan ditulis satu-satu.
- **SENGAJA BUKAN `NODE_OPTIONS`.** Nama flag-nya berganti antar versi
  (`--autoselect-family-attempt-timeout` lalu
  `--network-family-autoselection-attempt-timeout`), dan flag yang tidak
  dikenal membuat Node **menolak start** — deploy mati total karena
  perbaikannya sendiri, di runner yang versinya tidak kita kendalikan.
- **Probe-nya sengaja TETAP memakai nama host + curl.** Ia pembanding: kalau
  suatu hari probe ikut merah, barulah sebabnya benar-benar di jaringan.

**Ringkasan tiap run sekarang mencetak IP publik runner-nya** — GitHub tidak
pernah mencetaknya sendiri, dan tanpa satu angka pun permintaan "tolong cabut
blokir firewall" tidak bisa dikerjakan support siapa pun. 13 September 2026
satu hari habis persis di situ.

#### Sebab pertama: blokir firewall CSF

Dibuktikan dengan menghubungi port 21 dari jaringan lain: server menjawab
banner Pure-FTPd seketika, sementara runner GitHub menunggu sampai habis
waktu — **dan probe curl di run itu ikut gagal.** Tanpa syarat terakhir itu,
yang sedang dilihat kemungkinan besar sebab kedua di atas.

**ETIMEDOUT vs ECONNREFUSED menentukan ke mana harus melapor**, dan bedanya
sempat salah dipetakan di kedua workflow:

| gejala | kode curl | artinya |
|---|---|---|
| paket dibalas *reject* | **7** | ada yang menjawab — port tertutup / layanan mati |
| paket **dibuang diam-diam** | **28** | firewall DROP — tanda khas IP runner kena blokir CSF/LFD |

CSF di Rumahweb bawaannya **DROP**, jadi blokir IP muncul sebagai **28**,
bukan 7 — padahal satu-satunya baris yang menyebut "minta whitelist" ada di 7,
dan baris 28 berbunyi "server sedang bermasalah". Diagnosisnya menyuruh yang
membacanya memeriksa server yang sehat. Sudah dibetulkan di `deploy.yml` dan
`deploy-dev.yml`; jangan disamakan lagi jadi satu pesan — dua gejala itu
menuntut dua tindakan yang berbeda.

- **Tindakan pertama: JALANKAN ULANG workflow-nya** — tapi **hanya kalau
  probe curl-nya ikut merah**. Runner baru berarti IP baru, dan itu sering
  langsung lolos. Percobaan ulang 3× di dalam job TIDAK menolong: ketiganya
  dari IP yang sama. Kalau probe-nya HIJAU, mengulang tidak akan pernah
  menolong — yang salah sebab kedua, dan itu tidak berganti dengan IP baru.
- Kalau berulang, minta support Rumahweb mencabut blokirnya. Menambah
  whitelist rentang IP GitHub Actions bukan jalan keluar yang bertahan —
  rentangnya besar dan berganti.
- ~~Peringatan **"Node 20 is being deprecated"** di log yang sama TIDAK ada
  hubungannya dengan kegagalan ini.~~ **Kalimat itu menutup arah yang benar
  selama seminggu.** Versi Node yang menjalankan aksinya justru yang
  menentukan apakah `autoSelectFamily` menyala dan berapa batas waktunya —
  lihat sebab kedua di atas. Peringatannya sendiri memang bukan penyebab, tapi
  ia menunjuk ke tempat yang benar.

### Monarx memblokir langkah verifikasi backend (29 Agustus 2026)

Rumahweb memasang **Monarx** (WAF) di depan domainnya. Untuk IP runner GitHub
Actions ia menyajikan halaman *Access Denied / Human Verification*, jadi
`curl "…/account-api-mysql/api.php?action=ping"` memulangkan HTML challenge,
bukan JSON. Langkah **Verifikasi backend hidup dan versi terbaru** karena itu
melaporkan `GAGAL env BUKAN produksi — config.php salah` untuk backend yang
sebenarnya sehat.

Halaman itu sekarang **dikenali** (`mx-page` / `monarx` / `Access Denied`) dan
dilaporkan `LEWAT`, bukan `GAGAL`. Alasannya sama dengan sertifikat SSL yang
belum terbit di `deploy-investor.yml`: run merah yang penyebabnya di luar repo
cuma melatih orang mengabaikan tanda merah.

**Yang TIDAK ikut dilonggarkan**, dan sengaja: config dev yang terpasang di
produksi (`env` salah), parse error PHP, dan balasan kosong tetap GAGAL. Itu
kesalahan termahal di repo ini, dan halaman Monarx bisa dibedakan darinya.

Verifikasi isi berkas (`deploy/**`) TIDAK terpengaruh — ia membandingkan HTML
yang memang dilayani ke peramban biasa.

Kalau ingin pemeriksaannya jalan lagi: minta Rumahweb mengecualikan
`/*-api-mysql/*.php` dari Monarx.

### verifikasi-deploy.sh: kegagalan ALAT vs kegagalan DEPLOY (6 Sep 2026)

Dijalankan user di laptop, skrip ini melaporkan **29 halaman GAGAL** dengan
kalimat yang sama — *"isi di server BEDA dari repo"*, `server= byte`. Yang
sebenarnya terjadi: `curl` tidak menghasilkan berkas sama sekali di mesin itu,
jadi `tr < live.html` gagal, berkas pembandingnya tidak pernah lahir, dan tiap
halaman jatuh ke cabang pembanding dengan ukuran server kosong. Server
sendiri menjawab **HTTP 200 dengan isi yang benar untuk 27 dari 29 halaman**.

Kesimpulan yang ditarik dari laporan itu — "develop gagal deploy" — salah,
dan mencari sebabnya di FTP membuang waktu untuk deploy yang sehat.

- **`|| true` DICABUT.** Itu yang menelan kegagalan curl. Sekarang kode HTTP
  ditangkap (`-w %{http_code}`), dan unduhan yang tidak menghasilkan apa pun
  dilaporkan sebagai **`TAK TERBACA`** dengan kalimat *"INI BUKAN bukti deploy
  gagal"*, bukan sebagai isi yang berbeda. Kegagalan alat dan kegagalan deploy
  menuntut tindakan yang berbeda: yang satu "periksa mesin ini", yang satu
  "berkasnya tidak mendarat".
- **`curl` yang tidak ada dikatakan SEKALI DI DEPAN** dan skripnya berhenti
  (exit 2). Tanpa itu satu perintah yang kurang jadi 29 baris merah, dan sebab
  aslinya tergulung ke atas layar.
- **Folder sementara lewat `mktemp -d` + `trap`**, bukan `/tmp` yang dipatok:
  Git Bash Windows tidak selalu bisa menulis ke sana, dan workflow memanggil
  skrip ini TIGA KALI dalam satu run dengan nama berkas yang sama.
- **Kode HTTP ikut di baris angka** pada laporan GAGAL. Tanpa itu "404" dan
  "berkas lama yang masih utuh" terbaca sama persis, padahal jalan keluarnya
  berbeda.

Yang **tidak** dilonggarkan: `TAK TERBACA` tetap `gagal=1`. Workflow
menggerbangi unggah paksa lewat **exit code**, bukan teksnya, jadi mengubah
labelnya aman — tapi menjadikannya lulus akan mematikan seluruh jaring
pengaman FTP.

Dua hal yang ikut ketahuan saat menelusurinya, dan keduanya layak diingat:

- **"BERKASNYA TERTUKAR" ternyata lahir DI DALAM skrip ini** — lihat blok
  berikutnya. Tuduhan itu bukan bukti FTP melakukan apa pun.
- **Mencari string di `index.html` untuk membuktikan sebuah commit sudah
  mendarat WAJIB membuang komentar dulu.** "Pengaturan Target" masih ada 8×
  di `deploy/finance/kas/` — seluruhnya di komentar sejarah, karena sejarah
  memang harus boleh menyebut nama yang dicabut. Salah baca ini membuat
  commit yang SUDAH mendarat disimpulkan belum. Aturan yang sama dengan
  `uji-tanpa-target.js`.

#### Babak kedua: "berkas tertukar" yang tidak pernah terjadi

Sesudah perbaikan di atas, verifikasi dev masih memerahkan **satu halaman acak
setiap kali dijalankan** — `hr/`, lalu `analytics/`+`konten/`+`stock/tree/`,
lalu `service_excellent/`, lalu `cashier/`+`hr/`. Tiap berkas yang dituduh
selalu **identik dengan repo** saat diunduh ulang satu per satu.

Dua di antaranya bahkan dilaporkan "menyajikan isi berkas lain":

```
GAGAL cashier/  server menyajikan isi bd/index.html          — BERKASNYA TERTUKAR
GAGAL hr/       server menyajikan isi howandi_life/index.html — BERKASNYA TERTUKAR
```

Keduanya, dan `stock/hpp/` sebelumnya, adalah **halaman nomor tepat sebelumnya
dalam urutan alfabetis** yang diperiksa skrip: `bd`(4)→`cashier`(5),
`howandi_life`(13)→`hr`(14), `stock`(23)→`stock/hpp`(24). Bukan kebetulan.

**`curl -o` tidak menyentuh berkas tujuan kalau ia gagal sebelum ada data.**
Berkas unduhan halaman SEBELUMNYA karena itu tetap di tempatnya, lolos
pemeriksaan "berkasnya ada dan tidak kosong", dan dibandingkan seolah-olah itu
jawaban server untuk halaman ini. Pembanding "berkas tetangga" lalu menemukan
kecocokan sempurna — karena isinya memang berkas repo yang barusan diunduh —
dan mencetak tuduhan yang paling meyakinkan di seluruh skrip ini.

**Gejala "aliran FTP menulis berkas tetangga" bisa lahir seluruhnya di dalam
skrip, tanpa FTP melakukan apa pun.** Yang mengejarnya akan memeriksa server
untuk kerusakan yang tidak pernah ada. Kejadian 3 September 2026 yang tercatat
di komentar skrip (`dw/` disebut berisi `cashier/`) punya bentuk yang sama
persis — `cashier` memang tepat sebelum `dw` dalam urutan itu — jadi diagnosis
lamanya patut diragukan, walau tidak bisa dibuktikan lagi sekarang.

Yang diperbaiki:

- **`rm -f live.html` sebelum tiap unduhan.** Satu baris, dan ia yang
  membedakan tuduhan yang berarti dari tuduhan yang mengarang sendiri.
- **Status keluar curl diperiksa** (`st=$?`), bukan cuma kode HTTP. Transfer
  yang PUTUS DI TENGAH meninggalkan berkas separuh dengan `http=200`, dan
  potongan itu dilaporkan sebagai "isi di server BEDA" — tuduhan deploy gagal
  untuk berkas yang utuh di server.
- **`--retry 2 --retry-delay 2`.** Rumahweb sesekali memutus satu dari 29
  permintaan beruntun, dan laporan yang isinya berganti-ganti tiap dijalankan
  berhenti dipercaya seluruhnya — termasuk waktu ia benar.

Sesudahnya: **dev 29/29 bersih dua putaran berturut-turut, produksi 29/29.**
Sebelumnya tidak pernah ada dua putaran yang sama hasilnya.

Pelajaran yang lebih besar dari bug-nya: **alat pemeriksa yang salah lebih
mahal daripada tidak punya alat.** Dalam satu sore skrip ini menuduh 29
halaman gagal (semuanya sehat), lalu menuduh FTP menukar berkas (tidak pernah
terjadi) — dan satu-satunya kerusakan yang benar-benar ada, `analytics/` yang
belum ter-deploy, nyaris tenggelam di antara keduanya.

**Push otomatis men-deploy.** `main` → **`team.laksamanamuda.id`** (produksi),
`develop` → `dev.laksamanamuda.id`. Berkas ini sempat menulis
`office.laksamanamuda.id`; nama itu **tidak ada di DNS** dan tidak pernah ada —
mencarinya di situ memakan satu putaran penuh pada 27 Agustus 2026 waktu
halaman investor perlu tahu ke mana harus meminta angka omset.

Keduanya lewat FTP dengan verifikasi isi berkas
(transfer ke Rumahweb pernah putus di tengah dan melaporkan "sukses", sehingga
modul mati tanpa ada yang sadar — itu sebab ada 3× percobaan + langkah
Verifikasi di workflow). Jangan push kalau belum yakin.

Perubahan yang sudah di-commit tapi belum di-push **tidak ada di dev**. Kalau
user melaporkan perbaikannya "belum jalan" sambil menunjukkan layar dev,
periksa `git log origin/develop..develop` lebih dulu sebelum mencari bug —
sudah kejadian pada 28 Juli 2026 di modul kompas.

**Gaya pesan commit:** `<modul>: <apa yang berubah dari sudut pandang user>`,
bahasa Indonesia. Badan pesan menjelaskan **sebab** bug, bukan daftar berkas —
`git diff` sudah menyimpan daftar berkas.

### Jebakan shell: Bash vs PowerShell

Tool `Bash` di sini adalah **Git Bash (POSIX sh)**. Sintaks here-string
PowerShell `@'…'@` akan diterima sebagai teks biasa dan menyelipkan baris `@`
ke dalam pesan commit. Untuk pesan multi-baris di Bash pakai heredoc:

```bash
git commit -F- <<'MSG'
modul: ringkasan
…
MSG
```

---

## 6. Cara membaca & menulis komentar di repo ini

Kode di sini padat komentar berbahasa Indonesia yang menjelaskan **mengapa**,
sering menyebut kejadian nyata ("sudah kejadian 2× pada 16 Juli 2026",
"akibatnya kolom No. HP SELALU kosong"). Itu disengaja dan sangat berharga:

- **Baca komentar di sekitar kode sebelum mengubahnya.** Sering kali sebuah
  syarat yang tampak aneh (`!Array.isArray(x)` tanpa `|| !x.length`) sudah
  dijelaskan alasannya tepat di atasnya, dan "merapikannya" akan mengembalikan
  bug lama.
- **Tulis komentar dengan gaya yang sama** saat mengubah sesuatu: apa yang dulu
  salah, kenapa bentuk baru ini dipilih. Bukan mengulang apa yang kodenya sudah
  katakan.
- Jangan hapus komentar sejarah hanya karena kodenya berubah — perbarui isinya.

---

## 7. Kebiasaan yang menghemat token (ringkas)

- **Satu pesan, banyak tool call** untuk hal yang tidak saling bergantung.
- `Grep` dengan `output_mode:"content"` + `head_limit` daripada membaca berkas.
- Untuk penggantian berulang di berkas raksasa, satu skrip Python via `Bash`
  lebih murah daripada sepuluh `Edit`.
- Jangan `Read` ulang berkas yang baru saja di-`Edit` untuk "memastikan" — Edit
  sudah gagal kalau tidak cocok.
- Jangan panggil subagent kecuali user memintanya. Pekerjaan di repo ini hampir
  selalu terpusat di satu berkas; subagent hanya mengulang penelusuran yang
  sudah selesai.
- Berkas sementara → direktori scratchpad sesi, bukan repo.
