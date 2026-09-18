/*
  PANDUAN: Reservasi
  ---------------------------------------------------------------------------
  Kuncinya 'reservasi', sama dengan nama berkas ini dan sama dengan kunci izin
  di daftar.js. Isinya menjelaskan CARA MEMAKAI modul, bukan cara kerja
  kodenya: yang membacanya host dan kru operasional, bukan yang menyuntingnya.
*/
LM_HELP_ISI('reservasi', {
  ringkas: 'Mencatat booking meja tamu, menagih dan memverifikasi DP, mengatur denah meja '
         + 'malam itu, dan menandai siapa yang benar-benar datang.',
  untuk: 'host, kasir, marketing, dan manajemen',

  bagian: [

    {
      id: 'tentang', judul: 'Tentang Modul Reservasi',
      isi: [
        { t:'teks', isi:'Modul Reservasi adalah catatan resmi semua booking meja. Selama satu '
              + 'booking belum ada di sini, mejanya tidak terkunci untuk siapa pun, dan bisa saja '
              + 'dijanjikan ke dua tamu yang berbeda.' },
        { t:'teks', isi:'Reservasi yang dibuat lewat modul Marketing (Reservasi VIP) juga mendarat '
              + 'di sini dan ikut mengunci mejanya. Jadi daftar di modul ini adalah gambaran lengkap '
              + 'satu malam, bukan cuma booking yang diketik host.' },
        { t:'daftar', isi:[
          '*Dashboard & Recap*, papan utama: daftar booking, kalender, denah meja, dan waiting list.',
          '*Input Reservasi*, tempat mencatat booking baru.',
          '*Dana Masuk (DP)*, tempat memeriksa dan memverifikasi bukti transfer DP.',
          '*Riwayat*, booking yang sudah lewat.',
          '*Analitik*, ringkasan jumlah tamu dan pemakaian meja.',
          '*Master Data*, daftar meja, denah, dan pengaturan.',
          '*Audit Log*, catatan siapa mengubah apa.'
        ]},
        { t:'gambar', berkas:'reservasi/dashboard.png',
          teks:'Dashboard & Recap: kartu ringkasan di atas, baris penyaring, lalu tab isinya.',
          tandai:[
            'Kartu ringkasan: jumlah booking, tamu, dan antrean waiting list hari itu.',
            'Baris penyaring: tanggal, status, dan kata kunci. Satu baris ini dipakai semua tab.',
            'Tab Tabel, Kalender, Denah Meja, dan Waiting List.'
          ] },
        { t:'catatan', nada:'info', judul:'Penyaringnya satu untuk semua tab',
          isi:'Tab *Denah Meja* dan *Waiting List* hanya bisa menggambarkan SATU tanggal, jadi '
            + 'keduanya mengikuti tanggal yang sedang dipilih di baris penyaring. Kalau denahnya '
            + 'terlihat kosong, periksa dulu tanggal di penyaring sebelum menyimpulkan datanya hilang.' }
      ]
    },

    {
      id: 'buat', judul: 'Membuat Reservasi Baru',
      isi: [
        { t:'langkah', isi:[
          'Buka menu *Input Reservasi* di kiri.',
          'Isi *nama tamu* dan *nomor HP*. Nomor HP yang benar penting, karena dari situ tamu dihubungi kalau ada perubahan.',
          'Isi *tanggal* dan *jam kedatangan*. Jam menentukan meja mana yang masih bebas, jadi jangan dikosongkan.',
          'Isi *jumlah tamu (pax)*.',
          'Pilih *meja* dari denah. Meja yang sudah dipesan tamu lain pada jam itu tampil pudar dan tidak bisa dipilih.',
          'Kalau tamu membayar DP, isi nominalnya *dan unggah foto bukti transfernya*.',
          'Tulis *catatan* bila ada permintaan khusus: dekorasi, alergi, susunan meja.',
          'Tekan *Simpan*.'
        ]},
        { t:'catatan', nada:'awas', judul:'DP wajib disertai foto buktinya',
          isi:'Sejak aturan ini berlaku, reservasi yang mencantumkan DP tidak bisa disimpan tanpa '
            + 'lampiran bukti transfer. Bukan untuk mempersulit: DP tanpa lampiran adalah uang yang '
            + 'tidak bisa dicocokkan dengan mutasi bank oleh siapa pun, dan baru ketahuan berhari-hari '
            + 'kemudian. Kalau buktinya belum ada, simpan dulu reservasinya tanpa DP, lalu tambahkan '
            + 'DP-nya begitu foto buktinya masuk.' },
        { t:'catatan', nada:'info', judul:'Reservasi lama yang DP-nya terlanjur tanpa bukti',
          isi:'Reservasi yang dibuat sebelum aturan ini tidak dikunci. Kamu masih bisa membetulkan '
            + 'nama atau jamnya; sistem cuma bertanya sekali untuk mengingatkan.' }
      ]
    },

    {
      id: 'ubah', judul: 'Mengubah & Membatalkan',
      isi: [
        { t:'langkah', judul:'Mengubah reservasi', isi:[
          'Cari barisnya di tab *Tabel* pada Dashboard & Recap.',
          'Buka barisnya, ubah yang perlu, lalu simpan.',
          'Kalau tanggal atau jamnya berubah, periksa lagi mejanya: meja yang tadinya bebas pada jam lama belum tentu bebas pada jam baru.'
        ]},
        { t:'langkah', judul:'Membatalkan reservasi', isi:[
          'Buka reservasinya.',
          'Ubah statusnya menjadi *Cancelled*.',
          'Mejanya langsung bebas dan bisa dipesan tamu lain pada jam itu.'
        ]},
        { t:'catatan', nada:'info', judul:'Membatalkan bukan menghapus',
          isi:'Reservasi yang dibatalkan tetap tersimpan dan tetap terlihat di riwayat. Itu '
            + 'disengaja: DP yang terlanjur masuk dan catatan tamunya masih perlu bisa ditelusuri.' },
        { t:'catatan', nada:'awas', judul:'Meja yang dibatalkan langsung bebas',
          isi:'Kalau tamu berubah pikiran lagi dan ingin reservasinya dihidupkan kembali, mejanya '
            + 'belum tentu masih kosong, karena bisa saja sudah diambil tamu lain. Periksa denah '
            + 'sebelum menjanjikan meja yang sama.' }
      ]
    },

    {
      id: 'status', judul: 'Arti Setiap Status',
      isi: [
        { t:'teks', isi:'Status menjawab satu pertanyaan: sejauh mana booking ini sudah pasti, dan '
              + 'apakah tamunya jadi datang.' },
        { t:'tabel',
          kepala:['Status','Artinya','Kapan dipakai'],
          baris:[
            ['Pending','Booking dicatat, belum dipastikan.','Tamu baru menanyakan dan belum konfirmasi ulang.'],
            ['Confirmed','Booking sudah pasti.','Tamu sudah memastikan datang, atau DP-nya sudah masuk.'],
            ['Datang','Tamunya benar-benar hadir malam itu.','Ditandai host saat tamu tiba di tempat.'],
            ['Cancelled','Booking dibatalkan.','Tamu membatalkan. Mejanya dibebaskan.'],
            ['No-show','Tamu tidak datang dan tidak membatalkan.','Ditandai sesudah jamnya lewat dan mejanya tidak dipakai.']
          ] },
        { t:'catatan', nada:'info', judul:'Bedakan Cancelled dan No-show',
          isi:'Keduanya sama-sama berarti tamunya tidak datang, tapi artinya berbeda untuk rekap: '
            + '*Cancelled* berarti tamu memberi kabar, *No-show* berarti tidak. Menandai semuanya '
            + 'Cancelled membuat angka tamu yang menghilang tanpa kabar terlihat nol.' }
      ]
    },

    {
      id: 'dp', judul: 'DP & Verifikasi Transfer',
      isi: [
        { t:'teks', isi:'Halaman *Dana Masuk (DP)* adalah tempat DP yang sudah diketik host '
              + 'diperiksa bukti transfernya, lalu dinyatakan benar-benar masuk.' },
        { t:'langkah', judul:'Memverifikasi satu DP', isi:[
          'Buka menu *Dana Masuk (DP)*.',
          'Cari barisnya, lalu buka foto bukti transfernya.',
          'Cocokkan nominal dan tanggalnya dengan mutasi rekening.',
          'Kalau cocok, tekan *Verifikasi* pada baris transfer itu.',
          'Kalau tidak cocok, tolak dan tulis alasannya supaya yang mencatatnya tahu apa yang perlu dibetulkan.'
        ]},
        { t:'tabel',
          kepala:['Keadaan transfer','Artinya'],
          baris:[
            ['(belum ditandai)','Buktinya sudah ada, tapi belum ada yang mencocokkannya dengan rekening.'],
            ['Terverifikasi','Sudah dicocokkan, uangnya benar masuk.'],
            ['Ditolak','Sudah diperiksa dan dinyatakan tidak ada. Bukan sekadar "belum".']
          ] },
        { t:'catatan', nada:'awas', judul:'Kwitansi baru bisa diminta setelah semua DP terverifikasi',
          isi:'Tombol *Request Kwitansi* tidak muncul selama masih ada transfer yang belum '
            + 'terverifikasi atau yang ditolak. Alasannya: lembar kwitansi mengakui SELURUH DP, dan '
            + 'kertas itu dipegang tamu. Yang tampil sebagai gantinya adalah keterangan berapa '
            + 'transfer yang masih menggantung dan di mana membetulkannya.' },
        { t:'catatan', nada:'info', judul:'Kwitansi yang sudah terbit tetap bisa diunduh',
          isi:'Aturan di atas hanya menahan permintaan kwitansi BARU. Kwitansi yang sudah terlanjur '
            + 'terbit tetap bisa diunduh, supaya kru yang sedang berhadapan dengan tamunya tidak buntu.' }
      ]
    },

    {
      id: 'denah', judul: 'Denah Meja & Waiting List',
      isi: [
        { t:'teks', isi:'Tab *Denah Meja* menggambar susunan meja untuk satu tanggal. Meja yang '
              + 'sudah dipesan ditandai, dan yang masih bebas bisa langsung dipilih.' },
        { t:'gambar', berkas:'reservasi/denah.png',
          teks:'Denah meja untuk satu tanggal. Warna meja mengikuti zonanya.',
          tandai:[
            'Pemilih tanggal. Denah hanya bisa menampilkan satu tanggal.',
            'Meja pudar bertanda silang berarti sudah terpakai pada jam itu.',
            'Meja diwarnai per zona, bukan per status.'
          ] },
        { t:'daftar', isi:[
          'Denah bisa berbeda antara hari kerja dan akhir pekan, karena susunan mejanya memang berbeda.',
          'Denah khusus satu tanggal bisa dibuat kalau malam itu susunannya diubah untuk sebuah acara.',
          'Denah diatur di menu *Master Data*, bukan di halaman ini.'
        ]},
        { t:'teks', isi:'Tab *Waiting List* untuk tamu yang datang tanpa booking saat semua meja '
              + 'penuh. Catat nama dan jumlah orangnya; begitu ada meja kosong, tamu bisa '
              + 'didudukkan dari daftar itu dan lama menunggunya ikut tercatat.' },
        { t:'tanya', isi:[
          { t:'Kenapa meja yang sudah dibatalkan masih terlihat terkunci?',
            j:'Periksa jam yang sedang dipakai penyaring. Kuncian meja mengikuti jendela jam '
             + 'reservasinya, bukan satu hari penuh, jadi sebuah meja bisa bebas pada jam siang '
             + 'dan terkunci pada jam malam di hari yang sama.' },
          { t:'Denahnya kosong, apakah datanya hilang?',
            j:'Hampir selalu tidak. Denah hanya menampilkan satu tanggal; pastikan tanggal di baris '
             + 'penyaring adalah tanggal yang kamu maksud.' },
          { t:'Saya mengubah denah, tapi reservasi lama jadi aneh letaknya.',
            j:'Reservasi lama menunjuk meja menurut denah yang berlaku saat ia dibuat. Kalau '
             + 'susunannya diubah, cocokkan ulang mejanya lewat reservasi itu sendiri.' }
        ]}
      ]
    },

    {
      id: 'masalah', judul: 'Masalah Umum',
      isi: [
        { t:'tabel',
          kepala:['Gejala','Kemungkinan sebabnya','Yang perlu dilakukan'],
          baris:[
            ['Tidak bisa menyimpan reservasi ber-DP',
             'Bukti transfernya belum diunggah.',
             'Unggah fotonya, atau simpan dulu tanpa DP lalu tambahkan DP-nya belakangan.'],
            ['Meja yang diinginkan tidak bisa dipilih',
             'Meja itu sudah dipesan pada jam yang beririsan.',
             'Pilih meja lain, atau geser jamnya. Jangan menimpa lewat cara lain.'],
            ['Tombol Request Kwitansi tidak ada',
             'Masih ada transfer DP yang belum terverifikasi atau ditolak.',
             'Selesaikan verifikasinya di halaman Dana Masuk (DP).'],
            ['Booking dari Marketing tidak terlihat',
             'Biasanya tanggal penyaring belum diarahkan ke tanggal acaranya.',
             'Setel tanggalnya. Kalau tetap tidak ada, laporkan ke tim Marketing.'],
            ['Tombol simpan tidak muncul sama sekali',
             'Peran akun kamu hanya diberi hak melihat halaman itu.',
             'Minta admin modul Reservasi menaikkan hakmu jadi Ubah untuk halaman itu.']
          ] },
        { t:'catatan', nada:'info', judul:'Semua perubahan tercatat',
          isi:'Menu *Audit Log* menyimpan siapa mengubah apa dan kapan. Kalau sebuah reservasi '
            + 'terlihat berbeda dari yang kamu ingat, cek di sana dulu sebelum menyimpulkan datanya '
            + 'hilang sendiri.' }
      ]
    }

  ]
});
