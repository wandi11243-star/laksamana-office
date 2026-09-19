/*
  PANDUAN: Finance, Kas Kecil & Rekap
  ---------------------------------------------------------------------------
  Kuncinya 'finance'. Nama menu disalin dari TITLES di deploy/finance/kas/.
  Halaman Pengaturan Target dan Ranking PIC sudah DICABUT dan sengaja tidak
  disebut sebagai langkah di sini.
*/
LM_HELP_ISI('finance', {
  ringkas: 'Buku kas kecil, rekap penjualan yang mencocokkan POS dengan setoran bank, '
         + 'rencana pembayaran mingguan, dan seluruh papan performa.',
  untuk: 'finance',

  bagian: [

    {
      id: 'tentang', judul: 'Tentang Panel Kas Kecil',
      isi: [
        { t:'teks', isi:'Panel ini yang paling banyak halamannya di modul Finance. Ia dibuka '
              + 'lewat kartu Finance di Office lalu dipilih di halaman pemilih panelnya.' },
        { t:'tabel',
          kepala:['Kelompok','Menu','Untuk apa'],
          baris:[
            ['Dashboard','Dashboard Omset, Dashboard Analytics','Melihat. Dua halaman ini yang terbuka lebih dulu tiap pagi.'],
            ['Kas Kecil','Input Transaksi, Buku Kas Kecil, Pos & Kategori','Uang keluar-masuk kas kecil.'],
            ['Pembayaran','Planning Pembayaran','Lembar transfer mingguan per rekening pembayar.'],
            ['Penjualan','Rekap Penjualan, Invoice & Kwitansi, Laporan Void','Mencocokkan POS dengan bank.'],
            ['Performa','Performa Marketing, Performa Event, Performa Kasir','Siapa diakui berapa, dan bonusnya.']
          ] },
        { t:'gambar', berkas:'finance/rekap-penjualan.png',
          teks:'Rekap Penjualan: satu baris per hari, POS dibandingkan dengan yang benar-benar masuk.',
          tandai:[
            'Baris per tanggal.',
            'Kolom Dibayar Tamu, yaitu penjualan after tax & service.',
            'Kolom Aktual Masuk per metode pembayaran.'
          ] }
      ]
    },

    {
      id: 'kas', judul: 'Kas Kecil',
      isi: [
        { t:'langkah', judul:'Mencatat transaksi', isi:[
          'Buka *Input Transaksi Kas Kecil*.',
          'Satu baris = satu transaksi. Isi tanggal, pos, kategori, keterangan, dan nominalnya.',
          'Tambah baris sebanyak yang perlu.',
          'Simpan SEKALIGUS di akhir, bukan satu per satu.'
        ]},
        { t:'catatan', nada:'info', judul:'Kenapa disimpan sekaligus',
          isi:'Menyimpan per baris berarti puluhan penulisan untuk satu lembar, dan kalau yang '
            + 'kesepuluh gagal, sembilan sudah masuk sementara sisanya belum — tanpa satu pun '
            + 'tempat yang mengatakan sampai mana.' },
        { t:'teks', isi:'*Buku Kas Kecil* menampilkan seluruh transaksi berikut saldo berjalan '
              + 'tiap pos. *Pos & Kategori* tempat daftar pos dan kategorinya diatur — isinya '
              + 'jarang berubah, jadi jangan dicari tiap hari.' }
      ]
    },

    {
      id: 'rekap', judul: 'Rekap Penjualan & Setoran Cash',
      isi: [
        { t:'teks', isi:'Halaman ini mencocokkan dua hal: apa yang tercatat di POS, dan berapa '
              + 'yang benar-benar diterima. Angka penjualannya *after tax & service* — itu yang '
              + 'ditagihkan ke tamu.' },
        { t:'langkah', judul:'Mencatat setoran cash', isi:[
          'Buka *Rekap Penjualan*, masuk ke bagian Setoran Cash.',
          'Centang hari yang disetor. Kotak nominalnya terisi *sisa* hari itu.',
          'Kalau yang disetor tidak semuanya, sunting nominalnya.',
          'Pilih *bank tujuan*-nya.',
          'Simpan.'
        ]},
        { t:'catatan', nada:'awas', judul:'Setoran boleh sebagian, dan hari itu belum lunas',
          isi:'Hari yang baru disetor sebagian TETAP muncul di daftar "belum disetor" dengan '
            + 'sisanya. Kalau ia hilang begitu disebut satu baris setoran, sisanya lenyap dari '
            + 'layar — uang yang masih di brankas dan tidak disebut di mana pun.' },
        { t:'catatan', nada:'awas', judul:'Nominal yang melampaui sisa DITOLAK, bukan diperingatkan',
          isi:'Server menjepit nominalnya ke sisa hari itu, jadi layar yang meneruskan angka '
            + 'lebih besar akan menyimpan angka yang berbeda dari yang kamu ketik. Kalau uang '
            + 'yang benar-benar disetor memang lebih besar, yang salah *Cash Actual* hari itu di '
            + 'Report Daily — betulkan di sana.' },
        { t:'catatan', nada:'info', judul:'"Rp" di kotak nominal cuma hiasan',
          isi:'Ia bukan bagian dari nilainya, jadi ia tidak bisa terhapus dan tidak ikut terpilih '
            + 'saat isinya kamu blok untuk diganti. Ketik angkanya saja.' },
        { t:'catatan', nada:'info', judul:'Bank tujuan yang tidak dikenal dilaporkan, bukan ditebak',
          isi:'Kalau tujuan yang kamu ketik tidak cocok dengan BRI, Mandiri, BCA, atau UOB, '
            + 'ia disebut di layar — tidak dijatuhkan diam-diam ke bank pertama.' }
      ]
    },

    {
      id: 'bayar', judul: 'Planning Pembayaran',
      isi: [
        { t:'teks', isi:'Lembar transfer mingguan, bentuknya meniru lembar Excel yang selama ini '
              + 'dipakai: satu tanggal bayar berisi baris yang dikelompokkan per rekening '
              + 'pembayar, dengan subtotal tiap kelompok.' },
        { t:'langkah', isi:[
          'Buka *Planning Pembayaran*, pilih tanggal lembarnya.',
          'Isi baris draf di bawah: kategori, rekening pembayar, vendor, keterangan, nominal.',
          'Tekan Enter untuk menambahkannya ke draf.',
          'Ulangi sampai selesai, lalu simpan SEKALI.',
          'Sesudah transfernya dikirim, tandai buktinya per kelompok rekening.'
        ]},
        { t:'catatan', nada:'awas', judul:'Draf hidup di peramban saja',
          isi:'Ia sengaja TIDAK disimpan otomatis. Draf yang bertahan berhari-hari di satu '
            + 'perangkat akan disimpan orang lain di perangkat lain tanpa tahu isinya sudah basi, '
            + 'dan uang keluar dua kali. Halamannya menahanmu kalau mau ditutup sebelum disimpan.' },
        { t:'catatan', nada:'info', judul:'Penerima, bank, dan nomor rekening dibaca dari Purchasing',
          isi:'Dari *Daftar Kontak Vendor* di panel Purchasing, bukan disalin ke sini. Nomor yang '
            + 'dibetulkan di sana langsung berlaku di lembar ini. Nama vendor yang kamu ketik '
            + 'tidak ditolak kalau tidak ada di master — tapi dikatakan di baris bawahnya, supaya '
            + 'salah ketik satu huruf tidak lolos diam-diam sebagai vendor baru.' },
        { t:'catatan', nada:'info', judul:'Tandai bukti per KELOMPOK rekening',
          isi:'Orang menekan kirim di m-banking sekali untuk beberapa transfer sekaligus. '
            + 'Menandainya satu per satu membuat sebagian tertinggal tanpa disadari. Tombolnya '
            + 'menyebut saldo sesudahnya.' },
        { t:'catatan', nada:'awas', judul:'Lembar yang sudah diarsipkan tidak langsung menerima baris baru',
          isi:'Tanggal baru otomatis mengarsipkan yang sebelumnya. Menambah ke lembar arsip masih '
            + 'mungkin tapi harus diminta, dan izinnya berlaku satu lembar saja. Bukti TF dan '
            + 'status bayar di arsip TETAP bisa diubah — pembayaran minggu lalu sering baru '
            + 'dikonfirmasi minggu ini.' },
        { t:'catatan', nada:'info', judul:'Chip arsip menyebut sisa yang belum terbayar',
          isi:'Itu yang menahan pembayaran terlupakan: lembarnya turun dari layar dan tidak ada '
            + 'satu pun tempat yang menyebut masih ada sisa.' }
      ]
    },

    {
      id: 'kwitansi', judul: 'Invoice & Kwitansi',
      isi: [
        { t:'langkah', isi:[
          'Buka *Invoice & Kwitansi*. Isinya permintaan yang dikirim kru Reservasi.',
          'Periksa dana masuknya lebih dulu.',
          'Kalau sudah benar, terbitkan kwitansinya.',
          'Kalau ada yang salah, tolak dan tulis alasannya.'
        ]},
        { t:'catatan', nada:'info', judul:'Permintaannya sudah disaring di hulu',
          isi:'Kru Reservasi tidak bisa mengirim permintaan selama masih ada transfer DP yang '
            + 'belum terverifikasi. Jadi yang sampai ke sini sudah lolos pemeriksaan pertama — '
            + 'tapi tetap periksa nominalnya sebelum kertasnya keluar.' }
      ]
    },

    {
      id: 'performa', judul: 'Papan Performa & Bonus',
      isi: [
        { t:'teks', isi:'Tiga halaman — *Performa Marketing*, *Performa Event*, dan *Performa '
              + 'Kasir* — bentuknya sama: satu baris tiga kotak posisi sekarang, lalu tangganya '
              + 'sebagai tabel.' },
        { t:'catatan', nada:'info', judul:'Bonus Skema 4 (marketing) dan Skema 3 (event) berdiri sendiri',
          isi:'Keduanya berbentuk voucher, cuti, dan penghargaan — bukan rupiah. Menjumlahkannya '
            + 'ke angka bonus membuat sesuatu yang TIDAK BISA DICAIRKAN tampak seperti uang yang '
            + 'bisa, dan yang menyiapkan pembayarannya tidak punya cara membedakannya lagi.' },
        { t:'catatan', nada:'awas', judul:'Bonus Leader dibaca dari kolom Tim/Keterangan di Office',
          isi:'Tulis **Head** di keterangan orangnya, di samping Marketing. Kata *Leader* TIDAK '
            + 'lagi dikenali — yang keterangannya terlanjur begitu terbaca sebagai bukan head, dan '
            + 'kartunya mengatakan itu. Sengaja tidak ada setelan terpisah: setelan kedua untuk '
            + 'fakta yang sudah tercatat di Office pasti menyimpang, dan selisihnya bisa sampai '
            + 'jutaan sebulan untuk satu orang.' },
        { t:'catatan', nada:'info', judul:'Kolom Realisasi di tabel tangga berbeda isinya per baris',
          isi:'Baris yang sedang berlaku menampilkan angkanya; baris di atasnya menyebut kurang '
            + 'berapa lagi; baris yang sudah terlewati berbunyi "terlampaui". Kolom yang memajang '
            + 'angka sama di semua baris tidak menghapus pekerjaan yang jadi alasan kolom itu ada.' },
        { t:'catatan', nada:'info', judul:'Kartu Realisasi memajang TAGIHAN, bukan net',
          isi:'Yaitu net + service + pajak — angka yang benar-benar dibayar tamu, sama persis '
            + 'dengan Dibayar Tamu di Rekap Penjualan. Angka net-nya tetap disebut di catatan '
            + 'layarnya, karena ia yang jadi dasar Rasio Komposisi dan ATV.' }
      ]
    },

    {
      id: 'masalah', judul: 'Masalah Umum',
      isi: [
        { t:'tabel',
          kepala:['Gejala','Kemungkinan sebabnya','Yang perlu dilakukan'],
          baris:[
            ['Omset PIC tidak muncul di Performa',
             'Barisnya di Breakdown Sumber belum punya PIC.',
             'Buka panel Input Omset Harian → Breakdown Sumber pada tanggalnya.'],
            ['Pita "belum ditentukan kasir shift-nya"',
             'Ada baris event yang shift-nya belum diisi.',
             'Isi di Breakdown Sumber. Baris yang memang tidak memotong kasir tidak ikut dihitung.'],
            ['Saldo bank di Brankas tidak cocok',
             'Aktual Masuk di Rekap Penjualan belum lengkap.',
             'Saldo di Brankas dihitung dari halaman ini — betulkan sumbernya, bukan saldonya.'],
            ['Ada metode pembayaran baru yang tidak muncul',
             'Metode baru harus didaftarkan di beberapa tempat sekaligus.',
             'Laporkan. Yang paling berbahaya: MDR yang diketik bisa dibuang diam-diam.'],
            ['Nominal setoran yang tersimpan beda dari yang diketik',
             'Angkanya melampaui sisa hari itu.',
             'Betulkan Cash Actual hari itu di Report Daily lebih dulu.']
          ] }
      ]
    }

  ]
});
