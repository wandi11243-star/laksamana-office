# Laksamana Office — panduan kerja untuk Claude

Tujuan berkas ini: **memangkas token yang terbuang untuk menemukan ulang hal
yang sudah diketahui**, bukan menambah aturan. Semua di bawah ini adalah fakta
repo yang kalau tidak ditulis, harus ditemukan ulang dengan belasan panggilan
`ls` / `find` / `grep` setiap sesi.

Bahasa kerja: **Indonesia** — UI, komentar kode, pesan commit, dan balasan ke
user. Istilah teknis (commit, merge, pager, endpoint) dibiarkan apa adanya.

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
- **Rata-rata per TAMU disembunyikan kalau kolom Pax jarang terisi** — di data
  produksi cuma 318 dari 4.087 bill. Membaginya memberi angka belasan kali
  lipat dari kenyataan, dan angka semacam itu terlihat sangat meyakinkan.

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
| bernama UKURAN (3.218 porsi) | `LARGE (PACKAGE)`, `REGULAR (PACKAGE)` | minumannya ada di KODE-nya |

- **Digabungkan saat MENGGAMBAR (`menuNormal()`), bukan saat mengurai.**
  Dibakukan ke laporan tersimpan, peta kode yang dibetulkan bulan depan tidak
  akan pernah memperbaiki bulan-bulan yang sudah diunggah — dan yang
  membetulkannya tidak punya cara tahu kenapa angkanya tidak berubah. `menu`
  di laporan tersimpan **tetap memakai nama mentah dari POS**.
- **Kode yang belum dipetakan TETAP DIHITUNG**, dengan nama yang menyebut
  kodenya (`LARGE (PACKAGE) · MATCHA02`). Dibuang, jumlah porsi di halaman ini
  berhenti sama dengan jumlah di berkas POS — dan ujinya memeriksa persis itu:
  total porsi & nilai **tidak boleh berubah** karena penggabungan.
- **`Menu Code` ADA tapi KOSONG di seluruh 19.734 baris**; yang berisi kodenya
  `Custom Menu Name`. Kolom yang ada tapi kosong adalah jebakan yang tidak bisa
  ditangkap dengan memilih kolom sekali di depan — `menu code` menang karena
  kolomnya memang ada, dan nol kode terbaca tanpa satu pun galat. Karena itu
  `KOL_CARI.kode` dan `kode2` dipilih **PER BARIS**.
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
node tools/uji-simpan-basi.js   # 38 pemeriksaan, jsdom
```

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

**2. Reporting jadi PER BULAN dan sesederhana mungkin.** Pemilih bulan, tiga
kartu ringkas (Total Omset, Jumlah Event, Rata-rata per Event), dan tabel per
hari: **tanggal · jumlah event · total omset**, dengan baris TOTAL di kakinya.

- **"Hari itu" DIBACA TANGGAL ACARANYA** (`e.tanggal`), bukan tanggal barisnya
  diinput — yang dipasangkan dengan omset adalah hari acaranya berlangsung.
  Dikatakan di layarnya supaya tidak perlu ditebak.
- Hanya event **Confirmed / Deal / Event Done**. Peluang yang belum closing
  bukan omset, dan memasukkannya membuat angka bulan berjalan turun tiap kali
  ada peluang yang batal.
- Angkanya dari `eventFinance().grand` — rumus yang sama dengan Surat Penawaran
  dan Invoice. Menghitungnya sendiri berarti laporan yang menyebut angka lain
  daripada dokumen yang sudah dikirim ke klien.
- **Hari tanpa acara tidak digambar.** Sebulan penuh baris nol membuat yang
  benar-benar terjadi harus dicari dengan mata; jumlah hari berisi toh sudah
  disebut di kartunya.
- **Baris TOTAL ada DI DALAM tabelnya**, bukan cuma di kartu atas: yang
  menjumlahkan kolomnya sendiri harus bisa mencocokkannya tanpa menggulir balik.
- Yang DICABUT: donat *Revenue per Jenis Event*, kartu Total Pax, dan Avg per
  Pax. `donutSVG()` ikut dicabut — Reporting satu-satunya pemakainya.

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
node tools/uji-revisi-marketing.js   # 39 pemeriksaan, jsdom
````

Ujinya membuang komentar sebelum mencari — sejarah kenapa sesuatu dicabut
justru harus tetap boleh menyebut namanya; yang dilarang PEMAKAIANNYA. Satu
rujukan yang tertinggal untuk fungsi yang sudah dibuang adalah ReferenceError,
dan gejalanya **layar putih** tanpa satu kata pun yang menyebut sebabnya. Enam
mutasi dicoba, keenamnya tertangkap.

### Deploy gagal ETIMEDOUT: servernya sehat, IP runner-nya diblokir (7 Sep 2026)

```
Error: connect ETIMEDOUT 202.10.43.196:21 (control socket)
```

Jangan mencari sebabnya di repo. Ini **kegagalan jaringan sebelum satu byte
pun terkirim** — bukan berkas, bukan kredensial, bukan commit yang barusan
di-push. Dibuktikan dengan menghubungi port 21 dari jaringan lain: server
menjawab banner Pure-FTPd seketika, sementara runner GitHub menunggu sampai
habis waktu.

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

- **Tindakan pertama: JALANKAN ULANG workflow-nya.** Runner baru berarti IP
  baru, dan itu sering langsung lolos. Percobaan ulang 3× di dalam job TIDAK
  menolong: ketiganya dari IP yang sama.
- Kalau berulang, minta support Rumahweb mencabut blokirnya. Menambah
  whitelist rentang IP GitHub Actions bukan jalan keluar yang bertahan —
  rentangnya besar dan berganti.
- Peringatan **"Node 20 is being deprecated"** di log yang sama TIDAK ada
  hubungannya dengan kegagalan ini.

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
