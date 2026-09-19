/*
  PANDUAN: Stock, Purchasing
  ---------------------------------------------------------------------------
  Kuncinya 'purchasing'. Nama tab disalin dari sidebar deploy/stock/purchasing/.
  Daftar Kontak Vendor di panel ini adalah SUMBER TUNGGAL data vendor untuk
  seluruh Office — panel Brankas dan modul BD OS membacanya, tidak menyalinnya.
*/
LM_HELP_ISI('purchasing', {
  ringkas: 'Antrian order yang masuk, jadwal jemput, belanja online, dan daftar kontak vendor '
         + 'berikut nomor rekeningnya.',
  untuk: 'tim purchasing',

  bagian: [

    {
      id: 'tentang', judul: 'Tentang Panel Purchasing',
      isi: [
        { t:'teks', isi:'Panel ini sisi PEMBELI. Yang masuk ke sini adalah order yang diajukan '
              + 'kru lewat panel Ordering.' },
        { t:'tabel',
          kepala:['Tab','Isinya'],
          baris:[
            ['Monitor Order','Antrian order yang masuk dan statusnya.'],
            ['Jemput Hari Ini','Barang yang perlu dijemput hari itu, dikelompokkan per vendor.'],
            ['Barang Online','Belanja yang dipesan lewat aplikasi atau marketplace.'],
            ['Central Kitchen','Permintaan dari dan ke CK.'],
            ['Rekap Per Bulan','Ringkasan pembelian sebulan.'],
            ['Database & Vendor','Master barang dan daftar kontak vendor.']
          ] }
      ]
    },

    {
      id: 'vendor', judul: 'Daftar Kontak Vendor — dibaca modul lain',
      isi: [
        { t:'catatan', nada:'awas', judul:'Daftar ini SUMBER TUNGGAL untuk seluruh Office',
          isi:'Panel Brankas membacanya untuk mengisi kolom penerima di lembar pembayaran, dan '
            + 'modul BD OS membacanya di form Purchase Order. Nomor rekening yang kamu betulkan '
            + 'di sini langsung berlaku di sana. Jangan pernah membuat daftar vendor kedua di '
            + 'modul lain — dua daftar untuk perusahaan yang sama pasti berbeda ejaan dalam '
            + 'sebulan, dan yang mentransfer tidak punya cara tahu mana yang lebih baru.' },
        { t:'tabel',
          kepala:['Kolom','Isinya'],
          baris:[
            ['Nama vendor','Nama pendek yang diketik sehari-hari, misalnya "Toffin".'],
            ['Penerima','Nama SESUAI BUKU REKENING, misalnya "CV. Toffin Riau Jaya". Kosongkan kalau sama dengan nama vendor.'],
            ['Bank','Bank rekeningnya.'],
            ['No. rekening','Ditulis apa adanya, boleh bertanda hubung.'],
            ['WhatsApp, jadwal jemput, hari tutup','Untuk koordinasi harian.']
          ] },
        { t:'catatan', nada:'awas', judul:'Nama pendek ≠ nama penerima',
          isi:'Beda satu huruf dari buku rekening membuat transfernya DITOLAK bank — dan itu baru '
            + 'ketahuan sesudah uangnya dikirim. Isi kolom Penerima kalau nama resminya berbeda.' },
        { t:'catatan', nada:'info', judul:'Nomor rekening boleh bertanda hubung',
          isi:'Begitulah tertulis di buku rekening, dan begitu pula yang dicocokkan mata. '
            + 'Perbandingan di sistem mengabaikan tanda hubungnya, jadi dua penulisan yang sama '
            + 'isinya tetap dikenali sama.' },
        { t:'catatan', nada:'info', judul:'Rekening kembar cuma DIPERINGATKAN, tidak ditolak',
          isi:'Satu perusahaan wajar punya beberapa nama dagang yang setor ke rekening yang sama. '
            + 'Yang tidak wajar adalah tidak menyadarinya.' },
        { t:'catatan', nada:'awas', judul:'Impor Excel: ketiga kolom rekening ikut ekspor–impor',
          isi:'Kalau kamu mengekspor, menyunting, lalu mengimpor ulang, pastikan kolom penerima, '
            + 'bank, dan nomor rekening ikut di berkasnya. Berkas yang kehilangan ketiganya akan '
            + 'mengembalikan seluruh vendor tanpa rekening — dan yang menyadarinya adalah orang '
            + 'yang mentransfer minggu depan.' }
      ]
    },

    {
      id: 'harian', judul: 'Pekerjaan Harian',
      isi: [
        { t:'langkah', judul:'Memproses antrian', isi:[
          'Buka *Monitor Order*, lihat yang masuk.',
          'Tentukan cara belinya: dijemput ke vendor, atau dipesan online.',
          'Kerjakan, lalu perbarui statusnya.'
        ]},
        { t:'teks', isi:'*Jemput Hari Ini* mengelompokkan barang per vendor, jadi satu perjalanan '
              + 'bisa mengambil beberapa order sekaligus. *Barang Online* untuk yang dipesan lewat '
              + 'aplikasi — statusnya diperbarui saat barangnya datang.' },
        { t:'catatan', nada:'info', judul:'Jadwal jemput & hari tutup vendor ada di masternya',
          isi:'Isilah kolom itu di Database & Vendor. Itu yang menahan orang datang ke vendor '
            + 'pada hari ia tutup.' }
      ]
    },

    {
      id: 'masalah', judul: 'Masalah Umum',
      isi: [
        { t:'tabel',
          kepala:['Gejala','Kemungkinan sebabnya','Yang perlu dilakukan'],
          baris:[
            ['Kolom penerima di lembar pembayaran Brankas kosong',
             'Vendor itu belum punya data rekening di sini.',
             'Lengkapi di Database & Vendor. Nominalnya tetap terbaca, cuma penerimanya kosong.'],
            ['Nama vendor di lembar pembayaran ditandai "tak ada di master"',
             'Vendor itu sudah dihapus dari daftar, atau namanya berbeda ejaan.',
             'Periksa ejaannya. Nama lama sengaja tetap terlihat, bukan dihapus dari lembar lama.'],
            ['Sesudah impor Excel, nomor rekening vendor hilang',
             'Berkas impornya tidak memuat kolom itu.',
             'Ekspor ulang dari sini, sunting berkas itu, lalu impor kembali.'],
            ['Order yang diajukan kru tidak muncul',
             'Tanggal kebutuhannya berbeda dari yang sedang dilihat.',
             'Periksa penyaring tanggalnya.']
          ] }
      ]
    }

  ]
});
