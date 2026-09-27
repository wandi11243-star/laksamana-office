/*
  PANDUAN: Marketing
  ---------------------------------------------------------------------------
  Kuncinya 'marketing'. Modul terbesar di Office (22 halaman), jadi panduan ini
  TIDAK mencoba menjelaskan semuanya — ia menjelaskan alur kerja hariannya dan
  hal-hal yang kalau salah menggeser uang. Nama menu disalin dari NAV_DEF di
  deploy/marketing/index.html.
*/
LM_HELP_ISI('marketing', {
  ringkas: 'Dari peluang masuk sampai acaranya berjalan: pipeline, brief & penawaran, '
         + 'reservasi VIP, invoice, dan pengakuan omsetnya.',
  untuk: 'tim marketing dan manajemen',

  bagian: [

    {
      id: 'tentang', judul: 'Alur Kerja di Modul Ini',
      isi: [
        { t:'teks', isi:'Urutan menu di sidebar mengikuti alur kerja sehari-hari, bukan urutan '
              + 'abjad. Kalau kamu baru di modul ini, bacalah dari atas ke bawah.' },
        { t:'tabel',
          kepala:['Kelompok','Menu','Untuk apa'],
          baris:[
            ['Ruang Komando','Dashboard, Kalender','Apa yang sedang berjalan dan kapan.'],
            ['Event','Sales Pipeline & Event, Event Brief & Quotation, Reservasi VIP, Request Design & Video','Dari peluang sampai acaranya siap jalan.'],
            ['Finance & Kontrol','Menu Kalkulator, Invoice & Payment, Approval Flow, Purchase Order','Uangnya.'],
            ['Analitik','Performa Omset & Bonus, Reporting','Hasilnya.'],
            ['Sistem','Database Client, Katalog, Template Task, Pegawai & Akses, Pengaturan','Data induk yang jarang diubah.']
          ] },
        { t:'gambar', berkas:'marketing/pipeline.png',
          teks:'Sales Pipeline & Event: tiga tab dalam satu halaman, satu baris penyaring PIC di atasnya.',
          tandai:[
            'Baris penyaring PIC, berlaku untuk ketiga tabnya.',
            'Tab pipeline, daftar event, dan kalendernya.',
            'Kartu peluang, bisa digeser antar kolom.'
          ] }
      ]
    },

    {
      id: 'event-baru', judul: 'Membuat Event Baru',
      isi: [
        { t:'langkah', isi:[
          'Buka *Sales Pipeline & Event*, tekan tombol event baru.',
          'Isi *Nama Event* dan pilih *client*-nya. Client baru bisa dibuat dari sini juga.',
          'Isi *tanggal* dan *jam*-nya.',
          'Jawab *Pengakuan Omset*. Ini WAJIB, dan pilihannya cuma dua.',
          'Simpan.'
        ]},
        { t:'catatan', nada:'awas', judul:'Pengakuan Omset: pilihannya dua, bukan tiga',
          isi:'*Menu sudah ditetapkan* berarti tamunya bayar sebagai satu grup — omsetnya diakui '
            + 'untuk marketing, dan kasir shift malam itu dipotong. *Menu dipilih di tempat* '
            + 'berarti tamunya bayar sendiri-sendiri di meja — omsetnya tetap milik kasir. '
            + 'Kalau ada event lama yang berbunyi "belum ditentukan", itu bukan pilihan ketiga: '
            + 'itu pertanyaan yang belum pernah dijawab.' },
        { t:'catatan', nada:'awas', judul:'Jangan menebak untuk event lama',
          isi:'Menjawabnya asal adalah keputusan tentang uang orang. *Menu ditetapkan* memotong '
            + 'kasir untuk acara yang mungkin tidak seharusnya; *dipilih di tempat* menghilangkan '
            + 'omset marketing dari pengakuan. Dua-duanya salah tanpa menimbulkan galat apa pun. '
            + 'Tanyakan ke PIC-nya, jangan ditebak.' },
        { t:'catatan', nada:'info', judul:'Event yang belum menjawab ditandai di daftarnya',
          isi:'Cari chip penandanya di Daftar Event, lalu buka kartu Pengakuan Omset di halaman '
            + 'detail acaranya. Hanya yang belum menjawab yang ditandai.' }
      ]
    },

    {
      id: 'vip', judul: 'Reservasi VIP',
      isi: [
        { t:'teks', isi:'Reservasi VIP dicatat di sini, tapi mejanya dikunci di database modul '
              + 'Reservasi — satu ruangan, satu daftar meja. Yang kamu kunci di sini benar-benar '
              + 'tidak bisa dipesan lagi oleh kru Reservasi.' },
        { t:'langkah', isi:[
          'Buka *Reservasi VIP*, buat baru.',
          'Isi nama tamu, tanggal, dan *JAM*-nya.',
          'Pilih mejanya di denah. Meja yang sudah terpakai tampil pudar.',
          'Isi nominal dan DP kalau ada. Tiap DP lahir dari satu berkas bukti.',
          'Simpan.'
        ]},
        { t:'catatan', nada:'awas', judul:'Isi jamnya sebelum memilih meja',
          isi:'Kuncian meja berlaku 3 jam sebelum sampai selesai, bukan sehari penuh. Selama '
            + 'jamnya masih kosong, denahnya dihitung dari jam 00:00 — jadi meja yang sebenarnya '
            + 'sudah dipesan tamu jam 20:00 akan tampil BEBAS. Pita peringatannya muncul selama '
            + 'jamnya belum diisi; jangan diabaikan.' },
        { t:'catatan', nada:'info', judul:'Denah bawaan yang ditawarkan mengikuti harinya',
          isi:'Susunan meja hari kerja dan akhir pekan memang berbeda, jadi yang ditawarkan cuma '
            + 'yang berlaku pada tanggal itu. Denah khusus satu tanggal yang dibuat kru Reservasi '
            + 'menang atas segalanya.' },
        { t:'catatan', nada:'awas', judul:'Kalau ada pita "reservasi VIP tidak ada di daftar ini"',
          isi:'Itu berarti booking-nya masih hidup di modul Reservasi tapi barisnya hilang dari '
            + 'sini. Pitanya menyebut mana saja, berikut tombol *Pulihkan*. Yang sudah dibatalkan '
            + 'dilipat terpisah dan tidak menuntut apa pun — yang perlu dipulihkan yang masih hidup.' },
        { t:'catatan', nada:'info', judul:'Nominal & Pengakuan Omset TIDAK ikut dipulihkan',
          isi:'Keduanya memang tidak pernah ada di modul Reservasi, jadi menebaknya berarti '
            + 'mengarang omzet orang. Setelah dipulihkan, isilah nominalnya dan jawab Pengakuan '
            + 'Omsetnya seperti biasa.' },
        { t:'catatan', nada:'info', judul:'Yang dibatalkan bisa dibuka kembali',
          isi:'Tombolnya ada di daftar dan di layar detailnya. Mejanya diperiksa ulang lebih dulu '
            + '— begitu dibatalkan, mejanya bebas, jadi tamu lain bisa saja sudah memesannya.' }
      ]
    },

    {
      id: 'uang', judul: 'Penawaran, Invoice, dan Omset yang Diakui',
      isi: [
        { t:'teks', isi:'Angka yang tercetak di Surat Penawaran, di Invoice, dan yang dipakai '
              + 'menghitung bonus semuanya diturunkan dari rincian yang sama di tab Finance '
              + 'sebuah event. Mengetiknya di satu tempat sudah cukup.' },
        { t:'langkah', isi:[
          'Buka event-nya, masuk ke tab Finance.',
          'Isi rinciannya: F&B, sewa venue, biaya teknis, dan lain-lain.',
          'Buka *Event Brief & Quotation* untuk mencetak penawarannya.',
          'Kalau sudah deal, terbitkan invoice-nya di *Invoice & Payment*.'
        ]},
        { t:'catatan', nada:'info', judul:'Performa Omset & Bonus: angka finance yang menentukan',
          isi:'Halaman itu menampilkan omset yang BENAR-BENAR diakui — angkanya datang dari '
            + 'Breakdown Sumber yang diisi finance, bukan dari nominal yang kamu ketik di sini. '
            + 'Kolom nominal di sana ada sebagai pembanding: kalau keduanya berselisih, itu yang '
            + 'perlu dibicarakan dengan finance.' },
        { t:'catatan', nada:'awas', judul:'Yang berbunyi "belum diinput finance" bukan berarti nol',
          isi:'Itu berarti barisnya belum dibuat di Breakdown Sumber, bukan bahwa acaranya tidak '
            + 'membawa omset. Dua hal itu sengaja dibedakan supaya tidak ada yang menyimpulkan '
            + 'acaranya gagal padahal angkanya belum pernah diketik.' },
        { t:'catatan', nada:'info', judul:'Siapa yang bisa melihat capaian siapa',
          isi:'Yang keterangannya di Office memuat kata *Head* bisa membuka tiap anggota tim. '
            + 'Yang lain melihat capaiannya sendiri dan tab *Semua* — yang sengaja tetap terbuka, '
            + 'karena ia angka gabungan dan justru itu pembandingmu terhadap tim.' }
      ]
    },

    {
      id: 'desain', judul: 'Request Design & Video',
      isi: [
        { t:'langkah', isi:[
          'Buka *Request Design & Video*, buat permintaan baru.',
          'Tulis apa yang diminta, jenisnya, dan kapan dibutuhkan.',
          'Lampirkan referensi kalau ada.',
          'Kirim. Tim Konten membacanya dari modul mereka.'
        ]},
        { t:'catatan', nada:'info', judul:'Halaman ini terbuka di tab "Belum Selesai"',
          isi:'Itu yang paling sering dicari. Yang sudah dikerjakan pindah sendiri ke tab '
            + '*Sudah Selesai*; angka di tiap tab memberitahu berapa isinya sebelum kamu menekannya.' },
        { t:'catatan', nada:'awas', judul:'Lampiran foto besar bisa memenuhi penyimpanan peramban',
          isi:'Kalau muncul peringatan tentang salinan lokal yang gagal disimpan, datamu TETAP '
            + 'terkirim ke server — yang gagal cuma cadangan di perangkatmu. Tapi jangan menutup '
            + 'tab di tengah pengiriman sesudah peringatan itu muncul. Kecilkan ukuran fotonya '
            + 'sebelum diunggah.' }
      ]
    },

    {
      id: 'masalah', judul: 'Masalah Umum',
      isi: [
        { t:'tabel',
          kepala:['Gejala','Kemungkinan sebabnya','Yang perlu dilakukan'],
          baris:[
            ['Meja yang saya mau tidak bisa dipilih',
             'Sudah dipesan pada jam yang beririsan.',
             'Periksa jamnya. Kuncian berlaku 3 jam sebelum acara.'],
            ['Omset event tidak muncul di Performa',
             'Barisnya belum diisi finance, atau PIC-nya belum cocok.',
             'Periksa kolom Diakui di Daftar Event, lalu koordinasi dengan finance.'],
            ['Panel kanan bawah berbunyi belum tersimpan',
             'Kiriman ke server gagal.',
             'Datanya masih aman di perangkat dan kirim ulang masih berjalan. Jangan tutup tabnya; tekan Coba lagi.'],
            ['Muncul "Sebagian Perubahan Tidak Tersimpan"',
             'Sebab tersering: modul ini terbuka di lebih dari satu tab.',
             'Tutup tab yang lain, lalu tekan Muat ulang di modal itu.'],
            ['Foto di Request Design gagal diunggah',
             'Penyimpanan peramban penuh oleh foto-foto sebelumnya.',
             'Kecilkan fotonya. Datanya tetap dikirim ke server.'],
            ['Event lama PIC-nya tertulis jabatan, bukan nama',
             'Data lama dari sebelum kolom PIC dikunci.',
             'Kotaknya masih bisa diketik untuk event lama. Betulkan satu per satu.']
          ] }
      ]
    }

  ]
});
