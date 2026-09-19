/*
  PANDUAN: Stock, Ordering
  ---------------------------------------------------------------------------
  Kuncinya 'ordering'. Nama tab disalin dari sidebar deploy/stock/ordering/.
  Panel ini dan Purchasing adalah dua sisi dari pekerjaan yang sama — yang satu
  MEMINTA, yang satu MEMBELI — jadi tiap bagian menyebut sisi mana yang dimaksud.
*/
LM_HELP_ISI('ordering', {
  ringkas: 'Mengajukan order bahan baku, meminta barang dari Central Kitchen, dan check-in '
         + 'barang yang datang.',
  untuk: 'kitchen, bar, dan floor',

  bagian: [

    {
      id: 'tentang', judul: 'Tentang Panel Ordering',
      isi: [
        { t:'teks', isi:'Panel ini sisi PEMINTA. Yang kamu ajukan di sini masuk ke antrian '
              + 'panel Purchasing, tempat pembeliannya benar-benar dikerjakan.' },
        { t:'tabel',
          kepala:['Tab','Isinya'],
          baris:[
            ['Form Order Belanja','Mengajukan barang yang perlu dibeli.'],
            ['Central Kitchen','Meminta barang dari CK, atau mengirim barang ke CK.'],
            ['Check-in Penerimaan','Mencatat barang yang datang.'],
            ['Daftar Restock','Barang yang perlu diorder lagi.'],
            ['Data Forecast','Perkiraan kebutuhan.'],
            ['Kelola Akses','Siapa yang boleh mengajukan order.']
          ] },
        { t:'gambar', berkas:'ordering/form-order.png',
          teks:'Form Order Belanja: satu baris per barang, dengan rekap sebelum dikirim.',
          tandai:[
            'Pemilih tanggal kebutuhan.',
            'Baris barang: nama, jumlah, satuan, catatan.',
            'Tombol kirim, yang memunculkan rekap lebih dulu.'
          ] }
      ]
    },

    {
      id: 'order', judul: 'Mengajukan Order Belanja',
      isi: [
        { t:'langkah', isi:[
          'Buka *Form Order Belanja*.',
          'Pilih tanggal kebutuhannya.',
          'Isi barang satu per satu: nama, jumlah, satuan, dan catatan kalau perlu.',
          'Tekan kirim.',
          'Periksa *rekapnya* — daftar itu yang benar-benar akan dikirim.',
          'Konfirmasi.'
        ]},
        { t:'catatan', nada:'awas', judul:'Rekap muncul SEBELUM terkirim, bukan sesudah',
          isi:'Itu satu-satunya kesempatan memeriksa sebelum ordernya berangkat. Bacalah '
            + 'jumlahnya, bukan cuma nama barangnya — salah ketik jumlah baru ketahuan saat '
            + 'barangnya datang.' },
        { t:'catatan', nada:'info', judul:'Kalau muncul peringatan duplikat',
          isi:'Berarti ada pengajuan serupa yang sudah masuk, mungkin dari rekanmu. Baca dulu '
            + 'isinya sebelum meneruskan — dua order untuk barang yang sama berarti barangnya '
            + 'datang dua kali.' },
        { t:'catatan', nada:'info', judul:'Catatan per baris ikut terbaca di Purchasing',
          isi:'Justru catatan yang paling sering menentukan (merek tertentu, ukuran tertentu), '
            + 'jadi tulislah di barisnya — bukan di catatan umum yang bisa terlewat.' }
      ]
    },

    {
      id: 'ck', judul: 'Central Kitchen: minta & kirim',
      isi: [
        { t:'teks', isi:'Tab ini punya dua arah, dan keduanya BERLAWANAN. Perhatikan mana yang '
              + 'sedang kamu buka.' },
        { t:'tabel',
          kepala:['Form','Arahnya','Akibatnya'],
          baris:[
            ['Minta dari CK','CK menyiapkan barang untukmu.','Stok CK akan berkurang.'],
            ['Kirim ke CK','Kamu menyerahkan barang ke CK.','Stok CK BERTAMBAH.']
          ] },
        { t:'catatan', nada:'awas', judul:'Keduanya juga memunculkan rekap sebelum terkirim',
          isi:'Dan kata kerjanya sengaja dibedakan — kalimat rekapnya menyebut arah yang dimaksud. '
            + 'Kalau yang kamu baca tidak sesuai dengan yang kamu maksud, batalkan: kamu salah '
            + 'membuka form.' },
        { t:'catatan', nada:'info', judul:'Jalur kirim tidak menanyakan tanggal',
          isi:'Tanggalnya hari ini, dan tidak diketik siapa pun. Kotak tanggal yang kosong di '
            + 'sana memang tidak ada.' }
      ]
    },

    {
      id: 'checkin', judul: 'Check-in Penerimaan',
      isi: [
        { t:'langkah', isi:[
          'Buka *Check-in Penerimaan* saat barangnya datang.',
          'Cari ordernya.',
          'Cocokkan barang yang datang dengan yang diminta: jumlah dan kondisinya.',
          'Tandai yang diterima. Yang kurang atau rusak dicatat apa adanya.',
          'Simpan.'
        ]},
        { t:'catatan', nada:'awas', judul:'Jangan menandai lengkap kalau tidak lengkap',
          isi:'Yang kurang harus tercatat sebagai kurang. Menandainya lengkap supaya layarnya '
            + 'bersih membuat selisihnya muncul di stock opname beberapa hari kemudian, tanpa '
            + 'satu pun petunjuk kapan ia hilang.' }
      ]
    },

    {
      id: 'masalah', judul: 'Masalah Umum',
      isi: [
        { t:'tabel',
          kepala:['Gejala','Kemungkinan sebabnya','Yang perlu dilakukan'],
          baris:[
            ['Tab Form Order tidak muncul',
             'Akunmu tidak diberi hak mengajukan order.',
             'Minta admin membukanya di tab Kelola Akses.'],
            ['Order sudah dikirim tapi tidak muncul di Purchasing',
             'Biasanya tanggal kebutuhannya berbeda dari yang dicari.',
             'Periksa tanggalnya, lalu konfirmasi ke tim purchasing.'],
            ['Barang yang saya minta tidak ada di daftar pilihan',
             'Barangnya belum terdaftar di master.',
             'Minta tim Purchasing menambahkannya di Database & Vendor.'],
            ['Satuan tidak bisa dipilih',
             'Satuannya mengikuti barang yang dipilih.',
             'Pilih barangnya lebih dulu; daftar satuannya menyusul.']
          ] }
      ]
    }

  ]
});
