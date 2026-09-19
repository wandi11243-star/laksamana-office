/*
  PANDUAN: Cashier
  ---------------------------------------------------------------------------
  Kuncinya 'cashier'. Nama menu yang disebut di sini disalin dari TITLES di
  deploy/cashier/index.html; kalau menunya diganti nama, panduan ini ikut harus
  diganti, kalau tidak orang mencari menu yang sudah tidak ada.
*/
LM_HELP_ISI('cashier', {
  ringkas: 'Layar kerja kasir tiap hari: setoran per metode pembayaran, bon tamu, '
         + 'compliment, catatan void, dan stok rokok.',
  untuk: 'kasir dan supervisor',

  bagian: [

    {
      id: 'tentang', judul: 'Tentang Modul Cashier',
      isi: [
        { t:'teks', isi:'Modul ini tempat kasir mencatat apa yang terjadi di kasir malam itu. '
              + 'Angkanya dipakai finance keesokan harinya untuk mencocokkan POS dengan uang '
              + 'yang benar-benar masuk ke rekening, jadi yang diketik di sini menentukan angka '
              + 'di layar orang lain.' },
        { t:'daftar', isi:[
          '*Report Daily Kasir*, setoran per metode pembayaran: POS vs Actual.',
          '*Piutang / Bon*, bill yang belum dibayar tamu atau owner.',
          '*Compliment*, catatan compliment berikut alasan dan PIC-nya.',
          '*Void Menu*, tiap menu yang di-void dicatat berikut kronologinya.',
          '*Dana Masuk (DP)*, uang DP reservasi. Dibaca dari modul Reservasi, tidak diketik di sini.',
          '*Daily Stock Rokok* dan *Rekap Stock Rokok*, barang masuk dan keluar per hari.',
          '*Performa Kasir*, omset yang diakui untuk kamu.'
        ]},
        { t:'gambar', berkas:'cashier/report-daily.png',
          teks:'Report Daily Kasir: kolom POS di kiri, Actual di kanan, selisihnya dihitung sendiri.',
          tandai:[
            'Pemilih tanggal di atas.',
            'Satu baris per metode pembayaran.',
            'Kolom selisih, dihitung sendiri dari POS dan Actual.'
          ] }
      ]
    },

    {
      id: 'report', judul: 'Report Daily: POS vs Actual',
      isi: [
        { t:'teks', isi:'Dua kolom di halaman ini menjawab dua pertanyaan yang berbeda. '
              + '*POS* adalah yang tercatat di mesin kasir. *Actual* adalah uang yang '
              + 'benar-benar ada: fisik di laci, atau yang benar-benar masuk sesuai bukti.' },
        { t:'langkah', isi:[
          'Buka *Report Daily Kasir*, pastikan tanggalnya benar.',
          'Isi kolom *POS* dari rekap mesin kasir.',
          'Isi kolom *Actual* dari hitungan uang dan bukti transfer yang ada di tangan.',
          'Periksa kolom selisihnya. Selisih yang tidak bisa dijelaskan jangan dibulatkan supaya nol.',
          'Tekan *Simpan*, lalu TUNGGU sampai tulisannya berubah jadi tersimpan.'
        ]},
        { t:'catatan', nada:'awas', judul:'Tunggu sampai benar-benar tersimpan',
          isi:'Tombol simpan di halaman ini menunggu jawaban server dulu sebelum mengaku '
            + 'berhasil. Selama masih berbunyi *Menyimpan ke server…*, jangan tutup tabnya '
            + 'dan jangan pindah halaman.' },
        { t:'catatan', nada:'awas', judul:'Kalau muncul kotak merah "sudah diubah orang lain"',
          isi:'Itu berarti ada orang lain, atau tab lain milikmu sendiri, yang menyimpan lebih '
            + 'dulu sejak halaman ini kamu buka. *Catat dulu angka yang barusan kamu ketik di '
            + 'kertas atau catatan HP*, baru muat ulang halamannya dan isi lagi. Memuat ulang '
            + 'tanpa mencatat akan membuang ketikanmu.' },
        { t:'catatan', nada:'info', judul:'Satu modul ini dibuka di dua tab sekaligus adalah sebab tersering',
          isi:'Kalau kotak merah itu sering muncul padahal tidak ada rekan yang sedang mengisi, '
            + 'periksa apakah modul ini terbuka di lebih dari satu tab di perangkat yang sama. '
            + 'Tutup yang tidak dipakai.' }
      ]
    },

    {
      id: 'void', judul: 'Mencatat Void Menu',
      isi: [
        { t:'teks', isi:'Tiap menu yang di-void wajib dicatat di sini berikut kronologinya. '
              + 'Mesin POS memang mencatat APA yang di-void, tapi tidak pernah bisa menjawab '
              + 'KENAPA — dan justru itu yang dicari saat angkanya diperiksa akhir bulan.' },
        { t:'langkah', judul:'Satu bill, satu kali isi', isi:[
          'Buka menu *Void Menu*, pastikan tanggalnya benar.',
          'Isi *nomor bill*, *siapa yang menginput* pesanan itu ke POS, dan *kesalahan dari siapa*.',
          'Tulis *alasan / kronologi*: kenapa sampai harus di-void.',
          'Isi *nama item* dan *subtotal*-nya. Service dan tax akan terisi sendiri.',
          'Kalau satu bill ada beberapa menu yang di-void, tekan tambah baris — jangan mengisi formulir ini berkali-kali.',
          'Tekan *Simpan*.'
        ]},
        { t:'catatan', nada:'info', judul:'Service & tax terisi sendiri, dan boleh ditimpa',
          isi:'Persennya diatur admin dan ditulis di kepala kolomnya, jadi kamu bisa '
            + 'mencocokkannya dengan struk di tangan. Kalau angkanya memang berbeda — misalnya '
            + 'item compliment yang tidak kena service — ketik saja angkanya sendiri; sejak itu '
            + 'rumusnya berhenti menyentuh kotak tersebut sampai kamu tekan tombol kembalikan.' },
        { t:'catatan', nada:'awas', judul:'Catatan void tidak bisa dihapus',
          isi:'Ini catatan pertanggungjawaban, jadi tombol hapus memang tidak ada. Kalau ada '
            + 'yang salah masuk, *batalkan* barisnya dan tulis alasan pembatalannya. Barisnya '
            + 'tetap terlihat tapi dicoret, dan tidak ikut dijumlahkan di rekap mana pun.' },
        { t:'tabel',
          kepala:['Kotak','Artinya'],
          baris:[
            ['Siapa yang menginput','Kru yang mengetik pesanan itu ke POS.'],
            ['Kesalahan dari siapa','Pihak yang menyebabkannya: Kasir, Floor, Kitchen, Bar, Tamu, atau Sistem.'],
            ['Dicatat oleh','Terisi sendiri dari akun yang sedang login. Tidak perlu dan tidak bisa diketik.']
          ] },
        { t:'catatan', nada:'info', judul:'Nominal boleh kosong',
          isi:'Void yang terjadi sebelum barangnya dibuat memang tidak bernilai rupiah. Jangan '
            + 'mengarang angka supaya formnya mau lewat. Yang tidak boleh cuma nominal minus.' }
      ]
    },

    {
      id: 'piutang', judul: 'Piutang, Compliment, dan DP',
      isi: [
        { t:'teks', isi:'Ketiganya sering tertukar, padahal artinya berbeda dan uangnya '
              + 'diperlakukan berbeda pula.' },
        { t:'tabel',
          kepala:['Halaman','Isinya','Uangnya'],
          baris:[
            ['Piutang / Bon','Bill yang belum dibayar tamu atau owner.','Belum masuk. Masih ditagih.'],
            ['Compliment','Barang yang diberikan gratis, dengan alasan dan PIC-nya.','Tidak akan pernah masuk.'],
            ['Dana Masuk (DP)','DP reservasi tamu.','Sudah masuk, dicatat di modul Reservasi.']
          ] },
        { t:'catatan', nada:'info', judul:'Dana Masuk hanya dibaca di sini',
          isi:'Halaman itu menampilkan DP yang dicatat kru Reservasi. Kalau ada yang kurang atau '
            + 'salah, yang membetulkannya modul Reservasi — mengetik ulang di sini tidak mungkin, '
            + 'dan itu memang disengaja supaya satu angka hanya punya satu pemilik.' },
        { t:'catatan', nada:'awas', judul:'Compliment selalu perlu PIC',
          isi:'Compliment tanpa nama penanggung jawab adalah barang yang keluar tanpa ada yang '
            + 'bisa ditanyai. Isilah alasan dan PIC-nya saat mencatat, bukan besoknya.' }
      ]
    },

    {
      id: 'performa', judul: 'Performa Kasir',
      isi: [
        { t:'teks', isi:'Halaman ini menampilkan omset yang diakui untukmu, berikut posisi '
              + 'bonusmu. Angkanya final: ia sudah memperhitungkan potongan untuk event yang '
              + 'omsetnya diakui tim marketing.' },
        { t:'catatan', nada:'info', judul:'Kamu hanya bisa membuka namamu sendiri',
          isi:'Tab dengan namamu dan tab *Semua* terbuka; nama kasir lain tidak bisa dibuka satu '
            + 'per satu. Tab *Semua* sengaja tetap ada — ia angka gabungan yang tidak menyebut '
            + 'siapa dapat berapa, dan justru itu pembanding yang kamu perlukan untuk tahu posisi '
            + 'kamu terhadap capaian tim.' },
        { t:'tanya', isi:[
          { t:'Nama saya tidak ada di daftar kasir sama sekali.',
            j:'Akunmu belum dicocokkan dengan data kasir. Yang membetulkannya kolom Tim / '
             + 'Keterangan di Office — minta admin mengisinya, lalu buka lagi halaman ini.' },
          { t:'Omset saya terlihat lebih kecil daripada yang saya ingat.',
            j:'Hari yang ada event-nya memang dipotong: omset acara itu diakui ke tim marketing, '
             + 'bukan ke kasir shift. Yang barisnya ditandai "tidak ada potongan kasir" tidak ikut dipotong.' },
          { t:'Angkanya berbeda dengan yang dilihat finance.',
            j:'Laporkan ke finance berikut tanggalnya. Ada beberapa angka omset yang memang '
             + 'berbeda dasar hitungannya, dan yang bisa memastikan mana yang benar adalah mereka.' }
        ]}
      ]
    },

    {
      id: 'masalah', judul: 'Masalah Umum',
      isi: [
        { t:'tabel',
          kepala:['Gejala','Kemungkinan sebabnya','Yang perlu dilakukan'],
          baris:[
            ['Angka yang kemarin diisi berubah sendiri',
             'Ada tab lain yang menyimpan salinan lama di atasnya.',
             'Laporkan tanggalnya ke finance, lalu biasakan menutup tab modul ini kalau sedang tidak dipakai.'],
            ['Tombol simpan ditekan tapi tidak ada tanda apa pun',
             'Kiriman masih berjalan, atau koneksi sedang putus.',
             'Tunggu. Kalau muncul kotak merah, baca isinya — ia menyebut apa yang perlu dilakukan.'],
            ['Menu tertentu tidak ada di sidebar',
             'Akunmu belum diberi hak untuk halaman itu.',
             'Minta admin modul Cashier membukanya.'],
            ['Void sudah dicatat tapi tidak muncul di rekap finance',
             'Biasanya tanggalnya salah, atau barisnya terlanjur dibatalkan.',
             'Periksa tanggal catatannya di halaman Void Menu.']
          ] }
      ]
    }

  ]
});
