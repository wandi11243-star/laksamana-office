/*
  PANDUAN: Event
  ---------------------------------------------------------------------------
  Kuncinya 'event'. Nama menu yang disebut di sini disalin dari NAV di
  deploy/event/index.html; kalau menu di sana diganti namanya, panduan ini
  ikut harus diganti, kalau tidak orang mencari menu yang sudah tidak ada.
*/
LM_HELP_ISI('event', {
  ringkas: 'Merencanakan acara dari wacana sampai selesai: jadwal talent, tiket, check-in hari H, '
         + 'dan laporan hasilnya.',
  untuk: 'tim event dan manajemen',

  bagian: [

    {
      id: 'tentang', judul: 'Tentang Modul Event',
      isi: [
        { t:'teks', isi:'Modul Event mengurus acara yang diselenggarakan sendiri: musik, pertunjukan, '
              + 'dan acara berjadwal talent. Acara pesanan klien yang dijual tim Marketing diurus di '
              + 'modul Marketing, bukan di sini.' },
        { t:'teks', isi:'Menu di kiri dikelompokkan mengikuti urutan kerja: merencanakan, menjalankan, '
              + 'lalu menilai hasilnya.' },
        { t:'tabel',
          kepala:['Kelompok','Menu','Untuk apa'],
          baris:[
            ['Utama','Dashboard, Event Calendar','Melihat apa yang sedang berjalan dan kapan.'],
            ['Talent','Talent Management, Talent Schedule, Fee & Pembayaran','Data penampil, jadwal tampilnya, dan bayarannya.'],
            ['Event','Event Pipeline, Perencanaan Event, Event Management, Ticketing, Check-In, Approval Flow','Dari wacana sampai tamu masuk pintu.'],
            ['Analitik','Event Performance, Performa Omset & Bonus, Report & Analytics','Hasil acaranya, dan omset yang diakui.']
          ] },
        { t:'gambar', berkas:'event/dashboard.png',
          teks:'Dashboard modul Event: acara terdekat, jadwal talent, dan ringkasan tiket.',
          tandai:[
            'Sidebar menu, dikelompokkan Utama, Talent, Event, dan Analitik.',
            'Kartu ringkasan acara yang akan datang.',
            'Menu yang tidak boleh kamu buka tidak digambar sama sekali.'
          ] },
        { t:'catatan', nada:'info', judul:'Dua menu bernama mirip, isinya berbeda',
          isi:'*Event Performance* menilai jalannya acara: talent, tiket, dan kehadiran. '
            + '*Performa Omset & Bonus* menilai uangnya: omset yang diakui dan bonus yang dihitung '
            + 'dari situ. Keduanya sengaja dipertahankan karena menjawab pertanyaan yang berbeda.' }
      ]
    },

    {
      id: 'buat', judul: 'Membuat Event Baru',
      isi: [
        { t:'langkah', isi:[
          'Buka *Event Management*, lalu tekan tombol tambah event.',
          'Isi *nama acara*, *tanggal*, dan *jamnya*.',
          'Pilih *jenis acara*. Jenis inilah yang dipakai laporan untuk mengelompokkan omset, jadi jangan dilewati.',
          'Isi *tempat* dan perkiraan *kapasitas* tamunya.',
          'Simpan. Acaranya langsung muncul di Event Calendar.'
        ]},
        { t:'catatan', nada:'info', judul:'Kolom PIC terisi sendiri',
          isi:'Kolom PIC event baru dikunci ke akun yang sedang login, dan itu disengaja: kolom itu '
            + 'yang menentukan omset acaranya diakui ke siapa di Finance. Untuk event lama yang '
            + 'PIC-nya masih berisi jabatan seperti "Event Manager", kolomnya masih bisa diketik '
            + 'supaya bisa dibetulkan.' },
        { t:'langkah', judul:'Kalau acaranya belum pasti', isi:[
          'Catat di *Event Pipeline* atau *Perencanaan Event*, bukan di Event Management.',
          'Pindahkan ke Event Management begitu acaranya benar-benar akan berjalan.'
        ]},
        { t:'catatan', nada:'info', judul:'Kenapa dipisah',
          isi:'Menyusun rencana yang belum tentu jadi dan menjalankan acara yang sudah pasti adalah '
            + 'dua pekerjaan berbeda. Mencampurnya di satu daftar membuat acara yang benar-benar '
            + 'akan berjalan tenggelam di antara belasan wacana.' }
      ]
    },

    {
      id: 'status', judul: 'Arti Status Event',
      isi: [
        { t:'tabel',
          kepala:['Status','Artinya'],
          baris:[
            ['Planning','Masih disusun. Belum tentu berjalan.'],
            ['Upcoming','Sudah pasti dan akan berjalan.'],
            ['Event Done','Acaranya sudah selesai dijalankan.'],
            ['Cancelled','Dibatalkan. Bukan "selesai".']
          ] },
        { t:'catatan', nada:'awas', judul:'"Event Done" bukan sekadar penanda rapi',
          isi:'Halaman analisa Pengaruh Event di modul Analytics hanya menghitung acara berstatus '
            + '*Event Done*. Acara yang sudah benar-benar berjalan tapi lupa ditandai tidak akan '
            + 'ikut dihitung pengaruhnya terhadap omset, dan tidak ada satu pun layar yang '
            + 'memberitahu bahwa ia terlewat. Biasakan menutup acara begitu selesai.' },
        { t:'catatan', nada:'info', judul:'Cancelled tidak dipetakan ke Event Done',
          isi:'"Selesai" berarti acaranya berjalan sampai habis. Acara yang batal tidak pernah '
            + 'berjalan, jadi ia tetap Cancelled.' }
      ]
    },

    {
      id: 'talent', judul: 'Talent & Jadwalnya',
      isi: [
        { t:'langkah', judul:'Mendaftarkan talent', isi:[
          'Buka *Talent Management*.',
          'Tambahkan talent baru: nama, kategori (Band, DJ, MC, dan seterusnya), dan kontaknya.',
          'Simpan. Talent itu kini bisa dipilih saat menyusun jadwal.'
        ]},
        { t:'langkah', judul:'Menjadwalkan talent tampil', isi:[
          'Buka *Talent Schedule*.',
          'Pilih tanggalnya, lalu tambahkan jadwal.',
          'Pilih talent, isi *jam mulai* dan *durasinya*.',
          'Simpan.'
        ]},
        { t:'catatan', nada:'awas', judul:'Jam tampil menentukan angka analisa',
          isi:'Halaman Performa Talent di modul Analytics menghitung omset yang masuk selama jam '
            + 'tampil tiap penampil. Jam yang kosong atau salah membuat penampil itu tidak bisa '
            + 'dinilai sama sekali, dan yang tercatat salah akan menagihkan omset malam itu ke '
            + 'penampil yang keliru.' },
        { t:'daftar', isi:[
          'Jadwal yang melewati tengah malam ditulis apa adanya, misalnya 22:30 sampai 01:30. Sistem yang membagi tanggalnya.',
          'Jadwal berstatus *Cancelled* tidak ikut dihitung. Status lain ikut, termasuk yang lupa ditandai selesai.',
          'Bayaran talent dicatat di *Fee & Pembayaran*, terpisah dari jadwalnya.'
        ]}
      ]
    },

    {
      id: 'tiket', judul: 'Ticketing & Check-In',
      isi: [
        { t:'langkah', judul:'Menyiapkan tiket', isi:[
          'Buka acaranya di *Event Management*, lalu tandai bahwa acara itu berjenis berbayar tiket.',
          'Buka menu *Ticketing*, atur jenis tiket dan harganya.',
          'Simpan. Tiket sudah bisa dijual.'
        ]},
        { t:'langkah', judul:'Check-in di hari H', isi:[
          'Buka menu *Check-In*.',
          'Pilih acaranya.',
          'Pindai QR di tiket tamu, atau cari namanya kalau QR-nya tidak bisa dipindai.',
          'Tandai masuk. Tiket yang sudah dipakai akan ditolak kalau dipindai lagi.'
        ]},
        { t:'catatan', nada:'info', judul:'Kalau QR tidak mau terbaca',
          isi:'Cari tamunya berdasarkan nama atau nomor pesanan, lalu tandai masuk secara manual. '
            + 'Jangan menerbitkan tiket pengganti, karena tiket yang sama jadi terhitung dua kali.' },
        { t:'tabel',
          kepala:['Status tiket','Artinya'],
          baris:[
            ['Valid','Tiket sah dan belum dipakai masuk.'],
            ['Checked-In','Sudah dipakai masuk malam itu.'],
            ['Expired','Sudah lewat masa berlakunya.'],
            ['Refunded','Sudah dikembalikan uangnya.']
          ] }
      ]
    },

    {
      id: 'masalah', judul: 'Masalah Umum',
      isi: [
        { t:'tabel',
          kepala:['Gejala','Kemungkinan sebabnya','Yang perlu dilakukan'],
          baris:[
            ['Menu tertentu tidak ada di sidebar',
             'Peran akunmu tidak diberi hak melihat halaman itu.',
             'Minta admin modul Event membukanya lewat menu Hak Akses.'],
            ['Acara tidak muncul di analisa Analytics',
             'Statusnya belum *Event Done*.',
             'Tutup acaranya di Event Management.'],
            ['Omset acara tidak muncul di Performa Omset & Bonus',
             'Barisnya belum diisi finance di Breakdown Sumber, atau PIC-nya belum cocok.',
             'Periksa kolom PIC acaranya, lalu koordinasi dengan finance.'],
            ['Penampil terlihat tidak menyumbang omset apa pun',
             'Jam tampilnya kosong atau tidak terbaca.',
             'Lengkapi jam mulai dan durasinya di Talent Schedule.'],
            ['Tamu sudah bayar tapi tiketnya ditolak saat check-in',
             'Tiketnya sudah pernah dipakai masuk.',
             'Cek riwayat check-in tiket itu sebelum menerbitkan yang baru.']
          ] },
        { t:'tanya', isi:[
          { t:'Acara klien yang memesan tempat dicatat di mana?',
            j:'Di modul Marketing, bukan di sini. Modul Event untuk acara yang diselenggarakan sendiri.' },
          { t:'Saya salah menandai acara sebagai Event Done. Bisa dibalik?',
            j:'Bisa, ubah lagi statusnya. Tapi perlu diingat angka analisa ikut berubah, jadi '
             + 'beritahukan ke yang memakai laporannya.' },
          { t:'Kenapa PIC event tidak bisa saya ketik?',
            j:'Untuk event baru, PIC dikunci ke akun pembuatnya karena kolom itu menentukan '
             + 'pengakuan omset. Yang masih bisa diketik hanya event lama yang belum punya jejak pembuat.' }
        ]}
      ]
    }

  ]
});
