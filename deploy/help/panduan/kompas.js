/*
  PANDUAN: Finance, Panel Input Omset Harian
  ---------------------------------------------------------------------------
  Kuncinya 'kompas' — nama lamanya, dan itu masih kunci izin yang berlaku di
  Kelola Akses. Yang dilihat orang di layar "Panel Input Omset Harian" di dalam
  modul Finance; nama berkas ini mengikuti KUNCI, bukan judulnya.
*/
LM_HELP_ISI('kompas', {
  ringkas: 'Mencatat omset harian venue, lalu memecahnya: mana yang milik kasir shift dan '
         + 'mana yang diakui untuk event tim marketing.',
  untuk: 'finance dan supervisor kasir',

  bagian: [

    {
      id: 'tentang', judul: 'Tentang Panel Ini',
      isi: [
        { t:'teks', isi:'Panel ini salah satu dari tiga panel di modul Finance. Ia dibuka lewat '
              + 'kartu Finance di Office, lalu dipilih di halaman pemilih panelnya.' },
        { t:'daftar', isi:[
          '*Input Omset Harian*, pendapatan, diskon, tax & service, dan trafik per hari.',
          '*Report Daily Kasir*, setoran per metode pembayaran: POS vs Actual.',
          '*Piutang / Bon* dan *Compliment*, sama isinya dengan yang di modul Cashier.',
          '*Breakdown Sumber Omset*, memecah omset satu hari ke sumbernya.'
        ]},
        { t:'catatan', nada:'info', judul:'Halaman yang sama juga ada di modul Cashier',
          isi:'Report Daily, Piutang, dan Compliment memang muncul di dua modul, dan isinya '
            + 'SATU — bukan dua salinan. Apa pun yang diketik di salah satunya langsung terbaca '
            + 'di yang lain. Yang membedakan cuma siapa yang biasanya membukanya.' },
        { t:'gambar', berkas:'kompas/input-omset.png',
          teks:'Input Omset Harian, satu hari per layar.',
          tandai:[
            'Pemilih tanggal.',
            'Kotak pendapatan, diskon, tax, dan service charge.',
            'Jejak siapa yang mengisi, di bawah formulirnya.'
          ] }
      ]
    },

    {
      id: 'input', judul: 'Mengisi Omset Harian',
      isi: [
        { t:'langkah', isi:[
          'Buka *Input Omset Harian*, pilih tanggalnya.',
          'Isi pendapatan per kelompok, lalu *diskon*, *tax*, dan *service charge*.',
          'Isi angka trafik kalau ada.',
          'Tekan *Simpan Omset*, dan tunggu sampai tulisannya berubah jadi tersimpan.'
        ]},
        { t:'catatan', nada:'awas', judul:'Periksa ulang jumlah digit tax & service',
          isi:'Kesalahan paling mahal di halaman ini bukan angka yang salah besar, melainkan '
            + 'angka yang kehilangan tiga digit terakhirnya — misalnya tax diketik 2.514 padahal '
            + '2.514.400. Netnya tetap benar, jumlah bill-nya tetap benar, dan selisihnya cuma '
            + 'sepersekian persen dari omset sebulan, jadi tidak ada satu pun layar yang '
            + 'mencurigainya. Sekali baca ulang sebelum menyimpan jauh lebih murah daripada '
            + 'mencarinya bulan depan.' },
        { t:'catatan', nada:'info', judul:'Siapa yang mengisi ikut tercatat',
          isi:'Tiap penyimpanan mencatat nama dan waktunya, dan riwayatnya MENUMPUK — bukan '
            + 'menimpa yang sebelumnya. Satu tanggal memang biasa disentuh lebih dari sekali: '
            + 'diisi malam itu, dikoreksi orang lain beberapa hari kemudian. Kalau angkanya '
            + 'suatu saat bermasalah, jejak inilah yang menjawab siapa yang perlu ditanyai.' },
        { t:'catatan', nada:'info', judul:'Hari lama mungkin tidak punya jejak',
          isi:'Tanggal yang diisi sebelum jejak ini ada memang tidak diklaim siapa pun, dan itu '
            + 'bukan berarti datanya rusak. Menyimpan ulang akan mencatatmu sebagai yang mengubah, '
            + 'bukan yang mengisi.' }
      ]
    },

    {
      id: 'breakdown', judul: 'Breakdown Sumber Omset',
      isi: [
        { t:'teks', isi:'Halaman ini menjawab satu pertanyaan: dari omset hari itu, berapa yang '
              + 'datang dari acara, dan siapa PIC-nya. Jawabannya menentukan dua hal sekaligus — '
              + 'bonus PIC marketing atau event, dan potongan untuk kasir shift.' },
        { t:'langkah', isi:[
          'Buka *Breakdown Sumber Omset*, pilih tanggalnya.',
          'Baris acara dari modul Marketing dan Event terisi sendiri. Periksa nominalnya.',
          'Untuk baris yang belum ada, tambahkan manual.',
          'Pastikan setiap baris punya *PIC*. Yang masih berbunyi "— pilih PIC —" belum diakui untuk siapa pun.',
          'Tentukan *kasir shift* untuk tiap baris yang memang memotong kasir.',
          'Periksa angka di kotak konfirmasi, lalu simpan.',
          'Kalau breakdown hari itu sudah FINAL, tekan *Sync ke Performa Kasir* (berlaku mulai 1 Oktober 2026).'
        ]},
        { t:'catatan', nada:'awas', judul:'Performa Kasir baru menghitung hari yang sudah di-sync',
          isi:'Mulai 1 Oktober 2026, hari yang breakdown-nya belum di-sync BELUM dihitung di Performa '
            + 'Kasir sama sekali — supaya angka di sana tidak berubah-ubah selama breakdown masih diisi. '
            + 'Tombolnya baru hidup kalau breakdown sudah disimpan, tidak ada baris marketing/event yang '
            + 'nominalnya masih kosong, dan kasir shift sudah diatur. Mengubah breakdown SESUDAH sync tidak '
            + 'mengubah Performa Kasir sampai kamu menekan *Sync ulang*. Bulan sebelum Oktober tetap '
            + 'dihitung langsung seperti dulu.' },
        { t:'catatan', nada:'awas', judul:'Simpan dikunci selama masih ada kasir shift yang kosong',
          isi:'Itu disengaja. Dulu peringatannya boleh dilewati, dan yang terjadi: breakdown tetap '
            + 'tersimpan sementara potongannya tidak pernah dibebankan — sehingga uang yang sama '
            + 'terhitung dua kali, sekali untuk PIC dan sekali untuk kasir.' },
        { t:'catatan', nada:'info', judul:'"Belum Balance" dan "shift belum diatur" dua hal berbeda',
          isi:'Yang pertama berarti angkanya belum cocok; yang kedua berarti angkanya sudah benar '
            + 'tapi pembagian shiftnya belum diisi. Keduanya ditulis terpisah supaya kamu tidak '
            + 'mencari selisih rupiah yang memang tidak ada.' },
        { t:'tabel',
          kepala:['Pita yang muncul','Artinya','Yang perlu dilakukan'],
          baris:[
            ['Ada baris tanpa PIC','Omsetnya tidak diakui untuk siapa pun.','Pilih PIC-nya. Nama dari modul asalnya disebut sebagai petunjuk.'],
            ['PIC berbeda dari nama di modul asalnya','Nama di modul asal tidak ada di roster.','Periksa apakah orangnya memang itu. Kalau salah, ganti PIC-nya.'],
            ['Baris lintas hari','Acaranya berlangsung lebih dari satu hari.','Tombol salin nominal sengaja tidak ada. Isi manual sesuai porsi harinya.'],
            ['Tidak ada potongan kasir','Baris itu memang tidak memotong kasir.','Tidak perlu diisi kasir shift-nya.']
          ] },
        { t:'catatan', nada:'awas', judul:'Acara lintas hari: nominalnya tidak boleh disalin dua kali',
          isi:'Nilai yang dipulangkan modul Marketing adalah nilai SELURUH acara, satu angka untuk '
            + 'semua harinya. Menyalinnya di dua tanggal membuat omsetnya terhitung dua kali — '
            + 'dengan angka yang terlihat wajar di kedua harinya. Itu sebabnya tombol salinnya '
            + 'sengaja tidak digambar untuk baris seperti itu.' }
      ]
    },

    {
      id: 'masalah', judul: 'Masalah Umum',
      isi: [
        { t:'tabel',
          kepala:['Gejala','Kemungkinan sebabnya','Yang perlu dilakukan'],
          baris:[
            ['Omset event tidak muncul di Performa PIC',
             'Barisnya belum punya PIC, atau PIC-nya tidak ada di roster.',
             'Buka Breakdown tanggal itu, pilih PIC-nya.'],
            ['Acara hari kedua tidak punya barisnya',
             'Biasanya karena tanggalnya belum dipilih.',
             'Periksa tanggal di atas. Acara lintas hari punya baris di tiap harinya.'],
            ['Tombol Simpan Breakdown mati',
             'Masih ada baris yang kasir shift-nya belum diatur.',
             'Isi shift-nya, atau tandai barisnya memang tidak memotong kasir.'],
            ['Angka omset di sini beda dengan Rekap Penjualan',
             'Keduanya memang memakai dasar hitungan yang berbeda.',
             'Bukan kesalahan. Modul Analytics punya halaman yang menjabarkan selisihnya baris demi baris.'],
            ['Muncul kotak merah "sudah diubah orang lain"',
             'Ada tab lain yang menyimpan lebih dulu.',
             'Catat dulu ketikanmu, baru muat ulang dan isi lagi.']
          ] },
        { t:'catatan', nada:'info', judul:'Kalau angka omset di tiga layar berbeda',
          isi:'Itu memang bisa terjadi dan ketiganya bisa sama-sama benar — Dashboard Omset, '
            + 'Rekap Penjualan, dan halaman investor memakai konvensi yang berbeda. Modul '
            + 'Analytics punya kartu yang menjabarkan ketiganya baris demi baris; bacalah itu '
            + 'dulu sebelum menyimpulkan ada uang yang hilang.' }
      ]
    }

  ]
});
