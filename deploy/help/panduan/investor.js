/*
  PANDUAN: Investor Compass
  ---------------------------------------------------------------------------
  Kuncinya 'investor'. SATU-SATUNYA halaman Office yang dibuka orang di LUAR
  perusahaan, jadi bagian tentang apa yang boleh diunggah ke sana ditaruh
  paling akhir dan ditulis tegas. Nama tab disalin dari investor/index.html.
*/
LM_HELP_ISI('investor', {
  ringkas: 'Halaman khusus investor: omset, laporan keuangan bulanan, riwayat dividen, dan '
         + 'agenda acara. Hanya membaca.',
  untuk: 'investor dan manajemen keuangan',

  bagian: [

    {
      id: 'tentang', judul: 'Tentang Investor Compass',
      isi: [
        { t:'catatan', nada:'awas', judul:'Halaman ini dibuka orang DI LUAR perusahaan',
          isi:'Ia berdiri di subdomainnya sendiri, terpisah dari Office. Apa pun yang tampil di '
            + 'sana dibaca investor — jadi periksa dua kali sebelum mengunggah apa pun.' },
        { t:'tabel',
          kepala:['Tab','Isinya'],
          baris:[
            ['Ringkasan','Omset harian dan bulanan, capaian target, perbandingan tahun ke tahun.'],
            ['Dividen','Riwayat pengembalian modal.'],
            ['Laporan Keuangan','Profit & Loss bulanan, plus Balance Report dan General Ledger.'],
            ['Upcoming Event','Agenda acara yang akan datang.'],
            ['Promo','Promo yang sedang berjalan.']
          ] },
        { t:'catatan', nada:'info', judul:'Loginnya akun Office yang sama',
          isi:'Nama dan PIN yang sama dengan Office, tapi hanya pemegang kunci modul *investor* '
            + 'yang lolos. Tidak ada kata sandi bersama.' }
      ]
    },

    {
      id: 'angka', judul: 'Membaca Angkanya',
      isi: [
        { t:'teks', isi:'Seluruh tab Ringkasan memakai satu konvensi yang SAMA — *Net Sales*, '
              + 'yaitu tagihan dikurangi compliment. Kartu, grafik tahunan, grafik harian, '
              + 'sorotan, dan persentase target semuanya dari angka itu.' },
        { t:'catatan', nada:'awas', judul:'Angkanya memang berbeda dari layar Office lain',
          isi:'Dashboard Omset memakai *net*, Rekap Penjualan memakai *tagihan*, dan halaman ini '
            + 'memakai *netSales*. Ketiganya sah. Baris keterangan kecil di bawah kartunya '
            + 'menyebut service, pajak, compliment, dan angka tagihan POS-nya utuh — itulah '
            + 'jembatannya.' },
        { t:'catatan', nada:'awas', judul:'Blok selain Pendapatan di Laporan Keuangan BELUM ada sumbernya',
          isi:'COGS, Operational Expense, Other Income & Expense, dan Depreciation dicatat di '
            + 'pembukuan Finance dan belum ada layar Office yang menginputnya. Barisnya tetap '
            + 'digambar, ditandai *belum ada inputnya*. Jangan mengisinya nol supaya rapi: '
            + 'Gross Profit dan Net Profit lalu sama dengan Net Sales, dan itu dua angka salah '
            + 'yang terlihat sangat meyakinkan.' },
        { t:'catatan', nada:'info', judul:'Angka uang ditulis PENUH, bukan dibulatkan',
          isi:'Pembulatan ke jutaan menyembunyikan sampai Rp999.999, dan di halaman yang dibaca '
            + 'investor selisih sebesar itu adalah selisih yang ditanyakan. Yang tetap singkat '
            + 'cuma sumbu grafiknya; angka pastinya ada di tooltip.' },
        { t:'catatan', nada:'info', judul:'Bulan yang tidak ada datanya tidak ditawarkan',
          isi:'Ia tidak digambar nol. Bulan yang tidak muncul di pemilih berarti data harian '
            + 'bulan itu memang belum ada di sistem.' }
      ]
    },

    {
      id: 'unggah', judul: 'Mengunggah Laporan PDF (admin modul)',
      isi: [
        { t:'langkah', isi:[
          'Buka tab *Laporan Keuangan*.',
          'Pilih bulannya.',
          'Unggah *Balance Report* dan *General Ledger* sekaligus — keduanya selalu terbit bersamaan.',
          'Penyaring akan pindah sendiri ke bulan yang barusan diunggah.'
        ]},
        { t:'catatan', nada:'awas', judul:'Unggah ulang MENGGANTI, bukan menumpuk',
          isi:'Satu bulan satu Balance Report dan satu General Ledger. Kalau menumpuk, investor '
            + 'melihat dua tombol berbeda isi tanpa tanda mana yang terbaru.' },
        { t:'catatan', nada:'info', judul:'Kalau satu dari dua berkas gagal, yang berhasil tetap tersimpan',
          isi:'Yang gagal disebut namanya. Membatalkan keduanya berarti mengunggah ulang berkas '
            + '10 MB yang sebenarnya sudah sampai dengan selamat.' },
        { t:'catatan', nada:'awas', judul:'Ini neraca perusahaan',
          isi:'Berkas yang salah unggah akan terbaca investor. Periksa bulan dan jenis berkasnya '
            + 'sebelum menekan Unggah. Berkas laporan CFO juga JANGAN pernah disimpan ke dalam '
            + 'repo kode — isinya bertanda rahasia dan memuat neraca serta gaji.' }
      ]
    },

    {
      id: 'masalah', judul: 'Masalah Umum',
      isi: [
        { t:'tabel',
          kepala:['Gejala','Kemungkinan sebabnya','Yang perlu dilakukan'],
          baris:[
            ['Investor tidak bisa masuk',
             'Akunnya belum diberi kunci modul investor.',
             'Centangkan di Kelola Akses, di server yang bersangkutan.'],
            ['Tab Dividen kosong',
             'Belum ada pengembalian modal yang dicatat.',
             'Dicatat di panel Brankas → Pengembalian Modal.'],
            ['Laporan bulan tertentu tidak bisa ditampilkan',
             'Data harian bulan itu belum ada di sistem.',
             'Bulan yang tidak punya data memang tidak muncul di pemilih.'],
            ['Agenda acara kosong',
             'Modul sumbernya mungkin sedang tidak bisa dihubungi.',
             'Pita peringatannya menyebut modul mana. Daftar kosong tanpa pita berarti memang tidak ada acara.'],
            ['Tombol unggah tidak muncul',
             'Hanya admin modul investor yang bisa mengunggah.',
             'Investor memang hanya membaca.']
          ] }
      ]
    }

  ]
});
