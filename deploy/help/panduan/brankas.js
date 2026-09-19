/*
  PANDUAN: Finance, Brankas
  ---------------------------------------------------------------------------
  Kuncinya 'brankas', SENGAJA tidak dilebur ke 'finance': yang memegang kas
  kecil tidak dengan sendirinya melihat posisi kas seluruh perusahaan dan
  pengembalian modal investor. Nama menu disalin dari TITLES di
  deploy/finance/brankas/.
*/
LM_HELP_ISI('brankas', {
  ringkas: 'Posisi kas perusahaan per bank, piutang, perpindahan uang antar wallet, dan '
         + 'pengembalian modal investor.',
  untuk: 'CFO dan manajemen keuangan',

  bagian: [

    {
      id: 'tentang', judul: 'Tentang Panel Brankas',
      isi: [
        { t:'teks', isi:'Panel ini menjawab satu pertanyaan: *uang perusahaan sekarang ada di '
              + 'mana, dan berapa*. Ia panel ketiga di modul Finance, dengan kunci izinnya '
              + 'sendiri — terpisah dari Kas Kecil dan dari Input Omset.' },
        { t:'tabel',
          kepala:['Menu','Isinya'],
          baris:[
            ['Ringkasan Brankas','Posisi kas dan keputusan terdekat.'],
            ['Saldo & Rekening','Saldo tiap bank dan brankas fisik.'],
            ['Mutasi & Transfer','Setor, tarik, dan pindah uang antar wallet.'],
            ['Uang Pending / Piutang','Bon yang dicatat kasir dan belum dibayar tamu.'],
            ['Pengembalian Modal','Progres pengembalian modal per investor.'],
            ['Pengaturan','Saldo awal, pemetaan metode pembayaran, biaya bulanan.']
          ] },
        { t:'catatan', nada:'info', judul:'Planning Pembayaran sudah pindah',
          isi:'Lembar transfer mingguan sekarang di panel *Kas Kecil*, bukan di sini. Datanya '
            + 'tetap tersimpan bersama data Brankas, dan baris yang sudah terbayar tetap '
            + 'mengurangi saldo wallet di halaman Saldo — jadi angkanya tetap nyambung.' }
      ]
    },

    {
      id: 'saldo', judul: 'Saldo Rekening — jangan dicari kotak isiannya',
      isi: [
        { t:'catatan', nada:'awas', judul:'SALDO TIDAK PERNAH DIKETIK',
          isi:'Tidak ada kotak isian untuk saldo bank, dan itu disengaja. Ia DIHITUNG dari '
            + '*Aktual Masuk* tiap metode pembayaran di Rekap Penjualan, dikurangi setoran dan '
            + 'pembayaran yang sudah ditandai. Kalau saldonya salah, yang perlu dibetulkan '
            + 'sumbernya — bukan saldonya.' },
        { t:'tabel',
          kepala:['Kalau saldonya salah','Periksa di'],
          baris:[
            ['Terlalu besar','Aktual Masuk di Rekap Penjualan, atau pembayaran yang belum ditandai terbayar.'],
            ['Terlalu kecil','Setoran cash yang terlanjur dicatat dua kali, atau MDR yang salah.'],
            ['Brankas fisik minus','Setoran yang nominalnya melampaui cash hari itu.']
          ] },
        { t:'catatan', nada:'info', judul:'Metode yang belum punya bank tujuan dilaporkan di layar',
          isi:'QR Order, Gofood, Grabfood, dan TikTok Go bawaannya masuk UOB, sama dengan '
            + 'Transfer. Itu bawaan, bukan kunci mati — kalau settlement-nya pindah bank, ubah '
            + 'pemetaannya di Pengaturan. Metode yang tidak punya tujuan disebut di halaman Saldo; '
            + 'itulah jaringnya kalau suatu hari ada metode baru.' }
      ]
    },

    {
      id: 'mutasi', judul: 'Mutasi & Transfer Wallet',
      isi: [
        { t:'teks', isi:'Halaman ini untuk perpindahan uang yang TIDAK datang dari omset harian.' },
        { t:'tabel',
          kepala:['Jenis','Artinya'],
          baris:[
            ['Pindah','Uang berpindah dari satu wadah ke wadah lain. SATU baris, bukan dua.'],
            ['Uang masuk dari luar (di luar omset harian)','Pemasukan cash yang tidak lewat POS: sewa tempat, penjualan barang bekas, titipan yang dikembalikan.'],
            ['Tarik','Uang keluar dari sebuah wadah.']
          ] },
        { t:'catatan', nada:'awas', judul:'"Pindah" adalah SATU baris yang menyentuh dua wadah',
          isi:'Jangan mencatatnya sebagai dua baris — keluar dari A, lalu masuk ke B. Dua baris '
            + 'yang salah satunya terhapus membuat uang perusahaan bertambah atau hilang tanpa ada '
            + 'yang menyadarinya.' },
        { t:'catatan', nada:'awas', judul:'Yang SUDAH masuk omset harian jangan dicatat di sini',
          isi:'Ia sudah terhitung lewat Aktual Masuk di Rekap Penjualan. Mencatatnya lagi '
            + 'menaikkan saldo tanpa satu pun uang yang benar-benar datang. Peringatan itu ada di '
            + 'layarnya sendiri.' },
        { t:'catatan', nada:'info', judul:'Setoran cash dari Rekap Penjualan IKUT di riwayat ini',
          isi:'Ia memang perpindahan wallet, jadi ia mutasi — tapi ia DIBACA, bukan disalin. '
            + 'Barisnya tidak bisa dihapus dari sini: yang memegang setoran adalah Rekap '
            + 'Penjualan, dan setoran yang dibatalkan di sana harus ikut hilang dari sini juga.' }
      ]
    },

    {
      id: 'piutang', judul: 'Uang Pending / Piutang',
      isi: [
        { t:'catatan', nada:'info', judul:'Halaman ini BACA SAJA',
          isi:'Bon tamu dicatat kasir di modul Cashier → Piutang / Bon. Kalau ia bisa diketik di '
            + 'dua tempat, satu bon akan punya dua angka berbeda suatu hari — dan yang '
            + 'mencocokkannya tidak punya cara tahu mana yang benar.' },
        { t:'teks', isi:'Yang bisa dikerjakan di sini cuma membacanya sebagai bagian dari posisi '
              + 'kas: uang yang secara catatan sudah jadi hak perusahaan tapi belum ada di '
              + 'rekening mana pun.' }
      ]
    },

    {
      id: 'modal', judul: 'Pengembalian Modal Investor',
      isi: [
        { t:'langkah', isi:[
          'Buka *Pengembalian Modal*.',
          'Catat pembayarannya: investor, tanggal, nominal.',
          'Pilih *wallet asalnya* — dari rekening mana uangnya keluar.',
          'Simpan.'
        ]},
        { t:'catatan', nada:'awas', judul:'Wallet asal WAJIB diisi',
          isi:'Tanpa itu, saldo rekening tetap utuh padahal uangnya sudah ditransfer ke investor. '
            + 'Baris lama yang belum punya keterangan itu TIDAK dijatuhkan ke wadah mana pun — '
            + 'menebaknya berarti mengurangi rekening yang uangnya tidak pernah keluar dari sana. '
            + 'Yang menggantung dilaporkan di layar.' },
        { t:'catatan', nada:'info', judul:'Ikut tampil di halaman investor',
          isi:'Pengembalian yang kamu catat di sini muncul sebagai riwayat dividen di Investor '
            + 'Compass. Halaman investor membacanya lewat pintu berpagar, bukan dengan membuka '
            + 'data keuangan ini langsung.' }
      ]
    },

    {
      id: 'masalah', judul: 'Masalah Umum',
      isi: [
        { t:'tabel',
          kepala:['Gejala','Kemungkinan sebabnya','Yang perlu dilakukan'],
          baris:[
            ['Saldo bank tidak cocok dengan mutasi rekening',
             'Aktual Masuk atau MDR di Rekap Penjualan belum benar.',
             'Betulkan di Rekap Penjualan. Saldo di sini ikut sendiri.'],
            ['Brankas fisik berbunyi minus',
             'Ada setoran yang nominalnya melampaui cash hari itu.',
             'Periksa Cash Actual hari itu di Report Daily.'],
            ['Baris setoran tidak bisa dihapus',
             'Ia milik Rekap Penjualan, cuma dibaca di sini.',
             'Batalkan setorannya di Rekap Penjualan.'],
            ['Ada pembayaran yang saldonya belum berkurang',
             'Barisnya belum ditandai terbayar.',
             'Tandai bukti TF-nya di Planning Pembayaran, panel Kas Kecil.'],
            ['Ada metode pembayaran yang menggantung',
             'Metode baru belum dipetakan ke bank mana pun.',
             'Atur pemetaannya di Pengaturan panel ini.']
          ] },
        { t:'catatan', nada:'awas', judul:'Data di panel ini disimpan sebagai satu blok',
          isi:'Itu boleh selama yang menyuntingnya cuma CFO. Kalau suatu hari panel ini dibuka '
            + 'untuk banyak orang, bentuk penyimpanannya yang pertama harus diubah — bukan '
            + 'hak aksesnya saja.' }
      ]
    }

  ]
});
